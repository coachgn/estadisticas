/* =====================================================================
   Resolución de escudos.

   LOGOS vive inline en index.html (no hay build), así que se extrae en
   tiempo de ejecución a logos-extraido.js. Es temporal: se genera, se usa
   y se borra. No commitear ese archivo (ver CLAUDE.md).
   ===================================================================== */
const fs = require('fs');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

/* --- Extracción del módulo LOGOS desde index.html --- */
const EXTRAIDO = './logos-extraido.js';
function extraer() {
  const html = fs.readFileSync('./index.html', 'utf8');
  const marca = 'const LOGOS = (function () {';
  const ini = html.indexOf(marca);
  if (ini === -1) throw new Error('No se encontró "' + marca + '" en index.html: ¿cambió la firma del módulo?');
  const cierre = html.slice(ini).search(/\n\}\)\(\);/);
  if (cierre === -1) throw new Error('No se encontró el cierre de la IIFE de LOGOS');
  const fin = ini + cierre + '\n})();'.length;
  const codigo = html.slice(ini, fin) + '\nmodule.exports = { LOGOS };\n';
  fs.writeFileSync(EXTRAIDO, codigo);
}

/* --- Mocks de entorno browser --- */
const ARCHIVOS = new Set([
  'logos/la-plata/reconquista-a.png',
  'logos/la-plata/astillero.webp',
  'logos/liga-argentina/hindu-c.jfif',
]);
let peticiones = [];
let manifiestoMock = null;   // { ok, json } por prueba

global.fetch = async (u) => {
  peticiones.push(u);
  if (manifiestoMock && u.indexOf('index.json') !== -1) return manifiestoMock;
  return { ok: false, status: 404 };
};
global.Image = class {
  set src(v) {
    peticiones.push(v);
    this._s = v;
    setTimeout(() => {
      if (ARCHIVOS.has(v)) { this.naturalWidth = 128; this.complete = true; this.onload && this.onload(); }
      else this.onerror && this.onerror();
    }, 0);
  }
  get src() { return this._s; }
};
global.document = { createElement: () => ({ style: {}, appendChild() {}, remove() {} }), head: { appendChild() {} } };
global.window = {};

extraer();
const realLog = console.log; console.log = () => {};
const { LOGOS: L } = require('./logos-extraido.js');
console.log = realLog;
fs.unlinkSync(EXTRAIDO);

(async () => {
  console.log('\n1. NORMALIZACIÓN Y SLUGS');
  console.log('─'.repeat(70));
  L.CFG.sufijos = ["\\s*-\\s*(MM|MF|U\\d{1,2}\\s*[MF]?)\\s*$"];
  check('descarta el sufijo de categoría', L.normalizar("RECONQUISTA 'A' - MM") === 'RECONQUISTA A',
    L.normalizar("RECONQUISTA 'A' - MM"));
  check('saca acentos y uppercasea', L.normalizar('Náutico') === 'NAUTICO', L.normalizar('Náutico'));
  check('slug queda en minúsculas con guiones', L.slug("RECONQUISTA 'A' - MM") === 'reconquista-a',
    L.slug("RECONQUISTA 'A' - MM"));
  check('iniciales toma las dos primeras palabras', L.iniciales('Club Atletico Platense') === 'CA',
    L.iniciales('Club Atletico Platense'));
  check('iniciales no rompe con nombre vacío', L.iniciales('') === '?', L.iniciales(''));

  console.log('\n2. CASCADA DE RESOLUCIÓN');
  console.log('─'.repeat(70));
  L.reset();
  L.CFG.basePaths = ['logos/la-plata/', 'logos/'];
  L.CFG.overrides = {};
  peticiones = [];
  console.log = () => {}; const r1 = await L.resolver(["RECONQUISTA 'A' - MM"]); console.log = realLog;
  check('encuentra el archivo en la carpeta de la liga', L.getUrl("RECONQUISTA 'A' - MM") === 'logos/la-plata/reconquista-a.png',
    L.getUrl("RECONQUISTA 'A' - MM"));
  check('resolver() cuenta encontrados/total', r1.encontrados === 1 && r1.total === 1, JSON.stringify(r1));
  check('getImage() devuelve el elemento ya cargado', !!L.getImage("RECONQUISTA 'A' - MM"));

  L.reset();
  console.log = () => {}; const r2 = await L.resolver(['EQUIPO FANTASMA']); console.log = realLog;
  check('equipo sin archivo queda en faltantes', r2.faltantes.indexOf('EQUIPO FANTASMA') !== -1, JSON.stringify(r2.faltantes));
  check('getUrl() de un equipo no resuelto da null', L.getUrl('EQUIPO FANTASMA') === null);

  console.log('\n3. OVERRIDES MANUALES (máxima prioridad)');
  console.log('─'.repeat(70));
  L.reset();
  L.CFG.overrides = { ASTILLERO: 'logos/la-plata/astillero.webp' };
  peticiones = [];
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  check('el override gana aunque el archivo real también matchee',
    L.getUrl('ASTILLERO') === 'logos/la-plata/astillero.webp', L.getUrl('ASTILLERO'));
  const imgs = peticiones.filter(p => p.indexOf('index.json') === -1);
  check('el override es el primer candidato de imagen probado (gana el índice más bajo)',
    imgs[0] === 'logos/la-plata/astillero.webp', imgs[0]);

  console.log('\n4. MANIFIESTO (logos/<liga>/index.json)');
  console.log('─'.repeat(70));
  L.reset();
  L.CFG.overrides = {};
  L.CFG.basePaths = ['logos/liga-argentina/', 'logos/'];
  manifiestoMock = { ok: true, json: async () => ({ 'hindu c': 'hindu-c.jfif' }) };
  console.log = () => {}; await L.resolver(['HINDU (C)']); console.log = realLog;
  manifiestoMock = null;
  check('el manifiesto resuelve directo sin sondear extensiones',
    L.getUrl('HINDU (C)') === 'logos/liga-argentina/hindu-c.jfif', L.getUrl('HINDU (C)'));

  console.log('\n5. AISLAMIENTO ENTRE CLUBES (reset)');
  console.log('─'.repeat(70));
  L.reset();
  check('reset() deja la cache vacía', L.getUrl("RECONQUISTA 'A' - MM") === null);
  L.CFG.basePaths = ['logos/la-plata/', 'logos/'];
  console.log = () => {}; await L.resolver(["RECONQUISTA 'A' - MM"]); console.log = realLog;
  check('vuelve a resolver normalmente después de reset()',
    L.getUrl("RECONQUISTA 'A' - MM") === 'logos/la-plata/reconquista-a.png');

  console.log('\n6. CALLBACKS Y DIAGNÓSTICO');
  console.log('─'.repeat(70));
  let avisado = false;
  L.alResolver(() => { avisado = true; });
  L.reset();
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  check('alResolver() se dispara después de cada tanda', avisado === true);
  check('generarManifiesto() sin resolver nada explica por qué, no da {} mudo',
    L.reset() || L.generarManifiesto().indexOf('{') === -1, L.generarManifiesto());
  L.CFG.basePaths = ['logos/la-plata/', 'logos/'];
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  const manifiestoGenerado = JSON.parse(L.generarManifiesto());
  check('generarManifiesto() da JSON válido con lo ya resuelto',
    manifiestoGenerado['astillero'] === 'astillero.webp', L.generarManifiesto());

  console.log('\n' + '═'.repeat(70));
  console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
