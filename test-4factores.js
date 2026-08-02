/* =====================================================================
   Motor de 4 Factores + Simulador (migración auditada del Apps Script
   legacy). Se prueba la matemática pura con datos sintéticos donde la
   respuesta correcta se conoce de antemano (coeficientes de regresión
   fabricados a mano, sin ruido) y la integración con `idx` mediante
   fixtures chicas y autocontenidas.

   Lo que arma HTML (selectores, tabla de duelos) usa document/LOGOS y no
   se testea acá — mismo criterio que sgadd-equipos.js/sgadd-jugadores.js:
   se verificó a mano en el navegador con datos reales de Reconquista
   (12 equipos, regresión múltiple real sobre 132 partidos, R² 0.96).
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const F = require('./js/sgadd-4factores.js');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const cerca = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (tol || 1e-6);

console.log('\n1. ESTADÍSTICA PURA: Pearson y regresión simple');
console.log('═'.repeat(70));
check('Pearson: relación lineal perfecta positiva da 1', cerca(F.correlacionPearson([1, 2, 3, 4], [2, 4, 6, 8]), 1));
check('Pearson: relación lineal perfecta negativa da -1', cerca(F.correlacionPearson([1, 2, 3, 4], [8, 6, 4, 2]), -1));
check('Pearson: sin varianza en una serie da 0 (no "sin relación")', F.correlacionPearson([5, 5, 5], [1, 2, 3]) === 0);
check('Pearson: series vacías no revientan', F.correlacionPearson([], []) === 0);

const rs1 = F.regresionSimple([1, 2, 3, 4], [2, 4, 6, 8]);
check('regresión simple recupera la pendiente exacta (y=2x)', rs1.ok && cerca(rs1.pendiente, 2) && cerca(rs1.intercepto, 0), JSON.stringify(rs1));
check('regresión simple con menos de 3 puntos falla explícito', F.regresionSimple([1, 2], [1, 2]).ok === false);
check('regresión simple sin varianza en x falla explícito', F.regresionSimple([5, 5, 5], [1, 2, 3]).ok === false);

console.log('\n2. RESOLVER SISTEMA LINEAL Y REGRESIÓN MÚLTIPLE');
console.log('═'.repeat(70));
check('resuelve un sistema 2×2 conocido', (() => {
  const sol = F.resolverSistemaLineal([[2, 1], [1, 3]], [5, 10]); // x=1, y=3
  return sol && cerca(sol[0], 1) && cerca(sol[1], 3);
})());
check('detecta un sistema singular (filas proporcionales) y da null',
  F.resolverSistemaLineal([[1, 2], [2, 4]], [3, 6]) === null);

console.log('\n3. REGRESIÓN MÚLTIPLE: recupera coeficientes conocidos (sin ruido)');
console.log('═'.repeat(70));
const Xrm = [], yrm = [];
for (let i = 0; i < 40; i++) {
  const x1 = (i % 7) - 3, x2 = ((i * 3) % 5) - 2;
  Xrm.push([x1, x2]); yrm.push(5 + 2 * x1 - 3 * x2);
}
const rm = F.regresionMultiple(Xrm, yrm);
check('recupera el intercepto (5)', rm.ok && cerca(rm.intercepto, 5, 1e-6), JSON.stringify(rm));
check('recupera los dos coeficientes (2, -3)', rm.ok && cerca(rm.coeficientes[0], 2, 1e-6) && cerca(rm.coeficientes[1], -3, 1e-6));
check('R² es 1 con datos sin ruido', rm.ok && cerca(rm.r2, 1, 1e-6));

const XrmSing = [], yrmSing = [];
for (let i = 0; i < 40; i++) { const x1 = (i % 9) - 4; XrmSing.push([x1, 2 * x1]); yrmSing.push(10 + x1); }
const rmSing = F.regresionMultiple(XrmSing, yrmSing);
check('matriz singular (predictores colineales) falla explícito, no NaN/Infinity',
  rmSing.ok === false && /singular/i.test(rmSing.motivo), JSON.stringify(rmSing));

const rmChica = F.regresionMultiple([[1, 2], [2, 1], [3, 3]], [5, 6, 7]);
check('muestra insuficiente (< ' + F.MIN_MUESTRA_REGRESION + ') falla explícito',
  rmChica.ok === false && /insuficiente/i.test(rmChica.motivo), JSON.stringify(rmChica));

console.log('\n4. PESO TEMPORAL, PROMEDIO PONDERADO Y CONFIANZA LOGÍSTICA');
console.log('═'.repeat(70));
check('el partido más viejo pesa 0.8', F.pesoTemporalPartido(0, 5) === 0.8);
check('el partido más nuevo pesa exactamente 1.2 (sin el off-by-one del original)',
  cerca(F.pesoTemporalPartido(4, 5), 1.2, 1e-9), F.pesoTemporalPartido(4, 5));
check('con un solo partido, peso neutro (1)', F.pesoTemporalPartido(0, 1) === 1);

check('promedio ponderado simple', cerca(F.promedioPonderado([10, 20], [1, 1]), 15));
check('promedio ponderado favorece el peso más alto', cerca(F.promedioPonderado([10, 20], [3, 1]), 12.5));
check('sin peso acumulado (todo inválido), da null en vez de NaN',
  F.promedioPonderado([null, undefined], [1, 1]) === null);

check('confianza logística en margen 0 es exactamente 50%', cerca(F.confianzaLogistica(0), 0.5));
check('confianza logística nunca llega a 100% (tope 97%)', F.confianzaLogistica(1000) === 0.97);
check('confianza logística nunca llega a 0% (piso 3%)', F.confianzaLogistica(-1000) === 0.03);
check('confianza logística es monótona creciente en el margen',
  F.confianzaLogistica(5) > F.confianzaLogistica(2) && F.confianzaLogistica(2) > F.confianzaLogistica(0));

console.log('\n5. LOS 4 FACTORES: signo único (netFactor)');
console.log('═'.repeat(70));
check('hay exactamente 4 factores', F.FACTORES_NET.length === 4, F.FACTORES_NET.map(f => f.id));
check('eFG%, RO% y RTL% no están invertidos (más es mejor)',
  !F.FACTORES_NET.find(f => f.id === 'eFG%').invertida &&
  !F.FACTORES_NET.find(f => f.id === 'RO%').invertida &&
  !F.FACTORES_NET.find(f => f.id === 'RTL%').invertida);
check('PP% está invertido (menos pérdidas es mejor)', F.FACTORES_NET.find(f => f.id === 'PP%').invertida === true);
check('netFactor no invertido da propio - rival', cerca(F.netFactor({ invertida: false }, 0.50, 0.40), 0.10));
check('netFactor invertido da vuelta el signo', cerca(F.netFactor({ invertida: true }, 0.15, 0.10), -0.05));
check('netFactor con datos faltantes da null (no NaN)', F.netFactor({ invertida: false }, null, 0.4) === null);

console.log('\n6. PESOS DE LIGA: regresión múltiple real, con datos de un solo equipo');
console.log('═'.repeat(70));

/* Fixture A: 35 partidos con margen = 10·netEFG - 5·netPP + 3·netRO + 2·netRTL,
   SIN ruido. Si pesosPorFactor() recupera esos 4 coeficientes, la regresión
   múltiple está bien conectada de punta a punta (idx -> dataset -> OLS). */
const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'PTS', 'PTSopp'];
const cols4F = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO',
  'eFG%', 'PP%', 'RO%', 'RTL%', 'eFG Opp%', 'PP Opp%', 'RO Opp%', 'RTL Opp%'];

function partidoRegresion(i) {
  const netEFG = 0.02 * ((i % 7) - 3);
  const netPP = 0.01 * ((i % 5) - 2);
  const netRO = 0.015 * ((i % 6) - 2.5);
  const netRTL = 0.01 * ((i % 4) - 1.5);
  const margen = 10 * netEFG - 5 * netPP + 3 * netRO + 2 * netRTL;
  const partido = 'A vs RIVAL' + i;
  const fecha = (1 + (i % 27)) + '/0' + (1 + (i % 9)) + '/2026';
  const cond = i % 2 === 0 ? 'LOCAL' : 'VISITANTE';
  const resultado = margen >= 0 ? 'GANADO' : 'PERDIDO';
  return {
    bd: { FECHA: fecha, PARTIDO: partido, EQUIPO: 'A', FASE: 'REGULAR', CONDICION: cond, RESULTADO: resultado, PTS: String(70 + margen), PTSopp: '70' },
    f4: {
      FECHA: fecha, PARTIDO: partido, EQUIPO: 'A', FASE: 'REGULAR', CONDICION: cond, RESULTADO: resultado,
      'eFG%': String(0.45 + netEFG / 2), 'eFG Opp%': String(0.45 - netEFG / 2),
      'PP%': String(0.15 - netPP / 2), 'PP Opp%': String(0.15 + netPP / 2),
      'RO%': String(0.25 + netRO / 2), 'RO Opp%': String(0.25 - netRO / 2),
      'RTL%': String(0.20 + netRTL / 2), 'RTL Opp%': String(0.20 - netRTL / 2),
    },
  };
}
const filasReg = Array.from({ length: 35 }, (_, i) => partidoRegresion(i));
const idxReg = SGADD.construirIndice({
  'Base Datos E': { cols: colsBD, filas: filasReg.map(f => f.bd) },
  '4 FACTORES': { cols: cols4F, filas: filasReg.map(f => f.f4) },
}, { fase: 'REGULAR' });

const datosReg = F.datosRegresionLiga(idxReg);
check('el dataset de liga tiene un caso por partido (35)', datosReg.X.length === 35, datosReg.X.length);

const pesosReg = F.pesosPorFactor(idxReg);
check('con 35 partidos (≥ mínimo) usa regresión múltiple, no el respaldo',
  pesosReg.metodo === 'regresion', JSON.stringify(pesosReg));
check('recupera el peso de eFG% (10)', cerca(pesosReg.pesos['eFG%'], 10, 0.01), pesosReg.pesos['eFG%']);
check('recupera el peso de PP% (-5, negativo: el solver no fuerza signos)', cerca(pesosReg.pesos['PP%'], -5, 0.01), pesosReg.pesos['PP%']);
check('recupera el peso de RO% (3)', cerca(pesosReg.pesos['RO%'], 3, 0.01), pesosReg.pesos['RO%']);
check('recupera el peso de RTL% (2)', cerca(pesosReg.pesos['RTL%'], 2, 0.01), pesosReg.pesos['RTL%']);
check('R² de liga es prácticamente 1 (dataset sin ruido)', pesosReg.r2 > 0.999, pesosReg.r2);

/* Fixture B: 10 partidos (por debajo del mínimo), donde SOLO eFG% varía.
   El respaldo por factor tiene que recuperar ese único coeficiente y dar
   0 (no ruido, no NaN) en los factores que no variaron. */
function partidoSoloEFG(i) {
  const netEFG = 0.02 * (i - 4.5);
  const margen = 10 * netEFG;
  const partido = 'B vs RIVAL' + i;
  const fecha = (1 + i) + '/03/2026';
  return {
    bd: { FECHA: fecha, PARTIDO: partido, EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: margen >= 0 ? 'GANADO' : 'PERDIDO', PTS: String(70 + margen), PTSopp: '70' },
    f4: {
      FECHA: fecha, PARTIDO: partido, EQUIPO: 'B', FASE: 'REGULAR', CONDICION: 'LOCAL', RESULTADO: margen >= 0 ? 'GANADO' : 'PERDIDO',
      'eFG%': String(0.45 + netEFG / 2), 'eFG Opp%': String(0.45 - netEFG / 2),
      'PP%': '0,15', 'PP Opp%': '0,15', 'RO%': '0,25', 'RO Opp%': '0,25', 'RTL%': '0,20', 'RTL Opp%': '0,20',
    },
  };
}
const filasChicas = Array.from({ length: 10 }, (_, i) => partidoSoloEFG(i));
const idxChico = SGADD.construirIndice({
  'Base Datos E': { cols: colsBD, filas: filasChicas.map(f => f.bd) },
  '4 FACTORES': { cols: cols4F, filas: filasChicas.map(f => f.f4) },
}, { fase: 'REGULAR' });
const pesosChico = F.pesosPorFactor(idxChico);
check('con 10 partidos (< mínimo) degrada al respaldo por factor',
  pesosChico.metodo === 'correlacion', JSON.stringify(pesosChico));
check('el respaldo también recupera el coeficiente de eFG% (10)', cerca(pesosChico.pesos['eFG%'], 10, 0.01), pesosChico.pesos['eFG%']);
check('los factores sin variación dan 0, no ruido ni NaN',
  pesosChico.pesos['PP%'] === 0 && pesosChico.pesos['RO%'] === 0 && pesosChico.pesos['RTL%'] === 0,
  JSON.stringify(pesosChico.pesos));

console.log('\n7. PERFIL DE EQUIPO PARA SIMULAR: fallback de muestra chica y recencia');
console.log('═'.repeat(70));

const colsPE = ['EQUIPO', 'FASE', 'PJ', 'PLAYS', 'PPP', 'eFG%'];
const filasPE = [
  { EQUIPO: 'X', FASE: 'REGULAR', PJ: '5', PLAYS: '95', PPP: '0,85', 'eFG%': '0,40' },
  { EQUIPO: 'Y', FASE: 'REGULAR', PJ: '6', PLAYS: '65', PPP: '0,90', 'eFG%': '0,55' },
  { EQUIPO: 'Z', FASE: 'REGULAR', PJ: '5', PLAYS: '80', PPP: '0,88', 'eFG%': '0,45' },
];

/* X: 4 LOCAL (eFG% creciente 0,30→0,50, para ver que la recencia pesa) + 1
   VISITANTE (menos de 3: tiene que caer a toda la temporada). */
function filaSim(equipo, cond, fecha, partido, efg, resultado) {
  return {
    bd: { FECHA: fecha, PARTIDO: partido, EQUIPO: equipo, FASE: 'REGULAR', CONDICION: cond, RESULTADO: resultado, PTS: '70', PTSopp: '65' },
    f4: {
      FECHA: fecha, PARTIDO: partido, EQUIPO: equipo, FASE: 'REGULAR', CONDICION: cond, RESULTADO: resultado,
      'eFG%': String(efg), 'eFG Opp%': '0,45', 'PP%': '0,15', 'PP Opp%': '0,15',
      'RO%': '0,25', 'RO Opp%': '0,25', 'RTL%': '0,20', 'RTL Opp%': '0,20',
    },
  };
}
const partidosXY = [
  filaSim('X', 'LOCAL', '01/01/2026', 'X vs P1', 0.30, 'PERDIDO'),
  filaSim('X', 'LOCAL', '08/01/2026', 'X vs P2', 0.35, 'GANADO'),
  filaSim('X', 'LOCAL', '15/01/2026', 'X vs P3', 0.40, 'GANADO'),
  filaSim('X', 'LOCAL', '22/01/2026', 'X vs P4', 0.50, 'GANADO'),
  filaSim('X', 'VISITANTE', '29/01/2026', 'X vs P5', 0.60, 'GANADO'),
  filaSim('Y', 'LOCAL', '01/01/2026', 'Y vs Q1', 0.50, 'GANADO'),
  filaSim('Y', 'LOCAL', '08/01/2026', 'Y vs Q2', 0.52, 'PERDIDO'),
  filaSim('Y', 'LOCAL', '15/01/2026', 'Y vs Q3', 0.54, 'PERDIDO'),
  filaSim('Y', 'VISITANTE', '22/01/2026', 'Y vs Q4', 0.56, 'GANADO'),
  filaSim('Y', 'VISITANTE', '29/01/2026', 'Y vs Q5', 0.58, 'PERDIDO'),
  filaSim('Y', 'VISITANTE', '05/02/2026', 'Y vs Q6', 0.60, 'PERDIDO'),
];
const idxSim = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsPE, filas: filasPE },
  'Base Datos E': { cols: colsBD, filas: partidosXY.map(p => p.bd) },
  '4 FACTORES': { cols: cols4F, filas: partidosXY.map(p => p.f4) },
}, { fase: 'REGULAR' });

const perfilXLocal = F.perfilEquipoSimulacion(idxSim, 'X', 'LOCAL');
check('X tiene 4 partidos de local: no hace falta el respaldo', perfilXLocal.usoHistoriaCompleta === false && perfilXLocal.pj === 4);
const promedioSimpleXLocal = (0.30 + 0.35 + 0.40 + 0.50) / 4;
check('la recencia pesa más el último partido: el ponderado queda por encima del promedio simple',
  perfilXLocal['eFG%'] > promedioSimpleXLocal, perfilXLocal['eFG%'] + ' vs simple ' + promedioSimpleXLocal);

const perfilXVisitante = F.perfilEquipoSimulacion(idxSim, 'X', 'VISITANTE');
check('X tiene un solo partido de visitante (< ' + F.MIN_PARTIDOS_CONDICION + '): usa toda la temporada',
  perfilXVisitante.usoHistoriaCompleta === true && perfilXVisitante.pj === 5, JSON.stringify({ pj: perfilXVisitante.pj, usoHistoriaCompleta: perfilXVisitante.usoHistoriaCompleta }));

const perfilYLocal = F.perfilEquipoSimulacion(idxSim, 'Y', 'LOCAL');
const perfilYVisitante = F.perfilEquipoSimulacion(idxSim, 'Y', 'VISITANTE');
check('Y tiene 3 partidos de cada lado: ninguno de los dos necesita el respaldo',
  perfilYLocal.usoHistoriaCompleta === false && perfilYVisitante.usoHistoriaCompleta === false &&
  perfilYLocal.pj === 3 && perfilYVisitante.pj === 3);

check('perfilEquipoSimulacion() de un equipo inexistente da null', F.perfilEquipoSimulacion(idxSim, 'NO_EXISTE', 'LOCAL') === null);
check('perfilEquipoSimulacion() trae PLAYS y PPP de la temporada (PROMEDIOS E)',
  cerca(perfilXLocal.plays, 95) && cerca(perfilXLocal.pppOf, 0.85));

console.log('\n8. VENTAJA DE LOCALÍA DE LIGA');
console.log('═'.repeat(70));
/* X local: 3 ganados de 4. Y local: 1 ganado de 3. Liga: 4 de 7 ≈ 0,5714. */
const ventaja = F.ventajaLocaliaLiga(idxSim);
check('ventaja de localía calculada sobre TODOS los equipos de la liga',
  cerca(ventaja, 4 / 7 - 0.5, 1e-6), ventaja);
check('liga sin ningún partido de local usa un valor conservador (no 0 = "no importa")',
  cerca(F.ventajaLocaliaLiga(SGADD.construirIndice({}, { fase: 'REGULAR' })), 0.05));

console.log('\n9. MATRIZ EFICIENCIA VS. VOLUMEN');
console.log('═'.repeat(70));
const matrizX = F.matrizVolumenEficiencia(idxSim, 'X');
const matrizY = F.matrizVolumenEficiencia(idxSim, 'Y');
check('X (mucho PLAYS, poco eFG%) cae en "vive del volumen"', matrizX.cuadrante === 'volumen', JSON.stringify(matrizX));
check('Y (poco PLAYS, mucho eFG%) cae en "selectivo y letal"', matrizY.cuadrante === 'selectivo', JSON.stringify(matrizY));
check('matrizVolumenEficiencia() de un equipo inexistente da null', F.matrizVolumenEficiencia(idxSim, 'NO_EXISTE') === null);

console.log('\n10. SIMULADOR DE CRUCE, de punta a punta');
console.log('═'.repeat(70));
check('no se puede simular un equipo contra sí mismo',
  F.simularEnfrentamiento(idxSim, 'X', 'X').ok === false);
check('un equipo inexistente da error, no una excepción',
  F.simularEnfrentamiento(idxSim, 'NO_EXISTE', 'X').ok === false);
check('un equipo sin partidos cargados (Z) no se puede simular',
  F.simularEnfrentamiento(idxSim, 'Z', 'X').ok === false);

const sim = F.simularEnfrentamiento(idxSim, 'X', 'Y');
check('la simulación X (local) vs Y (visitante) se resuelve', sim.ok === true, JSON.stringify(sim.motivo));
check('trae los 4 duelos tácticos', sim.duelos.length === 4);
check('el margen es exactamente scoreLocal - scoreVisitante', cerca(sim.margen, sim.scoreLocal - sim.scoreVisitante, 1e-9));
check('la confianza es una probabilidad válida (entre 3% y 97%)', sim.confianza > 0.03 && sim.confianza < 0.97, sim.confianza);
check('el ganador es alguno de los dos equipos', sim.ganador === sim.local || sim.ganador === sim.visitante);
check('el factor clave es uno de los 4 factores', F.FACTORES_NET.some(f => f.id === sim.factorClave.id));
check('el bonus de localía es positivo y aditivo (no multiplica el score)', sim.bonusLocalia > 0, sim.bonusLocalia);
check('con esta liga chica (< 30 partidos) el método de pesos es el de respaldo',
  sim.metodoPesos === 'correlacion', sim.metodoPesos);
check('la simulación registra que ninguno de los dos necesitó el respaldo de muestra chica',
  sim.usoHistoriaCompletaLocal === false && sim.usoHistoriaCompletaVisitante === false,
  JSON.stringify({ local: sim.usoHistoriaCompletaLocal, visitante: sim.usoHistoriaCompletaVisitante }));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
