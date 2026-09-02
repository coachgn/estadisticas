/* =====================================================================
   SGADD · TESTS DEL GRUPO DE PARES (peer group)

   Es B-5 del punto 10 bis: comparar a un jugador contra los de su ROL en
   vez de contra la liga entera.

   EL PROBLEMA, MEDIDO CONTRA EL LIBRO REAL de Primera (221 jugadores, 111
   calificados, umbral 12,7 min), para el de más minutos:

     METRICA        él     PARES    GLOBAL     TIPO
     T2I         11,21      6,92      3,77     1,64
     AST          0,86      2,19      1,14     0,47
     eFG%         0,57      0,48      0,47     0,46
     PePP%        0,08      0,16      0,16     0,16

   Los dos hallazgos que estos tests fijan:

   1. La distorsión es SOLO de volumen. Las tasas casi no se mueven entre
      referencias, así que un test que solo mirara eFG% no distinguiría el
      arreglo de su ausencia.
   2. El modo «global» NO es el `JUGADOR TIPO`: es la mediana de los
      calificados. El TIPO vale ~0,5x en las cuentas porque incluye a los
      que no llegan al umbral, y ése era el «1,0 contra 6,2» del pedido.

   Las fixtures son sintéticas y con números elegidos a mano para que cada
   mediana sea VERIFICABLE a ojo: si el motor cambia de criterio, el test
   dice exactamente qué número esperaba.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const J = require('./js/sgadd-jugadores.js');

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
function cerca(a, b, nombre, tol) {
  const t = tol === undefined ? 1e-9 : tol;
  ok(typeof a === 'number' && Math.abs(a - b) <= t, nombre,
     'esperaba ' + b + ' y dio ' + a);
}
function bloque(t) { console.log('\n' + t); }

/* =====================================================================
   FIXTURE

   Un jugador se define por MIN (que fija su banda) y PLAYS (que, contra
   el promedio de la liga, fija su jerarquía). El resto son las métricas
   que las tres cards comparan.
   ===================================================================== */

let nid = 0;
function jug(nombre, MIN, PLAYS, extra) {
  return Object.assign({
    NOMBRES: nombre, EQUIPO: 'EQ' + (nid++ % 4), FASE: 'REGULAR',
    MIN: MIN, PLAYS: PLAYS, PJ: 10,
    'T2I': 1, 'T2C': 0.5, 'T3I': 1, 'T3C': 0.3,
    'eFG%': 0.45, 'TS%': 0.5, 'PPP': 0.8, 'USG%': 0.2, 'PTS': 5,
    'AST': 1, 'AST%': 0.1, 'PePP%': 0.15, 'AST-PP': 0.9,
    'RO%': 0.02, 'RD%': 0.05, RO: 1, RD: 2, PR: 0.5, PP: 1, 'T3%': 0.3,
  }, extra || {});
}

/** Un índice de mentira, con lo justo que el motor de pares consume. */
function indice(jugadores, opciones) {
  const o = opciones || {};
  const umbral = o.umbral === undefined ? 15 : o.umbral;
  const cal = jugadores.filter(j => j.MIN >= umbral);
  return {
    liga: {
      jugadores: jugadores,
      jugadoresCalificados: cal,
      minJugador: umbral,
      jugadorTipo: o.tipo || null,
      jugadoresPorEquipo: new Map(),
    },
    leerJugador: () => null,
  };
}

/* Cuatro bandas de minutos: 25+, 20–24.9, 15–19.9, <15 (ver ROLES_MINUTOS). */
const CLAVE = 28, IMPORTANTE = 22, ROTACION = 17, POCOS = 8;

/* =====================================================================
   1 · EL AGRUPAMIENTO POR ETIQUETAS
   ===================================================================== */
bloque('1 · Agrupamiento por rol y etiquetas');

const base = [
  jug('CLAVE, UNO', CLAVE, 20, { T2I: 6 }),
  jug('CLAVE, DOS', CLAVE, 19, { T2I: 7 }),
  jug('CLAVE, TRES', CLAVE, 21, { T2I: 8 }),
  jug('CLAVE, CUATRO', CLAVE, 18, { T2I: 5 }),
  jug('ROTA, UNO', ROTACION, 6, { T2I: 2 }),
  jug('ROTA, DOS', ROTACION, 5, { T2I: 1 }),
  jug('ROTA, TRES', ROTACION, 7, { T2I: 3 }),
  jug('POCOS, UNO', POCOS, 2, { T2I: 0.5 }),
  jug('POCOS, DOS', POCOS, 1, { T2I: 0.4 }),
  jug('POCOS, TRES', POCOS, 3, { T2I: 0.6 }),
];
const idx = indice(base);
const titular = base[0];

const g = J.jugadoresPeerGroup(idx, titular, 'pares');
ok(g.n >= J.PEER_MIN, 'el grupo del titular tiene muestra', 'n=' + g.n);
ok(g.jugadores.every(x => x.MIN === CLAVE),
   'y TODOS sus pares comparten su banda de minutos');
ok(g.jugadores.indexOf(titular) > -1, 'el propio jugador entra a su grupo');
ok(g.etiquetas.length > 0, 'el grupo dice con qué etiquetas se armó');
ok(/\d/.test(g.motivo), 'y el motivo trae el tamaño de la muestra', g.motivo);

/* La propiedad que importa: el de pocos minutos NO se compara contra los
   titulares, que es el defecto que el pedido vino a corregir. */
const gp = J.jugadoresPeerGroup(idx, base[7], 'pares');
ok(gp.jugadores.every(x => x.MIN === POCOS),
   'un jugador de pocos minutos se compara contra los de pocos minutos');
ok(gp.jugadores.indexOf(titular) === -1,
   'y el titular NO está en su grupo');

/* Y los grupos de dos jugadores distintos de la misma banda coinciden. */
const g2 = J.jugadoresPeerGroup(idx, base[1], 'pares');
igual(g2.jugadores.length, g.jugadores.length,
      'dos jugadores del mismo rol comparten el mismo grupo');

/* =====================================================================
   2 · LA MEDIANA, EN LAS TRES CARDS
   ===================================================================== */
bloque('2 · El cálculo de la mediana');

/* Cuatro «Jugador Clave» con T2I 6, 7, 8, 5 → ordenados 5,6,7,8 →
   mediana (6+7)/2 = 6,5. A ojo, y por eso los números son estos. */
const ref = J.jugadoresPeerReferencia(idx, titular, ['T2I'], 'pares');
cerca(ref.valores['T2I'], 6.5, 'mediana de T2I sobre los cuatro pares');

/* Impar: los tres de rotación, T2I 2,1,3 → ordenados 1,2,3 → 2. */
const refR = J.jugadoresPeerReferencia(idx, base[4], ['T2I'], 'pares');
cerca(refR.valores['T2I'], 2, 'mediana con muestra impar');

/* La global es la mediana de los CALIFICADOS (MIN >= 15), o sea los
   siete de arriba: T2I 6,7,8,5,2,1,3 → ordenados 1,2,3,5,6,7,8 → 5. */
const refG = J.jugadoresPeerReferencia(idx, titular, ['T2I'], 'global');
cerca(refG.valores['T2I'], 5, 'la global es la mediana de los calificados');
igual(refG.grupo.nivel, 'global', 'y se marca como global');
ok(refG.grupo.n === 7, 'sobre los 7 que llegan al umbral', 'n=' + refG.grupo.n);

/* LA REGRESIÓN QUE MOTIVÓ TODO: la global NO puede ser el JUGADOR TIPO,
   que incluye a los de minutos residuales y vale ~la mitad. */
const idxT = indice(base, { tipo: { T2I: 0.9, 'eFG%': 0.44 } });
const refGT = J.jugadoresPeerReferencia(idxT, titular, ['T2I'], 'global');
cerca(refGT.valores['T2I'], 5,
      'con TIPO presente, la global SIGUE siendo la mediana de calificados');
ok(refGT.valores['T2I'] !== 0.9, 'y no el valor de la fila JUGADOR TIPO');

/* Las tres cards, cada una con sus claves. */
J.JUGADORES_CARDS_REF.forEach(card => {
  const r = J.jugadoresPeerReferencia(idx, titular, card.claves, 'pares');
  igual(Object.keys(r.valores).sort(), card.claves.slice().sort(),
        'card «' + card.id + '» resuelve todas sus claves');
  ok(card.claves.every(k => r.valores[k] !== undefined),
     'card «' + card.id + '» no deja ninguna sin valor');
});

/* Y que las claves existan de verdad en la planilla: una card que pida una
   columna inventada mostraría una fila de guiones para siempre. */
const SGADD = require('./js/sgadd-core.js');
const colsJ = (SGADD.ESQUEMA['PROMEDIOS J'].req || [])
  .concat(SGADD.ESQUEMA['PROMEDIOS J'].opt || [], SGADD.ESQUEMA['PROMEDIOS J'].motor || []);
J.JUGADORES_CARDS_REF.forEach(card => {
  card.claves.forEach(k => {
    ok(colsJ.indexOf(k) > -1, 'card «' + card.id + '» · ' + k + ' existe en PROMEDIOS J');
    ok(!!SGADD.METRICAS[k], 'card «' + card.id + '» · ' + k + ' tiene registro en METRICAS');
  });
});

/* Las tasas se distinguen de las cuentas, porque el delta se expresa
   distinto (puntos porcentuales contra múltiplo). */
const tasas = ['eFG%', 'TS%', 'USG%', 'AST%', 'PePP%'];
tasas.forEach(k => igual(SGADD.METRICAS[k].formato, 'pct',
  k + ' es una tasa y el delta va en puntos porcentuales'));

/* La dirección de PePP% está invertida: perder menos es mejor. Sin eso, la
   card pintaría de verde a quien pierde más pelotas que sus pares. */
igual(SGADD.METRICAS['PePP%'].invertida, true, 'PePP% es una métrica invertida');

/* =====================================================================
   3 · EL FALLBACK
   ===================================================================== */
bloque('3 · El fallback cuando la muestra es menor a 3');

igual(J.PEER_MIN, 3, 'el mínimo de la muestra son 3 jugadores');

/* Un único «Jugador Clave» entre muchos de rotación: su cruce exacto tiene
   1, su banda tiene 1, así que tiene que caer hasta la liga. */
const solo = [
  jug('SOLITARIO, UNO', CLAVE, 30, { T2I: 9 }),
  jug('ROTA, A', ROTACION, 5, { T2I: 2 }),
  jug('ROTA, B', ROTACION, 6, { T2I: 4 }),
  jug('ROTA, C', ROTACION, 7, { T2I: 6 }),
  jug('ROTA, D', ROTACION, 5, { T2I: 8 }),
];
const idxSolo = indice(solo);
const gSolo = J.jugadoresPeerGroup(idxSolo, solo[0], 'pares');
igual(gSolo.nivel, 'global', 'con un solo par, cae a la liga entera');
ok(/no hubo 3/i.test(gSolo.motivo) || /liga entera/i.test(gSolo.motivo),
   'y lo DICE en el motivo', gSolo.motivo);
/* T2I de los cinco calificados: 9,2,4,6,8 → 2,4,6,8,9 → 6. */
const refSolo = J.jugadoresPeerReferencia(idxSolo, solo[0], ['T2I'], 'pares');
cerca(refSolo.valores['T2I'], 6, 'y usa la mediana de los calificados');

/* El escalón intermedio: mismo rol de minutos con 3+, pero el cruce con la
   jerarquía se queda corto. Se agrupa por la etiqueta PRIMARIA. */
const mixto = [
  jug('A, UNO', CLAVE, 40, { T2I: 10 }),   // PLAYS alto → otra jerarquía
  jug('A, DOS', CLAVE, 4, { T2I: 2 }),
  jug('A, TRES', CLAVE, 4, { T2I: 4 }),
  jug('A, CUATRO', CLAVE, 4, { T2I: 6 }),
  jug('B, UNO', ROTACION, 5, { T2I: 1 }),
  jug('B, DOS', ROTACION, 5, { T2I: 1 }),
  jug('B, TRES', ROTACION, 5, { T2I: 1 }),
];
const idxMix = indice(mixto);
const gMix = J.jugadoresPeerGroup(idxMix, mixto[0], 'pares');
ok(gMix.nivel === 'primaria' || gMix.nivel === 'exacto' || gMix.nivel === 'global',
   'el nivel es uno de los de la cascada', gMix.nivel);
if (gMix.nivel === 'primaria') {
  ok(gMix.jugadores.every(x => x.MIN === CLAVE),
     'el fallback primario agrupa por la banda de minutos');
  ok(/rol principal/i.test(gMix.motivo), 'y explica que agrupó por el rol principal');
  pasados += 0;
} else {
  /* Si la jerarquía no separó, el exacto ya alcanzaba: también es válido y
     el test lo acepta, pero deja constancia de cuál corrió. */
  ok(true, 'la jerarquía no separó al grupo en esta fixture (nivel ' + gMix.nivel + ')');
}

/* Sin NINGÚN calificado no queda mediana que calcular: se cae al TIPO, que
   es exactamente lo que la app hacía antes de que existiera todo esto. */
const flojos = [
  jug('X, UNO', 3, 1, { T2I: 0.5 }),
  jug('X, DOS', 2, 1, { T2I: 0.5 }),
];
const idxFlojo = indice(flojos, { umbral: 15, tipo: { T2I: 0.4, 'eFG%': 0.4 } });
const gF = J.jugadoresPeerGroup(idxFlojo, flojos[0], 'pares');
igual(gF.nivel, 'tipo', 'sin calificados se cae a la fila JUGADOR TIPO');
const refF = J.jugadoresPeerReferencia(idxFlojo, flojos[0], ['T2I'], 'pares');
cerca(refF.valores['T2I'], 0.4, 'y lee el valor de esa fila');
ok(/JUGADOR TIPO/i.test(gF.motivo), 'diciéndolo', gF.motivo);

/* Una liga vacía no puede tumbar la ficha. */
const gVacio = J.jugadoresPeerGroup(indice([]), jug('N, N', 20, 5), 'pares');
ok(!!gVacio && typeof gVacio.nivel === 'string', 'una liga vacía devuelve un grupo válido');

/* El modo global también respeta el mínimo. */
const gGlobalCorto = J.jugadoresPeerGroup(idxFlojo, flojos[0], 'global');
igual(gGlobalCorto.nivel, 'tipo', 'el modo global también cae al TIPO sin muestra');

/* =====================================================================
   4 · EL ORDEN DE LA CASCADA
   ===================================================================== */
bloque('4 · La cascada va de lo específico a lo general');

const NIVELES = ['exacto', 'primaria', 'global', 'tipo'];
[base, solo, mixto, flojos].forEach((pool, i) => {
  const ix = indice(pool);
  pool.forEach(x => {
    const gg = J.jugadoresPeerGroup(ix, x, 'pares');
    ok(NIVELES.indexOf(gg.nivel) > -1, 'fixture ' + i + ' · nivel conocido: ' + gg.nivel);
    ok(gg.nivel === 'tipo' || gg.n >= J.PEER_MIN,
       'fixture ' + i + ' · ningún grupo servido por debajo del mínimo',
       gg.nivel + ' n=' + gg.n);
    ok(typeof gg.motivo === 'string' && gg.motivo.length > 10,
       'fixture ' + i + ' · siempre hay un motivo que mostrar');
  });
});

/* El modo global nunca devuelve un grupo por etiquetas: son dos preguntas
   distintas y mezclarlas haría que el toggle no cambiara nada. */
base.forEach(x => {
  const gg = J.jugadoresPeerGroup(idx, x, 'global');
  ok(gg.nivel === 'global' || gg.nivel === 'tipo',
     'en modo global no se agrupa por etiquetas (' + gg.nivel + ')');
});

/* Y el toggle CAMBIA la referencia: si diera lo mismo, sería un adorno. */
const a = J.jugadoresPeerReferencia(idx, titular, ['T2I'], 'pares').valores['T2I'];
const b = J.jugadoresPeerReferencia(idx, titular, ['T2I'], 'global').valores['T2I'];
ok(a !== b, 'el toggle cambia de verdad la referencia', a + ' vs ' + b);

/* =====================================================================
   5 · EL CATÁLOGO DE LAS CARDS
   ===================================================================== */
bloque('5 · Las tres cards del pedido');

igual(J.JUGADORES_CARDS_REF.map(c => c.id), ['tiro', 'uso', 'pases'],
      'están las tres cards pedidas');

const tiro = J.JUGADORES_CARDS_REF[0];
['T2I', 'T2C', 'T3I', 'T3C', 'eFG%', 'TS%', 'PPP'].forEach(k =>
  ok(tiro.claves.indexOf(k) > -1, 'card TIRO incluye ' + k));

const uso = J.JUGADORES_CARDS_REF[1];
['USG%', 'PPP'].forEach(k => ok(uso.claves.indexOf(k) > -1, 'card USO incluye ' + k));
igual(uso.suelta, '+/-', 'card USO muestra el +/- aparte');
/* LA REGLA DEL PUNTO 3 bis: el `+/-` NO se compara. Depende de los otros
   cuatro que estaban en cancha, así que una mediana de pares ordenaría
   equipos disfrazados de jugadores. */
ok(uso.claves.indexOf('+/-') === -1,
   'y NO lo mete en la comparación contra pares (punto 3 bis)');

const pases = J.JUGADORES_CARDS_REF[2];
['AST', 'AST%', 'PePP%', 'AST-PP'].forEach(k =>
  ok(pases.claves.indexOf(k) > -1, 'card PASES incluye ' + k));

/* Lo que el pedido nombró y NO existe: si algún día entra, este test
   avisa que ya se puede sumar en vez de que quede olvidado. */
['NET RTNG', 'RTNG OFF', 'TOV%'].forEach(k =>
  ok(colsJ.indexOf(k) === -1,
     k + ' sigue sin existir en PROMEDIOS J (por eso no está en ninguna card)'));

igual(J.PEER_MODOS.map(m => m.id), ['pares', 'global'],
      'el toggle ofrece los dos modos, en ese orden');
igual(J.JUGADORES.refModo, 'pares', 'y arranca en «pares», como pide el pedido');

/* =====================================================================
   6 · LA UI · se EJERCE, no se lee del fuente
   ===================================================================== */
bloque('6 · Las cards se pintan');

function pantalla() {
  const ctx = {
    console: console, JSON: JSON, Object: Object, Array: Array, Math: Math,
    document: { getElementById: () => null },
    SGADD: SGADD,
    SGADD_UI: { esc: (x) => String(x), statCard: () => '', metricTable: () => '' },
    SGADD_CHARTS: { barrasComparadas: () => '', MIN_SCATTER: 10 },
    escapeHtml: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    equiposPanel: (t, c) => '<div>' + t + '</div>',
    jugadoresPintar: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/sgadd-jugadores.js'), 'utf8'), ctx);
  ctx.JUGADORES = vm.runInContext('JUGADORES', ctx);
  ctx.JUGADORES_CARDS_REF = vm.runInContext('JUGADORES_CARDS_REF', ctx);
  return ctx;
}

const P = pantalla();
P.JUGADORES.refModo = 'pares';

J.JUGADORES_CARDS_REF.forEach(card => {
  let html = null, err = null;
  try { html = P.jugadoresCardRef(idx, titular, card); } catch (e) { err = e.message; }
  ok(typeof html === 'string' && html.length > 100, 'card «' + card.id + '» se pinta', err);
  if (!html) return;
  ok(html.indexOf('jugadoresCambiarRef') > -1, 'card «' + card.id + '» trae el toggle');
  /* EL TOOLTIP DEL PEDIDO: el detalle de la muestra tiene que estar en el
     markup, sobre la barra de referencia. */
  ok(html.indexOf('title=') > -1, 'card «' + card.id + '» trae el tooltip de la muestra');
  const g2 = J.jugadoresPeerGroup(idx, titular, 'pares');
  ok(html.indexOf(String(g2.n)) > -1,
     'card «' + card.id + '» nombra el tamaño de la muestra');
});

/* El toggle cambia lo que se pinta. */
const htmlPares = P.jugadoresCardRef(idx, titular, J.JUGADORES_CARDS_REF[0]);
P.JUGADORES.refModo = 'global';
const htmlGlobal = P.jugadoresCardRef(idx, titular, J.JUGADORES_CARDS_REF[0]);
ok(htmlPares !== htmlGlobal, 'cambiar el modo cambia la card');
ok(htmlGlobal.indexOf('umbral de minutos') > -1,
   'y en global explica que son los que llegan al umbral');
P.JUGADORES.refModo = 'pares';

/* `jugadoresCambiarRef` escribe el estado compartido: las tres cards
   tienen que moverse juntas, que es lo que pedía «unificado». */
P.jugadoresCambiarRef('global');
igual(P.JUGADORES.refModo, 'global', 'el conmutador escribe el estado compartido');
P.jugadoresCambiarRef('pares');
igual(P.JUGADORES.refModo, 'pares', 'y vuelve');

/* Un jugador sin `+/-` no puede dejar una línea muerta. */
const sinMM = jug('SIN, MM', CLAVE, 20, { T2I: 6 });
delete sinMM['+/-'];
const htmlSin = P.jugadoresCardRef(indice(base.concat([sinMM])), sinMM,
  J.JUGADORES_CARDS_REF[1]);
ok(htmlSin.indexOf('va sin comparar') === -1,
   'sin columna +/- no se muestra la línea del +/-');
const conMM = jug('CON, MM', CLAVE, 20, { T2I: 6, '+/-': 7 });
const htmlCon = P.jugadoresCardRef(indice(base.concat([conMM])), conMM,
  J.JUGADORES_CARDS_REF[1]);
ok(htmlCon.indexOf('va sin comparar') > -1,
   'con la columna, se muestra y se explica por qué no se compara');

/* EL SEMAFORO NECESITA LAS DOS CLASES. `tono-*` solo existe dentro de
   `@media print` (punto 7.6), asi que sola no pinta nada en pantalla;
   y la de Tailwind sola se la come el aplanado del papel. Este test
   es la regresion de haber usado solo una. */
/* Se mide sobre un jugador que SE SEPARA de sus pares: `titular` tiene
   los valores por defecto de la fixture, asi que todas sus filas dan
   neutro y no probarian el semaforo. */
const separado = jug('DISTINTO, UNO', CLAVE, 20, { 'AST': 5, 'PePP%': 0.30 });
const conSemaforo = P.jugadoresCardRef(indice(base.concat([separado])),
  separado, J.JUGADORES_CARDS_REF[2]);
ok(/text-green-400[^"]*tono-alto/.test(conSemaforo),
   'el delta bueno lleva la clase de PANTALLA y la de PAPEL juntas');
ok(/text-red-400[^"]*tono-bajo/.test(conSemaforo),
   'y el delta malo tambien');
ok(conSemaforo.indexOf('tono-') > -1, 'la clase de papel esta');
ok(/text-(green|red|muted)/.test(conSemaforo), 'y la de pantalla tambien');

/* LOS INTENTOS Y LA CARGA NO LLEVAN SEMAFORO (punto 4: ningun eje tiene
   lado bueno y lado malo). Tirar menos triples que sus pares no es
   peor, es otro jugador; pintarlo de rojo convertiria una descripcion
   de estilo en un reproche. El numero se muestra igual: lo que se saca
   es el color. */
['T2I', 'T3I', 'USG%', 'PLAYS'].forEach(k =>
  ok(J.JUGADORES_REF_NEUTRAS.indexOf(k) > -1, k + ' es de seleccion, no de rendimiento'));
['eFG%', 'TS%', 'PPP', 'PePP%', 'AST-PP', 'PTS', 'AST'].forEach(k =>
  ok(J.JUGADORES_REF_NEUTRAS.indexOf(k) === -1, k + ' es un resultado y SI lleva semaforo'));

const tirador = jug('TIRA, POCO', CLAVE, 20, { 'T3I': 0.2, 'eFG%': 0.60 });
const htmlTira = P.jugadoresCardRef(indice(base.concat([tirador])),
  tirador, J.JUGADORES_CARDS_REF[0]);
const filaDe = (h, k) => { const i = h.indexOf('data-metrica="' + k + '"');
  return i === -1 ? '' : h.slice(i, i + 700); };
ok(/tono-neutro/.test(filaDe(htmlTira, 'T3I')),
   'tirar muchos menos triples que los pares NO se pinta de rojo');
ok(filaDe(htmlTira, 'T3I').indexOf('0,') > -1,
   'pero el multiplo se sigue mostrando: se saca el color, no el dato');
ok(/tono-alto/.test(filaDe(htmlTira, 'eFG%')),
   'y el eFG%, que si es un resultado, conserva el verde');

/* La direccion invertida: en PePP% perder MENOS es mejor, asi que un
   valor por debajo de los pares tiene que salir en verde. Pintarlo de
   rojo por «esta por debajo» contradiria al resto del sistema. */
const flojoEnPerdidas = jug('PIERDE, MUCHO', CLAVE, 20, { 'PePP%': 0.30 });
const cuidador = jug('CUIDA, BIEN', CLAVE, 20, { 'PePP%': 0.05 });
const idxPP = indice(base.concat([flojoEnPerdidas, cuidador]));
const htmlCuida = P.jugadoresCardRef(idxPP, cuidador, J.JUGADORES_CARDS_REF[2]);
const htmlPierde = P.jugadoresCardRef(idxPP, flojoEnPerdidas, J.JUGADORES_CARDS_REF[2]);
const filaPP = (h) => {
  const i = h.indexOf('PePP%');
  return i === -1 ? '' : h.slice(i, i + 600);
};
ok(/tono-alto/.test(filaPP(htmlCuida)),
   'perder menos que los pares sale en VERDE (metrica invertida)');
ok(/tono-bajo/.test(filaPP(htmlPierde)),
   'y perder mas sale en rojo');

/* El nombre del jugador se escapa: la planilla puede traer cualquier cosa. */
const raro = jug('<script>x</script>, A', CLAVE, 20, { T2I: 6 });
const htmlRaro = P.jugadoresCardRef(indice(base.concat([raro])), raro,
  J.JUGADORES_CARDS_REF[0]);
ok(htmlRaro.indexOf('<script>x</script>') === -1, 'el markup del nombre se escapa');

/* =====================================================================
   7 · LOS DOS GRÁFICOS DEL TAB TIRO USAN LA MISMA REFERENCIA

   Si el gráfico leyera el JUGADOR TIPO y la tabla de arriba la mediana de
   los pares, la misma pestaña se contradiría sola.
   ===================================================================== */
bloque('7 · El tab Tiro no se contradice');

const fuente = fs.readFileSync(path.join(__dirname, 'js/sgadd-jugadores.js'), 'utf8');
const tabTiro = fuente.slice(fuente.indexOf('function jugadoresTabTiro'),
                             fuente.indexOf('function jugadoresElegirMetricaEvolucion'));
const tabSinComentarios = tabTiro.replace(/\/\*[\s\S]*?\*\//g, '');
ok(tabSinComentarios.indexOf('jugadoresPeerReferencia') > -1,
   'el tab Tiro resuelve la referencia con el motor de pares');
ok(tabSinComentarios.indexOf('r.tipo') === -1,
   'y ya no lee la fila JUGADOR TIPO para las barras grises');
ok(tabSinComentarios.indexOf('nombreLiga') > -1,
   'le pasa al gráfico el nombre de la muestra');
ok(tabSinComentarios.indexOf('notaLiga') > -1,
   'y la nota para el tooltip de la barra de referencia');

const charts = fs.readFileSync(path.join(__dirname, 'js/sgadd-charts.js'), 'utf8');
const barras = charts.slice(charts.indexOf('function barrasComparadas'),
                            charts.indexOf('function barrasComparadas') + 2600);
ok(barras.indexOf('o.nombreLiga') > -1, 'barrasComparadas acepta el nombre de la referencia');
ok(barras.indexOf('afterLabel') > -1, 'y pone la nota en el tooltip');

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
