/* =====================================================================
   SGADD · Sección JUGADORES

   Ruta:  #/<planilla>/<fase>/jugadores/<jugador>/<tab>
   Ej:    #/primera-clausura-2026/REGULAR/jugadores/moreira-pedro--atenas-a/general

   Misma estructura que Equipos, ya probada: grilla → ficha → tabs.

   DECISIÓN: la clave de un jugador es NOMBRE + EQUIPO (no el nombre solo).
   Hay dos jugadores homónimos de equipos distintos que hoy mezclan sus
   estadísticas en SGADD.statJugador() — deuda técnica conocida y
   postergada (ver CLAUDE.md). Esta clave compuesta no arregla eso, pero
   evita que ADEMÁS la navegación de la grilla abra la ficha equivocada.

   Tabs de esta entrega: General, Tiro, Evolución, Partidos. Rol (uso
   detallado) y Comparar (contra otro jugador o el JUGADOR TIPO) quedan
   para la próxima vuelta.

   ROL POR MINUTOS: clasificación categórica ESTRICTA (no percentiles, no
   heurístico "titular/suplente"). Se define por bandas fijas de MIN de
   promedio, iguales para cualquier liga.

   ADN DEL JUGADOR: motor de arquetipos y jerarquía técnica, adaptado del
   `obtenerSintesisPerfil(dataI)` que ya usa el club en otros tableros.
   Regla del proyecto: donde esa lógica original usaba VAL (índice
   compuesto), acá se usa PLAYS — VAL está deliberadamente afuera del box
   score de SGADD (ver punto 4 del CLAUDE.md), PLAYS da el mismo contexto
   de volumen de forma más legible.
   ===================================================================== */

const JUGADORES = {
  planillaId: null,
  fase: 'REGULAR',
  jugador: null,        // slug del jugador abierto
  tab: 'general',
  filtroEquipo: null,   // clave del equipo elegido en el picker, o null
  metricaEvolucion: 'PTS',
  rankingAbierto: 'produccion',
  /* 'promedio' | 'total' — por partido o el total de la fase. */
  rankingModo: 'promedio',
  /* null = usar el umbral de la liga (MIN del JUGADOR TIPO). El DT puede
     bajarlo para ver especialistas de pocos minutos. */
  rankingMinManual: null,
  /* Orden de la tabla abierta. null = el de la propia tabla (la métrica
     que define el top). Se resetea al cambiar de tab: un orden por RD
     arrastrado a la tabla de triples no significa nada. */
  rankingOrdenPor: null,
  rankingOrdenDir: 'desc',
};

/* =====================================================================
   RANKINGS TOP 20 DE LA LIGA

   Réplica calculada en el cliente de la hoja `RANKINGS J`, que está
   excluida del ESQUEMA a propósito (no es una tabla: son bloques
   apilados con encabezados repetidos y GViz devuelve basura — ver punto 3
   de CLAUDE.md). Misma idea que `sgadd-rankings.js` hace con RANKINGS E.

   `orden` es la métrica que decide QUIÉN entra al top 20; las columnas se
   muestran completas para cada uno de esos veinte. No se rankea columna
   por columna como en la planilla: un top 20 por PTS donde además cada
   celda trae su propio puesto se vuelve ilegible en pantalla chica.
   ===================================================================== */

const JUGADORES_TOP_N = 20;

const JUGADORES_RANKINGS = [
  /* `+/-` va como columna pero NUNCA como `orden`: el top 20 de esta tabla
     tiene que seguir siendo el de puntos. El +/- depende tanto del resto del
     quinteto que ordenar por él daría un ranking del equipo disfrazado de
     ranking de jugadores. */
  { id: 'produccion', titulo: 'Participación y puntos', orden: 'PTS',
    cols: ['PJ', 'MIN', 'PTS', 'PLAYS', 'PPP', '+/-'] },
  { id: 'eficiencia', titulo: 'Eficiencia', orden: 'eFG%',
    cols: ['PJ', 'MIN', 'USG%', 'eFG%', 'TS%', 'RTL%'] },
  { id: 'tiro', titulo: 'Tiro de campo', orden: 'TCI',
    cols: ['PJ', 'MIN', 'PTS', 'TC%', 'TCC', 'TCI'] },
  { id: 't2', titulo: 'Tiro de 2', orden: 'T2I',
    cols: ['MIN', 'PT2%', 'T2%', 'T2C', 'T2I', 'PPT2'] },
  { id: 't3', titulo: 'Tiro de 3', orden: 'T3I',
    cols: ['MIN', 'PT3%', 'T3%', 'T3C', 'T3I', 'PPT3'] },
  { id: 'libres', titulo: 'Tiros libres', orden: 'T1I',
    cols: ['MIN', 'PT1%', 'T1%', 'T1C', 'T1I', 'PPT1'] },
  /* Las dos nuevas de esta vuelta. */
  { id: 'rebotes', titulo: 'Rebotes', orden: 'RO',
    cols: ['MIN', 'RO', 'RD', 'RT'],
    nota: 'Ordenado por rebote ofensivo: es el que genera segundas chances y el que hay que salir a bloquear.' },
  { id: 'creacion', titulo: 'Creación y disciplina', orden: 'AST-PP',
    cols: ['MIN', 'AST-PP', 'AST%', 'FC', 'FR'],
    nota: 'AST-PP es la métrica que más separa a un conductor real de uno que solo tiene la pelota.' },
];

/** Umbral de minutos vigente: el manual si lo hay, si no el de la liga. */
/* Columnas que cambian entre promedio y total; el resto es una tasa y no
   se acumula. Es la misma lista que usa el plantel de Equipos, repetida
   acá a propósito: los dos módulos son independientes y `sgadd-equipos.js`
   no exporta nada que `sgadd-jugadores.js` pueda leer sin invertir la
   dependencia, que hoy va en un solo sentido. Hay un test que falla si las
   dos listas dejan de coincidir. */
const RANKING_ACUMULABLES = ['MIN', 'PTS', 'PLAYS', 'PJ', 'RT', 'RD', 'RO',
  'AST', 'PR', 'PP', 'TC', 'TR', 'FC', 'FR', 'VAL',
  'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I', 'TCC', 'TCI'];

function jugadoresUmbralRanking(idx) {
  if (typeof JUGADORES.rankingMinManual === 'number') return JUGADORES.rankingMinManual;
  return (idx.liga && typeof idx.liga.minJugador === 'number') ? idx.liga.minJugador : 0;
}

/**
 * Top N de la liga para un grupo de ranking. Puro: no toca el DOM ni el
 * estado global salvo para leer el umbral, que se puede pasar por
 * `opciones.umbral` para poder testearlo sin tocar `JUGADORES`.
 */
function jugadoresRanking(idx, id, opciones) {
  const o = opciones || {};
  const g = JUGADORES_RANKINGS.find(x => x.id === id);
  if (!g || !idx || !idx.liga) return null;

  const umbral = (typeof o.umbral === 'number') ? o.umbral : jugadoresUmbralRanking(idx);
  const topN = o.topN || JUGADORES_TOP_N;

  /* El valor de orden sale del mismo extractor que las celdas, para que
     no pueda pasar que la tabla ordene por una cosa y muestre otra.

     En modo `total` las CUENTAS se leen del acumulado que el índice cuelga
     de cada jugador; las tasas no cambian, porque una tasa acumulada es la
     misma tasa. Y como el extractor es el mismo que usa la selección del
     top N, el ranking de totales es de verdad el de los máximos anotadores
     de la fase y no el de los que más promedian: son dos preguntas
     distintas y cada modo contesta la suya. */
  const modo = (o.modo === 'total') ? 'total' : 'promedio';
  const crudo = (j, k) => (modo === 'total' && RANKING_ACUMULABLES.indexOf(k) >= 0
    && j.__acum && j.__acum[k] !== undefined) ? j.__acum[k] : j[k];
  const valor = (j, k) => (k === 'RT')
    ? (modo === 'total' && j.__acum ? jugadoresRT(j.__acum) : jugadoresRT(j))
    : (typeof crudo(j, k) === 'number' && isFinite(crudo(j, k))) ? crudo(j, k) : null;

  /* El umbral es de MINUTOS POR PARTIDO y se compara siempre contra el
     promedio, incluso en modo total: en totales un suplente con 12
     partidos cortos supera en minutos a un titular con 4, y el filtro
     dejaría entrar justo a los que vino a excluir. */
  const elegibles = (idx.liga.jugadores || []).filter(j => {
    const m = (typeof j['MIN'] === 'number' && isFinite(j['MIN'])) ? j['MIN'] : null;
    return m !== null && m >= umbral && valor(j, g.orden) !== null;
  });

  /* Dos pasos separados a propósito:
       1. QUIÉN entra al top N — siempre por la métrica del grupo. Eso es
          lo que define "el top 20 de rebotes"; si el orden de pantalla
          cambiara la selección, al ordenar por RD dejaría de ser el top
          de rebotes y pasaría a ser otro cuadro.
       2. CÓMO se muestran esos N — el orden que elija el usuario en la
          cabecera. Por defecto, el mismo del grupo. */
  const ordenados = elegibles.slice().sort((a, b) => valor(b, g.orden) - valor(a, g.orden));
  const top = ordenados.slice(0, topN);

  const ordenPor = (o.ordenPor && g.cols.indexOf(o.ordenPor) !== -1) ? o.ordenPor : g.orden;
  const dir = (o.dir === 'asc') ? 'asc' : 'desc';
  const signo = dir === 'asc' ? 1 : -1;
  top.sort((a, b) => {
    const va = valor(a, ordenPor), vb = valor(b, ordenPor);
    /* Los nulos siempre al fondo, ordene como ordene: un "—" arriba de
       todo en orden ascendente parece el mejor y es el que no tiene dato. */
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * signo;
  });

  const filas = top.map((j, i) => {
    const celdas = {};
    g.cols.forEach(k => { celdas[k] = valor(j, k); });
    return {
      puesto: i + 1,
      jugador: String(j['NOMBRES'] || '').trim(),
      equipo: SGADD.limpiarNombre(j['EQUIPO'] || ''),
      claveEquipo: SGADD.claveEquipo(j['EQUIPO'] || ''),
      slug: jugadoresSlug(j),
      celdas: celdas,
      valorOrden: valor(j, ordenPor),
    };
  });

  /* Mediana del propio top, para el anillo de referencia: la de la liga
     entera no sirve acá porque estos veinte ya son la cola de arriba. */
  const medianas = {};
  g.cols.forEach(k => {
    const vals = filas.map(f => f.celdas[k]).filter(v => v !== null).sort((a, b) => a - b);
    medianas[k] = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
  });

  return {
    id: g.id, titulo: g.titulo, orden: g.orden, nota: g.nota || null, modo: modo,
    columnas: g.cols, filas: filas, medianas: medianas,
    umbral: umbral, elegibles: elegibles.length,
    /* Con qué se está mostrando, que puede no ser con qué se seleccionó. */
    ordenPor: ordenPor, dir: dir,
  };
}

const JUGADORES_TABS = [
  { id: 'general',   label: 'General',   pregunta: '¿Qué tipo de jugador es?' },
  { id: 'tiro',      label: 'Tiro',      pregunta: '¿De dónde anota?' },
  { id: 'evolucion', label: 'Evolución', pregunta: '¿Está mejorando?' },
  { id: 'partidos',  label: 'Partidos',  pregunta: '¿Qué hizo cada noche?' },
];

/** Métricas seleccionables en el gráfico de evolución. T2/T3/T1 se leen como
    porcentaje de acierto (T2%/T3%/T1%): es lo que tiene sentido ver
    evolucionar partido a partido, no el conteo crudo. */
/* `conv`/`int` son las columnas del box score que forman ese porcentaje.

   Un 100% de triple con UN intento y otro con seis se leen igual en el
   gráfico y no son lo mismo, así que donde el C/I es inequívoco se
   muestra al lado. `TS%` no lo lleva a propósito: mezcla tiros de campo
   con libres ponderados (0,44), así que no hay un par convertidos/
   intentos que lo describa sin mentir. Antes que inventar uno, no va. */
const JUGADORES_METRICAS_EVOLUCION = [
  { id: 'PTS',    label: 'Puntos' },
  { id: 'MIN',    label: 'Minutos' },
  { id: 'PLAYS',  label: 'Plays' },
  { id: 'eFG%',   label: 'eFG%',   conv: 'TCC', int: 'TCI' },
  { id: 'TS%',    label: 'True Shooting' },
  { id: 'USG%',   label: 'Uso' },
  { id: 'RTL%',   label: 'Ratio de libres' },
  { id: 'T2%',    label: 'T2%',    conv: 'T2C', int: 'T2I' },
  { id: 'T3%',    label: 'T3%',    conv: 'T3C', int: 'T3I' },
  { id: 'T1%',    label: 'T1%',    conv: 'T1C', int: 'T1I' },
  { id: 'AST-PP', label: 'Ast. por pérdida' },
  { id: 'RO',     label: 'Rebotes ofensivos' },
  { id: 'RD',     label: 'Rebotes defensivos' },
  { id: 'RT',     label: 'Rebotes totales' },
];

/** "3/8" para la métrica y el partido dados, o null si no corresponde. */
function jugadoresConvIntento(metricaId, p) {
  const def = JUGADORES_METRICAS_EVOLUCION.find(m => m.id === metricaId);
  if (!def || !def.conv) return null;
  const c = p[def.conv], i = p[def.int];
  if (typeof c !== 'number' || typeof i !== 'number') return null;
  /* Sin intentos no hay nada que contextualizar, y "0/0" se lee como un
     fracaso cuando en realidad es una zona que no usó. */
  if (i <= 0) return null;
  return SGADD.num(c) + '/' + SGADD.num(i);
}

/* =====================================================================
   LÓGICA PURA — sin DOM. Testeada directamente en Node (test-jugadores.js).
   ===================================================================== */

/** Clave estable para navegar a un jugador puntual: nombre + equipo. */
function jugadoresSlug(j) {
  const nombre = SGADD.clavePersona(j['NOMBRES']).toLowerCase().replace(/,\s*/g, '-').replace(/\s+/g, '-');
  const equipo = SGADD.claveEquipo(j['EQUIPO']).toLowerCase().replace(/\s+/g, '-');
  return nombre + '--' + equipo;
}

/** Busca en TODA la liga (calificados o no: los datos se muestran igual). */
function jugadoresBuscar(idx, slug) {
  return (idx.liga.jugadores || []).find(j => jugadoresSlug(j) === slug) || null;
}

/* =====================================================================
   ROL POR MINUTOS — bandas fijas, no relativas a la liga.

   A propósito NO usa percentiles: un promedio de 27 minutos es "Jugador
   Clave" en cualquier categoría, no depende de cómo reparte minutos el
   resto del plantel. Eso sí varía entre ligas: el umbral de CALIFICACIÓN
   (liga.minJugador, ver grilla) sigue siendo relativo, porque decide si
   hay muestra para confiar en un percentil, pregunta distinta.
   ===================================================================== */
/* Recalibradas contra la distribución real de la liga (Primera · Clausura
   2026, 210 jugadores): MIN p25 19,4 · p50 22,7 · p75 27,9 entre los
   calificados. Los cortes anteriores (26/23/13) dejaban la banda
   "Importante" en una franja de 3 minutos —14 jugadores en toda la liga—
   y metían en "Rotación" un rango de 10 minutos con 60. Los nuevos cortes
   parten la liga en cuatro grupos comparables y coinciden con el umbral de
   calificación (~15,4 min), así que "Pocos Minutos" pasa a significar
   exactamente "no llega a calificar para percentiles". */
const ROLES_MINUTOS = [
  { id: 'clave', min: 25, label: 'Jugador Clave', corto: 'Clave',
    rol: 'Dependencia Absoluta', color: 'text-accent' },
  { id: 'importante', min: 20, label: 'Jugador Importante', corto: 'Importante',
    rol: 'Consistencia Estructural', color: 'text-green-400' },
  { id: 'rotacion', min: 15, label: 'Jugador de Rotación', corto: 'Rotación',
    rol: 'Impacto Quirúrgico', color: 'text-blue-400' },
  { id: 'pocos', min: -Infinity, label: 'Pocos Minutos', corto: 'Pocos min.',
    rol: 'Contención y Emergencia', color: 'text-yellow-400' },
];

/** Clasificación estricta por promedio de MIN. Sin heurísticos ni
    percentiles: bandas fijas, iguales para cualquier liga o categoría. */
function jugadoresRolMinutos(minutos) {
  if (typeof minutos !== 'number' || !isFinite(minutos)) return null;
  const nivel = ROLES_MINUTOS.find(r => minutos >= r.min);
  return {
    id: nivel.id, label: nivel.label, corto: nivel.corto, rol: nivel.rol, color: nivel.color,
    minutos: minutos,
    // Dentro de "Pocos Minutos" hay un matiz: por debajo de 10' la muestra
    // es tan chica que ni siquiera esa banda alcanza a describirlo bien.
    urgente: minutos < 10,
  };
}

/* =====================================================================
   ADN DEL JUGADOR — arquetipos técnicos + jerarquía dentro del plantel.

   Adaptado de obtenerSintesisPerfil(dataI). Los umbrales relativos
   ("x.xx del promedio") se calculan contra idx.liga.jugadoresCalificados
   de ESTA liga: agnóstico de liga, igual que Personalidad en Equipos.
   ===================================================================== */

/** Promedio simple de una métrica entre los jugadores que califican.
    `extractor`, si viene, reemplaza la lectura directa de la columna
    (por ejemplo, para sumar RO+RD como "rebotes totales"). */
function jugadoresPromedioMetrica(idx, clave, extractor) {
  const cal = idx.liga.jugadoresCalificados || [];
  const vals = cal.map(j => (extractor ? extractor(j) : j[clave])).filter(v => typeof v === 'number' && isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Rebotes totales de un jugador: usa la columna RT si vino, si no suma
    RO+RD a mano (mismo criterio que el resto del núcleo). */
function jugadoresRT(j) {
  if (typeof j['RT'] === 'number') return j['RT'];
  const ro = typeof j['RO'] === 'number' ? j['RO'] : 0;
  const rd = typeof j['RD'] === 'number' ? j['RD'] : 0;
  return ro + rd;
}

/** Promedios de liga que necesitan los arquetipos y la jerarquía, en un
    solo lugar para no recalcular la distribución completa por cada check. */
function jugadoresPromediosLiga(idx) {
  return {
    PLAYS: jugadoresPromedioMetrica(idx, 'PLAYS'),
    'eFG%': jugadoresPromedioMetrica(idx, 'eFG%'),
    RT: jugadoresPromedioMetrica(idx, null, jugadoresRT),
    PR: jugadoresPromedioMetrica(idx, 'PR'),
  };
}

/* =====================================================================
   REFERENCIA DE LOS RELATIVOS DE REBOTE — la mediana de los CALIFICADOS

   La fila `JUGADOR TIPO` de la planilla es la mediana de TODOS los
   jugadores del libro, incluidos los que promedian 0 minutos. Medido en la
   liga real: `RO%` del TIPO 0,0131 contra 0,0216 de mediana entre los 97
   calificados — un factor de 1,66x. En `RD%`, 1,70x.

   Consecuencia: `reboteRel = RO% / TIPO.RO%` daba 1,66 de MEDIANA para un
   jugador de rotación normal, así que un umbral de "1,20x la liga" lo
   pasaba el 65% del plantel y uno de "1,15x" el 85%. Los umbrales decían
   "muy por encima de la liga" y en los hechos significaban "juega".

   Eso hacía que `esInterior` fuera casi gratis en su parte de rebote y que
   `rim-runner` —primero de los tres roles interiores— absorbiera al grupo
   entero: `finalizador-corto` y `ancla-defensiva` daban CERO sobre 210
   jugadores (punto ciego P-1 de la auditoría).

   Se compara contra la mediana de los calificados, que es el universo con
   el que ya se construyen los percentiles y las bandas z. El TIPO queda
   como respaldo para libros sin muestra suficiente: viene de la planilla y
   es lo que el club audita, así que no se descarta, se degrada a él.
   ===================================================================== */

/** Mediana de una lista de números, o null. Local para no depender del
    orden de carga de `sgadd-core.js` en el navegador. */
function jugadoresMediana(vals) {
  const v = vals.filter(x => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Mínimo de calificados para confiar en la mediana propia. Con menos, la
    "mediana de la liga" sería la de dos o tres jugadores. */
const MIN_CALIFICADOS_REFERENCIA = 3;

/**
 * Referencias de rebote contra las que se miden `reboteRel`, `reboteDefRel`
 * y `reboteTotalRel`. Devuelve además `origen` para poder auditarlo.
 */
function jugadoresReferenciasRebote(idx) {
  const tipo = (idx && idx.liga && idx.liga.jugadorTipo) ? idx.liga.jugadorTipo : {};
  const cal = (idx && idx.liga && idx.liga.jugadoresCalificados) || [];
  const respaldo = {
    'RO%': jugadoresNN(tipo['RO%']), 'RD%': jugadoresNN(tipo['RD%']),
    RT: jugadoresNN(tipo['RT']) !== null ? jugadoresNN(tipo['RT']) : jugadoresNN(jugadoresRT(tipo)),
    origen: 'JUGADOR TIPO',
  };
  if (cal.length < MIN_CALIFICADOS_REFERENCIA) return respaldo;

  const ro = jugadoresMediana(cal.map(j => j['RO%']));
  const rd = jugadoresMediana(cal.map(j => j['RD%']));
  const rt = jugadoresMediana(cal.map(j => jugadoresRT(j)));
  if (ro === null || rd === null || !ro || !rd) return respaldo;
  return { 'RO%': ro, 'RD%': rd, RT: rt, origen: 'mediana de calificados' };
}

/* Perfiles técnicos: no son excluyentes, un jugador puede calzar en más
   de uno (por ejemplo, un tirador que además rebotea bien). */
const PERFILES_TECNICOS = [
  {
    id: 'terminador', emoji: '🎯', label: 'Terminador de Élite', relativa: true,
    calza: (j, prom) => prom.PLAYS !== null && prom['eFG%'] !== null &&
      j['PLAYS'] > prom.PLAYS && j['eFG%'] > 1.15 * prom['eFG%'] && j['PPP'] > 1.05,
    detalle: 'Alto volumen de plays con una eficiencia muy por encima de la liga: no solo participa, resuelve.',
  },
  {
    id: 'generador', emoji: '🧠', label: 'Generador',
    calza: (j) => j['AST-PP'] > 1.40,
    detalle: 'Reparte muchas más asistencias de las que pierde la pelota: hace mejor a los demás.',
  },
  {
    id: 'puntal', emoji: '🏰', label: 'Puntal en la Pintura', relativa: true,
    calza: (j, prom) => prom.RT !== null && jugadoresRT(j) > 1.20 * prom.RT,
    detalle: 'Domina el vidrio muy por encima del promedio de la liga, en ataque y en defensa.',
  },
  {
    id: 'amenaza', emoji: '🎯', label: 'Amenaza Perimetral Real',
    calza: (j) => j['T3I'] > 3.0 && j['T3%'] > 0.34,
    detalle: 'Volumen y acierto de triple genuinos: hay que salir a buscarlo afuera.',
  },
  {
    id: 'especialistaDef', emoji: '🧤', label: 'Especialista Defensivo', relativa: true,
    calza: (j, prom) => prom.PR !== null && j['PR'] > 1.30 * prom.PR,
    detalle: 'Roba muchas más pelotas que el resto de la liga: genera posesiones extra.',
  },
  {
    /* Multivariable a propósito. El criterio anterior (`PT1% > 0,25` y
       `T1% > 0,80`) era IMPOSIBLE de cumplir: el PT1% más alto de la liga
       real es 0,230, así que el arquetipo daba cero sobre 210 jugadores
       (punto ciego P-5). Un cuarto de los plays terminando en la línea es
       un perfil de NBA, no de liga amateur.

       Ahora el viaje a la línea se mide con cuatro señales que describen
       cosas distintas y por eso se exigen juntas:
         · RTL%  → con qué frecuencia el ataque termina en tiro libre
         · FR    → agresividad: cuántas faltas recibe por partido
         · PT1%  → qué porción de SUS plays son libres
         · T1%   → si el viaje además rinde
       Los tres primeros están calibrados sobre el percentil ~70 de la liga
       real; el T1% es el único absoluto, porque convertir 72% de libres es
       bueno en cualquier categoría. */
    id: 'buscadorContacto', emoji: '📏', label: 'Buscador de Contacto',
    calza: (j) => j['RTL%'] >= JUGADORES_UMBRALES.rtlContacto &&
      j['FR'] >= JUGADORES_UMBRALES.frContacto &&
      j['PT1%'] >= JUGADORES_UMBRALES.usoLibreContacto &&
      j['T1%'] >= JUGADORES_UMBRALES.t1Contacto,
    detalle: 'Ataca el contacto con volumen real (tasa de libres y faltas recibidas por encima de la liga) y además convierte.',
  },
];

/** Perfiles técnicos que calza un jugador. Puede devolver varios o ninguno. */
function jugadoresArquetipos(idx, j) {
  const prom = jugadoresPromediosLiga(idx);
  return PERFILES_TECNICOS
    .filter(p => { try { return !!p.calza(j, prom); } catch (e) { return false; } })
    .map(p => ({ id: p.id, emoji: p.emoji, label: p.label, detalle: p.detalle, relativa: !!p.relativa }));
}

/* Jerarquía dentro del plantel: ACÁ SÍ son excluyentes entre sí, se evalúa
   en cascada y gana el primero que calce (de más a menos exigente). */
const JERARQUIA = [
  {
    id: 'franquicia', emoji: '⭐', label: 'Jugador Franquicia', relativa: true,
    calza: (j, prom) => prom.PLAYS !== null && j['PLAYS'] > 1.20 * prom.PLAYS &&
      typeof j['MIN'] === 'number' && j['MIN'] > 28,
    descripcion: 'Líder absoluto del plantel: el equipo pasa por sus manos y por sus minutos.',
  },
  {
    id: 'referente', emoji: '⚔️', label: 'Referente Ofensivo / Segunda Espada', relativa: true,
    calza: (j, prom) => prom.PLAYS !== null && j['PLAYS'] > prom.PLAYS,
    descripcion: 'Alto volumen de decisiones: carga una parte grande del ataque.',
  },
  {
    /* NO decir "titular". La planilla no trae el quinteto inicial, y 23
       minutos de promedio los puede hacer perfectamente un sexto hombre.
       La etiqueta describe la CARGA DE MINUTOS, que es lo que el dato
       sostiene, no el momento en que entra a la cancha. */
    id: 'quinteto', emoji: '🧱', label: 'Pieza de Rotación Alta',
    calza: (j) => typeof j['MIN'] === 'number' && j['MIN'] >= 23,
    descripcion: 'Carga de minutos alta y aporte estable, sin ser el foco del ataque.',
  },
  {
    id: 'especialista', emoji: '🛠️', label: 'Especialista de Rol',
    calza: () => true,
    descripcion: 'Ejecuta tareas puntuales dentro de un rol acotado.',
  },
];

/** Un único nivel de jerarquía (ADN), el primero que calza en la cascada. */
function jugadoresJerarquia(idx, j) {
  const prom = jugadoresPromediosLiga(idx);
  const nivel = JERARQUIA.find(n => { try { return !!n.calza(j, prom); } catch (e) { return false; } });
  return { id: nivel.id, emoji: nivel.emoji, label: nivel.label, descripcion: nivel.descripcion, relativa: !!nivel.relativa };
}

/* =====================================================================
   MOTOR CENTRALIZADO DE ADN — single source of truth

   Todo lo que "etiqueta" a un jugador (banda de minutos, jerarquía,
   arquetipos técnicos y rol funcional) sale de acá y de ningún otro lado.
   Antes el rol funcional vivía en `sgadd-scouting.js` y el resto acá, así
   que el mismo jugador aparecía como "Manejador Secundario" en el informe
   pre-partido y como "⭐ Jugador Franquicia · 🧤 Especialista Defensivo"
   en su ficha, sin que nada explicara la diferencia.

   No son taxonomías que compitan: responden preguntas distintas (cuánto
   juega / cuánto pesa en el plantel / qué sabe hacer / qué función cumple
   en cancha). El error era MOSTRAR un subconjunto distinto en cada
   sección. Ahora las dos piden `jugadoresADN()` y pintan lo mismo.

   `sgadd-scouting.js` carga DESPUÉS que este archivo, así que puede usar
   estos globals; la dependencia va en un solo sentido.
   ===================================================================== */

/* Umbrales del rol funcional. Viven acá porque el rol vive acá: si
   quedaran en scouting, cambiar uno movería la etiqueta en una sección y
   no en la otra, que es justo el bug que esto cierra. */
const JUGADORES_UMBRALES = {
  minutosClave: 20,              // debajo de esto no condiciona un plan
  astPPGenerador: 1.40,          // asistencias por pérdida de un conductor real
  astVolumenGenerador: 2.5,      // el ratio solo no alcanza: hace falta volumen
  usoTripleAlto: 0.40,           // 40% de sus plays terminan en triple
  pptDobleAlto: 1.10,            // finaliza de verdad cerca del aro (p75 de la liga)

  /* --- Rebote, todo x la MEDIANA DE LOS CALIFICADOS ---
     Ver `jugadoresReferenciasRebote()`: antes se medía contra el JUGADOR
     TIPO, que es la mediana de TODOS (incluidos los de 0 minutos) y venía
     1,7x abajo. Con la referencia corregida estos números por fin
     significan lo que dicen; en percentiles de la liga real:
       1,10 ≈ p57 · 1,15 ≈ p62 · 1,30 ≈ p68 */
  reboteOfensivoAlto: 1.30,      // rim runner: vive del cristal OFENSIVO
  reboteInterior: 1.15,          // ancla defensiva y origen interior, sobre RD%
  reboteDesempate: 1.10,         // zona gris de mezcla: define interior vs perimetral

  /* Discriminantes de ORIGEN. El bug que cerraron: clasificar por PPT2
     solo mete a cualquier slasher eficiente en la bolsa de "referencia
     interna". De dónde LANZA se mide sobre intentos, no sobre aciertos. */
  mezclaTripleaPerimetral: 0.30, // T3I / (T3I + T2I): de acá arriba, tira de afuera
  mezclaTripleInterior: 0.12,    // debajo, prácticamente no sale del área

  /* --- Viaje a la línea (arquetipo Buscador de Contacto) ---
     Los tres primeros salen del percentil ~70 de la liga real; el T1% es
     absoluto porque convertir 72% es bueno en cualquier categoría. */
  rtlContacto: 0.28,             // RTL%: frecuencia con que el ataque termina en la línea
  frContacto: 2.5,               // faltas recibidas por partido
  usoLibreContacto: 0.12,        // PT1%: porción de SUS plays que son libres
  t1Contacto: 0.72,              // efectividad mínima en el cobro
};

/** Rol funcional: cascada excluyente, sin posiciones tradicionales. */
const JUGADORES_ROLES_FUNCIONALES = [
  {
    id: 'generador-primario', label: 'Generador Primario',
    test: (p) => p.astPP !== null && p.ast !== null &&
      p.astPP >= JUGADORES_UMBRALES.astPPGenerador &&
      p.ast >= JUGADORES_UMBRALES.astVolumenGenerador &&
      p.min >= JUGADORES_UMBRALES.minutosClave,
    detalle: (p) => 'conduce el ataque: ' + jugadoresNum(p.ast, 1) + ' AST con ' + jugadoresNum(p.astPP, 2) + ' de AST-PP.',
  },
  /* ------------------------------------------------------------------
     LOS TRES ROLES INTERIORES · orden y umbrales recalibrados (P-1)

     Antes `rim-runner` iba primero y pedía `reboteRel ≥ 1,20` contra una
     referencia inflada, así que se llevaba el 100% del grupo interior:
     `finalizador-corto` y `ancla-defensiva` daban CERO sobre 210 jugadores.

     Ahora cada uno pide su ESPECIALIDAD DOMINANTE, y el orden va del rol
     más específico al más genérico:
       1. finalizador-corto → termina cerca del aro (PPT2)
       2. ancla-defensiva   → su fuerte es el cristal DEFENSIVO, y lo es
                              más que el ofensivo (`reboteDefRel > reboteRel`)
       3. rim-runner        → vive del cristal OFENSIVO
       4. poste-bajo        → interior sin una dimensión dominante
     Sin el comparativo del punto 2, el ancla y el rim runner vuelven a ser
     el mismo test con otro nombre: en esta liga el que rebotea en defensa
     casi siempre también rebotea en ataque.
     ------------------------------------------------------------------ */
  {
    id: 'finalizador-corto', label: 'Finalizador Corto / Short Roll',
    test: (p) => p.esInterior && p.pptDoble !== null && p.pptDoble >= JUGADORES_UMBRALES.pptDobleAlto,
    detalle: (p) => 'termina cerca del aro con ' + jugadoresNum(p.pptDoble, 2) + ' por doble intentado.',
  },
  {
    id: 'ancla-defensiva', label: 'Ancla Defensiva', relativa: true,
    test: (p) => p.esInterior && p.reboteDefRel !== null && p.reboteRel !== null &&
      p.reboteDefRel >= JUGADORES_UMBRALES.reboteInterior && p.reboteDefRel > p.reboteRel,
    detalle: (p) => 'sostiene el rebote defensivo (' + jugadoresNum(p.reboteDefRel, 2) +
      'x la mediana de la liga en RD%) más de lo que carga el ofensivo (' + jugadoresNum(p.reboteRel, 2) + 'x).',
  },
  {
    id: 'rim-runner', label: 'Rebotador de Impacto / Rim Runner', relativa: true,
    test: (p) => p.esInterior && p.reboteRel !== null && p.reboteRel >= JUGADORES_UMBRALES.reboteOfensivoAlto,
    detalle: (p) => 'vive del cristal ofensivo: ' + jugadoresNum(p.reboteRel, 2) + 'x la mediana de la liga en RO%.',
  },
  {
    /* Fallback INTERIOR. Sin él, un interior que no destaca en ninguna de
       las tres dimensiones caía en "Rol Complementario" junto a los
       perimetrales sin rasgo, y el informe perdía el único dato que sí
       tenía de él: que juega de espaldas al aro. */
    id: 'poste-bajo', label: 'Juego de Espaldas / Poste Bajo',
    test: (p) => p.esInterior,
    detalle: (p) => 'juega de espaldas al aro: solo ' + jugadoresPct(p.mezclaTriple) +
      ' de sus tiros de campo salen de la línea de 3.',
  },
  {
    id: 'spacing', label: 'Spacing / Tirador de Descarga',
    test: (p) => p.esPerimetral && p.usoTriple !== null && p.usoTriple >= JUGADORES_UMBRALES.usoTripleAlto,
    detalle: (p) => 'abre la cancha: ' + jugadoresPct(p.usoTriple) + ' de sus plays terminan en triple.',
  },
  {
    id: 'slasher', label: 'Slasher / Penetrador',
    /* PPT2 alto pero origen perimetral: ataca el aro DESDE afuera, no
       juega de espaldas. */
    test: (p) => p.esPerimetral && p.pptDoble !== null && p.pptDoble >= 1.00,
    detalle: (p) => 'ataca el aro desde el perímetro: ' + jugadoresNum(p.pptDoble, 2) +
      ' por doble intentado con ' + jugadoresPct(p.mezclaTriple) + ' de sus tiros de campo desde la línea de 3.',
  },
  {
    id: 'manejador-secundario', label: 'Manejador Secundario',
    test: (p) => p.astPP !== null && p.astPP >= 1.00 && p.min >= JUGADORES_UMBRALES.minutosClave,
    detalle: (p) => 'segunda línea de conducción: ' + jugadoresNum(p.astPP, 2) + ' de AST-PP.',
  },
  {
    id: 'perimetral-media', label: 'Perimetral de Media Distancia',
    test: (p) => p.esPerimetral,
    detalle: (p) => 'juega de cara al aro sin volumen de triple: ' + jugadoresPct(p.usoTriple) + ' de uso externo.',
  },
  {
    id: 'complementario', label: 'Rol Complementario',
    test: () => true,
    detalle: () => 'sin una función dominante que condicione el plan defensivo.',
  },
];

function jugadoresNum(v, dec) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(dec).replace('.', ',') : '—';
}
function jugadoresPct(v) {
  return (typeof v === 'number' && isFinite(v)) ? (v * 100).toFixed(1).replace('.', ',') + '%' : '—';
}
function jugadoresNN(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function jugadoresDiv(a, b) {
  return (jugadoresNN(a) !== null && jugadoresNN(b) !== null && b !== 0) ? a / b : null;
}

/**
 * Perfil métrico de un jugador, SIN los campos que dependen del total del
 * equipo (concentración de plays, cuota de triples). Esos los agrega
 * Scouting encima, porque solo tienen sentido dentro de un plantel.
 *
 * Es la base compartida: las dos secciones parten de los mismos números.
 */
function jugadoresPerfilBase(idx, j) {
  const tipo = (idx && idx.liga && idx.liga.jugadorTipo) ? idx.liga.jugadorTipo : {};
  const ref = jugadoresReferenciasRebote(idx);
  const rebote = jugadoresNN(j['RO%']);
  const reboteDef = jugadoresNN(j['RD%']);
  const t3i = jugadoresNN(j['T3I']);
  const t2i = jugadoresNN(j['T2I']);

  /* Sobre INTENTOS, no sobre conversiones: de dónde tira no depende de si
     le entra. */
  const mezclaTriple = jugadoresDiv(t3i, (t3i || 0) + (t2i || 0));
  const reboteRel = jugadoresDiv(rebote, ref['RO%']);
  const reboteDefRel = jugadoresDiv(reboteDef, ref['RD%']);
  const reboteTotalRel = jugadoresDiv(jugadoresRT(j), ref.RT);

  const p = {
    nombre: String(j['NOMBRES'] || '').trim(),
    clave: j.__clave || null,
    /* El equipo CRUDO, tal cual viene de la planilla: lo necesita el buzón
       para armar la clave de estado, que es NOMBRE + EQUIPO normalizado. */
    equipo: j['EQUIPO'] || null,
    min: jugadoresNN(j['MIN']), plays: jugadoresNN(j['PLAYS']),
    pts: jugadoresNN(j['PTS']), ppp: jugadoresNN(j['PPP']),
    efg: jugadoresNN(j['eFG%']), ts: jugadoresNN(j['TS%']),
    usg: jugadoresNN(j['USG%']), rtl: jugadoresNN(j['RTL%']),
    usoTriple: jugadoresNN(j['PT3%']), pptTriple: jugadoresNN(j['PPT3']),
    usoDoble: jugadoresNN(j['PT2%']), pptDoble: jugadoresNN(j['PPT2']),
    usoLibre: jugadoresNN(j['PT1%']), pptLibre: jugadoresNN(j['PPT1']),
    t1: jugadoresNN(j['T1%']), t2: jugadoresNN(j['T2%']), t3: jugadoresNN(j['T3%']),
    t3i: t3i, t2i: t2i, t1i: jugadoresNN(j['T1I']),
    perdidas: jugadoresNN(j['PePP%']),
    rebote: rebote, reboteDef: reboteDef,
    ro: jugadoresNN(j['RO']), rd: jugadoresNN(j['RD']),
    ast: jugadoresNN(j['AST']), astPP: jugadoresNN(j['AST-PP']),
    pr: jugadoresNN(j['PR']),
    mezclaTriple: mezclaTriple,
    perdidasRel: jugadoresDiv(jugadoresNN(j['PePP%']), jugadoresNN(tipo['PePP%'])),
    reboteRel: reboteRel, reboteDefRel: reboteDefRel, reboteTotalRel: reboteTotalRel,
    refRebote: ref.origen,
    rtl: jugadoresNN(j['RTL%']), fr: jugadoresNN(j['FR']), fc: jugadoresNN(j['FC']),
    califica: !!j.__califica,
  };

  /* ------------------------------------------------------------------
     ORIGEN · sin zona gris (P-6 / P-9)

     Tres tramos de mezcla de triple, no dos:
       < 0,12          → interior sin discusión (casi no sale del área)
       ≥ 0,30          → perimetral sin discusión (volumen real de triple)
       [0,12 ; 0,30)   → DESEMPATE por cristal: el rebote total decide.

     Antes ese tramo intermedio no era ni una cosa ni la otra y dejaba al
     35% de la liga sin origen; como cuatro de los nueve roles funcionales
     exigen uno de los dos flags, esos jugadores solo podían caer en el
     fallback. El ala que tira poco de afuera y no rebotea es un perfil
     real —no un residuo— y ahora se resuelve hacia el lado que su juego
     indica en vez de quedar afuera del sistema.

     Se usa el rebote TOTAL y no el ofensivo: en la franja intermedia lo
     que define si alguien juega adentro es cuánto vidrio toma, no de qué
     lado del aro lo toma.
     ------------------------------------------------------------------ */
  const U = JUGADORES_UMBRALES;
  if (mezclaTriple === null) {
    // Sin un solo tiro de campo no hay origen que inferir. No se inventa.
    p.esInterior = false;
    p.esPerimetral = false;
  } else if (mezclaTriple < U.mezclaTripleInterior) {
    p.esInterior = true;
    p.esPerimetral = false;
  } else if (mezclaTriple >= U.mezclaTripleaPerimetral) {
    p.esInterior = false;
    p.esPerimetral = true;
  } else {
    const pesaEnElCristal = reboteTotalRel !== null && reboteTotalRel >= U.reboteDesempate;
    p.esInterior = pesaEnElCristal;
    p.esPerimetral = !pesaEnElCristal;
  }

  /* Los arquetipos son la fuente primaria del origen: si acá ya se lo
     marcó como amenaza perimetral, eso pisa el cálculo de mezcla. */
  p.arquetipos = jugadoresArquetipos(idx, j).map(a => a.label);
  if (p.arquetipos.indexOf('Amenaza Perimetral Real') !== -1) {
    p.esPerimetral = true;
    p.esInterior = false;
  }
  return p;
}

/** Rol funcional: primera de la cascada que calza (excluyente). */
function jugadoresRolFuncional(perfil) {
  const r = JUGADORES_ROLES_FUNCIONALES.find(d => {
    try { return !!d.test(perfil); } catch (e) { return false; }
  }) || JUGADORES_ROLES_FUNCIONALES[JUGADORES_ROLES_FUNCIONALES.length - 1];
  return { id: r.id, label: r.label, detalle: r.detalle(perfil), relativa: !!r.relativa };
}

/**
 * ADN completo de un jugador: LA función que tienen que llamar todas las
 * secciones. Devuelve las cuatro taxonomías juntas para que ninguna vista
 * pueda mostrar un subconjunto distinto de otra.
 */
function jugadoresADN(idx, j) {
  if (!idx || !j) return null;
  const perfil = jugadoresPerfilBase(idx, j);
  return {
    nombre: perfil.nombre,
    clave: perfil.clave,
    perfil: perfil,
    rolMinutos: jugadoresRolMinutos(perfil.min),      // cuánto juega
    jerarquia: jugadoresJerarquia(idx, j),            // cuánto pesa en el plantel
    arquetipos: jugadoresArquetipos(idx, j),          // qué sabe hacer
    rolFuncional: jugadoresRolFuncional(perfil),      // qué función cumple en cancha
  };
}

/**
 * Etiquetas cortas del ADN, para pintar badges iguales en todas las vistas.
 *
 * SIN RESPALDO (punto ciego P-7 de la auditoría). Las medias y las bandas de
 * liga se calculan SOLO sobre los jugadores calificados, pero las etiquetas
 * se le asignan a todos. Un jugador de 6 minutos con AST-PP de 2,0 sobre una
 * muestra de tres pases recibía "🧠 Generador" con el mismo peso visual que
 * uno de 30 minutos, mientras su propia ficha mostraba los percentiles en
 * blanco: la etiqueta se veía firme y el dato que la sostiene, no.
 *
 * La regla del proyecto es mostrar el dato y quitarle autoridad, no
 * esconderlo — igual que el `~` del percentil y las barras grises. Así que
 * el badge se marca, no se borra.
 *
 * SE MARCAN TODAS, no solo las relativas, y esto se corrigió DESPUÉS de
 * medirlo: acotar la marca a las etiquetas que se comparan contra la liga
 * dejaba **1 badge marcado sobre 216 jugadores** en la liga real, o sea que
 * no tocaba el caso que la auditoría denuncia. El ejemplo del punto ciego
 * —"🧠 Generador con AST-PP 2,0 sobre una muestra de tres pases"— es de
 * UMBRAL ABSOLUTO: lo que lo vuelve poco confiable no es contra qué se
 * compara, sino que **su propio promedio se calculó sobre nada**. Un
 * jugador que no llega al umbral de minutos tiene todas sus tasas flojas,
 * así que toda etiqueta derivada de ellas tiene el mismo problema. Es
 * exactamente el criterio que ya usa el percentil, que no aparece para
 * NINGUNA métrica de un no calificado.
 *
 * El flag `relativa` del catálogo sigue vivo y sirve para decirlo con más
 * precisión en el tooltip: esas además se miden contra una mediana armada
 * con los que sí califican.
 */
function jugadoresBadges(adn) {
  if (!adn) return [];
  const califica = !!(adn.perfil && adn.perfil.califica);
  const out = [];
  const marca = (tipo, texto, relativa) => {
    const sinRespaldo = !califica;
    out.push({
      tipo: tipo,
      texto: sinRespaldo ? '~ ' + texto : texto,
      sinRespaldo: sinRespaldo,
      /* El motivo va en el objeto y no armado en cada vista: son tres
         renders distintos —card del plantel, ficha y scouting— y un texto
         duplicado tres veces termina diciendo tres cosas. */
      motivo: sinRespaldo
        ? (relativa ? JUGADORES_MOTIVO_SIN_RESPALDO + ' Además se mide contra una mediana armada con los que sí califican.'
          : JUGADORES_MOTIVO_SIN_RESPALDO)
        : null,
    });
  };
  if (adn.jerarquia) marca('jerarquia', adn.jerarquia.emoji + ' ' + adn.jerarquia.label, adn.jerarquia.relativa);
  if (adn.rolFuncional) marca('rol', adn.rolFuncional.label, adn.rolFuncional.relativa);
  (adn.arquetipos || []).forEach(a => marca('arquetipo', a.emoji + ' ' + a.label, a.relativa));
  return out;
}

const JUGADORES_MOTIVO_SIN_RESPALDO =
  'El jugador no llega al umbral de minutos de la liga: sus promedios salen de ' +
  'una muestra chica, así que la etiqueta se muestra igual pero con menos respaldo.';

/** El percentil más bajo entre un puñado de métricas de referencia: la
    lectura más corta de "por dónde se lo puede exponer o mejorar". */
function jugadoresPuntoDeFuga(idx, j) {
  const claves = ['eFG%', 'PePP%', 'RTL%', 'AST-PP', 'T1%'];
  const leidas = claves.map(k => idx.leerJugador(j, k)).filter(r => r && r.percentil !== null);
  if (!leidas.length) return null;
  const peor = leidas.slice().sort((a, b) => a.percentil - b.percentil)[0];
  return {
    clave: peor.clave, label: peor.label, formateado: peor.formateado, percentil: peor.percentil,
    texto: 'Su punto de fuga es ' + peor.label.toLowerCase() + ' (' + peor.formateado +
      ', percentil ' + peor.percentil.toFixed(0) + ').',
  };
}

/** Síntesis completa de un jugador: rol por minutos, arquetipos, jerarquía,
    impacto/eficiencia (para las tarjetas Alto/Medio/Bajo) y una conclusión
    táctica. No es una recomendación de renovación de contrato (esto es
    scouting de un club amateur, no gestión de plantel profesional): la
    "conclusión" es la condición de uso, no una decisión de continuidad. */
function jugadoresSintesisPerfil(idx, j) {
  const prom = jugadoresPromediosLiga(idx);
  const rolMinutos = jugadoresRolMinutos(j['MIN']);
  const arquetipos = jugadoresArquetipos(idx, j);
  const jerarquia = jugadoresJerarquia(idx, j);
  const fuga = jugadoresPuntoDeFuga(idx, j);

  const nivelImpacto = (prom.PLAYS === null || typeof j['PLAYS'] !== 'number') ? 'Bajo'
    : j['PLAYS'] > 1.20 * prom.PLAYS ? 'Alto'
    : j['PLAYS'] > prom.PLAYS ? 'Medio' : 'Bajo';
  const impacto = {
    nivel: nivelImpacto, titulo: 'Impacto colectivo',
    detalle: SGADD.formatear('PLAYS', j['PLAYS']) + ' PLAYS · ' + SGADD.formatear('MIN', j['MIN']) + ' MIN',
    texto: nivelImpacto === 'Alto'
      ? 'Máximo volumen de decisiones y minutos del plantel. El equipo se apoya en él cuando el sistema colectivo se traba.'
      : nivelImpacto === 'Medio'
      ? 'Volumen de uso por encima de la media de la liga: participa activamente del armado del juego.'
      : 'Bajo volumen de uso: su aporte no pasa por acumular decisiones.',
  };

  const efgProm = prom['eFG%'];
  const nivelEficiencia = (efgProm === null || typeof j['eFG%'] !== 'number') ? 'Medio'
    : j['eFG%'] > 1.15 * efgProm ? 'Alto'
    : j['eFG%'] >= efgProm ? 'Medio' : 'Bajo';
  const eficiencia = {
    nivel: nivelEficiencia, titulo: 'Eficiencia individual',
    detalle: 'eFG% ' + SGADD.formatear('eFG%', j['eFG%']) + ' · PPP ' + SGADD.formatear('PPP', j['PPP']),
    texto: nivelEficiencia === 'Alto'
      ? 'Convierte con una eficiencia muy por encima del promedio de la liga: no solo participa, resuelve.'
      : nivelEficiencia === 'Medio'
      ? 'Eficiencia sostenible pero mejorable: el volumen compensa lo que le falta de acierto.'
      : 'Eficiencia por debajo de la media de la liga: el volumen de uso no se traduce en producción limpia.',
  };

  const nivelConclusion = (nivelImpacto === 'Alto' || nivelEficiencia === 'Alto') ? 'Alta' : 'Media';
  const partesConclusion = ['Rol actual: ' + rolMinutos.rol + ' (' + rolMinutos.label.toLowerCase() + ', ' +
    SGADD.formatear('MIN', rolMinutos.minutos) + ' MIN de promedio).'];
  if (fuga) partesConclusion.push('Para optimizarlo, atender ' + fuga.label.toLowerCase() + '.');
  const conclusion = { nivel: nivelConclusion, titulo: 'Conclusión táctica', texto: partesConclusion.join(' ') };

  /* Que el jugador califique o no viaja con la síntesis: la ficha marca con
     `~` las etiquetas que se apoyan en una comparación contra la liga que su
     muestra no sostiene (P-7). */
  return { rolMinutos, arquetipos, jerarquia, impacto, eficiencia, puntoDeFuga: fuga, conclusion,
    califica: !!j.__califica };
}

/** z-score de un valor puntual contra la media/desvío del propio jugador. */
function jugadoresZScore(valor, media, desvio) {
  if (typeof valor !== 'number' || typeof media !== 'number' || typeof desvio !== 'number') return null;
  return (valor - media) / (desvio || 1);
}

/** Wrapper de idx.leerJugador() con las props que esperan StatCard/PercentileBar. */
function jugadoresLeer(idx, j, clave) {
  const r = idx.leerJugador(j, clave);
  if (r) { r.muestraSuficiente = r.califica; r.pj = j['PJ']; }
  return r;
}

/** Partidos de un jugador, orden cronológico ascendente. Los sin fecha
    quedan al final — mismo criterio que e.partidos en sgadd-equipos.js.
    Para "más reciente primero" (tab Partidos), el que llama hace .reverse(). */
function jugadoresPartidosOrdenados(idx, clave) {
  const lista = (idx.liga.jugadorPartidos.get(clave) || []).slice();
  lista.sort((a, b) => {
    if (a.__fecha && b.__fecha) return a.__fecha - b.__fecha;
    if (a.__fecha) return -1;
    if (b.__fecha) return 1;
    return 0;
  });
  return lista;
}

/**
 * El id canónico del partido de UNA fila de jugador: el que usa Equipos.
 *
 * Desde el join de FECHA en `construirIndice()`, `Base Datos J` hereda la
 * fecha del mismo PARTIDO en `Base Datos E`, así que el `__id` de la fila
 * YA suele ser el bueno. Por eso el primer intento es usarlo tal cual —es
 * exacto, no una inferencia— y recién si no existe en el índice del equipo
 * se cae al match por TEXTO de PARTIDO.
 *
 * Ese fallback sigue haciendo falta para el caso que el join no puede
 * resolver: un cruce con ida y vuelta (mismo `"A vs B"` en dos fechas) donde
 * la fila del jugador viene sin fecha. Ahí el texto no alcanza para saber de
 * qué noche se trata y se abre la primera; es una aproximación conocida, no
 * un dato. La forma de cerrarla de verdad es que la planilla traiga la
 * FECHA en `Base Datos J`.
 */
function jugadoresIdCanonico(idx, p) {
  const e = idx.get(p['EQUIPO']);
  if (!e) return p.__id || null;
  if (p.__id && e.partidosPorId && e.partidosPorId.has(p.__id)) return p.__id;
  const match = e.partidos.find(x => x.__partido === p.__partido);
  return match ? match.__id : (p.__id || null);
}

/** Saca el nombre del rival del string "A vs B", desde la fila de un jugador. */
function jugadoresRival(p) {
  const partido = SGADD.texto(p['PARTIDO']);
  const partes = partido.split(/\s+vs\s+/i);
  if (partes.length !== 2) return partido;
  const mio = SGADD.claveEquipo(p['EQUIPO']);
  const otro = SGADD.claveEquipo(partes[0]) === mio ? partes[1] : partes[0];
  return SGADD.limpiarNombre(otro);
}

/** "L" / "V" / "?" — la condición corta que va en badges y tooltips. */
function jugadoresCondicionCorta(p) {
  const cond = SGADD.texto(p['CONDICION']).toUpperCase();
  return cond === 'LOCAL' ? 'L' : cond === 'VISITANTE' ? 'V' : '?';
}

/** "14/10/2025 - vs RECONQUISTA (L)" — para el tooltip del gráfico de
    evolución: fecha, rival y condición en una sola línea. */
function jugadoresEtiquetaEvolucion(p) {
  return SGADD.formatearFecha(p.__fecha) + ' - vs ' + jugadoresRival(p) + ' (' + jugadoresCondicionCorta(p) + ')';
}

/* =====================================================================
   LOCAL VS. VISITANTE

   Si un jugador rinde distinto de local que de visitante, es una señal de
   scouting real (¿depende del aliento? ¿de dormir en la ruta?). No hay
   equivalente ya calculado para jugadores como e.split en Equipos: se
   arma acá filtrando liga.jugadorPartidos por CONDICION.
   ===================================================================== */

/** Métricas que se comparan entre local y visitante. */
const CLAVES_CONDICION = ['PTS', 'eFG%', 'PLAYS', 'MIN', 'USG%', 'AST-PP'];

/** Con menos partidos de un lado, un solo picazo decide la comparación:
    no hay suficiente para leer "sensibilidad" y no una racha. */
const MIN_PJ_CONDICION = 2;

/** Promedio y cantidad de partidos de un jugador, separado en LOCAL/VISITANTE. */
function jugadoresSplitCondicion(idx, j) {
  const partidos = idx.liga.jugadorPartidos.get(j.__clave) || [];
  const porCondicion = (cond) => partidos.filter(p => SGADD.texto(p['CONDICION']).toUpperCase() === cond);
  const local = porCondicion('LOCAL');
  const visitante = porCondicion('VISITANTE');

  const promedio = (arr, k) => {
    const vals = arr.map(p => p[k]).filter(v => typeof v === 'number' && isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const armar = (arr) => {
    const o = { pj: arr.length };
    CLAVES_CONDICION.forEach(k => { o[k] = promedio(arr, k); });
    return o;
  };

  const localM = armar(local), visitanteM = armar(visitante);
  const suficiente = localM.pj >= MIN_PJ_CONDICION && visitanteM.pj >= MIN_PJ_CONDICION;

  return {
    local: localM, visitante: visitanteM, suficiente,
    sensibilidad: suficiente ? jugadoresSensibilidadCondicion(localM, visitanteM) : null,
  };
}

/* Umbral = diferencia mínima para no confundir ruido con una tendencia real.
   `tipo` separa métricas de RENDIMIENTO (PTS/eFG%/AST-PP: subir o bajar es
   una mejora o una caída) de métricas de USO (PLAYS/MIN/USG%: cambian el
   rol, no necesariamente la calidad). */
const SENSIBILIDAD_CONDICION = [
  { clave: 'PTS', umbral: 2.0, tipo: 'rendimiento' },
  { clave: 'eFG%', umbral: 0.03, tipo: 'rendimiento' },
  { clave: 'AST-PP', umbral: 0.3, tipo: 'rendimiento' },
  { clave: 'PLAYS', umbral: 2.0, tipo: 'uso' },
  { clave: 'MIN', umbral: 2.0, tipo: 'uso' },
  { clave: 'USG%', umbral: 0.03, tipo: 'uso' },
];

/** El indicador rápido: cuál es la métrica que más cambia entre local y
    visitante (en relación a SU propio umbral, no en términos absolutos —
    así 3 puntos de más en PTS y 3pp de más en eFG% se pueden comparar). */
function jugadoresSensibilidadCondicion(localM, visitanteM) {
  const filas = SENSIBILIDAD_CONDICION.map(def => {
    const l = localM[def.clave], v = visitanteM[def.clave];
    if (l === null || v === null) return null;
    const dif = l - v;
    return { clave: def.clave, tipo: def.tipo, dif: dif, peso: Math.abs(dif) / def.umbral };
  }).filter(Boolean);

  const relevantes = filas.filter(f => f.peso >= 1).sort((a, b) => b.peso - a.peso);
  if (!relevantes.length) {
    return { nivel: 'estable', clave: null, dif: 0,
      texto: 'Rendimiento estable entre local y visitante: ninguna métrica cambia de forma relevante.' };
  }

  const top = relevantes[0];
  const label = SGADD.metrica(top.clave).label;
  const valor = SGADD.formatear(top.clave, Math.abs(top.dif));
  const nivel = top.dif > 0 ? 'local' : 'visitante';
  const texto = top.tipo === 'rendimiento'
    ? 'Mejora de ' + (nivel === 'local' ? 'Local' : 'Visitante') + ' en ' + label +
      ' (' + (top.dif > 0 ? '+' : '-') + valor + ' respecto a la otra condición)'
    : (nivel === 'local' ? 'Más ' : 'Menos ') + label.toLowerCase() + ' de local (' +
      (top.dif > 0 ? '+' : '') + SGADD.formatear(top.clave, top.dif) + ')';

  return { nivel: nivel, clave: top.clave, dif: top.dif, texto: texto };
}

/* =====================================================================
   RUTEO
   ===================================================================== */

function jugadoresLeerRuta() {
  const r = SGADD.Ruta.parse(window.location.hash);
  if (r.seccion !== 'jugadores') return null;
  if (r.planilla) JUGADORES.planillaId = r.planilla;
  if (r.fase) JUGADORES.fase = r.fase;
  SGADD_APP.aplicarTorneoRuta(r.torneo);
  JUGADORES.jugador = r.entidad || null;
  JUGADORES.tab = r.tab || 'general';
  /* Devuelve la ruta PARSEADA: quien llama necesita saber si la planilla
     vino de la URL en ESTA lectura, no si la sección guardó una de un
     render anterior (ver el build). */
  return r;
}

function jugadoresEscribirRuta(reemplazar) {
  const h = SGADD.Ruta.build({
    planilla: JUGADORES.planillaId,
    torneo: SGADD_APP.estado.torneo,
    fase: JUGADORES.fase,
    seccion: 'jugadores',
    entidad: JUGADORES.jugador,
    tab: JUGADORES.jugador ? JUGADORES.tab : null,
  });
  if (reemplazar) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
}

function jugadoresIrA(slug) {
  JUGADORES.jugador = slug || null;
  JUGADORES.tab = 'general';
  jugadoresEscribirRuta(false);
  jugadoresPintar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function jugadoresVerTab(id) {
  JUGADORES.tab = id;
  jugadoresEscribirRuta(true);
  jugadoresPintar();
}

function jugadoresVolver() { jugadoresIrA(null); }

/** Cruza a la sección Equipos, al detalle del partido donde jugó. Reusa el
    box score y el insight que ya tiene Equipos: no hay que duplicarlo acá. */
function jugadoresVerPartido(equipoCrudo, idPartido) {
  if (!equipoCrudo || !idPartido) return;
  const slug = SGADD.claveEquipo(equipoCrudo).toLowerCase().replace(/\s+/g, '-');
  const hash = SGADD.Ruta.build({
    planilla: JUGADORES.planillaId, torneo: SGADD_APP.estado.torneo, fase: JUGADORES.fase,
    seccion: 'equipos', entidad: slug, tab: 'partidos', sub: idPartido,
  });
  history.pushState(null, '', hash);
  if (typeof navigate === 'function') navigate('equipos');
}

/* ===================== CARGA ===================== */

function buildJugadores() {
  SGADD_APP.inicializar();
  const r = jugadoresLeerRuta();
  /* Solo lo que trae LA RUTA pisa la decisión global. Con la copia de la
     sección, cambiar de categoría en el selector la revertía al repintar. */
  if (r && r.planilla) SGADD_APP.estado.planillaId = r.planilla;
  if (r && r.fase) SGADD_APP.estado.fase = r.fase;
  setTimeout(() => SGADD_APP.cargar(), 0);
  return `<section id="jugadoresRoot" class="space-y-5">${SGADD_APP.barra()}</section>`;
}

function jugadoresCartel(txt, tono) {
  const c = tono === 'error' ? 'text-red-400' : 'text-muted';
  return `<div class="card rounded-xl p-8 border border-hairline text-center ${c} text-sm">${escapeHtml(txt)}</div>`;
}

/* ===================== RENDER ===================== */

function jugadoresPintar() {
  const root = document.getElementById('jugadoresRoot');
  if (!root) return;
  const st = SGADD_APP.estado;

  const volver = JUGADORES.jugador ? `<button onclick="jugadoresVolver()"
      class="shrink-0 text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2.5 hover:bg-surface2 transition-colors">
      ← Todos</button>` : '';

  if (st.error) { root.innerHTML = SGADD_APP.barra({ extra: volver }) + SGADD_UI.aviso('No se pudo cargar', st.error, 'error'); return; }
  if (!st.idx) { root.innerHTML = SGADD_APP.barra({ extra: volver }) + SGADD_UI.cargando('Cargando la categoría…', (SGADD_APP.planillaActual() || {}).label); return; }

  const idx = st.idx;
  JUGADORES.planillaId = st.planillaId;
  JUGADORES.fase = st.fase;
  const j = JUGADORES.jugador ? jugadoresBuscar(idx, JUGADORES.jugador) : null;

  SGADD_CHARTS.limpiar();
  root.innerHTML = [
    SGADD_APP.barra({ extra: volver }),
    SGADD_APP.avisoMuestra(),
    j ? jugadoresFicha(idx, j) : jugadoresGrilla(idx),
  ].filter(Boolean).join('');
  SGADD_CHARTS.dibujarPendientes();
}

/* ---------- Grilla ---------- */

/* ---------- Landing: elegí un equipo + rankings de la liga ---------- */

function jugadoresVerRanking(id) {
  JUGADORES.rankingAbierto = id;
  /* Cada tabla arranca con su propio orden: un "ordenado por RD" heredado
     de Rebotes no significa nada en la tabla de triples. */
  JUGADORES.rankingOrdenPor = null;
  JUGADORES.rankingOrdenDir = 'desc';
  jugadoresPintar();
}

/** Click en una cabecera de métrica: ordena, y al repetir invierte. */
function jugadoresOrdenarRanking(clave) {
  if (JUGADORES.rankingOrdenPor === clave) {
    JUGADORES.rankingOrdenDir = (JUGADORES.rankingOrdenDir === 'desc') ? 'asc' : 'desc';
  } else {
    JUGADORES.rankingOrdenPor = clave;
    JUGADORES.rankingOrdenDir = 'desc';   // en básquet "más" es lo que se busca primero
  }
  jugadoresPintar();
}

/**
 * Click en un escudo: filtra EN ESTA MISMA SECCIÓN y muestra las cards del
 * plantel de ese club. NO navega a Equipos — que lo hiciera rompía el flujo
 * de trabajo: el DT entra a Jugadores para mirar jugadores, y terminaba en
 * otra pantalla. Volver a tocar el mismo escudo saca el filtro.
 */
function jugadoresElegirEquipo(clave) {
  JUGADORES.filtroEquipo = (JUGADORES.filtroEquipo === clave) ? null : clave;
  jugadoresPintar();
  if (JUGADORES.filtroEquipo) {
    const el = document.getElementById('jugadoresPlantel');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function jugadoresCambiarUmbral(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  JUGADORES.rankingMinManual = isFinite(n) ? n : null;
  jugadoresPintar();
}

function jugadoresPickerEquipos(idx) {
  const lista = idx.lista().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Elegí un equipo</h3>
      <p class="text-[11px] text-muted mb-4">
        Muestra el plantel del club acá mismo, ordenado por minutos. Volvé a tocarlo para quitar el filtro.
      </p>
      ${SGADD_UI.teamPicker(lista, { onClick: 'jugadoresElegirEquipo', seleccionado: JUGADORES.filtroEquipo })}
    </div>`;
}

function jugadoresTablaRanking(idx, r) {
  if (!r || !r.filas.length) {
    return `<p class="text-xs text-muted py-4">Ningún jugador llega al umbral de minutos.</p>`;
  }

  /* Cabeceras de métrica ordenables. La flecha marca por cuál se está
     ordenando y en qué sentido; el resto queda con un ⇅ tenue para que se
     note que también se pueden tocar. */
  const th = r.columnas.map(k => {
    const activa = (k === r.ordenPor);
    const flecha = activa ? (r.dir === 'asc' ? '▲' : '▼') : '⇅';
    return `<th class="py-1 px-2 text-center align-middle whitespace-nowrap cursor-pointer select-none
        hover:text-accent transition-colors ${activa ? 'text-accent' : ''}"
        onclick="jugadoresOrdenarRanking('${SGADD_UI.escJs(k)}')"
        title="Ordenar por ${SGADD_UI.esc(k)}"
        aria-sort="${activa ? (r.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
        ${SGADD_UI.atributosFila('Ordenar por ' + k)}>${SGADD_UI.esc(k)}
      <span class="${activa ? 'text-accent' : 'opacity-40'}">${flecha}</span></th>`;
  }).join('');

  const filas = r.filas.map(f => {
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(f.equipo) : null;
    const propio = SGADD.esEquipoPropio(f.claveEquipo);
    /* Anillo en el más cercano a la mediana del propio top, igual que en
       los rankings de equipos. La columna por la que se ordena va en
       blanco para que se lea de un vistazo cuál manda. */
    const celdas = r.columnas.map(k => {
      const v = f.celdas[k];
      const med = r.medianas[k];
      const esMediana = v !== null && med !== null && r.filas.length > 3 &&
        Math.abs(v - med) === Math.min.apply(null, r.filas.map(x =>
          x.celdas[k] === null ? Infinity : Math.abs(x.celdas[k] - med)));
      const destaca = (k === r.ordenPor);
      const base = k === '+/-' ? SGADD_UI.claseMasMenos(v) : 'text-ink';
      return `<td class="py-1.5 px-2 text-center align-middle font-mono text-xs whitespace-nowrap
        ${destaca ? 'text-white font-semibold' : base}${esMediana ? ' ring-1 ring-accent/50 rounded' : ''}"
        ${esMediana ? 'title="El más cercano a la mediana de este top"' : ''}
        >${SGADD_UI.esc(rankingTexto(k, v, r.modo))}</td>`;
    }).join('');

    const colorPuesto = f.puesto === 1 ? 'text-accent font-bold'
      : f.puesto <= 3 ? 'text-green-400 font-semibold'
        : f.puesto <= 10 ? 'text-ink' : 'text-muted';

    return `
      <tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 ${propio ? 'bg-accent/5' : ''}"
          onclick="jugadoresIrA('${SGADD_UI.escJs(f.slug)}')"
          ${SGADD_UI.atributosFila('Abrir la ficha de ' + f.jugador)}>
        <td class="py-1.5 pr-2 text-left align-middle font-mono text-xs ${colorPuesto}">${f.puesto}</td>
        <td class="py-1.5 pr-3 text-left align-middle">
          <div class="flex items-center gap-2 min-w-0">
            ${logo ? `<img src="${SGADD_UI.esc(logo)}" alt="" class="w-5 h-5 object-contain shrink-0">` : ''}
            <span class="text-xs truncate ${propio ? 'text-accent font-semibold' : 'text-white'}">${SGADD_UI.esc(f.jugador)}</span>
          </div>
        </td>
        <td class="py-1.5 px-2 text-center align-middle text-[11px] text-muted truncate max-w-[9rem]">${SGADD_UI.esc(f.equipo)}</td>
        ${celdas}
      </tr>`;
  }).join('');

  const dirTexto = r.dir === 'asc' ? 'de menor a mayor' : 'de mayor a menor';
  const reordenada = (r.ordenPor !== r.orden);

  return `
    <div class="scrollbox"><table class="w-full">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="py-1 pr-2 text-left">#</th>
        <th class="py-1 pr-3 text-left">Jugador</th>
        <th class="py-1 px-2 text-center">Equipo</th>${th}
      </tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      Top ${r.filas.length} de ${r.elegibles} jugadores con MIN ≥ ${r.umbral.toFixed(2).replace('.', ',')}
      ${r.modo === 'total' ? '<b>de promedio por partido</b>' : ''},
      seleccionados por <span class="font-mono">${SGADD_UI.esc(r.orden)}</span>.
      ${reordenada ? 'Mostrados por <span class="font-mono">' + SGADD_UI.esc(r.ordenPor) + '</span> ' + dirTexto + '.' : ''}
      Clic en una cabecera para reordenar, clic en una fila para abrir la ficha.
      El valor con anillo naranja es el más cercano a la mediana de este top.${r.nota ? '<br>' + SGADD_UI.esc(r.nota) : ''}
    </p>`;
}

/**
 * Cambia la escala de los rankings entre promedio y total.
 *
 * Y RESETEA el orden de columna a propósito: un "por RD descendente"
 * elegido sobre promedios no significa lo mismo sobre totales, y
 * arrastrarlo deja al DT mirando un cuadro que él no pidió. Es el mismo
 * criterio que ya se aplica al cambiar de pestaña de ranking.
 */
function jugadoresCambiarModoRanking(modo) {
  JUGADORES.rankingModo = (modo === 'total') ? 'total' : 'promedio';
  JUGADORES.rankingOrdenPor = null;
  JUGADORES.rankingOrdenDir = 'desc';
  jugadoresPintar();
}

/** El texto de una celda de ranking: en totales las cuentas van enteras. */
function rankingTexto(col, v, modo) {
  if (modo === 'total' && RANKING_ACUMULABLES.indexOf(col) >= 0 && typeof v === 'number') {
    return String(Math.round(v));
  }
  return SGADD.formatear(col, v);
}

function jugadoresBloqueRankings(idx) {
  /* La cobertura decide si el toggle se puede ofrecer: con el acumulado a
     medio calcular —Jujuy trae 17 filas para 260 jugadores— el botón
     prometería un cambio que no puede hacer. */
  const conAcum = (idx.liga.jugadores || []).filter(j => !!j.__acum).length;
  const hayAcum = idx.liga.jugadores.length > 0 &&
    conAcum >= Math.ceil(idx.liga.jugadores.length * 0.8);
  const modo = (hayAcum && JUGADORES.rankingModo === 'total') ? 'total' : 'promedio';
  const op = { ordenPor: JUGADORES.rankingOrdenPor, dir: JUGADORES.rankingOrdenDir, modo: modo };
  const r = jugadoresRanking(idx, JUGADORES.rankingAbierto, op) ||
            jugadoresRanking(idx, JUGADORES_RANKINGS[0].id, op);
  if (!r) return '';
  const tabs = JUGADORES_RANKINGS.map(g => ({ id: g.id, label: g.titulo }));
  const umbral = jugadoresUmbralRanking(idx);

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <div class="flex-1 min-w-[200px]">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Rankings de la liga · top ${JUGADORES_TOP_N}</h3>
          <p class="text-[11px] text-muted">
            Las mismas tablas de la hoja RANKINGS J, calculadas en vivo sobre ${idx.liga.jugadores.length} jugadores.
          </p>
        </div>
        ${hayAcum ? `
        <div>
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Escala</span>
          <div class="inline-flex rounded-md border border-hairline overflow-hidden" role="group"
               aria-label="Mostrar promedios por partido o totales de la fase">
            ${[['promedio', 'Promedios', 'Por partido'], ['total', 'Totales', 'De toda la fase']]
              .map(([id, txt, ayuda]) => `
              <button type="button" onclick="jugadoresCambiarModoRanking('${id}')"
                aria-pressed="${modo === id}" title="${ayuda}"
                class="px-3 py-2 text-[11px] font-semibold transition-colors duration-150
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset
                       ${modo === id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">${txt}</button>`).join('')}
          </div>
        </div>` : ''}
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Minutos mínimos</label>
          <input type="number" step="0.5" min="0" value="${umbral.toFixed(1)}"
            onchange="jugadoresCambiarUmbral(this.value)"
            class="w-24 bg-surface2 border border-hairline rounded-md px-3 py-2 text-xs focus:border-accent outline-none">
        </div>
      </div>
      ${SGADD_UI.tabs(tabs, r.id, 'jugadoresVerRanking')}
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-2">${SGADD_UI.esc(r.titulo)}</h4>
      ${jugadoresTablaRanking(idx, r)}
    </div>`;
}

/**
 * Landing de la sección: picker de escudos + rankings de la liga.
 *
 * La card "Plantel de la liga" se sacó en esta vuelta: repetía lo que ya
 * muestra el tab Plantel de Equipos, y con el picker de arriba llevando
 * directo ahí, tener las dos listas era pedirle al DT que eligiera entre
 * dos caminos al mismo lugar.
 */
/**
 * Plantel del equipo elegido. Aparece SOLO con un equipo seleccionado: sin
 * filtro no hay card (la lista completa de la liga se sacó en su momento
 * por redundante, ver CLAUDE.md).
 *
 * Orden estricto por MIN de mayor a menor: el que más juega es el que más
 * condiciona el partido, independientemente de cuánto anote.
 */
/**
 * Badge del estado de plantel (lesión, refuerzo, baja). Sale del buzón, no
 * de la planilla: sin el módulo cargado devuelve vacío y la card se pinta
 * exactamente como antes.
 *
 * ACTIVO no dibuja nada a propósito: si el 90% del plantel lleva un badge
 * verde, el badge deja de significar algo y solo agrega ruido a la card.
 */
/**
 * Lo que el buzón tiene PENDIENTE sobre este jugador, al lado suyo.
 *
 * Hasta acá el aviso vivía solo adentro del drawer: el DT tenía que
 * abrirlo para enterarse de que el pibe llevaba fechas sin entrar. Son
 * dos niveles y se ven distinto a propósito:
 *
 *   ⏳ aviso  (2-3 fechas) — informa. Casi nunca es una baja: un golpe,
 *                            un viaje, una fecha de sanción.
 *   🔔 alerta (4 o más)    — pide una decisión, y por eso lleva el color
 *                            de advertencia y manda al buzón.
 */
function jugadoresBadgePendiente(j) {
  if (typeof SGADD_BUZON === 'undefined' || !SGADD_BUZON.pendienteDe) return '';
  const a = SGADD_BUZON.pendienteDe(j['NOMBRES'], j['EQUIPO']);
  if (!a) return '';
  const aviso = (a.nivel === 'aviso');
  const clase = aviso ? 'text-muted border-hairline' : 'text-yellow-400 border-yellow-400/40';
  const texto = a.tipo === 'inactividad'
    ? (a.racha + ' fechas sin entrar')
    : (a.tipo === 'reingreso' ? 'volvió a jugar' : 'posible traspaso');
  return `<span class="text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded border ${clase}"
    title="${escapeAttr(a.detalle)}">${aviso ? '⏳' : '🔔'} ${escapeHtml(texto)}</span>`;
}

/**
 * Marcar el estado a mano, sin esperar al detector.
 *
 * El motor necesita cuatro fechas para sospechar; el DT sabe HOY que se
 * lesionó. Queda con `origen: "usuario"`, así que ningún escaneo
 * posterior lo pisa ni le vuelve a preguntar (punto 13).
 */
function jugadoresMarcarEstado(slug, idEstado) {
  const idx = SGADD_APP.estado.idx;
  const j = idx ? jugadoresBuscar(idx, slug) : null;
  if (!j || typeof SGADD_BUZON === 'undefined' || !SGADD_BUZON.marcar) return;
  SGADD_BUZON.marcar(j['NOMBRES'], j['EQUIPO'], idEstado);
  jugadoresPintar();
}

/** El control de estado de la ficha: los cuatro, el vigente resaltado. */
function jugadoresControlEstado(j, slug) {
  if (typeof SGADD_ESTADOS === 'undefined' || typeof SGADD_BUZON === 'undefined') return '';
  const actual = SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']);
  const botones = SGADD_ESTADOS.ESTADOS.map(e => {
    const vigente = actual && actual.id === e.id;
    return `<button type="button" onclick="jugadoresMarcarEstado('${SGADD_UI.escJs(slug)}', '${SGADD_UI.escJs(e.id)}')"
      title="${escapeAttr(e.descripcion)}" ${vigente ? 'aria-current="true"' : ''}
      class="text-[10px] font-display uppercase tracking-wider px-2 py-1 rounded border transition-colors
             ${vigente ? e.color + ' ' + e.borde + ' bg-surface2' : 'text-muted border-hairline hover:bg-surface2'}">
      ${e.emoji} ${escapeHtml(e.label)}</button>`;
  }).join('');
  return `
    <div class="mt-3 pt-3 border-t border-hairline" data-no-print>
      <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1.5">Estado del jugador</p>
      <div class="flex flex-wrap gap-1.5">${botones}</div>
      <p class="text-[10px] dato-sec leading-snug mt-1.5">
        Lo que marques acá manda sobre el detector automático y queda guardado en este navegador.
      </p>
    </div>`;
}

/**
 * El aviso en la CARD del plantel: una línea corta, sin borde.
 *
 * Es el mismo dato que el badge de la ficha pero acá compite con el
 * nombre, los badges del ADN y cuatro KPIs, así que va como texto y no
 * como pastilla. Si el jugador ya tiene un estado confirmado no se
 * repite: el estado manda sobre la sospecha.
 */
function jugadoresLineaPendiente(j) {
  if (typeof SGADD_BUZON === 'undefined' || !SGADD_BUZON.pendienteDe) return '';
  const est = SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']);
  if (est && est.id !== 'ACTIVO') return '';
  const a = SGADD_BUZON.pendienteDe(j['NOMBRES'], j['EQUIPO']);
  if (!a || a.tipo !== 'inactividad') return '';
  const clase = a.nivel === 'aviso' ? 'text-muted' : 'text-yellow-400';
  return `<p class="text-[9px] mt-0.5 ${clase} truncate" title="${escapeAttr(a.detalle)}">
    ${a.nivel === 'aviso' ? '⏳' : '🔔'} ${a.racha} fechas sin entrar</p>`;
}

function jugadoresBadgeEstado(j) {
  if (typeof SGADD_BUZON === 'undefined') return '';
  const est = SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']);
  if (!est || est.id === 'ACTIVO') return '';
  const nota = est.descripcion + (est.origen === 'usuario' ? ' · confirmado por el cuerpo técnico' : '');
  return `<p class="text-[9px] mt-0.5 ${est.color} truncate" title="${escapeAttr(nota)}">${est.emoji} ${escapeHtml(est.label)}</p>`;
}

function jugadoresPlantelEquipo(idx) {
  const clave = JUGADORES.filtroEquipo;
  if (!clave) return '';
  const e = idx.get(clave);
  const lista = (idx.liga.jugadoresPorEquipo.get(clave) || [])
    .slice()
    .sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0));

  if (!lista.length) {
    return `<div id="jugadoresPlantel" class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <p class="text-xs text-muted">Este equipo no tiene jugadores cargados en la fase activa.</p></div>`;
  }

  const cards = lista.map(j => {
    const adn = jugadoresADN(idx, j);
    const slug = jugadoresSlug(j);
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(j['EQUIPO']) : null;
    const rolMin = adn.rolMinutos;

    /* Badges del ADN compartido: los mismos que muestra la ficha y el
       informe de Scouting. Se recortan a tres para que la card no se
       convierta en un párrafo. */
    const badges = jugadoresBadges(adn).slice(0, 3).map(b => {
      /* Sin respaldo va en gris: el mismo tratamiento que la barra de
         percentil de una muestra pobre. El `~` lo dice sin depender del
         color, que es la regla del punto 14. */
      const color = b.sinRespaldo ? 'text-muted border-hairline'
        : b.tipo === 'jerarquia' ? 'text-accent border-accent/40'
          : b.tipo === 'rol' ? 'text-blue-400 border-blue-400/30'
            : 'text-green-400 border-green-400/30';
      return `<span class="text-[9px] leading-tight px-1.5 py-0.5 rounded-full border ${color} whitespace-nowrap"
        ${b.motivo ? `title="${escapeAttr(b.motivo)}"` : ''}>${escapeHtml(b.texto)}</span>`;
    }).join('');

    const kpi = (k) => `<span class="whitespace-nowrap"><span class="dato-sec">${escapeHtml(k)}</span> <span class="${k === '+/-' ? SGADD_UI.claseMasMenos(j[k]) : ''}">${escapeHtml(SGADD.formatear(k, j[k]))}</span></span>`;
    /* El +/- solo aparece si la planilla lo trae: sumar un "—" fijo a cada
       card de las planillas viejas es ruido, no información. */
    const kpiMasMenos = typeof j['+/-'] === 'number' ? kpi('+/-') : '';

    return `
      <button type="button" onclick="jugadoresIrA('${SGADD_UI.escJs(slug)}')"
        class="flex flex-col gap-2 p-3 rounded-lg border border-hairline hover:border-accent hover:bg-surface2 transition-all duration-200 text-left min-w-0">
        <div class="flex items-center gap-2 min-w-0">
          ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-8 h-8 object-contain shrink-0">` : ''}
          <div class="min-w-0 flex-1">
            <p class="text-xs text-white font-medium truncate">${escapeHtml(j['NOMBRES'])}</p>
            ${rolMin ? `<p class="text-[10px] ${rolMin.color} truncate" title="${escapeAttr(rolMin.rol)}">${escapeHtml(rolMin.label)}</p>` : ''}
            ${jugadoresBadgeEstado(j)}
            ${jugadoresLineaPendiente(j)}
          </div>
        </div>
        ${badges ? `<div class="flex flex-wrap gap-1">${badges}</div>` : ''}
        <div class="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-ink border-t border-hairline/40 pt-1.5">
          ${kpi('MIN')} ${kpi('PLAYS')} ${kpi('PTS')} ${kpi('eFG%')} ${kpiMasMenos}
        </div>
      </button>`;
  }).join('');

  return `
    <div id="jugadoresPlantel" class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">
          Plantel · ${escapeHtml(e ? e.nombre : clave)}
        </h3>
        <!-- Con el picker escondido este boton es el UNICO camino de vuelta,
             asi que dice a donde lleva y no que hace por dentro. -->
        <button type="button" onclick="jugadoresElegirEquipo('${SGADD_UI.escJs(clave)}')"
          class="text-[11px] text-muted hover:text-accent border border-hairline hover:border-accent rounded px-2.5 py-1 transition-colors">
          ← Elegir otro equipo
        </button>
      </div>
      <p class="text-[11px] text-muted mb-4">
        ${lista.length} jugador${lista.length === 1 ? '' : 'es'}, ordenados por minutos de mayor a menor.
        Clic en una card para abrir el perfil 360°.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">${cards}</div>
    </div>`;
}

/**
 * El landing de Jugadores tiene DOS estados, no uno con cosas encima.
 *
 *   sin equipo   → el picker y el top 20 de la liga.
 *   con equipo   → el plantel de ese club, y nada más.
 *
 * Antes se apilaba todo: el picker seguía ocupando media pantalla
 * después de elegir, y el top 20 de la liga quedaba debajo del plantel
 * contestando una pregunta que el DT ya no está haciendo. Elegir un
 * equipo es entrar a otra vista, no agregarle una card a la anterior.
 *
 * El camino de vuelta es el botón de la card del plantel, que saca el
 * filtro: sin él, esconder el picker dejaría al DT encerrado.
 */
function jugadoresGrilla(idx) {
  const conEquipo = !!JUGADORES.filtroEquipo;
  return [
    conEquipo ? '' : jugadoresPickerEquipos(idx),
    jugadoresPlantelEquipo(idx),
    conEquipo ? '' : jugadoresBloqueRankings(idx),
  ].filter(Boolean).join('');
}

/* ---------- Ficha ---------- */

function jugadoresFicha(idx, j) {
  const tabs = JUGADORES_TABS.map(t => ({ id: t.id, label: t.label, disponible: jugadoresTabDisponible(idx, j, t.id) }));
  const actual = JUGADORES_TABS.find(t => t.id === JUGADORES.tab) || JUGADORES_TABS[0];
  return [
    jugadoresHeader(idx, j),
    `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
       ${SGADD_UI.tabs(tabs, JUGADORES.tab, 'jugadoresVerTab')}
       <p class="text-[11px] text-muted mb-4 -mt-2">${escapeHtml(actual.pregunta)}</p>
       ${jugadoresTab(idx, j, JUGADORES.tab)}
     </div>`,
  ].join('');
}

function jugadoresTabDisponible(idx, j, id) {
  if (id === 'evolucion' || id === 'partidos') {
    const n = (idx.liga.jugadorPartidos.get(j.__clave) || []).length;
    return id === 'evolucion' ? n >= 3 : n >= 1;
  }
  return true;
}

function jugadoresHeader(idx, j) {
  const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(j['EQUIPO']) : null;
  const rolMin = jugadoresRolMinutos(j['MIN']);
  const jerarquia = jugadoresJerarquia(idx, j);
  const stat = idx.statJugador(j.__clave, 'PTS');

  const hero = ['PTS', 'MIN', 'eFG%', 'USG%'].map(k => SGADD_UI.statCard(jugadoresLeer(idx, j, k))).join('');

  const badgeRol = rolMin ? `
    <span class="text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded border ${rolMin.color} border-current/40">
      ${escapeHtml(rolMin.label)} · ${escapeHtml(rolMin.rol)}
    </span>` : '';

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-center gap-4 mb-3">
        ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-14 h-14 object-contain shrink-0">` : ''}
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-white truncate">${escapeHtml(j['NOMBRES'])}</h2>
          <p class="text-xs text-muted font-mono">
            ${escapeHtml(SGADD.limpiarNombre(j['EQUIPO']))} · ${jerarquia.emoji} ${escapeHtml(jerarquia.label)}
            ${stat ? ' · consistencia en PTS: ' + stat.media.toFixed(1) + ' ± ' + stat.desvio.toFixed(1) + ' (' + stat.n + ' PJ)' : ''}
          </p>
        </div>
        <button onclick="SGADD_FICHA.abrir()" data-no-print
          class="shrink-0 text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2.5
                 hover:border-accent hover:bg-surface2 transition-all duration-200" style="color:#fff">
          📄 Ficha en PDF
        </button>
      </div>
      <div class="mb-4 flex items-center gap-2 flex-wrap">
        ${badgeRol}
        ${(() => {
          /* En la FICHA el estado sí se muestra completo, con la fecha de
             corte: acá hay lugar y es el dato que explica por qué sus
             promedios se cortaron en la fecha 8. */
          if (typeof SGADD_BUZON === 'undefined') return '';
          const est = SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']);
          if (!est || est.id === 'ACTIVO') return '';
          return `<span class="text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded border ${est.borde} ${est.color}"
            title="${escapeAttr(est.descripcion)}">${est.emoji} ${escapeHtml(est.label)}${est.desde ? ' · desde ' + escapeHtml(est.desde) : ''}</span>`;
        })()}
        ${jugadoresBadgePendiente(j)}
        ${rolMin && rolMin.urgente ? `<span class="text-[10px] text-yellow-400">⚠ menos de 10 min de promedio: muestra muy chica</span>` : ''}
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${hero}</div>
      ${jugadoresControlEstado(j, jugadoresSlug(j))}
    </div>`;
}

/* ---------- Tabs ---------- */

function jugadoresTab(idx, j, id) {
  switch (id) {
    case 'general':   return jugadoresTabGeneral(idx, j);
    case 'tiro':      return jugadoresTabTiro(idx, j);
    case 'evolucion': return jugadoresTabEvolucion(idx, j);
    case 'partidos':  return jugadoresTabPartidos(idx, j);
    default:          return '';
  }
}

/* ---------- ADN del jugador: render de arquetipos + jerarquía ---------- */

function jugadoresBadgeNivel(nivel) {
  const cls = (nivel === 'Alto' || nivel === 'Alta') ? 'text-green-400 border-green-400/40 bg-green-400/5'
    : (nivel === 'Medio' || nivel === 'Media') ? 'text-accent border-accent/40 bg-accent/5'
    : 'text-muted border-hairline bg-surface2/30';
  return `<span class="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${cls}">${escapeHtml(nivel)}</span>`;
}

function jugadoresTarjetaSintesis(bloque) {
  return `
    <div class="rounded-lg border border-hairline bg-surface2/30 p-4">
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <p class="text-[10px] uppercase tracking-widest text-muted font-display">${escapeHtml(bloque.titulo)}</p>
        ${jugadoresBadgeNivel(bloque.nivel)}
      </div>
      ${bloque.detalle ? `<p class="text-xs font-mono text-ink mb-1.5">${escapeHtml(bloque.detalle)}</p>` : ''}
      <p class="text-[11px] text-muted leading-snug">${escapeHtml(bloque.texto)}</p>
    </div>`;
}

function jugadoresBloqueADN(sintesis) {
  /* Una etiqueta RELATIVA sobre un jugador que no califica se muestra igual
     —la regla es no esconder el dato— pero con `~` y en gris, como el
     percentil de una muestra pobre. P-7 de la auditoría. */
  const flojo = () => !sintesis.califica;
  const nota = () => flojo() ? ' · ' + JUGADORES_MOTIVO_SIN_RESPALDO : '';

  const arqs = sintesis.arquetipos.length
    ? sintesis.arquetipos.map(a => `
        <span class="inline-flex items-center gap-1 text-[11px] ${flojo() ? 'text-muted' : ''} bg-surface2/60 border border-hairline rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
              title="${escapeAttr(a.detalle + nota())}">
          ${flojo() ? '~ ' : ''}${a.emoji} ${escapeHtml(a.label)}
        </span>`).join('')
    : `<p class="text-xs text-muted">Ningún perfil técnico se destaca lo suficiente todavía.</p>`;

  return `
    <div class="rounded-lg border border-accent/40 bg-accent/5 p-4 mb-5">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-1">ADN del jugador</p>
      <h4 class="font-display text-lg sm:text-xl uppercase tracking-wide ${flojo() ? 'text-muted' : 'text-ink'} leading-tight"
          title="${escapeAttr(sintesis.jerarquia.descripcion + nota())}">
        ${flojo() ? '~ ' : ''}${sintesis.jerarquia.emoji} ${escapeHtml(sintesis.jerarquia.label)}
      </h4>
      <p class="text-xs text-muted mt-1 mb-3 leading-snug">${escapeHtml(sintesis.jerarquia.descripcion)}</p>
      ${flojo()
        ? `<p class="text-[10px] text-yellow-400 mb-3 leading-snug">~ ${escapeHtml(JUGADORES_MOTIVO_SIN_RESPALDO)}</p>` : ''}
      <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1.5">Perfiles técnicos</p>
      <div>${arqs}</div>
    </div>`;
}

/** Tarjeta comparativa Local vs. Visitante, con el badge de sensibilidad. */
function jugadoresBloqueCondicion(idx, j) {
  const split = jugadoresSplitCondicion(idx, j);
  if (!split.suficiente) {
    return SGADD_UI.aviso('Local vs. Visitante',
      'Hacen falta al menos ' + MIN_PJ_CONDICION + ' partidos de local y ' + MIN_PJ_CONDICION + ' de visitante para comparar. ' +
      'Lleva ' + split.local.pj + ' de local y ' + split.visitante.pj + ' de visitante.');
  }

  const filas = CLAVES_CONDICION.map(k => {
    const l = split.local[k], v = split.visitante[k];
    const dif = (l !== null && v !== null) ? l - v : null;
    const m = SGADD.metrica(k);
    const mejorLocal = dif === null ? null : (m.invertida ? dif < 0 : dif > 0);
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs">${escapeHtml(m.label)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, l))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, v))}</td>
      <td class="py-1.5 font-mono text-xs ${dif === null ? 'text-muted' : mejorLocal ? 'text-green-400' : 'text-red-400'}">
        ${dif === null ? '—' : (dif > 0 ? '+' : '') + escapeHtml(SGADD.formatear(k, dif))}
      </td>
    </tr>`;
  }).join('');

  const sens = split.sensibilidad;
  const colorBadge = sens.nivel === 'estable' ? 'text-muted border-hairline bg-surface2/30'
    : sens.nivel === 'local' ? 'text-green-400 border-green-400/40 bg-green-400/5'
    : 'text-accent border-accent/40 bg-accent/5';
  const etiquetaBadge = sens.nivel === 'estable' ? 'Rendimiento estable'
    : sens.nivel === 'local' ? 'Sensible: mejor de Local' : 'Sensible: mejor de Visitante';

  return `
    <div class="rounded-lg border border-hairline bg-surface2/30 p-4 mb-6">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent">Local vs. Visitante</h5>
        <span class="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${colorBadge}">${escapeHtml(etiquetaBadge)}</span>
      </div>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="pb-1 pr-3">Métrica</th><th class="pb-1 pr-3">Local (${split.local.pj})</th>
          <th class="pb-1 pr-3">Visitante (${split.visitante.pj})</th><th class="pb-1">Dif</th>
        </tr></thead><tbody>${filas}</tbody></table></div>
      <p class="text-[11px] text-muted mt-3 leading-snug">${escapeHtml(sens.texto)}</p>
    </div>`;
}

function jugadoresTabGeneral(idx, j) {
  const sintesis = jugadoresSintesisPerfil(idx, j);
  const conclusionBloque = {
    nivel: sintesis.conclusion.nivel, titulo: sintesis.conclusion.titulo,
    detalle: sintesis.puntoDeFuga ? sintesis.puntoDeFuga.label : null,
    texto: sintesis.conclusion.texto,
  };

  const cards = ['TS%', 'AST-PP', 'RT', 'PePP%'].map(k => SGADD_UI.statCard(jugadoresLeer(idx, j, k))).join('');

  const vistaOtras = {
    label: 'Otras estadísticas', descriptiva: false,
    filas: ['AST', 'PR', 'PP', 'TC', 'TR'].map(k => idx.leerJugador(j, k)).filter(Boolean),
  };
  /* `+/-` entra a la tabla solo si la planilla lo trae (MotorStats v30+).
     Con las planillas viejas la fila saldría con "—" en valor y percentil:
     una fila muerta permanente en la vista principal del jugador. */
  const clavesMarcador = ['PTS', 'PLAYS', 'MIN'];
  if (typeof j['+/-'] === 'number') clavesMarcador.push('+/-');
  const vistaMarcador = {
    label: 'Marcador y contexto', descriptiva: false,
    filas: clavesMarcador.map(k => idx.leerJugador(j, k)).filter(Boolean),
  };

  return `
    ${jugadoresBloqueADN(sintesis)}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      ${jugadoresTarjetaSintesis(sintesis.impacto)}
      ${jugadoresTarjetaSintesis(sintesis.eficiencia)}
      ${jugadoresTarjetaSintesis(conclusionBloque)}
    </div>
    ${jugadoresBloqueCondicion(idx, j)}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">${cards}</div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${SGADD_UI.metricTable(vistaMarcador)}
      ${SGADD_UI.metricTable(vistaOtras)}
    </div>
    <p class="text-[11px] text-muted mt-4 leading-snug">
      Percentiles contra el resto de la liga que llega al umbral de minutos.
      ${j.__califica ? '' : 'Este jugador está debajo de ese umbral: sus datos se muestran, pero sin percentil, para no mentir con poca muestra.'}
    </p>`;
}

/* ---------- Tab Tiro ---------- */

const ZONAS_TIRO = [
  { id: 'T3', label: 'Triple',     peso: 'PT3%', conv: 'T3%', ppp: 'PPT3', c: 'T3C', i: 'T3I' },
  { id: 'T2', label: 'Doble',      peso: 'PT2%', conv: 'T2%', ppp: 'PPT2', c: 'T2C', i: 'T2I' },
  { id: 'T1', label: 'Tiro libre', peso: 'PT1%', conv: 'T1%', ppp: 'PPT1', c: 'T1C', i: 'T1I' },
];

function jugadoresTabTiro(idx, j) {
  const filas = ZONAS_TIRO.map(z => {
    const peso = idx.leerJugador(j, z.peso);
    const conv = idx.leerJugador(j, z.conv);
    const ppp = idx.leerJugador(j, z.ppp);
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs text-white font-medium">${escapeHtml(z.label)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${peso ? escapeHtml(peso.formateado) : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${conv ? escapeHtml(conv.formateado) : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${ppp ? escapeHtml(ppp.formateado) : '—'}</td>
      <td class="py-1.5 font-mono text-xs text-muted">${escapeHtml(SGADD.formatear(z.c, j[z.c]))}/${escapeHtml(SGADD.formatear(z.i, j[z.i]))}</td>
    </tr>`;
  }).join('');

  const valorDe = k => { const r = idx.leerJugador(j, k); return r && r.valor !== null ? r.valor : 0; };
  const tipoDe = k => { const r = idx.leerJugador(j, k); return r && r.tipo !== null ? r.tipo : 0; };
  const etiquetas = ZONAS_TIRO.map(z => z.label);
  const volEq = ZONAS_TIRO.map(z => valorDe(z.i));
  const volLg = ZONAS_TIRO.map(z => tipoDe(z.i));
  const cvEq = ZONAS_TIRO.map(z => valorDe(z.conv));
  const cvLg = ZONAS_TIRO.map(z => tipoDe(z.conv));

  return `
    <div class="mb-6">
      <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Distribución del tiro por zona</h5>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="pb-1 pr-3">Zona</th><th class="pb-1 pr-3">Peso relativo</th><th class="pb-1 pr-3">CONV%</th>
          <th class="pb-1 pr-3">PPP</th><th class="pb-1">C/I</th>
        </tr></thead><tbody>${filas}</tbody></table></div>
      <p class="text-[11px] text-muted mt-2 leading-snug">
        Peso relativo = qué porción de sus plays terminan en esa zona. PPP = puntos por intento en esa zona
        (no por convertido). C/I son promedios por partido, no acumulado de temporada.
      </p>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${equiposPanel('Volumen por zona · intentos por partido',
        SGADD_CHARTS.barrasComparadas('chTiroVol', etiquetas, volEq, volLg, { nombreEquipo: j['NOMBRES'] }))}
      ${equiposPanel('Acierto por zona · CONV%',
        SGADD_CHARTS.barrasComparadas('chTiroConv', etiquetas, cvEq, cvLg, { nombreEquipo: j['NOMBRES'], formato: 'T2%' }))}
    </div>`;
}

function jugadoresElegirMetricaEvolucion(id) {
  JUGADORES.metricaEvolucion = id;
  jugadoresPintar();
}

function jugadoresTabEvolucion(idx, j) {
  const metricaId = JUGADORES_METRICAS_EVOLUCION.some(m => m.id === JUGADORES.metricaEvolucion)
    ? JUGADORES.metricaEvolucion : 'PTS';
  const metricaLbl = JUGADORES_METRICAS_EVOLUCION.find(m => m.id === metricaId).label;

  /* `.no-imprimir` en el CONTENEDOR y no solo en el <select>: la regla
     general de `@media print` esconde todo control de formulario, y sin
     esto la etiqueta "MÉTRICA" quedaba huérfana flotando en la hoja —el
     mismo defecto que tuvieron los selectores de scouting—. La métrica
     elegida ya viaja en el título del gráfico. */
  const selector = `
    <div class="flex items-center gap-2 mb-3 no-imprimir">
      <label class="text-[10px] uppercase tracking-wider text-muted font-display">Métrica</label>
      <select onchange="jugadoresElegirMetricaEvolucion(this.value)"
        class="bg-surface2 border border-hairline rounded-md px-3 py-1.5 text-xs focus:border-accent outline-none">
        ${JUGADORES_METRICAS_EVOLUCION.map(m => `<option value="${escapeAttr(m.id)}" ${m.id === metricaId ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
      </select>
    </div>`;

  return selector + jugadoresBloqueEvolucion(idx, j, metricaId, 'chEvolJugador');
}

/**
 * UN gráfico de evolución, para UNA métrica.
 *
 * Se separó del tab porque la ficha en PDF exporta VARIAS métricas —el DT
 * elige cuáles— y cada una necesita su propio canvas. El tab sigue siendo
 * el mismo bloque con el selector arriba: si el gráfico cambia, cambia en
 * los dos lados.
 */
function jugadoresBloqueEvolucion(idx, j, metricaId, idCanvas) {
  const def = JUGADORES_METRICAS_EVOLUCION.find(m => m.id === metricaId);
  const metricaLbl = def ? def.label : metricaId;
  const partidos = jugadoresPartidosOrdenados(idx, j.__clave);
  const stat = idx.statJugador(j.__clave, metricaId);
  if (!stat) {
    return SGADD_UI.aviso('Todavía no hay suficientes partidos',
      'Hacen falta al menos 3 partidos con box score para calcular una banda de consistencia en ' + metricaLbl.toLowerCase() + '.');
  }

  const atipicos = partidos.map(p => {
    const z = jugadoresZScore(p[metricaId], stat.media, stat.desvio);
    return (z !== null && Math.abs(z) >= SGADD_PARTIDO.Z_ATIPICO) ? (z > 0 ? 1 : -1) : null;
  });
  // Fecha + rival + condición (L/V) en el tooltip: "14/10/2025 - vs X (L)".
  const etiquetas = partidos.map(jugadoresEtiquetaEvolucion);
  /* Cada punto lleva el ESCUDO del rival de esa noche. En pantalla el rival
     salía en el tooltip, pero en papel no hay hover: el escudo es lo único
     que dice contra quién fue ese pico sin agregar una tabla al lado. */
  const rivales = partidos.map(jugadoresRival);
  /* Los convertidos sobre intentos de ESA noche, para que el tooltip
     ponga el porcentaje en contexto (B-3 del backlog). */
  const convInt = partidos.map(p => jugadoresConvIntento(metricaId, p));

  return `
    <div class="mb-2">
      ${equiposPanel(metricaLbl + ' por partido · banda de ±1 desvío',
        SGADD_CHARTS.evolucionJugador(idCanvas, partidos, metricaId,
          { media: stat.media, desvio: stat.desvio, atipicos: atipicos, label: metricaLbl,
            etiquetas: etiquetas, rivales: rivales, convInt: convInt }),
        `<p class="text-[11px] text-muted mt-3 leading-snug">
           Media ${escapeHtml(SGADD.formatear(metricaId, stat.media))} · desvío ${escapeHtml(SGADD.formatear(metricaId, stat.desvio))}
           sobre ${stat.n} partidos con box score. Cada punto es el escudo del rival de esa noche.
           Los resaltados están a más de ${SGADD_PARTIDO.Z_ATIPICO} desvíos de su propio promedio: ni el umbral
           ni el desvío son fijos, se recalculan solos a medida que juega más partidos.
         </p>`)}
    </div>`;
}

/* El tiro de una zona como "3/8". Sin intentos va "—" y no "0/0": un
   cero sobre cero se lee como un fracaso y es una zona que no usó. */
function tiroDe(p, zona) {
  const c = p[zona + 'C'], i = p[zona + 'I'];
  if (typeof i !== 'number' || i <= 0) return '—';
  return SGADD.num(c || 0) + '/' + SGADD.num(i);
}

function jugadoresTabPartidos(idx, j) {
  const stat = idx.statJugador(j.__clave, 'PTS');
  const partidos = jugadoresPartidosOrdenados(idx, j.__clave).slice().reverse();

  const filas = partidos.map(p => {
    const gano = SGADD.texto(p['RESULTADO']).toUpperCase() === 'GANADO';
    const flojo = (typeof p['MIN'] !== 'number') || p['MIN'] < SGADD_PARTIDO.MIN_MINUTOS;
    const z = jugadoresZScore(p['PTS'], stat && stat.media, stat && stat.desvio);
    const atipico = !flojo && z !== null && Math.abs(z) >= SGADD_PARTIDO.Z_ATIPICO;
    const colorPts = atipico ? (z > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium') : 'text-white';

    return `<tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 transition-all duration-200 ${flojo ? 'opacity-50' : ''}"
                onclick="jugadoresVerPartido('${SGADD_UI.escJs(p['EQUIPO'] || '')}', '${SGADD_UI.escJs(jugadoresIdCanonico(idx, p) || '')}')"
                title="Ver el detalle de este partido en Equipos"
                ${SGADD_UI.atributosFila('Ver el detalle del partido contra ' + jugadoresRival(p))}>
      <td class="py-1.5 pr-3 text-xs dato-sec font-mono whitespace-nowrap">${escapeHtml(SGADD.formatearFecha(p.__fecha))}</td>
      <td class="py-1.5 pr-3 text-xs text-white truncate max-w-[200px]">${escapeHtml(jugadoresRival(p))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(SGADD.formatear('MIN', p['MIN']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs ${colorPts}">${escapeHtml(SGADD.formatear('PTS', p['PTS']))}</td>
      ${['T2', 'T3', 'T1'].map(z => `<td class="py-1.5 pr-3 font-mono text-xs dato-sec whitespace-nowrap">${
        escapeHtml(tiroDe(p, z))}</td>`).join('')}
      <td class="py-1.5 pr-3 font-mono text-xs ${SGADD_UI.claseMasMenos(p['+/-'])}">${escapeHtml(SGADD.formatear('+/-', p['+/-']))}</td>
      <td class="py-1.5 text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Fecha</th><th class="pb-1 pr-3">Rival</th><th class="pb-1 pr-3">Cond.</th>
        <th class="pb-1 pr-3">MIN</th><th class="pb-1 pr-3">PTS</th>
        <th class="pb-1 pr-3" title="Convertidos sobre intentos">T2 C/I</th>
        <th class="pb-1 pr-3" title="Convertidos sobre intentos">T3 C/I</th>
        <th class="pb-1 pr-3" title="Convertidos sobre intentos">T1 C/I</th>
        <th class="pb-1 pr-3">+/-</th><th class="pb-1"></th>
      </tr></thead>
      <tbody>${filas || '<tr><td class="text-xs text-muted py-2" colspan="10">Sin partidos con box score.</td></tr>'}</tbody>
    </table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      En verde o rojo, los partidos a más de ${SGADD_PARTIDO.Z_ATIPICO} desvíos de su propio promedio de puntos.
      Los atenuados jugaron menos de ${SGADD_PARTIDO.MIN_MINUTOS} minutos. Clic en cualquier fila para ver el
      detalle completo de ese partido (box score de los dos equipos) en Equipos.
      <b>C/I</b> son convertidos sobre intentos de esa noche: un 100% con un intento y otro con seis
      no son lo mismo, y el porcentaje solo no lo dice.
      <b>+/-</b> es la diferencia de puntos con él en cancha: no es el margen del partido, que es del equipo.
    </p>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    JUGADORES_TABS, JUGADORES_METRICAS_EVOLUCION, ROLES_MINUTOS, PERFILES_TECNICOS, JERARQUIA, ZONAS_TIRO,
    JUGADORES_RANKINGS, JUGADORES_TOP_N, jugadoresRanking, jugadoresUmbralRanking, RANKING_ACUMULABLES,
    JUGADORES_UMBRALES, JUGADORES_ROLES_FUNCIONALES,
    jugadoresPerfilBase, jugadoresRolFuncional, jugadoresADN, jugadoresBadges,
    JUGADORES_METRICAS_EVOLUCION,
    JUGADORES_MOTIVO_SIN_RESPALDO,
    CLAVES_CONDICION, MIN_PJ_CONDICION, SENSIBILIDAD_CONDICION,
    jugadoresSlug, jugadoresBuscar, jugadoresZScore,
    jugadoresPartidosOrdenados, jugadoresRival, jugadoresIdCanonico,
    jugadoresRolMinutos, jugadoresPromedioMetrica, jugadoresPromediosLiga, jugadoresRT,
    jugadoresConvIntento,
    jugadoresReferenciasRebote, jugadoresMediana, MIN_CALIFICADOS_REFERENCIA,
    jugadoresArquetipos, jugadoresJerarquia, jugadoresPuntoDeFuga, jugadoresSintesisPerfil,
    jugadoresCondicionCorta, jugadoresEtiquetaEvolucion, jugadoresSplitCondicion, jugadoresSensibilidadCondicion,
  };
}
