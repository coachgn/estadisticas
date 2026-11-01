/* =====================================================================
   test-carga-manual.js · LA DOBLE ALERTA DE CARGA (torneos sin PBP)

     1. la previa: partidos de MAÑANA, agrupados, a las 21:00 AR
     2. el control: lo jugado AYER, checklist, a las 09:00 AR
     3. lo que no entra (jugados en la previa, programados en el control)
     4. el cron: secreto, calendario propio, lectura incompleta, simulacion
     Nada sale a la red.
   ===================================================================== */
'use strict';

process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
delete process.env.CRON_SECRET;

const C = require('./server/lib/carga-manual.js');
const api = require('./server/api/carga-manual.js');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) ok++; else { mal++; console.log('  X ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

// 2026-11-01 12:00 en Argentina
const AHORA = Date.parse('2026-11-01T15:00:00Z');
const P = (fecha, local, visitante, extra) => Object.assign({ fecha, local, visitante, estado: 'PROGRAMADO', hora: '21:00' }, extra || {});
const grupos = [
  { torneo: 'APB Masculino', zona: 'a', partidos: [
    P('2026-11-02', 'ATENAS', 'PLATENSE', { hora: '22:00' }),
    P('2026-11-02', 'ESTUDIANTES', 'GIMNASIA'),
    P('2026-11-02', 'ESTUDIANTES', 'GIMNASIA'),            // repetido
    P('2026-10-31', 'ATENAS', 'ESTUDIANTES', { estado: 'JUGADO', ptsLocal: 80, ptsVisitante: 75 }),
    P('2026-10-31', 'PLATENSE', 'GIMNASIA'),               // ayer sin marcador
  ] },
  { torneo: 'Bahía Blanca', zona: 'oro', partidos: [
    P('2026-11-02', 'OLIMPO', 'ALEM'),
    P('2026-10-31', 'OLIMPO', 'LINIERS', { estado: 'JUGADO', ptsLocal: 60, ptsVisitante: 61 }),
  ] },
];

console.log('1. la previa');
const pre = C.planificarPrevia(grupos, AHORA);
t('cuenta los 3 de mañana sin repetir', pre.cantidad === 3, pre.cantidad);
t('título', pre.evento.summary === '⚠️ Mañana hay carga: 3 partidos programados', pre.evento.summary);
t('hoy a las 21:00 AR', pre.evento.inicio === '2026-11-01T21:00:00-03:00', pre.evento.inicio);
t('agrupa por torneo y zona', /APB Masculino · zona A \(2\)/.test(pre.evento.description)
  && /Bahía Blanca · zona ORO \(1\)/.test(pre.evento.description));
t('ordena por hora', pre.evento.description.indexOf('21:00 · ESTUDIANTES') < pre.evento.description.indexOf('22:00 · ATENAS'));
t('no mete lo jugado', !/80/.test(pre.evento.description));
t('id estable', C.planificarPrevia(grupos, AHORA).evento.id === pre.evento.id);
t('singular', C.planificarPrevia([{ torneo: 'X', zona: 'a', partidos: [P('2026-11-02', 'A', 'B')] }], AHORA)
  .evento.summary === '⚠️ Mañana hay carga: 1 partido programado');
t('después de las 21:00 es atrasado', C.planificarPrevia([{ torneo: 'X', zona: 'a', partidos: [P('2026-11-02', 'A', 'B')] }],
  Date.parse('2026-11-02T01:00:00Z')).evento.atrasado === true);

console.log('2. el control');
const con = C.planificarControl(grupos, AHORA);
t('cuenta los 2 jugados ayer', con.cantidad === 2, con.cantidad);
t('título', con.evento.summary === '📋 Pendiente de Carga: Partidos jugados ayer (2)', con.evento.summary);
t('hoy a las 09:00 AR (ya pasó a las 12:00)', con.evento.inicio === '2026-11-01T09:00:00-03:00' && con.evento.atrasado === true);
t('checklist con marcador', /☐ ATENAS 80 - 75 ESTUDIANTES/.test(con.evento.description)
  && /☐ OLIMPO 60 - 61 LINIERS/.test(con.evento.description));
t('no incluye el sin marcador', !/PLATENSE vs|PLATENSE 0/.test(con.evento.description) && !/GIMNASIA/.test(con.evento.description));
t('a la mañana temprano no está atrasado', C.planificarControl(grupos, Date.parse('2026-11-01T10:00:00Z')).evento.atrasado === false);
t('cruce de mes', C.planificarControl([{ torneo: 'X', zona: 'a', partidos: [P('2026-10-31', 'A', 'B', { ptsLocal: 1, ptsVisitante: 2 })] }],
  Date.parse('2026-11-01T10:00:00Z')).cantidad === 1);

console.log('3. días vacíos');
t('sin partidos no hay evento', C.planificarPrevia(grupos, Date.parse('2026-12-20T10:00:00Z')).evento === null);
t('sin jugados no hay evento', C.planificarControl([], AHORA).evento === null);

console.log('4. el cron');
(async () => {
  const peticion = (q, auth) => ({ headers: auth ? { authorization: 'Bearer ' + auth } : {}, query: q });
  const env = { CRON_SECRET: 'sec', TORNEOS_MANUALES_CALENDAR_ID: 'manual@group.calendar.google.com' };
  let r = await api.manejarCronCargaManual(peticion({ flujo: 'previa' }), { env: {} });
  t('sin secreto no corre', r.status === 503, r.status);
  r = await api.manejarCronCargaManual(peticion({ flujo: 'previa' }, 'mal'), { env });
  t('secreto malo 401', r.status === 401, r.status);
  r = await api.manejarCronCargaManual(peticion({ flujo: 'x' }, 'sec'), { env });
  t('flujo inválido 400', r.status === 400, r.status);
  r = await api.manejarCronCargaManual(peticion({ flujo: 'previa' }, 'sec'), { env: { CRON_SECRET: 'sec' } });
  t('sin calendario propio 503, no usa el de las alertas', r.status === 503 && r.body.codigo === 'SIN_CALENDARIO', r);
  t('el calendario no se comparte con ALERTAS_CALENDAR_ID', !/ALERTAS_CALENDAR_ID/.test(require('fs').readFileSync('./server/api/carga-manual.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
  r = await api.manejarCronCargaManual(peticion({ flujo: 'previa' }, 'sec'), { env, ahora: AHORA, kv: { leer: async () => ({ valor: null }), escribir: async () => {} } });
  t('sin fixture 502 y no toca el calendario', r.status === 502, r.status);
  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
