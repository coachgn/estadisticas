/* =====================================================================
   SGADD · TESTS DEL ESTADO REACTIVO DEL PANEL MASTER

   Cuatro defectos reportados desde producción, los cuatro reproducidos
   antes de tocar nada:

   1. LA CATEGORÍA NO SOBREVIVÍA AL F5. `inicializar()` leía la planilla
      del hash, pero el Panel Master escribe `#configuracion` a secas, así
      que caía a la primera activa del catálogo. Medido: parado en U21 y
      recargando, volvía a Primera.

   2. ESTADO CONTAMINADO AL CAMBIAR DE CATEGORÍA. `buildConfiguracion()`
      llama a `configCargarBorrador()` SIN forzar, y esa función sale
      temprano si ya hay borrador. Medido parado en U21:

        estado.planillaId   naranja-u21-clausura-2026   ← el global cambió
        CONFIGUI.categoria  primera-clausura-2026       ← viejo
        CONFIGUI.propia     true                        ← viejo
        equiposEsperados    12                          ← el de Primera
        la tarjeta decía    «Solo Primera · Vuelta 2026»

   3. PUBLICAR NO AVISABA NADA. `configAvisar()` escribe dentro de
      `#view-root` y la línea siguiente era `configPintar()`, que lo
      reconstruye entero: el mensaje se borraba al escribirse.

   4. Las cadenas de «Alcance del cambio» NO estaban hardcodeadas —
      interpolan `CONFIGUI.categoria`—, así que el defecto 4 es el 2 visto
      desde la pantalla. El test lo fija igual, porque un hardcodeo futuro
      no daría ningún síntoma hasta que alguien mire.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const leer = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
/* El fuente sin comentarios: si no, los tests que buscan una llamada la
   encuentran en la explicación de por qué NO hay que hacerla. Ya pasó. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PLANILLAS = [
  { id: 'primera-clausura-2026', label: 'Primera · Vuelta 2026', activo: true, tira: 'naranja' },
  { id: 'naranja-u21-clausura-2026', label: 'Masculina Naranja · U21', activo: true, tira: 'naranja' },
  { id: 'naranja-u23-clausura-2026', label: 'Masculina Naranja · U23', activo: true, tira: 'naranja' },
  { id: 'dormida', label: 'Sin datos', activo: false, tira: 'naranja' },
];

/** localStorage de mentira, con la opción de fallar como en modo privado. */
function almacenFalso(rompe) {
  const d = {};
  return {
    _d: d,
    getItem(k) { if (rompe) throw new Error('modo privado'); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem(k, v) { if (rompe) throw new Error('modo privado'); d[k] = String(v); },
    removeItem(k) { delete d[k]; },
  };
}

/* =====================================================================
   1 · LA CATEGORÍA SOBREVIVE AL F5
   ===================================================================== */
bloque('1 · La categoría se recuerda entre recargas');

function appEn(hash, opciones) {
  const o = opciones || {};
  const SGADD = require('./js/sgadd-core.js');
  const ctx = {
    console, JSON, Object, Array, Math, Map, Set, Promise, Date,
    setTimeout, clearTimeout,
    localStorage: o.almacen || almacenFalso(false),
    document: { getElementById: () => null, querySelectorAll: () => [] },
    SGADD: Object.assign(Object.create(SGADD), {
      CATALOGO: { planillas: o.planillas || PLANILLAS },
      planilla: (id) => (o.planillas || PLANILLAS).filter(p => p.id === id)[0] || null,
      planillasVisibles: () => (o.planillas || PLANILLAS).filter(p => p.activo),
    }),
    SGADD_UI: { esc: (x) => String(x) },
    CLUB: { estado: { id: o.club || 'reconquista' } },
    location: { hash: hash || '' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('js/sgadd-app.js'), ctx);
  ctx.SGADD_APP = vm.runInContext('SGADD_APP', ctx);
  return ctx;
}

/* Sin nada recordado y sin ruta: la primera activa, como siempre. */
let A = appEn('#configuracion');
A.SGADD_APP.inicializar();
igual(A.SGADD_APP.estado.planillaId, 'primera-clausura-2026',
      'sin recuerdo ni ruta abre en la primera activa, como antes');

/* LA REGRESIÓN: elegir U21 y volver a arrancar tiene que devolver U21. */
const mem = almacenFalso(false);
A = appEn('#configuracion', { almacen: mem });
A.SGADD_APP.inicializar();
A.SGADD_APP.cambiarPlanilla('naranja-u21-clausura-2026');
igual(A.SGADD_APP.estado.planillaId, 'naranja-u21-clausura-2026', 'se cambia a U21');
ok(mem._d['sgadd.categoria.reconquista'] === 'naranja-u21-clausura-2026',
   'y queda recordada', JSON.stringify(mem._d));

const B = appEn('#configuracion', { almacen: mem });
B.SGADD_APP.inicializar();
igual(B.SGADD_APP.estado.planillaId, 'naranja-u21-clausura-2026',
      'LA REGRESIÓN: tras el F5 monta en U21, no en Primera');

/* LA RUTA GANA. Un link compartido tiene que abrir donde dice el link, no
   donde estaba parado el que lo abre. */
const C = appEn('#/primera-clausura-2026/GENERAL/REGULAR/equipos', { almacen: mem });
C.SGADD_APP.inicializar();
igual(C.SGADD_APP.estado.planillaId, 'primera-clausura-2026',
      'un link con planilla le gana al recuerdo');
igual(mem._d['sgadd.categoria.reconquista'], 'naranja-u21-clausura-2026',
      'y abrir un link NO pisa el recuerdo: no fue un gesto en el selector');

/* La clave es POR CLUB: otro club no hereda la categoría del anterior. */
const D = appEn('#configuracion', { almacen: mem, club: 'jujuy' });
D.SGADD_APP.inicializar();
igual(D.SGADD_APP.estado.planillaId, 'primera-clausura-2026',
      'otro club no hereda la categoría recordada del anterior');

/* Una planilla dada de baja no puede dejar la pantalla vacía. */
const mem2 = almacenFalso(false);
mem2._d['sgadd.categoria.reconquista'] = 'dormida';
const E1 = appEn('#configuracion', { almacen: mem2 });
E1.SGADD_APP.inicializar();
igual(E1.SGADD_APP.estado.planillaId, 'primera-clausura-2026',
      'una planilla inactiva recordada degrada a la primera activa');

mem2._d['sgadd.categoria.reconquista'] = 'ya-no-existe';
const E2 = appEn('#configuracion', { almacen: mem2 });
E2.SGADD_APP.inicializar();
igual(E2.SGADD_APP.estado.planillaId, 'primera-clausura-2026',
      'y una que ya no está en el catálogo, también');

/* Modo privado: `localStorage` tira al tocarlo. No puede tumbar el arranque. */
let lanzo = false;
try {
  const F = appEn('#configuracion', { almacen: almacenFalso(true) });
  F.SGADD_APP.inicializar();
  F.SGADD_APP.cambiarPlanilla('naranja-u21-clausura-2026');
  igual(F.SGADD_APP.estado.planillaId, 'naranja-u21-clausura-2026',
        'sin localStorage el cambio de categoría igual funciona');
} catch (e) { lanzo = true; }
igual(lanzo, false, 'un localStorage que lanza no tumba el arranque');

/* Se recuerda SOLO el gesto explícito, igual que `recordarTramo` (punto
   40): grabar el default congelaría el criterio de arranque. */
const fuenteApp = sinComentarios(leer('js/sgadd-app.js'));
const enCambiar = fuenteApp.slice(fuenteApp.indexOf('function cambiarPlanilla'),
                                  fuenteApp.indexOf('function cambiarFase'));
ok(enCambiar.indexOf('recordarCategoria') > -1,
   'se recuerda dentro de cambiarPlanilla');
const enInicializar = fuenteApp.slice(fuenteApp.indexOf('function inicializar'),
                                      fuenteApp.indexOf('async function cargar'));
ok(enInicializar.indexOf('recordarCategoria(') === -1,
   'y NO se recuerda en inicializar: grabar el default congelaría el criterio');

/* =====================================================================
   2 · EL ESTADO DERIVADO SE TIRA AL CAMBIAR DE CATEGORÍA
   ===================================================================== */
bloque('2 · Aislamiento de estado entre categorías');

const CLUB_JSON = {
  id: 'reconquista', nombre: 'Club Reconquista La Plata',
  planillas: PLANILLAS.filter(p => p.activo),
  competencia: {
    ordenTabla: ['PCT', 'DIF', 'PF'],
    formatos: { club: { id: 'club', label: 'Del club', equiposEsperados: 12, zonas: [] } },
    porTramo: { '*': 'club' },
    porCategoria: {
      'primera-clausura-2026': {
        formatos: { pri: { id: 'pri', label: 'Primera', equiposEsperados: 9, zonas: [] } },
        porTramo: { '*': 'pri' },
      },
    },
  },
};

function pantalla() {
  const SGADD = require('./js/sgadd-core.js');
  const toasts = [];
  const ctx = {
    console, JSON, Object, Array, Math, Map, Set, Promise, Date, setTimeout,
    localStorage: almacenFalso(false),
    document: { getElementById: () => null, querySelectorAll: () => [] },
    SGADD: Object.assign(Object.create(SGADD), {
      CATALOGO: { planillas: PLANILLAS },
      planilla: (id) => PLANILLAS.filter(p => p.id === id)[0] || null,
    }),
    SGADD_UI: { esc: (x) => String(x == null ? '' : x) },
    escapeHtml: (x) => String(x == null ? '' : x),
    CLUB: { cfg: CLUB_JSON, estado: { id: 'reconquista' } },
    SGADD_APP: { estado: { planillaId: 'primera-clausura-2026' }, reindexar() {} },
    SGADD_BUZON: { toast: (t, tono) => toasts.push({ t, tono }) },
    SGADD_DATA: { apiConfigurada: () => true, guardarCatalogo: () => Promise.resolve({}) },
    SGADD_AUTH: { rol: () => 'ADMIN' },
    currentSection: 'configuracion',
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(leer('js/sgadd-config.js'), ctx);
  vm.runInContext(leer('js/sgadd-configui.js'), ctx);
  ctx.CONFIGUI = vm.runInContext('CONFIGUI', ctx);
  ctx.toasts = toasts;
  ctx.configPintar = () => {};
  ctx.configPintarPreview = () => {};
  return ctx;
}

const P = pantalla();
P.configCargarBorrador();
igual(P.CONFIGUI.categoria, 'primera-clausura-2026', 'arranca en Primera');
igual(P.CONFIGUI.propia, true, 'que tiene reglas propias');
igual(P.configFormatoActual().equiposEsperados, 9, 'y su formato declara 9 equipos');

/* EL CAMBIO. Sin el arreglo, todo esto se quedaba en los valores de arriba. */
P.SGADD_APP.estado.planillaId = 'naranja-u21-clausura-2026';
P.configCargarBorrador();
igual(P.CONFIGUI.categoria, 'naranja-u21-clausura-2026',
      'LA REGRESIÓN: la categoría se actualiza al cambiar de planilla');
igual(P.CONFIGUI.propia, false, 'U21 hereda del club, y `propia` lo refleja');
igual(P.configFormatoActual().equiposEsperados, 12,
      'y el formato pasa a ser el del club, no el de Primera');
igual(Object.keys(P.CONFIGUI.borrador.formatos), ['club'],
      'el borrador es el del nivel que corresponde');

/* Y vuelve bien. */
P.SGADD_APP.estado.planillaId = 'primera-clausura-2026';
P.configCargarBorrador();
igual(P.CONFIGUI.categoria, 'primera-clausura-2026', 'y al volver, vuelve');
igual(P.configFormatoActual().equiposEsperados, 9, 'con su formato propio');

/* `resetEstadoCategoria` limpia TODO lo derivado: lo que no se limpia acá
   es lo que se ve viejo en pantalla. */
const R = pantalla();
R.configCargarBorrador();
R.CONFIGUI.sucio = true;
R.CONFIGUI.exportando = true;
R.resetEstadoCategoria();
['borrador', 'completo', 'categoria', 'formatoSel'].forEach(k =>
  igual(R.CONFIGUI[k], null, 'resetEstadoCategoria limpia ' + k));
igual(R.CONFIGUI.propia, false, 'resetEstadoCategoria limpia propia');
igual(R.CONFIGUI.sucio, false, 'resetEstadoCategoria limpia sucio');
igual(R.CONFIGUI.exportando, false,
      'y cierra el panel de export: mostraba el archivo de la otra categoría');

/* Editar y NO cambiar de categoría no puede perder el trabajo: el early
   return sigue existiendo, y es lo que permite tipear. */
const Q = pantalla();
Q.configCargarBorrador();
Q.CONFIGUI.borrador.formatos.pri.equiposEsperados = 77;
Q.CONFIGUI.sucio = true;
Q.configCargarBorrador();
igual(Q.configFormatoActual().equiposEsperados, 77,
      'sin cambio de categoría, el borrador NO se pisa');
igual(Q.CONFIGUI.sucio, true, 'y los cambios sin guardar siguen marcados');

/* Cambiar de categoría con cambios sin guardar los descarta, PERO avisa.
   Perderlos en silencio es peor que perderlos. */
const S2 = pantalla();
S2.configCargarBorrador();
S2.CONFIGUI.sucio = true;
S2.SGADD_APP.estado.planillaId = 'naranja-u21-clausura-2026';
S2.configCargarBorrador();
ok(S2.toasts.some(x => /descartaron/i.test(x.t)),
   'se avisa que se descartaron los cambios sin guardar',
   JSON.stringify(S2.toasts));
ok(S2.toasts.some(x => /Primera/.test(x.t)),
   'y se dice de QUÉ categoría eran', JSON.stringify(S2.toasts));

/* Sin cambios sucios no molesta con un toast por cada cambio de pestaña. */
const S3 = pantalla();
S3.configCargarBorrador();
S3.SGADD_APP.estado.planillaId = 'naranja-u21-clausura-2026';
S3.configCargarBorrador();
igual(S3.toasts.length, 0, 'sin cambios pendientes, cambiar de categoría no avisa nada');

/* =====================================================================
   3 · «ALCANCE DEL CAMBIO» LEE EL ESTADO, NO UNA CONSTANTE
   ===================================================================== */
bloque('3 · Las cadenas salen del estado reactivo');

const T = pantalla();
T.configCargarBorrador();
const htmlPri = T.configAlcanceHTML();
ok(htmlPri.indexOf('Primera · Vuelta 2026') > -1,
   'en Primera nombra a Primera');
ok(htmlPri.indexOf('Masculina Naranja · U21') === -1,
   'y no nombra a las otras como si fueran la abierta');

T.SGADD_APP.estado.planillaId = 'naranja-u21-clausura-2026';
T.configCargarBorrador();
const htmlU21 = T.configAlcanceHTML();
ok(htmlU21.indexOf('Masculina Naranja · U21') > -1,
   'LA REGRESIÓN: en U21 nombra a U21');
ok(!/Solo Primera/.test(htmlU21),
   'y ya NO dice «Solo Primera · Vuelta 2026» estando en U21');
ok(htmlPri !== htmlU21, 'la tarjeta cambia de verdad entre categorías');

/* El nombre sale del catálogo, que es la misma fuente que el selector: si
   saliera de otro lado, la tarjeta y el desplegable podrían discrepar. */
const fuenteUi = sinComentarios(leer('js/sgadd-configui.js'));
ok(fuenteUi.indexOf('SGADD.CATALOGO.planillas') > -1,
   'los nombres salen del catálogo');
['Primera · Vuelta', 'Masculina Naranja', 'U21', 'U23'].forEach(lit =>
  ok(fuenteUi.indexOf("'" + lit) === -1 && fuenteUi.indexOf('"' + lit) === -1,
     'ningún nombre de categoría está hardcodeado en la UI: ' + lit));

/* Y el rótulo del alcance se deriva de `propia`, no de un texto fijo. */
const U = pantalla();
U.configCargarBorrador();
ok(/Solo /.test(U.configAlcanceHTML()), 'con reglas propias dice «Solo <categoría>»');
U.SGADD_APP.estado.planillaId = 'naranja-u23-clausura-2026';
U.configCargarBorrador();
ok(/Todas las categorías/i.test(U.configAlcanceHTML()),
   'y heredando del club dice que alcanza a todas');

/* =====================================================================
   4 · PUBLICAR AVISA · el toast sobrevive al repintado
   ===================================================================== */
bloque('4 · Feedback al publicar');

function publicar(resultado) {
  const V = pantalla();
  V.configCargarBorrador();
  const repintados = [];
  V.configPintar = () => { repintados.push(1); };
  V.SGADD_DATA.guardarCatalogo = () => resultado;
  V.configPublicar();
  return { V, repintados };
}

const okPub = publicar(Promise.resolve({ clubes: [] }));

(async () => {
  await new Promise(r => setTimeout(r, 30));
  ok(okPub.V.toasts.some(x => x.tono === 'ok'), 'publicar bien dispara un toast de éxito',
     JSON.stringify(okPub.V.toasts));
  ok(okPub.V.toasts.some(x => /publicada en el servidor/i.test(x.t)),
     'que dice que subió al servidor', JSON.stringify(okPub.V.toasts));
  ok(okPub.V.toasts.some(x => /Primera/.test(x.t)),
     'y nombra la categoría publicada', JSON.stringify(okPub.V.toasts));

  const malPub = publicar(Promise.reject(new Error('KV no responde')));
  await new Promise(r => setTimeout(r, 30));
  ok(malPub.V.toasts.some(x => x.tono === 'error'), 'y un fallo dispara un toast de error',
     JSON.stringify(malPub.V.toasts));
  ok(malPub.V.toasts.some(x => /KV no responde/.test(x.t)),
     'con el motivo que devolvió el servidor');

  /* EL ORDEN. El aviso inline vive dentro de `#view-root`, así que si se
     escribe ANTES del repintado se borra solo. */
  const cuerpo = sinComentarios(leer('js/sgadd-configui.js'));
  const pub = cuerpo.slice(cuerpo.indexOf('function configPublicar'),
                           cuerpo.indexOf('function configRestablecer'));
  const iPintar = pub.indexOf('configPintar()');
  const iAviso = pub.indexOf("configAvisar('Publicado");
  ok(iPintar > -1 && iAviso > -1 && iPintar < iAviso,
     'se repinta ANTES de avisar, o el repintado se lleva el aviso');

  /* El toast se cuelga del body, no de la sección: es lo que lo hace
     sobrevivir. Y se REUSA el del buzón en vez de escribir un segundo. */
  const buzon = leer('js/sgadd-buzon.js');
  ok(buzon.indexOf("document.body.appendChild(cont)") > -1,
     'el toast se cuelga del body, fuera de #view-root');
  ok(buzon.indexOf("role', 'status'") > -1 || buzon.indexOf('"status"') > -1,
     'y se anuncia a lectores de pantalla (punto 14)');
  ok((cuerpo.match(/document\.createElement\('div'\)/g) || []).length === 0,
     'la pantalla de configuración no escribe un segundo toast propio');

  /* La duración es configurable: el aviso de publicar es una frase larga y
     en 2,6 s no se llega a leer. */
  ok(/function toast\(texto, tono, ms\)/.test(buzon), 'el toast acepta una duración');
  ok(/configToast\([^)]*, *'ok', *\d+\)/.test(cuerpo),
     'y publicar pide una más larga que el default');

  console.log('\n' + '─'.repeat(60));
  if (fallados === 0) {
    console.log('✓ TODO OK · ' + pasados + ' tests');
  } else {
    console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados));
    process.exitCode = 1;
  }
})();
