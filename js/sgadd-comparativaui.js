/* =====================================================================
   SGADD · Sección COMPARATIVA · la pantalla

   El motor puro es `sgadd-comparativa.js`. Acá vive todo lo que toca
   `document`, igual que estados/buzón y config/configui.

   DOS PREGUNTAS DISTINTAS EN DOS PESTAÑAS:

     EQUIPOS    · ¿qué cambió respecto del corte anterior?
     JUGADORES  · ¿en qué se diferencian estos dos o tres?

   Y en las dos, la regla que sostiene el módulo entero: TENDENCIA es el
   delta contra el ciclo anterior y NIVEL es dónde está parado contra la
   liga. Se pintan en columnas separadas porque son dos lecturas, no una.
   ===================================================================== */

const SGADD_COMPUI = (function () {
  'use strict';

  const C = (typeof SGADD_COMP !== 'undefined') ? SGADD_COMP
    : (typeof require !== 'undefined' ? require('./sgadd-comparativa.js') : null);

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs)
    ? SGADD_UI.escJs(v) : String(v == null ? '' : v);

  const estado = {
    tab: 'equipos',
    equipo: null,
    modo: 'ciclos',        // 'ciclos' | 'fechas'
    ventana: 4,
    desdeA: '', hastaA: '',
    desdeB: '', hastaB: '',
    /* Jugadores elegidos, por `__clave`. Dos o tres: con cuatro la tabla
       deja de entrar a lo ancho y se lee peor que dos comparaciones. */
    jugadores: [],
    equipoJug: null,
  };

  const MAX_JUGADORES = 3;

  /* =====================================================================
     FORMATO

     Un porcentaje de ciclo NUNCA se muestra solo: al lado va el volumen
     que lo sostiene. Es la regla B-3 del proyecto y en una muestra de
     cuatro partidos importa más que en ningún otro lado — un T1% se mueve
     veinte puntos con cuatro tiros.
     ===================================================================== */
  function fmt(v, f) {
    if (v === null || v === undefined) return '—';
    if (f && f.pct) return (v * 100).toFixed(1).replace('.', ',') + '%';
    const d = (f && f.dec !== undefined) ? f.dec : 1;
    const t = v.toFixed(d).replace('.', ',');
    return (f && f.signo && v > 0) ? '+' + t : t;
  }

  function fmtDelta(f) {
    const t = f.tendencia;
    if (t.delta === null) return '—';
    const s = t.delta > 0 ? '+' : '';
    if (f.pct) return s + (t.delta * 100).toFixed(1).replace('.', ',') + ' pp';
    return s + t.delta.toFixed(f.dec === 0 ? 0 : Math.max(1, f.dec)).replace('.', ',');
  }

  /* Los tonos salen del vocabulario cerrado del punto 15: no se inventa un
     hex, porque un hex no sobrevive al aplanado del papel ni garantiza
     contraste. */
  const TONO_TENDENCIA = { mejora: 'zona-exito', empeora: 'zona-peligro',
    estable: 'zona-neutro', 'sin-dato': 'zona-neutro' };
  const TONO_NIVEL = { alto: 'zona-exito', medio: 'zona-neutro', bajo: 'zona-peligro',
    'sin-dato': 'zona-neutro' };
  /* Ningún estado se comunica SOLO con color (punto 14): la flecha dice lo
     mismo para quien no distingue verde de rojo. */
  const FLECHA = { mejora: '▲', empeora: '▼', estable: '=', 'sin-dato': '' };
  const TEXTO_NIVEL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo', 'sin-dato': '—' };

  function fecha(d) {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm;
  }

  function rango(c) {
    if (!c) return '';
    const a = fecha(c.desde), b = fecha(c.hasta);
    return (a && b) ? (a === b ? a : a + ' – ' + b) : '';
  }

  /* =====================================================================
     EQUIPOS
     ===================================================================== */

  function cortesDe(idx) {
    if (!estado.equipo) return null;
    if (estado.modo === 'fechas') {
      const a = C.enRango(idx, estado.equipo, estado.desdeA, estado.hastaA);
      const b = C.enRango(idx, estado.equipo, estado.desdeB, estado.hastaB);
      return {
        ventana: null, total: C.partidosDe(idx, estado.equipo).length,
        actual: C.corte(idx, estado.equipo, a, 'Período A'),
        previo: C.corte(idx, estado.equipo, b, 'Período B'),
      };
    }
    return C.ciclos(idx, estado.equipo, estado.ventana);
  }

  function cabeceraCorte(c, titulo) {
    if (!c) {
      return `<div class="rounded-lg border border-hairline p-3">
        <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(titulo)}</p>
        <p class="text-xs text-muted">Sin partidos en este corte.</p>
      </div>`;
    }
    return `<div class="rounded-lg border border-hairline p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(titulo)}</p>
      <p class="text-sm text-ink font-mono">${c.pj} ${c.pj === 1 ? 'partido' : 'partidos'}
        · ${c.ganados}-${c.perdidos}</p>
      ${rango(c) ? `<p class="text-[11px] text-muted font-mono">${esc(rango(c))}</p>` : ''}
    </div>`;
  }

  function filaMetrica(f) {
    const t = f.tendencia, n = f.nivel;
    return `<tr class="border-t border-hairline/40">
      <td class="py-2 pr-3 text-xs text-ink whitespace-nowrap">
        <span data-metrica="${esc(f.k)}">${esc(f.k)}</span>
        <span class="block text-[10px] text-muted">${esc(f.label)}</span>
      </td>
      <td class="py-2 px-2 text-center font-mono text-sm text-white">${esc(fmt(f.actual, f))}</td>
      <td class="py-2 px-2 text-center font-mono text-xs text-muted">${esc(fmt(f.previo, f))}</td>
      <td class="py-2 px-2 text-center font-mono text-xs whitespace-nowrap">
        <span class="zona-texto ${TONO_TENDENCIA[t.estado]}">${FLECHA[t.estado]} ${esc(fmtDelta(f))}</span>
      </td>
      <td class="py-2 px-2 text-center text-xs whitespace-nowrap">
        <span class="zona-texto ${TONO_NIVEL[n.estado]}">${esc(TEXTO_NIVEL[n.estado])}</span>
        ${n.puesto ? `<span class="block text-[10px] text-muted font-mono">${n.puesto}º de ${n.de}</span>` : ''}
      </td>
      <td class="py-2 pl-2 text-center font-mono text-[11px] text-muted">${esc(fmt(n.mediana, f))}</td>
    </tr>`;
  }

  function tablaBloque(b) {
    return `<section class="card rounded-xl border border-hairline overflow-hidden">
      <header class="px-4 py-3 border-b border-hairline">
        <h3 class="font-display uppercase tracking-wide text-xs text-accent">${esc(b.titulo)}</h3>
        <p class="text-[11px] text-muted">${esc(b.pregunta)}</p>
      </header>
      <div class="scrollbox"><table class="w-full border-collapse">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left p-3 font-display">Métrica</th>
          <th class="text-center p-3 font-display">Actual</th>
          <th class="text-center p-3 font-display">Anterior</th>
          <th class="text-center p-3 font-display">Tendencia</th>
          <th class="text-center p-3 font-display">Nivel</th>
          <th class="text-center p-3 font-display">Liga</th>
        </tr></thead>
        <tbody>${b.filas.map(filaMetrica).join('')}</tbody>
      </table></div>
    </section>`;
  }

  /**
   * Lo que hay que mirar primero.
   *
   * Es la tabla de "métricas críticas" del informe real: las que más se
   * movieron, con las caídas arriba. El informe existe para encontrarlas.
   */
  function bloqueCriticas(r) {
    if (!r.criticas.length) {
      return `<div class="card rounded-xl p-5 border border-hairline">
        <h3 class="font-display uppercase tracking-wide text-xs text-accent mb-1">Sin movimientos</h3>
        <p class="text-xs text-muted">Ninguna métrica se movió más de un
          ${(C.RUIDO_REL * 100).toFixed(0)}% respecto del corte anterior. El equipo
          repitió lo que venía haciendo.</p>
      </div>`;
    }
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-xs text-accent mb-1">Qué cambió</h3>
      <p class="text-[11px] text-muted mb-3">
        Lo que más se movió respecto del corte anterior, las caídas primero.
        Se ordena por el cambio <b>relativo</b>: tres puntos de rating y tres
        puntos de porcentaje no son lo mismo.
      </p>
      <div class="scrollbox"><table class="w-full border-collapse">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left p-2 font-display">Métrica</th>
          <th class="text-center p-2 font-display">Anterior</th>
          <th class="text-center p-2 font-display">Actual</th>
          <th class="text-center p-2 font-display">Tendencia</th>
          <th class="text-center p-2 font-display">Nivel en la liga</th>
        </tr></thead>
        <tbody>${r.criticas.map(f => `<tr class="border-t border-hairline/40">
          <td class="py-2 pr-2 text-xs text-ink"><span data-metrica="${esc(f.k)}">${esc(f.k)}</span>
            <span class="block text-[10px] text-muted">${esc(f.label)}</span></td>
          <td class="py-2 px-2 text-center font-mono text-xs text-muted">${esc(fmt(f.previo, f))}</td>
          <td class="py-2 px-2 text-center font-mono text-sm text-white">${esc(fmt(f.actual, f))}</td>
          <td class="py-2 px-2 text-center font-mono text-xs zona-texto ${TONO_TENDENCIA[f.tendencia.estado]}">
            ${FLECHA[f.tendencia.estado]} ${esc(fmtDelta(f))}</td>
          <td class="py-2 px-2 text-center text-xs zona-texto ${TONO_NIVEL[f.nivel.estado]}">
            ${esc(TEXTO_NIVEL[f.nivel.estado])}${f.nivel.puesto ? ' · ' + f.nivel.puesto + 'º' : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  function controlesEquipo(idx) {
    const lista = (idx.lista() || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const visibles = (typeof SGADD_AUTH !== 'undefined')
      ? SGADD_AUTH.equiposVisibles(lista) : lista;
    const sinF = estado.equipo ? C.sinFecha(idx, estado.equipo) : 0;

    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Equipo</span>
          <select onchange="SGADD_COMPUI.elegirEquipo(this.value)"
            class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink min-w-[12rem]">
            <option value="">Elegí un equipo…</option>
            ${visibles.map(e => `<option value="${esc(e.clave)}"${
              e.clave === estado.equipo ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}
          </select>
        </label>

        <div>
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Cómo se corta</span>
          <div class="inline-flex rounded-md border border-hairline overflow-hidden" role="group"
               aria-label="Cortar por ciclos o por fechas">
            ${[['ciclos', 'Por ciclos', 'Los últimos N contra los N anteriores'],
               ['fechas', 'Por fechas', 'Dos períodos que elegís vos']]
              .map(([id, txt, ayuda]) => `<button type="button" onclick="SGADD_COMPUI.modo('${id}')"
                aria-pressed="${estado.modo === id}" title="${esc(ayuda)}"
                class="px-3 py-2 text-[11px] font-semibold transition-colors duration-150
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset
                       ${estado.modo === id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">${txt}</button>`).join('')}
          </div>
        </div>

        ${estado.modo === 'ciclos' ? `
        <label class="block">
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Partidos por ciclo</span>
          <input type="number" min="1" max="20" step="1" value="${estado.ventana}"
            onchange="SGADD_COMPUI.ventana(this.value)"
            class="w-24 bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink">
        </label>` : `
        <div class="flex flex-wrap gap-3">
          ${['A', 'B'].map(l => `<div>
            <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Período ${l}</span>
            <div class="flex items-center gap-1">
              <input type="date" value="${esc(estado['desde' + l])}"
                onchange="SGADD_COMPUI.fecha('desde${l}', this.value)"
                class="bg-surface2 border border-hairline rounded-md px-2 py-2 text-xs text-ink">
              <span class="text-muted text-xs">a</span>
              <input type="date" value="${esc(estado['hasta' + l])}"
                onchange="SGADD_COMPUI.fecha('hasta${l}', this.value)"
                class="bg-surface2 border border-hairline rounded-md px-2 py-2 text-xs text-ink">
            </div>
          </div>`).join('')}
        </div>`}
      </div>

      <p class="text-[11px] text-muted mt-3 leading-snug">
        ${estado.modo === 'ciclos'
          ? 'El ciclo de <b>4 partidos</b> es el del plan ORO. Se compara contra los 4 anteriores.'
          : 'El <b>Período A</b> es el actual y el <b>B</b> el de referencia.'}
        La columna <b>Nivel</b> mide contra la temporada completa de la liga, no contra
        el ciclo de cada rival: un puesto calculado sobre cuatro partidos de cada uno
        sería ruido.
        ${sinF ? `<br><span class="zona-texto zona-aviso">${sinF} ${sinF === 1
          ? 'partido no tiene fecha y queda afuera de los rangos'
          : 'partidos no tienen fecha y quedan afuera de los rangos'}.</span>` : ''}
      </p>
    </div>`;
  }

  function vistaEquipos(idx) {
    const controles = controlesEquipo(idx);
    if (!estado.equipo) {
      return controles + `<div class="card rounded-xl p-6 border border-hairline text-center">
        <p class="text-sm text-ink mb-1">Elegí un equipo para empezar</p>
        <p class="text-xs text-muted">La comparativa mide un ciclo contra el anterior:
          qué cambió, y si ese cambio alcanza para la liga.</p>
      </div>`;
    }

    const cortes = cortesDe(idx);
    const r = cortes ? C.comparar(idx, estado.equipo, cortes) : null;
    if (!r) {
      return controles + `<div class="card rounded-xl p-6 border border-hairline text-center">
        <p class="text-sm text-ink mb-1">Sin partidos en el corte elegido</p>
        <p class="text-xs text-muted">Probá con otro rango, o con más partidos por ciclo.</p>
      </div>`;
    }

    const pocos = r.actual.pj < C.MIN_PARTIDOS ||
      (r.previo && r.previo.pj < C.MIN_PARTIDOS);

    return controles + `
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h2 class="font-display uppercase tracking-wide text-sm text-ink mb-3">${esc(r.equipo)}</h2>
        <div class="grid sm:grid-cols-2 gap-3">
          ${cabeceraCorte(r.actual, r.actual.etiqueta)}
          ${cabeceraCorte(r.previo, estado.modo === 'fechas' ? 'Período B' : 'Ciclo anterior')}
        </div>
        ${!r.previo ? `<p class="text-[11px] zona-texto zona-aviso mt-3">
          No hay un corte anterior con el que comparar: se muestran los valores del
          actual y su nivel en la liga, sin tendencia.</p>` : ''}
        ${pocos ? `<p class="text-[11px] zona-texto zona-aviso mt-3">
          Alguno de los cortes tiene menos de ${C.MIN_PARTIDOS} partidos. Los porcentajes
          se mueven muchísimo con esa muestra: mirá el volumen antes que el acierto.</p>` : ''}
      </div>
      ${bloqueCriticas(r)}
      ${r.bloques.map(tablaBloque).join('')}
      ${bloqueVolumen(r)}`;
  }

  /**
   * El volumen que sostiene los porcentajes.
   *
   * NO ES UN ADORNO. Un T3% de 25% con 7,2 intentos y otro con 1,2 se leen
   * igual arriba y no significan lo mismo; el informe real cita SIEMPRE el
   * volumen al lado del acierto. Con cortes de cuatro partidos esto pesa
   * más que en ninguna otra pantalla del panel.
   */
  function bloqueVolumen(r) {
    const zonas = [['T2', 'T2C', 'T2I'], ['T3', 'T3C', 'T3I'], ['T1', 'T1C', 'T1I']];
    const linea = (c) => zonas.map(([z, cc, ci]) => {
      const t = c ? c.totales : null;
      const conv = t ? t[cc] : null, int = t ? t[ci] : null;
      return `<td class="py-2 px-2 text-center font-mono text-xs text-ink">${
        (typeof int === 'number' && int) ? (conv || 0) + '/' + int : '—'}</td>`;
    }).join('');
    return `<section class="card rounded-xl border border-hairline overflow-hidden">
      <header class="px-4 py-3 border-b border-hairline">
        <h3 class="font-display uppercase tracking-wide text-xs text-accent">Volumen del corte</h3>
        <p class="text-[11px] text-muted">Convertidos sobre intentos, sumados en cada
          corte. Un porcentaje sin su volumen no se puede leer.</p>
      </header>
      <div class="scrollbox"><table class="w-full border-collapse">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left p-3 font-display">Corte</th>
          ${zonas.map(([z]) => `<th class="text-center p-3 font-display">${z} C/I</th>`).join('')}
        </tr></thead>
        <tbody>
          <tr class="border-t border-hairline/40">
            <td class="py-2 pr-3 text-xs text-ink">${esc(r.actual.etiqueta)}</td>${linea(r.actual)}</tr>
          ${r.previo ? `<tr class="border-t border-hairline/40">
            <td class="py-2 pr-3 text-xs text-muted">${esc(r.previo.etiqueta)}</td>${linea(r.previo)}</tr>` : ''}
        </tbody>
      </table></div>
    </section>`;
  }

  /* =====================================================================
     JUGADORES
     ===================================================================== */

  function vistaJugadores(idx) {
    const lista = (idx.lista() || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const visibles = (typeof SGADD_AUTH !== 'undefined')
      ? SGADD_AUTH.equiposVisibles(lista) : lista;
    const plantel = estado.equipoJug
      ? (idx.liga.jugadoresPorEquipo.get(estado.equipoJug) || []) : [];

    const elegidos = estado.jugadores
      .map(k => (idx.liga.jugadores || []).find(j => j.__clave === k))
      .filter(Boolean);

    const r = elegidos.length >= 2 ? C.compararJugadores(idx, elegidos) : null;

    const selector = `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-end gap-3 mb-3">
        <label class="block">
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Equipo</span>
          <select onchange="SGADD_COMPUI.elegirEquipoJug(this.value)"
            class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink min-w-[12rem]">
            <option value="">Elegí un equipo…</option>
            ${visibles.map(e => `<option value="${esc(e.clave)}"${
              e.clave === estado.equipoJug ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}
          </select>
        </label>
        <p class="text-[11px] text-muted flex-1 min-w-[14rem]">
          Elegí de dos a ${MAX_JUGADORES}. Se pueden mezclar equipos: el selector solo
          decide qué plantel se está mostrando, no borra lo ya elegido.
        </p>
      </div>

      ${plantel.length ? `<div class="flex flex-wrap gap-2">
        ${plantel.slice().sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0)).map(j => {
          const on = estado.jugadores.indexOf(j.__clave) !== -1;
          return `<button type="button" onclick="SGADD_COMPUI.alternarJugador('${escJs(j.__clave)}')"
            aria-pressed="${on}"
            class="text-[11px] px-2.5 py-1.5 rounded border transition-colors
                   ${on ? 'border-accent text-accent bg-accent/10' : 'border-hairline text-muted hover:text-ink'}">
            ${esc(String(j['NOMBRES'] || '').trim())}</button>`;
        }).join('')}
      </div>` : '<p class="text-xs text-muted">Elegí un equipo para ver su plantel.</p>'}

      ${estado.jugadores.length ? `<div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider text-muted font-display">Comparando</span>
        ${elegidos.map(j => `<span class="text-[11px] px-2 py-1 rounded border border-accent text-accent">
          ${esc(String(j['NOMBRES'] || '').trim())}
          <button type="button" onclick="SGADD_COMPUI.alternarJugador('${escJs(j.__clave)}')"
            aria-label="Sacar a ${esc(String(j['NOMBRES'] || '').trim())}"
            class="ml-1 opacity-60 hover:opacity-100">×</button></span>`).join('')}
        <button type="button" onclick="SGADD_COMPUI.limpiarJugadores()"
          class="text-[11px] text-muted hover:text-ink ml-auto">Limpiar</button>
      </div>` : ''}
    </div>`;

    if (!r) {
      return selector + `<div class="card rounded-xl p-6 border border-hairline text-center">
        <p class="text-sm text-ink mb-1">Elegí al menos dos jugadores</p>
        <p class="text-xs text-muted">La comparativa no ordena de mejor a peor:
          muestra en qué se separan.</p>
      </div>`;
    }

    return selector + bloqueRecomendacion(r) + tablaJugadores(r) + bloqueCalendario(idx, elegidos);
  }

  function tablaJugadores(r) {
    const n = r.jugadores.length;
    return `<section class="card rounded-xl border border-hairline overflow-hidden">
      <header class="px-4 py-3 border-b border-hairline">
        <h3 class="font-display uppercase tracking-wide text-xs text-accent">Cara a cara</h3>
        <p class="text-[11px] text-muted">El valor destacado es el mejor de la fila,
          respetando la dirección de cada métrica: en pérdidas por play gana el más bajo.
          Con empate no se marca ninguno.</p>
      </header>
      <div class="scrollbox"><table class="w-full border-collapse">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left p-3 font-display">Métrica</th>
          ${r.jugadores.map(j => `<th class="text-center p-3 font-display">
            ${esc(j.nombre)}<span class="block normal-case tracking-normal text-[10px] opacity-70">${esc(j.equipo)}</span>
          </th>`).join('')}
        </tr></thead>
        <tbody>${r.filas.map(f => `<tr class="border-t border-hairline/40">
          <td class="py-2 pr-3 text-xs text-ink whitespace-nowrap">
            <span data-metrica="${esc(f.k)}">${esc(f.k)}</span>
            <span class="block text-[10px] text-muted">${esc(f.label)}</span></td>
          ${f.valores.map((v, i) => `<td class="py-2 px-2 text-center font-mono text-sm ${
            i === f.mejor ? 'text-accent font-semibold' : 'text-ink'}">${esc(fmt(v, f))}${
            i === f.mejor ? ' <span class="text-[10px]" title="El mejor de la fila">◆</span>' : ''}</td>`).join('')}
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="px-4 py-3 text-[11px] text-muted border-t border-hairline">
        ${n} jugadores comparados. Las cuentas van por partido; las tasas se leen sobre
        la temporada del tramo abierto.</p>
    </section>`;
  }

  function bloqueRecomendacion(r) {
    const rec = r.recomendacion;
    if (!rec || !rec.clave.length) return '';
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-xs text-accent mb-1">En qué se separan</h3>
      <p class="text-[11px] text-muted mb-3">
        Las métricas donde la diferencia es más grande <b>en relación a su propia
        escala</b>. No se listan minutos ni partidos: describen la muestra, no el juego.
      </p>
      <ul class="space-y-2">
        ${rec.clave.map(c => `<li class="flex items-baseline gap-2 text-xs">
          <span class="font-mono text-accent shrink-0" data-metrica="${esc(c.k)}">${esc(c.k)}</span>
          <span class="text-ink">${esc(c.label)}</span>
          <span class="text-muted ml-auto font-mono text-[11px]">
            ${c.mejor >= 0 ? esc(r.jugadores[c.mejor].nombre) : 'empatan'}
            · ${(c.separacion * 100).toFixed(0)}% de diferencia</span>
        </li>`).join('')}
      </ul>
      ${rec.muestraCorta ? `<p class="text-[11px] zona-texto zona-aviso mt-3">
        Alguno tiene ${rec.pjMinimo} ${rec.pjMinimo === 1 ? 'partido' : 'partidos'}: con esa
        muestra, cualquiera de estas diferencias puede ser una noche suelta.</p>` : ''}
    </div>`;
  }

  /**
   * El mismo jugador, ciclo contra ciclo.
   *
   * Es la otra mitad del pedido: no solo A contra B, también A de ahora
   * contra A de hace cuatro partidos. Se apoya en `jugadorPartidos`, que
   * es el log que ya alimenta el tab Evolución.
   */
  function bloqueCalendario(idx, elegidos) {
    const n = estado.ventana;
    const filas = elegidos.map((j) => {
      const log = (idx.liga.jugadorPartidos.get(j.__clave) || []).slice()
        .sort((a, b) => (a.__fecha && b.__fecha) ? a.__fecha - b.__fecha : 0);
      if (log.length < 2) return null;
      const act = log.slice(-n);
      const prev = log.slice(Math.max(0, log.length - 2 * n), Math.max(0, log.length - n));
      const media = (ls, k) => {
        const vs = ls.map(x => x[k]).filter(v => typeof v === 'number' && isFinite(v));
        return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      };
      return {
        nombre: String(j['NOMBRES'] || '').trim(),
        pjA: act.length, pjB: prev.length,
        cols: ['MIN', 'PTS', 'PLAYS'].map(k => ({
          k: k, a: media(act, k), b: prev.length ? media(prev, k) : null,
        })),
      };
    }).filter(Boolean);

    if (!filas.length) return '';

    return `<section class="card rounded-xl border border-hairline overflow-hidden">
      <header class="px-4 py-3 border-b border-hairline">
        <h3 class="font-display uppercase tracking-wide text-xs text-accent">Por bloques de calendario</h3>
        <p class="text-[11px] text-muted">Cada uno contra sí mismo: sus últimos ${n}
          partidos contra los ${n} anteriores. Solo las cuentas — una tasa sobre cuatro
          noches promediada no es la tasa del bloque.</p>
      </header>
      <div class="scrollbox"><table class="w-full border-collapse">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left p-3 font-display">Jugador</th>
          ${['MIN', 'PTS', 'PLAYS'].map(k => `<th class="text-center p-3 font-display" colspan="2">${k}</th>`).join('')}
        </tr>
        <tr class="text-[9px] uppercase tracking-wider text-muted/70">
          <th></th>
          ${['MIN', 'PTS', 'PLAYS'].map(() =>
            '<th class="text-center pb-2">últ.</th><th class="text-center pb-2">prev.</th>').join('')}
        </tr></thead>
        <tbody>${filas.map(f => `<tr class="border-t border-hairline/40">
          <td class="py-2 pr-3 text-xs text-ink whitespace-nowrap">${esc(f.nombre)}
            <span class="block text-[10px] text-muted font-mono">${f.pjA} vs ${f.pjB} PJ</span></td>
          ${f.cols.map(c => {
            const sube = (c.a !== null && c.b !== null) ? (c.a > c.b) : null;
            return `<td class="py-2 px-2 text-center font-mono text-sm ${
              sube === null ? 'text-ink' : (sube ? 'zona-texto zona-exito' : 'zona-texto zona-peligro')
            }">${esc(fmt(c.a, { dec: 1 }))}</td>
            <td class="py-2 px-2 text-center font-mono text-xs text-muted">${esc(fmt(c.b, { dec: 1 }))}</td>`;
          }).join('')}
        </tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  }

  /* =====================================================================
     LA SECCIÓN
     ===================================================================== */

  const TABS = [
    { id: 'equipos', label: 'Equipos · ciclos' },
    { id: 'jugadores', label: 'Jugadores · cara a cara' },
  ];

  function html(idx) {
    if (!C) return '';
    if (!idx || !idx.liga) {
      return (typeof SGADD_UI !== 'undefined')
        ? SGADD_UI.cargando('Cargando la categoría…', 'La comparativa necesita los partidos del torneo.')
        : '';
    }
    return `<div class="space-y-5">
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h2 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Comparativa</h2>
        <p class="text-xs text-muted mb-3">
          Un informe de ciclo no es una foto de la temporada: es la comparación de dos
          cortes. <b>Tendencia</b> mide contra el corte anterior y <b>Nivel</b> contra la
          liga — un equipo puede venir subiendo y seguir último.
        </p>
        ${(typeof SGADD_UI !== 'undefined') ? SGADD_UI.tabs(TABS, estado.tab, 'SGADD_COMPUI.verTab') : ''}
      </div>
      ${estado.tab === 'jugadores' ? vistaJugadores(idx) : vistaEquipos(idx)}
    </div>`;
  }

  function pintar() {
    const r = (typeof document !== 'undefined') ? document.getElementById('view-root') : null;
    if (!r) return;
    const idx = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado.idx : null;
    r.innerHTML = html(idx);
  }

  /* --------------------------------------------------------- handlers */

  function verTab(id) { estado.tab = (id === 'jugadores') ? 'jugadores' : 'equipos'; pintar(); }
  function elegirEquipo(c) { estado.equipo = c || null; pintar(); }
  function elegirEquipoJug(c) { estado.equipoJug = c || null; pintar(); }
  function modo(m) { estado.modo = (m === 'fechas') ? 'fechas' : 'ciclos'; pintar(); }

  function ventana(v) {
    const n = parseInt(v, 10);
    estado.ventana = (isFinite(n) && n >= 1 && n <= 20) ? n : C.VENTANA;
    pintar();
  }

  /* Elegir una fecha SÍ repinta: no se está tipeando, se está eligiendo en
     un calendario, así que no hay foco que perder. Es la contracara de la
     regla de los campos de texto. */
  function fecha(campo, v) {
    if (!(campo in estado)) return;
    estado[campo] = String(v || '');
    pintar();
  }

  /**
   * Suma o saca un jugador de la comparación.
   *
   * EL TOPE ES TRES. Con cuatro la tabla deja de entrar a lo ancho y se
   * lee peor que dos comparaciones seguidas. Al llegar al tope se descarta
   * el más viejo en vez de ignorar el clic: ignorarlo se siente como si la
   * pantalla estuviera rota.
   */
  function alternarJugador(clave) {
    if (!clave) return;
    const i = estado.jugadores.indexOf(clave);
    if (i !== -1) estado.jugadores.splice(i, 1);
    else {
      estado.jugadores.push(clave);
      if (estado.jugadores.length > MAX_JUGADORES) estado.jugadores.shift();
    }
    pintar();
  }

  function limpiarJugadores() { estado.jugadores = []; pintar(); }

  return {
    html, pintar, estado, TABS, MAX_JUGADORES,
    verTab, elegirEquipo, elegirEquipoJug, modo, ventana, fecha,
    alternarJugador, limpiarJugadores,
    fmt, fmtDelta, cortesDe,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_COMPUI;
