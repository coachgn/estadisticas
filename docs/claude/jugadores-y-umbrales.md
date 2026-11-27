# Jugadores y umbrales

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

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

> **Desde 2026-09-12, con backend y sesión, TAMBIÉN en el servidor** —un
> hash de Upstash por club y categoría— y lo ve todo el cuerpo técnico del
> club. `localStorage` queda como copia local y respaldo sin red. Ver el
> punto 57.

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
   volvió a jugar en alguno de los últimos 4 partidos de su equipo —**con
   ese equipo y en un día posterior a la decisión**, punto 86—, el buzón
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

## 36. EL RESALTE DEL EQUIPO PROPIO NO VA EN EL RANKING DEL PLANTEL

Sirve para encontrar a los tuyos entre doce equipos rivales, que es lo que
hace el top 20 de la liga. Adentro de un plantel son **todos** del mismo
club: pintarlos a todos de naranja no distingue a nadie, y encima le compite
al único resalte que ahí sí informa — la columna por la que se está
ordenando.

Se decide por `r.ambito`, que ya viajaba en el resultado del motor.

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
afines    volumen comparable Y ≥ 60 % de coincidencia de etiquetas
primaria  solo la banda de minutos          (si los afines < 3)
global    mediana de los calificados        (si la primaria < 3)
tipo      la fila JUGADOR TIPO              (si no hay calificados)
```

> **El primer escalón era `exacto`** —misma banda de minutos y misma
> jerarquía— **y se reemplazó el 2026-09-12** por el de afines, a pedido del
> club: agrupaba a jugadores con la misma carga y funciones opuestas. Ver
> el punto 58.

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

- **Los CINCO absolutos no llevan `semillas` por nivel.** Si las tuvieran,
  alguien las movería y dejarían de ser absolutos sin que se note. Tres lo
  son porque su brecha medida es chica; `pptTripleRentable` y `t3Rentable`
  lo son por ECONOMÍA pese a su brecha de 19pp — ver el punto 64.
- **`JUGADORES_UMBRALES` es el CONTRATO con scouting.** Es su respaldo
  (`COMPARTIDOS`) cuando un perfil no trae mapa de nivel, así que una
  clave que se saca le apaga una regla en silencio. Pasó de catorce a diecisiete al
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

## 58. SIMILITUD MULTI-ETIQUETA · contra quién es justo comparar

El grupo de pares del punto 42 abría por `exacto`: misma banda de minutos y
misma jerarquía. El club trajo el caso que lo rompe, y **se midió igual en
el libro U23 real el mismo día**:

```
RAINERI, TADEO     Clave · ⭐ Franquicia · Generador + Especialista Defensivo
                   + Buscador de Contacto · Generador Primario (+ Slasher)
BENAVIDEZ, JULIAN  Clave · ⭐ Franquicia · Generador + Amenaza Perimetral
                   Real · Spacing / Tirador de Descarga
```

Mismo ADN, funciones opuestas: uno penetra buscando contacto y el otro tira
de descarga. Con `exacto` eran pares, y medir a uno contra la mediana del
otro no dice nada de ninguno.

### La taxonomía es la del DOCUMENTO

`AUDITORIA_ETIQUETAS_JUGADORES.md`, sección I, y **no se copia**: el motor
lee los mismos catálogos que etiquetan (I.2 `JERARQUIA`, I.3
`PERFILES_TECNICOS`, I.4 `JUGADORES_ROLES_FUNCIONALES`).
`test-similitud-etiquetas.js` **parsea el documento** —por columna, no por
posición— y falla si alguna de las cuatro listas deja de coincidir, o si la
jerarquía cambia de orden (la cercanía de dos escalones se mide por su
posición).

### El puntaje · `jugadoresSimilitud(adnA, adnB)`

```
1 · VOLUMEN (filtro duro)  misma banda de minutos o < 5 min de diferencia,
                           Y < 6 puntos de USG%
2 · ETIQUETAS              función en cancha 50 % · perfiles técnicos 30 %
                           · ADN (jerarquía) 20 %          piso: 60 %
```

- **Función**: 1 mismo rol · 0,6 si el rol de uno es la faceta
  SECUNDARIA del otro (punto 46) · 0,5 mismo eje · 0,25 mismo origen
  (los dos adentro o los dos afuera) · 0.
- **Perfiles**: intersección sobre unión de los arquetipos. Dos sin
  ninguno dan 1: coinciden en no destacar en un rasgo técnico.
- **ADN**: 1 la misma jerarquía · 0,5 la de al lado · 0.
- **El «o» de los minutos es por el borde**: 24,9 y 25,1 caen en bandas
  distintas y juegan lo mismo. **Sin USG% cargado no se filtra por uso**:
  un dato ausente no excluye a nadie.
- Devuelve el desglose, no solo el número: un «62 %» sin decir de dónde
  sale no se puede auditar.

**El caso de control da 40 %** (función 0,25 · perfiles 0,25 · ADN 1), con
volumen comparable —0,5 min y 0,8 pp de uso—: la separación la hacen las
etiquetas, no el filtro. Medido en el libro real: Raineri queda con 11
afines y Benavidez con 10, y ninguno está en el grupo del otro.

### El escalón `afines`

Reemplaza a `exacto` como primero de la cascada: los calificados con
volumen comparable y ≥ 60 %, con al menos 3. **Solo calificados**: las
etiquetas de uno que no llega al umbral van con `~` (punto 8) y no pueden
decidir contra quién se mide otro. El grupo trae el porcentaje de cada uno
(`similitudes`) y el motivo dice el criterio con su piso; sin 3 afines cae a
la banda de minutos y **lo dice**.

Medido con el motor final sobre los libros reales (los calificados que se
miden contra afines; el resto cae a la banda de minutos):

```
                     calificados   afines   primaria
Reconquista Primera      112       103 (92 %)     9
Reconquista U23          131       119 (91 %)    12
DEPORTIVO                113       106 (94 %)     7
Jujuy (la demo)          124       121 (98 %)     3
Reconquista U21           49        34 (69 %)    15   ← la muestra
```

`test-pares.js` cambió UNA expectativa y a propósito: en su fixture,
`CLAVE, TRES` tira 8 dobles y 1 triple —interior— entre tres perimetrales
de su banda y jerarquía. Antes era par; ahora no, con 50 %. Es el caso de
control en chico.

---

## 86. LA CAMPANA · AISLAMIENTO, «VOLVIÓ A JUGAR» Y EL PARPADEO (2026-10-05)

Auditoría del buzón (punto 13) por tres quejas: estados que se cruzaban
entre usuarios, «Volvió a jugar» que la planilla desmentía y el drawer
entero desapareciendo un instante con cada clic.

### 1 · Aislamiento: POR CLUB, no por usuario

El cuerpo técnico de un club **comparte** estados a propósito (punto 57);
lo que no puede pasar es que se crucen dos CLUBES, aunque jueguen la misma
zona. El endpoint de estados ya estaba bien (`sgadd:estados:<club>:<cat>`,
403 `OTRO_CLUB`). Los agujeros eran otros:

- **El caché de alertas del servidor iba por SLUG** (`claveCache: cat.slug`
  en `handlers.js`). Dos clubes con una «primera» compartían entrada: el
  segundo en cargar recibía durante el TTL las alertas —nombres y equipos—
  de la liga del primero. Ahora `clubId:slug`; hay test.
- **La vuelta del servidor solo miraba la categoría.** Si el admin cambiaba
  de cliente con una vuelta en el aire, el mapa del club A se fusionaba con
  el del B, se guardaba en su `localStorage` y la vuelta siguiente lo subía
  al servidor del B. Ahora se descarta si cambió el club, y `persistir()`
  escribe con el club DUEÑO del mapa (`estado.clubId`).
- Cambiar de club o de categoría limpia la búsqueda, el jugador elegido y
  la card abierta del drawer.

### 2 · «Volvió a jugar»: dos falsos positivos

1. **Partidos del RIVAL.** `jugadorPartidos` se indexa por el nombre solo y
   el `__id` de un partido es el mismo para los dos equipos. Sin filtrar por
   `__equipo`, el homónimo del rival que jugaba ese partido contaba como si
   fuera él — y el caso común: al que pasó de A a B, marcado BAJA en A como
   sugiere la alerta de traspaso, sus partidos con B **contra A** le
   encendían el reingreso en A. `jugadosConElEquipo()` filtra por equipo y
   lo usan reingreso **e inactividad** (que con un homónimo rival quedaba
   tapada).
2. **Partidos de ANTES de la decisión.** Miraba los últimos 4 del equipo
   sin importar cuándo se lo marcó: anotar SUSPENSO al que se lesionó ayer
   encendía «volvió» por las fechas previas. Y «Dejarlo como está» no callaba
   nunca la alerta, porque re-confirmar no cambiaba los partidos que miraba.
   Ahora cuentan solo los partidos de un **día posterior** al de la decisión
   (`diaDeLaDecision`: el día LOCAL de `actualizado`, no `desde`, que es UTC
   y a las 22 h ya es mañana). El mismo día no cuenta —la planilla no trae
   hora y lo normal es marcar después del partido—; un partido sin fecha
   tampoco. Registro sin ninguna fecha: el criterio de antes.

`test-estados.js` cambió expectativas **a propósito**: el bloque 5 bis
marcaba con la hora de hoy y esperaba la alerta por partidos de mayo, o sea
fijaba el falso positivo. Ahora marca el 08/05.

### 3 · El parpadeo: `panel()` se escribe UNA vez

El overlay y el aside llevan `buzon-fade` / `buzon-slide`, animaciones de
ENTRADA. `repintarPanel()` hacía `root.innerHTML = panel()` y cada gesto
—marcar desde una card, reactivar, la vuelta del servidor cada 30 s— las
volvía a correr: el drawer se iba y volvía. Ahora `panel()` es el cascarón
que arma `abrir()` y `repintarPanel()` reemplaza solo `contenido()` dentro
de `#buzonScroll` (más subtítulo y pie).

Y `resolver()` caía SIEMPRE al repintado: comparaba la lista pintada
(`#buzonLista`, solo las que piden decisión) contra `estado.alertas`, que
trae también los avisos — con un solo aviso en *En observación* nunca
coincidían. Compara contra `alertasQuePiden()`.

Las cards de *En observación* (`data-aviso`) y las filas de *Estados
confirmados* (`data-confirmado`) salen con el mismo colapso que las
alertas: `salirYRepintar()` → `quitarTarjeta()` y recién después el
repintado del contenido.

Medido en la demo (30 alertas + 3 avisos): resolver la cuarta con el scroll
en 600 deja **el mismo overlay, el mismo aside, el mismo `#buzonScroll` y
scroll 600**; la de abajo sube y el contador baja a 29. Marcar desde una
card de observación y reactivar desde confirmados: la card pasa por
`buzon-tarjeta-saliendo` y el overlay no se recrea.

---

## 130. UMBRALES POR COMPETENCIA, PERFIL POR TRAMO DEL RELOJ, TOP 3 DEL PLANTEL Y PDF DISCRETO (2026-10-19)

Assets en `?v=289`. Toca el panel y la ingesta.

### 1 · La competencia desde el primer partido (`js/sgadd-niveles.js`)

Decisión del club: **todo umbral relativo sale SOLO del percentil de la
competencia elegida, desde el primer partido**. `umbralVigente` ya no usa
la semilla por nivel, ni la mezcla, ni los topes (los tres venían de libros
de otras ligas). Revierte lo que los puntos 45 y 45 bis decían de `tier`,
`mezcla` y los clamps.

| origen | cuándo |
|---|---|
| `absoluto` | los cinco de economía del juego; no se mueven nunca |
| `vivo` | el percentil de ESTA competencia. Con menos de 40 partidos o 60 calificados va con `chica: true` |
| `sin-datos` | sin un solo valor de la métrica: `NaN`, y ninguna comparación dispara |
| `declarado` | `idx.liga.umbralesDeclarados`: SOLO fixtures de prueba (cinco jugadores no miden un p90). Nunca pisa un absoluto. Ningún índice de producción lo trae |
| `tier`, `mezcla` | ya no se producen; quedan para leer una vara vieja |

- **El `~` de la competencia chica**: `mapaVigente` cuelga `__chica` y
  `jugadoresBadges` marca TODAS las etiquetas con `~` y el motivo
  `JUGADORES_MOTIVO_COMPETENCIA_CHICA`, aunque el jugador califique.
- **Los tests no se recalibraron contra la vara viva**: las fixtures de
  scouting, jugadores, pares y similitud DECLARAN la vara con la que se
  escribieron (`mapaDe('LIGA_ARGENTINA')` / `mapaDe('LOCAL_MAYORES')`).
  `test-niveles.js` fija que la vara cambia al cambiar de competencia.
- El manual (sección 4) y una card nueva del Glosario («Umbrales de las
  etiquetas, por competencia») lo cuentan con los números del registro.

### 2 · El perfil táctico por tramo del reloj

**Ingesta** (`src/pbp/reloj.js`, 73 tests): `relojDePartido` emite
`eventos` —asistencia, rebote ofensivo y defensivo, recupero y tapón— con
la franja de la posesión a la que pertenecen (para el que defiende, el
reloj del RIVAL). Cada jugador suma `e[franja] = [ast, ro, rd, rec, tap]`
y `pj`. `baseLigaReloj` publica `cortes.tramos[franja]` con mín, P25, P50,
P75, P90 y máx de puntos por tiro, % de canastas asistidas, % de sus tiros
y, por partido, producción, rebotes, recuperos, tapones y pérdidas.

- **Los tapones**: de 991 en la Conferencia Norte, la mayoría viene SIN el
  tiro bloqueado en la lista. Se miden contra la posesión del rival que
  está corriendo: con eso entran 755.
- Paquetes regenerados en local (`salida/conferencia-norte/web`, el más
  pesado 195 KB contra el techo de 256). **No se subieron.**

**Panel** (`js/sgadd-pbp.js`): `relojTramosJugador` (PURA),
`relojTramosHtml` (card «Perfil táctico por tramo del reloj · 1x1 o 5x5»
en la pestaña Tiro, sub-card `tiro.reloj-tramos` del PDF) y
`relojTramosAdn` (chips en el ADN, debajo de Función en cancha, montados
por `espacioTramos`; una carga fallida no deja cartel).

| Tramo | Ataque | Defensa |
|---|---|---|
| 0-7 s | Ataque Rápido · Finalizador 1x1 / Generador 5x5 / Reboteador Ofensivo / Fuga por Pérdida | Transición Defensiva · Recuperador / Taponador / Reboteador Defensivo |
| 8-17 s | Set Ofensivo · Definidor 1x1 / Facilitador 5x5 / Reboteador Ofensivo / Fuga por Pérdida | Set Defensivo · ídem |
| 18-24 s | Clutch · Definidor 1x1 / Generador 5x5 / Reboteador Ofensivo | Clutch Defensivo · ídem |

- **Rol**: producción por partido (canastas + asistencias) en el P75 de la
  franja; 1x1 si finaliza más de lo que asiste, 5x5 si asiste más (empate,
  nada). **Resto**: P90 por partido. Todo pide 5 acciones y 3 partidos.
- **Semáforo** (`.tramo-verde/amarillo/rojo/neutro`, con variante de papel):
  su puntos por tiro en la franja contra P75/P25; sin 10 tiros ahí, o una
  etiqueta de defensa, neutro. Con menos de 20 jugadores con muestra, todo `~`.
- **«Clutch» es el final del RELOJ (18-24 s)**, no del partido: lo dice la nota.
- Medido sobre los 17 paquetes regenerados: 118 de 236 jugadores con alguna
  etiqueta; ningún HTML con `undefined` ni `NaN`.
- Un paquete sin `e` (todo lo subido hasta hoy) dice que llega con la
  próxima subida y no inventa nada.

### 3 · TOP 3 del PLANTEL (`js/sgadd-jugadores.js`)

Card arriba de «Plantel · <Equipo>», con un equipo elegido: los tres
primeros del plantel en cada dimensión de `JUGADORES_RANKINGS`, por el MISMO
`jugadoresRanking` (pool = plantel, sin piso de minutos). Columnas `#` ·
Jugador · PJ · MIN y las de referencia del grupo; una columna que el libro
no trae (el `+/-` viejo) se omite. Cada sub-card lleva
`data-subcard="plantel.top3-<id>"`, y el **Pack PLANTEL** suma en el paso 1
la sección «TOP 3 del plantel» (`SGADD_FICHA.estructuraPack`), que abre el
PDF. La ficha individual no la ofrece.

### 4 · El PDF, discreto (`js/sgadd-ui.js`, `index.html`)

- **Sin marca de agua**, en ninguna exportación (se fueron la clase y las
  dos reglas).
- **Encabezado**: solo el logo (16 px, `alt="MotorStats"`).
- **Pie**: logo · «Generado el DD/MM/AAAA» y los íconos de correo e
  Instagram, sin el texto del mail ni el arroba (van en su `title`). Siguen
  sin enlace en papel. El pie de PANTALLA (`pieWeb`) no cambió.

### Lo que NO se hizo

- **El modal modular de EQUIPOS** (pegado en el mismo mensaje) queda para
  una sesión aparte: no estaba pedido en el texto del mensaje.

### Para producción (lo corre el club)

1. Push del front (`?v=289`).
2. Subir los paquetes regenerados, en `motorstats-ingestion`:
   `node herramientas/subir-paquetes.js --confirmar` (regenera todo con las
   acciones por tramo). Hasta eso, la card por tramo dice que llega con la
   próxima subida.

---

## 139. EL SELECTOR DE MUESTRA EN EQUIPOS Y JUGADORES · FASES 1, 2 Y 3 (2026-10-23)

Equipos y Jugadores se pueden mirar sobre un recorte del tramo de la barra.
Assets en `?v=298`. `test-muestra.js` fija todo, sobre el snapshot de la demo
y con `sgadd-app.js` real en un `vm`.

```
js/sgadd-muestra.js    PURO: normalizar, ventana, recortar, etiqueta, comparar
SGADD_APP.idxVista()   el índice que muestran Equipos, Jugadores y sus PDF
SGADD_APP.barra({ muestra: 'equipos' | 'jugadores' })   la fila del selector y el badge
```

### Las opciones de la fase 1 · familia de CALENDARIO

Todo el tramo · Última semana / Últimas 2, 3, 4 semanas · Rango de fechas.
Cada equipo se mide contra la liga EN ESA MISMA VENTANA.

- **Semanas, no jornadas**: el libro no trae la jornada y el calendario del
  torneo tampoco (la LNB juega todos los días). En una liga semanal una
  semana es una fecha. La ventana se ancla al último día con partidos del
  tramo, no a hoy.
- **«Partido específico» no es una muestra** (punto 4): es el atajo «Ver un
  partido», que abre el detalle con sus desvíos contra la temporada.
- La familia 2 (últimos N propios, local/visitante, ganado/perdido, rival)
  y la vara de jugadores del servidor (opción A) son las fases 2 y 3.

### Cómo se recalcula

`SGADD_MUESTRA.recortar` deja solo `Base Datos E`, `Base Datos J` y
`4 FACTORES` de la ventana, y `construirIndice(…, TOTAL)` rearma todo:
métricas avanzadas, medianas, percentiles de la liga del período, ADN y
textos. **Las derivadas se descartan**: `ACUMULADO J` traería los totales de
la temporada. Una fila sin fecha se ubica por su PARTIDO solo si tiene una
sola noche (la regla del punto 90). Con la ventana cubriendo el tramo entero
el recorte reproduce `PROMEDIOS E` (hay test por equipo).

- **`estado.idx` no se toca**: Clasificación, el buzón, las alertas,
  Scouting y el Fixture siguen sobre el tramo entero.
- **Caché** por tramo y muestra; cambiar de libro o de tramo lo invalida.
  Medido en Boca: ~140 ms.
- **La muestra vive en `sessionStorage`, por planilla**, y no en la ruta
  (el hash es frágil, punto 16).
- **Los partidos sin estadísticas no se suman en una muestra**
  (`clasifFilasVigentes` con `idx.__muestra`): son de la temporada.
- **El detalle de un partido lee la temporada**, no el recorte.
- Una ventana sin partidos devuelve el tramo entero y el badge lo dice.

### «Propio» · contra su temporada

`idxVista()` envuelve `leer`, `leerVista` y `leerJugador` del recorte y le
cuelga a cada lectura `propio` (`SGADD_MUESTRA.comparar`): el dato en la
temporada, la diferencia y si estuvo arriba, en su media (menos de 2,5 %) o
abajo, en términos de rendimiento. `statCard` suma «▲ +2,3 vs su
temporada» y `metricTable` una columna «Temporada», **solo con la muestra
activa**: sin ella las dos salen como antes. En una descriptiva la flecha va
sin color.

**Lo que no lleva `propio`**: los números que una sección lee directo del
objeto del equipo (`e.promedios[…]`) y no por `leer()`. Salen del período,
sin la comparación.

### El log recortado del cliente

Un cliente recibe `Base Datos J` solo con su plantel (punto 19). Recalcular
jugadores dejaría la liga formada por los suyos. Con
`alcance.hojasRecortadas` incluyendo esa hoja, `idxVista({ jugadores: true })`
devuelve la temporada, el badge de Jugadores lo dice y la ficha en PDF no
declara una muestra que no aplicó. Equipos sí recorta (`Base Datos E` llega
completa). Se cierra con la fase 3.

### Lo que no se recorta, y lo dice el badge

Quintetos, Mapa de tiro y el reloj (vienen del paquete de la temporada) y la
tabla de posiciones. El informe de equipo y la ficha en PDF suman «Muestra:
…» a su encabezado.

### Verificado

Con el libro real de Boca (backend local, link de admin): «Últimas 2
semanas» = 23 de 33 partidos; Boca pasa de 4 a 3 PJ (0-3); PTS 86,0 contra
88,5 de su temporada, percentil contra los 18 equipos del período; Vildoza
8,3 contra 11,8. El rango, el atajo al partido y el caso recortado
(simulado) andan; a 375 px no hay desborde. **Con un link de cliente no se
pudo**: el club `boca` está `inactivo` en KV y la categoría sale bloqueada.
Al revés, cuatro mutaciones del test caen todas.

### FASE 2 · la familia del EQUIPO (assets en `?v=299`)

Sus últimos 4, 6 u 8 partidos (`MAX_ULTIMOS = 8`; arrancó en 3, 5 o 10) · Solo de local / de visitante · Solo
ganados / perdidos · Contra un rival (los que enfrentó el equipo que se
mira; sin equipo, todos). Es UNA muestra a la vez: no se combinan con las
de calendario.

**La vara es «la liga en esa misma condición»**: Boca de local contra cada
equipo jugando de local; Boca contra Argentino contra cómo le fue a cada
equipo contra Argentino (Argentino no está en esa vara: no se enfrenta a sí
mismo).

`SGADD_MUESTRA.recortarPorCondicion` decide fila por fila si un
equipo-partido CUMPLE para SU equipo (sus últimos N son los suyos, no los
mismos días para todos). Un partido entra si cumple algún lado:

- **el lado que no cumple entra RENOMBRADO** `CONTEXTO <nombre>`, porque
  RO%, DRTG y PACE necesitan al rival de esa noche;
- **`construirIndice(…, { conservar: Set })`** —opción nueva del núcleo,
  solo con el TOTAL— lo saca **antes** de la fila TIPO, las distribuciones
  y el plantel de la liga. `rivalDe` lee `filasPorId`, que ya lo tiene, así
  que los ratings siguen andando;
- las filas de JUGADOR del lado que no cumple se descartan.

**La prueba fuerte de `test-muestra.js`**: para cada equipo, el índice
compuesto da EXACTAMENTE lo mismo que un índice armado solo con sus
partidos en esa condición (PTS, eFG%, RO%, DRTG, PACE, NET).

- **Muestra chica**: con 1 a 3 partidos del equipo que se mira, el badge
  dice «⚠ Muestra chica · BOCA: 1 partido». Con 0 —el rival elegido, un
  equipo sin victorias— dice que su ficha sigue con el tramo entero, y
  Equipos y Jugadores la abren sobre `estado.idx` en vez de perderla.
- **«propio»** sigue siendo contra la temporada entera.
- El selector agrupa las dos familias (`<optgroup>`); con «Contra un
  rival…» aparece el desplegable del rival.
- Los PDF declaran «cada equipo medido en su propia condición».

**La trampa de siempre, otra vez**: la primera verificación en el
navegador salió con 31 «equipos» donde hay 18. El núcleo había cambiado y
`?v=298` era el mismo que ya había cargado la prueba de la Fase 1: el
navegador sirvió el `sgadd-core.js` viejo, sin `conservar`. Con `?v=299`,
18. **Cada entrega que toca un `.js` sube el `?v=`, aunque la anterior no
se haya publicado.**

Medido con el libro real de Boca (link de admin): de local 1 PJ (1-0),
96,0 PTS contra 88,5 de su temporada, percentil contra los 18 equipos de
local; de visitante 3 PJ (0-3), contra 13; contra Argentino 1 PJ (0-1),
contra los 4 que lo enfrentaron; sus últimos 3, 0-3. Recalcular cuesta
~350 ms. A 375 px no hay desborde. Cinco mutaciones del motor y del badge
hacen caer el test.

### FASE 3 · la vara de jugadores del período, en el SERVIDOR (assets en `?v=300`)

Opción A: el cliente que recibe `Base Datos J` recortada (punto 19)
ahora ve Jugadores sobre la muestra. Hasta acá veía la temporada.

```
GET /api/v1/vara-jugadores/:clubId?categoria=&torneo=&fase=&muestra=<json>   server/rutas/vara.js
SGADD_MUESTRA.varaJugadores(idx)   el resumen (servidor)
SGADD_MUESTRA.aplicarVara(idx, v)  su aplicación al índice del período (panel)
```

- **El servidor arma el período sobre el libro COMPLETO** con el mismo
  motor que el panel (`recortar` / `recortarPorCondicion` +
  `construirIndice`). `sgadd-muestra.js` se sumó a `compartido/`.
- **Viaja solo la vara**: la mediana de todos (la fila TIPO), el umbral de
  minutos y, por métrica de los calificados, n, media, desvío y 21 cortes
  (p0 a p100). Cada métrica se resume por separado: ningún nombre,
  ninguna fila, nada que rearme a un jugador. Las tres que cruzan dos
  métricas del mismo jugador van derivadas: `__RT`, `__MEZCLA` y
  `__RDROREL` (la vara de `ancla-defensiva`; usa `MEZCLA_PERIMETRAL`
  0,30, que un test ata a `mezclaTripleaPerimetral`).
- **No se entrega con menos de 3 partidos o 5 calificados**
  (`MUESTRA_CHICA`): con una noche, los cortes son su box score. Ahí
  Jugadores sigue con la temporada y la barra lo dice.
- **El panel la aplica sobre un índice PROPIO de Jugadores**
  (`_vista.idxJ`). El de Equipos y sus cachés no se tocan. Los jugadores
  propios siguen siendo sus filas reales; de la vara salen
  `distribucionesJ` (los cortes expandidos al n real, para que la
  «muestra» de los umbrales no mienta), `jugadorTipo`, `minJugador` y
  `__califica`.
- **Los consumidores que leían filas de la liga leen `idx.liga.vara`**:
  `jugadoresPromedioMetrica`, `jugadoresReferenciasRebote`,
  `jugadoresValoresDe` (umbrales vivos) y el grupo de pares, que pasa al
  nivel `servidor`: no hay afines sin rivales, y el `title` lo dice. El
  ranking de la liga queda con el plantel propio y lo avisa
  (`data-vara-ranking`).
- **Un pedido por período**, cacheado. Mientras viaja, Jugadores muestra
  la temporada. Un fallo se dice y se reintenta recién al minuto:
  reintentar en el repintado que dispara el propio fallo era un bucle.
- **Los PDF de jugadores declaran la muestra** solo con la vara aplicada.

**Medido con links de CLIENTE reales** (API local, KV y Google), todos con
el log recortado:

| Cliente | Liga | Muestras | Calificados | Tiempo |
|---|---|---|---|---|
| Deportivo | APdeB | últimas 2 semanas | 81 | 250 ms |
| Lanús | LNB | 2 semanas · de local · últimos 3 | 112 a 116 | ~220 ms |
| Jujuy | LAB Norte | última semana · de local | 71 y 48 | ~100 ms |
| Alem | Bahía Blanca | 2 semanas · ganados · contra un rival | 78 a 105 | 215 a 410 ms |

La vara pesa 9 a 11 KB. En la ficha, percentil y TIPO salen contra la liga
del período y «propio» contra su temporada. A 375 px no desborda. Con el
admin, siete categorías de cuatro ligas responden.

`test-muestra.js` (secciones 10 a 10 ter): los percentiles con la vara
coinciden ±5 con los de la liga completa; promedios, rebote y umbrales
coinciden con ella. Cinco reversiones hacen caer el test: la del piso de
partidos, solo sobre la copia de `compartido/`, que es la que carga el
endpoint.

**Para producción**: deploy del backend (la ruta nueva y
`compartido/sgadd-muestra.js`) y push del front (`?v=300`). Sin el backend
nuevo, el pedido falla y Jugadores dice que sigue con la temporada.

### Después de la fase 3 · quién ve el selector (v301)

- **El selector solo se ofrece a `boca`, `reconquista` y `deportivo`**:
  whitelist en `barraMuestra` de `js/sgadd-app.js`. Cualquier otro club ve
  Equipos y Jugadores sobre el tramo entero, sin la fila del selector.
  `test-muestra.js` usa `deportivo` en el harness y verifica que un club
  fuera de la lista no vea el selector.
- **Últimos 4, 6 u 8 partidos** (`MAX_ULTIMOS = 8`, en `js/sgadd-muestra.js`
  y en su copia de `server/lib/compartido/`: la vara del servidor rechaza
  un N mayor).
- Verificado con un token de cliente de Deportivo: últimas 2 semanas, 81
  calificados; de local, 114.

---

## 140. LA CARD DE RENDIMIENTO DEL JUGADOR · PRIMERA VERSIÓN (2026-10-23)

Pestaña **Rendimiento** en la ficha del jugador, entre Tiro y Evolución,
**solo con la capa `pbp`** (sin ella no aparece, ni gris:
`jugadoresTabsVisibles`). Es el «asistente hablándole al entrenador»: seis
bloques, cada frase con el número que la sostiene y, donde corresponde,
contra los cuartiles de la competencia. Assets en `?v=302`.

```
motorstats-ingestion/src/pbp/rendimiento.js   el motor que acumula la temporada por jugador
motorstats-ingestion/test/test-rendimiento.js 27 tests: secuencia a mano + invariantes de la liga real
js/sgadd-rendimiento.js                       analizar (PURO) y html; se monta por SGADD_PBP
test-rendimiento.js                           41 tests
```

### El dato viaja en el paquete de laboratorio

Dos campos OPCIONALES del paquete @3 (como `reloj`): `rendimiento.jugadores[id]`
y `liga.rendimiento` (p25 · p50 · p75 de ppt, volumen, RCA, valor por
asistencia, faltas que van a la línea, TCDP, 2das oportunidades y On/Off).
Las franjas del reloj (`reloj.jugadores`) y el clutch (`clutch.jugadores`)
ya viajaban: la card los cruza, no los repite. Suma ~6 KB por equipo; el
paquete más pesado de la Conferencia Norte queda en 194 KB (techo 256).
**Un paquete sin el campo** dice que la card llega con la próxima subida.

### Los seis bloques

| Bloque | Qué dice | De dónde |
|---|---|---|
| Veredicto | On/Off Net (Net ON − Net OFF por 100 posesiones), volumen contra eficiencia, su arma y su riesgo | segmentos y acciones validados |
| Espacio | distancia mediana, reparto pintura/media/triple, rango real del triple por banda, RCA, 2das oportunidades | `partido.tiros` + acciones |
| Reloj y clutch | participación y faceta dominante por franja (0-7 · 8-17 · 18-24 s, dicha también como reloj 24-17 · 16-7 · 6-0) y el cierre | `reloj`, `clutch` |
| Química | asistencias y puntos que valen, socio principal, quién lo habilita, qué tiro llega de un pase | díadas asistencia → canasta |
| Defensa | recuperos, tapones y rebote por partido, robos por franja del reloj rival, faltas de corte | acciones, `reloj.e` |
| Riesgo | faltas recibidas por tipo, pérdidas robadas / en ataque / castigadas a ≤ 7 s (TCDP), técnicas e IDE | jugadas crudas |

### Lo que hay que respetar al tocarlo

- **ON/OFF solo con la cancha validada** (`validacion.ok`) y solo en los
  partidos que jugó. Invariante en la ingesta: los minutos ON del plantel
  son 5 × el tiempo de juego y los puntos ON, 5 × los puntos del equipo.
- **Lo que el dato no trae no se inventa, y la card lo dice**: no hay
  hockey assists (el PBP no registra el pase previo), ni pérdida «de
  drible» o «de pase», y una falta con 2 libres con el rival en bonus se
  informa «de tiro o de penalización», sin elegir.
- **El color solo cuando se separa de la competencia** (cuarto alto o
  bajo), siempre con ▲/▼ (punto 14). Sin muestra, la tasa es `null` y no
  se compara.
- `tasas()` está en los dos lados (ingesta y panel); si cambia una, cambia
  la otra.
- **IDE** = % de sus errores (pérdidas y tiros errados) que NO terminaron
  en una falta suya a ≤ 5 s o en una técnica/antideportiva a ≤ 10 s.

### Medido

Conferencia Norte 25/26, 272 partidos: 10.290 de 10.348 faltas recibidas
clasificadas, 61 % de pérdidas robadas, TCDP mediano 26 %, On/Off de −7,0
a +5,6 entre p25 y p75. La card se renderizó para los 258 jugadores sin un
`NaN` ni un `undefined`. Vista previa en el panel con un recorte real:
seis bloques, sin errores de consola, sin desborde a 375 px.

### Pendiente

- **Regenerar y subir los paquetes** (`subir-paquetes.js --confirmar` en
  la ingesta): hasta entonces la pestaña muestra que la card llega con la
  próxima subida. Es una escritura de KV.
- **La card no entra al PDF de la ficha** todavía (`test-ficha-pdf.js` lo
  dice): no tiene `data-subcard`.
- No se probó con una sesión real con la capa: la vista previa usó la demo
  con `SGADD_PBP.activa` forzado y el paquete inyectado.

### Las faltas con el reglamento FIBA/CAB (2026-10-23, ingesta)

`rendimiento.js` suma `libroDeFaltas` (bonus de equipo: la 5.ª del cuarto penaliza, el suplementario cuenta como 4.º, suman las personales, las en ataque y las técnicas/antideportivas/descalificantes de JUGADOR, no las del banquillo; una técnica pegada a su falta en el mismo segundo no se cuenta dos veces) y los individuales (5 faltas, o descalificante, 2 técnicas, 2 antideportivas, 1+1). Viajan como `fi`, `bn` por jugador y `faltasEq` por equipo. El PBP no distingue técnicas Cat. 1/2 ni trae la falta disruptiva (la de corte `fc[4]` es lo más cercano, inferida). Los patrones (`perfilFaltas`: empuja al bonus, regala libres, se expone a la expulsión, administra su riesgo) salen de los cuartiles de la competencia (`tasas` suma faltasPJ, problemas, tempranoBonus, regaloBonus, expulsion, gestionQ4). Medido: 93 % de las faltas no ofensivas en bonus dan libres. Los paquetes con estos campos se subieron a KV el 2026-10-24. **El panel los dibuja desde la v303**: `sgadd-rendimiento.js` suma las seis tasas a su copia de `tasas()`, porta `perfilFaltas` (`PERFIL_FALTAS`) y agrega al bloque Riesgo las líneas de faltas del reglamento, bonus de equipo, gestión del 4.º cuarto, el resumen del equipo (`faltasEq`) y las etiquetas con ▲/▼. Con un paquete sin `fi`/`bn` la card queda como antes. `test-rendimiento.js` pasa a 52 tests.

### La card de Rendimiento, en Bento Grid (2026-10-26, v304)

`sgadd-rendimiento.js` ya no es una sábana de texto: cada uno de los seis bloques es una micro-card (`.rend-card`) con titular, **fichas numéricas con semáforo** (`.rend-ficha`), barras (`.rend-barra`: reparto de tiro, participación por franja del reloj) y la lectura completa **plegada** en «Lectura detallada». Arriba, los chips semáforo On/Off · Pts/tiro · RCA · TCDP · IDE (`analizar().semaforo`).

- **Semáforo contra los cuartiles de la competencia** (`tonoDe`): verde sobre su cuarto alto, ámbar en rango, rojo bajo el cuarto bajo, con la dirección de cada métrica (TCDP: menos es mejor). Nunca solo color: el markup lleva ▲ ● ▼ ◆. **RCA es azul informativo** (◆): no tiene lado bueno y malo (punto 4). IDE no tiene cortes en el paquete: solo se pinta rojo si hubo faltas por frustración.
- **Alertas visuales** (`.rend-alerta`): el termómetro del clutch (+/- ≥ 5 verde, ≤ −5 rojo, ámbar en medio) y, en Riesgo, el perfil de faltas («Regala libres de bonus», «Empuja al bonus»…), las expulsiones y las faltas por frustración.
- **Se sacó la autocrítica del motor** («el play-by-play no dice si fueron de drible o de pase», «no hay hockey assists», la nota de límites de las faltas). Las limitaciones quedan documentadas acá y en el punto 140, no en la card.
- El CSS va a mano en el `<style>` del `index.html` (nodos inyectados), con grilla de dos columnas solo `@media screen and (min-width: 768px)` y tonos oscuros en papel.

### Otros tres cambios de la v304

- **TOP 3 del PLANTEL arranca minimizada** en Jugadores: `<details class="hub-plegable">`, con el estado en `JUGADORES.top3Abierto` (no en el DOM: la grilla se repinta). El PDF y el Pack PLANTEL piden el bloque sin `{ plegable: true }` y lo reciben abierto.
- **Botón «volver arriba»** (`SGADD_UI.montarSubir`, `.subir-arriba`): flecha flotante que aparece tras 400 px de scroll, sube suave (sin animar con `prefers-reduced-motion`) y no se imprime. No se monta con un `document` de mentira.
- **Glosario**: RCA, TCDP e IDE entran por `EXTRAS` en `generar-glosario.js` (familia «K · Rendimiento (play-by-play)»), porque no están en el manual del motor.

### La card de TIRO del jugador, en Bento Grid (2026-10-26, v305)

La pestaña Tiro (`jugadoresTabTiro`) usa la MISMA vista que Rendimiento: `SGADD_RENDIMIENTO.vista` (`ficha`, `barra`, `alerta`, `chip`, `marca`), accesible como global en el navegador y por `require` en Node. **No hay una segunda definición del semáforo** (punto 8). Las clases `.rend-*` del `<style>` sirven a las dos cards.

- **Cabecera de chips**: eFG%, True Shooting, Puntos por play (semáforo por percentil contra la liga: verde desde 75, rojo hasta 25, `~` y sin color si no califica) y Triples intentados (azul informativo ◆: tirar más o menos no tiene lado bueno, punto 4).
- **Tarjetas de zona** (Triple · Doble · Tiro libre): fichas PPP / Conv% / C/I con semáforo y barra del peso en sus jugadas. Las marcas `data-subcard` del PDF a elección (`tiro.distribucion`, `tiro.carta`, `tiro.graficos`, y las del play-by-play) **no cambiaron**.
- **El mapa de tiro y sus conmutadores quedan intactos**, dentro de una micro-card. Con la capa `pbp`, el diagnóstico individual son cuatro tarjetas de alerta con icono (★ Picos · ↑ A explotar · ≈ Ajuste · ✕ Fuga), y las franjas del reloj (0-7 · 8-17 · 18-24 s) micro-tarjetas con puntos por tiro contra la liga (±0,06, con 10 tiros) y barra de volumen.
- La explicación metodológica va en «Lectura detallada» y se sacó la autocrítica del mapa («leelo como un registro, no como una tendencia»): la muestra chica es una alerta ámbar corta.
- **La pestaña Rendimiento sigue exclusiva de la capa `pbp`** (`jugadoresTabsVisibles`): sin ella no figura ni gris, y una ruta a `/rendimiento` cae a la primera visible.
- Tests: `test-rendimiento.js` (70) y `test-pbp.js`.

### La pestaña PARTIDOS del jugador, como log visual (2026-10-26, v306)

`jugadoresTabPartidos` (sgadd-jugadores.js) deja de ser una planilla: arriba, **Tendencias del historial** como fichas Bento (la MISMA `SGADD_RENDIMIENTO.vista`); después **cinco pills** (`Todos · 🔥 Élite · 🏠 Local · ✈️ Visitante · ⚠️ Noches bajas`, con su conteo) y la tabla con **micro-barras** en MIN y PTS.

- **Las tendencias se miden sobre los partidos JUGADOS** (≥ 8 min): una noche de 3 minutos hunde el promedio sin decir nada. Racha = últimos 5 contra su promedio; segunda mitad contra la primera; el cambio cuenta desde **medio desvío de SUS puntos** (`PARTIDOS_DESVIO_TENDENCIA`). Con menos de 6 jugados no se afirma una tendencia y lo dice (`corta`). Local contra visitante es **informativo** (◆): describe, no reprocha (punto 4). Suma «Élite / bajas» y «Mejor noche».
- **La micro-barra mide la noche contra el PROMEDIO del jugador** (ancho = valor / 2 × promedio; la marca del medio es el promedio). El número siempre va escrito: la barra ayuda, no reemplaza. En PTS toma verde/rojo con ▲/▼ cuando es atípica.
- **Las reglas validadas no cambiaron**: verde/rojo a más de 1,5 desvíos, atenuado con menos de 8 minutos, C/I y la fila que cruza al detalle en Equipos.
- **El filtro vive en `JUGADORES.partidosFiltro`** (no en el DOM: la ficha se repinta) y se resetea al cambiar de jugador. Las pills llevan `data-no-print`; con un filtro activo el PDF lo rotula.
- Funciones puras y testeadas: `jugadoresClasificarPartidos`, `jugadoresTendenciasPartidos`, `jugadoresPartidoCumple`, `jugadoresMicroBarra`.

### La fuga de Rendimiento sin pbp (2026-10-26, v306)

La pestaña seguía apareciendo en clientes sin la capa porque `SGADD_APP.estado.alcance` (de donde `SGADD_PBP.activa()` lee `capas`) **sobrevivía al cambio de categoría**: pasando de una con `pbp` a una sin ella —o si la carga nueva fallaba— quedaba el alcance viejo. Ahora `cambiarPlanilla` lo limpia, `cargar()` sella `alcancePlanilla`, y `activa()` exige que el alcance sea el de la categoría abierta. Tests en `test-rendimiento.js`.


## 162. RACHAS Y TENDENCIAS DE JUGADOR · 🔥 🧊 ⚓ (2026-10-31)

Assets en `?v=336`. Motor PURO `js/sgadd-rachas.js` (`test-rachas.js`, 25 tests, incluida la demo). Se muestra como chip chico en la ficha del jugador, en las cards del plantel (🔥/🧊, sin ⚓) y junto al nombre en Scouting. Manual: sección 6.

- **Medida**: eficiencia (TS%, eFG% si no hay libres) de los últimos 5 partidos jugados (≥ 8 min) contra SU base previa (≥ 3). Con menos de 8 jugados no se lee racha.
- **z = (media ventana − media base) / (σ/√n)**: el desvío del promedio de n partidos. 🔥 ≥ +1,5, 🧊 ≤ −1,5. **⚓ = ventana a ±0,5 σ por noche** de su media y ni racha ni bache; describe, no premia.
- **El σ es el de la competencia**: el mayor entre el propio y el p25 del σ de los jugadores del torneo (`sigmaLiga`, calculado del índice). Dos noches parecidas no dan σ≈0.
- **🔥 exige uso estable**: plays por 40 min de la ventana ≥ 95 % de su base y promedio ≥ 10 min. Si la eficiencia sube pero el uso cae, queda `descartada: 'uso'` (minutos de la basura) y no se marca.
- **Per 40** para el volumen (FIBA); **el rival pesa 0,8–1,2** por su % de victorias en la tabla.
- **Alerta de carga** (⚠ junto al 🔥): minutos de la ventana ≥ +20 % y +4 min sobre la base. Para el preparador físico.
- **🧊 de un tirador** (base ≥ 2,5 triples por partido) trae la causa: menos intentos por 40 (< 85 %), otra selección (≥ 8 pp de triples), rivales con buena defensa (percentil de eFG% permitido ≥ 66) o acierto. **El box score no trae la ubicación del tiro**: es una lectura por proxy y el tooltip no afirma un Deny.
- **Cortes por torneo**: `idx.liga.rachas = { z, ventana, ... }` pisa los de `UMBRALES`; lo que no se declara usa el respaldo. Todavía no hay UI para declararlo.
- Medido en la demo: de 175 jugadores evaluados, 6 🔥, 14 🧊 y 119 ⚓.
- **No verificado en el navegador ni en un PDF.**

---

## 182. LA VENTANA DE UNA CARD · Temporada · Últimos 4 · 6 · 10 (2026-11-25)

Assets en `?v=392`. Un selector ADENTRO de la card que cambia, no en la barra: el mapa ORTG vs DRTG de Principal, Rankings de la liga de Equipos, y Rankings de la liga y Ranking del plantel de Jugadores. Cambiar una card no mueve las demás ni `estado.muestra`.

- `SGADD_APP.idxUltimos(n)`: los últimos N de CADA equipo (`recortarPorCondicion` con `{ tipo: 'ultimos' }`, la familia 2 del punto 139) sobre el tramo de la barra, con el motor del TOTAL. Cacheado por índice base; null sin libro, en modo llave o sin partidos (la card queda en el tramo y lo dice). Lleva `__muestra`: no suma partidos manuales.
- `SGADD_UI.selectorVentana(actual, onClick, { deshabilitar })`: el control compartido.
- `MAX_ULTIMOS` pasó de 8 a 10 (y su copia en `compartido/`). La barra sigue ofreciendo 4, 6 y 8.
- **Mapa**: debajo, «Mejor ofensiva» (ORTG más alto) y «Mejor defensa» (DRTG más bajo) con escudo y el valor por 100 posesiones (`principalLideresOrtg`). Estado en `ORTG_VENTANA`.
- **Jugadores**: `JUGADORES.rankingVentana`, compartida por las dos tablas. El ranking de la LIGA no ofrece la ventana con `Base Datos J` recortada del cliente (punto 19): la liga quedaría formada por su plantel; el del plantel sí. Un plantel con menos de 4 jugadores en la ventana se queda en el tramo. El toggle de Totales no aparece en una ventana (no hay acumulado).
- Tests en `test-muestra.js` (v391). Verificado en la demo y a 375 px con Chrome sin ventana (sin desborde, botones de 44 px).
- **El botón activo NO lleva `text-base`**: en este proyecto es un color, pero Tailwind también lo lee como tamaño de letra (1rem) y le gana a `text-[11px]`. El color va inline.
- **La animación del mapa (v393)**: al cambiar de ventana NO se recrea el gráfico. `drawOrtgDrtgChart({ transicion: true })` actualiza la misma instancia y cada equipo se desliza de su lugar al nuevo (950 ms, easeInOutCubic); las líneas de media se deslizan con ellos (`chart.$ortg`) y el color de cuadrante se decide contra la media FINAL para que no titile. El punto i es siempre el mismo equipo: `chartData` va ordenado por nombre y, si los equipos no coinciden, se redibuja. El marco solo se agranda entre ventanas, así los ejes no saltan. Al crear el mapa, `animation: false` y un fundido del canvas: la animación por defecto de Chart.js hacía caer los equipos desde el borde. Con `prefers-reduced-motion`, sin animación. Fijado en `test-responsive.js`.
- **El mapa de tiro del jugador (v394)**: la card de Jugadores → Mapa de tiro trae su barra: Temporada · Últimos 4 · 6 · 10, Condición (local / visitante), Resultado (ganado / perdido) y Rival. Sale de `partidosPbp` (tirador por tiro, punto 165) con `SGADD_PBP.paqFiltrado` (PURA, misma forma que `tiros.detalle`, así `mapa()`, la capa de tiros y los mapas por franja no cambian) y `jugadorVista`. El paquete guarda los últimos 10 partidos del equipo: cualquier filtro mira esos y la card lo dice; «Temporada» sin filtros es el detalle de toda la temporada. Las ventanas cuentan partidos del EQUIPO y la línea dice en cuántos tiró. Con un filtro, el reloj y el perfil por tramo (de temporada) no se muestran. El filtro se guarda por jugador en el módulo; los conmutadores del mapa dibujan sobre el paquete filtrado (`activar` recibe ese). Sin tirador en los tiros (paquete viejo), no hay barra. Fichajes llama a `jugador()` sin barra. Tests en `test-pbp.js`.
