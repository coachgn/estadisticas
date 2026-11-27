# Exportaciones a PDF

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 7. Exportación a PDF

Hay **cuatro** exportaciones, todas con el mismo criterio de papel:

| Export | Dónde | Hoja |
|---|---|---|
| **Scouting pre-partido** (`scoutImprimir()`) | `sgadd-scouting.js` | A3 apaisada |
| **Informe de equipo** (`sgadd-informe.js`) | modal con checkboxes | A3 apaisada |
| **Post-partido** (`equiposImprimirPartido()`) | detalle del partido | dos carillas A4 |
| **Ficha del jugador** (`sgadd-ficha.js`) | modal con checkboxes | A4 vertical |

Enfoque: `window.print()` + `@media print`. **No usar html2pdf/jsPDF**: los
canvas de Chart.js no rasterizan bien y los cortes de página quedan mal.

### Cómo verificarlo · GENERAR EL PDF, no leer el CSS

**Se puede generar el PDF real y auditarlo.** Es la única forma de no
adivinar, y ya evitó tres diagnósticos equivocados. Chrome está en
`C:\Program Files\Google\Chrome\Application\chrome.exe`:

1. `chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>`
2. Por CDP (`fetch` a `127.0.0.1:9222/json/list` + `WebSocket`, ambos nativos
   en Node): `Page.navigate` → `Runtime.evaluate` para armar el cruce →
   `Page.printToPDF` con `preferCSSPageSize: true`, **y con el papel del
   diálogo, no con márgenes en 0**: `paperWidth: 8.27, paperHeight: 11.69` y
   `margin*: 0.4`. Con márgenes en 0 la hoja mide más de 767px y **las media
   queries de celular no se activan**, así que el PDF auditado no es el que
   imprime el club (ver 7.4 bis: así se escapó el bug de la columna negra).
3. El PDF se audita **sin librerías**, leyendo el archivo con Python: los
   `/MediaBox` dan el tamaño de cada hoja, `/Subtype /Image` cuenta los
   escudos incrustados, y descomprimiendo el primer stream con `zlib` se lee
   el color de relleno inicial —que es el fondo de la hoja—.

Para mirar el resultado sin renderizar el PDF: `Emulation.setEmulatedMedia`
con `media: 'print'` + `Page.captureScreenshot` con `clip`, al ancho real de
la hoja. Da la imagen fiel de cada bloque.

Alternativa liviana sin Chrome aparte: **volcar las reglas de `@media print` a
un `<style>` sin la media query** y aplicar las clases de modo a mano. Sirve
para medir con `getComputedStyle`, pero **no ve `@page`**: el tamaño de hoja y
los cortes de página solo se verifican con el PDF de verdad.

Ojo: **el Browser pane inlinea los `file://` como `data:` URL**, lo que rompe
los `<script src="js/…">` relativos y deja la app sin cargar. Hay un
`.claude/launch.json` que levanta `python -m http.server 8765` para probar
sobre HTTP real.

**Y ojo con `file://` en general**: ahí `LOGOS.resolver()` no puede leer el
manifiesto (`fetch` bloqueado por CORS) y el panel queda **sin un solo
escudo** — medido, 0 en `file://` contra 12 en `http://`. No es un bug del
panel: es que el sitio está pensado para servirse.

### 7.1 · Scouting · RESUELTO

**La hoja va BLANCA y las cards conservan el color de la app.** Ese contraste
es el que hace legible el informe: cada card queda recortada sobre el papel en
vez de fundirse con él. Antes la hoja entera salía casi negra de borde a
borde.

**La causa real de los "márgenes negros"** —el problema #1 del punto 7, que
estuvo abierto meses— es `:root { color-scheme: dark }`: hace que Chrome pinte
el **lienzo** de la página (lo que queda detrás de todo, márgenes incluidos)
con su gris por defecto **#121212**, y lo pinta *antes* que el documento, así
que ningún `background: #fff` lo tapa. Medido en el PDF: el primer relleno de
cada hoja era exactamente `RGB(18,18,18)`. Se apaga con `color-scheme: light`
en el modo de impresión. Ninguna cantidad de `!important` sobre `html`, `body`
o `.bg-base` lo hubiera resuelto.

**Dos efectos colaterales de la hoja blanca**, los dos ya corregidos:

- El texto **sin clase de color propia** hereda el `#111` del body y queda
  casi negro *dentro* de la card. Pasaba con los nombres de métrica de los
  rankings (*"4° de 12 en PACE"*). Se arregla devolviendo el color claro a
  `.scout-card` / `.scout-ficha`.
- Lo que vive **fuera** de una card necesita el color oscuro explícito, o
  desaparece sobre el blanco.

**El aplanado a papel blanco está condicionado a `html:not(.modo-scout-print)`,
y esa es la única forma que funciona.** Intentar revertirlo desde el modo scout
es imposible: `body * { color: #111 !important }` le gana a cualquier regla que
no repita el `!important` con más especificidad, y hay decenas de clases de
color en la app. Al hacerlo así, todo lo que no estuviera listado a mano —los
`<strong>` de las notas, los nombres dentro del plan colectivo— quedaba en gris
casi negro sobre fondo oscuro, o sea **invisible**. Excluir el modo de raíz deja
las clases originales intactas: medido, **0 elementos en `#111`**.

**La clase va en el `<html>` además del `<body>`.** Las reglas de papel blanco
apuntan a `:root, html, body`, y una clase del body no le puede ganar al
selector `html`.

**`print-color-adjust: exact` es obligatorio**, no decorativo: sin él Chromium
descarta todo fondo al imprimir y el informe saldría en blanco con el texto
claro encima.

### 7.2 · El tamaño de hoja · A3 apaisada

```
A4 vertical   210 × 297 mm
A3 apaisada   420 × 297 mm   ← mismo alto, el doble de ancho
```

Es exactamente *"el mismo largo que A4 pero más ancha"* que pidió el club, sin
inventar una medida. Con margen 10mm quedan **400mm útiles (≈1512px)**: la
tabla de marcas entra holgada y las fichas de jugador van **de a dos por
fila** (`.scout-fichas-grid`). El informe bajó de **11 a 8 páginas**.

**La `page` va en el `body`, no solo en las cards.** `@page` a secas no se
puede condicionar por clase, así que la hoja por defecto sigue siendo la A4
vertical de las otras dos exportaciones; sin esa línea, el arranque del
documento y todo lo que quede fuera de una card genera **hojas A4 sueltas
mezcladas con las A3**. Medido: el PDF salía con los dos tamaños.

También hay que soltar el `max-width` de la app (`1600px`) o el contenido se
imprime angosto en el medio de una hoja de 400mm.

### 7.2 bis · Las hojas del informe

> **Desde el 2026-10-02 no hay hojas fijas**: las cards fluyen una debajo de
> la otra y cada una se elige por separado. Lo de abajo es la historia; el
> modelo vigente está en el punto 85.

`.scout-pagina` marca las cards que **abren** hoja; las que no la llevan quedan
pegadas a la anterior. Se pagina con **`page-break-before` y no `after`**: si el
DT destilda una card del medio, con `after` quedaba una hoja en blanco donde
estaba la oculta.

**El PDF arranca en el informe, no en los controles.** La barra de
categoría/fase y el formulario del cruce llevan `.no-imprimir`: son controles,
no contenido. Sin eso, esconder los `<select>` dejaba sus **etiquetas
huérfanas** —"CATEGORÍA", "FASE", "LOCAL", "VISITANTE", "FECHA DEL PARTIDO"—
flotando sobre dos cards vacías en la primera hoja. La categoría activa y los
tres campos manuales ya viajan en la ficha del cruce del encabezado.

`.no-imprimir` es una regla general de `@media print`, válida para las tres
exportaciones: marca lo que es control y no contenido.

**La matriz no fuerza hoja nueva**: si entra con el encabezado van juntas, si
no, el navegador la baja entera (`page-break-inside: avoid`). Medido con
Reconquista vs Atenas en A3 apaisada (1047px útiles): encabezado 251px + matriz
973px = **1240px**, así que en ese cruce no llegan a convivir por ~190px. En un
cruce con menos filas de ranking, sí.

Alturas medidas de las demás, por si hay que volver a repartir: ciclo 426 ·
plan colectivo 464 + resumen 203 · tabla de marcas 879 · jugadores 575 + claves
351 · fichas 1635 (dos hojas).

```
1 Encabezado · 2 Matriz · 3 Splits y ciclo
4 Plan colectivo  +  Resumen de criterio estratégico
5 Tabla de marcas · APAISADA
6 Jugadores clave  +  Claves estratégicas
7 Resto del plantel
8+ Fichas individuales
```

El **resumen sube antes de la tabla**: sintetiza el plan colectivo, que ahora
tiene al lado. El orden es el mismo en pantalla y en papel — dos órdenes
distintos para el mismo informe se desincronizan solos.

### 7.3 · La columna que no salía · "Restricción / alerta"

La tabla de marcas mide `min-width: 62rem` (≈992px) y el área útil de un A4
vertical con margen 10mm es ~190mm (≈718px). **La última columna caía fuera del
área de página y Chromium simplemente no la imprimía**: no había scroll ni corte
visible, la columna desaparecía.

Se corrige con **dos** cosas, y conviene entender que son independientes:

1. **`@page apaisada` + `page: apaisada`** sobre `.scout-pagina-ancha`. Da
   277mm útiles (≈1047px). Es CSS Paged Media: una página con nombre, aplicada
   por la propiedad `page` del elemento.
2. **`min-width: 0 !important` + `width: 100%` + `table-layout: fixed`** y
   `overflow: visible` en el `.scrollbox`. El `min-width` es un estilo **inline**,
   así que sin `!important` no se le puede ganar. **Esta sola ya alcanza** para
   que la columna entre —apretada, pero entera— si el navegador ignorara la
   página nombrada.

Medido en A4 apaisada: tabla 1008px, la última columna termina en **1061 de
1123 disponibles**. Las cuatro entran.

`overflow-wrap: anywhere` en las celdas: un nombre largo parte de línea en vez
de ensanchar la columna y volver a desbordar.

**La tabla de marcas es el único bloque apaisado.** El resto va vertical.

### 7.4 · Encabezados de tabla ilegibles · RESUELTO

`table thead th` trae `background: #141414` por el sticky y **no estaba
neutralizado** en `@media print`: en el PDF blanco y negro daba texto gris
`#555` sobre casi negro. Ahora se blanquea en el modo claro y pierde el
`position: sticky` en los dos modos — en papel no sirve y desalinea la tabla al
paginar.

### 7.4 bis · La columna que salía NEGRA · las media queries de celular

El defecto más caro que tuvo el papel, y estuvo en las **tres**
exportaciones a la vez: la primera columna de las tablas —los nombres de los
jugadores— salía como un **bloque negro** con el texto adentro invisible. Se
veía en la tabla de marcas del scouting y en los dos box scores del
post-partido, en Reconquista y en Jujuy por igual.

**La causa: al imprimir, Chrome evalúa las media queries contra el ancho de
HOJA del diálogo.** Un A4 vertical con márgenes por defecto deja ~717px, o
sea **menos de 767**, así que se activaba

```css
@media (max-width: 767px) {          /* ← sin `screen` */
  .scrollbox table td:first-child { position: sticky; background: #141414; }
}
```

que es una afordancia de **celular** —la columna fija para no perder de
vista a quién estás mirando mientras scrolleás la tabla a lo ancho—. En el
papel no hay scroll horizontal que la justifique, y su fondo oscuro se
comía los nombres, que el aplanado ya había pasado a `#111`.

**Por qué no lo cazó ninguna auditoría anterior**: los PDF se generaban con
`printToPDF` y **márgenes en 0**, que da una hoja más ancha que 767px y
nunca entra en esa rama. El PDF que se auditaba no era el que imprimía el
club. Ahora el generador usa el papel del diálogo (ver arriba).

Se corrigió acotando **todos** los breakpoints de ancho a
`@media screen and (max-width: …)` —son todos afordancias de pantalla, y el
de `input { font-size: 16px }` también deformaba los campos editables de la
tabla de marcas— más una neutralización explícita en `@media print`. Hay dos
tests que lo fijan y un detector de rellenos oscuros: sobre los seis PDF
(tres de cada club) quedan **0**, contra 67 y 19 que traían los del club.

**El `thead th` del papel pasó de blanco a `transparent`**: la tarjeta ya
trae su gris y un blanco duro dibujaba un recuadro que no cerraba con el
resto de la fila de encabezados.

**Y la fila atenuada se atenúa con TINTA, no con opacidad** (`.fila-tenue` →
`#94a3b8`). La opacidad destiñe el número y el borde por igual y en papel se
lee sucio; es la misma decisión que ya había tomado el plantel del informe
de equipo.

### 7.5 · Escudos y campos manuales · lo que NO llegaba al papel

**Los escudos salían en CERO.** Medido sobre el PDF: `/Subtype /Image` daba 0.
Dos causas distintas, las dos corregidas:

1. **Sin escudo resuelto no se emitía nada** (`${l ? '<img…>' : ''}`), así que
   el informe quedaba sin ninguna marca del equipo. Ahora va una **insignia
   con las iniciales** (`.escudo-iniciales`). Es lo que pasa siempre que el
   manifiesto no se pueda leer — con el panel abierto como `file://`, por
   ejemplo.
2. **Al imprimir, el navegador vuelve a resolver el `src` de cada `<img>`**, y
   cualquier cosa que falle en ese momento —ruta, caché, origen— deja el
   escudo afuera del PDF sin ningún aviso. `scoutEmbeberEscudos()` los pasa a
   **`data:` URI** con un canvas antes de imprimir, y `scoutRestaurarEscudos()`
   los devuelve en `afterprint`. Con la imagen serializada el `src` no depende
   de nada externo.

**Los campos manuales tampoco se imprimían.** Fecha, torneo y próximo rival
—justo los tres datos que la planilla NO tiene— viven en `<input>`, y la regla
general de `@media print` esconde todo control de formulario. Ahora se repiten
como texto en `.scout-meta-impresa`, dentro de un `.solo-imprimir`.

Con un detalle que costó: **`scoutMeta()` no repinta a propósito** (cada tecla
le sacaría el foco al input), así que el HTML de esa cabecera queda con los
valores que había al renderizar, o sea vacíos.
`scoutActualizarCabeceraImpresa()` la regenera al imprimir, que es el único
momento en que importa y donde ya nadie está tipeando.

### 7.6 · Las otras dos exportaciones

Auditadas generando sus PDF, igual que la de scouting.

| | Antes | Ahora |
|---|---|---|
| **Informe de equipo** | *el informe se autodestruía* | 9 pág · **A3 apaisada** · 10 img |
| **Post-partido** | 2 páginas sin control | **2 carillas con corte fijo** · A4 vertical · 8 img |

**El informe de equipo también va en A3 apaisada**, por el mismo motivo que el
de scouting: es ancho —tablas de métricas, barras comparadas, radar de 8
ejes— y en A4 vertical todo entra apretado en 190mm.

**Sus tarjetas usan el gris del post-partido** (`#f1f5f9` con borde `#cbd5e1`),
no blanco: el blanco absoluto desarmaba la jerarquía y todo parecía texto
suelto. Son los mismos valores, así que los dos informes en papel se leen
igual. El post-partido se deja como está.

**Los gráficos ya no se montan sobre lo que sigue.** `.chart-box` fija la
altura de la caja, pero el `<canvas>` se dimensiona solo (`maintainAspectRatio:
false`) y se desbordaba sobre el pie de figura o la tabla siguiente. Se confina
con `position: absolute; inset: 0` + `height: 100%`, y la caja lleva
`overflow: hidden`.

La caja va a **88mm y no 70**: un radar es **cuadrado**, así que su tamaño lo
limita el lado más corto. Con 70mm quedaba diminuto en el centro de una hoja de
400mm de ancho, con medio metro de aire a los lados.

**Al canvas NO se le fuerza `width/height: 100%`.** Chart.js dibuja el bitmap a
un tamaño y el CSS lo **escala**: si los dos no coinciden, el gráfico sale
deformado. Era lo que ponía el radar *"muy apaisado"* — el polígono se estiraba
a lo ancho de la caja en vez de quedar regular. Van `max-width` y `max-height`,
y Chart.js dimensiona solo con `responsive: true`.

Los radares llevan además `.is-radar` (la pone la propia fábrica) y en el papel
se acotan a **120mm centrados**: a todo el ancho quedaban chicos en el medio,
con las etiquetas separadísimas del dibujo.

**El de local/visitante se arregla en el HTML, no en el CSS de impresión.**
Chart.js dibuja el canvas al ancho de su contenedor y el radar sale del lado
más corto, así que **cuanto más ancho el contenedor, más chico sale el radar**:
con 1498px quedaba de 110px contra los 164 de los otros dos. Agrandarle la caja
en `@media print` no servía —al escalar manteniendo aspecto, un canvas más
ancho se achica más—. La solución es acotar el contenedor (`max-w-3xl`) para
que Chart.js lo dibuje con el mismo aspecto. Medido después: los tres canvas
en **453×332**.

**Los que no entran al gráfico salen más tenues.** En pantalla la fila lleva
`.fila-flojo`; en el papel el aplanado los igualaba a todos y el plantel se
leía como si los dieciocho pesaran lo mismo. Va con `color: #94a3b8` y **no con
`opacity`**: la opacidad afecta también a la insignia de iniciales y al borde
de la fila, y en papel eso se ve sucio.

### 7.6 bis · Los bloques que abren hoja en el informe de equipo

*"Cómo ataca"*, *"Dónde gana y dónde pierde"* y las tablas de *"4 Factores
ofensivos/defensivos"* empiezan en página nueva. Se marcan con **`data-hoja`**
en `sgadd-equipos.js`.

`page-break-before` **solo no alcanza**: los tres viven dentro de un grid de dos
columnas —al lado del radar, o uno al lado del otro— y el navegador intenta
mantener la fila, así que el corte queda a mitad de camino. Primero hay que
aplanar la grilla (`display: block`), y recién ahí el salto funciona. En A3
apaisada eso no aprieta nada y cada bloque ocupa su hoja, que es donde mejor se
leen: son listas largas de ejes y de claves.

**El texto que se cortaba en el borde derecho.** Las filas de los 8 ejes usan
`px-2 -mx-2` —una sangría negativa para que el hover cubra todo el ancho de la
card—. En pantalla el padre tiene padding y no se nota; en el papel no lo tiene,
así que esos 8px se salían del área imprimible y **cortaban el texto alineado a
la derecha** ("Acelerado", "Va a la línea"…). Medido: 6 elementos llegaban a
1510px sobre un informe de 1502; después del fix, **0 desbordes**.

**El bug que se comía el informe de equipo entero.** La limpieza era
`setTimeout(limpiar, 400)` disparado justo después de `window.print()`. Si el
diálogo tardaba en abrir —o si el navegador no bloquea en `print()`, que es lo
que pasa al generar el PDF por automatización— **el informe se borraba a sí
mismo antes de imprimirse** y salía la app en su lugar. Medido: a los 3,5 s no
quedaba nada de `#informeSalida`. Ahora cuelga de `afterprint`, con un respaldo
de 60 s por si ese evento no llega (pasa al cancelar en algunos navegadores).

**El post-partido entra en DOS carillas, con el corte decidido.** Estuvo
apuntando a una sola, y las reglas de compresión de aquella vuelta siguen
valiendo —son las que hacen que todo el análisis entre en la primera hoja—;
con el perfil de tiro adentro ya no entra junto, así que la especificación
pasó a dos hojas y los box scores abren la segunda. Un corte elegido es
mejor que uno del navegador: sin él la tabla de un equipo quedaba en una
hoja y la del otro en la siguiente, que es justo lo que impide compararlas.
Lo que en su momento lo empujaba a la segunda hoja: *"Para el próximo cruce"* usa `lg:grid-cols-3`, y
el breakpoint `lg` de Tailwind es 1024px mientras que la hoja A4 vertical mide
794 — **en el papel nunca se activaba** y los tres bloques quedaban apilados,
~210px de más. Se fuerzan las tres columnas en print y se comprimen los aires
verticales. **No se toca la tipografía**: el box score tiene que poder leerse,
que es todo el punto de llevar la hoja a la cancha.

**Los gráficos ya no salen invisibles.** Chart.js fija sus colores en JS, así
que `@media print` no los puede corregir: el radar de 8 ejes del informe de
equipo pintaba las etiquetas en `#f5f4f2` sobre papel blanco. `COL.tinta`,
`COL.grilla` y `COL.texto` pasaron a ser **getters** que consultan
`enPapelClaro()` y se resuelven al dibujar. Funciona porque `generar()`
agrega la clase **antes** de llamar a `dibujarPendientes()`.

**Los tres modos de papel están en una lista, `MODOS_PAPEL`**
(`modo-impresion`, `modo-partido-print`, `modo-scout-print`). Un modo nuevo
que imprima en claro se agrega ahí o sus gráficos salen ilegibles sin que
nadie lo note: pasó con la leyenda del perfil de tiro, que salía en gris
clarísimo justamente porque `modo-partido-print` no estaba en la lista.

**Y con el getter solo NO alcanza cuando el gráfico se dibuja en pantalla.**
El informe de equipo marca el modo antes de crear sus charts, pero el
post-partido y el scouting dibujan al abrir la pantalla y recién marcan el
modo al imprimir: para entonces Chart.js ya congeló los colores en las
`options`. `SGADD_CHARTS.repintarParaPapel()` reasigna leyenda, ticks,
grilla, título, `pointLabels` y `angleLines` de cada instancia viva y hace
`update('none')` —sin animación, porque `print()` puede dispararse a mitad
de la transición y capturar el gráfico a medio dibujar—. Se llama justo
después de agregar la clase de modo.

**Una sola utilidad de escudos para las tres.** `SGADD_UI.embeberImagenes()` /
`restaurarImagenes()` viven en `sgadd-ui.js`, que carga antes que todos los
módulos de sección. Duplicarla en cada exportación las desincroniza.

**UN SOLO CRITERIO DE COLOR PARA LAS CUATRO.** Hoja blanca, **tarjetas
blancas con borde sólido** (`1,4px #94a3b8`) y acentos. El DT abre cualquiera
de las cuatro y encuentra la misma jerarquía visual. Scouting estuvo un
tiempo con la paleta oscura de la app; se revirtió a pedido del club.

**Las tarjetas estuvieron en gris (`#f1f5f9`) y volvieron al blanco**, a
pedido del club y por un motivo concreto: en papel el fondo gris gasta tinta
en toda la superficie de cada bloque. El problema original del blanco —"todo
parece texto suelto"— no se resuelve con un fondo sino **cargando el borde**:
1,4px de un slate que se ve separa los bloques igual o mejor. Las que ya
traen borde de color (el verde/rojo del ciclo, los cuatro grupos del plan
colectivo) lo conservan: sus reglas van después y con `!important`.

**Dos trampas de especificidad que costaron encontrar**, las dos por el mismo
motivo — **el JIT del CDN de Tailwind genera sus utilidades de color CON
`!important`**, así que `.text-slate-300` (0,1,0) le gana a `body *` (0,0,1)
aunque las dos lo lleven:

1. Los párrafos de descripción de los 8 ejes salían en `#cbd5e1` sobre gris
   claro, ilegibles.
2. Los nombres de los equipos del cruce (`.text-white`) salían en blanco sobre
   gris.

Se cubren con `body [class*="text-slate-"]`, `body .text-white` y compañía: con
`body` adelante la especificidad sube a 0,1,1 y gana el papel.

**Hay una tercera variante del mismo problema, pero con FONDOS.** Las tarjetas
anidadas del ciclo (*"Partidos ganados / perdidos"*) usan `bg-surface2/40`, y
ahí la especificidad empata (0,1,0 las dos, `!important` las dos): gana **la
que viene última en el documento**, y el `<style>` del CDN de Tailwind se
inyecta después del nuestro. Salían en gris oscuro sobre la tarjeta clara.
Mismo remedio: `body` adelante.

Esas tarjetas llevan además `.ciclo-ganado` / `.ciclo-perdido`, que en el papel
les pinta el **borde en verde o rojo**. Es lo que las distingue de un vistazo,
que es para lo que el DT las mira.

**Lo mismo con los cuatro grupos del plan colectivo** (`.scout-grupo` +
`grupo-foco/intocable/fuente/cristal`): en pantalla van al 40% de opacidad, que
sobre fondo oscuro alcanza; en papel se desdibujan y los cuatro dejan de
distinguirse, justo lo que hace legible el plan de un vistazo.

**Y con el mapa de calor del top 3.** Los tonos de pantalla sobre papel blanco
dan 2,3 · 2,9 · **1,4** de contraste — el amarillo del 3° es prácticamente
invisible. Se repintan con los tonos oscuros del resto del papel y un fondo que
sí se ve (`.top-1/2/3`). El `!important` es obligatorio: el color de pantalla
va en un `style` inline.

### El semáforo del informe · `scoutTono()`

El informe de scouting pinta el mismo juego de tonos en **ocho lugares**
—matriz de métricas, chip de puesto, rankings de liga, línea de tiro, fila de
cierre, leyenda del top 3, viñetas de la ficha— y siempre con
`style="color:…"` **inline**.

Al imprimir, el aplanado (`body * { color: #111 !important }`) **le gana al
inline**: un `!important` de autor gana a un estilo en línea sin `!important`.
Resultado: todos los números salían en negro y se perdía la lectura rápida de
*"esto lo hace bien / esto lo hace mal"*, que es para lo que están los colores.

`scoutTono(color)` emite, junto al color de pantalla, una **clase que dice qué
significa** ese color (`tono-alto`, `tono-bajo`, `tono-medio`, `tono-aviso`,
`tono-neutro`). El CSS de impresión la repinta con la variante oscura. La clase
no hace nada en pantalla: ahí sigue mandando el inline.

**Al agregar un color al semáforo hay que sumarlo a `SCOUT_TONOS`**, o ese
valor se imprime en negro sin que nadie se entere.

### 7.8 · El NOMBRE del archivo · `document.title` antes de imprimir

Las cinco superficies que imprimen usan `window.print()`, así que el
nombre que Chrome propone en *Guardar como PDF* **es el `document.title`**.
Hasta acá decía siempre lo mismo —*"Deportivo La Plata · Panel de
Scouting"*— y el DT terminaba con una carpeta de archivos homónimos que
había que abrir para saber cuál era cuál.

| Superficie | Nombre | Respaldo |
|---|---|---|
| Ficha del jugador | `Juan Pérez` | `Ficha_Jugador` |
| Informe pre-partido | `Scouting vs Atenas` | `Informe_Scouting` |
| Informe de equipo | `Ficha Reconquista` | `Ficha_Equipo` |
| Post-partido | `Universitario vs A. Mayo - 07-05` | `Informe_Partido` |
| Principal / Clasificación (Ctrl+P) | `Deportivo La Plata - Primera 2026 - Resumen` | `Resumen` |

Todo vive en `sgadd-ui.js` —`sanearNombreArchivo`, `nombrePersona`,
`nombrePdf`, `tituloPdf`— que es el módulo que las cinco ya comparten.
Cinco copias de la misma sanitización terminan divergiendo: es el bug que
ya tuvo el rol funcional (punto 8).

#### Etapas 3 y 4 · el nivel se declara y los umbrales se adaptan

**El nivel se declara por categoría** en `clubes/<club>.json`
(`planillas[].nivel`) y se puede publicar por KV. La cascada es
`KV → JSON → por defecto`, y el puente entre los dos mundos es el `slug`
de la planilla: el JSON la indexa por `id` y el catálogo del servidor por
`slug`. Un valor inválido en KV degrada al JSON en vez de romper.

NO se infiere del campo `liga`: ése distingue La Plata de Liga Argentina
pero **no** mayores de formativas, que es justo el corte que importa.

`umbralVigente(clave, contexto)` resuelve con cuatro orígenes:

| origen | cuándo |
|---|---|
| `absoluto` | siempre, para los tres blindados |
| `tier` | warm-up: la semilla MEDIDA del nivel |
| `mezcla` | interpolación lineal entre semilla y percentil vivo |
| `vivo` | el percentil real sobre los calificados del torneo |

El warm-up tiene **dos gates y hacen falta los dos**: partidos (15→40) y
calificados (30→60). La U21 tiene 49 calificados, así que un p90 ahí son
cinco jugadores.

### LO QUE SE REACTIVÓ, MEDIDO

```
                        JUJUY  RQ 1ª  DEP.   U21    U23
generador-primario  antes 10%    3%    1%     1%     0%
                    ahora 10%   10%   12%    10%     8%
perimetral-media    antes  7%   16%   23%    23%    23%
                    ahora  7%   13%   18%    16%    17%
```

`generador-primario` pasó de estar **muerto en formativas** a marcar al
~10% en las cinco ligas. Y el cubo de descarte (`perimetral-media`) se
achicó, porque las reglas de arriba ahora sí disparan.

### LO QUE **NO** SE ARREGLÓ, Y POR QUÉ

- **`ancla-defensiva` sigue en 0%** en tres de los cinco libros. Sus dos
  umbrales ya eran múltiplos de una mediana, así que el trabajo de
  niveles no los toca; su condición discriminante es COMPARATIVA
  (`RD rel > RO rel`), no un umbral. Es un problema de cascada, no de
  nivel.
- **`manejador-secundario` bajó** (4%→1%): `generador-primario` va antes
  en la cascada y ahora absorbe a los que antes caían ahí. Es el efecto
  correcto, pero conviene mirarlo.
- **Los ARQUETIPOS no se movieron.** `generador` usa `AST-PP > 1.40` y
  `amenaza` usa `T3I > 3.0 && T3% > 0.34` **escritos en línea dentro de
  `PERFILES_TECNICOS`**, no en `JUGADORES_UMBRALES`. Están fuera del
  registro, así que la adaptación no los alcanza. El 1,40 de `generador`
  es además el MISMO número que `astPPGenerador` duplicado a mano.

### Una sola vara: las marcas de scouting leen el mapa del nivel (2026-09-19)

Hasta esta fecha las reglas de marca leían un mapa `U` FIJO, calibrado
contra Liga Argentina, mientras las etiquetas del mismo jugador ya se
adaptaban: en DEPORTIVO (Local Mayores) la ficha llamaba «Generador» a
un AST-PP de 0,79 y la marca lo exigía de 1,40 — dos varas para lo mismo
en el mismo informe. **Ahora las reglas leen `Up(p)`** (`SGADD_SCOUT.umbralesDe`):
el mapa que `jugadoresUmbrales(idx)` resolvió para ese índice y que el
perfil trae en `p.U`, fundido por encima del `U` de scouting. Las 32
claves del registro —incluidas las propias de scouting: frío, rentable,
volumen sistemático, falta táctica, concentración— siguen el nivel.

- **`U` queda como RESPALDO**: perfil armado a mano, sin índice o sin el
  registro. Se FUNDE y no se reemplaza, para que una clave que el registro
  no declare nunca quede en `undefined`.
- **`JUGADORES_UMBRALES` (el mapa estático) sigue devolviendo los
  literales**: es el respaldo sin contexto. Lo que cambió es que scouting
  ya no lo lee directo para decidir.
- **Las fixtures no hubo que recalibrarlas**: `test-scouting.js` ya
  declara `idx.liga.nivel = 'LIGA_ARGENTINA'` (punto 45), y con su muestra
  chica rige la semilla de ese nivel, que es el literal. Las «12 fallas»
  que se anotaban acá salían de forzar ESA fixture a Local Mayores. La
  sección 23 del test arma la misma fixture en `LOCAL_MAYORES` y exige que
  marca y ADN lean el mismo número; revirtiendo la unificación caen 2.
- **`generador-sin-tiro` exige SIN TIRO RENTABLE, ya no «frío»**: con el
  frío relativo, RONDINONE (0,656 PPT3 contra un corte de 0,652 en Local
  Mayores) quedaba afuera por cuatro milésimas y caía en «Lector de
  rotaciones».

Medido en el libro de DEPORTIVO (96 fichas, Local Mayores, umbrales en
`vivo`): **cambia la marca de 27**, la tarea de 20 y el grupo del plan
de 12. `tirador-sistematico-frio` baja de 19 a 4 —era la marca
sobrecargada que la auditoría ya denunciaba—; suben `interior-dominante`
(5 → 11, PPT2 alto pasa de 1,10 a 1,00), `slasher` (6 → 10) y
`generador-riesgoso` (8 → 11, minutos clave de 20 a 16). Las fuentes de
ayuda bajan de 21 a 11: en una liga que tira mal, «frío» es la cola de
ESA liga. Cero tareas agresivas contra tiradores sin renta.

La adaptación vive en `jugadoresUmbrales(idx)`, que cuelga el mapa
resuelto en `prom.U` y `p.U`. Las reglas lo leen por `jugadoresU(p)`, que
**degrada al estático** si el perfil se armó a mano: hay llamadores que
construyen perfiles sueltos y sin eso reventaban con TypeError.

El índice puede declarar su propio nivel (`idx.liga.nivel`), y eso importa
más de lo que parece: hace que la resolución NO dependa de un global, así
que se puede testear y se podría resolver del lado del servidor.

### Lo que hay que respetar al tocarlo

- **Los prohibidos son la UNIÓN de lo que rechaza cada sistema**, no la
  intersección: un informe se comparte por WhatsApp y termina abierto en
  Windows, en Mac y en Android, y alcanza con que **uno** lo rechace. Van
  `/ \ : * ? " < > |` más los de control. Se reemplazan por **espacio y no
  por vacío**: sin eso `ATENAS/PLATENSE` quedaba `ATENASPLATENSE`, un
  equipo que no existe.
- **Los puntos del final se recortan.** Windows los descarta en silencio,
  así que `Ficha Atenas .` se guardaría como otro archivo del que el
  usuario escribió. Lo mismo con los nombres de dispositivo de MS-DOS
  (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`): un `CON.pdf` **no se
  puede crear** y el error del navegador no explica por qué.
- **El título se pone ANTES de `window.print()`.** Chrome lo lee al
  resolver el nombre; ponerlo después no cambia nada. Medido en Chrome
  real: durante `beforeprint` el título ya es el del informe, y el
  `/Title` del PDF generado sale con ese mismo valor.
- **La restauración cuelga de `afterprint`**, con respaldo de 60 s — el
  mismo patrón que la limpieza de las otras exportaciones, y por el mismo
  motivo: `afterprint` no llega siempre (headless no lo dispara, y algunos
  navegadores tampoco al cancelar). Sin el respaldo la pestaña queda con
  el nombre de un informe para siempre.
- **`tituloPdf()` guarda el título previo en un estado del MÓDULO**, no en
  una variable local: dos llamadas sin un `afterprint` en el medio harían
  que la segunda tomara como "original" el nombre que puso la primera.
- **El respaldo de Ctrl+P se acota a Principal y Clasificación.** En una
  sección con su propia exportación, un Ctrl+P a mano imprime la pantalla
  sin el modo de papel: llamarlo *Resumen* sería ponerle nombre de informe
  a algo que no es el informe. Y nunca pisa a una exportación en curso —
  eso lo decide `tituloPdfActivo()`.
- **El nombre de persona se da vuelta y se capitaliza** (`PEREZ, JUAN` →
  `Juan Perez`): la planilla escribe APELLIDO, NOMBRE en mayúsculas y un
  archivo se busca por el nombre como se dice en voz alta. **NO se
  inventan acentos**: si la planilla escribe `PEREZ`, el archivo dice
  `Perez`.
- **El post-partido lleva la fecha y NO el marcador.** La fecha es lo
  único que separa la ida de la vuelta contra el mismo rival —sin ella los
  dos informes pisan el mismo archivo—; el marcador no, porque el archivo
  se busca por el cruce.

**El bug que destapó la verificación en el navegador**: `EQUIPOS.idx` está
declarado en el estado local de la sección y **no lo escribe nadie** —el
módulo entero lee de `SGADD_APP.estado`—, así que el resolvedor del
post-partido caía al genérico sin ningún síntoma. Ni la suite ni el chequeo
de sintaxis lo podían ver: hay que ejercer la exportación.

### El pie de los tres PDF

`SGADD_UI.pieInforme()` → **"MotorStats^AR · Generado el `<fecha>`"**, con el
`AR` en `<sup>` porque es parte de la marca.

Es la firma del **producto**, no la del club: antes salía de `CLUB.credito()`,
o sea del JSON de cada cliente ("SGADD · Casañas & Freytes" para uno, "SGADD"
para otro). El motor es el mismo para todos y el pie tiene que decir quién
generó el informe; el nombre del cliente ya viaja en el encabezado.

Vive en `sgadd-ui.js` y lo usan las tres exportaciones. En scouting y
post-partido va con `.solo-imprimir`: en pantalla la firma no aporta.

### Sintaxis de los módulos · el test que faltaba

La mitad de los archivos de `js/` no se puede `require()` desde Node —usan
`document`, `window`, globals del navegador— así que **un error de sintaxis en
ellos no lo cazaba ningún test**: se descubría con la sección en blanco en el
navegador.

Pasó con un **backtick dentro de un comentario HTML escrito adentro de un
template literal**: cerró el string y tiró abajo `sgadd-equipos.js` entero
(`SyntaxError` → `buildEquipos is not defined` → sección vacía). `test-boot.js`
ahora compila los 16 módulos con `new vm.Script()`, que valida sintaxis sin
ejecutar.

**Al comentar dentro de un template literal, nunca usar backticks.**

**El acento se OSCURECE por club, no se reemplaza por un color fijo.** El
naranja de Reconquista da 2,08 de contraste sobre el gris de las tarjetas y se
leía lavado. `oscurecerHastaLegible()` en `sgadd-club.js` lo mezcla con negro
hasta pasar 4.5 y lo publica como `--acento-papel` (Reconquista: `#a16014`,
4,57). Es el simétrico de `aclararHastaLegible()`, que ya existía para el tema
oscuro. Con un color fijo, el informe de Jujuy saldría con el naranja de
Reconquista.

**Tamaños de hoja:** scouting e informe de equipo en A3 apaisada; el
post-partido en A4 vertical, en dos carillas — es la hoja que se lleva a la
cancha.

### 7.6 ter · La ficha individual del jugador · la cuarta exportación

Las otras tres hablan de EQUIPOS. Esta es la hoja que el DT se lleva a la
charla con **un** jugador: quién es, dónde está por encima y por debajo de
su liga, y qué le pide el cuerpo técnico.

**A4 vertical y no A3 apaisada**: una ficha personal se imprime, se dobla y
se lleva. Es el mismo criterio por el que el post-partido también es
vertical. Sale en **3 hojas** con todo tildado (Reconquista, medido).

**No reescribe ni un bloque**: pide los mismos `jugadoresTab()` que pinta la
pantalla. Si mañana cambia el tab Tiro, cambia en los dos lados — que es
justo el problema que tuvo el proyecto cuando el rol funcional vivía
duplicado en dos módulos. Hay un test que lo fija.

**El log de partidos viene DESTILDADO.** Con 13 fechas se lleva media hoja y
la charla arranca por el perfil, no por la planilla.

Tres cosas que se corrigieron auditando el PDF generado:

- **Los bloques de la ficha SÍ se pueden partir entre hojas.** La regla
  general le pone `page-break-inside: avoid` a `.informe-bloque` —pensada
  para los bloques cortos del informe de equipo— y acá el de percentiles
  mide más de media carilla: con `avoid` se bajaba entero a la hoja
  siguiente. Medido: **4 hojas para una ficha que entra en 3**. Lo que sigue
  sin partirse es cada tarjeta y cada tabla.
- **El aplanado listaba las opacidades de `bg-surface2` una por una** y
  `/60` no estaba: los chips de perfiles técnicos salían en gris oscuro
  sobre el papel. Pasó a `[class*="bg-surface2"]`, genérico — enumerarlas a
  mano garantiza que la próxima variante se vuelva a escapar.
- **El selector de métrica dejaba su etiqueta huérfana.** La regla general
  esconde todo control de formulario, así que "MÉTRICA" quedaba flotando
  sola en la hoja; el contenedor lleva `.no-imprimir` y la métrica elegida
  ya viaja en el título del gráfico. Es el mismo defecto que tuvieron los
  selectores de scouting.

**`modo-ficha-print` está en `MODOS_PAPEL`** y la clase se marca ANTES de
`dibujarPendientes()`, así que los gráficos nacen con la paleta del papel.

#### La evolución es la única sección con SUBSECCIONES

No es "sí o no" sino **cuáles de las 14 métricas**: el modal muestra la
lista sangrada debajo de la sección, con atajos *Todas / Ninguna*, y arma
**un gráfico por métrica tildada**. Antes se exportaba solo la que estuviera
elegida en pantalla, así que el DT que quería puntos, plays y T3% tenía que
generar tres PDF distintos.

Arranca tildada la que está **en pantalla**: lo que el DT viene mirando es
lo que espera encontrar en la hoja. Y nunca arranca con ninguna.

`jugadoresBloqueEvolucion(idx, j, metricaId, idCanvas)` se separó del tab
justamente para esto: el tab es ese mismo bloque con el selector arriba, así
que un cambio en el gráfico cambia en los dos lados.

**El bloque abre hoja** (`page-break-before: always`). Con el corte
automático el título quedaba al pie de una hoja y el gráfico arrancaba en la
siguiente, y con varios gráficos el bloque es largo de por sí.

#### Los puntos del gráfico son el ESCUDO DEL RIVAL

En pantalla el rival de cada noche salía en el tooltip; **en papel no hay
hover**, así que un pico de 38 puntos no decía contra quién fue.
`pluginEscudosRival()` en `sgadd-charts.js` los dibuja con el mismo
tratamiento que el scatter *ORTG vs DRTG* de Principal: disco opaco de base
(los escudos con transparencia lo necesitan), recorte circular, y un anillo
que **conserva el semáforo de atípicos** —verde arriba, rojo abajo, color del
equipo si la noche fue normal—.

Tres reglas que hay que respetar al tocarlo:

- **El disco de base cambia con el fondo.** El `#0B1121` del tema oscuro
  sobre hoja blanca convierte cada punto en una mancha negra: va blanco
  cuando `enPapelClaro()`.
- **Sin escudo resuelto van las INICIALES**, no un hueco. Es lo que pasa
  siempre que el manifiesto de logos no se pueda leer (`file://`, por
  ejemplo). Y si falta alguno porque la imagen no terminó de cargar, se
  reintenta **una** vez: sin eso el gráfico queda con iniciales para
  siempre, y en el PDF eso ya no se puede corregir.
- **Sin `rivales` el gráfico vuelve al punto redondo de siempre.** El
  radio se pone en 0 solo cuando hay escudo, o quedaría un círculo debajo.
  El `hitRadius` mantiene el tooltip, que en pantalla sigue siendo la forma
  rápida de leer fecha y marcador.

### 7.7 · Lo que sigue abierto

- **Nada se verificó contra una impresora física.** Todo se midió sobre el PDF
  generado, que es lo que el club usa (se comparte, no se imprime en papel en
  la mayoría de los casos). Los márgenes negros SÍ están resueltos y medidos.
- **`@page` a secas no se puede condicionar por clase del body.** La vertical
  (`A4 portrait, 12mm 10mm`) la comparten el informe de equipo y el
  post-partido; Scouting se sale de ahí con su `@page` nombrada. Un cambio en
  la vertical afecta a las otras dos: probarlas juntas.

### Presupuesto medido (A4 vertical, margen 10mm = 1047px útiles de alto)

```
HOJA 1 · Encabezado · Insight · 4 Factores · Eficiencia · Perfil de tiro
         985px de 1047 — el perfil de tiro cierra la hoja
HOJA 2 · Box score local · Box score visitante · Nota · Próximo cruce
         847px de 1047
```

Los dos box scores van **uno debajo del otro**, y eso cambió cuando el
informe pasó a dos hojas: mientras tenía que entrar en una sola iban en
paralelo, pero con 14 columnas cada tabla se quedaba con ~357px de los 718
útiles de ancho y su ancho mínimo real es ~470. Medido: la tabla de la
derecha llegaba a **882px sobre una hoja que termina en 718**, así que RT,
AST, PR, PP y `+/-` **caían fuera del área de página y Chromium no las
imprimía** — el mismo defecto que tenía "Restricción / alerta" en scouting.

Apilados hay altura de sobra y cada uno se lleva el ancho completo. Hace
falta además `table-layout: fixed` (con `auto`, el ancho mínimo del
contenido le gana a `width: 100%` y la tabla se ensancha igual) y devolverle
`white-space: normal` a la columna de nombres, que en pantalla va `nowrap`
porque ahí la tabla puede scrollear: sin eso "RUSSO NOWOSIELSKI" se montaba
encima de los minutos.

---

## 25. EL PIE, LOS METALES Y EL ARO

**La fecha va solo en el PDF.** Un informe se comparte, se archiva y se mira
semanas después: sin fecha no se sabe de qué corte habla. En la web es
siempre hoy, así que no informa nada y se confundía con la actualización de
los datos, que es otra cosa y vive en el pie del menú. Hay un test que compara
las dos firmas sacando la fecha y exige que el resto coincida.

El **ícono de Instagram va DELANTE del arroba**: se lee «Instagram
@motorstats.ar», que es el orden en que se dice. Detrás parecía un botón
suelto al final de la línea.

**Cada plan lleva su metal** (bronce `#CD7F32`, plata `#C0C0C0`, oro
`#FFD700`) y no un tono del semáforo: verde y amarillo significan «bien» y
«atención» en todo el panel, y un plan no es mejor ni peor — es otro. Los tres
pasan AA sobre la tarjeta (5,48 · 9,47 · 12,28), medido en `test-config.js`
con la misma `contraste()` que usa el panel.

**El aro no puede comerle las puntas al logo.** Recorta a propósito —un escudo
con fondo propio necesita la máscara circular— así que la imagen se acota a la
caja (`object-fit: contain` + `max-width/height: 100%` + `box-sizing:
border-box`) en vez de salirse. El de la pantalla de carga no lleva aro y no
recorta: ahí el logo es lo único que hay mientras se espera.

---

## 28. EL LOGO SE RECORTABA EN EL ARCHIVO, no en el CSS

`generar-logo.js` tomaba el **cuadrado central** de un original de 1536×1024.
Medido sobre el PNG: tiraba **77 px de contenido a la izquierda y 75 a la
derecha**. Se veía como un logo mal encuadrado dentro de su aro y ninguna
cantidad de padding lo podía arreglar — lo que faltaba no estaba en el archivo.

Ahora descarta el **aire transparente** (no el dibujo), encaja el dibujo entero
en el lienzo cuadrado y rellena el sobrante con transparente — no con un color:
el logo se usa sobre el aro blanco de la barra, sobre la card oscura y sobre el
papel de los PDF, así que cualquier color horneado se vería en al menos uno.

**El padding del aro se MIDE, no se calcula.** La fórmula de la diagonal supone
esquinas opacas y este dibujo las tiene transparentes, así que exagera.
Rasterizando el PNG y contando los píxeles opacos que caen fuera del círculo, el
mínimo que da cero cortados es **4 px** sobre un aro de 48; se usan 5 y no más,
porque cada píxel de padding es un píxel menos de logo. El escudo de un club
necesita 2, que es justo lo que tiene.

Hay un test que decodifica el PNG con `zlib` —lo mismo que hace el generador— y
verifica que el dibujo llegue al borde a lo ancho, que conserve su aspecto y que
con el padding del CSS no se pierda un solo píxel. Y que **sin** padding sí se
perdería, que es lo que justifica que el padding exista.

---

## 35. LOS ENCABEZADOS YA IBAN CENTRADOS

`table th, table td { text-align: center }` está en el `<style>` desde
siempre, con `:first-child` a la izquierda para el nombre y una excepción
para `.tabla-rank`, cuya primera columna es un número.

Las tablas que se veían desalineadas —la de posiciones, la de la captura que
llegó— lo estaban porque **pedían `text-left` a mano en TODAS sus
cabeceras**, y una clase le gana a un selector de elemento.

Se corrigió ahí, decidiendo la alineación **por columna**: las dos primeras
a la izquierda, el resto centradas. Se decide por índice y no por nombre
porque el juego de cabeceras cambia entre la tabla completa y la resumida.

**Una regla nueva con más especificidad habría tapado el síntoma** y de paso
pisado a cualquier tabla que pida la izquierda a propósito. Se escribió, se
midió que era redundante, y se sacó.

---

## 48. LOS ENCABEZADOS DEL GLOSARIO

Sus tablas pedían `text-left` a mano en tres de las cinco cabeceras, y una
clase le gana a la regla de elemento: la fila de encabezados salía
desalineada **contra su propio cuerpo**, que no declara alineación y por
lo tanto la resuelve la regla general del panel —centrada, con la primera
a la izquierda (punto 35)—.

Se centran las cinco. **El cuerpo no se toca**: no pedía nada. Hay un test
que cuenta contra el total de `<th>` y no contra un número fijo, así que
una columna nueva sin centrar lo rompe.
---

## 49. RESPONSIVE · lo que se midió y lo que estaba roto

Auditoría de 320 a 768px sobre la app REAL —datos de DEPORTIVO, 12
equipos y 224 jugadores— con puntero grueso emulado. No se leyó el CSS:
se midió el DOM.

### Cómo se corre la app sin red

El panel de vista previa tiene la red aislada: **no sale una sola
petición a GViz**. Se siembra el caché persistente que el propio panel
usa (punto 3 ter) — se baja el libro con la API de Sheets, se guarda con
la forma exacta de `sgadd.hojas.<sheetId>` y la app arranca completa
desde ahí. Es el mismo camino que el F5 con caché poblado.

El `sheetId` NO viaja en `clubes/<club>.json` —lo resuelve el backend—
así que hay que escribirlo a mano en `SGADD.CATALOGO.planillas[0]` antes
de `cargar()`. Y las secciones de admin necesitan sesión:
`?usuario=<mail de ADMINS>`.

### LA BASE ESTABA BIEN

```
                        320px   375px   768px
desborde horizontal        0       0       0
tablas sin `.scrollbox`    0       0       0
```

Nueve secciones, tres anchos, cero. La disciplina de `.scrollbox` aguanta,
las pestañas envuelven solas (`flex-wrap`), el drawer del buzón ocupa el
ancho completo con scroll interno, y los bloques nuevos —los chips de
**Función en cancha** y la **Vara de medición**— entran en la tarjeta sin
desbordar: su tabla de 488px scrollea dentro de una caja de 275.

### LO QUE SÍ ESTABA ROTO

**1 · El modal de confirmación no se podía usar en un teléfono.**
`.login-fondo` centra con flex y `.login-caja` no declaraba alto, así que
un contenido más alto que la pantalla desbordaba para los **dos** lados
sin scrollear ninguno. Medido a 320×568 con un diff de 16 cambios:

```
caja 1053px · top -242 · botones en y=746   →  FUERA de pantalla
scroll interno: no · scroll del overlay: no
```

O sea: **el admin no podía publicar desde el teléfono.** ESC cerraba, así
que no era una trampa, pero Confirmar era inalcanzable. El de la ficha
tenía el mismo defecto (medido a 360×420: panel 502px, top −41); el del
informe ya estaba bien y fue el modelo.

El arreglo va en `.login-caja` y no en cada llamador: la comparten el
login y el de confirmación, y dos arreglos separados se desincronizan
(punto 8).

**Y la barra de acciones quedó PEGAJOSA**, porque alcanzarlos scrolleando
no alcanza: un modal que se abre sin mostrar sus botones genera justo la
duda que un modal no tiene que generar. Con un detalle que costó — el
`bottom: 0` de una barra pegajosa se ancla a la caja de **padding**, así
que con el `p-5` intacto quedaban 20px por debajo y se veía el contenido
pasando por ahí. El contenedor pierde ese padding con `:has(>)`, que
resuelve por contenedor: los tres modales tienen paddings distintos y una
constante a mano acertaría en uno solo.

**2 · El bloque táctil iba SIN `screen`, y eso rompía el PDF del
teléfono.** Es la familia del punto 7.4 bis y esta vez del lado del
dispositivo: al imprimir, Chrome sigue evaluando `pointer` contra el
aparato, así que un PDF generado desde un celular entraba en la rama de
44px y salía con otra altura de fila, otra de cabecera y **otra
paginación** que el mismo PDF desde escritorio.

Medido después del arreglo, sobre TODAS las hojas cargadas —el `<style>`
y `sgadd.css` compilado— las reglas activas al imprimir que dependen del
dispositivo son **cero**. Un PDF desde el teléfono y desde el escritorio
son el mismo, para el mismo tamaño de hoja.

**3 · Los modales se imprimían.** La lista de ocultado nombraba
`#modalInforme` y dejaba afuera al de la ficha, al de confirmación y al
de login: un Ctrl+P con uno abierto imprimía su tarjeta encima de la
página. Y como sus botones y campos ya caían por `button, select,
input`, salía una caja con el título y las etiquetas sueltas — peor que
la caja entera. Ahora se ocultan por **rol**, así que el modal que se
agregue mañana entra solo.

### LOS TARGETS TÁCTILES · 87 → 1

Ya existía un `@media (pointer: coarse)` con `button, select,
[role=button]`. Medido a 375px con dedo, lo que quedaba afuera:

| | alto | dónde |
|---|---|---|
| cabecera ordenable | **23px** | Jugadores ×6, Equipos ×4 |
| fila interactiva | 32,5px | Jugadores ×20, Equipos ×12 |
| `input` | 30px | Configuración ×7 |
| `summary` | 31px | drawer del buzón |
| enlace del pie | 15px | todas |
| botón de icono | 40px **de ancho** | campana, hamburguesa, ⇄ |

La peor es la **cabecera ordenable**: son targets chicos PEGADOS entre
sí, y errarle reordena el ranking por otra columna sin que se note.

Tres decisiones al escribirlo:

- **La cabecera va con `height` y la fila con `padding`.** En
  `display: table-cell` el `min-height` no manda, y el alto de un `tr` lo
  decide su contenido.
- **`min-width` sobre TODOS los botones**, no sobre una lista de clases:
  los de un solo carácter no comparten ninguna y una lista a mano se
  queda corta apenas aparece el siguiente. Medido después: ninguno
  desborda su caja.
- **Las casillas quedan afuera.** Un checkbox de 44px es una caja
  gigante; lo que tiene que crecer es su etiqueta, que es lo que se toca.

El único que queda bajo el mínimo es la columna **PJ**: 43,6px de ancho
por 44 de alto. Es una COLUMNA, no un botón — ensancharla empujaría la
tabla entera para ganar 0,4px.

**El bloque no lleva tope de ancho a propósito**: una tablet de 1024px
con dedo necesita los 44px igual que un teléfono de 320. Eso sí, se midió
a 375 con puntero grueso emulado; **en una tablet real no se probó** —
la herramienta solo emula táctil por debajo de 768.

### Lo que NO se tocó, y por qué

**Tailwind emite sus breakpoints sin `screen`** (`@media (min-width:
640px)`), así que en el papel se evalúan contra la HOJA: en A4 vertical
(~717px) las utilidades `sm:` se activan y `md:`/`lg:`/`xl:` no. Eso ya
está documentado caso por caso en el punto 7.6 y **no depende del
dispositivo** —una hoja A4 mide lo mismo desde un teléfono que desde una
PC— así que no rompe la garantía de arriba. Acotarlo a `screen` apagaría
las `sm:` en el papel y movería los cuatro PDF, que están medidos y
presupuestados. Se deja como está y se anota.
---

## 50. EXPORTAR EL RANKING DEL PLANTEL · la quinta exportación

### LA UNIDAD ES LA CARD, NO LA MÉTRICA SUELTA

Esto costó una vuelta entera y es el corazón del módulo. La primera
versión juntaba las métricas elegidas en UNA tabla ancha, y el club la
corrigió: **cada card tiene sus métricas, así que exportar todas es
exportar cada card como una tabla independiente.**

Tenía razón, y no es una decisión de formato. Cada card tiene su propio
**`orden`** —`PTS` en participación, `eFG%` en eficiencia, `RO` en
rebotes, `AST-PP` en creación— así que una tabla única colapsa ocho
rankings en uno y **el `#` deja de significar nada en los otros siete**.
Medido en ATENAS 'B': MARCATILI es 1° en producción, DESTEFANO en
eficiencia y RIVELLI en triples. El primero de «Rebotes» no es el
primero de «Tiro de 3», y ésa es la pregunta que cada card contesta.

Exportar «todas» son **ocho tablas**, cada una con su título, su orden y
su numeración. Adentro de cada una se pueden destildar columnas, que es
el ajuste fino. Y **cada tabla dice por qué está ordenada así**: ocho
tablas con la misma pinta y numeraciones distintas se leen como un error
si no se explica.

### LA AUDITORÍA PRIMERO, porque descartó media lista del pedido

El pedido llegó con una lista de ejemplo —«PER, %USG, %TS, %AST, %REB»—
y el club aclaró de entrada que los Four Factors no son de jugador.
Auditando el código apareció que la lista tampoco existía:

| pedida | qué hay de verdad |
|---|---|
| `PER` | **no existe**: no está en `METRICAS` ni la escribe MotorStats |
| `%REB` | **no existe**: el grupo de rebotes trae CUENTAS (`RO`, `RD`, `RT`) |
| `%USG` `%TS` `%AST` `%eFG` | existen, pero se escriben `USG%` `TS%` `AST%` `eFG%` |
| Four Factors | de EQUIPO, viven en `PROMEDIOS 4F` |
| «Asistencias» | `AST` a secas **no es columna** de ninguna card; hay `AST-PP` y `AST%` |

Las ocho cards, con su orden y su ancho:

```
produccion   orden PTS      6 cols   PJ MIN PTS PLAYS PPP +/-
eficiencia   orden eFG%     6 cols   PJ MIN USG% eFG% TS% RTL%
tiro         orden TCI      6 cols   PJ MIN PTS TC% TCC TCI
t2           orden T2I      6 cols   MIN PT2% T2% T2C T2I PPT2
t3           orden T3I      6 cols   MIN PT3% T3% T3C T3I PPT3
libres       orden T1I      6 cols   MIN PT1% T1% T1C T1I PPT1
rebotes      orden RO       4 cols   MIN RO RD RT
creacion     orden AST-PP   5 cols   MIN AST-PP AST% FC FR
```

**Las columnas NO se deduplican entre cards.** `MIN` está en las ocho y
en las ocho tiene que salir, porque cada tabla se lee sola. La primera
versión las deduplicaba —tenía sentido con una tabla única— y acá
dejaría siete tablas sin minutos.

### Por qué RENDERIZA en vez de esconder columnas del DOM

Era el paso 1 del pedido, y no se puede: en pantalla se ve **una card
por vez**, así que «ocultar las desmarcadas» solo podría llegar a esa.
Cada tabla sale del MISMO motor con el mismo pool y la misma escala —lo
que garantiza que el papel no contradiga a la pantalla (punto 8)— y es
además el patrón de las otras cuatro (`#fichaSalida`, `#informeSalida`).

**El orden MANUAL de la pantalla NO se propaga.** Vale para la card que
el DT tiene abierta; aplicárselo a las ocho reordenaría siete por una
métrica que ni siquiera tienen.

### LAS COLUMNAS SON UN PARÁMETRO DEL MOTOR · el bug que solo vio el papel

`jugadoresRanking()` armaba `celdas` con `g.cols`, las de la card. Con
columnas de varias cards pedidas, el PDF salía con **seis llenas y**
**veintinueve en «—»**.

Ni la suite ni el chequeo de sintaxis lo veían: las columnas estaban,
con guiones. **Se cazó renderizando el modo papel y mirándolo** — el
`/MediaBox` del PDF decía que la hoja se giraba bien y no decía nada de
esto. Ahora `o.cols` viaja al motor, las medianas se calculan sobre las
pedidas y la métrica de ORDEN entra siempre aunque no se muestre, porque
la usa el desempate. Sigue valiendo con la card como unidad: es lo que
permite destildar columnas adentro de una.

### Los tres presets agrupan CARDS

| preset | cards | hojas |
|---|---|---|
| **Métricas básicas** | producción · rebotes · creación | 3 |
| **Métricas avanzadas** | eficiencia · tiro · T2 · T3 · libres | 5 |
| **Seleccionar todas** | las ocho | 8 |

Básicas y avanzadas **parten las ocho sin superponerse ni dejar huecos**,
y hay un test que lo fija: si una card quedara en los dos, elegir un
preset y después el otro daría dos veces la misma tabla. «Todas» se
resuelve contra el catálogo vivo, y los otros dos se intersectan con él,
así que sacar una card del ranking no deja un preset pidiendo una que no
existe.

Un preset **reemplaza** y trae cada card **con todas sus columnas**:
media card es una tabla a la que le faltan datos sin que nadie lo haya
pedido. Y **una card sin columnas no sale**: un título sin tabla no es
una card.

### La hoja y los cortes

Con la card como unidad **ninguna tabla pasa de seis columnas**, así que
el documento sale **A4 vertical**. La `@page` apaisada (`rankingAncho`)
queda igual, decidida por la tabla MÁS ANCHA —un solo documento no puede
tener dos orientaciones— para el día que una card crezca. Va con `@page`
NOMBRADA porque `@page` a secas no se puede condicionar por clase (punto
7.7) y la vertical la comparten el informe de equipo y el post-partido.

Ninguna tabla se corta, por los tres lados:

- **a lo ANCHO** · `table-layout: auto` —con `fixed` la columna de
  nombres mide lo mismo que `PJ` y los apellidos se parten— más el
  `min-width` de `.scrollbox` anulado con `!important`, que es **inline**
  (misma trampa que la tabla de marcas, punto 7.3).
- **entre HOJAS** · `break-inside: avoid` en cada `<tr>`, `thead`
  repetido arriba de cada hoja, y `break-after: avoid` en el título de
  cada card para que no se despegue de su tabla. **No** se le pone
  `break-inside` a la card entera: una de 24 filas puede no entrar en una
  hoja y forzarla dejaría media página en blanco.
- **por TIPO** · la tipografía baja por tramos si alguna tabla se
  ensancha.

**A4 y no A3** como el scouting: es una planilla de nombres y números, no
un informe con gráficos, y la A3 obliga al club a elegir el tamaño a mano
en el diálogo.

### Medido sobre los PDF REALES

Generados con Chrome headless por CDP y auditados leyendo el `/MediaBox`
—el estándar del punto 7—, sobre el plantel de ATENAS 'B' (24 jugadores):

```
preset      cards  filas   hojas del PDF
basicas       3      66    3 × A4 vertical
avanzadas     5     119    5 × A4 vertical
todas         8     185    8 × A4 vertical
```

Fondo `RGB(255,255,255)`: sin márgenes negros. Y midiendo celda por
celda contra los 718px imprimibles del A4 vertical, **cero** con el
contenido fuera de su caja.

### El membrete y la limpieza

El membrete va **una sola vez** arriba: club, categoría, cantidad de
jugadores, **tramo y fecha**. El tramo sale de
`combinacionesTorneoFase()`, que es la que ya arma el `label` del
selector: componerlo a mano daría `*TOTAL*|REGULAR` —una clave interna—
o una etiqueta parecida pero distinta de la que el DT tiene en la barra.

El nombre del archivo lleva el título de la tabla **solo si hay una**:
con ocho, meter los títulos daría un nombre ilegible en la carpeta.

La limpieza cuelga de `afterprint` con respaldo de 60 s, se serializan
los escudos y se restauran, y el archivo sale con nombre propio: el mismo
contrato que las otras cuatro (puntos 7.5 y 7.8). **`modo-ranking-print`
está en `MODOS_PAPEL`**, o los colores que se resuelven contra el fondo
saldrían con la paleta oscura.

### La trampa de siempre, otra vez

El PDF salía con las columnas vacías **después** de arreglar el motor: el
`?v=` no se había subido tras editar el `.js`, así que Chrome servía el
archivo cacheado. Es el punto 2 al pie de la letra — al tocar un `.js`
hay que subir el `?v=`, **aunque ya se haya subido en esa misma vuelta**.

---

## 51. EL PIE INSTITUCIONAL, EN TODAS LAS HOJAS

`SGADD_UI.pieInforme()` ya existía y armaba el contenido correcto —logo,
**MotorStats^AR**, fecha, mail e Instagram— pero iba **en el flujo**: una
vez, al final, o sea en la última hoja. Con una ficha de nueve páginas
eso deja ocho sin firmar, y una hoja suelta de un PDF compartido no dice
de dónde salió.

### El mecanismo

`inyectarPieMotorStats()` cuelga un nodo del `<body>` y en `@media print`
va `position: fixed; bottom: 0`. **En medios paginados un elemento fijo
se repite en cada hoja**: es el mecanismo estándar y no hay que contar
páginas a mano.

Tres cosas que hay que respetar:

- **VA COLGADO DEL BODY, no adentro del contenedor de salida.** `position:
  fixed` se ancla al primer ancestro con `transform`, `filter` o
  `contain`, y adentro de una card con `backdrop-filter` **dejaría de
  repetirse sin ningún síntoma**. Hay un test que exige que el único
  destino del `appendChild` sea `document.body`: un
  `(otro || document.body)` pasaría un regex laxo.
- **Es idempotente.** Lo llaman cinco exportaciones y llamarlo dos veces
  no puede apilar dos pies.
- **La fecha se calcula AL IMPRIMIR**, no al armar el documento: entre
  que se abre el modal y se toca Generar puede pasar la medianoche, y un
  informe fechado ayer no se puede auditar.

### LAS DOS MITADES, o el pie pisa el contenido

El pie ocupa la franja de abajo **y** cada `@page` se la reserva con su
`margin-bottom: 15mm`. Con una sola de las dos, el texto de la última
línea de cada hoja queda debajo de la barra — **y eso no se ve auditando
en pantalla, solo en el PDF**.

Van las **cuatro** `@page` (`partido`, la vertical por defecto,
`apaisada` y `rankingAncho`): el pie se repite en toda hoja de toda
exportación, así que una que se olvide lo deja pisando. Hay un test que
recorre las reglas y falla si alguna que declara `size` no reserva los
15mm.

Medido: el pie mide **9,2mm** en los tres anchos de hoja —A4 vertical,
A4 apaisada y A3 apaisada— contra los 15mm reservados. Entra con 5,8mm
de holgura.

### El del FLUJO se esconde

`.informe-pie { display: none !important }` en `@media print`. Sale al
final del documento, o sea en la última hoja, y ahí coincidiría con el
fijo: dos pies en la misma página. Se deja en el DOM —lo emiten las
cuatro exportaciones y es el mismo helper— y se apaga solo al imprimir.

### Y SE EXCEPTÚA DE LOS TRES OCULTADOS

`modo-impresion`, `modo-ficha-print` y `modo-ranking-print` esconden todo
lo que no es su contenedor de salida:

```css
body.modo-ficha-print > *:not(#fichaSalida):not(.pie-motorstats) { display: none !important; }
```

El pie es **hermano** del contenedor —tiene que colgar del body para que
el `fixed` se ancle a la hoja— así que sin el `:not()` desaparece del
PDF. Un modo nuevo que hide hermanos tiene que exceptuarlo.

### El MANUAL emite el suyo

`MANUAL_ETIQUETADO_SGADD.html` es un **HTML suelto**: se abre con doble
clic y no carga un solo `.js` del panel, así que no puede llamar al
helper. `generar-manual-etiquetas.js` emite el mismo contenido con las
mismas clases, y el **logo va como `data:` URI** — el archivo se comparte
solo, así que una ruta relativa no sobrevive a moverlo de carpeta.

### MEDIDO SOBRE LOS PDF REALES

No alcanza con leer el CSS: se generó el **mismo** documento con y sin el
pie y se contaron los dibujos de imagen del PDF.

```
ficha     9 hojas · 17 imágenes SIN pie · 26 CON pie · diferencia +9
ranking   8 hojas · reparto [2,1,1,1,1,1,1,1]
          (la hoja 1 lleva escudo del membrete + logo del pie)
informe   9 hojas · A3 apaisada
```

O sea: **el logo del pie se dibuja exactamente una vez por hoja**, en las
tres exportaciones y en los dos tamaños de papel.

### La trampa de siempre, dos veces

1. **Backticks dentro de un template literal**, al comentar el CSS nuevo
   del manual: tiró abajo el generador entero. Es el punto 7.6 al pie de
   la letra, y ya había pasado en esta misma sesión con `sgadd-ficha.js`.
2. **Tres tests que medían por DISTANCIA EN CARACTERES** (`{0,200}`,
   `{0,220}`) se pusieron en rojo porque el comentario de la inyección
   corrió la llamada fuera de la ventana — **sin que la propiedad hubiera
   cambiado**. Es la lección del punto 43. Se reescribieron para medir el
   ORDEN (`indexOf` de uno contra el otro), que es la propiedad real.

### Y una tercera trampa: los tests anclados a `
`

Dos tests extraían el bloque `<style>` con `/
<style>
/` y uno cortaba
el bloque táctil con `'
  }
'`. **El repo alterna entre LF y CRLF** —git
normaliza al hacer checkout, y los `warning: LF will be replaced by CRLF`
salen en cada commit— así que un `git pull --rebase` dejó el bloque sin
extraer y **45 verificaciones de CSS fallaron de golpe sin que hubiera
cambiado una sola regla**.

Van con `
?
`. Es la misma familia que medir por distancia en
caracteres: un ancla frágil que se rompe por algo que no tiene nada que
ver con la propiedad que defiende.

### El manifiesto de escudos, otra vez

La migración a `.webp` se subió por la web de GitHub —fuera del flujo del
punto 11— y dejó **12 entradas del manifiesto apuntando a archivos
borrados**: Atenas A/B, C.C. Tolosano, Gonnet, Estudiantes, Juventud,
Meridiano, Náutico y Platense A/B se quedaban **sin escudo, sin ningún
aviso** — el panel de faltantes solo mira la categoría abierta.

Es exactamente el episodio del punto 6, y lo cazó `test-logos.js`, que
existe justamente para eso. Se apuntaron las doce a los `.webp` que ya
estaban subidos.

### La vista previa del pie · y por qué hizo falta

**El pie solo se ve al imprimir**, así que «¿quedó aplicado?» no se podía
contestar sin generar un PDF y auditarlo. Eso convirtió una entrega en
tres idas y vueltas: el club reportaba que no salía en tres clubes, y la
diferencia era la versión cacheada de su navegador.

El modal de exportación muestra ahora **el pie tal cual se va a imprimir**
—sobre blanco, que es el fondo de la hoja— con la **versión de assets** al
lado. Si dice una versión vieja, lo que se va a imprimir es código viejo:
es el diagnóstico de treinta segundos del punto 2, puesto donde se toma
la decisión.

Usa el MISMO `pieInforme()` que se imprime: una maqueta aparte mentiría en
cuanto una de las dos cambie (punto 8). Y no se imprime, que sería el pie
dos veces.

### La lección de medición

Yo había verificado el pie contando **imágenes por hoja** (8/8) y di el
trabajo por cerrado. Eso probaba que se dibujaba *algo*, no que se viera
— un logo sin texto habría dado el mismo número. Cuando el club volvió,
la medición que decidió fue contar **glifos de texto por hoja**:

```
ranking · 8 hojas    CON pie  8492 glifos · 9 imágenes
                     SIN pie  7932 glifos · 1 imagen
                     delta    +70 glifos y +1 imagen POR HOJA
```

Setenta glifos es exactamente el largo de la firma. **Al verificar algo
visual, contar la cosa que se quiere ver, no una proxy.**

### Y AUN ASÍ FALTABA LA MITAD · el pie estaba, pero no se leía

El club volvió una tercera vez, con la captura del diálogo de impresión:
al pie de la hoja había **una manchita** donde tenía que ir la firma. Lo
que se auditó esta vez, sobre el ranking real de ATENAS 'A' con datos de
GViz y el código publicado:

```
ancestros del pie      body y html · overflow visible · sin transform,
                       filter, backdrop-filter, contain ni will-change
nada en el documento   crea un bloque contenedor para el `fixed`
franja del pie         9,23mm contra los 15mm que reserva cada @page
el PDF                 6 hojas · una imagen del logo en CADA una
```

O sea: **el mecanismo estaba bien y el pie estaba en todas las hojas.**
Las tres cosas que el club pidió revisar —un `overflow: hidden` que lo
cortara, el `@page` sin espacio, el `fixed` roto por un ancestro— dieron
limpias las tres.

**Lo que fallaba era el CUERPO.** La especificación original pedía
`font-size: 10px`, que en pantalla se lee bien; en papel esos mismos
10px son **7,5pt**, el cuerpo más chico de todo el documento —el de las
notas al pie de cada card— puesto además solo en el medio de una franja
de 9mm. Y la vista previa de impresión dibuja el A4 de 794px CSS sobre
unos 463px de pantalla, o sea a **~56dpi**:

```
7,5pt  →  5,8px de alto  →  no se resuelve una letra: es una mancha
9pt    →  7,0px de alto  →  se lee la línea entera
```

Se reprodujo el síntoma exacto rasterizando la hoja a esa misma
resolución (DPR 0,583 sobre un viewport de 794px, que da los 463px del
diálogo) con los valores viejos y con los nuevos. Con los viejos la
firma es un borrón gris con un punto oscuro —el logo, que es lo único
que se resuelve a cualquier zoom— y **eso es exactamente lo que el club
estuvo mirando tres veces**.

Va a **9pt**, la marca a 10pt, el logo a 17px y el ícono a 15px. El
filete de arriba pasa de `#cbd5e1` a `#94a3b8`: el primero da **1,48**
de contraste sobre blanco, o sea una línea que en papel no existe, y el
segundo es el mismo gris con el que el papel ya dibuja el borde de las
tarjetas. El color de texto no era el problema —`#4b5563` ya daba 7,56—
pero se cargó a `#1f2937` (14,68) porque a 9pt sobre una franja aislada
conviene que pese.

La franja quedó en **9,56mm**, así que sigue entrando holgada en los
15mm reservados, y hay un test que **recalcula esa altura desde las
propias declaraciones** (padding + borde + cuerpo × interlínea): si
alguien agranda la tipografía sin mirar el `@page`, el pie pisa la
última línea de cada hoja y eso no se ve auditando en pantalla.

**La lección, que es la del punto 51 llevada un paso más:** los once
tests del pie estaban en verde —`position: fixed`, `bottom: 0`,
`z-index`, la excepción de los tres ocultados, los 15mm de las cuatro
`@page`— mientras la firma era ilegible. Todos defendían el MECANISMO y
ninguno el RESULTADO. *Que el elemento esté no es que se vea, igual que
que se dibuje algo no es que se lea.* Los tests nuevos fijan el cuerpo,
el filete y la altura; verificados al revés, revirtiendo el arreglo,
caen **5**.

Y la vista previa del modal se subió al mismo cuerpo: si se imprime a
9pt y la previa se dibuja a 10px, la previa promete otra cosa que la que
sale.

### LA CUARTA VUELTA · «solo falla en el Ranking»

El club volvió con un dato que parecía cerrar el caso: el pie **sí** sale
en fichas, informes y manual, y **solo** falla en el Ranking. De ahí una
hipótesis razonable —que la regla que aísla `#rankingSalida` al imprimir
se lleva puesto al pie— y un pedido concreto: inyectar el pie DENTRO de
`#rankingSalida`.

**Las dos mitades del pedido se midieron y las dos dieron limpias:**

```
git show 0055493 · 08f22f8 · 71dd56f · 1bf7e88
  las TRES reglas de ocultado llevan :not(.pie-motorstats)
  desde el commit que creó el pie, sin excepción

el mismo plantel de la captura (UNIVERSAL · 17 jugadores):
  RANKING  6 hojas · una imagen del logo en CADA una · pie 9,56mm
  FICHA    3 hojas · una imagen del logo en CADA una
  el nodo: hijo directo de body · display flex · sin hijos ocultos
```

**Y HACER LO QUE PEDÍA HABRÍA ROTO EL PIE.** Un elemento adentro de
`#rankingSalida` está EN EL FLUJO, y algo en el flujo se imprime **una
vez, donde cae** — o sea en la última hoja. Es exactamente el defecto que
el pie fijo vino a resolver: el `position: fixed` colgado del `body` es lo
único que lo repite hoja por hoja en medios paginados. Mover el nodo
adentro del contenedor convierte ocho firmas en una.

La captura, comparada contra el render propio a la misma resolución del
diálogo, era la de **7,5pt**: una mancha. O sea la cuarta vuelta del
mismo problema —el navegador imprimiendo con código viejo— y no un
defecto nuevo.

### EL AVISO DE VERSIÓN, que es lo que faltaba de verdad

El diagnóstico de treinta segundos del punto 2 —la versión en el pie del
menú lateral— **existía y no alcanzó cuatro veces seguidas**, porque está
lejos del lugar donde se decide imprimir. Nadie mira el pie del menú antes
de tocar «Exportar».

`SGADD_UI.comprobarVersionPublicada()` se dispara **al abrir el modal de
exportación**: pide `index.html?cb=<ts>` con `cache: 'no-store'`, saca el
`?v=` más alto y lo compara con el que el navegador tiene cargado. Si
quedó atrás, el rótulo de la vista previa se reescribe en ámbar diciendo
las dos versiones y que hay que recargar antes de generar.

Cuatro reglas al tocarlo:

- **El cache-buster va en los DOS lados.** El CDN responde por URL y el
  navegador por su propia política: con uno solo se vuelve a leer la copia
  vieja, que es justo lo que se está tratando de detectar.
- **Se comprueba al ABRIR EL MODAL y no en el arranque.** Es el momento en
  que la versión importa —de ahí sale el PDF— y es un gesto del usuario,
  así que la petición de más no entra al camino crítico del primer pintado
  (punto 5 bis).
- **FALLA EN SILENCIO.** Sin red, en `file://` o con un `index.html` que no
  se pueda leer, no se dice nada: un aviso de versión que aparece porque
  falló una petición es peor que no tener aviso.
- **Solo avisa si está ATRÁS.** Estar adelantado —alguien con su propia
  copia— no es un problema del que imprime.

Ejercido en el navegador, los tres caminos: al día el rótulo no se toca;
atrasado sale el aviso en `#fbbf24` con las dos versiones; con `fetch`
rechazando, el rótulo queda intacto.

**La lección de las cuatro vueltas juntas:** el pie estaba bien desde la
primera, y las tres correcciones que siguieron fueron sobre cómo se
VERIFICA —contar la cosa y no una proxy, medir a la resolución en que se
mira, y poner el diagnóstico donde se toma la decisión—. Cuando un reporte
se repite sin que el código cambie, lo que falta no es un arreglo: es una
forma de que el otro lado pueda ver lo mismo que uno mide.

### LA QUINTA VUELTA · el diagnóstico se muda al navegador del club

El club confirmó estar en **v194** y que fichas e informes sí firman en el
mismo navegador. Eso descarta el caché y deja una hipótesis concreta: que
algo del maquetado del Ranking cree un **bloque contenedor** y le rompa el
`position: fixed` al pie.

Se auditó exactamente eso, con **PLATENSE 'A'** —el plantel de la captura—
comparando los dos modos de papel lado a lado:

```
                         RANKING              FICHA
contenedor               #rankingSalida       #fichaSalida
  display / position     block / static       block / static
  overflow               visible              visible
  transform·contain      none                 none
  will-change·filter     auto / none          auto / none
pie                      fixed · bottom 0 · z 9999 · 9,56mm · ultimo del body
ancestros (body, html)   sin una sola propiedad que cree bloque contenedor
en TODO el documento     solo header.sticky con backdrop-filter, que es
                         HERMANO del pie y ademas se oculta al imprimir
el PDF                   6 hojas · 1 logo c/u  3 hojas · 1 logo c/u
```

**Los dos modos son equivalentes en todo lo que se preguntó**, y el pie
sale en todas las hojas de los dos. Quinta auditoría limpia.

#### Lo que se hizo en vez de seguir adivinando

`SGADD_UI.diagnosticarPie()` contesta, **en el navegador de quien**
**imprime**, las tres maneras en que el pie puede dejar de repetirse — y
ninguna de las tres deja un error en consola:

| | Qué se pregunta |
|---|---|
| el NODO | ¿se inyectó? |
| la REGLA | ¿está `.pie-motorstats { position: fixed }` dentro de un `@media print` **del CSS que este navegador tiene cargado**? Se lee del CSSOM, así que también delata un `<style>` viejo |
| los ANCESTROS | ¿`body` o `html` declaran `transform`, `filter`, `perspective`, `contain`, `will-change` o `backdrop-filter`? Cualquiera de las seis ancla el `fixed` a ese elemento en vez de a la hoja |
| las EXCEPCIONES | ¿las tres reglas de ocultado llevan `:not(.pie-motorstats)`? |

El modal de exportación lo corre al abrirse y **solo dice algo si algo
falla**: un cartel que aparece siempre se deja de leer (punto 14).

Cuatro cosas que hay que respetar al tocarlo:

- **Los ancestros son SIEMPRE `body` y `html`.** El pie cuelga del body,
  así que recorrer el árbol entero sería trabajo de más y ruido: lo que
  importa es si alguno de esos dos crea el bloque contenedor.
- **Una hoja de otro origen lanza al leer `cssRules`** —la de las
  tipografías— y hay que saltearla, no dejar que tumbe el diagnóstico.
- **EL CSSOM DE CHROME SERIALIZA `> *:not(...)` SIN EL UNIVERSAL**, o sea
  `> :not(...)`. La primera versión exigía el `*` y **denunciaba las tres
  reglas estando bien** — un diagnóstico con falso positivo es peor que no
  tenerlo, porque manda a buscar donde no hay nada. Lo cazó ejercerlo en el
  navegador, no leerlo; hay un test que revierte esa línea y falla.
- **Se ejerce, no se lee.** El test recorre el fuente para fijar las seis
  propiedades y el `catch`, pero la verificación de verdad fue correr los
  cuatro caminos en el navegador: sano `ok: true`; con `transform` en el
  body y con `filter` en el html, el motivo exacto.

### LA SEXTA VUELTA · el PDF del club, decodificado

El club mandó el archivo generado, que era el dato que faltaba desde la
primera vuelta. Auditado con la enumeración de páginas correcta y
decodificando el **ToUnicode** de cada fuente —contar glifos no alcanza:
hay que LEER la firma—:

```
el de acá, con SUS parametros de dialogo   8 hojas · img [2,1,1,1,1,1,1,1]
Ranking VILLA SAN CARLOS 'A'               8 hojas · img [1,0,0,0,0,0,0,0]
Ranking C.E.Y E                            8 hojas · img [1,0,0,0,0,0,0,0]
```

**El logo del pie no se dibuja en ninguna hoja de sus dos archivos**, y de
toda la firma sobrevive UNA SOLA COSA: el **«AR»** del `<sup>`. Las ocho
hojas de los dos PDF terminan exactamente en «AR», y en ninguna aparece
«MotorStats» ni «Generado el».

Eso es a la vez el síntoma y la pista. El `<sup>` lleva
`vertical-align: super` con `line-height: 0`: es **el único glifo del pie
que se dibuja por encima de la línea de base y cuya caja no empuja la
línea**. O sea que el elemento fijo SÍ se alcanza y SÍ se repite hoja por
hoja —el «AR» lo prueba, está en las ocho— y lo que falla es dónde cae el
resto de la línea respecto del borde que Chromium considera imprimible.

Y es la manchita que el club venía describiendo desde la primera captura.

#### Lo que se probó y NO sirve

- **`<tfoot>` / `table-footer-group`**, que era el pedido explícito.
  Medido: sale **solo en la última hoja**. Chromium repite `<thead>` en
  cada página pero **no** repite el footer group. Se descartó con el
  experimento hecho, no de memoria.
- **Reproducir con sus parámetros de diálogo** (A4, márgenes por defecto
  0,4in, fondos desactivados). Da las mismas **8 hojas** que su PDF —o sea
  que el paginado sí se reprodujo— y aun así la firma sale entera en las
  ocho. El defecto no se reproduce de este lado.

#### Lo que se hizo

Se le saca a Chromium la decisión. El elemento fijo pasa de ser una barra
de 9,5mm anclada con `bottom: 0` a **cubrir la hoja entera**
(`top: 0; bottom: 0`), con la firma apoyada abajo por
`align-items: flex-end`. La posición deja de salir de resolver un borde y
pasa a salir del layout, que es lo que no cambia entre motores.

- **El elemento exterior va SIN FONDO.** Cubre la hoja entera: un fondo
  ahí taparía el contenido. El blanco y el filete viven en
  `.pie-motorstats-barra`, que es lo único que se ve.
- **Medido después**: mismas 8 hojas, `img [2,1,1,1,1,1,1,1]`, firma
  completa en las ocho y a los mismos 18,9mm del borde. Cero regresión.

**Honestidad sobre esto:** no se pudo reproducir el defecto, así que no se
puede afirmar que esto lo cierra. Lo que sí se puede afirmar es que quita
la dependencia del único punto que la evidencia señala —cómo se resuelve
`bottom: 0` contra el borde imprimible— sin mover nada de lo que ya
funciona.

### LA SÉPTIMA VUELTA · el `<tfoot>` REAL, que es lo único probado en su Chrome

El club cortó la discusión bien: *«basta de variantes de CSS; hay vistas en
este proyecto que SÍ imprimen el pie en todas las hojas — buscá cuál y copiá
esa estructura»*. Tenía razón, y el mecanismo probado estaba **adentro de su
propio PDF**.

#### La comparación bloque a bloque, que es la que cerró el caso

Decodificando los dos archivos —el suyo y el de acá— y listando cada bloque
de contenido que usa la transformación del pie:

```
EL DE ACÁ (el pie sale)          EL SUYO (el pie no sale)
3 bloques                        1 bloque
  [IMAGEN X10]  el logo            —
  y=1006 x=133  «MotorStats»       —
  y=1006 x=218  «· Generado el…»   —
  y=1006 x=527  «@motorstats.ar»   —
  y=997  x=200  «AR»             y=997  x=201  «AR»
```

**La misma transformación (`3.125 0 0 3.125 118.75 140.625 cm`), el mismo
color (#111, que es el aplanado del papel) y prácticamente la misma
coordenada.** O sea que su motor coloca el pie exactamente donde lo coloca
el de acá, y pinta UNA sola corrida: el `<sup>`, que es la única del pie
con `vertical-align: super` y `line-height: 0`.

Mismo código, misma versión (v196, confirmada en su barra lateral), misma
posición, distinto resultado. `position: fixed` en medios paginados no es
confiable en su Chrome, y no hay CSS que lo arregle desde acá.

#### Lo que SÍ está probado en su navegador

En sus ocho hojas **la fila de encabezados de cada tabla se repite**. Eso es
`table-header-group`, y `<tfoot>` es la misma maquinaria.

Medido acá con una prueba de 220 filas:

```
<tfoot> de VERDAD dentro de <table>   →  6 de 6 hojas   ✓
display: table-footer-group en un div →  solo la ULTIMA  ✗
```

**La diferencia es el ELEMENTO, no la propiedad.** El primer intento de esta
vuelta usó la versión CSS sobre divs y salió solo en la última hoja; por eso
se había descartado el mecanismo entero. Estaba mal descartado.

#### El mecanismo, y las dos exportaciones que NO lo usan

`inyectarPieDeHoja(contenedorId)` envuelve el contenido del contenedor en
una `<table class="hoja-firmada">` de una sola celda, con un `<tfoot>` que
lleva la firma. Lo usan las **cuatro** exportaciones que tienen contenedor
propio: ranking, ficha, informe y —desde el 2026-09-20— **scouting**.

**Solo el post-partido sigue con el fijo**: imprime la sección viva, sin
contenedor propio. Conviven dos mecanismos a propósito, y hay tests que
fijan cuál usa cada una — **una exportación no puede tener los dos**, o
firmaría dos veces la misma hoja.

#### LA OCTAVA VUELTA · scouting era el que faltaba

El club volvió a reportar el PDF sin firma, esta vez sobre el informe
pre-partido. Era el ÚNICO de los cuatro con contenedor que seguía con
`position: fixed`, o sea exactamente el mecanismo que su Chrome no pinta
—de todo el pie le salía únicamente el `<sup>`— y que siete vueltas de CSS
no lograron arreglar.

**El argumento que lo dejaba afuera era falso.** Acá decía que scouting
«imprime la sección viva, sin contenedor»: tiene uno, `#scoutInforme`, que
envuelve las once cards. Lo único que había que medir era si el A3
apaisado se movía al envolverlo en una tabla, y **no se mueve**. Medido
generando el PDF real con Chrome por CDP y decodificando el ToUnicode de
cada hoja —contar imágenes es contar una proxy, que es la lección de este
mismo punto—:

```
                     hojas   tamaño        firma LEGIBLE   imagenes por hoja
con el fijo (antes)    8     A3 apaisada        8/8         3,5,3,1,1,1,2,2
con el <tfoot>         8     A3 apaisada        8/8         3,5,3,1,1,1,2,2
```

O sea: los `break-before: page` de las cards y la `@page apaisada` del
punto 7.2 **sobreviven adentro de la celda de la tabla**, y el reparto del
contenido es idéntico hoja por hoja. En el Chrome de acá el fijo también
salía en las ocho —el defecto sigue sin reproducirse de este lado, igual
que en las vueltas 5 y 6— así que lo que prueba esta medición no es que el
bug se arregló sino que **la migración no mueve nada**, y el mecanismo al
que se migra es el que el PDF del club ya demostró que su navegador
respeta.

Cuatro cosas que hay que respetar al tocarlo:

- **La celda del cuerpo va SIN padding y la tabla con `width: 100%`.** Una
  tabla encoge al contenido si no se le dice, y cualquier padding movería un
  maquetado que ya está medido hoja por hoja.
- **Es idempotente**: no envuelve dos veces.
- **La fecha se calcula al imprimir**, igual que antes.
- **El `@page margin-bottom: 15mm` se queda.** Con el `<tfoot>` el pie está
  en el flujo y no necesitaría la reserva, pero post-partido y scouting
  siguen con el fijo y sí la necesitan — y bajarla movería el paginado de
  las cinco.

#### Medido después

```
ranking  8 hojas · firma en las OCHO · img [2,1,1,1,1,1,1,1]
ficha    5 hojas · firma en las CINCO · img [2,1,1,3,2]
y exactamente UNA «MotorStats» y UN «Generado el» por hoja
```

#### Y la falla que casi se me escapa

Mi barrido de la suite detectaba fallas buscando la palabra «FALLARON», y
`test-jugadores.js` cierra con **«HAY FALLAS»**. Reportó *ok* con un test en
rojo. Los contadores lo delataron —283 pasó a 282— y por eso conviene mirar
el número y no solo el cartel: **un barrido que busca UNA sola forma de decir
«falló» es un barrido que miente en cuanto una suite la diga distinto.**

#### Y por qué NO se movió el pie adentro de `#rankingSalida`

Era el pedido literal, y habría roto lo único que hace que el pie se
repita. Un elemento adentro del contenedor está **en el flujo**, y algo en
el flujo se imprime **una vez, donde cae** — o sea en la última hoja. Es
exactamente el defecto original que el pie fijo vino a resolver: ocho
firmas volverían a ser una. El `position: fixed` colgado del `body` es el
mecanismo, y para eso el nodo tiene que ser HERMANO del contenedor, no
hijo — de ahí que las tres reglas de ocultado lo exceptúen.

---

## 59. EL PAPEL Y LA PESTAÑA JUGADORES · cuatro pedidos del 2026-09-12

Llegaron con cuatro PDF del club (Ficha, Ranking y Scouting de
Reconquista, y la ficha de un jugador). `test-pdf-layout.js` y
`test-router-jugadores.js` fijan todo lo de acá.

### 1 · LA BARRA NARANJA DE LOS PDF · la capturaba `:hover`

Una franja de 3 px del acento a lo alto de cada hoja, en unos PDF sí y en
otros no. **No era un borde de `@page` ni de un contenedor**: se midió
decodificando los streams del PDF (un relleno `-3 981 m -3 0 l …` dentro
de una celda, en cada hoja) y después con el estilo computado bajo
emulación de impresión con `:hover` forzado (`CSS.forcePseudoState`):

```
v212   td.hoja-cuerpo-celda  box-shadow: rgb(247,148,30) 3px 0 0 0 inset
v213                         none
```

La regla era `tbody tr:hover td:first-child { box-shadow: inset 3px 0 0
var(--acento) }`: **sin `@media screen` y con combinador descendiente**.
Al imprimir con el mouse sobre la página Chrome captura `:hover`, y la
fila de `table.hoja-firmada` (punto 51) envuelve el documento ENTERO: su
celda —y la primera celda de cada tabla de adentro— pintaba la barra.
Dependía de dónde había quedado el mouse, y por eso no se reproducía
siempre.

- **Todo estado de puntero o de foco que pinte una fila va en
  `@media screen`**: el hover general, el del plantel y el
  `:focus-visible` de las filas navegables. La fila DESTACADA del plantel
  sigue en los dos medios: esa marca la puso el DT.
- **La barra pinta la primera celda PROPIA (`>`)**, no las de las tablas
  anidadas.
- **La celda de la hoja firmada no dibuja nada** en papel: ni sombra, ni
  borde, ni contorno, ni fondo, con `!important`.

El test no busca un color: exige que ninguna regla de `:hover`/`:focus`
que pinte una fila viva fuera de `@media screen`.

### 2 · LOS CORTES · y la tabla que no puede evitarlos

La regla general de impresión suma `.scout-card`, `.scout-ficha`,
`.scrollbox`, `tbody tr`, `thead` y `figure` a lo que no se parte entre
hojas. **Pero `table` estaba en esa lista, y `table.hoja-firmada` es una
tabla**: pedirle `avoid` a la que envuelve un informe de nueve hojas es
pedirle que entre en una. Se excluye explícito —la tabla, su fila y su
celda de cuerpo van en `auto !important`—.

Las excepciones medidas se mantienen: los bloques de la ficha del jugador
y los `data-hoja` del informe de equipo se siguen pudiendo partir (7.6
bis y ter). En los PDF del club no había una card cortada a la vista:
esto es refuerzo preventivo, no la corrección de un corte medido.

### 3 · CLAVES ARRIBA DEL RESTO

«🎯 Claves estratégicas y anticipación» pasa inmediatamente arriba de
«🧩 Resto del plantel», en `SCOUT_CARDS` (el modal), en el template (la
pantalla) y por lo tanto en las hojas: el PDF imprime el DOM en su orden.

**Las claves NO abren hoja y el resto sí**, que es como ya estaban las
clases: las claves van con la tabla de jugadores que las dispara (pedido
anterior del club, que un test fija). Hoja 6 = jugadores + claves (575 +
352 px, entran), hoja 7 = el resto. Medido en el PDF A3: siguen siendo
**9 hojas con ORO y 7 con PLATA**.

### 4 · EL ⚠ DE LOS RANKINGS VA CON EL NOMBRE

En «Rankings de la liga» (Equipos) el chip de partidos sin estadísticas
(punto 44) iba adentro de la columna PJ, que es de números: la
ensanchaba y rompía la lectura vertical. Ahora va al lado del nombre del
equipo, con `shrink-0` para que el truncado no se lo coma, y con el
desglose en el `title`. **La celda PJ muestra solo el número.**

### 5 · LA PESTAÑA JUGADORES VACÍA HASTA EL F5

Medido en producción con token de admin: al entrar a Jugadores, 0
escudos y 0 cards hasta recargar. Dos causas:

1. **El filtro de equipo sobrevivía al cambio de categoría.**
   `JUGADORES.filtroEquipo` es estado de la sección: elegido «RECONQUISTA
   A» en Primera y pasado a la U23 —donde se llama «RECONQUISTA»—, la
   grilla escondía el selector y no había plantel que mostrar.
   `jugadoresPintar` suelta ahora un filtro que no existe en el índice
   abierto. **No adivina el equivalente**: la letra distingue equipos
   (punto 19).
2. **`buildJugadores` devolvía la barra sola** y la grilla llegaba cuando
   `cargar()` corría en un `setTimeout`, aunque el índice ya estuviera en
   memoria. Con índice, pinta en una **microtarea**: después de que
   `renderSection` inserta el HTML —los gráficos necesitan su canvas en el
   DOM— y antes de que el navegador pinte. Si en el medio se cambió de
   sección, no pinta encima de otra.

Los nombres que venían en el pedido (`cambiarSeccion('jugadores')`,
`SGADD_CORE.jugadores`) no existen en el código: el router es
`navigate()`/`renderSection()` y el estado global es `SGADD_APP.estado`.
El test corre el `sgadd-jugadores.js` real en un `vm` con temporizadores
que no avanzan solos: si la grilla está pintada antes de soltarlos, no
depende de ellos.

---

## 65. LA TABLA QUE NO ENTRA SE PARTE · NO SALTA ENTERA (2026-09-21)

Reportado por el club con el PDF en la mano: en 🛡 Marcas · jugador por
jugador **la primera hoja salía con el título, el subtítulo y la leyenda y
nada más**, y los ocho jugadores empezaban recién en la siguiente. El pedido
fue explícito: *«la hoja se debe empezar a llenar y, al llegar al final, si
hay información que queda afuera, ahí recién se inicia una hoja nueva. Lo que
no puede pasar es que quede info de jugadores por la mitad: el salto de
página lo tiene que iniciar el nombre del jugador».*

### El mecanismo son VEINTISÉIS PÍXELES

Medido en modo papel con la media de impresión emulada (`Emulation.
setEmulatedMedia`), que es la única forma de leer los altos que decide
Chromium al paginar:

```
alto útil de una A3 apaisada      1028px   (297mm − 10 de margen − 15 del pie)
la card de marcas                 1054px   ← se pasa por 26
   cabezal (título + leyenda)        70px
   la tabla                         942px
la fila más alta (un jugador)      123px   ← entra en cualquier hoja
```

La card **no entra en ninguna hoja**, así que Chromium tiene que partirla. Y
ahí está el defecto: `.scrollbox` y `table` estaban en la lista general de
`break-inside: avoid` (punto 59.2), así que la tabla no se podía partir y
saltaba **entera** a la hoja siguiente, dejando el cabezal solo. Un desborde
de 26 píxeles se comía media hoja.

El PDF del club, decodificando el ToUnicode hoja por hoja:

```
hoja 5    542 glifos   ← solo el cabezal. El resto, en blanco
hoja 6   8750 glifos   ← la tabla entera de los ocho jugadores
```

### LA DISTINCIÓN ES SI LA CARD ABRE HOJA

El primer intento fue aplicarlo a TODA tabla de una card, y **rompió la
matriz**: su título quedó en la hoja del encabezado y la tabla siguió en la
otra sin encabezados. Medido, la hoja 1 pasó de 479 a 1132 glifos y la 2 de
1366 a 740.

La regla correcta sale de esa medición:

- una card que **ABRE hoja** (`.scout-pagina`) ya arranca arriba de todo, así
  que `avoid` no la puede mover a ningún lado mejor. Lo único que consigue es
  que la tabla salte entera y deje la hoja a medias → **`auto`**;
- una que **SIGUE a otra** —la matriz, el resumen, las claves— sí se
  beneficia: `avoid` la baja completa a la hoja siguiente en vez de partirla,
  que es el maquetado medido del punto 7.2 bis → **se queda como está**.

Alcanza a las cinco que crecen con el plantel: marcas, jugadores clave,
resto, fichas y quintetos.

### La fila es el jugador, y es lo único que no se corta

```css
html.modo-scout-print .scout-card.scout-pagina:has(table)      → break-inside: auto
html.modo-scout-print .scout-card.scout-pagina .scrollbox      → auto !important
html.modo-scout-print .scout-card.scout-pagina > .scrollbox > table → auto !important
html.modo-scout-print .scout-card.scout-pagina table > tbody > tr   → avoid !important
html.modo-scout-print .scout-card.scout-pagina > h4, > p       → break-after: avoid
```

Con la fila atómica el corte cae **siempre entre dos nombres**, que es lo que
pidió el club. El `<thead>` se repite arriba de cada hoja por la regla
general (`display: table-header-group`), así que la tabla de la segunda hoja
no queda sin encabezados — es la misma maquinaria del `<tfoot>` del punto 51.

**El `h4` no estaba en la regla general de `page-break-after`** —que enumera
h1, h2, h3 y h5— y los títulos de las cards de scouting son justamente h4.
Con la card partible, sin eso un título podía quedar solo al pie de una hoja:
el mismo defecto con otra cara.

### Medido, antes y después (mismo cruce, misma versión del resto)

```
hoja      1      2      3      4        5        6      7      8
antes    479   1366   1850   2885     540 ←   8525   2766    726
después  479   1366   1850   2885    7761     1390   2766    726
```

Seis hojas **idénticas** y las dos de marcas dadas vuelta: la que estaba
vacía ahora se llena y la otra se queda con lo que no entró. Ocho hojas antes
y ocho después.

Y leído, que es lo que importa: la hoja 5 trae **siete jugadores completos**,
la 6 arranca con el encabezado repetido y el octavo entero, y **ningún**
**jugador aparece en las dos** — o sea que no quedó una fila partida.

### Lo que hay que respetar al tocarlo

- **La medición se hace con `Emulation.setEmulatedMedia: print`.** Sin eso se
  miden los altos de PANTALLA y la card de marcas parece entrar.
- **`avoid` en una card que abre hoja no protege nada**: si se lo vuelve a
  poner, vuelve la hoja en blanco.
- **Una fila más alta que la hoja se parte igual**, y ahí no hay CSS que
  valga. Hoy la más alta mide 123px contra 1028 de hoja.
- **El heredoc de este entorno se come las barras invertidas**: los scripts
  con expresiones regulares se escriben con la herramienta de archivo, no
  con `<<EOF` (el CLAUDE.md ya lo decía por el carácter «═»).

---

## 129. LA FICHA EN PDF A ELECCIÓN · CARDS Y SUB-CARDS, Y EL PACK PLANTEL (2026-10-18)

Pedido del club: elegir de a una las cards y sub-cards de la ficha del
jugador, y bajar el plantel entero en un solo PDF. Assets en `?v=288`.
`test-ficha-pdf.js` fija todo lo de acá.

### La lista sale de las marcas del render real, no de memoria

Cada bloque de la vista lleva `data-subcard="<pestaña>.<id>"` en su render:

| Pestaña | Sub-cards (dónde se marca) |
|---|---|
| General | `adn` · `sintesis` · `condicion` · `kpis` · `uso` · `pases` · `tablas` (`jugadoresTabGeneral`) |
| Tiro | `distribucion` · `carta` · `graficos` (`jugadoresTabTiro`); `mapa` · `reloj` · `reloj-franjas` (`SGADD_PBP.jugador` / `relojJugador`, solo con la capa) |
| Evolución | un gráfico por métrica (las 14 de `JUGADORES_METRICAS_EVOLUCION`) |
| Partidos | el log entero, **destildado por defecto** (había salido de la hoja por repetir la evolución; vuelve como opción) |

`SGADD_FICHA.estructura()` las declara con su nombre, y los nombres de las
pestañas y de las cartas salen de `JUGADORES_TABS` y `JUGADORES_CARDS_REF`.
**El test lee las marcas del fuente y las compara contra la estructura en
los dos sentidos**: un bloque nuevo sin marca, o una marca sin declarar,
rompe la suite. Los grupos llevan `data-subcard-de="a b"` y se quitan
enteros si ninguno de sus hijos quedó (no queda la grilla vacía); el
contenedor del play-by-play declara sus tres hijos, así que con los tres
destildados ni se pide el paquete. Las marcas no cambian nada en pantalla.

### La poda · se QUITA, no se esconde

`podarHtml` (puro, sobre el texto del mismo `jugadoresTab()` de la
pantalla, con los `<div>` anidados balanceados) y `podarDom` (lo que el
play-by-play monta después, tras esperarlo). Lo destildado no deja hueco.
Una marca que no está declarada se conserva. Destildar una sección arrastra
a sus sub-cards; una sección entra si tiene algo adentro. La selección se
recuerda entre aperturas.

**La evolución ya no abre hoja.** Con el corte fijo, cada vez que Tiro
terminaba a mitad de carilla quedaba media hoja en blanco: medido en el PDF
real del pack (Chrome headless, 4 jugadores de la demo), **20 hojas → 16**.
El título va pegado a su primer gráfico. El bloque del play-by-play tampoco
va entero (ahora mide más que una hoja): no se parte cada mapa.

### Pack PLANTEL · un solo PDF

Botón «🖨 Pack PLANTEL» en el plantel de Jugadores (con un equipo elegido).
Un modal de tres pasos: **1 · Cards** (el mismo árbol), **2 · Jugadores**
(checklist por minutos, con «Todos», «Ninguno», «Titulares» y «Sustitutos»),
**3 · Generar**. Sale `Plantel <Equipo>.pdf`; cada jugador arranca en una
hoja nueva (`.ficha-jugador + .ficha-jugador`), y una pestaña sin datos de un
jugador se saltea en SU ficha.

- **Titulares y Sustitutos solo con el dato** (`porTitularidad`): titular =
  arrancó la mitad o más de SUS partidos según la columna TITULAR (punto 97).
  Sin el dato el jugador no es ni una cosa ni la otra, y sin dato en la
  planilla los dos atajos quedan apagados y lo dicen: el motor no infiere
  titularidad (punto 8). La demo no lo trae.
- **Los gráficos de varias fichas no se pisan**: `SGADD_CHARTS.conPrefijo(p, fn)`
  hace que lo encolado dibuje en `p + id`, y `prefijarCanvas` renombra los
  `<canvas>` de esa ficha. Medido: 16 jugadores, 15 gráficos, 15 ids
  distintos y los 15 dibujados.
- El guard de `puedeVerEquipo` vale también acá: en la demo (cliente de
  EQUIPO 1) el pack de otro equipo no se arma.

Verificado en el navegador sobre la demo: ficha individual (destildar Tiro
arrastra sus sub-cards, `kpis` fuera, el log adentro, archivo «Jugador 15») y
pack completo. El PDF real se generó con Chrome headless y se leyó hoja por
hoja con `pdftotext`.

---

## 131. EL INFORME DEL EQUIPO EN PDF A ELECCIÓN · CARDS, SUB-CARDS Y ATAJOS (2026-10-19)

El botón «Generar informe PDF» de Equipos pasa al modelo de la ficha del
jugador (punto 129). Assets en `?v=290`. `test-equipo-pdf.js` fija todo.

### Las marcas y la estructura

Cada bloque de las pestañas del equipo lleva `data-subcard="equipo.<pestaña>.<id>"`
(y `data-subcard-de` en las grillas de dos): `sgadd-equipos.js` (General,
Ofensiva, Defensiva, 4 Factores, Local/Vis., Personalidad, Plantel),
`sgadd-pbp.js` (Quintetos: las secciones de `html()` por la opción
`subcard` de `seccion()`; Mapa de tiro: el mapa y las cuatro piezas del
reloj) y la ficha general en `sgadd-informe.js`. `SGADD_INFORME.estructura()`
declara 12 secciones con sus sub-cards y el test compara las dos listas en
los dos sentidos.

- **El prefijo `equipo.` las separa de las de la ficha del jugador**, que
  viven en los mismos archivos: `test-ficha-pdf.js` las ignora.
- **Quintetos y Mapa de tiro solo con la capa `pbp`**: sin ella van
  deshabilitadas en el árbol, con el motivo (`x.motivo` en `arbolHtml`).
- **El insight de la Personalidad arranca destildado**: el informe ya lo
  abre arriba y salía dos veces.

### El modal, la poda y los atajos

El árbol es el MISMO `SGADD_FICHA.arbolHtml` y la poda la MISMA
`podarHtml`/`podarDom`, que ahora también quita en el DOM el grupo que se
quedó sin hijos (el bloque del reloj sin ninguna pieza no deja el título
suelto). Lo del play-by-play se poda después de montarlo y antes de embeber
e imprimir. Atajos (`ATAJOS`, `seleccionAtajo`, puros): **Informe
completo**, **Solo Tiro / Mapa** (Ofensiva + Mapa de tiro) y **Solo
Quintetos / Rotación** (Quintetos + Plantel). La selección se recuerda.
El guard de `puedeVerEquipo` vale en `abrir` y en `generar`.

### El papel · medido con el PDF real (demo, A3 apaisada, Chrome por CDP)

```
                    HEAD   ahora
por defecto          10      9   el radar de Personalidad ya no queda solo
informe completo     20     18   sin una hoja con solo un título o una nota
Solo Tiro / Mapa      5      4   la portada ya no queda sola
```

- **`.informe-bloque` se parte en este informe** y lo que no se parte es
  cada sub-card (menos las del play-by-play, que traen sus piezas): con el
  `avoid` general una sección larga saltaba entera y dejaba la hoja de
  antes vacía. Partidos se parte por filas. Es el modelo del punto 65.
- **Los dos radares de 4 Factores van juntos** (solo ese par: con la regla
  para todos los pares el completo crecía una hoja).
- **Identidad + rasgos + radar de la Personalidad entran en una hoja**: se
  comprimen sus aires en el papel y la caja de ese radar baja a 82 mm. Le
  faltaban ~25 pt; con una frase de identidad más larga puede volver a no
  entrar.
- **No medido con la capa `pbp`**: la demo no la tiene. Las marcas se
  verificaron sobre un paquete real de la ingesta (`html` y `mapaCard`).

---

## 141. CONCLUSIONES CLÍNICAS, EQUIPOS EN BENTO Y LA TERNA DEL PDF (2026-10-26)

Assets en `?v=308`. `test-conclusiones.js` fija todo.

### La card «🩺 Conclusiones para el cuerpo técnico» · `js/sgadd-conclusiones.js`

Va arriba de las pestañas de la ficha de EQUIPO (`equiposConclusiones`) y de la del JUGADOR (`jugadoresConclusiones`). Tres ejes en columnas, cada ítem con valor, percentil, liga y la frase para el DT:

```
▲ Lo que se hace bien y hay que sostener   percentil ≥ 70
● Ajustes alcanzables                       percentil 40-69, SOLO variables entrenables, primero las de más margen
▼ Puntos de quiebre                         percentil < 40, y los detectores del play-by-play
```

- **El percentil ya trae la dirección** (`idx.leer`): perder menos pelotas es estar arriba. El ritmo y el reparto del tiro no se juzgan (punto 4).
- **El jugador se mide con las métricas de SU función** (`POR_EJE`, por el `eje` del rol funcional, punto 46): a un ancla no se le juzga la creación. Sin percentil (no califica) no se juzga y la card lo dice.
- **Con la capa `pbp`, un bloque «Micro-momentos del play-by-play»** llega a su ranura (`SGADD_PBP.espacioConclusiones`, tipo `conclusiones` de `montarPendientes`; un fallo la deja vacía):
  - **Tipos de posesión**: transición (0-7 s), juego armado (8-17 s), final del reloj (18-24 s), segunda oportunidad tras rebote ofensivo y reinicio tras falta, calificados de Excelente a Muy pobre por puntos por tiro contra la liga en esa situación (ajustado con 20 tiros de liga, ±0,06 y ±0,12, 20 tiros mínimos).
  - **Trampa de media distancia**: Z5-Z9 con 30 tiros o más, 1,3 veces la parte de la liga y −0,05 o peor; si rinde +0,06, es un arma.
  - **Hemorragia por pérdidas vivas**: el TCDP del equipo (suma de `rendimiento.jugadores[].pp`) en el cuarto alto de la competencia.
  - **Cierres ajustados** (`clutch.equipo`, ±10 con 5 partidos) y **bonus de faltas** (`faltasEq`).
  - Del jugador: las fichas con tono de su card de Rendimiento (On/Off, Pts/tiro, TCDP, IDE).

### Lo que el dato NO permite, y por eso no está

Documentado acá y no en la card (pedido del club: sin autocrítica en pantalla):

- **Play types de Synergy** (pick & roll, aislamiento, poste, spot-up): el play-by-play no los registra. Se usan las situaciones que sí registra (reloj y origen).
- **«Colapso en pick & roll»**: sin el tipo de jugada no se puede detectar.
- **Filtro de garbage time**: los agregados vienen armados de la ingesta; filtrar los minutos con +25 de diferencia es trabajo de `motorstats-ingestion`.

### Equipos en Bento

La cabecera y los indicadores de General, Ofensiva, Defensiva y las vistas usan fichas Bento con el semáforo clínico (`SGADD_CONCLUSIONES.fichasEquipo` vía `equiposFichas`): valor, liga, puesto y percentil; ritmo y reparto en azul informativo; muestra corta con `~` y sin color. Los gráficos y las tablas no cambiaron. La nota metodológica de Defensiva pasó a «Lectura detallada». El informe PDF del equipo suma la sub-card `equipo.ficha.conclusiones`. **No se hizo**: la ficha del jugador en PDF no lleva la card.

### La terna del encabezado PDF

`SGADD_UI.encabezadoInforme(ctx)`: **liga · equipo · MotorStats**, en una sola línea (`.cabecera-terna`, logos de 7 mm de alto con su proporción). `contextoEncabezado(contenedor, equipo)` la arma: la liga sale de **`_liga` en `logos/<liga>/index.json`** (no entra al mapa de escudos; `LOGOS.urlLiga()`), y sin archivo va el nombre del torneo; el equipo, el que pasa cada exportación (informe → el equipo, ficha y pack → su equipo, ranking → el plantel, fichajes → el del jugador) o el propio del club. **Cargados el 2026-10-26** (v308): LAB y LNB de laliganacional.com.ar (`liga.png`), Bahía de abbasquet.com (`liga.png`, 250×50) y APdeB (`apdb.png`, que ya estaba). Una liga nueva suma su archivo y `"_liga"` en su manifiesto. **No verificado en un PDF real**: la terna solo se dibuja al imprimir.

## 142. LA SOLAPA DIAGNÓSTICO, LA TERNA ARREGLADA Y EL PAPEL SIN CARDS PARTIDAS (2026-10-26)

Assets en `?v=309`.

### Diagnóstico es una solapa

Las conclusiones clínicas del punto 141 dejan de ir arriba de las pestañas.
Jugadores: **General · Diagnóstico · Tiro · Rendimiento · Evolución ·
Partidos** (Rendimiento sigue exclusiva de la capa `pbp`). Equipos:
Diagnóstico va después de General. Los dos `switch` llaman a
`jugadoresConclusiones` / `equiposConclusiones`, que no cambiaron (la ranura
del play-by-play se monta igual). La ficha en PDF suma la sección
`diagnostico`, entera y tildada; el informe de equipo conserva
`equipo.ficha.conclusiones`.

### La terna del encabezado

- **El logo de la liga salía roto** («CONFERENCIA NOR», el `alt` cortado): el
  encabezado nace al imprimir y esa imagen no estaba cargada, así que
  `embeberImagenes` la salteaba. Ahora `cargarManifiesto` la **precarga**, y si
  igual falla se esconde y aparece su nombre (`onerror`, con el nombre oculto
  al lado). El `alt` va vacío.
- **Liga y equipo juntos a la izquierda** (`.cabecera-origen`, separados por
  un filete) y MotorStats a la derecha. Los tres logos con **un solo alto**
  (`--cab-h: 5.5mm`), su proporción y sin partir la línea.

### El papel

Bloque «PAPEL SIN CARDS PARTIDAS» en el `@media print` de `.rend-*`: no se
parten `.rend-card`, `.rend-ficha`, `.rend-alerta`, los ejes e ítems de las
conclusiones, los mapas ni los gráficos; y el Bento vuelve a dos columnas en
papel (su regla de 768 px es solo `screen`) con aires y cuerpos chicos. Se
esconde el «Lectura detallada» (el contenido sale igual). La `@page` vertical
pasa a 9 mm arriba y a los lados (los 15 mm de abajo no se tocan) y
`.informe-bloque` a 6 mm de separación.

Medido con el PDF real sobre la demo (Chrome por CDP): informe de equipo
completo **21 → 17 hojas A3**; ficha del jugador **5 → 5** sumando el
Diagnóstico. **No medido con la capa `pbp`** (Tiro con mapa y Rendimiento):
la demo no la tiene; el ~11 hojas del pedido depende de esa ficha.

`test-fichajes.js` buscaba un `
` literal en `index.html`, que tiene CRLF en
ese tramo: pasó a `
?
` (la trampa del punto 51).

## 152. EL LOGO DE LA LIGA EN LOS PDF · GitHub Pages NO SIRVE ARCHIVOS CON «_» (2026-10-27)

Assets en `?v=321`. Reportado: en la cabecera `Logo-Liga | Logo-club` del PDF el logo de la liga solo salía con APdeB.

**Causa medida, no del código:** el resolvedor ya era genérico (`_liga` en `logos/<liga>/index.json` → `LOGOS.urlLiga()`). Los archivos se llamaban `_liga.png` y **GitHub Pages (Jekyll) no publica archivos que empiezan con `_`**: `…/logos/liga-nacional/_liga.png` daba **404** y `…/la-plata/apdb.png` daba 200. Por eso solo se veía APdeB, el único con nombre sin guion bajo. En local (python http.server) andaba, y por eso no se vio.

**Arreglo:** los tres archivos pasaron a `liga.png` (Bahía Blanca, Liga Argentina, Liga Nacional) y sus manifiestos lo apuntan; la clave JSON sigue siendo `_liga` (es solo una clave, no un archivo). Si un logo no carga, el encabezado ya esconde la imagen y muestra el nombre del torneo (`onerror`), sin romper el layout.

**Test:** `test-logos.js` recorre todos los `logos/*/index.json` y exige que el archivo de `_liga` exista y no empiece con `_` ni `.`. Una liga nueva sube su logo con un nombre normal (`liga.png`).

---

## 153. ROTACIONES DENTRO DE QUINTETOS Y LOS MAPAS POR FRANJA, UNO POR HOJA (2026-10-27)

Assets en `?v=322`.

- **Rotaciones · minuto a minuto ya no es una card de Scouting**: pasó a sub-card (minimizada, como las otras dos) de la card «🔁 Quintetos, cierre, rotaciones y clutch», entre «Últimos 5 partidos · inicial contra cierre» y «Quién decide los finales». Se fue `data-bloque="pbp-rotaciones"` y su opción del modal; `rotacionesCard` y el tipo `rotaciones` de `espacio()` siguen exportados pero ya no los usa Scouting. Sale solo con el paquete v2 que trae `rotaciones`.
- **Mapas por franja en el papel** (CSS `@media print` junto a `.pbp-reloj-pieza`): «Desde dónde tira en cada franja · el mapa completo» abre hoja con la franja 0-7 s, y cada franja siguiente también arranca hoja nueva; el título de cada una (`summary` y su lectura) va pegado a su mapa (`break-after: avoid`), nunca solo al pie de la hoja anterior.
- Tests: `test-pbp.js` (rotaciones dentro, cerrada y en su lugar; las reglas de papel). **No medido en un PDF real** (la demo no tiene la capa `pbp`).

---

## 154. LAS FOTOS DE LOS JUGADORES EN EL PDF DE SCOUTING (2026-10-27)

Assets en `?v=324`. Reportado: en el PDF de Scouting las fotos salían como cuadros grises. `torneoImagenJugador` las pinta con `loading="lazy"`: las que están fuera de pantalla no se piden hasta scrollear, y al imprimir el navegador no las espera. `scoutImprimir()` ahora llama a `scoutCargarFotos()` —pasa a `eager` las imágenes de `#scoutInforme` y espera a que bajen, con techo de 6 s— antes de abrir el diálogo. Una foto que no carga sigue cayendo a su escudo (`onerror`). Las fotos son de otro dominio (la liga), así que no se embeben como `data:`; se imprimen por su URL. Sin verificar en un PDF real con fotos.

---

## 155. EL PACK PLANTEL, UNA FICHA POR HOJA (2026-10-28)

Assets en `?v=324`. En el pack con la capa `pbp`, la ficha de cada jugador salía en dos hojas: cabecera y tarjetas arriba, y el mapa de tiro entero en la siguiente, con su título solo al pie de la primera. **Causa:** `.rend-card` trae `break-inside: avoid !important` y la card del mapa (mapa + diagnóstico de cuatro tarjetas) mide más que lo que queda de la hoja 1, así que bajaba entera.

- `.mapa-pbp-jugador` se parte ENTRE piezas (`auto !important`); lo que no se parte es cada mapa y cada tarjeta.
- Dentro de `.ficha-jugador` (pack): aires de 2,5 mm entre bloques, títulos y tarjetas más chicos, mapa al 36 % del ancho (su alto sale del ancho) y diagnóstico compacto. La pregunta de la sección va pegada a su contenido; la ficha lleva `break-inside: avoid`, que se ignora si no cabe.
- **Medido con el PDF real** (Chrome por CDP, demo + paquete real de la Conferencia Norte inyectado, solo «Mapa de tiro · zonas»): antes la ficha medía 1052 px y partía en dos hojas. Lo más alto eran la tabla de las 14 zonas (390 px contra 232 del dibujo) y la tarjeta de identidad (272). Con filas y tarjeta compactas, sin la «Lectura detallada» (en papel se abre sola), sin la pregunta de la sección ni el título interno de la card, la ficha mide ~890-905 px (el alto útil de la A4 es ~1030): **cada jugador con mapa ocupa una hoja y la primera comparte hoja con el membrete**; 16 jugadores → 16 hojas.
- Tests: `test-ficha-pdf.js` (4). Para repetir la medición hace falta un paquete con `partidosPbp` y renombrar sus jugadores a los de la demo.

---

