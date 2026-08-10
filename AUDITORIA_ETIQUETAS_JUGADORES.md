# Auditoría de etiquetas de clasificación de jugadores · SGADD

Relevamiento completo de **toda** regla que le pone un nombre a un jugador en el
panel: bandas de minutos, jerarquía, arquetipos técnicos, rol funcional, marca
defensiva, perfil de defensor asignado, fortalezas, fugas y claves estratégicas.

- **Fecha del relevamiento:** 2026-08-10
- **Reconfiguración aplicada:** 2026-08-10 (ver
  [§VI](#vi-reconfiguración-aplicada--rangos-recomendados-y-distribución-final))
- **Versión de assets auditada:** `?v=51`
- **Archivos inspeccionados:** `js/sgadd-jugadores.js` (1501 líneas),
  `js/sgadd-scouting.js` (2205), `js/sgadd-core.js` (índice y percentiles),
  `js/sgadd-ui.js` (render de badges)
- **Datos de contraste:** Primera · Clausura 2026 (La Plata) — 12 equipos,
  210 jugadores, 97 calificados, 72 partidos. Todas las frecuencias de este
  documento salen de correr el motor sobre esa liga real, no de estimaciones.
- **Código operativo tocado en el relevamiento:** ninguno.
- **Estado:** las secciones I a V describen el sistema **tal como se relevó**.
  La reconfiguración posterior está en la [sección VI](#vi-reconfiguración-aplicada--rangos-recomendados-y-distribución-final),
  y cada cambio aplicado quedó marcado en su punto ciego con **[RESUELTO]**.

---

## Índice

- [0. Cómo leer esta auditoría](#0-cómo-leer-esta-auditoría)
- [I. Glosario de clasificación ofensiva](#i-glosario-de-clasificación-ofensiva)
- [II. Glosario de clasificación defensiva](#ii-glosario-de-clasificación-defensiva)
- [III. Matriz de combinación y ADN centralizado](#iii-matriz-de-combinación-y-adn-centralizado)
- [IV. Mapa técnico de código](#iv-mapa-técnico-de-código)
- [V. Diagnóstico de oportunidades y puntos ciegos](#v-diagnóstico-de-oportunidades-y-puntos-ciegos)
- [VI. Reconfiguración aplicada · rangos y distribución final](#vi-reconfiguración-aplicada--rangos-recomendados-y-distribución-final)
- [VII. Segunda auditoría · marcas, catálogo defensivo, fugas y claves](#vii-segunda-auditoría--marcas-catálogo-defensivo-fugas-y-claves)
- [VIII. Plan defensivo colectivo](#viii-plan-defensivo-colectivo--las-marcas-se-conectan-entre-sí)
- [Anexo A · Inventario numérico](#anexo-a--inventario-numérico)
- [Anexo B · Métricas de la planilla usadas para clasificar](#anexo-b--métricas-de-la-planilla-usadas-para-clasificar)

---

## 0. Cómo leer esta auditoría

### Las cinco referencias contra las que se compara

El error más fácil al leer el sistema es suponer que todas las etiquetas se
calculan contra lo mismo. **No es así, y es deliberado.**

| Referencia | Qué contesta | Dónde se usa |
|---|---|---|
| **Absoluta** (umbral fijo) | ¿Es bueno en términos de básquet? | Bandas de minutos, T1%, PPT3 rentable |
| **Promedio de la liga** (media simple de calificados) | ¿Está por encima del jugador medio? | Arquetipos técnicos, jerarquía |
| **Mediana de la liga** (`JUGADOR TIPO`) | ¿Está por encima del jugador típico? | Relativos de rebote y pérdidas |
| **Banda z contra la liga** (±1,2σ / ±0,5σ) | ¿Cuánto se despega de la liga? | Decisiones tácticas de marca |
| **Dentro del plantel rival** | De estos ocho, ¿a quién marco? | Semáforo top-3 del informe |

Un mismo jugador puede ser "por encima del promedio" (arquetipo) y "en el
promedio de la liga" (banda z) sin contradicción: la primera compara contra la
media aritmética, la segunda mide desvíos estándar.

### El umbral de calificación

`liga.minJugador` = el `MIN` de la fila `JUGADOR TIPO` de la liga
(`sgadd-core.js:1219`). En la liga auditada da **15,37 minutos**, y deja
**97 de 210** jugadores (46%) como calificados.

Solo los calificados entran en:

- las distribuciones de percentil (`liga.distribucionesJ`, `sgadd-core.js:1314`),
- los promedios de liga de los arquetipos (`jugadoresPromediosLiga`),
- la media y el desvío de las bandas z (`statLiga`).

Los no calificados **sí reciben etiquetas** (rol por minutos, jerarquía, rol
funcional), pero **no reciben percentil**. Ver el punto ciego [P-7](#p-7-el-umbral-de-calificación-se-aplica-a-la-referencia-pero-no-a-la-etiqueta).

### Convención de umbrales

- `x A` = A veces el valor de referencia (relativo).
- Los porcentajes se guardan en el índice como **fracción** (0,34 = 34%).
- `PPT3` = puntos por triple **intentado** (no por convertido).
- `PLAY` = `TCI + 0,44 × T1I + PP`. `PPP` = `PTS / PLAYS`.

---

## I. Glosario de clasificación ofensiva

Cuatro taxonomías independientes, más las etiquetas derivadas del informe.
**Ninguna reemplaza a las otras: contestan preguntas distintas.**

### I.1 · Banda de minutos — *¿cuánto juega?*

`ROLES_MINUTOS` · `sgadd-jugadores.js:227-250`

Cascada excluyente sobre el promedio de `MIN`. **A propósito NO usa
percentiles**: un promedio de 27 minutos es carga alta en cualquier categoría.
Es la única taxonomía del sistema con umbrales enteramente absolutos, y fue un
pedido explícito del club.

| Etiqueta | `id` | Condición **(vigente)** | Rol asociado | n |
|---|---|---|---|---|
| Jugador Clave | `clave` | `MIN ≥ 25` | Dependencia Absoluta | 34 / 210 (16%) |
| Jugador Importante | `importante` | `20 ≤ MIN < 25` | Consistencia Estructural | 33 / 210 (16%) |
| Jugador de Rotación | `rotacion` | `15 ≤ MIN < 20` | Impacto Quirúrgico | 31 / 210 (15%) |
| Pocos Minutos | `pocos` | `MIN < 15` | Contención y Emergencia | 112 / 210 (53%) |

*Recalibradas en la [sección VI.1](#vi1--bandas-de-minutos). Los cortes del
relevamiento original eran 26 / 23 / 13, con 32 / 14 / 60 / 104.*

Matiz adicional: `urgente = MIN < 10` marca, dentro de *Pocos Minutos*, la
muestra demasiado chica hasta para esa banda.

**Uso en la interfaz:** badge de color en el header de la ficha del jugador y
bajo el nombre en cada card del plantel filtrado. En Scouting, `priorizar()`
usa `['clave','importante']` para decidir a quién nombra primero el resumen
estratégico.

---

### I.2 · Jerarquía en el plantel — *¿cuánto pesa?*

`JERARQUIA` · `sgadd-jugadores.js:335-368`

**Cascada excluyente**: gana el primero que calza, de más a menos exigente.
`prom.PLAYS` es la media simple de `PLAYS` entre los calificados de la liga.

| # | Etiqueta | `id` | Condición exacta | Frecuencia real |
|---|---|---|---|---|
| 1 | ⭐ Jugador Franquicia | `franquicia` | `PLAYS > 1,20 × prom.PLAYS` **y** `MIN > 28` | 16 / 210 (8%) |
| 2 | ⚔️ Referente Ofensivo / Segunda Espada | `referente` | `PLAYS > prom.PLAYS` | 26 / 210 (12%) |
| 3 | 🧱 Pieza de Rotación Alta | `quinteto` | `MIN ≥ 23` | 13 / 210 (6%) |
| 4 | 🛠️ Especialista de Rol | `especialista` | *fallback, siempre calza* | 155 / 210 (74%) |

> **Nota de nomenclatura.** El nivel 3 se llamaba *Pieza de Quinteto Titular* y
> se renombró: la planilla **no trae el quinteto inicial**, y 23 minutos los
> puede hacer un sexto hombre. El umbral mide carga de minutos, que es lo que
> el dato sostiene. Hay tests que recorren todas las etiquetas del sistema y
> fallan si vuelve a aparecer la palabra "titular".

**Uso en la interfaz:** título grande del bloque "ADN del jugador" (Tab
General), badge naranja en cards y en la ficha de Scouting.

---

### I.3 · Arquetipos técnicos — *¿qué sabe hacer?*

`PERFILES_TECNICOS` · `sgadd-jugadores.js:291-331`

**NO son excluyentes**: un jugador puede calzar en varios, en uno o en ninguno.
Se evalúan contra el **promedio simple** de los calificados de la liga.

| Etiqueta | `id` | Condición exacta | Métricas | Frecuencia real |
|---|---|---|---|---|
| 🎯 Terminador de Élite | `terminador` | `PLAYS > prom.PLAYS` **y** `eFG% > 1,15 × prom.eFG%` **y** `PPP > 1,05` | PLAYS, eFG%, PPP | 4 / 210 (2%) |
| 🧠 Generador | `generador` | `AST-PP > 1,40` | AST-PP | 29 / 210 (14%) |
| 🏰 Puntal en la Pintura | `puntal` | `RT > 1,20 × prom.RT` | RO+RD | 28 / 210 (13%) |
| 🎯 Amenaza Perimetral Real | `amenaza` | `T3I > 3,0` **y** `T3% > 0,34` | T3I, T3% | 11 / 210 (5%) |
| 🧤 Especialista Defensivo | `especialistaDef` | `PR > 1,30 × prom.PR` | PR | 30 / 210 (14%) |
| 📏 Buscador de Contacto | `buscadorContacto` | `RTL% ≥ 0,28` **y** `FR ≥ 2,5` **y** `PT1% ≥ 0,12` **y** `T1% ≥ 0,72` | RTL%, FR, PT1%, T1% | 12 / 210 (6%) |

*El criterio del relevamiento (`PT1% > 0,25` y `T1% > 0,80`) daba **0 / 210**:
era imposible de cumplir. Reconfigurado en la [sección VI.2](#vi2--rangos-recomendados-por-etiqueta).*

Distribución de cantidad de arquetipos por jugador:

| Arquetipos | Jugadores | % |
|---|---|---|
| 0 | 135 | 64% |
| 1 | 47 | 22% |
| 2 | 19 | 9% |
| 3+ | 9 | 4% |

`RT` se deriva con `jugadoresRT(j)` (`sgadd-jugadores.js:271`): usa la columna
`RT` si vino, si no suma `RO + RD`.

**Uso en la interfaz:** chips con emoji y tooltip en el bloque ADN, y hasta
tres badges verdes en las cards del plantel (`jugadoresBadges()`, recortado con
`.slice(0, 3)`).

---

### I.4 · Rol funcional — *¿qué función cumple en cancha?*

`JUGADORES_ROLES_FUNCIONALES` · `sgadd-jugadores.js:408-460`
Umbrales en `JUGADORES_UMBRALES` · `sgadd-jugadores.js:392-405`

**Cascada excluyente sin posiciones tradicionales** (no hay base / alero /
pivote). Se evalúa sobre el perfil que arma `jugadoresPerfilBase()`.

#### Umbrales

| Constante | Valor | Significado |
|---|---|---|
| `minutosClave` | 20 | Debajo de esto no condiciona un plan |
| `astPPGenerador` | 1,40 | AST-PP de un conductor real |
| `astVolumenGenerador` | 2,5 | El ratio solo no alcanza: hace falta volumen |
| `usoTripleAlto` | 0,40 | 40% de sus plays terminan en triple |
| `pptDobleAlto` | 1,10 | Finaliza de verdad cerca del aro |
| `reboteOfensivoAlto` | 1,20 | x la mediana de la liga en RO% |
| `reboteInterior` | 1,15 | x la mediana de la liga en RD% |
| `mezclaTripleaPerimetral` | 0,30 | `T3I / (T3I+T2I)` ≥ esto → tira de afuera |
| `mezclaTripleInterior` | 0,12 | Debajo, prácticamente no sale del área |

#### Discriminantes de origen

Se calculan en `jugadoresPerfilBase()` (`sgadd-jugadores.js:516-530`) y son la
guarda que impide el bug original (clasificar un slasher como poste bajo):

```
mezclaTriple   = T3I / (T3I + T2I)     ← sobre INTENTOS, no conversiones
reboteRel      = RO% / mediana(RO% de los calificados)
reboteDefRel   = RD% / mediana(RD% de los calificados)
reboteTotalRel = RT  / mediana(RT  de los calificados)

mezclaTriple < 0,12    → esInterior
mezclaTriple ≥ 0,30    → esPerimetral
en el medio            → esInterior si reboteTotalRel ≥ 1,10, si no esPerimetral
sin tiros de campo     → ninguno de los dos (no se infiere)
```

*Dos cambios respecto del relevamiento: la referencia dejó de ser el
`JUGADOR TIPO` (ver [VI.0](#vi0--el-hallazgo-que-reordena-el-diagnóstico-original))
y el tramo intermedio dejó de ser una zona muerta (ver
[P-6](#p-6-el-fallback-absorbe-un-tercio-del-universo)).*

**Override:** si los arquetipos ya marcaron *Amenaza Perimetral Real*, se fuerza
`esPerimetral = true` y `esInterior = false`. La ficha de Jugadores es la fuente
primaria del origen; el cálculo de mezcla es el respaldo.

Los dos flags pueden dar falso a la vez, pero **solo** cuando el jugador no
registra un tiro de campo en todo el torneo: **27 de 210 (13%)**. En el
relevamiento, con la zona muerta abierta, eran 74 (35%).

#### La cascada

| # | Etiqueta | `id` | Condición exacta **(vigente)** | n |
|---|---|---|---|---|
| 1 | Generador Primario | `generador-primario` | `AST-PP ≥ 1,40` **y** `AST ≥ 2,5` **y** `MIN ≥ 20` | 8 (4%) |
| 2 | Finalizador Corto / Short Roll | `finalizador-corto` | `esInterior` **y** `PPT2 ≥ 1,10` | 15 (7%) |
| 3 | Ancla Defensiva | `ancla-defensiva` | `esInterior` **y** `reboteDefRel ≥ 1,15` **y** `reboteDefRel > reboteRel` | 2 (1%) |
| 4 | Rebotador de Impacto / Rim Runner | `rim-runner` | `esInterior` **y** `reboteRel ≥ 1,30` | 6 (3%) |
| 5 | Juego de Espaldas / Poste Bajo | `poste-bajo` | `esInterior` *(fallback interior)* | 16 (8%) |
| 6 | Spacing / Tirador de Descarga | `spacing` | `esPerimetral` **y** `PT3% ≥ 0,40` | 57 (27%) |
| 7 | Slasher / Penetrador | `slasher` | `esPerimetral` **y** `PPT2 ≥ 1,00` | 40 (19%) |
| 8 | Manejador Secundario | `manejador-secundario` | `AST-PP ≥ 1,00` **y** `MIN ≥ 20` | 5 (2%) |
| 9 | Perimetral de Media Distancia | `perimetral-media` | `esPerimetral` | 34 (16%) |
| 10 | Rol Complementario | `complementario` | *fallback* | 27 (13%) |

*En el relevamiento la cascada tenía 9 roles con `rim-runner` primero, y los
roles interiores 2 y 3 daban **cero**. Ver [P-1](#p-1-tres-roles-interiores-uno-solo-alcanzable)
y la [sección VI.0](#vi0--el-hallazgo-que-reordena-el-diagnóstico-original).*

---

### I.5 · Etiquetas de síntesis del Tab General

`jugadoresSintesisPerfil()` · `sgadd-jugadores.js:590-631`

Tres tarjetas Alto / Medio / Bajo, más el punto de fuga.

| Tarjeta | Métrica | Alto | Medio | Bajo |
|---|---|---|---|---|
| **Impacto colectivo** | PLAYS | `> 1,20 × prom` | `> prom` | resto |
| **Eficiencia individual** | eFG% | `> 1,15 × prom` | `≥ prom` | resto |
| **Conclusión táctica** | — | `Alta` si impacto o eficiencia son Alto; si no `Media` | | |

**Punto de fuga** (`jugadoresPuntoDeFuga`, `sgadd-jugadores.js:573-583`): el
percentil más bajo entre `eFG%`, `PePP%`, `RTL%`, `AST-PP` y `T1%`. Solo se
computan las métricas con percentil disponible, así que **un jugador no
calificado nunca tiene punto de fuga**.

La conclusión es la **condición de uso**, no una recomendación de continuidad:
el club es amateur y no gestiona pases.

---

### I.6 · Sensibilidad local / visitante

`SENSIBILIDAD_CONDICION` · `sgadd-jugadores.js:752-790`

Elige la métrica que más se aleja **de su propio umbral de ruido**, no la
diferencia absoluta más grande (3 puntos de PTS y 3pp de eFG% no son la misma
magnitud). Requiere ≥ 2 partidos de cada lado (`MIN_PJ_CONDICION`).

| Métrica | Umbral de ruido | Tipo | Etiqueta que produce |
|---|---|---|---|
| PTS | 2,0 | rendimiento | "Mejora de Local/Visitante en Puntos" |
| eFG% | 0,03 | rendimiento | "Mejora de Local/Visitante en eFG%" |
| AST-PP | 0,3 | rendimiento | "Mejora de Local/Visitante en AST-PP" |
| PLAYS | 2,0 | uso | "Más/Menos plays de local" |
| MIN | 2,0 | uso | "Más/Menos minutos de local" |
| USG% | 0,03 | uso | "Más/Menos uso de local" |

`peso = |diferencia| / umbral`; gana el mayor, y solo si `peso ≥ 1`. Sin
ninguna métrica relevante: *"Rendimiento estable"*.

Las de **uso** no llevan la palabra "mejora": cambia el rol, no la calidad.

---

### I.7 · Etiquetas de ranking (top 20 de la liga)

`JUGADORES_RANKINGS` · `sgadd-jugadores.js:65-90`

Ocho tablas. `orden` decide **quién entra** al top 20; las columnas se muestran
completas. El umbral de minutos es editable y arranca en `liga.minJugador`.

| Tabla | `orden` | Columnas |
|---|---|---|
| Participación y puntos | PTS | PJ, MIN, PTS, PLAYS, PPP, +/- |
| Eficiencia | eFG% | PJ, MIN, USG%, eFG%, TS%, RTL% |
| Tiro de campo | TCI | PJ, MIN, PTS, TC%, TCC, TCI |
| Tiro de 2 | T2I | MIN, PT2%, T2%, T2C, T2I, PPT2 |
| Tiro de 3 | T3I | MIN, PT3%, T3%, T3C, T3I, PPT3 |
| Tiros libres | T1I | MIN, PT1%, T1%, T1C, T1I, PPT1 |
| Rebotes | RO | MIN, RO, RD, RT |
| Creación y disciplina | AST-PP | MIN, AST-PP, AST%, FC, FR |

`+/-` figura como columna pero **nunca como `orden`**: depende de los otros
cuatro en cancha, así que ordenar por él daría un ranking del equipo disfrazado
de ranking de jugadores.

---

## II. Glosario de clasificación defensiva

Tres capas encadenadas: **banda z** (contexto) → **marca asignada** (qué
hacerle) → **perfil de defensor** (quién lo cubre).

### II.1 · Bandas z contra la liga

`BANDAS` · `sgadd-scouting.js:111-139`

Ninguna decisión táctica sale solo de un umbral absoluto. Primero se mide el
desvío contra la media de calificados de **esta** liga.

| Banda | `id` | z | Lectura |
|---|---|---|---|
| Muy por encima de la liga | `elite` | `z ≥ +1,2` | Amenaza clara |
| Por encima de la liga | `superior` | `+0,5 ≤ z < +1,2` | Atender |
| En el promedio de la liga | `estandar` | `−0,5 ≤ z < +0,5` | Neutro |
| Por debajo de la liga | `limitado` | `−1,2 ≤ z < −0,5` | Explotable |
| Muy por debajo de la liga | `fuga` | `z < −1,2` | Punto de fuga claro |

- Se usa **media/desvío y no percentil** porque las reglas están expresadas en
  sigmas y porque el percentil comprime los extremos (el 1° y el 3° de la liga
  pueden caer los dos en "percentil 95").
- En métricas invertidas (`PePP%`) el signo se da vuelta, para que `elite`
  signifique siempre lo mismo: mejor que la liga.
- Requiere ≥ 3 valores en la distribución y desvío ≠ 0; si no, devuelve `null`.

Bandas calculadas por jugador (`perfilJugador`, `sgadd-scouting.js:920-924`):
`PPT3`, `T3%`, `eFG%`, `PePP%` (invertida) y `T1%`.

### II.2 · Flags contextuales de tiro externo

El error táctico más caro es flotarle a un tirador eficiente. Tres flags
combinan **piso absoluto** (economía del básquet) con **banda contra la liga**
(contexto de la categoría):

```
tiraDeAfuera        = T3I ≥ 1,0
tiradorSistematico  = T3I ≥ 2,5

tiroExternoRentable = tiraDeAfuera Y ( PPT3 ≥ 1,05  O  T3% ≥ 0,35
                                       O  banda(PPT3) ∈ {elite, superior}
                                       O  banda(T3%)  ∈ {elite, superior} )

tiroExternoFrio     = NO rentable Y ( PPT3 < 0,88  O  T3% < 0,30
                                      O  banda(PPT3) ∈ {limitado, fuga}
                                      O  banda(T3%)  ∈ {limitado, fuga} )

cuotaTriplesEquipo  = T3I / Σ T3I del plantel
viaPrincipalExterna = cuotaTriplesEquipo ≥ 0,25
```

Asimetría deliberada: alcanza **cualquiera** de los dos criterios para tratarlo
como amenaza, pero hacen falta **los dos** para tratarlo como regalable.

### II.3 · Marca asignada — la cascada de 11 perfiles

`PERFILES_MARCA` · `sgadd-scouting.js:315-504`

**Cascada excluyente**, ordenada de la amenaza más cara a la más barata. Un
jugador puede disparar varias reglas de análisis, pero recibe **una sola** marca.

| # | Marca | `id` | Condición exacta | Defensor asignado | Frec. real (96 fichas) |
|---|---|---|---|---|---|
| 1 | Amenaza perimetral de élite | `tirador-elite` | `PT3% ≥ 0,40` **y** `PPT3 ≥ 1,20` | 🎯 Sniper Stopper | 3 (3%) |
| 2 | Tirador eficiente (poco volumen) | `tirador-eficiente-bajo-volumen` | `tiraDeAfuera` **y** `tiroExternoRentable` | 🎯 Denier | 15 (16%) |
| 3 | Tirador sistemático de bajo % | `tirador-sistematico-frio` | `tiradorSistematico` **y** `tiroExternoFrio` | 📏 Closeout Specialist | **38 (40%)** |
| 4 | Referencia interna | `interior-dominante` | `esInterior` **y** `PPT2 ≥ 1,10` | 🏢 Paint Pillar | 4 (4%) |
| 5 | Slasher / penetrador | `slasher` | `esPerimetral` **y** `PPT2 ≥ 1,10` | 🏃 Drive Containment | 3 (3%) |
| 6 | Conductor con pérdidas altas | `generador-riesgoso` | `perdidasRel ≥ 1,25` **y** `MIN ≥ 20` | ⚡ Ball-Screen Pest | 8 (8%) |
| 7 | Vulnerable en la línea | `castigable-en-la-linea` | `T1% < 0,40` **y** `PT2% ≥ 0,45` | 🧱 Interior Impact | 1 (1%) |
| 8 | Tirador de volumen sin renta | `tirador-ineficiente` | `PT3% ≥ 0,40` **y** `PPT3 ≤ 0,90` **y** `NO rentable` **y** `NO viaPrincipalExterna` | 📐 Target Defender | 1 (1%) |
| 9 | Volumen alto, eficiencia baja | `volumen-sin-eficiencia` | `concentración ≥ 0,20` **y** `NO rentable` **y** `banda(eFG%) ∈ {limitado, fuga}` | 📏 Volume Containment | **0** |
| 10 | Rebotador de impacto | `rebotador` | `reboteRel ≥ 1,20` | 🏰 Glass Cleaner | 13 (14%) |
| 11 | Rol complementario | `contencion` | *fallback* | 🧱 Switchable Forward | 10 (10%) |

#### Las tres reglas de tiro externo, en este orden y no en otro

1. **`tirador-eficiente-bajo-volumen`** (#2) va **arriba de todo lo interno y
   de todo lo de flotación**. Es el especialista que anota poco *por volumen,
   no por eficiencia*: con el criterio viejo, que miraba puntos, quedaba en el
   montón y se le soltaba. Restricción: `PROHIBIDO FLOTAR`.
2. **`tirador-sistematico-frio`** (#3): mucho volumen, poca renta. Se le
   contesta igual, pero sin desarmar la estructura.
3. **`tirador-ineficiente`** (#8) es la única que autoriza flotar, y tiene
   **tres condiciones acumuladas**. Si falla cualquiera, ya cayó en #2 o #3.

Hay un test que recorre el plantel entero y verifica que **a nadie con tiro
externo rentable se le sugiera flotar o ayudar desde él**.

#### Mandar a la línea es la excepción, no el plan

`castigable-en-la-linea` exige `T1% < 40%` **y** `PT2% ≥ 45%`. El criterio: a
alguien que convierte 60% de libres le estás regalando 1,20 puntos por
posesión, más de lo que vale una posesión promedio en estas ligas. Con los
datos reales califica **1 jugador de 96**, que es exactamente el punto.

#### Estructura de cada celda

`consigna` y `restriccion` son **objetos `{titulo, detalle}`**, generados como
funciones del perfil:

- `titulo` → directiva corta en MAYÚSCULAS (`TOP LOCK / OVER.`,
  `3/4 POR DELANTE / FRONT.`). Es lo único **editable** por el DT.
- `detalle` → justificación con el número que la disparó, en solo lectura.

Hay tests que exigen que los dos títulos estén en mayúsculas y que los dos
detalles citen al menos un dígito y nombren la métrica.

---

### II.4 · Catálogo de perfiles de defensor · 11 familias, 33 perfiles

`CATALOGO_DEFENSOR` · `sgadd-scouting.js:183-272`

Sugiere un **perfil táctico, no un nombre propio**: quién lo cubre depende de
quién esté en cancha y de las faltas de cada uno. El campo es editable.

| Familia | Perfiles | ¿Asignable por el motor? |
|---|---|---|
| 🛡 Especialista 1x1 | On-Ball Stopper · Shadow · Lockdown Defender | ✗ ✗ ✗ |
| ⚡ Presión Inicial | POA Defender · P&R Disruptor · **Ball-Screen Pest** | ✗ ✗ **✓** |
| 🏃 Perimetral Atlético | Wing Chaser · Transition Defender · **Drive Containment** | ✗ ✗ **✓** |
| 💪 Perimetral Físico | Perimeter Enforcer · Defensive Goon · Rebounding Guard | ✗ ✗ ✗ |
| 📏 Perimetral Largo | Length Defender · **Volume Containment** · **Closeout Specialist** | ✗ **✓** **✓** |
| 🎯 Especialista Perimetral | **Sniper Stopper** · **Denier** · Screen Navigator | **✓** **✓** ✗ |
| 🏢 Especialista Interior | Drop Protector · Classic Rim Protector · **Paint Pillar** | ✗ ✗ **✓** |
| 🏰 Referente de Zona | Primary Rim Protector · **Glass Cleaner** · Paint Dominator | ✗ **✓** ✗ |
| 🧱 Híbrido Físico | **Switchable Forward** · Low-Post Wall · **Interior Impact** | **✓** ✗ **✓** |
| 🦅 Perimetral Atlético · Ayudas | Free Safety · Vertical Rotator · Passing Lane Interceptor | ✗ ✗ ✗ |
| 📐 Contención Táctica | **Target Defender** · Read Specialist · Pace Controller | **✓** ✗ ✗ |

**11 de 33 perfiles (33%) son alcanzables por el motor** — uno por regla de
marca. Los otros 22 son referencia para el cuerpo técnico, que los usa al
editar el campo a mano. Con datos reales se asignaron **10 de esos 11**
(`Volume Containment` no se usó, porque su regla no se activó).

Hay dos familias de perimetral atlético (🏃 contención en la línea de pelota y
🦅 ayudas desde el lado débil) y **no se fusionaron**: son tareas distintas y
mezclarlas volvería a agrupar marcas que piden defensores diferentes.

Hay un test que verifica que las 11 marcas usen **11 perfiles distintos**.
Antes seis perfiles cargaban las once marcas y dos concentraban la mitad.

---

### II.5 · Fortalezas y fugas de la ficha individual

`fortalezasJugador()` · `sgadd-scouting.js:1007-1039`
`fugasJugador()` · `sgadd-scouting.js:1041-1067`

Bullets acumulativos (no excluyentes), cada uno métrica + lectura táctica.

#### Fortalezas — *por dónde nos daña*

| Bullet | Condición |
|---|---|
| Tirador de castigo | `PPT3 ≥ 1,20` **y** `PT3% ≥ 0,25` |
| Especialista de bajo volumen *(rama else)* | `tiroExternoRentable` **y** `tiraDeAfuera` |
| Finalizador cerca del aro | `PPT2 ≥ 1,10` (el texto cambia según `esInterior`) |
| Generador de ventaja | `AST-PP ≥ 1,40` |
| Segundas chances | `reboteRel ≥ 1,20` |
| El contacto le rinde | `T1% ≥ 0,75` **y** `PT1% ≥ 0,10` |
| Eje del ataque | `concentración ≥ 0,20` |
| *(fallback)* Sin fortaleza destacada | ninguna de las anteriores — **10 / 96** |

#### Fugas — *por dónde lo atacamos*

| Bullet | Condición |
|---|---|
| Su tiro preferido es el que menos rinde | `PPT3 ≤ 0,90` **y** `PT3% ≥ 0,30` |
| Pierde bajo presión | `perdidasRel ≥ 1,25` |
| La línea es su peor escenario | `T1% < 0,40` |
| Sin amenaza de triple | `esInterior` **y** `PT3% < 0,10` |
| La posesión muere en sus manos | `AST-PP < 0,80` |
| Volumen sin eficiencia | `eFG% < 0,45` |
| *(fallback)* Sin fisura clara | ninguna de las anteriores — **18 / 96** |

> La segunda rama de fortalezas (`else if`) existe para el especialista de
> pocos minutos: anota poco pero su tiro es caro. Sin ella quedaba invisible.

---

### II.6 · Claves estratégicas dinámicas

`REGLAS_CLAVE` · `sgadd-scouting.js:1188-1250`

Ocho reglas que corren contra el plantel del rival; solo aparecen las que los
datos activan. Cada una toma hasta 3 jugadores, ordenados por `MIN`.

| Icono | Clave | Condición |
|---|---|---|
| 📉 | Ejes de eficiencia | `concentración ≥ 0,20` |
| 🏹 | Clausura de tiradores | `PT3% ≥ 0,40` **y** `PPT3 ≥ 1,20` |
| 🎁 | Invitación selectiva al triple | `PT3% ≥ 0,40` **y** `PPT3 ≤ 0,90` **y** `MIN ≥ 20` |
| 🚫 | Disciplina de bonus | `PT1% ≥ 0,10` **y** `T1% ≥ 0,75` |
| 🎯 | Falta táctica rentable | `PT1% ≥ 0,10` **y** `T1% ≤ 0,60` |
| 🧤 | Presión a la conducción | `perdidasRel ≥ 1,25` **y** `MIN ≥ 20` |
| 🏰 | Control del cristal | `reboteRel ≥ 1,20` |
| 🛡 | Colapso de la pintura | `PPT2 ≥ 1,10` **y** `PT2% ≥ 0,40` |

**Pares deliberadamente opuestos** que nunca pueden apuntar al mismo jugador
(hay test que lo verifica):

- 🏹 *clausura* (`PPT3 ≥ 1,20`) ↔ 🎁 *invitación* (`PPT3 ≤ 0,90`)
- 🚫 *disciplina* (`T1% ≥ 0,75`) ↔ 🎯 *falta táctica* (`T1% ≤ 0,60`)

### II.7 · Semáforo del cuadro de jugadores clave

`COLS_JUGADOR` · `sgadd-scouting.js:833-845`

Top 3 **dentro del plantel rival**, no contra la liga. 1° verde (amenaza
principal), 2° naranja, 3° amarillo.

| Columna | Muestra | Rankea por | Por qué difieren |
|---|---|---|---|
| MIN, PLAYS, eFG% | su valor | sí mismo | — |
| PTS / PLAY | PTS (con PPP debajo) | `PTS` | la pregunta es quién anota; el PPP es contexto |
| %USO 3PTS | PT3% | **T3I** | 3 triples en el torneo dan 60% de uso y no es un tirador |
| %USO 2PTS | PT2% | **T2I** | ídem |
| %USO TL | PT1% | **T1I** | ídem |
| %TOV | PePP% | sí mismo (invertida) | marca a los que MÁS pierden: son a quienes presionar |

La fila de cierre *Prom. jugadores/equipo* se colorea contra la liga
respetando la dirección de la métrica: en `%TOV`, perder más sale en rojo.

---

## III. Matriz de combinación y ADN centralizado

### III.1 · El motor único

`jugadoresADN(idx, j)` · `sgadd-jugadores.js:547-559` es **la** función que
etiqueta a un jugador. Devuelve las cuatro taxonomías juntas:

```
jugadoresADN(idx, j)
├── perfil       ← jugadoresPerfilBase(idx, j)      ~40 métricas + relativos + origen
├── rolMinutos   ← jugadoresRolMinutos(perfil.min)  ¿cuánto juega?
├── jerarquia    ← jugadoresJerarquia(idx, j)       ¿cuánto pesa en el plantel?
├── arquetipos   ← jugadoresArquetipos(idx, j)      ¿qué sabe hacer?
└── rolFuncional ← jugadoresRolFuncional(perfil)    ¿qué función cumple?
```

### III.2 · Cómo lo consume Scouting

```
sgadd-scouting.js · perfilJugador(idx, j, totalPlays, totalTriples)
│
├─ 1. p = jugadoresPerfilBase(idx, j)        ← la base sale ENTERA de Jugadores
├─ 2. p.adn = jugadoresADN(idx, j)           ← las mismas etiquetas
├─ 3. p.concentracion   = PLAYS / Σ PLAYS del plantel     ┐ lo único que
│     p.cuotaTriplesEquipo = T3I / Σ T3I del plantel      ┘ Jugadores no puede saber
├─ 4. p.banda* = bandaLiga(...)              ← 5 bandas z contextuales
└─ 5. flags de tiro externo (rentable / frío / vía principal)
        ↓
   rolFuncional(p) → delega en jugadoresRolFuncional  (NO hay segunda cascada)
   marcaSugerida(p) → cascada PERFILES_MARCA          (solo vive acá)
   fortalezasJugador(p) / fugasJugador(p)
```

**La dependencia va en un solo sentido.** `sgadd-scouting.js` carga DESPUÉS de
`sgadd-jugadores.js` en el `index.html` y lee `JUGADORES_UMBRALES` y
`JUGADORES_ROLES_FUNCIONALES` por referencia (`COMPARTIDOS`,
`sgadd-scouting.js:43-46`), no los copia.

### III.3 · Qué vive dónde

| Concepto | Vive en | Lo lee Scouting | Lo lee Jugadores |
|---|---|---|---|
| Banda de minutos | `sgadd-jugadores.js` | ✓ (`priorizar`) | ✓ |
| Jerarquía | `sgadd-jugadores.js` | ✓ (badges) | ✓ |
| Arquetipos técnicos | `sgadd-jugadores.js` | ✓ (badges + origen) | ✓ |
| Rol funcional | `sgadd-jugadores.js` | ✓ (delegado) | ✓ |
| Umbrales del rol | `sgadd-jugadores.js` | ✓ (`COMPARTIDOS`) | ✓ |
| Bandas z | `sgadd-scouting.js` | ✓ | ✗ |
| Concentración de plays | `sgadd-scouting.js` | ✓ | ✗ |
| Marca asignada | `sgadd-scouting.js` | ✓ | ✗ |
| Perfiles de defensor | `sgadd-scouting.js` | ✓ | ✗ |
| Punto de fuga (percentil) | `sgadd-jugadores.js` | ✗ | ✓ |
| Split local/visitante | `sgadd-jugadores.js` | ✗ | ✓ |

### III.4 · El bug que este diseño cerró

El rol funcional vivía en `sgadd-scouting.js` y el resto en
`sgadd-jugadores.js`. El mismo jugador era *"Manejador Secundario / Defensor
Físico"* en el informe pre-partido y *"⭐ Jugador Franquicia / 🧤 Especialista
Defensivo / Dependencia Absoluta"* en su ficha. No eran datos contradictorios:
eran dos motores y dos recortes.

Hay tests que recorren el plantel entero y exigen **igualdad estricta** (`===`,
no tolerancia) de 19 métricas base, de los discriminantes de origen y del rol
entre Scouting y Jugadores.

### III.5 · Render de badges

`jugadoresBadges(adn)` · `sgadd-jugadores.js:562-569` arma las etiquetas cortas;
las dos vistas pintan literalmente el mismo texto.

| Tipo | Color | Origen |
|---|---|---|
| `jerarquia` | naranja (`text-accent`) | `adn.jerarquia.emoji + label` |
| `rol` | azul (`text-blue-400`) | `adn.rolFuncional.label` |
| `arquetipo` | verde (`text-green-400`) | `adn.arquetipos[].emoji + label` |

Renderers: `jugadoresBloqueADN()` (`sgadd-jugadores.js:1240`), cards del plantel
(`:1095`, recortado a 3), `scoutBadgesADN()` (`sgadd-scouting.js:1732`).

> **Ojo con el nombre.** `jugadoresADN()` es el motor; `jugadoresBloqueADN()` es
> el renderer. Se llamaban igual y colisionaban.

---

## IV. Mapa técnico de código

### IV.1 · `js/sgadd-jugadores.js` (1501 líneas)

| Líneas | Símbolo | Qué hace |
|---|---|---|
| 65-90 | `JUGADORES_RANKINGS` | 8 tablas de ranking |
| 92-100 | `jugadoresUmbralRanking()` | Umbral editable del top 20 |
| 102-173 | `jugadoresRanking()` | Selección (por `orden`) + orden dinámico |
| 207-211 | `jugadoresSlug()` | Clave = NOMBRE + EQUIPO |
| 227-236 | **`ROLES_MINUTOS`** | Las 4 bandas fijas |
| 240-250 | **`jugadoresRolMinutos()`** | Clasificación por MIN |
| 263-267 | `jugadoresPromedioMetrica()` | Promedio sobre calificados |
| 271-276 | `jugadoresRT()` | RT o RO+RD |
| 280-287 | `jugadoresPromediosLiga()` | PLAYS, eFG%, RT, PR |
| 291-323 | **`PERFILES_TECNICOS`** | Los 6 arquetipos |
| 326-331 | **`jugadoresArquetipos()`** | Filtro no excluyente |
| 335-361 | **`JERARQUIA`** | Los 4 niveles |
| 364-368 | **`jugadoresJerarquia()`** | Cascada excluyente |
| 392-405 | **`JUGADORES_UMBRALES`** | 9 umbrales compartidos |
| 408-460 | **`JUGADORES_ROLES_FUNCIONALES`** | Los 9 roles |
| 480-532 | **`jugadoresPerfilBase()`** | ~40 métricas + relativos + `esInterior`/`esPerimetral` |
| 516-530 | *(dentro)* | Discriminantes de origen + override por arquetipo |
| 535-540 | **`jugadoresRolFuncional()`** | Primera de la cascada |
| 547-559 | **`jugadoresADN()`** | **Punto de entrada único** |
| 562-569 | `jugadoresBadges()` | Etiquetas cortas |
| 573-583 | `jugadoresPuntoDeFuga()` | Peor percentil de 5 |
| 590-631 | `jugadoresSintesisPerfil()` | Impacto / eficiencia / conclusión |
| 634-637 | `jugadoresZScore()` | z contra el propio promedio |
| 716-720 | `CLAVES_CONDICION`, `MIN_PJ_CONDICION` | Split L/V |
| 723-750 | `jugadoresSplitCondicion()` | Promedios por condición |
| 752-762 | `SENSIBILIDAD_CONDICION` | 6 métricas con umbral de ruido |
| 764-790 | `jugadoresSensibilidadCondicion()` | Etiqueta de sensibilidad |
| 1073-1141 | `jugadoresPlantelEquipo()` | Cards con badges (UI) |
| 1174-1207 | `jugadoresHeader()` | Badge de rol + jerarquía (UI) |
| 1240-1260 | `jugadoresBloqueADN()` | Render del bloque ADN (UI) |
| 1352-1356 | `ZONAS_TIRO` | Triple / Doble / Libre |

### IV.2 · `js/sgadd-scouting.js` (2205 líneas)

| Líneas | Símbolo | Qué hace |
|---|---|---|
| 34-37 | `VENTANA_CICLO`, `TOP_JUGADORES`, `TOP_SEMAFORO` | 4 / 8 / 3 |
| 43-46 | **`COMPARTIDOS`** | Puente a `JUGADORES_UMBRALES` |
| 49-94 | **`U`** | Umbrales propios del plan individual |
| 111-117 | **`BANDAS`** | Las 5 bandas z |
| 120-126 | `statLiga()` | Media y desvío sobre calificados |
| 133-139 | **`bandaLiga()`** | Ubica un valor en su banda |
| 142-144 | `porEncima()`, `porDebajo()` | Predicados de banda |
| 163-167 | `rolesFuncionales()` | Re-export de la cascada |
| 183-272 | **`CATALOGO_DEFENSOR`** | 11 familias × 3 perfiles |
| 277-286 | `PERFILES_DEFENSOR` | Índice plano id → label |
| 289-295 | `familiaDefensor()` | Label → familia con emoji |
| 315-504 | **`PERFILES_MARCA`** | La cascada de 11 marcas |
| 833-845 | **`COLS_JUGADOR`** | 8 columnas + `rankPor` |
| 876-890 | `fichaJugadores()` | Resolución tardía del motor de Jugadores |
| 898-952 | **`perfilJugador()`** | Perfil base + concentración + bandas + flags |
| 957-961 | `rolFuncional()` | Delega en Jugadores |
| 971-997 | **`marcaSugerida()`** | Primera de la cascada + materialización |
| 1007-1039 | **`fortalezasJugador()`** | 7 bullets acumulativos |
| 1041-1067 | **`fugasJugador()`** | 6 bullets acumulativos |
| 1070-1079 | `fichaRival()` | Ficha completa de un jugador |
| 1086-1177 | **`jugadoresClave()`** | Tabla + semáforo top-3 + filas de cierre |
| 1188-1250 | **`REGLAS_CLAVE`** | Las 8 claves dinámicas |
| 1288-1305 | `clavesEstrategicas()` | Corre las reglas y filtra las activas |
| 1336-1450+ | **`resumenEjecutivo()`** | 6 tramos + extra de conducción |
| 1732-1742 | `scoutBadgesADN()` | Render de badges (UI) |

### IV.3 · `js/sgadd-core.js` — la infraestructura

| Líneas | Símbolo | Qué hace |
|---|---|---|
| 1219-1225 | `liga.minJugador`, `califica()` | Umbral de calificación |
| 1227-1233 | `liga.jugadoresCalificados` | Universo de referencia |
| 1314-1325 | `liga.distribucionesJ` | Distribuciones (mín. 3 valores) |
| ~1390-1400 | `leerJugador()` | Percentil solo si `__califica` |

---

## V. Diagnóstico de oportunidades y puntos ciegos

Ordenados por impacto sobre la lectura del informe.

### P-1 · Tres roles interiores, uno solo alcanzable

**Severidad: alta. — [RESUELTO en VI.0 / VI.2]** `finalizador-corto` y `ancla-defensiva` devolvieron **0 de
210** jugadores.

La causa es el orden de la cascada: los tres exigen `esInterior`, y
`rim-runner` (`reboteRel ≥ 1,20`) va primero. En la liga auditada los 13
jugadores marcados como `esInterior` califican todos en `rim-runner`, porque
`esInterior` **ya exige** `reboteRel ≥ 1,15` o `reboteDefRel ≥ 1,15`: el
discriminante de origen y el test del rol miden casi lo mismo.

**Consecuencia deportiva:** un cinco finalizador de pick&roll que no es
reboteador dominante, y un ancla defensiva que limpia el cristal defensivo pero
no el ofensivo, no tienen etiqueta propia. Los tres se leen igual.

**Vías de trabajo:** (a) subir `reboteOfensivoAlto` solo para `rim-runner`, de
modo que sea un techo y no un piso compartido con `esInterior`; (b) reordenar
poniendo `finalizador-corto` primero, que es el más específico de los tres;
(c) separar `esInterior` en dos flags — origen de tiro y peso en el cristal —
para que el rol no herede la condición de rebote.

### P-2 · 22 de 33 perfiles defensivos son inalcanzables

**Severidad: alta (de expectativa). — [RESUELTO en VII.3: 25 de 33 alcanzables]** El catálogo documenta 33 perfiles, pero
el motor solo puede asignar **11**: exactamente uno por regla de marca. Los
otros 22 existen como referencia para que el DT elija a mano.

No es un bug —la columna es editable a propósito— pero **la interfaz no lo
comunica**: quien ve las 11 familias asume que el sistema elige entre las 33.

**Vías de trabajo:** marcar visualmente en el catálogo cuáles son sugeribles;
o darle a cada regla de marca un conjunto de perfiles candidatos en vez de uno
fijo, y desempatar con una métrica secundaria (por ejemplo `PR` para elegir
entre `Denier` e `Interceptor`).

### P-3 · Una sola marca se lleva el 40% del plantel

**Severidad: media. — [RESUELTO en VII.2: 34% → 20%]** `tirador-sistematico-frio` cae sobre **38 de 96** fichas.
La causa es la definición de `tiroExternoFrio`, que es una **disyunción de
cuatro condiciones**: alcanza con estar por debajo en *cualquiera* de PPT3
absoluto, T3% absoluto, banda PPT3 o banda T3%.

En una liga amateur, donde el T3% mediano está bien por debajo del 30%, casi
cualquier jugador con 2,5 triples por partido cae ahí.

**Consecuencia:** el informe pierde poder discriminante — si a 4 de cada 10
rivales les hacés close-out corto, la consigna deja de ser una decisión.

**Vías de trabajo:** exigir conjunción en vez de disyunción para el caso frío
(piso absoluto **y** banda por debajo); o subir `volumenTripleSistematico` de
2,5 a un relativo contra la liga.

### P-4 · `volumen-sin-eficiencia` no se activa nunca

**Severidad: media. — [RESUELTO en VI.2, pero la causa NO era la que se supuso acá]** 0 de 96. La regla pide **tres** condiciones simultáneas:
`concentración ≥ 0,20`, `NO tiroExternoRentable` y banda de eFG% en
`limitado`/`fuga`.

El problema es la interacción: un jugador que concentra el 20% de los plays de
su equipo casi siempre tira lo suficiente de afuera como para que
`tiroExternoRentable` dé verdadero por alguna de sus cuatro vías. La regla
queda tapada por la #2 de la cascada.

**Vías de trabajo:** moverla arriba de las reglas de tiro (es una lectura de
volumen, no de tiro), o relajar la condición de `NO rentable` a "no es amenaza
de élite".

### P-5 · `buscadorContacto` no se activa nunca

**Severidad: baja. — [RESUELTO en VI.2]** 0 de 210. Pide `PT1% > 0,25` **y** `T1% > 0,80`. El primer
umbral es muy exigente: que un cuarto de los plays de un jugador terminen en la
línea es un perfil de NBA, no de liga amateur.

**Vía de trabajo:** bajar `PT1%` a ~0,15 o hacerlo relativo a la mediana de la
liga, que es la regla del proyecto para todo lo que depende de la categoría.

### P-6 · El fallback absorbe un tercio del universo

**Severidad: media. — [RESUELTO en VI.2]** `Rol Complementario` toma **69 de 210 (33%)** y
`Especialista de Rol` **155 de 210 (74%)**.

Detrás está el hueco de `origen`: **74 jugadores (35%) no son ni `esInterior`
ni `esPerimetral`**, porque su mezcla de triple cae en la zona muerta entre
0,12 y 0,30. Cuatro de los nueve roles funcionales exigen uno de esos dos
flags, así que esos 74 solo pueden alcanzar `generador-primario`,
`manejador-secundario` o el fallback.

**Vía de trabajo:** un tercer origen explícito (`esHibrido`, mezcla entre 0,12
y 0,30) con dos o tres roles propios — el ala que tira poco y rebotea poco es
un perfil real, no un residuo.

### P-7 · El umbral de calificación se aplica a la referencia pero no a la etiqueta

**Severidad: media, y es la más sutil.** Los promedios de liga
(`jugadoresPromediosLiga`) y las bandas z (`statLiga`) se calculan **solo sobre
los 97 calificados**, pero las etiquetas se asignan a **los 210**.

Un jugador de 6 minutos con `AST-PP` de 2,0 sobre una muestra de tres pases
recibe el arquetipo **🧠 Generador**, comparado contra una media construida con
jugadores que juegan tres veces más. Su ficha, en cambio, muestra los
percentiles en blanco porque no califica.

Esto es coherente con la regla del proyecto (mostrar el dato, quitarle
autoridad visual), pero produce una **asimetría no señalizada**: el badge se ve
igual de firme que el de un titular indiscutido.

**Vías de trabajo:** marcar visualmente los badges de no calificados (opacidad,
o el mismo `~` que ya usa el percentil); o exigir `__califica` en los
arquetipos que se comparan contra la liga, dejando libres los de umbral
absoluto.

### P-8 · `Rol Complementario` + `Rebotador de impacto` se contradicen

**Severidad: baja, pero visible en el informe.** Ocurre en **8 de 96** fichas.

`rebotador` (marca) solo pide `reboteRel ≥ 1,20`. `rim-runner` (rol) pide lo
mismo **más** `esInterior`. Un perimetral o un jugador de origen indefinido que
ataca el cristal recibe rol *"sin una función dominante que condicione el plan
defensivo"* y, tres columnas más allá, marca *"BOX-OUT DE CHOQUE"*.

El DT lee las dos cosas en la misma fila.

**Vía de trabajo:** agregar un rol funcional de rebote sin requisito de origen,
o condicionar el fallback a que no haya disparado ninguna marca fuerte.

### P-9 · Solapamiento de umbral entre `interior-dominante` y `slasher`

**Severidad: baja (contenida). — [RESUELTO en VI.2: sin zona gris, todo jugador con tiros tiene origen]** Las dos marcas usan el mismo `PPT2 ≥ 1,10` y
se separan **solo** por `esInterior` / `esPerimetral`.

Hoy funciona —0 contradicciones en 96 fichas— porque los dos flags son
mutuamente excluyentes por construcción. Pero deja fuera al 35% de origen
indefinido: un finalizador de 1,15 de PPT2 sin mezcla clara **no recibe
ninguna de las dos** y cae más abajo en la cascada.

### P-10 · Los fallbacks de fortalezas y fugas son frecuentes

**Severidad: baja. — [RESUELTO en VII.4: en Liga Argentina, 46% → 18% de fichas sin fisura]** *"Sin una fortaleza que se despegue"* aparece en **10 de
96** y *"Sin una fisura clara"* en **18 de 96**. Casi 1 de cada 5 fichas
individuales del informe no ofrece un punto de ataque.

Es honesto —mejor eso que inventar una debilidad— pero indica que los umbrales
de las fugas son absolutos y no contextuales: hay bandas z ya calculadas
(`bandaEfg`, `bandaTov`, `bandaT1`) que las reglas de fuga **no usan**, salvo
indirectamente.

**Vía de trabajo:** reescribir los bullets de fuga contra la banda z en vez de
contra el umbral fijo. La infraestructura ya está.

### P-11 · Métricas presentes en el perfil que ninguna etiqueta usa

**— [RESUELTO PARCIAL en VII.3/VII.4/VII.5: `PR`, `RTL%` y `FR` entraron a fortalezas, fugas, claves y desempaquetado de defensor. Siguen sin uso `TS%`, `RTL%` en marcas, `PPT1`, `T2%` y `T1I`.]**

`jugadoresPerfilBase()` calcula ~40 campos. **No participan de ninguna regla de
clasificación:** `ts` (TS%), `rtl` (RTL%), `usg` (USG%, salvo un chequeo de
existencia en fortalezas), `pptLibre` (PPT1), `t2` (T2%), `t1i`, `pr` (PR — solo
lo usa el arquetipo, no ninguna marca ni rol).

Oportunidad concreta: **`PR` no aparece en ninguna regla defensiva de scouting**,
aunque existe el arquetipo 🧤 Especialista Defensivo. Un rival con recuperos
altos condiciona nuestro manejo de pelota y hoy el informe no lo dice.

### P-12 · Rigidez de las bandas de minutos entre categorías

`ROLES_MINUTOS` es absoluto por pedido explícito del club, y está bien
documentado. El límite conocido: en una categoría formativa con partidos de
menos minutos, o con rotaciones muy amplias, la banda *Jugador Clave* (≥ 26)
puede quedar vacía y **el 100% del plantel caer en Rotación o Pocos Minutos**.

En la liga auditada no pasa (32 jugadores Clave), pero conviene tenerlo
presente al sumar categorías. No es una recomendación de cambio: es un límite
aceptado.

---

## VI. Reconfiguración aplicada · rangos recomendados y distribución final

Ejecutada el 2026-08-10 sobre la distribución real de la liga (210 jugadores,
97 calificados). Cierra **P-1, P-4, P-5, P-6 y P-9**.

### VI.0 · El hallazgo que reordena el diagnóstico original

Antes de tocar un solo umbral apareció esto:

> **La fila `JUGADOR TIPO` de la planilla es la mediana de TODOS los jugadores
> del libro, incluidos los que promedian 0 minutos.**

| Métrica | `JUGADOR TIPO` | Mediana de calificados | Factor |
|---|---|---|---|
| `RO%` | 0,0131 | 0,0216 | **1,66x** |
| `RD%` | 0,0485 | 0,0824 | **1,70x** |

Como los relativos de rebote se calculaban contra el TIPO, `reboteRel` valía
**1,66 de mediana** para un jugador de rotación normal. Un umbral escrito como
*"1,20x la liga"* lo pasaba el 65% del plantel; uno de *"1,15x"*, el 85%.

Eso hacía que `esInterior` fuera casi gratis en su parte de rebote y que
`rim-runner` —primero de los tres roles interiores— absorbiera al grupo
entero. **P-1 no era un problema de orden de cascada: era un problema de
referencia.** Se corrigió en `jugadoresReferenciasRebote()`, que compara
contra la mediana de los calificados —el mismo universo de los percentiles y
las bandas z— y se degrada al `JUGADOR TIPO` con menos de 3 calificados.

**Al leer los umbrales de rebote de acá en adelante, la mediana vale 1,00.**

### VI.1 · Bandas de minutos

| Banda | Antes | **Ahora** | Antes (n) | **Ahora (n)** |
|---|---|---|---|---|
| Jugador Clave | `≥ 26` | **`≥ 25`** | 32 | **34** |
| Jugador Importante | `23 – 25,9` | **`20 – 24,9`** | 14 | **33** |
| Jugador de Rotación | `13 – 22,9` | **`15 – 19,9`** | 60 | **31** |
| Pocos Minutos | `< 13` | **`< 15`** | 104 | **112** |

Distribución de `MIN` entre calificados: p25 19,4 · p50 22,7 · p75 27,9. Los
cortes viejos dejaban *Importante* en una franja de 3 minutos con 14 jugadores
en toda la liga, y metían 60 en una *Rotación* de 10 minutos de ancho. Los
nuevos parten los tres grupos activos en **34 / 33 / 31**.

El corte de 15 coincide con el umbral de calificación (15,37), así que **"Pocos
Minutos" pasa a significar exactamente "no llega a tener percentil"** — las dos
nociones dejan de contradecirse.

### VI.2 · Rangos recomendados por etiqueta

Horquilla de pertenencia y percentil de la liga real en el que cae cada corte.

#### Bandas de minutos *(absolutas, pedido del club)*

| Etiqueta | Mín | Máx | Percentil del corte |
|---|---|---|---|
| Jugador Clave | 25,0 | — | ~p63 de calificados |
| Jugador Importante | 20,0 | 24,9 | ~p29 |
| Jugador de Rotación | 15,0 | 19,9 | ~p0 (= umbral de calificación) |
| Pocos Minutos | — | 14,9 | debajo del umbral |

#### Arquetipos técnicos *(no excluyentes)*

| Arquetipo | Métricas | Mín exigido | Referencia | n |
|---|---|---|---|---|
| 🎯 Terminador de Élite | PLAYS · eFG% · PPP | `> prom` · `> 1,15×prom` · `> 1,05` | promedio calificados | 4 |
| 🧠 Generador | AST-PP | `> 1,40` | absoluta (≈p85) | 29 |
| 🏰 Puntal en la Pintura | RT | `> 1,20 × prom` | promedio calificados | 28 |
| 🎯 Amenaza Perimetral Real | T3I · T3% | `> 3,0` · `> 0,34` | absoluta (≈p50 / p77) | 11 |
| 🧤 Especialista Defensivo | PR | `> 1,30 × prom` | promedio calificados | 30 |
| 📏 **Buscador de Contacto** | **RTL% · FR · PT1% · T1%** | **`≥ 0,28` · `≥ 2,5` · `≥ 0,12` · `≥ 0,72`** | p72 / p68 / p65 / abs. | **12** *(era 0)* |

#### Roles funcionales *(cascada excluyente, el orden ES la regla)*

| # | Rol | Condición | Umbral | n |
|---|---|---|---|---|
| 1 | Generador Primario | AST-PP · AST · MIN | `≥ 1,40` · `≥ 2,5` · `≥ 20` | 8 |
| 2 | **Finalizador Corto / Short Roll** | interior · PPT2 | `≥ 1,10` (p75) | **15** *(era 0)* |
| 3 | **Ancla Defensiva** | interior · RD rel **y** RD rel > RO rel | `≥ 1,15` (p62) | **2** *(era 0)* |
| 4 | Rebotador de Impacto / Rim Runner | interior · RO rel | `≥ 1,30` (p68) | 6 *(era 13)* |
| 5 | **Juego de Espaldas / Poste Bajo** | interior *(fallback interior)* | — | **16** *(nuevo)* |
| 6 | Spacing / Tirador de Descarga | perimetral · PT3% | `≥ 0,40` | 57 |
| 7 | Slasher / Penetrador | perimetral · PPT2 | `≥ 1,00` | 40 |
| 8 | Manejador Secundario | AST-PP · MIN | `≥ 1,00` · `≥ 20` | 5 |
| 9 | Perimetral de Media Distancia | perimetral | — | 34 |
| 10 | Rol Complementario | *fallback* | — | 27 *(era 69)* |

#### Origen posicional *(tres tramos, sin zona gris)*

| Tramo de `T3I/(T3I+T2I)` | Resolución |
|---|---|
| `< 0,12` | interior sin discusión |
| `[0,12 ; 0,30)` | **desempate: RT rel `≥ 1,10` → interior, si no perimetral** |
| `≥ 0,30` | perimetral sin discusión |
| sin tiros de campo | **sin origen, a propósito: no se infiere** |

| | Antes | **Ahora** |
|---|---|---|
| Interiores | 13 | **39** |
| Perimetrales | 123 | **144** |
| Sin origen | 74 (35%) | **27 (13%)** |

#### Marcas defensivas

| Marca | Umbral clave | Antes (n) | **Ahora (n)** |
|---|---|---|---|
| tirador-elite | PT3% ≥ 0,40 · PPT3 ≥ 1,20 | 3 | 3 |
| **volumen-sin-eficiencia** | **concentración ≥ 0,15** *(era 0,20)* | **0** | **5** |
| tirador-eficiente-bajo-volumen | tiro externo rentable | 15 | 15 |
| tirador-sistematico-frio | T3I ≥ 2,5 · tiro frío | 38 (40%) | 33 (34%) |
| interior-dominante | interior · PPT2 ≥ 1,10 | 4 | 11 |
| slasher | perimetral · PPT2 ≥ 1,10 | 3 | 4 |
| generador-riesgoso | pérdidas ≥ 1,25x · MIN ≥ 20 | 8 | 5 |
| castigable-en-la-linea | T1% < 0,40 · PT2% ≥ 0,45 | 1 | 1 |
| tirador-ineficiente | 3 condiciones acumuladas | 1 | 1 |
| rebotador | RO rel ≥ 1,30 *(referencia corregida)* | 13 | 7 |
| contencion | *fallback* | 10 | 11 |

> **El bloqueo de `volumen-sin-eficiencia` no era el que suponía la auditoría.**
> La concentración es `PLAYS del jugador / Σ PLAYS del plantel COMPLETO`, y con
> planteles de 14 a 22 jugadores el techo medido fue **0,228** — en **10 de los
> 12 equipos el jugador más usado no llegaba a 0,20**. La regla no podía
> activarse jamás en la mayoría de los equipos. Se corrigieron las dos cosas:
> el umbral (a 0,15 ≈ p88) y el orden (subió al segundo lugar de la cascada).

### VI.3 · Distribución final y cobertura

| Indicador | Antes | **Ahora** |
|---|---|---|
| Roles funcionales con ≥ 1 caso | 7 / 9 | **10 / 10** |
| Arquetipos con ≥ 1 caso | 5 / 6 | **6 / 6** |
| Marcas con ≥ 1 caso | 10 / 11 | **11 / 11** |
| Perfiles de defensor asignados | 10 / 11 alcanzables | **11 / 11** |
| Fallback `Rol Complementario` | 69 (33%) | **27 (13%)** |
| Jugadores sin origen | 74 (35%) | **27 (13%)** |
| Jugadores sin ningún arquetipo | 140 (67%) | **135 (64%)** |
| Contradicciones rol interno ↔ marca externa | 0 | **0** |
| Flotación sugerida a un tirador rentable | 0 | **0** |
| Diagnóstico (errores / avisos) | 0 / 0 | **0 / 0** |

**Los 27 sin origen y los 27 del fallback son el mismo grupo**: los jugadores
que no registran un solo tiro de campo en todo el torneo. El fallback dejó de
significar *"no supe clasificarlo"* y pasa a significar *"no hay dato para
clasificarlo"*, que es una afirmación distinta y verdadera.

### VI.4 · Lo que quedó abierto, y por qué

**`Ancla Defensiva` con 2 casos.** Ya no está bloqueada por construcción
—antes era matemáticamente imposible— pero en esta liga los interiores que
rebotean en defensa casi siempre rebotean también en ataque, y entonces caen en
Finalizador o en Rim Runner. Los 2 que quedan (Ferraro Dieguez, Velazquez)
tienen `RD rel` de 2,35 y 2,31 contra `RO rel` de 2,01 y 2,24: el comparativo
funciona. Es un dato del torneo, no un defecto del motor.

**Los "sin fortaleza destacada" subieron de 10 a 20 sobre 96.** No es una
regresión: con la referencia inflada, el bullet de rebote se disparaba con casi
cualquiera, así que el informe le atribuía a 10 jugadores una fortaleza de
cristal **que no tenían**. Corregir la referencia elimina esos falsos
positivos. Sigue vigente el punto ciego P-10, que no estaba en el alcance.

**Un `Ancla Defensiva` puede recibir una marca de tirador.** Pasa en los 2
casos. No es contradicción: el rol describe **qué función cumple** (sostiene el
cristal) y la marca **cuál es su amenaza más cara** (tira 4 triples por
partido). Son las dos preguntas distintas que el diseño multi-taxonomía busca
separar. Antes no aparecía porque no había interiores en la zona gris.

**Puntos ciegos NO abordados en esta vuelta:** P-2 (22 de 33 perfiles
defensivos inalcanzables por el motor), P-3 (`tirador-sistematico-frio` sigue
en 34%), P-7 (etiquetas sin percentil para no calificados), P-8, P-10, P-11
(`PR` sin uso en scouting) y P-12.

---

## VII. Segunda auditoría · marcas, catálogo defensivo, fugas y claves

Ejecutada el 2026-08-10 sobre **dos ligas de nivel distinto**, que es lo que
permitió separar los umbrales que describen básquet de los que describían el
promedio de una liga.

| | Primera · La Plata | Conferencia Norte · Liga Argentina |
|---|---|---|
| Equipos | 12 | 17 |
| Jugadores | 210 | 260 |
| Calificados | 97 | 124 |
| Fichas de scouting | 96 | 136 |
| eFG% mediano | 0,469 | **0,530** |
| PPT3 mediano | 0,833 | **0,965** |
| PPT2 mediano | 0,974 | **1,076** |
| AST-PP mediano | 0,867 | **1,259** |
| %TOV mediano | 0,149 | **0,131** |
| Desvío de eFG% | 0,084 | **0,054** |

Mejor nivel y **menos dispersión**: en Liga Argentina los jugadores se parecen
más entre sí, así que cualquier umbral fijo corta la distribución en otro lado.

### VII.1 · Qué umbrales aguantan el cambio de categoría

Percentil en el que cae cada umbral absoluto, en cada liga:

| Umbral | Valor | La Plata | Liga Argentina | Brecha |
|---|---|---|---|---|
| `pptTripleElite` | 1,20 | p91 | p90 | **1** ✅ |
| `volumenTripleSistematico` | 2,5 | p32 | p31 | **1** ✅ |
| `t1Regalable` | 0,40 | p4 | p3 | **1** ✅ |
| `usoDobleInterno` | 0,45 | p61 | p60 | **1** ✅ |
| `t1Confiable` | 0,75 | p71 | p67 | 4 ✅ |
| `usoTripleAlto` | 0,40 | p70 | p65 | 5 ✅ |
| `usoLibreAlto` | 0,10 | p43 | p50 | 7 |
| `pptDobleAlto` | 1,10 | p70 | p61 | 9 |
| `t3Rentable` / `pptTripleRentable` | 0,35 / 1,05 | p80 | p68 | 12 |
| `minutosClave` | 20 | p31 | p13 | 18 ⚠ |
| `astPPGenerador` | 1,40 | p79 | p59 | **20** ⚠ |
| `t1Pobre` | 0,60 | p35 | p15 | **20** ⚠ |
| `pptTripleFrio` | 0,88 | p57 | p35 | **22** ⚠ |
| `t3Frio` | 0,30 | p58 | p35 | **23** ⚠ |
| `pptTriplePobre` | 0,90 | p61 | p35 | **26** ⚠ |

**La regla que sale de acá:** un umbral absoluto es legítimo cuando describe
**economía del básquet** (1,20 pts por triple intentado es caro en cualquier
lado; 40% en la línea es malo en cualquier lado) y esos caen en el mismo
percentil ±1 en las dos ligas. Cuando describe **"por debajo del promedio"**
disfrazado de constante, la brecha se dispara y la etiqueta significa cosas
distintas según la categoría.

### VII.2 · II.3 · Inconsistencias de la cascada de marcas

#### 1. El código contradecía su propio comentario

`perfilJugador()` venía documentando desde siempre:

> *"alcanza con cualquiera de los dos para tratarlo como amenaza, pero hacen
> falta los dos para tratarlo como regalable"*

…y `tiroExternoFrio` estaba implementado como **disyunción de cuatro
condiciones**: bastaba estar bajo en PPT3 absoluto **o** T3% absoluto **o**
banda PPT3 **o** banda T3%. Con el piso de 0,88 en el percentil 57 de La
Plata, `tirador-sistematico-frio` se llevaba el **34% de las fichas**.

**Corregido a conjunción**: piso absoluto **y** contexto de liga. El contexto
es *"no destaca en su liga"* (`!porEncima`) y no *"está en el fondo"*
(`porDebajo`) — con la versión dura la regla se apagaba al 2%, que es el mismo
defecto dado vuelta.

| | Antes | Ahora |
|---|---|---|
| La Plata | 33 fichas (34%) | **19 (20%)** |
| Liga Argentina | 12 (9%) | **5 (4%)** |

#### 2. La amenaza barata evaluaba antes que las caras

`tirador-sistematico-frio` es, por definición, una amenaza **barata**: el tipo
tira mucho y mal. Estaba en el puesto 4, arriba de `interior-dominante`,
`slasher` y `generador-riesgoso`.

Consecuencia medida: **9 slashers de La Plata y 4 de Liga Argentina** recibían
*"CLOSE-OUT CORTO / CONTESTAR SIN SALTAR"* cuando su daño real era la
penetración. Uno de ellos con **1,65 de PPT2 contra 0,51 de PPT3**: el informe
mandaba al defensor a preocuparse por el tiro que menos le rinde al rival.
Además **9 conductores** con pérdidas altas quedaban sin la consigna de trap.

**Orden nuevo** (de la amenaza más cara a la más barata):

```
1. tirador-elite                      ← amenaza externa cara
2. volumen-sin-eficiencia             ← decisión de plan sobre el eje
3. tirador-eficiente-bajo-volumen     ← amenaza externa cara escondida
4. interior-dominante                 ← amenaza interna cara
5. slasher                            ← penetración cara
6. generador-riesgoso                 ← conductor presionable
7. tirador-sistematico-frio           ← amenaza BARATA (bajó del 4)
8. castigable-en-la-linea
9. tirador-ineficiente
10. rebotador
11. contencion                        ← fallback
```

#### 3. El hueco del tirador de volumen medio

Un jugador que tira entre 1 y 2,5 triples por partido sin renta **no
alcanzaba ninguna de las tres reglas de tiro**: `tirador-eficiente` exige
rentabilidad, `sistematico-frio` exige ≥ 2,5 intentos y `tirador-ineficiente`
exige `PT3% ≥ 0,40`. Medido: **17 fichas en La Plata y 18 en Liga Argentina**
con su tiro sin mencionar en todo el informe.

No merece marca propia —su amenaza principal casi siempre es otra— así que se
resolvió donde corresponde: un flag `tiroExternoOcasionalFrio` que alimenta un
bullet de fuga y una clave estratégica nueva.

#### 4. Escenarios de choque probados

| Escenario | Resultado |
|---|---|
| **Perimetral robador** (`PR` en el top 20%) | 21 en La Plata, 28 en Liga Argentina. **`PR` no participaba de ninguna regla del informe.** Resuelto en VII.4 y VII.5. |
| **Tirador de volumen medio** | 17 / 18 fichas sin cobertura. Resuelto arriba. |
| **Interior de rol** (sin PPT2 alto ni rebote dominante) | 0 en La Plata, 3 en Liga Argentina. No es un hueco: las marcas anteriores los capturan. |

### VII.3 · II.4 · Desempaquetado del catálogo defensivo (P-2)

El catálogo documentaba **33 perfiles** pero el motor solo podía asignar
**11**: uno fijo por regla de marca. Los otros 22 quedaban de adorno y la UI
no lo comunicaba.

Cada marca declara ahora una **lista ordenada de candidatos**; gana el primero
cuyo `cuando(perfil)` da verdadero, y el último no lleva condición: es el
default. **La sugerencia automática nunca puede quedar vacía**, que es la
propiedad que había que conservar.

| Marca | Candidatos (en orden) | Discriminante |
|---|---|---|
| `tirador-elite` | Denier · Screen Navigator · **Sniper Stopper** | vía principal externa / volumen sistemático |
| `volumen-sin-eficiencia` | Length Defender · **Volume Containment** | uso externo alto |
| `tirador-eficiente-bajo-volumen` | Closeout · Sniper Stopper · **Denier** | volumen bajo / PPT3 por encima de la liga |
| `interior-dominante` | Primary Rim Protector · Drop Protector · **Paint Pillar** | PPT2 ≥ 1,30 / `RO%` y PPT2 por encima |
| `slasher` | POA Defender · Transition Defender · **Drive Containment** | AST-PP alto / **`PR` alto** |
| `generador-riesgoso` | P&R Disruptor · POA Defender · **Ball-Screen Pest** | AST-PP alto / +28 min |
| `tirador-sistematico-frio` | Volume Containment · Screen Navigator · **Closeout** | T3I ≥ 5 / uso externo alto |
| `castigable-en-la-linea` | Low-Post Wall · **Interior Impact** | es interior |
| `tirador-ineficiente` | Read Specialist · **Target Defender** | AST-PP alto (es pasador, no tirador) |
| `rebotador` | Rebounding Guard · Paint Dominator · **Glass Cleaner** | es perimetral / domina los dos cristales |
| `contencion` | Passing Lane Interceptor · Pace Controller · Free Safety · **Switchable** | **`PR` alto** / pocos minutos / `RO%` alto |

**Perfiles alcanzables: 11 → 25 de 33.** Usados con datos reales: **19** en La
Plata y **22** en Liga Argentina, sobre **9 y 10 familias** respectivamente.

Los discriminantes son métricas que ya estaban calculadas y que ninguna regla
usaba: elegir entre `Denier` e `Interceptor` es una pregunta sobre manos
activas (`PR`), y entre `Paint Pillar` y `Drop Protector`, una sobre dónde
defiende el aro (`RO%` + `PPT2`).

### VII.4 · II.5 · Fortalezas y fugas contra la liga (P-10)

El bloque de fugas se apagaba **justo donde más falta hace**:

| | La Plata | Liga Argentina |
|---|---|---|
| *"Sin una fisura clara"* — antes | 19% | **46%** |
| *"Sin una fisura clara"* — ahora | **17%** | **18%** |
| *"Sin fortaleza destacada"* — antes | 21% | 8% |
| *"Sin fortaleza destacada"* — ahora | **18%** | **8%** |

En una liga pareja y de mejor nivel casi nadie baja de `eFG% < 0,45` o de
`T1% < 0,40`, así que **casi la mitad de las fichas del informe no ofrecía un
punto de ataque**. Los bullets ahora preguntan *"¿está por debajo de SU
liga?"* y la respuesta viaja con el nivel de la categoría.

**Bullets reescritos con banda z:** eFG%, %TOV, T1%, AST-PP, PPT2.
**Bullets nuevos:** `PR` (fortaleza — líneas de pase), `RTL%` + `FR`
(fortaleza — ataca el contacto), PPT2 bajo en perimetral (fuga), tirador de
volumen medio sin renta (fuga).

**Lo que quedó absoluto a propósito:** `t1Regalable` (0,40) y `pptTripleElite`
(1,20), los dos verificados en el mismo percentil ±1 en las dos ligas.

Bandas agregadas al perfil: `bandaPptDoble`, `bandaAstPP`, `bandaPr`,
`bandaRtl`, `bandaFr`, `bandaRo`.

### VII.5 · II.6 · Claves estratégicas: de 8 a 10

| Icono | Clave nueva | Condición | Por qué faltaba |
|---|---|---|---|
| 🧲 | **Líneas de pase del rival** | `PR` por encima de la liga **y** MIN ≥ 20 | Ocho reglas y ninguna miraba las manos del rival. Un plantel que roba condiciona NUESTRO manejo, y eso se prepara antes del partido |
| 📐 | **Concesión perimetral selectiva** | `tiroExternoOcasionalFrio` **y** MIN ≥ 20 | El DT no tenía dónde leer cuál es el tiro que conviene conceder cuando hay que elegir |

Verificado que *concesión perimetral* y *clausura de tiradores* nunca apuntan
al mismo jugador: una es para volumen medio sin renta, la otra para volumen
alto y caro.

**No implementado:** alerta de tiradores en racha. Requiere leer
`liga.jugadorPartidos` desde el motor de scouting, que hoy trabaja solo con
promedios de temporada. Es una vuelta aparte.

### VII.6 · Resultado consolidado

| Indicador | La Plata antes | La Plata ahora | LA antes | LA ahora |
|---|---|---|---|---|
| Marca dominante | `frio` 34% | **`frio` 20%** | `eficiente` 29% | `eficiente` 29% |
| Marcas activas | 11/11 | 11/11 | 11/11 | 11/11 |
| Perfiles de defensor usados | 11 | **19** | 11 | **22** |
| Familias defensivas usadas | 7 | **9** | 7 | **10** |
| Slashers con marca de tirador | 9 | **0** | 4 | **0** |
| *Sin fisura clara* | 19% | **17%** | 46% | **18%** |
| *Sin fortaleza destacada* | 21% | **18%** | 8% | **8%** |
| Flotación a un tirador rentable | 0 | **0** | 0 | **0** |

---

## VIII. Plan defensivo colectivo · las marcas se conectan entre sí

Implementado el 2026-08-10. Es el cambio conceptual más grande del módulo
II.3: la tabla de marcas deja de ser un listado de fichas aisladas.

### VIII.1 · El problema

Cada celda decía **qué hacerle** a un jugador rival. Ninguna decía **de dónde
sale la ayuda** para hacerlo. Y una defensa no es la suma de once marcas
individuales: si a cuatro rivales les ponés *"doblar"*, te quedaste sin nadie
para doblar.

Con datos reales, el informe contra Atenas producía cuatro consignas de ayuda
sin designar una sola fuente, y dos tiradores rentables sin decir en ninguna
parte que su defensor no puede ser el que rota.

### VIII.2 · La arquitectura

`generarPlanDefensivoColectivo(filas, nuestroPlantel)` corre en una **segunda
pasada** dentro de `jugadoresClave()`. Hace falta que las once fichas estén
calculadas para saber quién es qué: recién con el mapa completo se pueden
escribir las conexiones.

```
1ª pasada  →  perfil + marca + fortalezas + fugas de cada jugador
                     ↓
              clasificarEcosistema(filas)
                     ↓
              ESCENARIOS.find(test)          ← el marco del cruce
                     ↓
2ª pasada  →  conexionColectiva(fila, plan)  ← se agrega al DETALLE
              elegirDefensorBalanceado(...)  ← reparte la carga
```

### VIII.3 · Los cuatro grupos y el orden de los vetos

| Grupo | Quién entra | Qué dice su celda |
|---|---|---|
| 🎯 **Focos** | marca `tirador-elite` / `interior-dominante` / `slasher`, o concentración ≥ 0,15, o jerarquía franquicia | *"la ayuda salta desde X"* |
| 🚫 **Intocables** | `tiroExternoRentable` | *"su defensor no participa de las ayudas: se queda"* |
| ↩ **Fuentes** | `tiroExternoFrio` u `ocasionalFrio`, o marca `tirador-ineficiente` / `volumen-sin-eficiencia` | *"es el lado desde donde mandar la ayuda y doblar a Y"* |
| 🏰 **Cristal** | `reboteRel ≥ 1,30` | *"su defensor NO rota: lo bloquea"* |

**El orden de cálculo ES la lógica del plan.** Los vetos, en orden de costo:

1. **Intocables** primero — soltar un tiro rentable es el error más caro del
   informe, así que pertenecer a este grupo veta todo lo demás.
2. **Focos** — el que exige doblaje no puede estar ayudando en otro lado.
3. **Cristal antes que fuentes** — no se le puede pedir al mismo defensor que
   sea el primero en rotar y que no abandone el box-out. Gana el rebote: la
   segunda chance anula todo el trabajo defensivo previo.
4. **Fuentes** — lo que queda.

Verificado sobre **29 planteles** de las dos ligas: **cero solapamientos**
entre fuentes e intocables, fuentes y focos, o fuentes y cristal.

**Un jugador puede ser foco Y intocable** —el tirador de élite— y ahí se lo
dobla *y* desde él no se sale nunca. La cascada da prioridad a foco pero
agrega la segunda mitad explícitamente: sin eso se comía justo la advertencia
más cara de olvidar. **Lo encontró un test**, no una lectura del código.

### VIII.4 · Los cinco escenarios

| Escenario | Se activa cuando | La Plata | Liga Argentina |
|---|---|---|---|
| `franquicia-solitaria` | un solo foco y hay fuente | 1 | 0 |
| `spacing-alto` | ≥ 3 tiradores rentables | 2 | **8** |
| `interior-y-frios` | foco interior + ≥ 2 fuentes | 2 | 3 |
| `sin-lado-barato` | hay foco y no hay fuente | 0 | 2 |
| `distribuido` | *fallback* | 7 | 4 |

Los cinco se activan con datos reales. Que `spacing-alto` domine en Liga
Argentina (8 de 17 planteles) y sea marginal en La Plata (2 de 12) es
exactamente lo que uno espera de la diferencia de nivel medida en la
[sección VII](#vii-segunda-auditoría--marcas-catálogo-defensivo-fugas-y-claves).

### VIII.5 · La regla de coherencia, y su única excepción

> **Si hay un foco, tiene que haber una fuente de ayuda designada.**

Un plan que manda a doblar sin decir desde dónde no es un plan. Si el rival no
tiene ningún lado barato, el escenario `sin-lado-barato` lo dice en vez de
inventar una ayuda que no existe.

**La excepción es `spacing-alto`**, y no es una concesión: con tres o más
tiradores rentables el plan **renuncia a ayudar a propósito** y pasa a 1x1, así
que la ausencia de fuente es la conclusión, no un agujero. Pedirle una fuente
sería contradecir su propia consigna.

El primer diseño marcaba esos 8 planteles de Liga Argentina como incoherentes.
Estaba mal el flag, no el plan.

### VIII.6 · Ejemplo generado · Reconquista vs Atenas

Escenario detectado: **Interior dominante con perímetro frío**.
*"La ayuda al poste bajo sale de los perimetrales fríos (AMAN, DEVECE), no del
lado de los tiradores."*

| Jugador | Grupo | Defensor sugerido | Conexión agregada a su celda |
|---|---|---|---|
| BORRAJO | 🎯 Foco | Drop Protector | consigna: *"La ayuda salta desde AMAN o DEVECE."* · restricción: *"Nunca desde SANCHEZ y LOPEZ: ese tiro es el más caro del cruce."* |
| SCHROEDER | 🎯 Foco | POA Defender | *"La ayuda salta desde AMAN o DEVECE."* |
| SANCHEZ | 🚫 Intocable | Sniper Stopper | consigna: *"Su defensor no participa de las ayudas sobre SCHROEDER: se queda."* · restricción: *"NO es la fuente de ayuda del plan: para eso está AMAN."* |
| LOPEZ | 🚫 Intocable | Screen Navigator | ídem |
| AMAN | ↩ Fuente | Volume Containment | consigna: *"Es el lado desde donde mandar la ayuda y doblar a SCHROEDER y BORRAJO."* |
| DEVECE | ↩ Fuente | Ball-Screen Pest | ídem |
| ERRA | 🏰 Cristal | Paint Dominator | *"Su defensor NO rota: lo bloquea y termina la posesión."* |
| QÜIN | 🏰 Cristal | Volume Containment | ídem |

Es el sistema interconectado del pedido: el foco sabe desde dónde recibe la
ayuda, la fuente sabe a quién va a doblar, y el tirador eficiente tiene
prohibido ser la fuente **con el nombre de quién sí lo es**.

### VIII.7 · Lo que NO se tocó

**El contrato de editabilidad.** La conexión se agrega **solo al `detalle`**,
nunca al `titulo`. Dos tests lo amarran: uno falla si un texto de conexión
aparece en un título, otro exige que los títulos sigan midiendo ≤ 60
caracteres — son para cantar en el vestuario, no para leer.

**La asignación automática nunca queda vacía.**
`elegirDefensorBalanceado()` reparte los perfiles (máximo 2 repeticiones por
tabla, porque sugerir cuatro *Sniper Stopper* le pide al DT cuatro defensores
del mismo tipo que probablemente no tiene), pero si no hay alternativa repite
antes que dejar la celda sin sugerencia.

**Nuestro plantel sigue sin quinteto inicial.** El plan dimensiona la carga
(`cargaEspecial`, `sobrecargado`) y sugiere PERFILES; los nombres los pone el
DT. La planilla no trae titulares y esa restricción se mantiene.

---

## Anexo A · Inventario numérico

| Familia de etiquetas | Cantidad | Excluyente | Referencia | Archivo |
|---|---|---|---|---|
| Bandas de minutos | 4 (+1 matiz) | Sí | Absoluta | jugadores |
| Jerarquía | 4 | Sí | Promedio liga | jugadores |
| Arquetipos técnicos | 6 | **No** | Promedio liga + absoluta | jugadores |
| Roles funcionales | **10** | Sí | Mediana de calificados + absoluta | jugadores |
| Niveles de síntesis | 3×3 | Sí | Promedio liga | jugadores |
| Sensibilidad L/V | 6 métricas → 3 salidas | Sí | Propio jugador | jugadores |
| Bandas z | 5 | Sí | Media/desvío liga | scouting |
| Marcas asignadas | 11 | Sí | Mixta | scouting |
| Perfiles de defensor (catálogo) | 33 en 11 familias | — | — | scouting |
| Perfiles de defensor (asignables) | **25** | Sí | candidatos con desempate | scouting |
| Bullets de fortaleza | 7 (+fallback) | **No** | Absoluta | scouting |
| Bullets de fuga | 6 (+fallback) | **No** | Absoluta | scouting |
| Claves estratégicas | **10** | **No** | Mixta | scouting |
| Tablas de ranking | 8 | — | Top 20 liga | jugadores |

**Total de etiquetas distintas que puede recibir un jugador: 57**
(4 bandas + 4 jerarquías + 6 arquetipos + 10 roles + 11 marcas + 11 perfiles de
defensor + 5 bandas z + 6 salidas de síntesis, menos solapamientos de conteo).

### Cobertura medida (Primera · Clausura 2026)

| Indicador | Relevamiento | **Tras VI** |
|---|---|---|
| Jugadores en la liga | 210 | 210 |
| Calificados (`MIN ≥ 15,37`) | 97 (46%) | 97 (46%) |
| Fichas de scouting evaluadas | 96 | 96 |
| Roles funcionales con ≥ 1 caso | 7 / 9 | **10 / 10** |
| Marcas con ≥ 1 caso | 10 / 11 | **11 / 11** |
| Arquetipos con ≥ 1 caso | 5 / 6 | **6 / 6** |
| Perfiles de defensor asignados | 10 / 33 | **19 / 33** *(25 alcanzables)* |
| Jugadores sin ningún arquetipo | 140 (67%) | **135 (64%)** |
| Jugadores sin origen definido | 74 (35%) | **27 (13%)** |
| Contradicciones rol interno ↔ marca externa | 0 | **0** |
| Bandas z nulas (sin muestra) | 0 | **0** |

---

## Anexo B · Métricas de la planilla usadas para clasificar

| Métrica | Hoja dueña | Dónde clasifica |
|---|---|---|
| `MIN` | PROMEDIOS J | Bandas de minutos, jerarquía, 3 roles, 3 claves, calificación |
| `PLAYS` | PROMEDIOS J | Jerarquía, terminador, impacto, concentración |
| `PTS` | PROMEDIOS J | Semáforo, resumen, sensibilidad L/V |
| `PPP` | PROMEDIOS J | Terminador de élite, resumen |
| `eFG%` | PROMEDIOS E | Terminador, eficiencia, banda z, `volumen-sin-eficiencia`, fuga |
| `TS%` | PROMEDIOS J | *(solo se muestra)* |
| `USG%` | PROMEDIOS J | Sensibilidad L/V, chequeo en fortalezas |
| `RTL%` | PROMEDIOS E | Punto de fuga, **Buscador de Contacto** |
| `PePP%` | PROMEDIOS J | Punto de fuga, banda z, `generador-riesgoso`, presión |
| `AST` | PROMEDIOS J | Generador Primario (volumen) |
| `AST-PP` | PROMEDIOS J | Generador, 2 roles, fortaleza, fuga, sensibilidad |
| `PR` | PROMEDIOS J | Especialista Defensivo **(y nada más)** |
| `RO` / `RO%` | PROMEDIOS E | Rim Runner, `rebotador`, cristal, `esInterior` |
| `RD` / `RD%` | PROMEDIOS J | Ancla Defensiva, `esInterior` |
| `RT` | derivada | Puntal en la Pintura |
| `T3I` / `T3%` | PROMEDIOS J | Amenaza Perimetral, mezcla, flags de tiro, semáforo |
| `PT3%` / `PPT3` | PROMEDIOS J | Spacing, 4 marcas, 2 claves, bandas |
| `T2I` / `T2%` | PROMEDIOS J | Mezcla de origen, semáforo |
| `PT2%` / `PPT2` | PROMEDIOS J | 4 roles, 3 marcas, pintura |
| `T1I` / `T1%` | PROMEDIOS J | Buscador de Contacto, línea, bonus, fuga |
| `PT1%` / `PPT1` | PROMEDIOS J | Buscador de Contacto, bonus, falta táctica |
| `FC` | PROMEDIOS J | *(solo ranking)* |
| `FR` | PROMEDIOS J | Ranking, **Buscador de Contacto** |
| `+/-` | PROMEDIOS J | *(solo se muestra — nunca clasifica, ver §I.7)* |

**No existen en la planilla** (y por eso ninguna etiqueta las usa): talla,
posición cargada a mano, quinteto inicial, tapas, minutos por cuarto, tipo de
tiro por zona de cancha.

---

## Validación

Suite completa corrida después de aplicar la reconfiguración de la sección VI:

| Archivo | Resultado |
|---|---|
| `test-core.js` | ✓ 170 |
| `test-logos.js` | ✓ 18 |
| `test-ligas.js` | ✓ 9 |
| `test-clubes.js` | ✓ 22 |
| `test-boot.js` | ✓ 16 |
| `test-jugadores.js` | ✓ 170 |
| `test-4factores.js` | ✓ 94 |
| `test-personalidad.js` | ✓ 20 |
| `test-informe.js` | ✓ 7 |
| `test-partido.js` | ✓ 22 |
| `test-scouting.js` | ✓ 300 |
| **Total** | **848 · 0 fallas** |
