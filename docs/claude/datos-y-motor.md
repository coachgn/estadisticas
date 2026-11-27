# Datos y motor

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 3. Modelo de datos

### De dónde salen las planillas: MotorStats

**SGADD no genera datos: los consume.** Las 9 hojas las escribe **MotorStats**, una
librería privada de Google Apps Script que vive en `C:\Users\Pc\mi-motor-stats`
y procesa los box scores de la CABB.

```
CABB (box score) → MotorStats (Apps Script) → Google Sheets → SGADD (este panel)
```

El `ESQUEMA` de acá y los `ENCABEZADOS_FINALES_*` del motor son **la misma
especificación**. Auditado en 2026-08-10: ninguna fórmula de SGADD contradice al
motor (PLAY vs POS, PPP por play, EQUIPO TIPO = mediana en
escala por partido, tasas que se recalculan en vez de promediarse). Ver
[`INTEGRACION_MOTORSTATS.md`](INTEGRACION_MOTORSTATS.md) para el detalle.

**Tres columnas que el motor escribe** (clave `motor` del ESQUEMA, NO `opt` —
ver punto 5). Las tres están soportadas; `ID_ARCHIVO` es la única que el panel
todavía no muestra:

| Columna | Desde | Dónde | Estado en SGADD |
|---|---|---|---|
| `+/-` | v30 | las 3 hojas de jugador | **se muestra** (punto 3 bis) |
| `ID_ARCHIVO` | v43 | las 3 maestras | leída, sin uso en la UI |
| `TORNEO` | v44 | las 9 hojas | **scopea el índice** (punto 3 ter) |

Las planillas de Reconquista están en esquema **pre-v43** y no traen ninguna.
Verificado que una planilla v52 **no rompe** el panel: 0 errores de esquema. Y
que sin esas columnas todo sigue igual que antes: retrocompatibilidad probada
con tests y en el navegador.

---

## 3 bis. La métrica `+/-`

`M('+/-', …, formato 'signo')` en `sgadd-core.js`. Se muestra en:

- **Box score del partido** (`SGADD_PARTIDO.COLS_BOX`), última columna.
- **Tab Partidos** de la ficha del jugador.
- **Plantel** (tab de Equipos) y las cards del plantel filtrado en Jugadores.
- **Tabla "Marcador y contexto"** del Tab General y el ranking de producción.

Tres decisiones que hay que respetar al tocarlo:

1. **El `+/-` de un EQUIPO es el margen del partido, NO la suma de los
   individuales.** Con 5 en cancha esa suma da ~5x el margen (el motor lo
   verificó en su v31: ±95 donde el partido se ganó por 19). Por eso existe
   `SGADD.masMenosEquipo(ptsPropios, ptsRival)` y por eso el box score **no
   tiene fila de totales** en esa columna: una fila de totales invitaría
   justamente a sumarla. El margen del equipo va como badge al lado del
   título del box score.
2. **No entra en `COLS_DESVIO` ni se usa como criterio de orden en ningún
   ranking.** Marcar un `+/-` como "atípico contra su propio promedio" no dice
   nada del jugador: depende de los otros cuatro que estaban en cancha.
   Ordenar un top 20 por `+/-` daría un ranking del equipo disfrazado de
   ranking de jugadores.
3. **El color es a propósito más apagado** que el verde/rojo de los
   rendimientos atípicos (`.mm-pos` / `.mm-neg` / `.mm-cero`, definidas a mano
   en el `<style>` del `index.html` porque el JIT de Tailwind no genera clases
   para nodos inyectados). Dos semáforos con la misma intensidad en la misma
   tabla no se leen. El cero va neutro: ni bueno ni malo.

El formato `signo` da `+12`, `-5`, `0` para enteros (el dato de un partido) y
`+3,4` para promedios. Sin el `+` adelante un `+/-` se lee como un total.

Donde la planilla no trae la columna, las tablas fijas muestran `—` y las
listas opcionales (cards del plantel, fila de "Marcador y contexto") **omiten
el dato**: una fila muerta permanente es ruido, no información.

---

## 3 ter. Multi-torneo · el índice se scopea, `claveEquipo()` NO se toca

Un libro puede traer Apertura y Clausura con la **misma** `FASE` ("REGULAR") y
los mismos equipos. Sin scopear, las filas del segundo torneo pisan a las del
primero y nadie se entera — el mismo defecto que el motor corrigió en su v49.

**El índice se construye scopeado a UNA competencia:**
`SGADD.construirIndice(hojas, { fase, torneo })`. El torneo elegido queda en
`idx.liga.torneo`.

**Por qué NO se metió el torneo en `claveEquipo()`** (era el pedido literal:
`TORNEO|EQUIPO|FASE`). Esa función es el **normalizador de nombres**
(`"ATENAS 'A' - MM"` → `ATENAS A`) y la usan cuatro cosas más:

1. la resolución de escudos (`LOGOS`),
2. `esEquipoPropio()`,
3. los slugs de la URL (`claveEquipo(x).toLowerCase().replace(/\s+/g,'-')`),
4. y —crítico— la **extracción del rival**, que parte el texto `"A vs B"` del
   campo `PARTIDO` y compara cada lado contra el equipo propio
   (`jugadoresRival`, `equiposRival`).

Ese texto **no tiene torneo ni fase**. Una clave compuesta ahí nunca volvería a
matchear y todos los rivales de la app quedarían en blanco. Scopear el índice da
exactamente el mismo resultado —dos `REGULAR` de torneos distintos jamás se
colapsan— sin tocar nada de eso. Hay tests que fijan las dos cosas.

### Reglas del scope

- **`GENERAL` es el torneo por defecto**: la planilla no trae la columna, todo
  el libro es una sola competencia y no se filtra nada.
- **Una fila SIN torneo pasa siempre**, aunque se esté filtrando. Si un libro
  trae `TORNEO` en `PROMEDIOS E` pero no en `Base Datos J` (convención mixta
  entre carpetas del motor), descartarla dejaría la sección de jugadores vacía
  sin decir por qué. Dejarla pasar como mucho mezcla filas sin atribuir, que es
  la degradación barata — y de eso ya avisa `validarTorneo()`.
- **`validarTorneo()` bajó de error a AVISO** en el caso de dos torneos en una
  hoja: con el índice scopeado ya no se pisan. Queda como aviso informativo de
  que se está viendo un recorte.

### El recálculo A MEDIAS · las derivadas contra la MAESTRA

Medido en el libro **U21 de Reconquista** el 2026-08-24:

```
Base Datos E  →  132 filas · 12 equipos · 66 partidos
PROMEDIOS E   →  3 filas: UN equipo (el primero del abecedario) + 2 TIPO
PROMEDIOS J   →  21 filas: los jugadores de ESE equipo
```

Las maestras completas y las derivadas a mitad de camino, como si el motor
se hubiera cortado durante el recálculo. **La app no se rompe** —12
equipos, 66 partidos, 18 jugadores— y eso es exactamente el problema:
parece que funciona. Un plantel de 18 para una liga entera no se lee como
un error, se lee como una liga chica, y **todos los percentiles, medianas
y bandas de la categoría salían de esa muestra**.

**Ningún validador lo veía.** El bloque 2 compara `PROMEDIOS E` contra
`ACUMULADO E` y ahí *coincidían*: los dos tenían 3 filas. Nadie comparaba
las derivadas contra la **maestra**, que es la única que sabe cuántos
equipos hay de verdad. Se agregó ese cruce a `validarTorneo()` y sale como
**error**, nombrando a los equipos que faltan.

Los nombres se comparan con `claveEquipo()`: la maestra escribe
`"ATENAS 'A' - U21M"` y la derivada puede escribir otra variante, así que
sin normalizar daría doce falsos positivos. Y la fila `EQUIPO TIPO` no
cuenta como equipo — si contara, un libro sano daría siempre una
diferencia de uno.

### El `sheetId` de una planilla puede apuntar a la nada

El JSON de Reconquista tenía la U21 en `1CD7FEDc…`, que devuelve **401 por
GViz y *entity not found* por la API de Drive**: ese archivo no existe. El
libro real es `1wNpSkd…`, corregido el 2026-08-24.

El síntoma en pantalla era el correcto —*"No se pudo leer ninguna hoja de
esta categoría"*, el guard del punto 6— pero el mensaje sugiere permisos y
acá era un id equivocado. **Para distinguirlos hay que mirar Drive**, no
GViz: los dos casos dan 401.

**El `sheetId` se corrige en DOS lugares**: `clubes/<club>.json` y el
catálogo de respaldo de `sgadd-core.js`, que es el que se usa si el JSON
no carga. Dejar uno viejo hace que el fallback resucite el id muerto.

### `Base Datos J` trae 0 donde va blanco · el panel lo corrige al indexar

Hueco **conocido y abierto** del lado de MotorStats (su punto 6.2): el
motor blanquea las tasas recién en la etapa de PROMEDIOS, no en el
registro crudo por partido. Su documento pide *"filtrar por `MIN > 0` del
lado de la web"*.

Medido en **Primera · Vuelta 2026** el 2026-08-24: **247 de 1965 filas**
(12,6%) traen `MIN = 0` con `eFG%`, `TS%`, `T2%`, `T3%`, `T1%`, `PPP`,
`USG%` y `RTL%` en **cero duro**. Entran a `liga.jugadorPartidos`, o sea a
la media y al desvío de `statJugador()`, a la banda del tab Evolución y al
split de local/visitante. Peor caso: **CARLOTTO, MARCO** — 5 noches, 4 en
cero → su `eFG%` medio daba **0,30** contra **1,50** real.

Y como infla el desvío, además **fabrica atípicos**: contra una media
hundida por noches que no existieron, cualquier partido normal supera el z
de 1,5 y se pinta como rendimiento excepcional.

**El criterio NO es `MIN > 0`.** `blanquearTasasSinDenominador()` blanquea
cada tasa **cuando su propio denominador es 0** (`DENOMINADOR_TASA`). Es
estrictamente mejor: caza además al que **sí jugó y no lanzó de tres** —
ese `T3%` de 0 se leía como "tiró y erró" cuando no tiró nunca. Es la
misma distinción que el proyecto ya aplica en el C/I del log (punto 8) y
en el perfil de tiro (punto 4 bis):

```
tiró y erró   →  0     (es un dato)
no tiró       →  null  (no es un dato)
```

Medido después del fix, mismo libro: **361 filas blanqueadas** contra
**277 ceros legítimos**. Las 361 son más que las 247 sin minutos porque
incluyen a los que jugaron y no lanzaron.

Dos cosas que hay que respetar al tocarlo:

- **Las CUENTAS no se tocan.** `PTS`, `T3C`, `RD`, `AST` en 0 son datos
  reales de una noche sin minutos. Lo que no es un dato es el porcentaje.
- **`AST-PP` queda AFUERA a propósito.** Su denominador son las pérdidas y
  el motor tiene su propia convención para el caso sin pérdidas (devuelve
  las asistencias, no una división por cero). Pisarlo acá contradiría a la
  hoja que el club audita.
  *Hasta MotorStats v106 esto no era cierto de ningún lado: el motor
  devolvía 0 y el panel, vía `div0`, null ("—"). Desde v106 los dos
  devuelven las asistencias; en el panel lo hace `astPp` en
  `sgadd-core.js`, la única tasa que no usa `div0`. Lo cubre
  `test-ast-pp.js`.*

La fila **no se descarta**, solo se le blanquean las tasas: el detector de
inactividad del punto 13 se apoya justamente en esas filas de `MIN = 0`
para contar la racha.

### `formatear()` guarda por TIPO, no con `isFinite`

**`isFinite('')` devuelve `true`** —el string vacío se convierte a 0—, así
que una celda vacía de una columna numérica pasaba la guarda y reventaba
abajo con `valor.toFixed is not a function`. El índice guarda el texto
crudo cuando `num()` no puede convertir, así que un `''` llega hasta ahí.

**Lo destapó la migración de MotorStats del 2026-08-24**, y es el ejemplo
de manual de por qué una columna nueva no es gratis: el libro de Primera
pasó a traer `+/-` (v30+) con celdas vacías en las filas de los que no
entraron. Antes la columna **no existía** y el valor era `undefined`, que
sí caía en la guarda. Resultado: el tab **Partidos** de cualquier jugador
con una noche sin `+/-` lanzaba y la sección quedaba sin pintar.

`typeof valor !== 'number'` cierra la clase entera: toda columna numérica
que venga vacía se muestra ausente en vez de tumbar la vista. El **cero se
sigue mostrando**: no llegar a ninguno es distinto de no haber estado.

### La capa de datos VIEJA de Principal · qué es y qué se le corrigió

Principal es anterior al adaptador: tiene su propio `fetchSheet`, su propio
`DATA` y su propio formato (`{cols:[{id,label,type}], rows:[{values,
formatted}]}`, con el texto ya formateado por Google). Por eso **no pasa
por `cargarCategoria` y no se beneficia del caché**.

Se le corrigieron dos cosas el 2026-08-25:

**1 · Ya no pide `RANKINGS J` ni `RANKINGS E`.** Su único consumidor era
`buildEquiposLegacy()`, que quedó fuera del router cuando Equipos pasó a
`sgadd-equipos.js` — o sea que eran **dos peticiones por arranque para
llenar una clave que nadie leía**. La función se borró.

**2 · `sheet()` scopea por tramo.** Sin eso, la misma pantalla daba dos
respuestas a la misma pregunta con un libro de ida y vuelta:

```
barra superior  →  12 equipos · 64 partidos · 208 jugadores
resumen general →  12 equipos · 76 partidos · 218 jugadores   ← 64 + 12
```

El filtro está en `sheet()`, el único punto por donde pasan todos los
consumidores, y repite las **tres reglas del núcleo**: sin columna `TORNEO`
no se filtra por torneo, una fila sin torneo pasa siempre, y la fila TIPO
pasa siempre porque es la mediana y no un equipo. Si esas reglas divergen,
la pantalla de entrada vuelve a contradecir al resto de la app.

**3 · Pide solo lo que usa.** Pedía once hojas y consumía cuatro. Medido
con un espía sobre `fetch` inyectado antes de que corriera un solo script,
las once peticiones del arranque eran **todas suyas** —el adaptador ya sale
de su caché— y siete no alimentaban a nadie:

| Hoja | Por qué se sacó |
|---|---|
| `RANKINGS J` · `RANKINGS E` | su consumidor quedó fuera del router |
| `ACUMULADO J` · `ACUMULADO E` · `4 FACTORES` · `ACUMULADO 4F` | cero usos |
| `Base Datos J` | **el 68% del volumen** para contar jugadores, que el índice ya tiene |

**De 11 peticiones a 4**, y las que quedan son las chicas. El KPI de
jugadores sale ahora del índice —scopeado al tramo y sin la fila TIPO— y
sin él muestra `—`, no un cero: llega unos milisegundos después.

**Por qué NO se unificaron las dos capas.** Se midió, y las tres vías
fallan:

- **Reproducir el `formatted` de Google**: 40% de precisión sobre 157.278
  celdas. Cada columna tiene su propio formato en la planilla — `1 → "1"`
  en una hoja, `16.05 → "16,05"` en otra, `0.1065 → "10,65%"` en las tasas.
  Sin el `pattern` no se puede adivinar, y con él es reimplementar el
  formateador de Sheets.
- **Guardar el `formatted` en el caché**: 4.767 KB, que no entran junto con
  los 2.336 del adaptador en los 5 MB de `sessionStorage`.
- **Guardar el crudo de GViz**: 4.151 KB para DEPORTIVO y **~10 MB para
  Jujuy**, que es el libro más grande. No escala.

El beneficio que quedaba era ~1 s tras un F5. No lo vale.
### Caché persistente · sobrevive al F5, no a cerrar la pestaña

Hay **dos** capas. `_cache` guarda la **promesa** en memoria —dos llamadas
concurrentes comparten un solo `fetch`— y muere con la página. Encima va un
caché en **`sessionStorage`** bajo `sgadd.hojas.<sheetId>`, con TTL de 30
minutos y versión de formato.

**`sessionStorage` y no `localStorage` a propósito.** El dato cambia cuando
corre MotorStats y nadie avisa: con `localStorage` el DT podría abrir el
panel el domingo y ver la fecha del jueves. Así el techo del dato viejo es
una sesión de trabajo.

Medido en DEPORTIVO: el libro ocupa **2.336 KB** serializado y las
peticiones GViz del arranque bajan de **20 a 11** tras un F5 (las 11 que
quedan son de la capa vieja de Principal, que no pasa por el adaptador).
Con GViz **bloqueado** y el caché poblado, la app arranca completa.

**El bug que costó encontrar: `limpiarCache()` sin `sheetId` NO puede tocar
el disco.** Lo llama `aplicarDatos()` del club en CADA arranque, así que si
borrara el persistente, el caché moriría en el arranque siguiente al que lo
escribió y no serviría jamás. El síntoma era perfecto: el caché *parecía*
andar —la clave estaba en `sessionStorage` al terminar de cargar— porque se
reescribía solo cada vez. Se encontró con un espía sobre `Storage.prototype`
inyectado antes de que corriera un solo script de la app.

Con `sheetId` sí limpia las dos: es lo que hace *Actualizar datos*, y si
solo vaciara la memoria el gesto del DT no haría nada visible.

Y dos reglas más: **solo se cachea la carga COMPLETA** (un subconjunto de
hojas devolvería más de lo pedido) y **solo si salió limpia** (con hojas que
fallaron serviría el libro incompleto media hora en vez de reintentar).

### Cuando el libro viene DESALINEADO · maestras contra derivadas

Medido en el libro **U23 de Reconquista** el 2026-08-24, después de que
MotorStats lo migrara:

```
Base Datos E  (maestra)   → IDA 134 filas · VUELTA 30
PROMEDIOS E   (derivada)  → APERTURA 13 filas
```

**La intersección es vacía.** Cada hoja por separado se ve impecable —y
`validarTorneo` no decía nada, porque miraba hoja por hoja— pero ningún
torneo elegible tiene a la vez promedios y partidos. Síntoma: la barra
decía **`12 equipos · 0 partidos`** mientras el RESUMEN de Principal decía
**82**, porque esa capa de datos vieja no filtra por torneo. Dos números
distintos para la misma pregunta y ninguna explicación.

**Es un problema del DATO, no del panel**, y se arregla en el motor. Lo
que sí es responsabilidad del panel es no callarlo. Tres piezas:

1. **`torneosDisponibles()` mide COBERTURA**: en cuántas de las cuatro
   hojas clave (`HOJAS_TORNEO`) aparece cada torneo, más un flag
   `conPartidos`.
2. **`torneoPorDefecto()` abre por el de mayor cobertura.** No por "el
   que tenga partidos": se probó contra el libro real y ese criterio
   cambiaba *252 jugadores / 0 partidos* por *67 partidos / 0 jugadores*.
   Cambiar un agujero por otro no es arreglarlo, y encima elige por el DT
   sin decírselo. **En un libro sano todos cubren todo y gana el primero,
   o sea exactamente lo que hacía la app antes**: nadie ve moverse su
   categoría de un día para el otro.
3. **La barra avisa** cuando el recorte elegido queda mudo, distinguiendo
   si lo que falta son partidos o jugadores, y manda a Diagnóstico. Va ahí
   y no solo en Diagnóstico porque **el DT lee la barra**; a Diagnóstico
   entra si algo lo manda.

`validarTorneo()` suma el cruce que ninguna hoja sola puede ver: sin
intersección es **error** (el libro no se puede leer entero desde ninguna
posición del selector); con intersección parcial es **aviso** (hay
recortes que quedan vacíos). Un libro alineado no dispara ninguno de los
dos — si el Diagnóstico avisa siempre, se deja de leer.

### `faseTorneo` del JSON del club NO se lee en ninguna parte

Está declarado en las tres planillas de Reconquista y en la de Jujuy, y
**ningún módulo lo consulta**: el torneo sale siempre de los datos
(`torneosDisponibles`). Es metadata muerta, así que un desajuste entre ese
campo y la columna `TORNEO` real **no rompe nada**.

Lo que sí ve el usuario es el `label`. Y **renombrar el `id` de una
planilla no es cosmético** (punto 6): es la clave de los estados de
jugador y viaja en cada link compartido.

### Estado global y UN SOLO selector · el TRAMO de competencia

`SGADD_APP.estado.torneo` y `.fase` son globales, igual que la planilla,
**pero se eligen JUNTOS**: la barra tiene un solo desplegable rotulado
*Fase* con los pares que existen en el libro — `Ida - Regular`,
`Vuelta - Regular` —, que es la convención de la carpeta de Nivel 6 del
motor (`TORNEO - FASE`).

Con dos desplegables el DT tenía que armar el par a mano y, peor, podía
elegir uno que **no existe** en el libro (Apertura + una fase que solo
tuvo el Clausura): la vista quedaba vacía sin decir por qué.
`combinacionesTorneoFase()` enumera solo los reales.

Reglas al tocarlo:

- **El estado sigue partido en dos, y la RUTA también.** Solo cambia la
  forma de elegir. Los links compartidos con `/<torneo>/<fase>/` siguen
  funcionando y `cambiarFase`/`cambiarTorneo` siguen existiendo porque los
  usa el ruteo. `cambiarTramo()` escribe los dos y **reindexa una sola
  vez**: encadenar los dos setters reindexaría dos veces, y la primera
  pasada armaría el índice sobre un par que puede no existir.
- **La fila TIPO no genera un tramo.** Viene con `FASE = TOTAL` y sin
  torneo; ofrecerla llevaba a una vista con cero equipos.
- **Sin columna `TORNEO` se muestra solo la fase.** Un `General - Regular`
  sería inventar una etiqueta sobre un dato que no existe (Jujuy y la U21
  son así).
- **Con un solo tramo el selector igual se muestra**: es la etiqueta de lo
  que se está viendo.

### El TOTAL de una fase · se DERIVA de los partidos, y ABRE el libro

Juntar dos torneos a lo bruto **rompe los promedios**. Medido en el libro
de DEPORTIVO, que trae los mismos equipos en `IDA` y en `VUELTA`:

```
solo IDA     → 64 partidos · 208 jugadores · DLP con PJ 11, 75,6 PTS
solo VUELTA  → 12 partidos · 165 jugadores · DLP con PJ  2, 66,5 PTS
SIN scope    → 76 partidos · 373 jugadores · DLP con PJ  2, 66,5 PTS  ←
```

Los **partidos** sí se acumulan bien (cada uno es una fila distinta), pero
el índice agrupa los promedios por `EQUIPO + FASE` y **los de VUELTA pisan
a los de IDA**: el equipo aparece con 13 partidos en la cronología y un
promedio calculado sobre 2. Y los jugadores se **duplican** —373 contra
208— porque cada uno tiene una fila por torneo.

Por eso el TOTAL **no lee las hojas de promedios: las reconstruye** desde
`Base Datos E` y `Base Datos J`. El volumen se suma y se divide por PJ; las
**tasas se recalculan sobre los totales**, que no es lo mismo que promediar
la tasa de cada noche. Las que dependen del rival (`RO%`, `PR%`, `PACE`)
salen del otro lado de cada partido.

Hay un bloque de tests que arma un libro de UN solo torneo y exige que el
TOTAL derivado **reproduzca exactamente lo que declara la hoja de
promedios** — es la prueba más fuerte que se puede escribir sin la planilla
real, y de paso verifica que el eFG% ponderado NO coincide con el
promediado.

**Se ofrece solo cuando la fase tiene DOS O MÁS torneos.** Con uno solo el
total ES ese torneo y el selector mostraría dos opciones que dan lo mismo.
Y nunca se mezclan fases: juntar una regular con unos playoffs no significa
nada.

El torneo sintético es `*TOTAL*`. El centinela lleva asteriscos **a
propósito**: los nombres de torneo salen de una celda y ninguno real puede
tenerlos, así que no colisiona. Viaja en la ruta sin encodearse.

#### LOS PLANTELES DEL TOTAL SALEN DE `ACUMULADO J`

Los equipos se rearman desde `Base Datos E`, pero los **jugadores** no
salen de `Base Datos J` sino del acumulado. Dos motivos.

El bueno: un acumulado **por torneo es exactamente lo que el TOTAL
necesita** —los totales SUMAN— y no hace falta recorrer partido por
partido para reconstruirlos.

El que costó una regresión: **`Base Datos J` es la ÚNICA hoja que el
backend recorta** al plantel propio, porque es la que sostiene la ficha
profunda de un rival (el gate del punto 19). Mientras el TOTAL no era el
default eso no se veía; al ponerlo por defecto, un cliente entraba al
panel y **la liga entera se le reducía a su propio plantel**. Medido en
producción con un token de cliente:

```
IDA|REGULAR      →  208 jugadores · 12 equipos
*TOTAL*|REGULAR  →   18 jugadores ·  1 equipo   ←
```

Y el modo de fallar era el peor: 18 jugadores en el plantel propio se lee
como una vista filtrada a propósito, no como datos que faltan.

`ACUMULADO J` viaja **completa para todos los planes**: son totales de
temporada, la misma información agregada que ya publican la tabla de
posiciones y los rankings. Lo que sigue bloqueado es el detalle partido a
partido del rival, que es lo que el plan cobra.

Dos cosas que hay que respetar al tocarlo:

- **`PJ` no se promedia: es el denominador.** Con el respaldo por partidos
  la columna no existe y esto no hacía falta; con el acumulado sí existe, y
  dividirla por sí misma dejaba a todos con `PJ = 1` — o sea sin muestra,
  con el umbral de 3 partidos apagado y cada promedio leyéndose como una
  noche suelta. Por lo mismo el PJ se **suma** en vez de contar filas: con
  el acumulado hay una fila por torneo, así que contar daría 2.
- **La fila `JUGADOR TIPO` se descarta.** Es la mediana de UN torneo
  suelto, así que sumarla no da la mediana del conjunto — y encima entraría
  al plantel como si fuera una persona. La del TOTAL se recalcula sobre los
  valores ya derivados.

`Base Datos J` queda de **respaldo** para el libro que no traiga el
acumulado. Ahí un cliente ve solo su plantel, pero es degradar y no romper,
y el Diagnóstico ya denuncia la hoja faltante.

#### Y es el que ABRE el libro · esto estuvo al revés

`tramoPorDefecto()` EXCLUÍA al sintético, con este argumento: el TOTAL es
una decisión del DT y no el recorte natural del libro, así que abrir por él
cambiaría lo que ve el club de un día para el otro sin que nadie lo pida.

El club lo pidió al revés (**2026-08-30**) y tiene razón sobre su caso: con
la Ida cerrada y la Vuelta en curso, abrir por `IDA|REGULAR` muestra una
tabla que ya no describe el torneo — el DT entra y ve las posiciones de
hace un mes. El TOTAL es la foto de hoy.

Se cambió **en el núcleo y no en cada sección**, justamente para que la
barra, el Diagnóstico y la Configuración abran por el mismo tramo: tres
defaults distintos es la pantalla de auditoría contradiciendo a lo que
audita (punto 5).

**DEGRADA SOLO.** Como el sintético solo existe con dos torneos o más, un
libro de uno solo —Jujuy, la U21— abre exactamente como antes. Y la fila
`agregado` (la TIPO, con `FASE = TOTAL`) sigue afuera del default: esa no
es un tramo sino la mediana, y abrir por ella daría cero equipos.

**Y solo si el TOTAL tiene PARTIDOS.** Como se reconstruye desde las
maestras, un libro con `PROMEDIOS E` de los dos torneos y sin `Base Datos
E` abriría con **cero equipos** — medido. Con partidos ausentes gana un
torneo real, que al menos muestra sus promedios, y el Diagnóstico denuncia
el libro. El TOTAL se sigue **ofreciendo** en el selector: lo que la guarda
decide es solo por dónde se abre.

#### La decisión del tramo estaba PARTIDA EN DOS

El arreglo de arriba no alcanzó, y el modo de fallar vale anotarlo:
`tramoPorDefecto()` devolvía `*TOTAL*|REGULAR` y la app **seguía abriendo
en `IDA`**, medido en producción con el token de admin.

`cargar()` hacía dos pasos: `torneoPorDefecto()` resolvía el torneo, y
`tramoPorDefecto()` corregía el PAR **solo si no existía**. En un arranque
limpio el primero ya había puesto un torneo válido, así que el segundo
nunca corría: **el criterio del tramo vivía en una función que no se
ejecutaba**. Y `torneosDisponibles()` no conoce al sintético — no sale de
ninguna celda —, así que por ese camino el TOTAL era inalcanzable.

Ahora manda el tramo: `combinacionesTorneoFase()` enumera los pares que
existen, `tramoPorDefecto()` elige, y el par del hash gana si es válido en
ese libro. `torneoPorDefecto()` queda como respaldo para el caso sin un
solo tramo enumerable.

**El test de esto EJERCE `cargar()` en un `vm`, no lee el fuente.** Un grep
no lo habría cazado nunca: las dos funciones estaban ahí y las dos decían
lo correcto. Es el mismo aprendizaje que dejó la pestaña de Torneo (punto
18) — cuando el defecto es *qué se ejecuta*, hay que ejecutarlo.

Alcance real del cambio: **DEPORTIVO Primera** y **Reconquista Primera**,
que son las dos planillas con ida y vuelta. Las otras tres no se mueven.
### Ruta: `#/<planilla>/<torneo>/<fase>/<seccion>/…`

El torneo entra como **segundo** nivel. La retrocompatibilidad no es opcional:
hay links compartidos y favoritos con el formato viejo
`#/<planilla>/<fase>/<seccion>`.

`Ruta.parse()` distingue los dos formatos con el **vocabulario cerrado de
`SGADD.SECCIONES`** (6 nombres, finitos y conocidos): si `partes[3]` es una
sección conocida, es el formato nuevo. `Ruta.build()` **omite** el torneo
cuando es `GENERAL`, así una planilla de un solo torneo no arrastra un
`/GENERAL/` en cada link que comparte el DT.

Cada sección lee el torneo del hash con `SGADD_APP.aplicarTorneoRuta(r.torneo)`
dentro de su `leerRuta()` y lo escribe con `torneo: SGADD_APP.estado.torneo` en
su `Ruta.build()`. El torneo **no** vive en el estado de la sección: es global,
pero viaja en la URL para que un link compartido lo pueda cambiar.

---

## 3 quater. El join de FECHA · `Base Datos E` es la fuente de verdad

`idPartido()` = **FECHA + PARTIDO**. Si una hoja trae la `FECHA` vacía y otra
no, el mismo partido tiene dos ids (`sf_atenas-a-vs-…` contra
`2026-05-05_atenas-a-vs-…`) y no cruzan nunca.

**Consecuencia medida antes del fix** (Primera · Clausura 2026): las 1726
filas de `Base Datos J` venían sin fecha, así que `partido.conBox` era `false`
en los **72 partidos** y el box score del detalle **no se dibujaba nunca**.
`4 FACTORES` tenía el mismo problema por otro motivo: sí heredaba la fecha,
pero **después** de calcular el `__id`, así que `factoresPorId` seguía sin
matchear.

`construirIndice()` arma `fechaPorPartido` desde `Base Datos E` **antes** de
indexar nada, y `fechaEfectiva(fila)` entra al cómputo del `__id` de las tres
hojas partido a partido. Parchear el `FECHA` a posteriori no sirve: el `__id`
ya está calculado.

### Guard de ambigüedad · por qué a veces NO se hereda

El texto `"A vs B"` **no identifica un partido** en una liga con ida y vuelta:
los dos cruces se escriben igual y lo único que los separa es la fecha, que es
justamente el dato que falta. Si un mismo `PARTIDO` aparece con dos fechas en
`Base Datos E`, **no se hereda nada** y se avisa en el Diagnóstico.

Es la misma regla que el resto del proyecto: **un dato inventado es peor que
un dato ausente**. Un partido sin cruzar la UI ya lo sabe mostrar ("Sin box
score cargado"); atribuirle a un jugador la noche equivocada no se nota y
contamina su log, su desvío y sus atípicos.

Con los datos reales de Reconquista: **72 de 72** partidos con box score, cero
cruces ambiguos.

### `jugadoresIdCanonico()` sigue existiendo, pero cambió de orden

Ahora el primer intento es usar el `__id` de la propia fila —que después del
join suele ser el bueno, y es exacto, no una inferencia— y recién si no está
en `partidosPorId` se cae al match por texto de `PARTIDO`. Ese fallback es
para el caso ambiguo, y **abre la primera de las dos noches**: es una
aproximación conocida, no un dato.

---

## 3 quinquies. Handlers inline y nombres con comilla simple

Los equipos de La Plata se llaman **`RECONQUISTA 'A' - MM`**. Un nombre así
metido en un `onclick` con solo escape de HTML rompe el handler:

```
onclick="f('${esc(nombre)}')"   →   f(&#39;RECONQUISTA &#39;A&#39; - MM&#39;)
```

El parser HTML decodifica las entidades **antes** de que exista el JS, así que
el handler queda `f('RECONQUISTA 'A' - MM')` → `SyntaxError`. El clic no hace
nada **y no se ve ningún error en pantalla**. Era el motivo de que en
Jugadores → Partidos el clic en una fila no abriera el detalle en Equipos.

`SGADD_UI.escJs(v)` hace las **dos capas en orden**: primero cierra el literal
de JS (barra invertida y comilla simple), después escapa el HTML. Al revés,
`esc()` convertiría la barra recién agregada en parte del texto.

Todo handler inline que interpole un valor usa `escJs`, no `esc` ni
`escapeAttr`. Hay un test que recorre los cinco módulos de UI y falla si
aparece uno nuevo sin él.

---

Google Sheets vía GViz público. **9 hojas** por planilla, contrato en `ESQUEMA`:

| Hoja | Grano | Clave |
|---|---|---|
| `PROMEDIOS E` / `ACUMULADO E` | equipo-temporada | EQUIPO + FASE |
| `PROMEDIOS 4F` / `ACUMULADO 4F` | factores-temporada | EQUIPO + FASE |
| `Base Datos E` / `4 FACTORES` | equipo-partido | PARTIDO + EQUIPO |
| `PROMEDIOS J` / `ACUMULADO J` | jugador-temporada | NOMBRES + EQUIPO + FASE |
| `Base Datos J` | jugador-partido | PARTIDO + NOMBRES |

`RANKINGS J` y `RANKINGS E` están **excluidas a propósito**: no son tablas, son
bloques apilados con encabezados repetidos. GViz asume fila 1 = headers y
devuelve basura. Los rankings se derivan en el cliente.

### Reglas que costaron encontrar

- **`EQUIPO TIPO` es la MEDIANA**, verificado 16/16 columnas. Es el percentil 50.
- **La fila TIPO viene redondeada a 2 decimales.** Nunca comparar por igualdad
  exacta; usar tolerancia ~1e-4.
- **La fila TIPO no es internamente coherente**: `RTNG OFF − RTNG DEF ≠ NET RTNG`
  porque la mediana de las diferencias no es la diferencia de las medianas.
  **Nunca derivar una columna de otra a partir del TIPO.**
- **Hay dos tipos de fila TIPO**: la de liga (columna EQUIPO vacía) y una por
  equipo. Tomar la primera que aparece devuelve la del primer equipo del
  abecedario y el umbral de minutos sale mal.
- **`RTNG OFF/DEF` de la PLANILLA está por 100 PLAYS. El panel NO los muestra
  así**: desde el 2026-09-25 los deriva por 100 POSESIONES (punto 66). La columna
  de la hoja queda como el dato que el club audita en su planilla, y el panel
  habla la norma CAB/FIBA.
- **Cada métrica tiene UNA hoja dueña** (registro `METRICAS`). `eFG%`, `RTL%` y
  `RO%` se leen de `PROMEDIOS E` (ratio sobre totales de temporada, ponderado).
  `PROMEDIOS 4F` promedia ratios por partido y da distinto.
- **Los factores defensivos se calculan**, no se leen: se joinea `Base Datos E`
  por `PARTIDO` para que el eFG% propio y el permitido usen el mismo método.
- **Fechas**: GViz devuelve `Date(2026,4,5)` con **mes 0-indexado** (eso es mayo).
  También se parsea ISO y `dd/mm/aaaa` (Liga Argentina).
- **`idPartido()` = FECHA + PARTIDO.** El string "A vs B" solo no alcanza: en
  liga con ida y vuelta puede colapsar dos partidos distintos.
- **`idPartido()` de `Base Datos J` puede NO coincidir con el de `Base Datos E`
  para el mismo partido**, si una hoja trae la FECHA vacía y la otra no (pasa
  en datos reales de Reconquista). Para el link cruzado Jugadores → Equipos,
  `jugadoresIdCanonico()` no confía en el id de la fila del jugador: busca el
  mismo `PARTIDO` (por texto, no por fecha) en `idx.get(equipo).partidos` y usa
  ESE id, que es el mismo cómputo que ya indexa `partidosPorId`.

### Nomenclatura por liga

Los sufijos de categoría son **convención de cada liga**, configurables en el
JSON del club:

- La Plata: `"ATENAS 'A' - MM"`, `"RECONQUISTA 'A' - U21M"` → se descartan
- Liga Argentina: `"HINDU (C)"`, `"COLON (SF)"` → **los paréntesis NO se tocan**,
  son la provincia y distinguen equipos

---

## 4. Reglas de análisis

- **Percentiles, no valores absolutos.** Un PACE de 80 es rapidísimo en una liga
  y lento en otra. Todo lo comparativo va en percentil contra la propia liga:
  así el mismo código sirve para cualquier cliente.
- **z-score = 1.5** para marcar rendimientos atípicos de un jugador, medido
  contra **su propio** promedio y desvío. No ajustar a ojo: se autocorrige a
  medida que crece N.
- **Mínimo 8 minutos** para que los porcentajes de un jugador cuenten.
- **Mínimo 3 partidos** para calcular desvío de un jugador.
- **PJ mediano < 5** → la muestra se marca insuficiente: barras grises, `~` en el
  percentil. Los datos se muestran igual, pero pierden autoridad visual.
- **Ningún eje de personalidad tiene lado bueno y lado malo.** Cuidar el balón no
  es mejor que arriesgar: es distinto. Eso separa "personalidad" de "ranking".
- **Box score**: columnas `MIN PTS PLAYS T2C T2I T3C T3I T1C T1I RT AST PR PP`.
  **`VAL` se sacó** (índice compuesto ya resumido en el resto); **`PLAYS` entró**
  entre PTS y T2C porque da el contexto de uso que le falta a los puntos.

---

## 4 bis. Perfil de tiro del partido · un gráfico, tres preguntas

En el detalle de un partido (Equipos → Partidos → clic en una fila), entre
*"Eficiencia del partido"* y los box scores, va un gráfico por equipo con
las tres zonas del box score: **2 puntos, 3 puntos y libres**. El motor puro
es `SGADD_PARTIDO.perfilTiro(lado, tipoLiga)`; la fábrica es
`SGADD_CHARTS.tiroPartido()`.

Es **un solo gráfico** y contesta las tres preguntas a la vez:

| Pregunta | Cómo se lee |
|---|---|
| ¿De dónde tiró? | la **altura total** de la barra son los intentos |
| ¿Cuántos metió? | el apilado: convertidos abajo, errados arriba |
| ¿Con qué efectividad, contra la liga? | la **línea punteada** que corta la barra |

**La referencia de liga NO es otra barra ni otro gráfico**, que era el
pedido explícito. Es `convLiga = intentos × %liga`: cuántos habría
convertido la mediana de la liga con **esos mismos intentos**. Queda en la
misma unidad que la barra, así que se lee de un vistazo si el bloque lleno
pasa la marca. Un porcentaje al lado obligaría a comparar dos escalas.

Reglas que hay que respetar al tocarlo:

- **Sin `%` de liga para una zona, esa zona sale sin marca**, no con una
  inventada. Misma regla de siempre: un dato ausente se muestra ausente.
- **Un lado sin un solo lanzamiento devuelve `null`**: un gráfico de tiro
  con todo en cero no informa nada.
- **`destacada` exige `MIN_INTENTOS_ZONA` (5) intentos.** Con 2 intentos un
  acierto mueve el porcentaje 50 puntos y eso es ruido, no una zona
  destacada. Se ordena por el **delta de porcentaje** y no por tiros de
  más: tres triples de más pesan distinto que tres libres.
- **Las tres zonas no se derivan una de otra.** T2 y T3 son tiros de campo,
  T1 son libres; mezclarlas escondería justamente la selección de tiro.

---

## 5. Validadores (sección Diagnóstico)

0. **Guard de TORNEO** (`validarTorneo`) — se concatena al bloque 1. Error si una
   hoja trae dos o más torneos (el índice los colapsa), aviso si la convención
   viene mixta. Silencio con un solo torneo o sin la columna. **Avisa, no aborta**,
   igual que `_validarTorneo_` del motor.
1. **Contrato de esquema** — columnas faltantes por hoja, error vs aviso.
   Tres categorías: `req` (falta → error), `opt` (falta → aviso, se degrada la UI)
   y **`motor`** (las agrega MotorStats y este panel no las usa: si faltan **no se
   avisa**). Ponerlas en `opt` llenaba el Diagnóstico de 9 avisos por columnas que
   no degradan nada — probado contra la planilla real y hay un test que lo amarra.
2. **Coherencia entre hojas** — promedios y acumulados con las mismas filas
3. **Invariantes exactos** — `Σ PTS = Σ PTSopp`, `Σ RD = Σ RDopp`, etc.
   El par correcto es siempre `X ↔ Xopp`.
4. **Cruce partido por partido** — más fino: caza dos errores que se compensen
5. **Simetría de promedios** — útil pero con tolerancia, porque los promedios
   solo coinciden si todos jugaron los mismos partidos

---

### El Diagnóstico mira el MISMO tramo que la app

Armaba su índice con `{ fase }` y **sin torneo**, así que en un libro con
IDA y VUELTA en la misma `FASE = REGULAR` los dos se colapsaban: los
promedios del segundo pisan a los del primero y cada jugador entra una vez
por torneo. Es exactamente el defecto que el resto de la app evita desde el
punto 3 ter, y esta pantalla se lo comía entera.

Medido en DEPORTIVO el 2026-08-25:

```
Diagnóstico (sin scope)  →  373 jugadores   ← 208 de IDA + 165 de VUELTA
la app (IDA · REGULAR)   →  208 jugadores
```

**Es la pantalla que el DT abre justamente para auditar a las otras**, así
que una foto distinta no es un detalle de presentación: es la auditoría
contradiciendo a lo que audita, y sin ningún síntoma — 373 jugadores en una
liga de 12 equipos se lee como una liga grande, no como un error.

El selector pasó a ofrecer los **mismos pares** que la barra
(`combinacionesTorneoFase`), abre por el de mayor cobertura
(`tramoPorDefecto`) y `diagCambiarFase()` escribe torneo y fase **juntos**,
por el mismo motivo que `cambiarTramo()`: encadenar los dos setters
reindexaría dos veces y la primera pasada armaría el índice sobre un par que
puede no existir en el libro.

**Y el aviso de multi-torneo mandaba a un control que no existe.** Decía
*"elegí cuál en el selector **Torneo** de la barra superior"*, texto anterior
a la fusión de los dos desplegables en uno solo rotulado **Fase**. Un mensaje
que nombra un control inexistente es peor que no decir nada: el DT lo busca,
no lo encuentra y deja de leer los avisos.

---

## 5 bis. El cartel de espera · un solo componente

`SGADD_UI.cargando(texto, detalle)` vive en `sgadd-ui.js`, que carga antes
que todos los módulos de sección. Lo usan las cinco: Equipos, Jugadores,
Scouting, Simulador y Diagnóstico.

Antes cada una tenía su propio `<div>` con un texto quieto y nada más. **Un
bloque de texto sin movimiento no distingue *"está bajando"* de *"se
colgó"***, que es justo la pregunta del DT cuando la planilla tarda: el libro
de DEPORTIVO son 157.596 celdas y con red lenta la espera es de segundos.

- Lleva el **mismo disco** que el loader del arranque, así que la espera se
  ve igual en todas las pantallas.
- `role="status"` + `aria-live="polite"`: se anuncia sin robar el foco, que
  puede estar en el selector mientras baja.
- El `detalle` es opcional y dice QUÉ se está esperando (la categoría, las 9
  hojas) sin ensuciar la línea principal.
- **El CSS del disco va a mano en el `<style>`** (`.cargando-disco`): lo
  inyecta un nodo dinámico y el JIT del CDN de Tailwind no le genera las
  clases — la trampa del punto 12, otra vez.
- Con `prefers-reduced-motion` **se queda quieto**, con `animation: none`
  explícito: la regla global lleva la duración a 0.001ms y una animación
  infinita a esa velocidad titila, que es peor que girar. El texto de al
  lado sigue diciendo qué pasa.

**La barra NO desaparece mientras se espera.** El cartel se pinta debajo del
selector, así que el DT puede volver atrás o elegir otra categoría — es la
misma regla del punto 6 que ya se había corregido para el cambio de
categoría.

### Los 26 segundos en blanco del arranque · RESUELTO

Medido con la red a 200 kbps y 500 ms de latencia, **la pantalla quedaba en
blanco 26,4 segundos** sin siquiera el loader. No era la planilla —GViz
todavía no se había pedido— eran los dos `<script>` de CDN del `<head>`,
sincronos, que bloquean el parseo del `<body>` entero.

```
antes (CDN)        loader visible a los 26.400 ms
ahora (compilado)  loader visible a los  5.855 ms
```

**Chart.js pasó a `defer`** —son ~200 KB que no hacen falta para parsear— y
es correcto, pero hay que ser honesto: **no movió el número solo** (27,1 s
contra 26,4 s, o sea ruido). El bloqueante era el otro.

**Tailwind se sirve COMPILADO desde el repo.** `tailwind.config.js` +
`sgadd.in.css` → `sgadd.css` (27 KB, commiteado), generado con
`node generar-css.js`. Es la misma convención que `generar-manual-etiquetas.js`:
un generador que se corre a mano, no un bundler en el camino crítico.

No se podía simplemente diferir el CDN: el `<script>` de configuración que
iba abajo le escribe `tailwind.config` y necesita que el objeto ya exista,
así que con `defer` la app entera se quedaba sin sus colores.

#### Las tres cosas que hay que respetar

**1 · El scan es ESTÁTICO.** Solo ve lo que está literal en `index.html` y
`js/*.js`. Una clase armada por concatenación en runtime no la encuentra —
y el CDN sí la cazaba, porque observaba el DOM. Antes de migrar se midió:
de las **278 clases vivas** del DOM (3 clubes × 6 secciones + ficha de
equipo), las **278 estaban literales en el fuente**. Por eso hoy no hay
safelist. **Al agregar una clase nueva hay que regenerar.**

**2 · El `<link>` va DESPUÉS de nuestro `<style>`**, que es exactamente
donde el CDN inyectaba el suyo. Hay reglas de impresión que dependen de
ganar o perder un empate de especificidad **por orden de documento** (punto
7.6, las tarjetas del ciclo con `bg-surface2/40`): moverlo arriba las daría
vuelta sin ningún síntoma. Hay un test que lo fija.

**3 · Los colores por club NO se compilan.** Viven en variables
(`--acento`, `--acento-texto`, `--acento-papel`) que `sgadd-club.js` escribe
en runtime. Si alguna quedara horneada en el CSS, los tres clientes se
verían iguales.

#### Lo que la migración ARREGLÓ sin buscarlo

Se auditó con un diff de estilos computados: **36 vistas** (3 clubes × 6
secciones × pantalla/papel), **14.806 elementos**, 22 propiedades cada uno.
Cero diferencias de color, fondo, borde, tipografía o espaciado.

La única diferencia real fueron **24 botones que pasaron de 16px a 12px**:
las tabs y los dos botones del Diagnóstico, todos dentro de `#view-root`.
Bajo el CDN **ignoraban su propio `text-xs`** porque son nodos inyectados
dinámicamente y el JIT no llegaba a generarles la clase — la misma trampa
que ya había obligado a escribir a mano los respaldos de `.text-accent` y
`.bg-accent` en el `<style>` (punto 12). Con el CSS compilado la clase
existe desde el arranque y el botón mide lo que el markup pide.

**Queda uno de esa familia sin cerrar**: `.bg-accent` no lleva `!important`
(a diferencia de `.text-accent`, que sí), así que el dorado del tema le gana
al acento del club y en DEPORTIVO la pestaña activa sale amarilla en vez de
azul. Es **preexistente** —el diff lo confirma en cero— y se cierra junto
con los tokens de color de la Fase 4.

---

## 10. Deuda técnica conocida

- **No existe una maestra `JUGADORES` con ID estable.** Hoy la clave es el string
  del nombre, y ya se detectó que **dos jugadores homónimos de equipos distintos
  mezclan sus estadísticas** en `statJugador()`. Bloquea el histórico plurianual
  (evolución de camadas, detección de similares). Decisión del cliente:
  postergado hasta cerrar el proyecto actual.
- `PROMEDIOS J` tiene una fila `JUGADOR TIPO` por equipo además de la de liga.
  Está contemplado, pero conviene saberlo.
- ~~La `FECHA` vacía de `Base Datos J` rompía el cruce con `Base Datos E`.~~
  **RESUELTO** (ver punto 3 quater): las tres hojas partido a partido heredan
  la `FECHA` de `Base Datos E` en `construirIndice()`, antes de calcular el
  `__id`. Queda el límite del guard de ambigüedad, que es del dato y no del
  código: en un cruce de ida y vuelta con el mismo texto de `PARTIDO`, una
  fila sin fecha no se puede atribuir a ninguna de las dos noches y queda sin
  cruzar. La forma de cerrarlo es que la planilla traiga la `FECHA` en
  `Base Datos J`; mientras tanto se avisa en el Diagnóstico.
- Sin columnas de cuartos/parciales. Hay un hook comentado en el detalle de
  partido listo para cuando existan.
- **El acceso es público.** Los `sheetId` están en los JSON, que son archivos
  públicos. Un sitio estático no puede filtrar nada. Para membresías por niveles
  hace falta backend (Supabase o Cloudflare Workers). `planillasVisibles(scope)`
  ya está preparado para recibir ese scope.
- **`simulador-4factores-legacy.js` no se ejecuta.** Es el Apps Script original
  (1805 líneas) que se auditó para construir `sgadd-4factores.js` — queda en el
  repo como referencia de qué fórmulas se corrigieron y por qué (ver punto 9).
  No lo toca ningún test ni ningún script de la app; es documentación, no código.
- ~~Tailwind se sirve por CDN y bloquea el primer pintado.~~ **RESUELTO**
  (ver punto 5 bis): se compila al repo con `node generar-css.js` y el
  arranque a 200 kbps bajó de **26,4 s a 5,9 s**. Queda el límite del scan
  estático: una clase nueva pide regenerar.
- **El simulador no tiene ciclo de aprendizaje.** El original ajustaba pesos
  comparando predicciones contra resultados reales (`retroalimentarSimulador`,
  con estado persistente en la hoja `HISTORIAL`). Acá los pesos se recalculan
  de cero en cada carga: no hay memoria de aciertos pasados. Retomar esto
  necesita backend para persistir resultados (mismo problema que el punto
  anterior).

---

## 10 bis. Pedidos del cuerpo técnico · backlog

> El estado de cada uno y el orden en que conviene encararlos están en
> [`HOJA_DE_RUTA.md`](HOJA_DE_RUTA.md). Acá va el detalle de QUÉ pidió el
> club y de qué depende cada pedido.

Distinto de la deuda técnica del punto 10: eso es lo que sabemos que está
flojo, esto es lo que el club pidió. Entregado en `mejoras.pdf` el
**2026-08-18**. Cada punto anota **de qué depende**, que es lo que decide si
se puede hacer o hay que pedirlo a MotorStats.

### Se pueden hacer ya · el dato está

**B-1 · Comparativa por períodos o ciclos, para equipos Y jugadores.**
Cortar la temporada en tramos —primeras N fechas contra últimas N— y
comparar. El dato está en `Base Datos E` y `Base Datos J`, partido a
partido, y el patrón ya existe dos veces: `e.split` (local/visitante) en
Equipos y `jugadoresSplitCondicion()` en Jugadores. El scouting además ya
tiene el *ciclo reciente* de 4 partidos, que es un caso particular de esto.
Lo que hay que definir con el club es el corte: mitad y mitad, últimos 5, o
elegible. **Cuidado con la muestra**: con 13 fechas, dos tramos de 6 son dos
muestras chicas, así que aplica la regla de siempre —mostrar el dato y
quitarle autoridad cuando no alcanza—.

**B-2 · ~~La alerta de la campana, visible en la ficha y en scouting; y
poder marcar a un jugador ANTES de que salte la alerta.~~ HECHO
(2026-08-21).** Se resolvió con **dos niveles** —aviso a las 2 fechas,
alerta a las 4— más el control de estado en la ficha. Detalle y las
decisiones que hay que respetar, en el punto 13.

**B-3 · ~~En la cronología, que los porcentajes muestren también los
intentos.~~ HECHO (2026-08-21).** Columnas C/I en el tab Partidos y el par
en el tooltip de Evolución. Detalle en el punto 8.

**B-4 · Por qué esta marca defensiva y no otra.** El caso que trajo el club:
dos jugadores con etiquetas ofensivas IDÉNTICAS —*Spacing / Tirador de
Descarga* + *Referente Ofensivo / Segunda Espada*— reciben marcas distintas
(*Contenedor de Volumen* uno, *Hostigador / Ball-Screen Pest* el otro).

No es un error: `PERFILES_MARCA` es una cascada que mira más cosas que el
rol, y en ese ejemplo lo que los separa son las **pérdidas** (19,4%, 1,34x
la liga, dispara `generador-riesgoso`). El problema es que **la ficha no lo
dice**: muestra el número que justifica la marca elegida, pero no cuál fue
el discriminante contra la anterior de la cascada. Con eso el DT no puede
auditar el informe, y un informe que no se puede auditar se deja de usar.

Junto con esto pidió **regularidad**: si el jugador sostiene ese
comportamiento o es una noche suelta. El dato ya está —`statJugador()`
devuelve media ± desvío— y es el mismo criterio del `~` del punto 8.

**B-5 · Que la media de la liga se vincule al ARQUETIPO.** Comparar a un
tirador contra tiradores y no contra los 216 de la liga. Es el pedido más
ambicioso y el de mejor lectura, pero tiene una trampa conocida: **el
universo se achica**. En La Plata hay 2 *Anclas Defensivas* sobre 210
jugadores; un percentil sobre 2 no significa nada. Si se hace, hay que fijar
un mínimo de calificados por grupo y **degradar a la liga entera** cuando no
se llega, igual que `jugadoresReferenciasRebote()` degrada al `JUGADOR TIPO`
con menos de 3 calificados (punto 8).

### Bloqueados por el dato · hay que pedirlos a MotorStats

**B-6 · Fixture y partidos por zona.** No existe hoja de calendario: la
fecha del partido, el torneo y el próximo rival son campos MANUALES en
scouting justamente por esto (punto 9). Con una hoja de fixture, esos tres
campos salen solos.

**B-7 · Play-by-play de la CABB.** Está fuera de SGADD: el panel consume lo
que MotorStats escribe (punto 3). Si algún día entra, habilita de una vez
los **cuartos y parciales**, que ya tienen un hook comentado esperando en el
detalle de partido.

---

## 24. LAS CUATRO TASAS DEL JUGADOR CON DENOMINADOR DE EQUIPO

`ACUMULADO J` trae 32 columnas contra las 53 de `PROMEDIOS J`. El TOTAL
repone casi todas recalculando sobre los totales del propio jugador, **salvo
cuatro**: `AST%`, `USG%`, `RO%` y `RD%`, cuyo denominador es del equipo. Sin
ellas el TOTAL las dejaba en blanco —y como el TOTAL abre el libro (punto 3
ter), la tarjeta **USO** de la ficha salía vacía de entrada—.

**MotorStats divide el PROMEDIO del jugador por el PROMEDIO del equipo**
(`_logicaPromediosJugadores_`, `tccEquipoPromedio`, `rdEquipoPromedio`…):

```
AST% = (AST_jug / PJ_jug) / (TCC_equipo / PJ_equipo)
RO%  = (RO_jug  / PJ_jug) / ((RO_equipo + RD_rival) / PJ_equipo)
RD%  = (RD_jug  / PJ_jug) / ((RD_equipo + RO_rival) / PJ_equipo)
USG% = (PLAYS_jug × MIN_equipo/5) / (PLAYS_equipo × MIN_jug)
```

**Medido contra `PROMEDIOS J` de la demo el 2026-10-05: error 0 en los 260
jugadores**, 157 de los cuales jugaron menos partidos que su equipo.
`test-acumulacion.js` lo fija sobre el snapshot real; sin el arreglo caen 3.

**Hasta esa fecha estaba mal de dos formas**, y por eso no alcanza con
«verificar contra un libro»:

- **`AST%` salía con la fórmula del EQUIPO** (asistencias sobre SUS propias
  canastas): 0,891 contra 0,098 de la planilla. En la vista TOTAL de
  Jugadores y en Fichajes con período, que por eso la blanqueaba.
- **`RO%` y `RD%` iban total sobre total.** Eso solo coincide con la
  planilla cuando el jugador jugó TODOS los partidos del equipo, y se había
  verificado contra DEPORTIVO · IDA, donde casi todos lo hacían. En la demo
  daba mal para 109 y 120 jugadores. En `USG%` el PJ se cancela, así que la
  de totales ya era exacta.

La de rebote sigue **sin prorratear por minutos**: el motor mide la porción
de lo que el equipo tuvo disponible POR NOCHE. Reproducir al motor manda
sobre mejorarlo — la hoja es lo que el club audita. Hay un test que exige que
el número NO coincida con la versión prorrateada.

**Una fixture con un jugador de más PJ que su equipo no describe un libro
real**: la de `test-core.js` tenía 22 contra 2 y pasaba solo porque la
fórmula vieja no miraba el PJ. Se corrigió a 1 por torneo.

---

## 34. EL ACUMULADO DE UN JUGADOR SE QUEDABA CON UN SOLO TORNEO

El bug más caro de esta vuelta, y el que mejor ilustra por qué en este
proyecto hay que medir contra la planilla real.

`ACUMULADO J` trae **una fila por torneo**. El índice hacía
`porClave.set(k, datos)`: en un tramo con dos torneos, la segunda fila
**borraba** a la primera.

```
DEPORTIVO · GARCÍA ARAGON, NAHUEL
  IDA       9 PJ · 139 PTS · 36/68 T2
  VUELTA    3 PJ ·  45 PTS ·  8/15 T2
  esperado 12 PJ · 184 PTS · 44/83 T2
  __acum    3 PJ ·  45 PTS          ← solo la VUELTA
```

**Y EL MODO DE FALLAR ERA EL PEOR.** El promedio del TOTAL estaba bien —12
PJ, 15,3 PTS por partido, derivado por otro camino— así que la pantalla
mostraba el número correcto hasta que alguien tocaba «Totales». Un total de
45 puntos sobre 3 partidos no se lee como un error: se lee como un jugador
de rotación.

### Cómo se suma

Con las MISMAS reglas que el TOTAL derivado (punto 3 ter), porque son el
mismo cálculo por otro camino:

- **las CUENTAS se suman**, `PJ` incluido — es el denominador, no un
  promedio;
- **el TEXTO se toma del primero** (nombre, equipo, fase): concatenar el
  nombre es el error tonto que esto evita;
- **las TASAS no se suman NUNCA.** Se recalculan sobre los totales, que no
  es lo mismo que promediar la tasa de cada torneo. En esta hoja la única es
  `AST-PP`, y vale 1,5 en los dos tramos: sumarla daría 3,0.

### La mitad que no se puede romper

Con **un** torneo, sumar una fila tiene que dar exactamente esa fila. Si no,
el arreglo del TOTAL habría roto la vista que sí funcionaba. `test-acumulacion.js`
lo fija, y fija además el caso de **tres** torneos: con dos, un `set` sobre el
segundo y un `+=` sobre el tercero dan lo mismo, así que un test de dos no
distingue el bug de su arreglo.

Los números de las fixtures son los **reales** del caso reportado: si algún
día se «arregla» con una fórmula que da otra cosa, esto lo canta.

---

## 47. EL TOTAL ES LA SUMA DE SUS TORNEOS, TAMBIÉN PARA LOS MANUALES

Reportado desde producción: un partido cargado en la **IDA** sumaba en la
tabla **TOTAL** y no en la vista de IDA. Medido contra el KV, eran **dos**
defectos encadenados y opuestos.

### 1 · El formulario archivaba en el sintético

`configTramosDisponibles()` ya excluye `*TOTAL*` —no es un tramo donde se
juegue— pero `configManualTramoDestino()` caía al tramo **abierto en la**
**barra**, y desde el punto 3 ter el panel abre justamente en TOTAL.

O sea: el admin veía un desplegable que ofrecía solo IDA y VUELTA, no lo
tocaba, y el partido se archivaba **en una llave que ese mismo**
**desplegable se negaba a ofrecer**. Ahora el respaldo cae al primer
tramo real de la misma fase — lo que se publica es lo que se ve.

**Y la guarda va también en el SERVIDOR**, por lo mismo que la acción de
zonas escribe un solo slot (punto 32): aunque una versión vieja del panel
siga mandando `*TOTAL*`, no puede archivar ahí.

### 2 · Y `manualesDelTramo` buscaba por llave EXACTA

Con eso, un partido correctamente archivado en `IDA|REGULAR` quedaba
invisible en la vista que el panel **abre por defecto**. O sea que
arreglar solo lo primero habría dado vuelta el síntoma en vez de cerrarlo.

El TOTAL junta ahora las llaves de la **misma FASE**. Tres reglas:

- **Nunca se mezclan fases**, por el mismo motivo que el TOTAL derivado
  del núcleo no las mezcla: una regular con unos playoffs no significa
  nada.
- **La llave sintética se sigue leyendo**, por retrocompatibilidad: hubo
  una ventana en la que el formulario dejaba caer partidos ahí, y
  descartarla borraría de la tabla resultados que el club ya cargó.
- **Un mismo `id` no se cuenta dos veces.** Si un partido quedara en dos
  llaves de la misma fase, el TOTAL lo sumaría duplicado y **PJ dejaría
  de cuadrar contra PG+PP**.

### Los cuatro partidos ya archivados

Quedaron bajo `*TOTAL*|REGULAR`: dos de DEPORTIVO y dos de Reconquista,
todos del **2026-07-09**. Con el arreglo el TOTAL los sigue contando, pero
la vista de IDA no los ve hasta que se reubiquen en KV.

El tramo destino **no se asume: se mide**. DEPORTIVO declara su calendario
(punto 18) y Reconquista no, así que el rango sale del propio libro:

```
DEPORTIVO     IDA 07/05 → 16/07   ·   VUELTA 06/08 → 03/09
RECONQUISTA   IDA 05/05 → 14/07   ·   VUELTA 04/08 → 01/09
```

El 09/07 cae sin ambigüedad en la IDA de los dos, y a más de tres semanas
del arranque de la VUELTA. Vale la regla del punto 18: **una fecha en dos
ventanas no se asocia** — un partido mal atribuido contamina los
promedios de dos tramos y no se nota.

---

## 66. ORTG, DRTG Y NET VAN POR 100 POSESIONES · norma CAB/FIBA (2026-09-25)

Pedido del club después de la auditoría de [`AUDITORIA_METRICAS_EFICIENCIA.md`](AUDITORIA_METRICAS_EFICIENCIA.md):
alinear el panel con la definición del Instituto CAB/FIBA. **Los ratings se
calculan sobre POSESIONES (`POS = PLAYS − RO`); el PPP se queda por PLAY.**

### La decisión que no estaba en el pedido, y por qué

El pedido nombraba los tres lugares que RECALCULAN —la card del partido, la
comparativa y el TOTAL del núcleo—. Auditando apareció que **el resto de la
app no calcula: LEE** `RTNG OFF/DEF` de `PROMEDIOS 4F`, que MotorStats escribe
por 100 PLAYS. Equipos, los rankings, Scouting, Personalidad, el scatter de
Principal y el Simulador salen de ahí.

Tocando solo los tres, **el mismo equipo mostraría posesiones en el TOTAL y
plays en la IDA**: dos unidades según el selector, que es lo contrario de
alinear. Por eso la derivación va en UN punto del índice —después de armar
`partidosPorId`, antes de las distribuciones— y pisa lo que trae la hoja.

```
temporada   los totales de Base Datos E que el índice ya suma (propio y rival)
            → sin partidos cargados, la fila de PROMEDIOS E con sus *opp
por partido la fila del OTRO LADO del cruce → si no está, las columnas *opp
```

**El rival sale de la MAESTRA y no de las columnas `*opp`**, que son `opt` en
el contrato: un libro que no las traiga se quedaría sin DRTG, y hoy lo tiene.
La fila del otro lado siempre está en `Base Datos E`, que es la hoja que manda.

**Sin PLAYS no hay rating**: se borra la clave en vez de dejar el número por
play debajo de un rótulo que dice «posesiones». Un dato inventado es peor que
uno ausente, y acá el modo de fallar sería invisible.

### Lo medido sobre el libro real de DEPORTIVO (IDA · REGULAR)

```
identidad contra 100 x PTS / POS        exacta (0 de error) sobre los 12 equipos
contra la vara vieja                    hasta 11,4 puntos de diferencia
cambian de puesto en ORTG                9 de 12 equipos
cambian de puesto en NET                 6 de 12
```

Ese reordenamiento es el punto entero del cambio: **por play, el equipo que
gana el cristal ofensivo sale peor**, porque cada rebote le suma un play al
denominador. DEPORTIVO LA PLATA pasa de #2 a #1 en ataque.

### La fila EQUIPO TIPO se recalcula

La de la planilla trae la mediana de los ratings POR PLAY, así que no describe
la vara nueva. Se recalcula sobre los valores ya derivados, **columna por
columna**: el NET sale de la mediana de los netos y nunca de restar las otras
dos medianas (punto 3). Medido: −5,23 contra 0,64 que daría la resta.

### Lo que NO cambió, y es deliberado

- **El PPP sigue por PLAY** —`PPP`, `PPP OF`, `PPP DEF`, `NET PPP`— y la card
  lo dice. Es la única métrica de la casa que mide el intento y no la tenencia.
- **El PACE ya iba por posesiones** desde siempre (`_tasaPace_` del motor resta
  el rebote ofensivo). No se tocó una línea: lo que cambió es que ahora el
  rating que tiene al lado habla su misma unidad.
- **Los 4 Factores, el eFG%, el %TOV y el rebote** no se tocan.
- **La planilla no se toca.** MotorStats sigue escribiendo `RTNG OFF/DEF` por
  100 plays y el club lo sigue auditando ahí. **Consecuencia a decirle al club:
  la hoja y el panel muestran números distintos para la misma sigla.**

### La nomenclatura visible · ORTG · DRTG · NET

`SGADD.siglaVisible(clave)` traduce solo para MOSTRAR. **Las claves no se
tocan**: las usan el índice, el glosario, los tooltips, el servidor y los links
ya compartidos. Una sola tabla (`SIGLA_VISIBLE`), porque con dos la pantalla y
el papel terminan diciendo cosas distintas.

Alcanza a las cabeceras de los rankings, a los labels del registro (`ORTG ·
Rating ofensivo`) y a la matriz de Scouting, que decía `EFF OF` / `EFF DEF`.

### El validador de BOX SCORE TRUNCADO · bloque 6 del Diagnóstico

`SGADD.detectarBoxTruncado(idx)`, motor puro. La firma del defecto es que el
partido sale **lento y a la vez eficientísimo**: el marcador está cargado y las
acciones no, así que el denominador se achica.

```
PACE < 80 % de la mediana de la liga   Y   PPP > 120 % de la mediana
```

**LAS DOS CONDICIONES VAN JUNTAS.** Con un «o» se denuncia un partido rápido y
goleador que no tiene nada roto: medido en el libro, el 14/09 cruza el corte de
PPP por una milésima con 87,5 de PACE. Sobre las 210 filas del TOTAL marca **15
filas de 8 partidos** —la fecha entera del 9/07 más los cuatro de ATENAS 'B'—
y no deja afuera ninguna fila con `PP ≤ 3`. En la IDA sola son 14 de 7: el 13/08
es de la Vuelta.

**El panel NO excluye esos partidos: los DENUNCIA.** Sacarlos sería reescribir
el torneo. La corrección va en el box score de origen o en MotorStats.

El grano es la fila EQUIPO-partido y no el cruce, porque **un partido puede
tener un lado sano y el otro truncado**: el 13/08 marca solo a ATENAS 'B'
(TCI 39, PP 4) y deja a Villa San Carlos afuera (TCI 47, PP 14), que es
exactamente lo que el dato dice.

### El efecto colateral que hay que anotar · el SIMULADOR

El pedido excluía `sgadd-4factores.js` y **no se tocó una línea**. Pero el
Simulador LEE `NET RTNG` del índice como prior de fortaleza, así que ese prior
pasó a estar en posesiones. Medido sobre los 132 cruces del libro:

```
cambio medio del margen proyectado   0,41 puntos
cambio máximo                        1,28 puntos (ATENAS B vs DEPORTIVO LA PLATA)
cruces en los que cambia el ganador  1 de 132
```

Es chico porque la escala del prior es 0,15, pero **no es cero y no se podía
evitar sin dejar al Simulador leyendo una unidad distinta de la que muestra el
panel**. Su defecto propio —proyectar con `PACE × PPP`, o sea posesiones por
puntos por play, 11,4 % corto— **sigue abierto**: está en la auditoría y no
entró en esta entrega.

### Lo que hay que respetar al tocarlo

- **Ninguna vista divide puntos por PLAYS para un rating.** Hay dos tests que
  leen el fuente del núcleo y de la card y fallan si vuelve.
- **La derivación vive en UN lugar.** Si mañana una vista nueva necesita el
  rating, lo lee del índice; recalcularlo al lado es volver a partir la unidad
  en dos (el bug del rol funcional, punto 8).
- **El respaldo del scatter de Principal lee `PROMEDIOS E`**, no `PROMEDIOS 4F`:
  con la de 4F el mapa mostraría una unidad en el primer pintado y otra en
  cuanto entra el índice.
- **`factoresTotal` (`ACUMULADO 4F`) NO se deriva**: hoy no lo lee nadie y su
  hoja no trae las columnas del rival. Si algún día se muestra, hay que
  derivarlo acá también.
- **Cada arreglo se verificó AL REVÉS**, revirtiendo una pieza por vez y
  contando lo que cae:

```
la derivación por posesiones (núcleo)      9 tests
las correcciones del glosario              4
la card del partido                        4
el validador, devolviendo vacío            4
la nota al pie de Eficiencia               2
el respaldo del scatter de Principal       2
las dos condiciones juntas del validador   2
la tabla de siglas visibles                2
los ratings del ciclo de la comparativa    1
la columna NET/plays de quintetos          1
```

  Y sacar `detectarBoxTruncado` del objeto exportado **no hace caer tests: hace
  que `test-core.js` no arranque**, que es lo que corresponde cuando lo que
  falta es la función y no su resultado.

---

## 84. EL RIVAL DE UNA NOCHE SE EMPAREJA POR FECHA + PARTIDO (2026-10-02)

Salió al validar la v111 del motor (PACE y AST-PP de la temporada en
RANKINGS E) contra la web en la **Zona C de APB**: la planilla daba 80,21 de
PACE para RECONQUISTA 'B' y el TOTAL de la web 80,43.

**La planilla tenía razón.** El índice armaba el lado rival de cada partido
(`e.totales.rival`, `agregarPartidos`, `filaDelRival`) buscando la otra fila
con el mismo **texto** de `PARTIDO`. Con el mismo local en la ida y en la
vuelta, «RECONQUISTA 'B'- MM vs VILLA SAN CARLOS 'B' - MM» se escribe igual
las dos noches, y la vuelta tomaba como rival la fila de la IDA: +9 plays y
+3 rebotes ofensivos de otra noche. Es la trampa del punto 3 ter, ahora del
lado del rival.

`rivalDe(p, clave)` empareja por **`__id` (FECHA + PARTIDO)**. El texto
queda de respaldo solo si tiene **un único** rival posible. El injerto del
rival de otra zona (punto 79) también indexa por id.

Medido: solo cambia la Zona C, y solo en sus dos equipos (RECONQUISTA 'B':
PACE, RO%, RD%, eFG Opp%, DRTG, NET y PR%). Los otros cinco libros, idénticos
— ahí ningún local repite el texto. Lo fija `test-core.js` («el rival de una
noche es la fila de ESA noche»); sin el arreglo caen 4.

---

## 176. NINGÚN «TOTAL» QUE JUNTE INSTANCIAS DE POSTEMPORADA (2026-11-13)

Reportado en Bahía Blanca (cliente Leandro N. Alem): con los Cuartos del Clausura en juego, la barra abría en **«Total - Clausura» · 10 equipos · 7 partidos**, dentro de «Fase regular». Assets en `?v=382`. `test-llave-bahia.js` (sección 6) lo fija.

- **Lo medido**: el libro `bahia-blanca-2026-postemporada-clausura` (el mismo del Play-In) trae `PLAY IN|CLAUSURA` (3 partidos) y `CUARTOS|CLAUSURA` (4), los dos con la carpeta al revés (punto 134). Para el núcleo eso es FASE = CLAUSURA con dos «torneos», y desde el punto 3 ter toda fase con dos torneos o más recibe su TOTAL sintético: juntaba un Play-In con unos Cuartos. Y como la fase de lo último jugado no es REGULAR, `tramoPorDefecto` abría por ese total.
- **El arreglo** (`combinacionesTorneoFase`, núcleo y `compartido/`): una FASE donde algún «torneo» es una instancia de eliminación (`SGADD.esInstanciaDeEliminacion`: las del vocabulario `FASES` con `eliminacion` y PLAY IN, PLAYOFFS, OCTAVOS, CUARTOS, SEMIFINAL, FINAL, PROMOCIÓN, PERMANENCIA, TERCER PUESTO…) no recibe TOTAL. Ahora abre en `CUARTOS|CLAUSURA`. El TOTAL de la regular (Apertura + Clausura) y el de una fase de eliminación con dos torneos reales siguen igual.
- **Un link o una preferencia guardada con `*TOTAL*|CLAUSURA`** deja de ser válido y cae al tramo por defecto.
- **Panel Master**: las tres fases de Bahía leen bien, pero cada una está declarada de una forma (Octavos con `torneo: OCTAVOS` y libro `APERTURA`; Play-In sin torneo y libro `PLAY IN`; Cuartos con `torneo: CLAUSURA` y libro `CUARTOS`). Lo prolijo es declarar todas como Cuartos (libro = la instancia, torneo = Apertura/Clausura) y nombrar las carpetas «CLAUSURA - CUARTOS». No se escribió en KV.

---

