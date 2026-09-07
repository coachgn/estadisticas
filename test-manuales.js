/* =====================================================================
   SGADD · PARTIDOS SIN ESTADÍSTICAS (carga manual)

   Cuando GES no publica el box score, el partido existió igual: cuenta
   para la tabla y no puede faltar. Pero NO puede entrar por donde entran
   los demás.

   LA PROPIEDAD QUE SOSTIENE TODO EL DISEÑO: un partido manual toca
   exactamente PJ, PG, PP, PF, PC y el split local/visitante —de donde
   salen PCT, DIF y los puntos de tabla— y NADA MÁS. Si entrara al
   índice, un partido del que solo se sabe el marcador daría un equipo
   con más PJ y los mismos totales de tiro: eFG% y PACE diluidos, y
   jugadores con menos minutos por partido sin haber faltado a ninguno.
   Números plausibles y falsos.

   Por eso el grueso de estos tests no verifica lo que el partido manual
   HACE, sino lo que NO toca.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CLASIF = require('./js/sgadd-clasificacion.js');
const MUTAR = require('./server/lib/catalogo-mutar.js');

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
const clonar = (o) => JSON.parse(JSON.stringify(o));

/* --------------------------------------------------------- fixture */
function equipo(clave, pg, pp, pf, pc, split) {
  return {
    clave: clave, nombre: clave,
    record: { ganados: pg, perdidos: pp, pj: pg + pp },
    totales: { propio: { PTS: pf }, rival: { PTS: pc } },
    split: split || {
      LOCAL: { ganados: pg, perdidos: 0 },
      VISITANTE: { ganados: 0, perdidos: pp },
    },
  };
}
const LISTA = [
  equipo('ATENAS A', 3, 1, 300, 280),
  equipo('PLATENSE A', 1, 3, 260, 290),
];
const idx = { lista: () => clonar(LISTA) };
const P = (o) => Object.assign({
  fecha: '2026-05-10', local: 'ATENAS A', puntosLocal: 80,
  visitante: 'PLATENSE A', puntosVisitante: 70,
}, o || {});

/* =====================================================================
   1 · LO QUE EL PARTIDO MANUAL SÍ SUMA
   ===================================================================== */
bloque('1 · Suma a la tabla');

const t0 = CLASIF.tabla(idx, {});
const base = t0.filter(r => r.clave === 'ATENAS A')[0];
igual(base.pj, 4, 'sin manuales, ATENAS tiene sus 4 partidos');
igual(base.pf, 300, 'y sus 300 puntos a favor');

const t1 = CLASIF.tabla(idx, { manuales: [P()] });
const a = t1.filter(r => r.clave === 'ATENAS A')[0];
const b = t1.filter(r => r.clave === 'PLATENSE A')[0];

igual(a.pj, 5, 'el ganador suma un partido jugado');
igual(a.pg, 4, 'y uno ganado');
igual(a.pp, 1, 'sin tocar los perdidos');
igual(a.pf, 380, 'suma sus puntos a favor');
igual(a.pc, 350, 'y los del rival en contra');
igual(a.dif, 30, 'la diferencia se RECALCULA, no se acumula');
ok(Math.abs(a.pct - 0.8) < 1e-9, 'el porcentaje también', 'pct=' + a.pct);

igual(b.pj, 5, 'el perdedor también suma partido jugado');
igual(b.pp, 4, 'y uno perdido');
igual(b.pg, 1, 'sin tocar los ganados');
igual(b.pf, 330, 'con sus puntos a favor');
igual(b.pc, 370, 'y en contra');

/* El split, que alimenta las columnas de local y visitante. */
igual(a.local.pg, 4, 'el local ganador suma a su columna de local');
igual(b.visitante.pp, 4, 'y el visitante perdedor a la suya');

/* Y al revés: gana el visitante. */
const t2 = CLASIF.tabla(idx, { manuales: [P({ puntosLocal: 60, puntosVisitante: 90 })] });
const a2 = t2.filter(r => r.clave === 'ATENAS A')[0];
const b2 = t2.filter(r => r.clave === 'PLATENSE A')[0];
igual(a2.pp, 2, 'si gana el visitante, el local suma perdido');
igual(a2.local.pp, 1, 'en su columna de local');
igual(b2.pg, 2, 'y el visitante suma ganado');
igual(b2.visitante.pg, 1, 'en su columna de visitante');

/* =====================================================================
   2 · LOS PUNTOS DE TABLA
   ===================================================================== */
bloque('2 · Puntos de tabla (+2 / +1)');

igual(CLASIF.PUNTOS_GANADO, 2, 'un ganado vale 2');
igual(CLASIF.PUNTOS_PERDIDO, 1, 'un perdido vale 1');
igual(CLASIF.puntosDeTabla(4, 1), 9, '4 ganados y 1 perdido son 9 puntos');
igual(a.puntos, 9, 'la fila trae sus puntos ya calculados');
igual(b.puntos, 6, 'y el perdedor los suyos');
igual(t0.filter(r => r.clave === 'ATENAS A')[0].puntos, 7,
      'los puntos se calculan aunque no haya ningún partido manual');

/* EL ORDEN POR DEFECTO NO CAMBIA. Meter PTS en la cascada por defecto
   reordenaría la tabla de los tres clubes sin que nadie lo pidiera. */
igual(CLASIF.ORDEN_POR_DEFECTO, ['PCT', 'DIF', 'PF'],
      'el orden por defecto sigue siendo PCT · DIF · PF');
ok(!!CLASIF.CRITERIOS.PTS, 'pero PTS existe como criterio opt-in');

/* Y ordena de verdad cuando se lo pide. */
const porPuntos = CLASIF.tabla(idx, { orden: ['PTS'] });
ok(porPuntos[0].puntos >= porPuntos[1].puntos, 'ordenar por PTS pone arriba al de más puntos');

/* =====================================================================
   3 · LO QUE **NO** TOCA · la propiedad que sostiene el diseño
   ===================================================================== */
bloque('3 · No contamina las métricas');

/* El índice no se toca: las filas que devuelve `lista()` tienen que salir
   intactas, porque las usan las otras pantallas. */
const antes = clonar(LISTA);
CLASIF.tabla(idx, { manuales: [P(), P({ fecha: '2026-06-01' })] });
igual(clonar(LISTA), antes, 'la fusión NO muta las filas del índice');

/* Ninguna métrica avanzada aparece en la fila de la tabla: si alguien
   agregara eFG% acá, un partido manual lo diluiría sin decirlo. */
const PROHIBIDAS = ['eFG%', 'PACE', 'POS', 'TS%', 'PPP', 'RTNG OFF', 'NET RTNG', 'USG%'];
PROHIBIDAS.forEach(k => ok(a[k] === undefined,
  'la fila de la tabla no lleva ' + k + ': un manual lo falsearía'));

/* Y el motor de manuales no conoce ninguna de esas claves. */
const fuente = fs.readFileSync(path.join(__dirname, 'js/sgadd-clasificacion.js'), 'utf8');
const motor = fuente.slice(fuente.indexOf('function fusionarManuales'),
                           fuente.indexOf('function recalcular'));
PROHIBIDAS.forEach(k => ok(motor.indexOf(k) === -1,
  'fusionarManuales no menciona ' + k));

/* El caso que da miedo: MUCHOS manuales no pueden mover una tasa. */
const muchos = [];
for (let i = 0; i < 20; i++) muchos.push(P({ fecha: '2026-0' + (i % 9 + 1) + '-01' }));
const tm = CLASIF.tabla(idx, { manuales: muchos });
const am = tm.filter(r => r.clave === 'ATENAS A')[0];
igual(am.pj, 24, '20 partidos manuales suman 20 al PJ de la tabla');
PROHIBIDAS.forEach(k => ok(am[k] === undefined,
  'y con 20 cargados sigue sin haber ' + k + ' en la fila'));

/* =====================================================================
   4 · UN EQUIPO QUE SOLO TIENE PARTIDOS MANUALES
   ===================================================================== */
bloque('4 · El equipo sin box score entra igual');

const t3 = CLASIF.tabla(idx, { manuales: [P({ visitante: 'UNIVERSAL' })] });
const u = t3.filter(r => r.clave === 'UNIVERSAL')[0];
ok(!!u, 'un equipo que solo aparece en manuales entra a la tabla');
if (u) {
  igual(u.pj, 1, 'con su único partido');
  igual(u.pp, 1, 'perdido');
  igual(u.pf, 70, 'y sus puntos');
  igual(u.puntos, 1, 'y su punto de tabla');
}
igual(t3.length, 3, 'la tabla crece en una fila, no más');

/* =====================================================================
   5 · EL SCOPE · categoría y TRAMO
   ===================================================================== */
bloque('5 · Un partido de la IDA no cuenta en la VUELTA');

const MAPA = {
  'IDA|REGULAR': [P()],
  'VUELTA|REGULAR': [P({ fecha: '2026-08-01' }), P({ fecha: '2026-08-08' })],
};
igual(CLASIF.manualesDelTramo(MAPA, 'IDA', 'REGULAR').length, 1, 'la IDA trae el suyo');
igual(CLASIF.manualesDelTramo(MAPA, 'VUELTA', 'REGULAR').length, 2, 'y la VUELTA los suyos');
igual(CLASIF.manualesDelTramo(MAPA, 'PLAYOFF', 'REGULAR').length, 0,
      'un tramo sin partidos no hereda los de otro');
igual(CLASIF.manualesDelTramo(MAPA, 'ida', 'regular').length, 1,
      'la clave no distingue mayúsculas');
igual(CLASIF.manualesDelTramo(null, 'IDA', 'REGULAR').length, 0, 'sin mapa, ninguno');

/* Lo que no se puede contar, se descarta antes de sumar. */
const sucio = { 'IDA|REGULAR': [
  P(), P({ puntosLocal: 70, puntosVisitante: 70 }), P({ local: '' }),
  P({ puntosLocal: 'x' }), null, 'no soy un partido',
] };
igual(CLASIF.manualesDelTramo(sucio, 'IDA', 'REGULAR').length, 1,
      'un empate, un equipo vacío y la basura se descartan');

/* =====================================================================
   6 · EL SERVIDOR · escribe un solo slot
   ===================================================================== */
bloque('6 · Persistencia y aislamiento');

const CAT = () => ({ rec: { nombre: 'R' } });

let r = MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [P()] });
igual(r.ok, true, 'se guarda un partido');
igual(r.cuantos, 1, 'y lo dice');
const guardado = r.catalogo.rec.partidosManuales.u23['IDA|REGULAR'][0];
ok(!!guardado.id, 'se le pone un id');
igual(guardado.local, 'ATENAS A', 'con el equipo local');
igual(guardado.puntosLocal, 80, 'y los puntos como número');
ok(guardado.basura === undefined, 'y no se guarda nada que no sea del modelo');

/* Un campo colado no puede llegar al catálogo, que se sirve a todos. */
r = MUTAR.aplicar(CAT(), 'partidos_manuales', {
  club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR',
  partidos: [Object.assign(P(), { basura: '<script>', otro: 1 })],
});
const limpio = r.catalogo.rec.partidosManuales.u23['IDA|REGULAR'][0];
igual(Object.keys(limpio).sort(),
      ['fase', 'fecha', 'id', 'local', 'puntosLocal', 'puntosVisitante', 'torneo', 'visitante'],
      'el registro guardado tiene solo los campos del modelo');
ok(limpio.torneo === 'IDA' && limpio.fase === 'REGULAR',
   'y torneo/fase los estampa el servidor desde la clave del tramo');

/* AISLAMIENTO, la garantía del lado del servidor. */
let cat = MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [P()] }).catalogo;
cat = MUTAR.aplicar(cat, 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'VUELTA|REGULAR', partidos: [P()] }).catalogo;
cat = MUTAR.aplicar(cat, 'partidos_manuales',
  { club: 'rec', categoria: 'primera', tramo: 'IDA|REGULAR', partidos: [P(), P()] }).catalogo;

igual(Object.keys(cat.rec.partidosManuales).sort(), ['primera', 'u23'],
      'conviven dos categorías');
igual(Object.keys(cat.rec.partidosManuales.u23).sort(), ['IDA|REGULAR', 'VUELTA|REGULAR'],
      'y dos tramos dentro de una');

/* Escribir uno no toca a los otros tres. */
const tras = MUTAR.aplicar(clonar(cat), 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [] }).catalogo;
igual(Object.keys(tras.rec.partidosManuales.u23), ['VUELTA|REGULAR'],
      'vaciar un tramo borra ese tramo');
igual(tras.rec.partidosManuales.primera['IDA|REGULAR'].length, 2,
      'y la otra categoría queda intacta');

/* Vaciar el último deja el club limpio, sin un objeto huérfano. */
let solo = MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [P()] }).catalogo;
solo = MUTAR.aplicar(solo, 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [] }).catalogo;
igual(solo.rec.partidosManuales, undefined,
      'sin partidos, la clave desaparece del club');

/* --- las validaciones, que son la garantía real --- */
const RECHAZOS = [
  ['un empate', P({ puntosLocal: 70, puntosVisitante: 70 })],
  ['sin fecha', P({ fecha: '' })],
  ['el mismo equipo de los dos lados', P({ visitante: 'atenas a' })],
  ['puntos negativos', P({ puntosLocal: -1 })],
  ['puntos con decimales', P({ puntosLocal: 70.5 })],
  ['puntos que no son número', P({ puntosLocal: 'ochenta' })],
  ['sin equipo local', P({ local: '   ' })],
];
RECHAZOS.forEach(([eti, p]) => {
  const x = MUTAR.aplicar(CAT(), 'partidos_manuales',
    { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [p] });
  ok(!x.ok, 'se rechaza ' + eti);
  ok(typeof x.motivo === 'string' && x.motivo.length > 10,
     '  con un motivo legible: ' + eti, x.motivo);
});

igual(MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'rec', categoria: '', tramo: 'IDA|REGULAR', partidos: [P()] }).ok, false,
  'sin categoría se rechaza: un partido siempre es de una planilla');
igual(MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'rec', categoria: 'u23', tramo: 'REGULAR', partidos: [P()] }).ok, false,
  'un tramo sin la barra se rechaza: la clave es TORNEO|FASE');
igual(MUTAR.aplicar(CAT(), 'partidos_manuales',
  { club: 'nadie', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [P()] }).ok, false,
  'un club que no está en el catálogo se rechaza');

/* El catálogo público tiene que llevarlos, o el cliente no puede sumarlos. */
const catalogo = fs.readFileSync(path.join(__dirname, 'server/lib/catalogo.js'), 'utf8');
ok(/partidosManuales:/.test(catalogo), 'el catálogo público expone partidosManuales');
const antesDeAdmin = catalogo.slice(0, catalogo.indexOf('}, admin ?'));
ok(antesDeAdmin.indexOf('partidosManuales') > -1,
   'y viajan para TODOS los planes, no solo para el admin');

/* =====================================================================
   7 · LA UI · badge, banner y formulario
   ===================================================================== */
bloque('7 · Lo que ve el usuario');

function pantalla() {
  const ctx = {
    console, JSON, Object, Array, Math, Number, String, Date, isFinite,
    document: { getElementById: () => null },
    SGADD: { claveEquipo: (x) => String(x || '').trim().toUpperCase() },
    SGADD_UI: {
      esc: (x) => String(x == null ? '' : x)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    },
    LOGOS: null,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-clasificacion.js'), 'utf8'), ctx);
  return ctx;
}
const P7 = pantalla();

igual(P7.clasifBadgeManual({ manuales: 0 }), '', 'sin manuales no hay badge');
const badge = P7.clasifBadgeManual(a);
ok(badge.indexOf('badge-manual') > -1, 'el badge usa su clase propia');
ok(badge.indexOf('⚠') > -1, 'lleva un símbolo además del color (punto 14)');
ok(/aria-label=/.test(badge), 'y una etiqueta para lectores de pantalla');
ok(/tabindex="0"/.test(badge), 'se puede alcanzar con el teclado, no solo con el mouse');
ok(badge.indexOf('sin registro de estad') > -1, 'dice de qué se trata');
ok(badge.indexOf('PLATENSE A') > -1, 'y el tooltip enumera el rival');
ok(/\d+-\d+/.test(badge), 'con el resultado');
ok(/Local|Visitante/.test(badge), 'y el rol');

const banner = P7.clasifBannerManual(a);
ok(banner.indexOf('aviso-manual') > -1, 'el banner de la ficha usa su clase');
ok(banner.indexOf('<details') > -1, 'y se despliega sin JavaScript');
ok(banner.indexOf('no entran a eFG%') > -1,
   'y explica que NO alimentan las métricas');
igual(P7.clasifBannerManual({ manuales: 0 }), '', 'sin manuales tampoco hay banner');

/* El nombre del rival se escapa: lo escribe un humano en un formulario. */
const conMarkup = CLASIF.tabla(idx, { manuales: [P({ visitante: '<script>x</script>' })] });
const fx = conMarkup.filter(r => r.clave === 'ATENAS A')[0];
const badgeRaro = P7.clasifBadgeManual(fx);
ok(badgeRaro.indexOf('<script>x</script>') === -1, 'el markup del rival se escapa');

/* El CSS va a mano: son nodos inyectados y el scan es estático (punto 12). */
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok(/\.badge-manual\s*\{/.test(html), 'la clase del badge está en el <style>');
ok(/\.aviso-manual\s*\{/.test(html), 'y la del banner también');
ok(/body \.badge-manual/.test(html),
   'con su regla de @media print: el aplanado del papel se la comería');

/* El formulario del Panel Master. */
const ui = fs.readFileSync(path.join(__dirname, 'js/sgadd-configui.js'), 'utf8');
const sinComentarios = ui.replace(/\/\*[\s\S]*?\*\//g, '');
['configManualesHTML', 'configManualAgregar', 'configManualQuitar',
 'configManualesPublicar', 'configTramoActual'].forEach(f =>
  ok(sinComentarios.indexOf('function ' + f) > -1, 'existe ' + f + '()'));
ok(sinComentarios.indexOf("accion: 'partidos_manuales'") > -1,
   'publicar manda la acción que el servidor entiende');
ok(/tramo: tramo/.test(sinComentarios), 'con el tramo');
ok(/categoria: CONFIGUI\.categoria/.test(sinComentarios), 'y la categoría abierta');
/* Tipear no puede repintar: le sacaría el foco al input. */
const campo = sinComentarios.slice(sinComentarios.indexOf('function configManualCampo'),
                                   sinComentarios.indexOf('function configManualError'));
ok(campo.indexOf('configPintar') === -1,
   'configManualCampo NO repinta: un repintado por tecla saca el foco');
/* Y el estado se tira al cambiar de categoría, como el resto. */
const reset = ui.slice(ui.indexOf('function resetEstadoCategoria'),
                       ui.indexOf('function configCargarBorrador'));
ok(reset.indexOf('manuales') > -1,
   'resetEstadoCategoria limpia los partidos de la categoría anterior');

/* =====================================================================
   8 · EL MODAL DE CONFIRMACIÓN · la regresión que no daba ningún síntoma

   `configManualesPublicar()` le pasaba al modal una lista de STRINGS por
   el campo `zonas`, que espera objetos `{label, zonas:[…]}`.
   `bloqueZonas()` reventaba con «cannot read length of undefined» ADENTRO
   de `abrir()`, así que el modal no se pintaba y no se mandaba nada: el
   botón «Publicar partidos» no hacía absolutamente nada, y sin dejar un
   error visible en ningún lado.

   Reproducido en el navegador antes de arreglarlo. Estos tests EJERCEN el
   modal de verdad: leer el fuente no lo habría cazado nunca, porque la
   línea se leía perfecta.
   ===================================================================== */
bloque('8 · El modal de confirmación se pinta');

function pantallaConfig() {
  const toasts = [], avisos = [];
  const SG = require('./js/sgadd-core.js');
  const PLANILLAS = [{ id: 'u23', label: 'U23', activo: true, tira: 'n' }];
  const ctx = {
    console, JSON, Object, Array, Math, Number, String, Date, isFinite, Map, Set,
    Promise, setTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    /* DOM mínimo: `SGADD_CONFIRMAR.pintar()` crea su slot y le escribe
       el HTML. Sin esto el modal no se puede ejercer, que es justamente
       lo que hay que probar. */
    document: (() => {
      const nodos = {};
      const nuevo = () => ({
        id: '', innerHTML: '', className: '', style: {},
        setAttribute() {}, removeAttribute() {}, appendChild() {},
        querySelector: () => null, querySelectorAll: () => [], focus() {},
        addEventListener() {}, contains: () => false,
      });
      return {
        getElementById: (id) => nodos[id] || null,
        createElement: () => nuevo(),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        activeElement: null,
        body: { appendChild: (n2) => { if (n2 && n2.id) nodos[n2.id] = n2; } },
        _nodos: nodos,
      };
    })(),
    SGADD: Object.assign(Object.create(SG), {
      CATALOGO: { planillas: PLANILLAS },
      planilla: (id) => PLANILLAS.filter(x => x.id === id)[0] || null,
      combinacionesTorneoFase: () => ([
        { id: 'IDA|REGULAR', torneo: 'IDA', fase: 'REGULAR', label: 'Ida - Regular' },
        { id: 'VUELTA|REGULAR', torneo: 'VUELTA', fase: 'REGULAR', label: 'Vuelta - Regular' },
      ]),
    }),
    SGADD_UI: { esc: (x) => String(x == null ? '' : x) },
    escapeHtml: (x) => String(x == null ? '' : x),
    CLUB: { cfg: { id: 'rec', nombre: 'R', planillas: PLANILLAS }, estado: { id: 'rec' } },
    SGADD_APP: {
      estado: { planillaId: 'u23', torneo: 'IDA', fase: 'REGULAR', hojas: {}, idx: null },
      reindexar() {},
    },
    SGADD_CLIENTES: { estado: { clubes: [{ slug: 'rec', partidosManuales: {} }] } },
    SGADD_BUZON: { toast: (t, tono) => toasts.push({ t, tono }) },
    SGADD_DATA: { apiConfigurada: () => true, guardarCatalogo: () => Promise.resolve({}) },
    SGADD_AUTH: { rol: () => 'ADMIN' },
    currentSection: 'configuracion',
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-config.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-confirmar.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-configui.js'), 'utf8'), ctx);
  ctx.CONFIGUI = vm.runInContext('CONFIGUI', ctx);
  ctx.SGADD_CONFIRMAR = vm.runInContext('SGADD_CONFIRMAR', ctx);
  ctx.configPintar = () => {};
  ctx.configPintarPreview = () => {};
  ctx.configAvisar = (t, ok2) => { avisos.push({ t, ok: ok2 }); };
  ctx.toasts = toasts; ctx.avisos = avisos;
  return ctx;
}

const C8 = pantallaConfig();
C8.configCargarBorrador(true);
C8.CONFIGUI.manuales = [P()];

/* LA REGRESIÓN: abrir el modal no puede lanzar. */
let lanzo8 = null;
try { C8.configManualesPublicar(); } catch (e) { lanzo8 = e.message; }
igual(lanzo8, null, 'LA REGRESIÓN: publicar no lanza al abrir el modal');

const est = C8.SGADD_CONFIRMAR.estado;
igual(est.abierto, true, 'y el modal queda abierto');
ok(est.cambios && est.cambios.length > 0, 'con un diff que enumera el cambio');
ok(!est.zonas, 'y NO usa el campo de zonas, que espera otra forma');
ok(typeof est.alConfirmar === 'function', 'con la petición esperando la confirmación');

/* El diff dice lo que se agrega y lo que se quita. */
const d1 = C8.configManualesDiff([], [P()]);
ok(d1.some(x => /Se agrega/.test(x.label)), 'el diff marca lo que se agrega');
igual(d1[0].antes, '0', 'y cuenta lo publicado hoy');
igual(d1[0].despues, '1', 'contra lo que se va a publicar');
const d2 = C8.configManualesDiff([P()], []);
ok(d2.some(x => /Se quita/.test(x.label)), 'y marca lo que se quita');
igual(C8.configManualesDiff([P()], [P()]).length, 1,
      'sin cambios, solo queda la línea del total');

(async () => {
  /* EL FEEDBACK. Al resolver la promesa avisa, y al fallar también. */
  const A = pantallaConfig();
  A.configCargarBorrador(true);
  A.CONFIGUI.manuales = [P()];
  A.SGADD_DATA.guardarCatalogo = () => Promise.resolve({ clubes: [] });
  A.configManualesPublicar();
  A.SGADD_CONFIRMAR.confirmar();
  await new Promise(r => setTimeout(r, 30));
  ok(A.toasts.some(x => x.tono === 'ok'), 'publicar OK dispara un toast de éxito',
     JSON.stringify(A.toasts));
  ok(A.toasts.some(x => /guardado y publicado con éxito/i.test(x.t)),
     'con el mensaje que pidió el pedido', JSON.stringify(A.toasts));
  ok(A.avisos.some(x => x.ok === true), 'y el aviso inline también');

  const B = pantallaConfig();
  B.configCargarBorrador(true);
  B.CONFIGUI.manuales = [P()];
  B.SGADD_DATA.guardarCatalogo = () => Promise.reject(new Error('KV no responde'));
  B.configManualesPublicar();
  B.SGADD_CONFIRMAR.confirmar();
  await new Promise(r => setTimeout(r, 30));
  ok(B.toasts.some(x => x.tono === 'error'), 'y un fallo dispara un toast de error');
  ok(B.toasts.some(x => /KV no responde/.test(x.t)), 'con el motivo del servidor');

  /* Un campo obligatorio que falta se avisa ANTES de salir a la red. */
  const C = pantallaConfig();
  C.configCargarBorrador(true);
  let salio = false;
  C.SGADD_DATA.guardarCatalogo = () => { salio = true; return Promise.resolve({}); };
  C.CONFIGUI.manuales = [P({ fecha: '' })];
  C.configManualesPublicar();
  await new Promise(r => setTimeout(r, 20));
  igual(salio, false, 'con un campo faltante NO se manda nada al servidor');
  ok(C.toasts.some(x => x.tono === 'error' && /fecha/i.test(x.t)),
     'y se dice qué falta', JSON.stringify(C.toasts));
  ok(C.toasts.some(x => /Partido 1/.test(x.t)), 'y en cuál de los partidos');

  /* ==================================================================
     9 · EL SELECTOR DE FASE
     ================================================================== */
  bloque('9 · El selector de fase del formulario');

  const D = pantallaConfig();
  D.configCargarBorrador(true);
  igual(D.configManualTramoDestino(), 'IDA|REGULAR',
        'por defecto va al tramo abierto en la barra');
  D.configManualElegirTramo('VUELTA|REGULAR');
  igual(D.configManualTramoDestino(), 'VUELTA|REGULAR',
        'se puede cambiar sin tocar el selector principal');
  igual(D.SGADD_APP.estado.torneo, 'IDA',
        'y elegir otra fase NO mueve el tramo de la barra');
  igual(D.configTramosDisponibles().map(t => t.id), ['IDA|REGULAR', 'VUELTA|REGULAR'],
        'el desplegable ofrece los tramos del libro');

  /* Las opciones salen del LIBRO, no de una lista fija. */
  const fuenteUi = fs.readFileSync(path.join(__dirname, 'js/sgadd-configui.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok(fuenteUi.indexOf('combinacionesTorneoFase') > -1,
     'los tramos del desplegable salen del libro');
  ['IDA', 'VUELTA', 'PLAYOFF'].forEach(f =>
    ok(fuenteUi.indexOf("['" + f) === -1,
       'ninguna fase arranca una lista hardcodeada: ' + f));

  /* El sintético *TOTAL* no es un tramo donde se juegue: un partido ahí se
     contaría dos veces o ninguna. */
  const E2 = pantallaConfig();
  E2.SGADD.combinacionesTorneoFase = () => ([
    { id: 'IDA|REGULAR', torneo: 'IDA', fase: 'REGULAR', label: 'Ida' },
    { id: '*TOTAL*|REGULAR', torneo: '*TOTAL*', fase: 'REGULAR', label: 'Total' },
  ]);
  igual(E2.configTramosDisponibles().map(t => t.id), ['IDA|REGULAR'],
        'el *TOTAL* no se ofrece como destino');

  /* Cambiar de fase relee la lista: si no, se publicaría la del tramo
     anterior sobre el nuevo. */
  const elegir = fuenteUi.slice(fuenteUi.indexOf('function configManualElegirTramo'),
                                fuenteUi.indexOf('function configManualesCargar'));
  ok(elegir.indexOf('configManualesCargar(true)') > -1,
     'cambiar de fase fuerza releer los partidos de esa fase');

  /* Y publicar usa el tramo ELEGIDO, no el de la barra. */
  const F = pantallaConfig();
  F.configCargarBorrador(true);
  F.CONFIGUI.manuales = [P()];
  F.configManualElegirTramo('VUELTA|REGULAR');
  let mandado = null;
  F.SGADD_DATA.guardarCatalogo = (d) => { mandado = d; return Promise.resolve({}); };
  F.configManualesPublicar();
  F.SGADD_CONFIRMAR.confirmar();
  await new Promise(r => setTimeout(r, 30));
  igual(mandado && mandado.tramo, 'VUELTA|REGULAR',
        'se publica sobre la fase elegida en el formulario');

  /* ==================================================================
     10 · EL SERVIDOR ESTAMPA torneo Y fase DESDE LA CLAVE
     ================================================================== */
  bloque('10 · torneo y fase se derivan, no se copian del pedido');

  const mentiroso = Object.assign(P(), { fase: 'VUELTA', torneo: 'INVENTADO' });
  const rr = MUTAR.aplicar({ rec: { nombre: 'R' } }, 'partidos_manuales',
    { club: 'rec', categoria: 'u23', tramo: 'IDA|REGULAR', partidos: [mentiroso] });
  const gg = rr.catalogo.rec.partidosManuales.u23['IDA|REGULAR'][0];
  igual(gg.torneo, 'IDA', 'el torneo sale de la clave, no del pedido');
  igual(gg.fase, 'REGULAR', 'y la fase también');
  ok(gg.fase !== 'VUELTA',
     'LA PROPIEDAD: un cliente no puede guardar una fase que contradiga su tramo');
  igual(Object.keys(gg).sort(),
        ['fase', 'fecha', 'id', 'local', 'puntosLocal', 'puntosVisitante', 'torneo', 'visitante'],
        'y quedan registrados junto a la fecha y el resultado');

  /* Y la tabla sigue filtrando por el TRAMO abierto, no por ese campo. */
  const MEZCLA = {
    'IDA|REGULAR': [Object.assign(P(), { torneo: 'IDA', fase: 'REGULAR' })],
    'VUELTA|REGULAR': [Object.assign(P({ fecha: '2026-08-01' }), { torneo: 'VUELTA', fase: 'REGULAR' })],
  };
  igual(CLASIF.manualesDelTramo(MEZCLA, 'IDA', 'REGULAR').length, 1,
        'fusionarManuales toma solo los del tramo abierto');
  igual(CLASIF.manualesDelTramo(MEZCLA, 'IDA', 'REGULAR')[0].fecha, '2026-05-10',
        'y son los correctos');
  const soloIda = CLASIF.tabla(idx, { manuales: CLASIF.manualesDelTramo(MEZCLA, 'IDA', 'REGULAR') });
  igual(soloIda.filter(r => r.clave === 'ATENAS A')[0].manuales, 1,
        'la tabla de la IDA cuenta uno solo, no los dos');

  /* ===================================================================
     EL TOTAL ES LA SUMA DE SUS TORNEOS, NO UNA LLAVE MAS

     Reportado desde produccion: un partido cargado en la IDA sumaba en
     la tabla TOTAL y NO en la vista de IDA. Medido contra el KV, la
     causa eran dos defectos encadenados y opuestos:

       1. el formulario lo archivaba bajo `*TOTAL*|REGULAR`, porque el
          destino por defecto era el tramo ABIERTO en la barra y el
          panel abre justamente en TOTAL (punto 3 ter) — un desplegable
          que ofrecia solo IDA y VUELTA, escribiendo en una llave que el
          propio desplegable se negaba a ofrecer;
       2. y aun archivandolo bien, `manualesDelTramo` buscaba por llave
          EXACTA, asi que un partido de la IDA quedaba invisible en la
          vista que el panel abre por defecto.
     =================================================================== */
  bloque('11 · El TOTAL suma los torneos reales');

  const MAPA_T = {
    'IDA|REGULAR': [P({ id: 'a' })],
    'VUELTA|REGULAR': [P({ id: 'b', local: 'PLATENSE A', puntosLocal: 80,
                          visitante: 'ATENAS A', puntosVisitante: 70 })],
    'IDA|PLAYOFF': [P({ id: 'c', puntosLocal: 90, puntosVisitante: 88 })],
  };
  const idsT = (l) => l.map(x => x.id).sort().join(',');

  igual(idsT(CLASIF.manualesDelTramo(MAPA_T, 'IDA', 'REGULAR')), 'a',
        'un tramo real sigue viendo SOLO lo suyo');
  igual(idsT(CLASIF.manualesDelTramo(MAPA_T, 'VUELTA', 'REGULAR')), 'b',
        'y el otro tambien');
  igual(idsT(CLASIF.manualesDelTramo(MAPA_T, '*TOTAL*', 'REGULAR')), 'a,b',
        'el TOTAL suma los dos torneos de esa fase');

  /* NUNCA se mezclan fases, por el mismo motivo que el TOTAL derivado
     del nucleo no las mezcla: juntar una regular con unos playoffs no
     significa nada. */
  igual(idsT(CLASIF.manualesDelTramo(MAPA_T, '*TOTAL*', 'PLAYOFF')), 'c',
        'y no mezcla fases: el playoff queda aparte');

  /* RETROCOMPATIBILIDAD. Hubo una ventana en la que el formulario dejaba
     caer partidos en la llave sintetica. Descartarla ahora los borraria
     de la tabla del club. */
  const MAPA_V = { '*TOTAL*|REGULAR': [P({ id: 'viejo' })] };
  igual(idsT(CLASIF.manualesDelTramo(MAPA_V, '*TOTAL*', 'REGULAR')), 'viejo',
        'lo ya archivado bajo la llave sintetica se sigue contando');

  /* Y no se cuenta dos veces: si un mismo partido quedara en dos llaves
     de la misma fase, PJ dejaria de cuadrar contra PG+PP. */
  const MAPA_D = {
    'IDA|REGULAR': [P({ id: 'x' })],
    '*TOTAL*|REGULAR': [P({ id: 'x' })],
  };
  igual(CLASIF.manualesDelTramo(MAPA_D, '*TOTAL*', 'REGULAR').length, 1,
        'un mismo id no se cuenta dos veces en el TOTAL');

  /* Y la tabla del TOTAL tiene que reflejarlo de punta a punta, no solo
     el filtro: es lo que el club mira. */
  const FILAS_T = CLASIF.tabla(idx,
    { manuales: CLASIF.manualesDelTramo(MAPA_T, '*TOTAL*', 'REGULAR') });
  const filaT = FILAS_T.filter(f => f.clave === 'ATENAS A')[0];
  igual(filaT && filaT.manuales, 2,
        'la tabla del TOTAL cuenta los dos partidos');
  igual(filaT && filaT.pj, 6, '  sobre los 4 que ya tenia');

  /* EL SERVIDOR NO ACEPTA EL SINTETICO. La garantia no puede depender de
     la pantalla: aunque una version vieja del panel siga mandando
     `*TOTAL*`, no puede archivar ahi (mismo criterio que el punto 32). */
  const catBase = { deportivo: { nombre: 'D', categorias: {} } };
  const pedidoT = (t) => MUTAR.partidosManuales(catBase, {
    club: 'deportivo', categoria: 'cat-1', tramo: t, partidos: [P()],
  });
  ok(pedidoT('IDA|REGULAR').ok, 'el servidor acepta un tramo real');
  ok(!pedidoT('*TOTAL*|REGULAR').ok, 'y RECHAZA el sintetico');
  ok(/TOTAL/.test(pedidoT('*TOTAL*|REGULAR').motivo || ''),
     '  diciendo por que, no con un error generico',
     pedidoT('*TOTAL*|REGULAR').motivo);

  /* Y la pantalla tampoco puede elegirlo por defecto, que es de donde
     salio el partido mal archivado. */
  const FUI = fs.readFileSync(path.join(__dirname, 'js/sgadd-configui.js'), 'utf8');
  const DEST = FUI.slice(FUI.indexOf('function configManualTramoDestino'),
                         FUI.indexOf('function configManualElegirTramo'));
  ok(/indexOf\('\*'\) === -1/.test(DEST),
     'el destino por defecto descarta el tramo sintetico');
  ok(/configTramosDisponibles\(\)/.test(DEST),
     '  y cae a la misma lista que muestra el desplegable');

  console.log('\n' + '─'.repeat(60));
  if (fallados === 0) console.log('✓ TODO OK · ' + pasados + ' tests');
  else { console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados)); process.exitCode = 1; }
})();
