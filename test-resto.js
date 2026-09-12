/* =====================================================================
   EL RESTO DEL PLANTEL Y LA FICHA DEL PLAN ORO

   Dos cosas que entraron juntas al informe pre-partido y se testean
   juntas porque comparten el bloque 7:

     · el RESTO DEL PLANTEL — los que no entran al análisis principal,
       con sus etiquetas y una alerta cuando destacan sobre su rol;
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

check('el bloque existe y trae a los seis que no entraron',
  !!resto && resto.filas.length === 6, resto && resto.filas.length);
check('la tabla de arriba se queda con los ocho de siempre',
  clave.filas.length === S.TOP_JUGADORES, clave.filas.length);
check('ninguno sale en los dos bloques',
  resto.filas.every(f => !clave.filas.some(c => c.clave === f.clave)));
check('y entre los dos está el plantel entero',
  clave.filas.length + resto.filas.length === 14);
check('el resto va ordenado por minutos, de mayor a menor',
  resto.filas.map(f => f.min).join(',') === '12,10,10,10,6,0',
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
const cero = resto.filas.find(f => f.nombre === 'CERO, MINUTOS');
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
check('el de cero minutos entra igual, con sus etiquetas',
  !!cero && cero.etiquetas.length > 0 && cero.min === 0);

/* =====================================================================
   3. LAS ALERTAS DE IMPACTO
   ===================================================================== */
titulo('3. LAS ALERTAS · destacar sobre la mediana de su rol');

check('el factor X dispara una alerta', factor.alertas.length === 1,
  factor.alertas.map(a => a.texto).join(' · '));
check('y es la de puntos por minuto', factor.alertas[0].id === 'ptsMin', factor.alertas[0].id);
check('con el número que la justifica: 0,90 contra 0,50',
  cerca(factor.alertas[0].valor, 0.9, 1e-9) && cerca(factor.alertas[0].referencia, 0.5, 1e-9),
  factor.alertas[0].valor + ' / ' + factor.alertas[0].referencia);
check('el texto trae el porcentaje, la métrica y los dos valores',
  /\+80% en PTS\/min sobre su rol \(0,90 contra 0,50\)/.test(factor.alertas[0].texto),
  factor.alertas[0].texto);
check('el suplente de tasas normales NO dispara nada', gris.alertas.length === 0,
  gris.alertas.map(a => a.texto).join(' · '));
check('el de cero minutos tampoco: sin minutos no hay tasa', cero.alertas.length === 0);

/* LA PRUEBA QUE SOSTIENE EL BLOQUE: los minutos NO deciden. Un suplente
   con las mismas tasas que un titular tiene que dar exactamente lo
   mismo, y por eso `GRIS` (12 min) no dispara: si la comparación fuera
   por partido, dispararía al revés — todos los titulares contra él. */
check('la comparación es por TASA y no por partido',
  gris.alertas.length === 0 && cerca(gris.perfil.pts / gris.perfil.min, 0.5, 1e-9),
  gris.perfil.pts + ' pts en ' + gris.perfil.min + ' min');

check('`RO%`/`RD%` quedan afuera: su denominador es del equipo, no del jugador',
  cristal.alertas.length === 0, cristal.alertas.map(a => a.texto).join(' · '));
check('y ninguna métrica del bloque las lee',
  S.METRICAS_IMPACTO.every(m => m.valor({ rebote: 9, reboteDef: 9, min: 10 }) === null
    || m.id !== 'roPct'),
  S.METRICAS_IMPACTO.map(m => m.id).join(','));
check('los rebotes entran POR MINUTO, que es la pregunta que se quería hacer',
  S.METRICAS_IMPACTO.some(m => m.id === 'rtMin'));

/* La mediana de `PR` es 0 en toda la liga: no sirve de denominador y no
   puede producir un "+∞%". */
check('una mediana de CERO no dispara una alerta infinita',
  factor.alertas.every(a => a.id !== 'prMin') && resto.filas.every(f => f.alertas.every(a => isFinite(a.delta))));

const refs = S.referenciasDeImpacto(idx);
check('la referencia de `PR/min` se descarta por valer cero',
  S.referenciaImpacto(refs, 'slasher', 'prMin') === null);

/* =====================================================================
   4. LA CASCADA DE LA REFERENCIA
   ===================================================================== */
titulo('4. LA REFERENCIA · rol → liga, y se dice cuál se usó');

check('el pool del rol son los CALIFICADOS de esa función',
  refs.porRol.slasher && refs.porRol.slasher.ptsMin.n >= S.MIN_PARES_ROL,
  refs.porRol.slasher && refs.porRol.slasher.ptsMin.n);
check('la alerta del factor X salió de su rol', factor.alertas[0].nivel === 'rol');
check('y lo dice con todas las letras', factor.alertas[0].nivelLabel === 'su rol'
  && /mediana de los que califican/.test(factor.alertas[0].nivelDetalle));

check('el interior sin pares en la liga degrada a la liga entera',
  pivot.alertas.length > 0 && pivot.alertas[0].nivel === 'liga',
  pivot.rol.id + ' · ' + pivot.alertas.map(a => a.nivel).join(','));
check('y la degradación se declara, no se calla',
  /su rol no llegó a 3 jugadores/.test(pivot.alertas[0].nivelDetalle),
  pivot.alertas[0].nivelDetalle);
check('el rol del solitario no tiene calificados',
  !refs.porRol[pivot.rol.id] || refs.porRol[pivot.rol.id].ptsMin.n < S.MIN_PARES_ROL,
  pivot.rol.id);

/* =====================================================================
   5. LA MUESTRA CORTA Y EL TOPE
   ===================================================================== */
titulo('5. LA MUESTRA SE MARCA, NO SE BORRA');

check('una noche sola dispara igual', corto.alertas.length > 0);
check('pero la alerta queda marcada', corto.alertas[0].muestraCorta === true);
check('y el texto lo dice con el ~ de siempre', corto.alertas[0].texto.indexOf('~ ') === 0,
  corto.alertas[0].texto);
check('los pisos salen de donde ya viven (punto 4), no copiados',
  S.MIN_PJ_IMPACTO === require('./js/sgadd-partido.js').MIN_PARTIDOS_JUGADOR
  && S.MIN_MIN_IMPACTO === require('./js/sgadd-partido.js').MIN_MINUTOS);
check('la del factor X no está marcada: 3 partidos y 10 minutos',
  factor.alertas[0].muestraCorta === false);

/* Tope de dos: el bloque existe para NO saturar. */
const multi = S.alertasDeImpacto(
  { min: 10, pts: 9, usg: 0.9, efg: 0.99, ro: 5, rd: 5, ast: 5, pr: 5 }, 3, refs, 'slasher');
check('nunca más de dos alertas por jugador', multi.length === S.MAX_ALERTAS_IMPACTO, multi.length);
check('y salen ordenadas de mayor a menor diferencia',
  multi[0].delta >= multi[1].delta, multi.map(a => a.id + ' ' + a.delta.toFixed(2)).join(' · '));

/* =====================================================================
   6. EL FACTOR X
   ===================================================================== */
titulo('6. «ALTO IMPACTO EN POCOS MINUTOS»');

check('el que destaca sin llegar a la banda de los que juegan queda marcado',
  factor.impactoCorto === true);
check('el que no destaca, no', gris.impactoCorto === false);
check('el bloque cuenta cuántos traen alerta', resto.conAlerta === 3, resto.conAlerta);

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

/* LOS INTENTOS VAN TOTALES con el acumulado: es la muestra que se quería
   mostrar. Y el % sale del MISMO par. */
const vTotal = S.viaDeGolLider(tiros({ __acum: { T2C: 18, T2I: 35 } }));
check('con acumulado, los intentos cargados son los TOTALES',
  vTotal.total === true && vTotal.convertidos === 18 && vTotal.intentos === 35, JSON.stringify(vTotal));
check('y el % sale del mismo par que se muestra', cerca(vTotal.pct, 18 / 35));
check('sin acumulado van por partido, marcados como tales',
  vDoble.total === false && vDoble.intentos === 6);
check('un acumulado sin esa vía no inventa un total',
  S.viaDeGolLider(tiros({ __acum: { T3C: 5, T3I: 9 } })).total === false);

check('las zonas salen de la MISMA tabla del tab Tiro',
  require('./js/sgadd-jugadores.js').ZONAS_TIRO.map(z => z.id).join(',') === 'T3,T2,T1'
  && /zonasTiro: m\.ZONAS_TIRO/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));

check('cada fila del resto trae su vía líder',
  resto.filas.filter(f => f.min > 0).every(f => f.via && f.via.id === 'T2'),
  resto.filas.map(f => f.nombre + ':' + (f.via && f.via.id)).join(' '));
check('y la muestra de la columna del jugador',
  factor.plays !== null && factor.pts === 9 && cerca(factor.usg, 0.2));

/* LA EFICIENCIA · PPP en su banda contra la liga, con el ~ de siempre. */
const idxEf = { liga: { distribucionesJ: { PPP: [0.8, 0.9, 1.0, 1.1, 1.2] } } };
const efAlta = S.eficienciaIndividual(idxEf, { ppp: 1.3, min: 20 }, 5);
check('la eficiencia es el PPP ubicado en su banda contra la liga',
  efAlta.metrica === 'PPP' && efAlta.banda && efAlta.banda.id === 'elite', JSON.stringify(efAlta));
check('con muestra suficiente no lleva ~', efAlta.muestraCorta === false);
check('con pocos minutos sí', S.eficienciaIndividual(idxEf, { ppp: 1.3, min: 5 }, 5).muestraCorta === true);
check('y con pocos partidos también', S.eficienciaIndividual(idxEf, { ppp: 1.3, min: 20 }, 2).muestraCorta === true);
check('por debajo de la liga cae en su banda baja',
  S.eficienciaIndividual(idxEf, { ppp: 0.7, min: 20 }, 5).banda.id === 'fuga');
check('sin PPP no hay badge', S.eficienciaIndividual(idxEf, { min: 20 }, 5) === null);
check('en la fixture la liga no tiene dispersión: banda nula, no inventada',
  factor.eficiencia && factor.eficiencia.banda === null);
check('la muestra corta es UNA sola regla para alertas y eficiencia',
  (fs.readFileSync('./js/sgadd-scouting.js', 'utf8').match(/MIN_MIN_IMPACTO;?\s*\n?/g) || []).length >= 1
  && /const corta = muestraCorta\(min, pj\)/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));

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
  claveSinBaja.filas.length + sinBaja.filas.length === 13);
delete global.SGADD_BUZON;

/* =====================================================================
   8. EL INFORME LO TRAE
   ===================================================================== */
titulo('8. EL INFORME PRE-PARTIDO LO TRAE ARMADO');

const inf = S.informePrePartido(idx, 'ATENAS A', 'PLATENSE A', { claveRival: 'ATENAS A' });
check('el informe sale', inf.ok === true, inf.motivo);
check('y trae el resto del plantel del equipo scouteado',
  !!inf.restoRival && inf.restoRival.clave === 'ATENAS A' && inf.restoRival.filas.length === 6,
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
check('nombra a los seis', resto.filas.every(f => html.indexOf(f.nombre) !== -1));
check('con su función en cancha', html.indexOf(factor.rol.label) !== -1);
check('y sus etiquetas del ADN', html.indexOf(factor.etiquetas[0].texto.replace('~ ', '')) !== -1);
check('la alerta sale como chip, con su clase propia', /badge-impacto/.test(html));
check('lleva el ⚡ además del color (punto 14)', /⚡/.test(html));
check('se puede leer con el teclado, no solo con el mouse', /tabindex="0"/.test(html));
check('y el tooltip dice contra qué muestra se midió',
  /title="[^"]*mediana de los que califican[^"]*"/.test(html));
check('el factor X sale marcado como alto impacto en pocos minutos',
  /Alto impacto en pocos minutos/.test(html));
check('el encabezado dice cuántos traen alerta', /3 con alerta de impacto/.test(html));

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
check('el badge de eficiencia individual', celdaJug.indexOf('PPP ' + F('PPP', 1)) !== -1);
check('la alerta en su texto CORTO en la fila', celdaJug.indexOf('+80% PTS/min vs su rol') !== -1);
check('y el número que la justifica, en el title',
  /title="[^"]*\(0,90 contra 0,50\)[^"]*"/.test(celdaJug));
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
/* Con acumulado el par es TOTAL y no lleva el «x PJ». */
const viaTotal = vm.runInContext('scoutViaLider', P)(S.viaDeGolLider(Object.assign(
  { __acum: { T2C: 18, T2I: 35 } }, { 'PT2%': 0.5, 'PT3%': 0.3, 'PT1%': 0.1, T2C: 1.5, T2I: 2.9, T3I: 1, T1I: 1, PPT2: 1.03 })));
check('con acumulado el par es TOTAL y no lleva el «x PJ»',
  viaTotal.indexOf('18/35') !== -1 && viaTotal.indexOf('x PJ') === -1, viaTotal.replace(/\s+/g, ' '));
check('y explica que la comparación es por minuto',
  /por minuto/.test(html) && /misma función/.test(html));
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
check('la clase del chip está en el <style>', /\.badge-impacto\s*\{/.test(idxHtml));
check('con su regla de @media print: el aplanado se la comería',
  /body \.badge-impacto/.test(idxHtml));
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
