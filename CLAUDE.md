# SGADD · Sistema de Gestión y Análisis de Datos Deportivos

Panel de scouting de básquet para **Club Reconquista La Plata**, multi-cliente.
Sitio estático publicado en GitHub Pages: `https://coachgn.github.io/estadisticas/`

Hablar siempre en **español rioplatense**, directo y técnico. Sin explicaciones de
principiante sobre el contenido técnico.

---

## 1. Cómo correr y verificar

```bash
node test-core.js          # 102 tests · núcleo, índice, validador
node test-logos.js         #  18 tests · resolución de escudos
node test-ligas.js         #   9 tests · aislamiento entre ligas
node test-clubes.js        #  22 tests · multi-cliente
node test-boot.js          #  16 tests · arranque por club
node test-jugadores.js     #  75 tests · rol, arquetipos, jerarquía, tiro, evolución, local/visitante
node test-4factores.js     #  94 tests · regresión, pesos de liga, perfil de equipo, Simulador 360°
node test-personalidad.js  #  20 tests · identidad táctica
node test-informe.js       #   7 tests · secciones del informe
node test-partido.js       #  17 tests · detalle partido a partido
node test-scouting.js      # 160 tests · informe pre-partido, bandas de liga, marcas, claves
```

**540 tests en total. Todos tienen que dar verde antes de commitear.**

Todos los `test-*.js` corren **desde la raíz del repo** (no desde `js/`): sus
`require('./js/sgadd-core.js')` son relativos al propio archivo, no al cwd.
Un `test-*.js` subido a `js/` por error rompe con `MODULE_NOT_FOUND` aunque se
invoque `node test-x.js` desde la raíz — ya pasó una vez con una subida manual
por la web de GitHub.

Algunos tests extraen módulos del `index.html` en tiempo de ejecución
(`logos-extraido.js`, `boot-extraido.js`). Son temporales: se generan, se usan y
se borran dentro del propio test. No commitearlos.

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
  sgadd-diagnostico.js  ← auditoría de datos, visible en la app
clubes/
  reconquista.json      ← 2 planillas (Primera + U21 Negra), liga la-plata
  jujuy.json            ← 1 planilla (Conferencia Norte), liga liga-argentina
logos/<liga>/           ← escudos + index.json (manifiesto)
test-fixtures/          ← prom.tsv + p4f.tsv, 12 equipos de La Plata (committeados)
simulador-4factores-legacy.js ← Apps Script original (auditado, no se ejecuta:
                          ver punto 10). Queda como referencia de qué se corrigió.
```

**Versión actual de assets: `?v=39`.** Los `<script>` llevan query string para
bustear el caché de GitHub Pages. **Subir el número en CADA entrega**, si no el
navegador sirve la versión vieja y se pierden horas debuggeando fantasmas.

### Orden de carga (importa)

`sgadd-club.js` va primero y se auto-arranca. `resolverClubYPlanilla()` en el
`index.html` es el único lugar que resuelve club → `SHEET_ID`, y lo llaman tanto
`init()` como `refreshData()`. **Nunca duplicar esa lógica**: cuando estuvo en dos
lados, `init()` quedó sin ella y Jujuy mostraba los datos de Reconquista.

---

## 3. Modelo de datos

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

## 5. Validadores (sección Diagnóstico)

1. **Contrato de esquema** — columnas faltantes por hoja, error vs aviso
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

## 7. PENDIENTE · Exportación a PDF

**Estado: no resuelto. Retomar en entorno local con navegador real.**

Hay dos exportaciones:
- **Informe de equipo** (`sgadd-informe.js`): modal con checkboxes, `?club` +
  rival opcional
- **Informe post-partido** (`equiposImprimirPartido()`): una carilla A4

Enfoque elegido: `window.print()` + `@media print`. **No usar html2pdf/jsPDF**:
los canvas de Chart.js no rasterizan bien y los cortes de página quedan mal.

### Problemas abiertos

1. **Márgenes negros.** Chromium ignora `background` dentro de `@page`; el color
   de la hoja sale del elemento raíz. Se intentó blanquear `:root, html, body` y
   neutralizar `.bg-base` (clase de Tailwind, inyectada después del `<style>`).
   **Sigue saliendo negro.** Debuggear con DevTools → Rendering → Emulate CSS
   media type: print, que permite inspeccionar el DOM impreso en vivo.
2. **Nombres de jugadores ilegibles** en el box score impreso: fondo oscuro con
   texto oscuro. La regla `thead th { background: #141414 }` se aplica por
   elemento, no por clase, y sobrevive a los overrides.
3. **Fidelidad de color**: se quiere conservar acentos, verdes y rojos de la app,
   con fondo claro. `print-color-adjust: exact` está puesto pero sin verificar.

### Presupuesto medido (A4, margen 10mm = 277mm útiles)

```
Encabezado 22 · Insight 46 · 4 Factores 26 · Eficiencia 20
Box scores EN PARALELO 68 · Nota 6 · Próximo cruce 30
TOTAL 218mm
```

Los box scores van lado a lado: en columna no entra. El bloque "Próximo cruce"
va al final con `page-break-before: auto` — mejor dos hojas fluidas que una
amontonada.

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
| Jugador Clave | +26 | Dependencia Absoluta |
| Jugador Importante | 23 a 25 | Consistencia Estructural |
| Jugador de Rotación | 13 a 22 | Impacto Quirúrgico |
| Pocos Minutos | menos de 13 (marca aparte si es <10) | Contención y Emergencia |

Ojo: esto es **distinto** de `liga.minJugador` (el umbral de calificación
para que un percentil tenga sentido, que sí es relativo a cada liga). Un
jugador puede ser "Jugador Clave" por minutos y a la vez no calificar para
percentiles si la liga entera juega poco — son preguntas distintas.

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

| Perfil | Condición |
|---|---|
| 🎯 Terminador de Élite | PLAYS > liga, eFG% > 1.15x liga, PPP > 1.05 |
| 🧠 Generador | AST-PP > 1.40 |
| 🏰 Puntal en la Pintura | RO+RD > 1.20x el promedio de la liga |
| 🎯 Amenaza Perimetral Real | T3I > 3.0 y T3% > 34% |
| 🧤 Especialista Defensivo | recuperos (PR) > 1.30x el promedio |
| 📏 Buscador de Contacto | PT1% > 25% y T1% > 80% |

Jerarquía (`JERARQUIA`, **sí excluyente**: cascada, gana el primero que
calza, de más a menos exigente):

1. ⭐ **Jugador Franquicia** — PLAYS > 1.20x liga y más de 28 minutos.
2. ⚔️ **Referente Ofensivo / Segunda Espada** — PLAYS por encima del
   promedio de la liga.
3. 🧱 **Pieza de Quinteto Titular** — MIN ≥ 23, sin ser el foco de PLAYS.
4. 🛠️ **Especialista de Rol** — el resto (fallback, siempre calza).

La síntesis (Tab General) muestra impacto colectivo y eficiencia individual
en Alto/Medio/Bajo contra la liga, más un "punto de fuga" (el percentil más
bajo entre eFG%/PePP%/RTL%/AST-PP/T1%) y una conclusión táctica. **No es
una recomendación de renovación de contrato** — el club es amateur, no
gestiona pases — es la condición de uso para sacarle el máximo (ej. "limitar
minutos", "trabajar tal debilidad").

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
4. **Plan individual · marca asignada** — perfil defensor, consigna y
   restricción sugeridas, **editables**: el plan lo firma el DT.
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

### Exportación a PDF por cards

Botón *🖨 Exportar PDF* → modal con un checkbox por card. Al imprimir,
`scoutImprimir()` marca `body.modo-scout-print`, aplica `.no-imprimir` a las
cards destildadas, llama a `window.print()` y limpia la clase en
`afterprint`. Sin esa clase un Ctrl+P normal no cambia de comportamiento:
en la app conviven dos exportaciones (esta y la del informe de equipo) y no
pueden pisarse.

CSS: `.scout-card { page-break-inside: avoid; page-break-after: always }`,
con `:last-of-type` en `auto` para no arrastrar una hoja en blanco, y
`.scout-ficha` también sin cortes. Los `input[type=text]` de la tabla de
marcas **sí** se imprimen (la regla general de `@media print` esconde todo
input, pero acá el valor cargado por el DT es el contenido del informe).

**`@page` no se puede condicionar por clase del body**, así que es
compartida con la exportación del informe de equipo: quedó en
`A4 portrait, margen 12mm 10mm`. Los problemas abiertos del punto 7
(márgenes negros en Chromium) aplican igual a esta exportación: no está
verificada contra una impresora real.

### Roles funcionales, no posiciones

`ROLES_FUNCIONALES` es una cascada excluyente sin base/alero/pivote:
Generador Primario, Manejador Secundario, Spacing / Tirador de Descarga,
Slasher / Penetrador, Finalizador Corto / Short Roll, Rebotador de Impacto /
Rim Runner, Ancla Defensiva, Perimetral de Media Distancia y un fallback.

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

`esInterior` exige mezcla de triple baja **y** peso real en algún cristal;
`esPerimetral` exige volumen de triple. Si la ficha de JUGADORES ya lo marcó
como *Amenaza Perimetral Real*, eso pisa el cálculo. Verificado con datos
reales: Ferraro Dieguez pasó de "referencia interna" a Slasher / Penetrador.

**Ojo con las fixtures de test**: si un jugador tiene `PT3%` de 5% pero
T3I = 3 de 9 tiros de campo, el motor lo saca de los roles internos — y
tiene razón, esos dos datos describen a un jugador que no existe. La
incoherencia hay que arreglarla en el dato, no en el umbral.

**La planilla no tiene columna de talla ni de posición cargada a mano**, así
que "ficha del jugador" son los arquetipos calculados. Si algún día entra
una columna de altura, el cruce se enriquece en `perfilJugador()` y en
ningún otro lado.

### Marca asignada: "elegir el veneno" con soluciones de campo

La columna **Defensor nuestro** sugiere un PERFIL táctico
(`PERFILES_DEFENSOR`, seis: Especialista 1x1 Perimetral, Defensor Físico de
Contención, Atrapador / Presión al Drible, Defensor de Ajuste / Spacing,
Ancla Interior / Protector de Aro, Defensor Versátil / Cambios), no un
nombre propio: quién lo cubre depende del quinteto en cancha y de las faltas
de cada uno. El campo es editable para poner el nombre al armar la rotación.

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
contra uno de pintura salen distintos sin tocar código. Ocho reglas: ejes de
eficiencia, clausura de tiradores, invitación selectiva al triple,
disciplina de bonus, falta táctica rentable, presión a la conducción,
control del cristal y colapso de la pintura.

Hay pares **deliberadamente opuestos** que nunca pueden apuntar al mismo
jugador, y el test lo verifica: *clausura de tiradores* (T3 caro) vs
*invitación al triple* (T3 barato); *disciplina de bonus* (buen T1%, no lo
mandes a la línea) vs *falta táctica rentable* (mal T1%, mandalo). Si
alguna vez los dos marcan al mismo, hay un umbral mal puesto.

`PERFILES_MARCA`, en cambio, **sí es una cascada excluyente**: un jugador
puede disparar varias reglas de análisis, pero la marca asignada elige una
sola, la de la amenaza más cara (ordenadas de mayor a menor costo esperado).

### Umbrales: relativos donde importa

Pérdidas y rebote ofensivo se miden **x la mediana de la liga**
(`liga.jugadorTipo`), no en absoluto — regla del punto 4. Los que quedaron
absolutos son los que son físicos del básquet y no dependen de la liga: un
75% en libres es bueno en cualquier lado, y 1,20 pts por triple intentado
es caro en cualquier lado.

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
- La `FECHA` viene vacía en varias filas de `4 FACTORES` y en algunos partidos de
  `Base Datos E`. Se hereda por join contra `PARTIDO`; los que quedan sin fecha
  van al final del orden cronológico y se avisa en la UI.
  **`Base Datos J` NO tiene ese join** (queda vacía tal cual viene): por eso
  Jugadores resuelve el id de partido para el link a Equipos por texto de
  `PARTIDO`, no por fecha (ver la regla de `idPartido()` en el punto 3).
  Sumar el mismo join que ya tiene `4 FACTORES` sería la forma prolija de
  cerrar esto de raíz.
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
node test-partido.js && node test-scouting.js

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
