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
  metricaEvolucion: 'PTS',
  rankingAbierto: 'produccion',
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
  { id: 'produccion', titulo: 'Participación y puntos', orden: 'PTS',
    cols: ['PJ', 'MIN', 'PTS', 'PLAYS', 'PPP'] },
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
     no pueda pasar que la tabla ordene por una cosa y muestre otra. */
  const valor = (j, k) => (k === 'RT') ? jugadoresRT(j)
    : (typeof j[k] === 'number' && isFinite(j[k])) ? j[k] : null;

  const elegibles = (idx.liga.jugadores || []).filter(j => {
    const m = valor(j, 'MIN');
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
    id: g.id, titulo: g.titulo, orden: g.orden, nota: g.nota || null,
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
const JUGADORES_METRICAS_EVOLUCION = [
  { id: 'PTS',    label: 'Puntos' },
  { id: 'MIN',    label: 'Minutos' },
  { id: 'PLAYS',  label: 'Plays' },
  { id: 'eFG%',   label: 'eFG%' },
  { id: 'TS%',    label: 'True Shooting' },
  { id: 'USG%',   label: 'Uso' },
  { id: 'RTL%',   label: 'Ratio de libres' },
  { id: 'T2%',    label: 'T2%' },
  { id: 'T3%',    label: 'T3%' },
  { id: 'T1%',    label: 'T1%' },
  { id: 'AST-PP', label: 'Ast. por pérdida' },
  { id: 'RO',     label: 'Rebotes ofensivos' },
  { id: 'RD',     label: 'Rebotes defensivos' },
  { id: 'RT',     label: 'Rebotes totales' },
];

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
const ROLES_MINUTOS = [
  { id: 'clave', min: 26, label: 'Jugador Clave', corto: 'Clave',
    rol: 'Dependencia Absoluta', color: 'text-accent' },
  { id: 'importante', min: 23, label: 'Jugador Importante', corto: 'Importante',
    rol: 'Consistencia Estructural', color: 'text-green-400' },
  { id: 'rotacion', min: 13, label: 'Jugador de Rotación', corto: 'Rotación',
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

/* Perfiles técnicos: no son excluyentes, un jugador puede calzar en más
   de uno (por ejemplo, un tirador que además rebotea bien). */
const PERFILES_TECNICOS = [
  {
    id: 'terminador', emoji: '🎯', label: 'Terminador de Élite',
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
    id: 'puntal', emoji: '🏰', label: 'Puntal en la Pintura',
    calza: (j, prom) => prom.RT !== null && jugadoresRT(j) > 1.20 * prom.RT,
    detalle: 'Domina el vidrio muy por encima del promedio de la liga, en ataque y en defensa.',
  },
  {
    id: 'amenaza', emoji: '🎯', label: 'Amenaza Perimetral Real',
    calza: (j) => j['T3I'] > 3.0 && j['T3%'] > 0.34,
    detalle: 'Volumen y acierto de triple genuinos: hay que salir a buscarlo afuera.',
  },
  {
    id: 'especialistaDef', emoji: '🧤', label: 'Especialista Defensivo',
    calza: (j, prom) => prom.PR !== null && j['PR'] > 1.30 * prom.PR,
    detalle: 'Roba muchas más pelotas que el resto de la liga: genera posesiones extra.',
  },
  {
    id: 'buscadorContacto', emoji: '📏', label: 'Buscador de Contacto',
    calza: (j) => j['PT1%'] > 0.25 && j['T1%'] > 0.80,
    detalle: 'Buena parte de sus plays terminan en la línea, y ahí adentro no falla.',
  },
];

/** Perfiles técnicos que calza un jugador. Puede devolver varios o ninguno. */
function jugadoresArquetipos(idx, j) {
  const prom = jugadoresPromediosLiga(idx);
  return PERFILES_TECNICOS
    .filter(p => { try { return !!p.calza(j, prom); } catch (e) { return false; } })
    .map(p => ({ id: p.id, emoji: p.emoji, label: p.label, detalle: p.detalle }));
}

/* Jerarquía dentro del plantel: ACÁ SÍ son excluyentes entre sí, se evalúa
   en cascada y gana el primero que calce (de más a menos exigente). */
const JERARQUIA = [
  {
    id: 'franquicia', emoji: '⭐', label: 'Jugador Franquicia',
    calza: (j, prom) => prom.PLAYS !== null && j['PLAYS'] > 1.20 * prom.PLAYS &&
      typeof j['MIN'] === 'number' && j['MIN'] > 28,
    descripcion: 'Líder absoluto del plantel: el equipo pasa por sus manos y por sus minutos.',
  },
  {
    id: 'referente', emoji: '⚔️', label: 'Referente Ofensivo / Segunda Espada',
    calza: (j, prom) => prom.PLAYS !== null && j['PLAYS'] > prom.PLAYS,
    descripcion: 'Alto volumen de decisiones: carga una parte grande del ataque.',
  },
  {
    id: 'quinteto', emoji: '🧱', label: 'Pieza de Quinteto Titular',
    calza: (j) => typeof j['MIN'] === 'number' && j['MIN'] >= 23,
    descripcion: 'Presencia extendida en cancha con un aporte estable, sin ser el foco del ataque.',
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
  return { id: nivel.id, emoji: nivel.emoji, label: nivel.label, descripcion: nivel.descripcion };
}

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

  return { rolMinutos, arquetipos, jerarquia, impacto, eficiencia, puntoDeFuga: fuga, conclusion };
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
 * El id de partido de UNA fila de jugador puede no coincidir con el que usa
 * Equipos: si Base Datos J trae la FECHA vacía para ese partido pero Base
 * Datos E no, idPartido() da un "sf_..." de un lado y una fecha real del
 * otro. Para no romper el link cruzado, se resuelve el id CANÓNICO buscando
 * el mismo PARTIDO (por texto, no por fecha) en los partidos del equipo:
 * ese es el mismo cómputo que ya usa idx.partidosPorId.
 */
function jugadoresIdCanonico(idx, p) {
  const e = idx.get(p['EQUIPO']);
  if (!e) return p.__id || null;
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
  if (r.seccion !== 'jugadores') return false;
  if (r.planilla) JUGADORES.planillaId = r.planilla;
  if (r.fase) JUGADORES.fase = r.fase;
  JUGADORES.jugador = r.entidad || null;
  JUGADORES.tab = r.tab || 'general';
  return true;
}

function jugadoresEscribirRuta(reemplazar) {
  const h = SGADD.Ruta.build({
    planilla: JUGADORES.planillaId,
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
    planilla: JUGADORES.planillaId, fase: JUGADORES.fase,
    seccion: 'equipos', entidad: slug, tab: 'partidos', sub: idPartido,
  });
  history.pushState(null, '', hash);
  if (typeof navigate === 'function') navigate('equipos');
}

/* ===================== CARGA ===================== */

function buildJugadores() {
  SGADD_APP.inicializar();
  jugadoresLeerRuta();
  if (JUGADORES.planillaId) SGADD_APP.estado.planillaId = JUGADORES.planillaId;
  if (JUGADORES.fase) SGADD_APP.estado.fase = JUGADORES.fase;
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
  if (!st.idx) { root.innerHTML = SGADD_APP.barra({ extra: volver }) + jugadoresCartel('Cargando la categoría…'); return; }

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
 * Click en un escudo: abre el plantel del club en la sección Equipos.
 * No se duplica acá esa vista — Equipos ya tiene el tab "Plantel" con la
 * grilla y los links a cada ficha. Antes esto filtraba una card "Plantel
 * de la liga" que se sacó en esta vuelta.
 */
function jugadoresElegirEquipo(clave) {
  if (typeof equiposIrA !== 'function') return;
  if (typeof EQUIPOS !== 'undefined') EQUIPOS.tab = 'plantel';
  if (typeof navigate === 'function') navigate('equipos');
  equiposIrA(clave);
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
        Abre el plantel completo del club, con la ficha de cada jugador.
      </p>
      ${SGADD_UI.teamPicker(lista, { onClick: 'jugadoresElegirEquipo' })}
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
        onclick="jugadoresOrdenarRanking('${SGADD_UI.esc(k)}')"
        title="Ordenar por ${SGADD_UI.esc(k)}">${SGADD_UI.esc(k)}
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
      return `<td class="py-1.5 px-2 text-center align-middle font-mono text-xs whitespace-nowrap
        ${destaca ? 'text-white font-semibold' : 'text-ink'}${esMediana ? ' ring-1 ring-accent/50 rounded' : ''}"
        ${esMediana ? 'title="El más cercano a la mediana de este top"' : ''}
        >${SGADD_UI.esc(SGADD.formatear(k, v))}</td>`;
    }).join('');

    const colorPuesto = f.puesto === 1 ? 'text-accent font-bold'
      : f.puesto <= 3 ? 'text-green-400 font-semibold'
        : f.puesto <= 10 ? 'text-ink' : 'text-muted';

    return `
      <tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 ${propio ? 'bg-accent/5' : ''}"
          onclick="jugadoresIrA('${SGADD_UI.esc(f.slug)}')">
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
      Top ${r.filas.length} de ${r.elegibles} jugadores con MIN ≥ ${r.umbral.toFixed(2).replace('.', ',')},
      seleccionados por <span class="font-mono">${SGADD_UI.esc(r.orden)}</span>.
      ${reordenada ? 'Mostrados por <span class="font-mono">' + SGADD_UI.esc(r.ordenPor) + '</span> ' + dirTexto + '.' : ''}
      Clic en una cabecera para reordenar, clic en una fila para abrir la ficha.
      El valor con anillo naranja es el más cercano a la mediana de este top.${r.nota ? '<br>' + SGADD_UI.esc(r.nota) : ''}
    </p>`;
}

function jugadoresBloqueRankings(idx) {
  const op = { ordenPor: JUGADORES.rankingOrdenPor, dir: JUGADORES.rankingOrdenDir };
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
function jugadoresGrilla(idx) {
  return [
    jugadoresPickerEquipos(idx),
    jugadoresBloqueRankings(idx),
  ].join('');
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
      </div>
      <div class="mb-4 flex items-center gap-2 flex-wrap">
        ${badgeRol}
        ${rolMin && rolMin.urgente ? `<span class="text-[10px] text-yellow-400">⚠ menos de 10 min de promedio: muestra muy chica</span>` : ''}
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${hero}</div>
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

function jugadoresADN(sintesis) {
  const arqs = sintesis.arquetipos.length
    ? sintesis.arquetipos.map(a => `
        <span class="inline-flex items-center gap-1 text-[11px] bg-surface2/60 border border-hairline rounded-full px-2.5 py-1 mr-1.5 mb-1.5"
              title="${escapeAttr(a.detalle)}">
          ${a.emoji} ${escapeHtml(a.label)}
        </span>`).join('')
    : `<p class="text-xs text-muted">Ningún perfil técnico se destaca lo suficiente todavía.</p>`;

  return `
    <div class="rounded-lg border border-accent/40 bg-accent/5 p-4 mb-5">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-1">ADN del jugador</p>
      <h4 class="font-display text-lg sm:text-xl uppercase tracking-wide text-ink leading-tight">
        ${sintesis.jerarquia.emoji} ${escapeHtml(sintesis.jerarquia.label)}
      </h4>
      <p class="text-xs text-muted mt-1 mb-3 leading-snug">${escapeHtml(sintesis.jerarquia.descripcion)}</p>
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
  const vistaMarcador = {
    label: 'Marcador y contexto', descriptiva: false,
    filas: ['PTS', 'PLAYS', 'MIN'].map(k => idx.leerJugador(j, k)).filter(Boolean),
  };

  return `
    ${jugadoresADN(sintesis)}
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

  const selector = `
    <div class="flex items-center gap-2 mb-3">
      <label class="text-[10px] uppercase tracking-wider text-muted font-display">Métrica</label>
      <select onchange="jugadoresElegirMetricaEvolucion(this.value)"
        class="bg-surface2 border border-hairline rounded-md px-3 py-1.5 text-xs focus:border-accent outline-none">
        ${JUGADORES_METRICAS_EVOLUCION.map(m => `<option value="${escapeAttr(m.id)}" ${m.id === metricaId ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
      </select>
    </div>`;

  const partidos = jugadoresPartidosOrdenados(idx, j.__clave);
  const stat = idx.statJugador(j.__clave, metricaId);
  if (!stat) {
    return selector + SGADD_UI.aviso('Todavía no hay suficientes partidos',
      'Hacen falta al menos 3 partidos con box score para calcular una banda de consistencia en ' + metricaLbl.toLowerCase() + '.');
  }

  const atipicos = partidos.map(p => {
    const z = jugadoresZScore(p[metricaId], stat.media, stat.desvio);
    return (z !== null && Math.abs(z) >= SGADD_PARTIDO.Z_ATIPICO) ? (z > 0 ? 1 : -1) : null;
  });
  // Fecha + rival + condición (L/V) en el tooltip: "14/10/2025 - vs X (L)".
  const etiquetas = partidos.map(jugadoresEtiquetaEvolucion);

  return `
    ${selector}
    <div class="mb-2">
      ${equiposPanel(metricaLbl + ' por partido · banda de ±1 desvío',
        SGADD_CHARTS.evolucionJugador('chEvolJugador', partidos, metricaId, { media: stat.media, desvio: stat.desvio, atipicos: atipicos, label: metricaLbl, etiquetas: etiquetas }),
        `<p class="text-[11px] text-muted mt-3 leading-snug">
           Media ${escapeHtml(SGADD.formatear(metricaId, stat.media))} · desvío ${escapeHtml(SGADD.formatear(metricaId, stat.desvio))}
           sobre ${stat.n} partidos con box score.
           Los puntos resaltados están a más de ${SGADD_PARTIDO.Z_ATIPICO} desvíos de su propio promedio: ni el umbral
           ni el desvío son fijos, se recalculan solos a medida que juega más partidos.
         </p>`)}
    </div>`;
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
                onclick="jugadoresVerPartido('${escapeAttr(p['EQUIPO'] || '')}', '${escapeAttr(jugadoresIdCanonico(idx, p) || '')}')"
                title="Ver el detalle de este partido en Equipos">
      <td class="py-1.5 pr-3 text-xs dato-sec font-mono whitespace-nowrap">${escapeHtml(SGADD.formatearFecha(p.__fecha))}</td>
      <td class="py-1.5 pr-3 text-xs text-white truncate max-w-[200px]">${escapeHtml(jugadoresRival(p))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(SGADD.formatear('MIN', p['MIN']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs ${colorPts}">${escapeHtml(SGADD.formatear('PTS', p['PTS']))}</td>
      <td class="py-1.5 text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Fecha</th><th class="pb-1 pr-3">Rival</th><th class="pb-1 pr-3">Cond.</th>
        <th class="pb-1 pr-3">MIN</th><th class="pb-1 pr-3">PTS</th><th class="pb-1"></th>
      </tr></thead>
      <tbody>${filas || '<tr><td class="text-xs text-muted py-2" colspan="6">Sin partidos con box score.</td></tr>'}</tbody>
    </table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      En verde o rojo, los partidos a más de ${SGADD_PARTIDO.Z_ATIPICO} desvíos de su propio promedio de puntos.
      Los atenuados jugaron menos de ${SGADD_PARTIDO.MIN_MINUTOS} minutos. Clic en cualquier fila para ver el
      detalle completo de ese partido (box score de los dos equipos) en Equipos.
    </p>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    JUGADORES_TABS, JUGADORES_METRICAS_EVOLUCION, ROLES_MINUTOS, PERFILES_TECNICOS, JERARQUIA, ZONAS_TIRO,
    JUGADORES_RANKINGS, JUGADORES_TOP_N, jugadoresRanking, jugadoresUmbralRanking,
    CLAVES_CONDICION, MIN_PJ_CONDICION, SENSIBILIDAD_CONDICION,
    jugadoresSlug, jugadoresBuscar, jugadoresZScore,
    jugadoresPartidosOrdenados, jugadoresRival, jugadoresIdCanonico,
    jugadoresRolMinutos, jugadoresPromedioMetrica, jugadoresPromediosLiga, jugadoresRT,
    jugadoresArquetipos, jugadoresJerarquia, jugadoresPuntoDeFuga, jugadoresSintesisPerfil,
    jugadoresCondicionCorta, jugadoresEtiquetaEvolucion, jugadoresSplitCondicion, jugadoresSensibilidadCondicion,
  };
}
