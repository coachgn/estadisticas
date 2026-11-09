/* =====================================================================
   test-predicciones.js · lo simulado contra lo que pasó (punto 171)

   Corre sobre el snapshot de la demo (17 equipos, 272 partidos): se corta
   el libro en una fecha, se congela la predicción de los partidos de los
   tres días siguientes con el libro CORTADO, y se evalúa contra el libro
   entero. Es exactamente lo que hacen el cron y la card del Simulador.
   ===================================================================== */
'use strict';
process.env.JWT_SECRET = 'secreto-de-prueba-de-mas-de-32-caracteres-1234567890';
delete process.env.CRON_SECRET;

const fs = require('fs');
global.SGADD = require('./js/sgadd-core.js');
const DEMO = require('./js/sgadd-demo.js');
const M = require('./js/sgadd-muestra.js');
const F4 = require('./js/sgadd-4factores.js');
const P = require('./js/sgadd-predicciones.js');

let ok = 0, mal = 0;
const titulo = (t) => console.log('\n' + t);
function check(nombre, cond) { if (cond) { ok++; console.log('  ✓ ' + nombre); } else { mal++; console.log('  ✗ ' + nombre); } }

const HOJAS = (r => r.hojas || r)(DEMO.rehidratar(JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8'))));
const TRAMO = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(HOJAS));
const IDX = SGADD.construirIndice(HOJAS, { fase: TRAMO.fase, torneo: TRAMO.torneo });

(async function () {
  /* ================================================================ 1 */
  titulo('1 · fechas y candidatos');
  check('iso lee ISO, dd/mm/aaaa y Date', P.iso('2026-03-05T10:00') === '2026-03-05' && P.iso('5/3/2026') === '2026-03-05'
    && P.iso(new Date(2026, 2, 5)) === '2026-03-05' && P.iso('') === null);
  check('sumarDias cruza el mes', P.sumarDias('2026-02-27', 3) === '2026-03-02' && P.diasEntre('2026-02-27', '2026-03-02') === 3);
  const fx = [
    { fecha: '2026-03-05', localClave: 'A', visitanteClave: 'B', estado: 'PROGRAMADO' },
    { fecha: '05/03/2026', localClave: 'A', visitanteClave: 'B' },                          // el mismo, repetido
    { fecha: '2026-03-07', localClave: 'C', visitanteClave: 'D' },                          // pasado mañana: entra
    { fecha: '2026-03-08', localClave: 'E', visitanteClave: 'F' },                          // fuera de la ventana
    { fecha: '2026-03-04', localClave: 'G', visitanteClave: 'H' },                          // ayer
    { fecha: '2026-03-05', localClave: 'I', visitanteClave: 'J', ptsLocal: 70, ptsVisitante: 60 }, // ya jugado
    { fecha: '2026-03-05', localClave: 'K', visitanteClave: 'L', sinCruce: true },          // no cruza con el libro
    { fecha: '2026-03-06', localClave: 'M', visitanteClave: 'N', estado: 'SUSPENDIDO' },
  ];
  const c = P.candidatos(fx, '2026-03-05');
  check('solo hoy a pasado mañana, programados, cruzados y sin repetir', c.length === 2 && c[0].clave === '2026-03-05|A|B' && c[1].clave === '2026-03-07|C|D');

  /* ================================================================ 2 */
  titulo('2 · el resultado real de una predicción');
  const res = P.resultados(IDX);
  check('un resultado por partido del libro (272)', res.length === 272);
  const g = res[100];
  const pred = { fecha: g.fecha, localClave: g.local, visitanteClave: g.visitante };
  check('encuentra el partido', P.resultadoDe(pred, res) === g);
  check('a 3 días también (el libro corrido un día)', P.resultadoDe(Object.assign({}, pred, { fecha: P.sumarDias(g.fecha, 3) }), res) !== null);
  const lejos = P.resultadoDe(Object.assign({}, pred, { fecha: P.sumarDias(g.fecha, 40) }), res);
  check('a 40 días no es ese partido', lejos !== g);
  const vuelta = P.resultadoDe({ fecha: g.fecha, localClave: g.visitante, visitanteClave: g.local }, res);
  check('con la localía al revés no es ese partido', vuelta !== g);

  /* ================================================================ 3 */
  titulo('3 · congelar con el libro cortado y evaluar contra el entero');
  const dias = Array.from(new Set(res.map(x => x.fecha))).sort();
  const D = dias[Math.floor(dias.length * 0.6)];
  const corte = M.recortar(HOJAS, TRAMO, { desde: dias[0], hasta: P.sumarDias(D, -1) });
  const idxPre = SGADD.construirIndice(corte.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
  const fixture = res.filter(x => x.fecha >= D && x.fecha <= P.sumarDias(D, 2))
    .map(x => ({ fecha: x.fecha, localClave: x.local, visitanteClave: x.visitante, estado: 'PROGRAMADO' }));
  const cand = P.candidatos(fixture, D);
  const regs = cand.map(x => P.congelar(F4, idxPre, x, Date.UTC(2026, 0, 1))).filter(x => !x.omitido);
  check('se congelan los partidos de la ventana', regs.length > 0 && regs.length === cand.length);
  check('cada registro lleva su versión, fecha de congelado y rango', regs.every(x => x.version === P.VERSION && x.congeladaEl === '2026-01-01T00:00:00.000Z'
    && typeof x.p10 === 'number' && x.p10 <= x.margen + 0.05 && x.margen <= x.p90 + 0.05 && x.pLocal > 0 && x.pLocal < 1));
  check('el congelado no vio el partido: su liga tiene menos partidos que el libro', regs[0].partidosLiga < 272);
  const filas = P.cruzar(regs.concat([{ clave: 'futuro', fecha: '2099-01-01', localClave: 'X', visitanteClave: 'Y', margen: 1 }]), IDX);
  const ev = filas.filter(f => f.eval);
  check('todas las de la ventana se evalúan y la del futuro queda pendiente', ev.length === regs.length && filas[filas.length - 1].real === null);
  check('error = predicho − real', ev.every(f => Math.abs(f.eval.error - (f.pred.margen - f.eval.margenReal)) < 0.06));

  /* ================================================================ 4 */
  titulo('4 · el resumen');
  /* Una serie más larga: congelado partido por partido con el libro hasta el día anterior. */
  const serie = [];
  dias.slice(Math.floor(dias.length * 0.5), Math.floor(dias.length * 0.5) + 12).forEach((d) => {
    const pre = M.recortar(HOJAS, TRAMO, { desde: dias[0], hasta: P.sumarDias(d, -1) });
    const ix = SGADD.construirIndice(pre.hojas, { fase: TRAMO.fase, torneo: SGADD.TORNEO_TOTAL });
    res.filter(x => x.fecha === d).forEach((x) => {
      const r = P.congelar(F4, ix, { fecha: d, clave: P.clavePartido(d, x.local, x.visitante), localClave: x.local, visitanteClave: x.visitante });
      if (!r.omitido) serie.push(r);
    });
  });
  const cr = P.cruzar(serie, IDX);
  const s = P.resumen(cr);
  check('n = evaluadas y alcanza el mínimo', s.n === serie.length && s.suficiente === (s.n >= P.MIN_EVALUADAS));
  const errs = cr.filter(f => f.eval).map(f => f.eval.error);
  check('MAE y sesgo son la media del error', Math.abs(s.mae - errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length) < 0.06
    && Math.abs(s.sesgo - errs.reduce((a, e) => a + e, 0) / errs.length) < 0.06);
  check('la calibración reparte TODAS las evaluadas', s.calibracion.reduce((a, b) => a + b.n, 0) === s.n);
  check('cobertura, aciertos y Brier entre 0 y 1', [s.cobertura80, s.aciertos, s.brier].every(v => v >= 0 && v <= 1));
  check('cada partido cuenta para los dos equipos', s.porEquipo.reduce((a, b) => a + b.n, 0) === 2 * s.n);
  const unEq = s.porEquipo[0];
  check('los últimos 4 son un ciclo', unEq.ultimos.n === Math.min(P.CICLO, unEq.n));
  check('el sesgo del visitante es el error dado vuelta', (function () {
    const f = cr.find(x => x.eval);
    const r1 = P.resumen([f]);
    const L = r1.porEquipo.find(x => x.clave === f.pred.localClave), V = r1.porEquipo.find(x => x.clave === f.pred.visitanteClave);
    return L.sesgo === f.eval.error && V.sesgo === -f.eval.error;
  })());
  console.log('     (demo, ' + s.n + ' partidos: MAE ' + s.mae + ' · acierto ' + Math.round(s.aciertos * 100) + ' % · cobertura P10-P90 ' + Math.round(s.cobertura80 * 100) + ' %)');
  check('sin evaluadas, el resumen no inventa números', P.resumen([{ pred: {}, real: null, eval: null }]).mae === undefined);

  /* ================================================================ 5 */
  titulo('5 · el servidor · cron, HSETNX y la lectura del admin');
  const { kvMemoria } = require('./server/lib/kv-memoria.js');
  const auth = require('./server/lib/auth.js');
  const RUTA = require('./server/rutas/predicciones.js');
  const aMatriz = (h) => { const out = {}; Object.keys(h).forEach((k) => { const cols = h[k].cols; out[k] = [cols].concat(h[k].filas.map(f => cols.map(cc => f[cc]))); }); return out; };
  const nombreDe = (k) => (IDX.get(k) || {}).nombre || k;
  const fxServidor = fixture.map(x => ({ fecha: x.fecha, local: nombreDe(x.localClave), visitante: nombreDe(x.visitanteClave), estado: 'PROGRAMADO' }));
  const catalogo = { demo: { tipo: 'torneo', fixture: { adaptador: 'basket-club', zonas: { a: 'https://basket-club.com/x' } },
    categorias: { 'demo-a': { zona: 'a', sheetId: 'LIBRO', label: 'Zona A' }, 'demo-pos': { zona: 'pos', sheetId: 'OTRO', interzonal: true } } } };
  const kvm = kvMemoria();
  const [a, m, dd] = D.split('-').map(Number);
  const deps = {
    env: { CRON_SECRET: 'secreto-cron' }, kv: kvm, catalogo: catalogo, ahora: Date.UTC(a, m - 1, dd, 13, 0),
    partidosDe: async () => ({ partidos: fxServidor, origen: 'prueba' }),
    obtenerLibro: async (id) => { if (id !== 'LIBRO') throw new Error('libro equivocado'); return { hojas: aMatriz(corte.hojas) }; },
  };
  const cron = (simular) => ({ headers: { authorization: 'Bearer secreto-cron' }, query: simular ? { simular: '1' } : {} });
  check('sin el secreto, no corre', (await RUTA.manejarCronPredicciones({ headers: {}, query: {} }, deps)).status === 401);
  const sim = await RUTA.manejarCronPredicciones(cron(true), deps);
  check('?simular=1 planifica y no escribe', sim.status === 200 && sim.body.zonas[0].registros.length === regs.length && !kvm.ops.includes('HSETNX'));
  check('la zona interzonal no se recorre', sim.body.zonas.length === 1 && sim.body.zonas[0].zona === 'a');
  const r1 = await RUTA.manejarCronPredicciones(cron(false), deps);
  check('congela con HSETNX', r1.body.zonas[0].congeladas === regs.length && kvm.ops.includes('HSETNX'));
  const r2 = await RUTA.manejarCronPredicciones(cron(false), deps);
  check('correrlo de nuevo NO pisa lo congelado', r2.body.zonas[0].congeladas === 0 && r2.body.zonas[0].yaEstaban === regs.length);
  const conLibroEntero = Object.assign({}, deps, { kv: kvMemoria(), obtenerLibro: async () => ({ hojas: aMatriz(HOJAS) }) });
  const r3 = await RUTA.manejarCronPredicciones(cron(false), conLibroEntero);
  check('un partido que ya está en el libro no se congela', r3.body.zonas[0].congeladas === 0 && r3.body.zonas[0].omitidos.every(o => /jugado/.test(o.motivo)));
  const sinVentana = Object.assign({}, deps, { kv: kvMemoria(), partidosDe: async () => ({ partidos: [] }), obtenerLibro: async () => { throw new Error('no debía leerse'); } });
  check('sin partidos en la ventana no se lee el libro', (await RUTA.manejarCronPredicciones(cron(false), sinVentana)).body.ok === true);

  const T_ADMIN = auth.firmarToken({ email: 'freytesgn@gmail.com' }, { expiraEn: '1h' });
  const T_CLIENTE = auth.firmarToken({ email: 'dt@club.com', club: 'demo', plan: 'ORO' }, { expiraEn: '1h' });
  const lect = (t) => ({ headers: { authorization: 'Bearer ' + t }, params: { torneo: 'demo', zona: 'a' } });
  const cli = await RUTA.manejarPredicciones(lect(T_CLIENTE), deps);
  check('un cliente no lee las predicciones (el simulador es de admin)', cli.status === 403);
  const adm = await RUTA.manejarPredicciones(lect(T_ADMIN), deps);
  check('el admin lee lo congelado, ordenado por fecha', adm.status === 200 && adm.body.predicciones.length === regs.length
    && adm.body.predicciones.every((x, i, l) => i === 0 || l[i - 1].fecha <= x.fecha));

  /* ================================================================ 6 */
  titulo('6 · la card del Simulador');
  const html = F4.simuladorCalibracionHtml(P.cruzar(adm.body.predicciones, IDX), { torneo: 'demo', zona: 'a' });
  check('la card dice cuántas se evaluaron y el MAE', /Calibración del modelo/.test(html) && /MAE/.test(html) && /se congela ANTES/.test(html));
  check('con pocas evaluadas avisa que no alcanza para leerla', regs.length >= P.MIN_EVALUADAS || /todavía no alcanza/.test(html));
  check('sin predicciones dice qué falta', /Todavía no hay predicciones congeladas/.test(F4.simuladorCalibracionHtml([], { torneo: 'demo', zona: 'a' })));
  check('sin torneo dice que la categoría no está enganchada', /no está enganchada a un torneo/.test(F4.simuladorCalibracionHtml(null, null)));

  /* ================================================================ 7 */
  titulo('7 · los cruces entre zonas (postemporada interzonal)');
  /* El libro cortado se parte en dos zonas por equipo: cada una trae solo
     sus filas, como el libro de una zona de verdad. */
  const claves = IDX.lista().map(e => e.clave).sort();
  const enA = new Set(claves.slice(0, Math.floor(claves.length / 2)));
  const deZona = (h, a) => {
    const out = {};
    Object.keys(h).forEach((k) => {
      out[k] = { cols: h[k].cols, filas: h[k].filas.filter((f) => {
        const eq = String(f.EQUIPO || '').trim();
        if (!eq || /\bTIPO\b/i.test(eq)) return true;
        return enA.has(SGADD.claveEquipo(eq)) === a;
      }) };
    });
    return out;
  };
  const hA = deZona(corte.hojas, true), hB = deZona(corte.hojas, false);
  const kA = claves.find(k => enA.has(k)), kB = claves.find(k => !enA.has(k));
  const cruce = [{ fecha: D, local: nombreDe(kA), visitante: nombreDe(kB), estado: 'PROGRAMADO' }];
  const pz = RUTA.planificarZona(cruce, hA, {}, {}, D, Date.now());
  check('en el libro de una zona, el rival de la otra queda pendiente', pz.registros.length === 0 && pz.pendientes.length === 1);
  const eA = deZona(HOJAS, true), eB = deZona(HOJAS, false);
  const ht = RUTA.hojasDeTorneo([eA, eB]);
  const tipos = ((ht['PROMEDIOS E'] || {}).filas || []).filter(f => /\bTIPO\b/i.test(String(f.EQUIPO || '')) || !String(f.EQUIPO || '').trim());
  const tiposA = (eA['PROMEDIOS E'] ? eA['PROMEDIOS E'].filas : []).filter(f => /\bTIPO\b/i.test(String(f.EQUIPO || '')) || !String(f.EQUIPO || '').trim());
  check('las filas TIPO salen solo de la primera zona', tiposA.length > 0 && tipos.length === tiposA.length);
  const zfilas = (z, h) => ({ zona: z, hojas: h });
  const ez = RUTA.planificarEntreZonas([zfilas('a', hA), zfilas('b', hB)], cruce, {}, {}, D, Date.now());
  check('con los libros de las dos zonas, el cruce se proyecta', ez.registros.length === 1);
  check('y el registro dice que es entre zonas y a qué dos zonas va', ez.registros[0] && ez.registros[0].entreZonas === true
    && ez.registros[0].zonas.join(',') === 'a,b');
  check('la proyección usa los mismos números del simulador', ez.registros[0] && typeof ez.registros[0].margen === 'number' && ez.registros[0].pLocal > 0 && ez.registros[0].pLocal < 1);

  const catEZ = { demo: { tipo: 'torneo', fixture: { adaptador: 'basket-club', zonas: { a: 'https://basket-club.com/x' } },
    categorias: { 'demo-a': { zona: 'a', sheetId: 'LA', label: 'A' }, 'demo-b': { zona: 'b', sheetId: 'LB', label: 'B' } } } };
  const kvEZ = kvMemoria();
  const depsEZ = Object.assign({}, deps, { kv: kvEZ, catalogo: catEZ, partidosDe: async () => ({ partidos: cruce }),
    obtenerLibro: async (id) => ({ hojas: aMatriz(id === 'LA' ? hA : hB) }) });
  const simEZ = await RUTA.manejarCronPredicciones(cron(true), depsEZ);
  const salEZ = simEZ.body.zonas.find(z => z.zona === 'entre-zonas');
  check('el cron suma un pase «entre-zonas» con el cruce', salEZ && salEZ.registros.length === 1 && !kvEZ.ops.includes('HSETNX'));
  const realEZ = await RUTA.manejarCronPredicciones(cron(false), depsEZ);
  const salR = realEZ.body.zonas.find(z => z.zona === 'entre-zonas');
  const enAk = await RUTA.manejarPredicciones({ headers: { authorization: 'Bearer ' + T_ADMIN }, params: { torneo: 'demo', zona: 'a' } }, depsEZ);
  const enBk = await RUTA.manejarPredicciones({ headers: { authorization: 'Bearer ' + T_ADMIN }, params: { torneo: 'demo', zona: 'b' } }, depsEZ);
  check('se congela UNA vez y queda en la clave de las dos zonas', salR.congeladas === 1
    && enAk.body.predicciones.length === 1 && enBk.body.predicciones.length === 1);
  const otraVez = await RUTA.manejarCronPredicciones(cron(false), depsEZ);
  check('correrlo de nuevo no pisa nada', otraVez.body.zonas.find(z => z.zona === 'entre-zonas').yaEstaban === 1);

  /* El resultado desde un solo lado: en el libro de la zona el rival de
     otra zona no es un equipo de la lista, pero su fila trae PTSopp. */
  const lado = { lista: () => [{ clave: kA, partidos: [{ __id: 'x1', PTS: 80, PTSopp: 74, CONDICION: 'LOCAL', FECHA: D,
    PARTIDO: nombreDe(kA) + ' vs ' + nombreDe(kB) }] }] };
  const res1 = P.resultados(lado);
  check('el resultado se lee desde un solo lado, con PTSopp y el texto del cruce', res1.length === 1 && res1[0].local === kA
    && res1[0].visitante === kB && res1[0].ptsLocal === 80 && res1[0].ptsVisitante === 74 && res1[0].unLado === true);
  const ladoV = { lista: () => [{ clave: kB, partidos: [{ __id: 'x2', PTS: 70, PTSopp: 75, CONDICION: 'VISITANTE', FECHA: D,
    PARTIDO: nombreDe(kA) + ' vs ' + nombreDe(kB) }] }] };
  const res2 = P.resultados(ladoV);
  check('y del lado visitante, con la localía dada vuelta', res2.length === 1 && res2[0].local === kA && res2[0].ptsLocal === 75 && res2[0].ptsVisitante === 70);
  check('sin PTSopp no se inventa el resultado', P.resultados({ lista: () => [{ clave: kA, partidos: [{ __id: 'x3', PTS: 80, CONDICION: 'LOCAL', FECHA: D,
    PARTIDO: nombreDe(kA) + ' vs ' + nombreDe(kB) }] }] }).length === 0);

  console.log('\n' + ok + ' OK · ' + mal + ' FALLARON');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
