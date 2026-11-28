---
name: auditar
description: Auditoría de datos y clientes de MotorStats en una sola receta, en solo lectura. Cruza el ecosistema (catálogo en KV, libros de Google, scripts del motor, ingesta, torneos y escudos), la salud de KV, el padrón de clientes contra el cerebro de negocio, la ingesta programada y el repo público. Devuelve un informe con cada desvío y el comando que lo corrige; corregir siempre espera el OK del usuario.
argument-hint: "[todo | ecosistema | clientes | ingesta | repo] [--club X]"
disable-model-invocation: true
---

Pedido: `$ARGUMENTS` (sin argumentos = `todo`).

Hablá en español rioplatense, breve. **Esta skill no escribe nada, en ninguna fuente.** Cada desvío sale con el
comando que lo corrige: aplicar el arreglo es otro gesto, con su OK. Guía de fondo: `OPERACION_ECOSISTEMA.md`
(puntos 1 a 3 y 5) y el punto 121 de `CLAUDE.md`.

**Nunca imprimas un ID entero** (planillas, scripts, carpetas): primeros y últimos 4 caracteres, como el auditor.
Ni mails, ni valores de `.env`. El informe se puede pegar en un chat.

## 1 · Ecosistema (`ecosistema`)

```bash
node server/bin/ecosistema.js auditar          # las seis fuentes, ~1 min; --sin-scripts si clasp no tiene sesión
node server/bin/kv-salud.js                    # Upstash: lee y prueba permisos (SIN --escribir)
node server/bin/catalogo.js listar             # el catálogo, legible
```

Leé los hallazgos por área (`motor`, `google`, `catálogo`, `torneos`, `escudos`, `suscripción`, `scripts`) y anotá el
comando de la tabla «Corregir · según el área del hallazgo» de `OPERACION_ECOSISTEMA.md` (punto 3).
`--licencias` solo si el usuario lo pide (decisión del 2026-10-15: no se audita por defecto).

## 2 · Clientes (`clientes`)

Contra el catálogo de `catalogo.js listar`:
- **Vencimientos**: categorías vencidas o que vencen en los próximos 15 días, y estado (activo / pausado).
- **Plan efectivo** por categoría, y si coincide con lo que dice la ficha del cliente en el cerebro de negocio
  (directorio adicional local: `clientes/<cliente>.md`). Una ficha con `> SIN ESCRIBIR` no es un desvío: se lista
  como hueco para que el usuario lo complete.
- **Clientes en el catálogo sin ficha** en el cerebro, o fichas de clientes que el catálogo ya no tiene.
- **Defectos conocidos del motor** (U21 / U23 de Reconquista, medidos el 2026-08-24): ¿siguen? Se miran en la sección
  Diagnóstico del panel o con `plan-alta` del libro; si no hay forma de medirlo hoy, se dice.

## 3 · Ingesta y rutinas (`ingesta`)

- **Tareas programadas** (solo lee): `Get-ScheduledTask -TaskName 'MotorStats*' | Get-ScheduledTaskInfo` en PowerShell.
  Esperadas: «Ingestion LNB» (02:00 y 10:00), «Vigia» y «Centro de Mando» (al iniciar sesión), «Agencia Diaria» y
  «Agencia Semanal». Un `LastTaskResult` distinto de 0 es un hallazgo; `3221225786` es un cierre de sesión (no es
  error) en las de inicio de sesión. El log de las rutinas de la agencia está en `contenido/vigilancia/logs/`.
- Si la ingesta programada corrió: el log más reciente de la tarea y del vigía (`../motorstats-ingestion/salida/`,
  ver `OPERACION_ECOSISTEMA.md` puntos 0 y 0 ter) y si quedó el candado `salida/.corrida.lock` colgado.
- Paquetes de laboratorio: `node server/bin/pbp.js estado --club X --categoria Y` por cada categoría con capa pbp; un
  paquete que no se actualiza desde la última fecha jugada es un desvío.
- Alertas de carga de torneos manuales: `node server/bin/carga-manual.js control` (simula; **nunca** `--real` acá).

## 4 · Repo público (`repo`)

En `estadisticas` (es **público**):
- `git status --short` y `git status --ignored --short`: que no haya `*-extraido.js`, `.env`, `.bucle/` ni nada privado
  a punto de entrar.
- Escaneo de secretos en lo versionado (`git grep -nE` con patrones de tokens, claves privadas, mails, IDs de planillas):
  reportar solo `ruta:línea` y el tipo, nunca el valor.
- Coherencias que ya se vieron romper: la versión de assets de `CLAUDE.md` contra el `?v=` del `index.html`
  (`node test-boot.js`), `server/lib/compartido/` contra `js/` (`node test-backend.js`, test de deriva).
- La suite entera solo si el usuario lo pide o si hay cambios sin commitear (tarda): `for f in test-*.js; do node "$f"; done`.

## El informe

Una tabla por sección: **área · hallazgo · gravedad (rompe / riesgo / hueco) · comando que lo corrige · quién lo
aplica**. Arriba, tres líneas: lo que rompe hoy, lo que vence pronto y los huecos del cerebro.
Al final, en el cerebro de negocio: una línea en `diario/AAAA-MM.md` con la fecha y el resumen, y los desvíos que
quedan abiertos en `pendientes.md` (eso es escribir en el repo privado local, no en sistemas reales: se puede, sin push).

## 🛑 Lo que espera el OK del usuario

Todo arreglo. En particular:
- cualquier comando de `catalogo.js` que no sea `listar`/`exportar` o lleve `--probar` (escribe KV);
- `kv-salud.js --escribir`, `reparar-kv.js`;
- `publicarCliente.js` y todo lo del motor (`~/mi-motor-stats`): escribe en el script del libro;
- compartir un libro o cambiar permisos en Drive (lo hace el dueño del libro);
- editar LICENCIAS, activar una licencia o subir un plan: **es plata**, y es manual a propósito;
- `carga-manual.js --real`, `pbp.js subir --confirmar`;
- push del cerebro o de `estadisticas`.
