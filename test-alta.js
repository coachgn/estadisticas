/* =====================================================================
   test-alta.js · el alta de clientes, de punta a punta

   Nació del alta real de Sud América (2026-09-11), que tenía CUATRO
   defectos encadenados y ninguno dejaba un error visible:

     1. el formulario del Panel Master perdía el foco en cada tecla;
     2. el JSON pedía `sud-america-primera` y el catálogo tenía
        `sudamerica-primera` → «No existe esa categoría» en cada hoja;
     3. el equipo propio decía `SUDAMERICA` y el libro `SUD AMERICA LP`
        → el cliente habría visto CERO equipos;
     4. un alta hecha desde la pantalla no alcanzaba: sin un JSON en el
        repo, el panel del cliente cargaba los valores de Reconquista.

   Cada bloque de acá fija uno, y los que se pueden EJERCER se ejercen:
   el bug de tipeo se reproduce sobre un DOM de mentira, no se lee.
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

const M = require('./server/lib/catalogo-mutar.js');
const CATV = require('./server/lib/catalogo.js');
const LIBRO = require('./server/lib/catalogo-libro.js');
const CORE = require('./server/lib/compartido/sgadd-core.js');

/* Un id con forma de id de Google (40+ caracteres base64url). No es el
   real: el test no tiene por qué conocerlo. */
const SHEET_DEP = '14tjg3AbCdEfGhIjKlMnOpQrStUvWxYz0123leaQ';
const SHEET_PRIVADO = '1PrivadoAbCdEfGhIjKlMnOpQrStUvWxYz0999Xy';
const SHEET_NADA = '1NoExisteAbCdEfGhIjKlMnOpQrStUvWxYz000Zz';

const VIG = {
  deportivo: { nombre: 'Deportivo La Plata', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA',
    categorias: { 'deportivo-primera': { label: 'Primera 2026', sheetId: SHEET_DEP, nivel: 'LOCAL_MAYORES' } } },
  sudamerica: { nombre: 'SUDAMERICA', liga: 'la-plata', equipoPropio: 'SUDAMERICA',
    categorias: { 'sudamerica-primera': { label: 'Primera Division', sheetId: SHEET_DEP } } },
};

/* Los doce equipos REALES del libro de DEPORTIVO, como los devuelve
   `equiposDelLibro` (medido el 2026-09-11). */
const EQUIPOS_REALES = ['A. MAYO', 'ATENAS B', 'C.C TOLOSANO', 'C.E.Y E.', 'DEPORTIVO LA PLATA',
  'DEPORTIVO SAN VICENTE', 'HOGAR SOCIAL', 'PLATENSE B', 'SUD AMERICA LP', 'U.N.L.P',
  'UNIVERSITARIO', 'VILLA SAN CARLOS A'].map(c => ({ clave: c, nombre: c + ' - MM', filas: 17 }));

(async () => {

/* =====================================================================
   1 · EL ALTA DEL SERVIDOR · reusar un libro, editar sin perderlo
   ===================================================================== */
titulo('1 · EL ALTA DEL SERVIDOR · reusar un libro y editar sin perderlo');

/* DOS CLIENTES DEL MISMO TORNEO leen el mismo libro. Con `libroDe` el id
   se copia en el servidor y nunca viaja al navegador (punto 29). */
const r1 = M.aplicar(VIG, 'alta', {
  club: 'villa-san-carlos', nombre: 'Villa San Carlos', liga: 'la-plata',
  equipoPropio: 'VILLA SAN CARLOS A', categoria: 'villa-san-carlos-primera',
  label: 'Primera 2026', libroDe: 'deportivo/deportivo-primera',
}, CATV.validar);
check('un cliente nuevo puede usar el libro de otro', r1.ok && r1.creoClub, r1.motivo);
check('y queda con ESE libro',
  r1.ok && r1.catalogo['villa-san-carlos'].categorias['villa-san-carlos-primera'].sheetId === SHEET_DEP);
check('sin que el catálogo público revele el id',
  r1.ok && JSON.stringify(CATV.publico(r1.catalogo, { admin: true })).indexOf(SHEET_DEP) === -1);
check('el catálogo vigente no se tocó', !VIG['villa-san-carlos']);

const r2 = M.aplicar(VIG, 'alta', { club: 'x', nombre: 'X', categoria: 'x-primera',
  label: 'P', libroDe: 'deportivo/no-existe' }, CATV.validar);
check('reusar el libro de una categoría que no existe se rechaza', !r2.ok && /no tiene un libro/.test(r2.motivo), r2.motivo);

/* EDITAR NO PIDE EL LIBRO. El navegador no tiene el id, así que exigirlo
   para corregir una etiqueta obligaría a ir a buscarlo a otro lado. */
const r3 = M.aplicar(VIG, 'alta', { club: 'sudamerica', nombre: 'Sud América La Plata',
  equipoPropio: 'SUD AMERICA LP', categoria: 'sudamerica-primera', label: 'Primera 2026' }, CATV.validar);
const s3 = r3.ok && r3.catalogo.sudamerica;
check('editar un cliente sin mandar el libro funciona', r3.ok, r3.motivo);
check('y CONSERVA el libro que tenía', s3 && s3.categorias['sudamerica-primera'].sheetId === SHEET_DEP);
check('y cambia lo que se mandó (nombre, equipo, etiqueta)',
  s3 && s3.nombre === 'Sud América La Plata' && s3.equipoPropio === 'SUD AMERICA LP'
  && s3.categorias['sudamerica-primera'].label === 'Primera 2026');

/* LA CATEGORÍA SE FUSIONA: reemplazarla por {label, sheetId} borraba el
   `nivel` publicado en silencio. */
const r4 = M.aplicar(VIG, 'alta', { club: 'deportivo', categoria: 'deportivo-primera',
  label: 'Primera · Vuelta' }, CATV.validar);
check('editar la etiqueta NO borra el nivel de la categoría',
  r4.ok && r4.catalogo.deportivo.categorias['deportivo-primera'].nivel === 'LOCAL_MAYORES');

const r5 = M.aplicar(VIG, 'alta', { club: 'deportivo', categoria: 'deportivo-u21', label: 'U21' }, CATV.validar);
check('una categoría NUEVA sin libro se rechaza, diciendo qué falta',
  !r5.ok && /Falta el libro/.test(r5.motivo), r5.motivo);

const r6 = M.aplicar(VIG, 'alta', { club: 'deportivo', categoria: 'deportivo-u21', label: 'U21',
  sheetId: 'https://docs.google.com/spreadsheets/d/' + SHEET_DEP + '/edit' }, CATV.validar);
check('el servidor sigue rechazando la URL entera (la extrae la pantalla)', !r6.ok);

const cli = fs.readFileSync('./server/bin/catalogo.js', 'utf8');
check('la CLI también fusiona la categoría en vez de reemplazarla',
  /cat\[club\]\.categorias\[slug\] = Object\.assign\(\{\}, previa,/.test(cli));

/* =====================================================================
   2 · LOS EQUIPOS DE UN LIBRO · el paso que pedía una terminal
   ===================================================================== */
titulo('2 · LOS EQUIPOS DE UN LIBRO');

const HOJAS = {
  'PROMEDIOS E': [['EQUIPO', 'FASE', 'PTS'],
    ['SUD AMERICA LP - MM', 'REGULAR', 70], ['DEPORTIVO LA PLATA - MM', 'REGULAR', 75],
    ['EQUIPO TIPO', 'TOTAL', 72], ['DEPORTIVO SAN VICENTE - MM', 'REGULAR', 60]],
  'Base Datos E': [['PARTIDO', 'EQUIPO'],
    ['a', 'SUD AMERICA LP - MM'], ['b', 'SUD AMERICA LP - MM'], ['c', "ATENAS 'B' - MM"], ['d', '']],
};
const eqs = LIBRO.equiposDelLibro(HOJAS);
check('salen los equipos, sin repetir y en orden',
  eqs.map(e => e.clave).join('|') === 'ATENAS B|DEPORTIVO LA PLATA|DEPORTIVO SAN VICENTE|SUD AMERICA LP',
  eqs.map(e => e.clave).join('|'));
check('la fila TIPO NO es un equipo', !eqs.some(e => /TIPO/.test(e.clave)));
check('se conserva cómo lo escribe la planilla',
  (eqs.find(e => e.clave === 'SUD AMERICA LP') || {}).nombre === 'SUD AMERICA LP - MM');
check('y en cuántas filas aparece', (eqs.find(e => e.clave === 'SUD AMERICA LP') || {}).filas === 3);
check('un libro sin esas hojas da una lista vacía, no revienta', LIBRO.equiposDelLibro({}).length === 0);

/* EL DEFECTO REAL: `SUDAMERICA` no es el equipo de este libro. */
check('«SUDAMERICA» NO coincide con el libro (el alta real que no andaba)', !LIBRO.coincide('SUDAMERICA', eqs));
check('«SUD AMERICA LP» sí', LIBRO.coincide('SUD AMERICA LP', eqs));
check('y como lo escribe la planilla, con sufijo, también', LIBRO.coincide('Sud America LP - MM', eqs));

/* =====================================================================
   3 · EL ENDPOINT · POST /api/v1/catalogo/equipos
   ===================================================================== */
titulo('3 · EL ENDPOINT DE LECTURA DE EQUIPOS');

const auth = require('./server/lib/auth.js');
const sheets = require('./server/lib/google-sheets.js');
const LIB = require('./server/api/libro.js');
const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokCliente = auth.firmarToken({ email: 'dt@club.com', equipoAsignado: 'SUD AMERICA LP' }, { expiraEn: '1h' });
const pedir = (tok, body) => ({ headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: body || {} });
const CUENTA = 'sgadd@proyecto.iam.gserviceaccount.com';
const DEPS = { entorno: { googleEmail: CUENTA } };

const origLibro = sheets.obtenerLibro, origCargar = CATV.cargar;
const leidos = [];
sheets.obtenerLibro = async (id) => {
  leidos.push(id);
  if (id === SHEET_DEP) return { hojas: HOJAS, faltantes: [] };
  if (id === SHEET_PRIVADO) throw Object.assign(new Error('403'), { codigo: 'SIN_PERMISO_SHEET' });
  throw Object.assign(new Error('404'), { codigo: 'GOOGLE_404' });
};
CATV.cargar = async () => ({ catalogo: VIG, origen: 'kv' });
try {
  const sinTok = await LIB.manejarEquiposDelLibro(pedir(null, { libroDe: 'deportivo/deportivo-primera' }), DEPS);
  check('sin token, 401', sinTok.status === 401, sinTok.status);
  const cli2 = await LIB.manejarEquiposDelLibro(pedir(tokCliente, { libroDe: 'deportivo/deportivo-primera' }), DEPS);
  check('un cliente no puede leer libros: 403 de ADMIN', cli2.status === 403 && cli2.body.codigo === 'SOLO_ADMIN', cli2.status);

  const bien = await LIB.manejarEquiposDelLibro(pedir(tokAdmin, { libroDe: 'deportivo/deportivo-primera' }), DEPS);
  check('el admin lee el libro de una categoría ya cargada',
    bien.status === 200 && bien.body.equipos.some(e => e.clave === 'SUD AMERICA LP'), JSON.stringify(bien.body).slice(0, 120));
  check('y la respuesta NO trae el id del libro', JSON.stringify(bien.body).indexOf(SHEET_DEP) === -1);
  check('dice con qué cuenta hay que compartir un libro', bien.body.cuentaServicio === CUENTA);

  const noCat = await LIB.manejarEquiposDelLibro(pedir(tokAdmin, { libroDe: 'deportivo/nada' }), DEPS);
  check('una categoría sin libro da 404', noCat.status === 404, noCat.status);

  const priv = await LIB.manejarEquiposDelLibro(pedir(tokAdmin, { sheetId: SHEET_PRIVADO }), DEPS);
  check('un libro NO COMPARTIDO lo dice, con el mail a quien compartirlo',
    priv.status === 400 && priv.body.codigo === 'SIN_PERMISO_SHEET' && priv.body.mensaje.indexOf(CUENTA) !== -1,
    priv.body.mensaje);
  const nada = await LIB.manejarEquiposDelLibro(pedir(tokAdmin, { sheetId: SHEET_NADA }), DEPS);
  check('un libro que NO EXISTE lo dice distinto: se arregla al revés',
    nada.status === 404 && nada.body.codigo === 'LIBRO_INEXISTENTE', nada.body.codigo);
  const url = await LIB.manejarEquiposDelLibro(pedir(tokAdmin,
    { sheetId: 'https://docs.google.com/spreadsheets/d/' + SHEET_DEP + '/edit' }), DEPS);
  check('la URL entera no se lee (la pantalla manda el id pelado)', url.status === 400, url.status);
  const vacio = await LIB.manejarEquiposDelLibro(pedir(tokAdmin, { sheetId: SHEET_DEP }), DEPS);
  check('con el id de un libro nuevo, lo lee', vacio.status === 200);
} finally {
  sheets.obtenerLibro = origLibro;
  CATV.cargar = origCargar;
}
const app = fs.readFileSync('./server/app.js', 'utf8');
check('la ruta está registrada, y en POST (un id en la query termina en los logs)',
  /app\.post\('\/api\/v1\/catalogo\/equipos'/.test(app));
check('y en su propio archivo, no en handlers.js',
  !/manejarEquiposDelLibro/.test(fs.readFileSync('./server/api/handlers.js', 'utf8')));

/* =====================================================================
   4 · LAS CATEGORÍAS SALEN DEL CATÁLOGO · el JSON pone la marca
   ===================================================================== */
titulo('4 · LAS CATEGORÍAS SALEN DEL CATÁLOGO DEL SERVIDOR');

function crearClub(clubId) {
  const src = fs.readFileSync('./js/sgadd-club.js', 'utf8')
    .replace('const CLUB = (function () {', 'var CLUB = (function () {');
  const nodos = {};
  const contexto = {
    console, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '?club=' + clubId } },
    document: {
      readyState: 'complete',
      currentScript: { src: 'https://coachgn.github.io/estadisticas/js/sgadd-club.js' },
      getElementsByTagName: () => [],
      getElementById: (id) => nodos[id] || null,
      documentElement: { style: { setProperty() {} } },
      body: { appendChild(n) { if (n.id) nodos[n.id] = n; } },
      createElement: () => ({ style: {}, removido: false, remove() { this.removido = true; delete nodos[this.id]; } }),
      addEventListener() {},
      title: '',
    },
    fetch: async (u) => {
      const m = /clubes\/([a-z0-9-]+)\.json/.exec(u);
      const ruta = m ? './clubes/' + m[1] + '.json' : null;
      if (ruta && fs.existsSync(ruta)) return { ok: true, json: async () => JSON.parse(fs.readFileSync(ruta, 'utf8')) };
      return { ok: false, status: 404 };
    },
    SGADD: {
      CATALOGO: { patronEquipoPropio: /RECONQUISTA/, planillas: [{ id: 'default', activo: true }] },
      limpiarCache() {}, claveEquipo: CORE.claveEquipo,
    },
    LOGOS: { CFG: { basePaths: [], sufijos: [], overrides: {} }, reset() {}, getUrl: () => null },
  };
  vm.createContext(contexto);
  vm.runInContext(src, contexto);
  return { CLUB: contexto.CLUB, ctx: contexto, nodos };
}

const SERVIDOR_SUD = { id: 'sudamerica', nombre: 'Sud América La Plata', liga: 'la-plata',
  categorias: [{ slug: 'sudamerica-primera', label: 'Primera Division', activo: true, nivel: null }] };
const JSON_VIEJO = { nombre: 'Sud América La Plata', patronEquipoPropio: 'SUD AMERICA',
  planillas: [{ id: 'sud-america-primera-2026', slug: 'sud-america-primera', label: 'Primera 2026', nivel: 'LOCAL_MAYORES' }] };
const JSON_BIEN = { nombre: 'Sud América La Plata', patronEquipoPropio: 'SUD AMERICA LP',
  planillas: [{ id: 'sudamerica-primera-2026', slug: 'sudamerica-primera', label: 'Primera 2026', nivel: 'LOCAL_MAYORES' }] };

{
  const { CLUB } = crearClub('sudamerica');
  /* EL CASO REAL: el JSON con el slug viejo ya no mata la carga. */
  const a = CLUB.reconciliarConfig(JSON_VIEJO, SERVIDOR_SUD);
  check('con el JSON VIEJO de Sud América, la categoría es la del servidor',
    a.planillas.length === 1 && a.planillas[0].slug === 'sudamerica-primera', JSON.stringify(a.planillas));
  check('y la del JSON con el slug que no existe se descarta',
    !a.planillas.some(p => p.slug === 'sud-america-primera'));

  /* Donde nombran la MISMA categoría, gana el JSON: su id es la clave de
     los estados y de los links ya compartidos (punto 6). */
  const b = CLUB.reconciliarConfig(JSON_BIEN, SERVIDOR_SUD);
  check('con el mismo slug, se conservan el id, la etiqueta y el nivel del JSON',
    b.planillas[0].id === 'sudamerica-primera-2026' && b.planillas[0].label === 'Primera 2026'
    && b.planillas[0].nivel === 'LOCAL_MAYORES', JSON.stringify(b.planillas[0]));
  check('el patrón del equipo propio del JSON gana', b.patronEquipoPropio === 'SUD AMERICA LP');
  check('no se muta el JSON de entrada', JSON_BIEN.planillas[0].activo === undefined);

  /* SIN JSON: un alta hecha solo desde el Panel Master. */
  const c = CLUB.reconciliarConfig(null, SERVIDOR_SUD, { equipoPropio: 'SUD AMERICA LP - MM' });
  check('sin JSON se arma la config desde el catálogo',
    c && c.nombre === 'Sud América La Plata' && c.liga === 'la-plata' && c.planillas[0].slug === 'sudamerica-primera');
  /* ANCLADO sobre la clave: sin anclar, DEPORTIVO LA PLATA se llevaría a
     DEPORTIVO SAN VICENTE (punto 6). */
  const re = new RegExp(c.patronEquipoPropio, 'i');
  check('el patrón derivado va anclado a la clave normalizada',
    re.test('SUD AMERICA LP') && !re.test('SUD AMERICA LP II'), c.patronEquipoPropio);
  const dep = CLUB.reconciliarConfig(null, { id: 'd', nombre: 'D', categorias: [{ slug: 'd-p', label: 'P', activo: true }] },
    { equipoPropio: 'DEPORTIVO LA PLATA' });
  check('con DEPORTIVO, el patrón no se lleva a DEPORTIVO SAN VICENTE',
    !new RegExp(dep.patronEquipoPropio, 'i').test('DEPORTIVO SAN VICENTE'));

  check('una categoría SIN libro va deshabilitada, como lo dice el servidor',
    CLUB.reconciliarConfig(null, { id: 'z', categorias: [{ slug: 'z-u21', label: 'U21', activo: false }] })
      .planillas[0].activo === false);
  check('un club que el servidor no trae deja la config como estaba',
    CLUB.reconciliarConfig(JSON_BIEN, { id: 'sudamerica', categorias: [] }) === JSON_BIEN);
}

{
  /* DE PUNTA A PUNTA sobre el JSON real y un club que no tiene JSON. */
  const x = crearClub('sudamerica');
  await x.CLUB.cargar();
  check('el JSON real de Sud América carga', !!x.CLUB.cfg && !x.CLUB.estado.error);
  x.CLUB.reconciliar(SERVIDOR_SUD);
  check('y tras el cruce su categoría es la del catálogo',
    x.ctx.SGADD.CATALOGO.planillas.map(p => p.slug).join(',') === 'sudamerica-primera');

  const y = crearClub('club-sin-json');
  await y.CLUB.cargar();
  check('un club sin JSON arranca con el cartel rojo', !!y.CLUB.estado.error && !!y.nodos.clubCartelError);
  const cambio = y.CLUB.reconciliar({ id: 'club-sin-json', nombre: 'Club Nuevo', liga: 'la-plata',
    categorias: [{ slug: 'club-sin-json-primera', label: 'Primera', activo: true }] }, { equipoPropio: 'CLUB NUEVO' });
  check('con el catálogo, queda andando: sus categorías y su nombre',
    cambio && y.ctx.SGADD.CATALOGO.planillas[0].slug === 'club-sin-json-primera' && y.CLUB.cfg.nombre === 'Club Nuevo');
  check('y el cartel rojo se retira', !y.CLUB.estado.error && !y.nodos.clubCartelError);
}

const idx = fs.readFileSync('./index.html', 'utf8');
const resolver = idx.slice(idx.indexOf('async function resolverClubYPlanilla'), idx.indexOf('SGADD_APP.inicializar();', idx.indexOf('async function resolverClubYPlanilla')));
check('el cruce corre ANTES de inicializar la categoría', /reconciliarConCatalogo\(\)/.test(resolver));
check('con techo de tiempo: un catálogo lento no demora el arranque',
  /async function reconciliarConCatalogo[\s\S]{0,900}setTimeout\(\(\) => res\(null\), 4000\)/.test(idx));

/* =====================================================================
   5 · EL MOTOR DEL FORMULARIO
   ===================================================================== */
titulo('5 · EL MOTOR DEL FORMULARIO');

global.SGADD = require('./js/sgadd-core.js');
const HUB = require('./js/sgadd-hub.js');

check('el id se arma del nombre, sin acentos', HUB.slug('Sud América La Plata') === 'sud-america-la-plata');
check('y sin eñes ni símbolos', HUB.slug('Ñandú Básquet · 2026') === 'nandu-basquet-2026');
check('el id de categoría va SIN el año',
  HUB.idCategoriaSugerido('sud-america', 'Primera 2026') === 'sud-america-primera',
  HUB.idCategoriaSugerido('sud-america', 'Primera 2026'));
check('sin club no se inventa uno', HUB.idCategoriaSugerido('', 'Primera') === '');
check('del link entero se saca el id',
  HUB.idDeLibro('https://docs.google.com/spreadsheets/d/' + SHEET_DEP + '/edit#gid=0') === SHEET_DEP);
check('y el id pelado queda igual', HUB.idDeLibro('  ' + SHEET_DEP + ' ') === SHEET_DEP);

const sug = (n) => (HUB.sugerirEquipo(n, EQUIPOS_REALES) || {}).clave || null;
check('«Sud América La Plata» propone SUD AMERICA LP', sug('Sud América La Plata') === 'SUD AMERICA LP', sug('Sud América La Plata'));
check('«Deportivo La Plata» propone DEPORTIVO LA PLATA, no SAN VICENTE',
  sug('Deportivo La Plata') === 'DEPORTIVO LA PLATA', sug('Deportivo La Plata'));
check('«Villa San Carlos» propone VILLA SAN CARLOS A', sug('Villa San Carlos') === 'VILLA SAN CARLOS A');
check('un club que no está en el libro no propone nada', sug('Club Inexistente') === null);
check('CON EMPATE no propone: elegir entre dos parejos es el error que se evita',
  HUB.sugerirEquipo('Atenas', [{ clave: 'ATENAS A' }, { clave: 'ATENAS B' }]) === null);

const libros = HUB.librosDisponibles([
  { id: 'deportivo', nombre: 'Deportivo La Plata', categorias: [{ slug: 'deportivo-primera', label: 'Primera 2026', activo: true }] },
  { id: 'z', nombre: 'Z', categorias: [{ slug: 'z-u21', label: 'U21', activo: false }] },
]);
check('los libros para reusar son los de categorías CON libro',
  libros.length === 1 && libros[0].valor === 'deportivo/deportivo-primera'
  && libros[0].texto === 'Deportivo La Plata · Primera 2026', JSON.stringify(libros));

const falta = (o) => HUB.faltantesAlta(o).join(' | ');
check('un alta nueva vacía dice todo lo que falta, en castellano',
  /nombre del club/.test(falta({ modo: 'nuevo' })) && /id del club/.test(falta({ modo: 'nuevo' }))
  && /libro/.test(falta({ modo: 'nuevo', fuente: 'existente' })) && /equipo propio/.test(falta({ modo: 'nuevo' })),
  falta({ modo: 'nuevo' }));
check('editando y manteniendo el libro, no pide libro ni equipo',
  HUB.faltantesAlta({ modo: 'sudamerica', club: 'sudamerica', categoria: 'sudamerica-primera',
    catElegida: 'sudamerica-primera', fuente: 'mantener', label: 'Primera' }).length === 0);

HUB.reiniciarAlta();
Object.assign(HUB.alta, { modo: 'sudamerica', club: 'sudamerica', catElegida: 'sudamerica-primera',
  categoria: 'sudamerica-primera', label: 'Primera 2026', fuente: 'mantener', equipoPropio: 'Sud America LP - MM' });
const i1 = HUB.intencionAlta();
check('manteniendo el libro, la intención NO lleva libro', !('libroDe' in i1) && !('sheetId' in i1));
check('y el equipo va como CLAVE, que es contra lo que compara el gate',
  i1.equipoPropio === 'SUD AMERICA LP', i1.equipoPropio);
Object.assign(HUB.alta, { fuente: 'nuevo', sheet: 'https://docs.google.com/spreadsheets/d/' + SHEET_DEP + '/edit' });
check('con un libro nuevo pegado como link, viaja el id', HUB.intencionAlta().sheetId === SHEET_DEP);
Object.assign(HUB.alta, { fuente: 'existente', libroDe: 'deportivo/deportivo-primera' });
check('con un libro ya cargado, viaja la referencia y no el id',
  HUB.intencionAlta().libroDe === 'deportivo/deportivo-primera' && !('sheetId' in HUB.intencionAlta()));

/* =====================================================================
   6 · EL BUG DE TIPEO · ejercido sobre un DOM de mentira
   ===================================================================== */
titulo('6 · TIPEAR NO RE-MONTA LOS INPUTS');

function nodo(id) {
  const clases = new Set(['border-hairline']);
  return {
    id, value: '', escrituras: 0, _h: '',
    get innerHTML() { return this._h; },
    set innerHTML(v) { this.escrituras++; this._h = v; },
    classList: { toggle(c, on) { if (on) clases.add(c); else clases.delete(c); }, contains: c => clases.has(c) },
    focus() {},
  };
}
const nodos = {};
['hubAlta', 'hubAltaEstado', 'hubAltaEquipo', 'hubClientes', 'alta-club', 'alta-categoria',
 'alta-nombre', 'alta-label', 'alta-sheet', 'alta-liga'].forEach(id => { nodos[id] = nodo(id); });
global.document = { getElementById: id => nodos[id] || null, querySelector: () => null };

HUB.reiniciarAlta();
nodos.hubAlta.innerHTML = HUB.bloqueAlta();
Object.values(nodos).forEach(n => { n.escrituras = 0; });

const tipear = (id, texto) => { for (let k = 1; k <= texto.length; k++) HUB.campoAlta(id, texto.slice(0, k)); };
tipear('nombre', 'Sud América La Plata');
check('TIPEAR UN NOMBRE ENTERO NO REPINTA EL FORMULARIO (el bug)',
  nodos.hubAlta.escrituras === 0, nodos.hubAlta.escrituras + ' repintados');
check('el id del club se completa sobre el nodo que ya estaba', nodos['alta-club'].value === 'sud-america-la-plata',
  nodos['alta-club'].value);
check('lo único que se refresca es la zona de estado', nodos.hubAltaEstado.escrituras === 'Sud América La Plata'.length);

tipear('label', 'Primera 2026');
check('la etiqueta completa el id de categoría, sin repintar',
  nodos['alta-categoria'].value === 'sud-america-la-plata-primera' && nodos.hubAlta.escrituras === 0,
  nodos['alta-categoria'].value);

HUB.campoAlta('club', 'sud-america');
tipear('nombre', 'Otro nombre');
check('un id escrito a mano ya no sigue al nombre', HUB.alta.club === 'sud-america');

HUB.campoAlta('club', 'Sud America');
check('un id inválido se marca en el borde, sin repintar',
  nodos['alta-club'].classList.contains('border-red-500/70') && nodos.hubAlta.escrituras === 0);

HUB.elegirFuente('nuevo');   // un radio SÍ repinta: no se está tipeando
const antes = nodos.hubAlta.escrituras;
tipear('sheet', 'https://docs.google.com/spreadsheets/d/' + SHEET_DEP);
check('pegar el libro refresca la zona del equipo pero no el formulario',
  nodos.hubAltaEquipo.escrituras > 0 && nodos.hubAlta.escrituras === antes);

const fuenteHub = fs.readFileSync('./js/sgadd-hub.js', 'utf8');
const cuerpoCampo = fuenteHub.slice(fuenteHub.indexOf('function campoAlta('), fuenteHub.indexOf('function olvidarLibro('));
check('campoAlta() no llama a refrescarAlta()', !/refrescarAlta\(/.test(cuerpoCampo), cuerpoCampo.length + ' chars');

/* =====================================================================
   6 bis · UN REPINTADO AJENO NO ROBA EL FOCO
   Lo destapó Chrome real: los escudos que llegan tarde repintan la
   sección, y el foco se perdía en la 8.ª letra de un nombre.
   ===================================================================== */
titulo('6 bis · UN REPINTADO AJENO NO ROBA EL FOCO');

const UI = require('./js/sgadd-ui.js');
const docHub = global.document;
{
  let activo = null;
  const viejo = { id: 'alta-nombre', tagName: 'INPUT', selectionStart: 3, selectionEnd: 3, focus() { activo = this; } };
  const nuevo = { id: 'alta-nombre', tagName: 'INPUT', sel: null, focus() { activo = this; },
    setSelectionRange(a, b) { this.sel = [a, b]; } };
  let enDom = viejo;
  global.document = { get activeElement() { return activo; }, getElementById: id => (id === enDom.id ? enDom : null) };
  activo = viejo;
  UI.conservarFoco(() => { enDom = nuevo; activo = null; });
  check('tras un repintado, el foco vuelve al campo NUEVO con el mismo id', activo === nuevo);
  check('y el cursor queda donde estaba', !!nuevo.sel && nuevo.sel[0] === 3 && nuevo.sel[1] === 3);

  const boton = { id: 'algo', tagName: 'BUTTON', focus() { activo = this; } };
  const otro = { id: 'algo', tagName: 'BUTTON', focus() { activo = this; } };
  enDom = boton; activo = boton;
  UI.conservarFoco(() => { enDom = otro; activo = null; });
  check('un botón no se reenfoca: la regla es para los campos que se escriben', activo === null);

  check('devuelve lo que devuelve el repintado', UI.conservarFoco(() => 42) === 42);
}
global.document = docHub;

const cuerpoRender = idx.slice(idx.indexOf('function renderSection(section)'), idx.indexOf('function renderSeccionCruda'));
check('renderSection() repinta conservando el foco (el repintado de los escudos)',
  /SGADD_UI\.conservarFoco\(\(\) => renderSeccionCruda\(section\)\)/.test(cuerpoRender), cuerpoRender.length + ' chars');
const cfgui = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
const cuerpoPintar = cfgui.slice(cfgui.indexOf('function configPintar()'), cfgui.indexOf('function configPintarPreview'));
check('configPintar() también', /SGADD_UI\.conservarFoco\(pintar\)/.test(cuerpoPintar));
check('y el catálogo que llega tarde al Panel Master también',
  /SGADD_UI\.conservarFoco\(pintar\)/.test(fs.readFileSync('./js/sgadd-clientes.js', 'utf8')));

/* =====================================================================
   7 · NADA SE APLICA EN SILENCIO · guardar pasa por la confirmación
   ===================================================================== */
titulo('7 · GUARDAR PASA POR LA CONFIRMACIÓN (punto 30)');

let abierto = null;
const enviados = [];
global.SGADD_CONFIRMAR = { abrir(o) { abierto = o; } };
global.SGADD_DATA = { guardarCatalogo(i) { enviados.push(i); return Promise.resolve({ ok: true, creoClub: true, clubes: [] }); } };
HUB.reiniciarAlta();
Object.assign(HUB.alta, { nombre: 'Villa San Carlos', club: 'villa-san-carlos', liga: 'la-plata',
  label: 'Primera 2026', categoria: 'villa-san-carlos-primera', fuente: 'existente',
  libroDe: 'deportivo/deportivo-primera', equipoPropio: 'VILLA SAN CARLOS A' });
HUB.alta.tocado = { club: true, categoria: true };
HUB.guardar();
check('guardar ABRE la confirmación y no manda nada todavía', !!abierto && enviados.length === 0);
check('la confirmación enumera lo que se crea',
  abierto && abierto.cambios.some(c => c.label === 'Equipo propio' && c.despues === 'VILLA SAN CARLOS A')
  && abierto.cambios.some(c => c.label === 'Libro'), JSON.stringify(abierto && abierto.cambios));
abierto.alConfirmar();
check('recién al confirmar sale la intención', enviados.length === 1 && enviados[0].accion === 'alta');
check('con la referencia al libro y sin el id', enviados[0].libroDe === 'deportivo/deportivo-primera' && !('sheetId' in enviados[0]));
await new Promise(r => setImmediate(r));
check('después de guardar, el formulario queda EDITANDO lo guardado', HUB.alta.modo === 'villa-san-carlos');

delete global.SGADD_CONFIRMAR; delete global.SGADD_DATA; delete global.document;

/* =====================================================================
   8 · SUD AMÉRICA ALINEADO · el JSON y la guía
   ===================================================================== */
titulo('8 · SUD AMÉRICA ALINEADO Y LA GUÍA');

const sud = JSON.parse(fs.readFileSync('./clubes/sudamerica.json', 'utf8'));
check('el id del JSON es el del catálogo y el del archivo', sud.id === 'sudamerica');
check('su categoría usa el slug del catálogo', sud.planillas.every(p => p.slug === 'sudamerica-primera'));
check('su patrón reconoce al equipo como lo escribe el libro',
  new RegExp(sud.patronEquipoPropio, 'i').test(CORE.claveEquipo('SUD AMERICA LP - MM')));
check('la preconfiguración apunta a una planilla que existe',
  Object.values(sud.preconfiguracion.categorias).every(c => sud.planillas.some(p => p.id === c.planilla)));

const guia = fs.existsSync('./GUIA_ALTA_CLIENTES.md') ? fs.readFileSync('./GUIA_ALTA_CLIENTES.md', 'utf8') : '';
check('existe GUIA_ALTA_CLIENTES.md', guia.length > 500);
/* UNA GUÍA QUE NOMBRA UN BOTÓN QUE NO EXISTE es peor que no tener guía:
   el que la sigue lo busca, no lo encuentra y deja de confiar en ella.
   Cada botón que cita tiene que estar, literal, en la pantalla. */
['Dar de alta', 'Leer los equipos del libro', 'Usar un libro ya cargado',
 'Pegar el link de un libro nuevo', 'Mantener el libro que ya tiene', 'Guardar cambios'].forEach((b) => {
  check('  la guía nombra «' + b + '» y la pantalla lo tiene',
    guia.indexOf(b) !== -1 && fuenteHub.indexOf(b) !== -1);
});

console.log(NL + '─'.repeat(70));
console.log((fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
