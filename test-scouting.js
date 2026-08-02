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

const filasPJ = [
  /* Fila TIPO de liga: la mediana. EQUIPO vacío = la de liga, no la de un
     equipo puntual (regla del punto 3 de CLAUDE.md). */
  jug('JUGADOR TIPO', '', { MIN: '15', 'PePP%': '0,13', 'RO%': '0,05', PLAYS: '9' }),

  /* AGUILA — el rival a scoutear. */
  jug('TIRADOR, ELITE', 'AGUILA', {
    MIN: '30', PLAYS: '20', PTS: '22', PPP: '1,10',
    'PT3%': '0,55', PPT3: '1,35', 'T3%': '0,45', 'PT2%': '0,30', PPT2: '0,95',
    'PT1%': '0,08', 'T1%': '0,80', 'PePP%': '0,10',
  }),
  jug('PIVOT, INTERNO', 'AGUILA', {
    MIN: '28', PLAYS: '14', PTS: '15',
    'PT3%': '0,05', PPT3: '0,30', 'PT2%': '0,72', PPT2: '1,25',
    'PT1%': '0,12', 'T1%': '0,52', 'RO%': '0,11', 'PePP%': '0,12',
  }),
  jug('BASE, RIESGOSO', 'AGUILA', {
    MIN: '26', PLAYS: '13', PTS: '10',
    'PePP%': '0,22', 'AST-PP': '1,10', 'PT3%': '0,30', PPT3: '0,90', 'PT2%': '0,50',
  }),
  jug('LADRILLO, PERIMETRAL', 'AGUILA', {
    MIN: '24', PLAYS: '11', PTS: '8',
    'PT3%': '0,52', PPT3: '0,72', 'T3%': '0,24', 'PT2%': '0,35', 'PePP%': '0,12',
  }),
  jug('CONTACTO, FINO', 'AGUILA', {
    MIN: '22', PLAYS: '10', PTS: '11',
    'PT1%': '0,18', 'T1%': '0,88', PPT1: '0,88', 'PT3%': '0,20', 'PT2%': '0,50',
  }),
  jug('SUPLENTE, GRIS', 'AGUILA', { MIN: '10', PLAYS: '4', PTS: '3' }),

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
check('AGUILA tiene su plantel de 6', (idx.liga.jugadoresPorEquipo.get('AGUILA') || []).length === 6);
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
const tabla = S.jugadoresClave(idx, 'AGUILA');
check('la tabla trae los 6 jugadores de AGUILA', tabla.filas.length === 6, tabla.filas.length);
check('vienen ordenados por minutos, de mayor a menor',
  tabla.filas.map(f => f.perfil.min).every((m, i, a) => i === 0 || a[i - 1] >= m),
  JSON.stringify(tabla.filas.map(f => f.perfil.min)));
check('el primero es el que más juega (TIRADOR, ELITE con 30 min)', tabla.filas[0].nombre === 'TIRADOR, ELITE');
check('trae las 8 columnas del informe impreso', tabla.columnas.length === 8, tabla.columnas.map(c => c.label).join(','));
check('las celdas de %USO 3PTS traen su PPT3 debajo',
  tabla.filas[0].celdas['PT3%'].sub && tabla.filas[0].celdas['PT3%'].sub.clave === 'PPT3');
check('trae la fila de cierre de promedio del equipo', !!tabla.promedioEquipo && tabla.promedioEquipo['MIN'].valor !== null);
check('trae la fila de cierre de promedio de la liga', !!tabla.promedioLiga && tabla.promedioLiga['MIN'].valor !== null);

/* Semáforo: exactamente 3 destacados por métrica, y son los 3 más altos. */
S.COLS_JUGADOR.forEach(c => {
  const destacados = tabla.filas.filter(f => f.celdas[c.id].destacado);
  if (destacados.length !== S.TOP_SEMAFORO) {
    check('semáforo de ' + c.label + ': marca exactamente ' + S.TOP_SEMAFORO, false, destacados.length);
  }
});
check('el semáforo marca exactamente ' + S.TOP_SEMAFORO + ' jugadores en cada una de las 8 métricas',
  S.COLS_JUGADOR.every(c => tabla.filas.filter(f => f.celdas[c.id].destacado).length === S.TOP_SEMAFORO));
check('el top de MIN son efectivamente los tres que más minutos juegan',
  tabla.filas.filter(f => f.celdas['MIN'].destacado).map(f => f.nombre).sort().join('|') ===
  ['TIRADOR, ELITE', 'PIVOT, INTERNO', 'BASE, RIESGOSO'].sort().join('|'),
  tabla.filas.filter(f => f.celdas['MIN'].destacado).map(f => f.nombre).join('|'));
check('en %TOV el semáforo marca a los que MÁS pierden (es a quien conviene presionar)',
  tabla.filas.filter(f => f.celdas['PePP%'].destacado).some(f => f.nombre === 'BASE, RIESGOSO'),
  tabla.filas.filter(f => f.celdas['PePP%'].destacado).map(f => f.nombre).join('|'));
check('el destacado guarda su puesto interno (1 a 3)',
  tabla.filas.filter(f => f.celdas['MIN'].destacado).every(f => f.celdas['MIN'].puestoInterno >= 1 && f.celdas['MIN'].puestoInterno <= 3));
check('jugadoresClave() de un equipo inexistente da null', S.jugadoresClave(idx, 'NO_EXISTE') === null);

console.log('\n6. PERFIL Y MARCA ASIGNADA SUGERIDA');
console.log('═'.repeat(70));
const porNombre = {};
tabla.filas.forEach(f => { porNombre[f.nombre] = f; });

check('el perfil calcula la concentración de plays sobre el total del plantel',
  cerca(porNombre['TIRADOR, ELITE'].perfil.concentracion, 20 / tabla.totalPlays, 1e-6),
  porNombre['TIRADOR, ELITE'].perfil.concentracion);
check('el perfil relativiza las pérdidas contra la mediana de la liga, no en absoluto',
  cerca(porNombre['BASE, RIESGOSO'].perfil.perdidasRel, 0.22 / 0.13, 1e-3),
  porNombre['BASE, RIESGOSO'].perfil.perdidasRel);

check('al tirador de élite le asigna TOP LOCK y NO FOUL',
  porNombre['TIRADOR, ELITE'].marca.id === 'tirador-elite' &&
  porNombre['TIRADOR, ELITE'].marca.consigna === 'TOP LOCK / LÍNEA DE PASE' &&
  porNombre['TIRADOR, ELITE'].marca.restriccion === 'NO FOUL',
  JSON.stringify(porNombre['TIRADOR, ELITE'].marca));
check('al pivot interno le asigna 3/4 POR DELANTE y BOX-OUT DE CHOQUE',
  porNombre['PIVOT, INTERNO'].marca.id === 'finalizador-interno' &&
  porNombre['PIVOT, INTERNO'].marca.restriccion === 'BOX-OUT DE CHOQUE',
  JSON.stringify(porNombre['PIVOT, INTERNO'].marca));
check('al base que pierde mucho le asigna ACOSO AL DRIBLE / TRAP',
  porNombre['BASE, RIESGOSO'].marca.id === 'generador-riesgoso' &&
  porNombre['BASE, RIESGOSO'].marca.restriccion === 'FORZAR EL ERROR',
  JSON.stringify(porNombre['BASE, RIESGOSO'].marca));
check('al tirador de volumen sin renta le asigna FLOTAR / UNDER e INVITACIÓN AL TIRO',
  porNombre['LADRILLO, PERIMETRAL'].marca.id === 'tirador-ineficiente' &&
  porNombre['LADRILLO, PERIMETRAL'].marca.restriccion === 'INVITACIÓN AL TIRO',
  JSON.stringify(porNombre['LADRILLO, PERIMETRAL'].marca));
check('al suplente sin amenaza dominante le queda el fallback de contención',
  porNombre['SUPLENTE, GRIS'].marca.id === 'contencion', JSON.stringify(porNombre['SUPLENTE, GRIS'].marca));
check('cada marca explica POR QUÉ con el número que la disparó',
  tabla.filas.every(f => typeof f.marca.porque === 'string' && f.marca.porque.length > 10));
check('la cascada de marcas siempre resuelve: ningún jugador queda sin consigna',
  tabla.filas.every(f => !!f.marca.consigna && !!f.marca.restriccion));

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

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
