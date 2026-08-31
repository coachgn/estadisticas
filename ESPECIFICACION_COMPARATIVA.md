# Módulo COMPARATIVA · especificación

Derivada de los **6 informes reales de Jujuy Básquet** (temporada 2025-2026,
del 03-01 al 27-03), que el cuerpo técnico venía armando a mano en Canva. Son
la misma relación que hay entre los PDF de *REPORTE SCOUTING* y la sección
Scouting: acá está lo que el informe dice, para poder calcularlo.

Los PDF **no están en el repo** (`.gitignore`): pesan 7,4 MB y son material
del cliente. Se leyeron con un extractor propio; el aprendizaje técnico de eso
está al final.

---

## 1. Qué es un informe de ciclo

**No es una foto de la temporada: es la comparación de dos cortes.** Cada
informe mide los últimos N partidos contra los N anteriores, y contra la liga.
Esa es la diferencia con todo lo que el panel ya hace.

La ventana fue de **4 partidos** en los informes 4 y 5, y de **5** en el 6.
Coincide con `PARTIDOS_POR_CICLO = 4` del plan ORO (`server/lib/catalogo-mutar.js`),
así que la ventana tiene que ser **un parámetro**, no una constante escrita en
el motor.

Estructura del 6º informe, 14 hojas:

| Hoja | Qué trae |
|---|---|
| 1 | Ritmo y volumen — `POS` `PACE` `PLAYS` `PPP` |
| 2 | Eficiencia — `RTNG OFF` `RTNG DEF` `NET RTNG` |
| 3 | Selección y acierto — `PT3%` `PT2%` `PT1%` `TOV%` · `T3%` `T2%` `T1%` `eFG%` |
| 4 | 4 Factores of/def — `eFG%` `PP%` `RO%` `RTL%` y sus `OPP` |
| 5 | Rebote — `RO (Prom)` `RO%` `RD%` `RT%` `RT (Prom)` |
| 6 | Creación — `AST (Prom)` … |
| 7-8 | Análisis integral e intervención estratégica (narrativa) |
| 9 | **Tabla de métricas críticas**: ciclo anterior vs actual, tendencia y status |
| 10-11 | Jugadores por banda de minutos |
| 12 | **Tabla consolidada de jugadores**: rol, ajuste, meta, estado |
| 13 | Reestructuración táctica (`USG%`, impacto, auditoría) |
| 14 | Conclusiones |

---

## 2. Las dos tablas que son el corazón del informe

Todo lo demás es prosa alrededor de estas dos.

### 2.1 · La fila de una métrica de EQUIPO

```
Métrica | JUJUY (Ciclo Actual) | Máximo (Liga) | Promedio (Tipo) | Mínimo (Liga) | Rank
PACE    | 78,28                | 77,94 (F. Riojana) | 75,14    | 71,91         | 1
eFG%    | 45,53%               | 53,88% (S. Isidro) | 51,90%   | 48,15% (Rivadavia) | 17
```

Cinco columnas y **el máximo y el mínimo llevan el nombre del equipo**. Sin el
nombre, "el máximo es 77,94" no le dice nada al DT; con él, sabe contra quién
se está midiendo.

**El "Promedio" es el `EQUIPO TIPO`**, o sea la mediana — el informe lo rotula
*(Tipo)* en cuatro de las seis hojas y *(Liga)* en dos. Es la misma referencia
que ya usa `referenciaLiga()` en `sgadd-scouting.js`, incluido su respaldo por
distribución cuando el TIPO no trae la columna.

**Ojo con el `Rank`**: en el informe está calculado sobre el ACUMULADO de la
liga, no sobre el ciclo de los rivales. Es lo correcto y hay que conservarlo —
un puesto calculado sobre 4 partidos de cada equipo sería ruido — pero
significa que la fila **mezcla dos ventanas a propósito**: la columna JUJUY es
del ciclo y el resto de la temporada. Eso tiene que estar rotulado o el número
miente.

Se ve en la hoja 5: `RO (Prom) 12,06` con `Máximo (Liga) 12,06 (Jujuy)` — el
máximo es el propio equipo, porque esa columna sale del acumulado.

### 2.2 · La fila de la tabla de métricas críticas (hoja 9)

```
Métrica crítica  | Ciclo Anterior | Ciclo Actual | Tendencia    | Status
eFG% (Eficiencia)| 54,84%         | 45,53%       | 📉 Crítica   | ALERTA
T1% (Libres)     | 72,1%          | 66,9%        | 📉 Alerta    | DEFICITARIO
RTNG OFF         | 116,97 (Pico)  | 87,34        | 📉 Dramática | BAJO
RO% (Rebotes)    | 36,85%         | 31,37%       | 📉 En descenso | CRÍTICO
```

Acá está el valor entero del módulo, y es **exactamente lo que el panel hoy no
puede contestar**: qué cambió respecto del corte anterior.

`Tendencia` y `Status` son dos ejes distintos y hay que respetarlo:

- **Tendencia** = el DELTA contra el ciclo anterior (mejoró / empeoró y cuánto).
- **Status** = el NIVEL contra la liga (dónde está parado hoy).

Un equipo puede venir subiendo y seguir último; y puede caer fuerte y seguir
siendo primero. Colapsar las dos en un solo semáforo es perder la mitad de la
lectura.

### 2.3 · La fila de un JUGADOR (hoja 12)

```
Jugador  | Rol estratégico sugerido    | Ajuste clave de volumen           | Meta (target)          | Estado actual
STEHLI   | Referente / Puntal 2P       | Bajar T3 (6,00): priorizar aro    | PPP > 1,00 · T1% > 80% | 🚨 0,96 / 78%
GRYTSAK  | Ancla / Especialista RO     | Foco en libres: prohibido tirar 3P| T1% > 50% · RO > 3,00  | ✅ RO 3,20 · 🚨 T1 31%
ROCA     | Amenaza Perimetral Real     | Catch & Shoot: mantener volumen 3P| T3% > 38% · PPP > 1,00 | ✅ 40% / 0,85
```

**El ajuste es OFENSIVO y sobre el propio jugador.** Esto es lo que lo separa
de Scouting, que emite consignas DEFENSIVAS contra un rival. Son dos motores
distintos y no hay que confundirlos: *"prohibido que tire de 3P"* es una
instrucción para el propio plantel, no una marca.

---

## 3. Qué ya está y qué falta

### Ya está, y hay que reusarlo — no reimplementarlo

| Pieza del informe | Dónde vive hoy |
|---|---|
| Mediana de liga con respaldo | `SGADD_SCOUT.referenciaLiga()` |
| Puesto en la liga por métrica | `sgadd-rankings.js` (`GRUPOS`, `construir`) |
| Ventana de últimos N con ganados/perdidos | `analisisCiclo()` en `sgadd-scouting.js:1127` |
| Split local/visitante de equipo | `e.split`, `sgadd-core.js:1616` |
| Split local/visitante de jugador | `jugadoresSplitCondicion()` |
| Rol estratégico del jugador | `jugadoresADN().rolFuncional` (10 roles) |
| Banda de minutos (>25 / 18-25 / <18) | `ROLES_MINUTOS` |
| Fortaleza y punto de fuga | `fortalezasJugador()` / `fugasJugador()` |
| Ventana del plan ORO | `PARTIDOS_POR_CICLO` en `catalogo-mutar.js` |

Duplicar cualquiera de estas es el bug que este proyecto ya se comió con el rol
funcional (CLAUDE.md, punto 8).

### Falta, y es lo que hay que construir

1. **El CICLO como concepto de primera clase.** Cortar la temporada en bloques
   de N partidos por equipo y calcular el mismo perfil en cada bloque. Es el
   pedido **B-1** del backlog (punto 10 bis), y el informe le da la forma
   exacta que el club espera.

2. **La comparación entre dos ciclos**, con `tendencia` (delta contra el corte
   anterior) y `status` (nivel contra la liga) **separados**.

3. **El máximo y el mínimo de liga con el nombre del equipo.** El panel hoy
   calcula medianas y percentiles, no los extremos con dueño.

4. **Las METAS.** `PPP > 1,00`, `T1% > 80%` son decisiones del cuerpo técnico,
   no datos derivables. Necesitan ser editables y persistir, igual que las
   marcas de scouting o los estados de jugador — y valen para el ciclo
   siguiente, así que van a `localStorage` con la clave de la planilla.

5. **El ajuste ofensivo por jugador.** Motor nuevo: mira al propio jugador
   contra su propia historia y contra la liga, y emite *qué hacer distinto*.
   No es el motor de marcas de Scouting dado vuelta.

### Lo que NO hay que migrar

La **narrativa que cita al informe anterior** —*"en el informe anterior nos
lamentamos por habernos quedado en 0,91 PPP"*— es criterio del DT sobre lo que
escribió él mismo, no un dato. El panel puede dar el número del ciclo anterior
(lo recalcula, no lo guarda: sin estado no hay nada que se desincronice) y el
delta; el juicio lo pone quien firma el informe.

Es la misma línea que ya se trazó con la parte narrativa de los PDF de playoffs
en Scouting (CLAUDE.md, punto 9).

---

## 4. Una advertencia sobre la muestra

Un ciclo son 4 o 5 partidos. Todas las reglas del punto 4 de CLAUDE.md aplican
con más fuerza acá que en ningún otro lado: un `T1%` sobre 5 partidos se mueve
diez puntos con dos tiros.

El informe real lo hace bien sin decirlo —cita siempre el volumen al lado del
porcentaje: *"7,20 intentos con 25% de acierto"*— y el módulo tiene que hacer
lo mismo por construcción, no por criterio de quien escribe: **ningún
porcentaje de ciclo se muestra sin su C/I al lado**. Es la regla B-3 que ya se
aplicó en el tab Partidos.

---

## 5. Cómo se leyeron los PDF

Son exports de **Canva**: fuentes subsetadas con `Identity-H` y un `ToUnicode`
por fuente. Sin resolver ese CMap el texto sale como una sopa de espacios, que
es indistinguible de un PDF escaneado.

Tres cosas que costaron, por si hay que volver a hacerlo:

1. **El mapa de fuentes es POR PÁGINA.** `/F1` no es la misma fuente en dos
   hojas, así que un mapa global elige el CMap equivocado.
2. **El destino de un `bfchar` es UTF-16BE**, no una lista de code points:
   tomarlo de a 4 dígitos hexadecimales deja surrogates sueltos con cualquier
   emoji, y eso revienta **al escribir el archivo**, o sea lejos de donde está
   la causa.
3. **Un `bfrange` con destino de varios glifos** hay que saltearlo, no
   interpretarlo como un rango de caracteres consecutivos.

El extractor quedó en el scratchpad de la sesión; no se commitea porque es una
herramienta de una vez, no parte del panel.
