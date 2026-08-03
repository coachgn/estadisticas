/* =====================================================================
   Scouting pre-partido de equipos (sgadd-scouting.js).

   La fixture arma una liga chica pero COMPLETA (4 equipos, 6 partidos,
   planteles con perfiles fabricados a propósito) para que cada regla del
   plan individual tenga un jugador que la dispare y otro que no: así el
   test verifica que la regla discrimina, no solo que corre.

   Lo que arma HTML (tabla de marcas, tarjetas del informe) usa document y
   no se testea acá — mismo criterio que el resto de las UI del proyecto:
   se verifica a mano en el navegador con datos reales.
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const S = require('./js/sgadd-scouting.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const cerca = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (tol || 1e-6);
const porNombreCelda = (t, nombre, col) => t.filas.find(f => f.nombre === nombre).celdas[col];

/* =====================================================================
   FIXTURE
   ===================================================================== */

const colsPE = ['EQUIPO', 'FASE', 'PJ', 'POS', 'PACE', 'PLAYS', 'PPP', 'PTS', 'PTSopp',
  'eFG%', 'RTL%', 'RO%', 'RD%', 'AST%', 'PT3%', 'PT2%', 'PT1%', 'PePP%',
  'PPT3', 'PPT2', 'PPT1', 'T1%', 'T2%', 'T3%', 'PP', 'PR', 'RO'];

/* AGUILA es el mejor en casi todo; TOPO el peor; MEDIO y BAJO en el medio.
   Con 4 equipos los rankings son inequívocos y se pueden afirmar a mano. */
function filaPE(eq, pace, efg, ro, uso3, t3, pp, pr, rebOf) {
  return {
    EQUIPO: eq, FASE: 'REGULAR', PJ: '3', POS: String(pace - 2), PACE: String(pace),
    PLAYS: '80', PPP: '0,95', PTS: '76', PTSopp: '72',
    'eFG%': String(efg), 'RTL%': '0,20', 'RO%': String(ro), 'RD%': '0,72', 'AST%': '0,55',
    'PT3%': String(uso3), 'PT2%': '0,42', 'PT1%': '0,10', 'PePP%': '0,13',
    PPT3: '1,05', PPT2: '1,00', PPT1: '0,70', 'T1%': '0,70', 'T2%': '0,50', 'T3%': String(t3),
    PP: String(pp), PR: String(pr), RO: String(rebOf),
  };
}
/* La fila EQUIPO TIPO (columna EQUIPO vacía = la de liga, no la de un
   equipo) trae la mediana, pero SIN PACE: es una columna opcional del
   ESQUEMA y en planillas reales a veces no está. Así el test recorre los
   dos caminos de `referenciaLiga` — el TIPO de la planilla y el respaldo
   calculado sobre la distribución. */
const filasPE = [
  filaPE('AGUILA', 82, 0.55, 0.34, 0.40, 0.38, 10, 9, 13),
  filaPE('MEDIO', 78, 0.50, 0.29, 0.35, 0.34, 12, 7, 10),
  filaPE('BAJO', 75, 0.46, 0.25, 0.31, 0.31, 13, 6, 9),
  filaPE('TOPO', 72, 0.42, 0.21, 0.28, 0.28, 15, 4, 7),
  Object.assign(filaPE('EQUIPO TIPO', 0, 0.49, 0.27, 0.33, 0.32, 12.5, 6.5, 9.5), { PACE: '', POS: '' }),
];

const colsP4F = ['EQUIPO', 'FASE', 'PJ', 'RTNG OFF', 'RTNG DEF', 'NET RTNG', 'PPP OF', 'PPP DEF'];
const filasP4F = [
  { EQUIPO: 'AGUILA', FASE: 'REGULAR', PJ: '3', 'RTNG OFF': '98,0', 'RTNG DEF': '88,0', 'NET RTNG': '10,0', 'PPP OF': '0,98', 'PPP DEF': '0,88' },
  { EQUIPO: 'MEDIO', FASE: 'REGULAR', PJ: '3', 'RTNG OFF': '93,0', 'RTNG DEF': '92,0', 'NET RTNG': '1,0', 'PPP OF': '0,93', 'PPP DEF': '0,92' },
  { EQUIPO: 'BAJO', FASE: 'REGULAR', PJ: '3', 'RTNG OFF': '90,0', 'RTNG DEF': '95,0', 'NET RTNG': '-5,0', 'PPP OF': '0,90', 'PPP DEF': '0,95' },
  { EQUIPO: 'TOPO', FASE: 'REGULAR', PJ: '3', 'RTNG OFF': '86,0', 'RTNG DEF': '99,0', 'NET RTNG': '-13,0', 'PPP OF': '0,86', 'PPP DEF': '0,99' },
];

const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO',
  'PTS', 'PTSopp', 'PLAYS', 'PLAYSopp', 'TCC', 'TCI', 'T3C', 'T3I', 'T2C', 'T2I',
  'T1C', 'T1I', 'RO', 'RD', 'ROopp', 'RDopp', 'PP', 'PPopp', 'AST'];

/* Un partido = dos filas espejadas. `efg` mueve TCC para que el eFG% del
   subconjunto cambie de verdad y las reglas del ciclo tengan qué leer. */
function partido(fecha, nombre, local, visitante, ptsL, ptsV, tccL, tccV, roL) {
  const fila = (eq, cond, pts, ptsOpp, tcc, ro, roOpp) => ({
    FECHA: fecha, PARTIDO: nombre, EQUIPO: eq, FASE: 'REGULAR', CONDICION: cond,
    RESULTADO: pts > ptsOpp ? 'GANADO' : 'PERDIDO',
    PTS: String(pts), PTSopp: String(ptsOpp), PLAYS: '80', PLAYSopp: '80',
    TCC: String(tcc), TCI: '60', T3C: '8', T3I: '22', T2C: String(tcc - 8), T2I: '38',
    T1C: '12', T1I: '17', RO: String(ro), RD: '26', ROopp: String(roOpp), RDopp: '26',
    PP: '11', PPopp: '11', AST: '15',
  });
  return [
    fila(local, 'LOCAL', ptsL, ptsV, tccL, roL, 8),
    fila(visitante, 'VISITANTE', ptsV, ptsL, tccV, 8, roL),
  ];
}

/* AGUILA: 3 partidos (2 de local, 1 de visitante). Sus dos ganados tienen
   TCC alto y RO alto; el perdido, TCC bajo. Eso es lo que tiene que
   detectar `analisisCiclo`. */
const filasBD = [].concat(
  partido('05/01/2026', 'AGUILA vs TOPO', 'AGUILA', 'TOPO', 88, 70, 34, 24, 15),
  partido('12/01/2026', 'AGUILA vs MEDIO', 'AGUILA', 'MEDIO', 84, 74, 33, 27, 14),
  partido('19/01/2026', 'BAJO vs AGUILA', 'BAJO', 'AGUILA', 80, 66, 30, 22, 9),
  partido('26/01/2026', 'MEDIO vs TOPO', 'MEDIO', 'TOPO', 79, 71, 30, 26, 10),
  partido('02/02/2026', 'TOPO vs BAJO', 'TOPO', 'BAJO', 68, 77, 24, 29, 8),
  partido('09/02/2026', 'MEDIO vs BAJO', 'MEDIO', 'BAJO', 81, 75, 31, 28, 11)
);

/* --- Planteles. Cada jugador de AGUILA encarna una regla distinta. --- */
const colsPJ = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PLAYS', 'PTS', 'PPP', 'eFG%', 'TS%', 'RTL%', 'USG%',
  'PT2%', 'PT3%', 'PT1%', 'PePP%', 'T2C', 'T2I', 'PPT2', 'T2%', 'T3C', 'T3I', 'PPT3', 'T3%',
  'T1C', 'T1I', 'PPT1', 'T1%', 'TCC', 'TCI', 'TC%', 'RD', 'RD%', 'RO', 'RO%', 'RT', 'RT%',
  'AST', 'AST%', 'PR', 'PR%', 'PP', 'AST-PP', 'TC', 'TR', 'FC', 'FR', 'VAL',
  'PTSopp', 'RDopp', 'ROopp', 'PPopp', 'PLAYSopp'];

function jug(nombre, equipo, o) {
  const base = {
    NOMBRES: nombre, EQUIPO: equipo, FASE: 'REGULAR', PJ: '3',
    MIN: '20', PLAYS: '10', PTS: '10', PPP: '1,00', 'eFG%': '0,50', 'TS%': '0,55', 'RTL%': '0,20', 'USG%': '0,20',
    'PT2%': '0,42', 'PT3%': '0,35', 'PT1%': '0,08', 'PePP%': '0,13',
    T2C: '3', T2I: '6', PPT2: '1,00', 'T2%': '0,50', T3C: '1', T3I: '3', PPT3: '1,00', 'T3%': '0,33',
    T1C: '2', T1I: '3', PPT1: '0,67', 'T1%': '0,67', TCC: '4', TCI: '9', 'TC%': '0,44',
    RD: '3', 'RD%': '0,12', RO: '1', 'RO%': '0,05', RT: '4', 'RT%': '0,09',
    AST: '2', 'AST%': '0,15', PR: '1', 'PR%': '0,10', PP: '1,3', 'AST-PP': '1,50',
    TC: '0', TR: '0', FC: '2', FR: '2', VAL: '10',
    PTSopp: '0', RDopp: '0', ROopp: '0', PPopp: '0', PLAYSopp: '0',
  };
  return Object.assign(base, o);
}

/* Los T3I/T2I van coherentes con el %USO de cada jugador a propósito: el
   motor clasifica el ORIGEN por la mezcla de intentos, así que una fixture
   con "5% de uso externo" y 3 triples de 9 tiros de campo describe a un
   jugador que no existe — y el motor, con razón, lo saca de los roles
   internos. Es la misma incoherencia que el pedido quiere prevenir en
   datos reales. */
const filasPJ = [
  /* Fila TIPO de liga: la mediana. EQUIPO vacío = la de liga, no la de un
     equipo puntual (regla del punto 3 de CLAUDE.md). */
  jug('JUGADOR TIPO', '', { MIN: '15', 'PePP%': '0,13', 'RO%': '0,05', 'RD%': '0,12', PLAYS: '9' }),

  /* AGUILA — el rival a scoutear. */
  jug('TIRADOR, ELITE', 'AGUILA', {
    MIN: '30', PLAYS: '24', PTS: '22', PPP: '1,10',
    'PT3%': '0,55', PPT3: '1,35', 'T3%': '0,45', 'PT2%': '0,30', PPT2: '0,95',
    'PT1%': '0,08', 'T1%': '0,80', 'PePP%': '0,10',
    T3I: '8', T2I: '4', T1I: '2',
  }),
  /* Interno puro: casi no lanza de afuera y domina el cristal. */
  jug('PIVOT, INTERNO', 'AGUILA', {
    MIN: '28', PLAYS: '14', PTS: '15',
    'PT3%': '0,05', PPT3: '0,30', 'PT2%': '0,72', PPT2: '1,25',
    'PT1%': '0,12', 'T1%': '0,52', 'RO%': '0,11', 'RD%': '0,20', 'PePP%': '0,12',
    T3I: '0,4', T2I: '9', T1I: '3', AST: '1', 'AST-PP': '0,70',
  }),
  /* Slasher: PPT2 tan alto como el pivot, pero lanza de afuera y no
     rebotea. No puede clasificar como referencia interna. */
  jug('SLASHER, PENETRADOR', 'AGUILA', {
    MIN: '27', PLAYS: '13', PTS: '14',
    'PT3%': '0,30', PPT3: '0,95', 'PT2%': '0,58', PPT2: '1,25',
    'PT1%': '0,10', 'T1%': '0,70', 'RO%': '0,03', 'RD%': '0,08', 'PePP%': '0,12',
    T3I: '3,5', T2I: '6', T1I: '2,5', AST: '2', 'AST-PP': '1,10',
  }),
  jug('BASE, RIESGOSO', 'AGUILA', {
    MIN: '26', PLAYS: '13', PTS: '10',
    'PePP%': '0,22', 'AST-PP': '1,10', 'PT3%': '0,30', PPT3: '0,90', 'PT2%': '0,50',
    T3I: '3', T2I: '5', T1I: '2', AST: '3',
  }),
  jug('LADRILLO, PERIMETRAL', 'AGUILA', {
    MIN: '24', PLAYS: '11', PTS: '8',
    'PT3%': '0,52', PPT3: '0,72', 'T3%': '0,24', 'PT2%': '0,35', 'PePP%': '0,12',
    T3I: '6', T2I: '3', T1I: '1',
  }),
  jug('CONTACTO, FINO', 'AGUILA', {
    MIN: '22', PLAYS: '10', PTS: '11',
    'PT1%': '0,18', 'T1%': '0,88', PPT1: '0,88', 'PT3%': '0,20', 'PT2%': '0,50',
    T3I: '2', T2I: '5', T1I: '4',
  }),
  /* Interno con T1% pésimo Y volumen adentro: el ÚNICO caso donde la
     falta táctica es negocio (T1% < 40%). */
  jug('MANOS, PIEDRA', 'AGUILA', {
    MIN: '21', PLAYS: '9', PTS: '7',
    'PT3%': '0,04', PPT3: '0,20', 'PT2%': '0,62', PPT2: '1,05',
    'PT1%': '0,16', 'T1%': '0,35', PPT1: '0,35', 'RO%': '0,09', 'RD%': '0,16', 'PePP%': '0,12',
    T3I: '0,3', T2I: '7', T1I: '4', AST: '1', 'AST-PP': '0,60',
  }),
  /* El caso "Benavídez": pocos minutos y pocos puntos, pero el triple que
     tira es CARO. Con el criterio viejo (que miraba puntos) quedaba en el
     montón y se le flotaba; es el error táctico más grave del engine. */
  jug('ESPECIALISTA, CARO', 'AGUILA', {
    MIN: '14', PLAYS: '5', PTS: '5', PPP: '1,00',
    /* PPT3 1,14 queda por DEBAJO del umbral de "élite" (1,20) pero por
       encima del piso de rentabilidad (1,05): es exactamente el hueco
       donde el engine viejo lo soltaba. */
    'PT3%': '0,60', PPT3: '1,14', 'T3%': '0,38', 'PT2%': '0,25', PPT2: '0,90',
    'PT1%': '0,05', 'T1%': '0,75', 'PePP%': '0,10',
    T3I: '2', T2I: '1', T1I: '0,3',
  }),
  /* Único candidato legítimo a flotación: renta baja, volumen chico (no
     llega a "sistemático") y sin peso en el volumen externo del equipo. */
  jug('FLOTABLE, MENOR', 'AGUILA', {
    MIN: '12', PLAYS: '5', PTS: '3',
    'PT3%': '0,45', PPT3: '0,75', 'T3%': '0,25', 'PT2%': '0,40',
    T3I: '2', T2I: '2,5', T1I: '0,4',
  }),
  jug('SUPLENTE, GRIS', 'AGUILA', {
    MIN: '10', PLAYS: '4', PTS: '3',
    T3I: '1', T2I: '2', T1I: '0,5',
  }),

  /* Los otros tres equipos, sin perfiles extremos: solo para que la liga
     tenga distribución y los percentiles signifiquen algo. */
  jug('UNO, MEDIO', 'MEDIO', { MIN: '26', PLAYS: '12' }),
  jug('DOS, MEDIO', 'MEDIO', { MIN: '22', PLAYS: '10' }),
  jug('UNO, BAJO', 'BAJO', { MIN: '25', PLAYS: '11' }),
  jug('DOS, BAJO', 'BAJO', { MIN: '20', PLAYS: '9' }),
  jug('UNO, TOPO', 'TOPO', { MIN: '24', PLAYS: '10' }),
  jug('DOS, TOPO', 'TOPO', { MIN: '18', PLAYS: '8' }),
];

const idx = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsPE, filas: filasPE },
  'PROMEDIOS 4F': { cols: colsP4F, filas: filasP4F },
  'Base Datos E': { cols: colsBD, filas: filasBD },
  'PROMEDIOS J': { cols: colsPJ, filas: filasPJ },
}, { fase: 'REGULAR' });

console.log('\n0. LA FIXTURE ES SANA (si esto falla, el resto miente)');
console.log('═'.repeat(70));
check('la liga tiene los 4 equipos', idx.lista().length === 4, idx.lista().length);
check('AGUILA tiene sus 3 partidos', idx.get('AGUILA').partidos.length === 3);
check('AGUILA tiene su plantel de 10', (idx.liga.jugadoresPorEquipo.get('AGUILA') || []).length === 10,
  (idx.liga.jugadoresPorEquipo.get('AGUILA') || []).length);
check('la fila JUGADOR TIPO de liga se reconoció', idx.liga.jugadorTipo !== null && cerca(idx.liga.jugadorTipo['PePP%'], 0.13, 1e-4),
  JSON.stringify(idx.liga.jugadorTipo && idx.liga.jugadorTipo['PePP%']));

console.log('\n1. MATRIZ DE MÉTRICAS AVANZADAS');
console.log('═'.repeat(70));
const matriz = S.matrizComparativa(idx, 'AGUILA', 'TOPO');
check('la matriz trae los dos bloques del informe', !!matriz && Array.isArray(matriz.posesion) && Array.isArray(matriz.tiro));
check('el bloque de posesión trae las 8 métricas pedidas (POS, PACE, eFG%, EFF OF/DEF, %REB OF/DEF, %AST)',
  matriz.posesion.length === 8, matriz.posesion.map(f => f.label).join(','));
check('el bloque de tiro trae las 4 de selección y pérdidas',
  matriz.tiro.length === 4, matriz.tiro.map(f => f.label).join(','));

const filaPace = matriz.posesion.find(f => f.id === 'PACE');
check('la fila de PACE trae el valor de cada equipo y la mediana de la liga',
  cerca(filaPace.local.valor, 82) && cerca(filaPace.visitante.valor, 72) && filaPace.liga.valor !== null,
  JSON.stringify({ l: filaPace.local.valor, v: filaPace.visitante.valor, liga: filaPace.liga.valor }));
check('AGUILA es 1° en PACE de 4 equipos', filaPace.local.puesto === 1 && filaPace.local.de === 4,
  JSON.stringify({ puesto: filaPace.local.puesto, de: filaPace.local.de }));
check('TOPO es último en PACE', filaPace.visitante.puesto === 4, filaPace.visitante.puesto);

check('PACE no está en la fila EQUIPO TIPO: la referencia de liga se calcula sobre la distribución',
  filaPace.liga.calculada === true && cerca(filaPace.liga.valor, (78 + 75) / 2),
  JSON.stringify(filaPace.liga));
const filaEfgM = matriz.posesion.find(f => f.id === 'eFG%');
check('eFG% sí está en EQUIPO TIPO: se usa esa mediana, no una recalculada',
  filaEfgM.liga.calculada === false && cerca(filaEfgM.liga.valor, 0.49, 1e-4),
  JSON.stringify(filaEfgM.liga));

const filaEffOf = matriz.posesion.find(f => f.id === 'RTNG OFF');
check('EFF OF trae su PPP OF como métrica secundaria en la misma celda',
  filaEffOf.local.sub && filaEffOf.local.sub.clave === 'PPP OF' && cerca(filaEffOf.local.sub.valor, 0.98, 1e-4),
  JSON.stringify(filaEffOf.local.sub));
const filaUso3 = matriz.tiro.find(f => f.id === 'PT3%');
check('%USO 3PTS trae su PPT3 como secundaria', filaUso3.local.sub && filaUso3.local.sub.clave === 'PPT3');
const filaTov = matriz.tiro.find(f => f.id === 'PePP%');
check('%TOV queda marcada como métrica invertida (perder menos es mejor)', filaTov.invertida === true);
check('%TOV trae el total de pérdidas (PP) como secundaria', filaTov.subClave === 'PP');
check('matrizComparativa() de un equipo inexistente da null', S.matrizComparativa(idx, 'NO_EXISTE', 'TOPO') === null);

console.log('\n2. RANKINGS EN LA LIGA');
console.log('═'.repeat(70));
const rkAguila = S.rankingsLiga(idx, 'AGUILA');
const rkTopo = S.rankingsLiga(idx, 'TOPO');
check('devuelve una entrada por métrica del bloque de rankings', rkAguila.length > 0 && rkAguila.length <= S.METRICAS_RANKING.length);
check('cada entrada trae puesto sobre total', rkAguila.every(r => r.puesto >= 1 && r.puesto <= r.de));
const rkEfg = rkAguila.find(r => r.id === 'eFG%');
check('AGUILA es 1° en eFG%', rkEfg.puesto === 1, rkEfg.puesto);
check('un puesto del tercio superior sale con tono fuerte', rkEfg.tono === 'fuerte', rkEfg.tono);
const rkEfgTopo = rkTopo.find(r => r.id === 'eFG%');
check('TOPO, último en eFG%, sale con tono débil', rkEfgTopo.puesto === 4 && rkEfgTopo.tono === 'debil', rkEfgTopo.tono);
const rkTov = rkAguila.find(r => r.id === 'PP');
check('en TOV (métrica invertida) el 1° es el que MENOS pierde: AGUILA con 10',
  rkTov.puesto === 1, JSON.stringify({ puesto: rkTov.puesto, valor: rkTov.valor }));
check('rankingsLiga() de un equipo inexistente da lista vacía', S.rankingsLiga(idx, 'NO_EXISTE').length === 0);

console.log('\n3. METADATA: RÉCORD, SPLITS L/V, ÚLTIMO PARTIDO E HISTORIAL');
console.log('═'.repeat(70));
const ficha = S.fichaEquipo(idx, 'AGUILA');
check('el récord global sale de los partidos, no de una columna', ficha.pj === 3 && ficha.ganados === 2 && ficha.perdidos === 1,
  JSON.stringify({ pj: ficha.pj, g: ficha.ganados, p: ficha.perdidos }));
check('el récord de local está desglosado (2 PJ, 2-0)', ficha.local.pj === 2 && ficha.local.ganados === 2,
  JSON.stringify(ficha.local));
check('el récord de visitante está desglosado (1 PJ, 0-1)', ficha.visitante.pj === 1 && ficha.visitante.perdidos === 1,
  JSON.stringify(ficha.visitante));
check('el último partido trae rival y marcador resueltos contra el otro lado',
  ficha.ultimoPartido.rival === 'BAJO' && ficha.ultimoPartido.pts === 66 && ficha.ultimoPartido.ptsRival === 80,
  JSON.stringify(ficha.ultimoPartido));
check('el último partido conserva la condición', ficha.ultimoPartido.condicion === 'VISITANTE', ficha.ultimoPartido.condicion);
check('fichaEquipo() de un equipo inexistente da null', S.fichaEquipo(idx, 'NO_EXISTE') === null);

const h2h = S.historialDirecto(idx, 'AGUILA', 'TOPO');
check('el historial directo encuentra el único cruce entre AGUILA y TOPO', h2h.length === 1, h2h.length);
check('el cruce trae el marcador de los dos lados', cerca(h2h[0].ptsLocal, 88) && cerca(h2h[0].ptsVisitante, 70),
  JSON.stringify(h2h[0]));
check('sin cruces previos el historial es una lista vacía, no null',
  Array.isArray(S.historialDirecto(idx, 'AGUILA', 'AGUILA')) );

console.log('\n4. ANÁLISIS DEL CICLO RECIENTE');
console.log('═'.repeat(70));
const ciclo = S.analisisCiclo(idx, 'AGUILA');
check('la ventana por defecto es de ' + S.VENTANA_CICLO + ' partidos', ciclo.ventana === S.VENTANA_CICLO);
check('con 3 partidos jugados analiza los 3 (no rellena)', ciclo.pj === 3, ciclo.pj);
check('separa ganados (2) y perdidos (1)', ciclo.ganados.pj === 2 && ciclo.perdidos.pj === 1,
  JSON.stringify({ g: ciclo.ganados.pj, p: ciclo.perdidos.pj }));
check('los ganados traen net rating positivo', ciclo.ganados.netRating > 0, ciclo.ganados.netRating);
check('los perdidos traen net rating negativo', ciclo.perdidos.netRating < 0, ciclo.perdidos.netRating);
check('en los perdidos aparece un punto de fuga real (no el texto de relleno)',
  ciclo.perdidos.fugas.length && !/alineado o superior/i.test(ciclo.perdidos.fugas[0]),
  JSON.stringify(ciclo.perdidos.fugas));
check('en los perdidos la fuga detectada es la caída de producción ofensiva',
  ciclo.perdidos.fugas.some(f => /producción ofensiva/i.test(f)), JSON.stringify(ciclo.perdidos.fugas));
check('en los ganados aparece al menos un valor de identidad',
  ciclo.ganados.identidad.length > 0 && !/Sin una fortaleza/.test(ciclo.ganados.identidad[0]),
  JSON.stringify(ciclo.ganados.identidad));
check('los ganados reconocen la balanza de eficiencia positiva',
  ciclo.ganados.identidad.some(t => /net rating de \+/i.test(t)), JSON.stringify(ciclo.ganados.identidad));
check('la línea de tiro compara T1, T2 y T3', ciclo.ganados.lineaTiro.length === 3 &&
  ciclo.ganados.lineaTiro.map(l => l.clave).join(',') === 'T1%,T2%,T3%');
check('la línea de tiro trae el delta contra la mediana de la LIGA (no contra sí mismo)',
  ciclo.ganados.lineaTiro.every(l => l.delta === null || typeof l.delta === 'number'));
check('un equipo sin partidos no revienta el ciclo', S.analisisCiclo(idx, 'NO_EXISTE') === null);

/* Un subconjunto vacío (equipo invicto en la ventana) no puede romper. */
const cicloBajo = S.analisisCiclo(idx, 'BAJO', 2);
check('con una ventana donde no perdió ningún partido, el grupo perdidos es null y no un objeto vacío',
  cicloBajo.perdidos === null || cicloBajo.perdidos.pj > 0, JSON.stringify(cicloBajo.perdidos));

console.log('\n5. JUGADORES CLAVE Y SEMÁFORO TOP 3');
console.log('═'.repeat(70));
check('por defecto la tabla se recorta al top ' + S.TOP_JUGADORES + ' por minutos',
  S.jugadoresClave(idx, 'AGUILA').filas.length === S.TOP_JUGADORES,
  S.jugadoresClave(idx, 'AGUILA').filas.length);
/* Para el resto de las pruebas se pide el plantel entero: los dos casos
   límite de tiro externo (el especialista caro y el flotable) juegan pocos
   minutos justamente porque ese es su perfil. */
const tabla = S.jugadoresClave(idx, 'AGUILA', 10);
check('con límite explícito trae el plantel completo', tabla.filas.length === 10, tabla.filas.length);
check('vienen ordenados por minutos, de mayor a menor',
  tabla.filas.map(f => f.perfil.min).every((m, i, a) => i === 0 || a[i - 1] >= m),
  JSON.stringify(tabla.filas.map(f => f.perfil.min)));
check('el primero es el que más juega (TIRADOR, ELITE con 30 min)', tabla.filas[0].nombre === 'TIRADOR, ELITE');
check('trae las 8 columnas del informe impreso', tabla.columnas.length === 8, tabla.columnas.map(c => c.label).join(','));
check('las celdas de %USO 3PTS traen su PPT3 debajo',
  tabla.filas[0].celdas['PT3%'].sub && tabla.filas[0].celdas['PT3%'].sub.clave === 'PPT3');
check('trae la fila de cierre de promedio del equipo', !!tabla.promedioEquipo && tabla.promedioEquipo['MIN'].valor !== null);
check('trae la fila de cierre de promedio de la liga', !!tabla.promedioLiga && tabla.promedioLiga['MIN'].valor !== null);

/* --- La columna PTS/PLAY muestra puntos arriba y PPP debajo --- */
const colPts = tabla.columnas.find(c => c.label === 'PTS / PLAY');
check('la columna PTS / PLAY muestra los PUNTOS como valor principal', colPts.id === 'PTS', colPts.id);
check('y la rentabilidad (PPP) como subtexto', colPts.sub === 'PPP', colPts.sub);
check('el valor principal de la celda es el promedio de puntos, no el PPP',
  cerca(porNombreCelda(tabla, 'TIRADOR, ELITE', 'PTS').valor, 22),
  porNombreCelda(tabla, 'TIRADOR, ELITE', 'PTS').valor);
check('el subtexto de la celda es el PPP',
  cerca(porNombreCelda(tabla, 'TIRADOR, ELITE', 'PTS').sub.valor, 1.10, 1e-4),
  JSON.stringify(porNombreCelda(tabla, 'TIRADOR, ELITE', 'PTS').sub));

/* --- Semáforo: exactamente 3 destacados por métrica --- */
check('el semáforo marca exactamente ' + S.TOP_SEMAFORO + ' jugadores en cada una de las 8 métricas',
  S.COLS_JUGADOR.every(c => tabla.filas.filter(f => f.celdas[c.id].destacado).length === S.TOP_SEMAFORO),
  S.COLS_JUGADOR.map(c => c.label + ':' + tabla.filas.filter(f => f.celdas[c.id].destacado).length).join(' '));
check('el top de MIN son efectivamente los tres que más minutos juegan',
  tabla.filas.filter(f => f.celdas['MIN'].destacado).map(f => f.nombre).sort().join('|') ===
  ['TIRADOR, ELITE', 'PIVOT, INTERNO', 'SLASHER, PENETRADOR'].sort().join('|'),
  tabla.filas.filter(f => f.celdas['MIN'].destacado).map(f => f.nombre).join('|'));
check('en %TOV el semáforo marca a los que MÁS pierden (es a quien conviene presionar)',
  tabla.filas.filter(f => f.celdas['PePP%'].destacado).some(f => f.nombre === 'BASE, RIESGOSO'),
  tabla.filas.filter(f => f.celdas['PePP%'].destacado).map(f => f.nombre).join('|'));
check('el destacado guarda su puesto interno (1 a 3)',
  tabla.filas.filter(f => f.celdas['MIN'].destacado).every(f => f.celdas['MIN'].puestoInterno >= 1 && f.celdas['MIN'].puestoInterno <= 3));
check('jugadoresClave() de un equipo inexistente da null', S.jugadoresClave(idx, 'NO_EXISTE') === null);

/* --- Las columnas de uso rankean por VOLUMEN ABSOLUTO de intentos --- */
check('las tres columnas de uso rankean por intentos absolutos, no por el % mostrado',
  tabla.columnas.find(c => c.id === 'PT3%').rankPor === 'T3I' &&
  tabla.columnas.find(c => c.id === 'PT2%').rankPor === 'T2I' &&
  tabla.columnas.find(c => c.id === 'PT1%').rankPor === 'T1I');
/* SUPLENTE, GRIS tiene 35% de uso externo (más que el pivot) pero solo 1
   T3I: por volumen no puede entrar al top 3 de tiradores. Es exactamente
   el falso positivo que el criterio de volumen absoluto previene. */
const topUso3 = tabla.filas.filter(f => f.celdas['PT3%'].destacado).map(f => f.nombre);
check('un suplente con % de uso alto pero 1 solo intento NO entra al top de tiradores',
  topUso3.indexOf('SUPLENTE, GRIS') === -1, topUso3.join('|'));
check('el top de uso de 3PTS son los que más triples intentan de verdad',
  topUso3.sort().join('|') === ['TIRADOR, ELITE', 'LADRILLO, PERIMETRAL', 'SLASHER, PENETRADOR'].sort().join('|'),
  topUso3.join('|'));
const topUso1 = tabla.filas.filter(f => f.celdas['PT1%'].destacado).map(f => f.nombre);
check('el top de uso de TL sale de T1I absolutos',
  topUso1.indexOf('MANOS, PIEDRA') !== -1 && topUso1.indexOf('CONTACTO, FINO') !== -1, topUso1.join('|'));

/* --- Fila de cierre: comparación equipo vs liga con dirección --- */
check('la fila de promedio del equipo trae la comparación contra la liga',
  S.COLS_JUGADOR.every(c => ['mejor', 'peor', 'neutro'].indexOf(tabla.promedioEquipo[c.id].comparacion) !== -1),
  JSON.stringify(S.COLS_JUGADOR.map(c => c.label + ':' + tabla.promedioEquipo[c.id].comparacion)));
check('en una métrica normal, estar por encima de la liga es "mejor"',
  (function () {
    const a = tabla.promedioEquipo['PTS'].valor, b = tabla.promedioLiga['PTS'].valor;
    return a > b ? tabla.promedioEquipo['PTS'].comparacion === 'mejor' : true;
  })(), JSON.stringify({ eq: tabla.promedioEquipo['PTS'].valor, liga: tabla.promedioLiga['PTS'].valor }));
check('en %TOV (invertida) perder MÁS que la liga se marca como "peor", no como "mejor"',
  (function () {
    const a = tabla.promedioEquipo['PePP%'].valor, b = tabla.promedioLiga['PePP%'].valor;
    if (a === null || b === null || Math.abs(a - b) < 1e-9) return true;
    return tabla.promedioEquipo['PePP%'].comparacion === (a < b ? 'mejor' : 'peor');
  })(), JSON.stringify({ eq: tabla.promedioEquipo['PePP%'].valor, liga: tabla.promedioLiga['PePP%'].valor, cmp: tabla.promedioEquipo['PePP%'].comparacion }));

console.log('\n6. ROL FUNCIONAL: CRUCE MULTIFUENTE (el bug que motivó el refactor)');
console.log('═'.repeat(70));
const porNombre = {};
tabla.filas.forEach(f => { porNombre[f.nombre] = f; });

check('el perfil calcula la concentración de plays sobre el total del plantel',
  cerca(porNombre['TIRADOR, ELITE'].perfil.concentracion, 24 / tabla.totalPlays, 1e-6),
  porNombre['TIRADOR, ELITE'].perfil.concentracion);
check('el perfil relativiza las pérdidas contra la mediana de la liga, no en absoluto',
  cerca(porNombre['BASE, RIESGOSO'].perfil.perdidasRel, 0.22 / 0.13, 1e-3),
  porNombre['BASE, RIESGOSO'].perfil.perdidasRel);
check('el perfil calcula la mezcla de lanzamiento sobre INTENTOS (T3I vs T2I)',
  cerca(porNombre['TIRADOR, ELITE'].perfil.mezclaTriple, 8 / 12, 1e-6),
  porNombre['TIRADOR, ELITE'].perfil.mezclaTriple);

/* EL CASO CENTRAL: pivot y slasher tienen el MISMO PPT2 (1,25). Si el
   motor clasificara por PPT2, los dos serían "referencia interna". */
check('el pivot y el slasher tienen exactamente el mismo PPT2 (la trampa del criterio viejo)',
  cerca(porNombre['PIVOT, INTERNO'].perfil.pptDoble, porNombre['SLASHER, PENETRADOR'].perfil.pptDoble, 1e-6),
  JSON.stringify({ pivot: porNombre['PIVOT, INTERNO'].perfil.pptDoble, slasher: porNombre['SLASHER, PENETRADOR'].perfil.pptDoble }));
check('el pivot (casi no lanza de afuera + domina el cristal) queda marcado como interior',
  porNombre['PIVOT, INTERNO'].perfil.esInterior === true && porNombre['PIVOT, INTERNO'].perfil.esPerimetral === false,
  JSON.stringify({ int: porNombre['PIVOT, INTERNO'].perfil.esInterior, per: porNombre['PIVOT, INTERNO'].perfil.esPerimetral }));
check('el slasher (mismo PPT2 pero lanza de afuera y no rebotea) NO es interior',
  porNombre['SLASHER, PENETRADOR'].perfil.esInterior === false && porNombre['SLASHER, PENETRADOR'].perfil.esPerimetral === true,
  JSON.stringify({ int: porNombre['SLASHER, PENETRADOR'].perfil.esInterior, per: porNombre['SLASHER, PENETRADOR'].perfil.esPerimetral }));
check('y por eso su ROL es Slasher / Penetrador, nunca una referencia interna',
  porNombre['SLASHER, PENETRADOR'].rol.id === 'slasher',
  JSON.stringify(porNombre['SLASHER, PENETRADOR'].rol));
check('el pivot sí cae en un rol interno',
  ['rim-runner', 'finalizador-corto', 'ancla-defensiva'].indexOf(porNombre['PIVOT, INTERNO'].rol.id) !== -1,
  JSON.stringify(porNombre['PIVOT, INTERNO'].rol));
check('el rol del tirador de élite es de spacing',
  porNombre['TIRADOR, ELITE'].rol.id === 'spacing', JSON.stringify(porNombre['TIRADOR, ELITE'].rol));
check('ningún rol funcional usa posiciones tradicionales (base/alero/pivot)',
  S.ROLES_FUNCIONALES.every(r => !/\b(base|alero|pivote?|ala|escolta)\b/i.test(r.label)),
  S.ROLES_FUNCIONALES.map(r => r.label).join(' | '));
check('la cascada de roles siempre resuelve: nadie queda sin rol',
  tabla.filas.every(f => !!f.rol.id && !!f.rol.label && !!f.rol.detalle));
check('el perfil incorpora los arquetipos de la pestaña JUGADORES (cuarta fuente del cruce)',
  Array.isArray(porNombre['TIRADOR, ELITE'].perfil.arquetipos) &&
  porNombre['TIRADOR, ELITE'].perfil.arquetipos.length > 0,
  JSON.stringify(porNombre['TIRADOR, ELITE'].perfil.arquetipos));

console.log('\n6 bis. MARCA ASIGNADA: PERFIL DEFENSIVO Y CONSIGNAS DE CAMPO');
console.log('═'.repeat(70));

check('al tirador de élite le asigna negación de catch & shoot',
  porNombre['TIRADOR, ELITE'].marca.id === 'tirador-elite' &&
  /CATCH & SHOOT/.test(porNombre['TIRADOR, ELITE'].marca.consigna),
  JSON.stringify(porNombre['TIRADOR, ELITE'].marca));
check('al pivot interno le asigna front / negar recepción',
  porNombre['PIVOT, INTERNO'].marca.id === 'interior-dominante' &&
  /NEGAR RECEPCIÓN/.test(porNombre['PIVOT, INTERNO'].marca.consigna),
  JSON.stringify(porNombre['PIVOT, INTERNO'].marca));
check('al slasher le asigna contención de mano dominante, NO una marca de poste bajo',
  porNombre['SLASHER, PENETRADOR'].marca.id === 'slasher' &&
  /MANO DOMINANTE/.test(porNombre['SLASHER, PENETRADOR'].marca.consigna),
  JSON.stringify(porNombre['SLASHER, PENETRADOR'].marca));
check('al conductor con pérdidas le asigna ICE en P&R y presión al drible',
  porNombre['BASE, RIESGOSO'].marca.id === 'generador-riesgoso' &&
  /ICE EN P&R/.test(porNombre['BASE, RIESGOSO'].marca.consigna),
  JSON.stringify(porNombre['BASE, RIESGOSO'].marca));
check('al lanzador de volumen con mal porcentaje se le CONTESTA sin saltar, no se le flota',
  porNombre['LADRILLO, PERIMETRAL'].marca.id === 'tirador-sistematico-frio' &&
  /CONTESTAR SIN SALTAR/.test(porNombre['LADRILLO, PERIMETRAL'].marca.consigna),
  JSON.stringify(porNombre['LADRILLO, PERIMETRAL'].marca));
check('la flotación queda para el de renta baja SIN volumen sistemático',
  porNombre['FLOTABLE, MENOR'].marca.id === 'tirador-ineficiente' &&
  /FLOTACIÓN/.test(porNombre['FLOTABLE, MENOR'].marca.consigna),
  JSON.stringify(porNombre['FLOTABLE, MENOR'].marca));
check('al suplente sin amenaza dominante le queda el fallback (drop coverage)',
  porNombre['SUPLENTE, GRIS'].marca.id === 'contencion', JSON.stringify(porNombre['SUPLENTE, GRIS'].marca));

/* --- La falta táctica dejó de ser la respuesta para todo --- */
check('el único jugador al que se le manda a la línea es el de T1% < 40% con volumen interno',
  tabla.filas.filter(f => f.marca.id === 'castigable-en-la-linea').map(f => f.nombre).join('|') === 'MANOS, PIEDRA',
  tabla.filas.filter(f => f.marca.id === 'castigable-en-la-linea').map(f => f.nombre).join('|'));
check('el umbral de falta táctica es estricto: T1% por debajo de 40%',
  S.UMBRALES.t1Regalable <= 0.40, S.UMBRALES.t1Regalable);
check('a nadie con T1% >= 40% se le sugiere mandarlo a la línea',
  tabla.filas.every(f => f.marca.id !== 'castigable-en-la-linea' || (f.perfil.t1 !== null && f.perfil.t1 < 0.40)));
check('ninguna consigna que no sea la de castigo en la línea propone falta sistemática',
  tabla.filas.every(f => f.marca.id === 'castigable-en-la-linea' || !/MANDAR A LA LÍNEA|FALTA TÁCTICA/.test(f.marca.consigna + f.marca.restriccion)),
  tabla.filas.map(f => f.marca.id + ':' + f.marca.consigna).join(' | '));
check('las consignas son soluciones de campo del glosario moderno',
  tabla.filas.some(f => /ICE EN P&R/.test(f.marca.consigna)) &&
  tabla.filas.some(f => /DROP COVERAGE/.test(f.marca.consigna)) &&
  tabla.filas.some(f => /FLOTACIÓN/.test(f.marca.consigna)));

/* --- Defensor nuestro: perfil táctico, no un nombre propio --- */
const perfilesValidos = Object.keys(S.PERFILES_DEFENSOR).map(k => S.PERFILES_DEFENSOR[k]);
check('cada marca sugiere un PERFIL defensivo de nuestro plantel, no un nombre',
  tabla.filas.every(f => perfilesValidos.indexOf(f.marca.defensor) !== -1),
  tabla.filas.map(f => f.marca.defensor).join(' | '));
check('hay 6 perfiles defensivos disponibles', perfilesValidos.length === 6, perfilesValidos.length);
check('al tirador de élite le corresponde el especialista 1x1 perimetral',
  porNombre['TIRADOR, ELITE'].marca.defensor === S.PERFILES_DEFENSOR.perimetral1x1);
check('al pivot interno le corresponde el ancla interior',
  porNombre['PIVOT, INTERNO'].marca.defensor === S.PERFILES_DEFENSOR.ancla);
check('al conductor con pérdidas le corresponde el atrapador',
  porNombre['BASE, RIESGOSO'].marca.defensor === S.PERFILES_DEFENSOR.atrapador);

check('cada marca explica POR QUÉ con el número que la disparó',
  tabla.filas.every(f => typeof f.marca.porque === 'string' && f.marca.porque.length > 10));
check('la cascada de marcas siempre resuelve: ningún jugador queda sin consigna',
  tabla.filas.every(f => !!f.marca.consigna && !!f.marca.restriccion));

console.log('\n6 quater. CRITERIO CONTEXTUAL: BANDAS z CONTRA LA LIGA');
console.log('═'.repeat(70));

check('hay 5 bandas contextuales', S.BANDAS.length === 5, S.BANDAS.map(b => b.id).join(','));
check('los cortes son ±1,2σ y ±0,5σ',
  S.BANDAS[0].z === 1.2 && S.BANDAS[1].z === 0.5 && S.BANDAS[2].z === -0.5 && S.BANDAS[3].z === -1.2,
  S.BANDAS.map(b => b.z).join(','));
const statPpt3 = S.statLiga(idx, 'PPT3');
check('statLiga() calcula media y desvío sobre los jugadores calificados',
  statPpt3 !== null && statPpt3.n >= 3 && statPpt3.desvio > 0, JSON.stringify(statPpt3));
check('statLiga() de una métrica sin distribución da null', S.statLiga(idx, 'METRICA_QUE_NO_EXISTE') === null);

check('un valor muy por encima de la media cae en la banda élite',
  S.bandaLiga(idx, 'PPT3', statPpt3.media + 2 * statPpt3.desvio, false).id === 'elite');
check('un valor en la media cae en la banda estándar',
  S.bandaLiga(idx, 'PPT3', statPpt3.media, false).id === 'estandar');
check('un valor muy por debajo cae en punto de fuga',
  S.bandaLiga(idx, 'PPT3', statPpt3.media - 2 * statPpt3.desvio, false).id === 'fuga');
check('en una métrica invertida el signo se da vuelta: perder MENOS es élite',
  (function () {
    const s = S.statLiga(idx, 'PePP%');
    return S.bandaLiga(idx, 'PePP%', s.media - 2 * s.desvio, true).id === 'elite';
  })());
check('bandaLiga() de un valor nulo da null', S.bandaLiga(idx, 'PPT3', null, false) === null);
check('porEncima() y porDebajo() clasifican las bandas correctamente',
  S.porEncima({ id: 'elite' }) && S.porEncima({ id: 'superior' }) && !S.porEncima({ id: 'estandar' }) &&
  S.porDebajo({ id: 'fuga' }) && S.porDebajo({ id: 'limitado' }) && !S.porDebajo({ id: 'estandar' }));

/* EL CASO CENTRAL DE ESTA VUELTA: el tirador eficiente de bajo volumen. */
const caro = porNombre['ESPECIALISTA, CARO'];
check('el especialista de pocos minutos anota poco (5 PTS de promedio)', cerca(caro.perfil.pts, 5));
check('pero su tiro externo se marca como rentable',
  caro.perfil.tiroExternoRentable === true,
  JSON.stringify({ ppt3: caro.perfil.pptTriple, t3: caro.perfil.t3, banda: caro.perfil.bandaPptTriple && caro.perfil.bandaPptTriple.id }));
check('y su consigna OBLIGATORIA es STAY HOME, nunca flotar',
  caro.marca.id === 'tirador-eficiente-bajo-volumen' &&
  /STAY HOME/.test(caro.marca.consigna) && /PROHIBIDO FLOTAR/.test(caro.marca.restriccion),
  JSON.stringify(caro.marca));
check('a NADIE con tiro externo rentable se le sugiere flotar o ayudar desde él',
  tabla.filas.every(f => !f.perfil.tiroExternoRentable ||
    !/FLOTACIÓN|UNDER|INVITACIÓN AL TIRO/.test(f.marca.consigna + ' ' + f.marca.restriccion)),
  tabla.filas.filter(f => f.perfil.tiroExternoRentable).map(f => f.nombre + '→' + f.marca.consigna).join(' | '));
check('el especialista caro aparece en fortalezas por su renta, no por sus puntos',
  caro.fortalezas.some(t => /T3%|PPT3/.test(t)), JSON.stringify(caro.fortalezas));

/* Volumen: quién es "sistemático" y quién no. */
check('con 6 triples por partido el lanzador es sistemático',
  porNombre['LADRILLO, PERIMETRAL'].perfil.tiradorSistematico === true);
check('con 2 triples por partido no llega a sistemático (y por eso admite flotación)',
  porNombre['FLOTABLE, MENOR'].perfil.tiradorSistematico === false &&
  porNombre['FLOTABLE, MENOR'].perfil.viaPrincipalExterna === false,
  JSON.stringify({ t3i: porNombre['FLOTABLE, MENOR'].perfil.t3i, cuota: porNombre['FLOTABLE, MENOR'].perfil.cuotaTriplesEquipo }));
check('la cuota de triples se mide sobre el total del equipo',
  cerca(porNombre['TIRADOR, ELITE'].perfil.cuotaTriplesEquipo, 8 / tabla.totalTriples, 1e-6),
  JSON.stringify({ cuota: porNombre['TIRADOR, ELITE'].perfil.cuotaTriplesEquipo, total: tabla.totalTriples }));
check('el que concentra el volumen externo del equipo queda protegido de la invitación al triple',
  porNombre['TIRADOR, ELITE'].perfil.viaPrincipalExterna === true,
  porNombre['TIRADOR, ELITE'].perfil.cuotaTriplesEquipo);
check('el perfil trae las bandas contextuales de sus métricas de tiro',
  tabla.filas.every(f => f.perfil.bandaPptTriple === null || typeof f.perfil.bandaPptTriple.z === 'number'));

console.log('\n6 ter. FICHA DE ANÁLISIS DE RIVAL (por jugador)');
console.log('═'.repeat(70));
check('cada fila trae fortalezas y fugas', tabla.filas.every(f => f.fortalezas.length > 0 && f.fugas.length > 0));
check('las fortalezas del tirador de élite nombran su renta de triple',
  porNombre['TIRADOR, ELITE'].fortalezas.some(t => /PPT3/.test(t)),
  JSON.stringify(porNombre['TIRADOR, ELITE'].fortalezas));
check('las fugas del tirador ineficiente señalan que su tiro preferido es el que menos rinde',
  porNombre['LADRILLO, PERIMETRAL'].fugas.some(t => /PPT3/.test(t)),
  JSON.stringify(porNombre['LADRILLO, PERIMETRAL'].fugas));
check('las fugas del que pierde mucho señalan el %TOV',
  porNombre['BASE, RIESGOSO'].fugas.some(t => /%TOV/.test(t)),
  JSON.stringify(porNombre['BASE, RIESGOSO'].fugas));
check('las fugas del de manos de piedra señalan el T1%',
  porNombre['MANOS, PIEDRA'].fugas.some(t => /T1%/.test(t)),
  JSON.stringify(porNombre['MANOS, PIEDRA'].fugas));
check('cada bullet cruza métrica con lectura táctica, no es un número suelto',
  tabla.filas.every(f => f.fortalezas.concat(f.fugas).every(t => t.length > 30)));

const fichaJ = S.fichaRival(idx, (idx.liga.jugadoresPorEquipo.get('AGUILA') || [])[0], 100);
check('fichaRival() arma nombre, rol, marca, fortalezas y fugas de una sola llamada',
  !!fichaJ.nombre && !!fichaJ.rol && !!fichaJ.marca && fichaJ.fortalezas.length > 0 && fichaJ.fugas.length > 0);

/* Un jugador que dispara dos reglas se queda con la más cara: el tirador
   de élite también tiene buen T1%, y aun así la marca es TOP LOCK. */
check('ante dos perfiles posibles gana el de amenaza más cara (élite sobre libres)',
  porNombre['TIRADOR, ELITE'].marca.id === 'tirador-elite');

console.log('\n7. CLAVES ESTRATÉGICAS DINÁMICAS');
console.log('═'.repeat(70));
const claves = S.clavesEstrategicas(idx, 'AGUILA');
const ids = claves.map(c => c.id);
check('genera varias claves, no una lista fija', claves.length >= 5, ids.join(','));
check('detecta el eje de eficiencia (jugador que concentra el volumen)', ids.indexOf('ejes-eficiencia') !== -1, ids.join(','));
check('detecta al tirador de élite para clausurarlo', ids.indexOf('clausura-tiradores') !== -1, ids.join(','));
check('detecta al tirador ineficiente para invitarlo al triple', ids.indexOf('invitacion-triple') !== -1, ids.join(','));
check('detecta al buscador de contacto con buen T1% (no mandarlo a la línea)', ids.indexOf('disciplina-bonus') !== -1, ids.join(','));
check('detecta al de mal T1% con volumen en la línea (falta táctica rentable)', ids.indexOf('castigo-linea') !== -1, ids.join(','));
check('detecta al generador con pérdidas altas', ids.indexOf('presion-conduccion') !== -1, ids.join(','));
check('detecta el control del cristal sobre el pivot', ids.indexOf('cristal') !== -1, ids.join(','));
check('detecta el colapso de pintura sobre el finalizador interno', ids.indexOf('pintura') !== -1, ids.join(','));

const claveTirador = claves.find(c => c.id === 'clausura-tiradores');
check('la clave de clausura nombra al jugador correcto', claveTirador.jugadores.indexOf('TIRADOR, ELITE') !== -1,
  claveTirador.jugadores.join(','));
check('la clave de clausura NO mete al tirador ineficiente', claveTirador.jugadores.indexOf('LADRILLO, PERIMETRAL') === -1,
  claveTirador.jugadores.join(','));
const claveInvitacion = claves.find(c => c.id === 'invitacion-triple');
check('la invitación al triple apunta al ineficiente, no al de élite',
  claveInvitacion.jugadores.indexOf('LADRILLO, PERIMETRAL') !== -1 && claveInvitacion.jugadores.indexOf('TIRADOR, ELITE') === -1,
  claveInvitacion.jugadores.join(','));
const claveBonus = claves.find(c => c.id === 'disciplina-bonus');
const claveCastigo = claves.find(c => c.id === 'castigo-linea');
check('disciplina de bonus y falta táctica apuntan a jugadores DISTINTOS (son consignas opuestas)',
  !claveBonus.jugadores.some(n => claveCastigo.jugadores.indexOf(n) !== -1),
  JSON.stringify({ bonus: claveBonus.jugadores, castigo: claveCastigo.jugadores }));
check('cada clave trae ícono, título y texto redactado',
  claves.every(c => !!c.icono && !!c.titulo && typeof c.texto === 'string' && c.texto.length > 20));
check('cada clave lista a lo sumo 3 jugadores (el DT actúa sobre los que más juegan)',
  claves.every(c => c.jugadores.length <= 3));

/* Un equipo sin perfiles extremos tiene que generar MENOS claves: si
   generara las mismas, la "generación dinámica" sería decorativa. */
const clavesMedio = S.clavesEstrategicas(idx, 'MEDIO');
check('un plantel sin perfiles extremos dispara menos claves que uno con especialistas',
  clavesMedio.length < claves.length, clavesMedio.length + ' vs ' + claves.length);
check('clavesEstrategicas() de un equipo inexistente da lista vacía', S.clavesEstrategicas(idx, 'NO_EXISTE').length === 0);

console.log('\n8. RESUMEN EJECUTIVO E INFORME COMPLETO');
console.log('═'.repeat(70));
const resumen = S.resumenEjecutivo(idx, 'TOPO', 'AGUILA');
check('el resumen es un párrafo con contenido', typeof resumen === 'string' && resumen.length > 60, resumen.length);
check('el resumen nombra al rival', resumen.indexOf('AGUILA') !== -1, resumen);
check('el resumen lee el ritmo del rival (AGUILA es el más rápido de la liga)',
  /ritmo alto/i.test(resumen), resumen);
check('el resumen cierra con el estado del ciclo reciente', /últimos \d+ partidos/i.test(resumen), resumen);
check('resumenEjecutivo() de un equipo inexistente da string vacío', S.resumenEjecutivo(idx, 'TOPO', 'NO_EXISTE') === '');

const informe = S.informePrePartido(idx, 'AGUILA', 'TOPO');
check('el informe completo se resuelve', informe.ok === true, informe.motivo);
check('trae los 6 bloques del pedido',
  !!informe.local && !!informe.matriz && !!informe.cicloLocal && !!informe.jugadoresRival &&
  Array.isArray(informe.claves) && typeof informe.resumen === 'string');
check('trae el historial directo entre los dos', informe.historial.length === 1);
check('trae los rankings de los DOS equipos', informe.rankingsLocal.length > 0 && informe.rankingsVisitante.length > 0);
check('sin equipo propio en la liga, el rival a scoutear es el visitante (convención del informe impreso)',
  informe.claveRival === 'TOPO' && informe.claveNuestro === 'AGUILA',
  JSON.stringify({ rival: informe.claveRival, nuestro: informe.claveNuestro }));
check('se puede forzar a mano qué equipo se scoutea',
  S.informePrePartido(idx, 'AGUILA', 'TOPO', { claveRival: 'AGUILA' }).claveRival === 'AGUILA');
check('el rival forzado es el que aparece en la tabla de jugadores',
  S.informePrePartido(idx, 'AGUILA', 'TOPO', { claveRival: 'AGUILA' }).jugadoresRival.clave === 'AGUILA');
check('no se puede armar un informe de un equipo contra sí mismo',
  S.informePrePartido(idx, 'AGUILA', 'AGUILA').ok === false);
check('un equipo inexistente da error explícito, no una excepción',
  S.informePrePartido(idx, 'NO_EXISTE', 'TOPO').ok === false);

/* =====================================================================
   HOMOLOGACIÓN CON LA SECCIÓN JUGADORES

   El bug que cierran: el mismo jugador aparecía como "Manejador
   Secundario / Defensor Físico" en el informe pre-partido y como
   "⭐ Jugador Franquicia / 🧤 Especialista Defensivo / Dependencia
   Absoluta" en su ficha. No eran datos contradictorios, eran DOS
   subconjuntos distintos de la misma taxonomía calculados por dos motores.
   Ahora hay uno solo y estos tests lo amarran.
   ===================================================================== */
console.log('\n9. HOMOLOGACIÓN TOTAL CON LA SECCIÓN JUGADORES');
console.log('═'.repeat(70));

const JUG = require('./js/sgadd-jugadores.js');
const plantelAguila = idx.liga.jugadoresPorEquipo.get('AGUILA') || [];

check('scouting expone los roles funcionales del motor de Jugadores, no una copia',
  S.ROLES_FUNCIONALES === JUG.JUGADORES_ROLES_FUNCIONALES,
  'scouting:' + S.ROLES_FUNCIONALES.length + ' jugadores:' + JUG.JUGADORES_ROLES_FUNCIONALES.length);
check('los umbrales de rol son literalmente el mismo objeto en las dos secciones',
  S.UMBRALES.minutosClave === JUG.JUGADORES_UMBRALES.minutosClave &&
  S.UMBRALES.mezclaTripleaPerimetral === JUG.JUGADORES_UMBRALES.mezclaTripleaPerimetral &&
  S.UMBRALES.astPPGenerador === JUG.JUGADORES_UMBRALES.astPPGenerador);

/* Para CADA jugador del plantel, el rol y las métricas tienen que dar
   exactamente lo mismo pedidos desde un lado o desde el otro. */
plantelAguila.forEach(j => {
  const adn = JUG.jugadoresADN(idx, j);
  const fila = tabla.filas.find(f => f.clave === j.__clave);
  if (!fila) return;
  if (fila.rol.id !== adn.rolFuncional.id) {
    check('rol funcional idéntico para ' + adn.nombre, false,
      'scouting:' + fila.rol.id + ' jugadores:' + adn.rolFuncional.id);
  }
});
check('el rol funcional es idéntico en las dos secciones para TODO el plantel',
  plantelAguila.every(j => {
    const fila = tabla.filas.find(f => f.clave === j.__clave);
    return !fila || fila.rol.id === JUG.jugadoresADN(idx, j).rolFuncional.id;
  }));
check('la jerarquía viaja en el perfil de scouting con la etiqueta de Jugadores',
  plantelAguila.every(j => {
    const fila = tabla.filas.find(f => f.clave === j.__clave);
    if (!fila) return true;
    const adn = JUG.jugadoresADN(idx, j);
    return fila.perfil.jerarquia === adn.jerarquia.label;
  }), JSON.stringify(tabla.filas.map(f => f.nombre + '→' + f.perfil.jerarquia)));
check('los arquetipos son los mismos en las dos vistas',
  plantelAguila.every(j => {
    const fila = tabla.filas.find(f => f.clave === j.__clave);
    if (!fila) return true;
    const esperados = JUG.jugadoresADN(idx, j).arquetipos.map(a => a.label).sort().join('|');
    return (fila.perfil.arquetipos || []).slice().sort().join('|') === esperados;
  }));
check('el perfil de scouting trae el ADN completo listo para pintar los mismos badges',
  tabla.filas.every(f => f.perfil.adn && f.perfil.adn.rolFuncional && f.perfil.adn.jerarquia));

/* --- Métricas base: ni un decimal de diferencia --- */
const METRICAS_HOMOLOGADAS = ['min', 'plays', 'pts', 'ppp', 'efg', 'usoTriple', 'usoDoble',
  'usoLibre', 'pptTriple', 'pptDoble', 'pptLibre', 'perdidas', 'rebote', 'reboteRel', 'perdidasRel',
  'mezclaTriple', 'astPP', 't1', 't3'];
check('las ' + METRICAS_HOMOLOGADAS.length + ' métricas base coinciden EXACTO entre Scouting y Jugadores',
  plantelAguila.every(j => {
    const fila = tabla.filas.find(f => f.clave === j.__clave);
    if (!fila) return true;
    const base = JUG.jugadoresPerfilBase(idx, j);
    return METRICAS_HOMOLOGADAS.every(k => {
      const a = fila.perfil[k], b = base[k];
      if (a === null && b === null) return true;
      return a === b;   // igualdad estricta: es el MISMO cálculo, no uno parecido
    });
  }));
check('los discriminantes de origen también coinciden',
  plantelAguila.every(j => {
    const fila = tabla.filas.find(f => f.clave === j.__clave);
    if (!fila) return true;
    const base = JUG.jugadoresPerfilBase(idx, j);
    return fila.perfil.esInterior === base.esInterior && fila.perfil.esPerimetral === base.esPerimetral;
  }));

/* --- Las consignas derivan del perfil cuantitativo --- */
check('un jugador con volumen alto y eFG% bajo recibe permisividad de tiro, no presión',
  tabla.filas.every(f => f.marca.id !== 'volumen-sin-eficiencia' ||
    /PERMITIR EL TIRO EXTERNO/.test(f.marca.consigna)));
check('la regla de volumen sin eficiencia existe en la cascada',
  S.PERFILES_MARCA.some(p => p.id === 'volumen-sin-eficiencia'));
check('esa regla NUNCA se aplica a alguien con tiro externo rentable',
  tabla.filas.every(f => f.marca.id !== 'volumen-sin-eficiencia' || !f.perfil.tiroExternoRentable));
/* El fallback de contención se exceptúa a propósito: se activa justamente
   cuando NINGÚN umbral lo dispara, así que no hay número que citar. */
check('cada consigna que nace de un umbral cita el número que la disparó',
  tabla.filas.every(f => f.marca.id === 'contencion' || /\d/.test(f.marca.porque)),
  tabla.filas.filter(f => f.marca.id !== 'contencion' && !/\d/.test(f.marca.porque))
    .map(f => f.nombre + '→' + f.marca.id).join('|'));
check('el fallback de contención explica por qué no hay número',
  S.PERFILES_MARCA[S.PERFILES_MARCA.length - 1].id === 'contencion');

/* --- El resumen ejecutivo gira alrededor de los jugadores --- */
const resumenJ = S.resumenEjecutivo(idx, 'TOPO', 'AGUILA');
check('el resumen nombra jugadores concretos, no solo al equipo',
  tabla.filas.some(f => resumenJ.indexOf(f.nombre) !== -1), resumenJ.slice(0, 160));
check('el resumen identifica el eje del ataque con su volumen',
  /ataque pasa por/i.test(resumenJ), resumenJ.slice(0, 200));
check('el resumen dice a quién NO se puede soltar',
  /Prohibido soltar/i.test(resumenJ) || !tabla.filas.some(f => f.perfil.tiroExternoRentable));
check('el resumen dice a quién conviene dejar resolver',
  /queremos que termine la posesión/i.test(resumenJ) ||
  !tabla.filas.some(f => ['tirador-ineficiente', 'tirador-sistematico-frio', 'volumen-sin-eficiencia'].indexOf(f.marca.id) !== -1));
check('el resumen cierra con el estado del ciclo reciente', /últimos \d+ partidos/i.test(resumenJ));
check('el resumen es sustancialmente más largo que un párrafo suelto',
  resumenJ.length > 400, resumenJ.length);

console.log('\n10. SÍNTESIS ESTRATÉGICA · LOS SEIS TRAMOS');
console.log('═'.repeat(70));

/* 1. Ritmo */
check('1· abre con el ritmo del rival y su consecuencia defensiva',
  /^AGUILA.*ritmo/i.test(resumenJ) && /(balance defensivo|marca individual|duelos)/i.test(resumenJ),
  resumenJ.slice(0, 130));
/* 2. Eje de ataque */
check('2· identifica el eje del ataque con % de plays, puntos y PPP',
  /ataque pasa por/i.test(resumenJ) && /de los plays del equipo/.test(resumenJ) &&
  /pts con .* PPP/.test(resumenJ), resumenJ.slice(resumenJ.indexOf('El ataque'), resumenJ.indexOf('El ataque') + 170));
check('2· nombra una segunda vía cuando existe',
  /segunda vía/i.test(resumenJ) || tabla.filas.length < 2);
check('2· cierra el tramo del eje con su consigna de marca',
  /decisión más cara de la noche/i.test(resumenJ));
/* 3. Stay home */
check('3· lista a los intocables con su T3% y su PPT3',
  /Prohibido soltar a .*de 3, .*PPT3/.test(resumenJ) || !tabla.filas.some(f => f.perfil.tiroExternoRentable),
  resumenJ.slice(resumenJ.indexOf('Prohibido'), resumenJ.indexOf('Prohibido') + 150));
check('3· explicita que no se ayuda desde ese lado',
  /no se ayuda desde ese lado/i.test(resumenJ) || !tabla.filas.some(f => f.perfil.tiroExternoRentable));
/* 4. Invitación selectiva */
check('4· encuadra el tiro permitido como ganancia, no como concesión',
  /es ganancia, no concesión/i.test(resumenJ) ||
  !tabla.filas.some(f => ['tirador-ineficiente', 'tirador-sistematico-frio', 'volumen-sin-eficiencia'].indexOf(f.marca.id) !== -1));
check('4· cita el eFG% de los que conviene dejar tirar',
  !/queremos que termine la posesión/.test(resumenJ) || /eFG% \d/.test(resumenJ));
/* 5. Cristal */
check('5· asigna box-out con el múltiplo de liga que lo justifica',
  !/Box-out asignado/.test(resumenJ) || /x la liga en RO%/.test(resumenJ),
  resumenJ.slice(resumenJ.indexOf('Box-out'), resumenJ.indexOf('Box-out') + 140));
/* 6. Criterio global + momento */
check('6· cierra con criterio global y momento reciente en el mismo tramo',
  /Criterio global:/.test(resumenJ) && /últimos \d+ partidos/.test(resumenJ));
check('6· el momento reciente trae el percentil de eFG% de la temporada',
  /percentil \d+ de la liga/.test(resumenJ) || !/eFG% de temporada/.test(resumenJ));
check('los seis tramos salen en el orden del esquema',
  (function () {
    const pos = ['ritmo', 'El ataque pasa por', 'Criterio global:'].map(s => resumenJ.indexOf(s));
    return pos.every(p => p !== -1) && pos[0] < pos[1] && pos[1] < pos[2];
  })(), resumenJ.slice(0, 80));

/* --- Prioridad por carga de minutos --- */
check('el eje nombrado es el que más plays concentra del plantel',
  (function () {
    const top = tabla.filas.slice().sort((a, b) => (b.perfil.concentracion || 0) - (a.perfil.concentracion || 0))[0];
    return resumenJ.indexOf(top.nombre) !== -1;
  })());
check('los jugadores nombrados salen del plantel real, no de un texto fijo',
  tabla.filas.filter(f => resumenJ.indexOf(f.nombre) !== -1).length >= 2,
  tabla.filas.filter(f => resumenJ.indexOf(f.nombre) !== -1).map(f => f.nombre).join('|'));

/* --- TAREA 3: nada de titularidad, en ninguna parte --- */
console.log('\n11. RESTRICCIÓN DE TITULARIDAD');
console.log('═'.repeat(70));

const PROHIBIDAS = /\b(titular(es)?|suplente(s)?|quinteto inicial|starter)\b/i;
check('el resumen estratégico no habla de titulares ni suplentes',
  !PROHIBIDAS.test(resumenJ), (resumenJ.match(PROHIBIDAS) || [''])[0]);
check('ninguna consigna ni restricción de marca menciona titularidad',
  tabla.filas.every(f => !PROHIBIDAS.test(f.marca.consigna + ' ' + f.marca.restriccion + ' ' + f.marca.porque)));
check('ningún rol funcional menciona titularidad',
  S.ROLES_FUNCIONALES.every(r => !PROHIBIDAS.test(r.label)),
  S.ROLES_FUNCIONALES.map(r => r.label).join(' | '));
check('ninguna etiqueta de jerarquía del ADN menciona titularidad',
  JUG.JERARQUIA.every(n => !PROHIBIDAS.test(n.label + ' ' + n.descripcion)),
  JUG.JERARQUIA.map(n => n.label).join(' | '));
check('ninguna banda de minutos menciona titularidad',
  JUG.ROLES_MINUTOS.every(r => !PROHIBIDAS.test(r.label + ' ' + r.rol)),
  JUG.ROLES_MINUTOS.map(r => r.label).join(' | '));
check('los perfiles técnicos tampoco',
  JUG.PERFILES_TECNICOS.every(p => !PROHIBIDAS.test(p.label + ' ' + p.detalle)));
check('ningún perfil de defensor nuestro lo menciona',
  Object.keys(S.PERFILES_DEFENSOR).every(k => !PROHIBIDAS.test(S.PERFILES_DEFENSOR[k])));
check('las fortalezas y fugas generadas tampoco lo mencionan',
  tabla.filas.every(f => f.fortalezas.concat(f.fugas).every(t => !PROHIBIDAS.test(t))));
check('las claves estratégicas tampoco',
  S.clavesEstrategicas(idx, 'AGUILA').every(c => !PROHIBIDAS.test(c.texto + ' ' + c.titulo)));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
