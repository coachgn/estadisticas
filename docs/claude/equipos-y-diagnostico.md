# Equipos y diagnóstico

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 14. Guía de diseño oficial · Checklist Design

**https://www.checklist.design/** es la referencia del proyecto para todo lo
que sea interfaz. Ante una duda de UI —un estado que falta, una transición,
un contraste dudoso— **se consulta ahí antes de inventar**.

No es una librería de CSS: es una lista de verificación por componente. Se
usa como control, no como fuente de código — de ahí no se copia ni un color
ni una clase, porque el sistema visual del panel es propio y por club.

### El catálogo está EN EL REPO, no hay que ir a buscarlo

`.agents/skills/checklist-design/` trae las **118 checklists** publicadas
como archivos, más los dos modos de revisión (`audit` item por item y
`critique`). Es la skill oficial del sitio, MIT, instalada con:

```bash
npx skills add checklist-design/skills --tool claude-code
```

Reinstalar solo hace falta para actualizar el catálogo. El symlink que el
instalador deja en `.claude/skills/` apunta a una ruta absoluta de la
máquina y está en `.gitignore`; los archivos de verdad viven en `.agents/`
y viajan con el repo, así que **un clon nuevo ya tiene el catálogo** y
cualquier cliente que se sume arranca con el mismo criterio.

Antes esto era un link en un documento: había que acordarse de entrar,
buscar el componente y leerlo. Ahora la checklist que corresponde se lee
desde el repo, sin red.

### Las otras skills del repo (2026-11-13)

Instaladas igual (`npx skills add <repo> --tool claude-code -y`), en
`.agents/skills/` y registradas en `skills-lock.json`. Son guías de
trabajo: **no cambian el criterio del punto 14 ni del proyecto** (sin
dependencias, CSS por club, contraste medido, `prefers-reduced-motion`).
Si una skill propone otra cosa, manda este archivo.

| Para qué | Skill | Repo |
|---|---|---|
| Que la UI no se vea genérica | `design-taste-frontend` · **solo local** (37 MB de fotos, en `.gitignore`) | Leonxlnx/taste-skill |
| Layout, espaciado, tipografía, auditoría de UI | `impeccable` | pbakaus/impeccable |
| Movimiento y transiciones | `animate`, `review-animations`, `improve-animations`, `remove-animations`, `choreograph`, `emil-design-eng`, `break-ui`, `mobile-native`… | emilkowalski/skills |
| Revisar seguridad antes de producción | `security-start` (punto de entrada), `owasp-audit`, `api-audit`, `secrets-audit`, `cloud-audit` (Vercel), `prompt-injection` (Centro de Mando)… | briiirussell/cybersecurity-skills |

- Del set de Emil sobran para este proyecto `write-swift`, `animate-expo`
  y `ask-sonner` (Swift, React Native y una librería de React): no aplican.
- **No se instalaron**, a propósito: las de Supabase y Postgres (el stack
  no tiene base de datos: Vercel + Upstash) y los packs de mukul975 (817
  skills) y Masriyan.
- Un clon nuevo trae todas menos Taste: `npx skills add Leonxlnx/taste-skill --tool claude-code -y`.

### Para qué se consulta

| Tema | Qué resuelve |
|---|---|
| **Drawer / Modal** | overlay, desenfoque, animación, trampa de foco, cierre |
| **Toast** | duración, posición, anuncio a lectores de pantalla |
| **Empty states** | qué mostrar cuando no hay nada, y con qué tono |
| **Tablas** | jerarquía, estados de fila, alineación de números |
| **Botones** | hover, active, disabled, focus |
| **Formularios** | etiquetas, errores, ayuda contextual |
| **Contraste** | WCAG AA como piso, siempre |

### Reglas que ya están aplicadas y no se negocian

**Foco visible con `:focus-visible`, nunca con `:focus`.** El anillo aparece
al navegar con teclado y no en cada clic del mouse — con `:focus` era ruido
permanente y terminaba desactivándose, que es peor que no tenerlo.

**Contraste AA en todo el sistema.** Auditado sobre los 15 pares de color del
panel (texto, `dato-sec`, acento, verde/rojo de atípicos, `mm-pos`/`mm-neg`,
badges, fila destacada): **los 15 pasan 4.5:1**. Al agregar un color nuevo hay
que medirlo, no estimarlo.

**Ningún estado se comunica solo con color.** El `+/-` lleva signo además de
tinte, los atípicos llevan flecha, los estados de plantel llevan emoji y
texto. Un daltónico tiene que poder leer el panel entero.

**`prefers-reduced-motion` desactiva todas las animaciones.** Drawer, toast y
transiciones de fila.

**Empty states positivos, no listas vacías.** El buzón sin alertas muestra
"Plantel al día" con su marca, no un contenedor en blanco.

**Descartar tan fácil como confirmar.** Toda acción destructiva o de
compromiso tiene su opción neutra igual de visible ("Mantener activo").

**Todo lo que se puede clickear se puede usar con el teclado.** Media app se
navega haciendo clic en una FILA —un partido abre su detalle, un jugador su
ficha, un equipo la suya— y con un `onclick` sobre un `<tr>` esa navegación
**no existía para el teclado**: la fila no se enfocaba, no se activaba con
Enter y un lector de pantalla la leía como texto suelto.

`SGADD_UI.atributosFila(etiqueta)` emite `tabindex`, `role="button"` y un
`aria-label` que dice qué pasa al activarla; `teclaActiva()` reusa el
`onclick` que la fila ya tiene, así no hay dos caminos que mantener
sincronizados. Hay un test que recorre los módulos y **falla si aparece una
fila con `cursor-pointer` sin esos atributos**.

**Las tabs son tabs de verdad**: `role="tablist"`/`role="tab"`,
`aria-selected` y **tabindex rodante** —el tabulador entra una vez al grupo,
a la pestaña activa, y adentro mandan las flechas—. Activar repinta la
sección y destruye el nodo, así que `teclaTabs()` devuelve el foco buscando
la pestaña por su `data-tab` después del repintado; sin eso el teclado queda
en el `<body>` y hay que empezar de nuevo.

**El foco de una FILA no se marca con `outline`.** En `display: table-row`
los motores lo dibujan despareja — el mismo motivo por el que el fondo de
una fila va en los `<td>` (ver abajo). Se repite el tratamiento de la fila
destacada, que ya tiene el contraste medido, más la barra del acento en la
primera celda.

**Salto al contenido.** Con un menú de seis secciones, sin él el teclado lo
atraviesa entero en CADA pantalla. Va como `<button>` y no como ancla a
`#view-root`: **el hash es la ruta de la app**, y un ancla lo pisaría
mandando al DT a la pantalla de inicio.

### Lo que la auditoría dejó abierto

Honestidad sobre lo que NO está hecho, para no darlo por cerrado:

- **Sin pruebas con lector de pantalla real** (VoiceOver/NVDA). Los roles y
  las etiquetas están puestos y verificados en el DOM, pero eso no es lo
  mismo que escuchar la pantalla.
- **Las tabs no declaran `aria-controls`/`role="tabpanel"`**: el contenido
  de cada pestaña no es un contenedor único y estable, así que apuntarle
  sería mentir. Se anuncian como pestañas y se navegan con flechas, que es
  la parte que el DT usa.
- **Las tablas no tienen búsqueda ni paginación**, dos items de la checklist
  de Table. Es deliberado: los rankings ya salen recortados al top 20 y el
  filtro real del panel es el selector de equipo, que está arriba de todo.
  Si alguna tabla crece, entra la búsqueda.

### El error de CSS que hay que recordar

**En una tabla, el fondo de la fila va en los `<td>`, no en el `<tr>`.** La
card pinta las celdas con `#141414` propio y ese fondo **tapa** el del `tr`:
la regla se aplicaba, el `getComputedStyle` del `tr` la mostraba, y en
pantalla no se veía nada.

Por lo mismo, el desplazamiento de la fila destacada se hace con
`padding-left` y no con `transform`: en `display: table-row` los motores
directamente lo ignoran.

### Estados de fila del plantel

```css
tr.fila-jug > td            → transición .2s de fondo, .15s de padding
tr.fila-jug:hover > td      → tinte del acento al 12%
tr.fila-destacada > td      → ídem, y llega desde el hover en el scatter
   > td:first-child         → barra lateral de 3px + padding-left 9px
```

**El texto NO cambia de color al destacarse.** Repintarlo obliga a revalidar
el contraste de cada celda —verde de atípico, rojo de `+/-` negativo, naranja
de acento— contra un fondo nuevo. El tinte al 12% deja todo por encima de
4.5:1 sin tocar un solo color de texto.

### La tabla del plantel muestra TODO, el gráfico solo los de 10+

Son dos cosas distintas y hubo que separarlas:

- **La tabla es la lista del equipo**: muestra el plantel completo. Esconder a
  la mitad no la aclara, la deja incompleta.
- **El peso visual** lo decide el mismo corte que el gráfico
  (`SGADD_CHARTS.MIN_SCATTER`, leído y no repetido): los de 10 minutos o más
  van en blanco, el resto atenuado. Antes eso lo decidía `__califica` y
  quedaban grises jugadores que sí estaban en el scatter — el DT los veía de
  un color en la tabla y de otro en el nodo.
- **"Sin percentil"** es una nota al costado, no un atenuado de toda la fila:
  no llegar al umbral de calificación de la liga es otra pregunta.

La insignia con las iniciales (`.fila-inicial`) es el puente visual entre las
dos vistas: sin ella hay que leer el nombre completo para saber qué punto del
gráfico es cuál.

---

## 20. GLOSARIO de métricas · `sgadd-glosario.js` + `sgadd-glosarioui.js`

Qué mide cada columna, en castellano. **Es público**: son definiciones, no
números de un club, y un DT que quiere saber qué mide `eFG%` no debería
necesitar un link (`MODULOS.glosario: null`).

### El archivo se GENERA, no se escribe

```bash
node generar-glosario.js     # lee el manual del MOTOR, escribe js/sgadd-glosario.js
```

Sale de `MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html`, que vive en
`C:\\Users\\Pc\\mi-motor-stats\\manuales` — o sea en el otro proyecto. Se copia y no se
lee en vivo por dos motivos: el panel es estático y no tiene acceso al disco
de nadie, y el manual cambia con el calendario del motor. Misma convención que
`generar-css.js` y `generar-manual-etiquetas.js`: se corre a mano y el
resultado se commitea. **76 entradas (73 del manual + RCA, TCDP e IDE de la card de Rendimiento, que declara `EXTRAS` en el generador), cobertura 100% de las 59 `METRICAS`** del
panel, y hay un test que falla si alguna queda sin definición.

> **Desde 2026-09-13 el glosario NO trae hojas**: ni la columna «Hoja» ni la
> card con las abreviaturas `4F`, `AC`, `BD`, `E / J`. Y `PPP OF`/`PPP DEF`
> dicen «por jugada», corregido en el generador (`CORRECCIONES`) porque el
> manual del motor dice «por posesión» y es de otro proyecto. Ver el punto 61.

**Las columnas se mapean por NOMBRE de encabezado, no por posición.** Las
tablas del manual no tienen todas la misma forma —unas traen *Fórmula*, otras
*Para qué se usa*— y una tabla con otro formato se **saltea** en vez de
producir filas con los campos corridos, que es el modo de fallar que nadie
nota hasta que lee una definición equivocada.

**Se descarta lo que no define nada.** La tabla de referencias cruzadas repite
siglas con la hoja donde vive cada una (`4F: NET PPP`), sin nombre ni
explicación: son punteros. En el glosario salían como filas de guiones, que es
peor que no estar — el que las ve concluye que el glosario está incompleto. El
corte es tener al menos una de las tres cosas que a alguien le sirven: cómo se
lee, para qué se usa, o el nombre completo.

### El tooltip se engancha UNA vez, por delegación

En el `document`, no por celda. Las tablas se repintan enteras en cada cambio
de tramo: con listeners por nodo habría cientos y cada repintado dejaría los
viejos colgados. Un listener, sobrevive a cualquier repintado, y no hay nada
que limpiar.

**No es un `title=""`.** El nativo tarda un segundo largo, no se puede leer con
el teclado y en una tabla de veinte columnas queda tapado por el cursor.

Reglas que hay que respetar al tocarlo:

- **Una cabecera ordenable se marca con `data-metrica`, no se deja al
  reconocimiento por texto.** La flecha de orden (`⇅` `▲` `▼`) vive DENTRO
  del `th`, así que su `textContent` deja de coincidir con la sigla. Medido en
  producción antes del fix: **cero cabeceras reconocibles** en los dos
  rankings. Hay un test que exige además que las 35 columnas rankeables tengan
  definición — sin eso el subrayado punteado promete un tooltip que no aparece.
- **El texto suelto solo se acepta si coincide EXACTO** con una sigla y mide
  ≤ 12 caracteres: sin eso, cualquier celda que dijera "PTS" —el apodo de un
  jugador, una nota— abriría un tooltip donde no corresponde.
- **Responde al foco además del mouse** y cierra con ESC (punto 14).
- **En papel no se imprime**: sin hover sería un recuadro suelto en la hoja.
- **La definición corta prefiere `lectura` sobre `nombre`.** El nombre completo
  de `eFG%` no le dice nada a quien no lo sabe ya; lo que sirve es qué
  significa el número.
- **Tipear no repinta la sección**, solo la tabla: la misma regla del buscador
  del buzón y de los campos de scouting.

### Sumar una sección toca DOS listas

`SGADD.SECCIONES` (el vocabulario del router, punto 16) **y** `VALID_SECTIONS`
en el `index.html`. Con la segunda sin actualizar el item del menú se dibuja y
no navega — sin ningún síntoma.

---

## 22. Módulo COMPARATIVA · especificado, no implementado

[`ESPECIFICACION_COMPARATIVA.md`](ESPECIFICACION_COMPARATIVA.md) traduce a
estructura de datos los **6 informes reales de Jujuy** que el cuerpo técnico
armaba a mano en Canva. La misma relación que hay entre los PDF de *REPORTE
SCOUTING* y la sección Scouting.

Lo que hay que entender antes de encararlo: **un informe de ciclo no es una
foto de la temporada, es la comparación de dos cortes** de N partidos (4 en los
informes 4 y 5, 5 en el 6 — la ventana es un parámetro, no una constante). Y
**tendencia y status son ejes distintos**: la primera es el delta contra el
ciclo anterior, el segundo el nivel contra la liga. Un equipo puede venir
subiendo y seguir último.

Los PDF están en `.gitignore`: pesan 7,4 MB y son material del cliente.

---

## 26. Sección COMPARATIVA · `sgadd-comparativa.js` + `sgadd-comparativaui.js`

La réplica calculada de los 6 informes de ciclo que el cuerpo técnico armaba a
mano en Canva. La especificación de dónde sale cada bloque está en
[`ESPECIFICACION_COMPARATIVA.md`](ESPECIFICACION_COMPARATIVA.md).

**Es exclusiva de ADMIN** (`soloAdmin`), como Simulador, Panel Master y
Diagnóstico: cruza ciclos de cualquier equipo de la liga, que es justo lo que el
gate del cliente acota.

### La distinción que sostiene el módulo entero

```
TENDENCIA  =  el delta contra el ciclo ANTERIOR   ¿mejoró?
NIVEL      =  dónde está parado contra la LIGA    ¿alcanza?
```

**Son dos ejes y van en dos columnas.** Un equipo puede venir subiendo y seguir
último, y puede caer fuerte y seguir siendo primero. Medido con DEPORTIVO real:
su ciclo actual es **4-0** y aun así el `eFG%` se derrumbó de 57,4% a 39,9% —
tendencia en rojo— mientras el `NET RTNG` sigue **2º de la liga**. Colapsarlos en
un solo semáforo pierde exactamente esa lectura.

### Lo que hay que respetar al tocarlo

- **La ventana es un PARÁMETRO**, no una constante: 4 en los informes 4º y 5º, 5
  en el 6º. El default es el `PARTIDOS_POR_CICLO` del plan ORO.
- **El signo se corrige por la DIRECCIÓN de cada métrica.** Bajar las pérdidas
  es mejorar; pintarlo de rojo por «bajó» es el error que el proyecto ya evita
  en los rankings invertidos. Las invertidas son `PePP%`, `RO Opp%`, `RTNG DEF`
  y `eFG Opp%`.
- **Las críticas se ordenan por el cambio RELATIVO.** Con el absoluto ganarían
  siempre las de escala grande —un rating se mueve en decenas y un porcentaje en
  centésimas— y la lista sería siempre la misma.
- **El NIVEL se mide contra la temporada de los rivales, no contra su ciclo.** Un
  puesto calculado sobre cuatro partidos de cada equipo sería ruido. La fila
  mezcla dos ventanas a propósito y la pantalla lo rotula.
- **Un partido sin fecha no entra a ningún rango**, y se cuenta aparte para
  avisarlo (misma regla que el calendario del punto 18). A un ciclo sí entra:
  ahí el corte es por posición.
- **El volumen del corte se muestra siempre.** Un `T3%` de 24,8% con 113
  intentos y otro con 20 no significan lo mismo, y sobre cuatro partidos eso
  pesa más que en ninguna otra pantalla.

### Jugadores · NO se ordena de mejor a peor

Dos jugadores no se ordenan: se distinguen. El bloque dice **en qué se separan**,
medido en relación a la escala de cada métrica, y **sin contar `MIN` ni `PJ`** —
describen la muestra, no el juego, y separan siempre. Con empate no gana nadie:
marcar uno al azar diría algo que el dato no dice.

El tope son **tres**: con cuatro la tabla deja de entrar a lo ancho. Al llegar al
tope se descarta el más viejo en vez de ignorar el clic — ignorarlo se siente
como si la pantalla estuviera rota.

### El tab «Comparar Jugadores» de Scouting se mudó acá

Era la comparativa legacy de dos filas de `PROMEDIOS J` y contestaba otra
pregunta que el informe pre-partido. Tenerla ahí obligaba a entrar a Scouting
para algo que no es scouting, y dejaba **dos comparadores distintos** en la app.
Scouting quedó como una sola cosa y perdió su barra de pestañas: una pestaña
sola no es una elección.

`buildScoutingCompare` y su cadena quedan en el `index.html` sin llamador. Se
limpian aparte: sacar ese hilo entero en la misma vuelta que se agrega una
sección es cambiar dos cosas a la vez.

---

## 33. `data-glosa` · cuando la misma sigla significa otra cosa

En la tabla de posiciones `PP` es **Partidos Perdidos**. En el glosario del
motor, `PP` es **Pérdidas** — cierto en el box score y falso en esa tabla.

Un tooltip que dice algo verdadero en otra pantalla es peor que no decir nada,
así que `data-glosa` lleva la definición literal de la tabla que la escribe y
**gana sobre el glosario**. No se agregan al glosario: ahí `PP` ya está, y
ocupado.

Las catorce columnas de la tabla de posiciones la llevan. `Equipo` no: no es
una sigla y explicarla sería ruido — sin `data-glosa` el tooltip ni la
considera.

---

## 88. EL MENÚ SE MINIMIZA HACIA LA IZQUIERDA (2026-10-05)

Pedido: liberar pantalla para la tabla de marcas, los radares y el
comparador. El botón va en el header, al lado del título (`#botonMenu`,
solo desde 768px), y el menú pasa de 256 a **72px**: un RIEL de íconos,
no un menú escondido. La navegación sigue a un clic y se ganan ~184px
(medido en la demo a 1280: el contenido pasa de 1014 a 1198px).

- **Minimizado, cada sección conserva su nombre** en el `title` y el
  `aria-label`, tomado del propio botón para no repetir los nombres. El
  texto se apaga con `font-size: 0` porque es un nodo de texto suelto al
  lado del ícono, no un elemento.
- **En celular no aplica**: ahí el menú ya es un cajón que se abre
  encima, y apagarle el texto lo dejaría ilegible. Con la preferencia en
  «minimizado», a 375px el cajón sigue de 256px y con el texto a 14px.
- **La preferencia es de ESE navegador** (`sgadd.menuColapsado` en
  `localStorage`, con try/catch) y se restaura en `init()` ANTES de pintar
  el menú, para que no se abra y se cierre en cada carga.
- Al terminar la transición se dispara un `resize`, para que Chart.js
  tome el ancho nuevo.

Ojo al verificarlo: con la pestaña oculta el navegador no avanza las
transiciones y el ancho queda congelado en 256px. No es un bug, es la
pestaña; `getAnimations().forEach(a => a.finish())` lo destraba.
`test-responsive.js` fija las seis reglas.

---

## 143. LA BARRA SIMÉTRICA, QUINTETOS Y MAPA SIEMPRE, Y EL DIAGNÓSTICO CON PROYECCIÓN (2026-10-26)

Assets en `?v=310`. Decisiones del club, consultadas antes de escribir: Equipos
conserva sus solapas propias; Quintetos y Mapa de tiro se ven siempre; los
quintetos del jugador son SUS alineaciones; los ajustes siguen en 40-69.

### Las barras

```
Jugadores  General · Tiro · Rendimiento · Evolución · Partidos · Quintetos · Mapa de tiro · Diagnóstico
Equipos    General · Ofensiva · Defensiva · 4 Factores · Local/Vis. · Personalidad · Plantel ·
           Partidos · Quintetos · Mapa de tiro · Diagnóstico
```

- **Quintetos y Mapa de tiro no se habían sacado**: solo existían con la capa
  `pbp`. Ahora se ven SIEMPRE y, sin la capa, muestran `SGADD_PBP.avisoSinCapa`
  (◆, `data-pbp-sin-capa`). Rendimiento sigue exclusiva de la capa (punto 140).
- **El mapa del jugador salió de Tiro** a su solapa (`jugadoresBloqueMapaPbp`).
  Sus marcas del PDF pasaron de `tiro.*` a `mapa.zonas`, `mapa.reloj`,
  `mapa.reloj-tramos` y `mapa.reloj-franjas`.
- **Quintetos del jugador** (`SGADD_PBP.quintetosJugador`, puro): los quintetos,
  tríos y dúos de su equipo en los que está él, con la tabla de la card del
  equipo, y su On/Off (`onOffDe`: Net con él y sin él por 100 posesiones, de
  `rendimiento.jugadores[].on/off`). Sale del mismo paquete.
- **La ficha en PDF** suma `quintetos` (destildada) y `mapa` (tildada), las dos
  `soloPbp`: sin la capa no entran al papel. Y `diagnostico`, entero.

### El Diagnóstico · Bloque A y Bloque B (`sgadd-conclusiones.js`)

- **Bloque A · las cuatro dimensiones** (`DIMENSIONES`, `dimensiones()`): ritmo
  y transición, selección de tiro y espaciado, agresividad física y disciplina
  operativa, cada una en ATAQUE y DEFENSA, con el percentil promedio de sus
  métricas (lo descriptivo en azul, sin percentil). Cada ítem de los tres ejes
  lleva su dimensión y su lado (`dimDe`).
- **Bloque B · la proyección de umbrales de mejora** (`proyeccionEquipo`,
  `proyeccionJugador`): cuánto vale llevar cada métrica bajo el p70 al
  percentil 70 de la liga (`valorObjetivo`, con la dirección), en puntos por
  partido y en Net Rating por 100 posesiones, con el puesto en NET antes y
  después. **Es la cuenta de posesiones con los datos reales**, no una
  regresión (`PALANCAS_EQ`, `PALANCAS_J`): tiro = Δ × 2 × tiros de campo;
  pérdida evitada = lo que rinde una jugada que termina; rebote = una jugada
  más (o una menos del rival) al valor de la jugada; libres = Δ × intentos.
  **Cada palanca se mide sola, no se suman** (se pisan entre sí). AST-PP no
  se proyecta: no tiene camino directo a puntos. Del jugador, una sola
  palanca por familia de tiro (TS%/eFG%/PPP).
- **Con la capa `pbp`, prescripciones del mapa y del reloj**: la trampa de
  media distancia (llevar el exceso de dobles largos a la parte de la liga, a
  los pts/tiro de sus otras zonas) y el final del reloj pobre (resolver antes
  el 25 % de esos tiros, al rédito de su juego armado).
- **El tono**: «Costo de oportunidad», identidad y sostenibilidad; audita el
  libreto, no lo reemplaza.

### Papel y terna

- La card de Diagnóstico se parte entre sus piezas (ejes, dimensiones y
  palancas no se cortan); en el informe la portada que la trae también
  (`:has(...)`), o saltaba entera y dejaba la hoja 1 sola. Dimensiones a 4
  columnas y palancas a 2 en papel.
- **El PDF de scouting lleva en la terna el escudo del RIVAL** analizado
  (`SCOUT_UI.__claveRival`).

Medido con el PDF real sobre la demo: informe completo 19 hojas A3 (17 en
v309: las dos de más son la proyección y las dimensiones); ficha del jugador
7 hojas A4 (5: el Diagnóstico pasó de 1 a 2 hojas). **No medido con la capa
`pbp`.**

## 144. LA FILOSOFÍA DEL EQUIPO · `DetectarFilosofiaDT` (2026-10-26)

Assets en `?v=311`. En `sgadd-conclusiones.js`: una etiqueta de identidad del
EQUIPO (no del jugador) que sale de los percentiles ya leídos contra la liga,
para calibrar el tono del Diagnóstico. **No mueve ningún corte** (70 / 40), ni
las franjas del reloj, ni la ingesta.

- Puntajes: Transición / Vértigo = percentil de PACE · Set / Control = ritmo
  bajo y PePP% alto · Perímetro / Analítica = PT3% · Físico / Interior =
  promedio de RO% y RTL%.
- Gana la mayor si llega a 60 y le saca 5 puntos a la segunda; si no,
  **Equilibrado**. Ninguna filosofía es mejor que otra (punto 4).
- `equipo()` suma `out.filosofia`; la card agrega una línea `data-filosofia`
  con la frase de identidad, la fórmula «para que sea sostenible…» y, si hay
  puntos de quiebre, el costo de oportunidad propio de ese estilo.
- Sin índice o sin percentiles devuelve `null`; el jugador no lleva filosofía.

## 145. DetectarFilosofiaDT HÍBRIDA · box score + play-by-play (2026-10-26)

Assets en `?v=312`. `DetectarFilosofiaDT(idx, e, paq)`: con el paquete de la
capa `pbp` cruza sus señales; sin él, exactamente la del punto 144.

- **Señales del play-by-play** (`senalesPbp`, PURA), todas contra la liga del
  mismo paquete y llevadas a la escala 0-100 (`escala`: 1,4 veces la liga =
  100, 0,6 = 0): ritmo (parte de los tiros en 0-7 s), triple y aro (parte de
  los tiros de Z10-Z14 y Z1-Z4 en el mapa), línea (faltas recibidas que van a
  la línea contra la mediana `cortes.linea`), cuidado (TCDP contra
  `cortes.tcdp`, menos es mejor) y bonus (cuartos del rival en bonus contra
  los propios, `faltasEq`). Lo que el paquete no trae queda en null y no pesa.
- **Tapones no entran**: el paquete no trae una vara de tapones por equipo, y
  sin vara no se compara.
- `puntajesPbp` arma las cuatro filosofías con esas señales y
  `filosofiaHibrida` promedia box y PBP donde existen los dos (si falta uno,
  manda el otro). La elección es la misma: 60 y 5 de ventaja, o Equilibrado.
- **Cómo llega a la card**: la línea del box se pinta con sus puntajes
  (`data-filosofia-box`); cuando el montaje de las conclusiones baja el
  paquete, `refinarFilosofia` la reemplaza por la híbrida y dice «box score +
  play-by-play». Un fallo deja la del box score.
- Medido sobre los 17 paquetes de la Conferencia Norte (solo PBP): 5
  Perímetro, 4 Transición, 1 Set y 7 Equilibrado.

## 173. LA MATRIZ DE TRADE-OFFS EN EL DIAGNÓSTICO · y las metas escalonadas por ciclo (2026-11-09)

Assets en `?v=368`. Todo en `js/sgadd-conclusiones.js` (sección TRADE-OFFS); `test-conclusiones.js` (sección 7) lo fija. Solo front: el módulo no está en `server/lib/compartido/`.

- **Problema**: cada palanca de la proyección (punto 143) se medía sola, sin el daño colateral en otra métrica.
- **Cómo se mide** (`tendenciasLiga`, una vez por índice, `WeakMap`): partido a partido y **dentro de cada equipo** (cada valor menos el promedio de su equipo; `pendienteDentro`, efecto fijo por grupo, grupos de 3+ partidos). Así no se confunde «los equipos rápidos pierden más» con «el mismo equipo, una noche más rápida, pierde más»: con el pool crudo el signo puede salir al revés (hay test). Es UNA pendiente para toda la liga y se rotula «tendencia de la liga»: con ~30 partidos por equipo, una propia sería ruido. **Es correlación, no causa**, y la card lo dice.
- **Estado**: firme con |t| ≥ 2 y 60+ partidos; señal débil con |t| entre 1 y 2; si no, sin tendencia. **Solo los firmes se descuentan.**
- **Pares** (`PARES_EQ`): ritmo +3 posesiones → pérdidas y rebote ofensivo; triples +5 pp de jugadas → rebote ofensivo y viajes a la línea; presión +2 pp de pérdidas forzadas → libres concedidos y acierto del rival; rebote ofensivo +3 pp → acierto del rival (la transición); viajes a la línea +3 pp → pérdidas. Jugador (`PARES_J`, su log de partidos de 8+ min): uso +5 pp → TS% y pérdidas; triples +10 pp → TS%.
- **Puntos**: el costo sale de las mismas `PALANCAS_EQ` / `PALANCAS_J` de la proyección (una sola cuenta de posesiones). El rédito del ritmo = las posesiones de más para los dos lados al neto por posesión del equipo (ORTG − DRTG); el del triple = jugadas que pasan del doble al triple a la diferencia de rédito. Al jugador no se le calcula rédito (depende de a quién se le saca el uso).
- **Medido en la demo** (544 filas equipo-partido): firmes ritmo→pérdidas (+0,12 pp por posesión, t 2,9), triples→línea (t −4,9) y presión→acierto rival (t 2,6). **Triple→rebote ofensivo y presión→libres concedidos, los dos ejemplos del pedido, NO son firmes en esta liga**: salen como señal débil y no se les cobra nada. En jugadores, uso→eficiencia no aparece (t 1,0); triples→TS% sí.
- **En cada palanca**: «⚖ Trade-off · tendencia de la liga: si se busca el umbral en X, la liga proyecta −Y en Z (−W pts)» y «Neto en el marcador». Las palancas se ordenan por el NETO, ya no por los puntos brutos.
- **Metas escalonadas** (`escalonar`): Hoy (percentil) → **Próximo ciclo** (la mitad del camino, la meta real del informe de ciclo, punto 165, con su percentil y sus puntos netos) → Umbral p70. Equipo y jugador.
- **La matriz** (`matrizHtml`, debajo de la proyección): una micro-card por par con la consecuencia, el rédito, el costo y el neto, el estado con ▲ ● ◆ (no solo color), r y n.
- Verificado al revés: cobrar las señales débiles caen 2, el ciclo en el umbral 2, sin restar el promedio del equipo 4.
- **No verificado en el navegador ni en el PDF** (hay CSS de papel: la advertencia en blanco con borde ámbar oscuro y las micro-cards sin partirse).

---

## 174. UN SOLO CRITERIO DE METAS · LOS TERCIOS DE LA LIGA (2026-11-10)

Assets en `?v=370`. `js/sgadd-escalones.js` (puro, `test-escalones.js`) es la ÚNICA lógica de
meta del Diagnóstico (proyección y trade-offs) y de Ciclos (hoja de ruta, plan, tablero, evolución).

### Lo que la auditoría encontró (tres criterios para lo mismo)
| Dónde | Antes |
|---|---|
| Diagnóstico · proyección | todo lo que está bajo P70 apuntaba a P70 (un P3 «a la mitad» caía en ~P40); clasificación 70/40 |
| Ciclos · hoja de ruta | ajuste → P70, quiebre → P40, mitad del camino; clasificación 70/40 |
| Ciclos · plan | franjas del reloj, pérdidas, T3%, transición y zona fría **enteras a la mediana** de la liga, mientras el tablero medía la **mitad** del camino (el plan decía una meta y el tablero evaluaba otra) |

### El criterio
Tercios: Inferior P0-33 · Medio P34-66 · Superior P67-100. Escalón realista = el techo del tercio
actual (P33 / P66), o el inicio del siguiente si faltan menos de 5 puntos. Superior = SE SOSTIENE
(piso P67). La meta del ciclo es la mitad del camino al escalón (`FRACCION_CICLO`). Nunca un salto
de tercio y medio, y nunca una meta peor que hoy. Los cortes verde/ámbar/rojo pasan a 67/34 en los dos módulos.

### Lo que no tiene distribución por equipo
Zonas de tiro, franjas del reloj, transición y cuartos solo conocen el valor de la LIGA: ahí la
referencia es la liga (cae en el tercio medio) a la mitad del camino (`haciaReferencia`). Es el
límite de la unificación y está dicho acá, no en la card. El plan ya no lleva nada «entero a la liga».

### Compatibilidad
`p.umbral` y `p.escalon` son el mismo objeto; `valorObjetivo` sigue exportado (por defecto P67);
`escalonar` suma el parámetro `escPct`. Cambian los textos: «Escalón realista» reemplaza a «Umbral p70».
**No verificado en el navegador ni en el PDF**, y el Ciclo 0 ya publicado conserva las metas con la
vara vieja (las reconstruidas se rearman con la nueva).


---

## 175. LA PWA · INSTALAR EL PANEL COMO APP (2026-11-10)

Assets en `?v=370`. `test-pwa.js` fija todo. Sin bundler ni tiendas: el panel se instala desde el navegador.

```
manifest.json        nombre «MotorStats», standalone, #0B1121, rutas RELATIVAS (el sitio vive en /estadisticas/)
icons/               app-192 y app-512 con FONDO TRANSPARENTE (solo el isotipo, generados con Chrome sin ventana); sin maskable: un ícono adaptable no puede ser transparente
sw.js                service worker: RED PRIMERO, caché de respaldo
js/sgadd-pwa.js      registra el SW y maneja el botón «⤓ Instalar app» (#pwaInstalar: un item más del menú, con las MISMAS clases que Principal y su ícono de descarga)
```

- **Red primero, no caché primero**: la trampa de este proyecto es la versión vieja que no se va (punto 2). Con red siempre se sirve lo publicado y cada respuesta buena se guarda; sin red abre lo último visto y una navegación cae al `index.html` guardado. La clave incluye el `?v=` de cada script.
- **Solo el propio sitio y solo GET**: la API del backend, GViz, Sheets y las tipografías son de otro origen y nunca pasan por el SW. **No es un modo offline de datos**: sin red el panel abre pero no baja planillas nuevas.
- Para invalidar todo, subir `VERSION` en `sw.js` (activate borra las cachés `sgadd-pwa-*` viejas y no toca las ajenas).
- **El botón nace oculto**: aparece con `beforeinstallprompt` (Chrome/Edge/Android) o, en iOS, siempre que no esté instalada, con la nota «Compartir → Agregar a inicio». Instalada (standalone) no se muestra. No se imprime.
- El SW solo se registra en https o localhost; todo va con try/catch: la PWA no puede tumbar el panel.
- **Lo que no se verificó**: la instalación real en un celular y en iOS (el prompt depende del navegador). Probado en un `vm` y en el navegador de la vista previa.

---

