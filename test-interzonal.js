/* =====================================================================
   test-interzonal.js · FASES ENTRE ZONAS Y FASE ACTIVA (punto 76)

   Lo que pidió el club, EJERCIDO sobre el código real:

     a) la regla de acceso: un cliente de la Zona Norte recibe la LLAVE
        (quién contra quién, puestos y resultados de las series) y recibe
        un 403 si pide el libro completo de la Zona Sur o el de la
        postemporada — con los handlers de verdad y un Upstash de mentira;
     b) la resolución de slots interzonales «1° Norte vs 2° Sur» con las
        tablas de las dos zonas, sin abrir el libro de la otra;
     c) el selector dinámico de fase activa: el libro abre en la fase que
        se está jugando, y la regular sigue siendo la de siempre si no hay
        postemporada.

   POR QUÉ UN ARCHIVO PROPIO y no `test-backend.js` o `test-permisos.js`:
   estos tests reemplazan `kv.*` y `sheets.obtenerLibro` por dobles, y esos
   módulos se comparten por `require`. Metidos en una suite que ya tiene
   los suyos, los dobles de uno pisan a los del otro según el orden de
   carga. Acá viven solos.

     node test-interzonal.js
   ===================================================================== */
'use strict';
require('./server/lib/env.js').cargar();

let ok = 0, mal = 0;
function check(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (detalle !== undefined ? '  → ' + JSON.stringify(detalle) : '')); }
}
function seccion(t) { console.log('\n' + t + '\n' + '─'.repeat(70)); }

/* ------------------------------------------------------ Upstash de mentira */
const kv = require('./server/lib/kv.js');
const store = {};
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { store[k] = JSON.stringify(v); };

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const sheets = require('./server/lib/google-sheets.js');
const H = require('./server/api/handlers.js');
const LLAVE = require('./server/api/llave.js');
const TORNEOS = require('./server/lib/torneos.js');
const mutar = require('./server/lib/catalogo-mutar.js');
const SGADD = require('./js/sgadd-core.js');
const F = require('./js/sgadd-fases.js');

/* ---------------------------------------------------------------------
   Los libros. Nombres REALES de Liga Argentina (punto 1): un typo se nota.

     NORTE  OBRAS 3-0 · JUJUY 2-1 · SALTA 1-2 · BARRIO JARDIN 0-3
     SUR    GIMNASIA 3-0 · RIVER 2-1 · VILLA MITRE 1-2 · ESTUDIANTES 0-3
     POST   cuartos al mejor de 3: OBRAS 2-0 RIVER · GIMNASIA 1-0 JUJUY
   --------------------------------------------------------------------- */
const OB = 'OBRAS BASKET', JU = 'JUJUY BASQUET', SA = 'SALTA BASKET', BJ = 'BARRIO JARDIN (T)';
const GI = 'GIMNASIA (LP)', RI = 'RIVER', VM = 'VILLA MITRE (BB)', ES = 'ESTUDIANTES (C)';

function partido(fecha, fase, local, visita, pl, pv) {
  const base = { FECHA: fecha, PARTIDO: local + ' vs ' + visita, FASE: fase };
  const gl = pl > pv;
  return [
    Object.assign({}, base, { EQUIPO: local, CONDICION: 'LOCAL', RESULTADO: gl ? 'GANADO' : 'PERDIDO', PTS: pl, PTSopp: pv }),
    Object.assign({}, base, { EQUIPO: visita, CONDICION: 'VISITANTE', RESULTADO: gl ? 'PERDIDO' : 'GANADO', PTS: pv, PTSopp: pl }),
  ];
}
/* Las filas en OBJETOS, como las usa el índice del navegador… */
function hojasDe(filasBD) {
  const vistos = {};
  filasBD.forEach((f) => { vistos[f.EQUIPO + '|' + f.FASE] = f; });
  const filasE = Object.keys(vistos).map(k => ({ EQUIPO: vistos[k].EQUIPO, FASE: vistos[k].FASE, PJ: 1, PTS: 70 }));
  return {
    'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'PJ', 'PTS'], filas: filasE },
    'Base Datos E': { cols: ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'], filas: filasBD },
  };
}
/* …y en MATRICES, como las devuelve la API de Sheets al servidor. */
function libroApi(filasBD) {
  const h = hojasDe(filasBD);
  const hojas = {};
  Object.keys(h).forEach((n) => { hojas[n] = [h[n].cols].concat(h[n].filas.map(f => h[n].cols.map(c => f[c]))); });
  return { hojas: hojas, hojasTexto: {}, faltantes: [], leidoEn: 1 };
}
const zona4 = (a, b, c, d, mes) => [].concat(
  partido('01/' + mes + '/2026', 'REGULAR', a, b, 80, 70), partido('02/' + mes + '/2026', 'REGULAR', a, c, 80, 60),
  partido('03/' + mes + '/2026', 'REGULAR', a, d, 90, 50), partido('04/' + mes + '/2026', 'REGULAR', b, c, 75, 70),
  partido('05/' + mes + '/2026', 'REGULAR', b, d, 75, 60), partido('06/' + mes + '/2026', 'REGULAR', c, d, 65, 60));
const NORTE = zona4(OB, JU, SA, BJ, '03');
const SUR = zona4(GI, RI, VM, ES, '03');
const POST = [].concat(
  partido('10/04/2026', 'CUARTOS', OB, RI, 88, 70), partido('12/04/2026', 'CUARTOS', RI, OB, 60, 75),
  partido('11/04/2026', 'CUARTOS', GI, JU, 71, 69));

const ID = { norte: 'N'.repeat(30) + 'libroNorte1', sur: 'S'.repeat(30) + 'libroSur222',
  post: 'P'.repeat(30) + 'libroPost33', obras: 'O'.repeat(30) + 'libroObras4' };
let lecturas = [];
let caido = null;
sheets.obtenerLibro = async (id) => {
  lecturas.push(id);
  if (id === caido) throw new Error('Google no contestó');
  if (id === ID.norte || id === ID.obras) return libroApi(NORTE);
  if (id === ID.sur) return libroApi(SUR);
  if (id === ID.post) return libroApi(POST);
  throw new Error('libro desconocido ' + id);
};

/* El torneo declarado: dos conferencias y una postemporada que cruza el
   1° de una con el 2° de la otra. */
const FORMATO = { partidosPorEquipo: 3, fases: [
  { id: 'regular', label: 'Fase regular', cruce: 'zona' },
  { id: 'cuartos', label: 'Cuartos de final', cruce: 'interzonal', zonaLibro: 'post', libro: ['CUARTOS'],
    serie: { mejorDe: 3 }, cruces: [
      { id: 'C1', a: { zona: 'norte', puesto: 1 }, b: { zona: 'sur', puesto: 2 } },
      { id: 'C2', a: { zona: 'sur', puesto: 1 }, b: { zona: 'norte', puesto: 2 } }] },
  { id: 'final', label: 'Final', serie: { mejorDe: 1 }, cruces: [{ id: 'F', a: { ganador: 'C1' }, b: { ganador: 'C2' } }] },
] };
const eq = (n) => ({ nombre: n, clave: SGADD.claveEquipo(n) });
const CAT = {
  'liga-x': { tipo: 'torneo', nombre: 'Liga X', liga: 'liga-argentina', formato: FORMATO,
    competencia: { ordenTabla: ['PCT', 'DIF', 'PF'] },
    categorias: {
      'lx-norte': { label: 'Conferencia Norte', sheetId: ID.norte, zona: 'norte', equipos: [OB, JU, SA, BJ].map(eq) },
      'lx-sur': { label: 'Conferencia Sur', sheetId: ID.sur, zona: 'sur', equipos: [GI, RI, VM, ES].map(eq) },
      'lx-post': { label: 'Postemporada', sheetId: ID.post, zona: 'post', interzonal: true, equipos: [] },
    } },
  obras: { nombre: 'Obras', liga: 'liga-argentina', equipoPropio: OB, plan: 'PLATA',
    categorias: { 'obras-lx': { label: 'Liga X', sheetId: ID.obras, torneo: 'liga-x', zona: 'norte' } } },
  pausado: { nombre: 'Salta', liga: 'liga-argentina', equipoPropio: SA, plan: 'PLATA', estado: 'pausado',
    categorias: { 'salta-lx': { label: 'Liga X', sheetId: ID.obras, torneo: 'liga-x', zona: 'norte' } } },
  ajeno: { nombre: 'Deportivo', liga: 'la-plata', equipoPropio: 'DEPORTIVO LA PLATA', plan: 'ORO',
    categorias: { 'dep-pri': { label: 'Primera', sheetId: 'D'.repeat(40) } } },
};
store[catalogo.CLAVE_KV] = JSON.stringify(CAT);

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokObras = auth.firmarToken({ email: 'dt@obras.com', club: 'obras', equipoAsignado: OB, plan: 'PLATA' }, { expiraEn: '1h' });
const tokSalta = auth.firmarToken({ email: 'dt@salta.com', club: 'pausado', equipoAsignado: SA, plan: 'PLATA' }, { expiraEn: '1h' });
const tokAjeno = auth.firmarToken({ email: 'dt@dep.com', club: 'ajeno', equipoAsignado: 'DEPORTIVO LA PLATA', plan: 'ORO' }, { expiraEn: '1h' });
const pedido = (tok, params, query) => ({ headers: tok ? { authorization: 'Bearer ' + tok } : {},
  params: params || {}, body: {}, query: query || {} });
const pedirLlave = async (tok, torneo) => { catalogo.limpiarCache(); return LLAVE.manejarLlave(pedido(tok, { torneo: torneo || 'liga-x' })); };
const DATOS_M = require('./js/sgadd-data.js');
const DATOS_F = (m) => DATOS_M.matrizAFilas(m).filas;
const DATOS_F2 = (m) => DATOS_M.matrizAFilas(m);
const pedirLibro = async (tok, club, cat) => { catalogo.limpiarCache(); return H.manejarEquipos(pedido(tok, { clubId: club }, { categoria: cat })); };

(async () => {

  /* =====================================================================
     1 · LA REGLA DE ACCESO · la llave sí, el libro de otra zona no
     ===================================================================== */
  seccion('1 · un cliente de la Zona Norte: la llave sí, los libros ajenos no');
  {
    LLAVE.limpiarCache();
    const r = await pedirLlave(tokObras);
    check('recibe la llave (200)', r.status === 200, r.body);
    const z = r.body.zonas || {};
    check('con las DOS zonas, la suya y la otra', !!z.norte && !!z.sur, Object.keys(z));
    check('la otra zona trae sus equipos por puesto: 1° Gimnasia, 2° River',
      z.sur && z.sur.filas[0].nombre === SGADD.limpiarNombre(GI) && z.sur.filas[1].nombre === SGADD.limpiarNombre(RI),
      z.sur && z.sur.filas.map(f => f.nombre));
    check('y con su récord (3-0 el primero)', z.sur && z.sur.filas[0].pg === 3 && z.sur.filas[0].pp === 0);
    check('las dos tablas cerraron: todos jugaron los 3 partidos declarados', z.norte.cerrada && z.sur.cerrada);
    const post = r.body.postemporada;
    check('la postemporada trae los resultados de las series', post && post.conLibro && post.partidos.length === 3, post);
    check('con fecha, equipos y marcador final',
      post.partidos.some(p => p.fase === 'CUARTOS' && p.fecha === '2026-04-10' && p.ptsLocal === 88 && p.ptsVisitante === 70));
    check('la postemporada NO se lista como una zona (no tiene tabla)', !z.post);

    /* LO QUE NO VIAJA. La lista de claves permitidas es cerrada: una
       columna de estadísticas que se cuele por un cambio del motor la
       rompe acá. */
    const PERMITIDAS = new Set(['ok', 'torneo', 'nombre', 'zonas', 'postemporada', 'leidoEn', 'label', 'filas',
      'cerrada', 'puesto', 'clave', 'pj', 'pg', 'pp', 'conLibro', 'partidos', 'fase', 'fecha', 'local',
      'visitante', 'ptsLocal', 'ptsVisitante', 'zonaLibro', 'zona', 'id', 'sinLibro', 'ilegible', 'norte', 'sur']);
    const extras = [];
    (function recorrer(v) {
      if (Array.isArray(v)) return v.forEach(recorrer);
      if (v && typeof v === 'object') Object.keys(v).forEach((k) => { if (!PERMITIDAS.has(k)) extras.push(k); recorrer(v[k]); });
    })(r.body);
    check('NINGUNA métrica, jugador ni box score en la respuesta', extras.length === 0, extras);
    check('ningún sheetId viaja', !/N{20}|S{20}|P{20}|O{20}/.test(JSON.stringify(r.body)));

    const sur = await pedirLibro(tokObras, 'liga-x', 'lx-sur');
    check('el libro COMPLETO de la Zona Sur: 403', sur.status === 403, sur.body);
    const lpost = await pedirLibro(tokObras, 'liga-x', 'lx-post');
    check('el de la postemporada: 403', lpost.status === 403, lpost.body);
    const norteTorneo = await pedirLibro(tokObras, 'liga-x', 'lx-norte');
    check('ni siquiera el de su zona POR EL TORNEO: su libro es el de su categoría', norteTorneo.status === 403);
    const propio = await pedirLibro(tokObras, 'obras', 'obras-lx');
    check('su propio libro sí (200)', propio.status === 200, propio.body && propio.body.codigo);
  }

  seccion('1 bis · quién NO recibe la llave');
  {
    const aj = await pedirLlave(tokAjeno);
    check('un cliente que no está en el torneo: 403 OTRO_TORNEO', aj.status === 403 && aj.body.codigo === 'OTRO_TORNEO', aj.body);
    const pa = await pedirLlave(tokSalta);
    check('un cliente enganchado pero PAUSADO: 403', pa.status === 403, pa.body);
    const sin = await LLAVE.manejarLlave(pedido(null, { torneo: 'liga-x' }));
    check('sin token: 401', sin.status === 401);
    const noEx = await pedirLlave(tokAdmin, 'no-existe');
    check('un torneo que no existe: 404', noEx.status === 404);
    const cliente = await pedirLlave(tokAdmin, 'obras');
    check('un CLIENTE no es un torneo: 404', cliente.status === 404);
    const ruta = await pedirLlave(tokAdmin, '../x');
    check('una ruta rara: 400', ruta.status === 400);
    const adm = await pedirLlave(tokAdmin);
    check('el admin recibe la llave', adm.status === 200);
    const admSur = await pedirLibro(tokAdmin, 'liga-x', 'lx-sur');
    check('y el admin SÍ abre el libro de la otra zona', admSur.status === 200, admSur.body && admSur.body.codigo);
  }

  seccion('1 ter · la tabla de la llave es la de Clasificación');
  {
    /* Un partido cargado a mano en la Sur da vuelta el 1° y el 2°: si la
       llave calculara su tabla por su cuenta, el «2° Sur» no sería el que
       el cliente de esa zona ve en su pantalla. */
    const conManual = JSON.parse(JSON.stringify(CAT));
    conManual['liga-x'].partidosManuales = { 'lx-sur': { 'GENERAL|REGULAR': [
      { id: 'm1', fecha: '2026-03-20', local: RI, puntosLocal: 90, visitante: GI, puntosVisitante: 50 },
      { id: 'm2', fecha: '2026-03-21', local: RI, puntosLocal: 90, visitante: GI, puntosVisitante: 50 }] } };
    store[catalogo.CLAVE_KV] = JSON.stringify(conManual);
    LLAVE.limpiarCache();
    const r = await pedirLlave(tokObras);
    const s = r.body.zonas.sur.filas;
    check('los partidos manuales entran a la tabla de la otra zona', s[0].nombre === SGADD.limpiarNombre(RI) && s[0].pj === 5, s.map(f => f.nombre + ' ' + f.pj));
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
  }

  seccion('1 quater · caché y una zona caída');
  {
    LLAVE.limpiarCache();
    lecturas = [];
    await pedirLlave(tokObras);
    const primera = lecturas.length;
    await pedirLlave(tokObras);
    check('la segunda llave sale del caché: cero lecturas de libros', lecturas.length === primera && primera === 3, lecturas.length);
    LLAVE.limpiarCache();
    caido = ID.sur;
    const r = await pedirLlave(tokObras);
    check('con la Sur ilegible la llave sale igual', r.status === 200);
    check('la Sur queda marcada ilegible y SIN filas: sus lados quedan «a definir»',
      r.body.zonas.sur.ilegible === true && r.body.zonas.sur.filas.length === 0);
    check('la Norte se resuelve igual', r.body.zonas.norte.filas.length === 4);
    caido = null;
    LLAVE.limpiarCache();
  }

  /* =====================================================================
     2 · LOS SLOTS INTERZONALES · «1° Norte vs 2° Sur»
     ===================================================================== */
  seccion('2 · la llave resuelve las dos zonas con la tabla de la otra');
  const fases = F.parsear(FORMATO).fases;
  const llaveServidor = (await pedirLlave(tokObras)).body;
  {
    const cuartos = fases.find(f => f.id === 'cuartos');
    check('la fase declara en qué zona del torneo se juega', cuartos.zonaLibro === 'post');
    check('y es entre zonas', F.esEntreZonas(cuartos) && !F.esEntreZonas(fases[0]));

    /* Solo con el libro propio (la tabla de la Norte): el lado Sur queda
       pendiente. Es lo que pasaba antes de esta entrega. */
    const tablaNorte = llaveServidor.zonas.norte;
    const ctxLocal = { tablas: { norte: { filas: tablaNorte.filas, cerrada: true } }, partidosPorFase: {},
      zonaDeEquipo: {}, nombresZona: { norte: 'Norte', sur: 'Sur' } };
    const solo = F.llave(fases, ctxLocal).cuartos.cruces[0];
    check('sin la llave del servidor, el 2° Sur queda «a definir»', solo.a.estado === 'resuelto' && solo.b.estado === 'pendiente', solo.b);

    const ctx = F.mezclarLlave(JSON.parse(JSON.stringify(ctxLocal)), fases, llaveServidor, 'norte', null);
    const L = F.llave(fases, ctx);
    const c1 = L.cuartos.cruces[0], c2 = L.cuartos.cruces[1];
    check('con ella: 1° Norte (Obras) vs 2° Sur (River)',
      c1.a.nombre === SGADD.limpiarNombre(OB) && c1.b.nombre === SGADD.limpiarNombre(RI), [c1.a.nombre, c1.b.nombre]);
    check('y 1° Sur (Gimnasia) vs 2° Norte (Jujuy)',
      c2.a.nombre === SGADD.limpiarNombre(GI) && c2.b.nombre === SGADD.limpiarNombre(JU), [c2.a.nombre, c2.b.nombre]);
    check('los dos cruces son interzonales', c1.naturaleza === 'interzonal' && c2.naturaleza === 'interzonal');
    const vacia = F.llave(fases, {});
    check('una final con los DOS lados a definir no se rotula intrazonal', vacia.final.cruces[0].naturaleza === null,
      vacia.final.cruces[0].naturaleza);
    check('una fase declarada entre zonas sí, aunque no se sepan los lados', vacia.cuartos.cruces[0].naturaleza === 'interzonal');

    /* ANTES DEL PRIMER PARTIDO DE LA SERIE, que es cuando el DT pregunta
       contra quién juega: sin resultados de postemporada, el lado de la
       otra zona sale SOLO de su tabla. Con resultados, el cruce también se
       completaría «por lo jugado», y eso escondería una tabla que no llegó. */
    const sinJugar = Object.assign({}, llaveServidor, { postemporada: { conLibro: true, partidos: [] } });
    const ctx0 = F.mezclarLlave(JSON.parse(JSON.stringify(ctxLocal)), fases, sinJugar, 'norte', null);
    const p1 = F.llave(fases, ctx0).cuartos.cruces[0];
    check('sin series jugadas, el 2° Sur (River) sale de la tabla de la otra zona',
      p1.b.nombre === SGADD.limpiarNombre(RI) && p1.b.estado === 'resuelto' && !p1.b.porLoJugado, p1.b);
    check('las series salen de los resultados de la postemporada: Obras gana 2-0',
      c1.serie && c1.serie.ganador === SGADD.claveEquipo(OB) && c1.serie.ganados[SGADD.claveEquipo(OB)] === 2, c1.serie);
    check('Gimnasia-Jujuy va 1-0, sin ganador todavía', c2.serie && !c2.serie.ganador && c2.serie.jugados === 1);
    check('la final ya tiene un lado (el ganador de C1) y el otro pendiente',
      L.final.cruces[0].a.clave === SGADD.claveEquipo(OB) && L.final.cruces[0].b.estado === 'pendiente');

    /* La tabla de la zona PROPIA no la pisa el servidor: la local lleva
       los manuales del club. */
    const propia = { filas: [{ clave: 'X', nombre: 'LOCAL', puesto: 1 }], cerrada: true };
    const ctx2 = F.mezclarLlave({ tablas: { norte: propia }, partidosPorFase: {}, nombresZona: {} }, fases, llaveServidor, 'norte', null);
    check('la tabla de la zona propia se queda con la local', ctx2.tablas.norte === propia);

    /* Si el libro PROPIO ya tiene la fase, su marcador manda y no se suma
       dos veces el mismo partido. */
    const hojasConCuartos = hojasDe(NORTE.concat(POST));
    /* CON LIBROS VINCULADOS (punto 77) el libro propio trae SUS partidos de
       la fase y la llave suma los de las OTRAS series, sin repetir: el
       mismo partido escrito del otro lado es el mismo partido. */
    const propios = [{ fecha: '2026-04-10', localClave: SGADD.claveEquipo(OB), visitanteClave: SGADD.claveEquipo(RI), deLibro: true },
      { fecha: '2026-04-12', localClave: SGADD.claveEquipo(OB), visitanteClave: SGADD.claveEquipo(RI), deLibro: true }];
    const ctx3 = F.mezclarLlave({ tablas: {}, partidosPorFase: { cuartos: propios.slice() }, nombresZona: {} }, fases, llaveServidor, 'norte', hojasConCuartos);
    check('la fase que el libro propio ya tiene suma solo las otras series', ctx3.partidosPorFase.cuartos.length === 3,
      ctx3.partidosPorFase.cuartos.length);
    check('y lo del libro gana (trae el box score detrás)', ctx3.partidosPorFase.cuartos.filter(x => x.deLibro).length === 2);
    check('sin llave del servidor el contexto no cambia',
      F.mezclarLlave({ tablas: {}, partidosPorFase: {} }, fases, null, 'norte', null).partidosPorFase.cuartos === undefined);
  }

  seccion('2 bis · el selector: la fase entre zonas se ELIGE, en modo llave');
  {
    const tramos = SGADD.combinacionesTorneoFase(hojasDe(NORTE));
    const lista = F.enriquecerTramos(tramos, fases);
    const ll = lista.find(t => t.declarada === 'cuartos');
    check('los cuartos aparecen como opción de llave, habilitada', ll && ll.llave && !ll.sinDatos && ll.id === '*LLAVE*|CUARTOS', ll);
    check('con la etiqueta del reglamento', ll && ll.label === 'Cuartos de final · llave');
    const fin = lista.find(t => t.declarada === 'final');
    check('la final (del libro de cada zona, sin datos todavía) sigue deshabilitada', fin && fin.sinDatos);
    check('esLlave reconoce el centinela', F.esLlave('*LLAVE*') && !F.esLlave('*TOTAL*') && !F.esLlave('IDA'));
    ['clasificacion', 'fixture', 'scouting', 'glosario', 'configuracion', 'diagnostico'].forEach((s) => {
      check('en modo llave «' + s + '» se pinta', !F.bloqueaEnLlave(s, '*LLAVE*'));
    });
    ['principal', 'equipos', 'jugadores', 'simulador', 'comparativa'].forEach((s) => {
      check('en modo llave «' + s + '» se BLOQUEA con aviso', F.bloqueaEnLlave(s, '*LLAVE*'));
    });
    check('fuera del modo llave no se bloquea nada', !F.bloqueaEnLlave('equipos', 'IDA') && !F.bloqueaEnLlave('equipos', '*TOTAL*'));
    check('el aviso dice que es solo la llave y por qué', /solo la llave/.test(F.avisoModoLlave()) && /postemporada/.test(F.avisoModoLlave()));
  }

  /* =====================================================================
     3 · LA FASE ACTIVA ABRE EL LIBRO
     ===================================================================== */
  seccion('3 · el libro abre en la fase que se está jugando');
  {
    const conPlayoff = SGADD.combinacionesTorneoFase(hojasDe(NORTE.concat(
      partido('10/04/2026', 'PLAYOFF', OB, BJ, 80, 60))));
    const d1 = SGADD.tramoPorDefecto(conPlayoff);
    check('con un playoff jugado DESPUÉS de la regular, abre en el playoff', d1 && d1.fase === 'PLAYOFF', d1 && d1.id);

    const soloRegular = SGADD.combinacionesTorneoFase(hojasDe(NORTE));
    const d2 = SGADD.tramoPorDefecto(soloRegular);
    check('sin postemporada, la regular de siempre', d2 && d2.fase === 'REGULAR');

    /* Un playoff cargado con fecha ANTERIOR a lo último de la regular no
       es la fase en curso: manda el último partido. */
    const raro = SGADD.combinacionesTorneoFase(hojasDe(NORTE.concat(
      partido('01/02/2026', 'PLAYOFF', OB, BJ, 80, 60))));
    const d3 = SGADD.tramoPorDefecto(raro);
    check('si lo último jugado es de la regular, abre en la regular', d3 && d3.fase === 'REGULAR', d3 && d3.id);

    /* Con Ida y Vuelta dentro del playoff, abre en el TOTAL de ESA fase:
       la misma regla del punto 3 ter, un nivel más abajo. */
    const conT = (filas, t) => filas.map(f => Object.assign({}, f, { TORNEO: t }));
    const h = hojasDe([].concat(conT(NORTE, 'IDA'),
      conT(partido('10/04/2026', 'PLAYOFF', OB, BJ, 80, 60), 'IDA'),
      conT(partido('15/04/2026', 'PLAYOFF', BJ, OB, 70, 60), 'VUELTA')));
    h['PROMEDIOS E'].cols.push('TORNEO');
    h['PROMEDIOS E'].filas = [];
    ['IDA', 'VUELTA'].forEach(t => h['Base Datos E'].filas.filter(f => f.TORNEO === t).forEach((f) => {
      if (!h['PROMEDIOS E'].filas.some(x => x.EQUIPO === f.EQUIPO && x.FASE === f.FASE && x.TORNEO === t)) {
        h['PROMEDIOS E'].filas.push({ EQUIPO: f.EQUIPO, FASE: f.FASE, PJ: 1, PTS: 70, TORNEO: t });
      }
    }));
    h['Base Datos E'].cols.push('TORNEO');
    const d4 = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(h));
    check('con dos torneos en el playoff, abre en su TOTAL', d4 && d4.id === '*TOTAL*|PLAYOFF', d4 && d4.id);

    const tr = SGADD.combinacionesTorneoFase(hojasDe(NORTE));
    check('cada tramo trae la fecha de su último partido', tr[0].ultima === new Date(2026, 2, 6).getTime(), tr[0].ultima);
  }

  /* =====================================================================
     4 · LA ZONA DE LA POSTEMPORADA EN EL CATÁLOGO
     ===================================================================== */
  seccion('4 · la zona interzonal del torneo');
  {
    const base = { obras: JSON.parse(JSON.stringify(CAT.obras)) };
    const doc = { id: 'liga-y', nombre: 'Liga Y', formato: FORMATO, zonas: {
      norte: { label: 'Norte', equipos: [{ nombre: OB }, { nombre: JU }] },
      post: { label: 'Postemporada', interzonal: true, equipos: [{ nombre: OB }] },
    } };
    const r = mutar.aplicar(base, 'torneo', TORNEOS.intencionDesdeArchivo(doc, { post: ID.post }), catalogo.validar);
    check('un torneo con zona de postemporada se da de alta', r.ok, r.motivo);
    const k = r.ok && Object.values(r.catalogo['liga-y'].categorias).find(c => c.zona === 'post');
    check('la zona queda marcada interzonal', k && k.interzonal === true);
    check('SIN equipos propios: ahí juegan los de las otras zonas (y no choca por duplicado)', k && k.equipos.length === 0);

    const eng = mutar.aplicar(r.catalogo, 'vincular_torneo',
      { club: 'obras', categoria: 'obras-ly', torneo: 'liga-y', zona: 'post' }, catalogo.validar);
    check('a la postemporada NO se engancha un cliente', !eng.ok && /postemporada/.test(eng.motivo), eng.motivo);

    /* El libro de la postemporada no se propaga: aunque hubiera alguien
       con el enganche escrito a mano, no recibe ese libro. */
    const c2 = JSON.parse(JSON.stringify(r.catalogo));
    c2.obras.categorias['obras-ly'] = { label: 'Y', torneo: 'liga-y', zona: 'post' };
    const otro = 'Q'.repeat(30) + 'libroPost99';
    const r2 = mutar.aplicar(c2, 'torneo', TORNEOS.intencionDesdeArchivo(doc, { post: otro }), catalogo.validar);
    check('el libro de la postemporada NO se propaga a nadie',
      r2.ok && !(r2.catalogo.obras.categorias['obras-ly'].sheetId), r2.motivo || r2.catalogo.obras.categorias['obras-ly']);

    const pub = catalogo.publico(r.catalogo, { admin: true, origen: 'kv' });
    const zp = pub.find(c => c.id === 'liga-y').categorias.find(c => c.zona === 'post');
    check('el admin ve la zona marcada como postemporada', zp && zp.interzonal === true);
  }

  /* =====================================================================
     5 · MULTILIBRO · los libros vinculados y el acceso por partido (punto 77)
     ===================================================================== */
  seccion('5 · un torneo con dos libros: el cliente lee SUS partidos del segundo');
  {
    const MULTI = require('./server/lib/multilibro.js');
    /* Libros con jugadores, para ver que el filtro alcanza a las tres
       maestras y a las derivadas. Un jugador por equipo y por partido. */
    const libroCompleto = (filasBD) => {
      const l = libroApi(filasBD);
      const cabJ = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'NOMBRES', 'PTS'];
      l.hojas['Base Datos J'] = [cabJ].concat(filasBD.map(f => [f.FECHA, f.PARTIDO, f.EQUIPO, f.FASE, 'CAPITAN, ' + f.EQUIPO, f.PTS]));
      const vistos = {};
      filasBD.forEach((f) => { vistos[f.EQUIPO + '|' + f.FASE] = f; });
      const cabPJ = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'PTS'];
      l.hojas['PROMEDIOS J'] = [cabPJ].concat(Object.keys(vistos).map(k => ['CAPITAN, ' + vistos[k].EQUIPO, vistos[k].EQUIPO, vistos[k].FASE, 1, 999]))
        .concat([['JUGADOR TIPO', '', filasBD[0].FASE, 1, 50]]);
      /* PTS 999 en las derivadas: si un promedio «sucio» se cuela, se ve. */
      l.hojas['PROMEDIOS E'] = [l.hojas['PROMEDIOS E'][0]].concat(l.hojas['PROMEDIOS E'].slice(1).map(r => [r[0], r[1], r[2], 999]));
      return l;
    };
    /* PLAYOFFS A: Obras-River (2) y Gimnasia-Jujuy (1). PERMANENCIA todos
       contra todos: Salta, Barrio Jardín y Estudiantes. */
    const PERM = [].concat(partido('20/04/2026', 'PERMANENCIA', SA, BJ, 70, 60),
      partido('22/04/2026', 'PERMANENCIA', BJ, ES, 81, 80), partido('24/04/2026', 'PERMANENCIA', ES, SA, 66, 64));
    const IDM = { poa: 'A'.repeat(30) + 'libroPlayA1', perm: 'M'.repeat(30) + 'libroPerm22', saltaZ: 'Z'.repeat(30) + 'libroSalta3' };
    const previo = sheets.obtenerLibro;
    sheets.obtenerLibro = async (id) => {
      if (id === IDM.poa) return libroCompleto(POST);
      if (id === IDM.perm) return libroCompleto(PERM);
      if (id === IDM.saltaZ) return libroCompleto(NORTE);
      return previo(id);
    };
    const CATM = JSON.parse(JSON.stringify(CAT));
    CATM['liga-m'] = { tipo: 'torneo', nombre: 'Liga M', liga: 'liga-argentina', formato: FORMATO, categorias: {
      'lm-norte': { label: 'Norte', sheetId: ID.norte, zona: 'norte', equipos: [OB, JU, SA, BJ].map(eq) },
      'lm-sur': { label: 'Sur', sheetId: ID.sur, zona: 'sur', equipos: [GI, RI, VM, ES].map(eq) },
      'lm-po-a': { label: 'Playoff A', sheetId: IDM.poa, zona: 'po-a', interzonal: true, rol: 'playoffs', equipos: [] },
      'lm-perm': { label: 'Permanencia', sheetId: IDM.perm, zona: 'perm', interzonal: true, rol: 'permanencia',
        participan: ['norte', 'sur'], equipos: [] },
      'lm-rep': { label: 'Repechaje Sur', sheetId: 'R'.repeat(40), zona: 'rep', interzonal: true, rol: 'repechaje',
        participan: ['sur'], equipos: [] },
    } };
    CATM.obras.categorias['obras-lm'] = { label: 'Liga M', sheetId: ID.obras, torneo: 'liga-m', zona: 'norte' };
    CATM.salta2 = { nombre: 'Salta', liga: 'liga-argentina', equipoPropio: SA, plan: 'PLATA',
      categorias: { 'salta-lm': { label: 'Liga M', sheetId: IDM.saltaZ, torneo: 'liga-m', zona: 'norte' } } };
    store[catalogo.CLAVE_KV] = JSON.stringify(CATM);
    const tokSalta2 = auth.firmarToken({ email: 'dt@salta2.com', club: 'salta2', equipoAsignado: SA, plan: 'PLATA' }, { expiraEn: '1h' });

    const vs = MULTI.vinculadosDe(CATM, 'obras', 'obras-lm').map(v => v.slug);
    check('la categoría de Norte ve los libros vinculados que la incluyen', vs.join(',') === 'lm-perm,lm-po-a', vs);
    check('y NO el repechaje de la Sur (`participan` la deja afuera)', vs.indexOf('lm-rep') === -1);
    check('las zonas regulares no son libros vinculados', vs.indexOf('lm-sur') === -1 && vs.indexOf('lm-norte') === -1);

    const r = await pedirLibro(tokObras, 'obras', 'obras-lm');
    check('el cliente de Obras pide SU libro: 200', r.status === 200, r.body && r.body.codigo);
    const h = r.body.hojas || {};
    const filas = (n) => DATOS_F(h[n]);
    const bdE = filas('Base Datos E');
    const cuartos = bdE.filter(f => f.FASE === 'CUARTOS');
    check('entran los partidos de SU equipo en el Libro 2: Obras-River, los dos, de los dos lados',
      cuartos.length === 4 && cuartos.every(f => /OBRAS/.test(f.PARTIDO)), cuartos.map(f => f.PARTIDO));
    check('NO entra Gimnasia-Jujuy: su equipo no jugó ese partido',
      !bdE.some(f => /GIMNASIA/.test(f.PARTIDO) && /JUJUY/.test(f.PARTIDO)));
    check('la fase regular de su zona sigue entera', bdE.filter(f => f.FASE === 'REGULAR').length === 12);
    const pe = filas('PROMEDIOS E').filter(f => f.FASE === 'CUARTOS').map(f => f.EQUIPO).sort();
    check('promedios de la fase: el suyo y el del rival de la serie, que no jugó contra nadie más',
      pe.join(',') === [OB, RI].sort().join(','), pe);
    const bdJ = filas('Base Datos J').filter(f => f.FASE === 'CUARTOS');
    check('Base Datos J: solo los partidos donde jugó (y el recorte del plan sigue después)',
      bdJ.length > 0 && bdJ.every(f => /OBRAS/.test(f.PARTIDO)), bdJ.map(f => f.PARTIDO));
    check('la mediana de la fase (fila TIPO) viaja: es agregada, como la tabla',
      filas('PROMEDIOS J').some(f => f.NOMBRES === 'JUGADOR TIPO' && f.FASE === 'CUARTOS'));
    check('la respuesta dice qué libros entraron, con etiqueta y rol',
      (r.body.vinculados || []).some(v => v.label === 'Playoff A' && v.rol === 'playoffs' && v.partidos === 2), r.body.vinculados);
    check('ningún sheetId de los libros vinculados viaja', !/A{25}|M{25}|R{25}/.test(JSON.stringify(r.body)));

    /* El índice del navegador: la fase aparece como una más, sin modo llave. */
    const hojasIdx = {};
    Object.keys(h).forEach((n) => { hojasIdx[n] = DATOS_F2(h[n]); });
    const tramos = SGADD.combinacionesTorneoFase(hojasIdx);
    check('los cuartos son un tramo del libro del cliente', tramos.some(t => t.fase === 'CUARTOS'), tramos.map(t => t.id));
    const lista = F.enriquecerTramos(tramos, fases);
    check('y el selector ya NO los ofrece en modo llave: hay estadísticas',
      !lista.some(t => t.llave && t.declarada === 'cuartos'), lista.map(t => t.id));
    const idxC = SGADD.construirIndice(hojasIdx, { fase: 'CUARTOS' });
    check('el índice de los cuartos tiene a Obras y a River', idxC.lista().length === 2 && !!idxC.get(OB) && !!idxC.get(RI),
      idxC.lista().map(e => e.nombre));

    seccion('5 bis · lo que el cliente NO puede leer del Libro 2');
    const directo = await pedirLibro(tokObras, 'liga-m', 'lm-po-a');
    check('el Libro 2 entero, pedido directo: 403', directo.status === 403, directo.body);
    const rs = await pedirLibro(tokSalta2, 'salta2', 'salta-lm');
    check('un cliente cuyo equipo no jugó los playoffs: 200 con su zona', rs.status === 200, rs.body && rs.body.codigo);
    const bdS = DATOS_F(rs.body.hojas['Base Datos E']);
    check('…y del Libro 2 no recibe NI UNA fila', !bdS.some(f => f.FASE === 'CUARTOS'));
    check('…con los playoffs informados en cero partidos',
      (rs.body.vinculados || []).some(v => v.label === 'Playoff A' && v.partidos === 0), rs.body.vinculados);

    seccion('5 ter · todos contra todos: el rival que jugó con otros se re-deriva');
    const perm = bdS.filter(f => f.FASE === 'PERMANENCIA');
    check('de la permanencia entran sus dos partidos, no Barrio Jardín-Estudiantes',
      perm.length === 4 && !perm.some(f => /BARRIO/.test(f.PARTIDO) && /ESTUDIANTES/.test(f.PARTIDO)), perm.map(f => f.PARTIDO));
    const peS = DATOS_F(rs.body.hojas['PROMEDIOS E']).filter(f => f.FASE === 'PERMANENCIA');
    const bj = peS.find(f => f.EQUIPO === BJ);
    check('el promedio de Barrio Jardín NO es el del libro (999): mezcla un partido ajeno', bj && Number(bj.PTS) !== 999, bj);
    check('se re-derivó de su partido contra Salta: 60 puntos', bj && Number(bj.PTS) === 60, bj);
    check('Salta conserva el suyo (el del libro)', peS.some(f => f.EQUIPO === SA && Number(f.PTS) === 999), peS);
    check('los jugadores del rival con partidos ajenos NO viajan en PROMEDIOS J',
      !DATOS_F(rs.body.hojas['PROMEDIOS J']).some(f => f.FASE === 'PERMANENCIA' && f.EQUIPO === BJ));

    seccion('5 quater · sin duplicar y sin tumbar la zona');
    const conCopia = libroApi(NORTE.concat(partido('10/04/2026', 'CUARTOS', OB, RI, 88, 70)));
    const fus = MULTI.fusionar(conCopia, [{ slug: 'x', label: 'X', rol: 'playoffs', libro: libroCompleto(POST) }], SGADD.claveEquipo(OB));
    const f10 = fus.hojas['Base Datos E'].slice(1).filter(x => x[0] === '10/04/2026');
    check('un partido escrito en los dos libros entra UNA vez (gana el de la zona)', f10.length === 2, f10.length);
    check('fusionar no toca el libro de entrada (viene del caché de Google)', conCopia.hojas['Base Datos E'].length === 15);
    const caido = await MULTI.leerVinculados(libroApi(NORTE), [{ slug: 'y', label: 'Caído', sheetId: 'x' }],
      SGADD.claveEquipo(OB), async () => { throw new Error('Google no contestó'); });
    check('un libro vinculado ilegible no tumba el de la zona', caido.hojas['Base Datos E'].length === 13
      && caido.vinculadosCaidos && caido.vinculadosCaidos[0].label === 'Caído');

    LLAVE.limpiarCache();
    const lm = await pedirLlave(tokAdmin, 'liga-m');
    const pm = (lm.body.postemporada || {}).partidos || [];
    check('la llave junta los resultados de TODOS los libros vinculados (playoffs y permanencia)',
      lm.status === 200 && pm.filter(p => p.fase === 'CUARTOS').length === 3 && pm.filter(p => p.fase === 'PERMANENCIA').length === 3, pm.length);
    check('y los libros vinculados no se listan como zonas', Object.keys(lm.body.zonas || {}).sort().join() === 'norte,sur',
      Object.keys(lm.body.zonas || {}));
    LLAVE.limpiarCache();

    seccion('5 quinquies · el Panel Master: vincular libros y declarar la llave');
    const base = JSON.parse(JSON.stringify(CATM));
    const vinc = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: {
      'po-b': { label: 'Playoff B', rol: 'playoffs', participan: ['norte'], sheetId: 'B'.repeat(40) } } }, catalogo.validar);
    check('se vincula un libro nuevo con rol y zonas', vinc.ok, vinc.motivo);
    const kb = vinc.ok && vinc.catalogo['liga-m'].categorias['liga-m-po-b'];
    check('queda como libro vinculado, con su rol y sus zonas', kb && kb.interzonal && kb.rol === 'playoffs'
      && kb.participan.join() === 'norte', kb);
    check('sin equipos propios y sin propagarse a nadie', kb && kb.equipos.length === 0 && !(vinc.propagado || []).length);
    const malRol = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: {
      'x1': { label: 'X', rol: 'octogonal', sheetId: 'B'.repeat(40) } } }, catalogo.validar);
    check('un rol que no existe se rechaza', !malRol.ok && /rol/.test(malRol.motivo), malRol.motivo);
    const malZona = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: {
      'x2': { label: 'X', rol: 'repechaje', participan: ['oeste'], sheetId: 'B'.repeat(40) } } }, catalogo.validar);
    check('participar con una zona que no existe se rechaza', !malZona.ok && /oeste/.test(malZona.motivo), malZona.motivo);
    const aPost = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: {
      'x3': { label: 'X', rol: 'repechaje', participan: ['po-a'], sheetId: 'B'.repeat(40) } } }, catalogo.validar);
    check('ni con otro libro vinculado: participan zonas REGULARES', !aPost.ok, aPost.motivo);
    const baja = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: { rep: null } }, catalogo.validar);
    check('un libro vinculado se desvincula', baja.ok && !baja.catalogo['liga-m'].categorias['lm-rep'], baja.motivo);
    const bajaReg = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', zonas: { norte: null } }, catalogo.validar);
    check('una zona regular NO se desvincula por acá', !bajaReg.ok && /regular/.test(bajaReg.motivo), bajaReg.motivo);

    const llaveMal = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M', formato: { fases: [
      { id: 'cuartos', cruces: [{ id: 'C1', a: { zona: 'norte', puesto: 1 }, b: { ganador: 'C9' } }] }] } }, catalogo.validar);
    check('una llave con un cruce que apunta a la nada NO se guarda', !llaveMal.ok && /llave/.test(llaveMal.motivo), llaveMal.motivo);
    const NUEVAS = [{ id: 'regular', label: 'Regular', cruce: 'zona' },
      { id: 'cuartos', label: 'Cuartos', cruce: 'interzonal', zonaLibro: 'po-a', libro: ['CUARTOS'], serie: { mejorDe: 3 },
        cruces: [{ id: 'C1', a: { zona: 'norte', puesto: 1 }, b: { zona: 'norte', puesto: 8 } },
                 { id: 'C2', a: { zona: 'norte', puesto: 8 }, b: { zona: 'sur', puesto: 4 } }] }];
    const llaveOk = mutar.aplicar(base, 'torneo', { club: 'liga-m', nombre: 'Liga M',
      formato: Object.assign({}, FORMATO, { fases: NUEVAS }) }, catalogo.validar);
    check('una llave válida («1° Zona A vs 8° Zona A», «8° Zona A vs 4° Zona B») se guarda en KV', llaveOk.ok, llaveOk.motivo);
    const pubC = catalogo.publico(llaveOk.catalogo, { club: 'obras', origen: 'kv' });
    const kC = pubC.find(c => c.id === 'obras').categorias.find(c => c.slug === 'obras-lm');
    check('la categoría del cliente recibe la llave guardada en KV', kC && kC.torneoDecl && kC.torneoDecl.origen === 'kv'
      && kC.torneoDecl.formato.fases.length === 2, kC && kC.torneoDecl);
    check('sin un solo sheetId', !/A{25}|M{25}|R{25}|N{25}|S{25}/.test(JSON.stringify(kC.torneoDecl)));
    const kX = pubC.find(c => c.id === 'obras').categorias.find(c => c.slug === 'obras-lx');
    check('la categoría de OTRO torneo recibe la de su torneo, no esta', kX.torneoDecl && kX.torneoDecl.id === 'liga-x', kX.torneoDecl);

    /* EL PANEL LA PREFIERE AL ARCHIVO DEL REPO. */
    global.SGADD_APP = { estado: { planillaId: 'obras-lm-p' } };
    /* El catálogo que lee el parser es el del núcleo que ve SU módulo: con
       los módulos del servidor cargados, es el global. */
    const CORE_F = (typeof global.SGADD !== 'undefined') ? global.SGADD : SGADD;
    CORE_F.CATALOGO.planillas.push({ id: 'obras-lm-p', torneoId: 'liga-m', zonaId: 'norte', torneoDecl: kC.torneoDecl });
    const decl = F.declaradas();
    check('declaradas() lee la llave de KV sin el archivo del torneo',
      decl.length === 2 && decl[1].cruces[1].a.puesto === 8 && decl[1].cruces[1].b.zona === 'sur', decl.map(d => d.id));
    CORE_F.CATALOGO.planillas.pop();
    delete global.SGADD_APP;
    sheets.obtenerLibro = previo;
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
  }

  seccion('6 · el Panel Master: libros vinculados y editor de cruces');
  {
    global.SGADD_FASES = F;
    const TU = require('./js/sgadd-torneos.js');
    const CATU = JSON.parse(JSON.stringify(CAT));
    CATU['liga-x'].categorias['lx-perm'] = { label: 'Permanencia', sheetId: 'M'.repeat(40), zona: 'perm',
      interzonal: true, rol: 'permanencia', participan: ['norte'], equipos: [] };
    const lista = catalogo.publico(CATU, { admin: true, origen: 'kv' });
    const t = lista.find(c => c.id === 'liga-x');
    check('las zonas regulares no incluyen los libros vinculados', TU.zonasDe(t).map(z => z.zona).sort().join() === 'norte,sur');
    const ls = TU.librosDe(t);
    check('los libros vinculados, con rol y zonas', ls.length === 2 && ls.some(l => l.zona === 'perm' && l.rol === 'permanencia'
      && l.participan.join() === 'norte') && ls.some(l => l.zona === 'post' && l.rol === 'playoffs'), ls);
    const a = TU.arbol(lista).torneos.find(x => x.id === 'liga-x');
    check('la zona de la postemporada no pide «+ cliente»: no es una zona donde se juega la regular',
      a.zonas.every(z => z.zona !== 'post' && z.zona !== 'perm'));
    const h = TU.html(lista);
    check('la tarjeta del torneo muestra el bloque de libros vinculados', /Libros vinculados/.test(h) && /Permanencia/.test(h));
    check('y el de cruces, con los slots en castellano', /la llave/.test(h) && /1° Conferencia Norte vs 2° Conferencia Sur/.test(h));
    check('ningún sheetId en la pantalla', !/M{25}|P{25}|N{25}/.test(h));

    /* El editor: ida y vuelta sin perder lo que no edita. */
    const fOrig = Object.assign({}, FORMATO.fases[1], { desde: '2026-04-01', hasta: '2026-04-30' });
    const ida = TU.editorAFase(TU.faseAEditor(fOrig));
    check('una fase pasa por el editor y vuelve igual', JSON.stringify(ida.cruces) === JSON.stringify(fOrig.cruces)
      && ida.zonaLibro === 'post' && ida.serie.mejorDe === 3 && ida.cruce === 'interzonal', ida);
    check('lo que el editor no conoce (la ventana) no se pierde', ida.desde === '2026-04-01' && ida.hasta === '2026-04-30');
    check('«1° Zona A» se lee así', TU.ladoTexto({ zona: 'norte', puesto: 1 }, { norte: 'Zona A' }) === '1° Zona A'
      && TU.ladoTexto({ ganador: 'C1' }) === 'Ganador C1');
    const conError = TU.editorAFase(Object.assign(TU.faseAEditor({ id: 'semis' }), { cruces: [
      { id: 'S1', a: { tipo: 'ganador', ref: 'C9', zona: '', puesto: '' }, b: { tipo: 'puesto', ref: '', zona: 'norte', puesto: '1' } }] }));
    check('el editor denuncia un cruce que apunta a la nada con el parser del panel',
      TU.erroresLlave([conError]).length > 0, TU.erroresLlave([conError]));
    const il = TU.intencionLlave(t, [ida]);
    check('guardar la llave conserva el resto del formato', il.accion === 'torneo' && il.formato.partidosPorEquipo === 3
      && il.formato.fases.length === 1);

    const b = { label: 'Playoff B', rol: 'playoffs', participan: { norte: true, sur: false }, libro: 'https://docs.google.com/spreadsheets/d/' + 'B'.repeat(40) + '/edit' };
    check('al vínculo nuevo no le falta nada', TU.faltantesLibro(b, t).length === 0, TU.faltantesLibro(b, t));
    const ib = TU.intencionLibro(t, b);
    check('la intención saca el id del link, el slug de la etiqueta y solo las zonas tildadas',
      ib.zonas['playoff-b'] && ib.zonas['playoff-b'].sheetId === 'B'.repeat(40) && ib.zonas['playoff-b'].participan.join() === 'norte'
      && ib.zonas['playoff-b'].rol === 'playoffs', ib);
    check('un id que ya existe se pide cambiar', TU.faltantesLibro({ label: 'Post', rol: 'playoffs', participan: {}, libro: 'B'.repeat(40) }, t)
      .some(x => /ya existe/.test(x)));
    const r = mutar.aplicar(JSON.parse(JSON.stringify(CATU)), 'torneo', ib, catalogo.validar);
    check('y el servidor la acepta tal cual', r.ok, r.motivo);
    delete global.SGADD_FASES;
  }

  /* =====================================================================
     7 · AISLAMIENTO POR ZONA Y LOS NOMBRES DE OTRAS ZONAS (punto 78)

     Calcado del catálogo REAL de la APB del 2026-09-30: la declaración de
     KV NO trae fase regular (el editor guardó solo las de eliminación),
     los repechajes cruzan B-C y A-B, y dos fases se llaman igual,
     «Playoffs - Zona A». Con eso un cliente de la Zona B veía los
     playoffs de la A y todos los puestos de otra zona salían «a definir».
     ===================================================================== */
  seccion('7 · cada zona ve SUS fases, y el «2° Zona C» tiene nombre');
  {
    const AT = 'ATENAS A', PL = 'PLATENSE A', RE = "RECONQUISTA 'A' - MM", GO = 'GONNET';
    const DE = 'DEPORTIVO LA PLATA', HO = 'HOGAR SOCIAL', UN = 'UNIVERSITARIO', SU = 'SUD AMERICA LP';
    const UV = 'UNIVERSAL', NA = 'NAUTICO ENSENADA', TO = 'C.C. TOLOSANO', JV = 'JUVENTUD';
    const ZA = zona4(AT, PL, RE, GO, '05'), ZB = zona4(DE, HO, UN, SU, '05'), ZC = zona4(UV, NA, TO, JV, '05');
    const REP = partido('01/07/2026', 'REPECHAJE B-C', UN, NA, 70, 65);
    const REPAB = partido('02/07/2026', 'REPECHAJE A-B', RE, HO, 60, 64);
    const POA = partido('03/07/2026', 'CUARTOS', AT, GO, 90, 60);
    const IDS = { a: 'A'.repeat(30) + 'apbZonaA001', b: 'B'.repeat(30) + 'apbZonaB002', c: 'C'.repeat(30) + 'apbZonaC003',
      rep: 'R'.repeat(30) + 'apbRepBC004', repab: 'Q'.repeat(30) + 'apbRepAB005', poa: 'Y'.repeat(30) + 'apbPlayA006' };
    const LIBROS = {}; LIBROS[IDS.a] = ZA; LIBROS[IDS.b] = ZB; LIBROS[IDS.c] = ZC;
    LIBROS[IDS.rep] = REP; LIBROS[IDS.repab] = REPAB; LIBROS[IDS.poa] = POA;
    const previo = sheets.obtenerLibro;
    sheets.obtenerLibro = async (id) => (LIBROS[id] ? libroApi(LIBROS[id]) : previo(id));

    const FASES_APB = [
      { id: 'Repechaje_zona_b_c', label: 'Repechaje - Zona B/C', libro: ['REPECHAJE B-C'], cruce: 'interzonal',
        zonaLibro: 'repechaje', serie: { mejorDe: 3 }, cruces: [
          { id: 'R8', a: { zona: 'b', puesto: 3 }, b: { zona: 'c', puesto: 2 } },
          { id: 'R9', a: { zona: 'b', puesto: 4 }, b: { zona: 'c', puesto: 1 } }] },
      { id: 'Repechaje_zona_a_b', label: 'Repechaje - Zona A/B', libro: ['REPECHAJE A-B'], cruce: 'interzonal',
        zonaLibro: 'repechaje-a-b', serie: { mejorDe: 3 }, cruces: [
          { id: 'R3', a: { zona: 'a', puesto: 3 }, b: { zona: 'b', puesto: 2 } }] },
      { id: 'cuartos_zona_a', label: 'Playoffs - Zona A', libro: ['CUARTOS'], cruce: 'zona', zonaLibro: 'playoffs-zona-a',
        serie: { mejorDe: 3 }, cruces: [
          { id: 'P5', a: { zona: 'a', puesto: 1 }, b: { zona: 'a', puesto: 4 } },
          { id: 'P6', a: { zona: 'a', puesto: 2 }, b: { zona: 'a', puesto: 3 } }] },
      { id: 'semifinal_zona_a', label: 'Playoffs - Zona A', libro: ['SEMIFINAL'], cruce: 'zona', zonaLibro: 'playoffs-zona-a',
        serie: { mejorDe: 3 }, cruces: [{ id: 'P9', a: { ganador: 'P5' }, b: { ganador: 'P6' } }] },
    ];
    const CAT7 = {
      apb: { tipo: 'torneo', nombre: 'APB', liga: 'la-plata', formato: { fases: FASES_APB }, categorias: {
        'apb-a': { label: 'Zona A', sheetId: IDS.a, zona: 'a', equipos: [AT, PL, RE, GO].map(eq) },
        'apb-b': { label: 'Zona B', sheetId: IDS.b, zona: 'b', equipos: [DE, HO, UN, SU].map(eq) },
        'apb-c': { label: 'Zona C', sheetId: IDS.c, zona: 'c', equipos: [UV, NA, TO, JV].map(eq) },
        'apb-rep': { label: 'Repechaje B/C', sheetId: IDS.rep, zona: 'repechaje', interzonal: true, rol: 'repechaje', participan: ['b', 'c'], equipos: [] },
        'apb-rep-ab': { label: 'Repechaje A/B', sheetId: IDS.repab, zona: 'repechaje-a-b', interzonal: true, rol: 'repechaje', participan: ['a', 'b'], equipos: [] },
        'apb-po-a': { label: 'Playoffs Zona A', sheetId: IDS.poa, zona: 'playoffs-zona-a', interzonal: true, rol: 'playoffs', participan: ['a'], equipos: [] },
      } },
      depo: { nombre: 'Deportivo', liga: 'la-plata', equipoPropio: DE, plan: 'PLATA',
        categorias: { 'depo-pri': { label: 'Primera', sheetId: IDS.b, torneo: 'apb', zona: 'b' } } },
      reco: { nombre: 'Reconquista', liga: 'la-plata', equipoPropio: RE, plan: 'PLATA',
        categorias: { 'reco-pri': { label: 'Primera', sheetId: IDS.a, torneo: 'apb', zona: 'a' } } },
    };
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT7);
    const tokDepo = auth.firmarToken({ email: 'dt@depo.com', club: 'depo', equipoAsignado: DE, plan: 'PLATA' }, { expiraEn: '1h' });
    const tokReco = auth.firmarToken({ email: 'dt@reco.com', club: 'reco', equipoAsignado: RE, plan: 'PLATA' }, { expiraEn: '1h' });
    const PART = TORNEOS.participanDeTorneo(CAT7.apb);

    /* --- el motor */
    const p = F.parsear({ fases: FASES_APB }, { participan: PART });
    const z = (id) => (p.fases.find(f => f.id === id).zonas || []).join();
    check('las zonas de cada fase salen de sus cruces', z('Repechaje_zona_b_c') === 'b,c' && z('Repechaje_zona_a_b') === 'a,b'
      && z('cuartos_zona_a') === 'a', p.fases.map(f => f.id + ':' + f.zonas));
    check('«Ganador P5» hereda la zona de P5: la semifinal es de la A', z('semifinal_zona_a') === 'a');
    check('la Zona B recibe SOLO los dos repechajes', F.filtrarPorZona(p.fases, 'b').map(f => f.id).join() === 'Repechaje_zona_b_c,Repechaje_zona_a_b');
    check('la Zona C, solo el suyo', F.filtrarPorZona(p.fases, 'c').map(f => f.id).join() === 'Repechaje_zona_b_c');
    check('sin zona (un club sin torneo) se ven todas', F.filtrarPorZona(p.fases, null).length === 4);
    check('dos fases con el mismo nombre se distinguen por su instancia',
      new Set(p.fases.map(f => f.label)).size === 4 && p.fases.some(f => f.label === 'Playoffs - Zona A · Cuartos de final'),
      p.fases.map(f => f.label));
    const sinCruces = F.parsear({ fases: [{ id: 'perm', label: 'Permanencia', libro: ['PERMANENCIA'], zonaLibro: 'repechaje' }] }, { participan: PART }).fases[0];
    check('una fase sin cruces toma las zonas del libro donde se juega', (sinCruces.zonas || []).join() === 'b,c' && sinCruces.zonasOrigen === 'libro', sinCruces.zonas);
    const decl = F.parsear({ fases: [Object.assign({}, FASES_APB[0], { zonas: ['C'] })] }).fases[0];
    check('las zonas DECLARADAS ganan sobre las deducidas', (decl.zonas || []).join() === 'c' && decl.zonasOrigen === 'declarada');
    const mala = F.parsear({ fases: [Object.assign({}, FASES_APB[0], { zonas: ['z'] })] }, { zonasValidas: ['a', 'b', 'c'] });
    check('una zona que el torneo no tiene es un error', mala.errores.some(e => /«z» no es una zona/.test(e)), mala.errores);
    const finalAB = F.parsear({ fases: FASES_APB.concat([{ id: 'final', label: 'Final', cruces: [
      { id: 'F1', a: { ganador: 'P9' }, b: { ganador: 'R8' } }] }]) }).fases;
    const depsB = F.dependenciasDe(finalAB, F.filtrarPorZona(finalAB, 'b')).map(f => f.id);
    check('una final A-B la ve la Zona B, y se carga la semifinal A que la resuelve (sin mostrarla)',
      depsB.indexOf('final') !== -1 && depsB.indexOf('semifinal_zona_a') !== -1 && depsB.indexOf('cuartos_zona_a') !== -1
      && F.filtrarPorZona(finalAB, 'b').every(f => f.id !== 'semifinal_zona_a'), depsB);
    const tramosB = F.enriquecerTramos([{ id: 'GENERAL|REGULAR', torneo: SGADD.TORNEO_GENERAL, fase: 'REGULAR', label: 'Regular' }],
      F.filtrarPorZona(p.fases, 'b'));
    check('el selector de la Zona B no ofrece «Playoffs - Zona A»', tramosB.every(t => !/Playoffs/.test(t.label))
      && tramosB.filter(t => t.llave).length === 2, tramosB.map(t => t.label));

    /* --- el catálogo: lo que viaja en torneoDecl */
    const faseIds = (lista, club) => (((lista.find(c => c.id === club) || {}).categorias || [])[0] || {}).torneoDecl.formato.fases.map(f => f.id).join();
    check('el cliente de la Zona B recibe un array de fases SIN las de la Zona A',
      faseIds(catalogo.publico(CAT7, { club: 'depo', origen: 'kv' }), 'depo') === 'Repechaje_zona_b_c,Repechaje_zona_a_b',
      faseIds(catalogo.publico(CAT7, { club: 'depo', origen: 'kv' }), 'depo'));
    check('el de la Zona A, las suyas y el repechaje que comparte con la B',
      faseIds(catalogo.publico(CAT7, { club: 'reco', origen: 'kv' }), 'reco') === 'Repechaje_zona_a_b,cuartos_zona_a,semifinal_zona_a');
    check('el admin, todas: su Panel Master las edita', faseIds(catalogo.publico(CAT7, { admin: true, origen: 'kv' }), 'depo').split(',').length === 4);
    const zdecl = catalogo.publico(CAT7, { club: 'depo', origen: 'kv' }).find(c => c.id === 'depo').categorias[0].torneoDecl.zonas;
    check('y los libros vinculados viajan con sus zonas que participan, sin el sheetId',
      zdecl.repechaje.participan.join() === 'b,c' && !/apbRep|R{25}/.test(JSON.stringify(zdecl)));

    /* --- la llave del servidor */
    LLAVE.limpiarCache();
    check('la fase regular NO es la primera declarada: sin una de liga, es REGULAR',
      LLAVE.faseRegular({ fases: FASES_APB }) === 'REGULAR', LLAVE.faseRegular({ fases: FASES_APB }));
    const rB = await pedirLlave(tokDepo, 'apb');
    check('la Zona B recibe la llave (200)', rB.status === 200, rB.body);
    const zb = rB.body.zonas || {};
    check('con las tablas de las TRES zonas que sus repechajes cruzan, y llenas',
      ['a', 'b', 'c'].every(k => zb[k] && zb[k].filas.length === 4), Object.keys(zb).map(k => k + ':' + (zb[k].filas || []).length));
    const pB = rB.body.postemporada.partidos;
    check('sus repechajes sí', pB.some(x => x.fase === 'REPECHAJE B-C') && pB.some(x => x.fase === 'REPECHAJE A-B'), pB);
    check('los playoffs de la Zona A NO', pB.every(x => x.fase !== 'CUARTOS'), pB);
    const rA = await pedirLlave(tokReco, 'apb');
    const za = rA.body.zonas || {};
    check('la Zona A recibe sus playoffs y el repechaje A/B, y no el B/C',
      rA.body.postemporada.partidos.some(x => x.fase === 'CUARTOS')
      && rA.body.postemporada.partidos.every(x => x.fase !== 'REPECHAJE B-C'), rA.body.postemporada.partidos);
    check('y no la tabla de la Zona C, que ninguna de sus fases cruza', !!za.a && !!za.b && !za.c, Object.keys(za));
    const rAd = await pedirLlave(tokAdmin, 'apb');
    check('el admin recibe todo', Object.keys(rAd.body.zonas).length === 3 && rAd.body.postemporada.partidos.length === 3);
    check('ningún sheetId viaja', !/apbZona|apbRep|apbPlay/.test(JSON.stringify([rB.body, rA.body, rAd.body])));

    /* --- el cliente de la Zona B traduce los puestos de otra zona */
    const fasesB = F.filtrarPorZona(F.parsear({ fases: FASES_APB }, { participan: PART }).fases, 'b');
    const ctx = F.mezclarLlave({ tablas: {}, partidosPorFase: {}, zonaDeEquipo: {}, nombresZona: {} }, fasesB, rB.body, 'b');
    const ll = F.llave(fasesB, ctx);
    const R8 = ll.Repechaje_zona_b_c.cruces.find(c => c.id === 'R8');
    const R3 = ll.Repechaje_zona_a_b.cruces.find(c => c.id === 'R3');
    check('«2° Zona C» es NAUTICO ENSENADA, no «a definir»', R8.b.nombre === SGADD.limpiarNombre(NA) && R8.b.estado !== 'pendiente', R8.b);
    check('«3° Zona A» es RECONQUISTA A', R3.a.clave === SGADD.claveEquipo(RE) && R3.a.estado !== 'pendiente', R3.a);
    check('y la serie jugada queda con sus dos equipos', !!(R8.serie && R8.serie.a && R8.serie.b), R8.serie);

    /* --- el mismo valor de FASE en dos libros no se cruza */
    const dos = { zonas: {}, postemporada: { partidos: [
      { fase: 'CUARTOS', fecha: '2026-07-03', local: AT, visitante: GO, ptsLocal: 90, ptsVisitante: 60, zonaLibro: 'playoffs-zona-a' },
      { fase: 'CUARTOS', fecha: '2026-07-03', local: DE, visitante: SU, ptsLocal: 80, ptsVisitante: 70, zonaLibro: 'playoffs-zona-b' }] } };
    const fA = F.parsear({ fases: [FASES_APB[2]] }).fases;
    const c2 = F.mezclarLlave({ tablas: {}, partidosPorFase: {}, zonaDeEquipo: {}, nombresZona: {} }, fA, dos, 'a');
    check('«CUARTOS» del libro de la Zona B no entra a los playoffs de la A', c2.partidosPorFase.cuartos_zona_a.length === 1
      && c2.partidosPorFase.cuartos_zona_a[0].local === AT, c2.partidosPorFase);

    /* --- el pegamento del navegador: la categoría abierta decide qué se ve */
    const declAdmin = catalogo.publico(CAT7, { admin: true, origen: 'kv' }).find(c => c.id === 'depo').categorias[0].torneoDecl;
    const CORE7 = (typeof global.SGADD !== 'undefined') ? global.SGADD : SGADD;
    const planillasPrevias = CORE7.CATALOGO.planillas;
    CORE7.CATALOGO.planillas = [{ id: 'depo-pri', torneoId: 'apb', zonaId: 'b', torneoDecl: declAdmin }];
    global.SGADD_APP = { estado: { planillaId: 'depo-pri' } };
    check('con la categoría de la Zona B abierta, se muestran solo sus fases',
      F.visibles().map(f => f.id).join() === 'Repechaje_zona_b_c,Repechaje_zona_a_b', F.visibles().map(f => f.id));
    check('pero la llave se resuelve con todas las que llegaron', F.declaradas().length === 4);
    CORE7.CATALOGO.planillas = [{ id: 'depo-pri', torneoId: 'apb', zonaId: 'a', torneoDecl: declAdmin }];
    check('y al abrir una de la Zona A, las de la A', F.visibles().map(f => f.id).join() === 'Repechaje_zona_a_b,cuartos_zona_a,semifinal_zona_a',
      F.visibles().map(f => f.id));
    CORE7.CATALOGO.planillas = planillasPrevias;
    delete global.SGADD_APP;

    /* --- el Panel Master: la pertenencia por zona se edita y se valida */
    global.SGADD_FASES = F;
    const TU = require('./js/sgadd-torneos.js');
    const ed = TU.faseAEditor(Object.assign({}, FASES_APB[0], { zonas: ['b'] }));
    check('el editor lee las zonas declaradas', ed.zonas.b === true && !ed.zonas.c);
    const vuelta = TU.editorAFase(ed);
    check('y las devuelve', JSON.stringify(vuelta.zonas) === '["b"]' && vuelta.cruces.length === 2);
    check('ninguna tildada: la fase no declara zonas (se deducen)', TU.editorAFase(TU.faseAEditor(FASES_APB[0])).zonas === undefined);
    const tAdm = catalogo.publico(CAT7, { admin: true, origen: 'kv' }).find(c => c.id === 'apb');
    check('el editor rechaza una zona que el torneo no tiene', TU.erroresLlave([Object.assign({}, FASES_APB[0], { zonas: ['repechaje'] })], tAdm).length === 1);
    check('la tarjeta del torneo sigue armándose', /Repechaje - Zona B\/C/.test(TU.html(catalogo.publico(CAT7, { admin: true, origen: 'kv' }))));
    const okZ = mutar.aplicar(JSON.parse(JSON.stringify(CAT7)), 'torneo', { accion: 'torneo', club: 'apb', nombre: 'APB',
      formato: { fases: [Object.assign({}, FASES_APB[0], { zonas: ['b', 'c'] })] } }, catalogo.validar);
    check('el servidor acepta zonas del torneo', okZ.ok, okZ.motivo);
    const maloZ = mutar.aplicar(JSON.parse(JSON.stringify(CAT7)), 'torneo', { accion: 'torneo', club: 'apb', nombre: 'APB',
      formato: { fases: [Object.assign({}, FASES_APB[0], { zonas: ['playoffs-zona-a'] })] } }, catalogo.validar);
    check('y rechaza un libro vinculado como zona de una fase', !maloZ.ok && /no es una zona/.test(maloZ.motivo || ''), maloZ.motivo);
    delete global.SGADD_FASES;

    /* =================================================================
       8 · ESCUDOS DE OTRA ZONA, EL LIBRO QUE SE VE, EL CAMBIO DE FASE Y EL
       SCOUTING DEL RIVAL DE OTRA ZONA (punto 79)
       ================================================================= */
    seccion('8 · el rival de otra zona: escudo, scouting y el cambio de fase');

    /* --- 8a · los escudos */
    const CAT8 = JSON.parse(JSON.stringify(CAT7));
    CAT8.apb.categorias['apb-c'].equipos[1].id = 4321;   // NAUTICO ENSENADA, con su id de Gesdeportiva
    CAT8.hogar = { nombre: 'Hogar Social', liga: 'la-plata', equipoPropio: HO, plan: 'PLATA',
      categorias: { 'hogar-pri': { label: 'Primera', sheetId: IDS.b, torneo: 'apb', zona: 'b' } } };
    CAT8.bronce = { nombre: 'Sud America', liga: 'la-plata', equipoPropio: HO, plan: 'BRONCE',
      categorias: { 'sud-pri': { label: 'Primera', sheetId: IDS.b, torneo: 'apb', zona: 'b' } } };
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT8);
    LLAVE.limpiarCache();
    const tokHogar = auth.firmarToken({ email: 'dt@hogar.com', club: 'hogar', equipoAsignado: HO, plan: 'PLATA' }, { expiraEn: '1h' });
    const tokBronce = auth.firmarToken({ email: 'dt@sud.com', club: 'bronce', equipoAsignado: HO, plan: 'PLATA' }, { expiraEn: '1h' });
    const rH = await pedirLlave(tokHogar, 'apb');
    const filaNA = ((rH.body.zonas || {}).c || { filas: [] }).filas.find(f => f.clave === SGADD.claveEquipo(NA));
    check('cada equipo de la llave viaja con su zona y su id: NAUTICO es de la C, #4321',
      filaNA && filaNA.zona === 'c' && filaNA.id === 4321, filaNA);

    const pedidos = [];
    global.LOGOS = { getUrl: () => null, resolver: (ns) => { pedidos.push(ns.slice()); return Promise.resolve(); } };
    const fasesH = F.filtrarPorZona(F.parsear({ fases: FASES_APB }, { participan: PART }).fases, 'b');
    const llH = F.llave(fasesH, F.mezclarLlave({ tablas: {}, partidosPorFase: {}, zonaDeEquipo: {}, nombresZona: {} }, fasesH, rH.body, 'b'));
    const nombres = F.nombresDeLlave(llH);
    F.pedirEscudos(nombres);
    check('la llave PIDE el escudo de los equipos de otra zona (su libro no los resuelve)',
      pedidos.length === 1 && pedidos[0].indexOf(SGADD.limpiarNombre(NA)) !== -1
      && pedidos[0].some(n => SGADD.claveEquipo(n) === SGADD.claveEquipo(RE)), pedidos);
    F.pedirEscudos(nombres);
    check('y una sola vez: repintar no vuelve a pedirlos (sin ciclo con el hook de LOGOS)', pedidos.length === 1);
    delete global.LOGOS;

    /* --- 8b · el libro vinculado se ve al editarlo */
    const lista8 = catalogo.publico(CAT8, { admin: true, origen: 'kv' });
    const t8 = lista8.find(c => c.id === 'apb');
    const kRep = t8.categorias.find(k => k.zona === 'repechaje');
    check('el admin recibe el FINAL del libro vinculado, no el id', kRep.libroFin === IDS.rep.slice(-6)
      && !JSON.stringify(lista8).includes(IDS.rep), kRep.libroFin);
    global.SGADD_FASES = F;
    const TU8 = require('./js/sgadd-torneos.js');
    const libro8 = TU8.librosDe(t8).find(l => l.zona === 'repechaje');
    check('los libros vinculados del editor lo traen', libro8.fin === IDS.rep.slice(-6));
    try { TU8.editarLibro('apb', 'repechaje'); } catch (e) { /* repinta el DOM: acá no hay */ }
    check('al tocar «Editar», el campo del libro muestra el conectado («…' + IDS.rep.slice(-6) + '»), no vacío',
      TU8.libroEd.libro === '…' + IDS.rep.slice(-6) && TU8.libroEd.editando, TU8.libroEd.libro);
    check('así no le falta nada para guardar', TU8.faltantesLibro(TU8.libroEd, t8).length === 0, TU8.faltantesLibro(TU8.libroEd, t8));
    const i8 = TU8.intencionLibro(t8, TU8.libroEd);
    check('y guardar sin tocarlo no manda otro libro', i8.zonas.repechaje && i8.zonas.repechaje.sheetId === undefined, i8.zonas.repechaje);
    const g8 = mutar.aplicar(JSON.parse(JSON.stringify(CAT8)), 'torneo', i8, catalogo.validar);
    check('el libro sigue conectado después de guardar', g8.ok && g8.catalogo.apb.categorias['apb-rep'].sheetId === IDS.rep, g8.motivo);
    const otro = 'Z'.repeat(40) + 'nuevo1';
    const i8b = TU8.intencionLibro(t8, Object.assign({}, TU8.libroEd, { libro: 'https://docs.google.com/spreadsheets/d/' + otro + '/edit' }));
    check('pegar otro link sí lo cambia', i8b.zonas.repechaje.sheetId === otro);
    check('un link roto se denuncia igual', TU8.faltantesLibro(Object.assign({}, TU8.libroEd, { libro: 'no-es-un-libro' }), t8)
      .some(x => /forma de id/.test(x)));
    delete global.SGADD_FASES;

    /* --- 8c · el cambio de fase no deja la pantalla congelada */
    {
      const vm = require('vm'); const fs = require('fs');
      const root = { innerHTML: '' };
      const llamadas = [];
      const ctxv = {
        console, Promise, JSON, Math, Date, Map, Set, WeakMap, Array, Object, String, Number, RegExp, Error,
        SGADD: SGADD, SGADD_UI: require('./js/sgadd-ui.js'),
        window: { location: { hash: '' } }, location: { hash: '' }, history: { pushState() {}, replaceState() {} },
        setTimeout: () => 0, clearTimeout() {},
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        document: { getElementById: (id) => (id === 'view-root' ? root : null),
          querySelector: (q) => (q === '#view-root [data-modo-llave]' && /data-modo-llave/.test(root.innerHTML)) ? {} : null,
          querySelectorAll: () => [], getElementsByTagName: () => [] },
        currentSection: 'equipos',
        renderSection: (s) => { llamadas.push('router:' + s); root.innerHTML = 'SECCION ' + s; },
        equiposPintar: () => { llamadas.push('equiposPintar'); },
      };
      ctxv.globalThis = ctxv;
      vm.createContext(ctxv);
      ['sgadd-app.js', 'sgadd-fases.js'].forEach(f => vm.runInContext(fs.readFileSync('./js/' + f, 'utf8'), ctxv, { filename: f }));
      const APP = vm.runInContext('SGADD_APP', ctxv);
      const FV = vm.runInContext('SGADD_FASES', ctxv);
      APP.estado.hojas = hojasDe(ZB);
      APP.estado.torneo = FV.LLAVE; APP.estado.fase = 'REPECHAJE A-B';
      root.innerHTML = APP.barra() + FV.avisoModoLlave();
      check('el aviso del modo llave lleva su marca', /data-modo-llave/.test(root.innerHTML));
      APP.cambiarTramo('GENERAL|REGULAR');
      check('volver a la fase de la zona pasa por el ROUTER: la sección se vuelve a armar',
        llamadas.indexOf('router:equipos') !== -1 && /SECCION equipos/.test(root.innerHTML), llamadas);
      check('y no por el repintado de la sección, que no tenía dónde pintarse', llamadas.indexOf('equiposPintar') === -1, llamadas);
      llamadas.length = 0;
      APP.cambiarTramo('*TOTAL*|REGULAR');
      check('entre dos fases de la zona, el repintado de siempre', llamadas.join() === 'equiposPintar', llamadas);
      APP.cambiarTramo(FV.LLAVE + '|REPECHAJE A-B');
      check('y al ir a la llave, el router otra vez', llamadas.indexOf('router:equipos') !== -1, llamadas);
      check('scouting ya no se bloquea en modo llave: prepara ese cruce', !FV.bloqueaEnLlave('scouting', FV.LLAVE));
    }

    /* --- 8d · el scouting del rival de otra zona */
    const pedirRival = async (tok, equipo) => { catalogo.limpiarCache(); LLAVE.limpiarCache();
      return LLAVE.manejarRival(pedido(tok, { torneo: 'apb' }, { equipo: equipo })); };
    const rR = await pedirRival(tokHogar, RE);
    check('Hogar Social (2° B) pide a su rival del repechaje A/B, RECONQUISTA (3° A): 200', rR.status === 200, rR.body);
    check('con el cruce que lo habilita', rR.body.cruce && rR.body.cruce.id === 'R3' && rR.body.zona === 'a', rR.body.cruce);
    const eqR = rR.body.equipo && rR.body.equipo.equipo;
    check('trae su fase regular: 3 partidos', eqR && eqR.clave === SGADD.claveEquipo(RE) && eqR.partidos.length === 3, eqR && eqR.partidos.length);
    const cuerpo = JSON.stringify(rR.body);
    check('y NADA del resto de su zona: ni una fila de temporada de otro equipo',
      !/"EQUIPO":"ATENAS A"[^}]*"PJ"/.test(JSON.stringify(eqR.promedios || {})) && eqR.promedios && eqR.promedios.EQUIPO === RE,
      eqR && eqR.promedios && eqR.promedios.EQUIPO);
    check('ningún sheetId viaja', !/apbZona|apbRep|apbPlay/.test(cuerpo));
    check('un equipo que NO es su rival en la llave: 403', (await pedirRival(tokHogar, NA)).status === 403);
    check('Deportivo (1° B) no tiene cruce con Reconquista: 403 SIN_CRUCE', (await pedirRival(tokDepo, RE)).body.codigo === 'SIN_CRUCE');
    check('sin el scouting en el plan: 403', (await pedirRival(tokBronce, RE)).status === 403);
    check('sin token: 401', (await LLAVE.manejarRival(pedido(null, { torneo: 'apb' }, { equipo: RE }))).status === 401);
    const rAd8 = await pedirRival(tokAdmin, RE);
    check('el admin pasa sin cruce', rAd8.status === 200);

    /* El panel lo injerta en una COPIA del índice de su zona. */
    global.SGADD = global.SGADD || SGADD;
    const SC = require('./js/sgadd-scouting.js');
    const idxB = SGADD.construirIndice(hojasDe(ZB), { fase: 'REGULAR' });
    const idxCopia = SGADD.construirIndice(hojasDe(ZB), { fase: 'REGULAR' });
    const dist = JSON.stringify(idxCopia.liga.distribuciones);
    check('el rival se injerta', idxCopia.injertarEquipo(rR.body.equipo) === true && !!idxCopia.get(RE));
    check('con sus fechas como fechas', idxCopia.get(RE).partidos.every(p => p.__fecha instanceof Date));
    check('y con el otro lado de cada partido (para el ciclo y la defensa)',
      idxCopia.agregarPartidos(SGADD.claveEquipo(RE), idxCopia.get(RE).partidos).partidosConRival === 3);
    check('la liga de la zona NO cambia: mismas distribuciones', JSON.stringify(idxCopia.liga.distribuciones) === dist);
    check('y el índice de la app queda intacto', !idxB.get(RE) && idxB.lista().length === 4);
    check('injertar dos veces no duplica', idxCopia.injertarEquipo(rR.body.equipo) === false);
    const hjA = hojasDe(ZA);
    hjA['Base Datos J'] = { cols: ['FECHA', 'PARTIDO', 'FASE', 'EQUIPO', 'NOMBRES', 'MIN', 'PTS'], filas: [
      { FECHA: '02/05/2026', PARTIDO: AT + ' vs ' + RE, FASE: 'REGULAR', EQUIPO: AT, NOMBRES: 'ESCOLTA, ATENAS', MIN: 30, PTS: 20 },
      { FECHA: '02/05/2026', PARTIDO: AT + ' vs ' + RE, FASE: 'REGULAR', EQUIPO: RE, NOMBRES: 'BASE, RECONQUISTA', MIN: 28, PTS: 12 }] };
    const expA = SGADD.construirIndice(hjA, { fase: 'REGULAR' }).exportarEquipo(RE);
    const boxA = [].concat(...expA.box.map(b => b[1]));
    check('del box del partido viajan SOLO sus jugadores, no los del rival de su zona',
      boxA.length === 1 && boxA[0].NOMBRES === 'BASE, RECONQUISTA', boxA.map(b => b.NOMBRES));
    check('y el historial por jugador, igual', expA.jugadorPartidos.every(([, filas]) => filas.every(f => f.EQUIPO === RE)));
    const inf = SC.informePrePartido(idxCopia, HO, RE);
    check('el informe pre-partido Hogar Social vs Reconquista se arma', inf.ok, inf.motivo);
    /* --- 8e · la mediana de SU liga (punto 80) */
    const lo = rR.body.equipo.equipo.__ligaOrigen;
    check('el rival viaja con el contexto de su liga YA calculado: medianas, puestos y percentiles',
      lo && lo.medianas && lo.rankings && lo.percentiles && lo.label === 'Zona A', lo && Object.keys(lo));
    check('y SIN las distribuciones de los otros equipos de su zona', !('distribuciones' in lo) && !/distribuciones/.test(JSON.stringify(rR.body)));
    /* Con fila TIPO y puntos distintos: la Zona A anota más que la B. */
    const conTipo = (h, base, tipo) => { h['PROMEDIOS E'].cols.push('PACE');
      h['PROMEDIOS E'].filas.forEach((f, i) => { f.PTS = base + i * 4; f.PACE = base + i; });
      h['PROMEDIOS E'].filas.push({ EQUIPO: 'EQUIPO TIPO', FASE: 'REGULAR', PJ: 3, PTS: tipo, PACE: tipo }); return h; };
    const idxZA = SGADD.construirIndice(conTipo(hojasDe(ZA), 80, 86), { fase: 'REGULAR' });
    const idxB2 = SGADD.construirIndice(conTipo(hojasDe(ZB), 60, 66), { fase: 'REGULAR' });
    const idxCopia2 = SGADD.construirIndice(conTipo(hojasDe(ZB), 60, 66), { fase: 'REGULAR' });
    const expZA = idxZA.exportarEquipo(RE);
    expZA.equipo.__ligaOrigen.label = 'Zona A';   // lo pone el servidor
    idxCopia2.injertarEquipo(expZA);
    const mZA = idxZA.leer(RE, 'PTS'), mB = idxB2.leer(HO, 'PTS');
    check('en la copia, el rival se lee contra la mediana de la ZONA A, no de la B',
      idxCopia2.leer(RE, 'PTS').tipo === mZA.tipo && mZA.tipo === 86 && mB.tipo === 66, [idxCopia2.leer(RE, 'PTS').tipo, mZA.tipo, mB.tipo]);
    check('  con su puesto dentro de su zona', JSON.stringify(idxCopia2.ranking(RE, 'PTS')) === JSON.stringify(idxZA.ranking(RE, 'PTS'))
      && idxZA.ranking(RE, 'PTS').de === 4, idxCopia2.ranking(RE, 'PTS'));
    check('  y los equipos de la B, contra la B', idxCopia2.leer(HO, 'PTS').tipo === 66);
    check('  y la liga de la B no se movió con el injerto', JSON.stringify(idxCopia2.liga.distribuciones) === JSON.stringify(idxB2.liga.distribuciones));
    const mz = SC.matrizComparativa(idxCopia2, HO, RE);
    const fPts = mz.posesion.concat(mz.tiro).find(f => f.ligaLocal.valor !== null && f.ligaVisitante.valor !== null
      && f.ligaLocal.valor !== f.ligaVisitante.valor) || null;
    check('la matriz es CRUZADA y rotula la liga de cada uno', mz.cruzada && mz.ligaVisitante === 'Zona A' && mz.ligaLocal === null);
    check('  [A] [mediana A] | [B] [mediana B]: cada columna de liga es la de su equipo', !!fPts
      && fPts.ligaLocal.valor === idxB2.leer(HO, fPts.id).tipo && fPts.ligaVisitante.valor === idxZA.leer(RE, fPts.id).tipo,
      fPts && [fPts.id, fPts.ligaLocal.valor, fPts.ligaVisitante.valor]);
    check('entre dos equipos de la MISMA zona no hay columnas cruzadas', SC.matrizComparativa(idxCopia, HO, DE).cruzada === false);
    const infZ = SC.informePrePartido(idxCopia, HO, RE);
    check('el último partido del rival nombra a su rival de zona, no «—»',
      infZ.visitante.ultimoPartido && infZ.visitante.ultimoPartido.rival !== '—'
      && /ATENAS|PLATENSE|GONNET/.test(infZ.visitante.ultimoPartido.rival), infZ.visitante.ultimoPartido);

    /* --- 8g · la llave llega tarde: Scouting se repinta al recibirla */
    {
      const pintadas = [];
      global.currentSection = 'scouting'; global.renderSection = (x) => pintadas.push(x);
      F.repintarLaQueLaMuestra();
      global.currentSection = 'equipos'; F.repintarLaQueLaMuestra();
      delete global.currentSection; delete global.renderSection;
      check('cuando llega la llave del servidor, Scouting se repinta (su rival de otra zona sale de ahí)',
        pintadas.join() === 'scouting', pintadas);
    }

    /* --- 8h · la fecha es el DÍA del partido, en cualquier zona horaria */
    {
      const { execFileSync } = require('child_process');
      const hjF = JSON.stringify(hojasDe(ZA));
      const js = "const S=require('./js/sgadd-core.js');const h=JSON.parse(process.argv[1]);"
        + "process.stdout.write(JSON.stringify(S.construirIndice(h,{fase:'REGULAR'}).exportarEquipo(process.argv[2])))";
      const exp = JSON.parse(execFileSync(process.execPath, ['-e', js, hjF, RE],
        { env: Object.assign({}, process.env, { TZ: 'Pacific/Kiritimati' }), encoding: 'utf8' }));
      const idxT = SGADD.construirIndice(hojasDe(ZB), { fase: 'REGULAR' });
      idxT.injertarEquipo(exp);
      const f0 = idxT.get(RE).partidos.find(p => /ATENAS/.test(p.__partido));
      check('un servidor en OTRA zona horaria no corre el partido un día: el 02/05 llega como el 02/05',
        f0 && f0.__fecha.getDate() === 2 && f0.__fecha.getMonth() === 4, f0 && String(f0.__fecha));
    }

    /* --- 8f · el escudo del rival en el Scouting */
    const fuenteSc = require('fs').readFileSync('./js/sgadd-scouting.js', 'utf8');
    const cuerpoPintar = fuenteSc.slice(fuenteSc.indexOf('function scoutPintar()'), fuenteSc.indexOf('function scoutSelectores('));
    check('el Scouting pide el escudo de los equipos de otra zona (el caché de LOGOS no los tiene)',
      /SGADD_FASES\.pedirEscudos\(/.test(cuerpoPintar) && /__externo/.test(cuerpoPintar));

    check('con el récord del rival de su fase regular (1-2)', inf.ok && inf.visitante && inf.visitante.pj === 3
      && inf.visitante.ganados === 1 && inf.visitante.perdidos === 2, inf.ok && inf.visitante);

    sheets.obtenerLibro = previo;
    store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
    LLAVE.limpiarCache();
  }

  console.log('\n' + '═'.repeat(70));
  console.log(mal ? `  ${ok} pasaron, ${mal} fallaron` : `  TODO OK · ${ok} tests`);
  console.log('═'.repeat(70));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
