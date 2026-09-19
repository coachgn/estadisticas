/* =====================================================================
   SGADD · AST-PP CON CERO PÉRDIDAS · suite de regresión

       node test-ast-pp.js

   EL DEFECTO QUE ESTA SUITE EXISTE PARA QUE NO VUELVA.

   `AST-PP` se calculaba con `div0(AST, PP)`, que devuelve null con el
   denominador en cero. Un base con asistencias y NINGUNA pérdida —el mejor
   caso posible— quedaba sin número en el panel ("—"), mientras la hoja que
   el club audita le ponía sus asistencias.

   La convención es la del motor (MotorStats v106 · fachada @95):

       PP > 0              ->  AST / PP
       PP = 0 y AST > 0    ->  AST / 1      (5 AST, 0 PP = 5,00)
       PP = 0 y AST = 0    ->  0,00

   Con el resultado redondeado a dos decimales, como lo guarda el motor.

   Ninguno de los 6119 tests que había cubría este caso: el cambio los
   dejó a todos en verde, que prueba que no se rompió nada pero no que el
   cambio sea correcto. Esto sí.

   SE PRUEBA POR LOS TRES CAMINOS REALES, no por la función suelta —que no
   se exporta, y no se va a exportar para testearla—:

     1. `__acum` del jugador       (TASAS_ACUMULADO, filas de ACUMULADO J)
     2. promedio del jugador       (TOTAL derivado, `sum`)
     3. promedio del equipo        (TOTAL derivado, `yo`)
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
/** Lo que pinta el panel: `formatear` con el formato num2 de AST-PP. */
const pinta = (v) => SGADD.formatear('AST-PP', v);

/* =====================================================================
   LA FIXTURE
   ===================================================================== */
const COLS_AJ = ['NOMBRES', 'EQUIPO', 'FASE', 'TORNEO', 'PJ', 'MIN', 'PTS',
  'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I', 'TCC', 'TCI', 'RO', 'RD', 'RT',
  'AST', 'PR', 'PP', 'AST-PP', 'FC', 'FR'];

const BASE = { EQUIPO: 'DEPORTIVO LA PLATA - MM', FASE: 'REGULAR', MIN: 100, PTS: 20,
  T2C: 5, T2I: 10, T3C: 1, T3I: 4, T1C: 3, T1I: 4, TCC: 6, TCI: 14,
  RO: 1, RD: 3, RT: 4, PR: 2, FC: 3, FR: 2 };
/* `AST-PP` de la hoja va en 0 a propósito: el TOTAL no la tiene que
   heredar, la tiene que recalcular sobre los totales. */
const fila = (nombre, torneo, pj, ast, pp) =>
  Object.assign({}, BASE, { NOMBRES: nombre, TORNEO: torneo, PJ: pj, AST: ast, PP: pp, 'AST-PP': 0 });

/* Un jugador por caso, repartido en IDA y VUELTA, así el TOTAL suma. */
const JUGADORES = [
  // nombre              IDA: pj ast pp    VUELTA: pj ast pp
  ['SIN PERDIDAS',        3, 7, 0,           2, 3, 0],   // 10 AST / 0 PP
  ['CERO Y CERO',         3, 0, 0,           2, 0, 0],   //  0 AST / 0 PP
  ['NORMAL',              3, 7, 3,           2, 3, 1],   // 10 AST / 4 PP
  ['REDONDEO',            3, 5, 2,           2, 2, 1],   //  7 AST / 3 PP
  ['SOLO PERDIDAS',       3, 0, 3,           2, 0, 2],   //  0 AST / 5 PP
];
const filasAJ = [];
JUGADORES.forEach(([n, pj1, a1, p1, pj2, a2, p2]) => {
  filasAJ.push(fila(n, 'IDA', pj1, a1, p1));
  filasAJ.push(fila(n, 'VUELTA', pj2, a2, p2));
});

function partidos() {
  const out = [];
  ['IDA', 'VUELTA'].forEach((t, ti) => {
    for (let i = 1; i <= 2; i++) {
      const f = '2026-0' + (ti + 5) + '-0' + i;
      out.push({ PARTIDO: t + i, EQUIPO: 'DEPORTIVO LA PLATA - MM', FASE: 'REGULAR',
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

const iJ = SGADD.construirIndice({
  'Base Datos E': { cols: Object.keys(partidos()[0]), filas: partidos() },
  'ACUMULADO J': { cols: COLS_AJ, filas: filasAJ },
}, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });

const jugador = (n) => (iJ.liga.jugadores || []).find(j => j['NOMBRES'] === n) || {};
const acum = (n) => (jugador(n).__acum || {})['AST-PP'];
const prom = (n) => jugador(n)['AST-PP'];

/* =====================================================================
   1 · LA CONVENCIÓN, por el `__acum` del jugador
   ===================================================================== */
titulo('1 · LA CONVENCIÓN · `__acum` del jugador (TASAS_ACUMULADO)');

check('10 AST, 0 PP  ->  10,00  (AST / 1, no "—")', acum('SIN PERDIDAS') === 10, acum('SIN PERDIDAS'));
check('0 AST, 0 PP   ->  0,00', acum('CERO Y CERO') === 0, acum('CERO Y CERO'));
check('10 AST, 4 PP  ->  2,50  (AST / PP)', acum('NORMAL') === 2.5, acum('NORMAL'));
check('0 AST, 5 PP   ->  0,00', acum('SOLO PERDIDAS') === 0, acum('SOLO PERDIDAS'));
check('7 AST, 3 PP   ->  2,33 redondeado, no 2,3333…', acum('REDONDEO') === 2.33, acum('REDONDEO'));

/* EL DEFECTO, en su forma original: con cero pérdidas NUNCA null. Un null
   borraba la métrica del jugador y el panel pintaba "—". */
const sinNumero = JUGADORES.map(j => j[0]).filter(n => typeof acum(n) !== 'number');
check('ningún jugador queda sin número (antes: null → "—")', sinNumero.length === 0,
  sinNumero.join(', '));

/* =====================================================================
   2 · EL PROMEDIO DEL JUGADOR coincide con su acumulado
   ===================================================================== */
titulo('2 · PROMEDIO DEL JUGADOR · TOTAL derivado (`sum`)');

/* LA REGLA "÷1" NO ESCALA: sobre el promedio por partido daría AST/PJ.
   `SIN PERDIDAS` tiene 10 AST en 5 PJ: 10,00 sobre totales, 2,00 sobre
   el promedio. El TOTAL la calcula sobre `sum`, así que tiene que dar 10. */
check('10 AST en 5 PJ, 0 PP -> 10,00, no 2,00 (sobre totales, no sobre promedios)',
  prom('SIN PERDIDAS') === 10, prom('SIN PERDIDAS'));
const distintos = JUGADORES.map(j => j[0]).filter(n => prom(n) !== acum(n));
check('promedio y acumulado dan el mismo AST-PP en los cinco casos', distintos.length === 0,
  distintos.map(n => n + ': prom ' + prom(n) + ' vs acum ' + acum(n)).join(', '));

/* =====================================================================
   3 · EL EQUIPO
   ===================================================================== */
titulo('3 · PROMEDIO DEL EQUIPO · TOTAL derivado (`yo`)');

(function () {
  const P = (partido, equipo, o) => Object.assign(
    { PARTIDO: partido, EQUIPO: equipo, FASE: 'REGULAR', TORNEO: 'IDA',
      FECHA: '2026-05-0' + partido, RESULTADO: 'GANADO', CONDICION: 'LOCAL',
      PTS: 80, TCC: 30, TCI: 60, T2C: 20, T2I: 35, T3C: 10, T3I: 25, T1C: 10, T1I: 12,
      PLAYS: 80, RO: 10, RD: 25, MIN: 200, PR: 8, POS: 70, RT: 35 }, o);
  const perd = { RESULTADO: 'PERDIDO', CONDICION: 'VISITANTE' };
  /* A no pierde ninguna pelota en dos partidos; B pierde 14 y 15. */
  const bde = [
    P('1', 'A', { AST: 15, PP: 0 }), P('1', 'B', Object.assign({ AST: 11, PP: 14 }, perd)),
    P('2', 'A', { AST: 18, PP: 0 }), P('2', 'B', Object.assign({ AST: 12, PP: 15 }, perd)),
  ];
  const hojas = {
    'Base Datos E': { cols: Object.keys(bde[0]), filas: bde },
    'PROMEDIOS E': { cols: ['EQUIPO', 'FASE', 'TORNEO', 'PJ', 'PTS'], filas: [
      { EQUIPO: 'A', FASE: 'REGULAR', TORNEO: 'IDA', PJ: 2, PTS: 80 },
      { EQUIPO: 'B', FASE: 'REGULAR', TORNEO: 'IDA', PJ: 2, PTS: 80 }] },
  };
  const iT = SGADD.construirIndice(hojas, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
  const a = (iT.get('A') || {}).promedios || {};
  const b = (iT.get('B') || {}).promedios || {};

  check('equipo sin pérdidas: 33 AST / 0 PP -> 33,00 (no "—")', a['AST-PP'] === 33, a['AST-PP']);
  check('equipo con pérdidas: 23 AST / 29 PP -> 0,79', b['AST-PP'] === 0.79, b['AST-PP']);
  /* Que el resto de las tasas siga con `div0` no se prueba acá: lo
     garantizan los 6119 tests existentes, que dieron idéntico antes y
     después del cambio. */
})();

/* =====================================================================
   4 · LO QUE VE EL USUARIO
   ===================================================================== */
titulo('4 · LO QUE PINTA EL PANEL · `formatear` (num2, coma decimal)');

check('10 AST, 0 PP  se pinta "10,00"', pinta(acum('SIN PERDIDAS')) === '10,00', pinta(acum('SIN PERDIDAS')));
check('0 AST, 0 PP   se pinta "0,00"', pinta(acum('CERO Y CERO')) === '0,00', pinta(acum('CERO Y CERO')));
check('10 AST, 4 PP  se pinta "2,50"', pinta(acum('NORMAL')) === '2,50', pinta(acum('NORMAL')));
check('7 AST, 3 PP   se pinta "2,33"', pinta(acum('REDONDEO')) === '2,33', pinta(acum('REDONDEO')));
check('y ya no aparece "—" por cero pérdidas', pinta(acum('SIN PERDIDAS')) !== '—');

/* =====================================================================
   5 · MISMO NÚMERO QUE EL MOTOR
   ===================================================================== */
titulo('5 · COINCIDE CON EL MOTOR · los casos de mi-motor-stats/tests/ast_pp.test.js');

/* Los mismos cinco casos que prueba el motor. Si un lado cambia la
   convención y el otro no, esto lo canta. */
function unJugador(ast, pp) {
  const i = SGADD.construirIndice({
    'Base Datos E': { cols: Object.keys(partidos()[0]), filas: partidos() },
    'ACUMULADO J': { cols: COLS_AJ, filas: [fila('X', 'IDA', 1, ast, pp)] },
  }, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
  const j = (i.liga.jugadores || []).find(x => x['NOMBRES'] === 'X') || {};
  return (j.__acum || {})['AST-PP'];
}
[[5, 0, 5], [0, 0, 0], [10, 4, 2.5], [0, 5, 0], [1, 1, 1]].forEach(([ast, pp, esperado]) => {
  const v = unJugador(ast, pp);
  check(ast + ' AST, ' + pp + ' PP -> ' + pinta(esperado) + ' (igual que el motor)', v === esperado, v);
});

/* =====================================================================
   EL COMPARTIDO DEL SERVIDOR también lo trae
   ===================================================================== */
titulo('6 · EL SERVIDOR CORRE EL MISMO NÚCLEO');

const fs = require('fs');
const src = fs.readFileSync('./js/sgadd-core.js', 'utf8');
const srv = fs.readFileSync('./server/lib/compartido/sgadd-core.js', 'utf8');
check('server/lib/compartido/sgadd-core.js tiene la convención nueva',
  srv.indexOf("'AST-PP': (y) => astPp(y.AST, y.PP)") !== -1);
check('y es la misma fuente que js/ (sin la línea de cabecera del copiado)',
  srv.endsWith(src) || srv.indexOf(src) !== -1);

console.log(NL + '─'.repeat(70));
console.log((fail ? '✗ FALLAN   ' : '✓ TODO OK   ') + ok + ' pasaron, ' + fail + ' fallaron');
process.exitCode = fail ? 1 : 0;
