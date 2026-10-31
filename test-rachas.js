/* SGADD · test de RACHAS Y TENDENCIAS (punto 162). Motor puro + demo real. */
const fs = require('fs');
const SGADD = require('./js/sgadd-core.js');
global.SGADD = SGADD;
const R = require('./js/sgadd-rachas.js');
const DEMO = require('./js/sgadd-demo.js');
let ok = 0, fail = 0;
const check = (n, c) => { if (c) ok++; else { fail++; console.log('  ✗ ' + n); } };
const titulo = (t) => console.log('\n' + t);

/* Liga sintética mínima: 8 equipos con récord, σ de liga declarado. */
function liga(extra) {
  const equipos = new Map();
  for (let i = 0; i < 8; i++) {
    const c = 'EQ' + i;
    equipos.set(c, { clave: c, record: { ganados: 8 - i, perdidos: i, pj: 8 } });
  }
  const jp = new Map();
  for (let k = 0; k < 10; k++) jp.set('J' + k, serie(Array(9).fill(0).map((_, i) => 0.5 + (i % 2 ? 0.05 : -0.05)), {}));
  return { equipos, liga: Object.assign({ jugadorPartidos: jp }, extra || {}) };
}
function fila(i, ts, o) {
  o = o || {};
  return Object.assign({ MIN: 25, PLAYS: 14, 'TS%': ts, 'eFG%': ts, PTS: 14, TCI: 10, T3I: 3, PARTIDO: 'MIO vs EQ' + (i % 8), EQUIPO: 'MIO' }, o);
}
function serie(vals, o) { return vals.map((v, i) => fila(i, v, o)); }

const base = [0.5, 0.52, 0.48, 0.51, 0.49, 0.5, 0.53, 0.47];   // σ ≈ 0,022
const ctx = () => ({ idx: liga(), equipo: 'MIO' });

titulo('1 · estados');
let r = R.analizar(serie(base.concat([0.62, 0.63, 0.6, 0.64, 0.61]), {}), ctx());
check('🔥 eficiencia muy sobre su base con uso estable', r.estado === 'caliente');
r = R.analizar(serie(base.concat([0.36, 0.38, 0.35, 0.37, 0.4]), {}), ctx());
check('🧊 por debajo de −1,5', r.estado === 'fria');
r = R.analizar(serie(base.concat([0.5, 0.51, 0.49, 0.5, 0.52]), {}), ctx());
check('⚓ estable dentro de ±0,5 σ', r.estado === 'ancla');
r = R.analizar(serie(base.slice(0, 4), {}), ctx());
check('muestra corta', r.estado === 'sin-muestra');

titulo('2 · el uso filtra los falsos positivos');
let ps = serie(base, {}).concat(serie([0.62, 0.63, 0.6, 0.64, 0.61], { PLAYS: 8 }));
r = R.analizar(ps, ctx());
check('eficiencia sube pero el uso cae → no es racha', r.estado === 'neutro' && r.descartada === 'uso');
ps = serie(base, {}).concat(serie([0.62, 0.63, 0.6, 0.64, 0.61], { MIN: 9, PLAYS: 5 }));
r = R.analizar(ps, ctx());
check('minutos residuales → no es racha', r.estado === 'neutro' && r.descartada === 'minutos');
check('la lectura lo explica', /no se marca/.test(R.lectura(r)));

titulo('3 · alerta de carga');
ps = serie(base, { MIN: 22 }).concat(serie([0.62, 0.63, 0.6, 0.64, 0.61], { MIN: 33, PLAYS: 21 }));
r = R.analizar(ps, ctx());
check('🔥 con salto de minutos dispara la carga', r.estado === 'caliente' && r.carga && r.carga.ratio > 1.4);
r = R.analizar(serie(base.concat([0.62, 0.63, 0.6, 0.64, 0.61]), {}), ctx());
check('sin salto de minutos no hay carga', !r.carga);

titulo('4 · per 40: el volumen no depende de los minutos');
const a = R.usoPer40([{ MIN: 20, PLAYS: 10 }]), b = R.usoPer40([{ MIN: 40, PLAYS: 20 }]);
check('mismo uso por 40 con distinta carga', Math.abs(a - b) < 1e-9 && Math.abs(a - 20) < 1e-9);

titulo('5 · el rival pesa');
const idx = liga();
const pFuerte = R.pesoRival(idx, { PARTIDO: 'MIO vs EQ0' }, R.umbrales(idx), 'MIO');
const pDebil = R.pesoRival(idx, { PARTIDO: 'MIO vs EQ7' }, R.umbrales(idx), 'MIO');
check('el puntero pesa 1,2 y el último 0,8', Math.abs(pFuerte.peso - 1.2) < 1e-9 && Math.abs(pDebil.peso - 0.8) < 1e-9);
check('rival desconocido pesa 1', R.pesoRival(idx, { PARTIDO: 'MIO vs XX' }, R.umbrales(idx), 'MIO').peso === 1);

titulo('6 · desvío propio de la competencia');
const idx2 = liga();
const sg = R.sigmaLiga(idx2);
check('σ de la liga sale de sus jugadores', sg && sg.n === 10 && sg.p25 > 0);
const planos = serie([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], {}).concat(serie([0.52, 0.52, 0.52, 0.52, 0.52], {}));
r = R.analizar(planos, { idx: idx2, equipo: 'MIO' });
check('el piso de liga evita que σ≈0 dispare una racha', r.estado !== 'caliente' && r.sigma >= sg.p25 - 1e-12);
const idx3 = liga({ rachas: { z: 0.5 } });
check('un torneo puede declarar sus propios cortes', R.umbrales(idx3).z === 0.5 && R.umbrales(idx3).ventana === 5);
r = R.analizar(serie(base.concat([0.53, 0.54, 0.53, 0.54, 0.53]), {}), { idx: idx3, equipo: 'MIO' });
check('con z=0,5 declarado la misma ventana ya es 🔥', r.estado === 'caliente');

titulo('7 · 🧊 de un tirador: de dónde parece venir');
const tir = { T3I: 7, TCI: 14 };
r = R.analizar(serie(base, tir).concat(serie([0.36, 0.38, 0.35, 0.37, 0.4], { T3I: 7, TCI: 7 })), ctx());
check('menos intentos → ajuste defensivo / rol', r.estado === 'fria' && r.causaFria && r.causaFria.id === 'volumen');
r = R.analizar(serie(base, tir).concat(serie([0.36, 0.38, 0.35, 0.37, 0.4], tir)), ctx());
check('mismos intentos → acierto', r.causaFria && r.causaFria.id === 'conversion');
r = R.analizar(serie(base, { T3I: 1 }).concat(serie([0.36, 0.38, 0.35, 0.37, 0.4], { T3I: 1 })), ctx());
check('quien no es tirador no recibe causa', r.estado === 'fria' && !r.causaFria);

titulo('8 · chip');
check('neutro y sin muestra no marcan', R.chip({ estado: 'neutro' }) === null && R.chip(null) === null);
const c = R.chip(R.analizar(serie(base.concat([0.62, 0.63, 0.6, 0.64, 0.61]), {}), ctx()));
check('🔥 con tooltip numérico', c && c.emoji === '🔥' && /σ/.test(c.tooltip));

titulo('9 · demo real (17 equipos): corre y reparte con sentido');
const crudo = JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8'));
const r0 = DEMO.rehidratar(crudo); const H = r0.hojas || r0;
const tramo = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(H));
const ix = SGADD.construirIndice(H, { fase: tramo.fase, torneo: tramo.torneo });
const cuenta = { caliente: 0, fria: 0, ancla: 0, neutro: 0, 'sin-muestra': 0 };
let carga = 0, desc = 0, raros = 0;
ix.liga.jugadorPartidos.forEach((filas, k) => {
  const ps2 = filas.slice().sort((x, y) => (x.__fecha || 0) - (y.__fecha || 0));
  const rr = R.analizar(ps2, { idx: ix, equipo: ps2[0] && ps2[0]['EQUIPO'] });
  cuenta[rr.estado]++; if (rr.carga) carga++; if (rr.descartada) desc++;
  if (rr.z !== undefined && !isFinite(rr.z)) raros++;
});
console.log('  demo:', JSON.stringify(cuenta), 'carga', carga, 'descartadas', desc);
const evaluados = cuenta.caliente + cuenta.fria + cuenta.ancla + cuenta.neutro;
check('ninguna z es NaN/Infinity', raros === 0);
check('hay jugadores evaluados', evaluados > 50);
check('las rachas son la excepción (<25 % de los evaluados)', (cuenta.caliente + cuenta.fria) / evaluados < 0.25);
check('el σ de la competencia se calculó', R.sigmaLiga(ix) && R.sigmaLiga(ix).n > 30);

console.log('\n' + (fail === 0 ? 'OK' : 'HAY FALLAS') + ' · ' + ok + ' ok, ' + fail + ' fallan');
process.exit(fail ? 1 : 0);
