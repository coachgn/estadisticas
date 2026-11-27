# Scouting y simulador

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

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
   (POS, PACE, eFG%, ORTG/DRTG con su PPP, %REB OF/DEF, %AST) y selección
   de tiro/pérdidas (%USO 3PTS/2PTS/TL con su PPT, %TOV con su PP).
3. **Splits L/V y ciclo reciente** — últimos 4 partidos separados en
   ganados y perdidos, con puntos de fuga, valores de identidad y línea de
   tiro.
4. **Plan defensivo · marca asignada** — panel del plan COLECTIVO más la
   tabla de marcas conectadas entre sí (ver punto 9 ter). Perfil defensor,
   consigna y restricción sugeridas, **editables**: el plan lo firma el DT.
   Debajo del subtítulo va la **leyenda del criterio** (2026-09-20): explica
   en tres frases que la marca sale de cruzar por dónde ataca más el rival
   con por dónde hace más daño —volumen y eficiencia, dichas **sin nombrar
   una sola métrica** a pedido del club— y cierra diciendo que el dato
   sugiere y **el cuerpo técnico decide**. Va DENTRO de la card, así viaja
   al PDF: el informe se comparte, y quien lo abre sin haber estado en la
   charla tiene que poder entender de dónde sale cada marca. Hay tests que
   fijan las tres cosas, la última incluida.
5. **Resumen de criterio estratégico** — va inmediatamente debajo de la
   tabla de marcas, porque sintetiza justamente esa composición de marcas.
6. **Jugadores clave del rival** — tabla con mapa de calor del top 3 por
   métrica y filas de cierre (promedio del plantel y de la liga).
7. **Claves estratégicas y anticipación** — las 8 reglas dinámicas. Van
   ARRIBA del resto desde el 2026-09-12, a pedido del club (punto 59).
8. **Resto del plantel** — tabla compacta de los que no entran a la de
   arriba: muestra, vía de gol líder en promedio por partido y etiquetas;
   los de menos de 5 min por partido, solo por su nombre al pie. **Sin
   alertas ni badge de eficiencia**, a propósito. Punto 56.
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

**Excepción con el dato (punto 97, 2026-10-09).** Los libros que carga la
ingesta automática (hoy la LNB) traen la columna TITULAR de `Base Datos J`
—del box score oficial— y el play-by-play trae el quinteto que arrancó.
Con ESE dato, y solo con él, el panel muestra «Titular X/Y» (`torneoBadgeTitular`)
y los quintetos inicial / de cierre / clutch del post-partido. Todo lo que
el motor INFIERE (etiquetas, consignas, jerarquías, bandas de minutos,
roles, el manual) sigue sin poder decir «titular», y los tests que lo
recorren siguen igual. Un libro con Excel manual no tiene el dato y no
muestra nada.

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
| ↩ **Fuentes** | `tiroExternoFrio` u `ocasionalFrio`, o marca `tirador-ineficiente`/`volumen-sin-eficiencia`, y **nunca** un `generador-sin-tiro` ni un Jugador Franquicia | "es el lado desde donde mandar la ayuda y doblar a Y" |
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

### Perfil defensivo ideal y QUÉ BUSCAR · sin nombres propios (2026-09-18)

La columna se llama **Perfil defensivo ideal**: trae el arquetipo que
conviene contra ese rival, su familia, y debajo **«Qué buscar»** en el
defensor para cumplir la tarea. **No propone jugadores propios.** Qué jugador
del plantel reúne esos atributos lo decide el cuerpo técnico, y la nota de la
tabla y el `data-glosa` de la columna lo dicen con esas palabras.

**Hasta el 2026-09-18 proponía nombres** («De los nuestros: …», tres por
fila, con un filtro de biotipo y un ranking por tapas, recuperos, faltas,
rebote y minutos). Se sacó a pedido del club después de medirlo sobre los 272
cruces de la Conferencia Norte (la demo): **el 8,3 % de los primeros
sugeridos tenía el tamaño opuesto al atacante** (rebote relativo como
aproximación de tamaño), y el 7,4 % recibía una familia que contradecía al
filtro. La causa no era de calibración: **la planilla no trae altura ni
posición**, y el único rastro de biotipo es interior/perimetral, que sale de
CÓMO TIRA — un 4 abierto y un base son los dos «perimetrales». Un nombre
equivocado cuesta más que ninguno (la regla del dato inventado).

**Si algún día vuelven los nombres**, el camino no es mejorar la
aproximación sino tener el dato: que el club declare posición y talla de su
plantel (en KV, como los estados del punto 57). Está en el historial
(`candidatosPropios`, `señalesPlantel`, `compatiblePosicional`).

Lo que hay que respetar al tocarlo:

- **En la tabla de marcas, «Qué buscar» sale de la TAREA** (`guiaDeTarea`,
  ver la sección que sigue), no de la familia del catálogo: la familia
  describe un defensor genérico y la tarea lo que hay que hacerle a ESTE
  rival. `queBuscar(label)` sigue aceptando un perfil del catálogo —y ahí
  los atributos salen de sus pesos `defiende` (`atributosDefensor`, piso
  0,4, hasta cuatro)— y además una etiqueta de tarea, que devuelve su guía.
- **El signo cambia la frase** (`ATRIBUTOS_SEÑAL`): las faltas con peso
  positivo son «contacto físico legal», con peso negativo «bajo promedio de
  faltas». Toda señal de los pesos tiene su frase; un test lo exige.
- **Ninguna frase lleva coma ni «y» adentro**: se enumeran con
  `enumerar()` y una coma interna parte la lista en dos. Hay test.
- **`queBuscar(label)` devuelve `null` para un perfil fuera del
  catálogo**: si el DT escribió otra cosa no se inventa una guía.
- **`plantelDefensor` excluye a los dados de BAJA**, con la MISMA función
  (`enPlan`) que `plantelOrdenado`. Con dos criterios, un jugador dado de
  baja salía del plan del rival pero seguía contando como defensor
  disponible (el plan colectivo dimensiona con ese plantel).

### LA TAREA DEFENSIVA · una matriz, no una lista por marca (2026-09-18)

Hasta acá cada marca declaraba su lista de `defensores` y el primero cuyo
`cuando(perfil)` calzaba ganaba. El caso que lo rompió es real:
**RONDINONE, NICOLAS** (HOGAR SOCIAL · DEPORTIVO Primera · TOTAL): Referente
Ofensivo, Generador + Buscador de Contacto, rol Generador Primario, 3,76
triples por partido al **21,9 %** (0,66 PPT3) y 1,24 AST-PP.

```
antes   tirador-sistematico-frio · 📏 Closeout Specialist (Perimetral Largo)
        «Llegada rápida al tirador…» + «Timing para tapar»
ahora   generador-sin-tiro · «UNDER EN EL P&R / CONTENER LA PENETRACIÓN.»
        · «DOBLAR EL PICK & ROLL, NO EL TIRO.» (mano arriba, sin saltar)
        tarea Contenedor del Pick & Roll / Under · ⚡ Presión Inicial
```

Dos defectos a la vez: **un biotipo inferido del volumen de triples** (la
planilla no trae talla: «Perimetral Largo» salía de CÓMO TIRA) y **un cierre
agresivo contra un tiro que no castiga**, que era justo lo que su propia
consigna («puntear por volumen, no por peligro») decía no hacer.

**La celda es ahora una TAREA** (`TAREAS_DEFENSIVAS`, doce), y se decide con
`tareaDefensiva(perfil, marcaId)`: fila = la marca (`MATRIZ_TAREAS`), columnas
= las cuatro dimensiones de `lecturaMultivariable(p)` — ADN (jerarquía),
perfil técnico (arquetipos), función en cancha (rol funcional) y **eficiencia
contra volumen** del tiro y del uso. El `title` de la celda trae ese «por
qué» (`textoLectura`). Debajo va el perfil del catálogo que la representa
(`perfilCatalogo`, elegido entre los candidatos de la TAREA) con su familia,
y «Qué buscar» sale de la tarea (`guiaDeTarea`).

Las doce tareas: cierre/negación, perseguidor de cortinas, flotador/ayudador,
contenedor del P&R (under), presión a la bola, contención de penetración,
1x1 anulador, largo/molesto, físico/rebotero, protector de pintura, impacto
en la línea y lector de rotaciones.

Lo que hay que respetar al tocarlo:

- **El biotipo SOLO sale de un dato escrito** (`biotipoExplicito`: `TALLA`/
  `ALTURA` en m o cm, `PUESTO`). La única tarea de biotipo
  (`largoMolesto`) sin ese dato cae a `unoContraUno`, y ninguna tarea elige
  de `FAMILIAS_BIOTIPO` por el volumen de triples. Hoy la planilla no trae
  talla, así que en producción no se asigna ninguna de biotipo — a propósito.
- **Lo agresivo se reserva para el tiro que CASTIGA _y es su vía más
  cara_.** Las tareas marcadas `agresivo` (cierre/negación, perseguidor)
  sin `tiroExternoRentable` caen a `flotadorAyudador`, y si el tiro paga
  pero su penetración paga MÁS caen a `contencionPenetracion` (punto 64). Hay un test que recorre las fichas y falla si «llegada
  rápida», «salto a tapar», «timing para tapar» o «cierre agresivo»
  aparecen contra un tirador sin renta.
- **`generador-sin-tiro` es la marca nueva** (segunda de la cascada, ahora
  son doce): generador (rol generador-primario, o arquetipo generador con
  jerarquía franquicia/referente) sin tiro externo rentable — desde la
  unificación de umbrales, SIN exigir además que su tiro sea frío. **Es FOCO** del
  plan colectivo: tiene la pelota, no puede ser el lado desde donde sale la
  ayuda.
- **`tirador-sistematico-frio` pasó a «PASO ATRÁS / CONTESTAR SIN SALTAR.»**
  con «NO VOLAR AL CIERRE.»: mano arriba por volumen, y su defensor
  prioriza las ayudas.
- **El reparto de carga** (tope 2 por tabla) se hace sobre el
  `perfilCatalogo`, no sobre la tarea: dos rivales pueden pedir la misma
  tarea —flotarle a dos tiradores fríos es lo correcto— pero no cuatro
  defensores del mismo tipo.
- **Cada tarea termina en un candidato sin condición**: la sugerencia nunca
  queda vacía. Las tareas declaran 26 perfiles de los 33; sin talla
  declarada se alcanzan 25 (el de `largoMolesto` necesita el dato).
- **`TAREAS_POSIBLES` declara qué tareas puede dar cada marca** — las filas
  de `MATRIZ_TAREAS` son funciones y el manual no las puede listar. Un test
  barre la matriz con todas las combinaciones de las cuatro lecturas y falla
  si una fila devuelve una tarea que no declaró.
- **Un `generador-sin-tiro` NUNCA es fuente de ayuda**, aunque quede fuera
  del tope de focos (`MAX_FOCOS` = 2): su defensor está en la cobertura del
  pick & roll y no puede ser el primero en rotar. Sin el veto, con el tope
  lleno, el que conduce caía en fuentes por su tiro frío — medido: 7 de 15
  en el libro de DEPORTIVO. Un tirador frío que no es foco, cristal ni
  intocable sí es fuente: 12 de los 19 `tirador-sistematico-frio` del
  mismo libro (los otros son foco por concentración o cristal por rebote).
  **El Jugador Franquicia tiene el mismo veto**: la jerarquía lo hace
  candidato a foco, y si el tope lo deja afuera no pasa a ser el lado
  barato del rival (1 de 16 franquicias del libro caía ahí).
- **Dónde entra la JERARQUÍA** (Franquicia · Segunda Espada · Pieza de
  Rotación Alta · Especialista de Rol): define si alguien es generador
  (`esGenerador`: rol Generador Primario, o arquetipo Generador siendo
  Franquicia o Segunda Espada), el volumen de uso de la lectura, la rama
  de `contencion`, el perfil del catálogo (Franquicia → On-Ball Stopper o
  Lockdown) y los focos del plan (solo Franquicia). **No reordena la
  cascada**: la marca sale de la amenaza más cara, y un Especialista con
  PPT3 de élite se cierra igual que una estrella.
- **Es una marca NUEVA, la duodécima**, no reemplaza a ninguna de las once
  originales. El manual de etiquetado se genera desde el código y ya dice
  «cascada de 12», con su corte y la tabla de las doce tareas.

Medido sobre las 96 fichas de DEPORTIVO Primera · TOTAL: flotador/ayudador
20, físico/rebotero 19, cierre/negación 17, under en el P&R 15, presión a la
bola 8, perseguidor de cortinas 7, contención de penetración 7, protector de
pintura 2, 1x1 1. **Cero** tareas agresivas contra tiradores sin renta y
**cero** perfiles de 📏 Perimetral Largo.

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

## 56. EL RESTO DEL PLANTEL Y LA FICHA DEL PLAN ORO

Dos cambios del informe pre-partido que entraron juntos porque tocan el
mismo tramo: lo que pasa DESPUÉS de la tabla de jugadores clave.

### 1 · El bloque del banco · `SGADD_SCOUT.restoDelPlantel`

`jugadoresClave` se queda con los ocho que más juegan. Los otros —cuatro,
ocho, a veces doce— no aparecían en ninguna parte del informe. El bloque
los nombra en **una fila cada uno**, con exactamente dos columnas:

```
JUGADOR · MUESTRA · VÍA DE GOL LÍDER                                            PERFIL
NOMBRE  29 PJ · 16,5 MIN · 5,9 PLAYS · 5,0 PTS · 18,0% USG   🎯 Doble 1,4/2,6 x PJ · 54,1% · 1,08 PPT   [ADN] [perfiles] [función]

4 jugadores promedian menos de 5 min: JUGADOR 25, JUGADOR 24, JUGADOR 23 y JUGADOR 22.
```

### El piso de la tabla · 5 minutos por partido

**Los de menos de 5 `MIN` por partido no tienen fila** (pedido del club,
2026-09-12): van al pie en una nota **solo con su nombre** —sin
estadísticas, etiquetas ni badges—, en el orden del plantel y con
`enumerar` («A, B y C»). Por debajo de eso la fila no tenía arma
principal que leer: un «0,0/0,1 x PJ» no describe a nadie. No se los
esconde porque saber que ESTÁN en el plantel es información.

- **`MIN_MINUTOS_TABLA_RESTO = 5` es propio y NO el `MIN_MINUTOS` (8) del
  punto 4**: aquél dice cuándo un porcentaje deja de ser ruido, éste
  cuándo vale darle una fila a alguien. Con 8 se irían a la nota
  jugadores de rotación corta que sí tienen un arma para leer.
- **5,0 exactos se queda en la tabla**; 4,99 va a la nota. Hay un test
  del borde.
- **Sin minutos cargados también va a la nota**: no hay fila que armarle
  a un dato ausente.
- **Si todos quedan por debajo**, sale la nota sola, sin tabla vacía.
- El `MIN` de `PROMEDIOS J` ya es por partido: no se divide por PJ.

### Sin badge de eficiencia

Tuvo un badge con el `PPP` ubicado en su banda contra la liga, y **se
sacó a pedido del club (2026-09-12)**, junto con su motor
(`eficienciaIndividual`, la `muestraCorta` que solo él usaba y los tonos
del chip): sin vista era cálculo muerto. Hay un test que falla si vuelve
un `PPP` al bloque.

### SIN ALERTAS, y a propósito

Tuvo alertas de impacto —una tasa por minuto un 35% por encima de la
mediana de su rol, con un «alto impacto en pocos minutos»— y **se sacaron
a pedido del club (2026-09-12)**: son jugadores de baja rotación y el
bloque está para leer su arma principal rápido, no para sumarle a la fila
otra capa de semáforo.

**Se fue el motor, no solo la vista.** Sin nadie que las muestre eran
cálculo muerto corriendo en cada informe —una vuelta por el ADN de la liga
entera— con tests que verificaban algo que el DT no ve. Está en el
historial (`fd6d842`) si alguna vez vuelve, y `test-resto.js` falla si
reaparece un chip de alerta en el bloque o una función de alertas en el
motor.

Lo que sí quedó de ese trabajo, y por qué:

- **El corte sale de UNA sola función** (`plantelOrdenado`). Dos
  ordenamientos calcados terminan partiendo en distinto lugar y un jugador
  saldría en los dos bloques o en ninguno. Los dados de BAJA salen de los
  dos, igual que salían del plan.
- **Las etiquetas se piden al motor compartido** (`jugadoresBadges`), no se
  rearman: con dos renderizadores el mismo jugador saldría con chips de un
  color en la ficha y de otro tres centímetros más abajo.

### 1 bis · Es una TABLA de dos columnas, no tarjetas

**La columna del jugador es UN SOLO FLUJO que envuelve solo cuando no
entra**, y eso es lo que la hace compacta. La primera versión en tabla
ponía nombre, vía y chips en renglones separados y quedó **más alta que
las tarjetas**: 65px por fila, 513px contra 407 para seis suplentes. La
columna tiene ~800px en la A3 y todo entra en un renglón. Medido en modo
papel, A3:

```
                 tarjetas   con alertas   sin alertas   con piso de 5 min
 6 suplentes      407px        314px         275px        194px   −52%
12 suplentes      655px        490px         432px        352px   −46%
```

(El último tramo depende del plantel: en el demo, 4 de los 6 suplentes
promedian menos de 5 minutos.) El PDF sigue en 9 hojas con ORO y 7 con
PLATA: el bloque ya abría hoja.

**La VÍA DE GOL LÍDER se elige por el PESO en sus plays (`PT2%`/`PT3%`/
`PT1%`), no por los intentos crudos** —`viaDeGolLider`, sobre la MISMA
`ZONAS_TIRO` del tab Tiro—. Dos libres son UN play: por intentos, el que
va seguido a la línea saldría «tirador de libres» con la mayoría de sus
ataques terminando en otro lado. Sin la columna de peso decide por
intentos y lo declara (`criterio`); con empate desempatan los intentos.

- **El par va POR PARTIDO, SIEMPRE** (`1,4/2,6 x PJ`), aunque el libro
  traiga el acumulado — pedido del club (2026-09-12). En una fila de banco
  se compara un suplente contra otro, y un promedio se compara sin pensar
  en cuántos partidos jugó cada uno; la muestra la dicen los PJ, que van
  en la misma fila. Estuvo un día en totales (`41/75`) y se volvió.
- **El % y el PPT son las columnas de la hoja de PROMEDIOS** —tasas sobre
  los totales de la temporada—, no el cociente del par: redondeado a un
  decimal daría otro número para la misma pregunta. Sin la tasa en la
  hoja, recién ahí se cae al cociente.
- **Sin un solo intento dice «Sin lanzamientos registrados»**, no «0/0».

**La columna del perfil lleva TODAS las etiquetas**, la función en cancha
incluida. En el papel la tabla va con `table-layout: fixed`, para que los
chips no le roben ancho a la columna del jugador.

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

---

## 64. LAS MARCAS Y LAS CLAVES DEJAN DE CONTRADECIRSE (2026-09-20)

Reportado por el club con un caso concreto: **SCHROEDER, ANDRES** (ATENAS
'A') —Generador Primario, 25,7 min, PPT2 1,09, PPT3 0,94 al 31,3 %, 22,3 %
de pérdidas, 1,61x la liga en RO%— recibía en 🛡 **Marcas** «Anulador de
Tiradores / Sniper Stopper · STAY HOME / PROHIBIDO FLOTAR» mientras las
🎯 **Claves** pedían trap, box-out y colapso de pintura sobre él. El mismo
informe, la misma hoja, dos planes opuestos.

### El diagnóstico: DOS defectos encadenados

**1 · El piso económico del tiro rentable se había vuelto relativo.** La
unificación de la v228 pasó `pptTripleRentable` y `t3Rentable` a percentil
p68. Medido en el libro real de DEPORTIVO (Local Mayores) resolvían a
**0,937 PPT3 y 31,3 % de T3%**: Schroeder pasaba el corte por **tres
milésimas de punto por intento**, quedaba «tirador rentable», su defensor
recibía stay home y el plan lo marcaba INTOCABLE.

Es el mismo modo de fallar del caso RONDINONE por el lado del «frío»
(cuatro milésimas, corregido el 2026-09-19): nadie vio que el espejo
estaba abierto. Y el comentario del propio código lo venía declarando
desde siempre — *«1,05 puntos por triple intentado supera el valor de una
posesión promedio en cualquier categoría»*— mientras el registro hacía lo
contrario.

**2 · La marca es SINGLE-LABEL y las claves son MULTI-LABEL.**
`REGLAS_CLAVE` devuelve todas las reglas que el jugador activa;
`PERFILES_MARCA` es una cascada excluyente que se queda con la primera y
**descarta el resto en silencio**. Peor: los predicados estaban escritos
DOS VECES —`generador-riesgoso` y la clave `presion-conduccion` evaluaban
literalmente lo mismo— así que la clave seguía gritando una señal que la
cascada ya había tirado. Es la familia de bug del rol funcional duplicado
(punto 8), con el informe contradiciéndose a sí mismo como síntoma.

### Lo que se midió, antes y después (libro real de DEPORTIVO, 206 fichas)

```
                                                  antes   después
tareas agresivas (cierre / persecución)              31        20
  · con PPT2 > PPT3 → se cierra la vía BARATA         9         0
  · contradichas por una clave sobre el mismo         14         7
INTOCABLES del plan con PPT3 < 1,00                   6         2
```

Los 7 que quedan **no son contradicciones**: son tiradores reales (1,50 ·
1,80 PPT3) que además pierden pelotas o van al cristal. Esa información
ahora viaja dentro de la marca como MODIFICADOR, así que las dos secciones
dicen lo mismo.

### Las seis piezas

**1 · El piso vuelve a ser ABSOLUTO.** `pptTripleRentable` 1,05 y
`t3Rentable` 0,35 pasan a `TIPOS.ABSOLUTO` en `sgadd-niveles.js`. Son
**cinco** absolutos ahora, por dos motivos distintos: los tres viejos
porque su brecha medida entre ligas es chica, y estos dos **por economía
pese a su brecha de 19pp** — no clasifican una población, son el PISO de
una disyunción (*«paga en absoluto O está por encima de su liga»*) cuya
otra mitad ya es relativa. Si el piso también se mueve, la regla se queda
sin ancla. Hay tests que exigen que lo declaren por escrito, porque el día
que alguien los mire solo por el número los va a «corregir» otra vez.

**2 · El desempate por VALOR ESPERADO.** `senales(p).tripleEsLaViaCara`
compara los puntos por intento de cada vía (triple, doble, línea) con
volumen mínimo, y **ninguna marca puede ordenar cerrar una vía que no es
la más cara**. Vive en dos lugares a propósito: en el test de las marcas
de tiro y como guarda en `tareaDefensiva`, al lado de la que ya existía.
Los dos destinos son distintos: si el tiro **no paga**, se flota; si paga
pero su penetración paga **más**, no se flota —seguiría siendo un tiro
rentable— sino que se le cierra el primer paso (`contencionPenetracion`).

**3 · `senales(p)` · UN SOLO PREDICADO.** Función pura que contesta las
catorce lecturas que la marca y las claves comparten (`ejeDelAtaque`,
`pierdeMucho`, `cristalOfensivo`, `faltaRentable`, `robaBalones`…). Las
diez claves delegan ahí y **ninguna vuelve a leer `Up(p)` a mano**; hay un
test de fuente que falla si aparece una que lo haga.

Ojo con una distinción deliberada: **`cristalOfensivo` (solo RO%) decide
la marca `rebotador` y el grupo del plan** —son las segundas chances que
cuestan puntos— y **`dominaElCristal` (RO% o RD%) dispara el modificador
de box-out**, porque el defensor que no puede rotar es el de cualquiera
que domine el vidrio. No son la misma pregunta.

**4 · Los MODIFICADORES · lo que la cascada descarta no se pierde.** La
marca sigue siendo una sola —el plan asigna un defensor por rival, no
cuatro etiquetas— pero arrastra lo que las otras señales activaron:

| modificador | cuándo | eje |
|---|---|---|
| 🏰 box-out asignado obligatorio | `RO% rel ≥ 1,30` **o** `RD% rel ≥ 1,30` | sin pelota |
| 🧤 acoso al drible | `%TOV ≥ 20 %` **o** `perdidasRel ≥ 1,25` | con pelota |
| 🎯 / ⚖ nota de falta | ver la pieza 6 | con pelota |

**Un modificador que repite lo que la marca ya dice en su título NO se
emite** (`MARCA_YA_LO_DICE`): «BOX-OUT DE CHOQUE» con «BOX-OUT ASIGNADO
OBLIGATORIO» al lado es la marca discutiendo consigo misma, y en una celda
angosta el ruido tapa lo que sí es nuevo. Lo cazó mirar la pantalla, no
los tests.

**5 · ON-BALL / OFF-BALL explícito.** Las columnas pasan a **«Con pelota ·
cobertura»** (Under/Drop/Over/Trap, mano hábil, distancia de contención) y
**«Sin pelota · ayudas y cristal»** (Stay Home / Help & Recover / Sink &
Fill + responsabilidad en el rebote). Las doce parejas se reescribieron
para que cada una sea realmente eso.

`marca.conPelota` y `marca.sinPelota` son **el mismo objeto** que
`consigna` y `restriccion`, no una copia: dos copias se desincronizan en
cuanto alguien edite una. Los nombres viejos se quedan porque son el
contrato que leen el input editable, el PDF y los tests, y el contrato de
editabilidad no se toca — título en mayúsculas ≤ 45 caracteres y editable,
detalle con el número y solo lectura.

**6 · La falta táctica con valor esperado y margen.** `t1Regalable` se
había relativizado a p3 y en el libro real resolvía a **0,20**: la marca
`castigable-en-la-linea` estaba prácticamente muerta. El corte ahora es
económico y por jugador:

```
la falta es negocio  ⟺  2 × T1% + 0,10  ≤  PPT2     y  T1% < 58 %
```

**EL MARGEN es la mitad de la regla**: sin él la decisión se da vuelta por
ruido —medido en el caso Schroeder, 1,07 contra 1,09, dos centésimas—.
**Arrancó en 0,15 y bajó a 0,10 el mismo 2026-09-20**, a pedido del club,
para recuperar los casos intermedios sin perder la protección. Medido
sobre el libro de DEPORTIVO (425 fichas, IDA + TOTAL), lo que se movió
**no fue la marca sino la NOTA**:

```
                                 0,15   0,10
marca castigable-en-la-linea        2      2
modificador FALTA RENTABLE         13     19
modificador NO CORTAR CON FALTA    55     49
```

Y eso deja a la vista dónde está el cuello de esa marca, que no es el
margen: de las **21** fichas con la falta rentable, 14 llegan al volumen
interno que la marca exige y **12 se las lleva una marca anterior de la
cascada** (7 `interior-dominante`, 3 `slasher`). Es el orden por costo de
la amenaza haciendo su trabajo —a un dominador de pintura se lo marca por
eso, no por sus libres— y la información no se pierde: viaja como
modificador. Bajar más el margen no cambiaría eso; lo que lo cambiaría es
tocar la cascada, que es una decisión de básquet aparte. Y hace falta **volumen de línea** (`T1I ≥ 1,5`), o un jugador
que casi no va a la línea sale con «T1% 0,0 % → la falta es negocio»: el
cero no dice que falle los libres, dice que no los tiró. Es la distinción
del punto 3, tercera vez que aparece en el proyecto (la cazó GARCIA,
MATÍAS en el libro real).

**El panel NO conoce el bonus ni las faltas personales**: la planilla no
trae estado de partido. Eso se emite como condición que verifica el DT
—*«solo fuera del bonus y con margen de faltas del defensor»*— nunca como
cálculo. Hay un test que lo exige por escrito.

### Lo que esto le cambió a las secciones «protegidas», y por qué

El club pidió tocar solo 🛡 Marcas, y hubo que avisarle de algo que la
auditoría encontró: **el 🧠 Resumen leía el MISMO flag**, así que no
estaba contradiciendo a las Marcas — estaba del mismo lado del error. Su
tramo de stay home decía *«prohibido soltar a MARCATILI (1,00 PPT3)»* de
alguien que rinde **1,17 adentro**. Con la opción B autorizada, ese tramo
y los bullets de la 📋 Ficha se corrigen solos: **su lógica no se tocó**,
solo el dato que leen. Verificado en la demo: el Resumen ahora lista
únicamente tiradores de 1,36 · 1,22 · 1,13 PPT3, que son exactamente los
que la tabla de marcas manda no soltar.

### Los tres casos de aceptación, medidos sobre el libro real

```
SCHROEDER (sintético, sus números)  → generador-sin-tiro
    CON PELOTA  UNDER EN EL P&R / CONTENER LA PENETRACIÓN.
    SIN PELOTA  DOBLAR EL PICK & ROLL, NO EL TIRO.
    MOD         acoso al drible · no cortar con falta · box-out asignado
    plan        focos + cristal   (ya no INTOCABLE)

RIVELLI (sniper real, 1,30 PPT3)    → tirador-elite            SIN CAMBIOS
    CON PELOTA  TOP LOCK / OVER.        SIN PELOTA  STAY HOME.

CABALLERO (pívot real, T1% 24,0 %)  → interior-dominante
    MOD         falta rentable (0,48 esperados contra 1,05) · box-out
```

### Lo que hay que respetar al tocarlo

- **Toda regla que ORDENE perseguir el tiro usa
  `amenazaExteriorPrimaria`, no `tiroExternoRentable` a secas.** Son los
  INTOCABLES del plan, el tramo de stay home del Resumen, las dos marcas
  de tiro y la lectura `efectividad: 'alta'` de `lecturaMultivariable`.
  `tiroExternoRentable` sigue existiendo y describe el tiro; lo que
  decide el PLAN es si además es su vía más cara.
- **Una clave nueva se escribe en `senales`, no en su `buscar`.** Hay un
  test de fuente que lo fija, y es lo único que impide que la tabla de
  marcas y las claves vuelvan a divergir.
- **Un modificador nuevo declara su EJE** (`conPelota` / `sinPelota`) y
  entra a `MARCA_YA_LO_DICE` si alguna marca ya lo dice en su título.
- **Los cortes del manual salen del generador**, que ya los imprime por
  nivel: `node generar-manual-etiquetas.js` después de cambiar una regla.
- **Cada arreglo se verificó AL REVÉS**: revirtiendo el piso absoluto caen
  4 tests, la guarda del valor esperado 1, el gate de la marca 1, la
  delegación de las claves 1, el modificador de box-out 2, los dos ejes 1
  y la guarda de volumen de línea 1.

---

## 79. EL RIVAL DE OTRA ZONA: ESCUDO, SCOUTING PRE-PARTIDO Y EL CAMBIO DE FASE (2026-09-30)

Cuatro reportes con capturas de un cliente de la Zona B de APB (Hogar
Social). `test-interzonal.js` (sección 8) fija todo lo de acá.

### 1 · Escudos de otra zona · el panel nunca los PEDÍA

Los archivos estaban en el manifiesto (`universal.avif`,
`capital-chica.webp`, `a-chascomus-a.webp`, `juventud.webp`). `LOGOS.getUrl`
solo lee el caché, y el caché lo llena `resolver()` con los equipos del
libro PROPIO: los de otra zona salían siempre con iniciales.

- `SGADD_FASES.pedirEscudos(nombresDeLlave(...))` los pide desde la llave
  de Clasificación y del Fixture. **Una vez por nombre**: el hook de LOGOS
  repinta si entra alguno nuevo y un nombre sin archivo queda en caché, así
  que no hay ciclo (punto 6).
- **El servidor manda `zona` e `id` (Gesdeportiva) en cada fila de la
  llave**. La URL del escudo NO: el manifiesto vive en el repo del panel,
  no en el backend, y resolverlo allá sería una segunda fuente.

### 2 · El libro vinculado «se vaciaba» al editarlo · era el diseño

El `sheetId` no llega al navegador, tampoco al del admin (punto 53). El
campo arrancaba vacío con el rótulo «vacío = conserva el que tiene» y se
leía como un libro perdido. Ahora el admin recibe **`libroFin`** (los
últimos 6 caracteres) y el campo muestra **`…tVEq5M`** con el rótulo
«conectado · pegá otro link para cambiarlo»:

- mientras el campo diga la máscara, guardar **no manda libro** y el
  servidor conserva el que tiene;
- pegar otro link lo reemplaza; un link roto se sigue denunciando.

El id completo sigue sin viajar. Si el club lo quiere ver entero, es un
cambio de regla, no un arreglo.

### 3 · La pantalla congelada al volver de una fase «· llave»

Medido: con Equipos abierta en modo llave, la pantalla es el aviso del
router. Al volver a una fase de la zona, `onCambio` llamaba a
`equiposPintar()`, que busca `#equiposRoot` —no existe con el aviso en
pantalla— y salía sin pintar: **la barra en la fase de la zona y el aviso
viejo abajo**. Lo mismo Jugadores, Simulador y Scouting.

El aviso lleva ahora **`data-modo-llave`** y, si está en pantalla,
`onCambio` pasa por el ROUTER (`renderSection`), que arma la sección
entera. Entre dos fases de la zona sigue el repintado de siempre.

### 4 · El scouting pre-partido del rival de otra zona

**Scouting entra en modo llave** (`SECCIONES_EN_LLAVE`): abre directo en
el cruce —equipo propio contra su rival de esa fase— y el selector ofrece
un grupo «Rival de la llave · otra zona».

```
GET /api/v1/torneos/:torneo/rival?equipo=<clave>
```

Entrega **UN equipo** de la otra zona —su fase regular, sus partidos con el
otro lado de cada uno, sus jugadores y el box de SUS jugadores— y solo si:

1. el cliente tiene una categoría del torneo con acceso y con el informe
   pre-partido en su plan EFECTIVO (el `puedeBloque` de `/scouting`);
2. la llave de SU zona tiene un cruce de SU equipo contra ese rival,
   **resuelto o proyectado** con la tabla de hoy: el DT se prepara antes de
   que se juegue el partido;
3. el rival es de OTRA zona (`MISMA_ZONA`: el de la suya ya está en su libro).

El admin pasa sin (1) ni (2). **El libro de la otra zona sigue en 403.**

#### Se INJERTA, no se fusiona el libro

`idx.exportarEquipo(clave)` (servidor, sobre el índice de la zona del
rival) e `idx.injertarEquipo(serial)` (panel) viven en el núcleo, porque
tocan las estructuras internas del índice (`filasPorPartido`,
`boxPorPartido`, `jugadorPartidos`).

- **Una fusión de libros** crearía como equipos a los rivales del rival
  —media liga ajena en la tabla— y movería las distribuciones de la zona.
  Injertado, el rival se mide **contra la liga del cliente** y nada de la
  zona propia cambia (hay test: mismas distribuciones).
- **Se injerta en una COPIA** del índice que usa solo Scouting
  (`scoutIdx()`); la de la app no se toca. Cambiar de fase o de categoría
  trae otro índice y la copia se descarta con sus rivales.
- **El box viaja filtrado a SUS jugadores**: el partido a partido de los
  demás equipos de su zona es lo que el plan protege.
- Las fechas vuelven a ser `Date` al injertar (JSON las pasa a texto).
- Injertar un equipo que ya es de la liga no pisa nada.

### Verificado

- **Con KV y Google reales**, backend local y un token de cliente de Hogar
  Social: la llave detecta a UNIVERSAL (9° Zona A, R3) como su rival; en
  modo llave el Scouting abre Hogar Social vs Universal con su fase regular
  real (19 PJ, 8-11), la matriz, las marcas, sus jugadores y las claves.
  El índice de la app sigue con 12 equipos. CAPITAL CHICA, 403 `SIN_CRUCE`.
- **En la llave de Clasificación**, los 8 escudos de los dos repechajes,
  cero iniciales.
- **Equipos** en modo llave → «Total - Regular» desde el selector real: el
  aviso se va y la sección se arma con sus escudos.
- **Panel Master**, sesión de admin: «Editar» en «Playoffs - Zona A»
  muestra `…tVEq5M` y el botón de guardar habilitado.
- **Al revés, 15 mutaciones**, todas caen.

---

## 80. EL RIVAL DE OTRA ZONA CONTRA SU PROPIA LIGA, Y LA FALTA TÁCTICA (2026-09-30)

Reporte con captura del informe Universal vs Hogar Social.
`test-interzonal.js` (sección 8e-8h) y `test-scouting.js` lo fijan.

### 1 · El escudo del rival · y tres defectos más que salieron al medirlo

- **Scouting pide los escudos de otra zona** (`SGADD_FASES.pedirEscudos`),
  igual que la llave: el caché de LOGOS solo tiene los del libro propio.
- **Scouting se repinta cuando llega la llave del servidor**
  (`SECCIONES_QUE_USAN_LLAVE`). Entrando directo a Scouting, el informe se
  pintaba antes de la llave: sin el rival de otra zona en el selector y sin
  el cruce preseleccionado.
- **«Último: 60 vs 69 —»**: el rival del último partido de un injertado es
  de SU zona y no está en el índice. `rivalDelTexto()` lo saca del «A vs B».
- **La fecha llegaba un día antes.** El índice arma la fecha a la
  medianoche local de quien lo construye; en Vercel es UTC, y serializada
  como instante el partido del 22/09 llegaba al navegador como el 21 a las
  21 h. Ahora `__fecha` viaja como día (`AAAA-MM-DD`) y se revive local. El
  test exporta en un proceso con `TZ=Pacific/Kiritimati` e injerta acá.

### 2 · Cada equipo contra la mediana de SU liga

El servidor exporta al rival con **`__ligaOrigen`**: mediana, percentil y
puesto de ESE equipo en cada métrica, calculados contra su zona, más la
etiqueta de la zona. **Viajan los resultados, no las distribuciones**: los
valores de los otros equipos de su zona no le llegan al cliente.

`leer()` y `ranking()` del núcleo usan ese contexto para un injertado, así
que **todo el informe** lo mide contra su liga: el color de la matriz, el
chip de puesto, los rankings y la referencia. La matriz, cuando los dos
equipos juegan en zonas distintas (`cruzada`), va:

```
Métrica | HOGAR SOCIAL | Mediana Zona B || UNIVERSAL | Mediana Zona A
```

y los rankings dicen «· en APB 2026 · Zona A». Entre dos equipos de la
misma zona, una sola columna «Liga», como siempre. Un injertado sin mediana
declarada **no cae** a la de la otra liga: muestra «—».

**Lo que NO cambió:** las bandas de sus JUGADORES (fortalezas, fugas,
marcas) se siguen midiendo contra los calificados de la liga del cliente —
eso necesitaría exportar las distribuciones de jugadores de su zona.

### 3 · La falta táctica: una sola decisión

`faltaRentable` corría solo por la vía económica (2 × T1% + 0,10 ≤ PPT2).
El caso real, **GARCIA BARUCCO (UNIVERSAL)**: 44,2 % en libres, 7,1
intentos, PPT2 0,914 → 0,98 > 0,914 → «NO CORTAR CON FALTA», mientras su
ficha decía que la falta sobre él cuesta menos que sobre cualquier otro y
la clave lo omitía.

Ahora hay dos vías, y cualquiera alcanza (con volumen de línea y < 58 %):

1. la económica, igual que antes;
2. **la de LIGA**: T1% bajo su liga (`porDebajo(bandaT1)`) o bajo el piso
   absoluto `t1Regalable` (40 %).

**No se usa `t1Pobre`** (0,60): su propio comentario dice «castigable, pero
NO con falta sistemática», y con él el caso SCHROEDER (53,7 % contra 1,09 de
PPT2, que no es negocio) salía rentable. Hay test.

- El modificador se llama **«FALTA TÁCTICA RENTABLE.»** y compara contra la
  jugada promedio de su liga (`pppLiga`, la mediana de PPP de los equipos)
  **solo si es cierto**: en la Zona A es 0,83 < 0,88 y no se dice.
- **La clave «Falta táctica rentable» usa la MISMA señal** que la marca.
  Antes elegía por `regalableEnLaLinea` (uso de línea alto y T1% ≤ t1Pobre)
  y podía nombrar a alguien cuya marca decía «NO CORTAR CON FALTA». Hay un
  test de grilla que exige que clave y marca coincidan y que ninguna ficha
  diga a la vez «la falta es barata» y «no cortar con falta».

### Verificado

- **Con KV y Google reales** (backend local, token de Hogar Social): la
  cabecera con los escudos de los dos, «Último: 60 vs 69 PLATENSE 'A' ·
  22/09», la matriz con la mediana de la Zona B y de la Zona A, y GARCIA
  BARUCCO con «FALTA TÁCTICA RENTABLE» y en la clave; ningún «NO CORTAR».
- **Al revés, 14 mutaciones**, todas caen.

---

## 81. PPP OF/DEF DE LA OTRA LIGA Y LA CUENTA DE LA FALTA A LA VISTA (2026-09-30)

### PPP OF y PPP DEF viajaban vacías

Medido en producción: la mediana de la Zona A llegaba para PPP, eFG%,
PACE, ORTG, DRTG… y **no** para `PPP OF` ni `PPP DEF`. El índice del rival
es el TOTAL, que no lee la fila TIPO, y esas dos no son «calculadas»: la
liga del cliente cae a la mediana de la distribución (`referenciaLiga`) y
`exportarEquipo` no tenía ese respaldo. Ahora lo tiene, con la misma regla:
el TIPO si existe, si no la mediana de la distribución. Viaja el número, no
la distribución.

### El «0,88» de la falta NO es una duplicación

PPT1 (0,44) es lo que vale UN libre. Una falta corta una posesión y se paga
con DOS libres: 2 × 0,44 = 0,88 es lo que vale esa posesión, y eso es lo
que se compara contra una jugada que termina (PPT2 o la jugada promedio de
su liga). Sin el ×2 se compararía un libre contra una posesión entera y
**toda** falta saldría rentable.

Lo que se corrigió es el TEXTO, que no mostraba de dónde salía el número:

```
FALTA TÁCTICA RENTABLE. Convierte 44,2% de libres, por debajo de su liga:
PPT1 0,44 × 2 libres = 0,88 puntos esperados por posesión, y le baja…
```

El PPT1 que se cita es la columna de la tabla del jugador (`pptLibre`); sin
ella, el T1%, que es el mismo número. «NO CORTAR CON FALTA» muestra la
misma cuenta.

### El «°» de la matriz

Es el chip del puesto en la liga (`4°`): va pegado al valor y en una celda
angosta puede quedar en la línea de abajo. No es un artefacto del dato.

Tests: `test-interzonal.js` 8i (3) y `test-scouting.js` (3). Al revés, las
tres reversiones caen.

---

## 82. LA FALTA EN SU UNIDAD Y LOS PJ DE LA TABLA EN EL SCOUTING (2026-09-30)

### La unidad de la falta es la ACCIÓN CORTADA

«Puntos esperados por posesión» se leía como la posesión del equipo. Lo
que se compara es la MISMA jugada con dos finales: cortada con falta (dos
libres) o terminada (su tiro de dos). Ahora:

```
PPT1 0,52 × 2 libres = 1,04 puntos por la acción cortada con falta,
contra 1,17 por doble intentado (PPT2) si termina la jugada.
```

La vía de liga nombra la unidad: «una jugada promedio de su liga (PPP
0,95)». Ninguna de las dos notas dice ya «posesión».

### Los PJ de la cabecera son los de la tabla

`fichaEquipo(idx, clave, fila)` recibe la fila de Clasificación
(`clasifFilasVigentes`, la misma de Equipos, punto 44) y suma los partidos
sin estadísticas en **PJ, récord, local/visitante, racha y último partido**.
La cabecera lleva el ⚠ amarillo y «Promedios sobre los N partidos con
estadísticas». Medido en el libro de DEPORTIVO (Ida): ATENAS B, C.C.
TOLOSANO, SUD AMÉRICA y UNIVERSITARIO pasan de 10 PJ a 11, como la tabla.

**LOS PROMEDIOS NO SE DIVIDEN POR ESE PJ, y es a propósito** (punto 44): un
partido del que solo se sabe el marcador no tiene tiros, rebotes ni
minutos; dividir los totales por él da promedios plausibles y falsos (con
un partido manual de cada once, todo baja un 9 %). Hay un test que exige
que la matriz no cambie al sumar los manuales.

**El rival de otra zona** no los recibe: sus partidos manuales viven en el
catálogo de SU zona y no viajan con `/rival`.

---

## 85. SCOUTING · LAS DIEZ CARDS DE A UNA Y EL FLUJO CONTINUO (2026-10-02)

Pedido del club: elegir cada card por separado y que el PDF no deje medias
hojas en blanco. **La hoja sigue siendo A3 apaisada** (se le preguntó al
club: el pedido decía A4 vertical, y en A4 la tabla de marcas no entra).

### Las diez opciones

`SCOUT_CARDS` ofrece las diez en el orden del informe, cada una con el
TÍTULO de su card: Reporte de scouting · Métricas avanzadas · Splits ·
Resumen · Plan defensivo · Jugadores clave · Resto · Claves · Marcas
jugador por jugador · Ficha de análisis (más las dos del laboratorio, con la
capa `pbp`). **El plan defensivo y la tabla de marcas dejaron de compartir
`data-bloque`**: la tabla es `marcas-tabla`. Las fichas siguen ofreciéndose
solo con el bloque `scouting.fichas` (Plan ORO, punto 56).

### El flujo

`scout-pagina` se fue del marcado y del CSS: **ninguna card abre hoja por
clase**. Bloque «FLUJO CONTINUO» del `index.html`:

- la card lleva `break-inside: avoid`: si no entra ENTERA en lo que queda de
  la hoja, Chromium la baja completa a la siguiente;
- la card más alta que una hoja (la tabla de marcas, las fichas) no entra en
  ninguna: arranca en hoja nueva y se parte **entre filas o entre fichas**,
  con el `<thead>` repetido (punto 65);
- el título no se despega de su contenido.

**EL BUG QUE SOLO MOSTRÓ EL PDF REAL.** El `break-after: avoid` del cabezal
estaba sobre `.scout-card > p`, y el resumen termina en un `<p>`: un
`break-after: avoid` en el ÚLTIMO hijo se propaga al final de la card y la
pega a la SIGUIENTE. El resumen quedaba atado al plan defensivo y los dos
saltaban de hoja, con media hoja libre debajo de los splits. Va con
`:not(:last-child)`.

### Medido sobre el PDF real (demo, plan ORO, Chrome por CDP)

```
todas tildadas    10 hojas A3 · 1 encabezado · 2 matriz · 3 splits + resumen · 4 plan
                  5 jugadores + resto · 6 claves · 7-8 marcas · 9-10 fichas
sin matriz/ciclo   8 hojas  · 1 encabezado + resumen · 2 plan · …  (sin hojas en blanco)
```

Las alturas medidas en pantalla **subestiman** las del papel: para saber si
una card entraba hubo que mirar la hoja renderizada (PyMuPDF). El pie
institucional sale en todas las hojas.


---

## 146. EL SOPORTE DE DECISIÓN DEL SCOUTING · versión perdedora, mal menor y las tres cosas (2026-10-26)

Assets en `?v=313`. Para TODOS los planes (ninguna de las tres cards es del
ORO) y con box score solo: el play-by-play suma las zonas por otro camino.
`test-diagnostico-rival.js` fija todo; el cableado, `test-scouting.js` y
`test-pbp.js`.

Tres cards nuevas en el informe, también opciones del modal de exportación:

| Card | Dónde | Qué dice |
|---|---|---|
| ⏱ **Tiempo muerto · las 3 cosas** | justo debajo del encabezado | la amenaza, su versión perdedora y la decisión del mal menor |
| 🩺 **Diagnóstico del rival** | debajo de las tres cosas | dependencias de uso, fugas y fortalezas, su versión perdedora, zonas frías y filosofía |
| ⚖ **El mal menor** | debajo del plan defensivo | qué conceder, de menor a mayor costo |

Semáforo `▲ ● ▼ ◆` desde la mirada del rival: ▲ es fuerte (hay que
respetarlo), ▼ débil (se explota), ● en rango, ◆ informativo. Nunca solo
color: el glifo va escrito.

### La versión perdedora (`versionPerdedora`, `textoQuiebre`)

Separa los partidos del rival en ganados y perdidos y busca, entre seis
métricas (`METRICAS_QUIEBRE`: eFG%, T3%, %TOV, RO%, eFG% de sus rivales,
RTL%), la que más los distingue en desvíos conjuntos. El punto de quiebre es
el medio entre las dos medias; con ese corte cuenta cuántas veces pierde
del lado malo («pierde 13 de 15 partidos»).

- **Solo cuenta si gana con el lado BUENO de la métrica.** Ganar con peor
  eFG% no es un quiebre, es ruido, y el texto dice que ninguna métrica
  separa.
- **Pide 3 ganados y 3 perdidos**, y 3 partidos del lado malo. Con menos de
  6 de un lado va con «muestra chica». Con 13 fechas es lo más frágil del
  diseño y la card lo dice.
- **No es causal**, y la card lo dice: que pierda cuando cae no prueba que se
  lo pueda forzar. Cada métrica trae la acción que el cuerpo técnico puede
  hacer (`accion`), como lectura.
- Usa `idx.agregarPartidos(clave, [partido])`: el mismo cálculo del ciclo.

### El mal menor (`concesiones`)

Sale de `jugadoresClave` con el plan colectivo ya calculado, así que no
puede contradecir la tabla de marcas. **Un intocable nunca aparece, ni un
foco** (a ese se lo dobla). Opciones: dejar tirar de tres a un tirador frío
(costo = su PPT3) y mandar a la línea al que la falta le cuesta menos
(costo = 2 × T1%, dos libres). Ordenadas de menor a mayor costo, hasta 5.
Cada una dice el volumen que absorbe y qué protege: la ayuda sobre el foco y
el box-out del cristal para el tiro; para la falta, que corta la jugada, y
que **el bonus y las faltas de nuestros defensores los mira el cuerpo
técnico** (el panel no conoce el estado del partido, punto 64).

### Las tres cosas (`tresCosas`)

Determinista: la amenaza (el intocable antes que el foco), la versión
perdedora y la concesión más barata con lo que no se concede. Lo que el dato
no sostiene no se escribe: faltan piezas, quedan menos de tres.

### Con el play-by-play

`SGADD_PBP.diagnosticoRival(paq)` (PURA) suma dos piezas, montadas después de
pintar por los lugares `espacioRival(equipo, 'frias' | 'concesiones')`:
- **zonas frías**: las del mapa bajo la liga, ajustadas por muestra (20 tiros
  de liga), con 20 tiros mínimos;
- **ceder una zona**: las que menos cuesta cederle, **nunca el aro (Z1-Z4)**.

El montaje también refina la línea de filosofía del Diagnóstico con el
paquete (`refinarFilosofia`, punto 145). **Sin paquete, o con la carga
fallida, el lugar queda vacío y la card dice que el mapa necesita la capa de
laboratorio**: el modo degradado es box score puro.

### Lo que el dato NO permite

Presión de bonus y faltas por cuarto en vivo, y play types: se emiten como
condición que verifica el DT, no como cálculo.

### Verificado

Al revés, tres mutaciones del motor, todas caen: concesiones sin el filtro de
intocables (4), el quiebre sin la dirección buena (2) y las concesiones sin
ordenar (5). En el navegador, sobre la demo, las tres cards salen en su
orden con datos. **PDF real medido** (demo, Plata, A3 apaisada): 9 hojas con la
firma en todas; la hoja 1 lleva el encabezado y «las 3 cosas», y el Diagnóstico
abre la hoja 2 (`break-inside: avoid`). Decisión del club: se queda así.
**No verificado**: el espacio libre de la hoja 1 como imagen, ni las zonas
frías ni las fichas ORO (la demo no tiene la capa `pbp`).

## 147. DUELOS CRUZADOS, VOLÚMENES DE UMBRAL, FODA Y CUARTOS · y se fue el mal menor (2026-10-27)

Assets en `?v=314`. Para TODOS los planes y con box score solo; el play-by-play
suma sus piezas por el camino de siempre (montaje después de pintar).
`test-diagnostico-rival.js` fija el motor y el cableado; `test-pbp.js` las
piezas del play-by-play (y los cuartos con su juego) y `test-scouting.js` la integración con el índice real.

### Lo que se fue y lo que entró

| Antes (v313) | Ahora (v314) |
|---|---|
| ⚖ El mal menor · matriz de concesiones | **fuera**: era redundante con las marcas y el plan colectivo. Se fueron `concesiones()`, su card, `concesionesRival`, la opción del modal y la pieza «ceder una zona» del play-by-play |
| ⏱ las 3 cosas: amenaza, versión perdedora, concesión | ⏱ las 3 cosas **como directivas del cruce**: el duelo que decide, dónde se quiebra (con su volumen) y nuestro volumen límite |
| — | ⚔ **Duelos cruzados y volúmenes de umbral** (`data-bloque="duelos"`) |
| — | 🧭 **FODA del partido** (`foda`) |
| — | ⏲ **Rendimiento por cuarto** (`pbp-cuartos`, solo con la capa `pbp`) |

Orden del informe: encabezado · las 3 cosas · diagnóstico · duelos · FODA · matriz…
(duelos va DESPUÉS del diagnóstico a propósito: así se reparten mejor las hojas).

### Duelos cruzados (`duelosCruzados`)

El MISMO cálculo del Simulador (`SGADD_4F.simularEnfrentamiento`: regresión de
liga sobre los 4 Factores), puesto del lado de NUESTRO equipo, con el local y el
visitante del cruce. ★ marca el factor que más mueve el margen; ✓/✗ dice si el
ataque supera a esa defensa; ◀ inclina el factor a favor nuestro y ▶ a favor del
rival; el margen proyectado se da desde nuestro lado. **Sin muestra del
simulador degrada** (`ok: false` con su motivo), sin error. El factor de
pérdidas lleva «de pérdidas» y «menos es mejor»: son tasas de pérdida, no de
cuidado.

### Volúmenes de umbral (`volumenesUmbral`)

Cuántos tiros, pérdidas, rebotes o libres por partido sostienen la zona positiva.
«Positiva» = la **mediana de la liga con la eficiencia propia del equipo**:

- tiros de campo: `(PTS mediana − sus libres) / (2 × su eFG%)`;
- triples: `T3C mediana / su T3%`;
- pérdidas: **tope** = sus plays × el peor cuarto de `PePP%` de la liga (se mide hacia abajo);
- rebotes ofensivos: `RO% mediana × (su RO / su RO%)`;
- libres: `RTL% mediana × sus tiros de campo`.

Un volumen sin dato se omite. No son metas: es la cuenta de qué hace falta para
no quedar bajo la mediana, y cada línea trae la cuenta completa en el `title`.

### FODA (`foda`, pura)

F = percentil ≥ 70 del rival · D = percentil < 35 (más su versión perdedora) ·
O = duelos donde NUESTRO ataque supera su defensa · A = duelos donde su ataque
supera nuestra defensa, más la amenaza del plan. Con el play-by-play,
`SGADD_PBP.fodaPbp` suma a cada casilla: tipos de posesión y media distancia
(F/D), pérdidas vivas y cierres (D), arquetipos del reloj (F/D según el signo
`ef`; la defensa de resistencia va a A) y las zonas que su defensa concede (O).
Cada línea sale de un criterio que ya existía: ninguno nuevo.

### Rendimiento por cuarto (`cuartosCruzadoHtml`, `cuartosPatrones`)

Los parciales (puntos a favor y en contra, G-E-P, últimos 5) viajan desde
siempre; **desde la v315 (2026-10-27) cada cuarto trae además `juego`**, que
suma la ingesta (`AV.juegoPorCuarto`, dentro de `AV.cuartos`) sobre las acciones
del play-by-play. Es un campo opcional del paquete @3: un paquete sin él sigue
mostrando solo los parciales y la card dice que el detalle llega con la próxima
subida.

```
juego = { n, efgF, efgC, tciF, tciC, ortg, drtg, ppF, ppC, ritmo, fcF, fcC }
```

- **Las tasas salen de los TOTALES** de todos los partidos, no del promedio de
  cada noche. Posesiones = tiros de campo + 0,44 libres + pérdidas − rebotes
  ofensivos (punto 66); ORTG/DRTG por 100 de ellas. **El ritmo son posesiones
  cada 40 minutos** (la escala del PACE), así el suplementario (5 min) se lee
  junto a los cuatro cuartos. Las faltas son las personales (`FALTA-COMETIDA`).
- **La tabla de la card** muestra, por equipo, eFG% (hace/cede), ORTG, DRTG, Net,
  pérdidas (hace/cede), ritmo y faltas (hace/cede) de cada cuarto.
- **Los patrones del último cuarto se miden NETOS DEL RIVAL** contra el promedio
  de los tres primeros (`juegoPatrones`). Medido en los 17 equipos de la
  Conferencia Norte, **todos** tiran peor (mediana −0,022 de eFG%) y cometen más
  faltas (+0,67) al final: con el valor crudo se marcaría a media liga. Neto del
  rival la mediana queda en ≈ 0 y los cortes caen en el p10/p90: **0,04 de eFG%,
  0,5 pérdidas y 0,6 faltas por partido** (`JUEGO_CORTE`). Ids: `tiro-cae`,
  `tiro-sube`, `pierde-tarde`, `cuida-tarde`, `faltas-tarde`. Piden `juego` en los
  cuatro cuartos y 5 partidos. Sobre los 17 paquetes salen 17 patrones en total.
- **El ritmo no genera patrón**: lo comparten los dos equipos de la cancha, así
  que su caída en el cuarto no distingue a nadie. Se muestra y nada más.
- `faltas-tarde` aclara que el bonus lo mira el cuerpo técnico: el panel no
  conoce el estado del partido (punto 64).
- **Los paquetes de producción siguen sin `juego`** hasta la próxima subida
  (`node herramientas/subir-paquetes.js --confirmar`). Los regenerados en local
  pesan hasta 210 KB de los 256 que admite `pbp.js`.

### Las tres cosas

`tresCosas(duelos, quiebre, volRival, volNuestro, amenaza)`: ① el duelo ★ con
las dos cifras y el margen, ② su quiebre con la referencia de volumen de SU
métrica (`VOLUMEN_DE_QUIEBRE`), ③ «Por partido: no pasar de N pérdidas, al menos
M tiros de campo…» y a quién no soltar. Lo que el dato no sostiene no se
escribe: faltan piezas, quedan menos de tres.

### El papel

- **El mapa de tiro lleva la tabla a la derecha del gráfico** también en el PDF
  (`.pbp-mapa-grid` forzada en `@media print`): el `lg:` de Tailwind se evalúa
  contra el ancho de la HOJA (punto 49) y en una A4 vertical no se activaba.
- Diagnóstico, duelos y cuartos pueden partirse **entre sub-cards** para llenar
  la hoja (cada sub-card no se parte). Medido con la demo (Plata, sin `pbp`):
  10 hojas A3, firma en todas; el FODA queda solo en la hoja 3 porque, entero,
  no entra en lo que queda de la 2. Con la capa `pbp` no se midió.

### No verificado

El PDF con la capa `pbp` (cuartos, zonas frías y las líneas del FODA del
play-by-play) y con las fichas del Plan ORO: la demo no las tiene.
---

## 148. EL SIMULADOR, VIVO Y BAYESIANO · auditoría y refactor (2026-10-27)

Assets en `?v=317`. `js/sgadd-4factores.js` sección 7; `test-4factores.js` (123 tests).

### Lo que la auditoría encontró (medido con la demo, 17 equipos, 272 partidos)

1. **Dos unidades en la base**: `PACE × PPP`, posesiones por puntos por PLAY (el defecto que el punto 66 dejó abierto).
2. **Triple contabilidad**: la base ya incluía la eficiencia, y encima se sumaban los duelos de los 4 factores y el Net Rating. Los tres miden lo mismo.
3. **Sin encogimiento**: un equipo con 2 partidos pesaba 100 %.
4. **La localía entraba dos veces**: perfiles de local/visitante más un bonus de `2,5 × (1 + 4·ventaja)` con constantes escritas a mano.
5. **Pesos por regresión sin prior** (cortaba en 30 partidos y caía a regresiones simples sumadas), y probabilidad con una logística de escala 10 sin sustento.

### El modelo nuevo: UNA cadena

`ritmo × ORTG cruzado → margen por posesiones → + localía → + fatiga`, con `ritmo = pL + pV − media` y `ORTG_L = oL + dV − media` (ratings por 100 posesiones, punto 66). Medido: sumar o promediar el ritmo da el mismo error (8,81 contra 8,81).

- **Encogimiento empírico de Bayes** (`encoger`): `k = σ²_dentro / τ²_entre`, medido de la dispersión de la liga, para ORTG, DRTG, ritmo y las 8 tasas de los 4 factores. En la demo la credibilidad de un equipo con 32 partidos es ~31 %: los equipos se parecen mucho entre sí.
- **Pesos de los 4 factores** (`ajustarPesosOliver`): ridge hacia el prior de Dean Oliver (40/25/20/15) con λ elegido por validación cruzada de un partido afuera. Con pocos partidos vuelve a Oliver; con muchos, a la liga (hoy 97 %).
- **Los 4 factores EXPLICAN el margen, no se suman a él**: `margen = factores + residual + localía + fatiga + ajuste de empate`, siempre exacto (`modelo.reconciliacion`). El residual medio es 1,1 puntos.
- **Localía**: media del margen local de la liga con un prior débil (3 ± 2 puntos). Una sola vez.
- **Fatiga**: ridge hacia 0 sobre partidos con ≤ 1 día de descanso; en la demo da +0,56 con 31 casos. Se aplica solo si se pasan `descansoLocal/Visitante`.
- **Probabilidad**: normal con el error fuera de muestra del propio modelo (11,4 puntos). **Monte Carlo** repetible (semilla fija) con la dispersión de cada equipo.
- `repartirUso`: normaliza USG% × minutos para que los 5 en cancha sumen 100 %.
- `backtest`: cada partido se predice con la liga hasta el día anterior.

### Resultado

```
                        MAE    RMSE   acierto
modelo viejo (con trampa: ve el partido que predice)   10,22  12,93  62,2 %
modelo nuevo (con trampa, para comparar)                8,81  11,05  67,0 %
modelo nuevo, hacia adelante (sin trampa, 210 partidos) 9,36  11,72  62,9 %
siempre gana el local                                                62,4 %
```

**Honestidad**: hacia adelante el nuevo mejora el error pero apenas acierta más que «gana el local». Con 32 fechas por equipo y diferencias chicas entre equipos, el valor está en el margen y la incertidumbre, no en el ganador.

### Lo que NO se hizo (y por qué)

- **Rotación, banca, faltas tempranas y clutch por jugador**: el simulador es de equipo y la planilla no trae quintetos; eso vive en el paquete `pbp`. Solo se agregó `repartirUso`. Simular jugadores partido a partido es un proyecto aparte.
- **Ajuste por calidad de rivales** (SRS): en una conferencia de todos contra todos el sesgo es chico; queda anotado.
- **Volúmenes de umbral del Scouting**: siguen saliendo de las medianas del índice (punto 147). El simulador exporta `scouting` (duelos, ritmo, ORTG y referencias de liga) para que lean lo mismo.
- Constantes que quedan y son priors declarados: `PRIOR_LOCALIA`, `PRIOR_FATIGA_SD`, `PESOS_OLIVER`, la grilla de λ y el tope de presentación de 3 %-97 %.

### Compatibilidad

`simularEnfrentamiento` conserva la forma de siempre (la pantalla y los duelos del Scouting no se tocaron en lo funcional). Cambian: `ajusteNetRating` es 0, `pppEsperado*` pasó a ser por posesión (ORTG/100), `usoHistoriaCompleta*` son siempre `false` y `metodoPesos` vale `bayes-oliver` u `oliver`. El perfil por condición (`perfilEquipoSimulacion`) sigue exportado pero ya no lo usa el simulador.

---

## 149. EL SIMULADOR · AJUSTE POR RIVAL, LOCALÍA POR CLUB Y MONTE CARLO DE 10.000 (2026-10-27)

Assets en `?v=318`. Sigue en `js/sgadd-4factores.js` (sección 7) y se apoya en el punto 148. `test-4factores.js`, 148 tests.

### 1 · Ajuste por rival (`ajustarPorRival`)

Lo que un equipo produce se mide contra lo que SU rival de esa noche suele conceder, y lo que concede contra lo que el rival suele producir. Es el esquema iterativo del SRS (12 vueltas), con cada vuelta sobre los ratings ya encogidos de los rivales. Alcanza a ORTG, DRTG y las 8 tasas de los 4 factores; los nets de los duelos salen de las tasas ajustadas. El valor ajustado vive en `g.adj[clave]` y el crudo no se pisa. Un partido sin rival identificado queda como vino. Cada equipo trae su `sos` (+ = enfrentó defensas flojas).

**Medido**: en la demo el efecto es chico (`sos` de −0,4 a +0,3 de ORTG) porque es una conferencia de todos contra todos con calendario parejo. Con un calendario desparejo sí pesa: en el test, dos equipos de la misma ofensiva real separados 2+ puntos por jugarle a una defensa colapsada quedan a menos de la mitad.

### 2 · Localía por club (`hcaClub`)

Se terminó la constante plana. Para cada partido de local se calcula el residual neutral (margen − lo que dicen los ratings sin ese partido) y la localía de cada club es el promedio de SUS residuales en casa, encogido hacia la de la liga con el mismo criterio empírico (`k = σ²/τ²` medido entre clubes). Con pocos partidos en casa vale la media de la liga. La liga conserva su prior débil de 3 ± 2 puntos solo como ancla.

**Medido**: en la demo la localía va de +2,1 a +7,5 puntos entre clubes (liga +4,3), con credibilidad ~48 % con 16 partidos en casa. La pantalla dice la localía propia, la de la liga, los partidos y la credibilidad.

### 3 · Monte Carlo de 10.000 partidos

Cada simulación sortea ritmo y ORTG de los dos lados con la dispersión de noche a noche de cada equipo (encogida hacia la de la liga) y calcula puntos = posesiones × ORTG/100. La dispersión total se calibra con el error fuera de muestra del modelo: la curva no puede ser más angosta que lo que el modelo acierta. Un empate se resuelve en prórroga. Tarda ~70 ms.

De la misma muestra salen: la probabilidad de victoria («ganó el 60,8 % de las simulaciones: 6.076 de 10.000»), el rango del 80 % del margen y de los puntos de cada equipo, y el histograma que dibuja la pantalla (barras de 2 puntos, con título y números: no solo color). `confianza` ya es esa fracción. La probabilidad analítica se conserva en `modelo.probabilidadAnalitica` y los dos coinciden a menos de 3 puntos.

### Sistema vivo

No hay estado guardado: el modelo se reajusta desde el índice en cada carga, así que cada paquete de fecha nuevo mueve los ratings, la credibilidad, la localía de cada club y la dispersión sin tocar una constante. `backtest` lo mide hacia adelante.

### Resultado (demo, hacia adelante, 211 partidos, sin ver el partido que predice)

```
                 MAE     RMSE    acierta ganador
v317             9,43    11,81   62,6 %
v318             9,17    11,58   62,1 %
```

El error baja un 3 %; el acierto del ganador no cambia (el mismo techo del punto 148: con 32 fechas y equipos parecidos). Hay que decirlo: la mejora de v318 es de calibración y de lectura por club, no un salto de acierto.

### Lo que hay que respetar

- `ajustarPorRival` no toca la planilla ni las columnas del índice: trabaja sobre copias en `g.adj`.
- El HCA del club sale del residual con ratings **fuera de muestra** (sin el propio partido); con ratings dentro de muestra el residual se achicaría y la localía de todos se aplanaría.
- El Monte Carlo se calibra con `modelo.sigma`: si no hay partidos emparejados cae a la dispersión analítica.
- Los tests de MC usan una liga sintética con ruido casi nulo y, por eso, ensanchan `sigma` a mano en los casos de probabilidad intermedia.
- Verificado al revés: sin las 12 vueltas caen 3 tests, con la localía plana 2 y con 4.000 simulaciones en vez de 10.000 otros 2.

### Pendiente

- Ajustar por rival también el ritmo (hoy solo se encoge) y los jugadores del Scouting (siguen contra la liga entera).
- Rotación, banca, faltas tempranas y clutch por jugador: igual que en el punto 148, necesitan el paquete `pbp`.

---

## 150. EL SCOUTING EN BENTO GRID · BARRAS DE DIFERENCIAL Y DE PROGRESO (2026-10-27)

Assets en `?v=320`. Solo presentación: ningún cálculo cambió. Revisado en el navegador sobre la demo; **no commiteado hasta la validación del club**.

- **Duelos cruzados**: una tarjeta por factor, con dos barras de diferencial (ataque propio menos la defensa que enfrenta, en puntos porcentuales; verde si el ataque supera a esa defensa) y una barra del balance en puntos del margen. El número va siempre escrito. Clases `.dbar` (centrada en cero) y `.vbar` (progreso con la marca de la meta), a mano en el `<style>` y con variante de papel.
- **Volúmenes de umbral**: mini-tarjetas con barra hasta la meta (marca blanca al 2/3), brecha escrita y estado en palabras («En zona positiva», «Bache crítico», «Dentro del tope», «Pasa el tope»).
- **Se fue la línea «Margen proyectado del modelo del Simulador»** de la card de duelos. Las 3 cosas la siguen trayendo en su primera directiva.
- **Mapa de tiro en Scouting** (`fijo`): la tabla de zonas pasó a chips `.pbp-zona-chip` con la barra de desvío del PPT contra la liga; mantienen `data-pbp-zona`, así el enlace con la cancha y los tiros no cambia (y el teclado los activa). Las listas de zonas a explotar / ineficientes son tarjetas de alerta con el delta de PPT. Equipos conserva la tabla.
- **Rendimiento por cuarto**: una tarjeta por cuarto con el Net rating (o la diferencia de puntos sin el detalle del paquete) como barra centrada, para el rival y para nosotros. Se fue la macro-tabla.
- **Sin nombres de jugadores en las cards macro**: «Dependencias de uso» dice cuánto concentra el ataque sin nombrar, y las 3 cosas y el FODA remiten a «su amenaza principal (ver la tabla de marcas)». Los nombres viven en las marcas, Jugadores y Fichajes.
- **Rotaciones · minuto a minuto** es una card propia de Scouting (`pbp-rotaciones`, opción del modal), entre la de Quintetos y la del Mapa de tiro. Tipo nuevo `rotaciones` en `SGADD_PBP.espacio` y `rotacionesCard`.
- **Reloj de posesión**: sus barras ya eran la comparación ataque / defensa con el trazo de la competencia; **no se tocaron en esta entrega**.
- Tests: `test-pbp.js` (313), `test-diagnostico-rival.js` (61) y `test-muestra.js` con la nueva versión.

---

## 151. SCOUTING v320 · NOMBRES DE VUELTA, FODA SIN HUECOS Y PÉRDIDAS LEGIBLES (2026-10-27)

Assets en `?v=320`. Revierte el anonimato de la v319 (punto 150) y arregla lo que el club marcó. **Sin commitear hasta la validación.**

- **Dependencias de uso**: el Top 3 de jugadores que más plays concentran, con nombre, en el formato `[Nombre] · X Plays · Y% USG`. En el resto del plantel el orden de la línea pasó a MIN · PLAYS · USG% · PTS.
- **Las 3 cosas y el FODA nombran a la amenaza** (ya no remiten a la tabla de marcas).
- **FODA · Fortalezas**: si ninguna métrica pasa el percentil 70, se muestran las tres más altas del rival desde el 55 (`scoutFortalezasAltas`, con su percentil y la liga). Cada casilla vacía dice una lectura (`SIN_ITEM_FODA`) en vez de «Sin datos del box score».
- **Duelos**: cada lado dice «✓ a favor» o «✗ en contra» con palabras (se fueron las flechas ▲▼, que en pérdidas confundían) y, en la tasa de pérdidas, «menos es mejor».
- **No hecho**: la redistribución hacia las cards de Equipo (General, Personalidad, Diagnóstico) no cambió: esas pestañas ya muestran lo que el equipo hace bien con la misma fuente (`SGADD_CONCLUSIONES`). Se hace aparte si el club lo define.
- Tests: `test-diagnostico-rival.js` (63).

---

## 171. LO SIMULADO CONTRA LO QUE PASÓ · las predicciones congeladas y la calibración (2026-11-09)

Assets en `?v=365`. `test-predicciones.js` fija todo, sobre el snapshot de la demo. Es el primer paso de la auditoría del simulador contra el dossier de ensembles: antes de cambiar el modelo hay que poder medir si mejora.

```
js/sgadd-predicciones.js        PURO, compartido: candidatos, congelar, resultados, evaluar, cruzar, resumen
server/lib/predicciones.js      KV · sgadd:predicciones:<torneo>:<zona>, un campo por partido, HSETNX
server/rutas/predicciones.js    GET /api/cron/predicciones (CRON_SECRET o ADMIN, ?simular=1)
                                GET /api/v1/predicciones/:torneo/:zona (solo ADMIN)
server/vercel.json              cron «0 11 * * *» (08:00 AR)
```

- **Por qué congelar y no recalcular**: el `backtest` (punto 148) re-predice con el modelo de HOY, así que un cambio de constante reescribe el pasado. Lo congelado lleva versión (`SGADD_PREDICCIONES.VERSION`, hoy `v318`; subirla cuando cambie la sección 7 de `sgadd-4factores.js`), fecha y lo que el modelo sabía, y no se reemplaza nunca.
- **El cron**: torneos del catálogo con fuente de fixture, zonas regulares con libro (no las interzonales). Lee el fixture con `partidosDe` (el de las alertas), toma los programados de hoy a +2 días, y solo si hay alguno lee el libro. Arma el índice de la fase REGULAR (`indiceRegular` de `llave.js`, el mismo con que el Simulador proyecta una eliminatoria, punto 161), cruza los nombres con `cruzarConLibro` y los alias de la zona del catálogo, y congela `simularEnfrentamiento`. Un partido que no cruza, que ya está en el libro o que el simulador no puede proyectar se omite con su motivo.
- **El resultado real** (`resultadoDe`): el mismo cruce con la MISMA localía (al revés es la vuelta), a 3 días o menos (el libro corrido, punto 71). Con dos a la misma distancia no se elige.
- **Qué se mide** (`resumen`): MAE, RMSE y sesgo (+ = sobreestima al local), acierto contra «siempre gana el local», cobertura del P10-P90 (calibrado ≈ 80 %), Brier contra 0,25, calibración por la confianza en el favorito, y por equipo desde SU lado con sus últimos 4 (un ciclo). Con menos de 10 evaluadas se muestra con aviso de muestra corta.
- **La card** «📈 Calibración del modelo», al pie del Simulador (solo admin): pide lo congelado de la zona de la planilla (`torneoId`/`zonaId`) y lo cruza con `idxTemporada()`, así un playoff también se evalúa. Una categoría sin torneo lo dice.
- `sgadd-4factores.js` y `sgadd-predicciones.js` se sumaron a `server/lib/compartido/` (el cron congela con el mismo modelo que dibuja el panel).
- Medido en la demo, congelando día por día con el libro hasta el día anterior (26 partidos): MAE 9,0 · acierta el ganador 69 % · P10-P90 cubre el 85 %.

### Los cruces entre zonas (2026-11-09)
En una postemporada interzonal (APB) el rival no está en el libro de la zona y `planificarZona` lo deja pendiente. Un segundo pase por torneo (`planificarEntreZonas`, salida `zona: 'entre-zonas'`) arma el índice con los libros de TODAS las zonas regulares (`hojasDeTorneo`: une las columnas, las filas TIPO solo de la primera zona) y proyecta esos cruces. El registro lleva `entreZonas` y `zonas`, y se guarda con HSETNX en la clave de las DOS zonas: cada club lo ve en su card.
- **Límite del modelo:** en la fase regular las zonas no se cruzan, así que no hay datos que conecten sus niveles; el modelo las trata como una sola liga.
- **El resultado de un cruce entre zonas se lee desde un solo lado** (`resultados`): en el libro de la zona el rival de otra zona no es un equipo de la lista (punto 169), pero la fila propia trae PTSopp y el texto del cruce lo nombra. Sin PTSopp no se inventa.
- **Solo en un torneo que declara una fase `cruce: 'interzonal'`** (`cruzaZonas`): en Formativas las «zonas» son categorías (U21, U23) que nunca se cruzan. Y si dos zonas comparten un equipo, no se mezclan (son categorías distintas del mismo club).
- Un lugar a definir («Ganador Partido A») o un equipo de otra categoría siguen sin cruzar y se omiten.

### Lo que NO hace todavía
- **No corrige el modelo con sus errores.** El sesgo por equipo queda a la vista; usarlo como corrección encogida es el paso siguiente, cuando haya muestra (decenas de partidos congelados por zona).
- Un partido que la fuente publica recién el mismo día después de las 08:00 AR no se congela (el cron corre una vez).
- **No verificado contra el catálogo real ni en el navegador**: probado con KV, fixture y libro de mentira sobre la demo.

### Para producción
1. Deploy del backend (`cd server && npx vercel --prod`): la ruta, el cron y los compartidos nuevos.
2. Push del front (`?v=365`).
3. Primera mirada con un token de admin: `GET /api/cron/predicciones?simular=1`.

## 172. LAS BAJAS DEL BUZÓN EN EL SIMULADOR · valor sobre reemplazo (2026-11-09)

Assets en `?v=367`. `js/sgadd-4factores.js` (`impactoBajas`, `reemplazoLiga`, `plantelDe`, constantes `BAJAS`) y su copia en `server/lib/compartido/`. `test-bajas.js` (45) fija todo, sobre la demo y planteles armados a mano.

- **De dónde salen**: los jugadores del cruce que el buzón marca 🟡 SUSPENSO o 🔴 BAJA (`SGADD_BUZON.estadoDe`). Un ALTA juega. Se aplican solas y el DT las apaga con «Aplicar las bajas del buzón».
- **El modelo de equipo no se toca**: `predecirCruce(…, { ajustes })` mueve ORTG/DRTG sobre una COPIA de cada equipo y el Monte Carlo corre con eso. Sin bajas, la proyección es byte a byte la de antes.
- **Ataque · VORP**: la parte de las jugadas del equipo que termina el ausente (`repartirUso`, uso × minutos, el quinteto suma 100 %) pasa a valer lo que rinde su REEMPLAZO: mitad los compañeros que absorben sus minutos, con su PPP y la curva de uso (−0,01 por jugada por punto de USG% extra, prior de Oliver), y mitad el nivel de reemplazo de la liga (mediana de PPP de los que no califican). Sin esa mitad, el goleador de bajo PPP «mejoraba» al equipo al faltar: el box no ve la jugada que él inventa. Δ pts/jugada × jugadas por posesión × 100 = ΔORTG.
- **Los minutos** van a la rotación con peso `min × (40 − min)` (absorbe más el sexto hombre que el titular de 36), techo de 40.
- **Defensa**: recuperos + tapones + medio rebote defensivo por minuto del ausente contra los que heredan sus minutos → posesiones rivales que se dejan de cortar × PPP de la liga. **Pesa la mitad** (`PESO_DEFENSA`): la planilla solo ve la defensa que corta la posesión.
- PPP y tasas por minuto se **encogen** hacia el nivel de reemplazo con 40 jugadas / 60 minutos de la liga.
- **Escala**: el efecto × (sus PJ / PJ del equipo). Si ya faltó la mitad de la temporada, la mitad de su ausencia ya está en el rating.
- **Con la capa `pbp`**: el On/Off del jugador (`SGADD_PBP.onOffDe`) entra como Δnet = −(min/40) × (Net con él − Net sin él) × escala, mezclado con el box con peso min(con, sin) / (min(con, sin) + 300 min). Se reparte entre ataque y defensa como el box. Se pide una vez por equipo y repinta al llegar.
- **Una baja nunca mejora al equipo**: si el box dice que sí, no se ajusta y el badge lo dice («el box score no le mide un costo»).
- **Varias bajas no se suman**: el box se evalúa con todos afuera a la vez y el ajuste del On/Off de cada uno se suma encima.
- **El badge** (cabecera del cruce): «⚠️ Ajustado por baja de [Jugador] ([equipo] · motivo del buzón): −X,X pts en margen», con ORTG/DRTG en el `title`, a quién van sus minutos y el margen sin y con las bajas. Margen por jugador = posesiones del cruce × su Δnet / 100, desde el lado de su equipo.
- Medido en la demo, el jugador de más uso de cada equipo: de 0 (sin costo medible) a −4,3 de Net por 100 posesiones.

### Lo que NO hace
- **Las predicciones congeladas del cron (punto 171) no usan bajas**: el servidor no lee el buzón de cada club. La calibración mide el modelo sin ellas.
- Los duelos del Scouting llaman al simulador sin bajas.
- Quintetos combinados (qué pasa con LOS CINCO sin él) no: el paquete trae el On/Off individual, no alineaciones contrafácticas.
- **No verificado en el navegador**: el Simulador es de admin y la demo entra como PLATA; la pantalla se ejerció en un `vm`.

