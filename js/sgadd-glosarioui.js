/* =====================================================================
   SGADD · Sección Glosario y tooltips de métrica

   El motor puro es `sgadd-glosario.js`, que se GENERA del manual del
   motor. Acá está todo lo que toca `document`: la sección con su buscador
   y el tooltip que aparece al pasar el mouse por una sigla.

   POR QUÉ EL TOOLTIP NO ES UN `title=""`. El nativo tarda un segundo largo
   en aparecer, no se puede leer con el teclado y en una tabla de veinte
   columnas queda tapado por el cursor. El del navegador está bien para
   "este botón hace X"; para una definición de tres renglones que el DT va
   a querer leer entera, no.

   Y SE ENGANCHA UNA SOLA VEZ, en el `document`. Con un listener por celda
   habría cientos —las tablas se repintan enteras en cada cambio de tramo—
   y cada repintado dejaría los viejos colgados. Delegación: un listener,
   sobrevive a cualquier repintado, y no hay nada que limpiar.
   ===================================================================== */

const SGADD_GLOSARIOUI = (function () {
  'use strict';

  const G = (typeof SGADD_GLOSARIO !== 'undefined') ? SGADD_GLOSARIO
    : (typeof require !== 'undefined' ? require('./sgadd-glosario.js') : null);

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  const estado = { busqueda: '', abierto: null };

  /* =====================================================================
     LA SECCIÓN
     ===================================================================== */

  function fila(e) {
    return `<tr class="border-t border-hairline/40 align-top">
      <td class="py-2 pr-3 font-mono text-xs text-accent whitespace-nowrap">${esc(e.sigla)}</td>
      <td class="py-2 pr-3 text-xs text-ink">${esc(e.nombre || '—')}</td>
      <td class="py-2 pr-3 text-xs text-muted">${esc(e.lectura || e.uso || '')}</td>
      <td class="py-2 font-mono text-[11px] text-muted">${esc(e.formula || '')}</td>
    </tr>`;
  }

  function html() {
    if (!G) return '';
    const res = G.filtrar(estado.busqueda);

    return `<div class="space-y-5">
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h2 class="font-display uppercase tracking-wide text-sm text-ink">Glosario de métricas</h2>
          <span class="font-mono text-[11px] text-muted">${G.ENTRADAS.length} términos</span>
        </div>
        <p class="text-xs text-muted">
          Qué mide cada columna y cómo se lee. Sale del manual de MotorStats, que es
          el mismo documento con el que se audita la planilla — así que si una
          definición cambia allá, cambia acá.
        </p>
        <label class="block mt-4">
          <span class="sr-only">Buscar una métrica</span>
          <input type="search" value="${esc(estado.busqueda)}" id="glosarioBuscar"
            placeholder="Buscá una sigla o una palabra: rebote, ritmo, eFG…"
            oninput="SGADD_GLOSARIOUI.buscar(this.value)"
            class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink">
        </label>
      </div>

      ${res.length ? `
        <div class="card rounded-xl border border-hairline overflow-hidden">
          <div class="scrollbox">
            <table class="w-full border-collapse">
              <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
                <th class="text-left p-3 font-display">Sigla</th>
                <th class="text-left p-3 font-display">Nombre</th>
                <th class="text-left p-3 font-display">Cómo se lee</th>
                <th class="text-left p-3 font-display">Fórmula</th>
              </tr></thead>
              <tbody>${res.map(fila).join('')}</tbody>
            </table>
          </div>
        </div>`
        /* Empty state positivo y con salida, no un contenedor vacío
           (punto 14): dice qué se buscó y ofrece volver a la lista. */
        : `<div class="card rounded-xl p-6 border border-hairline text-center">
            <p class="text-sm text-ink mb-1">Sin resultados para «${esc(estado.busqueda)}»</p>
            <p class="text-xs text-muted mb-3">Probá con la sigla, o con una palabra suelta.</p>
            <button onclick="SGADD_GLOSARIOUI.buscar('')"
              class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline">
              Ver los ${G.ENTRADAS.length} términos</button>
          </div>`}
    </div>`;
  }

  /* Tipear repinta SOLO la tabla, no la sección: repintar todo le sacaría
     el foco al buscador y haría imposible escribir una palabra — la misma
     regla que ya cumplen el buscador del buzón y los campos de scouting. */
  function buscar(q) {
    estado.busqueda = String(q == null ? '' : q);
    const cont = document.getElementById('glosarioCuerpo');
    if (!cont) { pintar(); return; }
    cont.innerHTML = html().replace(/^[\s\S]*?<\/label>\s*<\/div>/, '');
    const inp = document.getElementById('glosarioBuscar');
    if (inp && document.activeElement !== inp) { inp.value = estado.busqueda; }
  }

  function pintar() {
    const r = document.getElementById('view-root');
    if (r) r.innerHTML = html();
  }

  /* =====================================================================
     EL TOOLTIP
     ===================================================================== */

  let caja = null;

  function asegurarCaja() {
    if (caja || typeof document === 'undefined') return caja;
    caja = document.createElement('div');
    caja.className = 'glosario-tip';
    caja.setAttribute('role', 'tooltip');
    caja.hidden = true;
    document.body.appendChild(caja);
    return caja;
  }

  /**
   * Ubica el tooltip pegado al elemento, sin salirse de la pantalla.
   *
   * SE ABRE HACIA ARRIBA salvo que no entre: una definición que tapa la
   * fila siguiente estorba menos que una que tapa la que estás mirando. Y
   * se acota al ancho de la ventana, o en celular queda medio afuera.
   */
  function ubicar(el) {
    const r = el.getBoundingClientRect();
    const c = caja.getBoundingClientRect();
    const margen = 8;
    let top = r.top - c.height - margen;
    if (top < margen) top = r.bottom + margen;          // no entra arriba
    let left = r.left;
    const max = window.innerWidth - c.width - margen;
    if (left > max) left = Math.max(margen, max);
    if (left < margen) left = margen;
    caja.style.top = (top + window.scrollY) + 'px';
    caja.style.left = (left + window.scrollX) + 'px';
  }

  function mostrar(el, sigla) {
    const e = G && G.buscar(sigla);
    if (!e) return;
    asegurarCaja();
    caja.innerHTML =
      '<span class="glosario-tip-sigla">' + esc(e.sigla) + '</span>'
      + (e.nombre ? '<span class="glosario-tip-nombre">' + esc(e.nombre) + '</span>' : '')
      + '<span class="glosario-tip-texto">' + esc(e.lectura || e.uso || '') + '</span>'
      + (e.formula ? '<span class="glosario-tip-formula">' + esc(e.formula) + '</span>' : '');
    caja.hidden = false;
    ubicar(el);
    estado.abierto = el;
  }

  function ocultar() {
    if (caja) caja.hidden = true;
    estado.abierto = null;
  }

  /**
   * Qué sigla representa un elemento.
   *
   * Se mira `data-metrica` primero y el TEXTO después. El texto solo se
   * acepta si coincide EXACTO con una sigla del catálogo: sin eso,
   * cualquier celda que dijera "PTS" —el nombre de un jugador, una nota—
   * abriría un tooltip donde no corresponde.
   */
  function siglaDe(el) {
    if (!el || !el.getAttribute) return null;
    const d = el.getAttribute('data-metrica');
    if (d) return d;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 12) return null;
    return (G && G.buscar(t)) ? t : null;
  }

  /**
   * Engancha la delegación. Idempotente: llamarla dos veces no duplica.
   *
   * Se escucha en `document` y no por celda porque las tablas se repintan
   * enteras en cada cambio de tramo: con listeners por nodo habría cientos
   * y cada repintado dejaría los viejos colgados.
   */
  let enganchado = false;
  function iniciar() {
    if (enganchado || typeof document === 'undefined') return;
    enganchado = true;

    const candidato = (t) => {
      /* Solo encabezados de tabla y nodos marcados a mano. Escuchar
         cualquier celda haría aparecer el tooltip sobre los NÚMEROS, que
         es justo donde molesta. */
      if (!t || !t.closest) return null;
      const el = t.closest('th, [data-metrica]');
      if (!el) return null;
      return siglaDe(el) ? el : null;
    };

    document.addEventListener('mouseover', (ev) => {
      const el = candidato(ev.target);
      if (el) mostrar(el, siglaDe(el));
    });
    document.addEventListener('mouseout', (ev) => {
      if (estado.abierto && !ev.relatedTarget) ocultar();
      else if (estado.abierto && ev.relatedTarget && !estado.abierto.contains(ev.relatedTarget)) ocultar();
    });
    /* Con TECLADO también: el tooltip que solo responde al mouse deja
       afuera a quien navega tabulando (punto 14). */
    document.addEventListener('focusin', (ev) => {
      const el = candidato(ev.target);
      if (el) mostrar(el, siglaDe(el));
    });
    document.addEventListener('focusout', () => ocultar());
    /* Y se cierra con ESC y al scrollear: un tooltip que queda flotando
       sobre otra parte de la tabla después de scrollear se lee como un
       error de render. */
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') ocultar(); });
    window.addEventListener('scroll', ocultar, { passive: true });
  }

  return { html, pintar, buscar, iniciar, mostrar, ocultar, siglaDe, estado };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_GLOSARIOUI;
