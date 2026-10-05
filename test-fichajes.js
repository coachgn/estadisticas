/* =====================================================================
   FICHAJES · el mercado de jugadores (punto 87)

   Tres partes que se testean juntas porque son la misma propiedad vista
   desde tres lados:

     1 · el MOTOR puro (`sgadd-mercado.js`): la ficha manual, el padrón,
         los filtros, el orden y el radar;
     2 · el SERVIDOR hace cumplir el padrón: el libro sin recorte de un
         torneo sale SOLO para el admin y para los mails habilitados, y
         solo de sus torneos; KV caído falla cerrado;
     3 · el padrón y las fichas se escriben CAMPO POR CAMPO y solo el admin.

   Contra los handlers de verdad, con un Upstash de mentira en memoria: la
   convención de toda la suite del backend.
   ===================================================================== */
'use strict';
const fs = require('fs');
require('./server/lib/env.js').cargar();

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const M = require('./js/sgadd-mercado.js');

/* =====================================================================
   1. EL MOTOR
   ===================================================================== */
titulo('1. LA FICHA MANUAL · no se estima nada');

const HOY = new Date(2026, 9, 5);
check('una ficha completa se normaliza',
  JSON.stringify(M.normalizarFicha({ nacimiento: '1999-03-12', posicion: 'base', talla: '183' }, HOY))
  === JSON.stringify({ nacimiento: '1999-03-12', posicion: 'BASE', talla: 183 }));
check('el año solo alcanza: es lo que suele saber un entrenador',
  M.normalizarFicha({ nacimiento: '2001' }, HOY).nacimiento === '2001');
check('una ficha vacía es null: no se guarda nada',
  M.normalizarFicha({ nacimiento: '', posicion: '', talla: '' }, HOY) === null);
check('una fecha que no existe se rechaza', M.normalizarFicha({ nacimiento: '2001-02-30' }, HOY).error === 'NACIMIENTO');
check('un año implausible se rechaza', M.normalizarFicha({ nacimiento: '2024' }, HOY).error === 'NACIMIENTO');
check('una posición inventada se rechaza', M.normalizarFicha({ posicion: 'LIBERO' }, HOY).error === 'POSICION');
check('una talla fuera de rango se rechaza (va en cm)', M.normalizarFicha({ talla: '1.92' }, HOY).error === 'TALLA');
check('la secundaria igual a la principal no se repite',
  M.normalizarFicha({ posicion: 'ALERO', secundaria: 'alero' }, HOY).secundaria === undefined);
check('la edad cuenta el cumpleaños',
  M.edad('1999-10-06', HOY).anios === 26 && M.edad('1999-10-05', HOY).anios === 27);
check('con el año solo, la edad sale marcada como aproximada',
  M.edad('1999', HOY).aproximada === true && M.edad('1999', HOY).anios === 27);

titulo('1 bis. QUIÉN ENTRA · el padrón');

const CAT = {
  deportivo: { nombre: 'Deportivo', estado: 'activo', plan: 'ORO',
    categorias: { 'deportivo-primera': { label: 'Primera', sheetId: 'SHEET_CLIENTE_123' } } },
  'liga-argentina-2026-27': { tipo: 'torneo', nombre: 'Liga Argentina 2026/27', nombreCorto: 'LA 26/27', nivel: 'LIGA_ARGENTINA',
    categorias: {
      'lab-2026-27-norte': { label: 'Conferencia Norte', zona: 'norte', sheetId: 'SHEET_NORTE_456' },
      'lab-2026-27-sur': { label: 'Conferencia Sur', zona: 'sur' },
    } },
  'zona-c-la-plata-2026': { tipo: 'torneo', nombre: 'Zona C La Plata', nivel: 'LOCAL_MAYORES',
    categorias: { 'zona-c-primera': { label: 'Zona C', zona: 'c', sheetId: 'SHEET_ZONAC_789' } } },
};
check('el admin ve todos los torneos, y solo torneos (no clubes)',
  JSON.stringify(M.torneosHabilitados(CAT, true, null)) === JSON.stringify(['liga-argentina-2026-27', 'zona-c-la-plata-2026']));
check('un mail sin registro no ve ninguno: no hay default permisivo',
  M.torneosHabilitados(CAT, false, null).length === 0);
check('un mail ve SOLO los de su registro',
  JSON.stringify(M.torneosHabilitados(CAT, false, { torneos: ['zona-c-la-plata-2026'] })) === '["zona-c-la-plata-2026"]');
check('un torneo dado de baja no se sigue ofreciendo aunque quede escrito',
  M.torneosHabilitados(CAT, false, { torneos: ['torneo-viejo'] }).length === 0);
check('un club no se puede habilitar como si fuera un torneo',
  M.torneosHabilitados(CAT, false, { torneos: ['deportivo'] }).length === 0);
check('habilitar normaliza el mail (mayúsculas y espacios, nada más)',
  M.normalizarHabilitacion({ email: '  Scout@Club.com ', torneos: ['zona-c-la-plata-2026'] }, CAT).email === 'scout@club.com');
check('NO se normalizan los puntos de Gmail: es una lista de permitidos (punto 19)',
  M.normalizarHabilitacion({ email: 'f.reytes@gmail.com', torneos: [] }, CAT).email === 'f.reytes@gmail.com');
check('habilitar un torneo que no existe se rechaza',
  M.normalizarHabilitacion({ email: 'a@b.com', torneos: ['inventado'] }, CAT).error === 'TORNEO');
check('un mail inválido se rechaza', M.normalizarHabilitacion({ email: 'no-es-mail', torneos: [] }, CAT).error === 'EMAIL');

titulo('1 ter. LA BÚSQUEDA');

const fila = (o) => Object.assign({ nombre: 'X', equipo: 'E', zona: 'norte', califica: true, rol: 'spacing',
  secundarios: [], jerarquia: 'quinteto', rolMinutos: 'r', arquetipos: [], origen: 'perimetral', m: {}, pc: {}, ficha: null }, o);
const FILAS = [
  fila({ nombre: 'ALTO, TIRADOR', m: { 'TS%': 0.62, PTS: 15 }, pc: { 'TS%': 90, PTS: 80 }, ficha: { edad: 24, posicion: 'ESCOLTA', talla: 192 } }),
  fila({ nombre: 'BAJO, GENERADOR', rol: 'generador-primario', secundarios: ['slasher'], m: { 'TS%': 0.51, PTS: 18 }, pc: { 'TS%': 40, PTS: 92 }, ficha: { edad: 31, posicion: 'BASE', talla: 180 } }),
  fila({ nombre: 'SIN FICHA, PIVOT', rol: 'poste-bajo', origen: 'interior', arquetipos: ['reboteador', 'protector'], m: { 'TS%': 0.58, PTS: 9 }, pc: { 'TS%': 70, PTS: 45 } }),
  fila({ nombre: 'NOVATO, CHICO', califica: false, m: { 'TS%': 0.7, PTS: 2 }, pc: { 'TS%': null, PTS: null } }),
];
let r = M.filtrar(FILAS, { soloCalificados: true });
check('solo calificados saca al que no llega al umbral', r.filas.length === 3);
r = M.filtrar(FILAS, { rangos: { 'TS%': { min: 0.55 } } });
check('un rango por VALOR filtra sobre el número', r.filas.map(f => f.nombre).join('|') === 'ALTO, TIRADOR|SIN FICHA, PIVOT|NOVATO, CHICO');
r = M.filtrar(FILAS, { rangos: { 'TS%': { pc: true, min: 60 } } });
check('un rango por PERCENTIL filtra contra su zona', r.filas.length === 2);
check('y el que no tiene percentil queda afuera CONTADO, no escondido', r.sinDato === 1);
r = M.filtrar(FILAS, { edad: { max: 28 } });
check('un filtro de edad deja afuera a los que no tienen ficha', r.filas.length === 1 && r.sinDato === 2);
r = M.filtrar(FILAS, { posiciones: ['BASE'] });
check('la posición se filtra por la ficha', r.filas.length === 1 && r.filas[0].nombre === 'BAJO, GENERADOR' && r.sinDato === 2);
r = M.filtrar(FILAS, { roles: ['slasher'], incluirSecundarios: true });
check('la función incluye la faceta secundaria si se pide', r.filas.length === 1);
r = M.filtrar(FILAS, { roles: ['slasher'], incluirSecundarios: false });
check('y no la incluye si no', r.filas.length === 0);
r = M.filtrar(FILAS, { arquetipos: ['reboteador', 'protector'] });
check('los perfiles técnicos se piden TODOS (es un perfil, no un menú)', r.filas.length === 1);
r = M.filtrar(FILAS, { arquetipos: ['reboteador', 'tirador'] });
check('si falta uno, no entra', r.filas.length === 0);
r = M.filtrar(FILAS, { texto: 'generador' });
check('el texto busca sin acentos por nombre y equipo', r.filas.length === 1);
check('el orden deja los vacíos AL FINAL en las dos direcciones',
  M.ordenar(FILAS, 'pc:TS%', 'desc').slice(-1)[0].nombre === 'NOVATO, CHICO'
  && M.ordenar(FILAS, 'pc:TS%', 'asc').slice(-1)[0].nombre === 'NOVATO, CHICO');
check('ordena por edad de la ficha', M.ordenar(FILAS, 'edad', 'asc')[0].nombre === 'ALTO, TIRADOR');
const ejes = M.ejesRadar({ PTS: 80, PLAYS: 60, 'TS%': 90 });
check('un eje del radar es el promedio de sus percentiles', ejes.find(e => e.id === 'anotacion').valor === 70);
check('y un eje sin datos queda VACÍO, no en cero', ejes.find(e => e.id === 'recupero').valor === null);
const mejor = M.mejorPorMetrica([FILAS[0], FILAS[1]], ['PTS', 'TS%'], {});
check('comparando, gana el mejor percentil', mejor.PTS.indice === 1 && mejor['TS%'].indice === 0 && mejor.PTS.porPercentil);
const mejorV = M.mejorPorMetrica([FILAS[0], FILAS[3]], ['TS%'], {});
check('sin percentil en alguno, se compara por valor y lo dice', mejorV['TS%'].indice === 1 && mejorV['TS%'].porPercentil === false);

/* =====================================================================
   2. EL SERVIDOR
   ===================================================================== */
const kv = require('./server/lib/kv.js');
const store = {}, hashes = {}, ops = [];
const falla = { hash: false };
kv.configurado = () => true;
kv.leer = async (k) => ({ valor: store[k] !== undefined ? JSON.parse(store[k]) : null, error: null });
kv.escribir = async (k, v) => { ops.push('SET ' + k); store[k] = JSON.stringify(v); };
kv.borrar = async (k) => { ops.push('DEL ' + k); delete store[k]; delete hashes[k]; };
kv.leerHash = async (k) => {
  ops.push('HGETALL ' + k);
  if (falla.hash) throw new Error('caído');
  const h = hashes[k] || {}, out = {};
  Object.keys(h).forEach(c => { out[c] = JSON.parse(h[c]); });
  return out;
};
kv.leerCampos = async (k, campos) => {
  ops.push('HMGET ' + k);
  if (falla.hash) throw new Error('caído');
  const h = hashes[k] || {}, out = {};
  campos.forEach(c => { if (h[c] !== undefined) out[c] = JSON.parse(h[c]); });
  return out;
};
kv.escribirCampos = async (k, mapa) => {
  ops.push('HSET ' + k);
  hashes[k] = hashes[k] || {};
  Object.keys(mapa).forEach(c => { hashes[k][c] = JSON.stringify(mapa[c]); });
  return Object.keys(mapa).length;
};
kv.tamanoHash = async (k) => Object.keys(hashes[k] || {}).length;

const sheets = require('./server/lib/google-sheets.js');
const pedidos = [];
/* El libro de la Norte trae a DOS equipos: el punto es que el de fichajes
   lo reciba ENTERO, con los rivales, que es lo que el recorte por plan le
   saca a un cliente. Y la columna oculta, que no tiene que viajar. */
sheets.obtenerLibro = async (id) => {
  pedidos.push(id);
  return {
    hojas: { 'PROMEDIOS J': [['NOMBRES', 'EQUIPO', 'MIN', 'ID_ARCHIVO'], ['PEREZ, JUAN', 'A', 30, 'f1'], ['GOMEZ, LUIS', 'B', 25, 'f2']] },
    hojasTexto: {}, faltantes: [], leidoEn: '2026-10-05T00:00:00Z',
  };
};

const auth = require('./server/lib/auth.js');
const catalogo = require('./server/lib/catalogo.js');
const F = require('./server/api/fichajes.js');
const AUTH = require('./js/sgadd-auth.js');

store[catalogo.CLAVE_KV] = JSON.stringify(CAT);
catalogo.limpiarCache();

const tokAdmin = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
const tokScout = auth.firmarToken({ email: 'scout@club.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO', plan: 'ORO' }, { expiraEn: '1h' });
const tokOtro = auth.firmarToken({ email: 'dt@deportivo.com', club: 'deportivo', equipoAsignado: 'DEPORTIVO', plan: 'ORO' }, { expiraEn: '1h' });
const pedido = (tok, params, body) => ({
  headers: tok ? { authorization: 'Bearer ' + tok } : {}, params: params || {}, body: body || {}, query: {},
});
const sinSheetId = (body) => !/SHEET_[A-Z]+_\d+/.test(JSON.stringify(body));

(async () => {
  titulo('2. EL SERVIDOR · el padrón se hace cumplir');

  let res = await F.manejarFichajes(pedido(null));
  check('sin token: 401', res.status === 401);

  res = await F.manejarFichajes(pedido(tokOtro));
  check('un cliente ORO que no está en el padrón: 403 NO_HABILITADO', res.status === 403 && res.body.codigo === 'NO_HABILITADO');

  res = await F.manejarZona(pedido(tokOtro, { torneo: 'zona-c-la-plata-2026', zona: 'zona-c-primera' }));
  check('y tampoco baja ningún libro', res.status === 403 && pedidos.length === 0);

  res = await F.manejarFichajes(pedido(tokAdmin));
  check('el admin ve los dos torneos, sin pasar por el padrón',
    res.status === 200 && res.body.admin === true && res.body.torneos.map(t => t.id).join(',') === 'liga-argentina-2026-27,zona-c-la-plata-2026');
  check('cada torneo trae sus zonas y si tienen libro',
    res.body.torneos[0].zonas.length === 2 && res.body.torneos[0].zonas[0].conLibro === true
    && res.body.torneos[0].zonas[1].conLibro === false);
  check('y ningún sheetId viaja', sinSheetId(res.body));

  /* --- el padrón: solo el admin --- */
  res = await F.manejarPadronEscribir(pedido(tokOtro, {}, { email: 'yo@mismo.com', torneos: ['zona-c-la-plata-2026'] }));
  check('un cliente NO puede habilitarse a sí mismo', res.status === 403);
  res = await F.manejarPadron(pedido(tokOtro));
  check('ni leer el padrón', res.status === 403);
  res = await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'freytesgn@gmail.com', torneos: ['zona-c-la-plata-2026'] }));
  check('un admin no se da de alta: ya ve todo', res.status === 400 && res.body.codigo === 'ES_ADMIN');
  res = await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'scout@club.com', torneos: ['inventado'] }));
  check('un torneo que no existe se rechaza', res.status === 400 && res.body.codigo === 'TORNEO');
  ops.length = 0;
  res = await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'Scout@Club.com', torneos: ['liga-argentina-2026-27'], nota: 'Representante, hasta dic.' }));
  check('el admin habilita a un mail en un torneo', res.status === 200 && res.body.padron['scout@club.com'].torneos[0] === 'liga-argentina-2026-27');
  check('se escribe CAMPO POR CAMPO: nunca un SET ni un DEL sobre el padrón',
    ops.some(o => o === 'HSET ' + F.PADRON) && !ops.some(o => /^(SET|DEL) sgadd:fichajes/.test(o)), ops.join(' | '));
  check('el registro guarda quién y cuándo', !!res.body.padron['scout@club.com'].actualizado && res.body.padron['scout@club.com'].por === 'freytesgn@gmail.com');

  /* --- el habilitado --- */
  res = await F.manejarFichajes(pedido(tokScout));
  check('el habilitado ve SOLO su torneo', res.status === 200 && res.body.admin === false
    && res.body.torneos.map(t => t.id).join(',') === 'liga-argentina-2026-27');
  res = await F.manejarZona(pedido(tokScout, { torneo: 'zona-c-la-plata-2026', zona: 'zona-c-primera' }));
  check('el libro de OTRO torneo: 403 OTRO_TORNEO, sin tocar Google', res.status === 403 && res.body.codigo === 'OTRO_TORNEO' && pedidos.length === 0);
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-sur' }));
  check('una zona sin libro: 404 SIN_LIBRO', res.status === 404 && res.body.codigo === 'SIN_LIBRO');
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'no-existe' }));
  check('una zona que no es del torneo: 404 SIN_ZONA', res.status === 404 && res.body.codigo === 'SIN_ZONA');
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('su zona: 200 con el libro', res.status === 200 && pedidos[0] === 'SHEET_NORTE_456');
  check('ENTERO: trae a los dos equipos, sin el recorte por plan',
    res.body.hojas['PROMEDIOS J'].length === 3);
  check('sin las columnas ocultas (ID_ARCHIVO)',
    res.body.hojas['PROMEDIOS J'][0].indexOf('ID_ARCHIVO') === -1, JSON.stringify(res.body.hojas['PROMEDIOS J'][0]));
  check('con el nivel de la zona para medirla con su vara', res.body.nivel === 'LIGA_ARGENTINA');
  check('y sin el sheetId en la respuesta', sinSheetId(res.body));

  /* --- deshabilitar corta en el próximo pedido --- */
  await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'scout@club.com', torneos: [] }));
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('deshabilitado, el próximo pedido ya es 403: el padrón no se cachea', res.status === 403);
  const padron = (await F.manejarPadron(pedido(tokAdmin))).body.padron;
  check('y el registro QUEDA, vacío: nada se borra', Array.isArray(padron['scout@club.com'].torneos) && padron['scout@club.com'].torneos.length === 0);

  /* --- KV caído falla cerrado --- */
  await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'scout@club.com', torneos: ['liga-argentina-2026-27'] }));
  falla.hash = true;
  res = await F.manejarFichajes(pedido(tokScout));
  check('con KV caído, un no-admin recibe 503 y NO «habilitado por las dudas»', res.status === 503);
  res = await F.manejarFichajes(pedido(tokAdmin));
  check('el admin sigue entrando: su lista está en el código', res.status === 200);
  res = await F.manejarZona(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('y sin poder leer las fichas, el libro sale igual y lo DICE', res.status === 200 && res.body.fichasLeidas === false);
  falla.hash = false;

  titulo('3. LAS FICHAS MANUALES · solo el admin, campo por campo');

  const CLAVE = 'PEREZ, JUAN|A';
  res = await F.manejarFichasEscribir(pedido(tokScout, { torneo: 'liga-argentina-2026-27' }, { cambios: { [CLAVE]: { talla: 190 } } }));
  check('un habilitado NO escribe fichas: las carga el admin', res.status === 403);
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { [CLAVE]: { talla: 300 } } }));
  check('una ficha inválida se rechaza con el motivo', res.status === 400 && res.body.codigo === 'TALLA' && /PEREZ/.test(res.body.mensaje));
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { 'SIN EQUIPO': { talla: 190 } } }));
  check('una clave que no es NOMBRE|EQUIPO se rechaza', res.status === 400 && res.body.codigo === 'CLAVE_INVALIDA');
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'deportivo' }, { cambios: { [CLAVE]: { talla: 190 } } }));
  check('las fichas son de un TORNEO, no de un club', res.status === 404);
  ops.length = 0;
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' },
    { cambios: { [CLAVE]: { nacimiento: '1998', posicion: 'ALERO', talla: '195' } } }));
  check('el admin guarda una ficha', res.status === 200 && res.body.fichas[CLAVE].talla === 195 && res.body.fichas[CLAVE].posicion === 'ALERO');
  check('campo por campo: HSET y nunca SET/DEL', ops.indexOf('HSET ' + F.claveFichas('liga-argentina-2026-27')) !== -1
    && !ops.some(o => /^(SET|DEL) /.test(o)), ops.join(' | '));
  await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'scout@club.com', torneos: ['liga-argentina-2026-27'] }));
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('y el habilitado la recibe con el libro', res.status === 200 && res.body.fichas[CLAVE].talla === 195 && res.body.fichasLeidas === true);
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { [CLAVE]: {} } }));
  check('vaciar una ficha la deja «sin ficha» sin borrar el campo', res.status === 200 && res.body.fichas[CLAVE] === undefined
    && hashes[F.claveFichas('liga-argentina-2026-27')][CLAVE] !== undefined);

  titulo('4. EL PANEL · el gate y el cableado');

  const src = fs.readFileSync('./server/api/fichajes.js', 'utf8');
  check('el servidor no tiene ningún camino que borre el padrón ni las fichas',
    !/\.borrar\(|\.escribir\(\s*(PADRON|claveFichas)/.test(src));
  const app = fs.readFileSync('./server/app.js', 'utf8');
  check('las cinco rutas están registradas',
    ['/api/v1/fichajes\'', '/api/v1/fichajes/padron\'', '/api/v1/fichajes/:torneo/:zona\'', '/api/v1/fichajes/:torneo/fichas\'']
      .every(r => app.indexOf(r) !== -1));
  check('el motor del mercado viaja al servidor (sincronizar-compartido)',
    /'sgadd-mercado\.js'/.test(fs.readFileSync('./server/bin/sincronizar-compartido.js', 'utf8'))
    && fs.existsSync('./server/lib/compartido/sgadd-mercado.js'));
  check('la regla del panel es un SERVICIO, no un plan', AUTH.MODULOS.fichajes && AUTH.MODULOS.fichajes.servicio === 'fichajes');
  const ui = fs.readFileSync('./js/sgadd-fichajes.js', 'utf8');
  check('el servicio lo fija la respuesta del servidor, no el token',
    /fichajesTorneos\(\)\.then[\s\S]{0,300}fijarServicios\(\[M\.SERVICIO\]\)/.test(ui)
    && /catch\(e => \{[\s\S]{0,120}fijarServicios\(\[\]\)/.test(ui));
  check('el PDF lleva su propio guard (punto 19)', /function exportar[\s\S]{0,300}puedoAcceder\('fichajes'\)/.test(ui));
  check('la ficha de fichaje usa el modo de papel claro de los gráficos',
    /'modo-fichaje-print'/.test(fs.readFileSync('./js/sgadd-charts.js', 'utf8')));
  check('el ADN sale del motor de la ficha, no de una copia', /jugadoresAdnLiga\(idx\)/.test(ui) && !/function jugadoresADN/.test(ui));
  check('la tendencia filtra por EQUIPO (el homónimo del punto 86)', /p\.__equipo === eq/.test(ui));
  const idx = fs.readFileSync('./index.html', 'utf8');
  check('la sección se monta ANTES del modo landing: no depende del club abierto',
    idx.indexOf("if (section === 'fichajes')") !== -1
    && idx.indexOf("if (section === 'fichajes')") < idx.indexOf('SGADD_LANDING.activa()) {\n    root.innerHTML = SGADD_LANDING.vista'));

  console.log('\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
