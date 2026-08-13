/* El informe arma HTML a partir de las secciones elegidas. Se verifica que
   respete la selección y que no reviente si falta algo. */
let ok = 0, fail = 0;
const check = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };

const I = require('./js/sgadd-informe.js');

console.log('\nSECCIONES DEL INFORME');
console.log('═'.repeat(70));
I.SECCIONES.forEach(s => console.log('  ' + (s.pre ? '[x]' : '[ ]') + ' ' + s.label));

console.log('\nVERIFICACIONES');
console.log('─'.repeat(70));
check('hay 9 secciones seleccionables', I.SECCIONES.length === 9, String(I.SECCIONES.length));
check('las claves para scouting vienen premarcadas',
  ['ficha', 'insight', 'personalidad', '4factores'].every(id => I.SECCIONES.find(s => s.id === id).pre));
check('las secundarias vienen desmarcadas',
  ['ofensiva', 'defensiva', 'partidos'].every(id => !I.SECCIONES.find(s => s.id === id).pre));
check('ficha e insight son virtuales (no son un tab entero)',
  I.SECCIONES.find(s => s.id === 'ficha').virtual === 'ficha' &&
  I.SECCIONES.find(s => s.id === 'insight').virtual === 'insight');
check('el resto mapea a un tab real',
  I.SECCIONES.filter(s => s.tab).every(s => ['personalidad','4factores','condicion','ofensiva','defensiva','plantel','partidos'].indexOf(s.tab) !== -1));
check('no hay ids duplicados', new Set(I.SECCIONES.map(s => s.id)).size === I.SECCIONES.length);

const sel = I.elegidas();
check('elegidas() devuelve un estado por sección', Object.keys(sel).length === I.SECCIONES.length);

/* =====================================================================
   EXPORTACIÓN A PDF · lo que se midió generando el archivo con Chrome
   ===================================================================== */
console.log('\n2. EL PDF DEL INFORME DE EQUIPO');
console.log('═'.repeat(70));

const fs = require('fs');
const infoJs = fs.readFileSync('./js/sgadd-informe.js', 'utf8');
const uiJs = fs.readFileSync('./js/sgadd-ui.js', 'utf8');
const chartsJs = fs.readFileSync('./js/sgadd-charts.js', 'utf8');
const html = fs.readFileSync('./index.html', 'utf8');

/* EL BUG QUE SE COMÍA EL INFORME ENTERO.

   La limpieza era `setTimeout(limpiar, 400)` disparado justo después de
   `window.print()`. Si el diálogo tardaba en abrir —o si el navegador no
   bloquea en `print()`, que es lo que pasa al generar el PDF por
   automatización— el informe se borraba a sí mismo ANTES de imprimirse y
   salía la app en su lugar. Medido: a los 3,5 s no quedaba nada de
   `#informeSalida`, y el PDF traía la pantalla en vez del informe. */
check('la limpieza cuelga de afterprint, no de un setTimeout ciego',
  /addEventListener\('afterprint', alTerminar\)/.test(infoJs) &&
  !/window\.print\(\);\s*\n\s*setTimeout\(limpiar, 400\)/.test(infoJs));
check('y queda un respaldo por si afterprint no llega',
  /setTimeout\(alTerminar, 60000\)/.test(infoJs));
check('el respaldo se cancela cuando afterprint sí llega',
  /clearTimeout\(respaldo\)/.test(infoJs));

/* Los escudos: al imprimir, el navegador re-resuelve el `src` de cada
   <img> y cualquier fallo ahí los deja afuera del PDF sin avisar. La
   utilidad vive en sgadd-ui.js porque la usan las TRES exportaciones. */
check('la utilidad de embebido vive en sgadd-ui.js, compartida',
  /function embeberImagenes/.test(uiJs) && /function restaurarImagenes/.test(uiJs) &&
  /embeberImagenes, restaurarImagenes/.test(uiJs));
check('el informe de equipo embebe sus escudos',
  /SGADD_UI\.embeberImagenes\('#informeSalida'\)/.test(infoJs));
check('y los restaura al limpiar',
  /SGADD_UI\.restaurarImagenes\('#informeSalida'\)/.test(infoJs));
check('scouting usa la MISMA utilidad, no una copia',
  /SGADD_UI\.embeberImagenes\('#scoutInforme'\)/.test(fs.readFileSync('./js/sgadd-scouting.js', 'utf8')));
check('y el post-partido también',
  /SGADD_UI\.embeberImagenes\('#detallePartido'\)/.test(fs.readFileSync('./js/sgadd-equipos.js', 'utf8')));

/* EL LIENZO. `color-scheme: dark` hace que Chrome pinte el fondo de la
   página —márgenes incluidos— con su gris por defecto ANTES que el
   documento, así que ningún `background:#fff` lo tapa. Medido en los PDF
   viejos: informe de equipo RGB(18,18,18). Es la causa real de los
   "márgenes negros" del punto 7. */
check('se apaga color-scheme: dark al imprimir, para las TRES exportaciones',
  /@media print \{[\s\S]{0,3000}html \{ color-scheme: light !important; \}/.test(html));

/* LOS GRÁFICOS. Chart.js fija sus colores en JS, así que `@media print` no
   los puede corregir: el radar de 8 ejes salía con las etiquetas en
   #f5f4f2 sobre papel blanco, o sea invisible. */
check('la paleta de gráficos detecta el papel claro',
  /function enPapelClaro/.test(chartsJs) && /modo-impresion/.test(chartsJs));
check('el texto de máximo contraste se resuelve al dibujar, no queda fijo',
  /get tinta\(\) \{ return enPapelClaro\(\)/.test(chartsJs));
check('y ya no queda ningún color de texto hardcodeado a blanco',
  !/color: '#f5f4f2'/.test(chartsJs));
check('la grilla y el texto de ejes también se adaptan',
  /get grilla\(\) \{ return enPapelClaro\(\)/.test(chartsJs) &&
  /get texto\(\) \{ return enPapelClaro\(\)/.test(chartsJs));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
