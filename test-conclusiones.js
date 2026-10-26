/* test-conclusiones.js · la card de conclusiones clínicas (punto 141)
   y la terna de logos del encabezado PDF.

   1 · Equipo: los tres ejes salen del percentil con su dirección.
   2 · Jugador: se lo mide con las métricas de SU función.
   3 · Play-by-play: tipos de posesión, media distancia, pérdidas vivas.
   4 · Vista y cableado: Equipos, Jugadores, informe y la terna.
   Corre sobre el snapshot de la demo (datos reales anonimizados). */
'use strict';
const fs = require('fs');
const SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
global.SGADD_RENDIMIENTO = require('./js/sgadd-rendimiento.js');
const C = require('./js/sgadd-conclusiones.js');
const UI = require('./js/sgadd-ui.js');

let ok = 0, mal = 0;
const check = (n, c, x) => { if (c) { ok++; console.log('  ✓ ' + n); } else { mal++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + String(x).slice(0, 200) : '')); } };
const titulo = (t) => console.log('\n' + t);

const crudo = JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8'));
const r0 = DEMO.rehidratar(crudo);
const HOJAS = r0.hojas || r0;
const T = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(HOJAS));
const idx = SGADD.construirIndice(HOJAS, { fase: T.fase, torneo: T.torneo });
const equipos = idx.lista();

/* ===================================================================== */
titulo('1 · equipo · los tres ejes contra la liga');
check('el semáforo: verde desde 70, rojo bajo 40', C.tonoPct(70) === 'pos' && C.tonoPct(69.9) === 'aviso' && C.tonoPct(40) === 'aviso' && C.tonoPct(39.9) === 'neg' && C.tonoPct(null) === null);
let todos = { f: 0, a: 0, q: 0 }, coherente = true, soloEntrenables = true;
equipos.forEach((e) => {
  const c = C.equipo(idx, e);
  todos.f += c.fortalezas.length; todos.a += c.ajustes.length; todos.q += c.alertas.length;
  c.fortalezas.forEach(i => { if (!(i.percentil >= 70)) coherente = false; });
  c.alertas.forEach(i => { if (!(i.percentil < 40)) coherente = false; });
  c.ajustes.forEach(i => { if (!(i.percentil >= 40 && i.percentil < 70)) coherente = false; if (!C.EQ[i.clave].entrenable) soloEntrenables = false; });
});
check('cada ítem cae en el eje de su percentil', coherente);
check('los ajustes son solo variables entrenables', soloEntrenables);
check('en una liga real salen los tres ejes', todos.f > 0 && todos.a > 0 && todos.q > 0, JSON.stringify(todos));
check('el ritmo y el reparto del tiro no se juzgan', !C.EQ['PACE'] && !C.EQ['PT3%']);
const mejorDef = equipos.slice().sort((a, b) => (idx.leer(b.clave, 'RTNG DEF').percentil || 0) - (idx.leer(a.clave, 'RTNG DEF').percentil || 0))[0];
check('la mejor defensa de la liga tiene el DRTG como fortaleza (dirección invertida)', C.equipo(idx, mejorDef).fortalezas.some(i => i.clave === 'RTNG DEF'));
check('sin índice no revienta', C.equipo(null, null).alertas.length === 0);

/* ===================================================================== */
titulo('2 · jugador · medido para su función');
const califica = idx.liga.jugadores.filter(j => j.__califica);
const j = califica[0];
const ancla = C.jugador(idx, j, { rolFuncional: { eje: 'defensa', label: 'Ancla Defensiva' } });
const creador = C.jugador(idx, j, { rolFuncional: { eje: 'creacion', label: 'Generador Primario' } });
const claves = (c) => c.fortalezas.concat(c.ajustes, c.alertas).map(i => i.clave);
check('a un ancla no se le juzga la creación', claves(ancla).every(k => C.POR_EJE.defensa.metricas.indexOf(k) !== -1) && claves(ancla).indexOf('AST%') === -1);
check('a un generador sí', claves(creador).every(k => C.POR_EJE.creacion.metricas.indexOf(k) !== -1));
check('el rol y su eje viajan para el texto', ancla.rol === 'Ancla Defensiva' && /defensa/.test(ancla.ejeLabel));
check('sin eje cae a la canasta base', C.ejeDe({ rolFuncional: { eje: null } }) === 'base' && C.ejeDe(null) === 'base');
const noCal = idx.liga.jugadores.find(x => !x.__califica);
check('un jugador sin percentil no se juzga y lo dice', !noCal || C.jugador(idx, noCal, null).califica === false);

/* ===================================================================== */
titulo('3 · play-by-play');
check('la calificación de una situación', C.calificar(0.13).etiqueta === 'Excelente' && C.calificar(0.07).etiqueta === 'Bueno'
  && C.calificar(0).etiqueta === 'Promedio' && C.calificar(-0.07).etiqueta === 'Pobre' && C.calificar(-0.2).etiqueta === 'Muy pobre');
const liga = { f: [[1000, 600, 1300, 0, 0, 0], [2000, 900, 2000, 0, 0, 0], [1000, 400, 850, 0, 0, 0]], ro: [500, 250, 560], fa: [300, 130, 290] };
const acc = { f: [[100, 70, 160, 0, 0, 0], [200, 90, 200, 0, 0, 0], [5, 1, 2, 0, 0, 0]], ro: [40, 15, 30], fa: [0, 0, 0] };
const tipos = C.tiposDePosesion(acc, liga);
check('transición muy por encima de la liga sale Excelente', tipos.find(t => t.id === 'transicion').etiqueta === 'Excelente');
check('una situación con pocos tiros no se califica', tipos.find(t => t.id === 'final').etiqueta === 'Muestra corta');
check('una situación sin tiros no aparece', !tipos.some(t => t.id === 'reinicio'));
check('el reparto suma el 100 % de las tres franjas', Math.abs(tipos.filter(t => t.parte != null).reduce((a, t) => a + t.parte, 0) - 100) < 1e-9);
const zL = [{ zona: 'Z1', i: 1000, c: 600 }, { zona: 'Z5', i: 100, c: 40 }, { zona: 'Z10', i: 500, c: 175 }];
const trampa = C.mediaDistancia([{ zona: 'Z1', i: 50, c: 30 }, { zona: 'Z5', i: 60, c: 15 }, { zona: 'Z10', i: 40, c: 14 }], zL);
check('mucho doble largo con poco rédito es la trampa de media distancia', trampa && trampa.trampa === true, JSON.stringify(trampa));
check('con poco volumen de media no se dice nada', C.mediaDistancia([{ zona: 'Z1', i: 50, c: 30 }, { zona: 'Z5', i: 10, c: 2 }], zL) === null);

const DIR = process.env.MOTORSTATS_INGESTION ? process.env.MOTORSTATS_INGESTION + '/salida/conferencia-norte/web' : '../motorstats-ingestion/salida/conferencia-norte/web';
if (fs.existsSync(DIR)) {
  const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
  let sinNaN = true, conAlgo = 0, hemorragias = 0;
  archivos.forEach((f) => {
    const paq = JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8'));
    const p = C.pbpEquipo(paq);
    const h = C.pbpHtml(p);
    if (/NaN|undefined/.test(h)) sinNaN = false;
    if (p.fortalezas.length + p.alertas.length) conAlgo++;
    if (p.alertas.some(a => /Hemorragia/.test(a.titulo))) hemorragias++;
  });
  check('los paquetes reales de la Conferencia Norte dan conclusiones sin NaN ni undefined', sinNaN && conAlgo > 0, conAlgo + ' de ' + archivos.length);
  check('la hemorragia por pérdidas vivas marca solo el cuarto alto', hemorragias < archivos.length, hemorragias);
} else console.log('  · (sin la carpeta de la ingesta: se saltean los paquetes reales)');
check('sin paquete no revienta', C.pbpEquipo(null).alertas.length === 0 && C.pbpHtml(null) === '');

/* ===================================================================== */
titulo('4 · vista y cableado');
const h = C.html(C.equipo(idx, equipos[0]), { tipo: 'equipo' });
check('la card tiene los tres ejes con su símbolo', /▲/.test(h) && /●/.test(h) && /▼/.test(h) && (h.match(/concl-eje rend-t-/g) || []).length === 3);
check('los tonos no van solo con color', /data-conclusiones="equipo"/.test(h) && /rend-raiz/.test(h));
check('la lectura profunda va plegada', /<details class="rend-detalle/.test(h));
check('sin autocrítica del motor en la card', !/no registra|no trae|no dice si/.test(h));
const fichas = C.fichasEquipo(idx, equipos[0], ['NET RTNG', 'PACE']);
check('las fichas Bento de Equipos: el ritmo en azul informativo', /rend-ficha rend-t-info/.test(fichas) && /rend-fichas/.test(fichas));
const EQ_SRC = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
const JUG_SRC = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
const PBP_SRC = fs.readFileSync('./js/sgadd-pbp.js', 'utf8');
const INF_SRC = fs.readFileSync('./js/sgadd-informe.js', 'utf8');
const HTML = fs.readFileSync('./index.html', 'utf8');
const orden = (src, ids) => ids.map(i => src.indexOf("{ id: '" + i + "',")).every((p, k, a) => p > -1 && (k === 0 || p > a[k - 1]));
check('Equipos: la card es la solapa Diagnóstico, después de General', orden(EQ_SRC.slice(EQ_SRC.indexOf('const EQUIPOS_TABS')), ['general', 'diagnostico', 'ofensiva'])
  && /case 'diagnostico': return equiposConclusiones\(idx, e\);/.test(EQ_SRC) && !/equiposHeader\(idx, e\),\s*equiposConclusiones/.test(EQ_SRC));
check('Jugadores también: GENERAL · DIAGNÓSTICO · TIRO · RENDIMIENTO · EVOLUCIÓN · PARTIDOS', /case 'diagnostico': return jugadoresConclusiones\(idx, j\);/.test(JUG_SRC)
  && !/jugadoresHeader\(idx, j\),\s*jugadoresConclusiones/.test(JUG_SRC)
  && orden(JUG_SRC.slice(JUG_SRC.indexOf('const JUGADORES_TABS')), ['general', 'diagnostico', 'tiro', 'rendimiento', 'evolucion', 'partidos']));
check('las pestañas de Equipos ya no usan statCard sueltas', (EQ_SRC.match(/SGADD_UI\.statCard\(/g) || []).length === 1);
check('el play-by-play se monta en su ranura, y la carga fallida no deja cartel', /tipo === 'conclusiones'/.test(PBP_SRC) && /espacioConclusiones/.test(PBP_SRC));
check('el informe del equipo ofrece la card como sub-card', /equipo\.ficha\.conclusiones/.test(INF_SRC));
check('el módulo carga después de Rendimiento', HTML.indexOf('sgadd-rendimiento.js?v=') < HTML.indexOf('sgadd-conclusiones.js?v='));

titulo('5 · la terna del encabezado PDF');
check('sin contexto, solo MotorStats (como antes)', UI.encabezadoInforme().replace(/<[^>]+>/g, '').trim() === '');
const t = UI.encabezadoInforme({ liga: { url: 'logos/x/liga.png', nombre: 'LIGA' }, equipo: { url: 'logos/x/eq.png', nombre: 'EQUIPO' } });
const iL = t.indexOf('cabecera-liga'), iE = t.indexOf('cabecera-equipo'), iM = t.indexOf('cabecera-motor');
check('liga · equipo · MotorStats, en ese orden', iL > -1 && iL < iE && iE < iM, t);
const sinLogo = UI.encabezadoInforme({ liga: { url: null, nombre: 'TORNEO LOCAL' }, equipo: { url: null, nombre: 'ATENAS' } });
check('sin el logo de la liga va su nombre', /TORNEO LOCAL/.test(sinLogo));
check('liga y equipo van juntos a la izquierda; MotorStats aparte, a la derecha', /cabecera-origen"><span class="cabecera-liga">[\s\S]*cabecera-equipo[\s\S]*<\/span><\/span><span class="cabecera-motor">/.test(t), t);
check('un logo que no carga no deja el alt cortado: aparece el nombre', /alt=""/.test(t) && /onerror="this\.hidden=true;[^"]*hidden=false"/.test(t) && /cabecera-nombre" hidden>LIGA/.test(t));
check('el logo de la liga se precarga al leer el manifiesto', /pre\.src = logoLiga/.test(HTML));
check('el CSS la deja en una sola línea con proporciones fijas', /\.cabecera-terna \{ display: flex/.test(HTML) && /white-space: nowrap/.test(HTML) && /\.cabecera-terna \{ --cab-h: [\d.]+mm; \}/.test(HTML) && /\.cabecera-escudo, \.cabecera-terna \.cabecera-logo \{ height: var\(--cab-h\)/.test(HTML));
check('el logo de la liga sale del manifiesto (`_liga`) y no entra al mapa de equipos', /logoLiga = j\._liga/.test(HTML) && /k\.charAt\(0\) !== '_'/.test(HTML));

console.log('\n' + (mal ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
