# SGADD · Sistema de Gestión y Análisis de Datos Deportivos

Panel de scouting de básquet para **Club Reconquista La Plata**, multi-cliente.
Sitio estático publicado en GitHub Pages: `https://coachgn.github.io/estadisticas/`

Hablar siempre en **español rioplatense**, directo y técnico. Sin explicaciones de
principiante sobre el contenido técnico.

**Guía de diseño oficial: https://www.checklist.design/** — se consulta ante
cualquier duda de interfaz (microinteracciones, drawers, toasts, empty states,
focus rings, contraste WCAG, jerarquía en tablas y gráficos). Detalle y reglas
aplicadas en el punto 14.

---

## 1. Cómo correr y verificar

```bash
node test-core.js          # 336 tests · núcleo, índice, validador, num() con prefijo de división (punto 124)
node test-logos.js         #  39 tests · resolución de escudos
node test-ligas.js         #   9 tests · aislamiento entre ligas
node test-clubes.js        #  97 tests · multi-cliente
node test-config.js        # 318 tests · zonas de tabla, tramos, tonos AA, pestaña Torneo
node test-clasificacion.js #  57 tests · tabla de posiciones, orden, zonas y escudos
node test-llave-bahia.js   #  61 tests · fases por tabla y por llave: la carpeta al revés del Play-In, el selector,
                           #             lo jugado de cada fase, el camino del equipo y la tarjeta simple (punto 167)
node test-desempate-fiba.js # 37 tests · el desempate oficial FIBA: duelo directo, mini-tabla,
                           #             la vuelta a empezar (D.3), cociente y los manuales (punto 132)
node test-arrastre-fases.js # 112 tests · el arrastre de puntos, los playoffs que no tocan la regular,
                           #             el acumulado, las fases por torneo/tabla, la final extra y
                           #             el desempate de la CATEGORÍA (Olimpo / Alem) en la app real (punto 133)
node test-boot.js          # 184 tests · arranque por club, sintaxis de los módulos, carteles de espera
node test-jugadores.js     # 291 tests · rol, arquetipos, tiro, evolución, local/visitante, rankings
node test-4factores.js     #  96 tests · regresión, pesos de liga, perfil de equipo, Simulador 360°
node test-personalidad.js  #  20 tests · identidad táctica
node test-informe.js       #  45 tests · secciones del informe y su PDF
node test-partido.js       #  63 tests · detalle partido a partido, perfil de tiro y su PDF
node test-scouting.js      # 544 tests · informe pre-partido, bandas, marcas, tareas defensivas, sintesis,
                           #             titularidad, las SEÑALES compartidas y el menor de los males
node test-estados.js       # 182 tests · estados de jugador, alertas, buzon, sync grafico-tabla
node test-pdf.js           #  92 tests · nombre del archivo en las exportaciones
node test-permisos.js      # 406 tests · roles, planes, el gate, el selector, el hub, el ciclo,
                           #             la sesión, la landing y el glosario
node test-comparativa.js   #  67 tests · ciclos, tendencia contra nivel, cara a cara
node test-clientes.js      #  70 tests · el padrón de clientes, los cupos y el login
node test-confirmar.js     #  86 tests · el diff, publicar zonas, subclientes y tooltips
node test-acumulacion.js   #  46 tests · la suma entre tramos · REGRESIÓN, no tocar
                           #             y AST%, RO%, RD% y USG% del TOTAL contra la planilla (punto 24)
node test-ast-pp.js        #  22 tests · AST-PP con cero pérdidas = AST, igual que el motor
                           #             (v106) · por __acum, el TOTAL del jugador y el del equipo
node test-resiliencia.js   #  50 tests · rotación del token, KV caído, el tramo que se conserva
node test-jsonclub.js      # 115 tests · los JSON de club, el validador, el aislamiento y publicar
node test-pares.js         # 219 tests · el grupo de pares, la cascada y las 3 cards
node test-panelmaster.js   #  57 tests · la categoría que persiste, el reset y el toast
node test-manuales.js      # 175 tests · partidos sin box score: suman a la tabla, no a las métricas
node test-responsive.js    # 157 tests · desborde, targets táctiles, modales, el papel, el PIE
                           #             el aviso de version y el diagnostico del pie
node test-rankingpdf.js    # 112 tests · la quinta exportación: una tabla por CARD, con su orden
node test-demo.js          # 130 tests · la demo publica: el snapshot anonimizado, el
                           #             contrato cols↔filas, las cards y el modal
node test-alta.js          #  99 tests · el alta de clientes: reusar un libro, los equipos
                           #             del libro, el catálogo manda y el tipeo del formulario
node test-alcance.js       # 122 tests · los clientes del mismo libro: el alcance de un
                           #             cambio, la herencia, el color y que el cliente
                           #             lea lo publicado
node test-pj.js            #  41 tests · el PJ de la sección Equipos es el de la tabla
                           #             de posiciones, con los partidos sin estadísticas
node test-plan-racha.js    #  43 tests · la racha con partidos manuales, el plan
                           #             efectivo del catálogo y el arranque sin destello
node test-resto.js         # 137 tests · el resto del plantel en tabla, el piso de 5 min, la vía
                           #             de gol líder por partido y la ficha del Plan Oro
node test-niveles.js       # 670 tests · registro de umbrales, los 6 niveles, la PROCEDENCIA y los umbrales
                           #             que salen SOLO de la competencia, desde el primer partido (punto 130)
node test-similitud-etiquetas.js #  45 tests · la similitud multi-etiqueta contra el documento
                           #             de etiquetas, el caso Raineri/Benavidez y los afines
node test-estados-sync.js  #  74 tests · los estados compartidos en el servidor, dos sesiones
                           #             y que ninguna escritura del catálogo pise datos
node test-fichajes.js      # 221 tests · Fichajes: ficha manual, padrón, filtros, el servidor (punto 87), modelo y tiros (97)
                           #             · y PADRON J del libro, que completa las fichas sin pisarlas
node test-padron-j.js      #  35 tests · la pestaña PADRON J → fichas: fechas, claves, campos inválidos, fusión,
                           #             fotos y dorsales (punto 96)
node test-ficha-pdf.js     #  47 tests · la ficha en PDF a elección: las marcas data-subcard del render contra la
                           #             estructura, la poda sin huecos, la titularidad con el dato y el Pack PLANTEL (129)
node test-equipo-pdf.js    #  45 tests · el informe del EQUIPO a elección: las marcas data-subcard «equipo.» del render
                           #             contra la estructura, los atajos, la poda y el papel sin hojas huérfanas (131)
node test-pdf-layout.js    #  37 tests · claves arriba del resto, el flujo continuo, la
                           #             tabla que se parte por filas y que ningún :hover
                           #             pinte la hoja impresa
node test-router-jugadores.js # 12 tests · la pestaña Jugadores se pinta en el acto y
                           #             suelta el equipo de otra categoría
node test-clientes-estructura.js # 175 tests · club padre y categorías hijas: plan, estado,
                           #             equipo, vencimiento y ciclo ORO por categoría
node test-glosario.js      #  38 tests · el glosario sin la columna ni la card de hojas,
                           #             y PPP por jugada, en el archivo y en el generador
node test-cancha.js        #  41 tests · la cancha vectorial unificada (js/sgadd-cancha.js): misma geometría que
                           #             SGADD_PBP, marcadores ○/✕, perímetro fino de zonas y texto ↔ zona (Ciclos, fase 1)

node test-ciclos.js        #  55 tests · el informe de ciclo de 4 partidos (js/sgadd-ciclos.js): ventanas, transición contra la
                           #             liga, causas, esperado/real por cuarto, zonas, auditoría y comparar; y el dato REAL de la
                           #             ingesta (motorstats-ingestion/src/pbp/ciclos.js, bloque `ciclos` del paquete @3) (Ciclos, fase 2)

node test-ciclosui.js      #  31 tests · la sección Ciclos (js/sgadd-ciclosui.js): selector de ciclo, bento, cancha con zonas
                           #             citadas, comparar sin tendencia, paquete viejo y error de carga (Ciclos, fase 3)

node test-ciclos-sellos.js #  35 tests · los ciclos sellados (Ciclos, fase 4): ventana libre (calendario / partidos / ids), huella, sellar
                           #             solo cerrado y apto, verificar, historial sin juicio, y /api/v1/ciclos con HSETNX (nada se reemplaza ni se borra)

node test-ciclosadmin.js   #  58 tests · la gestión de ciclos (Ciclos, fase 5): estados borrador → auditado → publicado, lecturas editables sin tocar
                           #             números, /api/v1/ciclos/.../gestion solo ADMIN y la pestaña «Ciclos · gestión» de Comparativa

node test-ciclospublicar.js #  73 tests · publicar y enviar el ciclo (Ciclos, fase 6): el mail MIME con el PDF adjunto, el informe HTML autónomo,
                           #             /api/v1/ciclos/.../publicar solo ADMIN (ensayo, HSETNX, reintento de fallidos, el PDF que no compila) y el paquete de ciclos del cliente ORO sin la capa pbp

node test-cicloinforme.js  #  37 tests · el informe de ciclo nativo (js/sgadd-cicloinforme.js): tramos y línea de tanteo, on/off, semáforo,
                           #             y las 6 secciones sobre el paquete REAL de LAB 2026-27 si está en la máquina (punto 165)

node test-pbp.js           # 281 tests · la capa de laboratorio de play-by-play: el catálogo,
                           #             /api/v1/pbp, la pestaña y la card que no aparecen sin ella,
                           #             la geometría de zonas, los diagnósticos sobre la cancha y el cruce
                           #             · el bloque opcional de secciones del paquete (punto 83)
                           #             · y el reloj de posesión: franjas, identidad y perfil del jugador (115),
                           #               su metodología en las cards, el Glosario y el manual (116),
                           #               y su síntesis táctica en la pestaña Personalidad (118)
                           #               y el perfil de ritmo: arquetipos, desglose por franja y cruces de identidad (119)
                           #               y el insight por bloque, las tablas completas y la cancha por franja (120)
                           #               y el reloj en TRES franjas, mudado al Mapa de tiro, con un mapa completo
                           #               por franja y las tarjetas de tendencias (127), los paquetes de cuatro
                           #               franjas convertidos al vuelo y la card Tiro por franja (128)
                           #               y el perfil táctico por tramo del jugador: 1x1 / 5x5, rebote, pérdida y defensa (130)

node test-mails.js         # 177 tests · los mails institucionales: plantillas sin huecos, el
                           #             día de Argentina, la idempotencia del cron, la ficha, el SMTP,
                           #             el código adentro de la bienvenida, la puerta de ingreso,
                           #             el nombre del acceso y el link que llena el login

node test-fixture-apdeb.js # 125 tests · el conector de apdeb: tablas sin clases, estados propios,
                           #             el filtro por categoria, el piso de temporada y el orden del mes

node test-fixture-apb.js  #  93 tests · el conector de basket-club: el parser contra markup REAL,
                           #             los estados, el cruce con el libro y el respaldo ante una caida

node test-fixture-auto.js  #  88 tests · los conectores que se pegan en el Panel Master: Volcala, la página de
                           #             «jornadas» de una federación y el modo auto por sitio (punto 126)
                           #             · y el fixture de la Liga (Gesdeportiva): el fragmento por rango, la conferencia
                           #               por equipos y el parcial de un partido en juego (punto 127)

node test-fixture.js       # 116 tests · la seccion Fixture, los empty states de pretemporada,
                           #             las iniciales con parentesis y la grilla compacta del hub

node test-torneos.js       # 142 tests · los torneos sin cliente y la estructura multizona: la Liga
                           #             Argentina 2026-27, la Zona C, el enganche a una zona, la propagación
                           #             y el marcador de las cards plegables del Panel Master

node test-fases.js         #  91 tests · fases, cruces y series: el parser de la declaración, la llave
                           #             intrazonal e interzonal, la fase por ventana, las métricas que no
                           #             mezclan fases y la barra que repinta Clasificación y Fixture

node test-interzonal.js    # 220 tests · la llave entre zonas: un cliente de una zona recibe quién
                           #             contra quién y un 403 por el libro de la otra, los slots
                           #             «1° Norte vs 2° Sur», el modo llave y la fase activa; los
                           #             libros vinculados, el acceso por partido y el editor de cruces
                           #             · y el aislamiento por zona: cada zona ve SUS fases (punto 78)
                           #             · y el rival de otra zona: escudo, scouting y la vuelta de la llave (79)

node test-contenido.js     # 142 tests · generar-contenido.js: el Top 3 de la fecha, la ventana, el feed
                           #             derivado, las diez recetas de Nivel 2 y que los nombres solo salgan en APdeB (103, 104)

node test-centro-mando.js  # 658 tests · el Centro de Mando Editorial local: bandeja, Explorador táctico, ganchos sin números propios,
                           #             el texto libre de «A medida», el cruce de dos métricas y la voz de entrenador-analista (110),
                           #             el % de victorias, los textos sin cortar y la tesis de vestuario (111)
                           #             (pide «npm install» en centro-mando/ una vez: los agentes usan el SDK de Claude, punto 107)
                           #             el play-by-play que no se presta, el aprendizaje y el servidor en 127.0.0.1 (105)
                           #             · y la Mesa de control, de solo lectura: las ocho fuentes, la caché, que no escriba y, en la Fase 2, «Preparar»
                           #               que muestra el ensayo y el comando real sin ejecutar nada, con sus guardas (punto 183)

node test-alertas-partidos.js # 38 tests · las alertas de partido: -4 dias a las 09:00 AR, el id estable, el
                           #             cliente de Calendar, la corrida idempotente y el cron (punto 163)

node test-carga-manual.js  #  24 tests · la doble alerta de carga de los torneos manuales (punto 164)

node test-predicciones.js  #  48 tests · lo simulado contra lo que pasó: congelar antes del partido, HSETNX,
                           #             el resultado real, el resumen de calibración y la card (punto 171)

node test-bajas.js         #  45 tests · las bajas del buzón en el Simulador: valor sobre reemplazo, la rotación,
                           #             la escala por partidos jugados, el On/Off y el badge (punto 172)

node test-ecosistema.js    #  23 tests · el auditor del ecosistema: fechas, claves de escudo,
                           #             ids tapados y que no escriba (punto 121)

node test-canva.js         #  29 tests · las piezas aprobadas a Canva por la API, sin Claude:
                           #             el permiso que rota, publicar SOLO placas-tmp, reintentos (punto 123)

node test-muestra.js       # 156 tests · el selector de muestra de Equipos y Jugadores: el recorte de
                           #             calendario, idxVista(), «propio» contra la temporada y la barra (punto 139)
                           #             · y la familia 2: cada equipo en su condición, contra su índice dedicado
                           #             · y la fase 3: la vara de jugadores del período que calcula el servidor

node test-rendimiento.js   #  83 tests · la card de Rendimiento del jugador: el motor puro, las degradaciones,
                           #             la vista y el cableado de la pestaña (punto 140)

node test-conclusiones.js  # 113 tests · la card de conclusiones clínicas de Equipos y Jugadores, los tipos
                           #             de posesión del PBP y la terna de logos del PDF (punto 141)
                           #             · y la matriz de trade-offs con las metas escalonadas (punto 173)

node test-escalones.js      #  22 tests · el criterio ÚNICO de meta por tercios (P0-33 · P34-66 · P67-100) que usan el Diagnóstico y Ciclos (punto 174)

node test-pwa.js            #  23 tests · la PWA instalable: manifest, íconos, service worker (red primero), registro y botón de instalar (punto 175)

node test-tour.js           # 146 tests · el hero de la landing, los logos sin contenedor, los planes sin precio y «a medida»,
                           #             la demo como la de un usuario activo (estructura por liga, fixture, fechas) y el
                           #             recorrido guiado: nunca modal, se pausa y se retoma (puntos 177 y 178)

node test-diagnostico-rival.js # 61 tests · el soporte de decisión del Scouting: la versión perdedora, los duelos
                           #             cruzados con sus volúmenes de umbral, el FODA y las tres cosas (puntos 146 y 147)

node test-cortesias.js     #  99 tests · los pases de cortesía: el motor, la lista blanca del guard sobre TODAS las rutas,
                           #             el catálogo y el libro recortados al pase, la barra y el Scouting híbrido (punto 179)

node test-medicion.js      #  24 tests · la medición después del clic: UTM, cuatro eventos, contadores sin datos
                           #             personales, el embudo de admin y el cableado (punto 180)

node test-backend.js       # 468 tests · el proxy, el benchmark, las alertas, el catálogo en KV
                           #             y el reparto de tokens de Upstash

# OJO: `test-backend.js` ESTÁ EN MAIN desde que se integró el backend.
# Decía acá que vivía solo en `poc/backend` y por eso quedó fuera de dos
# vueltas de suite (v144 y v145): su test de deriva —el que compara byte
# a byte `server/lib/compartido/` contra `js/`— venía en rojo desde que se
# tocó `sgadd-core.js`, o sea que el servidor corría con un núcleo viejo.
```

**Más de 8.400 tests en total** (medido el 2026-10-19 sumando lo que informa cada archivo). **Todos tienen que dar verde antes de commitear.**

Todos los `test-*.js` corren **desde la raíz del repo** (no desde `js/`): sus
`require('./js/sgadd-core.js')` son relativos al propio archivo, no al cwd.
Un `test-*.js` subido a `js/` por error rompe con `MODULE_NOT_FOUND` aunque se
invoque `node test-x.js` desde la raíz — ya pasó una vez con una subida manual
por la web de GitHub.

Algunos tests extraen módulos del `index.html` en tiempo de ejecución
(`logos-extraido.js`, `boot-extraido.js`). Son temporales: se generan, se usan y
se borran dentro del propio test. No commitearlos.

### Los nombres de EQUIPO de las fixtures son reales

Salen de `logos/<liga>/index.json`. `test-scouting.js` usa ATENAS A, PLATENSE A,
NAUTICO ENSENADA y UNIVERSAL; antes eran inventados —AGUILA, MEDIO, BAJO,
TOPO— y eso escondía dos problemas: **un club que no existe no se puede
contrastar contra la planilla**, y ya pasó que un test apuntara a `'HALCON'`,
que tampoco existía, corriendo **en silencio sobre una lista vacía** — ocho
checks de candidatos que no verificaban nada. Con nombres reales un typo se
nota, y hay un check que falla si la fixture de señales queda vacía.

Ninguna fixture de scouting usa RECONQUISTA **a propósito**: varios checks
verifican qué hace el respaldo por `esEquipoPropio()` cuando ninguno de los dos
equipos del cruce es del club. Meter al equipo propio ahí cambiaría esa rama
sin avisar.

Los **nombres de JUGADOR** sí siguen siendo descriptivos (`'TIRADOR, ELITE'`,
`'PIVOT, INTERNO'`): dicen qué regla encarna cada uno, que es justo lo que el
test verifica. Con nombres de personas reales el test no se leería, y quedaría
mintiendo apenas ese jugador cambie de rendimiento.

`test-personalidad.js` y `test-partido.js` sí dependen de fixtures **committeadas**
en `test-fixtures/prom.tsv` y `test-fixtures/p4f.tsv` (12 equipos de La Plata,
PROMEDIOS E + PROMEDIOS 4F con fila EQUIPO TIPO). A diferencia de los
`-extraido.js`, estas quedan en el repo: no se regeneran solas.

No hay bundler ni paso de compilación en el camino: se edita, se sube, se ve.
La única pieza generada es `sgadd.css`, y se genera **a mano** (`node
generar-css.js`) igual que el manual de etiquetas — hay que acordarse de
correrlo al agregar una clase de Tailwind nueva.

---

## 2. Arquitectura

```
index.html              ← app entera: HTML, CSS, LOGOS, charts legacy
js/
  sgadd-club.js         ← config por cliente (?club=X). Arranca SOLO.
  sgadd-core.js         ← ESQUEMA, METRICAS, CATALOGO, índice, validadores
  sgadd-ui.js           ← StatCard, PercentileBar, MetricTable, TeamPicker, tabs
  sgadd-app.js          ← estado global: planilla y fase compartidas
  sgadd-charts.js       ← fábricas Chart.js + narrativas generadas
  sgadd-personalidad.js ← 8 ejes de identidad + insight victorias/derrotas
  sgadd-partido.js      ← análisis de un partido: desvíos z-score, avanzadas
  sgadd-rankings.js     ← réplica de RANKINGS E, calculada en el cliente
  sgadd-equipos.js      ← sección Equipos: grilla, ficha, 8 tabs, detalle partido
  sgadd-jugadores.js    ← sección Jugadores: grilla, ficha, tabs General/Evolución/Partidos
  sgadd-4factores.js    ← motor de regresión + sección Simulador (cruce A vs B)
  sgadd-scouting.js     ← informe pre-partido de equipos (motor + UI)
  sgadd-informe.js      ← modal de exportación PDF del informe de equipo
  sgadd-ficha.js        ← modal + PDF de la ficha individual del jugador
  sgadd-estados.js      ← motor puro de estados de jugador y detección de alertas
  sgadd-buzon.js        ← UI del buzón: drawer, toast, badge (usa `document`)
  sgadd-mercado.js      ← motor PURO de Fichajes: ficha manual, padrón, filtros, radar.
                          Lo copia el servidor (punto 87)
  sgadd-fichajes.js     ← sección FICHAJES: búsqueda, Radiografía ADN, comparar, PDF (punto 87)
  sgadd-clasificacion.js ← tabla de posiciones: motor + sección. Punto 16.
  sgadd-configui.js     ← pantalla de Configuración: edita las reglas del
                          punto 15 y las exporta. Punto 17.
  sgadd-config.js       ← motor PURO de competencia: zonas de la tabla,
                          tramos y tonos AA. Ver punto 15.
  sgadd-data.js         ← de dónde salen los datos: backend o GViz.
                          Solo en la rama `poc/backend`.
  sgadd-auth.js         ← roles, planes y permisos. Motor PURO. Punto 19.
                          NO es seguridad: leer el punto 19 antes de tocarlo.
  sgadd-diagnostico.js  ← auditoría de datos, visible en la app
  sgadd-fixture.js      ← la seccion FIXTURE: calendario del torneo + lo jugado (punto 68)
  sgadd-fases.js        ← fases, cruces y series: la llave de playoffs (punto 75). Motor PURO
                          arriba, pegamento con la app abajo
server/lib/fixture-fuentes.js ← los ADAPTADORES de fixture externo. PURO: entra
                          HTML, salen partidos. Punto 70
server/rutas/fixture.js   ← baja la fuente, la cachea en KV y sirve la ultima
                          lectura buena cuando la fuente se cae
  sgadd-torneos.js      ← el bloque de TORNEOS del Panel Master (punto 67)
torneos/<id>.json       ← la estructura de un torneo: zonas, equipos con su id de
                          Gesdeportiva, formato y marca. SIN sheetId: el repo es público
server/lib/torneos.js   ← motor PURO de torneos: alta multizona, enganche, propagación
HOJA_DE_RUTA.md         ← qué está hecho, qué falta y por qué ese orden.
                          La vista de PRODUCTO; el detalle técnico vive acá.
INTEGRACION_MOTORSTATS.md ← auditoría del motor que escribe las planillas
ESPECIFICACION_ADAPTADOR_GVIZ.md ← la Fase 1 documentada: parser, normalizaciones,
                          scope, indice y las dos capas de cache
AVISO_MOTORSTATS_2026-08-24.md ← lo que la web le reporta al motor: libros
                          desalineados, la U21 en 401 y dos correcciones a su prompt
AUDITORIA_ETIQUETAS_JUGADORES.md ← glosario y auditoría de TODAS las etiquetas
GUIA_ALTA_CLIENTES.md   ← el paso a paso, sin tecnicismos, para dar de alta o
                          modificar un cliente desde el Panel Master (punto 53)
PROPUESTA_ESTADOS_JUGADOR.md ← diseño original de estados (ya implementado, ver punto 13)
tailwind.config.js      ← la config que vivía en el <head> cuando Tailwind
                          era CDN. sgadd.in.css es la entrada.
sgadd.css               ← el CSS COMPILADO (30 KB). Se commitea: es lo que
                          sirve Pages. Se regenera con `node generar-css.js`
generar-css.js          ← el generador. Fija la version de Tailwind a mano
                          para que dos personas no generen CSS distinto.
generar-manual-etiquetas.js  ← genera MANUAL_ETIQUETADO_SGADD.html para el
                          cuerpo técnico. Se corre a mano: `node generar-manual-etiquetas.js`
clubes/
  reconquista.json      ← 3 planillas (Primera + Naranja U21/U23), liga la-plata
  deportivo.json        ← 1 planilla (Primera 2026), liga la-plata
  jujuy.json            ← 1 planilla (Conferencia Norte), liga liga-argentina
logos/<liga>/           ← escudos + index.json (manifiesto)
test-fixtures/          ← prom.tsv + p4f.tsv, 12 equipos de La Plata (committeados)
simulador-4factores-legacy.js ← Apps Script original (auditado, no se ejecuta:
                          ver punto 10). Queda como referencia de qué se corrigió.
```

**Versión actual de assets: `?v=394`.** Los `<script>` llevan query string para
bustear el caché de GitHub Pages. **Subir el número en CADA entrega**, si no el
navegador sirve la versión vieja y se pierden horas debuggeando fantasmas.

**El número se muestra en el pie del menú lateral** (`#asset-version`, se
rellena en `init()` leyendo el `?v=` de un `<script>` real). Es el
diagnóstico de treinta segundos para la trampa de siempre: `index.html` NO
lleva `?v=` —es el archivo que trae el CSS y el mapa de versiones— así que
cuando queda cacheado, en el navegador o en el CDN de Pages (`max-age=600`),
la app entera se queda en la entrega anterior y los cambios "no aparecen"
sin ningún síntoma. Si el pie dice una versión vieja, es caché: Ctrl+F5.

**Y ojo con la otra mitad: que el repo tenga el código no quiere decir que
Pages lo haya publicado.** Se separan mirando `raw.githubusercontent.com`
(el repo, inmediato) contra `coachgn.github.io` (el build). Medido: una
entrega se publicó 41 segundos después del push y la siguiente tardó más de
media hora.

### Orden de carga (importa)

`sgadd-club.js` va primero y se auto-arranca. `resolverClubYPlanilla()` en el
`index.html` es el único lugar que resuelve club → `SHEET_ID`, y lo llaman tanto
`init()` como `refreshData()`. **Nunca duplicar esa lógica**: cuando estuvo en dos
lados, `init()` quedó sin ella y Jujuy mostraba los datos de Reconquista.

---

## 11. Workflow de Git — OBLIGATORIO

Después de **cualquier** cambio de código o función nueva:

```bash
# 1. Correr TODA la suite
node test-core.js && node test-logos.js && node test-ligas.js && \
node test-clubes.js && node test-boot.js && node test-jugadores.js && \
node test-4factores.js && node test-personalidad.js && node test-informe.js && \
node test-partido.js && node test-scouting.js && node test-estados.js

# 2. Solo si TODO da verde:
git add .
git commit -m "tipo: mensaje claro"
git push origin main
```

**Si algún test falla, NO commitear.** Arreglar primero y volver a correr.

### Formato del mensaje

`tipo: descripción en imperativo, en español`

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`

```
feat: agregar tab Evolución con banda de desvío en Jugadores
fix: corregir cruce de invariantes RD/RDopp en el validador
refactor: unificar resolución de club en resolverClubYPlanilla
```

### Antes de commitear, verificar también

- [ ] Los tests están todos verdes
- [ ] Se subió `?v=` en el `index.html` si cambió algún `.js` o el CSS
- [ ] No quedaron `logos-extraido.js` ni `boot-extraido.js` en el repo
- [ ] Si se tocó una regla que costó encontrar, quedó comentada la razón

### Sobre el push automático

El push va directo a `main` sin revisión previa. Es una decisión explícita del
dueño del repo para no frenar el flujo. **La suite verde es la única red de
seguridad**, así que si se agrega una función sin test, esa red se achica.
Regla práctica: función nueva → test nuevo.

---

## 12. Estilo de código

- **Español** en nombres de funciones, variables y comentarios del código propio.
- **Comentar el POR QUÉ, no el qué.** Especialmente en las decisiones que
  costaron encontrar: un `// mes 0-indexado` ahorra una tarde.
- Sin dependencias nuevas. Chart.js y Tailwind CDN es todo lo que hay.
- Módulos con IIFE y un objeto exportado. Compatible con Node para poder testear.
- Tailwind: los colores custom (`text-accent`, `text-ink`) dependen del JIT del
  CDN y **fallan en nodos inyectados dinámicamente**. Para esos casos hay
  respaldos definidos a mano en el `<style>` del `index.html`.

---


## Orquestación de agentes

- El líder (Opus) planifica, audita y decide.
- Para leer o buscar delega en el subagente `Explore` (haiku, `.claude/agents/explore.md`).
- Para escribir delega en `implementer` (sonnet).
- Revisa `revisor` (opus) y puntúa `puntuador` (sonnet). Quien escribe nunca revisa ni puntúa.
- El líder solo escribe código si el `implementer` se traba.
- Tope de 3 vueltas.
- Push, deploy, KV, planillas, mails a clientes y permisos de Drive: siempre con OK del usuario.

## Mapa de la documentación

El detalle de cada punto vive en `docs/claude/`. Antes de tocar un tema, leé su archivo.

| Punto | Archivo |
|---|---|
| 3 · Modelo de datos | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 3 bis · La métrica `+/-` | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 3 ter · Multi-torneo · el índice se scopea, `claveEquipo()` NO se toca | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 3 quater · El join de FECHA · `Base Datos E` es la fuente de verdad | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 3 quinquies · Handlers inline y nombres con comilla simple | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 4 · Reglas de análisis | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 4 bis · Perfil de tiro del partido · un gráfico, tres preguntas | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 5 · Validadores (sección Diagnóstico) | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 5 bis · El cartel de espera · un solo componente | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 6 · Multi-cliente | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 7 · Exportación a PDF | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 8 · Sección JUGADORES | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 9 · Sección SCOUTING · Informe pre-partido | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 9 bis · Simulador 360° | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 10 · Deuda técnica conocida | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 10 bis · Pedidos del cuerpo técnico · backlog | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 13 · Estados de jugador y buzón de alertas | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 14 · Guía de diseño oficial · Checklist Design | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 15 · Configuración de competencia · `sgadd-config.js` | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 16 · Sección CLASIFICACIÓN · `sgadd-clasificacion.js` | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 17 · Pantalla de CONFIGURACIÓN · `sgadd-configui.js` | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 18 · Preconfiguración, calendario y certificación | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 18 ter · El tramo de las ALERTAS del servidor | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 18 bis · Los dos tokens de Upstash · el servidor lee, el CLI escribe | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 19 · Roles, planes y permisos · `sgadd-auth.js` | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 20 · GLOSARIO de métricas · `sgadd-glosario.js` + `sgadd-glosarioui.js` | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 21 · El RANKING DEL PLANTEL | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 22 · Módulo COMPARATIVA · especificado, no implementado | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 23 · EL BUG QUE BORRABA LAS CLAVES · un KV ilegible | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 24 · LAS CUATRO TASAS DEL JUGADOR CON DENOMINADOR DE EQUIPO | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 25 · EL PIE, LOS METALES Y EL ARO | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 26 · Sección COMPARATIVA · `sgadd-comparativa.js` + `sgadd-comparativaui.js` | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 27 · La redirección post-login, y por qué no pasaba nada | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 28 · EL LOGO SE RECORTABA EN EL ARCHIVO, no en el CSS | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 29 · LOGIN DE CLIENTES · `server/lib/clientes.js` | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 30 · NADA DEL PANEL MASTER SE APLICA EN SILENCIO · `sgadd-confirmar.js` | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 31 · PUBLICAR LAS ZONAS · la cascada de tres niveles | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 32 · SUBCLIENTES · cada categoría con sus propias zonas | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 33 · `data-glosa` · cuando la misma sigla significa otra cosa | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 34 · EL ACUMULADO DE UN JUGADOR SE QUEDABA CON UN SOLO TORNEO | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 35 · LOS ENCABEZADOS YA IBAN CENTRADOS | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 36 · EL RESALTE DEL EQUIPO PROPIO NO VA EN EL RANKING DEL PLANTEL | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 37 · PUBLICAR, GUARDAR Y EXPORTAR · las tres, explicadas en la pantalla | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 38 · ROTAR EL TOKEN DE UPSTASH SIN CORTAR NADA | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 39 · CON KV CAÍDO EL PANEL NO SE CAE · y ahora lo dice | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 40 · EL TRAMO SE CONSERVA AL CAMBIAR DE CATEGORÍA | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 41 · EL JSON DEL CLUB · el archivo que rompió y las cuatro guardas | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 42 · EL GRUPO DE PARES · contra QUIÉN se compara un jugador | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 43 · EL ESTADO REACTIVO DEL PANEL MASTER | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 44 · PARTIDOS SIN ESTADÍSTICAS · la carga manual | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 45 · NIVEL DE COMPETENCIA · el registro de umbrales | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 45 bis · LA PROCEDENCIA DEL UMBRAL · lo que hace auditable al sistema | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 46 · EL ANCLA VA ANTES QUE EL FINALIZADOR · y lo que pierde no se pierde | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 47 · EL TOTAL ES LA SUMA DE SUS TORNEOS, TAMBIÉN PARA LOS MANUALES | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 48 · LOS ENCABEZADOS DEL GLOSARIO | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 49 · RESPONSIVE · lo que se midió y lo que estaba roto | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 50 · EXPORTAR EL RANKING DEL PLANTEL · la quinta exportación | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 51 · EL PIE INSTITUCIONAL, EN TODAS LAS HOJAS | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 52 · LA DEMO PÚBLICA Y LAS CARDS DE PLANES | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 53 · EL ALTA DE CLIENTES DESDE EL PANEL MASTER | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 54 · LOS CLIENTES DEL MISMO LIBRO · alcance, herencia y color | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 55 · EL PLAN EFECTIVO, LA RACHA Y EL ARRANQUE SIN DESTELLO | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 56 · EL RESTO DEL PLANTEL Y LA FICHA DEL PLAN ORO | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 57 · LOS ESTADOS COMPARTIDOS · y lo que ninguna rutina puede pisar | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 58 · SIMILITUD MULTI-ETIQUETA · contra quién es justo comparar | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 59 · EL PAPEL Y LA PESTAÑA JUGADORES · cuatro pedidos del 2026-09-12 | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 60 · EL CLUB ES EL PADRE, LA CATEGORÍA ES LO QUE SE CONTRATA | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 61 · EQUIPO, VENCIMIENTO Y CICLO ORO POR CATEGORÍA · y el glosario sin hojas | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 62 · LA CAPA DE LABORATORIO · play-by-play de Jujuy (2026-09-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 63 · LOS MAILS INSTITUCIONALES · bienvenida y avisos de vencimiento (2026-09-18) | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 64 · LAS MARCAS Y LAS CLAVES DEJAN DE CONTRADECIRSE (2026-09-20) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 65 · LA TABLA QUE NO ENTRA SE PARTE · NO SALTA ENTERA (2026-09-21) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 66 · ORTG, DRTG Y NET VAN POR 100 POSESIONES · norma CAB/FIBA (2026-09-25) | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 67 · TORNEOS SIN CLIENTE Y ESTRUCTURA MULTIZONA (2026-09-25) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 68 · LA SECCIÓN FIXTURE · lo único que se puede mirar antes del torneo (2026-09-25) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 69 · EL CATÁLOGO DE CLIENTES, COMPACTO (2026-09-25) | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 70 · FUENTES EXTERNAS DE FIXTURE · el conector de basket-club (2026-09-25) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 71 · EL ORDEN DEL MES, LOS LIBROS DE LAB Y EL CONECTOR DE APDEB (2026-09-25) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 72 · LA LEYENDA SIN EL PROVEEDOR, Y EL CRUCE QUE LA PROGRAMACIÓN NO PUBLICA (2026-09-25) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 73 · EL PANEL MASTER SE ORDENA POR TORNEO (2026-09-26) | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 74 · EL PANEL MASTER, ORDENADO POR TORNEO · TRES AJUSTES DE UI (2026-09-27) | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 75 · FASES, CRUCES Y SERIES · la llave de playoffs (2026-09-28) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 76 · LA LLAVE ENTRE ZONAS Y LA FASE QUE ABRE EL LIBRO (2026-09-28) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 77 · MULTILIBRO · los libros vinculados y el acceso por PARTIDO (2026-09-28) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 78 · CADA ZONA VE SUS FASES, Y EL PUESTO DE OTRA ZONA TIENE NOMBRE (2026-09-30) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 79 · EL RIVAL DE OTRA ZONA: ESCUDO, SCOUTING PRE-PARTIDO Y EL CAMBIO DE FASE (2026-09-30) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 80 · EL RIVAL DE OTRA ZONA CONTRA SU PROPIA LIGA, Y LA FALTA TÁCTICA (2026-09-30) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 81 · PPP OF/DEF DE LA OTRA LIGA Y LA CUENTA DE LA FALTA A LA VISTA (2026-09-30) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 82 · LA FALTA EN SU UNIDAD Y LOS PJ DE LA TABLA EN EL SCOUTING (2026-09-30) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 83 · EL BLOQUE `secciones` DEL PAQUETE DE LABORATORIO (2026-10-02) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 84 · EL RIVAL DE UNA NOCHE SE EMPAREJA POR FECHA + PARTIDO (2026-10-02) | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 85 · SCOUTING · LAS DIEZ CARDS DE A UNA Y EL FLUJO CONTINUO (2026-10-02) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 86 · LA CAMPANA · AISLAMIENTO, «VOLVIÓ A JUGAR» Y EL PARPADEO (2026-10-05) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 87 · FICHAJES · EL MERCADO DE JUGADORES DE UN TORNEO (2026-10-05) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 88 · EL MENÚ SE MINIMIZA HACIA LA IZQUIERDA (2026-10-05) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 89 · FICHAJES · VOLUMEN DE TIRO, ESCALA DE PUESTOS Y ESCUDOS QUE SE LEEN (2026-10-05) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 90 · FICHAJES · EL PERÍODO: FASES Y CALENDARIO DESDE–HASTA (2026-10-05) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 91 · FICHAJES · PUERTAS DURAS Y % DE COINCIDENCIA (2026-10-05) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 92 · LA LNB 2026-27 · TORNEO, ESCUDOS Y PADRON J EN FICHAJES (2026-10-07) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 93 · LOS INSCRIPTOS DEL TORNEO · LOS 18 DE LA LNB A LA VISTA (2026-10-07) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 94 · LA CAPA DE LABORATORIO TAMBIÉN VA SOBRE UN TORNEO (2026-10-07) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 95 · ESCUDOS DE LOS INSCRIPTOS Y FOTOS DE LOS JUGADORES (2026-10-07) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 96 · FOTOS ENCUADRADAS, DORSALES, MAPA SIN PISO Y POST-PARTIDO AMPLIADO (2026-10-08) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 97 · TITULARIDAD, QUINTETOS DEL PARTIDO, MARCA EN LOS PDF Y FICHAJES (2026-10-09) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 98 · LA BADGE DE TITULARIDAD UNIFORME, LA FICHA FIEL Y EL POST-PARTIDO FIRMADO (2026-10-09) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 99 · LA LIGA ARGENTINA 2026-27 · INGESTA AUTOMÁTICA DE LAS DOS CONFERENCIAS (2026-10-09) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 100 · LA VISTA DEL CLIENTE ENGANCHADO A UN TORNEO Y FICHAJES DE ADMINISTRACIÓN (2026-10-09) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 101 · LA CAPA DE LABORATORIO SE HEREDA DE LA ZONA DEL TORNEO (2026-10-10) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 102 · EL TORNEO CUENTA LOS MISMOS PARTIDOS QUE EL CLUB (2026-10-10) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 103 · `generar-contenido.js` · LOS NÚMEROS DEL CONTENIDO DE REDES (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 104 · EL NIVEL 2 DEL CONTENIDO · LAS DIEZ RECETAS (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 105 · EL CENTRO DE MANDO EDITORIAL · LOCAL (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 106 · EL CENTRO DE MANDO, REDISEÑADO · bandeja, Explorador táctico y enfoque/tono (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 107 · LOS AGENTES CON CLAUDE EN EL CENTRO DE MANDO (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 108 · CLAUDE CODE COMO MOTOR DE REDACCIÓN, SIN API PAGA · y `/agencia` (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 109 · LA NARRATIVA DE REFERENTE · placas dinámicas, copy y prompt alternativo (2026-10-12) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 110 · «A MEDIDA» CON TEXTO LIBRE Y LA VOZ DE ENTRENADOR-ANALISTA (2026-10-13) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 111 · VICTORIAS EN EL EXPLORADOR, TEXTOS SIN CORTAR Y LA TESIS DE VESTUARIO (2026-10-13) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 112 · TRES AJUSTES DE CIERRE DEL CENTRO DE MANDO (2026-10-13) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 113 · LO QUE SE VE ES LO QUE SE CUENTA · filas, volumen, autochequeo y conectores (2026-10-13) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 114 · EL BUSCADOR DEL CENTRO DE MANDO · honestidad muestral antes que redacción (2026-10-13) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 115 · EL RELOJ DE POSESIÓN, DERIVADO DEL PLAY-BY-PLAY (2026-10-13) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 116 · LA METODOLOGÍA DEL RELOJ, A LA VISTA · cards, Glosario y manual (2026-10-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 117 · «2DA OPORTUNIDAD» Y «REINICIO», Y EL PAGINADO DE LOS DOS PDF (2026-10-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 118 · EL RELOJ EN LA PESTAÑA PERSONALIDAD · barras y síntesis táctica (2026-10-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 119 · EL PERFIL DE RITMO EN PERSONALIDAD · arquetipos, desglose por franja y cruces de identidad (2026-10-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 120 · EL RELOJ EN PERSONALIDAD · INSIGHT POR BLOQUE, TABLAS Y CANCHA POR FRANJA (2026-10-14) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 121 · EL AUDITOR DEL ECOSISTEMA · seis fuentes que nadie comparaba (2026-10-15) | [docs/claude/clientes-y-panel-master.md](docs/claude/clientes-y-panel-master.md) |
| 122 · LA CORRIDA SIN NADIE · `npm run auto-process`, render local y Bahía Blanca (2026-10-15) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 123 · LAS PIEZAS A CANVA POR LA API, SIN CLAUDE Y SIN ARCHIVOS LOCALES (2026-10-16) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 124 · LAB SUR, ESCUDOS DE LA LAB Y EL «1°» DE BAHÍA BLANCA (2026-10-16) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 125 · BAHÍA BLANCA REPARADO EN EL LIBRO · y por qué la primera prueba no escribió (2026-10-16) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 126 · EL FIXTURE QUE SE PEGA EN EL PANEL MASTER · Volcala, jornadas y el modo `auto` (2026-10-16) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 127 · FIXTURE DE LA LIGA, EL VIGÍA Y EL RELOJ EN TRES FRANJAS, EN EL MAPA DE TIRO (2026-10-18) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 128 · LOS PAQUETES DE CUATRO FRANJAS SE CONVIERTEN AL VUELO · Y LA CARD TIRO POR FRANJA (2026-10-18) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 129 · LA FICHA EN PDF A ELECCIÓN · CARDS Y SUB-CARDS, Y EL PACK PLANTEL (2026-10-18) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 130 · UMBRALES POR COMPETENCIA, PERFIL POR TRAMO DEL RELOJ, TOP 3 DEL PLANTEL Y PDF DISCRETO (2026-10-19) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 131 · EL INFORME DEL EQUIPO EN PDF A ELECCIÓN · CARDS, SUB-CARDS Y ATAJOS (2026-10-19) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 132 · EL DESEMPATE OFICIAL FIBA EN LA TABLA DE POSICIONES (2026-10-19) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 133 · ARRASTRE DE PUNTOS, FASES POR TORNEO Y EL DESEMPATE DE LA CATEGORÍA (2026-10-19) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 134 · LA CARPETA AL REVÉS · una sola opción para la fase del libro vinculado (2026-10-19) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 135 · EL ARRASTRE QUE NO SE VEÍA · un borrador local tapaba lo publicado (2026-10-19) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 136 · LOS PUESTOS DE LA LLAVE SALEN DE LA REGULAR DEL TORNEO DE LA FASE (2026-10-19) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 137 · LA CARPETA DE ESCUDOS DE UN CLIENTE ES LA DE SU TORNEO (2026-10-21) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 138 · EL «RATE LIMIT EXCEEDED» DE PAGES · 200 SONDEOS DE ESCUDOS POR CARGA (2026-10-21) | [docs/claude/fichajes-y-lnb.md](docs/claude/fichajes-y-lnb.md) |
| 139 · EL SELECTOR DE MUESTRA EN EQUIPOS Y JUGADORES · FASES 1, 2 Y 3 (2026-10-23) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 140 · LA CARD DE RENDIMIENTO DEL JUGADOR · PRIMERA VERSIÓN (2026-10-23) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 141 · CONCLUSIONES CLÍNICAS, EQUIPOS EN BENTO Y LA TERNA DEL PDF (2026-10-26) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 142 · LA SOLAPA DIAGNÓSTICO, LA TERNA ARREGLADA Y EL PAPEL SIN CARDS PARTIDAS (2026-10-26) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 143 · LA BARRA SIMÉTRICA, QUINTETOS Y MAPA SIEMPRE, Y EL DIAGNÓSTICO CON PROYECCIÓN (2026-10-26) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 144 · LA FILOSOFÍA DEL EQUIPO · `DetectarFilosofiaDT` (2026-10-26) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 145 · DetectarFilosofiaDT HÍBRIDA · box score + play-by-play (2026-10-26) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 146 · EL SOPORTE DE DECISIÓN DEL SCOUTING · versión perdedora, mal menor y las tres cosas (2026-10-26) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 147 · DUELOS CRUZADOS, VOLÚMENES DE UMBRAL, FODA Y CUARTOS · y se fue el mal menor (2026-10-27) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 148 · EL SIMULADOR, VIVO Y BAYESIANO · auditoría y refactor (2026-10-27) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 149 · EL SIMULADOR · AJUSTE POR RIVAL, LOCALÍA POR CLUB Y MONTE CARLO DE 10.000 (2026-10-27) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 150 · EL SCOUTING EN BENTO GRID · BARRAS DE DIFERENCIAL Y DE PROGRESO (2026-10-27) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 151 · SCOUTING v320 · NOMBRES DE VUELTA, FODA SIN HUECOS Y PÉRDIDAS LEGIBLES (2026-10-27) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 152 · EL LOGO DE LA LIGA EN LOS PDF · GitHub Pages NO SIRVE ARCHIVOS CON «_» (2026-10-27) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 153 · ROTACIONES DENTRO DE QUINTETOS Y LOS MAPAS POR FRANJA, UNO POR HOJA (2026-10-27) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 154 · LAS FOTOS DE LOS JUGADORES EN EL PDF DE SCOUTING (2026-10-27) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 155 · EL PACK PLANTEL, UNA FICHA POR HOJA (2026-10-28) | [docs/claude/pdf.md](docs/claude/pdf.md) |
| 156 · EL POST-PARTIDO EN BENTO · QUÉ DECIDIÓ, QUINTETOS EN EL MOMENTUM Y EL PLAN DE AJUSTE (2026-10-30) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 157 · POST-PARTIDO v331 · SIN PBP NO HAY BLOQUE, EXPECTATIVA SIN SIMULADOR, DOBLE BASELINE Y PLAN EN 4 ACCIONES (2026-10-30) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 158 · EL POST-PARTIDO RESPONDE AL SCOUTING · vara previa, plan contra la realidad y porcentajes sin intentos (2026-10-30) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 159 · EL POST-PARTIDO DE UN GOLPE DE OJO · plan en mosaico, radar de 8 ejes, % de victoria y la corrida con quién la armó (2026-10-31) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 160 · EN UN PLAYOFF, LA VARA PREVIA DEL POST-PARTIDO ES LA REGULAR (2026-10-31) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 161 · LA CEGUERA ENTRE FASES · SIMULADOR, SCOUTING Y LOS HISTORIALES (2026-10-31) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 162 · RACHAS Y TENDENCIAS DE JUGADOR · 🔥 🧊 ⚓ (2026-10-31) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 163 · LAS ALERTAS DE PARTIDO EN EL CALENDARIO · -4 días, 09:00 (2026-11-01) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 164 · LA DOBLE ALERTA DE CARGA DE LOS TORNEOS MANUALES (2026-11-01) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 165 · EL INFORME DE CICLO NATIVO · la réplica del Artifact «Jujuy Básquet · Ciclo 0» (2026-11-06) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 166 · CERRAR UN CICLO · SELLAR, PUBLICAR Y MANDAR, Y EL CUERPO TÉCNICO VE SOLO LO PUBLICADO (2026-11-06) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 167 · CLASIFICACIÓN Y FIXTURE · FASES POR TABLA Y POR LLAVE, BIEN CONECTADAS (2026-11-07) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 168 · EL SELECTOR FILTRA, NO VACÍA · la temporada completa en Scouting y post-partido (2026-11-07) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 169 · EL RIVAL DE UNA SERIE LLEGA ENTERO DESDE UN LIBRO ENTRE ZONAS (2026-11-08) | [docs/claude/competencia-fases-fixture.md](docs/claude/competencia-fases-fixture.md) |
| 170 · EVOLUCIÓN · LAS METAS DEL CICLO ANTERIOR CONTRA EL CICLO NUEVO, Y EL LINK DEL MAIL (2026-11-08) | [docs/claude/laboratorio-pbp-ciclos.md](docs/claude/laboratorio-pbp-ciclos.md) |
| 171 · LO SIMULADO CONTRA LO QUE PASÓ · las predicciones congeladas y la calibración (2026-11-09) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 172 · LAS BAJAS DEL BUZÓN EN EL SIMULADOR · valor sobre reemplazo (2026-11-09) | [docs/claude/scouting-y-simulador.md](docs/claude/scouting-y-simulador.md) |
| 173 · LA MATRIZ DE TRADE-OFFS EN EL DIAGNÓSTICO · y las metas escalonadas por ciclo (2026-11-09) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 174 · UN SOLO CRITERIO DE METAS · LOS TERCIOS DE LA LIGA (2026-11-10) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 175 · LA PWA · INSTALAR EL PANEL COMO APP (2026-11-10) | [docs/claude/equipos-y-diagnostico.md](docs/claude/equipos-y-diagnostico.md) |
| 176 · NINGÚN «TOTAL» QUE JUNTE INSTANCIAS DE POSTEMPORADA (2026-11-13) | [docs/claude/datos-y-motor.md](docs/claude/datos-y-motor.md) |
| 177 · LA LANDING DE UN GOLPE DE VISTA, LA DEMO CON ESCUDOS Y EL RECORRIDO GUIADO (2026-11-13) | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 178 · LA LANDING DEL DOCUMENTO DE BIENVENIDA Y LA DEMO COMO LA DE UN USUARIO ACTIVO (2026-11-13) | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 179 · LOS PASES DE CORTESÍA · una muestra con datos reales sin dar de alta un cliente (2026-11-14) | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 180 · LA MEDICIÓN DESPUÉS DEL CLIC · UTM Y CUATRO EVENTOS (2026-11-17) | [docs/claude/auth-landing-demo.md](docs/claude/auth-landing-demo.md) |
| 181 · LA AGENCIA, A LA VISTA · rutinas sin sesión, banco de ideas y tablero (2026-11-17) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
| 182 · LA VENTANA DE UNA CARD · Temporada · Últimos 4 · 6 · 10 (2026-11-25) | [docs/claude/jugadores-y-umbrales.md](docs/claude/jugadores-y-umbrales.md) |
| 183 · LA MESA DE CONTROL · una sola pantalla, solo lectura (2026-11-27) | [docs/claude/centro-mando-y-contenido.md](docs/claude/centro-mando-y-contenido.md) |
