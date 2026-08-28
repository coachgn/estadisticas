# SGADD · API (PoC)

Proxy entre el panel y Google Sheets. Oculta los `sheetId`, lee planillas
**privadas** con una Service Account y aplica los permisos **antes de
responder**.

El porqué de cada decisión está en
[`docs/ARQUITECTURA-BACKEND.md`](../docs/ARQUITECTURA-BACKEND.md).

---

## Crear la Service Account · paso a paso

Lleva unos diez minutos y se hace una sola vez.

### 1 · Proyecto y API

1. Entrar a [console.cloud.google.com](https://console.cloud.google.com/).
2. Crear un proyecto (o elegir uno). Nombre sugerido: **SGADD**.
3. **APIs y servicios → Biblioteca** → buscar **Google Sheets API** →
   **Habilitar**.

> Si este paso se saltea, la autenticación funciona y la lectura falla con
> un 403 que habla de "API not enabled" — se confunde fácil con un problema
> de permisos de la planilla.

### 2 · La cuenta

1. **APIs y servicios → Credenciales → Crear credenciales → Cuenta de servicio**.
2. Nombre: `sgadd-lector`. La descripción ayuda al que la encuentre en dos
   años: *"Lee las planillas de MotorStats para el panel SGADD"*.
3. **No hace falta asignarle ningún rol de IAM.** Los roles de Google Cloud
   controlan recursos del proyecto; el acceso a una planilla se da
   compartiéndola, como con cualquier persona. Un rol de más acá es
   superficie que no hace falta.

### 3 · La clave

1. Entrar a la cuenta recién creada → pestaña **Claves** → **Agregar clave
   → Crear clave nueva → JSON**.
2. Se descarga un `.json`. **Ese archivo es la credencial completa**: quien
   lo tenga puede leer todo lo que la cuenta pueda leer. No va al repo, no
   va por mail, no va a un chat de grupo.
3. Del JSON salen las dos variables:

   | Del JSON | A `.env` |
   |---|---|
   | `client_email` | `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
   | `private_key` | `GOOGLE_PRIVATE_KEY` |

   **`private_key` se copia ENTERA y entre comillas dobles, con los `\n`
   tal cual vienen.** Si se pegan saltos de línea reales, el `.env` se
   corta en la primera línea y la firma falla con un error de OpenSSL que
   no menciona el problema. Es el error número uno de las Service Accounts.

### 4 · Compartir las planillas

Para **cada** planilla (una por categoría):

1. Abrirla en Google Sheets → **Compartir**.
2. Pegar el `client_email` (termina en `.iam.gserviceaccount.com`).
3. Permiso **Lector**. Destildar *"Notificar a las personas"* — es un
   robot, no le llega el mail.
4. **Y recién ahí sacarle el acceso público**: *Acceso general → Restringido*.

> Hacerlo en ese orden importa: si se saca el acceso público antes de
> compartir con la cuenta, el panel actual (que lee por GViz anónimo) deja
> de funcionar en el medio.

### 5 · Verificar

```bash
cd server && npm install
cp .env.example .env      # y completar
node bin/probar-google.js
```

Tiene que listar las 9 hojas con su cantidad de filas. Si falla, el script
dice qué mirar.

---

## Correr el servidor

```bash
cd server
npm install
npm start                 # http://localhost:3000
```

```bash
curl http://localhost:3000/api/v1/salud
```

## Generar un link de cliente

```bash
node server/bin/generar-link.js \
  --email dt@deportivo.com \
  --club deportivo \
  --equipo "DEPORTIVO LA PLATA" \
  --plan PRO \
  --expira 30d
```

**El nombre del equipo va como lo escribe la planilla**, con su letra. Se
compara con `claveEquipo()`, así que `RECONQUISTA` **no** reconoce a
`RECONQUISTA 'A'` y ese cliente se queda sin ver ningún equipo — la trampa
del punto 19 de `CLAUDE.md`.

## Los tests

```bash
node test-backend.js      # desde la RAÍZ del repo, sin instalar nada
```

Corren con un `fetch` de mentira a propósito: una suite que necesita red y
una credencial de Google no se puede correr antes de cada commit, que es
justamente cuando hace falta. La cadena real contra Google se prueba con
`bin/probar-google.js`.

---

## Endpoints

| | |
|---|---|
| `GET /api/v1/salud` | sin token |
| `GET /api/v1/catalogo` | slugs y etiquetas. **Sin un solo `sheetId`** |
| `GET /api/v1/equipos/:clubId?categoria=&equipo=` | el libro recortado, o 403 |
| `GET /api/v1/scouting/:clubId?local=&visitante=` | Plan Pro, y solo cruces propios |

El token va en `Authorization: Bearer <token>` o como `?access_token=`.

| Código | Cuándo |
|---|---|
| `401` | sin token, vencido o firma inválida |
| `403 OTRO_EQUIPO` | pidió la ficha de un equipo que no es el suyo |
| `403 REQUIERE_PLAN` | Básico pidiendo scouting |
| `403 CRUCE_AJENO` | Pro armando un cruce donde no juega su equipo |
| `403 OTRO_CLUB` | token de un club pidiendo el libro de otro |
| `429` | rate limit |
| `502` | Google no respondió o la planilla no está compartida |

---
---

## Desplegar en Vercel · paso a paso

Todo se corre desde `server/`. **Los cuatro comandos que piden credenciales
los tenés que correr vos**: son un login y tres secretos, y ninguna de las
dos cosas puede pasar por un asistente ni quedar en un historial de chat.

```bash
cd server
```

### 1 · Login

```bash
npx vercel login
```

Abre el navegador o manda un código por mail. Se hace una sola vez por
máquina.

### 2 · Vincular el proyecto

```bash
npx vercel link
```

Preguntas y qué contestar:

| | |
|---|---|
| *Set up and deploy?* | **Y** |
| *Which scope?* | tu cuenta |
| *Link to existing project?* | **N** la primera vez |
| *Project name* | `sgadd-api` |
| *In which directory is your code located?* | **`./`** — ya estás parado en `server/` |
| *Want to modify these settings?* | **N** — `vercel.json` ya trae lo que hace falta |

### 3 · Las variables

**No las pases por la línea de comandos**: quedan en el historial del
shell. `vercel env add` las lee de la entrada estándar, así que se pegan
cuando las pide o se le pasa un archivo.

```bash
npx vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL production
npx vercel env add GOOGLE_PRIVATE_KEY production
npx vercel env add SHEET_DEPORTIVO_PRIMERA production
npx vercel env add ORIGENES_PERMITIDOS production
```

Qué va en cada una:

| Variable | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON de la cuenta |
| `GOOGLE_PRIVATE_KEY` | el `private_key` **entero** |
| `SHEET_DEPORTIVO_PRIMERA` | el id del libro de Primera de DEPORTIVO |
| `ORIGENES_PERMITIDOS` | `https://coachgn.github.io` |

**La clave privada acepta las dos formas** y conviene saberlo antes de
pelearse con el panel de Vercel: con los `\n` literales tal cual salen del
JSON, o pegada con saltos de línea reales. `config.js` convierte la
primera y deja la segunda como está — hay un test que lo fija.

El `JWT_SECRET` se genera y se manda sin que aparezca en pantalla:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" | npx vercel env add JWT_SECRET production
```

**Guardalo también en tu `server/.env` local**, con el MISMO valor: es el
que firma los links de cliente, y si el que firma y el que verifica no
coinciden, todos los tokens dan `401 FIRMA_INVALIDA`. Rotarlo invalida
todos los links emitidos.

Las otras cuatro categorías (`SHEET_RECONQUISTA_PRIMERA`,
`SHEET_RECONQUISTA_U21`, `SHEET_RECONQUISTA_U23`, `SHEET_JUJUY_PRIMERA`)
van igual, cuando se conecten esos libros. **Una categoría sin su variable
aparece en el selector y su carga devuelve 404** — ruidoso a propósito,
mejor que un silencio.

### 4 · Desplegar

```bash
npx vercel --prod
```

Devuelve la URL de producción. Anotala: es la que va en el paso 5.

### 5 · Verificar, en este orden

```bash
curl https://<tu-url>/api/v1/salud
```

Tiene que dar `{"ok":true,"servicio":"sgadd-api"}`. Si da **404**, el
`vercel.json` no se subió: sin él, Vercel publica la función en `/api` a
secas y todas las rutas dan 404 con el código perfectamente bien.

```bash
curl -o /dev/null -w "%{http_code}\n" https://<tu-url>/api/v1/catalogo
```

Tiene que dar **401**: sin token, el servidor no atiende.

Y el que importa — un link real de cliente:

```bash
node bin/generar-link.js \
  --email dt@deportivo.com --club deportivo \
  --equipo "DEPORTIVO LA PLATA" --plan BASICO --expira 7d
```

```bash
curl -H "Authorization: Bearer <token>" "https://<tu-url>/api/v1/equipos/deportivo?categoria=deportivo-primera" | head -c 300
```

Con eso ya se sabe que la Service Account lee la planilla privada desde
Vercel, que es lo único que el PoC probó en tu máquina y no en el
servidor.

### 6 · Apuntar el panel

En el `index.html`, antes de los `<script src="js/…">`:

```html
<script>window.SGADD_API = 'https://<tu-url>';</script>
```

Y ahí sí van el merge y el `?v=140`. **El orden completo del corte está en
el punto 11 de [`../docs/ARQUITECTURA-BACKEND.md`](../docs/ARQUITECTURA-BACKEND.md)** —
sacarle el acceso público a las planillas va **último**, porque mientras
el panel viejo siga en `main` lee por GViz.

### Si algo sale mal

| Síntoma | Qué mirar |
|---|---|
| **404 en todo** | `vercel.json` no se subió, o el directorio raíz del proyecto no es `server/` |
| **401 con un token recién generado** | el `JWT_SECRET` local y el de Vercel no coinciden |
| **502 `SIN_PERMISO_SHEET`** | la planilla no está compartida con el `client_email` |
| **502 `AUTH_GOOGLE`** | la clave privada quedó cortada, o falta habilitar la Sheets API |
| **El panel no llega: error de CORS** | falta su origen en `ORIGENES_PERMITIDOS` |
| **404 `SIN_CATEGORIA`** | falta la variable `SHEET_…` de ese slug |

```bash
npx vercel logs <tu-url>
```

### Dos cosas que NO se comportan igual que en local

Están anotadas en el punto 6.4 de la arquitectura: el **rate limit** y el
**caché de hojas** viven en la memoria de UNA instancia, y en serverless
hay muchas. El límite efectivo termina siendo *(límite × instancias)* y
una instancia fría arranca sin caché. Para producción de verdad,
Upstash/Redis o el rate limiting del propio borde.
