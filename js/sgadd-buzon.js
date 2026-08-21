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
    /* null = el DT todavía no decidió: la sección de observación se abre
       o se pliega según haya alertas que tapar. Un booleano fija su
       decisión y sobrevive a los repintados del drawer. */
    obsAbierta: null,
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

  /** Las alertas que piden decisión (las que cuentan para la campana). */
  function alertasQuePiden() {
    return E ? E.soloAlertas(estado.alertas) : [];
  }

  /** Los avisos de contexto: dos o tres fechas sin entrar. */
  function avisos() {
    return E ? E.soloAvisos(estado.alertas) : [];
  }

  /**
   * Lo que haya pendiente sobre UN jugador, para pintarlo al lado suyo.
   *
   * Hasta acá el estado confirmado se veía en la ficha pero lo PENDIENTE
   * solo dentro del buzón: el DT tenía que abrir el drawer para enterarse
   * de que ese jugador llevaba fechas sin entrar. Ahora la ficha, la card
   * del plantel y el informe de scouting lo pueden mostrar donde está el
   * jugador, que es donde se lo mira.
   */
  function pendienteDe(nombre, equipo) {
    if (!E) return null;
    return E.pendienteDe(estado.alertas, E.claveJugador(nombre, equipo));
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
    /* El número cuenta las que piden DECISIÓN. Los avisos de dos fechas
       se ven al lado del jugador y en su propia sección del drawer, pero
       no inflan un contador que el DT lee como "tenés esto sin
       contestar": eso volvería a entrenarlo para ignorar la campana. */
    const n = alertasQuePiden().length;
    const nAvisos = avisos().length;
    /* Sin NADA la campana no se muestra. Un icono permanentemente vacío
       entrena a ignorarlo, y después no se ve el que sí importa.

       Con avisos pero sin alertas SÍ se muestra —si no, el DT no tendría
       cómo abrir el drawer para verlos— pero va sin número: el badge
       significa "esto espera una respuesta tuya" y un aviso no la
       espera. */
    if (!n && !nAvisos) return '';
    const etiqueta = n
      ? (n + ' alerta' + (n === 1 ? '' : 's') + ' de plantel pendiente' + (n === 1 ? '' : 's'))
      : (nAvisos + ' jugador' + (nAvisos === 1 ? '' : 'es') + ' en observación');
    return `
      <button type="button" id="buzonBoton" onclick="SGADD_BUZON.abrir(this)"
        aria-label="${SGADD_UI.esc(etiqueta)}"
        title="${SGADD_UI.esc(etiqueta)}"
        class="buzon-boton focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-base">
        <span aria-hidden="true">🔔</span>
        ${n ? `<span class="buzon-badge">${n}</span>` : ''}
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

  /**
   * "Ficha →" · el atajo del buzón a la pantalla del jugador.
   *
   * El aviso dice que alguien lleva tres fechas sin entrar y ahí se corta:
   * para saber si eso importa hay que ver sus minutos, su rol y su log, o
   * sea la ficha. Sin el botón el DT tenía que cerrar el drawer, entrar a
   * Jugadores, elegir el equipo y buscarlo en la grilla.
   *
   * Va también en las tarjetas de alerta: marcar BAJA es la decisión más
   * cara del buzón y mirar la ficha antes es justo lo que hay que poder
   * hacer sin perder la lista.
   */
  function botonFicha(clave, nombre) {
    return `<button type="button" onclick="SGADD_BUZON.irAFicha('${SGADD_UI.escJs(clave)}')"
      aria-label="Ver la ficha de ${SGADD_UI.esc(nombre)}"
      class="shrink-0 text-[10px] px-2 py-1 rounded border border-hairline text-muted
             hover:text-ink hover:border-accent/50 active:scale-95 transition-all duration-150
             focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base">
      Ficha →</button>`;
  }

  function tarjeta(a) {
    const t = TIPOS[a.tipo] || TIPOS.inactividad;
    const icono = t.icono, titulo = t.titulo, tono = t.tono;

    /* El anclaje es la CLAVE del jugador, no el índice del array.

       Con índice, resolver una alerta sin repintar la lista entera dejaba a
       las de abajo apuntando a posiciones corridas —`estado.alertas` se
       recalcula y se acorta— y el clic siguiente resolvía al jugador
       equivocado, sin ningún síntoma visible. La clave es estable: sobrevive
       a que la lista cambie debajo. */
    const accion = (id, texto, clase) => `
      <button type="button" onclick="SGADD_BUZON.resolver('${SGADD_UI.escJs(a.clave)}', '${SGADD_UI.escJs(id)}')"
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
      <li data-alerta="${SGADD_UI.esc(a.clave)}"
        class="buzon-tarjeta rounded-lg border ${tono} bg-surface2/40 p-3">
        <div class="flex items-start gap-2 mb-1.5">
          <span aria-hidden="true" class="text-sm leading-none mt-0.5">${icono}</span>
          <div class="min-w-0 flex-1">
            <p class="text-[10px] uppercase tracking-widest font-display ${tono.split(' ')[0]}">${SGADD_UI.esc(titulo)}</p>
            <p class="text-sm text-white font-medium leading-tight truncate">${SGADD_UI.esc(a.nombre)}</p>
            <p class="text-[11px] text-muted">${SGADD_UI.esc(a.equipo)}</p>
          </div>
          ${botonFicha(a.clave, a.nombre)}
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
    /* Acá sí se repinta entero —reactivar puede hacer aparecer alertas y
       cambia la lista de confirmados a la vez— pero conservando el scroll:
       la lista de confirmados vive al PIE del drawer, así que un salto al
       tope dejaba al DT lejos del botón que acababa de tocar. */
    if (estado.abierto) repintarPanel();
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

  /* Los avisos van en su propia sección y SIN botones de estado: no son
     una decisión pendiente, son un "prestale atención". Mezclarlos con
     las alertas devolvería el buzón de cincuenta tarjetas que nadie
     contesta.

     Y va PLEGADA: con 26 en observación (la U23 real) la lista empuja
     las alertas —lo único que pide respuesta— fuera de la pantalla. El
     encabezado con el número ya dice todo lo que el aviso tiene que
     decir de un vistazo; el detalle se abre si el DT lo quiere. */
  function bloqueAvisos() {
    const lista = avisos();
    if (!lista.length) return '';

    /* Sin alertas que tapar, se abre sola: si no, el drawer se abriría
       prácticamente vacío y habría que adivinar que hay algo adentro.
       Una vez que el DT la pliega o la despliega, manda su decisión. */
    const abierta = estado.obsAbierta === null
      ? !alertasQuePiden().length : estado.obsAbierta;

    const items = lista.map(a => `
      <li class="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-surface2/30 px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm text-white leading-tight truncate">${SGADD_UI.esc(a.nombre)}</p>
          <p class="text-[11px] text-muted truncate">${SGADD_UI.esc(a.equipo)} · ${a.racha} fechas sin entrar</p>
        </div>
        ${botonFicha(a.clave, a.nombre)}
      </li>`).join('');

    return `
      <details id="buzonObservacion" ${abierta ? 'open' : ''}
        ontoggle="SGADD_BUZON.recordarObservacion(this.open)"
        class="mt-4 rounded-lg border border-hairline bg-surface2/20">
        <summary class="cursor-pointer select-none px-3 py-2 text-[10px] uppercase tracking-widest
                        font-display text-muted hover:text-ink transition-colors
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base">
          En observación · ${lista.length}
        </summary>
        <div class="px-3 pb-3">
          <ul class="space-y-1.5">${items}</ul>
          <p class="text-[10px] dato-sec leading-snug mt-2">
            Dos o tres fechas sin entrar casi nunca es una baja: puede ser un golpe,
            un viaje o una sanción. No hace falta decidir nada — si ya sabés qué pasó,
            marcalo desde su ficha.
          </p>
        </div>
      </details>`;
  }
  function panel() {
    const pendientes = alertasQuePiden();
    const n = pendientes.length;
    /* El cierre positivo ("Plantel al día") solo si NO hay nada, ni
       siquiera avisos: decir que está todo bien con seis jugadores en
       observación abajo se contradice solo. */
    const hayAvisos = avisos().length > 0;
    const lista = (n
      ? `<ul id="buzonLista" class="space-y-2.5">${pendientes.map(tarjeta).join('')}</ul>`
      : (hayAvisos ? '' : vacio())) + bloqueAvisos();

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

          <div id="buzonScroll" class="flex-1 overflow-y-auto p-4">${lista}<div id="buzonConfirmados">${bloqueConfirmados()}</div></div>

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

  /* =====================================================================
     REMOCIÓN QUIRÚRGICA · por qué NO se repinta el drawer entero

     Antes, resolver una alerta hacía `root.innerHTML = panel()`. Eso
     reconstruye TODO el drawer, así que el contenedor scrolleable es un nodo
     nuevo y nace en `scrollTop = 0`: el DT resolvía la novena tarjeta y el
     panel lo mandaba de vuelta al principio, perdiendo su lugar de lectura.
     Con quince alertas eso convierte el buzón en algo que no se termina de
     usar.

     Ahora se saca SOLO la tarjeta resuelta —colapsando su altura para que
     las de abajo suban solas— y se restaura la posición de lectura. El
     repintado completo queda como respaldo para el caso raro en que el
     recálculo cambie algo más que la tarjeta tocada (ver `resolver`).
     ===================================================================== */

  const MS_SALIDA = 220;

  /** ¿El usuario pidió menos movimiento? Entonces no hay animación: se
      remueve y listo. Regla del proyecto, no una preferencia de este módulo. */
  function sinMovimiento() {
    return typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Colapsa una tarjeta y la saca del DOM. Las de abajo suben por el flujo
   * natural, sin tocar el scroll.
   *
   * La altura se fija en píxeles ANTES de animar porque `height: auto` no es
   * animable: sin ese paso la tarjeta desaparecería de golpe y el salto sería
   * el mismo que se quiere evitar. Los márgenes y paddings también se
   * colapsan — `space-y-2.5` pone `margin-top` en la siguiente, y si no se
   * anula queda un hueco fantasma donde estaba la tarjeta.
   */
  function quitarTarjeta(li, alTerminar) {
    const fin = () => { if (li.parentNode) li.parentNode.removeChild(li); if (alTerminar) alTerminar(); };
    if (!li) { if (alTerminar) alTerminar(); return; }
    if (sinMovimiento()) { fin(); return; }

    li.style.height = li.offsetHeight + 'px';
    li.style.overflow = 'hidden';
    li.classList.add('buzon-tarjeta-saliendo');
    /* Dos cuadros: el primero fija la altura de partida, el segundo dispara
       la transición. En uno solo el navegador colapsa los dos estilos y no
       hay animación. */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      li.style.height = '0px';
      li.style.opacity = '0';
      li.style.marginTop = '0px';
      li.style.marginBottom = '0px';
      li.style.paddingTop = '0px';
      li.style.paddingBottom = '0px';
      li.style.borderWidth = '0px';
    }));
    setTimeout(fin, MS_SALIDA);
  }

  /** Las claves de las alertas que hoy están pintadas en el drawer. */
  function clavesEnPantalla() {
    const ul = document.getElementById('buzonLista');
    if (!ul) return [];
    return Array.from(ul.querySelectorAll('[data-alerta]')).map(li => li.getAttribute('data-alerta'));
  }

  /**
   * Repintado completo, pero conservando la posición de lectura.
   *
   * También se conserva si el `<details>` de confirmados estaba abierto: al
   * repintar vuelve cerrado por defecto, el contenido se acorta de golpe y
   * el `scrollTop` guardado queda por encima del máximo nuevo, así que el
   * navegador lo recorta a 0. O sea: preservar el scroll sin preservar el
   * desplegable no alcanza — el DT reactivaba a alguien desde el fondo de la
   * lista y el panel lo devolvía al tope igual.
   */
  function repintarPanel() {
    const root = document.getElementById('buzonRoot');
    if (!root) return;
    const prev = document.getElementById('buzonScroll');
    const y = prev ? prev.scrollTop : 0;
    const det = document.querySelector('#buzonConfirmados details');
    const abierto = !!(det && det.open);
    root.innerHTML = panel();
    const detNuevo = document.querySelector('#buzonConfirmados details');
    if (detNuevo && abierto) detNuevo.open = true;
    const nuevo = document.getElementById('buzonScroll');
    if (nuevo) nuevo.scrollTop = Math.min(y, Math.max(0, nuevo.scrollHeight - nuevo.clientHeight));
  }

  /** Recuerda si el DT dejó la sección de observación abierta o plegada. */
  function recordarObservacion(abierta) { estado.obsAbierta = !!abierta; }

  /**
   * Cierra el drawer y abre la ficha del jugador de esa alerta.
   *
   * El slug NO se arma acá: se busca el jugador en el índice y se le pide
   * a `jugadoresSlug()`. Repetir la fórmula sería un segundo lugar que se
   * desincroniza, y ya pasó con el rol funcional.
   */
  function irAFicha(clave) {
    const idx = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado.idx : null;
    if (!E || !idx || typeof jugadoresSlug !== 'function' || typeof navigate !== 'function') {
      toast('No se pudo abrir la ficha: el panel todavía está cargando', 'aviso');
      return;
    }
    const j = (idx.liga.jugadores || [])
      .find(x => E.claveJugador(x['NOMBRES'], x['EQUIPO']) === clave);
    if (!j) { toast('Ese jugador no está en la categoría abierta', 'aviso'); return; }

    /* El foco NO vuelve a la campana: el drawer se cierra porque el DT se
       está yendo a otra pantalla, así que el foco tiene que ir al
       contenido nuevo y no al control que abrió el modal. */
    estado.disparador = null;
    cerrar();

    history.pushState(null, '', SGADD.Ruta.build({
      planilla: SGADD_APP.estado.planillaId, torneo: SGADD_APP.estado.torneo,
      fase: SGADD_APP.estado.fase, seccion: 'jugadores',
      entidad: jugadoresSlug(j), tab: 'general',
    }));
    navigate('jugadores');
    const root = document.getElementById('view-root');
    if (root) { root.setAttribute('tabindex', '-1'); root.focus({ preventScroll: true }); }
  }

  /**
   * Marca el estado de un jugador SIN que exista una alerta.
   *
   * El detector necesita cuatro fechas para sospechar; el DT sabe HOY que
   * el pibe se rompió el tobillo. Esto le deja anotarlo en el momento, y
   * como queda con `origen: "usuario"` ningún escaneo posterior lo pisa
   * (punto 13) ni le vuelve a preguntar.
   *
   * `resolver()` no sirve para esto: arranca buscando la alerta y se va
   * si no la encuentra.
   */
  function marcar(nombre, equipo, idEstado) {
    if (!E) return;
    const clave = E.claveJugador(nombre, equipo);
    estado.mapa = E.aplicar(estado.mapa, clave, idEstado, { origen: 'usuario' });
    persistir();

    const e = E.estado(idEstado);
    toast(e.emoji + ' ' + nombre + ' · ' + e.label, idEstado === 'BAJA' ? 'aviso' : 'ok');

    /* Se recalcula: marcarlo a mano puede sacar una alerta que estaba
       pendiente sobre él, y el badge tiene que reflejarlo. */
    sincronizar();
    repintarSecciones();
    if (estado.abierto) repintarPanel();
  }

  function resolver(clave, idEstado) {
    /* Se busca por CLAVE y no por índice: ver el comentario en `tarjeta`. */
    const a = estado.alertas.filter(x => x.clave === clave)[0];
    if (!a || !E) return;
    estado.mapa = E.aplicar(estado.mapa, a.clave, idEstado, { origen: 'usuario' });
    persistir();

    const e = E.estado(idEstado);
    toast(e.emoji + ' ' + a.nombre + ' · ' + e.label, idEstado === 'BAJA' ? 'aviso' : 'ok');

    /* Se recalculan las alertas: la que se acaba de resolver desaparece
       porque `origen: "usuario"` la excluye del detector. */
    const antes = clavesEnPantalla();
    sincronizar();
    repintarSecciones();
    if (!estado.abierto) return;

    /* El caso normal: lo único que cambió es la tarjeta que se tocó. Se la
       saca sola y nadie pierde el scroll. Si el recálculo movió algo más
       —una alerta nueva, otra que dejó de aplicar— se repinta completo, que
       igual conserva la posición. */
    const esperado = antes.filter(k => k !== clave).sort().join('');
    const real = estado.alertas.map(x => x.clave).sort().join('');
    if (esperado !== real) { repintarPanel(); return; }

    const cont = document.getElementById('buzonScroll');
    const li = document.querySelector('#buzonLista [data-alerta="' + (window.CSS && CSS.escape ? CSS.escape(clave) : clave) + '"]');
    quitarTarjeta(li, () => {
      /* El conteo de confirmados cambió: se actualiza ese bloque solo. */
      const conf = document.getElementById('buzonConfirmados');
      if (conf) conf.innerHTML = bloqueConfirmados();
      /* Resuelta la última, la lista vacía no se muestra como un hueco: va
         el cierre positivo del empty state. */
      const ul = document.getElementById('buzonLista');
      if (ul && !ul.querySelector('[data-alerta]')) {
        const envoltorio = document.createElement('div');
        envoltorio.innerHTML = vacio();
        ul.parentNode.replaceChild(envoltorio.firstElementChild, ul);
      }
      /* Al acortarse el contenido el navegador puede recortar el scroll solo;
         se lo reacomoda al máximo posible en vez de dejarlo saltar. */
      if (cont) cont.scrollTop = Math.min(cont.scrollTop, Math.max(0, cont.scrollHeight - cont.clientHeight));
    });
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
    pendienteDe, avisos, alertasQuePiden, marcar, irAFicha, recordarObservacion,
    abrir, cerrar, resolver, revertir, listaConfirmados, toast,
  };
})();
