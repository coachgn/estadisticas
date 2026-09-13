/* =====================================================================
   LA PESTAÑA JUGADORES SE PINTA EN EL ACTO

   Reportado el 2026-09-12: al entrar a Jugadores la sección aparecía
   vacía y solo un F5 la arreglaba. Dos causas, las dos medidas en
   producción, y las dos se EJERCEN acá sobre el código real (en un `vm`),
   no se leen del fuente:

     1 · EL FILTRO VIEJO. El equipo elegido vive en el estado de la sección
         y sobrevive al cambio de categoría. Elegido «RECONQUISTA A» en
         Primera y pasado a la U23 —donde se llama «RECONQUISTA»—, la
         grilla escondía el selector y no había plantel: vacía hasta F5,
         que reinicia el estado.
     2 · EL CUADRO VACÍO. `buildJugadores` devolvía la barra sola y la
         grilla llegaba recién cuando `cargar()` corría en un `setTimeout`,
         aunque el índice ya estuviera en memoria.

   Los temporizadores de este `vm` NO corren solos: si la sección se pinta
   antes de soltarlos, es que no depende de ellos.
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

const SGADD = require('./js/sgadd-core.js');

function armar(opciones) {
  const o = opciones || {};
  const equipos = new Map((o.equipos || ['RECONQUISTA', 'ATENAS']).map(k => [k, { clave: k, nombre: k }]));
  const idx = o.sinIndice ? null : { get: (k) => equipos.get(k), lista: () => Array.from(equipos.values()), liga: { jugadores: [] } };
  const root = { innerHTML: '', escrituras: 0 };
  const timers = [];
  const ctx = {
    console, Promise, JSON, Math, Date, Map, Set, Array, Object, String, Number, RegExp,
    SGADD: SGADD,
    window: { location: { hash: o.hash || '#jugadores' } },
    location: { hash: o.hash || '#jugadores' },
    history: { pushState() {}, replaceState() {} },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout() {},
    document: {
      getElementById: (id) => (id === 'jugadoresRoot' ? root : null),
      querySelector: () => null, querySelectorAll: () => [],
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('./js/sgadd-jugadores.js', 'utf8'), ctx, { filename: 'sgadd-jugadores.js' });
  let cargas = 0;
  Object.defineProperty(root, 'innerHTML', {
    get() { return this._h || ''; }, set(v) { this._h = v; this.escrituras++; },
  });
  Object.assign(ctx, {
    currentSection: 'jugadores',
    SGADD_APP: {
      estado: { idx: idx, planillaId: 'naranja-u23', fase: 'REGULAR', torneo: 'GENERAL' },
      inicializar() {}, cargar() { cargas++; return Promise.resolve(); },
      barra: () => '<div class="barra"></div>', avisoMuestra: () => '',
      aplicarTorneoRuta() {}, planillaActual: () => ({ label: 'U23' }),
    },
    SGADD_UI: { cargando: () => '<p>Cargando…</p>', aviso: () => '' },
    SGADD_CHARTS: { limpiar() {}, dibujarPendientes() {} },
    SGADD_AUTH: { puedeVerEquipo: () => true },
    /* Lo que se mide es QUÉ decide pintar la sección, no el HTML de la
       grilla —eso ya lo cubre test-jugadores.js—. */
    jugadoresGrilla: () => '<GRILLA filtro=' + vm.runInContext('JUGADORES.filtroEquipo', ctx) + '>',
    jugadoresFicha: () => '<FICHA>',
  });
  return { ctx, root, timers, cargas: () => cargas, J: () => vm.runInContext('JUGADORES', ctx) };
}

(async () => {

  /* =====================================================================
     1 · EL RENDER INMEDIATO
     ===================================================================== */
  titulo('1 · CON EL ÍNDICE EN MEMORIA, LA GRILLA SALE SIN ESPERAR A NADIE');

  {
    const t = armar();
    const html = t.ctx.buildJugadores();
    t.root.innerHTML = html;                         // lo que hace renderSection
    check('el build devuelve la raíz de la sección', /id="jugadoresRoot"/.test(html));
    await Promise.resolve(); await Promise.resolve();
    check('la grilla ya está pintada ANTES de que corra un solo temporizador',
      /<GRILLA/.test(t.root.innerHTML), t.root.innerHTML);
    check('(el temporizador de cargar() todavía no corrió)', t.cargas() === 0 && t.timers.length === 1);
    check('en la misma vuelta del event loop: una escritura de la barra y una de la grilla', t.root.escrituras === 2);
    t.timers.forEach(f => f());
    check('y la carga igual se dispara, para refrescar lo que haga falta', t.cargas() === 1);
  }

  {
    const t = armar({ sinIndice: true });
    t.root.innerHTML = t.ctx.buildJugadores();
    await Promise.resolve(); await Promise.resolve();
    check('sin índice no se inventa nada: queda la barra y espera a cargar()',
      !/<GRILLA/.test(t.root.innerHTML) && t.timers.length === 1);
  }

  {
    const t = armar();
    t.root.innerHTML = t.ctx.buildJugadores();
    t.ctx.currentSection = 'equipos';                // el DT ya se fue
    await Promise.resolve(); await Promise.resolve();
    check('si el DT cambió de sección en el medio, no pinta encima de otra', !/<GRILLA/.test(t.root.innerHTML));
  }

  /* =====================================================================
     2 · EL FILTRO QUE NO EXISTE EN ESTE LIBRO
     ===================================================================== */
  titulo('2 · UN EQUIPO ELEGIDO QUE NO ESTÁ EN LA CATEGORÍA SE SUELTA');

  {
    const t = armar({ equipos: ['RECONQUISTA', 'ATENAS'] });
    t.J().filtroEquipo = "RECONQUISTA A";            // elegido en Primera
    t.ctx.jugadoresPintar();
    check('el filtro de otra categoría se suelta', t.J().filtroEquipo === null, t.J().filtroEquipo);
    check('y la grilla sale con el selector completo, no vacía',
      t.root.innerHTML.indexOf('<GRILLA filtro=null>') !== -1, t.root.innerHTML);
  }

  {
    const t = armar({ equipos: ['RECONQUISTA A', 'ATENAS A'] });
    t.J().filtroEquipo = 'RECONQUISTA A';
    t.ctx.jugadoresPintar();
    check('un filtro que SÍ existe se respeta', t.J().filtroEquipo === 'RECONQUISTA A'
      && t.root.innerHTML.indexOf('<GRILLA filtro=RECONQUISTA A>') !== -1);
  }

  {
    const t = armar({ equipos: ['RECONQUISTA'] });
    t.J().filtroEquipo = 'RECONQUISTA A';
    t.ctx.jugadoresPintar();
    check('no se adivina el equivalente: «RECONQUISTA A» no pasa a «RECONQUISTA»',
      t.J().filtroEquipo === null);
  }

  /* Y a través del camino real: entrar a la sección con el filtro viejo. */
  {
    const t = armar({ equipos: ['RECONQUISTA'] });
    t.J().filtroEquipo = 'RECONQUISTA A';
    t.root.innerHTML = t.ctx.buildJugadores();
    await Promise.resolve(); await Promise.resolve();
    check('entrando a la pestaña después de cambiar de categoría, se ve la grilla sin F5',
      t.root.innerHTML.indexOf('<GRILLA filtro=null>') !== -1, t.root.innerHTML);
  }

  console.log('\n' + '═'.repeat(70));
  if (fail === 0) console.log('✓ TODO OK   ' + ok + ' pasaron, 0 fallaron');
  else { console.log('✗ HAY FALLAS   ' + ok + ' pasaron, ' + fail + ' fallaron'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
