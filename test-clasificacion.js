/* =====================================================================
   Tabla de posiciones · sgadd-clasificacion.js

   Lo que hay que amarrar acá es que la tabla RESPONDA A LA CONFIG:
   cambiar un corte en el JSON tiene que mover la zona en la tabla, y
   cambiar la cantidad de equipos tiene que mover el descenso solo.

   Y lo que colapsó: las dos funciones viejas ordenaban solo por `pct`,
   así que dos equipos empatados quedaban en el orden en que
   `Object.keys` los devolvía. Con descenso por posición eso no es un
   detalle de presentación.
   ===================================================================== */
const fs = require('fs');
const CL = require('./js/sgadd-clasificacion.js');
const CFG = require('./js/sgadd-config.js');

/* `sgadd-clasificacion.js` consulta `SGADD_CONFIG` como global (en el
   navegador ya está cargado). En Node se publica a mano: es la misma
   instancia que require() devuelve, no una copia. */
global.SGADD_CONFIG = CFG;

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* Un índice de mentira con la forma que el motor consume. Se arma con
   los MISMOS campos que `construirIndice` cuelga de cada equipo
   (`record`, `totales`, `split`), así que si alguno cambiara de nombre
   estos tests fallan en vez de tapar el problema. */
function idxFalso(equipos) {
  const lista = equipos.map((e) => ({
    clave: e.clave, nombre: e.nombre || e.clave,
    record: { ganados: e.pg, perdidos: e.pp, pj: e.pg + e.pp },
    totales: { propio: { PTS: e.pf }, rival: { PTS: e.pc } },
    split: {
      LOCAL: { ganados: e.pgL || 0, perdidos: e.ppL || 0 },
      VISITANTE: { ganados: e.pgV || 0, perdidos: e.ppV || 0 },
    },
  }));
  return { lista: () => lista };
}

const LIGA12 = idxFalso([
  { clave: 'A', pg: 10, pp: 1, pf: 900, pc: 780, pgL: 6, ppL: 0, pgV: 4, ppV: 1 },
  { clave: 'B', pg:  9, pp: 2, pf: 880, pc: 800 },
  { clave: 'C', pg:  8, pp: 3, pf: 850, pc: 810 },
  { clave: 'D', pg:  7, pp: 4, pf: 840, pc: 820 },
  { clave: 'E', pg:  7, pp: 4, pf: 830, pc: 825 },
  { clave: 'F', pg:  6, pp: 5, pf: 820, pc: 830 },
  { clave: 'G', pg:  6, pp: 5, pf: 815, pc: 835 },
  { clave: 'H', pg:  5, pp: 6, pf: 800, pc: 840 },
  { clave: 'I', pg:  4, pp: 7, pf: 790, pc: 850 },
  { clave: 'J', pg:  3, pp: 8, pf: 780, pc: 860 },
  { clave: 'K', pg:  2, pp: 9, pf: 770, pc: 880 },
  { clave: 'L', pg:  1, pp: 10, pf: 760, pc: 900 },
]);

const CONFIG = CFG.parsear({ competencia: {
  ordenTabla: ['PCT', 'DIF', 'PF'],
  formatos: { 'r12': { label: 'Regular 12', equiposEsperados: 12, zonas: [
    { id: 'campeon',   desde:  1, hasta:  1, label: 'Campeón',    tono: 'exito' },
    { id: 'playoffs',  desde:  1, hasta:  8, label: 'Playoffs',   tono: 'positivo' },
    { id: 'repechaje', desde:  9, hasta: 10, label: 'Repechaje',  tono: 'aviso' },
    { id: 'descenso',  desde: -2,            label: 'Descenso',   tono: 'peligro' },
  ] } },
  porTramo: { '*': 'r12', 'PLAYOFFS|FINAL': null },
} });
const F12 = CFG.formatoDeTramo(CONFIG, 'IDA', 'REGULAR');

/* ==================================================================== */
titulo('LAS FILAS SALEN DEL ÍNDICE, NO SE RECALCULAN');

const filas = CL.filas(LIGA12);
check('una fila por equipo', filas.length === 12);
const a = filas.find(r => r.clave === 'A');
check('el récord sale de e.record', a.pg === 10 && a.pp === 1 && a.pj === 11);
check('los puntos salen de e.totales', a.pf === 900 && a.pc === 780);
check('la diferencia se deriva', a.dif === 120);
check('el porcentaje también', Math.abs(a.pct - 10 / 11) < 1e-9);
check('los promedios por partido también',
  Math.abs(a.pfProm - 900 / 11) < 1e-9 && Math.abs(a.pcProm - 780 / 11) < 1e-9);
/* El desglose local/visitante era la ÚNICA diferencia real entre las dos
   funciones viejas, y ya viene calculado en el índice. */
check('el split de local y visitante sale de e.split',
  a.local.pg === 6 && a.local.pp === 0 && a.visitante.pg === 4 && a.visitante.pp === 1);

/* Sin partidos el porcentaje es 0 y no NaN: un equipo dado de alta que
   todavía no jugó tiene que entrar a la tabla igual, no desaparecer. */
const cero = CL.filas(idxFalso([{ clave: 'Z', pg: 0, pp: 0, pf: 0, pc: 0 }]))[0];
check('un equipo sin partidos entra con 0 y no con NaN',
  cero.pct === 0 && cero.pfProm === 0 && !isNaN(cero.dif));

/* Nada de esto puede tirar: el índice puede no estar armado todavía. */
check('sin índice devuelve lista vacía', CL.filas(null).length === 0);
check('con un objeto que no es índice, tampoco revienta', CL.filas({}).length === 0);
check('tabla(null) devuelve lista vacía', CL.tabla(null, {}).length === 0);

/* ==================================================================== */
titulo('ORDEN Y DESEMPATE · lo que las dos funciones viejas no hacían');

const t = CL.tabla(LIGA12, { formato: F12, orden: CONFIG.ordenTabla });
check('la tabla numera los puestos desde 1',
  t[0].puesto === 1 && t[11].puesto === 12);
check('ordena por porcentaje de arriba a abajo',
  t.map(r => r.clave).join('') === 'ABCDEFGHIJKL', t.map(r => r.clave).join(''));

/* D y E empatan 7-4, y G y F empatan 6-5. Las dos funciones viejas
   ordenaban SOLO por pct, así que el orden entre ellos dependía del
   orden de inserción. Acá lo decide la diferencia de puntos. */
const iD = t.findIndex(r => r.clave === 'D'), iE = t.findIndex(r => r.clave === 'E');
check('dos equipos con el mismo PCT se desempatan por diferencia',
  iD < iE, 'D=' + iD + ' E=' + iE);

/* Y el desempate es CONFIGURABLE: con otro criterio, el orden cambia.
   Es lo que hace que `ordenTabla` no sea decorativo. */
const porPF = CL.tabla(idxFalso([
  { clave: 'X', pg: 5, pp: 5, pf: 800, pc: 900 },   // peor DIF, más PF
  { clave: 'Y', pg: 5, pp: 5, pf: 700, pc: 700 },   // mejor DIF, menos PF
]), { formato: null, orden: ['PCT', 'DIF'] });
check('con DIF de segundo criterio gana el de mejor diferencia',
  porPF[0].clave === 'Y', porPF.map(r => r.clave).join(''));
const porPF2 = CL.tabla(idxFalso([
  { clave: 'X', pg: 5, pp: 5, pf: 800, pc: 900 },
  { clave: 'Y', pg: 5, pp: 5, pf: 700, pc: 700 },
]), { formato: null, orden: ['PCT', 'PF'] });
check('y con PF de segundo criterio gana el que más anotó',
  porPF2[0].clave === 'X', porPF2.map(r => r.clave).join(''));

/* PC es el único criterio invertido: recibir menos puntos es mejor. */
const porPC = CL.tabla(idxFalso([
  { clave: 'X', pg: 5, pp: 5, pf: 700, pc: 900 },
  { clave: 'Y', pg: 5, pp: 5, pf: 700, pc: 600 },
]), { formato: null, orden: ['PCT', 'PC'] });
check('PC ordena al revés: menos puntos en contra es mejor',
  porPC[0].clave === 'Y', porPC.map(r => r.clave).join(''));

/* El último desempate es el nombre. Arbitrario, sí, pero ESTABLE: dos
   equipos empatados en todo no pueden intercambiarse entre repintados
   cuando el puesto define un descenso. */
const empate = idxFalso([
  { clave: 'ZETA', pg: 5, pp: 5, pf: 700, pc: 700 },
  { clave: 'ALFA', pg: 5, pp: 5, pf: 700, pc: 700 },
]);
check('empatados en todo, desempata el nombre y el orden es estable',
  CL.tabla(empate, { formato: null })[0].clave === 'ALFA');
check('y repetir el cálculo da lo mismo',
  CL.tabla(empate, { formato: null }).map(r => r.clave).join() ===
  CL.tabla(empate, { formato: null }).map(r => r.clave).join());

/* Un criterio que no existe se ignora en vez de romper el orden. */
check('un criterio inventado no rompe la tabla',
  CL.tabla(LIGA12, { formato: null, orden: ['INVENTADO', 'PCT'] })[0].clave === 'A');
check('y una lista de criterios vacía cae al orden por defecto',
  CL.tabla(LIGA12, { formato: null, orden: [] })[0].clave === 'A');

/* ==================================================================== */
titulo('LA TABLA RESPONDE A LA CONFIG');

check('cada puesto trae su zona resuelta',
  t[0].zona.id === 'campeon' && t[1].zona.id === 'playoffs' &&
  t[8].zona.id === 'repechaje' && t[10].zona.id === 'descenso',
  t.map(r => r.zona && r.zona.id).join(','));
check('y la zona trae su tono, que es lo que pinta la fila',
  t[0].zona.tono === 'exito' && t[11].zona.tono === 'peligro');

/* EL PUNTO DEL MÓDULO: mover un corte en el JSON mueve la zona en la
   tabla, sin tocar una línea de código. */
const otroCorte = CFG.formatoDeTramo(CFG.parsear({ competencia: {
  formatos: { f: { zonas: [
    { id: 'playoffs', desde: 1, hasta: 4, label: 'Playoffs', tono: 'positivo' },
    { id: 'descenso', desde: -4, label: 'Descenso', tono: 'peligro' },
  ] } }, porTramo: { '*': 'f' } } }), 'IDA', 'REGULAR');
const t2 = CL.tabla(LIGA12, { formato: otroCorte });
check('con 4 clasificados, el 5º ya no entra a playoffs',
  t2[3].zona.id === 'playoffs' && t2[4] .zona === null,
  t2.map(r => r.zona && r.zona.id).join(','));
check('y con 4 descensos, bajan del 9 al 12',
  [8, 9, 10, 11].every(i => t2[i].zona.id === 'descenso'));

/* Y con OTRA cantidad de equipos, la misma config mueve el descenso
   sola. Es el motivo entero de los índices negativos. */
const LIGA14 = idxFalso(Array.from({ length: 14 }, (_, i) => ({
  clave: 'E' + String(i + 1).padStart(2, '0'),
  pg: 14 - i, pp: i, pf: 1000 - i * 10, pc: 800 + i * 10,
})));
const t14 = CL.tabla(LIGA14, { formato: F12 });
check('con 14 equipos el descenso se corre al 13 y 14',
  t14[12].zona.id === 'descenso' && t14[13].zona.id === 'descenso');
check('y el 11 y el 12 ya no descienden',
  t14[10].zona === null && t14[11].zona === null,
  JSON.stringify([t14[10].zona && t14[10].zona.id, t14[11].zona && t14[11].zona.id]));

/* ==================================================================== */
titulo('FALLBACK · sin config la tabla sale igual, sin colores');

const sinZonas = CL.tabla(LIGA12, { formato: null });
check('sin formato la tabla trae las 12 filas igual', sinZonas.length === 12);
check('y todas sin zona', sinZonas.every(r => r.zona === null));
check('pero con puesto: el orden no depende de la config',
  sinZonas[0].puesto === 1 && sinZonas[0].clave === 'A');

/* El tramo apagado con `null` explícito llega acá como formato null y
   tiene que comportarse igual que no tener config. */
check('un tramo con las zonas apagadas se comporta como sin config',
  CL.tabla(LIGA12, { formato: CFG.formatoDeTramo(CONFIG, 'PLAYOFFS', 'FINAL') })
    .every(r => r.zona === null));

/* ==================================================================== */
titulo('LAS DOS FUNCIONES VIEJAS SE FUERON');

const html = fs.readFileSync('./index.html', 'utf8');
/* Se borraron de verdad, no quedaron muertas: una función que ya no se
   llama igual se edita creyendo que hace algo (pasó con
   `buildEquiposLegacy`, que quedó fuera del router y siguió pidiendo dos
   hojas por arranque durante meses). */
check('renderStandingsTable ya no está definida',
  !/^function renderStandingsTable/m.test(html));
check('renderFullStandingsTable tampoco',
  !/^function renderFullStandingsTable/m.test(html));
check('y nadie las llama',
  html.indexOf('renderStandingsTable(') === -1 &&
  html.indexOf('renderFullStandingsTable(') === -1);

/* Las zonas hardcodeadas eran el defecto que este módulo vino a cerrar:
   ocho a playoffs para todos los clientes y todas las categorías. */
/* Se busca el CÓDIGO, no el texto: el comentario que documenta el defecto
   viejo menciona `pos <= 8` a propósito, y un test que se tropiece con su
   propia documentación obliga a borrar justo lo que hay que conservar. */
check('las zonas hardcodeadas por posición se fueron',
  !/if \(pos <= \d+\)\s*colorClass/.test(html) &&
  !/colorClass = '!border-/.test(html));
check('y los colores crudos de Tailwind que no sobrevivían al papel también',
  html.indexOf("'!border-green-500'") === -1 &&
  html.indexOf("'!border-yellow-500'") === -1);

/* Principal conserva su resumen y usa el MISMO componente. Si volviera a
   tener render propio, las dos tablas podrían contradecirse. */
check('Principal resume con el componente compartido',
  /function renderClasificacionResumen/.test(html) &&
  /clasifTablaHTML\(idx, \{ columnas: 'resumida'/.test(html));
check('y su contenedor tiene id para repintarse solo',
  html.indexOf('id="principalClasif"') >= 0);

/* La cascada de estado: al cambiar de tramo, las dos superficies se
   repintan. Sin esto, cambiar de fase dejaba la tabla vieja en pantalla. */
const app = fs.readFileSync('./js/sgadd-app.js', 'utf8');
check('onCambio repinta la sección Clasificación',
  /currentSection === 'clasificacion'[\s\S]{0,160}buildClasificacion\(\)/.test(app));
check('y el resumen de Principal, solo su contenedor',
  /getElementById\('principalClasif'\)[\s\S]{0,120}renderClasificacionResumen\(\)/.test(app));
/* Principal NO se repinta entero: su gráfico ya colgó la página una vez
   con un ciclo de repintado (punto 6). */
check('Principal no se repinta entero desde onCambio',
  !/currentSection === 'principal'[\s\S]{0,200}renderSection\('principal'\)/.test(app));

/* La sección está en el router y en el nav, o existe y no se puede abrir. */
check('clasificacion está en VALID_SECTIONS',
  /VALID_SECTIONS = \[[^\]]*'clasificacion'/.test(html));
check('el router la sabe pintar',
  /case 'clasificacion': root\.innerHTML = buildClasificacion\(\)/.test(html));
check('y tiene su entrada en el menú',
  html.indexOf(`data-nav="clasificacion"`) >= 0);
check('el módulo se carga después de sgadd-app, que es de quien depende',
  html.indexOf('sgadd-clasificacion.js') > html.indexOf('sgadd-app.js'));

console.log('\n' + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
