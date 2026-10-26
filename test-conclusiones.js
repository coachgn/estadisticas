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
check('Equipos: sus solapas propias y el mismo cierre · Partidos · Quintetos · Mapa de tiro · Diagnóstico',
  orden(EQ_SRC.slice(EQ_SRC.indexOf('const EQUIPOS_TABS')), ['general', 'ofensiva', 'defensiva', '4factores', 'condicion', 'personalidad', 'plantel', 'partidos', 'pbp', 'pbp-tiro', 'diagnostico'])
  && /case 'diagnostico': return equiposConclusiones\(idx, e\);/.test(EQ_SRC) && !/equiposHeader\(idx, e\),\s*equiposConclusiones/.test(EQ_SRC));
check('Jugadores: GENERAL · TIRO · RENDIMIENTO · EVOLUCIÓN · PARTIDOS · QUINTETOS · MAPA DE TIRO · DIAGNÓSTICO', /case 'diagnostico': return jugadoresConclusiones\(idx, j\);/.test(JUG_SRC)
  && !/jugadoresHeader\(idx, j\),\s*jugadoresConclusiones/.test(JUG_SRC)
  && orden(JUG_SRC.slice(JUG_SRC.indexOf('const JUGADORES_TABS')), ['general', 'tiro', 'rendimiento', 'evolucion', 'partidos', 'quintetos', 'mapa', 'diagnostico']));
check('el mapa del jugador salió de Tiro a su propia solapa', /case 'mapa':\s+return jugadoresBloqueMapaPbp\(j\);/.test(JUG_SRC)
  && !/\$\{jugadoresBloqueMapaPbp\(j\)\}/.test(JUG_SRC));
check('Quintetos y Mapa de tiro se ven SIEMPRE: sin la capa, el aviso y no un hueco',
  /EQUIPOS_TABS\.slice\(\)/.test(EQ_SRC) && /avisoSinCapa\(id === 'pbp' \? 'Quintetos' : 'Mapa de tiro'\)/.test(EQ_SRC)
  && /avisoSinCapa\('Quintetos'\)/.test(JUG_SRC) && /avisoSinCapa\('Mapa de tiro'\)/.test(JUG_SRC));
check('las pestañas de Equipos ya no usan statCard sueltas', (EQ_SRC.match(/SGADD_UI\.statCard\(/g) || []).length === 1);
check('el play-by-play se monta en su ranura, y la carga fallida no deja cartel', /tipo === 'conclusiones'/.test(PBP_SRC) && /espacioConclusiones/.test(PBP_SRC));
check('el informe del equipo ofrece la card como sub-card', /equipo\.ficha\.conclusiones/.test(INF_SRC));
check('el módulo carga después de Rendimiento', HTML.indexOf('sgadd-rendimiento.js?v=') < HTML.indexOf('sgadd-conclusiones.js?v='));

/* ===================================================================== */
titulo('4 bis · las cuatro dimensiones y la proyección de mejora');
const e0 = equipos[0];
const c0 = C.equipo(idx, e0);
check('cuatro dimensiones, cada una con ataque y/o defensa', c0.dimensiones.length === 4
  && c0.dimensiones.map(d => d.id).join() === 'ritmo,seleccion,fisica,disciplina' && c0.dimensiones.every(d => d.lados.length));
check('el ritmo es descriptivo: azul, sin percentil', c0.dimensiones[0].lados.find(l => l.lado === 'ataque').tono === 'info'
  && c0.dimensiones[0].lados.find(l => l.lado === 'ataque').percentil === null);
check('cada ítem de los ejes dice su dimensión y su lado', c0.fortalezas.concat(c0.ajustes, c0.alertas).filter(i => i.dim).every(i => i.dim.label && /ataque|defensa/.test(i.dim.lado)));
check('el valor objetivo es el percentil 70 con la dirección de la métrica',
  C.valorObjetivo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], false) === 8 && C.valorObjetivo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], true) === 4 && C.valorObjetivo([1, 2], false) === null);
let todasBien = true, alguna = 0, ordenadas = true, sinASTPP = true;
equipos.forEach((e) => {
  const p = C.equipo(idx, e).proyeccion;
  alguna += p.palancas.length ? 1 : 0;
  p.palancas.forEach((x, i) => {
    if (!(x.percentil < 70 && x.pts > 0 && x.net > 0 && /Costo de oportunidad/.test(x.texto))) todasBien = false;
    if (i && x.pts > p.palancas[i - 1].pts) ordenadas = false;
    if (x.clave === 'AST-PP') sinASTPP = false;
  });
});
check('las palancas salen solo de métricas bajo el percentil 70, con puntos y NET positivos', todasBien && alguna > equipos.length / 2);
check('ordenadas por puntos que recuperan', ordenadas);
check('lo que no tiene camino a puntos no se proyecta (AST-PP)', sinASTPP && !C.PALANCAS_EQ['AST-PP']);
/* La cuenta de posesiones contra una mano: llevar el eFG% de .50 a .55 con
   60 tiros de campo son 6 puntos (0,05 × 2 × 60). */
check('la cuenta del tiro: Δ eFG% × 2 × tiros de campo', Math.abs(C.PALANCAS_EQ['eFG%'].pts(0.05, { TCI: 60 }) - 6) < 1e-9);
check('la cuenta de las pérdidas: cada una vale lo que rinde una jugada que termina',
  Math.abs(C.PALANCAS_EQ['PePP%'].pts(0.02, { PLAYS: 80, PTS: 70, PP: 10 }) - 0.02 * 80 * 1) < 1e-9);
const pal = C.equipo(idx, equipos.find(e => C.equipo(idx, e).proyeccion.palancas.length)).proyeccion.palancas[0];
check('la palanca dice el puesto en NET antes y después', pal.puestoDespues <= pal.puestoAntes && pal.de === equipos.length);
const hP = C.html(C.equipo(idx, equipos[0]), { tipo: 'equipo' });
check('la card trae el Bloque A (dimensiones) y el Bloque B (proyección)', /data-concl-dims="1"/.test(hP) && /data-concl-proyeccion="1"/.test(hP) && /Proyección de umbrales de mejora/.test(hP));
const jq = califica.find(x => C.jugador(idx, x, null).proyeccion.palancas.length);
const pj = C.jugador(idx, jq, null).proyeccion.palancas;
check('el jugador también: lo que suma él y lo que mueve al NET de su equipo', pj.length && pj.every(x => x.pts > 0 && x.net > 0 && /su rol/.test(x.texto)));
check('una misma familia de tiro no se cuenta dos veces', pj.filter(x => ['TS%', 'eFG%', 'PPP'].indexOf(x.clave) !== -1).length <= 1);
const P = require('./js/sgadd-pbp.js');
check('sin la capa, Quintetos y Mapa dicen qué les falta', /data-pbp-sin-capa="1"/.test(P.avisoSinCapa('Quintetos')) && /◆/.test(P.avisoSinCapa('Mapa de tiro')));
if (fs.existsSync(DIR)) {
  const f0 = fs.readdirSync(DIR).filter(f => f.endsWith('.json'))[0];
  const paq = JSON.parse(fs.readFileSync(DIR + '/' + f0, 'utf8'));
  const idJ = String(paq.quintetos[0].ids[0]);
  const hq = P.quintetosJugador(paq, paq.jugadores[idJ].n);
  check('los quintetos del jugador: solo los que lo incluyen, con su On/Off', /data-subcard="quintetos.jugador"/.test(hq) && /On\/Off Net/.test(hq)
    && !/NaN|undefined/.test(hq));
  const enTodos = (paq.quintetos || []).filter(q => q.ids.indexOf(idJ) !== -1).length;
  check('cuenta las mismas alineaciones que el paquete', new RegExp('Alineaciones</div>[\\s\\S]{0,200}?' + enTodos + '</div>').test(hq) && enTodos > 0, enTodos);
  let sinNaNp = true;
  fs.readdirSync(DIR).filter(f => f.endsWith('.json')).forEach((f) => {
    const p2 = C.pbpEquipo(JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8')));
    if (/NaN|undefined/.test(C.pbpHtml(p2))) sinNaNp = false;
    (p2.proyecciones || []).forEach(x => { if (!/^\+\d/.test(x.valor)) sinNaNp = false; });
  });
  check('las prescripciones del play-by-play salen con puntos positivos y sin NaN', sinNaNp);
}

titulo('5 · la terna del encabezado PDF');
check('sin contexto, solo MotorStats (como antes)', UI.encabezadoInforme().replace(/<[^>]+>/g, '').trim() === '');
const t = UI.encabezadoInforme({ liga: { url: 'logos/x/liga.png', nombre: 'LIGA' }, equipo: { url: 'logos/x/eq.png', nombre: 'EQUIPO' } });
const iL = t.indexOf('cabecera-liga'), iE = t.indexOf('cabecera-equipo'), iM = t.indexOf('cabecera-motor');
check('liga · equipo · MotorStats, en ese orden', iL > -1 && iL < iE && iE < iM, t);
const sinLogo = UI.encabezadoInforme({ liga: { url: null, nombre: 'TORNEO LOCAL' }, equipo: { url: null, nombre: 'ATENAS' } });
check('sin el logo de la liga va su nombre', /TORNEO LOCAL/.test(sinLogo));
check('liga y equipo van juntos a la izquierda; MotorStats aparte, a la derecha', /cabecera-origen"><span class="cabecera-liga">[\s\S]*cabecera-equipo[\s\S]*<\/span><\/span><span class="cabecera-motor">/.test(t), t);
check('un logo que no carga no deja el alt cortado: aparece el nombre', /alt=""/.test(t) && /onerror="this\.hidden=true;[^"]*hidden=false"/.test(t) && /cabecera-nombre" hidden>LIGA/.test(t));
check('el scouting lleva el escudo del RIVAL en la terna', /inyectarPieDeHoja\('scoutInforme', null, SCOUT_UI\.__claveRival/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));
check('el logo de la liga se precarga al leer el manifiesto', /pre\.src = logoLiga/.test(HTML));
check('el CSS la deja en una sola línea con proporciones fijas', /\.cabecera-terna \{ display: flex/.test(HTML) && /white-space: nowrap/.test(HTML) && /\.cabecera-terna \{ --cab-h: [\d.]+mm; \}/.test(HTML) && /\.cabecera-escudo, \.cabecera-terna \.cabecera-logo \{ height: var\(--cab-h\)/.test(HTML));
check('el logo de la liga sale del manifiesto (`_liga`) y no entra al mapa de equipos', /logoLiga = j\._liga/.test(HTML) && /k\.charAt\(0\) !== '_'/.test(HTML));

/* ---------- DetectarFilosofiaDT (v311) ---------- */
{
  const fake = (m) => ({ leer: (c, k) => (k in m ? { percentil: m[k], valor: 1 } : null) });
  const E = { clave: 'X' };
  const d = (m) => C.DetectarFilosofiaDT(fake(m), E);
  check('filosofía: ritmo alto => Transición / Vértigo', d({ PACE: 90, 'PT3%': 40, 'RO%': 30, 'RTL%': 30, 'PePP%': 20 }).id === 'transicion');
  check('filosofía: ritmo bajo y cuida la pelota => Set / Control', d({ PACE: 10, 'PT3%': 40, 'RO%': 30, 'RTL%': 30, 'PePP%': 80 }).id === 'set');
  check('filosofía: mucho triple => Perímetro / Analítica', d({ PACE: 50, 'PT3%': 92, 'RO%': 30, 'RTL%': 30, 'PePP%': 50 }).id === 'perimetro');
  check('filosofía: cristal y línea => Físico / Interior', d({ PACE: 50, 'PT3%': 20, 'RO%': 90, 'RTL%': 85, 'PePP%': 50 }).id === 'fisico');
  check('filosofía: nada se separa => Equilibrado', d({ PACE: 50, 'PT3%': 50, 'RO%': 50, 'RTL%': 50, 'PePP%': 50 }).id === 'equilibrado');
  check('filosofía: sin diferencia clara con la segunda => Equilibrado', d({ PACE: 70, 'PT3%': 68, 'RO%': 30, 'RTL%': 30, 'PePP%': 20 }).id === 'equilibrado');
  check('filosofía: sin índice o sin percentiles => null', C.DetectarFilosofiaDT(null, E) === null && d({}) === null);
  const c = C.equipo(fake({ PACE: 90, 'PT3%': 40, 'RO%': 30, 'RTL%': 30, 'PePP%': 20 }), E);
  check('equipo() trae la filosofía y no mueve los cortes', c.filosofia.id === 'transicion' && C.VERDE === 70 && C.ROJO === 40);
  check('la card dice la filosofía', /data-filosofia="transicion"/.test(C.html(c, { tipo: 'equipo' })));
  check('el jugador no lleva filosofía', !('filosofia' in C.jugador(fake({}), {}, null)));
}

/* ---------- DetectarFilosofiaDT híbrida (v312) ---------- */
{
  const fake = (m) => ({ leer: (c, k) => (k in m ? { percentil: m[k], valor: 1 } : null) });
  const E = { clave: 'X' };
  const z = (zona, i) => ({ zona, i, c: Math.round(i / 2) });
  const zonasLiga = [z('Z1', 400), z('Z5', 300), z('Z10', 300)];
  // Un paquete que corre mucho: 40 % de sus tiros en 0-7 s contra 20 % de la liga.
  const paqVertigo = {
    liga: { reloj: { f: [[200, 100, 220], [500, 250, 500], [300, 120, 260]] }, zonas: zonasLiga,
      rendimiento: { cortes: { linea: { p25: 0.2, p50: 0.3, p75: 0.4 }, tcdp: { p25: 0.2, p50: 0.25, p75: 0.3 } } } },
    reloj: { favor: { f: [[80, 40, 90], [80, 40, 80], [40, 15, 35]] } },
    tiros: { zonas: [z('Z1', 40), z('Z5', 30), z('Z10', 30)] },
  };
  const sp = C.senalesPbp(paqVertigo);
  check('PBP: el ritmo sale de la parte de tiros en 0-7 s contra la liga', sp && sp.ritmo === 100);
  check('PBP: selección con triple y aro contra la liga (igual reparto = 50)', sp.triple === 50 && sp.aro === 50);
  check('PBP: lo que el paquete no trae no pesa (sin rendimiento no hay línea ni TCDP)', !('linea' in sp) && !('cuida' in sp));
  const boxEquilibrado = { PACE: 50, 'PT3%': 50, 'RO%': 50, 'RTL%': 50, 'PePP%': 50 };
  check('sin paquete: fallback al box score', C.DetectarFilosofiaDT(fake(boxEquilibrado), E).fuente === 'box'
    && C.DetectarFilosofiaDT(fake(boxEquilibrado), E).id === 'equilibrado');
  const h = C.DetectarFilosofiaDT(fake(boxEquilibrado), E, paqVertigo);
  check('con paquete: híbrida, y el ritmo del PBP define Transición', h.fuente === 'hibrida' && h.id === 'transicion', h);
  check('híbrida = promedio de box y PBP en cada filosofía', h.puntajes.transicion === 75);
  check('paquete sin señales útiles: sigue el box, sin errores', C.DetectarFilosofiaDT(fake(boxEquilibrado), E, { liga: {} }).fuente === 'box'
    && C.DetectarFilosofiaDT(fake(boxEquilibrado), E, null).fuente === 'box');
  check('sin box y con paquete: sale solo del PBP', C.filosofiaHibrida(null, paqVertigo).fuente === 'pbp');
  const conRend = Object.assign({}, paqVertigo, { rendimiento: {
    jugadores: { a: { fr: [60, 10, 10, 5, 5, 0, 0, 0, 0], pp: [40, 20, 0, 4] } }, faltasEq: [30, 4, 1, 8] } });
  const sp2 = C.senalesPbp(conRend);
  check('PBP: faltas que van a la línea contra la mediana, pérdidas castigadas y bonus', sp2.linea > 50 && sp2.cuida > 50 && sp2.bonus > 50, sp2);
  // La línea del box se refina en el montaje sin volver a leer el índice.
  const f0 = C.DetectarFilosofiaDT(fake(boxEquilibrado), E);
  const html0 = C.filosofiaHtml(f0, false);
  check('la línea del box lleva sus puntajes para refinarse', /data-filosofia-box=/.test(html0) && /data-filosofia-fuente="box"/.test(html0));
  const attrs = { 'data-filosofia-box': JSON.stringify(f0.puntajes) };
  const nodo = { getAttribute: (k) => (k in attrs ? attrs[k] : null), outerHTML: html0 };
  const fr = C.refinarFilosofia(nodo, paqVertigo);
  check('refinarFilosofia reemplaza la línea por la híbrida', fr.id === 'transicion' && /data-filosofia-fuente="hibrida"/.test(nodo.outerHTML)
    && /box score \+ play-by-play/.test(nodo.outerHTML));
  const nodo2 = { getAttribute: (k) => (k in attrs ? attrs[k] : null), outerHTML: html0 };
  C.refinarFilosofia(nodo2, null);
  check('refinarFilosofia sin paquete no toca la línea', nodo2.outerHTML === html0);
  const PBP_SRC = fs.readFileSync('js/sgadd-pbp.js', 'utf8');
  check('el montaje de las conclusiones refina la filosofía', /C\.refinarFilosofia\(fil, paq\)/.test(PBP_SRC));
  check('los cortes no se tocan', C.VERDE === 70 && C.ROJO === 40);
}

console.log('\n' + (mal ? '✗ HAY FALLAS' : '✓ TODO OK') + '   ' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
