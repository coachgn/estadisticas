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
    alertas: [],
    crudas: null,
    torneo: null,        // null = todavía no se resolvió contra el libro
    fase: 'REGULAR',
    /* El tramo que el DT eligió A MANO, para no perdérselo al cambiar de
       categoría. `null` mientras no haya elegido ninguno. */
    preferencia: null,
    hojas: null,
    idx: null,
    cargando: false,
    error: null,
  };

  const suscriptores = [];

  function onCambio(fn) { suscriptores.push(fn); }
  function avisar() { suscriptores.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } }); }

  function planillaActual() { return SGADD.planilla(estado.planillaId); }

/* =====================================================================
   LA CATEGORÍA SOBREVIVE AL F5

   Un club multicategoría —Reconquista corre Primera, U21 y U23— hace que
   el DT trabaje media hora en una y al recargar aparezca en otra: el
   arranque caía a la PRIMERA ACTIVA del catálogo.

   POR QUÉ NO VA EN LA URL, que era la otra opción del pedido. El hash ya
   es la ruta de la app y las secciones SGADD (`#/<planilla>/…`) SÍ lo
   llevan; el problema es que el Panel Master, Principal y el Diagnóstico
   escriben `#<seccion>` a secas —`#configuracion` parsea como
   `planilla: 'configuracion'`, que no existe y por eso degrada bien—.
   Darles ruta completa obliga a meter esos nombres donde `Ruta.parse()`
   decide qué formato es un hash, y eso toca la lectura de los links
   VIEJOS que el cuerpo técnico ya tiene guardados (punto 16). No vale el
   riesgo para recordar una preferencia de una persona.

   Así que va en `localStorage`, y el orden de precedencia es el que
   importa:

     1. la RUTA, si trae una planilla válida — un link compartido tiene
        que abrir donde dice el link, no donde estaba el que lo abre;
     2. lo último que ESTE usuario eligió en ESTE club;
     3. la primera activa, como siempre.

   LA CLAVE ES POR CLUB. Con una sola, entrar con `?club=jujuy` intentaría
   abrir una planilla de Reconquista: no existe en ese catálogo, así que
   degradaría bien, pero es un cruce que no tiene por qué existir.
   ===================================================================== */

  const CLAVE_CATEGORIA = 'sgadd.categoria.';

  function clubId() {
    try {
      if (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) return CLUB.estado.id;
    } catch (e) { /* CLUB puede no haber cargado todavía */ }
    return 'default';
  }

  function almacen() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage;
    } catch (e) { return null; }   // modo privado tira al leer, no al usar
  }

  /** Lo elegido A MANO, igual que `recordarTramo`: guardar el default
      congelaría el criterio de arranque y dejaría de correr. */
  function recordarCategoria(id) {
    const ls = almacen();
    if (!ls || !id) return false;
    try { ls.setItem(CLAVE_CATEGORIA + clubId(), id); return true; }
    catch (e) { return false; }    // cuota llena: se degrada, no rompe
  }

  function categoriaRecordada() {
    const ls = almacen();
    if (!ls) return null;
    let id = null;
    try { id = ls.getItem(CLAVE_CATEGORIA + clubId()); } catch (e) { return null; }
    /* Se valida contra el catálogo de HOY: una planilla que se dio de baja
       —o que quedó sin `sheetId`— no puede dejar al DT en una sección
       vacía por algo que eligió la semana pasada. */
    const p = id ? SGADD.planilla(id) : null;
    return (p && p.activo) ? id : null;
  }

  function inicializar() {
    if (estado.planillaId) return;
    const r = SGADD.Ruta.parse(window.location.hash);
    const activas = SGADD.planillasVisibles({});
    const deRuta = (r.planilla && SGADD.planilla(r.planilla) && SGADD.planilla(r.planilla).activo)
      ? r.planilla : null;
    estado.planillaId = deRuta
      || categoriaRecordada()
      || (activas.length ? activas[0].id : null);
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
      estado.alertas = r.alertas || [];
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

      /* EL TRAMO SE ELIGE EN UN SOLO LUGAR, y esto estuvo partido en dos.

         Antes iban dos pasos: `torneoPorDefecto()` resolvía el torneo y
         después `tramoPorDefecto()` corregía el PAR solo si no existía. Con
         eso el segundo nunca corría en un arranque limpio —el primero ya
         había puesto un torneo válido— así que el criterio del tramo
         quedaba escrito en una función que no se ejecutaba.

         Se notó al hacer que el TOTAL abriera el libro: `tramoPorDefecto`
         devolvía `*TOTAL*|REGULAR` y la app seguía abriendo en `IDA`,
         medido en producción. El defecto no estaba en la regla nueva sino
         en que había DOS decisiones para una sola pregunta.

         Ahora manda el tramo: `combinacionesTorneoFase()` enumera los pares
         que EXISTEN —incluido el TOTAL sintético, que `torneosDisponibles`
         no conoce porque no sale de ninguna celda— y `tramoPorDefecto()`
         elige entre ellos. */
      const tramos = SGADD.combinacionesTorneoFase(hojas);

      /* El par del hash gana si existe en ESTE libro. Puede no existir por
         un link viejo, por un cambio de categoría, o porque la fase
         heredada del libro anterior no está en este torneo. */
      const par = estado.torneo + '|' + estado.fase;
      const delHash = !!estado.torneo && tramos.some(t => t.id === par);

      if (!delHash) {
        /* El orden es: el hash, después lo que el DT venía mirando, y
           recién ahí el default del libro. */
        const mejor = tramoPreferido(tramos) || SGADD.tramoPorDefecto(tramos);
        if (mejor) {
          estado.torneo = mejor.torneo;
          estado.fase = mejor.fase;
        } else {
          /* Sin un solo tramo enumerable —un libro sin `PROMEDIOS E`, por
             ejemplo— se cae al criterio de torneo suelto, que es lo que
             hacía la app antes de que existieran los tramos. Antes que
             quedarse sin torneo y no indexar nada. */
          const torneos = SGADD.torneosDisponibles(hojas);
          if (!estado.torneo || !torneos.some(t => t.id === estado.torneo)) {
            estado.torneo = SGADD.torneoPorDefecto(torneos);
          }
        }
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
    /* Es la eleccion EXPLICITA del DT: se recuerda para el cambio de
       categoria. Los otros dos setters (`cambiarFase`, `cambiarTorneo`)
       los usa el RUTEO, y ahi lo que manda es el hash — recordar una
       navegacion como si fuera una decision haria que un link viejo le
       fijara la preferencia a quien lo abre. */
    recordarTramo();
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

  /**
   * EL TRAMO QUE EL USUARIO ELIGIÓ A MANO, para no perdérselo al cambiar
   * de categoría.
   *
   * Un club multicategoría —Reconquista corre Primera, U21 y U23— hace que
   * el DT salte entre libros todo el tiempo. Cada salto lo devolvía al
   * tramo por defecto del libro nuevo, así que si estaba mirando los
   * PLAYOFFS tenía que volver a elegirlos en cada categoría.
   *
   * SE GUARDA SOLO LO ELEGIDO A MANO. Si se guardara también el default,
   * la preferencia sería siempre la del primer libro que se abrió y el
   * criterio de `tramoPorDefecto` —que elige por cobertura, y por eso
   * cambia de libro en libro— dejaría de correr.
   */
  function recordarTramo() {
    estado.preferencia = { torneo: estado.torneo, fase: estado.fase };
  }

  /**
   * El tramo del libro nuevo que más se parece al que se estaba mirando.
   *
   * Se prueba el PAR exacto y después la misma FASE con el mejor torneo
   * del libro nuevo. La fase es lo que el DT eligió conceptualmente
   * —«quiero ver los playoffs»— y el torneo es cómo lo llama cada
   * categoría, que no tiene por qué coincidir.
   *
   * Si no hay nada parecido devuelve null y manda el default: inventar un
   * tramo que no existe deja la vista vacía sin decir por qué.
   */
  function tramoPreferido(tramos) {
    const p = estado.preferencia;
    if (!p || !p.fase || !tramos || !tramos.length) return null;
    const exacto = tramos.find(t => t.id === p.torneo + '|' + p.fase);
    if (exacto) return exacto;
    const mismaFase = tramos.filter(t => t.fase === p.fase);
    if (!mismaFase.length) return null;
    return SGADD.tramoPorDefecto(mismaFase) || mismaFase[0];
  }

  function cambiarPlanilla(id) {
    if (id === estado.planillaId) return;
    estado.planillaId = id;
    /* Se recuerda SOLO acá: esta función es el gesto explícito del DT
       eligiendo en el selector. */
    recordarCategoria(id);
    /* El torneo es del libro anterior: se vuelve a resolver al cargar. La
       preferencia NO se borra — es justo lo que hay que conservar. */
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
    /* El distintivo del plan sale de `estado.alcance`, que lo declara el
       servidor con los datos: al arrancar todavía no está, así que sin
       esto un club ORO no lo vería hasta cambiar de categoría. */
    if (typeof pintarDistintivoPlan === 'function') {
      try { pintarDistintivoPlan(); } catch (e) {}
    }
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
    tramoPreferido, recordarTramo,
    estado, inicializar, cargar, reindexar, cambiarPlanilla, cambiarFase, cambiarTorneo, cambiarTramo,
    aplicarTorneoRuta, planillaActual, fases, torneos, barra, avisoMuestra, onCambio,
    recordarCategoria, categoriaRecordada,
    get idx() { return estado.idx; },
  };
})();

/* Se exporta SOLO para poder testear `tramoPreferido`, que es logica pura
   y decide que ve el DT al cambiar de categoria. El resto del modulo usa
   `document` y `SGADD.CATALOGO`, y se sigue verificando en el navegador —
   igual que Equipos, que tiene su export por el mismo motivo (punto 8). */
if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_APP;
