/* =====================================================================
   Test de aislamiento ENTRE LIGAS.

   El riesgo real del multi-cliente: la clave del cache de escudos es el
   nombre normalizado del equipo. Si dos ligas tienen un "ATENAS" cada una
   con escudo distinto, sin reset() el segundo club ve el escudo del primero.

   No inventa equipos: usa nombres genéricos A/B para probar el MECANISMO.
   ===================================================================== */
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

/* LOGOS vive inline en index.html: se extrae en tiempo de ejecución a un
   archivo temporal (se genera, se usa acá abajo y se borra). No commitear
   logos-extraido.js. */
const fs = require('fs');
const EXTRAIDO = './logos-extraido.js';
(function extraer() {
  const html = fs.readFileSync('./index.html', 'utf8');
  const marca = 'const LOGOS = (function () {';
  const ini = html.indexOf(marca);
  if (ini === -1) throw new Error('No se encontró "' + marca + '" en index.html: ¿cambió la firma del módulo?');
  const cierre = html.slice(ini).search(/\n\}\)\(\);/);
  if (cierre === -1) throw new Error('No se encontró el cierre de la IIFE de LOGOS');
  const fin = ini + cierre + '\n})();'.length;
  fs.writeFileSync(EXTRAIDO, html.slice(ini, fin) + '\nmodule.exports = { LOGOS };\n');
})();

const ARCHIVOS = ['logos/liga-a/atenas.png', 'logos/liga-b/atenas.png'];
let pedidos = [];

global.fetch = async (u) => { pedidos.push(u); return { ok: false, status: 404 }; };
global.Image = class {
  set src(v) { pedidos.push(v); setTimeout(() => {
    if (ARCHIVOS.indexOf(v) !== -1) { this.naturalWidth = 128; this.complete = true; this.onload && this.onload(); }
    else this.onerror && this.onerror(); }, 0); }
  get src() { return this._s; } decode() { return Promise.reject(); }
};
global.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {} }), head: { appendChild() {} } };
global.window = {};
const realLog = console.log; console.log = () => {};
const L = require('./logos-extraido.js').LOGOS;
console.log = realLog;
fs.unlinkSync(EXTRAIDO);

(async () => {
  console.log('\n1. SUFIJOS POR LIGA');
  console.log('─'.repeat(68));

  L.CFG.sufijos = ["\\s*-\\s*(MM|MF|U\\d{1,2}\\s*[MF]?)\\s*$"];
  check('La Plata: "- U21M" se descarta', L.normalizar("RECONQUISTA 'A' - U21M") === 'RECONQUISTA A',
    L.normalizar("RECONQUISTA 'A' - U21M"));

  L.CFG.sufijos = [];
  check('sin sufijos configurados, el nombre queda entero',
    L.normalizar('OBRAS BASKET') === 'OBRAS BASKET', L.normalizar('OBRAS BASKET'));
  check('y no rompe con nombres que contienen "MM"',
    L.normalizar('COMUNICACIONES') === 'COMUNICACIONES', L.normalizar('COMUNICACIONES'));

  L.CFG.sufijos = ["\\s*\\(.*\\)\\s*$"];
  check('otra liga, otra convención: descarta "(A)"',
    L.normalizar('QUIMSA (A)') === 'QUIMSA', L.normalizar('QUIMSA'));

  console.log('\n2. CONTAMINACIÓN ENTRE LIGAS');
  console.log('─'.repeat(68));

  L.CFG.sufijos = [];
  L.CFG.basePaths = ['logos/liga-a/', 'logos/'];
  console.log = () => {}; await L.resolver(['ATENAS']); console.log = realLog;
  const urlA = L.getUrl('ATENAS');
  check('club A resuelve a su carpeta', urlA === 'logos/liga-a/atenas.png', urlA);

  // Cambio de club SIN limpiar: el bug.
  L.CFG.basePaths = ['logos/liga-b/', 'logos/'];
  check('SIN reset() devuelve el escudo de la liga anterior (bug)',
    L.getUrl('ATENAS') === 'logos/liga-a/atenas.png', L.getUrl('ATENAS'));

  // Con reset: correcto.
  L.reset();
  check('después de reset() la cache queda vacía', L.getUrl('ATENAS') === null, String(L.getUrl('ATENAS')));
  console.log = () => {}; await L.resolver(['ATENAS']); console.log = realLog;
  check('y ahora resuelve a la carpeta del club B',
    L.getUrl('ATENAS') === 'logos/liga-b/atenas.png', L.getUrl('ATENAS'));

  console.log('\n3. OVERRIDES MANUALES');
  console.log('─'.repeat(68));
  L.reset();
  L.CFG.basePaths = ['logos/liga-b/', 'logos/'];
  L.CFG.overrides = { 'CLUB CON NOMBRE RARO': 'logos/liga-b/atenas.png' };
  console.log = () => {}; await L.resolver(['CLUB CON NOMBRE RARO']); console.log = realLog;
  check('un alias del JSON gana sobre la búsqueda automática',
    L.getUrl('CLUB CON NOMBRE RARO') === 'logos/liga-b/atenas.png', L.getUrl('CLUB CON NOMBRE RARO'));

  console.log('\n' + '═'.repeat(68));
  console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
