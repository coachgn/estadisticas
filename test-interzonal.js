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
      'visitante', 'ptsLocal', 'ptsVisitante', 'sinLibro', 'ilegible', 'norte', 'sur']);
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
    const ctx3 = F.mezclarLlave({ tablas: {}, partidosPorFase: { cuartos: [] }, nombresZona: {} }, fases, llaveServidor, 'norte', hojasConCuartos);
    check('una fase que el libro propio ya tiene no se duplica', ctx3.partidosPorFase.cuartos.length === 0);
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
    ['clasificacion', 'fixture', 'glosario', 'configuracion', 'diagnostico'].forEach((s) => {
      check('en modo llave «' + s + '» se pinta', !F.bloqueaEnLlave(s, '*LLAVE*'));
    });
    ['principal', 'equipos', 'jugadores', 'scouting', 'simulador', 'comparativa'].forEach((s) => {
      check('en modo llave «' + s + '» se BLOQUEA con aviso', F.bloqueaEnLlave(s, '*LLAVE*'));
    });
    check('fuera del modo llave no se bloquea nada', !F.bloqueaEnLlave('scouting', 'IDA') && !F.bloqueaEnLlave('equipos', '*TOTAL*'));
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

  console.log('\n' + '═'.repeat(70));
  console.log(mal ? `  ${ok} pasaron, ${mal} fallaron` : `  TODO OK · ${ok} tests`);
  console.log('═'.repeat(70));
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
