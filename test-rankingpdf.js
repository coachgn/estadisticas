/* =====================================================================
   SGADD · EXPORTAR EL RANKING DEL PLANTEL

   LA AUDITORÍA QUE ORDENA TODO ESTE ARCHIVO, y que se hizo sobre el
   código real antes de escribir una línea del modal:

   El ranking NO es una tabla ancha. Son OCHO grupos de 4 a 6 columnas y
   en pantalla se ve UNO por vez. Entre los ocho hay 35 métricas
   distintas, TODAS de jugador. Verificado en el navegador con el plantel
   real de ATENAS 'B' (24 jugadores): la tabla en pantalla tenía
   `# · Jugador · PJ · MIN · PTS · PLAYS · PPP · +/-`, o sea SEIS
   métricas, no treinta y cinco.

   NO EXISTEN acá los Four Factors —son de EQUIPO, viven en
   `PROMEDIOS 4F`—, ni `PER`, ni una tasa de rebote tipo `%REB`. Hay
   tests abajo que fallan si alguna de esas aparece en un preset.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const J = require('./js/sgadd-jugadores.js');
const S = require('./js/sgadd-core.js');

let pasados = 0, fallados = 0;
function ok(cond, nombre, detalle) {
  if (cond) { pasados++; return; }
  fallados++;
  console.log('  ✗ ' + nombre + (detalle ? '  →  ' + detalle : ''));
}
function igual(a, b, nombre) {
  ok(JSON.stringify(a) === JSON.stringify(b), nombre,
     'esperaba ' + JSON.stringify(b) + ' y dio ' + JSON.stringify(a));
}
function bloque(t) { console.log('\n' + t); }

/* `sgadd-jugadores.js` usa `SGADD` como global del navegador: sin esto,
   ejercer el motor revienta con ReferenceError. */
global.SGADD = S;

/* El módulo toca `document` solo al pintar; el motor de columnas es puro
   y se puede requerir. Se le da el global que espera. */
global.JUGADORES_RANKINGS = J.JUGADORES_RANKINGS;
const R = require('./js/sgadd-rankingpdf.js');

/* =====================================================================
   1 · EL UNIVERSO SALE DEL CATÁLOGO
   ===================================================================== */
bloque('1 · El universo es el del ranking, no una lista propia');

const DEL_CATALOGO = [];
J.JUGADORES_RANKINGS.forEach(g => g.cols.forEach(k => {
  if (DEL_CATALOGO.indexOf(k) === -1) DEL_CATALOGO.push(k);
}));

igual(R.todasLasClaves().sort(), DEL_CATALOGO.slice().sort(),
      'el modal ofrece EXACTAMENTE las métricas de los ocho grupos');
igual(R.todasLasClaves().length, 35, 'que medidas son treinta y cinco');

/* Una métrica se lista UNA vez. `MIN` está en los ocho grupos, y ocho
   casillas para la misma columna es una forma segura de que el DT
   destilde una y crea que sacó la columna. */
const todas = R.todasLasClaves();
igual(todas.length, new Set(todas).size, 'sin repetir una sola métrica');
const conMin = R.grupos().filter(g => g.cols.indexOf('MIN') > -1);
igual(conMin.length, 1, '`MIN` aparece en un solo grupo del modal aunque esté en los ocho');

/* Y el orden es el del catálogo, no el orden en que se tildaron: dos
   exportaciones con las mismas métricas tienen que dar la misma tabla. */
const enOrden = R.todasLasClaves();
igual(enOrden.slice(0, 6), J.JUGADORES_RANKINGS[0].cols,
      'y respeta el orden del catálogo');

/* Si mañana se agrega un grupo, el modal lo tiene que ofrecer solo. Se
   verifica ejerciendo, no leyendo el fuente: se le mete un grupo al
   catálogo vivo y se pregunta. */
const original = J.JUGADORES_RANKINGS.slice();
global.JUGADORES_RANKINGS = original.concat([
  { id: '__prueba__', titulo: 'Inventado', orden: 'PR', cols: ['PR', 'TC'] },
]);
ok(R.todasLasClaves().indexOf('PR') > -1,
   'un grupo NUEVO en el catálogo entra al modal sin tocar el módulo');
global.JUGADORES_RANKINGS = original;
ok(R.todasLasClaves().indexOf('PR') === -1, '  y al sacarlo, se va');

/* =====================================================================
   2 · LOS PRESETS NO INVENTAN NADA

   Es la regla estricta del pedido. Cada clave de cada preset tiene que
   existir en el catálogo del ranking.
   ===================================================================== */
bloque('2 · Los tres presets');

igual(R.PRESETS.map(p => p.id), ['basicas', 'avanzadas', 'todas'],
      'están los tres presets pedidos');

R.PRESETS.forEach(p => {
  const cols = R.colsDePreset(p.id);
  ok(cols.length > 0, p.id + ' resuelve alguna columna');
  cols.forEach(k => ok(DEL_CATALOGO.indexOf(k) > -1,
    '  ' + p.id + ' · ' + k + ' existe en el ranking'));
});

/* LOS PROHIBIDOS. `PER` no está en `METRICAS` ni la escribe MotorStats;
   `%REB` no existe —el grupo de rebotes trae CUENTAS (RO, RD, RT)—; y
   los Four Factors son de EQUIPO. Si alguna aparece, alguien la inventó. */
const INVENTADAS = ['PER', '%REB', 'REB%', '%USG', '%TS', '%AST', '%eFG',
  'eFG% Opp', 'RO Opp%', 'RTL% Opp', 'T1R', 'NET RTNG', 'RTNG OFF', 'RTNG DEF', 'PACE'];
INVENTADAS.forEach(k => {
  ok(DEL_CATALOGO.indexOf(k) === -1, k + ' NO es columna del ranking');
  R.PRESETS.forEach(p => ok(R.colsDePreset(p.id).indexOf(k) === -1,
    '  y ningún preset la pide (' + p.id + ')'));
});
/* Y ninguna es siquiera una métrica del panel, salvo las de equipo. */
ok(!S.METRICAS['PER'], '`PER` no existe en METRICAS: no la escribe el motor');

/* «Todas» es todas, no una lista escrita a mano que se desactualiza. */
igual(R.colsDePreset('todas').sort(), DEL_CATALOGO.slice().sort(),
      '«Seleccionar todas» sale del catálogo vivo');

/* BÁSICAS entra en VERTICAL, y eso es la mitad de su valor: es el preset
   que el DT usa siempre y no tiene por qué salir apaisado. */
ok(R.colsDePreset('basicas').length <= R.COLS_VERTICAL,
   '«Básicas» no pasa el corte de la hoja vertical',
   R.colsDePreset('basicas').length + ' columnas');
/* AVANZADAS sí lo pasa: son métricas analíticas y son más. */
ok(R.colsDePreset('avanzadas').length > R.COLS_VERTICAL,
   '«Avanzadas» sí, y por eso gira la hoja',
   R.colsDePreset('avanzadas').length + ' columnas');

/* `AST` a secas NO es columna de ningún grupo, así que «asistencias» en
   el preset básico se cubre con `AST-PP`, que sí lo es. Documentarlo acá
   evita que alguien la agregue creyendo que falta. */
ok(DEL_CATALOGO.indexOf('AST') === -1,
   '`AST` no es columna del ranking: lo que hay es AST-PP y AST%');
ok(R.colsDePreset('basicas').indexOf('AST-PP') > -1,
   '  y el preset básico usa AST-PP en su lugar');

/* =====================================================================
   3 · LA TABLA DEL PAPEL SALE DEL MISMO MOTOR

   Recalcularla por otro camino daría un PDF que puede contradecir a la
   pantalla que el DT tiene delante — el bug del rol funcional (punto 8).
   ===================================================================== */
bloque('3 · El papel no puede contradecir a la pantalla');

const FUENTE = fs.readFileSync(path.join(__dirname, 'js/sgadd-rankingpdf.js'), 'utf8');
ok(/jugadoresRanking\(idx,/.test(FUENTE),
   'el export llama al motor de la pantalla');
ok(/pool: plantel/.test(FUENTE) && /ambito: 'plantel'/.test(FUENTE),
   '  con el mismo pool y el mismo ámbito');
ok(/ordenPor: JUGADORES\.plantelRankingOrdenPor/.test(FUENTE),
   '  y con el orden que el DT eligió en pantalla');
ok(/JUGADORES\.plantelRankingModo/.test(FUENTE),
   '  y con la misma escala (promedios o totales)');
ok(/rankingTexto/.test(FUENTE),
   'y las celdas se formatean con el mismo texto, incluido el ≡ del total');

/* =====================================================================
   3 bis · LAS COLUMNAS SON UN PARÁMETRO DEL MOTOR

   EL BUG QUE SOLO APARECIÓ MIRANDO EL PAPEL. `jugadoresRanking()`
   armaba las celdas con `g.cols` —las del grupo abierto— así que el PDF
   con las 35 tildadas salía con las SEIS del grupo y las otras
   veintinueve en «—». Ni la suite ni el chequeo de sintaxis lo veían:
   las columnas estaban, con guiones. Se cazó renderizando el modo papel
   y mirándolo.

   Se ejerce el motor de verdad, con un índice real armado acá.
   ===================================================================== */
bloque('3 bis · El motor devuelve las columnas que se le piden');

const colsE = ['EQUIPO', 'FASE', 'PJ', 'PTS'];
const filasE = [{ EQUIPO: 'A', FASE: 'REGULAR', PJ: '10', PTS: '70' },
                { EQUIPO: 'B', FASE: 'REGULAR', PJ: '10', PTS: '68' }];
const colsJ = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PJ', 'PTS', 'PLAYS', 'PPP',
               'USG%', 'eFG%', 'TS%', 'RO', 'RD', 'AST%', 'T3I', 'T3%'];
const filasJ = [];
for (let i = 0; i < 8; i++) {
  filasJ.push({ NOMBRES: 'J' + i, EQUIPO: 'A', FASE: 'REGULAR',
    MIN: String(20 + i), PJ: '10', PTS: String(10 + i), PLAYS: '12',
    PPP: '1,05', 'USG%': '0,2' + i, 'eFG%': '0,4' + i, 'TS%': '0,5' + i,
    RO: String(1 + i), RD: String(3 + i), 'AST%': '0,1' + i,
    T3I: String(2 + i), 'T3%': '0,3' + i });
}
filasJ.push({ NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '20', PTS: '8' });
const idxR = S.construirIndice({
  'PROMEDIOS E': { cols: colsE, filas: filasE },
  'PROMEDIOS J': { cols: colsJ, filas: filasJ },
}, { fase: 'REGULAR' });
const planR = idxR.liga.jugadoresPorEquipo.get('A') || [];
ok(planR.length === 8, 'la fixture arma un plantel de ocho', planR.length);

/* SIN `cols` se comporta como siempre: las del grupo. */
const rSin = J.jugadoresRanking(idxR, 'produccion',
  { pool: planR, ambito: 'plantel', umbral: 0, topN: 8 });
igual(rSin.columnas, J.JUGADORES_RANKINGS[0].cols,
      'sin `cols` devuelve las del grupo, como la pantalla');

/* CON `cols` de VARIOS grupos, todas tienen que traer valor. */
const PEDIDAS = ['PJ', 'MIN', 'PTS', 'USG%', 'eFG%', 'TS%', 'RO', 'RD', 'AST%'];
const rCon = J.jugadoresRanking(idxR, 'produccion',
  { pool: planR, ambito: 'plantel', umbral: 0, topN: 8, cols: PEDIDAS });
igual(rCon.columnas, PEDIDAS, 'con `cols` devuelve exactamente las pedidas');

const vacias = PEDIDAS.filter(k => rCon.filas.every(f => f.celdas[k] === null
  || f.celdas[k] === undefined));
igual(vacias, [], 'y NINGUNA columna pedida viene vacía');

/* Las de otro grupo tienen que traer el MISMO número que si se pidiera
   ese grupo: es la garantía de que el papel no contradice a la pantalla. */
const rEfi = J.jugadoresRanking(idxR, 'eficiencia',
  { pool: planR, ambito: 'plantel', umbral: 0, topN: 8 });
const porNombre = (r) => { const m = {}; r.filas.forEach(f => m[f.jugador] = f.celdas); return m; };
const a = porNombre(rCon), b = porNombre(rEfi);
const difieren = Object.keys(a).filter(n => b[n] && 
  ['USG%', 'eFG%', 'TS%'].some(k => a[n][k] !== b[n][k]));
igual(difieren, [],
      'y una métrica pedida desde otro grupo vale exactamente lo mismo');

/* Las medianas también se calculan sobre las pedidas, o el anillo de
   referencia quedaría solo en las del grupo. */
const sinMediana = PEDIDAS.filter(k => rCon.medianas[k] === undefined);
igual(sinMediana, [], 'las medianas cubren las columnas pedidas');

/* La de ORDEN entra siempre aunque no se muestre: la usa el desempate. */
const rSinOrden = J.jugadoresRanking(idxR, 'produccion',
  { pool: planR, ambito: 'plantel', umbral: 0, topN: 8, cols: ['MIN'] });
ok(rSinOrden.filas.every(f => f.celdas['PTS'] !== undefined),
   'la métrica de orden se calcula aunque no se haya pedido como columna');
igual(rSinOrden.columnas, ['MIN'], '  pero no se muestra');

/* =====================================================================
   4 · LA HOJA SE GIRA SOLA
   ===================================================================== */
bloque('4 · Orientación y cortes');

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const ESTILO = (HTML.match(/\n<style>\n[\s\S]*?<\/style>/) || [''])[0];

/* Va con `@page` NOMBRADA: `@page` a secas no se puede condicionar por
   clase (punto 7.7), y la vertical la comparten el informe de equipo y
   el post-partido. Girarla de raíz les cambiaría el tamaño a los dos. */
ok(/@page rankingAncho \{ size: A4 landscape; margin: 8mm; \}/.test(ESTILO),
   'existe la `@page` apaisada del ranking, con el margen pedido');
ok(/\.rank-hoja\.rank-ancha \{ page: rankingAncho; \}/.test(ESTILO),
   'y se aplica por clase, no de raíz');
ok(/@page \{[^}]*A4 portrait/.test(ESTILO) || /size: A4 portrait/.test(ESTILO),
   '  la vertical de las otras exportaciones sigue intacta');

/* El módulo marca la clase por CANTIDAD de columnas, no a ojo. */
ok(/cols\.length > COLS_VERTICAL/.test(FUENTE),
   'la clase apaisada se decide por cuántas columnas se eligieron');
igual(R.COLS_VERTICAL, 6, 'y el corte son 6, como pidió el club');

/* NINGUNA FILA SE PARTE. Sin esto un jugador queda con el nombre en una
   hoja y sus números en la siguiente. */
ok(/#rankingSalida \.rank-tabla tr,[\s\S]{0,80}break-inside: avoid/.test(ESTILO),
   '`break-inside: avoid` en cada fila');
ok(/#rankingSalida \.rank-tabla thead \{ display: table-header-group; \}/.test(ESTILO),
   'y el encabezado se repite arriba de cada hoja');

/* A lo ANCHO: el `min-width` de `.scrollbox` es un estilo INLINE, así que
   sin `!important` no se le puede ganar (misma trampa que la tabla de
   marcas, punto 7.3). */
ok(/#rankingSalida[\s\S]{0,120}min-width: 0 !important/.test(ESTILO),
   'y el `min-width` inline se anula con !important');
ok(/table-layout: auto/.test(ESTILO),
   'la tabla usa `table-layout: auto`: con `fixed` la columna de nombres mide lo mismo que PJ');

/* El escalado tipográfico por tramos. */
ok(/\.rank-hoja\.rank-ancha \.rank-tabla \{ font-size/.test(ESTILO),
   'la tipografía baja al girar la hoja');
ok(/\.rank-hoja\.rank-apretada \.rank-tabla \{ font-size/.test(ESTILO),
   '  y baja más con muchas columnas');

/* =====================================================================
   5 · EL FLUJO NO DEJA RASTRO

   La pantalla tiene que quedar exactamente como estaba. Es la misma
   regla que las otras cuatro exportaciones.
   ===================================================================== */
bloque('5 · Se limpia solo');

ok(/window\.addEventListener\('afterprint'/.test(FUENTE),
   'la limpieza cuelga de `afterprint`');
ok(/setTimeout\(alTerminar, 60000\)/.test(FUENTE),
   '  con respaldo de 60 s, porque `afterprint` no llega siempre');
ok(/classList\.remove\('modo-ranking-print'\)/.test(FUENTE),
   'se saca el modo de papel');
ok(/getElementById\('rankingSalida'\)[\s\S]{0,60}remove\(\)/.test(FUENTE),
   'y se borra el documento generado');
ok(/restaurarImagenes/.test(FUENTE),
   'y se devuelven los escudos a su `src` original');
ok(/embeberImagenes/.test(FUENTE),
   'que se habían serializado para que no falten en el PDF (punto 7.5)');
ok(/tituloPdf/.test(FUENTE),
   'el archivo sale con nombre propio y no con el del navegador (punto 7.8)');

/* El modo NUEVO tiene que estar en MODOS_PAPEL o los gráficos —y los
   colores que resuelven contra el fondo— salen con la paleta oscura. */
const CHARTS = fs.readFileSync(path.join(__dirname, 'js/sgadd-charts.js'), 'utf8');
ok(/MODOS_PAPEL[\s\S]{0,200}modo-ranking-print/.test(CHARTS),
   '`modo-ranking-print` está en MODOS_PAPEL');

/* =====================================================================
   6 · EL MODAL

   Se EJERCE con un DOM de mentira: un grep no distingue un modal que se
   pinta de uno que revienta al pintarse — es lo que ya pasó con el botón
   de publicar partidos manuales (punto 44).
   ===================================================================== */
bloque('6 · El modal se pinta de verdad');

function domFalso() {
  const nodos = {};
  const crear = (tag) => {
    const n = { tagName: (tag || 'div').toUpperCase(), id: '', className: '',
      innerHTML: '', children: [], style: {}, disabled: false,
      appendChild(c) { this.children.push(c); if (c.id) nodos[c.id] = c; return c; },
      remove() {}, focus() {}, querySelector() { return null; },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {}, contains() { return false; } },
      addEventListener() {}, removeEventListener() {},
      setAttribute() {}, getAttribute() { return null; } };
    return n;
  };
  return {
    nodos,
    createElement: crear,
    getElementById: (id) => nodos[id] || null,
    addEventListener() {}, removeEventListener() {},
    body: crear('body'),
    activeElement: null,
    querySelectorAll() { return []; },
  };
}

const ctx = {
  console, module: { exports: {} },
  JUGADORES_RANKINGS: J.JUGADORES_RANKINGS,
  JUGADORES: { filtroEquipo: 'ATENAS A', plantelRankingAbierto: 'produccion',
               plantelRankingModo: 'promedio', plantelRankingOrdenPor: null,
               plantelRankingOrdenDir: 'desc' },
  SGADD_UI: { esc: String, escJs: String, pieInforme: () => 'pie',
              embeberImagenes() {}, restaurarImagenes() {}, tituloPdf() {},
              sanearNombreArchivo: (a, b) => a || b },
  SGADD: S, SGADD_APP: { estado: {} },
  document: domFalso(),
  window: { addEventListener() {}, removeEventListener() {}, print() {} },
  setTimeout, clearTimeout,
};
ctx.global = ctx;
vm.createContext(ctx);
let reventó = null;
try {
  new vm.Script(fs.readFileSync(path.join(__dirname, 'js/sgadd-rankingpdf.js'), 'utf8'))
    .runInContext(ctx);
  /* Se toma de `module.exports` y NO de `ctx.SGADD_RANKPDF`: un `const` de
     nivel superior en un `vm.Script` vive en el ámbito del script y NO se
     cuelga del contexto, así que buscarlo ahí da `undefined` y el test
     "pasaría" sin haber ejercido nada. */
  ctx.module.exports.abrir({ liga: { jugadoresPorEquipo: new Map() } });
} catch (e) { reventó = e.message; }
ok(!reventó, 'el modal se pinta sin reventar', reventó);

const M = ctx.module.exports;
ok(M && typeof M.generar === 'function', 'y expone `generar`');
ok(M && typeof M.preset === 'function', 'y los presets');
ok(M && typeof M.alternar === 'function', 'y el alternar de una casilla');

/* Arranca con el preset básico tildado: abrir con cero casillas y el
   botón apagado se lee como que la pantalla está rota. */
ok(M.seleccion().length > 0, 'abre con algo ya elegido');
/* Se comparan como CONJUNTOS: `seleccion()` devuelve en el orden del
   CATÁLOGO y no en el que el preset las declara, que es justo la
   propiedad de arriba — dos exportaciones con las mismas métricas
   tienen que dar la misma tabla, sin importar cómo se eligieron. */
igual(M.seleccion().slice().sort(), R.colsDePreset('basicas').slice().sort(),
      '  y lo que arranca elegido es el preset básico');

/* Tocar un preset REEMPLAZA, no acumula: «Métricas básicas» después de
   «Todas» tiene que dejar seis, no treinta y cinco. */
M.preset('todas');
igual(M.seleccion().length, 35, '«Todas» tilda las 35');
M.preset('basicas');
igual(M.seleccion().length, 6, 'y «Básicas» las REEMPLAZA, no las suma');

/* Alternar respeta el orden del catálogo y no el de los clics. */
M.preset('basicas');
M.alternar('T3%'); M.alternar('PJ');
const sel = M.seleccion();
igual(sel.indexOf('T3%') > sel.indexOf('eFG%'), true,
      'lo elegido sale en el orden del catálogo, no en el que se tildó');
ok(sel.indexOf('PJ') === -1, 'y destildar saca la columna');

/* =====================================================================
   7 · TOUCH Y MODALES · lo del punto 49 vale también acá
   ===================================================================== */
bloque('7 · Táctil y modal');

ok(/modal-acciones/.test(FUENTE),
   'la fila de acciones usa la barra pegajosa compartida');
ok(/max-h-\[90vh\][\s\S]{0,24}overflow-y-auto/.test(FUENTE),
   'y el panel acota su alto y scrollea: con 35 casillas no entra en un teléfono');
ok(/role="dialog"/.test(FUENTE),
   'declara `role="dialog"`, que es como se oculta al imprimir');
/* Las casillas van dentro de un `<label>`: el bloque táctil le da 44px a
   la etiqueta y NO al checkbox, que quedaría una caja gigante. */
ok(/<label[\s\S]{0,400}<input type="checkbox"/.test(FUENTE),
   'cada casilla vive dentro de su etiqueta, que es lo que el dedo toca');

console.log('\n' + '─'.repeat(60));
if (fallados === 0) console.log('✓ TODO OK · ' + pasados + ' tests');
else { console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados)); process.exitCode = 1; }
