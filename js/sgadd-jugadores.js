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

   Tabs de esta primera entrega: General, Evolución, Partidos. Tiro, Rol y
   Comparar quedan para la próxima vuelta.
   ===================================================================== */

const JUGADORES = {
  planillaId: null,
  fase: 'REGULAR',
  jugador: null,        // slug del jugador abierto
  tab: 'general',
  filtroEquipo: null,   // clave de equipo para la grilla, o null = toda la liga
  soloCalifican: true,
};

const JUGADORES_TABS = [
  { id: 'general',   label: 'General',   pregunta: '¿Qué tipo de jugador es?' },
  { id: 'evolucion', label: 'Evolución', pregunta: '¿Está mejorando?' },
  { id: 'partidos',  label: 'Partidos',  pregunta: '¿Qué hizo cada noche?' },
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

/** Badge de rol, a partir del percentil de minutos entre los que califican.
    No es el motor de arquetipo individual (eso queda para más adelante):
    es una lectura rápida de cuánto lo usan. */
function jugadoresRol(idx, j) {
  if (!j.__califica) return { label: 'Pocos min.', color: 'text-yellow-400' };
  const cal = (idx.liga.jugadoresCalificados || []).map(x => x['MIN']).filter(v => typeof v === 'number');
  const p = (typeof j['MIN'] === 'number') ? SGADD.percentil(cal, j['MIN'], false) : null;
  if (p === null) return { label: 'Rotación', color: 'text-muted' };
  if (p >= 75) return { label: 'Titular', color: 'text-accent' };
  if (p >= 35) return { label: 'Rotación', color: 'text-muted' };
  return { label: 'Suplente', color: 'text-muted' };
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
    const rol = jugadoresRol(idx, j);
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
          <span class="text-[10px] font-display uppercase tracking-wide shrink-0 ${rol.color}">${rol.label}</span>
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
  const rol = jugadoresRol(idx, j);
  const stat = idx.statJugador(j.__clave, 'PTS');

  const hero = ['PTS', 'MIN', 'eFG%', 'USG%'].map(k => SGADD_UI.statCard(jugadoresLeer(idx, j, k))).join('');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-center gap-4 mb-5">
        ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-14 h-14 object-contain shrink-0">` : ''}
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-white truncate">${escapeHtml(j['NOMBRES'])}</h2>
          <p class="text-xs text-muted font-mono">
            ${escapeHtml(SGADD.limpiarNombre(j['EQUIPO']))} · <span class="${rol.color}">${rol.label}</span>
            ${stat ? ' · consistencia en PTS: ' + stat.media.toFixed(1) + ' ± ' + stat.desvio.toFixed(1) + ' (' + stat.n + ' PJ)' : ''}
          </p>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${hero}</div>
    </div>`;
}

/* ---------- Tabs ---------- */

function jugadoresTab(idx, j, id) {
  switch (id) {
    case 'general':   return jugadoresTabGeneral(idx, j);
    case 'evolucion': return jugadoresTabEvolucion(idx, j);
    case 'partidos':  return jugadoresTabPartidos(idx, j);
    default:          return '';
  }
}

function jugadoresTabGeneral(idx, j) {
  const cards = ['TS%', 'AST-PP', 'RT', 'PePP%'].map(k => SGADD_UI.statCard(jugadoresLeer(idx, j, k))).join('');

  const vistaTiro = {
    label: 'Tiro', descriptiva: false,
    filas: ['T2%', 'T3%', 'T1%', 'PPT2', 'PPT3', 'PPT1'].map(k => idx.leerJugador(j, k)).filter(Boolean),
  };
  const vistaOtras = {
    label: 'Otras estadísticas', descriptiva: false,
    filas: ['AST', 'PR', 'PP', 'TC', 'TR'].map(k => idx.leerJugador(j, k)).filter(Boolean),
  };

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">${cards}</div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${SGADD_UI.metricTable(vistaTiro)}
      ${SGADD_UI.metricTable(vistaOtras)}
    </div>
    <p class="text-[11px] text-muted mt-4 leading-snug">
      Percentiles contra el resto de la liga que llega al umbral de minutos.
      ${j.__califica ? '' : 'Este jugador está debajo de ese umbral: sus datos se muestran, pero sin percentil, para no mentir con poca muestra.'}
    </p>`;
}

function jugadoresTabEvolucion(idx, j) {
  const partidos = jugadoresPartidosOrdenados(idx, j.__clave);
  const stat = idx.statJugador(j.__clave, 'PTS');
  if (!stat) {
    return SGADD_UI.aviso('Todavía no hay suficientes partidos',
      'Hacen falta al menos 3 partidos con box score para calcular una banda de consistencia.');
  }

  const atipicos = partidos.map(p => {
    const z = jugadoresZScore(p['PTS'], stat.media, stat.desvio);
    return (z !== null && Math.abs(z) >= SGADD_PARTIDO.Z_ATIPICO) ? (z > 0 ? 1 : -1) : null;
  });

  return `
    <div class="mb-2">
      ${equiposPanel('Puntos por partido · banda de ±1 desvío',
        SGADD_CHARTS.evolucionJugador('chEvolJugador', partidos, 'PTS', { media: stat.media, desvio: stat.desvio, atipicos: atipicos }),
        `<p class="text-[11px] text-muted mt-3 leading-snug">
           Media ${stat.media.toFixed(1)} · desvío ${stat.desvio.toFixed(1)} sobre ${stat.n} partidos con box score.
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
    JUGADORES_TABS,
    jugadoresSlug, jugadoresBuscar, jugadoresRol, jugadoresZScore,
    jugadoresPartidosOrdenados, jugadoresRival, jugadoresIdCanonico,
  };
}
