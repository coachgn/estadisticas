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
  JSON.stringify(M.normalizarFicha({ nacimiento: '1999-03-12', posicion: '1-2', talla: '183' }, HOY))
  === JSON.stringify({ nacimiento: '1999-03-12', posicion: '1-2', talla: 183 }));
check('el año solo alcanza: es lo que suele saber un entrenador',
  M.normalizarFicha({ nacimiento: '2001' }, HOY).nacimiento === '2001');
check('una ficha vacía es null: no se guarda nada',
  M.normalizarFicha({ nacimiento: '', posicion: '', talla: '' }, HOY) === null);
check('una fecha que no existe se rechaza', M.normalizarFicha({ nacimiento: '2001-02-30' }, HOY).error === 'NACIMIENTO');
check('un año implausible se rechaza', M.normalizarFicha({ nacimiento: '2024' }, HOY).error === 'NACIMIENTO');
check('una posición inventada se rechaza', M.normalizarFicha({ posicion: 'LIBERO' }, HOY).error === 'POSICION');
check('una talla fuera de rango se rechaza (va en cm)', M.normalizarFicha({ talla: '1.92' }, HOY).error === 'TALLA');
titulo('1 · LA ESCALA DE PUESTOS · 1 | 1-2 | 2 | 2-3 | 3 | 3-4 | 4 | 4-5 | 5');

check('la escala tiene los nueve puestos, en orden',
  M.POSICIONES.map(p => p.id).join(' | ') === '1 | 1-2 | 2 | 2-3 | 3 | 3-4 | 4 | 4-5 | 5');
check('un híbrido CUBRE sus dos puestos, y el primero es el principal',
  JSON.stringify(M.cubre('2-3')) === '[2,3]' && M.POR_POSICION['2-3'].principal === 2 && M.POR_POSICION['2-3'].hibrido);
check('se aceptan las formas en que se escribe: 2/3, 3-2, guion largo',
  M.idPosicion('2/3') === '2-3' && M.idPosicion('3-2') === '2-3' && M.idPosicion('4–5') === '4-5');
check('solo se combinan puestos VECINOS: un 1-3 no es de la escala', M.idPosicion('1-3') === false
  && M.normalizarFicha({ posicion: '1-3' }, HOY).error === 'POSICION');
check('fuera de 1 a 5 no es un puesto', M.idPosicion('6') === false && M.idPosicion('0-1') === false);
check('LEGADO: las fichas con nombre se leen en la escala', M.idPosicion('ALERO') === '3' && M.idPosicion('PIVOTE') === '5');
check('LEGADO: un nombre + secundaria VECINA se pliega al híbrido',
  M.normalizarFicha({ posicion: 'ESCOLTA', secundaria: 'ALERO' }, HOY).posicion === '2-3'
  && M.normalizarFicha({ posicion: 'PIVOTE', secundaria: 'ALA-PIVOTE' }, HOY).posicion === '4-5');
check('LEGADO: una secundaria que no es vecina se descarta, sin inventar un híbrido',
  M.normalizarFicha({ posicion: 'BASE', secundaria: 'ALERO' }, HOY).posicion === '1');
check('la ficha ya no guarda un campo «secundaria»: lo dice el híbrido',
  M.normalizarFicha({ posicion: 'ESCOLTA', secundaria: 'ALERO' }, HOY).secundaria === undefined);

titulo('1 · EL VOLUMEN DE TIRO · convertidos/intentados');

check('por partido, con un decimal y coma', M.textoVolumen(5.23, 11.41) === '5,2/11,4');
check('en el total, enteros', M.textoVolumen(166, 365, 0) === '166/365');
check('la lista «Contra su zona» va de lo general a lo particular: Volumen · Eficiencia · Volumen de tiro · Creación · Rebote y defensa',
  M.metricasPorGrupo(false).map(g => g.grupo).join('|') === 'Volumen|Eficiencia|Volumen de tiro|Creación|Rebote y defensa');
check('sin totales, ningún total del tramo; con totales, en Volumen de tiro',
  M.metricasPorGrupo(false).every(g => g.ids.every(k => k.indexOf('tot:') !== 0))
  && M.metricasPorGrupo(true).filter(g => g.grupo === 'Volumen de tiro')[0].ids.indexOf('tot:T3I') !== -1);
check('ninguna métrica del filtro se pierde al agrupar',
  [].concat.apply([], M.metricasPorGrupo(true).map(g => g.ids)).length === M.IDS_FILTRO.length);
check('el tiro de campo predominante es el de más intentos, sin contar los libres',
  M.tiroPredominante({ T2I: 3, T3I: 6.2, T1I: 9 }) === 'T3' && M.tiroPredominante({ T2I: 7, T3I: 2 }) === 'T2');
check('con empate gana el doble, y sin tiros de campo no hay perfil',
  M.tiroPredominante({ T2I: 4, T3I: 4 }) === 'T2' && M.tiroPredominante({ T2I: 0, T3I: 0, T1I: 5 }) === null
  && M.tiroPredominante(null) === null);
check('sin intentos es 0/0: no tiró, y eso es un dato', M.textoVolumen(0, 0) === '0,0/0,0');
check('si falta uno de los dos, null: «—/11,4» se leería como cero convertidos',
  M.textoVolumen(null, 11.4) === null && M.textoVolumen(3, undefined) === null);
check('las cuatro familias de tiro, con su acierto',
  M.VOLUMEN_TIRO.map(v => v.conv + '/' + v.int + '·' + v.pct).join(' ') === 'TCC/TCI·TC% T2C/T2I·T2% T3C/T3I·T3% T1C/T1I·T1%');
check('el buscador filtra por intentos, por partido y en el total',
  ['TCI', 'T2I', 'T3I', 'T1I', 'tot:TCI', 'tot:T3I', 'tot:T1I'].every(k => M.IDS_FILTRO.indexOf(k) !== -1));
check('los totales están marcados: no tienen percentil',
  M.METRICAS_FILTRO.filter(x => /^tot:/.test(x.id)).every(x => x.total === true && !!x.label));
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
  fila({ nombre: 'ALTO, TIRADOR', m: { 'TS%': 0.62, PTS: 15, 'tot:T3I': 180 }, pc: { 'TS%': 90, PTS: 80 }, ficha: { edad: 24, posicion: '2-3', talla: 192 } }),
  fila({ nombre: 'BAJO, GENERADOR', rol: 'generador-primario', secundarios: ['slasher'], m: { 'TS%': 0.51, PTS: 18, 'tot:T3I': 40 }, pc: { 'TS%': 40, PTS: 92 }, ficha: { edad: 31, posicion: '1', talla: 180 } }),
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
r = M.filtrar(FILAS, { posiciones: ['1'] });
check('el puesto se filtra por la ficha', r.filas.length === 1 && r.filas[0].nombre === 'BAJO, GENERADOR' && r.sinDato === 2);
r = M.filtrar(FILAS, { posiciones: ['3'] });
check('un 2-3 aparece pidiendo ALEROS: su faceta secundaria cuenta', r.filas.length === 1 && r.filas[0].nombre === 'ALTO, TIRADOR');
r = M.filtrar(FILAS, { posiciones: ['3'], puestosSecundarios: false });
check('y NO aparece si se piden solo los puestos principales', r.filas.length === 0);
r = M.filtrar(FILAS, { posiciones: ['2'], puestosSecundarios: false });
check('por su principal aparece igual', r.filas.length === 1 && r.filas[0].nombre === 'ALTO, TIRADOR');
r = M.filtrar(FILAS, { rangos: { 'tot:T3I': { min: 100 } } });
check('el volumen TOTAL de intentos filtra la muestra', r.filas.length === 1 && r.filas[0].nombre === 'ALTO, TIRADOR' && r.sinDato === 2);
check('y se puede ordenar por él', M.ordenar(FILAS, 'tot:T3I', 'desc')[0].nombre === 'ALTO, TIRADOR');
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

titulo('1 quater. EL PERÍODO · fases y fechas (punto 90)');

global.SGADD = global.SGADD || require('./js/sgadd-core.js');
const CORE = global.SGADD;
{
  /* Un libro chico con DOS torneos en la misma fase (IDA y VUELTA), una
     fecha por jornada, y un jugador cuyos puntos SUBEN con la fecha: así
     cualquier recorte da un promedio distinto y se puede verificar a mano. */
  const dia = (i) => (i < 10 ? '0' + i : i) + '/0' + (i <= 6 ? 3 : 4) + '/2026';   // jornadas 1-6 en marzo, 7-12 en abril
  const torneoDe = (i) => i <= 6 ? 'IDA' : 'VUELTA';
  const colsE = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'TORNEO', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp', 'T3C', 'T3I'];
  const colsJ = ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'TORNEO', 'CONDICION', 'RESULTADO', 'MIN', 'PTS', 'T3C', 'T3I'];
  const filasE = [], filasJ = [];
  for (let i = 1; i <= 12; i++) {
    const partido = 'A vs B ' + i;
    filasE.push({ FECHA: dia(i), PARTIDO: partido, EQUIPO: 'A', FASE: 'REGULAR', TORNEO: torneoDe(i), CONDICION: 'LOCAL', RESULTADO: 'GANADO', PTS: 80, PTSopp: 70, T3C: 8, T3I: 24 });
    filasE.push({ FECHA: dia(i), PARTIDO: partido, EQUIPO: 'B', FASE: 'REGULAR', TORNEO: torneoDe(i), CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', PTS: 70, PTSopp: 80, T3C: 6, T3I: 22 });
    /* CRECIENTE recibe i puntos en la jornada i, y tira i triples. */
    filasJ.push({ FECHA: dia(i), PARTIDO: partido, NOMBRES: 'CRECIENTE, JUAN', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: torneoDe(i), CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: 30, PTS: i, T3C: 1, T3I: i });
    filasJ.push({ FECHA: dia(i), PARTIDO: partido, NOMBRES: 'FIJO, LUIS', EQUIPO: 'B', FASE: 'REGULAR', TORNEO: torneoDe(i), CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', MIN: 25, PTS: 10, T3C: 2, T3I: 5 });
  }
  /* Solo jugó la VUELTA. */
  for (let i = 7; i <= 12; i++) {
    filasJ.push({ FECHA: dia(i), PARTIDO: 'A vs B ' + i, NOMBRES: 'TARDIO, PEPE', EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'VUELTA', CONDICION: 'LOCAL', RESULTADO: 'GANADO', MIN: 20, PTS: 6, T3C: 0, T3I: 1 });
  }
  /* Una planilla de jugador SIN fecha, de un partido con UNA sola fecha: se ubica. */
  filasJ.push({ FECHA: '', PARTIDO: 'A vs B 3', NOMBRES: 'SIN FECHA, ANA', EQUIPO: 'B', FASE: 'REGULAR', TORNEO: 'IDA', CONDICION: 'VISITANTE', RESULTADO: 'PERDIDO', MIN: 10, PTS: 4, T3C: 0, T3I: 0 });
  const HOJAS = { 'Base Datos E': { cols: colsE, filas: filasE }, 'Base Datos J': { cols: colsJ, filas: filasJ } };
  const DEP = { fecha: CORE.fecha, texto: CORE.texto };

  check('diaIso da el día LOCAL en ISO', M.diaIso(new Date(2026, 2, 5)) === '2026-03-05' && M.diaIso(null) === null);
  check('hayFechas solo con días válidos', M.hayFechas({ desde: '2026-03-01' }) && !M.hayFechas({ desde: '1/3/2026' }) && !M.hayFechas({}));
  check('el rótulo de los tramos', M.etiquetaTramo({ torneo: 'IDA', fase: 'REGULAR' }) === 'IDA · REGULAR'
    && M.etiquetaTramo({ torneo: '*TOTAL*', fase: 'REGULAR' }) === 'Total · REGULAR'
    && M.etiquetaTramo({ torneo: 'GENERAL', fase: 'REGULAR' }) === 'REGULAR');

  let rec = M.recortarHojas(HOJAS, { fase: 'REGULAR' }, DEP);
  check('sin fechas no se recorta nada: los 12 partidos y el rango del libro',
    rec.partidos === 12 && rec.rango[0] === '2026-03-01' && rec.rango[1] === '2026-04-12', JSON.stringify(rec.rango));
  rec = M.recortarHojas(HOJAS, { fase: 'REGULAR', desde: '2026-04-01', hasta: '2026-04-30' }, DEP);
  check('un rango de fechas deja SOLO esos partidos (abril = jornadas 7 a 12)', rec.partidos === 6
    && rec.hojas['Base Datos E'].filas.length === 12);
  check('los dos extremos son inclusivos', M.recortarHojas(HOJAS, { fase: 'REGULAR', desde: '2026-03-03', hasta: '2026-03-03' }, DEP).partidos === 1);
  rec = M.recortarHojas(HOJAS, { fase: 'REGULAR', desde: '2026-03-01', hasta: '2026-03-06' }, DEP);
  check('la planilla SIN fecha se ubica por su partido, si tiene una sola fecha',
    rec.hojas['Base Datos J'].filas.some(f => f.NOMBRES === 'SIN FECHA, ANA') && rec.sinFecha === 0);
  rec = M.recortarHojas(HOJAS, { fase: 'REGULAR', torneo: 'VUELTA' }, DEP);
  check('el tramo filtra por torneo', rec.partidos === 6 && rec.hojas['Base Datos J'].filas.every(f => f.TORNEO === 'VUELTA'));
  check('*TOTAL* y GENERAL no filtran por torneo', M.recortarHojas(HOJAS, { fase: 'REGULAR', torneo: '*TOTAL*' }, DEP).partidos === 12);
  check('una fase que no existe deja todo vacío', M.recortarHojas(HOJAS, { fase: 'PLAYOFFS', desde: '2026-03-01' }, DEP).partidos === 0);
  /* AMBIGUA: dos fechas para el mismo texto de PARTIDO (ida y vuelta con el mismo local). */
  const amb = { 'Base Datos E': { cols: colsE, filas: [
    { FECHA: '01/03/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', PTS: 80, PTSopp: 70 },
    { FECHA: '01/04/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR', PTS: 80, PTSopp: 70 }] },
    'Base Datos J': { cols: colsJ, filas: [{ FECHA: '', PARTIDO: 'A vs B', NOMBRES: 'X', EQUIPO: 'A', FASE: 'REGULAR', MIN: 10, PTS: 2 }] } };
  rec = M.recortarHojas(amb, { fase: 'REGULAR', desde: '2026-03-01' }, DEP);
  check('una planilla sin fecha de un partido con DOS fechas queda afuera y se CUENTA (no se inventa la noche)',
    rec.hojas['Base Datos J'].filas.length === 0 && rec.sinFecha === 1);

  /* Y EL ÍNDICE RECONSTRUIDO: lo que de verdad ve la búsqueda. */
  const indice = (p) => {
    const r = M.recortarHojas(HOJAS, Object.assign({ fase: 'REGULAR' }, p), DEP);
    return CORE.construirIndice(r.hojas, { fase: 'REGULAR', torneo: CORE.TORNEO_TOTAL });
  };
  const jug = (idx, n) => idx.liga.jugadores.find(j => j.NOMBRES === n);
  const todo = jug(indice({}), 'CRECIENTE, JUAN');
  check('temporada completa: 12 PJ y 6,5 PTS (1 a 12 promediado)', todo.PJ === 12 && Math.abs(todo.PTS - 6.5) < 1e-9, todo.PJ + ' / ' + todo.PTS);
  const abril = jug(indice({ desde: '2026-04-01', hasta: '2026-04-30' }), 'CRECIENTE, JUAN');
  check('solo abril: 6 PJ y 9,5 PTS (7 a 12) — el promedio CAMBIA con el período',
    abril.PJ === 6 && Math.abs(abril.PTS - 9.5) < 1e-9, abril.PJ + ' / ' + abril.PTS);
  check('y el VOLUMEN también: 9,5 triples intentados por partido en abril contra 6,5 en la temporada',
    Math.abs(abril.T3I - 9.5) < 1e-9 && Math.abs(todo.T3I - 6.5) < 1e-9);
  check('las tasas se rehacen sobre los totales del período (T3% = 6/57), no se promedian',
    Math.abs(abril['T3%'] - 6 / 57) < 1e-9, abril['T3%']);
  const marzo = indice({ desde: '2026-03-01', hasta: '2026-03-31' });
  check('el que no jugó en el período NO aparece (la UI lo cuenta como excluido)',
    !jug(marzo, 'TARDIO, PEPE') && !!jug(indice({ desde: '2026-04-01' }), 'TARDIO, PEPE'));
  check('fase + fechas se combinan: VUELTA hasta el 9/4 son 3 partidos',
    jug(indice({ torneo: 'VUELTA', hasta: '2026-04-09' }), 'CRECIENTE, JUAN').PJ === 3);
}

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


titulo('1 quater. EL % DE COINCIDENCIA (punto 91) · puertas duras y puntaje');

{
  const CTX = {
    ejes: { 'generador-primario': 'creacion', 'manejador-secundario': 'creacion', 'slasher': 'penetracion', 'spacing': 'tiro' },
    bandasMinutos: [{ id: 'clave', min: 25, max: Infinity }, { id: 'importante', min: 20, max: 25 },
      { id: 'rotacion', min: 15, max: 20 }, { id: 'pocos', min: -Infinity, max: 15 }],
    ordenJerarquia: ['franquicia', 'referente', 'quinteto', 'especialista'],
    percentilDe: (f, k, v) => k.indexOf('tot:') === 0 ? null : v * 100,   // lineal; los totales sin distribución
  };
  const fila = (o) => Object.assign({ califica: true, zona: 'a', equipo: 'X', nombre: 'N', rol: 'slasher', secundarios: [],
    origen: 'perimetral', arquetipos: [], cercania: {}, jerarquia: 'especialista', rolMinutos: 'rotacion',
    m: { MIN: 18, PJ: 12, 'tot:TCI': 90 }, pc: {} }, o);

  const P = M.PESOS_COINCIDENCIA;
  check('los pesos aprobados: función 35 · perfiles 25 · rangos 15 · minutos 15 · jerarquía 10, y suman 100',
    P.funcion === 0.35 && P.perfiles === 0.25 && P.rangos === 0.15 && P.minutos === 0.15 && P.jerarquia === 0.10
    && Math.abs(P.funcion + P.perfiles + P.rangos + P.minutos + P.jerarquia - 1) < 1e-9);
  check('el piso es 60 %', M.PISO_COINCIDENCIA === 0.6);

  const fn = (f, roles, sec) => M.coincidencia(f, { roles: roles, incluirSecundarios: sec !== false }, CTX).pct;
  check('función: el mismo rol suma entero', fn(fila({}), ['slasher']) === 1);
  check('función: la faceta secundaria 60 %', fn(fila({ rol: 'spacing', secundarios: ['slasher'] }), ['slasher']) === 0.6);
  check('función: sin contar secundarias, la secundaria no da el 60 %',
    fn(fila({ rol: 'spacing', secundarios: ['slasher'] }), ['slasher'], false) === 0.25);
  check('función: el mismo eje 50 %', fn(fila({ rol: 'manejador-secundario' }), ['generador-primario']) === 0.5);
  check('función: el mismo lado 25 % (único rastro de biotipo sin puesto ni talla)',
    fn(fila({ rol: 'spacing', origen: 'perimetral' }), ['slasher']) === 0.25);
  check('función: un interior contra un rol perimetral no suma',
    fn(fila({ rol: 'poste-bajo', origen: 'interior' }), ['slasher']) === 0);
  check('función: con varios roles pedidos vale el mejor', fn(fila({}), ['spacing', 'slasher']) === 1);

  const pf = (f, a) => M.coincidencia(f, { arquetipos: a }, CTX).pct;
  check('perfiles: los tiene todos → 100 %', pf(fila({ arquetipos: ['generador', 'amenaza'] }), ['generador', 'amenaza']) === 1);
  check('perfiles: uno de más no resta', pf(fila({ arquetipos: ['generador', 'puntal'] }), ['generador']) === 1);
  check('perfiles: al que le falta uno se le reconoce su cercanía al corte',
    Math.abs(pf(fila({ arquetipos: ['generador'], cercania: { amenaza: 0.86 } }), ['generador', 'amenaza']) - 0.93) < 1e-9);
  check('perfiles: la cercanía tiene tope 90 % aunque el dato diga más',
    pf(fila({ cercania: { amenaza: 1 } }), ['amenaza']) === 0.9);
  check('y el detalle dice qué le falta y a qué distancia',
    /le falta amenaza \(86 % del corte\)/.test(M.coincidencia(fila({ cercania: { amenaza: 0.86 } }), { arquetipos: ['amenaza'] }, CTX).faltan[0]));

  const mn = (f, b) => M.coincidencia(f, { rolesMinutos: b }, CTX).pct;
  check('minutos: la misma banda 100 %', mn(fila({}), ['rotacion']) === 1);
  check('minutos: la banda de al lado 50 %', mn(fila({ rolMinutos: 'importante', m: { MIN: 23 } }), ['rotacion']) === 0.5);
  check('minutos: a menos de 2 minutos del borde 75 %', mn(fila({ rolMinutos: 'importante', m: { MIN: 20.9 } }), ['rotacion']) === 0.75);
  check('minutos: dos bandas de distancia no suma', mn(fila({ rolMinutos: 'clave', m: { MIN: 30 } }), ['rotacion']) === 0);

  const jr = (f, j) => M.coincidencia(f, { jerarquias: j }, CTX).pct;
  check('jerarquía: la misma 100 %, la de al lado 50 %, más lejos 0',
    jr(fila({}), ['especialista']) === 1 && jr(fila({ jerarquia: 'quinteto' }), ['especialista']) === 0.5
    && jr(fila({ jerarquia: 'franquicia' }), ['especialista']) === 0);

  const rg = (f, r) => M.coincidencia(f, { rangos: r }, CTX).pct;
  check('rangos: adentro suma entero', rg(fila({ pc: { 'TS%': 80 } }), { 'TS%': { pc: true, min: 75 } }) === 1);
  check('rangos: afuera resta por la distancia en percentiles (10 puntos → 60 %)',
    Math.abs(rg(fila({ pc: { 'TS%': 65 } }), { 'TS%': { pc: true, min: 75 } }) - 0.6) < 1e-9);
  check('rangos por valor: la distancia se mide en el percentil de SU zona',
    Math.abs(rg(fila({ m: { MIN: 18, 'TS%': 0.50 } }), { 'TS%': { min: 0.55 } }) - 0.8) < 1e-9);
  check('rangos: sin el dato no suma', rg(fila({}), { 'TS%': { pc: true, min: 75 } }) === 0);
  check('rangos: un total (sin percentil) usa la distancia relativa',
    Math.abs(rg(fila({ m: { MIN: 18, 'tot:T3I': 90 } }), { 'tot:T3I': { min: 100 } }) - 0.6) < 1e-9);

  const todo = M.coincidencia(fila({}), { roles: ['slasher'], jerarquias: ['franquicia'] }, CTX);
  check('se normaliza sobre lo que se PIDIÓ: función 35 + jerarquía 10',
    Math.abs(todo.pct - 0.35 / 0.45) < 1e-9 && todo.partes.length === 2);
  check('sin nada puntuable, no hay %', M.coincidencia(fila({}), {}, CTX).pct === null);

  const pool = [
    fila({ nombre: 'A', rol: 'slasher', m: { MIN: 18, PJ: 4, 'tot:TCI': 20 } }),
    fila({ nombre: 'B', rol: 'slasher', m: { MIN: 18, PJ: 14, 'tot:TCI': 120 } }),
    fila({ nombre: 'C', rol: 'poste-bajo', origen: 'interior' }),
    fila({ nombre: 'D', rol: 'slasher', califica: false }),
  ];
  const ev = M.evaluar(pool, { roles: ['slasher'], soloCalificados: true }, CTX);
  check('evaluar: el que no llega al piso queda afuera y se cuenta', ev.items.length === 2 && ev.bajoPiso === 1);
  check('evaluar: la muestra mínima es PUERTA (no suma, descarta)', !ev.items.some(x => x.fila.nombre === 'D'));
  check('evaluar: con el mismo %, primero el de más confianza', ev.items[0].fila.nombre === 'B' && ev.items[1].fila.nombre === 'A');
  check('evaluar: un rango COMÚN no descarta: resta, y a 10 percentiles queda en el piso (60 %)',
    M.evaluar([fila({ pc: { 'TS%': 65 } })], { rangos: { 'TS%': { pc: true, min: 75 } } }, CTX).items.length === 1);
  check('evaluar: un rango OBLIGATORIO descarta en vez de restar',
    M.evaluar([fila({ pc: { 'TS%': 65 } })], { rangos: { 'TS%': { pc: true, min: 75, duro: true } } }, CTX).items.length === 0);
  const sinP = M.evaluar(pool, { soloCalificados: true }, CTX);
  check('evaluar: sin criterios puntuables pasan todos los de las puertas, sin %',
    sinP.items.length === 3 && !sinP.puntua && sinP.items.every(x => x.coinc.pct === null));
  check('filtrar sin opciones sigue siendo todo filtro duro (compatibilidad)',
    M.filtrar(pool, { roles: ['slasher'] }).filas.length === 3
    && M.filtrar(pool, { roles: ['slasher'] }, { soloPuertas: true }).filas.length === 4);

  check('confianza: alta (10+ PJ, 15+ min, 60+ tiros), media (5+ PJ, 8+ min), baja',
    M.confianza(fila({ m: { PJ: 12, MIN: 18, 'tot:TCI': 90 } })).id === 'alta'
    && M.confianza(fila({ m: { PJ: 6, MIN: 9, 'tot:TCI': 20 } })).id === 'media'
    && M.confianza(fila({ m: { PJ: 3, MIN: 20, 'tot:TCI': 30 } })).id === 'baja');
  check('y dice de dónde sale', /12 PJ · 18,0 min · 90 tiros de campo/.test(M.confianza(fila({ m: { PJ: 12, MIN: 18, 'tot:TCI': 90 } })).motivo));

  const anid = [fila({ jerarquia: 'franquicia', rolMinutos: 'clave' }), fila({ jerarquia: 'especialista', rolMinutos: 'pocos' }),
    fila({ jerarquia: 'especialista', rolMinutos: 'rotacion' })];
  const cf = M.conteosFacetas(anid, { rolesMinutos: ['rotacion'] });
  check('facetas: minutos y jerarquía se cuentan CRUZADOS (Franquicia + Rotación = 0)',
    !cf.jerarquias.franquicia && cf.jerarquias.especialista === 1);
  const cf2 = M.conteosFacetas(anid, { jerarquias: ['franquicia'] });
  check('y al revés: con Franquicia elegida, Pocos Minutos queda en 0', !cf2.rolesMinutos.pocos && cf2.rolesMinutos.clave === 1);
}

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
    { cambios: { [CLAVE]: { nacimiento: '1998', posicion: '3/4', talla: '195' } } }));
  check('el admin guarda una ficha, con el puesto llevado a la escala', res.status === 200
    && res.body.fichas[CLAVE].talla === 195 && res.body.fichas[CLAVE].posicion === '3-4');
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { [CLAVE]: { posicion: '1-3' } } }));
  check('el SERVIDOR rechaza un puesto fuera de la escala, con el mismo motor', res.status === 400 && res.body.codigo === 'POSICION');
  /* Una ficha guardada con la escala VIEJA se sigue sirviendo, plegada. */
  hashes[F.claveFichas('liga-argentina-2026-27')]['GOMEZ, LUIS|B'] = JSON.stringify({ posicion: 'ESCOLTA', secundaria: 'ALERO' });
  res = await F.manejarZona(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('una ficha de la escala vieja sale plegada al híbrido', res.body.fichas['GOMEZ, LUIS|B'].posicion === '2-3');
  delete hashes[F.claveFichas('liga-argentina-2026-27')]['GOMEZ, LUIS|B'];
  check('campo por campo: HSET y nunca SET/DEL', ops.indexOf('HSET ' + F.claveFichas('liga-argentina-2026-27')) !== -1
    && !ops.some(o => /^(SET|DEL) /.test(o)), ops.join(' | '));
  await F.manejarPadronEscribir(pedido(tokAdmin, {}, { email: 'scout@club.com', torneos: ['liga-argentina-2026-27'] }));
  res = await F.manejarZona(pedido(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
  check('y el habilitado la recibe con el libro', res.status === 200 && res.body.fichas[CLAVE].talla === 195 && res.body.fichasLeidas === true);
  res = await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { [CLAVE]: {} } }));
  check('vaciar una ficha la deja «sin ficha» sin borrar el campo', res.status === 200 && res.body.fichas[CLAVE] === undefined
    && hashes[F.claveFichas('liga-argentina-2026-27')][CLAVE] !== undefined);

  titulo('3 bis. EL PADRÓN DEL LIBRO (PADRON J) · completa las fichas sin pisarlas');
  {
    const original = sheets.obtenerDatosPlanilla;
    const rangos = [];
    sheets.obtenerDatosPlanilla = async (id, rango) => {
      rangos.push(rango);
      return { rango: rango, valores: [
        ['ID_JUGADOR', 'NOMBRES', 'EQUIPO', 'TORNEO', 'ID_EQUIPO_FUENTE', 'DORSAL', 'NACIMIENTO', 'EDAD TEMPORADA', 'PUESTO', 'TALLA'],
        [1, 'PEREZ, JUAN', 'A', 'IDA', 10, 5, '14/3/1991', 35, '', ''],
        [2, 'GOMEZ,  LUIS', 'B', 'IDA', 20, 7, '2001-07-02', 25, '2-3', 198],
      ] };
    };
    await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { 'PEREZ, JUAN|A': { nacimiento: '1990', talla: 201 } } }));
    res = await F.manejarZona(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
    check('pide la pestaña PADRON J del libro de la zona', rangos[0] === "'PADRON J'");
    check('la ficha MANUAL gana campo por campo: su nacimiento y su talla quedan',
      res.body.fichas['PEREZ, JUAN|A'].nacimiento === '1990' && res.body.fichas['PEREZ, JUAN|A'].talla === 201);
    check('un jugador sin ficha manual recibe la del padrón: nacimiento, puesto y talla',
      res.body.fichas['GOMEZ, LUIS|B'] && res.body.fichas['GOMEZ, LUIS|B'].nacimiento === '2001-07-02'
      && res.body.fichas['GOMEZ, LUIS|B'].posicion === '2-3' && res.body.fichas['GOMEZ, LUIS|B'].talla === 198,
      JSON.stringify(res.body.fichas['GOMEZ, LUIS|B']));
    check('la respuesta dice qué leyó del padrón', res.body.padron.leido === true && res.body.padron.filas === 2 && res.body.padron.completadas === 1);
    check('y sigue sin sheetId', sinSheetId(res.body));
    sheets.obtenerDatosPlanilla = async () => { throw new Error('Unable to parse range: PADRON J'); };
    res = await F.manejarZona(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }));
    check('un libro SIN PADRON J: 200 y las fichas manuales de siempre', res.status === 200 && res.body.padron.leido === false
      && res.body.fichas['PEREZ, JUAN|A'].talla === 201 && !res.body.fichas['GOMEZ, LUIS|B']);
    sheets.obtenerDatosPlanilla = original;
    await F.manejarFichasEscribir(pedido(tokAdmin, { torneo: 'liga-argentina-2026-27' }, { cambios: { 'PEREZ, JUAN|A': {} } }));
  }

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

  titulo('4 bis. VOLUMEN Y PUESTOS EN LA PANTALLA');

  check('la Radiografía y Comparar arman «Contra su zona» con el MISMO agrupado del motor',
    (ui.match(/M\.metricasPorGrupo\(/g) || []).length === 2 && /Contra su zona<\/th>/.test(ui));
  check('en Comparar cada celda trae volumen del acierto, barra y percentil, como la Radiografía',
    /function vistaComparar[\s\S]{0,4000}volumenDeAcierto\(f, k\)[\s\S]{0,400}barraPc\(f\.pc\[k\]\)/.test(ui));
  check('el panel va de lo general a lo particular: 1 Zona y período → 2 Muestra → 3 Minutos → 4 Jerarquía → 5 Función → 6 Perfiles → 7 Rangos',
    [/encabezadoNivel\('1', 'Zona y período'/, /encabezadoNivel\('2', 'Muestra mínima'/, /nivelFiltro\('3', 'Rol por minutos'/,
      /nivelFiltro\('4', 'Jerarquía en su plantel'/, /nivelFiltro\('5', 'Función en cancha'/, /nivelFiltro\('6', 'Perfiles técnicos'/,
      /encabezadoNivel\('7', 'Rangos de métricas'/].map(re => ui.search(re)).every((i, n, l) => i > 0 && (n === 0 || i > l[n - 1])));
  check('la búsqueda usa puertas + % de coincidencia, y la card lo muestra con la confianza aparte',
    /M\.evaluar\(todas, ST\.crit, ctxCoincidencia\(\)\)/.test(ui) && /\$\{lineaCoincidencia\(item, f\)\}/.test(ui) && /Confianza \$\{/.test(ui));
  check('las opciones llevan su conteo y la combinación imposible se deshabilita',
    /M\.conteosFacetas\(pool, c\)/.test(ui) && /vacia \? 'disabled aria-disabled="true"'/.test(ui));
  check('un rango se puede marcar obligatorio', /fijarRangoDuro\(/.test(ui) && /> obligatorio<\/label>/.test(ui));
  check('la cercanía de los perfiles sale del MISMO motor que los etiqueta', /jugadoresCercaniaPerfil\(p, j, prom\)/.test(ui));
  check('la Radiografía tiene «Buscar parecidos en todo el torneo», con la similitud del punto 58 y el mismo piso',
    /SGADD_FICHAJES\.buscarParecidos\(/.test(ui) && /Buscar parecidos en todo el torneo/.test(ui)
    && /function parecidos[\s\S]{0,400}jugadoresSimilitud\(f\._adn, x\._adn\)[\s\S]{0,200}M\.PISO_COINCIDENCIA/.test(ui));
  check('la card muestra el volumen al lado del acierto', /function lineaVolumen/.test(ui) && /\$\{lineaVolumen\(f\)\}/.test(ui));
  check('la card rotula el tiro de campo con su familia de más intentos: «TC - T2» / «TC - T3»',
    /M\.tiroPredominante\(f\.vol\)/.test(ui) && /'TC - ' \+ id/.test(ui));
  check('la Radiografía y el PDF traen el bloque de volumen (por partido y total)',
    (ui.match(/\$\{bloqueVolumen\(f\)\}/g) || []).length === 2);
  check('los totales salen de ACUMULADO J y, si falta, de SUMAR su log con su equipo (no de multiplicar promedios)',
    /j\.__acum && typeof j\.__acum\[col\] === 'number'/.test(ui)
    && /filter\(p => p\.__equipo === eqClave\)/.test(ui) && /m\[k\] = total\(k\.slice\(4\)\)/.test(ui));
  check('los totales no se piden por percentil', /porPercentil && esTotal\(sel\.value\)/.test(ui));
  check('tirar MUCHO no es una fortaleza: el volumen no entra en «lo que lo distingue»',
    /\.filter\(x => x\.grupo !== 'Volumen de tiro' && x\.id !== 'PJ' && x\.id !== 'MIN'\)/.test(ui)
    && /const fuertes = rendimiento\.filter/.test(ui) && /const flojas = rendimiento\.filter/.test(ui));
  check('el formulario tiene UN selector de puesto, con la escala de nueve',
    /name="posicion"/.test(ui) && !/name="secundaria"/.test(ui));
  check('el filtro de puesto respeta la faceta secundaria, como la función',
    /fijar\('puestosSecundarios', this\.checked\)/.test(ui));

  titulo('4 ter. EL PERÍODO EN LA PANTALLA (punto 90)');

  check('con fechas, el índice se RECONSTRUYE con el motor del TOTAL (no un cálculo propio)',
    /M\.hayFechas\(p\)[\s\S]{0,300}construirIndice\(rec\.hojas, \{ fase: tramo\.fase, torneo: SGADD\.TORNEO_TOTAL \}\)/.test(ui));
  check('cada período se calcula UNA vez por zona y queda en caché', /zona\.vistas\.has\(firma\)/.test(ui) && /zona\.vistas\.set\(firma, v\)/.test(ui));
  check('reconstruido, AST% YA NO se blanquea: el núcleo da el de la planilla (punto 24)',
    !/m\['AST%'\] = null/.test(ui) && !/AST% no se calcula/.test(ui) && !/k === 'AST%'/.test(ui));
  check('una zona que no jugó el tramo queda afuera y se dice', /fueraDeTramo: true/.test(ui) && /no jugó ese tramo/.test(ui));
  check('el badge de muestra parcial sale en la búsqueda, la Radiografía, los parecidos y el PDF',
    (ui.match(/\$\{badgePeriodo\(\)\}/g) || []).length === 2 && /badgePeriodo\(\) \+ (bloqueLideres\(todas\) \+ )?buscador/.test(ui) && /\$\{badgePeriodo\(true\)\}/.test(ui));
  check('el badge dice cuántos partidos se analizaron y cuántos jugadores quedaron afuera',
    /partido\$\{r\.partidos === 1 \? '' : 's'\} analizado/.test(ui) && /sin partidos en el período quedaron afuera/.test(ui));
  check('los controles: fase y calendario Desde/Hasta acotado a los días del libro',
    /fijarPeriodo\('tramo', this\.value\)/.test(ui) && /type="date"[\s\S]{0,200}fijarPeriodo\('desde'/.test(ui)
    && /fijarPeriodo\('hasta', this\.value\)/.test(ui) && /min="' \+ rango\[0\]/.test(ui));
  check('«Desde» posterior a «Hasta» se rechaza', /nuevo\.desde && nuevo\.hasta && nuevo\.desde > nuevo\.hasta/.test(ui));
  check('un período nuevo avisa que recalcula antes de congelar la pantalla', /Recalculando la muestra del período/.test(ui));
  check('el período no viaja de un torneo a otro', /ST\.periodo = Object\.assign\(\{\}, PERIODO_VACIO\);/.test(ui));

  titulo('5. LOS ESCUDOS SE LEEN · el fondo sale de su propio dibujo (punto 89)');

  const UIJS = require('./js/sgadd-ui.js');
  /* Píxeles armados a mano: 24x24 = 576. */
  const lienzo = (n, rgba, transparentes) => {
    const a = [];
    for (let i = 0; i < n; i++) a.push.apply(a, i < transparentes ? [0, 0, 0, 0] : rgba);
    return a;
  };
  check('trazo NEGRO sobre transparente → oscuro', UIJS.tonoDePixeles(lienzo(576, [10, 10, 10, 255], 300)) === 'oscuro');
  check('trazo BLANCO sobre transparente → claro', UIJS.tonoDePixeles(lienzo(576, [250, 250, 250, 255], 300)) === 'claro');
  check('un escudo con fondo propio → opaco: no se toca', UIJS.tonoDePixeles(lienzo(576, [10, 10, 10, 255], 5)) === 'opaco');
  check('colores de luminancia media → medio: se lee sobre los dos fondos',
    UIJS.tonoDePixeles(lienzo(576, [60, 140, 220, 255], 300)) === 'medio');
  /* Un rojo oscuro (luminancia 0,14) da 3,2:1 contra la card: va al disco
     claro, donde se lee mejor. */
  check('un rojo oscuro cuenta como oscuro', UIJS.tonoDePixeles(lienzo(576, [200, 40, 40, 255], 300)) === 'oscuro');
  check('el gris de Villa Elisa —53 % oscuro, el caso límite medido— cae del lado oscuro',
    UIJS.tonoDePixeles(lienzo(272, [20, 20, 20, 255], 0).concat(lienzo(304, [90, 90, 90, 255], 0)).concat(lienzo(300, [0, 0, 0, 0], 300))) === 'oscuro');
  check('nada visible que medir → null', UIJS.tonoDePixeles(lienzo(576, [0, 0, 0, 0], 576)) === null);
  check('la luminancia es la de WCAG', Math.abs(UIJS.luminancia(255, 255, 255) - 1) < 1e-9 && UIJS.luminancia(0, 0, 0) === 0);
  const uiSrc = fs.readFileSync('./js/sgadd-ui.js', 'utf8');
  check('se engancha UNA vez, en captura, para todo el documento: alcanza a los 15 lugares que pintan escudos',
    /document\.addEventListener\('load', \(ev\) => \{[\s\S]{0,120}tonoEscudo\(t\)/.test(uiSrc) && /\}, true\);/.test(uiSrc));
  check('un escudo de otro origen no rompe: se queda como estaba', /catch \(e\) \{ tono = null; \}/.test(uiSrc));
  check('el logo de MotorStats del pie no se toca', /motorlogo/.test(uiSrc));
  check('en PANTALLA el escudo oscuro va sobre un disco claro',
    /@media screen \{\s*\.escudo-aro:has\(> img\[data-tono="oscuro"\]\) \{ background: #E5E7EB/.test(idx));
  check('en el PAPEL el escudo claro va sobre un disco oscuro, y se imprime el fondo',
    /\.escudo-aro:has\(> img\[data-tono="claro"\]\)[\s\S]{0,160}background: #374151 !important[\s\S]{0,120}print-color-adjust: exact/.test(idx));
  check('en Fichajes el escudo va en su disco, no suelto sobre la card',
    /<span class="escudo-aro \$\{tam\} shrink-0"><img src=/.test(ui));

  titulo('PUNTO 97 · modelo, nacimiento y el mapa de la Radiografía');
  /* El año de nacimiento: filtro duro, y el que no lo tiene queda afuera. */
  check('anioNacimiento lee el año suelto y la fecha completa', M.anioNacimiento('1998') === 1998
    && M.anioNacimiento('2004-03-02') === 2004 && M.anioNacimiento('') === null);
  const conNac = [{ id: 'a', nombre: 'A', equipo: 'X', califica: true, ficha: { nacimiento: '2003-05-01' } },
    { id: 'b', nombre: 'B', equipo: 'X', califica: true, ficha: { nacimiento: '1995' } },
    { id: 'c', nombre: 'C', equipo: 'X', califica: true, ficha: null }];
  const rN = M.filtrar(conNac, { nacimiento: { min: 2000 } });
  check('nacidos de 2000 en adelante: entra el de 2003, no el de 1995, y el sin dato cuenta como sinDato',
    rN.filas.map(f => f.id).join() === 'a' && rN.sinDato === 1, JSON.stringify(rN));
  /* Cercanía física */
  check('físico: misma talla y puesto = 1; 15 cm y dos puestos = 0; sin datos = null',
    M.cercaniaFisica({ talla: 200, posicion: '4' }, { talla: 202, posicion: '4' }) === 1
      && M.cercaniaFisica({ talla: 185, posicion: '1' }, { talla: 200, posicion: '3' }) === 0
      && M.cercaniaFisica({}, { talla: 190 }) === null);
  check('físico: un puesto al lado vale la mitad', M.cercaniaFisica({ posicion: '2' }, { posicion: '3' }) === 0.5);
  /* El modelo re-puntúa con la similitud inyectada. */
  const mod = { id: 'm', _adn: 'M', ficha: { talla: 200, posicion: '4' } };
  const candidatos = [
    { fila: { id: 'p', _adn: 'P', ficha: { talla: 201, posicion: '4' } }, conf: { rango: 2 } },
    { fila: { id: 'q', _adn: 'Q', ficha: null }, conf: { rango: 3 } },
    { fila: { id: 'r', _adn: 'R', ficha: null }, conf: { rango: 3 } },
    { fila: { id: 's', _adn: 'S', ficha: null }, conf: { rango: 3 } },
    { fila: mod, conf: { rango: 3 } }];
  const simFalsa = (a, b) => ({ P: { total: 0.8, funcion: 1, perfiles: 0.5, adn: 0.75, volumen: { ok: true } },
    Q: { total: 0.9, funcion: 1, perfiles: 1, adn: 0.5, volumen: { ok: true } },
    R: { total: 0.4, funcion: 0, perfiles: 1, adn: 0.5, volumen: { ok: true } },
    S: { total: 1, funcion: 1, perfiles: 1, adn: 1, volumen: { ok: false } } })[b];
  const cm = M.conModelo({ items: candidatos, puntua: false }, mod, simFalsa);
  check('modelo: el modelo no se propone a sí mismo, sin volumen comparable no entra y bajo el piso tampoco',
    cm.items.map(x => x.fila.id).join() === 'q,p' && cm.sinVolumen === 1 && cm.bajoPiso === 1, JSON.stringify(cm.items.map(x => [x.fila.id, x.coinc.pct])));
  check('modelo: con ficha de los dos, 85 % similitud + 15 % físico', Math.abs(cm.items[1].coinc.pct - (0.85 * 0.8 + 0.15 * 1)) < 1e-9
    && cm.items[1].coinc.partes.some(p => /Físico/.test(p.label)));
  const conCrit = M.conModelo({ items: [{ fila: candidatos[1].fila, conf: { rango: 1 }, coinc: { pct: 0.7, partes: [], faltan: ['Rol 0 %'] } }], puntua: true }, mod, simFalsa);
  check('modelo + criterios: el % es el promedio de los dos y conserva lo que no cumple',
    Math.abs(conCrit.items[0].coinc.pct - 0.8) < 1e-9 && conCrit.items[0].coinc.faltan.indexOf('Rol 0 %') !== -1 && conCrit.items[0].rotulo === 'modelo + criterios');

  /* El mapa de la Radiografía: su ruta la autoriza el padrón, no el club. */
  hashes['sgadd:pbp:liga-argentina-2026-27:lab-2026-27-norte'] = { [require('./js/sgadd-core.js').claveEquipo('ESTUDIANTES (C)')]: JSON.stringify({ esquema: 'x@3', equipo: 'ESTUDIANTES (C)' }) };
  const pedidoTiros = (tok, params, equipo) => Object.assign(pedido(tok, params), { query: { equipo: equipo } });
  res = await F.manejarTirosZona(pedidoTiros(tokOtro, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }, 'ESTUDIANTES (C)'));
  check('tiros: el que no está en el padrón de fichajes no los ve (403)', res.status === 403);
  res = await F.manejarTirosZona(pedidoTiros(tokScout, { torneo: 'zona-c-la-plata-2026', zona: 'zona-c-primera' }, 'ESTUDIANTES (C)'));
  check('tiros: de otro torneo, 403 OTRO_TORNEO', res.status === 403 && res.body.codigo === 'OTRO_TORNEO');
  res = await F.manejarTirosZona(pedidoTiros(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }, 'Estudiantes (C)'));
  check('tiros: el habilitado lee el paquete del equipo, de cualquier club', res.status === 200 && res.body.paquete.equipo === 'ESTUDIANTES (C)');
  res = await F.manejarTirosZona(pedidoTiros(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }, 'OTRO'));
  check('tiros: un equipo sin paquete, 404 SIN_DATOS', res.status === 404 && res.body.codigo === 'SIN_DATOS');
  res = await F.manejarTirosZona(pedidoTiros(tokScout, { torneo: 'liga-argentina-2026-27', zona: 'lab-2026-27-norte' }, ''));
  check('tiros: sin equipo, 400', res.status === 400);
  const appSrc = fs.readFileSync('./server/app.js', 'utf8');
  check('la ruta está montada', /fichajes\/:torneo\/:zona\/tiros', responder\(fichajes\.manejarTirosZona\)/.test(appSrc));

  /* LÍDERES DEL TORNEO (2026-10-09): la vista consolidada de la LAB. */
  const fxSrc = fs.readFileSync('./js/sgadd-fichajes.js', 'utf8');
  check('el buscador muestra los líderes de TODAS las zonas, solo con dos o más cargadas',
    /badgePeriodo\(\) \+ bloqueLideres\(todas\) \+ buscador/.test(fxSrc) && /if \(zonas\.length < 2\) return '';/.test(fxSrc));
  check('líderes de jugadores: solo los que califican, de las mismas filas del buscador; el PACE es de equipo',
    /todas\.filter\(f => f\.califica && typeof \(f\.m \|\| \{\}\)\[k\] === 'number'\)/.test(fxSrc) && /v\.idx\.leer\(e\.clave, 'PACE'\)/.test(fxSrc)
      && ['PPP', 'TS%', 'PTS'].every(k => fxSrc.indexOf("{ k: '" + k + "'") !== -1));

  console.log('\n' + (fail ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
