# Integración MotorStats → SGADD

> **Qué es esto.** Auditoría completa del repositorio `C:\Users\Pc\mi-motor-stats`
> y su integración en SGADD (`C:\Users\Pc\Documents\estadisticas`).
> Corte: 2026-08-10 · MotorStats v52 (`MS_VERSION 2026.5.1`) · SGADD `?v=46`

---

## 0 · El hallazgo que reencuadra todo

**MotorStats y SGADD son las dos mitades del mismo pipeline, y ninguno de los dos
lo tenía documentado.**

```
CABB (box score)  →  MotorStats (Apps Script)  →  Google Sheets  →  SGADD (panel web)
                     ESCRIBE las 9 hojas          9 hojas           LEE vía GViz
```

No es una hipótesis: el `ESQUEMA` de SGADD y los `ENCABEZADOS_FINALES_*` del motor
son **la misma especificación**. Mismas 9 hojas, mismos nombres de columna, mismas
filas `EQUIPO TIPO` / `JUGADOR TIPO`, mismas métricas propias del sistema
(`PePP%`, `PPT2/3/1`, `AST-PP`, `PLAYSopp`). SGADD fue escrito contra la salida del
motor sin que quedara asentado en ningún lado.

Eso cambia la naturaleza de esta integración: no se trata de copiar código de un
proyecto al otro —son lenguajes y entornos distintos, Apps Script contra JS de
navegador— sino de **sincronizar el contrato de datos** y traer al consumidor el
conocimiento que el productor ya había ganado a fuerza de bugs.

---

## 1 · Inventario completo de MotorStats

26 archivos, 1,26 MB. Recorridos en su totalidad.

### Código fuente

| Archivo | KB | Qué es |
|---|---:|---|
| `libreria/MotorStats_Library.js` | 538,9 | El motor. Librería privada de Apps Script |
| `cliente/Cliente_Script.js` | 9,2 | Menú de 12 bloques + 13 llamadas a la librería |
| `cliente/Configuracion.js` | 7,0 | `MI_CONFIG` del usuario + diagrama de carpetas |
| `licencias/Licencias_Backend.js` | 32,8 | Backend de licencias |
| `_original/consolidaciondatos.js` | 334,0 | Código original pre-refactor (referencia) |
| `_original/analisispartido.js` | 1,9 | Original del cálculo por jugador |
| `_backup_cliente_remoto/Cliente_Script.js` | 13,9 | Respaldo del cliente remoto |
| `actualizar-cliente.ps1` | 8,1 | Despliegue que preserva `MI_CONFIG` |

### Documentación

| Archivo | KB | Qué aporta |
|---|---:|---|
| `CAMBIOS.md` | 69,6 | **Registro forense v23→v52.** La joya del repo: causa raíz, verificación con datos reales y forma de revertir, versión por versión |
| `MANUAL_ESTRUCTURA_Y_CARPETAS.md` | 19,4 | Jerarquía de 5 niveles, convención `TORNEO - FASE`, modelo de datos |
| `METRICAS.md` | 18,3 | **Cómo se calcula cada métrica**, con las diferencias contra el glosario |
| `MANUAL_DE_USUARIO_MOTORSTATS.md` | 36,6 | Manual completo en Markdown |
| `manuales/*.html` × 3 | 341,9 | Instalación · Flujo Diario · Glosario de 73 columnas |
| `PROJECT_STATUS_Y_PROXIMOS_PASOS.md` | 12,6 | Estado ejecutivo (creado en la sesión anterior) |

### Lo que NO está en el repo

`smoke.js`, `smoke4.js`, `smoke24.js`, `auditApi.js`, `verif_variables.js`,
`escenariosB.js`, `fixCabecera.js`, `paleta.ps1` — todos citados en `CAMBIOS.md`
pero **ausentes del disco**: vivían en scratchpads de sesión. La batería de
pruebas del motor no es reproducible hoy. Queda anotado como riesgo, no se puede
resolver desde acá.

---

## 2 · Conocimiento auditado, contrastado contra el código

No se tomó `CAMBIOS.md` como palabra: cada afirmación se verificó en la librería.

| Símbolo declarado en v48–v52 | Ocurrencias reales | |
|---|---:|---|
| `_tasaOVacio_` | 7 | ✅ |
| `_blanquearTasasSinMinutos_` | 3 | ✅ |
| `_validarTorneo_` | 4 | ✅ |
| `_grupoDeFila_` | 10 | ✅ los 6 sitios de clave + helpers |
| `_etiquetaGrupo_` | 18 | ✅ |
| `_escribirTorneo_` | 10 | ✅ |
| `_grupoJugador_` · `_mapaBase1_` · `_quitarPrefijoPartido_` · `limpiarDuplicados` | 2 / 3 / 2 / 1 | ✅ |

### Definiciones que SGADD ya compartía (confirmadas, no cambiadas)

| Concepto | MotorStats | SGADD | |
|---|---|---|---|
| `PLAY` | `TCI + 0.44×T1I + PP` | idéntico | ✅ |
| `POS` | `PLAY − RO` | idéntico | ✅ |
| `PPP` | Puntos por **Play**, no por posesión | idéntico | ✅ |
| `RTNG OFF/DEF` | por 100 **plays** | idéntico y etiquetado | ✅ |
| `EQUIPO TIPO` | la **mediana**, en escala por partido (v38) | idéntico | ✅ |
| Tasas vs. volumen | las tasas se recalculan, no se promedian (v37) | idéntico | ✅ |
| 4 FACTORES usa `PP%` | no `PePP%` | idéntico | ✅ |

**Ninguna fórmula de SGADD contradice al motor.** Es el resultado más tranquilizador
de la auditoría y explica por qué el panel viene funcionando.

---

## 3 · Diagnóstico de brechas (verificado, no supuesto)

### B1 · Tres columnas que el motor escribe y SGADD no conocía

Diff programático entre los 9 arrays `ENCABEZADOS_FINALES_*` y el `ESQUEMA`:

| Columna | Desde | Dónde | Estado en SGADD |
|---|---|---|---|
| `+/-` | v30 · v33 | Base Datos J · ACUMULADO J · PROMEDIOS J | 🔴 desconocida |
| `ID_ARCHIVO` | v43 | las 3 maestras | 🔴 desconocida |
| `TORNEO` | v44 · v47 · v48 | **las 9 hojas** | 🔴 desconocida |

En sentido inverso: **SGADD no exige ninguna columna que el motor no escriba.** Sin
riesgo de rotura por ese lado.

### B2 · 🔴 El defecto de la v49 del motor, del lado del consumidor

Reproducido con una fixture de dos torneos:

```
ENTRADA (planilla v52 con dos competencias)
  A | APERTURA | REGULAR | PTS=80 | eFG%=0,55
  A | CLAUSURA | REGULAR | PTS=60 | eFG%=0,42

SALIDA de construirIndice()
  A  PTS=60  eFG%=0,42        ← la fila de APERTURA desapareció
```

SGADD agrupa por `EQUIPO + FASE` y no mira `TORNEO`. Desde v47 la columna `FASE`
guarda la fase **limpia** (`"REGULAR"`), así que lo que distingue un tramo de otro
es el par `TORNEO + FASE`. Es **exactamente** el defecto que el motor corrigió en
su v49 en `PROMEDIOS E`, `ACUMULADO 4F` y `PROMEDIOS 4F`.

**Alcance hoy: nulo.** Verificado contra la planilla real de Reconquista — está en
esquema **pre-v43** (53/33/56/19/11/22/53/32/56 columnas, sin `TORNEO`, sin
`ID_ARCHIVO`, sin `+/-`) y cada torneo vive en su propia planilla. El riesgo se
activa **el día que el club migre a v52 y cargue dos torneos juntos.**

### B3 · La regla de celdas vacías ya funcionaba

`num('')` devuelve `null` y las tasas nulas no entran a `distribucionesJ`. Con datos
v52 el comportamiento de SGADD **mejora solo**: un jugador con `MIN=0` y `eFG%=""`
queda fuera de los percentiles en vez de contaminarlos con un `0`. No hizo falta
cambiar nada — pero sí amarrarlo con tests, porque hoy no había ninguno.

### B4 · Compatibilidad hacia adelante: verificada

Se construyó una fixture con los **9 arrays de encabezados reales de v52** y se pasó
por `validarEsquema`: **0 errores.** SGADD ignora las columnas que no conoce. La
migración del club no rompe el panel.

---

## 4 · Qué se integró

### 4.1 · `COLS_MOTOR` y la clave `motor` en el ESQUEMA

```js
const COLS_MOTOR = ['TORNEO', 'ID_ARCHIVO', '+/-'];
```

Declaradas en las 9 hojas bajo una clave **nueva**, `motor`, no bajo `opt`.

> **Casi meto una regresión acá y quedó registrada.** El primer intento las puso en
> `opt`. Semánticamente `opt` significa *"si falta, se degrada la UI → warning"*, y
> al probar contra la planilla real de Reconquista el Diagnóstico pasó de **0 a 9
> avisos**: uno por hoja, por columnas que no degradan absolutamente nada. La clave
> `motor` documenta el contrato sin ensuciar el diagnóstico. Hay un test que lo
> amarra.

### 4.2 · `validarTorneo(hojas)` — guard nuevo

Mismo criterio que `_validarTorneo_` del motor (v48 · P2): **avisa, no aborta.**

| Situación | Resultado |
|---|---|
| Dos o más torneos en una hoja | 🔴 **error** — nombra los torneos y explica que el índice los colapsa |
| Parte de las filas con `TORNEO` y parte sin | 🟡 aviso — convención mixta en las carpetas de Nivel 5 |
| Un solo torneo | silencio |
| Sin la columna (pre-v44) | silencio |
| Fila `EQUIPO TIPO` sin torneo | no cuenta como faltante |

Conectado al bloque **2 · Contrato de esquema** del Diagnóstico. Se concatenó ahí en
vez de abrir una card nueva para no renumerar los bloques que el club ya conoce.

**No se cambió la clave del índice.** Incluir `TORNEO` en `claveEquipo()` es un
refactor que toca todas las secciones, y no se hace a espaldas de una advertencia
que hoy no dispara para ningún cliente.

### 4.3 · `+/-` en el registro de métricas

```js
M('+/-', 'Más/menos', 'PROMEDIOS J', 'num1', false, 'jugador', …)
```

Registrada para que `leer()` y `formatear()` la manejen si aparece. **No se agregó a
ninguna VISTA**: meterla en el box score es una decisión de producto, no técnica.

El comentario deja asentada la trampa que el motor documentó en v31: **el `+/-` de un
equipo es el margen del partido, nunca la suma de los individuales** — con 5 jugadores
en cancha esa suma da 5× el margen (±95 en vez de ±19 en el partido verificado).

### 4.4 · Tests de contrato (18 nuevos, en `test-core.js`)

Amarran lo que antes era conocimiento tácito:

- Las 3 columnas declaradas en `motor`, y **explícitamente NO en `opt`** (guard de la
  regresión del punto 4.1).
- Una hoja con encabezados v52 no produce error de esquema.
- Las 4 ramas de `validarTorneo`.
- `num('') === null` y `num(0) === 0` — la distinción de v48.
- Una tasa vacía no entra a la distribución de la liga ni corre el percentil de los demás.
- `+/-` formateado con un decimal, no invertida, y fuera de las vistas.

---

## 5 · Qué se preservó intacto

Regla de no regresión. **Cero archivos borrados, cero funciones modificadas.**

| Componente | Estado |
|---|---|
| Las 4 secciones (Equipos · Jugadores · Scouting · Simulador) | intactas |
| `sgadd-scouting.js` — motor de marcas, bandas z, 33 perfiles defensivos | intacto |
| `sgadd-jugadores.js` — ADN centralizado, rankings top 20 | intacto |
| `sgadd-4factores.js` — Simulador 360°, regresión múltiple | intacto |
| `sgadd-personalidad.js` · `sgadd-partido.js` · `sgadd-rankings.js` · `sgadd-equipos.js` | intactos |
| Las 677 pruebas que ya existían | todas verdes |
| `req` y `opt` del ESQUEMA | sin tocar |
| Multi-cliente, logos, ruteo | sin tocar |

**Lo que NO se trajo, y por qué:**

| De MotorStats | Por qué no |
|---|---|
| Código de la librería | Apps Script contra JS de navegador. SGADD no escribe planillas: las lee |
| `limpiarDuplicados` | La deduplicación es responsabilidad del productor |
| Licencias | Fuera del alcance de un sitio estático |
| Paleta institucional | Es la identidad de MotorStats. SGADD tiene la del club, y es multi-cliente por diseño |
| Los 3 manuales HTML | Documentan el motor, no el panel |

---

## 6 · Estado final del sistema unificado

```
┌─────────────────────────────────────────────────────────────────┐
│  MotorStats v52          │  Google Sheets  │  SGADD ?v=46       │
│  Apps Script (privado)   │  9 hojas        │  Sitio estático    │
│  ESCRIBE                 │  CONTRATO       │  LEE vía GViz      │
├──────────────────────────┼─────────────────┼────────────────────┤
│  ENCABEZADOS_FINALES_*   │◄── verificado ─►│  ESQUEMA           │
│  _tasaOVacio_ → ""       │◄── verificado ─►│  num('') → null    │
│  TORNEO (v44)            │  ── pendiente ─►│  validarTorneo()   │
│  ID_ARCHIVO (v43)        │  ── declarada ─►│  COLS_MOTOR        │
│  +/- (v30)               │  ── declarada ─►│  METRICAS          │
└─────────────────────────────────────────────────────────────────┘
```

| Indicador | Antes | Ahora |
|---|---|---|
| Tests SGADD | 677 | **695** |
| Columnas del motor conocidas | 0 de 3 | **3 de 3** |
| Guard de colapso entre torneos | no existía | **activo** |
| Diagnóstico con la planilla real | 0 errores · 0 avisos | **0 errores · 0 avisos** *(sin cambios)* |
| Compatibilidad con planillas v52 | no verificada | **verificada, 0 errores** |

### Verificación en el navegador, con datos reales

Primera · Clausura 2026 · 12 equipos · 210 jugadores · 66 partidos:
`validarEsquema` → 0 errores, 0 avisos · `validarTorneo` → 0 hallazgos ·
`ESQUEMA['PROMEDIOS E'].motor` presente · `opt` de vuelta en `['POS','PACE']`.

---

## 7 · Recomendaciones al club

1. **Antes de migrar a MotorStats v52**, correr el Bloque 6 →
   `🧹 Limpiar Partidos Duplicados`. Si la planilla pasó por una versión entre v47
   y v50, cada corrida del Bloque 2 duplicó los partidos y los `PJ` están al doble.
2. **Una planilla por torneo**, como hasta ahora. Si alguna vez se cargan dos en la
   misma, el Diagnóstico ahora lo marca en rojo en vez de perder datos en silencio.
3. Al migrar, `+/-` aparece disponible para Jugadores. Es una decisión de producto
   si entra al box score; el motor ya lo propaga a `ACUMULADO J` y `PROMEDIOS J`.
4. **Del lado de MotorStats:** la batería de pruebas no está en el repo. Sin ella,
   el Hito 1 del roadmap (refactor de `procesarEstadisticasJugador_`, la función de
   627 líneas) no tiene red.

---

## 8 · Si el club carga dos torneos en una planilla

El guard lo detecta, pero **la solución de fondo es un refactor pendiente**: incluir
`TORNEO` en la clave del índice (`claveEquipo` + los índices derivados). Toca las
4 secciones y los 695 tests. No se hizo acá porque:

- ninguna planilla en producción lo necesita hoy,
- el guard convierte una pérdida silenciosa en un error visible,
- y hacerlo bien requiere decidir si `TORNEO` entra en la ruta del hash
  (`#/<planilla>/<fase>/…`), que es un cambio de contrato de URL.

Queda documentado como el próximo hito de integración cuando el club lo necesite.
