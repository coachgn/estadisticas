/* =====================================================================
   SGADD · EXPORTAR EL RANKING DEL PLANTEL A PDF

   Quinta exportación. Las otras cuatro (punto 7) hablan de UN equipo, de
   UN cruce o de UN jugador; ésta es la planilla del plantel entero, que
   es lo que el cuerpo técnico pega en la carpeta de la categoría.

   LO QUE LA AUDITORÍA DEL CÓDIGO REAL DEVOLVIÓ, y que manda sobre todo
   lo demás de este archivo:

   El ranking NO es una tabla ancha con muchas columnas. Son OCHO grupos
   (`JUGADORES_RANKINGS`) de 4 a 6 columnas cada uno, y en pantalla se ve
   UNO por vez — el de la pestaña abierta. Entre los ocho hay **35
   métricas distintas**, todas de JUGADOR:

     PJ MIN PTS PLAYS PPP +/-            participación y puntos
     USG% eFG% TS% RTL%                  eficiencia
     TC% TCC TCI                         tiro de campo
     PT2% T2% T2C T2I PPT2               tiro de 2
     PT3% T3% T3C T3I PPT3               tiro de 3
     PT1% T1% T1C T1I PPT1               tiros libres
     RO RD RT                            rebotes
     AST-PP AST% FC FR                   creación y disciplina

   NO EXISTEN acá: los Four Factors (son de equipo, viven en
   `PROMEDIOS 4F`), `PER` —que no está en `METRICAS` ni la escribe
   MotorStats— ni una tasa de rebote tipo `%REB`: el grupo de rebotes
   trae CUENTAS por partido (RO, RD, RT). Y `AST` a secas tampoco es
   columna de ningún grupo; lo que hay es `AST-PP` y `AST%`.

   POR ESO EL EXPORT RENDERIZA SU TABLA en vez de esconder columnas del
   DOM: la tabla de pantalla nunca tiene más de seis, así que "ocultar
   las desmarcadas" solo podría llegar a esas seis. Se arma una tabla
   nueva con las columnas elegidas, sobre las MISMAS filas que están en
   pantalla y con el MISMO motor (`jugadoresRanking`), que es lo que
   garantiza que el papel no pueda contradecir a la pantalla.
   ===================================================================== */
const SGADD_RANKPDF = (function () {
  'use strict';

  /* El corte que decide la orientación. Con seis columnas más el puesto y
     el nombre, la tabla entra holgada en los 190mm de un A4 vertical;
     medido, la séptima es la que empieza a apretar. */
  const COLS_VERTICAL = 6;

  /* Los tres presets salen de las métricas REALES del ranking. Ninguno
     inventa una columna: cada clave de acá tiene que estar en alguno de
     los ocho grupos, y hay un test que lo verifica contra el catálogo. */
  const PRESETS = [
    {
      id: 'basicas', label: 'Métricas básicas',
      ayuda: 'Lo que se lee de un vistazo. Entra en vertical.',
      /* Seis exactas, para que el preset más usado NO fuerce apaisada.
         `AST-PP` ocupa el lugar de "asistencias": el ranking no tiene una
         columna `AST` suelta, y de las dos que sí tiene es la que el
         proyecto ya usa para separar a un conductor real de uno que solo
         tiene la pelota. */
      cols: ['PJ', 'MIN', 'PTS', 'RT', 'AST-PP', 'eFG%'],
    },
    {
      id: 'avanzadas', label: 'Métricas avanzadas',
      ayuda: 'Uso, eficiencia real y creación. Sale apaisada.',
      cols: ['MIN', 'USG%', 'eFG%', 'TS%', 'PPP', 'RTL%', 'AST%', 'AST-PP'],
    },
    {
      id: 'todas', label: 'Seleccionar todas',
      ayuda: 'Las 35 del ranking. Apaisada y con tipografía compacta.',
      cols: null,   // se resuelve contra el catálogo vivo
    },
  ];

  const estado = {
    abierto: false,
    idx: null,
    elegidas: null,      // { clave: bool }
    disparador: null,
  };

  const esc = (v) => (typeof SGADD_UI !== 'undefined' ? SGADD_UI.esc(v) : String(v == null ? '' : v));
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' ? SGADD_UI.escJs(v) : String(v == null ? '' : v));

  /* ===================================================================
     EL UNIVERSO SALE DEL CATÁLOGO, NO DE UNA LISTA PROPIA

     Si se copiara acá, un grupo nuevo en `JUGADORES_RANKINGS` no
     aparecería en el modal y nadie se enteraría — es el bug del rol
     funcional (punto 8) otra vez. Se lee en cada apertura.
     =================================================================== */
  function grupos() {
    if (typeof JUGADORES_RANKINGS === 'undefined') return [];
    /* Una métrica se lista UNA vez, en el primer grupo que la declara:
       `MIN` está en los ocho y ocho casillas para la misma columna es una
       forma segura de que el DT destilde una y crea que sacó la columna. */
    const vistas = {};
    return JUGADORES_RANKINGS.map(g => ({
      id: g.id,
      titulo: g.titulo,
      cols: g.cols.filter(k => { if (vistas[k]) return false; vistas[k] = true; return true; }),
    })).filter(g => g.cols.length);
  }

  function todasLasClaves() {
    const out = [];
    grupos().forEach(g => g.cols.forEach(k => out.push(k)));
    return out;
  }

  /** Las elegidas, en el ORDEN del catálogo — no en el que se tildaron. */
  function seleccion() {
    const e = estado.elegidas || {};
    return todasLasClaves().filter(k => e[k]);
  }

  function colsDePreset(id) {
    const p = PRESETS.filter(x => x.id === id)[0];
    if (!p) return [];
    if (!p.cols) return todasLasClaves();
    /* Se INTERSECTA con el catálogo vivo: si un día se saca una columna
       del ranking, el preset la deja de pedir en vez de tildar una casilla
       que no existe. */
    const hay = todasLasClaves();
    return p.cols.filter(k => hay.indexOf(k) > -1);
  }

  /* ===================================================================
     EL MODAL
     =================================================================== */
  function abrir(idx) {
    if (typeof document === 'undefined') return;
    if (!idx || !JUGADORES.filtroEquipo) return;
    estado.idx = idx;
    estado.disparador = document.activeElement;
    if (!estado.elegidas) {
      estado.elegidas = {};
      colsDePreset('basicas').forEach(k => estado.elegidas[k] = true);
    }
    estado.abierto = true;
    pintar();
    const b = document.getElementById('rankPdfGenerar');
    if (b) b.focus();
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

  function preset(id) {
    const cols = colsDePreset(id);
    estado.elegidas = {};
    cols.forEach(k => estado.elegidas[k] = true);
    pintar();
  }

  function alternar(clave) {
    estado.elegidas = estado.elegidas || {};
    estado.elegidas[clave] = !estado.elegidas[clave];
    /* Solo se refresca el pie: repintar el modal entero le sacaría el foco
       a la casilla que se acaba de tocar, y con treinta y cinco eso hace
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
      return '<span class="zona-peligro zona-texto">Elegí al menos una métrica.</span>';
    }
    const apaisada = n > COLS_VERTICAL;
    return esc(n + (n === 1 ? ' métrica' : ' métricas'))
      + ' · <b>' + (apaisada ? 'A4 apaisada' : 'A4 vertical') + '</b>'
      + (apaisada
        ? ' <span class="text-muted">(más de ' + COLS_VERTICAL + ' columnas: se gira la hoja para que entren todas)</span>'
        : '');
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
    const e = estado.elegidas || {};
    const bloques = grupos().map(g => `
      <div class="mb-3">
        <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1.5">${esc(g.titulo)}</p>
        <div class="flex flex-wrap gap-1.5">
          ${g.cols.map(k => `
            <label class="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border cursor-pointer
                          ${e[k] ? 'border-accent/50 bg-accent/10 text-ink' : 'border-hairline text-muted hover:text-ink'}">
              <input type="checkbox" data-col="${esc(k)}" ${e[k] ? 'checked' : ''}
                     onchange="SGADD_RANKPDF.alternar('${escJs(k)}')"
                     class="accent-current">
              <span class="font-mono">${esc(k)}</span>
            </label>`).join('')}
        </div>
      </div>`).join('');

    return `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="SGADD_RANKPDF.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto"
           role="dialog" aria-modal="true" aria-labelledby="rankPdfTitulo">
        <h3 id="rankPdfTitulo" class="font-display uppercase tracking-wide text-sm text-accent mb-1">
          Ranking del plantel · PDF</h3>
        <p class="text-xs text-muted mb-3">
          Elegí qué columnas entran. Son las métricas del ranking: no hay
          Four Factors acá, que son de equipo.
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

     Se arma con `jugadoresRanking()`, el MISMO motor de la pantalla, con
     el mismo pool, el mismo modo y el mismo orden. Recalcularlo por otro
     camino daría un papel que puede contradecir a la tabla que el DT
     tiene delante.
     =================================================================== */
  function datos(cols) {
    const idx = estado.idx;
    const clave = JUGADORES.filtroEquipo;
    if (!idx || !clave) return null;
    const plantel = (idx.liga.jugadoresPorEquipo.get(clave) || []);
    if (!plantel.length) return null;

    const conAcum = plantel.filter(j => !!j.__acum).length;
    const hayAcum = conAcum >= Math.ceil(plantel.length * 0.8);
    const modo = (hayAcum && JUGADORES.plantelRankingModo === 'total') ? 'total' : 'promedio';

    const r = jugadoresRanking(idx, JUGADORES.plantelRankingAbierto, {
      pool: plantel, ambito: 'plantel',
      umbral: 0, topN: plantel.length,
      /* Las columnas elegidas viajan al MOTOR: sin esto el resultado
         trae solo las del grupo abierto y el resto sale en «—».
         Medido sobre el render de papel antes del arreglo: 29 de 35
         columnas vacías. */
      cols: cols,
      ordenPor: JUGADORES.plantelRankingOrdenPor,
      dir: JUGADORES.plantelRankingOrdenDir,
      modo: modo,
    });
    if (!r) return null;

    const e = idx.get(clave);
    return {
      r: r,
      cols: cols,
      modo: modo,
      equipo: e ? e.nombre : SGADD.limpiarNombre(plantel[0]['EQUIPO'] || ''),
      logo: (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(clave) : null,
    };
  }

  /** El membrete: club, categoría, tramo y fecha. */
  function membrete(d) {
    const club = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.nombre)
      ? CLUB.estado.nombre : '';
    const pl = (typeof SGADD !== 'undefined' && SGADD.CATALOGO)
      ? (SGADD.CATALOGO.planillas || []).filter(p => p.id === SGADD_APP.estado.planillaId)[0]
      : null;
    const tramo = etiquetaTramo();

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
          <p class="rank-meta">${esc(d.r.titulo)}</p>
          <p class="rank-meta">${esc(tramo)}</p>
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

  function armar(d) {
    const cols = d.cols;
    const th = cols.map(k => `<th>${esc(k)}</th>`).join('');
    const filas = d.r.filas.map(f => `
      <tr>
        <td class="rank-puesto">${f.puesto}</td>
        <td class="rank-nombre">${esc(f.jugador)}</td>
        ${cols.map(k => `<td class="rank-dato">${esc(textoCelda(k, f.celdas[k], d.modo))}</td>`).join('')}
      </tr>`).join('');

    /* La hoja se gira sola cuando las columnas no entran en vertical. Va
       con una `@page` NOMBRADA porque `@page` a secas no se puede
       condicionar por clase (punto 7.7), y sin la clase el resto de las
       exportaciones —que comparten la vertical— cambiarían de tamaño. */
    const ancha = cols.length > COLS_VERTICAL;

    return `
      <div class="rank-hoja ${ancha ? 'rank-ancha' : ''} ${cols.length > 12 ? 'rank-apretada' : ''}">
        ${membrete(d)}
        <table class="rank-tabla">
          <thead><tr><th class="rank-puesto">#</th><th class="rank-nombre">Jugador</th>${th}</tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <p class="rank-nota">
          ${esc(d.r.filas.length)} jugadores del plantel, sin filtro de minutos.
          ${d.modo === 'total' ? 'Las tasas no se acumulan: una tasa de la fase es la misma tasa.' : ''}
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
    const cols = seleccion();
    if (!cols.length) return;
    const d = datos(cols);
    cerrar();
    if (!d) return;

    const previo = document.getElementById('rankingSalida');
    if (previo) previo.remove();

    const salida = document.createElement('div');
    salida.id = 'rankingSalida';
    salida.innerHTML = armar(d);
    document.body.appendChild(salida);

    document.body.classList.add('modo-ranking-print');
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
    const base = 'Ranking ' + (d.equipo || '') + ' - ' + (d.r.titulo || '');
    return (typeof SGADD_UI !== 'undefined')
      ? SGADD_UI.sanearNombreArchivo(base, 'Ranking_Plantel') : 'Ranking_Plantel';
  }

  function limpiar() {
    document.body.classList.remove('modo-ranking-print');
    if (typeof SGADD_UI !== 'undefined') SGADD_UI.restaurarImagenes('#rankingSalida');
    const s = document.getElementById('rankingSalida');
    if (s) s.remove();
  }

  return {
    abrir, cerrar, generar, preset, alternar,
    PRESETS, COLS_VERTICAL,
    grupos, todasLasClaves, colsDePreset, seleccion,
    estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_RANKPDF;
