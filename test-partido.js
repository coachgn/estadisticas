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

/* -----------------------------------------------------------------------
   LA COLUMNA FIJA NO VA AL PAPEL

   Al imprimir, Chrome evalúa las media queries contra el ANCHO DE HOJA del
   diálogo: un A4 vertical con márgenes por defecto da ~717px, o sea MENOS
   de 767. La regla de la primera columna fija —pensada para el celular— se
   activaba en el papel y pintaba esa columna de #141414: los nombres, ya
   aplanados a #111, salían negro sobre negro. Pasaba en el box score y en
   la tabla de marcas del scouting, en cualquier club.
   ----------------------------------------------------------------------- */
check('la columna fija es una regla de PANTALLA, no del papel',
  /@media screen and \(max-width: 767px\) \{\s*\.scrollbox table th:first-child/.test(htmlPartido));
/* Todos los breakpoints responsive son afordancias de pantalla: si alguno
   queda sin `screen`, se activa al imprimir en A4 y vuelve a pasar esto. */
check('ningún breakpoint de ancho queda sin acotar a pantalla',
  !/@media \(max-width:/.test(htmlPartido));
check('y el modo impresión la neutraliza igual, por las dudas',
  /@media print[\s\S]*?\.scrollbox table td:first-child \{[^}]*background: transparent !important/.test(htmlPartido));

/* La opacidad destiñe el número Y el borde de la fila: en papel se lee
   sucio. Se atenúa con tinta, igual que el plantel del informe de equipo.

   El TONO cambió el 2026-08-25: era `#94a3b8`, que medido sobre el PDF
   real da **contraste 2,57** contra el papel blanco y no llega al 4,5 que
   pide AA para texto. Atenuar no es esconder. `#64748b` da 4,76 y mantiene
   la jerarquía, porque el texto principal del papel va en `#111` (18,87).
   Los BORDES de tarjeta siguen en #94a3b8: son decorativos, y su tono fue
   una decisión del club. */
check('los jugadores de pocos minutos se atenúan con tinta y no con opacidad',
  /modo-partido-print #detallePartido tr\.fila-tenue \{ opacity: 1 !important/.test(htmlPartido) &&
  /fila-tenue[\s\S]{0,400}color: #64748b !important/.test(htmlPartido));

/* El contraste, medido y no estimado. */
const lumPapel = (hex) => { const c = hex.replace('#', '');
  const v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
    .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const ctPapel = (hex) => 1.05 / (lumPapel(hex) + 0.05);   // contra blanco

check('el gris de texto atenuado pasa AA sobre papel blanco',
  ctPapel('#64748b') >= 4.5, ctPapel('#64748b').toFixed(2));
check('y el que se descartó no llegaba',
  ctPapel('#94a3b8') < 4.5, ctPapel('#94a3b8').toFixed(2));
check('atenuado sigue leyéndose como secundario frente al texto principal',
  ctPapel('#111111') > ctPapel('#64748b') * 3,
  ctPapel('#111111').toFixed(2) + ' vs ' + ctPapel('#64748b').toFixed(2));
check('la fila floja del informe de equipo usa el mismo gris',
  /fila-flojo td \* \{ color: #64748b !important; \}/.test(htmlPartido));
/* Y el acento de marca en papel: con DEPORTIVO es el azul del escudo, que
   sobre blanco da 16,53 — el caso inverso al de la pantalla. */
check('el acento de DEPORTIVO es legible sobre papel blanco',
  ctPapel('#09086E') >= 4.5, ctPapel('#09086E').toFixed(2));
check('y la fila lleva la clase que lo permite',
  /flojo \? 'opacity-50 fila-tenue'/.test(equiposJs));

/* Chart.js congela los colores en las OPCIONES al crear el gráfico, y el
   post-partido dibuja en pantalla y marca el modo papel recién al
   imprimir: sin repintar, la leyenda sale gris clarísimo sobre blanco. */
/* Por ORDEN y no por distancia: un comentario en el medio ponía esto en
   rojo sin que la propiedad cambiara (punto 43). */
const iClasePart = equiposJs.indexOf("classList.add('modo-partido-print')");
const iRepinta = equiposJs.indexOf('SGADD_CHARTS.repintarParaPapel()');
check('los gráficos se repintan con la paleta del papel antes de imprimir',
  iClasePart > -1 && iRepinta > iClasePart,
  'clase en ' + iClasePart + ', repintar en ' + iRepinta);
check('y el post-partido firma cada hoja con la tabla (encabezado, pie y marca de agua)',
  /inyectarPieDeHoja\('detallePartido'\)/.test(equiposJs) && /quitarPieDeHoja\('detallePartido'\)/.test(equiposJs));
check('el modo del post-partido está en la lista de modos de papel de charts',
  /MODOS_PAPEL *= *\[[^\]]*'modo-partido-print'/.test(require('fs').readFileSync('./js/sgadd-charts.js', 'utf8')));


/* ═══════════════════════════════════════════════════════════════════════
   LA CARD DE EFICIENCIA VA POR POSESIONES (punto 66)
   ═══════════════════════════════════════════════════════════════════════ */
const avPos = P.avanzadas({ fila: {
  PTS: 80, PLAYS: 100, RO: 20, POS: 80, PACE: 80,
  PTSopp: 70, PLAYSopp: 100, ROopp: 0,
} }, null);
check('ORTG de la card = 100 x PTS / POS', Math.abs(avPos.ortg - 100) < 1e-9, avPos.ortg);
check('y no el 80,0 que daría por play', Math.abs(avPos.ortg - 80) > 19);
check('DRTG sale de las posesiones del rival (100 - 0)', Math.abs(avPos.drtg - 70) < 1e-9, avPos.drtg);
check('el PPP de la misma card sigue por PLAY', Math.abs(avPos.ppp - 0.80) < 1e-9, avPos.ppp);

/* Sin la columna POS se usa PLAYS - RO, que es su definición. */
const avSinPos = P.avanzadas({ fila: {
  /* TCI + PP + 0,44 x T1I = 100 PLAYS, para que el respaldo de POS
     reproduzca los mismos 80 que declara la columna. */
  PTS: 80, PLAYS: 100, RO: 20, PACE: 80, TCI: 86, PP: 14, T1I: 0,
  PTSopp: 70, PLAYSopp: 100, ROopp: 0,
} }, null);
check('sin columna POS, el ORTG se calcula igual', Math.abs(avSinPos.ortg - 100) < 1e-9, avSinPos.ortg);

/* Y LA NOTA AL PIE dice la unidad, que es lo que el club pidió. */
const eqJs = require('fs').readFileSync('./js/sgadd-equipos.js', 'utf8');
check('la nota al pie declara POSESIONES y la norma CAB/FIBA',
  /ORTG, DRTG y PACE calculados sobre <b>POSESIONES<\/b>[\s\S]{0,120}CAB\/FIBA/.test(eqJs));
check('y aclara que PPP es la única por PLAY',
  /PPP es la única métrica por PLAY/.test(eqJs));
check('ya no dice que los ratings van por 100 PLAYS',
  !/ORTG y DRTG están calculados por 100/.test(eqJs));

/* ---------------------------------------------------------------------
   QUÉ DECIDIÓ EL PARTIDO (v330, punto 156)
   --------------------------------------------------------------------- */
console.log('\nQUÉ DECIDIÓ EL PARTIDO');
console.log('─'.repeat(70));
{
  const rivalL = part.lados.find(l => l !== propio);
  propio.factores = { 'eFG%': 0.58, 'PP%': 0.12, 'RO%': 0.30, 'RTL%': 0.20 };
  rivalL.factores = { 'eFG%': 0.44, 'PP%': 0.19, 'RO%': 0.35, 'RTL%': 0.18 };
  /* Un box con nombres y números para los responsables. */
  propio.box.forEach((j, i) => { j['PTS'] = i === 0 ? 24 : 8; j['T2C'] = i === 0 ? 8 : 3; j['T2I'] = i === 0 ? 12 : 6; j['T3C'] = i === 0 ? 3 : 1; j['T3I'] = i === 0 ? 5 : 3; j['PR'] = i === 1 ? 5 : 1; j['PP'] = 1; });
  rivalL.box.forEach((j, i) => { j['PTS'] = i === 0 ? 20 : 9; j['AST'] = i === 2 ? 9 : 2; j['RT'] = i === 2 ? 8 : 3; j['PP'] = i === 3 ? 6 : 1; j['T2I'] = i === 4 ? 14 : 5; j['T2C'] = i === 4 ? 7 : 2; j['T3I'] = i === 0 ? 6 : 2; j['T3C'] = i === 0 ? 1 : 0; });
  const fp = P.factoresPartido(idx, propio, rivalL);
  check('los 4 factores salen de los dos lados', fp.length === 4 && fp.every(f => typeof f.propio === 'number' && typeof f.rival === 'number'));
  check('el de mayor impacto es el tiro (peso 40 × 14 pp) y no los libres', fp.slice().sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto))[0].k === 'eFG%');
  check('en pérdidas menos es mejor: 12 % contra 19 % lo gana el propio', fp.find(f => f.k === 'PP%').gano === true && fp.find(f => f.k === 'PP%').impacto > 0);
  check('el rebote ofensivo perdido (30 contra 35) lleva gano false y impacto negativo', fp.find(f => f.k === 'RO%').gano === false && fp.find(f => f.k === 'RO%').impacto < 0);
  const dec = P.decision(idx, propio, rivalL, a);
  check('la decisión trae tarjetas, focos y plan', dec && dec.tarjetas.length >= 2 && dec.focos && dec.plan);
  check('la primera tarjeta es el factor que más pesó y dice la cifra de los dos', dec.tarjetas[0].id === 'decisor' && /58,0 % contra 44,0 %/.test(dec.tarjetas[0].texto), dec.tarjetas[0].texto);
  check('nombra a quien lo sostuvo, con sus números del box', /Local1 24 pts \(11\/17 en tiros de campo\)/.test(dec.tarjetas[0].texto), dec.tarjetas[0].texto);
  const perim = dec.plan.perimetro;
  check('sin un rival con 3 triples, el perímetro lo dice y no nombra a nadie', perim && perim.lectura === false && perim.nombres.length === 0, perim);
  rivalL.box[1]['T3C'] = 4; rivalL.box[1]['T3I'] = 7; rivalL.box[1]['MIN'] = 25; rivalL.box[1]['PTS'] = 15;
  const perim2 = P.planAjuste(propio, rivalL, a, fp, idx).perimetro;
  check('con un tirador de 4/7 el perímetro lo nombra, con su acierto y la acción defensiva', perim2.nombres.length === 1 && /4 triples de 7 \(57 %\)/.test(perim2.texto) && /cortina/.test(perim2.texto), perim2);
  check('el plan trae las 4 categorías de acción: perímetro, cerca del aro, generación y segundas oportunidades',
    ['perimetro', 'interior', 'generacion', 'segundas'].every(k => dec.plan[k] && dec.plan[k].titulo));
  check('la generación nombra a quien más repartió y dice cuántas asistencias', dec.plan.generacion.nombres.length === 1 && /Visita3/.test(dec.plan.generacion.texto) && /9 asistencias/.test(dec.plan.generacion.texto), dec.plan.generacion);
  check('cerca del aro sale del volumen y la eficiencia en dobles, sin hablar de puestos', /Visita5 convirtió 7 de 14 dobles/.test(dec.plan.interior.texto) && !/interior que juega/i.test(dec.plan.interior.texto), dec.plan.interior);
  check('ningún texto del plan ni de las tarjetas nombra al Simulador ni un puesto tradicional',
    !/simulador|pívot|pivot|escolta|alero|base|interior que/i.test(JSON.stringify(dec.tarjetas) + JSON.stringify(dec.plan)));
  const pr = dec.tarjetas.find(t => t.id === 'proyeccion');
  check('si hay expectativa, dice margen esperado y probabilidad, sin el nombre del modelo', !pr || (/Margen esperado/.test(pr.texto) && /% de victoria estimada/.test(pr.texto)), pr && pr.texto);
  /* Doble baseline: con un índice de la Regular, cada factor trae su referencia estructural. */
  const dr = P.factoresPartido(idx, propio, rivalL, idx);
  check('con índice de la Regular, cada factor trae regular y deltaRegular', dr.every(f => f.regular !== undefined && 'deltaRegular' in f));
  check('sin índice de la Regular no hay delta', P.factoresPartido(idx, propio, rivalL).every(f => f.regular === null && f.deltaRegular === null));
  check('nadie escribe un puesto ni una causa que la planilla no tiene (pivote, presión, secó la línea)',
    !/pivote|presión que|secó|alero|base /i.test(JSON.stringify(dec.tarjetas) + JSON.stringify(dec.plan) + JSON.stringify(dec.focos)));
  check('el contexto para el play-by-play trae los generadores rivales con su nombre de planilla, los dobles y los rebotes',
    dec.ctx.foco.indexOf('VISITA3, NOMBRE') !== -1 && dec.ctx.rivalDobles[0].t2i === 14 && typeof dec.ctx.rivalRo === 'number', dec.ctx);
  check('los focos a sostener incluyen el factor ganado y lo que el rival bajó', dec.focos.ataque.some(f => /Tiro de campo/.test(f.titulo)));
  /* Sin el factor ganado ni nada a sostener no se inventa un foco. */
  const peor = JSON.parse(JSON.stringify(fp)).map(f => Object.assign(f, { gano: f.gano === true ? false : f.gano, superior: false }));
  const focoVacio = P.focosPartido(idx, propio, rivalL, { claves: [] }, peor);
  check('sin factor ganado ni clave, el ataque queda vacío (no se inventa nada que sostener)', focoVacio.ataque.length === 0, focoVacio.ataque);
  /* El peso de Oliver decide: 5 pp de tiro (×40) pesan más que 8 pp de rebote (×20). */
  propio.factores = { 'eFG%': 0.50, 'PP%': 0.15, 'RO%': 0.40, 'RTL%': 0.20 };
  rivalL.factores = { 'eFG%': 0.45, 'PP%': 0.15, 'RO%': 0.32, 'RTL%': 0.20 };
  check('el peso de Oliver ordena: 5 pp de eFG% (2,0) pesan más que 8 pp de rebote (1,6)',
    P.factoresPartido(idx, propio, rivalL).slice().sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto))[0].k === 'eFG%');
  /* Sin un interior pasador no hay ajuste inventado. */
  rivalL.box.forEach(j => { j['AST'] = 1; });
  check('si ningún rival reparte 3 asistencias, la generación lo dice y no nombra a nadie',
    P.planAjuste(propio, rivalL, a, fp, idx).generacion.nombres.length === 0 && P.planAjuste(propio, rivalL, a, fp, idx).generacion.lectura === false);
}

/* ---------------------------------------------------------------------
   LA VARA PREVIA Y EL PLAN CONTRA LA REALIDAD (v332)
   --------------------------------------------------------------------- */
console.log('\nLA VARA PREVIA Y EL PLAN CONTRA LA REALIDAD (v332)');
console.log('─'.repeat(70));
{
  /* El índice de los partidos ANTERIORES al último (7 de 8), con el motor del TOTAL. */
  const antes = (f) => !/^08\//.test(f.FECHA);
  const pre = SGADD.construirIndice({
    'Base Datos E': { cols: colsE, filas: fE.filter(antes) },
    'Base Datos J': { cols: colsJ, filas: fJ.filter(antes) },
  }, { fase: 'REGULAR', torneo: SGADD.TORNEO_TOTAL });
  const partV = idx.partido(ultimoId);
  const propioV = partV.lados.find(l => l.equipo.clave === 'RECONQUISTA A');
  const aPre = P.analizar(idx, partV, propioV, { base: pre });
  const t3 = aPre.contraste.find(c => c.clave === 'T3%');
  check('el habitual sale de los partidos PREVIOS: T3% 6/22 sin la noche de 12 triples', t3 && Math.abs(t3.habitual - 6 / 22) < 1e-6, t3 && t3.habitual);
  check('y la noche se marca como clave contra esa vara', aPre.claves.some(c => c.clave === 'T3%'));
  const estrellaPre = aPre.propios.find(x => /LOCAL1/.test(x.fila.NOMBRES));
  const stPre = pre.statJugador(estrellaPre.fila.__clave, 'PTS');
  check('los desvíos del jugador también: su media previa son 12 pts, no 14,25', stPre && Math.abs(stPre.media - 12) < 1e-6 && stPre.n === 7, stPre && stPre.media);

  const aSin = P.analizar(idx, partV, propioV, { base: null });
  check('sin partidos previos no hay habitual ni claves inventadas', aSin.contraste.length === 0 && aSin.claves.length === 0 && aSin.propios.every(x => !x.destacado));
  const rivalV = partV.lados.find(l => l !== propioV);
  propioV.factores = { 'eFG%': 0.60, 'PP%': 0.12, 'RO%': 0.30, 'RTL%': 0.20 };
  rivalV.factores = { 'eFG%': 0.70, 'PP%': 0.13, 'RO%': 0.25, 'RTL%': 0.22 };
  const dSin = P.decision(idx, propioV, rivalV, aSin, null, { base: null, previa: { partidos: 0, hasta: '2026-05-07' } });
  const prSin = dSin.tarjetas.find(t => t.id === 'proyeccion');
  check('sin base no hay expectativa previa, y la tarjeta lo dice', prSin && /Sin expectativa previa/.test(prSin.texto), prSin && prSin.texto);
  check('los factores sin base dicen «sin habitual previo» en vez de un número', dSin.factores.every(f => f.habitual === null));

  const dPre = P.decision(idx, propioV, rivalV, aPre, null, { base: pre, previa: { partidos: 7, hasta: '2026-05-07' } });
  const prPre = dPre.tarjetas.find(t => t.id === 'proyeccion');
  check('la expectativa dice que es la PREVIA, con los partidos y la fecha de corte (o por qué no la hay)',
    prPre && ((/expectativa PREVIA/.test(prPre.texto) && /hasta el 07\/05/.test(prPre.texto)) || /muestra suficiente/.test(prPre.texto)), prPre && prPre.texto);
  check('y no repite que «este partido incluido»', !prPre || !/este partido incluido/.test(prPre.texto));
  const dec0 = dPre.tarjetas.find(t => t.id === 'decisor');
  check('cada ficha del factor decisivo trae su propio tono', dec0 && dec0.ficha.every(f => typeof f.tono === 'string'), dec0 && dec0.ficha);

  /* El tiro se perdió con nuestro eFG% sobre lo habitual: es la DEFENSA. */
  const fpD = P.factoresPartido(pre, propioV, rivalV);
  const efg = fpD.find(f => f.k === 'eFG%');
  check('el factor perdido con nuestro número sobre lo habitual se rotula «en defensa»',
    efg.gano === false && efg.desvioPropio >= 0 && /en defensa/.test((dPre.tarjetas.find(t => t.id === 'decisor') || {}).titulo || ''), dPre.tarjetas.map(t => t.titulo));
  check('y la ficha propia no lleva ▼ (tono negativo) si quedó sobre lo habitual', dec0.ficha[0].tono === 'pos');

  /* Un foco ganado al rival pero bajo lo habitual lo dice con esas palabras. */
  const focoBajo = P.focosPartido(pre, propioV, rivalV, { claves: [] }, [{ k: 'RO%', hab: 'RO%', label: 'Rebote ofensivo', corto: 'RO%', inv: false, gano: true, superior: false, propio: 0.244, rival: 0.192, habitual: 0.268, desvioPropio: -0.024 }]);
  check('un foco ganado y bajo lo habitual se rotula así (el ▲ ya no se lee «mejoró»)',
    focoBajo.ataque.length === 1 && /ganado, bajo lo habitual/.test(focoBajo.ataque[0].titulo) && /Igual quedó bajo nuestro habitual/.test(focoBajo.ataque[0].texto), focoBajo.ataque);

  check('sin índice previo el plan contra la realidad lo dice, sin error', P.planContraRealidad(null, idx, propioV, rivalV).ok === false);
}

/* Sobre la demo: el scouting rearmado con la previa y contrastado. */
{
  const DEMO = require('./js/sgadd-demo.js'), M = require('./js/sgadd-muestra.js');
  global.SGADD_4F = require('./js/sgadd-4factores.js');
  global.SGADD_SCOUT = require('./js/sgadd-scouting.js');
  const crudo = DEMO.rehidratar(JSON.parse(fs.readFileSync('./demo/datos-demo.json', 'utf8')));
  const H = crudo.hojas || crudo;
  const T = SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(H));
  const full = SGADD.construirIndice(H, { fase: T.fase, torneo: T.torneo });
  const e1 = full.get('EQUIPO 1');
  const pp = e1.partidos[Math.floor(e1.partidos.length * 0.6)];
  const pd = full.partido(pp.__id);
  const lp = pd.lados.find(l => l.equipo.clave === 'EQUIPO 1'), lr = pd.lados.find(l => l !== lp);
  const dia = pp.__id.slice(0, 10);
  const prev = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10))); prev.setUTCDate(prev.getUTCDate() - 1);
  const rec = M.recortar(H, T, { desde: null, hasta: prev.toISOString().slice(0, 10) });
  const pre = SGADD.construirIndice(rec.hojas, { fase: T.fase, torneo: SGADD.TORNEO_TOTAL });
  check('el índice previo no tiene el partido ni ninguno posterior', pre.get('EQUIPO 1').pj < e1.pj && !pre.partido(pp.__id));
  const plan = P.planContraRealidad(pre, full, lp, lr);
  check('el plan contra la realidad se arma sobre la demo', plan && plan.ok, plan && plan.motivo);
  check('trae los 4 duelos cruzados con lo previsto y lo real', plan.filas.filter(f => f.bloque === 'duelos').length === 4, plan.filas.map(f => f.bloque));
  check('el duelo decisivo va con ★', plan.filas.some(f => f.bloque === 'duelos' && /^★/.test(f.titulo)));
  check('trae el margen previsto, la versión perdedora o su motivo, los dos volúmenes y el FODA',
    ['margen', 'quiebre', 'volumen', 'foda'].every(b => plan.filas.some(f => f.bloque === b)) && plan.filas.filter(f => f.bloque === 'volumen').length === 2);
  check('cada fila tiene un veredicto del vocabulario cerrado', plan.filas.concat(plan.marcas, plan.tresCosas).every(f => ['ok', 'no', 'parcial', 'info'].indexOf(f.estado) !== -1));
  check('las marcas traen la consigna del plan y lo que hizo cada uno', plan.marcas.length >= 5 && plan.marcas.every(m => m.resultado && (m.conPelota || m.estado === 'info')));
  check('el que no se suelta se evalúa por sus triples', plan.marcas.filter(m => m.grupo === 'intocable').every(m => /en triples/.test(m.resultado) || m.estado === 'info'));
  check('las 3 cosas llevan veredicto', plan.tresCosas.length >= 2 && plan.tresCosas.some(t => t.estado !== 'info'));
  check('el resumen cuenta todas las filas', plan.resumen.ok + plan.resumen.no + plan.resumen.parcial <= plan.filas.length + plan.marcas.length + plan.tresCosas.length);
  /* El plan de ajuste no contradice una consigna sin decirlo. */
  const aD = P.analizar(full, pd, lp, { base: pre });
  const dD = P.decision(full, lp, lr, aD, null, { base: pre, plan: plan });
  const nombrado = ['perimetro', 'interior', 'generacion'].filter(k => dD.plan[k] && dD.plan[k].lectura);
  check('cuando nombra a un jugador con marca en el plan, el ajuste cita la consigna o dice si cambia',
    nombrado.length > 0 && nombrado.every(k => /plan|consigna/i.test(dD.plan[k].texto)), nombrado.map(k => dD.plan[k].texto));
  /* v333 · el golpe de ojo: cada fila trae sus números con tono. */
  const TONOS = ['pos', 'aviso', 'neg'];
  const dz = plan.filas.filter(f => f.bloque === 'duelos');
  check('cada duelo trae antes, contra y real de los dos lados con su tono', dz.every(f => f.datos && ['ellos', 'nos'].every(l =>
    typeof f.datos[l].antes === 'number' && typeof f.datos[l].real === 'number' && TONOS.indexOf(f.datos[l].tono) !== -1)));
  check('el tono del ataque rival es rojo cuando superó lo que concedía nuestra defensa por más de 2 pp', dz.every(f => {
    const d = f.datos, delta = d.inv ? d.ellos.contra - d.ellos.real : d.ellos.real - d.ellos.contra;
    return delta > 0.02 ? d.ellos.tono === 'neg' : delta <= 0 ? d.ellos.tono === 'pos' : d.ellos.tono === 'aviso'; }));
  const mg = plan.filas.find(f => f.bloque === 'margen');
  check('el margen trae previsto, real y tono', mg && typeof mg.datos.antes === 'number' && typeof mg.datos.real === 'number' && TONOS.indexOf(mg.datos.tono) !== -1);
  check('cada volumen trae su tono y su rótulo corto', plan.filas.filter(f => f.bloque === 'volumen').every(f => f.datos.items.every(i => TONOS.indexOf(i.tono) !== -1 && i.corto)));
  check('el top de daño son a lo sumo 3, primero los que no cumplieron', plan.danio.length <= 3
    && plan.danio.every((m, i, l) => !i || !(m.estado === 'no' && l[i - 1].estado !== 'no')));
  check('cada uno del top de daño trae sus puntos y su promedio previo', plan.danio.every(m => m.real && typeof m.real.pts === 'number'));

  /* v333 · el radar del partido: ocho ejes, escala fija, DRTG y TOV% invertidos. */
  const rd = P.radarPartido(lp, lr, aD);
  check('el radar trae los ocho ejes', rd && rd.length === 8 && rd.map(e => e.id).join() === 'NET,DRTG,REB%,OREB%,TOV%,AST%,eFG%,ORTG', rd && rd.map(e => e.id));
  check('cada eje está escalado entre 0 y 1', rd.every(e => e.sP === null || (e.sP >= 0 && e.sP <= 1)));
  const ejeDrtg = rd.find(e => e.id === 'DRTG'), cfg = P.RADAR_EJES.find(e => e.id === 'DRTG');
  check('DRTG va invertido: menos puntos concedidos queda más afuera', ejeDrtg.inv && Math.abs(ejeDrtg.sP - (1 - Math.max(0, Math.min(1, (ejeDrtg.propio - cfg.min) / (cfg.max - cfg.min))))) < 1e-9);
  const tcc = (lp.fila.TCC || 0), efgEsp = (tcc + 0.5 * (lp.fila.T3C || 0)) / lp.fila.TCI;
  check('el eFG% del radar es (TCC + 0,5·T3C) / TCI', Math.abs(rd.find(e => e.id === 'eFG%').propio - efgEsp) < 1e-9);
  check('NET = ORTG − DRTG', Math.abs(rd.find(e => e.id === 'NET').propio - (rd.find(e => e.id === 'ORTG').propio - ejeDrtg.propio)) < 1e-9);
  check('sin avanzadas no hay radar', P.radarPartido(lp, lr, {}) === null);

  /* Sin el plan, el ajuste no inventa una consigna. */
  const dSinPlan = P.decision(full, lp, lr, aD, null, { base: pre });
  check('sin plan previo, el ajuste no cita consignas', ['perimetro', 'interior', 'generacion'].every(k => !dSinPlan.plan[k] || !/Consigna del plan|El plan decía/.test(dSinPlan.plan[k].texto)));
}

/* v333 · la pantalla: el plan es un mosaico de números, no tablas de texto. */
{
  const src = fs.readFileSync('./js/sgadd-equipos.js', 'utf8');
  const html = fs.readFileSync('./index.html', 'utf8');
  const bloque = src.slice(src.indexOf('const planHtml = (() => {'), src.indexOf('/* Los focos a sostener'));
  check('la card del plan no lleva tablas: es una grilla de mosaicos (plan-g / plan-t)', !/<table/.test(bloque) && /plan-g/.test(bloque) && /plan-t/.test(bloque));
  check('el número de la noche lleva tono Y glifo (nunca solo color)', /rend-t-\$\{tono\}/.test(bloque) && /GLIFO\[tono\]/.test(bloque));
  check('las frases quedan plegadas en «Ver el detalle»', /<details class="rend-detalle[^"]*"><summary>Ver el detalle/.test(bloque));
  check('de las marcas solo va el top 3 de daño', /planReal\.danio/.test(bloque) && !/planReal\.marcas\.map/.test(bloque));
  check('el CSS del mosaico existe', /\.plan-g \{/.test(html) && /\.plan-t \{/.test(html) && /\.plan-f b \{/.test(html));
  check('el radar es SVG con los colores del escudo (CLUB.colorDeImagen) y se aclara para leerse', /function equiposRadarSvg/.test(src)
    && /CLUB\.colorDeImagen/.test(src) && /aclararHastaLegible/.test(src));
  check('si los dos colores se parecen, el rival pasa al color más lejano de una paleta', /equiposDistanciaColor\(p, r\) < 140/.test(src) && /'#f97316'/.test(src));
  check('la barra de % de victoria sale de la proyección previa', /equiposBarraVictoria\(dec\.proyeccion\.probPropio/.test(src) && /\.barra-victoria-b \{/.test(html));
  check('el radar viejo de Chart.js (chRadarPartido) ya no está', !/chRadarPartido/.test(src));
}

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
