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
    grilla: 'rgba(40,40,40,0.65)',
    texto: '#9CA3AF',
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
          labels: { color: '#f5f4f2', font: { family: 'Barlow', size: movil() ? 10 : 12 }, boxWidth: movil() ? 10 : 18, padding: 10 },
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
              color: '#f5f4f2',
              font: { family: 'Barlow', size: movil() ? 8 : 11 },
              callback: (l) => (movil() && String(l).length > 12 ? String(l).replace(/\s+/, '\n').split('\n') : l),
            },
            ticks: { display: false },
            suggestedMin: 0, suggestedMax: 100,
          },
        },
      }),
    }));
    return `<div class="chart-box is-md"><canvas id="${id}"></canvas></div>`;
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
  function scatterUsoEficiencia(id, jugadores, liga) {
    const puntos = jugadores.map(j => ({
      x: j['USG%'], y: j['TS%'], name: j['NOMBRES'], min: j['MIN'],
    })).filter(p => typeof p.x === 'number' && typeof p.y === 'number');

    encolar(() => crear(id, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Jugadores',
          data: puntos,
          backgroundColor: COL.equipo,
          borderColor: COL.equipo,
          pointRadius: (c) => Math.max(4, Math.min(14, (c.raw.min || 0) / 3)),
          pointHoverRadius: 16,
        }],
      },
      options: baseOpciones({
        scales: {
          x: Object.assign(ejes({ desdeCero: false }).x, { title: { display: true, text: 'USG% · cuánto usa', color: COL.texto } }),
          y: Object.assign(ejes({ desdeCero: false }).y, { title: { display: true, text: 'TS% · qué tan bien', color: COL.texto } }),
        },
        plugins: Object.assign(baseOpciones().plugins, {
          legend: { display: false },
          tooltip: Object.assign(baseOpciones().plugins.tooltip, {
            callbacks: {
              title: (i) => i[0].raw.name,
              label: (c) => ['USG ' + SGADD.formatear('USG%', c.raw.x), 'TS ' + SGADD.formatear('TS%', c.raw.y), 'MIN ' + c.raw.min.toFixed(1)],
            },
          }),
        }),
      }),
    }));

    const nota = (liga && liga.jugadorTipo)
      ? 'El tamaño de cada punto son los minutos. Arriba a la derecha: mucho volumen y buena eficiencia.'
      : '';
    return `<div class="chart-box is-md"><canvas id="${id}"></canvas></div>${nota ? `<p class="text-[11px] text-muted mt-2">${nota}</p>` : ''}`;
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
    barrasRanking, barrasComparadas, convertidosErrados, radar, evolucion, evolucionJugador, scatterUsoEficiencia,
    nota, narrarPerdidas, narrarPPT, narrarCondicion, narrarRebote, narrarAtaque,
  };
})();
