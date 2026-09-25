# Ingesta de la Liga Argentina 2026-27 · scraping, Sheets y el salto inicial

**Fecha:** 2026-09-25 · **Pregunta:** cómo se conecta el web scraping de La
Liga Argentina con la estructura de Sheets/JSON del sistema, tomando como
modelo cómo opera Jujuy Básquet hoy, y si Google Sheets sigue siendo un
middleware necesario o se puede prescindir de él.

**Respuesta corta:** Sheets **sigue haciendo falta**, y no como almacén sino
porque **es donde corre el motor de métricas**. El scraper produce un box
score; el panel consume 335 columnas derivadas. Quien salva esa distancia es
MotorStats, que es un Apps Script y vive adentro del Sheet. Sacar Sheets no
es cambiar de base de datos: es reescribir el motor.

---

## 1 · La cadena de hoy, medida

```
Gesdeportiva          MotorStats              Google Sheets        SGADD
(box score público)   (Apps Script)           (9 hojas/libro)      (el panel)
        │                   │                        │                │
        │  22 columnas      │  calcula 335           │  lee por API   │
        └──── por jugador ──┴─── columnas ───────────┴────────────────┘
```

Medido el 2026-09-25:

| | Valor |
|---|---|
| Columnas que el panel exige por contrato (`ESQUEMA`) | **335** en 9 hojas |
| Columnas que el box score de Gesdeportiva trae | **22** por jugador |
| Libro de Jujuy 2026 (el mayor) | **431.423 celdas · 3.030 KB** |

Las 313 columnas de diferencia no son formato: son `PLAYS`, `PPP`, `eFG%`,
`TS%`, `USG%`, `RTL%`, los cuatro factores, `PACE`, los ratings, y las dos
filas `EQUIPO TIPO` / `JUGADOR TIPO`, que son **la mediana de la liga** y
sostienen todos los percentiles del panel (puntos 3 y 4 del `CLAUDE.md`).

**El scraper ya existe y ya llega hasta la puerta del motor.**
`motorstats-ingestion` extrae el fixture, el box score, el play-by-play y el
mapa de tiros, y `src/mapeo-motorstats.js` produce dos salidas: la hoja
«Estadísticas» celda por celda —la misma forma que el Excel que el motor ya
sabe leer— y las filas crudas de `Base Datos J`. **No calcula ni una métrica
derivada, a propósito**: duplicarlas es el bug del rol funcional (punto 8),
con la diferencia de que acá las dos copias estarían en repos distintos.

---

## 2 · ¿Se puede prescindir de Sheets?

Tres vías, de menor a mayor costo. La recomendación es la 1.

### Vía 1 · Sheets se queda · RECOMENDADA

El scraper escribe la hoja «Estadísticas» de cada partido en el libro y el
motor corre **sin tocar una línea**. Es lo que ya está construido y validado
contra un Excel real (`poc-extraccion.js`, partido de control Salta 70-82
Estudiantes).

Qué se gana: los datos entran sin descargar un Excel a mano.
Qué cuesta: nada nuevo.

**Y hay un motivo que no es técnico: la planilla es la superficie de
auditoría del club.** El `CLAUDE.md` lo repite en cinco puntos —«la hoja es
lo que el club audita»— y es por lo que `AST-PP` respeta la convención del
motor aunque el panel podría calcularla mejor (punto 3), y por lo que los
ratings por 100 posesiones se derivan en el panel **sin tocar la columna de
la hoja** (punto 66). Sacar Sheets le saca al cuerpo técnico el lugar donde
verifica un número cuando no le cierra.

### Vía 2 · El motor lee JSON en vez de Excel

`filasBaseDatosJ()` ya emite las columnas crudas con los nombres finales.
Haría falta una entrada en MotorStats que reciba ese JSON. **Sheets sigue
estando** —el motor sigue escribiendo ahí— pero se deja de depender de la
forma del Excel.

Qué cuesta: un cambio en MotorStats, que es el otro repo.

### Vía 3 · Sin Sheets

Hay que reimplementar las 313 columnas derivadas fuera del Apps Script, y
entonces existen **dos motores de métricas**. El proyecto ya sabe cómo
termina eso: es el punto 8 del `CLAUDE.md`, y acá las dos copias no estarían
ni siquiera en el mismo repositorio. Además el panel es estático y el
backend es serverless: el cálculo tendría que vivir en el backend, que hoy
solo lee y recorta.

**No se recomienda hasta que el motor no tenga otra razón para mudarse.**

---

## 3 · El salto inicial · qué dejar configurado ANTES de la primera fecha

La Liga Argentina 2026-27 arranca el **15/10/2026**. El torneo ya está
declarado en el catálogo con sus dos conferencias (punto 67) y **sin libro**:
esto es lo que falta, en orden.

### Paso 1 · Un libro por CONFERENCIA

Norte y Sur son dos competencias con planteles y tablas independientes, así
que son **dos libros**, no dos pestañas. Es cómo opera Jujuy hoy: su libro es
el de la Conferencia Norte 25/26 y contiene a los 17 equipos, no solo a
Jujuy.

Cada libro lleva las **9 hojas con los nombres exactos**: `PROMEDIOS E`,
`ACUMULADO E`, `Base Datos E`, `PROMEDIOS 4F`, `ACUMULADO 4F`,
`4 FACTORES`, `PROMEDIOS J`, `ACUMULADO J`, `Base Datos J`. Los crea
MotorStats con sus `ENCABEZADOS_FINALES_*`, que son la misma especificación
que el `ESQUEMA` del panel.

### Paso 2 · Compartirlo con la Service Account

Lector alcanza. Se verifica **antes** de conectarlo:

```bash
node server/bin/probar-google.js --sheets "norte=<sheetId>,sur=<sheetId>"
```

Distingue «no compartida» de «no existe», que dan el mismo 401 por GViz y se
arreglan al revés (punto 18 bis). Es el chequeo que evitó perder una tarde
con la U21.

### Paso 3 · Conectarlo al torneo

```bash
node server/bin/catalogo.js torneo --archivo torneos/liga-argentina-2026-27.json \
  --libro "norte=<sheetId>,sur=<sheetId>"
```

El libro **se propaga solo** a los clientes ya enganchados: Jujuy está
enganchado a la Norte desde hoy y lo recibe en su próxima carga, sin que
nadie lo vuelva a tocar (punto 67).

### Paso 4 · Nada más

El `sheetId` **no va al repo**: `torneos/<id>.json` es público y hay un test
que falla si aparece algo con esa forma.

---

## 4 · Qué pasa entre el paso 1 y el primer partido

Es el estado que más dura —de acá al 15/10— y el que nadie prueba. **Se
midió** el 2026-09-25 con un libro de 9 hojas y cero filas:

| Sección | Antes | Ahora |
|---|---|---|
| Principal | 0 equipos, 0 jugadores | igual, sin errores |
| Clasificación | «Sin partidos cargados en este tramo» | empty state que explica y manda al fixture |
| Equipos | «Muestra insuficiente · PJ mediano 0» | ídem |
| Jugadores | ídem | ídem |
| Fixture | *no existía* | el calendario publicado |

**Ninguna sección explotaba ni quedaba en blanco**: cero errores de
JavaScript en las tres, verificado con un espía sobre `window.onerror`. Lo
que estaba mal era el TEXTO: «con tan pocos partidos los percentiles no
distinguen una debilidad estructural de un mal día» describe una muestra
chica, no un torneo que no empezó, y el DT que entra en pretemporada concluye
que el panel falla.

### Lo que SÍ va a avisar, y está bien que avise

El **Diagnóstico** marca `error · La hoja no tiene filas de datos` en las 9
hojas mientras el libro esté vacío. **No se tocó**: ese error existe para
cazar un libro que debería tener datos y no los tiene —el caso del recálculo
a medias de la U21, punto 3 ter— y bajarlo a aviso lo apagaría justo para
ese caso. El Diagnóstico es una pantalla de admin y el cliente no la ve.

---

## 5 · Lo que el fixture aporta, y de dónde sale

La sección Fixture (punto 68) es **lo único que tiene algo que mostrar antes
del primer partido**, y por eso los empty states de las otras tres mandan
ahí.

```
CALENDARIO   torneos/<id>.json · lo que se va a jugar
ÍNDICE       el libro de MotorStats · lo que se jugó
```

**El marcador sale siempre del índice, nunca del calendario.** El calendario
es una declaración publicada semanas antes: si un partido se reprograma o se
define por secretaría, lo que vale es lo que MotorStats escribió. Y al revés,
un partido que el índice tiene y el calendario no se muestra igual — el
calendario de LAB es **parcial** (la liga publicó dos semanas) y descartar lo
jugado por no estar anunciado dejaría la sección mintiendo apenas empiece el
torneo.

El fixture cargado hoy son los **41 partidos anunciados** en la nota oficial
52871. El resto entra con el scraper cuando el sitio lo publique: hoy su
endpoint devuelve «No se encontraron partidos» para cualquier rango.

---

## 6 · Identidad visual LAB

Del manual de marca de ADC (Drive, `Manuales/LAB_Manual de Marca.pdf`), ya
cargado en `torneos/liga-argentina-2026-27.json`:

| | HEX |
|---|---|
| Zafiro (acento) | `#094AA8` |
| Celeste | `#39BAD8` |
| Naranja de la pelota | `#EC6628` |
| Hueso | `#F0EDE8` |
| Sombra | `#061B38` |

Tipografía titular: **Audiowide**.

**El logotipo no está en la carpeta de marca**: el propio manual dice
pedirlo en SVG o AI al Departamento de Marketing de ADC. Es lo único de
identidad que falta.

**Escudos**: 32 de los 34 equipos ya resuelven. Los dos que faltan —Unión de
Santa Fe y Racing de Avellaneda— son exactamente los dos que el sitio todavía
no lista, así que no hay de dónde sacarlos.

---

## 7 · Pendientes

1. **MotorStats crea los dos libros** (Norte y Sur) y se conectan con el
   comando del paso 3.
2. **El logotipo de LAB**, a pedir a ADC.
3. **Los escudos de Unión (SF) y Racing (A)**, cuando el sitio los publique.
4. **El fixture completo**, ídem: se regenera con el scraper.
5. **Dos fechas mal cargadas en el libro de la Zona C** (`27/05/2029` y
   `29/05/2029` sobre una temporada 2026). El panel las muestra donde el
   libro las pone y lo denuncia arriba de la sección; **la corrección va en
   la planilla**, no en el panel.
