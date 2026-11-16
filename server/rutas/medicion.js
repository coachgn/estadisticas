/* =====================================================================
   LAS RUTAS DE LA MEDICIÓN (ver lib/medicion.js)

     POST /api/v1/medicion   sin token · { eventos: [{ evento, utm }] } → suma contadores
     GET  /api/v1/medicion   ADMIN · ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → el embudo

   El POST es público a propósito: lo manda la landing antes de cualquier
   sesión. No recibe ni guarda nada que identifique a una persona, y el
   rate limit general de app.js lo acota.
   ===================================================================== */
'use strict';

const M = require('../lib/medicion.js');
const AUTHS = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

async function manejarMedicion(peticion, deps) {
  /* sendBeacon manda text/plain (un tipo «simple»: sin preflight de CORS),
     así que el cuerpo puede llegar como texto. */
  let cuerpo = (peticion && peticion.body) || {};
  if (typeof cuerpo === 'string') { try { cuerpo = JSON.parse(cuerpo); } catch (e) { cuerpo = {}; } }
  const eventos = M.normalizarPedido(cuerpo);
  if (!eventos.length) return { status: 200, body: { ok: true, sumados: 0 } };
  try { await M.registrar(eventos, deps, deps && deps.reloj ? { ahora: deps.reloj() } : null); }
  catch (e) { return error(503, 'KV', 'No se pudo registrar la medición.'); }
  return { status: 200, body: { ok: true, sumados: eventos.length } };
}

async function manejarMedicionLeer(peticion, deps) {
  const v = AUTHS.verificarToken(AUTHS.tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');
  if (v.rol !== AUTH.ROLES.ADMIN) return error(403, 'SOLO_ADMIN', 'La medición la ve el administrador.');
  const q = (peticion && peticion.query) || {};
  const hoy = M.diaAR(deps && deps.reloj ? deps.reloj() : null);
  const hasta = String(q.hasta || hoy);
  const desde = String(q.desde || M.diaAR(new Date(new Date(hasta + 'T12:00:00Z').getTime() - 29 * 86400000 + 3 * 3600000)));
  const dias = M.diasEntre(desde, hasta);
  if (!dias) return error(400, 'RANGO', 'El rango tiene que ser desde ≤ hasta, en AAAA-MM-DD.');
  const porDia = {};
  try { for (const d of dias) porDia[d] = await M.leerDia(d, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo leer la medición.'); }
  return { status: 200, body: Object.assign({ ok: true, desde: dias[0], hasta: dias[dias.length - 1] }, M.resumen(porDia)) };
}

module.exports = { manejarMedicion, manejarMedicionLeer };
