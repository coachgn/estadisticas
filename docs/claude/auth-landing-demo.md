# Auth, landing y demo

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 19. Roles, planes y permisos · `sgadd-auth.js`

### ESTO NO ES SEGURIDAD, Y LA DIFERENCIA IMPORTA

Es un **gate de interfaz**. El panel es estático y lee por GViz anónimo,
así que:

- los `sheetId` viven en `clubes/<club>.json`, que es un archivo
  **público**: cualquiera lo abre y lee la planilla entera sin pasar por
  el panel;
- todo el módulo corre en el navegador del usuario, así que cualquiera
  con la consola abierta se pone `plan: "PRO"` o se cambia el
  `equipoAsignado`.

Lo que **sí** hace, y es lo que vale para el producto: cada club abre su
link y encuentra SU vista sin tener que ignorar once equipos que no le
importan, el Básico ve que el módulo Pro existe y cómo pedirlo, y un cruce
de scouting no se puede armar mal por accidente.

Lo que **no** hace: impedir que alguien que quiera mirar los datos de otro
club los mire. Es la deuda del punto 10 y se cierra con backend, no con
más código acá.

Consecuencia práctica al escribir la UI: se dice *"tu plan no incluye este
módulo"*, **nunca** *"tus datos están protegidos"*. Hay tests que fijan
que el módulo declare esto por escrito.

### Los tres roles

| Rol | Cuándo | Qué ve |
|---|---|---|
| `ADMIN` | el mail está en `ADMINS` | todo |
| `CLIENTE` | hay sesión y no es admin | su equipo, según el plan |
| `ABIERTO` | **no hay sesión** | todo, como antes de que existiera este módulo |

**`ABIERTO` no es un descuido, es la única opción honesta.** No hay
autenticación: un *deny by default* no protegería nada —los datos siguen a
un `fetch` de distancia— y en cambio rompería el panel para los tres
clubes que lo usan hoy. Se llama distinto de `ADMIN` a propósito, para
poder distinguir en los tests quién entró por la puerta y quién porque no
hay puerta.

### La matriz vive en UN lugar

`MODULOS` mapea sección → requisito. No está repartida por los módulos
porque con la regla escrita en cada sección, **una sección nueva queda sin
gate y nadie se entera**. Una que falte en el mapa cae a *abierta* —igual
que antes— pero hay un test que compara las claves contra
`SGADD.SECCIONES` en los dos sentidos y falla si alguna sobra o falta.

```
principal · clasificacion · equipos · jugadores   →  abiertas
scouting                                          →  Plan PRO
simulador · configuracion · diagnostico           →  solo ADMIN
```

**Los rankings de liga NO se filtran**, y eso es la propiedad: comparar
contra la liga entera es el valor del panel, y no expone nada que la tabla
de posiciones no muestre ya. `equiposVisibles()` es para los **pickers**,
que es donde se elige a quién analizar en profundidad.

### El motivo viaja con el veredicto

`puedoAcceder()` devuelve `{ok, motivo, plan}`. Un *"no tenés permiso"*
cuando lo que falta es el plan manda al DT a pedirle acceso a alguien en
vez de mejorar el plan; y al revés, ofrecerle el Plan Pro a un cliente que
choca con el Diagnóstico lo manda a comprar algo que **no le va a dar
acceso**. Por eso `SOLO_ADMIN` y `REQUIERE_PLAN` son motivos distintos y
`SGADD_UI.sinAcceso()` escribe un texto distinto para cada uno.

Por lo mismo, **Scouting se le MUESTRA en el menú al Plan Básico**: el
punto es justamente que sepa que el módulo existe. Las tres internas se
esconden — un botón gris que no hace nada invita a clickearlo y no explica
por qué.

### El gate va DONDE SE RESUELVE la entidad, no solo en el picker

Por el picker filtrado no se llega a un equipo ajeno, pero por un **hash
pegado a mano** sí, y por el **link cruzado de Jugadores a Equipos**
también. Los dos guards están donde el módulo resuelve la entidad
(`idx.get(...)` en Equipos, `jugadoresBuscar(...)` en Jugadores), que es
el único punto por el que pasan todos los caminos.

La ficha de un jugador se resuelve **por su `EQUIPO`**, no por su nombre:
con el nombre solo, dos homónimos de equipos distintos abrirían el que no
es (punto 8).

Las dos exportaciones a PDF llevan su **propio** guard, redundante a
propósito: el archivo sale del panel y se comparte, así que es el último
lugar donde conviene confiar en que alguien filtró río arriba.

### LA REGLA DE ORO DEL SCOUTING · el lado tocado se respeta

Un cliente solo scoutea cruces donde juega su equipo. `forzarCruce(local,
visitante, ladoTocado)` **respeta el lado que el DT acaba de tocar y
fuerza el otro**. Al revés le borraría justo lo que acaba de elegir, y la
mitad de las veces parecería que el selector no anda.

```
toca LOCAL = A. Mayo        →  visitante pasa a ser su equipo
toca VISITANTE = U.N.L.P.   →  local pasa a ser su equipo
toca LOCAL = su equipo      →  el rival queda libre, no se fuerza nada
```

**Y la UI lo dice.** `SCOUT_UI.forzado` guarda qué lado se corrigió: un
selector que cambia solo y en silencio se lee como un bug. Un cruce que ya
era válido **no avisa**, porque informar de un cambio que no ocurrió es
ruido.

El motivo de la regla no es de privacidad —los dos rivales están en la
misma planilla que el cliente ya ve— sino de producto: el informe
pre-partido es para preparar UN partido propio, y armar cruces ajenos
convierte la herramienta en un servicio de scouting para toda la liga.

### De dónde sale la sesión

Sin backend no hay login, así que se **configura**. La URL gana sobre
`localStorage` para que un link armado a mano abra la vista de ese club en
cualquier navegador, y se **persiste** para que un F5 no devuelva a la
vista completa a mitad de trabajo.

```
?usuario=<mail>&equipo=<EQUIPO>&plan=BASICO|PRO
```

**`?usuario=` vacío LIMPIA la sesión**, y esa salida no es opcional: sin
ella, un cliente que entró una vez por link se quedaba con esa vista para
siempre. Es también el escape del admin que probó una sesión de cliente.

### Dos cosas que fallan cerrado a propósito

- **Un plan que no se reconoce cae a BÁSICO**, nunca a PRO. Un typo en el
  JSON no puede regalar el módulo que se cobra aparte.
- **El mail se normaliza en mayúsculas y espacios, y nada más.** NO se
  normalizan los puntos ni los alias con `+`, aunque en Gmail
  `f.reytesgn@gmail.com` sea la misma casilla: esto es una **lista de
  permitidos** y toda normalización de más ensancha quién entra. Que un
  admin tenga que escribir su mail exacto es barato.

Y la lista de admins son **mails literales**, no un patrón de dominio: un
patrón le daría admin a cualquier mail nuevo de ese dominio sin que nadie
lo decida.

### LA TRAMPA AL DAR DE ALTA UN CLIENTE · la letra del equipo

`equipoAsignado` se compara con **`claveEquipo()`**, el normalizador de
todo el proyecto, así que `DEPORTIVO LA PLATA` reconoce a `DEPORTIVO LA
PLATA - MM`. Pero **la comilla de la letra NO es decorativa**: distingue
el equipo A del B y `claveEquipo()` la conserva (punto 3).

O sea que un cliente dado de alta como `RECONQUISTA` a secas **no**
reconoce al `RECONQUISTA A` de la planilla y se queda sin ver NINGÚN
equipo — el peor modo de fallar, porque parece que el panel está roto y no
que la config lo está. `SGADD_UI.avisoSinEquipo()` lo denuncia en
pantalla, con esas palabras, en vez de mostrar una grilla vacía.

Un cliente **sin** `equipoAsignado` tampoco ve ninguno, por lo mismo:
dejarlo ver todo convertiría un error de config en acceso total sin ningún
síntoma.

---

## 27. La redirección post-login, y por qué no pasaba nada

**El destino lo decide el ROL**: el admin va al Panel Master —entra a
administrar— y el cliente a Principal con su `?club=`, que sale de su token.
Sin ese parámetro el panel cargaría el club por defecto, que no es el suyo.

Dos defectos en el camino, los dos silenciosos:

1. **`esLanding()` seguía siendo `true`.** Miraba solo si había `?club=`, y el
   token del admin no lleva club —el Panel Master es de todos los clientes—, así
   que entraba, se quedaba sin `?club=` y el router le devolvía la tarjeta
   explicativa de la landing en TODAS las secciones, el Panel Master incluido.
   Ahora **con sesión abierta no hay landing**: la bienvenida es la puerta del
   que todavía no entró.
2. **`rol()` devuelve un string, no un objeto.** `rol().rol` daba `undefined`,
   el `try/catch` ni se enteraba y todos iban a Principal.

El test EJERCE `destino()` con un token de admin y otro de cliente, y para eso
tiene que exponer `global.SGADD_AUTH`: sin eso el `try/catch` se traga el
`ReferenceError` y el test pasaría por el camino equivocado sin probar nada.

---

## 52. LA DEMO PÚBLICA Y LAS CARDS DE PLANES

Dos piezas comerciales que comparten un solo formulario: una vuelta
entera del panel sin login (`/demo`) y las tres cards de planes de la
landing. Motor y runtime en `js/sgadd-demo.js`; el generador del
snapshot es `generar-demo.js`, que se corre **a mano**.

### El snapshot está COMMITEADO, y esa es la decisión

Desde que el catálogo dejó de traer `sheetId` —«EL CATÁLOGO YA NO TIENE
sheetId, Y ESE ES EL PUNTO»— leer un libro exige pasar por el backend,
que pide token. La demo es pública por definición, así que no lo tiene.

Poner el id de un libro real en un `clubes/*.json` para que la demo
leyera en vivo **desharía esa decisión**: esos archivos son públicos.
Por eso el libro se lee UNA vez desde `generar-demo.js`, con la
credencial local (`SHEET_JUJUY_PRIMERA` de `server/.env`), y lo único que
entra al repo es el resultado ya anonimizado.

```
17 equipos · 259 jugadores · 21.104 celdas reescritas · 2.839 KB
```

**Las filas se guardan como ARRAYS, indexadas por `cols`.** Con objetos
el archivo pesaba **5.549 KB**: la mitad eran los nombres de las 53
columnas repetidos en cada una de las 2.000 y pico de filas. El precio es
que el generador y `rehidratar()` tienen que estar de acuerdo sobre el
orden, y un desacuerdo **no rompe**: corre las columnas y muestra el
`PACE` en la casilla de los puntos. Hay un test que ejerce la ida y
vuelta sobre el archivo real y no sobre una fixture de tres columnas —
el corrimiento aparece justo donde hay muchas.

### LOS NÚMEROS NO SE TOCAN · solo los NOMBRES

El valor de la demo es que el dashboard se vea **real**: percentiles
contra la liga, eFG%, PACE, arquetipos, bandas de desvío. Con números
inventados las etiquetas dirían cualquier cosa y la demo enseñaría a
desconfiar del producto.

Se reescriben `EQUIPO`, `NOMBRES` y el texto de `PARTIDO`. Lo que **no**
se toca: ningún valor numérico y los dos centinelas, `EQUIPO TIPO` y
`JUGADOR TIPO`, que son la MEDIANA (punto 3). Renombrarlas como si
fueran un equipo más dejaría al panel sin percentiles, sin bandas y sin
umbral de minutos.

**La guarda de fuga corre DOS veces.** El generador se niega a escribir
si algo se filtró, pero eso corre en la máquina de quien genera;
`test-demo.js` recorre el archivo **entero** en cada suite —no una
muestra— y exige que todo `EQUIPO` matchee `^EQUIPO \d+$`, todo `NOMBRES`
`^JUGADOR \d+$`, y que no viaje ninguna cadena con pinta de id de Google
ni una sola mención del club de origen. Es el archivo que se publica en
un repo público: la verificación tiene que estar del lado del repo.

### EL PATRÓN DEL EQUIPO PROPIO VA ANCLADO

`"patronEquipoPropio": "^EQUIPO 1$"`. Es la trampa del punto 6 —la de
DEPORTIVO— pero acá se da **sí o sí**: con 17 equipos llamados `EQUIPO
1..17`, un patrón sin anclar trata a **ocho rivales como equipo propio**
en scouting, en los informes y en el plantel, sin ningún síntoma visible.

### Tres enganches, cada uno en el único punto por el que se pasa

| Qué | Dónde | Por qué ahí |
|---|---|---|
| el club forzado | `sgadd-club.js` | carga PRIMERO y se auto-arranca: cuando `idDesdeUrl()` corre, `SGADD_DEMO` todavía no existe. Por eso `enDemo()` mira la URL **inline** |
| la sesión | `SGADD_AUTH.cargarSesion()` | es el ÚNICO punto que decide de dónde sale una sesión |
| los escudos | `LOGOS.getUrl()` | por ahí pasan la grilla, la tabla, el scatter, el scouting y los cinco PDF |

**La sesión estableciéndose desde el módulo de la demo NO funcionaba**, y
el modo de fallar era el caro: `cargarSesion()` corre DESPUÉS, en el
`init()` del arranque, y la pisaba. Medido en el navegador — la demo
abría con `sesion: null`, o sea **rol ABIERTO**, que ve TODO: se le
habrían mostrado Simulador, Configuración y Diagnóstico a cualquiera que
entrara por el link público.

**Es plan PLATA y no se persiste.** Plata porque es el plan que la demo
vende: incluye Scouting, que es el módulo que más se mira. Y no se
persiste —`establecerSesion` solo escribe en memoria— porque si quedara
en `localStorage`, el que probó la demo abriría el panel al día siguiente
convencido de que tiene una cuenta.

### `/demo` es una CARPETA con un redirect

Y no un `?demo=1` pelado: lo que se comparte por WhatsApp es una **ruta**
—`motorstats.ar/demo` se lee y se dicta— y un query string se corta al
pegarlo. `demo/index.html` hace `location.replace('../index.html?demo=1')`
y lleva `noindex`, para que la demo no le compita a la landing en Google.

### LAS CARDS DE PLANES SE DERIVAN DE `MODULOS`, NO SE ESCRIBEN

La tentación es listar a mano lo que trae cada plan. No se hace: la
matriz de qué pide cada sección ya vive en `SGADD_AUTH.MODULOS`, que es
la que el router **hace cumplir**. Con una segunda lista, la landing le
promete al cliente un módulo que el gate le niega —o al revés, le esconde
uno que ya tiene— y la que se relaja es siempre la de la pantalla. Es el
bug del rol funcional (punto 8) con un cliente que paga del otro lado.

`SGADD_LANDING.planes()` es puro y resuelve las tres cards:

```
Bronce  base    Principal · Equipos · Jugadores · Clasificación · Glosario   2 mails
Plata   +       Scouting                                                     3 mails
Oro     +       Análisis de scouters (servicio, no módulo)                   4 mails
```

**El test no compara contra una lista escrita en el test** —eso sería una
TERCERA copia— sino contra `puedoAcceder()`, ejecutándolo con una sesión
de cada plan sobre cada sección. Si alguien mueve Scouting de plan y no
toca la landing, cae. Y hay otro que lee el cuerpo de `planes()` y falla
si aparece el nombre de un módulo escrito a mano.

**Lo único escrito a mano es el servicio del plan Oro**, y no se puede
evitar: no es un módulo del panel sino trabajo humano —un informe por
ciclo de 4 partidos— y ningún `MODULOS` lo puede declarar. Lo que sí sale
del código es **su número**: `SGADD_HUB.PARTIDOS_POR_CICLO`, que es el
que el hub hace correr. Hay un test que los ata.

**El cupo de mails se dice UNA sola vez.** Estaba en las cards y otra vez
abajo, en «cómo se entra»: la misma cifra en dos lugares de la misma
pantalla es la que el día que cambie deja una vieja, y el cliente lee la
que le conviene. Sale de `SGADD_AUTH.CUPO_MAILS`, la misma tabla que el
servidor hace cumplir al dar de alta un mail.

**Ningún estado se comunica solo con color** (punto 14): lo que el plan
suma va con `✓`, el servicio con `＋` y lo que está un escalón más arriba
con `→`. Y lo que falta **no se tacha**: un tachado se lee como «esto ya
no existe» y lo que hay que comunicar es «esto está más arriba».

**La destacada no crece ni se mueve.** En una grilla de tres, escalar una
card le desalinea el borde a las otras dos, y en el teléfono —donde van
apiladas— no se nota que es distinta. Se marca con el borde de acento y
un badge, que se ven igual en las dos disposiciones.

### UN SOLO MODAL PARA LOS DOS ORÍGENES

La barra de la demo y las tres cards abren el **mismo** formulario:
nombre, rol, club, país y ciudad. **Se exigen el club, el país y la
ciudad** —son lo que el que atiende no puede deducir de la conversación—
y el nombre y el rol no, porque llegan con el propio contacto.

**El teléfono se sacó.** El mensaje sale desde el WhatsApp del propio
interesado, así que su número ya viaja con él: pedirlo era un campo que
no aportaba un solo dato.

- **El país es un `<select>`** con Argentina elegida y «Otro» último;
  «Otro» abre un campo para escribirlo, o el mensaje diría «de la ciudad
  de Lisboa, Otro».
- **La ciudad es texto libre con sugerencias** (`<datalist>` por país),
  NO un `<select>`: el básquet argentino se juega en cientos de
  localidades, y el que no encuentra la suya en una lista cerrada
  abandona.
- **Cambiar el país no repinta el modal**: rehace el datalist y nada más.
  Un repintado perdería el foco y lo ya escrito (la regla de
  `scoutMeta()`). Y la ciudad escrita no se borra.
- **El rol va en su propio desplegable.** Estuvo pegado al nombre con un
  datalist de roles, y el navegador le sugería «Entrenador» a quien
  escribía su nombre; además el mensaje no podía armar «Nombre (Rol)».
- **La validación es `faltantes()`, pura**: nombra todo lo que falta de
  una vez, marca cada campo con `aria-invalid` —el borde, no solo el
  aviso del pie— y la marca se va apenas se escribe.
- **País y ciudad van de a dos por fila cuando entran**, con
  `auto-fit`: se decide por el ancho de la CAJA y no por una media query,
  que al imprimir se evaluaría contra la hoja (punto 49). El mínimo es
  **10rem y se midió**: con 9rem el teléfono metía dos campos de 145px y
  «Preparador/a físico/a» no entraba; con 10rem se apilan en el teléfono y
  el escritorio sigue de a dos.

**Lo que sí cambia es el encabezado del mensaje**, y no es un detalle:
con un solo texto, el que toca una card en la landing —sin haber entrado
nunca a la demo— le escribiría «probé la demo», y el que atiende arranca
la conversación con un dato falso.

```
desde la demo   Hola MotorStats, probé la demo. Soy <nombre> (<rol>) del club
                <club>, de la ciudad de <ciudad>, <país>. Quiero ver cómo
                funciona el dashboard con las estadísticas de mi equipo.
desde una card  Hola MotorStats, quiero consultar por el plan <X>. Soy …
```

Un club que ya se llama «Club Atlético…» no sale «del club Club…»: la
palabra se antepone solo si falta.

**No hay backend al que mandar el lead**, así que el envío arma el
mensaje y abre WhatsApp: queda en la conversación, que además es donde el
club lo quiere atender. Prometer un «te contactamos» sin nada que lo
cumpla sería peor que no tener el formulario.

El número comercial es **`5492216143994`** y vive en UN solo lugar
(`WHATSAPP`, en `js/sgadd-demo.js`): lo usan la barra de la demo y las
tres cards. Estuvo un rato con un número de ejemplo, que es el modo de
fallar más caro de esta pieza —el formulario anda, el mensaje se arma, y
cada lead se va a un teléfono que no es—. Hay un test que exige que no
sea el de ejemplo y que el enlace lo lea de ahí y no de una constante
propia.

### EN LA DEMO EL ISOTIPO **ES** EL ESCUDO, y se resuelve en `resolverUno`

Reportado desde la demo publicada: al entrar saltaba el panel de
diagnóstico **«Faltan 17 logos»**, pidiendo subir `equipo-1.png` …
`equipo-17.png` al repositorio.

La sustitución estaba puesta en `LOGOS.getUrl()`, que es el punto por el
que pasan la grilla, la tabla y los PDF — pero **`resolverUno()` seguía
sondeando los diecisiete archivos**. Tres consecuencias, y la tercera es
la que se vio:

1. **17 pedidos fallidos por carga**, con su tanda de extensiones cada uno;
2. **`getImage()` devolvía `null`**, así que el scatter de Principal y los
   puntos del gráfico de evolución salían con INICIALES en vez del logo —
   `getUrl` y `getImage` son dos lecturas distintas del mismo caché, y la
   sustitución cubría una sola;
3. **una lista de 17 faltantes**, que es exactamente lo que dispara el panel.

Ahora se resuelve en `resolverUno()`, que es el único punto por el que
pasa cada equipo: el isotipo entra al caché como la imagen del equipo, así
que `getUrl` y `getImage` contestan lo mismo, no se pide un solo archivo
de más y **no falta ninguno por construcción**.

**El panel lleva además su propia guarda, y no es redundante.** El arreglo
de arriba hace que no falte ninguno; la guarda cubre el caso en que el que
no cargue sea **el isotipo mismo** —ahí volverían a faltar los diecisiete
y el cartel saltaría otra vez encima de la demo—. Defienden dos fallas
distintas.

Y vale para cualquier visitante, no solo para la demo: ese panel le dice a
**quien administra el repositorio** qué archivos subir. Alguien que entra a
ver el producto no tiene el repo ni por qué enterarse de que existe.

### LA DEMO NO MUESTRA AVISOS DE DATO

Reportado desde la demo publicada: el header traía **«1 hoja con
errores»**. Medido antes de tocar nada, que es lo que decidió el arreglo:

```
lastErrors            1 · «Hace falta un link de acceso para ver esta categoría»
DATA.promediosJ · promediosE · baseDatosE · promedios4f      →  0 filas
lo que Principal muestra igual   17 equipos · 260 jugadores · 17 filas de tabla
```

Sale de la **capa de datos vieja de Principal** (punto 3 ter), que lee por
su cuenta y necesita un libro conectado. La demo no tiene: sus datos salen
del snapshot. O sea que esa petición **no alimentaba una sola celda** —el
panel se dibuja entero desde el índice— y lo único que producía era el
cartel.

Se apaga en **`fetchAllData()`**, que es el único punto por el que pasan
sus tres llamadores (`init`, `refreshData` y el cambio de categoría). Con
la guarda repartida, el llamador que se agregue mañana queda sin ella — el
de la landing sigue en el llamador porque ahí se saltea además el orden de
`aplicarMarca()`.

**Y `renderStatusBanner()` lleva su propia guarda**, que no es redundante:
la primera apaga la petición que HOY los produce, la segunda cubre
cualquier otro origen — el libro de muestra sale de un club real y arrastra
sus rarezas, como el `ACUMULADO J` incompleto de Jujuy (punto 8). Es la
misma pareja que las dos guardas del panel de escudos.

Ese cartel es para el cuerpo técnico de un club, que puede ir a Diagnóstico
y hacer algo con él. Quien entra a ver el producto no tiene ese libro, no
tiene esa pantalla, y lo único que se lleva es la impresión de que el panel
viene con errores.

**La campana SÍ se queda.** Sus 30 alertas no son un error: son el buzón
del punto 13 funcionando sobre datos de muestra, que es justamente uno de
los módulos que la demo vende.

### «VOLVER AL INICIO» · y la reserva que se MIDE

La barra fija llevaba una sola salida —ninguna—: quien entraba a la demo
desde un link no tenía cómo volver a la landing sin editar la URL. Va como
**enlace y no como botón** (es navegación: se abre en otra pestaña, se
copia, se ve a dónde lleva antes de tocar), **antes del CTA** —en una barra
que se lee de izquierda a derecha el último elemento es el que pesa, y el
que paga la demo es el de WhatsApp— y en **outline**.

Apunta a `index.html` **relativo**: el panel se publica en un subdirectorio
(`/estadisticas/`), así que un `/` absoluto se iría a la raíz del dominio,
que no es este sitio.

#### El alto de la barra ya no está escrito en dos lados

La barra va fija, así que el `<body>` tiene que reservarle su alto o le
tapa el header a la app. Ese alto era una **constante en el CSS** (44px en
escritorio, 64 en teléfono) y son **dos números para el mismo hecho**: al
sumarle el «Volver al inicio» la barra pasó a 49px y se comió 5px del
header, sin más síntoma que eso.

`reservarAlto()` la MIDE y escribe el `padding-top` del body. Las dos
constantes del CSS quedan como **piso**: es lo que vale entre que la barra
se pinta y esa medición corre.

Tres cosas que costaron, y las tres solo se vieron MIDIENDO:

1. **Se mide `.demo-barra`, NO su contenedor.** `#demoBarra` es el `<div>`
   que se inserta en el body, pero la barra de adentro va `position:
   fixed`, o sea FUERA DEL FLUJO: **el contenedor mide cero**. La primera
   versión leía el wrapper, la guarda de alto positivo la salteaba y la
   reserva se quedaba en la constante — o sea que el arreglo no arreglaba
   nada y no dejaba ningún rastro.
2. **Medir una vez no alcanza.** La barra envuelve en varios renglones
   según el ancho y las tipografías entran DESPUÉS del primer layout.
   Medido en el teléfono: al montar reservaba **147px** y la barra
   terminaba en **107** — sin solaparse, pero con 40px de aire muerto
   arriba de la app. Va un `ResizeObserver` sobre la barra, que cubre las
   dos causas de una: cambia el ancho o cambia el contenido. El `resize`
   de ventana queda de respaldo.
3. **En papel la reserva se anula con `!important`.** La escribe el JS como
   estilo **inline**, así que le gana a la media query: sin eso el PDF
   generado desde la demo saldría con ese aire arriba de la primera hoja.

Medido después, sin solapamiento y sin aire muerto:

```
           barra   reserva   header arranca en
1400px      49px     50px          50   ·  13% de una pantalla de 812
 375px     107px    108px         108
```

**Lo que NO se pudo verificar acá**: el mínimo táctil de 44px del enlace
vive en `@media screen and (pointer: coarse)`, y la emulación de CDP no
activa esa rama —medido: los dos botones de la barra siguen dando 28 y
30px de alto con `mobile: true`—. La regla está donde corresponde y hay un
test que lo fija, pero en un teléfono real no se probó. Es el mismo límite
que ya anota el punto 49 para la tablet.

**Y va DENTRO del bloque táctil que ya existe, no en uno propio.** Los
mínimos táctiles viven en un solo lugar — y además un segundo bloque rompía
el recorte de `test-responsive.js`, que toma el PRIMER `pointer: coarse`
del `<style>`: doce verificaciones se cayeron juntas sin que hubiera
cambiado una sola regla de las que defienden. Otra vez el ancla frágil.

### Dos trampas viejas que volvieron a morder

1. **Una consulta de ancho sin `screen`** (punto 49). El bloque de la
   demo traía `@media (min-width: 640px)` y las cards `(min-width:
   768px)`: al imprimir se evalúan contra la HOJA. Peor, la reserva de
   alto de la barra fija se aplicaba en papel —la barra se esconde, la
   reserva no— y el PDF salía con 64px de aire arriba de la primera hoja.

2. **`test-responsive.js` matcheaba un `@page` que estaba DENTRO de un**
   **comentario.** El bloque del pie explica su mecanismo nombrando
   `@page` en prosa, y el matcher —`@page` … `{` … `}`— arrancaba ahí y
   se comía el comentario entero hasta la primera llave que encontrara,
   que resultó ser la de un `.demo-barra` con un `font-size` adentro.
   Resultado: denunciaba una `@page` sin reserva que no existe, y recién
   cuando alguien insertaba una regla nueva en el medio — o sea lejísimos
   de la causa. Ahora se parsea el CSS **sin comentarios**. Es la misma
   familia que el ancla `\r?\n` del punto 51: no cambia la propiedad que
   se defiende, cambia que se pueda romper por algo que no tiene nada que
   ver con ella.

Y una tercera, la de siempre: **el gris de lo bloqueado arrancó en**
**`#6f6f6f`, que da 3,43 sobre la tarjeta** —medido con la misma
`CLUB.contraste()` que usa el panel— o sea por debajo del 4,5 de AA. Lo
que está un escalón más arriba tiene que poder LEERSE: es justamente lo
que se le está ofreciendo al cliente.

---

## 177. LA LANDING DE UN GOLPE DE VISTA, LA DEMO CON ESCUDOS Y EL RECORRIDO GUIADO (2026-11-13)

Assets en `?v=382`. `test-tour.js` (76) fija el hero, los logos y la guía; `test-demo.js` los escudos.
Sale de la charla de estrategia (ver `resumen_estrategico_motorstats.pdf`): quien entra desde Instagram tiene que
entender en segundos qué hacemos, qué le duele hoy y qué solución le damos, y recién ahí ver la demo.

### 1 · El hero de la landing (`js/sgadd-landing.js`)
- **Orden**: marca → título («Tu scouting y el análisis de tu equipo, ya armados») → bajada → CTA de la demo
  (primero) y «Agendar demo» → cuatro pares **Hoy / Con MotorStats** → logos de las ligas → cards de secciones,
  planes y cómo se entra (sin cambios).
- **Los dolores salen de la investigación con entrenadores** (`DOLORES`): planillas y fórmulas, números sin contexto
  de liga, no saber qué decisión tomar, cuerpo técnico separado. Cada uno tiene su solución, y ninguna promete un
  número de velocidad que no se midió (hay test). El cupo de mails NO se repite acá (se dice una sola vez, en los planes).
- **Los logos de las ligas** (`LIGAS`: LNB, LAB, APdeB, ABB) salen de `logos/<liga>/liga.png` (nunca `_liga.png`: Pages no
  lo sirve, punto 152). Van en escala de grises y vuelven al color con hover o foco, **solo bajo `@media screen and
  (hover: hover)`**: en el teléfono no hay hover y un logo gris que nunca se enciende se lee deshabilitado. Cada uno lleva
  su nombre debajo y lleva a la demo.
- CSS a mano en el `<style>` (nodos inyectados), sin variantes de Tailwind: `sgadd.css` no se regeneró.

### 2 · La demo con escudos reales, y la privacidad
- **Antes** todos los equipos mostraban el isotipo. **Ahora** cada «EQUIPO N» recibe el escudo de un club de OTRA liga
  (La Plata, Bahía Blanca, Liga Nacional: 59 archivos en `ESCUDOS` de `sgadd-demo.js`), repartido con una semilla fija:
  el mismo equipo conserva el escudo en cada visita. `SGADD_DEMO.logo(nombre)` es el único punto; lo llaman `getUrl` y
  `resolverUno` de LOGOS (ahora con el nombre). Un nombre que no es «EQUIPO N» cae al isotipo.
- **Por qué NO se usan los escudos de la liga de donde salen los datos**: un escudo real al lado de las métricas de su
  club real expone a ese club (la privacidad táctica es no negociable). Ningún escudo del reparto es de la Liga
  Argentina, y ninguno corresponde a los números que tiene al lado. Es la mezcla entre torneos.
- **La numeración ahora es aleatoria con semilla fija** (`generar-demo.js`: `mezclar` + `generador`, mulberry32). Antes
  `EQUIPO 2..17` seguía el orden alfabético del nombre real, que es una pista para quien conoce los diecisiete clubes.
  `EQUIPO 1` sigue siendo el propio (el patrón `^EQUIPO 1$` no cambia); los jugadores de cada plantel también se
  numeran mezclados. Los NÚMEROS de las métricas siguen sin tocarse (punto 52). Snapshot regenerado: mismas 21.104
  celdas de nombre, sin un nombre real ni el sheetId.
- **Consecuencia en los tests**: `test-bajas.js` elegía «EQUIPO 5» por nombre y dejó de describir el mismo club; ahora
  elige el equipo por la propiedad que necesita. Un test que dependa de qué club es «EQUIPO N» está atado a un dato.

### 3 · El recorrido guiado (`js/sgadd-tour.js`, solo en la demo)
- **Nunca modal**: el oscurecido es un hueco en una sombra de 9999px con `pointer-events: none`, así que el panel
  sigue usándose; no roba el foco; Esc lo pausa; las flechas navegan.
- **No arranca solo**: la primera vez que se entra a una sección ofrece, en chico y abajo a la derecha, «¿Te muestro qué
  hay en X?» con «Sí, mostrame» / «Ahora no»; si se ignora se va a los 14 s. Una sección ofrecida no se vuelve a ofrecer.
- **El botón «Guía» queda siempre a la vista** y abre tres cosas: recorrer (o retomar) la sección, «Explicar al tocar» y
  apagar las sugerencias. Pausar guarda el paso.
- **«Explicar al tocar»** es un modo explícito y arranca apagado: con él, tocar una tarjeta, una pestaña o un ítem del
  menú muestra qué es en vez de abrirlo (se nota: el botón cambia y el cursor también).
- **Cinco recorridos** (Principal, Equipos, Jugadores, Clasificación, Scouting). Cada paso apunta por selector, por título de
  card o por texto de botón; un paso cuyo objetivo no está se SALTEA, nunca traba. `antes` prepara la pantalla solo si el
  usuario empezó (abrir un equipo, armar un cruce de ejemplo en Scouting). La cuenta «2 de 5» es la del guion, no la de lo
  visible. El margen del scroll sale de la barra de la demo (en el teléfono mide ~145px y tapaba el objetivo).
- Preferencias en `sessionStorage` (la demo es de paso). A 375px la tarjeta es una hoja abajo y no desborda.

### Lo que NO se hizo
- **Medición** (UTM y eventos): es lo primero que recomienda el resumen estratégico y sigue pendiente. Sin eso no se
  sabe si el hero y la guía mueven algo.
- **La demo no muestra «tu liga»**: los logos llevan a datos de muestra. El texto lo dice; no se afirma que el panel de
  demo tenga los datos de la liga de quien mira.
- No se verificó con un lector de pantalla ni en un celular real (solo el viewport de 375px emulado).
- Tests de documentos: `test-bajas`/`test-muestra` se ajustaron; el resto de la suite quedó verde.

---

## 178. LA LANDING DEL DOCUMENTO DE BIENVENIDA Y LA DEMO COMO LA DE UN USUARIO ACTIVO (2026-11-13)

Assets en `?v=382`. Segunda vuelta del punto 177, con lo que el club vio navegando la demo y el documento
`MotorStatsAR_Bienvenida.html` (planes, servicios a medida y la cita de la marca).

### 1 · La portada
- **Orden**: hero (con «no hace falta ser experto») → bloque «No hace falta ser experto» + la cita «Si MotorStats fuera una
  persona…, sería ese integrante más de tu cuerpo técnico» → logos → **planes directo debajo** → a medida → cómo se entra.
  **Se sacaron las cards de secciones**: las cuenta la guía y eran redundantes (la función `tarjetaSeccion` sigue, la usan
  las secciones sueltas de la landing).
- **Logos SIN contenedor**: sueltos, en gris y con color al hover; «Realizamos el seguimiento de las siguientes ligas» y
  «¿No ves tu liga? Consultanos». Cada logo lleva a `?demo=1&liga=lnb|lab|apb|abb`.
- **Planes sin precio** (varía por tipo de cliente). El contenido sale del documento y **sigue derivado del gate**: las
  pantallas de `MODULOS` (ahora con **Fixture**, que es abierta) + `EXTRAS_BASE` escritos a mano (carga automática en 24 hs,
  rankings, alertas de plantel, análisis post-partido), porque no son secciones del menú. Las pantallas se **agrupan** en una
  fila «Panel completo de la liga» (solo presentación: `planes()` sigue una por sección, que es lo que se verifica).
  **Ojo**: el documento no lista el análisis post-partido en Oro, pero «cada plan suma sobre el anterior», así que Oro lo hereda.
- **A medida** (`A_MEDIDA`, `SERVICIOS_PUNTUALES`): plan a medida para el club (más de un equipo o categoría, para elevar el
  desarrollo y la formación de jugadores), seguimiento de un equipo en un torneo y los cuatro servicios puntuales del
  documento. Sin precio («a cotizar»). `consultar(plan, servicio)` abre el mismo modal; el mensaje de WhatsApp dice
  «quiero consultar por: <servicio>».
- **No se incluyó** la «Oferta por lanzamiento — primeros 15 cuerpos técnicos» del documento: no se pidió y lleva un compromiso comercial.

### 2 · La demo como la de un usuario activo (sin carteles de error)
- **Estructura por liga** (`LIGAS_DEMO`, `?liga=`): los datos son siempre los mismos 17 equipos anónimos, pero la tabla pinta las
  zonas de la competencia elegida (LNB: directo a cuartos / reclasificación / Play Out; LAB: directo a octavos /
  reclasificación; ABB: cuartos / Play-In / permanencia; APdeB: playoffs). Son **de referencia**: salen de `torneos/*.json` y
  del reglamento de la ABB. `adaptarConfig` se aplica donde nace la config (`sgadd-club.js`) y devuelve una copia.
  Se fueron «Sin formato de competencia» y el aviso de calendario parcial.
- **Fixture**: la demo declara un torneo de muestra (`torneo()`), que `cargarTorneo` lee en vez de pedir un archivo.
  Tres jornadas hacia adelante desde hoy (EQUIPO 1 juega en todas): nunca queda vencido.
- **Fechas siempre actuales** (`rehidratar(crudo, { hoy })`): se corren TODAS las fechas el mismo número de días, de modo que
  el último partido cae ayer. No cambia un solo número, solo el calendario.
- **Principal ya no dice «Partidos —»**: sin la hoja vieja cuenta del índice (`idx.liga.partidos`).
- **El banner dice que son datos de referencia** (equipos, números y escudos mezclados de distintas ligas), invita a navegar toda la
  plataforma y manda a WhatsApp.

### 3 · La guía
- **Jugadores** suma TOP 3 del plantel (plegado), Plantel, Pack PLANTEL y Ranking del plantel; **Principal** suma la
  campanita (alertas de plantel); hay recorrido del **Fixture**; «explicar al tocar» también explica la campana.
- **Al terminar Scouting** (el momento «aha») se ofrece «Agendar demo por WhatsApp»: ahí y solo ahí la guía vende algo.
- Un paso cuyo objetivo no está se saltea en el acto (solo se espera si el paso preparó la pantalla).

### Lo que queda abierto
- **Medición** (UTM y eventos), que es lo primero del resumen estratégico.
- **La demo muestra el scouting completo** (anonimizado). Decisión de producto: lo escaso no es el informe sino tenerlo con
  los datos de tu equipo, cargados solos; por eso el CTA va justo después del PDF. Si el club prefiere bloquear parte, hay que
  decidir qué.
- Los números de las métricas siguen siendo reales: quien conozca la Conferencia Norte 25/26 podría reconocer un equipo por
  sus métricas. Perturbarlos quitaría realismo; es una decisión del club.

---

## 179. LOS PASES DE CORTESÍA · una muestra con datos reales sin dar de alta un cliente (2026-11-14)

Assets en `?v=383`. `test-cortesias.js` (99) fija todo. **Fase 1**: motor, Panel Master, token, guard y la muestra.

```
server/lib/cortesias.js     PURO + KV: armar, estado, canje, mensaje de WhatsApp, lista blanca de rutas
server/rutas/cortesias.js   el guard central y las rutas (admin y puerta)
js/sgadd-cortesia.js        la puerta del pase, la barra, los rivales de muestra y el bloque del Panel Master
```

- **KV propio, `sgadd:cortesias`** (un campo por pase). No toca `sgadd:catalogo` ni `sgadd:clientes`; hay test que cuenta las escrituras.
- **Un pase es una ZONA de torneo + UN equipo + N días**, Plan PLATA en estado `prueba`, con el play-by-play de su equipo
  (decisión del club). Sirve para temporada vigente o anterior: es la zona que se elija. Se valida contra el catálogo:
  torneo `tipo: 'torneo'`, zona regular con libro, equipo de la zona, 1 a 60 días, nombre y WhatsApp obligatorios.
- **Del código se guarda la huella** (sha256): para reenviar el link se REGENERA y el viejo deja de servir.
- **Vence a las 23:59 de Argentina del día N** (hoy = día 0). Los días se cuentan por calendario, igual en server y panel.
- **El token**: `CLIENTE + PLATA` con `cortesia: <id>`, `club` = el torneo, `categoria` = la zona, el equipo del pase,
  **mail sintético** `pase.<id>@cortesia.motorstats.ar` (el rol sale del mail: un mail de admin abriría todo) y dura como
  mucho 72 h (el mismo link lo renueva). `verificarToken` rechaza un token de cortesía con rol de admin.
- **EL GUARD CENTRAL** (`app.use(cortesias.guard)` antes de TODAS las rutas): con un token de cortesía relee el pase en KV
  en cada pedido (revocar corta ya; KV caído = 503, no se abre), exige que token y pase coincidan y deja pasar solo la
  **lista blanca** (`C.rutaPermitida`): `GET` catálogo, `equipos/<torneo>?categoria=<zona>` (sin `equipo` ajeno),
  `pbp/<torneo>/<zona>` (índice o SU equipo), `fixture/<torneo>`, `torneos/<torneo>/llave`. Una ruta nueva entra cerrada:
  el test recorre las rutas registradas en la app. **Defensa en profundidad**: `contexto()` de handlers.js y `pbp.js` no
  atienden un token de cortesía que no pasó por el guard.
- **Lo que ve**: `catalogo.publicoCortesia` manda UN club (el torneo, presentado como `tipo: 'cliente'` con el equipo del
  pase como propio) y UNA categoría. `/equipos` lo trata como categoría PLATA en prueba: `Base Datos J` recortada a SU
  equipo como a cualquier cliente; promedios, tabla y rankings de liga completos (decisión del club). `alcance.cortesia`.
  Estados compartidos apagados (`estadosCompartibles`): lo que marque queda en su navegador.
- **Scouting híbrido**: el equipo del pase con sus datos reales contra **rivales de muestra** (A, B y C: el primero, uno
  del medio y el último del snapshot de la demo, ya público), injertados en la copia del índice del Scouting y medidos
  contra su liga («Liga de muestra»). El selector solo ofrece al propio y a esos tres; un rival de la liga puesto por el
  hash se suelta. El play-by-play de un rival de muestra no existe (el guard da 403 y la card queda vacía).
- **La puerta**: `?club=<torneo>&pase=<código>`. `sgadd-club.js` saca el código de la barra y lo guarda en sessionStorage;
  `puertaDeIngreso()` abre aunque haya otra sesión. Formulario: nombre, WhatsApp (obligatorio; se muestra la pista
  «termina en 0000», nunca el número), mail opcional, rol. Mismo WhatsApp = mismo contacto; hasta **3 contactos distintos**
  por pase (cada reenvío es un lead anotado). Al canjear recarga en `#principal`.
- **La barra**: «🎟 Muestra de cortesía · <equipo> · te quedan N días» + «Reservar tu licencia» (wa.me de MotorStats con
  el mensaje prearmado). No se imprime.
- **Panel Master · «🎟 Pases de cortesía»** (plegado, `#hubCortesias`): torneo → zona → equipo, vigencia 3/5/7/10/15 o
  días personalizados, DT con WhatsApp obligatorio, nota, play-by-play. Crear/Reenviar/Extender/Revocar pasan por el modal
  de confirmación. Al crear: link (solo esa vez), mensaje con la voz de los mails de alta y **«Enviar por WhatsApp»**
  (`wa.me/<DT>?text=…`). La lista muestra estado, días, contactos e ingresos. Revocar no borra: el registro es el lead.

### El play-by-play del pase (v384)
El guard ya dejaba pasar `pbp/<torneo>/<zona>` del equipo propio; el bloqueo era del PANEL: `leerPbp` preguntaba
`estadosCompartibles()`, que es `false` para un pase. Ahora pregunta `SGADD_DATA.conSesion()` (backend + token).

### Fase 2 (v385) · demanda entrante, telemetría, cierre y firma
- **Solicitudes de demo** (`sgadd:cortesias:solicitudes`, un campo por solicitud): el modal «Agendar demo con mis datos»
  pide WhatsApp (10+ dígitos, obligatorio) y liga (opcional) y, DESPUÉS del `window.open` de WhatsApp y sin esperarla,
  hace `POST /api/v1/pase/solicitar` (sin token). Mismo WhatsApp pendiente = la misma solicitud (`veces`++); tope de 300
  pendientes (429); la respuesta no devuelve el id. Motivo `demo` / `plan` / `servicio`.
- **Aprobar en un clic** (Panel Master → Pases de cortesía → Solicitudes): `sugerirEquipo` propone el equipo del catálogo
  por palabras del club (filtrado por la liga; con empate no propone). «Aprobar» prellena el formulario y abre la
  confirmación; la acción `aprobar` emite el pase con `origen: 'solicitud'` y `solicitudId` y marca la solicitud
  `aprobada`. «Descartar» la marca `descartada`. Nada se borra.
- **Telemetría** (`sgadd:cortesias:actividad`): `SGADD_CORTESIA.registrar('ingreso' | 'vista' | 'export')`. Un ingreso
  por sesión, una vista por sección por sesión (sessionStorage), cada export cuenta; lote cada 1,5 s a
  `POST /api/v1/pase/actividad`, que es la ÚNICA escritura que el guard le permite a un pase. Columna «Actividad» en el
  Panel Master. El log local (`sgadd.paseLog.<id>`) alimenta el cierre.
- **«Tu muestra terminó»** (`terminar`): no se cierra; resume lo explorado y ofrece «Reservar tu licencia por WhatsApp» y
  «Volver al inicio». Sale si el pase venció al entrar, si vence con la pestaña abierta (mirada cada 5 min) o si el
  servidor contesta `CORTESIA_VENCIDO | REVOCADO | CONVERTIDO | INEXISTENTE` en cualquier pedido.
- **Firma en los PDF**: `encabezadoInforme` antepone «Muestra de cortesía · MotorStats AR · vence DD/MM/AAAA»
  (`firmaPdf`) en cada hoja de las exportaciones con tabla firmada.
- Verificado en el navegador contra la API local (KV de cortesías en memoria, catálogo y libros reales): canje → barra,
  PBP de Boca, telemetría en el endpoint de admin, firma en el encabezado y la pantalla de cierre. **No verificado en un
  PDF real.**

### Fase 3 (v386) · convertir en cliente y el aviso del día −2
- **«Convertir en cliente»** en cada fila de la lista de pases (Panel Master). Abre un panel debajo de la lista,
  precargado desde el pase: plan (PLATA por defecto, se puede elegir BRONCE u ORO), **mail del DT obligatorio** (el
  del alta del pase o el último que dejó al canjear; si no hay, se escribe ahí y el botón queda apagado hasta tenerlo),
  id del club (`C.idClubSugerido`: el equipo sin sufijo, sin acentos) y su nombre. Si el id ya es un cliente, lo dice:
  el alta le SUMA la categoría. Tipear no repinta. Confirmar pasa por `SGADD_CONFIRMAR` con el diff.
- **Acción `convertir`** (`server/rutas/cortesias.js`, solo ADMIN), con el alta de siempre y en este orden:
  1. catálogo: `mutar.aplicar('alta')` sobre `cargarParaEscribir`, con `libroDe = <torneo>/<zona del pase>` (la
     categoría lee ese libro y queda enganchada a esa zona), el equipo del pase como propio y el plan. Categoría
     `<club>-<zona>`. Se rechaza un id que es un torneo o una categoría que ya existe;
  2. la ficha (contacto, mail, fecha de alta, mensual);
  3. el acceso con `invitacion.asegurar` (el cupo y un mail por club, como «Quiénes pueden entrar»);
  4. la bienvenida institucional con el código adentro (`cron.enviarBienvenida`);
  5. el pase queda `convertido` con `{fecha, club, categoria, plan, email, por, bienvenida}`. Su token deja de abrir la
     muestra (`CORTESIA_CONVERTIDO` → el cierre dice «Ingresar»).
  Es la ÚNICA acción de cortesías que escribe `sgadd:catalogo` y `sgadd:clientes`. Si el catálogo falla no se toca
  nada más; si el mail falla, el alta queda y la pantalla lo dice (con el código de respaldo).
  **El catálogo se escribe con el kv del módulo**, el mismo con que lo lee `cargarParaEscribir`; `deps.kv` es el de
  los hashes.
- **El aviso del día −2** (`avisosCortesia` en `cron-vencimientos.js`, dentro de `ejecutar`, con su propio try: un
  problema con los pases no frena los recordatorios de los clientes). `C.planificarAvisosD2` (PURO): activo, a 2 días de
  calendario de Argentina, con mail, y sin `avisoD2` para ESE vencimiento. Dos guardas contra el duplicado: el reclamo
  atómico en `sgadd:notificaciones` (`cortesia|<id>|d2@<vence>`) y la marca `avisoD2` en el pase, escrita sobre el pase
  recién leído. Las dos llevan el vencimiento: extender lo rearma. Si el mail falla se libera el reclamo.
  Plantilla `recordatorioCortesia` (mail-plantillas): no habla de planes ni de renovación; invita a activar la
  licencia por WhatsApp y dice que la muestra se cierra sola. `marco()` acepta `pie`.
- Tests: `test-cortesias.js` sección 8 bis y el final de la 10 (182 en total). Verificado en el navegador contra el
  catálogo real con las escrituras en memoria y el mail sin salir: el pase sin mail pide el mail, avisa el club
  existente, el modal enumera el alta, y después la fila dice «→ club / categoría» y «bienvenida enviada».

### Para producción
1. Deploy del backend (`cd server && npx vercel --prod`): sin él, el link del pase dice «no válido» y no existen
   `/api/v1/pase/solicitar`, `/api/v1/pase/actividad` ni las acciones `aprobar`, `descartar` y `convertir`.
2. Push del front (`?v=386`).
3. El aviso del día −2 corre con el cron de vencimientos (09:00 AR); sin `SMTP_PASS` no sale nada.

---

## 180. LA MEDICIÓN DESPUÉS DEL CLIC · UTM Y CUATRO EVENTOS (2026-11-17)

Assets en `?v=387`. `test-medicion.js` (24) fija todo. Instagram dice quién tocó el enlace; esto dice qué pasó después.

```
js/sgadd-medicion.js         carga ANTES que sgadd-club.js: lee los UTM, manda los eventos
server/lib/medicion.js       PURO + KV: limpieza, contadores por día, el embudo
server/rutas/medicion.js     POST /api/v1/medicion (público) · GET /api/v1/medicion (ADMIN)
```

- **Los cuatro eventos**, cada uno UNA vez por visita (sessionStorage `sgadd.medicion.enviados`): `landing` y `demo_abierta` salen solos al arrancar (`CLUB.esLanding()` / `CLUB.enDemo()`), `tour_fin` desde `terminar()` de `sgadd-tour.js` y `pedido_demo` desde el envío del modal de `sgadd-demo.js` (la barra de la demo y las cards de planes), después del `window.open`.
- **Los UTM de la primera página de la visita mandan** (`sgadd.utm`); una visita sin UTM queda «(directo)». `utm_source`, `utm_medium`, `utm_campaign` y `utm_content`. Van en la búsqueda, así que **sobreviven al cambio de dominio** (motorstats.ar). `demo/index.html` ahora pasa la búsqueda a la app: antes el puente los perdía.
- **Solo contadores, sin datos personales**: un hash por día de Argentina (`sgadd:medicion:AAAA-MM-DD`), un campo por «evento|source|medium|campaign|content», HINCRBY. Ni IP, ni navegador, ni identificador, ni cookies. Con «No rastrear» o Global Privacy Control del navegador no se manda nada.
- **Vocabulario cerrado y UTM limpios** ([a-z0-9_-], 40 caracteres, sin tildes; hasta 10 eventos por pedido): lo que viaja en la URL lo escribe cualquiera.
- **sendBeacon con `text/plain`** (un tipo simple: sin preflight de CORS) y fetch `keepalive` de respaldo; `app.js` suma `express.text` para esa ruta y el handler parsea el texto. Sobrevive a que la página se vaya a WhatsApp.
- **El POST es público** como el login: lo cuida el limitador general. Un token de cortesía no pasa (el guard del punto 179 no lo tiene en la lista blanca y el navegador no lo manda).
- **La lectura es de ADMIN**: `GET /api/v1/medicion?desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (por defecto, los últimos 30 días; tope 92) devuelve totales, conversión (landing→demo, demo→recorrido, demo→pedido; `null` sin denominador), por día y por pieza (campaña · contenido), ordenado por pedidos.
- **Etiquetado de las piezas**: `?utm_source=instagram&utm_medium=<formato>&utm_campaign=<serie>&utm_content=<pieza>` en el link de la bio.

### Lo que no hace
- **No hay pantalla todavía**: el embudo se lee por la API. Una card en el Panel Master es el paso siguiente.
- No atribuye un pedido de demo a una persona ni sigue a nadie entre visitas: es a propósito.
- `test-ciclos.js` falla también sin este cambio: depende del paquete local de LAB Norte de la ingesta, que suma partidos nuevos.

### Para producción
1. Deploy del backend (`cd server && npx vercel --prod`): sin él, el POST da 404 y el panel lo ignora en silencio.
2. Push del front (`?v=387`).
3. Cambiar el link de la bio por uno con UTM.

---

