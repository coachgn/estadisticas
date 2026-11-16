/* test-agenda.js · el feed de la agenda (eventos para el Apps Script del usuario)
   Nada sale a la red: partidos y calendario son de mentira. */
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
const catalogo = require('./server/lib/catalogo.js');
const fixtureApi = require('./server/rutas/fixture.js');
const api = require('./server/rutas/agenda.js');
const fs = require('fs');

let ok = 0, mal = 0;
const t = (n, c, x) => { if (c) ok++; else { mal++; console.log('  X ' + n + (x !== undefined ? ' → ' + JSON.stringify(x) : '')); } };

const AHORA = Date.parse('2026-11-01T15:00:00Z'); // 12:00 AR
const P = (fecha, local, visitante, extra) => Object.assign({ fecha, hora: '21:00', local, visitante, estado: 'PROGRAMADO' }, extra || {});
const partidos = [P('2026-11-20', 'JUJUY BASQUET', 'HINDU (C)'), P('2026-11-25', 'ATENAS (C)', 'HINDU (C)')];

(async () => {
  const cargarO = catalogo.cargar, refO = fixtureApi.refrescar;
  catalogo.cargar = async () => ({ catalogo: {} });
  fixtureApi.refrescar = async () => ({ zonas: { norte: { partidos } }, fallaron: [] });
  const kv = { leer: async () => ({ valor: null }), escribir: async () => {}, configurado: () => true };
  const env = { AGENDA_KEY: 'clave-de-prueba-123456' };
  const q = (clave) => ({ query: { clave } });

  let r = await api.manejarAgenda(q('x'), { env: {} });
  t('sin AGENDA_KEY la ruta no corre', r.status === 503 && r.body.codigo === 'SIN_AGENDA_KEY', r);
  r = await api.manejarAgenda(q('otra'), { env, kv, ahora: AHORA });
  t('con una clave equivocada es 401', r.status === 401);
  r = await api.manejarAgenda({ query: {} }, { env, kv, ahora: AHORA });
  t('sin clave es 401', r.status === 401);

  r = await api.manejarAgenda(q(env.AGENDA_KEY), { env, kv, ahora: AHORA });
  const ev = r.body.eventos || [];
  t('responde 200 con el aviso de -4 días y el día del partido de Jujuy',
    r.status === 200 && ev.filter(e => e.origen === 'jujuy').length === 2, ev.map(e => e.titulo));
  const aviso = ev.find(e => /En 4 días/.test(e.titulo));
  t('el aviso cae 4 días antes a las 09:00 con popup a la hora',
    aviso && aviso.inicio === '2026-11-16T09:00:00-03:00' && aviso.recordatorios[0] === 0, aviso);
  const dia = ev.find(e => /Hoy juega/.test(e.titulo));
  t('el día del partido va a su hora con popup una hora antes', dia && dia.inicio === '2026-11-20T21:00:00-03:00' && dia.recordatorios[0] === 60, dia);
  t('cada evento trae id estable, título, inicio, fin y recordatorios',
    ev.every(e => /^s[gd][0-9a-f]{30}$/.test(e.id) && e.titulo && e.inicio && e.fin && Array.isArray(e.recordatorios)));
  t('los ajenos (que no son de Jujuy) no entran', !ev.some(e => /ATENAS/.test(e.titulo)));

  r = await api.manejarAgenda({ query: { clave: env.AGENDA_KEY, origen: 'carga-manual' } }, { env, kv, ahora: AHORA });
  t('?origen= filtra: pidiendo solo carga-manual no llega nada de Jujuy', r.status === 200 && r.body.eventos.every(e => e.origen === 'carga-manual'), r.body.eventos);
  r = await api.manejarAgenda({ query: { clave: env.AGENDA_KEY, origen: 'jujuy' } }, { env, kv, ahora: AHORA });
  t('?origen=jujuy trae solo Jujuy', r.body.eventos.length === 2 && r.body.eventos.every(e => e.origen === 'jujuy'), r.body.eventos.length);

  /* Una lectura caída de Jujuy no tumba la respuesta: se avisa. */
  fixtureApi.refrescar = async () => { throw new Error('sin red'); };
  r = await api.manejarAgenda(q(env.AGENDA_KEY), { env, kv, ahora: AHORA });
  t('si la fuente cae, 200 con el aviso y sin eventos inventados', r.status === 200 && r.body.avisos.length >= 1, r.body);

  /* La ruta solo lee: nunca llama a Calendar ni escribe en KV. */
  const src = fs.readFileSync('./server/rutas/agenda.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  t('la ruta no escribe (ni Calendar ni KV)', !/asegurarEvento|\.escribir\(|google-calendar/.test(src));
  t('está registrada en la app', /api\/cron\/agenda/.test(fs.readFileSync('./server/app.js', 'utf8')));

  catalogo.cargar = cargarO; fixtureApi.refrescar = refO;
  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
