---
name: subir-paquetes
description: Regenerar y subir al panel los paquetes de play-by-play (capa de laboratorio, esquema @3, con el bloque de ciclos adentro) de un torneo o categoría de MotorStats. Corre siempre primero en ensayo, valida y muestra qué se subiría; escribir en KV (pbp.js --confirmar, subir-paquetes --confirmar, catalogo.js) y la cadena completa de ingesta esperan el OK del usuario.
argument-hint: "<destino o club/categoría> [--sin-regenerar]"
disable-model-invocation: true
---

Pedido: `$ARGUMENTS`

Hablá en español rioplatense, breve. Fuentes: `OPERACION_ECOSISTEMA.md` (puntos 0 y 3), `docs/claude/laboratorio-pbp-ciclos.md`
(puntos 62, 83, 94, 99, 124) y `docs/claude/centro-mando-y-contenido.md` (punto 122). Si algo no cierra, leelos.

## El mapa (qué escribe cada cosa)

| Comando | Qué hace | ¿Escribe? |
|---|---|---|
| `node server/bin/pbp.js estado --club X --categoria Y` | qué hay hoy en KV para esa categoría | no |
| `cd ../motorstats-ingestion && node herramientas/subir-paquetes.js [--solo <destino>] [--sin-regenerar]` | respaldo de `salida/<id>/web` → regenera con `exportar-web.js` → `pbp.js subir` en prueba | no (solo el respaldo local) |
| `… subir-paquetes.js … --confirmar` | lo mismo, pero sube | **KV** |
| `node server/bin/pbp.js subir --club X --categoria Y --dir <carpeta web>` | valida y muestra qué subiría | no |
| `… pbp.js subir … --confirmar` | escribe `sgadd:pbp:<club>:<categoría>`, un campo por equipo + el índice; **no borra** campos | **KV** |
| `node server/bin/catalogo.js laboratorio --club X --categoria Y --capas pbp\|""\|heredar` | prende/apaga la capa en el catálogo | **KV** |
| `npm run auto-process -- --ensayo` | muestra la corrida completa sin correrla | no |
| `npm run auto-process` / `cd ../motorstats-ingestion && node herramientas/correr-lnb.js` | ingesta del sitio → xlsx → **Drive** → motor → libro, exportar y **`pbp.js subir --confirmar` fijo** | **Drive, planillas y KV** |
| `npm run auditar` | auditor del ecosistema | no |

Los ciclos **no tienen subida propia**: viajan dentro del paquete @3 de cada equipo (`exportar-web.js:282-294`).
Que el panel lea el KV nuevo es inmediato: **no hay deploy** en este flujo.

## Lo que la skill hace sola (lee, ensaya, valida)

1. **Ubicar el destino**: el `--solo <id>` de `subir-paquetes.js` (lista de destinos al principio del script) o el par
   club/categoría. La categoría tiene que existir en el catálogo (`pbp.js:62`). Si no está claro cuál es, preguntá.
2. **Foto de antes**: `pbp.js estado` de la categoría (equipos y fecha de lo que hay en KV).
3. **Ensayo**: `subir-paquetes.js --solo <id>` sin `--confirmar` (o `pbp.js subir` sin `--confirmar` si los paquetes
   ya están armados). Leé la salida entera:
   - esquema `analitica-pbp-web@3` en el índice y en cada paquete;
   - **techo de KB**: manda el código, `MAX_KB = 320` (`server/bin/pbp.js:42`); el comentario de `subir-paquetes.js`
     que dice 200 KB está desactualizado;
   - cada equipo juega en el libro de esa categoría (`pbp.js:89-100`). **No se usa `--sin-verificar`** sin preguntar;
   - un destino sin partidos locales se saltea: decirlo, no es un error.
4. **Comparar** antes y después: equipos nuevos, equipos que faltan (un equipo que estaba y ya no viene es una alarma:
   el `subir` no lo borra, pero queda viejo), partidos de más o de menos, ciclos nuevos por equipo.
5. **Auditar**: `npm run auditar` y separar lo que toca a este destino.
6. **Informe para el OK**: destino, qué se subiría (equipos, partidos, ciclos, KB por paquete), avisos del auditor y
   dónde quedó el respaldo (`salida/<id>/web.respaldo-<fecha>`).

## 🛑 Lo que espera el OK del usuario

- **Subir a KV**: `subir-paquetes.js --solo <id> --confirmar` (o `pbp.js subir … --confirmar`). Uno por destino; si son
  varios, se listan y el OK se pide para esa lista, no para «todo».
- **Cambiar la capa en el catálogo** (`catalogo.js laboratorio`).
- **Correr la cadena completa** (`npm run auto-process` sin `--ensayo`, `correr-lnb.js` sin `--ensayo`): además de KV,
  escribe en Drive y en el libro, y el `--confirmar` de la subida va fijo. Sin OK, solo `--ensayo`.
- Si el pedido implica **mails a clientes** (publicar un ciclo), eso no es de esta skill: va por `/cerrar-ciclo`.

## Vuelta atrás

Resubir el respaldo: `pbp.js subir --club X --categoria Y --dir <…/web.respaldo-<fecha>> --confirmar` (también con OK).

## Verificar después de subir

1. `pbp.js estado` otra vez: los equipos y la fecha nueva.
2. En el panel (cliente de esa categoría): la pestaña de laboratorio carga, el Mapa de tiro y Ciclos muestran el último
   partido. Si un número se ve raro, primero `npm run auditar`.
3. Si se tocó código en la sesión: `node test-pbp.js`, los `test-ciclos*.js` y la suite entera antes de commitear (`/entregar`).

## Huecos que no se completan de memoria

- **Qué destinos están activos** y para qué cliente: dato de negocio, en el cerebro de negocio (directorio adicional local): `clientes/`. Si no está, se pregunta.
- **La tarea programada de Windows** (`OPERACION_ECOSISTEMA.md`, punto 0): si corre sola, una subida a mano puede pisar
  o ser pisada. Antes de subir a mano, preguntá si la tarea está activa.

## Al cerrar

Resumen corto: destino, qué se subió (o qué quedó en ensayo esperando el OK), respaldo y verificación. Si se subió,
una línea en el cerebro de negocio (directorio adicional local): `diario/AAAA-MM.md`.
