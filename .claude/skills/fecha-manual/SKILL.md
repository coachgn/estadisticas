---
name: fecha-manual
description: Cargar los resultados de una fecha de un torneo SIN box score (partidos manuales) en MotorStats. Arma y valida la lista contra las reglas del servidor, muestra el diff y deja todo listo para publicar desde el Panel Master; publicar (escribe el catálogo en KV) y la alerta real del calendario esperan el OK del usuario.
argument-hint: "<club o torneo> <categoría> <TORNEO|FASE> <fecha> [resultados pegados]"
disable-model-invocation: true
---

Pedido: `$ARGUMENTS`

Hablá en español rioplatense, breve. Lo técnico de fondo está en `docs/claude/competencia-fases-fixture.md`
(puntos 44, 102 y 164) y en `docs/claude/clientes-y-panel-master.md` (punto 30). Leelos si algo no cierra.

## Lo que hay que saber antes

- Los partidos manuales **no pasan por la planilla ni por el motor**: viven en el catálogo (KV), en
  `partidosManuales[categoría]["TORNEO|FASE"]`, y **solo suman a la tabla de posiciones** (PJ, PG, PP, PF, PC,
  local/visitante). No tocan el índice: ni eFG%, ni PACE, ni jugadores (`test-manuales.js`, «no tocar»).
- Publicar **reemplaza la lista entera de ESE tramo** (`server/lib/catalogo-mutar.js:1025`). Lo que no esté en la
  lista nueva se borra. Lista vacía = borrar el tramo. Por eso siempre se parte de lo ya publicado.
- Un torneo cuenta los partidos del torneo + los de sus clientes enganchados + los de los clientes del mismo libro
  (punto 102, `manualesDeTorneo`, `catalogo-mutar.js:246`). La llave entre zonas cachea 5 minutos.

## Lo que la skill hace sola (lee, arma, valida)

1. **Entender el pedido.** Club o torneo, categoría, tramo `TORNEO|FASE` (nunca el sintético `*TOTAL*`, nunca `*`
   en el torneo) y fecha (AAAA-MM-DD). Si falta algo o es ambiguo, preguntá: no adivines el tramo.
2. **Partir de lo publicado.** Leé el catálogo publicado del tramo (GET del catálogo vía el backend o lo que muestre
   el Panel Master) y listá los partidos manuales que ya tiene. La lista a publicar es **lo de antes + lo nuevo**.
3. **Armar los partidos** de la fecha: `local`, `visitante`, `puntosLocal`, `puntosVisitante`, `fecha`.
   Los nombres, **idénticos** a como figuran en la tabla/fixture de ese torneo (un nombre distinto crea un equipo
   fantasma en la tabla). Si un resultado viene de una fuente externa, citá la fuente.
4. **Validar con las reglas del servidor** (`_partidoManualValido_`, `catalogo-mutar.js:971`), antes de tocar nada:
   - local ≠ visitante, los dos con nombre;
   - puntos enteros y no negativos;
   - **sin empates** (el básquet no los tiene: un empate es un error de tipeo);
   - fecha presente;
   - como mucho 200 partidos por tramo;
   - sin duplicados (mismo cruce y misma fecha ya publicado).
   Torneo y fase NO se mandan por partido: el servidor los deriva de la clave del tramo (`:1002`).
5. **Mostrar el diff** antes → después del tramo: altas, cambios de resultado y bajas. Una baja que el usuario no
   pidió es una alarma: frená y preguntá.
6. **Predecir la tabla**: qué equipos cambian PJ/PG/PP y cómo queda el orden (PCT · DIF · PF por defecto).

## 🛑 Lo que espera el OK del usuario

| Acción | Por qué | Cómo, cuando hay OK |
|---|---|---|
| **Publicar** los partidos | escribe el catálogo completo en KV (`POST /api/v1/catalogo`, `accion:'partidos_manuales'`, solo ADMIN) | Panel Master → Configuración → partidos manuales del tramo → cargar la lista → el modal de confirmación (punto 30) muestra el diff: tiene que coincidir con el del paso 5 → Publicar. Lo hace el usuario, o Claude en el navegador integrado con su sesión, solo después del «sí» |
| **Alerta real** del calendario de torneos manuales | escribe en un Google Calendar | `node server/bin/carga-manual.js previa\|control --real` (sin `--real` simula, y eso sí se puede correr solo) |

Si KV no está configurado o el servidor responde 403/503, no se reintenta por otra vía: se informa y se frena.

## Verificar después de publicar

1. Clasificación del torneo (y del cliente enganchado): PJ = PG + PP en cada fila, los equipos del diff con sus
   números nuevos, y el partido en su fecha. Si la llave entre zonas no lo muestra, esperar los 5 minutos de caché.
2. Que ningún equipo nuevo apareció en la tabla por un nombre mal escrito.
3. Si en la sesión se tocó código: `node test-manuales.js && node test-clasificacion.js && node test-pj.js` y la
   suite entera antes de commitear (y eso va por `/entregar`).

## Huecos que no se completan de memoria

- **La programación del cron de alertas de carga** no está en el repo: `docs/claude/competencia-fases-fixture.md:2493`
  habla de crons en `server/vercel.json`, pero no están ahí (y `test-carga-manual.js` verifica que no estén). Si hace
  falta saber cuándo corre, se pregunta: puede estar en el panel de Vercel o en otro programador.
- **Qué torneos se cargan a mano y de qué fuente** sale cada resultado: es dato de negocio, va en
  el cerebro de negocio (directorio adicional local): `clientes/<cliente>.md`. Si no está escrito, se pregunta.

## Al cerrar

Resumen corto: tramo, partidos cargados (y bajas si hubo), cómo quedó la tabla, qué se publicó y qué quedó
esperando el OK. Si se publicó, una línea en el cerebro de negocio (directorio adicional local): `diario/AAAA-MM.md` (fecha, torneo, tramo,
cantidad de partidos).
