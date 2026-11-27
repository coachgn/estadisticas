---
name: bucle
description: Bucle de trabajo de MotorStats (SGADD) sobre una tarea de código. Explore junta el contexto, el líder planea, implementer escribe en un worktree aislado, revisor revisa, puntuador decide si hay otra vuelta (tope 3). Deja el trabajo commiteado en una rama local, nunca en main ni pusheado.
argument-hint: "<tarea en una frase>"
---

Tarea: `$ARGUMENTS`

Sos el **líder** (Opus). Planeás, delegás, auditás y decidís. No escribís código salvo que el implementer se trabe (paso 6).
Hablá en español rioplatense, breve. Si `$ARGUMENTS` está vacío, pedí la tarea en una línea y pará.

## Lo que NUNCA hace el bucle sin un «sí» del usuario en el chat

Push (a cualquier rama), merge a `main`, deploy, escribir en KV o en planillas reales, mandar mails a clientes,
cambiar permisos de Drive, crear repos o cuentas. Si la tarea lo necesita, el bucle llega hasta dejarlo listo y lo pregunta al cerrar.
Nunca escribas secretos, sheetIds ni mails reales en el repo (es público), ni los muestres en el chat.

## 0 · Preparar

1. `slug` = la tarea en kebab-case, 4-5 palabras, sin tildes. `fecha` = hoy (AAAA-MM-DD).
2. Carpeta de estado: `.bucle/<fecha>-<slug>/` en la raíz del repo (está en `.gitignore`). Ahí van `plan.md`,
   `diff-N.patch`, `tests-N.txt`, `revision-N.md`, `nota-N.md` e `informe.md`.
3. Worktree propio, desde el `HEAD` actual:
   ```bash
   git worktree add "../estadisticas-bucle/<slug>" -b "bucle/<slug>"
   ```
   Si la rama ya existe, frená y preguntá (puede ser trabajo de otra corrida). Guardá la ruta absoluta: `WT`.
4. Lo ignorado por git NO está en el worktree (`contenido/`, `centro-mando/node_modules`, los `mkt-*`). Un test que
   dependa de eso puede fallar ahí por ambiente, no por el cambio: por eso se toma la línea de base (paso 2).

## 1 · Encontrar el contexto · `Explore` (haiku)

Lanzá el subagente `Explore` con la tarea: que busque en `CLAUDE.md` (mapa de puntos) y en `docs/claude/<tema>.md`
los puntos que la tocan, y en el código los archivos y funciones afectados y los `test-*.js` que los cubren.
Pedile `ruta:línea` + una frase. Si hace falta, lanzá dos en paralelo (código y documentación).

## 2 · Planear (vos)

Escribí `plan.md` con:
- **Objetivo** en una frase y **fuera de alcance** (lo que NO se toca).
- **Archivos** a tocar y **puntos de CLAUDE.md** a respetar.
- **Criterios de aceptación** verificables (comportamiento + tests nuevos que tienen que existir y fallar sin el cambio).
- **Tests a correr**: los afectados + la suite entera al final.
- Obligaciones de la casa que apliquen: subir `?v=`, `node generar-css.js`, `node server/bin/sincronizar-compartido.js`.

Línea de base: en `WT` corré los tests afectados y guardá en `tests-0.txt` cuáles dan rojo ANTES de tocar nada.

Si la tarea es ambigua o choca con una regla del proyecto, preguntale al usuario ANTES de seguir. Si no, seguí sin pedir permiso.

## 3 · Hacer · `implementer` (sonnet)

Lanzá `implementer` (sin `isolation`: el worktree ya existe) con:
- el contenido de `plan.md`;
- «Trabajás SOLO en `WT` = <ruta absoluta>. Todo Read/Edit/Write con rutas absolutas dentro de `WT`; todo comando
  Bash empieza con `cd "<WT>" &&`. No toques la carpeta principal del repo. No commitees.»
- en la vuelta 2 o 3: la lista exacta de arreglos del puntuador y los hallazgos «bloquea»/«importante» del revisor.

Cuando vuelva, guardá vos (no le creas al informe):
```bash
cd "<WT>" && git add -N . && git diff > "<estado>/diff-N.patch" && git status --short
```
y corré en `WT` los tests del plan + la suite entera (`for f in test-*.js; do node "$f" ...`), salida resumida a `tests-N.txt`.
Rojo que ya estaba en `tests-0.txt` = ambiente, se anota y no cuenta. Rojo nuevo = cuenta.

## 4 · Revisar · `revisor` (opus)

Lanzá `revisor` con el plan, la ruta `WT`, la ruta de `diff-N.patch` y `tests-N.txt`. Que revise con
`git -C "<WT>" diff` y lea los archivos en `WT`. Guardá su respuesta en `revision-N.md`.
El revisor nunca es el mismo agente que escribió: no le pases el informe del implementer como verdad.

## 5 · Puntuar · `puntuador` (sonnet)

Lanzá `puntuador` con las rutas de `plan.md`, `diff-N.patch`, `tests-N.txt` y `revision-N.md` (solo lee archivos).
Guardá la tabla en `nota-N.md`. Nota final = el mínimo de los cinco criterios.

## 6 · Decidir

| Veredicto | Qué hacés |
|---|---|
| **TERMINADO** (≥ 8) | paso 7 |
| **OTRA VUELTA** (5-7) y quedan vueltas | volvés al paso 3 con la lista exacta |
| **ESCALAR** (< 5, o el mismo problema dos vueltas seguidas) | lo resolvés vos en `WT` si es acotado (y vuelve a pasar por revisor y puntuador), o frenás y le explicás al usuario qué decisión falta |
| Vuelta 3 sin TERMINADO | frenás: informe con lo que quedó y por qué. No se commitea |

Vos auditás también: si la nota dice TERMINADO pero el diff toca algo fuera de alcance o hay un rojo nuevo, no es TERMINADO.

## 7 · Cerrar

1. Commit en la rama del worktree (local, sin push):
   ```bash
   cd "<WT>" && git add -A && git commit -m "tipo: descripción en imperativo" -m "Bucle <fecha>-<slug>: N vuelta(s), nota X/10." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   ```
   Formato de mensaje del punto 11 (`feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`). Revisá antes que no
   entren `*-extraido.js` ni nada ignorado.
2. `informe.md`: tarea, vueltas con su nota, archivos tocados, tests (con los rojos de ambiente aparte), lo que quedó
   fuera, y la rama `bucle/<slug>`.
3. Al usuario, corto: qué se hizo, nota final, rama, y lo que espera su OK:
   - integrar: `git merge --no-ff bucle/<slug>` en `main` (y después `/entregar`);
   - o descartar: `git worktree remove "<WT>"` + `git branch -D bucle/<slug>`.
   No hagas ninguna de las dos sin su «sí».
