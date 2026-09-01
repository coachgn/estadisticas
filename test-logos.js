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

  /* -----------------------------------------------------------------
     EL AVISO SOLO CUANDO LLEGA ALGO NUEVO

     Cuelgue real reportado por el club: al cambiar de categoría, Chrome
     decía "la página no responde". El ciclo:

       drawOrtgDrtgChart() → LOGOS.resolver() → alResolverFns →
       renderSection('principal') → drawOrtgDrtgChart() → …

     Con todo ya en caché esas promesas resuelven en microtasks, así que
     el bucle nunca cede el hilo. Si no entró ningún escudo nuevo no hay
     nada que repintar: la segunda vuelta no avisa y el ciclo se corta.
     ----------------------------------------------------------------- */
  let avisos = 0;
  L.reset();
  L.CFG.basePaths = ['logos/la-plata/', 'logos/'];
  L.alResolver(() => { avisos++; });
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  const trasPrimera = avisos;
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  check('la segunda tanda con TODO cacheado no vuelve a avisar',
    avisos === trasPrimera, 'avisos ' + trasPrimera + ' → ' + avisos);
  /* Y un equipo nuevo SÍ tiene que avisar: si no, los escudos que llegan
     tarde no se pintarían nunca, que es para lo que existe el hook. */
  console.log = () => {}; await L.resolver(['ASTILLERO', "RECONQUISTA 'A' - MM"]); console.log = realLog;
  check('pero un escudo nuevo sí dispara el repintado',
    avisos > trasPrimera, 'avisos ' + trasPrimera + ' → ' + avisos);
  /* Los que NO tienen archivo tampoco pueden avisar en cada vuelta. */
  const antesFaltante = avisos;
  console.log = () => {}; await L.resolver(['EQUIPO QUE NO EXISTE']); console.log = realLog;
  const trasFaltante = avisos;
  console.log = () => {}; await L.resolver(['EQUIPO QUE NO EXISTE']); console.log = realLog;
  check('un equipo sin archivo avisa a lo sumo una vez, no en cada tanda',
    avisos === trasFaltante, 'avisos ' + antesFaltante + ' → ' + trasFaltante + ' → ' + avisos);
  check('generarManifiesto() sin resolver nada explica por qué, no da {} mudo',
    L.reset() || L.generarManifiesto().indexOf('{') === -1, L.generarManifiesto());
  L.CFG.basePaths = ['logos/la-plata/', 'logos/'];
  console.log = () => {}; await L.resolver(['ASTILLERO']); console.log = realLog;
  const manifiestoGenerado = JSON.parse(L.generarManifiesto());
  check('generarManifiesto() da JSON válido con lo ya resuelto',
    manifiestoGenerado['astillero'] === 'astillero.webp', L.generarManifiesto());

  /* -----------------------------------------------------------------
     EL MANIFIESTO NO PUEDE APUNTAR A ARCHIVOS QUE NO EXISTEN

     Pasó de verdad: al subir los escudos de la U23 por la web de GitHub
     se renombró `atenas-a.jpg` y se borraron `reconquista-a.png` y
     `banco-provincia-a.webp`, pero el manifiesto seguía apuntando a los
     nombres viejos. Resultado: la U23 ganó sus escudos y PRIMERA perdió
     tres, sin ningún aviso — el panel de faltantes solo mira la
     categoría abierta.
     ----------------------------------------------------------------- */
  console.log('\n7. MANIFIESTOS DEL REPO');
  console.log('─'.repeat(70));
  const ligas = fs.readdirSync('./logos').filter(d => {
    try { return fs.statSync('./logos/' + d).isDirectory(); } catch (e) { return false; }
  });
  check('hay al menos una liga con escudos', ligas.length > 0, ligas.join(','));
  ligas.forEach(liga => {
    const dir = './logos/' + liga;
    const ruta = dir + '/index.json';
    if (!fs.existsSync(ruta)) return;
    const archivos = fs.readdirSync(dir).filter(f => f !== 'index.json');
    let man = null;
    try { man = JSON.parse(fs.readFileSync(ruta, 'utf8')); }
    catch (e) { check(liga + ': index.json es JSON válido', false, e.message); return; }
    const rotas = Object.keys(man).filter(k => archivos.indexOf(man[k]) === -1);
    check(liga + ': ninguna entrada del manifiesto apunta a un archivo inexistente',
      rotas.length === 0, rotas.map(k => k + ' → ' + man[k]).join(' | '));
  });

  console.log('\n' + '═'.repeat(70));
  /* =====================================================================
   UN ARCHIVO CON NOMBRE GENÉRICO SE LO ROBA EL CLUB EQUIVOCADO

   El resolutor prueba recortes del nombre cuando no hay match exacto, así
   que un archivo llamado `deportivo.png` se lo lleva CUALQUIER club que
   empiece con esa palabra. Pasó al sumar el cliente DEPORTIVO: en su libro
   juegan DEPORTIVO LA PLATA y DEPORTIVO SAN VICENTE, y los dos aparecían
   en la grilla con el mismo escudo — sin figurar en el panel de faltantes,
   porque para el resolutor estaba resuelto.

   El escudo de un club se llama como el club entero.
   ===================================================================== */
console.log('\nNOMBRES DE ARCHIVO QUE COLISIONAN');
console.log('═'.repeat(70));

const archivos = fs.readdirSync('./logos/la-plata').filter(f => !/\.json$/.test(f));
const base = (f) => f.replace(/\.[^.]+$/, '');

/* Dos archivos donde uno es prefijo del otro se pisan entre sí. */
const colisiones = [];
archivos.forEach(a => archivos.forEach(b => {
  if (a === b) return;
  if (base(b).indexOf(base(a) + '-') === 0) colisiones.push(base(a) + ' <- ' + base(b));
}));
check('ningún escudo tiene un nombre que sea prefijo de otro',
  colisiones.length === 0, colisiones.join(' · '));

/* El caso concreto, por si alguien vuelve a acortar el nombre. */
/* Se mira el NOMBRE, no la extension: el club cambia los archivos por la
   web de GitHub y un .png puede volver como .webp sin que eso sea un error.
   Lo que no puede volver es el generico. */
check('el escudo de Deportivo La Plata lleva el nombre completo',
  archivos.some(f => base(f) === 'deportivo-la-plata') &&
  !archivos.some(f => base(f) === 'deportivo'),
  archivos.filter(f => /deportivo/.test(f)).join(','));

/* =====================================================================
   EL LOGO DEL PRODUCTO · que el archivo no venga recortado

   `generar-logo.js` tomaba el CUADRADO CENTRAL de un original 3:2 y
   tiraba 77 px de contenido a la izquierda y 75 a la derecha. Se veía
   como un logo mal encuadrado dentro de su aro, y ninguna cantidad de
   padding en el CSS lo podía arreglar: lo que faltaba no estaba en el
   archivo.

   Se mide sobre el PNG generado, decodificándolo con `zlib` — que es lo
   mismo que hace el generador — en vez de confiar en que el script hizo
   lo que dice.
   ===================================================================== */
console.log(String.fromCharCode(10) + 'EL LOGO GENERADO · sin recortes' + String.fromCharCode(10) + '─'.repeat(70));

{
  const zlib = require('zlib');

  /* Decodifica un PNG RGBA de 8 bits sin interlace. Alcanza para los que
     escribe `generar-logo.js`, que es el único caso que se mide acá. */
  function leerPng(ruta) {
    const d = fs.readFileSync(ruta);
    const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
    let idat = Buffer.alloc(0), i = 8;
    while (i < d.length) {
      const len = d.readUInt32BE(i);
      if (d.toString('latin1', i + 4, i + 8) === 'IDAT') {
        idat = Buffer.concat([idat, d.slice(i + 8, i + 8 + len)]);
      }
      i += 12 + len;
    }
    const raw = zlib.inflateSync(idat);
    const stride = w * 4, px = Buffer.alloc(w * h * 4);
    let prev = Buffer.alloc(stride), o = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[o]; o++;
      const line = Buffer.from(raw.slice(o, o + stride)); o += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
        if (f === 1) line[x] = (line[x] + a) & 255;
        else if (f === 2) line[x] = (line[x] + b) & 255;
        else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          line[x] = (line[x] + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c))) & 255;
        }
      }
      line.copy(px, y * stride); prev = line;
    }
    return { w: w, h: h, px: px };
  }

  const im = leerPng('./logos/motorlogo-64.png');
  check('el logo generado es cuadrado', im.w === 64 && im.h === 64, im.w + 'x' + im.h);

  /* Los límites del dibujo dentro del PNG. */
  let x0 = im.w, x1 = -1, y0 = im.h, y1 = -1;
  for (let y = 0; y < im.h; y++) {
    for (let x = 0; x < im.w; x++) {
      if (im.px[(y * im.w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }

  /* EL DIBUJO LLEGA AL BORDE A LO ANCHO. Es la señal de que no quedó aire
     transparente adentro del archivo: el respiro lo pone el CSS, que es
     donde se puede ajustar sin regenerar nada. */
  check('el dibujo aprovecha todo el ancho del PNG',
    x0 === 0 && x1 === im.w - 1, x0 + '-' + x1);
  /* Y NO llega al borde a lo alto: es 3:2, así que el cuadrado le sobra
     arriba y abajo. Si llegara, estaría deformado o recortado. */
  check('y NO a lo alto, porque es 3:2 y entra entero',
    y0 > 0 && y1 < im.h - 1, y0 + '-' + y1);

  /* EL ASPECTO QUE SE CONSERVA ES EL DEL DIBUJO, no el del lienzo.

     El original mide 1536x1024 (1,5) pero trae aire transparente a los
     costados: el dibujo ocupa 1176x954, o sea 1,233. Ese es el que tiene
     que sobrevivir — comparar contra el 1,5 del lienzo daria un test que
     falla justo porque el generador hace bien su trabajo. */
  const alto = y1 - y0 + 1;
  const aspecto = im.w / alto;
  check('conserva el aspecto del DIBUJO (1176x954 = 1,233)',
    Math.abs(aspecto - 1176 / 954) < 0.05, aspecto.toFixed(3));

  /* CUÁNTO SE CORTA DENTRO DEL ARO CIRCULAR, medido sobre los píxeles
     opacos y no sobre el recuadro: las esquinas son transparentes, así que
     el recuadro exagera. Con el padding del CSS no se pierde ninguno.

     El aro mide 48 px y el `img` lleva `padding: 5px` con `box-sizing:
     border-box`, así que el dibujo se dibuja dentro de 38. */
  function cortados(im2, lado) {
    const R = 24;                     // radio del aro de 48 px
    const s = Math.min(lado / im2.w, lado / im2.h);
    let fuera = 0;
    for (let y = 0; y < im2.h; y++) {
      for (let x = 0; x < im2.w; x++) {
        if (im2.px[(y * im2.w + x) * 4 + 3] <= 10) continue;
        const dx = (x - im2.w / 2 + 0.5) * s, dy = (y - im2.h / 2 + 0.5) * s;
        if (Math.sqrt(dx * dx + dy * dy) > R) fuera++;
      }
    }
    return fuera;
  }
  check('con el padding del CSS no se corta ni un píxel',
    cortados(im, 38) === 0, cortados(im, 38) + ' píxeles fuera del círculo');
  /* Y sin padding SÍ se cortaría: es lo que justifica que el padding esté. */
  check('sin padding sí se cortaría, que es para lo que está',
    cortados(im, 48) > 0, cortados(im, 48));

  const gen = fs.readFileSync('./generar-logo.js', 'utf8');
  check('el generador ya no recorta el cuadrado central',
    !/const corte = Math\.min\(img\.ancho, img\.alto\)/.test(gen));
  check('y descarta el aire transparente antes de encajar',
    /function recorteDelDibujo/.test(gen));

  /* EL LOGO VA ARRIBA DEL DISCO en la pantalla de carga, y en el HTML: ese
     bloque se pinta ANTES de que corra un solo script. */
  const idxL = fs.readFileSync('./index.html', 'utf8');
  const loader = idxL.slice(idxL.indexOf('<div id="loader"'), idxL.indexOf('APP SHELL'));
  check('la pantalla de carga muestra el logo',
    /motorlogo-128\.png/.test(loader));
  check('y va ARRIBA del disco que gira',
    loader.indexOf('motorlogo') < loader.indexOf('animate-spin-slow'));
}

console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
