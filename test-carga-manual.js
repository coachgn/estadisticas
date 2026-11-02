/* =====================================================================
   test-carga-manual.js · LA DOBLE ALERTA DE CARGA (torneos sin PBP)

     1. la previa: partidos de HOY, agrupados, al mediodía (evento 12:30 AR)
     2. el control: lo jugado AYER, checklist, a la mañana (evento 07:30 AR)
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
const AHORA_P = Date.parse('2026-11-02T15:00:00Z');   // 2026-11-02 12:00 AR
const pre = C.planificarPrevia(grupos, AHORA_P);
t('cuenta los 3 de HOY sin repetir', pre.cantidad === 3, pre.cantidad);
t('título con la fecha DD/MM/AA', pre.evento.summary === '⚠️ Partidos a jugarse hoy 02/11/26 (3)', pre.evento.summary);
t('hoy a las 12:30 AR', pre.evento.inicio === '2026-11-02T12:30:00-03:00', pre.evento.inicio);
t('a las 12:00 todavía no pasó el horario', pre.evento.atrasado === false);
t('agrupa por torneo y zona', /APB Masculino · zona A \(2\)/.test(pre.evento.description)
  && /Bahía Blanca · zona ORO \(1\)/.test(pre.evento.description));
t('dice partidos a jugarse hoy con fecha corta', /Partidos a jugarse hoy 02\/11\/26/.test(pre.evento.description));
t('ninguna fecha en formato ISO', !/\d{4}-\d{2}-\d{2}/.test(pre.evento.summary + pre.evento.description), pre.evento.description);
t('ordena por hora', pre.evento.description.indexOf('21:00 · ESTUDIANTES') < pre.evento.description.indexOf('22:00 · ATENAS'));
t('no mete lo jugado', !/80/.test(pre.evento.description));
t('no mete los de mañana', C.planificarPrevia(grupos, Date.parse('2026-11-01T15:00:00Z')).cantidad === 0);
t('id estable', C.planificarPrevia(grupos, AHORA_P).evento.id === pre.evento.id);
t('después de las 12:30 es atrasado', C.planificarPrevia(grupos, Date.parse('2026-11-02T16:00:00Z')).evento.atrasado === true);
t('fechaCorta', C.fechaCorta('2026-11-02') === '02/11/26' && C.fechaCorta('2027-01-09') === '09/01/27');

console.log('2. el control');
const con = C.planificarControl(grupos, AHORA);
t('cuenta los 2 jugados ayer', con.cantidad === 2, con.cantidad);
t('título con la fecha DD/MM/AA', con.evento.summary === '📋 Se jugaron ayer 31/10/26: cargar resultados (2)', con.evento.summary);
t('texto «se jugaron ayer», resultados y a cargar', /Se jugaron los siguientes partidos ayer 31\/10\/26/.test(con.evento.description)
  && /cargar/.test(con.evento.description));
t('sin fechas ISO', !/\d{4}-\d{2}-\d{2}/.test(con.evento.summary + con.evento.description));
t('hoy a las 07:30 AR (ya pasó a las 12:00)', con.evento.inicio === '2026-11-01T07:30:00-03:00' && con.evento.atrasado === true);
t('checklist con marcador', /☐ ATENAS 80 - 75 ESTUDIANTES/.test(con.evento.description)
  && /☐ OLIMPO 60 - 61 LINIERS/.test(con.evento.description));
t('no incluye el sin marcador', !/PLATENSE vs|PLATENSE 0/.test(con.evento.description) && !/GIMNASIA/.test(con.evento.description));
t('a la mañana temprano no está atrasado', C.planificarControl(grupos, Date.parse('2026-11-01T10:00:00Z')).evento.atrasado === false);
t('cruce de mes', C.planificarControl([{ torneo: 'X', zona: 'a', partidos: [P('2026-10-31', 'A', 'B', { ptsLocal: 1, ptsVisitante: 2 })] }],
  Date.parse('2026-11-01T10:00:00Z')).cantidad === 1);

console.log('3. días vacíos');
t('sin partidos no hay evento', C.planificarPrevia(grupos, Date.parse('2026-12-20T10:00:00Z')).evento === null);
t('sin jugados no hay evento', C.planificarControl([], AHORA).evento === null);

console.log('3 bis. los torneos manuales salen del catálogo (forma REAL: zonas en categorias)');
const cat = { catalogo: {
  masc: { tipo: 'torneo', nombre: 'APB Masc', fixture: { adaptador: 'auto', zonas: { a: {}, b: {} } },
    categorias: { 'm-a': { zona: 'a' }, 'm-b': { zona: 'b' }, 'm-po': { zona: 'po', rol: 'playoffs', interzonal: true } } },
  conPbp: { tipo: 'torneo', fixture: { zonas: { n: {} } }, categorias: { x: { zona: 'n', laboratorio: ['pbp'] } } },
  sinFixture: { tipo: 'torneo', categorias: { y: { zona: 'u' } } },
  club: { tipo: 'cliente', fixture: { zonas: { a: {} } } },
  nuevo: { tipo: 'torneo', nombre: 'Nuevo', fixture: { adaptador: 'x' }, categorias: { n1: { zona: 'z1' }, n2: { zona: 'z2', rol: 'regular' } } },
} };
const tm = C.torneosManuales(cat);
t('toma los que declaran fixture y no tienen pbp', tm.map(x => x.torneo).join() === 'masc,nuevo', tm.map(x => x.torneo));
t('zonas de la fuente declarada', tm[0].zonas.join() === 'a,b');
t('sin zonas declaradas usa las categorías regulares', tm[1].zonas.join() === 'z1,z2');
t('un torneo nuevo entra sin tocar código', tm[1].etiqueta === 'Nuevo');
t('catálogo vacío no rompe', C.torneosManuales(null).length === 0);
const rep = P('2026-11-02', 'A', 'B');
const dd = C.delDia([{ torneo: 'T', zona: 'a', partidos: [rep] }, { torneo: 'T', zona: 'b', partidos: [rep] }], '2026-11-02', false);
t('el mismo cruce no se repite entre zonas', dd.length === 1 && dd[0].partidos.length === 1, dd);
const ent = C.planificarPrevia([{ torneo: 'T', zona: 'a', partidos: [P('2026-11-02', '6&ordm; UNION', 'B')] }], Date.parse('2026-11-02T10:00:00Z'));
t('decodifica entidades HTML', /6º UNION/.test(ent.evento.description) && !/&ordm;/.test(ent.evento.description), ent.evento.description);

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
})().then(async () => {
console.log('5. la notificación en el celular');
const gcal = require('./server/lib/google-calendar.js');
(async () => {
  let cuerpo = null;
  await gcal.asegurarEvento('c@group.calendar.google.com', pre.evento, {
    entorno: { googleEmail: 'a@b.iam', googleKey: 'k' },
    fetch: async (url, o) => {
      if (/oauth2/.test(url)) return { ok: true, json: async () => ({ access_token: 'x', expires_in: 3600 }) };
      cuerpo = JSON.parse(o.body); return { ok: true, json: async () => ({}) };
    },
  }).catch(() => {});
  /* sin credencial real la firma falla: se prueba la forma del cuerpo aparte */
  const ov = cuerpo && cuerpo.reminders;
  if (ov) {
    t('recordatorio explícito, sin useDefault', ov.useDefault === false);
    t('popup y email en el minuto 0', ov.overrides.some(o => o.method === 'popup' && o.minutes === 0)
      && ov.overrides.some(o => o.method === 'email' && o.minutes === 0), ov);
  }
  t('el módulo declara popup y email', /method: 'popup'/.test(require('fs').readFileSync('./server/lib/google-calendar.js', 'utf8'))
    && /method: 'email'/.test(require('fs').readFileSync('./server/lib/google-calendar.js', 'utf8')));
  const m = C.armarMail(pre.evento);
  t('el mail lleva título y partidos', m.asunto === pre.evento.summary && /ATENAS/.test(m.texto) && /ATENAS/.test(m.html));
  t('el mail escapa el HTML', !/<script/.test(C.armarMail({ summary: 's', description: '<script>x</script>' }).html));
  t('destino por defecto y configurable', C.destinosMail({}).length === 1
    && C.destinosMail({ CARGA_MANUAL_MAIL_PARA: 'a@x.com, b@y.com' }).join() === 'a@x.com,b@y.com');
  const enviados = [];
  const tr = { enviar: async (x) => { if (x.para === 'malo@x.com') throw Object.assign(new Error('no'), { codigo: 'SMTP' }); enviados.push(x); } };
  let r = await api.avisarPorMail(pre.evento, { transporte: tr }, { CARGA_MANUAL_MAIL_PARA: 'ok@x.com,malo@x.com' });
  t('manda a cada destino y un fallo no tumba', r.enviado === true && r.para.join() === 'ok@x.com' && r.errores.length === 1, r);
  t('el mail sale con asunto y texto', enviados[0].asunto === pre.evento.summary && /Partidos a jugarse hoy/.test(enviados[0].texto));
  console.log('\n' + ok + ' ok · ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
})();
});
