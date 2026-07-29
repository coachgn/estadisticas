/* =====================================================================
   SGADD · Sección PRINCIPAL

   Es la primera pantalla: acá el usuario elige la categoría y ve el estado
   general de la liga. Todo lo demás hereda esa elección.

   Contenido:
     - Selector global de categoría y fase
     - Cuatro KPI del equipo propio
     - Mapa de cuadrantes ORTG vs DRTG (el scatter con escudos)
     - Tabla de posiciones por rating neto
   ===================================================================== */

function buildPrincipal() {
  SGADD_APP.inicializar();
  setTimeout(() => SGADD_APP.cargar(), 0);
  return `<section id="principalRoot" class="space-y-5">${SGADD_APP.barra()}</section>`;
}

function principalPintar() {
  const root = document.getElementById('principalRoot');
  if (!root) return;
  const st = SGADD_APP.estado;

  if (st.error) {
    root.innerHTML = SGADD_APP.barra() + SGADD_UI.aviso('No se pudo cargar', st.error, 'error');
    return;
  }
  if (!st.idx) {
    root.innerHTML = SGADD_APP.barra() +
      `<div class="card rounded-xl p-8 border border-hairline text-center text-muted text-sm">Cargando la categoría…</div>`;
    return;
  }

  const idx = st.idx;
  root.innerHTML = [
    SGADD_APP.barra(),
    SGADD_APP.avisoMuestra(),
    principalResumenPropio(idx),
    principalScatter(idx),
    principalPosiciones(idx),
  ].filter(Boolean).join('');

  // El canvas recién existe después del innerHTML.
  setTimeout(() => principalDibujarScatter(idx), 0);
}

/* ---------- Resumen del club ---------- */

function principalResumenPropio(idx) {
  const propio = idx.lista().find(e => SGADD.esEquipoPropio(e.clave));
  if (!propio) {
    return SGADD_UI.aviso('Sin equipo propio',
      'Ningún equipo de esta categoría matchea el patrón /RECONQUISTA/. Revisá cómo está escrito el nombre en la planilla.');
  }
  const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(propio.nombre) : null;
  const rec = propio.record || { ganados: 0, perdidos: 0 };
  const rk = idx.ranking(propio.clave, 'NET RTNG');
  const racha = propio.racha
    ? (propio.racha.tipo === 'GANADO' ? propio.racha.n + ' ganados al hilo' : propio.racha.n + ' perdidos al hilo')
    : '—';

  const kpis = ['NET RTNG', 'RTNG OFF', 'RTNG DEF', 'eFG%']
    .map(k => SGADD_UI.statCard(idx.leer(propio.clave, k), { ranking: idx.ranking(propio.clave, k) })).join('');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-4 min-w-0">
          ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-14 h-14 object-contain shrink-0">` : ''}
          <div class="min-w-0">
            <h3 class="font-display text-lg sm:text-xl uppercase tracking-wide text-ink truncate">${escapeHtml(propio.nombre)}</h3>
            <p class="text-xs text-muted font-mono">${rec.ganados}-${rec.perdidos} · ${escapeHtml(racha)}${rk ? ' · ' + rk.puesto + '° de ' + rk.de : ''}</p>
          </div>
        </div>
        <button onclick="principalIrAFicha('${escapeAttr(propio.clave)}')"
          class="shrink-0 text-xs font-semibold uppercase tracking-wider bg-accent text-base rounded px-4 py-2.5 hover:bg-accentdeep transition-colors">
          Ver ficha
        </button>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">${kpis}</div>
    </div>`;
}

function principalIrAFicha(clave) {
  window.location.hash = SGADD.Ruta.build({
    planilla: SGADD_APP.estado.planillaId,
    fase: SGADD_APP.estado.fase,
    seccion: 'equipos',
    entidad: SGADD.claveEquipo(clave).toLowerCase().replace(/\s+/g, '-'),
    tab: 'general',
  });
}

/* ---------- Mapa de cuadrantes ---------- */

function principalScatter() {
  return `
    <div class="card rounded-xl p-3 sm:p-5 border border-hairline">
      <h3 class="font-display text-base sm:text-lg uppercase tracking-wide mb-3 sm:mb-4 text-ink">
        ORTG vs DRTG · Mapa de rendimiento
      </h3>
      <div class="chart-box"><canvas id="ortgDrtgChart"></canvas></div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-3 border-t border-hairline text-[11px] text-muted">
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full border-2" style="border-color:#22c55e"></i>Elite</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full border-2" style="border-color:#60a5fa"></i>Defensa fuerte</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full border-2" style="border-color:#f7941e"></i>Ataque fuerte</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full border-2" style="border-color:#ef4444"></i>Bajo</span>
        <span class="ml-auto font-mono hidden lg:inline">Líneas punteadas = mediana de la liga · DRTG invertido (arriba = mejor defensa)</span>
      </div>
    </div>`;
}

/** Alimenta el chart existente con los datos del índice SGADD. */
function principalDibujarScatter(idx) {
  const datos = idx.lista().map(e => ({
    name: e.nombre,
    x: (e.factores && typeof e.factores['RTNG OFF'] === 'number') ? e.factores['RTNG OFF'] : null,
    y: (e.factores && typeof e.factores['RTNG DEF'] === 'number') ? e.factores['RTNG DEF'] : null,
  })).filter(d => d.x !== null && d.y !== null);

  if (typeof drawOrtgDrtgChart === 'function') drawOrtgDrtgChart(datos);
}

/* ---------- Tabla de posiciones ---------- */

function principalPosiciones(idx) {
  const lista = idx.lista().slice().sort((a, b) => {
    const va = a.factores ? a.factores['NET RTNG'] : null;
    const vb = b.factores ? b.factores['NET RTNG'] : null;
    return (vb === null || vb === undefined ? -999 : vb) - (va === null || va === undefined ? -999 : va);
  });

  const cols = [
    { k: 'RTNG OFF', t: 'ORTG' }, { k: 'RTNG DEF', t: 'DRTG' }, { k: 'NET RTNG', t: 'NET' },
    { k: 'eFG%', t: 'eFG%' }, { k: 'PePP%', t: 'PP%' }, { k: 'RO%', t: 'RO%' },
  ];

  const filas = lista.map((e, i) => {
    const propio = SGADD.esEquipoPropio(e.clave);
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(e.nombre) : null;
    const rec = e.record || { ganados: 0, perdidos: 0 };
    return `
      <tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 ${propio ? 'bg-accent/5' : ''}"
          onclick="principalIrAFicha('${escapeAttr(e.clave)}')">
        <td class="py-2 pr-2 text-xs text-muted font-mono">${i + 1}</td>
        <td class="py-2 pr-3">
          <div class="flex items-center gap-2 min-w-0">
            ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-5 h-5 object-contain shrink-0">` : ''}
            <span class="text-xs truncate ${propio ? 'text-accent font-semibold' : ''}">${escapeHtml(e.nombre)}</span>
          </div>
        </td>
        <td class="py-2 pr-3 text-right font-mono text-xs text-muted">${rec.ganados}-${rec.perdidos}</td>
        ${cols.map(c => {
          const r = idx.leer(e.clave, c.k);
          const buenoMalo = (!r || r.percentil === null) ? 'text-ink'
            : r.percentil >= 75 ? 'text-green-400' : r.percentil <= 25 ? 'text-red-400' : 'text-ink';
          return `<td class="py-2 pr-3 text-right font-mono text-xs ${buenoMalo}">${escapeHtml(r ? r.formateado : '—')}</td>`;
        }).join('')}
      </tr>`;
  }).join('');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display text-base sm:text-lg uppercase tracking-wide mb-1 text-ink">Posiciones por rating neto</h3>
      <p class="text-[11px] text-muted mb-4">Verde = top 25% de la liga · Rojo = bottom 25%. Clic en una fila para abrir la ficha.</p>
      <div class="scrollbox">
        <table class="w-full text-left">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
            <th class="pb-2 pr-2">#</th><th class="pb-2 pr-3">Equipo</th><th class="pb-2 pr-3 text-right">G-P</th>
            ${cols.map(c => `<th class="pb-2 pr-3 text-right">${escapeHtml(c.t)}</th>`).join('')}
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;
}
