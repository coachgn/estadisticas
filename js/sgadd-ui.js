/* =====================================================================
   SGADD · Componentes de UI

   Funciones puras: reciben datos, devuelven HTML. Sin estado, sin efectos.
   Así el diagnóstico y las secciones futuras pintan lo mismo sin duplicar.

   Todas toman el objeto que devuelve idx.leer() / idx.leerJugador().
   ===================================================================== */

const SGADD_UI = (function () {
  'use strict';

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ¿El delta es bueno o malo? Respeta métricas invertidas. */
  function signoDelta(r) {
    if (r.delta === null || r.descriptiva) return null;
    if (Math.abs(r.delta) < 1e-9) return 0;
    const bueno = r.invertida ? r.delta < 0 : r.delta > 0;
    return bueno ? 1 : -1;
  }

  function colorDelta(r) {
    const s = signoDelta(r);
    if (s === null) return 'text-muted';
    if (s === 0) return 'text-muted';
    return s > 0 ? 'text-green-400' : 'text-red-400';
  }

  /* ---------------------------------------------------------------------
     PercentileBar

     Barra 0-100 con marca en la mediana. Cuando la muestra es pobre pierde
     el color y gana un tilde: el dato sigue ahí, la confianza no.
     --------------------------------------------------------------------- */
  function percentileBar(r, opciones) {
    const o = opciones || {};
    if (r.descriptiva) return '';
    const pct = (r.percentil === null) ? null : Math.max(0, Math.min(100, r.percentil));
    if (pct === null) {
      return `<div class="h-1 bg-hairline rounded-full mt-2"></div>
              <p class="text-[10px] text-muted mt-1 font-mono">sin percentil</p>`;
    }
    const flojo = (r.muestraSuficiente === false);
    const color = flojo ? 'bg-muted' : (pct >= 66 ? 'bg-green-400' : pct >= 34 ? 'bg-accent' : 'bg-red-400');
    const nota = [
      (flojo ? '~' : '') + 'pctil ' + pct.toFixed(0),
      o.ranking ? o.ranking.puesto + '°/' + o.ranking.de : null,
      flojo && r.pj ? 'PJ ' + r.pj : null,
    ].filter(Boolean).join(' · ');

    return `
      <div class="relative h-1 bg-hairline rounded-full mt-2 overflow-hidden">
        <div class="h-full ${color} rounded-full transition-all" style="width:${pct.toFixed(0)}%"></div>
        <div class="absolute inset-y-0 left-1/2 w-px bg-ink/40" title="mediana"></div>
      </div>
      <p class="text-[10px] ${flojo ? 'text-yellow-400' : 'text-muted'} mt-1 font-mono">${esc(nota)}</p>`;
  }

  /* ---------------------------------------------------------------------
     StatCard

     La tarjeta de una métrica: valor grande, delta contra la mediana con
     su signo interpretado, y barra de percentil.
     --------------------------------------------------------------------- */
  function statCard(r, opciones) {
    if (!r) return '';
    const o = opciones || {};
    const s = signoDelta(r);
    const flecha = s === null || s === 0 ? '' : (r.delta > 0 ? '▲' : '▼');
    const deltaTxt = (r.delta === null)
      ? ''
      : `<p class="text-[11px] ${colorDelta(r)} font-mono">
           ${flecha} ${esc((r.delta > 0 ? '+' : '') + SGADD.formatear(r.clave, r.delta))} vs mediana
         </p>`;

    return `
      <div class="bg-surface2/50 rounded-lg p-3 ${o.clase || ''}">
        <p class="text-[10px] uppercase tracking-wider text-muted font-display truncate" title="${esc(r.label)}">${esc(r.label)}</p>
        <p class="font-display text-2xl text-ink leading-tight">${esc(r.formateado)}</p>
        ${deltaTxt}
        ${percentileBar(r, o)}
      </div>`;
  }

  /* ---------------------------------------------------------------------
     MetricTable — una vista completa (los 4 factores, el tiro, etc.)
     --------------------------------------------------------------------- */
  function metricTable(vista, opciones) {
    if (!vista) return '';
    const o = opciones || {};
    const filas = vista.filas.map(r => {
      const pct = (vista.descriptiva || r.percentil === null) ? '—' : r.percentil.toFixed(0);
      const colorPct = vista.descriptiva ? 'text-muted'
        : (r.percentil >= 66 ? 'text-green-400' : r.percentil >= 34 ? 'text-accent' : 'text-red-400');
      return `
        <tr class="border-b border-hairline/40 last:border-0">
          <td class="py-1.5 pr-3 text-xs">${esc(r.label)}${r.invertida && !vista.descriptiva ? ' <span class="text-muted" title="menos es mejor">↓</span>' : ''}</td>
          <td class="py-1.5 pr-3 font-mono text-xs text-ink">${esc(r.formateado)}</td>
          <td class="py-1.5 pr-3 font-mono text-xs text-muted">${esc(r.tipoFormateado)}</td>
          <td class="py-1.5 font-mono text-xs ${colorPct}">${esc(pct)}</td>
        </tr>`;
    }).join('');

    const pie = [
      vista.nota ? `<p class="text-[10px] text-muted mt-2 leading-snug">${esc(vista.nota)}</p>` : '',
      vista.suma !== undefined
        ? `<p class="text-[10px] mt-1 font-mono ${vista.sumaOk ? 'text-green-400' : 'text-red-400'}">suma ${(vista.suma * 100).toFixed(2)}%</p>`
        : '',
    ].join('');

    return `
      <div class="${o.clase || ''}">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">${esc(vista.label)}</h5>
        <table class="w-full text-left">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
            <th class="pb-1 pr-3">Métrica</th>
            <th class="pb-1 pr-3">Valor</th>
            <th class="pb-1 pr-3">Mediana</th>
            <th class="pb-1">Pctil</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        ${pie}
      </div>`;
  }

  /* ---------------------------------------------------------------------
     TeamPicker — grilla de escudos. Reusa el módulo LOGOS del index.
     --------------------------------------------------------------------- */
  function teamPicker(equipos, opciones) {
    const o = opciones || {};
    const hayLogos = (typeof LOGOS !== 'undefined');

    const tiles = equipos.map(e => {
      const url = hayLogos ? LOGOS.getUrl(e.nombre) : null;
      const activo = o.seleccionado && SGADD.claveEquipo(o.seleccionado) === e.clave;
      const propio = SGADD.esEquipoPropio(e.clave);
      const escudo = url
        ? `<img src="${esc(url)}" alt="" class="w-10 h-10 object-contain">`
        : `<span class="w-10 h-10 rounded-full grid place-items-center text-xs font-semibold bg-surface2 text-ink border border-accent/60">
             ${esc(hayLogos ? LOGOS.iniciales(e.nombre) : e.nombre.slice(0, 2))}
           </span>`;
      return `
        <button type="button" onclick="${esc(o.onClick || 'void 0')}('${escJs(e.clave)}')"
          class="flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors
                 ${activo ? 'border-accent bg-surface2' : 'border-hairline hover:bg-surface2'}">
          ${escudo}
          <span class="text-[11px] text-center leading-tight ${propio ? 'text-accent font-semibold' : 'text-white'}">
            ${esc(e.nombre)}
          </span>
          ${e.pj ? `<span class="text-[10px] text-muted font-mono">PJ ${e.pj}</span>` : ''}
        </button>`;
    }).join('');

    return `<div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">${tiles}</div>`;
  }

  /* ---------------------------------------------------------------------
     TabbedPanel — tabs con el id en el hash, para que el link sea compartible.
     --------------------------------------------------------------------- */
  function tabs(lista, activo, onClick) {
    const items = lista.map(t => `
      <button type="button" onclick="${esc(onClick)}('${escJs(t.id)}')"
        class="px-3 py-2 text-xs font-display uppercase tracking-wider rounded-md transition-colors
               ${t.id === activo ? 'bg-accent text-base' : 'text-muted hover:text-ink hover:bg-surface2'}"
        ${t.disponible === false ? 'disabled title="Sin datos suficientes"' : ''}>
        ${esc(t.label)}
      </button>`).join('');
    return `<div class="flex flex-wrap gap-1 border-b border-hairline pb-2 mb-4">${items}</div>`;
  }

  /* ---------------------------------------------------------------------
     Avisos
     --------------------------------------------------------------------- */
  function aviso(titulo, texto, tono) {
    const c = tono === 'error' ? 'red-400' : tono === 'ok' ? 'green-400' : 'yellow-400';
    return `
      <div class="rounded-lg border border-${c}/40 bg-${c}/5 p-3">
        <p class="text-xs text-${c} font-display uppercase tracking-wide mb-1">${esc(titulo)}</p>
        <p class="text-[11px] text-muted leading-snug">${esc(texto)}</p>
      </div>`;
  }

  /* Color del +/-. Deliberadamente TENUE, y con clases propias definidas a
     mano en el <style> del index.html en vez de utilidades de Tailwind: son
     nodos inyectados dinámicamente y el JIT del CDN no las genera (misma
     razón que los respaldos de text-accent / text-ink). El verde y el rojo
     plenos ya los usa el marcado de rendimientos atípicos del box score; si
     el +/- compitiera con eso, la tabla tendría dos semáforos y no se leería
     ninguno. El 0 va neutro: ni bueno ni malo. */
  function claseMasMenos(v) {
    if (typeof v !== 'number' || !isFinite(v) || v === 0) return 'mm-cero';
    return v > 0 ? 'mm-pos' : 'mm-neg';
  }

  /**
   * Un valor que va DENTRO de un string de JavaScript, DENTRO de un atributo
   * HTML: `onclick="f('${escJs(x)}')"`. Son dos capas de escape y hay que
   * hacerlas en este orden.
   *
   * El bug que cierra: los equipos de La Plata se llaman `RECONQUISTA 'A' - MM`.
   * Con solo `esc()` el atributo queda `f(&#39;RECONQUISTA &#39;A&#39;...&#39;)`,
   * el parser HTML decodifica las entidades ANTES de que exista el JS, y el
   * handler pasa a ser `f('RECONQUISTA 'A' - MM')` → SyntaxError. El clic no
   * hacía nada y no había error visible en pantalla.
   *
   * Primero se cierra el literal de JS (barra invertida y comilla simple) y
   * recién después se escapa el HTML: al revés, `esc()` convertiría la barra
   * que acabamos de agregar en parte del texto.
   */
  function escJs(v) {
    return esc(String(v === null || v === undefined ? '' : v)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'"));
  }

  /* =====================================================================
     ESCUDOS EN EL PAPEL

     Al imprimir, el navegador vuelve a resolver el `src` de cada <img>, y
     cualquier cosa que falle en ese momento —la ruta relativa, el caché, el
     origen del documento— deja la imagen afuera del PDF sin ningún aviso.
     Medido: un informe con 9 escudos en pantalla salía con CERO imágenes.

     Con la imagen dibujada en un canvas y serializada, el `src` no depende
     de nada externo. Vive acá y no en un módulo de sección porque lo
     necesitan las TRES exportaciones (scouting, informe de equipo y
     post-partido) y `sgadd-ui.js` carga antes que todas.
     ===================================================================== */

  /** Pasa a `data:` URI las imágenes de `raiz` (selector o nodo).
   *  Sincrónico a propósito: las que ya están en pantalla no esperan nada.
   *  Una que no esté lista se deja como está — mejor su `src` original que
   *  una imagen en blanco. */
  function embeberImagenes(raiz) {
    const cont = typeof raiz === 'string' ? document.querySelector(raiz) : raiz;
    if (!cont) return 0;
    let n = 0;
    Array.prototype.forEach.call(cont.querySelectorAll('img'), (img) => {
      if (!img.complete || !img.naturalWidth) return;
      if (String(img.getAttribute('src') || '').indexOf('data:') === 0) return;
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        img.setAttribute('data-src', img.getAttribute('src'));
        img.setAttribute('src', c.toDataURL('image/png'));
        n++;
      } catch (e) { /* lienzo contaminado: se deja el src original */ }
    });
    return n;
  }

  /** Devuelve las imágenes a su ruta original después de imprimir. */
  function restaurarImagenes(raiz) {
    const cont = typeof raiz === 'string' ? document.querySelector(raiz) : raiz;
    if (!cont) return;
    Array.prototype.forEach.call(cont.querySelectorAll('img[data-src]'), (img) => {
      img.setAttribute('src', img.getAttribute('data-src'));
      img.removeAttribute('data-src');
    });
  }

  return { esc, escJs, statCard, percentileBar, metricTable, teamPicker, tabs, aviso, signoDelta, colorDelta, claseMasMenos,
    embeberImagenes, restaurarImagenes };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_UI;
