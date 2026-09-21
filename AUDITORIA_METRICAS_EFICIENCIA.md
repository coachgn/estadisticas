# Auditoría de métricas de eficiencia · Motor Sheets contra Web App

**Fecha:** 2026-09-21
**Alcance:** PACE, PPP, ORTG (`RTNG OFF`), DRTG (`RTNG DEF`) y Net Rating (`NET RTNG`), más `PLAYS` y `POS`, que son su base.
**Repositorios leídos:**

| | Ruta | Estado leído |
|---|---|---|
| Motor | `C:\Users\Pc\mi-motor-stats` | `libreria/MotorStats_Library.js` modificado el 2026-09-19 · el directorio **no está bajo git** |
| Web App | `C:\Users\Pc\Documents\estadisticas` | commit `bada153` · assets v232 |

**Datos con los que se midió:** el libro real de **DEPORTIVO Primera 2026** (Local Mayores), bajado de la API de producción el 2026-09-18 — 210 filas equipo-partido en `Base Datos E` y `4 FACTORES`, 12 equipos en el tramo `IDA|REGULAR`. Nada de este informe es inferido: cada coincidencia y cada diferencia se recalculó fila por fila contra lo que la planilla tiene escrito.

---

## Resumen ejecutivo

1. **Las fórmulas del motor y de la web son la misma matemática.** Recalculadas sobre las 210 filas, coinciden a **10⁻¹⁴** (error de punto flotante). No hay una sola divergencia de cálculo entre los dos repositorios para las cinco métricas.
2. **La nota al pie del card «Eficiencia del partido» es técnicamente correcta en sus tres afirmaciones.** Tiene un solo defecto: no dice que PACE y ORTG están en **unidades distintas** (posesiones contra plays), y esa es exactamente la trampa en la que cayó el Simulador (el punto siguiente).
3. **Hay un error de cálculo real, y está en el Simulador, no en la card.** Proyecta el puntaje con `PACE × PPP` —posesiones por puntos por play— y se queda **11,4 % corto** sobre los partidos reales. El CLAUDE.md declara `PLAYS × PPP`; el código hace otra cosa.
4. **El glosario contradice a la nota al pie.** Dice «Puntos cada 100 posesiones» para `RTNG OFF`, con la fórmula `PPP OF × 100` al lado. El texto viene del manual del motor.
5. **Los datos tienen defectos que contaminan PACE y RTNG más que cualquier fórmula:** la **fecha entera del 9/07** vino con las acciones a medias —cuatro partidos, ocho equipos, un ORTG de 226 en un partido y el #1 en ataque para un equipo que sin él es #2— y **cuatro partidos de ATENAS 'B'** tienen las pérdidas sin registrar. Una sola regla (PACE bajo **y** PPP alto a la vez) los aísla a todos.

---

## a) Tabla comparativa sintética

| Métrica | Fórmula en Sheets (motor) | Fórmula en la Web App | ¿Coinciden? | Estado |
|---|---|---|---|---|
| **PLAYS** | `TCI + 0,44·T1I + PP` | la **lee** de la hoja; en el TOTAL la **suma** | Sí · 210/210 a 10⁻¹⁴ | ✅ |
| **POS** | `TCI + PP + 0,44·T1I − RO` (= `PLAYS − RO`) | la **lee**; si falta la recalcula igual | Sí · 210/210, Δ = 0 | ✅ |
| **PACE** | `((PLAYS−RO) + (PLAYSopp−ROopp)) / 2 × 200 / MIN` | la **lee**; en el TOTAL, la misma fórmula sobre totales | Sí · 12/12 equipos Δ = 0 · por partido ≤ 0,06 | ✅ (redondeo de MIN) |
| **PPP** | `PTS / PLAYS` | la **lee**; la card y el TOTAL la recalculan igual | Sí · a 10⁻¹⁶ | ✅ · ⚠ nombre ambiguo |
| **ORTG** (`RTNG OFF`) | `PPP OF × 100` = `100 · PTS / PLAYS` | card: `100·PTS/PLAYS` · resto: lee `PROMEDIOS 4F` · TOTAL: `100·ΣPTS/ΣPLAYS` | Sí · 210/210 y 12/12 a 10⁻¹⁴ | ✅ fórmula · ⚠ 3 nombres · ❌ glosario |
| **DRTG** (`RTNG DEF`) | `PPP DEF × 100` = `100 · PTSopp / PLAYSopp` | ídem, con el rival | Sí · a 10⁻¹⁴ | ✅ fórmula · ❌ glosario |
| **Net Rating** (`NET RTNG`) | `RTNG OFF − RTNG DEF` | ídem | Sí · a 10⁻¹⁴ | ✅ |

### Lo que NO es de fórmula, y sí hay que corregir

| # | Problema | Dónde | Medido | Gravedad |
|---|---|---|---|---|
| 1 | El Simulador multiplica **posesiones por puntos por play** | `js/sgadd-4factores.js:485` | −7,7 pts por equipo-partido · **−11,4 %** | **Alta** · error de cálculo |
| 2 | El glosario dice «cada 100 **posesiones**» para los ratings | `js/sgadd-glosario.js:506` · origen: manual del motor | la entrada se contradice sola | **Media** · el DT lee lo contrario de la nota |
| 3 | La fecha del 9/07 cargada a medias | libro · 4 partidos, 8 equipos | PACE −34 %, PPP +64 % · un ORTG de **226** · infla 5 pts la temporada | **Alta** · dato |
| 4 | ATENAS 'B' con acciones de menos | libro · 4 partidos | PACE 53–57 contra 77 de mediana | **Media** · dato |
| 5 | Tres nombres para la misma métrica | `RTNG OFF` · `ORTG` · `EFF OF` | — | Baja · legibilidad |
| 6 | El panel mezcla unidades | quintetos por posesión, todo lo demás por play | — | Baja · coherencia |
| 7 | `MIN` se escribe redondeado | `Base Datos E` | PACE recalculado ≤ 0,06 del escrito | Cosmética |

---

## b) Mapeo detallado por métrica

### La base: PLAY y POS son cosas distintas

Es la decisión de diseño que explica todo lo demás, y está escrita en el motor (`METRICAS.md`, sección 2):

```
PLAY = TCI + 0,44 × T1I + PP          ← cómo TERMINA una jugada
POS  = TCI + 0,44 × T1I + PP − RO     ← cuántas veces el equipo TUVO la pelota
```

Un rebote ofensivo **cierra una jugada y abre otra**, pero no corta la posesión. Por eso `PLAYS − POS = RO`, siempre: tiro fallado → rebote ofensivo → tiro convertido son **2 plays en 1 posesión**. El motor decidió en su **v29** que `PPP` es puntos por **play** y dejó escrito que, si alguna vez se quiere por posesión, entra como métrica aparte (`PPPos = PTS / POS`), *«nunca reemplazando a ésta»*.

### PLAYS

| | Archivo | Línea | Qué hace |
|---|---|---|---|
| Motor | `libreria/MotorStats_Library.js` | **11500** | `plays = totalTCI + 0,44·t1Intentados + ppParaPlays`, por jugador |
| Motor | ídem | **11721** | `totales_Plays = totales_PLAYS_sum`: el del equipo es la suma de los jugadores |
| Web | `js/sgadd-core.js` | **752** | registro: dueña `PROMEDIOS E`, se **lee** |
| Web | `js/sgadd-core.js` | TOTAL | se suma partido a partido (`agregarPartidos`) |

Medido: `TCI + 0,44·T1I + PP` reproduce la columna en las **210** filas (máx |Δ| 2,8·10⁻¹⁴).

### POS

| | Archivo | Línea | Qué hace |
|---|---|---|---|
| Motor | `libreria/MotorStats_Library.js` | **11761** | `totales_POS = TCI + PP_equipo + 0,44·T1I − RO` |
| Motor | `METRICAS.md` | D2 | `PP_equipo` sale de la fila TOTALES del box score y no de la suma de los jugadores: dos fuentes |
| Web | `js/sgadd-core.js` | **750** | registro: dueña `PROMEDIOS E` |
| Web | `js/sgadd-partido.js` | **71** | la lee; si falta, la recalcula con la misma fórmula |

Medido: Δ = 0 en las 210 filas. En este libro las dos fuentes de PP del defecto D2 coinciden.

### PACE

| | Archivo | Línea | Qué hace |
|---|---|---|---|
| Motor | `libreria/MotorStats_Library.js` | **11763–11766** | por partido: `(PLAYS − RO + PLAYSopp − ROopp) / 2 × 200 / MIN` |
| Motor | ídem | **1662–1672** | `_tasaPace_`: la misma fórmula sobre totales acumulados |
| Motor | ídem | **1679** | `_recalcularTasasEquipo_` la aplica a `ACUMULADO E` |
| Web | `js/sgadd-core.js` | **751** | registro: dueña `PROMEDIOS E` · *«Posesiones proyectadas a 200 minutos de equipo»* |
| Web | `js/sgadd-core.js` | **1252** | TOTAL: `((PLAYS−RO) + (PLAYSr−ROr)) × 200 / (2·MIN)` |
| Web | `js/sgadd-partido.js` | **81** | la card la **lee** (`pace: n('PACE')`), no la recalcula |

Tres cosas medidas:

- **PACE es por POSESIONES, no por plays**: resta el rebote ofensivo. Es el promedio de las posesiones de los dos equipos.
- **`MIN` es el de EQUIPO**: la suma de los minutos de los cinco en cancha. Vale **200 en 197 de 210 filas**, 225 en 8 (un suplementario), 250 en 4 (dos) y **191,65 en una**, que es PLATENSE 'B' en la fecha rota del 9/07 (hallazgo 3). O sea que `× 200 / MIN` lleva un partido con alargue de vuelta a 40 minutos — correcto.
- **Los 5 PACE que no cierran son redondeo**: el motor usa la suma exacta de los minutos de los jugadores (199,85–199,89, verificado contra `Base Datos J`) y la hoja escribe 200. Recalculado desde la columna escrita, el PACE difiere ≤ 0,06. **El valor del motor es el correcto.**

### PPP

| | Archivo | Línea | Qué hace |
|---|---|---|---|
| Motor | `libreria/MotorStats_Library.js` | **11722** | por partido: `totales_PPP = PTS / Plays` |
| Motor | ídem | **4722** | `PROMEDIOS E`: `_tasaOVacio_(PTS, PLAYS)` |
| Web | `js/sgadd-core.js` | **753**, **1235** | registro (`PROMEDIOS E`) y TOTAL: `PTS / PLAYS` |
| Web | `js/sgadd-partido.js` | **86** | la card la recalcula (no la muestra) |

### ORTG · `RTNG OFF`

| | Archivo | Línea | Qué hace |
|---|---|---|---|
| Motor | `libreria/MotorStats_Library.js` | **12581** | hoja `PARTIDO` de cada partido: `RTNG OFF = ppp × 100` |
| Motor | ídem | **5791** | `4 FACTORES` **copia** esa celda de la hoja `PARTIDO` |
| Motor | ídem | **6038–6061** | `ACUMULADO 4F`: reconstruye `PLAYS = PTS / PPP` por partido y recalcula `PPP OF = ΣPTS / ΣPLAYS`, `RTNG OFF = PPP OF × 100` |
| Motor | ídem | **6368** | `PROMEDIOS 4F` toma la tasa de `ACUMULADO 4F` sin dividir por PJ (fix v39) |
| Web | `js/sgadd-core.js` | **713** | registro: dueña `PROMEDIOS 4F` · *«por PLAYS, no por posesiones»* |
| Web | `js/sgadd-core.js` | **1257** | TOTAL: `100 · ΣPTS / ΣPLAYS` |
| Web | `js/sgadd-partido.js` | **84** | card: `100 · PTS / PLAYS` desde `Base Datos E` |
| Web | `js/sgadd-comparativa.js` | **122–133** | ciclos: la misma fórmula sobre el corte |
| Web | `js/sgadd-scouting.js` | **1280**, **1365** | matriz: rotulada **«EFF OF»** |
| Web | `index.html` | **4278** | scatter de Principal: busca `RTNG OFF` o `ORTG` |
| Web | `js/sgadd-glosario.js` | **506** | ❌ *«Puntos cada 100 posesiones»* |

Medido:

- **La card y `4 FACTORES` dan lo mismo** en las 210 filas (máx |Δ| 2,8·10⁻¹⁴), aunque la card lo recalcula desde `Base Datos E` y la otra lo copia de la hoja `PARTIDO`.
- **`PROMEDIOS 4F` es razón de totales, no promedio de razones**: su `RTNG OFF` coincide con `100 · PPP` de `PROMEDIOS E` y con el `100·ΣPTS/ΣPLAYS` que la web usa en el TOTAL, los tres a 10⁻¹⁴. O sea que **un tramo normal (que lee la hoja) y el TOTAL (que la web recalcula) usan el mismo método**.

### DRTG · `RTNG DEF`

Igual que ORTG con el rival: motor **12582** (`ppp del rival × 100`), web `js/sgadd-core.js` **715** y **1258**, card `js/sgadd-partido.js` **85**. Coinciden a 10⁻¹⁴. El glosario repite el error: *«cada 100 posesiones»*.

### Net Rating · `NET RTNG`

Motor **12583** y **6061** (`RTNG OFF − RTNG DEF`); web `js/sgadd-core.js` **717** y **1266**. Coinciden a 10⁻¹⁴.

**Una regla que la web ya respeta y conviene no romper**: sobre la fila `EQUIPO TIPO` el NET **no** se deriva restando, porque es la mediana de los netos y no la resta de las medianas (`sgadd-core.js:717`, punto 3 del CLAUDE.md). Sobre los totales de UN equipo, sí es la resta exacta (`sgadd-core.js:1262–1265`).

---

## c) Veredicto técnico sobre la nota al pie

> *«ORTG y DRTG están calculados por 100 PLAYS, no por 100 posesiones: no son comparables con el ORTG de la NBA. PACE son las posesiones proyectadas a 200 minutos de equipo.»*
> — `js/sgadd-equipos.js:1223–1225`

| Afirmación | Veredicto | Evidencia |
|---|---|---|
| «ORTG y DRTG están calculados por 100 PLAYS» | ✅ **Verdadera** | web `sgadd-partido.js:84–85` y motor `12581–12582`, los dos `100·PTS/PLAYS`; 210/210 a 10⁻¹⁴ |
| «no por 100 posesiones» | ✅ **Verdadera** | ninguno de los dos divide por `POS` |
| «no son comparables con el ORTG de la NBA» | ✅ **Verdadera, y cuantificada** | el ORTG de la NBA es por 100 posesiones (Oliver). En esta liga, por posesión da **entre 9 % y 16 % más** (mediana 11,2 %): el 89,8 de C.E.Y E. es un 97,8 |
| «PACE son las posesiones proyectadas a 200 minutos de equipo» | ✅ **Verdadera** | resta el RO (son posesiones) y escala por `200 / MIN_equipo`; 200 = 5 × 40 |

**Lo que le falta**: no dice que en la misma card PACE está en **posesiones** y ORTG en **plays**. Leídos uno al lado del otro, invitan a multiplicarlos para sacar los puntos, y eso da un 11 % menos. Es exactamente lo que hace el Simulador (hallazgo 1). Redacción propuesta:

> *ORTG y DRTG: puntos cada 100 **plays** (una jugada que termina en tiro, libres o pérdida; el rebote ofensivo abre otra). No son el ORTG de la NBA, que es por 100 posesiones y acá daría ~11 % más. PACE: **posesiones** por partido de 40 minutos — otra unidad, así que PACE × PPP no da los puntos.*

---

## El impacto: 100 PLAYS contra 100 posesiones

La diferencia entre las dos varas **no es un factor fijo**: es exactamente la tasa de rebote ofensivo de cada equipo.

```
ORTG por posesión / ORTG por play  =  PLAYS / POS  =  1 + RO / POS
```

Medido sobre los 12 equipos de `IDA|REGULAR`:

| Equipo | ORTG /play | # | ORTG /pos | # | NET /play | # | NET /pos | # | plays / pos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| C E Y E | 89,8 | 1 | 97,8 | 2 | +10,9 | 2 | +8,4 | 3 | 1,089 |
| DEPORTIVO LA PLATA | 86,7 | 2 | 98,1 | 1 | +15,8 | 1 | +20,7 | 1 | 1,131 |
| DEPORTIVO SAN VICENTE | 82,7 | 3 | 90,9 | 3 | −3,6 | 7 | −6,9 | 7 | 1,099 |
| VILLA SAN CARLOS A | 82,6 | 4 | 90,3 | 5 | −1,9 | 6 | −3,6 | 6 | 1,094 |
| ATENAS B | 81,0 | 5 | 89,1 | 6 | −4,4 | 8 | −7,4 | 8 | 1,100 |
| HOGAR SOCIAL | 80,7 | 6 | 90,8 | 4 | +8,6 | 3 | +11,8 | 2 | 1,125 |
| U N L P | 80,0 | 7 | 88,8 | 7 | +2,7 | 5 | +2,6 | 5 | 1,111 |
| A MAYO | 77,7 | 8 | 87,3 | 8 | +7,0 | 4 | +7,5 | 4 | 1,124 |
| UNIVERSITARIO | 70,6 | 9 | 78,3 | 12 | −7,5 | 9 | −9,7 | 11 | 1,109 |
| C C TOLOSANO | 70,4 | 10 | 78,3 | 11 | −8,8 | 10 | −8,0 | 9 | 1,112 |
| PLATENSE B | 69,7 | 11 | 80,4 | 9 | −10,6 | 12 | −8,9 | 10 | 1,153 |
| SUD AMERICA LP | 67,7 | 12 | 78,6 | 10 | −9,8 | 11 | −10,1 | 12 | 1,162 |

- **9 de 12 equipos cambian de puesto en ORTG** y **6 de 12 en NET**. El salto máximo es de 3 puestos.
- **Quien gana el cristal ofensivo sale peor por play.** SUD AMERICA (1,162 plays por posesión) y PLATENSE B (1,153) son los que más suben al pasar a posesiones; C.E.Y E. (1,089), el que menos.

### Qué significa para un cuerpo técnico

Las dos son legítimas y contestan preguntas distintas:

| | Contesta | Sirve para |
|---|---|---|
| **Por play** (lo actual) | ¿Cuánto rinde cada intento, cada vez que la jugada termina? | Evaluar **selección de tiro y cuidado de la pelota**: una segunda oportunidad es otra jugada y se mide aparte |
| **Por posesión** | ¿Cuánto rinde cada vez que tenemos la pelota? | Comparar **equipos y ligas** y leer la literatura: es la vara de la NBA, de FIBA y de Oliver |

El riesgo concreto de quedarse solo con la de play: **el RTNG por play resta lo que el `RO%` suma**. Los 4 Factores premian el rebote ofensivo como factor propio, y el mismo rebote hunde el rating del equipo que lo gana. Un DT que mira el NET para decidir a quién se parece un rival puede leer como «flojo en ataque» a un equipo cuyo ataque es, en realidad, generar segundas oportunidades.

El propio panel ya tomó esa decisión en otro lado: **los quintetos (play-by-play, punto 62) muestran el NET por posesión primero**, con este argumento textual: *«PLAYS no descuenta el rebote ofensivo, así que castiga al quinteto que gana el cristal»* — el titular de Jujuy daba −2,2 por play y +7,6 por posesión. Hoy conviven las dos unidades sin que ninguna pantalla lo diga.

---

## Hallazgos de detalle

### 1 · El Simulador multiplica posesiones por puntos por play · ERROR DE CÁLCULO

```js
// js/sgadd-4factores.js
478  const paceEsperado = (perfL.pace + perfV.pace) / 2;       // POSESIONES
483  const pppEsperadoL = (perfL.pppOf + perfV.pppDef) / 2;    // puntos por PLAY
485  const baseL = paceEsperado * pppEsperadoL;                 // ← mezcla
```

El CLAUDE.md (punto 9 bis) declara *«el modelo de score base como `PLAYS × PPP` (identidad real de básquet)»*. El código usa el PACE, que es de posesiones. Medido sobre 202 partidos reales (sin el partido roto del 9/07):

| Fórmula | Error medio | Mediana | Sobre los puntos |
|---|---:|---:|---:|
| `PACE × PPP` (el simulador) | **−7,66** | −7,14 | **−11,4 %** |
| `PLAYS × PPP` (lo que dice el CLAUDE.md) | 0,00 | 0,00 | 0,0 % |
| `PACE × PTS/POS` (todo en posesiones) | −0,62 | −0,16 | −0,9 % |

El **ganador** proyectado casi no cambia —el error es parejo para los dos—, pero **no es del todo parejo**: pesa 1,089 en un equipo y 1,162 en otro, o sea ~7 % de diferencia entre los que menos y los que más rebotean en ataque. En un cruce cerrado eso puede dar vuelta la proyección. El **puntaje** proyectado, en cambio, sale siempre bajo: un partido de 67 lo proyecta en ~60.

**No se corrigió en esta auditoría**: el pedido fue documentar. Ver la recomendación 1.

### 2 · El glosario dice «posesiones» y la fórmula de al lado dice plays

```
RTNG OFF | Rating ofensivo  | PPP OF × 100 | Puntos cada 100 posesiones        ← js/sgadd-glosario.js:506
RTNG DEF | Rating defensivo | PPP DEF × 100| Puntos recibidos cada 100 posesiones
NET PPP  | Diferencial por posesión | PPP OF − PPP DEF | Tu ventaja neta por jugada   ← :471
PPP      | Puntos Por Play  | PTS / PLAYS  | ~0.90 es la media formativa
```

- El texto sale del **manual del motor** (`manuales/MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html:560`), que contradice al código del propio motor.
- `generar-glosario.js:211–235` ya corrige `PPP OF` y `PPP DEF` con `CORRECCIONES` (punto 61). `RTNG OFF`, `RTNG DEF` y `NET PPP` quedaron anotados como pendientes en ese mismo punto y siguen igual.
- El «~0,90 de media» del PPP **parece un valor por posesión**: en esta liga la mediana de ORTG por play es ~80 (0,80 por play) y por posesión ~89 (0,89). No se midió en formativas, así que queda como sospecha.

Un DT que pasa el mouse por la cabecera `RTNG OFF` en Equipos lee **lo contrario** de lo que dice la nota al pie de la card del partido.

### 3 · La fecha entera del 9/07 está cargada a medias

Empezó como un partido roto y **es la jornada completa**: los cuatro partidos de ese día, ocho de los doce equipos. Medido por fecha contra la mediana de la liga:

```
                       PACE     PPP     TCI
mediana de la liga     77,4    0,767     61
fecha 9/07/2026        51,2    1,257     38     ← −34 % · +64 % · −38 %
las otras 23 fechas   72,9–87,5  0,65–0,92  55–76
```

Es la firma de un box score truncado: **el marcador está completo y las acciones no**. Los cuatro partidos:

```
                             TCI   PP   PLAYS   PACE    PPP    PTS
C.E.Y E.     vs PLATENSE 'B'  28    0   31,5    28,8    2,25   71-59
PLATENSE 'B'                  23    0   26,1    30,1    2,26   59-71    MIN 191,65
A. MAYO      vs DEPORTIVO LP  28   12   50,1    48,3    1,02   51-64
DEPORTIVO LP                  41    4   52,5    48,3    1,22   64-51
HOGAR SOCIAL vs VILLA SC      45   11   64,4    54,3    1,09   70-80
VILLA SC                      38    8   55,2    54,3    1,45   80-70
D. SAN VIC.  vs U.N.L.P       35    9   51,0    51,2    1,18   60-77
U.N.L.P                       44    8   61,2    51,2    1,26   77-60
```

El caso extremo es el de C.E.Y E.:

- **El ORTG de C.E.Y E. en ese partido es 226.**
- En la temporada, **infla 5 puntos su ORTG** (89,8 con el partido, 84,8 sin él) y le baja 4,2 el PACE. Sin ese partido C.E.Y E. es **#2 en ataque, no #1**.
- El NET casi no se mueve (10,9 contra 10,2) porque el defecto infla los dos lados.

Los otros tres partidos del 9/07 están menos rotos (PACE 48–54) pero en la misma dirección, así que **ocho equipos arrastran un ORTG inflado y un PACE hundido** por esa fecha.

**Una coincidencia que conviene revisar, sin darla por causa**: el punto 47 del CLAUDE.md registra que los partidos cargados **a mano** —sin box score— de DEPORTIVO y de Reconquista son todos del **2026-07-09**. Que la misma fecha tenga partidos manuales y box scores truncados sugiere que ese día la fuente de la CABB vino incompleta.

Es un problema del **dato de entrada** (el box score o su carga en MotorStats), no de ninguna fórmula. Y **ningún validador del Diagnóstico lo detecta**: los invariantes del bloque 3 (`Σ PTS = Σ PTSopp`) cierran igual, porque el marcador está bien.

### 4 · ATENAS 'B' con acciones de menos en cuatro partidos

Fuera del 9/07, los partidos con la firma del truncado son **todos de ATENAS 'B'**, y en los cuatro el lado roto es el suyo:

```
                                       TCI   PP   PACE    PPP
 7/05/2026  ATENAS 'B' vs C.E.Y E.       49    1   53,1   1,25    (el rival también, PP 1)
11/06/2026  ATENAS 'B' vs D. SAN VIC.    47    2   56,8   1,05    (el rival también sale marcado: PPP 1,37)
18/06/2026  ATENAS 'B' vs U.N.L.P        51    2   55,2   1,11    (el rival también, PP 3)
13/08/2026  ATENAS 'B' vs VILLA SC       39    4   57,5   1,10    (el rival normal: PP 14, PPP 0,86)
mediana de la liga                     61   16   77,4   0,77
```

Sin las pérdidas, `PLAYS` y `POS` caen ~15 → PACE de 53–57 contra 77 de mediana y RTNG inflado. El patrón —siempre el mismo equipo, a veces con el rival también afectado— apunta a **quien carga las planillas de sus partidos**. Su mediana de pérdidas en la temporada es 12, contra 16 de la liga.

### 5 · Tres nombres para la misma métrica

| Nombre | Dónde |
|---|---|
| `RTNG OFF` / `RTNG DEF` | la planilla, el registro, Equipos, rankings, Simulador, Comparativa |
| `ORTG` / `DRTG` | la card «Eficiencia del partido», el scatter de Principal |
| `EFF OF` / `EFF DEF` | la matriz del informe de Scouting (`sgadd-scouting.js:1280`) |

### 6 · El panel mezcla unidades sin decirlo

Quintetos, dúos y tríos (`sgadd-pbp.js`, punto 62) → **por posesión primero**. Todo lo demás → **por play**. Las dos decisiones están bien argumentadas por separado; juntas, un +7,6 en la card de quintetos y un −2,2 en la ficha del mismo equipo describen lo mismo y parecen contradecirse.

### Fuera de alcance, pero de la misma familia

En `PROMEDIOS 4F`, `PP%`, `RTL%` y `RO%` salen del **promedio simple** de los valores partido a partido (`MotorStats_Library.js:6298`), no de la razón de totales: le da el mismo peso a un partido de 57 plays que a uno de 90. El `eFG%` se corrigió en la v40 del motor; los otros tres no. **No se midió en esta auditoría** — queda anotado desde el código.

---

## d) Opciones y recomendaciones

### Recomendación 1 · Corregir el Simulador · **hacerlo ya**

Es el único error de cálculo encontrado. Dos formas equivalentes, las dos exactas sobre los datos reales:

- **`PLAYS × PPP`**, que es lo que el CLAUDE.md ya dice. Hace falta el PLAYS esperado del cruce, que no es el PACE.
- **`PACE × PTS/POS`**: todo en posesiones (−0,9 %, el residuo de promediar las posesiones de los dos). Tiene la ventaja de que el PACE ya es el ritmo del cruce.

Cualquiera de las dos lleva su test de regresión con un partido real, y verificar al revés que falla con la fórmula actual. Después hay que re-medir la calibración del simulador: el bonus de localía y la confianza se ajustaron sobre scores que venían 11 % bajos.

### Recomendación 2 · Corregir el glosario · **hacerlo ya**

Sumar `RTNG OFF`, `RTNG DEF` y `NET PPP` a `CORRECCIONES` en `generar-glosario.js`, igual que se hizo con `PPP OF`/`PPP DEF`, y regenerar. Y avisarle a MotorStats que su manual (línea 560) contradice a su código. Revisar de paso el «~0,90 de media» del PPP.

### Recomendación 3 · Detectar el box score truncado · **hacerlo ya**

Un validador nuevo en el Diagnóstico con **la firma del defecto**: el marcador está completo y las acciones no, así que el partido sale **lento y a la vez eficientísimo**. Las dos condiciones juntas, por fila equipo-partido:

```
PACE < 80 % de la mediana de la liga   Y   PPP > 120 % de la mediana
```

Medido sobre las 210 filas de este libro:

| Criterio | Filas | Partidos | Qué deja afuera |
|---|---:|---:|---|
| **La firma combinada** (PACE bajo **y** PPP alto) | **15** | **8** | nada con PP ≤ 3: atrapa todas |
| `PP ≤ 3` de los dos lados | 6 | 3 | el 11/06 y el 13/08, donde solo un lado vino sin pérdidas; y tres partidos del 9/07 |
| `TCI` < mitad de la mediana del equipo | 3 | 2 | todo lo de ATENAS 'B' |
| `PACE` fuera de ±40 % | 2 | 1 | todo salvo el partido más roto |
| `MIN` de equipo ≠ 200/225/250 | 1 | 1 | ídem |

Los ocho de la firma combinada son **exactamente** los cuatro partidos de la fecha del 9/07 más los cuatro de ATENAS 'B' de los hallazgos 3 y 4. De las 16 filas de esos ocho partidos marca 15: la que no marca es Villa San Carlos el 13/08, cuyo lado del box score es normal (TCI 47, PP 14, PPP 0,86) — o sea que acierta también en qué lado está roto.

**Las dos condiciones tienen que ir juntas, no alcanza con una.** El 14/09 tiene el PPP por encima del corte por una milésima (0,923 contra 0,921), pero con el PACE en 87,5: es un partido rápido y goleador, no uno truncado. Con un «o» saldría marcado.

Y conviene sumar el mismo control **por fecha**, con la mediana de la jornada: el 9/07 da PACE 51,2 y PPP 1,257 contra 77,4 y 0,767 de la liga, y es la **única** de las 24 fechas que cae ahí. Una jornada entera así apunta a la carga, no a un planillero.

**El panel no debe excluir esos partidos por su cuenta** —sería reescribir el torneo— sino denunciarlos en el Diagnóstico, que es la regla de siempre: un dato inventado es peor que uno ausente. La corrección va en MotorStats, y el aviso de la carpeta de ATENAS 'B' conviene mandarlo con los cuatro partidos listados.

### Recomendación 4 · Un solo nombre · baja prioridad

`ORTG` / `DRTG` / `NET` en toda la interfaz —es lo que el DT reconoce— y `RTNG OFF` / `RTNG DEF` / `NET RTNG` solo como nombre de columna de la planilla. La matriz de Scouting pasa de «EFF OF» a «ORTG».

### Recomendación 5 · La unidad de los ratings · decisión de producto

Tres opciones, de menor a mayor alcance:

| Opción | Qué es | Costo | Recomendación |
|---|---|---|---|
| **A · Documentar** | dejar todo por play y decirlo en cada pantalla, con la nota al pie reescrita (sección c) | mínimo | **mínimo indispensable** |
| **B · Agregar** | sumar `ORTG/100 pos`, `DRTG/100 pos` y `NET/100 pos` **al lado** de los de play, calculados en la web desde el `POS` que la planilla ya trae | bajo · no toca el motor | **recomendada** |
| **C · Reemplazar** | pasar los ratings a 100 posesiones | alto · rompe la continuidad con la planilla que el club audita y contradice la decisión v29 del motor | **no, salvo decisión conjunta con MotorStats** |

La **B** es la que el propio motor dejó prevista (*«iría como una métrica nueva y aparte, nunca reemplazando a ésta»*), la que ya usan los quintetos, y la única que permite comparar contra la literatura sin perder lo que el club ya mira. No necesita un solo cambio en MotorStats: `POS` está en `Base Datos E`, `PROMEDIOS E` y `ACUMULADO E`.

---

## Cómo se midió · reproducible

Los cinco scripts están en el scratchpad de la sesión y solo leen; corren con `node` sobre el libro guardado:

| Script | Qué verifica |
|---|---|
| `aud-eficiencia.js` | las fórmulas del motor y de la web contra las 210 filas y los 12 equipos; el impacto play contra posesión |
| `aud-anomalias.js` | los 5 PACE que no cierran contra los minutos de `Base Datos J`; el MIN de 191,65; las pérdidas en cero |
| `aud-impacto.js` | cuánto mueve el partido roto el rating de temporada |
| `aud-simulador.js` | `PACE × PPP` contra `PLAYS × PPP` sobre 202 partidos |
| `aud-validador.js` | qué marca cada criterio del validador propuesto, fila por fila |

**Una corrección hecha al escribir este informe**, que vale anotar por el método: la primera versión de la recomendación 3 decía que cuatro criterios sueltos marcaban «exactamente los cuatro partidos, sin falsos positivos». No se había medido. Medido, dejaban afuera dos partidos de ATENAS 'B' y tres del 9/07 — y fue al buscar por qué que apareció que el defecto era **la fecha entera**, no un partido.

**Lo que NO se verificó**: otros libros (la U21, la U23 y Jujuy pueden tener otros defectos de dato), la liga de formativas para el «~0,90» del glosario, y el promedio simple de `PP%`/`RTL%`/`RO%` en `PROMEDIOS 4F`, que queda anotado solo desde el código. Y **la causa** de los hallazgos 3 y 4: se sabe qué filas vienen mal y con qué firma, no por qué — eso se ve en el box score original de la CABB.
