# SGADD · Hoja de ruta

Qué está hecho, qué falta y **por qué el orden es ese**. El detalle técnico
de cada pieza vive en `CLAUDE.md`; acá va la vista de producto.

Última revisión: **2026-08-27** · versión de assets `?v=139` · 2246 tests.

---

## La capacidad que ordena todo lo demás: una categoría, un libro

**Cada categoría de un club es un Sheet independiente**, con su propio
`sheetId` y su propio bloque de configuración. Reconquista tiene tres hoy
(Primera, U21, U23) y son tres libros distintos.

Eso no es un detalle de implementación: es lo que permite vender el sistema
**de a una categoría**.

### Qué habilita, concretamente

| | |
|---|---|
| **Riesgo cero para lo que ya anda** | Conectar U17 no puede romper Primera: son libros distintos y bloques distintos. No hay una migración que salga mal |
| **El alta es una hoja y un bloque** | Cero código, cero deploy. Dar de alta DEPORTIVO como cliente nuevo costó exactamente eso: un JSON y su carpeta de escudos |
| **Cada categoría se certifica sola** | El club puede tener Primera auditada y cerrada mientras las formativas recién arrancan. No hay que esperar a que todo esté completo para que algo valga |
| **El sistema dice qué falta** | Si se conecta una hoja y no se declara su torneo, el Diagnóstico la reclama por su nombre. La expansión se vuelve una lista de tareas visible en vez de una conversación |
| **La trazabilidad viaja en git** | Cada certificación es un commit con fecha. Si el club audita su temporada dentro de dos años, el historial está |

### El argumento, en una frase

> **Empezá por una categoría. Si funciona, sumás la siguiente sin tocar
> nada de lo que ya está andando.**

### Lo que lo sostiene técnicamente

- El aislamiento está **fijado con tests**: los tramos, los sellos y las
  zonas de una categoría no alcanzan a las otras (punto 18).
- `cobertura()` cruza el catálogo del club contra lo declarado y reporta
  los dos sentidos: libros sin declarar y categorías que apuntan a una hoja
  que no existe.
- **Cero nombres asumidos**: las categorías y los tramos se llaman como el
  cliente los llame. Hay un test que falla si la UI vuelve a ofrecer una
  lista con "Ida / Vuelta / Apertura".

### El camino de alta de una categoría nueva

1. El club comparte la hoja (**Cualquiera con el enlace · Lector** — un
   libro privado da 401 y la categoría no carga).
2. Se agrega la planilla a `clubes/<club>.json` con su `sheetId`.
3. El Diagnóstico la reclama: *"tiene libro conectado pero nadie declaró su
   torneo"*.
4. Se declara en la pestaña **Torneo** de Configuración —que abre en
   cualquier club, con o sin bloque previo—: tramos, fechas, equipos
   esperados y la `clave` que la ata al libro.
5. Se exporta el bloque y se commitea. Ahí le llega al resto.

Una planilla **sin `sheetId`** entra igual, como inactiva: aparece en el
selector deshabilitada con *"— sin datos"*, así el club ve que la categoría
existe sin poder entrar a una vista vacía.

---

## Estado por bloque

### Cerrado

| Bloque | Qué quedó |
|---|---|
| **Núcleo y adaptador** | 9 hojas por GViz, índice scopeado a un tramo, dos capas de caché |
| **Multi-cliente** | 3 clientes con un solo deploy. Sumar uno = un JSON + escudos |
| **Rendimiento** | Tailwind compilado al repo: primer pintado de **26,4 s a 5,9 s** a 200 kbps |
| **Secciones** | Principal, Clasificación, Equipos, Jugadores, Scouting, Simulador, Configuración, Diagnóstico |
| **Cuatro PDF** | Scouting, informe de equipo, post-partido y ficha del jugador |
| **Nombre del PDF** | Cada exportación nombra su archivo por lo que muestra, en vez del título de la app |
| **Roles y planes** | Admin / Cliente, Básico / Pro, con el cruce de scouting acotado al equipo propio. **Gate de interfaz, no seguridad** — ver abajo |
| **Estados y buzón** | Alertas de inactividad en dos niveles, buscador, estados confirmados |
| **Configuración de competencia** | Zonas de tabla con tonos AA en pantalla y papel, por tramo |
| **`TOTAL REGULAR`** | La unión de los torneos de una fase, con las 22 fórmulas auditadas contra el motor |
| **Preconfiguración y certificación** | Categorías y tramos libres, calendario, semáforo y huella |

### Pendiente · pedidos del cuerpo técnico

Están detallados en el punto 10 bis de `CLAUDE.md`. Los que siguen abiertos:

| | Pedido | Estado |
|---|---|---|
| **B-1** | Comparativa por períodos o ciclos, para equipos y jugadores | El dato está. Falta definir el corte con el club |
| **B-4** | Por qué esta marca defensiva y no otra | El motor ya lo sabe; falta que la ficha muestre el discriminante |
| **B-5** | Que la media de la liga se vincule al arquetipo | Ambicioso y con trampa: en La Plata hay **2** Anclas Defensivas sobre 210 jugadores, y un percentil sobre 2 no significa nada. Necesita un mínimo por grupo y degradar a la liga entera |

### Bloqueado por el dato · depende de MotorStats

| | Pedido | Por qué |
|---|---|---|
| **B-6** | Fixture y partidos por zona | No existe hoja de calendario. Hoy la fecha del partido, el torneo y el próximo rival son campos manuales en Scouting |
| **B-7** | Play-by-play de la CABB | Fuera de SGADD: el panel consume lo que el motor escribe. Si entra, habilita cuartos y parciales, que ya tienen un hook esperando |

---

## Deuda técnica que sigue abierta

Detalle en el punto 10 de `CLAUDE.md`. Lo que decide algo de producto:

- **No hay maestra de jugadores con ID estable.** La clave es el nombre, y
  **dos homónimos de equipos distintos mezclan sus estadísticas**. Bloquea
  el histórico plurianual: evolución de camadas, detección de similares.
  Decisión del cliente: postergado.
- **Los roles son un gate de INTERFAZ.** `sgadd-auth.js` decide qué se
  muestra, no a qué se puede llegar: el panel corre entero en el navegador
  del usuario. Vender el Plan Pro como una barrera técnica sería vender
  algo que todavía no existe — lo que hoy sostiene la diferencia entre
  planes es el acuerdo comercial, no el código.
- **El acceso es público.** Los `sheetId` están en archivos públicos y un
  sitio estático no puede filtrar nada. Membresías por niveles necesitan
  backend; `planillasVisibles(scope)` ya está preparado para recibirlo.
- **El simulador no tiene ciclo de aprendizaje.** Los pesos se recalculan
  de cero en cada carga. Retomarlo necesita persistir resultados, o sea el
  mismo backend.

Los tres apuntan al mismo lugar: **el próximo salto de producto necesita
backend.** Hasta entonces el panel es completo para lo que hace.

---

## Lo próximo, en orden

1. **Cerrar los pedidos del club que no dependen del dato** (B-1 y B-4).
   Son los que el cuerpo técnico ya pidió y se pueden hacer hoy.
2. **B-5 con su guarda de muestra mínima**, que es el de mejor lectura
   pero el que más fácil miente si se hace de apuro.
3. **Dar de alta la segunda categoría de un cliente real** de punta a
   punta. La capacidad está y tiene tests, pero **todavía no se ejerció con
   un club de verdad**: hacerlo una vez es lo que la convierte de
   "arquitectura" en "producto".
4. **Backend**, cuando el negocio lo pida. Desbloquea las tres deudas de
   arriba de una sola vez.
