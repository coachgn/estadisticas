# Fichajes y LNB

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 87. FICHAJES · EL MERCADO DE JUGADORES DE UN TORNEO (2026-10-05)

Pedido: una sección para buscar jugadores en TODO un torneo y devolver su
«Radiografía ADN» —lo que se va a encontrar en cancha—, con comparación y
PDF para dirigentes, entrenadores y representantes. Visible solo para el
admin y para mails habilitados. `test-fichajes.js` fija todo lo de acá.

### Las dos decisiones (consultadas antes de escribir)

1. **Padrón propio en KV**, mail → torneos, editable solo por el admin. El
   mail tiene que poder entrar al panel (cliente de algún club); no hay
   login nuevo. Se descartó «servicio por club» porque el pedido era por
   mail, y «cuenta sin club» porque suma un flujo de alta y clave entero.
2. **Edad, posición y talla son una FICHA MANUAL** en KV, por torneo, que
   carga el admin. La planilla no las trae (punto 9) y no se estiman —es
   la regla del dato inventado que sacó los nombres del scouting—. Scrapear
   la página del jugador de Gesdeportiva quedó afuera por el
   `INFORME_PERMISOS_CAB.md` de `motorstats-ingestion`.

### Lo que SÍ es seguridad: el servidor

`server/rutas/fichajes.js`. El libro SIN recorte de un torneo solo sale de
ahí, y solo para el admin (`ADMINS`, en el código) o un mail del padrón,
y solo de los torneos de su registro.

```
GET  /api/v1/fichajes                  los torneos que ve la sesión (403 NO_HABILITADO)
GET  /api/v1/fichajes/:torneo/:zona    libro completo de la zona + fichas manuales
POST /api/v1/fichajes/:torneo/fichas   ADMIN · { cambios: { "NOMBRE|EQUIPO": ficha } }
GET  /api/v1/fichajes/padron           ADMIN
POST /api/v1/fichajes/padron           ADMIN · { email, torneos: [...], nota }

Upstash  sgadd:fichajes:padron              HASH · un campo por mail
         sgadd:fichajes:fichas:<torneo>     HASH · un campo por jugador
```

- **El padrón se lee en CADA pedido, sin caché**: sacar a alguien corta el
  acceso en el próximo clic.
- **KV caído con un no-admin: 503**, nunca «habilitado por las dudas».
- **Campo por campo (HSET), nada se borra**: `torneos: []` deshabilita y
  deja el registro; una ficha vacía queda `{}`. Igual que los estados del
  punto 57.
- Solo `tipo: 'torneo'`: un club no se habilita como si fuera un torneo.
- Ningún sheetId en las respuestas; `ID_ARCHIVO` sale con
  `sinColumnasOcultas`.
- **Verificado al revés**: abrir `torneosHabilitados` a todos tira 7 tests;
  sacar el guard de `OTRO_TORNEO`, 2.

### El gate del panel · una regla nueva, `servicio`

`MODULOS.fichajes = { servicio: 'fichajes' }`. Se mira ANTES que
`sinRestricciones`, igual que `soloAdmin`, porque falla CERRADO también
para ABIERTO (el visitante sin sesión que ve el resto del panel). El
servicio NO viene en el token ni en la URL: lo fija
`SGADD_FICHAJES.iniciar()` con lo que contesta `/api/v1/fichajes`, y
cambiar de sesión lo vacía. El motivo nuevo `REQUIERE_SERVICIO` tiene su
texto en `sinAcceso()` («servicio por invitación»: ni interno ni de plan),
y el menú no lo ofrece a quien no lo tiene. El item nace `hidden` para no
parpadear.

**La sección va ANTES del modo landing y del modo llave** en
`renderSeccionCruda`: no depende del club abierto. Entrando directo por
`#fichajes`, el guard corre antes de que el servidor conteste; al llegar la
respuesta se vuelve a pasar por `renderSection`.

### El motor · `sgadd-mercado.js`, puro y compartido

Ficha manual (`normalizarFicha`, `edad` —con el año solo, aproximada—),
padrón (`torneosHabilitados`, `normalizarHabilitacion`: mail normalizado
como los admins, sin tocar los puntos de Gmail), `filtrar`, `ordenar`,
`ejesRadar` y `mejorPorMetrica`. El servidor lo copia
(`sincronizar-compartido.js`) y valida con las mismas funciones.

- **Un filtro de ficha o de métrica deja AFUERA a quien no tiene el dato, y
  lo CUENTA** (`sinDato`): la pantalla dice «N quedaron afuera por no tener
  el dato pedido». Un jugador sin ficha no es uno que no cumple.
- Los rangos van por VALOR («TS% ≥ 55», como lo escribe un entrenador) o
  por PERCENTIL contra su zona.
- Los perfiles técnicos pedidos se exigen TODOS; la función puede contar
  la faceta secundaria.
- Los vacíos van al final del orden en las dos direcciones.

### La UI · `sgadd-fichajes.js`

- **Cada zona es su propio índice**: los percentiles se miden contra su
  zona, y la comparación entre jugadores de zonas distintas va por
  percentil. El índice declara el nivel de la zona (`idx.liga.nivel`), así
  que la vara es la del torneo y no la del club abierto.
- **El ADN sale de `jugadoresAdnLiga()`**, el motor de la ficha. La
  postemporada interzonal no entra a la búsqueda.
- **Radiografía ADN**: identidad y ficha manual, función, ADN, KPIs, radar
  de ocho ejes (percentil promedio; un eje sin dato es un HUECO, no un
  cero), «Lo que vas a ver en cancha», percentiles contra la zona,
  tendencia (últimos 5 contra el tramo, local/visitante), cómo terminan
  sus jugadas y perfiles parecidos (similitud del punto 58).
- **Comparar** hasta cuatro, con radar superpuesto y el mejor de cada fila.
- **Accesos a Fichajes** (solo admin) adentro de la sección: alta, edición
  y deshabilitar. No en el Panel Master, para no tocar ese módulo.
- **El radar y las líneas son SVG**, no Chart.js: salen iguales en papel.
- La tendencia filtra los partidos por EQUIPO (el homónimo del punto 86).
- Tipear en el buscador repinta solo los resultados (punto 13).

**`PT2%` NO es la parte de sus puntos.** Es `T2I / PLAYS`: la parte de sus
JUGADAS que termina en doble; el resto termina en pérdida. La primera
versión decía «el 53 % de sus puntos llega de doble» y la suma daba 91 %.
Se lee «de cada 100 jugadas, 53 terminan en doble… 10 en pérdida», y la
barra suma la pérdida para cerrar en 100.

### El PDF · la ficha de fichaje

`modo-fichaje-print` + `#fichajeSalida`, el mismo mecanismo que la ficha
individual (punto 7.6 ter), **A4 vertical**, con su propio guard, el pie
institucional y nombre «Fichaje <Jugador>». **Medido generando el PDF real**
(Chrome headless por CDP sobre la demo): 2 hojas; la 1 con cabecera,
perfil y radar, lectura en dos columnas y los cuatro grupos de
percentiles; la 2 con tendencia, jugadas y parecidos. Lo que costó: la
etiqueta «Tiro exterior» del radar se cortaba en la hoja (margen 62) y la
tabla de jugadas se partía en renglones (encabezado propio).

### Pendiente

- **Desplegar el backend** (`cd server && npx vercel --prod`): sin eso
  `/api/v1/fichajes` no existe y nadie ve la sección.
- **Cargar el padrón** desde «Accesos a Fichajes» y las primeras fichas
  manuales: hoy no hay ninguna.
- La Liga Argentina 2026-27 no tiene libro todavía (punto 67): hasta que
  MotorStats lo escriba, el torneo aparece con sus zonas «sin libro».

---

## 89. FICHAJES · VOLUMEN DE TIRO, ESCALA DE PUESTOS Y ESCUDOS QUE SE LEEN (2026-10-05)

`test-fichajes.js` fija todo lo de acá (124 tests).

### 1 · El volumen al lado del acierto

Un 45 % de triple sobre 0,8 intentos y sobre 7 no es el mismo tirador. Junto
a cada acierto va «convertidos/intentados» (`SGADD_MERCADO.textoVolumen`:
`5,2/11,4` por partido, `166/365` en el total; `null` si falta uno de los dos,
porque «—/11,4» se leería como cero convertidos):

- en la **card**: `TC · T3 · TL` con su acierto;
- en la **Radiografía** y el **PDF**: el bloque «Volumen de tiro» (por
  partido, acierto y total del tramo) y la fila de T3%/T1% con su volumen;
- en el **buscador**: intentos por partido (`TCI`, `T2I`, `T3I`, `T1I`, con
  percentil) y en el total (`tot:TCI`, `tot:T3I`, `tot:T1I`, SIN percentil:
  son el tamaño de la muestra). Pedir un total «por percentil» filtra por
  valor y lo avisa.

**El total sale de `ACUMULADO J` y, si falta, de SUMAR su log partido a
partido con SU equipo.** La demo trae `ACUMULADO J` para 16 de 260
jugadores; el log está para todos y cierra exacto (medido: 555 tiros = 17,34
× 32 PJ). Nunca de multiplicar el promedio.

**El volumen no es una virtud.** La primera Radiografía puso «Tiros de campo
int. (17,3, p100)» como lo que lo distingue: tirar mucho no es tirar bien.
Fortalezas y fisuras salen solo de las métricas de RENDIMIENTO.

### 2 · La escala de puestos · 1 | 1-2 | 2 | 2-3 | 3 | 3-4 | 4 | 4-5 | 5

Un selector, nueve puestos. El híbrido CUBRE sus dos puestos: el primer
número es el principal y el segundo su **faceta secundaria**, la misma idea
que los secundarios del rol funcional (punto 46). En el buscador se pide en
la escala simple (1 a 5) con «Contar los puestos híbridos por su faceta
secundaria», como la función en cancha: un 2-3 aparece pidiendo escoltas y,
con la casilla, también aleros.

- Solo se combinan puestos VECINOS: un «1-3» se rechaza, en el panel y en
  el servidor (mismo motor, `idPosicion`). Se acepta «2/3», «3-2», guion
  largo.
- **Las fichas de la escala vieja se leen sin migrar**: el nombre es su
  número y nombre + secundaria VECINA se pliega al híbrido (Escolta + Alero
  → 2-3). Una secundaria no vecina se descarta, sin inventar un híbrido.
  La ficha ya no guarda `secundaria`.

### 3 · Los escudos se leen · el fondo sale de su propio dibujo

**Auditoría.** `.escudo-hub` (Panel Master) ya tenía fondo blanco por este
motivo, pero `.escudo-aro` —grillas de equipos, menú— seguía con
`rgba(255,255,255,.04)`, y Fichajes ponía la imagen suelta. Un fondo único no
sirve: el blanco que salva al trazo oscuro borra al blanco, y al revés en el
papel.

**`SGADD_UI.tonoEscudo` MIDE cada escudo al cargar**: lo dibuja en un canvas
de 48 px y lee la luminancia (WCAG) de sus píxeles visibles (`tonoDePixeles`,
PURA). Lo marca con `data-tono` y el CSS hace el resto:

```
opaco   < 4 % transparente: trae su fondo, no se toca
oscuro  > 45 % de píxeles oscuros o media < 0,15 → disco #E5E7EB en PANTALLA
claro   > 60 % claros o media > 0,6           → disco #374151 en el PAPEL
medio   se lee sobre los dos
```

Un listener de `load` en CAPTURA para todo el documento alcanza a los quince
lugares que pintan escudos sin tocar ninguno. Un escudo de otro origen
ensucia el canvas: queda sin marca, como antes. El logo de MotorStats no se
toca.

**Medido con los 36 escudos del repo**: 11 opacos (los JPEG de Liga
Argentina, Estrella, Náutico), 17 medios, 3 claros (Juventud, Los Hornos,
Mayo) y 5 oscuros (CEYE, Deportivo La Plata, Meridiano, Unión Vecinal, Villa
Elisa) — esos cinco pasan a disco claro y se leen.

**Lo que costó: `willReadFrequently`.** Con esa opción Chrome dibuja el canvas
por software y reduce la imagen de otra forma: Villa Elisa (53 % oscuro, el
caso límite) daba «medio» y seguía ilegible. Se mide sin ella, con
suavizado de alta calidad, y el umbral bajó a 45 %.

---

## 90. FICHAJES · EL PERÍODO: FASES Y CALENDARIO DESDE–HASTA (2026-10-05)

Pedido: acotar la búsqueda de Fichajes —y todo lo que muestra— a una fase o
a un rango de días. `test-fichajes.js` fija todo lo de acá (151 tests).

### Las dos modalidades, y por qué no se mezclan fases

- **Fase**: un selector con los TRAMOS que trae el libro
  (`combinacionesTorneoFase`: «IDA · REGULAR», «Total · REGULAR»…). Sin
  fechas, la vista es el índice de ese tramo, o sea lo que declara la
  planilla.
- **Calendario Desde–Hasta** (`<input type="date">` acotado al primer y
  último día con partidos): acota DENTRO de la fase. Una regular y unos
  playoffs no se combinan nunca (punto 3 ter): juntarlos no significa nada.

### Con fechas, el índice se RECONSTRUYE con el motor del TOTAL

`SGADD_MERCADO.recortarHojas` (PURA, compartida) deja en `Base Datos E` y
`Base Datos J` solo los partidos del período, y `construirIndice(...,
{ torneo: '*TOTAL*' })` rehace todo con el mismo motor que el TOTAL de una
fase: volumen sumado y dividido por PJ, tasas sobre los totales (USG%, RO% y
RD% con el denominador del equipo). No hay un segundo cálculo de tasas.

**Medido antes de escribirlo**: reconstruido desde el log SIN recortar, los
124 calificados de la demo coinciden con `PROMEDIOS J` (<1 %) en PJ, MIN, PTS,
PLAYS, TS%, eFG%, USG%, T3I, PPP, RTL%, PR y PePP%. **Verificado con un
recorte**: JUGADOR 67 del 1/1 al 28/2 da 12 PJ y 21,92 PTS, lo mismo que
sumar su log a mano. Rompiendo el filtro de fechas caen 8 tests.

- **Recorte a recorte cambia todo**: promedios, percentiles (contra la zona
  EN ese período), volumen por partido y total, radar, la tendencia de los
  últimos 5 y local/visitante.
- **El que no jugó en el período queda afuera y se cuenta**: «N jugadores sin
  partidos en el período quedaron afuera».
- **Una planilla de jugador sin fecha** se ubica por su PARTIDO si ese texto
  tiene UNA sola fecha; con dos (ida y vuelta con el mismo local) no se
  puede saber la noche: queda afuera y se cuenta (`sinFecha`).
- **Una zona que no jugó el tramo elegido** queda afuera, y se dice.

### AST% también en el modo reconstruido (desde v266)

Hasta la v265 AST% se dejaba en blanco en un período, porque el núcleo le
aplicaba al jugador la fórmula del equipo. Corregido en el núcleo (punto 24):
el período ahora lo muestra con valor, percentil y referencia, y el badge ya
no avisa su ausencia.

### La card dice de dónde tira: «TC - T2» / «TC - T3»

La línea de volumen de la card del buscador rotula el tiro de campo con su
familia de MÁS intentos (`SGADD_MERCADO.tiroPredominante`, PURA: sin libres;
empate → doble; sin tiros de campo → nada), con su volumen y su acierto;
después va la otra familia de campo y los libres. «TC» a secas mezclaba
dobles y triples.

### La pantalla

- **El badge «Período activo»** —tramo, días, partidos analizados, excluidos—
  va FUERA del panel plegable de filtros, en la Radiografía y en el PDF: un
  percentil sobre doce partidos no se lee igual que uno sobre la temporada.
- **Cada período se calcula UNA vez por zona y queda en caché**
  (`zona.vistas`). Medido en la demo con 260 jugadores: ~1 s uno nuevo
  (rehace el índice y reetiqueta el ADN de todos), 80 ms uno ya visto. El
  nuevo avisa «Recalculando la muestra del período…» antes de congelar.
- «Desde» posterior a «Hasta» se rechaza; el período no viaja de un torneo a
  otro; guardar una ficha la refresca en todas las vistas sin rehacer
  índices.

### Comparar trae «Contra su zona», en el mismo orden que la Radiografía (v267)

`SGADD_MERCADO.GRUPOS_METRICAS` fija el orden de la lista —Volumen ·
Eficiencia · Volumen de tiro · Creación · Rebote y defensa— y
`metricasPorGrupo(conTotales)` la arma. La usan la Radiografía, su PDF y
Comparar: con un orden por pantalla, el mismo jugador se leería distinto.
En Comparar cada celda trae lo que la fila de la Radiografía (valor,
convertidos/intentados del acierto, barra y percentil contra SU zona, con la
mediana de su zona en el `title`); los totales del tramo van dentro de
Volumen de tiro, sin percentil.

---

## 91. FICHAJES · PUERTAS DURAS Y % DE COINCIDENCIA (2026-10-05)

Auditado y aprobado por el club antes de escribir código. Medido en la demo
(260 jugadores) antes de decidir:

- **El orden de los filtros no cambiaba nada**: `filtrar()` es una
  intersección y da lo mismo en cualquier orden. Lo que importa es qué
  descarta y qué suma.
- **Minutos y jerarquía están ANIDADOS**: todo Franquicia es Clave (19/19) y
  todo Pocos Minutos es Especialista (116/116). Combinaciones como
  Franquicia + Rotación daban cero sin decir por qué.
- **Los perfiles técnicos son escasos**: el 50 % no tiene ninguno; pedirlos
  «todos» como filtro duro vaciaba la búsqueda.

### El modelo · `SGADD_MERCADO.evaluar(filas, crit, ctx)`

**Puertas duras** (`filtrar(…, { soloPuertas: true })`): zona y período (la
vista), muestra mínima, texto, equipo, «juega», la ficha manual y los rangos
marcados **obligatorios**. **Todo lo demás suma**:

```
coincidencia = Σ peso·puntaje / Σ peso      — solo sobre lo que se pidió
función 35 · perfiles 25 · rangos 15 · minutos 15 · jerarquía 10   · piso 60 %
```

| Nivel | Puntaje |
|---|---|
| Función | 1 mismo rol · 0,6 faceta secundaria · 0,5 mismo eje · 0,25 mismo lado (`ORIGEN_ROL`) · 0 |
| Perfiles | la parte de los pedidos que tiene; el que falta, por su cercanía al corte (tope 0,9) |
| Rangos | 1 adentro; afuera `1 − Δpercentil/25` (en el percentil de SU zona); un total sin distribución, por distancia relativa |
| Minutos | 1 misma banda · 0,75 a menos de 2 min del borde · 0,5 la de al lado · 0 |
| Jerarquía | 1 la misma · 0,5 la de al lado · 0 |

- **Minutos y jerarquía pesan lo mínimo a propósito**: dependen de su
  plantel y de su DT. Como filtro duro escondían al Especialista de élite de
  un plantel profundo, que es el fichaje subvaluado.
- **La confianza va APARTE** (`confianza(f)`, punto 4): Alta 10+ PJ, 15+ min y
  60+ tiros de campo en el tramo; Media 5+ PJ y 8+ min; Baja el resto. Ordena
  solo al empate.
- **`filtrar()` sin opciones sigue siendo todo duro**: lo usan otros
  llamadores y tests.

### La cercanía de un perfil sale del MISMO lugar que la etiqueta

Cada `PERFILES_TECNICOS[i]` declara `condiciones(j, prom)` y de esa lista se
derivan `calza` (todas, con su operador) y `jugadoresCercaniaPerfil`
(producto de `valor/umbral` de las que no cumple, tope 0,9). Con `calza`
escrito aparte, el umbral de la búsqueda y el de la etiqueta divergen (el
bug del rol funcional, punto 8). Verificado en la demo: los conteos de los
seis perfiles quedaron idénticos (75/42/28/33/12/4) y cercanía 1 ⇔ calza en
los 260.

### El panel, de lo general a lo particular

1 Zona y período · 2 Muestra mínima · 3 Rol por minutos · 4 Jerarquía ·
5 Función · 6 Perfiles · 7 Rangos (y la ficha manual, plegada, como filtro
duro). Cada nivel dice si es filtro duro o cuánto suma. Cada opción lleva
cuántos jugadores la tienen (`conteosFacetas`, minutos × jerarquía
CRUZADOS) y la que da 0 se deshabilita; si lo elegido no se cruza en nadie,
se avisa.

La card muestra el % (con el desglose en el `title`), la confianza y lo que
no cumple. «% de coincidencia» es el orden por defecto; sin criterios
puntuables cae a Puntos.

### «Buscar parecidos en todo el torneo» (Radiografía)

La similitud del punto 58 (función 50 · perfiles 30 · jerarquía 20, con
volumen comparable) contra TODAS las zonas, con el mismo piso del 60 %.
Vista `parecidos`, con las mismas cards y la confianza.


---

## 92. LA LNB 2026-27 · TORNEO, ESCUDOS Y PADRON J EN FICHAJES (2026-10-07)

Pedido: integrar la Liga Nacional que carga el piloto de ingesta
(`motorstats-ingestion`, `INFORME_INGESTA_LNB.md`).

- **Torneo**: `torneos/liga-nacional-2026-27.json`, ZONA ÚNICA (`unica`,
  slug `lnb-2026-27`), 18 equipos con su id de Gesdeportiva, nivel
  `LIGA_NACIONAL`, calendario del fixture (parcial, hasta 31/01/2027). Lo
  genera `motorstats-ingestion/herramientas/torneo-lnb.js`. Alta en KV con
  `catalogo.js torneo --libro "unica=<id>"` el 2026-10-07: sin clientes
  enganchados.
- **Escudos**: `logos/liga-nacional/`, 18 `.jpg` con slug del club y su
  `index.json` (`motorstats-ingestion/herramientas/escudos-lnb.js`).
- **Fichajes lee `PADRON J`** (`server/lib/padron-j.js`): el libro de la zona
  trae el nacimiento de cada jugador (y puesto y talla si alguien los cargó).
  `manejarZona` lo lee aparte de las 9 hojas y COMPLETA las fichas: la ficha
  manual del admin gana campo por campo. Un libro sin la pestaña —todos salvo
  la LNB— responde igual que antes. La respuesta suma `padron: {leido, filas,
  conDatos, completadas}`, y `fichasLeidas` es verdadero si se leyó KV o el
  padrón.
- **Lo que el panel todavía no dibuja**: el motor v114 ya escribe en las hojas
  madre ENTRENADOR, ESTADIO, HORA, parciales e ids (`Base Datos E`) y
  TITULAR, DORSAL e ID_JUGADOR (`Base Datos J`), y `PADRON J` trae la FOTO.
  El validador ignora esas columnas (no son ni `req` ni `opt`), así que no
  hacen ruido en los libros que las reciben vacías. Mostrarlas es trabajo de
  vista pendiente, y choca con la regla de no hablar de titularidad (punto 8):
  ahora el dato existe, pero solo en los libros de la ingesta automática.

## 93. LOS INSCRIPTOS DEL TORNEO · LOS 18 DE LA LNB A LA VISTA (2026-10-07)

Pedido del club: la plataforma mostraba 11 de los 18 equipos de la LNB porque
el libro solo trae a los que ya jugaron. Regla: lo que el libro no tiene se
completa con lo que publicó la liga (`torneos/<id>.json`), y recién si
tampoco está ahí no existe.

- **`js/sgadd-inscriptos.js`** (motor puro + UI, `test-inscriptos.js`): saca
  los equipos de `zonas.<zona>.equipos` y los cruza contra el libro por
  `claveEquipo` (nombre y alias). Los que no cruzan son los «faltantes».
  Comparte el documento con el Fixture (`SGADD_FIXTURE.cargarTorneo`) y
  repinta la sección abierta una sola vez cuando llega.
- **NO TOCA EL ÍNDICE.** Un equipo sin partidos en `construirIndice()`
  movería medianas, percentiles y el grupo de pares (la razón del punto 44).
  Las vistas reciben una lista aparte.
- **Guarda de alias**: si el libro tiene un equipo que el torneo no reconoce,
  no se completa NADA y se avisa por consola: con alias incompletos un
  faltante puede ser ese mismo equipo escrito distinto.
- **Clasificación**: `SGADD_CLASIF.tabla(idx, {inscriptos})` los agrega AL
  PIE, alfabéticos, con PJ/PG/PP en 0, los cocientes en «—», sin puesto
  visible y SIN ZONA. Zonas y leyenda siguen sobre los que jugaron. El
  rótulo dice «18 equipos · 7 sin partidos». En pretemporada la sección
  muestra la tabla en 0; el resumen recortado de Principal, el cartel.
- **Equipos**: el picker los suma con «Sin partidos»; su ruta abre la
  ficha mínima (`inscriptosFichaMinima`): escudo, nombre, ciudad, el aviso
  «Sin datos estadísticos registrados aún (Temporada …)» y los próximos 5
  partidos del calendario. Pasa por `puedeVerEquipo` como cualquier ficha.
- **Scouting**: el selector los ofrece en el grupo «Sin partidos todavía»;
  elegir uno muestra el aviso y su ficha mínima en vez del informe.

## 95. ESCUDOS DE LOS INSCRIPTOS Y FOTOS DE LOS JUGADORES (2026-10-07)

- **Escudos de los 7 sin partidos**: salían con iniciales aunque el `.jpg`
  estaba en `logos/liga-nacional/`. `precargarLogos()` resuelve solo los
  nombres del ÍNDICE y `LOGOS.getUrl` lee un caché que nadie les llenaba.
  `inscriptosFaltantes` ahora los pide (`inscriptosPedirEscudos`, una vez
  por nombre) y el hook de LOGOS repinta al llegar.
- **Fotos de los jugadores**: `PADRON J` trae FOTO = `/fotos/<idJugador>`,
  relativa al sitio de la liga. El handler de datos lee la pestaña SOLO en
  categorías de un torneo (en paralelo con el libro, un fallo da `{}`) y
  manda `fotos` (clave `clavePersona(NOMBRES)|claveEquipo(EQUIPO)` → ruta)
  solo de los jugadores que viajan en `PROMEDIOS J` del libro RECORTADO
  (`padron-j.js`: `fotosDelPadron`, `fotosDelLibro`). Pasa solo
  `/fotos/<n>` o una URL https: termina en un `<img>`.
- **El panel arma la URL** con `fuente.base` del archivo del torneo (el
  servidor no lee fuera de `server/`): `torneoFotoJugador`,
  `torneoImagenJugador` en `sgadd-inscriptos.js`. La foto va en el
  encabezado de la ficha del jugador y en las cards del plantel, en
  círculo; si no carga, cae al escudo. El PDF sigue con el escudo: una
  imagen de otro dominio puede no estar cargada al imprimir.
- La foto se sirve desde el sitio de la LNB (hotlink, `no-referrer`): si la
  liga la cambia o la saca, se ve el escudo.

---

## 100. LA VISTA DEL CLIENTE ENGANCHADO A UN TORNEO Y FICHAJES DE ADMINISTRACIÓN (2026-10-09)

Revisado desde el panel de Boca (cliente PLATA, categoría `boca-lnb-27`
enganchada a `liga-nacional-2026-27 / unica`, MISMO libro que el torneo).
Assets en `?v=275`.

### Por qué Boca no veía Quintetos, Mapa de tiro ni lo nuevo del post-partido
Todo eso es la capa de laboratorio `pbp`, y fallaba por dos lados:
1. **La capa no estaba habilitada en SU categoría** (`laboratorio: []`). La
   regla no cambia: un cliente la ve solo si su categoría la tiene. Se
   habilita con `catalogo.js laboratorio --club boca --categoria boca-lnb-27 --capas pbp`.
2. **Los datos estaban en otra clave.** La ingesta sube una vez por zona de
   torneo (`sgadd:pbp:liga-nacional-2026-27:lnb-2026-27`) y el panel de Boca
   pedía `sgadd:pbp:boca:boca-lnb-27`, vacía. Ahora `/api/v1/pbp` resuelve
   con `claveDeDatos`: una categoría con `torneo` + `zona` lee SU hash si
   tiene el campo y, si no, el de la zona del torneo
   (`TORNEOS.categoriaDeZona`). El permiso se decide igual que antes, con la
   categoría del cliente. Jujuy, que sube su análisis aparte, sigue leyendo
   el suyo. El front no cambió: pide con su club y su categoría.

### Scouting
Fotos, dorsales y mapa ya salían para el rival (las fotos y dorsales se
filtran contra `PROMEDIOS J`, que no se recorta). Se sumó la badge
«TITULAR (X/Y)» compacta en `scoutNombreJugador` (tablas, marcas, resto y
fichas). Lo único que PLATA no ve es el bloque `scouting.fichas` (ORO): es
regla comercial y no se tocó.

### Fichajes, de administración
- `MODULOS.fichajes = { soloAdmin: true, soloLiga: true }`: ningún cliente
  la ve (con o sin padrón) y el admin tampoco cuando está parado en un club
  cliente. `SGADD_AUTH.fijarContextoClub('club'|'torneo'|null)` lo fija
  `index.html` al resolver el club del catálogo (`s.tipo`), antes del
  primer pintado del menú. Las reglas con `soloLiga` se miran antes que
  `soloAdmin` en `tieneModulo` y `puedoAcceder`.
- `SGADD_FICHAJES.iniciar()` ya no le pregunta al servidor si la sesión no
  es de admin.
- El padrón y la API del punto 87 quedan como estaban (el servidor sigue
  aceptando a un mail del padrón): esto es el gate del panel.

## 137. LA CARPETA DE ESCUDOS DE UN CLIENTE ES LA DE SU TORNEO (2026-10-21)

Reportado: Lanús, dado de alta desde el Panel Master en la LNB, salía sin
escudos ni color en su sesión; la vista del torneo los tenía. Assets en
`?v=296`.

**Medido en KV (solo lectura):** `lanus.liga = liga-argentina` (Boca y el
torneo dicen `liga-nacional`) y sin `acento`. `aplicarDatos` arma
`LOGOS.CFG.basePaths` con la liga del CLUB, y los escudos de la LNB viven en
`logos/liga-nacional/`: ni el suyo ni el de los rivales. El color «Del
escudo» del alta tampoco pudo proponer nada, porque el hub buscó el escudo
en esa misma carpeta. La causa en la pantalla: `elegirTorneoZona` solo
completaba la liga si el campo estaba vacío.

- **Servidor (`alta`)**: un club NUEVO enganchado a un torneo toma la liga
  del torneo, aunque el pedido traiga otra. Uno que ya existía conserva la
  suya, salvo vacía.
- **Hub**: al crear, elegir torneo y zona escribe la liga del torneo.
- **Catálogo**: cada categoría enganchada del cliente (y del admin) suma
  `ligaTorneo`. `CLUB.reconciliarConfig`, para un club **sin JSON**, usa esa
  liga si todas sus categorías dicen la misma (con dos, no elige). Así Lanús
  se arregla sin escribir en KV.
- **Color**: un club sin JSON y sin `acento` lo deriva del escudo del header
  una vez (`acentoDelEscudo`, el mismo `colorDeImagen` del alta). Un escudo
  blanco y negro deja el tema por defecto.

Tests: `test-torneos.js` (3) y `test-alcance.js` (3). **No verificado en el
navegador con la sesión de Lanús.** Para que llegue: deploy del backend
(`ligaTorneo`) y push del front. Opcional, para dejar el dato prolijo en KV:
corregir la liga de Lanús a `liga-nacional` y publicar su color desde el
Panel Master.

## 138. EL «RATE LIMIT EXCEEDED» DE PAGES · 200 SONDEOS DE ESCUDOS POR CARGA (2026-10-21)

Reportado tras el punto 137: GitHub Pages contestó «Rate limit exceeded».
**No era un bucle**: medido con la sesión de Lanús (front y API locales,
KV real), 250 peticiones en el arranque, ninguna repetida y cero nuevas en
15 s. **199 eran 404 de escudos**: con el manifiesto de la liga ya
cargado, a cada equipo que no figuraba se lo sondeaba a ciegas (8
extensiones × 2 carpetas × variantes del nombre). Unos pocos F5 llegan al
límite. Assets en `?v=297`.

- **`resolverUno` (LOGOS, `index.html`)**: con un manifiesto no vacío, un
  equipo ausente no va a la red a ciegas. Se prueban el alias del JSON
  (`aliasLogos`) y las variantes del nombre (`nombresArchivo`) que
  coinciden con un ARCHIVO del manifiesto. Sin manifiesto, el sondeo de
  siempre. Las cuatro carpetas tienen manifiesto completo.
- Medido con los nombres de equipo de los `torneos/*.json`, viejo contra
  nuevo: **los mismos escudos en las cuatro ligas (cero diferencias)**;
  peticiones la-plata 191 → 29, liga-argentina 191 → 36, bahía 29 → 13.
  Arranque de Lanús: 250 → 60, cero 404.

**El dato de Lanús**: `lanus-lnb-27` lee el libro de la LNB pero quedó
enganchada a `liga-argentina-2026-27 / sur`. Por eso el punto 137 le manda
`ligaTorneo: liga-argentina` y sigue sin escudos. El hub manda el enganche
explícito cuando «Torneo y zona» difiere del libro elegido, y el explícito
pisaba al del libro. **`alta` ahora rechaza (`ZONA`) un `libroDe` de una
zona con un enganche a otra.** Corregir Lanús es una escritura de KV:

    node server/bin/catalogo.js vincular --club lanus --categoria lanus-lnb-27 --torneo liga-nacional-2026-27 --zona unica

(y su `liga` a `liga-nacional`). Tests: `test-logos.js` (2) y
`test-torneos.js` (2).

