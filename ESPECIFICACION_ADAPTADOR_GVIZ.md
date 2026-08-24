# Especificación · Módulo Adaptador de Datos (GViz Engine)

> **Fase 1 del plan de construcción.** Estado: **implementado y en producción**.
> Vive en `js/sgadd-core.js`. Cubierto por `test-core.js` (252 tests).
> Documento verificado contra el libro de DEPORTIVO
> (`14tjg3yVANe7DkfrJstGgOfNXffuJEt6Vylob6UqleaQ`) el 2026-08-24.

---

## 0 · Qué es y qué no es

El adaptador convierte **9 hojas de Google Sheets** en **un índice consultable en
memoria**, aplicando por el camino todas las normalizaciones que el análisis
necesita. Es el único punto del sistema que habla con Google.

```
GViz (9 hojas)  →  parsear  →  normalizar  →  scopear  →  indexar  →  idx
```

**No escribe nunca.** No hay `POST`, ni `PUT`, ni token, ni cabecera de
autorización. La única escritura del proyecto entero es el mapa de estados de
jugador en `localStorage`, y no pasa por acá.

---

## 1 · Entrada · lectura GViz

### 1.1 · La URL

```js
'https://docs.google.com/spreadsheets/d/' + sheetId +
'/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(hoja)
```

Anónima. **Requisito del libro: compartido como *Cualquiera con el enlace ·
Lector*.** Un libro compartido solo con su dueño devuelve **401** aunque desde el
navegador del dueño se vea perfecto — fue lo que pasó al dar de alta DEPORTIVO.

### 1.2 · Las 9 hojas

| Hoja | Tipo | Grano |
|---|---|---|
| `Base Datos E` | maestra | equipo × partido |
| `Base Datos J` | maestra | jugador × partido |
| `4 FACTORES` | maestra | equipo × partido |
| `PROMEDIOS E` · `ACUMULADO E` | derivada | equipo × temporada |
| `PROMEDIOS J` · `ACUMULADO J` | derivada | jugador × temporada |
| `PROMEDIOS 4F` · `ACUMULADO 4F` | derivada | factores × temporada |

`RANKINGS E` y `RANKINGS J` **están excluidas a propósito** (`HOJAS_EXCLUIDAS`).
No son tablas planas sino informes maquetados con encabezados repetidos: GViz
asume fila 1 = headers y devuelve basura. Los rankings se **derivan en el
cliente** desde `PROMEDIOS J`.

### 1.3 · Concurrencia y techo

Las 9 se piden **en paralelo** con `Promise.all`. Cada una tiene un techo de
`TIMEOUT_HOJA` = **20 s**, implementado con **dos** mecanismos que hacen falta
los dos:

- **`AbortController`** corta la conexión de verdad, para no dejarla abierta
  consumiendo una de las seis que el navegador da por host.
- **La carrera de promesas** es la que garantiza el corte, porque abortar solo
  funciona si el `fetch` respeta la señal. Medido con un `fetch` que la ignora:
  sin la carrera no cortaba nunca.

### 1.4 · Degradación

| Situación | Comportamiento |
|---|---|
| Falla **una** hoja | El resto entra; el error se acumula en `errores[]`. La UI se degrada sola. |
| Fallan **todas** | Error explícito: *"No se pudo leer ninguna hoja de esta categoría"*. **No se cachea**: es un problema de red o permisos, no del libro. |
| Falta una columna `req` | Error en Diagnóstico, la app sigue. |
| Falta una columna `motor` | **Silencio.** Las agrega MotorStats y el panel no las usa. |

---

## 2 · Parser

`parsearGviz(txt)` desenvuelve `google.visualization.Query.setResponse({…})`
recortando entre la primera `{` y la última `}`.

### 2.1 · Las columnas se leen por NOMBRE, nunca por posición

```js
const cols = (json.table.cols || [])
  .map((c, k) => texto(c.label) || texto(c.id) || ('COL' + k));
```

**Es la propiedad que mantiene al panel inmune a las migraciones del motor**, que
agrega columnas al final a medida que suma métricas (`ID_ARCHIVO`, `TORNEO`,
`+/-` entraron así, sin tocar una línea).

Pero tiene un límite que costó una pantalla: **una columna nueva vacía sí rompe.**
Ver §3.3.

### 2.2 · Fechas

GViz devuelve `Date(2026,4,5)` con el **mes 0-indexado** — eso es mayo, no abril.
También se parsea ISO y `dd/mm/aaaa` (convención de Liga Argentina).

---

## 3 · Normalización

### 3.1 · Vacío ≠ cero

```js
if (v === null || v === undefined || v === '') return null;
```

Es la regla que sostiene todo el análisis. Un jugador con `MIN = 0` no tiene
`eFG%` de 0: **no tiene `eFG%`**. Convertirlo a cero arrastra la mediana y
encabeza cualquier ranking de "peores tiradores" con suplentes que nunca entraron.

Cuando `num()` no puede convertir, se guarda el **texto crudo** — por eso un `''`
puede llegar hasta el formateador (ver §3.3).

### 3.2 · Las tasas sin denominador se blanquean

`blanquearTasasSinDenominador(fila)` corrige un hueco **abierto** de MotorStats:
`Base Datos J` escribe **0** donde debería ir blanco, porque el motor blanquea
recién en la etapa de PROMEDIOS.

El criterio **no es `MIN > 0`** —que es lo que pide el documento del motor— sino
**el denominador de cada tasa** (`DENOMINADOR_TASA`). Es estrictamente mejor: caza
además al que **sí jugó y no lanzó de tres**, cuyo `T3%` de 0 se leía como "tiró y
erró" cuando no tiró nunca.

```
tiró y erró   →  0     (es un dato)
no tiró       →  null  (no es un dato)
```

| | |
|---|---|
| Denominadores declarados | `eFG%`→`TCI`, `TS%`→`TCI`+`T1I`, `T3%`→`T3I`, `PPP`→`PLAYS`, … |
| Medido en Primera · Vuelta | 361 filas blanqueadas contra 277 ceros legítimos |
| Peor caso corregido | CARLOTTO, MARCO: eFG% medio de **0,30** → **1,50** real |

Dos cosas que no se tocan:

- **Las CUENTAS quedan en 0.** `PTS`, `T3C`, `RD`, `AST` en una noche sin minutos
  son datos reales. Lo que no es un dato es el porcentaje.
- **`AST-PP` queda afuera.** Su denominador son las pérdidas y el motor tiene su
  propia convención para el caso sin pérdidas. Pisarlo contradiría a la hoja que
  el club audita.

La fila **no se descarta**: el detector de inactividad se apoya justamente en esas
filas de `MIN = 0` para contar la racha.

### 3.3 · La guarda del formateador es por TIPO

`isFinite('')` devuelve **`true`** — el string vacío se convierte a 0 — así que una
celda vacía de una columna numérica pasaba la guarda y reventaba con
`valor.toFixed is not a function`.

Lo destapó la migración del 2026-08-24: el libro pasó a traer `+/-` con celdas
vacías. Antes la columna **no existía** y el valor era `undefined`, que sí caía en
la guarda. **El tab Partidos de cualquier jugador con una noche sin `+/-` no se
pintaba.**

```js
if (typeof valor !== 'number' || !isFinite(valor)) return '—';
```

**Emitir una columna vacía no es lo mismo que no emitirla.**

### 3.4 · Nombres de equipo

`claveEquipo()` normaliza (`"ATENAS 'A' - MM"` → `ATENAS A`) descartando los
sufijos de categoría que declara cada liga en el JSON del club. En Liga Argentina
los paréntesis **no se tocan**: `HINDU (C)` y `COLON (SF)` son la provincia y
distinguen equipos.

`claveEquipo` es también el normalizador que usan la resolución de escudos,
`esEquipoPropio()`, los slugs de la URL y la extracción del rival. **No se le
puede agregar el torneo**: el texto `"A vs B"` del campo `PARTIDO` no lo tiene, y
una clave compuesta ahí dejaría todos los rivales en blanco.

### 3.5 · El join por FECHA

`idPartido()` = **FECHA + PARTIDO**. `construirIndice` arma `fechaPorPartido`
desde `Base Datos E` **antes** de indexar nada, y las tres hojas partido a partido
heredan la fecha antes de calcular su `__id`. Parchearlo después no sirve: el
`__id` ya está calculado.

**Guard de ambigüedad:** si un mismo texto de `PARTIDO` aparece con dos fechas —
ida y vuelta se escriben igual — **no se hereda nada** y se avisa en Diagnóstico.
Un dato inventado es peor que un dato ausente: la UI ya sabe mostrar "sin box
score", pero atribuirle a un jugador la noche equivocada no se nota y contamina su
log, su desvío y sus atípicos.

---

## 4 · Scope · el tramo de competencia

```js
SGADD.construirIndice(hojas, { fase, torneo })
```

El índice se arma **scopeado a UNA competencia**. Sin scope, dos torneos con la
misma fase se pisan. Medido en DEPORTIVO, que trae los mismos 13 equipos en las
dos ruedas:

```
solo IDA     → 64 partidos · 208 jugadores · DLP con PJ 11, 75,6 PTS
solo VUELTA  → 12 partidos · 165 jugadores · DLP con PJ  2, 66,5 PTS
SIN scope    → 76 partidos · 373 jugadores · DLP con PJ  2, 66,5 PTS  ←
```

Los partidos se acumulan bien, pero los promedios se agrupan por `EQUIPO + FASE` y
**los de Vuelta pisan a los de Ida**; y los jugadores se **duplican**.

### Reglas del scope

- **`GENERAL` es el torneo por defecto** en planillas pre-v44 sin la columna.
- **Una fila SIN torneo pasa siempre**, aunque se esté filtrando: descartarla
  dejaría una sección vacía sin decir por qué.
- **La fila TIPO no genera un tramo.** Viene con `FASE = TOTAL` y sin torneo.
- `combinacionesTorneoFase(hojas)` enumera los pares que **existen**;
  `tramoPorDefecto()` abre por el de mayor **cobertura** (en cuántas de las cuatro
  hojas clave aparece), no por "el que tenga partidos" — se probó y ese criterio
  cambiaba *252 jugadores / 0 partidos* por *67 partidos / 0 jugadores*.

### Estado en DEPORTIVO

| Tramo | Equipos | Jugadores | Partidos |
|---|---|---|---|
| `IDA - REGULAR` | 12 | 208 | 64 |
| `VUELTA - REGULAR` | 12 | 165 | 12 |
| `(TOTAL)` | **0** | **0** | — |

La fase `TOTAL` tiene **una sola fila en todo el libro**, y es la mediana de la
liga (`EQUIPO TIPO`). **No hay filas por equipo ni por jugador**, así que la vista
de temporada completa todavía no existe. Cuando MotorStats las escriba, el
selector la va a ofrecer **sola**: enumera lo que hay.

---

## 5 · Salida · el índice

`construirIndice` devuelve seis estructuras que cumplen el rol de los índices que
no hay:

| Estructura | Forma | Para qué |
|---|---|---|
| `equipos` | `Map<claveEquipo, {…}>` | Ficha de equipo, grilla, rankings |
| `liga.jugadoresPorEquipo` | `Map<claveEquipo, jugador[]>` | Filtrar plantel sin recorrer la liga |
| `liga.jugadorPartidos` | `Map<clavePersona, fila[]>` | Evolución, desvíos, splits |
| `liga.boxPorPartido` | `Map<idPartido, fila[]>` | Box score del detalle |
| `fechaPorPartido` | `Map<texto, fecha>` | Join entre hojas sin fecha |
| `equipos[].partidosPorId` | `Map<idPartido, fila>` | Cruce Jugadores → Equipos |

Más los agregados de liga: `n`, `partidos`, `pjMediano`, `minJugador`,
`jugadoresCalificados`, `muestraSuficiente`.

### La fila TIPO no es un equipo

`EQUIPO TIPO` es la **mediana de la liga**, verificada 13/13 columnas contra la
mediana calculada. Se excluye del listado con `esFilaTipo()`. Dos trampas:

- **Viene redondeada a 2 decimales**: nunca comparar por igualdad exacta.
- **No es internamente coherente**: `RTNG OFF − RTNG DEF ≠ NET RTNG`, porque la
  mediana de las diferencias no es la diferencia de las medianas. **Nunca derivar
  una columna de otra a partir del TIPO.**

---

## 6 · Caché · dos capas

### 6.1 · Memoria — `_cache`

`Map<sheetId, Promise<{hojas, errores}>>`. Guarda la **promesa**, no el resultado,
así que dos llamadas concurrentes comparten un solo `fetch`. Vive lo que dura la
página.

### 6.2 · Persistente — `sessionStorage`

| | |
|---|---|
| Clave | `sgadd.hojas.<sheetId>` |
| TTL | 30 minutos |
| Versión de formato | `CACHE_FORMATO = 1` |
| Tamaño real (DEPORTIVO) | **2.336 KB** |

**Se usa `sessionStorage` y no `localStorage` a propósito.** El dato de la planilla
cambia cuando corre MotorStats, y nadie avisa: con `localStorage` un DT podría
abrir el panel el domingo y ver la fecha del jueves sin enterarse.
`sessionStorage` muere al cerrar la pestaña, así que el techo del dato viejo es
una sesión de trabajo — y adentro de esa sesión igual hay TTL.

**Resultado medido:** las peticiones GViz del arranque bajan de **20 a 11** tras
un F5. Las 11 que quedan son de la capa de datos vieja de Principal, que no pasa
por el adaptador. Con GViz **bloqueado** y el caché poblado, la app arranca
completa: 12 equipos, 208 jugadores, 64 partidos.

#### Cuatro reglas que hay que respetar

1. **Solo se cachea la carga COMPLETA.** Si alguien pidió un subconjunto de hojas,
   servirle el libro entero guardado devolvería más de lo que pidió.
2. **Solo si la carga salió limpia.** Con hojas que fallaron, cachear serviría el
   mismo libro incompleto durante media hora en vez de reintentar — y una hoja que
   falla suele ser un timeout puntual.
3. **`limpiarCache()` SIN `sheetId` limpia solo la memoria.** Lo llama
   `aplicarDatos()` del club en **cada arranque**; si de paso borrara el disco, el
   caché moriría en el arranque siguiente al que lo escribió y no serviría jamás.
   *Encontrado con un espía sobre `Storage`: el F5 volvía a pedir las nueve hojas
   y el caché parecía andar porque se reescribía solo.*
4. **`limpiarCache(sheetId)` limpia las dos.** Es lo que hace "Actualizar datos":
   si solo vaciara la memoria, el gesto del DT no haría nada visible.

#### Degradación

Sin almacén disponible (Node, modo privado de Safari, storage bloqueado) leer
devuelve `null`, guardar devuelve `false` y borrar no hace nada. **El panel
funciona igual**, solo vuelve a pedirle a GViz. Un caché vencido, de otro formato
o con JSON corrupto se descarta **y se borra solo**, para no ocupar cupo al pedo.
Sin lugar, se tiran los libros de **otras** categorías y se reintenta una vez.

---

## 7 · Rendimiento medido

| Operación | DEPORTIVO (2.998 filas) | Jujuy (7.558 filas) |
|---|---|---|
| Indexado, mediana de 5 | **90 ms** | **415 ms** |
| GViz, hoja más lenta | 600–1.009 ms | 1.772–2.895 ms |
| Carga completa en frío | ~800 ms | ~3.800 ms |
| Desde caché persistente | **0 ms de red** | **0 ms de red** |

Escala aproximadamente lineal. Un libro de ~30.000 filas costaría ~1,6 s de CPU.
El límite duro no es el procesamiento sino GViz y la memoria del navegador.

---

## 8 · Lo que el adaptador NO hace, y por qué

| | |
|---|---|
| **No recalcula estadística** | El motor ya la calculó. Duplicar la fórmula acá haría que los números dejen de coincidir con la hoja que el club audita. |
| **No agrega torneos** | Ver §4: juntar Ida y Vuelta sin las filas `TOTAL` del motor corrompe los promedios. |
| **No lee `RANKINGS`** | No son tablas planas. Los rankings se derivan del cliente. |
| **No escribe nada** | Ni en la planilla, ni por la fachada de Apps Script. |
| **No sanea la anomalía `TORNEO = "135"`** | **Verificado el 2026-08-24: no existe.** Las 6 hojas derivadas de DEPORTIVO traen la fila TIPO con `TORNEO=''` y `FASE='TOTAL'`. MotorStats ya la corrigió. Escribir esa defensa sería código que nadie puede volver a probar contra un caso real. |

---

## 9 · Superficie pública

```js
// Lectura
SGADD.cargarCategoria(sheetId, { forzar, hojas, timeout })  → Promise<{hojas, errores, deCache}>
SGADD.limpiarCache(sheetId?)

// Índice
SGADD.construirIndice(hojas, { fase, torneo })              → idx
SGADD.combinacionesTorneoFase(hojas)                        → tramo[]
SGADD.tramoPorDefecto(tramos)                               → tramo

// Normalizadores
SGADD.claveEquipo(n) · clavePersona(n) · limpiarNombre(n)
SGADD.num(v) · texto(v) · fecha(v) · formatear(clave, valor)
SGADD.blanquearTasasSinDenominador(fila)

// Validadores
SGADD.validarEsquema(hojas) · validarTorneo(hojas) · validarCoherencia(hojas)

// Caché (expuesto para test)
SGADD.leerCachePersistente(id) · guardarCachePersistente(id, hojas) · borrarCachePersistente(id, excepto)
SGADD.CACHE_PREFIJO · CACHE_FORMATO · CACHE_TTL_MS
```

---

## 10 · Cómo validar que sigue andando

```bash
node test-core.js      # 252 tests: parser, índice, validadores, caché, tramos
```

En el navegador, la prueba que no se puede simular en Node: **bloquear
`*docs.google.com*` en DevTools y recargar**. Con el caché poblado la app tiene
que arrancar completa; sin él, tiene que mostrar el error explícito y conservar
los controles.
