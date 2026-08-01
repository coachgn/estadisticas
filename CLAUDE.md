# SGADD · Sistema de Gestión y Análisis de Datos Deportivos

Panel de scouting de básquet para **Club Reconquista La Plata**, multi-cliente.
Sitio estático publicado en GitHub Pages: `https://coachgn.github.io/estadisticas/`

Hablar siempre en **español rioplatense**, directo y técnico. Sin explicaciones de
principiante sobre el contenido técnico.

---

## 1. Cómo correr y verificar

```bash
node test-core.js          # 94 tests · núcleo, índice, validador
node test-logos.js         # 18 tests · resolución de escudos
node test-ligas.js         #  9 tests · aislamiento entre ligas
node test-clubes.js        # 22 tests · multi-cliente
node test-boot.js          # 16 tests · arranque por club
node test-personalidad.js  # 20 tests · identidad táctica
node test-informe.js       #  7 tests · secciones del informe
node test-partido.js       # 17 tests · detalle partido a partido
```

**203 tests en total. Todos tienen que dar verde antes de commitear.**

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
  sgadd-informe.js      ← modal de exportación PDF del informe de equipo
  sgadd-diagnostico.js  ← auditoría de datos, visible en la app
clubes/
  reconquista.json      ← 2 planillas (Primera + U21 Negra), liga la-plata
  jujuy.json            ← 1 planilla (Conferencia Norte), liga liga-argentina
logos/<liga>/           ← escudos + index.json (manifiesto)
```

**Versión actual de assets: `?v=31`.** Los `<script>` llevan query string para
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

## 8. PRÓXIMO · Sección JUGADORES

El 70% del trabajo de datos ya está hecho:

| Pieza | Qué da |
|---|---|
| `liga.jugadorPartidos` | `Map<jugador, [todos sus partidos]>` |
| `statJugador(clave, métrica)` | media, desvío y N |
| `PROMEDIOS J` | acumulado de temporada |
| `liga.jugadorTipo` | mediana de la liga = percentil 50 |
| `liga.minJugador` | umbral de calificación |

**No hace falta tocar `sgadd-core.js`** salvo: extender `Ruta` con nivel de
jugador, y agregar un índice `jugadoresPorEquipo`.

### Estructura

Misma que Equipos, que ya está probada: **grilla → ficha → tabs**.

- **Landing**: grilla del plantel con minutos, PTS y badge de rol. Filtro por
  equipo (para scoutear rivales) y toggle "solo los que califican".
- **Ficha individual** con tabs:

| Tab | Qué responde |
|---|---|
| General | ¿Qué tipo de jugador es? KPI con percentil, radar de perfil |
| Evolución | ¿Está mejorando? Línea por partido con banda de ±1 desvío |
| Tiro | ¿De dónde anota? T2/T3/T1, volumen vs eficiencia |
| Rol | ¿Cómo lo usan? USG%, AST%, minutos vs compañeros |
| Partidos | Log con desvíos, clic → detalle del partido |
| Comparar | Contra otro jugador o contra el JUGADOR TIPO |

### Lo que le da identidad propia

1. **Consistencia como métrica de primer orden.** Un jugador de 12 puntos con
   desvío 3 es distinto de uno de 12 con desvío 9: el primero es un plan, el
   segundo una lotería. `statJugador()` ya devuelve el desvío. Nadie lo mide.
2. **Arquetipo individual**, con el motor de Personalidad en percentiles
   individuales: *"Anotador de volumen, poco eficiente"*, *"Especialista
   defensivo"*, *"Generador de bajo uso"*.
3. **Curva de carga**: minutos vs eficiencia partido a partido. Responde la
   pregunta de gestión de minutos que la propuesta institucional plantea.

### Orden sugerido

1. `Ruta` con nivel de jugador + `jugadoresPorEquipo`
2. `sgadd-jugadores.js`: grilla, ficha, tabs General/Evolución/Partidos
3. Motor de consistencia y arquetipo individual
4. Tabs Tiro, Rol, Comparar
5. PDF de ficha individual (después de resolver el punto 7)

---

## 9. Deuda técnica conocida

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
- Sin columnas de cuartos/parciales. Hay un hook comentado en el detalle de
  partido listo para cuando existan.
- **El acceso es público.** Los `sheetId` están en los JSON, que son archivos
  públicos. Un sitio estático no puede filtrar nada. Para membresías por niveles
  hace falta backend (Supabase o Cloudflare Workers). `planillasVisibles(scope)`
  ya está preparado para recibir ese scope.

---

## 10. Workflow de Git — OBLIGATORIO

Después de **cualquier** cambio de código o función nueva:

```bash
# 1. Correr TODA la suite
node test-core.js && node test-logos.js && node test-ligas.js && \
node test-clubes.js && node test-boot.js && node test-personalidad.js && \
node test-informe.js && node test-partido.js

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

## 11. Estilo de código

- **Español** en nombres de funciones, variables y comentarios del código propio.
- **Comentar el POR QUÉ, no el qué.** Especialmente en las decisiones que
  costaron encontrar: un `// mes 0-indexado` ahorra una tarde.
- Sin dependencias nuevas. Chart.js y Tailwind CDN es todo lo que hay.
- Módulos con IIFE y un objeto exportado. Compatible con Node para poder testear.
- Tailwind: los colores custom (`text-accent`, `text-ink`) dependen del JIT del
  CDN y **fallan en nodos inyectados dinámicamente**. Para esos casos hay
  respaldos definidos a mano en el `<style>` del `index.html`.
