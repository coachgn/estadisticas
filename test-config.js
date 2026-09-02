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
/* EL MEDIO DE LA TABLA VA SIN ZONA, Y ES A PROPÓSITO.

   El formato real del club (2026-08-30) es 1-2 Ascenso, 3-4 Repechaje y
   los dos últimos Descenso: del 5 al 10 no pasa nada, así que pintarlos
   sería inventar una zona que el torneo no tiene. El test viejo exigía
   que las zonas cubrieran la tabla entera —cierto para el formato
   anterior, con Playoffs 1-8— y esa no es una propiedad del sistema. */
const zonasDep = C.zonasDeTabla(fDep, 12);
check('el ascenso se lleva los dos primeros',
  zonasDep[0] && zonasDep[1] && zonasDep[0].id === 'campeon' && zonasDep[1].id === 'campeon');
check('el repechaje, el 3 y el 4',
  zonasDep[2] && zonasDep[3] && zonasDep[2].id === 'repechaje' && zonasDep[3].id === 'repechaje');
check('el medio de la tabla queda sin zona',
  zonasDep.slice(4, 10).every(z => z === null));
check('y el descenso son los dos últimos',
  zonasDep[10] && zonasDep[11] && zonasDep[10].id === 'descenso' && zonasDep[11].id === 'descenso');

/* El `desde: -2` se corre solo si cambia la cantidad de equipos, que es el
   motivo entero de los índices negativos: con un 11 fijo, el día que entre
   una categoría de 13 el descenso queda corrido SIN ningún síntoma. */
check('con 14 equipos el descenso sigue siendo los dos últimos',
  C.zonasDeTabla(fDep, 14).slice(12).every(z => z && z.id === 'descenso'));
/* Un club que NO declara competencia sigue siendo válido: la config es
   opcional y su ausencia no puede dejar la tabla vacía (punto 6).

   La lista se deriva del ARCHIVO, no se escribe a mano. Cuando estaba
   fija —`['reconquista', 'jujuy']`— este test se puso en rojo el día que
   Reconquista sumó sus zonas: un club configurándose es exactamente lo
   que el producto espera que pase, y el test lo trataba como una
   regresión. Lo que hay que fijar es la REGLA (con bloque parsea, sin
   bloque devuelve null), no qué clubes lo tienen hoy. */
['reconquista', 'jujuy', 'deportivo'].forEach((id) => {
  const j = JSON.parse(fs.readFileSync('./clubes/' + id + '.json', 'utf8'));
  if (j.competencia) {
    check(id + ' declara competencia y el motor la parsea', C.parsear(j) !== null);
  } else {
    check(id + ' sin bloque competencia sigue siendo válido', C.parsear(j) === null);
  }
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
  preconfiguracion: {
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
JSON_MAL.preconfiguracion.categorias['primera-caballeros'].tramos[0].equiposEsperados = 12;
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
JSON_CERT.preconfiguracion.categorias['primera-caballeros'].certificacion = { 'super-8': sello };
const pC = C.proyeccion(JSON_CERT, 'primera-caballeros');
const rC = C.auditar(pC, () => idxSuper8, { tramosDelLibro: LIBRO });
check('con el libro igual al sello queda CERTIFICADO',
  rC[0].estado === C.ESTADOS.CERTIFICADO, rC[0].estado);
check('y muestra la fecha del sello', /2026-09-14/.test(rC[0].detalle), rC[0].detalle);

/* UN TRAMO CERTIFICADO NO SE VUELVE A JUZGAR CONTRA LA PROYECCIÓN. Si el
   torneo cerró con 8 equipos, que la entrevista dijera 12 ya no importa:
   es un hecho histórico. Lo que sí importa es si el libro cambió. */
const JSON_CERT_MAL = JSON.parse(JSON.stringify(JSON_CERT));
JSON_CERT_MAL.preconfiguracion.categorias['primera-caballeros'].tramos[0].equiposEsperados = 12;
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
JSON_ZONAS.preconfiguracion.categorias['primera-caballeros'].competencia = {
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
/* Se compara contra las claves del MOTOR y no contra una lista fija: un
   estado nuevo en `auditar()` que la UI no sepa pintar no se vería
   jamás, y una lista hardcodeada acá no lo cazaría. Ya pasó al sumar
   DESVIO_CALENDARIO. */
check('el semáforo declara TODOS los estados del motor',
  Object.keys(C.ESTADOS).every(k => semNorm.indexOf(k + ': {') >= 0),
  Object.keys(C.ESTADOS).filter(k => semNorm.indexOf(k + ': {') === -1).join(',') || 'todos');
/* Y son exactamente los del motor: si la UI inventara un estado que
   `auditar()` nunca devuelve, ese caso no se pintaría jamás y nadie se
   enteraría. */
check('y la UI no inventa ninguno que el motor no devuelva',
  (semNorm.match(/^  [A-Z_]+: \{ icono/gm) || []).length === Object.keys(C.ESTADOS).length,
  Object.keys(C.ESTADOS).join(','));
check('y usa los tonos AA del punto 15, no colores sueltos',
  /zona-exito/.test(diagSrc3) && /zona-peligro/.test(diagSrc3));
/* Sin bloque `torneo` la card no se pinta: una card diciendo 'no hay
   nada configurado' en los clubes que no lo usan es ruido permanente. */
/* ESTA REGLA CAMBIÓ. Antes la card no se pintaba sin proyección, punto.
   Pero eso la dejaba callada justo en el caso que importa: el club
   conecta una hoja nueva, el DT la abre, funciona… y nadie declaró su
   torneo. Ahora la card aparece igual para mostrar el hueco.

   Lo que se conserva es que un club que NO usa la preconfiguración no
   ve nada: eso sigue siendo config opcional. */
check('sin proyección Y sin bloque torneo la card no se pinta',
  /if \(!proy && !cob\.declarado\) return '';/.test(diagSrc3));
check('pero con bloque declarado sí aparece, para mostrar el hueco',
  /La categoría abierta no tiene torneo declarado/.test(diagSrc3));
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
/* Ida quedó SELLADA el 2026-08-26. Ojo con el detalle: se selló con 64
   partidos cuando el tramo declara 11 fechas (66), así que la huella
   congeló un libro incompleto — y cuando entren los 2 que faltan el
   semáforo va a pasar a DIVERGENTE. Es el motor haciendo su trabajo. */
check('Ida está sellada y Vuelta no: el sello es POR TRAMO',
  !!pDep.categoria.certificacion.ida && !pDep.categoria.certificacion.vuelta,
  Object.keys(pDep.categoria.certificacion).join(','));
/* Los otros dos clubes no declaran torneo, y eso tiene que seguir siendo
   válido: la preconfiguración es opcional, como todo lo demás. */
['reconquista', 'jujuy'].forEach(id => {
  const j = JSON.parse(fs.readFileSync('./clubes/' + id + '.json', 'utf8'));
  check(id + ' sin bloque torneo sigue siendo válido', C.parsearProyeccion(j) === null);
});
tit2('VENTANA TEMPORAL · el calendario como red de contención');

/* Los box scores llegan con la etiqueta de torneo incompleta o mal
   tipeada más seguido de lo que uno querría. El calendario es el
   desempate natural: si el partido se jugó el 14/09 y el Clausura va de
   agosto a noviembre, es del Clausura. */
const TRAMOS_CAL = [
  { id: 'apertura', clave: 'APERTURA|REGULAR',
    ventana: { desde: new Date(2026, 2, 1), hasta: new Date(2026, 5, 30) } },
  { id: 'clausura', clave: 'CLAUSURA|REGULAR',
    ventana: { desde: new Date(2026, 7, 1), hasta: new Date(2026, 10, 30) } },
];
const aso = (clave, f) => C.asociarTramoPorFecha(TRAMOS_CAL, clave, f);

check('un partido sin etiqueta se asocia por su fecha',
  aso('', '2026-09-14').tramo.id === 'clausura', JSON.stringify(aso('', '2026-09-14')));
check('y el motivo dice que lo dedujo el calendario',
  aso('', '2026-09-14').motivo === 'calendario');
check('la otra ventana también',
  aso('', '2026-04-20').tramo.id === 'apertura');

/* LA ETIQUETA GANA SIEMPRE. El calendario es un RESPALDO para lo que no
   viene etiquetado, no una corrección de lo que sí viene: pisar un dato
   explícito con una inferencia es lo que este proyecto no hace. */
const conEtiqueta = aso('APERTURA|REGULAR', '2026-09-14');
check('una fila etiquetada NO se corrige por más que la fecha diga otra cosa',
  conEtiqueta.tramo.id === 'apertura' && conEtiqueta.motivo === 'etiqueta',
  JSON.stringify(conEtiqueta));

/* UNA FECHA EN DOS VENTANAS NO SE ASOCIA. Un partido mal atribuido
   contamina los promedios de DOS tramos a la vez y no se nota. */
const PISADOS = [
  { id: 'a', ventana: { desde: new Date(2026, 0, 1), hasta: new Date(2026, 11, 31) } },
  { id: 'b', ventana: { desde: new Date(2026, 5, 1), hasta: new Date(2026, 6, 31) } },
];
const amb = C.asociarTramoPorFecha(PISADOS, '', '2026-06-15');
check('si cae en dos ventanas NO se elige ninguna',
  amb.tramo === null && amb.motivo === 'ambiguo', JSON.stringify(amb));
check('y se nombran los candidatos, para poder arreglar el calendario',
  amb.candidatos.join() === 'a,b', JSON.stringify(amb.candidatos));

check('sin caer en ninguna ventana queda fuera, no se inventa',
  aso('', '2026-07-15').tramo === null && aso('', '2026-07-15').motivo === 'fuera');
check('sin fecha tampoco se adivina',
  aso('', '').motivo === 'sin-fecha' && aso('', 'no es fecha').motivo === 'sin-fecha');
check('una lista de tramos vacía no revienta',
  C.asociarTramoPorFecha([], '', '2026-09-14').tramo === null);
check('ni una lista que no es lista',
  C.asociarTramoPorFecha(null, '', '2026-09-14').tramo === null);

/* Formatos de fecha: el mismo criterio que el núcleo — dd/mm/aaaa con el
   DÍA primero, que es como viene de Liga Argentina. */
check('lee ISO y dd/mm/aaaa, con el día primero',
  aso('', '2026-09-14').tramo.id === 'clausura' &&
  aso('', '14/09/2026').tramo.id === 'clausura');
check('y una ventana con las puntas invertidas no se aplica',
  C.asociarTramoPorFecha([{ id: 'x',
    ventana: { desde: new Date(2026, 5, 1), hasta: new Date(2026, 1, 1), invertida: true } },
  ], '', '2026-04-01').tramo === null);

tit2('DESVÍO DE CALENDARIO · se reporta, no se corrige');

/* Un partido etiquetado con un tramo pero con la fecha fuera de SU
   ventana. No hay nada que inferir —la etiqueta manda— pero sí algo que
   avisar: o la fecha está mal o el calendario quedó viejo. */
function idxConFechas(fechas) {
  return { lista: () => [{ clave: 'A', nombre: 'A',
    partidos: fechas.map((f, i) => ({ __id: 'p' + i, __fecha: f, PARTIDO: 'A vs B' })) }] };
}
const TRAMO_VENT = { id: 'apertura',
  ventana: { desde: new Date(2026, 2, 1), hasta: new Date(2026, 5, 30), invertida: false } };
check('sin desvíos devuelve lista vacía',
  C.desviosDeCalendario(TRAMO_VENT,
    idxConFechas([new Date(2026, 3, 10), new Date(2026, 4, 5)])).length === 0);
check('un partido fuera de la ventana se reporta',
  C.desviosDeCalendario(TRAMO_VENT,
    idxConFechas([new Date(2026, 3, 10), new Date(2026, 8, 1)])).length === 1);
/* Un partido SIN fecha no es un desvío: es un dato ausente, y ya lo
   denuncia el guard de FECHA del punto 3 quater. */
check('un partido sin fecha no cuenta como desvío',
  C.desviosDeCalendario(TRAMO_VENT, idxConFechas([null, new Date(2026, 3, 10)])).length === 0);
check('un tramo sin ventana no puede tener desvíos',
  C.desviosDeCalendario({ id: 'x' }, idxConFechas([new Date(2026, 8, 1)])).length === 0);

/* Y el estado entra al semáforo. Va DESPUÉS de las aserciones de tamaño:
   un tramo con la cantidad de equipos mal es un problema más grande que
   uno con una fecha corrida. */
check('DESVIO_CALENDARIO es un estado del semáforo',
  C.ESTADOS.DESVIO_CALENDARIO === 'DESVIO_CALENDARIO');

tit2('LA VENTANA EN EL SCHEMA');
const JSON_VENT = {
  preconfiguracion: { cliente: 'X', categorias: { c: {
    label: 'C', ventanaTemporal: { desde: '2026-01-01', hasta: '2026-12-31' },
    tramos: [
      { id: 'con-propia', label: 'Con propia', clave: 'A|R',
        ventanaTemporal: { desde: '2026-03-01', hasta: '2026-06-30' } },
      { id: 'sin-propia', label: 'Sin propia', clave: 'B|R' },
    ] } } },
};
const pV = C.proyeccion(JSON_VENT, 'c');
check('un tramo con ventana propia la usa',
  pV.categoria.tramos[0].ventanaPropia === true &&
  pV.categoria.tramos[0].ventana.desde.getMonth() === 2);
/* Sin fechas propias HEREDA la de la categoría, que suele ser la
   temporada entera: es mejor una ventana amplia que ninguna. */
check('uno sin ventana propia hereda la de la categoría',
  pV.categoria.tramos[1].ventanaPropia === false &&
  pV.categoria.tramos[1].ventana.desde.getMonth() === 0);
check('y sin fechas por ningún lado queda en null, no se inventa una',
  C.proyeccion({ preconfiguracion: { categorias: { c: { tramos: [{ id: 't' }] } } } }, 'c')
    .categoria.tramos[0].ventana === null);

tit2('LA PESTAÑA TORNEO');
const uiSrc2 = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
check('la pantalla tiene las dos pestañas',
  /Zonas de la tabla/.test(uiSrc2) && /Torneo \/ Preconfiguración/.test(uiSrc2));
/* Los dos borradores viven separados: son dos bloques distintos del JSON
   y mezclarlos obligaría a commitear los dos para publicar uno. */
check('el borrador del torneo es independiente del de zonas',
  /proy: null,/.test(uiSrc2) && /proySucia: false,/.test(uiSrc2));
check('se guarda bajo su propia clave',
  /configClubId\(\) \+ '\.preconfig'/.test(uiSrc2));
/* NADA de desplegables con nombres preconcebidos: si la UI ofreciera
   'Ida / Vuelta / Apertura' volvería a meter el hardcodeo que el schema
   evita. Los nombres se escriben. */
check('los nombres se escriben, no se eligen de una lista',
  !/<option[^>]*>\s*(Ida|Vuelta|Apertura|Clausura)\s*</i.test(uiSrc2));
check('hay selectores de fecha de verdad',
  /type="date"[\s\S]{0,200}configTramoCampo\(\$\{i\}, 'desde'/.test(uiSrc2));
check('y campos de equipos y fechas esperadas',
  /'equiposEsperados'/.test(uiSrc2) && /'fechasEsperadas'/.test(uiSrc2));
check('hay línea de tiempo',
  /function configTimelineHTML/.test(uiSrc2) && /configTimeline/.test(uiSrc2));
/* La línea de tiempo tiene que denunciar las superposiciones: son
   justamente el caso en que el calendario no puede desempatar. */
check('y denuncia los tramos que se pisan',
  /Se superponen/.test(uiSrc2));
/* Tipear no repinta: le sacaría el foco al input. */
check('tipear refresca solo la línea de tiempo',
  cuerpoDe(uiSrc2, 'configTramoCampo').indexOf('configPintarTimeline()') >= 0);
check('y NO repinta la pantalla entera',
  cuerpoDe(uiSrc2, 'configTramoCampo')
    .replace(/configPintarTimeline\(\)/g, '').indexOf('configPintar()') === -1);
/* La clave del libro se PROPONE, nunca se aplica sola. */
check('proponer una clave avisa que hay que revisarla',
  /Revisala antes de guardar/.test(uiSrc2));

/* Las tres acciones hacen cosas distintas y la diferencia importa: un DT
   que las confunda cree que publicó algo que no publicó. */
check('guardar aclara que es SOLO este navegador y dispositivo',
  /SOLO en este navegador y en este dispositivo/.test(uiSrc2));
check('exportar aclara que recién ahí le llega al resto',
  /recién ahí le llega al resto/i.test(uiSrc2));
check('restablecer aclara que descarta el borrador local',
  /descartó el borrador local/.test(uiSrc2));
check('y las tres están explicadas en la pantalla, no solo en el tooltip',
  /localStorage<\/span>, solo en este dispositivo/.test(uiSrc2));

tit2('LAS VENTANAS REALES DE DEPORTIVO');
const pDep2 = C.proyeccion(
  JSON.parse(fs.readFileSync('./clubes/deportivo.json', 'utf8')), 'deportivo-primera-2026');
check('los dos tramos declaran ventana',
  pDep2.categoria.tramos.every(t => !!t.ventana));
/* Los rangos salen del LIBRO, no de la imaginación: el primer partido de
   IDA es del 07/05 y el último del 16/07. */
check('la ventana de Ida contiene su primer y último partido reales',
  C.enVentana(C._aDia('2026-05-07'), pDep2.categoria.tramos[0].ventana) &&
  C.enVentana(C._aDia('2026-07-16'), pDep2.categoria.tramos[0].ventana));
check('y la de Vuelta arranca cuando arrancó de verdad',
  C.enVentana(C._aDia('2026-08-06'), pDep2.categoria.tramos[1].ventana));
check('las dos no se superponen: el calendario puede desempatar',
  !C.enVentana(C._aDia('2026-08-06'), pDep2.categoria.tramos[0].ventana) &&
  !C.enVentana(C._aDia('2026-05-07'), pDep2.categoria.tramos[1].ventana));
tit2('COBERTURA DEL CATÁLOGO · un libro por categoría');

/* Cada categoría de un club es un LIBRO APARTE, con su propio sheetId, y
   se dan de alta de a una a medida que el club decide sumarlas. Eso abre
   un hueco que no se ve solo: una planilla nueva entra al catálogo, el DT
   la elige en el selector y funciona… pero nadie declaró su torneo, así
   que no tiene calendario, ni zonas, ni auditoría. Y NO FALLA: no hay
   nada que contrastar. Callarse ahí es lo peor que puede hacer una
   auditoría. */
const CAT_BASE = {
  preconfiguracion: { cliente: 'X', categorias: {
    'primera': { label: 'Primera', planilla: 'club-primera', tramos: [] },
  } },
};
const PL = [
  { id: 'club-primera', label: 'Primera', sheetId: 'AAA' },
];

const cob1 = C.cobertura(CAT_BASE, PL);
check('una planilla declarada figura como cubierta',
  cob1.cubiertas.length === 1 && cob1.cubiertas[0].categoria === 'primera');
check('y no hay huecos', !cob1.sinDeclarar.length && !cob1.sinLibro.length);

/* EL CASO DEL LAND AND EXPAND: el club conecta una hoja nueva y todavía
   no la preconfiguró. */
const cob2 = C.cobertura(CAT_BASE, PL.concat([
  { id: 'club-u17', label: 'U17', sheetId: 'BBB' }]));
check('un libro conectado sin torneo declarado se denuncia',
  cob2.sinDeclarar.length === 1 && cob2.sinDeclarar[0].planilla === 'club-u17',
  JSON.stringify(cob2.sinDeclarar));
check('y no toca a la que sí está declarada',
  cob2.cubiertas.length === 1 && cob2.cubiertas[0].planilla === 'club-primera');

/* Una planilla SIN sheetId todavía no es un libro: está en el catálogo
   como "viene en camino" y pedirle preconfiguración sería ruido. */
const cob3 = C.cobertura(CAT_BASE, PL.concat([
  { id: 'club-femenino', label: 'Femenino', sheetId: '' }]));
check('una planilla sin sheetId no se reclama',
  cob3.sinDeclarar.length === 0, JSON.stringify(cob3.sinDeclarar));

/* El sentido inverso, que es OTRO error: se declaró una categoría para
   una hoja que no está en el catálogo. O el id está mal escrito, o la
   hoja todavía no se conectó. */
const CAT_FANTASMA = JSON.parse(JSON.stringify(CAT_BASE));
CAT_FANTASMA.preconfiguracion.categorias['femenino'] = {
  label: 'Femenino', planilla: 'club-femenino-2026', tramos: [] };
const cob4 = C.cobertura(CAT_FANTASMA, PL);
check('una categoría que apunta a una planilla inexistente se denuncia',
  cob4.sinLibro.length === 1 && cob4.sinLibro[0].categoria === 'femenino',
  JSON.stringify(cob4.sinLibro));

/* Un club que todavía no usa la preconfiguración no tiene huecos: es
   config OPCIONAL y reclamarle algo sería ruido permanente. */
const cobSin = C.cobertura({ id: 'x', planillas: [] }, PL);
check('un club sin bloque torneo no se reclama',
  cobSin.declarado === false && !cobSin.sinDeclarar.length);
check('cobertura sin planillas no revienta',
  C.cobertura(CAT_BASE, null).cubiertas.length === 0);

/* AISLAMIENTO. Cada categoría se resuelve sola: pedir una NUNCA puede
   devolver los tramos de otra. Es lo que impide que el calendario de
   Primera pise al de las formativas. */
const DOS_CAT = { preconfiguracion: { categorias: {
  'a': { label: 'A', planilla: 'pa', tramos: [
    { id: 'ta', label: 'Tramo A', clave: 'A|R' }] },
  'b': { label: 'B', planilla: 'pb', tramos: [
    { id: 'tb1', label: 'Tramo B1', clave: 'B1|R' },
    { id: 'tb2', label: 'Tramo B2', clave: 'B2|R' }] },
} } };
const pa = C.proyeccion(DOS_CAT, 'pa'), pb = C.proyeccion(DOS_CAT, 'pb');
check('cada categoría trae SOLO sus tramos',
  pa.categoria.tramos.length === 1 && pb.categoria.tramos.length === 2);
check('y ninguno de la otra',
  pa.categoria.tramos.every(t => t.id.indexOf('tb') === -1) &&
  pb.categoria.tramos.every(t => t.id !== 'ta'));
/* Las certificaciones tampoco se cruzan: viven adentro de su categoría. */
const CERT_CRUZ = JSON.parse(JSON.stringify(DOS_CAT));
CERT_CRUZ.preconfiguracion.categorias.a.certificacion = { ta: { fecha: '2026-01-01', hash: 'zzz' } };
check('un sello de una categoría no aparece en la otra',
  !!C.proyeccion(CERT_CRUZ, 'pa').categoria.certificacion.ta &&
  Object.keys(C.proyeccion(CERT_CRUZ, 'pb').categoria.certificacion).length === 0);
/* Y las zonas: cada categoría puede tener su propio formato sin que el
   de una se aplique a la otra. */
const ZONAS_CRUZ = JSON.parse(JSON.stringify(DOS_CAT));
ZONAS_CRUZ.preconfiguracion.categorias.a.competencia = {
  formatos: { f: { zonas: [{ id: 'z', desde: 1, hasta: 4, tono: 'exito' }] } },
  porTramo: { '*': 'f' } };
check('las zonas de una categoría no alcanzan a la otra',
  !!C.proyeccion(ZONAS_CRUZ, 'pa').categoria.competencia &&
  C.proyeccion(ZONAS_CRUZ, 'pb').categoria.competencia === null);

/* El Diagnóstico tiene que MOSTRAR el hueco, no callarlo. */
const diagSrc4 = fs.readFileSync('./js/sgadd-diagnostico.js', 'utf8');
check('el Diagnóstico cruza el catálogo contra lo declarado',
  /SGADD_CONFIG\.cobertura\(cfgClub, planillas\)/.test(diagSrc4));
check('y muestra la card aunque la planilla abierta no esté declarada',
  /if \(!proy && !cob\.declarado\) return '';/.test(diagSrc4));
check('nombrando los libros sin torneo declarado',
  /NADIE declaró su torneo/.test(diagSrc4));
check('y las categorías que apuntan a una hoja que no existe',
  /no está en el catálogo/.test(diagSrc4));

tit2('LA PESTAÑA TORNEO SE ABRE EN CUALQUIER CLUB');

/* EL BUG QUE ESTO FIJA, porque no se ve venir leyendo el código.

   El JSON del club ya tenía un campo `torneo`: un STRING con el nombre
   del torneo ('TORNEO LOCAL', 'CONFERENCIA NORTE') que alimenta
   `CATALOGO.planillas[].torneo`. El bloque de preconfiguración se bautizó
   con esa misma clave, así que:

     · en DEPORTIVO convivían las dos y ganaba la última — el nombre del
       torneo desaparecía sin que nadie lo notara;
     · en Reconquista y Jujuy, que solo tienen el string, la pestaña
       reventaba con `Cannot convert undefined or null to object` al
       pedirle `.categorias` a un texto. Muerta justo en los clubes que
       MÁS la necesitan: los que todavía no configuraron nada.

   Por eso el test NO se conforma con leer el fuente: RENDERIZA la pestaña
   de verdad en un vm y falla si tira. Un grep sobre el código no habría
   cazado esto nunca. */
function pantallaConfig(cfgClub, planillaAbierta) {
  const SRC = fs.readFileSync('./js/sgadd-configui.js', 'utf8');
  const guardado = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Math, Date, RegExp, isNaN, parseInt, parseFloat,
    SGADD_CONFIG: C,
    SGADD_UI: {
      esc: (v) => String(v === undefined || v === null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'),
      escJs: (v) => String(v === undefined || v === null ? '' : v)
        .replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
      cargando: () => '',
    },
    CLUB: { cfg: cfgClub, estado: { id: 'clubtest' } },
    SGADD: { planilla: (id) => (planillaAbierta && planillaAbierta.id === id) ? planillaAbierta : null },
    SGADD_APP: {
      estado: { planillaId: planillaAbierta ? planillaAbierta.id : null,
                torneo: 'IDA', fase: 'REGULAR' },
      reindexar() {}, indice: () => null,
    },
    localStorage: {
      getItem: (k) => (k in guardado ? guardado[k] : null),
      setItem: (k, v) => { guardado[k] = String(v); },
      removeItem: (k) => { delete guardado[k]; },
    },
    document: { getElementById: () => null, querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'sgadd-configui.js' });
  /* Un repintado real toca el DOM y acá no hay: se anula, que es
     exactamente lo que hace falta para poder ejercer las acciones. */
  vm.runInContext('configPintar = function () {};', ctx);
  return {
    ctx,
    pintar: () => vm.runInContext('configPestanaTorneo()', ctx),
    correr: (js) => vm.runInContext(js, ctx),
  };
}

const PLANILLA = { id: 'primera-2026', label: 'Primera 2026', activo: true };

/* --- 1 · el club QUE SÍ declaró (forma de DEPORTIVO) --------------- */
const CON_BLOQUE = {
  nombre: 'Club Test',
  torneo: 'TORNEO LOCAL',          // ← el string viejo, tiene que convivir
  preconfiguracion: {
    cliente: 'Club Test', categorias: {
      'primera-2026': { label: 'Primera 2026', planilla: 'primera-2026',
        tramos: [{ id: 'ida', label: 'Ida', clave: 'IDA|REGULAR' }] } }
  }
};
let pantT = pantallaConfig(CON_BLOQUE, PLANILLA);
let htmlT = '';
let tiroT = null;
try { htmlT = pantT.pintar(); } catch (e) { tiroT = e; }
check('con bloque declarado, la pestaña pinta sin tirar', tiroT === null, tiroT && tiroT.message);
check('y muestra la categoría declarada', /Primera 2026/.test(htmlT));
check('sin caer en el estado vacío', !/No hay categorías preconfiguradas/.test(htmlT));

/* --- 2 · el club que NO declaró (forma de Reconquista / Jujuy) ----- */
[
  ['solo el string viejo', { nombre: 'C', torneo: 'TORNEO LOCAL' }],
  ['sin ningún campo', { nombre: 'C' }],
  ['con el bloque en basura', { nombre: 'C', preconfiguracion: 'TORNEO LOCAL' }],
  ['con el bloque en un array', { nombre: 'C', preconfiguracion: [] }],
  ['con el bloque vacío', { nombre: 'C', preconfiguracion: {} }],
].forEach(([nom, cfg]) => {
  const p2 = pantallaConfig(cfg, PLANILLA);
  let h = '', err = null;
  try { h = p2.pintar(); } catch (e) { err = e; }
  check(nom + ' · la pestaña abre sin tirar', err === null, err && err.message);
  check(nom + ' · muestra el estado vacío', /No hay categorías preconfiguradas/.test(h));
  check(nom + ' · con el botón para empezar', /Agregar primera categoría/.test(h));
});

/* --- 3 · y desde el estado vacío se puede EDITAR ------------------- */
pantT = pantallaConfig({ nombre: 'C', torneo: 'TORNEO LOCAL' }, PLANILLA);
pantT.correr('configCatAgregar()');
htmlT = pantT.pintar();
check('agregar la primera categoría deja la pestaña utilizable',
  !/No hay categorías preconfiguradas/.test(htmlT));
/* SEMILLA: el id sale de la planilla ABIERTA, que es el dato que ata la
   categoría a su libro. No es un nombre asumido — lo escribió el club en
   su propio catálogo. Los nombres del TORNEO se siguen escribiendo. */
check('y la siembra con la planilla abierta, no con un nombre inventado',
  pantT.correr('CONFIGUI.proy.categorias["primera-2026"].planilla') === 'primera-2026');
check('sin inventarle un solo tramo',
  pantT.correr('CONFIGUI.proy.categorias["primera-2026"].tramos.length') === 0);
check('y queda marcada como sucia, para que el DT sepa que falta guardar',
  pantT.correr('CONFIGUI.proySucia') === true);

/* Sin planilla abierta NO se inventa el vínculo: queda en blanco y el
   usuario lo escribe. Es la misma regla que `sugerirClave()`. */
pantT = pantallaConfig({ nombre: 'C' }, null);
pantT.correr('configCatAgregar()');
check('sin planilla abierta, el vínculo queda vacío en vez de inventado',
  pantT.correr('Object.keys(CONFIGUI.proy.categorias)[0]') === 'categoria' &&
  pantT.correr('CONFIGUI.proy.categorias.categoria.planilla') === '');

/* --- 4 · la colisión de claves, fijada en los JSON reales ---------- */
['reconquista', 'jujuy', 'deportivo'].forEach(id => {
  const crudo = fs.readFileSync('./clubes/' + id + '.json', 'utf8');
  const veces = (crudo.match(/^\s*"torneo":/gm) || []).length;
  check(id + ' declara el `torneo` (nombre) una sola vez', veces <= 1, veces);
  const j = JSON.parse(crudo);
  check(id + ' conserva el nombre del torneo',
    j.torneo === undefined || typeof j.torneo === 'string', typeof j.torneo);
  check(id + ' · la preconfiguración es un objeto o no está',
    j.preconfiguracion === undefined ||
    (typeof j.preconfiguracion === 'object' && !Array.isArray(j.preconfiguracion)));
});


tit2('EL SELLO REAL DE IDA');
const jDep3 = JSON.parse(fs.readFileSync('./clubes/deportivo.json', 'utf8'));
const pDep3 = C.proyeccion(jDep3, 'deportivo-primera-2026');
check('Ida quedó certificada', !!pDep3.categoria.certificacion.ida);
check('con su huella completa',
  pDep3.categoria.certificacion.ida.equipos === 12 &&
  pDep3.categoria.certificacion.ida.partidos === 64 &&
  !!pDep3.categoria.certificacion.ida.hash);
/* Y Vuelta NO: sellar es por tramo, no por categoría. */
check('y Vuelta sigue sin sellar',
  !pDep3.categoria.certificacion.vuelta);
/* =====================================================================
   LOS COLORES DE PLAN DE LA LANDING

   Cada plan lleva SU metal y no un tono del semáforo: verde y amarillo
   significan «bien» y «atención» en todo el panel, y un plan no es mejor
   ni peor — es otro. Se miden acá porque acá está `CLUB.contraste`, la
   misma función con la que se validan los tonos de zona y los acentos.
   ===================================================================== */
titulo('LOS METALES DE LOS PLANES · contraste AA');

{
  const LAN = require('./js/sgadd-landing.js');
  /* El fondo de la tarjeta de cupos, definido a mano en el <style>. */
  const FONDO = '#1b1b1b';
  const esperados = { Bronce: '#CD7F32', Plata: '#C0C0C0', Oro: '#FFD700' };

  check('los tres planes traen su color de metal',
    LAN.PLANES_MAILS.every(p => esperados[p.nombre] === p.color),
    LAN.PLANES_MAILS.map(p => p.nombre + '=' + p.color).join(' '));
  check('y ninguno usa un tono del semáforo',
    LAN.PLANES_MAILS.every(p => !p.tono));

  LAN.PLANES_MAILS.forEach((p) => {
    const c = CLUB.contraste(p.color, FONDO);
    check('  ' + p.nombre + ' pasa AA sobre la tarjeta', c >= 4.5, c.toFixed(2));
  });

  /* Y los cupos son los que el club declaró. Están acá y no en el motor de
     permisos porque HOY NO SE HACEN CUMPLIR: es la condición comercial
     escrita, no un límite que el sistema imponga. */
  check('los cupos son 2 · 3 · 4',
    LAN.PLANES_MAILS.map(p => p.mails).join(',') === '2,3,4',
    LAN.PLANES_MAILS.map(p => p.mails).join(','));
}

console.log('\n' + (fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
