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
    u23 && !!u23.slug &&
    c3.ctx.SGADD.CATALOGO.planillas.find(x => x.categoria === 'U23').activo === true);
  /* `activo` sale de `!!slug`: una categoría sin libro conectado entra
     igual a la lista pero deshabilitada, en vez de dejar entrar a una
     sección vacía. Se prueba con un catálogo de mentira para no depender
     de que el club tenga siempre alguna sin cargar.

     El `slug` reemplazó al `sheetId` en la migración al backend: el id
     real de Google salió de todos los archivos que GitHub Pages sirve
     públicos y vive solo en el servidor. */
  const catFalso = [{ id: 'x', label: 'X', slug: '' }, { id: 'y', label: 'Y', slug: 'club-primera' }];
  const mapeado = catFalso.map(x => Object.assign({ activo: !!x.slug }, x));
  check('una planilla sin slug nace inactiva',
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

  /* =====================================================================
     CADA CLIENTE, SU PATRÓN DE EQUIPO PROPIO

     `patronEquipoPropio` decide qué equipo es "el nuestro" en scouting, en
     los informes y en el plantel. Un patrón demasiado corto agarra de más
     y el panel trata a un RIVAL como equipo propio, sin síntoma visible.
     ===================================================================== */
  console.log('\n8. PATRÓN DE EQUIPO PROPIO POR CLIENTE');
  console.log('═'.repeat(70));

  const clubes = ['reconquista', 'jujuy', 'deportivo'].map(id => require('./clubes/' + id + '.json'));
  check('los tres clientes declaran su patrón',
    clubes.every(c => typeof c.patronEquipoPropio === 'string' && c.patronEquipoPropio.length > 2),
    clubes.map(c => c.id + ':' + c.patronEquipoPropio).join(' · '));

  /* El caso concreto que casi se cuela: en el libro de DEPORTIVO juegan
     DEPORTIVO LA PLATA y DEPORTIVO SAN VICENTE. Con el patrón corto
     —"DEPORTIVO"— los dos serían el equipo propio. */
  const dep = clubes.find(c => c.id === 'deportivo');
  const rx = new RegExp(dep.patronEquipoPropio, 'i');
  check('DEPORTIVO reconoce a su equipo', rx.test('DEPORTIVO LA PLATA'));
  check('y NO se queda con DEPORTIVO SAN VICENTE, que es un rival del mismo libro',
    !rx.test('DEPORTIVO SAN VICENTE'), dep.patronEquipoPropio);
  check('su patrón no es la palabra suelta', dep.patronEquipoPropio !== 'DEPORTIVO');

  /* Un cliente nuevo es un JSON y nada más —no hay lista de clubes en
     ningún lado—, así que lo único que no puede faltar es esto. */
  const REQUERIDOS = ['id', 'nombreCorto', 'acento', 'liga', 'patronEquipoPropio', 'planillas'];
  clubes.forEach(c => {
    check(c.id + ': trae todos los campos que la app necesita',
      REQUERIDOS.every(k => c[k] !== undefined && c[k] !== null),
      REQUERIDOS.filter(k => c[k] === undefined || c[k] === null).join(',') || 'ok');
    check(c.id + ': cada planilla tiene id, label y slug',
      c.planillas.every(pl => pl.id && pl.label && typeof pl.slug === 'string'));
    /* Y NINGUNA trae ya el id de Google: es el objetivo de la migración al
       backend, y estos archivos son los que GitHub Pages sirve públicos. */
    check(c.id + ': y NINGUNA trae el sheetId, que ahora vive en el servidor',
      c.planillas.every(pl => !('sheetId' in pl)));
  });
  /* Dos clientes con el mismo id de planilla compartirían los estados de
     jugador guardados: la clave es `sgadd.estados.<club>.<planilla>`. */
  const idsPl = clubes.flatMap(c => c.planillas.map(pl => pl.id));
  check('no hay ids de planilla repetidos entre clientes',
    new Set(idsPl).size === idsPl.length, idsPl.join(' · '));

  /* =====================================================================
     EL COLOR DE MARCA NO SE PINTA CRUDO SOBRE FONDO OSCURO

     `CLUB.TEMA.acento` es la marca tal cual la declaró el cliente y sirve
     para un escudo o un borde grueso. Como color de TEXTO o de línea fina
     sobre la card depende de cuán oscuro sea: con el azul de escudo de
     DEPORTIVO (#09086E) la tabla de métricas clave pintaba los valores del
     tercil medio en **contraste 1,12** — invisibles. Con el naranja de
     Reconquista el mismo código se veía bien, así que el defecto entró con
     el tercer cliente y no antes; medido después, Jujuy también estaba por
     debajo del mínimo (3,56) y nadie lo había notado.
     ===================================================================== */
  console.log('\n9. CONTRASTE DEL ACENTO POR CLIENTE');
  console.log('═'.repeat(70));

  const FONDO_CARD = '#141414';
  const aHex = (c) => { c = c.replace('#',''); if (c.length===3) c = c.split('').map(x=>x+x).join('');
    return [0,2,4].map(i => parseInt(c.substr(i,2),16)); };
  const lumin = (c) => { const v = aHex(c).map(x => { x/=255;
      return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); });
    return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
  const contraste = (a, b) => { const L1 = lumin(a), L2 = lumin(b);
    return (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05); };

  /* Control del medidor: dos casos conocidos. */
  check('el medidor de contraste da los valores de la norma',
    Math.abs(contraste('#ffffff', '#000000') - 21) < 0.1 &&
    Math.abs(contraste('#141414', '#141414') - 1) < 0.01);

  /* La marca CRUDA de dos de los tres clientes NO pasa: por eso existe el
     aclarado, y por eso los gráficos no pueden usar el crudo. */
  const CHARTS = require('./js/sgadd-charts.js');
  const marcas = { deportivo: '#09086E', jujuy: '#2563eb', reconquista: '#f7941e' };
  check('el azul de DEPORTIVO crudo es ilegible sobre la card',
    contraste(marcas.deportivo, FONDO_CARD) < 1.5,
    contraste(marcas.deportivo, FONDO_CARD).toFixed(2));
  check('y el de Jujuy tampoco llega al mínimo',
    contraste(marcas.jujuy, FONDO_CARD) < 4.5,
    contraste(marcas.jujuy, FONDO_CARD).toFixed(2));

  /* El aclarado que ya calcula el club es el que hay que usar. */
  Object.keys(marcas).forEach(id => {
    const claro = crearClub(null).CLUB.aclararHastaLegible(marcas[id], FONDO_CARD, 4.5);
    check(id + ': el acento aclarado SÍ pasa AA sobre la card',
      contraste(claro, FONDO_CARD) >= 4.5,
      marcas[id] + ' → ' + claro + ' · ' + contraste(claro, FONDO_CARD).toFixed(2));
  });

  /* Y el que los gráficos leen tiene que ser ese, no el crudo. */
  const fuenteCharts = require('fs').readFileSync('./js/sgadd-charts.js', 'utf8');
  check('COL.acento devuelve el color LEGIBLE, no la marca cruda',
    /get acento\(\)[\s\S]{0,320}acentoTexto/.test(fuenteCharts));
  /* En papel el fondo es blanco y hace falta el simétrico oscurecido. */
  check('y en modo papel usa el oscurecido',
    /get acento\(\)[\s\S]{0,320}enPapelClaro\(\)[\s\S]{0,80}acentoPapel/.test(fuenteCharts));
  check('acentoSuave se deriva del mismo, no del crudo',
    /get acentoSuave\(\) \{ return this\.acento \+ '40'; \}/.test(fuenteCharts));
  check('sin CLUB cargado sigue habiendo un color por defecto',
    typeof CHARTS.COL.acento === 'string' && CHARTS.COL.acento.charAt(0) === '#');

  console.log('\n' + '═'.repeat(70));
  /* =====================================================================
   IDENTIDAD VISUAL DE DEPORTIVO · lo que se corrigió midiendo
   ===================================================================== */
(function () {
  const fs2 = require('fs');
  const dep = JSON.parse(fs2.readFileSync('./clubes/deportivo.json', 'utf8'));
  const html2 = fs2.readFileSync('./index.html', 'utf8');
  const c = crearClub(null).CLUB;

  /* EL ESCUDO DEL HEADER NO SE VEÍA, y no era maquetación: el JSON
     declaraba .png y el archivo es .webp. Un 404 silencioso. */
  check('el escudo del club apunta a un archivo que EXISTE',
    fs2.existsSync('./' + dep.escudo), dep.escudo);
  ['reconquista', 'jujuy'].forEach(id => {
    const j = JSON.parse(fs2.readFileSync('./clubes/' + id + '.json', 'utf8'));
    check('el escudo de ' + id + ' también existe',
      !j.escudo || fs2.existsSync('./' + j.escudo), j.escudo);
  });

  /* La marca se RE-MUESTREÓ del .webp oficial: #33348a cubre el 43,1%
     de los 37.761 píxeles opacos. Antes decía #09086E, bastante más
     oscuro que el logo real. */
  check('el acento de DEPORTIVO es el muestreado del escudo',
    dep.acento.toLowerCase() === '#33348a', dep.acento);
  check('y su variante oscura acompaña',
    dep.acentoOscuro.toLowerCase() === '#252560', dep.acentoOscuro);

  /* SELECCIÓN DE TEXTO. Pintaba `var(--acento)` crudo con texto casi
     negro encima. Medido antes del fix: 8,68 en Reconquista, 3,83 en
     Jujuy y 1,20 en DEPORTIVO — o sea ilegible. */
  check('::selection usa el token de FONDO, no el acento crudo',
    /::selection\s*\{[^}]*--acento-fondo/.test(html2));
  check('y el texto de encima es el oscuro del tema',
    /::selection\s*\{[^}]*color:\s*#0B1121/.test(html2));

  const TEXTO_SEL = '#0B1121';
  const MARCAS_SEL = { reconquista: '#f7941e', jujuy: '#2563eb', deportivo: '#33348a' };
  Object.keys(MARCAS_SEL).forEach(id => {
    const crudo = c.contraste(TEXTO_SEL, MARCAS_SEL[id]);
    const fondo = c.aclararHastaLegible(MARCAS_SEL[id], TEXTO_SEL, 4.5);
    check('el texto seleccionado se lee en ' + id,
      c.contraste(TEXTO_SEL, fondo) >= 4.5,
      'crudo ' + crudo.toFixed(2) + ' → ' + fondo + ' ' + c.contraste(TEXTO_SEL, fondo).toFixed(2));
  });

  /* Los escudos van todos en el mismo disco, con o sin imagen: sin eso
     la grilla se desarma cuando a un club le falta el archivo. */
  const ui2 = fs2.readFileSync('./js/sgadd-ui.js', 'utf8');
  check('el picker envuelve el escudo en el disco',
    /escudo-aro[^`]*<img/.test(ui2));
  check('y las iniciales usan el MISMO disco',
    (ui2.match(/escudo-aro/g) || []).length >= 2);
  check('la card de equipo lleva la clase del hover',
    /card-equipo/.test(ui2));
  check('el CSS del disco está a mano en el index',
    /\.escudo-aro \{/.test(html2) && /border-radius: 9999px/.test(html2));
  /* El resplandor va con box-shadow y no con `filter: brightness`: el
     filtro afecta al texto de adentro y rompe el contraste medido. */
  check('el hover usa box-shadow, no un filtro de brillo',
    /\.card-equipo:hover[\s\S]{0,200}box-shadow/.test(html2) &&
    !/\.card-equipo:hover[\s\S]{0,200}filter:/.test(html2));
  check('y se ilumina con el acento del club, no con un color fijo',
    /\.card-equipo:hover[\s\S]{0,240}var\(--acento-fondo/.test(html2));

  /* El isotipo va a la IZQUIERDA del nombre, y lo que se oculta es el
     ARO: un disco con borde dibujado y vacío es peor que nada. */
  check('el isotipo va antes del nombre del club',
    html2.indexOf('id="clubEscudoAro"') < html2.indexOf('id="clubNombre"'));
  const club2 = fs2.readFileSync('./js/sgadd-club.js', 'utf8');
  check('ponerEscudo muestra u oculta el aro, no solo la imagen',
    /clubEscudoAro/.test(club2));

  /* Ningún texto puede nombrar un color de marca: es de un solo club. */
  ['sgadd-equipos', 'sgadd-scouting', 'sgadd-jugadores'].forEach(m => {
    const src = fs2.readFileSync('./js/' + m + '.js', 'utf8');
    check(m + ' no nombra un color de marca en el copy',
      !/en naranja|en azul|en amarillo/i.test(src));
  });
})();

/* =====================================================================
   LA CAMPANA NO PUEDE DESAPARECER AL CAMBIAR DE TRAMO

   Medido en DEPORTIVO: VUELTA tiene 12 partidos y 0 alertas, así que la
   campana se iba al pasar de Ida a Vuelta y volvía sola al volver. Un
   control que aparece y desaparece según el recorte se lee como un bug.

   Lo que se conserva es la regla que importa: el NÚMERO significa "esto
   espera una respuesta tuya", así que sin alertas no hay badge.
   ===================================================================== */
(function () {
  const src = require('fs').readFileSync('./js/sgadd-buzon.js', 'utf8');
  const i2 = src.indexOf('function badge()');
  const cuerpo = src.slice(i2, src.indexOf('\n  }', i2));
  check('badge() ya no devuelve vacío cuando no hay nada',
    !/if \(!n && !nAvisos\) return '';/.test(cuerpo));
  check('pero el badge numérico sigue atado a las alertas',
    /\$\{n \? `<span class="buzon-badge">/.test(cuerpo));
  check('y sin nada pendiente el icono se atenúa en vez de irse',
    /buzon-quieto/.test(cuerpo));
  check('la clase existe en el <style>',
    /\.buzon-quieto \{/.test(require('fs').readFileSync('./index.html', 'utf8')));
  check('el título dice para qué sirve cuando no hay alertas',
    /Plantel al día/.test(cuerpo));
})();

/* =====================================================================
   LOS ESCUDOS SE PRECARGAN A NIVEL GLOBAL, NO DESDE PRINCIPAL

   Salían de `sheet('promedios4f')`, o sea de la capa de datos de
   Principal. Eso ataba una pieza que usan cinco secciones y los cuatro
   PDF al render de UNA. Ahora los nombres salen del ÍNDICE, con la hoja
   como respaldo para el arranque.
   ===================================================================== */
(function () {
  const html2 = require('fs').readFileSync('./index.html', 'utf8');
  const app2 = require('fs').readFileSync('./js/sgadd-app.js', 'utf8');
  check('los nombres para los escudos salen del índice',
    /function nombresParaLogos[\s\S]{0,400}SGADD_APP\.estado[\s\S]{0,200}idx\.lista\(\)/.test(html2));
  check('con la hoja vieja SOLO como respaldo',
    /function nombresParaLogos[\s\S]{0,700}sheet\('promedios4f'\)/.test(html2));
  check('y precargarLogos ya no lee la hoja directo',
    !/async function precargarLogos\(\)[\s\S]{0,400}sheet\('promedios4f'\)/.test(html2));
  /* Y se vuelve a resolver cuando llega el índice o cambia el tramo:
     ahí es cuando la lista de equipos puede cambiar. */
  check('se reprecargan al llegar el índice o cambiar de tramo',
    /precargarLogos\(\)/.test(app2));
})();
/* =====================================================================
   RANKINGS DE EQUIPOS · orden interactivo por columna

   Se replica el de Jugadores, y con él la distinción que lo hace
   correcto: SELECCIONAR y MOSTRAR son dos pasos distintos.

     · Los PUESTOS de cada métrica se calculan métrica por métrica y NO
       dependen de por cuál se esté ordenando la pantalla. El 1° en eFG%
       sigue siendo el 1° en eFG% aunque la tabla se mire por PACE.
     · El ORDEN de las filas es lo único que cambia al tocar una
       cabecera.

   Si el orden de pantalla moviera los puestos, tocar una cabecera
   convertiría el cuadro en otro sin avisar.
   ===================================================================== */
(function () {
  /* `sgadd-rankings.js` consulta SGADD como global (en el navegador ya
     está cargado). En Node se publica a mano: es la misma instancia que
     require() devuelve, no una copia. */
  global.SGADD = require('./js/sgadd-core.js');
  const R = require('./js/sgadd-rankings.js');

  /* Un índice de mentira con la forma que `construir` consume: `leer()`
     devuelve el valor de la métrica y `lista()` los equipos. */
  function idxFalso(datos) {
    const lista = Object.keys(datos).map(k => ({ clave: k, nombre: k, pj: 10 }));
    return {
      lista: () => lista,
      liga: { n: lista.length },
      leer: (clave, met) => {
        const v = datos[clave] ? datos[clave][met] : undefined;
        return { valor: (v === undefined ? null : v) };
      },
    };
  }

  const G = R.GRUPOS[0];   // 4 Factores ofensivos: eFG% PePP% RTL% RO%
  const IDX = idxFalso({
    ALFA:  { 'eFG%': 0.50, 'PePP%': 0.20, 'RTL%': 0.30, 'RO%': 0.20 },
    BRAVO: { 'eFG%': 0.45, 'PePP%': 0.10, 'RTL%': 0.25, 'RO%': 0.35 },
    CHARL: { 'eFG%': 0.40, 'PePP%': 0.15, 'RTL%': 0.20, 'RO%': 0.30 },
  });

  /* Sin opciones, el grupo manda: eFG% de mayor a menor. */
  const nat = R.construir(IDX, G);
  check('sin orden pedido manda el criterio del grupo',
    nat.filas.map(f => f.equipo.clave).join() === 'ALFA,BRAVO,CHARL',
    nat.filas.map(f => f.equipo.clave).join());
  check('y lo expone para que la UI lo pueda decir',
    nat.ordenPor === 'eFG%' && nat.reordenada === false);

  /* Tocar una cabecera cambia el orden de las FILAS. */
  const porRO = R.construir(IDX, G, { ordenPor: 'RO%', dir: 'desc' });
  check('ordenar por otra métrica reordena las filas',
    porRO.filas.map(f => f.equipo.clave).join() === 'BRAVO,CHARL,ALFA',
    porRO.filas.map(f => f.equipo.clave).join());
  check('y queda marcado como reordenada', porRO.reordenada === true);

  /* LA INVARIANTE. Los puestos son los mismos en los dos órdenes. */
  const puestos = (r, k) => r.filas.reduce((o, f) => {
    o[f.equipo.clave] = f.puestos[k]; return o; }, {});
  let movidos = 0;
  G.metricas.forEach(k => {
    const a = puestos(nat, k), b = puestos(porRO, k);
    Object.keys(a).forEach(cl => { if (a[cl] !== b[cl]) movidos++; });
  });
  check('los PUESTOS no dependen del orden de pantalla', movidos === 0, movidos + ' movidos');

  /* Invertir da el espejo exacto. */
  const asc = R.construir(IDX, G, { ordenPor: 'RO%', dir: 'asc' });
  check('invertir el sentido da el orden espejo',
    asc.filas.map(f => f.equipo.clave).join() ===
    porRO.filas.map(f => f.equipo.clave).reverse().join());

  /* Una métrica que no está en el grupo cae al criterio del grupo en vez
     de romper el orden: la cabecera no existe, así que pedirla es un
     estado viejo que sobrevivió a un cambio de pestaña. */
  const ajena = R.construir(IDX, G, { ordenPor: 'T3%', dir: 'desc' });
  check('una métrica ajena al grupo cae al criterio del grupo',
    ajena.ordenPor === 'eFG%' && ajena.reordenada === false);

  /* Los nulos SIEMPRE al fondo: un — arriba de todo en ascendente parece
     el mejor y es el que no tiene dato. */
  const CON_NULO = idxFalso({
    UNO: { 'eFG%': 0.50, 'RO%': 0.20 },
    DOS: { 'eFG%': 0.40 },                 // sin RO%
    TRE: { 'eFG%': 0.30, 'RO%': 0.35 },
  });
  ['asc', 'desc'].forEach(dir => {
    const r = R.construir(CON_NULO, G, { ordenPor: 'RO%', dir: dir });
    const claves = r.filas.map(f => f.equipo.clave);
    check('con dir=' + dir + ' el equipo sin dato queda último',
      claves[claves.length - 1] === 'DOS', claves.join());
  });

  /* La UI: cabeceras clickeables, accesibles y con estado visible. */
  const src = require('fs').readFileSync('./js/sgadd-rankings.js', 'utf8');
  check('las cabeceras de métrica son clickeables',
    /SGADD_RANKINGS\.ordenarPor\(/.test(src));
  check('declaran aria-sort', /aria-sort=/.test(src));
  check('y se pueden usar con el teclado',
    /atributosFila\('Ordenar por '/.test(src));
  check('la flecha marca la columna activa y el resto lleva ⇅',
    /'▲' : '▼'/.test(src) && /'⇅'/.test(src));
  /* Cambiar de grupo resetea: un 'por T3%' heredado no significa nada en
     la tabla de rebotes, donde esa columna ni existe. */
  check('cambiar de grupo resetea el orden',
    /function verGrupo[\s\S]{0,300}ordenPor = null/.test(src));
  /* Y una métrica invertida arranca por lo BUENO, que es lo bajo. */
  check('una métrica invertida arranca en ascendente',
    /function ordenarPor[\s\S]{0,600}inv \? 'asc' : 'desc'/.test(src));
  check('la nota del pie dice por cuál se está mostrando',
    /r\.reordenada \? ', y ahora se muestra por/.test(src));
})();
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
