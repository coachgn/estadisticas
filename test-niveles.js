/* =====================================================================
   SGADD · NIVEL DE COMPETENCIA Y REGISTRO DE UMBRALES

   Etapas 1 y 2 de la refactorización del etiquetado. La propiedad que
   TODO este archivo defiende es que **no se movió un solo número**: el
   registro reproduce exactamente los umbrales que había, para que la
   suite entera sirva de prueba de equivalencia antes de que los valores
   empiecen a adaptarse.

   LA MEDICIÓN QUE LO MOTIVA, sobre cinco libros reales (Jujuy · Liga
   Argentina, Reconquista Primera, Deportivo, Reconquista U21 y U23),
   mirando en qué percentil cae cada umbral:

       pptTripleElite           1,20    p88–p94    6pp   ← legítimo
       mezclaTripleInterior     0,12    p10–p18    8pp   ← legítimo
       mezclaTripleaPerimetral  0,30    p26–p37   11pp   ← legítimo

       t1Pobre                  0,60    p15–p60   45pp
       t1Contacto               0,72    p52–p88   36pp
       astPPGenerador           1,40    p59–p93   34pp

   Los tres primeros describen economía del básquet y se quedan absolutos
   para siempre. Hay tests acá que fallan si alguien los mueve.
   ===================================================================== */

const fs = require('fs');
const path = require('path');

const N = require('./js/sgadd-niveles.js');
const J = require('./js/sgadd-jugadores.js');
const S = require('./js/sgadd-scouting.js');

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

/* =====================================================================
   1 · LOS SEIS NIVELES
   ===================================================================== */
bloque('1 · La tabla de niveles');

igual(N.IDS, ['LIGA_NACIONAL', 'LIGA_ARGENTINA', 'FEDERAL_MAYORES',
              'FEDERAL_MENORES', 'LOCAL_MAYORES', 'LOCAL_MENORES'],
      'están los seis niveles pedidos, de mayor a menor exigencia');

N.NIVELES.forEach(n => {
  ok(!!n.label && n.label.length > 3, n.id + ' tiene una etiqueta legible');
  ok(typeof n.orden === 'number', n.id + ' declara su orden');
  ok(!!n.nota, n.id + ' explica qué competencias cubre');
});
const ordenes = N.NIVELES.map(n => n.orden);
igual(ordenes, ordenes.slice().sort((a, b) => a - b), 'el orden es monótono');
igual(new Set(ordenes).size, 6, 'y sin repetidos: define una jerarquía real');

ok(N.esNivel('LOCAL_MENORES'), 'reconoce un nivel válido');
ok(N.esNivel('local_menores'), 'sin distinguir mayúsculas');
ok(!N.esNivel('INVENTADO'), 'y rechaza uno que no existe');

/* Un nivel desconocido NO puede dejar los umbrales en null: apagaría
   todas las reglas en silencio. Cae al por defecto, que es explícito. */
igual(N.normalizarNivel('INVENTADO'), N.POR_DEFECTO,
      'un nivel desconocido cae al por defecto');
igual(N.normalizarNivel(null), N.POR_DEFECTO, 'y null también');
ok(N.esNivel(N.POR_DEFECTO), 'el por defecto es uno de los seis');

/* Solo tres niveles tienen libro con el que calibrar. Decirlo importa:
   un umbral inventado se ve igual que uno medido. */
igual(N.CALIBRADOS.slice().sort(),
      ['LIGA_ARGENTINA', 'LOCAL_MAYORES', 'LOCAL_MENORES'],
      'se declara para cuáles hay libro con el que calibrar');
N.CALIBRADOS.forEach(id => ok(N.esNivel(id), 'y ' + id + ' es un nivel real'));

/* =====================================================================
   2 · LOS TRES ABSOLUTOS · no se tocan nunca
   ===================================================================== */
bloque('2 · Los absolutos legítimos');

const ABSOLUTOS = {
  pptTripleElite: 1.20,
  mezclaTripleInterior: 0.12,
  mezclaTripleaPerimetral: 0.30,
};
Object.entries(ABSOLUTOS).forEach(([k, v]) => {
  const d = N.definicion(k);
  ok(!!d, k + ' está en el registro');
  if (!d) return;
  igual(d.tipo, N.TIPOS.ABSOLUTO, k + ' es de tipo ABSOLUTO');
  igual(d.valor, v, k + ' vale ' + v);
  ok(!!d.medido, k + ' declara la evidencia que lo respalda');
  ok(/brecha \d+pp/.test(d.medido), '  y esa evidencia trae la brecha medida', d.medido);
  ok(!!d.porque, k + ' explica por qué es economía del juego');
  /* Un absoluto NO puede tener semillas por nivel: si las tuviera,
     alguien las movería y dejaría de ser absoluto sin que se note. */
  ok(d.semillas === undefined, k + ' NO tiene semillas por nivel');
  /* Y vale lo mismo en los seis. */
  N.IDS.forEach(id => igual(N.valorDe(k, id), v,
    '  ' + k + ' vale igual en ' + id));
});

/* La brecha de los tres es menor a la de cualquier relativo: es
   exactamente el criterio que los separa. */
const brecha = (d) => { const m = /brecha (\d+)pp/.exec(d.medido || ''); return m ? +m[1] : null; };
Object.keys(ABSOLUTOS).forEach(k => {
  const b = brecha(N.definicion(k));
  ok(b !== null && b <= 12, k + ' tiene brecha ≤ 12pp (' + b + ')');
});

/* =====================================================================
   3 · EL REGISTRO CUBRE TODO Y NO INVENTA NADA
   ===================================================================== */
bloque('3 · Cobertura del registro');

const scoutU = S.UMBRALES || S.SCOUT_UMBRALES || {};
const sinDeclarar = []
  .concat(Object.keys(J.JUGADORES_UMBRALES).map(k => ['JUGADORES', k]))
  .concat(Object.keys(scoutU).map(k => ['SCOUTING', k]))
  .filter(([, k]) => !N.definicion(k));
igual(sinDeclarar, [], 'todos los umbrales vivos están declarados en el registro');

/* Y al revés: el registro no declara umbrales que no existan. */
const vivos = new Set(Object.keys(J.JUGADORES_UMBRALES).concat(Object.keys(scoutU)));
const fantasma = N.claves().filter(k => !vivos.has(k));
igual(fantasma, [], 'el registro no declara umbrales que nadie usa');

N.claves().forEach(k => {
  const d = N.definicion(k);
  ok([N.TIPOS.ABSOLUTO, N.TIPOS.PERCENTIL, N.TIPOS.Z].indexOf(d.tipo) > -1,
     k + ' declara un tipo conocido: ' + d.tipo);
  ok(!!d.metrica, k + ' dice contra qué métrica se compara');
  ok(d.dir === 'mayor' || d.dir === 'menor',
     k + ' declara si marca por encima o por debajo', d.dir);
});

/* =====================================================================
   4 · LA EQUIVALENCIA · esta entrega NO mueve un solo número
   ===================================================================== */
bloque('4 · Qué se movió y qué no');

/* Los literales históricos, escritos a mano. Siguen siendo el RESPALDO
   —el mapa estático que se usa sin índice— y la semilla de Liga
   Argentina, que es la vara con la que se escribieron las reglas.

   LAS TRES ÚLTIMAS ENTRARON DESPUÉS y por eso van separadas: no vivían
   en este mapa sino escritas EN LÍNEA dentro de `PERFILES_TECNICOS`,
   fuera del registro, así que la adaptación por nivel no las alcanzaba.
   Su literal es el que tenían ahí, para que la equivalencia siga
   valiendo: mover un número y unificarlo a la vez haría imposible saber
   cuál de las dos cosas cambió una incidencia. */
const HISTORICOS = {
  minutosClave: 20,
  astPPGenerador: 1.40,
  astVolumenGenerador: 2.5,
  usoTripleAlto: 0.40,
  pptDobleAlto: 1.10,
  reboteOfensivoAlto: 1.30,
  reboteInterior: 1.15,
  reboteDesempate: 1.10,
  mezclaTripleaPerimetral: 0.30,
  mezclaTripleInterior: 0.12,
  rtlContacto: 0.28,
  frContacto: 2.5,
  usoLibreContacto: 0.12,
  t1Contacto: 0.72,

  /* Los que estaban dentro de los arquetipos. */
  amenazaVolumenT3: 3.0,       // era `j['T3I'] > 3.0` en «amenaza»
  amenazaT3: 0.34,             // era `j['T3%'] > 0.34` en «amenaza»
  anclaRatioDefensivo: 1.00,   // era el `RD rel > RO rel` de `ancla-defensiva`
};
igual(Object.keys(J.JUGADORES_UMBRALES).sort(), Object.keys(HISTORICOS).sort(),
      'JUGADORES_UMBRALES conserva exactamente sus diecisiete claves');

/* El 1,40 de `generador` era el MISMO número que `astPPGenerador`,
   duplicado a mano en dos lugares. Que exista una sola clave es lo que
   impide que vuelvan a quedar distintos. */
const FUENTE_JUG = fs.readFileSync(
  path.join(__dirname, 'js', 'sgadd-jugadores.js'), 'utf8');
ok(!/AST-PP'\]\s*>\s*1\.40/.test(FUENTE_JUG),
   'el arquetipo «generador» ya no lleva el 1,40 escrito a mano');
ok(!/T3I'\]\s*>\s*3\.0\s*&&/.test(FUENTE_JUG),
   'ni «amenaza» sus dos literales');

/* EL MAPA ESTÁTICO NO SE MOVIÓ. Es el respaldo sin contexto y scouting lo
   lee por COMPARTIDOS: resolverlo a un nivel cambiaría la vara de sus
   reglas en silencio. La adaptación vive en `jugadoresUmbrales(idx)`. */
Object.entries(HISTORICOS).forEach(([k, v]) =>
  igual(J.JUGADORES_UMBRALES[k], v, 'el mapa estático conserva ' + k + ' = ' + v));

const HIST_SCOUT = {
  concentracionAlta: 0.15, pptTripleElite: 1.20, pptTriplePobre: 0.90,
  usoLibreAlto: 0.10, t1Confiable: 0.75, t1Pobre: 0.60, perdidasAltas: 1.25,
  t1Regalable: 0.40, usoDobleInterno: 0.45, pptTripleRentable: 1.05,
  t3Rentable: 0.35, pptTripleFrio: 0.88, t3Frio: 0.30,
  volumenTripleSistematico: 2.5, viaPrincipalTriple: 0.25,
};
Object.entries(HIST_SCOUT).forEach(([k, v]) =>
  igual(scoutU[k], v, 'SCOUTING conserva ' + k + ' = ' + v));

/* Y `baseDe` devuelve ese mismo literal, sin nivel. */
Object.entries(HISTORICOS).forEach(([k, v]) =>
  igual(N.baseDe(k), v, 'baseDe(' + k + ') = el literal histórico'));

/* ---------------------------------------------------------------
   LO QUE SÍ SE MOVIÓ · las semillas por nivel

   Antes valían todas lo mismo (etapa 2). Ahora cada nivel usa su
   equivalente MEDIDO, que es el punto de la etapa 4.
   --------------------------------------------------------------- */
igual(N.valorDe('astPPGenerador', 'LIGA_ARGENTINA'), 1.40,
      'Liga Argentina conserva su valor: es la vara original');
ok(N.valorDe('astPPGenerador', 'LOCAL_MAYORES') < 1.40,
   'y en local mayores baja, porque allá 1,40 es el p84–p93',
   N.valorDe('astPPGenerador', 'LOCAL_MAYORES'));
ok(N.valorDe('astPPGenerador', 'LOCAL_MENORES')
   < N.valorDe('astPPGenerador', 'LOCAL_MAYORES'),
   'y en formativas baja todavía más');

/* LA REGRESIÓN DE LA ETAPA 2, DADA VUELTA: ahora los relativos DEBEN
   diferir entre niveles. Si volvieran a ser todos iguales, la adaptación
   se apagó sin que nadie lo note. */
const RELATIVOS_MEDIDOS = N.claves().filter(k => {
  const d = N.definicion(k);
  return d.tipo === N.TIPOS.PERCENTIL && d.calibrado
    && Object.keys(d.calibrado).length > 1;
});
ok(RELATIVOS_MEDIDOS.length >= 15, 'hay al menos quince relativos medidos',
   RELATIVOS_MEDIDOS.length);
RELATIVOS_MEDIDOS.forEach(k => {
  const vals = N.IDS.map(id => N.valorDe(k, id));
  ok(new Set(vals).size > 1, k + ': la semilla YA cambia según el nivel',
     JSON.stringify(vals));
});

/* Los ABSOLUTOS, en cambio, siguen iguales en los seis. */
Object.keys(ABSOLUTOS).forEach(k => {
  const vals = N.IDS.map(id => N.valorDe(k, id));
  igual(new Set(vals).size, 1, k + ': sigue valiendo lo mismo en los seis niveles');
});

/* HERENCIA: un nivel sin libro toma el del más cercano en la escala, no
   el literal. FEDERAL_MENORES se parece a LOCAL_MENORES, no a Liga
   Argentina — y el literal ES el de Liga Argentina. */
igual(N.valorDe('astPPGenerador', 'FEDERAL_MENORES'),
      N.valorDe('astPPGenerador', 'LOCAL_MAYORES'),
      'FEDERAL_MENORES hereda del calibrado más cercano (orden 5)');
igual(N.valorDe('astPPGenerador', 'LIGA_NACIONAL'),
      N.valorDe('astPPGenerador', 'LIGA_ARGENTINA'),
      'y LIGA_NACIONAL hereda de Liga Argentina');
/* =====================================================================
   5 · LO CALIBRADO ESTÁ, PERO TODAVÍA NO SE CONSUME
   ===================================================================== */
bloque('5 · Los equivalentes medidos, separados de lo que corre');

const CON_CALIBRADO = N.claves().filter(k => {
  const d = N.definicion(k);
  return d.calibrado && Object.keys(d.calibrado).length > 0;
});
ok(CON_CALIBRADO.length >= 15,
   'hay equivalentes medidos para la mayoría de los relativos',
   CON_CALIBRADO.length + ' umbrales');

CON_CALIBRADO.forEach(k => {
  const d = N.definicion(k);
  Object.keys(d.calibrado).forEach(id =>
    ok(N.CALIBRADOS.indexOf(id) > -1,
       k + ': solo se calibra contra niveles con libro (' + id + ')'));
  /* El de Liga Argentina tiene que coincidir con el valor de hoy: es la
     vara con la que se validaron las reglas. */
  if (d.calibrado.LIGA_ARGENTINA !== undefined) {
    igual(d.calibrado.LIGA_ARGENTINA, N.valorDe(k, 'LIGA_ARGENTINA'),
          k + ': el calibrado de Liga Argentina es el valor actual');
  }
});

/* Y ahora el calibrado SÍ es la semilla: es lo que la etapa 4 activó. */
CON_CALIBRADO.forEach(k => {
  const d = N.definicion(k);
  if (d.calibrado.LOCAL_MENORES === undefined) return;
  igual(N.valorDe(k, 'LOCAL_MENORES'), d.calibrado.LOCAL_MENORES,
        k + ': LOCAL_MENORES usa su equivalente medido');
});

/* El clamp encierra lo observado: es lo que en la etapa 4 impide que una
   liga floja fabrique «tiradores de élite». */
N.claves().forEach(k => {
  const d = N.definicion(k);
  if (!d.clamp) return;
  igual(d.clamp.length, 2, k + ': el clamp es un rango de dos valores');
  ok(d.clamp[0] <= d.clamp[1], k + ': el clamp está bien ordenado');
  const v = N.valorDe(k, 'LIGA_ARGENTINA');
  ok(v >= d.clamp[0] - 1e-9 && v <= d.clamp[1] + 1e-9,
     k + ': el valor de hoy cae DENTRO de su propio clamp',
     v + ' fuera de [' + d.clamp + ']');
  Object.values(d.calibrado || {}).forEach(x =>
    ok(x >= d.clamp[0] - 1e-9 && x <= d.clamp[1] + 1e-9,
       k + ': el equivalente medido también cae dentro del clamp'));
});

/* =====================================================================
   6 · PROCEDENCIA · de dónde salió cada número
   ===================================================================== */
bloque('6 · Auditabilidad');

const pr = N.procedencia('t1Pobre', 'LOCAL_MENORES');
ok(!!pr, 'se puede pedir la procedencia de un umbral');
igual(pr.origen, 'tier', 'hoy todo relativo sale de la tabla de niveles');
igual(pr.nivel, 'LOCAL_MENORES', 'y dice para qué nivel se resolvió');
igual(pr.valor, N.valorDe('t1Pobre', 'LOCAL_MENORES'), 'con el valor que se usó');
ok(!!pr.metrica, 'y contra qué métrica se compara');
igual(N.procedencia('pptTripleElite', 'LOCAL_MENORES').origen, 'absoluto',
      'un absoluto declara que no depende del nivel');
igual(N.procedencia('no_existe', 'LOCAL_MAYORES'), null,
      'un umbral inexistente devuelve null, no un objeto a medias');
igual(N.valorDe('no_existe', 'LOCAL_MAYORES'), null, 'y su valor también');

/* =====================================================================
   7 · LA CADENA DE CARGA
   ===================================================================== */
bloque('7 · Orden de carga y dependencias');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const pos = (f) => html.indexOf('js/' + f);
ok(pos('sgadd-niveles.js') > -1, 'sgadd-niveles.js está en el index');
ok(pos('sgadd-niveles.js') < pos('sgadd-jugadores.js'),
   'y carga ANTES que sgadd-jugadores.js, que le pide los umbrales');
ok(pos('sgadd-jugadores.js') < pos('sgadd-scouting.js'),
   'y jugadores sigue antes que scouting: la dependencia no se invierte');

/* El módulo es PURO: si tocara `document` no se podría testear desde Node
   ni correr del lado del servidor. */
const fuente = fs.readFileSync(path.join(__dirname, 'js/sgadd-niveles.js'), 'utf8');
const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
['document', 'window.', 'localStorage', 'fetch('].forEach(g =>
  ok(sinComentarios.indexOf(g) === -1, 'el motor no usa ' + g + ': es puro'));

/* Sin el registro, los umbrales caen a sus literales en vez de quedar
   `undefined` — una comparación contra undefined es siempre falsa y
   apagaría la regla en silencio. */
const fj = fs.readFileSync(path.join(__dirname, 'js/sgadd-jugadores.js'), 'utf8');
ok(/RESPALDO/.test(fj), 'jugadores declara un respaldo literal');
ok(/if \(!JUGADORES_NIVELES\) return RESPALDO;/.test(fj),
   'y lo usa si el registro no cargó');

/* Scouting sigue leyendo de jugadores y no copiando: es la regla del
   punto 8 y no puede romperse por este refactor. */
const fsc = fs.readFileSync(path.join(__dirname, 'js/sgadd-scouting.js'), 'utf8');
ok(/COMPARTIDOS/.test(fsc), 'scouting sigue leyendo los compartidos de jugadores');
['minutosClave', 'astPPGenerador', 'mezclaTripleInterior'].forEach(k =>
  ok(new RegExp(k + ':\\s*COMPARTIDOS\\.' + k).test(fsc),
     '  ' + k + ' se lee de COMPARTIDOS, no se copia'));

/* =====================================================================
   8 · ETAPA 5 · LA PROCEDENCIA ES AUDITABLE

   Un umbral que se movio solo y uno escrito a mano se ven exactamente
   igual en pantalla: los dos son un numero. Sin esta capa, el DT que ve
   una etiqueta nueva no puede saber si cambio el jugador o cambio la
   vara — y una herramienta que no se puede auditar se deja de usar.
   ===================================================================== */
bloque('8 · Procedencia');

const SIN_CTX = N.procedencia('astPPGenerador', 'LOCAL_MENORES');
igual(SIN_CTX.origen, 'tier',
      'sin contexto la procedencia es la de tabla: la semilla del nivel');
igual(SIN_CTX.valor, N.valorDe('astPPGenerador', 'LOCAL_MENORES'),
      'y el valor es el de esa tabla');
igual(N.procedencia('pptTripleElite', 'LOCAL_MENORES').origen, 'absoluto',
      'un absoluto se declara absoluto en cualquier nivel');

/* Con muestra de sobra el origen tiene que ser `vivo`, no `tier`: si
   siguiera diciendo `tier` el numero se estaria moviendo y la pantalla
   mentiria sobre de donde salio, que es peor que no mostrarlo. */
const VALS = [];
for (let i = 0; i < 120; i++) VALS.push(i / 100);
const CTX = { partidos: 90, valores: VALS };
const VIVO = N.procedencia('astPPGenerador', 'LOCAL_MENORES', CTX);
igual(VIVO.origen, 'vivo', 'con muestra plena la procedencia es `vivo`');
ok(VIVO.semilla === N.valorDe('astPPGenerador', 'LOCAL_MENORES'),
   'y sigue exponiendo la semilla contra la que se movio', VIVO.semilla);
ok(VIVO.muestra && VIVO.muestra.n === VALS.length,
   'y cuanta muestra la respalda');
igual(N.procedencia('pptTripleElite', 'LOCAL_MENORES', CTX).origen, 'absoluto',
      'un absoluto NO se mueve por mas muestra que haya: es el punto');

/* En transicion tiene que decirse en transicion. Con un corte duro, el
   partido que cruza el umbral reetiqueta a media liga de un dia para el
   otro y el DT ve cambiar las fichas sin que haya pasado nada. */
const MEDIO = N.procedencia('astPPGenerador', 'LOCAL_MENORES',
  { partidos: 25, valores: VALS.slice(0, 45) });
igual(MEDIO.origen, 'mezcla', 'con muestra parcial la procedencia es `mezcla`');
ok(MEDIO.mezcla > 0 && MEDIO.mezcla < 1, '  y dice cuanto pesa la liga', MEDIO.mezcla);

igual(Object.keys(N.ORIGENES).sort(), ['absoluto', 'mezcla', 'tier', 'vivo'],
      'los cuatro origenes estan declarados en un solo lugar');
/* La UI pinta por esta tabla: un origen que el motor devuelva y la tabla
   no conozca saldria sin explicacion y nadie se enteraria. */
igual(Object.keys(J.VARA_ORIGENES).sort(), Object.keys(N.ORIGENES).sort(),
      'y la UI conoce exactamente esos cuatro');

/* --- LA VARA · el motor puro que la ficha imprime --- */
const SGADD_T = require('./js/sgadd-core.js');
const colsEV = ['EQUIPO', 'FASE', 'PJ', 'PTS'];
const filasEV = [{ EQUIPO: 'A', FASE: 'REGULAR', PJ: '10', PTS: '70' },
                 { EQUIPO: 'B', FASE: 'REGULAR', PJ: '10', PTS: '68' }];
const colsJV = ['NOMBRES', 'EQUIPO', 'FASE', 'MIN', 'PTS', 'PLAYS', 'AST-PP', 'T3I', 'T3%'];
const filasJV = [];
for (let i = 0; i < 70; i++) {
  filasJV.push({ NOMBRES: 'J' + i, EQUIPO: i % 2 ? 'A' : 'B', FASE: 'REGULAR',
    MIN: '24', PTS: '10', PLAYS: '12',
    'AST-PP': String(0.5 + i / 50).replace('.', ','),
    T3I: String(1 + i / 20).replace('.', ','),
    'T3%': String(0.2 + i / 400).replace('.', ',') });
}
filasJV.push({ NOMBRES: 'JUGADOR TIPO', EQUIPO: '', FASE: 'REGULAR', MIN: '20', PTS: '8' });
const hojasV = () => ({
  'PROMEDIOS E': { cols: colsEV, filas: filasEV },
  'PROMEDIOS J': { cols: colsJV, filas: filasJV },
});
const idxV = SGADD_T.construirIndice(hojasV(), { fase: 'REGULAR' });
idxV.liga.nivel = 'LOCAL_MENORES';

const VARA = J.jugadoresVara(idxV);
ok(!!VARA, 'jugadoresVara devuelve la foto de la competencia');
igual(VARA.nivel, 'LOCAL_MENORES', 'con el nivel que rige');
igual(VARA.origenNivel, 'indice', 'y de donde salio esa declaracion');
ok(!!VARA.origenNivelTexto, '  con su explicacion en castellano');
igual(VARA.umbrales.length, N.claves().length,
      'trae TODOS los umbrales, no un recorte: uno que no se lista es uno que no se audita');
VARA.umbrales.forEach(u => {
  ok(!!u.origen, u.clave + ' declara su procedencia');
  ok(u.valor !== null && u.valor !== undefined, u.clave + ' tiene valor');
});
igual(VARA.umbrales.filter(u => u.origen === 'absoluto').length, 3,
      'y los tres absolutos salen marcados como fijos');

/* Sin nivel declarado la vara igual se arma: lo que cambia es que dice
   que nadie lo declaro, que es exactamente lo que hay que poder ver. */
const VARA2 = J.jugadoresVara(SGADD_T.construirIndice(hojasV(), { fase: 'REGULAR' }));
ok(VARA2 && VARA2.nivel === N.POR_DEFECTO, 'sin declaracion cae al nivel por defecto');
ok(VARA2 && ['defecto', 'json', 'kv'].indexOf(VARA2.origenNivel) > -1,
   '  y lo dice en vez de hacerlo pasar por declarado', VARA2 && VARA2.origenNivel);

/* --- LOS DOS DEFECTOS QUE SOLO SE VEN MIRANDO LA PANTALLA --- */
const FJUG = fs.readFileSync(path.join(__dirname, 'js/sgadd-jugadores.js'), 'utf8');
const BLOQUE = FJUG.slice(FJUG.indexOf('function jugadoresBloqueVara'),
                          FJUG.indexOf('function jugadoresBloqueCondicion'));

/* `zona-<tono>` solo define la VARIABLE `--zona`; el color lo pinta
   `zona-texto`. Con una sola de las dos el chip sale del color heredado
   y el semaforo no existe — medido en el navegador antes del arreglo. */
ok(/zona-\$\{o\.tono\} zona-texto/.test(BLOQUE),
   'el chip de procedencia lleva zona-<tono> Y zona-texto');

/* El PDF de la ficha reusa estos mismos bloques (punto 7.6 ter). Treinta
   y dos filas de auditoria en la hoja que el DT se lleva a la charla con
   un jugador son ruido, y encima la empujan a una carilla mas. */
ok(/<details class="no-imprimir/.test(BLOQUE),
   'y el bloque entero no se imprime: es auditoria, no contenido de la ficha');

/* --- EL MANUAL SE GENERA POR NIVEL --- */
const FGEN = fs.readFileSync(path.join(__dirname, 'generar-manual-etiquetas.js'), 'utf8');
ok(/data-u=/.test(FGEN),
   'el generador emite cada corte con su clave, para poder reescribirlo');
ok(!/const U = J\.JUGADORES_UMBRALES/.test(FGEN),
   'y ya no lee el mapa estatico: el manual no puede declarar un numero que el motor no usa');

const MAN = path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html');
if (fs.existsSync(MAN)) {
  const html = fs.readFileSync(MAN, 'utf8');
  ok(/id="nivelSel"/.test(html), 'el manual generado trae el selector de nivel');
  N.IDS.forEach(id => ok(html.indexOf('value="' + id + '"') > -1, '  ofrece ' + id));
  /* Los seis mapas viajan ADENTRO del documento: sin eso el selector
     tendria que salir a buscar algo y el manual dejaria de ser un HTML
     suelto que se abre con doble clic. */
  ok(/var MAPAS = \{/.test(html), 'y los seis mapas viajan en el documento');
  N.IDS.forEach(id => ok(html.indexOf('"' + id + '"') > -1, '  con los valores de ' + id));
  /* La matriz impresa es lo que sobrevive al PDF, que congela un nivel. */
  ok(html.indexOf('La matriz completa') > -1,
     'y la matriz de los seis se imprime, porque un PDF congela uno solo');
  ok(html.indexOf('&lt;span class="u') === -1,
     'los cortes no salen escapados dos veces');
} else {
  ok(false, 'el manual esta generado (correr node generar-manual-etiquetas.js)');
}

/* =====================================================================
   RESUMEN
   ===================================================================== */
console.log('\n' + '─'.repeat(60));
if (fallados === 0) {
  console.log('✓ TODO OK · ' + pasados + ' tests');
} else {
  console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados));
  process.exitCode = 1;
}
