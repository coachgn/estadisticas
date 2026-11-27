# Competencia, fases y fixture

Parte de la documentación técnica de SGADD que vivía en `CLAUDE.md`. Los números de punto son los de siempre.

## 15. Configuración de competencia · `sgadd-config.js`

Módulo **puro** (nada de `document`), requerible desde Node y testeado entero
en `test-config.js`. Contesta lo que el box score NO puede saber: cuántos
clasifican, cuántos descienden y con qué color se pinta cada zona de la tabla
de posiciones.

### La línea que no se cruza: la ESTRUCTURA sale del dato

El bloque **no declara** cuántos equipos hay ni qué torneos existen. Eso ya lo
dice el libro —`combinacionesTorneoFase()` enumera los tramos reales y el
índice cuenta los equipos— y declararlo otra vez crea una segunda fuente de
verdad que se desincroniza en silencio. Este proyecto ya se comió ese bug tres
veces: el `sheetId` en dos lados resucitando un id muerto, el rol funcional en
dos módulos dando etiquetas distintas, y el Diagnóstico armando su índice sin
torneo y contando 373 jugadores donde la app usaba 208.

`equiposEsperados` es la única excepción y es a propósito una **aserción**: no
manda sobre el dato, solo hace que config y libro se contradigan a los gritos
en el Diagnóstico en vez de callados.

### El bloque

```json
"competencia": {
  "ordenTabla": ["PCT", "DIF", "PF"],
  "formatos": {
    "regular-12": {
      "label": "Regular · 12 equipos",
      "equiposEsperados": 12,
      "zonas": [
        { "id": "campeon",   "desde":  1, "hasta":  1, "tono": "exito"    },
        { "id": "playoffs",  "desde":  1, "hasta":  8, "tono": "positivo" },
        { "id": "repechaje", "desde":  9, "hasta": 10, "tono": "aviso"    },
        { "id": "descenso",  "desde": -2,              "tono": "peligro"  }
      ]
    }
  },
  "porTramo": { "*": "regular-12" }
}
```

**Todo es opcional y el fallback es siempre seguro.** Sin bloque, con uno roto
o con un JSON a medias, `parsear()` devuelve `null` y el panel se comporta
exactamente como antes. Es la regla del punto 6 y no se negocia. Hoy solo
DEPORTIVO lo declara; Reconquista y Jujuy no, y hay tests que fijan que eso
siga siendo válido.

### Los índices negativos no son azúcar sintáctica

`desde: -2` son los dos últimos. La cantidad de equipos **cambia entre
categorías del mismo club** —Primera 12, U21 13— y un `desde: 11` fijo marca
mal en cuanto entra una con otro número, **sin ningún síntoma**: la tabla se ve
perfecta y el descenso está corrido un puesto.

`hasta` se puede omitir: con `desde` negativo llega hasta el final, con `desde`
positivo la zona es de un solo puesto.

### Gana la PRIMERA zona que calza

Es una cascada, el mismo idioma que ya usan `PERFILES_MARCA` y `JERARQUIA`, así
que las zonas se escriben de la más específica a la más general: Campeón 1-1
vive adentro de Playoffs 1-8 y tiene que ir antes.

**El choque que hay que entender antes de tocarlo**: con 10 equipos,
Reclasificación (fija 9-10) y Descenso (`-2` → 9-10) piden los mismos puestos,
gana Reclasificación y **el descenso desaparece de la tabla sin que nadie lo
note** — los diez puestos salen pintados. No es un bug del motor, es una config
equivocada para esa cantidad de equipos, y por eso `validar()` la denuncia. La
herramienta no adivina: avisa.

### `porTramo` y el `null` explícito

La clave es **`TORNEO|FASE`, exactamente la que ya produce
`combinacionesTorneoFase()`**. Cero traducción entre config y datos. Búsqueda
de lo específico a lo general:

```
TORNEO|FASE   →   TORNEO|*   →   *|FASE   →   *
```

Una clave **presente gana aunque valga `null`**, y ese null significa *este
tramo no lleva zonas*. Sin esa distinción, apagar la tabla en playoffs sería
imposible: el comodín la volvería a encender. Por eso el lookup usa
`hasOwnProperty` y no un chequeo de truthy.

### Tonos · vocabulario CERRADO, no hex sueltos

Una zona declara un **tono**, no un color. Misma decisión que `scoutTono()` y
por los mismos dos motivos: un hex no sobrevive al aplanado del papel, y no
garantiza contraste — lo que se lee sobre `#1F2937` no se lee sobre `#f1f5f9`.

| tono | pantalla | /#1F2937 | papel | /#f1f5f9 | /#ffffff |
|---|---|---|---|---|---|
| `exito` | `#4ade80` | 8,42 | `#15803d` | 4,58 | 5,02 |
| `positivo` | `#5eead4` | 9,92 | `#0f766e` | 5,00 | 5,47 |
| `aviso` | `#fbbf24` | 8,79 | `#8a5206` | 5,83 | 6,38 |
| `peligro` | `#f87171` | 5,31 | `#b91c1c` | 5,91 | 6,47 |
| `neutro` | `#94a3b8` | 5,72 | `#475569` | 6,92 | 7,58 |

Los diez pasan AA y hay un test que **los recalcula con la misma función que el
panel usa para los acentos** (`CLUB.contraste`, cargada en un `vm`): un tono
validado con otra fórmula no prueba nada sobre lo que el DT ve.

El ámbar del papel es `#8a5206` y no el `#a16207` obvio porque ese daba
**4,49**: dos centésimas por debajo. Un tono *casi* AA es un tono que no cumple.

**Los tonos NO dependen del club**, y eso es la propiedad, no un descuido: un
descenso no cambia de significado por cambiar de cliente. El acento de marca
sigue siendo otra cosa.

Las clases (`.zona-exito`…) van **a mano en el `<style>`**: la tabla la inyecta
un nodo dinámico y el scan de Tailwind es estático (punto 5 bis). En
`@media print` el tono **cambia al valor oscuro**, no se atenúa, y el
`!important` del color es obligatorio porque el aplanado hace
`body * { color: #111 !important }`.

### `.bg-accent` · el acento del club NO se pinta crudo como fondo

`.bg-accent` no llevaba `!important` (a diferencia de `.text-accent`), así que
**el dorado del tema le ganaba al acento del club** y los tres clientes tenían
la pestaña activa del mismo color — justo lo que el acento por club venía a
evitar.

Pero el arreglo **no es pintar `var(--acento)`**. Encima va texto oscuro
(`text-base`, `#0B1121`), y medido contra la marca cruda:

| club | marca | contraste del texto encima |
|---|---|---|
| Reconquista | `#f7941e` | 8,25 ✓ |
| Jujuy | `#2563eb` | **3,64** ✗ |
| DEPORTIVO | `#09086E` | **1,14** invisible |

O sea que `var(--acento)` dejaría la pestaña activa de DEPORTIVO ilegible.
Entra un token propio, **`--acento-fondo`**, que `sgadd-club.js` aclara hasta
que el texto de encima pase 4,5.

**No es un alias de `--acento-texto`**: se mide contra otro fondo y los valores
ya se separan hoy — Jujuy `#467aee` contra `#6692f1`, DEPORTIVO `#7877af`
contra `#9090be`. *"Se lee sobre la card oscura"* y *"deja leer texto oscuro
encima"* son dos preguntas distintas.

### Lo que valida el Diagnóstico

Bloque **0b · Formato de competencia**, y **no se pinta si el club no declara
el bloque**: una card diciendo "no hay nada configurado" en los dos clientes
que no lo usan es ruido permanente, y un Diagnóstico que avisa siempre se deja
de leer.

- **Descuadre de `equiposEsperados` → ERROR**, no aviso. Corre las zonas de
  puesto: con 12 declarados y 13 reales el que creías que descendía se salva, y
  la tabla se ve perfecta. No hay síntoma que lo delate.
- Zona que no alcanza ningún puesto → aviso (está declarada y no se ve).
- Formato que ningún tramo usa → aviso (config muerta: se edita creyendo que
  hace algo).
- Tramo que apunta a un formato inexistente → error (es un typo en el JSON).

**La leyenda se calcula sobre los equipos REALES**, no sobre los declarados: es
la única forma de que el DT vea dónde caen los cortes de verdad y no dónde
deberían caer.

---

## 16. Sección CLASIFICACIÓN · `sgadd-clasificacion.js`

La tabla de posiciones, con las zonas que declara el punto 15. Motor puro
(`SGADD_CLASIF`) más la UI, como el resto del proyecto.

Ruta: `#/<planilla>/<torneo>/<fase>/clasificacion`.

### Colapsó DOS funciones que hacían lo mismo

Vivían en la capa de datos vieja del `index.html`:

| | Qué calculaba | Zonas |
|---|---|---|
| `renderStandingsTable(limit)` | PJ/PG/PP/PCT/DIF y promedios | sí, **hardcodeadas** |
| `renderFullStandingsTable()` | lo mismo **+** el desglose local/visitante | no |

Cada una recorría `Base Datos E` por su cuenta y a su manera, y Principal
las mostraba a las dos, una debajo de la otra. Las zonas eran esto:

```js
if (pos <= 8) '!border-green-500';
else if (pos <= 10) '!border-yellow-500';
else '!border-red-500';
```

Ocho a playoffs para todos los clientes, todas las categorías y todos los
torneos, con colores crudos de Tailwind que además no sobreviven al papel.

Ahora hay **un solo componente** (`clasifTablaHTML`) con dos juegos de
columnas —`completa` y `resumida`— y esa era la única diferencia real que
justificaba tener dos funciones enteras.

### No recalcula nada que el índice ya tenga

`e.record` trae el récord, `e.totales` los puntos a favor y en contra y
`e.split` el desglose de local y visitante. Las dos funciones viejas
rehacían esas tres sumas a mano sobre la hoja cruda. Y como sale del
índice, la tabla queda **scopeada al tramo** sin hacer nada: antes leía de
`sheet('baseDatosE')`, que es la capa vieja.

### El desempate ahora existe

Las dos ordenaban **solo por `pct`**, así que dos equipos empatados
quedaban en el orden en que `Object.keys` los devolvía — o sea que podían
intercambiarse entre repintados sin que cambiara un solo dato. Con un
torneo que define descenso por posición eso no es cosmético.

`ordenTabla` del punto 15 declara la cascada (`PCT › DIF › PF` por
defecto) y **el último criterio es siempre el nombre**: alfabético es
arbitrario, pero es estable y auditable, que es justo lo que hace falta
cuando dos equipos empatan en todo.

`PC` es el único criterio invertido: recibir menos puntos es mejor.

### Principal resume, no duplica

Conserva su tabla resumida pero **usa el mismo componente**, así que las
dos superficies no se pueden contradecir. Su contenedor tiene `id`
(`#principalClasif`) para que `onCambio` repinte **solo eso**: Principal
vive en la capa vieja y su gráfico de ORTG/DRTG ya colgó la página una vez
con un ciclo de repintado (punto 6), así que no se repinta entero.

### Sin config la tabla sale igual

Reconquista y Jujuy no declaran `competencia`: su tabla se pinta completa
y sin colores, con un aviso que dice dónde se configura. Es la regla del
punto 6 — la config es opcional y su ausencia no puede dejar la pantalla
vacía. Verificado en el navegador con los tres clubes: DEPORTIVO 12 filas
y 12 con zona, Jujuy 17 filas sin zona, Reconquista 12 sin zona.

### El escudo va en la celda del NOMBRE, no en una columna propia

Entre el puesto y el nombre. Una columna más empuja la tabla a lo ancho y
en celular ya scrollea; así el escudo viaja pegado al nombre y la cantidad
de columnas no cambia.

**Sin escudo resuelto van las INICIALES**, y salen de `LOGOS.iniciales()`,
no de una fórmula propia: es la misma insignia que ya usan el scouting, el
scatter de Principal y los cuatro PDF, y dos implementaciones terminan
dando insignias distintas para el mismo club.

Los escudos llegan **después** del primer pintado —`getUrl()` devuelve
`null` hasta que el manifiesto baja— y eso no hace falta manejarlo acá: el
hook global `registrarRepintadoPorLogos()` repinta la sección cuando entra
alguno nuevo. Es el mismo camino que ya usan las demás.

### LA BARRA DE ZONA SE PERDÍA EN CELULAR · y no era el color, era la PROPIEDAD

Medido a 375px: la fila salía con su clase `zona-exito` correcta y el
`--zona` resuelto en `#4ade80`… y en pantalla no se veía nada.

La barra del puesto se pinta con `box-shadow: inset` sobre el
`td:first-child` (va en el `<td>` y no en el `<tr>` por el motivo del punto
14: el fondo de la celda tapa el de la fila). La **columna fija de**
**celular** usa `box-shadow` TAMBIÉN, para su separador:

```css
@media screen and (max-width: 767px) {
  .scrollbox table td:first-child { box-shadow: 1px 0 0 #282828; }  /* ← pisa */
}
```

Misma propiedad, regla posterior en el documento: la pisaba entera. En
escritorio la media query no se activa, **y por eso el bug se veía SOLO en**
**el teléfono** — que es donde el DT mira la tabla.

Se arregla **combinando las dos sombras**, no eligiendo una: la barra de
zona adentro, el separador afuera. La regla de escritorio queda intacta —
esto agrega, no reemplaza— y hay tests que fijan las tres cosas.

Es la misma familia de trampa que el punto 7.4 bis: una afordancia de
celular pisando algo que no tiene nada que ver con el celular.

### Sumar una sección cambia cómo se leen los links VIEJOS

`Ruta.parse()` distingue `#/<planilla>/<fase>/<seccion>` de
`#/<planilla>/<torneo>/<fase>/<seccion>` preguntando si `partes[3]` es una
sección conocida. Ese **vocabulario cerrado es lo único** que los separa,
así que agregar un nombre a `SGADD.SECCIONES` toca la retrocompatibilidad
de los favoritos del cuerpo técnico.

Es seguro mientras ninguna FASE se llame igual que una sección, y hay un
test que lo verifica contra `SGADD.FASES` — si alguna vez existiera una
fase `CLASIFICACION`, `#/p/CLASIFICACION/equipos` se leería como formato
nuevo y la ruta saldría mal.

---

## 17. Pantalla de CONFIGURACIÓN · `sgadd-configui.js`

Donde el cuerpo técnico ve y edita las reglas del punto 15: cuántos
clasifican, cuántos van a reclasificación, cuántos descienden y con qué
tono se pinta cada zona.

Motor puro en `sgadd-config.js`, todo lo que toca `document` acá. La
dependencia va en un solo sentido, igual que `sgadd-estados.js` /
`sgadd-buzon.js`.

### Guardar NO le cambia nada a nadie más, y la pantalla lo dice

El panel es estático: no hay backend al que escribirle. Lo que se guarda
va a `localStorage` (`sgadd.config.<club>`) y vive **solo en el navegador
de quien editó**. El botón **Exportar** da el bloque listo para pegar en
`clubes/<club>.json`, que es lo que hace que el cambio le llegue al resto.

Fingir que "Guardar" persiste para todos sería mentir, y un DT que cambia
el corte de descenso creyendo que lo cambió para todo el cuerpo técnico es
peor que uno que no tiene la pantalla. Por eso el aviso va arriba de todo.

**El override es POR CLUB, no por planilla** (a diferencia de los estados
de jugador): el formato ya lo distingue `porTramo` adentro del bloque.

### `resolver()` es el único punto de entrada, y ese fue el bug

`clasifFormatoVigente()` llamaba a `SGADD_CONFIG.parsear()` directo y **se
comía el override**: el DT bajaba playoffs de 8 a 4, guardaba, y la tabla
seguía pintando 8 sin ningún síntoma. Medido en el navegador antes del
fix — los puestos 5 y 6 seguían en verde de playoffs después de guardar.

`SGADD_CONFIG.resolver(jsonClub, torneo, fase)` toma el club activo,
resuelve override → JSON y devuelve el formato del tramo. **Todas** las
pantallas pasan por ahí, y hay un test que falla si aparece un `parsear()`
suelto en un consumidor.

`clubActivo()` también vive en el motor: con dos formas de deducir el id
del club, una lee el override de otro. Y ojo con la propiedad —
`CLUB.estado.id`, no `CLUB.ID` ni `CLUB.id`— que es el bug del punto 13.

### El reemplazo es ENTERO, no un merge

El override pisa la config del JSON completa. Fusionar zonas de dos
orígenes daría cascadas que ninguno de los dos declaró, y la cascada es
justamente lo que decide qué zona gana: el resultado no se podría auditar
contra ninguna de las dos fuentes.

Un override corrupto o vacío **se ignora y se cae al JSON**, no deja al
panel sin config.

### `hasta` se exporta OMITIDO cuando no se declaró

Reponerlo resuelto congelaría el corte a la cantidad de equipos de hoy y
el `-2` dejaría de correrse solo — que es el motivo entero de los índices
negativos. Hay un test de ida y vuelta: exportar, volver a parsear y
verificar que con 14 equipos el descenso sigue cayendo en 13-14.

### La vista previa es la TABLA DE VERDAD

Usa el mismo `clasifTablaHTML()` que pinta la sección Clasificación, no
una maqueta. Una preview que no es el componente real miente en cuanto uno
de los dos cambie, y este es justo el lugar donde el DT confía en lo que
ve antes de guardar.

### Tipear no repinta la pantalla

`configZonaCampo()` escribe el borrador y refresca **solo** la vista
previa y la validación. Un repintado por tecla le saca el foco al input y
hace imposible escribir un nombre — es la misma regla que ya cumplen
`scoutMeta()` (punto 9) y el buscador del buzón (punto 13). Los `select` y
los botones sí repintan: ahí no se está tipeando.

El borrador es una **copia profunda**: editar no puede tocar lo que el
resto de la app está usando hasta que se guarde.

### El rango resuelto se muestra al lado de cada zona

Un `-2` abstracto se ve como **11–12** con los equipos de hoy, y una zona
que no alcanza ningún puesto sale en rojo con una cruz. Es lo que deja ver
el choque de cascada **antes** de guardar — el caso de 10 equipos donde
Reclasificación se come al Descenso (punto 15).

### Los tramos son de SOLO LECTURA

Salen de `combinacionesTorneoFase()`, la misma fuente que la barra. La
estructura sale del dato y acá no se declara: si esta pantalla armara la
lista por otro camino, podría ofrecer un tramo que el selector no tiene.

### Guardar y restablecer reindexan

`SGADD_APP.reindexar()` dispara `onCambio`, que repinta Clasificación y el
resumen de Principal. Sin eso el DT guarda, va a la tabla y ve el corte
viejo.

Verificado en el navegador con los tres clubes: DEPORTIVO abre desde su
JSON con 4 zonas y las tres variantes de acento en AA; Jujuy y Reconquista
abren sin configurar, con un formato vacío para empezar a escribir y la
validación diciendo que la tabla sale sin colores.

---

## 18. Preconfiguración, calendario y certificación

Hasta el punto 15 la regla era dura: **la estructura sale del dato**. Sigue
valiendo — el dato nunca deja de mandar. Lo que se suma es poder declarar
la estructura **antes de que el dato exista**, que es otra cosa:

```
PROYECCIÓN   lo que el cliente dijo en la entrevista
REALIDAD     lo que el libro trae hoy
CERTIFICADO  la fecha en que las dos coincidieron
```

Una proyección **no es una segunda fuente de verdad**: es una hipótesis
fechada contra la cual contrastar. Si divergen gana el libro y el panel lo
dice, nunca al revés.

Motor puro en `sgadd-config.js`; la pantalla en `sgadd-configui.js` (pestaña
*Torneo*) y el semáforo en el bloque **0c** del Diagnóstico.

### Cero nombres asumidos

`categorias` es un **mapa indexado por el id que use el cliente** y los
tramos de cada una son una lista con ids libres. "Primera División",
"Formativas U17", "Súper 8", "Conferencia Sur" entran igual que "Ida".

El fixture de `test-config.js` usa a propósito nombres que no son ninguno
de los del proyecto, justamente para que un hardcodeo falle. Y hay un test
que **falla si la UI ofrece un desplegable** con nombres preconcebidos: si
la pantalla listara "Ida / Vuelta / Apertura" volvería a meter por la
interfaz el hardcodeo que el schema evita.

### EL VÍNCULO SE DECLARA, NO SE ADIVINA

Es el punto que hay que entender antes de tocar nada de esto.

La entrevista declara ids **libres**. El libro produce una clave que no se
negocia: **`TORNEO|FASE`**, la misma que arma `combinacionesTorneoFase()`.
Son dos vocabularios distintos y hay que unirlos para poder auditar.

Se unen con un campo **explícito** —`clave`— y **NO** emparejando por
parecido de nombre. Una vinculación equivocada certificaría el tramo
equivocado y **no se notaría**, que es peor que no certificar nada.
`sugerirClave()` existe para PROPONERLE una al administrador y devuelve
`null` si hay más de una candidata o ninguna.

### El bloque

```json
"preconfiguracion": {
  "cliente": "Deportivo La Plata",
  "declaradoEl": "2026-08-26",
  "declaradoPor": "Entrevista inicial",
  "categorias": {
    "primera-2026": {
      "label": "Primera 2026",
      "planilla": "deportivo-primera-2026",
      "tramos": [
        { "id": "ida", "label": "Ida", "clave": "IDA|REGULAR",
          "equiposEsperados": 12, "fechasEsperadas": 11,
          "ventanaTemporal": { "desde": "2026-05-01", "hasta": "2026-07-25" } }
      ],
      "competencia": { "…": "el bloque del punto 15, por categoría" },
      "certificacion": {
        "ida": { "fecha": "2026-08-26", "equipos": 12, "partidos": 64, "hash": "3bb12777" }
      }
    }
  }
}
```

**Todo opcional y el fallback siempre seguro**, igual que `competencia`.
Reconquista y Jujuy no declaran `preconfiguracion` y hay tests que fijan
que eso siga
siendo válido.

### `preconfiguracion` y NO `torneo` · la colisión que costó una pantalla

El JSON del club **ya tenía** un campo `torneo`: un string con el nombre
del torneo (`"TORNEO LOCAL"`, `"CONFERENCIA NORTE"`) que baja a cada
planilla del catálogo (`CATALOGO.planillas[].torneo`, lo arma
`sgadd-club.js`). El bloque de preconfiguración se bautizó con esa misma
clave y el resultado fue de manual:

- en `deportivo.json` quedaron **dos claves `torneo`** en el mismo objeto,
  el string y el bloque. Gana la última, así que **el nombre del torneo
  desapareció del catálogo sin que nadie lo notara**;
- en Reconquista y Jujuy, que solo tienen el string, la pestaña reventaba
  con `Cannot convert undefined or null to object` al pedirle
  `.categorias` a un texto — **muerta justo en los clubes que más la
  necesitan**, los que todavía no configuraron nada.

Se renombró en vez de hacerlas convivir: dos cosas distintas con el mismo
nombre en el mismo objeto es un bug esperando. Y **la guarda de tipo se
quedó igual**, porque cierra la clase entera y no solo este caso: un
`preconfiguracion` que no sea un objeto —un string, un array, `{}`—
devuelve `null` y el panel se comporta como si no hubiera bloque.

**El test no se conforma con leer el fuente: RENDERIZA la pestaña** en un
`vm` con `document` y `localStorage` de mentira, y falla si tira. Un grep
sobre el código no habría cazado esto nunca — la clave estaba bien escrita
en los dos lados.

### El estado vacío siembra el VÍNCULO, no los nombres

Sin categorías la pestaña no muestra una lista en blanco sino un cierre
con su acción (*Agregar primera categoría*), que es la regla de empty
states del punto 14.

Ese primer alta se siembra con la **planilla abierta**: id, label y
`planilla`. No contradice el "cero nombres asumidos" —el id de la planilla
lo escribió el propio club en su catálogo, y es justo el dato que ata la
categoría a su libro—. Lo que **no** se siembra es un solo tramo ni una
`clave`: ahí proponer sería inventar. Sin planilla abierta el vínculo
queda vacío, misma regla que `sugerirClave()`.

La `competencia` anidada usa **el mismo parser del punto 15**, no uno
paralelo: cada categoría puede tener su propio formato de zonas sin
duplicar nada.

### El semáforo

| | Estado | Cuándo |
|---|---|---|
| 🔵 | `PROYECTADO` | Declarado, sin datos todavía |
| 🟡 | `EN_CURSO` | Hay datos y encajan con lo declarado |
| 🟡 | `DESVIO_CALENDARIO` | Encajan, pero alguna fecha cae fuera de la ventana |
| 🟢 | `CERTIFICADO` | Se selló y el libro sigue igual |
| 🔴 | `DIVERGENTE` | No encaja, o **el libro cambió después del sello** |
| ⚪ | `SIN_VINCULO` | Declarado, sin `clave` que lo ate al libro |

**El semáforo de la UI se compara contra las claves del MOTOR**, no contra
una lista fija. Un estado nuevo en `auditar()` que la UI no sepa pintar no
se vería jamás — ya pasó al sumar `DESVIO_CALENDARIO`, y lo cazó ese test.

### La huella va sobre los IDS de partido

Ahí está el valor real de la auditoría, y por eso no es un contador.

Lo que hay que detectar es que **el libro cambió DESPUÉS de darlo por
bueno**: un partido agregado, borrado o con la fecha corregida. Los valores
de un box score pueden ajustarse sin que el torneo deje de ser el mismo; el
conjunto de partidos, no. Un contador de totales no caza el caso silencioso
—mismos totales, otros partidos— y hay un test que lo fabrica exactamente
así.

Es FNV-1a de 32 bits: no hace falta criptografía, solo que el hash cambie
cuando cambia el conjunto y que dé lo mismo en Node y en el navegador.

**Un tramo SELLADO no se re-juzga contra la proyección**, se juzga contra su
propia huella. Que la entrevista dijera 12 equipos y el torneo cerrara con
8 es historia; que aparezca un partido nuevo en un torneo cerrado es un
problema hoy.

### El sello va al JSON, no a `localStorage`

Certificar es un **hito administrativo** que el resto del cuerpo técnico
tiene que ver, y el historial de git es exactamente la trazabilidad que
pide una auditoría. Por eso `diagCertificar()` **no escribe solo**: deja el
bloque listo para pegar y commitear.

El botón solo aparece con el tramo **completo y sin sello**: certificar a
mitad de camino sella una foto que va a cambiar mañana.

> **Nota sobre el sello de Ida.** Se certificó el 2026-08-26 con **64**
> partidos cuando el tramo declara 11 fechas, o sea **66**. La huella
> congeló un libro incompleto a pedido del club, así que cuando entren los
> 2 que faltan el semáforo va a pasar a `DIVERGENTE` — y va a tener razón.
> Queda por decidir si esos partidos faltan de verdad o si la declaración
> de 11 fechas no es la correcta.

### Ventana temporal · el calendario como red de contención

Los box scores llegan con la etiqueta de torneo incompleta o mal tipeada
más seguido de lo que uno querría, sobre todo en formativas. Sin nada que
los atrape esos partidos quedan huérfanos: el índice los deja pasar (una
fila sin torneo pasa siempre, punto 3 ter) pero nadie sabe a qué tramo
pertenecen.

`asociarTramoPorFecha()` los resuelve por fecha, con **dos reglas que no se
negocian** y que tienen su test cada una:

1. **LA ETIQUETA GANA SIEMPRE.** Si la fila trae torneo se respeta aunque
   la fecha caiga en otra ventana. El calendario es un RESPALDO para lo que
   no viene etiquetado, no una corrección de lo que sí viene: pisar un dato
   explícito con una inferencia es lo que este proyecto no hace.
2. **UNA FECHA EN DOS VENTANAS NO SE ASOCIA.** Si dos tramos se superponen
   la respuesta correcta es *"no sé"*, no *"el primero"*: un partido mal
   atribuido contamina los promedios de DOS tramos a la vez y no se nota.
   Se devuelven los candidatos para poder arreglar el calendario.

Un tramo **sin ventana propia hereda la de la categoría**, que suele ser la
temporada entera. Sin fechas por ningún lado queda en `null` y el
calendario simplemente no participa: nunca se inventa una.

Las ventanas de DEPORTIVO **salen del libro, no de la imaginación**: el
primer partido de Ida es del 07/05 y el último del 16/07, Vuelta arrancó el
06/08. Hay tests que verifican que las ventanas declaradas contienen esos
partidos reales y que **no se superponen**.

### Un libro por categoría, y el hueco que eso abre

**Cada categoría de un club es un Sheet aparte**, con su propio `sheetId`.
Reconquista tiene tres. Se dan de alta de a una, a medida que el club
decide sumarlas — ver la hoja de ruta.

Eso deja un caso que no se ve solo: una planilla nueva entra al catálogo,
el DT la elige en el selector y **funciona**… pero nadie declaró su torneo,
así que no tiene calendario, ni zonas, ni auditoría. **No falla**:
simplemente no hay nada que contrastar, y el Diagnóstico se quedaba callado
justo ahí. Callarse es lo peor que puede hacer una auditoría.

`cobertura()` cruza el catálogo contra lo declarado y reporta **los dos
sentidos, porque son dos errores distintos**:

| | Qué significa |
|---|---|
| `sinDeclarar` | El libro está conectado y nadie preconfiguró su torneo |
| `sinLibro` | Se declaró una categoría para una planilla que **no está en el catálogo**: un id mal escrito, o un alta declarada antes de conectar la hoja |

Una planilla **sin `sheetId` no se reclama**: está en el catálogo como
"viene en camino" y pedirle preconfiguración sería ruido.

La card del bloque 0c **aparece aunque la planilla abierta no esté
declarada**, para poder mostrar el hueco. Un club que NO usa la
preconfiguración sigue sin ver nada: eso es config opcional.

### El aislamiento entre categorías, fijado con tests

```
✓ cada categoría trae SOLO sus tramos
✓ y ninguno de la otra
✓ un sello de una categoría no aparece en la otra
✓ las zonas de una categoría no alcanzan a la otra
```

No hay estado compartido porque no hay dónde compartirlo: el índice se
construye por planilla, y la proyección, los sellos y las zonas viven
adentro de su categoría. El calendario de Primera no puede pisar al de las
formativas porque `asociarTramoPorFecha()` recibe **los tramos de una
categoría**, no los del club.

### Las tres acciones de la pantalla, explicadas EN la pantalla

No solo en un tooltip. Hacen cosas distintas y la diferencia importa: un DT
que las confunda cree que publicó algo que no publicó.

| Acción | Qué hace de verdad |
|---|---|
| **Guardar en este navegador** | Queda en `localStorage`, solo en ese dispositivo. Nadie más lo ve |
| **Exportar el bloque JSON** | Copia el objeto limpio, listo para pegar en `clubes/<club>.json` y commitear. **Recién ahí le llega al resto** |
| **Volver al JSON del club** | Descarta el borrador local y restablece la config oficial |

El borrador del torneo es **independiente** del de zonas: son dos bloques
distintos del JSON y mezclarlos obligaría a commitear los dos para publicar
uno.

---

## 44. PARTIDOS SIN ESTADÍSTICAS · la carga manual

Cuando GES no publica el box score, el partido existió igual: cuenta para
la tabla y no puede faltar. Pero **no puede entrar por donde entran los
demás**.

### Por qué NO van al índice

`construirIndice()` alimenta todo: eFG%, PACE, percentiles, bandas z,
arquetipos, el grupo de pares. Un partido del que solo se sabe el marcador
metido ahí daría un equipo con **más PJ y los mismos totales de tiro** —o
sea eFG% y PACE diluidos— y jugadores con menos minutos por partido sin
haber faltado a ninguno. Números plausibles y falsos.

Viven aparte, en `catalogo[club].partidosManuales[<categoría>][<TORNEO|FASE>]`,
y se fusionan **solo** en `SGADD_CLASIF.tabla()`. Tocan exactamente PJ, PG,
PP, PF, PC y el split local/visitante — de donde salen PCT, DIF y los
puntos de tabla. Nada más.

El grueso de `test-manuales.js` no verifica lo que el partido manual HACE
sino **lo que no toca**: que la fila de la tabla no lleve ninguna métrica
avanzada, que el motor no las nombre, y que 20 partidos cargados sigan sin
mover una tasa.

### Las reglas

- **El scope es categoría + TRAMO.** Sin el tramo, un partido de la IDA
  contaría en la VUELTA. Es la misma clave `TORNEO|FASE` del selector, y
  el servidor escribe **un solo slot** — la garantía no depende de que la
  pantalla mande bien el pedido (punto 32).
- **Un empate se rechaza.** En básquet no existe, y dejarlo pasar daría un
  partido que no suma ni a ganados ni a perdidos: PJ dejaría de ser PG+PP
  sin que nadie se entere.
- **Lo derivado se recalcula, nunca se acumula.** PCT y DIF se rehacen
  después de sumar.
- **Un equipo que SOLO tiene partidos manuales entra a la tabla.** Si no,
  desaparece del torneo por no tener box score.
- **Se guarda solo el modelo**, no el objeto que manda el cliente: el
  catálogo se sirve a todos.

### Los puntos de tabla son OPT-IN

`PTS` (2 por ganado, 1 por perdido) entra como criterio de `ordenTabla` y
la fila lo trae calculado, pero **el orden por defecto sigue siendo
`PCT · DIF · PF`**: meterlo en la cascada reordenaría la tabla de los tres
clientes sin que nadie lo pidiera. Un club lo usa declarando
`ordenTabla: ["PTS", …]`.

### El botón que no hacía nada · un campo del modal con la forma equivocada

`configManualesPublicar()` le pasaba al modal de confirmación una lista de
**strings** por el campo `zonas`, que espera objetos `{label, zonas:[…]}`.
`bloqueZonas()` reventaba con «cannot read length of undefined» **adentro
de `abrir()`**, así que el modal no se pintaba, la petición nunca salía y
el botón no hacía absolutamente nada — sin dejar un error visible.

El campo correcto es `cambios`, que es un antes→después. Y de paso es más
útil: ahora el modal enumera el diff real contra lo que YA está publicado
en ese tramo (`configManualesDiff`), en vez de un cartel con el total.

**El test que había no lo cazaba porque leía el fuente.** La línea se leía
perfecta. Hay que EJERCER el modal —`abrir()` y `html()` en un `vm` con un
DOM mínimo— que es lo que hace ahora `test-manuales.js`.

### El selector de fase · elige el TRAMO destino, no un campo aparte

El formulario tiene un desplegable de fase que sale de
`combinacionesTorneoFase()` —la misma fuente que la barra— y **excluye el
sintético `*TOTAL*`**: no es un tramo donde se juegue, y un partido
cargado ahí se contaría dos veces o ninguna.

Elegir una fase **no mueve el selector principal**: antes, para cargar un
partido de la VUELTA había que ir a mover la barra, volver, y acordarse de
que la moviste.

**NO se agregó un campo `fase` por partido que venga del cliente.** El
registro ya vive bajo la clave `TORNEO|FASE`, así que aceptar además un
campo del pedido daría DOS fuentes de verdad para el mismo hecho: un
partido guardado en `IDA|REGULAR` que dijera `fase: "VUELTA"` no se podría
auditar contra nada, y la tabla lo contaría en IDA mientras la ficha diría
VUELTA. Es el bug del `sheetId` en dos lados y del rol funcional en dos
módulos, otra vez.

Quedan **registrados igual** —el pedido lo pedía— pero los escribe el
SERVIDOR derivándolos de la clave, así que no pueden divergir: lo que
mande el cliente en `torneo` y `fase` se ignora. Hay un test que manda
`fase: "VUELTA"` sobre el tramo `IDA|REGULAR` y exige que se guarde
`REGULAR`.

Y el filtrado sigue siendo por la CLAVE, no por ese campo:
`manualesDelTramo()` toma solo los del tramo abierto en la barra.

### El PJ que se MUESTRA es el de la tabla, en toda la app

Reportado el 2026-09-11: un equipo con **7 PJ en la tabla de posiciones
mostraba 6 en su tarjeta de Equipos**. La tabla suma los partidos
manuales (`tabla` → `fusionarManuales`) y la tarjeta leía el `pj` del
índice, que solo cuenta los partidos con box score. Y el banner de la
ficha, que este punto daba por puesto, no lo llamaba nadie.

**El `pj` del índice NO se toca**: es la muestra de los promedios, del PJ
mediano y de la muestra suficiente (punto 4), y es justo lo que este
punto protege. Lo que se unificó es lo que se MUESTRA como partidos
jugados, y sale de la MISMA fusión que la tabla:

- `SGADD_CLASIF.filasPorEquipo(idx, manuales)` — las filas de la tabla,
  por equipo. `clasifFilasVigentes(idx)` y `clasifFilaDe(idx, clave)` le
  pasan los manuales del tramo abierto.
- `SGADD_CLASIF.conPjDeTabla(lista, mapa)` — COPIAS de la lista con
  `pjTabla` y `manuales` al lado; el `pj` sigue siendo el del índice.
  `teamPicker` pinta `pjTabla` si viene, con el `⚠`.
- `SGADD_CLASIF.condicionConManuales(split, fila)` — el récord de local y
  visitante como las columnas PG L / PP L de la tabla. Los puntos del
  split son totales, así que los del manual se suman sin mezclar escalas.

Lo usan las tarjetas de Equipos y de Jugadores (es el mismo
`teamPicker`), el encabezado de la ficha (`16 PJ · 9-7`, con el banner),
la pestaña Local/Visitante y la columna PJ de los rankings, que lleva un
`data-glosa` diciendo que sus promedios salen solo de los partidos con
estadísticas. **Lo que decide quién entra al ranking y sobre cuántos
partidos se promedia sigue siendo el `pj` del índice.**

El Diagnóstico sigue mostrando el PJ del libro: audita el libro, y los
manuales no están en él.

La RACHA del encabezado sigue saliendo de los partidos con box score: un
partido manual todavía no la corta.

### El badge

Chip amarillo con `⚠` —ningún estado se comunica solo con color (punto
14)— y el desglose en el `title`, que también se lee con teclado y en
papel, donde no hay hover. Contraste medido con `CLUB.contraste`: **6,38**
el texto sobre el chip, **17,15** el chip sobre la card, **8,07** en papel.

El CSS va **a mano en el `<style>`** y con su regla de `@media print`: son
nodos inyectados (punto 12) y sin la regla de papel el aplanado
(`body * { color: #111 !important }`) se lo come.

> **Ojo al insertar CSS en `index.html` con un script.** `s.index('<style>')`
> matchea primero la MENCIÓN dentro del comentario de la cabecera, no la
> etiqueta real: el bloque quedó inerte adentro del comentario y encima lo
> partió. Hay que anclar a `
<style>
`.

---

## 67. TORNEOS SIN CLIENTE Y ESTRUCTURA MULTIZONA (2026-09-25)

Pedido: dar de alta torneos completos en el Panel Master independientes de
los clientes —la **Zona C de La Plata** entera, para tener las métricas de
todos sus equipos antes de los cruces interzonales— y la **Liga Argentina
2026-27** con sus dos conferencias, con Jujuy mapeado a la suya sin que el
motor quede restringido a su equipo. `test-torneos.js` fija todo lo de acá.

### Las decisiones (consultadas antes de escribir)

- **Un torneo es una entrada del catálogo `tipo: 'torneo'`**, no una clave
  aparte: reusa `resolver`, el guard de datos, el índice, el selector del
  admin, `libroDe` y el alcance «libro». Sin plan, sin accesos, sin ficha.
- **Cada ZONA es una categoría con su propio libro.** Es lo que hace
  multizona al panel sin tocar el núcleo: el índice se arma sobre el libro
  de UNA conferencia con TODOS sus equipos, así que la tabla y los
  percentiles son los de la conferencia y no los del cliente. El cruce entre
  zonas (cuartos en adelante) llega cuando exista ese libro.
- **El id de un equipo es el `idEquipo` de Gesdeportiva**
  (`/equipo/<idClub>/<idEquipo>/`); la lectura del libro sigue por
  `claveEquipo()`. Donde no hay id (dos equipos que el sitio todavía no
  lista, y la Zona C, que no sale de Gesdeportiva) manda la clave.

### Las conferencias NO se tomaron del resumen de la página

La nota del fixture (52871) no dice qué equipo va en qué conferencia, y el
resumen automático de la página **inventó una asignación**. Se infirió del
propio calendario —todo partido es intra-conferencia, así que el grafo de
cruces se parte solo en dos— y se confirmó al 100 % contra la nota de
equipos (52708). Barrio Jardín, que no juega las dos primeras semanas, iba a
la Norte por descarte y la nota lo confirma. Unión de Santa Fe y Racing
juegan y el sitio todavía no los lista: van sin id y marcados `provisorio`.

**El fixture completo no está publicado**: el endpoint que usa el scraper de
`motorstats-ingestion` devuelve «No se encontraron partidos» para cualquier
rango. El archivo trae los 41 partidos anunciados, con `parcial: true`, y se
regenera con el scraper cuando el sitio los cargue. Hay un test que exige
que cada partido anunciado sea de dos equipos de la misma zona.

### Cómo se escribe · y el sheetId NUNCA va al repo

```
node server/bin/catalogo.js torneo   --archivo torneos/<id>.json --libro "<zona>=<sheetId>" [--probar]
node server/bin/catalogo.js vincular --club jujuy --categoria jujuy-lab-2026-27 \
                                     --torneo liga-argentina-2026-27 --zona norte
```

`torneos/<id>.json` es público (equipos, zonas, formato, marca); el libro de
cada zona entra por `--libro` o por el Panel Master. Hay un test que falla si
un archivo de torneo trae algo con forma de sheetId.

### Las reglas del motor (`server/lib/torneos.js`)

- **Un equipo está en UNA zona**: una clave o un id repetidos entre zonas se
  rechazan, en vez de quedarse con el primero.
- **La zona sin libro es válida**: la Liga Argentina se declaró antes de que
  MotorStats escriba nada. Va al selector como «sin datos».
- **Editar sin mandar libro NO desconecta la zona.**
- **La PROPAGACIÓN**: cuando una zona estrena libro, se lo copia a los
  clientes enganchados (`torneo` + `zona`) con la herencia de zonas y
  partidos manuales de `heredarDelLibro`. Se copia al ESCRIBIR, como
  `libroDe`, así ninguna lectura del servidor tuvo que cambiar.
- **Enganchar exige que el equipo sea de ESA zona**: engancharlo a la otra
  se rechaza diciendo en cuál juega. Se elige por id, clave o alias.
- **Un alta por `libroDe` de una zona deja el enganche declarado**, así que
  también recibe la propagación.
- **Las zonas de tabla salen del formato** (1-4 directos a octavos, 5-12
  reclasificación) solo si el torneo no tiene unas publicadas. **Sin
  descenso**: el reglamento 2026-27 no lo publicó y no se inventa. La Zona C
  no declara puestos, así que sale sin colores.
- **Un torneo rechaza las acciones de cliente** (pausar, plan, equipo,
  vencimiento, informes ORO, laboratorio, `alta`) y **el padrón no le da
  accesos**. Una zona con clientes enganchados no se da de baja.
- **El cliente no recibe los torneos** en `/api/v1/catalogo`; el admin sí,
  con zonas, equipos y formato, y sin un sheetId. Una zona no declara plan.
- **Sin equipo propio el patrón es `(?!)`** (`reconciliarConfig`): con el
  patrón por defecto, `/RECONQUISTA/`, la Zona C trataba a RECONQUISTA 'B'
  como propio.

Cada guard se verificó AL REVÉS, revirtiéndolo y contando lo que cae: acciones
de cliente 7, zonas de tabla del formato 4, propagación 3, duplicados 2, y 1
cada uno el equipo de la zona, la baja con enganchados, ocultar al cliente, el
patrón `(?!)`, el enganche por `libroDe` y el guard del padrón.

### Lo que quedó en KV el 2026-09-25

```
zona-c-la-plata-2026     zona-c-primera      CONECTADA · 11 equipos · 20 partidos
liga-argentina-2026-27   lab-2026-27-norte   SIN LIBRO · 17 equipos
                         lab-2026-27-sur     SIN LIBRO · 17 equipos
jujuy                    jujuy-lab-2026-27   SIN LIBRO · enganchada a la Norte · JUJUY BASQUET #112674
```

### Pendiente

- **MotorStats tiene que escribir un libro por conferencia** para 2026-27, y
  se conecta con `catalogo.js torneo … --libro "norte=<id>,sur=<id>"`.
- **Escudos**: faltan 22 de 34 de la Liga Argentina y 6 de 11 de la Zona C
  en `logos/`. El logo vectorial de LAB se pide a ADC (no está en el Drive
  de marca); la paleta ya está en el archivo (`marca`).
- **El reglamento de la Zona C** (clasificación, reclasificación con
  categorías superiores) no está declarado: sin él no hay zonas de tabla.

---

## 68. LA SECCIÓN FIXTURE · lo único que se puede mirar antes del torneo (2026-09-25)

Pedido del club: los partidos del equipo propio del mes en curso, y los del
próximo rival —cómo le fue en el anterior y qué tiene después—. Y que el
panel se pueda navegar entero ANTES de que la competencia empiece, sin
pantallas en blanco ni errores. `test-fixture.js` fija todo lo de acá.

### DOS FUENTES QUE NO SE PISAN

```
CALENDARIO   torneos/<id>.json   lo que se VA a jugar
ÍNDICE       el libro de MotorStats   lo que se JUGÓ
```

Se cruzan por **fecha + los dos equipos** —la misma clave que `idPartido`
(punto 3 quater) pero sin el texto `PARTIDO`, que el calendario no tiene—.

- **EL MARCADOR SALE SIEMPRE DEL ÍNDICE.** El calendario es una declaración
  publicada semanas antes: si un partido se reprograma o se define por
  secretaría, vale lo que MotorStats escribió. Un resultado del calendario
  contradiciendo a la tabla de posiciones es el bug que este proyecto no
  comete.
- **Y AL REVÉS: lo jugado que el calendario no declara se muestra igual.** El
  de LAB es parcial —la liga publicó dos semanas— así que descartarlo dejaría
  la sección mintiendo apenas empiece el torneo.
- **El declarado conserva la hora y la zona**, que el índice no tiene.

### El bug que solo vio el test

`unir()` guardaba la fila del calendario en el mapa y la buscaba con
`indexOf` sobre la lista de COPIAS: siempre daba `-1`, así que el marcador se
escribía en `out[-1]` —o sea en ninguna parte— y un partido jugado seguía
saliendo como «a jugarse». **No se podía ver en pantalla**: hoy ningún torneo
con calendario declarado tiene partidos jugados. El mapa guarda la POSICIÓN.

### Lo que hay que respetar al tocarlo

- **El normalizador es el del NÚCLEO, también desde Node.** Con un respaldo
  propio (`trim().toUpperCase()`), `"C. MARCHIGIANO - MM"` —el nombre del
  libro— y `"C MARCHIGIANO"` —la clave del índice— dejaban de cruzar y la
  sección salía vacía sin que ningún test lo viera. Pasó en la primera
  versión.
- **Las fechas se trabajan como TEXTO.** `new Date('2026-10-15')` es
  medianoche UTC, o sea el 14 a las 21 en Argentina: el partido aparecería un
  día antes en la agenda del DT.
- **Abre en el mes en curso; si está vacío, en el primero que viene.** Antes
  del torneo, septiembre no tiene nada y lo útil es octubre. Se DICE en
  pantalla: un mes que no es el actual sin explicación se lee como que la
  sección se equivocó.
- **Un cruce jugado no se duplica**, y el rival que se anticipa nunca es uno
  mismo (`p.rivalClave !== propio`).
- **Sin equipo propio la sección sirve igual**: muestra el calendario de la
  zona. Es como el admin mira un torneo entero.
- **`fixture` es abierta** (`MODULOS.fixture: null`), como la tabla de
  posiciones: es el calendario publicado de la liga, no un análisis. Sumarla
  a `SECCIONES` toca la lectura de los links viejos (punto 16), y hay un test
  que verifica que ninguna FASE se llame igual.

### LAS FECHAS CON EL AÑO EQUIVOCADO · se denuncian, no se tocan

Medido en el libro de la **Zona C**: dos fechas vienen cargadas como
`27/05/2029` y `29/05/2029` sobre una temporada 2026, y arrastran 5 partidos.

Una temporada abarca a lo sumo dos años seguidos (octubre a abril), así que
se toma el año **más frecuente** y se marca lo que esté a más de uno de
distancia. **No se corrige ni se descarta**: no se puede saber si el año
bueno es el del resto o si ese partido es de otra cosa. Se muestra donde el
libro lo pone, con el aviso arriba, y la corrección va en la planilla.

**Pero los atípicos NO deciden por dónde abre la sección.** Con las dos
fechas en 2029, «el primer mes con actividad después de hoy» era mayo de 2029
y la sección abría justo en lo que está mal cargado.

### EMPTY STATES DE PRETEMPORADA

Medido con un libro de 9 hojas y cero filas: **ninguna sección explotaba ni
quedaba en blanco** —cero errores de JavaScript, verificado con un espía
sobre `window.onerror`—. Lo que estaba mal era el TEXTO: Equipos y Jugadores
saludaban con «PJ mediano 0. Con tan pocos partidos los percentiles no
distinguen una debilidad estructural de un mal día», que describe una muestra
chica y no un torneo que no empezó.

`SGADD_UI.sinDatosTodavia()` es **uno solo** y lo usan los tres:
`avisoMuestra()` de `sgadd-app.js` —que ya compartían Equipos, Jugadores y
Simulador— y la tabla de posiciones. Manda al Fixture, y **solo si la
categoría declara torneo**: ofrecer un botón que lleva a «esta categoría no
está enganchada» sería mandar al DT a otro vacío.

**El Diagnóstico sigue marcando `error · La hoja no tiene filas de datos`**, y
se deja: ese error caza el libro que DEBERÍA tener datos y no los tiene (el
recálculo a medias de la U21, punto 3 ter). Es una pantalla de admin.

### EL CAMPO SE LLAMA `torneoId`, Y NO ES UN CAPRICHO

El JSON del club **ya usa `torneo`** para el NOMBRE del torneo
(`"CONFERENCIA NORTE"`, `"TORNEO LOCAL"`), y ese campo baja a cada planilla
del catálogo. Con el mismo nombre, el fixture pedía
`torneos/CONFERENCIA NORTE.json` —404— y el selector ofrecía «solo fixture»
en cualquier categoría sin libro de un club que declarara torneo.

Es **la colisión del punto 18**, la misma que costó una pantalla cuando el
bloque de preconfiguración se bautizó `torneo`. La planilla usa `torneoId` y
`zonaId`; el catálogo del servidor los manda como `torneo`/`zona` dentro de
`categorias[slug]`, donde no colisionan con nada. Hay un test que lo fija
leyendo el `clubes/jujuy.json` real.

### La categoría SIN LIBRO se puede abrir, a ver el fixture

Una categoría sin `sheetId` va `disabled` en el selector, que es lo correcto
—no hay datos— pero antes del primer partido **eso dejaba al club sin ver su
propio calendario**: la zona de LAB no tiene libro hasta que MotorStats lo
escriba. Con `torneoId` declarado se puede elegir y dice **«— solo fixture»**,
para que nadie espere números.

**El bloqueo comercial gana igual**: una categoría pausada, vencida o dada de
baja no se abre ni para el fixture.

### De dónde sabe el panel a qué torneo pertenece

`catalogo.publico()` manda `torneo` y `zona` al club del token: no es
información comercial —es a qué torneo juega su equipo— y es lo que permite
leer `torneos/<id>.json`, que es un archivo público del repo. **Si el club ES
un torneo, su categoría es una zona y su fixture es el propio**: sin eso,
abrir la Zona C decía «esta categoría no está enganchada a un torneo», y es
el torneo.

### `LOGOS.iniciales` contaba los paréntesis como palabra

`HINDU (C)` daba **`H(`**. Los nombres de Liga Argentina llevan la provincia
entre paréntesis, así que afectaba al scatter de Principal, a la tabla de
posiciones, al scouting y a los cinco PDF — o sea al cliente real que tiene
esos nombres. Solo se veía con UNA palabra antes del paréntesis (`SALTA
BASKET` daba bien), y por eso sobrevivió tanto.

Ahora se parte por espacios, puntos, paréntesis, comillas y guiones, y se
toman solo las palabras que **empiezan con letra o dígito**. `RECONQUISTA
'B'- MM` pasó de `R'` a `RB`. Los paréntesis NO se sacan del NOMBRE
—distinguen equipos, punto 3— solo de la inicial.

---

## 70. FUENTES EXTERNAS DE FIXTURE · el conector de basket-club (2026-09-25)

El fixture del punto 68 salía de `torneos/<id>.json`, un archivo que alguien
escribe a mano. Para la APB eso no alcanza: los horarios cambian durante la
semana, hay reprogramaciones, y el DT quiere saber **por dónde se transmite**
el partido del rival. Un torneo declara ahora de dónde sale su calendario:

```json
"fixture": {
  "adaptador": "basket-club",
  "zonas": { "a": "https://basket-club.com/torneos/torneo-2026-masculino-zona-a", … },
  "ttlMs": 600000
}
```

### La arquitectura · un REGISTRO, no un parser suelto

`server/lib/fixture-fuentes.js` es **puro**: entra HTML, salen partidos. No
hay red, ni KV, ni `document`. Eso es lo que permite probar el parser contra
HTML guardado, que es la única forma de tener un test que no dependa de que
el sitio esté arriba ni de que no haya cambiado.

Cada federación publica distinto —Gesdeportiva sirve fragmentos por rango de
fechas, basket-club sirve la página entera— pero **la forma de la salida no
cambia**. `ADAPTADORES` fija ese contrato, así que sumar una federación es
sumar una entrada y no tocar ni el endpoint ni el panel.

### Lo que la fuente NO publica, no se inventa

**basket-club no publica la sede ni la cancha.** Verificado en las tres
zonas: cero menciones de sede, cancha, estadio, gimnasio o dirección. El
campo no se emite —una columna vacía permanente es ruido— y rellenarla con
el nombre del local sería un dato inventado.

Los **estados** se clasifican por palabra clave y lo que no se reconoce cae
en `OTRO` **con su texto crudo**, que la pantalla muestra tal cual. Hoy el
sitio solo escribe la hora y «Final»; el día que escriba «Suspendido» no hay
que tocar nada. Y **un partido con marcador está jugado**, diga lo que diga
la etiqueta: el marcador es el hecho y la etiqueta es cómo lo rotula el
sitio.

### EL RESPALDO ES EL PUNTO ENTERO

```
1. KV fresco           se sirve y no se toca la red
2. KV vencido          se intenta refrescar
3. el refresco FALLA   se sirve lo guardado, con `stale: true` y el motivo
4. no hay nada         → 502, y el panel cae al calendario del archivo
```

El paso 3 incluye el caso traicionero: **la página responde 200 y ya no se
reconoce ni un partido**. Eso NO es «el torneo no tiene partidos» —el
adaptador lo distingue y avisa— y servir cero borraría el calendario de la
pantalla sin que nadie se entere.

**Una zona que falla no tumba a las otras**: con tres zonas, perder las tres
por una sería convertir un problema chico en uno grande. Y se FUSIONA con lo
guardado, así que la zona que hoy falló conserva su última lectura buena.

### Por qué en el backend y no en el navegador

basket-club manda `Access-Control-Allow-Origin: *`, así que el panel PODRÍA
pedirle directo. No se hace por tres motivos medidos: son **~400 KB de HTML
por zona y por carga** (`Cache-Control: no-store`, o sea que el navegador no
lo guarda), el respaldo ante una caída viviría en cada navegador por
separado, y el día que la fuente cierre el CORS el panel se queda sin
fixture. Acá se baja una vez cada diez minutos para todos. Medido: las tres
zonas tardan **1,1 s** y dan 374 partidos.

### EL CRUCE CON EL LIBRO · lo que no cruza se reporta

La fuente escribe `ATENAS` y el libro `ATENAS 'A' - MM`; la fuente `C.E.Y.E.`
y el libro `C E Y E`. Sin resolverlo, el partido en vivo y el jugado no
cruzan y la sección muestra el mismo cruce dos veces.

`equipoDelLibro` resuelve en cascada: alias declarado → igual → el libro
agrega la letra → el libro separa las siglas → el libro abrevia la primera
palabra → el libro agrega una palabra. **Con dos candidatos no elige**:
atribuir un partido al equipo equivocado contamina el calendario de dos
clubes. Lo que no cruza **igual viaja**, marcado con `sinCruce`.

Medido contra los tres libros reales: **zona B cruza entera y sus 93
marcadores coinciden**; en A y C quedó un solo caso cada una —el mismo club—
que se declara por alias en el archivo del torneo.

### Las tres zonas de APB SON los libros que ya existían

Se verificó antes de modelar nada, y por eso el torneo no trajo libros
nuevos:

```
basket-club Zona A  ←→  reconquista/reconquista-primera     12/12 equipos
basket-club Zona B  ←→  deportivo/deportivo-primera         12/12
basket-club Zona C  ←→  zona-c-la-plata-2026/zona-c-primera 11/11
```

`catalogo.js torneo --libro-de "a=club/categoria,…"` reusa el libro de una
categoría que ya existe **sin manejar el sheetId a mano**, que es la misma
garantía del punto 67: el id no sale del servidor.

### Lo que quedó en KV el 2026-09-25

```
apb-2026-masculino   apb-2026-a / -b / -c   los tres libros que ya existian
reconquista/reconquista-primera     → zona a · RECONQUISTA 'A' - MM
deportivo/deportivo-primera         → zona b · DEPORTIVO LA PLATA - MM
sudamerica/sudamerica-primera       → zona b · SUD AMERICA LP - MM
hogar-social/hogar-social-primera   → zona b · HOGAR SOCIAL - MM
universitario/universitario-primera → zona b · UNIVERSITARIO - MM
```

**LAB queda en standby**, a pedido del club: su torneo sigue con el
calendario declarado de su archivo y sin fuente externa, hasta que estén
sus libros.

### El bug que ningún test vio, y por qué

`SGADD_DATA.fixtureDeTorneo` usaba un helper `traer` que es **local a cada
función** del módulo: en el navegador tiraba `traer is not defined` y el
panel caía al calendario declarado **como si la fuente se hubiera caído**,
con su cartel de «no contestó» y todo. El modo de fallar era perfecto —la
degradación funcionaba tan bien que tapaba el error— y ningún test lo vio
porque **ninguno ejercía esa función**: sin backend devuelve `null` y todos
pasaban por esa rama. Ahora se ejerce con un `fetch` inyectado.

Es la lección del punto 51 otra vez: *que degrade bien no es que funcione*.

### Y el `min-w-0` de las tablas del rival

Un item de grid tiene `min-width: auto`, así que se ensancha con su
contenido y el `.scrollbox` de adentro nunca llega a scrollear. Medido a
375px con la columna de TV nueva: la tabla del rival empujaba la página a
**799px** de ancho.

---

## 71. EL ORDEN DEL MES, LOS LIBROS DE LAB Y EL CONECTOR DE APDEB (2026-09-25)

### 1 · El mes se apila del más reciente al más antiguo

A pedido del club. El DT entra a ver qué pasó anoche y qué viene, no a
repasar la primera fecha, así que lo último queda arriba.

**SOLO SE INVIERTE LO QUE SE MUESTRA** (`deMes`). El resto del motor sigue
ascendente porque de eso dependen `proximo()` —que busca el primero que
viene— y `anterior()`, que toma el último de los previos: invertir la lista
de base los daría vuelta a los dos y el «próximo rival» pasaría a ser el de
la primera fecha del torneo.

Y **`ordenar()` pasó a comparar la HORA**. Sin eso, dos partidos del mismo
día quedaban en orden alfabético y el bloque del mes mostraba primero el de
las 19 y después el de las 21:30 — el pedido dice «de mayor fecha/hora a
menor». El nombre queda como último criterio porque es estable.

### 2 · Los libros de LAB

Norte y Sur quedaron conectados y **el libro se propagó solo a Jujuy**, que
estaba enganchado a la Norte desde el punto 67. Los dos están **vacíos**
—pretemporada— y el índice se arma sin errores: 0 equipos, 0 jugadores, y los
empty states del punto 68 hacen su trabajo.

Los **Script ID** de Apps Script que el club pasó van anotados en
`fuente.motorstats` del archivo del torneo, **como referencia de quién
produce el dato**: el panel no los usa, lee el Sheet por API.

### 3 · El conector de apdeb · tablas sin clases

apdeb es un sitio de tablas HTML de los de antes: una `<tr>` por partido, sin
una clase que identifique nada. Así que el parser **NO cuenta columnas**
—eso se rompe con la primera que agreguen— sino que busca la celda que dice
`vs` y lee alrededor:

```
…  [pts local]  LOCAL  vs  VISITANTE  [pts visitante]  [categorías]
^
la fecha, o el estado cuando no hay fecha («A Reprogramar»)
```

Con eso la misma función lee las tres formas que publican: programación
(5 celdas), resultados (6, con el marcador a los costados) y la de menores
(una más, con las categorías).

**Y tiene estados que basket-club no tenía**: «A Reprogramar» y
«SUSPENDIDO». Justifican el diseño del punto 70 — lo que no se reconoce cae
en `OTRO` con su texto crudo— y llegan **sin fecha**, porque no la tienen. El
partido entra igual: que un cruce esté pendiente es información, y
descartarlo dejaría el fixture incompleto. Van al final de la lista.

### UNA FILA PUEDE SER DE VARIAS CATEGORÍAS

En menores el mismo cruce de clubes juega U15, U17 y U21 el mismo día: la
celda dice `U15 - U17 - U21`. Con `categoria` en la config se toman solo las
filas que la mencionan, y el partido se emite **una vez**.

**Una fila que NO declara categoría se descarta al filtrar**: en una página
multi-categoría no se puede atribuir, y meterla en U21 sería inventar. Sin
`categoria` pedida entran todas, que es lo que corresponde para Sub-23.

### EL PISO DE TEMPORADA se declara, no se adivina

La página de resultados de Sub-23 trae **2025 y 2026 en el mismo archivo**
(medido: 6 partidos de 2025). Sin el corte, el fixture muestra meses de hace
un año como si fueran del torneo en curso. `fixture.desde` lo acota, y el
aviso **distingue los dos casos**: «6 partidos de temporadas anteriores
quedaron afuera» no es lo mismo que «cambió la estructura» — uno se arregla
con el `desde` y el otro con el parser.

### EL MAPEO se verificó con datos, no se supuso

```
apdeb Sub-23                    ←→  reconquista-u23   12/12 equipos
apdeb Menores, categoría U21    ←→  reconquista-u21    6/6
```

**U21 no está en Sub-23**: está en Menores, y el libro de esa categoría tiene
seis equipos, que son exactamente los de una tira. apdeb publica la U21
completa (todas las tiras), así que hay partidos que no cruzan con el libro:
**no se esconden** —son partidos reales del torneo— y quedan marcados con
`sinCruce`. La vista filtra por el equipo propio, así que el DT no los ve.

### EL MISMO CRUCE CON LA FECHA CORRIDA

El bug que apareció en pantalla y que ningún test había previsto. Medido en la
U23: **apdeb declara ESTRELLA vs RECONQUISTA el sábado 5 y el libro lo tiene
el domingo 6**, con el mismo 45-80. El cruce por fecha exacta lo mostraba
**dos veces**, con el marcador repetido. Y no era uno: **siete partidos de
una jornada entera** venían corridos un día.

`unir()` busca ahora el mismo par de equipos dentro de una ventana de **3
días**:

- **La ventana es CHICA a propósito.** En una liga de ida y vuelta los dos
  cruces del mismo par están a semanas, así que no hay con qué confundirse;
  con una ventana grande se fusionarían la ida y la vuelta, que es
  exactamente el error que no se puede cometer. Hay un test que lo fija.
- **Con dos candidatos cerca no se elige**: fusionar el equivocado movería un
  partido de fecha y dejaría al otro sin resultado.
- **El candidato puede venir YA JUGADO desde la fuente**, porque apdeb
  publica sus propios resultados. Ahí se fusiona **solo si el marcador
  coincide** —respetando de qué lado jugó cada uno, que una fuente puede
  escribir el cruce al revés—. Si difiere, **no se fusionan**: o son dos
  partidos distintos, o hay una discrepancia entre la web y la planilla, y en
  ninguno de los dos casos corresponde taparla.
  *La primera versión del arreglo solo miraba los candidatos SIN jugar, así
  que no cazaba el caso real que se veía en pantalla.*
- **La fecha del libro manda** cuando difieren: es la del partido que se jugó
  de verdad y la que el club audita. La declarada queda en `fechaDeclarada`
  para poder decir que se movió.

### Lo que hay que respetar al tocarlo

- **Las fixtures son markup REAL** recortado de las páginas, conservado byte
  a byte, con las filas que cubren cada caso. Un HTML inventado probaría el
  parser contra lo que uno cree que publica el sitio.
- **`refrescar` tolera la forma corta** —una zona declarada como string—
  aunque `configDe` ya la normalice: es la que hace el trabajo y no puede
  depender de que el llamador haya pasado por el validador. Lo destapó un
  test que la armaba a mano.
- **Una página caída no tumba la zona**: apdeb publica programación y
  resultados aparte, y si una falla se sigue con la otra. Es la misma regla
  que entre zonas, un nivel más abajo.
- **Cuatro tests no probaban nada** y se reescribieron: contaban un `every`
  sobre una lista filtrada —relajar la regla sacaba el caso del filtro y el
  test pasaba igual— o miraban una propiedad que en la fixture no tenía
  contraejemplo. Es la lección del punto 69, otra vez.
- **El guard que manda los sin fecha al final es explícito y HOY es
  redundante**: con `fecha: null`, `String(null)` da «null» y por alfabeto ya
  cae después de cualquier «2026-…». Se deja porque la propiedad no debería
  depender de que la letra «n» sea mayor que un dígito, y el test lo dice en
  vez de fingir que lo caza.

### Lo que quedó en KV el 2026-09-25

```
liga-argentina-2026-27   norte y sur CONECTADOS (vacios, pretemporada)
apb-2026-formativas      apb-2026-u23 / -u21, sobre los libros de Reconquista
reconquista/reconquista-u23 → zona u23 · RECONQUISTA - U23
reconquista/reconquista-u21 → zona u21 · RECONQUISTA 'A' - U21M
```

**El equipo de la U23 hubo que pasarlo explícito**: el del club es
`RECONQUISTA A` y en ese libro es `RECONQUISTA`, sin la letra, así que el
guard del punto 67 rechazó el enganche —«ese equipo juega en la zona u21»— y
tenía razón. Es el punto 61 en acción.

### Lo que apdeb NO publica

**Transmisión.** El campo va vacío, no inventado. Y la sede tampoco, igual
que basket-club.

---

## 72. LA LEYENDA SIN EL PROVEEDOR, Y EL CRUCE QUE LA PROGRAMACIÓN NO PUBLICA (2026-09-25)

### 1 · La leyenda dice CUÁNDO, no de dónde

A pedido del club. Decía «en vivo desde apdeb» o «desde basket-club», y de
qué sitio salió el horario es un detalle de implementación: al DT no le dice
nada. Lo que necesita para saber si puede confiar en el horario que está
mirando es **cuándo se leyó**.

```
al día      Horarios y transmisiones en vivo, leídos a las 21:27.
copia vieja ⚠ Horarios y transmisiones en vivo (última actualización: 25 de
              septiembre a las 19:50). La fuente no contestó recién, así que
              los horarios pueden haber cambiado.
```

- **El nombre sigue viajando en `vivoEstado.fuente`**, que es lo que sirve
  para el diagnóstico. Lo que se saca es la VISTA, no el dato.
- **Sin hora de lectura no se inventa una**: la leyenda queda sin la coletilla
  en vez de mostrar una hora resuelta de la nada.
- **`horaDe()` usa `Date` y eso acá está bien**: se muestra la hora de LECTURA,
  que es un instante, y no se la compara contra la fecha de un partido — que
  es donde la zona horaria muerde y por lo que existe `fechaLarga`.
- **`avisoFuente(a, vivoEstado)` toma el estado como argumento opcional**,
  cayendo al del módulo. Así la función es pura y el test la ejerce sin tocar
  el estado global desde afuera.

Hay un test que barre el módulo y falla si vuelve a aparecer un literal
visible con el nombre de un proveedor (los que quedan son URLs y el nombre
del adaptador, que no se muestran).

### 2 · La tercera página de apdeb · el fixture ESTRUCTURAL

apdeb publica en «programación» **solo la fecha próxima**. O sea que el
partido que viene DESPUÉS del nuestro —el del rival, que es justo el que la
card «Próximo Rival» necesita— no está ahí, y «SU PARTIDO SIGUIENTE» salía
vacío. Está en `SUB23_FIXTURES.html`, que es el fixture estructural: qué
cruce va en cada jornada, y nada más.

Esa página no tiene celda de fecha. La fecha la pone el **encabezado de
jornada** que precede a las filas (`1º Fecha - 21/3/2026`), y se hereda igual
que el «Hoy» de basket-club.

**LA FORMA DE LA FILA ES LO QUE SEPARA LAS DOS PÁGINAS, no una adivinanza.**
En el fixture el local es la PRIMERA celda (`iVs === 1`); en la programación
adelante van la fecha y la hora. Eso importa porque en la programación una
fila sin fecha dice **«A Reprogramar»**, y heredar la de la jornada le
inventaría un día que el sitio justamente no publicó. Hay un test que pega
esa fila real debajo de un encabezado real y exige que NO herede nada.

- **La fila «Fecha Libre» no entra**: no tiene celda `vs`.
- **No trae hora ni marcador**, y no se los inventa: queda `PROGRAMADO`.
- **Se marca con `estructural: true`**, que es lo que la deja perder contra la
  programación del mismo cruce.

### 3 · EL MISMO CRUCE ESCRITO DISTINTO POR DOS PÁGINAS DEL MISMO SITIO

El defecto que introdujo la tercera página, y que solo se vio midiendo la
agenda: **32 cruces duplicados en la U23, 4 de ellos del equipo propio**. El
modo de fallar era el peor de todos —el mismo partido dos veces en el mes,
una con resultado y otra «a jugarse»— sin ningún síntoma de que fueran el
mismo.

```
resultados   «Bco Provincia»    «Deportivo LP»    «Hogar Social»
fixture      «BANCO PROVINCIA»  «DEPORTIVO»       «HOGAR SOCIAL»
```

El servidor ya deduplica lo que lee, pero lo hace con el **texto crudo**, y
`claveEquipo` normaliza mayúsculas y espacios, **no abreviaturas**. Lo que
homogeniza esos nombres es el mapeo al nombre del libro (`mapaAlias`), y eso
recién ocurre en el cliente: **así que la deduplicación tiene que ir DESPUÉS
del mapeo**, no antes. Va en `dedupFuente`, al final de `normalizarFuente`.

Medido después: **139 partidos contra 173, 0 duplicados** y `mios` de 26 a 22
—los 4 que sobraban—.

Quién gana, de más informativo a menos, el mismo criterio que aplica el
servidor un nivel más abajo:

1. el que trae **MARCADOR**;
2. entre los que no, el que **NO es estructural** (esa página no publica hora
   ni estado).

Reglas que hay que respetar al tocarlo:

- **SIN ALIAS QUE LOS UNA, NO SE FUSIONAN.** Inventar la equivalencia entre
  dos abreviaturas sería peor que mostrar dos filas: un cruce fusionado por
  parecido puede ser otro partido.
- **La ida y la vuelta no se tocan**: la clave lleva la fecha.
- **Las dos reglas se prueban POR SEPARADO**, o una tapa a la otra — en el
  caso real la fila con marcador es además la no estructural, así que
  cualquiera de las dos alcanzaría y revertir una no se notaría.
- **En el test las dos filas del caso llevan la MISMA HORA.** Con horas
  distintas el `sort` previo pone primera a una de ellas y gana por posición,
  así que el test no probaría la preferencia sino el orden. Costó una vuelta.
- **El guard simétrico —que el sin marcador no pise al jugado— HOY ES
  REDUNDANTE**: para llegar ahí haría falta una fila estructural con
  marcador, y el fixture no publica resultados. Se deja porque la propiedad
  no debería depender de eso, y el test lo dice en vez de fingir que lo caza
  (la misma decisión que el orden de los sin fecha, punto 71).

### 4 · `?refrescar=1` NUNCA FORZÓ NADA

`verificarToken` devuelve `{ok, sesion, rol}`. El endpoint leía
`v.payload.email`, que **no existe**: `esAdmin` daba siempre `false`, así que
el parámetro no forzaba el refresco y se servía el caché viejo — contestando
**200 con datos buenos pero viejos**, o sea sin ningún síntoma. Ahora lee
`v.rol === AUTH.ROLES.ADMIN`, y hay un test que mira el CÓDIGO sin los
comentarios (el de al lado nombra al `payload` justamente para explicar esto).

### 5 · Lo que quedó ABIERTO · dos fechas del libro con el año 2025

Auditando esto apareció que la página de fixture de Sub-23 declara una
jornada como **16/5/2025**. No se toca: es un dato del sitio, y el panel ya
tiene el mecanismo para eso —`aniosAtipicos` los muestra con el aviso al
lado y no los deja decidir por dónde abre la sección (punto 68)—. Se le
reporta al club, no se corrige acá.

---

## 75. FASES, CRUCES Y SERIES · la llave de playoffs (2026-09-28)

Pedido: un modelo genérico de cruces intrazonales (playoffs de una zona) e
interzonales (cruces entre zonas) para cualquier torneo, conectado al
selector de fase que ya existía en la barra. Se acordó entregarlo en DOS
partes, y esta es la **1 · intrazonal**. `test-fases.js` fija todo lo de acá.

### LO QUE YA EXISTÍA, Y POR ESO NO SE CONSTRUYÓ

**Las métricas aisladas por fase ya estaban garantizadas.** El índice se arma
scopeado a `TORNEO|FASE` (punto 3 ter) y el TOTAL nunca junta fases. Un libro
que trae filas con `FASE = PLAYOFF` hace que el selector ofrezca «Playoffs»
solo, y Principal, Equipos, Jugadores y Scouting ya filtran. No se tocó una
línea de eso: se fijó con tests (la regular no suma los playoffs, los
playoffs no suman la regular, el TOTAL de la regular no mete la playoff).

**La `FASE` la pone MotorStats a partir del nombre de la carpeta de Drive**
(`"CLAUSURA - PLAYOFF"` → `PLAYOFF`), libro por libro. Es texto libre.

### LAS TRES DECISIONES, tomadas con el club antes de escribir

| | Decisión |
|---|---|
| **Dónde vive un partido interzonal** | En un **libro propio** de la fase, registrado como una zona más del torneo. Es la entrega 2 |
| **Qué ve un cliente de la otra zona** | **Solo su llave**: las posiciones que definen sus cruces, no las métricas ni los planteles |
| **A qué fase va un partido programado** | Por **ventanas de fechas declaradas**, con las reglas del punto 18 |

### EL MODELO · `formato.fases` enriquecido, en el JSON del torneo

```json
{ "id": "octavos", "label": "Octavos", "libro": ["PLAYOFF"], "serie": { "mejorDe": 3 },
  "desde": "2027-04-24", "hasta": "2027-05-10", "cruce": "zona",
  "cruces": [ { "id": "O1", "a": { "zona": "norte", "puesto": 1 }, "b": { "ganador": "R4" } } ] }
```

Un lado de un cruce es `{zona, puesto}`, `{equipo}`, `{ganador: cruce}` o
`{perdedor: cruce}`. Lo lee `SGADD_FASES.parsear()` con el fallback seguro
de siempre: lo que no se entiende se descarta con su motivo y lo demás sirve.

- **`libro` es el VÍNCULO con la columna FASE**, y se declara: la fase
  «octavos» del reglamento puede estar escrita «PLAYOFF» en el libro. Sin
  declararlo se asume el id en mayúsculas (`regular` → `REGULAR`).
- **Una serie par se rechaza**: a un número par de partidos puede quedar
  empatada, y en básquet no hay empates.
- **Una referencia tiene que apuntar a un cruce declarado ANTES**, y uno que
  se refiere a sí mismo queda inválido: si no, la llave puede quedar circular.
- **La regular toma su ventana de `formato.inicio` y `formato.finRegular`**
  cuando no declara una propia. La Liga Argentina ya los escribe; sin eso, un
  partido de la regular quedaba «sin fase» y se colaba en los playoffs.
- **Lo que ya estaba escrito se sigue leyendo**: LAB declara `puestos`,
  `directos` y `cruce` sin `tipo` ni `cruces`, y se lee sin un solo error.

### LAS REGLAS QUE NO SE NEGOCIAN

- **EL DATO MANDA.** Una serie que se jugó entre dos equipos que la
  declaración no ponía cara a cara se muestra igual, como serie suelta.
- **Proyectado no es resuelto.** Con la fase regular abierta, «1° de la zona»
  sale rotulado *proyectado*; lo confirma el partido jugado o el cierre de la
  tabla (`partidosPorEquipo` alcanzado, o una fase posterior ya en juego).
- **Sin saber a cuántos era la serie, no se declara un ganador.** Un libro
  con `PLAYOFF` y sin declaración muestra el marcador de cada serie y nada
  más.
- **Con dos series candidatas, no se elige.** Si un lado está pendiente, se
  acepta la ÚNICA serie de la fase en la que juega el otro; con dos, las dos
  quedan sueltas. Atribuir la equivocada mueve a un equipo de llave.
- **Un empate no suma a nadie**: es un dato mal cargado.
- **Un puesto de OTRA zona queda pendiente** y no se adivina. Si el libro
  trae el partido, lo jugado completa ese lado (`porLoJugado`).
- **La tabla que resuelve los puestos es la MISMA de Clasificación**, con los
  partidos manuales (punto 44) y el orden de desempate del club. Por eso
  `clasifManualesVigentes` y `clasifFormatoVigente` aceptan ahora un tramo
  opcional; sin él siguen leyendo el abierto, así que ningún llamador cambió.

### EL NÚCLEO CONOCE LAS RONDAS

`FASES` suma `RECLASIFICACION`, `OCTAVOS`, `CUARTOS`, `SEMIFINAL(ES)`, `FINAL`
y `PERMANENCIA`, con su orden y un flag `eliminacion`. Sin eso, `CUARTOS`,
`FINAL`, `OCTAVOS` y `SEMIFINAL` empataban en el orden 5 y el selector los
listaba por alfabeto: la final antes que los octavos. Va en el núcleo y no en
cada torneo para ordenar bien a CUALQUIER cliente, aunque no declare nada.

El núcleo cambió, así que **la copia de `server/lib/compartido/` se regenera
con `node server/bin/sincronizar-compartido.js` y no con `cp`**: la copia
lleva una cabecera, y un `cp` la pisa y deja los finales de línea mezclados.
Pasó en esta entrega; el script, que normaliza al comparar, la dio por buena y
`test-backend.js` la cazó.

### LA BARRA · las opciones SIGUEN saliendo del libro

- **El estado, la ruta y los links compartidos no cambian.** La declaración
  solo pone el nombre del reglamento («Semifinales» donde el libro dice
  `PLAYOFF`) y suma las fases que todavía no se jugaron.
- **Una fase declarada sin datos se ve y no se elige**: `disabled`, con
  «— sin datos», y un id con asteriscos (`*SIN-DATOS*|FINAL`) que ninguna
  celda puede producir. `cambiarTramo` además la ignora.
- **La declaración baja EN PARALELO con el libro**, en `cargar()`, con techo
  de 1,5 s y el temporizador limpio al terminar (sin eso retiene el proceso
  de los tests). Un archivo de pocos KB contra un libro de segundos: no suma
  espera, y la barra sale con los nombres del reglamento desde el primer
  pintado.

### CLASIFICACIÓN Y FIXTURE

**Clasificación**, en una fase eliminatoria, muestra la llave: una columna
por fase, con la activa marcada, cada cruce con su puesto de origen, la serie
y sus partidos. **La tabla no se saca** —es un dato del libro—, va plegada
debajo, y su plegado vive en una variable del módulo por la trampa del punto
13.

**Fixture** ahora tiene la barra y se repinta al cambiar de fase: antes no
tenía selector y se quedaba en la instancia anterior. Tres cosas:

- **Lo jugado es de TODA la fase**, no del torneo suelto: con Ida y Vuelta en
  la misma fase, mirar la Ida hacía que los partidos de la Vuelta aparecieran
  como «a jugarse». El Fixture se parte por instancia.
- **Lo programado se parte por ventana.** Sin ventanas declaradas, una fase
  de eliminación muestra solo lo que su libro dice que se jugó, y lo dice;
  mostrar ahí el calendario entero hacía pasar por «a jugarse» partidos de la
  regular. Lo que no se puede asignar se MUESTRA, marcado «sin fase».
- **Lo que la fase deja afuera se dice**: «También hay partidos jugados de
  Semifinales: elegila en el selector Fase». Un filtro callado se lee como
  «no hay partidos».

«Intrazonal» se marca solo en las eliminatorias o cuando es la excepción: en
la fase regular todos lo son y sería ruido.

### Y UN BUG VIEJO · el Fixture no leía las fechas de GViz

`fechaISO` no entendía `Date(2025,10,5)`, que es como GViz entrega una fecha
—con el mes 0-indexado, punto 3—. En producción no se notaba porque el
backend entrega `dd/mm/aaaa`, pero **con GViz de respaldo y en la demo el
Fixture perdía TODOS los partidos jugados**: la fecha no se leía y el partido
se descartaba sin aviso. Se lee sobre el TEXTO (mes + 1), sin pasar por
`Date`, por la trampa de zona horaria que la función ya documentaba.

### Verificado

- **Al revés**, 14 mutaciones del motor, la barra, Clasificación y Fixture:
  las 14 cayeron. Una cayó al principio por otro test y no por el suyo —el
  libro de prueba insertaba octavos antes que cuartos y el `sort` es estable,
  así que el orden salía bien por suerte—; la fixture ahora los trae
  desordenados a propósito. `fechaISO`: sin el arreglo caen 3.
- **La reactividad se EJERCE**: `sgadd-app.js`, `sgadd-clasificacion.js`,
  `sgadd-fixture.js` y `sgadd-fases.js` reales en un `vm`, llamando a
  `cambiarTramo` y leyendo lo que quedó en `#view-root`.
- **En el navegador**, sobre la demo con semifinales inyectadas en memoria,
  cambiando la fase desde el selector real: Clasificación y Fixture se
  repintan solos. A 1280 px las columnas entran; a 375 la llave (492 px)
  scrollea dentro de su caja de 310 sin desbordar la página.
- **Dos tests medían por distancia en caracteres** (`test-core.js` y
  `test-resiliencia.js`, sobre `cambiarTramo`) y se pusieron en rojo por un
  comentario, sin que la propiedad cambiara. Se reescribieron para recortar
  el CUERPO de la función por llaves balanceadas, y siguen cazando la
  reversión.

### Lo que queda para la entrega 2 · interzonal

- **El libro de la fase interzonal** se registra como una zona más del torneo,
  y al elegir esa fase en la barra el panel lee ese libro.
- **La tabla de la OTRA zona para resolver sus puestos**: hoy esos lados
  quedan pendientes. El cliente ve solo su llave (la decisión de arriba), así
  que el servidor tiene que dejar leer las POSICIONES de la otra zona sin
  abrirle su libro.
- **Ningún torneo real declara cruces todavía**: APB no publicó su reglamento
  y LAB solo lista sus fases. Se declaran cuando se publiquen; no se inventan.
- **`tramoPorDefecto` sigue abriendo por la regular** aunque haya playoffs en
  curso. Con playoffs en juego, «la foto de hoy» (punto 3 ter) son los
  playoffs; es una decisión de producto aparte, que conviene tomar antes de la
  primera postemporada.

> **Los cuatro, cerrados o encaminados en el punto 76** (2026-09-28): la
> zona de la postemporada, la llave de las otras zonas por su propia ruta y
> la fase activa que abre el libro. Los cruces reales siguen sin declararse.

---

## 76. LA LLAVE ENTRE ZONAS Y LA FASE QUE ABRE EL LIBRO (2026-09-28)

La entrega 2 del punto 75. `test-interzonal.js` fija todo lo de acá, con los
handlers reales y un Upstash de mentira.

### LA REGLA DE ACCESO, decidida con el club

```
LIBRO COMPLETO   solo el de SU zona, por su categoría  → /api/v1/equipos (sin cambios)
LA LLAVE         puestos, récord y resultados de series → /api/v1/torneos/:torneo/llave
```

**El 403 ya existía y no se tocó**: el libro de una zona de torneo es del
TORNEO (`tipo: 'torneo'`), no del cliente, así que `manejarEquipos` le
contesta `OTRO_CLUB` a cualquier cliente que lo pida —la otra zona, la
postemporada, y también su propia zona pedida por el torneo—. Su libro es el
de su categoría, que ya lleva el `sheetId` de la zona (punto 67). Fijado con
tests.

**La ruta nueva** (`server/rutas/llave.js`) la pide el admin, o un cliente con
una categoría ENGANCHADA a ese torneo y con acceso: un club pausado recibe
403 igual que uno ajeno (`OTRO_TORNEO`). Devuelve de cada zona `puesto,
clave, nombre, pj, pg, pp` y si la tabla cerró; de la postemporada, `fase,
fecha, local, visitante, ptsLocal, ptsVisitante`. **Nada más**: el test
recorre la respuesta contra una lista CERRADA de claves y falla si aparece
una columna de estadísticas, y verifica que ningún `sheetId` viaje.

- **La tabla es la de Clasificación**: el mismo motor
  (`sgadd-clasificacion.js`, ahora vendorizado en `server/lib/compartido/`
  por `sincronizar-compartido.js`), con los partidos manuales del torneo y su
  `ordenTabla`. Con otra fórmula, el «2° Sur» de la llave podía no ser el 2°
  que ve el cliente de esa zona. `claveDe` cae a `require('./sgadd-core.js')`
  en Node, que es donde el global del navegador no existe.
- **Cerrada** solo por `formato.partidosPorEquipo` alcanzado o por una fase
  posterior jugada en ese libro. Nunca por intuición.
- **Una zona ilegible no tumba la llave**: queda `ilegible` y sin filas, así
  que sus lados salen «a definir», que es lo honesto.
- **Caché de 5 minutos por torneo**: la llave la piden todos los clientes
  del torneo y cada zona es un libro de Google.

### LA ZONA DE LA POSTEMPORADA · `interzonal: true`

Es una zona más del torneo (la decisión del punto 75), con tres diferencias
en `server/lib/torneos.js`:

- **No declara equipos**: ahí juegan los de las otras zonas, y si los
  declarara el control de duplicados la rechazaría —con razón: un equipo
  está en UNA zona—.
- **No se engancha nadie**: `vincular` la rechaza diciendo que el cliente
  pertenece a la zona donde juega su equipo.
- **Su libro NO se propaga**: nadie está enganchado a ella, y un cliente
  solo recibe el libro de su zona. Hay un test que escribe el enganche a
  mano y verifica que igual no le llega.

Del lado de la declaración, la fase entre zonas dice dónde se juega con
`zonaLibro` (y/o `cruce: 'interzonal'`); `SGADD_FASES.esEntreZonas()` la
reconoce.

### EL MODO LLAVE · la fase entre zonas SE ELIGE

Una fase entre zonas que el libro de la zona no trae aparece en el selector
**habilitada**, como `«Cuartos de final · llave»`, con el id
`*LLAVE*|CUARTOS` (asteriscos como `*TOTAL*`: ninguna celda los produce, y
un link compartido lo abre igual). Una fase declarada que se juega en el
libro de cada zona y no tiene datos sigue deshabilitada, como en el punto 75.

- **El índice en modo llave es el de la fase REGULAR de la zona**
  (`estado.tramoIndice`): la fase elegida no está en este libro, y un índice
  vacío dejaría al buzón y a la tabla plegada sin nada.
- **Solo Clasificación y Fixture la muestran**, más las que no dependen del
  tramo (Glosario, Panel Master, Diagnóstico) —`SECCIONES_EN_LLAVE`, UNA
  lista que leen el router y el repintado de `onCambio`—. **Principal,
  Equipos, Jugadores, Scouting, Simulador y Comparativa DICEN que es solo la
  llave**, con la barra arriba para volver: no se esconden ni pintan el
  índice de otra fase como si fuera el elegido.
- **`onCambio` también pasa por el guard**: si no, `equiposPintar()` y
  compañía repintaban su contenido encima del aviso al cambiar de fase.
- **Un link a la llave espera la declaración** en `cargar()` (con el techo
  de 1,5 s) antes de decidir el tramo: la llave no sale del libro sino del
  archivo del torneo, y sin esperarlo el hash se descartaba por inexistente.
- **La llave del servidor se pide UNA vez por torneo** y, al llegar, repinta
  Clasificación o Fixture. La tabla de la zona PROPIA se queda con la local
  (lleva los manuales del club); las otras zonas y los partidos de las fases
  que el libro propio no tiene llegan del servidor, **sin duplicar** una fase
  que el libro ya trae.
- **El Fixture en modo llave** pinta primero los cruces de esa fase y debajo
  el calendario de la zona **rotulado como la regular**: sin eso mezclaba lo
  jugado de la regular bajo el nombre de los cuartos.
- **Una final con los DOS lados a definir no se rotula «Intrazonal»**: el
  chip sale solo si se sabe (o si la fase se declaró entre zonas).

**Consecuencia que el club tiene que saber:** en modo llave el cliente NO
ve estadísticas de su propio equipo en esa fase —están en el libro de la
postemporada—. Si las quiere, MotorStats tiene que escribir esos partidos
TAMBIÉN en el libro de cada zona; ahí la fase aparece como una más y el
panel la muestra entera, sin modo llave.

### LA FASE QUE SE ESTÁ JUGANDO ABRE EL LIBRO

`tramoPorDefecto()` mira el **último partido jugado** del libro (cada tramo
trae `ultima`, de `Base Datos E`): si es de una fase posterior a la regular,
abre en esa fase —en su TOTAL si tiene Ida y Vuelta—. Sin postemporada, o
con la regular como lo último jugado, abre exactamente como antes. Va en el
núcleo, así barra, Diagnóstico y Configuración siguen abriendo por el mismo
tramo (punto 3 ter). **No mira ventanas ni declaración**: lo dice el dato.

### Verificado

- **Al revés, 11 mutaciones**: el guard de enganche (caen 2), el pausado
  (1), mezclar las otras zonas, pisar la propia, duplicar la fase, la
  opción de llave (2), la fase activa, su TOTAL, el enganche y la
  propagación de la postemporada y los manuales de la tabla (1 cada una).
  **Una sobrevivió al principio**: sin las tablas de la otra zona, el cruce
  igual se completaba «por lo jugado» porque la serie ya había empezado. Se
  agregó el caso que importa —saber el rival ANTES del primer partido— y
  ahora cae.
- **En el navegador**, sobre la demo con un torneo de dos conferencias
  inyectado: el selector ofrece la llave, Clasificación y Fixture muestran
  «1° Conferencia Norte vs 2° Conferencia Sur» con el rival de la otra zona
  resuelto, Equipos y Scouting muestran el aviso, y volver a la regular
  restaura todo.

### Pendiente

- **Declarar los cruces reales** cuando APB y LAB publiquen su reglamento, y
  la zona de postemporada con su libro cuando MotorStats lo escriba.
- **La llave no se cachea en el navegador** más allá de la sesión de la
  página: un F5 la vuelve a pedir (el servidor la tiene en caché 5 min).

> **Desde el punto 77** los partidos de un equipo en un libro vinculado le
> llegan por su propio libro, con estadísticas: el modo llave queda para las
> fases donde no jugó.

---

## 77. MULTILIBRO · los libros vinculados y el acceso por PARTIDO (2026-09-28)

Pedido: un torneo con N libros —fase regular de cada zona, Playoff A/B,
Permanencia, Repechaje— sin duplicar nada a mano, con el acceso de un cliente
decidido por **participación** y no por libro, y la llave declarada desde el
Panel Master sin un deploy. `test-interzonal.js` (secciones 5 y 6) fija todo
lo de acá.

### El modelo · un libro vinculado es una ZONA con `rol`

No se inventó una estructura nueva: la zona `interzonal` del punto 76 ya era
«un libro del torneo sin equipos, sin enganche y sin propagación». Se
generalizó con dos campos en `server/lib/torneos.js`:

```
rol          regular | playoffs | permanencia | repechaje   (interzonal ⇔ rol ≠ regular)
participan   [zonas regulares]   vacío = todas
```

- **Una zona vieja con `interzonal: true` y sin rol se lee `playoffs`**: el
  catálogo de hoy no se migra.
- **`participan` solo acepta zonas REGULARES del torneo**: un vínculo a una
  zona que no existe —o a otro libro vinculado— se ve igual de vinculado que
  uno bueno y no le llega a nadie.
- **`zonas: { <id>: null }` desvincula**, y solo un libro vinculado: una zona
  regular tiene clientes y se da de baja por otro camino. El guard de libros
  perdidos (`librosPerdidos`) no cuenta como pérdida lo que se desvinculó a
  propósito (`desvinculadas`).

### El acceso es por partido · `server/lib/multilibro.js`

`manejarEquipos` lee el libro de la categoría y, si su torneo tiene libros
vinculados que incluyen a su zona, **fusiona en él lo que de cada uno le toca
al equipo de la categoría**, ANTES de las alertas y del recorte por plan:

| Hoja | Qué entra |
|---|---|
| maestras (`Base Datos E`, `4 FACTORES`, `Base Datos J`) | solo las filas de los partidos donde jugó su equipo, de local o de visitante |
| derivadas de un equipo LIMPIO | enteras: el propio, y el rival cuyos partidos de esa fase fueron TODOS contra el suyo (en una serie, siempre) |
| derivadas de un equipo SUCIO | afuera; su `PROMEDIOS E` / `4F` se **re-deriva** de los partidos visibles con el motor del TOTAL (punto 3 ter). Sus jugadores no viajan |
| filas TIPO de la liga | viajan, solo de las fases donde jugó: son una mediana, la misma clase de dato que la tabla |

- **El libro vinculado entero sigue en 403** (`OTRO_CLUB`, sin tocar): lo que
  cambió es que sus partidos contra el equipo del cliente llegan por su propio
  libro.
- **Sin duplicar**: un partido que MotorStats escribió en los dos libros entra
  una vez, y gana el de la zona. La clave es la del índice.
- **Un vinculado ilegible no tumba la zona**: se informa en
  `vinculadosCaidos` y el resto sirve.
- **La respuesta dice qué entró** (`vinculados`: etiqueta, rol, partidos,
  fases), nunca el sheetId.
- **La fase entra como una más**: el selector la ofrece normal, con
  estadísticas, y el MODO LLAVE del punto 76 queda solo para una fase donde
  el equipo no jugó ningún partido.

**Consecuencia a tener presente:** en una fase todos contra todos
(permanencia) el rival que también jugó con otros se ve con su promedio
**contra nosotros**, no el de la fase entera, y sin jugadores. Es lo que dice
la regla; mostrar su promedio real sería mostrar partidos ajenos.

### La llave suma las otras series sin repetir

`mezclarLlave` ya no descarta una fase que está en el libro propio: el libro
trae los partidos de SU equipo y la llave del servidor los de todos, así que
suma lo que falta con la clave fecha + los dos equipos (del lado que sea). Lo
del libro gana, porque trae el box score detrás. `llave.js` junta los
resultados de **todos** los libros vinculados.

### La llave se declara en el Panel Master, y vive en KV

La tarjeta de cada torneo suma dos bloques:

- **📚 Libros vinculados**: nombre del tramo, rol, zonas que participan
  (casillas; ninguna = todas) y el link del libro. Editar, vincular y
  desvincular pasan por el modal de confirmación (punto 30).
- **🔀 Cruces · la llave**: fases con su FASE en el libro, si cruza entre
  zonas, en qué libro se juega y a cuántos partidos es la serie; y los cruces,
  cada lado como `puesto + zona`, `Ganador de` o `Perdedor de` un cruce
  anterior. Se lee «1° Zona A vs 8° Zona A».

Reglas:

- **Se valida con el MISMO parser que usa el panel al leer**
  (`SGADD_FASES.parsear`, ahora vendorizado en `server/lib/compartido/`):
  la pantalla deshabilita guardar y el servidor rechaza una llave con errores.
  Una llave a medio declarar se ve igual que una buena hasta el día de los
  playoffs.
- **El editor no pierde lo que no conoce**: ventanas, `desde`, `hasta` y
  cualquier campo futuro viajan intactos (`_resto`).
- **La declaración viaja a la categoría enganchada** (`torneoDecl`, desde
  `catalogo.publico`), sin sheetId, y **gana sobre `torneos/<id>.json`**: el
  panel la funde con el archivo (del que conserva calendario y alias) en
  `docActual()`. Sin fases en KV, el panel sigue exactamente como antes.
- **Con un editor abierto la tarjeta ocupa la fila entera** (inline, no
  clase): en la grilla de tres columnas mide ~220 px.

### Verificado

- **Al revés, 17 mutaciones** y caen todas: maestras sin filtro (5),
  derivadas de sucios (5), sin re-derivar (2), ignorar `participan` (2), sin
  dedupe (1), TIPO de fases ajenas (1), sin la fusión en el handler (13),
  `participan` sin validar (2), la llave sin validar (1), el rol sin validar
  (1), desvincular una regular (1), mezclar sin dedupe (1), ignorar la llave
  de KV (1), el catálogo sin mandarla (3), las zonas con los libros adentro
  (2), el editor perdiendo la ventana (1) y la llave pisando en vez de juntar
  (5).
- **En el navegador**, con un torneo de dos zonas y dos libros vinculados
  inyectado: la tarjeta muestra los dos bloques, tipear no roba el foco, un
  lado «Ganador de» sin cruce deshabilita guardar con el mensaje del parser,
  y a 375 px no desborda nada.

### Pendiente

- **Cargar los libros reales** de playoffs/permanencia de APB y LAB cuando
  MotorStats los escriba, desde el Panel Master.
- **El selector de fase no dice de qué libro sale cada una**: el
  dato viaja (`vinculados`), falta mostrarlo si el club lo pide.


---

## 78. CADA ZONA VE SUS FASES, Y EL PUESTO DE OTRA ZONA TIENE NOMBRE (2026-09-30)

Reportado con capturas de un cliente de la Zona B de APB: el selector le
ofrecía «Playoffs - Zona A» (tres veces, con el mismo nombre) y los cruces
interzonales salían «a definir». `test-interzonal.js` (sección 7) fija todo
lo de acá, con un torneo calcado del catálogo real.

### Lo que se midió en KV antes de tocar nada

```
apb-2026-masculino · formato.fases (5, TODAS de eliminación, NINGUNA regular)
  Repechaje - Zona B/C   REPECHAJE B-C   en «repechaje»        participan b,c
  Repechaje - Zona A/B   REPECHAJE A-B   en «repechaje-a-b»    participan a,b
  Playoffs - Zona A ×3   CUARTOS · SEMIFINAL · FINAL  en «playoffs-zona-a»  participan a
```

**Dos defectos, independientes:**

1. **La declaración es del TORNEO entero y nadie la recortaba por zona.**
   `enriquecerTramos` sumaba una opción «· llave» por cada fase entre zonas,
   sin mirar a quién le toca.
2. **«A definir» era un defecto del SERVIDOR, no de privacidad.**
   `faseRegular()` de `llave.js` tomaba la PRIMERA fase declarada como la
   regular. El editor de cruces guarda solo las de eliminación, así que la
   primera era «REPECHAJE B-C»: cada zona se armaba con esa fase, que su
   libro no tiene, y salía con **0 filas**. Medido: Zona B 0 filas con esa
   fase, 12 con REGULAR. Todos los puestos de otra zona quedaban pendientes.

### La pertenencia por zona · `SGADD_FASES.asignarZonas`

Cada fase lleva `zonas` (y `zonasOrigen`), en cascada:

```
1. declaradas     formato.fases[i].zonas, editable en el Panel Master
2. de sus cruces  los puestos, y las de los cruces referidos («Ganador P5» hereda P5)
3. del libro      los `participan` del libro donde se juega (zonaLibro)
4. ninguna        la fase es de TODAS (la regular, una fase sin cruces)
```

- **La deducción cubre lo que ya está en KV sin migrar nada**: los tres
  playoffs dan `a`, los repechajes `b,c` y `a,b`.
- **Una zona declarada que el torneo no tiene es error**, en el editor y en
  el servidor (`parsear(formato, { zonasValidas })`, el mismo parser). Un
  libro vinculado no es una zona de fase.
- **Ninguna tildada = se deduce**: una llave vieja no cambia de visibilidad
  por pasar por el editor.

### Mostrar no es resolver

Una final A-B la ve la Zona B, y su «Ganador P9» necesita la semifinal A.
Por eso hay dos listas:

| | qué es | quién la usa |
|---|---|---|
| `declaradas()` | todas las que llegaron | `llave()`, para resolver |
| `visibles()` | las de la zona de la categoría ABIERTA | selector, columnas de la llave, Fixture |

`dependenciasDe(fases, visibles)` arma lo que hace falta cargar. **Se filtra
por la zona del libro abierto y no por el rol**: el admin que mira la Zona B
ve lo mismo que su cliente.

### El servidor recorta en los dos lados

- **`catalogo.publico` → `torneoDecl`**: el cliente recibe las fases de su
  zona más sus dependencias; el admin, todas. Los libros vinculados viajan
  con sus `participan` (solo ids de zona).
- **`/api/v1/torneos/:torneo/llave` → `paraZonas()`**: tablas de las zonas
  que cruzan sus fases (la Zona A no recibe la tabla de la C) y partidos de
  esas fases. El caché sigue siendo uno por torneo; el recorte es por pedido.

### El mismo valor de FASE en dos libros no se cruza

«SEMIFINAL» de los playoffs A y de los B es la misma celda en dos libros.
Cada partido de la postemporada viaja con `zonaLibro` (el id de la zona
vinculada, **nunca el sheetId**) y `mezclarLlave` solo le da a una fase los
de SU libro. En el navegador, el libro propio alimenta solo las fases de su
zona.

### `faseRegular()` es la de LIGA

La fase de liga declarada; sin ninguna, `REGULAR`. Y si el libro no trae la
declarada, `tablaDeZona` cae a `REGULAR` antes que dejar la zona vacía.

### Nombres repetidos

`desambiguarEtiquetas()`: dos fases con el mismo nombre suman su instancia
del núcleo — «Playoffs - Zona A · Cuartos de final». El nombre declarado
queda en `labelDeclarado`.

### Verificado

- **Con los datos reales** de KV y Google, llamando al handler local con
  tokens de Deportivo (Zona B) y Reconquista (Zona A): la B recibe sus dos
  repechajes y las tablas A 12 · B 12 · C 11; «4° Zona C» es CAPITAL CHICA.
  La A recibe sus playoffs y las tablas A y B, sin la C.
- **En el navegador** (v252), la barra real con la declaración real
  inyectada: Zona B ofrece solo los dos repechajes; Zona A, sus playoffs
  con nombres distintos.
- **Al revés, 12 mutaciones**, todas caen: sin `asignarZonas` 15,
  `paraZonas` identidad 3, zona inexistente aceptada 3, `visibles` =
  `declaradas` 2, `torneoDecl` sin zona 2, y 1 cada una sin dependencias,
  sin desambiguar, `mezclarLlave` sin `zonaLibro`, zonas declaradas
  ignoradas, `faseRegular` = primera, servidor sin `zonasValidas` y editor
  sin zonas.

### Pendiente

- **El backend hay que desplegarlo** (`cd server && npx vercel --prod`):
  sin eso producción sigue con las tablas vacías.

---

## 102. EL TORNEO CUENTA LOS MISMOS PARTIDOS QUE EL CLUB (2026-10-10)

Reportado en APB: la tabla de la zona vista desde el torneo mostraba menos
partidos que la del club. Regla del club: **el dato bueno es el del cliente**.

### Lo medido en KV antes de tocar nada
Los partidos sin estadísticas (punto 44) se cargan en el CLIENTE, y la
entrada del torneo no tenía ninguno:

```
deportivo · sudamerica · hogar-social · universitario   IDA|REGULAR · 2 partidos (09/07)
apb-2026-masculino / apb-2026-b                         0
```

Los clientes existían antes que el torneo: la zona tomó su libro por
`--libro-de` y `vincular` no hereda cuando el cliente ya leía ese libro. No
era solo la pantalla del admin: `llave.js` armaba con esa tabla los PUESTOS
de la Zona B que reciben las otras zonas.

### El arreglo · solo servidor (sin `?v=`)
- **`mutar.manualesDeZona(cat, torneo, slug)`**: los de la zona son la UNIÓN
  de lo propio del torneo con lo de los clientes ENGANCHADOS a esa zona y de
  los que leen su MISMO LIBRO, haya o no enganche declarado. Sin repetir
  (`unirManuales`: por id y por fecha + equipos). Se deriva al leer, como las
  capas del punto 101: el catálogo no se escribe.
- Lo usan `catalogo.publico` (un torneo publica `manualesDeTorneo`, así el
  panel pinta la tabla, las tarjetas y la ficha con el mismo PJ) y
  `llave.tablaDeZona` (recibe el catálogo).
- **El cliente sigue recibiendo lo que ÉL cargó**: la unión es del torneo.
- **`vincular` hereda también sin estrenar libro** (`heredarDelLibro`, que no
  pisa): el cliente previo que no tenía zonas ni partidos los recibe.
- La llave se cachea 5 minutos por torneo: un partido recién cargado puede
  tardar eso en moverle el puesto a la otra zona.

### Lo que NO quedó resuelto · una clave vieja en Reconquista
`reconquista.partidosManuales` tiene 2 partidos (09/07, IDA|REGULAR) bajo
`naranja-u21-clausura-2026`, el id de planilla del JSON (punto 54). El
servidor no conoce esa clave, así que no llegan a ninguna zona. Y no se
atribuyen por los equipos: «RECONQUISTA 'A' vs UNION VECINAL 'A'» existe en
la Zona A de Primera y en la U21 — con dos candidatos no se elige.

**Decidido por el club (2026-10-13): son de la U21** (09/07, Ida). Falta
volver a publicarlos desde el Panel Master → Reconquista → categoría U21 →
Configuración → partidos sin estadísticas (tramo Ida) → Publicar, alcance
«solo este cliente». Después, la zona U21 de APB Formativas tiene que
mostrar el mismo PJ que la ficha de Reconquista U21 (hasta 5 minutos, por
el caché de la llave). Es una escritura del catálogo: la hace el club.

Tests: `test-interzonal.js`, sección «1 ter bis». Al revés: sin la unión
caen 5, sin el respaldo por mismo libro 3, sin la herencia al enganchar 1.

## 126. EL FIXTURE QUE SE PEGA EN EL PANEL MASTER · Volcala, jornadas y el modo `auto` (2026-10-16)

Pedido del club: que Bahía Blanca muestre en Fixture lo que falta jugar y sus
fases, y que un torneo nuevo se conecte pegando los links, sin código ni
Claude. `test-fixture-auto.js` fija todo lo de acá contra markup REAL de las
dos páginas (`test-fixtures/bahia/`). Assets en `?v=285`.

### Los dos lectores nuevos (`server/lib/fixture-fuentes.js`, puros)

| Lector | Qué lee | Qué devuelve |
|---|---|---|
| `volcala` | el JSON `"matches":[…]` del payload de Next.js (`self.__next_f.push`), no el HTML dibujado | fecha, hora, estado, marcador, **ronda**, **instancia** y **cancha** (`sede`) |
| `jornadas` | una nota de texto: «JORNADA N – Jueves 20 de agosto» y un cruce por renglón (la ABB en WordPress) | partidos ESTRUCTURALES (sin hora ni marcador) y la `estructura` de la postemporada: instancia, días y serie |

- **`instanciaDe(ronda)`** lee la fase por palabra clave (play-in, octavos,
  cuartos, semis, final, final extra, permanencia, promoción, regular) y la
  etapa (Apertura/Clausura) si el rótulo la dice. Lo que no reconoce viaja
  como `OTRA` con su texto. **Nunca se deduce de la fecha.**
- Volcala: el marcador se toma **solo de un partido terminado** (uno en juego
  trae el parcial en el mismo campo). `$undefined` es «sin dato».
- Jornadas: un renglón es cruce solo debajo de un encabezado de jornada; el
  año sale del primer `dd/mm/aaaa` de la página; los tags en línea no cortan
  renglón («<u>PL</u><u>AY-</u><u>IN</u>»); un título con números («Del 7° al
  10° … Play-In») no abre sección. **Lo que la nota no dice no se inventa**:
  «al mejor de» sin número queda `mejorDe: null`, el play-in con «lunes 02
  de» incompleto queda con el único día completo.

### El modo `auto` · pegar el link y listo

`fixture.adaptador: 'auto'` y cada URL elige su lector por el sitio
(`adaptadorDeUrl`): volcala.com, basket-club.com y apdeb.com.ar tienen el
suyo; **cualquier otro sitio se intenta como «jornadas»** y, si no cuadra, el
aviso lo dice. Una zona puede juntar varias fuentes. `refrescar` le pasa la
`url` al parser.

### El fixture estructural que otra fuente ya cubre

La nota trae el día PLANIFICADO; Volcala, el real (Jornada 10: 22/10 contra
27/10). Una fila estructural se descarta si el mismo par (en cualquier orden)
tiene una fila no estructural a **14 días o menos** — en el servidor con el
texto crudo y otra vez en el panel después del alias (`sinEstructuralesCubiertos`
en los dos), porque la ABB escribe «Leandro Alem» y «Oimpo». Una estructural
sin cruce real cerca **se queda**: es el respaldo de lo no publicado.

### El panel · Fixture

- Cada fila lleva su ronda debajo de la fecha y la cancha en el `title`.
- **Lo que falta jugar** lleva barra del acento en la primera celda
  (`.fila-por-jugar`, a mano en el `<style>`, con su variante de papel) y el
  texto «por jugar»: no solo color (punto 14).
- **«Estructura del torneo»** (`estructuraTorneo`, `bloqueEstructura`): una
  fila por fase con sus días, jugados y por jugar, y «en curso» / «por
  jugar» escrito. Las fases que la liga ANUNCIÓ sin cruces entran con sus
  días y «cruces a definir»; una anunciada se considera cubierta solo si una
  fase de la misma instancia tiene partidos en esos días (los cuartos de
  junio no tapan a los de noviembre). Sin instancias el bloque no se dibuja.
- **La partición por fase de la barra NO cambió** (punto 75): la instancia de
  la fuente se muestra, no filtra.

### Panel Master · «📅 Fuente del fixture» en la tarjeta del torneo

Un textarea por zona, un link por renglón; dice con qué lector se va a leer
cada uno, guarda por el modal de confirmación (`accion: 'torneo'` con
`fixture`) y **«Probar lo guardado»** baja la fuente en el acto
(`?refrescar=1`, solo admin) y cuenta partidos por zona. Sin links, `fixture:
null` y el torneo vuelve al calendario de su archivo. Conserva lo que no se
edita ahí (la `categoria` de apdeb, el piso `desde`).

- **El servidor valida** con el MISMO `configDe` que lee al bajar
  (`torneos.js`): sin un link http(s) o con una zona que el torneo no tiene,
  se rechaza. El admin recibe `fixture` en el catálogo para poder editarla.
- `LECTORES` del panel es copia de `SITIOS` del servidor y hay un test que
  compara.

### Bahía Blanca

`torneos/bahia-blanca-2026.json` declara Volcala + la nota de la ABB, y los
alias «LEANDRO ALEM» y «OIMPO». Medido con las páginas del 2026-10-16: 163
partidos, ninguno duplicado, los 12 equipos cruzan con el libro; la
estructura muestra la fase regular en curso, los playoffs del Apertura y las
7 instancias anunciadas de noviembre-diciembre. **No se declaran zonas de
tabla**: el reglamento arrastra el 50 % de los puntos del Apertura y el panel
ordena por PCT.

### Para que llegue a producción (lo corre el club)

1. Deploy del backend (lectores, ventana, validación y `fixture` en el
   catálogo): `cd server && npx vercel --prod`.
2. Cargar la fuente en el catálogo de KV: desde el Panel Master (Bahía →
   📅 Fuente del fixture → pegar los dos links → Guardar) o con
   `node server/bin/catalogo.js torneo --archivo torneos/bahia-blanca-2026.json`.
3. Push del front (`?v=285`).

---

## 132. EL DESEMPATE OFICIAL FIBA EN LA TABLA DE POSICIONES (2026-10-19)

Pedido: aplicar el Apéndice D del reglamento FIBA. `test-desempate-fiba.js`
fija todo. Assets en `?v=291`.

### La auditoría, antes de escribir

- **El orden vive en UN motor**: `SGADD_CLASIF.ordenar` (cascada de
  `ordenTabla`, el nombre como último criterio). Lo usan Clasificación, el
  resumen de Principal, la llave (`sgadd-fases.js`) y el servidor
  (`server/rutas/llave.js` por `server/lib/compartido/`), así que el cambio
  llega a todos solo.
- **Nadie ordenaba por FIBA.** Todos los clubes declaran `PCT › DIF › PF`
  explícito (los tres JSON, el respaldo de `SGADD_CONFIG.parsear` y las
  zonas que arma `server/lib/torneos.js`). Con un empate en PCT decidía la
  diferencia GENERAL, no el duelo directo.
- **La ingesta no arma tablas**: copia la del sitio (`parsers/secciones.js`).
- **La incomparecencia (0 puntos) NO existe en el dato**: `RESULTADO` es
  GANADO/PERDIDO y la carga manual no tiene campo. No se inventa: un W.O.
  suma 1 como cualquier derrota hasta que el dato exista.

### El procedimiento · `ordenTabla: ["FIBA"]`

```
D.1  puntos de tabla (2 ganado · 1 perdido)
D.2  entre los empatados, mini-tabla con SOLO sus partidos: puntos → diferencia → PF
D.3  un subgrupo que sigue empatado VUELVE A EMPEZAR con solo sus partidos
D.4  si la mini-tabla no separa: cociente general PF/PC (PC = 0 → el mejor; 0/0 → 0)
     empate total: por nombre (FIBA sortea; un sorteo no se reproduce)
```

- **Los partidos salen del índice emparejando las dos filas por `__id`**
  (FECHA + PARTIDO, como `rivalDe`), y de los **manuales**: un partido sin
  estadísticas cuenta en el duelo igual que en la tabla.
- **Es TERMINAL**: con `FIBA` en la lista, los otros criterios no se usan.
- Cada fila resuelta lleva `desempate` (qué la decidió): queda para auditar.

### La decisión: opt-in, no default

`ORDEN_POR_DEFECTO` sigue `PCT › DIF › PF`. Ordenar por PUNTOS con PJ
distintos (partidos postergados) reordena la tabla de todos los clientes y
mueve los puestos que la llave le manda a las otras zonas (punto 76). Eso
lo decide el club, no un deploy. Se activa por bloque desde **Configuración
→ Desempate** («FIBA · puntos, duelo directo y mini-tabla») + Publicar, o
con `ordenTabla: ["FIBA"]` en `clubes/<club>.json`. Para un torneo, en su
`competencia.ordenTabla` del catálogo.

Verificado al revés, ocho mutaciones, todas caen: sin FIBA en `ordenar`
12, mini-tabla vacía 12, sin diferencia 4, sin la vuelta a empezar 3, sin
manuales 2, y 1 cada una sin cociente, PC = 0 crudo y sin PF.

---

## 133. ARRASTRE DE PUNTOS, FASES POR TORNEO Y EL DESEMPATE DE LA CATEGORÍA (2026-10-19)

Pedido: el caso Bahía Blanca (Olimpo le ganó a Alem el duelo directo y la
tabla los mostraba al revés) y una temporada Apertura + Clausura con arrastre
del 50 %, play-in, permanencia, promoción, playoffs y final extra, todo
gestionable desde el Panel Master. El manual reusable es
[`DOCUMENTACION_FASES.md`](DOCUMENTACION_FASES.md); `test-arrastre-fases.js`
fija todo lo de acá. Assets en `?v=292`.

### 1 · Bahía: no era el motor, era la config

Medido sobre el libro real (`APERTURA|REGULAR`, 66 partidos): OLIMPO y LEANDRO
N.ALEM 4-7; OLIMPO ganó 81-77 el 26/03; ALEM tiene mejor diferencia (−30
contra −85). Con FIBA el motor ya daba OLIMPO 9° y ALEM 10° («duelo
directo»); el catálogo publicaba `PCT › DIF › PF` en el torneo y en
`porCategoria.bahia-blanca-2026-oro`. Se arregla publicando FIBA (Panel
Master → Configuración → Desempate → Publicar): es una escritura de KV y la
hace el club.

**Y había un bug que habría tapado el arreglo:** la tabla, la llave del
navegador y `llave.js` leían `ordenTabla` del bloque del CLUB (`r.config`), no
del de la categoría (`r.bloque`). Un FIBA publicado «solo para esta categoría»
no se aplicaba. Ahora todo pasa por `clasifReglasDeTramo(torneo, fase)`
(formato + orden del bloque + arrastre calculado) y `clasifTablaDeTramo`, y
el servidor resuelve con `sgadd-config.js`, que se sumó a `compartido/`.

### 2 · El arrastre · `formatos[id].arrastre = { faseOrigen, porcentaje }`

En `SGADD_CONFIG` (`normalizarArrastre`, `arrastreDeTramo`) y
`SGADD_CLASIF` (`puntosArrastre`, `aplicarArrastre`, `ordenConArrastre`).

- **Suma solo puntos** (2 G · 1 P): PJ, PG, PP, PF, PC, DIF, PCT y la
  mini-tabla FIBA son del tramo. La tabla suma las columnas **Pts** y **Arr.**
  (Pts también aparece con FIBA o PTS sin arrastre: sin ella el orden no se
  podía auditar), y la fila desempatada lleva `*` y el motivo en el `title`.
- **Ordena por puntos**: con un orden sin PTS ni FIBA se antepone PTS y la
  pantalla lo dice.
- El origen aporta lo que sumó jugando (con manuales, sin su propio arrastre:
  no se encadena). **Nunca en `*TOTAL*`** (ya suma el origen) ni en un tramo
  del mismo torneo que el origen. El que no debutó entra con 0 PJ
  (`soloArrastre`).
- Validación: aviso con desempate por porcentaje, aviso con un origen que el
  libro no trae, error si un tramo arrastra de sí mismo.

### 3 · Fases: `torneo`, `tabla`, lado `externo`, `condicion`

En `SGADD_FASES.parsear`: `torneo` (valor de la columna TORNEO: separa los
cuartos del Apertura de los del Clausura), `tabla` (`TORNEO|FASE` de la que
salen los puestos; un lado puede pisarla), lado `{ externo, equipo? }` y
`condicion: 'distintos'` (la final extra: con el mismo equipo de los dos
lados, «No se juega»). `declaradaDe(fases, fase, torneo)` y el contexto de la
llave usan el torneo; `ctx.tablasPorTramo` trae la tabla de cada tramo pedido,
la MISMA de Clasificación. **Con `tabla` declarada y sin esa tabla, el puesto
queda «a definir»**: nunca se toma otra (el acumulado daría otro 7°). El
servidor manda `torneo` en los partidos de la postemporada y `tramo` en cada
tabla.

Lo que NO hubo que construir: los playoffs no suman a la regular (el índice
está scopeado por TORNEO|FASE desde el punto 3 ter) y el acumulado de la
temporada es `*TOTAL*|REGULAR`. Los dos tienen tests nuevos.

### 4 · Autogestión desde la UI

- **Configuración → Zonas de la tabla**: crear, renombrar y borrar formatos;
  «Arrastre de puntos» por formato; «Tramos y su formato» pasó de solo lectura
  a un selector por tramo (comodín / sin zonas / formato) y permite declarar un
  tramo que el libro todavía no trae. Todo viaja con «Publicar» (la acción
  `zonas` guarda el bloque tal cual).
- **Editor de cruces** (tarjeta del torneo): «TORNEO en el libro», «Puestos de
  la tabla», nombre del cruce, lados «Equipo fijo» y «De otro torneo», y la
  casilla «solo si son distintos». **Antes un lado `equipo` se perdía al pasar
  por el editor**; ya no.

### Verificado

Suite entera en verde (62 archivos). Al revés, ocho mutaciones, todas caen:
orden del club en vez del bloque 7, arrastre sin aplicar 4, partidos de la fase
sin filtrar por torneo 2, sin la condición 2, y 1 cada una la tabla equivocada
para un puesto, `declaradaDe` sin torneo, el arrastre en el TOTAL y no
anteponer PTS. En el navegador, sobre la demo con un Apertura/Clausura armado
en memoria: columna Arr. (40,5 = 29 + 11,5), aviso del arrastre, Pts y
desempates en la tabla FIBA, y los controles nuevos de Configuración sin
errores de consola. **No verificado en un PDF ni contra el libro de Bahía con
playoffs**: hoy el libro solo trae `APERTURA|REGULAR`.

### Lo que hace el club (escrituras de KV)

1. Desempate FIBA de Bahía: Panel Master → Bahía Blanca 2026 · Oro →
   Configuración → Zonas de la tabla → Desempate «FIBA» → Publicar.
2. Formato de la Clausura con el arrastre, y la asignación de tramos.
3. La llave, cuando MotorStats escriba los playoffs: los valores de FASE y
   TORNEO de cada instancia salen del nombre de la carpeta.
4. Deploy del backend (`llave.js` y `compartido/sgadd-config.js`).

---

## 134. LA CARPETA AL REVÉS · una sola opción para la fase del libro vinculado (2026-10-19)

Reportado en Bahía Blanca · Primera Oro: el selector mostraba
«Octavos - Apertura» (el tramo con datos) **y** «Octavos de Final -
APERTURA · llave», y la segunda abría «Fase entre zonas · solo la llave»
sobre un libro que el cliente sí recibe. Assets en `?v=293`;
`test-arrastre-fases.js` (secciones 6 y 6 bis) lo fija.

### Lo medido (solo lectura de KV y del libro)

```
catálogo   fase «octavos»: libro [APERTURA] · torneo APERTURA · zonaLibro octavos-apertura · cruce zona
libro      bahia-blanca-2026-octavos-apertura → un solo tramo: OCTAVOS|APERTURA
```

MotorStats arma TORNEO y FASE del nombre de la carpeta («TORNEO - FASE»), y
la carpeta se llamó «OCTAVOS - APERTURA»: el libro trae TORNEO = OCTAVOS y
FASE = APERTURA. La declaración exigía torneo APERTURA, no calzaba, y
`enriquecerTramos` sumaba la fase como llave. **No era un problema de
acceso**: el cliente ya recibía los partidos por la fusión del punto 77.

### El arreglo · `SGADD_FASES.calza(f, fase, torneo)`

UN criterio para decidir si una fase declarada es un tramo del libro, que
usan el selector (`enriquecerTramos`), `declaradaDe` / `tipoDe`, los
partidos de la fase en `contexto()` y los de la postemporada en
`mezclarLlave`. Además del cruce directo, reconoce la **carpeta al revés**
(`invertido`): el TORNEO es una instancia de eliminación del núcleo y la
FASE no. Ahí el torneo real es la FASE, y la instancia se compara con la de
la declaración (`instanciaDe`: la del libro si es del núcleo, si no la del
id o el nombre), así octavos y cuartos sobre el mismo valor no se cruzan.

- **El dato no se toca**: el id del tramo, la ruta y los links siguen
  siendo `OCTAVOS|APERTURA`. Solo cambia el nombre que muestra el selector
  (el del reglamento, sin «Octavos - » adelante) y que no se agrega la llave.
- Un tramo al revés sin declaración también es eliminación (`tipoDe`).
- **La llave se sigue ofreciendo** cuando el equipo de la categoría no jugó
  esa fase (su libro no trae el tramo). Para una fase de la propia zona el
  aviso ya no dice «entre zonas»: dice que llegan los partidos que jugó su
  equipo y que todavía no jugó ninguno.
- El servidor (`llave.js`) ya cruzaba la postemporada solo por FASE y libro:
  no cambió.

Verificado al revés: sin la detección de la carpeta invertida caen 11; con
el filtro viejo de `mezclarLlave`, 1.

**Lo prolijo sigue siendo nombrar la carpeta «APERTURA - OCTAVOS»** (o
declarar la fase con FASE = OCTAVOS): el panel ya no depende de eso.

---

## 135. EL ARRASTRE QUE NO SE VEÍA · un borrador local tapaba lo publicado (2026-10-19)

Reportado en Bahía Blanca · Primera Oro: con `CLAUSURA|REGULAR → formato2`
(arrastre del 50 % de `APERTURA|REGULAR`) publicado, la tabla de la
Clausura mostraba solo los puntos del tramo, sin la columna Arr. Assets en
`?v=294`; `test-arrastre-fases.js` (sección 7) lo fija.

### Lo medido (solo lectura de KV y del libro)

- **Lo publicado está bien**: el bloque de `leandro-n-alem` y el
  `porCategoria.bahia-blanca-2026-oro` del torneo declaran `formato2` con el
  arrastre y `CLAUSURA|REGULAR → formato2`.
- **El libro está bien**: `APERTURA|REGULAR` (132 filas) y
  `CLAUSURA|REGULAR` (108), con TORNEO y FASE bien escritos.
- **El motor ya lo calculaba**: con ese libro y esa config, en un `vm` con
  la app real, ESTUDIANTES da 11 + 8,5 = **19,5**, con las columnas Pts y
  Arr. Lo mismo desde el cliente (Alem) y desde el torneo. Producción ya
  servía ese código (`v293`).

### La causa · `vigente()` y «Guardar en este navegador»

`SGADD_CONFIG.vigente()` resuelve **borrador local → publicado → JSON**, y
publicar no borraba el borrador. Un «Guardado en este navegador» de antes
de declarar el arrastre seguía ganándole a lo publicado en el navegador de
quien publicó: la tabla salía con FIBA (de ese borrador) y sin arrastre, sin
ningún síntoma. Un cliente no tiene borrador y ve lo publicado.

### El arreglo

- **Publicar descarta el borrador local** (`configPublicar` →
  `borrarOverride`) y la pantalla dice «publicada en el servidor».
- **La tabla AVISA cuando usa un borrador local** (`clasifAvisoBorrador`,
  con el `origen` que ahora devuelve `clasifReglasDeTramo`), con la salida:
  «Volver al JSON del club» o publicar de nuevo.
- El arrastre sigue saliendo solo de la regular del origen (los cuartos del
  Apertura no suman) y los totales llevan el ,5 (`19,5`, `+8,5`).

Verificado al revés: sin el `borrarOverride` cae 1; sin el aviso, 1.

**En el navegador donde se publicó antes de este arreglo, el borrador viejo
sigue ahí**: hay que tocar «Volver al JSON del club» en Configuración (o
publicar de nuevo) una vez.

---

## 136. LOS PUESTOS DE LA LLAVE SALEN DE LA REGULAR DEL TORNEO DE LA FASE (2026-10-19)

Reportado en Bahía Blanca · Primera Oro: Clasificación (Apertura) dice
Estudiantes 5° y Villa Mitre 6°, y la llave armaba O1 = Villa Mitre vs
Independiente, que no calzaba con los partidos cargados. Assets en
`?v=295`; `test-arrastre-fases.js` (sección 8) lo fija.

### Lo medido (libros reales de la zona y de los octavos, solo lectura)

**No eran dos desempates FIBA distintos** (`resolverPuestos`, `matchearSeries`
y `sgadd-tablas.js` no existen: la llave vive en `sgadd-fases.js`). Era otra
TABLA. `contexto()` arma la tabla de la zona con `indicePara(hojas,
'REGULAR')`, que con dos torneos toma el `*TOTAL*` (Apertura + Clausura):

```
Clasificación · APERTURA|REGULAR   5 ESTUDIANTES · 6 VILLA MITRE · 7 PACIFICO · 8 LINIERS …
llave · *TOTAL*|REGULAR            5 VILLA MITRE · 6 PACIFICO · 7 LINIERS · 8 ALEM · 9 ESTUDIANTES …
```

Y el TOTAL figuraba «cerrada»: los cuatro cruces salían RESUELTOS con los
equipos equivocados, uno solo con serie y tres series jugadas sueltas.

### El arreglo · `tablaDeFase`

- **Una eliminatoria con `torneo` y sin `tabla` toma sus puestos de
  `<torneo>|<regular>`** (`ctx.tablaDeFase`, en `contexto()`), la misma
  `clasifTablaDeTramo` de Clasificación con su desempate y su arrastre. Con
  la carpeta al revés (`torneo: OCTAVOS`, `libro: [APERTURA]`, punto 134) el
  torneo real es la FASE del libro. Si ese tramo no está en el libro, queda
  la tabla de la zona, como antes. `tablaParaSlot` lo usa antes que la de la
  zona; una `tabla` declarada sigue mandando.
- **Segundo pase de series** (`llave()`): un cruce con los dos lados
  conocidos y sin serie toma la ÚNICA serie libre de la fase que comparte
  un equipo con él; los lados pasan a ser los de la serie (`porLoJugado`,
  resueltos). Con dos candidatas no se elige y quedan sueltas.

Medido con los libros reales: O1 Estudiantes–Independiente, O2 Villa
Mitre–Barrio Hospital, O3 Pacífico–Alem, O4 Liniers–Olimpo, las cuatro con
su serie y ninguna suelta. Al revés: sin la tabla del torneo caen 3; sin el
segundo pase, 2.

**El servidor (`llave.js`) no cambió**: arma las tablas de las OTRAS zonas
para la llave entre zonas. Bahía tiene una sola zona; un torneo multizona
con fases por torneo tendría que hacer lo mismo allá.

## 163. LAS ALERTAS DE PARTIDO EN EL CALENDARIO · -4 días, 09:00 (2026-11-01)

Para no revisar el fixture a mano: cada partido PROGRAMADO de Jujuy deja un
evento de 30 min en el Google Calendar del usuario, 4 días antes a las 09:00
de Argentina, con un popup a la hora exacta (la app de Calendar lo vuelve push).
Solo servidor, sin front: no sube el `?v=`. `test-alertas-partidos.js` fija todo.

```
server/lib/alertas-partidos.js   PURO: perfiles, planificar() y ejecutar()
server/lib/google-calendar.js    Calendar v3 con la Service Account (scope calendar.events)
server/rutas/alertas-partidos.js   GET /api/cron/alertas-partidos · CRON_SECRET o ADMIN
server/vercel.json               cron «0 10 * * *» (07:00 AR)
```

- **Idempotencia la pone Google**: el id del evento es un hash de
  `perfil|torneo|LOCAL|VISITANTE` (hex = base32hex válido) y un id repetido da 409.
  La clave NO lleva la fecha: una reprogramación PATCHea el mismo evento en vez de
  dejar el viejo y crear otro. Ida y vuelta se separan por la localía invertida.
- **Un evento borrado a mano no se repone** (queda `cancelled` y el id no se reusa).
- **Una alerta cuyo momento ya pasó no se crea** (un popup en el pasado no avisa):
  sale en `atrasadas` con el día en que debió avisar.
- **Los partidos salen del fixture de KV** (el mismo del panel) y, si está vencido,
  de la fuente declarada en el catálogo o de la de respaldo del perfil; con la
  fuente caída se usa la copia vieja. Sin nada: 502 y el calendario no se toca.
- **`?simular=1`** planifica y muestra (candidatas, atrasadas, id y hora de cada aviso) sin llamar a Calendar, sin pedir credenciales y sin escribir en KV: la primera mirada antes de tocar un calendario. Probar primero contra un calendario secundario «PRUEBA» (`ALERTAS_CALENDAR_ID`) y borrarlo al terminar.
- **Sumar otro equipo** es una entrada más en `PERFILES`.

### Para ponerlo a andar (lo hace el usuario)

1. Habilitar **Google Calendar API** en el proyecto de la Service Account.
2. En Google Calendar → el calendario de freytesgn@gmail.com → *Compartir con
   personas* → agregar `GOOGLE_SERVICE_ACCOUNT_EMAIL` con «Hacer cambios en eventos».
3. Deploy del backend (`cd server && npx vercel --prod`). `CRON_SECRET` ya existe.
   Opcional: `ALERTAS_CALENDAR_ID` para apuntar a otro calendario.
4. Probar a mano con un token de admin: `GET /api/cron/alertas-partidos`.
   El reporte dice creadas, iguales, atrasadas y el motivo exacto si falla algo
   (`CALENDARIO_NO_COMPARTIDO`, `CALENDAR_API_APAGADA`, `SIN_PERMISO_CALENDARIO`).

**No verificado contra Google real**: sin credenciales en la sesión, todo se probó
contra una API de mentira. El primer disparo real es la prueba de punta a punta.

---

## 164. LA DOBLE ALERTA DE CARGA DE LOS TORNEOS MANUALES (2026-11-01)

Donde no hay play-by-play automático alguien carga los partidos a mano. Solo
servidor (no sube el `?v=`). `test-carga-manual.js` fija todo.

```
server/lib/carga-manual.js   PURO: TORNEOS (APB masculino, APB formativas, Bahía), planificarPrevia / planificarControl
server/rutas/carga-manual.js   GET /api/cron/carga-manual?flujo=previa|control · CRON_SECRET o ADMIN · ?simular=1
server/vercel.json           previa «0 15 * * *» (12:00 AR) · control «0 10 * * *» (07:00 AR)
```

- **PREVIA**: cron 12:00 AR, evento de hoy 21:00 AR «⚠️ Mañana hay carga: N partidos programados», con la lista de mañana agrupada por torneo y zona.
- **CONTROL**: evento de hoy 09:00 AR «📋 Pendiente de Carga: Partidos jugados ayer (N)», checklist `☐ A 80 - 75 B` de lo jugado ayer (solo con marcador).
- **Calendario propio**: `TORNEOS_MANUALES_CALENDAR_ID` (motorstats.ar@gmail.com compartido con la Service Account). Nunca cae a `ALERTAS_CALENDAR_ID`.
- Los partidos salen de `partidosDe` de las alertas de Jujuy (fixture de KV o de la fuente del catálogo) para todas las zonas regulares del torneo. **Una zona que falla no se toma por «sin partidos»**: con alguna caída no se emite (502 `LECTURA_INCOMPLETA`); sin ninguna lectura tampoco.
- Un día sin partidos no genera evento. Id determinista por flujo y día. Un horario ya pasado no se crea.
- `asegurarEvento` ahora compara también la **descripción**: una reprogramación cambia la lista sin cambiar el título.
- Sumar un torneo manual es una entrada más en `TORNEOS`.
- **No verificado contra Google real** (probado con API de mentira); primero `?simular=1` con un token de admin.

### Corrección del 2026-11-02 · el cron leía zonas que no existen
La previa de las 12:00 AR no creó el evento: `zonasDe()` leía `entrada.zonas`, pero en el catálogo real las zonas viven en `categorias[slug].zona`, así que no encontraba ninguna y el cron respondía 502 `FIXTURE` sin tocar el calendario. El test usaba un catálogo inventado con `zonas` y no lo veía.
- **Los torneos manuales salen del catálogo** (`torneosManuales`): todo `tipo: 'torneo'` con `fixture` y ninguna zona con la capa `pbp`. Sin lista escrita a mano; `EXCLUIDOS` saca uno. Las zonas son las de `fixture.zonas` o, si no, las categorías regulares.
- El mismo cruce no se repite entre zonas de un torneo y las entidades HTML de la fuente («6&ordm;») se decodifican.
- **Disparo inmediato**: `node server/bin/carga-manual.js previa|control [--real]` corre el mismo handler con las credenciales de `server/.env` (necesita `TORNEOS_MANUALES_CALENDAR_ID` en el entorno). Sin `--real` simula.

### Ajuste del 2026-11-02 · qué dice cada evento
- **Previa** (cron 12:00 AR, evento 12:30 AR): lista los partidos de **HOY** de todos los torneos manuales, «Partidos a jugarse hoy DD/MM/AA (N)», con torneo, zona, hora y cruce.
- **Control** (cron 07:00 AR, evento 07:30 AR): «Se jugaron ayer DD/MM/AA: cargar resultados (N)», una línea `☐ local pts - pts visitante` por partido para tildar los cargados.
- **Todas las fechas de los textos van en DD/MM/AA** (`fechaCorta`); el id y la lógica interna siguen en ISO.
- `?forzar=1` (o `--forzar` en el bin) crea el evento aunque su horario ya haya pasado.


---

## 167. CLASIFICACIÓN Y FIXTURE · FASES POR TABLA Y POR LLAVE, BIEN CONECTADAS (2026-11-07)

Reportado en Bahía Blanca · Primera Oro (cliente Leandro N. Alem). Assets en `?v=360`.
`test-llave-bahia.js` fija todo, con la app real en un `vm`.

### Lo medido en los libros y en KV

```
zona oro                   APERTURA|REGULAR 132 · CLAUSURA|REGULAR 132
octavos-apertura           OCTAVOS|APERTURA 20        (carpeta al revés, punto 134)
postemporada-clausura      PLAY IN|CLAUSURA 4         (carpeta al revés, y «PLAY IN»)
fase declarada Play-In     libro ["PLAY IN"], SIN torneo, zonaLibro postemporada-clausura
```

**«PLAY IN» no era una instancia de eliminación**, así que `invertido` no reconocía la carpeta
al revés. Tres síntomas de la misma causa: el selector ponía «Play in - Clausura» en «Fase
regular» y repetía la fase como «Play-In - CLAUSURA · llave»; Clasificación le armaba una
**tabla de posiciones de 4 equipos** con los partidos del Play-In; y la llave del Clausura no
veía ningún partido jugado (`contexto()` buscaba la FASE «PLAY IN» y el libro dice «CLAUSURA»).

### El arreglo (motor, `sgadd-fases.js`)

- **`RE_ELIM_LIBRE`**: PLAY IN / PLAY-IN / PLAYIN, PLAYOFFS, PROMOCION, TERCER PUESTO, FINAL EXTRA,
  SUPER FINAL cuentan como eliminación aunque el núcleo no los nombre. `INSTANCIAS` suma PLAYIN.
- **`contexto()` toma los partidos de cada fase con UN criterio**: los tramos del libro que
  `calza` (derechos, al revés o por familia). Eran tres caminos y el de una fase sin `torneo`
  buscaba la FASE por su nombre declarado.
- **`torneoRealDe(f, hojas)`**: el torneo de una fase sin `torneo` sale del tramo al revés; de
  ahí la tabla regular de la que salen sus puestos (`tablaDeFase`).
- **El servidor** (`llave.js`, `paraZonas`) usa `calza` con el TORNEO del partido. Hay que
  desplegar el backend; mientras tanto el panel ya resuelve con su propio libro.

### La llave, simple

Cada lado: **escudo · nombre · puesto** («2°»), el puesto de la tabla de la que sale la fase
(`tablaDeReferencia`). La etiqueta larga va en el `title`. Proyectado: «~2°» con borde
punteado. Pendiente: «Ganador de Partido 3» y, si se sabe, «Liniers o Olimpo». Los partidos
son chips «P1 · 05/11 · 65–82» en el orden de la tarjeta. «Intrazonal» solo se dice en un
torneo de varias zonas (en la tarjeta y en el Fixture). CSS a mano en el `<style>` (`.fase-*`),
con `min-width: 0` en cada hijo del flex: era lo que sacaba los textos de la card a 375 px.

### Lo que viene · el camino del equipo (`camino`, `caminoHTML`)

Con la llave declarada y la tabla, el panel **anuncia el cruce aunque la liga no haya publicado
la fecha**: lo que viene (rival con su puesto, resuelto o proyectado, o los dos candidatos),
de dónde viene («Ganó 82–65 a Liniers») y de dónde viene el rival (su último cruce o su último
partido de la regular). Va arriba de la llave en Clasificación y arriba de todo en el Fixture;
en el Fixture reemplaza al vacío «Sin próximo partido declarado». En plena fase regular, con un
próximo partido declarado, solo aparece si el cruce ya está definido.

### Clasificación y Fixture en una eliminatoria

- **La tabla plegada debajo de la llave es la regular de la que salen los puestos**
  («Tabla de la que salen los puestos · Clausura · Regular»), con su arrastre y su desempate:
  nunca una tabla armada con los partidos de la llave.
- **El Fixture de una eliminatoria con datos** trae sus cruces arriba (antes solo en modo
  llave), lo jugado sale de TODAS las series de la fase y `tipoDe` / `declaradaDe` reciben el
  TORNEO del tramo. «También hay partidos de…» nombra las fases como el selector.
- La barra dice «Postemporada · N partidos jugados» en una eliminatoria, y en modo llave de
  una fase de la propia zona ya no dice «entre zonas».

### Panel Master

En el editor de cruces cada fase dice **cómo la lee el panel**: qué carpeta de Drive la
alimenta («CLAUSURA - CUARTOS» o al revés) y de qué tabla salen sus puestos.

### Lo que NO se tocó

El catálogo de KV (la declaración de Bahía sigue igual y ahora se lee bien) ni el núcleo
(`sgadd-core.js`). No verificado en PDF.


---

## 168. EL SELECTOR FILTRA, NO VACÍA · la temporada completa en Scouting y post-partido (2026-11-07)

Reportado en Bahía Blanca (cliente Leandro N. Alem). Assets en `?v=361`.

### Lo medido
- **Post-partido del Play-In (Alem vs Liniers, 05/11)**: «Plan contra realidad · No hay partidos anteriores», «el plan funcionó como siempre», «QUIROGA… dentro de su promedio». `idxPrevio` recortaba el tramo abierto (`PLAY IN|CLAUSURA`) y «PLAY IN» no es eliminación para el núcleo, así que no caía a la Regular: base vacía.
- **Scouting en «Cuartos de Final - CLAUSURA»** (modo llave): el índice era el del último tramo jugado por Alem (el Play-In, 4 equipos). NAPOSTA salía «sin partidos cargados» con 22 en la Regular.

### La regla nueva (decisión del club): la Regular es la norma, la postemporada el ajuste
- **`SGADD_MUESTRA.recortarTemporada(hojas, vent)`** junta TODOS los tramos del libro (regulares + postemporada) hasta `vent.hasta`, renombra la FASE a REGULAR en COPIAS y deduplica el partido escrito en dos libros (FECHA + PARTIDO + EQUIPO/NOMBRES; sin fecha no deduplica). Cuenta `regular` / `postemporada` / `porFase`. Va en `compartido/`.
- **`SGADD_APP.idxTemporada(hasta)`** (caché por libro) y **`enPostemporada()`** (modo llave, fase de eliminación del núcleo o declarada, carpeta al revés).
- **Post-partido**: `idxPrevio(fecha, { temporada: true })` = el acumulado de la temporada hasta el día anterior, SIEMPRE (también en la regular: el primer partido del Clausura ya no queda sin base). Sin `{ temporada }` sigue la vara del tramo (Ciclos no cambia).
- **Scouting**: en postemporada `scoutBase()` = temporada completa (con el injerto de rivales de otra zona sobre la misma base), con un aviso que va al papel: de qué está hecha la base y qué jugó cada equipo del cruce en esta postemporada («Alem 1 (1-0) · Naposta todavía no jugó»). Fuera de la postemporada, el tramo de la barra como siempre.
- **Esto revierte, a pedido del club, el «las fases no se mezclan» de los puntos 158, 160 y 161 para estas dos bases.** Los promedios de Equipos/Jugadores, Clasificación y el Fixture siguen por fase.
- **Textos honestos sin base** (`recomendar(…, conBase)`): «Sin partidos previos del equipo: no hay un habitual contra el cual medir» en vez de «funcionó como siempre», y el máximo anotador rival dice su promedio previo y en cuántos partidos, o que no hay con qué compararlo.

### Medido con el libro real (Node)
Temporada hasta el 04/11: 142 partidos (132 Regular + 10 Octavos); NAPOSTA 22 PJ, ALEM 25. El post-partido del Play-In arma el plan contra la realidad (9 filas) y la expectativa (34 % de victoria estimada; ganó por 17).

### Límites
- **Un cliente recibe de los libros de postemporada solo los partidos de SU equipo** (punto 77): la base del rival incluye su Regular pero no su postemporada.
- **No verificado en el navegador ni en PDF**: el panel de vista previa no abrió localhost en esa sesión.
- El Simulador (sección) sigue con la Regular en eliminación (punto 161).

### v362 · «En la postemporada del Clausura» cuenta solo la del Clausura
El aviso del Scouting sumaba toda la postemporada del equipo: con la barra en Cuartos del Clausura decía «ALEM 4 (3-1)» mezclando los Octavos del Apertura con el Play-In. `scoutTorneoPostemporada()` saca el torneo REAL de la fase elegida (en modo llave, de la fase declarada con `torneoRealDe`; si no, del tramo con la carpeta al revés resuelta) y `scoutPostemporadaDe` cuenta solo esos partidos: ALEM 1 (1-0). Sin torneo reconocible cuenta todo, como antes. La BASE del informe (temporada completa) no cambió. Test en `test-llave-bahia.js` sección 5.

## 169. EL RIVAL DE UNA SERIE LLEGA ENTERO DESDE UN LIBRO ENTRE ZONAS (2026-11-08)

Assets en `?v=363`. `server/lib/multilibro.js` (`filtrar`, `vinculadosDe`) y `js/sgadd-app.js` (`idxTemporada`). Revisa la regla del punto 77 a pedido del club: lo que el cuerpo técnico vería mirando los partidos del rival no se le esconde.

- **Lo medido antes de tocar nada**: en Bahía el límite no existía. Sus libros de postemporada declaran `participan: ['oro']`, la zona del cliente, así que llegan enteros (`propio`). En APB cada repechaje es una serie aislada: el rival no tiene otros partidos en ese libro. **Hoy no cambia nada en producción**; el cambio aplica a un libro entre zonas con varias rondas (los playoffs de la LAB, o una ronda siguiente de APB).
- **El rival** = el equipo que jugó contra el de la categoría en ese libro (con fecha). De sus OTROS partidos de ese libro entran sus filas de equipo y de jugador, y queda «limpio»: viajan sus promedios de la fase. La respuesta suma `vinculados[].delRival` (cuántos partidos entraron por él).
- **El tercer equipo** de esos partidos: entra SOLO su fila de equipo (Base Datos E y 4 FACTORES), como contexto para los ratings del rival esa noche. Sus jugadores y sus promedios no viajan nunca. En el índice de ESA fase del cliente aparece con esos partidos (es dato real, parcial); **en la base de la temporada no entra**: `idxTemporada` pasa `conservar` con los equipos que tienen filas de la fase regular.
- El recorte por plan de `Base Datos J` sigue igual después de la fusión.
- **Un torneo de UNA sola zona con `participan` vacío** también es libro de su zona (`propio`).
- `test-interzonal.js` 5 ter reescrito a la regla nueva (la permanencia trae el partido de los dos rivales entre sí) y suma el libro de rondas: River-Gimnasia entra, Jujuy-Villa Mitre no, los jugadores y promedios de Gimnasia no. `test-llave-bahia.js`: el equipo que solo está en la postemporada no entra a la temporada. Verificado al revés, tres mutaciones caen.
- **Requiere desplegar el backend** (`cd server && npx vercel --prod`). No verificado en el navegador.

