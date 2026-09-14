/* =====================================================================
   SGADD · Play-by-play · quintetos, tiro, rotaciones, momentum y clutch
   (LABORATORIO)

   Punto 62 de CLAUDE.md. Los datos NO salen del libro: los arma
   `motorstats-ingestion` desde el play-by-play oficial de cada partido y
   los sirve `/api/v1/pbp`, que es donde vive el guard de la capa.

   Tres partes, como el resto del proyecto:

     html · jugador · mapa · diagnostico · cruceZonas · lecturaTactica
                           PURAS: se testean en Node sin DOM.
     montarPendientes(raiz) busca los `.pbp-montaje` que dejó una sección,
                           pide el paquete y lo pinta.
     activar(nodo)         la interactividad: fila de zona <-> polígono de la
                           cancha, tooltip y conmutadores del mapa. Por
                           delegación en el bloque, así sobrevive a repintar
                           el mapa entero.

   LO QUE HAY QUE RESPETAR
   · La capa es de LABORATORIO: pestaña, card y mapa del jugador se ofrecen
     solo si el servidor declara `pbp` en `alcance.capas`.
   · NET POR POSESIÓN PRIMERO en quintetos: PLAYS castiga al que gana el
     rebote ofensivo (el titular de Jujuy da +7,6 por posesión y −2,2 por
     PLAYS en fase regular).
   · El «vs liga» del mapa es PUNTOS POR TIRO contra la liga EN ESE LUGAR,
     no el %: un hexágono al borde del arco mezcla dobles y triples y el %
     los compararía como si valieran igual. Si la liga tiró ahí menos de 15
     veces, la vara es la familia de tiro dominante de ese hexágono.
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

  /* Las 14 zonas de la plataforma en metros de media cancha [fondo, lateral],
     convertidas desde el SVG oficial de la página de partido con la
     calibración de motorstats-ingestion/src/cancha.js (salida/zonas-metros.json). */
  const ZONAS_GEO = {"Z1":[[0,9.2],[0.05,9.4],[0.2,9.5],[0.25,9.55],[0.45,9.65],[0.5,9.7],[0.65,9.75],[0.75,9.85],[1,9.9],[1.15,9.95],[1.3,9.95],[1.45,9.95],[1.7,9.95],[1.9,9.95],[2.05,9.9],[2.25,9.85],[2.4,9.8],[2.55,9.75],[2.6,9.7],[2.9,9.5],[3.25,9.25],[3.45,9.05],[3.6,8.8],[3.65,8.7],[3.75,8.45],[3.8,8.3],[3.9,8.1],[3.9,8],[3.95,7.7],[3.95,7.25],[3.9,7.15],[3.9,7.05],[3.85,6.85],[3.8,6.7],[3.7,6.45],[3.5,6.1],[3.4,5.95],[3.3,5.85],[3.25,5.8],[3.15,5.7],[3.05,5.6],[3,5.6],[2.95,5.55],[2.85,5.45],[2.7,5.4],[2.5,5.3],[2.4,5.25],[2.25,5.2],[2,5.1],[1.85,5.05],[1.7,5.05],[1.35,5.05],[1.25,5.05],[1,5.1],[0.7,5.25],[0.5,5.35],[0.2,5.5],[0,5.75],[0,9.2]],"Z2":[[5.75,9.95],[5.55,10.25],[5.3,10.6],[4.95,11],[4.5,11.4],[4,11.7],[3.55,11.95],[2.95,12.2],[2.5,12.3],[2.1,12.4],[1.7,12.4],[1,12.35],[0.6,12.25],[0.2,12.15],[0,12.05],[0,11.95],[0,11.1],[0,9.75],[0,9.2],[0.2,9.5],[0.4,9.65],[0.75,9.8],[1.1,9.95],[1.45,9.95],[1.9,9.95],[2.25,9.85],[2.55,9.75],[2.85,9.55],[3.2,9.25],[3.45,9.05],[3.6,8.8],[5.75,9.95]],"Z3":[[5.8,5.15],[5.9,5.35],[6,5.65],[6.05,5.85],[6.1,5.9],[6.1,5.95],[6.1,6],[6.15,6.1],[6.15,6.15],[6.15,6.2],[6.2,6.3],[6.2,6.4],[6.25,6.5],[6.3,7],[6.35,7.25],[6.35,7.7],[6.3,8.2],[6.25,8.4],[6.25,8.6],[6.1,8.95],[6.05,9.3],[5.9,9.65],[5.8,9.9],[5.75,9.95],[5.7,9.95],[3.6,8.8],[3.65,8.7],[3.8,8.45],[3.9,8.05],[3.95,7.65],[3.95,7.35],[3.9,7.05],[3.8,6.7],[3.7,6.45],[3.6,6.25],[3.7,6.2],[4,6.05],[5.25,5.35],[5.75,5.1],[5.8,5.15]],"Z4":[[0,5.75],[0.2,5.5],[0.6,5.3],[0.95,5.1],[1.3,5.05],[1.85,5.05],[2.15,5.15],[2.45,5.25],[2.8,5.45],[3.05,5.6],[3.25,5.8],[3.45,6],[3.6,6.25],[5.75,5.05],[5.7,5],[5.5,4.75],[5.25,4.45],[4.95,4.1],[4.75,3.85],[4.45,3.65],[4.3,3.55],[4.15,3.45],[3.7,3.2],[3.3,3],[2.8,2.8],[2.7,2.8],[2.35,2.7],[1.95,2.65],[1.5,2.65],[0.9,2.7],[0.4,2.85],[0,3.05],[0,5.75]],"Z5":[[4.25,11.55],[4.05,11.7],[4,11.7],[3.55,11.95],[2.9,12.2],[2.5,12.3],[2.1,12.4],[1.7,12.4],[1.6,12.35],[1,12.35],[0.55,12.25],[0.45,12.25],[0.2,12.15],[0,12.05],[0,11.95],[0,14.1],[0.85,14.1],[2.3,14.1],[2.85,14.1],[3.25,14.05],[3.45,14],[3.65,13.95],[3.9,13.85],[4.3,13.7],[4.55,13.6],[5.1,13.35],[5.3,13.2],[5.55,13.05],[4.45,11.4],[4.25,11.55]],"Z6":[[6.05,9.25],[6,9.3],[5.9,9.55],[5.8,9.85],[5.75,9.95],[5.75,10],[5.6,10.2],[5.35,10.5],[5.3,10.6],[5.25,10.65],[5.1,10.85],[4.95,11],[4.7,11.2],[4.45,11.4],[5.55,13.05],[5.7,12.95],[6,12.7],[6.4,12.35],[6.85,11.9],[7.25,11.35],[7.55,10.8],[7.8,10.3],[8.05,9.6],[6.1,9],[6.05,9.25]],"Z7":[[6.15,6.2],[6.25,6.5],[6.25,6.65],[6.3,7],[6.35,7.25],[6.35,7.55],[6.35,7.7],[6.3,8.05],[6.25,8.4],[6.25,8.6],[6.1,9],[8.05,9.6],[8.05,9.45],[8.15,9.15],[8.2,8.85],[8.25,8.65],[8.3,8.45],[8.3,8.3],[8.3,8.15],[8.3,7.9],[8.3,7.55],[8.3,7.1],[8.3,7],[8.3,6.95],[8.2,6.5],[8.15,6],[8,5.45],[6.1,6],[6.15,6.2]],"Z8":[[5.75,2.15],[6.05,2.45],[6.5,2.85],[6.9,3.25],[7.25,3.8],[7.55,4.3],[7.85,5],[8,5.45],[6.1,6],[6.05,5.8],[5.9,5.4],[5.9,5.35],[5.8,5.2],[5.75,5.05],[5.45,4.7],[5.25,4.45],[5.05,4.2],[4.95,4.1],[4.75,3.85],[4.45,3.65],[5.5,2],[5.75,2.15]],"Z9":[[0,0.9],[2.9,0.9],[3.2,0.95],[3.6,1.05],[3.85,1.15],[4.25,1.3],[4.7,1.5],[4.9,1.6],[4.95,1.65],[5.1,1.75],[5.5,2],[4.45,3.65],[4.3,3.55],[4,3.35],[3.65,3.15],[3.3,3],[2.8,2.8],[2.4,2.7],[1.95,2.7],[1.4,2.7],[0.9,2.7],[0.4,2.85],[0,3.05],[0,0.9]],"Z10":[[0,15],[4,15],[4,13.8],[3.7,13.95],[3.3,14.05],[2.85,14.1],[0,14.1],[0,15]],"Z11":[[13.9,3.65],[13.75,15],[4,15],[4,13.8],[4.3,13.7],[5.05,13.35],[5.65,13],[5.95,12.75],[6.4,12.4],[6.85,11.9],[7.25,11.4],[7.35,11.2],[7.5,10.9],[7.65,10.65],[7.8,10.35],[7.8,10.25],[7.9,10.05],[8,9.75],[8,9.7],[13.9,3.65]],"Z12":[[8.1,5.8],[8.15,6],[8.15,6.05],[8.2,6.5],[8.3,7],[8.3,7.65],[8.3,8.15],[8.25,8.65],[8.15,9.15],[8.05,9.45],[8.05,9.6],[8,9.7],[13.9,3.65],[13.9,11.2],[7.95,5.3],[8.1,5.8]],"Z13":[[13.9,15],[4,0],[4,1.2],[4.25,1.3],[4.8,1.55],[5.25,1.8],[5.75,2.15],[6.05,2.45],[6.45,2.8],[6.5,2.85],[6.65,3],[6.85,3.2],[6.9,3.25],[6.9,3.3],[7.1,3.6],[7.25,3.8],[7.35,3.95],[7.5,4.25],[7.55,4.35],[7.85,5],[7.95,5.3],[13.7,3.75],[13.9,15]],"Z14":[[0,0],[0,0.9],[2.85,0.9],[3.15,0.95],[3.6,1.05],[4,1.2],[4,0],[0,0]]};

  const NOMBRES_ZONA = {
    Z1: 'Bajo el aro', Z2: 'Corta izquierda', Z3: 'Corta frontal', Z4: 'Corta derecha',
    Z5: 'Media fondo izquierdo', Z6: 'Media ala izquierda', Z7: 'Media frontal', Z8: 'Media ala derecha',
    Z9: 'Media fondo derecho', Z10: 'Triple esquina izquierda', Z11: 'Triple ala izquierda', Z12: 'Triple frontal',
    Z13: 'Triple ala derecha', Z14: 'Triple esquina derecha',
    'FRANJA-SUPERIOR': 'Fuera de las líneas', 'FRANJA-INFERIOR': 'Fuera de las líneas',
  };
  const FAMILIAS = [
    { id: 'aro', label: 'Bajo el aro' },
    { id: 'corta', label: 'Media corta' },
    { id: 'mediaLateral', label: 'Media lateral' },
    { id: 'mediaFrontal', label: 'Media frontal' },
    { id: 'tripleEsquina', label: 'Triple esquina' },
    { id: 'tripleLateral', label: 'Triple lateral' },
    { id: 'tripleFrontal', label: 'Triple frontal' },
  ];

  /* ------------------------------------------------------------ formato */

  const esc = (v) => String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = (v, dec) => (v === null || v === undefined || !isFinite(v) ? '—'
    : Number(v).toFixed(dec === undefined ? 1 : dec).replace('.', ','));
  const signo = (v, dec) => (v === null || v === undefined || !isFinite(v) ? '—'
    : (v > 0 ? '+' : '') + num(v, dec === undefined ? (Number.isInteger(v) ? 0 : 1) : dec));
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
    /* 480 celdas: sin <title> y con el color en el grupo, o esto solo pesa
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

  /* --------------------------------------------------------- mapa (PURO) */

  /* 10 unidades = 1 m. X espejada: la derecha del atacante, a la derecha. */
  const X = (lateral) => ((15 - lateral) * 10).toFixed(1);
  const Y = (fondo) => (fondo * 10).toFixed(1);

  function lineasCancha() {
    const union = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
    return `<g class="pbp-lineas" fill="none" stroke="#6b7280" stroke-width="0.8" pointer-events="none">
      <rect x="0" y="0" width="150" height="140"/>
      <rect x="${X(7.5 + 2.45)}" y="0" width="49" height="58"/>
      <circle cx="75" cy="15.75" r="2.25"/>
      <line x1="${X(0.9)}" y1="0" x2="${X(0.9)}" y2="${Y(union)}"/>
      <line x1="${X(14.1)}" y1="0" x2="${X(14.1)}" y2="${Y(union)}"/>
      <path d="M ${X(0.9)} ${Y(union)} A 67.5 67.5 0 0 1 ${X(14.1)} ${Y(union)}"/>
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
    return z ? z.ppt : null;
  }

  /** Qué conjunto de tiros se dibuja: el equipo, lo que le tiran, o un jugador (por id). */
  function sujetoTiros(paq, sujeto) {
    const d = paq.tiros && paq.tiros.detalle;
    if (!d) return null;
    if (sujeto === 'contra') return d.contra;
    if (sujeto && sujeto !== 'equipo') return (d.jugadores || []).find(j => String(j.id) === String(sujeto)) || null;
    return d.favor;
  }

  /**
   * El mapa de tiro. PURO: conmutadores, SVG y tabla de zonas enlazada.
   * @param {{sujeto?: string, vista?: 'hex'|'zonas', metrica?: 'eficiencia'|'frecuencia'}} opciones
   */
  function mapa(paq, opciones) {
    const o = Object.assign({ sujeto: 'equipo', vista: 'hex', metrica: 'eficiencia' }, opciones);
    const s = sujetoTiros(paq, o.sujeto);
    if (!s) return vacio('Sin tiros suficientes para dibujar el mapa.');
    const hexes = s.hex || [];
    const totalI = hexes.reduce((a, h) => a + h[2], 0) || 1;
    const zonas = (s.zonas || []).filter(z => z.i > 0);
    const zonaPorId = {};
    zonas.forEach((z) => { zonaPorId[z.zona] = z; });
    const indiceLiga = new Map(((paq.liga || {}).hex || []).map(h => [h[0] + ',' + h[1], h]));
    const frecuencia = o.metrica === 'frecuencia';

    let capa = '';
    if (o.vista === 'hex') {
      const maxI = Math.max.apply(null, hexes.map(h => h[2]).concat([1]));
      capa = hexes.map(([q, r, i, c, p]) => {
        const lateral = HEX_R * Math.sqrt(3) * (q + r / 2);
        const fondo = HEX_R * 1.5 * r;
        if (fondo < -0.4 || fondo > 14.2 || lateral < -0.4 || lateral > 15.4) return '';
        const vara = varaHex(paq, q, r, indiceLiga);
        const ppt = i ? p / i : null;
        const delta = ppt !== null && vara.ppt !== null ? ppt - vara.ppt : null;
        const escala = frecuencia ? 1 : (0.35 + 0.65 * Math.sqrt(i / maxI));
        const rad = HEX_R * 10 * escala * 0.97;
        const cx = (15 - lateral) * 10, cy = fondo * 10;
        const pts = [0, 1, 2, 3, 4, 5].map((k) => {
          const a = Math.PI / 180 * (60 * k - 30);
          return (cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1);
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
    const poligonos = ZONAS_GEO ? Object.keys(ZONAS_GEO).map((zona) => {
      const z = zonaPorId[zona];
      const pts = ZONAS_GEO[zona].map(([fondo, lateral]) => X(lateral) + ',' + Y(fondo)).join(' ');
      let fill = 'transparent', fop = '0';
      let tip = zona + ' · ' + NOMBRES_ZONA[zona] + ' · sin tiros';
      if (z) {
        const vara = varaZona(paq, zona);
        const delta = z.ppt !== null && vara !== null ? z.ppt - vara : null;
        tip = zona + ' · ' + NOMBRES_ZONA[zona] + ' · ' + z.c + '/' + z.i + ' (' + num(z.pct) + ' %) · ' + num(z.ppt, 2)
          + ' pts por tiro · liga ' + num(vara, 2) + ' · ' + num(100 * z.i / totalI) + ' % de los tiros';
        if (o.vista === 'zonas') {
          fill = frecuencia ? 'var(--acento, #f7941e)' : colorDelta(delta);
          fop = frecuencia ? (0.1 + 0.9 * Math.sqrt(z.i / maxZona)).toFixed(2) : '0.85';
        }
      }
      return `<polygon class="pbp-zona" points="${pts}" data-pbp-zona="${zona}" style="fill:${fill};fill-opacity:${fop}" data-pbp-tip="${esc(tip)}"><title>${esc(tip)}</title></polygon>`;
    }).join('') : '';

    const boton = (clave, valor, texto) => `<button type="button" class="pbp-toggle" data-pbp-accion="${clave}:${valor}" aria-pressed="${o[clave] === valor ? 'true' : 'false'}">${texto}</button>`;
    const muestra = (d) => `<span class="pbp-muestra" style="background:${colorDelta(d)}"></span>`;
    const leyenda = frecuencia
      ? '<span class="dato-sec">Intensidad = porción de los tiros que salen de ahí.</span>'
      : `<span class="whitespace-nowrap">${muestra(-0.3)} peor que la liga</span>
         <span class="whitespace-nowrap">${muestra(0)} igual</span>
         <span class="whitespace-nowrap">${muestra(0.3)} mejor</span>
         <span class="dato-sec">${o.vista === 'hex' ? 'Tamaño = volumen. ' : ''}Color = puntos por tiro contra la liga en ese lugar.</span>`;

    const filas = zonas.slice().sort((a, b) => b.i - a.i).map((z) => {
      const vara = varaZona(paq, z.zona);
      const delta = z.ppt !== null && vara !== null ? Math.round((z.ppt - vara) * 100) / 100 : null;
      return `<tr class="pbp-fila-zona border-b border-hairline/40 last:border-0" data-pbp-zona="${esc(z.zona)}" tabindex="0"
          aria-label="${esc(z.zona + ' ' + (NOMBRES_ZONA[z.zona] || ''))}: resaltar en la cancha">
        <td class="px-2 py-1 text-left text-xs whitespace-nowrap">${esc(z.zona)} <span class="dato-sec">· ${esc(NOMBRES_ZONA[z.zona] || '')}</span></td>
        <td class="${TD}">${z.c}/${z.i}</td>
        <td class="${TD}">${num(z.pct)}</td>
        <td class="${TD}">${num(z.ppt, 2)}</td>
        <td class="${TD} font-semibold" style="color:${colorDelta(delta)}">${signo(delta, 2)}</td>
        <td class="${TD} dato-sec">${num(100 * z.i / totalI)}</td>
      </tr>`;
    }).join('');

    return `<div class="pbp-mapa-caja" data-pbp-sujeto="${esc(o.sujeto)}" data-pbp-vista="${o.vista}" data-pbp-metrica="${o.metrica}">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        ${boton('vista', 'hex', 'Hexágonos')}${boton('vista', 'zonas', 'Zonas')}
        <span class="text-muted" aria-hidden="true">·</span>
        ${boton('metrica', 'eficiencia', 'Eficiencia vs liga')}${boton('metrica', 'frecuencia', 'Frecuencia')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div>
          <svg class="pbp-mapa w-full max-w-md" viewBox="-4 -4 158 148" role="img" aria-label="Mapa de tiros de campo">
            ${capa}${poligonos}${lineasCancha()}
          </svg>
          <div class="pbp-leyenda text-[10px] mt-1">${leyenda}</div>
        </div>
        <div>
          <div class="scrollbox"><table class="w-full">
            <thead><tr class="${TH}">
              <th class="px-2 pb-1 text-left">Zona</th><th class="px-2 pb-1">C/I</th><th class="px-2 pb-1">%</th>
              <th class="px-2 pb-1" title="Puntos por tiro de campo">PPT</th><th class="px-2 pb-1" title="PPT menos el de la liga en esa zona">vs liga</th>
              <th class="px-2 pb-1">% tiros</th></tr></thead>
            <tbody>${filas}</tbody></table></div>
          <p class="text-[11px] text-muted mt-2 no-imprimir">Pasá el mouse o tocá una fila: la zona se ilumina en la cancha, y al revés. Tocar fija el resaltado.</p>
        </div>
      </div>
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
    }).join('')}${lineasCancha()}</svg>`;
  }

  /* --------------------------------------------------- diagnóstico (PURO) */

  const ratio = (a, b) => (a && b && isFinite(a.ppt) && b.ppt ? a.ppt / b.ppt : null);

  /** Ataque y defensa por familia de tiro, contra la liga. PURA. */
  function diagnostico(paq) {
    const d = paq.tiros && paq.tiros.detalle;
    const liga = paq.liga || {};
    if (!d || !liga.familias) return null;
    const total = (lado) => FAMILIAS.reduce((a, f) => a + ((d[lado].familias[f.id] || {}).i || 0), 0) || 1;
    const totF = total('favor'), totC = total('contra');
    const ejes = FAMILIAS.map((f) => {
      const favor = d.favor.familias[f.id] || null, contra = d.contra.familias[f.id] || null, lg = liga.familias[f.id] || null;
      return {
        id: f.id, label: f.label, favor, contra, liga: lg,
        ataque: ratio(favor, lg), defensa: ratio(contra, lg),
        volAtaque: favor ? favor.i / totF : 0, volDefensa: contra ? contra.i / totC : 0,
      };
    });
    /* Con volumen: 30 tiros y 3 % del total. Una familia con 12 tiros que
       rinde 1,4 no es una zona a explotar, es una racha. */
    const explotar = ejes.filter(e => e.ataque !== null && e.ataque >= 1.05 && e.volAtaque >= 0.03 && e.favor.i >= 30)
      .sort((a, b) => b.ataque - a.ataque);
    const liberadas = ejes.filter(e => e.defensa !== null && e.defensa >= 1.05 && e.volDefensa >= 0.03 && e.contra.i >= 30)
      .sort((a, b) => b.defensa - a.defensa);
    return { ejes, explotar, liberadas };
  }

  /**
   * El cruce de scouting. PURA.
   * atacar: familias donde el equipo PROPIO rinde por encima de la liga y el
   *         rival concede por encima de la liga.
   * cerrar: familias donde el RIVAL rinde por encima de la liga y el propio
   *         concede por encima de la liga.
   */
  function cruceZonas(paqRival, paqPropio) {
    const r = diagnostico(paqRival), p = diagnostico(paqPropio);
    if (!r || !p) return null;
    const atacar = [], cerrar = [];
    FAMILIAS.forEach((f) => {
      const er = r.ejes.find(e => e.id === f.id), ep = p.ejes.find(e => e.id === f.id);
      if (ep.ataque >= 1 && er.defensa >= 1 && ep.favor && er.contra && ep.favor.i >= 30 && er.contra.i >= 30) {
        atacar.push({ id: f.id, label: f.label, propio: ep.ataque, rival: er.defensa, indice: ep.ataque * er.defensa });
      }
      if (er.ataque >= 1 && ep.defensa >= 1 && er.favor && ep.contra && er.favor.i >= 30 && ep.contra.i >= 30) {
        cerrar.push({ id: f.id, label: f.label, rival: er.ataque, propio: ep.defensa, indice: er.ataque * ep.defensa });
      }
    });
    return { atacar: atacar.sort((a, b) => b.indice - a.indice), cerrar: cerrar.sort((a, b) => b.indice - a.indice) };
  }

  function radar(diag) {
    const n = diag.ejes.length, R = 70, C = 95;
    /* Escala 0,6 a 1,4 de la liga: afuera de eso no hay lectura distinta. */
    const pos = (i, v) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n;
      const k = Math.max(0, Math.min(1, ((v === null ? 1 : v) - 0.6) / 0.8));
      return (C + R * k * Math.cos(a)).toFixed(1) + ',' + (C + R * k * Math.sin(a)).toFixed(1);
    };
    const anillo = (v, trazo) => `<polygon points="${diag.ejes.map((e, i) => pos(i, v)).join(' ')}" fill="none" stroke="${trazo}" stroke-width="${v === 1 ? 1.2 : 0.6}"${v === 1 ? '' : ' stroke-dasharray="2 2"'}/>`;
    const serie = (clave, color) => `<polygon points="${diag.ejes.map((e, i) => pos(i, e[clave])).join(' ')}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5"/>`;
    const etiquetas = diag.ejes.map((e, i) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / n;
      const x = C + (R + 12) * Math.cos(a), y = C + (R + 12) * Math.sin(a);
      const ancla = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="7.5" fill="#cbd5e1" text-anchor="${ancla}" dominant-baseline="middle">${esc(e.label)}</text>`;
    }).join('');
    return `<svg class="pbp-radar w-full max-w-xs" viewBox="-30 0 250 190" role="img" aria-label="Puntos por tiro por familia de tiro, contra la liga">
      ${anillo(0.8, '#475569')}${anillo(1, '#94a3b8')}${anillo(1.2, '#475569')}
      ${serie('ataque', '#16a34a')}${serie('defensa', '#dc2626')}${etiquetas}</svg>
      <p class="text-[10px] mt-1"><span style="color:#16a34a">■</span> ataque: sus puntos por tiro / liga ·
        <span style="color:#dc2626">■</span> defensa: lo que concede / liga · anillo gris = la liga</p>`;
  }

  function bloqueDiagnostico(paq, paqPropio) {
    const diag = diagnostico(paq);
    if (!diag) return vacio('Sin datos de tiro por zona.');
    const item = (e, clave, lado) => `<li class="text-xs leading-snug mb-1"><b class="text-white">${esc(e.label)}</b>
      <span class="font-mono whitespace-nowrap">${num(e[lado].ppt, 2)} pts por tiro</span>
      <span class="dato-sec">(liga ${num(e.liga.ppt, 2)} · ×${num(e[clave], 2)} · ${num(100 * (clave === 'ataque' ? e.volAtaque : e.volDefensa))} % del volumen)</span></li>`;
    let cruce = '';
    const c = paqPropio && paqPropio !== paq ? cruceZonas(paq, paqPropio) : null;
    if (c) {
      const li = (x, ta, va, tb, vb) => `<li class="text-xs leading-snug mb-1"><b class="text-white">${esc(x.label)}</b>
        <span class="dato-sec">· ${ta} ×${num(va, 2)} · ${tb} ×${num(vb, 2)} de la liga</span></li>`;
      const nada = '<li class="text-xs text-muted">Ninguna familia donde coincidan las dos cosas.</li>';
      cruce = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
        <div>${subtitulo('Atacar ahí · ' + esc(paqPropio.equipo) + ' rinde y ' + esc(paq.equipo) + ' concede')}
          <ul>${c.atacar.length ? c.atacar.map(x => li(x, 'nuestro ataque', x.propio, 'lo que concede', x.rival)).join('') : nada}</ul></div>
        <div>${subtitulo('Cerrar ahí · ' + esc(paq.equipo) + ' rinde y ' + esc(paqPropio.equipo) + ' concede')}
          <ul>${c.cerrar.length ? c.cerrar.map(x => li(x, 'su ataque', x.rival, 'lo que concedemos', x.propio)).join('') : nada}</ul></div>
      </div>`;
    }
    return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div>${radar(diag)}</div>
      <div>
        ${subtitulo('Zonas a explotar · su ataque rinde más que la liga')}
        <ul>${diag.explotar.length ? diag.explotar.map(e => item(e, 'ataque', 'favor')).join('') : '<li class="text-xs text-muted">Ninguna familia con volumen rinde 5 % más que la liga.</li>'}</ul>
        <div class="mt-2">${subtitulo('Radar defensivo · dónde le tiran con eficiencia')}
        <ul>${diag.liberadas.length ? diag.liberadas.map(e => item(e, 'defensa', 'contra')).join('') : '<li class="text-xs text-muted">Ninguna familia con volumen concede 5 % más que la liga.</li>'}</ul></div>
      </div>
    </div>${cruce}`;
  }

  /* ------------------------------------------------------------- todo */

  /**
   * El bloque entero de un equipo. PURO.
   * @param {object} paq  `motorstats-ingestion/analitica-pbp-web@1` o `@2`
   * @param {{contexto?: 'equipo'|'scouting', propio?: object, sinMapa?: boolean}} opciones
   */
  function html(paq, opciones) {
    const o = opciones || {};
    if (!paq || !paq.esquema) return vacio('Sin análisis de play-by-play.');
    const p = paq.partidos || {};
    const excl = (p.excluidos || []).length
      ? ' Quedaron afuera ' + p.excluidos.length + ': ' + p.excluidos.map(x => esc(x.fecha) + ' vs ' + esc(x.rival) + ' (' + esc(x.motivo) + ')').join('; ') + '.'
      : '';
    const u = paq.umbrales || {};
    const v2 = !!(paq.tiros && paq.tiros.detalle);
    const trios = `<details class="pbp-detalle pbp-sub mt-3"><summary class="pbp-resumen text-[11px] uppercase tracking-wider text-muted cursor-pointer select-none">Tríos con más minutos</summary>${tablaCombos(paq, paq.trios, 'Trío')}</details>
      <details class="pbp-detalle pbp-sub mt-2"><summary class="pbp-resumen text-[11px] uppercase tracking-wider text-muted cursor-pointer select-none">Dúos con más minutos</summary>${tablaCombos(paq, paq.duos, 'Dúo')}</details>`;
    return `<div class="pbp-bloque" data-pbp-listo="1">
      <p class="text-[11px] text-muted">
        <b class="text-ink">Laboratorio</b> · ${esc(paq.competencia || '')} · play-by-play oficial,
        <b class="text-ink">${p.validados}/${p.jugados}</b> partidos validados (cinco en cancha siempre y minutos
        contra el box score).${excl}
      </p>
      ${seccion('clave', 'Quinteto inicial y de cierre', `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div>${subtitulo('Quinteto inicial')}${tablaClave(paq, paq.iniciales)}</div>
          <div>${subtitulo('Cierre · más minutos en los últimos 5\'')}${tablaClave(paq, paq.cierre && paq.cierre.ultimos5)}</div>
          <div>${subtitulo('Cierre · en cancha al final')}${tablaClave(paq, paq.cierre && paq.cierre.alFinal)}</div>
        </div>${v2 ? `<div class="mt-3">${subtitulo('Últimos 5 partidos · inicial contra cierre')}${tablaUltimos5(paq)}</div>` : ''}`, { abierta: true })}
      ${seccion('quintetos', 'Quintetos con más minutos', tablaCombos(paq, paq.quintetos, 'Quinteto') + trios,
        { abierta: true, nota: 'NET/pos: puntos a favor menos en contra cada 100 posesiones. Con ~ y atenuados, menos de '
          + (u[5] || 15) + ' minutos juntos: se muestran, pero todavía no dicen mucho.' })}
      ${v2 ? seccion('tactico', 'Motor táctico · puntos de fuga y combinaciones', bloqueTactico(paq),
        { nota: 'Solo combinaciones con muestra suficiente. Es una lectura de los números, no una orden: decide el cuerpo técnico.' }) : ''}
      ${v2 ? seccion('rotaciones', 'Rotaciones · minuto a minuto', heatmapRotaciones(paq)) : ''}
      ${v2 ? seccion('cuartos', 'Cuartos y momentum', bloqueCuartos(paq)) : ''}
      ${seccion('clutch', 'Clutch · quién decide los finales', bloqueClutch(paq),
        { abierta: true, nota: 'Últimos 5 minutos del 4.º cuarto o del suplementario con el partido a 5 o menos, medido antes de cada acción. Usos = PLAYS del motor.' })}
      ${o.sinMapa ? '' : seccion('mapa', 'Mapa de tiro', v2 ? mapa(paq, { sujeto: 'equipo' }) : mapaViejo(paq), { abierta: true })}
      ${v2 && !o.sinMapa ? seccion('mapa-contra', 'Mapa de tiro · lo que le tiran', mapa(paq, { sujeto: 'contra' })) : ''}
      ${v2 ? seccion('diagnostico', 'Diagnóstico ofensivo y defensivo', bloqueDiagnostico(paq, o.propio), { abierta: o.contexto === 'scouting' }) : ''}
    </div>`;
  }

  /**
   * El mapa de UN jugador, para la pestaña Tiro de su ficha. PURO.
   * Se busca por nombre normalizado en el paquete de su equipo.
   */
  function jugador(paq, nombre) {
    if (!paq || !paq.tiros || !paq.tiros.detalle) return vacio('El análisis de tiro por jugador todavía no está cargado para este equipo.');
    const id = Object.keys(paq.jugadores || {}).find(k => norm(paq.jugadores[k].n) === norm(nombre));
    const det = id ? (paq.tiros.detalle.jugadores || []).find(j => String(j.id) === String(id)) : null;
    if (!det) return vacio('Menos de 15 tiros de campo en los partidos validados: el mapa todavía no dice nada.');
    const vara = paq.liga && paq.liga.total ? paq.liga.total.ppt : null;
    return `<div class="pbp-bloque" data-pbp-listo="1">
      <p class="text-xs text-ink mb-2"><b>Laboratorio</b> · ${det.c}/${det.i} tiros de campo (${num(100 * det.c / det.i)} %) ·
        <b>${num(det.ppt, 2)}</b> puntos por tiro <span class="dato-sec">(liga ${num(vara, 2)})</span> · distancia mediana ${num(det.dist)} m ·
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

  /** El lugar del bloque de un equipo. `propio` suma el cruce de scouting. */
  function espacio(equipo, contexto, propio) {
    return `<div class="pbp-montaje" data-pbp-equipo="${esc(equipo)}" data-pbp-contexto="${esc(contexto || 'equipo')}"${propio ? ` data-pbp-propio="${esc(propio)}"` : ''}>
      ${cargando('Cargando el análisis de play-by-play…')}</div>`;
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

  /* El paquete pintado de cada bloque: los conmutadores del mapa repintan
     desde acá sin volver a pedir nada. */
  const paquetes = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function montarPendientes(raiz) {
    const r = raiz || (typeof document !== 'undefined' ? document : null);
    if (!r || !r.querySelectorAll) return;
    r.querySelectorAll('.pbp-montaje:not([data-pbp-montado])').forEach((nodo) => {
      nodo.setAttribute('data-pbp-montado', '1');
      const nombreJugador = nodo.getAttribute('data-pbp-jugador');
      const propio = nodo.getAttribute('data-pbp-propio');
      /* El paquete propio es opcional: sin él, el bloque sale igual y sin cruce. */
      Promise.all([pedir(nodo.getAttribute('data-pbp-equipo')), propio ? pedir(propio).catch(() => null) : null])
        .then(([paq, paqPropio]) => {
          if (!nodo.isConnected) return;
          nodo.innerHTML = nombreJugador ? jugador(paq, nombreJugador)
            : html(paq, { contexto: nodo.getAttribute('data-pbp-contexto'), propio: paqPropio });
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
    const cajaDe = (el) => el.closest('.pbp-mapa-caja');

    const encender = (ev) => {
      const el = cerca(ev, '[data-pbp-zona]');
      if (el) resaltarZona(cajaDe(el), el.getAttribute('data-pbp-zona'), true);
    };
    const apagar = (ev) => {
      const el = cerca(ev, '[data-pbp-zona]');
      if (!el) return;
      const caja = cajaDe(el);
      const zona = el.getAttribute('data-pbp-zona');
      /* Una zona FIJADA con un toque no se apaga al salir el mouse. */
      if (caja && caja.getAttribute('data-pbp-fija') === zona) return;
      resaltarZona(caja, zona, false);
    };
    nodo.addEventListener('mouseover', encender);
    nodo.addEventListener('mouseout', apagar);
    nodo.addEventListener('focusin', encender);
    nodo.addEventListener('focusout', apagar);

    nodo.addEventListener('click', (ev) => {
      const acc = cerca(ev, '[data-pbp-accion]');
      if (acc) {
        const caja = cajaDe(acc);
        const paq = paquetes && paquetes.get(nodo);
        if (!caja || !paq) return;
        const partes = acc.getAttribute('data-pbp-accion').split(':');
        const op = { sujeto: caja.getAttribute('data-pbp-sujeto'), vista: caja.getAttribute('data-pbp-vista'), metrica: caja.getAttribute('data-pbp-metrica') };
        op[partes[0]] = partes[1];
        caja.outerHTML = mapa(paq, op);
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
      if (antes === zona) caja.removeAttribute('data-pbp-fija');
      else { caja.setAttribute('data-pbp-fija', zona); resaltarZona(caja, zona, true); }
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
    CAPA, NOMBRES_ZONA, FAMILIAS, ZONAS_GEO, MIN_LIGA_HEX,
    html, jugador, mapa, diagnostico, cruceZonas, lecturaTactica, colorDelta, varaHex,
    activa, espacio, espacioJugador, montarPendientes, activar, apellido, _cache: cache,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PBP;
