/* =====================================================================
   Motor de configuración de competencia · sgadd-config.js

   Cubre las cuatro cosas que pueden salir mal en silencio:

     1. el fallback: una config ausente o rota NO puede tumbar nada,
     2. la cascada de zonas y los índices negativos,
     3. la resolución por tramo, incluido el `null` explícito,
     4. el contraste de los tonos, medido con la MISMA función que el
        panel usa para los acentos por club.
   ===================================================================== */
const fs = require('fs');
const vm = require('vm');
const C = require('./js/sgadd-config.js');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* `contraste` vive en sgadd-club.js, que arranca solo y usa `document`:
   se carga en un vm igual que en test-clubes.js. NO se reimplementa acá —
   un tono validado con otra fórmula que la que usa el panel no prueba
   nada sobre lo que el DT ve. */
function cargarClub() {
  const SRC = fs.readFileSync('./js/sgadd-club.js', 'utf8')
    .replace('const CLUB = (function () {', 'var CLUB = (function () {');
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: '' } },
    document: {
      readyState: 'complete', currentScript: { src: 'x/js/sgadd-club.js' },
      getElementsByTagName: () => [], getElementById: () => null,
      documentElement: { style: { setProperty() {} } }, body: { appendChild() {} },
      createElement: () => ({ style: {}, remove() {} }), addEventListener() {}, title: '',
    },
    fetch: async () => ({ ok: false, status: 404 }),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return ctx.CLUB;
}

const CLUB = cargarClub();

/* Un formato de referencia: es el de clubes/deportivo.json. */
const JSON_OK = {
  competencia: {
    ordenTabla: ['PCT', 'DIF', 'PF'],
    formatos: {
      'regular-12': {
        label: 'Regular · 12 equipos',
        equiposEsperados: 12,
        zonas: [
          { id: 'campeon',   desde:  1, hasta:  1, label: 'Campeón',         tono: 'exito' },
          { id: 'playoffs',  desde:  1, hasta:  8, label: 'Playoffs',        tono: 'positivo' },
          { id: 'repechaje', desde:  9, hasta: 10, label: 'Reclasificación', tono: 'aviso' },
          { id: 'descenso',  desde: -2,            label: 'Descenso',        tono: 'peligro' },
        ],
      },
    },
    porTramo: { '*': 'regular-12' },
  },
};

/* ==================================================================== */
titulo('FALLBACK · la config de cliente nunca puede tumbar el panel');

/* Es la regla del punto 6 y vale igual acá: el JSON es opcional, puede
   venir a medias o directamente no cargar. Cualquiera de esos casos
   tiene que devolver null y dejar la app como estaba. */
[
  ['sin argumento', undefined],
  ['null', null],
  ['un string', 'competencia'],
  ['un número', 42],
  ['un objeto vacío', {}],
  ['un JSON de club sin el bloque', { id: 'x', nombre: 'X', planillas: [] }],
  ['competencia en null', { competencia: null }],
  ['competencia que no es objeto', { competencia: 'regular-12' }],
].forEach(([que, valor]) => {
  check('parsear(' + que + ') devuelve null', C.parsear(valor) === null);
});

/* Un bloque presente pero incompleto SÍ parsea: lo que falta se rellena
   con defaults en vez de tirar. Media config es mejor que ninguna. */
const vacio = C.parsear({ competencia: {} });
check('un bloque vacío parsea igual', !!vacio);
check('y trae el orden de tabla por defecto',
  vacio && vacio.ordenTabla.join(',') === 'PCT,DIF,PF');
check('sin formatos ni tramos, no revienta',
  vacio && Object.keys(vacio.formatos).length === 0 && Object.keys(vacio.porTramo).length === 0);
check('y pedirle un formato devuelve null',
  C.formatoDeTramo(vacio, 'IDA', 'REGULAR') === null);
check('formatoDeTramo(null, …) tampoco revienta',
  C.formatoDeTramo(null, 'IDA', 'REGULAR') === null);

/* Zonas basura: se descartan una por una en vez de invalidar el formato
   entero. Un `desde` que no es número no dice nada, pero las otras tres
   zonas del formato sí. */
const sucio = C.parsear({ competencia: { formatos: { f: { zonas: [
  { id: 'buena', desde: 1, hasta: 3, tono: 'exito' },
  null,
  'texto suelto',
  { id: 'sin-desde', hasta: 5 },
  { id: 'desde-cero', desde: 0 },
  { id: 'desde-basura', desde: 'primero' },
] } }, porTramo: { '*': 'f' } } });
const fSucio = C.formatoDeTramo(sucio, 'X', 'Y');
check('las zonas inválidas se descartan de a una', fSucio.zonas.length === 1,
  fSucio.zonas.map(z => z.id).join(','));
check('y la buena sobrevive', fSucio.zonas[0].id === 'buena');
check('el puesto 0 no es un puesto y esa zona no entra',
  !fSucio.zonas.some(z => z.id === 'desde-cero'));

/* Un tono inventado cae a neutro. Si devolviera undefined, la zona se
   pintaría transparente y dejaría de distinguirse: gris es peor que el
   color pedido, pero muchísimo mejor que invisible. */
const tonoRaro = C.parsear({ competencia: { formatos: { f: { zonas: [
  { id: 'z', desde: 1, tono: 'fucsia' }] } }, porTramo: { '*': 'f' } } });
check('un tono desconocido cae a neutro',
  C.formatoDeTramo(tonoRaro, 'X', 'Y').zonas[0].tono === 'neutro');
check('y tono() de un id inventado también',
  C.tono('fucsia') === C.TONOS.neutro.pantalla);

/* ==================================================================== */
titulo('ZONAS · cascada, rangos e índices negativos');

const cfg = C.parsear(JSON_OK);
const f12 = C.formatoDeTramo(cfg, 'IDA', 'REGULAR');
check('el formato del tramo se resuelve', f12 && f12.id === 'regular-12');

const t12 = C.zonasDeTabla(f12, 12);
check('la tabla de 12 devuelve 12 puestos', t12.length === 12);

/* GANA LA PRIMERA QUE CALZA. Campeón (1-1) está DENTRO de Playoffs
   (1-8), así que el puesto 1 tiene que salir Campeón. Si ganara la
   última, la zona más específica no se vería nunca y declararla sería
   inútil — el mismo idioma de cascada que ya usan PERFILES_MARCA y
   JERARQUIA. */
check('el puesto 1 es Campeón, no Playoffs (gana la primera que calza)',
  t12[0].id === 'campeon', t12[0] && t12[0].id);
check('el puesto 2 sí es Playoffs', t12[1].id === 'playoffs');
check('el 8 todavía es Playoffs', t12[7].id === 'playoffs');
check('el 9 y el 10 son Reclasificación',
  t12[8].id === 'repechaje' && t12[9].id === 'repechaje');
check('el 11 y el 12 son Descenso',
  t12[10].id === 'descenso' && t12[11].id === 'descenso');

/* EL PUNTO DE LOS ÍNDICES NEGATIVOS. La misma config, otra categoría.
   Con `desde: 11` fijo, una liga de 14 dejaría al 13 y al 14 fuera del
   descenso y marcaría a dos que se salvan — y la tabla se vería
   perfecta, que es lo que lo vuelve caro. */
const t14 = C.zonasDeTabla(f12, 14);
check('con 14 equipos el descenso se corre solo al 13 y 14',
  t14[12].id === 'descenso' && t14[13].id === 'descenso');
check('y el 11 y el 12 ya no descienden',
  t14[10] === null && t14[11] === null,
  JSON.stringify([t14[10] && t14[10].id, t14[11] && t14[11].id]));
/* EL CHOQUE QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO.

   Con 10 equipos, Reclasificación (fija en 9-10) y Descenso (`-2`, que se
   resuelve a 9-10) piden LOS MISMOS puestos. Gana la primera de la
   cascada, o sea Reclasificación, y el descenso desaparece de la tabla
   sin que nadie lo note: los diez puestos salen pintados.

   No es un bug del motor —una cascada hace exactamente esto— pero SÍ es
   una config equivocada para esa cantidad de equipos, y por eso el
   validador tiene que denunciarla. Es el mismo criterio de siempre: la
   herramienta no adivina, avisa. */
const t10 = C.zonasDeTabla(f12, 10);
check('con 10 equipos, el 9 y el 10 los gana Reclasificación por ir primero',
  t10[8].id === 'repechaje' && t10[9].id === 'repechaje',
  JSON.stringify([t10[8] && t10[8].id, t10[9] && t10[9].id]));
check('y el descenso queda sin un solo puesto',
  !C.zonasDeTabla(f12, 10).some(z => z && z.id === 'descenso'));
check('el validador denuncia esa zona que no se ve',
  C.validar(cfg, { torneo: 'IDA', fase: 'REGULAR', equipos: 10 })
    .some(p => p.nivel === 'aviso' && /"descenso"/.test(p.mensaje)),
  JSON.stringify(C.validar(cfg, { torneo: 'IDA', fase: 'REGULAR', equipos: 10 })
    .map(p => p.mensaje)));
check('-1 es el último',
  C.zonaDePuesto({ zonas: [{ id: 'u', desde: -1, tono: 'neutro' }] }, 12, 12).id === 'u');
check('y -1 no alcanza al penúltimo',
  C.zonaDePuesto({ zonas: [{ id: 'u', desde: -1, tono: 'neutro' }] }, 11, 12) === null);

/* `hasta` omitido: con desde positivo es UN puesto, con desde negativo
   llega hasta el fondo. Son los dos casos que la gente escribe. */
const unSolo = { zonas: [{ id: 'x', desde: 3, tono: 'neutro' }] };
check('sin hasta y desde positivo, la zona es de un solo puesto',
  C.zonaDePuesto(unSolo, 3, 12).id === 'x' && C.zonaDePuesto(unSolo, 4, 12) === null);
const ultimos = { zonas: [{ id: 'x', desde: -3, tono: 'neutro' }] };
check('sin hasta y desde negativo, llega hasta el final',
  [10, 11, 12].every(p => C.zonaDePuesto(ultimos, p, 12) !== null) &&
  C.zonaDePuesto(ultimos, 9, 12) === null);

/* Un rango que se invierte al resolverse no se aplica: es preferible
   dejar el puesto sin zona a pintarlo con una regla que no tiene
   sentido. Pasa con `desde: -2` en una liga de un solo equipo. */
check('un rango invertido no se aplica',
  C.zonaDePuesto({ zonas: [{ id: 'x', desde: 5, hasta: 2, tono: 'neutro' }] }, 3, 12) === null);
check('y el validador lo denuncia',
  C._rangoDeZona({ desde: 5, hasta: 2 }, 12) === null);

/* Bordes: nada de esto puede tirar una excepción, porque el total sale
   del índice y en el arranque puede llegar en 0. */
check('puesto fuera de rango devuelve null', C.zonaDePuesto(f12, 13, 12) === null);
check('puesto 0 devuelve null', C.zonaDePuesto(f12, 0, 12) === null);
check('total 0 devuelve null', C.zonaDePuesto(f12, 1, 0) === null);
check('formato null devuelve null', C.zonaDePuesto(null, 1, 12) === null);
check('formato sin zonas devuelve null', C.zonaDePuesto({ zonas: [] }, 1, 12) === null);
check('zonasDeTabla con total 0 devuelve lista vacía',
  C.zonasDeTabla(f12, 0).length === 0);

/* La leyenda muestra lo que se VE, con los equipos reales. Una zona
   tapada del todo no aparece: explicarla confunde más de lo que aclara. */
const l12 = C.leyenda(f12, 12);
check('la leyenda no repite zonas', l12.length === 4);
check('y viene en orden de tabla',
  l12.map(z => z.id).join(',') === 'campeon,playoffs,repechaje,descenso');
check('la leyenda trae el rango ya resuelto',
  l12[3].desde === 11 && l12[3].hasta === 12);
check('con 14 equipos el rango de la leyenda acompaña',
  C.leyenda(f12, 14)[3].desde === 13);

/* ==================================================================== */
titulo('TRAMOS · TORNEO|FASE, comodines y el null explícito');

const porTramo = C.parsear({ competencia: {
  formatos: { a: { zonas: [{ id: 'a', desde: 1, tono: 'exito' }] },
              b: { zonas: [{ id: 'b', desde: 1, tono: 'aviso' }] } },
  porTramo: {
    'IDA|REGULAR': 'a',
    'VUELTA|*': 'b',
    '*': 'a',
    'PLAYOFFS|FINAL': null,
  },
} });

check('la clave exacta TORNEO|FASE gana',
  C.formatoDeTramo(porTramo, 'IDA', 'REGULAR').id === 'a');
check('TORNEO|* atrapa cualquier fase de ese torneo',
  C.formatoDeTramo(porTramo, 'VUELTA', 'REGULAR').id === 'b' &&
  C.formatoDeTramo(porTramo, 'VUELTA', 'SEMIS').id === 'b');
check('el comodín general atrapa lo que no calzó',
  C.formatoDeTramo(porTramo, 'APERTURA', 'REGULAR').id === 'a');

/* EL CASO QUE JUSTIFICA hasOwnProperty. Un null explícito significa
   "este tramo no lleva zonas" y tiene que GANARLE al comodín. Si se
   tratara igual que una clave ausente, apagar la tabla en playoffs
   sería imposible: el '*' la volvería a encender. */
check('un null explícito apaga las zonas del tramo',
  C.formatoDeTramo(porTramo, 'PLAYOFFS', 'FINAL') === null);
check('y le gana al comodín, que sí tiene formato',
  C.formatoDeTramo(porTramo, 'PLAYOFFS', 'OTRA').id === 'a');

check('la clave no distingue mayúsculas',
  C.formatoDeTramo(porTramo, 'ida', 'regular').id === 'a');
check('sin torneo se usa el comodín de torneo',
  C.formatoDeTramo(porTramo, '', 'REGULAR').id === 'a');

/* Apuntar a un formato que no existe devuelve null en vez de romper, y
   el validador lo denuncia como error: es un typo en el JSON. */
const roto = C.parsear({ competencia: { formatos: {}, porTramo: { '*': 'no-existe' } } });
check('un formato inexistente devuelve null', C.formatoDeTramo(roto, 'X', 'Y') === null);
check('y el validador lo marca como error',
  C.validar(roto, {}).some(p => p.nivel === 'error' && /no está declarado/.test(p.mensaje)));

/* ==================================================================== */
titulo('VALIDADOR · la aserción de equiposEsperados');

check('config y libro coincidiendo no dicen nada',
  C.validar(cfg, { torneo: 'IDA', fase: 'REGULAR', equipos: 12 }).length === 0);

/* ES ERROR Y NO AVISO a propósito: un descuadre acá CORRE las zonas de
   puesto. Con 12 declarados y 13 reales el que creías que descendía se
   salva, y la tabla se ve perfecta — no hay síntoma que lo delate. */
const desc = C.validar(cfg, { torneo: 'IDA', fase: 'REGULAR', equipos: 13 });
check('un descuadre de equipos es ERROR, no aviso',
  desc.length === 1 && desc[0].nivel === 'error');
check('y el mensaje dice los dos números',
  /12/.test(desc[0].mensaje) && /13/.test(desc[0].mensaje), desc[0] && desc[0].mensaje);

/* El dato manda: la aserción no cambia el cálculo. Con 13 equipos las
   zonas se resuelven sobre 13, aunque el JSON diga 12. */
check('pero el dato manda: las zonas se calculan sobre los equipos reales',
  C.zonasDeTabla(f12, 13)[12].id === 'descenso' && C.zonasDeTabla(f12, 13)[10] === null);

check('sin equipos en el contexto no se puede aseverar nada',
  C.validar(cfg, { torneo: 'IDA', fase: 'REGULAR' }).length === 0);
check('validar(null) devuelve lista vacía', C.validar(null, {}).length === 0);
check('validar sin contexto no revienta', Array.isArray(C.validar(cfg)));

/* Config muerta: se edita creyendo que hace algo y no hace nada. */
const muerto = C.parsear({ competencia: {
  formatos: { usado: { zonas: [{ id: 'z', desde: 1, tono: 'exito' }] },
              huerfano: { zonas: [{ id: 'z', desde: 1, tono: 'exito' }] } },
  porTramo: { '*': 'usado' } } });
check('un formato que ningún tramo usa se denuncia',
  C.validar(muerto, { equipos: 12 }).some(p => /configuración muerta/.test(p.mensaje)));

/* Una zona declarada que con esta cantidad de equipos no pinta ningún
   puesto: está y no se ve. Pasa al heredar rangos de otra categoría. */
const tapada = C.parsear({ competencia: {
  formatos: { f: { zonas: [
    { id: 'todo',   desde: 1, hasta: 20, tono: 'exito' },
    { id: 'tapada', desde: 5, hasta: 6,  tono: 'peligro' } ] } },
  porTramo: { '*': 'f' } } });
check('una zona tapada del todo se denuncia como aviso',
  C.validar(tapada, { equipos: 12 }).some(p => p.nivel === 'aviso' && /"tapada"/.test(p.mensaje)));

const sinZonas = C.parsear({ competencia: {
  formatos: { f: { zonas: [] } }, porTramo: { '*': 'f' } } });
check('un formato sin zonas avisa que la tabla sale sin colores',
  C.validar(sinZonas, { equipos: 12 }).some(p => /sin colores/.test(p.mensaje)));

/* ==================================================================== */
titulo('TONOS · contraste WCAG AA en las dos superficies');

const FONDO_CARD = '#1F2937';    // la card oscura, igual que sgadd-club.js
const FONDO_PAPEL = '#f1f5f9';   // el gris de las tarjetas impresas
const BLANCO = '#ffffff';        // y la hoja, por si la card va blanca

check('hay cinco tonos y ni uno más',
  Object.keys(C.TONOS).length === 5, Object.keys(C.TONOS).join(','));
check('el vocabulario es el declarado',
  ['exito', 'positivo', 'aviso', 'peligro', 'neutro'].every(t => !!C.TONOS[t]));

/* El piso es 4.5 en las TRES superficies. Un tono que solo pasa en
   pantalla se imprime ilegible, y el club imprime: los cuatro PDF del
   punto 7 son parte del producto, no un extra. */
Object.keys(C.TONOS).forEach((id) => {
  const t = C.TONOS[id];
  const cP = CLUB.contraste(t.pantalla, FONDO_CARD);
  const cA = CLUB.contraste(t.papel, FONDO_PAPEL);
  const cB = CLUB.contraste(t.papel, BLANCO);
  check('tono ' + id + ' · pantalla pasa AA sobre la card', cP >= 4.5, cP.toFixed(2));
  check('tono ' + id + ' · papel pasa AA sobre la tarjeta impresa', cA >= 4.5, cA.toFixed(2));
  check('tono ' + id + ' · papel pasa AA sobre la hoja blanca', cB >= 4.5, cB.toFixed(2));
});

/* Los tonos NO dependen del club: son semánticos (playoffs, descenso),
   no de marca. Que sean los mismos en los tres es la propiedad, no un
   descuido — un descenso no cambia de significado por cambiar de club. */
check('el mismo tono da el mismo color en cualquier club',
  C.tono('peligro') === '#f87171' && C.tono('peligro', true) === '#b91c1c');
check('tono() en papel devuelve la variante oscura',
  Object.keys(C.TONOS).every(id => C.tono(id, true) === C.TONOS[id].papel));
check('y en pantalla la clara',
  Object.keys(C.TONOS).every(id => C.tono(id, false) === C.TONOS[id].pantalla));

/* Cada tono tiene que tener su clase CSS a mano en el index: la tabla
   la inyecta un nodo dinámico y el scan de Tailwind es estático. */
const html = fs.readFileSync('./index.html', 'utf8');
Object.keys(C.TONOS).forEach((id) => {
  check('la clase .zona-' + id + ' existe en el <style>',
    html.indexOf('.zona-' + id) >= 0);
});
check('y las cinco tienen variante de papel',
  Object.keys(C.TONOS).every(id => {
    const print = html.slice(html.indexOf('@media print {', html.indexOf('.zona-neutro')));
    return print.indexOf('.zona-' + id) >= 0;
  }));

/* ==================================================================== */
titulo('EL ACENTO COMO FONDO · .bg-accent por club');

/* El bug: `.bg-accent` no llevaba !important, así que el dorado del
   tema le ganaba al acento del club y los tres clientes tenían la
   pestaña activa del mismo color. */
check('.bg-accent lleva !important, como .text-accent',
  /\.bg-accent\s*\{[^}]*!important/.test(html));
check('y usa el token de FONDO, no el acento crudo',
  /\.bg-accent\s*\{[^}]*--acento-fondo/.test(html));

/* Y por qué no el crudo: encima va texto oscuro. Medido, la marca de
   DEPORTIVO da 1,14 — la pestaña activa quedaría invisible. */
const TEXTO_SOBRE_ACENTO = '#0B1121';
const MARCAS = { reconquista: '#f7941e', jujuy: '#2563eb', deportivo: '#09086E' };
check('el acento CRUDO de DEPORTIVO no sirve de fondo',
  CLUB.contraste(TEXTO_SOBRE_ACENTO, MARCAS.deportivo) < 4.5,
  CLUB.contraste(TEXTO_SOBRE_ACENTO, MARCAS.deportivo).toFixed(2));
check('el de Jujuy tampoco',
  CLUB.contraste(TEXTO_SOBRE_ACENTO, MARCAS.jujuy) < 4.5,
  CLUB.contraste(TEXTO_SOBRE_ACENTO, MARCAS.jujuy).toFixed(2));

Object.keys(MARCAS).forEach((club) => {
  const fondo = CLUB.aclararHastaLegible(MARCAS[club], TEXTO_SOBRE_ACENTO, 4.5);
  const c = CLUB.contraste(TEXTO_SOBRE_ACENTO, fondo);
  check('--acento-fondo de ' + club + ' deja leer el texto encima', c >= 4.5,
    fondo + ' → ' + c.toFixed(2));
});

const club = fs.readFileSync('./js/sgadd-club.js', 'utf8');
check('sgadd-club.js calcula --acento-fondo', /acentoFondo\s*=\s*aclararHastaLegible/.test(club));
check('y lo publica como variable CSS', /--acento-fondo/.test(club));
/* Contra el TEXTO que va encima, no contra la card: son dos preguntas
   distintas y con una marca de luminancia media pueden separarse. */
check('y lo mide contra el texto que va encima, no contra la card',
  /acentoFondo\s*=\s*aclararHastaLegible\(c\.acento,\s*TEXTO_SOBRE_ACENTO/.test(club));

/* ==================================================================== */
titulo('LA CONFIG REAL DE DEPORTIVO');

const jsonDep = JSON.parse(fs.readFileSync('./clubes/deportivo.json', 'utf8'));
const cfgDep = C.parsear(jsonDep);
check('el bloque competencia parsea', !!cfgDep);
const fDep = C.formatoDeTramo(cfgDep, 'IDA', 'REGULAR');
check('el tramo IDA|REGULAR resuelve un formato', !!fDep);
check('declara los 12 equipos del libro', fDep.equiposEsperados === 12);
check('y contra el libro real no hay descuadre',
  C.validar(cfgDep, { torneo: 'IDA', fase: 'REGULAR', equipos: 12 }).length === 0);
check('las cuatro zonas cubren la tabla sin huecos',
  C.zonasDeTabla(fDep, 12).every(z => z !== null));
/* Los otros dos clubes no declaran competencia todavía y eso tiene que
   seguir siendo válido: la config es opcional. */
['reconquista', 'jujuy'].forEach((id) => {
  const j = JSON.parse(fs.readFileSync('./clubes/' + id + '.json', 'utf8'));
  check(id + ' sin bloque competencia sigue siendo válido', C.parsear(j) === null);
});


/* ==================================================================== */
titulo('OVERRIDE LOCAL · lo que el DT edita desde la pantalla');

/* `localStorage` no existe en Node. Se simula con lo mínimo, porque lo
   que hay que probar es la LÓGICA de precedencia, no el navegador. */
function conAlmacen(fn, opciones) {
  const o = opciones || {};
  const datos = Object.assign({}, o.inicial || {});
  const falso = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null),
    setItem: (k, v) => { if (o.lleno) throw new Error('QuotaExceeded'); datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
  };
  const previo = global.localStorage;
  if (o.roto) Object.defineProperty(global, 'localStorage', {
    get() { throw new Error('modo privado'); }, configurable: true });
  else global.localStorage = falso;
  try { return fn(datos); }
  finally {
    delete global.localStorage;
    if (previo !== undefined) global.localStorage = previo;
  }
}

const CLAVE_DEP = C.claveAlmacen('deportivo');
check('la clave es por CLUB, con el prefijo de siempre',
  CLAVE_DEP === 'sgadd.config.deportivo', CLAVE_DEP);
check('sin club cae a "default" en vez de a undefined',
  C.claveAlmacen(null) === 'sgadd.config.default' &&
  C.claveAlmacen('') === 'sgadd.config.default');
/* Ese es el bug del punto 13: con la clave mal, TODOS los clubes
   escriben en el mismo lugar y no se nota. */
check('dos clubes no comparten clave',
  C.claveAlmacen('deportivo') !== C.claveAlmacen('jujuy'));

/* En Node, sin localStorage, todo se degrada sin tirar. */
check('sin localStorage leer devuelve null', C.leerOverride('x') === null);
check('sin localStorage guardar devuelve false', C.guardarOverride('x', {}) === false);
check('sin localStorage borrar devuelve false', C.borrarOverride('x') === false);
check('y vigente() cae al JSON del club',
  C.vigente(JSON_OK, 'x').origen === 'json');

conAlmacen((datos) => {
  check('guardar escribe en la clave del club',
    C.guardarOverride('deportivo', { formatos: {}, porTramo: {} }) === true &&
    Object.prototype.hasOwnProperty.call(datos, CLAVE_DEP));
  check('y leer lo devuelve', !!C.leerOverride('deportivo'));
  check('borrar lo saca',
    C.borrarOverride('deportivo') === true && C.leerOverride('deportivo') === null);
});

/* LA PRECEDENCIA. El override manda sobre el JSON, y eso es lo que hace
   que editar desde la pantalla sirva de algo. */
const OTRO = { formatos: { solo: { label: 'Solo playoffs',
  zonas: [{ id: 'playoffs', desde: 1, hasta: 4, label: 'Playoffs', tono: 'positivo' }] } },
  porTramo: { '*': 'solo' } };
conAlmacen(() => {
  C.guardarOverride('deportivo', OTRO);
  const v = C.vigente(JSON_OK, 'deportivo');
  check('con override guardado, vigente() lo devuelve a él', v.origen === 'local');
  check('y trae SUS formatos, no los del JSON',
    Object.keys(v.config.formatos).join() === 'solo', Object.keys(v.config.formatos).join());
  /* Reemplazo ENTERO, no merge campo por campo: fusionar zonas de dos
     orígenes daría cascadas que ninguno de los dos declaró, y la cascada
     es justamente lo que decide qué zona gana. */
  check('el JSON no se cuela por abajo: es reemplazo entero',
    !v.config.formatos['regular-12']);
  check('el formato del tramo sale del override',
    C.formatoDeTramo(v.config, 'IDA', 'REGULAR').id === 'solo');
});

conAlmacen(() => {
  check('un override CORRUPTO se ignora y se cae al JSON',
    C.vigente(JSON_OK, 'deportivo').origen === 'json');
}, { inicial: { [CLAVE_DEP]: '{esto no es json' } });

conAlmacen(() => {
  /* Un override que parsea a null —sin bloque útil— tampoco puede dejar
     al panel sin config: se cae al JSON igual que si no existiera. */
  check('un override vacío tampoco pisa al JSON',
    C.vigente(JSON_OK, 'deportivo').origen === 'json');
}, { inicial: { [CLAVE_DEP]: 'null' } });

conAlmacen(() => {
  check('con la cuota llena guardar devuelve false y no tira',
    C.guardarOverride('deportivo', OTRO) === false);
}, { lleno: true });

conAlmacen(() => {
  check('en modo privado, leer no tira', C.leerOverride('deportivo') === null);
  check('y guardar tampoco', C.guardarOverride('deportivo', OTRO) === false);
}, { roto: true });

/* ==================================================================== */
titulo('EXPORTAR · el bloque que se commitea');

const texto = C.exportar(cfg);
check('sale como texto, para copiar y pegar', typeof texto === 'string');
const round = JSON.parse(texto);
check('es JSON válido', !!round);
check('conserva el orden de tabla', round.ordenTabla.join() === 'PCT,DIF,PF');
check('conserva las cuatro zonas', round.formatos['regular-12'].zonas.length === 4);
check('y el mapa de tramos', round.porTramo['*'] === 'regular-12');

/* IDA Y VUELTA: exportar y volver a parsear tiene que dar lo mismo, o el
   bloque que el DT commitea no es el que estaba viendo. */
const round2 = C.parsear({ competencia: round });
check('exportar y volver a parsear da el mismo formato',
  JSON.stringify(C.formatoDeTramo(round2, 'IDA', 'REGULAR')) ===
  JSON.stringify(C.formatoDeTramo(cfg, 'IDA', 'REGULAR')));
check('y las mismas zonas por puesto con 12 equipos',
  JSON.stringify(C.zonasDeTabla(C.formatoDeTramo(round2, 'IDA', 'REGULAR'), 12)) ===
  JSON.stringify(C.zonasDeTabla(f12, 12)));

/* `hasta` omitido se exporta OMITIDO, no resuelto. Reponerlo congelaría
   el corte a la cantidad de equipos de hoy y el `-2` dejaría de correrse
   solo — que es el motivo entero de los índices negativos. */
const zDesc = round.formatos['regular-12'].zonas.find(z => z.id === 'descenso');
check('un hasta no declarado se exporta sin hasta',
  !Object.prototype.hasOwnProperty.call(zDesc, 'hasta'), JSON.stringify(zDesc));
check('y el desde negativo se conserva tal cual', zDesc.desde === -2);
check('así el descenso sigue corriéndose con otra cantidad de equipos',
  C.zonasDeTabla(C.formatoDeTramo(round2, 'IDA', 'REGULAR'), 14)[13].id === 'descenso');

check('exportar(null) devuelve vacío', C.exportar(null) === '');

/* ==================================================================== */
titulo('RESOLVER · el único punto de entrada de las pantallas');

/* El bug que cerró: `clasifFormatoVigente()` llamaba a `parsear()` y se
   comía el override. Se guardaba un corte nuevo desde Configuración y la
   tabla seguía pintando el viejo, sin ningún síntoma. */
conAlmacen(() => {
  C.guardarOverride('default', OTRO);
  const r = C.resolver(JSON_OK, 'IDA', 'REGULAR');
  check('resolver() ve el override', r.origen === 'local' && r.formato.id === 'solo');
  check('y devuelve el formato ya resuelto para el tramo', !!r.formato.zonas.length);
});
const rSin = C.resolver(JSON_OK, 'IDA', 'REGULAR');
check('sin override, resolver() cae al JSON',
  rSin.origen === 'json' && rSin.formato.id === 'regular-12');
const rNada = C.resolver(null, 'IDA', 'REGULAR');
check('sin JSON ni override devuelve todo en null, sin tirar',
  rNada.config === null && rNada.formato === null && rNada.origen === 'ninguno');

/* En Node no hay CLUB: el módulo sigue siendo requerible sin navegador. */
check('clubActivo() devuelve "default" fuera del navegador',
  C.clubActivo() === 'default');

/* Y las pantallas TIENEN que pasar por acá. Un `parsear()` suelto en un
   consumidor vuelve a comerse el override. */
const clasifSrc = fs.readFileSync('./js/sgadd-clasificacion.js', 'utf8');
check('Clasificación resuelve con resolver(), no con parsear()',
  /SGADD_CONFIG\.resolver\(/.test(clasifSrc) && !/SGADD_CONFIG\.parsear\(/.test(clasifSrc));
const diagSrc2 = fs.readFileSync('./js/sgadd-diagnostico.js', 'utf8');
check('el Diagnóstico audita lo VIGENTE, no lo que declara el JSON',
  /SGADD_CONFIG\.vigente\(/.test(diagSrc2) && !/SGADD_CONFIG\.parsear\(/.test(diagSrc2));
const uiSrc = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
check('la pantalla delega el id del club en el motor',
  /function configClubId\(\) \{ return SGADD_CONFIG\.clubActivo\(\); \}/.test(uiSrc));

/* ==================================================================== */
titulo('LA PANTALLA DE CONFIGURACIÓN');

check('la vista previa usa la tabla de verdad, no una maqueta',
  /clasifTablaHTML\(/.test(uiSrc) && /clasifLeyendaHTML\(/.test(uiSrc));
/* Un repintado por tecla le saca el foco al input y hace imposible
   escribir un nombre. Es la misma regla que ya cumplen scoutMeta() y el
   buscador del buzón. */
/* Se extrae el CUERPO de la función en vez de mirar una ventana de N
   caracteres: los comentarios de este proyecto son largos y una ventana
   fija hace que el test falle al documentar mejor, que es justo el
   incentivo que no se quiere. */
function cuerpoDe(src, nombre) {
  const a = src.indexOf('function ' + nombre + '(');
  if (a === -1) return '';
  const b = src.indexOf('\n}', a);
  return b === -1 ? src.slice(a) : src.slice(a, b);
}
const cZona = cuerpoDe(uiSrc, 'configZonaCampo');
check('tipear refresca solo la vista previa',
  cZona.indexOf('configPintarPreview()') >= 0, cZona.length + ' chars');
check('y NO repinta la pantalla entera',
  cZona.replace(/configPintarPreview\(\)/g, '').indexOf('configPintar()') === -1);
check('y el estado vive en el módulo, no en el DOM',
  /const CONFIGUI = \{[\s\S]{0,300}borrador/.test(uiSrc));
/* El borrador es una COPIA: editar no puede tocar lo que el resto de la
   app está usando hasta que se guarde. */
check('el borrador es una copia profunda',
  /JSON\.parse\(JSON\.stringify\(v\.config\)\)/.test(uiSrc));
check('guardar reindexa para que las otras pantallas lo vean',
  cuerpoDe(uiSrc, 'configGuardar').indexOf('SGADD_APP.reindexar()') >= 0);
check('y restablecer también',
  cuerpoDe(uiSrc, 'configRestablecer').indexOf('SGADD_APP.reindexar()') >= 0);

/* El sitio es estático: "Guardar" no le cambia nada a nadie más, y la
   pantalla tiene que decirlo. Un DT que cree que cambió el descenso para
   todos es peor que uno que no tiene la pantalla. */
check('la pantalla avisa que lo guardado es solo de este navegador',
  /solo en este navegador|este navegador/.test(uiSrc));
check('y ofrece exportar el bloque para commitearlo',
  /SGADD_CONFIG\.exportar\(/.test(uiSrc) && /commitear/.test(uiSrc));

const htmlIdx = fs.readFileSync('./index.html', 'utf8');
check('configuracion está en VALID_SECTIONS',
  /VALID_SECTIONS = \[[^\]]*'configuracion'/.test(htmlIdx));
check('el router la sabe pintar',
  /case 'configuracion': root\.innerHTML = buildConfiguracion\(\)/.test(htmlIdx));
check('tiene su entrada en el menú', htmlIdx.indexOf('data-nav="configuracion"') >= 0);
/* La preview usa el componente de Clasificación, así que tiene que
   cargarse después. */
check('el módulo carga después de sgadd-clasificacion',
  htmlIdx.indexOf('sgadd-configui.js') > htmlIdx.indexOf('sgadd-clasificacion.js'));

const appSrc2 = fs.readFileSync('./js/sgadd-app.js', 'utf8');
check('al cambiar de tramo la pantalla se repinta',
  /currentSection === 'configuracion'[\s\S]{0,120}configPintar\(\)/.test(appSrc2));


/* =====================================================================
   PRECONFIGURACIÓN Y CERTIFICACIÓN

   Declarar el torneo ANTES de que existan los datos, y después poder
   contrastar. La regla de oro sigue en pie —el dato manda— pero ahora
   hay contra qué compararlo.

   Lo que estos tests amarran, en orden de importancia:

     1. CERO NOMBRES ASUMIDOS. Ninguna clave fija de categoría ni de
        torneo: el fixture usa 'Súper 8', 'Conferencia Sur' y
        'Formativas U17' justamente para que un hardcodeo falle.
     2. El VÍNCULO se declara, no se adivina. La entrevista usa ids
        libres y el libro produce TORNEO|FASE: emparejarlos por parecido
        certificaría el tramo equivocado sin que nadie lo note.
     3. Un tramo SELLADO no se re-juzga contra la proyección. Se juzga
        contra su propia huella, porque lo que hay que detectar es que
        el libro cambió DESPUÉS de darlo por bueno.
   ===================================================================== */
const tit2 = (t) => console.log('\n' + t + '\n' + '─'.repeat(66));

/* Un cliente inventado, con nombres que NO son Ida/Vuelta ni Apertura:
   la prueba de que no hay nada asumido. */
const JSON_CLUB = {
  id: 'nautico',
  torneo: {
    cliente: 'Club Náutico',
    declaradoEl: '2026-08-26',
    declaradoPor: 'Entrevista inicial con el DT',
    categorias: {
      'primera-caballeros': {
        label: 'Primera División Caballeros',
        planilla: 'nautico-primera-2026',
        tramos: [
          { id: 'super-8', label: 'Súper 8', clave: 'SUPER8|REGULAR',
            equiposEsperados: 8, fechasEsperadas: 7 },
          { id: 'conf-sur', label: 'Conferencia Sur', clave: 'CONFSUR|REGULAR',
            equiposEsperados: 10, fechasEsperadas: 18 },
          { id: 'cuadrangular', label: 'Cuadrangular Final' },   // sin vincular
        ],
        certificacion: {},
      },
      'formativas-u17': {
        label: 'Formativas U17',
        tramos: [{ id: 'torneo-nocturno', label: 'Torneo Nocturno',
                   clave: 'NOCTURNO|REGULAR', equiposEsperados: 6, fechasEsperadas: 5 }],
      },
    },
  },
};


/* Un índice de mentira con N equipos y M partidos.

   OJO CON EL FIXTURE: en un índice de verdad los DOS equipos de un
   partido comparten el mismo `__id` —`Base Datos E` trae dos filas por
   partido, una por lado— y `huella()` los deduplica con un Set. Un
   generador que le dé un id distinto a cada lado infla el conteo al
   doble y hace fallar tests que en realidad están bien. */
function idxFalso(nEquipos, nPartidos, semilla) {
  const porEquipo = [];
  for (let i = 0; i < nEquipos; i++) porEquipo.push([]);
  for (let p = 0; p < nPartidos; p++) {
    const id = (semilla || 'p') + '_' + p;
    const a = (p * 2) % nEquipos;
    const b = (a + 1 + Math.floor(p / nEquipos)) % nEquipos;
    porEquipo[a].push({ __id: id });
    porEquipo[b === a ? (a + 1) % nEquipos : b].push({ __id: id });
  }
  return { lista: () => porEquipo.map((ps, i) => ({
    clave: 'E' + i, nombre: 'Equipo ' + i, partidos: ps })) };
}

tit2('CERO NOMBRES ASUMIDOS');
const cats = C.categorias(JSON_CLUB);
check('las categorías salen del mapa, con las claves del cliente',
  cats.map(c => c.id).join() === 'primera-caballeros,formativas-u17', cats.map(c => c.id).join());
check('y conservan el label que puso el usuario',
  cats[0].label === 'Primera División Caballeros', cats[0].label);
const p1 = C.proyeccion(JSON_CLUB, 'primera-caballeros');
check('los tramos también son libres',
  p1.categoria.tramos.map(t => t.label).join(' · ') === 'Súper 8 · Conferencia Sur · Cuadrangular Final',
  p1.categoria.tramos.map(t => t.label).join(' · '));
check('una categoría se resuelve por su PLANILLA además de por su id',
  C.proyeccion(JSON_CLUB, 'nautico-primera-2026').categoria.id === 'primera-caballeros');
check('una categoría que no existe devuelve null, no una inventada',
  C.proyeccion(JSON_CLUB, 'no-existe') === null);

tit2('FALLBACK · un club sin bloque se comporta como antes');
[undefined, null, {}, { id: 'x' }, { torneo: null }, { torneo: 'texto' }].forEach((j, i) => {
  check('parsearProyeccion(' + i + ') devuelve null', C.parsearProyeccion(j) === null);
});
check('categorias() de un club sin bloque devuelve lista vacía',
  C.categorias({}).length === 0);
check('proyeccion() también devuelve null', C.proyeccion({}, 'x') === null);
check('auditar(null) devuelve lista vacía', C.auditar(null, () => null).length === 0);

tit2('EL SEMÁFORO');
const LIBRO = [{ id: 'SUPER8|REGULAR' }, { id: 'CONFSUR|REGULAR' }];
/* Súper 8: 8 equipos, 7 fechas → 4 partidos por fecha → 28. Está completo. */
const idxSuper8 = idxFalso(8, 28, 's8');
/* Conferencia Sur: 10 equipos, 18 fechas → 90. Van 40: en curso. */
const idxConf = idxFalso(10, 40, 'cs');

const r1 = C.auditar(p1, (clave) => {
  if (clave === 'SUPER8|REGULAR') return idxSuper8;
  if (clave === 'CONFSUR|REGULAR') return idxConf;
  return null;
}, { tramosDelLibro: LIBRO });

check('un tramo sin vincular se reporta como tal, no se adivina',
  r1[2].estado === C.ESTADOS.SIN_VINCULO, r1[2].estado);
check('un tramo completo y sin sello queda EN_CURSO y certificable',
  r1[0].estado === C.ESTADOS.EN_CURSO && r1[0].certificable === true,
  r1[0].estado + ' certificable=' + r1[0].certificable);
check('uno a mitad de camino queda EN_CURSO sin certificar',
  r1[1].estado === C.ESTADOS.EN_CURSO && !r1[1].certificable, r1[1].detalle);
check('y dice cuántos van de cuántos',
  /40 partidos de 90/.test(r1[1].detalle), r1[1].detalle);

/* Un tramo declarado cuya clave el libro no tiene: PROYECTADO, y el
   mensaje distingue "no empezó" de "está mal escrita". */
const rSinLibro = C.auditar(p1, () => null, { tramosDelLibro: [] });
check('sin datos el tramo queda PROYECTADO',
  rSinLibro[0].estado === C.ESTADOS.PROYECTADO, rSinLibro[0].estado);
const rClaveMala = C.auditar(p1, () => null, { tramosDelLibro: [{ id: 'OTRA|REGULAR' }] });
check('una clave que el libro no tiene lo dice con todas las letras',
  /no está en el libro/.test(rClaveMala[0].detalle), rClaveMala[0].detalle);

tit2('DIVERGENCIA contra lo proyectado');
const JSON_MAL = JSON.parse(JSON.stringify(JSON_CLUB));
JSON_MAL.torneo.categorias['primera-caballeros'].tramos[0].equiposEsperados = 12;
const rMal = C.auditar(C.proyeccion(JSON_MAL, 'primera-caballeros'),
  () => idxSuper8, { tramosDelLibro: LIBRO });
check('declarar 12 equipos y traer 8 es DIVERGENTE',
  rMal[0].estado === C.ESTADOS.DIVERGENTE, rMal[0].estado);
check('y el mensaje dice los dos números',
  /12/.test(rMal[0].detalle) && /8/.test(rMal[0].detalle), rMal[0].detalle);
/* El dato manda: la huella se calcula sobre lo REAL, no sobre lo declarado. */
check('pero la huella sale del libro, no de la proyección',
  rMal[0].huella.equipos === 8, rMal[0].huella.equipos);

tit2('CERTIFICACIÓN Y HUELLA · el punto de todo esto');
const sello = C.certificar(idxSuper8, '2026-09-14');
check('el sello guarda equipos, partidos y hash',
  sello.equipos === 8 && sello.partidos === 28 && !!sello.hash, JSON.stringify(sello));
check('y la fecha con la que se selló', sello.fecha === '2026-09-14');
check('sin fecha usa la de hoy', /^\d{4}-\d{2}-\d{2}$/.test(C.certificar(idxSuper8).fecha));

const JSON_CERT = JSON.parse(JSON.stringify(JSON_CLUB));
JSON_CERT.torneo.categorias['primera-caballeros'].certificacion = { 'super-8': sello };
const pC = C.proyeccion(JSON_CERT, 'primera-caballeros');
const rC = C.auditar(pC, () => idxSuper8, { tramosDelLibro: LIBRO });
check('con el libro igual al sello queda CERTIFICADO',
  rC[0].estado === C.ESTADOS.CERTIFICADO, rC[0].estado);
check('y muestra la fecha del sello', /2026-09-14/.test(rC[0].detalle), rC[0].detalle);

/* UN TRAMO CERTIFICADO NO SE VUELVE A JUZGAR CONTRA LA PROYECCIÓN. Si el
   torneo cerró con 8 equipos, que la entrevista dijera 12 ya no importa:
   es un hecho histórico. Lo que sí importa es si el libro cambió. */
const JSON_CERT_MAL = JSON.parse(JSON.stringify(JSON_CERT));
JSON_CERT_MAL.torneo.categorias['primera-caballeros'].tramos[0].equiposEsperados = 12;
const rCM = C.auditar(C.proyeccion(JSON_CERT_MAL, 'primera-caballeros'),
  () => idxSuper8, { tramosDelLibro: LIBRO });
check('un tramo sellado NO se re-juzga contra lo proyectado',
  rCM[0].estado === C.ESTADOS.CERTIFICADO, rCM[0].estado);

/* Y ACÁ ESTÁ EL VALOR REAL: el libro cambió DESPUÉS del sello. */
const idxCambiado = idxFalso(8, 29, 's8');
const rDiv = C.auditar(pC, () => idxCambiado, { tramosDelLibro: LIBRO });
check('si el libro cambia después de certificar, salta DIVERGENTE',
  rDiv[0].estado === C.ESTADOS.DIVERGENTE, rDiv[0].estado);
check('y dice que cambió DESPUÉS del sello, con la fecha',
  /EL LIBRO CAMBIÓ después de certificarse el 2026-09-14/.test(rDiv[0].detalle),
  rDiv[0].detalle);
check('con el antes y el después', /28/.test(rDiv[0].detalle) && /29/.test(rDiv[0].detalle));

/* El caso que un contador de partidos NO cazaría: mismos totales, otros
   partidos. Por eso la huella es sobre los IDS y no sobre las cuentas. */
const idxOtrosMismos = idxFalso(8, 28, 'XX');
const rSilencioso = C.auditar(pC, () => idxOtrosMismos, { tramosDelLibro: LIBRO });
check('cambiar partidos SIN cambiar los totales también se caza',
  rSilencioso[0].estado === C.ESTADOS.DIVERGENTE, rSilencioso[0].estado);
check('y se explica que los totales son los mismos',
  /mismos totales, pero otros partidos/.test(rSilencioso[0].detalle),
  rSilencioso[0].detalle);

tit2('EL VÍNCULO SE PROPONE, NO SE ADIVINA');
const declarado = { id: 'super-8', label: 'Súper 8' };
check('con una sola coincidencia se propone',
  C.sugerirClave(declarado, [{ id: 'SUPER8|REGULAR', label: 'Super8 - Regular' }]) === 'SUPER8|REGULAR');
check('con varias NO se propone ninguna',
  C.sugerirClave({ id: 'x', label: 'Regular' },
    [{ id: 'A|REGULAR', label: 'Regular' }, { id: 'B|REGULAR', label: 'Regular' }]) === null);
check('y sin coincidencia tampoco',
  C.sugerirClave(declarado, [{ id: 'OTRA|COSA', label: 'Otra cosa' }]) === null);

tit2('LA HUELLA');
check('es estable: dos veces el mismo índice da el mismo hash',
  C.huella(idxSuper8).hash === C.huella(idxSuper8).hash);
check('y no depende del orden en que vengan los partidos',
  C.huella(idxSuper8).hash === C.huella({
    lista: () => idxSuper8.lista().slice().reverse() }).hash);
check('huella(null) devuelve null', C.huella(null) === null);

tit2('LA COMPETENCIA POR CATEGORÍA');
const JSON_ZONAS = JSON.parse(JSON.stringify(JSON_CLUB));
JSON_ZONAS.torneo.categorias['primera-caballeros'].competencia = {
  formatos: { f: { label: 'F', zonas: [{ id: 'z', desde: 1, hasta: 2, tono: 'exito' }] } },
  porTramo: { '*': 'f' },
};
const pZ = C.proyeccion(JSON_ZONAS, 'primera-caballeros');
check('cada categoría puede traer su propio bloque de zonas',
  !!pZ.categoria.competencia && !!pZ.categoria.competencia.formatos.f);
check('y usa el MISMO parser del punto 15, no uno paralelo',
  pZ.categoria.competencia.formatos.f.zonas[0].tono === 'exito');
check('una categoría sin zonas lo deja en null',
  C.proyeccion(JSON_CLUB, 'formativas-u17').categoria.competencia === null);


tit2('EL BLOQUE 0c DEL DIAGNÓSTICO');
const diagSrc3 = fs.readFileSync('./js/sgadd-diagnostico.js', 'utf8');
/* Las claves del semáforo están alineadas con espacios en el fuente
   (`EN_CURSO:    {`), así que se normaliza antes de buscar: un test que
   se rompe al alinear una tabla obliga a desalinearla. */
const semNorm = diagSrc3.replace(/:\s+\{/g, ': {');
check('el semáforo declara los cinco estados',
  ['CERTIFICADO', 'EN_CURSO', 'PROYECTADO', 'DIVERGENTE', 'SIN_VINCULO']
    .every(k => semNorm.indexOf(k + ': {') >= 0));
/* Y son exactamente los del motor: si la UI inventara un estado que
   `auditar()` nunca devuelve, ese caso no se pintaría jamás y nadie se
   enteraría. */
check('y son exactamente los del motor',
  Object.keys(C.ESTADOS).every(k => semNorm.indexOf(k + ': {') >= 0) &&
  Object.keys(C.ESTADOS).length === 5, Object.keys(C.ESTADOS).join(','));
check('y usa los tonos AA del punto 15, no colores sueltos',
  /zona-exito/.test(diagSrc3) && /zona-peligro/.test(diagSrc3));
/* Sin bloque `torneo` la card no se pinta: una card diciendo 'no hay
   nada configurado' en los clubes que no lo usan es ruido permanente. */
check('sin proyección la card no se pinta',
  /function diagBloqueCertificacion[\s\S]{0,900}if \(!proy\) return '';/.test(diagSrc3));
/* Solo se arma el índice de los tramos VINCULADOS: construir uno no es
   gratis y los no vinculados no se auditan. */
check('solo construye el índice de los tramos vinculados',
  /const idxDe = \(clave\) => \{[\s\S]{0,200}if \(!hojas \|\| !clave\) return null;/.test(diagSrc3));
check('y lo cachea, para no rearmarlo por tramo repetido',
  /cache\[clave\] !== undefined/.test(diagSrc3));
/* Certificar a mitad de camino sellaría una foto que cambia mañana. */
check('el botón de certificar solo sale con el tramo completo y sin sello',
  /const puede = f\.certificable && !f\.sello;/.test(diagSrc3));
/* El sello va al JSON, no a localStorage: es un hito administrativo que
   el resto del cuerpo técnico tiene que ver, y git es la trazabilidad. */
check('certificar NO escribe solo: deja el bloque para commitear',
  /function diagCertificar[\s\S]{0,900}selloNuevo/.test(diagSrc3) &&
  !/function diagCertificar[\s\S]{0,900}localStorage/.test(diagSrc3));

tit2('LA PRECONFIGURACIÓN REAL DE DEPORTIVO');
const jDep2 = JSON.parse(fs.readFileSync('./clubes/deportivo.json', 'utf8'));
const pDep = C.proyeccion(jDep2, 'deportivo-primera-2026');
check('la categoría se resuelve por la planilla del catálogo', !!pDep);
check('declara sus dos tramos con el vínculo explícito',
  pDep.categoria.tramos.every(t => !!t.clave), JSON.stringify(pDep.categoria.tramos.map(t => t.clave)));
check('y todavía no hay nada certificado',
  Object.keys(pDep.categoria.certificacion).length === 0);
/* Los otros dos clubes no declaran torneo, y eso tiene que seguir siendo
   válido: la preconfiguración es opcional, como todo lo demás. */
['reconquista', 'jujuy'].forEach(id => {
  const j = JSON.parse(fs.readFileSync('./clubes/' + id + '.json', 'utf8'));
  check(id + ' sin bloque torneo sigue siendo válido', C.parsearProyeccion(j) === null);
});
console.log('\n' + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
