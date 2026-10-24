/* =====================================================================
   test-rendimiento.js · la card de Rendimiento del jugador (punto 140)

   1 · El motor puro sobre un jugador armado a mano: cada bloque, cada
       cuenta contra el número calculado acá.
   2 · Las degradaciones: sin el campo en el paquete, sin el jugador, sin
       muestra para comparar.
   3 · La vista: seis bloques, sin «undefined» ni «NaN», con ▲/▼ además
       del color (punto 14) y todo escapado.
   4 · El cableado: la pestaña solo con la capa pbp, el montaje en
       sgadd-pbp.js y el script en el index.
   ===================================================================== */
'use strict';

const fs = require('fs');
const R = require('./js/sgadd-rendimiento.js');

let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + JSON.stringify(d) : '')); } };
const titulo = (t) => console.log('\n' + t + '\n' + '─'.repeat(70));

/* Un base con 30 partidos. Los arreglos tienen la forma de la ingesta
   (motorstats-ingestion/src/pbp/rendimiento.js, `cerrar`). */
const base = {
  pj: 30, dist: 5.2, nd: 300,
  esp: [[120, 66, 132], [30, 12, 24], [150, 54, 162]],         // 300 tiros · 318 pts → 1,06
  t3b: [[40, 16], [70, 26], [40, 12]],
  seg: [40, 20, 44, 25, 18, 8],
  rca: [132, 85],                                               // 64,4 %
  ast: [90, 220, 40, 45, 5],
  socios: [['200', 30, 80], ['300', 20, 50]],
  asistidores: [['300', 25, 55]],
  asistido: [[30, 36], [2, 10], [20, 34]],
  fr: [100, 30, 4, 10, 16, 38, 2, 0, 2],
  fc: [70, 3, 30, 37, 6],
  dis: [2, 1, 0, 1, 3, 400],
  pp: [60, 40, 3, 18, 40],                                      // TCDP 30 %
  def: [40, 4, 10, 1, 120],
  on: [72000, 2400, 2200, 2300, 2280],                          // 1200 min ON
  off: [36000, 1100, 1250, 1150, 1160],                         // 600 min OFF
  pjOnOff: 30,
};
base.fr[6] = 120; base.fr[7] = 90;
const cortes = {
  ppt: { p25: 0.96, p50: 1.05, p75: 1.13 }, vol: { p25: 5, p50: 7, p75: 9.5 }, rca: { p25: 0.38, p50: 0.49, p75: 0.61 },
  vnap: { p25: 2.37, p50: 2.43, p75: 2.51 }, linea: { p25: 0.41, p50: 0.51, p75: 0.56 },
  tcdp: { p25: 0.21, p50: 0.26, p75: 0.32 }, segPpt: { p25: 0.93, p50: 1.13, p75: 1.33 }, onoff: { p25: -6.96, p50: 0.49, p75: 5.57 },
};
const paq = {
  equipo: 'EQUIPO 1',
  jugadores: { 100: { n: 'PEREZ, JUAN', d: '7' }, 200: { n: 'GOMEZ, LUIS', d: '9' }, 300: { n: 'DIAZ, ANA <b>', d: '4' } },
  rendimiento: { jugadores: { 100: base } },
  liga: { rendimiento: { cortes }, reloj: { f: [[5000, 3000, 6500, 1700, 1500, 1300], [12000, 5500, 13000, 5400, 3000, 2300], [8500, 3200, 7600, 3800, 1600, 1200]] } },
  reloj: { jugadores: { 100: { f: [[60, 36, 80, 20, 20, 10], [150, 60, 160, 80, 30, 30], [90, 30, 78, 50, 10, 20]], e: [[20, 2, 10, 15, 1], [50, 5, 60, 10, 5], [20, 3, 50, 15, 4]], ro: [0, 0, 0], fa: [0, 0, 0], pj: 30 } } },
  clutch: { definicion: { segundos: 300, diferenciaMaxima: 5 }, jugadores: [{ id: '100', pj: 12, min: 40.5, mm: 6, pts: 30, tc: '10/24', t3: '3/10', tl: '7/8', efg: 47.9, ts: 54, usos: 30, porc: 31, pp: 3, ast: 4, reb: 6 }] },
};

titulo('1 · El motor');
const T = R.tasas(base);
check('pts por tiro = 318 / 300', Math.abs(T.ppt - 1.06) < 1e-9, T.ppt);
check('volumen = 10 tiros por partido', T.vol === 10, T.vol);
check('RCA = 85 / 132', Math.abs(T.rca - 85 / 132) < 1e-9);
check('valor por asistencia = 220 / 90', Math.abs(T.vnap - 220 / 90) < 1e-9);
check('a la línea: (30+4+10+16) / (100-2)', Math.abs(T.linea - 60 / 98) < 1e-9, T.linea);
check('TCDP = 18 / 60', Math.abs(T.tcdp - 0.3) < 1e-9);
const netOn = 100 * 2400 / 2300 - 100 * 2200 / 2280, netOff = 100 * 1100 / 1150 - 100 * 1250 / 1160;
check('On/Off = Net ON − Net OFF', Math.abs(T.onoff - (netOn - netOff)) < 1e-9, [T.onoff, netOn - netOff]);
check('nivel contra la competencia', R.nivel(0.7, cortes.rca) === 'alto' && R.nivel(0.3, cortes.rca) === 'bajo' && R.nivel(0.5, cortes.rca) === 'medio');
check('nivel invertido: menos TCDP es mejor', R.nivel(0.1, cortes.tcdp, true) === 'alto' && R.nivel(0.4, cortes.tcdp, true) === 'bajo');

const a = R.analizar(paq, 'perez, juan');
check('encuentra al jugador por nombre normalizado', a.ok && a.id === '100', a);
check('seis bloques en el orden del protocolo', a.ok && a.bloques.map(b => b.id).join() === 'veredicto,espacio,reloj,quimica,defensa,riesgo', a.bloques && a.bloques.map(b => b.id));
const txt = (id) => a.bloques.find(b => b.id === id).lineas.map(l => l.texto).join(' | ');
check('veredicto: On/Off con Net ON y OFF', /On\/Off \+?\d/.test(txt('veredicto')) && /con él en cancha/.test(txt('veredicto')), txt('veredicto'));
check('veredicto: pilar si el On/Off es del cuarto alto y positivo', /pilar/.test(txt('veredicto')) === (T.onoff >= cortes.onoff.p75 && T.onoff > 0), [T.onoff, txt('veredicto')]);
check('veredicto: volumen alto y eficiencia media no se llama «acumulador»', !/acumula tiros/.test(txt('veredicto')));
check('veredicto: el riesgo de TCDP aparece con TCDP del cuarto peor', /Su riesgo/.test(txt('veredicto')) === (T.tcdp >= cortes.tcdp.p75));
check('espacio: RCA 64 % y anotador autónomo', /RCA 64 %/.test(txt('espacio')) && /autónomo/.test(txt('espacio')), txt('espacio'));
check('espacio: rango real del triple por banda', /8 m o más 12\/40/.test(txt('espacio')));
check('espacio: segundas oportunidades con propias e inmediatas', /20\/40 tras rebote ofensivo/.test(txt('espacio')) && /63 % con su propio rebote/.test(txt('espacio')), txt('espacio'));
check('reloj: las tres franjas con el reloj de 24 que baja', /reloj 24-17/.test(txt('reloj')) && /reloj 16-7/.test(txt('reloj')) && /reloj 6-0/.test(txt('reloj')));
check('reloj: clutch con usos y +/-', /31 % de los usos/.test(txt('reloj')) && /\+6/.test(txt('reloj')), txt('reloj'));
check('química: socio principal con nombre dado vuelta', /Socio principal: JUAN|Socio principal: LUIS GOMEZ/.test(txt('quimica')), txt('quimica'));
check('química: dice que no hay hockey assists', /no hay hockey assists/.test(txt('quimica')));
check('defensa: robos por franja del reloj rival', /15 en transición · 10 en ataque estructurado · 15 en reloj tardío/.test(txt('defensa')), txt('defensa'));
check('riesgo: and-1, bonus sin elegir y libres', /10 and-1/.test(txt('riesgo')) && /de tiro o de penalización/.test(txt('riesgo')) && /90\/120/.test(txt('riesgo')), txt('riesgo'));
check('riesgo: TCDP 30 % y aclara drible o pase', /TCDP 30 %/.test(txt('riesgo')) && /drible o de pase/.test(txt('riesgo')));
check('riesgo: IDE = 100 × (1 − (1+3)/400) = 99', /IDE 99 %/.test(txt('riesgo')), txt('riesgo'));

titulo('2 · Las degradaciones');
check('paquete sin el campo: lo dice', R.analizar({ jugadores: {} }, 'X').ok === false && /próxima subida/.test(R.analizar({ jugadores: {} }, 'X').motivo));
check('jugador que no está: lo dice', R.analizar(paq, 'NADIE').ok === false);
const chico = JSON.parse(JSON.stringify(base));
chico.on = [3000, 100, 90, 95, 95]; chico.esp = [[5, 2, 4], [0, 0, 0], [3, 1, 3]]; chico.pp = [4, 2, 0, 1, 2];
const pc = Object.assign({}, paq, { rendimiento: { jugadores: { 100: chico } } });
const ac = R.analizar(pc, 'PEREZ, JUAN');
check('sin minutos: el On/Off no se compara y lo dice', /sin muestra suficiente/.test(ac.bloques[0].lineas[0].texto), ac.bloques[0].lineas[0].texto);
check('sin muestra: las tasas son null, no cero', R.tasas(chico).ppt === null && R.tasas(chico).tcdp === null && R.tasas(chico).onoff === null);
const sinReloj = R.analizar(Object.assign({}, paq, { reloj: null, clutch: null }), 'PEREZ, JUAN');
check('sin reloj ni clutch el bloque sigue', sinReloj.ok && /Sin reloj/.test(sinReloj.bloques[2].lineas[0].texto));

titulo('3 · La vista');
const h = R.html(paq, 'PEREZ, JUAN');
check('seis bloques en el HTML', (h.match(/data-rendimiento="/g) || []).length === 6);
check('sin undefined ni NaN', !/undefined|NaN/.test(h));
check('el color va con ▲/▼ (punto 14)', /mm-pos[^>]*>▲ /.test(h) || /mm-neg[^>]*>▼ /.test(h));
check('los nombres se escapan', !/<b>'?\)/.test(h) && /DIAZ|ANA &lt;b&gt;/.test(h), h.match(/ANA[^<]{0,20}/));
check('sin el campo, una línea y no la card', /próxima subida/.test(R.html({ jugadores: {} }, 'X')) && !/data-rendimiento/.test(R.html({ jugadores: {} }, 'X')));

titulo('4 · El cableado');
const jug = fs.readFileSync('./js/sgadd-jugadores.js', 'utf8');
const pbp = fs.readFileSync('./js/sgadd-pbp.js', 'utf8');
const idx = fs.readFileSync('./index.html', 'utf8');
check('la pestaña Rendimiento se declara con pbp: true', /id: 'rendimiento',[^\n]*pbp: true/.test(jug));
check('la ficha filtra las pestañas por la capa', /function jugadoresTabsVisibles\(\)[\s\S]{0,200}!t\.pbp \|\| pbp/.test(jug) && /jugadoresTabsVisibles\(\)/.test(jug.slice(jug.indexOf('function jugadoresFicha'))));
check('el tab pinta el lugar de montaje del play-by-play', /espacioRendimiento\(j\['NOMBRES'\], j\['EQUIPO'\]\)/.test(jug));
check('sgadd-pbp monta la card con SGADD_RENDIMIENTO', /data-pbp-rendimiento/.test(pbp) && /SGADD_RENDIMIENTO\.html\(paq, nombreRendimiento\)/.test(pbp));
check('el script se carga después de sgadd-pbp.js', idx.indexOf('sgadd-rendimiento.js') > idx.indexOf('sgadd-pbp.js'));

titulo('5 · Faltas FIBA/CAB');
const jF = Object.assign({}, base, { fi: [12, 5, 1, 1, 3, 6, 3, 95], bn: [60, 45, 18, 15, 7] });
const cF = Object.assign({}, cortes, { faltasPJ: { p25: 1.2, p50: 1.8, p75: 2.4 }, tempranoBonus: { p25: 0.3, p50: 0.5, p75: 0.6 },
  regaloBonus: { p25: 0.1, p50: 0.2, p75: 0.25 }, expulsion: { p25: 0, p50: 0, p75: 0.02 }, gestionQ4: { p25: 0.5, p50: 0.8, p75: 1 }, problemas: { p25: 0.1, p50: 0.2, p75: 0.3 } });
const pF = Object.assign({}, paq, { rendimiento: { jugadores: { 100: jF }, faltasEq: [120, 40, 12, 38, 10] }, liga: { rendimiento: { cortes: cF }, reloj: paq.liga.reloj } });
const TF = R.tasas(jF);
check('faltas por partido = 70 / 30', Math.abs(TF.faltasPJ - 70 / 30) < 1e-9, TF.faltasPJ);
check('bonus temprano = 45 / 60 y regalo = 18 / 70', Math.abs(TF.tempranoBonus - 0.75) < 1e-9 && Math.abs(TF.regaloBonus - 18 / 70) < 1e-9);
check('expulsión = 2 / 30 y gestión del 4.º cuarto = 1 − 3/6', Math.abs(TF.expulsion - 2 / 30) < 1e-9 && TF.gestionQ4 === 0.5);
check('sin fi/bn (paquete anterior) las tasas son null', R.tasas(base).tempranoBonus === null && R.tasas(base).gestionQ4 === null);
const pr = R.perfilFaltas(TF, cF);
check('el perfil sale de los cuartiles: empuja al bonus, regala libres y se expone a la expulsión', ['empuja-al-bonus', 'regala-libres-de-bonus', 'se-expone-a-la-expulsion'].every(x => pr.includes(x)), pr);
check('una competencia más exigente no etiqueta', R.perfilFaltas(TF, Object.assign({}, cF, { tempranoBonus: { p75: 0.9 }, regaloBonus: { p75: 0.5 }, expulsion: { p75: 0.5 } })).length === 0);
check('la tasa sin muestra no etiqueta', R.perfilFaltas(R.tasas(Object.assign({}, jF, { bn: [5, 5, 5, 0, 0] })), { tempranoBonus: cF.tempranoBonus, faltasPJ: cF.faltasPJ }).length === 0);
const aF = R.analizar(pF, 'PEREZ, JUAN');
const tF = aF.bloques.find(b => b.id === 'riesgo').lineas.map(l => l.texto).join(' | ');
check('el riesgo cuenta las faltas, el bonus, el cuarto cuarto y el equipo', /95 en 30 partidos/.test(tF) && /bonus prematuro/.test(tF) && /3 faltas o más en 6 partidos/.test(tF) && /llegó al bonus en 40 de 120/.test(tF), tF);
const hF = R.html(pF, 'PEREZ, JUAN');
check('el perfil sale en pantalla con ▲/▼', /Empuja al bonus/.test(hF) && /▼/.test(hF));
check('sin los campos, la card es la de antes', !/bonus de equipo/i.test(R.analizar(paq, 'PEREZ, JUAN').bloques[5].lineas.map(l => l.texto).join(' ')));
check('el HTML de faltas no trae undefined ni NaN y sigue con seis bloques', !/undefined|NaN/.test(hF) && (hF.match(/data-rendimiento="/g) || []).length === 6);

console.log('\n' + ok + ' ok · ' + fail + ' fallaron');
if (fail) { console.log('HAY FALLAS'); process.exit(1); }
