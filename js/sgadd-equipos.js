/* =====================================================================
   SGADD · Sección EQUIPOS

   Ruta:  #/<planilla>/<fase>/equipos/<equipo>/<tab>
   Ej:    #/primera-clausura-2026/REGULAR/equipos/reconquista-a/4factores

   Estructura:
     sin equipo  → grilla de escudos
     con equipo  → header + KPI hero + tabs de drill-down

   Regla: un tab, una pregunta. Si una métrica no ayuda a responder la
   pregunta del tab, no va.
   ===================================================================== */

const EQUIPOS = {
  planillaId: null,
  fase: 'REGULAR',
  equipo: null,
  tab: 'general',
  partido: null,
  idx: null,
  hojas: null,
  cargando: false,
  error: null,
};

const EQUIPOS_TABS = [
  { id: 'general',      label: 'General',      pregunta: '¿Cómo viene?' },
  { id: 'ofensiva',     label: 'Ofensiva',     pregunta: '¿Cómo anota?' },
  { id: 'defensiva',    label: 'Defensiva',    pregunta: '¿Cómo defiende?' },
  { id: '4factores',    label: '4 Factores',   pregunta: '¿Dónde gana y dónde pierde?' },
  { id: 'condicion',    label: 'Local/Vis.',   pregunta: '¿Cambia de local?' },
  { id: 'personalidad', label: 'Personalidad', pregunta: '¿A qué juega?' },
  { id: 'plantel',      label: 'Plantel',      pregunta: '¿De quién depende?' },
  { id: 'partidos',     label: 'Partidos',     pregunta: '¿Qué pasó cada noche?' },
];

/* ===================== RUTEO ===================== */

function equiposLeerRuta() {
  const r = SGADD.Ruta.parse(window.location.hash);
  if (r.seccion !== 'equipos') return false;
  if (r.planilla) EQUIPOS.planillaId = r.planilla;
  if (r.fase) EQUIPOS.fase = r.fase;
  SGADD_APP.aplicarTorneoRuta(r.torneo);
  EQUIPOS.equipo = r.entidad || null;
  EQUIPOS.tab = r.tab || 'general';
  EQUIPOS.partido = r.sub || null;   // id del partido abierto, si hay
  return true;
}

function equiposEscribirRuta(reemplazar) {
  const h = SGADD.Ruta.build({
    planilla: EQUIPOS.planillaId,
    torneo: SGADD_APP.estado.torneo,
    fase: EQUIPOS.fase,
    seccion: 'equipos',
    entidad: EQUIPOS.equipo,
    tab: EQUIPOS.equipo ? EQUIPOS.tab : null,
    sub: EQUIPOS.partido || null,
  });
  // replaceState para no llenar el historial con cada cambio de tab.
  if (reemplazar) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
}

function equiposIrA(clave) {
  EQUIPOS.equipo = clave ? SGADD.claveEquipo(clave).toLowerCase().replace(/\s+/g, '-') : null;
  equiposEscribirRuta(false);
  equiposPintar();
}

/** Abre el detalle de un partido dentro del tab Partidos. */
function equiposVerPartido(id) {
  EQUIPOS.tab = 'partidos';
  EQUIPOS.partido = id;
  equiposEscribirRuta(false);
  equiposPintar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function equiposCerrarPartido() {
  EQUIPOS.partido = null;
  equiposEscribirRuta(false);
  equiposPintar();
}

function equiposVerTab(id) {
  EQUIPOS.tab = id;
  EQUIPOS.partido = null;   // cambiar de tab cierra el detalle
  equiposEscribirRuta(true);
  equiposPintar();
}

function equiposVolver() { equiposIrA(null); }


/* ===================== CARGA ===================== */

function buildEquipos() {
  SGADD_APP.inicializar();
  equiposLeerRuta();
  // La categoría es una decisión global: si la ruta trae una, manda.
  if (EQUIPOS.planillaId) SGADD_APP.estado.planillaId = EQUIPOS.planillaId;
  if (EQUIPOS.fase) SGADD_APP.estado.fase = EQUIPOS.fase;
  setTimeout(() => SGADD_APP.cargar(), 0);
  return `<section id="equiposRoot" class="space-y-5">${SGADD_APP.barra()}</section>`;
}

function equiposCartel(txt, tono) {
  const c = tono === 'error' ? 'text-red-400' : 'text-muted';
  return `<div class="card rounded-xl p-8 border border-hairline text-center ${c} text-sm">${escapeHtml(txt)}</div>`;
}

/* ===================== RENDER ===================== */

function equiposPintar() {
  const root = document.getElementById('equiposRoot');
  if (!root) return;
  const st = SGADD_APP.estado;

  const volver = EQUIPOS.equipo ? `<button onclick="equiposVolver()"
      class="shrink-0 text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2.5 hover:bg-surface2 transition-colors">
      ← Todos</button>` : '';

  if (st.error) { root.innerHTML = SGADD_APP.barra({ extra: volver }) + SGADD_UI.aviso('No se pudo cargar', st.error, 'error'); return; }
  if (!st.idx) { root.innerHTML = SGADD_APP.barra({ extra: volver }) + equiposCartel('Cargando la categoría…'); return; }

  const idx = st.idx;
  EQUIPOS.planillaId = st.planillaId;
  EQUIPOS.fase = st.fase;
  const e = EQUIPOS.equipo ? idx.get(EQUIPOS.equipo.replace(/-/g, ' ')) : null;

  SGADD_CHARTS.limpiar();
  root.innerHTML = [
    SGADD_APP.barra({ extra: volver }),
    SGADD_APP.avisoMuestra(),
    e ? equiposFicha(idx, e) : equiposGrilla(idx),
  ].filter(Boolean).join('');
  SGADD_CHARTS.dibujarPendientes();
}

/** Panel con título, gráfico y su lectura. */
function equiposPanel(titulo, cuerpo, narrativa) {
  return `<div>
    <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">${escapeHtml(titulo)}</h5>
    ${cuerpo}${narrativa || ''}
  </div>`;
}

/** Serie de una métrica: [valor del equipo, mediana de la liga]. */
function equiposSerie(idx, e, claves) {
  const eq = [], lg = [];
  claves.forEach(k => {
    const r = idx.leer(e.clave, k);
    eq.push(r && r.valor !== null ? r.valor : 0);
    lg.push(r && r.tipo !== null ? r.tipo : 0);
  });
  return { eq, lg };
}

function equiposGrilla(idx) {
  /* Alfabético, igual que el picker de Jugadores: el escudo es un buscador,
     no un ranking. Para saber quién anda mejor está la tabla de rankings
     que va justo abajo, con el rating neto y el puesto de cada uno. */
  const lista = idx.lista().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Elegí un equipo</h3>
      <p class="text-[11px] text-muted mb-4">Por orden alfabético. El tuyo va en naranja.</p>
      ${SGADD_UI.teamPicker(lista, { onClick: 'equiposIrA', seleccionado: EQUIPOS.equipo })}
    </div>
    ${SGADD_RANKINGS.render(idx)}`;
}

/* ---------- Ficha ---------- */

function equiposFicha(idx, e) {
  const tabs = EQUIPOS_TABS.map(t => ({ id: t.id, label: t.label, disponible: equiposTabDisponible(idx, e, t.id) }));
  const actual = EQUIPOS_TABS.find(t => t.id === EQUIPOS.tab) || EQUIPOS_TABS[0];
  return [
    equiposHeader(idx, e),
    `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
       ${SGADD_UI.tabs(tabs, EQUIPOS.tab, 'equiposVerTab')}
       <p class="text-[11px] text-muted mb-4 -mt-2">${escapeHtml(actual.pregunta)}</p>
       ${equiposTab(idx, e, EQUIPOS.tab)}
     </div>`,
  ].join('');
}

function equiposTabDisponible(idx, e, id) {
  if (id === 'plantel') return e.jugadores && e.jugadores.length > 0;
  if (id === 'partidos' || id === 'condicion') return e.partidos && e.partidos.length > 0;
  return true;
}

function equiposHeader(idx, e) {
  const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(e.nombre) : null;
  const rk = idx.ranking(e.clave, 'NET RTNG');
  const rec = e.record || { ganados: 0, perdidos: 0 };
  const racha = e.racha
    ? (e.racha.tipo === 'GANADO' ? e.racha.n + ' ganados al hilo' : e.racha.n + ' perdidos al hilo')
    : '—';

  const hero = ['NET RTNG', 'RTNG OFF', 'RTNG DEF', 'eFG%']
    .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-center gap-4 mb-5">
        ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-16 h-16 object-contain shrink-0">` : ''}
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-white truncate">${escapeHtml(e.nombre)}</h2>
          <p class="text-xs text-muted font-mono">
            ${rec.ganados}-${rec.perdidos} · ${racha}${rk ? ' · ' + rk.puesto + '° de ' + rk.de + ' en rating neto' : ''}
          </p>
        </div>
        <button onclick="SGADD_INFORME.abrir()" data-no-print
          class="shrink-0 text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2.5
                 hover:border-accent hover:bg-surface2 transition-all duration-200" style="color:#fff">
          📄 Generar informe PDF
        </button>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${hero}</div>
    </div>`;
}

/* Tarjeta de un factor fuerte o débil. */
function equiposClave(f, bueno) {
  const borde = bueno ? 'border-green-400' : 'border-red-400';
  return `
    <div class="bg-surface2/50 rounded-lg p-2.5 mb-2 border-l-2 ${borde}
                hover:bg-surface2 hover:border-l-4 transition-all duration-200">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs text-white">${escapeHtml(f.label)}</span>
        <span class="font-mono text-xs text-white">${escapeHtml(f.formateado)}</span>
      </div>
      <p class="text-[10px] text-muted font-mono mt-0.5">pctil ${f.percentil.toFixed(0)} · liga ${escapeHtml(f.tipoFormateado)}</p>
    </div>`;
}

/* ---------------------------------------------------------------------
   INSIGHT · el patrón de las victorias
   --------------------------------------------------------------------- */
function equiposInsight(ins) {
  if (!ins) return '';

  if (!ins.suficiente) {
    return `
      <div class="mt-6 rounded-lg border border-hairline bg-surface2/30 p-4">
        <p class="text-[10px] uppercase tracking-widest text-muted font-display mb-1">📌 Patrón de las victorias</p>
        <p class="text-xs dato-sec leading-snug">
          ${escapeHtml(ins.motivo || ('Hacen falta al menos ' + SGADD_PERSONALIDAD.PJ_MINIMO_INSIGHT +
            ' partidos ganados y ' + SGADD_PERSONALIDAD.PJ_MINIMO_INSIGHT + ' perdidos para comparar. Van ' +
            ins.g.pj + '-' + ins.d.pj + '.'))}
        </p>
      </div>`;
  }

  /* TABLA CURADA: solo lo que realmente cambia, hasta 5 filas. Las estables
     no van a la tabla — van a una línea de texto abajo. Mezclarlas hacía que
     lo importante se perdiera entre ruido. */
  const relevantes = ins.cambian.slice(0, 5);
  const filas = relevantes.map(f => {
    const flecha = f.aFavor ? '▲' : '▼';
    const color = f.aFavor ? 'text-green-400' : 'text-red-400';
    const barra = Math.min(100, (f.magnitud / (relevantes[0].magnitud || 1)) * 100);
    return `
      <tr class="border-b border-hairline/40 last:border-0">
        <td class="py-2 pr-3 text-xs text-white font-medium">${escapeHtml(f.label)}</td>
        <td class="py-2 pr-3 font-mono text-xs text-white">${escapeHtml(SGADD.formatear('eFG%', f.victoria))}</td>
        <td class="py-2 pr-3 font-mono text-xs dato-sec">${escapeHtml(SGADD.formatear('eFG%', f.derrota))}</td>
        <td class="py-2">
          <div class="flex items-center gap-2 justify-center">
            <div class="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden">
              <div class="h-full rounded-full ${f.aFavor ? 'bg-green-400' : 'bg-red-400'}"
                   style="width:${barra.toFixed(0)}%"></div>
            </div>
            <span class="font-mono text-xs ${color} font-medium">${flecha} ${escapeHtml(SGADD.formatear('eFG%', f.magnitud))}</span>
          </div>
        </td>
      </tr>`;
  }).join('');

  const estables = ins.estables.slice(0, 4).map(f => f.label).join(', ');
  const notaEstables = estables
    ? `<p class="text-[11px] dato-sec mt-3 leading-snug">
         Se mantienen constantes gane o pierda: <span class="text-white">${escapeHtml(estables)}</span>.
         Eso también informa: el problema de las derrotas no pasa por ahí.
       </p>` : '';

  /* RECOMENDACIÓN: las dos lecturas opuestas del mismo perfil. */
  const rec = ins.recomendacion;
  const bloqueRec = !rec ? '' : `
    <div class="mt-5 pt-4 border-t border-hairline">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-3">💡 Recomendación estratégica</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="rounded-lg border border-green-400/40 bg-green-400/5 p-3
                    hover:border-green-400 hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-green-400 font-display mb-1.5">Para explotarle</p>
          ${rec.explotar.map(t => `<p class="text-xs text-white leading-relaxed mb-1.5 last:mb-0">${escapeHtml(t)}</p>`).join('')}
        </div>
        <div class="rounded-lg border border-red-400/40 bg-red-400/5 p-3
                    hover:border-red-400 hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-red-400 font-display mb-1.5">Para anularle</p>
          ${rec.anular.map(t => `<p class="text-xs text-white leading-relaxed mb-1.5 last:mb-0">${escapeHtml(t)}</p>`).join('')}
        </div>
      </div>
    </div>`;

  return `
    <div class="mt-6 rounded-lg border border-accent/40 bg-accent/5 p-4 sm:p-5
                hover:border-accent hover:shadow-lg transition-all duration-200">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-3">
        📌 Insight clave · el patrón de las victorias
      </p>

      <div class="space-y-2 mb-5 max-w-4xl">
        ${ins.texto.map((t, i) => `
          <p class="${i === 0 ? 'text-base text-white font-medium' : 'text-sm text-slate-100'} leading-relaxed">
            ${escapeHtml(t)}
          </p>`).join('')}
      </div>

      <div class="scrollbox">
        <table class="w-full">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
            <th class="pb-2 pr-3">Lo que cambia</th>
            <th class="pb-2 pr-3">Ganando (${ins.g.pj})</th>
            <th class="pb-2 pr-3">Perdiendo (${ins.d.pj})</th>
            <th class="pb-2">Impacto</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      ${notaEstables}
      ${bloqueRec}
    </div>`;
}

/* ---------- Tabs ---------- */

function equiposTab(idx, e, id) {
  switch (id) {
    case 'general':   return equiposTabGeneral(idx, e);
    case 'ofensiva':  return equiposTabOfensiva(idx, e);
    case 'defensiva': return equiposTabDefensiva(idx, e);
    case '4factores': return equiposTab4F(idx, e);
    case 'personalidad': return equiposTabPersonalidad(idx, e);
    case 'condicion': return equiposTabCondicion(idx, e);
    case 'plantel':   return equiposTabPlantel(idx, e);
    case 'partidos':  return equiposTabPartidos(idx, e);
    default:          return '';
  }
}

function equiposTabGeneral(idx, e) {
  const u5 = e.ultimos5 || {};
  const dif = (u5.ptsFavor || 0) - (u5.ptsContra || 0);
  const kpis = ['AST-PP', 'PePP%', 'RO%', 'PACE']
    .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');

  const log = (e.partidos || []).slice(-5).map(p => {
    const gano = SGADD.texto(p['RESULTADO']).toUpperCase() === 'GANADO';
    return `<tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 transition-all duration-200"
                onclick="equiposVerPartido('${SGADD_UI.escJs(p.__id || '')}')">
      <td class="py-1.5 pr-3 text-xs truncate max-w-[220px]">${escapeHtml(equiposRival(p, e))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${SGADD.num(p['PTS'])}-${SGADD.num(p['PTSopp'])}</td>
      <td class="py-1.5 text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  const clavesRank = ['RO%', 'PLAYS', 'PP Opp%', 'PePP%', 'PT3%', 'eFG%', 'PPP', 'T2%', 'T1%'];
  const filasRank = clavesRank.map(k => {
    const r = idx.leer(e.clave, k);
    if (!r) return null;
    r.rk = idx.ranking(e.clave, k);
    return r;
  }).filter(Boolean).sort((a, b) => (b.percentil || 0) - (a.percentil || 0));

  // Fecha + rival + condición (L/V) en el tooltip: "14/10/2025 - vs X (L)".
  const etiquetas = (e.partidos || []).map(p => equiposEtiquetaEvolucion(p, e));

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${kpis}</div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel(e.nombre + ' vs liga · métricas clave',
        SGADD_CHARTS.barrasRanking(filasRank),
        SGADD_CHARTS.narrarAtaque(idx, e))}
      ${equiposPanel('Evolución · puntos a favor y en contra',
        SGADD_CHARTS.evolucion('chEvolucion', e.partidos || [], { etiquetas: etiquetas }),
        SGADD_CHARTS.nota(e.sinFecha ? e.sinFecha + ' partido(s) sin fecha cargada van al final.' : 'Orden cronológico.'))}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Últimos 5</h5>
        <table class="w-full text-left"><tbody>${log || '<tr><td class="text-xs text-muted py-2">Sin partidos.</td></tr>'}</tbody></table>
        <p class="text-[11px] text-muted mt-2 font-mono">
          ${u5.ganados || 0}-${u5.perdidos || 0} · diferencial ${dif > 0 ? '+' : ''}${dif}
        </p>
      </div>
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'distribucion-plays'))}
    </div>`;
}

function equiposTabOfensiva(idx, e) {
  const cards = ['PPP', 'TS%', 'PT3%', 'TC%']
    .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');

  const lanz = equiposSerie(idx, e, ['T2I', 'T3I', 'T1I', 'T2C', 'T3C', 'T1C']);
  const ppt = equiposSerie(idx, e, ['PPT2', 'PPT3', 'PPT1']);

  // Errados = intentados - convertidos. Guardado: si falta una columna,
  // leer() devuelve null y no queremos que reviente el tab entero.
  const val = (k, campo) => { const r = idx.leer(e.clave, k); const v = r ? r[campo] : null; return (typeof v === 'number' && isFinite(v)) ? v : 0; };
  const conv  = ['T2C', 'T3C', 'T1C'].map(k => val(k, 'valor'));
  const convL = ['T2C', 'T3C', 'T1C'].map(k => val(k, 'tipo'));
  const errEq = ['T2I', 'T3I', 'T1I'].map((k, i) => Math.max(0, val(k, 'valor') - conv[i]));
  const errL  = ['T2I', 'T3I', 'T1I'].map((k, i) => Math.max(0, val(k, 'tipo') - convL[i]));

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${cards}</div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel('Distribución de lanzamientos · ' + e.nombre + ' vs liga',
        SGADD_CHARTS.barrasComparadas('chLanz', ['T2 int.', 'T3 int.', 'T1 int.', 'T2 conv.', 'T3 conv.', 'T1 conv.'],
          lanz.eq, lanz.lg, { nombreEquipo: e.nombre }),
        SGADD_CHARTS.nota('Promedios por partido. Muestra de dónde salen los tiros, no si entran.'))}
      ${equiposPanel('Efectividad por zona · PPP convertido',
        SGADD_CHARTS.barrasComparadas('chPPT', ['PPT2 (dobles)', 'PPT3 (triples)', 'PPT1 (libres)'],
          ppt.eq, ppt.lg, { nombreEquipo: e.nombre }),
        SGADD_CHARTS.narrarPPT(idx, e))}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel(e.nombre + ' · convertidos vs errados',
        SGADD_CHARTS.convertidosErrados('chCE1', conv, errEq))}
      ${equiposPanel('Liga (equipo tipo) · convertidos vs errados',
        SGADD_CHARTS.convertidosErrados('chCE2', convL, errL, { gris: true }))}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'eficiencia'))}
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'tiro'))}
    </div>`;
}

function equiposTabVistas(idx, e, vistas, kpis) {
  const cards = (kpis || []).map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');
  const tablas = vistas.map(v => SGADD_UI.metricTable(idx.leerVista(e.clave, v))).join('');
  return `
    ${cards ? `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${cards}</div>` : ''}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">${tablas}</div>`;
}

function equiposTabDefensiva(idx, e) {
  const cards = ['RTNG DEF', 'PTSopp', 'RD%', 'PR']
    .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');
  const perd = equiposSerie(idx, e, ['PePP%', 'PP Opp%']);
  const reb = equiposSerie(idx, e, ['RO', 'RD', 'RT']);

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${cards}</div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel('Pérdidas de balón · propias vs provocadas',
        SGADD_CHARTS.barrasComparadas('chPerd', ['PP% propias (menos=mejor)', 'PP Opp% provocadas (más=mejor)'],
          perd.eq, perd.lg, { horizontal: true, nombreEquipo: e.nombre, formato: 'PePP%' }),
        SGADD_CHARTS.narrarPerdidas(idx, e))}
      ${equiposPanel('Rebotes · ' + e.nombre + ' vs liga',
        SGADD_CHARTS.barrasComparadas('chReb', ['RO', 'RD', 'RT'], reb.eq, reb.lg, { nombreEquipo: e.nombre }),
        SGADD_CHARTS.narrarRebote(idx, e))}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'factores-def'))}
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'rebote'))}
    </div>
    <p class="text-[11px] text-muted mt-4 leading-snug">
      Los factores del rival se calculan sumando su box score en cada partido, no promediando porcentajes.
      Por eso son comparables uno a uno con los tuyos.
    </p>`;
}

function equiposTab4F(idx, e) {
  /* El radar necesita una escala común: usamos el percentil, que ya viene
     0-100 y con la dirección resuelta (en métricas invertidas, más lejos del
     centro sigue siendo mejor). */
  const of = ['eFG%', 'PePP%', 'RTL%', 'RO%'];
  const df = ['eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'];
  const pct = ks => ks.map(k => { const r = idx.leer(e.clave, k); return r && r.percentil !== null ? r.percentil : 50; });
  const lbl = ks => ks.map(k => SGADD.metrica(k).label);

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel('Perfil ofensivo · percentiles',
        SGADD_CHARTS.radar('chRadarOf', lbl(of), [
          { label: e.nombre, data: pct(of) },
          { label: 'Mediana de la liga', data: of.map(() => 50), color: SGADD_CHARTS.COL.liga, relleno: 'transparent' },
        ]),
        SGADD_CHARTS.nota('El círculo del 50 es la mediana. Cuanto más lejos del centro, mejor — también en las métricas donde menos es mejor.'))}
      ${equiposPanel('Perfil defensivo · percentiles',
        SGADD_CHARTS.radar('chRadarDef', lbl(df), [
          { label: e.nombre, data: pct(df), color: SGADD_CHARTS.COL.acento, relleno: SGADD_CHARTS.COL.acentoSuave },
          { label: 'Mediana de la liga', data: df.map(() => 50), color: SGADD_CHARTS.COL.liga, relleno: 'transparent' },
        ]))}
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" data-hoja>
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'factores-of'))}
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'factores-def'))}
    </div>
    <p class="text-[11px] text-muted mt-4 leading-snug">
      Los ocho salen de la misma fuente y con el mismo método: ratio sobre los totales de la temporada.
      La flecha ↓ marca las métricas donde menos es mejor.
    </p>`;
}

/* El radar de este tab va con el ancho ACOTADO (`max-w-3xl`), aunque el
   bloque tenga la fila entera para él.

   Chart.js dibuja el canvas al ancho de su contenedor, y el radar sale del
   lado MÁS CORTO. Con el contenedor a 1498px y 265 de alto, al escalarlo
   para imprimir —manteniendo aspecto— el radar quedaba de 110px, contra los
   164 de "Perfil ofensivo/defensivo", que van en media columna. O sea:
   cuanto MÁS ANCHO el contenedor, más chico sale el radar. Agrandar la caja
   en el CSS de impresión no alcanzaba; hay que igualar el contenedor.

   OJO al comentar acá adentro: el cuerpo de esta función es un template
   literal, así que un backtick en un comentario HTML lo cierra y rompe el
   módulo entero. Por eso esta explicación vive afuera. */
function equiposTabCondicion(idx, e) {
  const filas = ['eFG%', 'PePP%', 'RTL%', 'RO%', 'eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'].map(k => {
    const l = e.split.LOCAL.factores[k], v = e.split.VISITANTE.factores[k];
    const dif = (l !== null && v !== null) ? l - v : null;
    const m = SGADD.metrica(k);
    const mejorLocal = dif === null ? null : (m.invertida ? dif < 0 : dif > 0);
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs">${escapeHtml(m.label)}${m.invertida ? ' <span class="text-muted">↓</span>' : ''}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, l))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, v))}</td>
      <td class="py-1.5 font-mono text-xs ${dif === null ? 'text-muted' : mejorLocal ? 'text-green-400' : 'text-red-400'}">
        ${dif === null ? '—' : (dif > 0 ? '+' : '') + SGADD.formatear(k, dif)}
      </td>
    </tr>`;
  }).join('');

  const cab = (t, s2) => `<div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">${t}</p>
      <p class="font-display text-2xl text-ink leading-tight">${s2.ganados}-${s2.perdidos}</p>
      <p class="text-[11px] text-muted font-mono">${s2.pj} PJ · ${s2.ptsFavor}-${s2.ptsContra}</p>
    </div>`;

  /* Radar Local vs Visitante. Las métricas van escaladas a una base común
     (×100 los porcentajes) para que compartan un mismo eje. */
  const ejesRadar = ['eFG%', 'RTL%', 'RO%', 'PePP%', 'PP Opp%', 'eFG Opp%'];
  const escala = (obj) => ejesRadar.map(k => {
    const v = obj.factores[k];
    if (v === null || v === undefined) return 0;
    const inv = SGADD.metrica(k).invertida;
    // En invertidas mostramos el complemento: más lejos del centro = mejor.
    return Math.round((inv ? (1 - v) : v) * 100);
  });

  return `
    <div class="grid grid-cols-2 gap-3 mb-5">
      ${cab('De local', e.split.LOCAL)}
      ${cab('De visitante', e.split.VISITANTE)}
    </div>

    <div class="mb-6 max-w-3xl">
      ${equiposPanel('Local vs visitante · comparación por condición',
        SGADD_CHARTS.radar('chRadarCond', ejesRadar.map(k => SGADD.metrica(k).label + (SGADD.metrica(k).invertida ? ' (inv.)' : '')), [
          { label: 'Local', data: escala(e.split.LOCAL) },
          { label: 'Visitante', data: escala(e.split.VISITANTE), color: SGADD_CHARTS.COL.acento, relleno: SGADD_CHARTS.COL.acentoSuave },
        ]),
        SGADD_CHARTS.narrarCondicion(e))}
    </div>
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Factor</th><th class="pb-1 pr-3">Local</th>
        <th class="pb-1 pr-3">Visitante</th><th class="pb-1">Dif</th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      La columna Dif está pintada desde la mirada de local: verde significa que juegan mejor en casa.
    </p>`;
}

/* =====================================================================
   SINCRONIZACIÓN BIDIRECCIONAL · scatter ↔ tabla de plantel

   Un único punto de entrada para las dos direcciones, y ese es el punto:
   con dos handlers separados (uno que pinta la fila, otro que agranda el
   nodo) el hover sobre el gráfico dispara el de la tabla, que vuelve a
   disparar el del gráfico, y se entra en un bucle de repintado.

   `origen` corta ese bucle: cuando el aviso viene del gráfico NO se le
   vuelve a hablar al gráfico, y viceversa.
   ===================================================================== */
let equiposJugDestacado = null;

function equiposDestacarJugador(clave, origen) {
  const val = clave || null;
  if (val === equiposJugDestacado) return;   // sin cambio, sin trabajo
  equiposJugDestacado = val;

  /* --- Tabla --- */
  const filas = document.querySelectorAll('#plantelTabla tr[data-jug]');
  filas.forEach(tr => {
    tr.classList.toggle('fila-destacada', !!val && tr.getAttribute('data-jug') === val);
  });

  /* --- Gráfico: solo si el aviso NO vino de él --- */
  if (origen === 'grafico') return;
  const cv = document.getElementById('chUsoTs');
  if (!cv || typeof Chart === 'undefined') return;
  const ch = Chart.getChart(cv);
  if (!ch) return;
  const datos = ch.data.datasets[0].data;
  const i = val ? datos.findIndex(d => d.clave === val) : -1;
  if (i === -1) {
    ch.setActiveElements([]);
    if (ch.tooltip) ch.tooltip.setActiveElements([], { x: 0, y: 0 });
  } else {
    ch.setActiveElements([{ datasetIndex: 0, index: i }]);
    /* El tooltip también, si no el nodo crece pero no se sabe cuál es. */
    if (ch.tooltip) ch.tooltip.setActiveElements([{ datasetIndex: 0, index: i }], { x: 0, y: 0 });
  }
  ch.update('none');   // sin animación: el hover tiene que sentirse inmediato
}

function equiposTabPlantel(idx, e) {
  /* El MISMO corte que el scatter (`SGADD_CHARTS.MIN_SCATTER`), no uno
     propio. La tabla y el gráfico son dos vistas del mismo conjunto y la
     sincronización cruzada los ata: con cortes distintos, la mitad de las
     filas apuntaba a un nodo que no existe y el hover no hacía nada.
     Se lee la constante en vez de repetir el 10, que es la única forma de
     que no se separen la próxima vez que alguien la mueva. */
  const pisoMin = (typeof SGADD_CHARTS !== 'undefined' && typeof SGADD_CHARTS.MIN_SCATTER === 'number')
    ? SGADD_CHARTS.MIN_SCATTER : 10;
  /* La tabla muestra el PLANTEL COMPLETO: es la lista del equipo y esconder
     a la mitad no la vuelve más clara, la vuelve incompleta. Lo que sí
     cambia es la jerarquía visual — los que están en el gráfico van en
     blanco y el resto atenuado. */
  const jug = (idx.liga.jugadoresPorEquipo.get(e.clave) || e.jugadores || [])
    .slice().sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0));
  const enGrafico = (j) => typeof j['MIN'] === 'number' && j['MIN'] >= pisoMin;
  const fueraDelGrafico = jug.filter(j => !enGrafico(j)).length;
  const cols = ['MIN', 'PTS', 'USG%', 'TS%', 'eFG%', 'AST-PP', 'VAL', '+/-'];

  const filas = jug.map(j => {
    /* Dos preguntas distintas, dos marcas distintas:
         · `enGrafico` (MIN ≥ 10) decide el PESO VISUAL, porque es el que
           empareja la fila con un nodo del scatter;
         · `__califica` (MIN ≥ umbral de liga) decide si tiene percentil,
           y eso se dice con una nota al costado, no atenuando la fila.
       Antes las dos se resolvían con `__califica` y quedaban atenuados
       jugadores que sí están en el gráfico — el DT los veía grises en la
       tabla y en blanco en el nodo. */
    const cal = enGrafico(j);
    const sinPercentil = !j.__califica;
    /* El estado sale del buzón, no de la planilla. Sin el módulo cargado
       todos son ACTIVO y la fila se pinta igual que siempre. */
    const est = (typeof SGADD_BUZON !== 'undefined') ? SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']) : null;
    const badgeEstado = (est && est.id !== 'ACTIVO')
      ? `<span class="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full border ${est.borde} ${est.color} whitespace-nowrap"
              title="${escapeAttr(est.descripcion + (est.origen === 'usuario' ? ' · confirmado a mano' : ''))}">${est.emoji} ${escapeHtml(est.label)}</span>`
      : '';
    /* `data-jug` es el ancla de la sincronización con el scatter: el mismo
       string que lleva cada punto del gráfico. */
    return `<tr data-jug="${escapeAttr(j.__clave || '')}"
      onmouseenter="equiposDestacarJugador('${SGADD_UI.escJs(j.__clave || '')}', 'tabla')"
      onmouseleave="equiposDestacarJugador(null, 'tabla')"
      class="fila-jug border-b border-hairline/40 last:border-0 ${cal ? '' : 'fila-flojo'}">
      <td class="py-1.5 pr-3 text-xs whitespace-nowrap">
        <span class="fila-inicial" aria-hidden="true">${escapeHtml(
          (typeof SGADD_CHARTS !== 'undefined' ? SGADD_CHARTS.inicialesJugador(j['NOMBRES']) : ''))}</span>
        ${escapeHtml(j['NOMBRES'])}${badgeEstado}</td>
      ${cols.map(c => `<td class="py-1.5 pr-3 font-mono text-xs ${c === '+/-' ? SGADD_UI.claseMasMenos(j[c]) : ''}">${escapeHtml(SGADD.formatear(c, j[c]))}</td>`).join('')}
      <td class="py-1.5 text-[10px] whitespace-nowrap">${
        !cal ? `<span class="text-muted" title="Por debajo de ${pisoMin} minutos: no entra al gráfico">fuera del gráfico</span>`
        : sinPercentil ? `<span class="text-yellow-400" title="No llega al umbral de calificación de la liga: se muestra sin percentil">sin percentil</span>`
        : ''}</td>
    </tr>`;
  }).join('');

  return `
    <div class="mb-6">
      ${equiposPanel('Uso vs eficiencia · quién carga y quién rinde',
        /* Se le pasa el PLANTEL COMPLETO, no `jugadoresCalificados`: el
           gráfico filtra por su propio piso de 10 minutos.

           El umbral de calificación de la liga (~15,4 en La Plata) responde
           otra pregunta —si un PERCENTIL tiene sentido— y acá no se muestra
           ningún percentil, se muestran dos métricas crudas. Con el filtro
           viejo quedaban afuera los refuerzos de última fecha y los de
           rotación corta, que son justamente los que el DT quiere ubicar
           en el cuadrante. */
        SGADD_CHARTS.scatterUsoEficiencia('chUsoTs',
          (idx.liga.jugadoresPorEquipo.get(e.clave) || e.jugadores || []), idx.liga),
        SGADD_CHARTS.nota('Incluye a todo el que promedie 10 minutos o más, califique o no para percentiles.'))}
    </div>

    <div class="scrollbox"><table id="plantelTabla" class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Jugador</th>
        ${cols.map(c => `<th class="pb-1 pr-3">${escapeHtml(c)}</th>`).join('')}
        <th class="pb-1"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      <b>El plantel completo</b>, ordenado por minutos. Los que van en blanco son los mismos
      ${jug.length - fueraDelGrafico} que están en el gráfico (<b>${pisoMin} minutos o más</b>):
      pasá el cursor por cualquiera de los dos y se destaca en el otro.
      ${fueraDelGrafico ? `Los ${fueraDelGrafico} atenuados juegan menos de ${pisoMin} minutos y no entran al
        gráfico: con esa muestra, un tiro convertido mueve el eFG% diez puntos.` : ''}
      Los marcados <span class="text-yellow-400">sin percentil</span> no llegan al umbral de
      calificación de la liga (MIN ≥ ${idx.liga.minJugador !== null ? idx.liga.minJugador.toFixed(2) : '—'}):
      sus datos se muestran igual, pero no entran en ningún ranking.
    </p>`;
}

function equiposTabPartidos(idx, e) {
  // Si hay un partido abierto en la ruta, se muestra el detalle.
  if (EQUIPOS.partido && typeof equiposDetallePartido === 'function') {
    const det = equiposDetallePartido(idx, e, EQUIPOS.partido);
    if (det) return det;
  }

  const filas = (e.partidos || []).slice().reverse().map(p => {
    const gano = SGADD.texto(p['RESULTADO']).toUpperCase() === 'GANADO';
    return `<tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 transition-all duration-200"
                onclick="equiposVerPartido('${SGADD_UI.escJs(p.__id || '')}')"
                title="Ver el detalle de este partido">
      <td class="py-1.5 pr-3 text-xs dato-sec font-mono whitespace-nowrap">${escapeHtml(SGADD.formatearFecha(p.__fecha))}</td>
      <td class="py-1.5 pr-3 text-xs text-white truncate max-w-[200px]">${escapeHtml(equiposRival(p, e))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${SGADD.num(p['PTS'])}-${SGADD.num(p['PTSopp'])}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(SGADD.formatear('eFG%', p['eFG%']))}</td>
      <td class="py-1.5 text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Fecha</th><th class="pb-1 pr-3">Rival</th><th class="pb-1 pr-3">Cond.</th>
        <th class="pb-1 pr-3">Result.</th><th class="pb-1 pr-3">eFG%</th><th class="pb-1"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3">
      Clic en cualquier fila para ver el detalle del partido.
      Orden cronológico.${e.sinFecha ? ' <span class="text-yellow-400">' + e.sinFecha + ' partido(s) sin fecha cargada</span>, van al final.' : ''}
    </p>`;
}

/** Saca el nombre del rival del string "A vs B". */
function equiposRival(p, e) {
  const partido = SGADD.texto(p['PARTIDO']);
  const partes = partido.split(/\s+vs\s+/i);
  if (partes.length !== 2) return partido;
  const mio = SGADD.claveEquipo(e.nombre);
  const otro = SGADD.claveEquipo(partes[0]) === mio ? partes[1] : partes[0];
  return SGADD.limpiarNombre(otro);
}

/** "L" / "V" / "?" — la condición corta que va en badges y tooltips. */
function equiposCondicionCorta(p) {
  const cond = SGADD.texto(p['CONDICION']).toUpperCase();
  return cond === 'LOCAL' ? 'L' : cond === 'VISITANTE' ? 'V' : '?';
}

/** "14/10/2025 - vs RECONQUISTA (L)" — para el tooltip del gráfico de
    evolución: fecha, rival y condición en una sola línea. */
function equiposEtiquetaEvolucion(p, e) {
  return SGADD.formatearFecha(p.__fecha) + ' - vs ' + equiposRival(p, e) + ' (' + equiposCondicionCorta(p) + ')';
}


/* ---------------------------------------------------------------------
   TAB PERSONALIDAD

   Todo en percentiles contra la propia liga: el mismo código sirve para
   La Plata y para Liga Argentina sin tocar nada.
   --------------------------------------------------------------------- */
function equiposTabPersonalidad(idx, e) {
  if (typeof SGADD_PERSONALIDAD === 'undefined') return '';
  const p = SGADD_PERSONALIDAD.perfil(idx, e);

  /* --- Titular --- */
  const neto = p.arquetipo.neto;
  const cabecera = `
    <div class="rounded-lg border border-accent/40 bg-accent/5 p-4 mb-5">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-1">Identidad de juego</p>
      <h4 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-ink leading-tight">
        ${escapeHtml(p.arquetipo.titulo)}
      </h4>
      <p class="text-xs text-muted mt-2 leading-snug max-w-3xl">${escapeHtml(p.arquetipo.frase)}</p>
      ${neto && neto.valor !== null ? `<p class="text-[11px] text-muted mt-2 font-mono">
        Rating neto ${escapeHtml(neto.formateado)} · percentil ${neto.percentil === null ? '—' : neto.percentil.toFixed(0)}
      </p>` : ''}
    </div>`;

  /* --- Ejes: un slider por rasgo, con los dos polos --- */
  const eje = (x) => {
    const pos = Math.max(2, Math.min(98, x.percentil));
    const color = x.fuerte ? 'var(--acento)' : '#6b7280';
    return `
      <div class="py-2.5 px-2 -mx-2 rounded border-b border-hairline/40 last:border-0
                    hover:bg-surface2/40 transition-all duration-200">
        <div class="flex items-baseline justify-between gap-3 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-muted font-display">${escapeHtml(x.titulo)}</span>
          <span class="text-xs font-semibold ${x.fuerte ? 'text-accent' : 'text-white'}">${escapeHtml(x.etiqueta)}</span>
        </div>
        <div class="relative h-1.5 rounded-full bg-surface2">
          <div class="absolute inset-y-0 left-1/2 w-px bg-ink/30"></div>
          <div class="absolute -top-1 h-3.5 w-3.5 rounded-full border-2 border-base"
               style="left:calc(${pos.toFixed(0)}% - 7px);background:${color}"></div>
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-[10px] ${x.polo === 'izq' ? 'text-white' : 'dato-sec'}">${escapeHtml(x.izq)}</span>
          <span class="text-[10px] ${x.polo === 'der' ? 'text-white' : 'dato-sec'}">${escapeHtml(x.der)}</span>
        </div>
        ${x.descripcion ? `<p class="text-[10px] text-slate-300 mt-1.5 leading-snug">${escapeHtml(x.descripcion)}</p>` : ''}
        <p class="text-[10px] dato-sec mt-1 font-mono">
          ${escapeHtml(x.metrica)} ${escapeHtml(x.valor)} · liga ${escapeHtml(x.mediana)} · pctil ${x.percentil.toFixed(0)}
        </p>
      </div>`;
  };

  const ataque = p.ejes.filter(x => x.familia === 'ataque' || x.familia === 'tempo');
  const defensa = p.ejes.filter(x => x.familia === 'defensa');

  /* --- Rasgos definitorios --- */
  const rasgos = p.rasgos.length
    ? p.rasgos.map(r => `
        <div class="bg-surface2/50 rounded-lg p-3 border border-transparent
                    hover:border-accent hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-muted font-display">${escapeHtml(r.titulo)}</p>
          <p class="font-display text-base text-accent leading-tight mt-0.5">${escapeHtml(r.etiqueta)}</p>
          <p class="text-[10px] text-muted mt-1 font-mono">pctil ${r.percentil.toFixed(0)}</p>
        </div>`).join('')
    : `<p class="text-xs text-muted">Ningún rasgo se separa lo suficiente de la media como para definirlo.</p>`;

  /* --- Radar: los 8 ejes en percentil --- */
  const radar = SGADD_CHARTS.radar('chPersonalidad',
    p.ejes.map(x => x.titulo),
    [
      { label: e.nombre, data: p.ejes.map(x => x.percentil) },
      { label: 'Mediana de la liga', data: p.ejes.map(() => 50), color: SGADD_CHARTS.COL.liga, relleno: 'transparent' },
    ]);

  const aviso = p.ejes.some(x => !x.muestraSuficiente)
    ? SGADD_UI.aviso('Perfil provisorio',
        'Con pocos partidos, un rasgo puede ser una racha y no una identidad. Se estabiliza con la temporada.')
    : '';

  return `
    ${cabecera}
    ${aviso}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">${rasgos}</div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel('Perfil completo · 8 ejes', radar,
        SGADD_CHARTS.nota('El anillo del 50 es la mediana de su liga. Los ejes no tienen lado bueno ni malo: son formas de jugar.'))}
      <div data-hoja>
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Cómo ataca</h5>
        ${ataque.map(eje).join('')}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Cómo defiende</h5>
        ${defensa.map(eje).join('')}
      </div>
      ${p.resumen ? `
      <div data-hoja>
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Dónde gana y dónde pierde</h5>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p class="text-[10px] uppercase tracking-wider text-green-400 font-display mb-1.5">Sus 3 armas</p>
            ${p.resumen.fuertes.map(f => equiposClave(f, true)).join('')}
          </div>
          <div>
            <p class="text-[10px] uppercase tracking-wider text-red-400 font-display mb-1.5">Sus 3 grietas</p>
            ${p.resumen.debiles.map(f => equiposClave(f, false)).join('')}
          </div>
        </div>
        <p class="text-[11px] text-muted mt-3 leading-snug">
          Los tres mejores y los tres peores percentiles de los 8 factores. Es la lectura más corta
          de para qué prepararlos y por dónde atacarlos.
        </p>
      </div>` : ''}
    </div>
    ${equiposInsight(p.insight)}`;
}

/* =====================================================================
   DETALLE DE UN PARTIDO · sub-vista dentro del tab Partidos
   ===================================================================== */
function equiposDetallePartido(idx, e, id) {
  const part = idx.partido(id);
  if (!part) return null;

  const propio = part.lados.find(l => l.equipo.clave === e.clave);
  if (!propio) return null;

  const a = SGADD_PARTIDO.analizar(idx, part, propio);
  const riv = a.rival;
  const gano = a.gano;

  /* --- Cabecera con marcador --- */
  const marcador = (lado, esPropio) => {
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(lado.equipo.nombre) : null;
    return `
      <div class="flex-1 min-w-0 text-center">
        ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-12 h-12 object-contain mx-auto mb-1">` : ''}
        <p class="text-[11px] uppercase tracking-wider truncate ${esPropio ? 'text-accent font-semibold' : 'dato-sec'}">
          ${escapeHtml(lado.equipo.nombre)}
        </p>
        <p class="font-display text-3xl sm:text-4xl leading-none mt-1" style="color:#fff">${lado.fila['PTS'] || 0}</p>
      </div>`;
  };

  const cabecera = `
    <div class="mb-5">
      <div class="flex items-center justify-between gap-3 mb-3" data-no-print>
        <button onclick="equiposCerrarPartido()"
          class="text-xs uppercase tracking-wider dato-sec hover:text-white transition-all duration-200">
          ← Volver a partidos
        </button>
        <button onclick="equiposImprimirPartido()"
          class="text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2
                 hover:border-accent hover:bg-surface2 transition-all duration-200" style="color:#fff">
          📄 Descargar PDF
        </button>
      </div>
      <div class="rounded-lg border ${gano ? 'border-green-400/40' : 'border-red-400/40'} bg-surface2/30 p-4">
        <p class="text-[10px] uppercase tracking-widest dato-sec text-center mb-3">
          ${escapeHtml(SGADD.formatearFecha(part.fecha))} ·
          ${escapeHtml(SGADD.texto(propio.fila['CONDICION']))} ·
          <span class="${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'Ganado' : 'Perdido'}</span>
        </p>
        <div class="flex items-center gap-3">
          ${marcador(part.lados[0], part.lados[0] === propio)}
          <span class="dato-sec text-sm shrink-0">—</span>
          ${riv ? marcador(part.lados[1], part.lados[1] === propio) : ''}
        </div>
      </div>
      <!-- Hook de parciales por cuarto: se activa cuando existan las
           columnas PTS_Q1..PTS_Q4 en Base Datos E. -->
    </div>`;

  /* --- Insight del partido --- */
  const lista = (arr, color) => arr.map(x => `
    <div class="bg-surface2/50 rounded-lg p-2.5 mb-2 border-l-2 ${color}
                hover:bg-surface2 hover:border-l-4 transition-all duration-200">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-xs text-white">${escapeHtml(x.label)}</span>
        <span class="font-mono text-xs text-white">${escapeHtml(SGADD.formatear('eFG%', x.partido))}</span>
      </div>
      <p class="text-[10px] dato-sec font-mono mt-0.5">
        habitual ${escapeHtml(SGADD.formatear('eFG%', x.habitual))} · ${x.dif > 0 ? '+' : ''}${escapeHtml(SGADD.formatear('eFG%', x.dif))}
      </p>
    </div>`).join('') || '<p class="text-xs dato-sec">Sin desvíos relevantes.</p>';

  const rec = a.recomendacion;
  /* Va al FINAL del informe, debajo de los box scores: es la conclusión,
     no la introducción. Y si no entra en la hoja, salta a la siguiente
     sin apretar el box score. */
  const bloqueRec = `
    <div id="proximoCruce" class="mt-6 pt-4 border-t border-hairline">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-3">💡 Para el próximo cruce</p>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div class="rounded-lg border border-green-400/40 bg-green-400/5 p-3 hover:border-green-400 hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-green-400 font-display mb-1.5">${gano ? 'Sostener' : 'Corregir'}</p>
          ${(gano ? rec.sostener : rec.corregir).map(t => `<p class="text-xs text-white leading-relaxed mb-1.5 last:mb-0">${escapeHtml(t)}</p>`).join('')}
        </div>
        <div class="rounded-lg border border-accent/40 bg-accent/5 p-3 hover:border-accent hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-accent font-display mb-1.5">🎯 Nuestros jugadores</p>
          ${(rec.destacados.concat(rec.potenciar).slice(0, 3).map(t => `<p class="text-xs text-white leading-relaxed mb-1.5 last:mb-0">${escapeHtml(t)}</p>`).join('')
            || '<p class="text-xs dato-sec">Nadie se salió de su promedio.</p>')}
        </div>
        <div class="rounded-lg border border-red-400/40 bg-red-400/5 p-3 hover:border-red-400 hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider text-red-400 font-display mb-1.5">🎯 Atención al rival</p>
          ${(rec.vigilar.map(t => `<p class="text-xs text-white leading-relaxed mb-1.5 last:mb-0">${escapeHtml(t)}</p>`).join('')
            || '<p class="text-xs dato-sec">Ningún rival tuvo un pico atípico.</p>')}
        </div>
      </div>
    </div>`;

  const insight = `
    <div class="rounded-lg border border-accent/40 bg-accent/5 p-4 sm:p-5 mb-6
                hover:border-accent hover:shadow-lg transition-all duration-200">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-3">📌 Insight del partido</p>
      <div class="space-y-2 mb-5 max-w-4xl">
        ${a.texto.map((t, i) => `<p class="${i === 0 ? 'text-base text-white font-medium' : 'text-sm text-slate-100'} leading-relaxed">${escapeHtml(t)}</p>`).join('')}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-wider text-green-400 font-display mb-1.5">3 claves del partido</p>
          ${lista(a.claves, 'border-green-400')}
        </div>
        <div>
          <p class="text-[10px] uppercase tracking-wider text-red-400 font-display mb-1.5">3 grietas del partido</p>
          ${lista(a.grietas, 'border-red-400')}
        </div>
      </div>
    </div>`;
  // bloqueRec NO va acá: se inserta al final, debajo de los box scores.

  /* --- 4 Factores enfrentados --- */
  const factores = (propio.factores && riv && riv.factores) ? (() => {
    const filas = ['eFG%', 'PP%', 'RTL%', 'RO%'].map(k => {
      const vp = propio.factores[k], vr = riv.factores[k];
      if (typeof vp !== 'number' || typeof vr !== 'number') return '';
      const inv = k === 'PP%';
      const mejorP = inv ? vp < vr : vp > vr;
      const total = (vp + vr) || 1;
      return `
        <tr class="border-b border-hairline/40 last:border-0">
          <td class="py-2 pr-3 font-mono text-xs ${mejorP ? 'text-green-400 font-medium' : 'text-white'}">${escapeHtml(SGADD.formatear('eFG%', vp))}</td>
          <td class="py-2">
            <div class="flex items-center gap-1">
              <div class="flex-1 h-2 rounded-full bg-surface2 overflow-hidden flex justify-end">
                <div class="h-full ${mejorP ? 'bg-green-400' : 'bg-muted'}" style="width:${(vp / total * 100).toFixed(0)}%"></div>
              </div>
              <span class="text-[10px] dato-sec whitespace-nowrap px-1">${escapeHtml(SGADD.metrica(k === 'PP%' ? 'PePP%' : k).label)}</span>
              <div class="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                <div class="h-full ${!mejorP ? 'bg-red-400' : 'bg-muted'}" style="width:${(vr / total * 100).toFixed(0)}%"></div>
              </div>
            </div>
          </td>
          <td class="py-2 pl-3 font-mono text-xs ${!mejorP ? 'text-red-400 font-medium' : 'text-white'}">${escapeHtml(SGADD.formatear('eFG%', vr))}</td>
        </tr>`;
    }).join('');
    return `
      <div class="mb-6">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">4 Factores del partido</h5>
        <table class="w-full"><tbody>${filas}</tbody></table>
        <p class="text-[11px] dato-sec mt-2">Verde = quién ganó ese factor. En pérdidas, menos es mejor.</p>
      </div>`;
  })() : '';

  /* --- Métricas avanzadas del partido --- */
  const avanzadas = (a.avanzadas) ? (() => {
    const av = a.avanzadas, ar = a.avanzadasRival;
    const tarjeta = (label, valor, propio, rival, fmt, mejorAlto) => {
      if (valor === null || valor === undefined) return '';
      const cmp = (typeof propio === 'number' && typeof rival === 'number')
        ? (mejorAlto ? propio > rival : propio < rival) : null;
      const color = cmp === null ? 'text-white' : (cmp ? 'text-green-400' : 'text-red-400');
      return `
        <div class="bg-surface2/50 rounded-lg p-3 border border-transparent
                    hover:border-accent hover:shadow-lg transition-all duration-200">
          <p class="text-[10px] uppercase tracking-wider dato-sec font-display">${escapeHtml(label)}</p>
          <p class="font-display text-2xl ${color} leading-tight">${escapeHtml(fmt(valor))}</p>
          ${typeof rival === 'number'
            ? `<p class="text-[10px] dato-sec font-mono mt-0.5">rival ${escapeHtml(fmt(rival))}</p>` : ''}
        </div>`;
    };
    const n1 = v => v.toFixed(1).replace('.', ',');
    const n0 = v => String(Math.round(v));

    return `
      <div class="mb-6">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">Eficiencia del partido</h5>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3" id="avanzadasPartido">
          ${tarjeta('Ritmo (PACE)', av.pace, null, null, n1)}
          ${tarjeta('ORTG', av.ortg, av.ortg, ar ? ar.ortg : null, n1, true)}
          ${tarjeta('DRTG', av.drtg, av.drtg, ar ? ar.drtg : null, n1, false)}
          ${tarjeta('PLAYS', av.plays, av.plays, ar ? ar.plays : null, n0, true)}
        </div>
        <p class="text-[11px] dato-sec mt-2 leading-snug">
          ORTG y DRTG están calculados por 100 <b>PLAYS</b>, no por 100 posesiones:
          no son comparables con el ORTG de la NBA. PACE son las posesiones proyectadas
          a 200 minutos de equipo.
        </p>
      </div>`;
  })() : '';

  /* --- Box scores --- */
  const boxScore = (lado, desvios, titulo) => {
    if (!lado || !lado.box.length) {
      return `<div><h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">${escapeHtml(titulo)}</h5>
              <p class="text-xs dato-sec">Sin box score cargado para este partido.</p></div>`;
    }
    /* El +/- del EQUIPO es el margen del partido, no la suma de la columna:
       con 5 en cancha esa suma da ~5x el margen. Por eso sale de
       SGADD.masMenosEquipo y va en el encabezado, no como fila de totales
       (una fila de totales invitaría justamente a sumar la columna). */
    const margen = SGADD.masMenosEquipo(lado.fila['PTS'],
      lado.rivalFila ? lado.rivalFila['PTS'] : lado.fila['PTSopp']);
    const badgeMargen = margen === null ? '' :
      `<span class="ml-2 font-mono normal-case ${SGADD_UI.claseMasMenos(margen)}"
             title="Margen del partido. El +/- del equipo NO es la suma de los +/- individuales.">
         ${escapeHtml(SGADD.formatear('+/-', margen))}</span>`;
    const cols = SGADD_PARTIDO.COLS_BOX;
    const filas = desvios.map(d => {
      const j = d.fila;
      const flojo = !d.fiable;
      const dest = d.destacado;
      return `
        <tr class="border-b border-hairline/40 last:border-0 ${flojo ? 'opacity-50' : ''}
                   ${dest ? (dest.z > 0 ? 'bg-green-400/5' : 'bg-red-400/5') : ''}">
          <td class="py-1.5 pr-3 text-xs whitespace-nowrap ${dest ? 'text-white font-medium' : 'text-white'}">
            ${escapeHtml(SGADD_PARTIDO.nombreCorto(j))}
            ${dest ? `<span class="ml-1 text-[10px] font-mono ${dest.z > 0 ? 'text-green-400' : 'text-red-400'}"
              title="${escapeAttr(dest.clave + ' ' + SGADD.formatear(dest.clave, dest.valor) + ' vs ' + SGADD.formatear(dest.clave, dest.media) + ' de promedio')}">
              ${dest.z > 0 ? '▲' : '▼'}${escapeHtml(dest.clave)}</span>` : ''}
          </td>
          ${cols.map(c => {
            const m = d.marcas[c];
            const marcado = m && m.atipico && d.fiable;
            /* El +/- lleva su propio color tenue: no compite con el marcado
               de atípicos, que es el semáforo fuerte de esta tabla. */
            const base = c === '+/-' ? SGADD_UI.claseMasMenos(j[c]) : 'text-white';
            return `<td class="py-1.5 pr-2 font-mono text-xs ${marcado ? (m.z > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium') : base}"
                     ${m ? `title="promedio ${SGADD.formatear(c, m.media)} en ${m.n} partidos"` : ''}>
              ${escapeHtml(SGADD.formatear(c, j[c]))}${marcado ? `<span class="text-[9px] block leading-none">${signoNum(m.delta)}</span>` : ''}
            </td>`;
          }).join('')}
        </tr>`;
    }).join('');

    return `
      <div>
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">${escapeHtml(titulo)}${badgeMargen}</h5>
        <div class="scrollbox">
          <table class="w-full">
            <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
              <th class="pb-2 pr-3">Jugador</th>
              ${cols.map(c => `<th class="pb-2 pr-2">${escapeHtml(c)}</th>`).join('')}
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </div>`;
  };

  const notaBox = `
    <p class="text-[11px] dato-sec mt-3 leading-snug">
      Verde y rojo marcan rendimientos atípicos <b>para ese jugador</b>: más de ${SGADD_PARTIDO.Z_ATIPICO}
      desvíos estándar sobre su propio promedio. El número chico debajo es la diferencia contra ese promedio.
      Los atenuados jugaron menos de ${SGADD_PARTIDO.MIN_MINUTOS} minutos.
      <b>+/-</b> es la diferencia de puntos con el jugador en cancha; el que va al lado del título es el
      margen del equipo en el partido, que <b>no</b> es la suma de los individuales (en cancha hay cinco a la vez).
    </p>`;

  /* Los dos box scores van lado a lado: en A4 juntos se llevan la mitad de
     la hoja, y en columna no entrarían con el resto del informe. */
  return `
    <div id="detallePartido">
      ${cabecera}
      ${insight}
      ${factores}
      ${avanzadas}
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6" id="boxScores">
        ${boxScore(propio, a.propios, 'Box score · ' + propio.equipo.nombre)}
        ${riv ? boxScore(riv, a.rivales, 'Box score · ' + riv.equipo.nombre) : ''}
      </div>
      ${notaBox}
      ${bloqueRec}
      <footer class="informe-pie solo-imprimir">${SGADD_UI.pieInforme()}</footer>
    </div>`;
}

/* ---------------------------------------------------------------------
   PDF del partido · exactamente una hoja A4.

   No reusa el modal del informe de equipo: acá no hay nada que elegir, el
   informe post-partido es siempre el mismo. Un clic y afuera.
   --------------------------------------------------------------------- */
function equiposImprimirPartido() {
  /* Los escudos se serializan antes de imprimir: al imprimir, el navegador
     vuelve a resolver el `src` de cada <img> y cualquier fallo ahí los deja
     afuera del PDF sin avisar. Misma utilidad que usan las otras dos
     exportaciones. */
  SGADD_UI.embeberImagenes('#detallePartido');
  document.body.classList.add('modo-partido-print');
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('modo-partido-print');
      SGADD_UI.restaurarImagenes('#detallePartido');
    }, 400);
  }, 250);
}

function signoNum(v) {
  const n = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
  return (v > 0 ? '+' : '') + String(n).replace('.', ',');
}

/* Este módulo es sobre todo render (document/LOGOS) y no se testea en Node
   como un todo — mismo criterio que siempre. Se exportan nada más las
   funciones puras nuevas, para poder testear la generación de etiquetas
   del gráfico de evolución sin mockear el DOM. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { equiposRival, equiposCondicionCorta, equiposEtiquetaEvolucion };
}
