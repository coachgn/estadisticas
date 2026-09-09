/* =====================================================================
   SGADD · EXPORTAR EL RANKING DEL PLANTEL A PDF

   Quinta exportación. Las otras cuatro (punto 7) hablan de UN equipo, de
   UN cruce o de UN jugador; ésta es la planilla del plantel entero, que
   es lo que el cuerpo técnico pega en la carpeta de la categoría.

   LA UNIDAD ES LA CARD, NO LA MÉTRICA SUELTA. Esto costó una vuelta y es
   el corazón del módulo:

   El ranking son OCHO cards (`JUGADORES_RANKINGS`) y **cada una tiene su
   propio ORDEN** — `PTS` en participación, `eFG%` en eficiencia, `RO` en
   rebotes, `AST-PP` en creación. Juntar las 35 métricas en una sola
   tabla no es una decisión de formato: colapsa ocho rankings distintos
   en uno, ordenado por un criterio, y el `#` deja de significar nada en
   los otros siete. El primero de «Rebotes» no es el primero de «Tiro de
   3», y ésa es justamente la pregunta que cada card contesta.

   Así que exportar «todas» son OCHO TABLAS, cada una con su título, su
   orden y su numeración. Adentro de cada una se pueden destildar
   columnas, que es el ajuste fino.

   LO QUE LA AUDITORÍA DEL CÓDIGO REAL DEVOLVIÓ:

     PJ MIN PTS PLAYS PPP +/-            participación y puntos   (orden PTS)
     USG% eFG% TS% RTL% + MIN PJ         eficiencia               (orden eFG%)
     TC% TCC TCI + MIN PJ PTS            tiro de campo            (orden TCI)
     PT2% T2% T2C T2I PPT2 + MIN         tiro de 2                (orden T2I)
     PT3% T3% T3C T3I PPT3 + MIN         tiro de 3                (orden T3I)
     PT1% T1% T1C T1I PPT1 + MIN         tiros libres             (orden T1I)
     RO RD RT + MIN                      rebotes                  (orden RO)
     AST-PP AST% FC FR + MIN             creación y disciplina    (orden AST-PP)

   NO EXISTEN acá: los Four Factors (son de equipo, viven en
   `PROMEDIOS 4F`), `PER` —que no está en `METRICAS` ni la escribe
   MotorStats— ni una tasa de rebote tipo `%REB`: el grupo de rebotes
   trae CUENTAS por partido (RO, RD, RT). Y `AST` a secas tampoco es
   columna de ninguna card; lo que hay es `AST-PP` y `AST%`.

   POR ESO EL EXPORT RENDERIZA SUS TABLAS en vez de esconder columnas del
   DOM: en pantalla se ve UNA card por vez, así que "ocultar las
   desmarcadas" solo podría llegar a esa. Cada tabla sale del MISMO motor
   (`jugadoresRanking`) con el mismo pool y la misma escala, que es lo que
   garantiza que el papel no pueda contradecir a la pantalla.
   ===================================================================== */
const SGADD_RANKPDF = (function () {
  'use strict';

  /* El corte que gira la hoja. Ninguna card llega a siete columnas, así
     que con la selección completa el documento sale vertical; la regla
     queda para el día que una card crezca o para el que quiera armarse
     una tabla ancha destildando de a poco. */
  const COLS_VERTICAL = 6;

  /* Los presets agrupan CARDS, que es la unidad. Los ids salen del
     catálogo y hay un test que falla si alguno deja de existir. */
  const PRESETS = [
    {
      id: 'basicas', label: 'Métricas básicas',
      ayuda: 'Lo que se lee de un vistazo: producción, cristal y creación.',
      cards: ['produccion', 'rebotes', 'creacion'],
    },
    {
      id: 'avanzadas', label: 'Métricas avanzadas',
      ayuda: 'Eficiencia y selección de tiro, zona por zona.',
      cards: ['eficiencia', 'tiro', 't2', 't3', 'libres'],
    },
    {
      id: 'todas', label: 'Seleccionar todas',
      ayuda: 'Las ocho cards, cada una como su propia tabla.',
      cards: null,   // se resuelve contra el catálogo vivo
    },
  ];

  const estado = {
    abierto: false,
    idx: null,
    /* `cards[id] = true` y `cols[id] = { clave: bool }`. Se guardan por
       separado porque son dos decisiones distintas: qué tablas entran, y
       qué columnas lleva cada una. */
    cards: null,
    cols: null,
    disparador: null,
  };

  const esc = (v) => (typeof SGADD_UI !== 'undefined' ? SGADD_UI.esc(v) : String(v == null ? '' : v));
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' ? SGADD_UI.escJs(v) : String(v == null ? '' : v));

  /* ===================================================================
     EL CATÁLOGO MANDA

     Si se copiara acá, una card nueva en `JUGADORES_RANKINGS` no
     aparecería en el modal y nadie se enteraría — es el bug del rol
     funcional (punto 8). Se lee en cada apertura.

     Y a diferencia de la versión anterior, las columnas NO se deduplican
     entre cards: `MIN` está en las ocho y en las ocho tiene que salir,
     porque cada tabla se lee sola.
     =================================================================== */
  function cards() {
    if (typeof JUGADORES_RANKINGS === 'undefined') return [];
    return JUGADORES_RANKINGS.map(g => ({
      id: g.id, titulo: g.titulo, orden: g.orden, cols: g.cols.slice(),
    }));
  }

  function cardsIds() { return cards().map(c => c.id); }

  function colsDeCard(id) {
    const c = cards().filter(x => x.id === id)[0];
    if (!c) return [];
    const e = (estado.cols && estado.cols[id]) || {};
    /* En el orden del catálogo, no en el que se tildaron: dos
       exportaciones con las mismas columnas dan la misma tabla. */
    return c.cols.filter(k => e[k]);
  }

  /** Las cards que de verdad van a salir: tildadas Y con alguna columna. */
  function seleccion() {
    const e = estado.cards || {};
    return cardsIds().filter(id => e[id] && colsDeCard(id).length > 0);
  }

  function cardsDePreset(id) {
    const p = PRESETS.filter(x => x.id === id)[0];
    if (!p) return [];
    if (!p.cards) return cardsIds();
    /* Se INTERSECTA con el catálogo vivo: si un día se saca una card, el
       preset la deja de pedir en vez de tildar una que no existe. */
    const hay = cardsIds();
    return p.cards.filter(k => hay.indexOf(k) > -1);
  }

  /** Cuántas columnas tiene la tabla más ancha: decide la orientación. */
  function maxColumnas() {
    return seleccion().reduce((m, id) => Math.max(m, colsDeCard(id).length), 0);
  }

  /* ===================================================================
     EL MODAL
     =================================================================== */
  function abrir(idx) {
    if (typeof document === 'undefined') return;
    if (!idx || !JUGADORES.filtroEquipo) return;
    estado.idx = idx;
    estado.disparador = document.activeElement;
    if (!estado.cards) preset('basicas', true);
    estado.abierto = true;
    pintar();
    const b = document.getElementById('rankPdfGenerar');
    if (b) b.focus();
    /* La version se comprueba ACA y no en el arranque: es el momento en
       que importa, porque de este modal sale el PDF. Falla en silencio. */
    if (typeof SGADD_UI !== 'undefined' && SGADD_UI.comprobarVersionPublicada) {
      SGADD_UI.comprobarVersionPublicada();
    }
    /* Y el diagnostico del pie, que contesta EN ESTE NAVEGADOR si las
       tres condiciones que lo repiten hoja por hoja estan en su lugar.
       Solo dice algo cuando alguna falla: un cartel que aparece siempre
       se deja de leer (punto 14). */
    if (typeof SGADD_UI !== 'undefined' && SGADD_UI.diagnosticarPie) {
      const d = SGADD_UI.diagnosticarPie();
      const n = document.getElementById('pieVersionRotulo');
      if (!d.ok && n) {
        n.classList.add('pie-previa-atrasada');
        n.textContent = '\u26a0 El pie puede no repetirse en todas las hojas: '
          + d.motivos.join(' \u00b7 ') + '. Recarga con Ctrl+F5 y volve a probar.';
      }
    }
    document.addEventListener('keydown', escapar);
  }

  function cerrar() {
    estado.abierto = false;
    const m = document.getElementById('modalExportarRanking');
    if (m) m.remove();
    document.removeEventListener('keydown', escapar);
    if (estado.disparador && estado.disparador.focus) estado.disparador.focus();
    estado.disparador = null;
  }

  function escapar(ev) { if (ev.key === 'Escape') cerrar(); }

  /**
   * Un preset REEMPLAZA: tilda sus cards con TODAS sus columnas y apaga
   * el resto. Acumular haría que «Básicas» después de «Todas» dejara las
   * ocho, que es justo lo contrario de lo que el botón promete.
   */
  function preset(id, callado) {
    const elegidas = cardsDePreset(id);
    estado.cards = {};
    estado.cols = {};
    cards().forEach(c => {
      estado.cards[c.id] = elegidas.indexOf(c.id) > -1;
      estado.cols[c.id] = {};
      c.cols.forEach(k => estado.cols[c.id][k] = true);
    });
    if (!callado) pintar();
  }

  /** Tilda o destilda una card entera. */
  function alternarCard(id) {
    estado.cards = estado.cards || {};
    estado.cards[id] = !estado.cards[id];
    /* Al reactivarla vuelven TODAS sus columnas: una card que se prende
       vacía es un título sin tabla. */
    if (estado.cards[id] && colsDeCard(id).length === 0) {
      const c = cards().filter(x => x.id === id)[0];
      estado.cols[id] = {};
      if (c) c.cols.forEach(k => estado.cols[id][k] = true);
    }
    pintar();
  }

  /** Tilda o destilda UNA columna adentro de su card. */
  function alternarCol(id, clave) {
    estado.cols = estado.cols || {};
    estado.cols[id] = estado.cols[id] || {};
    estado.cols[id][clave] = !estado.cols[id][clave];
    /* Solo se refresca el pie: repintar el modal entero le sacaría el
       foco a la casilla recién tocada, y con cuarenta y tres eso hace
       imposible recorrerlas con el teclado. Es la misma regla que ya
       cumplen `scoutMeta()` y el buscador del buzón (punto 13). */
    refrescarPie();
  }

  function refrescarPie() {
    const pie = document.getElementById('rankPdfPie');
    if (pie) pie.innerHTML = piePreview();
    const b = document.getElementById('rankPdfGenerar');
    if (b) b.disabled = seleccion().length === 0;
  }

  function piePreview() {
    const n = seleccion().length;
    if (!n) {
      return '<span class="zona-peligro zona-texto">Elegí al menos una card.</span>';
    }
    const cols = seleccion().reduce((a, id) => a + colsDeCard(id).length, 0);
    const apaisada = maxColumnas() > COLS_VERTICAL;
    return esc(n + (n === 1 ? ' tabla' : ' tablas') + ' · ' + cols + ' columnas en total')
      + ' · <b>' + (apaisada ? 'A4 apaisada' : 'A4 vertical') + '</b>'
      + ' <span class="text-muted">(cada card sale como su propia tabla, '
      + 'con su orden)</span>';
  }

  function pintar() {
    let m = document.getElementById('modalExportarRanking');
    if (!estado.abierto) { if (m) m.remove(); return; }
    if (!m) {
      m = document.createElement('div');
      m.id = 'modalExportarRanking';
      m.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
      document.body.appendChild(m);
    }
    m.innerHTML = html();
    refrescarPie();
  }

  function html() {
    const marcadas = estado.cards || {};
    const bloques = cards().map(c => {
      const activa = !!marcadas[c.id];
      const elegidas = (estado.cols && estado.cols[c.id]) || {};
      return `
      <div class="mb-3 rounded-md border ${activa ? 'border-hairline' : 'border-hairline/40'} p-2.5">
        <label class="flex items-center gap-2 cursor-pointer mb-1.5">
          <input type="checkbox" data-card="${esc(c.id)}" ${activa ? 'checked' : ''}
                 onchange="SGADD_RANKPDF.alternarCard('${escJs(c.id)}')">
          <span class="text-xs font-display uppercase tracking-wider ${activa ? 'text-ink' : 'text-muted'}">
            ${esc(c.titulo)}</span>
          <span class="text-[10px] text-muted font-mono">orden: ${esc(c.orden)}</span>
        </label>
        ${activa ? `<div class="flex flex-wrap gap-1.5 pl-6">
          ${c.cols.map(k => `
            <label class="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer
                          ${elegidas[k] ? 'border-accent/50 bg-accent/10 text-ink' : 'border-hairline text-muted hover:text-ink'}">
              <input type="checkbox" data-col="${esc(c.id)}|${esc(k)}" ${elegidas[k] ? 'checked' : ''}
                     onchange="SGADD_RANKPDF.alternarCol('${escJs(c.id)}','${escJs(k)}')">
              <span class="font-mono">${esc(k)}</span>
            </label>`).join('')}
        </div>` : ''}
      </div>`;
    }).join('');

    return `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="SGADD_RANKPDF.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto"
           role="dialog" aria-modal="true" aria-labelledby="rankPdfTitulo">
        <h3 id="rankPdfTitulo" class="font-display uppercase tracking-wide text-sm text-accent mb-1">
          Ranking del plantel · PDF</h3>
        <p class="text-xs text-muted mb-3">
          Cada card sale como <b>su propia tabla</b>, con su orden y su
          numeración: el primero en rebotes no es el primero en triples.
          Adentro de cada una podés sacar columnas.
        </p>

        <div class="flex flex-wrap gap-2 mb-4">
          ${PRESETS.map(p => `
            <button type="button" onclick="SGADD_RANKPDF.preset('${escJs(p.id)}')"
              title="${esc(p.ayuda)}"
              class="text-[11px] uppercase tracking-wider px-3 py-2 rounded border border-hairline
                     hover:bg-surface2 hover:border-accent transition-colors">${esc(p.label)}</button>`).join('')}
        </div>

        <div class="mb-2">${bloques}</div>

        <p id="rankPdfPie" class="text-xs text-muted mb-1"></p>
        ${typeof SGADD_UI !== 'undefined' && SGADD_UI.pieVistaPrevia
          ? SGADD_UI.pieVistaPrevia() : ''}

        <div class="modal-acciones flex gap-2 justify-end">
          <button type="button" onclick="SGADD_RANKPDF.cerrar()"
            class="text-xs uppercase tracking-wider px-3 py-2 rounded border border-hairline hover:bg-surface2">Cancelar</button>
          <button type="button" id="rankPdfGenerar" onclick="SGADD_RANKPDF.generar()"
            class="text-xs uppercase tracking-wider px-3 py-2 rounded bg-accent text-base font-semibold
                   disabled:opacity-40">Generar PDF</button>
        </div>
      </div>`;
  }

  /* ===================================================================
     EL DOCUMENTO

     Una llamada al motor POR CARD, cada una con SU id — o sea con su
     `orden`. Recalcularlo por otro camino daría un papel que puede
     contradecir a la tabla que el DT tiene delante.
     =================================================================== */
  function datos() {
    const idx = estado.idx;
    const clave = JUGADORES.filtroEquipo;
    if (!idx || !clave) return null;
    const plantel = (idx.liga.jugadoresPorEquipo.get(clave) || []);
    if (!plantel.length) return null;

    const conAcum = plantel.filter(j => !!j.__acum).length;
    const hayAcum = conAcum >= Math.ceil(plantel.length * 0.8);
    const modo = (hayAcum && JUGADORES.plantelRankingModo === 'total') ? 'total' : 'promedio';

    const tablas = [];
    seleccion().forEach(id => {
      const cols = colsDeCard(id);
      /* CADA CARD CON SU PROPIO `id`: es lo que le da su `orden` y por lo
         tanto su numeración. Con un id fijo, las ocho tablas saldrían
         ordenadas por lo mismo y el `#` no diría nada.

         El orden manual de la pantalla NO se propaga: vale para la card
         que el DT tiene abierta, y aplicárselo a las ocho reordenaría
         siete por una métrica que ni siquiera tienen. */
      const r = jugadoresRanking(idx, id, {
        pool: plantel, ambito: 'plantel',
        umbral: 0, topN: plantel.length,
        cols: cols, modo: modo,
      });
      if (r) tablas.push(r);
    });
    if (!tablas.length) return null;

    const e = idx.get(clave);
    return {
      tablas: tablas, modo: modo,
      ancha: maxColumnas() > COLS_VERTICAL,
      equipo: e ? e.nombre : SGADD.limpiarNombre(plantel[0]['EQUIPO'] || ''),
      logo: (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(clave) : null,
      jugadores: plantel.length,
    };
  }

  /** El membrete: club, categoría, tramo y fecha. Va UNA vez arriba. */
  function membrete(d) {
    const club = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.nombre)
      ? CLUB.estado.nombre : '';
    const pl = (typeof SGADD !== 'undefined' && SGADD.CATALOGO)
      ? (SGADD.CATALOGO.planillas || []).filter(p => p.id === SGADD_APP.estado.planillaId)[0]
      : null;
    return `
      <header class="rank-membrete">
        <div class="rank-membrete-izq">
          ${d.logo ? `<img src="${esc(d.logo)}" alt="" class="rank-escudo">` : ''}
          <div>
            <h1 class="rank-titulo">${esc(d.equipo)}</h1>
            <p class="rank-sub">${esc([club, pl ? pl.label : ''].filter(Boolean).join(' · '))}</p>
          </div>
        </div>
        <div class="rank-membrete-der">
          <p class="rank-meta">Ranking del plantel · ${d.jugadores} jugadores</p>
          <p class="rank-meta">${esc(etiquetaTramo())}</p>
          <p class="rank-meta">${esc(fechaHoy())} · ${esc(d.modo === 'total' ? 'Totales de la fase' : 'Promedios por partido')}</p>
        </div>
      </header>`;
  }

  /**
   * El tramo, escrito como lo escribe el SELECTOR.
   *
   * Sale de `combinacionesTorneoFase()`, que es la que ya arma el `label`
   * ("Ida - Regular", "Total - Regular"). Componerlo acá a mano daría un
   * membrete que dice `*TOTAL*|REGULAR` —una clave interna que no le
   * significa nada a nadie— o, peor, una etiqueta parecida pero distinta
   * de la que el DT tiene en la barra.
   */
  function etiquetaTramo() {
    const st = SGADD_APP.estado;
    try {
      const tramos = SGADD.combinacionesTorneoFase(st.hojas) || [];
      const id = (st.torneo ? st.torneo + '|' : '') + st.fase;
      const t = tramos.filter(x => x.id === id)[0];
      if (t && t.label) return t.label;
    } catch (e) { /* sin hojas, se cae a la fase */ }
    return st.fase || '';
  }

  function fechaHoy() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function tabla(r, modo) {
    const cols = r.columnas;
    const th = cols.map(k => `<th>${esc(k)}</th>`).join('');
    const filas = r.filas.map(f => `
      <tr>
        <td class="rank-puesto">${f.puesto}</td>
        <td class="rank-nombre">${esc(f.jugador)}</td>
        ${cols.map(k => `<td class="rank-dato">${esc(textoCelda(k, f.celdas[k], modo))}</td>`).join('')}
      </tr>`).join('');
    return `
      <section class="rank-card">
        <h2 class="rank-card-titulo">${esc(r.titulo)}
          <span class="rank-card-orden">ordenado por ${esc(r.orden)}</span></h2>
        ${r.nota ? `<p class="rank-card-nota">${esc(r.nota)}</p>` : ''}
        <table class="rank-tabla">
          <thead><tr><th class="rank-puesto">#</th><th class="rank-nombre">Jugador</th>${th}</tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </section>`;
  }

  function armar(d) {
    /* La hoja se gira solo si alguna tabla no entra en vertical. Va con
       una `@page` NOMBRADA porque `@page` a secas no se puede condicionar
       por clase (punto 7.7), y sin la clase el resto de las
       exportaciones —que comparten la vertical— cambiarían de tamaño. */
    const apretada = maxColumnas() > 12;
    return `
      <div class="rank-hoja ${d.ancha ? 'rank-ancha' : ''} ${apretada ? 'rank-apretada' : ''}">
        ${membrete(d)}
        ${d.tablas.map(r => tabla(r, d.modo)).join('')}
        <p class="rank-nota">
          ${esc(d.jugadores)} jugadores del plantel, sin filtro de minutos.
          Cada tabla tiene su propio orden, así que el puesto de un jugador
          cambia de una a otra.
          ${d.modo === 'total' ? ' Las tasas no se acumulan: una tasa de la fase es la misma tasa.' : ''}
        </p>
        <footer class="informe-pie">${typeof SGADD_UI !== 'undefined' ? SGADD_UI.pieInforme() : ''}</footer>
      </div>`;
  }

  /** El mismo texto que la celda de pantalla, incluido el `≡` del total. */
  function textoCelda(k, v, modo) {
    if (typeof rankingTexto === 'function') return rankingTexto(k, v, modo);
    return v === null || v === undefined ? '—' : SGADD.formatear(k, v);
  }

  function generar() {
    if (!seleccion().length) return;
    const d = datos();
    cerrar();
    if (!d) return;

    const previo = document.getElementById('rankingSalida');
    if (previo) previo.remove();

    const salida = document.createElement('div');
    salida.id = 'rankingSalida';
    salida.innerHTML = armar(d);
    document.body.appendChild(salida);

    document.body.classList.add('modo-ranking-print');
    /* EL PIE INSTITUCIONAL, EN TODAS LAS HOJAS. Va colgado del body y no
    adentro del contenedor: `position: fixed` se ancla al primer ancestro
    con `transform` o `filter`, y ahi dejaria de repetirse sin ningun
    sintoma. La fecha se calcula ACA, al imprimir. */
    SGADD_UI.inyectarPieMotorStats();
    /* El escudo se serializa: al imprimir, el navegador vuelve a resolver
       el `src` y cualquier fallo lo deja afuera del PDF sin avisar
       (punto 7.5). */
    if (typeof SGADD_UI !== 'undefined') {
      SGADD_UI.embeberImagenes('#rankingSalida');
      SGADD_UI.tituloPdf(nombreArchivo(d));
    }

    setTimeout(() => {
      const alTerminar = () => {
        window.removeEventListener('afterprint', alTerminar);
        clearTimeout(respaldo);
        limpiar();
      };
      window.addEventListener('afterprint', alTerminar);
      const respaldo = setTimeout(alTerminar, 60000);
      window.print();
    }, 400);
  }

  function nombreArchivo(d) {
    /* Con una sola tabla se nombra por ella; con varias, el nombre es del
       ranking entero. Meter ocho títulos en el nombre daría un archivo
       que no se puede leer en la carpeta. */
    const base = d.tablas.length === 1
      ? 'Ranking ' + (d.equipo || '') + ' - ' + (d.tablas[0].titulo || '')
      : 'Ranking ' + (d.equipo || '');
    return (typeof SGADD_UI !== 'undefined')
      ? SGADD_UI.sanearNombreArchivo(base, 'Ranking_Plantel') : 'Ranking_Plantel';
  }

  function limpiar() {
    document.body.classList.remove('modo-ranking-print');
    SGADD_UI.quitarPieMotorStats();
    if (typeof SGADD_UI !== 'undefined') SGADD_UI.restaurarImagenes('#rankingSalida');
    const s = document.getElementById('rankingSalida');
    if (s) s.remove();
  }

  return {
    abrir, cerrar, generar, preset, alternarCard, alternarCol,
    PRESETS, COLS_VERTICAL,
    cards, cardsIds, colsDeCard, cardsDePreset, seleccion, maxColumnas,
    estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_RANKPDF;
