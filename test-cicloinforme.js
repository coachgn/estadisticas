/* test-cicloinforme.js · el informe de ciclo nativo (js/sgadd-cicloinforme.js), la réplica del
   Artifact «Jujuy Básquet · Ciclo 0». Corre sobre el paquete REAL de LAB 2026-27 si está en la
   máquina (motorstats-ingestion) y, siempre, sobre piezas sintéticas de los cálculos puros. */
const fs = require('fs'), path = require('path');
global.SGADD_CICLOS = require('./js/sgadd-ciclos.js');
global.SGADD_CANCHA = require('./js/sgadd-cancha.js');
const CI = require('./js/sgadd-cicloinforme.js');
let ok = 0, fail = 0;
const t = (c, m) => { if (c) ok++; else { fail++; console.log('  ✗ ' + m); } };

/* 1 · la línea de tanteo: puntos dentro de un tramo (d, h] */
const linea = [[0, 0, 0], [10, 2, 0], [20, 2, 3], [30, 4, 3], [40, 4, 5]];
const pe = CI.puntosEntre(linea, 10, 30);
t(pe[0] === 2 && pe[1] === 3, 'puntos del tramo (10, 30]: 2 a favor y 3 en contra');

/* 2 · la rotación: on/off, dúos y quintetos desde los tramos */
const g = { id: 'a', linea: [[0, 0, 0], [100, 10, 4], [200, 14, 12]], ids: ['1', '2', '3', '4', '5', '6'],
  nombres: { 1: ['UNO, A', '1'], 2: ['DOS, B', '2'], 3: ['TRES, C', '3'], 4: ['CUATRO, D', '4'], 5: ['CINCO, E', '5'], 6: ['SEIS, F', '6'] },
  tramos: [[0, 100, [0, 1, 2, 3, 4], [0, 0, 0, 0, 0], 0, 6, 1], [100, 200, [0, 1, 2, 3, 5], [0, 0, 0, 0, 0], 6, 2, 3]] };
const R = CI.rotacion([g], { a: 50 });
t(R.quintetos.length === 2 && Math.abs(R.quintetos[0].min - 100 / 60) < 1e-9, 'dos quintetos con sus minutos');
const uno = R.on.find(j => j.nombre === 'Uno');
t(uno && Math.abs(uno.minOn - 200 / 60) < 1e-9 && uno.minOff === 0, 'on/off: el que jugó todo no tiene minutos off');
const cinco = R.on.find(j => j.nombre === 'Cinco');
t(cinco && esNum(cinco.dif), 'on/off: diferencia de NET calculada');
t(R.cuarto.get(1) && R.cuarto.get(3), 'combinaciones por cuarto');
const q1 = R.quintetos.find(q => q.nombres.includes('Cinco'));
t(q1 && q1.mm === 6 && Math.abs(q1.ortg - 100 * 10 / 25) < 1e-6, 'puntos y ORTG del quinteto con posesiones estimadas por el ritmo del partido');
function esNum(v) { return typeof v === 'number' && isFinite(v); }

/* 3 · el semáforo individual */
t(CI.semaforo({ ppp: 1.0, ts: 0.62, min: 20, PLAYS: 40 }, 0.94, 0.54).id === 'elite', 'élite: PPP y TS sobre la mediana con 15+ min');
t(CI.semaforo({ ppp: 0.94, ts: 0.5, min: 30, PLAYS: 40 }, 0.94, 0.54).id === 'cumplido', 'cumplido: en la mediana');
t(CI.semaforo({ ppp: 0.85, min: 30, PLAYS: 40 }, 0.94, 0.54).id === 'alerta', 'alerta: hasta 0,14 por debajo');
t(CI.semaforo({ ppp: 0.6, min: 30, PLAYS: 40 }, 0.94, 0.54).id === 'critico', 'crítico');
t(CI.semaforo({ ppp: 2, min: 3, PLAYS: 4 }, 0.94, 0.54).id === 'sin', 'sin muestra con pocas jugadas');
t(CI.corto('STEHLI, RAMIRO GERMAN') === 'Stehli' && CI.corto('TAMBUCCI YABEN, X') === 'Tambucci Yaben', 'el apellido, como en el Artifact');

/* 4 · el paquete real de LAB 2026-27 (si está en la máquina) */
const f = path.join(__dirname, '..', 'motorstats-ingestion', 'salida', 'lab-2026-27-norte', 'web', 'jujuy-basquet.json');
if (fs.existsSync(f)) {
  const paq = JSON.parse(fs.readFileSync(f, 'utf8'));
  const c = SGADD_CICLOS.armarCiclo(paq, 0);
  t(c && c.resultados.record.g === 0 && c.resultados.record.p === 4, 'Ciclo 0 real: 0-4');
  const g8 = (paq.partidosPbp || []).filter(x => c.resultados.partidos.some(p => String(p.id) === String(x.id)));
  const rr = CI.rotacion(g8, {});
  t(rr.quintetos.length > 0 && rr.on.length >= 8, 'rotación real: quintetos y on/off');
  const tot = rr.total.pf, real = c.resultados.puntos.favor;
  t(Math.abs(tot - real) <= 2, 'los puntos de los tramos suman el marcador real del ciclo (±2) · ' + tot + ' vs ' + real);
  const rl = CI.relojDelCiclo(g8);
  t(rl.con === 4 && rl.favor.f[1][0] > 0, 'reloj del ciclo: los 4 partidos');
  const m = CI.armar({ idx: { lista: () => [], liga: {} }, paq, ciclo: c });
  t(m.ok, 'armar no falla sin índice del libro');
  ['principal', 'equipos', 'jugadores', 'clasificacion', 'fixture', 'plan'].forEach((s) => {
    const h = CI.html(m, s);
    t(h.indexOf('ci-card') >= 0 && !/undefined|NaN/.test(h), 'la sección ' + s + ' pinta sin undefined ni NaN');
  });
  /* El 4.º cuarto sin el suplementario: el bloque `ciclos` lo suma al 4.º; la línea del play-by-play lo separa. */
  const suardi = g8.find(g => g.fecha === '2026-11-02');
  if (suardi) {
    const per = CI.porPeriodo(suardi);
    t(per.length === 5 && per[3][0] === 12 && per[3][1] === 12 && per[4][0] === 7, 'el suplementario va aparte del 4.º cuarto (12-12 y 7-11)');
    t(m.contexto.cuartos[3].parcial.favor === 70 && m.contexto.cuartos[3].parcial.contra === 76, '4.º cuarto del ciclo: 70 a favor y 76 en contra, sin el suplementario');
  }
  /* Los escenarios con la tabla de la temporada anterior: puesto y zona de cada récord. */
  const filasAnt = [['SAN ISIDRO', 23], ['AMANCAY (LR)', 23], ['BARRIO PARQUE', 21], ['SP. SUARDI', 20], ['SANTA PAULA (G)', 19], ['COMUNICACIONES', 18], ['SALTA BASKET', 18], ['JUJUY BASQUET', 17],
    ['VILLA SAN MARTIN', 16], ['ESTUDIANTES (T)', 16], ['BOCHAS (CC)', 15], ['INDEPENDIENTE (SDE)', 14], ['RIVADAVIA (MZA)', 13], ['COLON (SF)', 11], ['HINDU (C)', 11], ['FUSION RIOJANA', 11], ['HURACAN (LH)', 6]]
    .map(([nombre, pg], i) => ({ nombre, pg, pp: 32 - pg, puesto: i + 1 }));
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'torneos', 'liga-argentina-2026-27.json'), 'utf8'));
  const idxE = { lista: () => [{ nombre: 'JUJUY BASQUET', clave: 'JUJUY BASQUET', partidos: [] }], liga: {}, get: () => null, leer: () => null };
  const me = CI.armar({ idx: idxE, paq, ciclo: c, doc, anterior: { label: 'Conferencia Norte 2025-26', temporada: '2025-26', filas: filasAnt } });
  const he = CI.html(me, 'clasificacion');
  t(/17 de 28/.test(he) && /20-12/.test(he) && /entre 13\.º y 14\.º/.test(he), 'escenarios con la tabla anterior: 17 de 28, 20-12 y «entre 13.º y 14.º»');
  t(/Para terminar como el año pasado hay que ganar 17 de los 28/.test(he) && /50 % de victorias/.test(he), 'la conclusión de los escenarios');
  t(/temporadaAnterior/.test(JSON.stringify(Object.keys(doc))) && doc.temporadaAnterior.categoriaPorClub.jujuy === 'jujuy-primera', 'el torneo declara la temporada anterior por club (sin sheetId)');
  /* El tirador y la franja de cada tiro (ingesta del 06/11): quién tira y los mapas salen solo del ciclo. */
  if (g8.every(x => x.tiros && x.tiros.favor.every(p => p.length >= 6))) {
    const D = CI.detalleDe(m.contexto);
    const tirosC = g8.reduce((a, x) => a + x.tiros.favor.length, 0);
    t(D.delCiclo && D.puntos.favor.length === tirosC, 'el detalle del ciclo: los tiros propios de los 4 partidos (' + tirosC + ')');
    t(D.jugadores.reduce((a, j) => a + j.i, 0) === D.puntos.favor.filter(p => p[4] >= 0).length && D.jugadores.every(j => j.pj >= 1 && j.pj <= 4), 'cada tiro con tirador cuenta una vez y nadie suma más de 4 partidos');
    const hj = CI.html(m, 'jugadores');
    t(/4 partidos del ciclo/.test(hj) && !/temporada \(/.test(hj), 'Jugadores dice que los mapas son de los partidos del ciclo');
    const r3 = CI.ritmoCuarto(m.contexto, 3);
    t(esNum(r3) && r3 > 60 && r3 < 100, 'el ritmo del 3.er cuarto del ciclo (' + (esNum(r3) ? r3.toFixed(1) : r3) + ')');
    /* Un paquete viejo (tiro sin tirador) vuelve al detalle de temporada. */
    const viejo = JSON.parse(JSON.stringify(paq)); viejo.partidosPbp.forEach(x => { x.tiros.favor = x.tiros.favor.map(p => p.slice(0, 4)); delete x.juego; });
    const mv = CI.armar({ idx: { lista: () => [], liga: {} }, paq: viejo, ciclo: c });
    t(!CI.detalleDe(mv.contexto).delCiclo && CI.ritmoCuarto(mv.contexto, 3) === null, 'paquete viejo: detalle de temporada y sin ritmo por cuarto');
  }
  const hp = CI.html(me, 'plan');
  t(/Elaborado con los datos de MotorStats AR al 03\/11\/2026/.test(hp), 'la firma con la fecha de los datos: el día siguiente al cierre');
} else console.log('  (sin el paquete real de la ingesta: se saltean las verificaciones del Ciclo 0)');
const ui2 = fs.readFileSync(path.join(__dirname, 'js', 'sgadd-ciclosui.js'), 'utf8');
t(/idxPrevio\(/.test(ui2) && /pedirAnterior\(/.test(ui2), 'la sección mide la liga al cierre del ciclo y pide la tabla anterior');

/* 5 · cableado: el panel carga el módulo antes de la sección */
const idxHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
t(idxHtml.indexOf('sgadd-cicloinforme.js') >= 0 && idxHtml.indexOf('sgadd-cicloinforme.js') < idxHtml.indexOf('sgadd-ciclosui.js'), 'index.html carga el informe antes de la sección');
const ui = fs.readFileSync(path.join(__dirname, 'js', 'sgadd-ciclosui.js'), 'utf8');
t(/CIN\.armar\(/.test(ui) && /CIN\.html\(/.test(ui),'la sección Ciclos pinta con el informe nuevo');

console.log(`\n${ok} pasan · ${fail} fallan`);
process.exit(fail ? 1 : 0);
