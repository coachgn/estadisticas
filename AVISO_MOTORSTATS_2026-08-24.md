# Aviso a MotorStats · desde Web MotorStats (SGADD)

> Respuesta al *Prompt de continuidad* del 2026-08-24. Pegar completo en el
> proyecto **MotorStats**.
>
> Todo lo de abajo está **medido contra los libros reales** leyéndolos por
> GViz el 2026-08-24, no inferido. Los conteos son de filas devueltas.

---

## 0 · Resumen

| # | Qué | Dueño | Estado |
|---|---|---|---|
| 1 | **U23 desalineado**: 7 hojas en `APERTURA`, 2 en `IDA`/`VUELTA` | **MotorStats** | 🔴 abierto |
| 2a | **U21**: el `sheetId` de la web apuntaba a un archivo inexistente | Web | 🟢 **corregido** |
| 2b | **U21 a mitad de un recálculo**: derivadas con 1 equipo de 12 | **MotorStats** | 🔴 abierto |
| 3 | `+/-` de `Base Datos J` viene **100% vacía** | **MotorStats** | 🟡 abierto |
| 4 | Hueco 6.2 (`Base Datos J` con 0 en vez de blanco) | MotorStats | 🟢 **la web ya lo corrige** |
| 5 | Celda vacía en columna numérica rompía una pantalla | Web | 🟢 **corregido** |
| 6 | `EQUIPO TIPO` sigue siendo la mediana tras v38 | — | ✅ verificado |
| 7 | **Filas `FASE = TOTAL` por equipo y jugador**: no existen | **MotorStats** | 🟡 pedido nuevo |
| 8 | Anomalía `TORNEO = "135"` de su punto 4.2 | — | ✅ **ya corregida** |

Los puntos 1 y 2 son los que hay que atacar. El 3 es barato y evita un
sinsentido en el panel. Del 4 y el 5 no hace falta que hagan nada: se
informan para que no los dupliquen.

---

## 1 · 🔴 El libro U23 está desalineado · `1MgrxhEN…`

**El veredicto ✅ de la sección 0.1 del prompt es incorrecto.** El libro
carga, pero **no se puede leer entero desde ninguna posición del selector**.

Conteo de filas por hoja y por valor de `TORNEO`:

| Hoja | `APERTURA` | `IDA` | `VUELTA` | vacío |
|---|---|---|---|---|
| `PROMEDIOS E` | 13 | — | — | 1 (TIPO) |
| `ACUMULADO E` | 13 | — | — | 1 (TIPO) |
| `PROMEDIOS 4F` | 13 | — | — | 1 (TIPO) |
| `ACUMULADO 4F` | 13 | — | — | 1 (TIPO) |
| `PROMEDIOS J` | 265 | — | — | 1 (TIPO) |
| `ACUMULADO J` | 253 | — | — | 1 (TIPO) |
| `Base Datos J` | 1857 | — | — | — |
| **`Base Datos E`** | **—** | **134** | **30** | — |
| **`4 FACTORES`** | **—** | **134** | **30** | — |

**Siete hojas dicen `APERTURA` y dos dicen `IDA`/`VUELTA`.** La intersección
es vacía: ningún torneo tiene a la vez promedios y partidos.

Ojo con el matiz, porque no es "maestras contra derivadas": `Base Datos J`
—que también es maestra— está del lado de `APERTURA`. **Las dos únicas hojas
descolgadas son las de equipo-partido.**

### Consecuencia medida en el panel

| Torneo elegido | Equipos | Jugadores | Partidos |
|---|---|---|---|
| `APERTURA` | 12 | 252 | **0** |
| `IDA` | 12 | **0** | 67 |
| `VUELTA` | 12 | **0** | 15 |

De ahí sale el *"0 partidos"* que reportaron en su punto 0.3-B. El `82` del
RESUMEN de Principal viene de otra capa del panel que no filtra por torneo
(las 164 filas ÷ 2), así que los dos números eran ciertos y contradictorios
a la vez.

### Comparación de control · Primera está bien

`1Zi2cBd0…` tiene **`VUELTA` en las nueve hojas**, sin una sola discrepancia.
Sirve como referencia de cómo tendría que quedar el U23.

### Lo que pedimos

Reetiquetar `Base Datos E` y `4 FACTORES` del U23 para que coincidan con el
resto del libro, o al revés — lo que corresponda según la carpeta real de
Drive. Lo que no puede quedar es la partición actual.

Si la partición **es correcta** —o sea, si el libro realmente contiene un
Apertura de promedios y un Ida/Vuelta de partidos— entonces el problema es
conceptual y son dos competencias que no deberían convivir en un libro,
porque los promedios no describen a esos partidos.

---

## 2 · 🔴 El libro U21 · dos problemas, ninguno era el que pensábamos

> **Corrección.** La primera versión de este aviso decía *"devuelve 401,
> la planilla dejó de estar compartida"*. Con acceso a Drive se pudo mirar
> de verdad y **no es eso**. Van los dos problemas reales.

### 2.1 · El `sheetId` que usaba la web no existe

La web apuntaba a `1CD7FEDcLkmZRI0tGkU67IjCmkxhnnIN2AKHhA4lWJT4`, que da
**401 por GViz y "entity not found" por la API de Drive**: no es un
problema de permisos, ese archivo no está.

El libro U21 real es **`1wNpSkdIOeoXTxaAQBH9UI3q1nR9J-4oek4MKO6m4TpE`**
(título `U21`, dueño `reconquistamenores@gmail.com`, carpeta
`1CFH21I8z9no_GXnghAlg92xYmfRhBlIT`), y está vivo: **se modificó el
2026-08-24 a las 09:01**. Sus equipos son los U21M de La Plata, así que es
el correcto.

**Ya está corregido en la web.** Se informa por si el id viejo quedó
anotado en algún lado del motor o de las licencias.

### 2.2 · 🔴 Y ese libro está a MITAD DE UN RECÁLCULO

Este es el que hay que atender. Conteo de filas leyendo el libro real:

| Hoja | Filas | Qué tiene |
|---|---|---|
| `Base Datos E` | 132 | ✅ 12 equipos · 66 partidos |
| `Base Datos J` | 1421 | ✅ completa |
| `4 FACTORES` | 132 | ✅ completa |
| `PROMEDIOS 4F` / `ACUMULADO 4F` | 14 | ✅ los 13 equipos + TIPO |
| `ACUMULADO J` | 203 | ✅ completa |
| **`PROMEDIOS E`** | **3** | 🔴 **UN equipo** + 2 filas TIPO |
| **`ACUMULADO E`** | **3** | 🔴 **UN equipo** + 2 filas TIPO |
| **`PROMEDIOS J`** | **21** | 🔴 los jugadores de **ese** equipo |

El único equipo que quedó en las derivadas es **BANCO PROVINCIA 'A' -
U21M**, o sea **el primero del abecedario**. Eso apunta a un recálculo que
arrancó y se cortó, no a un filtro mal puesto.

**Lo peligroso es que la app no se rompe.** Muestra 12 equipos, 66
partidos y **18 jugadores**, y un plantel de 18 para una liga entera no se
lee como un error: se lee como una liga chica. Todos los percentiles, las
medianas y las bandas de la categoría salían de esa muestra.

Del lado de la web se agregó un validador que lo denuncia (ver punto 4
bis). Del lado de MotorStats: **reprocesar el libro**.

---

## 3 · 🟡 La columna `+/-` de `Base Datos J` viene vacía en el 100% de las filas

Medido en los dos libros que se pueden leer:

| Libro | `Base Datos J` | `PROMEDIOS J` | `ACUMULADO J` |
|---|---|---|---|
| Primera · Vuelta | **0 / 1965** con dato | 232 / 232 | 220 / 220 |
| U23 | **0 / 1857** con dato | 266 / 266 | 254 / 254 |

La columna **existe** en la maestra pero no se escribe nunca; en las
derivadas sí está poblada. O sea que el promedio de `+/-` de un jugador
tiene valor y su partido a partido no.

Es raro que el promedio exista sin los sumandos. Si el `+/-` por partido no
se puede calcular, lo coherente sería no emitir la columna en la maestra;
si sí se puede, hay que poblarla.

**Y no es gratis dejarla vacía**: fue lo que rompió una pantalla del panel
(ver punto 5).

---

## 4 · 🟢 Hueco 6.2 · la web ya lo corrige, no hace falta que hagan nada

Su punto 6.2 pide *"filtrar por `MIN > 0` del lado de la web"*. Está hecho,
con un criterio más fino. Se informa para que no lo dupliquen ni cambien el
motor por esto.

Volumen del problema:

| Libro | Filas con `MIN = 0` | Con tasas en **0 duro** | Total |
|---|---|---|---|
| Primera · Vuelta | 247 | **247** | 1965 |
| U23 | 158 | **158** | 1857 |

Impacto real antes del fix: esas filas entraban a la media y al desvío del
jugador. Peor caso, **CARLOTTO, MARCO** — 5 noches, 4 en cero → su `eFG%`
medio daba **0,30** contra **1,50** real. Y como también inflaba el desvío,
**fabricaba rendimientos atípicos**: contra una media hundida por noches que
no existieron, cualquier partido normal superaba el umbral.

**El criterio no es `MIN > 0`, es el denominador de cada tasa.** Es
estrictamente mejor porque caza además al que **sí jugó y no lanzó de tres**:
ese `T3%` de 0 se leía como "tiró y erró" cuando no tiró nunca. Medido
después: 361 filas blanqueadas contra 277 ceros legítimos.

Las cuentas (`PTS`, `T3C`, `RD`, `AST`) se dejan en 0, que sí es un dato.

---

## 4 bis · 🟢 Validador nuevo · derivadas contra la maestra

El caso del U21 (2.2) no lo veía **ningún** control, ni del motor ni de la
web, y por un motivo entendible: el validador de coherencia compara
`PROMEDIOS E` contra `ACUMULADO E`, y ahí **coincidían** — los dos tenían
3 filas. Nadie comparaba las derivadas contra la **maestra**, que es la
única que sabe cuántos equipos hay de verdad.

La web ahora cruza `Base Datos E` contra `PROMEDIOS E`, `ACUMULADO E` y
`PROMEDIOS 4F`, y tira **error** nombrando a los equipos que faltan.

**Sugerencia para el motor**: el mismo control del lado de MotorStats,
al terminar de escribir las derivadas, cerraría el problema en el origen —
un recálculo que se corta a mitad hoy no deja ningún rastro.

## 5 · 🟢 La celda vacía que rompía una pantalla · corregido en la web

Vale como aviso general de migración, porque **contradice a medias la
tranquilidad de la sección 0.2**.

Es cierto que leer por nombre de columna hace que agregar columnas al final
no desplace nada. Pero **una celda vacía en una columna numérica sí rompe**:

- El libro de Primera pasó a traer `+/-` (v30+) con la columna vacía.
- Antes de la migración la columna **no existía** → el valor era `undefined`.
- Después existe y vale `''`. Y en JavaScript `isFinite('') === true`, así
  que el string vacío pasó la guarda del formateador y reventó con
  `valor.toFixed is not a function`.

**Resultado: el tab Partidos de cualquier jugador con una noche sin `+/-`
lanzaba y la sección no se pintaba.** Estaba pasando en producción.

Ya está corregido del lado de la web (guarda por tipo, no por `isFinite`).
Lo interesante para MotorStats: **emitir una columna vacía no es lo mismo
que no emitirla**, y en este caso costó una pantalla.

---

## 5 bis · 🟡 Las filas `FASE = TOTAL` por equipo y por jugador

**Pedido nuevo, y es el que desbloquea la vista de temporada completa.**

Primero, una confirmación: **la anomalía `TORNEO = "135"` ya no existe.**
Leídas las 6 hojas derivadas de DEPORTIVO por GViz el 2026-08-24 después de
su última corrida:

```
PROMEDIOS E / ACUMULADO E / PROMEDIOS 4F / ACUMULADO 4F
   →  EQUIPO TIPO · TORNEO=''  FASE='TOTAL'   ✅
PROMEDIOS J / ACUMULADO J
   →  JUGADOR TIPO · TORNEO='' FASE='TOTAL'   ✅

celdas con exactamente "135" en EQUIPO/NOMBRES/TORNEO/FASE:  0
```

Queda cerrado el bloqueante 1 de su punto 4.2.

### Pero corregirlo NO alcanza para la vista de temporada completa

Su documento dice que *"la web usa ese valor para ofrecer la vista de
temporada completa"*. El diagnóstico de la causa es incorrecto. Conteo de
filas por tramo en DEPORTIVO, con el libro ya corregido:

| Hoja | `IDA+REGULAR` | `VUELTA+REGULAR` | `(vacío)+TOTAL` |
|---|---|---|---|
| `PROMEDIOS E` | 12 equipos + TIPO | 12 equipos + TIPO | **solo la fila TIPO** |
| `PROMEDIOS J` | 208 jugadores + 13 TIPO | 165 + 13 TIPO | **solo la fila TIPO** |

La fase `TOTAL` tiene **una sola fila en todo el libro**, y es la mediana de
la liga. **Cero equipos, cero jugadores.** Si el panel ofreciera esa vista,
mostraría una pantalla vacía.

### Lo que pedimos

Que `PROMEDIOS E`, `ACUMULADO E`, `PROMEDIOS 4F`, `ACUMULADO 4F`,
`PROMEDIOS J` y `ACUMULADO J` escriban también **las filas por equipo y por
jugador con `FASE = TOTAL`**, agregando las ruedas del torneo.

**No lo podemos hacer del lado de la web**, y no es por costo: juntar `IDA` y
`VUELTA` en el navegador corrompe los promedios. Medido en DEPORTIVO, que
trae los mismos 13 equipos en las dos ruedas:

```
solo IDA     → 64 partidos · 208 jugadores · DLP con PJ 11, 75,6 PTS
solo VUELTA  → 12 partidos · 165 jugadores · DLP con PJ  2, 66,5 PTS
SIN scope    → 76 partidos · 373 jugadores · DLP con PJ  2, 66,5 PTS  ←
```

Los partidos se acumulan bien porque cada uno es una fila distinta, pero el
índice agrupa los promedios por `EQUIPO + FASE` y **los de VUELTA pisan a los
de IDA**: el equipo aparecería con 13 partidos en la cronología y un promedio
calculado sobre 2. Y los jugadores se **duplican**, 373 contra 208, porque
cada uno tiene una fila por torneo.

Recalcularlo en el cliente además rompería la regla que sostiene la
confianza en el panel: **SGADD no genera datos, los consume**. Un promedio
calculado acá dejaría de coincidir con la hoja que el club audita.

**Cuando esas filas existan, el selector va a ofrecer la vista sola**, sin
tocar una línea: `combinacionesTorneoFase()` enumera los tramos que hay.

---

## 6 · Dos correcciones al prompt de continuidad

**6.1 · La web NO lee `RANKINGS J` ni `RANKINGS E`.** La sección 0.2 dice
que sí, *"incluidas RANKINGS J y RANKINGS E"*. Están excluidas a propósito
desde el principio: no son tablas planas —son bloques apilados con
encabezados repetidos— y GViz asume fila 1 = headers y devuelve basura. Los
rankings se **derivan en el cliente** desde `PROMEDIOS J`.

O sea: **la web lee 9 hojas, no 11**, y no hay ninguna dependencia sobre el
layout de las `RANKINGS`. Si quieren cambiarles el formato, no rompen nada
acá.

**6.2 · El `faseTorneo` del JSON de club no lo lee ningún módulo.** Su punto
0.3-A lo trata como algo a alinear. Ningún código lo consulta: el torneo
sale siempre de los datos. Se alineó igual por prolijidad y se cambió el
`label` visible a *"Primera · Vuelta 2026"*, que era lo único que el usuario
veía desalineado.

---

## 7 · Confirmaciones · lo que se verificó y está bien

- **`EQUIPO TIPO` sigue siendo la mediana después del cambio de v38.** Se
  recalculó la mediana de los 12 equipos sobre 13 columnas (`PTS`, `PLAYS`,
  `eFG%`, `TS%`, `RO%`, `RD%`, `AST%`, `PP`, `PACE`, `POS`, `T3%`, `T2%`,
  `T1%`) y **coinciden 13 de 13**. El supuesto del panel sigue válido.
- **`ID_ARCHIVO` vacío en libros migrados**, tal como avisa su 6.4: 0 filas
  con dato en las tres maestras de los dos libros. El panel no lo usa.
- **Sin filas perdidas.** Primera: 164 filas en `Base Datos E` = 82 partidos
  × 2 equipos, y `4 FACTORES` con las mismas 164.
- **Nombres de hoja sin cambios.** Las 9 responden con su nombre de siempre.

---

## 8 · Las preguntas de su sección 9, contestadas desde acá

**9.4 · ¿Qué cuenta lee las planillas?** Ninguna: la web es un sitio
estático y lee por **GViz público**, sin credenciales. Por eso el 401 del
U21 la deja afuera. No hace falta cuenta de servicio mientras los libros
estén compartidos por enlace.

**9.5 · ¿Una web por club o multi-club?** Multi-club, ya resuelto: un solo
deploy, `?club=<id>` carga el JSON del cliente con su marca, su liga y su
lista de planillas. Sumar un cliente es un JSON más una carpeta de escudos,
cero código.

**9.6 · ¿Se necesitan logos?** **No hace falta exponer `obtenerLogos()`.**
Los escudos viven en el repo de la web con un manifiesto por liga. No hay
dependencia sobre el motor para esto.

**3 · ¿Fachada o lectura directa?** Lectura directa, que es lo que ya hace y
lo que ustedes recomiendan. La web no dispara procesamiento, así que el
secreto de los tokens no necesita salir de MotorStats.
