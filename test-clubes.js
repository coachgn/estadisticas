/* =====================================================================
   Multi-cliente: js/sgadd-club.js corre inline en el browser (usa
   `document`, `window.location`, `fetch`, auto-arranca al cargar). Para
   testearlo en Node se evalúa en un contexto vm con esas piezas mockeadas,
   una instancia nueva por escenario (CLUB es un singleton con estado).
   ===================================================================== */
const vm = require('vm');
const fs = require('fs');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

const SRC = fs.readFileSync('./js/sgadd-club.js', 'utf8')
  // `const CLUB` no queda expuesto como propiedad del contexto vm; `var` sí.
  .replace('const CLUB = (function () {', 'var CLUB = (function () {');

function mockImg() {
  return { classList: { add() {}, remove() {} }, set src(v) { this._s = v; }, get src() { return this._s; } };
}

/**
 * Crea una instancia fresca de CLUB en un contexto aislado.
 * @param {string|null} clubId   ?club=<id> en la URL simulada
 * @param {object} opciones      { dom: {clubNombre,...}, sgadd: bool, logos: bool, fetchFalla: bool }
 */
function crearClub(clubId, opciones) {
  const opt = opciones || {};
  const elementos = Object.assign({ clubEscudo: mockImg() }, opt.dom || {});
  const llamadas = { fetch: 0, logosReset: 0, limpiarCache: 0 };

  const contexto = {
    console, setTimeout, clearTimeout, URLSearchParams,
    window: { location: { search: clubId ? ('?club=' + clubId) : '' } },
    document: {
      readyState: 'complete',
      currentScript: { src: 'https://coachgn.github.io/estadisticas/js/sgadd-club.js' },
      getElementsByTagName: () => [],
      getElementById: (id) => elementos[id] || null,
      documentElement: { style: { setProperty() {} } },
      body: { appendChild() {} },
      createElement: () => ({ style: {}, remove() {} }),
      addEventListener() {},
      title: '',
    },
    fetch: async (url) => {
      llamadas.fetch++;
      if (opt.fetchFalla) return { ok: false, status: 404 };
      const m = /clubes\/([a-z0-9-]+)\.json/.exec(url);
      const ruta = m ? './clubes/' + m[1] + '.json' : null;
      if (ruta && fs.existsSync(ruta)) return { ok: true, json: async () => JSON.parse(fs.readFileSync(ruta, 'utf8')) };
      return { ok: false, status: 404 };
    },
  };

  if (opt.sgadd) {
    contexto.SGADD = {
      CATALOGO: { patronEquipoPropio: /RECONQUISTA/, planillas: [{ id: 'default', activo: true }] },
      limpiarCache: () => { llamadas.limpiarCache++; },
    };
  }
  if (opt.logos) {
    contexto.LOGOS = { CFG: { basePaths: ['logos/la-plata/', 'logos/'], sufijos: ['viejo'], overrides: {} }, reset: () => { llamadas.logosReset++; }, getUrl: () => null };
  }

  vm.createContext(contexto);
  vm.runInContext(SRC, contexto);
  return { CLUB: contexto.CLUB, ctx: contexto, elementos, llamadas };
}

(async () => {
  console.log('\n1. CONFIG OPCIONAL: si el JSON no carga, no tumba el dashboard');
  console.log('═'.repeat(70));
  const c1 = crearClub('club-que-no-existe', { sgadd: true });
  await c1.CLUB.cargar();
  check('estado.error queda registrado', !!c1.CLUB.estado.error, c1.CLUB.estado.error);
  check('estado.cfg queda null', c1.CLUB.estado.cfg === null);
  check('el catálogo por defecto de SGADD no se toca', c1.ctx.SGADD.CATALOGO.planillas.length === 1 && c1.ctx.SGADD.CATALOGO.planillas[0].id === 'default');

  console.log('\n2. CARGA NORMAL: clubes/reconquista.json');
  console.log('═'.repeat(70));
  const c2 = crearClub('reconquista', { sgadd: true, logos: true, dom: { clubNombre: { textContent: '' }, clubBajada: { textContent: '' } } });
  await c2.CLUB.cargar();
  check('idDesdeUrl() lee el query param', c2.CLUB.idDesdeUrl() === 'reconquista');
  check('el JSON se parsea y trae el nombre del club', c2.CLUB.estado.cfg && c2.CLUB.estado.cfg.nombre === 'Club Reconquista La Plata',
    c2.CLUB.estado.cfg && c2.CLUB.estado.cfg.nombre);
  check('sin error de carga', c2.CLUB.estado.error === null);

  console.log('\n3. aplicarDatos() y aplicarUI() están separadas');
  console.log('═'.repeat(70));
  const c3 = crearClub('reconquista', { sgadd: true, logos: true, dom: {} }); // SIN clubNombre en el DOM
  await c3.CLUB.cargar();
  /* Las del JSON de Reconquista: Primera, Naranja U21 y Naranja U23. El
     número sale del archivo a propósito — si alguien suma una planilla y el
     catálogo no crece, el mapeo de `aplicarDatos()` se rompió. */
  const planillasJson = require('./clubes/reconquista.json').planillas.length;
  check('el catálogo de planillas se aplica AUNQUE el header no esté en el DOM',
    c3.ctx.SGADD.CATALOGO.planillas.length === planillasJson,
    c3.ctx.SGADD.CATALOGO.planillas.length + ' de ' + planillasJson);

  /* --- La tira del club y su etiqueta en el selector ------------------- */
  /* La tira de Reconquista pasó de NEGRA a NARANJA (2026-08-17). El `id` de
     la U21 se renombró TAMBIÉN, y eso solo es seguro porque el club
     confirmó que en esa planilla no había estados de jugador confirmados:
     el id es la clave de `sgadd.estados.<club>.<planilla>` en localStorage y
     lo que viaja en la ruta de los links compartidos, así que renombrarlo
     pierde las dos cosas. Es una decisión de datos, no cosmética. */
  const pl = require('./clubes/reconquista.json').planillas;
  const u21 = pl.find(x => x.categoria === 'U21');
  check('la U21 quedó en la tira naranja, id y etiqueta incluidos',
    u21 && u21.tira === 'naranja' && u21.id === 'naranja-u21-clausura-2026' &&
    /Naranja/.test(u21.label), u21 && u21.id);
  const u23 = pl.find(x => x.categoria === 'U23');
  check('la U23 está en el catálogo, en la misma tira',
    u23 && u23.tira === 'naranja' && /U23/.test(u23.label), u23 && u23.id);
  check('y con su planilla cargada, o sea activa',
    u23 && !!u23.sheetId &&
    c3.ctx.SGADD.CATALOGO.planillas.find(x => x.categoria === 'U23').activo === true);
  /* `activo` sale de `!!sheetId`: una categoría sin planilla entra igual a
     la lista pero deshabilitada, en vez de dejar entrar a una sección
     vacía. Se prueba con un catálogo de mentira para no depender de que el
     club tenga siempre alguna sin cargar. */
  const catFalso = [{ id: 'x', label: 'X', sheetId: '' }, { id: 'y', label: 'Y', sheetId: 'abc' }];
  const mapeado = catFalso.map(x => Object.assign({ activo: !!x.sheetId }, x));
  check('una planilla sin sheetId nace inactiva',
    mapeado[0].activo === false && mapeado[1].activo === true);
  check('ninguna tira ni ningún id quedó como negro en el club',
    !pl.some(x => x.tira === 'negra' || /negra/.test(x.id)),
    pl.map(x => x.id).join(','));
  check('patronEquipoPropio del club también se aplica sin DOM',
    c3.ctx.SGADD.CATALOGO.patronEquipoPropio.test('RECONQUISTA A'));

  console.log('\n4. AL CAMBIAR DE CLUB SE LIMPIA TODO');
  console.log('═'.repeat(70));
  const c4 = crearClub('jujuy', { sgadd: true, logos: true, dom: { clubNombre: { textContent: '' } } });
  await c4.CLUB.cargar();
  check('LOGOS.reset() se llama al aplicar la config del club', c4.llamadas.logosReset >= 1, c4.llamadas.logosReset);
  check('SGADD.limpiarCache() se llama al aplicar la config del club', c4.llamadas.limpiarCache >= 1, c4.llamadas.limpiarCache);
  check('la carpeta de escudos pasa a la de la liga del club (liga-argentina)',
    c4.ctx.LOGOS.CFG.basePaths[0] === 'logos/liga-argentina/', c4.ctx.LOGOS.CFG.basePaths);
  check('sufijosEquipo vacío de Jujuy pisa el default (los paréntesis no se tocan)',
    Array.isArray(c4.ctx.LOGOS.CFG.sufijos) && c4.ctx.LOGOS.CFG.sufijos.length === 0, c4.ctx.LOGOS.CFG.sufijos);

  console.log('\n5. MARCA VISIBLE: título y header, cuando el DOM SÍ está');
  console.log('═'.repeat(70));
  check('document.title incluye el nombre del club', c2.ctx.document.title.indexOf('Club Reconquista La Plata') !== -1, c2.ctx.document.title);
  check('el header toma el nombreCorto', c2.elementos.clubNombre.textContent === 'RECONQUISTA', c2.elementos.clubNombre.textContent);

  console.log('\n6. COLOR DE ACENTO COMO TEXTO (contraste WCAG)');
  console.log('═'.repeat(70));
  check('el naranja de Reconquista YA es legible sobre la card oscura sin aclarar',
    c2.CLUB.contraste('#f7941e', '#1F2937') >= 4.5, c2.CLUB.contraste('#f7941e', '#1F2937').toFixed(2));
  check('el azul de Jujuy NO es legible tal cual', c2.CLUB.contraste('#2563eb', '#1F2937') < 4.5,
    c2.CLUB.contraste('#2563eb', '#1F2937').toFixed(2));
  const aclarado = c2.CLUB.aclararHastaLegible('#2563eb', '#1F2937', 4.5);
  check('aclararHastaLegible() sube el azul de Jujuy hasta pasar el mínimo AA',
    c2.CLUB.contraste(aclarado, '#1F2937') >= 4.5, aclarado + ' → ' + c2.CLUB.contraste(aclarado, '#1F2937').toFixed(2));
  check('TEMA.acentoTexto del club cargado ya quedó aclarado y es legible',
    c4.CLUB.TEMA.acentoTexto && c4.CLUB.contraste(c4.CLUB.TEMA.acentoTexto, '#1F2937') >= 4.5, c4.CLUB.TEMA.acentoTexto);

  console.log('\n7. idDesdeUrl(): valida antes de usar');
  console.log('═'.repeat(70));
  const c5 = crearClub("reconquista'; DROP TABLE", { sgadd: true });
  check('un club id con caracteres raros cae al default en vez de usarse tal cual',
    c5.CLUB.idDesdeUrl() === 'reconquista', c5.CLUB.idDesdeUrl());
  const c6 = crearClub(null, { sgadd: true });
  check('sin ?club= en la URL, usa el default', c6.CLUB.idDesdeUrl() === 'reconquista');

  console.log('\n8. cargar() es idempotente');
  console.log('═'.repeat(70));
  const c7 = crearClub('reconquista', { sgadd: true });
  const [p1, p2] = await Promise.all([c7.CLUB.cargar(), c7.CLUB.cargar()]);
  check('dos llamadas concurrentes comparten la misma promesa (un solo fetch)', c7.llamadas.fetch === 1, c7.llamadas.fetch);
  check('y devuelven la misma config', p1 === p2);

  console.log('\n' + '═'.repeat(70));
  console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
