/* =====================================================================
   SGADD · Play-by-play · quintetos, mapa de tiro, rotaciones, momentum y
   clutch (LABORATORIO)

   Punto 62 de CLAUDE.md. Los datos NO salen del libro: los arma
   `motorstats-ingestion` desde el play-by-play oficial de cada partido y
   los sirve `/api/v1/pbp`, que es donde vive el guard de la capa.

   Tres partes, como el resto del proyecto:

     html · mapaCard · jugador · mapa · diagnosticoZonas · diagnosticoJugador
     · cruceZonas · lecturaTactica · capaTiros · geometriaZonas
                           PURAS: se testean en Node sin DOM.
     montarPendientes(raiz) busca los `.pbp-montaje` que dejó una sección,
                           pide el paquete y lo pinta.
     activar(nodo, paq)    la interactividad: fila de zona <-> polígono,
                           tiros individuales de la zona, tooltip y
                           conmutadores. Por delegación en el bloque, así
                           sobrevive a repintar el mapa entero.

   LO QUE HAY QUE RESPETAR
   · La capa es de LABORATORIO: pestañas, cards y mapa del jugador se
     ofrecen solo si el servidor declara `pbp` en `alcance.capas`.
   · NET POR POSESIÓN PRIMERO en quintetos: PLAYS castiga al que gana el
     rebote ofensivo.
   · El «vs liga» es PUNTOS POR TIRO contra la liga EN ESE LUGAR, no el %:
     un hexágono al borde del arco mezcla dobles y triples.
   · LAS ZONAS SON GEOMETRÍA MEDIDA, no los polígonos de la plataforma:
     círculos y rayos desde el aro que reproducen la etiqueta de la
     plataforma en el 97,9 % de los tiros. Los parámetros viajan en el
     paquete (`liga.geometria`) y acá solo hay el respaldo.
   · Todo diagnóstico por zona se AJUSTA POR MUESTRA antes de comparar: la
     zona se acerca a la liga en proporción a los pocos tiros que tiene, así
     un 0/3 no pesa como un 1/8.
   · La muestra corta se MARCA (atenuado y ~), no se borra (punto 4).
   · Se escapa TODO lo que viene del paquete: son nombres de terceros.
   · La derecha del ATACANTE queda a la derecha del dibujo, con el aro
     arriba: «ala derecha» dice lo mismo en la tabla y en la cancha.
   ===================================================================== */
const SGADD_PBP = (function () {
  'use strict';

  const CAPA = 'pbp';
  const cache = new Map();
  const MIN_LIGA_HEX = 15;
  const HEX_R = 0.8;

  /* Respaldo de la geometría medida en motorstats-ingestion/src/pbp/avanzado.js.
     Manda la del paquete: son los MISMOS números, y si un día se recalibran
     ahí, el dibujo acompaña sin tocar este archivo. */
  const GEOMETRIA = {
    aro: [1.575, 7.5], r1: 2.35, r2: 4.8, triple: 6.75, esquina: 6.6, finEsquina: 2.99,
    anguloCorta: 31, anguloFrontal: 18, anguloFondo: 53, anguloEsquina: 71,
  };
  const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14'];

  const NOMBRES_ZONA = {
    Z1: 'Bajo el aro', Z2: 'Corta izquierda', Z3: 'Corta frontal', Z4: 'Corta derecha',
    Z5: 'Media fondo izquierdo', Z6: 'Media ala izquierda', Z7: 'Media frontal', Z8: 'Media ala derecha',
    Z9: 'Media fondo derecho', Z10: 'Triple esquina izquierda', Z11: 'Triple ala izquierda', Z12: 'Triple frontal',
    Z13: 'Triple ala derecha', Z14: 'Triple esquina derecha',
    'FRANJA-SUPERIOR': 'Fuera de las líneas', 'FRANJA-INFERIOR': 'Fuera de las líneas',
  };
  const FAMILIAS = [
    { id: 'aro', label: 'Bajo el aro' }, { id: 'corta', label: 'Media corta' },
    { id: 'mediaLateral', label: 'Media lateral' }, { id: 'mediaFrontal', label: 'Media frontal' },
    { id: 'tripleEsquina', label: 'Triple esquina' }, { id: 'tripleLateral', label: 'Triple lateral' },
    { id: 'tripleFrontal', label: 'Triple frontal' },
  ];

  /* ------------------------------------------------------------ formato */

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = (v, dec) => (v === null || v === undefined || !isFinite(v) ? '—'
    : Number(v).toFixed(dec === undefined ? 1 : dec).replace('.', ','));
  const signo = (v, dec) => (v === null || v === undefined || !isFinite(v) ? '—'
    : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), dec === undefined ? (Number.isInteger(v) ? 0 : 1) : dec));
  const tonoMM = (v) => (v > 0 ? 'mm-pos' : v < 0 ? 'mm-neg' : '');
  /* Toda celda numérica en una línea: con la tabla angosta, «8-7» partido
     en «8-/7» es exactamente la superposición que se reportó. */
  const TD = 'px-2 py-1 font-mono text-xs whitespace-nowrap';
  const TH = 'text-[10px] uppercase tracking-wider text-muted whitespace-nowrap';

  /* «STEHLI, RAMIRO GERMAN» → «Stehli». El nombre completo va en el title. */
  function apellido(nombre) {
    const a = String(nombre || '').split(',')[0].trim().toLowerCase();
    return a.replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, s, l) => s + l.toUpperCase());
  }
  const norm = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

  function nombresDe(paq, ids) {
    return (ids || []).map((id) => { const j = paq.jugadores && paq.jugadores[id]; return j ? j.n : id; });
  }
  const nombreCorto = (paq, id) => apellido(paq.jugadores && paq.jugadores[id] ? paq.jugadores[id].n : id);
  function celdaCombo(paq, ids) {
    return `<td class="px-2 py-1 text-left text-xs text-white whitespace-nowrap" title="${esc(nombresDe(paq, ids).join(' · '))}">`
      + esc((ids || []).map(id => nombreCorto(paq, id)).join(' · ')) + '</td>';
  }
  const subtitulo = (t) => `<h5 class="text-[11px] uppercase tracking-wider text-muted mb-1">${t}</h5>`;
  const vacio = (t) => `<p class="text-[11px] text-muted">${t}</p>`;

  /* Una sección colapsable. Al imprimir se abren todas (`beforeprint`, al pie). */
  function seccion(id, titulo, cuerpo, opciones) {
    const o = opciones || {};
    return `<details class="pbp-detalle mt-3" data-pbp-seccion="${esc(id)}"${o.abierta ? ' open' : ''}>
      <summary class="pbp-resumen font-display uppercase tracking-wide text-xs text-accent cursor-pointer select-none">${titulo}</summary>
      <div class="pbp-cuerpo">
      ${o.nota ? `<p class="text-[11px] text-muted mb-2">${o.nota}</p>` : ''}
      ${cuerpo}
      </div>
    </details>`;
  }

  function notaLaboratorio(paq) {
    const p = paq.partidos || {};
    const excl = (p.excluidos || []).length
      ? ' Quedaron afuera ' + p.excluidos.length + ': ' + p.excluidos.map(x => esc(x.fecha) + ' vs ' + esc(x.rival) + ' (' + esc(x.motivo) + ')').join('; ') + '.'
      : '';
    return `<p class="text-[11px] text-muted">
        <b class="text-ink">Laboratorio</b> · ${esc(paq.competencia || '')} · play-by-play oficial,
        <b class="text-ink">${p.validados}/${p.jugados}</b> partidos validados (cinco en cancha siempre y minutos
        contra el box score).${excl}
      </p>`;
  }

  /* --------------------------------------------------------- quintetos */

  function tablaClave(paq, filas) {
    if (!filas || !filas.length) return vacio('Sin datos.');
    return `<div class="scrollbox"><table class="w-full">
      <thead><tr class="${TH}">
        <th class="px-2 pb-1 text-left">Quinteto</th><th class="px-2 pb-1">Veces</th><th class="px-2 pb-1">G-P</th><th class="px-2 pb-1">MIN</th>
      </tr></thead><tbody>${filas.slice(0, 3).map(f => `<tr class="border-b border-hairline/40 last:border-0">
        ${celdaCombo(paq, f.ids)}
        <td class="${TD}">${f.veces}</td>
        <td class="${TD}">${f.g}-${f.p}</td>
        <td class="${TD} dato-sec">${f.min ? num(f.min) : '—'}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function tablaCombos(paq, filas, etiqueta) {
    if (!filas || !filas.length) return vacio('Sin datos.');
    return `<div class="scrollbox"><table class="w-full">
      <thead><tr class="${TH}">
        <th class="px-2 pb-1 text-left">${etiqueta}</th>
        <th class="px-2 pb-1">MIN</th><th class="px-2 pb-1">PJ</th><th class="px-2 pb-1">+/-</th>
        <th class="px-2 pb-1" title="Puntos a favor menos en contra, cada 100 posesiones (POS = PLAYS − RO)">NET/pos</th>
        <th class="px-2 pb-1">ORTG</th><th class="px-2 pb-1">DRTG</th>
        <th class="px-2 pb-1" title="Rating neto por 100 PLAYS, la vara del resto del panel">NET/plays</th>
        <th class="px-2 pb-1">eFG%</th><th class="px-2 pb-1">eFG% rival</th>
      </tr></thead><tbody>${filas.map(f => `<tr class="border-b border-hairline/40 last:border-0${f.ok ? '' : ' opacity-50 fila-tenue'}">
        ${celdaCombo(paq, f.ids)}
        <td class="${TD}">${f.ok ? '' : '~'}${num(f.min)}</td>
        <td class="${TD} dato-sec">${f.pj}</td>
        <td class="${TD} ${tonoMM(f.mm)}">${signo(f.mm)}</td>
        <td class="${TD} font-semibold ${tonoMM(f.netPos)}">${signo(f.netPos)}</td>
        <td class="${TD}">${num(f.ortg)}</td>
        <td class="${TD}">${num(f.drtg)}</td>
        <td class="${TD} dato-sec">${signo(f.net)}</td>
        <td class="${TD}">${num(f.efg)}</td>
        <td class="${TD} dato-sec">${num(f.efgC)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function tablaUltimos5(paq) {
    const u = paq.ultimos5 || [];
    if (!u.length) return vacio('Sin datos.');
    const celda = (q) => (q ? `<span class="text-white" title="${esc(nombresDe(paq, q.ids).join(' · '))}">${esc(q.ids.map(id => nombreCorto(paq, id)).join(' · '))}</span>
      <span class="font-mono ${tonoMM(q.mm)}">${signo(q.mm)}</span> <span class="dato-sec font-mono">${num(q.min)}'</span>` : '—');
    return `<div class="scrollbox"><table class="w-full">
      <thead><tr class="${TH}">
        <th class="px-2 pb-1 text-left">Partido</th><th class="px-2 pb-1 text-left">Quinteto inicial · +/- · min juntos</th>
        <th class="px-2 pb-1 text-left">Cierre (últimos 5') · +/- · min</th></tr></thead>
      <tbody>${u.slice().reverse().map(p => `<tr class="border-b border-hairline/40 last:border-0">
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap"><b class="${p.resultado === 'G' ? 'mm-pos' : 'mm-neg'}">${esc(p.resultado)}</b> ${esc(p.marcador)} <span class="dato-sec">vs ${esc(p.rival)} · ${esc(p.fecha)}</span></td>
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${celda(p.inicial)}</td>
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${celda(p.cierre)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /* ------------------------------------------------------ táctico (PURO) */

  /**
   * Lectura táctica de las combinaciones. PURA.
   * El «dónde está el problema» de un quinteto crítico se decide contra el
   * promedio de los quintetos CON MUESTRA del propio equipo, ponderado por
   * minutos: un DRTG de 110 es malo o bueno según defienda el resto.
   */
  function lecturaTactica(paq) {
    const t = paq.tacticas || {};
    const base = (paq.quintetos || []).filter(q => q.ok && isFinite(q.ortg) && isFinite(q.drtg));
    const min = base.reduce((a, q) => a + q.min, 0);
    const ortgEquipo = min ? base.reduce((a, q) => a + q.ortg * q.min, 0) / min : null;
    const drtgEquipo = min ? base.reduce((a, q) => a + q.drtg * q.min, 0) / min : null;
    const criticos = (t.quintetosCriticos || []).map((q) => {
      if (ortgEquipo === null) return Object.assign({}, q, { problema: null });
      const caeAtaque = ortgEquipo - q.ortg;
      const caeDefensa = q.drtg - drtgEquipo;
      return Object.assign({}, q, { problema: caeDefensa >= caeAtaque ? 'defensa' : 'ataque' });
    });
    const probar = (t.triosMejores || []).concat(t.duosMejores || []).filter(x => x.netPos > 0)
      .sort((a, b) => b.netPos - a.netPos).slice(0, 4);
    return { criticos, probar, mejores: t.quintetosMejores || [], ortgEquipo, drtgEquipo };
  }

  function bloqueTactico(paq) {
    const l = lecturaTactica(paq);
    const fila = (x, extra) => `<li class="text-xs text-ink leading-snug mb-1.5">
      <b class="text-white" title="${esc(nombresDe(paq, x.ids).join(' · '))}">${esc(x.ids.map(id => nombreCorto(paq, id)).join(' · '))}</b>
      <span class="font-mono whitespace-nowrap ${tonoMM(x.netPos)}">${signo(x.netPos)}</span>
      <span class="dato-sec whitespace-nowrap">por 100 pos · ${num(x.min)} min en ${x.pj} PJ</span>${extra || ''}</li>`;
    const crit = l.criticos.length ? l.criticos.map(q => fila(q, q.problema
      ? ` <span class="dato-sec">· falla la <b class="text-ink">${q.problema}</b>: ${q.problema === 'defensa'
        ? 'recibe ' + num(q.drtg) + ' por 100 pos (sus quintetos, ' + num(l.drtgEquipo) + ')'
        : 'anota ' + num(q.ortg) + ' por 100 pos (sus quintetos, ' + num(l.ortgEquipo) + ')'}</span>` : '')).join('')
      : '<li class="text-xs text-muted">Ningún quinteto con muestra suficiente pierde por posesión.</li>';
    const probar = l.probar.length ? l.probar.map(x => fila(x)).join('')
      : '<li class="text-xs text-muted">Sin combinaciones con muestra y diferencial positivo.</li>';
    const mejores = l.mejores.length ? l.mejores.slice(0, 3).map(x => fila(x)).join('')
      : '<li class="text-xs text-muted">Sin quintetos con muestra suficiente.</li>';
    return `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div>${subtitulo('Puntos de fuga · quintetos que pierden')}<ul>${crit}</ul></div>
      <div>${subtitulo('Quintetos que más ganan')}<ul>${mejores}</ul>
        <div class="mt-2">${subtitulo('Dar más minutos juntos · dúos y tríos que rinden')}<ul>${probar}</ul></div></div>
    </div>`;
  }

  /* --------------------------------------------------------- rotaciones */

  function heatmapRotaciones(paq) {
    const r = paq.rotaciones;
    if (!r || !r.jugadores || !r.jugadores.length) return vacio('Sin datos.');
    const jug = r.jugadores.filter(j => j.minutos >= 2).slice(0, 12);
    const W = 12, H = 16, X0 = 88, Y0 = 16;
    const ancho = X0 + 40 * W + 30;
    /* 480 celdas: sin <title> y con el color en el <svg>, o esto solo pesa
       más que el resto del bloque junto. El detalle lo da el tooltip. */
    const filas = jug.map((j, fi) => `<g data-pbp-fila="${esc(nombreCorto(paq, j.id))}">` + j.minuto.map((v, m) =>
      `<rect x="${X0 + m * W}" y="${Y0 + fi * H}" width="${W - 1}" height="${H - 2}" fill-opacity="${(0.06 + 0.94 * v / 100).toFixed(2)}" data-pbp-tip="min ${m + 1} · ${v} %"/>`).join('') + '</g>'
      + `<text x="${X0 - 6}" y="${Y0 + fi * H + 10}" text-anchor="end" font-size="9" fill="#cbd5e1">${esc(nombreCorto(paq, j.id))}</text>
         <text x="${X0 + 40 * W + 4}" y="${Y0 + fi * H + 10}" font-size="8" fill="#94a3b8">${num(j.minutos)}'</text>`).join('');
    const cortes = [10, 20, 30].map(m => `<line x1="${X0 + m * W - 0.5}" y1="${Y0 - 4}" x2="${X0 + m * W - 0.5}" y2="${Y0 + jug.length * H}" stroke="#475569" stroke-width="1"/>`).join('');
    const cab = ['1.º', '2.º', '3.º', '4.º'].map((c, i) => `<text x="${X0 + i * 10 * W + 5 * W}" y="10" text-anchor="middle" font-size="9" fill="#94a3b8">${c} cuarto</text>`).join('');
    return `<div class="scrollbox"><svg class="pbp-rotaciones" viewBox="0 0 ${ancho} ${Y0 + jug.length * H + 4}" width="${ancho}" style="fill:var(--acento, #f7941e)" role="img"
        aria-label="Porcentaje de partidos en cancha, minuto a minuto">${cab}${filas}${cortes}</svg></div>
      <p class="text-[11px] text-muted mt-1">Intensidad: en qué porción de los ${r.partidos} partidos validados estuvo en cancha en ese minuto de juego. A la derecha, minutos promedio.</p>`;
  }

  /* --------------------------------------------------- cuartos y momentum */

  function bloqueCuartos(paq) {
    const c = paq.cuartos || [];
    const m = paq.momentum;
    if (!c.length) return vacio('Sin datos.');
    const max = Math.max.apply(null, c.map(x => Math.abs(x.dif)).concat([1]));
    const barra = (v) => `<span class="pbp-barra-dif" aria-hidden="true"><span style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${Math.round(50 * Math.abs(v) / max)}%;background:${v >= 0 ? '#16a34a' : '#dc2626'}"></span></span>`;
    const tabla = `<div class="scrollbox"><table class="w-full">
      <thead><tr class="${TH}">
        <th class="px-2 pb-1 text-left">Cuarto</th><th class="px-2 pb-1">A favor</th><th class="px-2 pb-1">En contra</th>
        <th class="px-2 pb-1">Dif.</th><th class="px-2 pb-1"></th><th class="px-2 pb-1">G-E-P</th>
        <th class="px-2 pb-1" title="Diferencia promedio de ese cuarto en los últimos 5 partidos">Últimos 5</th></tr></thead>
      <tbody>${c.map(x => `<tr class="border-b border-hairline/40 last:border-0">
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${x.periodo === 'OT' ? 'Supl.' : esc(x.periodo) + '.º'} <span class="dato-sec">(${x.partidos} PJ)</span></td>
        <td class="${TD}">${num(x.favor)}</td><td class="${TD}">${num(x.contra)}</td>
        <td class="${TD} font-semibold ${tonoMM(x.dif)}">${signo(x.dif, 1)}</td><td class="px-2 py-1">${barra(x.dif)}</td>
        <td class="${TD} dato-sec">${x.ganados}-${x.empatados}-${x.perdidos}</td>
        <td class="${TD} ${tonoMM(x.difUltimos5)}">${signo(x.difUltimos5, 1)}</td></tr>`).join('')}</tbody></table></div>`;
    if (!m) return tabla;
    const corrida = (x) => `<li class="text-xs leading-snug"><b class="font-mono whitespace-nowrap">${x.pts}-0</b>
      <span class="dato-sec">vs ${esc(x.rival)} · ${esc(x.fecha)} · ${x.periodo}.º ${esc(x.desde)} → ${x.periodoFin && x.periodoFin !== x.periodo ? x.periodoFin + '.º ' : ''}${esc(x.hasta)}</span></li>`;
    return tabla + `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <div>
        ${subtitulo('Momentum · promedio por partido')}
        <p class="text-xs text-ink leading-relaxed">Corrida sin respuesta más larga:
          <b class="mm-pos font-mono">${num(m.corridaMaxFavor)}</b> a favor · <b class="mm-neg font-mono">${num(m.corridaMaxContra)}</b> en contra.<br>
          Parciales de 8 o más sin respuesta en la temporada: <b class="font-mono">${m.corridas8Favor}</b> a favor · <b class="font-mono">${m.corridas8Contra}</b> en contra.<br>
          Mejor ventana de 3 minutos: <b class="mm-pos font-mono">${signo(m.ventana3Mejor, 1)}</b> · peor: <b class="mm-neg font-mono">${signo(m.ventana3Peor, 1)}</b>.</p>
      </div>
      <div>
        ${subtitulo('Mayores parciales a favor')}<ul>${(m.topFavor || []).slice(0, 3).map(corrida).join('')}</ul>
        <div class="mt-2">${subtitulo('Mayores parciales en contra')}<ul>${(m.topContra || []).slice(0, 3).map(corrida).join('')}</ul></div>
      </div>
    </div>`;
  }

  /* --------------------------------------------------------------- clutch */

  function bloqueClutch(paq) {
    const c = paq.clutch || {};
    const e = c.equipo || {};
    if (!e.partidos) return vacio('No jugó ningún final apretado en esta muestra.');
    const jugs = (c.jugadores || []).filter(j => j.usos > 0 || j.min >= 1);
    const maxPorc = Math.max.apply(null, jugs.map(j => j.porc || 0).concat([1]));
    const filas = jugs.map((j) => {
      const nombre = paq.jugadores && paq.jugadores[j.id] ? paq.jugadores[j.id].n : j.id;
      const d = j.def || {};
      return `<tr class="border-b border-hairline/40 last:border-0">
        <td class="px-2 py-1 text-left text-xs text-white whitespace-nowrap" title="${esc(nombre)}">${esc(apellido(nombre))}</td>
        <td class="${TD}">${num(j.min)}</td>
        <td class="${TD} ${tonoMM(j.mm)}">${signo(j.mm)}</td>
        <td class="${TD}">${j.pts}</td>
        <td class="${TD}">${esc(j.tc)}</td>
        <td class="${TD} dato-sec">${esc(j.t3)}</td>
        <td class="${TD} dato-sec">${esc(j.tl)}</td>
        <td class="${TD}">${num(j.efg)}</td>
        <td class="${TD} font-semibold">${num(j.usos)} <span class="dato-sec">(${num(j.porc)} %)</span><span class="pbp-barra-uso" style="width:${Math.round(40 * (j.porc || 0) / maxPorc)}px" aria-hidden="true"></span></td>
        <td class="${TD}">${j.pp}</td>
        <td class="${TD}" title="Tiros con 60 s o menos y el partido a 3 o menos">${d.tiros ? d.convertidos + '/' + d.tiros : '—'}</td>
      </tr>`;
    }).join('');
    return `<p class="text-xs text-ink mb-2">
        <b>${e.partidos}</b> partidos llegaron al final apretado (<b>${e.ganados}-${e.perdidos}</b>) ·
        ${num(e.minutos)} min · <span class="${tonoMM(e.masMenos)}">${signo(e.masMenos)}</span> ·
        eFG% ${num(e.efgPct)} · ${e.perdidas} pérdidas</p>
      <div class="scrollbox"><table class="w-full">
      <thead><tr class="${TH}">
        <th class="px-2 pb-1 text-left">Jugador</th><th class="px-2 pb-1">MIN</th><th class="px-2 pb-1">+/-</th>
        <th class="px-2 pb-1">PTS</th><th class="px-2 pb-1">TC</th><th class="px-2 pb-1">T3</th><th class="px-2 pb-1">TL</th>
        <th class="px-2 pb-1">eFG%</th><th class="px-2 pb-1" title="PLAYS del motor: T2I + T3I + 0,44·T1I + PP">Usos · quién decide</th>
        <th class="px-2 pb-1">PP</th><th class="px-2 pb-1">Último min</th>
      </tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  /* ===================================================== GEOMETRÍA (PURO) */

  const rad = (g) => g * Math.PI / 180;

  function geometria(paq) {
    return Object.assign({}, GEOMETRIA, (paq && paq.liga && paq.liga.geometria) || {});
  }

  /** ¿Triple por posición? Arco de 6,75 m y rectas de 6,60 m hasta 2,99 m del fondo. */
  function esTriple(fondo, lateral, G) {
    if (fondo < G.finEsquina) return Math.abs(lateral - G.aro[1]) > G.esquina;
    return Math.hypot(fondo - G.aro[0], lateral - G.aro[1]) > G.triple;
  }

  /** La zona de una posición. «Izquierda» del atacante = lateral mayor que el aro. */
  function zonaGeometrica(fondo, lateral, g) {
    const G = g || GEOMETRIA;
    const dx = fondo - G.aro[0], dy = lateral - G.aro[1];
    const d = Math.hypot(dx, dy);
    const a = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
    const izq = dy > 0;
    if (esTriple(fondo, lateral, G)) {
      if (a >= G.anguloEsquina) return izq ? 'Z10' : 'Z14';
      if (a < G.anguloFrontal) return 'Z12';
      return izq ? 'Z11' : 'Z13';
    }
    if (d < G.r1) return 'Z1';
    if (d < G.r2) return a < G.anguloCorta ? 'Z3' : (izq ? 'Z2' : 'Z4');
    if (a < G.anguloFrontal) return 'Z7';
    if (a < G.anguloFondo) return izq ? 'Z6' : 'Z8';
    return izq ? 'Z5' : 'Z9';
  }

  /** Distancia del aro a la línea de triple sobre un rayo (grados; 0 = hacia el medio de la cancha). */
  function lineaTriple(angulo, G) {
    const a = Math.abs(angulo);
    if (G.aro[0] + G.triple * Math.cos(rad(a)) >= G.finEsquina) return G.triple;
    const s = Math.sin(rad(a));
    return s > 0 ? Math.min(40, G.esquina / s) : 40;
  }

  const geoCache = new Map();
  /**
   * Los 14 polígonos en metros [fondo, lateral] y el punto donde va la
   * etiqueta de cada zona. PURA y con caché por geometría.
   * Cada zona es un sector entre dos rayos y dos radios; lo que se sale de
   * la media cancha lo recorta el `clipPath` del dibujo, no el polígono.
   */
  function geometriaZonas(g) {
    const G = Object.assign({}, GEOMETRIA, g || {});
    const clave = JSON.stringify(G);
    if (geoCache.has(clave)) return geoCache.get(clave);
    const C = G.anguloCorta, F = G.anguloFrontal, B = G.anguloFondo, E = G.anguloEsquina;
    const k = (v) => () => v;
    const L = (a) => lineaTriple(a, G);
    const def = {
      Z1: [-180, 180, k(0), k(G.r1)],
      Z2: [C, 180, k(G.r1), k(G.r2)], Z3: [-C, C, k(G.r1), k(G.r2)], Z4: [-180, -C, k(G.r1), k(G.r2)],
      Z5: [B, 180, k(G.r2), L], Z6: [F, B, k(G.r2), L], Z7: [-F, F, k(G.r2), L], Z8: [-B, -F, k(G.r2), L], Z9: [-180, -B, k(G.r2), L],
      Z10: [E, 180, L, k(40)], Z11: [F, E, L, k(40)], Z12: [-F, F, L, k(40)], Z13: [-E, -F, L, k(40)], Z14: [-180, -E, L, k(40)],
    };
    const punto = (a, t) => [G.aro[0] + t * Math.cos(rad(a)), G.aro[1] + t * Math.sin(rad(a))];
    const out = {};
    ZONAS.forEach((z) => {
      const [a0, a1, rin, rout] = def[z];
      const pasos = Math.max(2, Math.round(a1 - a0));
      const adentro = [], afuera = [];
      for (let i = 0; i <= pasos; i++) {
        const a = a0 + (a1 - a0) * i / pasos;
        adentro.push(punto(a, rin(a)));
        afuera.push(punto(a, rout(a)));
      }
      out[z] = { poligono: z === 'Z1' ? afuera : adentro.concat(afuera.reverse()), etiqueta: null };
    });
    /* La etiqueta va en el punto de la zona más cercano a su centro de masa,
       medido solo sobre la parte que se VE. Los triples, hasta 2,5 m detrás
       de la línea: la cancha sigue hasta la mitad y su centro caería lejos
       de donde se tira. */
    const muestras = {};
    ZONAS.forEach((z) => { muestras[z] = []; });
    for (let f = 0.1; f < 14; f += 0.2) {
      for (let l = 0.1; l < 15; l += 0.2) {
        const z = zonaGeometrica(f, l, G);
        const d = Math.hypot(f - G.aro[0], l - G.aro[1]);
        if (/^Z1[0-4]$/.test(z) && d > G.triple + 2.5) continue;
        muestras[z].push([f, l]);
      }
    }
    /* Las esquinas: la media de fondo y la esquina de triple quedan pegadas
       y sus C/I se pisan. Se separan a mano —la media contra el fondo, la
       esquina abajo de la recta— y solo si el punto sigue en su zona. */
    const aMano = {
      Z1: [G.aro[0] + 1.25, G.aro[1]],
      Z5: [1.5, G.aro[1] + 5.1], Z9: [1.5, G.aro[1] - 5.1],
      Z10: [G.finEsquina + 0.7, G.aro[1] + 6.5], Z14: [G.finEsquina + 0.7, G.aro[1] - 6.5],
    };
    ZONAS.forEach((z) => {
      const m = muestras[z];
      if (!m.length) return;
      if (aMano[z] && zonaGeometrica(aMano[z][0], aMano[z][1], G) === z) { out[z].etiqueta = aMano[z]; return; }
      const mf = m.reduce((a, p) => a + p[0], 0) / m.length, ml = m.reduce((a, p) => a + p[1], 0) / m.length;
      let mejor = m[0], dm = Infinity;
      m.forEach((p) => { const d = (p[0] - mf) ** 2 + (p[1] - ml) ** 2; if (d < dm) { dm = d; mejor = p; } });
      out[z].etiqueta = mejor;
    });
    geoCache.set(clave, out);
    return out;
  }

  /* 10 unidades = 1 m. X espejada: la derecha del atacante, a la derecha. */
  const X = (lateral) => ((15 - lateral) * 10).toFixed(1);
  const Y = (fondo) => (fondo * 10).toFixed(1);

  function lineasCancha(G) {
    const union = G.finEsquina;
    return `<g class="pbp-lineas" fill="none" stroke="#6b7280" stroke-width="0.8" pointer-events="none">
      <rect x="0" y="0" width="150" height="140"/>
      <rect x="${X(7.5 + 2.45)}" y="0" width="49" height="58"/>
      <circle cx="${X(G.aro[1])}" cy="${Y(G.aro[0])}" r="2.25"/>
      <line x1="${X(G.aro[1] - G.esquina)}" y1="0" x2="${X(G.aro[1] - G.esquina)}" y2="${Y(union)}"/>
      <line x1="${X(G.aro[1] + G.esquina)}" y1="0" x2="${X(G.aro[1] + G.esquina)}" y2="${Y(union)}"/>
      <path d="M ${X(G.aro[1] - G.esquina)} ${Y(union)} A ${G.triple * 10} ${G.triple * 10} 0 0 1 ${X(G.aro[1] + G.esquina)} ${Y(union)}"/>
    </g>`;
  }

  /** Color divergente contra la liga: rojo abajo, gris igual, verde arriba. ±0,3 pts/tiro satura. */
  function colorDelta(delta) {
    if (delta === null || delta === undefined || !isFinite(delta)) return '#6b7280';
    const t = Math.max(-1, Math.min(1, delta / 0.3));
    const gris = [107, 114, 128];
    const dst = t >= 0 ? [22, 163, 74] : [220, 38, 38];
    const k = Math.abs(t);
    return '#' + [0, 1, 2].map(i => Math.round(gris[i] + (dst[i] - gris[i]) * k).toString(16).padStart(2, '0')).join('');
  }

  /** La vara de la liga de un hexágono: el propio si la liga tiró 15+, si no su familia. */
  function varaHex(paq, q, r, indice) {
    const liga = paq.liga || {};
    const h = indice ? indice.get(q + ',' + r) : (liga.hex || []).find(x => x[0] === q && x[1] === r);
    if (h && h[2] >= MIN_LIGA_HEX) return { ppt: h[4], fuente: 'liga en ese lugar, ' + h[2] + ' tiros' };
    const fam = h && h[5] && liga.familias ? liga.familias[h[5]] : null;
    if (fam) return { ppt: fam.ppt, fuente: 'liga en ' + ((FAMILIAS.find(f => f.id === h[5]) || {}).label || h[5]).toLowerCase() };
    return { ppt: liga.total ? liga.total.ppt : null, fuente: 'liga total' };
  }
  function varaZona(paq, zona) {
    const z = ((paq.liga || {}).zonas || []).find(x => x.zona === zona);
    return z || null;
  }

  /** Qué conjunto de tiros: el equipo, lo que le tiran, o un jugador (por id). */
  function sujetoTiros(paq, sujeto) {
    const d = paq.tiros && paq.tiros.detalle;
    if (!d) return null;
    if (sujeto === 'contra') return d.contra;
    if (sujeto && sujeto !== 'equipo') return (d.jugadores || []).find(j => String(j.id) === String(sujeto)) || null;
    return d.favor;
  }

  /* ================================================== DIAGNÓSTICO (PURO) */

  /* AJUSTE POR MUESTRA. Antes de comparar una zona contra la liga se la
     acerca a la liga con K tiros «de liga»: (puntos + K·liga) / (tiros + K).
     Un 0/3 queda cerca de la liga y un 1/8 bastante más abajo, que es lo que
     dice la evidencia. K es la mitad de una zona con muestra razonable. */
  const K_EQUIPO = 20, K_JUGADOR = 10;
  const ajustar = (valor, n, vara, k) => (valor * n + k * vara) / (n + k);

  /** Filas por zona de un sujeto, con su vara de liga y el ajuste por muestra. */
  function filasZonas(paq, sujeto, k) {
    const s = sujetoTiros(paq, sujeto);
    if (!s) return null;
    const zonas = (s.zonas || []).filter(z => ZONAS.indexOf(z.zona) !== -1 && z.i > 0);
    const total = zonas.reduce((a, z) => a + z.i, 0);
    if (!total) return null;
    const ppt = zonas.reduce((a, z) => a + z.ppt * z.i, 0) / total;
    const filas = zonas.map((z) => {
      const liga = varaZona(paq, z.zona);
      if (!liga || !isFinite(liga.ppt)) return null;
      const post = ajustar(z.ppt, z.i, liga.ppt, k);
      return Object.assign({}, z, {
        nombre: NOMBRES_ZONA[z.zona], liga, share: z.i / total,
        post, delta: post - liga.ppt,
        perdidos: z.i * (liga.ppt - post),     // puntos por debajo de lo esperado
        deMas: z.i * (post - liga.ppt),        // puntos por encima (lo que concede una defensa)
        ganancia: post - ppt,                  // lo que suma redirigir un tiro ahí
      });
    }).filter(Boolean);
    return { total, ppt, filas };
  }

  /**
   * El diagnóstico sobre la cancha. PURA.
   *   equipo  → la zona a EXPLOTAR (mayor ventaja ajustada contra la liga),
   *             2 zonas de MEJORA (las que más elevan la eficiencia del equipo
   *             si se les da volumen) y hasta 3 zonas a EVITAR o CORREGIR
   *             (las que más puntos cuestan contra lo esperado).
   *   contra  → las 3 zonas CRÍTICAS que libera la defensa.
   */
  function diagnosticoZonas(paq, sujeto) {
    const st = filasZonas(paq, sujeto || 'equipo', K_EQUIPO);
    if (!st) return null;
    if (sujeto === 'contra') {
      return { tipo: 'contra', ppt: st.ppt, criticas: st.filas.filter(f => f.i >= 20 && f.delta >= 0.03).sort((a, b) => b.deMas - a.deMas).slice(0, 3) };
    }
    const explotar = st.filas.filter(f => f.i >= 20 && f.delta >= 0.02).sort((a, b) => b.delta - a.delta)[0] || null;
    const mejora = st.filas.filter(f => f !== explotar && f.i >= 10 && f.ganancia >= 0.02).sort((a, b) => b.ganancia - a.ganancia).slice(0, 2);
    const usadas = new Set([explotar].concat(mejora).filter(Boolean).map(f => f.zona));
    const evitar = st.filas.filter(f => !usadas.has(f.zona) && f.i >= 5 && f.delta <= -0.05)
      .sort((a, b) => b.perdidos - a.perdidos).slice(0, 3)
      .map(f => Object.assign({}, f, { accion: f.share < 0.05 ? 'evitar' : 'corregir' }));
    return { tipo: 'favor', ppt: st.ppt, total: st.total, explotar, mejora, evitar };
  }

  /**
   * El diagnóstico de UN tirador sobre volumen por zona (intentos por PJ) y
   * acierto por zona (CONV %) contra la liga en esa zona. PURA.
   *   picos      acierto claramente por encima de la liga con muestra
   *   explotar   rinde por encima de la liga con poco volumen: sumarle tiros
   *   ajuste     mucho volumen con acierto de liga: seleccionar mejor
   *   fuga       acierto claramente por debajo de la liga con muestra
   */
  function diagnosticoJugador(paq, id) {
    const det = paq && paq.tiros && paq.tiros.detalle;
    const j = det && (det.jugadores || []).find(x => String(x.id) === String(id));
    if (!j) return null;
    const pj = j.pj || null;
    const filas = (j.zonas || []).filter(z => ZONAS.indexOf(z.zona) !== -1 && z.i > 0).map((z) => {
      const liga = varaZona(paq, z.zona);
      if (!liga || !isFinite(liga.pct)) return null;
      const lc = liga.pct / 100;
      const post = (z.c + K_JUGADOR * lc) / (z.i + K_JUGADOR);
      return Object.assign({}, z, {
        nombre: NOMBRES_ZONA[z.zona], liga, conv: z.c / z.i, ligaConv: lc,
        dConv: post - lc, dCrudo: z.c / z.i - lc,
        vol: pj ? z.i / pj : null, share: z.i / j.i,
        perdidos: z.i * (liga.ppt - ajustar(z.ppt, z.i, liga.ppt, K_JUGADOR)),
      });
    }).filter(Boolean);
    const volumenes = filas.map(f => f.i).sort((a, b) => a - b);
    const mediana = volumenes.length ? volumenes[Math.floor(volumenes.length / 2)] : 0;
    const picos = filas.filter(f => f.i >= 8 && f.dConv >= 0.05).sort((a, b) => b.dConv - a.dConv).slice(0, 2);
    const usadas = new Set(picos.map(f => f.zona));
    const explotar = filas.filter(f => !usadas.has(f.zona) && f.i >= 3 && f.i <= mediana && f.dConv >= 0.02)
      .sort((a, b) => b.dConv - a.dConv).slice(0, 2);
    explotar.forEach(f => usadas.add(f.zona));
    const ajuste = filas.filter(f => !usadas.has(f.zona) && f.share >= 0.15 && f.dConv > -0.05 && f.dConv < 0.02)
      .sort((a, b) => b.i - a.i).slice(0, 2);
    ajuste.forEach(f => usadas.add(f.zona));
    const fuga = filas.filter(f => !usadas.has(f.zona) && f.i >= 6 && f.dConv <= -0.05)
      .sort((a, b) => b.perdidos - a.perdidos).slice(0, 2);
    return { pj, i: j.i, c: j.c, picos, explotar, ajuste, fuga };
  }

  /**
   * El cruce de scouting, por zona. PURA.
   * atacar: zonas donde el equipo PROPIO rinde por encima de la liga y el
   *         rival concede por encima de la liga (las dos cosas ajustadas).
   * cerrar: zonas donde el RIVAL rinde por encima y el propio concede.
   */
  function cruceZonas(paqRival, paqPropio) {
    const mapa = (paq, sujeto) => {
      const st = filasZonas(paq, sujeto, K_EQUIPO);
      const m = {};
      if (st) st.filas.filter(f => f.i >= 20).forEach((f) => { m[f.zona] = f; });
      return st ? m : null;
    };
    const rF = mapa(paqRival, 'equipo'), rC = mapa(paqRival, 'contra'), pF = mapa(paqPropio, 'equipo'), pC = mapa(paqPropio, 'contra');
    if (!rF || !rC || !pF || !pC) return null;
    const atacar = [], cerrar = [];
    ZONAS.forEach((z) => {
      if (pF[z] && rC[z] && pF[z].delta >= 0.02 && rC[z].delta >= 0.02) atacar.push({ zona: z, nombre: NOMBRES_ZONA[z], propio: pF[z].delta, rival: rC[z].delta, indice: pF[z].delta + rC[z].delta });
      if (rF[z] && pC[z] && rF[z].delta >= 0.02 && pC[z].delta >= 0.02) cerrar.push({ zona: z, nombre: NOMBRES_ZONA[z], rival: rF[z].delta, propio: pC[z].delta, indice: rF[z].delta + pC[z].delta });
    });
    return { atacar: atacar.sort((a, b) => b.indice - a.indice), cerrar: cerrar.sort((a, b) => b.indice - a.indice) };
  }

  /** Las marcas del diagnóstico por zona, con la misma clase para el SVG, la tabla y la lista. */
  function marcasDiagnostico(paq, sujeto) {
    const m = {};
    const poner = (f, clase, insignia, titulo) => { if (f && !m[f.zona]) m[f.zona] = { clase, insignia, titulo, fila: f }; };
    if (sujeto && sujeto !== 'equipo' && sujeto !== 'contra') {
      const d = diagnosticoJugador(paq, sujeto);
      if (!d) return m;
      d.picos.forEach(f => poner(f, 'explotar', '★', 'Pico de rendimiento'));
      d.explotar.forEach(f => poner(f, 'mejora', '↑', 'Punto a explotar'));
      d.ajuste.forEach(f => poner(f, 'ajuste', '≈', 'Criterio de ajuste'));
      d.fuga.forEach(f => poner(f, 'evitar', '✕', 'Punto de fuga'));
      return m;
    }
    const d = diagnosticoZonas(paq, sujeto);
    if (!d) return m;
    if (d.tipo === 'contra') {
      d.criticas.forEach((f, i) => poner(f, 'critica', String(i + 1), 'Zona crítica que libera la defensa'));
      return m;
    }
    poner(d.explotar, 'explotar', '★', 'Zona a explotar');
    d.mejora.forEach(f => poner(f, 'mejora', '↑', 'Zona de mejora'));
    d.evitar.forEach(f => poner(f, 'evitar', '✕', f.accion === 'evitar' ? 'Zona a evitar' : 'Zona a corregir'));
    return m;
  }

  /* ===================================================== MAPA (PURO) */

  let serial = 0;

  /** Los tiros de UNA zona del sujeto, como círculos (convertidos) y cruces (errados). PURA. */
  function capaTiros(paq, sujeto, zona) {
    const pts = paq && paq.tiros && paq.tiros.detalle && paq.tiros.detalle.puntos;
    const zi = pts ? (pts.zonas || ZONAS).indexOf(zona) : -1;
    if (!pts || zi === -1) return { svg: '', convertidos: 0, errados: 0, disponible: false };
    let lista;
    if (sujeto === 'contra') lista = pts.contra || [];
    else if (sujeto && sujeto !== 'equipo') {
      const ji = (pts.ids || []).indexOf(String(sujeto));
      lista = ji === -1 ? [] : (pts.favor || []).filter(p => p[4] === ji);
    } else lista = pts.favor || [];
    const deZona = lista.filter(p => p[3] === zi);
    let convertidos = 0, errados = 0;
    const svg = deZona.map((p) => {
      const x = 150 - p[0], y = p[1];   // lateral×10 espejado; fondo×10
      if (p[2]) { convertidos++; return `<circle class="pbp-tiro-c" cx="${x}" cy="${y}" r="1.35"/>`; }
      errados++;
      return `<path class="pbp-tiro-e" d="M${x - 1.1} ${y - 1.1}L${x + 1.1} ${y + 1.1}M${x + 1.1} ${y - 1.1}L${x - 1.1} ${y + 1.1}"/>`;
    }).join('');
    return { svg, convertidos, errados, disponible: true };
  }

  /**
   * El mapa de tiro. PURO: conmutadores, SVG, tabla de zonas enlazada y el
   * diagnóstico sobre la cancha.
   * @param {{sujeto?: string, vista?: 'zonas'|'hex', metrica?: 'eficiencia'|'frecuencia', diag?: boolean, perspectiva?: boolean}} opciones
   */
  function mapa(paq, opciones) {
    const o = Object.assign({ sujeto: 'equipo', vista: 'zonas', metrica: 'eficiencia', diag: true, perspectiva: false }, opciones);
    const s = sujetoTiros(paq, o.sujeto);
    if (!s) return vacio('Sin tiros suficientes para dibujar el mapa.');
    const G = geometria(paq);
    const geo = geometriaZonas(G);
    const hexes = s.hex || [];
    const zonas = (s.zonas || []).filter(z => z.i > 0);
    const totalI = zonas.reduce((a, z) => a + z.i, 0) || 1;
    const zonaPorId = {};
    zonas.forEach((z) => { zonaPorId[z.zona] = z; });
    const indiceLiga = new Map(((paq.liga || {}).hex || []).map(h => [h[0] + ',' + h[1], h]));
    const frecuencia = o.metrica === 'frecuencia';
    const marcas = o.diag ? marcasDiagnostico(paq, o.sujeto) : {};
    const clip = 'pbp-cancha-' + (++serial);
    const hayPuntos = !!(paq.tiros.detalle.puntos);

    let capaHex = '';
    if (o.vista === 'hex') {
      const maxI = Math.max.apply(null, hexes.map(h => h[2]).concat([1]));
      capaHex = hexes.map(([q, r, i, c, p]) => {
        const lateral = HEX_R * Math.sqrt(3) * (q + r / 2);
        const fondo = HEX_R * 1.5 * r;
        /* Solo hexágonos con centro DENTRO de la media cancha; el borde lo
           recorta el clipPath. */
        if (fondo < 0 || fondo > 14 || lateral < 0 || lateral > 15) return '';
        const vara = varaHex(paq, q, r, indiceLiga);
        const ppt = i ? p / i : null;
        const delta = ppt !== null && vara.ppt !== null ? ppt - vara.ppt : null;
        /* Tamaño por volumen con piso de medio hexágono: más chico no se lee y
           la grilla parece desfasada. Con 0,97 queda una junta fina. */
        const escala = frecuencia ? 1 : (0.5 + 0.5 * Math.sqrt(i / maxI));
        const radio = HEX_R * 10 * escala * 0.97;
        const cx = (15 - lateral) * 10, cy = fondo * 10;
        const pts = [0, 1, 2, 3, 4, 5].map((k) => {
          const a = Math.PI / 180 * (60 * k - 30);
          return (cx + radio * Math.cos(a)).toFixed(1) + ',' + (cy + radio * Math.sin(a)).toFixed(1);
        }).join(' ');
        const fill = frecuencia ? 'var(--acento, #f7941e)' : colorDelta(delta);
        const opac = frecuencia ? (0.12 + 0.88 * Math.sqrt(i / maxI)).toFixed(2) : (i >= 3 ? '0.92' : '0.45');
        const tip = c + '/' + i + ' (' + num(100 * c / i) + ' %) · ' + num(ppt, 2) + ' pts por tiro · '
          + (vara.ppt !== null ? 'vara ' + num(vara.ppt, 2) + ' (' + vara.fuente + ')' : 'sin vara') + ' · '
          + num(100 * i / totalI) + ' % de los tiros';
        return `<polygon class="pbp-hex" points="${pts}" style="fill:${fill}" fill-opacity="${opac}" data-pbp-tip="${esc(tip)}"/>`;
      }).join('');
    }

    const maxZona = Math.max.apply(null, zonas.map(x => x.i).concat([1]));
    const puntosSvg = (lista) => lista.map(([f, l]) => X(l) + ',' + Y(f)).join(' ');
    const poligonos = ZONAS.map((zona) => {
      const z = zonaPorId[zona];
      const liga = varaZona(paq, zona);
      let fill = 'transparent', fop = '0';
      let tip = zona + ' · ' + NOMBRES_ZONA[zona] + ' · sin tiros';
      if (z) {
        const delta = z.ppt !== null && liga ? z.ppt - liga.ppt : null;
        tip = zona + ' · ' + NOMBRES_ZONA[zona] + ' · ' + z.c + '/' + z.i + ' (' + num(z.pct) + ' %) · ' + num(z.ppt, 2)
          + ' pts por tiro · liga ' + num(liga && liga.ppt, 2) + ' · ' + num(100 * z.i / totalI) + ' % de los tiros';
        if (marcas[zona]) tip += ' · ' + marcas[zona].titulo;
        if (o.vista === 'zonas') {
          fill = frecuencia ? 'var(--acento, #f7941e)' : colorDelta(delta);
          fop = frecuencia ? (0.1 + 0.9 * Math.sqrt(z.i / maxZona)).toFixed(2) : (z.i >= 5 ? '0.8' : '0.35');
        }
      }
      return `<polygon class="pbp-zona" points="${puntosSvg(geo[zona].poligono)}" data-pbp-zona="${zona}" style="fill:${fill};fill-opacity:${fop}" data-pbp-tip="${esc(tip)}"><title>${esc(tip)}</title></polygon>`;
    }).join('');

    /* C/I en cada zona. En hexágonos se ve solo la zona activa (CSS). */
    const etiquetas = ZONAS.map((zona) => {
      const z = zonaPorId[zona];
      const e = geo[zona].etiqueta;
      if (!z || !e) return '';
      /* El texto se acota a la cancha: una esquina tiene su centro a medio
         metro de la lateral y «24/68» se saldría del dibujo. La insignia va
         ARRIBA del C/I y no al costado, que tapaba el primer dígito. */
      const cx = Math.max(10, Math.min(140, (15 - e[1]) * 10));
      const cy = Math.max(9, Math.min(134, e[0] * 10));
      const m = marcas[zona];
      return `<g class="pbp-etiqueta" data-pbp-zona="${zona}" pointer-events="none">
        ${m ? `<circle class="pbp-insignia pbp-diag-${m.clase}" cx="${cx.toFixed(1)}" cy="${(cy - 6.6).toFixed(1)}" r="2.7"/><text class="pbp-insignia-txt" x="${cx.toFixed(1)}" y="${(cy - 5.3).toFixed(1)}" text-anchor="middle">${m.insignia}</text>` : ''}
        <text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" class="pbp-etiqueta-ci">${z.c}/${z.i}</text>
        <text x="${cx.toFixed(1)}" y="${(cy + 4.4).toFixed(1)}" text-anchor="middle" class="pbp-etiqueta-pct">${num(z.pct, 0)} %</text>
      </g>`;
    }).join('');

    const contornos = Object.keys(marcas).map(zona => `<polygon class="pbp-contorno pbp-diag-${marcas[zona].clase}" points="${puntosSvg(geo[zona].poligono)}" pointer-events="none"/>`).join('');

    const boton = (clave, valor, texto) => `<button type="button" class="pbp-toggle" data-pbp-accion="${clave}:${valor}" aria-pressed="${String(o[clave]) === String(valor) ? 'true' : 'false'}">${texto}</button>`;
    const grupo = (rotulo, botones) => `<div class="pbp-grupo" role="group" aria-label="${rotulo}"><span class="pbp-grupo-rotulo">${rotulo}</span>${botones}</div>`;
    const muestra = (d) => `<span class="pbp-muestra" style="background:${colorDelta(d)}"></span>`;
    const leyenda = (frecuencia
      ? '<span class="dato-sec">Intensidad = porción de los tiros que salen de ahí.</span>'
      : `<span class="whitespace-nowrap">${muestra(-0.3)} peor que la liga</span>
         <span class="whitespace-nowrap">${muestra(0)} igual</span>
         <span class="whitespace-nowrap">${muestra(0.3)} mejor</span>
         <span class="dato-sec">${o.vista === 'hex' ? 'Tamaño = volumen. ' : ''}Color = puntos por tiro contra la liga en ese lugar.</span>`)
      + (hayPuntos ? '<span class="whitespace-nowrap"><span class="pbp-ley-c"></span> convertido · <span class="pbp-ley-e">✕</span> errado, al pasar o tocar una zona</span>' : '');

    const filas = zonas.slice().sort((a, b) => b.i - a.i).map((z) => {
      const liga = varaZona(paq, z.zona);
      const delta = z.ppt !== null && liga ? Math.round((z.ppt - liga.ppt) * 100) / 100 : null;
      const m = marcas[z.zona];
      return `<tr class="pbp-fila-zona border-b border-hairline/40 last:border-0" data-pbp-zona="${esc(z.zona)}" tabindex="0"
          aria-label="${esc(z.zona + ' ' + (NOMBRES_ZONA[z.zona] || ''))}: resaltar en la cancha y ver sus tiros">
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${m ? `<span class="pbp-chip pbp-diag-${m.clase}" title="${esc(m.titulo)}">${m.insignia}</span> ` : ''}${esc(z.zona)} <span class="dato-sec">· ${esc(NOMBRES_ZONA[z.zona] || '')}</span></td>
        <td class="${TD}">${z.c}/${z.i}</td>
        <td class="${TD}">${num(z.pct)}</td>
        <td class="${TD}">${num(z.ppt, 2)}</td>
        <td class="${TD} font-semibold" style="color:${colorDelta(delta)}">${signo(delta, 2)}</td>
        <td class="${TD} dato-sec">${num(100 * z.i / totalI)}</td>
      </tr>`;
    }).join('');

    const esJugador = o.sujeto !== 'equipo' && o.sujeto !== 'contra';
    return `<div class="pbp-mapa-caja" data-pbp-sujeto="${esc(o.sujeto)}" data-pbp-vista="${o.vista}" data-pbp-metrica="${o.metrica}" data-pbp-diag="${o.diag ? '1' : '0'}" data-pbp-perspectiva="${o.perspectiva ? '1' : '0'}">
      <div class="pbp-controles">
        ${o.perspectiva && !esJugador ? grupo('Perspectiva', boton('sujeto', 'equipo', 'Lo que tira') + boton('sujeto', 'contra', 'Lo que le tiran')) : ''}
        ${grupo('Vista', boton('vista', 'zonas', 'Zonas') + boton('vista', 'hex', 'Hexágonos'))}
        ${grupo('Color', boton('metrica', 'eficiencia', 'Eficiencia vs liga') + boton('metrica', 'frecuencia', 'Frecuencia'))}
        ${grupo('Diagnóstico', boton('diag', o.diag ? '0' : '1', o.diag ? 'Ocultar' : 'Mostrar'))}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div>
          <svg class="pbp-mapa w-full max-w-md" viewBox="-4 -4 158 148" role="img" aria-label="Mapa de tiros de campo por zona">
            <defs><clipPath id="${clip}"><rect x="0" y="0" width="150" height="140"/></clipPath></defs>
            <g clip-path="url(#${clip})">${capaHex}${poligonos}${contornos}<g class="pbp-capa-tiros" pointer-events="none"></g></g>
            ${lineasCancha(G)}${etiquetas}
          </svg>
          <div class="pbp-leyenda text-[10px] mt-1">${leyenda}</div>
          <p class="pbp-capa-leyenda text-[11px] text-ink mt-1" aria-live="polite"></p>
        </div>
        <div>
          <div class="scrollbox"><table class="w-full">
            <thead><tr class="${TH}">
              <th class="px-2 pb-1 text-left">Zona</th><th class="px-2 pb-1">C/I</th><th class="px-2 pb-1">%</th>
              <th class="px-2 pb-1" title="Puntos por tiro de campo">PPT</th><th class="px-2 pb-1" title="PPT menos el de la liga en esa zona">vs liga</th>
              <th class="px-2 pb-1">% tiros</th></tr></thead>
            <tbody>${filas}</tbody></table></div>
          <p class="text-[11px] text-muted mt-2 no-imprimir">Pasá el mouse o tocá una fila o una zona: se ilumina en los dos lados${hayPuntos ? ' y aparecen sus tiros' : ''}. Tocar fija la zona.</p>
        </div>
      </div>
      ${o.diag ? listaDiagnostico(paq, o.sujeto) : ''}
    </div>`;
  }

  const insigniaHtml = (clase, texto) => `<span class="pbp-chip pbp-diag-${clase}">${texto}</span>`;
  const ci = (f) => `${f.c}/${f.i} (${num(100 * f.c / f.i)} %)`;

  /** La lectura escrita del diagnóstico que marca la cancha. PURA. */
  function listaDiagnostico(paq, sujeto) {
    const item = (clase, insignia, texto) => `<li class="text-xs text-ink leading-snug mb-1.5">${insigniaHtml(clase, insignia)} ${texto}</li>`;
    const nota = '<p class="text-[11px] text-muted mt-1">Ajustado por muestra: antes de compararla con la liga, una zona con pocos tiros se acerca a la liga (un 0/3 pesa menos que un 1/8).</p>';
    if (sujeto && sujeto !== 'equipo' && sujeto !== 'contra') {
      const d = diagnosticoJugador(paq, sujeto);
      if (!d) return '';
      const pp = (v) => signo(Math.round(v * 100), 0) + ' pp';
      const vol = (f) => (f.vol !== null ? num(f.vol, 1) + ' intentos x PJ' : f.i + ' intentos');
      const bloque = (titulo, lista, fn, vacioTxt) => `<div>${subtitulo(titulo)}<ul>${lista.length ? lista.map(fn).join('') : `<li class="text-xs text-muted">${vacioTxt}</li>`}</ul></div>`;
      return `<div class="pbp-diagnostico mt-3">
        <p class="text-xs text-ink mb-2"><b>Diagnóstico táctico individual</b> · volumen por zona (intentos por partido${d.pj ? ', ' + d.pj + ' PJ con minutos' : ''}) y acierto por zona contra la liga en esa zona.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${bloque('Picos de rendimiento', d.picos, f => item('explotar', '★', `<b class="text-white">${esc(f.zona)} · ${esc(f.nombre)}</b>: ${ci(f)}, ${vol(f)} · <span class="mm-pos">${pp(f.dCrudo)}</span> sobre la liga (${num(100 * f.ligaConv, 0)} %).`), 'Ninguna zona con muestra rinde claramente por encima de la liga.')}
          ${bloque('Puntos a explotar', d.explotar, f => item('mejora', '↑', `<b class="text-white">${esc(f.zona)} · ${esc(f.nombre)}</b>: ${ci(f)} con solo ${vol(f)} · <span class="mm-pos">${pp(f.dCrudo)}</span> sobre la liga: sumarle volumen.`), 'Sin zonas eficientes y poco usadas.')}
          ${bloque('Criterios de ajuste', d.ajuste, f => item('ajuste', '≈', `<b class="text-white">${esc(f.zona)} · ${esc(f.nombre)}</b>: ${num(100 * f.share, 0)} % de sus tiros (${vol(f)}) con acierto de liga, ${num(100 * f.conv, 0)} % contra ${num(100 * f.ligaConv, 0)} %: seleccionar mejor el tiro.`), 'Sin zonas de mucho volumen con acierto apenas de liga.')}
          ${bloque('Puntos de fuga', d.fuga, f => item('evitar', '✕', `<b class="text-white">${esc(f.zona)} · ${esc(f.nombre)}</b>: ${ci(f)}, ${vol(f)} · <span class="mm-neg">${pp(f.dCrudo)}</span> bajo la liga: ≈ ${num(Math.max(0, f.perdidos), 0)} puntos por debajo de lo esperado.`), 'Ninguna zona con muestra cae claramente por debajo de la liga.')}
        </div>${nota}
      </div>`;
    }
    const d = diagnosticoZonas(paq, sujeto);
    if (!d) return '';
    if (d.tipo === 'contra') {
      return `<div class="pbp-diagnostico mt-3">${subtitulo('Radar defensivo · las 3 zonas críticas que libera')}
        <ul>${d.criticas.length ? d.criticas.map((f, i) => item('critica', String(i + 1), `<b class="text-white">${esc(f.zona)} · ${esc(f.nombre)}</b>: le convierten ${ci(f)}, ${num(f.ppt, 2)} pts por tiro contra ${num(f.liga.ppt, 2)} de la liga: ≈ ${num(f.deMas, 0)} puntos de más concedidos.`)).join('')
          : '<li class="text-xs text-muted">Ninguna zona con muestra concede por encima de la liga.</li>'}</ul>${nota}</div>`;
    }
    const expl = d.explotar
      ? item('explotar', '★', `<b class="text-white">Zona a explotar · ${esc(d.explotar.zona)} ${esc(d.explotar.nombre)}</b>: ${ci(d.explotar)}, ${num(d.explotar.ppt, 2)} pts por tiro contra ${num(d.explotar.liga.ppt, 2)} de la liga.`)
      : '<li class="text-xs text-muted">Ninguna zona con muestra rinde por encima de la liga.</li>';
    const mej = d.mejora.map(f => item('mejora', '↑', `<b class="text-white">Zona de mejora · ${esc(f.zona)} ${esc(f.nombre)}</b>: ${num(f.ppt, 2)} pts por tiro, ${signo(Math.round(f.ganancia * 100) / 100, 2)} sobre el promedio del equipo (${num(d.ppt, 2)}): cada tiro redirigido ahí suma.`)).join('');
    const evi = d.evitar.map(f => item('evitar', '✕', `<b class="text-white">${f.accion === 'evitar' ? 'Evitar' : 'Corregir la selección'} · ${esc(f.zona)} ${esc(f.nombre)}</b>: ${ci(f)}, ${num(f.ppt, 2)} contra ${num(f.liga.ppt, 2)} de la liga: ≈ ${num(f.perdidos, 0)} puntos por debajo de lo esperado en la temporada.`)).join('');
    return `<div class="pbp-diagnostico mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>${subtitulo('Zonas a explotar')}<ul>${expl}${mej}</ul></div>
      <div>${subtitulo('Zonas ineficientes · evitar o corregir')}<ul>${evi || '<li class="text-xs text-muted">Ninguna zona con muestra cuesta puntos claros contra la liga.</li>'}</ul></div>
      <div class="sm:col-span-2">${nota}</div>
    </div>`;
  }

  /* El mapa del paquete @1 (celdas de 1 m), para no romper un paquete viejo. */
  function mapaViejo(paq) {
    const celdas = (paq.tiros && paq.tiros.celdas) || [];
    if (!celdas.length) return vacio('Sin tiros registrados.');
    const max = Math.max.apply(null, celdas.map(c => c.i));
    return `<svg class="pbp-mapa w-full max-w-md" viewBox="-4 -4 158 148" role="img" aria-label="Mapa de tiros">${celdas.map((c) => {
      const pct = c.i ? c.c / c.i : 0;
      const color = pct >= 0.55 ? '#16a34a' : pct >= 0.4 ? '#d97706' : '#dc2626';
      return `<rect x="${(14 - c.y) * 10}" y="${c.x * 10}" width="10" height="10" style="fill:${color}" fill-opacity="${(0.15 + 0.85 * Math.sqrt(c.i / max)).toFixed(2)}"><title>${c.c}/${c.i}</title></rect>`;
    }).join('')}${lineasCancha(GEOMETRIA)}</svg>`;
  }

  /* ------------------------------------------------------------- todo */

  /**
   * La card de QUINTETOS de un equipo. PURO. El mapa de tiro es otra card
   * (`mapaCard`) y el motor táctico va al final, a pedido del club.
   * @param {object} paq  `analitica-pbp-web@1`, `@2` o `@3`
   */
  function html(paq) {
    if (!paq || !paq.esquema) return vacio('Sin análisis de play-by-play.');
    const u = paq.umbrales || {};
    const v2 = !!(paq.tiros && paq.tiros.detalle);
    const trios = `<details class="pbp-detalle pbp-sub mt-3"><summary class="pbp-resumen text-[11px] uppercase tracking-wider text-muted cursor-pointer select-none">Tríos con más minutos</summary>${tablaCombos(paq, paq.trios, 'Trío')}</details>
      <details class="pbp-detalle pbp-sub mt-2"><summary class="pbp-resumen text-[11px] uppercase tracking-wider text-muted cursor-pointer select-none">Dúos con más minutos</summary>${tablaCombos(paq, paq.duos, 'Dúo')}</details>`;
    return `<div class="pbp-bloque" data-pbp-listo="1">
      ${notaLaboratorio(paq)}
      ${seccion('clave', 'Quinteto inicial y de cierre', `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>${subtitulo('Quinteto inicial')}${tablaClave(paq, paq.iniciales)}</div>
          <div>${subtitulo('Cierre · más minutos en los últimos 5\'')}${tablaClave(paq, paq.cierre && paq.cierre.ultimos5)}</div>
          <div>${subtitulo('Cierre · en cancha al final')}${tablaClave(paq, paq.cierre && paq.cierre.alFinal)}</div>
        </div>${v2 ? `<div class="mt-3">${subtitulo('Últimos 5 partidos · inicial contra cierre')}${tablaUltimos5(paq)}</div>` : ''}`, { abierta: true })}
      ${seccion('quintetos', 'Quintetos con más minutos', tablaCombos(paq, paq.quintetos, 'Quinteto') + trios,
        { abierta: true, nota: 'NET/pos: puntos a favor menos en contra cada 100 posesiones. Con ~ y atenuados, menos de '
          + (u[5] || 15) + ' minutos juntos: se muestran, pero todavía no dicen mucho.' })}
      ${v2 ? seccion('rotaciones', 'Rotaciones · minuto a minuto', heatmapRotaciones(paq)) : ''}
      ${v2 ? seccion('cuartos', 'Cuartos y momentum', bloqueCuartos(paq)) : ''}
      ${seccion('clutch', 'Clutch · quién decide los finales', bloqueClutch(paq),
        { abierta: true, nota: 'Últimos 5 minutos del 4.º cuarto o del suplementario con el partido a 5 o menos, medido antes de cada acción. Usos = PLAYS del motor.' })}
      ${v2 ? seccion('tactico', 'Motor táctico · puntos de fuga y combinaciones', bloqueTactico(paq),
        { nota: 'Solo combinaciones con muestra suficiente. Es una lectura de los números, no una orden: decide el cuerpo técnico.' }) : ''}
    </div>`;
  }

  /**
   * La card MAPA DE TIRO de un equipo. PURO.
   * @param {{propio?: object}} opciones  en Scouting, el paquete del otro lado del cruce
   */
  function mapaCard(paq, opciones) {
    const o = opciones || {};
    if (!paq || !paq.esquema) return vacio('Sin análisis de play-by-play.');
    if (!(paq.tiros && paq.tiros.detalle)) {
      return `<div class="pbp-bloque" data-pbp-listo="1">${notaLaboratorio(paq)}${mapaViejo(paq)}</div>`;
    }
    let cruce = '';
    const c = o.propio && o.propio !== paq ? cruceZonas(paq, o.propio) : null;
    if (c) {
      const li = (x, ta, va, tb, vb) => `<li class="text-xs leading-snug mb-1"><b class="text-white">${esc(x.zona)} · ${esc(x.nombre)}</b>
        <span class="dato-sec">· ${ta} ${signo(Math.round(va * 100) / 100, 2)} · ${tb} ${signo(Math.round(vb * 100) / 100, 2)} pts por tiro contra la liga</span></li>`;
      const nada = '<li class="text-xs text-muted">Ninguna zona donde coincidan las dos cosas.</li>';
      cruce = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>${subtitulo('Atacar ahí · ' + esc(o.propio.equipo) + ' rinde y ' + esc(paq.equipo) + ' concede')}
          <ul>${c.atacar.length ? c.atacar.map(x => li(x, 'nuestro ataque', x.propio, 'lo que concede', x.rival)).join('') : nada}</ul></div>
        <div>${subtitulo('Cerrar ahí · ' + esc(paq.equipo) + ' rinde y ' + esc(o.propio.equipo) + ' concede')}
          <ul>${c.cerrar.length ? c.cerrar.map(x => li(x, 'su ataque', x.rival, 'lo que concedemos', x.propio)).join('') : nada}</ul></div>
      </div>`;
    }
    return `<div class="pbp-bloque" data-pbp-listo="1">
      ${notaLaboratorio(paq)}
      ${mapa(paq, { sujeto: 'equipo', perspectiva: true })}
      ${cruce}
    </div>`;
  }

  /**
   * El mapa y el diagnóstico de UN jugador, para la pestaña Tiro de su ficha. PURO.
   * El jugador se busca por nombre normalizado en el paquete de su equipo.
   */
  function jugador(paq, nombre) {
    if (!paq || !paq.tiros || !paq.tiros.detalle) return vacio('El análisis de tiro por jugador todavía no está cargado para este equipo.');
    const id = Object.keys(paq.jugadores || {}).find(k => norm(paq.jugadores[k].n) === norm(nombre));
    const det = id ? (paq.tiros.detalle.jugadores || []).find(j => String(j.id) === String(id)) : null;
    if (!det) return vacio('Menos de 15 tiros de campo en los partidos validados: el mapa todavía no dice nada.');
    const vara = paq.liga && paq.liga.total ? paq.liga.total.ppt : null;
    return `<div class="pbp-bloque" data-pbp-listo="1">
      <p class="text-xs text-ink mb-2"><b>Laboratorio</b> · ${det.c}/${det.i} tiros de campo (${num(100 * det.c / det.i)} %) ·
        <b>${num(det.ppt, 2)}</b> puntos por tiro <span class="dato-sec">(liga ${num(vara, 2)})</span> · distancia mediana ${num(det.dist)} m
        ${det.pj ? '· ' + det.pj + ' PJ con minutos' : ''} ·
        <span class="dato-sec">play-by-play oficial, ${paq.partidos ? paq.partidos.validados : '—'} partidos validados de ${esc(paq.equipo)}</span></p>
      ${mapa(paq, { sujeto: String(id) })}
    </div>`;
  }

  /* ------------------------------------------------------------------ vivo */

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

  const cargando = (t) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.cargando ? SGADD_UI.cargando(t) : 'Cargando…');

  /**
   * El lugar de una card de un equipo.
   * @param {string} tipo  'quintetos' (por defecto) o 'mapa'
   * @param {string} propio  en Scouting, el otro lado del cruce (para «atacar / cerrar ahí»)
   */
  function espacio(equipo, contexto, propio, tipo) {
    const t = tipo === 'mapa' ? 'mapa' : 'quintetos';
    return `<div class="pbp-montaje" data-pbp-equipo="${esc(equipo)}" data-pbp-contexto="${esc(contexto || 'equipo')}" data-pbp-tipo="${t}"${propio ? ` data-pbp-propio="${esc(propio)}"` : ''}>
      ${cargando(t === 'mapa' ? 'Cargando el mapa de tiro…' : 'Cargando el análisis de play-by-play…')}</div>`;
  }
  /** El lugar del mapa de un jugador. */
  function espacioJugador(nombre, equipo) {
    return `<div class="pbp-montaje" data-pbp-equipo="${esc(equipo)}" data-pbp-jugador="${esc(nombre)}">
      ${cargando('Cargando el mapa de tiro…')}</div>`;
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

  /* El paquete pintado de cada bloque: los conmutadores del mapa y la capa
     de tiros trabajan desde acá sin volver a pedir nada. */
  const paquetes = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function montarPendientes(raiz) {
    const r = raiz || (typeof document !== 'undefined' ? document : null);
    if (!r || !r.querySelectorAll) return;
    r.querySelectorAll('.pbp-montaje:not([data-pbp-montado])').forEach((nodo) => {
      nodo.setAttribute('data-pbp-montado', '1');
      const nombreJugador = nodo.getAttribute('data-pbp-jugador');
      const propio = nodo.getAttribute('data-pbp-propio');
      const tipo = nodo.getAttribute('data-pbp-tipo');
      /* El paquete propio es opcional: sin él, la card sale igual y sin cruce. */
      Promise.all([pedir(nodo.getAttribute('data-pbp-equipo')), propio ? pedir(propio).catch(() => null) : null])
        .then(([paq, paqPropio]) => {
          if (!nodo.isConnected) return;
          nodo.innerHTML = nombreJugador ? jugador(paq, nombreJugador)
            : tipo === 'mapa' ? mapaCard(paq, { propio: paqPropio }) : html(paq);
          activar(nodo, paq);
        }).catch((e) => {
          if (!nodo.isConnected) return;
          nodo.innerHTML = vacio(esc(e && e.message ? e.message : 'No se pudo cargar el análisis.'));
        });
    });
  }

  /* -------------------------------------------------------- interacción */

  function resaltarZona(caja, zona, encendido) {
    if (!caja || !zona) return;
    caja.querySelectorAll('[data-pbp-zona="' + zona + '"]').forEach(el => el.classList.toggle('pbp-activa', encendido));
  }

  /** Dibuja los tiros de una zona (o limpia la capa) y dice cuántos son. */
  function pintarTiros(caja, paq, zona) {
    if (!caja) return;
    const g = caja.querySelector('.pbp-capa-tiros');
    const ley = caja.querySelector('.pbp-capa-leyenda');
    if (!zona || !paq) {
      if (g) g.innerHTML = '';
      if (ley) ley.textContent = '';
      return;
    }
    const r = capaTiros(paq, caja.getAttribute('data-pbp-sujeto'), zona);
    if (g) g.innerHTML = r.svg;
    if (ley) {
      ley.textContent = r.disponible
        ? zona + ' · ' + (NOMBRES_ZONA[zona] || '') + ': ● ' + r.convertidos + ' convertidos · ✕ ' + r.errados + ' errados'
        : '';
    }
  }

  function tooltip(nodo) {
    let t = nodo.querySelector(':scope > .pbp-tip');
    if (!t) {
      t = document.createElement('div');
      t.className = 'pbp-tip';
      t.hidden = true;
      nodo.appendChild(t);
    }
    return t;
  }

  /**
   * La interactividad de un bloque montado, UNA vez por nodo y por
   * delegación: un cambio de vista reemplaza el mapa entero y no hay nada
   * que reenganchar.
   */
  function activar(nodo, paq) {
    if (paq && paquetes && nodo) paquetes.set(nodo, paq);
    if (!nodo || !nodo.addEventListener || nodo.getAttribute('data-pbp-activo')) return;
    nodo.setAttribute('data-pbp-activo', '1');
    const cerca = (ev, sel) => (ev.target && ev.target.closest ? ev.target.closest(sel) : null);
    const cajaDe = (el) => (el.closest ? el.closest('.pbp-mapa-caja') : null);
    const paqueteDe = () => (paquetes ? paquetes.get(nodo) : null);

    const encender = (ev) => {
      const el = cerca(ev, '[data-pbp-zona]');
      if (!el) return;
      const caja = cajaDe(el);
      const zona = el.getAttribute('data-pbp-zona');
      const fija = caja && caja.getAttribute('data-pbp-fija');
      if (fija && fija !== zona) resaltarZona(caja, fija, false);
      resaltarZona(caja, zona, true);
      pintarTiros(caja, paqueteDe(), zona);
    };
    const apagar = (ev) => {
      const el = cerca(ev, '[data-pbp-zona]');
      if (!el) return;
      const caja = cajaDe(el);
      const zona = el.getAttribute('data-pbp-zona');
      const fija = caja && caja.getAttribute('data-pbp-fija');
      /* Una zona FIJADA con un toque no se apaga al salir el mouse, y al
         dejar otra zona la capa vuelve a la fijada. */
      if (fija === zona) return;
      resaltarZona(caja, zona, false);
      if (fija) { resaltarZona(caja, fija, true); pintarTiros(caja, paqueteDe(), fija); } else pintarTiros(caja, null, null);
    };
    nodo.addEventListener('mouseover', encender);
    nodo.addEventListener('mouseout', apagar);
    nodo.addEventListener('focusin', encender);
    nodo.addEventListener('focusout', apagar);

    nodo.addEventListener('click', (ev) => {
      const acc = cerca(ev, '[data-pbp-accion]');
      if (acc) {
        const caja = cajaDe(acc);
        const entrada = paqueteDe();
        if (!caja || !entrada) return;
        const partes = acc.getAttribute('data-pbp-accion').split(':');
        const op = {
          sujeto: caja.getAttribute('data-pbp-sujeto'), vista: caja.getAttribute('data-pbp-vista'),
          metrica: caja.getAttribute('data-pbp-metrica'), diag: caja.getAttribute('data-pbp-diag') === '1',
          perspectiva: caja.getAttribute('data-pbp-perspectiva') === '1',
        };
        op[partes[0]] = partes[0] === 'diag' ? partes[1] === '1' : partes[1];
        caja.outerHTML = mapa(entrada, op);
        tooltip(nodo).hidden = true;
        return;
      }
      const el = cerca(ev, '[data-pbp-zona]');
      if (!el) return;
      const caja = cajaDe(el);
      if (!caja) return;
      const zona = el.getAttribute('data-pbp-zona');
      const antes = caja.getAttribute('data-pbp-fija');
      if (antes) resaltarZona(caja, antes, false);
      if (antes === zona) {
        caja.removeAttribute('data-pbp-fija');
        pintarTiros(caja, null, null);
      } else {
        caja.setAttribute('data-pbp-fija', zona);
        resaltarZona(caja, zona, true);
        pintarTiros(caja, paqueteDe(), zona);
      }
    });
    nodo.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const fila = cerca(ev, 'tr[data-pbp-zona]');
      if (!fila) return;
      ev.preventDefault();
      fila.click();
    });

    /* Tooltip propio: el `title` del SVG tarda un segundo y en táctil no
       aparece. Este sigue al puntero; el `title` queda para lectores. */
    nodo.addEventListener('mousemove', (ev) => {
      const el = cerca(ev, '[data-pbp-tip]');
      const t = tooltip(nodo);
      if (!el) { t.hidden = true; return; }
      const fila = el.closest('[data-pbp-fila]');
      let texto = (fila ? fila.getAttribute('data-pbp-fila') + ' · ' : '') + el.getAttribute('data-pbp-tip');
      /* En la vista de hexágonos los polígonos de zona van ARRIBA (son los
         que se enlazan con la tabla) y tapan al hexágono: se busca el que
         está debajo del puntero y el tooltip dice los dos. */
      if (el.classList && el.classList.contains('pbp-zona') && document.elementsFromPoint) {
        const hex = document.elementsFromPoint(ev.clientX, ev.clientY).filter(x => x.classList && x.classList.contains('pbp-hex'))[0];
        if (hex) texto = hex.getAttribute('data-pbp-tip') + ' — ' + el.getAttribute('data-pbp-zona') + ' · ' + (NOMBRES_ZONA[el.getAttribute('data-pbp-zona')] || '');
      }
      t.textContent = texto;
      const caja = nodo.getBoundingClientRect();
      t.style.left = Math.max(0, Math.min(ev.clientX - caja.left + 12, caja.width - 240)) + 'px';
      t.style.top = (ev.clientY - caja.top + 14) + 'px';
      t.hidden = false;
    });
    nodo.addEventListener('mouseleave', () => { tooltip(nodo).hidden = true; });
  }

  /* Al imprimir se abren todas las secciones: un <details> cerrado no sale
     en el papel. Se devuelven como estaban. */
  if (typeof window !== 'undefined' && window.addEventListener && typeof document !== 'undefined') {
    let cerradas = [];
    window.addEventListener('beforeprint', () => {
      cerradas = Array.prototype.slice.call(document.querySelectorAll('.pbp-bloque details:not([open])'));
      cerradas.forEach(d => d.setAttribute('open', ''));
    });
    window.addEventListener('afterprint', () => { cerradas.forEach(d => d.removeAttribute('open')); cerradas = []; });
  }

  return {
    CAPA, NOMBRES_ZONA, FAMILIAS, ZONAS, GEOMETRIA, MIN_LIGA_HEX,
    html, mapaCard, jugador, mapa, capaTiros, geometriaZonas, zonaGeometrica,
    diagnosticoZonas, diagnosticoJugador, cruceZonas, marcasDiagnostico, lecturaTactica, colorDelta, varaHex,
    activa, espacio, espacioJugador, montarPendientes, activar, apellido, _cache: cache,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PBP;
