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
    /* El selector se ofrece solo a los clubes habilitados (barraMuestra). */
    CLUB: { estado: { id: o.club || 'deportivo' } },
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
check('un club fuera de la lista habilitada no ve el selector', armarApp({ club: 'jujuy' }).A.barraMuestra('equipos') === '');
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
  /(?:const|let) idx = \(EQUIPOS\.partido \|\| typeof SGADD_APP\.idxVista !== 'function'\) \? st\.idx : SGADD_APP\.idxVista\(\)/.test(EQ));
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
check('assets en v317', /sgadd-muestra\.js\?v=317/.test(HTML) && !/\?v=29\d/.test(HTML));
check('el CSS del badge va a mano en el <style>', /\.muestra-badge \{/.test(HTML));

/* =====================================================================
   8 · FAMILIA 2 · cada equipo en SU condición
   ===================================================================== */
titulo('8 · familia 2: normalizar, familia y etiqueta');

check('los tipos de la familia 2 se normalizan', M.normalizar({ tipo: 'ultimos', n: 5 }).n === 5
  && M.normalizar({ tipo: 'condicion', valor: 'local' }).valor === 'LOCAL'
  && M.normalizar({ tipo: 'resultado', valor: 'perdido' }).valor === 'PERDIDO'
  && M.normalizar({ tipo: 'rival', rival: 'equipo 2' }).rival === 'EQUIPO 2');
check('lo que no se entiende es «todo»', M.normalizar({ tipo: 'ultimos', n: 0 }).tipo === 'todo'
  && M.normalizar({ tipo: 'ultimos', n: M.MAX_ULTIMOS + 1 }).tipo === 'todo'
  && M.normalizar({ tipo: 'condicion', valor: 'NEUTRAL' }).tipo === 'todo'
  && M.normalizar({ tipo: 'rival', rival: '  ' }).tipo === 'todo');
check('familia() separa calendario de equipo', M.familia({ tipo: 'semanas', n: 2 }) === 'calendario'
  && M.familia({ tipo: 'condicion', valor: 'LOCAL' }) === 'equipo' && M.familia(null) === null);
check('las claves no chocan entre tipos', new Set([
  { tipo: 'ultimos', n: 3 }, { tipo: 'semanas', n: 3 }, { tipo: 'condicion', valor: 'LOCAL' },
  { tipo: 'condicion', valor: 'VISITANTE' }, { tipo: 'resultado', valor: 'GANADO' }, { tipo: 'rival', rival: 'A' },
].map(M.clave)).size === 6);
check('etiquetas', M.etiqueta({ tipo: 'ultimos', n: 5 }) === 'Sus últimos 5 partidos'
  && M.etiqueta({ tipo: 'condicion', valor: 'LOCAL' }) === 'Solo de local'
  && M.etiqueta({ tipo: 'resultado', valor: 'GANADO' }) === 'Solo ganados'
  && M.etiqueta({ tipo: 'rival', rival: 'EQUIPO 2' }, 'Equipo 2') === 'Contra Equipo 2');

titulo('8 bis · recortarPorCondicion + conservar: la liga en esa misma condición');
const OPC = (r) => ({ fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL, conservar: r.conservar });
const idxDe = (m) => { const r = M.recortarPorCondicion(HOJAS, TRAMO, m); return { r, idx: SGADD.construirIndice(r.hojas, OPC(r)) }; };
const sinContexto = (ix) => !ix.lista().some(e => e.clave.indexOf('CONTEXTO') === 0)
  && !ix.liga.jugadores.some(j => /^CONTEXTO/.test(SGADD.texto(j['EQUIPO'])));

const LOC = idxDe({ tipo: 'condicion', valor: 'LOCAL' });
check('de local: ningún equipo de contexto queda en la lista ni en los jugadores', sinContexto(LOC.idx));
check('de local: el otro lado entra rotulado como contexto',
  LOC.r.hojas['Base Datos E'].filas.some(f => /^CONTEXTO /.test(f['EQUIPO'])));
check('de local: toda fila propia es de local',
  LOC.r.hojas['Base Datos E'].filas.filter(f => !/^CONTEXTO /.test(f['EQUIPO'])).every(f => SGADD.texto(f['CONDICION']).toUpperCase() === 'LOCAL'));
check('la distribución de la liga es de los equipos en su condición, sin contexto',
  (LOC.idx.liga.distribuciones['PTS'] || []).length === LOC.idx.lista().length && LOC.idx.lista().length === base.lista().length);
check('de local: cada equipo tiene sus partidos de local, ni uno más',
  LOC.idx.lista().every(e => base.get(e.clave) && e.pj === base.get(e.clave).partidos.filter(p => SGADD.texto(p['CONDICION']).toUpperCase() === 'LOCAL').length));
check('los jugadores son solo los del lado que cumple', LOC.idx.lista().every(e =>
  (LOC.idx.liga.jugadoresPorEquipo.get(e.clave) || []).every(j => j['PJ'] <= e.pj)));

/* LA PRUEBA FUERTE: para cada equipo, el índice compuesto da EXACTAMENTE
   lo mismo que un índice armado solo con SUS partidos en esa condición
   (los dos lados de cada uno). Si el contexto contaminara un promedio o
   faltara el rival en una tasa, cae en algún equipo. */
const idsDe = (e, pred) => new Set(e.partidos.filter(pred).map(p => M.diaIso(SGADD.fecha(p['FECHA'])) + '|' + SGADD.texto(p['PARTIDO']).toUpperCase()));
const idF = (f) => M.diaIso(SGADD.fecha(f['FECHA'])) + '|' + SGADD.texto(f['PARTIDO']).toUpperCase();
function dedicado(clave, ids) {
  const sel = (H, soloPropio) => ({ cols: H.cols, filas: H.filas.filter(f => ids.has(idF(f)) && (!soloPropio || SGADD.claveEquipo(f['EQUIPO']) === clave)) });
  return SGADD.construirIndice({
    'Base Datos E': sel(HOJAS['Base Datos E']), '4 FACTORES': sel(HOJAS['4 FACTORES']), 'Base Datos J': sel(HOJAS['Base Datos J'], true),
  }, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
}
['PTS', 'eFG%', 'RO%', 'RTNG DEF', 'PACE', 'NET RTNG'].forEach(k => {
  const malos = base.lista().filter(e => {
    const ded = dedicado(e.clave, idsDe(e, p => SGADD.texto(p['CONDICION']).toUpperCase() === 'LOCAL'));
    const a = LOC.idx.leer(e.clave, k), b = ded.leer(e.clave, k);
    return !(a && b && (a.valor === b.valor || casi(a.valor, b.valor, 1e-9)));
  }).map(e => e.nombre);
  check('de local = su índice dedicado · ' + k, !malos.length, malos.join(', '));
});

const GAN = idxDe({ tipo: 'resultado', valor: 'GANADO' });
check('ganados: todo equipo con récord invicto en la muestra', GAN.idx.lista().every(e => e.record.perdidos === 0 && e.record.ganados === e.pj));
check('ganados: sin contexto', sinContexto(GAN.idx));

const ULT = idxDe({ tipo: 'ultimos', n: 5 });
const ultimosOk = base.lista().every(e => {
  const fechas = e.partidos.map(p => M.diaIso(SGADD.fecha(p['FECHA']))).filter(Boolean).sort();
  const vista5 = ULT.idx.get(e.clave);
  const propios = vista5 ? vista5.partidos.map(p => M.diaIso(SGADD.fecha(p['FECHA']))).sort() : [];
  return vista5 && vista5.pj === Math.min(5, fechas.length) && propios.join() === fechas.slice(-5).join();
});
check('sus últimos 5: cada equipo, SUS cinco más recientes', ultimosOk);
check('los últimos 5 son de cada uno: no los mismos días para todos',
  new Set(ULT.idx.lista().map(e => e.partidos.map(p => p['FECHA']).join())).size > 1);

const rivalClave = base.lista()[1].clave;
const RIV = idxDe({ tipo: 'rival', rival: rivalClave });
check('contra un rival: el rival no está en la vara (no se enfrenta a sí mismo)', !RIV.idx.get(rivalClave));
check('contra un rival: cada partido propio es contra ese rival', RIV.idx.lista().every(e => e.partidos.every(p =>
  SGADD.texto(p['PARTIDO']).split(/\s+vs\s+/i).some(x => SGADD.claveEquipo(x) === rivalClave))));
check('contra un rival: los demás equipos son la vara de cómo le fue a la liga contra él', RIV.idx.lista().length === base.lista().length - 1);
check('porEquipo cuenta los partidos de cada uno', RIV.r.porEquipo.get(base.lista()[0].clave) === RIV.idx.get(base.lista()[0].clave).pj);

titulo('8 ter · el núcleo: conservar solo actúa en el TOTAL y no rompe el rival');
const sinCons = SGADD.construirIndice(LOC.r.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
check('sin `conservar`, el contexto aparece como equipo (lo que la opción evita)', sinCons.lista().some(e => e.clave.indexOf('CONTEXTO') === 0));
const e1 = LOC.idx.lista()[0];
check('con `conservar`, el DRTG sigue saliendo (el rival se leyó del contexto)', LOC.idx.leer(e1.clave, 'RTNG DEF').valor !== null);

/* =====================================================================
   9 · FAMILIA 2 EN SGADD_APP · badge, muestra chica y rival
   ===================================================================== */
titulo('9 · familia 2 en sgadd-app.js real');
const F = armarApp();
const EQ1 = base.lista()[0], EQ2 = base.lista()[1];
F.ctx.EQUIPOS = { equipo: EQ1.clave.toLowerCase().replace(/\s+/g, '-') };
F.ctx.currentSection = 'equipos';
F.A.elegirMuestra('condicion:LOCAL');
const vF = F.A.idxVista();
check('de local: la vista es de la familia 2', vF !== base && vF.__muestra.familia === 'equipo');
check('el percentil se mide contra los equipos de local', vF.leer(EQ1.clave, 'PTS').n === base.lista().length);
check('«propio» sigue siendo contra su temporada entera', casi(vF.leer(EQ1.clave, 'PTS').propio.valor, base.leer(EQ1.clave, 'PTS').valor));
const bF = F.A.barraMuestra('equipos');
check('el badge explica la vara por condición', /cada equipo se mide en su propia condición/i.test(bF));
check('en la familia 2 el badge no inventa un rango de fechas', !/\d\d\/\d\d → \d\d\/\d\d/.test(bF));
check('el desplegable marca la opción elegida', /value="condicion:LOCAL" selected/.test(bF));
check('las dos familias van agrupadas', /optgroup label="Calendario/.test(bF) && /optgroup label="Del equipo/.test(bF));
check('el PDF lo declara', /cada equipo medido en su propia condición/.test(F.A.textoMuestra()));

const rivs = F.A.rivalesParaMuestra(base, 'equipos');
check('los rivales ofrecidos son los que enfrentó, sin él mismo', rivs.length > 0 && !rivs.some(r => r.clave === EQ1.clave)
  && rivs.every((r, i) => !i || rivs[i - 1].nombre.localeCompare(r.nombre) <= 0));
F.A.elegirMuestra('rival');
check('«Contra un rival…» arranca con el primero de la lista', F.A.estado.muestra.tipo === 'rival' && F.A.estado.muestra.rival === rivs[0].clave);
F.A.elegirMuestra('rival:' + EQ2.clave);
const bR = F.A.barraMuestra('equipos');
check('con rival aparece su desplegable con el elegido', /id="selRival"/.test(bR) && new RegExp('value="' + EQ2.clave + '" selected').test(bR));
const pjR = F.A.pjEnMuestra(EQ1.clave);
check('contra un rival hay 1 a 3 partidos: el badge avisa muestra chica', pjR >= 1 && pjR <= 3 && /⚠ Muestra chica/.test(bR), pjR);
check('el badge nombra al rival', /Contra /.test(bR));
F.ctx.EQUIPOS = { equipo: EQ2.clave.toLowerCase().replace(/\s+/g, '-') };
check('el equipo elegido como rival no tiene partidos: se dice', F.A.pjEnMuestra(EQ2.clave) === 0
  && /no tiene partidos en esta muestra/.test(F.A.barraMuestra('equipos')));

/* =====================================================================
   10 · FASE 3 · LA VARA DE JUGADORES DEL PERÍODO, DESDE EL SERVIDOR
   ===================================================================== */
async function fase3() {
  titulo('10 · varaJugadores: la liga del período, sin filas');
  global.SGADD = SGADD;
  const J = require('./js/sgadd-jugadores.js');
  const NIV = require('./js/sgadd-niveles.js');
  const VARA = require('./server/api/vara.js');

  const m2 = { tipo: 'semanas', n: 2 };
  const recF = M.recortar(HOJAS, TRAMO, M.ventana(m2, DIAS));
  const full = SGADD.construirIndice(recF.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
  if (base.liga.nivel) full.liga.nivel = base.liga.nivel;
  const vara = M.varaJugadores(full);
  const txt = JSON.stringify(vara);
  check('cuenta a los calificados y a la liga del período', vara.calificados === full.liga.jugadoresCalificados.length
    && vara.jugadores === full.liga.jugadores.length && vara.partidos === full.liga.partidos);
  check('ningún nombre de jugador ni de equipo viaja', !/NOMBRES|EQUIPO/.test(Object.keys(vara.columnas).join(','))
    && !full.liga.jugadores.some(j => txt.indexOf(String(j['NOMBRES'])) !== -1)
    && !full.lista().some(e => txt.indexOf(e.nombre) !== -1));
  check('21 cortes por métrica, ordenados', Object.values(vara.columnas).every(c => c.cortes.length === M.CORTES
    && c.cortes.every((v, i, a) => !i || a[i - 1] <= v)));
  const vPTS = full.liga.jugadoresCalificados.map(j => j['PTS']).filter(v => typeof v === 'number').sort((a, b) => a - b);
  check('la mediana es la real', casi(M.medianaDeVara(vara, 'PTS'), M.cuantil(vPTS, 0.5), 1e-3));
  check('la media es la real', casi(vara.columnas.PTS.media, vPTS.reduce((a, b) => a + b, 0) / vPTS.length, 1e-3));
  check('el umbral de minutos y el TIPO son los del período', casi(vara.minJugador, full.liga.minJugador)
    && casi(vara.tipo.PTS, full.liga.jugadorTipo.PTS, 1e-3));
  check('las derivadas viajan ya calculadas', !!vara.columnas.__RT && !!vara.columnas.__MEZCLA && !!vara.columnas.__RDROREL);
  check('la mezcla perimetral es la del registro de niveles', M.MEZCLA_PERIMETRAL === NIV.definicion('mezclaTripleaPerimetral').valor);
  check('expandir conserva el n (la «muestra» de los umbrales)', M.expandir(vara.columnas.PTS).length === vara.columnas.PTS.n);

  titulo('10 bis · el endpoint, sin red');
  const c1 = VARA.calcular(HOJAS, TRAMO, m2);
  check('semanas:2 entrega la vara', c1.body && c1.body.ok && !!c1.body.vara && c1.body.vara.calificados === vara.calificados);
  const cmal = VARA.calcular(HOJAS, { torneo: 'NO-EXISTE', fase: TRAMO.fase }, m2);
  check('un tramo que el libro no tiene → 400', cmal.error && cmal.error.status === 400);
  check('sin muestra → 400', VARA.calcular(HOJAS, TRAMO, { tipo: 'todo' }).error.status === 400);
  const porDia = new Map();
  HOJAS['Base Datos E'].filas.forEach(f => {
    const d = M.diaIso(SGADD.fecha(f['FECHA']));
    if (!d) return;
    if (!porDia.has(d)) porDia.set(d, new Set());
    porDia.get(d).add(SGADD.texto(f['PARTIDO']));
  });
  const diaChico = DIAS.find(d => porDia.has(d) && porDia.get(d).size < M.VARA_MIN_PARTIDOS);
  const cch = VARA.calcular(HOJAS, TRAMO, { tipo: 'rango', desde: diaChico, hasta: diaChico });
  check('con menos de ' + M.VARA_MIN_PARTIDOS + ' partidos no se entrega (sería el box score de la noche)',
    cch.body && cch.body.ok && cch.body.vara === null && cch.body.motivo === 'MUESTRA_CHICA', diaChico + ' ' + JSON.stringify(cch.body));
  const cloc = VARA.calcular(HOJAS, TRAMO, { tipo: 'condicion', valor: 'LOCAL' });
  const recL = M.recortarPorCondicion(HOJAS, TRAMO, { tipo: 'condicion', valor: 'LOCAL' });
  const idxL = SGADD.construirIndice(recL.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL, conservar: recL.conservar });
  check('la familia 2: la vara es la de los jugadores en esa condición', cloc.body.vara
    && cloc.body.vara.jugadores === idxL.liga.jugadores.length && cloc.body.vara.jugadores < full.liga.jugadores.length + 1000);

  titulo('10 ter · el panel con el log recortado y la vara del servidor');
  const EQ = base.lista()[0];
  const hojasCliente = Object.assign({}, HOJAS, { 'Base Datos J': Object.assign({}, HOJAS['Base Datos J'], {
    filas: HOJAS['Base Datos J'].filas.filter(f => SGADD.claveEquipo(f['EQUIPO']) === EQ.clave) }) });
  let pedidos = 0, falla = false;
  const P = armarApp({ recortado: true });
  P.A.estado.hojas = hojasCliente;
  const catalogoViejo = SGADD.CATALOGO;
  SGADD.CATALOGO = Object.assign({}, catalogoViejo || {}, { planillas: [{ id: 'demo', slug: 'demo-cat' }] });
  P.ctx.CLUB = { estado: { id: 'deportivo' } };
  P.ctx.SGADD_DATA = { varaJugadores: (club, slug, t, m) => {
    pedidos++;
    if (falla) return Promise.reject(new Error('caído'));
    const r = VARA.calcular(HOJAS, t, m);
    return r.error ? Promise.reject(new Error(r.error.body.mensaje)) : Promise.resolve(JSON.parse(JSON.stringify(r.body)));
  } };
  P.A.cambiarMuestra(m2);
  check('mientras la vara viaja, Jugadores muestra la temporada', P.A.idxVista({ jugadores: true }) === base);
  check('y el badge lo dice', /Calculando en el servidor/.test(P.A.barraMuestra('jugadores')));
  await new Promise(r => setImmediate(r));
  const vj = P.A.idxVista({ jugadores: true });
  check('con la vara, Jugadores pasa al período', vj !== base && !!vj.liga.vara && !!vj.__muestra);
  check('se pidió una sola vez', pedidos === 1, pedidos);
  check('el plantel es el propio (los rivales no viajaron)', vj.liga.jugadores.length > 0
    && vj.liga.jugadores.every(j => SGADD.claveEquipo(j['EQUIPO']) === EQ.clave));
  const propios = vj.liga.jugadores;
  const enFull = (j) => full.liga.jugadores.find(x => x['NOMBRES'] === j['NOMBRES'] && SGADD.claveEquipo(x['EQUIPO']) === EQ.clave);
  check('quién califica sale del umbral de la liga del período', propios.every(j => j.__califica === enFull(j).__califica));
  const difs = [];
  propios.filter(j => j.__califica).forEach(j => ['PTS', 'eFG%', 'USG%', 'AST-PP', 'RD'].forEach(k => {
    const a = vj.leerJugador(j, k), b = full.leerJugador(enFull(j), k);
    if (a && b && a.percentil !== null && b.percentil !== null) difs.push(Math.abs(a.percentil - b.percentil));
  }));
  check('los percentiles coinciden con los de la liga completa (±5)', difs.length > 5 && Math.max.apply(null, difs) <= 5, Math.max.apply(null, difs));
  const j0 = propios.find(j => j.__califica);
  check('el TIPO de la ficha es el de la liga del período', casi(vj.leerJugador(j0, 'PTS').tipo, full.leerJugador(enFull(j0), 'PTS').tipo, 1e-3));
  check('«propio» sigue contra su temporada', !!vj.leerJugador(j0, 'PTS').propio);
  const pv = J.jugadoresPromediosLiga(vj), pf = J.jugadoresPromediosLiga(full);
  check('los promedios del ADN son los de la liga', casi(pv.PLAYS, pf.PLAYS, 1e-3) && casi(pv.RT, pf.RT, 1e-3) && casi(pv['eFG%'], pf['eFG%'], 1e-3));
  const rr = J.jugadoresReferenciasRebote(vj);
  check('la referencia de rebote sale de la vara', /servidor/.test(rr.origen) && casi(rr['RO%'], J.jugadoresReferenciasRebote(full)['RO%'], 1e-3));
  const uv = J.jugadoresUmbrales(vj), uf = J.jugadoresUmbrales(full);
  const umbs = ['astPPGenerador', 'reboteOfensivoAlto', 'anclaRatioDefensivo', 'pptTripleFrio'].filter(k => typeof uf[k] === 'number' && isFinite(uf[k]));
  check('los umbrales vivos son los de la liga (±5 %)', umbs.length >= 3 && umbs.every(k => Math.abs(uv[k] - uf[k]) <= 0.05 * Math.abs(uf[k]) + 1e-3),
    umbs.map(k => k + ' ' + uv[k] + '/' + uf[k]).join(' · '));
  const g = J.jugadoresPeerGroup(vj, j0);
  check('sin rivales no hay afines: el grupo es la liga del período, y lo dice', g.nivel === 'servidor' && /no viajan/.test(g.motivo));
  check('su referencia es la mediana de la liga', casi(J.jugadoresPeerReferencia(vj, j0, ['PTS']).valores.PTS, M.medianaDeVara(vj.liga.vara, 'PTS')));
  check('el badge dice de dónde sale la liga', /la calcula el servidor/.test(P.A.barraMuestra('jugadores')));
  check('el PDF de jugadores ahora declara la muestra', /^Muestra: Últimas 2 semanas/.test(P.A.textoMuestra({ jugadores: true })), P.A.textoMuestra({ jugadores: true }));
  check('Equipos no se toca', P.A.idxVista() !== vj && !P.A.idxVista().liga.vara);

  P.A.cambiarMuestra({ tipo: 'rango', desde: diaChico, hasta: diaChico });
  P.A.idxVista({ jugadores: true });
  await new Promise(r => setImmediate(r));
  check('una muestra chica: Jugadores sigue con la temporada y se explica', P.A.idxVista({ jugadores: true }) === base
    && /no entrega la liga de jugadores de un recorte tan chico/.test(P.A.barraMuestra('jugadores')));

  falla = true;
  const antes = pedidos;
  P.A.cambiarMuestra({ tipo: 'semanas', n: 3 });
  P.A.idxVista({ jugadores: true });
  await new Promise(r => setImmediate(r));
  P.A.idxVista({ jugadores: true }); P.A.barraMuestra('jugadores');
  check('un error se dice y no se reintenta en bucle', pedidos === antes + 1 && /No se pudo calcular/.test(P.A.barraMuestra('jugadores')), pedidos - antes);
  SGADD.CATALOGO = catalogoViejo;
}

fase3().catch(e => { fail++; console.log('  ✗ fase 3 tiró: ' + (e && e.stack)); }).then(() => {
  console.log('\n' + ok + ' ok · ' + fail + ' fallas');
  if (fail) { console.log('HAY FALLAS'); process.exit(1); }
});
