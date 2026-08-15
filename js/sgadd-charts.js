/* =====================================================================
   SGADD · Gráficos y narrativas

   Dos cosas:
     1. Fábricas de Chart.js con la paleta y los defaults del club.
     2. Generadores de texto que interpretan el dato.

   Lo segundo importa más que lo primero. Un gráfico muestra "PP% 12,7% vs
   15,8%"; la narrativa dice "sos el 4° que menos pierde y el 1° que más
   provoca: +3,12 pp, el mayor margen de la liga". Eso es lo que se lleva
   un DT a la charla.
   ===================================================================== */

const SGADD_CHARTS = (function () {
  'use strict';

  /* ¿Se está dibujando para el PAPEL BLANCO?
     Las TRES exportaciones imprimen sobre fondo claro, y los grises
     pensados para el tema oscuro quedan invisibles ahí: el radar de 8 ejes
     salía con las etiquetas en #f5f4f2 sobre blanco, o sea en blanco sobre
     blanco. Como los colores de Chart.js se fijan en JS y no en CSS,
     `@media print` no los puede corregir: hay que resolverlos al dibujar.

     Van los tres modos y no solo `modo-impresion`: cuando el post-partido
     sumó su gráfico de tiro, la leyenda "Convertidos / Errados" salió en
     gris clarísimo justamente porque su clase (`modo-partido-print`) no
     estaba en esta lista. Un modo nuevo que imprima en claro se agrega acá
     o sus gráficos salen ilegibles sin que nadie lo note. */
  const MODOS_PAPEL = ['modo-impresion', 'modo-partido-print', 'modo-scout-print'];

  function enPapelClaro() {
    if (typeof document === 'undefined' || !document.body) return false;
    return MODOS_PAPEL.some(m => document.body.classList.contains(m));
  }

  const COL = {
    equipo: '#60a5fa',
    equipoSuave: 'rgba(96,165,250,0.28)',
    liga: '#6b7280',
    ligaSuave: 'rgba(107,114,128,0.35)',
    /* Se resuelve en cada lectura: el color de marca sale del JSON del club. */
    get acento() { return (typeof CLUB !== 'undefined') ? CLUB.TEMA.acento : '#f7941e'; },
    get acentoSuave() { return ((typeof CLUB !== 'undefined') ? CLUB.TEMA.acento : '#f7941e') + '40'; },

    bien: '#22c55e',
    mal: '#ef4444',
    /* Los dos siguientes SÍ dependen del fondo, así que se leen en cada
       dibujado en vez de quedar fijos. */
    get grilla() { return enPapelClaro() ? 'rgba(148,163,184,0.55)' : 'rgba(40,40,40,0.65)'; },
    get texto() { return enPapelClaro() ? '#334155' : '#9CA3AF'; },
    /* Texto de máximo contraste: etiquetas de eje y leyendas. */
    get tinta() { return enPapelClaro() ? '#0f172a' : '#f5f4f2'; },
  };

  const instancias = {};
  let pendientes = [];

  /** Los canvas recién existen después del innerHTML: se dibuja al final. */
  function encolar(fn) { pendientes.push(fn); }
  function dibujarPendientes() {
    const cola = pendientes; pendientes = [];
    setTimeout(() => cola.forEach(f => { try { f(); } catch (e) { console.error('[charts]', e); } }), 0);
  }
  function limpiar() {
    Object.keys(instancias).forEach(k => { try { instancias[k].destroy(); } catch (e) {} delete instancias[k]; });
    pendientes = [];
  }

  /**
   * Reaplica la paleta a los gráficos YA dibujados.
   *
   * Los getters de `COL` se resuelven al DIBUJAR, así que sirven cuando el
   * modo de impresión se activa antes de crear el chart —el informe de
   * equipo hace justo eso—. Pero el post-partido y el scouting dibujan sus
   * gráficos al abrir la pantalla y recién marcan el modo al imprimir: ahí
   * las opciones ya quedaron congeladas con los colores del tema oscuro.
   *
   * Se vio con la leyenda "Convertidos / Errados" del perfil de tiro, que
   * salía en gris clarísimo sobre el papel blanco mientras la línea de
   * referencia —que la dibuja un plugin en cada frame— sí se actualizaba.
   *
   * `update('none')` repinta sin animación: con animación, el `print()`
   * puede dispararse a mitad de la transición y capturar el gráfico a medio
   * dibujar.
   */
  function repintarParaPapel() {
    Object.keys(instancias).forEach(k => {
      const ch = instancias[k];
      if (!ch || !ch.options) return;
      const pl = ch.options.plugins;
      if (pl && pl.legend && pl.legend.labels) pl.legend.labels.color = COL.tinta;
      const escalas = ch.options.scales || {};
      Object.keys(escalas).forEach(id => {
        const e = escalas[id];
        if (!e) return;
        if (e.ticks) e.ticks.color = COL.texto;
        if (e.grid) e.grid.color = COL.grilla;
        if (e.title) e.title.color = COL.texto;
        if (e.pointLabels) e.pointLabels.color = COL.tinta;   // radar
        if (e.angleLines) e.angleLines.color = COL.grilla;    // radar
      });
      try { ch.update('none'); } catch (err) {}
    });
  }

  function crear(id, config) {
    const cv = document.getElementById(id);
    if (!cv || typeof Chart === 'undefined') return null;
    if (instancias[id]) { try { instancias[id].destroy(); } catch (e) {} }
    instancias[id] = new Chart(cv.getContext('2d'), config);
    return instancias[id];
  }

  const movil = () => (typeof BP !== 'undefined' ? BP.movil() : (window.innerWidth || 1024) < 640);

  function baseOpciones(extra) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: COL.tinta, font: { family: 'Barlow', size: movil() ? 10 : 12 }, boxWidth: movil() ? 10 : 18, padding: 10 },
        },
        tooltip: {
          backgroundColor: '#0B1121', borderColor: '#374151', borderWidth: 1, padding: 10,
          titleFont: { family: '"Barlow Condensed"', size: 13 },
          bodyFont: { family: '"DM Mono"', size: 11 },
        },
      },
    }, extra || {});
  }

  function ejes(opciones) {
    const o = opciones || {};
    return {
      x: {
        grid: { color: COL.grilla, display: o.gridX !== false },
        ticks: { color: COL.texto, font: { family: 'Barlow', size: movil() ? 9 : 11 } },
        beginAtZero: o.desdeCero !== false,
      },
      y: {
        grid: { color: COL.grilla, display: o.gridY !== false },
        ticks: { color: COL.texto, font: { family: 'DM Mono', size: movil() ? 9 : 10 } },
        beginAtZero: o.desdeCero !== false,
      },
    };
  }

  /* =====================================================================
     1. BARRAS DE RANKING — la primera imagen de tu referencia
     Barra horizontal proporcional al percentil, color por tercil, y el
     puesto en la liga como badge.
     ===================================================================== */
  function barrasRanking(filas) {
    const items = filas.filter(Boolean).map(f => {
      const pct = f.percentil === null ? 50 : f.percentil;
      const color = f.descriptiva ? COL.texto : (pct >= 66 ? COL.bien : pct >= 34 ? COL.acento : COL.mal);
      const puesto = f.rk ? f.rk.puesto : null;
      const badge = puesto === null ? '' :
        `<span class="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
               style="background:${color}22;color:${color}">#${puesto}</span>`;
      return `
        <div class="flex items-center gap-2 py-1">
          <span class="w-24 sm:w-28 shrink-0 text-[11px] text-muted truncate" title="${SGADD_UI.esc(f.label)}">${SGADD_UI.esc(f.label)}</span>
          <div class="flex-1 h-2 rounded-full bg-surface2 overflow-hidden min-w-0">
            <div class="h-full rounded-full" style="width:${Math.max(3, pct).toFixed(0)}%;background:${color}"></div>
          </div>
          <span class="w-14 shrink-0 text-right font-mono text-[11px]" style="color:${color}">${SGADD_UI.esc(f.formateado)}</span>
          ${badge}
        </div>`;
    }).join('');
    return `<div class="space-y-0.5">${items}</div>`;
  }

  /* =====================================================================
     2. BARRAS COMPARADAS equipo vs liga
     ===================================================================== */
  function barrasComparadas(id, labels, serieEquipo, serieLiga, opciones) {
    const o = opciones || {};
    encolar(() => crear(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: o.nombreEquipo || 'Equipo', data: serieEquipo, backgroundColor: COL.equipo, borderRadius: 3, barPercentage: 0.8 },
          { label: 'Liga (mediana)', data: serieLiga, backgroundColor: COL.ligaSuave, borderColor: COL.liga, borderWidth: 1, borderRadius: 3, barPercentage: 0.8 },
        ],
      },
      options: baseOpciones({
        indexAxis: o.horizontal ? 'y' : 'x',
        scales: ejes(),
        plugins: Object.assign(baseOpciones().plugins, {
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            callbacks: { label: (c) => c.dataset.label + ': ' + (o.formato ? SGADD.formatear(o.formato, c.raw) : c.raw.toFixed(2)) },
          }),
        }),
      }),
    }));
    return `<div class="chart-box ${o.alto || 'is-sm'}"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     3. BARRAS APILADAS convertidos vs errados
     ===================================================================== */
  function convertidosErrados(id, conv, err, opciones) {
    const o = opciones || {};
    encolar(() => crear(id, {
      type: 'bar',
      data: {
        labels: ['T2', 'T3', 'T1'],
        datasets: [
          { label: 'Convertidos', data: conv, backgroundColor: o.gris ? COL.liga : COL.equipo, borderRadius: 3 },
          { label: 'Errados', data: err, backgroundColor: o.gris ? COL.ligaSuave : COL.equipoSuave, borderRadius: 3 },
        ],
      },
      options: baseOpciones({ scales: ejes() }),
    }));
    return `<div class="chart-box is-sm"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     4. RADAR comparado
     ===================================================================== */
  function radar(id, labels, series) {
    encolar(() => crear(id, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.data,
          borderColor: s.color || (i === 0 ? COL.equipo : COL.acento),
          backgroundColor: s.relleno || (i === 0 ? COL.equipoSuave : COL.acentoSuave),
          borderWidth: 2,
          pointBackgroundColor: s.color || (i === 0 ? COL.equipo : COL.acento),
          pointRadius: 3,
        })),
      },
      options: baseOpciones({
        scales: {
          r: {
            angleLines: { color: COL.grilla },
            grid: { color: COL.grilla },
            pointLabels: {
              color: COL.tinta,
              font: { family: 'Barlow', size: movil() ? 8 : 11 },
              callback: (l) => (movil() && String(l).length > 12 ? String(l).replace(/\s+/, '\n').split('\n') : l),
            },
            ticks: { display: false },
            suggestedMin: 0, suggestedMax: 100,
          },
        },
      }),
    }));
    /* `is-radar`: un radar es CUADRADO por naturaleza (el radio sale del
       lado más corto). En una hoja apaisada, dejarlo a todo el ancho lo
       deja chico en el centro con medio metro de aire a los lados, así que
       en impresión se le acota el ancho y se centra. */
    return `<div class="chart-box is-md is-radar"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     4 bis. PERFIL DE TIRO DEL PARTIDO · con la liga DENTRO del gráfico

     Barras apiladas por zona (2 puntos / 3 puntos / libres):

         ┌─────────┐  ← errados (gris)
         ├ ─ ─ ─ ─ ┤  ← marca: lo que habría convertido la LIGA
         │█████████│  ← convertidos (color del equipo)
         └─────────┘

     La altura TOTAL es la distribución de lanzamientos, los dos segmentos
     son convertidos vs errados, y la marca punteada dice con qué
     efectividad: si el bloque sólido la pasa, tiraron mejor que la liga.

     La referencia va DENTRO de la barra y no como una serie aparte —que es
     lo que pidió el club— porque comparar dos barras de alturas distintas
     obliga a hacer la cuenta mentalmente; una línea que corta la propia
     barra se lee sin pensar.

     El plugin dibuja las marcas: Chart.js no tiene "línea por barra", y un
     dataset de tipo línea las uniría entre zonas, sugiriendo una
     continuidad que no existe (el 52% de dos y el 35% de tres no son
     puntos de una misma curva).
     ===================================================================== */
  const pluginMarcaLiga = {
    id: 'marcaLiga',
    afterDatasetsDraw: (chart) => {
      const marcas = (chart.options.plugins && chart.options.plugins.marcaLiga &&
        chart.options.plugins.marcaLiga.valores) || [];
      if (!marcas.length) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      const ctx = chart.ctx;
      const eje = chart.scales.y;
      ctx.save();
      meta.data.forEach((barra, i) => {
        const v = marcas[i];
        if (v === null || v === undefined) return;
        const y = eje.getPixelForValue(v);
        /* Ancho de la barra: el mismo que ocupa el dato, un poco más para
           que la marca "sobresalga" y se lea como referencia y no como
           parte del apilado. */
        const w = (barra.width || 24) * 0.62;
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = COL.tinta;
        ctx.moveTo(barra.x - w, y);
        ctx.lineTo(barra.x + w, y);
        ctx.stroke();
      });
      ctx.restore();
    },
  };

  /**
   * @param {string} id      id del <canvas>
   * @param {object} perfil  lo que devuelve SGADD_PARTIDO.perfilTiro()
   * @param {object} o       { color, nombre }
   */
  function tiroPartido(id, perfil, opciones) {
    const o = opciones || {};
    if (!perfil || !perfil.zonas) return '';
    const z = perfil.zonas;
    const color = o.color || COL.equipo;

    encolar(() => crear(id, {
      type: 'bar',
      data: {
        labels: z.map(x => x.label),
        datasets: [
          { label: 'Convertidos', data: z.map(x => x.convertidos),
            backgroundColor: color, borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 3, bottomRight: 3 } },
          { label: 'Errados', data: z.map(x => x.errados),
            backgroundColor: COL.ligaSuave, borderColor: COL.liga, borderWidth: 1,
            borderRadius: { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 } },
        ],
      },
      options: baseOpciones({
        scales: {
          x: { stacked: true, grid: { display: false },
               ticks: { color: COL.texto, font: { family: 'Barlow', size: movil() ? 9 : 11 } } },
          y: { stacked: true, beginAtZero: true,
               grid: { color: COL.grilla },
               title: { display: !movil(), text: 'Lanzamientos', color: COL.texto,
                        font: { family: 'Barlow', size: 10 } },
               ticks: { color: COL.texto, font: { family: 'DM Mono', size: movil() ? 9 : 10 } } },
        },
        plugins: Object.assign(baseOpciones().plugins, {
          marcaLiga: { valores: z.map(x => x.convLiga) },
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            callbacks: {
              /* El tooltip cuenta las tres cosas del bloque: cuántos tiró,
                 con qué acierto, y dónde estaba la liga. */
              afterBody: (items) => {
                const x = z[items[0].dataIndex];
                if (!x || x.pct === null) return '';
                const p = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';
                return x.pctLiga === null
                  ? [x.convertidos + ' de ' + x.intentos + ' · ' + p(x.pct)]
                  : [x.convertidos + ' de ' + x.intentos + ' · ' + p(x.pct),
                     'Liga: ' + p(x.pctLiga) + ' → habría metido ' + x.convLiga.toFixed(1),
                     (x.delta >= 0 ? '▲ +' : '▼ ') + p(Math.abs(x.delta)).replace('%', ' pp')];
              },
            },
          }),
        }),
      }),
      plugins: [pluginMarcaLiga],
    }));
    return `<div class="chart-box is-sm"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     5. LÍNEA de evolución partido a partido
     ===================================================================== */
  function evolucion(id, partidos, opciones) {
    const o = opciones || {};
    const labels = partidos.map(p => SGADD.formatearFecha(p.__fecha));
    const favor = partidos.map(p => SGADD.num(p['PTS']));
    const contra = partidos.map(p => SGADD.num(p['PTSopp']));

    encolar(() => crear(id, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'A favor', data: favor, borderColor: COL.bien, backgroundColor: 'transparent', tension: 0.25, pointRadius: 3 },
          { label: 'En contra', data: contra, borderColor: COL.mal, backgroundColor: 'transparent', tension: 0.25, pointRadius: 3 },
        ],
      },
      options: baseOpciones({
        scales: ejes({ desdeCero: false }),
        plugins: Object.assign(baseOpciones().plugins, {
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            callbacks: { title: (items) => (o.etiquetas ? o.etiquetas[items[0].dataIndex] : items[0].label) },
          }),
        }),
      }),
    }));
    return `<div class="chart-box is-sm"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     5b. LÍNEA de evolución de UN jugador en UNA métrica, con banda ±1 desvío
     La banda son dos datasets invisibles (arriba/abajo) con fill entre
     ellos; la línea del jugador va encima, en un dataset aparte, para que
     el tooltip no se confunda con los bordes de la banda.
     ===================================================================== */
  function evolucionJugador(id, partidos, clave, opciones) {
    const o = opciones || {};
    const labels = partidos.map(p => SGADD.formatearFecha(p.__fecha));
    const valores = partidos.map(p => (typeof p[clave] === 'number' && isFinite(p[clave])) ? p[clave] : null);
    const hayBanda = typeof o.media === 'number' && typeof o.desvio === 'number';
    const arriba = valores.map(() => hayBanda ? o.media + o.desvio : null);
    const abajo = valores.map(() => hayBanda ? Math.max(0, o.media - o.desvio) : null);
    const atipicos = o.atipicos || [];
    const etiqueta = o.label || (SGADD.metrica(clave) ? SGADD.metrica(clave).label : clave);
    // El selector de métrica del tab Evolución mezcla puntos, minutos y
    // porcentajes en el mismo gráfico: sin formatear por métrica, un eFG%
    // de 0,45 se lee como "45" en vez de "45%".
    const fmt = (v) => (v === null || v === undefined) ? '—' : SGADD.formatear(clave, v);

    encolar(() => crear(id, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Banda ±1 desvío', data: arriba, borderWidth: 0, pointRadius: 0, backgroundColor: COL.ligaSuave, fill: '+1' },
          { label: '_banda_abajo', data: abajo, borderWidth: 0, pointRadius: 0, backgroundColor: 'transparent', fill: false },
          {
            label: etiqueta,
            data: valores, borderColor: COL.equipo, backgroundColor: 'transparent', tension: 0.25,
            pointRadius: (c) => atipicos[c.dataIndex] ? 6 : 3,
            pointBackgroundColor: (c) => atipicos[c.dataIndex] ? (atipicos[c.dataIndex] > 0 ? COL.bien : COL.mal) : COL.equipo,
          },
        ],
      },
      options: baseOpciones({
        scales: Object.assign(ejes({ desdeCero: false }), {
          y: Object.assign({}, ejes({ desdeCero: false }).y, {
            ticks: Object.assign({}, ejes({ desdeCero: false }).y.ticks, { callback: (v) => fmt(v) }),
          }),
        }),
        plugins: Object.assign(baseOpciones().plugins, {
          legend: { display: false },
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            filter: (item) => item.datasetIndex === 2,
            callbacks: {
              title: (items) => (o.etiquetas ? o.etiquetas[items[0].dataIndex] : items[0].label),
              label: (c) => etiqueta + ': ' + fmt(c.raw),
            },
          }),
        }),
      }),
    }));
    return `<div class="chart-box is-sm"><canvas id="${id}"></canvas></div>`;
  }

  /* =====================================================================
     6. SCATTER uso vs eficiencia (plantel)
     ===================================================================== */
  /* ---------------------------------------------------------------------
     MINUTOS MÍNIMOS PARA ENTRAR AL SCATTER

     Distinto del umbral de calificación de la liga (`liga.minJugador`, que
     decide si un percentil tiene sentido). Acá el problema es otro y es de
     legibilidad: un jugador de 3 minutos aporta un punto en una esquina
     que no describe nada y encima tapa a los que sí juegan. 10 minutos es
     el piso donde el USG% deja de ser una fracción sobre casi nada.
     --------------------------------------------------------------------- */
  const MIN_SCATTER = 10;

  /**
   * Iniciales de nombre y apellido, en ese orden: "STEHLI, RAMIRO" → "RS".
   *
   * La planilla escribe "APELLIDO, NOMBRE", así que hay que dar vuelta los
   * lados. Sin coma se toman las dos primeras palabras tal cual vienen, y
   * si hay una sola palabra se usan sus dos primeras letras — antes que
   * dejar el nodo vacío.
   */
  function inicialesJugador(nombre) {
    const t = String(nombre === null || nombre === undefined ? '' : nombre).trim();
    if (!t) return '';
    const primera = (s) => {
      const m = String(s || '').trim().match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
      return m ? m[0].toUpperCase() : '';
    };
    if (t.indexOf(',') !== -1) {
      const partes = t.split(',');
      const apellido = partes[0];
      const nombrePila = partes.slice(1).join(' ');
      return (primera(nombrePila) + primera(apellido)) || primera(apellido);
    }
    const pal = t.split(/\s+/).filter(Boolean);
    if (pal.length >= 2) return primera(pal[0]) + primera(pal[1]);
    return t.slice(0, 2).toUpperCase();
  }

  /* Radio del nodo por minutos. El piso es alto a propósito: adentro tienen
     que entrar dos letras legibles, así que 13px es el mínimo utilizable. */
  function radioNodo(min) {
    const m = (typeof min === 'number' && isFinite(min)) ? min : MIN_SCATTER;
    return Math.max(13, Math.min(22, 11 + m / 3));
  }

  /**
   * Plugin que escribe las iniciales dentro de cada nodo. Chart.js no tiene
   * nada nativo para esto: se dibuja encima del dataset ya pintado.
   * El punto bajo el cursor va con fuente más grande y en blanco pleno,
   * que es el "destaque de la insignia" del pedido.
   */
  const pluginIniciales = {
    id: 'inicialesJugador',
    afterDatasetsDraw: (chart) => {
      const ctx = chart.ctx;
      const activos = (chart.getActiveElements ? chart.getActiveElements() : []) || [];
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((punto, pi) => {
          const raw = ds.data[pi];
          if (!raw || !raw.iniciales) return;
          const activo = activos.some(a => a.datasetIndex === di && a.index === pi);
          const r = radioNodo(raw.min);
          ctx.save();
          ctx.font = (activo ? '700 ' : '600 ') + Math.round(activo ? r * 0.95 : r * 0.78) + 'px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          /* Halo oscuro para que la inicial se lea sobre cualquier fondo,
             incluso cuando dos nodos se superponen. */
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(10,10,12,0.85)';
          ctx.strokeText(raw.iniciales, punto.x, punto.y);
          ctx.fillStyle = activo ? '#FFFFFF' : 'rgba(255,255,255,0.92)';
          ctx.fillText(raw.iniciales, punto.x, punto.y);
          ctx.restore();
        });
      });
    },
  };

  function scatterUsoEficiencia(id, jugadores, liga) {
    const puntos = jugadores
      .filter(j => typeof j['MIN'] === 'number' && j['MIN'] >= MIN_SCATTER)
      .map(j => ({
        x: j['USG%'], y: j['TS%'], name: j['NOMBRES'], min: j['MIN'],
        efg: j['eFG%'], pts: j['PTS'], iniciales: inicialesJugador(j['NOMBRES']),
        /* Ancla de la sincronización con la tabla de abajo. Se usa el
           `__clave` del índice (clavePersona) para que el `data-jug` del
           `<tr>` y el punto del scatter sean el mismo string. */
        clave: j.__clave || null,
      }))
      .filter(p => typeof p.x === 'number' && typeof p.y === 'number');

    if (!puntos.length) {
      return `<p class="text-xs text-muted py-4">Ningún jugador del plantel llega a ${MIN_SCATTER} minutos de promedio.</p>`;
    }

    encolar(() => crear(id, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Jugadores',
          data: puntos,
          /* Relleno translúcido + contorno pleno del color de marca: el nodo
             es un anillo con la insignia adentro, no una burbuja celeste
             opaca. El acento sale del JSON del club, así que Jujuy lo pinta
             azul sin tocar nada acá. */
          backgroundColor: COL.acentoSuave,
          borderColor: COL.acento,
          borderWidth: 2,
          get hoverBackgroundColor() { return COL.acento + '88'; },
          hoverBorderColor: '#FFFFFF',
          hoverBorderWidth: 3,
          pointRadius: (c) => radioNodo(c.raw && c.raw.min),
          pointHoverRadius: (c) => radioNodo(c.raw && c.raw.min) + 4,
        }],
      },
      options: baseOpciones({
        /* El hover tiene que agarrar el nodo entero, no solo su centro. */
        interaction: { mode: 'nearest', intersect: true },
        /* --- Sincronización gráfico → tabla ---
           El gráfico no sabe nada de la tabla: avisa quién está activo y
           el módulo de la sección decide qué hacer. Así la fábrica sigue
           sirviendo para cualquier vista que la use. */
        onHover: (ev, activos) => {
          const clave = (activos && activos.length && puntos[activos[0].index])
            ? puntos[activos[0].index].clave : null;
          if (typeof window !== 'undefined' && typeof window.equiposDestacarJugador === 'function') {
            window.equiposDestacarJugador(clave, 'grafico');
          }
        },
        scales: {
          x: Object.assign(ejes({ desdeCero: false }).x, { title: { display: true, text: 'USG% · cuánto usa', color: COL.texto } }),
          y: Object.assign(ejes({ desdeCero: false }).y, { title: { display: true, text: 'TS% · qué tan bien', color: COL.texto } }),
        },
        plugins: Object.assign(baseOpciones().plugins, {
          legend: { display: false },
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            callbacks: {
              title: (i) => i[0].raw.iniciales + ' · ' + i[0].raw.name,
              label: (c) => [
                'USG% ' + SGADD.formatear('USG%', c.raw.x),
                'eFG% ' + SGADD.formatear('eFG%', c.raw.efg),
                'TS% ' + SGADD.formatear('TS%', c.raw.y),
                'PTS ' + SGADD.formatear('PTS', c.raw.pts),
                'MIN ' + SGADD.formatear('MIN', c.raw.min),
              ],
            },
          }),
        }),
      }),
      plugins: [pluginIniciales],
    }));

    const nota = 'Cada nodo son las iniciales del jugador y su tamaño, los minutos. ' +
      'Arriba a la derecha: mucho volumen y buena eficiencia. ' +
      'Solo los de ' + MIN_SCATTER + ' minutos o más — con menos, el USG% es una fracción sobre casi nada.';
    return `<div class="chart-box is-md"><canvas id="${id}"></canvas></div>
            <p class="text-[11px] text-muted mt-2 leading-snug">${nota}</p>`;
  }

  /* =====================================================================
     NARRATIVAS
     ===================================================================== */

  const ordinal = n => n + '°';
  const pp = v => (v > 0 ? '+' : '') + (v * 100).toFixed(2) + ' pp';

  function nota(texto, tono) {
    const c = tono === 'bien' ? 'text-green-400' : tono === 'mal' ? 'text-red-400' : 'text-muted';
    return `<p class="text-[11px] ${c} mt-3 leading-snug">${texto}</p>`;
  }

  /** "4° que menos pierde y 1° que más provoca: +3,12 pp, el mayor margen." */
  function narrarPerdidas(idx, e) {
    const propias = idx.leer(e.clave, 'PePP%');
    const forzadas = idx.leer(e.clave, 'PP Opp%');
    const rp = idx.ranking(e.clave, 'PePP%');
    const rf = idx.ranking(e.clave, 'PP Opp%');
    if (!propias || propias.valor === null || !forzadas || forzadas.valor === null) return '';

    const margen = forzadas.valor - propias.valor;
    const margenes = idx.lista().map(x => {
      const a = x.promedios ? x.promedios['PePP%'] : null;
      const b = x.ponderado ? x.ponderado['PP Opp%'] : null;
      return (typeof a === 'number' && typeof b === 'number') ? b - a : null;
    }).filter(v => v !== null);
    const mejores = margenes.filter(v => v > margen).length;

    const t = `${SGADD_UI.esc(e.nombre)} es el ${ordinal(rp ? rp.puesto : '—')} equipo que menos pierde
      (${propias.formateado}) y el ${ordinal(rf ? rf.puesto : '—')} que más provoca al rival (${forzadas.formateado}).
      La diferencia de ${pp(margen)} lo deja ${ordinal(mejores + 1)} de ${margenes.length} en margen de posesiones.`;
    return nota(t, margen > 0 ? 'bien' : 'mal');
  }

  /** "PPT2 y PPT3 por debajo del promedio. PPT1 el peor de la liga." */
  function narrarPPT(idx, e) {
    const claves = ['PPT2', 'PPT3', 'PPT1'];
    const nombres = { PPT2: 'PPT2', PPT3: 'PPT3', PPT1: 'PPT1' };
    const bajo = [], alto = [];
    const detalle = [];
    claves.forEach(k => {
      const r = idx.leer(e.clave, k);
      const rk = idx.ranking(e.clave, k);
      if (!r || r.valor === null || r.tipo === null) return;
      detalle.push(nombres[k] + ' ' + r.formateado + ' (liga ' + r.tipoFormateado + ')');
      if (r.valor < r.tipo) bajo.push(nombres[k]); else alto.push(nombres[k]);
      if (rk && rk.puesto === rk.de) detalle.push(nombres[k] + ' es el peor de la liga');
    });
    if (!detalle.length) return '';
    const cierre = bajo.length === 3 ? 'Las tres zonas están bajo la media.'
      : alto.length === 3 ? 'Las tres zonas están sobre la media.'
      : bajo.length ? 'Por debajo de la media en ' + bajo.join(' y ') + '.'
      : '';
    return nota(detalle.join(' · ') + '. ' + cierre, bajo.length >= 2 ? 'mal' : bajo.length === 0 ? 'bien' : null);
  }

  /** Local vs visitante: dónde está la diferencia real. */
  function narrarCondicion(e) {
    const l = e.split.LOCAL, v = e.split.VISITANTE;
    if (!l.pj || !v.pj) return nota('Todavía no hay partidos de las dos condiciones para comparar.');
    const difL = l.factores['eFG%'], difV = v.factores['eFG%'];
    if (difL === null || difV === null) return '';
    const d = difL - difV;
    const mejor = d > 0 ? 'de local' : 'de visitante';
    const t = `De local ${l.ganados}-${l.perdidos} con eFG% ${SGADD.formatear('eFG%', difL)};
      de visitante ${v.ganados}-${v.perdidos} con ${SGADD.formatear('eFG%', difV)}.
      Tiran ${pp(Math.abs(d))} mejor ${mejor}.`;
    return nota(t, Math.abs(d) < 0.02 ? null : (d > 0 ? 'bien' : 'mal'));
  }

  /** Rebote: la lectura combinada de ataque y defensa. */
  function narrarRebote(idx, e) {
    const ro = idx.leer(e.clave, 'RO%');
    const roOpp = idx.leer(e.clave, 'RO Opp%');
    if (!ro || ro.valor === null || !roOpp || roOpp.valor === null) return '';
    const rkO = idx.ranking(e.clave, 'RO%');
    const rkD = idx.ranking(e.clave, 'RO Opp%');
    let lectura = '';
    if (ro.percentil < 40 && roOpp.percentil > 60) {
      lectura = ' Rebotean bien en defensa y casi no van al ataque: es una decisión de estilo, se repliegan en vez de buscar la segunda oportunidad.';
    } else if (ro.percentil > 60 && roOpp.percentil < 40) {
      lectura = ' Atacan el tablero ofensivo pero pagan el precio atrás.';
    }
    const t = `Toman el ${ro.formateado} de sus rebotes ofensivos disponibles (${ordinal(rkO ? rkO.puesto : '—')} de ${rkO ? rkO.de : '—'})
      y conceden el ${roOpp.formateado} (${ordinal(rkD ? rkD.puesto : '—')}).${lectura}`;
    return nota(t);
  }

  /** Resumen del ataque: dónde está el problema o la fortaleza. */
  function narrarAtaque(idx, e) {
    const of = ['eFG%', 'PePP%', 'RTL%', 'RO%'].map(k => ({ k, r: idx.leer(e.clave, k) })).filter(x => x.r && x.r.percentil !== null);
    if (!of.length) return '';
    const peor = of.reduce((a, b) => (a.r.percentil <= b.r.percentil ? a : b));
    const mejor = of.reduce((a, b) => (a.r.percentil >= b.r.percentil ? a : b));
    const rtg = idx.leer(e.clave, 'RTNG OFF');
    const t = `Con un ataque en el percentil ${rtg && rtg.percentil !== null ? rtg.percentil.toFixed(0) : '—'},
      lo que más los sostiene es ${SGADD_UI.esc(mejor.r.label)} (${mejor.r.formateado}, pctil ${mejor.r.percentil.toFixed(0)})
      y lo que más los frena es ${SGADD_UI.esc(peor.r.label)} (${peor.r.formateado}, pctil ${peor.r.percentil.toFixed(0)}).`;
    return nota(t);
  }

  return {
    COL, crear, encolar, dibujarPendientes, limpiar, baseOpciones, ejes,
    repintarParaPapel,
    barrasRanking, barrasComparadas, convertidosErrados, radar, tiroPartido, evolucion, evolucionJugador, scatterUsoEficiencia,
    inicialesJugador, radioNodo, MIN_SCATTER,
    nota, narrarPerdidas, narrarPPT, narrarCondicion, narrarRebote, narrarAtaque,
  };
})();

/* Compatible con Node SOLO para testear las funciones puras (iniciales,
   radio del nodo). El resto usa `document` y Chart.js y se verifica a mano
   en el navegador, igual que las UI de Equipos y Jugadores. */
if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CHARTS;
