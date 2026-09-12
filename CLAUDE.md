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
node test-core.js          # 297 tests · núcleo, índice, validador
node test-logos.js         #  37 tests · resolución de escudos
node test-ligas.js         #   9 tests · aislamiento entre ligas
node test-clubes.js        #  97 tests · multi-cliente
node test-config.js        # 318 tests · zonas de tabla, tramos, tonos AA, pestaña Torneo
node test-clasificacion.js #  57 tests · tabla de posiciones, orden, zonas y escudos
node test-boot.js          # 169 tests · arranque por club, sintaxis de los módulos, carteles de espera
node test-jugadores.js     # 283 tests · rol, arquetipos, tiro, evolución, local/visitante, rankings
node test-4factores.js     #  94 tests · regresión, pesos de liga, perfil de equipo, Simulador 360°
node test-personalidad.js  #  20 tests · identidad táctica
node test-informe.js       #  45 tests · secciones del informe y su PDF
node test-partido.js       #  55 tests · detalle partido a partido, perfil de tiro y su PDF
node test-scouting.js      # 448 tests · informe pre-partido, bandas, marcas, sintesis, titularidad
node test-estados.js       # 182 tests · estados de jugador, alertas, buzon, sync grafico-tabla
node test-pdf.js           #  92 tests · nombre del archivo en las exportaciones
node test-permisos.js      # 401 tests · roles, planes, el gate, el selector, el hub, el ciclo,
                           #             la sesión, la landing y el glosario
node test-comparativa.js   #  65 tests · ciclos, tendencia contra nivel, cara a cara
node test-clientes.js      #  69 tests · el padrón de clientes, los cupos y el login
node test-confirmar.js     #  86 tests · el diff, publicar zonas, subclientes y tooltips
node test-acumulacion.js   #  42 tests · la suma entre tramos · REGRESIÓN, no tocar
node test-resiliencia.js   #  50 tests · rotación del token, KV caído, el tramo que se conserva
node test-jsonclub.js      # 115 tests · los JSON de club, el validador, el aislamiento y publicar
node test-pares.js         # 218 tests · el grupo de pares, la cascada y las 3 cards
node test-panelmaster.js   #  57 tests · la categoría que persiste, el reset y el toast
node test-manuales.js      # 175 tests · partidos sin box score: suman a la tabla, no a las métricas
node test-responsive.js    # 136 tests · desborde, targets táctiles, modales, el papel, el PIE
                           #             el aviso de version y el diagnostico del pie
node test-rankingpdf.js    # 112 tests · la quinta exportación: una tabla por CARD, con su orden
node test-demo.js          # 130 tests · la demo publica: el snapshot anonimizado, el
                           #             contrato cols↔filas, las cards y el modal
node test-alta.js          #  98 tests · el alta de clientes: reusar un libro, los equipos
                           #             del libro, el catálogo manda y el tipeo del formulario
node test-alcance.js       # 122 tests · los clientes del mismo libro: el alcance de un
                           #             cambio, la herencia, el color y que el cliente
                           #             lea lo publicado
node test-pj.js            #  34 tests · el PJ de la sección Equipos es el de la tabla
                           #             de posiciones, con los partidos sin estadísticas
node test-plan-racha.js    #  43 tests · la racha con partidos manuales, el plan
                           #             efectivo del catálogo y el arranque sin destello
node test-resto.js         # 147 tests · el resto del plantel en tabla, la vía de gol líder,
                           #             las alertas contra el rol y la ficha del Plan Oro
node test-niveles.js       # 657 tests · registro de umbrales, los 6 niveles, la resolución
                           #             adaptativa y la PROCEDENCIA · REGRESIÓN de equivalencia

node test-backend.js       # 457 tests · el proxy, el benchmark, las alertas, el catálogo en KV
                           #             y el reparto de tokens de Upstash

# OJO: `test-backend.js` ESTÁ EN MAIN desde que se integró el backend.
# Decía acá que vivía solo en `poc/backend` y por eso quedó fuera de dos
# vueltas de suite (v144 y v145): su test de deriva —el que compara byte
# a byte `server/lib/compartido/` contra `js/`— venía en rojo desde que se
# tocó `sgadd-core.js`, o sea que el servidor corría con un núcleo viejo.
```

**5417 tests en total. Todos tienen que dar verde antes de commitear.**

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

No hay bundler ni paso de compilación en el camino: se edita, se sube, se ve.
La única pieza generada es `sgadd.css`, y se genera **a mano** (`node
generar-css.js`) igual que el manual de etiquetas — hay que acordarse de
correrlo al agregar una clase de Tailwind nueva.

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
  sgadd-ficha.js        ← modal + PDF de la ficha individual del jugador
  sgadd-estados.js      ← motor puro de estados de jugador y detección de alertas
  sgadd-buzon.js        ← UI del buzón: drawer, toast, badge (usa `document`)
  sgadd-clasificacion.js ← tabla de posiciones: motor + sección. Punto 16.
  sgadd-configui.js     ← pantalla de Configuración: edita las reglas del
                          punto 15 y las exporta. Punto 17.
  sgadd-config.js       ← motor PURO de competencia: zonas de la tabla,
                          tramos y tonos AA. Ver punto 15.
  sgadd-data.js         ← de dónde salen los datos: backend o GViz.
                          Solo en la rama `poc/backend`.
  sgadd-auth.js         ← roles, planes y permisos. Motor PURO. Punto 19.
                          NO es seguridad: leer el punto 19 antes de tocarlo.
  sgadd-diagnostico.js  ← auditoría de datos, visible en la app
HOJA_DE_RUTA.md         ← qué está hecho, qué falta y por qué ese orden.
                          La vista de PRODUCTO; el detalle técnico vive acá.
INTEGRACION_MOTORSTATS.md ← auditoría del motor que escribe las planillas
ESPECIFICACION_ADAPTADOR_GVIZ.md ← la Fase 1 documentada: parser, normalizaciones,
                          scope, indice y las dos capas de cache
AVISO_MOTORSTATS_2026-08-24.md ← lo que la web le reporta al motor: libros
                          desalineados, la U21 en 401 y dos correcciones a su prompt
AUDITORIA_ETIQUETAS_JUGADORES.md ← glosario y auditoría de TODAS las etiquetas
GUIA_ALTA_CLIENTES.md   ← el paso a paso, sin tecnicismos, para dar de alta o
                          modificar un cliente desde el Panel Master (punto 53)
PROPUESTA_ESTADOS_JUGADOR.md ← diseño original de estados (ya implementado, ver punto 13)
tailwind.config.js      ← la config que vivía en el <head> cuando Tailwind
                          era CDN. sgadd.in.css es la entrada.
sgadd.css               ← el CSS COMPILADO (27 KB). Se commitea: es lo que
                          sirve Pages. Se regenera con `node generar-css.js`
generar-css.js          ← el generador. Fija la version de Tailwind a mano
                          para que dos personas no generen CSS distinto.
generar-manual-etiquetas.js  ← genera MANUAL_ETIQUETADO_SGADD.html para el
                          cuerpo técnico. Se corre a mano: `node generar-manual-etiquetas.js`
clubes/
  reconquista.json      ← 3 planillas (Primera + Naranja U21/U23), liga la-plata
  deportivo.json        ← 1 planilla (Primera 2026), liga la-plata
  jujuy.json            ← 1 planilla (Conferencia Norte), liga liga-argentina
logos/<liga>/           ← escudos + index.json (manifiesto)
test-fixtures/          ← prom.tsv + p4f.tsv, 12 equipos de La Plata (committeados)
simulador-4factores-legacy.js ← Apps Script original (auditado, no se ejecuta:
                          ver punto 10). Queda como referencia de qué se corrigió.
```

**Versión actual de assets: `?v=158`.** Los `<script>` llevan query string para
bustear el caché de GitHub Pages. **Subir el número en CADA entrega**, si no el
navegador sirve la versión vieja y se pierden horas debuggeando fantasmas.

**El número se muestra en el pie del menú lateral** (`#asset-version`, se
rellena en `init()` leyendo el `?v=` de un `<script>` real). Es el
diagnóstico de treinta segundos para la trampa de siempre: `index.html` NO
lleva `?v=` —es el archivo que trae el CSS y el mapa de versiones— así que
cuando queda cacheado, en el navegador o en el CDN de Pages (`max-age=600`),
la app entera se queda en la entrega anterior y los cambios "no aparecen"
sin ningún síntoma. Si el pie dice una versión vieja, es caché: Ctrl+F5.

**Y ojo con la otra mitad: que el repo tenga el código no quiere decir que
Pages lo haya publicado.** Se separan mirando `raw.githubusercontent.com`
(el repo, inmediato) contra `coachgn.github.io` (el build). Medido: una
entrega se publicó 41 segundos después del push y la siguiente tardó más de
media hora.

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

> **Desde 2026-09-11 el JSON ya no es obligatorio para las CATEGORÍAS**:
> cuando el servidor tiene al club, salen de su catálogo y el JSON queda
> para la marca. Un alta desde el Panel Master deja el panel andando sin
> un commit. Ver el punto 53.

**Verificado sumando DEPORTIVO el 2026-08-24**: alcanzó con
`clubes/deportivo.json`. No hay lista de clubes en ninguna parte —
`?club=<id>` resuelve `clubes/<id>.json` por convención— así que no se tocó
un solo `.js` ni hizo falta subir el `?v=`.

Dos cosas que sí hay que mirar al sumar uno:

- **El `patronEquipoPropio` tiene que discriminar dentro de SU libro.** En
  el de DEPORTIVO juegan **DEPORTIVO LA PLATA** y **DEPORTIVO SAN**
  **VICENTE**: con el patrón corto —`DEPORTIVO`— los dos serían el equipo
  propio, y el panel trataría a un rival como propio en scouting, en los
  informes y en el plantel, sin ningún síntoma visible. Hay un test que
  falla si el patrón vuelve a ser la palabra suelta.
- **La planilla tiene que ser pública.** El panel es estático y lee por
  GViz anónimo: un libro compartido solo con su dueño da **401** y la
  categoría no carga, aunque desde el navegador del dueño se vea perfecta.
  Es lo que pasó con DEPORTIVO al darlo de alta. El permiso que hace falta
  es *Cualquiera con el enlace · Lector*.

**El acento sale del escudo, no de la intuición.** El azul de DEPORTIVO
(`#09086E`) se muestreó de su propio PNG —cubre el 67% de la superficie— y
el sistema lo acomoda solo: `aclararHastaLegible()` lo lleva a `#9090be`
para texto sobre la card (**contraste 6,07**, medido) y para el papel lo
deja como está, porque un azul tan oscuro sobre blanco ya pasa de sobra.

**Los escudos son del CLUB, no del equipo.** `ATENAS 'B'` y `PLATENSE 'B'`
usan el mismo archivo que sus `'A'`; se resuelve con una entrada más en el
manifiesto, igual que ya existía `atenas` / `atenas a`.

**El manifiesto (`logos/<liga>/index.json`) mapea clave → archivo**, así que
el nombre del archivo NO tiene que ser el slug. Eso permite subir el escudo
como venga, pero tiene un filo: al subir los de la U23 por la web de GitHub
se renombró `atenas-a.jpg` y se borraron `reconquista-a.png` y
`banco-provincia-a.webp`, y el manifiesto quedó apuntando a los nombres
viejos. Resultado: **la U23 ganó sus escudos y Primera perdió tres**, sin
aviso — el panel de faltantes solo mira la categoría abierta. Un club puede
estar en varias categorías con claves distintas (`reconquista` en U23,
`reconquista a` en Primera), así que **el manifiesto tiene que cubrirlas
todas**. Hay un test en `test-logos.js` que falla si alguna entrada apunta a
un archivo que no existe.

### El acento de marca NUNCA se pinta crudo sobre la card

`CLUB.TEMA.acento` es la marca tal cual la declaró el cliente: sirve para
un escudo o un borde grueso. Como **color de texto o de línea fina** sobre
la card oscura depende de cuán oscuro sea, y eso cambia por cliente.

Medido con DEPORTIVO, cuyo azul de escudo es `#09086E`: la tabla de
métricas clave pintaba los valores del tercil medio en **contraste 1,12**,
o sea invisibles. Con el naranja de Reconquista el mismo código se veía
bien, **así que el defecto entró con el tercer cliente y no antes** — y al
medirlo apareció que **Jujuy también estaba por debajo** (3,56) desde
siempre, sin que nadie lo notara.

`COL.acento` devuelve ahora el color que el sistema ya calcula para que se
LEA sobre este fondo, y se resuelve en cada lectura igual que `grilla` y
`texto`, porque el fondo cambia al entrar en modo papel:

```
pantalla  →  TEMA.acentoTexto   (aclarado hasta 4,5 sobre #141414)
papel     →  TEMA.acentoPapel   (oscurecido hasta 4,5 sobre blanco)
```

| Cliente | Marca | Antes | Ahora |
|---|---|---|---|
| DEPORTIVO | `#09086E` | **1,12** | **6,07** |
| Jujuy | `#2563eb` | **3,56** | **6,09** |
| Reconquista | `#f7941e` | 8,08 | 8,08 |

Alcanza a todo lo que dibuja con el acento: barras de ranking, radares,
gráficos de barras y comparativas de equipo. Hay tests que fijan que los
tres clientes pasen AA y que `COL.acento` no vuelva a leer el crudo.

### El escudo de un club se llama como el CLUB ENTERO

El resolutor prueba **recortes** del nombre cuando no hay match exacto,
así que un archivo llamado `deportivo.png` se lo lleva cualquier club que
empiece con esa palabra. Pasó al sumar el cliente DEPORTIVO: en su libro
juegan **DEPORTIVO LA PLATA** y **DEPORTIVO SAN VICENTE**, y los dos
salían en la grilla con el mismo escudo — sin figurar en el panel de
faltantes, porque para el resolutor estaba resuelto.

Se arregló renombrando a `deportivo-la-plata.png`. Ahora SAN VICENTE cae
a sus iniciales, que es lo correcto: no tenemos su escudo. Hay un test que
falla si algún archivo vuelve a tener un nombre que sea **prefijo** de
otro.

### Renombrar una tira o sumar una categoría · se toca el JSON, no el código

La etiqueta del grupo del selector sale de un mapa por `tira` en
`sgadd-app.js` (`femenina` → Femenina, `negra` → Masculina Negra, `naranja`
→ Masculina Naranja), así que **cambiar de tira es cambiar un campo del
JSON**, no tocar la UI. Reconquista pasó de *Negra* a **Naranja** en
2026-08-17 así: `tira: "naranja"` y el `label` de la planilla.

El **`label` sí es cosmético y se cambia solo**: Primera pasó de *"Primera
· Clausura 2026"* a **"Primera · Vuelta 2026"** el 2026-08-24, para que la
etiqueta diga lo mismo que la columna `TORNEO` del libro migrado. El `id`
quedó en `primera-clausura-2026` a propósito — ver abajo.

**`faseTorneo` del JSON no lo lee ningún módulo.** Está declarado en las
cuatro planillas y el torneo sale siempre de los datos
(`torneosDisponibles`), así que un desajuste entre ese campo y la columna
real **no rompe nada**. Se mantiene alineado por prolijidad, no porque
haga falta.

**Renombrar el `id` de una planilla NO es cosmético.** Es la clave con la
que se guardan los estados de jugador (`sgadd.estados.<club>.<planilla>` —
punto 13) y viaja en la RUTA (`#/<planilla>/…`), o sea en cada link que el
cuerpo técnico compartió. Renombrarlo pierde las dos cosas.

Con la U21 se hizo igual (`negra-…` → `naranja-u21-clausura-2026`) porque el
club confirmó que en esa planilla no había estados cargados. Es una decisión
de datos, no de estética: preguntar antes.

### El cuelgue total de la página · un ciclo de repintado

Síntoma: *"La página no responde"* de Chrome al cambiar de categoría
estando en **Principal**. No es lento: es el hilo tomado, medido con un
`eval` trivial que dejaba de contestar a los 8 s y no volvía nunca.

El ciclo:

```
drawOrtgDrtgChart() → LOGOS.resolver() → alResolverFns →
renderSection('principal') → drawOrtgDrtgChart() → …
```

`resolver()` avisaba **siempre** al terminar, y el callback global repinta
la sección entera; el gráfico de Principal vuelve a pedir los escudos al
dibujarse. Con todo ya en caché esas promesas resuelven en **microtasks**,
así que el bucle nunca cede el hilo — por eso cuelga en vez de solo
parpadear.

**Por qué al cambiar y no al arrancar**: el callback lo registra
`precargarLogos()`, que en el arranque corre en paralelo con el primer
render. Cuando el DT cambia de categoría ya está registrado, así que el
ciclo arranca sí o sí.

**El arreglo va en `resolver()`, no en el gráfico**: se avisa **solo si
entró algún escudo nuevo** (`resueltos` cambió). Si todo salió de caché no
hay nada que repintar, la segunda vuelta no avisa y el ciclo se corta solo.
El hook sigue cumpliendo su trabajo —los escudos que llegan tarde se
pintan— y protege igual a Scouting, que también llama a `resolver()`.

Medido: `drawOrtgDrtgChart` pasó de correr sin fin a **una sola vez** por
cambio de categoría, y la página responde en todo momento. Hay tres tests
en `test-logos.js` que lo fijan, incluido el caso del equipo **sin
archivo**: tampoco puede avisar en cada tanda.

### El cambio de categoría no puede dejar al DT sin controles

Con tres planillas activas apareció un síntoma que con una sola no existe:
al pasar a U21 o U23 la barra quedaba en *"Cargando…"* y **el selector
desaparecía de la pantalla**. Con Primera no pasaba porque ya estaba
cargada y volvía en el acto. Son tres causas distintas, las tres
reproducidas en el navegador:

1. **El cartel de la capa vieja se llevaba puesta la barra.**
   `onCategoriaCambiada` —que es de la capa de datos de Principal— pisaba
   `#view-root` con *"Cambiando de categoria…"* aunque el DT estuviera en
   Equipos. Ahí se va el selector: no se puede volver atrás ni elegir otra
   mientras baja. Ahora ese cartel **solo se pinta en Principal**; las
   secciones SGADD ya muestran su propio estado *debajo* de la barra.

2. **Una petición que no contesta dejaba la categoría muerta.**
   `cargarCategoria` cachea la **promesa** por `sheetId`, así que un
   `fetch` que nunca resuelve dejaba esa planilla en "Cargando…" **para
   siempre**: cambiar de ida y vuelta no la revivía porque el caché
   devolvía la misma promesa colgada, y solo se recuperaba recargando.
   Ahora cada hoja tiene un techo de `TIMEOUT_HOJA` (20 s) y **un fracaso
   total no se cachea**.

   El techo son **dos** mecanismos y hacen falta los dos: `AbortController`
   corta la conexión de verdad —para no dejarla abierta consumiendo una de
   las seis que el navegador da por host— y la **carrera** es la que
   garantiza el corte, porque abortar solo funciona si el `fetch` respeta
   la señal. Medido con un `fetch` que la ignora: sin la carrera no cortaba
   nunca.

3. **Sin una sola hoja se armaba un índice vacío.** Cada hoja que falla se
   degrada sola —una planilla incompleta sigue sirviendo— pero si no entra
   **ninguna**, el problema es de red o de permisos y hay que decirlo.
   Antes la sección quedaba en blanco, con 0 equipos y sin cartel. Medido
   cortando la red en el navegador.

**Y un guard de carrera en `cargar()`**: dos cambios seguidos disparan dos
cargas, y la primera puede volver DESPUÉS de la segunda. Cada una se queda
con su ficha (`_cargaId`) y al volver comprueba si sigue siendo la vigente;
si no, se retira sin tocar el estado ni apagar el cartel de la otra.
Medido: sin esto, pedir U21 y a los 300 ms U23 terminaba mostrando la U21.

### Dos bugs que destapó la categoría nueva

Los dos estaban latentes desde que existe la segunda planilla y solo se ven
con **más de una activa**:

1. **El selector revertía la categoría.** `buildEquipos()` imponía al estado
   global `EQUIPOS.planillaId` —la copia que la sección guarda entre
   repintados— en vez de lo que trae la RUTA. Al cambiar de categoría, el
   repintado volvía a imponer la vieja: el DT quedaba con la etiqueta de una
   y los datos de la otra. Ahora `equiposLeerRuta()` devuelve la ruta
   parseada y solo `r.planilla` pisa la decisión global. Mismo arreglo en
   Jugadores y en Simulador, que tenían el patrón calcado.
2. **El nombre del equipo conservaba el sufijo.** El índice recortaba solo
   `- MM` con una regex propia (`sgadd-core.js`), así que Primera se veía
   limpia y U21/U23 mostraban "ATENAS - U23" en la grilla, los rankings y el
   título de la ficha — mientras los escudos, que sí usan el normalizador,
   resolvían "ATENAS". El nombre sale ahora de `limpiarNombre()`, que conoce
   `MM`, `MF` y `U\d{1,2}[MF]?`. Los paréntesis de Liga Argentina siguen sin
   tocarse.

**Una planilla SIN `sheetId` entra igual, como inactiva.** `activo: !!sheetId`
en `sgadd-club.js`, y el selector la muestra deshabilitada con *"— sin
datos"*. Así la categoría nueva ya aparece en la lista —el DT ve que existe—
sin dejar entrar a una sección vacía. Es lo que pasa hoy con la U23 hasta que
el club pase el id de su planilla.

---

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
6 Jugadores clave
7 Resto del plantel  +  Claves estratégicas
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

### El mapa estático NO se adapta, y es deliberado

`JUGADORES_UMBRALES` sigue devolviendo los literales históricos (`baseDe`)
y no la semilla del nivel por defecto. Es el respaldo sin contexto y
**scouting lo lee por `COMPARTIDOS`**: resolverlo a un nivel cambiaría la
vara de sus once reglas de marca en silencio. Lo comprobé al revés — con
el mapa estático resuelto a `LOCAL_MAYORES`, `test-scouting.js` daba 12
fallas porque sus fixtures están calibradas contra Liga Argentina.

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

### La etiqueta de un jugador que no califica lleva `~` (P-7)

Las medias y las bandas de liga se calculan **solo sobre los calificados**,
pero las etiquetas se le asignan a **todos**. Un jugador de 6 minutos con
`AST-PP` de 2,0 sobre una muestra de tres pases recibía *🧠 Generador* con el
mismo peso visual que uno de 30, mientras su propia ficha mostraba los
percentiles en blanco: la etiqueta se veía firme y el dato que la sostiene,
no.

**Se marca, no se borra** — la regla de siempre: mostrar el dato y quitarle
autoridad visual, igual que el `~` del percentil y las barras grises. El
badge sale en gris con `~` adelante y el motivo en el `title`.

**Se marcan TODAS las etiquetas del no calificado, no solo las que se
comparan contra la liga**, y eso se corrigió después de medirlo: acotar la
marca a las relativas dejaba **1 badge marcado sobre 216 jugadores**, o sea
que no tocaba el caso que la auditoría denuncia. El ejemplo del punto ciego
es de umbral **absoluto**: lo que lo vuelve poco confiable no es contra qué
se compara sino que **su propio promedio se calculó sobre nada**. Es el
mismo criterio que ya usa el percentil, que no aparece para ninguna métrica
de un no calificado.

Medido en Reconquista: **117 de 216 jugadores** y 247 de 549 etiquetas
quedan marcadas — exactamente los que no califican, cero sobre los 99 que
sí. En la grilla del plantel el corte se ve solo: las cards cambian de color
justo donde empieza "Pocos Minutos".

El flag `relativa` del catálogo sigue vivo y agrega una línea al tooltip:
esas además se miden contra una mediana armada con los que sí califican.
`jugadoresBadges()` es el único lugar que lo decide, así que la card del
plantel, la ficha y el informe de scouting marcan lo mismo.

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

### El porcentaje solo no alcanza · convertidos sobre intentos

B-3. Un T3% de 100% con **un** intento y otro con **seis** se leen igual y
no son lo mismo. Va en las dos superficies de la cronología:

- **Tab Partidos**: tres columnas nuevas, `T2 C/I`, `T3 C/I`, `T1 C/I`.
- **Tab Evolución**: el tooltip pega el par al porcentaje — `T3%: 25,0%
  (2/8)`. Sin par, el tooltip queda exactamente como estaba: no aparece un
  paréntesis vacío.

**El catálogo declara de dónde sale** (`conv`/`int` en
`JUGADORES_METRICAS_EVOLUCION`), así que agregar una métrica de acierto es
agregar dos campos y nada más. **`TS%` NO lo lleva a propósito**: mezcla
tiros de campo con libres ponderados por 0,44, así que no existe un par
convertidos/intentos que lo describa sin mentir. Antes que inventar uno,
no va ninguno — la misma regla de siempre.

**Una zona sin intentos va `—` y no `0/0`.** Un cero sobre cero se lee
como un fracaso y es una zona que el jugador no usó.

Ojo al tocar el log: son **tres columnas más**, así que el `colspan` de la
fila de "sin box score" tiene que acompañar (7 → 10) o el estado vacío
queda corto y desarma la tabla. Hay un test que lo fija.

### Promedios ↔ Totales · el mismo plantel, dos preguntas

*"¿Cuánto rinde por noche?"* compara jugadores entre sí; *"¿cuánto lleva
aportado?"* mide la carga real de la fase. El toggle está en las **dos**
superficies tabulares: el tab **Plantel** de Equipos y los **Rankings de
la liga** en Jugadores.

**Solo cambian las CUENTAS.** `ACUMULADO J` trae 32 columnas contra las 53
de `PROMEDIOS J`, y las 21 que faltan son exactamente las tasas: una tasa
acumulada es la misma tasa —el eFG% de la temporada no es la suma de los
eFG% de cada noche—. En modo total esas columnas se marcan con `≡` en el
encabezado en vez de mostrar un número que no cambió sin explicación.

El índice cuelga el acumulado de cada jugador como **`__acum`**, enganchado
por NOMBRE + EQUIPO —la misma clave compuesta del slug de la ficha: con el
nombre solo, dos homónimos se llevarían el acumulado del otro—. No se arma
una segunda lista de jugadores: así el toggle alterna el ORIGEN de unas
columnas sin duplicar el plantel ni recalcular percentiles, arquetipos ni
estados, que se resuelven una sola vez sobre promedios.

Cuatro reglas que hay que respetar al tocarlo:

- **En rankings, el modo cambia también QUIÉN entra al top 20.** Es
  deliberado: el top de totales son los máximos anotadores de la fase y el
  de promedios los que más rinden por noche. Medido con datos reales de
  DEPORTIVO, YOUNG es 1° por promedio (17,9) y **5°** por total (161).
- **El umbral de minutos se compara SIEMPRE contra el promedio**, incluso
  en modo total: en totales un suplente con 12 partidos cortos supera en
  minutos a un titular con 4, y el filtro dejaría entrar justo a los que
  vino a excluir.
- **Cambiar de escala resetea el orden de columna.** Un *"por RD
  descendente"* elegido sobre promedios no significa lo mismo sobre
  totales. Es el mismo criterio que ya se aplica al cambiar de pestaña.
- **Las dos superficies acumulan las MISMAS columnas.** Las listas están
  duplicadas —`PLANTEL_ACUMULABLES` y `RANKING_ACUMULABLES`— porque
  `sgadd-jugadores.js` no puede leer a `sgadd-equipos.js` sin invertir la
  dependencia. Hay un test que falla si dejan de coincidir.

**El toggle no se ofrece si el acumulado está a medio calcular.** Se exige
que cubra el **80%** del plantel: medido en el libro de Jujuy, `ACUMULADO
J` trae 17 filas para 260 jugadores, y con la guarda laxa el botón habría
aparecido para dejar 244 filas cayendo al promedio en silencio. Un control
que promete cambiar la vista y no la cambia es peor que no tenerlo — y el
Diagnóstico lo denuncia por separado (punto 5).

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
3. ~~PDF de ficha individual.~~ **HECHO** — es la cuarta exportación
   (`sgadd-ficha.js`, punto 7.6 ter).

El resto de lo que pidió el cuerpo técnico está en el punto **10 bis**.

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

### Los nueve bloques, en orden

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
7. **Resto del plantel** — tabla compacta de los que no entran a la de
   arriba: muestra, vía de gol líder, eficiencia, alertas cuando su
   producción POR MINUTO destaca sobre su rol, y sus etiquetas. Punto 56.
8. **Claves estratégicas y anticipación** — las 8 reglas dinámicas.
9. **Ficha de análisis por jugador** — rol funcional, fortalezas, puntos de
   fuga y plan de acción, uno por rival. **Es del Plan ORO** (punto 56): con
   Plata, en su lugar va la card que explica qué incluye.

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

### Dos niveles · el aviso INFORMA, la alerta PREGUNTA

Pedido del club (B-2): *"cada 2 fechas una alerta al lado del jugador…
no estar en 2 fechas puede ser una lesión leve, un viaje o algo así"*.

| | Racha | Dónde se ve | Botones de estado | Badge |
|---|---|---|---|---|
| ⏳ **aviso** | `RACHA_AVISO` = 2 | ficha, card del plantel, scouting, sección *En observación* del drawer | **no** | no suma |
| 🔔 **alerta** | `RACHA_INACTIVIDAD` = 4 | ídem + tarjeta con acciones | sí (SUSPENSO / BAJA) | sí |

**El aviso no propone estados y por eso no infla el badge.** Si los
contara, el número volvería a ser el que nadie contesta — que es
exactamente el problema que el filtro anti-spam vino a resolver. La
campana **sí se dibuja** habiendo solo avisos (si no, no habría cómo abrir
el drawer para verlos), pero va **sin número**: el badge significa *"esto
espera una respuesta tuya"* y un aviso no la espera.

`soloAlertas()` / `soloAvisos()` parten la lista y `pendienteDe(alertas,
clave)` contesta qué hay sobre UN jugador — es lo que permite pintarlo
**donde está el jugador** y no solo adentro del drawer. Con las dos cosas
encima gana la que pide decisión.

Medido con datos reales: Primera 13 avisos / 14 alertas sobre 218
jugadores, U21 1 / 0 sobre 91, U23 26 / 32 sobre 252.

**Un estado confirmado calla el aviso.** `jugadoresLineaPendiente()` y
`scoutEstadoJugador()` se van en silencio si el jugador ya tiene un estado
distinto de ACTIVO: el estado manda sobre la sospecha, y mostrar los dos
juntos es pedirle al DT que resuelva algo que ya resolvió.

### El drawer se abre como un ÍNDICE · tres secciones plegadas

Alertas, *En observación* y *Estados confirmados* son tres `<details>`
armados por **el mismo** helper (`seccion(id, titulo, cuenta, cuerpo,
tono)`), y **las tres arrancan plegadas**. Arriba de todo va el buscador.
Medido en Primera (14 alertas + 13 avisos): el contenido del drawer baja
de **2747 a 828px**.

La lectura del buzón pasó de "scrolleá catorce tarjetas para descubrir
qué hay abajo" a tres renglones con sus números y el DT eligiendo a dónde
ir. Con la sección plegada **ese número ES la información**, así que
`resolver()` baja el contador del encabezado al sacar la tarjeta; resuelta
la última, repinta (que trae el cierre positivo).

**El plegado vive en `estado.secciones`, no en el DOM.** Es la misma
trampa que ya había dado el desplegable de confirmados: si viviera en el
DOM, un repintado volvería a plegar lo que el DT acababa de abrir, el
contenido se acortaría de golpe y el `scrollTop` guardado se recortaría a
0. `repintarPanel()` ya no lee el DOM para esto.

### El buscador · llegar a cualquier jugador del torneo

El detector solo trae a los que **dejaron de jugar**. El DT sabe cosas que
el box score no registra —una lesión de ayer, un refuerzo que llega el
sábado, una sanción— y para anotarlas tenía que salir del drawer, entrar a
Jugadores, elegir el equipo y abrir la ficha.

Busca sobre **toda la categoría** (`idx.liga.jugadores`), no solo sobre
los que ya tienen alerta: sirve para las dos cosas que pidió el club —
ubicar a uno que ya está en las listas de abajo, y sumar a mano a uno que
no está. Elegido un resultado, salen los cuatro botones de estado y su
`Ficha →`.

Reglas que hay que respetar al tocarlo:

- **Tipear NO repinta el drawer.** `buscar()` escribe el estado y
  reemplaza solo `#buzonResultados`. Un repintado por tecla le saca el
  foco al input y hace imposible escribir un apellido — es la misma regla
  que ya cumplen `scoutMeta()` y `scoutMarca()` (punto 9). Marcar un
  estado sí repinta, y ahí `repintarPanel()` **devuelve el foco y el
  cursor** al buscador, porque esos no viajan solos.
- **Se busca por nombre Y por equipo**, sin acentos ni mayúsculas
  (`normalizar()` con `NFD`): escribiendo *atenas* sale su plantel, que es
  como piensa el DT cuando no recuerda el apellido. Con menos de dos
  letras no devuelve nada, y el corte es `MAX_RESULTADOS` (8) con aviso de
  cuántos quedaron afuera.
- **`marcarPorClave()` reusa `marcar()`**, no escribe el mapa por su
  cuenta. Las dos mitades de la clave ya están normalizadas y
  `claveJugador()` es idempotente, así que el split la reconstruye igual.
  Dos caminos de escritura terminan con uno que se olvida de persistir o
  de sincronizar.
- **No toda alerta tiene `racha`.** Un reingreso o un traspaso no son una
  cuenta de fechas, y asumir que sí imprimía **"🔔 undefined fechas"** —
  justo en el caso más común del buscador: marcar SUSPENSO a alguien que
  jugó hace poco dispara la alerta de reingreso. `resumenPendiente()` mira
  el tipo antes de escribir el texto.

### Las cards de *En observación* se abren y marcan el estado ahí mismo

Un clic en el nombre despliega **los mismos cuatro botones del buscador**
dentro de la card. La sección **no** los muestra de entrada: con los
cuatro desplegados en trece tarjetas volvería el buzón que nadie contesta,
que es justo lo que separa un aviso de una alerta. Pero cuando el DT ya
sabe qué pasó —y de eso se trata el aviso— tiene que poder anotarlo sin ir
hasta la ficha.

- **Se abre UNA por vez** (`estado.avisoAbierto`), y volver a tocar la
  misma la cierra. Trece abiertas son exactamente la lista que la sección
  plegable vino a evitar.
- **Abrir una card repinta solo `#buzonAvisos`**, no el drawer: si
  repintara todo se perdería el scroll y el texto del buscador.
- **`botonesEstado(clave)` es la única fuente de esos botones.** Los usan
  el buscador y las cards, y es el mismo gesto —elegir a alguien y decir
  qué le pasa—, así que tiene que verse igual en los dos lados.
  Duplicarlo terminaría con dos juegos que se desincronizan, el bug que ya
  tuvo el rol funcional (punto 8). Hay un test que cuenta las ocurrencias
  de `marcarPorClave` en el fuente y falla si aparece una segunda.
- **El chevron `▸`/`▾` acompaña al borde**: ningún estado se comunica solo
  con color (punto 14), y además va `aria-expanded`.

### `Ficha →` · el atajo, en las tres listas

El aviso dice que alguien lleva tres fechas sin entrar y ahí se corta:
para saber si eso importa hay que ver sus minutos, su rol y su log. Sin el
botón había que cerrar el drawer, entrar a Jugadores, elegir el equipo y
buscarlo en la grilla. En las tarjetas de alerta va por el mismo motivo:
marcar BAJA es la decisión más cara del buzón y mirar la ficha antes es
justo lo que hay que poder hacer sin perder la lista.

Dos reglas al tocarlo:

- **El slug NO se arma en el buzón.** Se busca el jugador en el índice por
  su clave y se le pide a `jugadoresSlug()`. Repetir la fórmula sería un
  segundo lugar que se desincroniza — el bug que ya tuvo el rol funcional
  (punto 8). Si el jugador no está en la categoría abierta, avisa con un
  toast en vez de navegar a una ficha vacía.
- **El foco NO vuelve a la campana.** `cerrar()` normalmente lo devuelve
  al disparador, pero acá el drawer se cierra porque el DT se está yendo a
  otra pantalla: se limpia `estado.disparador` y el foco va a `#view-root`.
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

No es una librería de CSS: es una lista de verificación por componente. Se
usa como control, no como fuente de código — de ahí no se copia ni un color
ni una clase, porque el sistema visual del panel es propio y por club.

### El catálogo está EN EL REPO, no hay que ir a buscarlo

`.agents/skills/checklist-design/` trae las **118 checklists** publicadas
como archivos, más los dos modos de revisión (`audit` item por item y
`critique`). Es la skill oficial del sitio, MIT, instalada con:

```bash
npx skills add checklist-design/skills --tool claude-code
```

Reinstalar solo hace falta para actualizar el catálogo. El symlink que el
instalador deja en `.claude/skills/` apunta a una ruta absoluta de la
máquina y está en `.gitignore`; los archivos de verdad viven en `.agents/`
y viajan con el repo, así que **un clon nuevo ya tiene el catálogo** y
cualquier cliente que se sume arranca con el mismo criterio.

Antes esto era un link en un documento: había que acordarse de entrar,
buscar el componente y leerlo. Ahora la checklist que corresponde se lee
desde el repo, sin red.

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

**Todo lo que se puede clickear se puede usar con el teclado.** Media app se
navega haciendo clic en una FILA —un partido abre su detalle, un jugador su
ficha, un equipo la suya— y con un `onclick` sobre un `<tr>` esa navegación
**no existía para el teclado**: la fila no se enfocaba, no se activaba con
Enter y un lector de pantalla la leía como texto suelto.

`SGADD_UI.atributosFila(etiqueta)` emite `tabindex`, `role="button"` y un
`aria-label` que dice qué pasa al activarla; `teclaActiva()` reusa el
`onclick` que la fila ya tiene, así no hay dos caminos que mantener
sincronizados. Hay un test que recorre los módulos y **falla si aparece una
fila con `cursor-pointer` sin esos atributos**.

**Las tabs son tabs de verdad**: `role="tablist"`/`role="tab"`,
`aria-selected` y **tabindex rodante** —el tabulador entra una vez al grupo,
a la pestaña activa, y adentro mandan las flechas—. Activar repinta la
sección y destruye el nodo, así que `teclaTabs()` devuelve el foco buscando
la pestaña por su `data-tab` después del repintado; sin eso el teclado queda
en el `<body>` y hay que empezar de nuevo.

**El foco de una FILA no se marca con `outline`.** En `display: table-row`
los motores lo dibujan despareja — el mismo motivo por el que el fondo de
una fila va en los `<td>` (ver abajo). Se repite el tratamiento de la fila
destacada, que ya tiene el contraste medido, más la barra del acento en la
primera celda.

**Salto al contenido.** Con un menú de seis secciones, sin él el teclado lo
atraviesa entero en CADA pantalla. Va como `<button>` y no como ancla a
`#view-root`: **el hash es la ruta de la app**, y un ancla lo pisaría
mandando al DT a la pantalla de inicio.

### Lo que la auditoría dejó abierto

Honestidad sobre lo que NO está hecho, para no darlo por cerrado:

- **Sin pruebas con lector de pantalla real** (VoiceOver/NVDA). Los roles y
  las etiquetas están puestos y verificados en el DOM, pero eso no es lo
  mismo que escuchar la pantalla.
- **Las tabs no declaran `aria-controls`/`role="tabpanel"`**: el contenido
  de cada pestaña no es un contenedor único y estable, así que apuntarle
  sería mentir. Se anuncian como pestañas y se navegan con flechas, que es
  la parte que el DT usa.
- **Las tablas no tienen búsqueda ni paginación**, dos items de la checklist
  de Table. Es deliberado: los rankings ya salen recortados al top 20 y el
  filtro real del panel es el selector de equipo, que está arriba de todo.
  Si alguna tabla crece, entra la búsqueda.

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

---

## 15. Configuración de competencia · `sgadd-config.js`

Módulo **puro** (nada de `document`), requerible desde Node y testeado entero
en `test-config.js`. Contesta lo que el box score NO puede saber: cuántos
clasifican, cuántos descienden y con qué color se pinta cada zona de la tabla
de posiciones.

### La línea que no se cruza: la ESTRUCTURA sale del dato

El bloque **no declara** cuántos equipos hay ni qué torneos existen. Eso ya lo
dice el libro —`combinacionesTorneoFase()` enumera los tramos reales y el
índice cuenta los equipos— y declararlo otra vez crea una segunda fuente de
verdad que se desincroniza en silencio. Este proyecto ya se comió ese bug tres
veces: el `sheetId` en dos lados resucitando un id muerto, el rol funcional en
dos módulos dando etiquetas distintas, y el Diagnóstico armando su índice sin
torneo y contando 373 jugadores donde la app usaba 208.

`equiposEsperados` es la única excepción y es a propósito una **aserción**: no
manda sobre el dato, solo hace que config y libro se contradigan a los gritos
en el Diagnóstico en vez de callados.

### El bloque

```json
"competencia": {
  "ordenTabla": ["PCT", "DIF", "PF"],
  "formatos": {
    "regular-12": {
      "label": "Regular · 12 equipos",
      "equiposEsperados": 12,
      "zonas": [
        { "id": "campeon",   "desde":  1, "hasta":  1, "tono": "exito"    },
        { "id": "playoffs",  "desde":  1, "hasta":  8, "tono": "positivo" },
        { "id": "repechaje", "desde":  9, "hasta": 10, "tono": "aviso"    },
        { "id": "descenso",  "desde": -2,              "tono": "peligro"  }
      ]
    }
  },
  "porTramo": { "*": "regular-12" }
}
```

**Todo es opcional y el fallback es siempre seguro.** Sin bloque, con uno roto
o con un JSON a medias, `parsear()` devuelve `null` y el panel se comporta
exactamente como antes. Es la regla del punto 6 y no se negocia. Hoy solo
DEPORTIVO lo declara; Reconquista y Jujuy no, y hay tests que fijan que eso
siga siendo válido.

### Los índices negativos no son azúcar sintáctica

`desde: -2` son los dos últimos. La cantidad de equipos **cambia entre
categorías del mismo club** —Primera 12, U21 13— y un `desde: 11` fijo marca
mal en cuanto entra una con otro número, **sin ningún síntoma**: la tabla se ve
perfecta y el descenso está corrido un puesto.

`hasta` se puede omitir: con `desde` negativo llega hasta el final, con `desde`
positivo la zona es de un solo puesto.

### Gana la PRIMERA zona que calza

Es una cascada, el mismo idioma que ya usan `PERFILES_MARCA` y `JERARQUIA`, así
que las zonas se escriben de la más específica a la más general: Campeón 1-1
vive adentro de Playoffs 1-8 y tiene que ir antes.

**El choque que hay que entender antes de tocarlo**: con 10 equipos,
Reclasificación (fija 9-10) y Descenso (`-2` → 9-10) piden los mismos puestos,
gana Reclasificación y **el descenso desaparece de la tabla sin que nadie lo
note** — los diez puestos salen pintados. No es un bug del motor, es una config
equivocada para esa cantidad de equipos, y por eso `validar()` la denuncia. La
herramienta no adivina: avisa.

### `porTramo` y el `null` explícito

La clave es **`TORNEO|FASE`, exactamente la que ya produce
`combinacionesTorneoFase()`**. Cero traducción entre config y datos. Búsqueda
de lo específico a lo general:

```
TORNEO|FASE   →   TORNEO|*   →   *|FASE   →   *
```

Una clave **presente gana aunque valga `null`**, y ese null significa *este
tramo no lleva zonas*. Sin esa distinción, apagar la tabla en playoffs sería
imposible: el comodín la volvería a encender. Por eso el lookup usa
`hasOwnProperty` y no un chequeo de truthy.

### Tonos · vocabulario CERRADO, no hex sueltos

Una zona declara un **tono**, no un color. Misma decisión que `scoutTono()` y
por los mismos dos motivos: un hex no sobrevive al aplanado del papel, y no
garantiza contraste — lo que se lee sobre `#1F2937` no se lee sobre `#f1f5f9`.

| tono | pantalla | /#1F2937 | papel | /#f1f5f9 | /#ffffff |
|---|---|---|---|---|---|
| `exito` | `#4ade80` | 8,42 | `#15803d` | 4,58 | 5,02 |
| `positivo` | `#5eead4` | 9,92 | `#0f766e` | 5,00 | 5,47 |
| `aviso` | `#fbbf24` | 8,79 | `#8a5206` | 5,83 | 6,38 |
| `peligro` | `#f87171` | 5,31 | `#b91c1c` | 5,91 | 6,47 |
| `neutro` | `#94a3b8` | 5,72 | `#475569` | 6,92 | 7,58 |

Los diez pasan AA y hay un test que **los recalcula con la misma función que el
panel usa para los acentos** (`CLUB.contraste`, cargada en un `vm`): un tono
validado con otra fórmula no prueba nada sobre lo que el DT ve.

El ámbar del papel es `#8a5206` y no el `#a16207` obvio porque ese daba
**4,49**: dos centésimas por debajo. Un tono *casi* AA es un tono que no cumple.

**Los tonos NO dependen del club**, y eso es la propiedad, no un descuido: un
descenso no cambia de significado por cambiar de cliente. El acento de marca
sigue siendo otra cosa.

Las clases (`.zona-exito`…) van **a mano en el `<style>`**: la tabla la inyecta
un nodo dinámico y el scan de Tailwind es estático (punto 5 bis). En
`@media print` el tono **cambia al valor oscuro**, no se atenúa, y el
`!important` del color es obligatorio porque el aplanado hace
`body * { color: #111 !important }`.

### `.bg-accent` · el acento del club NO se pinta crudo como fondo

`.bg-accent` no llevaba `!important` (a diferencia de `.text-accent`), así que
**el dorado del tema le ganaba al acento del club** y los tres clientes tenían
la pestaña activa del mismo color — justo lo que el acento por club venía a
evitar.

Pero el arreglo **no es pintar `var(--acento)`**. Encima va texto oscuro
(`text-base`, `#0B1121`), y medido contra la marca cruda:

| club | marca | contraste del texto encima |
|---|---|---|
| Reconquista | `#f7941e` | 8,25 ✓ |
| Jujuy | `#2563eb` | **3,64** ✗ |
| DEPORTIVO | `#09086E` | **1,14** invisible |

O sea que `var(--acento)` dejaría la pestaña activa de DEPORTIVO ilegible.
Entra un token propio, **`--acento-fondo`**, que `sgadd-club.js` aclara hasta
que el texto de encima pase 4,5.

**No es un alias de `--acento-texto`**: se mide contra otro fondo y los valores
ya se separan hoy — Jujuy `#467aee` contra `#6692f1`, DEPORTIVO `#7877af`
contra `#9090be`. *"Se lee sobre la card oscura"* y *"deja leer texto oscuro
encima"* son dos preguntas distintas.

### Lo que valida el Diagnóstico

Bloque **0b · Formato de competencia**, y **no se pinta si el club no declara
el bloque**: una card diciendo "no hay nada configurado" en los dos clientes
que no lo usan es ruido permanente, y un Diagnóstico que avisa siempre se deja
de leer.

- **Descuadre de `equiposEsperados` → ERROR**, no aviso. Corre las zonas de
  puesto: con 12 declarados y 13 reales el que creías que descendía se salva, y
  la tabla se ve perfecta. No hay síntoma que lo delate.
- Zona que no alcanza ningún puesto → aviso (está declarada y no se ve).
- Formato que ningún tramo usa → aviso (config muerta: se edita creyendo que
  hace algo).
- Tramo que apunta a un formato inexistente → error (es un typo en el JSON).

**La leyenda se calcula sobre los equipos REALES**, no sobre los declarados: es
la única forma de que el DT vea dónde caen los cortes de verdad y no dónde
deberían caer.

---

## 16. Sección CLASIFICACIÓN · `sgadd-clasificacion.js`

La tabla de posiciones, con las zonas que declara el punto 15. Motor puro
(`SGADD_CLASIF`) más la UI, como el resto del proyecto.

Ruta: `#/<planilla>/<torneo>/<fase>/clasificacion`.

### Colapsó DOS funciones que hacían lo mismo

Vivían en la capa de datos vieja del `index.html`:

| | Qué calculaba | Zonas |
|---|---|---|
| `renderStandingsTable(limit)` | PJ/PG/PP/PCT/DIF y promedios | sí, **hardcodeadas** |
| `renderFullStandingsTable()` | lo mismo **+** el desglose local/visitante | no |

Cada una recorría `Base Datos E` por su cuenta y a su manera, y Principal
las mostraba a las dos, una debajo de la otra. Las zonas eran esto:

```js
if (pos <= 8) '!border-green-500';
else if (pos <= 10) '!border-yellow-500';
else '!border-red-500';
```

Ocho a playoffs para todos los clientes, todas las categorías y todos los
torneos, con colores crudos de Tailwind que además no sobreviven al papel.

Ahora hay **un solo componente** (`clasifTablaHTML`) con dos juegos de
columnas —`completa` y `resumida`— y esa era la única diferencia real que
justificaba tener dos funciones enteras.

### No recalcula nada que el índice ya tenga

`e.record` trae el récord, `e.totales` los puntos a favor y en contra y
`e.split` el desglose de local y visitante. Las dos funciones viejas
rehacían esas tres sumas a mano sobre la hoja cruda. Y como sale del
índice, la tabla queda **scopeada al tramo** sin hacer nada: antes leía de
`sheet('baseDatosE')`, que es la capa vieja.

### El desempate ahora existe

Las dos ordenaban **solo por `pct`**, así que dos equipos empatados
quedaban en el orden en que `Object.keys` los devolvía — o sea que podían
intercambiarse entre repintados sin que cambiara un solo dato. Con un
torneo que define descenso por posición eso no es cosmético.

`ordenTabla` del punto 15 declara la cascada (`PCT › DIF › PF` por
defecto) y **el último criterio es siempre el nombre**: alfabético es
arbitrario, pero es estable y auditable, que es justo lo que hace falta
cuando dos equipos empatan en todo.

`PC` es el único criterio invertido: recibir menos puntos es mejor.

### Principal resume, no duplica

Conserva su tabla resumida pero **usa el mismo componente**, así que las
dos superficies no se pueden contradecir. Su contenedor tiene `id`
(`#principalClasif`) para que `onCambio` repinte **solo eso**: Principal
vive en la capa vieja y su gráfico de ORTG/DRTG ya colgó la página una vez
con un ciclo de repintado (punto 6), así que no se repinta entero.

### Sin config la tabla sale igual

Reconquista y Jujuy no declaran `competencia`: su tabla se pinta completa
y sin colores, con un aviso que dice dónde se configura. Es la regla del
punto 6 — la config es opcional y su ausencia no puede dejar la pantalla
vacía. Verificado en el navegador con los tres clubes: DEPORTIVO 12 filas
y 12 con zona, Jujuy 17 filas sin zona, Reconquista 12 sin zona.

### El escudo va en la celda del NOMBRE, no en una columna propia

Entre el puesto y el nombre. Una columna más empuja la tabla a lo ancho y
en celular ya scrollea; así el escudo viaja pegado al nombre y la cantidad
de columnas no cambia.

**Sin escudo resuelto van las INICIALES**, y salen de `LOGOS.iniciales()`,
no de una fórmula propia: es la misma insignia que ya usan el scouting, el
scatter de Principal y los cuatro PDF, y dos implementaciones terminan
dando insignias distintas para el mismo club.

Los escudos llegan **después** del primer pintado —`getUrl()` devuelve
`null` hasta que el manifiesto baja— y eso no hace falta manejarlo acá: el
hook global `registrarRepintadoPorLogos()` repinta la sección cuando entra
alguno nuevo. Es el mismo camino que ya usan las demás.

### LA BARRA DE ZONA SE PERDÍA EN CELULAR · y no era el color, era la PROPIEDAD

Medido a 375px: la fila salía con su clase `zona-exito` correcta y el
`--zona` resuelto en `#4ade80`… y en pantalla no se veía nada.

La barra del puesto se pinta con `box-shadow: inset` sobre el
`td:first-child` (va en el `<td>` y no en el `<tr>` por el motivo del punto
14: el fondo de la celda tapa el de la fila). La **columna fija de**
**celular** usa `box-shadow` TAMBIÉN, para su separador:

```css
@media screen and (max-width: 767px) {
  .scrollbox table td:first-child { box-shadow: 1px 0 0 #282828; }  /* ← pisa */
}
```

Misma propiedad, regla posterior en el documento: la pisaba entera. En
escritorio la media query no se activa, **y por eso el bug se veía SOLO en**
**el teléfono** — que es donde el DT mira la tabla.

Se arregla **combinando las dos sombras**, no eligiendo una: la barra de
zona adentro, el separador afuera. La regla de escritorio queda intacta —
esto agrega, no reemplaza— y hay tests que fijan las tres cosas.

Es la misma familia de trampa que el punto 7.4 bis: una afordancia de
celular pisando algo que no tiene nada que ver con el celular.

### Sumar una sección cambia cómo se leen los links VIEJOS

`Ruta.parse()` distingue `#/<planilla>/<fase>/<seccion>` de
`#/<planilla>/<torneo>/<fase>/<seccion>` preguntando si `partes[3]` es una
sección conocida. Ese **vocabulario cerrado es lo único** que los separa,
así que agregar un nombre a `SGADD.SECCIONES` toca la retrocompatibilidad
de los favoritos del cuerpo técnico.

Es seguro mientras ninguna FASE se llame igual que una sección, y hay un
test que lo verifica contra `SGADD.FASES` — si alguna vez existiera una
fase `CLASIFICACION`, `#/p/CLASIFICACION/equipos` se leería como formato
nuevo y la ruta saldría mal.

---

## 17. Pantalla de CONFIGURACIÓN · `sgadd-configui.js`

Donde el cuerpo técnico ve y edita las reglas del punto 15: cuántos
clasifican, cuántos van a reclasificación, cuántos descienden y con qué
tono se pinta cada zona.

Motor puro en `sgadd-config.js`, todo lo que toca `document` acá. La
dependencia va en un solo sentido, igual que `sgadd-estados.js` /
`sgadd-buzon.js`.

### Guardar NO le cambia nada a nadie más, y la pantalla lo dice

El panel es estático: no hay backend al que escribirle. Lo que se guarda
va a `localStorage` (`sgadd.config.<club>`) y vive **solo en el navegador
de quien editó**. El botón **Exportar** da el bloque listo para pegar en
`clubes/<club>.json`, que es lo que hace que el cambio le llegue al resto.

Fingir que "Guardar" persiste para todos sería mentir, y un DT que cambia
el corte de descenso creyendo que lo cambió para todo el cuerpo técnico es
peor que uno que no tiene la pantalla. Por eso el aviso va arriba de todo.

**El override es POR CLUB, no por planilla** (a diferencia de los estados
de jugador): el formato ya lo distingue `porTramo` adentro del bloque.

### `resolver()` es el único punto de entrada, y ese fue el bug

`clasifFormatoVigente()` llamaba a `SGADD_CONFIG.parsear()` directo y **se
comía el override**: el DT bajaba playoffs de 8 a 4, guardaba, y la tabla
seguía pintando 8 sin ningún síntoma. Medido en el navegador antes del
fix — los puestos 5 y 6 seguían en verde de playoffs después de guardar.

`SGADD_CONFIG.resolver(jsonClub, torneo, fase)` toma el club activo,
resuelve override → JSON y devuelve el formato del tramo. **Todas** las
pantallas pasan por ahí, y hay un test que falla si aparece un `parsear()`
suelto en un consumidor.

`clubActivo()` también vive en el motor: con dos formas de deducir el id
del club, una lee el override de otro. Y ojo con la propiedad —
`CLUB.estado.id`, no `CLUB.ID` ni `CLUB.id`— que es el bug del punto 13.

### El reemplazo es ENTERO, no un merge

El override pisa la config del JSON completa. Fusionar zonas de dos
orígenes daría cascadas que ninguno de los dos declaró, y la cascada es
justamente lo que decide qué zona gana: el resultado no se podría auditar
contra ninguna de las dos fuentes.

Un override corrupto o vacío **se ignora y se cae al JSON**, no deja al
panel sin config.

### `hasta` se exporta OMITIDO cuando no se declaró

Reponerlo resuelto congelaría el corte a la cantidad de equipos de hoy y
el `-2` dejaría de correrse solo — que es el motivo entero de los índices
negativos. Hay un test de ida y vuelta: exportar, volver a parsear y
verificar que con 14 equipos el descenso sigue cayendo en 13-14.

### La vista previa es la TABLA DE VERDAD

Usa el mismo `clasifTablaHTML()` que pinta la sección Clasificación, no
una maqueta. Una preview que no es el componente real miente en cuanto uno
de los dos cambie, y este es justo el lugar donde el DT confía en lo que
ve antes de guardar.

### Tipear no repinta la pantalla

`configZonaCampo()` escribe el borrador y refresca **solo** la vista
previa y la validación. Un repintado por tecla le saca el foco al input y
hace imposible escribir un nombre — es la misma regla que ya cumplen
`scoutMeta()` (punto 9) y el buscador del buzón (punto 13). Los `select` y
los botones sí repintan: ahí no se está tipeando.

El borrador es una **copia profunda**: editar no puede tocar lo que el
resto de la app está usando hasta que se guarde.

### El rango resuelto se muestra al lado de cada zona

Un `-2` abstracto se ve como **11–12** con los equipos de hoy, y una zona
que no alcanza ningún puesto sale en rojo con una cruz. Es lo que deja ver
el choque de cascada **antes** de guardar — el caso de 10 equipos donde
Reclasificación se come al Descenso (punto 15).

### Los tramos son de SOLO LECTURA

Salen de `combinacionesTorneoFase()`, la misma fuente que la barra. La
estructura sale del dato y acá no se declara: si esta pantalla armara la
lista por otro camino, podría ofrecer un tramo que el selector no tiene.

### Guardar y restablecer reindexan

`SGADD_APP.reindexar()` dispara `onCambio`, que repinta Clasificación y el
resumen de Principal. Sin eso el DT guarda, va a la tabla y ve el corte
viejo.

Verificado en el navegador con los tres clubes: DEPORTIVO abre desde su
JSON con 4 zonas y las tres variantes de acento en AA; Jujuy y Reconquista
abren sin configurar, con un formato vacío para empezar a escribir y la
validación diciendo que la tabla sale sin colores.

---

## 18. Preconfiguración, calendario y certificación

Hasta el punto 15 la regla era dura: **la estructura sale del dato**. Sigue
valiendo — el dato nunca deja de mandar. Lo que se suma es poder declarar
la estructura **antes de que el dato exista**, que es otra cosa:

```
PROYECCIÓN   lo que el cliente dijo en la entrevista
REALIDAD     lo que el libro trae hoy
CERTIFICADO  la fecha en que las dos coincidieron
```

Una proyección **no es una segunda fuente de verdad**: es una hipótesis
fechada contra la cual contrastar. Si divergen gana el libro y el panel lo
dice, nunca al revés.

Motor puro en `sgadd-config.js`; la pantalla en `sgadd-configui.js` (pestaña
*Torneo*) y el semáforo en el bloque **0c** del Diagnóstico.

### Cero nombres asumidos

`categorias` es un **mapa indexado por el id que use el cliente** y los
tramos de cada una son una lista con ids libres. "Primera División",
"Formativas U17", "Súper 8", "Conferencia Sur" entran igual que "Ida".

El fixture de `test-config.js` usa a propósito nombres que no son ninguno
de los del proyecto, justamente para que un hardcodeo falle. Y hay un test
que **falla si la UI ofrece un desplegable** con nombres preconcebidos: si
la pantalla listara "Ida / Vuelta / Apertura" volvería a meter por la
interfaz el hardcodeo que el schema evita.

### EL VÍNCULO SE DECLARA, NO SE ADIVINA

Es el punto que hay que entender antes de tocar nada de esto.

La entrevista declara ids **libres**. El libro produce una clave que no se
negocia: **`TORNEO|FASE`**, la misma que arma `combinacionesTorneoFase()`.
Son dos vocabularios distintos y hay que unirlos para poder auditar.

Se unen con un campo **explícito** —`clave`— y **NO** emparejando por
parecido de nombre. Una vinculación equivocada certificaría el tramo
equivocado y **no se notaría**, que es peor que no certificar nada.
`sugerirClave()` existe para PROPONERLE una al administrador y devuelve
`null` si hay más de una candidata o ninguna.

### El bloque

```json
"preconfiguracion": {
  "cliente": "Deportivo La Plata",
  "declaradoEl": "2026-08-26",
  "declaradoPor": "Entrevista inicial",
  "categorias": {
    "primera-2026": {
      "label": "Primera 2026",
      "planilla": "deportivo-primera-2026",
      "tramos": [
        { "id": "ida", "label": "Ida", "clave": "IDA|REGULAR",
          "equiposEsperados": 12, "fechasEsperadas": 11,
          "ventanaTemporal": { "desde": "2026-05-01", "hasta": "2026-07-25" } }
      ],
      "competencia": { "…": "el bloque del punto 15, por categoría" },
      "certificacion": {
        "ida": { "fecha": "2026-08-26", "equipos": 12, "partidos": 64, "hash": "3bb12777" }
      }
    }
  }
}
```

**Todo opcional y el fallback siempre seguro**, igual que `competencia`.
Reconquista y Jujuy no declaran `preconfiguracion` y hay tests que fijan
que eso siga
siendo válido.

### `preconfiguracion` y NO `torneo` · la colisión que costó una pantalla

El JSON del club **ya tenía** un campo `torneo`: un string con el nombre
del torneo (`"TORNEO LOCAL"`, `"CONFERENCIA NORTE"`) que baja a cada
planilla del catálogo (`CATALOGO.planillas[].torneo`, lo arma
`sgadd-club.js`). El bloque de preconfiguración se bautizó con esa misma
clave y el resultado fue de manual:

- en `deportivo.json` quedaron **dos claves `torneo`** en el mismo objeto,
  el string y el bloque. Gana la última, así que **el nombre del torneo
  desapareció del catálogo sin que nadie lo notara**;
- en Reconquista y Jujuy, que solo tienen el string, la pestaña reventaba
  con `Cannot convert undefined or null to object` al pedirle
  `.categorias` a un texto — **muerta justo en los clubes que más la
  necesitan**, los que todavía no configuraron nada.

Se renombró en vez de hacerlas convivir: dos cosas distintas con el mismo
nombre en el mismo objeto es un bug esperando. Y **la guarda de tipo se
quedó igual**, porque cierra la clase entera y no solo este caso: un
`preconfiguracion` que no sea un objeto —un string, un array, `{}`—
devuelve `null` y el panel se comporta como si no hubiera bloque.

**El test no se conforma con leer el fuente: RENDERIZA la pestaña** en un
`vm` con `document` y `localStorage` de mentira, y falla si tira. Un grep
sobre el código no habría cazado esto nunca — la clave estaba bien escrita
en los dos lados.

### El estado vacío siembra el VÍNCULO, no los nombres

Sin categorías la pestaña no muestra una lista en blanco sino un cierre
con su acción (*Agregar primera categoría*), que es la regla de empty
states del punto 14.

Ese primer alta se siembra con la **planilla abierta**: id, label y
`planilla`. No contradice el "cero nombres asumidos" —el id de la planilla
lo escribió el propio club en su catálogo, y es justo el dato que ata la
categoría a su libro—. Lo que **no** se siembra es un solo tramo ni una
`clave`: ahí proponer sería inventar. Sin planilla abierta el vínculo
queda vacío, misma regla que `sugerirClave()`.

La `competencia` anidada usa **el mismo parser del punto 15**, no uno
paralelo: cada categoría puede tener su propio formato de zonas sin
duplicar nada.

### El semáforo

| | Estado | Cuándo |
|---|---|---|
| 🔵 | `PROYECTADO` | Declarado, sin datos todavía |
| 🟡 | `EN_CURSO` | Hay datos y encajan con lo declarado |
| 🟡 | `DESVIO_CALENDARIO` | Encajan, pero alguna fecha cae fuera de la ventana |
| 🟢 | `CERTIFICADO` | Se selló y el libro sigue igual |
| 🔴 | `DIVERGENTE` | No encaja, o **el libro cambió después del sello** |
| ⚪ | `SIN_VINCULO` | Declarado, sin `clave` que lo ate al libro |

**El semáforo de la UI se compara contra las claves del MOTOR**, no contra
una lista fija. Un estado nuevo en `auditar()` que la UI no sepa pintar no
se vería jamás — ya pasó al sumar `DESVIO_CALENDARIO`, y lo cazó ese test.

### La huella va sobre los IDS de partido

Ahí está el valor real de la auditoría, y por eso no es un contador.

Lo que hay que detectar es que **el libro cambió DESPUÉS de darlo por
bueno**: un partido agregado, borrado o con la fecha corregida. Los valores
de un box score pueden ajustarse sin que el torneo deje de ser el mismo; el
conjunto de partidos, no. Un contador de totales no caza el caso silencioso
—mismos totales, otros partidos— y hay un test que lo fabrica exactamente
así.

Es FNV-1a de 32 bits: no hace falta criptografía, solo que el hash cambie
cuando cambia el conjunto y que dé lo mismo en Node y en el navegador.

**Un tramo SELLADO no se re-juzga contra la proyección**, se juzga contra su
propia huella. Que la entrevista dijera 12 equipos y el torneo cerrara con
8 es historia; que aparezca un partido nuevo en un torneo cerrado es un
problema hoy.

### El sello va al JSON, no a `localStorage`

Certificar es un **hito administrativo** que el resto del cuerpo técnico
tiene que ver, y el historial de git es exactamente la trazabilidad que
pide una auditoría. Por eso `diagCertificar()` **no escribe solo**: deja el
bloque listo para pegar y commitear.

El botón solo aparece con el tramo **completo y sin sello**: certificar a
mitad de camino sella una foto que va a cambiar mañana.

> **Nota sobre el sello de Ida.** Se certificó el 2026-08-26 con **64**
> partidos cuando el tramo declara 11 fechas, o sea **66**. La huella
> congeló un libro incompleto a pedido del club, así que cuando entren los
> 2 que faltan el semáforo va a pasar a `DIVERGENTE` — y va a tener razón.
> Queda por decidir si esos partidos faltan de verdad o si la declaración
> de 11 fechas no es la correcta.

### Ventana temporal · el calendario como red de contención

Los box scores llegan con la etiqueta de torneo incompleta o mal tipeada
más seguido de lo que uno querría, sobre todo en formativas. Sin nada que
los atrape esos partidos quedan huérfanos: el índice los deja pasar (una
fila sin torneo pasa siempre, punto 3 ter) pero nadie sabe a qué tramo
pertenecen.

`asociarTramoPorFecha()` los resuelve por fecha, con **dos reglas que no se
negocian** y que tienen su test cada una:

1. **LA ETIQUETA GANA SIEMPRE.** Si la fila trae torneo se respeta aunque
   la fecha caiga en otra ventana. El calendario es un RESPALDO para lo que
   no viene etiquetado, no una corrección de lo que sí viene: pisar un dato
   explícito con una inferencia es lo que este proyecto no hace.
2. **UNA FECHA EN DOS VENTANAS NO SE ASOCIA.** Si dos tramos se superponen
   la respuesta correcta es *"no sé"*, no *"el primero"*: un partido mal
   atribuido contamina los promedios de DOS tramos a la vez y no se nota.
   Se devuelven los candidatos para poder arreglar el calendario.

Un tramo **sin ventana propia hereda la de la categoría**, que suele ser la
temporada entera. Sin fechas por ningún lado queda en `null` y el
calendario simplemente no participa: nunca se inventa una.

Las ventanas de DEPORTIVO **salen del libro, no de la imaginación**: el
primer partido de Ida es del 07/05 y el último del 16/07, Vuelta arrancó el
06/08. Hay tests que verifican que las ventanas declaradas contienen esos
partidos reales y que **no se superponen**.

### Un libro por categoría, y el hueco que eso abre

**Cada categoría de un club es un Sheet aparte**, con su propio `sheetId`.
Reconquista tiene tres. Se dan de alta de a una, a medida que el club
decide sumarlas — ver la hoja de ruta.

Eso deja un caso que no se ve solo: una planilla nueva entra al catálogo,
el DT la elige en el selector y **funciona**… pero nadie declaró su torneo,
así que no tiene calendario, ni zonas, ni auditoría. **No falla**:
simplemente no hay nada que contrastar, y el Diagnóstico se quedaba callado
justo ahí. Callarse es lo peor que puede hacer una auditoría.

`cobertura()` cruza el catálogo contra lo declarado y reporta **los dos
sentidos, porque son dos errores distintos**:

| | Qué significa |
|---|---|
| `sinDeclarar` | El libro está conectado y nadie preconfiguró su torneo |
| `sinLibro` | Se declaró una categoría para una planilla que **no está en el catálogo**: un id mal escrito, o un alta declarada antes de conectar la hoja |

Una planilla **sin `sheetId` no se reclama**: está en el catálogo como
"viene en camino" y pedirle preconfiguración sería ruido.

La card del bloque 0c **aparece aunque la planilla abierta no esté
declarada**, para poder mostrar el hueco. Un club que NO usa la
preconfiguración sigue sin ver nada: eso es config opcional.

### El aislamiento entre categorías, fijado con tests

```
✓ cada categoría trae SOLO sus tramos
✓ y ninguno de la otra
✓ un sello de una categoría no aparece en la otra
✓ las zonas de una categoría no alcanzan a la otra
```

No hay estado compartido porque no hay dónde compartirlo: el índice se
construye por planilla, y la proyección, los sellos y las zonas viven
adentro de su categoría. El calendario de Primera no puede pisar al de las
formativas porque `asociarTramoPorFecha()` recibe **los tramos de una
categoría**, no los del club.

### Las tres acciones de la pantalla, explicadas EN la pantalla

No solo en un tooltip. Hacen cosas distintas y la diferencia importa: un DT
que las confunda cree que publicó algo que no publicó.

| Acción | Qué hace de verdad |
|---|---|
| **Guardar en este navegador** | Queda en `localStorage`, solo en ese dispositivo. Nadie más lo ve |
| **Exportar el bloque JSON** | Copia el objeto limpio, listo para pegar en `clubes/<club>.json` y commitear. **Recién ahí le llega al resto** |
| **Volver al JSON del club** | Descarta el borrador local y restablece la config oficial |

El borrador del torneo es **independiente** del de zonas: son dos bloques
distintos del JSON y mezclarlos obligaría a commitear los dos para publicar
uno.

---

## 18 ter. El tramo de las ALERTAS del servidor

El proxy calcula las alertas de toda la liga (punto 13) y para eso arma su
propio índice. **Tiene que mirar el mismo tramo que el panel**: si calcula
sobre otro recorte, el buzón habla de una liga distinta de la que el DT
tiene delante.

Estaba mal de dos formas a la vez, y ningún test lo veía porque **las
alertas salían** — solo que de una liga que no existe:

1. **`torneoPorDefecto()` recibía `hojas` donde espera la LISTA de
   torneos.** Con un objeto en vez de un array, `l.length` es `undefined` y
   la función devolvía siempre `GENERAL`, que **no es un torneo sino el
   centinela de "no scopear"**. O sea que el índice salía sin scope: IDA y
   VUELTA colapsados, los promedios del segundo pisando a los del primero y
   cada jugador contado dos veces — el defecto del punto 3 ter, adentro del
   servidor.
2. **`torneosDisponibles()` no conoce al sintético `*TOTAL*`**, porque no
   sale de ninguna celda. Desde que el panel abre por el TOTAL, el cliente
   lo pide en cada carga y acá se rechazaba por inexistente — que es lo que
   destapaba el bug 1 en todas las cargas.

Medido en producción antes del fix:

```
pedí torneo=*TOTAL*   →  el servidor calculó en GENERAL   (38 alertas)
pedí torneo=IDA       →  IDA                              (31)
pedí torneo=VUELTA    →  VUELTA                           ( 0)
```

La lista buena es la de **TRAMOS** (`combinacionesTorneoFase`), la misma
que enumera el selector: incluye al sintético y además valida el PAR, que
un libro puede traer IDA y VUELTA en REGULAR y solo VUELTA en PLAYOFF.

**`GENERAL` no puede aparecer nunca como resultado de un respaldo.** Hay un
test que lo fija: es un centinela, y verlo ahí significa que las alertas
describen un índice colapsado.

---

## 18 bis. Los dos tokens de Upstash · el servidor lee, el CLI escribe

Vercel **no tiene por qué poder escribir el catálogo**: lo único que hace
con KV es leerlo. Escribirlo es tarea del CLI, que corre en la máquina de
quien administra. Con el token completo arriba, cualquier fallo de la API
podría pisar el catálogo de los tres clubes — que es exactamente la bomba
que ya se armó dos veces con `sembrar` (punto 17 de la CLI).

```
Vercel  →  URL + SOLO el token de lectura
local   →  URL + el token completo
```

`leer()` pide siempre `soloLectura: true`, así que **teniendo los dos usa
el de lectura**: el CLI no gasta el permiso de escritura en un GET.

**Una escritura con solo el token de lectura falla ANTES de salir a la
red**, con código `KV_SOLO_LECTURA`. Sin esa guarda la petición sale y
vuelve un `NOPERM` crudo: el administrador ve un error de red donde lo que
pasa es que está corriendo el CLI contra el entorno del servidor. Es el
mismo criterio que el guard de `guardar()`, que aborta antes de escribir en
vez de dejar a medias.

**Se aceptan CUATRO nombres** para el token de lectura, por lo mismo que el
completo acepta tres: Upstash bautiza distinto según por dónde se cree la
base —la consola nativa dice `UPSTASH_REDIS_REST_READONLY_TOKEN`, todo
junto y sin `API`; la integración estilo Vercel KV dice
`KV_REST_API_READ_ONLY_TOKEN`—. Exigir uno concreto es mandar a copiar
valores a mano para nada, y ya pasó dos veces con el completo.

### Dar de alta un club · probar los libros ANTES

`probar-google.js --sheets "etiqueta=ID,etiqueta=ID"` prueba varios libros
de una y **no se corta en el primero que falla**: lo que se quiere saber es
cuáles pasan y cuáles no. Distingue los dos modos de fallar, que se
arreglan de maneras opuestas:

| | Qué pasó | Cómo se arregla |
|---|---|---|
| `NO COMPARTIDA` | la Service Account no tiene acceso | compartir el libro con su mail, modo Lector |
| `NO EXISTE` | el `sheetId` apunta a la nada | corregir el id |

Los dos daban **401 por GViz**, que es lo que hizo perder una tarde con la
U21 (punto 3 ter). Por la API de Sheets se distinguen solos.

---

## 19. Roles, planes y permisos · `sgadd-auth.js`

### ESTO NO ES SEGURIDAD, Y LA DIFERENCIA IMPORTA

Es un **gate de interfaz**. El panel es estático y lee por GViz anónimo,
así que:

- los `sheetId` viven en `clubes/<club>.json`, que es un archivo
  **público**: cualquiera lo abre y lee la planilla entera sin pasar por
  el panel;
- todo el módulo corre en el navegador del usuario, así que cualquiera
  con la consola abierta se pone `plan: "PRO"` o se cambia el
  `equipoAsignado`.

Lo que **sí** hace, y es lo que vale para el producto: cada club abre su
link y encuentra SU vista sin tener que ignorar once equipos que no le
importan, el Básico ve que el módulo Pro existe y cómo pedirlo, y un cruce
de scouting no se puede armar mal por accidente.

Lo que **no** hace: impedir que alguien que quiera mirar los datos de otro
club los mire. Es la deuda del punto 10 y se cierra con backend, no con
más código acá.

Consecuencia práctica al escribir la UI: se dice *"tu plan no incluye este
módulo"*, **nunca** *"tus datos están protegidos"*. Hay tests que fijan
que el módulo declare esto por escrito.

### Los tres roles

| Rol | Cuándo | Qué ve |
|---|---|---|
| `ADMIN` | el mail está en `ADMINS` | todo |
| `CLIENTE` | hay sesión y no es admin | su equipo, según el plan |
| `ABIERTO` | **no hay sesión** | todo, como antes de que existiera este módulo |

**`ABIERTO` no es un descuido, es la única opción honesta.** No hay
autenticación: un *deny by default* no protegería nada —los datos siguen a
un `fetch` de distancia— y en cambio rompería el panel para los tres
clubes que lo usan hoy. Se llama distinto de `ADMIN` a propósito, para
poder distinguir en los tests quién entró por la puerta y quién porque no
hay puerta.

### La matriz vive en UN lugar

`MODULOS` mapea sección → requisito. No está repartida por los módulos
porque con la regla escrita en cada sección, **una sección nueva queda sin
gate y nadie se entera**. Una que falte en el mapa cae a *abierta* —igual
que antes— pero hay un test que compara las claves contra
`SGADD.SECCIONES` en los dos sentidos y falla si alguna sobra o falta.

```
principal · clasificacion · equipos · jugadores   →  abiertas
scouting                                          →  Plan PRO
simulador · configuracion · diagnostico           →  solo ADMIN
```

**Los rankings de liga NO se filtran**, y eso es la propiedad: comparar
contra la liga entera es el valor del panel, y no expone nada que la tabla
de posiciones no muestre ya. `equiposVisibles()` es para los **pickers**,
que es donde se elige a quién analizar en profundidad.

### El motivo viaja con el veredicto

`puedoAcceder()` devuelve `{ok, motivo, plan}`. Un *"no tenés permiso"*
cuando lo que falta es el plan manda al DT a pedirle acceso a alguien en
vez de mejorar el plan; y al revés, ofrecerle el Plan Pro a un cliente que
choca con el Diagnóstico lo manda a comprar algo que **no le va a dar
acceso**. Por eso `SOLO_ADMIN` y `REQUIERE_PLAN` son motivos distintos y
`SGADD_UI.sinAcceso()` escribe un texto distinto para cada uno.

Por lo mismo, **Scouting se le MUESTRA en el menú al Plan Básico**: el
punto es justamente que sepa que el módulo existe. Las tres internas se
esconden — un botón gris que no hace nada invita a clickearlo y no explica
por qué.

### El gate va DONDE SE RESUELVE la entidad, no solo en el picker

Por el picker filtrado no se llega a un equipo ajeno, pero por un **hash
pegado a mano** sí, y por el **link cruzado de Jugadores a Equipos**
también. Los dos guards están donde el módulo resuelve la entidad
(`idx.get(...)` en Equipos, `jugadoresBuscar(...)` en Jugadores), que es
el único punto por el que pasan todos los caminos.

La ficha de un jugador se resuelve **por su `EQUIPO`**, no por su nombre:
con el nombre solo, dos homónimos de equipos distintos abrirían el que no
es (punto 8).

Las dos exportaciones a PDF llevan su **propio** guard, redundante a
propósito: el archivo sale del panel y se comparte, así que es el último
lugar donde conviene confiar en que alguien filtró río arriba.

### LA REGLA DE ORO DEL SCOUTING · el lado tocado se respeta

Un cliente solo scoutea cruces donde juega su equipo. `forzarCruce(local,
visitante, ladoTocado)` **respeta el lado que el DT acaba de tocar y
fuerza el otro**. Al revés le borraría justo lo que acaba de elegir, y la
mitad de las veces parecería que el selector no anda.

```
toca LOCAL = A. Mayo        →  visitante pasa a ser su equipo
toca VISITANTE = U.N.L.P.   →  local pasa a ser su equipo
toca LOCAL = su equipo      →  el rival queda libre, no se fuerza nada
```

**Y la UI lo dice.** `SCOUT_UI.forzado` guarda qué lado se corrigió: un
selector que cambia solo y en silencio se lee como un bug. Un cruce que ya
era válido **no avisa**, porque informar de un cambio que no ocurrió es
ruido.

El motivo de la regla no es de privacidad —los dos rivales están en la
misma planilla que el cliente ya ve— sino de producto: el informe
pre-partido es para preparar UN partido propio, y armar cruces ajenos
convierte la herramienta en un servicio de scouting para toda la liga.

### De dónde sale la sesión

Sin backend no hay login, así que se **configura**. La URL gana sobre
`localStorage` para que un link armado a mano abra la vista de ese club en
cualquier navegador, y se **persiste** para que un F5 no devuelva a la
vista completa a mitad de trabajo.

```
?usuario=<mail>&equipo=<EQUIPO>&plan=BASICO|PRO
```

**`?usuario=` vacío LIMPIA la sesión**, y esa salida no es opcional: sin
ella, un cliente que entró una vez por link se quedaba con esa vista para
siempre. Es también el escape del admin que probó una sesión de cliente.

### Dos cosas que fallan cerrado a propósito

- **Un plan que no se reconoce cae a BÁSICO**, nunca a PRO. Un typo en el
  JSON no puede regalar el módulo que se cobra aparte.
- **El mail se normaliza en mayúsculas y espacios, y nada más.** NO se
  normalizan los puntos ni los alias con `+`, aunque en Gmail
  `f.reytesgn@gmail.com` sea la misma casilla: esto es una **lista de
  permitidos** y toda normalización de más ensancha quién entra. Que un
  admin tenga que escribir su mail exacto es barato.

Y la lista de admins son **mails literales**, no un patrón de dominio: un
patrón le daría admin a cualquier mail nuevo de ese dominio sin que nadie
lo decida.

### LA TRAMPA AL DAR DE ALTA UN CLIENTE · la letra del equipo

`equipoAsignado` se compara con **`claveEquipo()`**, el normalizador de
todo el proyecto, así que `DEPORTIVO LA PLATA` reconoce a `DEPORTIVO LA
PLATA - MM`. Pero **la comilla de la letra NO es decorativa**: distingue
el equipo A del B y `claveEquipo()` la conserva (punto 3).

O sea que un cliente dado de alta como `RECONQUISTA` a secas **no**
reconoce al `RECONQUISTA A` de la planilla y se queda sin ver NINGÚN
equipo — el peor modo de fallar, porque parece que el panel está roto y no
que la config lo está. `SGADD_UI.avisoSinEquipo()` lo denuncia en
pantalla, con esas palabras, en vez de mostrar una grilla vacía.

Un cliente **sin** `equipoAsignado` tampoco ve ninguno, por lo mismo:
dejarlo ver todo convertiría un error de config en acceso total sin ningún
síntoma.

---

## 20. GLOSARIO de métricas · `sgadd-glosario.js` + `sgadd-glosarioui.js`

Qué mide cada columna, en castellano. **Es público**: son definiciones, no
números de un club, y un DT que quiere saber qué mide `eFG%` no debería
necesitar un link (`MODULOS.glosario: null`).

### El archivo se GENERA, no se escribe

```bash
node generar-glosario.js     # lee el manual del MOTOR, escribe js/sgadd-glosario.js
```

Sale de `MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html`, que vive en
`C:\\Users\\Pc\\mi-motor-stats\\manuales` — o sea en el otro proyecto. Se copia y no se
lee en vivo por dos motivos: el panel es estático y no tiene acceso al disco
de nadie, y el manual cambia con el calendario del motor. Misma convención que
`generar-css.js` y `generar-manual-etiquetas.js`: se corre a mano y el
resultado se commitea. **77 entradas, cobertura 100% de las 59 `METRICAS`** del
panel, y hay un test que falla si alguna queda sin definición.

**Las columnas se mapean por NOMBRE de encabezado, no por posición.** Las
tablas del manual no tienen todas la misma forma —unas traen *Fórmula*, otras
*Para qué se usa*— y una tabla con otro formato se **saltea** en vez de
producir filas con los campos corridos, que es el modo de fallar que nadie
nota hasta que lee una definición equivocada.

**Se descarta lo que no define nada.** La tabla de referencias cruzadas repite
siglas con la hoja donde vive cada una (`4F: NET PPP`), sin nombre ni
explicación: son punteros. En el glosario salían como filas de guiones, que es
peor que no estar — el que las ve concluye que el glosario está incompleto. El
corte es tener al menos una de las tres cosas que a alguien le sirven: cómo se
lee, para qué se usa, o el nombre completo.

### El tooltip se engancha UNA vez, por delegación

En el `document`, no por celda. Las tablas se repintan enteras en cada cambio
de tramo: con listeners por nodo habría cientos y cada repintado dejaría los
viejos colgados. Un listener, sobrevive a cualquier repintado, y no hay nada
que limpiar.

**No es un `title=""`.** El nativo tarda un segundo largo, no se puede leer con
el teclado y en una tabla de veinte columnas queda tapado por el cursor.

Reglas que hay que respetar al tocarlo:

- **Una cabecera ordenable se marca con `data-metrica`, no se deja al
  reconocimiento por texto.** La flecha de orden (`⇅` `▲` `▼`) vive DENTRO
  del `th`, así que su `textContent` deja de coincidir con la sigla. Medido en
  producción antes del fix: **cero cabeceras reconocibles** en los dos
  rankings. Hay un test que exige además que las 35 columnas rankeables tengan
  definición — sin eso el subrayado punteado promete un tooltip que no aparece.
- **El texto suelto solo se acepta si coincide EXACTO** con una sigla y mide
  ≤ 12 caracteres: sin eso, cualquier celda que dijera "PTS" —el apodo de un
  jugador, una nota— abriría un tooltip donde no corresponde.
- **Responde al foco además del mouse** y cierra con ESC (punto 14).
- **En papel no se imprime**: sin hover sería un recuadro suelto en la hoja.
- **La definición corta prefiere `lectura` sobre `nombre`.** El nombre completo
  de `eFG%` no le dice nada a quien no lo sabe ya; lo que sirve es qué
  significa el número.
- **Tipear no repinta la sección**, solo la tabla: la misma regla del buscador
  del buzón y de los campos de scouting.

### Sumar una sección toca DOS listas

`SGADD.SECCIONES` (el vocabulario del router, punto 16) **y** `VALID_SECTIONS`
en el `index.html`. Con la segunda sin actualizar el item del menú se dibuja y
no navega — sin ningún síntoma.

---

## 21. El RANKING DEL PLANTEL

Las mismas ocho tablas del top 20, pero adentro de un equipo. Va debajo de las
cards de Jugadores y solo con un equipo elegido. Contesta otra pregunta: no
*«quién manda en la liga»* sino *«cómo se reparte esto entre los míos»*.

**Se comparte el motor.** `jugadoresRanking()` recibe un `pool`: el criterio de
selección, el desempate, los nulos al fondo y la mediana del propio top valen
igual adentro de un plantel que adentro de la liga. Dos implementaciones que
ordenen distinto son el bug que este proyecto ya se comió con el rol funcional
(punto 8). Sin `pool` el universo sigue siendo la liga, y hay un test que
compara el top 20 fila por fila para fijarlo.

**NO se filtra por minutos.** En la liga el umbral existe para que el top 20
signifique algo; adentro de un plantel de quince deja seis, y el DT que abrió
el plantel quiere el plantel — las cards de arriba ya los muestran a todos, así
que una tabla con la mitad se lee como datos que faltan. Los que juegan poco
quedan al fondo solos, que es lo que el orden tiene que decir.

**Se va sola al abrir una ficha**, sin guarda propia: `jugadoresGrilla` no se
llama cuando hay un jugador abierto. Una segunda condición para lo mismo es un
lugar más donde desincronizarse.

Tres detalles más: la columna **Equipo se saca** (adentro de un plantel dice
doce veces lo mismo y el ancho no sobra); el **estado es propio**
(`plantelRanking*`), porque un *«por RD»* elegido en la liga no significa lo
mismo en un plantel de doce; y con **menos de 4 jugadores no se dibuja**, que
ahí la tabla diría lo mismo que las cards con más ruido.

El **toggle de promedios/totales se ofrece según la cobertura de ESTE plantel**,
no la de la liga: un equipo puede tener el acumulado completo en un libro donde
el resto no.

---

## 22. Módulo COMPARATIVA · especificado, no implementado

[`ESPECIFICACION_COMPARATIVA.md`](ESPECIFICACION_COMPARATIVA.md) traduce a
estructura de datos los **6 informes reales de Jujuy** que el cuerpo técnico
armaba a mano en Canva. La misma relación que hay entre los PDF de *REPORTE
SCOUTING* y la sección Scouting.

Lo que hay que entender antes de encararlo: **un informe de ciclo no es una
foto de la temporada, es la comparación de dos cortes** de N partidos (4 en los
informes 4 y 5, 5 en el 6 — la ventana es un parámetro, no una constante). Y
**tendencia y status son ejes distintos**: la primera es el delta contra el
ciclo anterior, el segundo el nivel contra la liga. Un equipo puede venir
subiendo y seguir último.

Los PDF están en `.gitignore`: pesan 7,4 MB y son material del cliente.

---

## 23. EL BUG QUE BORRABA LAS CLAVES · un KV ilegible

Dejó a un administrador afuera con su propia clave, y el modo de fallar era
perfecto: **entraba bien la vez que la fijaba** —la escritura y la lectura
siguiente son consecutivas— y no podía volver a entrar después.

`kv.leer` se traga el error y devuelve `{valor: null}`, así que
`admins.cargar()` no podía distinguir *«KV no contesta»* de *«todavía no hay
nadie»*. La cadena completa:

```
la lectura falla  →  padrón {}  →  «mail o clave incorrectos»
                  →  anotarFallo({})  →  se ESCRIBE {mail:{fallos:1}}
```

y ahí se iban los hashes de los tres administradores, **sin ningún síntoma**.

Ahora `cargar()` **lanza**, el login contesta **503** en vez de opinar sobre
una clave que no pudo mirar, y no se escribe nada. Es la misma regla de
siempre: un dato ausente se muestra ausente, no se reemplaza por uno
inventado.

**La CLI también.** Antes imprimía «sin acceso» para los tres, que es justo
lo que uno hace antes de invitarlos de nuevo y pisarles la clave.

Hay un test que lo caza al revertir el fix. Y el circuito completo —fijar →
entrar → salir → volver a entrar, con un intento fallido en el medio— se
ejerce sobre los handlers de verdad con un KV de mentira.

### El ojo del campo de clave

Ataca la otra mitad del problema: la clave se elige **una vez, a ciegas**, y
después hay que reproducirla exacta contra un servidor que contesta lo mismo
para «clave incorrecta» que para «mail que no existe» (eso es a propósito:
distinguirlos diría cuáles de los tres mails son administradores). Un espacio
de más al final deja a la persona afuera sin forma de darse cuenta.

Arranca **oculta**, el estado es **por campo** (en el alta conviven el código
y la clave nueva), y al alternar **devuelve el foco con el cursor al final**:
cambiar el `type` recrea el nodo, y sin reponerlo se sigue escribiendo en el
vacío.

**Y el ojo se deshabilitaba solo al tipear.** `campo()` refresca el botón de
enviar en cada tecla y lo buscaba con `.login-caja button` — el PRIMER botón
de la caja, que con la llegada del ojo dejó de ser el de enviar. Andaba
perfecto hasta que hacía falta, y no dejaba un error en consola. Un selector
posicional se rompe callado en cuanto alguien agrega un elemento antes: ahora
el botón tiene `id`.

Lo destapó verificar en producción con la **secuencia real** —tipear y
después tocar el ojo— y no con el clic suelto, que funcionaba.

---

## 24. LAS TRES TASAS DEL JUGADOR CON DENOMINADOR DE EQUIPO

`ACUMULADO J` trae 32 columnas contra las 53 de `PROMEDIOS J`. El TOTAL
repone casi todas recalculando sobre los totales del propio jugador, **salvo
tres**: `USG%`, `RO%` y `RD%`, cuyo denominador es del equipo. Sin ellas el
TOTAL las dejaba en blanco para todos — y como el TOTAL abre el libro (punto
3 ter), la tarjeta **USO** de la ficha salía vacía de entrada.

```
RO%  = RO_jug   / (RO_equipo + RD_rival)
RD%  = RD_jug   / (RD_equipo + RO_rival)
USG% = (PLAYS_jug × MIN_equipo/5) / (PLAYS_equipo × MIN_jug)
```

**LAS TRES SE VERIFICARON CONTRA LA PLANILLA REAL** (DEPORTIVO · IDA), no se
dedujeron. Y la de rebote **no es la tasa on-court que uno esperaría**: el
motor mide la porción que el jugador se lleva de TODO lo que el equipo tuvo
disponible en la fase, sin prorratear por minutos. Reproducir al motor manda
sobre mejorarlo — la hoja es lo que el club audita. Hay un test que exige que
el número NO coincida con la versión prorrateada, que es el error que uno
comete si deduce la fórmula en vez de medirla.

Se trabaja con **totales de los dos lados**: mezclar un total con un promedio
da un número plausible y equivocado por un factor PJ.

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

## 26. Sección COMPARATIVA · `sgadd-comparativa.js` + `sgadd-comparativaui.js`

La réplica calculada de los 6 informes de ciclo que el cuerpo técnico armaba a
mano en Canva. La especificación de dónde sale cada bloque está en
[`ESPECIFICACION_COMPARATIVA.md`](ESPECIFICACION_COMPARATIVA.md).

**Es exclusiva de ADMIN** (`soloAdmin`), como Simulador, Panel Master y
Diagnóstico: cruza ciclos de cualquier equipo de la liga, que es justo lo que el
gate del cliente acota.

### La distinción que sostiene el módulo entero

```
TENDENCIA  =  el delta contra el ciclo ANTERIOR   ¿mejoró?
NIVEL      =  dónde está parado contra la LIGA    ¿alcanza?
```

**Son dos ejes y van en dos columnas.** Un equipo puede venir subiendo y seguir
último, y puede caer fuerte y seguir siendo primero. Medido con DEPORTIVO real:
su ciclo actual es **4-0** y aun así el `eFG%` se derrumbó de 57,4% a 39,9% —
tendencia en rojo— mientras el `NET RTNG` sigue **2º de la liga**. Colapsarlos en
un solo semáforo pierde exactamente esa lectura.

### Lo que hay que respetar al tocarlo

- **La ventana es un PARÁMETRO**, no una constante: 4 en los informes 4º y 5º, 5
  en el 6º. El default es el `PARTIDOS_POR_CICLO` del plan ORO.
- **El signo se corrige por la DIRECCIÓN de cada métrica.** Bajar las pérdidas
  es mejorar; pintarlo de rojo por «bajó» es el error que el proyecto ya evita
  en los rankings invertidos. Las invertidas son `PePP%`, `RO Opp%`, `RTNG DEF`
  y `eFG Opp%`.
- **Las críticas se ordenan por el cambio RELATIVO.** Con el absoluto ganarían
  siempre las de escala grande —un rating se mueve en decenas y un porcentaje en
  centésimas— y la lista sería siempre la misma.
- **El NIVEL se mide contra la temporada de los rivales, no contra su ciclo.** Un
  puesto calculado sobre cuatro partidos de cada equipo sería ruido. La fila
  mezcla dos ventanas a propósito y la pantalla lo rotula.
- **Un partido sin fecha no entra a ningún rango**, y se cuenta aparte para
  avisarlo (misma regla que el calendario del punto 18). A un ciclo sí entra:
  ahí el corte es por posición.
- **El volumen del corte se muestra siempre.** Un `T3%` de 24,8% con 113
  intentos y otro con 20 no significan lo mismo, y sobre cuatro partidos eso
  pesa más que en ninguna otra pantalla.

### Jugadores · NO se ordena de mejor a peor

Dos jugadores no se ordenan: se distinguen. El bloque dice **en qué se separan**,
medido en relación a la escala de cada métrica, y **sin contar `MIN` ni `PJ`** —
describen la muestra, no el juego, y separan siempre. Con empate no gana nadie:
marcar uno al azar diría algo que el dato no dice.

El tope son **tres**: con cuatro la tabla deja de entrar a lo ancho. Al llegar al
tope se descarta el más viejo en vez de ignorar el clic — ignorarlo se siente
como si la pantalla estuviera rota.

### El tab «Comparar Jugadores» de Scouting se mudó acá

Era la comparativa legacy de dos filas de `PROMEDIOS J` y contestaba otra
pregunta que el informe pre-partido. Tenerla ahí obligaba a entrar a Scouting
para algo que no es scouting, y dejaba **dos comparadores distintos** en la app.
Scouting quedó como una sola cosa y perdió su barra de pestañas: una pestaña
sola no es una elección.

`buildScoutingCompare` y su cadena quedan en el `index.html` sin llamador. Se
limpian aparte: sacar ese hilo entero en la misma vuelta que se agrega una
sección es cambiar dos cosas a la vez.

---

## 27. La redirección post-login, y por qué no pasaba nada

**El destino lo decide el ROL**: el admin va al Panel Master —entra a
administrar— y el cliente a Principal con su `?club=`, que sale de su token.
Sin ese parámetro el panel cargaría el club por defecto, que no es el suyo.

Dos defectos en el camino, los dos silenciosos:

1. **`esLanding()` seguía siendo `true`.** Miraba solo si había `?club=`, y el
   token del admin no lleva club —el Panel Master es de todos los clientes—, así
   que entraba, se quedaba sin `?club=` y el router le devolvía la tarjeta
   explicativa de la landing en TODAS las secciones, el Panel Master incluido.
   Ahora **con sesión abierta no hay landing**: la bienvenida es la puerta del
   que todavía no entró.
2. **`rol()` devuelve un string, no un objeto.** `rol().rol` daba `undefined`,
   el `try/catch` ni se enteraba y todos iban a Principal.

El test EJERCE `destino()` con un token de admin y otro de cliente, y para eso
tiene que exponer `global.SGADD_AUTH`: sin eso el `try/catch` se traga el
`ReferenceError` y el test pasaría por el camino equivocado sin probar nada.

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

## 29. LOGIN DE CLIENTES · `server/lib/clientes.js`

Un club entra ahora con su mail y su clave. El link firmado sigue
funcionando —es lo que usan los tres clubes de hoy— pero deja de ser el
único camino, y sobre todo deja de ser uno que no se puede revocar.

### Por qué son DOS padrones y no uno

```
QUIÉN ES ADMIN     →  `ADMINS`, en el CÓDIGO. Re-derivado en cada petición.
QUIÉN ES CLIENTE   →  KV. Es dato: el Panel Master lo edita todos los días.
```

No es un detalle de implementación, es la propiedad de seguridad: un KV
comprometido **no alcanza para inventar un administrador**. Sí alcanza para
darse de alta como cliente de un club — y eso da lo que ese club ve, que es
exactamente lo que el gate de interfaz protege (punto 19). No da
administración, y no da otro club.

**Los hashes NO viven en el catálogo.** El catálogo se sirve por
`GET /api/v1/catalogo` a cualquiera con token; los mails de un club ahí
adentro le contarían a cada cliente quiénes son los del resto. Van en
`sgadd:clientes` y solo salen por `/api/v1/clientes`, con gate de ADMIN.

### El cupo

**Una sola tabla**, `SGADD_AUTH.CUPO_MAILS` (Bronce 2 · Plata 3 · Oro 4), en
el motor compartido. La landing la **lee** en vez de repetirla y el servidor
la hace cumplir. Con dos tablas la que se relaja es siempre la del servidor
—que es la que decide— y el cliente termina con más accesos de los que paga,
o con menos de los que le prometieron.

**El plan sale del CATÁLOGO, no del pedido.** Si lo mandara el navegador, el
cupo lo decidiría justamente quien lo quiere saltear. Hay un test que lo
intenta.

Y **el cupo lo valida el servidor**, no la pantalla: la pantalla lo muestra
para que el admin no llegue al tope de sorpresa, pero una validación que solo
vive en el navegador no es una validación.

### Reglas que hay que respetar al tocarlo

- **Un mail está en UN club.** Con el mismo en dos, el login tendría que
  adivinar cuál abrir. Si alguien trabaja en dos clubes, se le da un mail por
  club.
- **Un administrador no se da de alta como cliente**: ya entra por su puerta
  y con más permisos, así que darlo de alta le ACOTARÍA la vista y gastaría
  un cupo del club.
- **El plan y el equipo del token salen del catálogo**, no del registro del
  mail: guardarlos ahí los congelaría el día del alta y un upgrade no le
  llegaría a quien ya estaba dado de alta — que es el caso que más importa.
- **`FALTA_CLAVE` se distingue del resto**, y no filtra el padrón: para
  llegar ahí hay que traer el código, que es un secreto de 256 bits. Sin esa
  rama, el cliente recién invitado lee «mail o clave incorrectos», mira el
  formulario que le pide una clave que no tiene, y concluye que le dieron mal
  el acceso. La pantalla lo lleva derecho a elegirla.
- **Reinvitar NO le borra la clave** que ya tenga: mientras no canjee el
  código nuevo, la vieja sigue sirviendo. Invalidarla de entrada dejaría
  afuera a alguien que está entrando bien, por un click de más.
- **El código se muestra UNA vez.** El servidor guarda su huella, no el
  código: si se pudiera volver a leer, KV pasaría a ser suficiente para
  entrar como cualquier cliente.
- **Un KV ilegible no borra accesos.** `cargar()` lanza y el login contesta
  503, igual que el padrón de admins — es el bug del punto 23 y no se repite.

### La sesión del cliente dura MÁS que la del admin

Siete días contra doce horas, y es a propósito: el DT abre el panel en el
banco de suplentes y en el vestuario, muchas veces por semana, y hacerlo
escribir la clave cada doce horas convierte la herramienta en un trámite. El
riesgo también es menor — lo que ve es su propio club, que es lo mismo que
ya veía con un link firmado que no se podía revocar.

### El helper que no estaba declarado

`escJs` se usó en los handlers inline de la lista de mails sin declararlo, y
cada repintado tiraba un `ReferenceError` que **el `.catch` del fetch se
tragaba**: el alta funcionaba y la pantalla mostraba «escJs is not defined».
Medido en producción. Hay un test genérico que verifica que todo helper que
el hub usa esté declarado — no solo ese.

---

## 30. NADA DEL PANEL MASTER SE APLICA EN SILENCIO · `sgadd-confirmar.js`

Todo cambio del Panel Master se ve en la sesión del cliente en su próxima
carga. No hay staging: lo que se manda, manda. Antes un clic en «Pausar» le
cortaba el acceso en el acto, y la baja preguntaba «¿seguimos?» con un
`confirm()` nativo que no decía QUÉ.

El modal **enumera** el cambio campo por campo —«Plan: PLATA → ORO», «Acceso
eliminado: mail@ejemplo.com»— y avisa que repercute en el cliente. Esa es la
diferencia entre confirmar y leer.

### Lo que hay que respetar al tocarlo

- **La petición vive en `alConfirmar`, no en `abrir`.** Si saliera antes, el
  modal sería un cartel y no una confirmación. Es la propiedad entera del
  módulo y hay un test que la fija.
- **No se compara el objeto entero.** Un `JSON.stringify` distinto no le dice
  nada a nadie, y dispararía por cualquier campo que el servidor toque por su
  cuenta —un contador, una fecha de último ingreso— que no es un cambio del
  admin. Se compara campo por campo, con etiquetas en castellano.
- **Vacío contra vacío no es un cambio**, aunque uno sea `null` y el otro
  `''`: el servidor y el formulario representan «sin dato» distinto y eso no
  es una decisión de nadie.
- **Los mails se comparan como CONJUNTOS**: el orden en que el servidor los
  devuelve no es una decisión del admin.
- **Sin cambios, el botón se apaga.** Mandar una petición que no cambia nada
  es ruido en el log y una escritura de más en KV.
- **Se cierra ANTES de disparar.** La petición puede tardar, y un modal
  congelado encima de la pantalla que se está actualizando se lee como que
  algo se colgó. El resultado lo muestra la tarjeta del club.
- **Sin el módulo cargado la pantalla sigue andando**: es una mejora, no una
  dependencia dura.

### Las zonas no se difean zona por zona

Se contaron los intentos y no vale la pena: una zona se identifica por su
`id`, y el DT le cambia el id tanto como los cortes, así que el diff fino
termina diciendo «se borró playoffs, se creó playoff» para un cambio de
nombre. Lo que sirve —y es lo que hay que confirmar antes de publicar— es el
**resumen**: qué formatos hay, cuántas zonas tiene cada uno y con qué cortes,
con los negativos leídos en castellano («los 2 últimos»).

---

## 31. PUBLICAR LAS ZONAS · la cascada de tres niveles

```
1. BORRADOR de este navegador   ·  lo que el admin está probando
2. PUBLICADO en el catálogo     ·  lo que el club ve hoy
3. clubes/<club>.json           ·  el respaldo del repo
```

**Son dos acciones y no una con un tilde.** Probar un corte y publicarlo son
momentos distintos del trabajo: el admin mueve zonas varias veces antes de
estar conforme, y cada una de esas veces no tiene por qué verla el club.

El JSON del repo **no se toca** y sigue siendo el respaldo: un club que nunca
publicó nada funciona exactamente como antes, y la exportación sigue estando
porque el historial de git es la única trazabilidad real del proyecto.

**Nunca se fusionan dos niveles**: el que gana, gana entero. Mezclar zonas de
dos orígenes daría cascadas que ninguno declaró, y la cascada es justo lo que
decide qué zona gana.

**Publicar vacío borra lo publicado** y devuelve el club al archivo: es la
única forma de deshacer sin tener que adivinar cómo era antes. Un bloque sin
formatos se rechaza con ese mensaje, porque publicarlo se leería como «se
rompió» y no como «lo vacié».

**Las zonas van para TODOS y no solo para el admin.** No son información
comercial: son cómo se pinta la tabla del cliente, y dejarlas del lado del
admin haría que publicar no sirviera de nada. El plan y el vencimiento sí
siguen siendo solo del admin.

> **Y durante semanas publicar NO SIRVIÓ DE NADA**, que es justo lo que
> este párrafo decía evitar: el servidor mandaba las zonas a todos, pero
> el PANEL solo pedía el catálogo con sesión de admin. Un cliente nunca lo
> leía y su tabla caía al JSON. Medido y corregido el 2026-09-11 — ver el
> punto 54.

---

## 32. SUBCLIENTES · cada categoría con sus propias zonas

Un club puede correr varias categorías con torneos que no tienen nada que
ver: Reconquista tiene Primera, U21 y U23, cada una con su libro.

**El bloque `competencia` era del CLUB entero**, y como las claves de
`porTramo` son `TORNEO|FASE`, dos categorías con la misma clave —y
`GENERAL|REGULAR` es lo más común de todo— compartían zonas sin que nadie lo
pidiera: **bajar el descenso en Primera se lo bajaba también a la U21**.

`competencia.porCategoria[<planillaId>]` lo scopea. Tres reglas:

- **Es ADITIVO y degrada solo.** Un club que no lo declara se comporta
  exactamente como antes, y una categoría que no está en el mapa cae al
  bloque del club — que es lo correcto para un club de una sola categoría,
  donde separarlas sería pedirle al DT que declare dos veces lo mismo.
- **Se parsea con el MISMO parser, recursivamente.** Cada sub-bloque tiene la
  forma de un `competencia` entero porque una categoría es una competencia
  distinta, no un recorte de otra. Con un parser propio, el día que se agregue
  un campo habría que acordarse de tocar dos lados.
- **La recursión es de UN nivel**: una categoría no tiene sub-categorías, y
  aceptarlo sería prometer una jerarquía que nada más soporta.

**El cupo de mails sigue siendo del CLUB entero**, no por categoría: se cuenta
por `club` en el padrón y las categorías no participan. Reconquista en ORO
tiene 4 mails para las tres categorías, no 4 por cada una.

`resolver()` devuelve además `propio`, que dice si la categoría tiene reglas
suyas o hereda las del club: sin eso el DT no puede saber si lo que edita le
cambia la tabla a las otras.

---

## 33. `data-glosa` · cuando la misma sigla significa otra cosa

En la tabla de posiciones `PP` es **Partidos Perdidos**. En el glosario del
motor, `PP` es **Pérdidas** — cierto en el box score y falso en esa tabla.

Un tooltip que dice algo verdadero en otra pantalla es peor que no decir nada,
así que `data-glosa` lleva la definición literal de la tabla que la escribe y
**gana sobre el glosario**. No se agregan al glosario: ahí `PP` ya está, y
ocupado.

Las catorce columnas de la tabla de posiciones la llevan. `Equipo` no: no es
una sigla y explicarla sería ruido — sin `data-glosa` el tooltip ni la
considera.

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

## 36. EL RESALTE DEL EQUIPO PROPIO NO VA EN EL RANKING DEL PLANTEL

Sirve para encontrar a los tuyos entre doce equipos rivales, que es lo que
hace el top 20 de la liga. Adentro de un plantel son **todos** del mismo
club: pintarlos a todos de naranja no distingue a nadie, y encima le compite
al único resalte que ahí sí informa — la columna por la que se está
ordenando.

Se decide por `r.ambito`, que ya viajaba en el resultado del motor.

---

## 37. PUBLICAR, GUARDAR Y EXPORTAR · las tres, explicadas en la pantalla

| | Qué hace de verdad |
|---|---|
| **Publicar en el cliente** | Lo escribe en el servidor. El cliente lo ve en su próxima carga, sin que nadie toque el repositorio. **Es la vía automática.** |
| **Guardar en este navegador** | Queda en ESE navegador, para probar. Nadie más lo ve. |
| **Exportar el bloque JSON** | El bloque para pegar en `clubes/<club>.json` y commitear. Deja el cambio en el historial de git. |

**Publicar va solo arriba y en el color de acento.** Las cuatro estaban en
fila, del mismo tamaño y con «Guardar en este navegador» primero: la única
que le cambia algo al cliente quedaba tercera y parecía una más.

Y se dice **por qué exportar es manual**: el navegador no puede escribir
archivos del repositorio. Sin esa línea, el paso se lee como una molestia y
no como un límite.

La preconfiguración lleva su propia nota arriba de todo: es la pantalla más
abstracta del panel —declara una estructura que todavía no tiene datos— y sin
decir que de ahí salen las Posiciones, la Clasificación, las rachas y el
Simulador, se lee como un formulario administrativo.

---

## 38. ROTAR EL TOKEN DE UPSTASH SIN CORTAR NADA

El procedimiento está en
[`ROTAR_TOKEN_UPSTASH.md`](ROTAR_TOKEN_UPSTASH.md). Acá va por qué es así.

Rotar una credencial de un servicio **que está sirviendo** tiene un agujero
conocido: entre que se genera la nueva y que el servidor la lee hay
peticiones en vuelo. Y en Vercel «el servidor» son varias instancias que se
reciclan cuando quieren, así que la ventana **no es un instante** — puede
durar minutos.

Con un segundo nombre de variable —`*_TOKEN_LEGACY`— esa ventana desaparece:
se pone el nuevo, se deja el viejo, y cada petición prueba el nuevo y cae al
viejo si hace falta.

### Las reglas del fallback

- **El NUEVO se prueba primero.** Al revés, el viejo seguiría sirviendo todo
  y la rotación no se completaría nunca: el healthcheck diría que anda y el
  token que se quiso revocar seguiría siendo el que trabaja.
- **Solo se reintenta por PERMISOS** (401, 403, `NOPERM`). Un timeout o un
  500 no: ahí el token está bien y repetir solo duplica la espera del que
  está del otro lado.
- **El legacy cuenta para `configurado()`**: durante la rotación puede ser
  el único que anda, y un `false` ahí apagaría la escritura entera.
- **Un token repetido en las dos variables se prueba una sola vez.**
- **Es una variable de TRANSICIÓN.** Si queda puesta, el token que se quiso
  revocar sigue vivo y la rotación no rotó nada. El healthcheck lo dice.

### LO QUE PASÓ AL ROTAR DE VERDAD (2026-09-01)

**«Rotate token» de Upstash revoca el viejo en el acto.** No hay periodo de
gracia, así que el slot legacy —que existe para cubrir la ventana entre
generar y desplegar— no sirvió: el viejo ya contestaba `401 WRONGPASS` antes
de empezar.

Producción estuvo sirviendo desde el respaldo (`origen: codigo`) hasta que
entró el nuevo. **El panel no se cayó** —para eso está la cascada, y los
`sheetId` viven también en las variables de entorno— pero durante esa ventana
el login por clave, el alta de clientes y publicar zonas no funcionaban.

Se detectó por el aviso que ya viajaba en la respuesta del catálogo:
`No se pudo leer el catálogo de KV (KV_TOKEN)`. Sin ese aviso, el síntoma
habría sido «el Panel Master no guarda nada» sin ninguna pista.

**La regla que queda**: generar el token nuevo recién cuando se está en la
máquina lista para ponerlo. Y el slot legacy sigue valiendo solo para el caso
en que se puedan tener dos tokens vivos a la vez.

### El healthcheck prueba permisos, no conectividad

```bash
node server/bin/kv-salud.js              # solo lee
node server/bin/kv-salud.js --escribir   # ida y vuelta completo
```

Un token nuevo puede entrar con permisos distintos —solo lectura, o sin
acceso a una base— y eso **no se nota hasta que alguien da de alta un
cliente y el alta se pierde**. Por eso lee las dos claves que sostienen el
producto (el padrón de clientes y el catálogo con sus zonas publicadas) y
verifica la tabla de cupos.

**La escritura va sobre una clave PROPIA** (`sgadd:salud`), nunca sobre el
padrón ni el catálogo: una verificación que puede romper lo que verifica no
sirve. Y la limpia al terminar.

---

## 39. CON KV CAÍDO EL PANEL NO SE CAE · y ahora lo dice

La cascada ya era la resiliencia —KV → variable de entorno → el literal del
código para el catálogo, y borrador → publicado → `clubes/<club>.json` para
las zonas— así que el cliente **siempre** ve su tabla con el último respaldo
del repo. Lo que faltaba era decírselo al admin.

El Panel Master muestra **«Servicio KV en línea»** o **«Modo respaldo JSON
activo»**. Y en el segundo caso lo importante no es que KV se cayó sino
**qué deja de poder hacer**: publicar y dar de alta NO se van a guardar. Sin
eso, el admin toca «Publicar», ve el error y no sabe si es su cambio o el
servicio.

Va como badge discreto y no como cartel: el 99% de las veces está en línea, y
un cartel permanente se deja de leer.

**Lo que SÍ deja de andar con KV caído**: alta y baja de clientes, publicar
zonas, el login por mail y clave (el padrón vive en KV) y las alertas que
calcula el servidor. Los links firmados siguen funcionando: no tocan KV.

---

## 40. EL TRAMO SE CONSERVA AL CAMBIAR DE CATEGORÍA

Un club multicategoría —Reconquista corre Primera, U21 y U23— hace que el DT
salte entre libros todo el tiempo. Cada salto lo devolvía al tramo por
defecto del libro nuevo: si estaba mirando la IDA, tenía que volver a
elegirla en cada categoría.

`estado.preferencia` guarda lo que eligió **a mano** y `tramoPreferido()` lo
traduce al libro nuevo:

1. el **par exacto** `TORNEO|FASE`, si existe;
2. si no, la **misma FASE** con el mejor torneo del libro nuevo — la fase es
   lo que el DT eligió conceptualmente («quiero ver los playoffs») y el
   torneo es cómo lo llama cada categoría, que no tiene por qué coincidir;
3. si no hay nada parecido, el default. Inventar un tramo que no existe deja
   la vista vacía sin decir por qué.

**Se guarda SOLO lo elegido a mano**, en `cambiarTramo()`. Si se guardara el
default, la preferencia sería siempre la del primer libro que se abrió y el
criterio de `tramoPorDefecto` —que elige por cobertura y cambia de libro en
libro— dejaría de correr. Y NO se graba desde `cambiarFase`/`cambiarTorneo`,
que los usa el ruteo: recordar una navegación como si fuera una decisión
haría que un link viejo le fijara la preferencia a quien lo abre.

**El hash sigue ganando** sobre la preferencia: un link compartido tiene que
abrir donde dice el link.

Verificado en producción con las tres categorías reales: eligió `IDA`, la
U21 (que solo tiene `GENERAL|REGULAR`) cayó a su único tramo, y al volver a
Primera recuperó `IDA` en vez de abrir en el `*TOTAL*` por defecto.

**El toggle de promedios/totales ya sobrevivía**: vive en el estado del
módulo y nada lo resetea. Lo que sí faltaba era que `plantelRankingModo`
estuviera DECLARADO — andaba por `undefined` cayendo a `'promedio'`, y una
clave de estado que no figura en el objeto es de las que se pierden en la
próxima edición sin que nadie lo note.

---

## 41. EL JSON DEL CLUB · el archivo que rompió y las cuatro guardas

El 2026-09-01 `clubes/reconquista.json` dejó de parsear. El bloque de
zonas se había pegado a mano por la web de GitHub y quedó cerrando el
objeto raíz: la llave del final de `competencia` **no llevaba coma**
antes de `"planillas"`.

**El síntoma es lo que hay que recordar: la app NO se cayó.** `cargar()`
del club atrapa el error y sigue con los valores por defecto, así que
Reconquista estuvo viendo la marca, los colores y las zonas de otro club
—y su Panel Master mostrando «EQUIPOS ESPERADOS —» y «Sin zonas»— sin que
nada dijera que su configuración estaba rota. Es el peor modo de fallar
que tiene este proyecto: no se rompe, miente.

La degradación es correcta y se queda (punto 6: la config es opcional y
no puede tumbar el panel). Lo que faltaba era todo lo demás.

### 1 · Un JSON de club roto no puede llegar a `main`

`test-jsonclub.js` recorre `clubes/*.json` y exige que **cada uno**
parsee, declare `id` y `planillas`, y no arranque con BOM —que es
invisible al ojo y lo puede meter un editor web—. Era el test barato que
no estaba.

### 2 · El export es el ARCHIVO ENTERO, no un fragmento

Ésta es la corrección de fondo. La pantalla daba `"competencia": {…}`
para empalmar al lado de `"planillas"`, o sea que **acertarle a la coma
quedaba del lado del que pega**. El generador nunca produjo JSON
inválido; el formato del entregable era el que invitaba al error.

`exportarArchivo(jsonClub, competencia)` devuelve
`clubes/<club>.json` completo, listo para **reemplazar**. No hay nada que
empalmar.

Dos detalles que no son cosméticos:

- **El bloque se reemplaza EN SU LUGAR**, conservando el orden de claves
  del archivo. Un diff que mueve treinta líneas esconde el cambio real.
- **Se conservan TODAS las claves**, incluidas las `//` de comentario. Si
  al pegarlo se perdiera una planilla o el escudo, el remedio sería peor
  que la enfermedad.

### 3 · La guarda: nada sale sin sobrevivir a `JSON.parse()`

`serializar(valor)` devuelve `{ok, texto, error}` y **nunca lanza**: una
pantalla de configuración que revienta al copiar es peor que una que dice
que no puede. Cubre los tres modos de fallar —referencia circular,
`undefined`, JSON que no parsea— y se aplica **sobre lo que realmente se
va a escribir, ya fusionado**. Validar el fragmento y grabar el compuesto
es validar otra cosa.

Si no pasa, no se copia, no se guarda y no se publica. Copiar un JSON
roto al portapapeles es peor que no copiar: termina pegado en el repo.

La rama de `undefined` no es defensiva: `JSON.stringify(undefined)`
devuelve `undefined` y no un string, y es exactamente el caso que rompió
publicar.

### 4 · PUBLICAR BORRABA LAS ZONAS · el bug que destapó la auditoría

`configPublicar()` hacía
`JSON.parse(SGADD_CONFIG.exportar(b)).competencia`, y `exportar()`
devuelve `{ordenTabla, formatos, porTramo}` — **no tiene esa clave**. O
sea que viajaba `competencia: undefined`, el servidor lo entendía como
«vaciar» (que es una rama legítima) y el botón **borraba** las zonas en
vez de publicarlas.

Y contestaba `ok: true`. El admin publicaba, veía «Publicado», y el
cliente se quedaba sin colores en la tabla.

Guardar y publicar arman ahora el bloque en **un solo lugar**
(`configBloqueAGrabar()`): dos caminos que escriben lo mismo terminan
divergiendo, que es el bug que ya tuvo el rol funcional (punto 8).

**Este defecto no lo caza un grep**: la línea se leía perfecta. Hay que
ejercer el flujo, y por eso el test corre la pantalla en un `vm` con un
espía sobre `guardarCatalogo` y verifica el efecto en el catálogo.

### 5 · Aislamiento por categoría, en los DOS lados

Reconquista corre Primera, U21 y U23, y como las claves de `porTramo`
son `TORNEO|FASE` —y `GENERAL|REGULAR` es lo más común de todo— las tres
compartían zonas sin que nadie lo pidiera.

El motor ya sabía scopear (`porCategoria`, punto 17). Faltaban las dos
mitades que lo vuelven real:

- **En el cliente**, `fusionarCategoria(base, categoria, bloque)`: lo
  editado entra en su slot y el resto del bloque viaja tal cual. Sin
  `categoria` se reemplaza el nivel del club y **`porCategoria` se
  conserva** — editar un nivel no es una decisión sobre el otro.
- **En el servidor**, la acción `zonas` acepta `categoria` y escribe **un
  solo slot**. Es la garantía que no depende de la pantalla: aunque una
  versión vieja mandara el bloque de una categoría como si fuera el del
  club, no puede pisar a las hermanas.

Y una tercera pieza que es de producto: **la pantalla dice a quién le
cambia las zonas lo que se está editando** («Todas las categorías del
club (3)» / «Solo Primera»), con el conmutador para separarla. El motor
sabía scopear y el admin no tenía cómo saber sobre qué nivel escribía.

Verificado en el navegador con las tres categorías reales: separada
Primera con 9 equipos esperados, U21 y U23 siguieron resolviendo 12 desde
el bloque del club.

### Lo que este episodio deja como regla

**Un entregable que se copia y se pega tiene que ser reemplazable, no
empalmable.** El generador estaba bien y el JSON que producía era
válido; lo que falló fue pedirle a una persona que acertara una coma.
Cuando el formato del entregable admite un error silencioso, el error
llega — y acá llegó por la vía más difícil de auditar, que es un commit
hecho fuera del flujo de trabajo del punto 11.

---

## 42. EL GRUPO DE PARES · contra QUIÉN se compara un jugador

Es **B-5** del punto 10 bis, y la trampa que ese punto anticipaba —que el
universo se achica— resultó ser la menor de las dos.

### Lo que se midió antes de escribir nada

Libro real de Primera: 221 jugadores, 111 calificados, umbral 12,7 min.
Para el de más minutos:

```
METRICA        él     PARES    GLOBAL     TIPO
T2I         11,21      6,92      3,77     1,64
AST          0,86      2,19      1,14     0,47
eFG%         0,57      0,48      0,47     0,46
PePP%        0,08      0,16      0,16     0,16
```

**LA DISTORSIÓN ES SOLO DE VOLUMEN.** Las tasas —eFG%, TS%, PPP, PePP%—
casi no se mueven entre referencias (0,96–0,99x): un porcentaje no
depende de cuánto juega el que lo produce. Las CUENTAS por partido sí, y
mucho: el `JUGADOR TIPO` vale **0,42–0,53x** la mediana de los
calificados, porque incluye a los 211 que no llegan al umbral.

Ahí estaba el «1,0 contra 6,2» del pedido, y por eso **el modo global
tampoco usa el `JUGADOR TIPO`**: usa la mediana de los calificados, que
es el universo con el que el proyecto ya construye percentiles y bandas z
(punto 8) y con el que `jugadoresReferenciasRebote()` ya corrigió este
mismo sesgo. El TIPO queda de último respaldo: viene de la planilla y es
lo que el club audita, así que no se descarta, se degrada a él.

### La cascada

```
exacto    misma banda de minutos Y misma jerarquía
primaria  solo la banda de minutos          (si el exacto < 3)
global    mediana de los calificados        (si la primaria < 3)
tipo      la fila JUGADOR TIPO              (si no hay calificados)
```

El mínimo es 3 y es el mismo `MIN_CALIFICADOS_REFERENCIA` del rebote: una
«mediana» de dos jugadores no es una mediana.

**La muestra alcanza más de lo que temía B-5.** Medido: en Primera los 9
grupos del cruce tienen 3 o más y **ningún jugador cae al fallback**; en
U21 caen 2 de 201. Pero el nivel viaja en el resultado y **se dice en la
pantalla**: una referencia degradada en silencio es peor que ninguna.

### Lo que NO entró, y por qué

El pedido incluía «Net Rating / On-Off +/-» por jugador:

- `NET RTNG` y `RTNG OFF/DEF` son columnas de **EQUIPO** (`PROMEDIOS 4F`).
  No existen por jugador y derivarlas sería inventarlas.
- El **On-Off** necesita saber quiénes estaban en cancha, o sea el
  play-by-play que la planilla no trae (B-7, trabado en MotorStats).
- `+/-` sí existe y **se muestra en la card de Uso, pero sin barra de
  referencia**. El punto 3 bis ya fijó que no entra a rankings ni a
  desvíos porque depende de los otros cuatro que estaban en cancha; una
  mediana de pares sobre `+/-` ordenaría equipos disfrazados de
  jugadores. La card lo dice con todas las letras.

Las traducciones del pedido a columnas reales: **`TOV%` → `PePP%`**
(PP/PLAYS) y **«Ratio AST/TO» → `AST-PP`**.

### Los intentos NO llevan semáforo

`T2I`, `T3I`, `T1I`, `USG%`, `PLAYS` y `MIN` salen en tinte neutro
(`JUGADORES_REF_NEUTRAS`). Es la regla del punto 4: **ningún eje tiene
lado bueno y lado malo**. Tirar menos triples que sus pares no es peor,
es otro jugador, y pintarlo de rojo convierte una descripción de estilo
en un reproche. Lo destapó mirar la pantalla: `Triples int. 0,38x` salía
en rojo.

El número se muestra igual — **se saca el color, no el dato**, que es el
mismo criterio del `~` del percentil.

### Dos detalles que costaron

- **El semáforo necesita DOS clases.** `tono-alto`/`tono-bajo` viven
  dentro de `@media print` (punto 7.6): solas no pintan nada en pantalla.
  Y la clase de Tailwind sola se la come el aplanado del papel
  (`body * { color: #111 !important }`). Van las dos juntas.
- **`SGADD.formatear` toma una CLAVE DE MÉTRICA, no un nombre de
  formato.** Pasarle `'num1'` cae a un default de dos decimales y el
  delta salía «+12,00 pp», que para puntos porcentuales es ruido.

### El toggle es UNO solo para las tres cards

`JUGADORES.refModo` es compartido y el conmutador se dibuja en el
encabezado de cada card. Tocarlo en cualquiera las mueve a las tres: es
lo que pedía «unificado» sin obligar al DT a subir a buscar un control
que está en otra pestaña.

**Y los dos gráficos del tab Tiro usan la misma referencia que su tabla.**
Antes leían `r.tipo`; si el gráfico y la tabla de la misma pestaña
salieran de referencias distintas, la pestaña se contradiría sola. El
tooltip de la barra gris dice de qué muestra salió.

---

## 43. EL ESTADO REACTIVO DEL PANEL MASTER

Cuatro defectos reportados desde producción, y **dos de los cuatro eran
el mismo**.

### 1 · La categoría no sobrevivía al F5

`inicializar()` lee la planilla de la RUTA, y las secciones SGADD
(`#/<planilla>/…`) sí la llevan. El problema es el Panel Master, que
—como Principal y el Diagnóstico— escribe `#<seccion>` a secas.
`#configuracion` parsea como `planilla: 'configuracion'`, que no existe
en el catálogo, así que degrada a **la primera activa**: el DT trabajaba
media hora en U21, recargaba y aparecía en Primera.

**No se arregló con la URL, que era la otra opción del pedido.** Darle
ruta completa a esas secciones obliga a meter sus nombres donde
`Ruta.parse()` decide qué formato tiene un hash, y eso toca la lectura de
los links VIEJOS que el cuerpo técnico ya tiene guardados (punto 16). No
vale el riesgo para recordar la preferencia de una persona.

Va en `localStorage` bajo `sgadd.categoria.<club>`, y **el orden de
precedencia es lo que importa**:

```
1. la RUTA, si trae una planilla válida   ← un link abre donde dice el link
2. lo último que ESTE usuario eligió       ← en ESTE club
3. la primera activa                       ← como siempre
```

- **Se graba SOLO en `cambiarPlanilla`**, que es el gesto explícito del
  DT en el selector. Es la misma regla que `recordarTramo` (punto 40):
  grabar el default congelaría el criterio de arranque.
- **Abrir un link NO pisa el recuerdo.** Ver el link de otro no es
  cambiar de categoría.
- **La clave es por club**, y el valor se valida contra el catálogo de
  HOY: una planilla dada de baja o que ya no existe degrada a la primera
  activa en vez de dejar la pantalla vacía.

### 2 y 4 · El estado contaminado, que era un solo defecto

`buildConfiguracion()` llama a `configCargarBorrador()` **sin forzar**, y
esa función sale temprano si ya hay borrador — cosa que tiene que seguir
haciendo, porque es lo que permite tipear sin perder lo escrito en cada
repintado. Consecuencia: al cambiar de categoría, el estado global se
movía y esta pantalla se quedaba con todo lo derivado de la anterior.

Medido parado en U21, antes del fix:

```
estado.planillaId   naranja-u21-clausura-2026   ← el global sí cambió
CONFIGUI.categoria  primera-clausura-2026       ← viejo
CONFIGUI.propia     true                        ← viejo (U21 hereda)
equiposEsperados    12                          ← el formato de Primera
la tarjeta decía    «Solo Primera · Vuelta 2026»
```

Y la validación cruzaba los equipos declarados por **Primera** contra los
que trae el libro de **U21**: dos categorías distintas en la misma frase.

**NINGUNA de esas cadenas estaba hardcodeada** —todas interpolan
`CONFIGUI.categoria` y los nombres salen de `SGADD.CATALOGO.planillas`,
la misma fuente que el selector—. Lo que estaba viejo era la variable, así
que el punto 4 del reporte es el punto 2 visto desde la pantalla, y el
arreglo va en el único lugar por donde pasa: el punto de entrada del
borrador. Hay un test que igual verifica que no aparezca un nombre de
categoría literal en la UI, porque ese hardcodeo no daría ningún síntoma
hasta que alguien lo mire.

`resetEstadoCategoria()` tira `borrador`, `completo`, `categoria`,
`propia`, `origen`, `sucio`, `formatoSel` y **`exportando`** — ése último
es de los residuos caros: deja el panel de export abierto mostrando el
archivo de la OTRA categoría, y eso se copia y se commitea.

**Los cambios sin guardar se descartan, pero se avisa.** Eran de la otra
categoría, así que descartarlos es correcto; perderlos en silencio no,
porque el DT vuelve, no los encuentra y no sabe qué pasó.

### 3 · Publicar no avisaba nada, y el orden era el motivo

```js
configAvisar('Publicado…');   // escribe DENTRO de #view-root
configPintar();               // …y lo reconstruye entero
```

El mensaje se borraba en la línea siguiente a escribirse. El admin tocaba
«Publicar», el modal se cerraba y no pasaba nada visible: ni éxito ni
error.

Se arregla con las dos mitades:

- **Se repinta ANTES de avisar**, así el nodo del aviso inline es nuevo y
  el texto sobrevive.
- **Y va un toast**, que se cuelga de `document.body` y por lo tanto
  ningún repintado de sección lo toca. Se **reusa el del buzón** en vez de
  escribir un segundo: dos implementaciones del mismo aviso terminan
  viéndose distinto, que es el bug que ya tuvo el rol funcional (punto 8).

El toast nombra la categoría publicada y dice que subió al servidor, y en
el fallo trae el motivo que devolvió el servidor. **El nombre se resuelve
ANTES de disparar el pedido**: para cuando la promesa vuelve, el repintado
ya pudo haber cambiado el estado de la pantalla.

`toast()` acepta ahora una duración opcional: el aviso de publicar es una
frase larga y en los 2,6 s del default no se llega a leer. Los del buzón,
que son de dos palabras, se quedan con el default.

### Los tests se verificaron AL REVÉS

No alcanza con que pasen: se revirtió cada arreglo por separado y se
comprobó que el test lo caza — **2, 11 y 5 fallas** respectivamente. Un
test de regresión que no falla sin el arreglo no está probando nada.

### Y una lección sobre los tests que miden por distancia

`test-confirmar.js` verificaba que `configPublicar` abriera el modal con
`/function configPublicar[\s\S]{0,1600}SGADD_CONFIRMAR\.abrir\(/`. Los
comentarios que sumó este arreglo empujaron la llamada más allá de esos
1600 caracteres y el test se puso en rojo **sin que la propiedad hubiera
cambiado**. Ahora recorta el CUERPO de la función y busca ahí dentro: una
ventana fija de caracteres es una bomba de tiempo en un archivo que se
edita.

---

## 44. PARTIDOS SIN ESTADÍSTICAS · la carga manual

Cuando GES no publica el box score, el partido existió igual: cuenta para
la tabla y no puede faltar. Pero **no puede entrar por donde entran los
demás**.

### Por qué NO van al índice

`construirIndice()` alimenta todo: eFG%, PACE, percentiles, bandas z,
arquetipos, el grupo de pares. Un partido del que solo se sabe el marcador
metido ahí daría un equipo con **más PJ y los mismos totales de tiro** —o
sea eFG% y PACE diluidos— y jugadores con menos minutos por partido sin
haber faltado a ninguno. Números plausibles y falsos.

Viven aparte, en `catalogo[club].partidosManuales[<categoría>][<TORNEO|FASE>]`,
y se fusionan **solo** en `SGADD_CLASIF.tabla()`. Tocan exactamente PJ, PG,
PP, PF, PC y el split local/visitante — de donde salen PCT, DIF y los
puntos de tabla. Nada más.

El grueso de `test-manuales.js` no verifica lo que el partido manual HACE
sino **lo que no toca**: que la fila de la tabla no lleve ninguna métrica
avanzada, que el motor no las nombre, y que 20 partidos cargados sigan sin
mover una tasa.

### Las reglas

- **El scope es categoría + TRAMO.** Sin el tramo, un partido de la IDA
  contaría en la VUELTA. Es la misma clave `TORNEO|FASE` del selector, y
  el servidor escribe **un solo slot** — la garantía no depende de que la
  pantalla mande bien el pedido (punto 32).
- **Un empate se rechaza.** En básquet no existe, y dejarlo pasar daría un
  partido que no suma ni a ganados ni a perdidos: PJ dejaría de ser PG+PP
  sin que nadie se entere.
- **Lo derivado se recalcula, nunca se acumula.** PCT y DIF se rehacen
  después de sumar.
- **Un equipo que SOLO tiene partidos manuales entra a la tabla.** Si no,
  desaparece del torneo por no tener box score.
- **Se guarda solo el modelo**, no el objeto que manda el cliente: el
  catálogo se sirve a todos.

### Los puntos de tabla son OPT-IN

`PTS` (2 por ganado, 1 por perdido) entra como criterio de `ordenTabla` y
la fila lo trae calculado, pero **el orden por defecto sigue siendo
`PCT · DIF · PF`**: meterlo en la cascada reordenaría la tabla de los tres
clientes sin que nadie lo pidiera. Un club lo usa declarando
`ordenTabla: ["PTS", …]`.

### El botón que no hacía nada · un campo del modal con la forma equivocada

`configManualesPublicar()` le pasaba al modal de confirmación una lista de
**strings** por el campo `zonas`, que espera objetos `{label, zonas:[…]}`.
`bloqueZonas()` reventaba con «cannot read length of undefined» **adentro
de `abrir()`**, así que el modal no se pintaba, la petición nunca salía y
el botón no hacía absolutamente nada — sin dejar un error visible.

El campo correcto es `cambios`, que es un antes→después. Y de paso es más
útil: ahora el modal enumera el diff real contra lo que YA está publicado
en ese tramo (`configManualesDiff`), en vez de un cartel con el total.

**El test que había no lo cazaba porque leía el fuente.** La línea se leía
perfecta. Hay que EJERCER el modal —`abrir()` y `html()` en un `vm` con un
DOM mínimo— que es lo que hace ahora `test-manuales.js`.

### El selector de fase · elige el TRAMO destino, no un campo aparte

El formulario tiene un desplegable de fase que sale de
`combinacionesTorneoFase()` —la misma fuente que la barra— y **excluye el
sintético `*TOTAL*`**: no es un tramo donde se juegue, y un partido
cargado ahí se contaría dos veces o ninguna.

Elegir una fase **no mueve el selector principal**: antes, para cargar un
partido de la VUELTA había que ir a mover la barra, volver, y acordarse de
que la moviste.

**NO se agregó un campo `fase` por partido que venga del cliente.** El
registro ya vive bajo la clave `TORNEO|FASE`, así que aceptar además un
campo del pedido daría DOS fuentes de verdad para el mismo hecho: un
partido guardado en `IDA|REGULAR` que dijera `fase: "VUELTA"` no se podría
auditar contra nada, y la tabla lo contaría en IDA mientras la ficha diría
VUELTA. Es el bug del `sheetId` en dos lados y del rol funcional en dos
módulos, otra vez.

Quedan **registrados igual** —el pedido lo pedía— pero los escribe el
SERVIDOR derivándolos de la clave, así que no pueden divergir: lo que
mande el cliente en `torneo` y `fase` se ignora. Hay un test que manda
`fase: "VUELTA"` sobre el tramo `IDA|REGULAR` y exige que se guarde
`REGULAR`.

Y el filtrado sigue siendo por la CLAVE, no por ese campo:
`manualesDelTramo()` toma solo los del tramo abierto en la barra.

### El PJ que se MUESTRA es el de la tabla, en toda la app

Reportado el 2026-09-11: un equipo con **7 PJ en la tabla de posiciones
mostraba 6 en su tarjeta de Equipos**. La tabla suma los partidos
manuales (`tabla` → `fusionarManuales`) y la tarjeta leía el `pj` del
índice, que solo cuenta los partidos con box score. Y el banner de la
ficha, que este punto daba por puesto, no lo llamaba nadie.

**El `pj` del índice NO se toca**: es la muestra de los promedios, del PJ
mediano y de la muestra suficiente (punto 4), y es justo lo que este
punto protege. Lo que se unificó es lo que se MUESTRA como partidos
jugados, y sale de la MISMA fusión que la tabla:

- `SGADD_CLASIF.filasPorEquipo(idx, manuales)` — las filas de la tabla,
  por equipo. `clasifFilasVigentes(idx)` y `clasifFilaDe(idx, clave)` le
  pasan los manuales del tramo abierto.
- `SGADD_CLASIF.conPjDeTabla(lista, mapa)` — COPIAS de la lista con
  `pjTabla` y `manuales` al lado; el `pj` sigue siendo el del índice.
  `teamPicker` pinta `pjTabla` si viene, con el `⚠`.
- `SGADD_CLASIF.condicionConManuales(split, fila)` — el récord de local y
  visitante como las columnas PG L / PP L de la tabla. Los puntos del
  split son totales, así que los del manual se suman sin mezclar escalas.

Lo usan las tarjetas de Equipos y de Jugadores (es el mismo
`teamPicker`), el encabezado de la ficha (`16 PJ · 9-7`, con el banner),
la pestaña Local/Visitante y la columna PJ de los rankings, que lleva un
`data-glosa` diciendo que sus promedios salen solo de los partidos con
estadísticas. **Lo que decide quién entra al ranking y sobre cuántos
partidos se promedia sigue siendo el `pj` del índice.**

El Diagnóstico sigue mostrando el PJ del libro: audita el libro, y los
manuales no están en él.

La RACHA del encabezado sigue saliendo de los partidos con box score: un
partido manual todavía no la corta.

### El badge

Chip amarillo con `⚠` —ningún estado se comunica solo con color (punto
14)— y el desglose en el `title`, que también se lee con teclado y en
papel, donde no hay hover. Contraste medido con `CLUB.contraste`: **6,38**
el texto sobre el chip, **17,15** el chip sobre la card, **8,07** en papel.

El CSS va **a mano en el `<style>`** y con su regla de `@media print`: son
nodos inyectados (punto 12) y sin la regla de papel el aplanado
(`body * { color: #111 !important }`) se lo come.

> **Ojo al insertar CSS en `index.html` con un script.** `s.index('<style>')`
> matchea primero la MENCIÓN dentro del comentario de la cabecera, no la
> etiqueta real: el bloque quedó inerte adentro del comentario y encima lo
> partió. Hay que anclar a `
<style>
`.

---

## 45. NIVEL DE COMPETENCIA · el registro de umbrales

Las etiquetas de jugador se deciden con ~34 números duros repartidos entre
`sgadd-jugadores.js` y `sgadd-scouting.js`. Se validaron contra Liga
Argentina y La Plata, y **nunca contra formativas**.

### Lo que se midió

Cinco libros reales —Jujuy (Liga Argentina), Reconquista Primera,
Deportivo, Reconquista U21 y U23— mirando en qué percentil cae cada
umbral sobre los calificados de cada liga:

```
pptTripleElite           1,20    p88–p94    6pp   ← legítimo
mezclaTripleInterior     0,12    p10–p18    8pp   ← legítimo
mezclaTripleaPerimetral  0,30    p26–p37   11pp   ← legítimo

t1Pobre                  0,60    p15–p60   45pp
t1Contacto               0,72    p52–p88   36pp
astPPGenerador           1,40    p59–p93   34pp
pptTripleFrio/Pobre      0,88    p35–p67   32pp
minutosClave               20    p13–p42   29pp
```

**El criterio del punto 9 se confirma con más ligas**: un umbral absoluto
es legítimo cuando cae en el mismo percentil en cualquier categoría —o
sea cuando describe economía del básquet— y es ilegítimo cuando describe
«por debajo del promedio» disfrazado de constante.

El caso más caro es `t1Pobre`: marca al 15% peor en Liga Argentina y al
60% en la U23. Pasa de decir «tirador de libres flojo» a «jugador
promedio».

### Etiquetas rotas por incidencia

Aparte de los percentiles, hay etiquetas que directamente no se emiten:

```
ancla-defensiva       2% · 0% · 2% · 0% · 0%   muerta en 3 de 5 libros
generador-primario   10% · 3% · 1% · 1% · 0%   colapsa fuera de Liga Argentina
generador (arq.)     28% · 12% · 6% · 7% · 10%  brecha 22pp
```

Y dos fallbacks que saturan: `especialista` (jerarquía) se lleva el 67–73%
y `pocos` (minutos) el 45–57%. **No es el mismo problema** —no depende del
nivel— así que se trata aparte.

### LAS ETIQUETAS DE EQUIPO NO ENTRAN ACÁ

`sgadd-personalidad.js` ya trabaja 100% con percentiles contra su propia
liga, y hay un test que fija que «una liga 25% más rápida NO cambia el
perfil». Son agnósticas de nivel por diseño: tocarlas sería trabajo sin
beneficio. El problema está concentrado en las etiquetas de JUGADOR.

### `server/lib/etiquetas.js` NO es esto

Ese archivo reescribe las columnas `TORNEO`/`FASE` en la lectura y hoy no
tiene ninguna regla activa. Comparte el nombre y nada más.

### El registro · `js/sgadd-niveles.js`

Motor puro. Cada umbral declara su **tipo**:

| tipo | qué significa |
|---|---|
| `absoluto` | economía del juego · no se toca en ninguna liga |
| `percentil` | marca una porción de la población · el número crudo cambia por nivel |
| `z` | desvíos contra la media de la liga (lo que ya usa `bandaLiga`) |

Y seis niveles, de mayor a menor exigencia: `LIGA_NACIONAL`,
`LIGA_ARGENTINA`, `FEDERAL_MAYORES`, `FEDERAL_MENORES`, `LOCAL_MAYORES`,
`LOCAL_MENORES`. El orden **no es decorativo**: la etapa 4 lo va a usar
para que un nivel sin libro herede del más cercano que sí tenga.

### Esta entrega no mueve un solo número

Etapas 1 y 2. **Las semillas de los seis niveles valen lo mismo que valía
el literal**, así que el comportamiento es idéntico y la suite entera
sirve de prueba de equivalencia. Lo que cambia es dónde viven.

`calibrado` guarda los equivalentes MEDIDOS —el valor que da el mismo
percentil en cada nivel— y **todavía no lo consume nadie**. Está separado
de `semillas` justamente para que se vea que son dos cosas: lo que hoy
corre y lo que la evidencia dice que debería correr.

**Solo tres niveles tienen libro con el que calibrar** (`CALIBRADOS`). A
los otros tres no se les inventan números: un umbral inventado se ve igual
que uno medido.

### Dos decisiones de producto que ya se tomaron

- **El nivel se DECLARA por categoría**, no se infiere. El campo `liga`
  existe pero no distingue mayores de formativas.
- **Los clamps se aceptaron.** El valor vivo se acota al rango observado
  en libros reales. Sin eso, un sistema puramente auto-referencial le da a
  toda liga exactamente un 10% de «tiradores de élite», incluida una donde
  nadie convierte: la etiqueta pasaría a decir «de los peores, el mejor».
  El tier deja de ser una semilla y pasa a ser el ancla de significado.

### Lo que hay que respetar al tocarlo

- **Los tres absolutos no llevan `semillas` por nivel.** Si las tuvieran,
  alguien las movería y dejarían de ser absolutos sin que se note.
- **`JUGADORES_UMBRALES` es el CONTRATO con scouting.** Es lo que
  `sgadd-scouting.js` lee por `COMPARTIDOS`, así que una clave que se
  saca le apaga una regla en silencio. Pasó de catorce a diecisiete al
  absorber los literales que vivían dentro de los arquetipos; **agregar
  se puede, sacar no**.
- **Sin el registro se cae a los literales**, no a `undefined`: una
  comparación contra `undefined` es siempre falsa y apagaría la regla en
  silencio.
- **`sgadd-niveles.js` carga ANTES que `sgadd-jugadores.js`.**

### Los literales que vivían DENTRO de los arquetipos

`generador` y `amenaza` no se movieron ni un punto en la etapa 4, y el
motivo era que sus números estaban **escritos en línea dentro de**
**`PERFILES_TECNICOS`**, fuera del registro. El de `generador` era además
el MISMO `1.40` de `astPPGenerador`, duplicado a mano — el bug del punto
8 otra vez, esperando a que alguien moviera uno de los dos.

Los tres entraron al registro (`astPPGenerador` ya estaba; se suman
`amenazaVolumenT3` y `amenazaT3`) y la regla los lee por `prom.U`. Medido
sobre los cinco libros:

```
                        JUJUY  RQ 1ª  DEP.   U21    U23
arq:generador   antes    29%    12%    6%     7%    10%
                ahora    29%    31%   30%    30%    29%
arq:amenaza     antes    16%     4%    4%     5%     5%
                ahora    16%    11%   14%    12%    13%
```

`generador` pasó de significar cosas distintas según la categoría a
marcar a ~30% en las cinco. Hay dos tests que leen el fuente y fallan si
un literal vuelve a aparecer adentro de un arquetipo.

### `ancla-defensiva` · el bloqueo NO era el nivel, era la COMPARACIÓN

La regla exigía `RD rel > RO rel`, o sea ratio > 1. Los dos relativos se
miden contra **medianas distintas**, y el rebote ofensivo está mucho más
concentrado en los interiores que el defensivo: medido, la mediana del
ratio entre interiores es **0,51–0,82** en los cinco libros. Pedir `> 1`
era pedir algo **atípico por construcción**, y por eso la etiqueta daba
0% en tres de las cinco ligas — no porque no hubiera anclas, sino porque
la comparación no podía encontrarlas.

Ahora se compara contra la distribución del propio torneo
(`anclaRatioDefensivo`, p60). **El p60 se eligió midiendo, no a ojo**: es
el único percentil que desbloquea la U21 —de p70 en adelante la deja en
0— y da incidencias consistentes en los cinco libros.

```
                        JUJUY  RQ 1ª  DEP.   U21    U23
fun:ancla-defensiva  →   3,1%   0,0%  2,2%   3,1%   1,1%     (antes 0 · 2 · 0 · 0 · 0)
fun:rim-runner       →   3,1%   1,3%  4,0%   5,2%   3,1%
```

Dos cosas honestas sobre esto:

- **RQ Primera sigue en 0%, y no es el umbral.** Sus cinco interiores
  calificados se los llevan `finalizador-corto` (4) y `generador-primario`
  (1), que van antes en la cascada — verificado uno por uno. Es un
  problema de ORDEN, y el orden tiene sus propios tests y es una decisión
  de básquet: cambiarlo de pasada, para que un número quede lindo, sería
  exactamente lo que este proyecto no hace.
- **`rim-runner` bajó** (5/3/8/8/7% → 4/1/4/3/3%). Es el efecto correcto
  —los que absorbía por defecto ahora caen donde corresponde— pero es un
  movimiento y conviene mirarlo.

Va `>` y no `>=` **a propósito**: con el respaldo estático, que vale 1,00
—el número viejo—, la regla se comporta exactamente como antes, así que el
cambio de vara vive entero en el umbral y no en el operador.

Y el `detalle` de la etiqueta se reescribió: decía *«sostiene el rebote
defensivo más de lo que carga el ofensivo»*, que con un umbral por debajo
de 1 **es falso**. Un texto que ya no describe la condición que lo
disparó es peor que ninguno.

---

## 45 bis. LA PROCEDENCIA DEL UMBRAL · lo que hace auditable al sistema

**Un umbral que se movió solo y uno escrito a mano se ven exactamente
igual en pantalla: los dos son un número.** Mientras los treinta y dos
valían un literal eso no importaba; desde que se adaptan, el DT que ve una
etiqueta nueva no puede saber si cambió el jugador o cambió la vara — y
una herramienta que no se puede auditar se deja de usar.

| origen | qué significa |
|---|---|
| `absoluto` | Fijo. Describe economía del básquet. Son tres |
| `tier` | La semilla medida del nivel: todavía no hay muestra |
| `mezcla` | En transición entre esa semilla y el percentil real |
| `vivo` | El percentil real sobre los calificados de esta competencia |

`SGADD_NIVELES.procedencia(clave, nivel, contexto)` los resuelve. **Sin
`contexto` contesta la pregunta de TABLA** —qué diría este nivel en frío—
y por eso ahí solo puede salir `absoluto` o `tier`; **con contexto**
contesta la pregunta real y aparecen los otros dos. Los cuatro se declaran
en `ORIGENES`, y hay un test que exige que la UI conozca exactamente esos
cuatro: un origen que el motor devuelva y la tabla no sepa pintar saldría
sin explicación y nadie se enteraría.

### El bloque de la ficha

`jugadoresVara(idx)` es **puro** y devuelve la foto completa: qué nivel
rige, de dónde salió esa declaración, cuánta muestra hay y, por cada
umbral, su valor con su procedencia. `jugadoresBloqueVara(idx)` lo pinta
al pie del tab General.

- **Va PLEGADO**: es auditoría, no lectura de cancha.
- **Lista LOS TREINTA Y DOS**, no un recorte. Un umbral que no se lista es
  uno que no se audita.
- **ES SOLO PARA EL ADMIN, y el público tampoco.** La vara contesta «con
  qué números se decidió esto», que es una pregunta sobre el MOTOR y no
  sobre el jugador: al cliente le suma treinta y dos filas de ruido
  debajo de su ficha. Acá **no vale `sinRestricciones()`**, que deja
  pasar a `ABIERTO` junto con el admin. Falla **cerrado**: sin
  `SGADD_AUTH` cargado no se pinta. El motor puro (`jugadoresVara`) no se
  toca — lo que se acota es la vista.
- **Lleva `.no-imprimir`.** El PDF de la ficha reusa estos mismos bloques
  (punto 7.6 ter) y es la hoja que el DT se lleva a la charla con UN
  jugador: treinta y dos filas de auditoría ahí son ruido y empujan la
  ficha a una carilla más. Quien audita lo hace en pantalla.
- **Sin `__detalle` devuelve vacío.** Ahí el mapa es el respaldo estático
  y no hay procedencia que mostrar: decir que la hay sería peor.

**Los dos defectos que solo se vieron MIRANDO LA PANTALLA** —ninguno de
los dos deja error en consola, y los dos tienen su test ahora:

1. **`zona-<tono>` solo define la variable `--zona`**; el color lo pinta
   `zona-texto` (punto 15). Con una sola de las dos, el chip salía del
   color heredado y **el semáforo no existía**.
2. El bloque entraba al **PDF de la ficha** sin que nadie lo pidiera.

### El manual se imprime POR NIVEL

`generar-manual-etiquetas.js` leía `JUGADORES_UMBRALES` e imprimía un
número pelado. Desde las etapas 3 y 4 eso pasó a ser **falso para
veintinueve de los treinta y dos**, y un manual que declara un número que
el motor no usa es peor que no tener manual.

Cada corte se emite con su clave (`data-u`) y los **seis mapas viajan**
**adentro del documento**: el selector reescribe los números sin volver a
generar nada, así que el manual sigue siendo un HTML suelto que se abre
con doble clic.

- **Arranca en LIGA ARGENTINA** a propósito: es la vara con la que se
  escribieron las reglas y con la que se validaron las fixtures, así que
  el manual impreso sin tocar nada dice lo mismo que decía.
- **La sección 4 imprime la MATRIZ de los seis.** Un PDF congela un nivel;
  la matriz es lo que sobrevive al papel y permite auditar cualquier
  categoría desde una hoja.
- **Los tres fijos van subrayados** y en la matriz se repiten como `=`:
  escribir seis veces el mismo número invita a moverlo.
- **Los cortes traen markup ahora**, así que **no se vuelven a escapar**
  al renderizar. Hay un test que falla si aparece un `&lt;span class="u`
  en el HTML generado.

### El mapa estático NO se toca, y por eso sigue siendo el respaldo

Los tres literales nuevos entraron a `JUGADORES_UMBRALES` con **el valor
que tenían adentro del arquetipo** (3,0 · 0,34 · 1,00), no con la semilla
de ningún nivel. Mover un número y unificarlo a la vez haría imposible
saber cuál de las dos cosas cambió una incidencia.

---

## 46. EL ANCLA VA ANTES QUE EL FINALIZADOR · y lo que pierde no se pierde

La cascada de rol funcional ordena por **lo que condiciona el plan del**
**rival**, y la protección de aro condiciona más que la finalización:
contra un ancla se cambia a qué mano se penetra y desde dónde se ayuda;
contra un finalizador se cambia quién lo bloquea.

Medido antes del cambio, `finalizador-corto` se llevaba **4 de los 5**
interiores calificados de RQ Primera y dejaba la etiqueta defensiva en 0%
— el residuo que el punto 45 había dejado abierto a propósito, porque
cambiar el orden de la cascada es una decisión de básquet y no un ajuste
para que un número quede lindo.

```
                        JUJUY  RQ 1ª  DEP.   U21    U23
ancla-defensiva   antes   3,1%   0,0%  2,2%   3,1%   1,1%
                  ahora   4,6%   1,8%  4,5%   3,1%   2,3%
finalizador-corto antes  10,0%   9,9%  9,8%   5,2%  10,3%
                  ahora   8,5%   8,1%  7,6%   5,2%   9,2%
```

El finalizador cede exactamente el solapamiento, no más.

### Los SECUNDARIOS · la cascada elige una, la ficha muestra las dos

Un interior que protege el aro **y** finaliza cerca tiene dos facetas
reales, y quedarse con la primera de la cascada las borraba.
`jugadoresRolFuncional` devuelve ahora también los roles que TAMBIÉN
dispararon, en `secundarios`.

- **Es ADITIVO**: quien ya leía `.id` y `.label` sigue leyendo lo mismo.
- **Scouting no lo usa a propósito.** Ahí hay que decidir UNA marca, no
  describir: el plan defensivo asigna un defensor por rival.
- **La lista viene siempre**, aunque esté vacía.

### UN SECUNDARIO SOLO INFORMA SI ES OTRA FACETA

Cada rol declara su **`eje`** (`creacion`, `defensa`, `finalizacion`,
`cristal`, `tiro`, `penetracion`), y un secundario solo se lista si su eje
difiere del primario.

El motivo se midió: sin ese filtro los secundarios saltaban en el
**27–45%** de los planteles y la mitad eran `generador-primario +`
**`manejador-secundario`**, que es el mismo rasgo con distinta exigencia
—AST-PP ≥ 1,40 contra ≥ 1,00— o sea que el segundo está contenido en el
primero por construcción y listarlo no dice nada. Con el eje quedan los
pares que describen dos cosas distintas: proteger y finalizar, abrir la
cancha y penetrar.

**Los fallbacks NO declaran eje** (`poste-bajo`, `perimetral-media`,
`complementario`): calzan siempre —para eso están— así que listarlos como
«además es…» sería listar la ausencia de un rasgo.

El chip secundario va subordinado y con su propio `title`. Contraste
medido sobre la card: **7,25** el primario y **5,04** el secundario al
80% — los dos pasan AA.

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

Van con `?
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
lleva la firma. Lo usan las **tres** exportaciones que tienen contenedor
propio: ranking, ficha e informe.

**Scouting y post-partido siguen con el fijo**: imprimen la sección viva, sin
contenedor, y envolver eso en una tabla movería un maquetado A3 que está
medido y presupuestado (puntos 7.2 y 7.6). Conviven dos mecanismos a
propósito, y hay tests que fijan cuál usa cada una — **una exportación no
puede tener los dos**, o firmaría dos veces la misma hoja.

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

## 52. LA DEMO PÚBLICA Y LAS CARDS DE PLANES

Dos piezas comerciales que comparten un solo formulario: una vuelta
entera del panel sin login (`/demo`) y las tres cards de planes de la
landing. Motor y runtime en `js/sgadd-demo.js`; el generador del
snapshot es `generar-demo.js`, que se corre **a mano**.

### El snapshot está COMMITEADO, y esa es la decisión

Desde que el catálogo dejó de traer `sheetId` —«EL CATÁLOGO YA NO TIENE
sheetId, Y ESE ES EL PUNTO»— leer un libro exige pasar por el backend,
que pide token. La demo es pública por definición, así que no lo tiene.

Poner el id de un libro real en un `clubes/*.json` para que la demo
leyera en vivo **desharía esa decisión**: esos archivos son públicos.
Por eso el libro se lee UNA vez desde `generar-demo.js`, con la
credencial local (`SHEET_JUJUY_PRIMERA` de `server/.env`), y lo único que
entra al repo es el resultado ya anonimizado.

```
17 equipos · 259 jugadores · 21.104 celdas reescritas · 2.839 KB
```

**Las filas se guardan como ARRAYS, indexadas por `cols`.** Con objetos
el archivo pesaba **5.549 KB**: la mitad eran los nombres de las 53
columnas repetidos en cada una de las 2.000 y pico de filas. El precio es
que el generador y `rehidratar()` tienen que estar de acuerdo sobre el
orden, y un desacuerdo **no rompe**: corre las columnas y muestra el
`PACE` en la casilla de los puntos. Hay un test que ejerce la ida y
vuelta sobre el archivo real y no sobre una fixture de tres columnas —
el corrimiento aparece justo donde hay muchas.

### LOS NÚMEROS NO SE TOCAN · solo los NOMBRES

El valor de la demo es que el dashboard se vea **real**: percentiles
contra la liga, eFG%, PACE, arquetipos, bandas de desvío. Con números
inventados las etiquetas dirían cualquier cosa y la demo enseñaría a
desconfiar del producto.

Se reescriben `EQUIPO`, `NOMBRES` y el texto de `PARTIDO`. Lo que **no**
se toca: ningún valor numérico y los dos centinelas, `EQUIPO TIPO` y
`JUGADOR TIPO`, que son la MEDIANA (punto 3). Renombrarlas como si
fueran un equipo más dejaría al panel sin percentiles, sin bandas y sin
umbral de minutos.

**La guarda de fuga corre DOS veces.** El generador se niega a escribir
si algo se filtró, pero eso corre en la máquina de quien genera;
`test-demo.js` recorre el archivo **entero** en cada suite —no una
muestra— y exige que todo `EQUIPO` matchee `^EQUIPO \d+$`, todo `NOMBRES`
`^JUGADOR \d+$`, y que no viaje ninguna cadena con pinta de id de Google
ni una sola mención del club de origen. Es el archivo que se publica en
un repo público: la verificación tiene que estar del lado del repo.

### EL PATRÓN DEL EQUIPO PROPIO VA ANCLADO

`"patronEquipoPropio": "^EQUIPO 1$"`. Es la trampa del punto 6 —la de
DEPORTIVO— pero acá se da **sí o sí**: con 17 equipos llamados `EQUIPO
1..17`, un patrón sin anclar trata a **ocho rivales como equipo propio**
en scouting, en los informes y en el plantel, sin ningún síntoma visible.

### Tres enganches, cada uno en el único punto por el que se pasa

| Qué | Dónde | Por qué ahí |
|---|---|---|
| el club forzado | `sgadd-club.js` | carga PRIMERO y se auto-arranca: cuando `idDesdeUrl()` corre, `SGADD_DEMO` todavía no existe. Por eso `enDemo()` mira la URL **inline** |
| la sesión | `SGADD_AUTH.cargarSesion()` | es el ÚNICO punto que decide de dónde sale una sesión |
| los escudos | `LOGOS.getUrl()` | por ahí pasan la grilla, la tabla, el scatter, el scouting y los cinco PDF |

**La sesión estableciéndose desde el módulo de la demo NO funcionaba**, y
el modo de fallar era el caro: `cargarSesion()` corre DESPUÉS, en el
`init()` del arranque, y la pisaba. Medido en el navegador — la demo
abría con `sesion: null`, o sea **rol ABIERTO**, que ve TODO: se le
habrían mostrado Simulador, Configuración y Diagnóstico a cualquiera que
entrara por el link público.

**Es plan PLATA y no se persiste.** Plata porque es el plan que la demo
vende: incluye Scouting, que es el módulo que más se mira. Y no se
persiste —`establecerSesion` solo escribe en memoria— porque si quedara
en `localStorage`, el que probó la demo abriría el panel al día siguiente
convencido de que tiene una cuenta.

### `/demo` es una CARPETA con un redirect

Y no un `?demo=1` pelado: lo que se comparte por WhatsApp es una **ruta**
—`motorstats.ar/demo` se lee y se dicta— y un query string se corta al
pegarlo. `demo/index.html` hace `location.replace('../index.html?demo=1')`
y lleva `noindex`, para que la demo no le compita a la landing en Google.

### LAS CARDS DE PLANES SE DERIVAN DE `MODULOS`, NO SE ESCRIBEN

La tentación es listar a mano lo que trae cada plan. No se hace: la
matriz de qué pide cada sección ya vive en `SGADD_AUTH.MODULOS`, que es
la que el router **hace cumplir**. Con una segunda lista, la landing le
promete al cliente un módulo que el gate le niega —o al revés, le esconde
uno que ya tiene— y la que se relaja es siempre la de la pantalla. Es el
bug del rol funcional (punto 8) con un cliente que paga del otro lado.

`SGADD_LANDING.planes()` es puro y resuelve las tres cards:

```
Bronce  base    Principal · Equipos · Jugadores · Clasificación · Glosario   2 mails
Plata   +       Scouting                                                     3 mails
Oro     +       Análisis de scouters (servicio, no módulo)                   4 mails
```

**El test no compara contra una lista escrita en el test** —eso sería una
TERCERA copia— sino contra `puedoAcceder()`, ejecutándolo con una sesión
de cada plan sobre cada sección. Si alguien mueve Scouting de plan y no
toca la landing, cae. Y hay otro que lee el cuerpo de `planes()` y falla
si aparece el nombre de un módulo escrito a mano.

**Lo único escrito a mano es el servicio del plan Oro**, y no se puede
evitar: no es un módulo del panel sino trabajo humano —un informe por
ciclo de 4 partidos— y ningún `MODULOS` lo puede declarar. Lo que sí sale
del código es **su número**: `SGADD_HUB.PARTIDOS_POR_CICLO`, que es el
que el hub hace correr. Hay un test que los ata.

**El cupo de mails se dice UNA sola vez.** Estaba en las cards y otra vez
abajo, en «cómo se entra»: la misma cifra en dos lugares de la misma
pantalla es la que el día que cambie deja una vieja, y el cliente lee la
que le conviene. Sale de `SGADD_AUTH.CUPO_MAILS`, la misma tabla que el
servidor hace cumplir al dar de alta un mail.

**Ningún estado se comunica solo con color** (punto 14): lo que el plan
suma va con `✓`, el servicio con `＋` y lo que está un escalón más arriba
con `→`. Y lo que falta **no se tacha**: un tachado se lee como «esto ya
no existe» y lo que hay que comunicar es «esto está más arriba».

**La destacada no crece ni se mueve.** En una grilla de tres, escalar una
card le desalinea el borde a las otras dos, y en el teléfono —donde van
apiladas— no se nota que es distinta. Se marca con el borde de acento y
un badge, que se ven igual en las dos disposiciones.

### UN SOLO MODAL PARA LOS DOS ORÍGENES

La barra de la demo y las tres cards abren el **mismo** formulario:
nombre, rol, club, país y ciudad. **Se exigen el club, el país y la
ciudad** —son lo que el que atiende no puede deducir de la conversación—
y el nombre y el rol no, porque llegan con el propio contacto.

**El teléfono se sacó.** El mensaje sale desde el WhatsApp del propio
interesado, así que su número ya viaja con él: pedirlo era un campo que
no aportaba un solo dato.

- **El país es un `<select>`** con Argentina elegida y «Otro» último;
  «Otro» abre un campo para escribirlo, o el mensaje diría «de la ciudad
  de Lisboa, Otro».
- **La ciudad es texto libre con sugerencias** (`<datalist>` por país),
  NO un `<select>`: el básquet argentino se juega en cientos de
  localidades, y el que no encuentra la suya en una lista cerrada
  abandona.
- **Cambiar el país no repinta el modal**: rehace el datalist y nada más.
  Un repintado perdería el foco y lo ya escrito (la regla de
  `scoutMeta()`). Y la ciudad escrita no se borra.
- **El rol va en su propio desplegable.** Estuvo pegado al nombre con un
  datalist de roles, y el navegador le sugería «Entrenador» a quien
  escribía su nombre; además el mensaje no podía armar «Nombre (Rol)».
- **La validación es `faltantes()`, pura**: nombra todo lo que falta de
  una vez, marca cada campo con `aria-invalid` —el borde, no solo el
  aviso del pie— y la marca se va apenas se escribe.
- **País y ciudad van de a dos por fila cuando entran**, con
  `auto-fit`: se decide por el ancho de la CAJA y no por una media query,
  que al imprimir se evaluaría contra la hoja (punto 49). El mínimo es
  **10rem y se midió**: con 9rem el teléfono metía dos campos de 145px y
  «Preparador/a físico/a» no entraba; con 10rem se apilan en el teléfono y
  el escritorio sigue de a dos.

**Lo que sí cambia es el encabezado del mensaje**, y no es un detalle:
con un solo texto, el que toca una card en la landing —sin haber entrado
nunca a la demo— le escribiría «probé la demo», y el que atiende arranca
la conversación con un dato falso.

```
desde la demo   Hola MotorStats, probé la demo. Soy <nombre> (<rol>) del club
                <club>, de la ciudad de <ciudad>, <país>. Quiero ver cómo
                funciona el dashboard con las estadísticas de mi equipo.
desde una card  Hola MotorStats, quiero consultar por el plan <X>. Soy …
```

Un club que ya se llama «Club Atlético…» no sale «del club Club…»: la
palabra se antepone solo si falta.

**No hay backend al que mandar el lead**, así que el envío arma el
mensaje y abre WhatsApp: queda en la conversación, que además es donde el
club lo quiere atender. Prometer un «te contactamos» sin nada que lo
cumpla sería peor que no tener el formulario.

El número comercial es **`5492216143994`** y vive en UN solo lugar
(`WHATSAPP`, en `js/sgadd-demo.js`): lo usan la barra de la demo y las
tres cards. Estuvo un rato con un número de ejemplo, que es el modo de
fallar más caro de esta pieza —el formulario anda, el mensaje se arma, y
cada lead se va a un teléfono que no es—. Hay un test que exige que no
sea el de ejemplo y que el enlace lo lea de ahí y no de una constante
propia.

### EN LA DEMO EL ISOTIPO **ES** EL ESCUDO, y se resuelve en `resolverUno`

Reportado desde la demo publicada: al entrar saltaba el panel de
diagnóstico **«Faltan 17 logos»**, pidiendo subir `equipo-1.png` …
`equipo-17.png` al repositorio.

La sustitución estaba puesta en `LOGOS.getUrl()`, que es el punto por el
que pasan la grilla, la tabla y los PDF — pero **`resolverUno()` seguía
sondeando los diecisiete archivos**. Tres consecuencias, y la tercera es
la que se vio:

1. **17 pedidos fallidos por carga**, con su tanda de extensiones cada uno;
2. **`getImage()` devolvía `null`**, así que el scatter de Principal y los
   puntos del gráfico de evolución salían con INICIALES en vez del logo —
   `getUrl` y `getImage` son dos lecturas distintas del mismo caché, y la
   sustitución cubría una sola;
3. **una lista de 17 faltantes**, que es exactamente lo que dispara el panel.

Ahora se resuelve en `resolverUno()`, que es el único punto por el que
pasa cada equipo: el isotipo entra al caché como la imagen del equipo, así
que `getUrl` y `getImage` contestan lo mismo, no se pide un solo archivo
de más y **no falta ninguno por construcción**.

**El panel lleva además su propia guarda, y no es redundante.** El arreglo
de arriba hace que no falte ninguno; la guarda cubre el caso en que el que
no cargue sea **el isotipo mismo** —ahí volverían a faltar los diecisiete
y el cartel saltaría otra vez encima de la demo—. Defienden dos fallas
distintas.

Y vale para cualquier visitante, no solo para la demo: ese panel le dice a
**quien administra el repositorio** qué archivos subir. Alguien que entra a
ver el producto no tiene el repo ni por qué enterarse de que existe.

### LA DEMO NO MUESTRA AVISOS DE DATO

Reportado desde la demo publicada: el header traía **«1 hoja con
errores»**. Medido antes de tocar nada, que es lo que decidió el arreglo:

```
lastErrors            1 · «Hace falta un link de acceso para ver esta categoría»
DATA.promediosJ · promediosE · baseDatosE · promedios4f      →  0 filas
lo que Principal muestra igual   17 equipos · 260 jugadores · 17 filas de tabla
```

Sale de la **capa de datos vieja de Principal** (punto 3 ter), que lee por
su cuenta y necesita un libro conectado. La demo no tiene: sus datos salen
del snapshot. O sea que esa petición **no alimentaba una sola celda** —el
panel se dibuja entero desde el índice— y lo único que producía era el
cartel.

Se apaga en **`fetchAllData()`**, que es el único punto por el que pasan
sus tres llamadores (`init`, `refreshData` y el cambio de categoría). Con
la guarda repartida, el llamador que se agregue mañana queda sin ella — el
de la landing sigue en el llamador porque ahí se saltea además el orden de
`aplicarMarca()`.

**Y `renderStatusBanner()` lleva su propia guarda**, que no es redundante:
la primera apaga la petición que HOY los produce, la segunda cubre
cualquier otro origen — el libro de muestra sale de un club real y arrastra
sus rarezas, como el `ACUMULADO J` incompleto de Jujuy (punto 8). Es la
misma pareja que las dos guardas del panel de escudos.

Ese cartel es para el cuerpo técnico de un club, que puede ir a Diagnóstico
y hacer algo con él. Quien entra a ver el producto no tiene ese libro, no
tiene esa pantalla, y lo único que se lleva es la impresión de que el panel
viene con errores.

**La campana SÍ se queda.** Sus 30 alertas no son un error: son el buzón
del punto 13 funcionando sobre datos de muestra, que es justamente uno de
los módulos que la demo vende.

### «VOLVER AL INICIO» · y la reserva que se MIDE

La barra fija llevaba una sola salida —ninguna—: quien entraba a la demo
desde un link no tenía cómo volver a la landing sin editar la URL. Va como
**enlace y no como botón** (es navegación: se abre en otra pestaña, se
copia, se ve a dónde lleva antes de tocar), **antes del CTA** —en una barra
que se lee de izquierda a derecha el último elemento es el que pesa, y el
que paga la demo es el de WhatsApp— y en **outline**.

Apunta a `index.html` **relativo**: el panel se publica en un subdirectorio
(`/estadisticas/`), así que un `/` absoluto se iría a la raíz del dominio,
que no es este sitio.

#### El alto de la barra ya no está escrito en dos lados

La barra va fija, así que el `<body>` tiene que reservarle su alto o le
tapa el header a la app. Ese alto era una **constante en el CSS** (44px en
escritorio, 64 en teléfono) y son **dos números para el mismo hecho**: al
sumarle el «Volver al inicio» la barra pasó a 49px y se comió 5px del
header, sin más síntoma que eso.

`reservarAlto()` la MIDE y escribe el `padding-top` del body. Las dos
constantes del CSS quedan como **piso**: es lo que vale entre que la barra
se pinta y esa medición corre.

Tres cosas que costaron, y las tres solo se vieron MIDIENDO:

1. **Se mide `.demo-barra`, NO su contenedor.** `#demoBarra` es el `<div>`
   que se inserta en el body, pero la barra de adentro va `position:
   fixed`, o sea FUERA DEL FLUJO: **el contenedor mide cero**. La primera
   versión leía el wrapper, la guarda de alto positivo la salteaba y la
   reserva se quedaba en la constante — o sea que el arreglo no arreglaba
   nada y no dejaba ningún rastro.
2. **Medir una vez no alcanza.** La barra envuelve en varios renglones
   según el ancho y las tipografías entran DESPUÉS del primer layout.
   Medido en el teléfono: al montar reservaba **147px** y la barra
   terminaba en **107** — sin solaparse, pero con 40px de aire muerto
   arriba de la app. Va un `ResizeObserver` sobre la barra, que cubre las
   dos causas de una: cambia el ancho o cambia el contenido. El `resize`
   de ventana queda de respaldo.
3. **En papel la reserva se anula con `!important`.** La escribe el JS como
   estilo **inline**, así que le gana a la media query: sin eso el PDF
   generado desde la demo saldría con ese aire arriba de la primera hoja.

Medido después, sin solapamiento y sin aire muerto:

```
           barra   reserva   header arranca en
1400px      49px     50px          50   ·  13% de una pantalla de 812
 375px     107px    108px         108
```

**Lo que NO se pudo verificar acá**: el mínimo táctil de 44px del enlace
vive en `@media screen and (pointer: coarse)`, y la emulación de CDP no
activa esa rama —medido: los dos botones de la barra siguen dando 28 y
30px de alto con `mobile: true`—. La regla está donde corresponde y hay un
test que lo fija, pero en un teléfono real no se probó. Es el mismo límite
que ya anota el punto 49 para la tablet.

**Y va DENTRO del bloque táctil que ya existe, no en uno propio.** Los
mínimos táctiles viven en un solo lugar — y además un segundo bloque rompía
el recorte de `test-responsive.js`, que toma el PRIMER `pointer: coarse`
del `<style>`: doce verificaciones se cayeron juntas sin que hubiera
cambiado una sola regla de las que defienden. Otra vez el ancla frágil.

### Dos trampas viejas que volvieron a morder

1. **Una consulta de ancho sin `screen`** (punto 49). El bloque de la
   demo traía `@media (min-width: 640px)` y las cards `(min-width:
   768px)`: al imprimir se evalúan contra la HOJA. Peor, la reserva de
   alto de la barra fija se aplicaba en papel —la barra se esconde, la
   reserva no— y el PDF salía con 64px de aire arriba de la primera hoja.

2. **`test-responsive.js` matcheaba un `@page` que estaba DENTRO de un**
   **comentario.** El bloque del pie explica su mecanismo nombrando
   `@page` en prosa, y el matcher —`@page` … `{` … `}`— arrancaba ahí y
   se comía el comentario entero hasta la primera llave que encontrara,
   que resultó ser la de un `.demo-barra` con un `font-size` adentro.
   Resultado: denunciaba una `@page` sin reserva que no existe, y recién
   cuando alguien insertaba una regla nueva en el medio — o sea lejísimos
   de la causa. Ahora se parsea el CSS **sin comentarios**. Es la misma
   familia que el ancla `\r?\n` del punto 51: no cambia la propiedad que
   se defiende, cambia que se pueda romper por algo que no tiene nada que
   ver con ella.

Y una tercera, la de siempre: **el gris de lo bloqueado arrancó en**
**`#6f6f6f`, que da 3,43 sobre la tarjeta** —medido con la misma
`CLUB.contraste()` que usa el panel— o sea por debajo del 4,5 de AA. Lo
que está un escalón más arriba tiene que poder LEERSE: es justamente lo
que se le está ofreciendo al cliente.

---

## 53. EL ALTA DE CLIENTES DESDE EL PANEL MASTER

La guía para quien opera está en
[`GUIA_ALTA_CLIENTES.md`](GUIA_ALTA_CLIENTES.md). Acá va por qué es así.

### El alta real de Sud América tenía CUATRO defectos, y ninguno se veía

Medido el 2026-09-11, con el primer cliente que llegó por Instagram:

| | Qué pasaba | Síntoma |
|---|---|---|
| 1 | el formulario perdía el foco en cada tecla | no se podía escribir |
| 2 | el JSON pedía `sud-america-primera`, KV tenía `sudamerica-primera` | «No existe esa categoría» en cada hoja |
| 3 | el equipo propio decía `SUDAMERICA` y el libro `SUD AMERICA LP - MM` | el cliente habría visto CERO equipos |
| 4 | un alta hecha desde la pantalla no alcanzaba | sin JSON en el repo, el panel cargaba los valores de Reconquista |

El 3 es el peor: no deja error en ningún lado. Es la trampa del punto 19
(«la letra importa») con otro disfraz — acá lo que faltaba era un espacio
y el `LP`.

### 1 · El foco · un input de texto NO SE REPINTA NUNCA

`campoAlta()` llamaba a `refrescarAlta()`, que reconstruía `#hubAlta`
entero **con los inputs adentro**. El comentario de al lado decía
«tipear NO repinta», y era cierto para la pestaña, no para el bloque.

Ahora son tres zonas, cada una se repinta por su motivo:

```
#hubAlta         el formulario · solo desde un SELECT o un RADIO, y devuelve el foco
#hubAltaEquipo   la lectura del libro y la elección del equipo
#hubAltaEstado   qué falta, los avisos y el botón · en cada tecla
```

Lo que depende de lo tipeado —el id que se completa solo, el borde rojo—
se escribe **sobre el nodo que ya está** (`ponerValor`, `marcar`).

**El test lo EJERCE**, no lo lee: tipea un nombre de 20 letras sobre un
DOM de mentira y cuenta las escrituras de `#hubAlta`. Verificado al
revés: con el bug de vuelta, «20 repintados» y caen 6.

### 2 · Las categorías salen del CATÁLOGO · el JSON pone la marca

`CLUB.reconciliar()` cruza el JSON (puede no haber) con el club que
publica `/api/v1/catalogo`. Lo llama `resolverClubYPlanilla()`, el único
punto que resuelve el club (punto 2), antes de inicializar la categoría.

- **La lista de categorías es del SERVIDOR**: es el que sabe qué libros
  hay y el que las va a servir. Una categoría del JSON con un slug que el
  servidor no tiene se descarta — era la que devolvía «No existe».
- **Donde nombran la MISMA categoría (mismo `slug`), gana el JSON**: su
  `id` es la clave de los estados y de los links ya compartidos (punto 6),
  y su etiqueta y su nivel son lo que el club declaró.
- **Sin JSON se arma la config desde el catálogo**: nombre, liga,
  categorías y el patrón del equipo propio, **anclado sobre la clave
  normalizada** — sin anclar, `DEPORTIVO LA PLATA` se llevaría a
  `DEPORTIVO SAN VICENTE` (punto 6). El cartel rojo se retira.
- **Con techo de 4 s** y sobre la misma promesa que ya pidió el selector
  de cliente: no es una petición de más ni puede demorar el arranque.
- **Degrada solo**: sin backend, sin token, en la landing o en la demo,
  la config queda exactamente como la dejó el JSON.

Lo que el JSON sigue aportando y la pantalla no puede: el escudo, los
colores, las zonas y la preconfiguración. Sin él, el panel funciona con
el acento por defecto y las iniciales del club.

### 3 · Reusar un libro sin que su id viaje

Dos clientes del mismo torneo leen el mismo libro. `alta` acepta
`libroDe: "<club>/<categoria>"` y **el servidor copia el id**: nunca
llega al navegador (punto 29). El libro sale, en orden, de `libroDe`, de
un `sheetId` pegado, o —si la categoría ya existe— **se conserva**:
exigir el id para corregir una etiqueta obligaría al admin a buscar un
dato que el navegador no tiene.

**La categoría se FUSIONA en vez de reemplazarse.** Reemplazarla por
`{label, sheetId}` borraba en silencio el `nivel` publicado (punto 45),
y la CLI tenía el mismo defecto: se corrigieron las dos.

El servidor **sigue rechazando la URL entera** (hay un test que lo fija y
el motivo es bueno); la que acepta el link pegado es la pantalla, que
saca el id con `idDeLibro()`.

### 4 · Los equipos del libro · lo que reemplaza a `probar-google.js`

`POST /api/v1/catalogo/equipos` (solo ADMIN) lee el libro y devuelve sus
equipos con la **clave** que usa el gate, así el equipo propio se ELIGE
de una lista. El motor puro es `server/lib/catalogo-libro.js`.

- **En su propio archivo** (`server/api/libro.js`) y no en
  `handlers.js`: la ruta que solo lee no comparte archivo con la única
  que escribe el catálogo.
- **POST y no GET**: puede llevar el id de un libro nuevo, y un id en la
  query termina en los logs de acceso.
- **Los dos modos de fallar dicen su remedio** (punto 18 bis): no
  compartido → con qué mail compartirlo; no existe → revisá el link.
- **La fila TIPO no es un equipo**: ofrecerla dejaría al cliente sin
  ninguna ficha.

La pantalla **propone** el equipo por palabras en común con el nombre
del club (Jaccard, sin las palabras que no distinguen: `club`, `la`,
`plata`, `lp`…). Solo con un ganador claro: **con empate no propone**, y
lo propuesto queda elegido en la lista y dicho en pantalla.

### 5 · Nada se aplica en silencio

Dar de alta y editar pasan por el modal de confirmación (punto 30), con
el diff campo por campo. Sin cambios, el botón del modal se apaga. Al
guardar, el formulario queda **editando** lo guardado: un segundo
«Guardar» corrige esa categoría en vez de intentar crearla otra vez.

### 6 · Un repintado AJENO no roba el foco · lo que solo vio Chrome

Con el formulario ya arreglado, la prueba en Chrome real —tipeando tecla
por tecla con `Input.insertText`— perdió el foco igual, en la 8.ª letra
de «Sud América La Plata». No era el tipeo: era **`renderSection()`
repintando la sección porque llegaron escudos nuevos** (punto 6), y el
Panel Master es una sección más. Un admin que empieza a escribir apenas
entra lo sufre una vez, y lo más probable es que eso fuera parte de lo
que se vio en el reporte original.

El test sobre un DOM de mentira no lo podía ver: ahí no llegan escudos.

`SGADD_UI.conservarFoco(repintar)` reenfoca el nodo NUEVO con el mismo
`id`, con el cursor donde estaba. Va en los cuatro repintados de vista
entera: `renderSection()`, `configPintar()`, el catálogo que llega tarde
(`sgadd-clientes.js`) y la lista del hub. Sirve para TODAS las secciones
con campos, no solo el alta — y funciona porque ningún formulario del
panel guarda su valor solo en el DOM (punto 17).

Medido después, en Chrome, **forzando un repintado en la 5.ª letra**: 0
letras perdidas sobre 20. Antes del arreglo se perdían 13.

### Lo que hay que respetar al tocarlo

- **Los ids no se editan.** El del club viaja en `?club=` y en los
  tokens; el de la categoría es la clave de estados y links. La pantalla
  los muestra en solo lectura al editar.
- **El id de categoría se propone SIN el año** (`primera`, no
  `primera-2026`): la categoría sobrevive a la temporada.
- **La guía nombra botones, y un test verifica que existan** en la
  pantalla. Una guía que manda a buscar un botón que no está es peor que
  no tener guía.

---

## 54. LOS CLIENTES DEL MISMO LIBRO · alcance, herencia y color

Auditoría del 2026-09-11 sobre los clientes dados de alta desde el Panel
Master (Hogar Social y Universitario, sobre el libro de DEPORTIVO), medida
en producción con links de cliente de verdad. Tres defectos, y ninguno
dejaba un error visible.

### 1 · «PUBLICAR» NO LE LLEGABA A NINGÚN CLIENTE

`SGADD_CLIENTES.iniciar()` pedía el catálogo **solo con rol ADMIN**
—nació para el selector de clientes— y de ese catálogo leen las zonas
publicadas (`SGADD_CONFIG.publicado`), los partidos sin estadísticas
(`clasifManualesVigentes`) y el nivel. Para un cliente la lista era
`null` y todo caía al JSON del repo:

```
                  catálogo   zonas desde   zonas   partidos manuales
cliente DEPORTIVO    no        el JSON        3            0
admin DEPORTIVO      sí        publicado      4          2 (4 badges)
```

O sea que la respuesta a «¿alcanza con Publicar?» era **no**, aunque la
pantalla dijera que sí. Ahora **toda sesión con token pide el catálogo**;
lo que sigue siendo solo del admin es el SELECTOR (`seMuestra`), y lo
comercial el servidor ya no se lo manda a quien no es admin.

- El arranque lo entrega ANTES de inicializar la categoría
  (`reconciliarConCatalogo` → `SGADD_CLIENTES.recibir`): el primer
  pintado ya sale con lo publicado.
- Si llega tarde, `recibir()` repinta **una vez** la sección que lo
  muestra (Clasificación o Principal).

**Publicar alcanza. Exportar el JSON es un respaldo opcional** del repo:
sirve si el servidor no contesta —el panel cae a ese archivo— y deja el
cambio en el historial. La pantalla lo dice con esas palabras. La
PRECONFIGURACIÓN (pestaña Torneo) es la excepción: no tiene publicación,
así que ahí sí hay que exportar y commitear.

### 2 · EL COLOR DE MARCA · un club sin JSON salía con el naranja de Reconquista

Es el tema por defecto del panel. El catálogo guarda ahora `acento` por
club (lo escribe el alta, lo publica `publico()` para todos) y
`CLUB.reconciliarConfig` lo aplica: **el publicado le gana al del JSON**,
por la misma cascada que las zonas (punto 31). La variante oscura se
DERIVA — pedirle al admin un segundo color es pedirle un dato que no tiene.

El formulario de alta tiene **«Color de marca»** con un botón **«Del
escudo»**: `CLUB.colorDeEscudo()` agrupa los píxeles opacos en cubos de 32
niveles, descarta blancos, grises y negros, y devuelve el **promedio** del
cubo ganador (el centro del cubo es un color que el escudo no tiene).
Contrastado contra los dos colores medidos a mano:

```
DEPORTIVO     escudo #34358a   JSON #33348a
Sud América   escudo #075c1d   JSON #0d5e27
```

**Un escudo blanco y negro no propone ningún color** — el de Universitario
lo es — y la pantalla lo dice: ahí el admin elige. El escudo del header,
sin JSON, sale del EQUIPO propio (`equipoEscudo`) y no del nombre del club.

### 3 · LO QUE ES DEL TORNEO VIVÍA EN UN CLIENTE

Las zonas y los partidos sin estadísticas son hechos del TORNEO, pero se
guardaban en el cliente que los cargó: el que se sumaba al mismo libro
arrancaba sin zonas y con una tabla que no cuadraba. En producción, los
cuatro clientes del libro de DEPORTIVO tenían **tres formatos distintos**
(uno sin zonas, uno con la última zona rotulada «Zona nueva», uno —el
JSON de Sud América— sin la Zona C) y solo DEPORTIVO tenía los 2 partidos.

Dos piezas, las dos en `catalogo-mutar.js`:

- **HERENCIA** (`heredarDelLibro`): una categoría que ESTRENA libro trae
  las zonas del libro elegido con `libroDe` —o del primero de ese libro
  que tenga— y los partidos de TODOS los clientes del libro, sin repetir.
  **No pisa nada**: si ya tenía zonas o partidos, se quedan. Corregir la
  etiqueta de una que ya estaba no hereda.
- **ALCANCE**: todo cambio del Panel Master pregunta **«¿En qué clientes
  querés aplicar este cambio?»** — solo este, los que comparten su Sheet ID,
  o todos.

### La tabla de alcances es UNA, en sgadd-auth.js

```
zonas              este · libro · todos
partidos_manuales  este · libro          (en otro libro esos equipos no existen)
cambiar_plan       este · libro · todos
renovar            este · libro · todos
todo lo demás      este                  (pausar, dar de baja, el alta, el informe)
```

`ALCANCES_POR_ACCION` vive en el módulo que comparten el navegador y el
servidor —igual que `CUPO_MAILS`—: el modal lo lee para ofrecer las
opciones y `aplicar()` lo hace cumplir. **Las tres opciones van siempre a
la vista**; las que no corresponden salen grises con el texto de
`motivoSinAlcance`, porque una opción que desaparece obliga a adivinar.

Reglas que hay que respetar al tocarlo:

- **Quién comparte libro lo decide el sheetId, en el servidor.** El
  navegador recibe solo una HUELLA (`libro`, FNV-1a de 8 hex, **solo el
  admin**) que dice que dos categorías leen el mismo libro sin decir cuál.
- **Todo o nada.** `aplicar()` recorre los clubes sobre el catálogo que va
  quedando; si uno falla, no se escribe ninguno y el motivo nombra al club.
- **A un club de UNA categoría se le escribe el bloque del club; a uno de
  varias, el de ESA categoría** (`crearBloque`), para no darle a sus otros
  torneos las zonas de este.
- **Nunca viajan las claves del que publica**: `datosPara()` le saca el
  `porCategoria` y la `claveVieja`, que son de SU club.
- **La respuesta dice a quiénes llegó** (`aplicadoA`) y qué heredó el
  nuevo (`herencia`), calculado por el servidor: la pantalla lo muestra
  tal cual.

### La clave de una categoría es su SLUG

Las zonas propias (`porCategoria`) y los partidos se guardaban con el id
de planilla del JSON (`naranja-u21-clausura-2026`), que el servidor no
conoce: sin el slug (`reconquista-u21`) no podía nombrar la categoría de
otro cliente. `SGADD_CONFIG.clavesDeCategoria()` busca por **las dos, el
slug primero**, así lo guardado antes sigue valiendo; lo que se publica va
por slug con la `claveVieja` para que el servidor la borre, y un club de
una sola categoría se migra en el mismo gesto.

**Al publicar un bloque de club, las claves de `porCategoria` pasan a
slug** (`porCategoriaASlugs`) y si una figura con las dos gana la del id
de planilla: es la que acaba de editar la pantalla.

### Lo que el alta NO hereda, y por qué

La **preconfiguración** (calendario, equipos esperados, sellos) vive solo
en el JSON y en el navegador, no en el catálogo: un cliente sin JSON no la
tiene. Es la misma deuda de la pestaña Torneo — no se publica.

---

## 55. EL PLAN EFECTIVO, LA RACHA Y EL ARRANQUE SIN DESTELLO

Tres correcciones del 2026-09-11, las tres medidas en producción.

### 1 · El plan que se muestra y se hace valer es el del CATÁLOGO

Síntoma: un admin mirando Universitario —que el Panel Master pinta en
**Bronce**— veía «◆ Plan ORO · Auditoria MotorStats activa». Dos causas:

- **`planEfectivo` sin plan en el club mandaba el del TOKEN**, o sea el
  del link de quien mira: para el admin, ORO. El Panel Master, en cambio,
  pinta un plan vacío como Bronce. Ahora, **con el catálogo de KV, un club
  sin plan es BRONCE**; con el de RESPALDO (entorno o código, cuando
  Upstash no contesta) sigue mandando el del link, porque esos catálogos
  no traen planes y castigar a todos con Bronce por una caída sería peor.
  `planEfectivo(club, sesion, origen)` recibe el origen; sin él se
  comporta como antes.
- **El panel decidía el menú con el plan del LINK.** `tieneModulo` lee la
  sesión, que sale del token, así que un cliente bajado a Bronce seguía
  viendo Scouting y chocaba contra un 403. El servidor declara ahora el
  efectivo en `usuario.plan` del catálogo (el del club del token) y en
  `alcance.plan` con los datos, y `adoptarPlanEfectivo()` lo pone en la
  sesión (`SGADD_AUTH.fijarPlanEfectivo`) y repinta menú, pie y la sección
  abierta si depende del plan.

**Solo el CLIENTE adopta.** Para un admin `alcance.plan` es el plan del
club que está mirando, no el suyo: adoptarlo le haría decir «Plan Bronce»
en su propio pie. El admin no tiene restricciones de todos modos.

El scouting declaraba en su respuesta el plan del token aun después de
decidir con el efectivo: ahora declara el efectivo.

### 2 · La racha con los partidos sin estadísticas

`e.racha` sale del núcleo, que solo ve los partidos con box score: un
partido cargado a mano no cortaba ni estiraba la racha del encabezado.
`SGADD_CLASIF.rachaConManuales(partidos, detalleManual)` los ordena como
el núcleo —por fecha, los sin fecha al final— con los manuales en SU
fecha; sin manuales da exactamente la racha del núcleo. La fecha manual
se lee como medianoche LOCAL, que es como el núcleo lee las de la
planilla. `clasifRachaDe(idx, e)` le pasa los del tramo abierto.

**El informe de scouting sigue con la racha y el récord del núcleo**
(`SGADD_SCOUT.fichaEquipo`): el motor es puro y no conoce el catálogo.

### 3 · El cartel rojo espera al catálogo

Un club dado de alta desde el Panel Master no tiene `clubes/<id>.json`
(punto 53), así que el fetch del JSON da 404 en CADA carga. El cartel
«Configuración del club no encontrada» salía a los 0,3–1 s y el cruce con
el catálogo lo retiraba enseguida: un destello rojo en cada F5.

Medido con un observador de mutaciones instalado antes del primer script
(`Page.addScriptToEvaluateOnNewDocument`) sobre tres arranques: era el
**único** nodo rojo transitorio. El resto de lo que se pinta en rojo son
datos (porcentajes por debajo de la liga), no avisos.

Con backend y token el cartel queda PENDIENTE (`estado.cartelPendiente`)
y `CLUB.confirmarSinConfig()` lo muestra recién si ni el JSON ni el
catálogo trajeron al club; lo llama `resolverClubYPlanilla()` después de
`reconciliarConCatalogo()`. **Sin backend sale en el acto, como siempre**:
ahí no hay nada más que esperar.

---

## 56. EL RESTO DEL PLANTEL Y LA FICHA DEL PLAN ORO

Dos cambios del informe pre-partido que entraron juntos porque tocan el
mismo tramo: lo que pasa DESPUÉS de la tabla de jugadores clave.

### 1 · El bloque del banco · `SGADD_SCOUT.restoDelPlantel`

`jugadoresClave` se queda con los ocho que más juegan. Los otros —cuatro,
ocho, a veces doce— no aparecían en ninguna parte del informe, y ahí es
donde vive el factor X del banco: el que entra diez minutos y produce al
ritmo de la rotación. El bloque los nombra con sus etiquetas y AVISA
cuando uno destaca, sin gastarle a cada uno una ficha táctica entera.

**LAS MÉTRICAS SON TASAS, NUNCA CUENTAS POR PARTIDO.** Comparar los PTS
por partido de un suplente de nueve minutos contra los de la rotación no
mide otra cosa que los minutos: la diferencia está garantizada de antemano
y la alerta no diría nada. Las seis son `PTS/min`, `USG%`, `eFG%`,
`RT/min`, `AST/min` y `PR/min`.

**Y por eso `RO%`/`RD%` quedan AFUERA aunque sean tasas**: su denominador
es del EQUIPO y el motor NO las prorratea por minutos (punto 24), así que
un suplente las tiene bajas por no haber estado en cancha y no por no
rebotear. Los rebotes entran por minuto, que es la pregunta que se quería
hacer. Hay un test con un suplente de `RO%` altísimo que no puede
disparar nada.

**La referencia es su ROL FUNCIONAL, no su banda de minutos.** La pregunta
del DT es «de los que hacen su trabajo en esta liga, ¿cuánto produce
éste?»; un grupo de pares por minutos lo compararía contra otros
suplentes, o sea que escondería justamente al que hay que ver. El pool son
los **calificados**, que es el universo con el que el proyecto ya arma
percentiles y bandas (punto 8).

La cascada es la del grupo de pares (punto 42): **rol → liga**, con el
mismo piso de 3, y el nivel VIAJA en el resultado y se dice en el tooltip.
Una referencia degradada en silencio es peor que ninguna. Una **mediana de
CERO** no sirve de denominador y degrada igual: un «+∞%» no es una alerta,
es una división.

Lo demás que hay que respetar al tocarlo:

- **El corte sale de UNA sola función** (`plantelOrdenado`). Dos
  ordenamientos calcados terminan partiendo en distinto lugar y un jugador
  saldría en los dos bloques o en ninguno. Los dados de BAJA salen de los
  dos, igual que salían del plan.
- **+35% es el umbral**, el que pidió el club. Con 15% la mitad del banco
  dispara una alerta y el bloque vuelve a ser una lista que nadie lee.
- **Dos alertas por jugador como mucho**: el bloque existe para NO
  saturar, y seis alertas en una tarjeta son otra ficha táctica.
- **La muestra corta se MARCA, no se borra** (punto 8): por debajo de 3
  partidos o de 8 minutos —los dos pisos del punto 4, leídos de
  `sgadd-partido.js` y no copiados— la alerta sale con el `~` de siempre.
- **Las etiquetas se piden al motor compartido** (`jugadoresBadges`), no
  se rearman: con dos renderizadores el mismo jugador saldría con chips de
  un color en la ficha y de otro tres centímetros más abajo.
- El chip `.badge-impacto` va **a mano en el `<style>`** con su regla de
  `@media print`, como todo nodo inyectado (punto 12), y reusa la paleta
  ya MEDIDA del badge de partidos manuales (punto 44).

### 1 bis · Es una TABLA de dos columnas, no tarjetas

```
JUGADOR · MUESTRA · VÍA DE GOL LÍDER                          PERFIL
NOMBRE  PJ · MIN · PLAYS · PTS · USG   🎯 Doble 18/35 · 51,4% · 1,03 PPT   ▲ PPP 1,12   ⚡ +80% PTS/min vs su rol     [ADN] [perfiles] [función]
```

**La columna del jugador es UN SOLO FLUJO que envuelve solo cuando no
entra**, y eso es lo que la hace compacta. La primera versión en tabla
ponía nombre, vía y chips en renglones separados y quedó **más alta que
las tarjetas**: 65px por fila, 513px contra 407 para seis suplentes. La
columna tiene ~800px en la A3 y todo eso ocupa ~700, así que entra en un
renglón y el que trae alertas baja a dos. Medido en modo papel, A3:

```
                 tarjetas   tabla
 6 suplentes      407px     314px   −23%
12 suplentes      655px     490px   −25%
```

El PDF sigue en 9 hojas con ORO y 7 con PLATA: el bloque ya abría hoja.

**La VÍA DE GOL LÍDER se elige por el PESO en sus plays (`PT2%`/`PT3%`/
`PT1%`), no por los intentos crudos** —`viaDeGolLider`, sobre la MISMA
`ZONAS_TIRO` del tab Tiro—. Dos libres son UN play: por intentos, el que
va seguido a la línea saldría «tirador de libres» con la mayoría de sus
ataques terminando en otro lado. Sin la columna de peso decide por
intentos y lo declara (`criterio`); con empate desempatan los intentos.

- **Los intentos van TOTALES con el acumulado** (`__acum`): «18/35» dice
  la muestra, que es para lo que se muestran. Sin acumulado van **por
  partido y rotulados `x PJ`** — multiplicar un promedio redondeado por
  los PJ daría un total plausible y falso. El demo cae ahí: su libro no
  trae un `ACUMULADO J` completo (punto 8).
- **El % sale del MISMO par que se muestra.** «18/35 · 60%» no puede
  quedar escrito.
- **Sin un solo intento dice «Sin lanzamientos registrados»**, no «0/0».

**La EFICIENCIA INDIVIDUAL es el `PPP` en su banda contra la liga**
(`eficienciaIndividual`, con la misma `bandaLiga` del informe): suma los
libres y las pérdidas, o sea lo que un play del jugador le rinde al
equipo. Va con flecha además del color y con el `~` de la muestra corta,
que es **una sola función** (`muestraCorta`) para el badge y para las
alertas. Sin dispersión en la liga la banda es `null`: no se inventa.

**Las alertas llevan un texto CORTO en la fila** («+80% PTS/min vs su
rol») y el largo, con los dos valores, en el `title`. **La columna del
perfil lleva TODAS las etiquetas**, la función en cancha incluida: en la
tabla ya no se repite en otra línea. En el papel la tabla va con
`table-layout: fixed`, para que los chips no le roben ancho a la columna
del jugador.

### 2 · LA FICHA POR JUGADOR ES DEL PLAN ORO · la matriz de BLOQUES

`MODULOS` decide a qué PANTALLA se entra. La ficha individual es un bloque
ADENTRO de una pantalla que el Plata sí abre, así que necesitaba un
segundo nivel: `SGADD_AUTH.BLOQUES`, con clave `<seccion>.<bloque>` —el
`data-bloque` del DOM con su sección adelante—, así el gate, el modal de
exportación y la declaración del servidor nombran lo mismo.

**No se mete en `MODULOS`**: esa matriz se compara contra `SGADD.SECCIONES`
en los dos sentidos y un bloque ahí sería una sección que el router no
conoce. **Y hereda la regla de su sección**: para ver un bloque hay que
poder entrar a la pantalla que lo contiene.

```
scouting.fichas   →  Plan ORO
```

- **Un bloque sin declarar se trata como ABIERTO**, igual que una sección
  sin regla. Del lado del servidor la asimetría es la inversa
  (`reglas.puedeBloque` falla CERRADO) y por el mismo criterio: allá lo que
  se pierde con un default permisivo son datos.
- **La comparación por ORDEN vive en `alcanzaPlan`**, que usan las dos
  matrices. Dos copias terminan distintas (punto 8), y ya pasó con MASTER
  quedándose sin Scouting.
- **El Plata NO pierde el informe**: lo que se acota es el bloque. En su
  lugar va una card que dice qué incluye la ficha y cómo pedirla — el punto
  del gate es que el cliente SEPA que existe (punto 19). Lleva
  `.no-imprimir`: un PDF con el cartel de upgrade adentro no se le muestra
  a nadie.
- **El modal de exportación no ofrece lo que no se pinta**
  (`scoutCardsVisibles`): tildarlo metería ese cartel en el PDF.
- **La landing lo DERIVA**, igual que las secciones. La regla vive en
  `BLOQUES` y la copia en `sgadd-landing.js`; un bloque declarado sin copia
  no se ofrece y hay un test que lo denuncia. Hoy la card de Oro suma la
  ficha además del servicio de scouters.

### Quién decide, y por qué esto sigue siendo un gate de interfaz

**Manda el servidor**: `alcance.bloques` declara, por id completo
(`{'scouting.fichas': false}`), lo que concede el plan EFECTIVO del
catálogo, que puede ser más estricto que el plan firmado en el link
(punto 55) — medido en producción: un cliente con un link que dice ORO y
PLATA en el catálogo recibe `false`. Sin esa declaración —GViz directo, la
demo, un libro abierto sin token— decide el motor local.

**Y viaja con los DATOS (`/api/v1/equipos`), no solo en `/scouting`.** Ese
segundo endpoint existe pero el panel no lo llama: el libro entero le
llega por `/equipos` y el informe se arma en el navegador. Declarado nada
más allá, el mapa no tenía quién lo lea — la primera versión llegaba
`null` a los cuatro clientes de producción. Por eso la clave es el id
COMPLETO y no el nombre corto del bloque: el `alcance` de los datos no es
de ninguna sección en particular.

Y hay que ser honesto sobre qué significa: **la ficha se calcula en el
navegador desde las MISMAS filas** que alimentan la tabla de jugadores
clave y el plan de marcas, que sí viajan. O sea que esto no es retener
datos —no se puede, sin romper la parte que el plan sí incluye— sino que
el servidor sea el que decide. Es exactamente lo que el punto 19 dice del
resto del módulo, y vale por lo mismo.

**La demo pública entra como PLATA** (punto 52), así que muestra la card
de venta en vez de la ficha. Es deliberado: la demo vende Plata, y el
escalón siguiente tiene que verse.

