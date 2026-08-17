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

  console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
