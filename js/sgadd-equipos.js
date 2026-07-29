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
  idx: null,
  hojas: null,
  cargando: false,
  error: null,
};

const EQUIPOS_TABS = [
  { id: 'general',   label: 'General',    pregunta: '¿Cómo viene?' },
  { id: 'ofensiva',  label: 'Ofensiva',   pregunta: '¿Cómo anota?' },
  { id: 'defensiva', label: 'Defensiva',  pregunta: '¿Cómo defiende?' },
  { id: '4factores', label: '4 Factores', pregunta: '¿Dónde gana y dónde pierde?' },
  { id: 'condicion', label: 'Local/Vis.', pregunta: '¿Cambia de local?' },
  { id: 'plantel',   label: 'Plantel',    pregunta: '¿De quién depende?' },
  { id: 'partidos',  label: 'Partidos',   pregunta: '¿Qué pasó cada noche?' },
];

/* ===================== RUTEO ===================== */

function equiposLeerRuta() {
  const r = SGADD.Ruta.parse(window.location.hash);
  if (r.seccion !== 'equipos') return false;
  if (r.planilla) EQUIPOS.planillaId = r.planilla;
  if (r.fase) EQUIPOS.fase = r.fase;
  EQUIPOS.equipo = r.entidad || null;
  EQUIPOS.tab = r.tab || 'general';
  return true;
}

function equiposEscribirRuta(reemplazar) {
  const h = SGADD.Ruta.build({
    planilla: EQUIPOS.planillaId,
    fase: EQUIPOS.fase,
    seccion: 'equipos',
    entidad: EQUIPOS.equipo,
    tab: EQUIPOS.equipo ? EQUIPOS.tab : null,
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

function equiposVerTab(id) {
  EQUIPOS.tab = id;
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
  const lista = idx.lista().slice().sort((a, b) => {
    const na = idx.leer(a.clave, 'NET RTNG'), nb = idx.leer(b.clave, 'NET RTNG');
    return (nb && nb.valor !== null ? nb.valor : -999) - (na && na.valor !== null ? na.valor : -999);
  });
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Elegí un equipo</h3>
      <p class="text-[11px] text-muted mb-4">Ordenados por rating neto. El tuyo va en naranja.</p>
      ${SGADD_UI.teamPicker(lista, { onClick: 'equiposIrA', seleccionado: EQUIPOS.equipo })}
    </div>`;
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
        <div class="min-w-0">
          <h2 class="font-display text-xl sm:text-2xl uppercase tracking-wide text-ink truncate">${escapeHtml(e.nombre)}</h2>
          <p class="text-xs text-muted font-mono">
            ${rec.ganados}-${rec.perdidos} · ${racha}${rk ? ' · ' + rk.puesto + '° de ' + rk.de + ' en rating neto' : ''}
          </p>
        </div>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${hero}</div>
    </div>`;
}

/* ---------- Tabs ---------- */

function equiposTab(idx, e, id) {
  switch (id) {
    case 'general':   return equiposTabGeneral(idx, e);
    case 'ofensiva':  return equiposTabOfensiva(idx, e);
    case 'defensiva': return equiposTabDefensiva(idx, e);
    case '4factores': return equiposTab4F(idx, e);
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
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs truncate max-w-[220px]">${escapeHtml(equiposRival(p, e))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 text-right font-mono text-xs">${SGADD.num(p['PTS'])}-${SGADD.num(p['PTSopp'])}</td>
      <td class="py-1.5 text-right text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  const clavesRank = ['RO%', 'PLAYS', 'PP Opp%', 'PePP%', 'PT3%', 'eFG%', 'PPP', 'T2%', 'T1%'];
  const filasRank = clavesRank.map(k => {
    const r = idx.leer(e.clave, k);
    if (!r) return null;
    r.rk = idx.ranking(e.clave, k);
    return r;
  }).filter(Boolean).sort((a, b) => (b.percentil || 0) - (a.percentil || 0));

  const rivales = (e.partidos || []).map(p => equiposRival(p, e));

  return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">${kpis}</div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      ${equiposPanel(e.nombre + ' vs liga · métricas clave',
        SGADD_CHARTS.barrasRanking(filasRank),
        SGADD_CHARTS.narrarAtaque(idx, e))}
      ${equiposPanel('Evolución · puntos a favor y en contra',
        SGADD_CHARTS.evolucion('chEvolucion', e.partidos || [], { rivales: rivales }),
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
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'factores-of'))}
      ${SGADD_UI.metricTable(idx.leerVista(e.clave, 'factores-def'))}
    </div>
    <p class="text-[11px] text-muted mt-4 leading-snug">
      Los ocho salen de la misma fuente y con el mismo método: ratio sobre los totales de la temporada.
      La flecha ↓ marca las métricas donde menos es mejor.
    </p>`;
}

function equiposTabCondicion(idx, e) {
  const filas = ['eFG%', 'PePP%', 'RTL%', 'RO%', 'eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'].map(k => {
    const l = e.split.LOCAL.factores[k], v = e.split.VISITANTE.factores[k];
    const dif = (l !== null && v !== null) ? l - v : null;
    const m = SGADD.metrica(k);
    const mejorLocal = dif === null ? null : (m.invertida ? dif < 0 : dif > 0);
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs">${escapeHtml(m.label)}${m.invertida ? ' <span class="text-muted">↓</span>' : ''}</td>
      <td class="py-1.5 pr-3 text-right font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, l))}</td>
      <td class="py-1.5 pr-3 text-right font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, v))}</td>
      <td class="py-1.5 text-right font-mono text-xs ${dif === null ? 'text-muted' : mejorLocal ? 'text-green-400' : 'text-red-400'}">
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

    <div class="mb-6">
      ${equiposPanel('Local vs visitante · comparación por condición',
        SGADD_CHARTS.radar('chRadarCond', ejesRadar.map(k => SGADD.metrica(k).label + (SGADD.metrica(k).invertida ? ' (inv.)' : '')), [
          { label: 'Local', data: escala(e.split.LOCAL) },
          { label: 'Visitante', data: escala(e.split.VISITANTE), color: SGADD_CHARTS.COL.acento, relleno: SGADD_CHARTS.COL.acentoSuave },
        ]),
        SGADD_CHARTS.narrarCondicion(e))}
    </div>
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Factor</th><th class="pb-1 pr-3 text-right">Local</th>
        <th class="pb-1 pr-3 text-right">Visitante</th><th class="pb-1 text-right">Dif</th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      La columna Dif está pintada desde la mirada de local: verde significa que juegan mejor en casa.
    </p>`;
}

function equiposTabPlantel(idx, e) {
  const jug = (e.jugadores || []).slice().sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0));
  const cols = ['MIN', 'PTS', 'USG%', 'TS%', 'eFG%', 'AST-PP', 'VAL'];

  const filas = jug.map(j => {
    const cal = j.__califica;
    return `<tr class="border-b border-hairline/40 last:border-0 ${cal ? '' : 'opacity-50'}">
      <td class="py-1.5 pr-3 text-xs whitespace-nowrap">${escapeHtml(j['NOMBRES'])}</td>
      ${cols.map(c => `<td class="py-1.5 pr-3 text-right font-mono text-xs">${escapeHtml(SGADD.formatear(c, j[c]))}</td>`).join('')}
      <td class="py-1.5 text-right text-[10px] ${cal ? 'text-muted' : 'text-yellow-400/70'}">${cal ? '' : 'pocos min'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="mb-6">
      ${equiposPanel('Uso vs eficiencia · quién carga y quién rinde',
        SGADD_CHARTS.scatterUsoEficiencia('chUsoTs', (e.jugadoresCalificados || []), idx.liga),
        SGADD_CHARTS.nota('Solo los que superan el umbral de minutos: con pocos minutos el TS% es ruido.'))}
    </div>

    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Jugador</th>
        ${cols.map(c => `<th class="pb-1 pr-3 text-right">${escapeHtml(c)}</th>`).join('')}
        <th class="pb-1"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3 leading-snug">
      Los atenuados no llegan al umbral de minutos de la liga (MIN ≥ ${idx.liga.minJugador !== null ? idx.liga.minJugador.toFixed(2) : '—'}).
      Sus porcentajes se muestran, pero no entran en ningún ranking: con pocos minutos, un tiro convertido mueve el eFG% diez puntos.
    </p>`;
}

function equiposTabPartidos(idx, e) {
  const filas = (e.partidos || []).slice().reverse().map(p => {
    const gano = SGADD.texto(p['RESULTADO']).toUpperCase() === 'GANADO';
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs text-muted font-mono whitespace-nowrap">${escapeHtml(SGADD.formatearFecha(p.__fecha))}</td>
      <td class="py-1.5 pr-3 text-xs truncate max-w-[200px]">${escapeHtml(equiposRival(p, e))}</td>
      <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(SGADD.texto(p['CONDICION']))}</td>
      <td class="py-1.5 pr-3 text-right font-mono text-xs">${SGADD.num(p['PTS'])}-${SGADD.num(p['PTSopp'])}</td>
      <td class="py-1.5 pr-3 text-right font-mono text-xs">${escapeHtml(SGADD.formatear('eFG%', p['eFG%']))}</td>
      <td class="py-1.5 text-right text-xs font-semibold ${gano ? 'text-green-400' : 'text-red-400'}">${gano ? 'G' : 'P'}</td>
    </tr>`;
  }).join('');

  return `
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Fecha</th><th class="pb-1 pr-3">Rival</th><th class="pb-1 pr-3">Cond.</th>
        <th class="pb-1 pr-3 text-right">Result.</th><th class="pb-1 pr-3 text-right">eFG%</th><th class="pb-1 text-right"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3">
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
