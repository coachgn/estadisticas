# Operación del ecosistema MotorStats

Cómo encajan las piezas, cómo detectar un desvío y qué comando lo corrige.
La guía de producto está en [`HOJA_DE_RUTA.md`](HOJA_DE_RUTA.md). El paso a
paso del Panel Master está en [`GUIA_ALTA_CLIENTES.md`](GUIA_ALTA_CLIENTES.md).

> **Regla de oro: primero se audita, después se corrige.**
>
> ```bash
> node server/bin/ecosistema.js auditar
> ```
>
> Es de solo lectura. Lista cada desvío con el comando que lo arregla, y sale
> con código 1 si hay errores.

---

## 0 · La corrida completa · un solo comando

```bash
npm run auto-process                   # todo, de punta a punta
npm run auto-process -- --ensayo       # muestra los pasos y no corre nada
npm run auto-process -- --sin-ingesta  # sin tocar los sitios ni Drive
npm run auto-process -- --solo canva   # un paso: ingesta | auditar | contenido | canva
```

| Paso | Qué corre | Qué deja |
|---|---|---|
| 1 · ingesta | `motorstats-ingestion/herramientas/correr-lnb.js` | libros de LNB y LAB al día y los paquetes de play-by-play en KV |
| 2 · auditar | `server/bin/ecosistema.js auditar --json` | `contenido/auto-process/<fecha>_auditoria.json`; los errores en el log |
| 3 · contenido | `generar-contenido.js` por liga (lista `CONTENIDO` de `auto-process.js`) | `contenido/<liga>-<zona>/<día>/`: el Top 3 y las diez recetas |
| 4 · canva | `centro-mando/canva.js importar` | las piezas aprobadas, como diseños editables en Canva; `placas-tmp/` vuelve a quedar vacía |

**Ningún paso llama a una IA ni a un conector.** Los hijos corren con
`CENTRO_MANDO_MOTOR=no`. El paso de Canva arma el PDF EN MEMORIA con el Chrome de la máquina
(sin dependencias), lo publica en `placas-tmp/` de GitHub Pages y Canva lo
importa por su API oficial. No queda ningún archivo local. Un paso que falla no frena
a los siguientes, y el comando sale con 1 si alguno falló. El log queda en
`contenido/auto-process/<fecha>.log`.

**Lo que sigue siendo una decisión humana:** aprobar una pieza en el Centro de
Mando (`npm start` en `centro-mando/`). Este comando lleva a Canva lo que ya se
aprobó; no aprueba nada.

**Para que corra solo**, hay que reemplazar la acción de la tarea de Windows
que hoy corre la ingesta (02:00 y 10:00) por:

```bash
cmd /c "cd /d C:\Users\Pc\Documents\estadisticas && npm run auto-process"
```

No lo registré: es un cambio de configuración de la máquina, y lo hacés vos
desde el Programador de tareas o con `motorstats-ingestion/herramientas/programar-tarea.ps1`.

## 0 bis · Canva sin Claude · la app, una sola vez

El paso 4 usa la **Connect API** de Canva. **No importa HTML** (solo PDF,
PPTX, DOCX y formatos de Office/Adobe), por eso cada pieza viaja como PDF:

```
cola (pendiente) → PDF en memoria → placas-tmp/ (commit SOLO de esa carpeta) → Pages
  → POST /rest/v1/url-imports → diseño en Canva (importada) → placas-tmp/ vacía
```

Configuración, una vez:

1. En https://www.canva.com/developers crear una integración (Connect API).
   Scope: **design:content:write**. URL de redirección:
   **http://127.0.0.1:8772/oauth/redirect** (Canva no acepta `localhost`).
2. Copiar el Client ID y el secreto en `centro-mando/.env` como
   `CANVA_CLIENT_ID` y `CANVA_CLIENT_SECRET` (ver `.env.ejemplo`).
3. Correr una vez, y aceptar en el navegador:

```bash
node centro-mando/canva.js autorizar
```

El permiso queda en `centro-mando/.canva-token.json` (en .gitignore). Canva
rota el refresh token en cada uso y el script guarda el nuevo antes de usarlo.

```bash
node centro-mando/canva.js estado            # app, permiso y la cola
node centro-mando/canva.js importar --ensayo # qué publicaría e importaría
npm run canva                                # el paso 4 solo
```

- **Pages puede tardar** (de 40 s a más de media hora). Lo que no se ve en 20
  minutos queda `publicada` y se importa en la corrida siguiente.
- Un error transitorio de Canva (`fetch_failed`, throttling) se reintenta
  hasta 3 corridas; uno definitivo (`invalid_file`) deja la pieza en `error`
  con el motivo y retira su PDF de Pages.
- **Publica solo si la copia está en main y al día con origin**, y el commit
  incluye SOLO `placas-tmp/`: nunca arrastra otros cambios.
- El diseño queda en Canva como un PDF importado: los textos son editables, y
  los gráficos de Canva (semáforos, flechas) se siguen agregando a mano.


---

## 0 ter · El vigía · la ingesta apenas termina un partido (2026-10-18)

La tarea de las 02:00 y las 10:00 es la red. El **vigía** corre mientras la
PC está prendida y dispara la cadena de una competencia (LNB, LAB Norte, LAB
Sur) apenas uno de sus partidos termina: mira el fixture cada 5 minutos con
partidos en juego y cada 30 si no, y cuenta como terminado un partido con
marcador y 150 minutos desde su inicio (el fixture trae el parcial de uno en
juego). Nunca corre a la vez que la tarea: comparten el candado
`salida\.corrida.lock`. Detalle en el punto 127 de CLAUDE.md.

En `motorstats-ingestion`:

```bash
node herramientas/vigia.js --ensayo
```

```bash
powershell -ExecutionPolicy Bypass -File herramientas/programar-tarea.ps1 -Vigia -Registrar
```

```bash
powershell -Command "Start-ScheduledTask -TaskName 'MotorStats Vigia'"
```

Log en `salida\vigia\AAAA-MM-DD.log`.

## 1 · El mapa · seis fuentes que tienen que coincidir

```
 FUENTES EXTERNAS                    MOTOR (Apps Script)                     WEB (este repo)
 ────────────────                    ───────────────────                     ──────────────
 CABB / Gesdeportiva ─┐
 box scores (.xlsx)    │  Drive         ┌────────────────────────┐
 apdeb, basket-club    │  2026/<torneo>/ │ libro del cliente      │  Service    ┌──────────────┐
                       ├─────────────▶ │  · Cliente_Script      │ ─Account──▶ │ backend      │
 motorstats-ingestion ─┘  (carpetas)    │  · Configuracion.js    │  (lector)   │ Vercel + KV  │──▶ panel
 (tarea 02:00 y 10:00)                  │  · 9 hojas             │             │ (catálogo)   │   (Pages)
        │  puente (doPost)              └──────────┬─────────────┘             └──────┬───────┘
        └──────────────────────────────▶ fachada   │ MS_TOKEN                          │
                                        (WebApp.js)│ = HMAC(secreto, sheetId)          │ torneos/*.json
                                           │       ▼                                   │ logos/<liga>/
                                           └──▶ LICENCIAS (planilla central)            │ clubes/*.json
```

| # | Fuente | Dónde vive | Qué decide |
|---|---|---|---|
| 1 | **Catálogo** | Upstash · `sgadd:catalogo` | qué libros sirve la web, a qué club, con qué plan y hasta cuándo |
| 2 | **El libro** | Google Sheets | los datos. Lo escribe el motor y lo lee la Service Account |
| 3 | **LICENCIAS** | planilla central del motor (`LIC_SPREADSHEET_ID`) | si el **menú de la planilla** le contesta a alguien que no es administrador |
| 4 | **El Apps Script del libro** | ligado al libro | su `MS_TOKEN` tiene que ser el de **ese** libro, y su `MI_CONFIG` tiene que nombrar bien las carpetas |
| 5 | **La ingesta** | `motorstats-ingestion/src/sitios.js` | qué libros se llenan solos, sin Excel |
| 6 | **Torneos y escudos** | `torneos/*.json`, `logos/<liga>/index.json` | fixture, zonas, equipos, alias y escudos |

**LICENCIAS no se audita por defecto (decisión del 2026-10-15).** Todas las
planillas se operan con la cuenta de administración, y el motor le saltea la
licencia a un administrador (v104). Mientras eso sea cierto, una fila faltante
o vencida no rompe nada. Si un cliente va a operar su planilla con su propia
cuenta, se vuelve a mirar con `ecosistema.js auditar --licencias`.

**Hay dos vencimientos y no son el mismo.** La web corta con el `vence` del
catálogo. El menú de la planilla corta con `FECHA_VENCIMIENTO` de LICENCIAS. Si
no coinciden, uno de los dos anda y el otro no. El auditor lo marca.

---

## 2 · Qué es automático, qué es manual a propósito y qué es un hueco

| Paso | Hoy | Por qué |
|---|---|---|
| Bajar box scores y escribir el libro (LNB, LAB) | **automático** · tarea 02:00 y 10:00 | ingesta + puente |
| Subir paquetes de play-by-play | **automático** dentro de la misma tarea | `pbp.js subir` |
| Mails de vencimiento a 5, 3 y 1 día | **automático** · cron de Vercel 09:00 | punto 63 |
| Fila en LICENCIAS de un cliente nuevo | **semi**: `Alta_Automatica.js` la crea PENDIENTE cuando el cliente aprieta su primer botón | **activarla es manual a propósito**: es la decisión comercial |
| Fixture en vivo (APB, APdeB) | **automático** · el backend lo lee y lo cachea en KV | punto 70 |
| Escudos | **manual** · subir archivos y escribir `index.json` | no hay fuente oficial confiable |
| Token de un libro copiado | **manual** · `publicarCliente.js` | **a propósito**: el secreto no puede estar en un cliente (punto v108 del motor) |
| Compartir libro y carpeta con las cuentas | **manual** en Drive | lo hace el dueño del libro, con su cuenta |
| Alta de un torneo en el catálogo | **manual** · `catalogo.js torneo` | una sola vez por torneo |
| Que las seis fuentes coincidan | **lo verifica `ecosistema.js auditar`** | antes no lo comparaba nadie |

**Lo que no se va a automatizar, y por qué:**

- **Activar una licencia o subir un plan.** Es plata. Si el sistema lo hiciera
  solo, cualquiera con un token tendría el producto.
- **Compartir un libro.** El permiso lo da el dueño. Si una cuenta de MotorStats
  se lo diera sola, hoy necesitaría acceso de editor a Drives ajenos.
- **Escribir el secreto en un cliente.** Si una copia pudiera calcularse su
  propio token, copiar un libro ya alcanzaría para entrar al motor.

---

## 3 · Los comandos

Todos se corren desde la raíz de este repo, salvo que se indique otra carpeta.
Necesitan `server/.env` (KV + Service Account) y la sesión de `clasp`.

### Auditar

```bash
node server/bin/ecosistema.js auditar                # las seis fuentes · ~1 min
node server/bin/ecosistema.js auditar --sin-scripts  # sin la API de Apps Script
node server/bin/ecosistema.js auditar --json         # para otro script
node server/bin/ecosistema.js plan-alta --sheet <id> # qué le falta a UN libro
node server/bin/kv-salud.js                          # Upstash: lee y prueba permisos
node server/bin/catalogo.js listar                   # el catálogo, legible
```

### Corregir · según el área del hallazgo

| Área | Hallazgo | Comando |
|---|---|---|
| `motor` | MS_TOKEN de otro libro («Token inválido») | `cd ~/mi-motor-stats && node herramientas/publicarCliente.js <scriptId> <sheetId>` |
| `motor` | verificar un libro de punta a punta | `cd ~/mi-motor-stats && node herramientas/llamarFachada.js validarAccesoPro <sheetId>` |
| `google` | la Service Account no lo lee | compartir el libro, como Lector, con la cuenta de servicio (`node server/bin/probar-google.js` la muestra en la primera línea) |
| `google` | el libro no existe | corregir el `sheetId` en el Panel Master (o `catalogo.js alta`) |
| `licencias` (solo con `--licencias`) | falta la fila / PENDIENTE / vencida | editar LICENCIAS (CLIENTE · EMAIL · SPREADSHEET_ID · ESTADO=ACTIVA · FECHA_VENCIMIENTO · PLAN) |
| `catálogo` | el libro tiene motor y la web no lo conoce | torneo: `node server/bin/catalogo.js torneo --archivo torneos/<id>.json --libro "<zona>=<id>" --probar` · cliente: Panel Master → Alta |
| `torneos` | zona sin libro | `node server/bin/catalogo.js torneo --archivo torneos/<id>.json --libro "<zona>=<id>"` |
| `escudos` | carpeta sin `index.json`, archivo faltante | escribir `logos/<liga>/index.json` y correr `node test-logos.js` |
| `suscripción` | vencida o por vencer | `node server/bin/catalogo.js vence --club X --categoria Y --vence aaaa-mm-dd` |
| `scripts` | un script que el auditor no conoce | `node server/bin/ecosistema.js registrar --script <scriptId> --etiqueta "<club / categoría>"` |

### Ingesta (en `motorstats-ingestion`)

```bash
node herramientas/correr-lnb.js                        # lo que corre la tarea, a mano
node herramientas/subir-paquetes.js                    # ensayo de la subida de play-by-play
node herramientas/subir-paquetes.js --sin-regenerar --confirmar
node herramientas/puente.js --competencia <id> --ping  # el puente de un libro
```

---

## 4 · Los tres circuitos de alta

### A · Un libro copiado (torneo o categoría nueva) · el caso de Bahía Blanca

1. Copiar el libro y editar `Configuracion.js` (carpeta madre, torneo, categoría, grupo, fases).
2. `node server/bin/ecosistema.js registrar --script <scriptId> --etiqueta "<torneo / categoría>"`
3. `cd ~/mi-motor-stats && node herramientas/publicarCliente.js <scriptId> <sheetId>`: le pone el token nuevo.
4. Compartir el libro y la carpeta del **año** con `freytesgn@gmail.com` como Editor, y el libro con la Service Account como Lector.
5. LICENCIAS: no hace falta (se opera con la cuenta de administración).
6. Catálogo: `catalogo.js torneo …` si es un torneo, o Panel Master → Alta si es un cliente.
7. Escudos: `logos/<liga>/` con su `index.json`.
8. `node server/bin/ecosistema.js plan-alta --sheet <sheetId>`: tiene que decir «nada pendiente».

### B · Un cliente nuevo sobre un libro que ya existe

1. Panel Master → Alta, eligiendo el libro de la zona (`libroDe`). Engancha al torneo y hereda zonas y partidos (puntos 53 y 73).
2. «Quiénes pueden entrar» → el mail. La bienvenida sale con el código (punto 63).
3. No se toca el motor: el cliente usa la web. Una licencia solo hace falta si el cliente va a operar la planilla.

### C · Un torneo con ingesta automática

1. `torneos/<id>.json` con los equipos y su id de la fuente.
2. Declararlo en `motorstats-ingestion/src/sitios.js` (`COMPETENCIAS`) y crear el puente (`puente.js --clonar … --publicar`).
3. `catalogo.js torneo --archivo torneos/<id>.json --libro "<zona>=<id>"`.
4. Habilitar la capa: `catalogo.js laboratorio --club <torneo> --categoria <zona> --capas pbp`.
5. `ecosistema.js auditar`: la competencia tiene que aparecer sin el error de «la ingesta escribe en un libro que no está en el catálogo».

---

## 5 · La arquitectura que propongo · un orquestador en tres capas

El objetivo es que **ningún dato viva escrito en dos lugares** y que lo que
sí se repite se **compare solo**. El orquestador no reemplaza a las
herramientas que ya andan (`publicarCliente.js`, `catalogo.js`, la ingesta).
Las encadena.

### Capa 1 · Detectar · HECHA (`ecosistema.js auditar`)

Cruza las seis fuentes y no escribe nada. Tiene que correr **solo**:

- **Propuesta:** sumarlo a la tarea programada de la ingesta (02:00 y 10:00) con
  `--json`. Si aparece un error nuevo, que mande un mail con el mismo SMTP del
  punto 63. Hay que decidir a quién le llega.

### Capa 2 · Proponer · el «plan de alta» de cada libro (`plan-alta`, hecho en versión mínima)

Para un `sheetId` devuelve los pasos que faltan, en orden y con el comando
de cada uno. Falta que arme **la fila exacta de LICENCIAS** con los datos del
catálogo (cliente, plan, vencimiento), así no se tipea nada.

### Capa 3 · Aplicar · `ecosistema.js alta` · A DECIDIR

Un solo comando que, **con confirmación paso por paso**, ejecute lo que la
capa 2 propuso:

| Paso | Cómo | Se puede automatizar |
|---|---|---|
| token del script | `publicarCliente.js` | **sí**, ya existe |
| registrar el script | `registrar` | **sí** |
| fila de LICENCIAS | — | **no hace falta** desde el 2026-10-15: se opera con la cuenta de administración |
| catálogo y torneo | `catalogo.js` | **sí** |
| compartir el libro | API de Drive con la cuenta del dueño | **no**: el dueño es otra persona |
| `index.json` de escudos | generarlo desde los archivos de la carpeta y los nombres del torneo | **sí**, con revisión: un escudo mal asignado no lo detecta nadie |

**Las decisiones de la capa 3:**

1. ~~¿La Service Account puede escribir LICENCIAS?~~ **Resuelta el 2026-10-15**: LICENCIAS sale del circuito.
2. ~~¿El vencimiento de la web y el de LICENCIAS son la misma fecha?~~ **Resuelta**: el que manda es el del catálogo.
3. **¿A quién le llega el mail de la capa 1?** Pendiente. Hoy el resultado queda en el log de `npm run auto-process`.

### Deuda que el auditor deja a la vista

- **El motor (`~/mi-motor-stats`) no está bajo git.** Es el código que
  escribe todos los libros, y su única vuelta atrás son las carpetas de
  `respaldos/`. Es el primer paso, y no depende de nada:
  `cd ~/mi-motor-stats && git init && git add -A && git commit -m "estado inicial"`
  (con un repo **privado**: el motor tiene el secreto de los tokens).
- **El vínculo libro ↔ script no estaba escrito en ningún lado.** El
  registro (`~/mi-motor-stats/registro-scripts.json`) guarda solo el
  `scriptId`. El libro lo informa Google (`parentId`), así que no hay un
  segundo dato que se desincronice.

---

## 6 · Estado al 2026-10-15

Primera corrida: `3 errores · 17 avisos`. Después de los ajustes de ese día
(manifiesto de Bahía Blanca, prefijo «1°» y LICENCIAS fuera): `1 error · 7 avisos`.

| | Hallazgo | Acción |
|---|---|---|
| ✓ | `logos/bahia-blanca/` sin `index.json` | **resuelto**: los 12 equipos resuelven su escudo, y el núcleo limpia el prefijo «1°» |
| ✖ | Script «U15» (`1MtG…cSQw`): la Service Account no lee su libro | compartirlo, o sacarlo de `~/mi-motor-stats/registro-scripts.json` si es la planilla de prueba |
| ✓ | **Bahía Blanca** (`1Vjj…y_VY`) | **resuelto el 2026-10-16**: `torneos/bahia-blanca-2026.json` y el torneo `bahia-blanca-2026` (zona `oro`, 12 equipos) en el catálogo |
| ⚠ | Hogar Social y Boca: la prueba terminó (10/10 y 12/10); Sud América vence el 16/10 | renovar o dar de baja |
| ⚠ | Liga Argentina: UNION (SF) y RACING (A) sin escudo | subir los dos archivos |
| ⚠ | El motor no está bajo git | ver «Deuda que el auditor deja a la vista» |
