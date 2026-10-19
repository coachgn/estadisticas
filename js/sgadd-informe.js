/* =====================================================================
   SGADD · Informe del equipo (PDF) · exportación MODULAR

   Usa window.print() + @media print en vez de html2pdf/jsPDF. Razón: los
   canvas de Chart.js no se rasterizan bien con esas librerías, los cortes
   de página quedan en el medio de las tablas y los colores del tema oscuro
   salen mal. El navegador ya tiene un motor de PDF que resuelve todo eso;
   solo hay que decirle qué ocultar y dónde puede cortar.

   Flujo:
     1. Botón en el header de Equipos
     2. Modal: árbol de cards y sub-cards + atajos por bloque + rival opcional
     3. Se renderizan los tabs elegidos en un contenedor oculto y se PODA
        lo destildado (lo que el play-by-play monta después, también)
     4. body.modo-impresion → el CSS de print hace el resto
     5. window.print() → el usuario elige "Guardar como PDF"
     6. Se limpia todo al volver

   ---------------------------------------------------------------------
   LA LISTA DE CARDS SALE DEL CÓDIGO DE LA VISTA, NO DE MEMORIA
   (2026-10-19, el mismo modelo que la ficha del jugador · punto 129)

   Cada bloque de las pestañas del equipo lleva
   `data-subcard` con la forma equipo.PESTAÑA.ID en su render real
   (sgadd-equipos.js; Quintetos y Mapa de tiro en sgadd-pbp.js; la ficha
   general acá abajo). `estructura()` declara esos ids con sus nombres y
   test-equipo-pdf.js exige que las marcas del fuente y la estructura
   coincidan en los dos sentidos. El prefijo `equipo.` las separa de las
   de la ficha del jugador, que viven en los mismos archivos.

   Los bloques NO se reescriben: se pide el mismo `equiposTab()` que pinta
   la pantalla y se poda con `SGADD_FICHA.podarHtml` / `podarDom` (una sola
   poda para las dos exportaciones). Se quita el nodo —no se esconde—, así
   que lo destildado no deja un hueco en la hoja.
   ===================================================================== */

const SGADD_INFORME = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc ? SGADD_UI.esc(v)
    : String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));

  /* ---------------------------------------------------------------------
     LA ESTRUCTURA · secciones y sus sub-cards
     --------------------------------------------------------------------- */
  const preguntaDe = (tab) => {
    const t = (typeof EQUIPOS_TABS !== 'undefined' ? EQUIPOS_TABS : []).find(x => x.id === tab);
    return t ? t.pregunta : '';
  };

  /**
   * Las cards y sub-cards del informe, en el orden del PDF. PURA.
   * `tab` mapea al id de EQUIPOS_TABS; `virtual` son bloques que no son un
   * tab entero (la ficha general, el insight). Las de play-by-play llevan
   * `pbp: true`: solo existen con la capa de laboratorio. Una sub-card con
   * `pre: false` arranca destildada.
   */
  function estructura() {
    const sec = (id, label, extra) => Object.assign({ id: id, label: label, tab: null, pre: false, subs: [] }, extra,
      { pregunta: extra && extra.tab ? preguntaDe(extra.tab) : '' });
    return [
      sec('ficha', 'Ficha general y arquetipo', { virtual: 'ficha', pre: true, subs: [
        { id: 'equipo.ficha.arquetipo', label: 'Arquetipo · su identidad en una frase' },
        { id: 'equipo.ficha.kpis', label: 'Indicadores · NET, ORTG, DRTG y eFG%' },
      ] }),
      sec('insight', 'Insight clave · patrón de victorias', { virtual: 'insight', pre: true }),
      sec('general', 'General · cómo viene', { tab: 'general', subs: [
        { id: 'equipo.general.kpis', label: 'Indicadores · AST-PP, PePP%, RO% y PACE' },
        { id: 'equipo.general.ranking', label: 'Métricas clave contra la liga' },
        { id: 'equipo.general.evolucion', label: 'Evolución · puntos a favor y en contra' },
        { id: 'equipo.general.ultimos5', label: 'Últimos 5 partidos' },
        { id: 'equipo.general.distribucion', label: 'Distribución de las jugadas' },
      ] }),
      sec('personalidad', '8 ejes de personalidad', { tab: 'personalidad', pre: true, subs: [
        { id: 'equipo.personalidad.identidad', label: 'Identidad de juego' },
        { id: 'equipo.personalidad.rasgos', label: 'Rasgos definitorios' },
        { id: 'equipo.personalidad.radar', label: 'Perfil completo · radar de los 8 ejes' },
        { id: 'equipo.personalidad.ataque', label: 'Cómo ataca' },
        { id: 'equipo.personalidad.defensa', label: 'Cómo defiende' },
        { id: 'equipo.personalidad.armas', label: 'Dónde gana y dónde pierde · armas y grietas' },
        /* El insight ya abre el informe (sección de arriba): acá arranca
           destildado para no imprimirlo dos veces. */
        { id: 'equipo.personalidad.insight', label: 'Insight al pie de la pestaña', pre: false },
      ] }),
      sec('4factores', '4 Factores', { tab: '4factores', pre: true, subs: [
        { id: 'equipo.4factores.radar-of', label: 'Perfil ofensivo · radar' },
        { id: 'equipo.4factores.radar-def', label: 'Perfil defensivo · radar' },
        { id: 'equipo.4factores.tablas', label: 'Tablas de los 8 factores' },
      ] }),
      sec('condicion', 'Local / Visitante', { tab: 'condicion', pre: true, subs: [
        { id: 'equipo.condicion.record', label: 'Récord de local y de visitante' },
        { id: 'equipo.condicion.radar', label: 'Radar local contra visitante' },
        { id: 'equipo.condicion.tabla', label: 'Tabla de factores por condición' },
      ] }),
      sec('ofensiva', 'Ofensiva', { tab: 'ofensiva', subs: [
        { id: 'equipo.ofensiva.kpis', label: 'Indicadores · PPP, TS%, PT3% y TC%' },
        { id: 'equipo.ofensiva.lanzamientos', label: 'Distribución de lanzamientos' },
        { id: 'equipo.ofensiva.ppt', label: 'Efectividad por zona · PPP' },
        { id: 'equipo.ofensiva.convertidos', label: 'Convertidos contra errados' },
        { id: 'equipo.ofensiva.tablas', label: 'Tablas de eficiencia y de tiro' },
      ] }),
      sec('defensiva', 'Defensiva', { tab: 'defensiva', subs: [
        { id: 'equipo.defensiva.kpis', label: 'Indicadores · DRTG, PTS en contra, RD% y PR' },
        { id: 'equipo.defensiva.perdidas', label: 'Pérdidas · propias y provocadas' },
        { id: 'equipo.defensiva.rebotes', label: 'Rebotes contra la liga' },
        { id: 'equipo.defensiva.tablas', label: 'Tablas de factores defensivos y rebote' },
      ] }),
      sec('plantel', 'Plantel y minutaje', { tab: 'plantel', pre: true, subs: [
        { id: 'equipo.plantel.scatter', label: 'Uso contra eficiencia · gráfico' },
        { id: 'equipo.plantel.tabla', label: 'Tabla del plantel' },
      ] }),
      sec('pbp', 'Quintetos y rotación', { tab: 'pbp', pbp: true, subs: [
        { id: 'equipo.pbp.clave', label: 'Quinteto inicial y de cierre' },
        { id: 'equipo.pbp.quintetos', label: 'Quintetos, tríos y dúos con más minutos' },
        { id: 'equipo.pbp.rotaciones', label: 'Rotaciones · minuto a minuto' },
        { id: 'equipo.pbp.cuartos', label: 'Cuartos y momentum' },
        { id: 'equipo.pbp.clutch', label: 'Clutch · quién decide los finales' },
        { id: 'equipo.pbp.tactico', label: 'Motor táctico · puntos de fuga y combinaciones' },
        { id: 'equipo.pbp.lideres', label: 'Líderes del último partido' },
        { id: 'equipo.pbp.tabla-posiciones', label: 'Tabla de posiciones del sitio' },
      ] }),
      sec('pbp-tiro', 'Mapa de tiro y reloj por franja', { tab: 'pbp-tiro', pbp: true, subs: [
        { id: 'equipo.tiro.mapa', label: 'Mapa de tiro y diagnóstico' },
        { id: 'equipo.tiro.reloj', label: 'Reloj de posesión · perfil, barras y tablas' },
        { id: 'equipo.tiro.reloj-franjas', label: 'Desde dónde tira en cada franja · mapas' },
        { id: 'equipo.tiro.reloj-sintesis', label: 'Insight del reloj, armas, grietas y recomendaciones' },
        { id: 'equipo.tiro.tendencias', label: 'Tendencias por franja y zona' },
      ] }),
      sec('partidos', 'Partidos y racha', { tab: 'partidos' }),
    ];
  }

  /* ---------------------------------------------------------------------
     LA SELECCIÓN · { secciones, subs }. Se recuerda entre aperturas.
     --------------------------------------------------------------------- */
  function seleccionPorDefecto(est) {
    const s = { secciones: {}, subs: {} };
    (est || estructura()).forEach((x) => {
      s.secciones[x.id] = !!x.pre;
      x.subs.forEach((y) => { s.subs[y.id] = y.pre !== false; });
    });
    return s;
  }

  /**
   * Los atajos por bloque. PUROS: devuelven una selección entera.
   *   completo  · todo, con las sub-cards en su valor por defecto
   *   tiro      · Ofensiva y Mapa de tiro con su reloj
   *   quintetos · Quintetos y rotación, y el plantel con su minutaje
   */
  const ATAJOS = [
    { id: 'completo', label: 'Informe completo', secciones: null },
    { id: 'tiro', label: 'Solo Tiro / Mapa', secciones: ['ofensiva', 'pbp-tiro'] },
    { id: 'quintetos', label: 'Solo Quintetos / Rotación', secciones: ['pbp', 'plantel'] },
  ];
  function seleccionAtajo(id, est) {
    const e = est || estructura();
    const a = ATAJOS.find(x => x.id === id);
    const s = seleccionPorDefecto(e);
    if (!a) return s;
    e.forEach((x) => {
      s.secciones[x.id] = !a.secciones || a.secciones.indexOf(x.id) !== -1;
      if (a.secciones) x.subs.forEach((y) => { s.subs[y.id] = true; });
    });
    return s;
  }

  let seleccion = null;
  function elegidas() {
    if (!seleccion) seleccion = seleccionPorDefecto();
    return seleccion;
  }

  /** Las sub-cards activas: tildadas y de una sección tildada. PURA. */
  function activos(sel, est) {
    const out = {};
    (est || estructura()).forEach((x) => {
      x.subs.forEach((y) => { out[y.id] = !!(sel.secciones[x.id] && sel.subs[y.id]); });
    });
    return out;
  }
  /** ¿La sección entra? Tildada y con algo adentro. PURA. */
  function seccionEntra(x, sel) {
    if (!sel.secciones[x.id]) return false;
    return !x.subs.length || x.subs.some(y => sel.subs[y.id]);
  }

  /* La poda es UNA para las dos exportaciones: vive en sgadd-ficha.js. */
  const podarHtml = (html, act) => (typeof SGADD_FICHA !== 'undefined' && SGADD_FICHA.podarHtml ? SGADD_FICHA.podarHtml(html, act) : html);
  const podarDom = (raiz, act) => { if (typeof SGADD_FICHA !== 'undefined' && SGADD_FICHA.podarDom) SGADD_FICHA.podarDom(raiz, act); };

  /** ¿La sección tiene con qué llenarse para este equipo? */
  function disponible(idx, e, x) {
    if (!x.tab) return true;
    return typeof equiposTabDisponible === 'function' ? !!equiposTabDisponible(idx, e, x.tab) : true;
  }

  /* ---------------------------------------------------------------------
     MODAL
     --------------------------------------------------------------------- */
  function equipoActual() {
    const idx = typeof SGADD_APP !== 'undefined' ? SGADD_APP.estado.idx : null;
    const e = (idx && typeof EQUIPOS !== 'undefined' && EQUIPOS.equipo) ? idx.get(EQUIPOS.equipo.replace(/-/g, ' ')) : null;
    return idx && e ? { idx: idx, e: e } : null;
  }

  function abrir() {
    const ctx = equipoActual();
    /* Mismo guard redundante que la ficha del jugador, por el mismo
       motivo: el PDF sale del panel. */
    const eq = ctx && ctx.e;
    if (eq && !SGADD_AUTH.puedeVerEquipo(eq.clave)) return;
    const est = estructura().map(x => Object.assign({}, x,
      x.pbp ? { motivo: 'sin la capa de play-by-play' } : {}));
    const arbol = (typeof SGADD_FICHA !== 'undefined' && SGADD_FICHA.arbolHtml)
      ? SGADD_FICHA.arbolHtml(elegidas(), x => !ctx || disponible(ctx.idx, ctx.e, x), est) : '';
    const atajos = ATAJOS.map(a => `<button type="button" onclick="SGADD_INFORME.atajo('${a.id}')"
        class="text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-hairline hover:bg-surface2 text-accent">${esc(a.label)}</button>`).join('');

    const cont = document.createElement('div');
    cont.id = 'modalInforme';
    cont.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    cont.innerHTML = `
      <div class="absolute inset-0 bg-black/70" onclick="SGADD_INFORME.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" role="dialog" aria-modal="true">
        <h3 class="font-display uppercase tracking-wide text-base mb-1" style="color:#fff">Generar informe PDF</h3>
        <p class="text-[11px] dato-sec mb-4">Elegí cards y sub-cards. Lo destildado no deja hueco. Se abre el diálogo de impresión: elegí "Guardar como PDF".</p>

        <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Rival (opcional)</label>
        <input id="informeRival" type="text" placeholder="Ej: Atenas 'A'"
               class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm mb-4
                      focus:border-accent outline-none" style="color:#fff">

        <p class="text-[11px] uppercase tracking-wider text-muted font-display mb-1">Atajos</p>
        <div class="flex flex-wrap gap-2 mb-3" data-informe-atajos="1">${atajos}</div>

        <p class="text-[11px] uppercase tracking-wider text-muted font-display mb-1">Cards y sub-cards</p>
        <div class="mb-4" data-informe-arbol="1">${arbol}</div>

        <div class="modal-acciones flex items-center justify-end gap-2 pt-3 border-t border-hairline">
          <button onclick="SGADD_INFORME.cerrar()"
            class="text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2
                   hover:bg-surface2 transition-all duration-200" style="color:#fff">Cancelar</button>
          <button onclick="SGADD_INFORME.generar()"
            class="text-xs font-semibold uppercase tracking-wider bg-accent text-base rounded px-4 py-2
                   hover:bg-accentdeep transition-all duration-200">Generar</button>
        </div>
        <p class="text-[10px] dato-sec mt-3">Fecha de emisión: ${esc(SGADD_UI.fechaHoy())}</p>
      </div>`;
    document.body.appendChild(cont);
    const inp = document.getElementById('informeRival');
    if (inp) inp.focus();
    document.addEventListener('keydown', escapar);
  }

  function escapar(e) { if (e.key === 'Escape') cerrar(); }

  function cerrar() {
    const m = document.getElementById('modalInforme');
    if (m) m.remove();
    document.removeEventListener('keydown', escapar);
  }

  /** Un atajo vuelca su selección en el árbol del modal (lo deshabilitado no se toca). */
  function atajo(id) {
    const m = document.getElementById('modalInforme');
    if (!m) return;
    const s = seleccionAtajo(id);
    m.querySelectorAll('input[data-sec]').forEach((i) => { if (!i.disabled) i.checked = !!s.secciones[i.dataset.sec]; });
    m.querySelectorAll('input[data-sub]').forEach((i) => { if (!i.disabled) i.checked = !!s.subs[i.dataset.sub]; });
  }
  /* Compatibilidad: el botón viejo de «Marcar todas». */
  const marcarTodas = () => atajo('completo');

  function leerArbol(raiz) {
    const sel = elegidas();
    raiz.querySelectorAll('input[data-sec]').forEach((i) => { if (!i.disabled) sel.secciones[i.dataset.sec] = i.checked; });
    raiz.querySelectorAll('input[data-sub]').forEach((i) => { if (!i.disabled) sel.subs[i.dataset.sub] = i.checked; });
    return sel;
  }

  /* ---------------------------------------------------------------------
     GENERACIÓN
     --------------------------------------------------------------------- */
  function generar() {
    const ctx = equipoActual();
    const m = document.getElementById('modalInforme');
    if (!ctx || !SGADD_AUTH.puedeVerEquipo(ctx.e.clave)) { cerrar(); return; }
    const { idx, e } = ctx;
    if (m) leerArbol(m);
    const rival = (document.getElementById('informeRival') || {}).value || '';
    cerrar();

    const previo = document.getElementById('informeSalida');
    if (previo) previo.remove();

    const salida = document.createElement('div');
    salida.id = 'informeSalida';
    salida.innerHTML = armar(idx, e, rival);
    document.body.appendChild(salida);

    document.body.classList.add('modo-impresion');
    /* EL PIE INSTITUCIONAL, EN TODAS LAS HOJAS: la tabla firmada del punto
       51 (encabezado con el logo y pie con logo, fecha e íconos, punto 130). */
    SGADD_UI.inyectarPieDeHoja('informeSalida');

    /* Los canvas se dibujan recién después del innerHTML, y para que no
       salgan borrosos en papel hay que forzar más resolución. */
    if (typeof SGADD_CHARTS !== 'undefined') SGADD_CHARTS.dibujarPendientes();

    /* Ficha <equipo>: el nombre del archivo sale del equipo abierto, no
       del título de la app. Se restaura solo en `afterprint`. */
    SGADD_UI.tituloPdf(SGADD_UI.nombrePdf('equipo', { equipo: e && e.nombre }));

    /* Quintetos y Mapa de tiro llegan por play-by-play: se ESPERAN —con
       techo de 5 s, como la ficha del jugador— y se PODAN con la misma
       selección, así lo destildado de esas cards tampoco deja hueco.

       La limpieza cuelga de `afterprint`, NO de un setTimeout ciego: con
       `setTimeout(limpiar, 400)` el informe se borraba a sí mismo antes de
       imprimirse si el diálogo tardaba. El timeout de 60 s queda solo como
       red de seguridad por si `afterprint` no llega. */
    const act = activos(elegidas());
    const montaje = (typeof SGADD_PBP !== 'undefined')
      ? Promise.resolve(SGADD_PBP.montarPendientes(salida)).catch(() => null) : Promise.resolve();
    Promise.race([montaje, new Promise(r => setTimeout(r, 5000))]).then(() => setTimeout(() => {
      podarDom(salida, act);
      /* Los escudos se serializan a `data:` URI DESPUÉS de montar y podar:
         al imprimir, el navegador vuelve a resolver el `src` de cada <img>
         y cualquier fallo ahí los deja afuera del PDF sin avisar. */
      SGADD_UI.embeberImagenes('#informeSalida');
      const alTerminar = () => {
        window.removeEventListener('afterprint', alTerminar);
        clearTimeout(respaldo);
        limpiar();
      };
      window.addEventListener('afterprint', alTerminar);
      const respaldo = setTimeout(alTerminar, 60000);
      window.print();
    }, 700));
  }

  function limpiar() {
    document.body.classList.remove('modo-impresion');
    SGADD_UI.quitarPieDeHoja('informeSalida');
    SGADD_UI.restaurarImagenes('#informeSalida');
    const s = document.getElementById('informeSalida');
    if (s) s.remove();
    if (typeof equiposPintar === 'function') equiposPintar();
  }

  /** La ficha general (sección virtual), con sus dos sub-cards marcadas. */
  function fichaGeneral(idx, e, p) {
    const kpis = ['NET RTNG', 'RTNG OFF', 'RTNG DEF', 'eFG%']
      .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');
    return `${p ? `<div class="informe-arquetipo" data-subcard="equipo.ficha.arquetipo">
            <p class="informe-arquetipo-titulo">${esc(p.arquetipo.titulo)}</p>
            <p>${esc(p.arquetipo.frase)}</p>
          </div>` : ''}
          <div class="grid grid-cols-4 gap-3" data-subcard="equipo.ficha.kpis">${kpis}</div>`;
  }

  function armar(idx, e, rival, selArg) {
    const sel = selArg || elegidas();
    const est = estructura();
    const act = activos(sel, est);
    const p = (typeof SGADD_PERSONALIDAD !== 'undefined') ? SGADD_PERSONALIDAD.perfil(idx, e) : null;
    const pl = SGADD_APP.planillaActual();
    const club = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : {};
    const fecha = SGADD_UI.fechaHoy();
    const rec = e.record || { ganados: 0, perdidos: 0 };

    const bloques = [];

    /* --- Portada: va siempre --- */
    bloques.push(`
      <header class="informe-cabecera">
        <h1>Informe pre-partido · ${esc(e.nombre)}${rival ? ' vs ' + esc(rival) : ''}</h1>
        <p>Fecha de emisión: ${fecha} · Competición: ${esc(pl ? pl.label : '—')}
           · ${esc(club.nombre || '')}</p>
        <p>Récord ${rec.ganados}-${rec.perdidos} · ${idx.liga.n} equipos en la liga · PJ ${e.pj || 0}</p>
      </header>`);

    est.filter(x => seccionEntra(x, sel) && disponible(idx, e, x)).forEach((x) => {
      let cuerpo = '';
      if (x.virtual === 'ficha') cuerpo = podarHtml(fichaGeneral(idx, e, p), act);
      else if (x.virtual === 'insight') cuerpo = p && p.insight ? equiposInsight(p.insight) : '';
      else cuerpo = podarHtml(equiposTab(idx, e, x.tab), act);
      if (!cuerpo || !String(cuerpo).trim()) return;
      const titulo = x.virtual === 'insight' ? 'Patrón de las victorias' : x.virtual === 'ficha' ? 'Ficha general' : x.label;
      bloques.push(`
        <section class="informe-bloque" data-bloque="${esc(x.id)}">
          <h2>${esc(titulo)}</h2>
          ${x.pregunta ? `<p class="informe-pregunta">${esc(x.pregunta)}</p>` : ''}
          ${cuerpo}
        </section>`);
    });

    /* El pie es la firma del PRODUCTO y no la del club: lo arma
       `SGADD_UI.pieInforme()`, compartido por las exportaciones a PDF. */
    bloques.push(`<footer class="informe-pie">${SGADD_UI.pieInforme(fecha)}</footer>`);

    return bloques.join('');
  }

  /* `SECCIONES` queda por compatibilidad: las secciones de la estructura. */
  return {
    get SECCIONES() { return estructura(); },
    ATAJOS, estructura, seleccionPorDefecto, seleccionAtajo, elegidas, activos, seccionEntra, disponible,
    armar, abrir, cerrar, generar, atajo, marcarTodas,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_INFORME;
