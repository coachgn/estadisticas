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

## Desplegar en Vercel

`server/api/index.js` exporta la app de Express, que es lo que Vercel
espera. Las variables van en **Settings → Environment Variables** (ahí
`GOOGLE_PRIVATE_KEY` se pega con los `\n` literales, igual que en el
`.env`).

**Dos cosas no se comportan igual que en local**, y están anotadas en el
punto 6.4 de la arquitectura: el **rate limit** y el **caché de hojas**
viven en la memoria de una instancia, y en serverless hay muchas. Para
producción, Upstash/Redis o el rate limiting del borde.
