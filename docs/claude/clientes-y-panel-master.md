# Clientes y Panel Master

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 6. Multi-cliente

Un solo deploy. `index.html?club=jujuy` carga `clubes/jujuy.json`, que define
marca, color, liga, patrón de equipo propio, sufijos y planillas.

- **La config es OPCIONAL.** Si el JSON no carga, la app funciona con los
  defaults de Reconquista. Nunca puede tumbar el dashboard.
- **`aplicarDatos()` y `aplicarUI()` están separadas** a propósito: un detalle de
  presentación (el header todavía no está en el DOM) no puede bloquear la
  aplicación del catálogo de planillas.
- **Al cambiar de club se limpia todo**: `LOGOS.reset()` y `SGADD.limpiarCache()`.
  Dos ligas pueden tener un "Atenas" cada una con escudo distinto.
- **El color de marca se aclara automáticamente** para usarlo como texto
  (`--acento-texto`). El azul de Jujuy da 2.84 de contraste sobre la card oscura,
  abajo del mínimo WCAG de 4.5. Se mezcla con blanco hasta que pasa.

Sumar un cliente = un JSON + su carpeta de escudos. Cero código.

> **Desde 2026-09-11 el JSON ya no es obligatorio para las CATEGORÍAS**:
> cuando el servidor tiene al club, salen de su catálogo y el JSON queda
> para la marca. Un alta desde el Panel Master deja el panel andando sin
> un commit. Ver el punto 53.

**Verificado sumando DEPORTIVO el 2026-08-24**: alcanzó con
`clubes/deportivo.json`. No hay lista de clubes en ninguna parte —
`?club=<id>` resuelve `clubes/<id>.json` por convención— así que no se tocó
un solo `.js` ni hizo falta subir el `?v=`.

Dos cosas que sí hay que mirar al sumar uno:

- **El `patronEquipoPropio` tiene que discriminar dentro de SU libro.** En
  el de DEPORTIVO juegan **DEPORTIVO LA PLATA** y **DEPORTIVO SAN**
  **VICENTE**: con el patrón corto —`DEPORTIVO`— los dos serían el equipo
  propio, y el panel trataría a un rival como propio en scouting, en los
  informes y en el plantel, sin ningún síntoma visible. Hay un test que
  falla si el patrón vuelve a ser la palabra suelta.
- **La planilla tiene que ser pública.** El panel es estático y lee por
  GViz anónimo: un libro compartido solo con su dueño da **401** y la
  categoría no carga, aunque desde el navegador del dueño se vea perfecta.
  Es lo que pasó con DEPORTIVO al darlo de alta. El permiso que hace falta
  es *Cualquiera con el enlace · Lector*.

**El acento sale del escudo, no de la intuición.** El azul de DEPORTIVO
(`#09086E`) se muestreó de su propio PNG —cubre el 67% de la superficie— y
el sistema lo acomoda solo: `aclararHastaLegible()` lo lleva a `#9090be`
para texto sobre la card (**contraste 6,07**, medido) y para el papel lo
deja como está, porque un azul tan oscuro sobre blanco ya pasa de sobra.

**Los escudos son del CLUB, no del equipo.** `ATENAS 'B'` y `PLATENSE 'B'`
usan el mismo archivo que sus `'A'`; se resuelve con una entrada más en el
manifiesto, igual que ya existía `atenas` / `atenas a`.

**El manifiesto (`logos/<liga>/index.json`) mapea clave → archivo**, así que
el nombre del archivo NO tiene que ser el slug. Eso permite subir el escudo
como venga, pero tiene un filo: al subir los de la U23 por la web de GitHub
se renombró `atenas-a.jpg` y se borraron `reconquista-a.png` y
`banco-provincia-a.webp`, y el manifiesto quedó apuntando a los nombres
viejos. Resultado: **la U23 ganó sus escudos y Primera perdió tres**, sin
aviso — el panel de faltantes solo mira la categoría abierta. Un club puede
estar en varias categorías con claves distintas (`reconquista` en U23,
`reconquista a` en Primera), así que **el manifiesto tiene que cubrirlas
todas**. Hay un test en `test-logos.js` que falla si alguna entrada apunta a
un archivo que no existe.

### El acento de marca NUNCA se pinta crudo sobre la card

`CLUB.TEMA.acento` es la marca tal cual la declaró el cliente: sirve para
un escudo o un borde grueso. Como **color de texto o de línea fina** sobre
la card oscura depende de cuán oscuro sea, y eso cambia por cliente.

Medido con DEPORTIVO, cuyo azul de escudo es `#09086E`: la tabla de
métricas clave pintaba los valores del tercil medio en **contraste 1,12**,
o sea invisibles. Con el naranja de Reconquista el mismo código se veía
bien, **así que el defecto entró con el tercer cliente y no antes** — y al
medirlo apareció que **Jujuy también estaba por debajo** (3,56) desde
siempre, sin que nadie lo notara.

`COL.acento` devuelve ahora el color que el sistema ya calcula para que se
LEA sobre este fondo, y se resuelve en cada lectura igual que `grilla` y
`texto`, porque el fondo cambia al entrar en modo papel:

```
pantalla  →  TEMA.acentoTexto   (aclarado hasta 4,5 sobre #141414)
papel     →  TEMA.acentoPapel   (oscurecido hasta 4,5 sobre blanco)
```

| Cliente | Marca | Antes | Ahora |
|---|---|---|---|
| DEPORTIVO | `#09086E` | **1,12** | **6,07** |
| Jujuy | `#2563eb` | **3,56** | **6,09** |
| Reconquista | `#f7941e` | 8,08 | 8,08 |

Alcanza a todo lo que dibuja con el acento: barras de ranking, radares,
gráficos de barras y comparativas de equipo. Hay tests que fijan que los
tres clientes pasen AA y que `COL.acento` no vuelva a leer el crudo.

### El escudo de un club se llama como el CLUB ENTERO

El resolutor prueba **recortes** del nombre cuando no hay match exacto,
así que un archivo llamado `deportivo.png` se lo lleva cualquier club que
empiece con esa palabra. Pasó al sumar el cliente DEPORTIVO: en su libro
juegan **DEPORTIVO LA PLATA** y **DEPORTIVO SAN VICENTE**, y los dos
salían en la grilla con el mismo escudo — sin figurar en el panel de
faltantes, porque para el resolutor estaba resuelto.

Se arregló renombrando a `deportivo-la-plata.png`. Ahora SAN VICENTE cae
a sus iniciales, que es lo correcto: no tenemos su escudo. Hay un test que
falla si algún archivo vuelve a tener un nombre que sea **prefijo** de
otro.

### Renombrar una tira o sumar una categoría · se toca el JSON, no el código

La etiqueta del grupo del selector sale de un mapa por `tira` en
`sgadd-app.js` (`femenina` → Femenina, `negra` → Masculina Negra, `naranja`
→ Masculina Naranja), así que **cambiar de tira es cambiar un campo del
JSON**, no tocar la UI. Reconquista pasó de *Negra* a **Naranja** en
2026-08-17 así: `tira: "naranja"` y el `label` de la planilla.

El **`label` sí es cosmético y se cambia solo**: Primera pasó de *"Primera
· Clausura 2026"* a **"Primera · Vuelta 2026"** el 2026-08-24, para que la
etiqueta diga lo mismo que la columna `TORNEO` del libro migrado. El `id`
quedó en `primera-clausura-2026` a propósito — ver abajo.

**`faseTorneo` del JSON no lo lee ningún módulo.** Está declarado en las
cuatro planillas y el torneo sale siempre de los datos
(`torneosDisponibles`), así que un desajuste entre ese campo y la columna
real **no rompe nada**. Se mantiene alineado por prolijidad, no porque
haga falta.

**Renombrar el `id` de una planilla NO es cosmético.** Es la clave con la
que se guardan los estados de jugador (`sgadd.estados.<club>.<planilla>` —
punto 13) y viaja en la RUTA (`#/<planilla>/…`), o sea en cada link que el
cuerpo técnico compartió. Renombrarlo pierde las dos cosas.

Con la U21 se hizo igual (`negra-…` → `naranja-u21-clausura-2026`) porque el
club confirmó que en esa planilla no había estados cargados. Es una decisión
de datos, no de estética: preguntar antes.

### El cuelgue total de la página · un ciclo de repintado

Síntoma: *"La página no responde"* de Chrome al cambiar de categoría
estando en **Principal**. No es lento: es el hilo tomado, medido con un
`eval` trivial que dejaba de contestar a los 8 s y no volvía nunca.

El ciclo:

```
drawOrtgDrtgChart() → LOGOS.resolver() → alResolverFns →
renderSection('principal') → drawOrtgDrtgChart() → …
```

`resolver()` avisaba **siempre** al terminar, y el callback global repinta
la sección entera; el gráfico de Principal vuelve a pedir los escudos al
dibujarse. Con todo ya en caché esas promesas resuelven en **microtasks**,
así que el bucle nunca cede el hilo — por eso cuelga en vez de solo
parpadear.

**Por qué al cambiar y no al arrancar**: el callback lo registra
`precargarLogos()`, que en el arranque corre en paralelo con el primer
render. Cuando el DT cambia de categoría ya está registrado, así que el
ciclo arranca sí o sí.

**El arreglo va en `resolver()`, no en el gráfico**: se avisa **solo si
entró algún escudo nuevo** (`resueltos` cambió). Si todo salió de caché no
hay nada que repintar, la segunda vuelta no avisa y el ciclo se corta solo.
El hook sigue cumpliendo su trabajo —los escudos que llegan tarde se
pintan— y protege igual a Scouting, que también llama a `resolver()`.

Medido: `drawOrtgDrtgChart` pasó de correr sin fin a **una sola vez** por
cambio de categoría, y la página responde en todo momento. Hay tres tests
en `test-logos.js` que lo fijan, incluido el caso del equipo **sin
archivo**: tampoco puede avisar en cada tanda.

### El cambio de categoría no puede dejar al DT sin controles

Con tres planillas activas apareció un síntoma que con una sola no existe:
al pasar a U21 o U23 la barra quedaba en *"Cargando…"* y **el selector
desaparecía de la pantalla**. Con Primera no pasaba porque ya estaba
cargada y volvía en el acto. Son tres causas distintas, las tres
reproducidas en el navegador:

1. **El cartel de la capa vieja se llevaba puesta la barra.**
   `onCategoriaCambiada` —que es de la capa de datos de Principal— pisaba
   `#view-root` con *"Cambiando de categoria…"* aunque el DT estuviera en
   Equipos. Ahí se va el selector: no se puede volver atrás ni elegir otra
   mientras baja. Ahora ese cartel **solo se pinta en Principal**; las
   secciones SGADD ya muestran su propio estado *debajo* de la barra.

2. **Una petición que no contesta dejaba la categoría muerta.**
   `cargarCategoria` cachea la **promesa** por `sheetId`, así que un
   `fetch` que nunca resuelve dejaba esa planilla en "Cargando…" **para
   siempre**: cambiar de ida y vuelta no la revivía porque el caché
   devolvía la misma promesa colgada, y solo se recuperaba recargando.
   Ahora cada hoja tiene un techo de `TIMEOUT_HOJA` (20 s) y **un fracaso
   total no se cachea**.

   El techo son **dos** mecanismos y hacen falta los dos: `AbortController`
   corta la conexión de verdad —para no dejarla abierta consumiendo una de
   las seis que el navegador da por host— y la **carrera** es la que
   garantiza el corte, porque abortar solo funciona si el `fetch` respeta
   la señal. Medido con un `fetch` que la ignora: sin la carrera no cortaba
   nunca.

3. **Sin una sola hoja se armaba un índice vacío.** Cada hoja que falla se
   degrada sola —una planilla incompleta sigue sirviendo— pero si no entra
   **ninguna**, el problema es de red o de permisos y hay que decirlo.
   Antes la sección quedaba en blanco, con 0 equipos y sin cartel. Medido
   cortando la red en el navegador.

**Y un guard de carrera en `cargar()`**: dos cambios seguidos disparan dos
cargas, y la primera puede volver DESPUÉS de la segunda. Cada una se queda
con su ficha (`_cargaId`) y al volver comprueba si sigue siendo la vigente;
si no, se retira sin tocar el estado ni apagar el cartel de la otra.
Medido: sin esto, pedir U21 y a los 300 ms U23 terminaba mostrando la U21.

### Dos bugs que destapó la categoría nueva

Los dos estaban latentes desde que existe la segunda planilla y solo se ven
con **más de una activa**:

1. **El selector revertía la categoría.** `buildEquipos()` imponía al estado
   global `EQUIPOS.planillaId` —la copia que la sección guarda entre
   repintados— en vez de lo que trae la RUTA. Al cambiar de categoría, el
   repintado volvía a imponer la vieja: el DT quedaba con la etiqueta de una
   y los datos de la otra. Ahora `equiposLeerRuta()` devuelve la ruta
   parseada y solo `r.planilla` pisa la decisión global. Mismo arreglo en
   Jugadores y en Simulador, que tenían el patrón calcado.
2. **El nombre del equipo conservaba el sufijo.** El índice recortaba solo
   `- MM` con una regex propia (`sgadd-core.js`), así que Primera se veía
   limpia y U21/U23 mostraban "ATENAS - U23" en la grilla, los rankings y el
   título de la ficha — mientras los escudos, que sí usan el normalizador,
   resolvían "ATENAS". El nombre sale ahora de `limpiarNombre()`, que conoce
   `MM`, `MF` y `U\d{1,2}[MF]?`. Los paréntesis de Liga Argentina siguen sin
   tocarse.

**Una planilla SIN `sheetId` entra igual, como inactiva.** `activo: !!sheetId`
en `sgadd-club.js`, y el selector la muestra deshabilitada con *"— sin
datos"*. Así la categoría nueva ya aparece en la lista —el DT ve que existe—
sin dejar entrar a una sección vacía. Es lo que pasa hoy con la U23 hasta que
el club pase el id de su planilla.

---

## 18 ter. El tramo de las ALERTAS del servidor

El proxy calcula las alertas de toda la liga (punto 13) y para eso arma su
propio índice. **Tiene que mirar el mismo tramo que el panel**: si calcula
sobre otro recorte, el buzón habla de una liga distinta de la que el DT
tiene delante.

Estaba mal de dos formas a la vez, y ningún test lo veía porque **las
alertas salían** — solo que de una liga que no existe:

1. **`torneoPorDefecto()` recibía `hojas` donde espera la LISTA de
   torneos.** Con un objeto en vez de un array, `l.length` es `undefined` y
   la función devolvía siempre `GENERAL`, que **no es un torneo sino el
   centinela de "no scopear"**. O sea que el índice salía sin scope: IDA y
   VUELTA colapsados, los promedios del segundo pisando a los del primero y
   cada jugador contado dos veces — el defecto del punto 3 ter, adentro del
   servidor.
2. **`torneosDisponibles()` no conoce al sintético `*TOTAL*`**, porque no
   sale de ninguna celda. Desde que el panel abre por el TOTAL, el cliente
   lo pide en cada carga y acá se rechazaba por inexistente — que es lo que
   destapaba el bug 1 en todas las cargas.

Medido en producción antes del fix:

```
pedí torneo=*TOTAL*   →  el servidor calculó en GENERAL   (38 alertas)
pedí torneo=IDA       →  IDA                              (31)
pedí torneo=VUELTA    →  VUELTA                           ( 0)
```

La lista buena es la de **TRAMOS** (`combinacionesTorneoFase`), la misma
que enumera el selector: incluye al sintético y además valida el PAR, que
un libro puede traer IDA y VUELTA en REGULAR y solo VUELTA en PLAYOFF.

**`GENERAL` no puede aparecer nunca como resultado de un respaldo.** Hay un
test que lo fija: es un centinela, y verlo ahí significa que las alertas
describen un índice colapsado.

---

## 18 bis. Los dos tokens de Upstash · el servidor lee, el CLI escribe

Vercel **no tiene por qué poder escribir el catálogo**: lo único que hace
con KV es leerlo. Escribirlo es tarea del CLI, que corre en la máquina de
quien administra. Con el token completo arriba, cualquier fallo de la API
podría pisar el catálogo de los tres clubes — que es exactamente la bomba
que ya se armó dos veces con `sembrar` (punto 17 de la CLI).

```
Vercel  →  URL + SOLO el token de lectura
local   →  URL + el token completo
```

`leer()` pide siempre `soloLectura: true`, así que **teniendo los dos usa
el de lectura**: el CLI no gasta el permiso de escritura en un GET.

**Una escritura con solo el token de lectura falla ANTES de salir a la
red**, con código `KV_SOLO_LECTURA`. Sin esa guarda la petición sale y
vuelve un `NOPERM` crudo: el administrador ve un error de red donde lo que
pasa es que está corriendo el CLI contra el entorno del servidor. Es el
mismo criterio que el guard de `guardar()`, que aborta antes de escribir en
vez de dejar a medias.

**Se aceptan CUATRO nombres** para el token de lectura, por lo mismo que el
completo acepta tres: Upstash bautiza distinto según por dónde se cree la
base —la consola nativa dice `UPSTASH_REDIS_REST_READONLY_TOKEN`, todo
junto y sin `API`; la integración estilo Vercel KV dice
`KV_REST_API_READ_ONLY_TOKEN`—. Exigir uno concreto es mandar a copiar
valores a mano para nada, y ya pasó dos veces con el completo.

### Dar de alta un club · probar los libros ANTES

`probar-google.js --sheets "etiqueta=ID,etiqueta=ID"` prueba varios libros
de una y **no se corta en el primero que falla**: lo que se quiere saber es
cuáles pasan y cuáles no. Distingue los dos modos de fallar, que se
arreglan de maneras opuestas:

| | Qué pasó | Cómo se arregla |
|---|---|---|
| `NO COMPARTIDA` | la Service Account no tiene acceso | compartir el libro con su mail, modo Lector |
| `NO EXISTE` | el `sheetId` apunta a la nada | corregir el id |

Los dos daban **401 por GViz**, que es lo que hizo perder una tarde con la
U21 (punto 3 ter). Por la API de Sheets se distinguen solos.

---

## 23. EL BUG QUE BORRABA LAS CLAVES · un KV ilegible

Dejó a un administrador afuera con su propia clave, y el modo de fallar era
perfecto: **entraba bien la vez que la fijaba** —la escritura y la lectura
siguiente son consecutivas— y no podía volver a entrar después.

`kv.leer` se traga el error y devuelve `{valor: null}`, así que
`admins.cargar()` no podía distinguir *«KV no contesta»* de *«todavía no hay
nadie»*. La cadena completa:

```
la lectura falla  →  padrón {}  →  «mail o clave incorrectos»
                  →  anotarFallo({})  →  se ESCRIBE {mail:{fallos:1}}
```

y ahí se iban los hashes de los tres administradores, **sin ningún síntoma**.

Ahora `cargar()` **lanza**, el login contesta **503** en vez de opinar sobre
una clave que no pudo mirar, y no se escribe nada. Es la misma regla de
siempre: un dato ausente se muestra ausente, no se reemplaza por uno
inventado.

**La CLI también.** Antes imprimía «sin acceso» para los tres, que es justo
lo que uno hace antes de invitarlos de nuevo y pisarles la clave.

Hay un test que lo caza al revertir el fix. Y el circuito completo —fijar →
entrar → salir → volver a entrar, con un intento fallido en el medio— se
ejerce sobre los handlers de verdad con un KV de mentira.

### El ojo del campo de clave

Ataca la otra mitad del problema: la clave se elige **una vez, a ciegas**, y
después hay que reproducirla exacta contra un servidor que contesta lo mismo
para «clave incorrecta» que para «mail que no existe» (eso es a propósito:
distinguirlos diría cuáles de los tres mails son administradores). Un espacio
de más al final deja a la persona afuera sin forma de darse cuenta.

Arranca **oculta**, el estado es **por campo** (en el alta conviven el código
y la clave nueva), y al alternar **devuelve el foco con el cursor al final**:
cambiar el `type` recrea el nodo, y sin reponerlo se sigue escribiendo en el
vacío.

**Y el ojo se deshabilitaba solo al tipear.** `campo()` refresca el botón de
enviar en cada tecla y lo buscaba con `.login-caja button` — el PRIMER botón
de la caja, que con la llegada del ojo dejó de ser el de enviar. Andaba
perfecto hasta que hacía falta, y no dejaba un error en consola. Un selector
posicional se rompe callado en cuanto alguien agrega un elemento antes: ahora
el botón tiene `id`.

Lo destapó verificar en producción con la **secuencia real** —tipear y
después tocar el ojo— y no con el clic suelto, que funcionaba.

---

## 29. LOGIN DE CLIENTES · `server/lib/clientes.js`

Un club entra ahora con su mail y su clave. El link firmado sigue
funcionando —es lo que usan los tres clubes de hoy— pero deja de ser el
único camino, y sobre todo deja de ser uno que no se puede revocar.

### Por qué son DOS padrones y no uno

```
QUIÉN ES ADMIN     →  `ADMINS`, en el CÓDIGO. Re-derivado en cada petición.
QUIÉN ES CLIENTE   →  KV. Es dato: el Panel Master lo edita todos los días.
```

No es un detalle de implementación, es la propiedad de seguridad: un KV
comprometido **no alcanza para inventar un administrador**. Sí alcanza para
darse de alta como cliente de un club — y eso da lo que ese club ve, que es
exactamente lo que el gate de interfaz protege (punto 19). No da
administración, y no da otro club.

**Los hashes NO viven en el catálogo.** El catálogo se sirve por
`GET /api/v1/catalogo` a cualquiera con token; los mails de un club ahí
adentro le contarían a cada cliente quiénes son los del resto. Van en
`sgadd:clientes` y solo salen por `/api/v1/clientes`, con gate de ADMIN.

### El cupo

**Una sola tabla**, `SGADD_AUTH.CUPO_MAILS` (Bronce 2 · Plata 3 · Oro 4), en
el motor compartido. La landing la **lee** en vez de repetirla y el servidor
la hace cumplir. Con dos tablas la que se relaja es siempre la del servidor
—que es la que decide— y el cliente termina con más accesos de los que paga,
o con menos de los que le prometieron.

**El plan sale del CATÁLOGO, no del pedido.** Si lo mandara el navegador, el
cupo lo decidiría justamente quien lo quiere saltear. Hay un test que lo
intenta.

Y **el cupo lo valida el servidor**, no la pantalla: la pantalla lo muestra
para que el admin no llegue al tope de sorpresa, pero una validación que solo
vive en el navegador no es una validación.

### Reglas que hay que respetar al tocarlo

- **Un mail está en UN club.** Con el mismo en dos, el login tendría que
  adivinar cuál abrir. Si alguien trabaja en dos clubes, se le da un mail por
  club.
- **Un administrador no se da de alta como cliente**: ya entra por su puerta
  y con más permisos, así que darlo de alta le ACOTARÍA la vista y gastaría
  un cupo del club.
- **El plan y el equipo del token salen del catálogo**, no del registro del
  mail: guardarlos ahí los congelaría el día del alta y un upgrade no le
  llegaría a quien ya estaba dado de alta — que es el caso que más importa.
- **`FALTA_CLAVE` se distingue del resto**, y no filtra el padrón: para
  llegar ahí hay que traer el código, que es un secreto de 256 bits. Sin esa
  rama, el cliente recién invitado lee «mail o clave incorrectos», mira el
  formulario que le pide una clave que no tiene, y concluye que le dieron mal
  el acceso. La pantalla lo lleva derecho a elegirla.
- **Reinvitar NO le borra la clave** que ya tenga: mientras no canjee el
  código nuevo, la vieja sigue sirviendo. Invalidarla de entrada dejaría
  afuera a alguien que está entrando bien, por un click de más.
- **El código se muestra UNA vez.** El servidor guarda su huella, no el
  código: si se pudiera volver a leer, KV pasaría a ser suficiente para
  entrar como cualquier cliente.
- **Un KV ilegible no borra accesos.** `cargar()` lanza y el login contesta
  503, igual que el padrón de admins — es el bug del punto 23 y no se repite.

### La sesión del cliente dura MÁS que la del admin

Siete días contra doce horas, y es a propósito: el DT abre el panel en el
banco de suplentes y en el vestuario, muchas veces por semana, y hacerlo
escribir la clave cada doce horas convierte la herramienta en un trámite. El
riesgo también es menor — lo que ve es su propio club, que es lo mismo que
ya veía con un link firmado que no se podía revocar.

### El helper que no estaba declarado

`escJs` se usó en los handlers inline de la lista de mails sin declararlo, y
cada repintado tiraba un `ReferenceError` que **el `.catch` del fetch se
tragaba**: el alta funcionaba y la pantalla mostraba «escJs is not defined».
Medido en producción. Hay un test genérico que verifica que todo helper que
el hub usa esté declarado — no solo ese.

---

## 30. NADA DEL PANEL MASTER SE APLICA EN SILENCIO · `sgadd-confirmar.js`

Todo cambio del Panel Master se ve en la sesión del cliente en su próxima
carga. No hay staging: lo que se manda, manda. Antes un clic en «Pausar» le
cortaba el acceso en el acto, y la baja preguntaba «¿seguimos?» con un
`confirm()` nativo que no decía QUÉ.

El modal **enumera** el cambio campo por campo —«Plan: PLATA → ORO», «Acceso
eliminado: mail@ejemplo.com»— y avisa que repercute en el cliente. Esa es la
diferencia entre confirmar y leer.

### Lo que hay que respetar al tocarlo

- **La petición vive en `alConfirmar`, no en `abrir`.** Si saliera antes, el
  modal sería un cartel y no una confirmación. Es la propiedad entera del
  módulo y hay un test que la fija.
- **No se compara el objeto entero.** Un `JSON.stringify` distinto no le dice
  nada a nadie, y dispararía por cualquier campo que el servidor toque por su
  cuenta —un contador, una fecha de último ingreso— que no es un cambio del
  admin. Se compara campo por campo, con etiquetas en castellano.
- **Vacío contra vacío no es un cambio**, aunque uno sea `null` y el otro
  `''`: el servidor y el formulario representan «sin dato» distinto y eso no
  es una decisión de nadie.
- **Los mails se comparan como CONJUNTOS**: el orden en que el servidor los
  devuelve no es una decisión del admin.
- **Sin cambios, el botón se apaga.** Mandar una petición que no cambia nada
  es ruido en el log y una escritura de más en KV.
- **Se cierra ANTES de disparar.** La petición puede tardar, y un modal
  congelado encima de la pantalla que se está actualizando se lee como que
  algo se colgó. El resultado lo muestra la tarjeta del club.
- **Sin el módulo cargado la pantalla sigue andando**: es una mejora, no una
  dependencia dura.

### Las zonas no se difean zona por zona

Se contaron los intentos y no vale la pena: una zona se identifica por su
`id`, y el DT le cambia el id tanto como los cortes, así que el diff fino
termina diciendo «se borró playoffs, se creó playoff» para un cambio de
nombre. Lo que sirve —y es lo que hay que confirmar antes de publicar— es el
**resumen**: qué formatos hay, cuántas zonas tiene cada uno y con qué cortes,
con los negativos leídos en castellano («los 2 últimos»).

---

## 31. PUBLICAR LAS ZONAS · la cascada de tres niveles

```
1. BORRADOR de este navegador   ·  lo que el admin está probando
2. PUBLICADO en el catálogo     ·  lo que el club ve hoy
3. clubes/<club>.json           ·  el respaldo del repo
```

**Son dos acciones y no una con un tilde.** Probar un corte y publicarlo son
momentos distintos del trabajo: el admin mueve zonas varias veces antes de
estar conforme, y cada una de esas veces no tiene por qué verla el club.

El JSON del repo **no se toca** y sigue siendo el respaldo: un club que nunca
publicó nada funciona exactamente como antes, y la exportación sigue estando
porque el historial de git es la única trazabilidad real del proyecto.

**Nunca se fusionan dos niveles**: el que gana, gana entero. Mezclar zonas de
dos orígenes daría cascadas que ninguno declaró, y la cascada es justo lo que
decide qué zona gana.

**Publicar vacío borra lo publicado** y devuelve el club al archivo: es la
única forma de deshacer sin tener que adivinar cómo era antes. Un bloque sin
formatos se rechaza con ese mensaje, porque publicarlo se leería como «se
rompió» y no como «lo vacié».

**Las zonas van para TODOS y no solo para el admin.** No son información
comercial: son cómo se pinta la tabla del cliente, y dejarlas del lado del
admin haría que publicar no sirviera de nada. El plan y el vencimiento sí
siguen siendo solo del admin.

> **Y durante semanas publicar NO SIRVIÓ DE NADA**, que es justo lo que
> este párrafo decía evitar: el servidor mandaba las zonas a todos, pero
> el PANEL solo pedía el catálogo con sesión de admin. Un cliente nunca lo
> leía y su tabla caía al JSON. Medido y corregido el 2026-09-11 — ver el
> punto 54.

---

## 32. SUBCLIENTES · cada categoría con sus propias zonas

Un club puede correr varias categorías con torneos que no tienen nada que
ver: Reconquista tiene Primera, U21 y U23, cada una con su libro.

**El bloque `competencia` era del CLUB entero**, y como las claves de
`porTramo` son `TORNEO|FASE`, dos categorías con la misma clave —y
`GENERAL|REGULAR` es lo más común de todo— compartían zonas sin que nadie lo
pidiera: **bajar el descenso en Primera se lo bajaba también a la U21**.

`competencia.porCategoria[<planillaId>]` lo scopea. Tres reglas:

- **Es ADITIVO y degrada solo.** Un club que no lo declara se comporta
  exactamente como antes, y una categoría que no está en el mapa cae al
  bloque del club — que es lo correcto para un club de una sola categoría,
  donde separarlas sería pedirle al DT que declare dos veces lo mismo.
- **Se parsea con el MISMO parser, recursivamente.** Cada sub-bloque tiene la
  forma de un `competencia` entero porque una categoría es una competencia
  distinta, no un recorte de otra. Con un parser propio, el día que se agregue
  un campo habría que acordarse de tocar dos lados.
- **La recursión es de UN nivel**: una categoría no tiene sub-categorías, y
  aceptarlo sería prometer una jerarquía que nada más soporta.

**El cupo de mails sigue siendo del CLUB entero**, no por categoría: se cuenta
por `club` en el padrón y las categorías no participan. Reconquista en ORO
tiene 4 mails para las tres categorías, no 4 por cada una.

`resolver()` devuelve además `propio`, que dice si la categoría tiene reglas
suyas o hereda las del club: sin eso el DT no puede saber si lo que edita le
cambia la tabla a las otras.

---

## 37. PUBLICAR, GUARDAR Y EXPORTAR · las tres, explicadas en la pantalla

| | Qué hace de verdad |
|---|---|
| **Publicar en el cliente** | Lo escribe en el servidor. El cliente lo ve en su próxima carga, sin que nadie toque el repositorio. **Es la vía automática.** |
| **Guardar en este navegador** | Queda en ESE navegador, para probar. Nadie más lo ve. |
| **Exportar el bloque JSON** | El bloque para pegar en `clubes/<club>.json` y commitear. Deja el cambio en el historial de git. |

**Publicar va solo arriba y en el color de acento.** Las cuatro estaban en
fila, del mismo tamaño y con «Guardar en este navegador» primero: la única
que le cambia algo al cliente quedaba tercera y parecía una más.

Y se dice **por qué exportar es manual**: el navegador no puede escribir
archivos del repositorio. Sin esa línea, el paso se lee como una molestia y
no como un límite.

La preconfiguración lleva su propia nota arriba de todo: es la pantalla más
abstracta del panel —declara una estructura que todavía no tiene datos— y sin
decir que de ahí salen las Posiciones, la Clasificación, las rachas y el
Simulador, se lee como un formulario administrativo.

---

## 38. ROTAR EL TOKEN DE UPSTASH SIN CORTAR NADA

El procedimiento está en
[`ROTAR_TOKEN_UPSTASH.md`](ROTAR_TOKEN_UPSTASH.md). Acá va por qué es así.

Rotar una credencial de un servicio **que está sirviendo** tiene un agujero
conocido: entre que se genera la nueva y que el servidor la lee hay
peticiones en vuelo. Y en Vercel «el servidor» son varias instancias que se
reciclan cuando quieren, así que la ventana **no es un instante** — puede
durar minutos.

Con un segundo nombre de variable —`*_TOKEN_LEGACY`— esa ventana desaparece:
se pone el nuevo, se deja el viejo, y cada petición prueba el nuevo y cae al
viejo si hace falta.

### Las reglas del fallback

- **El NUEVO se prueba primero.** Al revés, el viejo seguiría sirviendo todo
  y la rotación no se completaría nunca: el healthcheck diría que anda y el
  token que se quiso revocar seguiría siendo el que trabaja.
- **Solo se reintenta por PERMISOS** (401, 403, `NOPERM`). Un timeout o un
  500 no: ahí el token está bien y repetir solo duplica la espera del que
  está del otro lado.
- **El legacy cuenta para `configurado()`**: durante la rotación puede ser
  el único que anda, y un `false` ahí apagaría la escritura entera.
- **Un token repetido en las dos variables se prueba una sola vez.**
- **Es una variable de TRANSICIÓN.** Si queda puesta, el token que se quiso
  revocar sigue vivo y la rotación no rotó nada. El healthcheck lo dice.

### LO QUE PASÓ AL ROTAR DE VERDAD (2026-09-01)

**«Rotate token» de Upstash revoca el viejo en el acto.** No hay periodo de
gracia, así que el slot legacy —que existe para cubrir la ventana entre
generar y desplegar— no sirvió: el viejo ya contestaba `401 WRONGPASS` antes
de empezar.

Producción estuvo sirviendo desde el respaldo (`origen: codigo`) hasta que
entró el nuevo. **El panel no se cayó** —para eso está la cascada, y los
`sheetId` viven también en las variables de entorno— pero durante esa ventana
el login por clave, el alta de clientes y publicar zonas no funcionaban.

Se detectó por el aviso que ya viajaba en la respuesta del catálogo:
`No se pudo leer el catálogo de KV (KV_TOKEN)`. Sin ese aviso, el síntoma
habría sido «el Panel Master no guarda nada» sin ninguna pista.

**La regla que queda**: generar el token nuevo recién cuando se está en la
máquina lista para ponerlo. Y el slot legacy sigue valiendo solo para el caso
en que se puedan tener dos tokens vivos a la vez.

### El healthcheck prueba permisos, no conectividad

```bash
node server/bin/kv-salud.js              # solo lee
node server/bin/kv-salud.js --escribir   # ida y vuelta completo
```

Un token nuevo puede entrar con permisos distintos —solo lectura, o sin
acceso a una base— y eso **no se nota hasta que alguien da de alta un
cliente y el alta se pierde**. Por eso lee las dos claves que sostienen el
producto (el padrón de clientes y el catálogo con sus zonas publicadas) y
verifica la tabla de cupos.

**La escritura va sobre una clave PROPIA** (`sgadd:salud`), nunca sobre el
padrón ni el catálogo: una verificación que puede romper lo que verifica no
sirve. Y la limpia al terminar.

---

## 39. CON KV CAÍDO EL PANEL NO SE CAE · y ahora lo dice

La cascada ya era la resiliencia —KV → variable de entorno → el literal del
código para el catálogo, y borrador → publicado → `clubes/<club>.json` para
las zonas— así que el cliente **siempre** ve su tabla con el último respaldo
del repo. Lo que faltaba era decírselo al admin.

El Panel Master muestra **«Servicio KV en línea»** o **«Modo respaldo JSON
activo»**. Y en el segundo caso lo importante no es que KV se cayó sino
**qué deja de poder hacer**: publicar y dar de alta NO se van a guardar. Sin
eso, el admin toca «Publicar», ve el error y no sabe si es su cambio o el
servicio.

Va como badge discreto y no como cartel: el 99% de las veces está en línea, y
un cartel permanente se deja de leer.

**Lo que SÍ deja de andar con KV caído**: alta y baja de clientes, publicar
zonas, el login por mail y clave (el padrón vive en KV) y las alertas que
calcula el servidor. Los links firmados siguen funcionando: no tocan KV.

---

## 40. EL TRAMO SE CONSERVA AL CAMBIAR DE CATEGORÍA

Un club multicategoría —Reconquista corre Primera, U21 y U23— hace que el DT
salte entre libros todo el tiempo. Cada salto lo devolvía al tramo por
defecto del libro nuevo: si estaba mirando la IDA, tenía que volver a
elegirla en cada categoría.

`estado.preferencia` guarda lo que eligió **a mano** y `tramoPreferido()` lo
traduce al libro nuevo:

1. el **par exacto** `TORNEO|FASE`, si existe;
2. si no, la **misma FASE** con el mejor torneo del libro nuevo — la fase es
   lo que el DT eligió conceptualmente («quiero ver los playoffs») y el
   torneo es cómo lo llama cada categoría, que no tiene por qué coincidir;
3. si no hay nada parecido, el default. Inventar un tramo que no existe deja
   la vista vacía sin decir por qué.

**Se guarda SOLO lo elegido a mano**, en `cambiarTramo()`. Si se guardara el
default, la preferencia sería siempre la del primer libro que se abrió y el
criterio de `tramoPorDefecto` —que elige por cobertura y cambia de libro en
libro— dejaría de correr. Y NO se graba desde `cambiarFase`/`cambiarTorneo`,
que los usa el ruteo: recordar una navegación como si fuera una decisión
haría que un link viejo le fijara la preferencia a quien lo abre.

**El hash sigue ganando** sobre la preferencia: un link compartido tiene que
abrir donde dice el link.

Verificado en producción con las tres categorías reales: eligió `IDA`, la
U21 (que solo tiene `GENERAL|REGULAR`) cayó a su único tramo, y al volver a
Primera recuperó `IDA` en vez de abrir en el `*TOTAL*` por defecto.

**El toggle de promedios/totales ya sobrevivía**: vive en el estado del
módulo y nada lo resetea. Lo que sí faltaba era que `plantelRankingModo`
estuviera DECLARADO — andaba por `undefined` cayendo a `'promedio'`, y una
clave de estado que no figura en el objeto es de las que se pierden en la
próxima edición sin que nadie lo note.

---

## 41. EL JSON DEL CLUB · el archivo que rompió y las cuatro guardas

El 2026-09-01 `clubes/reconquista.json` dejó de parsear. El bloque de
zonas se había pegado a mano por la web de GitHub y quedó cerrando el
objeto raíz: la llave del final de `competencia` **no llevaba coma**
antes de `"planillas"`.

**El síntoma es lo que hay que recordar: la app NO se cayó.** `cargar()`
del club atrapa el error y sigue con los valores por defecto, así que
Reconquista estuvo viendo la marca, los colores y las zonas de otro club
—y su Panel Master mostrando «EQUIPOS ESPERADOS —» y «Sin zonas»— sin que
nada dijera que su configuración estaba rota. Es el peor modo de fallar
que tiene este proyecto: no se rompe, miente.

La degradación es correcta y se queda (punto 6: la config es opcional y
no puede tumbar el panel). Lo que faltaba era todo lo demás.

### 1 · Un JSON de club roto no puede llegar a `main`

`test-jsonclub.js` recorre `clubes/*.json` y exige que **cada uno**
parsee, declare `id` y `planillas`, y no arranque con BOM —que es
invisible al ojo y lo puede meter un editor web—. Era el test barato que
no estaba.

### 2 · El export es el ARCHIVO ENTERO, no un fragmento

Ésta es la corrección de fondo. La pantalla daba `"competencia": {…}`
para empalmar al lado de `"planillas"`, o sea que **acertarle a la coma
quedaba del lado del que pega**. El generador nunca produjo JSON
inválido; el formato del entregable era el que invitaba al error.

`exportarArchivo(jsonClub, competencia)` devuelve
`clubes/<club>.json` completo, listo para **reemplazar**. No hay nada que
empalmar.

Dos detalles que no son cosméticos:

- **El bloque se reemplaza EN SU LUGAR**, conservando el orden de claves
  del archivo. Un diff que mueve treinta líneas esconde el cambio real.
- **Se conservan TODAS las claves**, incluidas las `//` de comentario. Si
  al pegarlo se perdiera una planilla o el escudo, el remedio sería peor
  que la enfermedad.

### 3 · La guarda: nada sale sin sobrevivir a `JSON.parse()`

`serializar(valor)` devuelve `{ok, texto, error}` y **nunca lanza**: una
pantalla de configuración que revienta al copiar es peor que una que dice
que no puede. Cubre los tres modos de fallar —referencia circular,
`undefined`, JSON que no parsea— y se aplica **sobre lo que realmente se
va a escribir, ya fusionado**. Validar el fragmento y grabar el compuesto
es validar otra cosa.

Si no pasa, no se copia, no se guarda y no se publica. Copiar un JSON
roto al portapapeles es peor que no copiar: termina pegado en el repo.

La rama de `undefined` no es defensiva: `JSON.stringify(undefined)`
devuelve `undefined` y no un string, y es exactamente el caso que rompió
publicar.

### 4 · PUBLICAR BORRABA LAS ZONAS · el bug que destapó la auditoría

`configPublicar()` hacía
`JSON.parse(SGADD_CONFIG.exportar(b)).competencia`, y `exportar()`
devuelve `{ordenTabla, formatos, porTramo}` — **no tiene esa clave**. O
sea que viajaba `competencia: undefined`, el servidor lo entendía como
«vaciar» (que es una rama legítima) y el botón **borraba** las zonas en
vez de publicarlas.

Y contestaba `ok: true`. El admin publicaba, veía «Publicado», y el
cliente se quedaba sin colores en la tabla.

Guardar y publicar arman ahora el bloque en **un solo lugar**
(`configBloqueAGrabar()`): dos caminos que escriben lo mismo terminan
divergiendo, que es el bug que ya tuvo el rol funcional (punto 8).

**Este defecto no lo caza un grep**: la línea se leía perfecta. Hay que
ejercer el flujo, y por eso el test corre la pantalla en un `vm` con un
espía sobre `guardarCatalogo` y verifica el efecto en el catálogo.

### 5 · Aislamiento por categoría, en los DOS lados

Reconquista corre Primera, U21 y U23, y como las claves de `porTramo`
son `TORNEO|FASE` —y `GENERAL|REGULAR` es lo más común de todo— las tres
compartían zonas sin que nadie lo pidiera.

El motor ya sabía scopear (`porCategoria`, punto 17). Faltaban las dos
mitades que lo vuelven real:

- **En el cliente**, `fusionarCategoria(base, categoria, bloque)`: lo
  editado entra en su slot y el resto del bloque viaja tal cual. Sin
  `categoria` se reemplaza el nivel del club y **`porCategoria` se
  conserva** — editar un nivel no es una decisión sobre el otro.
- **En el servidor**, la acción `zonas` acepta `categoria` y escribe **un
  solo slot**. Es la garantía que no depende de la pantalla: aunque una
  versión vieja mandara el bloque de una categoría como si fuera el del
  club, no puede pisar a las hermanas.

Y una tercera pieza que es de producto: **la pantalla dice a quién le
cambia las zonas lo que se está editando** («Todas las categorías del
club (3)» / «Solo Primera»), con el conmutador para separarla. El motor
sabía scopear y el admin no tenía cómo saber sobre qué nivel escribía.

Verificado en el navegador con las tres categorías reales: separada
Primera con 9 equipos esperados, U21 y U23 siguieron resolviendo 12 desde
el bloque del club.

### Lo que este episodio deja como regla

**Un entregable que se copia y se pega tiene que ser reemplazable, no
empalmable.** El generador estaba bien y el JSON que producía era
válido; lo que falló fue pedirle a una persona que acertara una coma.
Cuando el formato del entregable admite un error silencioso, el error
llega — y acá llegó por la vía más difícil de auditar, que es un commit
hecho fuera del flujo de trabajo del punto 11.

---

## 43. EL ESTADO REACTIVO DEL PANEL MASTER

Cuatro defectos reportados desde producción, y **dos de los cuatro eran
el mismo**.

### 1 · La categoría no sobrevivía al F5

`inicializar()` lee la planilla de la RUTA, y las secciones SGADD
(`#/<planilla>/…`) sí la llevan. El problema es el Panel Master, que
—como Principal y el Diagnóstico— escribe `#<seccion>` a secas.
`#configuracion` parsea como `planilla: 'configuracion'`, que no existe
en el catálogo, así que degrada a **la primera activa**: el DT trabajaba
media hora en U21, recargaba y aparecía en Primera.

**No se arregló con la URL, que era la otra opción del pedido.** Darle
ruta completa a esas secciones obliga a meter sus nombres donde
`Ruta.parse()` decide qué formato tiene un hash, y eso toca la lectura de
los links VIEJOS que el cuerpo técnico ya tiene guardados (punto 16). No
vale el riesgo para recordar la preferencia de una persona.

Va en `localStorage` bajo `sgadd.categoria.<club>`, y **el orden de
precedencia es lo que importa**:

```
1. la RUTA, si trae una planilla válida   ← un link abre donde dice el link
2. lo último que ESTE usuario eligió       ← en ESTE club
3. la primera activa                       ← como siempre
```

- **Se graba SOLO en `cambiarPlanilla`**, que es el gesto explícito del
  DT en el selector. Es la misma regla que `recordarTramo` (punto 40):
  grabar el default congelaría el criterio de arranque.
- **Abrir un link NO pisa el recuerdo.** Ver el link de otro no es
  cambiar de categoría.
- **La clave es por club**, y el valor se valida contra el catálogo de
  HOY: una planilla dada de baja o que ya no existe degrada a la primera
  activa en vez de dejar la pantalla vacía.

### 2 y 4 · El estado contaminado, que era un solo defecto

`buildConfiguracion()` llama a `configCargarBorrador()` **sin forzar**, y
esa función sale temprano si ya hay borrador — cosa que tiene que seguir
haciendo, porque es lo que permite tipear sin perder lo escrito en cada
repintado. Consecuencia: al cambiar de categoría, el estado global se
movía y esta pantalla se quedaba con todo lo derivado de la anterior.

Medido parado en U21, antes del fix:

```
estado.planillaId   naranja-u21-clausura-2026   ← el global sí cambió
CONFIGUI.categoria  primera-clausura-2026       ← viejo
CONFIGUI.propia     true                        ← viejo (U21 hereda)
equiposEsperados    12                          ← el formato de Primera
la tarjeta decía    «Solo Primera · Vuelta 2026»
```

Y la validación cruzaba los equipos declarados por **Primera** contra los
que trae el libro de **U21**: dos categorías distintas en la misma frase.

**NINGUNA de esas cadenas estaba hardcodeada** —todas interpolan
`CONFIGUI.categoria` y los nombres salen de `SGADD.CATALOGO.planillas`,
la misma fuente que el selector—. Lo que estaba viejo era la variable, así
que el punto 4 del reporte es el punto 2 visto desde la pantalla, y el
arreglo va en el único lugar por donde pasa: el punto de entrada del
borrador. Hay un test que igual verifica que no aparezca un nombre de
categoría literal en la UI, porque ese hardcodeo no daría ningún síntoma
hasta que alguien lo mire.

`resetEstadoCategoria()` tira `borrador`, `completo`, `categoria`,
`propia`, `origen`, `sucio`, `formatoSel` y **`exportando`** — ése último
es de los residuos caros: deja el panel de export abierto mostrando el
archivo de la OTRA categoría, y eso se copia y se commitea.

**Los cambios sin guardar se descartan, pero se avisa.** Eran de la otra
categoría, así que descartarlos es correcto; perderlos en silencio no,
porque el DT vuelve, no los encuentra y no sabe qué pasó.

### 3 · Publicar no avisaba nada, y el orden era el motivo

```js
configAvisar('Publicado…');   // escribe DENTRO de #view-root
configPintar();               // …y lo reconstruye entero
```

El mensaje se borraba en la línea siguiente a escribirse. El admin tocaba
«Publicar», el modal se cerraba y no pasaba nada visible: ni éxito ni
error.

Se arregla con las dos mitades:

- **Se repinta ANTES de avisar**, así el nodo del aviso inline es nuevo y
  el texto sobrevive.
- **Y va un toast**, que se cuelga de `document.body` y por lo tanto
  ningún repintado de sección lo toca. Se **reusa el del buzón** en vez de
  escribir un segundo: dos implementaciones del mismo aviso terminan
  viéndose distinto, que es el bug que ya tuvo el rol funcional (punto 8).

El toast nombra la categoría publicada y dice que subió al servidor, y en
el fallo trae el motivo que devolvió el servidor. **El nombre se resuelve
ANTES de disparar el pedido**: para cuando la promesa vuelve, el repintado
ya pudo haber cambiado el estado de la pantalla.

`toast()` acepta ahora una duración opcional: el aviso de publicar es una
frase larga y en los 2,6 s del default no se llega a leer. Los del buzón,
que son de dos palabras, se quedan con el default.

### Los tests se verificaron AL REVÉS

No alcanza con que pasen: se revirtió cada arreglo por separado y se
comprobó que el test lo caza — **2, 11 y 5 fallas** respectivamente. Un
test de regresión que no falla sin el arreglo no está probando nada.

### Y una lección sobre los tests que miden por distancia

`test-confirmar.js` verificaba que `configPublicar` abriera el modal con
`/function configPublicar[\s\S]{0,1600}SGADD_CONFIRMAR\.abrir\(/`. Los
comentarios que sumó este arreglo empujaron la llamada más allá de esos
1600 caracteres y el test se puso en rojo **sin que la propiedad hubiera
cambiado**. Ahora recorta el CUERPO de la función y busca ahí dentro: una
ventana fija de caracteres es una bomba de tiempo en un archivo que se
edita.

---

## 53. EL ALTA DE CLIENTES DESDE EL PANEL MASTER

La guía para quien opera está en
[`GUIA_ALTA_CLIENTES.md`](GUIA_ALTA_CLIENTES.md). Acá va por qué es así.

### El alta real de Sud América tenía CUATRO defectos, y ninguno se veía

Medido el 2026-09-11, con el primer cliente que llegó por Instagram:

| | Qué pasaba | Síntoma |
|---|---|---|
| 1 | el formulario perdía el foco en cada tecla | no se podía escribir |
| 2 | el JSON pedía `sud-america-primera`, KV tenía `sudamerica-primera` | «No existe esa categoría» en cada hoja |
| 3 | el equipo propio decía `SUDAMERICA` y el libro `SUD AMERICA LP - MM` | el cliente habría visto CERO equipos |
| 4 | un alta hecha desde la pantalla no alcanzaba | sin JSON en el repo, el panel cargaba los valores de Reconquista |

El 3 es el peor: no deja error en ningún lado. Es la trampa del punto 19
(«la letra importa») con otro disfraz — acá lo que faltaba era un espacio
y el `LP`.

### 1 · El foco · un input de texto NO SE REPINTA NUNCA

`campoAlta()` llamaba a `refrescarAlta()`, que reconstruía `#hubAlta`
entero **con los inputs adentro**. El comentario de al lado decía
«tipear NO repinta», y era cierto para la pestaña, no para el bloque.

Ahora son tres zonas, cada una se repinta por su motivo:

```
#hubAlta         el formulario · solo desde un SELECT o un RADIO, y devuelve el foco
#hubAltaEquipo   la lectura del libro y la elección del equipo
#hubAltaEstado   qué falta, los avisos y el botón · en cada tecla
```

Lo que depende de lo tipeado —el id que se completa solo, el borde rojo—
se escribe **sobre el nodo que ya está** (`ponerValor`, `marcar`).

**El test lo EJERCE**, no lo lee: tipea un nombre de 20 letras sobre un
DOM de mentira y cuenta las escrituras de `#hubAlta`. Verificado al
revés: con el bug de vuelta, «20 repintados» y caen 6.

### 2 · Las categorías salen del CATÁLOGO · el JSON pone la marca

`CLUB.reconciliar()` cruza el JSON (puede no haber) con el club que
publica `/api/v1/catalogo`. Lo llama `resolverClubYPlanilla()`, el único
punto que resuelve el club (punto 2), antes de inicializar la categoría.

- **La lista de categorías es del SERVIDOR**: es el que sabe qué libros
  hay y el que las va a servir. Una categoría del JSON con un slug que el
  servidor no tiene se descarta — era la que devolvía «No existe».
- **Donde nombran la MISMA categoría (mismo `slug`), gana el JSON**: su
  `id` es la clave de los estados y de los links ya compartidos (punto 6),
  y su etiqueta y su nivel son lo que el club declaró.
- **Sin JSON se arma la config desde el catálogo**: nombre, liga,
  categorías y el patrón del equipo propio, **anclado sobre la clave
  normalizada** — sin anclar, `DEPORTIVO LA PLATA` se llevaría a
  `DEPORTIVO SAN VICENTE` (punto 6). El cartel rojo se retira.
- **Con techo de 4 s** y sobre la misma promesa que ya pidió el selector
  de cliente: no es una petición de más ni puede demorar el arranque.
- **Degrada solo**: sin backend, sin token, en la landing o en la demo,
  la config queda exactamente como la dejó el JSON.

Lo que el JSON sigue aportando y la pantalla no puede: el escudo, los
colores, las zonas y la preconfiguración. Sin él, el panel funciona con
el acento por defecto y las iniciales del club.

### 3 · Reusar un libro sin que su id viaje

Dos clientes del mismo torneo leen el mismo libro. `alta` acepta
`libroDe: "<club>/<categoria>"` y **el servidor copia el id**: nunca
llega al navegador (punto 29). El libro sale, en orden, de `libroDe`, de
un `sheetId` pegado, o —si la categoría ya existe— **se conserva**:
exigir el id para corregir una etiqueta obligaría al admin a buscar un
dato que el navegador no tiene.

**La categoría se FUSIONA en vez de reemplazarse.** Reemplazarla por
`{label, sheetId}` borraba en silencio el `nivel` publicado (punto 45),
y la CLI tenía el mismo defecto: se corrigieron las dos.

El servidor **sigue rechazando la URL entera** (hay un test que lo fija y
el motivo es bueno); la que acepta el link pegado es la pantalla, que
saca el id con `idDeLibro()`.

### 4 · Los equipos del libro · lo que reemplaza a `probar-google.js`

`POST /api/v1/catalogo/equipos` (solo ADMIN) lee el libro y devuelve sus
equipos con la **clave** que usa el gate, así el equipo propio se ELIGE
de una lista. El motor puro es `server/lib/catalogo-libro.js`.

- **En su propio archivo** (`server/rutas/libro.js`) y no en
  `handlers.js`: la ruta que solo lee no comparte archivo con la única
  que escribe el catálogo.
- **POST y no GET**: puede llevar el id de un libro nuevo, y un id en la
  query termina en los logs de acceso.
- **Los dos modos de fallar dicen su remedio** (punto 18 bis): no
  compartido → con qué mail compartirlo; no existe → revisá el link.
- **La fila TIPO no es un equipo**: ofrecerla dejaría al cliente sin
  ninguna ficha.

La pantalla **propone** el equipo por palabras en común con el nombre
del club (Jaccard, sin las palabras que no distinguen: `club`, `la`,
`plata`, `lp`…). Solo con un ganador claro: **con empate no propone**, y
lo propuesto queda elegido en la lista y dicho en pantalla.

### 5 · Nada se aplica en silencio

Dar de alta y editar pasan por el modal de confirmación (punto 30), con
el diff campo por campo. Sin cambios, el botón del modal se apaga. Al
guardar, el formulario queda **editando** lo guardado: un segundo
«Guardar» corrige esa categoría en vez de intentar crearla otra vez.

### 6 · Un repintado AJENO no roba el foco · lo que solo vio Chrome

Con el formulario ya arreglado, la prueba en Chrome real —tipeando tecla
por tecla con `Input.insertText`— perdió el foco igual, en la 8.ª letra
de «Sud América La Plata». No era el tipeo: era **`renderSection()`
repintando la sección porque llegaron escudos nuevos** (punto 6), y el
Panel Master es una sección más. Un admin que empieza a escribir apenas
entra lo sufre una vez, y lo más probable es que eso fuera parte de lo
que se vio en el reporte original.

El test sobre un DOM de mentira no lo podía ver: ahí no llegan escudos.

`SGADD_UI.conservarFoco(repintar)` reenfoca el nodo NUEVO con el mismo
`id`, con el cursor donde estaba. Va en los cuatro repintados de vista
entera: `renderSection()`, `configPintar()`, el catálogo que llega tarde
(`sgadd-clientes.js`) y la lista del hub. Sirve para TODAS las secciones
con campos, no solo el alta — y funciona porque ningún formulario del
panel guarda su valor solo en el DOM (punto 17).

Medido después, en Chrome, **forzando un repintado en la 5.ª letra**: 0
letras perdidas sobre 20. Antes del arreglo se perdían 13.

### Lo que hay que respetar al tocarlo

- **Los ids no se editan.** El del club viaja en `?club=` y en los
  tokens; el de la categoría es la clave de estados y links. La pantalla
  los muestra en solo lectura al editar.
- **El id de categoría se propone SIN el año** (`primera`, no
  `primera-2026`): la categoría sobrevive a la temporada.
- **La guía nombra botones, y un test verifica que existan** en la
  pantalla. Una guía que manda a buscar un botón que no está es peor que
  no tener guía.

---

## 54. LOS CLIENTES DEL MISMO LIBRO · alcance, herencia y color

Auditoría del 2026-09-11 sobre los clientes dados de alta desde el Panel
Master (Hogar Social y Universitario, sobre el libro de DEPORTIVO), medida
en producción con links de cliente de verdad. Tres defectos, y ninguno
dejaba un error visible.

### 1 · «PUBLICAR» NO LE LLEGABA A NINGÚN CLIENTE

`SGADD_CLIENTES.iniciar()` pedía el catálogo **solo con rol ADMIN**
—nació para el selector de clientes— y de ese catálogo leen las zonas
publicadas (`SGADD_CONFIG.publicado`), los partidos sin estadísticas
(`clasifManualesVigentes`) y el nivel. Para un cliente la lista era
`null` y todo caía al JSON del repo:

```
                  catálogo   zonas desde   zonas   partidos manuales
cliente DEPORTIVO    no        el JSON        3            0
admin DEPORTIVO      sí        publicado      4          2 (4 badges)
```

O sea que la respuesta a «¿alcanza con Publicar?» era **no**, aunque la
pantalla dijera que sí. Ahora **toda sesión con token pide el catálogo**;
lo que sigue siendo solo del admin es el SELECTOR (`seMuestra`), y lo
comercial el servidor ya no se lo manda a quien no es admin.

- El arranque lo entrega ANTES de inicializar la categoría
  (`reconciliarConCatalogo` → `SGADD_CLIENTES.recibir`): el primer
  pintado ya sale con lo publicado.
- Si llega tarde, `recibir()` repinta **una vez** la sección que lo
  muestra (Clasificación o Principal).

**Publicar alcanza. Exportar el JSON es un respaldo opcional** del repo:
sirve si el servidor no contesta —el panel cae a ese archivo— y deja el
cambio en el historial. La pantalla lo dice con esas palabras. La
PRECONFIGURACIÓN (pestaña Torneo) es la excepción: no tiene publicación,
así que ahí sí hay que exportar y commitear.

### 2 · EL COLOR DE MARCA · un club sin JSON salía con el naranja de Reconquista

Es el tema por defecto del panel. El catálogo guarda ahora `acento` por
club (lo escribe el alta, lo publica `publico()` para todos) y
`CLUB.reconciliarConfig` lo aplica: **el publicado le gana al del JSON**,
por la misma cascada que las zonas (punto 31). La variante oscura se
DERIVA — pedirle al admin un segundo color es pedirle un dato que no tiene.

El formulario de alta tiene **«Color de marca»** con un botón **«Del
escudo»**: `CLUB.colorDeEscudo()` agrupa los píxeles opacos en cubos de 32
niveles, descarta blancos, grises y negros, y devuelve el **promedio** del
cubo ganador (el centro del cubo es un color que el escudo no tiene).
Contrastado contra los dos colores medidos a mano:

```
DEPORTIVO     escudo #34358a   JSON #33348a
Sud América   escudo #075c1d   JSON #0d5e27
```

**Un escudo blanco y negro no propone ningún color** — el de Universitario
lo es — y la pantalla lo dice: ahí el admin elige. El escudo del header,
sin JSON, sale del EQUIPO propio (`equipoEscudo`) y no del nombre del club.

### 3 · LO QUE ES DEL TORNEO VIVÍA EN UN CLIENTE

Las zonas y los partidos sin estadísticas son hechos del TORNEO, pero se
guardaban en el cliente que los cargó: el que se sumaba al mismo libro
arrancaba sin zonas y con una tabla que no cuadraba. En producción, los
cuatro clientes del libro de DEPORTIVO tenían **tres formatos distintos**
(uno sin zonas, uno con la última zona rotulada «Zona nueva», uno —el
JSON de Sud América— sin la Zona C) y solo DEPORTIVO tenía los 2 partidos.

Dos piezas, las dos en `catalogo-mutar.js`:

- **HERENCIA** (`heredarDelLibro`): una categoría que ESTRENA libro trae
  las zonas del libro elegido con `libroDe` —o del primero de ese libro
  que tenga— y los partidos de TODOS los clientes del libro, sin repetir.
  **No pisa nada**: si ya tenía zonas o partidos, se quedan. Corregir la
  etiqueta de una que ya estaba no hereda.
- **ALCANCE**: todo cambio del Panel Master pregunta **«¿En qué clientes
  querés aplicar este cambio?»** — solo este, los que comparten su Sheet ID,
  o todos.

### La tabla de alcances es UNA, en sgadd-auth.js

```
zonas              este · libro · todos
partidos_manuales  este · libro          (en otro libro esos equipos no existen)
cambiar_plan       este · libro · todos
renovar            este · libro · todos
todo lo demás      este                  (pausar, dar de baja, el alta, el informe)
```

`ALCANCES_POR_ACCION` vive en el módulo que comparten el navegador y el
servidor —igual que `CUPO_MAILS`—: el modal lo lee para ofrecer las
opciones y `aplicar()` lo hace cumplir. **Las tres opciones van siempre a
la vista**; las que no corresponden salen grises con el texto de
`motivoSinAlcance`, porque una opción que desaparece obliga a adivinar.

Reglas que hay que respetar al tocarlo:

- **Quién comparte libro lo decide el sheetId, en el servidor.** El
  navegador recibe solo una HUELLA (`libro`, FNV-1a de 8 hex, **solo el
  admin**) que dice que dos categorías leen el mismo libro sin decir cuál.
- **Todo o nada.** `aplicar()` recorre los clubes sobre el catálogo que va
  quedando; si uno falla, no se escribe ninguno y el motivo nombra al club.
- **A un club de UNA categoría se le escribe el bloque del club; a uno de
  varias, el de ESA categoría** (`crearBloque`), para no darle a sus otros
  torneos las zonas de este.
- **Nunca viajan las claves del que publica**: `datosPara()` le saca el
  `porCategoria` y la `claveVieja`, que son de SU club.
- **La respuesta dice a quiénes llegó** (`aplicadoA`) y qué heredó el
  nuevo (`herencia`), calculado por el servidor: la pantalla lo muestra
  tal cual.

### La clave de una categoría es su SLUG

Las zonas propias (`porCategoria`) y los partidos se guardaban con el id
de planilla del JSON (`naranja-u21-clausura-2026`), que el servidor no
conoce: sin el slug (`reconquista-u21`) no podía nombrar la categoría de
otro cliente. `SGADD_CONFIG.clavesDeCategoria()` busca por **las dos, el
slug primero**, así lo guardado antes sigue valiendo; lo que se publica va
por slug con la `claveVieja` para que el servidor la borre, y un club de
una sola categoría se migra en el mismo gesto.

**Al publicar un bloque de club, las claves de `porCategoria` pasan a
slug** (`porCategoriaASlugs`) y si una figura con las dos gana la del id
de planilla: es la que acaba de editar la pantalla.

### Lo que el alta NO hereda, y por qué

La **preconfiguración** (calendario, equipos esperados, sellos) vive solo
en el JSON y en el navegador, no en el catálogo: un cliente sin JSON no la
tiene. Es la misma deuda de la pestaña Torneo — no se publica.

---

## 55. EL PLAN EFECTIVO, LA RACHA Y EL ARRANQUE SIN DESTELLO

Tres correcciones del 2026-09-11, las tres medidas en producción.

### 1 · El plan que se muestra y se hace valer es el del CATÁLOGO

> **Desde 2026-09-13 el plan y el estado son de la CATEGORÍA**, con
> herencia del club: el «plan del club» de acá es el que heredan las
> categorías que no declaran uno. Ver el punto 60.

Síntoma: un admin mirando Universitario —que el Panel Master pinta en
**Bronce**— veía «◆ Plan ORO · Auditoria MotorStats activa». Dos causas:

- **`planEfectivo` sin plan en el club mandaba el del TOKEN**, o sea el
  del link de quien mira: para el admin, ORO. El Panel Master, en cambio,
  pinta un plan vacío como Bronce. Ahora, **con el catálogo de KV, un club
  sin plan es BRONCE**; con el de RESPALDO (entorno o código, cuando
  Upstash no contesta) sigue mandando el del link, porque esos catálogos
  no traen planes y castigar a todos con Bronce por una caída sería peor.
  `planEfectivo(club, sesion, origen)` recibe el origen; sin él se
  comporta como antes.
- **El panel decidía el menú con el plan del LINK.** `tieneModulo` lee la
  sesión, que sale del token, así que un cliente bajado a Bronce seguía
  viendo Scouting y chocaba contra un 403. El servidor declara ahora el
  efectivo en `usuario.plan` del catálogo (el del club del token) y en
  `alcance.plan` con los datos, y `adoptarPlanEfectivo()` lo pone en la
  sesión (`SGADD_AUTH.fijarPlanEfectivo`) y repinta menú, pie y la sección
  abierta si depende del plan.

**Solo el CLIENTE adopta.** Para un admin `alcance.plan` es el plan del
club que está mirando, no el suyo: adoptarlo le haría decir «Plan Bronce»
en su propio pie. El admin no tiene restricciones de todos modos.

El scouting declaraba en su respuesta el plan del token aun después de
decidir con el efectivo: ahora declara el efectivo.

### 2 · La racha con los partidos sin estadísticas

`e.racha` sale del núcleo, que solo ve los partidos con box score: un
partido cargado a mano no cortaba ni estiraba la racha del encabezado.
`SGADD_CLASIF.rachaConManuales(partidos, detalleManual)` los ordena como
el núcleo —por fecha, los sin fecha al final— con los manuales en SU
fecha; sin manuales da exactamente la racha del núcleo. La fecha manual
se lee como medianoche LOCAL, que es como el núcleo lee las de la
planilla. `clasifRachaDe(idx, e)` le pasa los del tramo abierto.

**El informe de scouting sigue con la racha y el récord del núcleo**
(`SGADD_SCOUT.fichaEquipo`): el motor es puro y no conoce el catálogo.

### 3 · El cartel rojo espera al catálogo

Un club dado de alta desde el Panel Master no tiene `clubes/<id>.json`
(punto 53), así que el fetch del JSON da 404 en CADA carga. El cartel
«Configuración del club no encontrada» salía a los 0,3–1 s y el cruce con
el catálogo lo retiraba enseguida: un destello rojo en cada F5.

Medido con un observador de mutaciones instalado antes del primer script
(`Page.addScriptToEvaluateOnNewDocument`) sobre tres arranques: era el
**único** nodo rojo transitorio. El resto de lo que se pinta en rojo son
datos (porcentajes por debajo de la liga), no avisos.

Con backend y token el cartel queda PENDIENTE (`estado.cartelPendiente`)
y `CLUB.confirmarSinConfig()` lo muestra recién si ni el JSON ni el
catálogo trajeron al club; lo llama `resolverClubYPlanilla()` después de
`reconciliarConCatalogo()`. **Sin backend sale en el acto, como siempre**:
ahí no hay nada más que esperar.

---

## 57. LOS ESTADOS COMPARTIDOS · y lo que ninguna rutina puede pisar

Pedido del club (2026-09-12): lo que un DT marca en la campana —lesionado,
suspendido, baja, alta, con su nota— lo tiene que ver el resto del cuerpo
técnico. Hasta acá cada navegador tenía su propia verdad en `localStorage`
(punto 13).

### Dónde viven

```
GET  /api/v1/estados/:club/:categoria      el mapa de la categoría
POST /api/v1/estados/:club/:categoria      { cambios: { "NOMBRE|EQUIPO": registro } }

Upstash  sgadd:estados:<club>:<categoría>  un HASH · un campo por jugador
```

`server/rutas/estados.js`, **en su propio archivo** como `libro.js`, y en su
**propia clave** de KV. La clave de la categoría es el **slug** (punto 54):
el id de planilla del JSON el servidor no lo conoce. La copia local sigue
indexada por id, que es la clave que ya tenían guardada los navegadores.

- **Un cliente solo lee y escribe los de SU club**; el admin, los de
  cualquiera. La categoría tiene que existir en el catálogo —sin eso un
  token podría crear claves— y un club pausado o vencido no recibe el
  servicio, con el mismo guard que los datos.
- **Sin backend o sin sesión** (GViz, la demo) no pasa nada de esto y el
  buzón es exactamente el de antes. Verificado en la demo.

### Las tres reglas que protegen lo cargado

1. **Se escribe UN JUGADOR, nunca el mapa.** `HSET` campo por campo
   (`kv.escribirCampos`). No existe un camino que haga `SET`, `DEL` ni
   `HDEL` sobre la clave: ninguna escritura —de este panel, de un deploy o
   del Panel Master— puede dejar a otro en cero. Hay un test que lee el
   fuente y falla si aparece.
2. **Gana el cambio más nuevo, jugador por jugador.** `aplicar()` sella
   `actualizado` en ms y `resolverEscritura()` solo escribe lo
   estrictamente más nuevo: un navegador que vuelve de estar sin red con
   una decisión de ayer no pisa la de hoy, y reenviar lo mismo no hace
   nada. La marca se **topa en la hora del servidor**: un reloj adelantado
   ganaría todas las carreras.
3. **Nada se borra.** «Reactivar» escribe ACTIVO con `origen: usuario`,
   que es además lo que hace que el buzón no vuelva a preguntar.

Las funciones son **puras y viven en `sgadd-estados.js`**, que el servidor
ya comparte (`server/lib/compartido/`): el servidor decide qué escribe con
la misma regla con la que el navegador fusiona lo que baja.

### La vuelta del navegador

`sincronizarConServidor()` baja, fusiona (`fusionarRemoto`), sube lo que el
servidor no tiene o tiene más viejo y se queda con el mapa que devuelve.

- **Cuándo baja**: al cargar una categoría, al volver a la pestaña
  (`visibilitychange`) y **cada 30 s** mientras está a la vista. No hay
  canal de push en serverless, y 30 s es lo que tarda un DT en avisar de
  palabra que marcó a alguien. **Medido con dos Chrome contra la API real
  en local: el otro lo vio a los 26 s sin tocar nada.**
- **Cuándo sube**: en el mismo gesto de marcar, resolver o reactivar. Si
  falla, la decisión queda local con su marca y sube sola en la vuelta
  siguiente; el toast lo dice.
- **Un fallo de LECTURA contesta 503, no un mapa vacío**, y
  `leerEstados` lanza. Si el navegador tomara el vacío como la verdad
  borraría su copia local: es el bug del punto 23 con otro disfraz.
- **La vuelta FUSIONA contra el mapa de ahora**, no lo reemplaza: si el DT
  marcó a alguien mientras la vuelta estaba en el aire, asignar el mapa
  que bajó lo borraba. La vuelta encadenada lo sube.
- **Lo guardado antes de todo esto migra solo**: un registro local sin
  marca de tiempo es el más viejo, se conserva y se sube la primera vez.

El pie del drawer dice **dónde queda lo que se confirma**: en el servidor
para todo el cuerpo técnico, solo en este navegador, o sin conexión y
pendiente de compartir.

### Y el CATÁLOGO se escribe sobre lo que hay · `cargarParaEscribir`

Auditando esto apareció el agujero grande, y no era de los estados: **toda
escritura del catálogo es read-modify-write del objeto ENTERO**, y leía
con `cargar()`, que está hecha para SERVIR:

- con Upstash sin contestar un instante, `cargar()` baja al respaldo en
  silencio, y **ese literal del código se escribía encima de KV**: se
  perdían los planes, las zonas publicadas y los partidos cargados a mano
  de todos los clubes;
- con el caché de cinco minutos de otra instancia, se escribía sobre una
  foto vieja y **se deshacía lo que otro admin publicó en el medio**.

`catalogo.cargarParaEscribir()` lee KV **sin caché** y **lanza** si no lo
pudo leer o si trae algo inválido (`KV_ILEGIBLE`, `KV_INVALIDO`): mejor no
guardar que pisar. La única vez que parte del respaldo es con la clave
**ausente**, que es el catálogo antes de la primera alta. La usan el
handler del Panel Master (503 con el motivo) y el CLI en `alta`, `baja` y
`sembrar`. `listar` y `exportar` siguen con la cascada: muestran.

Los estados, además, **no están adentro del catálogo**: ninguna de esas
escrituras los puede alcanzar, y hay un test que lo verifica sobre los
handlers de verdad.

---

## 60. EL CLUB ES EL PADRE, LA CATEGORÍA ES LO QUE SE CONTRATA

Pedido del club (2026-09-13): un club con Primera en ORO, la U23 en PLATA
y la U19 en prueba; pausar una sin congelar las otras; y que el panel haga
valer el plan de la categoría ABIERTA, no uno del club entero.

### Lo que la auditoría encontró

**La jerarquía ya existía.** `catalogo[club].categorias[slug]` es un padre
con N hijos, cada uno con su libro, y sumar una categoría a un club ya se
podía («Editar · club → ＋ Agregar una categoría nueva»). Un cliente suelto
ya era un club con una sola categoría.

**Lo que no existía era lo granular.** `plan`, `estado` y `vence` vivían
SOLO en el club, y todo lo que decide leía de ahí: el guard de suscripción,
el plan efectivo, el cupo de mails, el token del login y el menú. Pausar la
U19 cortaba Primera, y un club con dos categorías tenía un solo plan.

### La cascada · vive en `sgadd-auth.js`

```
PLAN     categoría  →  club  →  (el servidor: BRONCE con KV, el del link con respaldo)
ESTADO   club pausado / dado de baja / vencido  →  CORTA TODO
         si el club tiene acceso                →  el de la categoría, si declara
                                                →  si no, el del club
```

`AUTH.suscripcionDeCategoria(club, slug)` la resuelve y dice **de dónde**
salió cada valor (`planDe`, `estadoDe`). Vive en el motor que comparten el
navegador y el servidor (`server/lib/compartido/`), por lo mismo que
`CUPO_MAILS`: el servidor la hace valer con un 403 y el Panel Master la
pinta. `catalogo-mutar.estadoEfectivo` delega ahí.

- **El club corta todo** porque es el titular: pausar al cliente entero no
  puede dejarle abierta una categoría que tenía `activo` escrito.
- **La categoría hereda cuando no declara**, y eso es la retrocompatibilidad:
  el catálogo de hoy tiene todo en el club y se sigue leyendo igual. Hay un
  test con un club en `PRO` que tiene que seguir dando PLATA.
- **`prueba` es un estado nuevo que DA ACCESO** (`ESTADOS_CON_ACCESO`). No es
  `activo` con otro nombre: es al que hay que llamar cuando termina. Un
  `activo` o una `prueba` con la fecha pasada están vencidos.
- **Un estado que no se reconoce se lee como «hereda».** `validar()` del
  catálogo solo exige la FORMA (texto): rechazar el catálogo entero por un
  valor raro tiraría a todos los clubes al respaldo.

### Dónde se hace valer · el único punto es `catalogo.resolver()`

`resolver()` arma `suscripcion` con la cascada, y por él pasan los datos, el
scouting y los estados compartidos. Por eso `guardSuscripcion` y
`planEfectivo` **no cambiaron su lógica**: ya miraban `cat.suscripcion`, que
ahora es la de la categoría pedida. `alcance.plan` y `alcance.bloques` de
`/equipos` salen por categoría: la ficha por jugador (ORO) se concede en la
U23 y se niega en Primera **con el mismo token**.

`suscripcion.estado` guarda el estado DECLARADO que rige y no el efectivo:
`vencido` se deriva de la fecha en `estadoEfectivo`, y guardarlo derivado
lo haría derivar dos veces.

**Lo que es del club como TITULAR** se mide contra `AUTH.planDelClub`, el
plan más alto que tiene ACTIVO: el cupo de mails (los accesos son los
mismos para todas sus categorías) y el plan que se firma en el link. Una
categoría pausada no suma. El login además rechaza a un club con todas sus
categorías pausadas de a una (`SUSCRIPCION_CATEGORIAS`): entraría a un
panel donde cada selector le dice que no.

### Lo que viaja al navegador

`catalogo.publico()` manda plan y estado **de las categorías del club del
token** (`planEfectivo`, `estadoEfectivo`, `bloqueada`) y, al admin, además
lo declarado (`plan`, `estado`: `null` = hereda). Los de los demás clubes no
viajan: son su situación comercial, la misma regla del plan del club.

### El panel adopta el plan de la categoría que abre

- `CLUB.reconciliarConfig` copia plan y estado a la planilla; una
  **bloqueada** queda `activo: false`, así que el arranque no la elige y un
  link viejo a ella abre en otra que anda.
- `SGADD_APP.cargar()` **adopta el plan de la planilla ANTES de pedir los
  datos**: sin eso el menú ofrecía, durante la carga, lo que la categoría
  nueva no tiene. `alcance.plan` de la respuesta lo confirma. Solo el
  CLIENTE adopta (punto 55).
- **El selector dice el plan de cada categoría** («Primera 2026 · ORO») y
  por qué no se abre una bloqueada («U19 — pausada», que no es lo mismo que
  «sin datos»). `SGADD_APP.sufijoCategoria` es puro y está testeado. Es la
  «selección al ingresar» que pidió el club: Principal también pinta la
  barra, así que el cliente la ve apenas entra; con una sola categoría entra
  directo, como siempre.

### Panel Master y CLI

- **Cada categoría tiene su línea con plan y estado**, en una SEGUNDA fila y
  no en dos columnas más: la tarjeta es angosta en la grilla del hub y con
  cinco columnas la tabla scrolleaba, dejando el estado cortado. El «hereda
  · PLATA» a la vista es lo que evita tocar el plan del club creyendo que se
  cambia una categoría.
- **Pasa por el modal de confirmación** (punto 30), que dice «Se aplica SOLO
  a esta categoría». Cancelar devuelve el desplegable a lo que tenía:
  `SGADD_CONFIRMAR.abrir` acepta ahora `alCancelar`.
- **Reactivar una categoría BORRA su estado** en vez de escribir `activo`:
  vuelve a heredar, y un club en prueba no queda con una categoría que diga
  «activo» sin que nadie lo decidiera. Un `activo` elegido a mano sí se
  guarda (`heredar: false`).
- **El alta pide el plan** («Plan de la categoría») y deja arrancar en
  prueba. Un plan desconocido se RECHAZA en vez de caer al más bajo: lo
  escribió el admin y un typo le bajaría el plan a quien paga. Sin el campo
  en el pedido no se toca: editar la etiqueta desde una pantalla vieja no
  borra un plan.
- **El cambio de plan de una categoría se propaga por categoría** con el
  alcance «libro», no a los clubes enteros. Cambiar el estado de una
  categoría es siempre de a un cliente.
- **CLI:** `catalogo.js plan|estado --club X [--categoria Y]`, que pasan por
  `mutar.aplicar` con todos sus guards; `alta --plan`; y `listar` muestra
  plan y estado con su origen.

### Lo que no se pisa

Todo pasa por `cargarParaEscribir` + `mutar.aplicar` (punto 57), que es una
mutación quirúrgica sobre el catálogo recién leído. Los accesos
(`sgadd:clientes`) y los estados de jugador (`sgadd:estados:*`) viven en
OTRAS claves: expandir un club, cambiar un plan o pausar una categoría
escribe solo `sgadd:catalogo`. `test-clientes-estructura.js` lo verifica
contando las operaciones sobre el KV de mentira.

### Lo que quedó abierto acá · CERRADO en el punto 61

El equipo propio, el vencimiento y el ciclo de informes ORO eran del club.
Desde el 2026-09-13 son de la categoría, con la misma herencia.

---

## 61. EQUIPO, VENCIMIENTO Y CICLO ORO POR CATEGORÍA · y el glosario sin hojas

Los tres pendientes del punto 60, pedidos por el club el 2026-09-13, con la
misma regla: **la categoría declara, si no hereda del club**. Viven en el
motor compartido (`sgadd-auth.js`), por lo mismo que la cascada del plan.
`test-clientes-estructura.js` los ejerce sobre los handlers reales, y cada
arreglo se verificó al revés (sacar el del equipo: 3 fallas; el del
vencimiento: 11; el del ciclo: 3).

### 1 · El equipo propio · `AUTH.equipoDeCategoria`

La planilla nombra al mismo club distinto según la competencia: Reconquista
es `RECONQUISTA A` en Primera y `RECONQUISTA` en la U23. Con un equipo por
club, un cliente abría la U23 y el recorte del servidor le devolvía un libro
**sin su propio equipo** — la grilla vacía del punto 19.

- **El catálogo**: `categorias[slug].equipoPropio`, opcional. Se guarda la
  CLAVE normalizada, y declarar el mismo que el club lo BORRA: guardado
  repetido, un cambio del club no le llegaría a esa categoría.
- **El servidor** (`sesionDeCategoria` en handlers): el recorte de
  `Base Datos J`, el 403 por equipo ajeno, el cruce del scouting y
  `usuario.equipoAsignado` usan el de la categoría pedida. **Solo reemplaza
  el HEREDADO**: un mail dado de alta con su propio equipo conserva el suyo.
  Y solo para el club del token. El plan y los bloques siguen midiéndose
  con `ctx.sesion`: no dependen del equipo.
- **El panel**: `SGADD_APP.cargar()` adopta el equipo ANTES de pedir datos
  (`SGADD_AUTH.fijarEquipoEfectivo`, solo el cliente) y lo confirma con
  `alcance.equipoAsignado`. El patrón de `esEquipoPropio()` sale de
  `CLUB.patronDeCategoria`: respeta el del JSON si ya reconoce al equipo
  (`/RECONQUISTA/` cubre a los dos) y si no, ancla el de la categoría.
- **Panel Master**: con un club nuevo o de una sola categoría el campo
  edita el equipo del CLUB; al sumar una categoría o al editar una de
  varias dice **«Equipo propio en esta categoría»** y manda
  `equipoPropioCategoria`. CLI: `catalogo.js equipo --club --categoria --equipo`.

### 2 · El vencimiento y la prueba que termina sola

`categorias[slug].vence` (AAAA-MM-DD). **Solo ACOTA**: la fecha del club
sigue cortando todo, así que una categoría no se estira más allá de la
factura.

- **Una PRUEBA vencida pasa a PAUSADA** (`pruebaVencida: true`), no a
  vencida: no hubo un período pago que vencer. Una categoría `activo` con
  su fecha pasada sí queda `vencido`. Aplica sobre el estado que rige,
  propio o heredado.
- **Se DERIVA, no se guarda**, como el vencimiento del club: nadie escribe
  nada el día después (el test lo verifica contando escrituras).
- **`resolver` guarda lo declarado y la fecha que rige**, y `estadoEfectivo`
  de esa suscripción da exactamente el estado de la cascada: hay un test
  que recorre las **180 combinaciones** de estado y fecha de club y
  categoría.
- **Extender la fecha la reabre** sin reactivar a mano. Una fecha pasada se
  rechaza (para cortar está Pausar) y vacía la borra.
- El guard dice «La prueba de esta categoría terminó el …»; el selector,
  «— prueba terminada»; el Panel Master, *prueba terminada* y un
  `<input type="date">` por categoría. El alta deja arrancar en prueba con
  **«Prueba hasta»**. CLI: `catalogo.js vence --club --categoria --vence`.

### 3 · El ciclo ORO · `AUTH.cicloDeCategoria`

Cada categoría en ORO lleva `cicloDesde` e `informesEntregados`: el informe
se debe cada cuatro partidos DE SU EQUIPO, y un contador compartido le
descontaba a la U23 el informe de Primera.

- **Retrocompatible sin migrar**: un club de UNA categoría con los
  contadores en el club los sigue viendo; al marcar el siguiente se MUDAN a
  la categoría y los del club se borran. Con varias categorías el contador
  viejo NO se reparte — sería inventar a cuál le tocaba. Medido en
  producción antes de tocar nada: ningún club tenía contadores.
- `informe_entregado` exige `categoria` si el club tiene varias.
- El bloque **◆ Oro** del Panel Master tiene una línea por categoría en ORO
  con acceso, cada una con su «Marcar entregado». El ciclo solo se muestra
  con esa categoría abierta; sin partidos dice «abrí la categoría» — y se
  cerró de paso un defecto viejo: `ciclo(c, null)` daba 0/4, porque
  `Number(null)` es 0.

### 4 · El glosario sin hojas y PPP por jugada

- **Fuera la columna «Hoja» y la card «Hojas»** (`4F`, `AC`, `BD`, `E / J`):
  en el panel el DT no abre la planilla. Se descartan en el GENERADOR, no
  en la vista: el buscador las habría devuelto igual.
- **`PPP OF` y `PPP DEF` son «Puntos por jugada ofensivos/defensivos»**,
  con `PTS / PLAYS` y `PTS_opp / PLAYS_opp`. El manual del motor dice «por
  posesión», y se corrige en `CORRECCIONES` de `generar-glosario.js`
  porque el manual es de otro proyecto. Si la sigla desaparece del manual,
  el generador lo avisa.
- `test-glosario.js` regenera desde el manual —si está en la máquina— y
  exige el MISMO archivo commiteado.
- **CERRADO el 2026-09-25 (punto 66)**, y quedaba así: `NET PPP` decía «Diferencial por
  posesión» y `RTNG OFF/DEF` «cada 100 posesiones», con el mismo defecto
  (punto 3: los ratings son por 100 PLAYS). No se pidió; conviene
  corregirlos en el mismo `CORRECCIONES`.

### Lo que el catálogo de producción necesita, y no se escribió

El catálogo de KV de Reconquista tiene `equipoPropio: RECONQUISTA A` en el
club y ningún equipo en la U21 ni en la U23. Con esto andando, un acceso de
cliente a esas categorías sigue recortando con «RECONQUISTA A» hasta que se
declare el suyo, desde el Panel Master o con:

    node server/bin/catalogo.js equipo --club reconquista --categoria reconquista-u23 --equipo RECONQUISTA

---

## 63. LOS MAILS INSTITUCIONALES · bienvenida y avisos de vencimiento (2026-09-18)

Cuatro mails, todos desde **motorstats.ar@gmail.com** («MotorStats AR»):
la **bienvenida** al dar de alta una categoría y los **recordatorios** 5, 3
y 1 día antes del vencimiento. HTML de mail (tablas, estilos en línea, 600
px, sin imágenes externas) más texto plano. `test-mails.js` fija todo.

```
server/lib/mail-plantillas.js    las plantillas · PURO
server/lib/mail-envio.js         SMTP de Gmail sin dependencias (tls de Node)
server/lib/fichas.js             la ficha del cliente y el log de avisos
server/lib/cron-vencimientos.js  qué toca hoy (PURO) y la corrida
server/rutas/mails.js              /api/v1/fichas · /api/cron/recordatorios-vencimiento
server/bin/probar-mails.js       vista previa, simulación y envío de prueba
```

### La ficha guarda SOLO lo que el catálogo no tiene

Contacto, mail institucional, fecha de alta, modalidad de renovación y el
log `notificacionesEnviadas`. Vive en `sgadd:fichas` (un hash, un campo por
`club|categoría`) y NO en el catálogo: el catálogo se sirve a los clientes
—un mail adentro le contaría a cada club el de los demás, punto 29— y se
escribe entero. **El plan, el vencimiento, el club y la categoría se leen
del CATÁLOGO al mandar el mail**: copiarlos a la ficha sería una segunda
fuente de verdad. Se guarda con `deepMerge`: lo que no viene no se borra.
Solo sale por una ruta de ADMIN.

### La idempotencia es ATÓMICA

Cada aviso se reclama con **`HSETNX`** en `sgadd:notificaciones` antes de
salir: dos corridas a la vez mandan uno solo. Si Gmail falla, el reclamo se
libera y sale en la corrida siguiente. El id de un recordatorio lleva el
**vencimiento** (`club|cat|recordatorio_3d@2026-10-01`): al renovar, los tres
avisos del período nuevo se re-arman solos. El log de la ficha es lo que
pinta el Panel Master; lo que decide es el reclamo.

### Las reglas del cron

- **Hoy es la fecha de ARGENTINA** (UTC−3 fijo), no la de Vercel.
- **Solo 5, 3 y 1 día exactos.** Un día que el cron no corre no se recupera
  con otro texto: «faltan 3 días» mandado cuando faltan 2 miente.
- **Recibe** una categoría con acceso (activa o en prueba), con fecha de
  vencimiento —la que RIGE, club o categoría— y con mail en su ficha. El
  reporte lista a los omitidos con su motivo.
- **`vercel.json`** lo dispara a las 12:00 UTC (09:00 de Argentina).
  **Sin `CRON_SECRET` la ruta no corre** (503): una ruta que manda mails no
  puede quedar abierta. El admin la puede disparar con su token.

### EL CORTE PASÓ A LAS 23:59 DE ARGENTINA

`suscripcionVencida` cortaba a las 23:59 **UTC**, o sea a las 20:59 de acá,
y los mails le dicen al cliente «23:59 hs». Se cambió en `sgadd-auth.js`
(y su copia) y en la réplica de `sgadd-hub.js`, que `test-permisos` compara:
`T23:59:59.999-03:00`. El cliente gana tres horas de servicio el último día.

### La ficha sin mail · el aviso va al acceso del club (2026-11-26)

Leandro N. Alem (vencía el 23/11) no recibió los avisos de 5, 3 y 1 día: se
lo dio de alta desde «Quiénes pueden entrar», la bienvenida salió al mail del
acceso, pero la ficha quedó con `email: null` y el cron lo descartó con «la
ficha no tiene mail» (lo mismo con Sud América). Ahora:

- **`planificar(…, padron)`**: sin mail en la ficha, el aviso va al acceso del
  club (`mailDeAcceso`: el de ingreso más reciente; si nadie entró, el de alta
  más vieja), saludándolo por su nombre del padrón. Se omite solo si ni la
  ficha ni los accesos tienen mail. El aviso lleva `paraDe: 'ficha' | 'acceso'`.
- **La bienvenida a un mail con la ficha vacía lo anota en la ficha**
  (`enviarBienvenida`); nunca pisa uno que ya está.
- `probar-mails.js --tipo cron --real --hoy AAAA-MM-DD` dice qué habría salido
  un día dado: con el arreglo, el 18, 20 y 22/11 salían los tres de Alem.

### El remitente y la credencial

**Remitente fijo.** `SMTP_USER`, si se pone, tiene que ser
motorstats.ar@gmail.com: otra casilla se rechaza antes de conectar. La
credencial es una **contraseña de aplicación** de esa cuenta (`SMTP_PASS`,
también `MAIL_APP_PASSWORD` o `GMAIL_APP_PASSWORD`). **Sin ella no sale
nada**: la ficha se guarda igual, la bienvenida responde `SIN_CREDENCIAL`,
el cron no reclama ningún aviso y el Panel Master lo avisa en el bloque 4.

### La bienvenida LLEVA el código de invitación (desde 2026-09-18)

Estuvo al revés —el código se copiaba de la pantalla y se pasaba por otro
canal— y se cambió a pedido del club: eran dos pasos que el admin cosía a
mano. Ahora el alta y la bienvenida son un solo gesto.

`server/lib/invitacion.js` → `asegurar(club, email)` decide sobre el padrón
de hoy qué le toca a ese mail, y lo aplica con las MISMAS funciones de
`clientes.js` (el cupo, un mail por club y el admin que no se da de alta
no se repiten en otro lado):

```
no está            → ALTA con código (usa un cupo)
invitado sin clave → código NUEVO: el viejo no se puede volver a leer
ya tiene clave     → nada: el mail le recuerda con qué mail entra
otro club / admin  → la bienvenida sale SIN código y la respuesta dice por qué
```

Lo llaman los dos caminos:

- **La ficha** (`POST /api/v1/fichas` con `enviarBienvenida` o `reenviar`):
  antes de mandar, asegura el acceso del mail institucional. Si el padrón
  no se puede leer, **no sale el mail**: prometería un acceso que puede no
  existir. La respuesta trae `acceso`.
- **«Quiénes pueden entrar»** (`POST /api/v1/clientes`, alta o
  reinvitación): `mails.manejarClientesConBienvenida` **envuelve** al
  handler de accesos sin tocar `handlers.js` y, si generó un código, manda
  la bienvenida a ESE mail —puede no ser el institucional— de la primera
  categoría con acceso (`categoriaDeBienvenida`). `enviarMail: false` lo
  apaga. Que el mail falle **no deshace el alta**.

Lo que hay que respetar:

- **El código va en el cuerpo Y en el link** (`?club=<id>&email=…&code=…`,
  con `encodeURIComponent`), a pedido del club el mismo 2026-09-18: el
  panel abre con el mail y el código escritos y el cliente solo elige su
  clave. Estuvo una vuelta solo en el cuerpo, y el costo de este cambio
  queda anotado: una query string llega a los **registros de quien sirve
  la página** (GitHub Pages) y a los **escáneres de links** de algunos
  correos. Se aceptó porque el código es de un uso, vence a los 7 días, no
  deja entrar (solo elegir clave) y ya viaja en el mismo mail. El historial
  sí se cuida: ver abajo.
- **La clave no viaja nunca**: el código solo abre la elección de clave,
  una vez y con vencimiento.
- **El código sigue viniendo en la respuesta**, para el «Copiar» de
  respaldo. En la tarjeta queda plegado si el mail salió y a la vista si
  no: es la única vez que se puede leer.
- **Reinvitar invalida el código anterior**, y el modal lo dice.

### La PUERTA DE INGRESO · `?club=<id>` sin sesión

Es el link de la bienvenida y el de «Abrir su panel». Medido antes del
arreglo con `?club=hogar-social`: `clubes/hogar-social.json` en 404, el
cartel rojo, la marca y las categorías de Reconquista (los defaults), «1
hoja con errores» y ningún login a la vista. Sin token el panel no puede
bajar un dato, así que ese arranque no tenía nada que mostrar.

`CLUB.puertaDeIngreso()` (en `sgadd-club.js`, que carga primero) es
verdadero con `?club=`, backend configurado, sin `?token=` en la URL y sin
un token VIGENTE en el storage (mira el `exp`, no la firma: decide qué
pantalla mostrar, no quién es). Con la puerta:

- `esLanding()` da verdadero: no se pide el JSON del club, ni el
  catálogo, ni un libro, y la marca es la de MotorStats;
- cada sección (menos el glosario) muestra `SGADD_LANDING.puerta()`: el
  nombre sale del slug, con «Ingresar» y «Tengo un código de invitación»;
- `init()` abre el login solo: con `code` en el link, en «Fijá tu clave» y
  con el mail y el código ya escritos (`SGADD_LOGIN.prellenar`; el foco va
  al primer campo vacío, o sea la clave nueva). Los links viejos con
  `?ingreso=codigo` abren el mismo modo, vacío;
- después de entrar **se recarga siempre** (`CLUB.estado.puerta`), aunque
  el club sea el mismo: el arranque fue el de la landing y repintar encima
  dejaría la vista sin datos.

**El mail y el código se sacan de la barra en el PRIMER script que corre**
(`accesoUrl` en `sgadd-club.js`), con `history.replaceState`: reemplaza la
entrada —no agrega una—, así ni el historial ni «Atrás» los devuelven, y
el link que alguien copie para compartir el panel ya no los lleva. `?club=`
y el hash quedan. Se entregan una sola vez (`CLUB.accesoDeUrl()`), y un
mail mal formado o un código fuera de base64url se descartan.

### El NOMBRE en «Quiénes pueden entrar»

Campo opcional al lado del mail. Se guarda en el padrón (`nombre` en el
registro del mail, limpio con `clientes.normalizarNombre`: sin control ni
`<>`, hasta 80) y vuelve en la lista del club, que lo muestra antes del
mail. **No decide nada de acceso**: sirve para saludar.

- La bienvenida de «Quiénes pueden entrar» saluda con ESE nombre; sin
  nombre, «Hola» a secas — **no** el contacto de la ficha, que puede ser
  otra persona. La de la ficha da de alta con el contacto como nombre.
- Reinvitar con nombre lo corrige; sin nombre NO lo borra. La lista no
  manda nombre al reinvitar.

El 404 de `club-ejemplo.json` que se vio el 2026-09-18 era el link del
mail de PRUEBA (`probar-mails.js` usa un club ficticio), no del panel.

### El Panel Master · bloque «4 · Contacto y suscripción»

Contacto, email, fecha de alta (arranca en hoy), modalidad de renovación,
**fecha de vencimiento de la categoría** —ahora editable también para una
activa: viaja en la acción `alta`, que la pasa por `renovar()`— y el
checkbox **«Mandar el mail de bienvenida al guardar»**. La ficha se guarda
DESPUÉS del catálogo (la categoría tiene que existir) y el modal de
confirmación enumera la ficha y el mail que va a salir: nada en silencio
(punto 30). Si la bienvenida ya salió, dice cuándo y ofrece reenviarla,
también con confirmación.

### Probar sin esperar al cron

    node server/bin/probar-mails.js --tipo bienvenida                         # vista previa
    node server/bin/probar-mails.js --tipo recordatorio --dias 3              # vista previa
    node server/bin/probar-mails.js --tipo cron                               # simulación con clientes ficticios
    node server/bin/probar-mails.js --tipo cron --real                        # qué mandaría hoy (solo lee)
    node server/bin/probar-mails.js --tipo bienvenida --email x@y.com --enviar

---

## 69. EL CATÁLOGO DE CLIENTES, COMPACTO (2026-09-25)

Con seis clientes la tarjeta completa entraba; con veinte, el Panel Master
era una columna de varios metros. Medido con los clubes de producción a
1430px: la grilla de tarjetas completas mide **1551px** de alto y la compacta
**228px**.

**La tarjeta muestra lo que sirve para ELEGIR** —nombre, escudo, plan, estado
y cuántas categorías tienen libro—. El detalle, que es donde se TOCA algo,
vive en un modal: así ningún control de suscripción queda a un clic de
distancia por accidente mientras se busca a otro cliente.

- **El detalle NO se reescribe**: el modal pinta los MISMOS bloques que antes
  iban en la tarjeta (`filaCategoria`, `bloqueSuscripcion`, `bloqueAccesos`).
  Dos copias del mismo panel terminan divergiendo —punto 8— y acá una de las
  dos tendría los botones que cortan un acceso.
- **Cuatro por fila en escritorio** (`lg:grid-cols-4`), con pasos
  intermedios: con una sola columna hasta `lg` quedan de ancho completo en
  tablet, y con cuatro desde `md` un nombre largo se parte en cinco
  renglones. A 375px van de a dos, sin scroll horizontal.
- **Con planes distintos por categoría dice «mixto»**, no el primero: decir
  BRONCE de un club cuya Primera es ORO es mentir (punto 60).
- **La tarjeta es un `<button>`**: se abre con Enter. El modal cierra con
  ESC, con el botón y con un clic afuera, y **el foco vuelve a la tarjeta
  buscándola por su id** — un clic del mouse no siempre enfoca al botón, y
  ahí el disparador es el `<body>`, que sigue en el DOM y se llevaba el foco.

### Los dos tests que no probaban nada

Los dos leían el FUENTE y quedaban en verde al revertir el arreglo:

- el de la tabla de posiciones buscaba `/sinDatosTodavia/` en el archivo, y
  desactivar la rama con `false &&` dejaba la cadena ahí;
- el de la tarjeta compacta buscaba `accionClub|cambiar_plan|Pausar` en el
  cuerpo de la función, y volver a meterle un `bloqueSuscripcion(c)` no
  contiene ninguna de esas cadenas.

Los dos EJERCEN el módulo en un `vm` y miran el HTML que sale. Con eso, la
reversión cae 2 y 2. Es la lección del punto 51: *que el elemento esté no es
que se vea*, y su versión para tests — un test que no falla sin el arreglo no
está probando nada.

### El deploy del backend NO sale con `git push`

`estadisticas-backend` es **otro proyecto de Vercel** y no se despliega con
el push a `main`: el 2026-09-25 su último deploy era del 18/09, así que los
guards del punto 67 estaban en el repo y **no en producción** —un cliente
veía los dos torneos en su catálogo—. Se despliega a mano:

```bash
cd server && npx vercel --prod
```

Verificado después del deploy, contra producción y con tokens reales:

```
cliente   6 clubes, todos tipo «cliente» · ningún torneo · ningún sheetId
admin     los 2 torneos con sus zonas y equipos
padrón    alta de acceso sobre un torneo → 400 TORNEO
catálogo  pausar un torneo → 400 «es un torneo, no un cliente»
datos     cliente pidiendo el libro de un torneo → 403 OTRO_CLUB
```

---

## 73. EL PANEL MASTER SE ORDENA POR TORNEO (2026-09-26)

Pedido del club: que no haya que dudar entre «Nuevo torneo» y «Alta de
cliente», que la pantalla no crezca sin control al sumar ligas, y que el
modal de un cliente deje de amontonar los nombres en dos renglones. Con
un axioma que hasta acá no estaba escrito:

> **Un cliente SIEMPRE pertenece a un torneo. Un torneo PUEDE existir sin
> clientes** —es como se carga una liga entera para tener sus cruces antes
> de que un club contrate—.

### LO QUE SE MIDIÓ ANTES DE TOCAR NADA

```
catalogo real (KV, 2026-09-26)   6 clientes · 4 torneos
categorias de cliente            9
  enganchadas a un torneo        8
  huerfanas                      1   jujuy/jujuy-primera (temporada anterior)
la pestaña, con 3 clientes       2893px de alto, con los dos formularios abiertos
el modal de un cliente            384px (`.login-caja`), 3 textos en dos renglones
```

O sea que **el axioma ya era casi cierto**: hacerlo obligatorio no rompe
nada de lo que hay. La única huérfana es de una temporada pasada y el club
decidió **marcarla, no tocarla** — se sigue sirviendo igual.

### 1 · La jerarquía es la hoja de ruta · `SGADD_TORNEOS.arbol()`

Motor puro que devuelve `torneos` (cada uno con sus zonas, y cada zona con
sus clientes) y `huerfanos`. La pantalla se ordena por ahí, y de eso sale
que no haya dos formularios compitiendo: **el alta de un cliente nace del
botón «+ cliente» de una zona**, así que el torneo ya viene elegido.

- **Una zona sin clientes NO se esconde**: es justo donde hay que poder dar
  de alta el primero. Lo mismo la que no tiene libro.
- **Una categoría que apunta a un torneo que YA NO ESTÁ en el catálogo
  cuenta como huérfana**, con el id que decía (`torneoFantasma`): darlo por
  bueno mostraría un enganche que no lleva a ninguna parte.
- **Los huérfanos van al final y a la vista**, con el botón que abre el
  enganche **con la categoría ya elegida**. Un huérfano invisible es un
  cliente que nadie va a enganchar nunca.

### 2 · Los tres casos del pedido, resueltos sin elegir formulario

| | Cómo se hace ahora |
|---|---|
| **Torneo solo** | ＋ Nuevo torneo. Es el único alta suelta |
| **Torneo + su primer cliente** | se crea el torneo y su zona queda con «+ cliente» |
| **Cliente en un torneo que existe** | «+ cliente» en la fila de su zona |

**El servidor NO cambió para el caso normal.** Desde el punto 67 el alta
engancha sola cuando el libro viene de la zona de un torneo (`libroDe`), y
eso es lo que hace el botón: abre el alta con esa zona y su libro ya
elegidos. Lo que faltaba era que la pantalla lo hiciera obvio — antes las
zonas de torneo estaban mezcladas con las categorías de otros clientes en
un desplegable de libros ordenado alfabéticamente.

### 3 · El enganche EXPLÍCITO · la zona que todavía no tiene libro

Ahí no hay `libroDe` del que deducir el torneo, y sin esto **el primer
cliente de una zona nueva quedaba huérfano justo cuando el admin acababa
de decir a qué zona pertenece**. La acción `alta` acepta ahora `torneo` y
`zona` explícitos.

- **Se verifica que existan** (`codigo: 'ZONA'`): un enganche a algo que no
  está se ve igual de enganchado que uno bueno, y es peor que ninguno.
- **Viaja SOLO cuando el libro no lo declara.** Si el libro es el de la
  zona, mandarlo además sería un segundo lugar por donde el mismo hecho
  puede divergir (punto 8).
- **Lo que no se manda no se toca**: editar la etiqueta de una categoría
  desde una pantalla vieja no le borra el enganche.

### 4 · Elegir el libro de OTRO CLIENTE propone su torneo

Es el caso real de Sud América y Hogar Social, que leen el libro de la
Zona B igual que DEPORTIVO: si comparten libro es porque juegan el mismo
torneo en la misma zona. **Se propone, no se impone** —solo si todavía no
hay zona elegida— porque un cliente puede leer el libro de una zona y
competir en otra, y eso lo sabe el admin, no el panel.

### 5 · Los formularios no invaden la pantalla

Los tres —nuevo torneo, enganche y alta de cliente— son `<details>` que
**arrancan plegados** y se abren con un gesto. Medido: la pestaña pasó de
**2893px a 1332px** de alto (con un cliente MÁS que en la medición vieja).

**El plegado vive en el estado del módulo, no en el DOM**: los formularios
se repintan en cada tecla, así que un `open` en el nodo se cerraría solo
mientras el admin escribe. Es la trampa del punto 13, tercera vez.

### 6 · El modal ancho es un MODIFICADOR, no un `.login-caja` más grande

`.login-caja` la comparten el login, el modal de confirmación y el detalle
de un cliente. Las 24rem son las del LOGIN —dos campos y un botón— y
ensancharla ahí le cambia el ancho a los tres: un login de 700px se lee
peor, no mejor. Entra `.modal-ancho` (44rem) y lo pide solo el detalle.

Medido con el club de la captura (3 categorías, con los controles de plan,
estado y vencimiento que agrega el servidor):

```
antes  24rem · 384px · alto 736px · «Masculina Naranja · U21» y «· U23» en DOS renglones
ahora  44rem · 704px · alto 516px · CERO textos partidos
```

**El detector importa**: el primero medía `alto de celda / interlínea` y
daba nueve falsos positivos —el padding vertical infla la celda sin que el
texto rompa—. El bueno cuenta los rectángulos del NODO DE TEXTO: uno solo
significa que entra en una línea. Es la lección del punto 51 otra vez —
contar la cosa, no una proxy— y por eso el «antes» de arriba recién se
reprodujo cuando el fixture trajo los campos que manda el servidor.

`width: 100%` sigue mandando por debajo de 704px, así que en un teléfono
no cambia nada: medido a 477px, cero desbordes y el modal entra entero.
**A 375px exactos no se pudo medir** —la emulación no baja del ancho del
panel— igual que el límite que ya anota el punto 49.

### Lo que hay que respetar al tocarlo

- **La pantalla NO vuelve a cruzar clientes contra zonas por su cuenta**:
  ese cruce es de `arbol()` y tiene test. Dos lugares que lo hagan terminan
  mostrando cosas distintas.
- **`pantalla()` y no `html()`**: `html()` es la grilla de clientes y el
  alta; `pantalla()` le pone el árbol arriba. Un repintado de la grilla
  sola dejaba el árbol con el estado anterior —pausar una categoría cambia
  lo que muestra la zona de su torneo—.
- **El torneo se exige SOLO AL CREAR.** Editar una categoría que ya existe
  no puede exigir resolver un enganche viejo: es lo que deja seguir
  editando la huérfana y las ocho enganchadas sin tocar nada.
- **Cada guarda se verificó AL REVÉS**, revirtiéndola y contando lo que
  cae: el torneo fantasma 2, esconder la zona sin libro 7, la validación de
  la zona 2 y el enganche explícito 3.

### Lo que quedó ABIERTO

- **`jujuy/jujuy-primera` sigue sin torneo**, por decisión del club. Aparece
  en «⚠ Sin torneo» con su botón; engancharla es un gesto del Panel Master.
- **El alta no crea el torneo si no existe**: si no hay ninguno declarado,
  el formulario lo dice y manda a crearlo primero. Un alta que cree las dos
  cosas a la vez mezclaría dos decisiones en un solo botón.

---

## 74. EL PANEL MASTER, ORDENADO POR TORNEO · TRES AJUSTES DE UI (2026-09-27)

Tres pedidos del club sobre la pestaña que dejó el punto 73: el torneo que
aparecía dos veces, las cards sin escudo, y la pantalla que seguía siendo
larga con las cards desplegadas.

### 1 · EL TORNEO DUPLICADO SE AUDITÓ ANTES DE BORRARLO

`zona-c-la-plata-2026` y la zona `apb-2026-c` no eran dos torneos parecidos:
eran el MISMO, listado dos veces.

```
mismo libro (1whrMK…q_F0)   ·   los mismos 11 equipos   ·   cero clientes enganchados
y `torneos/apb-2026-masculino.json` ya declaraba esa zona
```

Se dio de baja la entrada de KV
(`catalogo.js baja --club zona-c-la-plata-2026`); quedan 3 torneos y
`apb-2026-c` intacta con su libro.

**El archivo `torneos/zona-c-la-plata-2026.json` NO se borró**, y no es un
descuido: es fixture de `test-torneos.js` (lo lee al arrancar, y lo usan seis
verificaciones). Un torneo dado de baja en KV y su archivo en el repo son dos
cosas distintas — el archivo es la declaración pública y no tiene sheetId
(punto 67), así que dejarlo no expone nada ni lo resucita.

### 2 · LOS ESCUDOS · la causa no era visual: el hub nunca los pedía

Medido antes de tocar nada: **0 escudos y 0 iniciales** en las tarjetas.

`LOGOS.getUrl()` SOLO LEE DEL CACHÉ, y quién lo puebla es `resolver()`, que
corre con una categoría abierta. El Panel Master no abre ninguna. Y encima
`CFG.basePaths` es del club ACTIVO, o sea de una sola liga: desde un panel de
La Plata, el escudo de Jujuy no se podía resolver ni pidiéndolo.

El hub lee ahora el manifiesto de **cada liga** por su cuenta (`pedirEscudos`
/ `urlEscudo` / `escudoClub`), sin tocar el resolutor global. **Se mantiene
separado a propósito**: el resolutor prueba PREFIJOS del nombre, que es el
bug `deportivo.png` del punto 6 — con `deportivo`, `DEPORTIVO LA PLATA` y
`DEPORTIVO SAN VICENTE` se llevaban el mismo archivo. Acá la clave es el id
del club, que es exacto.

**`.escudo-hub` va con `object-fit: contain` y fondo blanco, NUNCA `cover`.**
Dos escudos no son cuadrados (`hogar.webp` 256×113,
`sud-america-lp.webp` 191×256) y `cover` les recortaba las puntas, que es
justo lo que el punto 25 prohíbe.

Medido después: **6 escudos, 0 iniciales**.

> Se sirve por HTTP (`.claude/launch.json`) y no por `file://`: ahí el CORS
> bloquea el manifiesto y no hay un solo escudo (punto 7).

### 3 · LAS CARDS DE TORNEO ARRANCAN PLEGADAS, 3 POR FILA

Son `<details>`, y **el plegado vive en el módulo** (`abiertos` +
`abrirTarjeta`), nunca en el DOM: la pestaña se repinta entera al tocar
cualquier cosa — el alta, un plan — y un `open` en el nodo se perdería en
cada repintado. Es la trampa del punto 13, cuarta vez.

Medido con tres torneos: `porFila` **1 / 2 / 3** a 375, 768 y ≥1024 px, sin
desborde horizontal, y la pestaña en **1146 px** de alto (2893 antes del
punto 73, 1332 después).

### 4 · EL MARCADOR · LA CLASE TENÍA QUE ESTAR EN LOS DOS LADOS

El CSS de `.hub-plegable` estaba escrito en `index.html` — cinco ocurrencias
— y **ningún `.js` la usaba**: cero en `sgadd-hub.js` y cero en
`sgadd-torneos.js`. O sea CSS inerte, y el síntoma en pantalla era el
triángulo nativo del `<details>` suelto ARRIBA del título en vez de al lado.

El motivo es de layout y no de estilo: **el marcador nativo se dibuja en su
propia línea cuando el primer hijo del `<summary>` es un bloque**, que es el
caso de la tarjeta de torneo — su título va en un `<span class="flex">`.

La clase va en los **cuatro** plegables: `tarjeta()` en `sgadd-torneos.js`,
más `formTorneo`, `formVinculo` y `bloqueAlta`.

**El marcador es un `::before` ABSOLUTO y no un inline.** Con inline sería
más simple, pero en los tres `<summary>` que son `display: flex` quedaría
como flex item — correcto — y en la tarjeta de torneo, cuyo summary NO es
flex, generaría un renglón propio arriba: exactamente el defecto que se está
corrigiendo. Absoluto cubre los dos casos con una sola regla.

Medido en el navegador sobre el markup real de los dos módulos:

```
padding-left del summary    22,4px   (1.4rem: le gana a `.p-4`)
el glifo arranca en          8,8px   → no se tocan
tarjeta de torneo            pseudoTop == textoTop, exacto, a 420 y a 1200
los tres formularios         −1,7px de desfase de centro, en los dos anchos
```

Dos cosas que hay que respetar al tocarlo:

- **El `padding-left` de la regla le gana a `.p-4` / `.sm:p-5` por
  ESPECIFICIDAD** (0,2,1 contra 0,1,0), no por orden — el `<link>` del CSS
  compilado va DESPUÉS de nuestro `<style>` (punto 5 bis) y las utilidades
  ya no llevan `!important` desde que Tailwind se compila. Medido: cero
  `!important` en `sgadd.css`. Si alguna vez una utilidad volviera a
  llevarlo, el hueco desaparece y el `▸` se monta sobre el título.
- **`list-style: none` y `::-webkit-details-marker` hacen falta LOS DOS**:
  el segundo es el único que apaga el marcador en Safari.

El test **EJERCE el markup** de `UI.html()` y `HUB.bloqueAlta()` y exige que
TODA card plegable lleve la clase — no un número fijo, así que una quinta
que se agregue mañana sin ella cae sola — y por el otro lado que el CSS la
defina, porque una clase sin CSS es tan inerte como un CSS sin clase. Es la
lección del punto 69: un grep sobre el fuente quedaría verde con la clase
escrita en un comentario.

Verificado AL REVÉS, revirtiendo una pieza por vez: quitar la clase de una
card **1**, de las cuatro **1**, borrar el bloque CSS **4**, quitar solo el
`padding-left` **1** y quitar el `prefers-reduced-motion` **1**.

### 5 · Y EL PUNTO 73 SE HABÍA PUBLICADO CON DOS CLASES SIN COMPILAR

Apareció al regenerar el CSS antes de commitear, que es parte del flujo del
punto 11 y no un extra: `sgadd.css` cambiaba, con **cero selectores nuevos y
cero perdidos** salvo dos.

```
+.sm\:px-5{padding-left:1.25rem;padding-right:1.25rem}
+.sm\:pb-5{padding-bottom:1.25rem}
```

Las usan los cuerpos de los tres formularios del Panel Master
(`px-4 sm:px-5 pb-4 sm:pb-5`), que el punto 73 introdujo **sin correr
`node generar-css.js`**. Medido en el navegador contra el CSS de producción:
a ≥640px daban **16px donde el markup pide 20**. No rompía nada y no dejaba
ningún rastro — el modo de fallar de siempre del scan estático (punto 5 bis).

**Y el test que faltaba.** Ninguna verificación cubría que el CSS compilado
estuviera al día, que es justamente por lo que esto llegó a producción.
`test-responsive.js` recorre ahora el fuente y exige que **toda clase con
VARIANTE** (`sm:`, `hover:`, …) exista en `sgadd.css`.

- **Solo las que llevan variante, y no todas las clases.** Los dos puntos son
  sintaxis exclusiva de Tailwind — una clase propia no los puede llevar sin
  escaparlos — así que ahí no hay falso positivo posible. Con las utilidades
  base sí lo habría: `.zona-aviso` y `.hub-plegable` viven en el `<style>`
  del `index.html` y no tienen por qué estar en el compilado.
- **Una utilidad base nueva NO la caza esto.** La caza regenerar, y eso
  necesita red (`npx`), así que no puede vivir en la suite. Queda como el
  paso a mano del punto 11.
- **Se recorta la comilla pegada al token.** El markup sale de template
  literals y un ternario deja `'hover:bg-surface2'` con la comilla adentro
  del atributo; se recorta en vez de descartar el token, para seguir
  verificándolo. Un token con `${}` sí se descarta: una clase compuesta en
  runtime el scan tampoco la ve.

Verificado al revés con el `sgadd.css` de HEAD — el que estaba publicado —:
denuncia exactamente `sm:pb-5 sm:px-5`. Y agregando una variante nueva al
fuente sin regenerar, la nombra.

---

## 121. EL AUDITOR DEL ECOSISTEMA · seis fuentes que nadie comparaba (2026-10-15)

`node server/bin/ecosistema.js auditar`, de solo lectura. Guía y comandos de
corrección en [`OPERACION_ECOSISTEMA.md`](OPERACION_ECOSISTEMA.md).

Cruza: el catálogo de KV · el libro en Google (Service Account) · LICENCIAS
del motor (la lee la Service Account) · el `MS_TOKEN` de cada Apps Script
contra `tokenDe(parentId)` (API de Apps Script con la sesión de clasp) · los
libros de la ingesta (`sitios.js`) · `torneos/*.json` y `logos/<liga>/index.json`.

- **El vínculo libro ↔ script lo da Google** (`parentId`). El registro
  `~/mi-motor-stats/registro-scripts.json` guarda solo scriptIds (`registrar`),
  y además se recorren los `.clasp.json` del motor y de la ingesta.
- **Las suscripciones usan `AUTH.suscripcionDeCategoria`**, la misma
  cascada que aplica el servidor.
- **Un libro de la ingesta sin licencia es AVISO, no error**: lo opera un
  administrador y el cliente usa la web.
- **Escribe UN solo archivo** (el registro de scripts), fuera del repo.
  `test-ecosistema.js` lo fija. Ningún id sale entero en la salida.
- `TORNEOS_FUERA_DEL_CATALOGO` lista los archivos de `torneos/` que no tienen
  que estar en el catálogo, con su motivo (hoy, la Zona C dada de baja).
- **La capa 3 (`alta` que aplica) NO está escrita**: espera tres decisiones
  (escritura de LICENCIAS, una sola fecha de vencimiento, a quién le llega el
  mail). Ver el punto 5 de la guía.

