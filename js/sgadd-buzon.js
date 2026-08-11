/* =====================================================================
   SGADD · Buzón de alertas tácticas · UI

   Capa de presentación de `sgadd-estados.js`. El motor es puro y
   testeable; acá vive todo lo que toca `document`.

   PATRONES APLICADOS (Checklist Design)
   -------------------------------------
   · Drawer   → overlay oscuro con backdrop-blur, entrada/salida animada,
                cierre con ESC, clic afuera y botón explícito. Foco
                atrapado adentro mientras está abierto y devuelto al
                disparador al cerrar.
   · Empty    → cuando no hay nada pendiente NO se muestra una lista
                vacía: se muestra un estado positivo con una marca visual
                y el recuento de lo que sí está resuelto.
   · Feedback → cada acción confirma con un toast que se va solo, y el
                badge se actualiza en el mismo tick.
   · Estados  → focus ring visible en todo lo interactivo, hover y active
                perceptibles, y contraste que pasa WCAG AA.
   ===================================================================== */

const SGADD_BUZON = (function () {
  'use strict';

  const E = (typeof SGADD_ESTADOS !== 'undefined') ? SGADD_ESTADOS : null;

  const estado = {
    abierto: false,
    mapa: {},          // clave -> registro de estado
    alertas: [],
    planillaId: null,
    disparador: null,  // a quién devolverle el foco al cerrar
  };

  /**
   * Id del club activo, para separar los estados por cliente.
   *
   * OJO con la propiedad: es `CLUB.estado.id`, no `CLUB.ID` ni `CLUB.id`.
   * Con la equivocada devolvía `undefined` y todos los clubes escribían en
   * la misma clave — Jujuy habría pisado los estados de Reconquista sin
   * que nadie lo notara, porque el fallback coincidía con el nombre del
   * club por defecto. Hay un test que fija esta cadena.
   */
  function clubId() {
    if (typeof CLUB === 'undefined') return 'default';
    if (CLUB.estado && CLUB.estado.id) return CLUB.estado.id;
    if (CLUB.cfg && CLUB.cfg.id) return CLUB.cfg.id;
    if (typeof CLUB.idDesdeUrl === 'function') { try { return CLUB.idDesdeUrl() || 'default'; } catch (e) {} }
    return 'default';
  }

  /* =====================================================================
     CARGA Y SINCRONIZACIÓN
     ===================================================================== */

  /** Relee estados del almacén y recalcula alertas contra el índice. */
  function sincronizar() {
    if (!E || typeof SGADD_APP === 'undefined') return;
    const st = SGADD_APP.estado;
    if (!st.idx) return;
    estado.planillaId = st.planillaId;
    estado.mapa = E.leerTodos(clubId(), st.planillaId);
    estado.alertas = E.detectarAlertas(st.idx, estado.mapa);
    pintarBadge();
  }

  function persistir() {
    if (!E) return;
    E.guardarTodos(clubId(), estado.planillaId, estado.mapa);
  }

  /** Estado vigente de un jugador, para que lo consulten las secciones. */
  function estadoDe(nombre, equipo) {
    if (!E) return E ? E.estado(E.DEFECTO) : null;
    const r = E.registroDe(estado.mapa, E.claveJugador(nombre, equipo));
    return Object.assign({}, E.estado(r.estado), { origen: r.origen, desde: r.desde, nota: r.nota });
  }

  /** ¿Entra a planes defensivos y rotaciones futuras? */
  function enPlan(nombre, equipo) {
    if (!E) return true;
    return E.enPlan(estado.mapa, E.claveJugador(nombre, equipo));
  }

  /* =====================================================================
     BADGE EN LA BARRA
     ===================================================================== */

  function badge() {
    const n = estado.alertas.length;
    /* Sin alertas la campana NO se muestra. Un icono permanentemente vacío
       entrena a ignorarlo, y después no se ve el que sí importa. */
    if (!n) return '';
    return `
      <button type="button" id="buzonBoton" onclick="SGADD_BUZON.abrir(this)"
        aria-label="${n} alerta${n === 1 ? '' : 's'} de plantel pendiente${n === 1 ? '' : 's'}"
        title="Alertas de plantel"
        class="relative shrink-0 grid place-items-center w-10 h-10 rounded-lg border border-hairline
               bg-surface2 hover:bg-surface2/70 hover:border-yellow-400/50
               active:scale-95 transition-all duration-150
               focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-base">
        <span aria-hidden="true" class="text-base leading-none">🔔</span>
        <span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full
                     bg-yellow-400 text-black text-[10px] font-bold leading-[18px] text-center">${n}</span>
      </button>`;
  }

  function pintarBadge() {
    const cont = document.getElementById('buzonSlot');
    if (cont) cont.innerHTML = badge();
  }

  /* =====================================================================
     DRAWER
     ===================================================================== */

  const TIPOS = {
    reingreso:   { icono: '↩', titulo: 'Volvió a jugar', tono: 'text-green-400 border-green-400/40' },
    traspaso:    { icono: '⇄', titulo: 'Traspaso',       tono: 'text-blue-400 border-blue-400/40' },
    inactividad: { icono: '⏸', titulo: 'Inactividad',    tono: 'text-yellow-400 border-yellow-400/40' },
  };

  function tarjeta(a, i) {
    const t = TIPOS[a.tipo] || TIPOS.inactividad;
    const icono = t.icono, titulo = t.titulo, tono = t.tono;

    const accion = (id, texto, clase) => `
      <button type="button" onclick="SGADD_BUZON.resolver(${i}, '${SGADD_UI.escJs(id)}')"
        class="flex-1 min-w-[7rem] text-[11px] font-semibold px-2.5 py-2 rounded-md border
               transition-all duration-150 active:scale-[0.97]
               focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-base ${clase}">
        ${SGADD_UI.esc(texto)}</button>`;

    /* Las acciones salen de la sugerencia del detector, más "mantener
       activo" que SIEMPRE está: descartar tiene que ser tan fácil como
       confirmar, si no el buzón se vuelve una trampa. */
    const claseDe = (id) =>
      id === 'BAJA' ? 'text-red-400 border-red-400/40 hover:bg-red-400/10 focus-visible:ring-red-400'
      : id === 'ALTA' ? 'text-blue-400 border-blue-400/40 hover:bg-blue-400/10 focus-visible:ring-blue-400'
      : id === 'ACTIVO' ? 'text-green-400 border-green-400/40 hover:bg-green-400/10 focus-visible:ring-green-400'
      : 'text-yellow-400 border-yellow-400/40 hover:bg-yellow-400/10 focus-visible:ring-yellow-400';

    const acciones = (a.sugerencias || []).map(id =>
      accion(id, E.estado(id).emoji + ' ' + E.estado(id).label, claseDe(id))).join('');

    /* En un reingreso la acción neutra NO puede ser "mantener activo" —el
       jugador justamente NO está activo—, sino dejarlo como está. Reusa
       `resolver` con el estado que ya tiene, que lo re-confirma como
       decisión del DT y saca la alerta del buzón. */
    const neutra = a.tipo === 'reingreso'
      ? accion(a.estadoActual, '↺ Dejarlo como está',
          'text-muted border-hairline hover:bg-surface2 focus-visible:ring-accent')
      : accion('ACTIVO', '✓ Mantener activo', claseDe('ACTIVO'));

    return `
      <li class="rounded-lg border ${tono} bg-surface2/40 p-3">
        <div class="flex items-start gap-2 mb-1.5">
          <span aria-hidden="true" class="text-sm leading-none mt-0.5">${icono}</span>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] uppercase tracking-widest font-display ${tono.split(' ')[0]}">${SGADD_UI.esc(titulo)}</p>
            <p class="text-sm text-white font-medium leading-tight truncate">${SGADD_UI.esc(a.nombre)}</p>
            <p class="text-[11px] text-muted">${SGADD_UI.esc(a.equipo)}</p>
          </div>
        </div>
        <p class="text-[11px] dato-sec leading-snug mb-2.5">${SGADD_UI.esc(a.detalle)}</p>
        <div class="flex flex-wrap gap-1.5">
          ${acciones}
          ${neutra}
        </div>
      </li>`;
  }

  /* =====================================================================
     ESTADOS CONFIRMADOS · revertir en cualquier momento

     Sin esta lista, un estado marcado por el DT quedaba sin forma de
     deshacerse: la alerta que lo originó desaparece justamente porque él
     la contestó, así que el buzón se vaciaba y no había dónde volver atrás.
     ===================================================================== */

  function listaConfirmados() {
    if (!E) return [];
    return Object.keys(estado.mapa)
      .map(k => ({ clave: k, reg: E.registroDe(estado.mapa, k) }))
      .filter(x => x.reg.origen === 'usuario' && x.reg.estado !== 'ACTIVO')
      .sort((a, b) => a.clave.localeCompare(b.clave));
  }

  function bloqueConfirmados() {
    const lista = listaConfirmados();
    if (!lista.length) return '';
    return `
      <details class="mt-4 rounded-lg border border-hairline bg-surface2/30">
        <summary class="cursor-pointer select-none px-3 py-2 text-[11px] uppercase tracking-widest
                        font-display text-muted hover:text-ink transition-colors
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base">
          Estados confirmados (${lista.length})
        </summary>
        <ul class="px-3 pb-3 space-y-1.5">
          ${lista.map(x => {
            const e = E.estado(x.reg.estado);
            const nombre = x.clave.split('|')[0];
            const equipo = x.clave.split('|')[1] || '';
            return `<li class="flex items-center justify-between gap-2 py-1 border-b border-hairline/40 last:border-0">
              <div class="min-w-0">
                <p class="text-[11px] text-white truncate">${SGADD_UI.esc(nombre)}</p>
                <p class="text-[10px] ${e.color}">${e.emoji} ${SGADD_UI.esc(e.label)}
                  <span class="text-muted">· ${SGADD_UI.esc(equipo)}${x.reg.desde ? ' · desde ' + SGADD_UI.esc(x.reg.desde) : ''}</span></p>
              </div>
              <button type="button" onclick="SGADD_BUZON.revertir('${SGADD_UI.escJs(x.clave)}')"
                class="shrink-0 text-[10px] px-2 py-1 rounded border border-green-400/40 text-green-400
                       hover:bg-green-400/10 active:scale-95 transition-all duration-150
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-base">
                🟢 Reactivar</button>
            </li>`;
          }).join('')}
        </ul>
      </details>`;
  }

  /** Vuelve a ACTIVO a un jugador ya confirmado, desde la lista de estados. */
  function revertir(clave) {
    if (!E || !clave) return;
    const nombre = String(clave).split('|')[0];
    estado.mapa = E.aplicar(estado.mapa, clave, 'ACTIVO', { origen: 'usuario' });
    persistir();
    toast('🟢 ' + nombre + ' · vuelve a Activo', 'ok');
    sincronizar();
    if (estado.abierto) {
      const root = document.getElementById('buzonRoot');
      if (root) root.innerHTML = panel();
    }
    repintarSecciones();
  }

  /** Empty state: no una lista vacía, un cierre positivo. */
  function vacio() {
    const r = E ? E.resumen(estado.mapa, []) : { marcadosPorUsuario: 0 };
    return `
      <div class="flex flex-col items-center justify-center text-center py-12 px-4">
        <div class="w-14 h-14 rounded-full grid place-items-center border-2 border-green-400/40 bg-green-400/5 mb-3">
          <span aria-hidden="true" class="text-2xl leading-none">✓</span>
        </div>
        <p class="font-display uppercase tracking-wide text-sm text-ink mb-1">Plantel al día</p>
        <p class="text-[11px] text-muted leading-snug max-w-[16rem]">
          No hay ausencias prolongadas ni jugadores repetidos entre equipos.
          ${r.marcadosPorUsuario ? 'Tenés ' + r.marcadosPorUsuario + ' jugador' + (r.marcadosPorUsuario === 1 ? '' : 'es') + ' con estado confirmado a mano.' : ''}
        </p>
      </div>`;
  }

  function panel() {
    const n = estado.alertas.length;
    const lista = n
      ? `<ul class="space-y-2.5">${estado.alertas.map(tarjeta).join('')}</ul>`
      : vacio();

    return `
      <div id="buzonOverlay" onclick="if(event.target===this)SGADD_BUZON.cerrar()"
        class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm buzon-fade">
        <aside role="dialog" aria-modal="true" aria-labelledby="buzonTitulo"
          class="absolute right-0 top-0 h-full w-full sm:w-[26rem] max-w-full
                 bg-base border-l border-hairline shadow-2xl flex flex-col buzon-slide">
          <header class="flex items-center justify-between gap-3 p-4 border-b border-hairline shrink-0">
            <div class="min-w-0">
              <h2 id="buzonTitulo" class="font-display uppercase tracking-wide text-sm text-ink">Alertas de plantel</h2>
              <p class="text-[11px] text-muted truncate">${SGADD_UI.esc(
                (typeof SGADD_APP !== 'undefined' && SGADD_APP.planillaActual()) ? SGADD_APP.planillaActual().label : '')}</p>
            </div>
            <button type="button" onclick="SGADD_BUZON.cerrar()" aria-label="Cerrar alertas"
              class="shrink-0 w-9 h-9 grid place-items-center rounded-lg border border-hairline
                     hover:bg-surface2 active:scale-95 transition-all duration-150
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base">
              <span aria-hidden="true" class="text-sm">✕</span>
            </button>
          </header>

          <div class="flex-1 overflow-y-auto p-4">${lista}${bloqueConfirmados()}</div>

          <footer class="p-3 border-t border-hairline shrink-0">
            <p class="text-[10px] dato-sec leading-snug">
              Lo que confirmes queda guardado en este navegador y
              <b>no lo vuelve a pisar</b> ningún escaneo automático.
            </p>
          </footer>
        </aside>
      </div>`;
  }

  function abrir(disparador) {
    if (estado.abierto) return;
    sincronizar();
    estado.disparador = disparador || document.activeElement;
    const cont = document.createElement('div');
    cont.id = 'buzonRoot';
    cont.innerHTML = panel();
    document.body.appendChild(cont);
    document.body.style.overflow = 'hidden';
    estado.abierto = true;
    document.addEventListener('keydown', teclado, true);
    /* Foco al primer control del drawer: sin esto el lector de pantalla
       sigue leyendo la página de atrás. */
    const foco = cont.querySelector('button');
    if (foco) foco.focus();
  }

  function cerrar() {
    if (!estado.abierto) return;
    const root = document.getElementById('buzonRoot');
    if (root) {
      const ov = document.getElementById('buzonOverlay');
      if (ov) ov.classList.add('buzon-saliendo');
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 160);
    }
    document.body.style.overflow = '';
    estado.abierto = false;
    document.removeEventListener('keydown', teclado, true);
    if (estado.disparador && estado.disparador.focus) {
      try { estado.disparador.focus(); } catch (e) {}
    }
    estado.disparador = null;
  }

  /** ESC cierra; TAB queda atrapado adentro del drawer. */
  function teclado(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); cerrar(); return; }
    if (ev.key !== 'Tab') return;
    const root = document.getElementById('buzonRoot');
    if (!root) return;
    const focos = Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focos.length) return;
    const primero = focos[0], ultimo = focos[focos.length - 1];
    if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus(); }
    else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus(); }
  }

  /* =====================================================================
     RESOLUCIÓN DE UNA ALERTA
     ===================================================================== */

  /** Las secciones que muestran plantel se repintan para reflejar el
      estado nuevo sin que el DT tenga que navegar a otro lado. */
  function repintarSecciones() {
    if (typeof currentSection === 'undefined') return;
    if (currentSection === 'equipos' && typeof equiposPintar === 'function') equiposPintar();
    if (currentSection === 'jugadores' && typeof jugadoresPintar === 'function') jugadoresPintar();
    if (currentSection === 'scouting' && typeof scoutPintar === 'function' &&
        typeof tabState !== 'undefined' && tabState.scouting === 'equipos') scoutPintar();
  }

  function resolver(indice, idEstado) {
    const a = estado.alertas[indice];
    if (!a || !E) return;
    estado.mapa = E.aplicar(estado.mapa, a.clave, idEstado, { origen: 'usuario' });
    persistir();

    const e = E.estado(idEstado);
    toast(e.emoji + ' ' + a.nombre + ' · ' + e.label, idEstado === 'BAJA' ? 'aviso' : 'ok');

    /* Se recalculan las alertas: la que se acaba de resolver desaparece
       porque `origen: "usuario"` la excluye del detector. */
    sincronizar();
    if (estado.abierto) {
      const root = document.getElementById('buzonRoot');
      if (root) root.innerHTML = panel();
    }
    repintarSecciones();
  }

  /* =====================================================================
     TOAST · feedback inmediato
     ===================================================================== */

  function toast(texto, tono) {
    let cont = document.getElementById('toastSlot');
    if (!cont) {
      cont = document.createElement('div');
      cont.id = 'toastSlot';
      cont.setAttribute('role', 'status');
      cont.setAttribute('aria-live', 'polite');
      cont.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none';
      document.body.appendChild(cont);
    }
    const color = tono === 'aviso' ? 'border-yellow-400/50' : tono === 'error' ? 'border-red-400/50' : 'border-green-400/50';
    const el = document.createElement('div');
    el.className = 'toast-in px-4 py-2.5 rounded-lg border ' + color +
      ' bg-surface2 shadow-xl text-xs text-ink max-w-[22rem] text-center';
    el.textContent = texto;
    cont.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 2600);
  }

  return {
    estado, sincronizar, badge, pintarBadge, estadoDe, enPlan,
    abrir, cerrar, resolver, revertir, listaConfirmados, toast,
  };
})();
