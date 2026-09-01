/* =====================================================================
   SGADD · LA ACUMULACIÓN ENTRE TRAMOS · suite de regresión

       node test-acumulacion.js

   EL BUG QUE ESTA SUITE EXISTE PARA QUE NO VUELVA.

   `ACUMULADO J` trae UNA FILA POR TORNEO. El índice hacía
   `porClave.set(k, datos)`, o sea que en un tramo con dos torneos la
   segunda fila BORRABA a la primera: el acumulado de un jugador quedaba
   siendo el de un torneo suelto.

   Medido en producción con DEPORTIVO · GARCÍA ARAGON, NAHUEL:

     IDA       9 PJ · 139 PTS · 36/68 T2
     VUELTA    3 PJ ·  45 PTS ·  8/15 T2
     esperado 12 PJ · 184 PTS · 44/83 T2
     `__acum`  3 PJ ·  45 PTS          ← solo la VUELTA

   Y el modo de fallar era el peor: el PROMEDIO del TOTAL estaba bien
   —12 PJ, 15,3 PTS— así que la pantalla mostraba el número correcto hasta
   que alguien tocaba «Totales». Un total de 45 puntos sobre 3 partidos se
   lee como un jugador de rotación, no como un error.

   Los números de las fixtures son los REALES del caso reportado: si algún
   día se «arregla» con una fórmula que da otra cosa, esto lo canta.
   ===================================================================== */
'use strict';

const NL = '\n';
const SGADD = require('./js/sgadd-core.js');

let ok = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); }
};
const titulo = (t) => console.log(NL + t + NL + '─'.repeat(70));

/* =====================================================================
   LA FIXTURE · el caso reportado, con sus números
   ===================================================================== */

const COLS_AJ = ['NOMBRES', 'EQUIPO', 'FASE', 'TORNEO', 'PJ', 'MIN', 'PTS',
  'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I', 'TCC', 'TCI', 'RO', 'RD', 'RT',
  'AST', 'PR', 'PP', 'AST-PP', 'FC', 'FR'];

const IDA = { NOMBRES: 'GARCÍA ARAGON, NAHUEL', EQUIPO: "DEPORTIVO LA PLATA - MM",
  FASE: 'REGULAR', TORNEO: 'IDA', PJ: 9, MIN: 250, PTS: 139,
  T2C: 36, T2I: 68, T3C: 12, T3I: 40, T1C: 31, T1I: 44, TCC: 48, TCI: 108,
  RO: 9, RD: 27, RT: 36, AST: 27, PR: 12, PP: 18, 'AST-PP': 1.5, FC: 22, FR: 30 };

const VUELTA = { NOMBRES: 'GARCÍA ARAGON, NAHUEL', EQUIPO: "DEPORTIVO LA PLATA - MM",
  FASE: 'REGULAR', TORNEO: 'VUELTA', PJ: 3, MIN: 80, PTS: 45,
  T2C: 8, T2I: 15, T3C: 5, T3I: 14, T1C: 14, T1I: 18, TCC: 13, TCI: 29,
  RO: 3, RD: 9, RT: 12, AST: 9, PR: 4, PP: 6, 'AST-PP': 1.5, FC: 7, FR: 11 };

/* Un compañero, para que el bug no se pueda «arreglar» con un caso de uno
   solo: si el acumulado se pisara por clave, este también se rompería. */
const OTRO_IDA = Object.assign({}, IDA, { NOMBRES: 'BOTTE, IGNACIO', PJ: 9, PTS: 60, T2C: 20, T2I: 40, AST: 10, PP: 5 });
const OTRO_VUE = Object.assign({}, VUELTA, { NOMBRES: 'BOTTE, IGNACIO', PJ: 3, PTS: 21, T2C: 7, T2I: 12, AST: 4, PP: 2 });

/* Y un tercer torneo, para que la suma no sea «sumar dos» sino «sumar
   todos»: con dos, un `set` sobre el segundo y un `+=` sobre el tercero
   dan lo mismo. */
const PLAY = Object.assign({}, IDA, { TORNEO: 'PLAYOFF', PJ: 2, PTS: 30,
  T2C: 6, T2I: 11, T3C: 2, T3I: 7, T1C: 6, T1I: 8, TCC: 8, TCI: 18,
  AST: 5, PP: 3 });

function partidos(torneos) {
  const out = [];
  torneos.forEach((t, ti) => {
    for (let i = 1; i <= 2; i++) {
      const f = '2026-0' + (ti + 5) + '-0' + i;
      out.push({ PARTIDO: t + i, EQUIPO: "DEPORTIVO LA PLATA - MM", FASE: 'REGULAR',
        TORNEO: t, FECHA: f, RESULTADO: 'GANADO', CONDICION: 'LOCAL',
        PTS: 80, PLAYS: 80, POS: 70, MIN: 200, TCC: 30, TCI: 60, T3C: 10, T3I: 25,
        T2C: 20, T2I: 35, T1C: 10, T1I: 12, PP: 12, RO: 10, RD: 25, AST: 15, PR: 8, RT: 35 });
      out.push({ PARTIDO: t + i, EQUIPO: 'ATENAS A', FASE: 'REGULAR',
        TORNEO: t, FECHA: f, RESULTADO: 'PERDIDO', CONDICION: 'VISITANTE',
        PTS: 70, PLAYS: 78, POS: 70, MIN: 200, TCC: 25, TCI: 58, T3C: 7, T3I: 25,
        T2C: 18, T2I: 33, T1C: 13, T1I: 18, PP: 14, RO: 8, RD: 22, AST: 11, PR: 6, RT: 30 });
    }
  });
  return out;
}

function indice(filasAcum, torneo, extra) {
  const bde = partidos(['IDA', 'VUELTA']);
  return SGADD.construirIndice(Object.assign({
    'Base Datos E': { cols: Object.keys(bde[0]), filas: bde },
    'ACUMULADO J': { cols: COLS_AJ, filas: filasAcum },
  }, extra || {}), { fase: 'REGULAR', torneo: torneo });
}

const jugador = (idx, nombre) => (idx.liga.jugadores || [])
  .find(j => j['NOMBRES'] === (nombre || IDA.NOMBRES));

/* =====================================================================
   EL CASO REPORTADO
   ===================================================================== */
titulo('EL CASO REPORTADO · IDA + VUELTA en el TOTAL');

const iT = indice([IDA, VUELTA, OTRO_IDA, OTRO_VUE], SGADD.TORNEO_TOTAL);
const j = jugador(iT);
check('el jugador está en el plantel del TOTAL', !!j, j && j.NOMBRES);

const a = (j && j.__acum) || {};
check('PJ  suma los dos tramos: 9 + 3 = 12', a.PJ === 12, a.PJ);
check('PTS suma los dos tramos: 139 + 45 = 184', a.PTS === 184, a.PTS);
check('T2C convertidos: 36 + 8 = 44', a.T2C === 44, a.T2C);
check('T2I intentados:  68 + 15 = 83', a.T2I === 83, a.T2I);
check('T3C: 12 + 5 = 17', a.T3C === 17, a.T3C);
check('T3I: 40 + 14 = 54', a.T3I === 54, a.T3I);
check('T1C: 31 + 14 = 45', a.T1C === 45, a.T1C);
check('T1I: 44 + 18 = 62', a.T1I === 62, a.T1I);
check('TCC: 48 + 13 = 61', a.TCC === 61, a.TCC);
check('TCI: 108 + 29 = 137', a.TCI === 137, a.TCI);
check('MIN: 250 + 80 = 330', a.MIN === 330, a.MIN);
check('los rebotes también', a.RO === 12 && a.RD === 36 && a.RT === 48,
  a.RO + '/' + a.RD + '/' + a.RT);
check('y la creación', a.AST === 36 && a.PP === 24 && a.PR === 16,
  a.AST + '/' + a.PP + '/' + a.PR);
check('y las faltas', a.FC === 29 && a.FR === 41, a.FC + '/' + a.FR);

/* NINGUNA COLUMNA SE QUEDA CON EL VALOR DE UN SOLO TRAMO. Es la forma
   general del bug: alcanza con que una se pise para que la vista de
   totales mienta en esa columna. */
const cuentas = ['PJ', 'MIN', 'PTS', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I',
  'TCC', 'TCI', 'RO', 'RD', 'RT', 'AST', 'PR', 'PP', 'FC', 'FR'];
const sinSumar = cuentas.filter(c => a[c] !== (IDA[c] + VUELTA[c]));
check('las 19 cuentas suman, sin excepción', sinSumar.length === 0,
  sinSumar.map(c => c + '=' + a[c] + ' (esperado ' + (IDA[c] + VUELTA[c]) + ')').join(', '));

/* EL COMPAÑERO TAMBIÉN. Con un jugador solo, un bug de clave no se ve. */
const b = (jugador(iT, 'BOTTE, IGNACIO') || {}).__acum || {};
check('el compañero acumula igual', b.PJ === 12 && b.PTS === 81, b.PJ + '/' + b.PTS);

/* LAS TASAS NO SE SUMAN. `AST-PP` vale 1,5 en los dos tramos: sumarla
   daría 3, que es el error más fácil de cometer acá. Se recalcula sobre
   los totales — 36 asistencias sobre 24 pérdidas. */
check('AST-PP se RECALCULA, no se suma',
  Math.abs(a['AST-PP'] - 36 / 24) < 1e-9, a['AST-PP']);
check('y no da la suma de las dos (3,0)', Math.abs(a['AST-PP'] - 3) > 0.1);

/* EL TEXTO NO SE ACUMULA. */
check('el nombre no se concatena', a.NOMBRES === IDA.NOMBRES, a.NOMBRES);
check('ni el equipo', a.EQUIPO === IDA.EQUIPO, a.EQUIPO);

/* =====================================================================
   TRES TRAMOS
   ===================================================================== */
titulo('CON TRES TORNEOS · sumar todos, no los dos últimos');

/* Con dos torneos, un `set` sobre el segundo y un `+=` sobre el tercero
   dan lo mismo: hace falta un tercero para distinguirlos. */
const i3 = indice([IDA, VUELTA, PLAY], SGADD.TORNEO_TOTAL);
const a3 = (jugador(i3) || {}).__acum || {};
check('PJ  = 9 + 3 + 2 = 14', a3.PJ === 14, a3.PJ);
check('PTS = 139 + 45 + 30 = 214', a3.PTS === 214, a3.PTS);
check('T2C = 36 + 8 + 6 = 50', a3.T2C === 50, a3.T2C);
check('T2I = 68 + 15 + 11 = 94', a3.T2I === 94, a3.T2I);

/* =====================================================================
   UN TRAMO SOLO NO CAMBIA
   ===================================================================== */
titulo('UN TORNEO SUELTO · reproduce la hoja, sin tocar nada');

/* Es la mitad que no se puede romper: con un torneo, sumar una fila tiene
   que dar exactamente esa fila. Si no, el arreglo del TOTAL habría roto
   la vista que sí funcionaba. */
const proj = [{ NOMBRES: IDA.NOMBRES, EQUIPO: IDA.EQUIPO, FASE: 'REGULAR',
  TORNEO: 'IDA', PJ: 9, MIN: 27.8, PTS: 15.4 }];
const proe = [{ EQUIPO: IDA.EQUIPO, FASE: 'REGULAR', TORNEO: 'IDA', PJ: 9, PTS: 80 }];
const iIda = SGADD.construirIndice({
  'PROMEDIOS E': { cols: Object.keys(proe[0]), filas: proe },
  'PROMEDIOS J': { cols: Object.keys(proj[0]), filas: proj },
  'ACUMULADO J': { cols: COLS_AJ, filas: [IDA, VUELTA] },
}, { fase: 'REGULAR', torneo: 'IDA' });

const jI = jugador(iIda);
check('en IDA el jugador está', !!jI);
const aI = (jI && jI.__acum) || {};
check('y su acumulado es el de IDA, no la suma', aI.PJ === 9 && aI.PTS === 139,
  aI.PJ + '/' + aI.PTS);
check('con sus tiros de IDA', aI.T2C === 36 && aI.T2I === 68, aI.T2C + '/' + aI.T2I);
/* Y la tasa recalculada sobre UN torneo reproduce la de la hoja. */
check('AST-PP reproduce el valor de la hoja',
  Math.abs(aI['AST-PP'] - 27 / 18) < 1e-9 && Math.abs(aI['AST-PP'] - IDA['AST-PP']) < 1e-9,
  aI['AST-PP']);

/* =====================================================================
   EL PROMEDIO DEL TOTAL · lo que YA estaba bien
   ===================================================================== */
titulo('EL PROMEDIO DEL TOTAL · sigue saliendo de la suma');

/* Esto no estaba roto y por eso el bug era invisible: el promedio del
   TOTAL se deriva aparte, sumando las filas y dividiendo por el PJ. Se
   fija acá para que las dos mitades no se puedan separar: si mañana una
   se arregla y la otra no, la misma pantalla diría dos cosas. */
check('PJ del promedio = 12', j.PJ === 12, j.PJ);
check('PTS por partido = 184 / 12', Math.abs(j.PTS - 184 / 12) < 1e-9, j.PTS);
check('y coincide con el acumulado dividido por PJ',
  Math.abs(j.PTS - a.PTS / a.PJ) < 1e-9,
  j.PTS + ' vs ' + (a.PTS / a.PJ));
check('los tiros también', Math.abs(j.T2C - 44 / 12) < 1e-9 && Math.abs(j.T2I - 83 / 12) < 1e-9,
  j.T2C + '/' + j.T2I);

/* =====================================================================
   EL EQUIPO
   ===================================================================== */
titulo('EL EQUIPO · sus totales salen de los partidos, no del acumulado');

const e = iT.get('DEPORTIVO LA PLATA');
check('el equipo suma los partidos de los DOS torneos',
  e.record.pj === 4, e.record.pj);
check('y sus puntos', e.totales.propio.PTS === 320, e.totales.propio.PTS);
/* La cronología también: es la que alimenta los ciclos de COMPARATIVA. */
check('la cronología trae los cuatro', e.partidos.length === 4, e.partidos.length);
check('de los dos torneos',
  new Set(e.partidos.map(p => p.TORNEO)).size === 2,
  e.partidos.map(p => p.TORNEO).join(','));

/* =====================================================================
   NINGÚN GUARD DEVUELVE SOLO EL PRIMER TRAMO
   ===================================================================== */
titulo('LA TUBERÍA · ningún filtro se queda con el primero');

/* El TOTAL se ofrece y ABRE el libro cuando hay dos torneos con partidos
   (punto 3 ter). Si el default cayera a IDA, todo lo de arriba estaría
   bien y la pantalla seguiría mostrando un solo tramo. */
const bde2 = partidos(['IDA', 'VUELTA']);
const hojas2 = { 'Base Datos E': { cols: Object.keys(bde2[0]), filas: bde2 } };
const tramos = SGADD.combinacionesTorneoFase(hojas2);
const total = tramos.find(t => t.sintetico);
check('el TOTAL aparece entre los tramos', !!total, tramos.map(t => t.torneo).join(','));
check('y con partidos', total && total.conPartidos);
const porDefecto = SGADD.tramoPorDefecto(tramos);
check('y es el que abre el libro',
  porDefecto && porDefecto.sintetico, porDefecto && porDefecto.torneo);

/* Las hojas de acumulado NO se filtran por torneo: la fase sí, el torneo
   no — porque el TOTAL las necesita todas y un torneo suelto se resuelve
   igual, sumando la única que pasa. */
const src = require('fs').readFileSync('./js/sgadd-core.js', 'utf8');
const bloque = src.slice(src.indexOf("const haj = hojas['ACUMULADO J']"));
check('el acumulado se SUMA y no se pisa',
  /porClave\.get\(k\)/.test(bloque.slice(0, 2500))
  && !/porClave\.set\(k, \{\}\)/.test(bloque.slice(0, 2500)));
check('y las tasas se recalculan aparte',
  /TASAS_ACUMULADO/.test(src));

console.log(NL + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') +
  '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
