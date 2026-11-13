/* =====================================================================
   SGADD · RECORRIDO GUIADO DE LA DEMO

   Una guía que NO se impone. El entrenador entra a la demo, mira lo que
   quiere, y la guía le ofrece —una vez por sección, en chico— mostrarle
   qué va a encontrar ahí. Si dice que no, no vuelve a insistir; si dice
   que sí, la sección se oscurece salvo lo que se explica, paso a paso.

   TRES COSAS QUE LA HACEN DISCRETA, y hay que respetarlas al tocarla:

   1 · NUNCA ES MODAL. El oscurecido no atrapa clics (`pointer-events:
       none`) y el foco no se secuestra: se puede seguir usando el panel
       con la guía abierta, y Esc la pausa.

   2 · SE ACTIVA Y SE PAUSA EN CUALQUIER MOMENTO. El botón «Guía» queda
       siempre a la vista y abre un menú con lo único que hay que saber:
       recorrer la sección, explicar lo que se toca, y apagar las
       sugerencias. Pausar un recorrido guarda el paso, así se retoma.

   3 · «EXPLICAR AL TOCAR». Con ese modo encendido, tocar una tarjeta, una
       pestaña o un ítem del menú muestra qué es en vez de abrirlo. Es un
       modo explícito y se ve que está prendido: interceptar clics sin
       avisar sería lo opuesto de no ser invasivo.

   SOLO VIVE EN LA DEMO. En un panel de cliente real no se monta nada.
   Las preferencias van en `sessionStorage`: la demo es de paso, y una
   guía que «recuerda» para siempre a quien la rechazó una vez deja de
   dejarlo volver a probarla.

   EL MOTOR ES PURO (recorridos, tiempos, navegación entre pasos) y está
   exportado para poder testearlo sin navegador. Lo que toca `document`
   vive abajo, en la sección UI.
   ===================================================================== */
const SGADD_TOUR = (function () {
  'use strict';

  const CLAVE = 'sgadd.tour.v1';

  /* =====================================================================
     LOS RECORRIDOS · datos puros

     Cada paso apunta a algo de la pantalla de dos maneras, la que sea
     más estable:

       { css: '#principalClasif' }              un selector
       { h: 'Resumen General' }                 el título de la card: se
                                                busca el h2/h3/h4 que
                                                empiece con ese texto y
                                                se sube a su `cont`
       { txt: 'Exportar PDF', tag: 'button' }   un botón por su texto

     Un paso cuyo objetivo no está en pantalla SE SALTEA: una guía que se
     queda trabada porque cambió un título es peor que no tener guía.

     `antes` es una acción que prepara la pantalla (abrir un equipo,
     armar un cruce de ejemplo). Solo se ejecuta si el usuario empezó el
     recorrido: la guía nunca toca la pantalla por su cuenta.

     LOS TEXTOS DESCRIBEN LO QUE LA SECCIÓN HACE DE VERDAD, y lo dicen
     en el idioma del cuerpo técnico: qué decisión ayuda a tomar.
     ===================================================================== */
  const RECORRIDOS = {
    principal: {
      titulo: 'Principal',
      intro: 'La foto de toda la categoría en una pantalla.',
      pasos: [
        { css: '#view-root .card.no-imprimir', titulo: 'Elegí qué mirar',
          texto: 'Cambiás de categoría y de fase del torneo. Todo el panel se recalcula con la competencia que elijas.' },
        { h: 'Resumen General', cont: 'div', titulo: 'La foto de la competencia',
          texto: 'Cuántos equipos, jugadores y partidos lleva el torneo y quién tiene el mejor ataque. Te ubica en dos segundos.' },
        { h: 'Líderes', cont: 'div', titulo: 'Quién manda en cada estadística',
          texto: 'Puntos, rebotes y asistencias por jugador. En la demo los nombres son anónimos.' },
        { h: 'Tabla de posiciones', cont: 'div', titulo: 'La tabla de posiciones',
          texto: 'Récord, diferencia y puntos a favor y en contra. Es la misma de la sección Clasificación, resumida.' },
        { css: '#ortgDrtgChart', cont: '.card', titulo: 'Ataque contra defensa',
          texto: 'Cada punto es un equipo. Arriba a la derecha están los de ataque y defensa fuertes; las líneas punteadas marcan la media de la liga.' },
        { css: '#buzonSlot button', titulo: 'La campanita: alertas de plantel',
          texto: 'Sabé qué jugadores de tu liga dejaron o volvieron a jugar. Tocala para ver el detalle y marcar lesionados, suspendidos o bajas: el cuerpo técnico lo ve compartido.' },
      ],
    },
    equipos: {
      titulo: 'Equipos',
      intro: 'La ficha completa de cada equipo contra la liga.',
      pasos: [
        { h: 'Elegí un equipo', cont: '.card', titulo: 'Tu equipo, a fondo',
          texto: 'La card abre la ficha completa de tu equipo. A los rivales los analizás en Scouting y en las tablas de toda la liga, acá abajo.' },
        { h: 'Rankings de la liga', cont: '.card', titulo: 'Las tablas de toda la liga',
          texto: '4 factores, ritmo, tiros y rebotes de todos los equipos. Tocá el título de una columna para ordenar.' },
        { css: '.rend-raiz', antes: 'primerEquipo', titulo: 'Dónde está tu equipo contra la liga',
          texto: 'Rating neto, ofensivo y defensivo con su percentil. El color te dice si está arriba, en rango o abajo de la liga.' },
        { css: '[data-tab="general"]', cont: 'div', titulo: 'Las pestañas del equipo',
          texto: 'General, ofensiva, defensiva, 4 factores, local y visitante, identidad táctica, plantel y partidos. Cada una responde una pregunta distinta.' },
        { txt: 'informe PDF', tag: 'button', titulo: 'El informe en PDF',
          texto: 'Elegís qué secciones querés y sale listo para imprimir o mandar por WhatsApp.' },
      ],
    },
    jugadores: {
      titulo: 'Jugadores',
      intro: 'El perfil 360° de cada jugador de tu equipo y de la liga.',
      pasos: [
        { h: 'Elegí un equipo', cont: '.card', titulo: 'El plantel de cada equipo',
          texto: 'Elegís un equipo y ves a todo su plantel ordenado por minutos. De ahí entrás a la ficha de cada jugador.' },
        { txt: 'TOP 3 del plantel', tag: 'summary', cont: 'details', antes: 'primerEquipoJugadores',
          titulo: 'TOP 3 del plantel',
          texto: 'Los tres mejores de tu equipo en cada dimensión: producción, eficiencia, tiro, rebotes y creación. Está plegado: tocalo para abrirlo.' },
        { h: 'Plantel', cont: '.card', titulo: 'Tu plantel, jugador por jugador',
          texto: 'Cada card muestra rol por minutos, etiquetas y números clave. Tocá una para abrir su ficha: perfil de tiro, evolución partido a partido y más.' },
        { txt: 'Pack PLANTEL', tag: 'button', titulo: 'Pack PLANTEL',
          texto: 'Bajás las fichas de todo el plantel en un solo PDF: elegís qué cards incluir y a qué jugadores. Ideal para una charla técnica.' },
        { h: 'Ranking del plantel', cont: '.card', titulo: 'El ranking del plantel',
          texto: 'Las mismas tablas de la liga pero adentro de tu equipo: cómo se reparte la producción entre los tuyos. Alterná entre promedios y totales.' },
        { h: 'Rankings de la liga', cont: '.card', titulo: 'Los rankings de la liga',
          texto: 'Los 20 mejores de toda la competencia por métrica: producción, eficiencia, tiro de dos y de tres, libres, rebotes y creación.' },
      ],
    },
    clasificacion: {
      titulo: 'Clasificación',
      intro: 'La tabla de posiciones con las zonas del torneo.',
      pasos: [
        { h: 'Tabla de posiciones', cont: 'div', titulo: 'La tabla completa',
          texto: 'Récord, diferencia de puntos y desglose de local y visitante, con las zonas de ascenso, repechaje y descenso que declare cada competencia.' },
      ],
    },
    fixture: {
      titulo: 'Fixture',
      intro: 'El calendario del torneo, con lo jugado y lo que viene.',
      pasos: [
        { h: 'Torneo de muestra', cont: '.card', titulo: 'El torneo de un vistazo',
          texto: 'Cuántos partidos hay en el calendario y cuántos ya se jugaron. Si tu liga publica su fixture, aparece solo: no cargás nada.' },
        { h: 'Calendario de la zona', cont: '.card', titulo: 'Lo jugado y lo que viene',
          texto: 'Los partidos del mes con su resultado. Tus partidos dicen si jugás de local o de visitante; con las flechas cambiás de mes.' },
      ],
    },
    scouting: {
      titulo: 'Scouting',
      intro: 'El informe pre-partido, calculado.',
      pasos: [
        { h: 'Informe pre-partido', cont: '.card', titulo: 'Armá el cruce',
          texto: 'Elegís local y visitante y el informe se arma solo desde los box scores oficiales. No cargás nada.' },
        { css: '#scoutInforme [data-bloque="encabezado"]', antes: 'cruceEjemplo', titulo: 'Cómo llegan los dos',
          texto: 'Récord de cada equipo, último partido e historial directo. Armamos un cruce de ejemplo para que lo veas.' },
        { css: '#scoutInforme [data-bloque="matriz"]', titulo: 'Métrica por métrica',
          texto: 'Ritmo, eficiencia y rebote de los dos contra la mediana de la liga, con el puesto de cada uno.' },
        { css: '#scoutInforme [data-bloque="marcas"]', titulo: 'Quién marca a quién',
          texto: 'El plan defensivo colectivo con la marca sugerida jugador por jugador. El dato sugiere; decide el cuerpo técnico.' },
        { css: '#scoutInforme [data-bloque="claves"]', titulo: 'Las claves del partido',
          texto: 'Reglas que se activan solas según los datos del rival: dónde atacar y qué cuidar.' },
        { txt: 'Exportar PDF', tag: 'button', titulo: 'Llevalo impreso',
          texto: 'Elegís las cards que querés y el informe sale en PDF, listo para el vestuario.' },
      ],
    },
  };

  /* Qué dice cada pestaña de la ficha de un equipo, para «explicar al
     tocar». Texto corto: es lo que hay que saber antes de abrirla. */
  const PESTANAS = {
    general: 'El resumen del equipo: rating, métricas clave contra la liga y sus últimos partidos.',
    ofensiva: 'Cómo ataca: eficiencia, tiro y de dónde le llegan los puntos.',
    defensiva: 'Cómo defiende: qué permite al rival y dónde se le escapa.',
    '4factores': 'Los cuatro factores del básquet —tiro, pérdidas, rebote y libres— de ataque y defensa.',
    condicion: 'Cómo rinde de local y de visitante.',
    personalidad: 'Ocho ejes de identidad táctica contra la liga. Ninguno es bueno o malo: describen estilo.',
    plantel: 'Todo el plantel con sus números y el peso de cada uno.',
    partidos: 'Partido por partido, con box score y lo que decidió cada uno.',
    pbp: 'Quintetos, dúos y tríos que más rinden juntos.',
    'pbp-tiro': 'El mapa de tiro por zona contra la liga.',
    diagnostico: 'Qué sostener, qué ajustar y qué corregir, con el costo de cada cosa.',
  };

  const MAX_OFERTA_MS = 14000;

  /* =====================================================================
     MOTOR · puro
     ===================================================================== */

  /** «Líderes · Promedios» → «lideres promedios». Sin acentos ni signos,
   *  para que comparar títulos no dependa de cómo se escribió el guion. */
  function normalizar(t) {
    return String(t == null ? '' : t).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function recorridoDe(seccion) {
    return Object.prototype.hasOwnProperty.call(RECORRIDOS, seccion) ? RECORRIDOS[seccion] : null;
  }

  /**
   * El paso siguiente que SE PUEDE MOSTRAR, o -1.
   *
   * `existe(i)` dice si el objetivo del paso `i` está en pantalla. Los que
   * faltan se saltean en el sentido en que se va: ir hacia atrás salta
   * hacia atrás. Así un cambio de títulos no deja la guía trabada.
   */
  function vecino(total, desde, dir, existe) {
    const paso = dir < 0 ? -1 : 1;
    for (let i = desde + paso; i >= 0 && i < total; i += paso) {
      if (existe(i)) return i;
    }
    return -1;
  }

  /** Cuántos pasos quedan visibles, para el «2 de 5». */
  function visibles(total, existe) {
    let n = 0;
    for (let i = 0; i < total; i++) if (existe(i)) n++;
    return n;
  }

  /** Posición (1..n) de un paso entre los visibles. */
  function posicion(total, i, existe) {
    let n = 0;
    for (let k = 0; k <= i && k < total; k++) if (existe(k)) n++;
    return n;
  }

  /** Dónde poner la tarjeta: abajo del objetivo si entra, si no arriba;
   *  siempre adentro de la pantalla. PURA: recibe medidas, no nodos. */
  function ubicar(rect, tarjeta, vista, margen) {
    const m = margen == null ? 12 : margen;
    const espacioAbajo = vista.h - (rect.top + rect.height);
    const espacioArriba = rect.top;
    let top;
    if (espacioAbajo >= tarjeta.h + m * 2) top = rect.top + rect.height + m;
    else if (espacioArriba >= tarjeta.h + m * 2) top = rect.top - tarjeta.h - m;
    else top = Math.max(m, vista.h - tarjeta.h - m);
    let left = rect.left + rect.width / 2 - tarjeta.w / 2;
    left = Math.max(m, Math.min(left, vista.w - tarjeta.w - m));
    return { top: Math.round(top), left: Math.round(left) };
  }

  function leerPrefs(almacen) {
    const base = { ofrecer: true, vistos: {} };
    try {
      const crudo = almacen && almacen.getItem(CLAVE);
      if (!crudo) return base;
      const o = JSON.parse(crudo);
      return {
        ofrecer: o.ofrecer !== false,
        vistos: (o.vistos && typeof o.vistos === 'object') ? o.vistos : {},
      };
    } catch (e) { return base; }
  }

  /* =====================================================================
     UI · todo lo que toca `document`
     ===================================================================== */
  const est = {
    montado: false,
    activo: false,          // hay un recorrido en pantalla
    seccion: null,
    i: -1,
    pausado: null,          // { seccion, i } para retomar
    ayuda: false,           // modo «explicar al tocar»
    menu: false,
    ofrecer: true,
    vistos: {},
    ultimaSeccion: null,
    temporizadorOferta: null,
    objetivo: null,
    token: 0,               // invalida esperas de un paso viejo
  };

  const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function almacen() {
    try { return window.sessionStorage; } catch (e) { return null; }
  }
  function guardar() {
    try {
      const a = almacen();
      if (a) a.setItem(CLAVE, JSON.stringify({ ofrecer: est.ofrecer, vistos: est.vistos }));
    } catch (e) { /* sin storage la guía igual anda: solo no recuerda */ }
  }

  function movimientoReducido() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function esTelefono() { return window.innerWidth < 640; }

  function seccionActual() {
    try { if (typeof currentSection !== 'undefined' && currentSection) return currentSection; } catch (e) {}
    return 'principal';
  }

  /* Resolver el objetivo de un paso. Devuelve un elemento visible o null. */
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function resolver(paso) {
    const raiz = $('view-root') || document;
    let el = null;
    try {
      if (paso.css) {
        el = raiz.querySelector(paso.css) || document.querySelector(paso.css);
      } else if (paso.h) {
        const buscado = normalizar(paso.h);
        const tit = Array.prototype.find.call(raiz.querySelectorAll('h2, h3, h4'),
          (n) => normalizar(n.textContent).indexOf(buscado) === 0);
        el = tit || null;
      } else if (paso.txt) {
        const buscado = normalizar(paso.txt);
        const tag = paso.tag || '*';
        el = Array.prototype.find.call(raiz.querySelectorAll(tag),
          (n) => normalizar(n.textContent).indexOf(buscado) !== -1 && visible(n)) || null;
      }
      if (el && paso.cont) el = el.closest(paso.cont) || el.parentElement || el;
      else if (el && paso.h) el = el.closest('.card') || el.parentElement || el;
    } catch (e) { el = null; }
    return visible(el) ? el : null;
  }

  /* Las acciones que preparan la pantalla. Solo corren si el usuario
     empezó el recorrido; fallan en silencio: la guía no es crítica. */
  const ANTES = {
    primerEquipo: function () {
      if (document.querySelector('[data-tab="general"]')) return;
      const b = document.querySelector('.card-equipo');
      if (b) b.click();
    },
    primerEquipoJugadores: function () {
      /* En Jugadores el plantel ya aparece si hay un solo equipo visible
         (el de la demo); si no, hay que elegir uno. */
      if (document.querySelector('#view-root summary')) return;
      const b = document.querySelector('.card-equipo');
      if (b) b.click();
    },
    cruceEjemplo: function () {
      if (document.querySelector('#scoutInforme [data-bloque="encabezado"]')) return;
      if (typeof scoutElegir === 'function') {
        scoutElegir('local', 'EQUIPO 1');
        scoutElegir('visitante', 'EQUIPO 2');
      }
    },
  };

  function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* Espera a que aparezca el objetivo (una pestaña recién abierta tarda en
     pintar). Se rinde a los 1,6 s. */
  async function conReintento(paso, token) {
    /* SOLO SE ESPERA SI EL PASO PREPARÓ LA PANTALLA (`antes`): un paso
       cuyo objetivo no está, sin que nada lo haya pedido, se saltea en el
       acto. Esperar 1,6 s por cada paso ausente hacía que el último
       «Siguiente» pareciera colgado. */
    const intentos = paso.antes ? 8 : 2;
    for (let k = 0; k < intentos; k++) {
      if (token !== est.token) return null;
      const el = resolver(paso);
      if (el) return el;
      await esperar(200);
    }
    return null;
  }

  /* ----- los nodos fijos --------------------------------------------- */
  function montar() {
    if (est.montado || typeof document === 'undefined') return;
    est.montado = true;
    const prefs = leerPrefs(almacen());
    est.ofrecer = prefs.ofrecer;
    est.vistos = prefs.vistos;

    const host = document.createElement('div');
    host.id = 'tourHost';
    host.className = 'no-imprimir';
    host.innerHTML = `
      <div id="tourFoco" class="tour-foco" hidden aria-hidden="true"></div>
      <div id="tourHover" class="tour-hover" hidden aria-hidden="true"></div>
      <div id="tourCard" class="tour-card" role="dialog" aria-label="Recorrido guiado" aria-live="polite" hidden></div>
      <div id="tourOferta" class="tour-oferta" role="region" aria-label="Recorrido de esta sección" hidden></div>
      <div id="tourMenu" class="tour-menu" role="menu" hidden></div>
      <button type="button" id="tourBoton" class="tour-boton" aria-haspopup="menu" aria-expanded="false">
        <span aria-hidden="true">?</span><span class="tour-boton-t">Guía</span>
      </button>`;
    document.body.appendChild(host);

    $('tourBoton').addEventListener('click', alternarMenu);
    document.addEventListener('keydown', teclado);
    document.addEventListener('click', alTocar, true);
    document.addEventListener('mousemove', alMover, { passive: true });
    window.addEventListener('resize', reubicar);
    window.addEventListener('scroll', reubicar, { passive: true });
    document.addEventListener('click', cerrarMenuAfuera);

    /* Se mira el contenedor de las secciones: cada cambio de sección o
       repintado lo toca. Con debounce, para no reaccionar a cada nodo. */
    const raiz = $('view-root');
    if (raiz && typeof MutationObserver === 'function') {
      let t = null;
      new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(alRepintar, 450);
      }).observe(raiz, { childList: true });
    }
    setTimeout(alRepintar, 900);
  }

  /* ----- cambio de sección y ofrecimiento ---------------------------- */
  function alRepintar() {
    const sec = seccionActual();
    if (sec !== est.ultimaSeccion) {
      est.ultimaSeccion = sec;
      if (est.activo && est.seccion !== sec) cerrar(false);
      ocultarOferta();
      cerrarAyuda();
      if (est.ofrecer && recorridoDe(sec) && !est.vistos[sec] && !est.activo) ofrecer(sec);
    } else if (est.activo) {
      reubicar();
    }
    actualizarBoton();
  }

  function ofrecer(sec) {
    const r = recorridoDe(sec);
    const n = $('tourOferta');
    if (!r || !n) return;
    n.innerHTML = `
      <p class="tour-oferta-t"><strong>¿Te muestro qué hay en ${esc(r.titulo)}?</strong>
        <span>${esc(r.intro)} Son ${r.pasos.length} paradas y lo podés cortar cuando quieras.</span></p>
      <div class="tour-oferta-b">
        <button type="button" class="tour-btn tour-btn-pri" data-tour="empezar">Sí, mostrame</button>
        <button type="button" class="tour-btn" data-tour="no">Ahora no</button>
      </div>`;
    n.hidden = false;
    n.querySelector('[data-tour="empezar"]').addEventListener('click', function () {
      ocultarOferta(); empezar(sec);
    });
    n.querySelector('[data-tour="no"]').addEventListener('click', function () {
      est.vistos[sec] = true; guardar(); ocultarOferta();
    });
    clearTimeout(est.temporizadorOferta);
    est.temporizadorOferta = setTimeout(function () {
      est.vistos[sec] = true; guardar(); ocultarOferta();
    }, MAX_OFERTA_MS);
  }

  function ocultarOferta() {
    clearTimeout(est.temporizadorOferta);
    const n = $('tourOferta');
    if (n) n.hidden = true;
  }

  /* ----- el recorrido ------------------------------------------------- */
  async function empezar(sec, desde) {
    const r = recorridoDe(sec || seccionActual());
    if (!r) return;
    cerrarMenu(); cerrarAyuda(); ocultarOferta();
    est.activo = true;
    est.seccion = sec || seccionActual();
    est.vistos[est.seccion] = true; guardar();
    est.pausado = null;
    await irA(desde == null ? 0 : desde, 1, true);
  }

  /* Va al paso `i`; si no se puede mostrar, busca el siguiente en el
     sentido pedido. `inclusivo` deja intentar `i` mismo. */
  async function irA(i, dir, inclusivo) {
    const r = recorridoDe(est.seccion);
    if (!r) return cerrar(false);
    const token = ++est.token;
    const total = r.pasos.length;
    let k = inclusivo ? i : i + dir;
    while (k >= 0 && k < total) {
      const paso = r.pasos[k];
      if (paso.antes && ANTES[paso.antes]) { try { ANTES[paso.antes](); } catch (e) {} }
      const el = await conReintento(paso, token);
      if (token !== est.token) return;
      if (el) {
        est.i = k;
        mostrarPaso(r, k, el);
        return;
      }
      k += dir;
    }
    /* Se acabaron los pasos en este sentido: si iba hacia adelante, es el
       final del recorrido. */
    if (dir > 0) terminar();
    else if (est.i < 0) cerrar(false);
  }

  function existeFn(r) {
    return function (idx) {
      const p = r.pasos[idx];
      return !!(p && (p.antes || resolver(p)));
    };
  }

  function mostrarPaso(r, i, el) {
    est.objetivo = el;
    const paso = r.pasos[i];
    const existe = existeFn(r);
    /* LA CUENTA ES LA DEL GUION, no la de lo que hay en pantalla: al abrir
       un equipo desaparecen las cards del selector, y contando solo lo
       visible el recorrido volvia a decir «1 de 3» a mitad de camino. */
    const total = r.pasos.length;
    const pos = i + 1;
    const hayAnterior = vecino(r.pasos.length, i, -1, existe) !== -1;
    const hayDespues = vecino(r.pasos.length, i, 1, existe) !== -1;
    const card = $('tourCard');
    card.innerHTML = `
      <p class="tour-card-n">${esc(r.titulo)} · ${pos} de ${total}</p>
      <h3 class="tour-card-t">${esc(paso.titulo)}</h3>
      <p class="tour-card-x">${esc(paso.texto)}</p>
      <div class="tour-card-b">
        <button type="button" class="tour-btn" data-tour="atras" ${hayAnterior ? '' : 'disabled'}>Anterior</button>
        <button type="button" class="tour-btn tour-btn-pri" data-tour="sigue">${hayDespues ? 'Siguiente' : 'Listo'}</button>
        <button type="button" class="tour-btn tour-btn-link" data-tour="pausa">Pausar</button>
      </div>`;
    card.hidden = false;
    card.querySelector('[data-tour="atras"]').addEventListener('click', function () { irA(est.i, -1, false); });
    card.querySelector('[data-tour="sigue"]').addEventListener('click', function () { irA(est.i, 1, false); });
    card.querySelector('[data-tour="pausa"]').addEventListener('click', function () { cerrar(true); });
    try {
      /* EL MARGEN SALE DE LA BARRA DE LA DEMO, que va fija arriba y en el
         telefono mide ~145px: con un margen fijo el objetivo quedaba
         tapado por ella (medido a 375px). */
      const barra = document.querySelector('.demo-barra');
      const alto = barra ? Math.ceil(barra.getBoundingClientRect().height) : 0;
      el.style.scrollMarginTop = Math.max(90, alto + 16) + 'px';
      el.scrollIntoView({ block: esTelefono() ? 'start' : 'center', behavior: movimientoReducido() ? 'auto' : 'smooth' });
    } catch (e) {}
    setTimeout(reubicar, movimientoReducido() ? 0 : 350);
    reubicar();
    actualizarBoton();
  }

  function terminar() {
    const n = $('tourCard');
    /* EL MOMENTO «AHA!» ES EL SCOUTING: recién ahí, y solo ahí, se ofrece
       ver el informe con los datos del propio equipo. En las demás
       secciones la guía no vende nada. */
    const cierreComercial = est.seccion === 'scouting'
      ? `<p class="tour-card-x"><strong>¿Querés este informe con los datos de tu equipo?</strong></p>
         <button type="button" class="tour-btn tour-btn-pri" data-tour="whatsapp" style="margin-bottom:.4rem">Agendar demo por WhatsApp</button>`
      : '';
    est.activo = false; est.i = -1; est.objetivo = null; est.token++;
    const f = $('tourFoco'); if (f) f.hidden = true;
    if (n) {
      n.innerHTML = `
        <p class="tour-card-n">Listo</p>
        <h3 class="tour-card-t">Eso es todo en esta sección</h3>
        <p class="tour-card-x">Seguí explorando. Cuando quieras, el botón «Guía» te recorre las otras secciones.</p>
        ${cierreComercial}
        <div class="tour-card-b"><button type="button" class="tour-btn tour-btn-pri" data-tour="ok">Cerrar</button></div>`;
      n.hidden = false;
      n.classList.add('tour-card-final');
      n.querySelector('[data-tour="ok"]').addEventListener('click', function () { n.hidden = true; n.classList.remove('tour-card-final'); });
      const w = n.querySelector('[data-tour="whatsapp"]');
      if (w) w.addEventListener('click', function () {
        n.hidden = true; n.classList.remove('tour-card-final');
        if (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.abrirModal) SGADD_DEMO.abrirModal();
      });
      n.style.top = ''; n.style.left = '';
    }
    actualizarBoton();
  }

  /** Cierra el recorrido. `guardarPaso` lo deja retomable. */
  function cerrar(guardarPaso) {
    if (guardarPaso && est.activo && est.i >= 0) est.pausado = { seccion: est.seccion, i: est.i };
    est.activo = false; est.i = -1; est.objetivo = null; est.token++;
    const f = $('tourFoco'); if (f) f.hidden = true;
    const c = $('tourCard'); if (c) { c.hidden = true; c.classList.remove('tour-card-final'); }
    actualizarBoton();
  }

  /* ----- posición del foco y de la tarjeta --------------------------- */
  let pendiente = false;
  function reubicar() {
    if (pendiente) return;
    pendiente = true;
    const raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () {
      pendiente = false;
      const f = $('tourFoco');
      const c = $('tourCard');
      if (!est.activo || !est.objetivo || !f || !c) return;
      if (!document.body.contains(est.objetivo) || !visible(est.objetivo)) return;
      const r = est.objetivo.getBoundingClientRect();
      const pad = 6;
      f.style.top = (r.top - pad) + 'px';
      f.style.left = (r.left - pad) + 'px';
      f.style.width = (r.width + pad * 2) + 'px';
      f.style.height = (r.height + pad * 2) + 'px';
      f.hidden = false;
      if (esTelefono()) { c.style.top = ''; c.style.left = ''; return; }
      const pos = ubicar({ top: r.top, left: r.left, width: r.width, height: r.height },
        { w: c.offsetWidth || 320, h: c.offsetHeight || 160 },
        { w: window.innerWidth, h: window.innerHeight });
      c.style.top = pos.top + 'px';
      c.style.left = pos.left + 'px';
    });
  }

  /* ----- el botón «Guía» y su menú ----------------------------------- */
  function actualizarBoton() {
    const b = $('tourBoton');
    if (!b) return;
    b.classList.toggle('tour-boton-on', est.activo || est.ayuda);
    b.setAttribute('aria-expanded', est.menu ? 'true' : 'false');
    const t = b.querySelector('.tour-boton-t');
    if (t) t.textContent = est.ayuda ? 'Tocá algo para ver qué es' : (est.activo ? 'Guía activa' : 'Guía');
  }

  function alternarMenu(e) {
    if (e) e.stopPropagation();
    est.menu ? cerrarMenu() : abrirMenu();
  }

  function abrirMenu() {
    const m = $('tourMenu');
    const sec = seccionActual();
    const r = recorridoDe(sec);
    const retoma = est.pausado && est.pausado.seccion === sec;
    const items = [];
    if (r) {
      items.push(`<button type="button" role="menuitem" class="tour-item" data-tour="recorrer">
        <strong>${retoma ? 'Retomar el recorrido' : 'Recorrer esta sección'}</strong>
        <span>${retoma ? 'Seguís donde lo dejaste.' : esc(r.intro)}</span></button>`);
    } else {
      items.push(`<p class="tour-item-n">Esta sección no tiene recorrido. Probá «Explicar al tocar».</p>`);
    }
    items.push(`<button type="button" role="menuitemcheckbox" aria-checked="${est.ayuda}" class="tour-item" data-tour="ayuda">
      <strong>Explicar al tocar: ${est.ayuda ? 'activado' : 'desactivado'}</strong>
      <span>Con esto activado, tocar una tarjeta, una pestaña o el menú te dice qué es en vez de abrirlo.</span></button>`);
    items.push(`<button type="button" role="menuitemcheckbox" aria-checked="${est.ofrecer}" class="tour-item" data-tour="ofrecer">
      <strong>Sugerirme recorridos: ${est.ofrecer ? 'sí' : 'no'}</strong>
      <span>${est.ofrecer ? 'Te ofrecemos una vez cada sección. Podés apagarlo.' : 'No te molestamos más. El recorrido sigue acá.'}</span></button>`);
    m.innerHTML = items.join('');
    m.hidden = false;
    est.menu = true;
    const a = m.querySelector('[data-tour="recorrer"]');
    if (a) a.addEventListener('click', function () {
      cerrarMenu();
      if (retoma) empezar(sec, est.pausado.i); else empezar(sec, 0);
    });
    m.querySelector('[data-tour="ayuda"]').addEventListener('click', function () {
      cerrarMenu(); est.ayuda ? cerrarAyuda() : abrirAyuda();
    });
    m.querySelector('[data-tour="ofrecer"]').addEventListener('click', function () {
      est.ofrecer = !est.ofrecer; guardar(); if (!est.ofrecer) ocultarOferta(); cerrarMenu();
    });
    actualizarBoton();
  }

  function cerrarMenu() {
    const m = $('tourMenu');
    if (m) m.hidden = true;
    est.menu = false;
    actualizarBoton();
  }
  function cerrarMenuAfuera(e) {
    if (!est.menu) return;
    const m = $('tourMenu'); const b = $('tourBoton');
    if (m && m.contains(e.target)) return;
    if (b && b.contains(e.target)) return;
    cerrarMenu();
  }

  /* ----- «explicar al tocar» ----------------------------------------- */
  function abrirAyuda() {
    est.ayuda = true;
    cerrar(false);
    document.body.classList.add('tour-ayuda');
    actualizarBoton();
  }
  function cerrarAyuda() {
    est.ayuda = false;
    if (typeof document !== 'undefined') document.body.classList.remove('tour-ayuda');
    const h = $('tourHover'); if (h) h.hidden = true;
    if (!est.activo) { const f = $('tourFoco'); if (f) f.hidden = true; const c = $('tourCard'); if (c && !c.classList.contains('tour-card-final')) c.hidden = true; }
    actualizarBoton();
  }

  /* Qué es lo que se tocó. Devuelve { el, titulo, texto } o null. */
  function queEs(blanco) {
    if (!blanco || !blanco.closest) return null;
    if (blanco.closest('#tourHost')) return null;
    const nav = blanco.closest('[data-nav]');
    if (nav) {
      const id = nav.getAttribute('data-nav');
      const L = (typeof SGADD_LANDING !== 'undefined' && SGADD_LANDING.SECCIONES) ? SGADD_LANDING.SECCIONES[id] : null;
      if (L) return { el: nav, titulo: L.titulo, texto: L.que + ' ' + L.detalle };
    }
    const tab = blanco.closest('[data-tab]');
    if (tab) {
      const id = tab.getAttribute('data-tab');
      if (PESTANAS[id]) return { el: tab, titulo: tab.textContent.trim(), texto: PESTANAS[id] };
    }
    const campana = blanco.closest('#buzonSlot');
    if (campana) return { el: campana.querySelector('button') || campana, titulo: 'La campanita: alertas de plantel',
      texto: 'Sabé qué jugadores de tu liga dejaron o volvieron a jugar, y marcá lesionados, suspendidos o bajas.' };
    const equipo = blanco.closest('.card-equipo');
    if (equipo) return { el: equipo, titulo: 'Un equipo de la liga', texto: 'Abre su ficha completa: rating, métricas contra la liga, plantel y partidos.' };
    const r = recorridoDe(seccionActual());
    if (r) {
      let mejor = null; let area = Infinity;
      r.pasos.forEach(function (p) {
        const el = resolver(p);
        if (el && el.contains(blanco)) {
          const b = el.getBoundingClientRect();
          const a = b.width * b.height;
          if (a < area) { area = a; mejor = { el: el, titulo: p.titulo, texto: p.texto }; }
        }
      });
      if (mejor) return mejor;
    }
    return null;
  }

  function alTocar(e) {
    if (!est.ayuda) return;
    const t = e.target;
    if (t && t.closest && t.closest('#tourHost')) return;
    const info = queEs(t);
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    est.activo = true;                  // reusa el foco y la tarjeta
    est.objetivo = info.el;
    est.seccion = seccionActual();
    const card = $('tourCard');
    card.innerHTML = `
      <p class="tour-card-n">Explicar al tocar</p>
      <h3 class="tour-card-t">${esc(info.titulo)}</h3>
      <p class="tour-card-x">${esc(info.texto)}</p>
      <div class="tour-card-b">
        <button type="button" class="tour-btn tour-btn-pri" data-tour="cerrar">Entendido</button>
        <button type="button" class="tour-btn tour-btn-link" data-tour="apagar">Apagar este modo</button>
      </div>`;
    card.hidden = false;
    card.querySelector('[data-tour="cerrar"]').addEventListener('click', function () { cerrar(false); });
    card.querySelector('[data-tour="apagar"]').addEventListener('click', function () { cerrar(false); cerrarAyuda(); });
    reubicar();
  }

  function alMover(e) {
    if (!est.ayuda || est.activo) return;
    const h = $('tourHover');
    if (!h) return;
    const info = queEs(e.target);
    if (!info || !visible(info.el)) { h.hidden = true; return; }
    const r = info.el.getBoundingClientRect();
    h.style.top = (r.top - 3) + 'px'; h.style.left = (r.left - 3) + 'px';
    h.style.width = (r.width + 6) + 'px'; h.style.height = (r.height + 6) + 'px';
    h.hidden = false;
  }

  function teclado(e) {
    if (e.key === 'Escape') {
      if (est.menu) return cerrarMenu();
      if (est.ayuda) return cerrarAyuda();
      if (est.activo) return cerrar(true);
    }
    if (!est.activo || est.ayuda) return;
    const t = e.target;
    if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); irA(est.i, 1, false); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); irA(est.i, -1, false); }
  }

  /* ----- arranque ----------------------------------------------------- */
  function enDemo() {
    try { return typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.activo(); } catch (e) { return false; }
  }

  function iniciar() {
    if (typeof document === 'undefined' || !enDemo()) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
    else montar();
  }

  iniciar();

  return {
    RECORRIDOS, PESTANAS, recorridoDe, normalizar, vecino, visibles, posicion, ubicar,
    leerPrefs, CLAVE, MAX_OFERTA_MS, empezar, cerrar, montar, resolver,
    estado: est,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_TOUR;
