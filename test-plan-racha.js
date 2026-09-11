/* =====================================================================
   test-plan-racha.js · tres correcciones del 2026-09-11

   1. LA RACHA ignoraba los partidos sin estadísticas: uno cargado a mano
      no la cortaba ni la estiraba.
   2. EL PLAN: un club que el Panel Master muestra en Bronce lucía «◆ Plan
      ORO · Auditoria MotorStats activa». Sin plan en el catálogo mandaba
      el del token —el del admin, ORO—, y el menú del cliente decidía con
      el plan de su link en vez del de su club.
   3. EL DESTELLO ROJO: en cada F5 de un club sin `clubes/<id>.json` salía
      «Configuración del club no encontrada» y el catálogo lo retiraba un
      instante después.
   ===================================================================== */
'use strict';

const fs = require('fs');
const vm = require('vm');
const NL = '\n';
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

const CORE = require('./js/sgadd-core.js');
global.SGADD = CORE;
const CLASIF = require('./js/sgadd-clasificacion.js');
const idxHtml = fs.readFileSync('./index.html', 'utf8');

(async () => {

/* =====================================================================
   1 · LA RACHA
   ===================================================================== */
titulo('1 · LA RACHA · los partidos sin estadísticas entran en su fecha');
{
  const F = (s) => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const P = (fecha, res) => ({ RESULTADO: res, __fecha: fecha ? F(fecha) : null });
  const M = (fecha, gano) => ({ fecha: fecha, gano: gano, rol: 'Local', rival: 'X', puntosPropios: 1, puntosRival: 0 });
  const box = [P('2026-05-01', 'GANADO'), P('2026-05-08', 'GANADO'), P('2026-05-15', 'PERDIDO'), P('2026-05-22', 'PERDIDO')];
  const R = (x) => x ? x.tipo + ' ' + x.n : 'null';

  check('sin manuales es la racha del núcleo: 2 perdidos', R(CLASIF.rachaConManuales(box, [])) === 'PERDIDO 2');
  check('una derrota manual DESPUÉS la estira a 3',
    R(CLASIF.rachaConManuales(box, [M('2026-07-09', false)])) === 'PERDIDO 3');
  check('un triunfo manual después la CORTA: 1 ganado',
    R(CLASIF.rachaConManuales(box, [M('2026-07-09', true)])) === 'GANADO 1');
  check('uno manual en el MEDIO entra en su fecha y no toca el final',
    R(CLASIF.rachaConManuales(box, [M('2026-05-10', true)])) === 'PERDIDO 2');
  check('uno manual entre las dos derrotas corta la racha',
    R(CLASIF.rachaConManuales(box, [M('2026-05-18', true)])) === 'PERDIDO 1');
  check('dos manuales seguidos al final', R(CLASIF.rachaConManuales(box,
    [M('2026-07-16', true), M('2026-07-09', true)])) === 'GANADO 2');
  check('solo con partidos manuales también hay racha',
    R(CLASIF.rachaConManuales([], [M('2026-07-09', false), M('2026-07-02', false)])) === 'PERDIDO 2');
  check('los partidos SIN FECHA van al final, como en el núcleo',
    R(CLASIF.rachaConManuales([P(null, 'GANADO')], [M('2026-07-09', false)])) === 'GANADO 1');
  check('mismo día: primero el que tiene box score',
    R(CLASIF.rachaConManuales([P('2026-07-09', 'GANADO')], [M('2026-07-09', false)])) === 'PERDIDO 1');
  check('sin resultados, sin racha', CLASIF.rachaConManuales([{ RESULTADO: '' }], []) === null);

  /* El helper de pantalla, con los manuales del tramo abierto. */
  const src = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
  const e = { clave: 'UNIVERSITARIO', nombre: 'UNIVERSITARIO', partidos: box,
    record: { ganados: 2, perdidos: 2, pj: 4 }, totales: { propio: { PTS: 300 }, rival: { PTS: 310 } },
    split: { LOCAL: { ganados: 2, perdidos: 0 }, VISITANTE: { ganados: 0, perdidos: 2 } } };
  const idx = { lista: () => [e] };
  const ctx = {
    console, Map, Date, SGADD: CORE,
    SGADD_CONFIG: { clubActivo: () => 'universitario', deCategoria: (m) => m['universitario-primera'] || null },
    SGADD_CLIENTES: { estado: { clubes: [{ id: 'universitario', partidosManuales: { 'universitario-primera': {
      'IDA|REGULAR': [{ id: 'm1', fecha: '2026-07-09', local: 'UNIVERSITARIO', puntosLocal: 70,
        visitante: "ATENAS 'B'", puntosVisitante: 60 }] } } }] } },
    SGADD_APP: { estado: { torneo: '*TOTAL*', fase: 'REGULAR' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  check('en la ficha, el triunfo manual del 09/07 corta la racha de derrotas',
    R(ctx.clasifRachaDe(idx, e)) === 'GANADO 1', R(ctx.clasifRachaDe(idx, e)));
  ctx.SGADD_APP.estado.torneo = 'VUELTA';
  check('en la VUELTA ese partido de la IDA no cuenta', R(ctx.clasifRachaDe(idx, e)) === 'PERDIDO 2');

  const eq = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
  const header = eq.slice(eq.indexOf('function equiposHeader'), eq.indexOf('function equiposHeader') + 3000);
  check('el encabezado de la ficha usa la racha con los manuales', /clasifRachaDe\(idx, e\)/.test(header));
}

/* =====================================================================
   2 · EL PLAN
   ===================================================================== */
titulo('2 · EL PLAN · el del catálogo, estricto, en el servidor y en el panel');
{
  const H = require('./server/api/handlers.js');
  check('con el catálogo de KV, un club SIN plan es BRONCE aunque el link diga ORO',
    H.planEfectivo({}, { plan: 'ORO' }, 'kv') === 'BRONCE');
  check('con plan en el club manda el del club, en los dos sentidos',
    H.planEfectivo({ plan: 'PLATA' }, { plan: 'ORO' }, 'kv') === 'PLATA'
    && H.planEfectivo({ plan: 'ORO' }, { plan: 'BRONCE' }, 'kv') === 'ORO');
  check('con el catálogo de RESPALDO (KV caído), sin plan manda el del link',
    H.planEfectivo({}, { plan: 'PLATA' }, 'codigo') === 'PLATA' && H.planEfectivo({}, { plan: 'PLATA' }, 'env') === 'PLATA');

  const CATV = require('./server/lib/catalogo.js');
  const auth = require('./server/lib/auth.js');
  const SH = '14tjg3AbCdEfGhIjKlMnOpQrStUvWxYz0123leaQ';
  const VIG = {
    universitario: { nombre: 'Universitario', categorias: { 'universitario-primera': { label: 'P', sheetId: SH } } },
    sudamerica: { nombre: 'Sud América', plan: 'ORO', categorias: { 'sudamerica-primera': { label: 'P', sheetId: SH } } },
    deportivo: { nombre: 'Deportivo', plan: 'PLATA', categorias: { 'deportivo-primera': { label: 'P', sheetId: SH } } },
  };
  const link = (club, plan) => new URL(auth.generarLinkCliente({ base: 'https://x/', email: 'dt@' + club + '.com',
    club: club, equipo: 'X', plan: plan, expiraEn: '1h' }).url).searchParams.get('access_token');
  const pedir = (tok) => ({ headers: { authorization: 'Bearer ' + tok }, query: {} });
  const orig = CATV.cargar;
  try {
    CATV.cargar = async () => ({ catalogo: VIG, origen: 'kv' });
    const u = await H.manejarCatalogo(pedir(link('universitario', 'ORO')));
    check('el catálogo le dice a Universitario (sin plan) que es BRONCE, aunque su link diga ORO',
      u.status === 200 && u.body.usuario.plan === 'BRONCE', JSON.stringify(u.body.usuario));
    const s = await H.manejarCatalogo(pedir(link('sudamerica', 'BRONCE')));
    check('a Sud América (ORO) le dice ORO aunque su link diga Bronce', s.body.usuario.plan === 'ORO');
    const d = await H.manejarCatalogo(pedir(link('deportivo', 'ORO')));
    check('a DEPORTIVO (PLATA) le dice PLATA', d.body.usuario.plan === 'PLATA');
    const a = await H.manejarCatalogo(pedir(auth.firmarToken({ email: 'freytesgn@gmail.com', plan: 'ORO' }, { expiraEn: '1h' })));
    check('el admin, sin club en el token, conserva el suyo', a.body.usuario.plan === 'ORO');
    CATV.cargar = async () => ({ catalogo: VIG, origen: 'codigo' });
    const r = await H.manejarCatalogo(pedir(link('universitario', 'PLATA')));
    check('con el respaldo, el del link', r.body.usuario.plan === 'PLATA');
  } finally { CATV.cargar = orig; }

  const src = fs.readFileSync('./server/api/handlers.js', 'utf8');
  check('los datos (equipos) y el scouting miden el plan con el origen del catálogo',
    (src.match(/planEfectivo\(cat\.suscripcion \|\| \{\}, ctx\.sesion, cascada\.origen\)/g) || []).length === 2);
  check('y el scouting declara el EFECTIVO, no el del token', /alcance: \{ rol: ctx\.rol, plan: sesionEfectiva\.plan \}/.test(src));

  /* LA SESIÓN DEL PANEL lo adopta. */
  const AUTH = require('./js/sgadd-auth.js');
  AUTH.establecerSesion({ email: 'dt@universitario.com', plan: 'ORO', equipoAsignado: 'UNIVERSITARIO' });
  check('con el plan del link (ORO) el menú ofrece Scouting', AUTH.tieneModulo('scouting'));
  check('al adoptar el efectivo dice que cambió', AUTH.fijarPlanEfectivo('BRONCE') === true);
  check('la sesión queda en BRONCE', AUTH.sesion().plan === 'BRONCE');
  check('Scouting pasa a pedir plan, que es lo que el servidor hace cumplir',
    !AUTH.tieneModulo('scouting') && AUTH.puedoAcceder('scouting').motivo === AUTH.MOTIVOS.REQUIERE_PLAN);
  check('el pie dice el plan de verdad', /Bronce/.test(AUTH.descripcionSesion().detalle));
  check('adoptar el mismo plan otra vez no cambia nada', AUTH.fijarPlanEfectivo('BRONCE') === false);
  AUTH.limpiarSesion();
  check('sin sesión no hay nada que adoptar', AUTH.fijarPlanEfectivo('ORO') === false);

  const adoptar = idxHtml.slice(idxHtml.indexOf('function adoptarPlanEfectivo'), idxHtml.indexOf('/* EL DISTINTIVO DEL PLAN ORO.'));
  check('el panel lo adopta SOLO para el cliente (al admin le cambiaría su propio pie)',
    /SGADD_AUTH\.rol\(\) !== SGADD_AUTH\.ROLES\.CLIENTE\) return false/.test(adoptar));
  check('y repinta el menú', /aplicarPermisosNav\(\)/.test(adoptar));
  const rec = idxHtml.slice(idxHtml.indexOf('async function reconciliarConCatalogo'), idxHtml.indexOf('const id = CLUB.estado.id;'));
  check('lo adopta desde el catálogo, ANTES del primer pintado', /adoptarPlanEfectivo\(cat\.usuario\.plan\)/.test(rec));
  check('y otra vez con los datos (alcance.plan)',
    /adoptarPlanEfectivo\(estado\.alcance\.plan\)/.test(fs.readFileSync('./js/sgadd-app.js', 'utf8')));

  /* EL DISTINTIVO, ejercido: la función de verdad, sacada del index. */
  const fn = idxHtml.slice(idxHtml.indexOf('function pintarDistintivoPlan()'), idxHtml.indexOf('/* ============ SIDEBAR MÓVIL'));
  const slot = { innerHTML: 'x' };
  const c2 = { SGADD_AUTH: AUTH, SGADD_APP: { estado: { alcance: { plan: 'BRONCE' } } },
    document: { getElementById: () => slot } };
  vm.createContext(c2);
  vm.runInContext(fn + ';this.pintar = pintarDistintivoPlan;', c2);
  c2.pintar();
  check('un club en BRONCE no muestra el distintivo ORO', slot.innerHTML === '');
  c2.SGADD_APP.estado.alcance.plan = 'PLATA'; c2.pintar();
  check('uno en PLATA tampoco', slot.innerHTML === '');
  c2.SGADD_APP.estado.alcance.plan = 'ORO'; c2.pintar();
  check('uno en ORO sí', /Plan ORO/.test(slot.innerHTML));
}

/* =====================================================================
   3 · EL ARRANQUE SIN DESTELLO
   ===================================================================== */
titulo('3 · EL ARRANQUE · el cartel rojo espera al catálogo');

function crearClub(clubId, conApi) {
  const src = fs.readFileSync('./js/sgadd-club.js', 'utf8').replace('const CLUB = (function () {', 'var CLUB = (function () {');
  const nodos = {};
  const ctx = {
    console, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '?club=' + clubId } },
    document: { readyState: 'complete', currentScript: { src: 'https://x/js/sgadd-club.js' },
      getElementsByTagName: () => [], getElementById: (id) => nodos[id] || null,
      documentElement: { style: { setProperty() {} } },
      body: { appendChild(n) { if (n.id) nodos[n.id] = n; } },
      createElement: () => ({ style: {}, remove() { delete nodos[this.id]; } }), addEventListener() {}, title: '' },
    fetch: async () => ({ ok: false, status: 404 }),
    SGADD: { CATALOGO: { patronEquipoPropio: /X/, planillas: [] }, limpiarCache() {}, claveEquipo: CORE.claveEquipo },
    LOGOS: { CFG: { basePaths: [], sufijos: [], overrides: {} }, reset() {}, getUrl: () => null },
    SGADD_DATA: { apiConfigurada: () => conApi },
    SGADD_AUTH: { token: () => (conApi ? 'tok' : null) },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { CLUB: ctx.CLUB, nodos };
}
{
  const a = crearClub('universitario', true);
  await a.CLUB.cargar();
  check('con backend y token, el 404 del JSON NO pinta el cartel (el catálogo puede traerlo)',
    !a.nodos.clubCartelError && a.CLUB.estado.cartelPendiente === true);
  a.CLUB.reconciliar({ id: 'universitario', nombre: 'Universitario', liga: 'la-plata',
    categorias: [{ slug: 'universitario-primera', label: 'Primera 2026', activo: true }] }, { equipoPropio: 'UNIVERSITARIO' });
  check('el catálogo lo trae: la confirmación no muestra nada', a.CLUB.confirmarSinConfig() === false && !a.nodos.clubCartelError);

  const b = crearClub('club-que-no-existe', true);
  await b.CLUB.cargar();
  check('si ni el JSON ni el catálogo lo traen, el cartel sale al confirmar',
    b.CLUB.confirmarSinConfig() === true && !!b.nodos.clubCartelError);
  check('y una sola vez', b.CLUB.confirmarSinConfig() === false);

  const c = crearClub('universitario', false);
  await c.CLUB.cargar();
  check('sin backend sale en el acto, como siempre (no hay nada que esperar)', !!c.nodos.clubCartelError);

  const res = idxHtml.slice(idxHtml.indexOf('async function resolverClubYPlanilla'),
    idxHtml.indexOf('SGADD_APP.inicializar();', idxHtml.indexOf('async function resolverClubYPlanilla')));
  check('el arranque confirma DESPUÉS de cruzar con el catálogo',
    res.indexOf('reconciliarConCatalogo()') !== -1 && res.indexOf('confirmarSinConfig()') > res.indexOf('reconciliarConCatalogo()'));
}

console.log(NL + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
