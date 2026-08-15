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

/* =====================================================================
   PERFIL DE TIRO · distribución, convertidos/errados y marca de liga

   Un solo gráfico contesta las tres preguntas: la ALTURA de la barra es la
   distribución (cuántos tiró de cada zona), el apilado es convertidos vs
   errados, y la línea punteada es cuántos habría convertido la liga con
   ESOS MISMOS intentos. Por eso la referencia no es una barra aparte.
   ===================================================================== */
console.log('\nPERFIL DE TIRO DEL PARTIDO');
console.log('═'.repeat(70));

const ladoTiro = part.lados[0];
const tipoLiga = { 'T2%': 0.50, 'T3%': 0.30, 'T1%': 0.70 };
const pt = P.perfilTiro(ladoTiro, tipoLiga);

check('devuelve una entrada por zona del box score',
  pt && pt.zonas.length === 3 && pt.zonas.map(z => z.id).join(',') === 'T2,T3,T1',
  pt ? pt.zonas.map(z => z.id).join(',') : 'null');

const zT3 = pt.zonas.find(z => z.id === 'T3');
/* La fixture del último partido: 12/22 de 3. */
check('convertidos + errados = intentos', pt.zonas.every(z => z.convertidos + z.errados === z.intentos),
  zT3.convertidos + '+' + zT3.errados + ' vs ' + zT3.intentos);
check('el porcentaje sale de esa misma división',
  Math.abs(zT3.pct - 12 / 22) < 1e-9, String(zT3.pct));

/* LA marca de la liga: no es "el % de la liga" pintado en otro eje, son los
   TIROS que la liga habría metido con estos intentos. Es lo único que se
   puede comparar contra la parte llena de la barra. */
check('la marca de liga son intentos × %liga, en la misma unidad que la barra',
  Math.abs(zT3.convLiga - 22 * 0.30) < 1e-9, String(zT3.convLiga));
check('y el delta es la diferencia de porcentajes',
  Math.abs(zT3.delta - (12 / 22 - 0.30)) < 1e-9, String(zT3.delta));

/* Un dato ausente se muestra ausente, no se inventa. */
const sinTipo = P.perfilTiro(ladoTiro, {});
check('sin fila TIPO no hay marca de referencia, y el resto se calcula igual',
  sinTipo && sinTipo.zonas.every(z => z.convLiga === null && z.delta === null) &&
  sinTipo.totalIntentos === pt.totalIntentos);

check('el reparto suma 1', Math.abs(pt.reparto.reduce((s, r) => s + r.cuota, 0) - 1) < 1e-9);

/* Con 2 intentos, un acierto mueve el porcentaje 50 puntos: eso es ruido,
   no una zona destacada. */
const flaco = { fila: { T2I: 40, T2C: 20, T3I: 2, T3C: 2, T1I: 0, T1C: 0 } };
const pf = P.perfilTiro(flaco, tipoLiga);
check('una zona con menos de ' + P.MIN_INTENTOS_ZONA + ' intentos no puede ser la destacada',
  pf.destacada && pf.destacada.id !== 'T3', pf.destacada ? pf.destacada.id : 'sin destacada');

check('un lado sin un solo lanzamiento devuelve null, no un gráfico en cero',
  P.perfilTiro({ fila: { T2I: 0, T2C: 0, T3I: 0, T3C: 0, T1I: 0, T1C: 0 } }, tipoLiga) === null);
check('y un lado inexistente también', P.perfilTiro(null, tipoLiga) === null);

/* =====================================================================
   EL PDF POST-PARTIDO · DOS carillas A4, con corte fijo

   Estuvo un tiempo apuntando a UNA sola carilla, y esas reglas de
   compresión siguen valiendo: son las que hacen que el análisis entre en
   la primera hoja. Con el perfil de tiro adentro ya no entra todo junto,
   así que la especificación pasó a dos hojas con un corte DECIDIDO —los
   box scores abren la segunda— en vez de dejar que el navegador parta la
   tabla por donde le toque.
   ===================================================================== */
console.log('\nPDF POST-PARTIDO · dos carillas con corte fijo');
console.log('═'.repeat(70));

const htmlPartido = require('fs').readFileSync('./index.html', 'utf8');
const equiposJs = require('fs').readFileSync('./js/sgadd-equipos.js', 'utf8');

/* "Para el próximo cruce" ya usaba `lg:grid-cols-3`, pero el breakpoint
   `lg` de Tailwind es 1024px y la hoja A4 vertical mide 794: en el papel
   nunca se activaba y los tres bloques quedaban APILADOS. Eran ~210px de
   más, justo lo que empujaba el informe a una segunda hoja. */
check('los tres bloques de cierre van en columnas al imprimir',
  /#proximoCruce > \.grid \{[\s\S]{0,140}grid-template-columns: repeat\(3, 1fr\) !important/.test(htmlPartido));
/* Se comprimen los ESPACIOS, no la tipografía: el box score tiene que
   seguir siendo legible, que es todo el punto de llevar la hoja. */
check('se comprimen los aires verticales y no la tipografía',
  /modo-partido-print #detallePartido \.mb-6 \{ margin-bottom: 2\.5mm/.test(htmlPartido) &&
  !/modo-partido-print #detallePartido \{[^}]*font-size: [0-5]/.test(htmlPartido));
check('los escudos se embeben antes de imprimir',
  /SGADD_UI\.embeberImagenes\('#detallePartido'\)/.test(equiposJs));
check('y se restauran después',
  /SGADD_UI\.restaurarImagenes\('#detallePartido'\)/.test(equiposJs));

/* El corte es explícito: sin esto el navegador parte el box score a la
   mitad y la segunda hoja arranca con media tabla huérfana. */
check('los box scores abren la segunda hoja',
  /modo-partido-print #boxScores \{[^}]*page-break-before: always/.test(htmlPartido));
/* El perfil de tiro es lo último de la primera hoja: si se parte, uno de
   los dos equipos queda sin su gráfico al lado del otro. */
check('el perfil de tiro no se parte entre hojas',
  /modo-partido-print #perfilTiro \{[^}]*page-break-inside: avoid/.test(htmlPartido));
check('y sus dos gráficos van lado a lado en el papel',
  /modo-partido-print #perfilTiro > \.grid \{[^}]*grid-template-columns: *1fr 1fr !important/.test(htmlPartido));

/* Con 14 columnas, media hoja no alcanza: la tabla de la derecha llegaba a
   882px sobre un área de página que termina en 718 y Chromium no imprimía
   RT, AST, PR, PP ni +/-. Mismo defecto que "Restricción / alerta" en
   scouting: lo que cae fuera del área de página no se imprime. */
check('en el papel los box scores van uno debajo del otro, a ancho completo',
  /modo-partido-print #boxScores \{[^}]*grid-template-columns: *1fr *!important/.test(htmlPartido));
check('y las tablas se fijan al ancho de la hoja en vez de estirarse',
  /modo-partido-print #detallePartido table \{[^}]*table-layout: fixed !important/.test(htmlPartido));
check('la columna de nombres se lleva más ancho y puede partir de línea',
  /modo-partido-print #detallePartido table td:first-child \{[^}]*white-space: normal !important/.test(htmlPartido));

/* Chart.js congela los colores en las OPCIONES al crear el gráfico, y el
   post-partido dibuja en pantalla y marca el modo papel recién al
   imprimir: sin repintar, la leyenda sale gris clarísimo sobre blanco. */
check('los gráficos se repintan con la paleta del papel antes de imprimir',
  /modo-partido-print'\);[\s\S]{0,220}SGADD_CHARTS\.repintarParaPapel\(\)/.test(equiposJs));
check('el modo del post-partido está en la lista de modos de papel de charts',
  /MODOS_PAPEL *= *\[[^\]]*'modo-partido-print'/.test(require('fs').readFileSync('./js/sgadd-charts.js', 'utf8')));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
