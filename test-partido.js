/* Detalle partido a partido: indexado, desvíos e insight. */
global.SGADD = require('./js/sgadd-core.js');
const P = require('./js/sgadd-partido.js');
const fs = require('fs');
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

const leer = p => { const L = fs.readFileSync(p, 'utf8').trim().split('\n'); const c = L[0].split('\t').map(x => x.trim());
  return { cols: c, filas: L.slice(1).map(l => { const v = l.split('\t'); const o = {}; c.forEach((k, i) => o[k] = (v[i] || '').trim()); return o; }).filter(f => Object.values(f).some(v => v !== '')) }; };

/* Dos equipos, 8 partidos. En el último, un jugador explota. */
const colsE = ('FECHA\tPARTIDO\tEQUIPO\tFASE\tCONDICION\tRESULTADO\tPTS\tPTSopp\tTCC\tTCI\tT2C\tT2I\tT3C\tT3I\tT1C\tT1I\tPP\tPLAYS\tRO\tRD\tAST').split('\t');
const colsJ = ('FECHA\tPARTIDO\tNOMBRES\tEQUIPO\tFASE\tCONDICION\tRESULTADO\tMIN\tPTS\tT2C\tT2I\tT3C\tT3I\tT1C\tT1I\tRT\tAST\tPR\tPP\tVAL').split('\t');
const fE = [], fJ = [];
const A = "RECONQUISTA 'A' - MM", B = 'ATENAS \'A\' - MM';

for (let i = 1; i <= 8; i++) {
  const fecha = String(i).padStart(2, '0') + '/05/2026';
  const nom = A + ' vs ' + B;
  const ultimo = i === 8;
  const t3c = ultimo ? 12 : 6;   // en el último el equipo explota de 3
  [[A, 'LOCAL', ultimo ? 'GANADO' : 'PERDIDO'], [B, 'VISITANTE', ultimo ? 'PERDIDO' : 'GANADO']].forEach(([eq, cond, res], lado) => {
    const t3 = lado === 0 ? t3c : 6;
    fE.push({ FECHA: fecha, PARTIDO: nom, EQUIPO: eq, FASE: 'REGULAR', CONDICION: cond, RESULTADO: res,
      PTS: String(40 + t3 * 3), PTSopp: '60', TCC: String(20 + t3), TCI: '60', T2C: '20', T2I: '38',
      T3C: String(t3), T3I: '22', T1C: '12', T1I: '18', PP: '13', PLAYS: '80', RO: '9', RD: '28', AST: '14' });

    for (let p = 1; p <= 6; p++) {
      // El jugador 1 de A hace 12 pts siempre, salvo en el último: 30.
      const esEstrella = (lado === 0 && p === 1);
      const pts = esEstrella ? (ultimo ? 30 : 12) : 10;
      const apellido = (lado === 0 ? 'LOCAL' : 'VISITA') + p;
      fJ.push({ FECHA: fecha, PARTIDO: nom, NOMBRES: apellido + ', NOMBRE', EQUIPO: eq,
        FASE: 'REGULAR', CONDICION: cond, RESULTADO: res, MIN: '28,0', PTS: String(pts),
        T2C: '4', T2I: '8', T3C: '1', T3I: '3', T1C: '2', T1I: '2', RT: '6', AST: '3', PR: '1', PP: '2', VAL: String(pts) });
    }
  });
}

const idx = SGADD.construirIndice({
  'PROMEDIOS E': leer('./test-fixtures/prom.tsv'),
  'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv'),
  'Base Datos E': { cols: colsE, filas: fE },
  'Base Datos J': { cols: colsJ, filas: fJ },
}, { fase: 'REGULAR' });

console.log('\nINDEXADO');
console.log('═'.repeat(70));
check('Base Datos J queda indexada por partido', idx.liga.boxPorPartido.size === 8, String(idx.liga.boxPorPartido.size));
check('y por jugador', idx.liga.jugadorPartidos.size === 12, String(idx.liga.jugadorPartidos.size));

const ids = Array.from(idx.liga.boxPorPartido.keys()).sort();
const ultimoId = ids[ids.length - 1];
console.log('  ids generados: ' + ids[0] + ' … ' + ultimoId);
check('el id es FECHA + PARTIDO', /^2026-05-\d\d_/.test(ultimoId), ultimoId);

const part = idx.partido(ultimoId);
check('partido() devuelve los dos lados', part && part.completo, part ? String(part.lados.length) : 'null');
check('y trae box score', part.conBox);
check('el local va primero',
  SGADD.texto(part.lados[0].fila['CONDICION']).toUpperCase() === 'LOCAL');
check('cada lado trae sus jugadores', part.lados.every(l => l.box.length === 6),
  part.lados.map(l => l.box.length).join(','));

console.log('\nDESVÍOS DEL JUGADOR');
console.log('─'.repeat(70));
const st = idx.statJugador(SGADD.clavePersona('LOCAL1, NOMBRE'), 'PTS');
console.log('  estrella: media ' + st.media.toFixed(1) + ' pts en ' + st.n + ' partidos');
/* 8 partidos, no 16: si el nombre se repite entre equipos, statJugador
   mezclaría los de los dos y el desvío saldría mal. */
check('calcula media y desvío sobre SUS partidos, sin mezclar homónimos', st && st.n === 8, st ? String(st.n) : 'null');

const propio = part.lados.find(l => l.equipo.clave === 'RECONQUISTA A');
const a = P.analizar(idx, part, propio);
const estrella = a.propios.find(x => /LOCAL1/.test(x.fila.NOMBRES));
check('detecta el pico de 30 pts como atípico', estrella.destacado && estrella.destacado.z > P.Z_ATIPICO,
  estrella.destacado ? estrella.destacado.z.toFixed(2) : 'sin destacado');
console.log('  ' + P.nombreCorto(estrella.fila) + ': ' + estrella.fila.PTS + ' pts, ' +
  (estrella.destacado.delta > 0 ? '+' : '') + estrella.destacado.delta.toFixed(1) + ' sobre su promedio (z=' + estrella.destacado.z.toFixed(2) + ')');
check('los que jugaron parejo NO se marcan',
  a.propios.filter(x => /LOCAL[2-6]/.test(x.fila.NOMBRES)).every(x => !x.destacado));

console.log('\nINSIGHT DEL PARTIDO');
console.log('─'.repeat(70));
a.texto.forEach(t => console.log('  ' + t));
check('genera narrativa', a.texto.length >= 2);
check('detecta que el triple fue la clave', a.claves.some(c => c.clave === 'T3%'),
  a.claves.map(c => c.clave).join(','));
check('claves y grietas no se solapan',
  a.claves.every(c => !a.grietas.some(g => g.clave === c.clave)));

console.log('\n  💡 ' + (a.gano ? 'SOSTENER' : 'CORREGIR') + ':');
(a.gano ? a.recomendacion.sostener : a.recomendacion.corregir).forEach(t => console.log('     · ' + t));
console.log('  🎯 NUESTROS:');
a.recomendacion.destacados.concat(a.recomendacion.potenciar).slice(0, 3).forEach(t => console.log('     · ' + t));
console.log('  🎯 RIVAL:');
a.recomendacion.vigilar.forEach(t => console.log('     · ' + t));
check('la recomendación tiene contenido',
  (a.recomendacion.sostener.length || a.recomendacion.corregir.length) && a.recomendacion.vigilar.length);

console.log('\nROBUSTEZ');
console.log('─'.repeat(70));
check('id inexistente no rompe', idx.partido('2099-01-01_no-existe') === null);
const sinBox = SGADD.construirIndice({
  'PROMEDIOS E': leer('./test-fixtures/prom.tsv'), 'PROMEDIOS 4F': leer('./test-fixtures/p4f.tsv'),
  'Base Datos E': { cols: colsE, filas: fE } }, { fase: 'REGULAR' });
const pSinBox = sinBox.partido(ultimoId);
check('sin Base Datos J, el partido existe igual', pSinBox && pSinBox.completo && !pSinBox.conBox);
check('y analizar() no revienta',
  !!P.analizar(sinBox, pSinBox, pSinBox.lados.find(l => l.equipo.clave === 'RECONQUISTA A')));


/* --- `+/-` en el box score (MotorStats v30+) --- */
console.log('\n8. COLUMNA +/- EN EL BOX SCORE');
console.log('═'.repeat(70));
check('+/- es una columna del box score', P.COLS_BOX.indexOf('+/-') !== -1);
check('va última: no es producción del jugador, es cómo le fue al equipo con él adentro',
  P.COLS_BOX[P.COLS_BOX.length - 1] === '+/-', P.COLS_BOX.join(','));
/* Marcar un +/- como "atípico contra su propio promedio" no dice nada del
   jugador: depende de los otros cuatro que estaban en cancha. */
check('NO entra en COLS_DESVIO: el +/- depende del resto del quinteto',
  P.COLS_DESVIO.indexOf('+/-') === -1);
check('los desvíos siguen siendo los cuatro de siempre',
  P.COLS_DESVIO.join(',') === 'PTS,RT,AST,PLAYS', P.COLS_DESVIO.join(','));

/* Regla de negocio verificada por el motor en su v31: con 5 en cancha,
   sumar la columna da ~5x el margen real. El total de equipo NO se suma. */
check('el margen del equipo sale de SGADD.masMenosEquipo, no de sumar la columna', (function () {
  var box = [19, 19, 19, 19, 19].map(function (v) { return { '+/-': v }; });
  var suma = box.reduce(function (a, j) { return a + j['+/-']; }, 0);
  return SGADD.masMenosEquipo(88, 69) === 19 && suma === 95;
})());

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
