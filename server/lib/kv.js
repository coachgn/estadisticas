/* =====================================================================
   Upstash Redis por su API REST · sin dependencias

   Upstash expone HTTP además del protocolo Redis, así que alcanza con
   `fetch`. El SDK oficial (`@upstash/redis`) haría exactamente esto y
   agregaría un paquete al arranque en frío, que en serverless se paga por
   invocación.

   ---------------------------------------------------------------------
   ESTE MÓDULO NUNCA LANZA EN LECTURA

   Es la regla que hace que el catálogo se pueda mover al KV sin volver
   frágil al servidor: si Upstash no contesta —cae, cambia el token, se
   agota el plan— `leer()` devuelve `null` y el catálogo se cae al
   siguiente origen de la cascada. Un club deja de poder darse de alta;
   los que ya están siguen funcionando.

   La ESCRITURA sí lanza: la usa el CLI, donde un error silencioso haría
   creer que un alta se guardó cuando no.
   ===================================================================== */
'use strict';

/* TRES juegos de nombres, y hay que aceptar los tres:

     UPSTASH_REDIS_REST_*     las del panel propio de Upstash
     UPSTASH_KV_REST_API_*    las de la integración Upstash en Vercel
     KV_REST_API_*            las del Vercel KV clásico

   Según por dónde se conecte la base, el que la crea se encuentra UNO de
   los tres juegos y ninguno de los otros. Exigir un nombre concreto es
   mandarlo a copiar valores a mano para nada — y ya pasó: la primera
   versión aceptaba dos y llegaron las del tercero. */
function credenciales(env) {
  const e = env || process.env;
  const url = e.UPSTASH_REDIS_REST_URL || e.UPSTASH_KV_REST_API_URL
    || e.KV_REST_API_URL || '';
  const token = e.UPSTASH_REDIS_REST_TOKEN || e.UPSTASH_KV_REST_API_TOKEN
    || e.KV_REST_API_TOKEN || '';
  /* Para el CLI: si hay un token de solo lectura configurado aparte, el
     servidor puede usar ese y el CLI el completo. */
  const tokenLectura = e.KV_REST_API_READ_ONLY_TOKEN
    || e.UPSTASH_KV_REST_API_READ_ONLY_TOKEN || '';
  return {
    url: String(url).replace(/\/+$/, ''),
    token: String(token),
    tokenLectura: String(tokenLectura),
  };
}

function configurado(env) {
  const c = credenciales(env);
  return !!(c.url && (c.token || c.tokenLectura));
}

async function comando(partes, opciones) {
  const o = opciones || {};
  const c = credenciales(o.env);
  const token = (o.soloLectura && c.tokenLectura) ? c.tokenLectura : (c.token || c.tokenLectura);
  if (!c.url || !token) {
    const e = new Error('Upstash no está configurado (falta UPSTASH_REDIS_REST_URL o su token)');
    e.codigo = 'SIN_KV';
    throw e;
  }
  const traer = o.fetch || fetch;

  /* Techo de espera. Sin esto, un Upstash que no contesta deja colgada la
     petición del panel — y el catálogo tiene un respaldo perfectamente
     bueno esperando del otro lado. Es la misma decisión que el
     `TIMEOUT_HOJA` del frontend. */
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const corte = setTimeout(() => { if (ctrl) ctrl.abort(); }, o.timeoutMs || 2500);
  try {
    const r = await traer(c.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(partes),
      signal: ctrl ? ctrl.signal : undefined,
    });
    const cuerpo = await r.json().catch(() => ({}));
    if (!r.ok || cuerpo.error) {
      const e = new Error(cuerpo.error || ('Upstash respondió ' + r.status));
      e.codigo = r.status === 401 ? 'KV_TOKEN' : 'KV_' + r.status;
      throw e;
    }
    return cuerpo.result;
  } finally {
    clearTimeout(corte);
  }
}

/**
 * Lee una clave. NUNCA lanza: devuelve `null` y deja que el llamador siga
 * con su respaldo.
 * @returns {Promise<{valor: any, error: string|null}>}
 */
async function leer(clave, opciones) {
  const o = opciones || {};
  try {
    const crudo = await comando(['GET', clave], Object.assign({ soloLectura: true }, o));
    if (crudo === null || crudo === undefined) return { valor: null, error: null };
    /* Upstash devuelve el string tal cual se guardó. Si no es JSON válido,
       se trata como ausente: un blob corrupto NO puede tumbar el
       catálogo. */
    try { return { valor: JSON.parse(crudo), error: null }; }
    catch (e) { return { valor: null, error: 'JSON inválido en ' + clave }; }
  } catch (e) {
    return { valor: null, error: (e && e.codigo) || 'KV' };
  }
}

/** Escribe una clave. SÍ lanza: la usa el CLI y un fallo silencioso ahí
    haría creer que un alta se guardó cuando no. */
async function escribir(clave, valor, opciones) {
  return comando(['SET', clave, JSON.stringify(valor)], opciones);
}

async function borrar(clave, opciones) {
  return comando(['DEL', clave], opciones);
}

module.exports = { credenciales, configurado, comando, leer, escribir, borrar };
