# Arquitectura del backend · SGADD

> **Estado: PoC funcionando, SIN probar contra Google todavía.** Vive en
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

Sé exacto acá, porque la diferencia importa antes de migrar nada.

**Probado, y medido:**

- los handlers de punta a punta con un `fetch` de mentira: 95 checks en
  `test-backend.js`, incluidos los ataques de JWT (`alg:none`, confusión
  RS256/HS256, payload manipulado, token vencido);
- el servidor Express **corriendo de verdad**: `401` sin token, `403` con
  su código para cada caso, CORS aceptando el origen de la lista y
  rechazando el resto con `403 ORIGEN`, y el rate limit cortando en el
  cupo (52 × `200` y 13 × `429` sobre 65 peticiones);
- la firma **RS256 con una clave RSA real** generada al vuelo, que es la
  única parte de la cadena con Google que se puede ejercer sin red;
- la conversión de los `
` del `.env`, con el error reproducido: con
  saltos reales el archivo se corta en la primera línea y la firma
  revienta con `ERR_OSSL_UNSUPPORTED`.

**NO probado todavía, y hace falta la Service Account del cliente:**

- el intercambio OAuth2 real contra `oauth2.googleapis.com`;
- la lectura real de una planilla privada por Sheets API v4;
- el panel entero contra el backend — la app sigue leyendo por GViz.

Lo primero y lo segundo se cierran en un minuto, con las credenciales
puestas en `server/.env`:

```bash
node server/bin/probar-google.js
```

Tiene que listar las 9 hojas con su cantidad de filas. Hasta que eso dé
verde, **este PoC no está probado contra Google** y no se puede planificar
la migración sobre él.

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
