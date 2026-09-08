/* =====================================================================
   SGADD · EXPORTAR EL RANKING DEL PLANTEL

   LA UNIDAD ES LA CARD, NO LA MÉTRICA SUELTA.

   El ranking son OCHO cards y cada una tiene su propio ORDEN: `PTS` en
   participación, `eFG%` en eficiencia, `RO` en rebotes, `AST-PP` en
   creación. Juntar las 35 métricas en una sola tabla no es una decisión
   de formato: colapsa ocho rankings en uno y el `#` deja de significar
   nada en los otros siete. El primero de «Rebotes» no es el primero de
   «Tiro de 3», y ésa es la pregunta que cada card contesta.

   Auditado sobre el código real: los ocho grupos, 4 a 6 columnas cada
   uno, y en pantalla se ve UNO por vez — verificado en el navegador con
   ATENAS 'B' (24 jugadores), la tabla tenía seis métricas.

   NO EXISTEN acá los Four Factors —son de EQUIPO, viven en
   `PROMEDIOS 4F`—, ni `PER`, ni una tasa de rebote tipo `%REB`. Hay
   tests abajo que fallan si alguna aparece.
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
global.JUGADORES_RANKINGS = J.JUGADORES_RANKINGS;
const R = require('./js/sgadd-rankingpdf.js');

/* =====================================================================
   1 · LAS CARDS SALEN DEL CATÁLOGO
   ===================================================================== */
bloque('1 · La unidad es la card');

igual(R.cardsIds(), J.JUGADORES_RANKINGS.map(g => g.id),
      'el modal ofrece EXACTAMENTE las cards del ranking, en su orden');
igual(R.cardsIds().length, 8, 'que son ocho');

/* Cada card conserva SU orden y SUS columnas: es lo que la hace una
   tabla distinta y no un recorte de otra. */
R.cards().forEach(c => {
  const g = J.JUGADORES_RANKINGS.filter(x => x.id === c.id)[0];
  igual(c.cols, g.cols, c.id + ' conserva sus columnas exactas');
  igual(c.orden, g.orden, c.id + ' conserva su orden: ' + g.orden);
});

/* LAS COLUMNAS NO SE DEDUPLICAN ENTRE CARDS. `MIN` está en las ocho y en
   las ocho tiene que salir, porque cada tabla se lee sola. La versión
   anterior las deduplicaba —tenía sentido con UNA tabla— y acá dejaría
   siete tablas sin minutos. */
const conMin = R.cards().filter(c => c.cols.indexOf('MIN') > -1);
igual(conMin.length, 8, '`MIN` sale en las ocho tablas, no en una sola');

/* Si mañana se agrega una card, el modal la ofrece sola. Se verifica
   ejerciendo, no leyendo el fuente. */
const original = J.JUGADORES_RANKINGS.slice();
global.JUGADORES_RANKINGS = original.concat([
  { id: '__prueba__', titulo: 'Inventada', orden: 'PR', cols: ['PR', 'TC'] },
]);
ok(R.cardsIds().indexOf('__prueba__') > -1,
   'una card NUEVA entra al modal sin tocar el módulo');
global.JUGADORES_RANKINGS = original;
ok(R.cardsIds().indexOf('__prueba__') === -1, '  y al sacarla, se va');

/* =====================================================================
   2 · LOS PRESETS AGRUPAN CARDS, Y NO INVENTAN NADA
   ===================================================================== */
bloque('2 · Los tres presets');

igual(R.PRESETS.map(p => p.id), ['basicas', 'avanzadas', 'todas'],
      'están los tres presets pedidos');

R.PRESETS.forEach(p => {
  const ids = R.cardsDePreset(p.id);
  ok(ids.length > 0, p.id + ' resuelve alguna card');
  ids.forEach(id => ok(R.cardsIds().indexOf(id) > -1,
    '  ' + p.id + ' · ' + id + ' existe en el ranking'));
});

igual(R.cardsDePreset('todas'), R.cardsIds(),
      '«Seleccionar todas» son LAS OCHO, del catálogo vivo');

/* Básicas y avanzadas parten las ocho sin superponerse ni dejar huecos:
   si una card quedara en las dos, elegir un preset y después el otro
   daría dos veces la misma tabla en cabeza del DT. */
const B = R.cardsDePreset('basicas'), A = R.cardsDePreset('avanzadas');
igual(B.filter(x => A.indexOf(x) > -1), [],
      'básicas y avanzadas no comparten ninguna card');
igual(B.concat(A).sort(), R.cardsIds().slice().sort(),
      'y entre las dos cubren las ocho');

/* LOS PROHIBIDOS: ninguna card del ranking los declara. */
const DEL_CATALOGO = [];
J.JUGADORES_RANKINGS.forEach(g => g.cols.forEach(k => {
  if (DEL_CATALOGO.indexOf(k) === -1) DEL_CATALOGO.push(k);
}));
igual(DEL_CATALOGO.length, 35, 'entre las ocho hay 35 métricas distintas');
const INVENTADAS = ['PER', '%REB', 'REB%', '%USG', '%TS', '%AST', '%eFG',
  'eFG% Opp', 'RO Opp%', 'NET RTNG', 'RTNG OFF', 'RTNG DEF', 'PACE'];
INVENTADAS.forEach(k => ok(DEL_CATALOGO.indexOf(k) === -1,
  k + ' NO es columna de ninguna card'));
ok(!S.METRICAS['PER'], '`PER` no existe en METRICAS: no la escribe el motor');
ok(DEL_CATALOGO.indexOf('AST') === -1,
   '`AST` no es columna del ranking: lo que hay es AST-PP y AST%');

/* Ninguna card llega a siete columnas, así que el documento completo
   sale VERTICAL. La regla de giro queda para el día que una crezca. */
const masAncha = Math.max.apply(null, R.cards().map(c => c.cols.length));
ok(masAncha <= R.COLS_VERTICAL,
   'ninguna card pasa el corte de la hoja vertical', masAncha + ' columnas');
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
/* =====================================================================
   3 · CADA TABLA SALE DEL MISMO MOTOR, CON SU PROPIO ORDEN

   Recalcularlas por otro camino daría un PDF que puede contradecir a la
   pantalla — el bug del rol funcional (punto 8).
   ===================================================================== */
bloque('3 · El papel no puede contradecir a la pantalla');

const FUENTE = fs.readFileSync(path.join(__dirname, 'js/sgadd-rankingpdf.js'), 'utf8');
ok(/jugadoresRanking\(idx, id,/.test(FUENTE),
   'cada card llama al motor CON SU PROPIO id, que es lo que le da su orden');
ok(/pool: plantel/.test(FUENTE) && /ambito: 'plantel'/.test(FUENTE),
   '  con el mismo pool y el mismo ámbito');
ok(/JUGADORES\.plantelRankingModo/.test(FUENTE),
   '  y con la misma escala (promedios o totales)');
/* El orden MANUAL de la pantalla NO se propaga: vale para la card que el
   DT tiene abierta, y aplicárselo a las ocho reordenaría siete por una
   métrica que ni siquiera tienen. */
ok(!/ordenPor: JUGADORES\.plantelRankingOrdenPor/.test(FUENTE),
   'el orden manual de la pantalla NO se le aplica a las ocho tablas');
ok(/rankingTexto/.test(FUENTE),
   'y las celdas se formatean con el mismo texto, incluido el ≡ del total');

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
ok(/@page rankingAncho \{ size: A4 landscape; margin: 8mm;[^}]*\}/.test(ESTILO),
   'existe la `@page` apaisada del ranking, con el margen pedido');
/* Y le reserva abajo los 15mm del pie fijo: sin eso la barra pisa la
   última línea de cada hoja, y eso NO se ve auditando en pantalla. */
ok(/@page rankingAncho \{[^}]*margin-bottom: 15mm/.test(ESTILO),
   '  y reserva abajo el espacio del pie institucional');
ok(/\.rank-hoja\.rank-ancha \{ page: rankingAncho; \}/.test(ESTILO),
   'y se aplica por clase, no de raíz');
ok(/@page \{[^}]*A4 portrait/.test(ESTILO) || /size: A4 portrait/.test(ESTILO),
   '  la vertical de las otras exportaciones sigue intacta');

/* El módulo marca la clase por CANTIDAD de columnas, no a ojo. */
ok(/maxColumnas\(\) > COLS_VERTICAL/.test(FUENTE),
   'la clase apaisada se decide por la tabla MÁS ANCHA: un solo documento no puede tener dos orientaciones');
igual(R.COLS_VERTICAL, 6, 'y el corte son 6, como pidió el club');

/* NINGUNA FILA SE PARTE. Sin esto un jugador queda con el nombre en una
   hoja y sus números en la siguiente. */
ok(/#rankingSalida \.rank-tabla tr,[\s\S]{0,80}break-inside: avoid/.test(ESTILO),
   '`break-inside: avoid` en cada fila');
ok(/#rankingSalida \.rank-card-titulo,[\s\S]{0,90}break-after: avoid/.test(ESTILO),
   'el título de una card no se despega de su tabla');
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
   pinta de uno que revienta al pintarse — es lo que ya pasó con el
   botón de publicar partidos manuales (punto 44).
   ===================================================================== */
bloque('6 · El modal se pinta de verdad');

function domFalso() {
  const nodos = {};
  const crear = (tag) => ({ tagName: (tag || 'div').toUpperCase(), id: '', className: '',
    innerHTML: '', children: [], style: {}, disabled: false,
    appendChild(c) { this.children.push(c); if (c.id) nodos[c.id] = c; return c; },
    remove() {}, focus() {}, querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, getAttribute() { return null; } });
  return { nodos, createElement: crear,
    getElementById: (id) => nodos[id] || null,
    addEventListener() {}, removeEventListener() {},
    body: crear('body'), activeElement: null, querySelectorAll() { return []; } };
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
  /* Se toma de `module.exports` y NO de `ctx.SGADD_RANKPDF`: un `const`
     de nivel superior en un `vm.Script` vive en el ámbito del script y
     no se cuelga del contexto, así que buscarlo ahí da `undefined` y el
     test 'pasaría' sin haber ejercido nada. */
  ctx.module.exports.abrir({ liga: { jugadoresPorEquipo: new Map() } });
} catch (e) { reventó = e.message; }
ok(!reventó, 'el modal se pinta sin reventar', reventó);

const M = ctx.module.exports;
ok(M && typeof M.generar === 'function', 'y expone `generar`');
ok(M && typeof M.alternarCard === 'function', 'el alternar de una card');
ok(M && typeof M.alternarCol === 'function', 'y el de una columna suelta');

/* Arranca con el preset básico: abrir con cero tablas y el botón apagado
   se lee como que la pantalla está rota. */
igual(M.seleccion(), R.cardsDePreset('basicas'),
      'abre con el preset básico ya elegido');

/* Un preset REEMPLAZA, no acumula. */
M.preset('todas');
igual(M.seleccion().length, 8, '«Todas» tilda las ocho cards');
M.preset('basicas');
igual(M.seleccion().length, R.cardsDePreset('basicas').length,
      'y «Básicas» las REEMPLAZA, no las suma');

/* Y tilda TODAS las columnas de cada card elegida: media card es una
   tabla a la que le faltan datos sin que nadie lo haya pedido. */
M.preset('todas');
const incompletas = M.seleccion().filter(id =>
  M.colsDeCard(id).length !== R.cards().filter(c => c.id === id)[0].cols.length);
igual(incompletas, [], 'un preset trae cada card con todas sus columnas');

/* Destildar una card la saca; volver a tildarla la devuelve ENTERA. */
M.alternarCard('rebotes');
ok(M.seleccion().indexOf('rebotes') === -1, 'destildar una card la saca');
M.alternarCard('rebotes');
igual(M.colsDeCard('rebotes').length,
      R.cards().filter(c => c.id === 'rebotes')[0].cols.length,
      '  y volver a tildarla la devuelve con todas sus columnas');

/* Sacarle TODAS las columnas a una card la saca de la selección: un
   título sin tabla no es una card. */
R.cards().filter(c => c.id === 'rebotes')[0].cols.forEach(k => M.alternarCol('rebotes', k));
ok(M.seleccion().indexOf('rebotes') === -1,
   'una card sin columnas no sale: un título sin tabla no es una card');

/* Y las columnas salen en el orden del CATÁLOGO, no en el que se tocaron. */
M.preset('todas');
M.alternarCol('produccion', 'PJ');
M.alternarCol('produccion', 'PJ');
igual(M.colsDeCard('produccion'), J.JUGADORES_RANKINGS[0].cols,
      'las columnas salen en el orden del catálogo');

/* =====================================================================
   7 · TÁCTIL Y MODAL · lo del punto 49 vale también acá
   ===================================================================== */
bloque('7 · Táctil y modal');

ok(/modal-acciones/.test(FUENTE),
   'la fila de acciones usa la barra pegajosa compartida');
ok(/max-h-\[90vh\][\s\S]{0,24}overflow-y-auto/.test(FUENTE),
   'y el panel acota su alto y scrollea');
ok(/role="dialog"/.test(FUENTE),
   'declara `role="dialog"`, que es como se oculta al imprimir');
ok(/<label[\s\S]{0,400}<input type="checkbox"/.test(FUENTE),
   'cada casilla vive dentro de su etiqueta, que es lo que el dedo toca');

/* Y el documento dice EN CADA TABLA por qué está ordenada así: ocho
   tablas con la misma pinta y numeraciones distintas se leen como un
   error si no se explica. */
ok(/ordenado por/.test(FUENTE),
   'cada tabla del PDF declara por qué métrica está ordenada');
console.log('\n' + '─'.repeat(60));
if (fallados === 0) console.log('✓ TODO OK · ' + pasados + ' tests');
else { console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados)); process.exitCode = 1; }
