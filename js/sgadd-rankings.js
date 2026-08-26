/* =====================================================================
   SGADD · Rankings de equipos

   Réplica de la hoja RANKINGS E, generada en el cliente.

   ¿Por qué no leerla directo? Porque RANKINGS E no es una tabla: son
   bloques apilados, con encabezados repetidos, filas TIPO en el medio y
   notas de criterio. GViz asume que la fila 1 son los headers y devuelve
   basura. Además el ranking es DERIVABLE: si tenés PROMEDIOS E, ordenar
   es un sort. Menos frágil, siempre actualizado, y de paso te da los
   percentiles gratis.

   La estructura (títulos, grupos, orden) es la de tu RANKING_METRICS_CONFIG.
   La dirección de cada métrica sale del registro METRICAS, que es la única
   fuente de verdad del dashboard.
   ===================================================================== */

const SGADD_RANKINGS = (function () {
  'use strict';

  /* Mismos grupos y mismo orden que el script de Apps Script.
     `ordenPor` replica la excepción de RITMO + PLAYS, que ordena por PACE
     y no por la primera métrica. */
  const GRUPOS = [
    { id: 'of4f',  titulo: '4 Factores ofensivos',      metricas: ['eFG%', 'PePP%', 'RTL%', 'RO%'] },
    { id: 'def4f', titulo: '4 Factores defensivos',     metricas: ['eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'] },
    { id: 'ritmo', titulo: 'Ritmo + plays',             metricas: ['POS', 'PACE', 'PLAYS', 'PPP'], ordenPor: 'PACE', descriptiva: true },
    { id: 'efic',  titulo: 'Índices de eficiencia',     metricas: ['RTNG OFF', 'RTNG DEF', 'NET RTNG'] },
    { id: 'dist',  titulo: 'Distribución de plays',     metricas: ['PT3%', 'PT2%', 'PT1%', 'PePP%'], descriptiva: true,
      nota: 'Los cuatro suman 100%: describe en qué termina cada play, no si está bien o mal. Por eso no se colorea.' },
    { id: 'tc',    titulo: 'Efectividad tiros de campo', metricas: ['TCC', 'TCI', 'TC%'] },
    { id: 't3',    titulo: 'Efectividad 3 puntos',      metricas: ['PT3%', 'T3%', 'T3C', 'T3I', 'PPT3'] },
    { id: 't2',    titulo: 'Efectividad 2 puntos',      metricas: ['PT2%', 'T2%', 'T2C', 'T2I', 'PPT2'] },
    { id: 't1',    titulo: 'Efectividad tiros libres',  metricas: ['PT1%', 'T1%', 'T1C', 'T1I', 'PPT1'] },
    { id: 'reb',   titulo: 'Rebotes',                   metricas: ['RD', 'RD%', 'RO', 'RO%', 'RT', 'RT%'] },
    { id: 'otras', titulo: 'Otras estadísticas',        metricas: ['AST', 'AST-PP', 'PR', 'PP', 'TC', 'TR', 'FC', 'FR', 'VAL'] },
  ];

  const PJ_MINIMO = 1;   // mismo criterio que tu script

  /**
   * Arma un grupo: valores, puesto por métrica y quién está más cerca de la
   * mediana (la celda que tu planilla pinta de naranja claro).
   */
  function construir(idx, grupo, opciones) {
    const equipos = idx.lista().filter(e => (e.pj || 0) >= PJ_MINIMO);
    const claves = grupo.metricas;

    const filas = equipos.map(e => {
      const f = { equipo: e, valores: {}, puestos: {}, deCuantos: {} };
      claves.forEach(k => {
        const r = idx.leer(e.clave, k);
        f.valores[k] = (r && r.valor !== null) ? r.valor : null;
      });
      return f;
    });

    const cercaMediana = {};

    claves.forEach(k => {
      const m = SGADD.metrica(k);
      if (!m) return;
      const invertida = grupo.descriptiva ? false : m.invertida;

      const conValor = filas.filter(f => f.valores[k] !== null);
      const orden = conValor.slice().sort((a, b) =>
        invertida ? a.valores[k] - b.valores[k] : b.valores[k] - a.valores[k]);

      // Empates: mismo puesto y se saltan los siguientes (1, 2, 2, 4).
      let puesto = 1, previo = null;
      orden.forEach((f, j) => {
        if (j > 0 && f.valores[k] !== previo) puesto = j + 1;
        f.puestos[k] = puesto;
        f.deCuantos[k] = orden.length;
        previo = f.valores[k];
      });

      const med = SGADD.mediana(conValor.map(f => f.valores[k]));
      if (med !== null) {
        let mejor = null, dif = Infinity;
        conValor.forEach(f => {
          const d = Math.abs(f.valores[k] - med);
          if (d < dif) { dif = d; mejor = f.equipo.clave; }
        });
        cercaMediana[k] = mejor;
      }
    });

    /* ORDEN NATURAL DEL GRUPO Y ORDEN ELEGIDO SON DOS COSAS DISTINTAS.

       `claveOrden` es la métrica que define el grupo —en 'Ritmo + plays'
       es PACE y no la primera columna— y es la que da el sentido a la
       tabla. `opciones.ordenPor` es lo que el DT tocó en la cabecera.

       Los PUESTOS (`f.puestos[k]`) ya se calcularon arriba, métrica por
       métrica, y NO dependen de esto: el 1° en eFG% sigue siendo el 1° en
       eFG% aunque la tabla se esté mirando ordenada por PACE. Es la misma
       distinción que hace el ranking de jugadores, y es lo que evita que
       tocar una cabecera convierta el cuadro en otro sin avisar. */
    const o = opciones || {};
    const claveOrden = grupo.ordenPor || claves[0];
    const pedido = (o.ordenPor && claves.indexOf(o.ordenPor) !== -1) ? o.ordenPor : null;
    const usada = pedido || claveOrden;
    const mOrden = SGADD.metrica(usada);
    /* Sin dirección pedida manda la de la métrica: en las invertidas
       —pérdidas, puntos recibidos— 'mejor' es MENOS, así que arrancan al
       revés. Con dirección pedida manda el DT. */
    const invNatural = grupo.descriptiva ? false : (mOrden ? mOrden.invertida : false);
    const dir = o.dir || (invNatural ? 'asc' : 'desc');
    const asc = dir === 'asc';
    filas.sort((a, b) => {
      const va = a.valores[usada], vb = b.valores[usada];
      /* Los nulos SIEMPRE al fondo, ordene como ordene: un `—` arriba de
         todo en ascendente parece el mejor y es el que no tiene dato. */
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return asc ? va - vb : vb - va;
    });

    return { grupo, filas, cercaMediana, claveOrden, n: filas.length,
             ordenPor: usada, dir: dir, reordenada: !!pedido };
  }

  /* ---------------------------------------------------------------------
     Render
     --------------------------------------------------------------------- */

  function tabla(idx, grupo, opciones) {
    const r = construir(idx, grupo, opciones);
    const claves = grupo.metricas;

    const cabecera = `
      <tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-2 pr-2">#</th>
        <th class="pb-2 pr-3">Equipo</th>
        <th class="pb-2 pr-3">PJ</th>
        ${claves.map(k => {
          const m = SGADD.metrica(k);
          const inv = m && m.invertida && !grupo.descriptiva;
          /* La flecha marca por cuál se ordena y en qué sentido; el resto
             lleva un ⇅ tenue para que se note que también responden. */
          const activa = (k === r.ordenPor);
          const flecha = activa ? (r.dir === 'asc' ? '▲' : '▼') : '⇅';
          return `<th class="pb-2 pr-1 whitespace-nowrap cursor-pointer select-none hover:text-accent transition-colors ${activa ? 'text-accent' : ''}"
            onclick="SGADD_RANKINGS.ordenarPor('${SGADD_UI.escJs(k)}')"
            title="Ordenar por ${SGADD_UI.esc(k)} · ${SGADD_UI.esc(m ? m.glosario || m.label : k)}"
            aria-sort="${activa ? (r.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"
            ${SGADD_UI.atributosFila('Ordenar por ' + k)}>
            ${SGADD_UI.esc(k)}${inv ? ' <span class="dato-sec">↓</span>' : ''}
            <span class="${activa ? 'text-accent' : 'opacity-40'}">${flecha}</span></th>
            <th class="pb-2 pr-3 dato-sec">#</th>`;
        }).join('')}
      </tr>`;

    const filas = r.filas.map((f, i) => {
      const propio = SGADD.esEquipoPropio(f.equipo.clave);
      const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(f.equipo.nombre) : null;

      const celdas = claves.map(k => {
        const v = f.valores[k];
        const p = f.puestos[k];
        const de = f.deCuantos[k] || r.n;
        const esMediana = r.cercaMediana[k] === f.equipo.clave;

        // Color por puesto, salvo en las tablas descriptivas.
        let color = 'text-ink';
        if (!grupo.descriptiva && p) {
          if (p <= Math.max(1, Math.ceil(de * 0.25))) color = 'text-green-400';
          else if (p > Math.floor(de * 0.75)) color = 'text-red-400';
        }
        const marca = esMediana ? ' ring-1 ring-accent/50 rounded' : '';
        return `
          <td class="py-1.5 pr-1 font-mono text-xs ${color}${marca}"
              ${esMediana ? 'title="El más cercano a la mediana de la liga"' : ''}>${SGADD_UI.esc(SGADD.formatear(k, v))}</td>
          <td class="py-1.5 pr-3 font-mono text-[10px] text-muted">${p || '—'}</td>`;
      }).join('');

      return `
        <tr class="border-b border-hairline/40 last:border-0 cursor-pointer hover:bg-surface2 ${propio ? 'bg-accent/5' : ''}"
            onclick="equiposIrA('${SGADD_UI.escJs(f.equipo.clave)}')"
            ${SGADD_UI.atributosFila('Abrir la ficha de ' + f.equipo.nombre)}>
          <td class="py-1.5 pr-2 text-xs text-muted font-mono">${i + 1}</td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-2 min-w-0">
              ${logo ? `<img src="${SGADD_UI.esc(logo)}" alt="" class="w-5 h-5 object-contain shrink-0">` : ''}
              <span class="text-xs truncate ${propio ? 'text-accent font-semibold' : ''}">${SGADD_UI.esc(f.equipo.nombre)}</span>
            </div>
          </td>
          <td class="py-1.5 pr-3 font-mono text-xs text-muted">${f.equipo.pj || 0}</td>
          ${celdas}
        </tr>`;
    }).join('');

    // Fila EQUIPO TIPO, igual que en la planilla.
    const tipo = `
      <tr class="border-t-2 border-hairline bg-surface2/40">
        <td class="py-2 pr-2"></td>
        <td class="py-2 pr-3 text-xs font-display uppercase tracking-wide text-muted">Equipo tipo</td>
        <td class="py-2 pr-3 font-mono text-xs text-muted">${idx.liga.pjMediano || '—'}</td>
        ${claves.map(k => {
          const t = idx.liga.tipo[k] !== undefined ? idx.liga.tipo[k]
                  : (idx.liga.medianasCalculadas && idx.liga.medianasCalculadas[k] !== undefined ? idx.liga.medianasCalculadas[k] : null);
          return `<td class="py-2 pr-1 font-mono text-xs text-muted">${SGADD_UI.esc(SGADD.formatear(k, t))}</td>
                  <td class="py-2 pr-3"></td>`;
        }).join('')}
      </tr>`;

    /* La nota del pie tiene que decir lo que se VE. Antes afirmaba siempre
       el criterio del grupo y quedaba contradiciendo a la tabla apenas el
       DT tocaba una cabecera para reordenar. */
    return `
      <div class="scrollbox">
        <table class="w-full tabla-rank">
          <thead>${cabecera}</thead>
          <tbody>${filas}${tipo}</tbody>
        </table>
      </div>
      <p class="text-[11px] text-muted mt-3 leading-snug">
        Criterio: PJ ≥ ${PJ_MINIMO}. El grupo se ordena por
        <span class="font-mono">${SGADD_UI.esc(r.claveOrden)}</span>${
          r.reordenada ? ', y ahora se muestra por <span class="font-mono">' +
            SGADD_UI.esc(r.ordenPor) + '</span>' : ''}.
        La columna <span class="font-mono">#</span> a la derecha de cada métrica es el puesto en la liga.
        El valor con anillo naranja es el más cercano a la mediana.
        ${grupo.nota ? '<br>' + SGADD_UI.esc(grupo.nota) : ''}
      </p>`;
  }

  let abierto = 'of4f';
  let ordenPor = null, ordenDir = null;

  /* Cambiar de grupo RESETEA el orden. Un 'por T3% descendente' heredado
     no significa nada en la tabla de rebotes, y peor: la columna ni
     siquiera existe ahí. Es el mismo criterio que ya usa el ranking de
     jugadores al cambiar de pestaña. */
  function verGrupo(id) {
    abierto = id;
    ordenPor = null; ordenDir = null;
    if (typeof equiposPintar === 'function') equiposPintar();
  }

  /** Click en una cabecera: ordena por esa métrica, y al repetir invierte. */
  function ordenarPor(clave) {
    if (ordenPor === clave) {
      ordenDir = (ordenDir === 'asc') ? 'desc' : 'asc';
    } else {
      ordenPor = clave;
      /* Arranca por el sentido NATURAL de la métrica: en las invertidas
         —pérdidas, eFG% del rival— lo bueno es lo bajo, y empezar por lo
         alto mostraría el peor arriba. */
      const m = SGADD.metrica(clave);
      const g = GRUPOS.find(x => x.id === abierto);
      const inv = (g && g.descriptiva) ? false : !!(m && m.invertida);
      ordenDir = inv ? 'asc' : 'desc';
    }
    if (typeof equiposPintar === 'function') equiposPintar();
  }

  function render(idx) {
    if (!idx || !idx.lista().length) return '';
    const g = GRUPOS.find(x => x.id === abierto) || GRUPOS[0];
    const tabs = GRUPOS.map(x => ({ id: x.id, label: x.titulo }));

    return `
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h3 class="font-display uppercase tracking-wide text-sm mb-1" style="color:#F9FAFB">Rankings de la liga</h3>
        <p class="text-[11px] text-muted mb-4">
          Las mismas tablas de la hoja RANKINGS E, calculadas en vivo desde ${SGADD_UI.esc(idx.liga.n)} equipos.
          Verde = top 25% · Rojo = bottom 25%. Clic en una fila para abrir la ficha.
        </p>
        ${SGADD_UI.tabs(tabs, g.id, 'SGADD_RANKINGS.verGrupo')}
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h4 class="font-display uppercase tracking-wide text-xs text-accent">${SGADD_UI.esc(g.titulo)}</h4>
          ${ordenPor ? `<button onclick="SGADD_RANKINGS.resetOrden()" class="text-[11px] text-muted hover:text-ink">
            Mostrado por <span class="font-mono text-accent">${SGADD_UI.esc(ordenPor)}</span>
            ${ordenDir === 'asc' ? 'de menor a mayor' : 'de mayor a menor'} · volver al orden del grupo</button>` : ''}
        </div>
        ${tabla(idx, g, { ordenPor: ordenPor, dir: ordenDir })}
      </div>`;
  }

  function resetOrden() {
    ordenPor = null; ordenDir = null;
    if (typeof equiposPintar === 'function') equiposPintar();
  }

  return { GRUPOS, construir, tabla, render, verGrupo, ordenarPor, resetOrden,
           get abierto() { return abierto; },
           get ordenPor() { return ordenPor; }, get ordenDir() { return ordenDir; } };
})();

/* Requerible desde Node para testear el motor de orden y de puestos. El
   render usa `document` y se verifica en el navegador, como siempre. */
if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_RANKINGS;
