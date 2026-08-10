# Propuesta · Estados de jugador y buzón de alertas

**Estado: DISEÑO. No se tocó una línea del motor de estados.** El pedido pide
presentar la ventana de confirmación antes de modificar el código, así que este
documento es para discutir y aprobar.

- Fecha: 2026-08-10 · Versión de assets vigente: `?v=52`
- Auditado sobre: Primera · Clausura 2026 (210 jugadores, 12 equipos, 72 partidos)

---

## 1. Auditoría · qué pasa hoy con las ausencias

### 1.1 No existe ningún concepto de estado

Grep sobre los dos módulos: **cero** menciones a lesión, baja, traspaso o
inactividad. Un jugador es una fila de `PROMEDIOS J` y nada más. Lo único que
lo separa del resto es `__califica`, que mide otra cosa (si un percentil tiene
sentido).

### 1.2 Lo que el sistema ya hace bien, y conviene no romper

**El filtro de calificación es por MINUTOS, no por partidos jugados.**

```js
// sgadd-core.js:1222
function califica(j) {
  return typeof j['MIN'] === 'number' && j['MIN'] >= liga.minJugador;
}
```

Eso significa que **la "Regla de Muestra Corta" del pedido ya está resuelta de
raíz**: un refuerzo de última fecha con 2 partidos y 18,6 minutos de promedio
califica igual que un titular de 12 partidos. Medido en la liga real:

| Jugador | PJ | MIN | ¿Califica hoy? |
|---|---|---|---|
| FERRARO DIEGUEZ, FACUNDO | 2 | 18,6 | **sí** |
| PALOMEQUE, MIQUEAS JOEL | 4 | 21,6 | **sí** |
| GIMENEZ, SIMON | 4 | 11,0 | no *(11 < 15,37)* |

> **El riesgo real es el inverso al que plantea el pedido.** No hay peligro de
> excluir refuerzos; hay peligro de **sobre-incluirlos**: los promedios de un
> jugador con 2 partidos entran a las distribuciones de percentil y a las
> bandas z con el mismo peso que los de uno con 12. Un 60% de triples sobre 5
> intentos mueve la mediana de la liga igual que uno sobre 60.

### 1.3 El agujero medido

| Situación | Casos en la liga | Qué hace hoy el panel |
|---|---|---|
| 4+ partidos consecutivos sin sumar minutos | **50 de 210 (24%)** | nada: siguen en el plantel y en los promedios |
| 0 minutos en todo el torneo | 16 | idem |
| Mismo jugador en dos equipos | **0** | no está contemplado |

Los 50 son de todo tipo: juveniles de banco, lesionados largos y bajas reales,
y **el sistema no puede distinguirlos**. Todos ensucian el conteo del plantel y
aparecen en la tabla de Plantel del informe.

El traspaso hoy da cero, igual que pasó con la columna `TORNEO` en su momento:
es un riesgo **latente**, no activo. Cuando ocurra, el jugador aparecerá en los
dos equipos con sus promedios partidos al medio y nadie se va a enterar.

---

## 2. Matriz de estados propuesta

### 2.1 Los cuatro estados

| Estado | Qué significa | ¿Suma a promedios del equipo? | ¿Aparece en scouting? | ¿Conserva historial? |
|---|---|---|---|---|
| `ACTIVO` | En rotación habitual | **sí** | sí | sí |
| `LESIONADO` | No suma minutos por lesión o sanción, sigue en el plantel | **no** | **sí, con aviso** | sí |
| `TRASPASO` | Cambió de equipo dentro de la liga | solo en el equipo actual | solo en el actual | **sí, completo** |
| `BAJA` | Dejó el torneo | **no** | no | sí, archivado |

**La distinción que importa** es entre `LESIONADO` y `BAJA`, y no es cosmética:

- Un **lesionado** que vuelve la próxima fecha **tiene que seguir en el informe
  de scouting** — el DT rival necesita saber que ese jugador existe y qué hace,
  aunque no haya jugado los últimos cuatro partidos. Lo que no puede es
  arrastrar sus ceros al promedio del equipo.
- Una **baja** no vuelve. Sacarla del informe es correcto; dejarla es ruido.

### 2.2 Dónde vive el estado

**No en la planilla.** MotorStats no escribe estado y pedirle una columna nueva
abre un ciclo de coordinación con el otro proyecto por algo que es una decisión
del cuerpo técnico, no un dato del box score.

Propuesta: **`localStorage` por club + planilla**, con la misma forma que ya usa
`SCOUT_UI.marcas` para las marcas editadas.

```js
// clave: sgadd.estados.<club>.<planillaId>
{
  "MOREIRA, PEDRO|RECONQUISTA A": {
    estado: "LESIONADO",
    desde: "2026-07-15",
    nota: "esguince de tobillo",
    porUsuario: true          // el DT lo confirmó, no lo puso el detector
  }
}
```

**`porUsuario` es la clave del diseño.** Un estado confirmado por el DT **nunca**
se pisa con lo que detecta el motor. El detector solo propone; el DT decide. Es
la misma línea que el resto del proyecto: el sistema calcula, la firma es del
cuerpo técnico.

### 2.3 Qué pasa si el estado no existe

**Todo sigue funcionando exactamente como hoy.** Sin `localStorage` cargado,
cada jugador se trata como `ACTIVO` y el panel se comporta igual que ahora. Es
la misma regla que la config de club: la funcionalidad nueva no puede tumbar lo
que ya anda.

---

## 3. Detección automática · las dos reglas

### 3.1 Alerta de inactividad

```
DISPARA  si el jugador acumula ≥ 4 partidos consecutivos de su equipo
         sin registrar minutos, contando desde el último partido jugado
NO DISPARA si ya tiene un estado marcado por el DT (porUsuario: true)
SUGIERE  "¿lesionado o baja?" — nunca elige por su cuenta
```

**El umbral de 4 es del pedido y es razonable**, pero con los datos actuales
marcaría **50 de 210 jugadores (24%)**. Un buzón que se abre con 50 alertas el
primer día no se lee: se ignora para siempre.

**Propuesta de calibración**, para discutir:

| Filtro adicional | Alertas resultantes | Razonamiento |
|---|---|---|
| Sin filtro (solo racha ≥ 4) | ~50 | inusable |
| **+ jugó al menos 1 partido antes** | menos | descarta al que nunca entró: ese no es una baja, nunca estuvo |
| **+ promedió ≥ 8 minutos cuando jugó** | pocas | descarta al juvenil de banco que suma 2 minutos sueltos |

La segunda y la tercera juntas dejan solo a los que **eran parte de la rotación
y dejaron de estarlo**, que es exactamente el caso que el DT quiere ver.

### 3.2 Alerta de traspaso

```
DISPARA  si la misma clave de jugador (NOMBRE + normalización) aparece
         en dos equipos distintos dentro del mismo torneo y fase
SUGIERE  cuál es el equipo actual (el del último partido con minutos)
PIDE     confirmación explícita antes de tocar nada
```

**Por qué no se puede resolver solo.** La clave de un jugador es hoy el string
del nombre (deuda técnica conocida, punto 10 de `CLAUDE.md`): dos homónimos en
equipos distintos son indistinguibles de un traspaso. Por eso la alerta
**pregunta** en vez de decidir:

> *"MOREIRA, PEDRO aparece en RECONQUISTA 'A' y en ATENAS 'A'. ¿Es el mismo
> jugador que cambió de equipo, o son dos jugadores distintos?"*

Las dos respuestas son válidas y solo el DT las conoce.

---

## 4. El buzón · diseño de UI

### 4.1 Dónde va

En la barra superior, a la izquierda del indicador *"Datos actualizados"*, para
que aparezca en todas las secciones sin ocupar lugar del contenido.

```
┌────────────────────────────────────────────────────────┐
│  ☰  EQUIPOS                    🔔 3   ● Datos actual.  │
└────────────────────────────────────────────────────────┘
```

- **Sin alertas:** la campana no se muestra. Un icono permanentemente vacío
  entrena a ignorarlo.
- **Con alertas:** badge con el número, en el amarillo de aviso que ya usa el
  panel (`text-yellow-400`), no en rojo — no es un error, es algo para revisar.
- **Recuento por planilla**, no global: las alertas de U21 no se mezclan con las
  de Primera.

### 4.2 El panel desplegable

```
┌─ ALERTAS · Primera · Clausura 2026 ──────────────── ✕ ─┐
│                                                        │
│  ⏸  INACTIVIDAD                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ CORIA, JEREMIAS · ATENAS 'A'                     │  │
│  │ 12 partidos seguidos sin ingresar.               │  │
│  │ Jugó 4 partidos con 6,2 min de promedio.         │  │
│  │                                                  │  │
│  │  [ Lesionado ]  [ Dar de baja ]  [ Está bien ]   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ⇄  TRASPASO                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ MOREIRA, PEDRO                                   │  │
│  │ Aparece en RECONQUISTA 'A' (fechas 1-6) y en     │  │
│  │ ATENAS 'A' (fechas 8-12).                        │  │
│  │                                                  │  │
│  │  [ Es un traspaso ]  [ Son dos jugadores ]       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│                          [ Revisar después ]           │
└────────────────────────────────────────────────────────┘
```

**Detalles de diseño que importan:**

1. **Cada alerta trae el número que la disparó**, igual que las consignas del
   informe. *"12 partidos seguidos sin ingresar. Jugó 4 partidos con 6,2 min"*
   le da al DT lo necesario para decidir sin abrir otra pantalla.
2. **"Está bien" es una acción de primera clase**, no un descarte escondido.
   Marca al jugador como `ACTIVO` confirmado y **la alerta no vuelve**. Sin esa
   opción el buzón repite lo mismo cada vez que se abre.
3. **Nada se aplica hasta que el DT toca un botón.** El buzón no cambia estados
   por su cuenta ni "al cerrar".
4. **"Revisar después" no descarta**: cierra el panel y las alertas siguen ahí.

### 4.3 La confirmación · antes de aplicar

El pedido pide explícitamente ver esta ventana antes de tocar código. **Solo
aparece para las acciones que cambian los números**, que son `BAJA` y
`TRASPASO`; marcar `LESIONADO` no altera ningún promedio y se aplica directo.

```
┌─ CONFIRMAR BAJA ───────────────────────────────────────┐
│                                                        │
│   CORIA, JEREMIAS · ATENAS 'A'                         │
│                                                        │
│   Al darlo de baja:                                    │
│                                                        │
│   ✓  Sale del plantel de ATENAS 'A' en el informe      │
│      de scouting y de la tabla de Plantel.             │
│   ✓  Sus 4 partidos dejan de contar en los promedios   │
│      del equipo.                                       │
│   ✓  Su ficha individual se conserva completa: el      │
│      historial no se borra, se archiva.                │
│                                                        │
│   ⚠  Esto cambia el eFG% y el %TOV del equipo en       │
│      todas las secciones del panel.                    │
│                                                        │
│   Motivo (opcional):  [_______________________]        │
│                                                        │
│            [ Cancelar ]      [ Confirmar baja ]        │
└────────────────────────────────────────────────────────┘
```

**Los tres puntos con ✓ son el contrato explícito**: qué cambia, qué no, y qué
se conserva. El ⚠ avisa que la decisión tiene alcance más allá de la pantalla
donde se toma — es el mismo criterio de "confirmar antes de una acción difícil
de revertir" que rige en el resto del proyecto.

**Reversible siempre.** Un jugador dado de baja se puede reactivar desde la
ficha; el estado es un dato del panel, no una modificación de la planilla.

---

## 5. Impacto en el motor · qué habría que tocar

Ordenado de menos a más invasivo. **Nada de esto está hecho.**

| # | Cambio | Archivo | Riesgo |
|---|---|---|---|
| 1 | Leer estados del `localStorage` y anotar `j.__estado` en el índice | `sgadd-core.js` | bajo: campo nuevo, nadie lo lee todavía |
| 2 | Excluir `BAJA` de `jugadoresPorEquipo` y de `jugadoresCalificados` | `sgadd-core.js` | **medio: mueve promedios y percentiles** |
| 3 | Badge de estado en la ficha y en las cards del plantel | `sgadd-jugadores.js` | bajo: presentación |
| 4 | Mostrar lesionados en el informe con aviso, sin sumarlos al promedio | `sgadd-scouting.js` | medio |
| 5 | Detector de rachas + detector de traspaso | módulo nuevo `sgadd-alertas.js` | bajo: solo lee |
| 6 | Buzón y modal | `index.html` + `sgadd-alertas.js` | bajo |

**El punto 2 es el único que asusta**, y por eso va con confirmación explícita:
sacar a alguien de `jugadoresCalificados` mueve la mediana de la liga, los
percentiles de todos y las bandas z del scouting. Hay que decidir si una baja
afecta **solo a su equipo** o también a las referencias de liga. Mi
recomendación: **solo a su equipo**. Las referencias de liga describen la
competencia como fue, y un jugador que jugó seis fechas las jugó.

---

## 6. Lo que hay que decidir antes de codear

1. **¿El umbral de inactividad queda en 4 partidos o se le suman los filtros de
   §3.1?** Con 4 pelado son 50 alertas de arranque.
2. **¿Una baja afecta las referencias de liga o solo a su equipo?** (Recomiendo
   solo su equipo.)
3. **¿Los estados se comparten entre usuarios o son locales?** Hoy no hay
   backend: `localStorage` es por navegador. Dos ayudantes de campo verían
   estados distintos. Compartirlos requiere el backend del punto 10 de
   `CLAUDE.md`.
4. **¿El traspaso divide los promedios por equipo o mantiene el total?** Un
   jugador con 6 fechas en cada club: ¿su ficha muestra dos bloques o uno?

Sin esas cuatro respuestas, cualquier implementación va a tener que rehacerse.
