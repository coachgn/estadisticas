/* =====================================================================
   SGADD · Estado global

   El selector de planilla y fase deja de vivir dentro de cada sección.
   Es UNA decisión del usuario ("qué categoría estoy mirando") que atraviesa
   todo el dashboard: si elegís U21 en Principal y vas a Equipos, seguís en
   U21. Antes cada sección tenía su propio selector y su propia copia.

   La planilla también viaja en el hash, así que un link comparte la
   categoría además de la sección.
   ===================================================================== */

const SGADD_APP = (function () {
  'use strict';

  const estado = {
    planillaId: null,
    /* Lo que el servidor declaró haber recortado. `null` con GViz: ahí no
       hay recorte porque no hay quien lo haga. */
    alcance: null,
    textos: null,
    padron: [],
    crudas: null,
    torneo: null,        // null = todavía no se resolvió contra el libro
    fase: 'REGULAR',
    hojas: null,
    idx: null,
    cargando: false,
    error: null,
  };

  const suscriptores = [];

  function onCambio(fn) { suscriptores.push(fn); }
  function avisar() { suscriptores.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } }); }

  function planillaActual() { return SGADD.planilla(estado.planillaId); }

  function inicializar() {
    if (estado.planillaId) return;
    const r = SGADD.Ruta.parse(window.location.hash);
    const activas = SGADD.planillasVisibles({});
    estado.planillaId = (r.planilla && SGADD.planilla(r.planilla) && SGADD.planilla(r.planilla).activo)
      ? r.planilla
      : (activas.length ? activas[0].id : null);
    if (r.fase) estado.fase = r.fase;
    if (r.torneo) estado.torneo = r.torneo;
  }

  /** Carga la planilla activa. Idempotente: si ya está, resuelve al toque. */
  /** Ficha de la última carga pedida: ver el guard de carrera. */
  let _cargaId = 0;

  async function cargar(forzar) {
    inicializar();
    const p = planillaActual();
    /* `slug` reemplazó al `sheetId`: la planilla se identifica por una
       clave opaca y el id real vive en el servidor. Una planilla sin slug
       es la que todavía no tiene libro conectado — aparece deshabilitada
       en el selector y no se puede abrir. */
    if (!p || !(p.slug || p.sheetId)) {
      estado.error = 'Esa categoría todavía no tiene libro conectado.';
      avisar(); return;
    }
    if (estado.idx && !forzar) { avisar(); return; }

    estado.cargando = true; estado.error = null;
    avisar();

    /* GUARD DE CARRERA. Cambiar de categoría dos veces seguidas dispara dos
       cargas, y la primera puede volver DESPUÉS de la segunda: ahí deja en
       pantalla los datos de la planilla que el DT ya abandonó, o —peor—
       apaga el "Cargando…" de la que sí está esperando. Cada carga se queda
       con su ficha y al volver comprueba que siga siendo la vigente. */
    const ficha = ++_cargaId;
    const vigente = () => (ficha === _cargaId);

    try {
      /* De dónde salen los datos lo decide UN solo módulo: si hay token y
         backend configurado va por la API con la planilla privada, si no
         cae a GViz mientras dure la transición. Acá no se elige nada — el
         día que GViz se apague, esta línea no cambia. */
      const r = await SGADD_DATA.cargarCategoria(p, { forzar: forzar });
      if (!vigente()) return;
      const hojas = r.hojas, errores = r.errores;
      /* Qué recortó el servidor, para que las secciones lo puedan decir en
         pantalla: un panel que recibe menos filas sin saberlo calcularía
         percentiles sobre una liga fantasma. */
      estado.alcance = r.alcance || null;
      /* Las matrices en TEXTO, para la capa vieja de Principal. */
      estado.textos = r.textos || null;
      /* El padrón de la liga, para el buzón. Vacío en modo GViz: ahí el
         índice ya tiene a todos. */
      estado.padron = r.padron || [];
      estado.crudas = r.crudas || null;

      /* SIN UNA SOLA HOJA NO SE INDEXA: se avisa.

         Cada hoja que falla se degrada sola a un `{error}` para que una
         planilla incompleta siga sirviendo, pero si NO entró ninguna el
         problema es de red o de permisos, no del libro. Antes se armaba
         igual un índice vacío: la sección quedaba en blanco, sin equipos
         y sin un cartel que dijera por qué. Medido cortando la red en el
         navegador: 0 equipos, error null, y la pantalla muda. */
      if (!Object.keys(hojas).length) {
        const detalle = (errores && errores.length) ? errores[0].mensaje : "";
        throw new Error("No se pudo leer ninguna hoja de esta categoría. " +
          "Puede ser la conexión, o que la planilla dejó de estar compartida. " + detalle);
      }

      estado.hojas = hojas;
      const fases = SGADD.fasesDisponibles(hojas);
      if (fases.length && !fases.some(f => f.id === estado.fase)) estado.fase = fases[0].id;
      /* El torneo del hash puede no existir en ESTE libro (link viejo, o
         se cambió de categoría): se cae al primero disponible en vez de
         indexar una competencia vacía. */
      const torneos = SGADD.torneosDisponibles(hojas);
      /* `torneos[0]` es el primero del ABECEDARIO, no el primero útil. En
         un libro donde la maestra y la derivada quedaron con torneos
         distintos, eso abre justo el recorte sin partidos (ver la nota de
         `torneosDisponibles`). El defecto es el primero que traiga
         partidos; si ninguno los trae, el primero a secas y el
         Diagnóstico lo explica. */
      if (!estado.torneo || !torneos.some(t => t.id === estado.torneo)) {
        estado.torneo = SGADD.torneoPorDefecto(torneos);
      }
      /* Y que el PAR exista: un libro puede traer IDA y VUELTA en REGULAR
         pero solo VUELTA en PLAYOFF, así que una fase heredada del libro
         anterior puede no existir en este torneo. */
      const tramos = SGADD.combinacionesTorneoFase(hojas);
      const par = estado.torneo + '|' + estado.fase;
      if (tramos.length && !tramos.some(t => t.id === par)) {
        const mejor = SGADD.tramoPorDefecto(tramos);
        if (mejor) { estado.torneo = mejor.torneo; estado.fase = mejor.fase; }
      }
      reindexar();
    } catch (e) {
      if (vigente()) estado.error = e.message || String(e);
    } finally {
      /* Solo la carga vigente apaga el cartel: si lo apagara una vieja, la
         barra diría "sin datos" mientras la nueva sigue bajando. */
      if (vigente()) { estado.cargando = false; avisar(); }
    }
  }

  function reindexar() {
    if (!estado.hojas) return;
    estado.idx = SGADD.construirIndice(estado.hojas, { fase: estado.fase, torneo: estado.torneo });
  }

  function torneos() {
    return estado.hojas ? SGADD.torneosDisponibles(estado.hojas)
      : [{ id: SGADD.TORNEO_GENERAL, label: 'Todos', unico: true }];
  }

  /**
   * Cambia torneo y fase de una sola vez, desde el selector combinado.
   *
   * Escribe los DOS y reindexa una sola vez. Llamar a `cambiarTorneo` y
   * después a `cambiarFase` reindexaría dos veces, y la primera pasada
   * armaría un índice sobre un par que puede no existir en el libro.
   */
  function cambiarTramo(id) {
    const partes = String(id || '').split('|');
    const torneo = partes[0] || SGADD.TORNEO_GENERAL;
    const fase = partes[1] || 'REGULAR';
    if (torneo === estado.torneo && fase === estado.fase) return;
    estado.torneo = torneo;
    estado.fase = fase;
    reindexar();
    avisar();
  }

  function cambiarTorneo(t) {
    if (t === estado.torneo) return;
    estado.torneo = t;
    reindexar();
    avisar();
  }

  /* Sincroniza el torneo que trae el hash con el estado global. La llaman
     los `leerRuta()` de cada sección: el torneo NO vive en el estado de la
     sección (es una decisión global, igual que planilla y fase), pero sí
     viaja en la URL, así que un link compartido tiene que poder cambiarlo.
     Si el libro ya está cargado, reindexa; si todavía no, `cargar()` lo
     valida contra los torneos reales del libro. */
  function aplicarTorneoRuta(t) {
    if (!t || t === estado.torneo) return;
    estado.torneo = t;
    if (estado.hojas) reindexar();
  }

  function cambiarPlanilla(id) {
    if (id === estado.planillaId) return;
    estado.planillaId = id;
    /* El torneo es del libro anterior: se vuelve a resolver al cargar. */
    estado.hojas = null; estado.idx = null; estado.torneo = null;
    // La capa de datos vieja también tiene que seguir al selector.
    if (typeof window !== 'undefined' && typeof window.onCategoriaCambiada === 'function') {
      window.onCategoriaCambiada(id);
    }
    cargar();
  }

  function cambiarFase(f) {
    if (f === estado.fase) return;
    estado.fase = f;
    reindexar();
    avisar();
  }

  function fases() {
    return estado.hojas ? SGADD.fasesDisponibles(estado.hojas) : [SGADD.FASES.REGULAR];
  }

  /* ---------------------------------------------------------------------
     Barra de selección. La pintan todas las secciones SGADD.
     --------------------------------------------------------------------- */
  function barra(opciones) {
    const o = opciones || {};
    const planillas = SGADD.CATALOGO.planillas;
    const p = planillaActual();

    const grupos = SGADD.agrupar(planillas, 'tira');
    let opts = '';
    grupos.forEach((lista, tira) => {
      const etiqueta = tira === 'null' || tira === '—'
        ? 'Otras'
        : ({ femenina: 'Femenina', negra: 'Masculina Negra', naranja: 'Masculina Naranja' })[tira] || tira;
      opts += `<optgroup label="${SGADD_UI.esc(etiqueta)}">` +
        lista.map(x => `<option value="${SGADD_UI.esc(x.id)}" ${x.id === estado.planillaId ? 'selected' : ''} ${x.activo ? '' : 'disabled'}>
          ${SGADD_UI.esc(x.label)}${x.activo ? '' : ' — sin datos'}</option>`).join('') +
        `</optgroup>`;
    });

    const info = estado.idx
      ? `${estado.idx.liga.n} equipos · ${estado.idx.liga.partidos} partidos · PJ mediano ${estado.idx.liga.pjMediano}`
      : (estado.cargando ? 'Cargando…' : '');

    const tramos = SGADD.combinacionesTorneoFase(estado.hojas || {});
    const tramoActual = (estado.torneo || SGADD.TORNEO_GENERAL) + '|' + estado.fase;

    /* El recorte MUDO tiene que decir por qué está mudo.

       Un libro puede traer un torneo en las derivadas y otro en la
       maestra —pasa hoy con el U23 de Reconquista: PROMEDIOS con APERTURA
       y Base Datos E con IDA/VUELTA—. Elijas el que elijas, falta una
       mitad, y el encabezado decía '0 partidos' a secas mientras el
       resumen de Principal mostraba 82 (esa capa no filtra por torneo).
       Dos números distintos para la misma pregunta y ninguna explicación.

       Va acá y no solo en Diagnóstico: el DT lee la barra, no entra a
       Diagnóstico salvo que algo lo mande. Se arregla en el motor; el
       panel solamente deja de callarlo. */
    const l = estado.idx ? estado.idx.liga : null;
    const faltante = !l ? null
      : (!l.partidos && l.jugadores && l.jugadores.length ? 'partidos'
      : (l.partidos && (!l.jugadores || !l.jugadores.length) ? 'jugadores' : null));
    const avisoTorneo = !faltante ? '' : `
          <p class="text-[11px] leading-snug text-yellow-400 mt-2">
            ⚠ El tramo <b>${SGADD_UI.esc(tramoActual.replace('|', ' - '))}</b> no tiene ${faltante} cargados en esta planilla.
            Probá otra en el selector Fase; si ninguna la trae, el libro está mal etiquetado
            en el motor — el detalle está en <b>Diagnóstico</b>.
          </p>`;

    /* UN SOLO selector para el par TORNEO + FASE.

       La convención del motor es la carpeta de Nivel 6 —`"IDA - REGULAR"`,
       o sea TORNEO - FASE—, así que el DT piensa en un tramo de
       competencia, no en dos coordenadas. Con dos desplegables tenía que
       armar el par a mano y, peor, podía elegir uno que NO EXISTE en el
       libro: la vista quedaba vacía sin decir por qué. Acá solo se ofrecen
       los pares reales.

       Con un solo tramo el selector igual se muestra: es la etiqueta de lo
       que se está viendo, y en una planilla de una sola fase decir 'Fase
       regular' es información, no ruido. */
    const selectorTramo = `
          <div class="sm:w-56">
            <label for="selTramo" class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Fase</label>
            <select id="selTramo" onchange="SGADD_APP.cambiarTramo(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${tramos.map(t => `<option value="${SGADD_UI.esc(t.id)}" ${t.id === tramoActual ? 'selected' : ''}>${SGADD_UI.esc(t.label)}</option>`).join('')}
            </select>
          </div>`;

    /* `no-imprimir`: la barra es un CONTROL de navegación, no contenido del
       informe. En el papel sus `<select>` quedan ocultos por la regla general
       de `@media print` y solo sobreviven las etiquetas —"CATEGORÍA", "FASE"—
       colgando sobre una card vacía. La categoría activa ya viaja en el
       encabezado de cada informe. */
    return `
      <div class="card no-imprimir rounded-xl p-3 sm:p-4 border border-hairline">
        <div class="flex flex-col sm:flex-row sm:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Categoría</label>
            <select onchange="SGADD_APP.cambiarPlanilla(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${opts}
            </select>
          </div>
          ${selectorTramo}
          ${o.extra || ''}
        </div>
        ${info ? `<p class="text-[11px] text-muted mt-2 font-mono">${SGADD_UI.esc(p ? p.label : '')} · ${SGADD_UI.esc(info)}</p>` : ''}
        ${avisoTorneo}
      </div>`;
  }

  function avisoMuestra() {
    if (!estado.idx || estado.idx.liga.muestraSuficiente) return '';
    return SGADD_UI.aviso('Muestra insuficiente',
      'PJ mediano ' + estado.idx.liga.pjMediano + '. Con tan pocos partidos los percentiles no distinguen una debilidad estructural de un mal día.');
  }

  /* Cada sección se repinta sola cuando cambia la categoría o la fase. */
  onCambio(() => {
    /* El buzón recalcula sus alertas contra el índice nuevo: cambiar de
       planilla o de torneo cambia el plantel y por lo tanto las ausencias. */
    if (typeof SGADD_BUZON !== 'undefined') { try { SGADD_BUZON.sincronizar(); } catch (e) {} }
    if (typeof currentSection === 'undefined') return;
    /* La pantalla de Configuración muestra la cantidad de equipos y la
       vista previa del tramo abierto: si no se repinta, queda mostrando
       la validación de otro recorte y contradice a Clasificación. */
    /* Los escudos se resuelven cuando llega el índice o cambia el tramo,
       no cuando se pinta Principal: son una pieza GLOBAL —los usan cinco
       secciones y los cuatro PDF— y atarlos al render de una sola dejaba
       a las demás esperando a que el DT pasara por ahí. `LOGOS.resolver`
       sale de caché si ya los tiene, así que repetirlo no cuesta. */
    if (typeof precargarLogos === 'function') { try { precargarLogos(); } catch (e) {} }
    if (currentSection === 'configuracion' && typeof configPintar === 'function') configPintar();
    if (currentSection === 'clasificacion' && typeof buildClasificacion === 'function') {
      const r = document.getElementById('view-root');
      if (r) r.innerHTML = buildClasificacion();
    }
    /* PRINCIPAL SE REPINTA ENTERA, y hubo que cambiar de opinión sobre
       esto.

       Antes solo se reemplazaba el contenedor de la tabla, por miedo al
       ciclo de repintado que colgó la página una vez (punto 6). Pero sus
       KPIs —equipos, partidos, mejor ataque, líderes— TAMBIÉN dependen
       del tramo, y al no repintarse quedaban con los valores del primer
       render. Medido en DEPORTIVO: la pantalla decía `PARTIDOS 76` —los
       dos torneos sumados— tanto en Ida como en Vuelta, y el mismo mejor
       ataque y el mismo líder en las dos. Se veían idénticas.

       La causa no era el scope, que funciona: era que Principal se pinta
       ANTES de que el tramo se conozca —`init()` dispara `cargar()` sin
       await— y después nunca volvía a pintarse.

       Repintar desde acá NO reabre aquel ciclo: el bucle era
       gráfico → LOGOS.resolver → hook → repintado → gráfico, y `onCambio`
       no lo dispara nada de eso. Solo lo disparan `cargar()` y
       `reindexar()`, que son gestos del usuario o del arranque. */
    if (currentSection === 'principal' && typeof renderSection === 'function') {
      try { renderSection('principal'); } catch (e) { console.warn('[app]', e); }
    }
    if (currentSection === 'equipos' && typeof equiposPintar === 'function') equiposPintar();
    if (currentSection === 'jugadores' && typeof jugadoresPintar === 'function') jugadoresPintar();
    if (currentSection === 'simulador' && typeof simuladorPintar === 'function') simuladorPintar();
    // Scouting solo repinta en el tab del informe pre-partido; el de
    // comparar jugadores vive todavía en la capa de datos vieja.
    if (currentSection === 'scouting' && typeof scoutPintar === 'function' &&
        typeof tabState !== 'undefined' && tabState.scouting === 'equipos') scoutPintar();
  });

  return {
    estado, inicializar, cargar, reindexar, cambiarPlanilla, cambiarFase, cambiarTorneo, cambiarTramo,
    aplicarTorneoRuta, planillaActual, fases, torneos, barra, avisoMuestra, onCambio,
    get idx() { return estado.idx; },
  };
})();
