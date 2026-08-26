/* =====================================================================
   Arranque por club: resolverClubYPlanilla().

   Bug real que motivó este test (ver comentario en index.html, línea
   ~2464): la resolución de club → SHEET_ID vivía SOLO dentro de
   refreshData(), así que en el ARRANQUE (init()) SHEET_ID se quedaba con
   el valor por defecto y ?club=jujuy mostraba los datos de Reconquista.
   Ahora es una única función que llaman los dos caminos.

   Se extrae en tiempo de ejecución a boot-extraido.js (temporal, no
   commitear), igual que logos-extraido.js.
   ===================================================================== */
const vm = require('vm');
const fs = require('fs');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const html = fs.readFileSync('./index.html', 'utf8');

function extraerFuncion(firma) {
  const ini = html.indexOf(firma);
  if (ini === -1) throw new Error('No se encontró "' + firma + '" en index.html: ¿cambió la firma?');
  const cierre = html.slice(ini).search(/\n\}\r?\n/);
  if (cierre === -1) throw new Error('No se encontró el cierre de ' + firma);
  return html.slice(ini, ini + cierre + 2); // incluye el "}" final (cierre apunta al "\n" previo)
}

const FIRMA_RESOLVER = 'async function resolverClubYPlanilla() {';
const srcResolver = extraerFuncion(FIRMA_RESOLVER);
const srcInit = extraerFuncion('async function init() {');
const srcRefresh = extraerFuncion('async function refreshData() {');

/* Deja un rastro en disco (como pide CLAUDE.md para este tipo de extracción)
   y lo borra enseguida: se genera, se usa y se borra. */
const EXTRAIDO = './boot-extraido.js';
fs.writeFileSync(EXTRAIDO, '/* Extraído de index.html para test-boot.js. No commitear. */\n' + srcResolver + '\n');

console.log('\n1. UN SOLO PUNTO DE RESOLUCIÓN (chequeo estático del index.html)');
console.log('═'.repeat(70));
const llamadasEnInit = (srcInit.match(/resolverClubYPlanilla\(\)/g) || []).length;
const llamadasEnRefresh = (srcRefresh.match(/resolverClubYPlanilla\(\)/g) || []).length;
check('init() llama a resolverClubYPlanilla() (una sola vez)', llamadasEnInit === 1, llamadasEnInit);
check('refreshData() llama a resolverClubYPlanilla() (una sola vez)', llamadasEnRefresh === 1, llamadasEnRefresh);
check('init() NO duplica la resolución llamando a CLUB.cargar() por su cuenta',
  !/CLUB\.cargar\(\)/.test(srcInit.replace(FIRMA_RESOLVER, '')));
check('refreshData() NO duplica la resolución llamando a CLUB.cargar() por su cuenta',
  !/CLUB\.cargar\(\)/.test(srcRefresh));
check('resolverClubYPlanilla() sigue inicializando SGADD_APP', /SGADD_APP\.inicializar\(\)/.test(srcResolver));
check('resolverClubYPlanilla() sigue con el fallback a la primera planilla activa del catálogo',
  /SGADD\.planillasVisibles\(\{\}\)/.test(srcResolver));
check('resolverClubYPlanilla() es la única que reasigna SHEET_ID a partir de la planilla resuelta',
  /SHEET_ID = p\.sheetId/.test(srcResolver));

fs.unlinkSync(EXTRAIDO);

/* --- Entorno de ejecución para correr resolverClubYPlanilla() de verdad --- */
function crearEntorno({ clubOk, clubExplota, sinClub, sinApp, planillasClub, planillaPrevia }) {
  const catalogo = planillasClub.map(p => ({ id: p.id, sheetId: p.sheetId, activo: true }));
  const consola = [];
  const SGADD_mock = {
    planillasVisibles: () => catalogo,
    planilla: (id) => catalogo.find(p => p.id === id) || null,
  };
  const SGADD_APP_mock = {
    estado: { planillaId: planillaPrevia || null },
    inicializar() { /* no-op: en index.html real resuelve desde el hash; acá el escenario ya deja planillaId seteado o null */ },
    planillaActual() { return SGADD_mock.planilla(SGADD_APP_mock.estado.planillaId); },
  };
  const CLUB_mock = clubExplota
    ? { estado: { id: 'x' }, cargar: async () => { throw new Error('la config no cargó'); } }
    : { estado: { id: 'jujuy' }, cargar: async () => { CLUB_mock.estado.id = 'jujuy'; } };

  const contexto = {
    console: { log: (...a) => consola.push(a.join(' ')), warn: (...a) => consola.push(a.join(' ')) },
    SHEET_ID: 'SHEET_DEFAULT_RECONQUISTA',
    SGADD: SGADD_mock,
    SGADD_APP: sinApp ? undefined : SGADD_APP_mock,
    CLUB: sinClub ? undefined : CLUB_mock,
  };
  vm.createContext(contexto);
  // Function declaration de nivel superior: queda expuesta como propiedad del contexto.
  vm.runInContext(srcResolver + '\nthis.resolverClubYPlanilla = resolverClubYPlanilla;', contexto);
  return contexto;
}

(async () => {
  console.log('\n2. ARRANQUE LIMPIO: sin planilla previa, cae a la primera del catálogo');
  console.log('═'.repeat(70));
  const e1 = crearEntorno({ clubOk: true, planillasClub: [{ id: 'jujuy-apertura-2025', sheetId: 'SHEET_JUJUY' }], planillaPrevia: null });
  await e1.resolverClubYPlanilla();
  check('SHEET_ID pasa a ser el de la planilla del club, no el default',
    e1.SHEET_ID === 'SHEET_JUJUY', e1.SHEET_ID);

  console.log('\n3. BUG HISTÓRICO: cambiar de club con una planilla vieja seleccionada');
  console.log('═'.repeat(70));
  // La planilla previa ("primera-clausura-2026", de Reconquista) no existe en
  // el catálogo del club nuevo: SGADD.planilla() la resuelve a null.
  const e2 = crearEntorno({
    clubOk: true,
    planillasClub: [{ id: 'jujuy-apertura-2025', sheetId: 'SHEET_JUJUY' }],
    planillaPrevia: 'primera-clausura-2026',
  });
  await e2.resolverClubYPlanilla();
  check('la planilla del club anterior se descarta y toma la primera del catálogo nuevo',
    e2.SHEET_ID === 'SHEET_JUJUY', e2.SHEET_ID);
  check('NO se queda pegado al SHEET_ID por defecto (el bug original)',
    e2.SHEET_ID !== 'SHEET_DEFAULT_RECONQUISTA');

  console.log('\n4. ROBUSTEZ: la config del club es una mejora opcional');
  console.log('═'.repeat(70));
  const e3 = crearEntorno({ clubExplota: true, planillasClub: [{ id: 'jujuy-apertura-2025', sheetId: 'SHEET_JUJUY' }], planillaPrevia: null });
  let rompio3 = false;
  try { await e3.resolverClubYPlanilla(); } catch (err) { rompio3 = true; }
  check('si CLUB.cargar() rechaza, resolverClubYPlanilla() NO explota (sigue con los defaults)', !rompio3);
  check('y aun así resuelve la planilla activa disponible', e3.SHEET_ID === 'SHEET_JUJUY', e3.SHEET_ID);

  const e4 = crearEntorno({ sinClub: true, planillasClub: [{ id: 'jujuy-apertura-2025', sheetId: 'SHEET_JUJUY' }], planillaPrevia: null });
  let rompio4 = false;
  try { await e4.resolverClubYPlanilla(); } catch (err) { rompio4 = true; }
  check('sin módulo CLUB cargado en la página, tampoco rompe', !rompio4);
  check('y sigue resolviendo la planilla vía SGADD_APP', e4.SHEET_ID === 'SHEET_JUJUY', e4.SHEET_ID);

  const e5 = crearEntorno({ sinApp: true, planillasClub: [{ id: 'jujuy-apertura-2025', sheetId: 'SHEET_JUJUY' }], planillaPrevia: null });
  let rompio5 = false;
  try { await e5.resolverClubYPlanilla(); } catch (err) { rompio5 = true; }
  check('sin SGADD_APP (núcleo SGADD no cargado), corta temprano sin romper', !rompio5);
  check('y no toca SHEET_ID si no puede resolver planilla', e5.SHEET_ID === 'SHEET_DEFAULT_RECONQUISTA', e5.SHEET_ID);

  /* =====================================================================
     SINTAXIS DE TODOS LOS MÓDULOS

     La mitad de los archivos de `js/` no se puede `require()` desde Node
     —usan `document`, `window`, globals del navegador— así que un error de
     sintaxis en ellos NO lo caza ningún test: se descubre recién con la
     sección en blanco en el navegador.

     Ya pasó: un backtick dentro de un comentario HTML, escrito adentro de
     un template literal, cerró el string y tiró abajo `sgadd-equipos.js`
     entero (`SyntaxError: Unexpected identifier 'max'` →
     `buildEquipos is not defined` → la sección no renderiza).

     `new vm.Script()` COMPILA sin ejecutar, así que valida la sintaxis de
     cualquier módulo aunque dependa del DOM.
     ===================================================================== */
  console.log('\nSINTAXIS DE LOS MÓDULOS');
  console.log('─'.repeat(70));
  const modulos = fs.readdirSync('./js').filter(f => f.endsWith('.js')).sort();
  check('hay módulos para revisar', modulos.length >= 10, modulos.length);
  modulos.forEach(f => {
    let error = null;
    try { new vm.Script(fs.readFileSync('./js/' + f, 'utf8'), { filename: f }); }
    catch (e) { error = e.message; }
    check('js/' + f + ' compila', error === null, error);
  });

  console.log('\n' + '═'.repeat(70));
  /* -----------------------------------------------------------------
     CAMBIAR DE CATEGORÍA NO PUEDE DEJAR AL DT SIN CONTROLES

     Reporte del club: al pasar a U21 o U23 la barra quedaba en "Cargando…"
     y no se podía usar; con Primera no pasaba. Tres causas distintas, las
     tres reproducidas en el navegador.
     ----------------------------------------------------------------- */
  const appJs = fs.readFileSync('./js/sgadd-app.js', 'utf8');
  const srcCambio = html.slice(html.indexOf('window.onCategoriaCambiada'),
    html.indexOf('window.addEventListener(\'hashchange\''));

  /* 1 · El handler de la capa vieja pisaba #view-root con un cartel aunque
     el DT estuviera en Equipos, y ahí se lleva puesta la BARRA: sin
     selector en pantalla no se puede ni volver atrás ni elegir otra. */
  check('el cartel de "cambiando de categoría" solo pisa la pantalla en Principal',
    /if \(currentSection === 'principal'\) \{[\s\S]{0,260}Cambiando de categoria/.test(srcCambio));
  /* La ÚNICA escritura del root vive dentro del guard: si alguien la
     saca afuera, la barra vuelve a desaparecer en Equipos. */
  check('y las secciones SGADD conservan su barra mientras cargan',
    (srcCambio.match(/root\.innerHTML/g) || []).length === 1 &&
    srcCambio.indexOf("currentSection === 'principal'") < srcCambio.indexOf('root.innerHTML'));

  /* 2 · Dos cambios seguidos: la carga vieja no puede pisar a la nueva ni
     apagarle el cartel. Medido: sin esto, pedir U21 y a los 300ms U23
     terminaba en U21. */
  check('cada carga se queda con su ficha y comprueba si sigue vigente',
    /const ficha = \+\+_cargaId;/.test(appJs) && /const vigente = \(\) => \(ficha === _cargaId\);/.test(appJs));
  check('una carga que ya no es la vigente se retira sin tocar el estado',
    /if \(!vigente\(\)\) return;/.test(appJs));
  check('y tampoco apaga el cartel de la que sí está esperando',
    /if \(vigente\(\)\) \{ estado\.cargando = false; avisar\(\); \}/.test(appJs));

  /* 3 · Si no entró NINGUNA hoja el problema es de red o de permisos: antes
     se armaba un índice vacío y la sección quedaba muda. */
  check('sin una sola hoja se avisa en vez de indexar la nada',
    /if \(!Object\.keys\(hojas\)\.length\) \{[\s\S]{0,320}throw new Error/.test(appJs));

  /* =====================================================================
     ACCESIBILIDAD · lo que fija la checklist de Checklist Design

     El catálogo completo vive en `.agents/skills/checklist-design`. Estos
     checks amarran los items que un cambio de UI puede romper sin que se
     note: "keyboard navigation patterns", "ARIA pattern library" y "focus
     indicator design".
     ===================================================================== */
  console.log('\nACCESIBILIDAD · teclado, roles y foco');
  console.log('─'.repeat(70));

  /* -----------------------------------------------------------------
     LA VERSIÓN DE ASSETS, A LA VISTA

     `index.html` no lleva `?v=`: es el archivo que trae el CSS y el mapa de
     versiones de todos los `.js`. Cuando queda cacheado —en el navegador o
     en el CDN de Pages, que lo sirve con `max-age=600`— la app entera se
     queda en la versión anterior y los cambios "no aparecen" sin ningún
     síntoma. Con el número en pantalla eso se diagnostica de un vistazo.
     ----------------------------------------------------------------- */
  check('el pie del menú muestra la versión de assets',
    /id="asset-version"/.test(html));
  /* En init() y NO en refreshData(), que corre solo al tocar el botón: es
     el mismo error que ya se cometió con el arranque del buzón. */
  check('y se rellena en el arranque, no al tocar "Actualizar datos"',
    /asset-version/.test(srcInit) && !/asset-version/.test(srcRefresh));
  /* Del `?v=` de un <script> real: una constante se puede olvidar de subir
     y mentiría justo cuando más importa. */
  check('la versión sale de un <script> real y no de una constante',
    /querySelector\('script\[src\*="sgadd-core\.js\?v="\]'\)/.test(srcInit));

  const UI = require('./js/sgadd-ui.js');
  const uiSrc = fs.readFileSync('./js/sgadd-ui.js', 'utf8');

  /* Media app se navega clickeando una fila. Sin estos tres atributos esa
     navegación NO EXISTE para el teclado: la fila no se enfoca, no se
     activa con Enter y el lector de pantalla la lee como texto suelto. */
  const attrs = UI.atributosFila('Ver el detalle del partido');
  check('una fila clicable declara foco, rol y etiqueta',
    /tabindex="0"/.test(attrs) && /role="button"/.test(attrs) &&
    /aria-label="Ver el detalle del partido"/.test(attrs), attrs);
  check('y se activa con el teclado reusando su propio onclick',
    /onkeydown="SGADD_UI\.teclaActiva\(event\)"/.test(attrs) &&
    /ev\.currentTarget\.click\(\)/.test(uiSrc));

  /* Toda fila con `cursor-pointer` promete un clic: si lo promete y no trae
     los atributos, es una acción que el teclado no puede alcanzar. */
  const sinTeclado = [];
  fs.readdirSync('./js').filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync('./js/' + f, 'utf8');
    const re = /<tr[^>]*cursor-pointer[\s\S]{0,700}?>/g;
    let m;
    while ((m = re.exec(src))) {
      if (!/atributosFila/.test(m[0])) sinTeclado.push(f + ': ' + m[0].slice(0, 70).replace(/\s+/g, ' '));
    }
  });
  check('ninguna fila clicable queda sin teclado', sinTeclado.length === 0, sinTeclado.join(' | '));

  /* Patrón estándar de tabs: un solo `aria-selected`, y tabindex rodante
     para que el tabulador entre UNA vez al grupo y adentro manden las
     flechas. Sin eso hay que tabular ocho veces para pasarlas de largo. */
  const htmlTabs = UI.tabs([{ id: 'general', label: 'General' }, { id: 'tiro', label: 'Tiro' }], 'general', 'irA');
  check('las tabs se anuncian como tabs',
    /role="tablist"/.test(htmlTabs) && (htmlTabs.match(/role="tab"/g) || []).length === 2);
  check('con una sola activa',
    (htmlTabs.match(/aria-selected="true"/g) || []).length === 1 &&
    (htmlTabs.match(/aria-selected="false"/g) || []).length === 1);
  check('y tabindex rodante, no ocho paradas del tabulador',
    (htmlTabs.match(/tabindex="0"/g) || []).length === 1 &&
    (htmlTabs.match(/tabindex="-1"/g) || []).length === 1);
  check('las flechas mueven entre pestañas', /onkeydown="SGADD_UI\.teclaTabs\(event\)"/.test(htmlTabs));

  /* El foco de una fila NO se puede marcar con `outline` a secas: en
     `display: table-row` los motores lo dibujan despareja, el mismo motivo
     por el que el fondo de una fila va en los <td> y no en el <tr>. */
  check('la fila enfocada se marca en sus celdas, no en el <tr>',
    /tr\[role="button"\]:focus-visible > td \{/.test(html));
  check('el anillo de foco sigue siendo :focus-visible y no :focus',
    /button:focus-visible/.test(html) && !/[^-]button:focus\s*[,{]/.test(html));

  /* Con un menú de seis secciones, sin salto el teclado lo atraviesa entero
     en cada pantalla. Va como <button> porque el hash es la RUTA de la app:
     un ancla a #view-root mandaría al DT a la pantalla de inicio. */
  check('hay un salto al contenido', /class="salto-contenido/.test(html));
  check('y no pisa la ruta con un ancla',
    !/<a[^>]*href="#view-root"/.test(html) && /getElementById\('view-root'\)\.focus\(\)/.test(html));

  check('las animaciones respetan prefers-reduced-motion',
    /@media \(prefers-reduced-motion: reduce\)/.test(html));

  /* =====================================================================
   LA CAPA DE DATOS VIEJA TAMBIÉN RESPETA EL TRAMO

   Principal es anterior al adaptador y leía el libro entero. Con
   DEPORTIVO, que trae Ida y Vuelta en el mismo libro, eso daba dos
   respuestas a la misma pregunta EN LA MISMA PANTALLA:

     barra superior  →  12 equipos · 64 partidos · 208 jugadores
     resumen general →  12 equipos · 76 partidos · 218 jugadores

   76 = 64 de Ida + 12 de Vuelta. Ya había pasado con el U23, donde el
   encabezado decía 0 partidos y el resumen 82.
   ===================================================================== */
console.log('\nSCOPE DE LA CAPA VIEJA');
console.log('═'.repeat(70));

check('sheet() pasa por el filtro de tramo',
  /function sheet\(key\) \{[\s\S]{0,160}scoparTramo\(/.test(html));
check('y el tramo sale del estado global, no de una copia local',
  /function tramoActivo\(\)[\s\S]{0,300}SGADD_APP\.estado/.test(html));

/* Las tres reglas son las MISMAS del núcleo: si divergen, la pantalla de
   entrada vuelve a contradecir al resto de la app. */
check('sin columna TORNEO no se filtra por torneo (planilla pre-v44)',
  /const hayTorneo = etiquetas\.indexOf\('TORNEO'\) !== -1;/.test(html) &&
  /if \(!hayFase && !hayTorneo\) return d;/.test(html));
check('una fila SIN torneo pasa siempre, aunque se esté filtrando',
  /const tt = dato\(r, 'TORNEO'\);[\s\S]{0,120}if \(tt && tt !==/.test(html));
check('la fila TIPO pasa siempre: es la mediana, no un equipo',
  /if \(esTipo\(r\)\) return true;/.test(html));
check('y GENERAL no filtra: es la etiqueta del caso sin torneo',
  /t\.torneo !== 'GENERAL'/.test(html));

/* =====================================================================
   LAS HOJAS RANKINGS YA NO SE PIDEN

   No son tablas planas sino informes maquetados: GViz devuelve basura y el
   núcleo las excluye desde el principio. Esta capa las seguía pidiendo por
   inercia para llenar una clave cuyo único consumidor —`buildEquiposLegacy`—
   había quedado fuera del router. Eran dos peticiones por arranque.
   ===================================================================== */
/* =====================================================================
   LA CAPA VIEJA PIDE SOLO LO QUE USA

   Pedía once hojas y consumía cuatro. Medido con un espía sobre `fetch`
   inyectado antes de que corriera un solo script: las once peticiones del
   arranque eran TODAS suyas —el adaptador ya sale de su caché— y siete no
   alimentaban a nadie.

     · `RANKINGS J` y `RANKINGS E`: su consumidor era `buildEquiposLegacy`,
       que había quedado fuera del router.
     · `ACUMULADO J`, `ACUMULADO E`, `4 FACTORES`, `ACUMULADO 4F`: cero usos.
     · `Base Datos J`: la más pesada del libro —106.790 celdas en DEPORTIVO,
       el 68% del volumen— y se usaba SOLO para contar jugadores distintos,
       un número que el índice ya tiene hecho y scopeado al tramo.

   Quedan cuatro peticiones, y son las chicas.
   ===================================================================== */
const hojasQuePide = (html.match(/name: '([^']+)',\s*key:/g) || [])
  .map(x => (x.match(/name: '([^']+)'/) || [])[1]);

check('la capa vieja pide exactamente cuatro hojas',
  hojasQuePide.length === 4, hojasQuePide.join(' · '));
check('y son las que consume de verdad',
  ['PROMEDIOS J', 'PROMEDIOS E', 'Base Datos E', 'PROMEDIOS 4F']
    .every(h => hojasQuePide.indexOf(h) >= 0), hojasQuePide.join(' · '));

/* Cada una tiene que tener al menos un `sheet('clave')` que la lea, o
   vuelve a ser una petición para llenar un hueco. */
const CLAVES = { 'PROMEDIOS J': 'promediosJ', 'PROMEDIOS E': 'promediosE',
  'Base Datos E': 'baseDatosE', 'PROMEDIOS 4F': 'promedios4f' };
hojasQuePide.forEach(h => {
  const k = CLAVES[h];
  check('la hoja ' + h + ' tiene quien la lea',
    !!k && html.indexOf("sheet('" + k + "')") >= 0);
});
/* Y ninguna de las que se sacaron puede volver por la ventana. */
['acumuladoJ', 'acumulado4f', '4factores', 'baseDatosJ', 'equipo'].forEach(k => {
  check('nadie volvió a pedir ' + k + ' desde sheet()',
    html.indexOf("sheet('" + k + "')") === -1);
});

/* El KPI de jugadores sale del índice, con respaldo por si Principal se
   pinta antes de que esté armado. */
check('el KPI de jugadores lee el índice, no la hoja más pesada',
  /const nJugadores = idxLiga \? String\(idxLiga\.jugadores\.length\)/.test(html));
/* Sin índice se muestra ausente, no un cero: llega unos milisegundos
   después y el número aparece solo. */
check('y sin índice muestra ausente, no un cero',
  /const nJugadores = idxLiga \? String\(idxLiga\.jugadores\.length\) : '—';/.test(html));

check('SHEETS_CONFIG ya no pide RANKINGS J ni RANKINGS E',
  !/name: 'RANKINGS J'/.test(html) && !/name: 'RANKINGS E'/.test(html));
check('y la función muerta que las consumía se borró',
  !/^function buildEquiposLegacy/m.test(html));
/* El núcleo las sigue excluyendo por su cuenta: son dos guardas
   independientes y las dos tienen que seguir en pie. */
check('el núcleo las mantiene en su lista de excluidas',
  /HOJAS_EXCLUIDAS = \['RANKINGS J', 'RANKINGS E'\]/.test(
    require('fs').readFileSync('./js/sgadd-core.js', 'utf8')));

/* =====================================================================
   EL DIAGNÓSTICO MIRA EL MISMO TRAMO QUE LA APP

   Armaba su índice con `{ fase }` y sin torneo, así que en un libro con
   IDA y VUELTA en la misma FASE = REGULAR los dos se colapsaban: las filas
   del segundo pisan los promedios del primero y cada jugador entra una vez
   por torneo. Medido en DEPORTIVO: el Diagnóstico decía 373 jugadores
   mientras todas las demás pantallas trabajaban sobre 208.

   Es la pantalla que el DT abre justamente para auditar a las otras, así
   que una foto distinta no es un detalle: es la auditoría mintiendo.
   ===================================================================== */
const diagSrc = fs.readFileSync('./js/sgadd-diagnostico.js', 'utf8');
const coreSrc = fs.readFileSync('./js/sgadd-core.js', 'utf8');

check('el Diagnóstico scopea su índice al torneo',
  /construirIndice\(hojas, \{ fase: d\.fase, torneo: d\.torneo \}\)/.test(diagSrc));
check('y ya no arma ninguno sin torneo',
  !/construirIndice\(hojas, \{ fase: d\.fase \}\)/.test(diagSrc));
check('su selector ofrece los MISMOS pares que la barra',
  /SGADD\.combinacionesTorneoFase\(hojas\)/.test(diagSrc));
check('y abre por el tramo de mayor cobertura, igual que la barra',
  /SGADD\.tramoPorDefecto\(d\.datos\.tramos\)/.test(diagSrc));
/* Los dos setters de una sola vez: encadenarlos reindexaría dos veces y la
   primera pasada armaría el índice sobre un par que puede no existir. */
check('cambiar de tramo escribe torneo y fase juntos',
  /function diagCambiarFase[\s\S]{0,400}SGADD_DIAG\.torneo = t\.torneo;[\s\S]{0,80}SGADD_DIAG\.fase = t\.fase;/.test(diagSrc));

/* El aviso mandaba a un "selector Torneo" que dejó de existir cuando los
   dos desplegables se fusionaron en uno solo rotulado Fase. Un mensaje de
   error que nombra un control inexistente es peor que no decir nada. */
check('el aviso de multi-torneo nombra el selector que existe',
  /selector Fase de la barra superior/.test(coreSrc) &&
  !/selector Torneo de la barra/.test(coreSrc));

/* =====================================================================
   UN SOLO CARTEL DE ESPERA PARA TODAS LAS SECCIONES

   Las cuatro tenían su propio `<div>` con un texto quieto. Un bloque de
   texto sin movimiento no distingue "está bajando" de "se colgó", que es
   justo la pregunta del DT cuando la planilla tarda. `SGADD_UI.cargando()`
   pone el mismo disco del arranque y lo anuncia a los lectores de pantalla.
   ===================================================================== */
const UI2 = require('./js/sgadd-ui.js');
const cartel = UI2.cargando('Cargando la categoría…', 'Primera 2026');

check('el cartel de espera trae el disco que gira',
  /cargando-disco/.test(cartel));
check('y se anuncia sin robar el foco',
  /role="status"/.test(cartel) && /aria-live="polite"/.test(cartel));
check('el detalle es opcional',
  !/Primera 2026/.test(UI2.cargando('Cargando…')));
check('y escapa lo que le pasen',
  UI2.cargando('<img src=x onerror=1>').indexOf('<img') === -1);

/* El disco lo inyecta un nodo dinámico, así que el JIT del CDN de Tailwind
   no le genera las clases: la regla va a mano en el <style>. */
check('el disco tiene su CSS propio en el index',
  /\.cargando-disco \{/.test(html));
check('y se queda quieto con movimiento reducido',
  /prefers-reduced-motion[\s\S]{0,200}\.cargando-disco/.test(html));

['sgadd-equipos', 'sgadd-jugadores', 'sgadd-4factores', 'sgadd-scouting',
 'sgadd-diagnostico'].forEach(m => {
  const src = fs.readFileSync('./js/' + m + '.js', 'utf8');
  check(m + ' usa el cartel compartido', /SGADD_UI\.cargando\(/.test(src));
  check(m + ' no dejó su propio "Cargando la categoría" a mano',
    !/Cargando la categor[íi]a…'\)/.test(src.replace(/SGADD_UI\.cargando\(/g, '')));
});

/* Chart.js son ~200 KB que no hacen falta para parsear el body. Es seguro
   diferirlo porque ningún módulo lo toca al cargarse. Si alguno vuelve a
   usarlo a nivel de módulo, el gráfico rompe en el arranque. */
check('Chart.js va diferido',
  /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js/.test(html));
['sgadd-charts', 'sgadd-equipos', 'sgadd-jugadores', 'sgadd-4factores'].forEach(m => {
  const src = fs.readFileSync('./js/' + m + '.js', 'utf8');
  /* `Chart` al principio de una línea es uso a nivel de módulo; adentro de
     una función siempre viene indentado o precedido de algo. */
  check(m + ' no toca Chart al cargarse',
    !/^\s{0,2}Chart\s*\./m.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
});

/* =====================================================================
   TAILWIND SE SIRVE COMPILADO, NO POR CDN

   El <script> de cdn.tailwindcss.com iba sincrono en el <head> y bajaba
   ~400 KB de motor JIT antes de que el navegador parseara una linea del
   <body>. Medido a 200 kbps: 26,4 s de pantalla en blanco, sin siquiera el
   loader. Con el CSS compilado, 5,9 s.

   El riesgo de la migracion es el scan ESTATICO: una clase armada por
   concatenacion en runtime no aparece en el fuente y se pierde. Se midio
   antes de migrar sobre 3 clubes x 6 secciones + ficha de equipo: de las
   278 clases vivas del DOM, las 278 estaban literales. Por eso no hay
   safelist — y por eso hay que REGENERAR al agregar una clase nueva.
   ===================================================================== */
check('el CDN de Tailwind ya no se pide',
  html.indexOf('cdn.tailwindcss.com') === -1 ||
  /<!--[\s\S]*cdn\.tailwindcss\.com[\s\S]*-->/.test(html));
check('y no queda ningun <script> suyo',
  !/<script[^>]+src="https:\/\/cdn\.tailwindcss\.com/.test(html));
check('el CSS compilado se enlaza con su ?v=',
  /<link rel="stylesheet" href="sgadd\.css\?v=\d+"/.test(html));

/* El <link> va DESPUES de nuestro <style>, que es exactamente donde el CDN
   inyectaba el suyo. Hay reglas de impresion que dependen de ganar o perder
   un empate de especificidad por orden de documento (punto 7.6): moverlo
   antes las daria vuelta sin ningun sintoma visible. */
check('el <link> va despues del <style>, como estaba el del CDN',
  html.indexOf('sgadd.css?v=') > html.indexOf('</style>'));

/* La config es la MISMA que vivia en el <head>. Si alguien cambia un color
   aca y no regenera, el CSS y la config dicen cosas distintas. */
const twCfg = require('./tailwind.config.js');
check('la config de Tailwind se mudo al repo',
  !!(twCfg.theme && twCfg.theme.extend && twCfg.theme.extend.colors));
check('y escanea el index y los modulos',
  twCfg.content.indexOf('./index.html') >= 0 && twCfg.content.indexOf('./js/*.js') >= 0);
['base', 'surface', 'surface2', 'hairline', 'accent', 'accentdeep', 'ink', 'muted']
  .forEach(c => check('el color ' + c + ' sigue definido',
    !!twCfg.theme.extend.colors[c]));
['display', 'body', 'mono'].forEach(f =>
  check('la familia ' + f + ' sigue definida', !!twCfg.theme.extend.fontFamily[f]));

/* El CSS generado tiene que estar commiteado: es lo que sirve Pages. Un
   repo sin el se ve sin un solo estilo, que es peor que lento. */
const cssGen = fs.existsSync('./sgadd.css') ? fs.readFileSync('./sgadd.css', 'utf8') : '';
check('sgadd.css esta en el repo', cssGen.length > 5000, cssGen.length + ' bytes');
check('y trae las utilidades que la app usa de verdad',
  ['.text-xs', '.bg-surface2', '.border-hairline', '.text-muted', '.font-display']
    .every(u => cssGen.indexOf(u) >= 0));
/* Los colores POR CLUB no van compilados: son variables que sgadd-club.js
   escribe en runtime. Si alguna quedara horneada, los tres clientes se
   verian iguales. */
check('el acento del club sigue saliendo de una variable, no del CSS',
  /\.bg-accent\s*\{[^}]*var\(--acento\)/.test(html));

/* Y el generador tiene que seguir existiendo y apuntando a la major que
   servia el CDN: con Tailwind 4 sobre una config de la 3 el CSS sale
   distinto y la diferencia no se ve hasta abrir una seccion puntual. */
const genSrc = fs.readFileSync('./generar-css.js', 'utf8');
check('hay un generador y fija la version', /tailwindcss@3/.test(genSrc));
check('y usa la misma config e input que el repo',
  /tailwind\.config\.js/.test(genSrc) && /sgadd\.in\.css/.test(genSrc));

/* =====================================================================
   PRINCIPAL SE DIFERENCIA POR TRAMO

   Se veía IGUAL en Ida que en Vuelta. La causa no era el scope —que
   funciona, y filtra 128 filas contra 24— sino que Principal se pinta
   ANTES de que el tramo se conozca (`init()` dispara `cargar()` sin
   await) y después NUNCA volvía a pintarse. Sus KPIs quedaban con los
   valores del primer render: medido en DEPORTIVO, `PARTIDOS 76` —los dos
   torneos sumados— en las dos fases, con el mismo mejor ataque y el mismo
   líder.

   Verificado después del fix: 208/64 en Ida, 165/12 en Vuelta, 218/76 en
   Total, con distinto líder y distinto mejor ataque.
   ===================================================================== */
const appSrcP = fs.readFileSync('./js/sgadd-app.js', 'utf8');
check('Principal se repinta entera al cambiar de tramo',
  /currentSection === 'principal'[\s\S]{0,200}renderSection\('principal'\)/.test(appSrcP));
/* Repintar desde onCambio NO reabre el ciclo que colgó la página: aquel
   bucle era gráfico → LOGOS.resolver → hook → repintado → gráfico, y a
   `onCambio` solo lo disparan `cargar()` y `reindexar()`. */
check('y el repintado va protegido, no puede tumbar el resto',
  /renderSection\('principal'\)[\s\S]{0,80}catch/.test(appSrcP));
check('los KPIs de Principal pasan por el scope del tramo',
  /const promE = sheet\('promediosE'\)/.test(html) &&
  /const baseE = sheet\('baseDatosE'\)/.test(html) &&
  /const promJ = sheet\('promediosJ'\)/.test(html));

/* =====================================================================
   EL CENTINELA DEL TOTAL EN LA CAPA VIEJA

   `scoparTramo` comparaba el torneo pedido contra el de cada fila. Con
   `*TOTAL*` eso no coincide con NINGUNA y la pantalla quedaba en cero
   filas — medido al sumarlo: 0 de 152. El TOTAL no filtra por torneo.
   ===================================================================== */
check('scoparTramo conoce el centinela del TOTAL',
  /totalDeFase/.test(html) && /SGADD\.esTotal/.test(html));
check('y con el TOTAL no filtra por torneo',
  /t\.torneo !== 'GENERAL' && !totalDeFase/.test(html));
/* Sigue filtrando por FASE: juntar una fase regular con unos playoffs no
   significa nada, y el TOTAL es de UNA fase. */
check('pero sigue filtrando por fase',
  /if \(hayFase\) \{ const f = dato\(r, 'FASE'\);/.test(html));

/* =====================================================================
   EL HASH RESTAURA LA SECCIÓN · los dos formatos

   Conviven dos vocabularios de hash y `init()` entendía uno solo:

     #equipos                                ← plano, el del menú
     #/<planilla>/<torneo>/<fase>/equipos/…  ← ruta SGADD, la de las
                                               fichas y los links

   Con el segundo, `VALID_SECTIONS.includes('/deportivo-primera-…')` daba
   false y la app abría en PRINCIPAL. Una segunda pasada la corregía, así
   que el DT veía un parpadeo — y si esa pasada perdía la carrera se
   quedaba en Principal.
   ===================================================================== */
check('hay una función que resuelve la sección desde la URL',
  /function seccionDeLaUrl\(\)/.test(html));
check('init la usa en vez de mirar solo el hash plano',
  /currentSection = seccionDeLaUrl\(\);/.test(html) &&
  !/const initial = \(window\.location\.hash/.test(html));
/* Reusa `Ruta.parse`, que ya conoce los dos formatos. Un segundo parser
   se queda viejo en cuanto se agregue una sección. */
check('reusa el parser del núcleo, no escribe uno propio',
  /function seccionDeLaUrl[\s\S]{0,900}SGADD\.Ruta\.parse\(h\)/.test(html));
check('y solo acepta secciones que el router conoce',
  /function seccionDeLaUrl[\s\S]{0,900}VALID_SECTIONS\.includes\(r\.seccion\)/.test(html));
/* Un hash roto no puede impedir que la app abra. */
check('un hash raro cae a principal sin tirar',
  /function seccionDeLaUrl[\s\S]{0,900}catch \(e\)[\s\S]{0,120}return 'principal';/.test(html));

/* =====================================================================
   PRINCIPAL CONSUME EL ÍNDICE, NO LAS HOJAS DERIVADAS

   `PROMEDIOS E`, `PROMEDIOS 4F` y `PROMEDIOS J` traen UNA FILA POR
   (entidad, torneo, fase). En el tramo TOTAL eso significa dos filas por
   equipo y dos por jugador, y se veía:

     · el scatter ORTG/DRTG pintaba CADA CLUB DOS VECES (24 nodos para 12
       equipos, medido);
     · `Mejor Ataque` mostraba 75,64 —el promedio de Ida de DLP— cuando su
       total consolidado es 74,23;
     · los líderes salían de 400 filas donde hay 218 jugadores.

   Deduplicar la hoja no arregla nada: habría que elegir una de las dos
   filas, y las dos son los números de UN torneo rotulados como si fueran
   los del total. El índice ya tiene los valores consolidados.
   ===================================================================== */
check('el scatter arma su dataset desde el índice',
  /function drawOrtgDrtgChart[\s\S]{0,1800}idxG\.lista\(\)\.map/.test(html));
check('y deja la hoja SOLO como respaldo del arranque',
  /function drawOrtgDrtgChart[\s\S]{0,2600}\} else \{[\s\S]{0,200}sheet\('promedios4f'\)/.test(html));
check('Mejor Ataque sale del índice',
  /if \(idxLiga\) \{[\s\S]{0,500}renderModernCard\('Mejor Ataque'/.test(html));
check('y los líderes también',
  /function buildLeaderCard[\s\S]{0,900}idxL\.liga\.jugadores/.test(html));
/* Las dos ramas de la card de líderes pintan con el MISMO helper: si
   cada una armara su HTML, se verían distinto según de dónde salió el
   dato y nadie lo notaría hasta comparar dos tramos. */
check('las dos ramas de la card de líderes comparten el HTML',
  /function itemLeaderHTML\(/.test(html) &&
  (html.match(/itemLeaderHTML\(/g) || []).length >= 3);
/* `idxLiga` se declara ARRIBA de todo: con `const` a mitad de la función,
   todo lo que iba antes caía en zona muerta. */
check('el índice se declara antes de su primer uso',
  html.indexOf('const idxLiga') < html.indexOf("renderModernCard('Mejor Ataque'"));

/* =====================================================================
   JUGADORES · elegir un equipo es ENTRAR A OTRA VISTA

   Antes se apilaba todo: el picker seguía ocupando media pantalla
   después de elegir, y el top 20 de la liga quedaba debajo del plantel
   contestando una pregunta que el DT ya no está haciendo.
   ===================================================================== */
const jugSrcV = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
check('con un equipo elegido se esconde el picker',
  /function jugadoresGrilla[\s\S]{0,900}conEquipo \? '' : jugadoresPickerEquipos\(idx\)/.test(jugSrcV));
check('y el top 20 de la liga también',
  /function jugadoresGrilla[\s\S]{0,900}conEquipo \? '' : jugadoresBloqueRankings\(idx\)/.test(jugSrcV));
check('el plantel se muestra siempre: es lo que decide la vista',
  /function jugadoresGrilla[\s\S]{0,900}jugadoresPlantelEquipo\(idx\),/.test(jugSrcV));
/* Con el picker escondido, el botón de la card del plantel es el ÚNICO
   camino de vuelta: sin él, esconderlo dejaría al DT encerrado. */
check('queda un camino de vuelta, y dice a dónde lleva',
  /Elegir otro equipo/.test(jugSrcV) &&
  /jugadoresElegirEquipo\(/.test(jugSrcV));

console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
