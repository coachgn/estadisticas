/* =====================================================================
   test-equipo-pdf.js · la exportación modular del informe del EQUIPO
   (2026-10-19, el mismo modelo que la ficha del jugador · punto 129)

     node test-equipo-pdf.js

   La lista de cards y sub-cards tiene que ser la del CÓDIGO de la vista:
   cada `data-subcard="equipo.…"` del render real (sgadd-equipos.js,
   sgadd-pbp.js y la ficha general de sgadd-informe.js) está declarado en
   `estructura()` y al revés. Después: la selección, los atajos, la poda
   sin huecos (también la del DOM, para lo que monta el play-by-play) y el
   armado de un informe con un índice real.
   ===================================================================== */
'use strict';
const fs = require('fs');
global.SGADD = require('./js/sgadd-core.js');
global.SGADD_FICHA = require('./js/sgadd-ficha.js');
const I = require('./js/sgadd-informe.js');

let ok = 0, mal = 0;
function check(n, c, d) {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const est = I.estructura();
const declarados = est.reduce((a, x) => a.concat(x.subs.map(y => y.id)), []);
const ARCHIVOS = ['js/sgadd-equipos.js', 'js/sgadd-pbp.js', 'js/sgadd-informe.js'];
const fuente = ARCHIVOS.map(f => fs.readFileSync(f, 'utf8')).join('\n');

seccion('1 · La estructura sale del código de la vista');
{
  /* Dos formas de marcar: el atributo literal y, en las secciones del
     play-by-play que arma `seccion()`, la opción `subcard: '…'` (o el cuarto
     elemento de las piezas de `bloqueSecciones`). */
  const literales = (fuente.match(/data-subcard="(equipo\.[^"$]+)"/g) || []).map(m => m.slice(14, -1));
  const opciones = (fuente.match(/subcard: '(equipo\.[^']+)'/g) || []).map(m => m.slice(10, -1));
  const piezas = (fuente.match(/, '(equipo\.pbp\.[^']+)'\]/g) || []).map(m => m.slice(3, -2));
  const marcas = [...new Set(literales.concat(opciones, piezas))].sort();
  check('cada marca del render real está declarada en la estructura', marcas.every(m => declarados.indexOf(m) !== -1), marcas.filter(m => declarados.indexOf(m) === -1));
  check('y cada sub-card declarada tiene su marca en el render', declarados.every(d => marcas.indexOf(d) !== -1), declarados.filter(d => marcas.indexOf(d) === -1));
  check('ninguna marca se repite en dos bloques distintos del render', literales.length === new Set(literales).size,
    literales.filter((m, i) => literales.indexOf(m) !== i));
  const grupos = (fuente.match(/data-subcard-de="(equipo\.[^"$]+)"/g) || []).map(m => m.slice(17, -1).split(/\s+/));
  check('cada grupo declara hijos que existen', grupos.length >= 8 && grupos.every(g => g.every(id => declarados.indexOf(id) !== -1)), grupos);
  check('todas las marcas del equipo llevan el prefijo «equipo.» y su sección', declarados.every(d => /^equipo\.[a-z0-9-]+\.[a-z0-9-]+$/.test(d)));
  const tabs = est.filter(x => x.tab).map(x => x.tab);
  const EQ = fs.readFileSync('js/sgadd-equipos.js', 'utf8');
  check('cada sección con tab apunta a una pestaña real de EQUIPOS_TABS', tabs.every(t => new RegExp("\\{ id: '" + t + "',").test(EQ)), tabs);
  check('no hay ids de sección repetidos', new Set(est.map(x => x.id)).size === est.length);
  check('Quintetos y Mapa de tiro van marcados como play-by-play', est.filter(x => x.pbp).map(x => x.id).join() === 'pbp,pbp-tiro');
  check('el insight de la Personalidad arranca destildado: el informe ya lo abre arriba',
    est.find(x => x.id === 'personalidad').subs.find(y => y.id === 'equipo.personalidad.insight').pre === false);
}

seccion('2 · La selección y los atajos');
{
  const s = I.seleccionPorDefecto(est);
  check('por defecto: las claves para scouting, y lo secundario destildado',
    ['ficha', 'insight', 'personalidad', '4factores', 'condicion', 'plantel'].every(id => s.secciones[id])
    && ['general', 'ofensiva', 'defensiva', 'pbp', 'pbp-tiro', 'partidos'].every(id => !s.secciones[id]));
  check('las sub-cards arrancan tildadas salvo las que dicen lo contrario', declarados.every(d => s.subs[d] === (d !== 'equipo.personalidad.insight')));
  const a = I.seleccionAtajo('tiro', est);
  check('«Solo Tiro / Mapa» deja Ofensiva y el Mapa de tiro, nada más',
    Object.keys(a.secciones).filter(k => a.secciones[k]).sort().join() === 'ofensiva,pbp-tiro');
  const q = I.seleccionAtajo('quintetos', est);
  check('«Solo Quintetos / Rotación» deja Quintetos y el plantel',
    Object.keys(q.secciones).filter(k => q.secciones[k]).sort().join() === 'pbp,plantel');
  const c = I.seleccionAtajo('completo', est);
  check('«Informe completo» tilda todas las secciones', est.every(x => c.secciones[x.id]));
  check('y no duplica el insight de la Personalidad', c.subs['equipo.personalidad.insight'] === false);
  check('los tres atajos existen con su nombre', I.ATAJOS.map(x => x.label).join(' | ') === 'Informe completo | Solo Tiro / Mapa | Solo Quintetos / Rotación');
  const s2 = I.seleccionPorDefecto(est);
  s2.subs['equipo.4factores.tablas'] = false;
  const act = I.activos(s2, est);
  check('una sub-card está activa si ella Y su sección están tildadas', act['equipo.4factores.radar-of'] && !act['equipo.4factores.tablas'] && !act['equipo.ofensiva.kpis']);
  const f4 = est.find(x => x.id === '4factores');
  check('una sección entra si tiene algo adentro', I.seccionEntra(f4, s2)
    && !I.seccionEntra(f4, Object.assign({}, s2, { subs: Object.fromEntries(declarados.map(d => [d, false])) })));
  check('una sección sin sub-cards entra con solo tildarla', I.seccionEntra(est.find(x => x.id === 'insight'), s2));
}

seccion('3 · La poda · lo destildado se quita, sin huecos');
{
  /* El grupo del reloj del Mapa de tiro, sobre un DOM mínimo. */
  function nodo(attrs, hijos) {
    const n = { attrs: attrs, hijos: hijos || [], padre: null };
    n.hijos.forEach(h => { h.padre = n; });
    n.getAttribute = k => (k in n.attrs ? n.attrs[k] : null);
    n.remove = () => { if (n.padre) n.padre.hijos = n.padre.hijos.filter(h => h !== n); n.padre = null; };
    n.querySelectorAll = (sel) => {
      const k = sel.slice(1, -1);
      const out = [];
      (function rec(x) { x.hijos.forEach(h => { if (k in h.attrs) out.push(h); rec(h); }); })(n);
      return { forEach: f => out.forEach(f) };
    };
    return n;
  }
  const ids = ['equipo.tiro.reloj', 'equipo.tiro.reloj-franjas', 'equipo.tiro.reloj-sintesis', 'equipo.tiro.tendencias'];
  const armarDom = () => nodo({}, [nodo({ 'data-subcard': 'equipo.tiro.mapa' }),
    nodo({ 'data-subcard-de': ids.join(' ') }, ids.map(id => nodo({ 'data-subcard': id })))]);
  const r1 = armarDom();
  SGADD_FICHA.podarDom(r1, Object.fromEntries(ids.map(id => [id, id === 'equipo.tiro.tendencias']).concat([['equipo.tiro.mapa', true]])));
  check('el DOM pierde la sub-card destildada y conserva la otra',
    r1.hijos.length === 2 && r1.hijos[1].hijos.map(h => h.attrs['data-subcard']).join() === 'equipo.tiro.tendencias');
  const r2 = armarDom();
  SGADD_FICHA.podarDom(r2, Object.fromEntries(ids.map(id => [id, false]).concat([['equipo.tiro.mapa', true]])));
  check('sin ninguna pieza del reloj se va el bloque entero: no queda el título suelto',
    r2.hijos.length === 1 && r2.hijos[0].attrs['data-subcard'] === 'equipo.tiro.mapa');

  /* La poda del HTML sobre el render REAL de una pestaña. */
  const EQ = fs.readFileSync('js/sgadd-equipos.js', 'utf8');
  const ini = EQ.indexOf('function equiposTab4F(idx, e)');
  const cuerpo = EQ.slice(ini, EQ.indexOf('\n}\n', ini));
  check('las tablas de 4 Factores conservan su data-hoja adentro de la marca', /<div data-subcard="equipo\.4factores\.tablas">\s*<div class="grid[^"]*" data-hoja>/.test(cuerpo));
}

seccion('4 · El informe armado con un índice real');
{
  /* Lo mínimo del navegador para ejercer `armar()` sin pintar nada. */
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  global.SGADD_UI = { esc: esc, fechaHoy: () => '19/10/2026', pieInforme: f => 'MotorStats · ' + f,
    statCard: (r) => `<div class="kpi">${r ? esc(r.formateado) : '—'}</div>` };
  global.SGADD_APP = { planillaActual: () => ({ label: 'Primera' }) };
  global.equiposTabDisponible = () => true;
  global.equiposInsight = () => '<div class="insight">INSIGHT</div>';
  global.equiposTab = (idx, e, tab) => {
    if (tab === '4factores') {
      return '<div class="grid" data-subcard-de="equipo.4factores.radar-of equipo.4factores.radar-def">'
        + '<div data-subcard="equipo.4factores.radar-of">RADAR OF</div><div data-subcard="equipo.4factores.radar-def">RADAR DEF</div></div>'
        + '<div data-subcard="equipo.4factores.tablas"><div data-hoja>TABLAS</div></div>';
    }
    return '<div>TAB ' + tab + '</div>';
  };
  global.SGADD_PERSONALIDAD = { perfil: () => ({ arquetipo: { titulo: 'Equipo de transición', frase: 'Corre.' }, insight: { x: 1 } }) };
  const idx = { liga: { n: 12 }, leer: () => ({ formateado: '1,0' }), ranking: () => null };
  const e = { clave: 'ATENAS A', nombre: 'ATENAS A', record: { ganados: 5, perdidos: 3 }, pj: 8 };

  const s = I.seleccionPorDefecto(est);
  s.subs['equipo.4factores.radar-of'] = false;
  s.subs['equipo.4factores.radar-def'] = false;
  s.subs['equipo.ficha.kpis'] = false;
  const html = I.armar(idx, e, 'PLATENSE', s);
  check('la portada va siempre, con el rival', /Informe pre-partido · ATENAS A vs PLATENSE/.test(html));
  check('la grilla de los radares se va entera: no queda el contenedor vacío', !/RADAR/.test(html) && !/radar-of/.test(html) && /TABLAS/.test(html));
  check('la ficha general sin los indicadores conserva el arquetipo', /Equipo de transición/.test(html) && !/equipo\.ficha\.kpis/.test(html));
  check('cada sección lleva su data-bloque', /data-bloque="4factores"/.test(html) && /data-bloque="ficha"/.test(html) && /data-bloque="insight"/.test(html));
  check('lo destildado no aparece: Ofensiva y Partidos fuera', !/TAB ofensiva/.test(html) && !/TAB partidos/.test(html) && /TAB plantel/.test(html));
  check('los div quedan balanceados', (html.match(/<div\b/g) || []).length === (html.match(/<\/div>/g) || []).length);
  s.subs['equipo.4factores.tablas'] = false;
  check('una sección con todo destildado no deja ni su título', !/data-bloque="4factores"/.test(I.armar(idx, e, '', s)));
  const sinPbp = I.armar(idx, e, '', I.seleccionAtajo('completo', est));
  global.equiposTabDisponible = (i, eq, tab) => tab !== 'pbp' && tab !== 'pbp-tiro';
  const conGuard = I.armar(idx, e, '', I.seleccionAtajo('completo', est));
  check('sin la capa de play-by-play, Quintetos y Mapa de tiro no entran aunque estén tildados',
    /TAB pbp/.test(sinPbp) && !/TAB pbp/.test(conGuard) && /TAB general/.test(conGuard));
  check('el pie de la firma cierra el informe', /<footer class="informe-pie">MotorStats · 19\/10\/2026<\/footer>$/.test(conGuard.trim()));
}

seccion('5 · El modal y la impresión');
{
  const IN = fs.readFileSync('js/sgadd-informe.js', 'utf8');
  check('el modal usa el MISMO árbol de checkboxes que la ficha del jugador', /SGADD_FICHA\.arbolHtml\(elegidas\(\)/.test(IN));
  check('y ofrece los tres atajos', /ATAJOS\.map\(a => `<button type="button" onclick="SGADD_INFORME\.atajo\('\$\{a\.id\}'\)"/.test(IN));
  check('la poda es UNA para las dos exportaciones: la de sgadd-ficha.js', /SGADD_FICHA\.podarHtml\(html, act\)/.test(IN) && /SGADD_FICHA\.podarDom\(raiz, act\)/.test(IN));
  const g = IN.slice(IN.indexOf('function generar()'), IN.indexOf('function limpiar()'));
  check('lo del play-by-play se poda DESPUÉS de montarlo y antes de embeber e imprimir',
    g.indexOf('montarPendientes(salida)') < g.indexOf('podarDom(salida, act)')
    && g.indexOf('podarDom(salida, act)') < g.indexOf("embeberImagenes('#informeSalida')")
    && g.indexOf("embeberImagenes('#informeSalida')") < g.indexOf('window.print()'));
  check('va en la tabla firmada (encabezado y pie en cada hoja)', /SGADD_UI\.inyectarPieDeHoja\('informeSalida'\)/.test(IN));
  check('un ítem deshabilitado dice por qué: el play-by-play no es «sin datos»', /motivo: 'sin la capa de play-by-play'/.test(IN)
    && /esc\(x\.motivo \|\| 'sin datos suficientes'\)/.test(fs.readFileSync('js/sgadd-ficha.js', 'utf8')));
}

seccion('6 · El papel · sin hojas huérfanas (medido en el PDF real)');
{
  const css = fs.readFileSync('index.html', 'utf8');
  check('la SECCIÓN del informe se parte: una sección larga no salta entera dejando la hoja anterior vacía',
    /body\.modo-impresion #informeSalida \.informe-bloque \{ page-break-inside: auto; break-inside: auto; \}/.test(css));
  check('lo que no se parte es cada sub-card (salvo las del play-by-play, que traen sus piezas)',
    /#informeSalida \[data-bloque\]:not\(\[data-bloque\^="pbp"\]\) \[data-subcard\] \{\s*page-break-inside: avoid; break-inside: avoid;/.test(css));
  check('la ficha general y el insight siguen sin partirse', /\[data-bloque="ficha"\],\s*body\.modo-impresion #informeSalida \[data-bloque="insight"\] \{ page-break-inside: avoid/.test(css));
  check('la tabla de Partidos se parte por filas: el título ya no queda solo en una hoja',
    /\[data-bloque="partidos"\] table \{ page-break-inside: auto !important/.test(css));
  check('la pregunta de la sección no se despega de su primer bloque', /#informeSalida \.informe-pregunta \{ page-break-after: avoid/.test(css));
  check('los dos radares de 4 Factores van juntos', /\[data-subcard-de="equipo\.4factores\.radar-of equipo\.4factores\.radar-def"\] \{\s*page-break-inside: avoid/.test(css));
  check('el radar de la Personalidad entra en la hoja de la identidad: se comprimen sus aires y su caja',
    /\[data-subcard="equipo\.personalidad\.rasgos"\] > div \{ padding: 2mm 3mm !important; \}/.test(css)
    && /\[data-subcard="equipo\.personalidad\.radar"\] \.chart-box \{\s*height: 82mm !important/.test(css));
  check('«Cómo ataca» y «Dónde gana» siguen abriendo hoja (pedido del club)',
    (fs.readFileSync('js/sgadd-equipos.js', 'utf8').match(/data-hoja/g) || []).length === 3);
}

console.log('\n' + (mal ? '✗ HAY FALLAS   ' : '✓ TODO OK   ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
