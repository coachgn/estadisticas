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
/* `\r?\n` y no `\n`: el repo alterna entre LF y CRLF —git normaliza al
   hacer checkout— y con el ancla dura un rebase dejaba el bloque sin
   extraer, asi que TODAS las verificaciones de CSS pasaban a fallar de
   golpe sin que hubiera cambiado una sola regla. */
const ESTILO = (HTML.match(/\r?\n<style>\r?\n[\s\S]*?<\/style>/) || [''])[0];

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
/* El cierre del bloque se busca con un regex tolerante al fin de linea:
   con `'\n  }\n'` a mano, un checkout que normaliza a CRLF dejaba el
   cuerpo vacio y las doce verificaciones de abajo fallaban juntas sin
   que hubiera cambiado una regla. */
const CIERRE = /\r?\n  \}\r?\n/.exec(TACTIL);
const CUERPO_TACTIL = TACTIL.slice(0, CIERRE ? CIERRE.index + CIERRE[0].length : 0);
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
   4 bis · EL PIE INSTITUCIONAL, EN TODAS LAS HOJAS

   `pieInforme()` iba EN EL FLUJO: salía una vez, al final, o sea en la
   última hoja. Con un informe de nueve páginas eso deja ocho sin firmar,
   y una hoja suelta de un PDF compartido no dice de dónde salió.

   MEDIDO SOBRE LOS PDF REALES, generando el MISMO documento con y sin
   el pie y contando los dibujos de imagen:

     ficha    9 hojas · 17 imágenes sin pie → 26 con pie · +9
     ranking  8 hojas · una imagen por hoja en las ocho

   O sea: el logo del pie se dibuja EXACTAMENTE una vez por hoja.
   ===================================================================== */
bloque('4 bis · El pie institucional');

const UI = fs.readFileSync(path.join(__dirname, 'js/sgadd-ui.js'), 'utf8');

ok(/function inyectarPieMotorStats/.test(UI), 'existe el helper de inyección');
ok(/function quitarPieMotorStats/.test(UI), 'y el que lo saca');

/* VA COLGADO DEL BODY. `position: fixed` se ancla al primer ancestro con
   `transform`, `filter` o `contain`: adentro de una card con
   `backdrop-filter` dejaría de repetirse sin ningún síntoma. */
/* Se mira el CUERPO del helper y se exige que el unico destino sea el
   body: un `(otro || document.body).appendChild(n)` pasaria un regex
   laxo y colgaria el pie de otro nodo — que es justo lo que rompe la
   repeticion por hoja. */
const CUERPO_PIE = UI.slice(UI.indexOf('function inyectarPieMotorStats'),
                            UI.indexOf('function quitarPieMotorStats'));
const DESTINOS = (CUERPO_PIE.match(/[\w.()\[\]'"|? ]+\.appendChild\(n\)/g) || [])
  .map(t => t.trim());
igual([...new Set(DESTINOS)], ['document.body.appendChild(n)'],
      'el pie cuelga SOLO del body, no de un contenedor de salida');

/* Idempotente: se llama desde cinco exportaciones y llamarla dos veces
   no puede apilar dos pies. */
ok(/getElementById\(ID_PIE\)/.test(UI),
   'reusa el nodo si ya existe: no apila dos pies');

/* LA FECHA SE CALCULA AL IMPRIMIR y no al armar el documento: entre que
   se abre el modal y se toca Generar puede pasar la medianoche. */
ok(/n\.innerHTML = pieInforme\(fecha\)/.test(UI),
   'el contenido se rearma en cada inyección, con la fecha de ese momento');

/* --- EL CSS --- */
ok(/\.pie-motorstats \{ display: none; \}/.test(ESTILO),
   'en PANTALLA no se ve: la firma no aporta navegando y taparía la última fila');
const BLOQUE_PIE = (ESTILO.match(/\.pie-motorstats \{[\s\S]{0,400}?\}/g) || []).join('\n');
ok(/display: flex !important/.test(BLOQUE_PIE), 'y al imprimir sí, con !important');
ok(/position: fixed/.test(BLOQUE_PIE), 'fijo, que es lo que lo repite hoja por hoja');
ok(/bottom: 0/.test(BLOQUE_PIE), 'abajo');
ok(/z-index: 9999/.test(BLOQUE_PIE), 'y por encima del contenido');

/* Y el del FLUJO se esconde al imprimir: sale al final del documento, o
   sea en la última hoja, y ahí coincidiría con el fijo. */
ok(/\.informe-pie \{ display: none !important; \}/.test(ESTILO),
   'el pie del flujo se esconde: si no, la última hoja saldría con dos');

/* LAS DOS MITADES. El pie ocupa la franja de abajo Y cada `@page` se la
   reserva. Con una sola, el texto de la última línea queda debajo de la
   barra — y no se ve auditando en pantalla, solo en el PDF.

   Medido: el pie mide 9,2mm en los tres anchos de hoja (A4 vertical, A4
   apaisada y A3 apaisada) contra los 15mm reservados. */
const PAGES = ESTILO.match(/@page[^{]*\{[^}]*\}/g) || [];
ok(PAGES.length >= 4, 'se parsearon las reglas @page', PAGES.length);
const sinReserva = PAGES.filter(r => /size:/.test(r) && !/margin-bottom: 15mm/.test(r));
igual(sinReserva, [],
      'TODA @page que declara tamaño reserva los 15mm del pie');

/* --- LAS CINCO EXPORTACIONES --- */
[['sgadd-ficha.js', 'la ficha del jugador'],
 ['sgadd-informe.js', 'el informe de equipo'],
 ['sgadd-rankingpdf.js', 'el ranking del plantel'],
 ['sgadd-scouting.js', 'el informe pre-partido'],
 ['sgadd-equipos.js', 'el post-partido']].forEach(([f, eti]) => {
  const src = fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');
  ok(/inyectarPieMotorStats\(\)/.test(src), eti + ' inyecta el pie');
  ok(/quitarPieMotorStats\(\)/.test(src), '  y lo saca al terminar');
});

/* EL PIE SE EXCEPTÚA DE LOS TRES OCULTADOS. Esas reglas esconden todo lo
   que no es el contenedor de salida, y el pie es hermano del contenedor,
   así que sin la excepción desaparece del PDF. */
['modo-impresion', 'modo-ficha-print', 'modo-ranking-print'].forEach(m => {
  const re = new RegExp('body\\.' + m + ' > \\*:not\\([^)]+\\):not\\(\\.pie-motorstats\\)');
  ok(re.test(ESTILO), m + ' exceptúa al pie de su ocultado');
});

/* --- LA VISTA PREVIA, para no tener que generar un PDF para saberlo ---

   El pie SOLO se ve al imprimir, asi que «¿quedo aplicado?» no se podia
   contestar sin generar un PDF y auditarlo. Eso convirtio una entrega en
   tres idas y vueltas con el club: reportaba que no salia, y la
   diferencia era la version cacheada. */
ok(/function pieVistaPrevia/.test(UI), 'existe la vista previa del pie');
/* Usa el MISMO `pieInforme()` que se imprime: una maqueta aparte mentiria
   en cuanto una de las dos cambie (punto 8). */
ok(/pieInforme\(\)/.test(UI.slice(UI.indexOf('function pieVistaPrevia'),
                                   UI.indexOf('function pieVistaPrevia') + 900)),
   '  y arma el contenido con el mismo helper que imprime');
/* Y trae la VERSION de assets, que es el diagnostico de la trampa del
   cache (punto 2): si dice una vieja, lo que se imprime es codigo viejo. */
ok(/asset-version/.test(UI.slice(UI.indexOf('function pieVistaPrevia'),
                                 UI.indexOf('function pieVistaPrevia') + 900)),
   '  y muestra la version de assets al lado');
const RANK = fs.readFileSync(path.join(__dirname, 'js/sgadd-rankingpdf.js'), 'utf8');
ok(/pieVistaPrevia\(\)/.test(RANK), 'y el modal del ranking la pinta');
/* En papel la previa no va: seria el pie dos veces. */
ok(/@media print \{ \.pie-previa \{ display: none !important; \} \}/.test(ESTILO),
   'la previa no se imprime: seria el pie dos veces');

/* --- EL MANUAL, que es un HTML SUELTO --- */
const GEN = fs.readFileSync(path.join(__dirname, 'generar-manual-etiquetas.js'), 'utf8');
ok(/function pieMotorStats/.test(GEN),
   'el manual emite su propio pie: no carga un solo `.js` del panel');
ok(/data:image\/png;base64/.test(GEN),
   '  con el logo embebido, porque el archivo se comparte solo');
ok(/margin: 16mm 14mm 15mm/.test(GEN),
   '  y su @page reserva los mismos 15mm');

const MANUAL = path.join(__dirname, 'MANUAL_ETIQUETADO_SGADD.html');
if (fs.existsSync(MANUAL)) {
  const m = fs.readFileSync(MANUAL, 'utf8');
  ok(/class="pie-motorstats"/.test(m), 'y el manual generado lo trae');
  ok(/position: fixed; bottom: 0/.test(m), '  fijo, o sea en todas las hojas');
  ok(/Generado el \d{2}\/\d{2}\/\d{4}/.test(m), '  con la fecha del día');
} else {
  ok(false, 'el manual está generado (correr `node generar-manual-etiquetas.js`)');
}

/* =====================================================================
   4 ter · Y EL PIE TIENE QUE LEERSE, no solo estar

   Los checks de arriba pasaban en verde mientras el club reportaba tres
   veces que el pie no salia — y tenian razon a medias: el pie SI estaba
   en las ocho hojas del PDF, medido, pero a 7,5pt.

   MEDIDO a la resolucion de la vista previa de impresion, que dibuja un
   A4 de 794px CSS sobre unos 463px de pantalla (~56dpi):

     7,5pt  ->  5,8px de alto  ->  no se resuelve una letra: es una mancha
     9pt    ->  7,0px de alto  ->  se lee la linea entera

   `position: fixed` y `z-index` no eran la propiedad que hacia falta
   defender: era el CUERPO. Un test que solo mira el mecanismo deja pasar
   una firma invisible, que es exactamente lo que paso.
   ===================================================================== */
bloque('4 ter · El pie se lee');

const PIE_PRINT = (ESTILO.match(/[.]pie-motorstats [{][^}]*[}]/g) || []).join('|');
ok(/font-size: 9pt/.test(PIE_PRINT), 'la linea del pie va a 9pt');
ok(!/font-size: 7[.]5pt/.test(PIE_PRINT),
   '  y NO a 7,5pt, que es el cuerpo que no se leia');
ok(/[.]pie-motorstats [.]pie-marca [{][^}]*font-size: 10pt/.test(ESTILO),
   'la marca va un punto mas grande que el resto de la linea');

/* El filete de arriba en #cbd5e1 da 1,48 de contraste sobre blanco: en
   papel es una linea que no existe. #94a3b8 (2,56) es el mismo gris con
   el que el papel ya dibuja el borde de las tarjetas. */
ok(/border-top: [.]4mm solid #94a3b8/.test(PIE_PRINT), 'el filete se ve en papel');
ok(!/border-top: 1px solid #cbd5e1/.test(PIE_PRINT),
   '  y ya no es el gris invisible');

/* LA FRANJA DECLARADA TIENE QUE ENTRAR EN LOS 15mm RESERVADOS, y se
   calcula de las propias declaraciones: si alguien agranda el cuerpo sin
   mirar el `@page`, el pie pisa la ultima linea de cada hoja — y eso no
   se ve auditando en pantalla, solo en el PDF. */
const unoDe = (fuente, re) => { const m = fuente.match(re); return m ? parseFloat(m[1]) : null; };
const pad = PIE_PRINT.match(/padding: ([0-9.]+)mm 10mm ([0-9.]+)mm/);
const cuerpoPt = unoDe(PIE_PRINT, /font-size: ([0-9.]+)pt/);
const marcaPt = unoDe(ESTILO, /[.]pie-motorstats [.]pie-marca [{][^}]*font-size: ([0-9.]+)pt/);
const interlinea = unoDe(PIE_PRINT, /line-height: ([0-9.]+)/);
const borde = unoDe(PIE_PRINT, /border-top: ([0-9.]+)mm/);
ok(!!pad && cuerpoPt && marcaPt && interlinea && borde,
   'se pudieron leer las seis medidas del pie');
const altoPie = parseFloat(pad[1]) + parseFloat(pad[2]) + borde
              + (Math.max(cuerpoPt, marcaPt) * interlinea) / 72 * 25.4;
ok(altoPie < 15, 'la franja del pie entra en los 15mm reservados',
   altoPie.toFixed(2) + 'mm');
ok(altoPie > 6, '  y no queda tan fina que la firma se pegue al borde',
   altoPie.toFixed(2) + 'mm');

/* LA VISTA PREVIA DEL MODAL NO PUEDE MENTIR SOBRE EL TAMANO: es lo que
   el admin mira para decidir si generar. Si se imprime a 9pt (12px) y la
   previa se dibuja a 10px, la previa promete otra cosa. */
ok(/[.]pie-previa-caja [{][^}]*font-size: 12px/.test(ESTILO),
   'la previa se dibuja al mismo cuerpo que se imprime');

/* Y EL MANUAL FIRMA IGUAL: son dos documentos del mismo producto y
   terminan uno al lado del otro en la carpeta de la categoria. */
const GEN_PIE = fs.readFileSync(path.join(__dirname, 'generar-manual-etiquetas.js'), 'utf8');
ok(/font-size: 9pt; line-height: 1[.]25/.test(GEN_PIE),
   'el manual firma con el mismo cuerpo que los cinco PDF');
ok(/border-top: [.]4mm solid #94a3b8/.test(GEN_PIE), '  y con el mismo filete');
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
