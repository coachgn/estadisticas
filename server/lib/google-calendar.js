/* =====================================================================
   Google Calendar API v3 con la Service Account del proyecto

   Misma credencial que `google-sheets.js` (GOOGLE_SERVICE_ACCOUNT_EMAIL y
   GOOGLE_PRIVATE_KEY), otro scope. Por qué no se reusa su token: el caché
   de ese módulo es de UN scope, y mezclar dos en el mismo caché entregaría
   a Calendar un token de solo lectura de Sheets.

   UNA SERVICE ACCOUNT NO TIENE CALENDARIO PROPIO ÚTIL: escribe en el de
   otra persona solo si esa persona lo compartió con el mail de la cuenta,
   con el permiso «Hacer cambios en eventos». Sin eso Google contesta 404
   (el calendario «no existe» para la cuenta) y `asegurarEvento` lo dice
   con su remedio, no con el código crudo.

   LOS EVENTOS LLEVAN ID DETERMINISTA. Google acepta que el cliente elija
   el id (base32hex: a-v y 0-9) y rechaza con 409 un id repetido, así que
   la idempotencia la pone Google y no una tabla nuestra: correr el cron
   diez veces deja un solo evento.
   ===================================================================== */
'use strict';

const jwt = require('./jwt.js');
const { entorno } = require('./config.js');

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const CAL_URL = 'https://www.googleapis.com/calendar/v3/calendars';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let tokenCache = { valor: null, venceEn: 0 };

async function obtenerAccessToken(deps) {
  const d = deps || {};
  const env = d.entorno || entorno();
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenCache.valor && tokenCache.venceEn > ahora + 60) return tokenCache.valor;
  if (!env.googleEmail || !env.googleKey) {
    throw Object.assign(new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY.'),
      { codigo: 'SIN_CREDENCIALES' });
  }
  const aserto = jwt.firmarRS256({
    iss: env.googleEmail, scope: SCOPE, aud: OAUTH_URL, iat: ahora, exp: ahora + 3600,
  }, env.googleKey);
  const traer = d.fetch || fetch;
  const r = await traer(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: aserto,
    }).toString(),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo.access_token) {
    throw Object.assign(new Error('Google rechazó la credencial de la Service Account'),
      { codigo: 'AUTH_GOOGLE', detalle: cuerpo.error_description || cuerpo.error || r.status });
  }
  tokenCache = { valor: cuerpo.access_token, venceEn: ahora + (cuerpo.expires_in || 3600) };
  return tokenCache.valor;
}

function limpiarCache() { tokenCache = { valor: null, venceEn: 0 }; }

/** Traduce el rechazo de Google a lo que hay que HACER. */
function falla(r, cuerpo, calendarId) {
  const motivo = (((cuerpo || {}).error || {}).errors || [])[0];
  const razon = motivo && motivo.reason;
  if (r.status === 404) {
    return Object.assign(new Error('La Service Account no ve el calendario ' + calendarId
      + '. Compartilo con su mail en «Configuración y uso compartido → Compartir con personas» con el permiso «Hacer cambios en eventos».'),
    { codigo: 'CALENDARIO_NO_COMPARTIDO' });
  }
  if (r.status === 403 && (razon === 'accessNotConfigured' || /has not been used|disabled/i.test(JSON.stringify(cuerpo || {})))) {
    return Object.assign(new Error('La API de Google Calendar no está habilitada en el proyecto de la Service Account.'),
      { codigo: 'CALENDAR_API_APAGADA' });
  }
  if (r.status === 403) {
    return Object.assign(new Error('La Service Account no tiene permiso de escritura sobre ' + calendarId + '.'),
      { codigo: 'SIN_PERMISO_CALENDARIO' });
  }
  return Object.assign(new Error('Google Calendar respondió ' + r.status + '.'),
    { codigo: 'CALENDAR_' + r.status });
}

/**
 * Crea el evento si no existe, lo corrige si cambió y respeta al que lo
 * borró a mano. Devuelve 'creado' | 'actualizado' | 'igual' | 'borrado'.
 *
 * `evento` trae `id`, `summary`, `description`, `inicio` y `fin`
 * (AAAA-MM-DDTHH:MM:SS-03:00), `zona`, `recordatorios` (minutos antes, por
 * popup) y `privadas` (extendedProperties.private).
 */
async function asegurarEvento(calendarId, evento, deps) {
  const d = deps || {};
  const traer = d.fetch || fetch;
  const token = await obtenerAccessToken(d);
  const base = CAL_URL + '/' + encodeURIComponent(calendarId) + '/events';
  const cab = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const cuerpoEvento = {
    id: evento.id,
    summary: evento.summary,
    description: evento.description || '',
    start: { dateTime: evento.inicio, timeZone: evento.zona },
    end: { dateTime: evento.fin, timeZone: evento.zona },
    /* SIN useDefault: el aviso tiene que despertar el celular sí o sí, no
       depender de cómo el usuario configuró su calendario. */
    reminders: { useDefault: false,
      overrides: (evento.recordatorios || [0]).map(m => ({ method: 'popup', minutes: m })) },
    extendedProperties: { private: evento.privadas || {} },
    transparency: 'transparent',
  };

  const ins = await traer(base, { method: 'POST', headers: cab, body: JSON.stringify(cuerpoEvento) });
  if (ins.ok) return 'creado';
  if (ins.status !== 409) throw falla(ins, await ins.json().catch(() => ({})), calendarId);

  // 409: ese id ya existe (o existió). Se mira cómo quedó.
  const g = await traer(base + '/' + encodeURIComponent(evento.id), { headers: cab });
  const actual = await g.json().catch(() => ({}));
  if (!g.ok) throw falla(g, actual, calendarId);
  /* Un evento BORRADO queda con status 'cancelled' y su id no se puede
     reusar: si el usuario lo sacó a propósito, no se lo vuelve a poner. */
  if (actual.status === 'cancelled') return 'borrado';

  const mismoInicio = actual.start && new Date(actual.start.dateTime).getTime() === new Date(evento.inicio).getTime();
  if (mismoInicio && actual.summary === evento.summary) return 'igual';
  const p = await traer(base + '/' + encodeURIComponent(evento.id), {
    method: 'PATCH', headers: cab,
    body: JSON.stringify({ summary: cuerpoEvento.summary, description: cuerpoEvento.description,
      start: cuerpoEvento.start, end: cuerpoEvento.end }),
  });
  if (!p.ok) throw falla(p, await p.json().catch(() => ({})), calendarId);
  return 'actualizado';
}

module.exports = { asegurarEvento, obtenerAccessToken, limpiarCache, SCOPE };
