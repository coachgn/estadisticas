# Centro de Mando y contenido

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 103. `generar-contenido.js` · LOS NÚMEROS DEL CONTENIDO DE REDES (2026-10-12)

Se corre a mano, como `generar-demo.js`. Lee un libro con la credencial
local (catálogo de KV + Service Account), arma el índice con el núcleo y
escribe `stories.json`, `feed.json` y `resumen.md` en
`contenido/<liga>-<zona>/<día>/` (en `.gitignore`: el repo es público).

    node generar-contenido.js --liga apb --zona a|b|c [--desde --hasta] [--fecha-n N] [--feed ro] [--anonimo]
    node generar-contenido.js --liga lnb
    node generar-contenido.js --liga lab --zona norte|sur

- **STORIES**: el «Top 3 de la fecha» de la plantilla de la cuenta (portada,
  cinco rankings, cierre con el quinteto ideal). Cada categoría ordena por
  VOLUMEN de la noche y después por EFICIENCIA (`CATEGORIAS[].orden`), con
  piso de 10 minutos. Contrastado con las placas publicadas de la fecha 20
  de la Zona A: los mismos puestos en las cuatro categorías que se vieron.
- **FEED**: por categoría, los tres de la noche contra su temporada y los 10
  de más volumen contra la mediana de eficiencia de los calificados. Propone
  la de mayor contraste; `--feed` la pisa. El fondo de eficiencia sale SIN
  nombre («Caso 1») también en APdeB.
- **LOS NOMBRES SOLO SALEN EN APdeB** (decisión del club, 2026-10-12;
  `LIGAS[].nombres`). LNB y LAB se anonimizan y `verificarAnonimo` lanza si
  queda un nombre del libro en la salida. `--con-nombres` fuera de APdeB se
  rechaza. No hay formativas en `LIGAS`.
- **La fecha se INFIERE** de los días con partidos (hueco de hasta 3 días =
  misma fecha) y se avisa: una reprogramación la corre, así que `--fecha-n`
  y `--desde/--hasta` mandan. Con calendario continuo (LNB) toma la última
  semana.
- Un partido con el box truncado (punto 66) queda afuera, con aviso. Con
  menos de tres candidatos sale el aviso, no un ranking a medias.
- La foto del jugador no sale del libro: se pone a mano en la plantilla.
- `test-contenido.js` corre sobre el snapshot de la demo, renombrado para
  que una fuga de nombres se pueda ver.

## 104. EL NIVEL 2 DEL CONTENIDO · LAS DIEZ RECETAS (2026-10-12)

    node generar-contenido.js --liga apb --zona b --nivel2
    node generar-contenido.js --liga lnb --piezas CR-01,RL-03
    node generar-contenido.js --liga lab --zona norte --piezas RL-01 --pbp <carpeta de paquetes>

Con `--nivel2` o `--piezas` el script escribe `nivel2.json` y `nivel2.md`
en vez de las Stories. Cada receta es pura y devuelve `{ id, ok, dato,
datos, guion, muestra }`, o `ok: false` con su motivo.

| Pieza | Sale de | Qué cuenta |
|---|---|---|
| CR-01 | `e.totales` y `RTNG OFF` del núcleo | equipos que cambian de puesto entre ORTG por jugada y por posesión |
| CR-02 | `SGADD_SCOUT.senales().amenazaExteriorPrimaria` | tiradores rentables que anotan menos que la mediana |
| CR-03 | `senales().faltaRentable` | con cuántos de los que van a la línea la falta es negocio |
| CR-04 | `percentil` del núcleo + `SGADD_NIVELES.definicion` | en qué percentil cae una vara fija en ESTA liga |
| CR-05 | `SGADD_COMP.ciclos` y `comparar` | ciclo ganador con el eFG% en baja, y su puesto en NET |
| CR-06 | `jugadoresAdnLiga` y `jugadoresSimilitud` | el de más uso contra sus tres perfiles afines de otros equipos |
| RL-01 | `quintetos` del paquete | quintetos que ganan en cancha y dan negativo por jugada |
| RL-02 | `clutch` y `tiros.detalle` | equipos donde el de más usos en el cierre no es el que más tira |
| RL-03 | `liga.familias` y `liga.zonas` | puntos por tiro por zona, de toda la liga |
| RL-04 | `cuartos` y `momentum` | peor cuarto de cada equipo y parciales de 8+ en contra |

- **Las RL leen los paquetes de `motorstats-ingestion/salida/<liga>/web`**
  (`LIGAS[].zonas[].pbp`, o `--pbp`). `MOTORSTATS_INGESTION` cambia la
  carpeta base.
- **EL PLAY-BY-PLAY NO SE PRESTA NI SE CRUZA ENTRE LIGAS** (decisión del
  club, 2026-10-12, que revierte la de ese mismo día). Una liga sin
  paquetes propios deja a sus RL en `ok: false` con «Sin datos de PBP para
  esta liga.» (`SIN_PBP`). `--pbp` cambia la CARPETA de una liga que
  declara el suyo; a una que no declara no le da uno. Para los reels se
  elige la liga que sí lo tiene: `--liga lab25` (Conferencia Norte 25/26,
  libro `jujuy/jujuy-primera` + paquetes `conferencia-norte`) o `--liga lnb`.
- **CR-02 exige 3 triples intentados por partido** (`PISO_TRIPLES_CASO`):
  con 1 por partido, 1,80 por intento es una noche.
- **El caso de RL-01 es el quinteto de MÁS MINUTOS** entre los que ganan en
  cancha y dan negativo por jugada, no el de mayor salto.
- **RL-04 abre con el mayor parcial SIN RESPUESTA** («29-0»: la ingesta
  arma las corridas así) y la corrida promedio que recibe un equipo por
  partido. El reparto por cuartos queda como dato secundario.
- **SALEN ANÓNIMAS SIEMPRE, también en APdeB**, salvo `--con-nombres` (que
  solo APdeB acepta). La guarda suma los nombres de los paquetes a los del
  libro. Las recetas ponen a toda persona bajo `jugador` y a todo club bajo
  `equipo`; ningún `dato` lleva un nombre, y el `guion` (plantilla fija) no
  se revisa.
- **CR-03 mide sobre TODOS los que van seguido a la línea**:
  `faltaEvaluable` ya viene recortado a los de menos de 58 % y daba 100 %.
- **RL-02 compara contra el que más TIRA en la temporada**, no contra el de
  más usos: el paquete no trae los usos de temporada.
- **Una receta sin caso lo dice** (CR-05 sin ciclo ganador en baja, CR-06
  sin tres afines, RL-01 sin quintetos que cambien de lectura).
- El índice declara el nivel de la liga (`LIGAS[].nivel`) antes de armar
  los perfiles, así las señales usan la vara de esa competencia.
- Verificado al revés: sin el piso de quinteto caen 4 tests, CR-01 sin
  posesiones 2, el equipo sin rotular 5, sin el piso de minutos 4 y CR-03
  con el universo recortado 2.

## 105. EL CENTRO DE MANDO EDITORIAL · LOCAL (2026-10-12)

    node centro-mando/servidor.js        →  http://127.0.0.1:8770

Pantalla para elegir liga, zona, formato y eje táctico y recibir las
propuestas sin pasar por la terminal. `test-centro-mando.js` fija todo.

```
centro-mando/motor.js      PURO: propuestas, ganchos, aprendizaje, placas HTML
centro-mando/servidor.js   Express (el de server/node_modules), solo 127.0.0.1
centro-mando/index.html    la página, sin dependencias
```

- **Es LOCAL a propósito** (decisión del club): lee los libros con
  `server/.env`, como `generar-contenido.js`. No hay endpoint en Vercel ni
  sección en el panel. La página queda publicada en Pages porque el repo es
  público, pero sin el servidor local no hace nada (y lleva `noindex`).
- **No calcula.** Pide los números a `GC.armarNivel1` / `GC.armarNivel2`,
  que son el MISMO camino de la línea de comandos: anonimizan y verifican
  antes de devolver. El servidor no llama a `nivel2()` ni a `paquete()`
  directo; hay test.
- **Sin LLM ni búsqueda web.** Los tres ganchos por pieza (dato, titular,
  pregunta) se arman con frases de la propia receta: ningún gancho trae un
  número que no esté en ella (test). La pregunta sale del guion; si no hay,
  ese estilo no se inventa. El «contexto de tendencia» es un campo que
  escribe quien opera y viaja a la exportación rotulado como manual.
- **Formatos**: Stories (solo APdeB: van con nombre), feed, carrusel y
  reel. Un reel de una zona sin play-by-play sale deshabilitado en el
  selector y el servidor lo rechaza igual (punto 104).
- **Nombres**: Nivel 1 de APdeB con nombres por defecto, Nivel 2 anónimo;
  fuera de APdeB la casilla está deshabilitada y `resolverPedido` lo rechaza.
- **Aprendizaje** (`contenido/aprendizaje.json`, en .gitignore: NO tiene
  respaldo en git): se carga A MANO lo que muestra Instagram. Puntaje =
  (compartidos×4 + guardados×3 + comentarios×2 + me gusta) cada 100 de
  alcance. El peso de un formato, una pieza o un estilo de gancho es su
  puntaje sobre la media, acotado a [0,5 ; 2], y **con menos de 3
  publicaciones medidas vale 1**. Reordena, no filtra.
- **«Destacadas de la fecha»** (`M.AUTO`, el formato por defecto): todo lo
  que la zona puede dar, junto. Las diez piezas de Nivel 2, las Stories si
  la liga va con nombres, y del feed SOLO los posteos con `contraste > 0`
  (con 0 no hay anomalía que contar), del mayor al menor. Elegir liga,
  zona, formato o eje **genera solo**, con 350 ms de espera y una guarda
  de turno para que una respuesta vieja no pise a la nueva.
- **El visor**: cada propuesta trae sus placas a escala en un `<iframe
  sandbox srcdoc>`, y cambiar el gancho o el contexto las repinta.
  `POST /api/placas` devuelve el MISMO HTML que escribe «Aprobar»
  (`placas()` en el servidor es el único que lo arma; hay test). Las
  Stories con nombres usan la plantilla diseñada de
  `contenido/placas/generar-stories.js` (exporta `html`; fuera del repo:
  si no está, cae a la genérica). El resto usa la GENÉRICA: portada con el
  gancho y una placa por línea del guion. `generar-placas.js` NO se
  invoca: sus tres piezas tienen el texto escrito a mano y mostrarían
  números viejos.
- **«Aprobar»** escribe en `contenido/centro-mando/` el JSON, el guion y
  el HTML; anota la pieza en `aprendizaje.json` como `aprobada` **sin
  métricas** (no entra a las ponderaciones hasta que se le cargan con
  «Cargar métricas» → `M.medir`); y la deja en `cola-canva.json`. Aprobar
  la misma pieza el mismo día reemplaza, no duplica. La fecha es la del
  día LOCAL (`diaLocal`): con `toISOString()` a las 21 h quedaba fechada
  mañana.
- **LA IMPORTACIÓN A CANVA NO SALE DE LA PÁGINA.** El servidor no tiene
  credencial de Canva ni dónde publicar el HTML para que Canva lo lea. La
  cola se procesa desde una sesión de Claude con el conector (publicar en
  Pages, importar, borrar), con confirmación antes de publicar. Hacerlo de
  un clic pide una integración propia con la API de Canva (OAuth) y un
  lugar público para los HTML: no está hecho.
- **Instagram tampoco se lee**: alcance, guardados y compartidos se cargan
  a mano.
- El libro se guarda 10 minutos por zona en la memoria del proceso;
  «Volver a leer el libro» lo fuerza.

## 106. EL CENTRO DE MANDO, REDISEÑADO · bandeja, Explorador táctico y enfoque/tono (2026-10-12)

Cuatro pestañas sobre una liga y una zona elegidas arriba:
📥 Bandeja · 🔬 Explorador táctico · 🎛 A medida (el flujo del punto 105) ·
📈 Aprendizaje. Sigue siendo LOCAL y SIN LLM: lo que el pedido original
llamaba «agentes» son funciones deterministas, y la página lo dice.

```
centro-mando/explorador.js   PURO: tabla por nivel, entre zonas, anomalías, hallazgo → propuesta
centro-mando/motor.js        suma ENFOQUES, TONOS y la bandeja (armar, cambiar enfoque/tono, marcar)
centro-mando/servidor.js     /api/explorar · /anomalias · /bandeja · /bandeja/accion · /laboratorio
```

### El Explorador

- **Cuatro niveles**: jugadores, equipos, comparativa entre zonas (la
  MEDIANA de los equipos de cada zona; pide dos zonas con libro) y partidos
  (un equipo en una noche).
- **No hay métrica propia**: equipos por `idx.leer` (ORTG/DRTG por
  posesión, punto 66), jugadores y partidos por su fila. El Explorador
  filtra, ordena y compara.
- **Las métricas son las del libro.** «Puntos tras pérdida» y «segunda
  oportunidad» no están en ninguna hoja, y la eficiencia por zona de tiro
  solo existe con play-by-play (RL-03): se listan como NO DISPONIBLES en
  vez de ofrecerse.
- **El que no tiene el dato queda afuera y se cuenta** (`sinDato`), como
  en Fichajes. **El porcentaje no viaja solo**: ordenar o filtrar por T3%
  suma T3I a las columnas.
- **Los porcentajes se escriben como 35**, no 0,35.
- **EL ÁNGULO NO SE INTERPRETA.** No hay lenguaje natural: lo que se
  escribe ahí es el TÍTULO de la propuesta. Lo que decide son las métricas,
  el orden y hasta tres condiciones. Un parser de texto libre que entienda
  mal devuelve una tabla plausible y equivocada.

### Las anomalías (`E.anomalias`)

| | Regla |
|---|---|
| ⬆ Puntos altos | noches de la última fecha con MIN ≥ 10, z ≥ 1,5 contra su propio promedio **y** sobre el PISO de la métrica (`PISO_NOCHE`: 18 PTS, 6 AST, 5 RO, 8 RD, 4 T3C); más rachas de 3+ |
| ⬇ Puntos de fuga | la métrica más floja de cada equipo (`METRICAS_FUGA`), si cae en el percentil 25 o menos de su zona |
| ⇄ Entre zonas | métricas donde las medianas se separan ≥ 0,5 desvíos del conjunto de equipos |

**El piso es la mitad de la regla**: sin él, al que promedia cero triples
UNO le daba z de 5,6 (su media está hundida por las noches sin minutos,
punto 3 ter). Los puntos de fuga son de EQUIPO; de jugador no hay.

### Del laboratorio a la bandeja

`POST /api/laboratorio` arma la propuesta (`E.aPropuesta`), la pasa por
`GC.anonimizar` + `GC.verificarAnonimo` contra los nombres de todos los
libros leídos y recién ahí la guarda. **Sale anónima siempre**, también en
APdeB. Un ángulo que nombre a un club del libro hace fallar la verificación.

### La bandeja (`contenido/centro-mando/bandeja.json`, una por liga-zona)

- Se arma al abrir la pestaña si no hay una o si tiene más de 14 días, y
  con «Rearmar». **No hay un proceso de fondo ni propuestas que «lleguen»**.
- Entran las Stories (si la liga va con nombres) y hasta 6 piezas
  repartidas entre ataque, defensa y faltas (`ENFOQUE_DE`); el resto con
  datos queda en RESERVA. Rearmar conserva lo pendiente del laboratorio.
- **🔄 Cambiar enfoque** cambia la PIEZA por la primera de la reserva del
  enfoque que sigue; la que sale vuelve a la reserva. Sin reserva lo dice.
- **🌶️ Ajustar tono** (Táctico → Polémico → Educativo) elige qué gancho va
  primero (dato / titular / pregunta) y la píldora de la portada. **No
  reescribe el texto**: no hay quien lo redacte.
- **✅ Aprobar** es el `aprobar` del punto 105 (archivos, cola de Canva,
  historial) y además anota enfoque y tono; el aprendizaje los agrupa.

### Verificado

En el navegador contra los libros reales de APdeB: bandeja de Zona B (7
pendientes, 3 en reserva), cambio de tono y de enfoque, anomalías, el
filtro «T3% con menos de 15 minutos y al menos 1 triple intentado» (30 de
235), la comparativa de las tres zonas y un hallazgo mandado a la bandeja
y aprobado, con su tabla anónima en la placa. Sin captura de pantalla.

## 107. LOS AGENTES CON CLAUDE EN EL CENTRO DE MANDO (2026-10-12)

Decisión del club: sumar la API de Claude al servidor LOCAL para dos
trabajos —interpretar la pregunta táctica y redactar— con una condición:
**la extracción de datos sigue 100 % en las funciones locales**.
`centro-mando/llm.js`; lo fija `test-centro-mando.js` con un cliente
simulado.

### Configurar la clave

    cd centro-mando && npm install        # una vez: @anthropic-ai/sdk y zod
    copiar .env.ejemplo como .env y pegar ANTHROPIC_API_KEY
    node centro-mando/servidor.js

`centro-mando/.env` y `centro-mando/node_modules/` están en .gitignore.
El modelo es `claude-opus-5-5`; `CENTRO_MANDO_MODELO` lo cambia. **Sin
clave el Centro de Mando funciona igual** (plantillas y filtros a mano) y
el encabezado dice «IA apagada». Las dependencias viven en
`centro-mando/package.json`, no en `server/`: el backend de Vercel no
las necesita.

### Qué hace el modelo, y qué no

| | Entra al modelo | Sale del modelo | Quién pone los números |
|---|---|---|---|
| **Pregunta táctica** (`interpretar`) | la pregunta y el CATÁLOGO de métricas; ni una fila del libro | un PEDIDO del Explorador (nivel, métricas, orden, condiciones) | `E.explorar`, local |
| **Redacción** (`redactar`) | UNA pieza ya calculada y el tono | título, tres ganchos y el guion | la receta; el modelo solo los repite |

### Las guardas, todas DESPUÉS de la respuesta

No se confía en el prompt: cada una se verifica en código.

- **Numérica** (`numerosAjenos`, pura): todo número del texto tiene que
  estar, tal cual, en la pieza (coma o punto dan igual; 58 no vale por
  58,3 ni «casi 60»). El gancho que trae uno ajeno se descarta; el título
  vuelve al del generador; UNA línea del guion con un número ajeno tira el
  guion entero. La tarjeta dice cuántos textos descartó.
- **El DATO no se reescribe nunca** (`aplicarRedaccion` no lo toca), ni
  `datos` ni `muestra`.
- **Anonimato**: una pieza anónima se manda ANÓNIMA, así que el modelo no
  recibe un nombre que filtrar; igual, si la redacción de una pieza
  anónima nombra a alguien del libro, se descarta ENTERA
  (`redactarItem` + `GC.verificarAnonimo`). Las Stories y el feed de
  APdeB van con nombres, como siempre.
- **La traducción de la pregunta no se degrada en silencio**: si el modelo
  pide una métrica de orden o una condición que el catálogo de ese nivel
  no tiene, `E.pedido` la descartaría y la tabla contestaría OTRA
  pregunta; `preguntar` lo detecta y rechaza. Lo que no está en ningún
  libro vuelve como `sePuede: false` con el motivo.
- **Lo que entendió queda a la vista**: la consulta se vuelca en los
  controles del laboratorio («Entendí: …») y se puede corregir a mano.

### La bandeja

- Al pintarse, cada pieza pendiente sin redacción de su tono se le pide a
  Claude (de a tres a la vez) y su tarjeta se cambia sola. **Una vez por
  pieza y tono**: se guarda en `bandeja.json` (`item.redacciones[tono]`,
  con `item.base` = la pieza del generador) y no se vuelve a pagar.
- **🌶️ Ajustar tono** ahora reescribe: parte SIEMPRE de `base`, no de la
  redacción anterior. Volver a un tono ya redactado lo repone sin pedirlo.
- Los ganchos de la IA van primero; los del generador quedan detrás,
  elegibles. Si la IA falla, queda la plantilla y la tarjeta lo dice.
- `redactarItem` relee la bandeja DESPUÉS de esperar al modelo: varias
  redacciones corren a la vez y cada una pisaría una foto vieja.
- El historial anota `redaccion: 'ia' | 'plantilla'`.

### Lo que hay que respetar al tocarlo

- **SDK oficial** (`client.beta.messages.parse` + `betaZodOutputFormat`),
  con `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`).
  En Opus 5.5 el razonamiento está siempre activo: NO mandar `thinking`,
  `temperature` ni `tool_choice` forzado (dan 400); se regula con
  `output_config.effort` (`low` para interpretar, `medium` para redactar).
- **Los tests no llaman a la API**: `deps.cliente` inyecta uno simulado, y
  `CENTRO_MANDO_DATOS` manda la bandeja y el historial a una carpeta
  temporal. Ningún test toca `contenido/`.
- **El motor de todos los días ya no es éste: es Claude Code (punto 108).**
  La API quedó de resguardo, apagada sin clave.
- **NO VERIFICADO CONTRA LA API REAL**: el 2026-10-12 no había clave en la
  máquina. Verificado: la forma del pedido contra los tipos del SDK
  0.133, las guardas, y la pantalla con la IA apagada.
- Sigue sin haber búsqueda web ni «agente de tendencias»: el contexto de
  tendencia lo escribe quien opera.

## 108. CLAUDE CODE COMO MOTOR DE REDACCIÓN, SIN API PAGA · y `/agencia` (2026-10-12)

El plan Pro y la API de desarrollador se cobran por separado, y el club no
quiere sumar un costo de API. Decisión: **el servidor redacta con
`claude -p`**, o sea con la sesión de Claude Code que ya está iniciada en
la máquina. La API del punto 107 queda de **resguardo, apagada** salvo que
haya `ANTHROPIC_API_KEY` en `centro-mando/.env`.

### El motor (`LLM.motor()`)

```
sin clave  →  claude-code   (si el comando «claude» está en la máquina)
con clave  →  api           (el resguardo no se enciende solo)
CENTRO_MANDO_MOTOR = cli | api | no   lo fuerza
```

`pedirPorCli` ejecuta:

    claude -p --safe-mode --tools "" --strict-mcp-config --no-session-persistence
           --output-format json --effort <low> --system-prompt <…> --json-schema <…>

con la pieza por la **entrada estándar** y en una **carpeta vacía** del
temporal del sistema.

- **`--safe-mode` y la carpeta vacía no son prolijidad**: en el repo, cada
  llamada cargaría este CLAUDE.md entero (lento y caro) y los conectores
  del usuario. Así es texto que entra y JSON que sale.
- **`--bare` NO sirve**: exige API key y saltea el login del plan.
- **Sin herramientas** y sin saltear permisos: el modelo no puede leer ni
  tocar nada. Hay test.
- **De a una** (`enFila`): cada llamada levanta un proceso y gasta del
  plan. Techo de 120 s.
- El esquema va como JSON Schema escrito a mano (`ESQUEMAS_JSON`); un test
  exige que nombre los mismos campos que los de Zod del SDK.
- El modelo es el de la configuración de Claude Code del usuario
  (`CENTRO_MANDO_MODELO_CLI` lo cambia); la respuesta dice cuál fue.
- Un error o el límite de uso del plan se dice y la pieza queda en plantilla.

### Medido el 2026-10-12, en esta máquina (claude 2.1.227, plan del usuario)

```
llamada mínima de prueba                 11 s
interpretar una pregunta táctica         12 s
redactar una pieza · esfuerzo medium     50 s
redactar una pieza · esfuerzo low        18 a 23 s   ← el que quedó (CENTRO_MANDO_ESFUERZO)
```

Probado de punta a punta desde la pantalla con el libro real de APdeB
Zona B: «Redactar con IA» sobre CR-02, 23 s, guarda limpia, dato intacto.
La pregunta del ejemplo se tradujo bien, y «puntos tras pérdida» volvió
como «no se puede».

### La redacción es A PEDIDO

Ya no se redacta sola al abrir la bandeja: cada tarjeta tiene **✍️ Redactar
con IA**, una llamada por pieza y tono, que queda guardada. **🌶️ Ajustar
tono** vuelve a ser instantáneo (cambia el orden de los ganchos y la
píldora) y deja el botón de redactar listo para ese tono. Al cambiar de
zona las tarjetas viejas se van en el acto: un clic sobre una de ellas
mandaba su pieza con la zona nueva.

### LO QUE LA GUARDA NO VE

La guarda numérica comprueba que cada número EXISTA en la pieza, no que
esté bien usado. En la prueba real el modelo escribió «esa diferencia de
14 puestos» con un 14 que en la pieza era una diferencia de rating, y
pasó. Se reforzó el prompt (cada número conserva su unidad) y la tarjeta
de toda pieza redactada por IA dice que hay que leerla contra el dato
antes de aprobar. **La revisión humana no es opcional.** También puede
agregar una condición de volumen a una pregunta («al menos 2 triples»):
queda dicha en «Entendí:» y a la vista en los controles.

### La redacción que llega HECHA · `POST /api/bandeja/redactar` con `redaccion`

Una sesión de Claude Code puede escribir la redacción y mandarla. Pasa
por **las mismas guardas** (`LLM.filtrar` contra `LLM.piezaDe(base)` y el
anonimato) y no llama a ningún modelo. Es lo que usa `/agencia`, y es el
motivo por el que el comando tiene prohibido editar `bandeja.json` a mano.

### `/agencia` · `.claude/commands/agencia.md`

| | |
|---|---|
| `/agencia` | estado: qué hay en la cola de Canva y qué falta medir |
| `/agencia canva` | publica los HTML en `placas-tmp/`, espera a Pages, importa a Canva, marca la cola y BORRA la carpeta. Pide confirmación antes de publicar |
| `/agencia quincena <liga> <zona>` | arma la bandeja, redacta las piezas elegidas, muestra lo que rechazó la guarda y aprueba las que el usuario diga |

Corre en una sesión de Claude Code (terminal o app), que es donde vive el
conector de Canva: la página sigue sin poder importar. No está probado de
punta a punta: la importación real pide la confirmación del usuario.

## 109. LA NARRATIVA DE REFERENTE · placas dinámicas, copy y prompt alternativo (2026-10-12)

Pedido del club: que los agentes escriban como **referente y analista
táctico de autoridad**, con la estructura y la línea gráfica del carrusel
«PROBLEMA REAL» de la cuenta en Canva (*¿A qué velocidad se juega en La
Plata?*, diseño `DAHWBVml8X8`), que se leyó con el conector.

### Los cuatro momentos, y la cantidad de placas LIBRE

```
gancho      1     la tensión, la paradoja o el punto de quiebre
evidencia   1+    el problema y los números del libro, un concepto por placa
propuesta   1+    qué significa en cancha · es LECTURA, no un hecho medido
cierre      1     conclusión + pregunta que invita a comentar
```

Entre 4 y 10 (`MIN_PLACAS`, `MAX_PLACAS`), en ese orden:
`M.estructuraDePlacas`. El modelo decide cuántas según el tema; en las
pruebas reales dio 7 y 8 para CR-01.

- **Carrusel** → `placas` (`{rol, titulo, texto, destacado}`), `guion` vacío.
  **Reel** → `guion` con sus marcas de tiempo, `placas` vacío. **Stories** →
  ninguno: sus placas son los rankings diseñados.
- **Sin IA también hay placas**: `M.placasDe(p)` reparte el guion del
  generador en los cuatro momentos, sin agregar una palabra.

### Las guardas sobre lo nuevo (`LLM.filtrar`)

- El **texto, el título y el destacado** de cada placa y el **copy** pasan
  la guarda numérica. Una placa del medio con un número ajeno se SACA; si
  falla el gancho o el cierre, o lo que queda ya no tiene la estructura,
  se descartan todas y la pieza vuelve a su guion. Un copy con un número
  ajeno se descarta entero y queda el de plantilla.
- El anonimato se verifica también sobre placas y copy.
- `*así*` resalta en naranja SOLO en el título de una placa; en cualquier
  otro campo los asteriscos se sacan (el modelo los ponía en el copy).
- **La lectura táctica es opinión del analista**: el prompt la pide como
  lectura («esto te pide…») y prohíbe hechos sobre equipos, jugadores,
  planteles o canchas que la pieza no trae. El carrusel de referencia sí
  los tiene («bases con experiencia», «dimensiones de las canchas»):
  eso lo sabe quien lo escribió, no el libro, y ninguna guarda puede
  verificarlo. **Leer la propuesta antes de aprobar.**

### El copy y el prompt alternativo

- **Copy sugerido**: el de la IA (`p.copy`) o, sin IA, `M.copyPlantilla`
  (gancho, dato, pregunta, llamado a comentar y hashtags, todo de la pieza).
- **Prompt alternativo** (`M.promptDeCopy`): lo arma EL CÓDIGO, no un
  modelo. Lleva la pieza, las placas, los números de respaldo y la regla
  de no inventar números escrita adentro. Está siempre, con o sin IA.
- Los dos salen en la tarjeta con su botón de copiar (`POST /api/copy`), y
  al aprobar van al `.md` y al `.json` de la pieza.
- Desde el punto 110 los hashtags del copy los pone el código, no el modelo.
- El llamado a la acción es fijo: «Comentá «CONTEXTO»…» (`CTA_COMENTARIO`),
  el mismo del carrusel de referencia. Lo pone el diseño en la placa de
  cierre; al modelo se le dice que no lo escriba ahí.

### La línea gráfica de `placasHtml`

Azul noche `#0a1930` con el isotipo de marca de agua, esquinas celestes,
«MOTORSTATS AR» arriba, píldora naranja `#f5a623` en el gancho, barra
celeste `#74acdf` con texto oscuro por sección, tarjetas, flecha de
«seguí» y el pie «Link en Bio | @motorstats.ar» con el logo. Barlow
Condensed 800 en títulos, Barlow en el cuerpo. El cuerpo baja de tamaño
según el largo del texto (`cuerpoDe`). No reproduce los gráficos del
original (semáforos, flechas): eso sigue siendo trabajo de Canva.

### Medido

Redactar con placas y copy tarda **~43 s** por Claude Code (antes ~20 s:
escribe bastante más). En las pruebas reales los números salieron bien y
la guarda no descartó nada, pero el modelo volvió a llamar «puestos» a
una diferencia de rating: la clave de CR-01 pasó a llamarse
`diferenciaMaximaDeOrtgEntreLasDosVaras` para que diga qué mide. **Un
nombre de dato ambiguo en una receta es una invitación a ese error.**

## 110. «A MEDIDA» CON TEXTO LIBRE Y LA VOZ DE ENTRENADOR-ANALISTA (2026-10-13)

Dos pedidos del club: que «A medida» deje de estar atada a una lista de
métricas precargadas, y que la redacción deje de describir el número y
pase a interpretarlo. `test-centro-mando.js` fija todo lo de acá.

```
centro-mando/libre.js        PURO: el intérprete LOCAL del texto libre
centro-mando/explorador.js   suma el catálogo completo del libro y el cruce de dos métricas
centro-mando/servidor.js     POST /api/libre
centro-mando/motor.js        VOZ, CAPAS y ESTILO: una sola voz para el redactor y el prompt alternativo
```

### 1 · La idea libre · sin modelo

En «A medida» se escribe una métrica, dos para cruzar o una hipótesis
entera, y `LIBRE.interpretarLibre(texto, E.catalogo(idx))` la lleva a un
pedido del Explorador. **Es local y determinista: no llama a Claude**, así
que es instantáneo y no gasta del plan. La pregunta táctica con IA sigue
en el Explorador (punto 107).

- **EL CATÁLOGO ES EL DEL LIBRO** (`E.catalogo(idx)`): toda métrica del
  registro del núcleo con al menos un valor en ese nivel. Medido en la
  demo: 44 por jugador, 55 por equipo y 44 por partido, contra las 26, 18
  y 17 de la lista corta (`E.METRICAS`, que sigue siendo la de las
  casillas del laboratorio). `E.explorar` valida contra el catálogo
  completo; `E.pedido` sin libro, contra la lista corta. `VAL` y `+/-`
  quedan afuera (puntos 3 bis y 4).
- **Cómo lee**: siglas de la planilla tal cual («USG%», «drtg», «efg opp»);
  conceptos de cancha (`CONCEPTOS`: «ritmo», «corren», «pérdidas», «van a
  la línea»…) con candidatas EN ORDEN —«eficiencia» es ORTG en un equipo y
  PPP en un jugador—; y por parecido de raíz («reboteadores» → rebote),
  salvo las raíces de `RAIZ_AMBIGUA` («contra» abre «contrario», «genera»
  abre «general»).
- **NUNCA APROXIMA EN SILENCIO.** Cada cosa entendida viaja con la frase
  que la disparó y cómo se resolvió (sigla, concepto, parecido o
  APROXIMACIÓN). «Puntos de segunda oportunidad» usa el rebote ofensivo y
  lo dice; «suplentes» usa los minutos y dice que el libro no sabe quién
  arranca (la regla de titularidad del punto 9).
- **Lo que no existe se dice y no se inventa** (`NO_EXISTE`): altura,
  edad, posición, cuartos, clutch, quintetos, zona de tiro. Sin ninguna
  métrica reconocida, `ok: false` con cómo escribirlo.
- **Las condiciones** («menos de 15 minutos», «al menos 3,5 libres
  intentados») van con la métrica que tienen pegada después, o antes. Una
  sin métrica cerca NO se aplica y se avisa. El número es el que escribió
  quien opera: el intérprete no decide ninguno.
- **Un porcentaje sin piso de intentos se AVISA**, no se le inventa la
  condición: el aviso dice cómo pedirla.
- **El nivel**: el que se fuerza en el selector, el que nombra el texto, o
  jugadores si se habla de personas («tiradores», «suplentes»); si no,
  equipos. La lectura lo dice siempre.

### 2 · El cruce de dos métricas · lo único que el Explorador calcula

Con dos métricas, `E.explorar(..., { cruce: [a, b], grupo })` parte a los
que cumplen por la MEDIANA de cada una, cuenta los cuatro grupos y, con 8
casos o más (`MIN_CRUCE`), informa Pearson a dos decimales con su fuerza
(nula < 0,2 · débil < 0,4 · moderada < 0,7 · fuerte).

- La tabla es SOLO el grupo pedido (por defecto, altos en la primera y
  bajos en la segunda). El grupo lo lee el intérprete de la palabra
  pegada a cada métrica: «más»/«menos» van por el valor; «mejor»/«peor»
  se dan vuelta en una métrica invertida (peor defensa = DRTG alto). El
  selector de la pantalla le gana al texto.
- «Alto» y «bajo» son contra la mediana de ese grupo, no un juicio.
- Entre zonas no se cruza.
- La propuesta (`E.aPropuesta`) cuenta el grupo, las medianas, el n y la
  relación, y su guion trae la línea «que dos números se muevan juntos no
  dice cuál causa al otro».

### 3 · `POST /api/libre`

Devuelve `{ ok, lectura, consulta, resultado, propuesta, avisos }`. La
tabla va con nombres (es local, como la del Explorador); la propuesta sale
por `propuestaAnonima`, el mismo camino del laboratorio: anónima SIEMPRE y
verificada. Si el texto nombra a un club o a un jugador, la propuesta sale
con el título del generador y se avisa. Con `aBandeja: true` queda arriba
de la bandeja, que es donde se redacta con IA.

### 4 · La voz · interpretar, no describir

`M.VOZ`, `M.CAPAS` y `M.ESTILO` son UNA sola voz: las usa
`LLM.SISTEMA_REDACCION` y `M.promptDeCopy` (hay test que exige las mismas
líneas en los dos). Las capas que tiene que tener una pieza:

| Capa | Qué es |
|---|---|
| EL POR QUÉ | el mecanismo de juego detrás del número, como lectura general |
| EL DOLOR | qué decide a ciegas el cuerpo técnico que no lo mira |
| EL BENEFICIO | qué decide distinto el que lo domina |
| LA OTRA MIRADA | el ángulo que discute el sentido común de la categoría |
| PREGUNTAS DISPARADORAS | de auditoría, contestables mirando al propio equipo |

Los cuatro roles de placa NO cambiaron (`estructuraDePlacas`): el por qué
va en una placa de evidencia propia; dolor, beneficio y otra mirada, en
las de propuesta; las preguntas, en el campo `destacado` y en el cierre.
El copy va más hondo que las placas, hasta 2.100 caracteres.

**Las guardas no se aflojaron**: «la profundidad se gana con lectura, no
con números nuevos», y el por qué y el dolor son lecturas GENERALES del
juego, nunca un hecho sobre alguien.

### 5 · Tres correcciones que salieron de leer la redacción real

Medido el 2026-10-13 con `claude -p` sobre APdeB Zona B: CR-01 en 29 s
(10 placas) y un cruce libre uso × pérdidas en 30 s (8 placas), nada
descartado por la guarda. Los dos arreglos que estaban sin probar
funcionan: el copy sale sin asteriscos y la diferencia de rating ya no se
llama «puestos».

- **LOS HASHTAGS LOS PONE EL CÓDIGO** (`filtrar`: saca los del modelo y
  agrega `M.HASHTAGS`). El modelo escribió `#basquetfemenino` en una liga
  masculina: un hashtag es una afirmación sobre el torneo que ninguna
  guarda puede revisar.
- **Los decimales se piden con coma**: salían «86.2» porque así figuran en
  el JSON de la pieza. La guarda ya los toma como el mismo número.
- **Una pregunta de gancho sin cerrar se cierra**, no se tira.
- La regla «las capas no se anuncian como rótulos» («El dolor de no
  verlo:») se sumó DESPUÉS de la última redacción real y no se volvió a
  probar contra el modelo.

### Lo que sigue igual

- La revisión humana no es opcional: la guarda comprueba que el número
  exista, no que esté bien usado; el por qué y la propuesta son opinión.
- El intérprete libre es un vocabulario escrito a mano: un concepto que no
  esté en `CONCEPTOS` no se reconoce. Se agrega ahí (un test exige que
  toda candidata sea una métrica del registro del núcleo).
- Verificado al revés, once mutaciones, todas caen: aproximar en silencio
  2, callar lo que no existe 3, la tabla del cruce sin filtrar 2, sin
  verificar el anonimato 2, el redactor sin las capas 2, y 1 cada una el
  aviso del piso, «peores» sin dirección, la correlación con muestra
  chica, explorar con la lista corta, el reintento sin anonimizar y el
  prompt alternativo sin las capas.
- `.claude/launch.json` suma `centro-mando-prueba` (puerto 8771, datos en
  una carpeta temporal) para probar sin tocar la bandeja de verdad.

## 111. VICTORIAS EN EL EXPLORADOR, TEXTOS SIN CORTAR Y LA TESIS DE VESTUARIO (2026-10-13)

Auditoría del club sobre la pregunta «¿cómo influye el RO% en las
victorias?»: no había métrica de resultado, el título salía cortado
(«…en toda la lig»), el dato decía «1 quedan altos» y la redacción leía
la tabla. `test-centro-mando.js` fija todo lo de acá.

### 1 · `% de victorias` · una métrica de resultado, fuera del núcleo

`E.EXTRAS['WIN%']` (rótulo «% Victorias»): ganados sobre partidos, del
`e.record` que el índice ya arma. **No se agregó al registro del núcleo**
(el servidor lo copia byte a byte): vive en el Explorador, y `def`,
`rotulo`, `mostrar` y `leerEquipo` la resuelven. Existe para equipos y
zonas; a nivel jugadores o partidos el intérprete dice que no hay dato.

- **Desde el punto 112 el récord es el de la tabla de posiciones**, con los
  partidos sin estadísticas cargados a mano.
- El rating neto ya estaba (`NET RTNG`); se sumaron las formas de
  escribirlo («netrtg»), «TOV%» → `PePP%`, «victorias», «ganan», «win%»,
  «%V» → `WIN%`, y «dominan el cristal» → `RO%`.

### 2 · Una pregunta de INFLUENCIA pide la tabla entera

Con «influye», «decisivo», «impacta», «pesa», «relación» y sin una palabra
de dirección, el grupo del cruce es `todos`: la tabla completa ordenada por
la primera métrica, no una esquina. El cruce informa además **cuánto tiene
de la segunda cada mitad de la primera** (`medianaBEnAltosA`,
`medianaBEnBajosA`): es la lectura de influencia que una correlación sola
no deja ver.

### 3 · Ni un texto cortado, ni una concordancia rota

- **`E.tituloDe(texto, max)`**: si entra, entero; si no, su primera
  oración; si tampoco, vacío y el título lo arma el generador
  («Rebote ofensivo y % de victorias: qué dice el cruce»). La idea libre
  usa 90 caracteres.
- **`M.recortar(texto, max)`**: lo que la IA manda de más se corta en el
  fin de una oración o de una palabra, con «…». Reemplaza a todos los
  `slice` de `LLM.filtrar` (gancho, título, texto y destacado de placa,
  copy).
- **`E.datoDeCruce`**: la concordancia sale de n («1 queda alto», «4
  quedan altos», «De 1 equipo», «Con 1 caso»).

### 4 · La voz · tesis de vestuario

`M.VOZ`, `M.CAPAS` y `M.ESTILO` suman:

- **LA TESIS DE VESTUARIO**: una postura táctica discutible, plantada en la
  placa 1. El prompt dice qué NO es una tesis (una generalidad, o el dato).
- **El dolor en la moneda del juego**: posesiones regaladas, puntos por
  posesión, desgaste, golpe anímico del cierre — **sin números inventados**.
- **Punch**: títulos de hasta ocho palabras y léxico de cancha rioplatense.
- **El copy es un artículo de opinión**: tres párrafos y tres preguntas de
  auditoría.
- **«Si el dato es flojo, la postura es ESA»**: no se infla.

### La prueba de fuego · medida el 2026-10-13, APdeB Zona B

59 s con `claude -p`, 8 placas, nada descartado. Los 6 equipos sobre la
mediana de RO% tienen una mediana de 54,8 % de victorias contra 45,0 % de
los de abajo, con r = 0,23 sobre 12 casos. **El modelo tituló «El rebote
ofensivo no te garantiza nada»**: tomó la postura que el dato sostiene, que
es la contraria a la intuición del pedido. Es lo que se le pide; con otro
libro la tesis puede ser la opuesta.

Leída contra el dato: los números están bien usados; escribió «prioridad
número uno» (un número en letras, que el prompt prohíbe y la guarda no ve)
y un par de frases de lectura flojas. **La revisión humana sigue siendo
obligatoria.**

## 112. TRES AJUSTES DE CIERRE DEL CENTRO DE MANDO (2026-10-13)

El club aprobó la voz del punto 111 y pidió tres ajustes.

### 1 · El % de victorias es el de la tabla de posiciones

El libro no trae una hoja de posiciones: la tabla del panel es el récord
del índice MÁS los partidos sin estadísticas que el club cargó a mano
(punto 44), que viven en el catálogo. `E.conRecordDeTabla(idx, mapa)` le
cuelga al índice ese récord (`idx.recordOficial`), armado con la MISMA
fusión de Clasificación (`SGADD_CLASIF.filasPorEquipo` +
`manualesDelTramo`), y `WIN%` lo usa.

- El servidor lo hace en `indiceDe`, con `MUT.manualesDeZona`: en la
  zona de un torneo son la unión de lo que cargaron sus clientes (punto 102).
- **Los promedios no se tocan**: `e.record`, `e.pj` y toda métrica siguen
  saliendo solo de los partidos con box score.
- Si el catálogo no se puede leer, queda el récord del libro. La tabla dice
  cuál se usó (`resultado.victorias: { fuente: 'tabla' | 'box', manuales }`).
- Medido en APdeB Zona B: 2 partidos manuales; el % de tres equipos cambió
  (35,0 → 33,3 · 40,0 → 42,9 · 20,0 → 19,0) y el r del cruce con RO% pasó de
  0,23 a 0,21.

### 2 · La guarda de números en letras · `LLM.numerosEnLetras`

La guarda numérica solo ve cifras: «prioridad número uno» la esquivaba.
`filtrar` descarta ahora también el texto que escribe un número en
letras, en TRES familias y solo tres:

| Familia | Ejemplos |
|---|---|
| orden y prioridad | «número uno», «el primero», «en segundo lugar», «top tres» |
| cantidades de la liga | «seis equipos», «tres de cada cinco», «doce puntos» |
| fracciones | «la mitad de la liga», «más de la mitad», «un tercio» |

**Un cardinal suelto NO se marca**, y se midió por qué: con «dos», «cuatro»
a secas, una redacción real perdía cuatro textos válidos («dos métricas,
dos decisiones», «los cuatro grupos») y con el cierre caían todas las
placas. Tampoco el léxico del juego (`LEXICO_CON_NUMERO`: «segunda
oportunidad», «tiro de tres», «uno contra uno») ni «la mitad de arriba».

### 3 · Términos exactos de cancha

`M.ESTILO` suma «TÉRMINOS EXACTOS, no metáforas»: contraataque rival,
balance defensivo, puntos de transición, retroceso; y que quienes corren o
defienden son jugadores y equipos, nunca una zona de la cancha (el modelo
había escrito «la pintura rival que corre»).

### Medido

Redacción real de control (44 s): «el rival sale de contraataque», «el
balance defensivo de transición»; la guarda de letras descartó una placa
del medio por «la mitad», y las otras siete quedaron en pie.

Verificado al revés, cuatro mutaciones, cae una cada una: el % ignorando la
tabla, sin la guarda de letras, la guarda sin respetar el léxico y el
servidor sin colgar el récord.

## 113. LO QUE SE VE ES LO QUE SE CUENTA · filas, volumen, autochequeo y conectores (2026-10-13)

Auditoría del club: el resumen hablaba de 12 equipos y la tabla mostraba
10, así que al contar filas parecía que la IA se equivocaba. No se
equivocaba: el resumen se calculaba sobre todos y la tabla salía con el
tope de un ranking. `test-centro-mando.js` fija todo lo de acá.

### 1 · Un cruce se muestra entero

- **`libre.js`**: un cruce sin tope pedido va con el máximo del
  Explorador (50), no con los 10 de un ranking. Con 12 equipos se ven los 12.
- **Cada fila trae `sobreA` y `sobreB`**: de qué lado de cada mediana cae.
  La pantalla y la placa dibujan la **línea de la mediana** (cuando la
  tabla va ordenada por la primera métrica) y ▲▼ contra la segunda.
  Contando las marcas sale el resumen; hay un test que lo cuenta.
- **`cruce.base`**: «Medianas calculadas sobre N = 12 equipos del libro,
  todos los que tienen las dos métricas.»
- **`enTabla`** (cuántos hay) contra `filas.length` (cuántos se
  muestran): la pantalla dice «Se muestran las 12 filas: todas» o «50 de
  130», y cuando no entran todos la propuesta lo lleva en `avisos`.
- **La IA lee las mismas filas que se ven** (`piezaDe` → `numeros.filas`,
  con sus marcas) y los `avisos` de la pieza como `limites`.
- **La placa «LOS NÚMEROS»** muestra hasta `M.FILAS_EN_PLACA` (12), con la
  línea de la mediana, las marcas, la N y «se muestran X de Y» si recorta.

### 2 · El volumen, en la columna de al lado

`E.VOLUMEN` suma `eFG%`, `TS%` y `RTL%` → `TCI`, y `PePP%` y `PPP` →
`PLAYS`. `E.pedido` pone el volumen **pegado a cada efectividad de la
tabla**, no solo a la que ordena (`columnas[].volumenDe`). Si quien pide
ya lo ubicó, no se mueve. Entre zonas solo acompaña a la métrica de orden:
una columna de intentos no es una «diferencia entre zonas».

### 3 · El autochequeo · `M.autochequeo(p)`

Tres preguntas por pieza, a la vista en cada tarjeta (`/api/copy`):

| | Qué comprueba el código |
|---|---|
| filas | que las filas en pantalla, en la placa y en lo que lee la IA sean la N del resumen |
| volumen | que cada efectividad tenga su volumen a la vista y, en jugadores o partidos, un piso pedido |
| copy | 3 párrafos, 3 preguntas, sin rótulos, sin copiar el dato del generador, y las tres capas señaladas |

**Las capas las señala el modelo y las verifica el código**: la redacción
devuelve `capas: { porQue, dolor, beneficio }` con la oración TEXTUAL del
copy donde está cada una, y `LLM.filtrar` solo acepta la cita que está en
el copy, mide una oración y no repite a otra. **Es un chequeo de forma**:
si la capa está bien pensada lo decide quien aprueba, y la tarjeta lo dice.
`ok` es `null` cuando no aplica (una receta sin tabla, un copy sin redactar).

### 4 · La redacción reemplaza, no se superpone

`aplicarRedaccion`: con ganchos de la IA, los de plantilla se van de la
tarjeta (quedan solo si la guarda tiró todos los de la IA). El copy de la
IA reemplaza al de plantilla en la tarjeta, el `.md` y el `.json`.

### 5 · Los conectores · `GET /api/conectores`

Botón «Conectores…» del encabezado. Comprueba, sin leer un libro: el
catálogo (y si es el de Upstash o el respaldo), el libro de cada zona de
`GC.LIGAS`, el `torneos/<id>.json` de la zona, los paquetes de
play-by-play, el manifiesto de escudos, la cola de Canva **con sus HTML**,
la bandeja, el historial, la plantilla de Stories y el motor de IA.

- Lo que se lee del repo va por `REPO`; lo que se escribe, por `RAIZ` a
  `contenido/` (hay un test que lo separa).
- **Qué liga usa qué libro sigue escrito en `GC.LIGAS`**: no se descubre
  solo. Una liga nueva se agrega ahí.
- Medido el 2026-10-13: 25 de 27 en orden; faltan los paquetes de
  play-by-play de LAB 2026-27 Norte y Sur (la temporada no arrancó).

### Medido

Prueba de fuego en APdeB Zona B, redacción real (68 s): 12 filas en
pantalla, placa e IA; 3 ▲ arriba de la línea de la mediana, que es el «3
altos en las dos» del resumen; autochequeo 3 de 3, con las tres citas en
el copy. La guarda de letras sacó una placa por «la mitad de los equipos».

Verificado al revés, diez mutaciones, todas caen: el cruce recortado a 10
(8), las marcas mal puestas (2), la tabla recortada sin avisar (2), el
autochequeo de filas en verde fijo (2), y una cada una el volumen solo
para el orden, los otros dos autochequeos, las capas sin verificar, los
ganchos superpuestos y la cola sin revisar.

## 114. EL BUSCADOR DEL CENTRO DE MANDO · honestidad muestral antes que redacción (2026-10-13)

Pedido del club: frenar la generación de piezas y asegurar la base. Si el
dato es flojo, la IA redacta bien algo que está mal. `test-centro-mando.js`
fija todo lo de acá; alcanza a «A medida» (`libre.js`) y al Explorador.

### 1 · Una variable que el libro no trae NO se ignora en silencio

`NO_EXISTE` distingue las VARIABLES que faltan (`v`: EDAD, ALTURA,
NACIONALIDAD, POSICIÓN, datos por cuarto, clutch, quintetos, zona de tiro)
de lo que el panel no usa (`+/-`, valoración). Con «U23», «menos de 23
años», «extranjeros», «más de 1,95 de altura»:

- sale `omitidos: [{ variable, texto }]` con el aviso literal: «⚠️ El libro
  actual de <liga> no contiene la variable EDAD. Se desactiva este filtro
  para evitar datos engañosos.»;
- **el número de esa condición NO se le pasa a la métrica de al lado**:
  «puntos de jugadores de menos de 23 años» ya no filtra PTS < 23. Era el
  peor modo de fallar —un filtro que nadie pidió— y estaba ahí;
- **el servidor no arma la pieza** (`propuesta: null`, `pideAceptar`): la
  tabla se muestra con el aviso, y la propuesta recién sale con «Seguir sin
  los filtros desactivados». Aceptada, el título lo arma el generador —el
  texto prometería el filtro— y el aviso viaja en la pieza hasta la IA.

### 2 · El cruce ya no se fuerza

| Lo que se escribe | Lo que sale |
|---|---|
| dos métricas con «contra», «vs», una dirección en cada una o una pregunta de influencia | cruce por mediana (punto 110) |
| dos métricas sin esa señal, o tres o más | **tabla multivariable** con todas las columnas, ordenada por la primera |
| «índice», «combinado», «en conjunto» | la misma tabla, ordenada por el **índice combinado** |

El índice es el promedio de los percentiles de cada métrica ENTRE LOS QUE
CUMPLEN, con el mismo peso y la dirección de cada una dada vuelta donde
menos es mejor. Es una posición relativa, no un dato del libro, y la
columna lo dice.

### 3 · Dos escalas, y no se mezclan

`escala: 'total'` («totales», «acumulados», «en la temporada», o el
selector): las CUENTAS (`E.ACUMULABLES`) pasan al total del tramo y la
columna se rotula «tot.»; una tasa es la misma en las dos. El total de un
jugador sale de su acumulado y, si el libro no lo trae, de **sumar su
partido a partido con ese equipo** — nunca de multiplicar el promedio (hay
un test con un promedio mal cargado). «Rebotes totales» es una métrica,
no una escala: las palabras de la consulta se leen FUERA de las métricas.

### 4 · El piso de volumen automático · `E.pisoDeVolumen`

Al ordenar o cruzar por una efectividad a nivel jugadores (`pisoAuto`,
que pide el intérprete), el Explorador aplica y DICE:

- MIN ≥ el umbral de calificación de la liga (`idx.liga.minJugador`),
  salvo que se haya filtrado por minutos a propósito;
- PJ ≥ 3, la regla de la muestra del punto 4;
- el volumen de esa efectividad ≥ el **cuartil más bajo** de los que
  califican (medido en APdeB Zona B: T3I ≥ 1,2; en la demo, 1,9).

Lo pedido a mano no se pisa. En equipos no hace falta (temporada entera).
En partidos y en el laboratorio armado a mano no se aplica: ahí el
diagnóstico dice «SIN PISO» y no certifica. **Esto revierte la decisión
del punto 110** de solo avisar: el club pidió que el piso se aplique.

### 5 · Solo activos

`activos: N` («activos», «sin bajas», «últimas 6 fechas», o el selector):
quedan los que sumaron minutos en alguna de las últimas N fechas de SU
equipo (4 por defecto, la racha del buzón). Es lo que el libro puede decir;
el estado que marca el cuerpo técnico vive en el panel de cada club y no
se lee acá.

### 6 · El diagnóstico de calidad · `resultado.calidad`

Va ANTES de la tabla y adentro de la pieza (`datos.calidad`):

| | |
|---|---|
| muestra | la N validada y si la vista la muestra entera |
| filtros | los aplicados (con cuántos sacó cada uno) y los desactivados por falta de columna |
| piso | el piso de volumen confirmado, con sus números |
| escala | por partido o totales |

`certificado` es los tres en verde y nada desactivado. **Un ranking no es
un recorte** (sus 10 primeros son lo pedido); un cruce o un índice que no
entran enteros en la vista SÍ lo son, porque sus números salen de todos.

### Lo que este diagnóstico NO certifica

Que el libro esté bien cargado. Un box score truncado o un promedio a
medio recalcular (puntos 3 ter y 66) los denuncia el Diagnóstico del
panel, no este buscador: acá se certifica que la tabla dice lo que se
pidió, sobre quiénes, y con qué piso.

### Verificado

En el navegador contra APdeB Zona B: «jugadores U23 con más puntos» no
arma la pieza hasta aceptar; «minutos, uso, plays y puntos de los
jugadores activos» da una tabla de cuatro columnas sobre 93 (25 afuera por
inactividad); «triples de los jugadores» sale con su piso. Al revés, doce
mutaciones, todas caen (el piso sin el volumen, 4).

## 122. LA CORRIDA SIN NADIE · `npm run auto-process`, render local y Bahía Blanca (2026-10-15)

- **`npm run auto-process`** (`auto-process.js`, con un `package.json` de raíz
  que SOLO declara comandos: el panel sigue sin dependencias). Corre ingesta →
  auditar → contenido → render. Los hijos corren con `CENTRO_MANDO_MOTOR=no`:
  ningún paso llama a un modelo. Un paso que falla no frena a los demás.
  Log e informe en `contenido/auto-process/`. Aprobar piezas sigue siendo
  manual. La tarea de Windows NO se cambió: la acción nueva está en
  `OPERACION_ECOSISTEMA.md`, punto 0.
- ~~**`centro-mando/renderizar.js`**~~ **REEMPLAZADO por el punto 123** (el club no quiere archivos locales). Era: cada `section[data-document-role="page"]`
  pasa a PNG del tamaño de la placa, y el HTML entero a un PDF de una placa por
  hoja. Usa el Chrome de la máquina por CDP (sin puppeteer ni playwright). Con
  `--pendientes` recorre la cola y anota `render` en cada pieza, sin cambiarle
  el estado. Medido: 4 piezas, 26 placas, 1080×1350 y 1080×1920.
- **LICENCIAS sale del auditor** salvo con `--licencias`: todo se opera con la
  cuenta de administración, y el motor le saltea la licencia (v104). El gate
  del motor NO se tocó.
- **Prefijo de división**: `SGADD.quitarOrdinal` (núcleo, y `LOGOS.normalizar`
  la usa) saca `1°` / `1º` / `1ª` del principio del nombre. **Exige el signo
  ordinal**: el regex que se pidió (`/^(\d+[°ºª\.\-]?\s*)+/`) también comía el
  número de «9 DE JULIO» o «25 DE MAYO». `limpiarNombre` y `claveEquipo` lo
  aplican, así que lo heredan el servidor, la ingesta y los generadores.
- **`logos/bahia-blanca/index.json`**: los 12 equipos del libro resuelven.

## 123. LAS PIEZAS A CANVA POR LA API, SIN CLAUDE Y SIN ARCHIVOS LOCALES (2026-10-16)

Pedido del club: nada de PNG ni PDF en carpetas locales; el circuito es
Drive ↔ Sheets ↔ Pages ↔ Plataforma ↔ Canva, y corre solo. Guía y la
configuración de una vez en `OPERACION_ECOSISTEMA.md`, punto 0 bis.

```
centro-mando/pdf.js     el PDF de un HTML aprobado, EN MEMORIA (Chrome por CDP, sin dependencias)
centro-mando/canva.js   autorizar (una vez) · estado · importar [--ensayo]
```

- **La Connect API de Canva NO importa HTML** (solo PDF, PPTX, DOCX y formatos
  de Office/Adobe). Lo único que convertía HTML en diseño era el conector de
  Claude. Por eso viaja un PDF: una placa por hoja, del tamaño de la placa.
- Circuito: pendiente → `placas-tmp/<pieza>.pdf` (+ el HTML) → commit SOLO de
  esa carpeta y push → Pages → `POST /rest/v1/url-imports` (`mime_type:
  application/pdf`) → sondeo del job → `importada` con `canva` (edit_url) y
  `canvaId` → se borra de `placas-tmp/`, commit y push.
- **OAuth con PKCE, una vez**, con redirección a `http://127.0.0.1:8772/oauth/redirect`.
  El permiso vive en `centro-mando/.canva-token.json` (gitignore). Canva ROTA el
  refresh token en cada uso: se guarda el nuevo antes de usar el acceso.
- **El permiso se mira ANTES de publicar**: sin él no queda nada a la vista.
- **Publicar exige main al día con origin** y nunca arrastra otros cambios.
- Pages que no sirve a los 20 min → `publicada`, se importa la corrida
  siguiente. Errores transitorios de Canva, hasta 3 intentos; uno definitivo
  deja `error` y retira el PDF.
- `auto-process` corre `canva` como paso 4 (en lugar del render). Con la cola
  vacía no necesita la app; con piezas pendientes y sin app, falla diciéndolo.
- Se conservan el saneo de `1°`, el matcheo de escudos y el salto de LICENCIAS.
- **No verificado contra Canva**: hace falta crear la app y autorizarla. El
  PDF en memoria sí se midió (CR-03: 6 placas, 6 hojas, 855 KB).

## 181. LA AGENCIA, A LA VISTA · rutinas sin sesión, banco de ideas y tablero (2026-11-17)

Las rutinas de marketing corren **solas en Windows**, sin la app de Claude abierta, y la dirección las maneja desde el Centro de Mando. Todo vive en `contenido/` (ignorada por git) salvo `centro-mando/agencia.js` y `agencia-ui.js`.

- **Tareas de Windows**: `MotorStats Agencia Diaria` (08:06), `MotorStats Agencia Semanal` (lunes 09:30) y `MotorStats Centro de Mando` (al iniciar sesión, deja el servidor en `http://127.0.0.1:8770`; acceso directo «Agencia MotorStats» en el escritorio). Se registran con `contenido/vigilancia/automatizacion/programar.ps1 -Registrar`. Si la PC estaba apagada, corren al prenderse. Las tareas equivalentes de la app («Programadas») quedan en pausa.
- **El ejecutor** (`correr.ps1 -Tipo diaria|semanal`): lee Instagram y sitios con un Chrome propio (`instagram.js`, solo lectura, 11 perfiles y los sitios que cargan por JS), baja las transcripciones de YouTube con **yt-dlp** (`transcripciones.js`, pip --user) y recién ahí llama a `claude -p` con permisos mínimos (lee todo, escribe solo en `contenido/vigilancia/`). La sesión de `claude` en la terminal tiene que estar iniciada (`claude auth login`).
- **La salida es estructurada**: `agencia/ideas/AAAA-MM-DD.json` con **5 ideas ordenadas de más a menos probable** (probabilidad con su porqué), hallazgos, decisiones sí/no y lo que no pudo ver, más el informe `.md` de lectura rápida.
- **El banco** (`agencia/banco.json`): cada idea con estado nueva · elegida · en-curso · aprobada · descartada. Lo descartado queda de reserva; la rutina lo lee para no repetir y respeta las notas y criterios de la dirección.
- **El tablero** (pestaña «Agencia» del Centro de Mando): lo que necesita decisión arriba, las 5 ideas, el trabajo en curso con las puertas P1-P10, lo que encontraron los agentes, el banco y un chat para hablarle a cualquier agente. «Elegir» lanza el circuito de puertas con los agentes `mkt-*` y escribe la ficha; **«Aprobar» solo anota la puerta P11: nada se publica ni se programa desde ahí**.
- **Instagram/YouTube**: sin login se leen los últimos posteos (texto completo, fecha, me gusta) y los videos (descripción y transcripción automática). Cursos pagos y apps con login no se tocan.

## 183. LA MESA DE CONTROL · una sola pantalla, solo lectura (2026-11-27)

Pestaña «Mesa de control» del Centro de Mando (`centro-mando/mesa.js` + `mesa-ui.js`): junta en `GET /api/mesa` lo que estaba desparramado y lo muestra en tres columnas: **Decidí hoy** (primero lo que rompe, después riesgo, después info), **Corre solo** y **Datos**.

- **Qué junta y de dónde**: (A) el último `DATOS/auto-process/*_auditoria.json` (no corre el auditor: tarda ~1 min y sale a la red; si el informe tiene más de 7 días el aviso va a «Decidí hoy» con `npm run auditar`, cada ítem lleva la fecha en el título y sus ERROR bajan a riesgo en «Datos»); (B) las tareas `MotorStats*` de Windows con `Get-ScheduledTask` (solo Windows; una que termina con error apunta al log real, p. ej. `<AGENCIA_DATOS>/logs/AAAA-MM-DD_semanal.log`; 0xC000013A es «se cerró con la sesión», no un error); (C) el candado `salida/.corrida.lock` de la ingesta (`ECOSISTEMA_INGESTA` o `../motorstats-ingestion`; más de 70 min = colgado, se avisa y NO se borra); (D) la cola de Canva; (E) el banco de ideas de la agencia (`AGENCIA_DATOS`) y las ideas nuevas del último día; (F) los ciclos de 4 partidos cerrados, aptos y sin sello (mismo criterio que `server/rutas/ciclos.js`: `armarVentana` + `auditar` + hash `sgadd:ciclos:<club>:<cat>`; solo categorías con la capa `pbp` y con EQUIPO PROPIO (resuelto por `catalogo.resolver`): lee solo el campo de ese equipo, como `paqueteDe`, saltea los torneos y lista en UN ítem de «Datos» las categorías sin equipo propio; necesita KV, que viene del `server/.env` que carga el servidor); (G) los partidos manuales por cargar, corriendo `server/bin/carga-manual.js control` en simulación (si sale con error pero trae `{codigo, mensaje}`, es un dato y no una fuente caída); (H) los pendientes del cerebro.
- **Qué NO hace**: no escribe nada (ni KV, ni Calendar, ni archivos, ni la cola ni el banco) y no registra ninguna ruta POST. Los comandos de arreglo (`/cerrar-ciclo …`, `/fecha-manual`, `/agencia canva`, `npm run auditar`) se MUESTRAN como texto: la mesa no ejecuta ninguno. Un test lee el fuente y falla si aparece una escritura o una bandera de escritura.
- **Una fuente caída no rompe las demás**: queda en `fuentes[nombre] = { ok:false, error }` y la pestaña la muestra arriba. Cada fuente tiene su propio tope de tiempo (la de partidos manuales, 95 s).
- **Caché de 5 minutos** en memoria y una sola lectura en vuelo (un segundo pedido recibe la misma promesa); «Actualizar» pide `?fresco=1` (sigue siendo una lectura).
- **Variables**: `MESA_CEREBRO` (carpeta con el `pendientes.md` del cerebro; sin default a propósito: el repo es público y no lleva ese nombre), más las que ya usan `CENTRO_MANDO_DATOS`, `AGENCIA_DATOS` y `ECOSISTEMA_INGESTA`.
- Test: `test-centro-mando.js`, sección «La Mesa de control · solo lectura».
