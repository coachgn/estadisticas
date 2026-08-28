/* =====================================================================
   Google Sheets API v4 con Service Account

   Reemplaza a GViz anónimo. La diferencia que importa: GViz exige que la
   planilla sea PÚBLICA ("cualquiera con el enlace"), y esta vía no — la
   planilla se comparte solo con el mail de la Service Account, en modo
   Lector. Ver `server/README.md` para el alta paso a paso.

   ---------------------------------------------------------------------
   POR QUÉ NO SE USA `googleapis`

   El paquete oficial son ~50 MB y arrastra el cliente de TODAS las APIs
   de Google para usar un endpoint. Acá hacen falta dos cosas y las dos
   están en la biblioteca estándar de Node:

     1. firmar un JWT RS256 con la clave privada  → `crypto.sign`
     2. dos llamadas HTTP                         → `fetch` (Node 18+)

   Menos superficie que auditar en el camino crítico de la autenticación,
   y un arranque en frío más corto, que en serverless se paga por
   invocación.
   ===================================================================== */
'use strict';

const jwt = require('./jwt.js');
const { entorno, HOJAS, HOJAS_TEXTO } = require('./config.js');

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/* Solo lectura. Es el scope más chico que sirve, y una Service Account
   que solo puede leer no puede arruinar la planilla que el club audita
   ni aunque se filtre la credencial. */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/* El token de OAuth dura una hora; se reusa hasta 60 s antes de vencer.
   Sin esto, cada request al panel dispararía un intercambio con Google:
   una ida y vuelta extra de ~200 ms sobre CADA lectura. */
let tokenCache = { valor: null, venceEn: 0 };

/* Caché de hojas por `sheetId`, con TTL. Es el equivalente del lado
   servidor a las dos capas del frontend (punto 3): el dato cambia cuando
   corre MotorStats y nadie avisa, así que el techo del dato viejo es el
   TTL.

   OJO en serverless: esto vive en la memoria de UNA instancia. Una
   invocación en frío no lo tiene, y dos usuarios simultáneos pueden caer
   en instancias distintas. Es una optimización oportunista, no un caché
   compartido — para eso hace falta Redis. */
const hojasCache = new Map();

/**
 * Cambia la clave privada de la Service Account por un access token.
 *
 * Es el flujo `urn:ietf:params:oauth:grant-type:jwt-bearer`: se firma un
 * JWT con la clave privada y Google lo cambia por un token de una hora.
 */
async function obtenerAccessToken(deps) {
  const d = deps || {};
  const env = d.entorno || entorno();
  const ahora = Math.floor(Date.now() / 1000);

  if (tokenCache.valor && tokenCache.venceEn > ahora + 60) return tokenCache.valor;

  if (!env.googleEmail || !env.googleKey) {
    throw Object.assign(
      new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY. Ver server/.env.example'),
      { codigo: 'SIN_CREDENCIALES' });
  }

  const aserto = jwt.firmarRS256({
    iss: env.googleEmail,
    scope: SCOPE,
    aud: OAUTH_URL,
    iat: ahora,
    exp: ahora + 3600,
  }, env.googleKey);

  const traer = d.fetch || fetch;
  const r = await traer(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: aserto,
    }).toString(),
  });

  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok || !cuerpo.access_token) {
    /* El detalle de Google se loguea pero NO se propaga al cliente: puede
       traer el mail de la Service Account y el motivo exacto del rechazo,
       que es justo lo que no conviene publicar. */
    throw Object.assign(
      new Error('Google rechazó la credencial de la Service Account'),
      { codigo: 'AUTH_GOOGLE', detalle: cuerpo.error_description || cuerpo.error || r.status });
  }

  tokenCache = { valor: cuerpo.access_token, venceEn: ahora + (cuerpo.expires_in || 3600) };
  return tokenCache.valor;
}

/**
 * Trae un rango de una planilla PRIVADA.
 *
 * @param {string} sheetId  el id del libro. NUNCA sale de este lado.
 * @param {string} rango    notación A1: "PROMEDIOS E" o "Base Datos J!A1:BZ"
 * @returns {Promise<{rango, valores: string[][]}>}
 */
async function obtenerDatosPlanilla(sheetId, rango, deps) {
  const d = deps || {};
  if (!sheetId) {
    throw Object.assign(new Error('Falta el sheetId'), { codigo: 'SIN_SHEET' });
  }
  const token = await obtenerAccessToken(d);
  const traer = d.fetch || fetch;

  /* `valueRenderOption=UNFORMATTED_VALUE` devuelve el número crudo y no el
     texto ya formateado por Sheets. Es a propósito: el panel formatea del
     lado del cliente según la métrica, y el `formatted` de Google no se
     puede reproducir sin el `pattern` de cada columna (medido: 40% de
     precisión sobre 157.278 celdas — punto 3 de CLAUDE.md).

     `dateTimeRenderOption=FORMATTED_STRING` es la excepción: una fecha
     como serial de Sheets obligaría a reimplementar el epoch de 1899, y
     el parser del núcleo ya sabe leer ISO y dd/mm/aaaa. */
  const url = SHEETS_URL + '/' + encodeURIComponent(sheetId)
    + '/values/' + encodeURIComponent(rango)
    + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

  const r = await traer(url, { headers: { Authorization: 'Bearer ' + token } });

  if (r.status === 403) {
    throw Object.assign(
      new Error('La planilla no está compartida con la Service Account'),
      { codigo: 'SIN_PERMISO_SHEET' });
  }
  if (r.status === 404) {
    throw Object.assign(new Error('No existe esa planilla o ese rango'), { codigo: 'SIN_HOJA' });
  }
  if (!r.ok) {
    throw Object.assign(new Error('Google respondió ' + r.status), { codigo: 'GOOGLE_' + r.status });
  }

  const cuerpo = await r.json();
  return { rango: cuerpo.range || rango, valores: cuerpo.values || [] };
}

/**
 * Las 9 hojas de una planilla, en una sola llamada.
 *
 * `batchGet` en vez de nueve `GET`: la cuota de Sheets se mide en
 * peticiones por minuto, y el arranque del panel pide el libro entero. Con
 * nueve llamadas separadas, tres usuarios simultáneos ya rozan el límite.
 *
 * Una hoja que falla NO tumba la carga: se devuelve vacía y se anota en
 * `faltantes`. Es la misma degradación del frontend (punto 6) — una
 * planilla incompleta sigue sirviendo, y el Diagnóstico lo denuncia.
 */
async function obtenerLibro(sheetId, deps) {
  const d = deps || {};
  const env = d.entorno || entorno();
  const ahora = Date.now();

  const enCache = hojasCache.get(sheetId);
  if (enCache && enCache.venceEn > ahora) return enCache.datos;

  const token = await obtenerAccessToken(d);
  const traer = d.fetch || fetch;

  /* DOS RENDERS, y hacen falta los dos.

     `UNFORMATTED_VALUE` da el número crudo, que es lo que consume el
     índice del panel. Pero la capa vieja de Principal consume el TEXTO ya
     formateado por Sheets —el `formatted` que le daba GViz— y
     reproducirlo del lado del cliente da 40% de precisión: cada columna
     tiene su propio patrón en la planilla (punto 3 de CLAUDE.md).

     Así que no se reproduce, se le pide a Google. Es UNA petición más y
     solo por las cuatro hojas que Principal usa, no por las nueve. */
  const pedir = async (nombres, render) => {
    const qs = nombres.map(h => 'ranges=' + encodeURIComponent(h)).join('&');
    const url = SHEETS_URL + '/' + encodeURIComponent(sheetId) + '/values:batchGet?' + qs
      + '&valueRenderOption=' + render + '&dateTimeRenderOption=FORMATTED_STRING';
    const r = await traer(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 403) {
      throw Object.assign(
        new Error('La planilla no está compartida con la Service Account'),
        { codigo: 'SIN_PERMISO_SHEET' });
    }
    if (!r.ok) {
      throw Object.assign(new Error('Google respondió ' + r.status), { codigo: 'GOOGLE_' + r.status });
    }
    const cuerpo = await r.json();
    const rangos = cuerpo.valueRanges || [];
    const out = {};
    nombres.forEach((h, k) => { out[h] = (rangos[k] && rangos[k].values) || []; });
    return out;
  };

  /* En PARALELO: son dos peticiones independientes y encadenarlas
     duplicaría la latencia del arranque, que ya es lo más caro. */
  const [hojas, texto] = await Promise.all([
    pedir(HOJAS, 'UNFORMATTED_VALUE'),
    pedir(HOJAS_TEXTO, 'FORMATTED_VALUE'),
  ]);

  const faltantes = HOJAS.filter(h => !(hojas[h] || []).length);

  const datos = { hojas, hojasTexto: texto, faltantes, leidoEn: new Date().toISOString() };
  /* Solo se cachea la carga que salió LIMPIA. Con hojas que fallaron,
     guardarla serviría el libro incompleto durante todo el TTL en vez de
     reintentar — misma regla que el caché del frontend. */
  if (!faltantes.length) {
    hojasCache.set(sheetId, { datos, venceEn: ahora + env.ttlCacheMs });
  }
  return datos;
}

/** Para los tests y para el botón "Actualizar datos". */
function limpiarCache() {
  hojasCache.clear();
  tokenCache = { valor: null, venceEn: 0 };
}

module.exports = { obtenerDatosPlanilla, obtenerLibro, obtenerAccessToken, limpiarCache };
