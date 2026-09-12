/* =====================================================================
   EL RESTO DEL PLANTEL Y LA FICHA DEL PLAN ORO

   Dos cosas que entraron juntas al informe pre-partido y se testean
   juntas porque comparten el bloque 7:

     · el RESTO DEL PLANTEL — los que no entran al análisis principal,
       en una tabla con su muestra, su arma principal y sus etiquetas;
     · la FICHA POR JUGADOR, que pasó a ser del plan ORO.

   LA FIXTURE ESTÁ ARMADA PARA QUE LAS TASAS SE PUEDAN AFIRMAR A MANO.
   La liga entera promedia 10 puntos en 20 minutos (0,50 PTS/min) y los
   suplentes llevan sus cuentas escaladas a sus minutos, así que un
   suplente "normal" da exactamente la misma tasa que un titular. Ese es
   el punto entero del bloque: si la comparación fuera por partido, la
   diferencia estaría garantizada de antemano y la alerta no diría nada.

   Los nombres de EQUIPO son reales (`logos/la-plata/index.json`), misma
   regla que `test-scouting.js`. Los de JUGADOR son descriptivos: dicen
   qué caso encarna cada uno.
   ===================================================================== */
global.SGADD = require('./js/sgadd-core.js');
const S = require('./js/sgadd-scouting.js');
const A = require('./js/sgadd-auth.js');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => { console.log('\n' + t); console.log('═'.repeat(70)); };
const cerca = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < (tol || 1e-6);

/* =====================================================================
   FIXTURE
   ===================================================================== */

const colsPE = ['EQUIPO', 'FASE', 'PJ', 'POS', 'PACE', 'PLAYS', 'PPP', 'PTS', 'PTSopp',
  'eFG%', 'RTL%', 'RO%', 'RD%', 'AST%', 'PT3%', 'PT2%', 'PT1%', 'PePP%',
  'PPT3', 'PPT2', 'PPT1', 'T1%', 'T2%', 'T3%', 'PP', 'PR', 'RO'];

function filaPE(eq) {
  return {
    EQUIPO: eq, FASE: 'REGULAR', PJ: '3', POS: '78', PACE: '80',
    PLAYS: '80', PPP: '0,95', PTS: '76', PTSopp: '72',
    'eFG%': '0,50', 'RTL%': '0,20', 'RO%': '0,28', 'RD%': '0,72', 'AST%': '0,55',
    'PT3%': '0,35', 'PT2%': '0,42', 'PT1%': '0,10', 'PePP%': '0,13',
    PPT3: '1,00', PPT2: '1,00', PPT1: '0,70', 'T1%': '0,70', 'T2%': '0,50', 'T3%': '0,33',
    PP: '12', PR: '6', RO: '10',
  };
}
const EQUIPOS = ['ATENAS A', 'PLATENSE A', 'NAUTICO ENSENADA', 'UNIVERSAL'];
const filasPE = EQUIPOS.map(filaPE).concat([Object.assign(filaPE('EQUIPO TIPO'), { PACE: '', POS: '' })]);

const colsPJ = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PLAYS', 'PTS', 'PPP', 'eFG%', 'TS%', 'RTL%', 'USG%',
  'PT2%', 'PT3%', 'PT1%', 'PePP%', 'T2C', 'T2I', 'PPT2', 'T2%', 'T3C', 'T3I', 'PPT3', 'T3%',
  'T1C', 'T1I', 'PPT1', 'T1%', 'TCC', 'TCI', 'TC%', 'RD', 'RD%', 'RO', 'RO%', 'RT', 'RT%',
  'AST', 'AST%', 'PR', 'PR%', 'PP', 'AST-PP', 'TC', 'TR', 'FC', 'FR', 'VAL',
  'PTSopp', 'RDopp', 'ROopp', 'PPopp', 'PLAYSopp'];

/* El molde de la liga: 20 minutos, 10 puntos, 4 rebotes, 2 asistencias.
   `PR` va en CERO a propósito en todos: es el caso de la mediana que no
   sirve de denominador. */
function jug(nombre, equipo, o) {
  const base = {
    NOMBRES: nombre, EQUIPO: equipo, FASE: 'REGULAR', PJ: '3',
    MIN: '20', PLAYS: '10', PTS: '10', PPP: '1,00', 'eFG%': '0,50', 'TS%': '0,55', 'RTL%': '0,20', 'USG%': '0,20',
    'PT2%': '0,42', 'PT3%': '0,35', 'PT1%': '0,08', 'PePP%': '0,13',
    T2C: '3', T2I: '6', PPT2: '1,00', 'T2%': '0,50', T3C: '1', T3I: '3', PPT3: '1,00', 'T3%': '0,33',
    T1C: '2', T1I: '3', PPT1: '0,67', 'T1%': '0,67', TCC: '4', TCI: '9', 'TC%': '0,44',
    RD: '3', 'RD%': '0,12', RO: '1', 'RO%': '0,05', RT: '4', 'RT%': '0,09',
    AST: '2', 'AST%': '0,15', PR: '0', 'PR%': '0,00', PP: '1,3', 'AST-PP': '1,50',
    TC: '0', TR: '0', FC: '2', FR: '2', VAL: '10',
    PTSopp: '0', RDopp: '0', ROopp: '0', PPopp: '0', PLAYSopp: '0',
  };
  return Object.assign(base, o);
}

/* EL MOLDE, ESCALADO A SUS MINUTOS: las mismas TASAS con las cuentas
   proporcionales. Así toda la liga da exactamente 0,50 PTS/min y 0,20
   RT/min, juegue 30 minutos o 6 — que es la propiedad que el bloque
   viene a medir, y la que deja afirmar los números a mano. */
function conTasas(nombre, equipo, min, o) {
  const k = min / 20;
  return jug(nombre, equipo, Object.assign({
    MIN: String(min), PLAYS: String(10 * k), PTS: String(10 * k),
    RD: String(3 * k), RO: String(1 * k), RT: String(4 * k), AST: String(2 * k),
  }, o || {}));
}

const filasPJ = [
  /* La fila TIPO de LIGA (columna EQUIPO vacía). Su MIN es el umbral de
     calificación: 15, así que los cinco del resto quedan afuera del pool
     de referencia y los ocho de arriba adentro. */
  jug('JUGADOR TIPO', '', { MIN: '15' }),

  /* --- ATENAS A · los OCHO del análisis principal --- */
  conTasas('UNO, TITULAR', 'ATENAS A', 30),
  conTasas('DOS, TITULAR', 'ATENAS A', 28),
  conTasas('TRES, TITULAR', 'ATENAS A', 26),
  conTasas('CUATRO, TITULAR', 'ATENAS A', 24),
  conTasas('CINCO, TITULAR', 'ATENAS A', 22),
  conTasas('SEIS, ROTACION', 'ATENAS A', 20),
  conTasas('SIETE, ROTACION', 'ATENAS A', 18),
  conTasas('OCHO, ROTACION', 'ATENAS A', 16),

  /* --- ATENAS A · el RESTO, uno por caso --- */
  /* EL FACTOR X: 9 puntos en 10 minutos = 0,90 PTS/min contra 0,50 de la
     mediana de su rol. +80%. Todo lo demás, escalado. */
  conTasas('FACTOR, X', 'ATENAS A', 10, { PTS: '9' }),
  /* El que no destaca en nada: mismas tasas que un titular. */
  conTasas('GRIS, SUPLENTE', 'ATENAS A', 12),
  /* Tasas de EQUIPO por las nubes y cuentas escaladas: `RO%`/`RD%` no
     entran al bloque justamente porque su denominador no se prorratea
     por minutos (punto 24). No tiene que disparar nada. */
  conTasas('CRISTAL, ENGANOSO', 'ATENAS A', 10, { 'RO%': '0,40', 'RD%': '0,60' }),
  /* Una noche sola: dispara, pero con la muestra marcada. */
  conTasas('CORTO, MUESTRA', 'ATENAS A', 6, { PJ: '1', PTS: '6' }),
  /* Sin minutos: entra a la lista con sus etiquetas y sin alertas. */
  jug('CERO, MINUTOS', 'ATENAS A', { MIN: '0', PLAYS: '0', PTS: '0', RD: '0', RO: '0', RT: '0', AST: '0' }),
  /* INTERIOR puro y suplente: su rol no tiene un solo calificado en la
     liga, así que su referencia degrada a la liga entera. */
  conTasas('PIVOT, SOLITARIO', 'ATENAS A', 10, {
    'PT3%': '0,04', 'PT2%': '0,70', T3I: '0,3', T2I: '8', PPT2: '0,90', PPT3: '0,30',
    PTS: '9', 'AST-PP': '0,60',
  }),

  /* --- Los otros tres equipos: el pool de referencia de la liga --- */
].concat([].concat.apply([], EQUIPOS.slice(1).map(eq => [
  conTasas('UNO, ' + eq.split(' ')[0], eq, 25),
  conTasas('DOS, ' + eq.split(' ')[0], eq, 22),
  conTasas('TRES, ' + eq.split(' ')[0], eq, 20),
])));

const colsBD = ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO',
  'PTS', 'PTSopp', 'PLAYS', 'PLAYSopp', 'TCC', 'TCI', 'T3C', 'T3I', 'T2C', 'T2I',
  'T1C', 'T1I', 'RO', 'RD', 'ROopp', 'RDopp', 'PP', 'PPopp', 'AST'];

function partido(fecha, local, visitante, ptsL, ptsV) {
  const fila = (eq, cond, pts, ptsOpp) => ({
    FECHA: fecha, PARTIDO: local + ' vs ' + visitante, EQUIPO: eq, FASE: 'REGULAR', CONDICION: cond,
    RESULTADO: pts > ptsOpp ? 'GANADO' : 'PERDIDO',
    PTS: String(pts), PTSopp: String(ptsOpp), PLAYS: '80', PLAYSopp: '80',
    TCC: '30', TCI: '60', T3C: '8', T3I: '22', T2C: '22', T2I: '38',
    T1C: '12', T1I: '17', RO: '10', RD: '26', ROopp: '10', RDopp: '26',
    PP: '11', PPopp: '11', AST: '15',
  });
  return [fila(local, 'LOCAL', ptsL, ptsV), fila(visitante, 'VISITANTE', ptsV, ptsL)];
}
const filasBD = [].concat(
  partido('05/01/2026', 'ATENAS A', 'UNIVERSAL', 88, 70),
  partido('12/01/2026', 'ATENAS A', 'PLATENSE A', 84, 74),
  partido('19/01/2026', 'NAUTICO ENSENADA', 'ATENAS A', 80, 66),
  partido('26/01/2026', 'PLATENSE A', 'UNIVERSAL', 79, 71)
);

const idx = SGADD.construirIndice({
  'PROMEDIOS E': { cols: colsPE, filas: filasPE },
  'Base Datos E': { cols: colsBD, filas: filasBD },
  'PROMEDIOS J': { cols: colsPJ, filas: filasPJ },
}, { fase: 'REGULAR' });
/* Misma declaración que `test-scouting.js`: los umbrales dependen del
   nivel desde el punto 45 y la fixture está calibrada contra esta vara. */
idx.liga.nivel = 'LIGA_ARGENTINA';

titulo('0. LA FIXTURE ES SANA (si esto falla, el resto miente)');
check('la liga tiene los 4 equipos', idx.lista().length === 4, idx.lista().length);
check('ATENAS A tiene 14 jugadores', (idx.liga.jugadoresPorEquipo.get('ATENAS A') || []).length === 14,
  (idx.liga.jugadoresPorEquipo.get('ATENAS A') || []).length);
check('el umbral de calificación es el MIN del JUGADOR TIPO', idx.liga.minJugador === 15, idx.liga.minJugador);
check('y deja afuera a los seis del resto',
  idx.liga.jugadoresCalificados.length === 17, idx.liga.jugadoresCalificados.length);

/* =====================================================================
   1. EL CORTE
   ===================================================================== */
titulo('1. EL CORTE · la tabla de arriba y el resto parten la MISMA lista');

const clave = S.jugadoresClave(idx, 'ATENAS A', null, { claveNuestro: 'PLATENSE A' });
const resto = S.restoDelPlantel(idx, 'ATENAS A');

check('el bloque existe: cinco en la tabla y uno en la nota de pocos minutos',
  !!resto && resto.filas.length === 5 && resto.pocosMinutos.length === 1,
  resto && (resto.filas.length + '+' + resto.pocosMinutos.length));
check('la tabla de arriba se queda con los ocho de siempre',
  clave.filas.length === S.TOP_JUGADORES, clave.filas.length);
check('ninguno sale en los dos bloques',
  resto.filas.every(f => !clave.filas.some(c => c.clave === f.clave)));
check('y entre la tabla de arriba, la del resto y la nota está el plantel entero',
  clave.filas.length + resto.filas.length + resto.pocosMinutos.length === 14);
check('el resto va ordenado por minutos, de mayor a menor',
  resto.filas.map(f => f.min).join(',') === '12,10,10,10,6',
  resto.filas.map(f => f.min).join(','));
check('el bloque dice desde dónde cortó y cuántos son en total',
  resto.desde === S.TOP_JUGADORES && resto.total === 14, resto.desde + '/' + resto.total);

/* El corte sale de UNA sola función: dos ordenamientos calcados terminan
   partiendo en distinto lugar. */
const orden = S.plantelOrdenado(idx, 'ATENAS A');
check('`plantelOrdenado` es el que parte la lista',
  orden.length === 14 && orden.slice(0, 8).map(j => j.__clave).join('|')
    === clave.filas.map(f => f.clave).join('|'));

/* Un equipo con ocho o menos NO devuelve bloque: una card vacía diciendo
   "no hay resto" es ruido en un informe de ocho secciones. */
check('un plantel de tres no genera bloque', S.restoDelPlantel(idx, 'PLATENSE A') === null);

/* =====================================================================
   2. LAS ETIQUETAS
   ===================================================================== */
titulo('2. LAS ETIQUETAS SALEN DEL MOTOR COMPARTIDO');

const factor = resto.filas.find(f => f.nombre === 'FACTOR, X');
const gris = resto.filas.find(f => f.nombre === 'GRIS, SUPLENTE');
const cristal = resto.filas.find(f => f.nombre === 'CRISTAL, ENGANOSO');
const corto = resto.filas.find(f => f.nombre === 'CORTO, MUESTRA');
const cero = resto.pocosMinutos.find(f => f.nombre === 'CERO, MINUTOS');
const pivot = resto.filas.find(f => f.nombre === 'PIVOT, SOLITARIO');

check('cada fila trae su función en cancha', !!factor.rol && !!factor.rol.label, factor.rol && factor.rol.label);
check('y las etiquetas del ADN, las MISMAS que pinta la ficha del jugador',
  factor.etiquetas.length > 0 && factor.etiquetas.some(b => b.tipo === 'rol'),
  factor.etiquetas.map(b => b.texto).join(' · '));
const J = require('./js/sgadd-jugadores.js');
const jFactor = (idx.liga.jugadoresPorEquipo.get('ATENAS A') || []).find(j => j['NOMBRES'] === 'FACTOR, X');
check('no se rearman acá: son las de `jugadoresBadges`',
  JSON.stringify(factor.etiquetas) === JSON.stringify(J.jugadoresBadges(J.jugadoresADN(idx, jFactor))));
check('un suplente que no califica lleva sus etiquetas marcadas con ~',
  factor.etiquetas.every(b => b.sinRespaldo && b.texto.indexOf('~') === 0),
  factor.etiquetas.map(b => b.texto).join(' · '));
check('el de cero minutos no tiene fila: va a la nota',
  !!cero && !resto.filas.some(f => f.nombre === 'CERO, MINUTOS'));

/* =====================================================================
   3. SIN ALERTAS
   ===================================================================== */
titulo('3. EL RESTO NO LLEVA ALERTAS DE IMPACTO');

/* Se sacaron a pedido del club (2026-09-12): son jugadores de baja
   rotación y la fila está para leer su arma principal de un vistazo. El
   FACTOR, X de la fixture es justo el caso que antes disparaba —9 puntos
   en 10 minutos, +80% sobre su rol—, así que si una alerta volviera a
   colarse, aparecería acá. */
check('ninguna fila trae alertas', resto.filas.every(f => !('alertas' in f)),
  resto.filas.filter(f => 'alertas' in f).map(f => f.nombre).join(','));
check('ni la marca de «alto impacto en pocos minutos»',
  resto.filas.every(f => !('impactoCorto' in f)));
check('y el bloque no cuenta alertas', !('conAlerta' in resto) && !('metricas' in resto));
check('ni aunque el jugador produzca muy por encima de su rol',
  !!factor && factor.perfil.pts / factor.perfil.min > 0.8 && !('alertas' in factor));
check('el motor de alertas no queda como código muerto',
  ['alertasDeImpacto', 'referenciasDeImpacto', 'referenciaImpacto', 'METRICAS_IMPACTO',
   'DELTA_IMPACTO', 'MAX_ALERTAS_IMPACTO'].every(k => !(k in S)),
  Object.keys(S).filter(k => /IMPACTO|Impacto/.test(k)).join(','));
check('ni en el fuente',
  !/function alertasDeImpacto|METRICAS_IMPACTO|referenciasDeImpacto/
    .test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));
/* =====================================================================
   3 bis. EL PISO DE LA TABLA · 5 minutos por partido
   ===================================================================== */
titulo('3 bis. MENOS DE 5 MIN/PJ · FUERA DE LA TABLA, SOLO SU NOMBRE AL PIE');

check('el piso es 5 minutos por partido', S.MIN_MINUTOS_TABLA_RESTO === 5);
check('es propio y NO el de los porcentajes del punto 4 (8 min)',
  S.MIN_MINUTOS_TABLA_RESTO !== require('./js/sgadd-partido.js').MIN_MINUTOS);
check('el de 0 minutos va a la nota', resto.pocosMinutos.map(x => x.nombre).join(',') === 'CERO, MINUTOS',
  resto.pocosMinutos.map(x => x.nombre).join(','));
check('la nota trae SOLO el nombre (y la clave): sin estadísticas ni etiquetas',
  resto.pocosMinutos.every(x => !('etiquetas' in x) && !('via' in x) && !('pts' in x) && !('adn' in x)));
check('el de 6 minutos sí tiene su fila', resto.filas.some(f => f.nombre === 'CORTO, MUESTRA'));
check('ninguno de la tabla promedia menos de 5', resto.filas.every(f => f.min >= 5));

/* El borde, justo: 5,0 queda en la tabla y 4,99 va a la nota. Se mueve el
   MIN de una fila del índice y se restaura: el perfil se arma en cada
   llamada, así que no hay caché que invalidar. */
const jCorto = (idx.liga.jugadoresPorEquipo.get('ATENAS A') || []).find(j => j['NOMBRES'] === 'CORTO, MUESTRA');
const minViejo = jCorto['MIN'];
jCorto['MIN'] = 5;
check('con 5,0 exactos se queda en la tabla',
  S.restoDelPlantel(idx, 'ATENAS A').filas.some(f => f.nombre === 'CORTO, MUESTRA'));
jCorto['MIN'] = 4.99;
const r499 = S.restoDelPlantel(idx, 'ATENAS A');
check('con 4,99 pasa a la nota',
  !r499.filas.some(f => f.nombre === 'CORTO, MUESTRA') && r499.pocosMinutos.some(x => x.nombre === 'CORTO, MUESTRA'));
check('y la nota respeta el orden del plantel, de más a menos minutos',
  r499.pocosMinutos.map(x => x.nombre).join(',') === 'CORTO, MUESTRA,CERO, MINUTOS',
  r499.pocosMinutos.map(x => x.nombre).join(','));
jCorto['MIN'] = '';
check('sin minutos cargados también va a la nota: no hay fila que armarle a un dato ausente',
  S.restoDelPlantel(idx, 'ATENAS A').pocosMinutos.some(x => x.nombre === 'CORTO, MUESTRA'));
jCorto['MIN'] = minViejo;
check('y restaurado vuelve a su fila', S.restoDelPlantel(idx, 'ATENAS A').filas.some(f => f.nombre === 'CORTO, MUESTRA'));

/* =====================================================================
   3 ter. SIN BADGE DE EFICIENCIA
   ===================================================================== */
titulo('3 ter. LA FILA NO LLEVA EL BADGE DE EFICIENCIA (PPP)');

check('ninguna fila trae eficiencia', resto.filas.every(f => !('eficiencia' in f)));
check('el motor del badge no queda como código muerto',
  !('eficienciaIndividual' in S) && !('muestraCorta' in S)
  && !/function eficienciaIndividual|function scoutChipEficiencia|SCOUT_BANDA_EFICIENCIA/
    .test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));

/* =====================================================================
   6 bis. LA VÍA DE GOL LÍDER Y LA EFICIENCIA
   ===================================================================== */
titulo('6 bis. LA VÍA DE GOL DE MAYOR VOLUMEN Y LA EFICIENCIA INDIVIDUAL');

const tiros = (o) => Object.assign({
  'PT2%': 0.42, 'PT3%': 0.35, 'PT1%': 0.10,
  T2C: 3, T2I: 6, T3C: 1, T3I: 3, T1C: 6, T1I: 8,
  'T2%': 0.50, 'T3%': 0.33, 'T1%': 0.75, PPT2: 1.00, PPT3: 1.00, PPT1: 0.75,
}, o || {});

/* LA CLAVE: dos libres son UN play. Con 8 intentos de libre contra 6 de
   doble, por intentos saldría «tirador de libres» un jugador que termina
   el 42% de sus plays en doble y el 10% en la línea. */
const vDoble = S.viaDeGolLider(tiros());
check('se elige por el PESO en sus plays, no por los intentos crudos',
  vDoble.id === 'T2' && vDoble.criterio === 'peso', JSON.stringify(vDoble));
check('con el par, el % y el PPT de ESA vía',
  vDoble.convertidos === 3 && vDoble.intentos === 6 && cerca(vDoble.pct, 0.5) && cerca(vDoble.ppt, 1));
check('el que termina sus plays de afuera sale tirador de triple',
  S.viaDeGolLider(tiros({ 'PT3%': 0.55, 'PT2%': 0.30 })).id === 'T3');
check('el que va a la línea de verdad sale de libres',
  S.viaDeGolLider(tiros({ 'PT1%': 0.50, 'PT2%': 0.30, 'PT3%': 0.20 })).id === 'T1');
const sinPeso = tiros(); delete sinPeso['PT2%']; delete sinPeso['PT3%']; delete sinPeso['PT1%'];
const vSinPeso = S.viaDeGolLider(sinPeso);
check('sin la columna de peso decide por intentos, y lo declara',
  vSinPeso.id === 'T1' && vSinPeso.criterio === 'intentos', JSON.stringify(vSinPeso));
check('con empate de peso desempatan los intentos',
  S.viaDeGolLider(tiros({ 'PT2%': 0.40, 'PT3%': 0.40, T2I: 6, T3I: 7 })).id === 'T3');
check('una vía sin un solo intento no compite aunque tenga peso',
  S.viaDeGolLider(tiros({ 'PT3%': 0.90, T3I: 0 })).id === 'T2');
check('sin ningún intento no hay vía que nombrar',
  S.viaDeGolLider(tiros({ T2I: 0, T3I: 0, T1I: 0 })) === null);

/* EL PAR VA POR PARTIDO, SIEMPRE: aunque el libro traiga el acumulado,
   se muestra el promedio. Es lo que se compara de un suplente a otro. */
const vConAcum = S.viaDeGolLider(tiros({ T2C: 1.2, T2I: 2.8, __acum: { T2C: 18, T2I: 35 } }));
check('los intentos son el PROMEDIO POR PARTIDO de la fila de promedios',
  cerca(vConAcum.convertidos, 1.2) && cerca(vConAcum.intentos, 2.8), JSON.stringify(vConAcum));
check('y el acumulado se ignora aunque exista',
  vConAcum.convertidos !== 18 && vConAcum.intentos !== 35 && !('total' in vConAcum));
check('el % es la tasa de la hoja de promedios, no el cociente del par redondeado',
  cerca(vConAcum.pct, 0.5) && !cerca(vConAcum.pct, 1.2 / 2.8));
check('sin la tasa en la hoja, se cae al cociente del par',
  cerca(S.viaDeGolLider(tiros({ 'T2%': '', T2C: 1.2, T2I: 2.8 })).pct, 1.2 / 2.8));
check('y el PPT es el de esa vía', cerca(vConAcum.ppt, 1));

check('las zonas salen de la MISMA tabla del tab Tiro',
  require('./js/sgadd-jugadores.js').ZONAS_TIRO.map(z => z.id).join(',') === 'T3,T2,T1'
  && /zonasTiro: m\.ZONAS_TIRO/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));

check('cada fila del resto trae su vía líder',
  resto.filas.filter(f => f.min > 0).every(f => f.via && f.via.id === 'T2'),
  resto.filas.map(f => f.nombre + ':' + (f.via && f.via.id)).join(' '));
check('y la muestra de la columna del jugador',
  factor.plays !== null && factor.pts === 9 && cerca(factor.usg, 0.2));

/* =====================================================================
   7. LOS DADOS DE BAJA
   ===================================================================== */
titulo('7. UN DADO DE BAJA NO ENTRA AL BLOQUE');

/* Se da de baja a uno de los OCHO de arriba: el corte tiene que correrse
   en los dos bloques a la vez. Si cada uno ordenara por su cuenta, el
   noveno saldría duplicado o no saldría en ninguno. */
global.SGADD_BUZON = { enPlan: (nombre) => nombre !== 'OCHO, ROTACION' };
const sinBaja = S.restoDelPlantel(idx, 'ATENAS A');
const claveSinBaja = S.jugadoresClave(idx, 'ATENAS A', null, {});
check('el dado de baja no entra a ninguno de los dos bloques',
  !sinBaja.filas.some(f => f.nombre === 'OCHO, ROTACION')
  && !claveSinBaja.filas.some(f => f.nombre === 'OCHO, ROTACION'));
check('y el corte se corre: el noveno por minutos sube a la tabla de arriba',
  claveSinBaja.filas.some(f => f.nombre === 'GRIS, SUPLENTE')
  && !sinBaja.filas.some(f => f.nombre === 'GRIS, SUPLENTE'),
  sinBaja.filas.map(f => f.nombre).join(','));
check('el plantel sigue repartido entero, sin duplicados',
  claveSinBaja.filas.length + sinBaja.filas.length + sinBaja.pocosMinutos.length === 13);
delete global.SGADD_BUZON;

/* =====================================================================
   8. EL INFORME LO TRAE
   ===================================================================== */
titulo('8. EL INFORME PRE-PARTIDO LO TRAE ARMADO');

const inf = S.informePrePartido(idx, 'ATENAS A', 'PLATENSE A', { claveRival: 'ATENAS A' });
check('el informe sale', inf.ok === true, inf.motivo);
check('y trae el resto del plantel del equipo scouteado',
  !!inf.restoRival && inf.restoRival.clave === 'ATENAS A' && inf.restoRival.filas.length === 5
  && inf.restoRival.pocosMinutos.length === 1,
  inf.restoRival && inf.restoRival.filas.length);
check('con el mismo corte que su tabla de jugadores clave',
  inf.restoRival.filas.every(f => !inf.jugadoresRival.filas.some(c => c.clave === f.clave)));

/* =====================================================================
   9. LA MATRIZ DE BLOQUES
   ===================================================================== */
titulo('9. LA FICHA POR JUGADOR ES DEL PLAN ORO');

const ses = (plan) => ({ email: 'cliente@ejemplo.com', equipoAsignado: 'ATENAS A', plan: plan });

check('el bloque está declarado en la matriz, no en un `if` del render',
  !!A.BLOQUES['scouting.fichas'] && A.BLOQUES['scouting.fichas'].plan === 'ORO');
check('y la clave nombra la sección y el `data-bloque` del DOM',
  A.BLOQUES['scouting.fichas'].seccion === 'scouting');
check('un ORO la ve', A.tieneBloque('scouting.fichas', ses('ORO')));
check('un PLATA no', !A.tieneBloque('scouting.fichas', ses('PLATA')));
check('un BRONCE tampoco', !A.tieneBloque('scouting.fichas', ses('BRONCE')));
check('el admin sí', A.tieneBloque('scouting.fichas', { email: 'freytesgn@gmail.com' }));
/* ABIERTO es el que entra sin sesión: ve todo, igual que antes de que
   existiera el módulo de permisos (punto 19). */
check('y el que entra sin sesión también', A.tieneBloque('scouting.fichas', null));

/* EL PLATA NO PIERDE EL RESTO DEL INFORME: lo que se acota es el bloque,
   no la pantalla. */
check('el PLATA sigue entrando a Scouting', A.puedoAcceder('scouting', ses('PLATA')).ok);
check('el BRONCE sigue sin entrar', !A.puedoAcceder('scouting', ses('BRONCE')).ok);

const veredicto = A.puedoVerBloque('scouting.fichas', ses('PLATA'));
check('el veredicto trae el motivo y el plan que lo incluye',
  veredicto.ok === false && veredicto.motivo === 'REQUIERE_PLAN' && veredicto.plan === 'ORO',
  JSON.stringify(veredicto));
check('un bloque que nadie declaró se trata como abierto',
  A.tieneBloque('scouting.inventado', ses('BRONCE')));

/* HEREDA LA SECCIÓN: para ver un bloque hay que poder entrar a su
   pantalla. Con un BRONCE el bloque cae por la sección, no por el plan. */
check('y hereda la regla de su sección',
  !A.tieneBloque('scouting.fichas', ses('BRONCE')) && !A.tieneModulo('scouting', ses('BRONCE')));

/* EL MAPA VA POR ID COMPLETO: viaja en el `alcance` de los DATOS de una
   categoría, que no son de ninguna sección, así que con claves cortas el
   que lo lee tendría que saber de dónde vino. */
check('`bloquesVigentes` los resuelve para la respuesta del servidor',
  JSON.stringify(A.bloquesVigentes(ses('PLATA'))) === '{"scouting.fichas":false}'
  && JSON.stringify(A.bloquesVigentes(ses('ORO'))) === '{"scouting.fichas":true}',
  JSON.stringify(A.bloquesVigentes(ses('PLATA'))));
check('y los nombra con la sección adelante, como el gate',
  Object.keys(A.bloquesVigentes(ses('ORO'))).every(k => !!A.BLOQUES[k]));

/* LA COMPARACIÓN POR ORDEN VIVE EN UNA SOLA FUNCIÓN: las dos matrices la
   usan y dos copias terminan distintas (punto 8). */
check('el alias viejo MASTER también alcanza ORO', A.alcanzaPlan('ORO', ses('MASTER')));
check('y PRO no', !A.alcanzaPlan('ORO', ses('PRO')));
const fuenteAuth = fs.readFileSync('./js/sgadd-auth.js', 'utf8');
check('la comparación de planes no está duplicada',
  (fuenteAuth.match(/ORDEN_PLAN\[normalizarPlan/g) || []).length === 2,
  (fuenteAuth.match(/ORDEN_PLAN\[normalizarPlan/g) || []).length);

/* =====================================================================
   10. EL SERVIDOR DECIDE
   ===================================================================== */
titulo('10. EL SERVIDOR DECLARA LO QUE CONCEDE EL PLAN EFECTIVO');

const srv = fs.readFileSync('./server/api/handlers.js', 'utf8');
const cuerpoScout = srv.slice(srv.indexOf('async function manejarScouting'),
                             srv.indexOf('function fallaDeDatos'));
const cuerpoEquipos = srv.slice(srv.indexOf('async function manejarEquipos'),
                                srv.indexOf('async function manejarScouting'));
/* VA CON LOS DATOS, no solo en `/scouting`: el panel pide el libro por
   `/equipos` y arma el informe en el navegador, así que declarado en el
   otro endpoint el mapa no tenía quién lo lea — medido en producción,
   llegaba `null`. */
check('los datos declaran `alcance.bloques`',
  /bloques: AUTH\.bloquesVigentes\(/.test(cuerpoEquipos));
check('medidos con el plan EFECTIVO del catálogo, no con el del token',
  /bloquesVigentes\(Object\.assign\(\{\}, ctx\.sesion, \{ plan: planVigente \}\)\)/.test(cuerpoEquipos));
check('y el scouting declara el mismo mapa',
  /bloques: AUTH\.bloquesVigentes\(sesionEfectiva\)/.test(cuerpoScout));
check('la copia vendorizada del motor trae la matriz',
  /scouting\.fichas/.test(fs.readFileSync('./server/lib/compartido/sgadd-auth.js', 'utf8')));

/* =====================================================================
   11. LA PANTALLA · se EJERCE, no se lee
   ===================================================================== */
titulo('11. LA PANTALLA · el bloque se pinta y el gate se aplica');

function pantalla(alcance) {
  const esc = (x) => String(x === null || x === undefined ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const ctx = {
    console, JSON, Object, Array, Math, Number, String, Date, isFinite, Map, Set, WeakMap,
    require, module: { exports: {} },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    escapeHtml: esc, escapeAttr: esc,
    SGADD: global.SGADD,
    SGADD_AUTH: A,
    SGADD_UI: { pedirPlan: (p) => '<a class="cta">Pedir el Plan ' + esc(p) + '</a>', escJs: esc },
    SGADD_APP: { estado: { alcance: alcance || null } },
    jugadoresBadges: J.jugadoresBadges,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-scouting.js'), 'utf8'), ctx);
  return ctx;
}

const P = pantalla({ plan: 'ORO', bloques: { 'scouting.fichas': true } });
const html = vm.runInContext('scoutBloqueResto', P)({ restoRival: resto });

check('el bloque se pinta con su `data-bloque`', /data-bloque="resto"/.test(html));
check('y abre hoja en el PDF, como las fichas', /scout-pagina/.test(html));
check('nombra a los de la tabla y a los de la nota',
  resto.filas.concat(resto.pocosMinutos).every(f => html.indexOf(f.nombre) !== -1));
check('con su función en cancha', html.indexOf(factor.rol.label) !== -1);
check('y sus etiquetas del ADN', html.indexOf(factor.etiquetas[0].texto.replace('~ ', '')) !== -1);
/* SIN ALERTAS EN LA VISTA: ni chips, ni ⚡, ni tooltips de rol. */
check('no se pinta ningún chip de alerta', !/badge-impacto/.test(html));
check('ni el ⚡ ni la marca de alto impacto',
  !/⚡/.test(html) && !/Alto impacto/.test(html));
check('ni un tooltip que compare contra la mediana del rol',
  !/mediana de los que califican/.test(html) && !/vs su rol/.test(html) && !/sobre su rol/.test(html));
check('ni el conteo de alertas en el encabezado', !/alerta/i.test(html));
check('el encabezado dice que la vía va en promedio por partido',
  /promedio por\s+partido/.test(html));
check('ni el badge de eficiencia: ningún PPP en todo el bloque', !/PPP/.test(html));

/* --- LA NOTA DE POCOS MINUTOS · solo nombres, al pie --- */
const nota = (html.match(/<p class="scout-resto-nota[\s\S]*?<\/p>/) || [''])[0];
const notaTexto = nota.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
check('la nota va al pie, después de la tabla',
  !!nota && html.indexOf(nota) > html.lastIndexOf('</table>'));
check('dice cuántos son y lista los nombres, en singular con uno',
  notaTexto === '1 jugador promedia menos de 5 min: CERO, MINUTOS.', notaTexto);
check('sin estadísticas, etiquetas ni badges',
  !/PJ|PLAYS|PTS|USG|🎯|PPT|rounded-full|title=/.test(nota), nota);
check('el de la nota no tiene fila en la tabla',
  !(html.match(/<tr class="scout-resto[\s\S]*?<\/tr>/g) || []).some(tr => tr.indexOf('CERO, MINUTOS') !== -1));

const notaVarios = vm.runInContext('scoutNotaPocosMinutos', P)(
  [{ nombre: 'UNO, A' }, { nombre: 'DOS, B' }, { nombre: '<b>TRES</b>, C' }]);
const notaVariosTexto = notaVarios.replace(/<span[^>]*>|<\/span>|<p[^>]*>|<\/p>/g, '').replace(/\s+/g, ' ').trim();
check('en plural con varios, y la lista en castellano: «A, B y C»',
  notaVariosTexto === '3 jugadores promedian menos de 5 min: UNO, A, DOS, B y &lt;b&gt;TRES&lt;/b&gt;, C.',
  notaVariosTexto);
check('los nombres se escapan: salen de una celda de la planilla', notaVarios.indexOf('<b>TRES') === -1);
check('sin nadie por debajo de 5, no hay nota', vm.runInContext('scoutNotaPocosMinutos', P)([]) === '');

const soloNota = vm.runInContext('scoutBloqueResto', P)(
  { restoRival: { equipo: 'ATENAS A', clave: 'ATENAS A', filas: [], pocosMinutos: [{ nombre: 'UNO, A' }] } });
check('si todos están por debajo de 5, sale la nota sin tabla vacía',
  /scout-resto-nota/.test(soloNota) && !/<table/.test(soloNota));

/* --- LA TABLA COMPACTA · dos columnas, una fila por jugador --- */
const trs = html.match(/<tr class="scout-resto[\s\S]*?<\/tr>/g) || [];
check('es una TABLA y no tarjetas', /<table/.test(html) && !/<article/.test(html));
check('dentro de un scrollbox, como toda tabla del panel', /class="scrollbox"><table/.test(html));
check('con dos encabezados: jugador y perfil',
  (html.match(/<th[\s>]/g) || []).length === 2
  && /Jugador · muestra · vía de gol líder/.test(html) && /Perfil · ADN/.test(html));
check('una fila por jugador del resto', trs.length === resto.filas.length, trs.length);
check('y cada fila tiene exactamente dos celdas',
  trs.every(tr => (tr.match(/<td[\s>]/g) || []).length === 2));

const filaX = trs.filter(tr => tr.indexOf('FACTOR, X') !== -1)[0] || '';
const [celdaJug, celdaPerfil] = filaX.split(/<\/td>/);
check('la columna del jugador trae la muestra: PJ · MIN · PLAYS · PTS · USG',
  /3 PJ/.test(celdaJug) && /MIN/.test(celdaJug) && /PLAYS/.test(celdaJug)
  && /PTS/.test(celdaJug) && /USG/.test(celdaJug), celdaJug.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
const F = global.SGADD.formatear;
check('la vía de gol líder con su par por partido, su % y su PPT',
  /🎯 Doble/.test(celdaJug) && celdaJug.indexOf(F('T2C', 3) + '/' + F('T2I', 6) + ' x PJ') !== -1
  && celdaJug.indexOf(F('T2%', 0.5)) !== -1 && celdaJug.indexOf(F('PPT2', 1) + ' PPT') !== -1,
  celdaJug.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
check('y nada más: ni badge de eficiencia ni alertas',
  !/PPP|badge-impacto|⚡|vs su rol/.test(celdaJug));
/* La celda del jugador lleva exactamente nombre, muestra y vía: su texto
   arranca en el nombre y TERMINA en el PPT de la vía. Se mide por el
   contenido y no por la sangría del template, que es un ancla frágil
   (punto 51). */
const textoJug = celdaJug.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
check('la columna del jugador es nombre · muestra · vía, y termina ahí',
  textoJug.indexOf('FACTOR, X') === 0 && textoJug.slice(-(F('PPT2', 1) + ' PPT').length) === F('PPT2', 1) + ' PPT',
  textoJug);
check('la columna del perfil lleva las etiquetas, la función en cancha incluida',
  celdaPerfil.indexOf(factor.rol.label) !== -1
  && factor.etiquetas.every(b => celdaPerfil.indexOf(b.texto.replace('~ ', '')) !== -1));
check('y la función en cancha no se repite en la columna del jugador',
  celdaJug.indexOf(factor.rol.label) === -1);
check('conserva el ~ del que no califica, que lo trae el badge',
  celdaPerfil.indexOf('~ ' + factor.rol.label) !== -1);

/* Un jugador sin un solo lanzamiento no inventa una vía. */
const sinTiros = vm.runInContext('scoutViaLider', P)(null);
check('sin lanzamientos la fila lo dice, en vez de un «0/0»',
  /Sin lanzamientos registrados/.test(sinTiros) && !/0\/0/.test(sinTiros));
/* Aunque el libro traiga el acumulado, la fila pinta el PROMEDIO. */
const viaProm = vm.runInContext('scoutViaLider', P)(S.viaDeGolLider(Object.assign(
  { __acum: { T2C: 18, T2I: 35 } },
  { 'PT2%': 0.5, 'PT3%': 0.3, 'PT1%': 0.1, T2C: 1.2, T2I: 2.8, 'T2%': 0.43, T3I: 1, T1I: 1, PPT2: 0.86 })));
check('con acumulado la fila pinta igual el promedio por partido, rotulado «x PJ»',
  viaProm.indexOf(F('T2C', 1.2) + '/' + F('T2I', 2.8) + ' x PJ') !== -1 && viaProm.indexOf('18/35') === -1,
  viaProm.replace(/\s+/g, ' '));
check('con su % y su PPT',
  viaProm.indexOf(F('T2%', 0.43)) !== -1 && viaProm.indexOf(F('PPT2', 0.86) + ' PPT') !== -1);
check('sin resto no se pinta nada', vm.runInContext('scoutBloqueResto', P)({ restoRival: null }) === '');

/* --- El gate de las fichas, ejercido en los dos sentidos --- */
const infUI = { jugadoresRival: { filas: clave.filas } };
const conOro = vm.runInContext('scoutBloqueFichas', P)(infUI);
check('con ORO, la ficha por jugador se pinta entera',
  /data-bloque="fichas"/.test(conOro) && /Ficha de análisis por jugador/.test(conOro));

const Pp = pantalla({ plan: 'PLATA', bloques: { 'scouting.fichas': false } });
const conPlata = vm.runInContext('scoutBloqueFichas', Pp)(infUI);
check('con PLATA sale la card de venta y NO la ficha',
  /scoutFichasBloqueadas/.test(conPlata) && !/data-bloque="fichas"/.test(conPlata));
check('que dice qué plan la incluye', /Plan Oro/.test(conPlata), conPlata.slice(0, 160));
check('y ofrece cómo pedirlo', /class="cta"/.test(conPlata));
check('no entra al PDF: es un cartel comercial, no contenido del informe',
  /no-imprimir/.test(conPlata));
check('y no filtra una sola línea de la ficha',
  clave.filas.every(f => conPlata.indexOf(f.nombre) === -1));

/* El modal de exportación no puede ofrecer lo que no se pinta. */
const cardsOro = vm.runInContext('scoutCardsVisibles', P)();
const cardsPlata = vm.runInContext('scoutCardsVisibles', Pp)();
check('el modal ofrece las fichas con ORO', cardsOro.some(c => c.id === 'fichas'));
check('y no las ofrece con PLATA', !cardsPlata.some(c => c.id === 'fichas'),
  cardsPlata.map(c => c.id).join(','));
check('el resto del plantel sí se ofrece en los dos',
  cardsOro.some(c => c.id === 'resto') && cardsPlata.some(c => c.id === 'resto'));
check('y el orden del modal es el del informe',
  cardsOro.map(c => c.id).join(',') === 'encabezado,matriz,ciclo,marcas,resumen,jugadores,resto,claves,fichas',
  cardsOro.map(c => c.id).join(','));

/* MANDA EL SERVIDOR: su declaración le gana al plan que tenga guardado
   el navegador, que puede ser el de un link viejo (punto 55). */
const Pmix = pantalla({ plan: 'ORO', bloques: { 'scouting.fichas': false } });
check('la declaración del servidor le gana a la sesión local',
  !vm.runInContext('scoutPuedeBloque', Pmix)('scouting.fichas'));
const Psin = pantalla(null);
check('sin backend decide el motor local con la sesión que haya',
  vm.runInContext('scoutPuedeBloque', Psin)('scouting.fichas'));

/* --- El CSS del chip va a mano: es un nodo inyectado (punto 12) --- */
const idxHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
check('el CSS del chip de alerta se fue con la vista',
  !/badge-impacto/.test(idxHtml));
check('y las filas del resto no se cortan al medio en el papel',
  /html\.modo-scout-print \.scout-resto/.test(idxHtml));
check('la tabla va con layout fijo en el papel: los chips no estiran la columna del jugador',
  /html\.modo-scout-print \[data-bloque="resto"\] table \{[^}]*table-layout: fixed/.test(idxHtml));
check('y no queda la regla de grilla de las tarjetas viejas',
  !/\[data-bloque="resto"\] \.grid/.test(idxHtml));

/* =====================================================================
   12. LA LANDING PROMETE LO QUE EL GATE CONCEDE
   ===================================================================== */
titulo('12. LA CARD DEL PLAN ORO NOMBRA EL BLOQUE');

global.SGADD_AUTH = A;
const LAN = require('./js/sgadd-landing.js');
const cards = LAN.planes();
const tit = LAN.BLOQUES['scouting.fichas'].titulo;

check('Oro lo suma', cards[2].suma.some(x => x.titulo === tit),
  cards[2].suma.map(x => x.titulo).join(','));
check('Plata lo muestra como lo que le falta', cards[1].falta.some(x => x.titulo === tit));
check('Bronce también', cards[0].falta.some(x => x.titulo === tit));
check('y Oro no tiene nada bloqueado', cards[2].falta.length === 0,
  cards[2].falta.map(x => x.titulo).join(','));
check('Plata sigue sumando Scouting y nada más',
  cards[1].suma.filter(x => !x.servicio && !x.bloque).map(x => x.titulo).join(',') === 'Scouting',
  cards[1].suma.map(x => x.titulo).join(','));

/* NO SE ESCRIBE A MANO: la card lee la matriz del motor, igual que con
   las secciones. Si el bloque cambia de plan, la card cambia sola. */
let mentiras = [];
['BRONCE', 'PLATA', 'ORO'].forEach((plan, i) => {
  const concede = A.tieneBloque('scouting.fichas', ses(plan));
  const promete = cards[i].suma.concat(
    ['PLATA', 'ORO'].indexOf(plan) !== -1 && LAN.alcanzaBloque(LAN.ANTERIOR[plan], 'scouting.fichas')
      ? [{ titulo: tit }] : []).some(x => x.titulo === tit);
  if (concede !== promete) mentiras.push(plan + ' gate=' + concede + ' card=' + promete);
});
check('ninguna card promete el bloque que el gate le niega', mentiras.length === 0, mentiras.join(' · '));
check('un bloque sin copia en la landing no se ofrece',
  LAN.idsDeBloques().every(id => !!LAN.BLOQUES[id]));

console.log('\n' + '═'.repeat(70));
if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
