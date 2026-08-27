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
      /* El escudo va SIEMPRE dentro del mismo disco, con o sin imagen:
         asi la grilla no se desarma cuando a un club le falta el archivo
         y las iniciales ocupan exactamente el mismo lugar. */
      const escudo = url
        ? `<span class="escudo-aro w-10 h-10"><img src="${esc(url)}" alt="" class="w-full h-full object-contain"></span>`
        : `<span class="escudo-aro w-10 h-10 text-xs font-semibold text-ink">
             ${esc(hayLogos ? LOGOS.iniciales(e.nombre) : e.nombre.slice(0, 2))}
           </span>`;
      return `
        <button type="button" onclick="${esc(o.onClick || 'void 0')}('${escJs(e.clave)}')"
          class="card-equipo flex flex-col items-center gap-2 p-3 rounded-lg border
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
     FILAS Y CELDAS QUE SE COMPORTAN COMO BOTÓN

     Media app se navega haciendo clic en una fila: un partido abre su
     detalle, un jugador abre su ficha, un equipo abre la suya. Con `onclick`
     sobre un `<tr>` eso funciona con el mouse y **no existe para el
     teclado**: la fila no se enfoca, no se activa con Enter y un lector de
     pantalla la lee como texto suelto.

     `atributosFila()` emite las tres cosas que faltan —foco, rol y una
     etiqueta que diga qué pasa al activarla— y `teclaActiva()` reusa el
     `onclick` que la fila ya tiene, así no hay dos caminos que mantener
     sincronizados. Es la parte de "keyboard navigation patterns" y "ARIA
     pattern library" de la checklist de accesibilidad.
     --------------------------------------------------------------------- */
  function atributosFila(etiqueta) {
    return 'tabindex="0" role="button" onkeydown="SGADD_UI.teclaActiva(event)"' +
      (etiqueta ? ' aria-label="' + esc(etiqueta) + '"' : '');
  }

  function teclaActiva(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    /* Sin esto, la barra espaciadora scrollea la página además de activar. */
    ev.preventDefault();
    ev.currentTarget.click();
  }

  /* ---------------------------------------------------------------------
     TabbedPanel — tabs con el id en el hash, para que el link sea compartible.

     Van con la semántica de tabs (`tablist`/`tab`/`aria-selected`) y con
     tabindex rodante: el tabulador entra UNA vez al grupo —a la pestaña
     activa— y adentro se navega con las flechas. Es el patrón estándar y es
     lo que evita que el DT tenga que tabular ocho veces para pasar de largo
     un grupo de pestañas.
     --------------------------------------------------------------------- */
  function tabs(lista, activo, onClick) {
    const items = lista.map(t => `
      <button type="button" role="tab" data-tab="${esc(t.id)}"
        aria-selected="${t.id === activo ? 'true' : 'false'}"
        tabindex="${t.id === activo ? '0' : '-1'}"
        onclick="${esc(onClick)}('${escJs(t.id)}')"
        onkeydown="SGADD_UI.teclaTabs(event)"
        class="px-3 py-2 text-xs font-display uppercase tracking-wider rounded-md transition-colors
               ${t.id === activo ? 'bg-accent text-base' : 'text-muted hover:text-ink hover:bg-surface2'}"
        ${t.disponible === false ? 'disabled title="Sin datos suficientes"' : ''}>
        ${esc(t.label)}
      </button>`).join('');
    return `<div role="tablist" class="flex flex-wrap gap-1 border-b border-hairline pb-2 mb-4">${items}</div>`;
  }

  function teclaTabs(ev) {
    const k = ev.key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'Home' && k !== 'End') return;
    const grupo = ev.currentTarget.closest('[role="tablist"]');
    if (!grupo) return;
    const tabs = Array.prototype.slice.call(grupo.querySelectorAll('[role="tab"]:not([disabled])'));
    const i = tabs.indexOf(ev.currentTarget);
    if (i < 0) return;
    ev.preventDefault();
    const j = k === 'Home' ? 0
      : k === 'End' ? tabs.length - 1
        : (i + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    /* Activar repinta la sección entera y destruye este nodo, así que el
       foco se devuelve buscando la pestaña por su id después del repintado.
       Sin esto el teclado queda en el <body> y hay que empezar de nuevo. */
    const destino = tabs[j].getAttribute('data-tab');
    tabs[j].click();
    setTimeout(function () {
      const n = document.querySelector('[role="tab"][data-tab="' + (window.CSS && CSS.escape ? CSS.escape(destino) : destino) + '"]');
      if (n) n.focus();
    }, 0);
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

  /* =====================================================================
     EL PIE DE LOS TRES PDF

     "MotorStats^AR · Generado el <fecha>". Es la firma del PRODUCTO, no la
     del club: no sale del JSON de cliente, porque el motor es el mismo para
     todos y el pie tiene que decir quién generó el informe. El nombre del
     club ya viaja en el encabezado de cada exportación.

     El `AR` va en <sup>: es parte de la marca, no una sigla suelta.
     ===================================================================== */
  const MARCA = 'MotorStats';

  /** Fecha de emisión en dd/mm/aaaa, que es la convención del proyecto. */
  function fechaHoy() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  /**
   * El cartel de ESPERA de una sección, con el mismo disco que el arranque.
   *
   * Las cuatro secciones tenían su propio `<div>` con un texto plano y
   * nada más. Un bloque de texto quieto no distingue *"está bajando"* de
   * *"se colgó"*, que es justo la pregunta del DT cuando la planilla tarda:
   * un libro como el de DEPORTIVO son 157.596 celdas y con red lenta la
   * espera es de segundos. El disco que gira es la única señal de que el
   * panel sigue trabajando.
   *
   * `role="status"` + `aria-live="polite"` para que se anuncie sin robar el
   * foco: el DT puede estar tabulando el selector mientras baja.
   *
   * El `detalle` es opcional y va abajo, más chico: sirve para decir QUÉ se
   * está esperando sin ensuciar la línea principal.
   */
  function cargando(texto, detalle) {
    return '<div class="card rounded-xl p-8 border border-hairline flex flex-col items-center ' +
      'justify-center gap-4 text-center" role="status" aria-live="polite">' +
      '<div class="cargando-disco"></div>' +
      '<p class="text-sm text-muted">' + esc(texto || 'Cargando…') + '</p>' +
      (detalle ? '<p class="text-[11px] text-muted/70 font-mono">' + esc(detalle) + '</p>' : '') +
      '</div>';
  }

  /** Pie compartido por las tres exportaciones a PDF. */
  function pieInforme(fecha) {
    return '<span class="pie-marca">' + esc(MARCA) +
      '<sup class="pie-marca-sup">AR</sup></span> · Generado el ' +
      esc(fecha || fechaHoy());
  }

  /** Devuelve las imágenes a su ruta original después de imprimir. */
  /* =====================================================================
     NOMBRE DEL ARCHIVO PDF

     Las cuatro exportaciones usan `window.print()`, así que el nombre que
     Chrome propone en "Guardar como PDF" es el `document.title` — que
     hasta acá decía siempre lo mismo ("Deportivo La Plata · Panel de
     Scouting"). El DT terminaba con una carpeta de archivos homónimos y
     tenía que abrirlos para saber cuál era cuál.

     El nombre se arma acá, en un solo lugar, y no en cada exportación:
     cinco copias de la misma sanitización terminan divergiendo, que es el
     bug que ya tuvo el rol funcional (punto 8).
     ===================================================================== */

  /* Los prohibidos son la UNIÓN de lo que rechaza cada sistema, no la
     intersección: un informe se comparte por WhatsApp y termina abierto en
     Windows, en Mac y en Android. Alcanza con que UNO lo rechace para que
     el archivo no se pueda guardar.

       · `/` lo rechazan los tres,
       · `\ : * ? " < > |` los rechaza Windows,
       · los de control (0x00-0x1F) rompen en cualquier lado. */
  const PDF_PROHIBIDOS = /[\/\\:*?"<>|\u0000-\u001F]/g;

  /* Nombres de dispositivo de MS-DOS que Windows SIGUE reservando: un
     archivo llamado `CON.pdf` o `AUX.pdf` no se puede crear, y el error que
     tira el navegador no explica por qué. Es rebuscado hasta que un equipo
     se llama así. */
  const PDF_RESERVADOS = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

  /* Techo de largo. No es el límite real del sistema (255 bytes en la
     mayoría) sino uno cómodo: un nombre de 200 caracteres se corta en la
     lista de archivos y deja de servir para lo único que sirve, que es
     reconocerlo de un vistazo. */
  const PDF_LARGO_MAX = 120;

  /**
   * Limpia un nombre para que sirva de nombre de archivo en cualquier
   * sistema. Pura: no toca el documento ni depende de él.
   *
   * @param {string} nombre    el candidato
   * @param {string} respaldo  qué usar si no queda nada utilizable
   */
  function sanearNombreArchivo(nombre, respaldo) {
    const fallback = String(respaldo === undefined || respaldo === null || respaldo === ''
      ? 'Informe' : respaldo);

    let t = String(nombre === undefined || nombre === null ? '' : nombre);

    /* Los prohibidos se reemplazan por un ESPACIO y no por vacío: sin eso
       "ATENAS/PLATENSE" quedaba "ATENASPLATENSE", que es un equipo que no
       existe. Un espacio conserva que eran dos cosas. */
    t = t.replace(PDF_PROHIBIDOS, ' ');

    /* Separadores flotantes: al sacar un prohibido queda " -  - " en el
       medio. Se colapsan a uno solo, y los de las puntas se van. */
    t = t.replace(/\s+/g, ' ')
      .replace(/\s*([-–·])\s*(?:[-–·]\s*)+/g, ' $1 ')
      .replace(/^[\s\-–·.]+/, '')
      /* Los puntos del final van con los espacios: Windows los descarta en
         silencio, así que "Ficha Atenas ." se guardaría como otro archivo
         del que el usuario escribió. */
      .replace(/[\s\-–·.]+$/, '');

    if (!t) return fallback;
    if (PDF_RESERVADOS.test(t)) t = t + ' (informe)';

    if (t.length > PDF_LARGO_MAX) {
      const corte = t.slice(0, PDF_LARGO_MAX);
      const esp = corte.lastIndexOf(' ');
      /* Se corta por palabra si hay una cerca; si no, duro. Cortar siempre
         por palabra dejaría un nombre de 3 letras cuando alguien pega un
         párrafo sin espacios. */
      t = (esp > PDF_LARGO_MAX * 0.6 ? corte.slice(0, esp) : corte)
        .replace(/[\s\-–·.]+$/, '');
    }
    return t || fallback;
  }

  /**
   * "RUSSO NOWOSIELSKI, JUAN CRUZ" → "Juan Cruz Russo Nowosielski".
   *
   * La planilla escribe APELLIDO, NOMBRE y todo en mayúsculas; un archivo
   * se busca por el nombre como se dice en voz alta. Es el mismo giro que
   * ya hace `inicialesJugador()` para la insignia del scatter.
   *
   * NO se inventan acentos: si la planilla escribe "PEREZ" el archivo dice
   * "Perez". Un dato que no está no se completa a ojo — misma regla que el
   * resto del proyecto.
   */
  function nombrePersona(crudo) {
    const t = String(crudo === undefined || crudo === null ? '' : crudo).trim();
    if (!t) return '';
    const partes = t.indexOf(',') !== -1
      ? (() => {
        const p = t.split(',');
        return [p.slice(1).join(' ').trim(), p[0].trim()].filter(Boolean);
      })()
      : [t];
    return partes.join(' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      /* Se capitaliza después de espacio, guión o apóstrofe: "O'CONNOR" y
         "SAINT-JEAN" son una palabra sola con dos mayúsculas. */
      .replace(/(^|[\s\-'’])([a-záéíóúüñ])/g, (m, sep, c) => sep + c.toUpperCase());
  }

  /* Las cuatro convenciones, en un solo lugar. Cada una devuelve el nombre
     YA saneado y con su respaldo: una vista a medio cargar no puede dejar
     el archivo sin nombre, y un genérico limpio es mejor que el título de
     la app repetido diez veces. */
  const PDF_NOMBRES = {
    /* Ficha de jugador → "Juan Pérez" */
    jugador: (d) => sanearNombreArchivo(nombrePersona(d && d.jugador), 'Ficha_Jugador'),

    /* Informe pre-partido → "Scouting vs Atenas" */
    scouting: (d) => {
      const r = d && d.rival ? nombreEquipoPdf(d.rival) : '';
      return sanearNombreArchivo(r ? 'Scouting vs ' + r : '', 'Informe_Scouting');
    },

    /* Ficha de equipo → "Ficha Reconquista" */
    equipo: (d) => {
      const e = d && d.equipo ? nombreEquipoPdf(d.equipo) : '';
      return sanearNombreArchivo(e ? 'Ficha ' + e : '', 'Ficha_Equipo');
    },

    /* Post-partido. NO estaba en la convención pedida y se agrega por la
       misma razón que las otras: es la cuarta exportación y dejarla con el
       nombre del navegador la volvía la única sin identificar. El marcador
       NO entra en el nombre —el archivo se busca por el cruce, no por el
       resultado— pero sí la fecha, que es lo que separa la ida de la
       vuelta contra el mismo rival. */
    partido: (d) => {
      const l = d && d.local ? nombreEquipoPdf(d.local) : '';
      const v = d && d.visitante ? nombreEquipoPdf(d.visitante) : '';
      if (!l || !v) return sanearNombreArchivo('', 'Informe_Partido');
      const f = d.fecha ? ' - ' + String(d.fecha).replace(/\//g, '-') : '';
      return sanearNombreArchivo(l + ' vs ' + v + f, 'Informe_Partido');
    },

    /* Dashboard y tabla de posiciones → "Deportivo La Plata - Primera - Resumen" */
    resumen: (d) => {
      const partes = [d && d.club, d && d.categoria, 'Resumen']
        .map(x => String(x === undefined || x === null ? '' : x).trim())
        .filter(Boolean);
      /* Con el club solo, "Club - Resumen" ya identifica; sin ninguno de
         los dos el genérico dice más que un guión suelto. */
      return sanearNombreArchivo(partes.length > 1 ? partes.join(' - ') : '', 'Resumen');
    },
  };

  /* Los equipos vienen como `ATENAS 'A' - MM` o ya limpios según de dónde
     salgan. Para el archivo se saca la comilla decorativa y se deja el
     nombre como se lo nombra. El sufijo de categoría ya lo recortó
     `limpiarNombre()` río arriba; acá no se vuelve a adivinar. */
  function nombreEquipoPdf(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * El nombre de archivo para una exportación. Puro.
   * @param {string} tipo  jugador | scouting | equipo | partido | resumen
   */
  function nombrePdf(tipo, datos) {
    const f = PDF_NOMBRES[tipo];
    return f ? f(datos || {}) : sanearNombreArchivo('', 'Informe');
  }

  /* El título que había antes de la exportación. Vive acá y no en una
     variable local porque las llamadas se pueden pisar: si `tituloPdf()`
     corriera dos veces sin un `afterprint` en el medio, la segunda tomaría
     como "original" el nombre que puso la primera y la pestaña del
     navegador quedaría con el nombre de un informe para siempre. */
  let pdfTituloPrevio = null;

  /**
   * Deja el `document.title` con el nombre del informe justo antes de
   * imprimir, y lo devuelve a su lugar al terminar.
   *
   * La restauración cuelga de `afterprint` y NO de un `setTimeout` ciego,
   * por el mismo motivo que la limpieza de las otras exportaciones: si el
   * diálogo tarda en abrir, el título ya volvió atrás y el archivo sale con
   * el nombre genérico. El timeout queda de respaldo porque `afterprint` no
   * llega siempre (pasa al cancelar en algunos navegadores).
   *
   * @returns {Function} restaurar — para llamarla a mano si hace falta.
   */
  function tituloPdf(nombre) {
    if (typeof document === 'undefined') return function () {};
    const limpio = sanearNombreArchivo(nombre, 'Informe');
    if (pdfTituloPrevio === null) pdfTituloPrevio = document.title;
    document.title = limpio;

    const restaurar = () => {
      if (pdfTituloPrevio === null) return;
      document.title = pdfTituloPrevio;
      pdfTituloPrevio = null;
      if (typeof window !== 'undefined') window.removeEventListener('afterprint', restaurar);
      clearTimeout(respaldo);
    };
    if (typeof window !== 'undefined') window.addEventListener('afterprint', restaurar);
    const respaldo = setTimeout(restaurar, 60000);
    return restaurar;
  }

  /** ¿Hay una exportación que ya nombró el archivo? La usa el respaldo de
      Ctrl+P para no pisar un nombre que una exportación puso a propósito. */
  function tituloPdfActivo() { return pdfTituloPrevio !== null; }

  function restaurarImagenes(raiz) {
    const cont = typeof raiz === 'string' ? document.querySelector(raiz) : raiz;
    if (!cont) return;
    Array.prototype.forEach.call(cont.querySelectorAll('img[data-src]'), (img) => {
      img.setAttribute('src', img.getAttribute('data-src'));
      img.removeAttribute('data-src');
    });
  }

  return { esc, escJs, statCard, percentileBar, metricTable, teamPicker, tabs, aviso, signoDelta, colorDelta, claseMasMenos,
    atributosFila, teclaActiva, teclaTabs, cargando,
    embeberImagenes, restaurarImagenes, pieInforme, fechaHoy, MARCA,
    sanearNombreArchivo, nombrePersona, nombrePdf, tituloPdf, tituloPdfActivo };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_UI;
