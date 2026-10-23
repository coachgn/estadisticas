/* =====================================================================
   LA MUESTRA DE EQUIPOS Y JUGADORES · el selector de período (punto 139)

   Fase 1: la familia de CALENDARIO (todo el tramo, últimas N semanas,
   rango de fechas). Corre sobre el snapshot real de la demo —17 equipos,
   272 partidos, anonimizado y commiteado— y ejerce `sgadd-app.js` REAL en
   un `vm`: lo que se prueba es qué índice reciben las secciones, no el
   fuente.
   ===================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));
const casi = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol || 1e-6);

const SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
const M = require('./js/sgadd-muestra.js');
const UI_SRC = fs.readFileSync('./js/sgadd-ui.js', 'utf8');
const APP_SRC = fs.readFileSync('./js/sgadd-app.js', 'utf8');
const MUESTRA_SRC = fs.readFileSync('./js/sgadd-muestra.js', 'utf8');

const crudo = JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8'));
const r0 = DEMO.rehidratar(crudo);
const HOJAS = r0.hojas || r0;
const TRAMO = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(HOJAS));
const DIAS = M.diasDelTramo(HOJAS, TRAMO);

/* =====================================================================
   1 · EL MOTOR PURO
   ===================================================================== */
titulo('1 · normalizar, clave, ventana y etiqueta');

check('lo que no se entiende es «todo»', M.normalizar(null).tipo === 'todo' && M.normalizar({ tipo: 'x' }).tipo === 'todo');
check('semanas fuera de rango → todo', M.normalizar({ tipo: 'semanas', n: 0 }).tipo === 'todo'
  && M.normalizar({ tipo: 'semanas', n: M.MAX_SEMANAS + 1 }).tipo === 'todo');
check('semanas válidas quedan', M.normalizar({ tipo: 'semanas', n: '2' }).n === 2);
const alReves = M.normalizar({ tipo: 'rango', desde: '2026-03-10', hasta: '2026-03-01' });
check('un rango al revés se da vuelta', alReves.desde === '2026-03-01' && alReves.hasta === '2026-03-10');
check('un rango sin fechas válidas → todo', M.normalizar({ tipo: 'rango', desde: 'ayer' }).tipo === 'todo');
check('la clave distingue cada muestra', M.clave({ tipo: 'semanas', n: 2 }) !== M.clave({ tipo: 'semanas', n: 3 })
  && M.clave(null) === 'todo');
check('activa() es falsa solo para todo', !M.activa({ tipo: 'todo' }) && M.activa({ tipo: 'semanas', n: 1 }));
check('restarDias cruza el mes', M.restarDias('2026-03-01', 1) === '2026-02-28');
check('restarDias cruza el año', M.restarDias('2026-01-03', 7) === '2025-12-27');
check('los días del tramo salen ordenados', DIAS.length > 50 && DIAS.every((d, i) => !i || DIAS[i - 1] < d), DIAS.length);
const v2 = M.ventana({ tipo: 'semanas', n: 2 }, DIAS);
check('la ventana de semanas se ancla al ÚLTIMO día con partidos', v2.hasta === DIAS[DIAS.length - 1]);
check('dos semanas son 14 días, contando los dos extremos', M.restarDias(v2.hasta, 13) === v2.desde, JSON.stringify(v2));
check('«todo» no tiene ventana', M.ventana({ tipo: 'todo' }, DIAS) === null);
check('un rango con un solo extremo toma el otro del tramo',
  M.ventana({ tipo: 'rango', desde: '2026-01-01' }, DIAS).hasta === DIAS[DIAS.length - 1]);
check('etiquetas', M.etiqueta({ tipo: 'semanas', n: 1 }) === 'Última semana'
  && M.etiqueta({ tipo: 'semanas', n: 3 }) === 'Últimas 3 semanas'
  && M.etiqueta({ tipo: 'rango', desde: '2026-02-01', hasta: '2026-02-15' }) === 'Del 01/02 al 15/02');

/* =====================================================================
   2 · EL RECORTE DE LAS HOJAS
   ===================================================================== */
titulo('2 · recortar: solo partidos de la ventana, sin las derivadas');

const rec = M.recortar(HOJAS, TRAMO, v2);
const enV = (d) => d >= v2.desde && d <= v2.hasta;
const diaDe = (f) => M.diaIso(SGADD.fecha(f['FECHA']));
check('las derivadas NO viajan (ACUMULADO J traería la temporada)',
  Object.keys(rec.hojas).sort().join(',') === ['4 FACTORES', 'Base Datos E', 'Base Datos J'].join(','), Object.keys(rec.hojas));
check('ninguna fila de Base Datos E fuera de la ventana', rec.hojas['Base Datos E'].filas.every(f => enV(diaDe(f))));
const esperados = new Set(HOJAS['Base Datos E'].filas.filter(f => enV(diaDe(f) || '')).map(f => diaDe(f) + '|' + SGADD.texto(f['PARTIDO']).toUpperCase()));
check('partidos = los cruces distintos de la ventana', rec.partidos === esperados.size && rec.partidos > 0, rec.partidos + ' vs ' + esperados.size);
check('total = los partidos del tramo', rec.total === new Set(HOJAS['Base Datos E'].filas.map(f => (diaDe(f) || '') + '|' + SGADD.texto(f['PARTIDO']).toUpperCase())).size);
check('ninguna fila de jugador fuera de la ventana', rec.hojas['Base Datos J'].filas.every(f => !diaDe(f) || enV(diaDe(f))));

/* Una fila de jugador SIN fecha: entra si su PARTIDO tiene una sola noche,
   queda afuera (y se cuenta) si tiene dos. */
const sintetico = {
  'Base Datos E': { cols: ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE'], filas: [
    { FECHA: '05/03/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'REGULAR' },
    { FECHA: '05/03/2026', PARTIDO: 'A vs B', EQUIPO: 'B', FASE: 'REGULAR' },
    { FECHA: '01/02/2026', PARTIDO: 'C vs D', EQUIPO: 'C', FASE: 'REGULAR' },
    { FECHA: '06/03/2026', PARTIDO: 'C vs D', EQUIPO: 'C', FASE: 'REGULAR' },
  ] },
  'Base Datos J': { cols: ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE'], filas: [
    { FECHA: '', PARTIDO: 'A vs B', NOMBRES: 'X', EQUIPO: 'A', FASE: 'REGULAR' },
    { FECHA: '', PARTIDO: 'C vs D', NOMBRES: 'Y', EQUIPO: 'C', FASE: 'REGULAR' },
  ] },
  'ACUMULADO J': { cols: ['NOMBRES'], filas: [{ NOMBRES: 'X' }] },
};
const rs = M.recortar(sintetico, { fase: 'REGULAR', torneo: 'GENERAL' }, { desde: '2026-03-01', hasta: '2026-03-31' });
check('sin fecha y con UNA noche: se ubica por el PARTIDO', rs.hojas['Base Datos J'].filas.some(f => f.NOMBRES === 'X'));
check('sin fecha y con DOS noches: queda afuera y se cuenta', !rs.hojas['Base Datos J'].filas.some(f => f.NOMBRES === 'Y') && rs.sinFecha === 1, rs.sinFecha);
check('una hoja que el libro no trae no se inventa', rs.hojas['4 FACTORES'] === undefined);
const otraFase = M.recortar({ 'Base Datos E': { cols: [], filas: [
  { FECHA: '05/03/2026', PARTIDO: 'A vs B', EQUIPO: 'A', FASE: 'PLAYOFF' }] } }, { fase: 'REGULAR' }, { desde: '2026-03-01', hasta: '2026-03-31' });
check('nunca se mezclan fases', otraFase.partidos === 0);

/* =====================================================================
   3 · EL ÍNDICE DEL RECORTE
   ===================================================================== */
titulo('3 · el recorte se rearma con el motor del TOTAL');

const base = SGADD.construirIndice(HOJAS, { fase: TRAMO.fase, torneo: TRAMO.torneo });
const entero = M.recortar(HOJAS, TRAMO, { desde: DIAS[0], hasta: DIAS[DIAS.length - 1] });
const idxEntero = SGADD.construirIndice(entero.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
/* LA PRUEBA FUERTE: con la ventana cubriendo todo el tramo, el recorte
   reproduce lo que la hoja de promedios declara. Si el recálculo de las
   tasas o del rival se desviara, esto falla en todos los equipos. */
['PTS', 'eFG%', 'PACE', 'RTNG OFF', 'RO%'].forEach(k => {
  const malos = base.lista().filter(e => {
    const a = base.leer(e.clave, k), b = idxEntero.leer(e.clave, k);
    return !(a && b && a.valor !== null && casi(a.valor, b.valor, 0.02 * Math.max(1, Math.abs(a.valor))));
  }).map(e => e.nombre);
  check('ventana completa = la temporada · ' + k, !malos.length, malos.join(', '));
});
const idx2 = SGADD.construirIndice(rec.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
const e0 = idx2.lista()[0];
const pjReal = rec.hojas['Base Datos E'].filas.filter(f => SGADD.claveEquipo(f['EQUIPO']) === e0.clave).length;
check('el PJ de un equipo es el de la ventana', e0.pj === pjReal, e0.pj + ' vs ' + pjReal);
check('la distribución de la liga es la de la ventana', (idx2.liga.distribuciones['PTS'] || []).length === idx2.lista().length);
check('los jugadores se recalculan desde el log', idx2.liga.jugadores.length > 0 && idx2.liga.jugadores.every(j => j['PJ'] <= 4 + 2));

/* =====================================================================
   4 · LA COMPARACIÓN CONTRA LA TEMPORADA PROPIA
   ===================================================================== */
titulo('4 · comparar(período, temporada)');

const c1 = M.comparar({ valor: 90, invertida: false }, { valor: 80, formateado: '80' });
check('más es mejor: subir es «arriba»', c1.estado === 'arriba' && c1.direccion === 1 && c1.delta === 10);
const c2 = M.comparar({ valor: 0.12, invertida: true }, { valor: 0.15 });
check('en una invertida, bajar es «arriba»', c2.estado === 'arriba' && c2.direccion === -1);
const c3 = M.comparar({ valor: 72, descriptiva: true }, { valor: 70 });
check('una descriptiva no tiene lado bueno', c3.estado === null && c3.direccion === 1);
const c4 = M.comparar({ valor: 80.5 }, { valor: 80 });
check('menos del 2,5 % es «en su media»', c4.estado === 'media' && c4.direccion === 0);
check('sin dato de un lado no se compara', M.comparar({ valor: null }, { valor: 3 }) === null && M.comparar({ valor: 3 }, null) === null);

/* =====================================================================
   5 · SGADD_APP REAL · idxVista, caché, recorte del cliente y barra
   ===================================================================== */
titulo('5 · idxVista() en sgadd-app.js real');

function armarApp(opciones) {
  const o = opciones || {};
  const sesionMem = new Map();
  const ctx = {
    console, Promise, JSON, Math, Date, Map, Set, Array, Object, String, Number, RegExp,
    SGADD: SGADD,
    window: { location: { hash: '' } },
    sessionStorage: { getItem: k => (sesionMem.has(k) ? sesionMem.get(k) : null), setItem: (k, v) => sesionMem.set(k, String(v)) },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    setTimeout: () => 0, clearTimeout() {},
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(MUESTRA_SRC, ctx, { filename: 'sgadd-muestra.js' });
  vm.runInContext(UI_SRC + '\nthis.SGADD_UI = SGADD_UI;', ctx, { filename: 'sgadd-ui.js' });
  vm.runInContext(APP_SRC + '\nthis.SGADD_APP = SGADD_APP; this.SGADD_MUESTRA = SGADD_MUESTRA;', ctx, { filename: 'sgadd-app.js' });
  const A = ctx.SGADD_APP;
  A.estado.planillaId = 'demo';
  A.estado.hojas = HOJAS;
  A.estado.torneo = TRAMO.torneo; A.estado.fase = TRAMO.fase;
  A.estado.idx = base;
  A.estado.alcance = o.recortado ? { hojasRecortadas: ['Base Datos J'] } : null;
  let avisos = 0;
  A.onCambio(() => { avisos++; });
  return { A, ctx, sesionMem, avisos: () => avisos };
}

const { A, sesionMem, avisos } = armarApp();
check('con la muestra apagada, idxVista ES estado.idx', A.idxVista() === base && A.infoMuestra() === null);
A.cambiarMuestra({ tipo: 'semanas', n: 2 });
check('cambiar la muestra avisa a las secciones', avisos() === 1);
const vista = A.idxVista();
check('con muestra, otro índice, marcado', vista !== base && !!vista.__muestra && vista.__muestra.partidos === rec.partidos);
check('el índice base no se toca (Clasificación, buzón, alertas)', A.estado.idx === base);
check('se cachea: dos lecturas, el mismo objeto', A.idxVista() === vista);
check('la muestra se recuerda por planilla en sessionStorage', /semanas/.test(sesionMem.get('sgadd.muestra.demo') || ''));
check('y se vuelve a leer', A.muestraRecordada('demo').n === 2 && A.muestraRecordada('otra').tipo === 'todo');
A.cambiarMuestra({ tipo: 'semanas', n: 2 });
check('repetir la misma muestra no avisa', avisos() === 1);

const eq = vista.lista()[0];
const rl = vista.leer(eq.clave, 'PTS');
const rb = base.leer(eq.clave, 'PTS');
check('leer() del recorte trae «propio»: el dato en su temporada', rl.propio && casi(rl.propio.valor, rb.valor) && casi(rl.propio.delta, rl.valor - rb.valor), JSON.stringify(rl.propio));
check('el percentil es contra la liga DEL PERÍODO', rl.n === vista.lista().length);
const vv = vista.leerVista(eq.clave, 'eficiencia');
check('leerVista() trae «propio» en cada fila', vv && vv.filas.length && vv.filas.every(f => f.propio !== undefined));
const jug = vista.liga.jugadores.find(j => j.__califica) || vista.liga.jugadores[0];
const rj = vista.leerJugador(jug, 'PTS');
check('leerJugador() trae «propio»', rj && rj.propio && typeof rj.propio.valor === 'number');
check('el ranking del recorte sigue andando', !!vista.ranking(eq.clave, 'PTS'));

A.cambiarMuestra({ tipo: 'rango', desde: '2000-01-01', hasta: '2000-01-31' });
check('una ventana sin partidos devuelve el tramo entero y lo dice', A.idxVista() === base && A.infoMuestra().vacia === true);

A.cambiarMuestra({ tipo: 'todo' });
check('«todo» vuelve al índice base', A.idxVista() === base);

const R = armarApp({ recortado: true });
R.A.cambiarMuestra({ tipo: 'semanas', n: 2 });
check('con Base Datos J recortada, Jugadores sigue en la temporada', R.A.idxVista({ jugadores: true }) === base);
check('y Equipos sí recorta', R.A.idxVista() !== base);
check('el PDF de jugadores no declara una muestra que no aplicó', R.A.textoMuestra({ jugadores: true }) === '');
check('el de equipos sí', /^Muestra: Últimas 2 semanas/.test(R.A.textoMuestra()), R.A.textoMuestra());

titulo('5 bis · la fila de la barra');
const B = armarApp();
const sinMuestra = B.A.barraMuestra('equipos');
check('la barra ofrece el selector', /id="selMuestra"/.test(sinMuestra) && /Últimas 2 semanas/.test(sinMuestra) && /Rango de fechas/.test(sinMuestra));
check('sin muestra activa no hay badge', !/Muestra activa/.test(sinMuestra));
check('las fechas aparecen solo con el rango', !/id="muestraDesde"/.test(sinMuestra));
B.A.elegirMuestra('rango');
check('«Rango de fechas…» arranca cubriendo el tramo', B.A.estado.muestra.desde === DIAS[0] && B.A.estado.muestra.hasta === DIAS[DIAS.length - 1]);
const conRango = B.A.barraMuestra('equipos');
check('con rango, los dos campos de fecha acotados al tramo', /id="muestraDesde"/.test(conRango) && conRango.indexOf('min="' + DIAS[0] + '"') !== -1);
B.A.elegirMuestra('semanas:3');
const conBadge = B.A.barraMuestra('jugadores');
check('el badge dice el estado con palabras, no solo color', /◷ Muestra activa/.test(conBadge) && /role="status"/.test(conBadge));
check('el badge dice cuántos partidos entraron', new RegExp('· ' + B.A.infoMuestra().partidos + ' de \\d+ partidos').test(conBadge));
check('el badge avisa lo que NO se recorta', /Quintetos, Mapa de tiro/.test(conBadge) && /tabla de posiciones no cambia/.test(conBadge));
check('y ofrece quitarla', /cambiarMuestra\(\{ tipo: 'todo' \}\)/.test(conBadge));
const Rb = armarApp({ recortado: true });
Rb.A.elegirMuestra('semanas:2');
check('Jugadores con el log recortado dice que ve la temporada', /tu plan ve la temporada completa/.test(Rb.A.barraMuestra('jugadores'))
  && !/tu plan ve la temporada completa/.test(Rb.A.barraMuestra('equipos')));

/* =====================================================================
   6 · LAS CARDS · ▲▼ contra la temporada
   ===================================================================== */
titulo('6 · statCard y metricTable con «propio»');
const ctxUI = { SGADD: SGADD, console };
vm.createContext(ctxUI);
vm.runInContext(UI_SRC + '\nthis.SGADD_UI = SGADD_UI;', ctxUI);
const UI = ctxUI.SGADD_UI;
const r = Object.assign({}, rl);
const card = UI.statCard(r);
check('la card dice «vs su temporada» con flecha', /vs su temporada|en su media/.test(card) && /[▲▼=]/.test(card));
check('sin muestra la card no cambia', !/su temporada/.test(UI.statCard(rb)));
const desc = UI.statCard({ clave: 'PACE', label: 'PACE', valor: 72, formateado: '72', delta: null, descriptiva: true,
  propio: M.comparar({ valor: 72, descriptiva: true }, { valor: 70, formateado: '70' }) });
check('en una descriptiva la flecha va sin color', /text-muted font-mono" title="Su temporada: 70">\s*▲/.test(desc), desc.replace(/\s+/g, ' ').slice(0, 400));
const tabla = UI.metricTable(vv);
check('la tabla suma la columna «Temporada»', />Temporada</.test(tabla));
check('sin muestra la tabla queda como antes', !/Temporada/.test(UI.metricTable(base.leerVista(eq.clave, 'eficiencia'))));

/* =====================================================================
   7 · EL CABLEADO
   ===================================================================== */
titulo('7 · quién lee la vista y quién no');
const src = (f) => fs.readFileSync(f, 'utf8');
const EQ = src('./js/sgadd-equipos.js'), JG = src('./js/sgadd-jugadores.js'), FI = src('./js/sgadd-ficha.js'),
  IN = src('./js/sgadd-informe.js'), CL = src('./js/sgadd-clasificacion.js'), HTML = src('./index.html');
check('Equipos pinta desde idxVista(), y el detalle del partido desde la temporada',
  /const idx = \(EQUIPOS\.partido \|\| typeof SGADD_APP\.idxVista !== 'function'\) \? st\.idx : SGADD_APP\.idxVista\(\)/.test(EQ));
check('Equipos y Jugadores piden la fila de la muestra en la barra',
  /barra\(\{ extra: volver, muestra: 'equipos' \}\)/.test(EQ) && /barra\(\{ extra: volver, muestra: 'jugadores' \}\)/.test(JG));
check('Jugadores pide la vista con { jugadores: true }', /SGADD_APP\.idxVista\(\{ jugadores: true \}\)/.test(JG));
check('la ficha y el Pack leen la vista (estado.idx solo de respaldo adentro de idxFicha)',
  /function idxFicha\(\)/.test(FI) && (FI.match(/SGADD_APP\.estado\.idx/g) || []).length === 1);
check('el informe de equipo lee la vista', /SGADD_APP\.idxVista\(\)/.test(IN));
check('los dos PDF declaran la muestra en su encabezado', /textoMuestra\(\{ jugadores: true \}\)/.test(FI) && /textoMuestra\(\)/.test(IN));
check('en una muestra los partidos manuales no se suman', /idx && idx\.__muestra\) \? \[\] : clasifManualesVigentes\(\)/.test(CL));
const iM = HTML.indexOf('js/sgadd-muestra.js'), iA = HTML.indexOf('js/sgadd-app.js');
check('sgadd-muestra.js carga ANTES que sgadd-app.js', iM !== -1 && iM < iA);
check('assets en v298', /sgadd-muestra\.js\?v=298/.test(HTML) && !/\?v=297/.test(HTML));
check('el CSS del badge va a mano en el <style>', /\.muestra-badge \{/.test(HTML));

console.log('\n' + ok + ' ok · ' + fail + ' fallas');
if (fail) { console.log('HAY FALLAS'); process.exit(1); }
