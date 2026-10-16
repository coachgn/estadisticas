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
| `licencias` | falta la fila / PENDIENTE / vencida | editar LICENCIAS (CLIENTE · EMAIL · SPREADSHEET_ID · ESTADO=ACTIVA · FECHA_VENCIMIENTO · PLAN) |
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
5. LICENCIAS: una fila con su `SPREADSHEET_ID`. Solo hace falta si lo va a operar alguien que no es administrador.
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
| fila de LICENCIAS | escribir con la cuenta del prestador (la Service Account hoy solo lee) | **sí, si se da permiso de escritura** sobre esa planilla |
| alinear la licencia con el `vence` del catálogo | el mismo camino | **sí**, con la misma condición |
| catálogo y torneo | `catalogo.js` | **sí** |
| compartir el libro | API de Drive con la cuenta del dueño | **no**: el dueño es otra persona |
| `index.json` de escudos | generarlo desde los archivos de la carpeta y los nombres del torneo | **sí**, con revisión: un escudo mal asignado no lo detecta nadie |

**Hay tres decisiones tuyas antes de escribir la capa 3:**

1. **¿La Service Account puede escribir LICENCIAS?** Sin eso, la fila y la fecha se siguen cargando a mano.
2. **¿El `vence` de la web y el de LICENCIAS son la misma fecha?** Si lo son, conviene que haya **una sola** fuente (el catálogo) y que el motor la lea de ahí. Es un cambio en el motor.
3. **¿A quién le llega el mail de la capa 1?**

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

## 6 · Estado al 2026-10-15 · la primera corrida

`3 errores · 17 avisos`. Los que piden acción:

| | Hallazgo | Acción |
|---|---|---|
| ✖ | `logos/bahia-blanca/` tiene 12 escudos y **no tiene `index.json`** | escribir el manifiesto. La carpeta todavía no está commiteada |
| ✖ | Libro de la Zona B (DEPORTIVO, Sud América, Hogar Social, Universitario): **la licencia del motor venció el 18/09/2026** | extender `FECHA_VENCIMIENTO` (fila 3). Hoy el menú de esa planilla solo le contesta a un administrador |
| ✖ | Script «U15» (`1MtG…cSQw`): la Service Account no lee su libro | compartirlo, o sacarlo del registro si es la planilla de prueba («Prueba Conejillo») |
| ⚠ | **Bahía Blanca** (`1Vjj…y_VY`): tiene motor y token correctos, pero no está en el catálogo ni tiene `torneos/*.json` | circuito A, pasos 5 a 7 |
| ⚠ | LNB (`1AXK…`) en LICENCIAS como PENDIENTE; LAB Norte y Sur, Zona C y las fases de APB sin fila | no hace falta mientras los opere un administrador |
| ⚠ | Hogar Social y Boca: la prueba terminó (10/10 y 12/10) | renovar o dar de baja |
| ⚠ | Liga Argentina: UNION (SF) y RACING (A) sin escudo | subir los dos archivos |
