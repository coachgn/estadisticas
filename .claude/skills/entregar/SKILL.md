---
name: entregar
description: Entrega de MotorStats (SGADD). Deja el cambio listo y commiteado en local: secretos, ?v=, CSS, compartido/, suite entera y commit. Push, deploy del backend y verificación de Pages solo con el OK del usuario.
argument-hint: "[mensaje de commit opcional]"
disable-model-invocation: true
---

Mensaje propuesto (opcional): `$ARGUMENTS`

Hablá en español rioplatense, breve. Cada paso que falla **frena la entrega**: decí qué falló con la salida y no sigas.
Todo corre desde la raíz del repo.

## 1 · Qué se entrega

`git status --short` y `git diff --stat`. Si no hay cambios, decilo y terminá.
Si la rama no es `main`, avisalo (puede ser una rama de `/bucle`) y seguí: el commit queda en esa rama.
Fuera del commit siempre: `logos-extraido.js`, `boot-extraido.js`, `*-extraido.js`, y todo lo ignorado.

## 2 · Nada sensible (el repo es público)

Revisá el diff (`git diff` + archivos nuevos) buscando: sheetIds de Google (cadenas de ~44 caracteres en URLs
`/d/...` o asignadas a `sheetId`), tokens o claves (`token`, `secret`, `key`, `Bearer`, `-----BEGIN`), mails reales
y archivos `.env`/credenciales. Si aparece algo, frená y reportá **solo `ruta:línea` y el tipo**, nunca el valor.

## 3 · Obligaciones de la casa

1. **`?v=`**: si cambió algún `.js` de `js/`, `sgadd.css` o algo que sirva Pages, subí en uno el número en TODOS los
   `?v=N` del `index.html` (todos tienen que quedar iguales) y actualizá la línea «Versión actual de assets» de `CLAUDE.md`.
2. **CSS**: si cambió `index.html` o algún `js/*.js`, corré `node generar-css.js`. Si `sgadd.css` cambió, entra al commit.
3. **compartido/**: corré `node server/bin/sincronizar-compartido.js` (nunca `cp`). Si cambió algo en
   `server/lib/compartido/`, entra al commit y el backend va a necesitar deploy (anotalo para el paso 6).
4. Si cambió algo en `server/` (rutas, lib, compartido), anotá **«requiere deploy del backend»**.

## 4 · La suite entera

Corré TODOS los `test-*.js` de la raíz (no solo los del punto 11), con un timeout por archivo, y resumí:
archivo, verdes/rojos. **Un solo rojo = no se commitea.** Mostrá la salida del que falló.
(`test-centro-mando.js` pide `npm install` en `centro-mando/` una vez: si falla por eso, decilo así.)

## 5 · Commit local

Mostrá la lista de archivos que entran. Mensaje: el de `$ARGUMENTS` si vino, si no proponé uno con el formato del
punto 11 (`tipo: descripción en imperativo, en español`). Agregá los archivos **por nombre** (no `git add .` a ciegas)
y commiteá con el trailer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
Este commit local es lo que el usuario pidió al correr `/entregar`: no hace falta preguntar.

## 6 · Lo que espera el OK del usuario

Terminá con un resumen corto (archivos, `?v=` nuevo, tests, hash corto del commit) y preguntá, sin hacer nada antes del «sí»:

1. **Push**: `git push origin <rama>`.
2. **Deploy del backend**, solo si quedó anotado en el paso 3: `cd server && npx vercel --prod`.
3. **Verificar Pages** después del push: comparar el `?v=` de `raw.githubusercontent.com/coachgn/estadisticas/main/index.html`
   (el repo) contra `https://coachgn.github.io/estadisticas/` (lo publicado). Si difieren, es el build de Pages que
   todavía no salió (puede tardar de 40 segundos a más de media hora): avisá y no lo des por publicado.

Cada uno es un «sí» aparte. Un «sí» al push no autoriza el deploy.
