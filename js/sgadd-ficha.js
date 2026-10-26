/* =====================================================================
   SGADD · Ficha individual del jugador (PDF) y Pack PLANTEL

   La cuarta exportación. Las otras hablan de EQUIPOS; esta es la hoja
   que el DT se lleva a la charla con UN jugador —o, con el Pack PLANTEL
   (2026-10-18), las de todo su plantel en un solo PDF—.

   Mismo enfoque que las otras: `window.print()` + `@media print`, nada de
   html2pdf/jsPDF (los canvas de Chart.js no rasterizan bien y los cortes
   de página quedan en el medio de las tablas). A4 VERTICAL: una ficha
   personal se imprime, se dobla y se lleva.

   ---------------------------------------------------------------------
   LA LISTA DE CARDS SALE DEL CÓDIGO DE LA VISTA, NO DE MEMORIA

   Cada bloque de la ficha del jugador lleva `data-subcard="<pestaña>.<id>"`
   en el render real (`jugadoresTabGeneral`, `jugadoresTabTiro` en
   sgadd-jugadores.js; el mapa y el reloj del play-by-play en
   sgadd-pbp.js). `estructura()` declara esos ids con sus nombres —los de
   las pestañas (`JUGADORES_TABS`) y los de las cartas
   (`JUGADORES_CARDS_REF`) salen de esas mismas constantes— y
   test-ficha-pdf.js exige que las marcas del fuente y la estructura
   coincidan en los dos sentidos: un bloque nuevo sin marca, o una marca
   sin declarar, rompe la suite.

   Los bloques NO se reescriben: se pide el mismo `jugadoresTab()` que
   pinta la pantalla y se PODA lo destildado (`podarHtml` sobre el texto,
   `podarDom` sobre lo que el play-by-play monta después). Se quita el
   nodo —no se esconde—, así que lo destildado no deja un hueco en la hoja.
   ===================================================================== */

const SGADD_FICHA = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc ? SGADD_UI.esc(v)
    : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs ? SGADD_UI.escJs(v) : String(v).replace(/'/g, "\\'"));

  /* ---------------------------------------------------------------------
     LA ESTRUCTURA · secciones (pestañas) y sus sub-cards
     --------------------------------------------------------------------- */
  const pbpActiva = () => typeof SGADD_PBP !== 'undefined' && !!SGADD_PBP.activa && !!SGADD_PBP.activa();
  function tabDe(id) {
    const t = (typeof JUGADORES_TABS !== 'undefined' ? JUGADORES_TABS : []).find(x => x.id === id);
    return t || { id: id, label: id, pregunta: '' };
  }
  function cartaDe(id, respaldo) {
    const c = (typeof JUGADORES_CARDS_REF !== 'undefined' ? JUGADORES_CARDS_REF : []).find(x => x.id === id);
    return c && c.label ? c.label : respaldo;
  }

  /**
   * Las cards y sub-cards de la ficha, en el orden de la pantalla. PURA
   * (lee constantes de sgadd-jugadores.js). Los bloques del play-by-play
   * llevan `pbp: true`: solo existen con la capa de laboratorio.
   */
  function estructura() {
    const sec = (id, extra) => Object.assign({ id: id, tab: id, label: tabDe(id).label, pregunta: tabDe(id).pregunta, subs: [] }, extra);
    return [
      sec('general', { pre: true, subs: [
        { id: 'general.adn', label: 'ADN · función en cancha, jerarquía y perfiles técnicos' },
        { id: 'general.sintesis', label: 'Síntesis · impacto, eficiencia y conclusión' },
        { id: 'general.condicion', label: 'Local y visitante' },
        { id: 'general.kpis', label: 'Indicadores clave · TS%, AST-PP, RT y PePP%' },
        { id: 'general.uso', label: cartaDe('uso', 'Uso e impacto') },
        { id: 'general.pases', label: cartaDe('pases', 'Pases y pérdidas') },
        { id: 'general.tablas', label: 'Marcador y contexto · otras estadísticas' },
      ] }),
      sec('tiro', { pre: true, subs: [
        { id: 'tiro.distribucion', label: 'Distribución del tiro por zona' },
        { id: 'tiro.carta', label: cartaDe('tiro', 'Tiro · volumen y eficiencia') },
        { id: 'tiro.graficos', label: 'Volumen y acierto por zona · gráficos' },
        { id: 'tiro.mapa', label: 'Mapa de tiro y diagnóstico · play-by-play', pbp: true },
        { id: 'tiro.reloj', label: 'Reloj de posesión · cuándo tira', pbp: true },
        { id: 'tiro.reloj-tramos', label: 'Perfil táctico por tramo del reloj · 1x1 o 5x5', pbp: true },
        { id: 'tiro.reloj-franjas', label: 'Cuándo y desde dónde tira · por franja', pbp: true },
      ] }),
      sec('evolucion', { pre: true, metricas: true }),
      /* El log va DESTILDADO: con 13 fechas se lleva media hoja y la charla
         arranca por el perfil, no por la planilla. */
      sec('partidos', { pre: false }),
    ];
  }

  /** Lo que el Pack PLANTEL suma arriba de las fichas: el TOP 3 del plantel,
      con una sub-card por dimensión del ranking (sgadd-jugadores.js). */
  function estructuraPack() {
    const grupos = typeof JUGADORES_RANKINGS !== 'undefined' ? JUGADORES_RANKINGS : [];
    return [{ id: 'top3', tab: null, pack: true, pre: true, label: 'TOP 3 del plantel',
      pregunta: 'Los líderes del equipo en cada dimensión', subs: grupos.map(g => ({ id: 'plantel.top3-' + g.id, label: g.titulo })) }];
  }

  /* ---------------------------------------------------------------------
     LA SELECCIÓN · { secciones, subs, metricas }. Se recuerda entre
     aperturas: el DT que arma su ficha a medida la quiere igual mañana.
     --------------------------------------------------------------------- */
  let seleccion = null;
  function seleccionPorDefecto(est) {
    const s = { secciones: {}, subs: {}, metricas: {} };
    (est || estructura()).forEach((x) => {
      s.secciones[x.id] = !!x.pre;
      x.subs.forEach((y) => { s.subs[y.id] = true; });
    });
    const enPantalla = (typeof JUGADORES !== 'undefined' && JUGADORES.metricaEvolucion) || 'PTS';
    (typeof JUGADORES_METRICAS_EVOLUCION !== 'undefined' ? JUGADORES_METRICAS_EVOLUCION : []).forEach((m) => { s.metricas[m.id] = m.id === enPantalla; });
    if (!Object.keys(s.metricas).some(k => s.metricas[k])) s.metricas.PTS = true;
    return s;
  }
  function elegidas() {
    if (!seleccion) seleccion = seleccionPorDefecto(estructuraPack().concat(estructura()));
    return seleccion;
  }
  /* Compatibilidad: quien leía la selección vieja (sección → sí/no). */
  const metricasElegidas = () => elegidas().metricas;

  /** Las sub-cards activas: tildadas y de una sección tildada. PURA. */
  function activos(sel, est) {
    const out = {};
    (est || estructura()).forEach((x) => {
      x.subs.forEach((y) => { out[y.id] = !!(sel.secciones[x.id] && sel.subs[y.id]); });
    });
    return out;
  }
  /** ¿La sección entra? Tildada y con algo adentro. PURA. */
  function seccionEntra(x, sel) {
    if (!sel.secciones[x.id]) return false;
    if (x.metricas) return Object.keys(sel.metricas || {}).some(k => sel.metricas[k]);
    return !x.subs.length || x.subs.some(y => sel.subs[y.id]);
  }

  /* ---------------------------------------------------------------------
     LA PODA · sin huecos: el bloque destildado se QUITA
     --------------------------------------------------------------------- */
  /** El índice donde termina el <div> que abre en `ini` (balanceando los div anidados). */
  function finDiv(html, ini) {
    const re = /<div\b|<\/div>/gi;
    re.lastIndex = ini;
    let n = 0, m;
    while ((m = re.exec(html))) {
      if (m[0][1] === '/') { n--; if (n === 0) return re.lastIndex; } else n++;
    }
    return html.length;
  }
  /**
   * Quita del HTML los `<div data-subcard="x">` que no están activos y los
   * `<div data-subcard-de="a b">` que se quedaron sin ninguno de sus hijos
   * activos. Una marca que no figura en `act` se CONSERVA: lo que no se
   * declaró no se puede destildar. PURA.
   */
  function podarHtml(html, act) {
    let s = String(html || '');
    const quitar = (re, sale) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        if (!sale(m[1])) continue;
        s = s.slice(0, m.index) + s.slice(finDiv(s, m.index));
        re.lastIndex = m.index;
      }
    };
    quitar(/<div\b[^>]*\bdata-subcard="([^"]+)"[^>]*>/g, id => Object.prototype.hasOwnProperty.call(act, id) && !act[id]);
    quitar(/<div\b[^>]*\bdata-subcard-de="([^"]+)"[^>]*>/g, (ids) => {
      const lista = ids.split(/\s+/).filter(Boolean);
      return lista.length && lista.every(id => Object.prototype.hasOwnProperty.call(act, id) && !act[id]);
    });
    return s;
  }
  /** La misma poda sobre el DOM, para lo que el play-by-play monta después.
      Como `podarHtml`, también se va el grupo que se quedó sin hijos activos
      (el bloque del reloj del Mapa de tiro del equipo, 2026-10-19). */
  function podarDom(raiz, act) {
    if (!raiz || !raiz.querySelectorAll) return;
    const sale = id => Object.prototype.hasOwnProperty.call(act, id) && !act[id];
    raiz.querySelectorAll('[data-subcard]').forEach((n) => {
      if (sale(n.getAttribute('data-subcard'))) n.remove();
    });
    raiz.querySelectorAll('[data-subcard-de]').forEach((n) => {
      const lista = String(n.getAttribute('data-subcard-de') || '').split(/\s+/).filter(Boolean);
      if (lista.length && lista.every(sale)) n.remove();
    });
  }

  /** Renombra los ids de los <canvas> con un prefijo (varias fichas en un documento). PURA. */
  const prefijarCanvas = (html, p) => String(html || '').replace(/(<canvas\b[^>]*?\sid=")([^"]+)"/g, (m, a, id) => a + p + id + '"');

  /* ---------------------------------------------------------------------
     EL ARMADO DE UN JUGADOR (individual y pack usan el mismo)
     --------------------------------------------------------------------- */
  function armarJugador(idx, j, sel, n) {
    const est = estructura();
    const act = activos(sel, est);
    const p = 'f' + (n || 0) + '-';
    const charts = (fn) => (typeof SGADD_CHARTS !== 'undefined' && SGADD_CHARTS.conPrefijo ? SGADD_CHARTS.conPrefijo(p, fn) : fn());
    const bloques = [];
    /* LA IDENTIDAD ES LA MISMA TARJETA DE LA PANTALLA (2026-10-09): foto,
       «#dorsal NOMBRE», jerarquía, badges y las cuatro tarjetas. Va siempre. */
    bloques.push(`
      <section class="informe-bloque ficha-identidad">
        ${jugadoresHeader(idx, j)}
        ${j.__califica ? '' : `<p class="ficha-aviso">~ ${esc(JUGADORES_MOTIVO_SIN_RESPALDO)}</p>`}
      </section>`);
    est.filter(x => seccionEntra(x, sel) && jugadoresTabDisponible(idx, j, x.tab)).forEach((x) => {
      /* La evolución no usa el tab entero: un gráfico por métrica elegida. */
      const cuerpo = x.metricas
        ? charts(() => JUGADORES_METRICAS_EVOLUCION.filter(m => sel.metricas[m.id])
          .map((m, i) => jugadoresBloqueEvolucion(idx, j, m.id, 'chFichaEvol' + i)).join(''))
        : podarHtml(charts(() => jugadoresTab(idx, j, x.tab)), act);
      if (!cuerpo || !String(cuerpo).trim()) return;
      bloques.push(`
        <section class="informe-bloque" data-bloque="${esc(x.id)}">
          <h2>${esc(x.label)}</h2>
          ${x.pregunta ? `<p class="informe-pregunta">${esc(x.pregunta)}</p>` : ''}
          ${cuerpo}
        </section>`);
    });
    return prefijarCanvas(bloques.join(''), p);
  }

  function cabecera(titulo) {
    const pl = SGADD_APP.planillaActual();
    const club = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : {};
    return `<header class="informe-cabecera ficha-cabecera ficha-emision">
        <p>${esc(titulo)} · Fecha de emisión: ${esc(SGADD_UI.fechaHoy())} · Competición: ${esc(pl ? pl.label : '—')}
           ${club.nombre ? '· ' + esc(club.nombre) : ''}</p>
        ${(SGADD_APP.textoMuestra && SGADD_APP.textoMuestra({ jugadores: true })) ? `<p>${esc(SGADD_APP.textoMuestra({ jugadores: true }))}</p>` : ''}
      </header>`;
  }

  /** La ficha individual (lo que imprime «Ficha en PDF»). */
  function armar(idx, j) {
    return cabecera('Ficha del jugador') + armarJugador(idx, j, elegidas(), 0)
      + `<footer class="informe-pie">${SGADD_UI.pieInforme(SGADD_UI.fechaHoy())}</footer>`;
  }

  /** El pack: una ficha por jugador, cada una desde una hoja nueva. */
  function armarPack(idx, jugadores, sel, equipo) {
    /* El TOP 3 del plantel abre el pack, con las sub-cards que se eligieron. */
    const ep = estructuraPack();
    const clave = jugadores.length ? SGADD.claveEquipo(jugadores[0]['EQUIPO']) : null;
    const top3 = seccionEntra(ep[0], sel) && typeof jugadoresBloqueTop3Plantel === 'function'
      ? podarHtml(jugadoresBloqueTop3Plantel(idx, clave), activos(sel, ep)) : '';
    const fichas = jugadores.map((j, n) => `<article class="ficha-jugador" data-jugador="${esc(j['NOMBRES'])}">
        ${armarJugador(idx, j, sel, n)}
      </article>`).join('');
    return cabecera('Pack PLANTEL · ' + equipo + ' · ' + jugadores.length + ' jugador' + (jugadores.length === 1 ? '' : 'es'))
      + (top3 ? `<section class="informe-bloque ficha-top3" data-bloque="top3">${top3}</section>` : '')
      + fichas + `<footer class="informe-pie">${SGADD_UI.pieInforme(SGADD_UI.fechaHoy())}</footer>`;
  }

  /* ---------------------------------------------------------------------
     EL ÁRBOL DE CHECKBOXES (lo usan el modal individual y el pack)
     --------------------------------------------------------------------- */
  function arbolHtml(sel, disponible, estArbol) {
    const est = estArbol || estructura();
    const pbp = pbpActiva();
    return est.map((x) => {
      const hay = disponible ? disponible(x) : true;
      const fila = `<label class="flex items-center gap-2.5 py-1.5 rounded px-2 -mx-2 transition-all duration-200 ${hay ? 'cursor-pointer hover:bg-surface2' : 'opacity-40'}">
          <input type="checkbox" data-sec="${esc(x.id)}" ${sel.secciones[x.id] && hay ? 'checked' : ''} ${hay ? '' : 'disabled'}
                 onchange="SGADD_FICHA.tocarSeccion(this)" class="w-4 h-4" style="accent-color:var(--acento)">
          <span class="text-sm text-white">${esc(x.label)}</span>
          ${x.pregunta ? `<span class="text-[10px] text-muted">${esc(x.pregunta)}</span>` : ''}
          ${hay ? '' : `<span class="text-[10px] text-muted">${esc(x.motivo || 'sin datos suficientes')}</span>`}
        </label>`;
      if (!hay) return fila;
      let hijos = '';
      if (x.metricas) {
        hijos = `<div class="flex items-center justify-between mb-1">
            <span class="text-[10px] uppercase tracking-wider text-muted font-display">Un gráfico por métrica</span>
            <span class="flex gap-2">
              <button type="button" onclick="SGADD_FICHA.marcarMetricas(true)" class="text-[10px] uppercase tracking-wider text-accent hover:underline">Todas</button>
              <button type="button" onclick="SGADD_FICHA.marcarMetricas(false)" class="text-[10px] uppercase tracking-wider text-muted hover:underline">Ninguna</button>
            </span></div>
          <div class="grid grid-cols-2 gap-x-2">${JUGADORES_METRICAS_EVOLUCION.map(m => `<label class="flex items-center gap-2 py-1 rounded px-2 cursor-pointer hover:bg-surface2">
              <input type="checkbox" data-met="${esc(m.id)}" data-de="${esc(x.id)}" ${sel.metricas[m.id] ? 'checked' : ''} class="w-3.5 h-3.5" style="accent-color:var(--acento)">
              <span class="text-xs text-muted">${esc(m.label)}</span></label>`).join('')}</div>`;
      } else if (x.subs.length) {
        hijos = x.subs.map((y) => {
          const ok = !y.pbp || pbp;
          return `<label class="flex items-center gap-2 py-1 rounded px-2 ${ok ? 'cursor-pointer hover:bg-surface2' : 'opacity-40'}">
              <input type="checkbox" data-sub="${esc(y.id)}" data-de="${esc(x.id)}" ${sel.subs[y.id] && ok ? 'checked' : ''} ${ok ? '' : 'disabled'} class="w-3.5 h-3.5" style="accent-color:var(--acento)">
              <span class="text-xs text-muted">${esc(y.label)}</span>
              ${ok ? '' : '<span class="text-[10px] text-muted">sin la capa de play-by-play</span>'}</label>`;
        }).join('');
      }
      return fila + (hijos ? `<div class="ml-6 pl-3 border-l border-hairline mt-1 mb-2" data-hijos="${esc(x.id)}">${hijos}</div>` : '');
    }).join('');
  }

  /** Tildar o destildar una sección arrastra a sus sub-cards. */
  function tocarSeccion(input) {
    const id = input && input.getAttribute('data-sec');
    if (!id || typeof document === 'undefined') return;
    document.querySelectorAll('[data-de="' + id + '"]').forEach((i) => { if (!i.disabled) i.checked = input.checked; });
  }
  function marcarMetricas(valor) {
    document.querySelectorAll('input[data-met]').forEach((i) => { i.checked = !!valor; });
  }
  /** Lee el árbol del modal a la selección. */
  function leerArbol(raiz) {
    const sel = elegidas();
    raiz.querySelectorAll('input[data-sec]').forEach((i) => { if (!i.disabled) sel.secciones[i.dataset.sec] = i.checked; });
    raiz.querySelectorAll('input[data-sub]').forEach((i) => { if (!i.disabled) sel.subs[i.dataset.sub] = i.checked; });
    raiz.querySelectorAll('input[data-met]').forEach((i) => { sel.metricas[i.dataset.met] = i.checked; });
    return sel;
  }

  /* La ficha y el Pack PLANTEL salen del índice de la pantalla: con una
     muestra activa, el recorte (punto 139). */
  function idxFicha() {
    return (typeof SGADD_APP.idxVista === 'function') ? SGADD_APP.idxVista({ jugadores: true }) : SGADD_APP.estado.idx;
  }

  /* ---------------------------------------------------------------------
     MODAL INDIVIDUAL
     --------------------------------------------------------------------- */
  function jugadorActual() {
    const idx = idxFicha();
    if (!idx || typeof JUGADORES === 'undefined' || !JUGADORES.jugador) return null;
    const j = jugadoresBuscar(idx, JUGADORES.jugador);
    return j ? { idx: idx, j: j } : null;
  }

  function modal(id, titulo, subtitulo, cuerpo, acciones) {
    const previo = document.getElementById(id);
    if (previo) previo.remove();
    const m = document.createElement('div');
    m.id = id;
    m.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    m.innerHTML = `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="SGADD_FICHA.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline p-5 w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="${id}Titulo">
        <h3 id="${id}Titulo" class="font-display uppercase tracking-wide text-sm text-accent mb-1">${titulo}</h3>
        <p class="text-xs text-muted mb-3">${subtitulo}</p>
        <div class="mb-4">${cuerpo}</div>
        <div class="modal-acciones flex flex-wrap gap-2 justify-end">${acciones}</div>
      </div>`;
    document.body.appendChild(m);
    document.addEventListener('keydown', escapar);
  }
  const boton = (texto, accion, principal) => `<button type="button" onclick="${accion}"
    class="text-xs uppercase tracking-wider px-3 py-2 rounded ${principal ? 'bg-accent text-base font-semibold' : 'border border-hairline hover:bg-surface2'}">${texto}</button>`;

  function abrir() {
    const ctx = jugadorActual();
    if (!ctx) return;
    /* Guard redundante con el de la sección, y a propósito: el PDF es una
       salida que se comparte fuera del panel. No es seguridad —ver la
       cabecera de `sgadd-auth.js`—. */
    if (!SGADD_AUTH.puedeVerEquipo(ctx.j && ctx.j['EQUIPO'])) return;
    modal('modalFicha', 'Ficha del jugador · PDF',
      esc(ctx.j['NOMBRES']) + ' · ' + esc(SGADD.limpiarNombre(ctx.j['EQUIPO'])) + ' · elegí cards y sub-cards',
      arbolHtml(elegidas(), x => jugadoresTabDisponible(ctx.idx, ctx.j, x.tab)),
      boton('Cancelar', 'SGADD_FICHA.cerrar()') + boton('Generar', 'SGADD_FICHA.generar()', true));
  }

  function escapar(e) { if (e.key === 'Escape') cerrar(); }
  function cerrar() {
    ['modalFicha', 'modalPack'].forEach((id) => { const m = document.getElementById(id); if (m) m.remove(); });
    document.removeEventListener('keydown', escapar);
  }

  function generar() {
    const ctx = jugadorActual();
    const m = document.getElementById('modalFicha');
    if (!ctx || !m) { cerrar(); return; }
    leerArbol(m);
    cerrar();
    imprimir(armar(ctx.idx, ctx.j), SGADD_UI.nombrePdf('jugador', { jugador: ctx.j['NOMBRES'] }), ctx.j['EQUIPO']);
  }

  /* ---------------------------------------------------------------------
     PACK PLANTEL · tres pasos en un modal: cards, jugadores, generar
     --------------------------------------------------------------------- */
  const pack = { clave: null, paso: 1, elegidos: {} };

  function plantelDe(idx, clave) {
    const lista = (idx && idx.liga && idx.liga.jugadoresPorEquipo && idx.liga.jugadoresPorEquipo.get(clave)) || [];
    return lista.slice().sort((a, b) => (Number(b['MIN']) || 0) - (Number(a['MIN']) || 0));
  }
  /**
   * Titular / sustituto, SOLO con el dato de la planilla (TITULAR del box
   * score, punto 97). Sin el dato, el jugador no es ni una cosa ni la otra:
   * el motor no infiere titularidad (punto 8). PURA con `fn` inyectable.
   * @returns {{titulares: Array, sustitutos: Array, conDato: number}}
   */
  function porTitularidad(lista, fn) {
    const t = fn || (typeof torneoTitularidad === 'function' ? torneoTitularidad : () => null);
    const titulares = [], sustitutos = [];
    lista.forEach((j) => {
      const r = t(j['NOMBRES'], j['EQUIPO']);
      if (!r || !r.partidos) return;
      (r.titular / r.partidos >= 0.5 ? titulares : sustitutos).push(j);
    });
    return { titulares, sustitutos, conDato: titulares.length + sustitutos.length };
  }

  function abrirPack(clave) {
    const idx = idxFicha();
    const lista = plantelDe(idx, clave);
    if (!lista.length) return;
    if (!SGADD_AUTH.puedeVerEquipo(lista[0]['EQUIPO'])) return;
    pack.clave = clave;
    pack.paso = 1;
    pack.elegidos = {};
    lista.forEach((j) => { pack.elegidos[jugadoresSlug(j)] = true; });
    pintarPack();
  }

  function pintarPack() {
    const idx = idxFicha();
    const lista = plantelDe(idx, pack.clave);
    const equipo = lista.length ? SGADD.limpiarNombre(lista[0]['EQUIPO']) : pack.clave;
    const pasos = `<p class="text-[10px] uppercase tracking-wider text-muted font-display mb-2">
      ${['1 · Cards', '2 · Jugadores', '3 · Generar'].map((t, i) => `<span class="${pack.paso === i + 1 ? 'text-accent' : ''}">${t}</span>`).join(' → ')}</p>`;
    let cuerpo = '', acciones = boton('Cancelar', 'SGADD_FICHA.cerrar()');
    if (pack.paso === 1) {
      cuerpo = pasos + arbolHtml(elegidas(), null, estructuraPack().concat(estructura()))
        + '<p class="text-[11px] text-muted mt-2">A cada jugador le entra lo que tenga datos: una pestaña sin datos suficientes se saltea en su ficha.</p>';
      acciones += boton('Siguiente', 'SGADD_FICHA.pasoPack(2)', true);
    } else if (pack.paso === 2) {
      const t = porTitularidad(lista);
      const sinDato = 'La planilla de esta categoría no trae la titularidad (TITULAR del box score): no se infiere.';
      const atajo = (texto, modo, ok) => `<button type="button" ${ok ? `onclick="SGADD_FICHA.atajoPack('${modo}')"` : `disabled title="${esc(sinDato)}"`}
        class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-hairline ${ok ? 'hover:bg-surface2 text-accent' : 'opacity-40'}">${texto}</button>`;
      cuerpo = pasos + `<div class="flex flex-wrap gap-2 mb-2" data-pack-atajos="1">
          ${atajo('Todos', 'todos', true)}${atajo('Ninguno', 'ninguno', true)}
          ${atajo('Titulares (' + t.titulares.length + ')', 'titulares', t.conDato > 0)}${atajo('Sustitutos (' + t.sustitutos.length + ')', 'sustitutos', t.conDato > 0)}
        </div>
        ${t.conDato ? '<p class="text-[10px] text-muted mb-2">Titular = arrancó la mitad o más de sus partidos, según la planilla.</p>' : `<p class="text-[10px] text-muted mb-2">${esc(sinDato)}</p>`}
        <div data-pack-jugadores="1">${lista.map((j) => {
          const r = typeof torneoTitularidad === 'function' ? torneoTitularidad(j['NOMBRES'], j['EQUIPO']) : null;
          return `<label class="flex items-center gap-2 py-1 rounded px-2 cursor-pointer hover:bg-surface2">
            <input type="checkbox" data-pack-jug="${esc(jugadoresSlug(j))}" ${pack.elegidos[jugadoresSlug(j)] ? 'checked' : ''} class="w-3.5 h-3.5" style="accent-color:var(--acento)">
            <span class="text-xs text-white">${esc(j['NOMBRES'])}</span>
            <span class="text-[10px] text-muted font-mono">${esc(SGADD.formatear('MIN', j['MIN']))} min${r ? ' · titular ' + r.titular + '/' + r.partidos : ''}</span></label>`;
        }).join('')}</div>`;
      acciones += boton('Atrás', 'SGADD_FICHA.pasoPack(1)') + boton('Siguiente', 'SGADD_FICHA.pasoPack(3)', true);
    } else {
      const n = lista.filter(j => pack.elegidos[jugadoresSlug(j)]).length;
      const secs = estructuraPack().concat(estructura()).filter(x => seccionEntra(x, elegidas())).map(x => x.label);
      cuerpo = pasos + `<p class="text-sm text-white mb-1" data-pack-resumen="1">${n} jugador${n === 1 ? '' : 'es'} · ${secs.length ? esc(secs.join(', ')) : 'ninguna card'}</p>
        <p class="text-[11px] text-muted">Un solo PDF: cada jugador arranca en una hoja nueva, en orden de minutos. Lo que un jugador no tiene se saltea, sin dejar huecos.</p>
        ${n && secs.length ? '' : '<p class="text-[11px] text-yellow-400 mt-2">Elegí al menos un jugador y una card.</p>'}`;
      acciones += boton('Atrás', 'SGADD_FICHA.pasoPack(2)') + (n && secs.length ? boton('Generar PDF', 'SGADD_FICHA.generarPack()', true) : '');
    }
    modal('modalPack', 'Pack PLANTEL · PDF', esc(equipo) + ' · ' + lista.length + ' jugadores', cuerpo, acciones);
  }

  function leerPack() {
    const m = document.getElementById('modalPack');
    if (!m) return;
    if (pack.paso === 1) leerArbol(m);
    if (pack.paso === 2) m.querySelectorAll('input[data-pack-jug]').forEach((i) => { pack.elegidos[i.dataset.packJug] = i.checked; });
  }
  function pasoPack(n) { leerPack(); pack.paso = n; pintarPack(); }
  function atajoPack(modo) {
    const lista = plantelDe(idxFicha(), pack.clave);
    const t = porTitularidad(lista);
    const set = modo === 'titulares' ? t.titulares : modo === 'sustitutos' ? t.sustitutos : modo === 'todos' ? lista : [];
    lista.forEach((j) => { pack.elegidos[jugadoresSlug(j)] = set.indexOf(j) !== -1; });
    pintarPack();
  }
  function generarPack() {
    leerPack();
    const idx = idxFicha();
    const lista = plantelDe(idx, pack.clave).filter(j => pack.elegidos[jugadoresSlug(j)]);
    cerrar();
    if (!lista.length) return;
    const equipo = SGADD.limpiarNombre(lista[0]['EQUIPO']);
    imprimir(armarPack(idx, lista, elegidas(), equipo), SGADD_UI.nombrePdf('plantel', { equipo: lista[0]['EQUIPO'] }), lista[0]['EQUIPO']);
  }

  /* ---------------------------------------------------------------------
     LA IMPRESIÓN (común)
     --------------------------------------------------------------------- */
  function imprimir(html, nombre, equipo) {
    const previo = document.getElementById('fichaSalida');
    if (previo) previo.remove();
    const salida = document.createElement('div');
    salida.id = 'fichaSalida';
    salida.innerHTML = html;
    document.body.appendChild(salida);
    /* La clase va ANTES de dibujar: los colores de Chart.js se resuelven al
       crear el gráfico (`modo-ficha-print` está en MODOS_PAPEL). */
    document.body.classList.add('modo-ficha-print');
    SGADD_UI.inyectarPieDeHoja('fichaSalida', null, equipo);
    if (typeof SGADD_CHARTS !== 'undefined') SGADD_CHARTS.dibujarPendientes();
    /* El mapa y el reloj del play-by-play llegan después: se ESPERAN (con
       tope de 5 s) y se podan con la misma selección. */
    const act = activos(elegidas());
    const mapa = (typeof SGADD_PBP !== 'undefined') ? SGADD_PBP.montarPendientes(salida) : Promise.resolve();
    const tope = new Promise(r => setTimeout(r, 5000));
    SGADD_UI.tituloPdf(nombre);
    Promise.race([Promise.resolve(mapa).catch(() => null), tope]).then(() => new Promise(r => setTimeout(r, 700))).then(() => {
      podarDom(salida, act);
      SGADD_UI.embeberImagenes('#fichaSalida');
      const alTerminar = () => {
        window.removeEventListener('afterprint', alTerminar);
        clearTimeout(respaldo);
        limpiar();
      };
      window.addEventListener('afterprint', alTerminar);
      const respaldo = setTimeout(alTerminar, 60000);
      window.print();
    });
  }

  function limpiar() {
    document.body.classList.remove('modo-ficha-print');
    SGADD_UI.quitarPieDeHoja('fichaSalida');
    SGADD_UI.restaurarImagenes('#fichaSalida');
    const s = document.getElementById('fichaSalida');
    if (s) s.remove();
    if (typeof jugadoresPintar === 'function') jugadoresPintar();
  }

  /* `SECCIONES` queda por compatibilidad: las secciones de la estructura. */
  return {
    get SECCIONES() { return estructura(); },
    estructura, estructuraPack, seleccionPorDefecto, elegidas, metricasElegidas, activos, seccionEntra,
    podarHtml, podarDom, prefijarCanvas, porTitularidad, plantelDe, arbolHtml,
    armar, armarJugador, armarPack,
    abrir, cerrar, generar, tocarSeccion, marcarMetricas,
    abrirPack, pasoPack, atajoPack, generarPack, _pack: pack,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_FICHA;
