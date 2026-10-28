/* =====================================================================
   test-ficha-pdf.js · la exportación modular de la ficha del jugador y el
   Pack PLANTEL (2026-10-18)

     node test-ficha-pdf.js

   La lista de cards y sub-cards tiene que ser la del CÓDIGO de la vista:
   cada `data-subcard` del render real (sgadd-jugadores.js, sgadd-pbp.js)
   está declarado en `estructura()` y al revés. Después: la poda sin
   huecos, la titularidad solo con el dato, el pack y los canvas sin ids
   repetidos.
   ===================================================================== */
'use strict';
const fs = require('fs');
global.SGADD = require('./js/sgadd-core.js');
const J = require('./js/sgadd-jugadores.js');
Object.keys(J).forEach((k) => { global[k] = J[k]; });
const F = require('./js/sgadd-ficha.js');

let ok = 0, mal = 0;
function check(n, c, d) {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { mal++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); }
}
function seccion(t) { console.log('\n' + t); }

const est = F.estructura();
const S = (id) => est.find(x => x.id === id);
check("el diagnóstico entra entero, sin sub-cards, y tildado", S("diagnostico") && S("diagnostico").subs.length === 0 && S("diagnostico").pre === true);
const declarados = est.reduce((a, x) => a.concat(x.subs.map(y => y.id)), []);

seccion('1 · La estructura sale del código de la vista');
{
  const fuente = ['js/sgadd-jugadores.js', 'js/sgadd-pbp.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n');
  /* Las marcas `equipo.` son del informe del EQUIPO (test-equipo-pdf.js): viven en los mismos archivos. */
  const marcas = [...new Set((fuente.match(/data-subcard="([^"$]+)"/g) || []).map(m => m.slice(14, -1)))].filter(m => m.indexOf('equipo.') !== 0).sort();
  check('cada marca del render real está declarada en la estructura', marcas.every(m => declarados.indexOf(m) !== -1), marcas.filter(m => declarados.indexOf(m) === -1));
  check('y cada sub-card declarada tiene su marca en el render', declarados.every(d => marcas.indexOf(d) !== -1), declarados.filter(d => marcas.indexOf(d) === -1));
  /* La pestaña Rendimiento (punto 140, solo con la capa pbp) todavía no entra al PDF. */
  check('las secciones son las pestañas reales de Jugadores, con su nombre y su pregunta',
    est.map(x => x.id).join() === J.JUGADORES_TABS.filter(t => !t.pbp).map(t => t.id).join() && est.every(x => x.label === J.JUGADORES_TABS.find(t => t.id === x.id).label && x.pregunta));
  check('las cartas toman el nombre de JUGADORES_CARDS_REF', ['uso', 'pases'].every(c => est[0].subs.some(y => y.label === J.JUGADORES_CARDS_REF.find(r => r.id === c).label))
    && S("tiro").subs.some(y => y.label === J.JUGADORES_CARDS_REF.find(r => r.id === 'tiro').label));
  const grupos = (fuente.match(/data-subcard-de="([^"$]+)"/g) || []).map(m => m.slice(17, -1).split(/\s+/)).filter(g => g[0].indexOf('equipo.') !== 0);
  check('cada grupo declara hijos que existen', grupos.length >= 2 && grupos.every(g => g.every(id => declarados.indexOf(id) !== -1)), grupos);
  check('los bloques del play-by-play van marcados como tales', S("mapa").subs.filter(y => y.pbp).map(y => y.id).join() === 'mapa.zonas,mapa.reloj,mapa.reloj-tramos,mapa.reloj-franjas'
    && S("quintetos").subs.map(y => y.id).join() === 'quintetos.jugador' && !S("tiro").subs.some(y => y.pbp) && S("mapa").soloPbp && S("quintetos").soloPbp);
  check('la evolución elige métricas y el log de partidos arranca destildado', S("evolucion").metricas === true && S("partidos").pre === false);
}

seccion('2 · La selección');
{
  const s = F.seleccionPorDefecto(est);
  check('por defecto: todo tildado salvo el log, y la métrica en pantalla', s.secciones.general && s.secciones.tiro && s.secciones.evolucion && !s.secciones.partidos
    && declarados.every(d => s.subs[d]) && s.metricas.PTS === true && Object.keys(s.metricas).filter(k => s.metricas[k]).length === 1);
  const s2 = F.seleccionPorDefecto(est);
  s2.secciones.tiro = false;
  s2.subs['general.uso'] = false;
  const a = F.activos(s2, est);
  check('una sub-card está activa si ella Y su sección están tildadas', a['general.adn'] && !a['general.uso'] && !a['tiro.carta']);
  check('una sección entra si tiene algo adentro', F.seccionEntra(est[0], s2) && !F.seccionEntra(S("tiro"), s2)
    && !F.seccionEntra(est[0], Object.assign({}, s2, { subs: Object.fromEntries(declarados.map(d => [d, false])) })));
  check('la evolución entra solo con al menos una métrica', F.seccionEntra(S("evolucion"), s2) && !F.seccionEntra(S("evolucion"), Object.assign({}, s2, { metricas: { PTS: false } })));
}

seccion('3 · La poda · lo destildado se quita, sin huecos');
{
  const html = `<div data-subcard="general.adn"><div>ADN<div>anidado</div></div></div>
    <div data-subcard="general.sintesis">SINT</div>
    <div data-subcard-de="general.uso general.pases" class="grid">
      <div data-subcard="general.uso"><div>USO</div></div>
      <div data-subcard="general.pases">PASES</div>
    </div>
    <div data-subcard="otra.cosa">NO DECLARADA</div>
    <p>texto suelto</p>`;
  const act = { 'general.adn': false, 'general.sintesis': true, 'general.uso': false, 'general.pases': true };
  const p1 = F.podarHtml(html, act);
  check('quita el bloque entero, con sus div anidados', !/ADN|anidado/.test(p1) && /SINT/.test(p1) && /texto suelto/.test(p1));
  check('en un grupo quita al hijo destildado y deja al otro', !/USO/.test(p1) && /PASES/.test(p1) && /class="grid"/.test(p1));
  const p2 = F.podarHtml(html, Object.assign({}, act, { 'general.pases': false }));
  check('un grupo sin ningún hijo activo se va entero: no queda la grilla vacía', !/class="grid"/.test(p2) && !/PASES/.test(p2));
  check('lo que no está declarado se conserva', /NO DECLARADA/.test(p2));
  check('los div quedan balanceados', (p2.match(/<div\b/g) || []).length === (p2.match(/<\/div>/g) || []).length);
  check('con todo activo no cambia nada', F.podarHtml(html, { 'general.adn': true, 'general.sintesis': true, 'general.uso': true, 'general.pases': true }) === html);
  const pbp = `<div class="mapa-pbp-jugador" data-subcard-de="mapa.zonas mapa.reloj mapa.reloj-tramos mapa.reloj-franjas"><div class="pbp-montaje">cargando</div></div>`;
  check('si las cuatro piezas del play-by-play van destildadas no se pide ni el paquete', F.podarHtml(pbp, { 'mapa.zonas': false, 'mapa.reloj': false, 'mapa.reloj-tramos': false, 'mapa.reloj-franjas': false }) === ''
    && F.podarHtml(pbp, { 'mapa.zonas': false, 'mapa.reloj': true, 'mapa.reloj-tramos': false, 'mapa.reloj-franjas': false }) === pbp);
  check('el contenedor del play-by-play declara sus tres hijos en el código',
    /data-subcard-de="mapa.zonas mapa.reloj mapa.reloj-tramos mapa.reloj-franjas"/.test(fs.readFileSync('js/sgadd-jugadores.js', 'utf8')));
}

seccion('4 · Varias fichas en un documento: los gráficos no se pisan');
{
  const h = '<div><canvas id="chTiroVol" class="x"></canvas><canvas class="y" id="chTiroConv"></canvas></div><div id="chTiroVol">no es canvas</div>';
  const p = F.prefijarCanvas(h, 'f3-');
  check('renombra SOLO los ids de <canvas>', /<canvas id="f3-chTiroVol"/.test(p) && /id="f3-chTiroConv"/.test(p) && /<div id="chTiroVol">/.test(p));
  const CH = fs.readFileSync('js/sgadd-charts.js', 'utf8');
  check('los gráficos encolados con un prefijo dibujan en `prefijo + id`', /function conPrefijo\(prefijo, fn\)/.test(CH) && /id = prefijoCrear \+ id;/.test(CH)
    && /conPrefijo, dibujarPendientes/.test(CH));
  const FI = fs.readFileSync('js/sgadd-ficha.js', 'utf8');
  check('cada jugador del pack usa su propio prefijo', /const p = 'f' \+ \(n \|\| 0\) \+ '-';/.test(FI) && /SGADD_CHARTS\.conPrefijo\(p, fn\)/.test(FI) && /prefijarCanvas\(bloques\.join\(''\), p\)/.test(FI));
}

seccion('5 · Pack PLANTEL · titulares y sustitutos solo con el dato');
{
  const lista = [{ NOMBRES: 'A', EQUIPO: 'X' }, { NOMBRES: 'B', EQUIPO: 'X' }, { NOMBRES: 'C', EQUIPO: 'X' }, { NOMBRES: 'D', EQUIPO: 'X' }];
  const datos = { A: { titular: 10, partidos: 10 }, B: { titular: 5, partidos: 10 }, C: { titular: 2, partidos: 10 } };
  const t = F.porTitularidad(lista, n => datos[n] || null);
  check('titular = arrancó la mitad o más de SUS partidos', t.titulares.map(j => j.NOMBRES).join() === 'A,B' && t.sustitutos.map(j => j.NOMBRES).join() === 'C');
  check('sin el dato no es ni titular ni sustituto: no se infiere', t.conDato === 3 && !t.titulares.concat(t.sustitutos).some(j => j.NOMBRES === 'D'));
  check('una planilla sin titularidad deja los dos atajos vacíos', F.porTitularidad(lista, () => null).conDato === 0);
  const FI = fs.readFileSync('js/sgadd-ficha.js', 'utf8');
  check('sin el dato los atajos se deshabilitan y lo dicen', /no trae la titularidad \(TITULAR del box score\): no se infiere/.test(FI) && /atajo\('Titulares \(' \+ t\.titulares\.length \+ '\)', 'titulares', t\.conDato > 0\)/.test(FI));
  const idx = { liga: { jugadoresPorEquipo: new Map([['X', [{ NOMBRES: 'A', MIN: 10 }, { NOMBRES: 'B', MIN: 30 }, { NOMBRES: 'C', MIN: 20 }]]]) } };
  check('el plantel del pack va por minutos, de mayor a menor', F.plantelDe(idx, 'X').map(j => j.NOMBRES).join() === 'B,C,A' && F.plantelDe(idx, 'Y').length === 0);
  check('el pack son tres pasos y un solo PDF con nombre propio', /'1 · Cards', '2 · Jugadores', '3 · Generar'/.test(FI) && /nombrePdf\('plantel'/.test(FI)
    && /plantel: \(d\) =>/.test(fs.readFileSync('js/sgadd-ui.js', 'utf8')));
  const UI = require('./js/sgadd-ui.js');
  check('el archivo se llama «Plantel <equipo>»', UI.nombrePdf('plantel', { equipo: "RECONQUISTA 'A' - MM" }).indexOf('Plantel') === 0 && UI.nombrePdf('plantel', {}) === 'Pack_Plantel', UI.nombrePdf('plantel', { equipo: "RECONQUISTA 'A' - MM" }));
  check('la vista del plantel ofrece el botón', /SGADD_FICHA\.abrirPack\('\$\{SGADD_UI\.escJs\(clave\)\}'\)/.test(fs.readFileSync('js/sgadd-jugadores.js', 'utf8')));
  const css = fs.readFileSync('index.html', 'utf8');
  check('en el papel cada jugador arranca en hoja nueva, salvo el primero', /#fichaSalida \.ficha-jugador \+ \.ficha-jugador \{\s*page-break-before: always; break-before: page;/.test(css));
  check('el bloque del play-by-play ya no va entero: se parte entre mapas', !/\.mapa-pbp-jugador \{\s*display: block !important;\s*page-break-inside: avoid/.test(css)
    && /\[data-reloj-jugador-mapa\] \{\s*page-break-inside: avoid; break-inside: avoid;/.test(css));
}

seccion('6 · TOP 3 del PLANTEL · arriba del plantel y elegible en el pack');
{
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  global.escapeHtml = esc; global.escapeAttr = esc;
  global.SGADD_UI = { escJs: (v) => String(v), atributosFila: () => 'tabindex="0" role="button"' };
  global.jugadoresConDorsal = (n) => n;
  const cols = ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'MIN', 'PTS', 'PLAYS', 'PPP', 'USG%', 'eFG%', 'TS%', 'RTL%', 'TC%', 'TCC', 'TCI',
    'PT2%', 'T2%', 'T2C', 'T2I', 'PPT2', 'PT3%', 'T3%', 'T3C', 'T3I', 'PPT3', 'PT1%', 'T1%', 'T1C', 'T1I', 'PPT1', 'RO', 'RD', 'RT', 'AST-PP', 'AST%', 'FC', 'FR'];
  const fila = (n, i) => { const o = { NOMBRES: n, EQUIPO: 'ATENAS A', FASE: 'REGULAR' }; cols.slice(3).forEach((k, c) => { o[k] = String(10 + i * 2 + (c % 5)); }); o.MIN = String(10 + i * 4); return o; };
  const idx = SGADD.construirIndice({ 'PROMEDIOS J': { cols: cols, filas: ['A, UNO', 'B, DOS', 'C, TRES', 'D, CUATRO', 'E, CINCO'].map(fila) } }, { fase: 'REGULAR' });
  const clave = SGADD.claveEquipo('ATENAS A');
  const g = J.jugadoresTop3Plantel(idx, clave);
  check('una sub-card por dimensión del ranking del plantel', g.map(x => x.id).join() === J.JUGADORES_RANKINGS.map(x => x.id).join(), g.map(x => x.id));
  check('cada una con los tres primeros por la métrica del grupo', g.every(x => x.filas.length === 3
    && x.filas[0].celdas[x.orden] >= x.filas[1].celdas[x.orden] && x.filas[1].celdas[x.orden] >= x.filas[2].celdas[x.orden]));
  check('las columnas: PJ y MIN primero, después las de referencia del grupo', g.every(x => x.cols[0] === 'PJ' && x.cols[1] === 'MIN'
    && x.cols.slice(2).join() === J.JUGADORES_RANKINGS.find(r => r.id === x.id).cols.filter(k => k !== 'PJ' && k !== 'MIN' && k !== '+/-').join()));
  check('una columna que la planilla no trae se omite, no sale en «—»', g.find(x => x.id === 'produccion').cols.indexOf('+/-') === -1);
  check('sin piso de minutos: entra el de 10 minutos si lidera', J.jugadoresTop3Plantel(idx, clave)[0].filas.length === 3);
  const html = J.jugadoresBloqueTop3Plantel(idx, clave);
  const marcas = (html.match(/data-subcard="([^"]+)"/g) || []).map(m => m.slice(14, -1));
  const ep = F.estructuraPack();
  check('la card se llama TOP 3 del PLANTEL y lleva una marca data-subcard por grupo', /TOP 3 del PLANTEL/.test(html)
    && marcas.join() === ep[0].subs.map(x => x.id).join(), marcas);
  check('el pack declara esas mismas sub-cards, tildadas por defecto', ep[0].id === 'top3' && ep[0].pre === true
    && F.seleccionPorDefecto(ep).secciones.top3 === true && ep[0].subs.every(x => F.seleccionPorDefecto(ep).subs[x.id]));
  const plegable = J.jugadoresBloqueTop3Plantel(idx, clave, { plegable: true });
  check('el TOP 3 de pantalla es un <details> que arranca CERRADO', /<details id="jugadoresTop3"/.test(plegable) && !/<details[^>]*\sopen[\s>]/.test(plegable));
  check('el del PDF/pack no se pliega (sin opts va abierto como siempre)', !/<details/.test(html));
  check('el plegado vive en el estado del módulo y no en el DOM', /top3Abierto: false/.test(require('fs').readFileSync(require('path').join(__dirname, 'js', 'sgadd-jugadores.js'), 'utf8')));
  const podado = F.podarHtml(html, Object.assign({}, ...ep[0].subs.map(x => ({ [x.id]: x.id !== 'plantel.top3-rebotes' }))));
  check('destildar una dimensión la quita del PDF sin dejar hueco', !/plantel\.top3-rebotes/.test(podado) && /plantel\.top3-produccion/.test(podado)
    && (podado.match(/<div\b/g) || []).length === (podado.match(/<\/div>/g) || []).length);
  check('la ficha individual NO ofrece el TOP 3: es del pack', !F.estructura().some(x => x.id === 'top3'));
  const fuente = fs.readFileSync('js/sgadd-jugadores.js', 'utf8');
  const ini = fuente.indexOf('function jugadoresGrilla(idx)');
  const cuerpo = fuente.slice(ini, fuente.indexOf('\n}\n', ini));
  check('va inmediatamente ARRIBA de la card del plantel', cuerpo.indexOf('jugadoresBloqueTop3Plantel(idx') !== -1
    && cuerpo.indexOf('jugadoresBloqueTop3Plantel(idx') < cuerpo.indexOf('jugadoresPlantelEquipo(idx)'));
  const FI = fs.readFileSync('js/sgadd-ficha.js', 'utf8');
  check('el pack lo arma primero, con lo elegido en el paso 1', /podarHtml\(jugadoresBloqueTop3Plantel\(idx, clave\), activos\(sel, ep\)\)/.test(FI)
    && /arbolHtml\(elegidas\(\), null, estructuraPack\(\)\.concat\(estructura\(\)\)\)/.test(FI));
}

{
  /* PACK COMPACTO (2026-10-28): la ficha de un jugador entra en una hoja. */
  const H = fs.readFileSync('index.html', 'utf8');
  const bloque = (H.match(/body\.modo-ficha-print #fichaSalida \.mapa-pbp-jugador \{[^}]*\}/) || [''])[0];
  check('el mapa del jugador se parte ENTRE piezas, no baja entero (le gana al avoid de .rend-card)',
    /break-inside: auto !important/.test(bloque));
  check('cada ficha del pack no se parte si cabe', /\.ficha-jugador \{ break-inside: avoid/.test(H));
  check('el mapa del pack va mas angosto y con aires chicos',
    /\.ficha-jugador \.pbp-mapa-grid \{\s*grid-template-columns: minmax\(0, 36%\)/.test(H)
    && /\.ficha-jugador \.informe-bloque \{ margin-bottom: 2\.5mm/.test(H));
  check('la pregunta de la seccion no se despega de su contenido', /\.ficha-jugador \.informe-pregunta \{[^}]*break-after: avoid/.test(H));
}

console.log('\n' + (mal ? '✗ HAY FALLAS   ' : '✓ TODO OK   ') + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
