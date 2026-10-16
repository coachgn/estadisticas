/* =====================================================================
   test-fixture-auto.js · los conectores de fixture que se pegan desde el
   Panel Master: Volcala, la página de «jornadas» de una federación y el
   modo `auto` que elige el lector por el sitio (punto 126).

     node test-fixture-auto.js

   LAS FIXTURES SON MARKUP REAL de Bahía Blanca, 2026-10-16
   (`test-fixtures/bahia/`): de Volcala, el <script> del payload que trae
   los partidos; de la ABB, el cuerpo de la nota. Byte a byte.
   ===================================================================== */
'use strict';

const fs = require('fs');
global.SGADD = require('./js/sgadd-core.js');
const F = require('./server/lib/fixture-fuentes.js');
const API = require('./server/api/fixture.js');
const TORNEOS = require('./server/lib/torneos.js');
const PANEL = require('./js/sgadd-fixture.js');
const UI = require('./js/sgadd-torneos.js');
const CORE = global.SGADD;

let ok = 0, mal = 0;
function check(n, cond, det) {
  if (cond) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (det !== undefined ? '  → ' + JSON.stringify(det) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const VOLCALA = fs.readFileSync('test-fixtures/bahia/volcala-bahia-primera.html', 'utf8');
const ABB = fs.readFileSync('test-fixtures/bahia/abb-fixture-lbb-oro.html', 'utf8');
const DOC = JSON.parse(fs.readFileSync('torneos/bahia-blanca-2026.json', 'utf8'));
const HOY = '2026-10-16';
const URL_V = 'https://www.volcala.com/bahia-primera';
const URL_A = 'https://abbasquet.com/fixture-primera-division-abb-bahia-blanca/';

seccion('1 · Volcala · el JSON de la app');
{
  const r = F.parsearVolcala(VOLCALA, { zona: 'oro' });
  check('lee los 163 partidos de la temporada', r.partidos.length === 163, r.partidos.length);
  check('sin avisos', r.avisos.length === 0, r.avisos);
  const jug = r.partidos.filter(p => p.estado === 'FINALIZADO');
  const por = r.partidos.filter(p => p.estado === 'PROGRAMADO');
  check('151 jugados con su marcador', jug.length === 151 && jug.every(p => Number.isInteger(p.ptsLocal) && Number.isInteger(p.ptsVisitante)), jug.length);
  check('12 por jugar, SIN marcador inventado', por.length === 12 && por.every(p => p.ptsLocal === null), por.length);
  const n1 = r.partidos.find(p => p.fecha === '2026-03-19' && p.local === 'Napostá');
  check('el primer partido: Napostá 80-76 Liniers, 21:00, Fecha 1', n1 && n1.ptsLocal === 80 && n1.ptsVisitante === 76
    && n1.hora === '21:00' && n1.ronda === 'Fecha 1' && n1.visitante === 'Liniers', n1);
  check('Volcala publica la cancha, y viaja', /NAPOSTA - AV\. ALEM 320/.test(n1.sede || ''), n1 && n1.sede);
  check('ningún «$undefined» se cuela en un campo', !JSON.stringify(r.partidos).includes('$undefined'));
  const inst = {};
  r.partidos.forEach((p) => { const k = p.instancia.id + '|' + (p.instancia.etapa || ''); inst[k] = (inst[k] || 0) + 1; });
  check('las instancias: 132 de fase regular y los playoffs del Apertura', inst['REGULAR|'] === 132
    && inst['OCTAVOS|Apertura'] === 10 && inst['CUARTOS|Apertura'] === 11 && inst['SEMIFINAL|Apertura'] === 5
    && inst['FINAL|Apertura'] === 5, inst);
  check('ordenado por fecha', r.partidos.every((p, i, a) => !i || a[i - 1].fecha <= p.fecha));
  /* Un partido EN JUEGO trae el parcial en el mismo campo que el resultado. */
  const vivo = VOLCALA.replace('"event_status\\":\\"Finished\\"', '"event_status\\":\\"Live\\"');
  const rv = F.parsearVolcala(vivo, {});
  const enJuego = rv.partidos.find(p => p.estado === 'EN_JUEGO');
  check('un partido en juego NO se da por jugado con el parcial', enJuego && enJuego.ptsLocal === null, enJuego);
  const sin = F.parsearVolcala('<html><body>sin app</body></html>', {});
  check('una página sin el payload: cero partidos y lo dice', !sin.partidos.length && /payload/.test(sin.avisos[0]), sin.avisos);
  check('`categoria` filtra por la liga de volcala', F.parsearVolcala(VOLCALA, { categoria: 'otra-liga' }).partidos.length === 0);
}

seccion('2 · La página de jornadas (la nota de la ABB)');
{
  const r = F.parsearJornadas(ABB, { zona: 'oro', hoy: HOY });
  check('las 11 jornadas de 6 partidos', r.partidos.length === 66, r.partidos.length);
  check('todas estructurales y por jugar, sin hora ni marcador', r.partidos.every(p => p.estructural && p.estado === 'PROGRAMADO'
    && p.hora === null && p.ptsLocal === null));
  const j1 = r.partidos.filter(p => p.ronda === 'Jornada 1');
  check('la Jornada 1 es el 20/08/2026 (el año sale de «Inicio: 20/08/2026»)', j1.length === 6 && j1.every(p => p.fecha === '2026-08-20'), j1.map(p => p.fecha));
  check('la Jornada 11 es el 29/10', r.partidos.filter(p => p.ronda === 'Jornada 11').every(p => p.fecha === '2026-10-29'));
  check('un cruce sin espacio antes del guion («Olimpo –Liniers») se lee igual',
    r.partidos.some(p => p.local === 'Olimpo' && p.visitante === 'Liniers'));
  check('la prosa del reglamento no se cuela como partido', !r.partidos.some(p => /disput|clasific|ganador/i.test(p.local + p.visitante)));
  const e = {};
  r.estructura.forEach((x) => { e[x.instancia] = x; });
  check('la estructura: play-in, cuartos, semis, final, final extra, permanencia y promoción',
    ['PLAYIN', 'CUARTOS', 'SEMIFINAL', 'FINAL', 'FINAL_EXTRA', 'PERMANENCIA', 'PROMOCION'].every(k => e[k]), Object.keys(e));
  check('«Play-In» partido en tres <u> se reconoce', !!e.PLAYIN);
  check('cuartos: 09/11, 12/11 y 16/11 al mejor de tres', e.CUARTOS && e.CUARTOS.fechas.join() === '2026-11-09,2026-11-12,2026-11-16'
    && e.CUARTOS.mejorDe === 3, e.CUARTOS);
  check('la final dice «al mejor de» SIN número: no se inventa', e.FINAL && e.FINAL.mejorDe === null && e.FINAL.fechas.length === 5, e.FINAL);
  check('el play-in solo trae el día que la nota completa (05/11)', e.PLAYIN && e.PLAYIN.fechas.join() === '2026-11-05', e.PLAYIN);
  check('una regla con números («Del 7° al 10° … Play-In») no abre una sección duplicada',
    r.estructura.filter(x => x.instancia === 'PLAYIN').length === 1);
  const vacia = F.parsearJornadas('<p>Hola</p>', { hoy: HOY });
  check('una página sin jornadas lo dice', !vacia.partidos.length && /jornada/i.test(vacia.avisos[0]));
}

seccion('3 · El modo `auto` · cada link con su lector');
{
  check('volcala.com → volcala', F.adaptadorDeUrl(URL_V) === F.ADAPTADORES.volcala);
  check('basket-club.com → basket-club', F.adaptadorDeUrl('https://basket-club.com/torneos/x') === F.ADAPTADORES['basket-club']);
  check('apdeb.com.ar → apdeb', F.adaptadorDeUrl('http://www.apdeb.com.ar/SUB23.html') === F.ADAPTADORES.apdeb);
  check('cualquier otro sitio → jornadas', F.adaptadorDeUrl(URL_A) === F.ADAPTADORES.jornadas);
  check('un link roto → jornadas, sin romper', F.adaptadorDeUrl('no es un link') === F.ADAPTADORES.jornadas);
  check('un sitio que solo CONTIENE el nombre no se confunde', F.adaptadorDeUrl('https://volcala.com.falso.net/x') === F.ADAPTADORES.jornadas);
  const cfg = F.configDe({ fixture: { adaptador: 'auto', zonas: { oro: { urls: [URL_V, URL_A] } } } });
  check('configDe acepta `auto` con varias URLs', cfg && cfg.adaptador === 'auto' && cfg.zonas.oro.urls.length === 2, cfg);
  check('el panel conoce los mismos sitios que el servidor', UI.LECTORES.length === 3
    && UI.lectorDeUrl(URL_V) === 'Volcala' && UI.lectorDeUrl('https://basket-club.com/a') === 'basket-club'
    && UI.lectorDeUrl('http://apdeb.com.ar/a') === 'APdeB' && /jornadas/.test(UI.lectorDeUrl(URL_A)));
}

let ZONA = null;
async function servidor() {
  seccion('4 · El servidor · las dos fuentes juntas');
  const pag = { [URL_V]: VOLCALA, [URL_A]: ABB };
  const urls = [];
  const deps = { fetch: async (u) => { urls.push(u); return { ok: true, status: 200, text: async () => pag[u] }; } };
  const r = await API.refrescar({ adaptador: 'auto', zonas: { oro: { urls: [URL_V, URL_A] } } }, deps, HOY);
  check('bajó las dos páginas', urls.length === 2);
  check('ninguna zona falló', r.fallaron.length === 0, r.fallaron);
  ZONA = r.zonas.oro;
  const est = ZONA.partidos.filter(p => p.estructural);
  /* La ABB y Volcala escriben igual 54 de los 66 cruces: esos se van. Los
     12 que quedan son «Leandro Alem» y «Oimpo» (así los escribe la ABB) y
     se resuelven en el panel, con los alias del torneo. */
  check('la jornada planificada que Volcala ya tiene se descarta (quedan solo las de nombre distinto)',
    est.length === 12 && est.every(p => /Leandro Alem|Oimpo/.test(p.local + p.visitante)), est.length);
  check('la Jornada 10 (22/10) cae aunque Volcala la tenga el 27/10',
    !est.some(p => p.fecha === '2026-10-22' && /Estrella/.test(p.local)));
  check('la estructura de la ABB viaja con la zona', (ZONA.estructura || []).length === 7);
  /* La ventana: un estructural sin cruce real cerca SE QUEDA. */
  const solo = API.sinEstructuralesCubiertos([
    { fecha: '2026-08-20', local: 'A', visitante: 'B', estructural: true },
    { fecha: '2026-09-20', local: 'B', visitante: 'A' },
  ]);
  check('a más de 14 días el estructural se queda (es el respaldo)', solo.length === 2);
  const cubierto = API.sinEstructuralesCubiertos([
    { fecha: '2026-08-20', local: 'A', visitante: 'B', estructural: true },
    { fecha: '2026-08-30', local: 'B', visitante: 'A' },
  ]);
  check('a 10 días, con el par dado vuelta, se va', cubierto.length === 1 && !cubierto[0].estructural);
}

function panel() {
  seccion('5 · El panel · alias, estructura y lo que falta jugar');
  const a = PANEL.agenda({ torneo: DOC, zona: 'oro', idx: null, equipo: 'NAPOSTA', hoy: HOY,
    fuente: ZONA.partidos, estructura: ZONA.estructura });
  check('con los alias del torneo no queda ningún estructural duplicado', a.partidos.filter(p => p.estructural).length === 0,
    a.partidos.filter(p => p.estructural).map(p => p.fecha + ' ' + p.local + '-' + p.visitante));
  check('163 partidos: ninguno dos veces', a.total === 163, a.total);
  const claves = new Set(DOC.zonas.oro.equipos.map(e => CORE.claveEquipo(e.nombre)));
  check('los 12 equipos de Volcala cruzan con los del libro', a.partidos.every(p => claves.has(p.localClave) && claves.has(p.visitanteClave)));
  check('el próximo de Napostá: Estrella, 27/10', a.proximo && a.proximo.fecha === '2026-10-27' && a.proximo.rivalClave === 'ESTRELLA', a.proximo);
  const fases = a.estructura;
  check('la estructura arranca por la fase regular, en curso', fases[0].id === 'REGULAR' && fases[0].estado === 'en-curso'
    && fases[0].jugados === 120 && fases[0].porJugar === 12, fases[0]);
  check('los playoffs del Apertura, jugados', ['OCTAVOS', 'CUARTOS', 'SEMIFINAL', 'FINAL'].every(id =>
    fases.some(g => g.id === id && g.etapa === 'Apertura' && g.estado === 'jugada')));
  const cuartosNov = fases.find(g => g.id === 'CUARTOS' && g.anunciada);
  check('los cuartos de noviembre: anunciados, con sus días y la serie, sin cruces', cuartosNov
    && cuartosNov.desde === '2026-11-09' && cuartosNov.mejorDe === 3 && cuartosNov.estado === 'por-jugar', cuartosNov);
  check('los cuartos de junio NO tapan a los de noviembre (otros días)', fases.filter(g => g.id === 'CUARTOS').length === 2);
  check('sin instancias no hay bloque', PANEL.estructuraTorneo([{ fecha: '2026-01-01' }], [], HOY).length === 0);
  const html = PANEL.bloqueEstructura(a);
  check('el bloque dice «Cruces a definir» en las fases anunciadas', /Cruces a definir/.test(html));
  check('y nombra la fase en curso con texto, no solo con color', /en curso/.test(html));
  const fila = PANEL.tabla([a.proximo], 'NAPOSTA');
  check('lo que falta jugar lleva la marca y el texto «por jugar»', /fila-por-jugar/.test(fila) && /por jugar/.test(fila));
  check('la ronda va debajo de la fecha', /Fecha 21/.test(fila));
  check('la cancha en el title de la fila', /title="Cancha: ESTRELLA/.test(fila), fila.slice(0, 200));
  const jugada = PANEL.tabla([a.mios.find(p => p.jugado)], 'NAPOSTA');
  check('un partido jugado no lleva la marca', !/fila-por-jugar/.test(jugada));
  check('una ronda larga se lee como su instancia', PANEL.rondaCorta({ ronda: 'Torneo Apertura - LBB ORO - Cuartos de Final',
    instancia: { id: 'CUARTOS', label: 'Cuartos de final', etapa: 'Apertura' } }) === 'Cuartos de final · Apertura');
}

function panelMaster() {
  seccion('6 · Panel Master · pegar los links');
  const t = { id: 'bahia-blanca-2026', nombre: 'Bahía', categorias: [{ slug: 'x', label: 'Oro', zona: 'oro' }],
    fixture: { adaptador: 'apdeb', desde: '2026-03-01', zonas: { oro: { urls: ['http://www.apdeb.com.ar/a.html'], categoria: 'U21' } } } };
  check('textoDeFixture devuelve un link por renglón', UI.textoDeFixture(t).oro === 'http://www.apdeb.com.ar/a.html');
  const i = UI.intencionFixture(t, { oro: URL_V + '\n' + URL_A + '\n' });
  check('la intención: `auto`, los dos links, y conserva la categoría y el piso',
    i.accion === 'torneo' && i.fixture.adaptador === 'auto' && i.fixture.zonas.oro.urls.length === 2
    && i.fixture.zonas.oro.categoria === 'U21' && i.fixture.desde === '2026-03-01', i);
  check('sin ningún link, la fuente se BORRA (vuelve el calendario del archivo)', UI.intencionFixture(t, { oro: '  ' }).fixture === null);
  check('un renglón que no es link se denuncia', UI.linksInvalidos('https://ok.com/a\nwww.sinesquema.com').join() === 'www.sinesquema.com');

  /* EL SERVIDOR VALIDA con el mismo `configDe` que lee. */
  const base = TORNEOS.torneo({}, { club: 'bahia-test', nombre: 'BB', zonas: { oro: { slug: 'bb-oro', label: 'Oro', equipos: [{ nombre: 'NAPOSTA' }] } } }).catalogo;
  const bien = TORNEOS.torneo(base, { club: 'bahia-test', nombre: 'BB', fixture: i.fixture });
  check('el servidor guarda la fuente', bien.ok && bien.catalogo['bahia-test'].fixture.adaptador === 'auto');
  check('rechaza una zona que el torneo no tiene', /plata/.test(TORNEOS.torneo(base, { club: 'bahia-test', nombre: 'BB',
    fixture: { adaptador: 'auto', zonas: { plata: { urls: [URL_V] } } } }).motivo || ''));
  check('rechaza una fuente sin ningún link válido', !TORNEOS.torneo(base, { club: 'bahia-test', nombre: 'BB',
    fixture: { adaptador: 'auto', zonas: { oro: { urls: ['ftp://x'] } } } }).ok);
  const borrar = TORNEOS.torneo(bien.catalogo, { club: 'bahia-test', nombre: 'BB', fixture: null });
  check('`fixture: null` la borra', borrar.ok && borrar.catalogo['bahia-test'].fixture === undefined);
  const CAT = require('./server/lib/catalogo.js');
  const pub = CAT.publico(bien.catalogo, { admin: true });
  const lista = Array.isArray(pub) ? pub : (pub.clubes || []);
  const t2 = lista.find(x => x.id === 'bahia-test');
  check('el admin recibe la fuente en el catálogo (para editarla)', t2 && t2.fixture && t2.fixture.adaptador === 'auto', t2 && Object.keys(t2));
}

async function datos() {
  seccion('7 · «Probar» pide la fuente con ?refrescar=1');
  const DATA = require('./js/sgadd-data.js');
  const AUTH = require('./js/sgadd-auth.js');
  DATA.configurar('http://api.test');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  AUTH.establecerToken(b64({ alg: 'HS256' }) + '.' + b64({ email: 'admin@test.com', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.f');
  let url = '';
  const fake = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ ok: true, zonas: {} }) }; };
  await DATA.fixtureDeTorneo('bahia-blanca-2026', null, { fetch: fake, refrescar: true });
  check('sin zona: /fixture/<torneo>?refrescar=1', /\/api\/v1\/fixture\/bahia-blanca-2026\?refrescar=1$/.test(url), url);
  await DATA.fixtureDeTorneo('bahia-blanca-2026', 'oro', { fetch: fake });
  check('sin refrescar, la URL de siempre', /\?zona=oro$/.test(url), url);
  if (AUTH.limpiarToken) AUTH.limpiarToken();
}

(async () => {
  await servidor();
  panel();
  panelMaster();
  await datos();
  console.log('\n' + (mal ? '✗ HAY FALLAS · ' : '✓ TODO OK · ') + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
