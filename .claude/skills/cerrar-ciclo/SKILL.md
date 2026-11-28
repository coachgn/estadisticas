---
name: cerrar-ciclo
description: Cerrar un ciclo de 4 partidos de un equipo en MotorStats (Ciclos, fases 4-6, puntos 165, 166 y 170). Verifica que el ciclo esté cerrado y apto, arma el informe local y corre el ensayo de publicación; sellar, publicar (escribe KV) y mandar el mail con el PDF a los clientes esperan el OK del usuario.
argument-hint: "<club> <categoría> <equipo> <ciclo N>"
disable-model-invocation: true
---

Pedido: `$ARGUMENTS`

Hablá en español rioplatense, breve. Fuente: `docs/claude/laboratorio-pbp-ciclos.md` (punto 165 en `:1590`, 166 en
`:1682`, 170 en `:1726`). Motor: `js/sgadd-ciclos.js`. Rutas: `server/rutas/ciclos.js`. CLI: `server/bin/ciclos.js`.

## Antes que nada: hay dos caminos y no hacen lo mismo

| | **A · modal «📣 Sellar, publicar y enviar…»** (Ciclos, admin) | **B · «Ciclos · gestión» (Comparativa) o la CLI** |
|---|---|---|
| Ruta | `POST /cerrar` | `POST /gestion` (guardar → auditar) y `POST /publicar` |
| Sella en `sgadd:ciclos` | **sí** (HSETNX) | **no**: `/publicar` no sella |
| Exige pasar por «auditado» | no | sí (estado auditado + misma huella) |
| PDF del mail | la FOTO del navegador | regenerado desde el paquete |
| Ensayo | `enviar: 'prueba'` (manda al mail del admin, con «[PRUEBA]») | `ensayo: true` / CLI sin `--enviar` (no manda nada) |
| Reintento de fallidos | no reserva el reclamo de envío | sí (`--reintentar`, HSETNX en `sgadd:ciclos-envio:`) |

**Camino por defecto de esta skill: A** (es el único que sella y publica de una, como describe el punto 166). Si el
usuario pide B, avisá que el ciclo queda publicado pero **sin sello**, y preguntá si igual va.

## Lo que la skill hace sola (lee, valida, ensaya sin escribir)

1. **Ubicar** club, categoría, equipo y ciclo (`--ciclo N` = el estándar de 4 partidos; `--ultimos N` o `--desde/--hasta`
   solo si lo piden). Si el paquete en KV está viejo, primero `/subir-paquetes`.
2. **¿Se puede sellar?** (`js/sgadd-ciclos.js:368-384`, `auditar` en `:269-312`):
   - la ventana tiene que estar **cerrada** (los 4 partidos jugados), no `abierto`;
   - `auditar().apto` sin errores. Bloquean: faltan parciales por cuarto, o tiros por cuarto contra zonas con
     descalce **> 2 %**;
   - los avisos (partido excluido o parcial, mapa parcial, muestra chica, SOS) **no bloquean**, pero van al informe para el OK.
   Si no es apto, frená: se dice qué falta y de dónde sale (casi siempre es la ingesta o el paquete).
3. **¿Ya está?** Si el ciclo ya está sellado o publicado (`YA_PUBLICADO`), no se rehace: se informa.
4. **Informe local** para revisar: `node server/bin/ciclos.js informe --club X --categoria Y --equipo "N" --ciclo 0
   --salida <carpeta en el scratchpad>`. Solo lee KV y arma HTML/PDF con el Chrome local. Revisá que abra, que las
   6 secciones estén y que las metas del ciclo anterior aparezcan contra el nuevo (punto 170).
5. **Ensayo de publicación**: `node server/bin/ciclos.js publicar --club X --categoria Y --equipo "N" --ciclo 0`
   (sin `--enviar`). Compila el PDF y dice **a cuántos** se mandaría. No muestres los mails en el chat: la cantidad y los roles alcanzan.
6. **Informe para el OK**: ciclo, ventana (fechas y rivales), apto y avisos, dónde quedó el informe local, cuántos
   destinatarios, y el camino que se va a usar.

## 🛑 Lo que espera el OK del usuario (cada uno por separado)

1. **Sellar** («🔒 Sellar este ciclo» → `POST /sellar`): escribe KV con HSETNX. **No se puede deshacer** ni reemplazar.
2. **Prueba de mail** (camino A, `enviar: 'prueba'`): no escribe KV si no se marca publicar, pero manda un mail real
   al admin. Recomendado antes del envío a clientes: confirmar el asunto «[PRUEBA]» y que el PDF llegue entero.
3. **Publicar y enviar al club** (camino A con publicar + «A los usuarios del club», o B con `--enviar`): escribe KV y
   **manda el PDF a los mails del padrón del cliente**. Requiere además el flag del servidor `CICLOS_ENVIO_CLIENTES=si`;
   si la opción está deshabilitada, es por eso, y prenderlo es un cambio de configuración del deploy: otro OK aparte.
4. **Reintentar fallidos** (`--reintentar`): manda solo a los que fallaron; igual es un envío a clientes.

Lo hace el usuario desde el panel, o Claude (en el navegador integrado con la sesión del usuario, o por la CLI), solo
después del «sí» para ese paso. Un OK para sellar no es un OK para mandar.

## Verificar después

1. Ciclos (admin): el ciclo figura sellado o publicado; en Comparativa → «Ciclos · gestión», estado «publicado».
2. El resultado del envío: enviados y fallidos (si hay fallidos, se informa y se pide OK para reintentar).
3. Vista del cuerpo técnico: ve solo lo publicado (punto 166); el link del mail abre el ciclo (punto 170).
4. Si se tocó código: `node test-ciclos.js && node test-ciclos-sellos.js && node test-ciclosadmin.js &&
   node test-ciclospublicar.js && node test-cicloinforme.js && node test-ciclosui.js`, y la suite entera vía `/entregar`.

## Huecos que no se completan de memoria

- **El estado real de `CICLOS_ENVIO_CLIENTES` en producción** no está en el repo. Se ve en la UI (la opción habilitada o
  no) o se pregunta.
- **Quién recibe** el informe en cada club y si el cliente tiene ciclos en su plan: dato de negocio, en
  el cerebro de negocio (directorio adicional local): `clientes/<cliente>.md`. Si no está escrito, se pregunta antes de mandar.

## Al cerrar

Resumen corto: ciclo, apto/avisos, qué se selló/publicó/envió (con cantidades, sin mails) y qué quedó esperando el OK.
Si se publicó, una línea en el cerebro de negocio (directorio adicional local): `diario/AAAA-MM.md` y en la ficha del cliente (entregas recientes).
