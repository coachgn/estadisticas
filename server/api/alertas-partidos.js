/* =====================================================================
   /api/cron/alertas-partidos · la corrida diaria de las alertas (-4 días)

   Se autentica igual que el cron de vencimientos: `CRON_SECRET` en el
   Authorization que manda Vercel, o un token de ADMIN para probarla a
   mano. Sin el secreto la ruta no corre.

   `?simular=1` planifica y muestra lo que haría SIN escribir en Calendar
   ni en KV: es la primera mirada antes de tocar un calendario.

   De dónde salen los partidos, en orden:
     1. el fixture guardado en KV por `/api/v1/fixture/:torneo` (si es fresco)
     2. la fuente declarada en el catálogo del torneo, o la de respaldo del
        perfil, bajada con el mismo lector del panel
     3. la última lectura buena aunque esté vieja (la fuente se cayó)
   Sin nada de eso se responde 502 y NO se toca el calendario: una lectura
   fallida no es «no hay partidos».
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const fuentes = require('../lib/fixture-fuentes.js');
const fixtureApi = require('./fixture.js');
const alertas = require('../lib/alertas-partidos.js');
const calendar = require('../lib/google-calendar.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const { mismoSecreto } = require('./mails.js');

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

async function partidosDe(perfil, deps) {
  const almacen = deps.kv || kv;
  let guardado = null;
  try {
    const r = await almacen.leer(fixtureApi.claveKV(perfil.torneo), deps);
    guardado = (r && r.valor) || null;
  } catch (e) { guardado = null; }

  const ttl = fixtureApi.TTL_POR_DEFECTO;
  const edad = guardado && guardado.actualizado ? Date.now() - Date.parse(guardado.actualizado) : Infinity;
  if (guardado && edad < ttl && guardado.zonas && guardado.zonas[perfil.zona]) {
    return { partidos: guardado.zonas[perfil.zona].partidos || [], origen: 'kv' };
  }

  let config = null;
  try {
    const cat = await catalogo.cargar(deps);
    const entrada = (cat.catalogo || {})[perfil.torneo];
    config = entrada ? fuentes.configDe(entrada) : null;
    if (config) config.equiposPorZona = fixtureApi.idsPorZona(entrada);
  } catch (e) { config = null; }
  if (!config) config = fuentes.configDe({ fixture: perfil.fuenteRespaldo });

  if (config) {
    try {
      const hoy = alertas.hoyAR(deps.ahora);
      const r = await fixtureApi.refrescar(config, deps, hoy);
      if (r.zonas[perfil.zona]) {
        // Se guarda para el panel también, fusionando con lo que hubiera.
        const zonas = Object.assign({}, (guardado && guardado.zonas) || {}, r.zonas);
        try {
          if (deps.simular) throw new Error('simulacion: no se escribe');
          await almacen.escribir(fixtureApi.claveKV(perfil.torneo),
            { actualizado: new Date().toISOString(), zonas: zonas, fallaron: r.fallaron, adaptador: config.adaptador });
        } catch (e) { /* no se pudo cachear: el cron sigue */ }
        return { partidos: r.zonas[perfil.zona].partidos, origen: 'fuente' };
      }
    } catch (e) { /* cae a lo guardado */ }
  }
  if (guardado && guardado.zonas && guardado.zonas[perfil.zona]) {
    return { partidos: guardado.zonas[perfil.zona].partidos || [], origen: 'kv-vencido' };
  }
  throw Object.assign(new Error('No se pudo leer el fixture de ' + perfil.torneo + '/' + perfil.zona + ' y no hay copia guardada.'),
    { codigo: 'FIXTURE' });
}

async function manejarCronAlertasPartidos(peticion, deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const secreto = env.CRON_SECRET || '';
  const enc = String(((peticion && peticion.headers) || {}).authorization || '');
  const porCron = secreto && mismoSecreto(enc.replace(/^Bearer\s+/i, ''), secreto);
  if (!porCron) {
    const v = verificarToken(tokenDeLaPeticion(peticion));
    if (!v.ok || v.rol !== AUTH.ROLES.ADMIN) {
      return secreto ? error(401, 'CRON', 'Falta el secreto del cron.')
        : error(503, 'SIN_CRON_SECRET', 'CRON_SECRET no está configurado: la corrida no se habilita sin él.');
    }
  }

  /* ?simular=1: muestra el plan sin escribir en Calendar ni en KV. */
  const q = String(((peticion && peticion.query) || {}).simular || '').toLowerCase();
  const simular = q === '1' || q === 'true';
  const salida = [];
  for (const base of alertas.PERFILES) {
    const perfil = Object.assign({}, base, { calendarId: env.ALERTAS_CALENDAR_ID || base.calendarId });
    try {
      const { partidos, origen } = await partidosDe(perfil, Object.assign({}, d, { simular: simular }));
      const r = await alertas.ejecutar(perfil, partidos,
        Object.assign({}, d, { calendario: d.calendario || calendar, simular: simular }));
      salida.push(Object.assign({ origen: origen }, r));
    } catch (e) {
      salida.push({ perfil: perfil.id, ok: false, codigo: e.codigo || 'ERROR', mensaje: e.message });
    }
  }
  const fallo = salida.some(s => s.ok === false || (s.errores && s.errores.length));
  return { status: fallo ? 502 : 200, body: { ok: !fallo, perfiles: salida } };
}

module.exports = { manejarCronAlertasPartidos, partidosDe };
