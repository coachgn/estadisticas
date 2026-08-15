# SGADD · Sistema de Gestión y Análisis de Datos Deportivos

Panel de scouting de básquet para **Club Reconquista La Plata**, multi-cliente.
Sitio estático publicado en GitHub Pages: `https://coachgn.github.io/estadisticas/`

Hablar siempre en **español rioplatense**, directo y técnico. Sin explicaciones de
principiante sobre el contenido técnico.

**Guía de diseño oficial: https://www.checklist.design/** — se consulta ante
cualquier duda de interfaz (microinteracciones, drawers, toasts, empty states,
focus rings, contraste WCAG, jerarquía en tablas y gráficos). Detalle y reglas
aplicadas en el punto 14.

---

## 1. Cómo correr y verificar

```bash
node test-core.js          # 170 tests · núcleo, índice, validador
node test-logos.js         #  18 tests · resolución de escudos
node test-ligas.js         #   9 tests · aislamiento entre ligas
node test-clubes.js        #  22 tests · multi-cliente
node test-boot.js          #  33 tests · arranque por club + sintaxis de los módulos
node test-jugadores.js     # 189 tests · rol, arquetipos, tiro, evolución, local/visitante, rankings
node test-4factores.js     #  94 tests · regresión, pesos de liga, perfil de equipo, Simulador 360°
node test-personalidad.js  #  20 tests · identidad táctica
node test-informe.js       #  45 tests · secciones del informe y su PDF
node test-partido.js       #  44 tests · detalle partido a partido, perfil de tiro y su PDF
node test-scouting.js      # 447 tests · informe pre-partido, bandas, marcas, sintesis, titularidad
node test-estados.js       # 125 tests · estados de jugador, alertas, buzon, sync grafico-tabla
```

**1216 tests en total. Todos tienen que dar verde antes de commitear.**

Todos los `test-*.js` corren **desde la raíz del repo** (no desde `js/`): sus
`require('./js/sgadd-core.js')` son relativos al propio archivo, no al cwd.
Un `test-*.js` subido a `js/` por error rompe con `MODULE_NOT_FOUND` aunque se
invoque `node test-x.js` desde la raíz — ya pasó una vez con una subida manual
por la web de GitHub.

Algunos tests extraen módulos del `index.html` en tiempo de ejecución
(`logos-extraido.js`, `boot-extraido.js`). Son temporales: se generan, se usan y
se borran dentro del propio test. No commitearlos.

### Los nombres de EQUIPO de las fixtures son reales

Salen de `logos/<liga>/index.json`. `test-scouting.js` usa ATENAS A, PLATENSE A,
NAUTICO ENSENADA y UNIVERSAL; antes eran inventados —AGUILA, MEDIO, BAJO,
TOPO— y eso escondía dos problemas: **un club que no existe no se puede
contrastar contra la planilla**, y ya pasó que un test apuntara a `'HALCON'`,
que tampoco existía, corriendo **en silencio sobre una lista vacía** — ocho
checks de candidatos que no verificaban nada. Con nombres reales un typo se
nota, y hay un check que falla si la fixture de señales queda vacía.

Ninguna fixture de scouting usa RECONQUISTA **a propósito**: varios checks
verifican qué hace el respaldo por `esEquipoPropio()` cuando ninguno de los dos
equipos del cruce es del club. Meter al equipo propio ahí cambiaría esa rama
sin avisar.

Los **nombres de JUGADOR** sí siguen siendo descriptivos (`'TIRADOR, ELITE'`,
`'PIVOT, INTERNO'`): dicen qué regla encarna cada uno, que es justo lo que el
test verifica. Con nombres de personas reales el test no se leería, y quedaría
mintiendo apenas ese jugador cambie de rendimiento.

`test-personalidad.js` y `test-partido.js` sí dependen de fixtures **committeadas**
en `test-fixtures/prom.tsv` y `test-fixtures/p4f.tsv` (12 equipos de La Plata,
PROMEDIOS E + PROMEDIOS 4F con fila EQUIPO TIPO). A diferencia de los
`-extraido.js`, estas quedan en el repo: no se regeneran solas.

No hay build ni bundler. Se edita, se sube, se ve.

---

## 2. Arquitectura

```
index.html              ← app entera: HTML, CSS, LOGOS, charts legacy
js/
  sgadd-club.js         ← config por cliente (?club=X). Arranca SOLO.
  sgadd-core.js         ← ESQUEMA, METRICAS, CATALOGO, índice, validadores
  sgadd-ui.js           ← StatCard, PercentileBar, MetricTable, TeamPicker, tabs
  sgadd-app.js          ← estado global: planilla y fase compartidas
  sgadd-charts.js       ← fábricas Chart.js + narrativas generadas
  sgadd-personalidad.js ← 8 ejes de identidad + insight victorias/derrotas
  sgadd-partido.js      ← análisis de un partido: desvíos z-score, avanzadas
  sgadd-rankings.js     ← réplica de RANKINGS E, calculada en el cliente
  sgadd-equipos.js      ← sección Equipos: grilla, ficha, 8 tabs, detalle partido
  sgadd-jugadores.js    ← sección Jugadores: grilla, ficha, tabs General/Evolución/Partidos
  sgadd-4factores.js    ← motor de regresión + sección Simulador (cruce A vs B)
  sgadd-scouting.js     ← informe pre-partido de equipos (motor + UI)
  sgadd-informe.js      ← modal de exportación PDF del informe de equipo
  sgadd-estados.js      ← motor puro de estados de jugador y detección de alertas
  sgadd-buzon.js        ← UI del buzón: drawer, toast, badge (usa `document`)
  sgadd-diagnostico.js  ← auditoría de datos, visible en la app
INTEGRACION_MOTORSTATS.md ← auditoría del motor que escribe las planillas
AUDITORIA_ETIQUETAS_JUGADORES.md ← glosario y auditoría de TODAS las etiquetas
PROPUESTA_ESTADOS_JUGADOR.md ← diseño original de estados (ya implementado, ver punto 13)
generar-manual-etiquetas.js  ← genera MANUAL_ETIQUETADO_SGADD.html para el
                          cuerpo técnico. Se corre a mano: `node generar-manual-etiquetas.js`
clubes/
  reconquista.json      ← 2 planillas (Primera + U21 Negra), liga la-plata
  jujuy.json            ← 1 planilla (Conferencia Norte), liga liga-argentina
logos/<liga>/           ← escudos + index.json (manifiesto)
test-fixtures/          ← prom.tsv + p4f.tsv, 12 equipos de La Plata (committeados)
simulador-4factores-legacy.js ← Apps Script original (auditado, no se ejecuta:
                          ver punto 10). Queda como referencia de qué se corrigió.
```

**Versión actual de assets: `?v=88`.** Los `<script>` llevan query string para
bustear el caché de GitHub Pages. **Subir el número en CADA entrega**, si no el
navegador sirve la versión vieja y se pierden horas debuggeando fantasmas.

### Orden de carga (importa)

`sgadd-club.js` va primero y se auto-arranca. `resolverClubYPlanilla()` en el
`index.html` es el único lugar que resuelve club → `SHEET_ID`, y lo llaman tanto
`init()` como `refreshData()`. **Nunca duplicar esa lógica**: cuando estuvo en dos
lados, `init()` quedó sin ella y Jujuy mostraba los datos de Reconquista.

---

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
motor (PLAY vs POS, PPP por play, RTNG por 100 plays, EQUIPO TIPO = mediana en
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

### Estado global y selector

`SGADD_APP.estado.torneo` es global, igual que planilla y fase. El selector
**Torneo** aparece en la barra superior SOLO si el libro trae más de uno: con
una planilla por torneo —que es como trabajan todos los clubes hoy— sería un
desplegable de una sola opción ocupando lugar. Cambiar de planilla resetea el
torneo (es del libro anterior) y `cargar()` lo revalida contra los torneos
reales del libro nuevo.

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
- **`RTNG OFF/DEF` está por 100 PLAYS, no por 100 posesiones.** No comparable con
  el ORTG de la NBA. Etiquetarlo siempre.
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

## 6. Multi-cliente

Un solo deploy. `index.html?club=jujuy` carga `clubes/jujuy.json`, que define
marca, color, liga, patrón de equipo propio, sufijos y planillas.

- **La config es OPCIONAL.** Si el JSON no carga, la app funciona con los
  defaults de Reconquista. Nunca puede tumbar el dashboard.
- **`aplicarDatos()` y `aplicarUI()` están separadas** a propósito: un detalle de
  presentación (el header todavía no está en el DOM) no puede bloquear la
  aplicación del catálogo de planillas.
- **Al cambiar de club se limpia todo**: `LOGOS.reset()` y `SGADD.limpiarCache()`.
  Dos ligas pueden tener un "Atenas" cada una con escudo distinto.
- **El color de marca se aclara automáticamente** para usarlo como texto
  (`--acento-texto`). El azul de Jujuy da 2.84 de contraste sobre la card oscura,
  abajo del mínimo WCAG de 4.5. Se mezcla con blanco hasta que pasa.

Sumar un cliente = un JSON + su carpeta de escudos. Cero código.

---

## 7. Exportación a PDF

Hay **tres** exportaciones, y no comparten criterio de color:

| Export | Dónde | Color |
|---|---|---|
| **Scouting pre-partido** (`scoutImprimir()`) | `sgadd-scouting.js` | **la paleta de la app** |
| **Informe de equipo** (`sgadd-informe.js`) | modal con checkboxes | papel blanco |
| **Post-partido** (`equiposImprimirPartido()`) | dos carillas A4 | papel blanco |

Enfoque: `window.print()` + `@media print`. **No usar html2pdf/jsPDF**: los
canvas de Chart.js no rasterizan bien y los cortes de página quedan mal.

### Cómo verificarlo · GENERAR EL PDF, no leer el CSS

**Se puede generar el PDF real y auditarlo.** Es la única forma de no
adivinar, y ya evitó tres diagnósticos equivocados. Chrome está en
`C:\Program Files\Google\Chrome\Application\chrome.exe`:

1. `chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>`
2. Por CDP (`fetch` a `127.0.0.1:9222/json/list` + `WebSocket`, ambos nativos
   en Node): `Page.navigate` → `Runtime.evaluate` para armar el cruce →
   `Page.printToPDF` con `preferCSSPageSize: true`.
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
7+ Fichas individuales
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

**UN SOLO CRITERIO DE COLOR PARA LAS TRES.** Hoja blanca, tarjetas grises
(`#f1f5f9` con borde `#cbd5e1`) y acentos. El DT abre cualquiera de los tres
y encuentra la misma jerarquía visual. Scouting estuvo un tiempo con la paleta
oscura de la app; se revirtió a pedido del club.

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

## 8. Sección JUGADORES

**Estado: grilla → ficha → tabs General/Tiro/Evolución/Partidos, con motor de
arquetipos.** Vive en `sgadd-jugadores.js`, misma estructura que Equipos.

Ruta: `#/<planilla>/<fase>/jugadores/<jugador>/<tab>` — reusa `Ruta` tal cual
(entidad = jugador, igual que Equipos usa entidad = equipo). El único cambio
en `sgadd-core.js` fue agregar un 7mo nivel `jugador` a `Ruta` (para un link
cruzado puntual, no para esta ruta) y el índice `liga.jugadoresPorEquipo`
(`Map<claveEquipo, jugador[]>`, filtra la grilla sin recorrer `liga.jugadores`
entero por nombre de equipo en cada repintado).

**Clave de un jugador = NOMBRE + EQUIPO**, no el nombre solo (`jugadoresSlug()`
en `sgadd-jugadores.js`). Dos homónimos de equipos distintos abrían la ficha
equivocada con solo el nombre; con la clave compuesta no colisiona. Esto NO
arregla la mezcla de stats en `statJugador()` (ver deuda técnica, punto 10),
solo evita sumarle un segundo bug de navegación encima.

### Rol por minutos — bandas fijas, no percentiles

A pedido explícito del club, el badge de rol **NO** es relativo a la liga
(no usa percentil): son bandas fijas de MIN de promedio, iguales en
cualquier categoría (`ROLES_MINUTOS` en `sgadd-jugadores.js`):

| Banda | MIN de promedio | Rol |
|---|---|---|
| Jugador Clave | 25 o más | Dependencia Absoluta |
| Jugador Importante | 20 a 24,9 | Consistencia Estructural |
| Jugador de Rotación | 15 a 19,9 | Impacto Quirúrgico |
| Pocos Minutos | menos de 15 (marca aparte si es <10) | Contención y Emergencia |

**Recalibradas en 2026-08-10** contra la distribución real (210 jugadores,
MIN p25 19,4 · p50 22,7 · p75 27,9 entre calificados). Los cortes viejos
(26/23/13) dejaban "Importante" en una franja de 3 minutos —14 jugadores en
toda la liga— y metían 60 en una "Rotación" de 10 minutos de ancho. Los
nuevos parten la liga en tres grupos activos comparables (34 / 33 / 31) y el
corte de 15 coincide con el umbral de calificación, así que **Pocos Minutos
pasa a significar exactamente "no llega a tener percentil"**.

Ojo: esto es **distinto** de `liga.minJugador` (el umbral de calificación
para que un percentil tenga sentido, que sí es relativo a cada liga). Un
jugador puede ser "Jugador Clave" por minutos y a la vez no calificar para
percentiles si la liga entera juega poco — son preguntas distintas.

### El ADN es un motor único · single source of truth

`jugadoresADN(idx, j)` en `sgadd-jugadores.js` es **la** función que
etiqueta a un jugador. Devuelve las cuatro taxonomías juntas:

| Campo | Pregunta que contesta | Ejemplo |
|---|---|---|
| `rolMinutos` | ¿cuánto juega? | Jugador Clave · Dependencia Absoluta |
| `jerarquia` | ¿cuánto pesa en su plantel? | ⭐ Jugador Franquicia |
| `arquetipos` | ¿qué sabe hacer? | 🧤 Especialista Defensivo |
| `rolFuncional` | ¿qué función cumple en cancha? | Manejador Secundario |

**El bug que cerró.** El rol funcional vivía en `sgadd-scouting.js` y el
resto acá, y cada sección mostraba un subconjunto distinto: el mismo
jugador era "Manejador Secundario / Defensor Físico" en el informe
pre-partido y "⭐ Jugador Franquicia / 🧤 Especialista Defensivo /
Dependencia Absoluta" en su ficha. No eran datos contradictorios — eran dos
motores y dos recortes. Ahora:

- `JUGADORES_ROLES_FUNCIONALES` y `JUGADORES_UMBRALES` viven **solo** acá.
  `sgadd-scouting.js` los lee (`COMPARTIDOS`), no los copia: un número
  duplicado termina distinto en cada archivo y vuelve a partir la
  taxonomía en dos.
- `jugadoresPerfilBase(idx, j)` calcula las métricas y los relativos a la
  liga. Scouting parte de ahí y solo **agrega** lo que depende del plantel
  (`concentracion`, `cuotaTriplesEquipo`), que es lo único que Jugadores no
  puede saber.
- `jugadoresBadges(adn)` arma las etiquetas, así que las dos vistas pintan
  literalmente el mismo texto.

Hay tests que recorren el plantel entero y exigen **igualdad estricta**
(`===`, no tolerancia) de 19 métricas base, de los discriminantes de origen
y del rol entre Scouting y Jugadores. Si alguien vuelve a duplicar la
cascada, fallan.

`sgadd-scouting.js` carga DESPUÉS de `sgadd-jugadores.js` en el
`index.html`: la dependencia va en un solo sentido y no puede invertirse.

**Ojo con el nombre**: `jugadoresADN()` es el motor; el renderer de los
badges de la ficha se llama `jugadoresBloqueADN()`. Se llamaban igual y
colisionaban.

### ADN del jugador — arquetipos y jerarquía

Motor de arquetipos técnicos + jerarquía dentro del plantel, adaptado del
`obtenerSintesisPerfil(dataI)` que ya usa el club. Toda la lógica es pura y
está en `sgadd-jugadores.js` (nada se movió a `sgadd-core.js`): `jugadoresPromediosLiga()`,
`jugadoresArquetipos()`, `jugadoresJerarquia()`, `jugadoresPuntoDeFuga()` y
`jugadoresSintesisPerfil()`, que junta todo para el Tab General.

**Regla del proyecto: donde esa lógica usaba `VAL`, acá se usa `PLAYS`.** `VAL`
está deliberadamente afuera del box score de SGADD (índice compuesto, ya
resumido en el resto de columnas — ver punto 4); `PLAYS` da el mismo
contexto de volumen de forma más legible y es la métrica que ya usa el
resto del proyecto para "cuántas decisiones toma".

Perfiles técnicos (`PERFILES_TECNICOS`, no excluyentes — un jugador puede
calzar en varios) y umbrales, todos contra `idx.liga.jugadoresCalificados`
de la liga actual (agnóstico de liga, igual que Personalidad):

| Perfil | Condición | Casos en la liga real |
|---|---|---|
| 🎯 Terminador de Élite | PLAYS > liga, eFG% > 1.15x liga, PPP > 1.05 | 4 |
| 🧠 Generador | AST-PP > 1.40 | 29 |
| 🏰 Puntal en la Pintura | RO+RD > 1.20x el promedio de la liga | 28 |
| 🎯 Amenaza Perimetral Real | T3I > 3.0 y T3% > 34% | 11 |
| 🧤 Especialista Defensivo | recuperos (PR) > 1.30x el promedio | 30 |
| 📏 Buscador de Contacto | RTL% ≥ 0,28 **y** FR ≥ 2,5 **y** PT1% ≥ 0,12 **y** T1% ≥ 0,72 | 12 |

**El Buscador de Contacto es multivariable desde 2026-08-10.** El criterio
anterior (`PT1% > 0,25` y `T1% > 0,80`) era **imposible de cumplir**: el
PT1% más alto de la liga real es 0,230, así que el arquetipo daba cero sobre
210 jugadores. Un cuarto de los plays terminando en la línea es un perfil de
NBA, no de liga amateur.

Ahora el viaje a la línea se mide con cuatro señales que describen cosas
distintas y por eso se exigen **juntas**: `RTL%` (con qué frecuencia el
ataque termina en tiro libre), `FR` (agresividad: faltas recibidas por
partido), `PT1%` (qué porción de SUS plays son libres) y `T1%` (si además
rinde). Los tres primeros salen del percentil ~70 de la liga real; el `T1%`
es el único absoluto, porque convertir 72% es bueno en cualquier categoría.

Jerarquía (`JERARQUIA`, **sí excluyente**: cascada, gana el primero que
calza, de más a menos exigente):

1. ⭐ **Jugador Franquicia** — PLAYS > 1.20x liga y más de 28 minutos.
2. ⚔️ **Referente Ofensivo / Segunda Espada** — PLAYS por encima del
   promedio de la liga.
3. 🧱 **Pieza de Rotación Alta** — MIN ≥ 23, sin ser el foco de PLAYS.
4. 🛠️ **Especialista de Rol** — el resto (fallback, siempre calza).

### La referencia de los relativos de rebote NO es el `JUGADOR TIPO`

Regla que costó encontrar y que estaba distorsionando media taxonomía.

**La fila `JUGADOR TIPO` de la planilla es la mediana de TODOS los jugadores
del libro, incluidos los que promedian 0 minutos.** Medido en la liga real:
`RO%` del TIPO 0,0131 contra 0,0216 de mediana entre los 97 calificados — un
factor de **1,66x**. En `RD%`, **1,70x**.

Consecuencia: `reboteRel = RO% / TIPO.RO%` daba **1,66 de MEDIANA** para un
jugador de rotación normal. Un umbral de "1,20x la liga" lo pasaba el 65% del
plantel y uno de "1,15x" el 85%. Los umbrales decían *"muy por encima de la
liga"* y en los hechos significaban *"juega"*.

Eso hacía que `esInterior` fuera casi gratis en su parte de rebote y que
`rim-runner` —primero de los tres roles interiores— absorbiera al grupo
entero: `finalizador-corto` y `ancla-defensiva` daban **cero sobre 210**.

`jugadoresReferenciasRebote(idx)` compara contra la **mediana de los
calificados**, que es el mismo universo con el que ya se construyen los
percentiles y las bandas z. El `JUGADOR TIPO` queda como respaldo cuando hay
menos de 3 calificados: viene de la planilla y es lo que el club audita, así
que no se descarta, se degrada a él. El perfil expone `refRebote` para poder
auditar cuál se usó.

**Al tocar cualquier umbral relativo de rebote hay que recordar que ahora la
mediana vale 1,00.** Los valores vigentes: `reboteDesempate` 1,10 (≈p57),
`reboteInterior` 1,15 (≈p62), `reboteOfensivoAlto` 1,30 (≈p68).

La síntesis (Tab General) muestra impacto colectivo y eficiencia individual
en Alto/Medio/Bajo contra la liga, más un "punto de fuga" (el percentil más
bajo entre eFG%/PePP%/RTL%/AST-PP/T1%) y una conclusión táctica. **No es
una recomendación de renovación de contrato** — el club es amateur, no
gestiona pases — es la condición de uso para sacarle el máximo (ej. "limitar
minutos", "trabajar tal debilidad").

### El scatter "Uso vs eficiencia" · nodos con iniciales

`SGADD_CHARTS.scatterUsoEficiencia()` dibuja un anillo con las **iniciales del
jugador adentro** (`inicialesJugador`), no una burbuja anónima. La planilla
escribe `"APELLIDO, NOMBRE"` y la insignia va al revés: `"STEHLI, RAMIRO"` →
**RS**. El texto lo pinta un plugin propio de Chart.js (`afterDatasetsDraw`),
con halo oscuro para que se lea aunque dos nodos se superpongan; el que está
bajo el cursor va con fuente más grande y blanco pleno.

**El piso son 10 minutos (`MIN_SCATTER`), y NO el umbral de calificación de la
liga.** Son dos preguntas distintas: `liga.minJugador` (~15,4 en La Plata)
decide si un PERCENTIL tiene sentido, y acá no se muestra ningún percentil sino
dos métricas crudas. Con el filtro viejo el gráfico recibía
`jugadoresCalificados` y dejaba afuera a los de rotación corta y a los
**refuerzos de última fecha** — justo los que el DT quiere ubicar en el
cuadrante. Medido en Reconquista: pasó de 7 a 9 nodos, y los dos que entraron
son un jugador de 13,6 minutos y un refuerzo con 4 partidos.

El radio va de 13 a 22px: el piso es alto porque adentro tienen que entrar dos
letras legibles.

### Local vs. Visitante

Tarjeta en el Tab General (`jugadoresBloqueCondicion()`) que compara PTS,
eFG%, PLAYS, MIN, USG% y AST-PP entre los partidos de local y de visitante
del jugador (`jugadoresSplitCondicion()`, arma los promedios filtrando
`liga.jugadorPartidos` por `CONDICION` — no hay equivalente pre-calculado
para jugadores como `e.split` en Equipos).

Con menos de 2 partidos de un lado no se muestra la comparación (un solo
partido no es una tendencia, es una noche). El **indicador de sensibilidad**
(`jugadoresSensibilidadCondicion()`) elige la métrica que más se aleja de
su propio umbral — no la diferencia más grande en términos absolutos, sino
la más grande EN RELACIÓN a lo que se considera ruido para esa métrica
(3 puntos de PTS y 3pp de eFG% no son la misma magnitud de cambio). Separa
métricas de **rendimiento** (PTS/eFG%/AST-PP: "Mejora de Local/Visitante")
de métricas de **uso** (PLAYS/MIN/USG%: cambia el rol, no necesariamente
la calidad — no lleva la palabra "mejora"). Sin ninguna métrica relevante,
el resultado es "Rendimiento estable".

### Etiquetas de los gráficos de evolución

Los tooltips de "Evolución" (Jugadores) y "Evolución · puntos a favor y en
contra" (Equipos) muestran fecha + rival + condición corta, ej.
`14/10 - vs ATENAS (L)`. `jugadoresEtiquetaEvolucion()` en
`sgadd-jugadores.js` y `equiposEtiquetaEvolucion()` en `sgadd-equipos.js`
son la misma idea duplicada a propósito (mismo criterio, cada módulo arma
la suya con su propio helper de rival) — `sgadd-equipos.js` no tenía
`module.exports` hasta esta vuelta; se le agregó SOLO para poder testear
esa función pura, el resto del módulo sigue sin testearse directo (usa
`document`/`LOGOS`, se verifica a mano en el navegador, igual que siempre).
**OJO**: la fecha va sin año (`SGADD.formatearFecha()` da `dd/mm`, no
`dd/mm/aaaa`) — es la convención que ya usa toda la app, no se tocó para
no meter una inconsistencia en el resto de las tablas de partidos.

### Landing de la sección: picker + plantel filtrado + rankings

Al entrar a Jugadores (sin ficha abierta):

1. **Elegí un equipo** — grilla de escudos con el MISMO componente que usa
   Equipos (`SGADD_UI.teamPicker`), no una copia.
2. **Plantel · <equipo>** — aparece SOLO con un equipo elegido. Cards
   ordenadas **estrictamente por MIN de mayor a menor**, con escudo, banda
   de minutos, badges del ADN y MIN/PLAYS/PTS/eFG%. Clic en una card abre
   el perfil 360°.
3. **Rankings de la liga · top 20** — 8 tablas en tabs.

**El selector NO cambia de sección.** Hubo una vuelta en la que el clic en
un escudo navegaba a `Equipos → Plantel`; rompía el flujo de trabajo (el DT
entra a Jugadores para mirar jugadores y terminaba en otra pantalla). Ahora
`jugadoresElegirEquipo()` solo escribe `JUGADORES.filtroEquipo` y repinta
la propia sección; volver a tocar el mismo escudo saca el filtro. Hay un
test que lee el fuente de esa función y falla si vuelve a aparecer un
`navigate(` o un `equiposIrA(` adentro.

No existe una lista de "todos los jugadores de la liga": sin equipo elegido
solo están el picker y los rankings. La lista completa se sacó por
redundante y no volvió.

**Los dos pickers ordenan alfabético.** El de Equipos ordenaba por rating
neto; se alineó con el de Jugadores porque el escudo es un buscador, no un
ranking — para saber quién anda mejor está la tabla de rankings que va
justo abajo, con el puesto de cada uno.

`JUGADORES_RANKINGS` es la réplica calculada de la hoja `RANKINGS J`, que
está excluida del ESQUEMA a propósito (mismo motivo que `RANKINGS E`: no es
una tabla, son bloques apilados y GViz devuelve basura). Seis tablas vienen
del Apps Script original — participación y puntos, eficiencia, tiro de
campo, tiro de 2, tiro de 3, tiros libres — y **dos son nuevas**:

| Tabla | Orden | Columnas |
|---|---|---|
| Rebotes | `RO` | MIN, RO, RD, RT |
| Creación y disciplina | `AST-PP` | MIN, AST-PP, AST%, FC, FR |

**Diferencia deliberada con la planilla**: acá `orden` decide únicamente
QUIÉN entra al top 20, y después se muestran las columnas completas de esos
veinte. El Apps Script rankea columna por columna y agrega una columna `#`
al lado de cada métrica; en pantalla chica eso es ilegible.

- **`RT` se deriva si falta**, con `jugadoresRT()` (RO + RD), el mismo
  helper que ya usaba el motor de arquetipos.
- **El umbral de minutos es editable.** Arranca en el `MIN` del
  `JUGADOR TIPO` de la liga (`jugadoresUmbralRanking`), que es el mismo
  criterio de calificación del resto del proyecto, pero el input deja
  bajarlo: un especialista de 8 minutos no califica para percentiles y aun
  así puede ser el que más rebotes ofensivos captura. Hay un test que
  verifica las dos ramas.
- **La mediana del resalte es la del propio top**, no la de la liga: estos
  veinte ya son la cola de arriba, y contra la liga entera todos quedarían
  marcados como "por encima".

### Orden dinámico: seleccionar y mostrar son dos pasos distintos

Clic en la cabecera de una métrica reordena la tabla; repetir el clic
invierte el sentido. La flecha marca la columna activa (▲/▼) y el resto
lleva un ⇅ tenue para que se note que también responden.

La distinción que hay que respetar al tocar `jugadoresRanking()`:

1. **Quién entra al top 20** → SIEMPRE por `g.orden`, la métrica del grupo.
   Eso es lo que hace que "top 20 de rebotes" sea el top 20 de rebotes.
2. **Cómo se muestran esos 20** → por `opciones.ordenPor`, lo que el
   usuario elija en la cabecera.

Si el orden de pantalla cambiara la selección, al ordenar por RD la tabla
dejaría de ser el top de rebotes y pasaría a ser otro cuadro sin avisar.
El `#` sí se renumera según el orden mostrado, que es lo que espera
cualquiera que toca una cabecera.

Detalles: cambiar de tab resetea el orden (un "por RD" heredado no
significa nada en la tabla de triples); los nulos van siempre al fondo,
ordene como ordene (un `—` arriba de todo en ascendente parece el mejor y
es el que no tiene dato); y pedir una columna que no está en el grupo cae
al orden del grupo en vez de romper.

### Lo que entró en esta vuelta

- **Grilla de la liga**: filtro por equipo, toggle "solo los que califican",
  badge de rol por minutos (bandas fijas, ver arriba).
- **Ficha**: header con KPIs (PTS, MIN, eFG%, USG%), badge de rol, jerarquía
  (ADN) y la consistencia del jugador (`statJugador` media ± desvío).
- **Tab General**: ADN (arquetipos + jerarquía), tarjetas de síntesis
  (impacto/eficiencia/conclusión), la tarjeta Local vs. Visitante, y KPIs +
  tablas en percentil contra la liga.
- **Tab Tiro**: distribución por zona (Triple/Doble/Libre) — peso relativo,
  CONV%, PPP y C/I — más gráficos de volumen y acierto vs. la mediana de
  la liga (reusa `SGADD_CHARTS.barrasComparadas()`, no se escribió una
  fábrica nueva).
- **Tab Evolución**: selector de métrica (`JUGADORES_METRICAS_EVOLUCION`,
  14 opciones: MIN, PTS, PLAYS, eFG%, TS%, USG%, RTL%, T2%, T3%, T1%,
  AST-PP, RO, RD, RT) con banda de ±1 desvío y picos atípicos (z ≥ 1.5)
  marcados en verde/rojo. `SGADD_CHARTS.evolucionJugador()` formatea el
  tooltip y el eje Y según la métrica elegida (un eFG% ya no se lee "0,45"),
  y el título del tooltip trae fecha + rival + condición.
- **Tab Partidos**: log del jugador con el mismo marcado de atípicos, clic en
  una fila **cruza a Equipos** y abre el detalle completo de ESE partido
  (box score de los dos equipos, insight, recomendación) — no duplica esa
  UI, la reusa vía `Ruta.build()`.
- **Equipos** (`sgadd-equipos.js`): el gráfico de evolución de puntos a
  favor/en contra ahora tiene el mismo enriquecimiento de tooltip.

### Lo que queda para la próxima vuelta

1. Tab **Comparar** (contra otro jugador o contra el JUGADOR TIPO).
2. **Curva de carga**: minutos vs eficiencia partido a partido.
3. PDF de ficha individual (después de resolver el punto 7).

---

## 9. Sección SCOUTING · Informe pre-partido

**Estado: implementado.** Vive en `js/sgadd-scouting.js` (motor puro
`SGADD_SCOUT` + UI en globals, como Simulador). Es la réplica calculada de
los PDFs "REPORTE SCOUTING" que el cuerpo técnico ya armaba a mano.

Scouting tiene dos tabs: **Informe pre-partido** (el nuevo, por defecto) y
**Comparar Jugadores** (la comparativa legacy de dos filas, sin tocar —
responde otra pregunta). El tab de equipos NO usa la capa de datos vieja
(`sheet()`): lee de `idx`, igual que Equipos/Jugadores/Simulador.

### Orden del nav

`Principal · Equipos · Jugadores · Scouting · Simulador · Diagnóstico`, y el
label del simulador es **"Simulador"** a secas (el modelo se sigue llamando
360° en la documentación y en la ficha, pero no en el menú).

### Los ocho bloques, en orden

Cada uno es una `<section class="scout-card" data-bloque="...">`. El orden
es rígido y va de lo colectivo a lo individual:

1. **Encabezado** — récord global y desglosado L/V de los dos, último
   partido con rival y marcador, e historial directo.
2. **Matriz de métricas avanzadas** — A vs B vs mediana de liga, con el
   puesto en la liga por métrica. Dos bloques: posesión/eficiencia
   (POS, PACE, eFG%, EFF OF/DEF con su PPP, %REB OF/DEF, %AST) y selección
   de tiro/pérdidas (%USO 3PTS/2PTS/TL con su PPT, %TOV con su PP).
3. **Splits L/V y ciclo reciente** — últimos 4 partidos separados en
   ganados y perdidos, con puntos de fuga, valores de identidad y línea de
   tiro.
4. **Plan defensivo · marca asignada** — panel del plan COLECTIVO más la
   tabla de marcas conectadas entre sí (ver punto 9 ter). Perfil defensor,
   consigna y restricción sugeridas, **editables**: el plan lo firma el DT.
5. **Resumen de criterio estratégico** — va inmediatamente debajo de la
   tabla de marcas, porque sintetiza justamente esa composición de marcas.
6. **Jugadores clave del rival** — tabla con mapa de calor del top 3 por
   métrica y filas de cierre (promedio del plantel y de la liga).
7. **Claves estratégicas y anticipación** — las 8 reglas dinámicas.
8. **Ficha de análisis por jugador** — rol funcional, fortalezas, puntos de
   fuga y plan de acción, uno por rival.

Los escudos se pintan al lado de cada nombre de equipo (`scoutNombreConLogo`)
en el encabezado, la matriz, los rankings, el ciclo y la tabla de jugadores.

### Criterio contextual: bandas z contra la liga

Ninguna decisión táctica individual sale solo de un umbral absoluto. Primero
se mide cuánto se desvía el jugador de la media de jugadores calificados de
ESTA liga (`bandaLiga`, cinco bandas en ±1,2σ y ±0,5σ):

| Banda | z | Lectura |
|---|---|---|
| `elite` | ≥ +1,2σ | Muy por encima de la liga |
| `superior` | +0,5σ a +1,2σ | Por encima |
| `estandar` | −0,5σ a +0,5σ | En el promedio |
| `limitado` | −1,2σ a −0,5σ | Por debajo |
| `fuga` | ≤ −1,2σ | Punto de fuga claro |

Se usa media/desvío y **no percentil** porque las reglas están expresadas en
sigmas y porque el percentil comprime los extremos: entre el 1° y el 3° de
la liga puede haber medio punto de PPT3 y los tres caen en "percentil 95".
En métricas invertidas (%TOV) el signo se da vuelta, para que `elite`
signifique siempre lo mismo: mejor que la liga.

### El error táctico más caro: flotarle a un tirador eficiente

Tres reglas de tiro externo, en cascada y en este orden:

1. **`tirador-eficiente-bajo-volumen`** → `STAY HOME / NEGACIÓN DE CATCH &
   SHOOT`, con `PROHIBIDO FLOTAR` como restricción. Se activa con volumen
   mínimo (≥ 1 triple por partido) y renta por encima del piso duro
   (PPT3 ≥ 1,05 o T3% ≥ 35%) **o** por encima de su liga. Es el
   especialista que anota poco **por volumen, no por eficiencia**: con el
   criterio viejo, que miraba puntos, quedaba en el montón y se le soltaba.
   Va arriba de todo lo interno y de todo lo de flotación a propósito.
2. **`tirador-sistematico-frio`** → `CLOSE-OUT CORTO / CONTESTAR SIN
   SALTAR`. Mucho volumen (≥ 2,5 triples por partido) con renta baja: hay
   que puntearle la mano igual, pero sin desarmar la estructura por él.
3. **`tirador-ineficiente`** (flotación) → tiene **tres** condiciones
   acumuladas: renta baja en absoluto, por debajo de la liga en su
   contexto, y que su tiro **no sea la vía principal** del ataque rival
   (< 25% de los triples del equipo). Si falla cualquiera, ya cayó en una
   de las dos reglas anteriores.

Hay un test que recorre todo el plantel y verifica que **a nadie con tiro
externo rentable se le sugiera flotar o ayudar desde él**. Con datos reales
de Atenas: Schroeder (2,4 T3I, PPT3 1,04) pasó a STAY HOME y Qüin (5,4 T3I,
PPT3 0,78) a contestar sin saltar — antes los dos recibían "flotar".

**`tiroExternoFrio` es CONJUNCIÓN, no disyunción.** Piso absoluto **y**
contexto de liga. Durante mucho tiempo el comentario del código declaraba
esta asimetría —basta una señal para tratarlo como amenaza, hacen falta las
dos para tratarlo como regalable— y el código aplicaba un OR de cuatro
condiciones. Como el piso de 0,88 PPT3 cae en el percentil 57 de La Plata,
`tirador-sistematico-frio` se llevaba el **34% de las fichas**; contrastado
contra Liga Argentina, ese mismo piso cae en el p35, o sea que la etiqueta
significaba cosas distintas según la categoría.

El contexto es **"no destaca en su liga"** (`!porEncima`) y no *"está en el
fondo"* (`porDebajo`): con la versión dura la regla se apagaba al 2%, que es
el mismo defecto dado vuelta. Hoy: 20% en La Plata, 4% en Liga Argentina.

**Hay una cuarta lectura del tiro externo**: `tiroExternoOcasionalFrio`, el
que lanza entre 1 y 2,5 triples por partido sin renta. No alcanzaba ninguna
de las tres reglas de marca (una exige rentabilidad, otra ≥ 2,5 intentos y
la tercera `PT3% ≥ 0,40`), así que **17 fichas de La Plata y 18 de Liga
Argentina tenían su tiro sin mencionar en todo el informe**. No lleva marca
propia —su amenaza principal casi siempre es otra— sino un bullet de fuga y
la clave 📐 de concesión perimetral.

### El orden de la cascada va por COSTO de la amenaza

`tirador-sistematico-frio` es por definición una amenaza **barata** (tira
mucho y mal) y estaba en el puesto 4, arriba de `interior-dominante`,
`slasher` y `generador-riesgoso`. Medido: **9 slashers de La Plata** recibían
"CLOSE-OUT CORTO" cuando su daño real era la penetración — uno con 1,65 de
PPT2 contra 0,51 de PPT3. Bajó al 7. Hay tests que fijan el orden relativo.

### El resumen de criterio estratégico: seis tramos alrededor de jugadores

`resumenEjecutivo()` sigue un esquema fijo, y todos los tramos salvo el
primero nombran jugadores concretos con el número que los justifica:

1. **Ritmo y balance defensivo** — el PACE del rival y su consecuencia.
2. **Eje de ataque y creación** — quién concentra los plays, con % del
   equipo, puntos, PPP y su rol funcional; más la segunda vía.
3. **Stay home** — los de tiro externo rentable, con T3% y PPT3. Sobre
   ellos no se ayuda "aunque se rompa la pintura".
4. **Invitación selectiva** — los de volumen sin renta, encuadrados como
   ganancia y no como concesión.
5. **Carga del cristal** — box-out asignado, con el múltiplo de liga en RO%
   pegado a cada nombre.
6. **Criterio global + momento reciente**, en un solo cierre.

(Hay un tramo extra entre el 5 y el 6 cuando existe un conductor que pierde
mucho: es la vía más barata de sacarlos del partido y callarla sería una
omisión.)

**La prioridad la marcan MIN y PLAYS.** `priorizar()` ordena por la banda
de minutos del motor centralizado (Clave e Importante primero) sin
descartar al resto: un tirador caro de 12 minutos se nombra igual, pero
después. Contra Atenas real da ~1550 caracteres.

Se arma desde `jugadoresClave()`, o sea desde las mismas filas que pinta la
tabla de arriba: no puede contradecir al cuadro que tiene al lado.

`enumerar()` arma las listas en castellano ("A, B y C"). Con `join(' y ')`
salía "A y B y C", que se lee a los tropezones en un informe que el DT lee
en voz alta.

**Los nombres van en negrita**, y el marcador es `**...**` y NO `<b>`:
`neg()` en el motor emite el marcador y `scoutNegritas()` en la UI **escapa
primero y convierte después**. Al revés, un nombre con `<` en la planilla
saldría del texto y entraría al DOM como markup — el motor es puro y su
salida se escapa siempre. Hay un test que verifica que el motor NO devuelva
HTML y que ningún nombre quede fuera del marcador.

### PROHIBIDO hablar de titularidad

**La planilla no trae el quinteto inicial.** No hay columna de titulares, y
25 minutos de promedio los puede hacer perfectamente un sexto hombre. Por
eso ninguna etiqueta, consigna, ficha ni resumen puede decir "titular",
"suplente" o "quinteto inicial", ni en la UI ni en los comentarios del
código.

La jerarquización sale **solo** de las etiquetas del motor centralizado
(Jugador Clave / Importante / de Rotación / Pocos Minutos, y la jerarquía
del ADN) y de MIN y PLAYS.

Por esto la jerarquía `🧱 Pieza de Quinteto Titular` pasó a llamarse
**`🧱 Pieza de Rotación Alta`**: el umbral (MIN ≥ 23) mide carga de
minutos, que es lo que el dato sostiene, no el momento en que entra a la
cancha. Hay tests que recorren TODAS las etiquetas del sistema (jerarquías,
bandas de minutos, perfiles técnicos, roles funcionales, perfiles de
defensor, consignas, fortalezas, fugas, claves y el resumen) y fallan si
alguna vuelve a mencionar titularidad.

### Consigna por volumen sin eficiencia

`volumen-sin-eficiencia` → `PERMITIR EL TIRO EXTERNO · CERRAR LA PINTURA`.
Se activa con concentración alta de plays (≥ 20% del equipo) Y eFG% por
debajo de su liga (banda `limitado`/`fuga`), Y sin tiro externo rentable.
Va después de las tres reglas de tiro externo justamente para no pisar al
especialista eficiente de bajo volumen.

### Exportación a PDF por cards

Botón *🖨 Exportar PDF* → modal con un checkbox por card. Al imprimir,
`scoutImprimir()` marca `body.modo-scout-print`, aplica `.no-imprimir` a las
cards destildadas, llama a `window.print()` y limpia la clase en
`afterprint`. Sin esa clase un Ctrl+P normal no cambia de comportamiento:
en la app conviven dos exportaciones (esta y la del informe de equipo) y no
pueden pisarse.

**El paginado, los colores y la hoja apaisada de la tabla de marcas están
en el punto 7.1–7.3.** Lo que importa acá: las cards NO van una por hoja —
se agrupan en los pares que el cuerpo técnico lee juntos— y el bloque de
marcas son **dos `<section>` con el mismo `data-bloque`**, el panel
colectivo y la tabla, en hojas distintas. Comparten `data-bloque` a
propósito: son una sola unidad de exportación, con un solo checkbox.

Por eso `scoutCard()` usa **`querySelectorAll` y no `querySelector`**: con el
singular, destildar "Plan individual" dejaba la tabla en el PDF igual.

Los `input[type=text]` de la tabla de marcas **sí** se imprimen (la regla
general de `@media print` esconde todo input, pero acá el valor cargado por
el DT es el contenido del informe).

### El plan es COLECTIVO, no una lista de fichas sueltas

`generarPlanDefensivoColectivo(filas, nuestroPlantel)` corre en una **segunda
pasada**, después de calcular las once fichas: recién con el mapa completo se
puede saber quién es foco, quién intocable y quién fuente de ayuda.

El problema que resuelve: una defensa no es la suma de once marcas
individuales. Si a cuatro rivales les ponés "doblar", te quedaste sin nadie
para doblar. Antes cada celda decía qué hacerle a un jugador y **ninguna decía
de dónde sale la ayuda para hacerlo**.

#### Los cuatro grupos y sus vetos

| Grupo | Quién entra | Qué dice su celda |
|---|---|---|
| 🎯 **Focos** | marca `tirador-elite`/`interior-dominante`/`slasher`, o concentración ≥ 0,15, o jerarquía franquicia | "la ayuda salta desde X" |
| 🚫 **Intocables** | `tiroExternoRentable` | "su defensor no participa de las ayudas: se queda" |
| ↩ **Fuentes** | `tiroExternoFrio` u `ocasionalFrio`, o marca `tirador-ineficiente`/`volumen-sin-eficiencia` | "es el lado desde donde mandar la ayuda y doblar a Y" |
| 🏰 **Cristal** | `reboteRel ≥ 1,30` | "su defensor NO rota: lo bloquea" |

**El orden de cálculo es la lógica del plan**, y los vetos van en este orden:

1. **Intocables** primero — soltar un tiro rentable es el error más caro del
   informe, así que la pertenencia a este grupo veta todo lo demás.
2. **Focos** — el que exige doblaje no puede estar ayudando en otro lado.
3. **Cristal** antes que fuentes — no se le puede pedir al mismo defensor que
   sea el primero en rotar y que no abandone el box-out. Gana el rebote: la
   segunda chance anula todo el trabajo defensivo previo.
4. **Fuentes** — lo que queda.

Hay tests que verifican los tres cruces vacíos. Con datos reales de las dos
ligas (29 planteles): **cero solapamientos**.

**Un jugador puede ser foco Y intocable** (el tirador de élite): se lo dobla y
desde él no se sale nunca. La cascada de `conexionColectiva` da prioridad a
foco, pero agrega explícitamente la segunda mitad — sin eso se comía justo la
advertencia más cara de olvidar. Lo encontró un test.

#### Los cinco escenarios

| Escenario | Se activa cuando | La Plata | Liga Argentina |
|---|---|---|---|
| `franquicia-solitaria` | un solo foco y hay fuente | 1 | 0 |
| `spacing-alto` | ≥ 3 tiradores rentables | 2 | **8** |
| `interior-y-frios` | foco interior + ≥ 2 fuentes | 2 | 3 |
| `sin-lado-barato` | hay foco y no hay fuente | 0 | 2 |
| `distribuido` | *fallback* | 7 | 4 |

**`spacing-alto` es la excepción de la regla de coherencia.** Con tres o más
tiradores rentables el plan **renuncia a ayudar a propósito** y pasa a 1x1, así
que la ausencia de fuente no es un agujero: es la conclusión. Pedirle una
fuente sería contradecir su propia consigna. Ocho de los diecisiete planteles
de Liga Argentina caen ahí — es lo que uno espera de una liga de mejor nivel.

#### El contrato de editabilidad no se toca

La conexión colectiva se agrega **solo al `detalle`**, nunca al `titulo`. El
título en MAYÚSCULAS sigue siendo la firma del DT y lo único editable. Hay un
test que falla si un texto de conexión aparece en un título, y otro que exige
que los títulos sigan midiendo ≤ 60 caracteres: son para cantar en el
vestuario, no para leer.

#### Balanceo de la carga defensiva

`elegirDefensorBalanceado()` reparte los perfiles sobre el plantel propio: si
uno ya se sugirió **2 veces** en la misma tabla, prueba el siguiente candidato.
El motivo es de cancha: sugerir cuatro "Sniper Stopper" le pide al DT cuatro
defensores del mismo tipo que probablemente no tiene. Cuando no hay
alternativa se repite igual — antes que dejar la celda vacía.

### Roles funcionales, no posiciones

`ROLES_FUNCIONALES` es una cascada excluyente sin base/alero/pivote. **Diez
roles**, en este orden (el orden ES la regla: gana el primero que calza):

| # | Rol | Condición | Casos reales |
|---|---|---|---|
| 1 | Generador Primario | AST-PP ≥ 1,40 · AST ≥ 2,5 · MIN ≥ 20 | 8 |
| 2 | Finalizador Corto / Short Roll | interior · PPT2 ≥ 1,10 | 15 |
| 3 | Ancla Defensiva | interior · RD rel ≥ 1,15 **y RD rel > RO rel** | 2 |
| 4 | Rebotador de Impacto / Rim Runner | interior · RO rel ≥ 1,30 | 6 |
| 5 | Juego de Espaldas / Poste Bajo | interior *(fallback interior)* | 16 |
| 6 | Spacing / Tirador de Descarga | perimetral · PT3% ≥ 0,40 | 57 |
| 7 | Slasher / Penetrador | perimetral · PPT2 ≥ 1,00 | 40 |
| 8 | Manejador Secundario | AST-PP ≥ 1,00 · MIN ≥ 20 | 5 |
| 9 | Perimetral de Media Distancia | perimetral | 34 |
| 10 | Rol Complementario | *fallback* | 27 |

**Los tres roles interiores estaban muertos** (`finalizador-corto` y
`ancla-defensiva` daban CERO sobre 210) porque `rim-runner` iba primero con
un piso que el discriminante de origen ya garantizaba. Se corrigió el orden
—del rol más específico al más genérico— y cada uno pide ahora su
**especialidad dominante**. El comparativo `RD rel > RO rel` del ancla es lo
que impide que ancla y rim runner sean el mismo test con otro nombre: en esta
liga el que rebotea en defensa casi siempre rebotea también en ataque.

`poste-bajo` es un **fallback INTERIOR** nuevo. Sin él, un interior sin
dimensión dominante caía en "Rol Complementario" junto a los perimetrales sin
rasgo, y el informe perdía el único dato que sí tenía de él: que juega de
espaldas al aro.

**El bug que motivó el refactor: clasificar por PPT2 solo.** Un slasher
eficiente y un poste bajo pueden tener el mismo PPT2, y el motor viejo le
asignaba al slasher una marca de poste bajo (3/4 por delante). Ahora el
origen se decide con un cruce de cuatro fuentes:

1. los **arquetipos ya calculados en la pestaña JUGADORES** (fuente
   primaria: no se recalcula el perfil con otro criterio, dos motores que
   se contradigan entre secciones es peor que ninguno),
2. la **mezcla de lanzamiento** `T3I / (T3I + T2I)` — sobre INTENTOS, no
   sobre conversiones: de dónde tira no depende de si le entra,
3. la **generación** (AST y AST-PP),
4. el **impacto en los cristales** (RO/RO% y RD/RD%).

El origen se resuelve en **tres tramos de mezcla de triple, no dos**:

```
mezcla < 0,12         → interior sin discusión (casi no sale del área)
mezcla ≥ 0,30         → perimetral sin discusión (volumen real de triple)
[0,12 ; 0,30)         → DESEMPATE por cristal: RT rel ≥ 1,10 → interior
```

Antes ese tramo intermedio no era ni una cosa ni la otra y dejaba al **35% de
la liga sin origen**; como cuatro de los diez roles exigen uno de los dos
flags, esos jugadores solo podían caer en el fallback. El ala que tira poco
de afuera y no rebotea es un perfil real —no un residuo— y ahora se resuelve
hacia el lado que su juego indica. Con el desempate, los sin origen bajaron
de 74 a **27, que son exactamente los que no registran un solo tiro de
campo**: ahí no se infiere nada, se deja vacío a propósito.

Se usa el rebote **TOTAL** y no el ofensivo: en la franja intermedia lo que
define si alguien juega adentro es cuánto vidrio toma, no de qué lado del aro
lo toma.

Si la ficha de JUGADORES ya lo marcó como *Amenaza Perimetral Real*, eso pisa
el cálculo. Verificado con datos reales: Ferraro Dieguez pasó de "referencia
interna" a Slasher / Penetrador.

**Ojo con las fixtures de test**: si un jugador tiene `PT3%` de 5% pero
T3I = 3 de 9 tiros de campo, el motor lo saca de los roles internos — y
tiene razón, esos dos datos describen a un jugador que no existe. La
incoherencia hay que arreglarla en el dato, no en el umbral.

**La planilla no tiene columna de talla ni de posición cargada a mano**, así
que "ficha del jugador" son los arquetipos calculados. Si algún día entra
una columna de altura, el cruce se enriquece en `perfilJugador()` y en
ningún otro lado.

### Matriz de perfiles de "Defensor nuestro"

`CATALOGO_DEFENSOR` son **11 familias con 33 perfiles** específicos, de los
que el motor puede sugerir **25**. Sugiere un PERFIL táctico, no un nombre
propio: quién lo cubre depende de quién esté
en cancha y de las faltas de cada uno. El campo es editable para poner el
nombre al armar la rotación.

| Familia | Perfiles |
|---|---|
| 🛡 Especialista 1x1 | On-Ball Stopper · Shadow · Lockdown Defender |
| ⚡ Presión Inicial | POA Defender · P&R Disruptor · Ball-Screen Pest |
| 🏃 Perimetral Atlético | Wing Chaser · Transition Defender · Drive Containment |
| 💪 Perimetral Físico | Perimeter Enforcer · Defensive Goon · Rebounding Guard |
| 📏 Perimetral Largo | Length Defender · Volume Containment · Closeout Specialist |
| 🎯 Especialista Perimetral | Sniper Stopper · Denier · Screen Navigator |
| 🏢 Especialista Interior | Drop Protector · Classic Rim Protector · Paint Pillar |
| 🏰 Referente de Zona | Primary Rim Protector · Glass Cleaner · Paint Dominator |
| 🧱 Híbrido Físico | Switchable Forward · Low-Post Wall · Interior Impact |
| 🦅 Perimetral Atlético · Ayudas | Free Safety · Vertical Rotator · Passing Lane Interceptor |
| 📐 Contención Táctica | Target Defender · Read Specialist · Pace Controller |

**Hay dos familias de perimetral atlético** (🏃 contención en la línea de
pelota y 🦅 ayudas desde el lado débil) y no se fusionaron: son tareas
distintas y mezclarlas volvería a agrupar marcas que piden defensores
diferentes.

### A quién de los nuestros le toca

La columna *Defensor nuestro* trae, debajo del perfil táctico, hasta **tres
jugadores** para esa tarea: Rank 1 destacado y dos de recambio para cuando el
primero carga faltas.

#### REGLA DE ORO: el defensor sale SIEMPRE del otro equipo del cruce

`plantelDefensor(idx, claveAtacante, claveNuestro)` es el único lugar que
resuelve de qué plantel salen los "nuestros", y la respuesta es **el otro lado
del cruce**. Nunca el equipo que ataca. En Reconquista vs Atenas: para
neutralizar a Reconquista los defensores son de Atenas, y al revés.

**El bug que cierra.** Acá se resolvía con `SGADD.esEquipoPropio()`, o sea *"el
equipo del club configurado en el JSON"*. Eso funciona mientras el equipo
scouteado sea el ajeno, pero el informe deja **elegir el rival a mano**
(`o.claveRival`) justamente para preparar un partido ajeno o para mirar el
cruce desde el otro lado. Cuando el DT scouteaba a Reconquista, el rival era
Reconquista **y el "plantel propio" también**: la tabla salía con MITIDIERI
marcando a MITIDIERI, su propio compañero.

`informePrePartido()` ya calculaba bien `claveNuestro` — lo que faltaba era
**pasárselo**. Ahora viaja explícito a `jugadoresClave()`, a
`clavesEstrategicas()` y a `resumenEjecutivo()`, que si recalculara con otro
plantel contradiría al cuadro que tiene al lado.

Dos guardas más, porque el respaldo también podía fallar:

- **El cruce degenerado no se sirve.** Con el mismo equipo de los dos lados,
  `plantelDefensor` devuelve vacío. Antes que sugerir compañeros, nada.
- **El respaldo por `esEquipoPropio()` excluye al equipo atacante**, así que ni
  siquiera el fallback puede devolver a un compañero.

Hay tests que corren el cruce en los dos sentidos y exigen que ningún candidato
comparta equipo con el atacante.

#### El algoritmo tiene DOS PASOS, y el orden es la regla

```
PASO 1 · match posicional  →  ¿PUEDE ir con él?   (filtro duro)
PASO 2 · métricas defensivas →  ¿qué tan BIEN lo hace?  (ranking)
```

**Paso 1 · biotipo** (`compatiblePosicional`). Contra un atacante `esInterior`
pasan interiores e híbridos; contra un `esPerimetral`, perimetrales e híbridos;
sin origen resuelto en el atacante, no se filtra nada. El *híbrido* —el que no
tiene ninguno de los dos flags— pasa **en los dos sentidos** a propósito: no
tener origen resuelto es falta de dato, no un dato en contra.

El motivo de que vaya primero es de cancha: por muchos recuperos que tenga, un
perimetral no defiende de espaldas al poste bajo del rival. Hay un test que
fabrica exactamente ese escenario —un ala con tapas y rebote enormes contra un
interior flojo en todo— y verifica que **sin el paso 1 gana el ala y con el
paso 1 gana el interior**. Sin ese test el orden se puede invertir sin que se
note.

**Paso 2 · ranking**, con los pesos que declara la familia en
`CATALOGO_DEFENSOR.defiende`: **tapas (`TC`)**, recuperos (`PR`), faltas
(`FC`), rebote defensivo y ofensivo relativos y minutos. Las métricas se
normalizan **dentro del propio plantel**, no contra la liga: la pregunta es
*"de los míos, ¿quién?"*, y esa respuesta no cambia porque la liga entera
defienda mejor o peor.

**Degradación.** Si el paso 1 deja la lista vacía —un plantel entero de
perimetrales contra un poste rival es un escenario real en categorías chicas—
se vuelve al plantel sin filtrar, se marca `compatible: false` y **la UI lo
dice**: *"Sin nadie del biotipo… los nombres salen por métricas, con desventaja
física"*. La propiedad que no se negocia es que la sugerencia nunca quede
vacía: una celda en blanco no le dice al DT que el cruce es problemático, le
dice que el panel se rompió.

Medido con Reconquista vs Atenas real: **cero choques de biotipo** en las once
filas. BORRAJO (interior) pasó a recibir solo a VELAZQUEZ —el único interior
del plantel— donde antes se le proponían dos perimetrales detrás.

**Ojo con el filtro y el peso**: son cosas distintas y por eso conviven. El
filtro mira al **atacante** (¿puede ir con él?); el peso `interior`/`perimetral`
de `defiende` mira la **tarea** (dentro de los compatibles, cuál calza mejor).

**`TC` — Tapas cometidas — es la única métrica del box score que mide un acto
defensivo directo**, y por eso pesa más que el rebote en los dos perfiles de
protección de aro: en 🏰 Referente de Zona `tc` 1,5 contra `rd` 1,2, y en 🏢
Especialista Interior `tc` 1,3 contra `rd` 0,9. El rebote defensivo es un
proxy de tamaño; una tapa es la acción en sí. Las familias de contención
perimetral **no llevan `tc`**: al que tiene que contener la penetración sin
saltar, tapar no le suma — le puede restar.

El resto de los pesos sigue la misma lógica de cancha: al ⚡ de Presión
Inicial y al 🦅 de Ayudas se los busca por recuperos; al 💪 Perimetral Físico
las faltas le **suman** (es contacto) y al 🏃 Perimetral Atlético le **restan**
(tiene que contener sin fallar). Hay tests que fijan esas relaciones.

**LA ADVERTENCIA QUE NO SE SACA: el box score no mide defensa completa.** Con
`TC`, `PR`, `FC` y el rebote se cubre lo que deja rastro — tapar, robar,
chocar, cerrar el cristal — pero **el trabajo sin pelota no aparece en ninguna
columna**: cerrar líneas de pase, navegar bloqueos, rotar a tiempo, contener
sin fallar. Un defensor que hace todo eso bien puede tener la planilla en
blanco. Es una sugerencia por aproximación y la UI lo dice con todas las
letras: el nombre final lo pone el cuerpo técnico.

`cargaPropia` reparte igual que `elegirDefensorBalanceado`: cada marca ya
asignada le resta 0,35 al puntaje. Sin eso el mismo defensor encabezaba las
once filas y la sugerencia dejaba de decir nada.

### El perfil se desempaqueta con métricas secundarias

Cada marca declara una **lista ordenada de candidatos** (`defensores`), no un
perfil fijo. Gana el primero cuyo `cuando(perfil)` da verdadero y el último
no lleva condición: es el default, así que **la sugerencia automática nunca
puede quedar vacía** — esa es la propiedad que había que conservar al abrir
el catálogo.

Antes cada marca tenía un perfil fijo, así que solo **11 de 33** eran
alcanzables y los otros 22 quedaban de adorno sin que la UI lo dijera. Los
discriminantes son métricas que ya estaban calculadas y que ninguna regla
usaba: `PR` (elegir entre `Denier` e `Interceptor` es una pregunta sobre
manos activas), `RO%` y `PPT2` (entre `Paint Pillar` y `Drop Protector`, una
sobre dónde defiende el aro) y `AST-PP`.

Con datos reales se asignaron **19 perfiles distintos en La Plata** y **22 en
Liga Argentina**, sobre 9 y 10 familias.

| Marca | Defensor asignado |
|---|---|
| `tirador-elite` | 🎯 Sniper Stopper |
| `tirador-eficiente-bajo-volumen` | 🎯 Denier |
| `tirador-sistematico-frio` | 📏 Closeout Specialist |
| `interior-dominante` | 🏢 Paint Pillar |
| `slasher` | 🏃 Drive Containment |
| `generador-riesgoso` | ⚡ Ball-Screen Pest |
| `castigable-en-la-linea` | 🧱 Interior Impact Defender |
| `tirador-ineficiente` | 📐 Target Defender |
| `volumen-sin-eficiencia` | 📏 Volume Containment |
| `rebotador` | 🏰 Glass Cleaner |
| `contencion` (fallback) | 🧱 Switchable Forward |

### Cada celda: directiva + justificación numérica

`consigna` y `restriccion` son **objetos `{titulo, detalle}`**, no strings:

- `titulo` → la directiva corta en MAYÚSCULAS (`TOP LOCK / OVER.`,
  `3/4 POR DELANTE / FRONT.`, `ACOSO AL DRIBLE / TRAP.`). Es lo único
  **editable**: lo que el DT canta en el vestuario.
- `detalle` → la justificación con el NÚMERO que la disparó, en solo
  lectura. Si el número cambia, cambia con la planilla y no a mano.

Ambos se generan como funciones del perfil, así que el número sale del
jugador y no de un texto fijo. Hay tests que exigen que **los dos** títulos
estén en mayúsculas y que **los dos** detalles citen al menos un dígito y
nombren la métrica.

`consignaTexto`/`restriccionTexto` son la concatenación plana, para el input
editable y el export a PDF; el que manda es el objeto.

Las consignas son todas de **campo**: ice en P&R, drop coverage, show corto,
negación de catch & shoot, flotación/under, contención de mano dominante,
cierre de esquinas, ayuda de lado débil.

**Mandar a la línea dejó de ser la respuesta para todo.** Es un solo perfil
de la cascada y con umbral duro: `T1% < 40%` **y** volumen interno
(`PT2% ≥ 45%`). El criterio: a alguien que convierte 60% de libres le estás
regalando 1,20 puntos por posesión, más de lo que vale una posesión promedio
en estas ligas. Con los datos reales de Atenas hoy **no califica nadie**, que
es exactamente el punto.

### Las tres referencias que NO son la misma

El bug más fácil de cometer acá es mezclar contra qué se compara cada cosa.
Quedaron separadas a propósito:

- **Puntos de fuga y valores de identidad** → contra el **propio promedio**
  de temporada del equipo. La pregunta es "¿jugó como él mismo?".
- **Línea de tiro** → contra la **mediana de la liga**. La pregunta es
  "¿tiró bien en términos absolutos?".
- **Mapa de calor top 3 de jugadores** → **dentro del plantel del rival**.
  La pregunta es "de estos ocho, ¿a quién le doy la marca?", no "¿es bueno
  para la liga?" (eso ya lo contesta la sección Jugadores).

Los primeros borradores usaban la misma referencia para todo y daban
lecturas que se contradecían entre bloques.

### Mapa de calor: qué se muestra y por qué se ordena distinto

El top 3 marca **jerarquía de amenaza**: 1° verde (amenaza principal), 2°
naranja (precaución), 3° amarillo (foco complementario). Fuera del top, sin
resalte.

`rankPor` en `COLS_JUGADOR` existe porque **la métrica que se muestra no
siempre es la que ordena**:

- **PTS / PLAY** muestra los puntos (número grande) con el PPP debajo, pero
  el top-3 sale por PTS: la pregunta del bloque es quién anota.
- **Las tres columnas de uso** muestran el % de plays del jugador y rankean
  por **intentos absolutos** (T3I / T2I / T1I). Un suplente que tiró 3
  triples en todo el torneo puede tener 60% de uso externo y no es un
  tirador: el resalte tiene que marcar volumen real dentro de la estructura
  del equipo, no una fracción sobre una muestra mínima. Hay un test que usa
  exactamente ese falso positivo.

En la fila de cierre, **Prom. jugadores/equipo** se colorea contra la liga:
verde si el plantel está mejor, rojo si está peor, neutro si empatan. Se
respeta la **dirección de la métrica** — en %TOV, perder menos es mejor, así
que un equipo que pierde más pelotas que la liga sale en rojo. Pintarlo de
verde por "supera el valor" contradiría al resto del sistema, donde el verde
siempre significa ventaja.

### Claves estratégicas: generación dinámica, no lista fija

`REGLAS_CLAVE` corre cada regla contra el plantel del rival y solo devuelve
las que los datos activan. Un informe contra un equipo de tiradores y otro
contra uno de pintura salen distintos sin tocar código. **Diez reglas**: ejes
de eficiencia, clausura de tiradores, invitación selectiva al triple,
disciplina de bonus, falta táctica rentable, presión a la conducción, control
del cristal, colapso de la pintura, **🧲 líneas de pase del rival** y **📐
concesión perimetral selectiva**.

Las dos últimas son de la segunda auditoría. `PR` era la única métrica
defensiva del rival que el informe ignoraba por completo —ocho reglas y
ninguna miraba sus manos— pese a existir el arquetipo *Especialista
Defensivo* en la ficha del jugador: un plantel que roba condiciona NUESTRO
manejo y eso se prepara antes del partido.

Hay pares **deliberadamente opuestos** que nunca pueden apuntar al mismo
jugador, y el test lo verifica: *clausura de tiradores* (T3 caro) vs
*invitación al triple* (T3 barato); *disciplina de bonus* (buen T1%, no lo
mandes a la línea) vs *falta táctica rentable* (mal T1%, mandalo). Si
alguna vez los dos marcan al mismo, hay un umbral mal puesto.

`PERFILES_MARCA`, en cambio, **sí es una cascada excluyente**: un jugador
puede disparar varias reglas de análisis, pero la marca asignada elige una
sola, la de la amenaza más cara (ordenadas de mayor a menor costo esperado).

### Cuándo un umbral absoluto es legítimo

Se contrastó el motor contra **dos ligas de nivel distinto** (Primera de La
Plata y Conferencia Norte de Liga Argentina: eFG% mediano 0,469 contra 0,530,
AST-PP 0,867 contra 1,259) midiendo en qué percentil cae cada umbral.

**Un umbral absoluto es legítimo cuando describe economía del básquet.** Esos
caen en el mismo percentil ±1 en las dos ligas: `pptTripleElite` 1,20 (p91 /
p90), `t1Regalable` 0,40 (p4 / p3), `volumenTripleSistematico` 2,5 (p32 /
p31), `usoDobleInterno` 0,45 (p61 / p60).

**Es ilegítimo cuando describe "por debajo del promedio" disfrazado de
constante.** Ahí la brecha se dispara y la etiqueta significa cosas distintas
según la categoría: `pptTriplePobre` 0,90 (p61 / **p35**), `t3Frio` 0,30
(p58 / **p35**), `pptTripleFrio` 0,88 (p57 / **p35**), `t1Pobre` 0,60 (p35 /
**p15**), `astPPGenerador` 1,40 (p79 / **p59**).

Regla práctica al agregar un umbral: si no podés justificarlo en puntos por
posesión, va contra la banda z.

### Fortalezas y fugas: contra la liga, no contra un número fijo

`fortalezasJugador()` y `fugasJugador()` leían umbrales absolutos, y eso
apagaba el bloque de fugas **justo donde más falta hace**: en Liga Argentina
casi nadie baja de `eFG% < 0,45` o de `T1% < 0,40`, así que el **46% de las
fichas** salía con *"Sin una fisura clara"* (contra 19% en La Plata). Ahora
los bullets de eFG%, %TOV, T1%, AST-PP y PPT2 preguntan contra la banda z:
17% y 18% respectivamente.

`PR`, `RTL%` y `FR` entraron como bullets nuevos. Eran métricas que el perfil
calculaba y que **ninguna regla del informe usaba**.

### Umbrales: relativos donde importa

Pérdidas y rebote se miden **x la mediana de la liga**, no en absoluto —
regla del punto 4. **Ojo con la referencia**: las pérdidas siguen usando
`liga.jugadorTipo`, pero los relativos de rebote pasaron a la **mediana de
los calificados** (ver punto 8), porque el TIPO los inflaba 1,7x. Los que
quedaron absolutos son los que son físicos del básquet y no dependen de la
liga: un 75% en libres es bueno en cualquier lado, y 1,20 pts por triple
intentado es caro en cualquier lado.

**`concentracionAlta` bajó de 0,20 a 0,15.** La concentración es
`PLAYS del jugador / Σ PLAYS del plantel COMPLETO`, y con planteles de 14 a
22 jugadores el techo es bajo: medido sobre las 96 fichas, mediana 0,092 ·
p90 0,157 · **máximo 0,228**, y en **10 de los 12 equipos el jugador más
usado no llegaba a 0,20**. O sea que la regla `volumen-sin-eficiencia` no
podía activarse jamás en la mayoría de los equipos — ese era su bloqueo real,
no el orden de la cascada (que igual se corrigió: subió al segundo lugar).
Con 0,15 (≈p88) marca al eje real del ataque: 15 de 96, uno o dos por
equipo.

### Lo que la planilla NO tiene

**No hay hoja de fixture.** Fecha del partido, torneo/instancia y próximo
rival programado son campos **manuales** en la UI. No se estiman: un
scouting con una fecha inventada es peor que uno sin fecha. Si alguna vez
entra una hoja de calendario, esos tres campos salen solos.

Tampoco se migró la parte **narrativa** de los PDFs de playoffs (lectura de
la serie, estado anímico, "sus manos tiemblan en momentos de presión"). Eso
es criterio del DT sobre partidos que vio, no un dato derivable — por eso la
tabla de marcas es editable en vez de solo lectura.

### Detalles de implementación que costaron

- **`referenciaLiga()` tiene respaldo.** La mediana sale de la fila
  `EQUIPO TIPO`; si esa fila no trae la columna (pasa con las opcionales,
  como `PACE`), se calcula sobre la distribución de los N equipos. El TIPO
  manda cuando existe: viene de la planilla y es lo que el club audita.
  Dejar la columna "Liga" vacía en pleno informe es peor que recalcularla.
- **La elección del rival a scoutear necesita tres ramas, no un ternario.**
  Con `esEquipoPropio(local) ? visitante : local`, un partido donde
  NOSOTROS somos el visitante terminaba scouteando a nuestro propio equipo.
  Sin equipo propio en el cruce (preparar un partido ajeno es un caso real)
  se toma el visitante, que es la convención del informe impreso. La UI
  además deja cambiarlo a mano.
- **Los campos de texto no repintan la sección.** `scoutMeta()` y
  `scoutMarca()` escriben en el estado y nada más: un repintado por tecla
  le saca el foco al input y hace imposible escribir un nombre completo.
- **El tab se engancha a la promesa de `cargar()`**, no solo al hook de
  `onCambio` de `sgadd-app.js`. Entrando a la sección antes de que baje la
  categoría, el hook era el único que repintaba y la vista quedaba clavada
  en "Cargando…".

### Preparado para exportar (todavía no implementado)

Cada bloque es un `<section class="scout-bloque" data-bloque="...">` dentro
de `#scoutInforme`, y las tablas anchas scrollean dentro de su contenedor
(verificado a 375px: el body no scrollea en horizontal). La exportación a
PDF/WhatsApp puede cortar por bloque sin reestructurar el DOM — pero
arrastra los mismos problemas abiertos del punto 7.

---

## 9 bis. Simulador 360°

**Estado: implementado.** Vive en `js/sgadd-4factores.js`: el motor puro
(`SGADD_4F`) más la sección Simulador (grilla de selección A vs B), mismo
patrón de estado/ruteo que Equipos y Jugadores. Ruta:
`#/<planilla>/<fase>/simulador/<local>/<visitante>`.

**No existe una sección "4 Factores" independiente en el nav.** Existió una
versión previa con una tabla legacy de solo lectura de `PROMEDIOS 4F`; se
sacó del router (`VALID_SECTIONS`) y del menú porque todo el análisis de 4
factores (pesos de liga, matriz eficiencia/volumen, duelos tácticos) ya vive
**dentro** de cada cruce del Simulador — tenerlo repetido en dos lugares era
redundante y quedaba desactualizado respecto al motor real.

Es una migración **auditada**, no trasladada tal cual, de
`simulador-4factores-legacy.js` (Apps Script, 1805 líneas, queda en el repo
como referencia de qué se corrigió). Se descartó toda la infraestructura de
Google Sheets (menús, `SpreadsheetApp`, hojas físicas `DB_PROCESADA` /
`PESO_FACTORES` / `HISTORIAL`, gráficos nativos): el motor lee directo de
`idx` (lo que ya arma `sgadd-core.js` desde `Base Datos E` + `4 FACTORES`),
sin reimplementar el pipeline de datos.

### Qué corrigió la auditoría (no es la misma matemática que el original)

1. **"Regresión lineal múltiple" en el nombre, Pearson simple en el código.**
   El original calculaba una correlación de Pearson **por factor por
   separado**, sin controlar por los otros — dos factores correlacionados
   entre sí inflaban su peso combinado. `regresionMultiple()` resuelve los
   4 coeficientes en un solo sistema de ecuaciones (OLS por Gauss-Jordan),
   cada uno neto del resto. Verificado con datos reales de Reconquista:
   regresión múltiple real sobre 132 partidos, R² 0,96.
2. **Signo hardcodeado por posición.** El original guardaba
   `Math.abs(pearson)` (tirando el signo) y en otra función reconstruía la
   dirección con un array `[j===1||j===4||...] ? -1 : 1` — si alguien
   reordenaba el array de factores, el signo quedaba mal sin romper nada
   visiblemente. `netFactor()` arma el diferencial ya con el signo correcto
   desde la propia definición del factor (`FACTORES_NET[].invertida`), una
   sola vez, reusada tanto para calcular los pesos de liga como para el
   simulador: no hay un lugar separado que se pueda desincronizar.
3. **Bonus de localía multiplicaba todo el score del local**
   (`score * bonusLocalia`): un equipo con score más alto recibía un bonus
   de localía más grande en puntos absolutos, lo cual no tiene sentido —
   la ventaja de jugar en casa no escala con lo bueno que sea el equipo.
   Corregido a un bonus **aditivo** fijo en puntos (`BONUS_LOCALIA_PUNTOS`),
   modulado apenas por la ventaja de localía real de la liga activa.
4. **Confianza con clamp arbitrario**: `50 + margen×2.8`, forzado a mano
   entre 51 y 94.8. Ni la pendiente ni los topes salían de ningún cálculo.
   Reemplazado por una logística (`confianzaLogistica`), que acota
   naturalmente en (0,1) sin clamps mágicos.
5. **Peso temporal por recencia con off-by-one**: `0.8 + 0.4×(index/total)`
   nunca llegaba exactamente a 1.2 en el último partido. Corregido a
   `index/(total-1)`.
6. Denominadores sin guarda explícita en el promedio ponderado — ahora
   `promedioPonderado()` devuelve `null`, nunca `NaN`, si el peso
   acumulado da 0.

Lo que **sí** estaba bien pensado y se conservó: la muestra chica en una
condición (< 3 partidos de local o de visitante) cae a la historia completa
del equipo (`perfilEquipoSimulacion`, mismo criterio que
`MIN_PARTIDOS_JUGADOR` en el resto del proyecto); el modelo de score base
como `PLAYS × PPP` (identidad real de básquet, no un ajuste empírico).

**Nuevo, no existía en el original**: la matriz de compensación Eficiencia
vs. Volumen (`matrizVolumenEficiencia`) — clasifica a un equipo en un
cuadrante (élite / vive del volumen / selectivo y letal / en construcción)
por percentil de `PLAYS` y `eFG%` contra la liga, regla del proyecto de
nunca comparar en valores absolutos.

### Upgrade a 360°: en básquet no hay empates

Vuelta posterior a la migración inicial. El modelo original (arriba) podía
proyectar un resultado empatado o con un margen tan chico que redondeaba a
un "80-80" en pantalla — imposible en básquet real. Se corrigió de raíz,
no se parchea después:

- **`resolverEmpate(scoreL, scoreV, señal, margenMinimo)`** — si el margen
  crudo es menor a 0,5 puntos o los dos scores redondean al mismo entero,
  separa ambos scores alrededor de su propio promedio hasta una distancia
  de `MARGEN_MINIMO_EMPATE` (1.5 pts). La `señal` de desempate **no es un
  número inventado para la ocasión**: es la misma que ya calculó el modelo
  (`diffNetRating + bonusLocalia`), así que el desempate favorece al mismo
  equipo que ya venía favorecido por el resto de las variables.
  Matemáticamente, con `margenMinimo ≥ 1.0` el redondeo **nunca** puede
  volver a empatar: dos números a más de 1.0 de distancia no pueden caer en
  el mismo intervalo de redondeo `[n-0.5, n+0.5)`. El resultado expone
  `empateResuelto: boolean` para que la UI pueda avisar cuando pasó.
- **Pace real, no un promedio simétrico.** `paceEsperado` es el promedio del
  `PACE` de temporada de los dos equipos (posesiones esperadas del cruce);
  el score base ya no es "mismo PPP para los dos", es **cruzado**:
  `pppEsperadoLocal = (ataque de LOCAL de-condición + defensa de VISITANTE
  de-condición) / 2` y viceversa para el visitante. `perfilEquipoSimulacion`
  trae `PPP OF/DEF` y `RTNG OFF/DEF` **condición-específicos** (de local
  para el local, de visitante para el visitante — no el promedio de
  temporada completa), leídos de `4 FACTORES` por partido, con el mismo
  fallback a toda la temporada si hay menos de `MIN_PARTIDOS_CONDICION` (3)
  partidos en esa condición.
- **Ventana de refuerzo por racha reciente.** Además del ramp lineal
  0.8→1.2 por recencia (ya existía), si un equipo tiene más de
  `VENTANA_RECIENTE` (5) partidos, los últimos 5 llevan un multiplicador
  extra `REFUERZO_RECIENTE` (×1.5) sobre su peso — una racha de los últimos
  partidos pesa más que la misma diferencia al principio de la temporada.
- **Net Rating diferencial como prior de fortaleza general.**
  `diffNetRating = netRatingLocal - netRatingVisitante` (de `PROMEDIOS 4F`,
  temporada completa) se atenúa con `ESCALA_NET_RATING` (0.15) y se suma
  ±mitad al score de cada lado — un prior de "quién es mejor en general",
  no el driver principal (eso lo siguen siendo los duelos por factor y el
  pace×eficiencia cruzado).

### UI: ficha 360°

`simuladorResultado()` en `sgadd-4factores.js` (sección UI, plain globals,
no exportada — se verifica a mano en el navegador, igual que el resto de
las UI de Equipos/Jugadores) arma, en orden:

1. **🏆 Cabecera** — ganador, confianza y margen. `r.confianza` (la que
   devuelve `SGADD_4F.simularEnfrentamiento`) es **siempre** la probabilidad
   de que gane el LOCAL (monótona en `margen = scoreLocal - scoreVisitante`,
   nunca "la probabilidad del ganador"). La UI arma
   `confianzaGanador = margen >= 0 ? r.confianza : 1 - r.confianza` antes de
   mostrarla junto al nombre del ganador — mezclar los dos (mostrar
   `r.confianza` crudo al lado de "gana el visitante") es el bug que ya se
   pisó una vez en esta misma vuelta, verificado en el navegador con
   Reconquista vs. Atenas real: el cartel decía "gana Atenas, confianza
   37%" con el propio modelo diciendo lo contrario.
2. **📊 Comparativa 360°** — gráfico de barras HTML/CSS (no Chart.js:
   probabilidad/puntos/impacto son tres unidades distintas en la misma
   ficha, forzarlas a un solo canvas complica más de lo que aporta) vía
   `filaComparativa()`, con la misma corrección de signo que la cabecera.
3. **🏠 Localía y ritmo** — bonus aditivo, pace esperado del cruce y PPP
   esperado cruzado de cada lado.
4. **⚡ Net Rating** — fuerza de temporada de cada equipo y el ajuste en
   puntos aplicado.
5. **📊 Desglose de influencia de la liga** — barras de peso por factor
   (`SGADD_4F.pesosPorFactor`), verde/rojo según el signo.
6. **⚔️ Duelos tácticos cruzados** — igual que antes, con indicador ✅/❌
   por celda: ✅ si ese ataque (`netL`/`netV`, ya con el signo correcto de
   `netFactor`) supera a esa defensa.
7. Matriz eficiencia vs. volumen de cada equipo (sin cambios).

### Lo que NO se migró (decisión consciente)

El original tenía un ciclo de "aprendizaje": guardaba cada predicción en
`HISTORIAL`, comparaba contra el resultado real, y ajustaba los pesos
parseando con regex el texto del reporte generado (`retroalimentarSimulador`).
Eso es frágil por diseño (round-trip por texto para recuperar números) y
además requiere estado persistente entre sesiones, que no encaja con un
sitio estático sin backend. Acá los pesos se recalculan **de cero, en cada
carga**, directo desde los partidos reales de la temporada — no hay
"memoria" de aciertos pasados. Si en algún momento se quiere ese circuito
de calibración, hace falta backend (ver deuda técnica del acceso público,
punto 10) para persistir resultados reales de partidos ya simulados.

### Límite conocido del modelo

La regresión múltiple poolea TODOS los partidos de TODOS los equipos de la
liga activa en un solo dataset (no hay coeficientes por equipo): asume que
el valor en puntos de "un 1% más de eFG%" es igual para cualquier plantel.
Es una simplificación razonable con el volumen de datos de una liga amateur
(decenas de partidos, no miles), pero no captura estilos de juego
extremos. Con menos de 30 partidos en la liga activa, degrada sola a
regresión simple por factor (mismas unidades — puntos por unidad de
factor — a diferencia del Pearson crudo del original).

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
- **El simulador no tiene ciclo de aprendizaje.** El original ajustaba pesos
  comparando predicciones contra resultados reales (`retroalimentarSimulador`,
  con estado persistente en la hoja `HISTORIAL`). Acá los pesos se recalculan
  de cero en cada carga: no hay memoria de aciertos pasados. Retomar esto
  necesita backend para persistir resultados (mismo problema que el punto
  anterior).

---

## 11. Workflow de Git — OBLIGATORIO

Después de **cualquier** cambio de código o función nueva:

```bash
# 1. Correr TODA la suite
node test-core.js && node test-logos.js && node test-ligas.js && \
node test-clubes.js && node test-boot.js && node test-jugadores.js && \
node test-4factores.js && node test-personalidad.js && node test-informe.js && \
node test-partido.js && node test-scouting.js && node test-estados.js

# 2. Solo si TODO da verde:
git add .
git commit -m "tipo: mensaje claro"
git push origin main
```

**Si algún test falla, NO commitear.** Arreglar primero y volver a correr.

### Formato del mensaje

`tipo: descripción en imperativo, en español`

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`

```
feat: agregar tab Evolución con banda de desvío en Jugadores
fix: corregir cruce de invariantes RD/RDopp en el validador
refactor: unificar resolución de club en resolverClubYPlanilla
```

### Antes de commitear, verificar también

- [ ] Los tests están todos verdes
- [ ] Se subió `?v=` en el `index.html` si cambió algún `.js` o el CSS
- [ ] No quedaron `logos-extraido.js` ni `boot-extraido.js` en el repo
- [ ] Si se tocó una regla que costó encontrar, quedó comentada la razón

### Sobre el push automático

El push va directo a `main` sin revisión previa. Es una decisión explícita del
dueño del repo para no frenar el flujo. **La suite verde es la única red de
seguridad**, así que si se agrega una función sin test, esa red se achica.
Regla práctica: función nueva → test nuevo.

---

## 12. Estilo de código

- **Español** en nombres de funciones, variables y comentarios del código propio.
- **Comentar el POR QUÉ, no el qué.** Especialmente en las decisiones que
  costaron encontrar: un `// mes 0-indexado` ahorra una tarde.
- Sin dependencias nuevas. Chart.js y Tailwind CDN es todo lo que hay.
- Módulos con IIFE y un objeto exportado. Compatible con Node para poder testear.
- Tailwind: los colores custom (`text-accent`, `text-ink`) dependen del JIT del
  CDN y **fallan en nodos inyectados dinámicamente**. Para esos casos hay
  respaldos definidos a mano en el `<style>` del `index.html`.

---

## 13. Estados de jugador y buzón de alertas

Dos módulos: `sgadd-estados.js` es el motor **puro y testeable**, y
`sgadd-buzon.js` es todo lo que toca `document`. La dependencia va en un
solo sentido y no puede invertirse.

### Dónde vive el buzón

**En el pie del menú lateral, junto al reloj de actualización.** Ahí aparece
en TODAS las secciones —incluida Principal, que usa la capa de datos vieja y
nunca pinta `SGADD_APP.barra()`— y comparte lugar con el estado del panel,
que es donde el DT ya mira si los datos están frescos.

El punto verde de *"datos actualizados"* se mudó ahí también: **estaba
duplicado**, el header lo decía con texto y el pie con la hora. Ahora el
header queda solo para los avisos de error, que sí necesitan estar a la
vista.

El `init()` dispara `SGADD_APP.cargar()` sin `await` al final del arranque
para que el buzón tenga índice desde el vamos — la carga está cacheada, así
que entrar después a Equipos no vuelve a pedir nada.

### Los cuatro estados

| Estado | ¿Entra a los planes? | ¿Suma a las medianas? | ¿Avisa en scouting? |
|---|---|---|---|
| 🟢 `ACTIVO` | sí | sí | no |
| 🟡 `SUSPENSO` (lesión o sanción) | **sí** | sí | **sí** |
| 🔵 `ALTA` (refuerzo) | sí | sí | **sí** |
| 🔴 `BAJA` (traspaso o fuera) | **no** | **sí** | no |

**Las dos decisiones que hay que respetar al tocarlo:**

1. **Un `SUSPENSO` sigue en el informe.** El DT rival necesita saber que ese
   jugador existe y qué hace, aunque no haya jugado las últimas cuatro
   fechas: si vuelve, vuelve. Lo que no puede es que su ausencia pase
   inadvertida — por eso `avisaEnScouting`.
2. **Una `BAJA` sale de los planes pero NO de las medianas.** Los partidos
   que jugó, los jugó: borrarla de la competencia sería reescribir el
   torneo. `jugadoresClave()` la filtra del plan defensivo; el índice y los
   percentiles no se tocan.

### El filtro anti-spam de inactividad

La regla de los 4 partidos **sola** marcaba **50 de 210 jugadores (24%)** en
la liga real. Un buzón que se abre con 50 tarjetas no se lee: se ignora para
siempre y después no se ve el que sí importa.

```
racha ≥ 4 partidos consecutivos sin minutos
  Y  PJ previos > 0        ← si nunca entró, no es una baja: nunca estuvo
  Y  MIN previo ≥ 8,0      ← si entraba 3 minutos sueltos, no era rotación
```

Con los dos filtros: **15 alertas**, todas de jugadores que *eran* rotación y
dejaron de serlo. Ejemplo real: PALOMEQUE, 4 partidos a 21,6 minutos, ocho
fechas sin entrar.

### `origen: "usuario"` gana siempre

`fusionarDeteccion()` **nunca** pisa un registro marcado por el DT, y el
detector saltea a los que ya tienen respuesta. Es lo que hace que el buzón no
vuelva a preguntar lo que ya se contestó. Un escaneo sí puede corregir a otro
escaneo, y el DT puede cambiar de opinión sobre su propia decisión.

### Dónde viven los estados

`localStorage`, con clave `sgadd.estados.<club>.<planilla>`. **No en la
planilla**: MotorStats no escribe estado y pedirle una columna abre un ciclo
de coordinación con el otro proyecto por algo que es una decisión del cuerpo
técnico, no un dato del box score.

**OJO con el id del club: es `CLUB.estado.id`**, no `CLUB.ID` ni `CLUB.id`.
Con la propiedad equivocada devolvía `undefined`, todos los clubes escribían
en la misma clave y **Jujuy habría pisado los estados de Reconquista** — sin
que se notara, porque el fallback coincidía con el nombre del club por
defecto. Hay un test que fija la cadena de respaldos.

Sin `localStorage` (Node, modo privado, primera visita) todos son `ACTIVO` y
el panel se comporta exactamente como antes.

### Volver atrás · alerta de reingreso y lista de confirmados

Dos caminos, porque un estado sin forma de deshacerse es una trampa:

1. **Alerta de reingreso** (`detectarReingresos`). Si alguien marcado 🟡 o 🔴
   volvió a jugar en alguno de los últimos 4 partidos de su equipo, el buzón
   avisa y ofrece reactivarlo. **Es la única alerta que se dispara sobre un
   registro con `origen: "usuario"`**, y no contradice la precedencia: no
   cambia nada, avisa de un hecho nuevo —jugó— que el DT no tenía cuando
   decidió. Su acción neutra no es "mantener activo" sino *"dejarlo como
   está"*, porque el jugador justamente no está activo.
2. **Lista de estados confirmados**, al pie del drawer. Sin ella, la alerta
   que originó el estado desaparece —porque el DT la contestó— y no quedaba
   dónde volver atrás. Un botón por jugador, en cualquier momento.

### El buzón · patrones de Checklist Design

- **Drawer**: overlay con `backdrop-blur`, entrada y salida animadas, cierre
  con ESC, clic afuera y botón explícito. **Foco atrapado adentro** mientras
  está abierto y devuelto al disparador al cerrar — sin la trampa de foco el
  tabulador se va a la página de atrás y deja de ser modal en la práctica.
- **Empty state**: cuando no hay nada pendiente NO se muestra una lista
  vacía sino un cierre positivo ("Plantel al día") con el recuento de lo ya
  confirmado.
- **La campana no se dibuja sin alertas.** Un icono permanentemente vacío
  entrena a ignorarlo.
- **Toast** en cada resolución, con `role="status"` y `aria-live="polite"`:
  se anuncia sin robar el foco.
- **"Mantener activo" siempre está.** Descartar tiene que ser tan fácil como
  confirmar; si no, el buzón se vuelve una trampa y el DT deja de abrirlo.
- **`:focus-visible` y no `:focus`**: el anillo aparece al navegar con
  teclado y no en cada clic del mouse, que es lo que lo volvía ruido.

### Resolver una alerta NO puede resetear el scroll

`resolver()` hacía `root.innerHTML = panel()`, o sea reconstruía **todo** el
drawer. El contenedor scrolleable era un nodo nuevo y nacía en `scrollTop = 0`:
el DT resolvía la novena tarjeta y el panel lo mandaba de vuelta al principio.
Con quince alertas eso convierte el buzón en algo que no se termina de usar.

Ahora se saca **solo la tarjeta resuelta** (`quitarTarjeta`), colapsando su
altura para que las de abajo suban por el flujo natural. Medido con Reconquista
real, 15 alertas: **salto 0** con contenido debajo. Cerca del final del scroll
el navegador recorta solo —no hay contenido para llenar el hueco— y eso es
correcto: `Math.min(scrollTop, scrollHeight - clientHeight)`.

Tres detalles que costaron:

1. **`height: auto` no es animable.** El JS fija la altura en píxeles antes de
   colapsarla; sin ese paso la tarjeta desaparece de golpe y el salto es el
   mismo que se quería evitar. `transform` tampoco sirve: desplazaría la
   tarjeta pero seguiría ocupando su lugar.
2. **Hay que colapsar margen, padding y borde además de la altura.** `space-y`
   pone `margin-top` en la tarjeta SIGUIENTE, así que sin anularlo queda un
   hueco fantasma donde estaba la que se fue.
3. **Preservar el scroll sin preservar el `<details>` de confirmados no
   alcanza.** Al repintar vuelve cerrado, el contenido se acorta de golpe y el
   `scrollTop` guardado queda por encima del máximo nuevo, así que se recorta
   a 0 igual. `repintarPanel()` reabre el desplegable. Medido: reactivar desde
   el fondo devolvía al tope hasta que se agregó eso.

**El bug escondido detrás del fix: los botones se identificaban por ÍNDICE del
array.** Sacar una tarjeta sin repintar la lista entera dejaba a las de abajo
apuntando a posiciones corridas —`estado.alertas` se recalcula y se acorta— y
el clic siguiente resolvía **al jugador equivocado, sin ningún síntoma
visible**. El anclaje pasó a la clave (`data-alerta`), que sobrevive a que la
lista cambie debajo. Verificado en el navegador resolviendo cuatro seguidas:
cada clic sacó exactamente al pedido.

Queda un respaldo: si el recálculo cambió algo más que la tarjeta tocada, se
repinta completo —conservando scroll y desplegable— en vez de dejar la lista
desincronizada del estado.

### Dónde vive la campana: en el HEADER, y por qué importa

`#buzonSlot` está en el **header global**, al lado de `#status-banner-holder`
—donde antes decía "Datos actualizados"—, y NO en la barra de sección ni al
pie del menú. Se probaron las dos y las dos fallan por el mismo motivo:
**Principal usa la capa de datos vieja y no pinta la barra de `SGADD_APP`**,
así que la campana desaparecía justo en la pantalla de entrada. El punto
verde de "datos al día" quedó con la hora, en el pie del menú: son dos cosas
distintas y estaban duplicadas.

**Los dos van dentro de un mismo grupo con `ml-auto`, y el buzón último.**
Sueltos como hijos directos, el `justify-between` del header repartía los tres
elementos a lo ancho y la campana quedaba **flotando en el medio de la barra**
en vez de anclada a la derecha. Con el grupo queda a 16px del borde —el padding
del header— en cualquier ancho.

Dos consecuencias de estar en el header:

1. **El arranque del índice cuelga de `init()`, no de `refreshData()`.**
   Principal nunca dispara `SGADD_APP.cargar()`, así que sin ese disparo la
   campana no aparecía hasta que el usuario tocara "Actualizar datos" o
   entrara a Equipos. Va sin `await` para no demorar el primer render, y la
   carga queda cacheada en `SGADD.cargarCategoria`. Ya se cometió el error de
   ponerlo en `refreshData()` —que solo corre al tocar el botón— y hay un
   test que lo fija.
2. **El botón necesita CSS a mano** (`.buzon-boton` / `.buzon-badge` en el
   `<style>` del `index.html`). Es un nodo inyectado, así que el JIT de
   Tailwind del CDN no le genera las clases y salía de 21px: la regla del
   punto 12, otra vez.

### Sincronización bidireccional scatter ↔ tabla de plantel

`equiposDestacarJugador(clave, origen)` es **un único punto de entrada para
las dos direcciones**, y ese es el punto. Con dos handlers separados (uno que
pinta la fila, otro que agranda el nodo), el hover sobre el gráfico dispara
el de la tabla, que vuelve a disparar el del gráfico: **bucle de repintado**.

`origen` lo corta: cuando el aviso viene del gráfico no se le vuelve a hablar
al gráfico. Hay además una salida temprana si la clave no cambió.

El ancla es `j.__clave` en los dos lados: `data-jug` en el `<tr>` y `clave`
en cada punto del scatter. El gráfico actualiza con `update('none')` —sin
animación— porque un hover con transición se siente roto.

---

## 14. Guía de diseño oficial · Checklist Design

**https://www.checklist.design/** es la referencia del proyecto para todo lo
que sea interfaz. Ante una duda de UI —un estado que falta, una transición,
un contraste dudoso— **se consulta ahí antes de inventar**.

No es una librería ni una dependencia: es una lista de verificación por
componente. Se usa como control, no como fuente de código.

### Para qué se consulta

| Tema | Qué resuelve |
|---|---|
| **Drawer / Modal** | overlay, desenfoque, animación, trampa de foco, cierre |
| **Toast** | duración, posición, anuncio a lectores de pantalla |
| **Empty states** | qué mostrar cuando no hay nada, y con qué tono |
| **Tablas** | jerarquía, estados de fila, alineación de números |
| **Botones** | hover, active, disabled, focus |
| **Formularios** | etiquetas, errores, ayuda contextual |
| **Contraste** | WCAG AA como piso, siempre |

### Reglas que ya están aplicadas y no se negocian

**Foco visible con `:focus-visible`, nunca con `:focus`.** El anillo aparece
al navegar con teclado y no en cada clic del mouse — con `:focus` era ruido
permanente y terminaba desactivándose, que es peor que no tenerlo.

**Contraste AA en todo el sistema.** Auditado sobre los 15 pares de color del
panel (texto, `dato-sec`, acento, verde/rojo de atípicos, `mm-pos`/`mm-neg`,
badges, fila destacada): **los 15 pasan 4.5:1**. Al agregar un color nuevo hay
que medirlo, no estimarlo.

**Ningún estado se comunica solo con color.** El `+/-` lleva signo además de
tinte, los atípicos llevan flecha, los estados de plantel llevan emoji y
texto. Un daltónico tiene que poder leer el panel entero.

**`prefers-reduced-motion` desactiva todas las animaciones.** Drawer, toast y
transiciones de fila.

**Empty states positivos, no listas vacías.** El buzón sin alertas muestra
"Plantel al día" con su marca, no un contenedor en blanco.

**Descartar tan fácil como confirmar.** Toda acción destructiva o de
compromiso tiene su opción neutra igual de visible ("Mantener activo").

### El error de CSS que hay que recordar

**En una tabla, el fondo de la fila va en los `<td>`, no en el `<tr>`.** La
card pinta las celdas con `#141414` propio y ese fondo **tapa** el del `tr`:
la regla se aplicaba, el `getComputedStyle` del `tr` la mostraba, y en
pantalla no se veía nada.

Por lo mismo, el desplazamiento de la fila destacada se hace con
`padding-left` y no con `transform`: en `display: table-row` los motores
directamente lo ignoran.

### Estados de fila del plantel

```css
tr.fila-jug > td            → transición .2s de fondo, .15s de padding
tr.fila-jug:hover > td      → tinte del acento al 12%
tr.fila-destacada > td      → ídem, y llega desde el hover en el scatter
   > td:first-child         → barra lateral de 3px + padding-left 9px
```

**El texto NO cambia de color al destacarse.** Repintarlo obliga a revalidar
el contraste de cada celda —verde de atípico, rojo de `+/-` negativo, naranja
de acento— contra un fondo nuevo. El tinte al 12% deja todo por encima de
4.5:1 sin tocar un solo color de texto.

### La tabla del plantel muestra TODO, el gráfico solo los de 10+

Son dos cosas distintas y hubo que separarlas:

- **La tabla es la lista del equipo**: muestra el plantel completo. Esconder a
  la mitad no la aclara, la deja incompleta.
- **El peso visual** lo decide el mismo corte que el gráfico
  (`SGADD_CHARTS.MIN_SCATTER`, leído y no repetido): los de 10 minutos o más
  van en blanco, el resto atenuado. Antes eso lo decidía `__califica` y
  quedaban grises jugadores que sí estaban en el scatter — el DT los veía de
  un color en la tabla y de otro en el nodo.
- **"Sin percentil"** es una nota al costado, no un atenuado de toda la fila:
  no llegar al umbral de calificación de la liga es otra pregunta.

La insignia con las iniciales (`.fila-inicial`) es el puente visual entre las
dos vistas: sin ella hay que leer el nombre completo para saber qué punto del
gráfico es cuál.
