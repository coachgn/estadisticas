/* =====================================================================
   SGADD · Play-by-play · quintetos, clutch y mapa de tiro (LABORATORIO)

   Punto 62 de CLAUDE.md. Los datos NO salen del libro: los arma
   `motorstats-ingestion` desde el play-by-play oficial de cada partido y
   los sirve `/api/v1/pbp`, que es donde vive el guard de la capa.

   Dos partes, como el resto del proyecto:

     html(paquete, opciones)   PURA: el bloque entero como texto. Se testea
                               en Node sin DOM.
     montarPendientes(raiz)    busca los `[data-pbp-equipo]` que dejó una
                               sección, pide el paquete y lo pinta. La
                               sección no espera: pinta un cartel y sigue.

   LO QUE HAY QUE RESPETAR
   · La capa es de LABORATORIO: la pestaña y la card se ofrecen solo si el
     servidor la declara en `alcance.capas`, y el texto lo dice. Un cliente
     que ve «laboratorio» sabe que es algo en prueba, no un número firmado.
   · NET POR POSESIÓN PRIMERO. Para quintetos, PLAYS (la vara del motor)
     castiga al que gana el rebote ofensivo: el titular de Jujuy 25/26 da
     +42 en cancha, −1,4 por PLAYS y +8,5 por posesión.
   · La muestra corta se MARCA (`~` y fila tenue), no se borra (punto 4).
   · Se escapa TODO lo que viene del paquete: nombres de jugadores y
     equipos salen de un sitio de terceros.
   ===================================================================== */
const SGADD_PBP = (function () {
  'use strict';

  const CAPA = 'pbp';
  const cache = new Map();

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = (v, dec) => (v === null || v === undefined || !isFinite(v) ? '—'
    : Number(v).toFixed(dec === undefined ? 1 : dec).replace('.', ','));
  const signo = (v) => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + num(v, Number.isInteger(v) ? 0 : 1));
  const tonoMM = (v) => (v > 0 ? 'mm-pos' : v < 0 ? 'mm-neg' : '');

  /* «STEHLI, RAMIRO GERMAN» → «Stehli». En una fila de cinco, el apellido
     alcanza para reconocer al jugador; el nombre completo va en el title. */
  function apellido(nombre) {
    const a = String(nombre || '').split(',')[0].trim().toLowerCase();
    return a.replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, s, l) => s + l.toUpperCase());
  }

  function nombresDe(paq, ids) {
    return (ids || []).map((id) => {
      const j = paq.jugadores && paq.jugadores[id];
      return j ? j.n : id;
    });
  }

  function celdaCombo(paq, ids) {
    const nombres = nombresDe(paq, ids);
    return `<td class="px-2 py-1 text-left text-xs text-white whitespace-nowrap" title="${esc(nombres.join(' · '))}">`
      + esc(nombres.map(apellido).join(' · ')) + '</td>';
  }

  /* ---------------------------------------------------------------- */

  function seccion(titulo, cuerpo, nota) {
    return `<div class="pbp-seccion mt-3">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">${titulo}</h4>
      ${nota ? `<p class="text-[11px] text-muted mb-2">${nota}</p>` : ''}
      ${cuerpo}
    </div>`;
  }

  function tablaClave(paq, filas, vacio) {
    if (!filas || !filas.length) return `<p class="text-[11px] text-muted">${vacio}</p>`;
    return `<div class="scrollbox"><table class="w-full">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
        <th class="px-2 pb-1 text-left">Quinteto</th><th class="px-2 pb-1">Veces</th><th class="px-2 pb-1">G-P</th><th class="px-2 pb-1">MIN</th>
      </tr></thead><tbody>${filas.slice(0, 3).map(f => `<tr class="border-b border-hairline/40 last:border-0">
        ${celdaCombo(paq, f.ids)}
        <td class="px-2 py-1 font-mono text-xs">${f.veces}</td>
        <td class="px-2 py-1 font-mono text-xs">${f.g}-${f.p}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${f.min ? num(f.min) : '—'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function tablaCombos(paq, filas, etiqueta) {
    if (!filas || !filas.length) return '<p class="text-[11px] text-muted">Sin datos.</p>';
    return `<div class="scrollbox"><table class="w-full">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
        <th class="px-2 pb-1 text-left">${etiqueta}</th>
        <th class="px-2 pb-1">MIN</th><th class="px-2 pb-1">PJ</th><th class="px-2 pb-1">+/-</th>
        <th class="px-2 pb-1" title="Puntos a favor menos en contra, cada 100 posesiones (POS = PLAYS − RO)">NET/pos</th>
        <th class="px-2 pb-1">ORTG</th><th class="px-2 pb-1">DRTG</th>
        <th class="px-2 pb-1" title="Rating neto por 100 PLAYS, la vara del resto del panel">NET/plays</th>
        <th class="px-2 pb-1">eFG%</th><th class="px-2 pb-1">eFG% rival</th>
      </tr></thead><tbody>${filas.map(f => `<tr class="border-b border-hairline/40 last:border-0${f.ok ? '' : ' opacity-50 fila-tenue'}">
        ${celdaCombo(paq, f.ids)}
        <td class="px-2 py-1 font-mono text-xs">${f.ok ? '' : '~'}${num(f.min)}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${f.pj}</td>
        <td class="px-2 py-1 font-mono text-xs ${tonoMM(f.mm)}">${signo(f.mm)}</td>
        <td class="px-2 py-1 font-mono text-xs font-semibold ${tonoMM(f.netPos)}">${signo(f.netPos)}</td>
        <td class="px-2 py-1 font-mono text-xs">${num(f.ortg)}</td>
        <td class="px-2 py-1 font-mono text-xs">${num(f.drtg)}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${signo(f.net)}</td>
        <td class="px-2 py-1 font-mono text-xs">${num(f.efg)}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${num(f.efgC)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function bloqueClutch(paq) {
    const c = paq.clutch || {};
    const e = c.equipo || {};
    if (!e.partidos) return '<p class="text-[11px] text-muted">No jugó ningún final apretado en esta muestra.</p>';
    const filas = (c.jugadores || []).filter(j => j.usos > 0 || j.min >= 1).map((j) => {
      const nombre = paq.jugadores && paq.jugadores[j.id] ? paq.jugadores[j.id].n : j.id;
      const d = j.def || {};
      return `<tr class="border-b border-hairline/40 last:border-0">
        <td class="px-2 py-1 text-left text-xs text-white whitespace-nowrap" title="${esc(nombre)}">${esc(apellido(nombre))}</td>
        <td class="px-2 py-1 font-mono text-xs">${num(j.min)}</td>
        <td class="px-2 py-1 font-mono text-xs ${tonoMM(j.mm)}">${signo(j.mm)}</td>
        <td class="px-2 py-1 font-mono text-xs">${j.pts}</td>
        <td class="px-2 py-1 font-mono text-xs">${esc(j.tc)}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${esc(j.t3)}</td>
        <td class="px-2 py-1 font-mono text-xs dato-sec">${esc(j.tl)}</td>
        <td class="px-2 py-1 font-mono text-xs">${num(j.efg)}</td>
        <td class="px-2 py-1 font-mono text-xs font-semibold whitespace-nowrap">${num(j.usos)} <span class="dato-sec">(${num(j.porc)} %)</span></td>
        <td class="px-2 py-1 font-mono text-xs">${j.pp}</td>
        <td class="px-2 py-1 font-mono text-xs" title="Tiros con 60 s o menos y el partido a 3 o menos">${d.tiros ? d.convertidos + '/' + d.tiros : '—'}</td>
      </tr>`;
    }).join('');
    return `<p class="text-xs text-ink mb-2">
        <b>${e.partidos}</b> partidos llegaron al final apretado (<b>${e.ganados}-${e.perdidos}</b>) ·
        ${num(e.minutos)} min · <span class="${tonoMM(e.masMenos)}">${signo(e.masMenos)}</span> ·
        eFG% ${num(e.efgPct)} · ${e.perdidas} pérdidas</p>
      <div class="scrollbox"><table class="w-full">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
        <th class="px-2 pb-1 text-left">Jugador</th><th class="px-2 pb-1">MIN</th><th class="px-2 pb-1">+/-</th>
        <th class="px-2 pb-1">PTS</th><th class="px-2 pb-1">TC</th><th class="px-2 pb-1">T3</th><th class="px-2 pb-1">TL</th>
        <th class="px-2 pb-1">eFG%</th><th class="px-2 pb-1" title="PLAYS del motor: T2I + T3I + 0,44·T1I + PP">Usos</th>
        <th class="px-2 pb-1">PP</th><th class="px-2 pb-1">Último min</th>
      </tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  /* ---------------------------------------------------------------- mapa */

  /* Media cancha FIBA en metros (x desde el fondo, y desde la lateral), con
     el aro en (1,575 ; 7,5). En el SVG el fondo va ARRIBA: la cancha se
     lee como la ve el que ataca. 10 unidades = 1 m. */
  function cancha() {
    const arcoY1 = 7.5 - 6.6, arcoY2 = 7.5 + 6.6;
    const union = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
    const linea = (x1, y1, x2, y2) => `<line x1="${y1 * 10}" y1="${x1 * 10}" x2="${y2 * 10}" y2="${x2 * 10}"/>`;
    return `<g fill="none" stroke="#6b7280" stroke-width="0.8">
      <rect x="0" y="0" width="150" height="140"/>
      <rect x="${(7.5 - 2.45) * 10}" y="0" width="49" height="58"/>
      <circle cx="75" cy="${15.75}" r="2.25"/>
      ${linea(0, arcoY1, union, arcoY1)}${linea(0, arcoY2, union, arcoY2)}
      <path d="M ${arcoY1 * 10} ${union * 10} A 67.5 67.5 0 0 0 ${arcoY2 * 10} ${union * 10}"/>
    </g>`;
  }

  function mapaTiro(paq) {
    const t = paq.tiros || {};
    const celdas = t.celdas || [];
    if (!celdas.length) return '<p class="text-[11px] text-muted">Sin tiros registrados.</p>';
    const max = Math.max.apply(null, celdas.map(c => c.i));
    const rects = celdas.map((c) => {
      const pct = c.i ? c.c / c.i : 0;
      const color = pct >= 0.55 ? '#16a34a' : pct >= 0.4 ? '#d97706' : '#dc2626';
      const op = (0.15 + 0.85 * Math.sqrt(c.i / max)).toFixed(2);
      return `<rect x="${c.y * 10}" y="${c.x * 10}" width="10" height="10" fill="${color}" fill-opacity="${op}">
        <title>${c.c}/${c.i} (${Math.round(100 * pct)} %) · ${c.x}-${c.x + 1} m del fondo</title></rect>`;
    }).join('');
    const zonas = (t.zonas || []).slice(0, 8).map(z => `<tr class="border-b border-hairline/40 last:border-0">
      <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${esc(z.zona)} <span class="dato-sec">· ${z.v === 3 ? 'triple' : 'doble'}</span></td>
      <td class="px-2 py-1 font-mono text-xs">${z.c}/${z.i}</td><td class="px-2 py-1 font-mono text-xs">${num(z.pct)}</td></tr>`).join('');
    const cal = t.calibracion || {};
    return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
      <svg class="pbp-mapa w-full max-w-md" viewBox="-2 -2 154 144" role="img"
        aria-label="Mapa de tiros de campo por celda de un metro">
        ${rects}${cancha()}
      </svg>
      <div>
        <div class="scrollbox"><table class="w-full">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
            <th class="px-2 pb-1 text-left">Zona</th><th class="px-2 pb-1">C/I</th><th class="px-2 pb-1">%</th></tr></thead>
          <tbody>${zonas}</tbody></table></div>
        <p class="text-[11px] text-muted mt-2">Color: verde 55 % o más, ámbar 40-55 %, rojo menos de 40 %.
          Intensidad: cuántos tiros salen de esa celda. Coordenadas calibradas contra la línea FIBA
          (${num(cal.triplesMasAllaDeLaLinea)} % de los triples detrás de los 6,75 m).</p>
      </div>
    </div>`;
  }

  /* ---------------------------------------------------------------- todo */

  /**
   * El bloque entero de un equipo. PURA.
   * @param {object} paq  `motorstats-ingestion/analitica-pbp-web@1`
   * @param {{contexto?: 'equipo'|'scouting'}} opciones
   */
  function html(paq, opciones) {
    const o = opciones || {};
    if (!paq || !paq.esquema) return '<p class="text-[11px] text-muted">Sin análisis de play-by-play.</p>';
    const p = paq.partidos || {};
    const excl = (p.excluidos || []).length
      ? ' Quedaron afuera ' + p.excluidos.length + ': ' + p.excluidos.map(x => esc(x.fecha) + ' vs ' + esc(x.rival) + ' (' + esc(x.motivo) + ')').join('; ') + '.'
      : '';
    const u = paq.umbrales || {};
    return `<div class="pbp-bloque" data-pbp-listo="1">
      <p class="text-[11px] text-muted">
        <b class="text-ink">Laboratorio</b> · ${esc(paq.competencia || '')} · play-by-play oficial,
        <b class="text-ink">${p.validados}/${p.jugados}</b> partidos validados (cinco en cancha siempre y minutos
        contra el box score).${excl}
      </p>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        ${seccion('Quinteto inicial', tablaClave(paq, paq.iniciales, 'Sin datos.'))}
        ${seccion('Cierre · más minutos en los últimos 5\'', tablaClave(paq, paq.cierre && paq.cierre.ultimos5, 'Sin datos.'))}
        ${seccion('Cierre · en cancha al final', tablaClave(paq, paq.cierre && paq.cierre.alFinal, 'Sin datos.'))}
      </div>
      ${seccion('Quintetos con más minutos', tablaCombos(paq, paq.quintetos, 'Quinteto'),
        'NET/pos: puntos a favor menos en contra cada 100 posesiones. Con ~ y atenuados, menos de '
        + (u[5] || 15) + ' minutos juntos: se muestran, pero todavía no dicen mucho.')}
      <details class="pbp-detalle mt-3"><summary class="font-display uppercase tracking-wide text-xs text-accent cursor-pointer">Tríos con más minutos</summary>
        ${tablaCombos(paq, paq.trios, 'Trío')}</details>
      <details class="pbp-detalle mt-3"><summary class="font-display uppercase tracking-wide text-xs text-accent cursor-pointer">Dúos con más minutos</summary>
        ${tablaCombos(paq, paq.duos, 'Dúo')}</details>
      ${seccion('Clutch · quién decide los finales', bloqueClutch(paq),
        'Últimos 5 minutos del 4.º cuarto o del suplementario con el partido a 5 o menos, medido antes de cada acción. Usos = PLAYS del motor.')}
      ${o.sinMapa ? '' : seccion('Mapa de tiro', mapaTiro(paq))}
    </div>`;
  }

  /* ---------------------------------------------------------------- vivo */

  function destino() {
    if (typeof SGADD === 'undefined' || !SGADD.CATALOGO || typeof SGADD_APP === 'undefined') return null;
    const p = (SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0];
    const club = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) ? CLUB.estado.id : null;
    if (!p || !p.slug || !club) return null;
    return { club: club, slug: p.slug };
  }

  /** ¿La categoría abierta tiene la capa? La declara el servidor. */
  function activa() {
    if (typeof SGADD_APP === 'undefined') return false;
    const a = SGADD_APP.estado && SGADD_APP.estado.alcance;
    return !!(a && Array.isArray(a.capas) && a.capas.indexOf(CAPA) !== -1 && destino());
  }

  /** El lugar donde va el bloque. La sección lo pinta y sigue. */
  function espacio(equipo, contexto) {
    return `<div class="pbp-montaje" data-pbp-equipo="${esc(equipo)}" data-pbp-contexto="${esc(contexto || 'equipo')}">
      ${typeof SGADD_UI !== 'undefined' && SGADD_UI.cargando ? SGADD_UI.cargando('Cargando el análisis de play-by-play…') : 'Cargando…'}
    </div>`;
  }

  function pedir(equipo) {
    const d = destino();
    if (!d || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.leerPbp) return Promise.reject(new Error('Sin backend.'));
    const k = d.club + '|' + d.slug + '|' + String(equipo).toUpperCase();
    if (!cache.has(k)) {
      cache.set(k, SGADD_DATA.leerPbp(d.club, d.slug, equipo).then(c => c.paquete)
        .catch((e) => { cache.delete(k); throw e; }));
    }
    return cache.get(k);
  }

  function montarPendientes(raiz) {
    const r = raiz || (typeof document !== 'undefined' ? document : null);
    if (!r || !r.querySelectorAll) return;
    r.querySelectorAll('.pbp-montaje:not([data-pbp-montado])').forEach((nodo) => {
      nodo.setAttribute('data-pbp-montado', '1');
      const equipo = nodo.getAttribute('data-pbp-equipo');
      pedir(equipo).then((paq) => {
        if (!nodo.isConnected) return;
        nodo.innerHTML = html(paq, { contexto: nodo.getAttribute('data-pbp-contexto') });
      }).catch((e) => {
        if (!nodo.isConnected) return;
        nodo.innerHTML = `<p class="text-[11px] text-muted">${esc(e && e.message ? e.message : 'No se pudo cargar el análisis.')}</p>`;
      });
    });
  }

  return { CAPA, html, activa, espacio, montarPendientes, apellido, _cache: cache };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PBP;
