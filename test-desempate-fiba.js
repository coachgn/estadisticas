/* =====================================================================
   test-desempate-fiba.js · el desempate oficial FIBA de la tabla (punto 132)

   Corre desde la raíz:  node test-desempate-fiba.js

   Los índices se arman desde una lista de PARTIDOS, con las dos filas de
   cada uno y el mismo `__id` (FECHA + PARTIDO), que es la forma que
   `construirIndice` le cuelga a `e.partidos`. El récord y los totales se
   derivan de esos mismos partidos: así el test no puede tener una tabla
   que diga una cosa y unos partidos que digan otra.
   ===================================================================== */
'use strict';
const CL = require('./js/sgadd-clasificacion.js');
const CFG = require('./js/sgadd-config.js');
const fs = require('fs');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* partidos: [local, visitante, ptsLocal, ptsVisitante] */
function idxDe(partidos) {
  const eq = new Map();
  const de = (c) => {
    if (!eq.has(c)) eq.set(c, { clave: c, nombre: c, partidos: [], g: 0, p: 0, pf: 0, pc: 0 });
    return eq.get(c);
  };
  partidos.forEach(([a, b, pa, pb], i) => {
    const id = '2026-01-' + String(i + 1).padStart(2, '0') + '_' + a + '-vs-' + b;
    const ea = de(a), eb = de(b);
    ea.partidos.push({ __id: id, PTS: pa, RESULTADO: pa > pb ? 'GANADO' : 'PERDIDO', CONDICION: 'LOCAL' });
    eb.partidos.push({ __id: id, PTS: pb, RESULTADO: pb > pa ? 'GANADO' : 'PERDIDO', CONDICION: 'VISITANTE' });
    ea.pf += pa; ea.pc += pb; eb.pf += pb; eb.pc += pa;
    if (pa > pb) { ea.g++; eb.p++; } else { eb.g++; ea.p++; }
  });
  const lista = Array.from(eq.values()).map((e) => ({
    clave: e.clave, nombre: e.nombre, partidos: e.partidos,
    record: { ganados: e.g, perdidos: e.p, pj: e.g + e.p },
    totales: { propio: { PTS: e.pf }, rival: { PTS: e.pc } },
    split: {},
  }));
  return { lista: () => lista };
}

const FIBA = { orden: ['FIBA'] };
const nombres = (t) => t.map((r) => r.nombre).join(' ');

/* ===================================================================== */
titulo('1 · Empate de 2 resuelto por el duelo directo');
{
  /* A y B: 2 ganados y 1 perdido cada uno. B le ganó a A. A tiene MEJOR
     diferencia general: con PCT › DIF › PF quedaría arriba; FIBA lo baja. */
  const idx = idxDe([
    ['A', 'C', 100, 50], ['A', 'D', 100, 50], ['B', 'A', 70, 68],
    ['B', 'C', 70, 69], ['C', 'B', 80, 70],
  ]);
  const pct = CL.tabla(idx, { orden: ['PCT', 'DIF', 'PF'] });
  const fiba = CL.tabla(idx, FIBA);
  check('con PCT › DIF › PF, A va primero por diferencia general', pct[0].nombre === 'A', nombres(pct));
  check('con FIBA, B va primero: le ganó el duelo a A', fiba[0].nombre === 'B' && fiba[1].nombre === 'A', nombres(fiba));
  check('la fila dice qué decidió: duelo directo', fiba[0].desempate === 'duelo directo', fiba[0].desempate);
  check('los puntos de tabla son 2 por ganado y 1 por perdido', fiba[0].puntos === 5 && fiba[1].puntos === 5);
}

/* ===================================================================== */
titulo('2 · Empate de 2 con los duelos divididos: cociente general');
{
  /* A y B se ganan uno cada uno por la misma diferencia (+5 y -5): la
     mini-tabla no separa. Va el cociente PF/PC de TODOS sus partidos. */
  const idx = idxDe([
    ['A', 'B', 80, 75], ['B', 'A', 80, 75],
    ['A', 'C', 90, 60], ['B', 'C', 70, 69],
  ]);
  const t = CL.tabla(idx, FIBA);
  const a = t.find((r) => r.nombre === 'A'), b = t.find((r) => r.nombre === 'B');
  check('A y B empatan en puntos', a.puntos === b.puntos, a.puntos + ' / ' + b.puntos);
  check('el cociente de A es mejor', CL.cociente(a) > CL.cociente(b));
  check('A queda arriba de B por cociente', t.indexOf(a) < t.indexOf(b), nombres(t));
  check('la fila dice cociente', a.desempate === 'cociente PF/PC general', a.desempate);
}

/* ===================================================================== */
titulo('3 · Cociente con PC = 0 no da NaN');
{
  check('PF 10 / PC 0 es el mejor cociente', CL.cociente({ pf: 10, pc: 0 }) === Infinity);
  check('PF 0 / PC 0 es 0', CL.cociente({ pf: 0, pc: 0 }) === 0);
  check('PF 80 / PC 40 es 2', CL.cociente({ pf: 80, pc: 40 }) === 2);
}

/* ===================================================================== */
titulo('4 · Empate de 3 por mini-tabla: puntos entre los empatados');
{
  /* A, B y C con 3-2 cada uno. Entre ellos: A le gana a B y a C, B le gana
     a C → mini-tabla 4 · 3 · 2. Afuera, C gana todo por mucho: tiene la
     mejor diferencia general y con PCT › DIF › PF iría primero. */
  const idx = idxDe([
    ['A', 'B', 70, 69], ['A', 'C', 70, 69], ['B', 'C', 70, 69],
    ['A', 'D', 70, 60], ['E', 'A', 70, 60], ['F', 'A', 70, 60],
    ['B', 'D', 70, 60], ['B', 'E', 70, 60], ['F', 'B', 70, 60],
    ['C', 'D', 120, 60], ['C', 'E', 120, 60], ['C', 'F', 120, 60],
  ]);
  const t = CL.tabla(idx, FIBA);
  const pct = nombres(CL.tabla(idx, { orden: ['PCT', 'DIF', 'PF'] }));
  check('con PCT › DIF › PF, C iría arriba de A y de B', pct.indexOf('C') < pct.indexOf('A') && pct.indexOf('C') < pct.indexOf('B'), pct);
  check('A, B y C empatan en 8 puntos', t.slice(0, 3).every((r) => r.puntos === 8), t.map((r) => r.puntos).join(' '));
  check('mini-tabla: A · B · C', nombres(t).startsWith('A B C'), nombres(t));
  check('la fila dice puntos entre los empatados', t[0].desempate === 'puntos entre los empatados', t[0].desempate);
}

/* ===================================================================== */
titulo('5 · Empate de 3 por diferencia y por puntos a favor');
{
  /* Triangular perfecto: cada uno gana uno. Puntos de la mini-tabla 3-3-3.
     Diferencia: A +10, B -5, C -5 → A primero. B y C quedan empatados en
     dif → VUELVEN A EMPEZAR solos (D.3): duelo directo, y B le ganó a C.
     Entre los TRES, C tiene más puntos a favor (145 contra 135): sin la
     vuelta a empezar, C quedaría arriba de B. */
  const idx = idxDe([
    ['A', 'B', 80, 65], ['B', 'C', 70, 60], ['C', 'A', 85, 80],
  ]);
  const t = CL.tabla(idx, FIBA);
  check('A primero por diferencia entre los empatados', t[0].nombre === 'A' && t[0].desempate === 'diferencia entre los empatados', nombres(t) + ' · ' + t[0].desempate);
  check('B y C vuelven a empezar: duelo directo, B arriba', t[1].nombre === 'B' && t[2].nombre === 'C', nombres(t));
  check('B dice duelo directo', t[1].desempate === 'duelo directo', t[1].desempate);

  /* Mismo triangular con las diferencias iguales: decide puntos a favor. */
  const idx2 = idxDe([
    ['A', 'B', 90, 80], ['B', 'C', 70, 60], ['C', 'A', 75, 65],
  ]);
  const t2 = CL.tabla(idx2, FIBA);
  check('las tres diferencias entre ellos son 0', t2.every((r) => r.dif === 0));
  check('PF entre empatados: A 155 · B 150 · C 135', nombres(t2) === 'A B C', nombres(t2));
  check('dice puntos a favor', t2[0].desempate === 'puntos a favor entre los empatados', t2[0].desempate);
}

/* ===================================================================== */
titulo('6 · Empate de 4 y desempate recursivo de subgrupos');
{
  /* A, B, C, D empatados en 8 puntos (3 ganados y 2 perdidos cada uno).
     Entre ellos: A 3-0 (6), B, C y D 1-2 (4) cada uno:
       A>B, A>C, A>D, B>C, C>D, D>B  → A 6 · B 4 · C 4 · D 4
     A sale primero. B, C y D siguen empatados y VUELVEN A EMPEZAR entre
     ellos: B>C, C>D, D>B → 3-3-3 → diferencia. */
  const idx = idxDe([
    ['A', 'B', 70, 60], ['A', 'C', 70, 69], ['A', 'D', 90, 60],
    ['B', 'C', 80, 60], ['C', 'D', 70, 65], ['D', 'B', 70, 68],
    /* Para igualar a 8 puntos de tabla (3-2): A pierde con E y F; B, C y
       D ganan dos cada uno contra E y F. */
    ['E', 'A', 70, 60], ['F', 'A', 70, 60],
    ['B', 'E', 70, 60], ['B', 'F', 70, 60], ['C', 'F', 70, 60], ['C', 'E', 70, 60],
    ['D', 'E', 70, 60], ['D', 'F', 70, 60], ['E', 'F', 70, 60],
  ]);
  const t = CL.tabla(idx, FIBA);
  const empatados = t.filter((r) => ['A', 'B', 'C', 'D'].includes(r.nombre));
  check('A, B, C y D empatan en puntos', empatados.every((r) => r.puntos === empatados[0].puntos), empatados.map((r) => r.puntos).join(' '));
  check('A primero por puntos entre los empatados', t[0].nombre === 'A' && t[0].desempate === 'puntos entre los empatados', nombres(t));
  /* Entre B, C y D solos: diferencia B +20-2 = +18 · C -20+5 = -15 · D -5+2 = -3 */
  check('el subgrupo B-C-D se reordena SOLO con sus partidos: B · D · C', nombres(t).startsWith('A B D C'), nombres(t));
  check('B lo decidió la diferencia del subgrupo', t[1].desempate === 'diferencia entre los empatados', t[1].desempate);

  /* La recursión de verdad: si en el subgrupo se usaran los partidos de
     los CUATRO (con A), la diferencia sería B +8 · C -16 · D -33 y daría
     B · C · D. El orden B · D · C solo sale recalculando entre ellos. */
  const mini4 = CL.miniTabla(empatados, CL.partidosDeTabla(idx, []));
  const difCon = (n) => { const m = mini4.get(n); return m.pf - m.pc; };
  check('con los cuatro, C tendría mejor diferencia que D', difCon('C') > difCon('D'), difCon('C') + ' vs ' + difCon('D'));
}

/* ===================================================================== */
titulo('7 · Los partidos sin estadísticas cuentan en el duelo');
{
  /* Sin el manual, A y B tienen 1-0 y 1-0 y no se cruzaron: cociente. Con
     el manual B 70-60 A, B le ganó el duelo. */
  const idx = idxDe([['A', 'C', 100, 50], ['B', 'C', 61, 60], ['A', 'D', 80, 60]]);
  const manuales = [{ id: 'm1', local: 'B', visitante: 'A', puntosLocal: 70, puntosVisitante: 60 },
    { id: 'm2', local: 'B', visitante: 'D', puntosLocal: 70, puntosVisitante: 50 },
    { id: 'm3', local: 'D', visitante: 'A', puntosLocal: 70, puntosVisitante: 60 }];
  const t = CL.tabla(idx, { orden: ['FIBA'], manuales: manuales });
  const a = t.find((r) => r.nombre === 'A'), b = t.find((r) => r.nombre === 'B');
  check('A y B empatan en puntos con los manuales', a.puntos === b.puntos, a.puntos + ' / ' + b.puntos);
  check('B arriba: ganó el duelo cargado a mano', t.indexOf(b) < t.indexOf(a), nombres(t));
  check('el duelo manual está en los partidos de la tabla',
    CL.partidosDeTabla(idx, manuales).some((p) => p.a === 'B' && p.b === 'A'));
}

/* ===================================================================== */
titulo('8 · FIBA es opt-in y terminal');
{
  const idx = idxDe([['A', 'B', 70, 60], ['B', 'C', 70, 60], ['C', 'A', 70, 60], ['A', 'D', 90, 40]]);
  check('ORDEN_POR_DEFECTO no cambió', CL.ORDEN_POR_DEFECTO.join() === 'PCT,DIF,PF');
  check('el parser de config sigue poniendo PCT › DIF › PF sin declarar',
    CFG.parsear({ competencia: { formatos: { r: { zonas: [] } }, porTramo: { '*': 'r' } } }).ordenTabla.join() === 'PCT,DIF,PF');
  check('«FIBA» es un nombre válido de ordenTabla', !!CL.CRITERIOS.FIBA);
  check('con FIBA en la lista, los demás criterios no se usan',
    nombres(CL.tabla(idx, { orden: ['PF', 'FIBA'] })) === nombres(CL.tabla(idx, FIBA)));
  check('sin FIBA, ninguna fila trae `desempate`', CL.tabla(idx, { orden: ['PCT'] }).every((r) => r.desempate === undefined));
  check('empate total va por nombre y lo dice',
    (() => { const t = CL.tabla(idxDe([['X', 'Z', 70, 60], ['Y', 'W', 70, 60]]), FIBA);
      return t[0].nombre === 'X' && /nombre/.test(t[0].desempate || ''); })());
}

/* ===================================================================== */
titulo('9 · La copia del servidor y la pantalla de Configuración');
{
  const serv = require('./server/lib/compartido/sgadd-clasificacion.js');
  check('server/lib/compartido trae el procedimiento', typeof serv.ordenarFiba === 'function' && !!serv.CRITERIOS.FIBA);
  const ui = fs.readFileSync('js/sgadd-configui.js', 'utf8');
  check('Configuración ofrece el desempate FIBA', /CONFIG_DESEMPATES[\s\S]{0,200}fiba:\s*\{\s*orden:\s*\['FIBA'\]/.test(ui));
}

console.log('\n' + ok + ' ok, ' + fail + ' fallaron');
if (fail) { console.log('FALLARON'); process.exit(1); }
