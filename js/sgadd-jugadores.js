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
  filtroEquipo: null,   // clave de equipo para la grilla, o null = toda la liga
  soloCalifican: true,
  metricaEvolucion: 'PTS',
};

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

function jugadoresFiltrarEquipo(clave) {
  JUGADORES.filtroEquipo = clave || null;
  jugadoresPintar();
}

function jugadoresToggleCalifican(checked) {
  JUGADORES.soloCalifican = !!checked;
  jugadoresPintar();
}

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

function jugadoresGrilla(idx) {
  const equipos = idx.lista().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const base = JUGADORES.filtroEquipo
    ? (idx.liga.jugadoresPorEquipo.get(JUGADORES.filtroEquipo) || [])
    : (idx.liga.jugadores || []);
  const lista = base
    .filter(j => !JUGADORES.soloCalifican || j.__califica)
    .slice()
    .sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0));

  const opciones = equipos.map(e =>
    `<option value="${escapeAttr(e.clave)}" ${JUGADORES.filtroEquipo === e.clave ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`
  ).join('');

  const cards = lista.map(j => {
    const rolMin = jugadoresRolMinutos(j['MIN']);
    const slug = jugadoresSlug(j);
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(j['EQUIPO']) : null;
    return `
      <button type="button" onclick="jugadoresIrA('${escapeAttr(slug)}')"
        class="flex flex-col gap-1.5 p-3 rounded-lg border border-hairline hover:border-accent hover:bg-surface2 transition-all duration-200 text-left">
        <div class="flex items-center gap-2 min-w-0">
          ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-6 h-6 object-contain shrink-0">` : ''}
          <span class="text-xs text-white font-medium truncate">${escapeHtml(j['NOMBRES'])}</span>
        </div>
        <p class="text-[10px] text-muted truncate">${escapeHtml(SGADD.limpiarNombre(j['EQUIPO']))}</p>
        <div class="flex items-center justify-between mt-1 gap-1">
          <span class="font-mono text-[11px] text-ink whitespace-nowrap">${escapeHtml(SGADD.formatear('MIN', j['MIN']))} min · ${escapeHtml(SGADD.formatear('PTS', j['PTS']))} pts</span>
          ${rolMin ? `<span class="text-[10px] font-display uppercase tracking-wide shrink-0 ${rolMin.color}" title="${escapeAttr(rolMin.rol)}">${escapeHtml(rolMin.corto)}</span>` : ''}
        </div>
      </button>`;
  }).join('') || `<p class="text-xs text-muted p-4">Ningún jugador coincide con el filtro.</p>`;

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div class="flex-1 min-w-[180px]">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Plantel de la liga</h3>
          <p class="text-[11px] text-muted">${lista.length} jugador${lista.length === 1 ? '' : 'es'}. Ordenados por minutos.</p>
        </div>
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Equipo</label>
          <select onchange="jugadoresFiltrarEquipo(this.value)"
            class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-xs focus:border-accent outline-none">
            <option value="">Todos</option>
            ${opciones}
          </select>
        </div>
        <label class="flex items-center gap-2 text-xs text-muted cursor-pointer pb-2">
          <input type="checkbox" onchange="jugadoresToggleCalifican(this.checked)" ${JUGADORES.soloCalifican ? 'checked' : ''}>
          Solo los que califican
        </label>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">${cards}</div>
      <p class="text-[11px] text-muted mt-3 leading-snug">
        Umbral de minutos de la liga: MIN ≥ ${idx.liga.minJugador !== null ? idx.liga.minJugador.toFixed(2) : '—'}.
        Los que no llegan se muestran igual (con "Solo los que califican" destildado), pero sin percentil.
      </p>
    </div>`;
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

  return `
    ${selector}
    <div class="mb-2">
      ${equiposPanel(metricaLbl + ' por partido · banda de ±1 desvío',
        SGADD_CHARTS.evolucionJugador('chEvolJugador', partidos, metricaId, { media: stat.media, desvio: stat.desvio, atipicos: atipicos, label: metricaLbl }),
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
    jugadoresSlug, jugadoresBuscar, jugadoresZScore,
    jugadoresPartidosOrdenados, jugadoresRival, jugadoresIdCanonico,
    jugadoresRolMinutos, jugadoresPromedioMetrica, jugadoresPromediosLiga, jugadoresRT,
    jugadoresArquetipos, jugadoresJerarquia, jugadoresPuntoDeFuga, jugadoresSintesisPerfil,
  };
}
