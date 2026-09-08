/* =====================================================================
   SGADD · RESPONSIVE, TARGETS TACTILES Y MODALES

   Lo que este archivo defiende salio de MEDIR la app real en el navegador
   a 320, 375 y 768px, con puntero grueso emulado y datos reales de
   DEPORTIVO (12 equipos, 224 jugadores). No de leer el CSS.

   EL RESULTADO DE ESA MEDICION, para que se pueda contrastar:

     desborde horizontal      0 en las 9 secciones, en los 3 anchos
     tablas sin caja scroll   0
     targets < 44x44          87 → 1   (el que queda es una COLUMNA de
                                        43,6px de ancho por 44 de alto)

   Y dos defectos funcionales que el ojo no ve hasta que pasan:

     1. el modal de confirmacion no acotaba su alto ni scrolleaba, asi
        que a 320x568 con un diff de 16 cambios media 1053px, arrancaba
        en -242 y los botones quedaban en y=746: FUERA de la pantalla y
        sin forma de llegar. El admin no podia publicar desde el telefono.
     2. el bloque tactil iba en `@media (pointer: coarse)` a secas. Al
        imprimir, Chrome sigue evaluando `pointer` contra el DISPOSITIVO,
        asi que un PDF generado desde un telefono entraba en esa rama y
        salia con otra altura de fila y otra paginacion que el mismo PDF
        desde escritorio. Es la familia del punto 7.4 bis.
   ===================================================================== */

const fs = require('fs');
const path = require('path');

let pasados = 0, fallados = 0;
function ok(cond, nombre, detalle) {
  if (cond) { pasados++; return; }
  fallados++;
  console.log('  ✗ ' + nombre + (detalle ? '  →  ' + detalle : ''));
}
function igual(a, b, nombre) {
  ok(JSON.stringify(a) === JSON.stringify(b), nombre,
     'esperaba ' + JSON.stringify(b) + ' y dio ' + JSON.stringify(a));
}
function bloque(t) { console.log('\n' + t); }

const RAIZ = __dirname;
const HTML = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'sgadd.css'), 'utf8');
const ESTILO = (HTML.match(/\n<style>\n[\s\S]*?<\/style>/) || [''])[0];

/* =====================================================================
   1 · NINGUNA MEDIA QUERY DEL PANEL SE CUELA EN EL PAPEL

   La regla del proyecto: toda consulta que dependa del ANCHO o del
   DISPOSITIVO va acotada a `screen`. Si no, se activa al imprimir —las
   de impresion se evaluan contra la HOJA y contra el dispositivo real— y
   el PDF deja de ser el mismo desde un telefono que desde el escritorio.

   Se parsea el bloque `<style>` en vez de buscar una cadena: asi una
   consulta NUEVA sin `screen` rompe esto, aunque nadie se acuerde.
   ===================================================================== */
bloque('1 · Las media queries del panel no entran al papel');

const CONSULTAS = (ESTILO.match(/@media[^{]+/g) || []).map(m =>
  m.replace(/^@media\s*/, '').trim().toLowerCase());

ok(CONSULTAS.length > 10, 'se parsearon las media queries del <style>', CONSULTAS.length);

const DEPENDE_DEL_DISPOSITIVO = /max-width|min-width|pointer|hover|orientation/;
const coladas = CONSULTAS.filter(c =>
  DEPENDE_DEL_DISPOSITIVO.test(c) && !/\bscreen\b/.test(c) && !/\bprint\b/.test(c));
igual(coladas, [],
      'toda consulta de ancho o de puntero va acotada a `screen`');

/* Y la del bloque tactil en particular, que es la que rompia el PDF
   generado desde un telefono. */
ok(/@media screen and \(pointer: coarse\)/.test(ESTILO),
   'el bloque de targets tactiles es `screen and (pointer: coarse)`');
ok(!/@media \(pointer: coarse\)/.test(ESTILO),
   '  y no queda la version sin acotar');

/* No lleva tope de ancho A PROPOSITO: una tablet de 1024px con dedo
   necesita los 44px igual que un telefono de 320. */
const TACTIL = ESTILO.slice(ESTILO.indexOf('@media screen and (pointer: coarse)'));
const CUERPO_TACTIL = TACTIL.slice(0, TACTIL.indexOf('\n  }\n') + 5);
ok(!/max-width/.test(CUERPO_TACTIL.split('{')[0]),
   'el bloque tactil no se acota por ancho: la tablet tambien tiene dedos');

/* =====================================================================
   2 · QUE CUBRE EL BLOQUE TACTIL

   La version anterior listaba `button`, `select` y `[role=button]`.
   Medido a 375px con puntero grueso, quedaban afuera:

     cabeceras ordenables   23px de alto   (×6 en Jugadores, ×4 en Equipos)
     filas interactivas     32,5px
     inputs                 30px           (×7 en Configuracion)
     summary                31px
     enlaces del pie        15px
     botones de icono       40px de ANCHO
   ===================================================================== */
bloque('2 · Que cubre');

const CUBRE = [
  ['summary', 'los `summary` plegables'],
  ['input:not\\(\\[type="checkbox"\\]\\)', 'los inputs, menos las casillas'],
  ['th\\[aria-sort\\]', 'las cabeceras ordenables'],
  ['tr\\[role="button"\\] > td', 'las filas interactivas'],
  ['\\.pie-enlace', 'los enlaces del pie'],
  ['button \\{ min-width', 'el ANCHO de los botones de icono'],
];
CUBRE.forEach(([re, eti]) =>
  ok(new RegExp(re).test(CUERPO_TACTIL), 'cubre ' + eti));

/* LAS CASILLAS NO. Un checkbox de 44px es una caja gigante; lo que tiene
   que crecer es su etiqueta, que es lo que el dedo toca. */
ok(/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/.test(CUERPO_TACTIL),
   'y deja las casillas afuera a proposito');

/* La cabecera va con `height` y no con `min-height`: en `display:
   table-cell` el minimo no manda, y el alto de una tabla se da asi. */
ok(/th\[aria-sort\] \{ height: 44px/.test(CUERPO_TACTIL),
   'la cabecera usa `height`, que en tablas se comporta como minimo');
/* Y la fila con PADDING: el alto de un `tr` lo decide su contenido. */
ok(/tr\[role="button"\] > td \{ padding-top/.test(CUERPO_TACTIL),
   'y la fila con padding en las celdas, no con alto en el `tr`');

/* Los chips de leyenda NO son botones: no se tocan, y estirarlos rompe
   la linea de la leyenda. */
ok(/\.legend-chip \{ min-height: 0/.test(CUERPO_TACTIL),
   'los chips de leyenda quedan exentos');

/* =====================================================================
   3 · EL MODAL SE ACOTA Y SCROLLEA

   `.login-fondo` centra con flex. Sin alto declarado, un contenido mas
   alto que la pantalla desborda para los DOS lados y no scrollea
   ninguno: los botones quedan inalcanzables.
   ===================================================================== */
bloque('3 · Los modales');

const CAJA = ESTILO.slice(ESTILO.indexOf('.login-caja {'), ESTILO.indexOf('.login-caja {') + 400);
ok(/max-height:\s*calc\(100vh/.test(CAJA), '`.login-caja` acota su alto al viewport');
ok(/overflow-y:\s*auto/.test(CAJA), '  y scrollea por dentro');
ok(/overscroll-behavior:\s*contain/.test(CAJA),
   '  sin arrastrar la pagina de atras al llegar al borde');

/* LA BARRA DE ACCIONES NO SE VA CON EL SCROLL. Alcanzarlos scrolleando
   ya no alcanza: un modal que se abre sin mostrar sus botones genera
   justo la duda que un modal no tiene que generar. */
ok(/\.modal-acciones \{[\s\S]{0,200}position: sticky/.test(ESTILO),
   'la fila de acciones queda pegada abajo');
ok(/\.modal-acciones \{[\s\S]{0,240}background:/.test(ESTILO),
   '  con fondo opaco, o el contenido pasa por detras');

/* Y su contenedor pierde el padding de abajo: `bottom: 0` se ancla a la
   caja de PADDING, asi que con el `p-5` intacto quedan 20px por debajo
   de los botones y se ve el contenido pasando por ahi. */
ok(/:has\(> \.modal-acciones\)[\s\S]{0,80}padding-bottom: 0/.test(ESTILO),
   'y el contenedor con barra pegajosa no lleva padding abajo');

/* Los TRES modales la usan. Uno solo que se olvide vuelve a dejar sus
   botones fuera de pantalla, y es el mismo bug con otro nombre. */
[['sgadd-confirmar.js', 'el de confirmacion'],
 ['sgadd-ficha.js', 'el de la ficha'],
 ['sgadd-informe.js', 'el del informe']].forEach(([f, eti]) => {
  const src = fs.readFileSync(path.join(RAIZ, 'js', f), 'utf8');
  ok(src.indexOf('modal-acciones') > -1, eti + ' usa la barra pegajosa');
});

/* El de la ficha tiene que acotarse como ya hacia el del informe. */
const FICHA = fs.readFileSync(path.join(RAIZ, 'js', 'sgadd-ficha.js'), 'utf8');
ok(/max-h-\[90vh\][\s\S]{0,24}overflow-y-auto/.test(FICHA),
   'el modal de la ficha acota su alto y scrollea');
/* Y la clase tiene que EXISTIR en el CSS compilado: el scan de Tailwind
   es estatico, asi que una clase que nadie mas usa se puede caer. */
ok(/\.max-h-\\\[90vh\\\]\{max-height:90vh\}/.test(CSS),
   '  y `max-h-[90vh]` esta en el CSS compilado, no solo en el markup');
ok(/\.overflow-y-auto\{/.test(CSS), '  igual que `overflow-y-auto`');

/* =====================================================================
   4 · LOS MODALES NO SE IMPRIMEN

   La lista de ocultado nombraba `#modalInforme` y dejaba afuera al de la
   ficha, al de confirmacion y al de login: un Ctrl+P con uno abierto
   imprimia su tarjeta encima de la pagina. Sus botones y campos ya caian
   por `button, select, input`, asi que salia una caja con el titulo y
   las etiquetas sueltas — peor que la caja entera.
   ===================================================================== */
bloque('4 · Impresion');

/* El selector abarca VARIAS LINEAS: se toma la regla entera, desde
   `aside, nav` hasta su llave. Con un match de una sola linea el test
   leia la mitad de la regla y no veia `.no-imprimir`. */
const OCULTA = (ESTILO.match(/aside, nav, header\.sticky[\s\S]*?\}/) || [''])[0];
ok(/\[role="dialog"\]/.test(OCULTA),
   'los modales se ocultan por ROL, no por una lista de ids', OCULTA.slice(0, 90));
ok(/\.login-fondo/.test(OCULTA), '  y el fondo del modal tambien');
ok(/\.no-imprimir/.test(OCULTA) && /display:\s*none\s*!important/.test(OCULTA),
   '  junto con `.no-imprimir`, y con !important');

/* Todos los modales declaran el rol, o la regla de arriba no los alcanza. */
['sgadd-confirmar.js', 'sgadd-ficha.js', 'sgadd-informe.js', 'sgadd-buzon.js', 'sgadd-login.js']
  .forEach(f => {
    const src = fs.readFileSync(path.join(RAIZ, 'js', f), 'utf8');
    ok(src.indexOf('role="dialog"') > -1, f + ' declara role="dialog"');
  });

/* La vara de medicion no va al papel: el PDF de la ficha reusa los
   bloques del tab y es la hoja de la charla con UN jugador. */
const JUG = fs.readFileSync(path.join(RAIZ, 'js', 'sgadd-jugadores.js'), 'utf8');
const BLOQUE_VARA = JUG.slice(JUG.indexOf('function jugadoresBloqueVara'),
                              JUG.indexOf('function jugadoresBloqueCondicion'));
ok(/<details class="no-imprimir/.test(BLOQUE_VARA),
   'la vara de medicion sigue sin imprimirse');

/* Y el papel sigue apagando el `color-scheme` oscuro, que es lo que
   pintaba los margenes de negro (punto 7.1). */
ok(/color-scheme:\s*light\s*!important/.test(ESTILO),
   'el modo papel sigue forzando `color-scheme: light`');

/* =====================================================================
   5 · LO QUE NO SE TOCO

   El escritorio no cambia: todo lo de arriba vive dentro del bloque
   tactil. Si alguna de estas reglas se escapa de ahi, el DT con mouse
   pierde la densidad de sus tablas.
   ===================================================================== */
bloque('5 · El escritorio no se movio');

const FUERA = ESTILO.replace(CUERPO_TACTIL, '');
ok(!/th\[aria-sort\] \{ height: 44px/.test(FUERA),
   'los 44px de la cabecera viven SOLO en el bloque tactil');
ok(!/tr\[role="button"\] > td \{ padding-top: \.75rem/.test(FUERA),
   'y el padding de la fila tambien');

/* La columna fija de celular sigue acotada a `screen`: es la regla que
   pintaba la primera columna de negro en el papel (punto 7.4 bis). */
ok(/@media screen and \(max-width: 767px\)[\s\S]{0,400}position: sticky; left: 0/.test(ESTILO),
   'la columna fija de celular sigue en `screen`');

console.log('\n' + '─'.repeat(60));
if (fallados === 0) console.log('✓ TODO OK · ' + pasados + ' tests');
else { console.log('✗ ' + fallados + ' FALLARON de ' + (pasados + fallados)); process.exitCode = 1; }
