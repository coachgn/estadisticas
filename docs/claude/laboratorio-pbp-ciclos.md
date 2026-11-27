# Laboratorio, play-by-play y ciclos

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 62. LA CAPA DE LABORATORIO · play-by-play de Jujuy (2026-09-14)

Quintetos, dúos y tríos, quinteto inicial y de cierre, clutch y mapa de tiro
calibrado, **de los 17 equipos de la Conferencia Norte 25/26**, para que Jujuy
lo pruebe antes de que sea producto. `test-pbp.js` fija todo lo de acá.

### Los datos NO salen del libro

Los arma `motorstats-ingestion` (en `Documents`, fuera de los dos repos) desde
el play-by-play oficial de Gesdeportiva, partido por partido, y **solo entra un
partido que valida**:

- cinco jugadores en cancha en todo momento;
- minutos jugador = 5 × tiempo de juego;
- marcador del PBP = marcador oficial.

Fase regular: 266 de 272 partidos validan; Jujuy, 32 de 32. Los 6 excluidos
(marcador oficial distinto, o un cambio mal cargado) viajan en el paquete con
su motivo.

```
motorstats-ingestion/exportar-web.js       → web/<equipo>.json   (~105 KB c/u, esquema @3)
server/bin/pbp.js subir [--confirmar]      → Upstash · sgadd:pbp:<club>:<categoría>
GET /api/v1/pbp/:club/:categoria?equipo=   → js/sgadd-pbp.js
```

### Una CAPA, no un plan

Se declara como `categorias[slug].laboratorio: ["pbp"]`, con el vocabulario
cerrado de `SGADD_AUTH.CAPAS_LABORATORIO`:

- **Por categoría y sin herencia del club**: una prueba se abre de a una.
- **Una capa desconocida se rechaza** al escribirla —un typo dejaría la prueba
  apagada sin que nadie lo note— y se ignora al leerla.
- **Vacío borra el campo**: la categoría vuelve a ser exactamente la de antes.
- `catalogo.js laboratorio --club --categoria --capas pbp` pasa por
  `mutar.aplicar` (`cambiar_laboratorio`, con alcance solo `club`).
- **Pasar a producto** es mover la regla de `laboratorio` a `plan`. No hay otro
  lugar que tocar.

### Dónde vive el guard

En `server/rutas/pbp.js`, con archivo propio y hash propio: fuera del catálogo,
como los estados del punto 57. **Solo lee**; escribir es tarea del CLI.

- **Un cliente** lee solo categorías de SU club, activas y con la capa. Dentro
  de esa categoría puede pedir **cualquier equipo**, porque el análisis de un
  rival es justamente el scouting que la capa prueba.
- **El admin pasa sin la capa**, para revisar los datos antes de habilitarla.
- **Pide un solo campo** (`HMGET`). Con Upstash caído contesta 503, nunca «no
  hay datos».

`/equipos` declara `alcance.capas`, y el panel muestra dos cosas solo si la
capa viene ahí:

- la **pestaña Quintetos** en la ficha del equipo;
- la **card del rival** en el informe de Scouting.

**Sin la capa no aparecen, ni siquiera grises**: le dirían a cada club que le
falta algo que no existe para él. La pestaña y la card pintan un lugar vacío, y
`SGADD_PBP.montarPendientes` pide el paquete después de pintar la sección.

### Lo que hay que respetar al tocarlo

- **NET por posesión primero.** PLAYS no descuenta el rebote ofensivo, así que
  castiga al quinteto que gana el cristal. El titular de Jujuy, en la fase
  regular (32 partidos, 80 rebotes ofensivos contra 36), da +36 en cancha,
  −2,2 por PLAYS y **+7,6 por posesión**; con la postemporada (37 partidos),
  +42, −1,4 y +8,5. **Desde el punto 66 se muestra UNA sola**: la columna
  NET/plays se fue de la tabla de quintetos, porque ninguna vista del panel
  muestra ya un rating por play. El `netRtng` sigue viajando en el paquete.
- **La muestra corta se marca, no se borra** (punto 4): va con `~` y atenuada.
  Es muestra corta un quinteto con menos de 15 minutos juntos, un trío con
  menos de 40 y un dúo con menos de 60.
- **Todo lo del paquete se escapa**: los nombres vienen de un sitio de
  terceros.
- **Clutch** son los últimos 5 minutos del 4.º cuarto o del suplementario, con
  diferencia de 5 o menos medida **antes** de cada acción. Usos = PLAYS del
  motor.
- **Coordenadas de tiro:** son porcentajes de un SVG de 640 × 380 que la página
  dibuja inline. La calibración toma el aro como origen y fija el arco en
  6,75 m y la esquina en 6,60 m; con eso el 99,9 % de los triples queda detrás
  de la línea FIBA.

### El paquete @2 · mapa contra la liga, táctico, rotaciones y momentum

Pedido del 2026-09-14. `exportar-web.js` pasó a
`analitica-pbp-web@2` (motor en `motorstats-ingestion/src/pbp/avanzado.js`,
con sus invariantes en `test/test-jujuy-pbp.js` sección 9). Todo lo de @1
sigue igual: `server/bin/pbp.js` acepta los dos y **no los mezcla** (los 17
paquetes llevan la misma vara de la liga), y `SGADD_PBP.html` pinta un @1 sin
las secciones que no tiene.

**Las secciones son `<details>`**: abiertas de entrada Quinteto inicial y de
cierre, Quintetos, Clutch y el Mapa; cerradas Táctico, Rotaciones, Cuartos y
momentum, Lo que le tiran y el Diagnóstico (abierto en Scouting). Al imprimir
se abren todas (`beforeprint`) y se devuelven como estaban. Toda celda
numérica lleva `whitespace-nowrap`: el «8-/7» de la captura era un G-P
partido en una columna angosta.

**El mapa** (`SGADD_PBP.mapa`, puro) tiene dos vistas —hexágonos de 0,8 m y
las 14 zonas de la plataforma, embebidas en metros— y dos métricas:

- **Eficiencia**: color divergente por **puntos por tiro** contra la liga en
  ese lugar (±0,3 satura). **No por %**: un hexágono al borde del arco mezcla
  dobles y triples. La vara del hexágono es la liga ahí si tiró 15 o más; si
  no, su familia de tiro dominante; y el tooltip dice cuál usó. El tamaño del
  hexágono es el volumen.
- **Frecuencia**: intensidad del acento del club por porción de los tiros.

**La tabla de zonas y la cancha se enlazan en los dos sentidos** con
`.pbp-activa`, por delegación en el bloque (`SGADD_PBP.activar`), así un
cambio de vista reemplaza el mapa entero sin reenganchar nada. Hover o foco
enciende; un toque **fija** hasta el siguiente. En la vista de hexágonos los
polígonos de zona van arriba —son los que se enlazan— y el tooltip busca con
`elementsFromPoint` el hexágono de abajo para decir los dos. La izquierda del
atacante queda a la izquierda del dibujo, con el aro arriba (hay un test).

**Jugadores → Tiro** suma el mapa del jugador (`espacioJugador`, se busca por
nombre normalizado; con menos de 15 tiros de campo no se dibuja). Va con
`.no-imprimir`: el PDF de la ficha reusa el tab y no espera un pedido.

**Táctico**: quintetos que pierden por posesión, con **dónde** falla —ataque o
defensa, contra el promedio de SUS quintetos con muestra ponderado por
minutos—; los que más ganan; y dúos y tríos con diferencial positivo para dar
más minutos juntos. Últimos 5 partidos: inicial contra cierre con su +/-.
**Rotaciones**: % de partidos en cancha minuto a minuto (sin `<title>` por
celda: 480 celdas pesaban más que el resto del bloque). **Cuartos**: puntos,
diferencia, G-E-P y los últimos 5; **momentum**: corrida máxima, parciales de
8+ y los mayores parciales con cuarto de inicio y de fin.

**Diagnóstico**: radar de 7 familias de tiro, ataque y defensa sobre la liga,
con «zonas a explotar» y «dónde le tiran con eficiencia» (exige 30 tiros, 3 %
del volumen y 5 % sobre la liga). **En Scouting** la card pasa el otro lado del
cruce (`data-pbp-propio`, la regla de oro del punto 9, nunca
`esEquipoPropio()`) y suma **atacar ahí / cerrar ahí**: familias donde uno
rinde por encima de la liga y el otro concede por encima de la liga.

El CSS va a mano en el `<style>` (nodos inyectados) y el hover solo en
`@media screen` (punto 59). Medido en una vista previa con los paquetes
reales: a 1280 px el mapa mide 448 px con la tabla al lado y ninguna celda de
G-P parte de línea; a 375 px no desborda nada fuera de los `.scrollbox` y los
conmutadores miden 44 px.

### @3 · el mapa es su propia card, con geometría medida y diagnóstico sobre la cancha

Pedido del 2026-09-15, con capturas del mapa @2: los polígonos de zona
dibujaban triángulos que cruzaban la cancha y los hexágonos se salían del
borde. Motor en `motorstats-ingestion/src/pbp/avanzado.js`
(`zonaGeometrica`, `GEOMETRIA`) y sus invariantes en
`test/test-jujuy-pbp.js` sección 9.

**Las 14 zonas son GEOMETRÍA MEDIDA, no los polígonos de la plataforma.** Los
del SVG de la página de partido vienen recortados a mano. Midiendo los 34.643
tiros de campo de la conferencia, la plataforma zonifica con círculos y rayos
desde el aro:

```
Z1 bajo el aro      < 2,35 m
Z2-Z4 corta         2,35-4,8 m · frontal ±31°
Z5-Z9 media         4,8 m hasta la línea · frontal ±18° · fondo desde 53°
Z10-Z14 triple      detrás de la línea FIBA · frontal ±18° · esquina desde 71°
```

Con esos números, **el 97,9 % de los tiros cae en la misma zona que etiqueta
la plataforma**; el resto son coordenadas cargadas en la mitad equivocada
(un «bajo el aro» a 17 m). Los parámetros viajan en `liga.geometria` y la web
dibuja con ellos: `GEOMETRIA` en `sgadd-pbp.js` es solo el respaldo. Cada
zona es un sector entre dos rayos y dos radios, y lo que se sale de la media
cancha lo recorta un `clipPath` —con id único por mapa— que también recorta
los hexágonos (y se dibujan solo los de centro dentro de la cancha).

**Card propia.** Equipos tiene la pestaña **Mapa de tiro** (`pbp-tiro`) y
Scouting la card `pbp-tiro`, las dos con la misma capa. La card de Quintetos
queda con clave, quintetos, rotaciones, cuartos, clutch y **el motor táctico al
final**. `espacio(equipo, contexto, propio, tipo)` elige cuál monta.

- **Perspectiva**: «Lo que tira» / «Lo que le tiran» en la misma card. Abre en
  **zonas** (no hexágonos) con el diagnóstico visible.
- **C/I impreso en cada zona**, con trazo oscuro detrás para leerse sobre
  cualquier color; en hexágonos solo el de la zona activa. Las etiquetas de
  las esquinas se ubican a mano —la media de fondo y la esquina de triple se
  pisaban— y solo si el punto sigue dentro de su zona (hay test).
- **Círculos y cruces**: al pasar o tocar una zona (fila o polígono) se dibujan
  sus tiros, convertidos y errados (`capaTiros`, pura). Viajan en
  `tiros.detalle.puntos` como `[lateral×10, fondo×10, convertido, zona,
  tirador]`, y **solo los tiros cuya posición redondeada cae en la zona que
  etiquetó la plataforma** (1 % queda afuera, contado en `sinUbicar`): un «bajo
  el aro» a 17 m se cuenta en la tabla pero no se dibuja en mitad de cancha.

**El diagnóstico va SOBRE la cancha** (contorno + insignia, el mismo color en
la tabla y en la lista), y todo se **ajusta por muestra** antes de comparar:
`(puntos + 20·liga) / (tiros + 20)` para el equipo, K = 10 para un jugador.
Así un 0/3 queda cerca de la liga y un 1/8 bastante más abajo — el caso que
pidió el club, con test.

- **Lo que tira** (`diagnosticoZonas`): ★ la zona a EXPLOTAR (mayor ventaja
  ajustada contra la liga, 20+ tiros); ↑ 2 zonas de MEJORA (las que más suben
  el PPT del equipo si reciben tiros, 10+); ✕ hasta 3 zonas a EVITAR (menos del
  5 % del volumen) o CORREGIR (con volumen), ordenadas por puntos perdidos
  contra lo esperado.
- **Lo que le tiran**: 1-2-3, las zonas CRÍTICAS que libera la defensa, por
  puntos concedidos de más.
- **Scouting**: el cruce «atacar ahí / cerrar ahí» pasó de familias a zonas.

**Jugadores → Tiro** (`diagnosticoJugador`) suma debajo del mapa: **picos de
rendimiento**, **puntos a explotar** (rinde sobre la liga con poco volumen),
**criterios de ajuste** (mucho volumen con acierto apenas de liga) y **puntos
de fuga**, sobre volumen por zona (intentos por PJ; el paquete trae los PJ con
minutos de cada tirador) y acierto por zona contra la liga en esa zona.

Medido en la vista previa con los paquetes reales: a 1280 px el mapa mide
448 px; a 375 px no desborda nada, los conmutadores miden 44 px y el C/I se
lee a 10 px.

**Y en Personalidad el eje dice «Juego colectivo»**, no «juego coral». Hay un
test que recorre `js/` y falla si la palabra vuelve.

### Sub-cards cerradas y la card de Scouting acotada (2026-09-18)

- **Toda sección de la card de Quintetos arranca CERRADA** y se dibuja como
  sub-card (`.pbp-detalle:not(.pbp-sub)`: borde, fondo tenue y encabezado de
  44 px). El DT abre la que quiere; la página deja de ser eterna. Al
  imprimir se siguen abriendo todas (`beforeprint`).
- **En Scouting la card de Quintetos muestra solo tres sub-cards**:
  «Últimos 5 partidos · inicial contra cierre», «Clutch» (el resumen del
  equipo) y «Quién decide los finales» (la tabla de usos). Lo decide
  `html(paq, { contexto: 'scouting' })`; el contexto viaja en
  `data-pbp-contexto` y lo lee `montarPendientes`. En Equipos, el clutch
  sigue en una sola sección.
- **La columna `TC` de esa tabla lleva `data-glosa`** («Tiros de Campo
  (Convertidos / Intentados)»), y `T3`/`TL` la suya: en el glosario del motor
  `TC` es «Tapones cometidos» (misma trampa que `PP`, punto 33).
- **En Scouting el mapa queda FIJO** en Lo que tira · Zonas · Eficiencia vs
  liga, sin conmutadores (`mapa(paq, { fijo: true })`, que pisa cualquier
  otra opción que mande un llamador). El diagnóstico va siempre, y cada
  lista dice cómo la lee el DT contra el rival: las zonas a explotar son
  las que nuestra defensa tiene que cerrar, y las ineficientes las que puede
  flotar o liberar (`LECTURA_SCOUTING`, texto visible y en el `title`).
- **En Equipos, Partidos pasó a ser la ÚLTIMA pestaña**, después de Mapa de
  tiro.

---

## 83. EL BLOQUE `secciones` DEL PAQUETE DE LABORATORIO (2026-10-02)

`motorstats-ingestion` suma al paquete `@3` un campo OPCIONAL `secciones`
(`secciones-web@1`, ~8 KB). Sale de la ficha del equipo en el sitio de la
competencia y del último partido del play-by-play validado:

- estadísticas del equipo;
- mediana y puesto en 13 métricas contra los equipos bajados;
- tabla de jugadores;
- top 3 de líderes;
- tabla del grupo;
- avisos.

**Sigue siendo `@3`, no un `@4`**: `server/bin/pbp.js` acepta de `@1` a
`@3`, y un campo de más lo ignora cualquier versión vieja del panel.
Medido sobre los 17 paquetes de la Conferencia Norte: sin el bloque, son
idénticos a los publicados antes, y pasan el validador en modo de prueba.

`js/sgadd-pbp.js` lo pinta con `bloqueSecciones(paq, contexto)`, al final
de la card de Quintetos:

```
Equipos    tablero contra la competencia · líderes y último partido · jugadores · tabla
Scouting   las tres primeras, sin la tabla
```

### La regla es la retrocompatibilidad

- **Sin el bloque, la card es BYTE A BYTE la de antes.** El test saca el
  bloque del HTML y exige que quede igual a la card sin `secciones`, en
  los dos contextos.
- **Un bloque roto no se cae ni pinta cards vacías**: cada pieza se dibuja
  solo si su dato tiene la forma esperada (`esObjeto`, `lista`, `esNum`).
  Todo va adentro de un `try`: una excepción (hay un test con un getter
  que tira) devuelve `''` y los quintetos salen igual.

### Lo que hay que respetar al tocarlo

- **El puesto se DICE** («2.º de 17»): el tinte por tercio (`mm-pos` /
  `mm-neg`) acompaña, no informa solo (punto 14). En pérdidas y faltas el
  1.º es el que MENOS tiene, y el `title` lo aclara.
- **La tabla de jugadores es PURA** (`tablaJugadoresSec`): el clic en una
  cabecera o en «Por partido / Totales» la vuelve a pedir desde el paquete
  guardado en `activar` (`data-sec-orden`, `data-sec-escala`). Los nulos
  van al fondo, ordene como ordene.
- **Las cabeceras son `<button>`** (teclado y lector de pantalla) y la
  regla de papel esconde todo botón, así que van con
  `.pbp-sec-jug th .pbp-orden { display: inline !important }` en
  `@media print`, o el PDF sale sin títulos de columna.
- **La ficha del sitio puede cubrir más partidos que el paquete** (por
  ejemplo, playoffs): la nota del tablero lo dice con el PJ de su propia
  fuente, y no se mezcla con los partidos validados.
- **El equipo propio en la tabla de posiciones va con `◀`**, no solo con
  color.

### Dónde no hay datos todavía, y por qué

- **Jujuy 2026-27**: la Liga Argentina no arrancó. La ficha del equipo
  trae los 32 partidos sin fecha ni resultado, y la tabla contesta
  «Clasificación no encontrada». Sin partidos validados no hay paquete;
  el bloque se va a llenar solo cuando haya datos.
- **Regatas Uruguay (FBER, Liga Provincial de Clubes 2026)**: no hay fuente
  pública. La federación no publica estadísticas en ninguna página de la
  plataforma, y la app de la CABB lee un backend al que no se entra sin
  autorización (`cabb.gesdeportiva.es` contesta 403).
- **Conferencia Norte 25/26** (lo publicado hoy): trae todo salvo la tabla.
  La Liga solo sirve las fases de la temporada en curso, así que la tabla
  de 25/26 ya no se puede pedir.

---

## 94. LA CAPA DE LABORATORIO TAMBIÉN VA SOBRE UN TORNEO (2026-10-07)

`catalogo.js laboratorio` sobre la zona de la LNB respondía «es un torneo, no
un cliente»: `cambiar_laboratorio` no estaba en `ACCIONES_DE_TORNEO`. Regla
del club: MotorStats tiene torneos SIN clientes (la LNB entra por la
ingesta), y sus datos tienen que poder verse igual.

- **Por qué no alcanzaba con subir los tiros**: `/api/v1/pbp` deja pasar al
  admin sin la capa, pero el PANEL no le ofrece la pestaña a nadie si
  `alcance.capas` no trae `pbp` (`SGADD_PBP.activa()`). Datos en KV y pestaña
  invisible.
- **El cambio**: `cambiar_laboratorio` entra a `ACCIONES_DE_TORNEO`. No es un
  campo comercial —es un dato habilitado— y `laboratorio()` ya era genérico:
  habilita SOLO la zona pedida. Pausar, plan, equipo, vencimiento y los
  informes ORO siguen rechazándose (`test-torneos.js`).
- **Ojo con los clientes que se enganchen después**: el panel pide los tiros
  a `sgadd:pbp:<club del cliente>:<su categoría>` (`destino()`), no a la clave
  del torneo. Un club enganchado a la LNB necesita su propia subida con
  `pbp.js subir --club <club>` y su propia capa, hasta que la lectura herede
  del torneo.

## 96. FOTOS ENCUADRADAS, DORSALES, MAPA SIN PISO Y POST-PARTIDO AMPLIADO (2026-10-08)

Pedido del club después de ver la LNB en vivo. Cinco cosas, tres capas
(ingesta, servidor y panel). Assets en `?v=271`.

### 1 · La foto se ancla arriba
La LNB publica fotos de medio cuerpo o cuerpo entero: con `object-cover`
centrado el círculo mostraba el pecho y cortaba la cara. `.foto-jugador`
(index.html) = `object-fit: cover; object-position: 50% 0`. La pone
`torneoImagenJugador` y se la saca en el `onerror` cuando cae al escudo.

### 2 · La miniatura en Rankings y Scouting
- **Rankings de jugadores** (`jugadoresTablaRanking`, liga y plantel): la
  foto `w-6 h-6` en lugar del escudo; sin foto, el escudo como antes. La
  fila guarda `equipoCrudo` porque la clave de la foto es la del libro.
- **Scouting**: `scoutNombreJugador(f, equipo, tam)` en la tabla de marcas,
  la tabla de jugadores, el resto del plantel y las fichas. Una sola
  función: el mismo jugador no puede llamarse distinto en cada bloque.

### 3 · «#32 NOMBRE»
- **Servidor**: `PADRON_J.dorsalesDelPadron` (misma lectura y misma clave
  que las fotos; solo pasa `^\d{1,3}$`) y el handler manda `dorsales`
  filtrado con `fotosDelLibro`: un rival recortado no manda ni su dorsal.
- **Panel**: `torneoDorsal(nombre, equipo)` en sgadd-inscriptos.js. Orden:
  `estado.dorsales` del servidor → la columna DORSAL del ÚLTIMO partido de
  ese jugador CON ESE EQUIPO en `Base Datos J` → nada. Nunca se inventa un
  número; el 0 vale. `torneoPrefijoDorsal` devuelve «#N » o ''.
- Va en: ficha del jugador (y su PDF), cards del plantel, rankings,
  Scouting y los box scores del post-partido. El box score usa el DORSAL
  de la fila de ESA noche y, si no lo trae, el del padrón.
- La ingesta escribía `j.dorsal || ''` en PADRON J y perdía el 0: corregido.

### 4 · El mapa del jugador se dibuja siempre
Antes, con menos de 15 tiros, la pestaña Tiro decía «el mapa todavía no
dice nada». Ahora:
- La ingesta exporta a TODOS los tiradores (`detalleTiros(…, { minTirosJugador: 1 })`
  en exportar-web.js; el default de 15 sigue para quien no lo pida).
- `SGADD_PBP.MIN_TIROS_DIAGNOSTICO = 15`: debajo, `jugador()` dibuja el
  mapa con `diag: false`, avisa «muestra chica» y `diagnosticoJugador`
  devuelve null (el botón Diagnóstico no muestra nada inventado).
- Un paquete viejo (sin el jugador en el detalle) dibuja igual sus tiros
  sueltos desde `detalle.puntos` (`canchaConTiros`).

### 5 · El informe post-partido
Orden nuevo: cabecera → insight → 4 factores → **Eficiencia** →
**Cuarto a cuarto** → **Momentum** → **Perfil de tiro** → **Mapa de tiro
del partido** → box scores → próximo cruce.
- **Cabecera**: fecha · hora · estadio (de la fila LOCAL) y «DT …» debajo
  de cada equipo. Son las columnas HORA / ESTADIO / ENTRENADOR que la
  ingesta agrega al final de `Base Datos E`; un libro manual no las trae y
  la línea queda como antes.
- **Cuarto a cuarto**: PTS Q1..Q4 y PTS OT (solo si hubo suplementario) de
  las dos filas de `Base Datos E`, cada parcial coloreado por quién lo
  ganó y una fila con la diferencia. Sin los cuatro parciales, no va.
- **Momentum y mapa del partido**: salen de `partidosPbp`, un campo
  OPCIONAL nuevo del paquete @3 (como `secciones`: pbp.js lo sube sin
  cambios). Por partido validado: `id` (= ID_PARTIDO_FUENTE), `linea`
  [t, propio, rival] en cada gol, `periodos` y `tiros.favor/contra`
  ([lateral×10, fondo×10, convertido, zona], la misma validación que la
  capa de círculos: `AV.puntoDe`). Los últimos 12 partidos (~3 KB cada
  uno; el techo de pbp.js es 200 KB por paquete).
  · `SGADD_PBP.espacioPartido(equipo, {id, fecha, rival}, tipo)` deja el
    lugar; `montarPendientes` lo llena con `momentumPartido` o
    `mapaPartido`. `partidoDe` busca por id y, si no, por fecha + rival.
  · El momentum es SVG puro (sale igual en el PDF): diferencia en
    escalones, verde arriba / rojo abajo, cortes de cuarto FIBA (10' y
    suplementarios de 5'), minutos arriba de cada uno, máxima ventaja y
    desventaja, cambios de líder y empates.
  · La línea nunca retrocede en el tiempo: el PBP a veces trae un reloj
    unos segundos atrás y manda el orden (segmentar.js, 1).
  · Sin la capa de laboratorio, o con un partido que no validó, cada
    bloque lo dice en una línea y el informe sigue.

### Para que llegue a producción
1. **Backend** (los `dorsales`): `cd server && npx vercel --prod`.
2. **Front**: push a main (`?v=271`, `sgadd.css` regenerado).
3. **Paquetes**: la próxima corrida de la tarea (exportar-web + pbp subir)
   los sube con `partidosPbp` y todos los tiradores. Hasta entonces el
   post-partido dice que no hay play-by-play del partido.

Tests: `test-pbp.js` (mapa con muestra chica, paquete viejo, momentum,
mapa del partido, `partidoDe`), `test-inscriptos.js` (encuadre y dorsal),
`test-padron-j.js` (dorsales). En la ingesta, `test/test-jujuy-pbp.js`
(todos los tiradores, `porPartido`: uno por partido, la línea termina en
el resultado y nunca baja, y los tiros suman lo mismo que el detalle).

---

## 97. TITULARIDAD, QUINTETOS DEL PARTIDO, MARCA EN LOS PDF Y FICHAJES (2026-10-09)

Assets en `?v=272`. Toca ingesta, servidor y panel.

### 1 · «Titular X/Y» (solo con el dato · ver la excepción del punto 8)
- **Servidor**: `PADRON_J.titularesDelLibro(hojas, {fase, torneo})` cuenta
  `[titular, partidos]` por jugador sobre `Base Datos J` COMPLETA, solo las
  filas con TITULAR = SI/NO, en el tramo de las alertas. Viaja como
  `titulares`, filtrado con `fotosDelLibro`: solo el conteo, solo de quien
  viaja en el libro recortado (igual que las alertas).
- **Panel**: `torneoTitularidad` / `torneoBadgeTitular` (sgadd-inscriptos.js).
  Primero las filas del índice (el tramo que se mira); si no las hay —un
  rival recortado— el conteo del servidor. Badge: «Titular 5/5» (resaltada
  desde el 80 %), «Desde el banco · 0/4» si nunca arrancó, nada sin dato.
- Va en la ficha del jugador (fila de badges), las cards del plantel y la
  tabla del plantel de Equipos (que además suma el dorsal).

### 2 · Quintetos inicial, de cierre y clutch en el post-partido
- **Ingesta** (`AV.porPartido` → `quintetosDe`): por lado, `inicial`
  (`seg.iniciales`), `cierre` (el último tramo con cinco) y `clutch` (null
  si no hubo; si no: minutos, parcial, el quinteto con más minutos en ese
  tramo y los que más usos tomaron, con `clutch.js` corrido sobre ESE
  partido). Cada quinteto con `mm` y `min` juntos en el partido. Más
  `nombres` [nombre, dorsal] de los dos lados.
- `TOPE_PARTIDOS` bajó de 12 a 10: con los quintetos cada partido pesa
  ~4,4 KB y el techo de pbp.js es 200 KB. **Un partido más viejo que los
  últimos 10 del equipo pierde momentum, mapa y quintetos en su
  post-partido** (lo dice en una línea). Si se quiere toda la temporada,
  hay que subir `MAX_KB` en `server/bin/pbp.js`.
- **Panel**: `SGADD_PBP.quintetosPartido`, montado con
  `espacioPartido(…, 'partido-quintetos')` justo arriba de los box scores.

### 3 · Encabezado y marca de agua en los PDF
- Las cinco exportaciones envueltas por `inyectarPieDeHoja` (informe de
  equipo, ficha del jugador, ranking, scouting, ficha de fichaje) suman un
  `<thead>` con `encabezadoInforme()` —logo + MotorStats, a la derecha— que
  se repite en cada hoja (la misma maquinaria del `<tfoot>`, NO un
  `position: fixed`, que falló en el Chrome del club). La celda del cuerpo
  lleva `.marca-agua`: «MotorStats» en diagonal al 4,5 % como FONDO, cada
  240 mm, con `print-color-adjust: exact`. Nunca tapa contenido.
- El **post-partido** NO se envuelve: su CSS de papel parte las hojas a
  mano (`break-inside: avoid` sobre toda tabla) y anula los fondos. Lleva
  `.encabezado-marca` en el flujo (primera hoja) y su pie fijo de siempre.
- Sin verificar en un PDF real del club: hay que generar uno de cada y
  mirar que el encabezado no pise el primer título.

### 4 · Fichajes
- **Jugador modelo** (nivel 0 del panel de filtros, y «🎯 Usar como
  modelo» en la Radiografía): `SGADD_MERCADO.conModelo(res, modelo,
  jugadoresSimilitud)` re-puntúa sobre las mismas puertas duras con la
  similitud del punto 58 (función 50 / perfiles 30 / jerarquía 20, volumen
  comparable) y, si los dos tienen ficha, 15 % de `cercaniaFisica` (talla:
  1 hasta 3 cm, 0 desde 15; puesto: mismo 1, vecino 0,5). Con criterios
  que suman, el % es el promedio de los dos. Mismo piso del 60 %.
- **Edad y año de nacimiento**: salieron del desplegable «Ficha manual» a
  un grupo visible, filtro duro. `crit.nacimiento {min, max}` filtra por el
  AÑO (`anioNacimiento`), que no cambia con la fecha del día.
- **Mapa de tiro en la Radiografía**: `bloqueMapa` + `montarMapas` con
  `SGADD_PBP.jugador` (mapa + diagnóstico, y el aviso de muestra chica del
  punto 96). El paquete lo trae una ruta NUEVA,
  `GET /api/v1/fichajes/:torneo/:zona/tiros?equipo=X`
  (`manejarTirosZona`), que autoriza el PADRÓN DE FICHAJES y no el club:
  `/api/v1/pbp` le daría OTRO_CLUB a quien busca jugadores de otro club.
  Lee `sgadd:pbp:<torneo>:<zona>`. Una zona sin paquete lo dice.

### Para producción
Backend (`titulares` y la ruta de tiros), push del front, y la próxima
corrida de la tarea sube los paquetes con quintetos.

---

## 98. LA BADGE DE TITULARIDAD UNIFORME, LA FICHA FIEL Y EL POST-PARTIDO FIRMADO (2026-10-09)

Pedido del club después de verlo en vivo. Assets en `?v=273`.

### 1 · Una sola badge de titularidad
`torneoBadgeTitular(nombre, equipo, compacta)`: «TITULAR (4/4)» /
«DESDE EL BANCO (0/4)», con el MISMO estilo que la etiqueta principal de la
ficha (display, mayúsculas, borde del color del texto, `border-current/40`).
`compacta` solo achica el tamaño (cards del plantel, tabla de Equipos). En
las cards va en la MISMA línea que el rol por minutos, no en una línea
suelta debajo.

### 2 · La ficha en PDF es la de la pantalla
- La identidad es `jugadoresHeader()` —la tarjeta de la ficha: foto,
  «#dorsal NOMBRE», equipo · jerarquía · consistencia, badges de rol y de
  titularidad, las cuatro tarjetas— y no una portada propia (que tenía
  escudo en vez de foto y otra línea de jerarquía). Arriba, chica, la línea
  de emisión (fecha, competición, club). El botón y los controles de estado
  llevan `data-no-print`.
- El mapa del play-by-play de la pestaña Tiro SALE: `.mapa-pbp-jugador`
  le gana al `.no-imprimir` solo en `#fichaSalida`, y la exportación espera
  `SGADD_PBP.montarPendientes(salida)` (que ahora devuelve una promesa, con
  un tope de 5 s) antes de embeber las imágenes e imprimir.

### 3 · El post-partido, firmado en cada hoja
- Ya no usa el pie fijo (`inyectarPieMotorStats`): va a la tabla firmada
  como las otras cinco (`inyectarPieDeHoja('detallePartido')`), con el
  encabezado, el pie y la marca de agua en cada hoja. Ninguna exportación
  usa ya el `position: fixed` (test-responsive lo recorre).
- Su CSS de papel trataba a TODA tabla como una del informe (6 pt,
  `table-layout: fixed`, primera celda al 20 %, `break-inside: avoid`):
  reglas con más especificidad devuelven la tabla firmada a lo suyo, el
  «no partir» pasa a los hijos de la celda (`.hoja-cuerpo-celda > *`), y la
  marca de agua se recupera contra el `background-image: none` general.
- Sin verificar en un PDF real: generar uno y mirar que el encabezado y el
  pie salgan en las dos hojas y que ningún bloque se parta.

### 4 · LAB · relevado, no habilitado (ver la respuesta del 2026-10-09)
- La temporada no arrancó (tabla vacía; primer partido el 2026-10-15).
- Fase 21986, grupos 41441 (Norte) y 41442 (Sur). Libros en el catálogo:
  Norte `1kCBNlwp…`, Sur `1Fu9E7dU…`, vacíos, con los encabezados de antes
  de la v114 (los completa el motor en la primera corrida con metadatos).
- Sus scripts son clientes de la fachada (motor v114 compartido), con
  MI_CONFIG `2026 / LAB / CONFERENCIA NORTE|SUR / IDA - REGULAR`. Para la
  ingesta automática les falta el PUENTE (lo que `puente-lnb.js` le hizo al
  script de la LNB) y declarar las competencias en `src/sitios.js`.

---

## 99. LA LIGA ARGENTINA 2026-27 · INGESTA AUTOMÁTICA DE LAS DOS CONFERENCIAS (2026-10-09)

Decisiones del club (2026-10-09): los libros Norte y Sur del catálogo son
EXCLUSIVOS de la ingesta (nadie sube Excel a mano), sus scripts se
convierten en puente, van las dos conferencias completas y Jujuy conserva
además su libro de cliente. Formato oficial: dos conferencias de 17, todos
contra todos ida y vuelta dentro de cada una (32 partidos), playoffs desde
abril; los cruces entre conferencias recién desde cuartos. Arranca el
2026-10-15. Assets en `?v=274`.

### En la ingesta (motorstats-ingestion, sin git)
- `src/sitios.js`: `lab-2026-27-norte` y `lab-2026-27-sur`
  (`competenciaLab`): fase 21986, grupos 41441 / 41442, sus libros y
  scripts, `destino.puente` propio, MI_CONFIG
  `2026 / LAB / CONFERENCIA NORTE|SUR / IDA - REGULAR, VUELTA - REGULAR`,
  10 partidos por corrida.
- `src/conferencia.js`: el fixture de la delegación trae las dos
  conferencias juntas y SIN grupo; se filtra por los ids de equipo de
  `torneos/liga-argentina-2026-27.json` (este repo). Un partido con un
  equipo sin zona no se adivina: queda afuera y el log lo dice. Por eso
  ese archivo tiene que tener los 34 ids: UNION (SF) 115314 y RACING (A)
  113741 se completaron ese día (eran provisorios).
- `src/destino/puente.js` y `fachada.js`: `usar(comp)` apunta al puente y
  al Cliente_Script de la competencia; sin `usar`, la LNB (nada de lo que
  ya andaba cambió).
- `herramientas/puente.js --competencia <id> --clonar|--preparar|--publicar|--ping`:
  clona el script del libro, le instala el `Puente_Ingesta.js` de la LNB
  (la fuente de verdad) con SU libro y la carpeta resuelta POR NOMBRE
  —igual que `_resolverCarpetaMadre_` del motor; dos carpetas con la misma
  ruta es un error, no se adivina—, su secreto, su MI_CONFIG, el MS_TOKEN
  de su planilla (HMAC del sheetId: el que tenían era de otra) y la app web.
  Los clones quedan en `puente-lab-2026-27-norte/` y `…-sur/`.
- `herramientas/correr-lnb.js`: LNB → LAB Norte → LAB Sur en cada pasada
  (la tarea registrada no cambia). Cada una con su log en
  `salida/<id>/logs/`; una que falla no frena a las otras; una sin puente
  publicado se SALTEA y lo dice. Los tiros van a
  `sgadd:pbp:liga-argentina-2026-27:lab-2026-27-norte|sur`.
- `test/test-lab.js` (en `npm test`).

### En el panel
- Las dos zonas ya son categorías de un torneo: fotos, dorsales,
  titularidad, quintetos y mapas funcionan solos cuando llegan los datos.
  Falta habilitar la capa `pbp` en las dos (comando de catálogo, abajo).
- **Líderes del torneo** en Fichajes (`bloqueLideres`): con dos zonas o
  más cargadas, PPP, TS% y PTS de jugadores (los que califican, cada uno
  contra su zona) y PACE de equipos, todas las zonas juntas, arriba del
  buscador. El buscador, el modelo y la Radiografía ya cruzaban las zonas.

### Para dejarlo andando (los corre el prestador)
1. Publicar cada puente y autorizar su script una vez desde el editor;
   después `--ping` (tiene que mostrar la carpeta resuelta y la licencia).
2. `node server/bin/catalogo.js laboratorio --club liga-argentina-2026-27 --categoria lab-2026-27-norte --capas pbp`
   (y la Sur).
3. Con los primeros partidos (2026-10-15), una corrida en seco por
   conferencia antes de la primera entrega.

---

## 101. LA CAPA DE LABORATORIO SE HEREDA DE LA ZONA DEL TORNEO (2026-10-10)

Cada cliente enganchado a un torneo pedía un `catalogo.js laboratorio … --capas pbp`
a mano (Boca, punto 100). Regla nueva: **una categoría enganchada a una zona
de torneo hereda las capas de laboratorio de esa zona**. Solo servidor: el
front y `?v=` no cambian.

- **Se deriva al leer, no se copia al enganchar** (`TORNEOS.capasEfectivas`,
  `server/lib/torneos.js`). Lo usan `catalogo.resolver` —de ahí salen el guard
  de `/api/v1/pbp` y `alcance.capas`— y `catalogo.publico`, que suma
  `laboratorioDe: 'torneo' | 'categoria'`. Vale para los que ya estaban
  enganchados, para `vincular`, para el alta con `libroDe` de una zona o con
  `torneo` + `zona`, y habilitar o apagar la capa en la zona les llega a todos.
- **Lo propio manda.** Si la categoría declara `laboratorio`, rige eso. La
  LISTA VACÍA es «apagada a propósito para este cliente»: en una enganchada,
  `--capas ""` guarda `[]` (borrar el campo la haría heredar de nuevo) y
  `--capas heredar` borra el campo. En una categoría sin enganche y en la zona
  misma, vacío sigue borrando el campo, como antes.
- **No se hereda del club** (punto 62, sin cambios) ni entre zonas: la Norte
  no le da nada a un cliente de la Sur.
- **La suscripción sigue cortando**: pausada o vencida da 403 antes de mirar
  la capa. El plan no interviene: es una capa de laboratorio, no un módulo.
- La nota del punto 94 («un club enganchado necesita su propia capa») y el
  comando del punto 100 quedan superados. Los datos ya se leían de la zona
  desde el punto 100 (`claveDeDatos`).
- Tests: `test-pbp.js` (alta de un cliente nuevo de punta a punta contra el
  handler) y `test-torneos.js` (LAB Norte/Sur, antes y después del enganche).

## 115. EL RELOJ DE POSESIÓN, DERIVADO DEL PLAY-BY-PLAY (2026-10-13)

Pedido: clasificar cada tiro según el segundo de la posesión en que sale
(0-6 · 7-14 · 15-20 · 21-24), con su zona, su asistencia y el perfil del
jugador, en los torneos con la capa `pbp`. **Los paquetes ya están en KV
(subidos el 2026-10-13); falta el push del front** para que se vea.

```
motorstats-ingestion/src/pbp/reloj.js    PURO: posesiones, franjas, resumen de equipo y vara de liga
motorstats-ingestion/test/test-reloj.js  46 tests (secuencia a mano + la Conferencia Norte real)
js/sgadd-pbp.js                          relojTabla · relojIdentidad · relojPerfilJugador · relojEquipo/Jugador/Partido
test-pbp.js, sección 7
```

### Lo medido antes de escribir (Conferencia Norte 25/26 · 266 partidos · 33.996 tiros)

La plataforma no publica el reloj de 24: se DERIVA del reloj del período
(tiempo del tiro − tiempo del evento que le dio la pelota al equipo).

```
franja     tiros   pts/tiro   eFG%
0-6 s      4.332    1,30      64,9
7-14 s     8.886    1,09      54,7
15-20 s    8.200    1,00      50,1
21-24 s    4.573    0,85      42,5
tras rebote ofensivo 3.097 · 1,15      tras falta recibida 2.722 · 0,96
cobertura 93,6 % (76,5 % con franja + 17,1 % reinicio) · 6,4 % sin reloj
```

La señal existe y cae franja por franja. En la LNB (21 partidos) da lo mismo:
1,25 · 1,16 · 1,01 · 0,82.

- **El reloj lo carga un operador a mano**: la asistencia aparece 1 s después
  de la canasta y el rebote 1 s después del fallo; el 97 % a 3 s o menos. Por
  eso hay una TOLERANCIA de 3 s (hasta 27 s entra en la franja tardía; desde
  28, «sin reloj») y por eso se lee por franjas, no segundo a segundo.
- **Tras una canasta recibida la posesión sale ~3 s más larga** (el 24 arranca
  al tocar el saque, el reloj del período no para). Es un sesgo común a todos.
- **`partido.tiros` no trae reloj**: la zona se une por posición SOLO si la
  secuencia de tiros coincide entera con la de los eventos (es la misma lista
  al revés en 291 de 293 partidos). Si no coincide, ese partido va sin zona.

### En qué se apartó del pedido, y por qué

| Pedido | Lo que se hizo |
|---|---|
| Umbrales fijos (>22 % temprano, >50 % medio, Bailout >15 %/16 %) | **Cortes de la propia competencia** (el cuarto más alto). Medido: la mediana de finales tardíos de un equipo es 15,5 % y la del tramo medio 64,9 %: los fijos marcarían a media liga como «trancada» y a todos como «metódica». Regla del punto 4 |
| PPP y TS% por franja | **Puntos por TIRO y eFG%**. Los viajes a la línea no se cronometran: no es puntos por jugada, y la columna lo dice |
| Una sola posesión de 24 | **Reinicio aparte**: lo que sigue a un rebote ofensivo o a una falta recibida corre con otro reloj (14 s o lo que quedaba). Un palmeo a los 2 s del rebote no es transición |
| 5 zonas NBA | **Las 7 familias que el panel ya usa** (aro, corta, medias, triples) |
| % de asistencia de los tiros | **Solo de las canastas**: el PBP no registra el pase de un tiro errado |
| «Ofensiva trancada / alta presión rival» | Un aviso que **no afirma la causa**: el dato no las separa |

### El motor (ingesta)

Inicio de posesión: rebote defensivo, robo, pérdida rival sin robo (pelota
muerta), canasta o libre convertido del rival, arranque de período. Reinicio:
rebote ofensivo, falta recibida CON la pelota (sin ella es posesión nueva).
Tras un tiro errado nadie tiene la pelota hasta el rebote: un segundo tiro
sin rebote cargado queda sin reloj, no hereda el anterior. Un robo cargado
ANTES que su pérdida mide la pérdida contra la posesión que se perdió.

Viaja como campos OPCIONALES del paquete @3 (como `secciones`): `reloj`
(equipo: favor, contra, origen, familia por franja, jugadores), `liga.reloj`
(totales, cobertura y CORTES de equipo, jugador y partido) y
`partidosPbp[i].reloj`. Suma ~5,5 KB: el paquete más pesado queda en 167,7 KB
contra el techo de 200.

### El panel

- **Equipos → Quintetos**: sub-card «Reloj de posesión»: identidad, lo que
  tira, lo que le tiran, cómo nace la posesión y desde dónde tira por franja.
- **Scouting → card de Quintetos del rival** (pedido del club, el mismo día:
  revierte el «solo tres sub-cards» del punto 62 para esta sección): la misma
  sección más una LECTURA por rasgo para defenderlo (`LECTURA_RELOJ`) y
  quién tira en los primeros 6 segundos y quién con el reloj encima
  (`relojQuienes`: solo jugadores con perfil, de más a menos tiros). Un
  equipo sin rasgo no recibe lectura. Es lectura, no orden: lo dice.
- **Post-partido**: card entre el perfil de tiro y el mapa
  (`espacioPartido(…, 'partido-reloj')`), con el aviso de reloj tardío si el
  partido está en el 10 % más alto de la competencia y tuvo 30+ finales.
- **Jugador → Tiro**: debajo del mapa, el perfil y su tabla.

Etiquetas (no excluyentes; ninguna franja es buena o mala):

```
EQUIPO   Ataca temprano · Ofensiva armada · Llega tarde al tiro · (Reparto de liga)
         con 150+ finales con reloj y 8+ equipos con muestra
JUGADOR  temprano + asistido  → Finalizador temprano      temprano + creado → Creador de transición
         tardío + asistido    → Válvula de escape         tardío + creado   → Resuelve con el reloj encima
         con 30+ tiros con reloj, 20+ jugadores con muestra y 5+ canastas en la franja
         (con menos canastas: «Tira temprano / con el reloj encima», sin decidir quién lo crea)
```

«Asistido» es contra la tasa de la competencia en esa franja. Medido en la
Conferencia Norte: 172 de 230 jugadores con muestra; 18 · 23 · 22 · 20 en
los cuatro perfiles. En la LNB de hoy (6 equipos, 2-5 partidos) todo sale
«muestra chica» o «sin comparar»: es lo correcto.

### Verificado

- Ingesta: 46 tests y la suite entera en verde. **Al revés, 9 mutaciones**,
  todas caen (tres no caían al principio y se corrigió la secuencia).
- Panel: `test-pbp.js` sección 7. **Al revés, 16 mutaciones**, todas caen.
  Sin `reloj` en el paquete la card es byte a byte la de antes.
- Las funciones se ejercieron sobre los 17 paquetes reales armados con el
  exportador: sin `undefined` ni `NaN`.
- **NO verificado en el navegador ni en PDF.** El post-partido suma un bloque
  y la card de Quintetos de Scouting una sección: hay que generar los dos PDF
  y mirar el paginado.

### Para que llegue a producción

1. ~~Subir los paquetes.~~ HECHO el 2026-10-13 con la subida masiva (abajo).
2. Push del front: la primera entrega salió con `?v=276` (commit 9679b19); el reloj en Scouting va con `?v=277`. El backend no cambió.

### La subida masiva · `motorstats-ingestion/herramientas/subir-paquetes.js`

    node herramientas/subir-paquetes.js                 ensayo: no escribe en la nube
    node herramientas/subir-paquetes.js --confirmar     regenera y sube todo
    node herramientas/subir-paquetes.js --sin-regenerar --confirmar   sube lo ya ensayado

Recorre `DESTINOS` (carpeta de `salida/` → club y categoría del catálogo):
respalda `web/` en `web.respaldo-<fecha>` (la vuelta atrás: se resube con
`pbp.js subir --dir`), regenera con `exportar-web.js` y sube con `pbp.js
subir`, que sigue siendo el único que escribe y valida. Un destino sin
partidos locales se saltea y lo dice; uno que falla no frena a los demás.

```
conferencia-norte  → jujuy / jujuy-primera                  17 equipos · 266/272 validados
lnb-2026-27        → liga-nacional-2026-27 / lnb-2026-27    18 equipos · 21/21
lab-2026-27-norte/sur                                       salteadas: sin partidos todavía
```

Los paquetes de Jujuy en KV eran del 02/10: además del reloj, ahora traen
`partidosPbp` (momentum, mapa y quintetos del post-partido, puntos 96-97).

### Lo que quedó afuera

- **Puntos por jugada y TS% por franja** (cronometrar los viajes a la línea).
- **El reloj en Fichajes** (el perfil del jugador como filtro).
- **El origen «robo» como dato de transición del rival** (puntos tras pérdida).
- Los partidos más viejos que los últimos 10 del equipo no tienen reloj en su
  post-partido (el tope del punto 97); la temporada sí los cuenta.

## 116. LA METODOLOGÍA DEL RELOJ, A LA VISTA · cards, Glosario y manual (2026-10-14)

Pedido del club: dejar documentados para el usuario los criterios y los
umbrales del reloj de posesión. `test-pbp.js` (sección 7) fija todo.

### Un solo texto · `SGADD_PBP.METODOLOGIA_RELOJ`

Vive en `js/sgadd-pbp.js`, que es el módulo que APLICA los criterios, y lo
leen tres lugares. Con el criterio escrito en tres lados, uno queda viejo.

| Dónde | Qué muestra |
|---|---|
| Las cuatro superficies del reloj (Equipos, Scouting, post-partido, jugador) | «Cómo se lee · criterios del reloj», plegado (`relojAyuda`), con los cortes de ESA competencia |
| Glosario del panel | card «Metodología · Reloj de posesión», plegada, arriba de las familias (`relojMetodologiaHtml`) |
| `MANUAL_ETIQUETADO_SGADD.html` | sección 5, generada con `node generar-manual-etiquetas.js` |

Contiene: las cuatro franjas (Temprana · Media · Armada · Tardía) con su
lectura, los seis criterios de medición, las siete familias de zona con sus
zonas, las etiquetas de equipo y de jugador con su regla, y la definición
del aviso de reloj tardío («describe, no juzga»).

### Lo que hay que respetar al tocarlo

- **Los mínimos de la metodología son los que aplica el motor**
  (`RELOJ_MINIMOS`: 150 finales, 30 tiros, 5 canastas). Son el respaldo del
  panel; los que rigen viajan en `liga.reloj.minimos`. Si la ingesta los
  cambia, hay que cambiarlos acá.
- **Toda etiqueta que el motor emite tiene que estar definida**: hay un test
  que junta las que salen de las fixtures y las busca en la metodología.
- **Las dos filas aparte tienen nombre propio** (punto 117), con un `title`
  que dice por qué no entran en una franja.
- **«Cómo se lee» lleva `.no-imprimir`**: en el papel ya va la nota corta.
- **El Glosario sin `SGADD_PBP` cargado no pinta la card** (los tests del
  glosario corren sin el módulo y no cambiaron).
- La card del Glosario la ve todo el mundo, tenga o no la capa: es
  metodología, no un dato de un club (punto 20).

### «2da oportunidad» y «Reinicio» · resuelto en el punto 117

El club eligió separar las dos filas: ver el punto 117.

### Verificado en el servidor local (2026-10-14)

Panel en `localhost:8765` contra la API local (`localhost:3011`, KV y Google
reales) con un link de cliente de Jujuy de 12 horas, `v278`:

- **Equipos → Quintetos**: la sección con «Ofensiva armada», sus cuatro
  tablas, las filas de reinicio y «Cómo se lee».
- **Post-partido** (Comunicaciones vs Jujuy, 27/03): la card con las dos
  tablas; sin aviso (10,5 % de finales tardíos contra 16,3 % de un partido
  típico).
- **Scouting vs Rivadavia**: las dos lecturas (ataca temprano y llega tarde)
  y los siete jugadores nombrados.
- **Glosario**: la card, plegada, con sus 27 ítems.
- A 375 px, ni Scouting ni el Glosario desbordan.

**Sigue sin verificar: los PDF** (post-partido y Scouting, que ahora son más
largos) y el bloque del jugador en pantalla.

## 117. «2DA OPORTUNIDAD» Y «REINICIO», Y EL PAGINADO DE LOS DOS PDF (2026-10-14)

### Las dos filas fuera de franja dejan de llamarse igual

Decisión del club: no son lo mismo. `SGADD_PBP.FUERA_DE_FRANJA` (un solo
lugar, con rótulo y tooltip de cada una):

```
2da oportunidad · tras rebote ofensivo    el equipo vuelve a tirar tras su propio rebote
Reinicio · tras falta recibida            el reloj se reinicia y la posesión sigue
```

Ninguna entra en una franja: corren con otro reloj. El criterio de la
metodología pasó a «2da oportunidad y reinicio, en filas propias», y de ahí
lo toman las cards, el Glosario y el manual (regenerado). **La ingesta no
cambió**: allá son los grupos `ro` y `fa`, sin texto.

Tests nuevos: los dos rótulos y sus tooltips no se cruzan, y el reparto por
franja es el mismo con o sin esos tiros (no contaminan la posesión primaria).

### El paginado, medido sobre los PDF REALES

Generados con Chrome sin ventana por CDP contra el panel local (API local,
KV y Google reales, link de cliente de Jujuy), con y sin el bloque del reloj
en el mismo documento, y leídos hoja por hoja con `pdftotext` / `pypdf`.

```
POST-PARTIDO (Comunicaciones vs Jujuy, A4 vertical)
  sin reloj  5 hojas · 3: perfil de tiro + mapa         · 4: quintetos
  con reloj  5 hojas · 3: perfil de tiro + RELOJ entero · 4: mapa + quintetos

SCOUTING vs Rivadavia (A3 apaisada, plan ORO, todo tildado)
  sin reloj  15 hojas
  con reloj  16 hojas · 12: quintetos + lectura + quién tira temprano
                        13: quién tira tarde + lo que tira + lo que le tiran + origen
                        14: zona por franja + líderes del último partido
```

- **Post-partido**: mismas 5 hojas. El bloque entra entero en la hoja 3 (las
  dos tablas, la nota y el título); el mapa baja a la 4, que tenía lugar. El
  pie sale en las cinco. «Cómo se lee» no se imprime.
- **Scouting**: una hoja más, sin hojas huérfanas (la 14 comparte con los
  líderes, que antes iban solos).
- **El corte que se encontró y se arregló**: la lista «quién tira con el
  reloj encima» quedaba mitad en cada hoja, y la tabla de zonas partida
  después de su primera fila. Cada tabla con su subtítulo, cada lista y la
  lectura llevan ahora `.pbp-reloj-pieza` (`break-inside: avoid`, solo en
  `@media print`). Hay test de las dos mitades (la clase y la regla).

**El post-partido mide 5 hojas, no las 2 del punto 7**: es así desde que
sumó cuarto a cuarto, momentum, mapa y quintetos (puntos 96-98). No lo
cambió el reloj; la hoja 2 lleva solo el momentum.

### Cómo se generó (por si hay que repetirlo)

`window.print` se reemplaza antes de llamar a la exportación (en el
post-partido tiene que LANZAR: su limpieza corre 400 ms después de
`print()` y borra el modo de papel antes de la captura), y después
`Page.printToPDF` con `preferCSSPageSize` y márgenes de 0,4 pulgadas. Con la
caché desactivada (`Network.setCacheDisabled`), o Chrome sirve el
`index.html` anterior.

## 118. EL RELOJ EN LA PESTAÑA PERSONALIDAD · barras y síntesis táctica (2026-10-14)

Pedido del club: «cuándo tira» y «cuándo le tiran» dentro de Personalidad,
en un gráfico, con conclusiones en el idioma del resto del panel.
`test-pbp.js` (sección 7, al final) fija todo.

### Dónde va

- **Equipos → Personalidad**, al pie, DESPUÉS del insight del equipo
  (`equiposRelojPersonalidad`). **Solo con la capa `pbp`**: sin ella la
  pestaña queda byte a byte como antes. Llega por `SGADD_PBP.espacio(…,
  'personalidad')` y `montarPendientes`, como el resto del play-by-play.
- **Informe de equipo (PDF)**: la sección «8 ejes de personalidad» lo
  arrastra, en hoja propia (`data-hoja`). `generar()` espera a que se monte,
  con techo de 5 s (el mismo patrón de la ficha del jugador).
- **Va después del insight a propósito**, medido en el PDF real (Jujuy, A3
  apaisada): puesto antes, empujaba el «Insight clave» del equipo al pie de su
  hoja y lo partía en dos (10 → 12 hojas). Después, el informe pasa de 10 a
  **11 hojas**: las hojas 1-5 y 7-11 son idénticas a las de sin reloj, y la 6
  es el bloque entero. «Cómo se lee» no se imprime.
- **El post-partido NO tiene una card de Personalidad.** Su card del reloj
  (punto 115) queda como estaba: la síntesis mira la temporada, y con los
  tiros de una noche las armas y grietas serían ruido.

### El gráfico · `relojBarras` (PURA)

Por lado, cuatro filas: la barra es la parte de los finales (tiros y
pérdidas) en la franja, con un trazo en la competencia; al lado, Pts/tiro
(entre paréntesis la competencia) y eFG%. Abajo, «2da oportunidad» y
«Reinicio» con sus C/I, sin barra: no son una porción del reloj. El
rendimiento que se separa lleva ▲/▼ además del tono (punto 14). CSS a mano
(`.reloj-barra*`) con variante de papel y `print-color-adjust: exact`.

### La síntesis · `relojSintesis` (PURA) · nada se escribe si el dato no lo sostiene

| | De dónde sale |
|---|---|
| **Insight del reloj** | el reparto propio y el del rival contra los cuartiles de la competencia (`cortes.equipo`, p25 y p75). Si esa franja además se separa en rendimiento, va en la misma frase |
| **3 armas / 3 grietas** | franjas de los DOS lados (lo que tira y lo que le tiran) cuyo rendimiento se separa, ordenadas por puntos de diferencia en la temporada (desvío × tiros) |
| **Para explotarle** | sale de sus grietas: dónde atacarlo y dónde dejarlo tirar |
| **Para anularle** | sale de sus armas: qué negarle y en qué terreno no jugarle |

- **El rendimiento se ajusta por muestra** con 20 tiros de la liga (el
  criterio del mapa) y cuenta como desvío **desde 0,06 puntos por tiro, con
  20 tiros o más**. Medido sobre los 17 equipos de la Conferencia Norte: el
  desvío ajustado tiene mediana 0,047 y p75 0,077. Con esos cortes salen 34
  armas y 28 grietas en total (2 y 1,6 por equipo).
- **Lo que le tiran se mide con la misma vara de cuartiles** que el ataque:
  es la distribución de los ataques de la liga, y el reparto en contra de
  los 17 equipos se mueve en el mismo rango (14 a 22 % de tempranos).
- **Sin desvíos no se fuerza un texto**: una sola frase que lo dice, y
  ninguna lista. Sin muestra (150 finales) no hay síntesis, solo barras.
- Las recomendaciones (`QUE_HACER`, lado × franja) llevan siempre la cifra y
  la de la competencia, y el bloque dice que decide el cuerpo técnico.

### Verificado

En el navegador contra la API local (KV y Google reales, link de cliente de
Jujuy): el bloque sale con «Ofensiva armada», sus dos grietas de ataque más
la del reinicio, y ningún desborde a 475 px (la emulación no baja de ahí).

Al revés, once mutaciones, todas caen: el corte de 0,06 (2), el mínimo de
20 tiros, el ajuste por muestra, el signo de la defensa (4), el orden por
impacto (3), explotar con las armas, la síntesis sin muestra, el ▲/▼, la
pestaña sin la guarda de la capa, el informe sin esperar y el montaje sin
el tipo nuevo.

## 119. EL PERFIL DE RITMO EN PERSONALIDAD · arquetipos, desglose por franja y cruces de identidad (2026-10-14)

Pedido del club: llevar el reloj de posesión a la pestaña **Personalidad**
como su único lugar en Equipos, con arquetipos de ritmo, conclusiones
por franja y cruces con los 8 ejes. `test-pbp.js` (sección 7, al final)
fija todo lo de acá. Assets en `?v=281`.

### Las tres decisiones, consultadas antes de escribir

| | Decisión |
|---|---|
| **De dónde sale el reloj** | Solo de **Equipos → Quintetos**. Se queda en la card del rival de Scouting (punto 115), en el post-partido y en Jugador → Tiro |
| **El marcador de la liga** | El **trazo neutro** de siempre, no rojo: en el panel el rojo es «peor que la liga» |
| **Varios arquetipos a la vez** | Se muestran **todos**, en el orden del pedido |

### La vara de 7-14 y de 15-20 · cambio en la INGESTA

`liga.reloj.cortes.equipo` traía cuartiles de 0-6, 7-20 (`medio`) y 21-24.
El Plan A contra el Plan B necesita **7-14 (`media`) y 15-20 (`armada`)
por separado**, y las barras nuevas necesitan el origen y las zonas de la
competencia. `motorstats-ingestion/src/pbp/reloj.js` (`baseLigaReloj`) suma
`cortes.equipo.media`, `cortes.equipo.armada`, `liga.reloj.origen` y
`liga.reloj.fam`; `test/test-reloj.js` tiene 4 tests más (50). Los paquetes
quedaron **regenerados en local** (máximo 181 KB, contra el techo de 200)
y **sin subir**. Hasta que se suban, los arquetipos de 7-14 y 15-20 no se
evalúan y la card lo dice (`sinVara`); el resto anda con el paquete de hoy.

### Lo que se agregó en `js/sgadd-pbp.js`

| Función | Qué hace |
|---|---|
| `ARQUETIPOS_RELOJ` | los 7 de ataque y los 3 de defensa del pedido, en datos |
| `relojArquetipos(paq)` | cuáles calzan. Ataque: volumen ≥ el p75 de esa franja **y** rendimiento con el signo pedido. Defensa: el rendimiento de las franjas que pide cada uno |
| `relojDesglose(paq, identidad)` | el desglose 3.B (0-6, 7-20, 21-24), las situaciones especiales 3.C y los cruces 3.D |
| `relojOrigenBarras` · `relojLugarBarras` | «Cómo nace la posesión» y «Desde dónde tira en cada franja» en barras, con el trazo de la competencia |
| `relojPerfilHtml` | la card «Perfil de ritmo y ejecución», arriba de las barras |

`relojSintesis(paq, identidad)` mete el desglose en el insight y en
«Para explotarle / anularle». **La acción genérica de una franja que el
desglose ya cubre no se repite.**

### Las reglas, y en qué se apartan del texto del pedido

- **Volumen**: contra los cuartiles de la competencia (p25 y p75), como pide
  el pedido. 7-20 se mide contra el corte de 7-20 (`medio`), no contra el
  de una franja suelta; hay un test que lo fija.
- **Rendimiento**: el desvío de **Pts/tiro AJUSTADO POR MUESTRA** (20
  tiros de la liga), desde 0,06 y con 20 tiros o más. Es la misma vara de
  las armas y las grietas (punto 118). El pedido decía `pts_per_shot > liga + 0,06`
  crudo, y con eso cinco de cinco tiros son un arquetipo.
- **Situaciones especiales**: 0,08 ajustado y **más** de 30 tiros (con 30
  justos no se dice nada; hay test).
- **Cruces con la identidad**: PACE > p70, RO% > p90 y uso del triple
  (`PT3%`) > p80, leídos con `idx.leer` del **mismo índice** que los 8 ejes
  (`equiposIdentidadReloj` en `sgadd-equipos.js`). Viajan como JSON en
  `data-pbp-identidad` del lugar, y `leerIdentidad()` no tumba el bloque si
  el JSON viene roto. **El 35 % de triples de la posesión armada es fijo**,
  como lo pidió el club: lo que lo vuelve selectivo es el percentil 80 del
  uso del triple.
- **Textos ajustados**: «Vértigo» decía que *el plan del rival* debía
  priorizar un ritmo alto; se escribió «su plan de juego prioriza un ritmo
  alto». «Cargar el rebote ofensivo de forma estricta» se escribió como
  cargar con **un solo** jugador y dejar el resto atrás. «Su mayor grieta»
  pasó a «Grieta táctica»: el arquetipo no mide si es la mayor. La falta
  táctica dice que **el bonus y las faltas los mira el cuerpo técnico**: el
  panel no conoce el estado del partido (punto 64).
- **Las variables `identity.*` y `shot_clock.*` del pedido no existen** con
  esos nombres: son los 8 ejes del índice y el campo `reloj` del paquete.

### Los arquetipos son etiquetas, así que están en la metodología

`METODOLOGIA_RELOJ.arquetipos` sale de la **misma tabla** que los decide
(`ARQUETIPOS_RELOJ` se movió arriba de la metodología para eso) y
se pinta en el Glosario y en el manual (`node generar-manual-etiquetas.js`).
Hay un criterio nuevo, «Cuándo una franja rinde distinto». Un test exige
que cada arquetipo esté en la metodología, en el Glosario y en el manual.

### Medido

- **Sobre los 17 paquetes regenerados de la Conferencia Norte**: 10 equipos
  calzan en algún arquetipo (vulnerable ante el primer sistema 5, balance
  quebrado 4, Plan A 2, Plan A estéril 2, Plan B 2, vértigo 2, transición
  desordenada 2, muralla 1) y 5 tienen una situación especial. Ninguna
  salida con `undefined` ni `NaN`.
- **En el navegador** (API local, KV y Google reales, link de cliente de
  Jujuy): Quintetos ya no trae el reloj; Personalidad muestra el perfil
  con el paquete de KV («Balance defensivo quebrado» y el aviso de los
  cuartiles que faltan). Con el paquete nuevo inyectado: «Libreto inicial
  estéril», el desglose, el reinicio inerte y el cruce del triple
  (percentil 91). A 375 px, cero desbordes fuera de los `.scrollbox`.
- **En el PDF real del informe de equipo** (A3 apaisada, todas las
  secciones tildadas, paquete nuevo): el bloque **arranca en la hoja 6 y
  sigue en la 7**. Ninguna pieza se parte y no queda ninguna hoja huérfana.
  **Entero no entra en una sola hoja**: mide ~1245 px contra ~1028 px
  útiles, así que «íntegro en la hoja 6» no se cumple. Achicarlo a una sola
  hoja implicaría sacar contenido.
- **Al revés, 15 mutaciones, todas caen**: el arquetipo sin rendimiento 5,
  sin la deduplicación 4, sin volumen 3, la muralla con una franja 2, sin
  la card 2, y 1 cada una: el especial con 30, PACE, RO% y triple sin
  percentil (los dos primeros revientan la suite), 7-20 contra el corte de
  15-20, `sinVara` callado, el origen sin trazo y el reloj de vuelta en
  Quintetos.

### Para que llegue a producción

1. **Push del front** (`?v=281`). El backend no cambió.
2. **Subir los paquetes regenerados**, que es lo que trae los cuartiles
   nuevos y la competencia de las barras:
   `node herramientas/subir-paquetes.js --sin-regenerar --confirmar`
   (en `motorstats-ingestion`). Antes de eso, el panel muestra el perfil sin
   los arquetipos de 7-14 y 15-20, y las barras sin el trazo de la liga.

## 120. EL RELOJ EN PERSONALIDAD · INSIGHT POR BLOQUE, TABLAS Y CANCHA POR FRANJA (2026-10-14)

Ajustes del club sobre el punto 119. `test-pbp.js` (sección 7, al final)
los fija. Assets en `?v=282`. Solo front: la ingesta y el backend no cambiaron.

### 1 · «Balance defensivo vulnerable», no «quebrado»

En `ARQUETIPOS_RELOJ`, la metodología, el Glosario y el manual (regenerado).
Hay un test que falla si «quebrado» vuelve al módulo o al manual.

### 2 · Volumen relativo NO es la franja de mayor frecuencia

Una etiqueta dice que el equipo o el jugador está en el cuarto más alto de
la competencia en una franja; casi todos tiran más en 7-14 s. Cuando la
franja de MAYOR volumen absoluto es otra, `aclaraMayor()` lo agrega:
«…, aunque el 37,5 % de sus tiros ocurre en la ventana media de 7 a 14 s».
Va en la identidad del equipo, en el perfil del jugador (que ahora arranca
«Destaca por su alto volumen de tiro temprano en la competencia (X % … contra
Y % de la competencia; el cuarto más alto arranca en Z %)») y en los
arquetipos de ataque. Si la franja de la etiqueta ES la mayor, no se aclara.

### 3 · El insight por bloque · `BLOQUES_RELOJ`

`relojSintesis` devuelve `bloques`: Temprano (0-6), Medio (7-14), Armado
(15-20) y Tardío (21-24), cada uno con su lectura de ATAQUE y de DEFENSA,
contra los cuartiles de esa franja.

- **Un bloque en el rango de la competencia también se dice** («Reparte como
  la competencia: X % … (la competencia, Y %)», con su rendimiento): es la
  vista panorámica. Va atenuado.
- **`insight` sigue siendo la lista de lo que DISTINGUE** (volumen fuera de
  los cuartiles), en el orden de los bloques: los neutros no la llenan.
- El cruce de 7-20 s va como `extra` del bloque armado; las situaciones
  especiales, aparte (`extras`).
- **Sin un solo desvío no se dibujan los bloques** (`neutro`): una frase lo dice.
- Sin el corte de 7-14 / 15-20 (paquete viejo) esos bloques se comparan
  contra la competencia sin clasificar.

### 4 · Las tablas completas y la leyenda

Debajo de las barras de «Cuándo tira» y «Cuándo le tiran», la tabla entera
(`relojTabla`: C/I, Pts/tiro, eFG%, % T3, Asist., PP) y la leyenda «La
barra de color representa el % de volumen del equipo; el marcador vertical
(trazo) indica la media de la competencia.».

### 5 · «Desde dónde tira en cada franja» es una cancha · `relojLugarCancha`

Reemplaza a `relojLugarBarras`. Cuatro canchas chicas, una por franja, con
las 14 zonas pintadas con el acento por la parte de los tiros de ESA franja
que sale de su familia (intensidad por raíz, la vara de frecuencia del mapa).

- Una familia ocupa varias zonas: todas se pintan igual y el % va UNA vez,
  en su zona de referencia (`ZONA_ETIQUETA_FAMILIA`).
- El `title` de cada zona trae la competencia; sin `liga.reloj.fam` se dice.
- **La pintura (aro + corta)** sigue: badge en cada cancha contra la
  competencia y la serie de 0-6 a 21-24 debajo.
- SVG puro (sale igual en papel), `clipPath` por cancha.

### Verificado

Suite entera en verde. Al revés, ocho mutaciones, todas caen: la aclaración,
los bloques neutros llenando el insight, el `neutro`, los cortes por franja,
las tablas, la leyenda, el % de la cancha y el badge de pintura sin la liga.

**No verificado en el navegador ni en el PDF del informe de equipo**: el
bloque ya ocupaba dos hojas (punto 119) y ahora suma las dos tablas y las
cuatro canchas. Hay que generar el PDF y mirar el paginado. Los valores de
la competencia en la cancha llegan con la subida de paquetes del punto 119.

## 124. LAB SUR, ESCUDOS DE LA LAB Y EL «1°» DE BAHÍA BLANCA (2026-10-16)

Tres problemas reportados juntos, auditados contra los datos reales. Assets
en `?v=284`.

### 1 · El play-by-play de LAB Sur · validación en DOS niveles (ingesta)

**La Sur estaba configurada igual que la Norte y corría completa** (bajada →
motor → exportar → KV). Su único partido, Quilmes (MDP) 78-79 River (15/10),
quedaba afuera porque **el play-by-play oficial pierde un cambio**: Alderete
sale a las 8:23 del Q2 sin reemplazo y vuelve a las 7:50, así que Quilmes
juega 33 s con cuatro. El box score oficial tiene el MISMO hueco (sus minutos
suman 11.968 s contra 12.000): el quinto no se puede inferir.

Decisión del club: **validación en dos niveles** (`motorstats-ingestion`,
`src/pbp/segmentar.js` → `validar`):

| | Exige | Alimenta |
|---|---|---|
| `ok` | cinco en cancha siempre y minutos jugador exactos | quintetos, dúos, tríos, rotaciones, últimos 5, clutch, tácticas |
| `okTiros` | marcador idéntico, ningún tramo con MÁS de cinco y ≤ 60 s con cuatro por lado (`toleranciaCancha`) | tiros, mapa, reloj, momentum, cuartos, vara de la liga y el post-partido |

- El paquete suma `partidos.conTiros` y `partidos.parciales` (con su motivo);
  `excluidos` queda para lo que no entra a nada. Sigue siendo `@3`.
- **Un partido parcial viaja en `partidosPbp` con `quintetos: null`**, y el
  post-partido lo dice («pierde un cambio… el momentum, el mapa y el reloj sí
  salen»). La nota del laboratorio lo nombra aparte.
- Esto ablanda la regla del punto 62 («solo entra un partido que valida»)
  SOLO para lo que no depende de quién estaba en cancha.
- Tests: `test/test-jujuy-pbp.js` (+9) y `test-pbp.js` (+3); las dos piezas
  verificadas al revés.

### 2 · Escudos de la LAB · 34 de 34

Faltaban **UNION (SF)** y **RACING (A)**, los dos que estaban provisorios.
Bajados de `/escudos/{idClub}/{idEquipo}` del sitio de la liga
(`union-sf.jpg`, `racing-a.jpg`) y sumados al manifiesto.

### 3 · Bahía Blanca · el prefijo de división rompía DOS cosas

La federación nombra a los clubes «1° NAPOSTA». Medido en el libro el
2026-10-16:

- **En el motor** (`consolidar4Factores`): después de escribir el nombre, el
  bucle sobre `ENCABEZADOS_FINALES_4_FACTORES` volvía a copiar EQUIPO desde
  la hoja PARTIDO por `_parsearValor_` → `parseFloat("1° NAPOSTA") = 1`. Los
  82 partidos de 4 FACTORES quedaron con EQUIPO = 1 y ACUMULADO 4F /
  PROMEDIOS 4F colapsaron en un solo «equipo 1» (el Diagnóstico ya lo
  denunciaba: «Base Datos E tiene 12 equipos y PROMEDIOS 4F solo 1»).
- **En el panel** (`num()` del núcleo): el mismo `parseFloat` leía la celda
  EQUIPO como 1, así que **los 173 jugadores entraban al equipo «1»** y
  ningún plantel encontraba a los suyos. Era el «no se cargan los jugadores»:
  la hoja ACUMULADO J estaba bien.

Arreglos:

- **Panel**: `num()` devuelve `null` si la celda tiene una letra o un signo
  ordinal (la `e` queda afuera por la notación científica). Medido después
  sobre el libro real: 12 planteles de 12 a 16 jugadores. Cierra la clase
  entera: «9 DE JULIO» tampoco se lee más como 9.
- **Motor v115** (`mi-motor-stats`, detalle en su `CAMBIOS.md`): los dos
  extractores de nombre sacan el ordinal (`_quitarOrdinal_`, misma regla que
  `SGADD.quitarOrdinal`), la pestaña vieja «1° X» se sigue encontrando
  (`_hojaDeEquipo_`), 4F no vuelve a copiar los metadatos, y la acción
  `repararNombresConOrdinal` de la fachada limpia lo ya cargado y rehace el
  EQUIPO de 4 FACTORES (por ID_ARCHIVO + CONDICION desde Base Datos E).
  Sin `confirmar` devuelve el plan.

### Lo que NO está aplicado (lo corre el club)

1. **Desplegar el motor v115** a la fachada (`clasp push` + nueva versión).
2. **En el libro de Bahía, ANTES de la próxima consolidación**:
   `repararNombresConOrdinal` (plan) → con `confirmar: true` → regenerar
   acumulados, promedios (E, J y 4F) y rankings. Si se consolida antes, las
   filas viejas («1° X») y las nuevas («X») conviven y los acumulados las
   cuentan como dos equipos.
3. **Subir los paquetes de LAB Sur** con la validación nueva (ya regenerados
   en local; el respaldo quedó en `web.respaldo-2026-10-16`).
4. Push del front (`?v=284`, escudos, núcleo y `server/lib/compartido`).

## 125. BAHÍA BLANCA REPARADO EN EL LIBRO · y por qué la primera prueba no escribió (2026-10-16)

El punto 124 dejó el motor v115 desplegado, pero el libro seguía con «1° X»
en las tres maestras y EQUIPO = 1 en 4 FACTORES. **La prueba por la fachada
no había escrito nada**, por dos motivos que no dejaban rastro:

- **`confirmar=true` viajaba como TEXTO.** `llamarFachada.js` pasaba los
  `clave=valor` como strings y las acciones de escritura exigen
  `pedido.confirmar === true`: devolvían el plan con `ok: true`. Ahora
  `true`, `false` y los números viajan con su tipo.
- **Sin `operador`, la identidad llega vacía** (`NO_REGISTRADA`). Con
  `operador=<admin>` el motor confirma al administrador contra el DUEÑO de la
  planilla (`_accesoDeAdministrador_`, v104); este libro es de
  motorstats.ar@gmail.com.
- **La config del cliente**: `llamarFachada` manda la de
  `cliente/Configuracion.js`, que es la de OTRO torneo. Suma
  `config=@archivo.json`; la de Bahía se bajó del propio script
  (`2026 / BAHIA BLANCA / PRIMERA / ORO / IDA - REGULAR`) y quedó en
  `mi-motor-stats/respaldos/ordinal_2026-10-16/config-bahia.json`.

**Ni la Service Account ni clasp pueden escribir el Sheet**: la SA es de
solo lectura por diseño (punto 18 bis) y clasp no tiene el permiso de
spreadsheets. El que escribe es el motor, por la fachada.

### Lo que se hizo

1. Respaldo de las 11 hojas: `respaldos/ordinal_2026-10-16/bahia-blanca_antes_de_reparar.json`.
2. `repararNombresConOrdinal` con `confirmar`: 82 + 976 + 82 EQUIPO y PARTIDO
   limpios, y 82 EQUIPO de 4 FACTORES rehechos por ID_ARCHIVO + CONDICION.
   Verificado contra Base Datos E: 82 de 82 coinciden.
3. Regeneradas, en orden: generarAcumulados, generarAcumulado4F,
   generarPromedios, generarPromedios4F, rankingEquipos, rankingJugadores.

### Medido después con la API de Sheets

```
las 11 hojas         0 celdas con ordinal · ningún equipo «1»
derivadas            12 equipos cada una (ACUMULADO 4F 5 → 16 filas, PROMEDIOS 4F 7 → 16)
el panel             173 jugadores en 12 planteles de 12 a 16 · validarTorneo sin errores
```

### La carpeta de partidos

`1XQUy3ks…` es la de la categoría: el libro «PRIMERA ORO», «IDA - REGULAR»
VACÍA (nada pendiente) y «PARTIDOS» con los 41 archivos procesados, que son
las 82 filas de Base Datos E. Sus nombres mezclan «1º» y «1°»: los dos los
saca `_quitarOrdinal_` al consolidar, porque el nombre sale de la celda del
equipo y no del archivo. Un partido nuevo entra limpio sin tocar nada.

### Lo que NO se hizo

- **Fixture externo de Bahía** (volcala.com, abbasquet.com): quedaron como
  referencia. Sumarlos es un adaptador nuevo de `fixture-fuentes.js` (punto 70).
- El Cliente_Script de Bahía no se tocó: el motor compartido ya trae la v115.

## 127. FIXTURE DE LA LIGA, EL VIGÍA Y EL RELOJ EN TRES FRANJAS, EN EL MAPA DE TIRO (2026-10-18)

Cuatro pedidos juntos. Assets en `?v=286`. Toca el servidor, la ingesta y el panel.

### 1 · El fixture de la LAB · un lector de Gesdeportiva (`server/lib/fixture-fuentes.js`)

El link que se pega (`laliganacional.com.ar/laligaargentina/fixture`) **no trae
los partidos**: la página los pide por JS a
`/<delegación>/fixture?handler=ProximosPartidos&fechaInicio=…&fechaFin=…`. Por
eso el genérico decía «No se reconoció ninguna jornada».

- **`urlDeLectura`** es un gancho nuevo del registro de adaptadores: el
  servidor baja la URL que el lector pide, no la pegada (`refrescar` en
  `server/rutas/fixture.js`). El modo `auto` lo delega por sitio. Para la Liga:
  la delegación (primer segmento del link) y la temporada entera (el 1 de julio
  anterior, o el `desde` declarado, y un año). Un link que ya pide el fragmento
  se respeta.
- **La delegación trae las dos conferencias mezcladas y sin grupo.** La zona
  sale de los EQUIPOS: `idsPorZona(entrada)` arma, del catálogo del torneo, los
  ids de Gesdeportiva de cada zona (`config.equiposPorZona`) y el lector se
  queda con lo suyo y cuenta lo de otra zona. Un equipo que el catálogo tenga
  sin id (Unión y Racing eran provisorios) se reconoce por nombre o alias. Sin
  ids no filtra, y avisa.
- **Un partido en juego trae el PARCIAL** en las celdas del resultado (medido:
  Jujuy 19-13 Hindú en el primer cuarto). El marcador cuenta solo si pasaron
  150 min desde el inicio en hora de Argentina (`ahora`, que `refrescar` pasa);
  si no, `EN_JUEGO` sin puntos. **0-0 es sin jugar** y **«00:00» es sin hora**.
  La sede sale del `<small>`; estado y transmisión no se publican.
- `LECTORES` del Panel Master suma «Liga Nacional / Argentina» (la copia de
  `SITIOS` que un test compara).
- Medido contra el sitio el 2026-10-18: **Norte 68 partidos, Sur 76** (los 144
  publicados hasta noviembre), 8 jugados, 2 en juego. Fixture real recortado en
  `test-fixtures/lab/fixture-delegacion.html`. `test-fixture-auto.js` 3 bis y 3 ter.

### 2 · El vigía · la ingesta apenas termina un partido (`motorstats-ingestion`)

La tarea de las 02:00 y las 10:00 sigue igual. Se suma **una segunda tarea de
Windows, «MotorStats Vigia»**, que arranca `herramientas/vigia.cmd` al iniciar
sesión y queda corriendo mientras la PC está prendida:

- mira el fixture de las tres competencias (LNB, LAB Norte, LAB Sur) en una
  ventana corta (ayer y hoy), sin caché, una petición por delegación;
- apenas un partido **terminó** (marcador y 150 min desde el inicio) y no está
  en el `estado.json` de su competencia, dispara `correr-lnb.js --solo <id>
  --fresco` (y `--reintentar` si estaba en cuarentena): sitio → Drive → motor →
  libro, y los tiros al KV;
- con partidos en juego mira cada 5 min; si no, cada 30 como mucho. Un partido
  que no entra se reintenta cada 20 min, hasta 4 veces, durante 6 horas; después
  queda para la tarea.

Piezas: `src/vigia.js` (PURO: `terminado`, `listos`, `proximaMirada`),
`src/corrida.js` (la lista de competencias, que antes vivía adentro de
correr-lnb.js, y el **candado** `salida/.corrida.lock`: la tarea y el vigía
nunca corren a la vez; un candado de un proceso muerto o de más de 70 min es
viejo), `herramientas/vigia.js` (el bucle) y `test/test-vigia.js`.

**Y un defecto que cerraba la puerta a esto:** `sincronizar.js` tomaba como
jugado cualquier fila con marcador, o sea el parcial de un partido en juego, y
su página quedaba en el caché PARA SIEMPRE (`ttlMs: null`). Ahora filtra con
`V.terminado` y lo dice. `--fresco` pide el fixture sin el caché de una hora.

    powershell -ExecutionPolicy Bypass -File herramientas\programar-tarea.ps1 -Vigia            (muestra)
    powershell -ExecutionPolicy Bypass -File herramientas\programar-tarea.ps1 -Vigia -Registrar
    node herramientas\vigia.js --ensayo                                                          (una mirada, sin disparar)

### 3 · El reloj de posesión en TRES franjas · 0-7 · 8-17 · 18-24 s

En la ingesta (`src/pbp/reloj.js`) y en todo el panel. Los ids que conservan
el sentido se quedan (`temprana`, `media`, `tardia`); `armada` desaparece. Los
cortes de la competencia son uno por franja, de equipo y de jugador
(`cortes.equipo.medio` y `.armada` ya no existen).

- **Medido en la Conferencia Norte con las tres:** Pts/tiro caen franja por
  franja; los cuartos altos de equipo arrancan en 23,1 % (temprana), 49,4 %
  (media) y 36,9 % (tardía) — la tardía pasó a ser casi un tercio de los finales.
- **Arquetipos (9):** el Plan A y el Plan B de antes son ahora UNA ventana, la
  del juego armado: «Sistemático · eficacia en el juego armado» y «Juego armado
  estéril». Se suma «Sangre fría al final del reloj» (18-24 con volumen alto y
  rendimiento por encima). En defensa, «Vulnerable ante el juego armado» y la
  muralla sobre 18-24.
- **Un paquete con las cuatro franjas de antes no se remapea** (los bordes no
  coinciden): el panel lo dice (`relojFormaVieja`) y el reloj vuelve con la
  próxima subida de los paquetes.

### 4 · El reloj se mudó a la card de MAPA DE TIRO, con mapas completos por franja

- **Equipos → Mapa de tiro** (y la card del rival en Scouting) traen, abajo del
  mapa principal, todo el reloj (`relojMapaTiro`): perfil de ritmo, barras,
  tablas, cómo nace la posesión, el insight por bloque, armas y grietas y las
  recomendaciones. **Personalidad** vuelve a ser solo los 8 ejes, y la card de
  Quintetos de Scouting ya no lo trae (su lectura y «quién tira temprano / tarde»
  van en la de Mapa de tiro, `relojLecturaScouting`).
- **Cada franja tiene el MAPA COMPLETO.** La ingesta suma a cada tiro de
  `tiros.detalle.puntos` su código de reloj (6.º elemento: 0..2 la franja, 3 tras
  rebote ofensivo, 4 tras falta, −1 sin reloj; `RELOJ.franjaPorTiro`, misma
  unión por posición que la familia del tiro). El panel no tiene un segundo
  mapa: `paqFranja(paq, k)` recorta los puntos de esa franja y re-agrega zonas y
  hexágonos (`hexDePunto`, la fórmula de la ingesta), y eso va al MISMO `mapa()`:
  zonas por eficiencia, hexágonos, diagnóstico, tabla enlazada y los círculos y
  cruces. La caja lleva `data-pbp-franja`, así los conmutadores y la capa de tiros
  siguen en su franja. La vara de cada zona es la de la liga con todas las
  franjas juntas (el paquete no trae la liga por franja y zona), y se dice al pie.
- **Tarjetas de tendencias al pie** (`relojTendencias`), por franja × familia de
  zona con el ajuste por muestra de siempre (20 tiros de liga): **Puntos altos**
  (desvío ≥ +0,05 con 15 tiros, por puntos de más), **Puntos de fuga** (≤ −0,05,
  por puntos perdidos, separando volumen alto —15 % o más de la franja— del bajo)
  y **Top 3 por zona y franja** (quién tira más en cada franja, con su C/I, su
  Pts/tiro y la zona desde donde más tira).
- El paquete con códigos pesa más: Amancay (Conferencia Norte) 192 KB.
  **`MAX_KB` de `server/bin/pbp.js` subió de 200 a 256.**

### Para producción (lo corre el club)

1. Backend (el lector de la Liga y los ids por zona): `cd server && npx vercel --prod`.
2. Push del front (`?v=286`).
3. Pegar el link de la LAB en Panel Master → Liga Argentina 2026-27 → 📅 Fuente
   del fixture (en las dos zonas) → Guardar → «Probar lo guardado».
4. Subir los paquetes regenerados (tres franjas + franja por tiro), en
   `motorstats-ingestion`: `node herramientas/subir-paquetes.js --confirmar`.
   Hasta eso, el panel muestra el aviso de las franjas viejas.
5. Registrar el vigía: `programar-tarea.ps1 -Vigia -Registrar`, y arrancarlo.

---

## 128. LOS PAQUETES DE CUATRO FRANJAS SE CONVIERTEN AL VUELO · Y LA CARD TIRO POR FRANJA (2026-10-18)

Con el punto 127 en producción, los paquetes que ya estaban en KV (cuatro
franjas) mostraban «paquete antiguo» en Equipos y en el post-partido. Pedido
del club: ningún partido puede quedar sin reloj. Assets en `?v=287`. Solo panel.

### 1 · `SGADD_PBP.normalizarReloj(paq)` · 4 → 3 al leer

```
0-7   ← 0-6 + un octavo de 7-14 (el segundo 7)
8-17  ← el resto de 7-14 + la mitad de 15-20
18-24 ← 21-24 + la otra mitad de 15-20
```

- **Por CUENTA y sin decimales** (tiros, convertidos, puntos, triples,
  asistidas, pérdidas): se redondea la parte que se mueve y el resto queda en
  la otra franja, así las sumas se conservan y un C/I nunca sale «10,5/21».
- Convierte el reloj del equipo (favor, contra, cada jugador, las familias de
  zona), la vara de la liga y el reloj de cada partido de `partidosPbp`.
- **Los cortes de la competencia se escalan** por el cambio de reparto de la
  liga en esa franja. La franja media de un JUGADOR no tenía corte: queda sin
  evaluar en un paquete convertido.
- **Se aplica en la entrada**: `pedir()` (todo lo que monta `montarPendientes`)
  y cada función pública del reloj y del mapa (`mapaCard`, `jugador` —que usa
  Fichajes—, `relojPartido`, `relojMapaTiro`, `relojEquipo`…). Es PURA,
  idempotente y con caché: un paquete de tres franjas vuelve como el mismo
  objeto, y el original nunca se toca.
- **Es una aproximación y se DICE** (`AVISO_CONVERTIDO`, con ≈, en cada
  superficie). Medido contra el dato exacto de los 17 equipos de la Conferencia
  Norte (respaldos viejos contra paquetes regenerados): **error medio de 0,5 ·
  1,6 · 1,4 puntos de reparto por franja**; el cuarto alto de la temprana da
  23,1 % en los dos. Sin el octavo del segundo 7 la temprana quedaba 3,4 puntos
  corta: por eso está.
- Lo que **no** se puede convertir es la franja de cada tiro: los mapas por
  franja de un paquete viejo siguen diciendo que llegan con la próxima subida.
  **La solución exacta sigue siendo subir los paquetes regenerados.**

### 2 · La card TIRO del jugador · cuándo y desde dónde tira

`relojJugadorFranjas(paq, id)`, debajo de la tabla del reloj del jugador
(Jugadores → Tiro y la Radiografía de Fichajes): tres tarjetas de volumen
(% de sus tiros, C/I, puntos por tiro contra la liga, asistidas y pérdidas) y
el **mapa completo del jugador en cada franja**. `paqFranja` ahora re-agrega
también a cada jugador, así el mismo `mapa()` dibuja su sujeto en la franja y
los conmutadores y la capa de tiros siguen en ella.

### 3 · El perfil del jugador en la franja media, y el manual

`relojPerfilJugador` suma la franja MEDIA (8-17 s, con su corte de jugador):
**«Ejecutor del juego armado»** (las canastas ahí llegan con asistencia: el
sistema lo busca), **«Creador en el juego armado»** (las crea él) y **«Tira en
el juego armado»** (menos de 5 canastas). No entran en las listas de quién tira
temprano y tarde. La metodología suma dos criterios —«La card Tiro de cada
jugador» y «Paquetes de cuatro franjas»— y de ahí salen el Glosario y el
manual de etiquetado (regenerado). En la Conferencia Norte el cuarto alto de un
jugador en 8-17 arranca en 51,6 %.

Tests: `test-pbp.js` sección 7 (retrocompatibilidad, card Tiro, franja media).
Verificado al revés: sin la conversión caen 5; sin el octavo del segundo 7, 3.

### Para producción

1. Push del front (`?v=287`).
2. Igual conviene subir los paquetes regenerados (`node herramientas/subir-paquetes.js --confirmar`
   en `motorstats-ingestion`): trae el dato exacto y la franja de cada tiro.

---

## 156. EL POST-PARTIDO EN BENTO · QUÉ DECIDIÓ, QUINTETOS EN EL MOMENTUM Y EL PLAN DE AJUSTE (2026-10-30)

Corte 4 (v330). Assets en `?v=330`. `test-partido.js` fija el motor del box score y `test-pbp.js` (sección 8) las piezas del play-by-play.

### Lo que la planilla NO dice, y por eso no se escribe

El pedido traía lecturas como «la presión secó la línea de pases» o «el pivote castigó desde el poste alto». **El box score no trae posición ni tipo de jugada**, y el tiro del play-by-play no trae quién lo tiró por zona. Las tarjetas dicen quién hizo qué y con cuánto; lo que es lectura va marcado como lectura y un test falla si aparece «pivote», «presión que» o «secó». El «interior pasador» sale de CÓMO jugó (3+ asistencias y 5+ rebotes), no de un puesto.

### Motor del box score · `SGADD_PARTIDO.decision(idx, lp, lr, a)`

- **Qué decidió**: el factor de mayor IMPACTO = diferencia entre los dos × el peso de Dean Oliver (40 · 25 · 20 · 15, el prior del Simulador). Cada tarjeta nombra al responsable (`responsableFactor`): quién anotó y metió triples, quién perdió y quién robó, quién tomó rebotes ofensivos, quién fue a la línea.
- **Contra el habitual y la liga**: cada factor trae el promedio de temporada de los dos equipos y la mediana de la liga. `critico` = factor perdido Y bajo lo habitual por el umbral de `CONTRASTE_EQUIPO`.
- **El modelo contra lo que pasó** (`proyeccionPartido`): el margen del Simulador contra el real. **El modelo se arma con la temporada completa, este partido incluido**: es una vara, no una predicción previa, y la tarjeta lo dice.
- **Focos a sostener** (`focosPartido`), también en una derrota: factores ganados sobre su habitual y lo que el rival bajó contra el suyo. Una clave que ya es un factor no se repite.
- **Plan de ajuste** (`planAjuste`): contención perimetral sobre el rival que más repartió o anotó (por su tiro exterior: no pasar por abajo si metió, ir por abajo si falló) y poste alto sobre el interior pasador. La tercera directriz, el reloj, la completa el play-by-play.
- `ctx` viaja al montaje del paquete: los generadores rivales con el nombre de planilla, los que más dobles intentaron y los rebotes.

### Los tramos del paquete (ingesta)

`partidosPbp[i]` suma `ids` y `tramos`: la cancha tramo a tramo `[desde, hasta, cinco propios, cinco rivales, diferencia al empezar, al terminar, período]`, con índices a `ids`. Dos tramos seguidos con los mismos diez se unen. **Solo con cinco en cancha siempre** (igual que `quintetos`). Suma ~1,5 KB por partido: el paquete más pesado de la Conferencia Norte quedó en 230 KB contra el techo de 256. `test/test-jujuy-pbp.js` (110) fija que los segundos de cada lado sumen 5 × el tiempo y que las diferencias empalmen con el marcador final. **Los paquetes de KV no los traen hasta la próxima subida** (`subir-paquetes.js --confirmar`); sin `tramos` el momentum se dibuja igual y dice que los quintetos llegan después.

### Piezas del play-by-play (`js/sgadd-pbp.js`)

- **Momentum**: marca el pico de ventaja y el de desventaja en el gráfico y debajo, por cada uno, la corrida que lo armó (el mínimo de los seis minutos anteriores), el período y el reloj, el quinteto de cada lado con más tiempo en esa ventana, sus segundos y su +/-, y si el generador rival (★) estuvo en cancha durante el bache.
- **Rotaciones** (`rotacionesPartido`): una barra por tramo continuo de cada jugador, con el +/- de SU equipo adentro (el del rival, con el signo dado vuelta). Color y signo van juntos.
- **Lectura del cierre del set** (`cierreDelSet`): el rival en 18-24 s contra la liga. Con 5 tiros o más y 0,20 puntos por tiro de diferencia se marca «cierre castigado» o «bien defendido»; menos, nada. **No separa pérdida de concentración de una buena resolución con el reloj en contra**, y lo dice. Lo mismo para 0-7 y 8-17 s.
- **Pintura rival** (`pinturaRival`): Z1 a Z4 contra la liga, con los rebotes ofensivos rivales y los que más dobles intentaron. «Rompieron la primera línea» solo con 8 tiros o más y 0,15 sobre la liga, y aclara que el tiro no trae quién penetró.

### Lo que NO se hizo

No se agregó un tercer tipo de dato al tiro (quién lo tiró por zona): el gancho está pero necesita un cambio de la ingesta. Tampoco se regeneró `sgadd.css`: las clases nuevas (`rot-*`) van a mano en el `<style>`.

---

## 157. POST-PARTIDO v331 · SIN PBP NO HAY BLOQUE, EXPECTATIVA SIN SIMULADOR, DOBLE BASELINE Y PLAN EN 4 ACCIONES (2026-10-30)

Assets en `?v=331`.

- **Sin play-by-play de ese partido, la sección desaparece**: `vacio()` lleva `data-pbp-vacio` y `montarPendientes` quita el bloque (`sinDatosPartido` / `quitarSeccionPartido`) en momentum, rotaciones, lectura, reloj, mapa, quintetos y la directriz del reloj; un fallo de carga también. Sin la capa ya no se pintaban.
- **Se fue la palabra «Simulador»** del post-partido: la tarjeta es «Expectativa contra realidad» (margen esperado, % de victoria estimada, desvío de la noche). Sigue siendo una vara con la temporada completa, no una predicción previa.
- **Doble baseline en eliminación**: `factoresPartido`/`decision` reciben `idxReg` (`SGADD_APP.idxRegular()`) y cada factor trae `regular` y `deltaRegular`, además del habitual de la fase actual. La tarjeta muestra las dos referencias.
- **Radar de los 4 factores** (`chRadarPartido`) debajo de las tarjetas, cada eje contra el mejor de los dos.
- **Plan de ajuste en 4 acciones** (`planAjuste`: perimetro, interior, generacion, segundas), sin puestos: sale de triples y dobles convertidos, asistencias y RO% contra la liga. «Cerca del aro» usa dobles del box (la zona Z1 exacta necesita el play-by-play). Se fue «interior que juega de pasador».


## 158. EL POST-PARTIDO RESPONDE AL SCOUTING · vara previa, plan contra la realidad y porcentajes sin intentos (2026-10-30)

Assets en `?v=332`. Salió de auditar el scouting vs San Isidro (28/10) contra el post-partido del 29/10.

### La vara es la PREVIA
El «habitual» del post-partido salía del índice del tramo, que ya incluye el partido: San Isidro llegaba con 1 partido y su eFG% habitual (62,6 %) era el promedio de ese partido y del analizado. `SGADD_APP.idxPrevio(fecha)` arma el índice con lo jugado en los días ANTERIORES (`SGADD_MUESTRA.recortar` + el motor del TOTAL), cacheado por día. `analizar(idx, part, lado, { base })` y `decision(..., { base, previa, plan })` miden habitual, desvíos de jugador, focos y simulador contra esa base. `base: null` (sin partidos previos) = sin habitual y sin expectativa, y se dice. Sin opciones, todo como antes.

### Tres correcciones de lectura
- El factor perdido con nuestro número en o sobre lo habitual y el del rival sobre el suyo se rotula «· en defensa», y cada ficha trae su propio tono (antes ▼ a un eFG% propio que había mejorado).
- Un foco ganado al rival pero bajo lo habitual dice «ganado, bajo lo habitual».
- La expectativa dice «PREVIA, con los N partidos hasta el DD/MM».

### 📋 El plan contra la realidad · `SGADD_PARTIDO.planContraRealidad(idxPre, idx, lp, lr)`
Rearma `SGADD_SCOUT.informePrePartido` con el índice previo y contrasta, con veredicto ✓ cumplido · ◐ a medias · ✗ no cumplido · ◆ sin veredicto:
- **duelos cruzados**: el ataque de cada uno esa noche contra lo que la otra defensa concedía antes (el valor del rival cae a la columna «Opp» de nuestra fila si el suyo no viene);
- **margen previsto** (cumplido si se terminó en o sobre lo previsto, con 4 pts de tolerancia);
- **versión perdedora**: su métrica de quiebre esa noche contra el corte;
- **volúmenes** del rival (fuera de su zona positiva) y nuestros (adentro);
- **FODA** (oportunidades aprovechadas, amenazas que se dieron) y **las 3 cosas**;
- **marcas jugador por jugador**, por grupo del plan colectivo: el que no se suelta por sus triples, el foco por sus puntos contra el promedio previo (y si el doble le abrió el pase), la fuente de ayuda por sus dobles, el box-out por sus rebotes ofensivos, más la línea si promediaba 3+ libres.

El **plan de ajuste** recibe ese plan: si nombra a un jugador con marca, dice si la consigna se sostiene o cambia («El plan decía «UNDER…»: con ese acierto hay que cambiar la consigna»). Va arriba de todo en el post-partido.

**Límites:** el plan se RECALCULA, así que no trae las consignas que el DT editó a mano en la tabla de marcas (para eso hay que guardar el plan firmado al exportar; no está hecho). Con el libro de un cliente (Base Datos J recortada) las marcas salen con la temporada completa y la card lo dice. Los cuartos no se contrastan todavía (necesitan el paquete del play-by-play).

### Sin intentos no hay porcentaje
`jugadoresPerfilBase`: con T1I, T2I o T3I en 0, la tasa y el puntos-por-tiro son null. La hoja de promedios traía 0 y el scouting decía «T1% 0,0 %: cortar con falta cuesta menos que sobre cualquier otro» de cinco jugadores que nunca habían tirado un libre. Un 0 % con intentos sigue siendo un dato.

### No verificado
El PDF del post-partido con la card nueva, y el cruce real San Isidro vs Jujuy (verificado sobre la demo).


## 159. EL POST-PARTIDO DE UN GOLPE DE OJO · plan en mosaico, radar de 8 ejes, % de victoria y la corrida con quién la armó (2026-10-31)

Assets en `?v=333`. Pedido del club sobre el punto 158: demasiado texto.

- **📋 Plan contra realidad es un mosaico de números** (`.plan-g` / `.plan-t`): cada pieza dice «antes → esa noche» y el número de la noche lleva tono verde/ámbar/rojo y un glifo ✓ ◐ ✗. Las 3 cosas son chips (la frase va en el `title`); las frases completas, plegadas en «Ver el detalle». `planContraRealidad` devuelve `datos` por fila (duelos: `ellos`/`nos` con `antes`, `contra`, `real`, `tono`; margen; quiebre; volúmenes con `tono` por ítem). «Cerca» (ámbar): 2 pp en las tasas, 4 pts en el margen, 10 % del umbral en los volúmenes.
- **De las marcas solo va el top 3 de daño** (`danio`): los que no cumplieron su consigna, por los puntos sobre su promedio previo. El resto ya está en el box score.
- **Radar de 8 ejes** (`SGADD_PARTIDO.radarPartido` + `equiposRadarSvg`), como el de ElStatsLab: NET, DRTG, REB%, OREB%, TOV%, AST%, eFG%, ORTG, con **escala fija por métrica** (`RADAR_EJES`) y DRTG y TOV% invertidos. SVG (sale igual en el PDF), con los dos valores escritos en cada eje. Reemplaza al radar de Chart.js de 4 ejes.
- **Los colores salen del escudo** (`equiposColoresCruce`: `CLUB.colorDeImagen` + `aclararHastaLegible`). Si los dos se parecen (distancia < 140, o el mismo escudo) el rival pasa al color más lejano de una paleta. Sin escudo: el acento del club y gris.
- **Barra de % de victoria previa** (`equiposBarraVictoria`), debajo de «Qué decidió el partido», con la probabilidad del simulador PREVIO (punto 158).
- **Momentum**: la brecha de cada corrida va sombreada (`.mo-banda`) desde donde arrancó hasta el pico, con el parcial arriba, y la tarjeta del pico dice **quién la armó** (`anotadoresEn`: puntos de cada jugador del lado que la hizo dentro de la brecha).

### Ingesta
`porPartido` (`motorstats-ingestion/src/pbp/avanzado.js`): cada punto de `linea` suma un cuarto elemento, el índice del anotador en `ids` (−1 si el PBP no lo trae). Un paquete sin él no dice «La armaron» (no se inventa). **Hay que regenerar y subir los paquetes** (`node herramientas/subir-paquetes.js --confirmar`) para verlo en producción.

### No verificado
El PDF del post-partido con el radar SVG, la barra y el mosaico (las reglas de papel están escritas). Probado en el navegador sobre la demo, donde todos los equipos comparten escudo.

## 160. EN UN PLAYOFF, LA VARA PREVIA DEL POST-PARTIDO ES LA REGULAR (2026-10-31)

Assets en `?v=334`. Reportado en Reconquista - Atenas (playoff, dos cruces en la Regular): «📋 Plan contra realidad · No hay partidos anteriores a esta fecha». `idxPrevio` (punto 158) recortaba el TRAMO ABIERTO, o sea la fase de playoff, y el primer partido de una serie no tiene nada antes en su fase.

- En una fase de eliminación, `idxPrevio` usa la Regular de esa fase (`SGADD_MUESTRA.baseDeTramo`, el mismo criterio de la doble base del punto 157, con la carpeta al revés resuelta) recortada al día anterior. Las fases no se mezclan: los partidos previos de la propia serie no entran a la vara.
- Devuelve `tramo` (el rótulo de la Regular), y la expectativa y la nota del plan lo dicen («…hasta el DD/MM (Ida - Regular), sin este»).
- `test-muestra.js` arma un libro con un partido de PLAYOFF y lo fija; sin el arreglo cae.
- **No verificado contra el libro real de Reconquista**: la demo no trae playoffs.

## 161. LA CEGUERA ENTRE FASES · SIMULADOR, SCOUTING Y LOS HISTORIALES (2026-10-31)

Assets en `?v=335`. En una fase de ELIMINACIÓN el índice abierto trae solo esa fase, y varias secciones quedaban ciegas (Simulador con «confianza 97 %» sobre un partido por equipo; Jugadores → Partidos con «1 PJ» y sin tendencia). La regla que se aplicó: **los promedios y las varas de liga NO mezclan fases; las líneas de tiempo de un equipo o jugador SÍ se leen de corrido.**

- **Simulador**: en eliminación el modelo (ratings, localía, pesos de los 4 factores) se arma con la Regular (`SGADD_APP.idxRegular`) y la pantalla lo dice («Modelo armado con la Regular»). Fuera de una eliminatoria, igual que siempre.
- **Scouting**: `scoutBase()` = la Regular en eliminación, el índice abierto si no. Los rivales de otra zona se injertan en ese mismo tramo. Avisa «Informe armado con la Regular».
- **Jugadores → Partidos / Evolución**: `jugadoresHistoria(idx, clave)` antepone los partidos de la Regular (marcados `Reg.`, sin enlace a un detalle que no existe en la fase abierta) y `jugadoresStatDe` calcula la banda de consistencia y las tendencias sobre ese historial; un partido en las dos fases no se cuenta dos veces.
- **Equipos → Evolución** de puntos a favor/en contra: `equiposHistoria(e)`, mismo criterio.
- **Post-partido**: se sacó de la tarjeta de expectativa la frase «Es la expectativa PREVIA: el simulador con los N partidos…»; el corte sigue en `decision().previa`.
- **Sin cubrir**: Comparativa (solo admin) sigue leyendo el tramo abierto; Clasificación y Fixture son por fase a propósito. **No verificado con un libro real con playoffs** (la demo no los trae).

## 165. EL INFORME DE CICLO NATIVO · la réplica del Artifact «Jujuy Básquet · Ciclo 0» (2026-11-06)

`js/sgadd-cicloinforme.js` reconstruye en la sección Ciclos, con los datos vivos, el
Artifact armado a mano (https://claude.ai/artifact/C6Kc6X4twmjm6ULawVfFQA): las seis
secciones con TODAS sus cards, en el mismo orden. Assets en `?v=351`. `test-cicloinforme.js`.

- **Una función por card** (`cardResumen`, `cardFuga1`, `cardRotacion`, `cardPlan`…), cada una
  con su cabecera `§` que dice de dónde sale cada número: se mejora una card sin tocar las demás.
  `armar(ctx)` junta las fuentes; `html(modelo, seccion)` pinta. El estilo (`.ci-*`, tokens del
  Artifact en el tema oscuro y su variante de papel) lo inyecta el propio módulo.
- **Fuentes**: el índice del libro abierto (la vara de la liga y las filas del equipo y de los
  jugadores en las fechas del ciclo), el paquete de laboratorio (ciclos, `partidosPbp` con tramos
  de cancha y línea de tanteo, reloj por partido, detalle de tiros por jugador, clutch), el modelo
  del Simulador (NET ajustado y lectura de los próximos partidos) y el fixture vivo de la liga
  (`SGADD_DATA.fixtureDeTorneo`: sedes, horas y próximos partidos; el archivo del torneo es respaldo).
- **Lo calculado acá, y cómo**: los promedios del ciclo salen de `agregarPartidos` (totales ÷ PJ,
  tasas sobre totales, PACE por 40 minutos jugados); el puesto saca de la distribución la temporada
  del propio equipo y pone el valor del ciclo. Dúos, tríos, quintetos y on/off salen de los TRAMOS
  de cancha con los puntos de la línea de tanteo; **las posesiones de cada tramo se estiman con el
  ritmo de ese partido** (el play-by-play no marca la posesión) y la card lo dice. Los jugadores del
  ciclo se suman de `Base Datos J` filtrando por equipo (punto 86); USG% con la fórmula de la planilla.
- **Metas reales = mitad del camino** hasta la liga o el escalón siguiente del panel (p70 / p40);
  escenario prudente = la mitad de la suma, porque las metas se pisan. Igual que el Artifact.
- **Lo que el dato no trae se dice**: el tiro de cada partido no trae al tirador ni su franja, así
  que «quién tira en la zona», los mapas por franja y por jugador salen del detalle de TEMPORADA del
  paquete y lo rotulan. Bajas del rival: no se suponen. Clasificación: escenarios, no proyección.
- **El servidor** (`server/rutas/ciclos.js`): `paqueteDe` lee el hash propio de la categoría y el de
  la zona del torneo y se queda con el que trae el partido de ciclo MÁS RECIENTE (la categoría LAB
  2026-27 de Jujuy guardaba el paquete de 2025-26 y tapaba los partidos de 2026). Sellar usa la misma
  elección. La proyección de ADMIN suma `tiros`, `jugadores`, `clutch` y `partidos`.
- **Sin el módulo, o si no se puede armar**, la sección cae a los bloques anteriores de
  `sgadd-ciclosui.js`. Las herramientas de admin (auditoría, sello, comparar, historial) van al pie
  de Principal.

### La segunda vuelta (2026-11-06, `?v=354`) · los números y la voz del Artifact
- **La liga se mide AL CIERRE del ciclo** (`SGADD_APP.idxPrevio(día siguiente al cierre)` en
  `sgadd-ciclosui.js`): un ciclo cerrado no cambia cuando la liga sigue jugando. Con eso los puestos,
  medianas y el NET ajustado dan los del Artifact (PACE liga 78,0, eFG 50,6 %, 15/17, −6,9).
- **`diaDe` del app leía «AAAA-MM-DD» como medianoche UTC** y en Argentina caía el día anterior:
  `idxPrevio('2026-11-03')` cortaba el 01/11. Corregido en el origen.
- **Los parciales salen de la línea de tanteo del play-by-play** (`porPeriodo`): el bloque `ciclos`
  del paquete SUMA el suplementario al 4.º cuarto. El suplementario va aparte (4.º 17,5 / 19,0).
- **+/- de quintetos y on/off: la plataforma es la correcta** (diferencia de cada tramo de la ingesta,
  suma −45 = el margen real); el Artifact tenía otra atribución.
- **Mediana de jugadores = fila JUGADOR TIPO** (PPP 0,94, USG 19,1 %), como el Artifact.
- **Percentil de rango medio** en `ubicar` (2.º de 17 = 91, 17.º = 3), el del Artifact.
- **Los 4 Factores con los pesos del Simulador** (`modeloDe(idx).pesos`): diferencial neto × peso.
- **Minutos por partido DEL CICLO** (Caicedo 11,6, no 15,4 por los que jugó).
- **Metas**: el PLAN lleva a la liga el juego armado, la zona fría, las pérdidas, el T3% y la
  transición defensiva; la defensa del juego armado va a la mitad porque se solapa con el triple de
  ala del rival (que no entra a la tabla y se dice). El TABLERO mide la meta real (mitad del camino).
- **Escenarios con la tabla final de la temporada anterior**: el archivo del torneo declara
  `temporadaAnterior.categoriaPorClub` (slug, sin sheetId) y la sección pide ese libro
  (`pedirAnterior`). Sin la declaración, los escenarios quedan sin puestos y lo dicen.
- **Síntesis interpretadas en todas las cards** (resumen, ejes, partido a partido, fugas, hoja de ruta
  con «Optimizar», personalidad con filosofía híbrida del ciclo y los 8 ejes, arquetipos de ritmo,
  quintetos, cuartos con cierre del ciclo, jugadores, SOS sin el partido contra nosotros, ventanas,
  qué esperar) y la firma «Elaborado con los datos de MotorStats AR al …».
- **Lo que sigue saliendo de la TEMPORADA del paquete** (y se dice): quién tira en cada zona, los
  mapas por jugador y por franja. Para que sean del ciclo, la ingesta tiene que agregar el tirador y
  la franja a cada tiro de `partidosPbp`.

### La tercera vuelta (2026-11-06, `?v=355`) · el tirador, la franja y el ritmo, del ciclo
- **Ingesta** (`AV.porPartido`): cada tiro de `partidosPbp` es
  `[lateral×10, fondo×10, convertido, zona, tirador, reloj]` (tirador = índice en `ids`, −1 sin
  dato; reloj = el código de `franjaPorTiro`), de los dos lados, y cada partido suma `juego`
  (`juegoPorCuarto` de ese partido: ritmo, eFG, ORTG/DRTG, pérdidas y faltas por cuarto).
  `test/test-jujuy-pbp.js` exige que los tiros por jugador y las franjas sumen lo mismo que el
  detalle de temporada.
- **Panel** (`detalleDe(X)`): quién tira en cada zona, los mapas por jugador, los mapas por franja
  y la lectura de cada jugador salen SOLO de los partidos del ciclo, con la misma forma que
  `paq.tiros.detalle`. Un paquete anterior (tiro de 4 elementos) vuelve al detalle de temporada
  y la card lo dice. `ritmoCuarto(X, k)` pone el ritmo en la pregunta «¿Filosofía?» del peor cuarto.
- Paquete de LAB Norte regenerado en local; **sin subir**.

### Para producción
1. Deploy del backend (`cd server && npx vercel --prod`): sin él, producción sigue sirviendo el
   paquete viejo de 2025-26 para la categoría LAB 2026-27.
2. Push del front (`?v=355`).
3. Subir los paquetes regenerados (en `motorstats-ingestion`:
   `node herramientas/subir-paquetes.js --confirmar`). Hasta eso, el ciclo sigue con el detalle
   de temporada y sin el ritmo del 3.º cuarto.

### Pendiente para acercarlo más al Artifact
- **Los textos de lectura** (proceso contra resultado, cinco preguntas del peor cuarto, fortaleza /
  fuga / ajuste por jugador) son reglas simples sobre el dato: se refinan card por card.
- **El NET sin el partido contra nosotros** en el SOS y la tabla de la temporada anterior en los
  escenarios de Clasificación (hoy no se cargan: se dice).
- **No verificado en PDF** ni con un link de cliente.

---

## 166. CERRAR UN CICLO · SELLAR, PUBLICAR Y MANDAR, Y EL CUERPO TÉCNICO VE SOLO LO PUBLICADO (2026-11-06)

Assets en `?v=356`. `test-ciclospublicar.js` (sección 6) y `test-ciclosui.js` fijan todo.

- **Un paso desde Ciclos** (admin, ciclo cerrado): «📣 Sellar, publicar y enviar…» abre un modal con
  dos decisiones: *sellarlo y publicarlo en la plataforma* y el mail (*no mandar* · *solo a mi mail
  (prueba)* · *a los usuarios del club*). `POST /api/v1/ciclos/:club/:cat/cerrar`
  (`manejarCerrar`), solo ADMIN.
- **La FOTO** (`server/lib/ciclos-foto.js`): el navegador del admin manda el HTML de las 6 secciones
  del informe nativo con su estilo. El servidor recalcula el ciclo y exige la misma huella (si no,
  409 `CAMBIO`), guarda la foto comprimida en `sgadd:ciclos-foto:<club>:<cat>` (gzip + base64: 384
  KB → 62 KB) y de ella sale el PDF del mail (`documento`: una sección por hoja, papel claro,
  `<details>` abiertos, `<base>` al panel publicado). Medido con el Ciclo 0 real: 25 hojas A4, 966 KB.
  Solo esta ruta acepta un cuerpo de hasta 4 MB (`app.js`, `RUTA_CERRAR`); el resto sigue en 16 KB.
- **«Solo a mi mail» sin publicar** no sella ni publica: es la prueba de punta a punta, al mail de la
  sesión del admin, con «[PRUEBA]» en el asunto.
- **El envío a los entrenadores está APAGADO EN EL SERVIDOR** hasta `CICLOS_ENVIO_CLIENTES=si`
  (variable de entorno de Vercel): `/cerrar` con `enviar: 'equipo'` y el `/publicar` viejo de
  Comparativa contestan 403 `ENVIO_EN_PRUEBA`. La pantalla lo muestra deshabilitado.
- **El cuerpo técnico ve solo lo publicado**: `GET /publicados` (lista con meta) y `GET /foto` (el
  informe tal cual se publicó). `/paquete` pasa a ser solo de ADMIN (403 `SOLO_PUBLICADOS`: con el
  paquete el cliente armaría el ciclo en curso) y `/ciclos` le devuelve al cliente solo los sellos
  publicados. Un publicado no se vuelve a publicar; sí se puede volver a mandar con la foto guardada.
- **Consecuencia al desplegar**: los clientes ORO que hoy ven Ciclos en vivo pasan a ver «Todavía no
  hay ciclos publicados» hasta que el admin publique el primero.
- Se arregló `fechaCorta` de `sgadd-ciclosui.js` (la expresión había perdido las `\d`).
- **No verificado con sesión en el navegador** ni contra Gmail real: probado con KV y transporte de
  mentira, y el PDF con el Chrome local.
- **Mail probado contra Gmail real el 2026-11-06** («Solo a mi mail»): llegó bien.

### Las fichas del mail y la vista previa del cuerpo técnico (2026-11-06, `?v=357`)
- **El resumen del mail va en fichas** (`mail-ciclo.js`: `numerosCiclo`, `bentoHtml`): Récord,
  Diferencia (con la de cada partido), Puntos a favor y en contra por partido, en tarjetas oscuras
  como las del panel, dos por fila, con ▲ ▼ ● además del color. Tablas y estilos en línea: los
  clientes de correo no leen grid ni flex. Las fechas van en DD/MM/AAAA, también en el asunto.
- **El párrafo del resumen solo va si el cuerpo de análisis lo EDITÓ** (`lecturaEditada` en
  `server/rutas/ciclos.js`): el automático ya lo dicen las fichas.
- **Vista previa en Ciclos (admin)**: barra «Vista» con Admin · 👁 Cuerpo técnico · hoy · 👁 Cuerpo
  técnico · si publicás este ciclo. Usa la MISMA `htmlCliente` (ahora acepta una fuente):
  «hoy» es lo publicado de verdad (pide `/foto` con el token de admin); «si publicás» suma el ciclo
  abierto con la foto que se mandaría (`fotoDelInforme`). No escribe nada.

---

## 170. EVOLUCIÓN · LAS METAS DEL CICLO ANTERIOR CONTRA EL CICLO NUEVO, Y EL LINK DEL MAIL (2026-11-08)

Assets en `?v=364`. `test-cicloinforme.js` (4 bis), `test-ciclospublicar.js` y `test-ciclosui.js` lo fijan.

### Las metas que se congelan · `SGADD_CICLOINFORME.metasDelCiclo(modelo)`
Junta en una lista, SIN repetir un indicador, todas las metas que fija el informe:

| Sección | Metas |
|---|---|
| Principal | Fuga 1 · triple del rival (`t3r`) · Fuga 2 · transición defensiva 0-7 s (`trans`) · Fuga 3 · zona fría (`zona:Zn`) |
| Equipos | dobles cortos (`cortos`) · ataque armado 8-17 s (`rf:1`) · peor cuarto (`cuarto:k`, por partido) · la hoja de ruta (`m:<métrica>`: fortalezas a SOSTENER sobre p70, ajustes y quiebres a la mitad del camino al p70 / p40) |
| Jugadores | el PPP de cada uno con 12+ jugadas (`ppp:<nombre>`): mitad del camino a la mediana, o sostenerla |
| Clasificación | el % de victorias que piden los escenarios (`victorias`): el borde de la zona con la tabla anterior, o el 50 % |
| Plan | la franja del reloj de más volumen (`rf:k`) · defensa en juego armado (`rc:1`) · pérdidas y triple propio a la liga (`m:PePP%`, `m:T3%`) y el eco de las fugas en el tablero |
| Fixture | no fija metas: describe el calendario |

Cada meta: `id`, `secciones`, `aspecto` (Defensa, Tiro, Cuidado del balón, Rebote, Ritmo y reloj, Cuartos, Jugadores, Resultado…), `dir` (+1/−1), `tipo` (mejorar / sostener), `base`, `meta`, `liga` y `pts` por partido. Una meta repetida (la fuga y el tablero) suma secciones, no filas.

### Dónde viven
- **El navegador del admin las arma** (necesita el libro y el paquete juntos) y las manda en `/cerrar` con la foto (`metas`).
- **El servidor** (`FOTO.validarMetas`) acota la forma —ids con un vocabulario cerrado validados CRUDOS, sin HTML, secciones conocidas, a lo sumo 120— y al PUBLICAR las guarda en el doc de gestión (`doc.metas`) con el **resultado del ciclo sacado de SU dato** (récord, PF, PC, diferencia); del navegador solo toma el NET. Nunca se reemplazan: un publicado no se vuelve a publicar.
- `/publicados` devuelve `metas` por ciclo.

### La evaluación · `evaluar(previo, X)` y `valorIndicador(X, id)`
El MISMO indicador mide la base en N y el valor en N+1. `% del camino` = (valor − base) ÷ (meta − base), con la dirección ya dentro de la resta: ✓ ≥ 100 % · ◐ 40-99 % · ✗ < 40 % · ✗ retrocedió (< 0) · ◆ sin dato (sin muestra: zona con < 5 tiros, franja con < 5, triple rival < 10, jugador < 12 jugadas). Una meta de SOSTENER se cumple si no cae bajo el piso. La liga de las metas es la del cierre de N (congelada); el valor es el del equipo en N+1.

### La sección Evolución
`out.secciones.evolucion` existe solo con `ctx.previo`. Primera pestaña y **primera hoja del PDF** (`FOTO.SECCIONES[0]`). Arriba el veredicto «X de N metas cumplidas» con una barra verde/ámbar/rojo; después la cuenta por sección y por aspecto, una barra por meta (la marca vertical es la meta, el relleno el % del camino hasta 150 %, las que fallaron primero), el impacto (récord, diferencia por partido y NET antes → después, y «lo explicado por las metas» = Σ pts × % recorrido × 0,5 por el solape, rotulado como estimación, no causa) y las metas que siguen abiertas.

### El Ciclo 0 · metas reconstruidas
Se publicó antes de esto y no tiene metas guardadas. `previoDe` (sgadd-ciclosui.js) toma las del publicado N−1 y, si no las tiene, arma el informe de N−1 con la liga al cierre de N−1 y le saca las metas UNA vez por categoría y equipo, rotuladas «metas reconstruidas». No se cachean hasta que llegó el archivo del torneo.

### El link del mail
`linkDelCiclo(club, clave)` = `?club=<club>&ciclo=<clave>#ciclos`. `sgadd-club.js` lo lee en el primer script, lo saca de la barra (`replaceState`, como el código de invitación) y lo guarda en `sessionStorage` (`sgadd.cicloPendiente`) para que sobreviva al login, que recarga la página. `init()` y `destino()` del login abren Ciclos; `abrirPendiente()` elige ese ciclo publicado (el cliente) o ese número (el admin), abre Evolución si el ciclo tiene, y lo consume.

### Para producción
1. Deploy del backend (`cd server && npx vercel --prod`): sin él, `/cerrar` ignora las metas y el mail sigue con el link viejo.
2. Push del front (`?v=364`).
3. **No verificado en el navegador ni en un PDF real**: probado con el paquete real del Ciclo 0 sin el índice del libro (8 metas) y con el servidor de mentira.

