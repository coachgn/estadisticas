# Arquitectura del backend · SGADD

> **Estado: verificado contra Google y cableado al frontend. SIN mergear.**
> Vive en
> `server/` y en la rama `poc/backend`. La app de producción sigue siendo
> el sitio estático de GitHub Pages con el gate de interfaz del punto 19 de
> [`CLAUDE.md`](../CLAUDE.md). Nada de esto está en `main` todavía.

Este documento existe para que una sesión futura de Claude Code —o
cualquiera que agarre el proyecto— no tenga que reconstruir el porqué.

---

## 1. Qué problema resuelve, exactamente

El punto 19 implementó roles y planes **en el navegador**. Eso sirve para
el producto (cada club abre su link y ve lo suyo) pero **no es seguridad**,
y el módulo lo dice con todas las letras:

- los `sheetId` viven en `clubes/<club>.json`, que es un archivo **público**:
  cualquiera lo abre y lee la planilla entera por GViz sin pasar por el panel;
- todo el gate corre en el navegador del usuario: con la consola abierta se
  pone `plan: "PRO"`.

El backend cierra eso moviendo **tres cosas** del navegador al servidor:

| | Hoy (estático) | Con backend |
|---|---|---|
| **El `sheetId`** | en un JSON público | solo en el servidor, nunca viaja al cliente |
| **El acceso a la planilla** | GViz anónimo, planilla pública | Service Account, planilla privada |
| **La decisión de qué ve cada uno** | en el navegador | en el servidor, antes de responder |

Y agrega una cuarta: **el rol deja de ser un parámetro editable de la URL**
(`?plan=PRO`) y pasa a ser un claim de un token firmado.

---

## 2. Stack elegido, y por qué no hubo que elegir

La preferencia global es **Express** para backends, y **funciones
serverless de Vercel** cuando el proyecto es liviano o va a Vercel. Acá los
dos criterios apuntaban a lados distintos: el proyecto es livianísimo y el
frontend ya es estático (encaja con serverless), pero el pedido nombra
Express primero.

**No se eligió: se escribió para los dos.** La lógica vive en handlers
puros que no saben de HTTP:

```
manejarEquipos({ token, clubId, categoria, equipo })  →  { status, body }
```

Express y Vercel son dos envoltorios de treinta líneas sobre lo mismo:

```
server/app.js        →  Express (CORS, rate limit, rutas)  →  handlers
server/api/index.js  →  export default para Vercel          →  handlers
```

Eso además es lo que hace que los tests corran **sin instalar nada**: la
suite llama a los handlers directo, sin levantar un servidor. Es la misma
decisión que ya toma el frontend al separar motor puro de UI
(`sgadd-config.js` / `sgadd-configui.js`).

---

## 3. LAS REGLAS DE NEGOCIO NO SE REESCRIBEN

La decisión más importante de todo esto.

`js/sgadd-auth.js` es un **módulo puro** y ya es requerible desde Node. El
servidor lo **importa**, no lo reimplementa:

```js
const AUTH = require('../js/sgadd-auth.js');   // el MISMO módulo que el navegador
```

Si el servidor tuviera su propia copia de la matriz de secciones, de la
cascada de planes o de la comparación de equipos, las dos versiones
divergirían y **la divergencia sería silenciosa**: el navegador mostraría
una cosa y el servidor otra. Este proyecto ya se comió ese bug tres veces
—el `sheetId` en dos lados resucitando un id muerto, el rol funcional en
dos módulos dando etiquetas distintas, el Diagnóstico armando su índice sin
torneo— y está documentado en el punto 15 de `CLAUDE.md`.

Lo que cambia no son las reglas: es **quién las hace cumplir**.

```
navegador  →  usa las reglas para NO MOSTRAR lo que no corresponde  (UX)
servidor   →  usa las MISMAS reglas para NO ENVIAR lo que no corresponde  (seguridad)
```

El navegador sigue teniendo su gate y eso está bien: sin él, el cliente
vería botones que llevan a un 403.

---

## 4. Estructura

```
server/
  package.json          2 dependencias: express y cors. La cripto es `node:crypto`
  .env.example          qué variables hay que configurar (sin valores)
  README.md             instructivo de la Service Account, paso a paso
  lib/
    config.js           lee el entorno · catálogo slug → sheetId (SERVER-ONLY)
    google-sheets.js    Service Account → Sheets API v4 · caché en memoria
    jwt.js              HS256/RS256 con `node:crypto`, sin dependencias
    auth.js             firmar y verificar tokens · generarLinkCliente()
    reglas.js           el filtrado server-side, sobre js/sgadd-auth.js
  api/
    handlers.js         los handlers puros, sin HTTP
    index.js            envoltorio serverless (Vercel)
  app.js                envoltorio Express (CORS, rate limit, rutas)
  index.js              arranque local
  bin/generar-link.js   CLI del paso C
  bin/probar-google.js  la lectura real contra la planilla privada
  bin/servidor-de-prueba.js  el mismo servidor con un Google de mentira
js/sgadd-data.js        el cliente: backend o GViz, y los adaptadores
test-backend.js         la suite, corre sin instalar dependencias
```

El **catálogo de `sheetId` se muda a `server/lib/config.js`** y sale de
`clubes/*.json`. Ese es el punto entero: el frontend pasa a conocer solo
*slugs* (`deportivo` / `deportivo-primera-2026`).

---

## 5. El flujo, de punta a punta

```
1. Admin corre  node server/bin/generar-link.js --email dt@club.com …
   → token HS256 firmado con JWT_SECRET, con {email, club, equipo, plan, exp}

2. El DT abre  https://panel/?access_token=eyJhbG…
   El frontend lo guarda y LO SACA DE LA URL (ver 7.2)

3. El frontend pide  GET /api/v1/equipos/deportivo?categoria=…
   con  Authorization: Bearer <token>

4. El servidor:
   a. verifica la firma y la expiración
   b. RE-DERIVA si es admin contra su propia lista (no confía en el claim)
   c. resuelve slug → sheetId, que nunca sale de acá
   d. pide los datos a Google con la Service Account
   e. APLICA LAS REGLAS y recorta el payload
   f. responde solo lo autorizado
```

---

## 6. Decisiones que hay que respetar al tocarlo

### 6.1 · El claim de admin se RE-DERIVA, no se confía

El token está firmado por nosotros, así que sus claims son confiables. Aun
así, `esAdmin` se recalcula en cada request contra la lista del servidor.

El motivo: **sacar a alguien de la lista de admins tiene que surtir efecto
ya**, no cuando venza su token. Un token de 30 días con `admin: true`
adentro es una llave que no se puede revocar.

### 6.2 · La expiración es obligatoria y corta por defecto

`generarLinkCliente()` exige `expiraEn` y el default son **7 días**. Un
token sin `exp` es una credencial permanente circulando por WhatsApp.

### 6.3 · CORS es una lista de permitidos, nunca `*`

`ORIGENES_PERMITIDOS` en el entorno. Con `*` cualquier página podría
hacer que el navegador de un cliente pida sus datos.

### 6.4 · El rate limit del PoC NO sirve en serverless

Es un contador **en memoria del proceso**. En Express funciona; en Vercel
cada invocación puede caer en una instancia distinta, así que el límite
real termina siendo *(límite × instancias)*. Está anotado en el código.
Para producción va Upstash/Redis, o el rate limiting del propio Vercel.

### 6.5 · El `sheetId` no puede aparecer en NINGUNA respuesta

Hay un test que recorre el JSON de todas las respuestas y falla si
encuentra un id de planilla. Es el objetivo entero del backend: si se
filtra por un campo de debug, no queda nada.

### 6.6 · La clave privada trae `\n` literales

`GOOGLE_PRIVATE_KEY` en un `.env` viene con `\n` de dos caracteres. Hay que
convertirlos a saltos reales antes de firmar o la firma falla con un error
que no dice nada. Es el error nº1 de las Service Accounts.

---

## 7. Lo que este PoC NO resuelve

Honestidad sobre el alcance, para no darlo por cerrado.

### 7.1 · Qué se probó y qué NO

**Probado contra Google, con la Service Account real:** `probar-google.js`
leyó **9/9 hojas y 157.628 celdas** de la planilla PRIVADA de Deportivo La
Plata. O sea que están ejercidos la firma RS256, el intercambio OAuth2 y
la lectura por Sheets API v4.

**Probado sobre el servidor corriendo:** `401` sin token, `403` con su
código para cada caso, CORS aceptando el origen de la lista y rechazando
el resto, y el rate limit cortando en el cupo (52 × `200` y 13 × `429`
sobre 65 peticiones).

**Probado con el panel entero contra la API** (`servidor-de-prueba.js`,
que es el mismo `crearApp()` con un `fetch` de mentira): el token se lee
del link y **se borra de la URL**, queda en `sessionStorage`, el origen
pasa a `backend`, y las cinco secciones renderizan **sin un solo error de
JavaScript**. Con Plan Básico llegan 1 equipo y 1 jugador —el recorte del
servidor— más los 3 equipos de la tabla de posiciones, que va completa a
propósito. Scouting devuelve la card del Plan Pro.

**NO probado:** el panel contra el backend con la planilla REAL y
desplegado. Eso es el corte del punto 11, y ahí entran las 157.628 celdas
de verdad — un libro de ese tamaño puede destapar cosas que un fixture de
cuatro filas no muestra (tiempos de respuesta, tamaño del payload).
### 7.2 · Un token en la URL se filtra

`?access_token=…` queda en el historial del navegador, en el `Referer` de
cualquier recurso externo y en los logs de cualquier proxy. Es el formato
que se pidió y es cómodo para repartir por WhatsApp, pero el frontend
**tiene que sacarlo de la URL apenas lo lee** (`history.replaceState`) y
guardarlo en `sessionStorage`. Eso todavía no está escrito: es parte de la
migración del frontend.

Alternativa más segura para más adelante: el link lleva un código de un
solo uso que se canjea por el token en una llamada POST.

### 7.3 · No hay revocación individual

Un token comprometido se invalida rotando `JWT_SECRET`, que **invalida a
todos**. Revocar de a uno necesita una lista de revocados en algún lado, o
sea estado persistente.

### 7.4 · El filtrado es por sección, no por celda

El PoC recorta bloques enteros (scouting, ficha de un equipo ajeno). No
recorta columnas dentro de una hoja. Alcanza para lo que separa Básico de
Pro hoy.

---

## 8. Cómo se corre

```bash
cd server && npm install     # solo para levantar el servidor
cp .env.example .env         # y completar
npm start                    # Express en :3000

node test-backend.js         # la suite, desde la raíz, SIN instalar nada
node server/bin/probar-google.js       # lectura real contra Google
node server/bin/generar-link.js --help # generar un link de cliente
```

---

## 9. Los endpoints

Todos piden token en `Authorization: Bearer <token>`. `?access_token=` se
acepta solo para el primer ingreso por link — el frontend lo saca de la
URL apenas lo lee (ver 7.2).

### `GET /api/v1/salud`

Sin token. Para health checks.

```json
{ "ok": true, "servicio": "sgadd-api" }
```

### `GET /api/v1/catalogo`

Qué clubes y categorías existen. **Sin un solo `sheetId`** — es lo que
reemplaza a leer `clubes/*.json` para saber qué hay.

```json
{
  "ok": true,
  "usuario": { "email": "dt@club.com", "rol": "CLIENTE", "plan": "PRO",
               "equipoAsignado": "DEPORTIVO LA PLATA",
               "expiraEn": "2026-09-27T12:00:00.000Z" },
  "clubes": [{
    "id": "deportivo", "nombre": "Deportivo La Plata", "liga": "la-plata",
    "categorias": [{ "slug": "deportivo-primera", "label": "Primera 2026", "activo": true }]
  }]
}
```

`activo` reemplaza al `sheetId` como señal de *"esta categoría ya tiene
libro"*: dice lo mismo sin revelar cuál.

### `GET /api/v1/equipos/:clubId?categoria=<slug>&equipo=<EQUIPO>`

El libro, **ya recortado**. Con `?equipo=` valida además que sea uno que
la sesión puede analizar.

```json
{
  "ok": true,
  "club": "deportivo", "categoria": "deportivo-primera",
  "label": "Primera 2026", "liga": "la-plata",
  "alcance": {
    "rol": "CLIENTE", "plan": "BASICO", "equipoAsignado": "DEPORTIVO LA PLATA",
    "hojasRecortadas": ["PROMEDIOS E", "PROMEDIOS J", "…"],
    "hojasCompletas":  ["Base Datos E", "4 FACTORES"]
  },
  "faltantes": [], "leidoEn": "2026-08-28T13:05:00.000Z",
  "hojas":      { "PROMEDIOS E": [["EQUIPO","PTS"], ["…", 75.6]] },
  "hojasTexto": { "PROMEDIOS E": [["EQUIPO","PTS"], ["…", "75,6"]] }
}
```

**`alcance` no es decorativo.** Un panel que recibe menos filas sin saberlo
calcularía percentiles sobre una liga fantasma, y el DT tiene derecho a
saber que está viendo un recorte.

**`hojasTexto` son las mismas hojas con el texto que arma Sheets**, para la
capa vieja de Principal. Van las cuatro que esa capa usa, no las nueve.

### `GET /api/v1/scouting/:clubId?categoria=&local=&visitante=`

El informe pre-partido. Plan Pro, y solo cruces donde juega su equipo.

### Los códigos

| | Cuándo | Qué hacer |
|---|---|---|
| `401 SIN_TOKEN` | no vino token | pedir el link |
| `401 VENCIDO` | el token expiró | pedir uno nuevo |
| `401 FIRMA_INVALIDA` | firma o payload manipulados | nada: no es un error del usuario |
| `403 OTRO_EQUIPO` | pidió un equipo que no es el suyo | la tabla y los rankings sí están |
| `403 REQUIERE_PLAN` | Básico pidiendo scouting | ofrecer el Plan Pro |
| `403 CRUCE_AJENO` | Pro armando un cruce sin su equipo | corregir el cruce |
| `403 OTRO_CLUB` | token de un club pidiendo otro libro | nada |
| `404 SIN_CATEGORIA` | slug que no existe | revisar el catálogo del servidor |
| `429` | rate limit | reintentar en un minuto |
| `502` | Google no respondió, o la planilla no está compartida | revisar la Service Account |

---

## 10. El frontend, después del desacople

### 10.1 · Los `clubes/*.json` ya no traen el id

```diff
- "sheetId": "1Zi2cBd0…",   ← 44 caracteres, el id real del libro
+ "slug": "reconquista-primera",
```

El `slug` es **opaco**: no sirve para nada sin el servidor. Y **no se
reusó el `id` de la planilla** a propósito: ese es la clave de los estados
de jugador en `localStorage` y viaja en cada link que el cuerpo técnico
compartió (punto 6 de `CLAUDE.md`), así que atarlo al identificador de la
API haría que rotar uno rompa lo otro.

El mismo cambio va en el catálogo de respaldo de `sgadd-core.js`, que era
la **segunda** fuente pública de los ids.

> **Un hallazgo del camino:** el JSON de la U21 de Reconquista traía
> `1CD7FEDc…`, el id muerto que el punto 3 ter da por corregido —el bueno,
> `1wNpSkd…`, estaba solo en el respaldo de `sgadd-core.js`—. Es
> exactamente el bug de las dos fuentes que el punto 6 documenta, y la
> migración a slugs lo cierra de raíz: ahora hay un solo lugar. **Al
> completar el `.env` va el bueno.**

### 10.2 · `js/sgadd-data.js` decide de dónde salen los datos

Un solo módulo, tres modos:

```
backend   hay token Y hay API configurada  → planillas privadas
gviz      la planilla trae `sheetId`       → legacy de la transición
ninguno   ni una cosa ni la otra           → se avisa, no se rompe
```

**El modo `gviz` está condenado.** Cuando los JSON dejaron de traer
`sheetId` quedó sin combustible: solo se activa con una config local. Se
conserva mientras dure el corte y después **se borra entero** — no se deja
"por las dudas", porque una vía alternativa a los datos privados es
exactamente el agujero que el backend vino a cerrar.

**El backend gana sobre GViz** aunque una planilla traiga `sheetId`. Si
fuera al revés, una config vieja seguiría leyendo la planilla pública por
la espalda.

### 10.3 · Las dos formas del dato siguen siendo dos

El panel tiene dos capas (punto 3 de `CLAUDE.md`) y **no se unificaron**:

```
índice     {cols, filas:[{COLUMNA: valor}]}    valores CRUDOS
Principal  {cols, rows:[{values, formatted}]}  con el TEXTO de Sheets
```

Reproducir el `formatted` del lado del cliente da **40% de precisión sobre
157.278 celdas**. Así que no se reproduce: el servidor manda la segunda
vista y `matrizALegacy()` la usa tal cual. Sin ella, `formatted` cae al
valor crudo — que es EXACTAMENTE lo que hacía GViz con una celda sin `f`.

Medido en el navegador contra el servidor: `crudo 0.48` / `texto "48,00%"`.

### 10.4 · El token, en el navegador

```
1. el DT abre  ?access_token=eyJ…
2. `cargarSesion()` lo lee, lo mete en `sessionStorage` y LO SACA DE LA URL
3. cada petición lo manda en el header `Authorization`
```

**Se saca de la URL** porque ahí queda en el historial, en el `Referer` de
cualquier recurso externo y en los logs de todo proxy. **El hash se
conserva**: es la ruta de la app, y perderlo mandaría al DT a la pantalla
de inicio cada vez que abre un link compartido.

**`sessionStorage` y no `localStorage`**: es una credencial, no una
preferencia. En una computadora compartida —la del club, la del profe— la
diferencia entre las dos es quién puede seguir mirando mañana.

**El frontend DECODIFICA el token sin verificarlo, y está bien.** La firma
se verifica con `JWT_SECRET`, que el navegador no tiene ni puede tener. Lo
decodificado sirve para UNA cosa: pintar la interfaz que corresponde antes
de que llegue la primera respuesta. Hay un test que lo dice sin vueltas:
un token con el payload editado **sí** engaña al lector del frontend, y el
servidor lo rechaza con 401 sin entregar un solo dato.

Por eso el gate del punto 19 sigue existiendo: sin él, el cliente vería
botones que llevan a un 403.

---

## 11. EL CORTE · lo que hay que hacer, en este orden

**Mergear esto a `main` sin haber hecho los pasos 1 a 3 deja a los tres
clubes sin panel.** No es una precaución: el `sheetId` salió de los
archivos públicos, así que sin backend desplegado y sin tokens repartidos
no hay de dónde sacar los datos.

```
1. DESPLEGAR el backend            → queda una URL
2. CONFIGURAR el `.env` en Vercel  → los 5 sheetId, el JWT_SECRET, los orígenes
3. EMITIR los tokens               → uno por club, con su equipo y su plan
4. APUNTAR el panel a la API       → `window.SGADD_API` en el index.html
5. MERGEAR y publicar `?v=140`
6. RECIÉN AHÍ: sacar el acceso público de las planillas
```

El paso 6 va **último** y no primero: mientras el panel viejo siga vivo en
`main`, lee por GViz y necesita que las planillas sean públicas. Al revés
se rompe el panel en el medio de la ventana.

### Verificar antes de cada paso

```bash
node server/bin/probar-google.js       # las 9 hojas contra la planilla privada
node test-backend.js                   # 152 checks, sin instalar nada
node server/bin/servidor-de-prueba.js  # el panel entero contra la API, sin credenciales
```

### La vuelta atrás

`git revert` del merge y las planillas siguen siendo públicas: el panel
vuelve a GViz. **Por eso el paso 6 es el último** — es el único
irreversible en el corto plazo, porque volver a hacer públicas las
planillas es una decisión de datos del club.

