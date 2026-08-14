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

/* --- Hoja A3 apaisada, como la de scouting --------------------------- */
/* El informe es ancho —tablas de métricas, barras comparadas, radar de 8
   ejes— y en A4 vertical todo eso entra apretado en 190mm. */
check('el informe se imprime en la hoja A3 apaisada',
  /body\.modo-impresion \{ page: apaisada; \}/.test(html));
check('y el ancho de la app deja de topearlo',
  /body\.modo-impresion #informeSalida \{ max-width: none !important; \}/.test(html));

/* --- Las tarjetas, con el gris del post-partido ---------------------- */
/* El blanco absoluto desarmaba la jerarquía: todo parecía texto suelto.
   Mismos valores que el post-partido, así los dos PDF se leen igual. */
check('las tarjetas llevan el mismo gris que las del post-partido',
  /body\.modo-impresion #informeSalida \.card,[\s\S]{0,400}background: #f1f5f9 !important;[\s\S]{0,80}border: 1px solid #cbd5e1/.test(html));
check('y el mismo valor que usa el post-partido, no uno parecido',
  (html.match(/background: #f1f5f9 !important/g) || []).length >= 2);
check('el verde y el rojo significan lo mismo en los dos informes',
  /body\.modo-impresion #informeSalida \.text-green-400 \{ color: #15803d/.test(html) &&
  /body\.modo-impresion #informeSalida \.text-red-400 \{ color: #b91c1c/.test(html));

/* --- Los gráficos no se montan sobre lo que sigue -------------------- */
/* `.chart-box` fija la altura, pero el <canvas> se dimensiona solo con
   `maintainAspectRatio: false` y se desborda sobre el pie de figura, el
   encabezado de la tabla siguiente o la tabla misma. */
/* NO se le fuerza `width/height: 100%` al canvas: Chart.js dibuja el
   bitmap a un tamaño y el CSS lo ESCALA, así que si no coinciden el
   gráfico sale DEFORMADO. Era lo que ponía el radar "muy apaisado" — el
   polígono se estiraba a lo ancho de la caja en vez de quedar regular. */
const reglaCanvas = (html.match(/#informeSalida \.chart-box canvas \{[^}]*\}/) || [''])[0];
check('el canvas no se estira: solo se le pone un máximo',
  /max-width: 100% !important/.test(reglaCanvas) &&
  /max-height: 100% !important/.test(reglaCanvas) &&
  !/(^|[^-])width: 100% !important/.test(reglaCanvas.replace(/max-width/g, 'MW')),
  reglaCanvas.slice(0, 90));
/* Un radar es cuadrado: a todo el ancho de una hoja de 400mm quedaba chico
   en el centro y con las etiquetas separadísimas del dibujo. */
check('el radar se acota en ancho y se centra',
  /\.chart-box\.is-radar \{[\s\S]{0,140}max-width: 120mm;[\s\S]{0,80}margin-left: auto/.test(html));
check('y la fábrica los marca con `is-radar`',
  /chart-box is-md is-radar/.test(chartsJs));

/* Tres bloques abren hoja a pedido del club. En pantalla viven DENTRO de
   un grid de dos columnas, así que romper página no alcanza: primero hay
   que aplanar la grilla o el corte queda a mitad de fila. */
check('los bloques marcados abren hoja nueva',
  /#informeSalida \[data-hoja\] \{[\s\S]{0,120}page-break-before: always/.test(html));
/* El selector lleva la barra de escape de Tailwind: `.lg\:grid-cols-2`. */
check('y la grilla que los contiene se aplana',
  html.indexOf('#informeSalida .lg') !== -1 &&
  /#informeSalida \.lg.:grid-cols-2 \{ display: block !important; \}/.test(html));
check('están marcados los tres: cómo ataca, dónde gana y 4 factores',
  (require('fs').readFileSync('./js/sgadd-equipos.js', 'utf8').match(/data-hoja/g) || []).length === 3);
check('la caja del gráfico reserva su espacio y no se parte',
  /#informeSalida \.chart-box \{[\s\S]{0,220}overflow: hidden;[\s\S]{0,120}page-break-inside: avoid/.test(html));
/* Un radar es CUADRADO: su tamaño lo limita el lado más corto. Con 70mm de
   alto quedaba diminuto en el centro de una hoja de 400mm de ancho. */
check('la caja es alta para que el radar crezca de verdad',
  /#informeSalida \.chart-box \{[\s\S]{0,60}height: 88mm !important/.test(html));
check('el pie de figura no se separa de su gráfico',
  /#informeSalida \.chart-box \+ p \{[\s\S]{0,100}page-break-before: avoid/.test(html));

/* Las filas de los 8 ejes usan `px-2 -mx-2` para que el hover cubra todo el
   ancho. En el papel el padre no tiene padding, así que esos 8px se salían
   del área imprimible y cortaban el texto alineado a la derecha
   ("Acelerado", "Va a la línea"…). Medido: 6 elementos a 1510px sobre un
   informe de 1502. Después del fix: 0 desbordes. */
check('la sangría negativa del hover se anula en el papel',
  /body\.modo-impresion #informeSalida \.-mx-2 \{[\s\S]{0,120}margin-right: 0 !important/.test(html));

console.log('\n' + '═'.repeat(70));
console.log((fail === 0 ? '✓ TODO OK' : '✗ HAY FALLAS') + '   ' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
