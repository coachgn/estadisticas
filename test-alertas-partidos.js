/* =====================================================================
   test-alertas-partidos.js · LAS ALERTAS DE PARTIDO (-4 dias, 09:00 AR)

     1. las fechas: -4 dias, 09:00 de Argentina, cruce de mes y de anio
     2. que partidos entran y cuales no
     3. la clave sin fecha: una reprogramacion corrige, no duplica
     4. el cliente de Calendar contra una API de mentira
     5. la corrida: idempotencia, evento borrado, calendario sin compartir
     6. el cron: secreto, y que un fixture ilegible NO toque el calendario

   Nada sale a la red.
   ===================================================================== */
'use strict';

process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
delete process.env.CRON_SECRET;

const crypto = require('crypto');
const A = require('./server/lib/alertas-partidos.js');
const cal = require('./server/lib/google-calendar.js');
const api = require('./server/rutas/alertas-partidos.js');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) ok++; else { mal++; console.log('  X ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const PERFIL = Object.assign({}, A.PERFILES[0], { calendarId: 'prueba@gmail.com' });
// 2026-11-01 12:00 en Argentina
const AHORA = Date.parse('2026-11-01T15:00:00Z');
const P = (fecha, local, visitante, extra) => Object.assign({ fecha, hora: '21:00', local, visitante, estado: 'PROGRAMADO' }, extra || {});

/* ---- 1 · fechas -------------------------------------------------- */
t('hoy es la fecha de Argentina, no la de UTC', A.hoyAR(Date.parse('2026-11-02T01:30:00Z')) === '2026-11-01');
t('-4 dias simple', A.restarDias('2026-11-20', 4) === '2026-11-16');
t('-4 dias cruza el mes', A.restarDias('2026-11-02', 4) === '2026-10-29');
t('-4 dias cruza el anio', A.restarDias('2027-01-02', 4) === '2026-12-29');
t('09:00 AR son las 12:00 UTC', A.instanteAR('2026-11-16', '09:00') === Date.parse('2026-11-16T12:00:00Z'));
t('fecha invalida da null', A.restarDias('mañana', 4) === null && A.instanteAR('x', '09:00') === null);

/* ---- 2 · que entra ------------------------------------------------ */
const partidos = [
  P('2026-11-20', 'JUJUY BASQUET', 'HINDU (C)'),
  P('2026-12-04', 'SALTA BASKET', 'JUJUY BASQUET'),
  P('2026-11-25', 'ATENAS (C)', 'HINDU (C)'),                       // no es de Jujuy
  P('2026-10-20', 'JUJUY BASQUET', 'SALTA BASKET', { ptsLocal: 80, ptsVisitante: 70, estado: 'FINALIZADO' }),
  P('2026-11-03', 'JUJUY BASQUET', 'COLON (SF)'),                   // alerta el 30/10: ya paso
  P('2026-11-30', 'HINDU (C)', 'JUJUY BASQUET'),                    // la vuelta: localia invertida
  P('2026-11-20', 'JUJUY BASQUET', 'HINDU (C)'),                    // duplicado exacto
  P('2026-11-28', 'JUJUY BASQUET', 'BOCHAS', { estado: 'SUSPENDIDO' }),
];
const plan = A.planificar(partidos, PERFIL, AHORA);
t('crea las dos futuras que corresponden', plan.alertas.length === 3 && plan.alertas.map(a => a.fechaPartido).join() === '2026-11-20,2026-11-30,2026-12-04', plan.alertas.map(a => a.fechaPartido));
t('la alerta cae 4 dias antes a las 09:00 -03:00', plan.alertas[0].inicio === '2026-11-16T09:00:00-03:00' && plan.alertas[0].fin === '2026-11-16T09:30:00-03:00', plan.alertas[0].inicio);
t('el partido de menos de 4 dias queda como atrasado, no se crea', plan.atrasadas.length === 1 && plan.atrasadas[0].fechaPartido === '2026-11-03');
t('no alerta lo jugado, lo suspendido ni los duplicados (los ajenos ni se cuentan)', plan.descartados === 3, plan.descartados);
t('el titulo y la descripcion dicen cruce, rival y hora', /JUJUY BASQUET vs\. HINDU/.test(plan.alertas[0].summary) && /21:00 hs/.test(plan.alertas[0].description) && /contra HINDU/.test(plan.alertas[0].description));
t('el id es hex, estable y de largo valido', /^sg[0-9a-f]{30}$/.test(plan.alertas[0].id) && plan.alertas[0].id === A.planificar(partidos, PERFIL, AHORA).alertas[0].id);
t('ida y vuelta (localia invertida) tienen ids distintos', plan.alertas[0].id !== plan.alertas[2].id);

/* ---- 3 · reprogramacion: mismo id, otra fecha ---------------------- */
const rep = A.planificar([P('2026-11-24', 'JUJUY BASQUET', 'HINDU (C)')], PERFIL, AHORA).alertas[0];
t('reprogramar NO cambia el id (se corrige el mismo evento)', rep.id === plan.alertas[0].id && rep.inicio === '2026-11-20T09:00:00-03:00');
t('sin fecha no se alerta', A.planificar([P(null, 'JUJUY BASQUET', 'HINDU (C)')], PERFIL, AHORA).alertas.length === 0);

/* ---- 4 · cliente de Calendar contra una API de mentira ------------- */
const par = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ENV = { googleEmail: 'sa@proyecto.iam.gserviceaccount.com',
  googleKey: par.privateKey.export({ type: 'pkcs8', format: 'pem' }) };

function apiCalendar(opciones) {
  const o = opciones || {};
  const eventos = {};
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    const metodo = (init && init.method) || 'GET';
    llamadas.push(metodo + ' ' + url);
    const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    if (url.indexOf('oauth2.googleapis.com') >= 0) {
      if (o.authMal) return res(400, { error: 'invalid_grant' });
      return res(200, { access_token: 'tok', expires_in: 3600 });
    }
    if (o.sinCompartir) return res(404, { error: { errors: [{ reason: 'notFound' }] } });
    if (o.apiApagada) return res(403, { error: { errors: [{ reason: 'accessNotConfigured' }] } });
    const m = /\/events(?:\/([^?]+))?$/.exec(url);
    const id = m && m[1] ? decodeURIComponent(m[1]) : null;
    if (metodo === 'POST') {
      const b = JSON.parse(init.body);
      if (eventos[b.id]) return res(409, {});
      eventos[b.id] = Object.assign({ status: 'confirmed' }, b);
      return res(200, eventos[b.id]);
    }
    if (metodo === 'GET') return eventos[id] ? res(200, eventos[id]) : res(404, {});
    if (metodo === 'PATCH') { Object.assign(eventos[id], JSON.parse(init.body)); return res(200, eventos[id]); }
    return res(500, {});
  };
  return { fetch: fetchFalso, eventos, llamadas };
}

(async () => {
  const ev = plan.alertas[0];
  let api1 = apiCalendar();
  cal.limpiarCache();
  const d1 = { entorno: ENV, fetch: api1.fetch };
  t('crea el evento con popup a la hora exacta y sin depender del default', await cal.asegurarEvento('x@g.com', ev, d1) === 'creado'
    && api1.eventos[ev.id].reminders.useDefault === false && api1.eventos[ev.id].reminders.overrides[0].minutes === 0
    && api1.eventos[ev.id].reminders.overrides[0].method === 'popup');
  t('el evento no ocupa la agenda (transparente)', api1.eventos[ev.id].transparency === 'transparent');
  t('segunda corrida: igual, sin crear otro', await cal.asegurarEvento('x@g.com', ev, d1) === 'igual' && Object.keys(api1.eventos).length === 1);
  t('el token se pidio una sola vez', api1.llamadas.filter(l => /oauth2/.test(l)).length === 1);

  const movido = Object.assign({}, ev, { inicio: '2026-11-20T09:00:00-03:00', fin: '2026-11-20T09:30:00-03:00' });
  t('reprogramado: actualiza el mismo evento', await cal.asegurarEvento('x@g.com', movido, d1) === 'actualizado'
    && api1.eventos[ev.id].start.dateTime === '2026-11-20T09:00:00-03:00' && Object.keys(api1.eventos).length === 1);

  api1.eventos[ev.id].status = 'cancelled';
  t('si el usuario lo borro, no se lo vuelve a poner', await cal.asegurarEvento('x@g.com', movido, d1) === 'borrado');

  // errores con remedio
  cal.limpiarCache();
  let e1 = null;
  try { await cal.asegurarEvento('x@g.com', ev, { entorno: ENV, fetch: apiCalendar({ sinCompartir: true }).fetch }); } catch (e) { e1 = e; }
  t('calendario sin compartir dice como compartirlo', e1 && e1.codigo === 'CALENDARIO_NO_COMPARTIDO' && /Hacer cambios en eventos/.test(e1.message));
  let e2 = null;
  try { await cal.asegurarEvento('x@g.com', ev, { entorno: ENV, fetch: apiCalendar({ apiApagada: true }).fetch }); } catch (e) { e2 = e; }
  t('API apagada se distingue de falta de permiso', e2 && e2.codigo === 'CALENDAR_API_APAGADA');
  cal.limpiarCache();
  let e3 = null;
  try { await cal.asegurarEvento('x@g.com', ev, { entorno: {}, fetch: api1.fetch }); } catch (e) { e3 = e; }
  t('sin credenciales avisa antes de salir a la red', e3 && e3.codigo === 'SIN_CREDENCIALES');

  /* ---- 5 · la corrida ---------------------------------------------- */
  cal.limpiarCache();
  const api2 = apiCalendar();
  const dEj = { entorno: ENV, fetch: api2.fetch, calendario: cal, ahora: AHORA };
  const r1 = await A.ejecutar(PERFIL, partidos, dEj);
  t('primera corrida crea las 3', r1.resumen.creadas === 3 && r1.errores.length === 0, r1);
  t('reporta la atrasada con el dia en que debio avisar', r1.atrasadas.length === 1 && r1.atrasadas[0].debioAvisarEl === '2026-10-30', r1.atrasadas);
  const r2 = await A.ejecutar(PERFIL, partidos, dEj);
  t('segunda corrida no crea nada (idempotente)', r2.resumen.creadas === 0 && r2.resumen.iguales === 3 && Object.keys(api2.eventos).length === 3, r2.resumen);
  const r3 = await A.ejecutar(PERFIL, [P('2026-11-25', 'JUJUY BASQUET', 'HINDU (C)'), partidos[1], partidos[5]], dEj);
  t('un cambio de fecha en el fixture actualiza, no duplica', r3.resumen.actualizadas === 1 && Object.keys(api2.eventos).length === 3, r3.resumen);

  cal.limpiarCache();
  const apiSin = apiCalendar({ sinCompartir: true });
  const r4 = await A.ejecutar(PERFIL, partidos, { entorno: ENV, fetch: apiSin.fetch, calendario: cal, ahora: AHORA });
  t('un problema de permiso corta a la primera, no repite el rechazo', r4.errores.length === 1 && r4.errores[0].codigo === 'CALENDARIO_NO_COMPARTIDO', r4.errores);

  /* ---- 6 · el cron --------------------------------------------------- */
  const sinSecreto = await api.manejarCronAlertasPartidos({ headers: {} }, { env: {} });
  t('sin CRON_SECRET la ruta no corre', sinSecreto.status === 503 && sinSecreto.body.codigo === 'SIN_CRON_SECRET');
  const malSecreto = await api.manejarCronAlertasPartidos({ headers: { authorization: 'Bearer otro' } }, { env: { CRON_SECRET: 'bueno-bueno-bueno' } });
  t('con un secreto equivocado es 401', malSecreto.status === 401);

  // Fixture ilegible y sin copia: 502 y el calendario NO se toca.
  cal.limpiarCache();
  const apiNo = apiCalendar();
  const kvVacio = { leer: async () => ({ valor: null }), escribir: async () => {}, configurado: () => true };
  const caido = async () => { throw new Error('sin red'); };
  const cat = require('./server/lib/catalogo.js');
  const cargarOriginal = cat.cargar;
  cat.cargar = async () => ({ catalogo: {} });
  const rc = await api.manejarCronAlertasPartidos({ headers: { authorization: 'Bearer secreto-largo-1234' } },
    { env: { CRON_SECRET: 'secreto-largo-1234' }, kv: kvVacio, fetch: caido, calendario: cal, entorno: ENV });
  cat.cargar = cargarOriginal;
  t('fixture ilegible y sin copia: 502 y cero llamadas a Calendar', rc.status === 502 && rc.body.perfiles[0].codigo === 'FIXTURE'
    && apiNo.llamadas.length === 0, rc.body);

  // Con una lectura guardada vencida, se usa (la fuente se cayo).
  const guardado = { actualizado: '2020-01-01T00:00:00Z', zonas: { norte: { partidos: [P('2026-11-20', 'JUJUY BASQUET', 'HINDU (C)')] } } };
  const kvViejo = { leer: async () => ({ valor: guardado }), escribir: async () => {}, configurado: () => true };
  cal.limpiarCache();
  const apiOk = apiCalendar();
  cat.cargar = async () => ({ catalogo: {} });
  const rv = await api.manejarCronAlertasPartidos({ headers: { authorization: 'Bearer secreto-largo-1234' } },
    { env: { CRON_SECRET: 'secreto-largo-1234', ALERTAS_CALENDAR_ID: 'otro@gmail.com' }, kv: kvViejo, fetch: async (u, i) => {
      if (/oauth2/.test(u)) return apiOk.fetch(u, i);
      if (/calendar/.test(u)) return apiOk.fetch(u, i);
      throw new Error('fuente caida');
    }, calendario: cal, entorno: ENV, ahora: AHORA });
  cat.cargar = cargarOriginal;
  t('la fuente cae pero hay copia vieja: se usa y crea la alerta', rv.status === 200 && rv.body.perfiles[0].origen === 'kv-vencido'
    && rv.body.perfiles[0].resumen.creadas === 1 && /otro%40gmail\.com/.test(apiOk.llamadas.join('\n')), rv.body);

  /* ---- 7 · simular=1 · el plan sin escribir nada ---------------------- */
  cal.limpiarCache();
  const apiSim = apiCalendar();
  const rsim = await A.ejecutar(PERFIL, partidos, { entorno: {}, fetch: apiSim.fetch, calendario: cal, ahora: AHORA, simular: true });
  t('simular no hace NINGUNA llamada (ni token ni Calendar) y no pide credenciales', apiSim.llamadas.length === 0 && rsim.simulacion === true && rsim.errores.length === 0, apiSim.llamadas);
  t('simular muestra lo que crearia, con el dia y la hora del aviso', rsim.alertas.length === 3 && rsim.alertas[0].avisaEl === '2026-11-16T09:00:00-03:00' && rsim.alertas[0].id === plan.alertas[0].id && rsim.atrasadas.length === 1, rsim);
  t('simular y la corrida real planifican lo mismo', JSON.stringify(rsim.alertas.map(a => a.id)) === JSON.stringify(plan.alertas.map(a => a.id)));

  const escrituras = [];
  const kvEsc = { leer: async () => ({ valor: null }), escribir: async (...a) => { escrituras.push(a); }, configurado: () => true };
  const catV = require('./server/lib/catalogo.js');
  const fixtureApi = require('./server/rutas/fixture.js');
  const refrescarOriginal = fixtureApi.refrescar;
  fixtureApi.refrescar = async () => ({ zonas: { norte: { partidos: partidos } }, fallaron: [] });
  const cargarO = catV.cargar;
  catV.cargar = async () => ({ catalogo: {} });
  const apiSim2 = apiCalendar();
  const reqSim = { headers: { authorization: 'Bearer secreto-largo-1234' }, query: { simular: '1' } };
  const rs = await api.manejarCronAlertasPartidos(reqSim, { env: { CRON_SECRET: 'secreto-largo-1234' }, kv: kvEsc, fetch: apiSim2.fetch, calendario: cal, entorno: ENV, ahora: AHORA });
  t('el cron en simulacion: 200, no escribe en Calendar ni en KV', rs.status === 200 && rs.body.perfiles[0].simulacion === true
    && apiSim2.llamadas.length === 0 && escrituras.length === 0, { st: rs.status, ll: apiSim2.llamadas.length, esc: escrituras.length });
  const rr = await api.manejarCronAlertasPartidos({ headers: reqSim.headers, query: {} }, { env: { CRON_SECRET: 'secreto-largo-1234' }, kv: kvEsc, fetch: apiSim2.fetch, calendario: cal, entorno: ENV, ahora: AHORA });
  t('sin simular el mismo pedido SI escribe (la guarda no es decorativa)', rr.body.perfiles[0].resumen && rr.body.perfiles[0].resumen.creadas === 3 && escrituras.length === 1, rr.body);
  fixtureApi.refrescar = refrescarOriginal;
  catV.cargar = cargarO;

  console.log(mal ? '\nFALLARON ' + mal + ' de ' + (ok + mal) : '\n' + ok + ' tests OK');
  process.exit(mal ? 1 : 0);
})();
