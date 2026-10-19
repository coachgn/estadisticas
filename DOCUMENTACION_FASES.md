# Fases, arrastre de puntos y desempate · manual de autogestión

Cómo se declara la estructura de un torneo —fase regular, playoffs, play-in,
permanencia, promoción, finales— y cómo se configura la tabla —desempate FIBA,
arrastre del 50 %, acumulado— **desde el Panel Master, sin tocar archivos ni
hacer commits**. El detalle técnico y el porqué de cada regla está en
`CLAUDE.md` (puntos 15, 31, 44, 75-78 y 132-133).

---

## 0 · Las dos piezas, y dónde se edita cada una

| Pieza | Qué decide | Dónde se edita | Dónde se guarda |
|---|---|---|---|
| **Competencia** (`competencia`) | la TABLA: zonas de colores, desempate, arrastre, qué formato usa cada tramo | Panel Master → **Configuración → Zonas de la tabla** → «Publicar en el cliente» | catálogo (KV), por club o por categoría |
| **Fases** (`formato.fases`) | la LLAVE: qué fases hay, sus cruces, series y de qué tabla salen los puestos | Panel Master → **Clientes → tarjeta del torneo → 🔀 Cruces · la llave** → «Guardar la llave» | catálogo (KV), en el torneo |

Las dos se publican con un botón y le llegan al cliente en su próxima carga.
**Ninguna necesita git.** Los archivos `clubes/<club>.json` y
`torneos/<id>.json` quedan como respaldo del repo: si el servidor no contesta,
el panel cae a ellos. Lo publicado en KV gana siempre sobre el archivo.

Las dos pasan por el modal de confirmación (punto 30), que enumera el cambio
antes de escribirlo, y por el MISMO validador que usa el panel al leer: una
declaración con errores no se guarda.

---

## 1 · El vocabulario: TORNEO, FASE y tramo

El libro de MotorStats trae dos columnas en cada fila: **`TORNEO`** y
**`FASE`**. Salen del nombre de la carpeta de Drive (`"APERTURA - REGULAR"` →
torneo `APERTURA`, fase `REGULAR`).

- Un **tramo** es el par `TORNEO|FASE`: `APERTURA|REGULAR`,
  `APERTURA|CUARTOS`, `CLAUSURA|REGULAR`. Es la misma clave del selector «Fase»
  de la barra, de `porTramo`, del arrastre y de las tablas de la llave.
  Se escribe en mayúsculas; el panel acepta `Apertura | Regular` y lo
  normaliza.
- **`*TOTAL*|REGULAR`** es el ACUMULADO: lo arma el panel solo, cuando una
  fase tiene dos torneos o más. No es un tramo jugado (ver el punto 4).
- **Las métricas nunca mezclan tramos.** Cada tramo es un índice aparte: los
  partidos de `APERTURA|CUARTOS` no suman PJ, PG, PP ni puntos a
  `APERTURA|REGULAR`. Esto es así desde el punto 3 ter y no hay que
  configurar nada: alcanza con que MotorStats escriba los playoffs con otra
  FASE (`CUARTOS`, `PLAYOFF`, `SEMIFINAL`…).

> **Requisito del dato:** si MotorStats escribiera los playoffs del Apertura
> con `FASE = REGULAR`, contarían en la regular. Lo que separa una cosa de la
> otra es la columna, no una configuración del panel.

---

## 2 · Fase REGULAR (liga) contra fase PLAYOFF (eliminación)

En el editor de cruces cada fase es una fila. El tipo sale solo:

| Tipo | Cuándo | Cómo se muestra |
|---|---|---|
| `liga` | sin cruces declarados y una FASE que el núcleo no conoce como eliminatoria | tabla de posiciones |
| `eliminacion` | tiene cruces, o su FASE es una ronda conocida (`OCTAVOS`, `CUARTOS`, `SEMIFINAL`, `FINAL`, `RECLASIFICACION`, `PERMANENCIA`…) | llave con series |

Se puede forzar con `"tipo": "liga"` o `"tipo": "eliminacion"`.

### Los campos de una fase

```json
{
  "id": "cuartos-cl",                 // único en el torneo
  "label": "Cuartos · Clausura",      // lo que se ve en la barra y la llave
  "libro": ["CUARTOS"],               // valor(es) de la columna FASE
  "torneo": "CLAUSURA",               // valor de la columna TORNEO (punto 133)
  "tabla": "CLAUSURA|REGULAR",        // de qué tabla salen los puestos (punto 133)
  "serie": { "mejorDe": 3 },          // impar: 1, 3, 5, 7
  "cruce": "zona",                    // "interzonal" si cruza zonas
  "zonaLibro": null,                  // libro vinculado donde se juega (punto 77)
  "zonas": ["oro"],                   // qué zonas la ven (vacío = se deduce)
  "desde": "2026-11-01", "hasta": "2026-11-30",   // ventana del fixture (opcional)
  "cruces": [ ... ]
}
```

En el editor del Panel Master: **Id · Nombre · FASE en el libro · Cruce · Se
juega en · Serie · TORNEO en el libro · Puestos de la tabla**, más las zonas que
la ven.

- **`torneo`** hace falta cuando el MISMO valor de FASE aparece en dos torneos
  del libro (los cuartos del Apertura y los del Clausura). Sin él, la fase toma
  los partidos de esa FASE en todos los torneos.
- **`tabla`** dice de qué tabla salen los puestos de sus cruces. Sin ella sale
  de la tabla de la fase regular de la zona, que con Apertura y Clausura en el
  mismo libro es el **acumulado** (`*TOTAL*|REGULAR`): casi nunca es lo que
  pide el reglamento. Con `tabla` declarada y esa tabla todavía sin datos, el
  puesto queda **«a definir»** —nunca se toma otra tabla—.

### Los cruces

```json
{ "id": "P3", "label": "Play-In · último lugar",
  "a": { "perdedor": "P1" },
  "b": { "ganador": "P2" } }
```

Cada lado (`a`, `b`) es uno de estos cinco:

| Lado | Forma | En el editor |
|---|---|---|
| puesto de una tabla | `{ "zona": "oro", "puesto": 7 }` y opcional `"tabla": "CLAUSURA|REGULAR"` | Puesto + zona + tabla |
| ganador de un cruce anterior | `{ "ganador": "P2" }` | Ganador de |
| perdedor de un cruce anterior | `{ "perdedor": "P1" }` | Perdedor de |
| equipo fijo | `{ "equipo": "OLIMPO" }` | Equipo fijo |
| de otro torneo | `{ "externo": "Subcampeón Plata" }` y, cuando se sepa, `"equipo": "…"` | De otro torneo |

Reglas: un `ganador`/`perdedor` tiene que apuntar a un cruce declarado ANTES
(si no, la llave podría ser circular); un `externo` sin equipo queda «a
definir» con su nombre.

**Condición** (`"condicion": "distintos"`, casilla «solo si son distintos»): el
cruce se juega solo si los dos lados son equipos distintos. Con los dos lados
resueltos al mismo equipo, la llave muestra «No se juega». Es la **final extra
de temporada**.

---

## 3 · El arrastre de puntos

Un **formato** de la tabla puede arrancar con un porcentaje de los **puntos de
tabla** (2 por ganado, 1 por perdido) que cada equipo hizo en otro tramo:

```json
"formatos": {
  "clausura": {
    "label": "Clausura",
    "arrastre": { "faseOrigen": "APERTURA|REGULAR", "porcentaje": 50 },
    "zonas": [ ... ]
  }
},
"porTramo": { "CLAUSURA|REGULAR": "clausura" }
```

En el Panel Master: **Configuración → Zonas de la tabla → Formato → «Arrastre
de puntos»** (el tramo de origen y el porcentaje), y en **«Tramos y su
formato»** se elige que `CLAUSURA|REGULAR` use ese formato. Si la Clausura
todavía no está en el libro, se agrega a mano con **«+ tramo que todavía no
está en el libro»**.

Lo que hace y lo que no:

- **Suma solo PUNTOS.** PJ, PG, PP, PF, PC, la diferencia y el porcentaje son
  de los partidos del tramo. La tabla muestra **Pts** (total) y **Arr.** (lo
  arrastrado, ya incluido), y un aviso arriba dice de dónde sale.
- **Ordena por puntos.** Con arrastre la tabla se ordena por Pts: si el
  desempate del bloque es por porcentaje, se antepone PTS (y la pantalla lo
  dice); con FIBA, el D.1 usa el total con el arrastre y el duelo directo y la
  mini-tabla usan **solo los partidos del tramo**.
- **El origen aporta lo que sumó jugando**, con sus partidos sin estadísticas y
  **sin su propio arrastre** (no se encadena).
- **No rige en el acumulado** (`*TOTAL*`, que ya suma los partidos del origen)
  ni en un tramo del mismo torneo que el origen.
- **Un equipo del origen que todavía no jugó en el tramo** figura con 0 PJ y sus
  puntos arrastrados.
- El validador avisa: arrastre con desempate por porcentaje, origen que el libro
  todavía no trae (no suma nada hasta que llegue), y error si un tramo arrastra
  de sí mismo.

Con 50 % de un número impar quedan medios puntos (`7,5`): es lo que dice el
reglamento, y se muestra así.

---

## 4 · El acumulado de la temporada

No se configura: es **`*TOTAL*|REGULAR`** en el selector «Fase» (rotulado
*Total - Regular*). Se arma reconstruyendo desde los partidos de las fases
REGULAR de todos los torneos del libro (Apertura + Clausura), y **nunca junta
fases**: los playoffs no entran. Se ofrece solo cuando la fase regular tiene dos
torneos o más, y es el tramo que abre el libro mientras no haya una fase
posterior en juego (punto 3 ter y 76).

Para que una tabla «oficial» acumulada se pinte con zonas propias, se le asigna
un formato en «Tramos y su formato» (`*TOTAL*|REGULAR` → formato). Nunca lleva
arrastre.

---

## 5 · El desempate · `ordenTabla`

Configuración → Zonas de la tabla → Formato → **Desempate**:

| Opción | `ordenTabla` | Qué hace |
|---|---|---|
| Porcentaje | `["PCT", "DIF", "PF"]` | el default histórico |
| FIBA | `["FIBA"]` | puntos de tabla → duelo directo / mini-tabla → cociente PF/PC (Apéndice D, punto 132) |

Es del **bloque**: vale para todos los formatos del club o de la categoría. **El
que manda es el de la categoría** si la categoría tiene reglas propias
(`porCategoria`): el panel lo lee de ahí desde el punto 133 (antes leía el del
club, y un FIBA publicado «solo para esta categoría» no se aplicaba). La
pantalla dice arriba de la tabla a quién le cambia lo que se publica («Todas
las categorías del club» / «Solo esta categoría»).

Con FIBA o arrastre la tabla muestra la columna **Pts**, y la fila que quedó
ordenada por un desempate lleva `*` junto al puesto y el motivo en el tooltip
(«Desempate: duelo directo»).

---

## 6 · Ejemplo completo: Bahía Blanca 2026

### 6.1 · La tabla (Configuración → Zonas de la tabla, categoría Oro)

```json
{
  "ordenTabla": ["FIBA"],
  "formatos": {
    "apertura": { "label": "Apertura", "zonas": [
      { "id": "cuartos", "desde": 1, "hasta": 4, "label": "Cuartos de final", "tono": "exito" },
      { "id": "reclasificacion", "desde": 5, "hasta": 12, "label": "Reclasificación", "tono": "aviso" } ] },
    "clausura": { "label": "Clausura",
      "arrastre": { "faseOrigen": "APERTURA|REGULAR", "porcentaje": 50 },
      "zonas": [
        { "id": "cuartos", "desde": 1, "hasta": 6, "label": "Cuartos de final", "tono": "exito" },
        { "id": "playin", "desde": 7, "hasta": 10, "label": "Play-In", "tono": "aviso" },
        { "id": "permanencia", "desde": -2, "label": "Permanencia", "tono": "peligro" } ] }
  },
  "porTramo": { "APERTURA|REGULAR": "apertura", "CLAUSURA|REGULAR": "clausura" }
}
```

### 6.2 · La llave (Panel Master → tarjeta del torneo → 🔀 Cruces)

Los valores de `libro` y `torneo` tienen que ser **los que MotorStats escriba**
en las columnas FASE y TORNEO (el nombre de la carpeta). Los de abajo son un
ejemplo: se ajustan cuando se carguen los primeros partidos de cada instancia.

```json
[
  { "id": "regular", "label": "Fase regular" },

  { "id": "cuartos-ap", "label": "Cuartos · Apertura", "libro": ["CUARTOS"], "torneo": "APERTURA",
    "tabla": "APERTURA|REGULAR", "serie": { "mejorDe": 3 }, "cruces": [
      { "id": "CA1", "a": { "zona": "oro", "puesto": 1 }, "b": { "zona": "oro", "puesto": 4 } } ] },
  { "id": "final-ap", "label": "Final · Apertura", "libro": ["FINAL"], "torneo": "APERTURA",
    "serie": { "mejorDe": 3 }, "cruces": [ { "id": "FA", "a": { "ganador": "SA1" }, "b": { "ganador": "SA2" } } ] },

  { "id": "playin", "label": "Play-In", "libro": ["PLAY-IN"], "torneo": "CLAUSURA",
    "tabla": "CLAUSURA|REGULAR", "serie": { "mejorDe": 1 }, "cruces": [
      { "id": "P1", "a": { "zona": "oro", "puesto": 7 }, "b": { "zona": "oro", "puesto": 8 } },
      { "id": "P2", "a": { "zona": "oro", "puesto": 9 }, "b": { "zona": "oro", "puesto": 10 } },
      { "id": "P3", "a": { "perdedor": "P1" }, "b": { "ganador": "P2" } } ] },

  { "id": "permanencia", "label": "Permanencia", "libro": ["PERMANENCIA"], "torneo": "CLAUSURA",
    "tabla": "CLAUSURA|REGULAR", "serie": { "mejorDe": 5 }, "cruces": [
      { "id": "PE", "a": { "zona": "oro", "puesto": 11 }, "b": { "zona": "oro", "puesto": 12 } } ] },

  { "id": "promocion", "label": "Promoción", "libro": ["PROMOCION"], "serie": { "mejorDe": 5 }, "cruces": [
      { "id": "PR", "a": { "ganador": "PE" }, "b": { "externo": "Subcampeón Plata" } } ] },

  { "id": "cuartos-cl", "label": "Cuartos · Clausura", "libro": ["CUARTOS"], "torneo": "CLAUSURA",
    "tabla": "CLAUSURA|REGULAR", "serie": { "mejorDe": 3 }, "cruces": [
      { "id": "CC1", "a": { "zona": "oro", "puesto": 1 }, "b": { "ganador": "P1" } },
      { "id": "CC2", "a": { "zona": "oro", "puesto": 2 }, "b": { "ganador": "P3" } },
      { "id": "CC3", "a": { "zona": "oro", "puesto": 3 }, "b": { "zona": "oro", "puesto": 6 } },
      { "id": "CC4", "a": { "zona": "oro", "puesto": 4 }, "b": { "zona": "oro", "puesto": 5 } } ] },
  { "id": "semis-cl", "label": "Semifinales · Clausura", "libro": ["SEMIFINAL"], "torneo": "CLAUSURA",
    "serie": { "mejorDe": 3 }, "cruces": [
      { "id": "SC1", "a": { "ganador": "CC1" }, "b": { "ganador": "CC4" } },
      { "id": "SC2", "a": { "ganador": "CC2" }, "b": { "ganador": "CC3" } } ] },
  { "id": "final-cl", "label": "Final · Clausura", "libro": ["FINAL"], "torneo": "CLAUSURA",
    "serie": { "mejorDe": 3 }, "cruces": [ { "id": "FC", "a": { "ganador": "SC1" }, "b": { "ganador": "SC2" } } ] },

  { "id": "final-extra", "label": "Final extra de temporada", "libro": ["FINAL EXTRA"], "serie": { "mejorDe": 3 },
    "cruces": [ { "id": "FX", "a": { "ganador": "FA" }, "b": { "ganador": "FC" }, "condicion": "distintos" } ] }
]
```

(El Apertura está abreviado: se declaran sus cuartos y semis con la misma forma.)
Los emparejamientos de los cuartos del Clausura con los ganadores del play-in
son **un ejemplo**: se cargan como diga el reglamento de la ABB.

---

## 7 · Paso a paso en el Panel Master

1. **Desempate FIBA** · Configuración → Zonas de la tabla → elegir la
   categoría → Formato → Desempate «FIBA» → **Publicar en el cliente** → en el
   modal, elegir a quién se aplica.
2. **Formato de la Clausura** · «+ formato» → nombre «Clausura» → Arrastre de
   puntos: `APERTURA|REGULAR` y `50` → cargar sus zonas.
3. **Asignar tramos** · Tramos y su formato → `APERTURA|REGULAR` → Apertura;
   «+ tramo que todavía no está en el libro» → `CLAUSURA|REGULAR` → Clausura.
4. **Publicar** · revisar la Validación y la Vista previa, y «Publicar en el
   cliente».
5. **La llave** · Clientes → tarjeta del torneo → 🔀 Cruces → «＋ Fase» por cada
   instancia (TORNEO en el libro, Puestos de la tabla, Serie) → «＋ Cruce» con
   sus lados → **Guardar la llave**.

Exportar el JSON sigue existiendo como respaldo del repo, y es opcional.
