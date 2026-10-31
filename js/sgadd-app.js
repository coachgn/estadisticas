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
    fotos: {},           // punto 95: clave de jugador → ruta de su foto
    dorsales: {},        // 2026-10-08: clave de jugador → dorsal (PADRON J)
    titulares: {},       // punto 97: clave de jugador → [titular, partidos]
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
    /* La MUESTRA de Equipos y Jugadores (punto 139): un recorte de
       calendario adentro del tramo de la barra. `todo` = el tramo entero,
       que es exactamente lo de antes. */
    muestra: { tipo: 'todo' },
  };

  const suscriptores = [];

  function onCambio(fn) { suscriptores.push(fn); }
  function avisar() { suscriptores.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } }); }

  function planillaActual() { return SGADD.planilla(estado.planillaId); }

  /** ¿La barra está en una fase entre zonas (punto 76)? */
  function enLlave() {
    return typeof SGADD_FASES !== 'undefined' && SGADD_FASES.esLlave(estado.torneo);
  }

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
    estado.muestra = muestraRecordada(estado.planillaId);
  }

  /**
   * EL EQUIPO PROPIO DE LA CATEGORÍA QUE SE ABRE (punto 61).
   *
   * Dos cosas, y hacen falta las dos:
   *
   *  · la SESIÓN del cliente pasa a filtrar con ese equipo
   *    (`SGADD_AUTH.fijarEquipoEfectivo`): sin eso el picker de la U23
   *    buscaba «RECONQUISTA A» en un libro que dice «RECONQUISTA» y
   *    quedaba vacío;
   *  · el PATRÓN de `esEquipoPropio()` —scouting, informes, el resaltado
   *    del plantel— sale de `CLUB.patronDeCategoria`, que respeta el del
   *    JSON cuando ya reconoce a ese equipo.
   *
   * Es una mejora y nunca tumba la carga.
   */
  function adoptarEquipoDeCategoria(p, equipo) {
    try {
      if (equipo && typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.fijarEquipoEfectivo) {
        SGADD_AUTH.fijarEquipoEfectivo(equipo);
      }
      if (typeof CLUB !== 'undefined' && CLUB.patronDeCategoria && SGADD.CATALOGO) {
        const pat = CLUB.patronDeCategoria(CLUB.cfg, Object.assign({}, p, equipo ? { equipoPropio: equipo } : {}));
        if (pat && String(SGADD.CATALOGO.patronEquipoPropio) !== String(new RegExp(pat, 'i'))) {
          SGADD.CATALOGO.patronEquipoPropio = new RegExp(pat, 'i');
        }
      }
    } catch (e) { /* es una mejora */ }
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
    /* La guarda del libro conectado no aplica a la demo: su planilla no
       resuelve contra ningun libro a proposito. */
    const demo = (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.activo());
    /* EL PLAN ES DE LA CATEGORÍA (punto 60): Primera en ORO y la U23 en
       PLATA dentro del mismo club. Se adopta ANTES de pedir los datos,
       para que el menú no ofrezca durante la carga lo que la categoría
       nueva no tiene; `alcance.plan` de la respuesta lo confirma. */
    if (!demo && p && p.plan && typeof adoptarPlanEfectivo === 'function') {
      try { adoptarPlanEfectivo(p.plan); } catch (e) { /* es una mejora */ }
    }
    /* Y EL EQUIPO PROPIO TAMBIÉN ES DE LA CATEGORÍA (punto 61): Reconquista
       es «RECONQUISTA A» en Primera y «RECONQUISTA» en la U23. Se adopta
       antes de pedir los datos por lo mismo que el plan. */
    if (!demo && p) adoptarEquipoDeCategoria(p, p.equipoPropio);
    if (!demo && (!p || !(p.slug || p.sheetId))) {
      estado.error = 'Esa categoría todavía no tiene libro conectado.';
      avisar(); return;
    }
    if (estado.idx && !forzar) { avisar(); return; }

    estado.cargando = true; estado.error = null;
    avisar();

    /* LA DECLARACIÓN DEL TORNEO BAJA EN PARALELO CON EL LIBRO (punto 75).
       Es un archivo de pocos KB contra un libro de segundos, así que no
       suma espera; y llegando ANTES del primer pintado, la barra ya sale
       con los nombres del reglamento en vez de cambiar de golpe después.
       Nunca lanza: sin archivo, la barra queda como siempre. */
    let docTorneo = null;
    try {
      if (!demo && p && p.torneoId && typeof SGADD_FIXTURE !== 'undefined' && typeof fetch === 'function') {
        docTorneo = SGADD_FIXTURE.cargarTorneo(p.torneoId).catch(() => null);
      }
    } catch (e) { docTorneo = null; }

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
      /* EN LA DEMO LOS DATOS SALEN DE UN SNAPSHOT COMMITTEADO y no de un
         libro: la demo es publica y desde que el catalogo dejo de traer
         `sheetId` no hay forma de leer uno sin token. `SGADD_DEMO`
         devuelve exactamente la misma forma que `SGADD_DATA`, asi que de
         aca para abajo no cambia una linea. */
      const r = (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.activo())
        ? await SGADD_DEMO.cargarCategoria()
        : await SGADD_DATA.cargarCategoria(p, { forzar: forzar });
      if (!vigente()) return;
      const hojas = r.hojas, errores = r.errores;
      /* Qué recortó el servidor, para que las secciones lo puedan decir en
         pantalla: un panel que recibe menos filas sin saberlo calcularía
         percentiles sobre una liga fantasma. */
      estado.alcance = r.alcance || null;
      estado.alcancePlanilla = estado.planillaId;
      /* Y la sesión del CLIENTE adopta el plan efectivo que declara el
         servidor: el menú y el guard tienen que decir lo mismo que el
         servidor hace cumplir (ver `adoptarPlanEfectivo` en el index). */
      if (estado.alcance && estado.alcance.plan && typeof adoptarPlanEfectivo === 'function') {
        try { adoptarPlanEfectivo(estado.alcance.plan); } catch (e) { /* es una mejora */ }
      }
      /* El equipo con el que el servidor recortó el libro: manda sobre el
         que traía el catálogo. */
      if (!demo && estado.alcance && estado.alcance.equipoAsignado) {
        adoptarEquipoDeCategoria(p, estado.alcance.equipoAsignado);
      }
      /* Las matrices en TEXTO, para la capa vieja de Principal. */
      estado.textos = r.textos || null;
      /* El padrón de la liga, para el buzón. Vacío en modo GViz: ahí el
         índice ya tiene a todos. */
      estado.padron = r.padron || [];
      estado.fotos = r.fotos || {};
      estado.dorsales = r.dorsales || {};
      estado.titulares = r.titulares || {};
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
      /* En modo llave la fase NO está en este libro, y es a propósito: se
         juega en el de la postemporada (punto 76). */
      if (fases.length && !fases.some(f => f.id === estado.fase) && !enLlave()) estado.fase = fases[0].id;

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
      let delHash = !!estado.torneo && tramos.some(t => t.id === par);

      /* UN LINK A LA LLAVE (punto 76) no está entre los tramos del libro:
         la fase entre zonas sale de la DECLARACIÓN del torneo, así que hay
         que esperarla antes de decidir. Con techo, como abajo. */
      if (!delHash && enLlave() && docTorneo) {
        let techo = null;
        await Promise.race([docTorneo, new Promise(r => { techo = setTimeout(r, 1500); })]);
        clearTimeout(techo);
        if (!vigente()) return;
        delHash = SGADD_FASES.enriquecerTramos(tramos, SGADD_FASES.visibles())
          .some(t => t.llave && t.id === par);
      }

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
      /* Se espera la declaración con techo: si el archivo tarda más que el
         libro, la barra sale sin los nombres del reglamento y los toma en
         el próximo repintado. Nunca se demora el panel por una mejora. */
      if (docTorneo) {
        let techo = null;
        await Promise.race([docTorneo, new Promise(r => { techo = setTimeout(r, 1500); })]);
        clearTimeout(techo);
        if (!vigente()) return;
      }
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
    estado.tramoIndice = null;
    if (enLlave()) {
      /* EN MODO LLAVE EL ÍNDICE ES EL DE LA FASE REGULAR DE LA ZONA (punto
         76). La fase elegida no está en este libro, y un índice vacío
         dejaría al buzón y a la tabla plegada de Clasificación sin nada.
         Las secciones que dependen del tramo no lo muestran: el router las
         reemplaza por el aviso del modo llave. */
      const reg = (SGADD_FASES.declaradas() || []).find(f => f.tipo === 'liga');
      const t = (reg && SGADD_FASES.tramoDeFase(estado.hojas, reg.libro[0]))
        || SGADD.tramoPorDefecto(SGADD.combinacionesTorneoFase(estado.hojas));
      if (t) {
        estado.tramoIndice = { torneo: t.torneo, fase: t.fase };
        estado.idx = SGADD.construirIndice(estado.hojas, { fase: t.fase, torneo: t.torneo });
        return;
      }
    }
    estado.idx = SGADD.construirIndice(estado.hojas, { fase: estado.fase, torneo: estado.torneo });
  }

  /* =====================================================================
     LA MUESTRA (punto 139) · el índice de lo que se MIRA

     `estado.idx` sigue siendo el del tramo entero y lo usan Clasificación,
     el buzón, las alertas, Scouting y el Fixture: ninguno de ellos cambia
     con la muestra. Equipos, Jugadores y sus PDF leen `idxVista()`.

     El índice del recorte se arma con el motor del TOTAL sobre las hojas
     partido a partido recortadas (`SGADD_MUESTRA.recortar`), así que las
     métricas avanzadas, las medianas, los percentiles contra la liga EN
     ESE PERÍODO, el ADN y los textos automáticos salen recalculados sin
     tocar ni una sección. Y cada lectura (`leer`, `leerVista`,
     `leerJugador`) lleva `propio`: el mismo dato en su temporada.
     ===================================================================== */
  const CLAVE_MUESTRA = 'sgadd.muestra.';
  let _vista = null;   // { base, clave, idx, info }

  function sesion() {
    try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; } catch (e) { return null; }
  }
  /* En `sessionStorage` y por planilla: sobrevive al F5, no a cerrar la
     pestaña. Una ventana de fechas de la semana pasada no tiene que
     esperar a nadie el lunes. */
  function muestraRecordada(id) {
    const s = sesion();
    if (!s || !id || typeof SGADD_MUESTRA === 'undefined') return { tipo: 'todo' };
    try { return SGADD_MUESTRA.normalizar(JSON.parse(s.getItem(CLAVE_MUESTRA + id) || 'null')); }
    catch (e) { return { tipo: 'todo' }; }
  }

  function cambiarMuestra(m) {
    if (typeof SGADD_MUESTRA === 'undefined') return;
    const nueva = SGADD_MUESTRA.normalizar(m);
    if (SGADD_MUESTRA.clave(nueva) === SGADD_MUESTRA.clave(estado.muestra)) return;
    estado.muestra = nueva;
    const s = sesion();
    if (s && estado.planillaId) { try { s.setItem(CLAVE_MUESTRA + estado.planillaId, JSON.stringify(nueva)); } catch (e) {} }
    avisar();
  }

  /* El cliente recibe `Base Datos J` recortada a su plantel (punto 19): un
     recálculo de jugadores dejaría la liga formada solo por los suyos, el
     bug del «percentil 50 en todo». Hasta que el servidor mande la vara de
     la liga del período (fase 3), en esa sesión Jugadores sigue sobre la
     temporada y la barra lo dice. */
  function jugadoresRecortados() {
    const a = estado.alcance;
    return !!(a && Array.isArray(a.hojasRecortadas) && a.hojasRecortadas.indexOf('Base Datos J') !== -1);
  }

  function claveJugadorVista(j) {
    return SGADD.claveEquipo(j['EQUIPO']) + '|' + SGADD.texto(j['NOMBRES']).toUpperCase();
  }

  /* Le cuelga a cada lectura del recorte la misma lectura en la temporada.
     Se envuelve el OBJETO del índice y no el núcleo: `ranking`, el ADN y
     todo lo interno siguen leyendo el recorte sin enterarse. */
  function decorar(v, base, rotulo) {
    const leerV = v.leer, leerVistaV = v.leerVista, leerJ = v.leerJugador;
    const porClave = new Map((base.liga.jugadores || []).map(j => [claveJugadorVista(j), j]));
    /* Contra la Regular los PJ del tramo corto van a la banda de ruido. */
    const pjEq = (k) => { const e = rotulo && v.get ? v.get(k) : null; return e && e.pj != null ? Number(e.pj) : undefined; };
    v.leer = (k, m, vi) => {
      const r = leerV(k, m, vi);
      if (r) r.propio = SGADD_MUESTRA.comparar(r, base.leer(k, m, vi), rotulo, pjEq(k));
      return r;
    };
    v.leerVista = (k, vi) => {
      const out = leerVistaV(k, vi);
      if (!out) return out;
      const b = base.leerVista(k, vi);
      const mb = new Map(((b && b.filas) || []).map(f => [f.clave, f]));
      const n = pjEq(k);
      out.filas.forEach(f => { f.propio = SGADD_MUESTRA.comparar(f, mb.get(f.clave), rotulo, n); });
      return out;
    };
    v.leerJugador = (j, m) => {
      const r = leerJ(j, m);
      const jb = j ? porClave.get(claveJugadorVista(j)) : null;
      const n = rotulo && j && j['PJ'] != null ? Number(j['PJ']) : undefined;
      if (r) r.propio = jb ? SGADD_MUESTRA.comparar(r, base.leerJugador(jb, m), rotulo, n) : null;
      return r;
    };
    return v;
  }

  /* =====================================================================
     LA FASE CORTA SE LEE CONTRA LA REGULAR

     Una fase de eliminación (cuartos, semis, final…) tiene 1 a 3 partidos:
     sola no dice nada, y el aviso de muestra insuficiente era todo lo que
     el DT recibía. La referencia está en el mismo libro: la Regular del
     torneo (`SGADD_MUESTRA.baseDeTramo`). Con ella, `propio` pasa a
     comparar contra la Regular en vez de contra el tramo mismo, y las
     flechas ▲▼ de las cards y tablas de Equipos y Jugadores dicen «vs
     Regular». Una vista envoltura (`Object.create`) y no el índice mismo:
     Clasificación, el buzón y Scouting siguen leyendo `estado.idx` tal cual.
     ===================================================================== */
  let _regular = null;   // { base, tramo, idx, vista }

  /** { tramo, idx } de la Regular que le corresponde al tramo abierto, o null. */
  function contextoRegular() {
    const idx = estado.idx;
    if (!idx || !estado.hojas || enLlave() || typeof SGADD_MUESTRA === 'undefined') return null;
    if (_regular && _regular.base === idx) return _regular.idx ? _regular : null;
    let tramo = null, ridx = null;
    try {
      tramo = SGADD_MUESTRA.baseDeTramo(SGADD.combinacionesTorneoFase(estado.hojas), tramoDeIndice(), SGADD.FASES);
      if (tramo) {
        ridx = SGADD.construirIndice(estado.hojas, { fase: tramo.fase, torneo: tramo.torneo });
        if (ridx && ridx.liga && idx.liga && idx.liga.nivel && !ridx.liga.nivel) ridx.liga.nivel = idx.liga.nivel;
        if (!ridx || !ridx.lista || !ridx.lista().length) ridx = null;
      }
    } catch (e) { ridx = null; }
    _regular = { base: idx, tramo: tramo, idx: ridx, vista: null };
    return ridx ? _regular : null;
  }

  /** El rótulo del tramo de referencia («Ida - Regular»), para decirlo en pantalla. */
  function etiquetaRegular() {
    const r = contextoRegular();
    if (!r) return null;
    return r.tramo.label || r.tramo.id;
  }

  function tramoDeIndice() {
    return estado.tramoIndice || { torneo: estado.torneo, fase: estado.fase };
  }

  /* =====================================================================
     LA VARA DEL SERVIDOR · fase 3 (opción A)

     Con el log de jugadores recortado (`jugadoresRecortados`), el índice
     del período solo tiene al plantel propio. La liga del período la arma
     el servidor (`/api/v1/vara-jugadores`) y llega como números agregados:
     se aplica sobre un índice PROPIO de Jugadores (`_vista.idxJ`), así no
     toca los cachés del que usa Equipos. Mientras no llega —o si no se
     entrega por muestra chica— Jugadores sigue con la temporada, y la
     barra lo dice.
     ===================================================================== */
  const _varas = new Map();

  function destinoApi() {
    if (typeof SGADD === 'undefined' || !SGADD.CATALOGO) return null;
    const p = (SGADD.CATALOGO.planillas || []).filter(x => x.id === estado.planillaId)[0];
    const club = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) ? CLUB.estado.id : null;
    return (p && p.slug && club) ? { club: club, slug: p.slug } : null;
  }

  /** El estado de la vara del período abierto, y la pide si falta. */
  function varaDelPeriodo() {
    const d = destinoApi();
    if (!d || typeof SGADD_DATA === 'undefined' || !SGADD_DATA.varaJugadores) return { estado: 'sin-servidor' };
    const t = tramoDeIndice();
    const m = SGADD_MUESTRA.normalizar(estado.muestra);
    const k = [d.club, d.slug, t.torneo || '', t.fase || '', SGADD_MUESTRA.clave(m)].join('|');
    const previo = _varas.get(k);
    /* Un fallo se reintenta recién al minuto: reintentar en el repintado
       que dispara el propio fallo sería un bucle de pedidos. */
    if (!previo || (previo.estado === 'error' && Date.now() > previo.reintentarEn)) {
      const ev = { clave: k, estado: 'cargando', vara: null };
      _varas.set(k, ev);
      SGADD_DATA.varaJugadores(d.club, d.slug, t, m).then((r) => {
        if (r && r.vara) { ev.estado = 'ok'; ev.vara = r.vara; }
        else { ev.estado = 'chica'; ev.partidos = r ? r.partidos : 0; }
      }).catch((e) => {
        ev.estado = 'error'; ev.mensaje = e && e.message;
        ev.reintentarEn = Date.now() + 60000;
      }).then(() => avisar());
    }
    return _varas.get(k);
  }

  /** El índice de la Regular contra la que se lee la fase abierta, o null
      fuera de una fase de eliminación. Es la capa «fantasma» de los radares. */
  function idxRegular() {
    const reg = contextoRegular();
    return reg && reg.idx ? reg.idx : null;
  }

  /* =====================================================================
     LA LÍNEA DE BASE PREVIA AL PARTIDO (v332)

     El post-partido medía contra el «habitual» del índice, que YA incluye el
     partido: con 2 jugados, la mitad del habitual de un equipo era la misma
     noche que se analizaba, y el simulador también lo veía. `idxPrevio(fecha)`
     arma el índice del tramo con los partidos de los días ANTERIORES al
     partido (el motor del TOTAL sobre las hojas recortadas, como la muestra),
     que es la foto que tenía el scouting. Un partido del mismo día no entra:
     la planilla no trae la hora. Sin partidos previos devuelve `idx: null` y
     el post-partido dice que no hay habitual, en vez de inventar uno.
     ===================================================================== */
  const _previos = { base: null, porDia: new Map() };

  function diaDe(f) {
    const d = f instanceof Date ? f : (f ? new Date(f) : null);
    if (!d || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function diaAnterior(iso) {
    const p = String(iso).split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  /** { idx, partidos, hasta } con lo jugado ANTES de `fecha`, o null sin libro. */
  function idxPrevio(fecha) {
    const base = estado.idx;
    const dia = diaDe(fecha);
    if (!base || !estado.hojas || !dia || enLlave() || typeof SGADD_MUESTRA === 'undefined') return null;
    if (_previos.base !== base) { _previos.base = base; _previos.porDia = new Map(); }
    if (_previos.porDia.has(dia)) return _previos.porDia.get(dia);
    const t = tramoDeIndice();
    const hasta = diaAnterior(dia);
    let out = { idx: null, partidos: 0, hasta: hasta };
    try {
      const rec = SGADD_MUESTRA.recortar(estado.hojas, t, { desde: null, hasta: hasta });
      if (rec.partidos) {
        const v = SGADD.construirIndice(rec.hojas, { fase: t.fase, torneo: SGADD.TORNEO_TOTAL });
        if (base.liga && base.liga.nivel && v.liga && !v.liga.nivel) v.liga.nivel = base.liga.nivel;
        out = { idx: v, partidos: rec.partidos, hasta: hasta };
      }
    } catch (e) { out = { idx: null, partidos: 0, hasta: hasta, error: e && e.message }; }
    _previos.porDia.set(dia, out);
    return out;
  }

  /** Lo que la barra dice de la muestra. null con la muestra apagada. */
  function infoMuestra() {
    if (typeof SGADD_MUESTRA === 'undefined' || !estado.hojas || enLlave()) return null;
    if (!SGADD_MUESTRA.activa(estado.muestra)) return null;
    idxVista();
    return _vista ? _vista.info : null;
  }

  /**
   * El índice que muestran Equipos y Jugadores. Con la muestra apagada, en
   * modo llave o sin libro, es `estado.idx` tal cual.
   * `{ jugadores: true }` lo pide para la sección Jugadores: con el log
   * recortado del cliente, devuelve la temporada.
   */
  function idxVista(opciones) {
    const base = estado.idx;
    if (!base || !estado.hojas || enLlave() || typeof SGADD_MUESTRA === 'undefined') return base;
    const reg = contextoRegular();
    if (!SGADD_MUESTRA.activa(estado.muestra)) {
      if (!reg) return base;
      if (!reg.vista) {
        reg.vista = decorar(Object.create(base), reg.idx, 'Regular');
        reg.vista.__contraRegular = reg.tramo.id;
      }
      return reg.vista;
    }
    const t = tramoDeIndice();
    const k = (t.torneo || '') + '|' + (t.fase || '') + '|' + SGADD_MUESTRA.clave(estado.muestra) + '|' + (reg ? reg.tramo.id : '');
    if (!_vista || _vista.base !== base || _vista.clave !== k) {
      const dias = SGADD_MUESTRA.diasDelTramo(estado.hojas, t);
      const fam = SGADD_MUESTRA.familia(estado.muestra);
      /* FAMILIA 2: cada equipo en SU condición, y el otro lado de cada
         partido como contexto que el núcleo descarta antes de la vara. */
      const vent = fam === 'equipo' ? null : SGADD_MUESTRA.ventana(estado.muestra, dias);
      const rec = fam === 'equipo'
        ? SGADD_MUESTRA.recortarPorCondicion(estado.hojas, t, estado.muestra)
        : SGADD_MUESTRA.recortar(estado.hojas, t, vent);
      const rival = estado.muestra.tipo === 'rival' ? base.get(estado.muestra.rival) : null;
      const info = {
        etiqueta: SGADD_MUESTRA.etiqueta(estado.muestra, rival ? SGADD.limpiarNombre(rival.nombre) : null),
        familia: fam, ventana: vent,
        partidos: rec.partidos, total: rec.total, sinFecha: rec.sinFecha, porEquipo: rec.porEquipo || null,
        dias: dias, vacia: !rec.partidos, jugadoresRecortados: jugadoresRecortados(),
      };
      let v = null;
      if (rec.partidos) {
        const opc = { fase: t.fase, torneo: SGADD.TORNEO_TOTAL };
        if (rec.conservar) opc.conservar = rec.conservar;
        v = SGADD.construirIndice(rec.hojas, opc);
        /* El nivel de la competencia es el del libro, no el de un recorte:
           sin esto la vara de las etiquetas podría resolverse con otro. */
        if (base.liga && base.liga.nivel && v.liga && !v.liga.nivel) v.liga.nivel = base.liga.nivel;
        decorar(v, reg ? reg.idx : base, reg ? 'Regular' : null);
        v.__muestra = info;
      }
      _vista = { base: base, clave: k, idx: v, info: info, rec: v ? rec : null, opc: v ? { fase: t.fase, torneo: SGADD.TORNEO_TOTAL, conservar: rec.conservar } : null };
    }
    /* Sin partidos en la ventana se muestra el tramo entero, y la barra lo
       dice: una ficha vacía se lee como que el equipo no jugó nunca. */
    if (!_vista.idx) return base;
    if (opciones && opciones.jugadores && _vista.info.jugadoresRecortados) {
      const ev = varaDelPeriodo();
      if (ev.estado !== 'ok') return base;
      if (!_vista.idxJ || _vista.varaJ !== ev.vara) {
        const o = Object.assign({}, _vista.opc);
        if (!o.conservar) delete o.conservar;
        const vj = SGADD.construirIndice(_vista.rec.hojas, o);
        if (base.liga && base.liga.nivel && vj.liga && !vj.liga.nivel) vj.liga.nivel = base.liga.nivel;
        SGADD_MUESTRA.aplicarVara(vj, ev.vara);
        decorar(vj, reg ? reg.idx : base, reg ? 'Regular' : null);
        vj.__muestra = _vista.info;
        _vista.idxJ = vj; _vista.varaJ = ev.vara;
      }
      return _vista.idxJ;
    }
    return _vista.idx;
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
    /* Una fase DECLARADA sin datos se ve en el selector pero no se elige
       (sgadd-fases.js): el `disabled` del <option> ya lo impide, y esto es
       por si llega igual —un link armado a mano, un navegador viejo—.
       Abrirla daría un índice vacío sin explicación. */
    if (typeof SGADD_FASES !== 'undefined' && String(id || '').indexOf(SGADD_FASES.SIN_DATOS) === 0) return;
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
    /* LAS CAPAS SON DE LA CATEGORÍA: el `alcance` de la anterior (con su
       `pbp`) no puede seguir vivo mientras baja la nueva ni si la carga
       falla, o la pestaña Rendimiento se ofrece donde no hay play-by-play. */
    estado.alcance = null; estado.alcancePlanilla = null;
    /* Una ventana de fechas de otro libro no significa nada acá. */
    estado.muestra = muestraRecordada(id);
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

  /**
   * Lo que el selector dice al lado de cada categoría (punto 60).
   *
   * EL PLAN VA A LA VISTA: un club con Primera en ORO y la U23 en PLATA
   * tiene que saber, antes de elegir, por qué la ficha por jugador aparece
   * en una y no en la otra. Una categoría bloqueada dice POR QUÉ no se
   * abre —pausada no es lo mismo que sin datos, y el DT llama a distinta
   * gente por cada una—. PURA: se testea sin DOM.
   */
  const NOMBRE_BLOQUEO = { pausado: 'pausada', inactivo: 'sin servicio', vencido: 'vencida' };
  function sufijoCategoria(x) {
    if (!x) return '';
    /* Una prueba que terminó sola por fecha está pausada, pero decir
       «pausada» haría creer que alguien la pausó (punto 61). */
    if (x.bloqueada) return ' — ' + (x.pruebaVencida ? 'prueba terminada' : (NOMBRE_BLOQUEO[x.estado] || 'sin acceso'));
    /* SIN LIBRO PERO CON TORNEO se puede entrar igual, a ver el FIXTURE
       (punto 68): antes del primer partido es lo unico que hay para
       mirar, y dejar la categoria deshabilitada hasta que MotorStats
       escriba el libro dejaba al club sin ver su propio calendario. Se
       dice que es solo el fixture para que nadie espere numeros. */
    if (!x.activo) return x.torneoId ? ' — solo fixture' : ' — sin datos';
    const partes = [];
    if (x.plan) partes.push(String(x.plan).toUpperCase());
    if (x.estado === 'prueba') partes.push('en prueba');
    return partes.length ? ' · ' + partes.join(' · ') : '';
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
        lista.map(x => `<option value="${SGADD_UI.esc(x.id)}" ${x.id === estado.planillaId ? 'selected' : ''} ${(x.activo || (x.torneoId && !x.bloqueada)) ? '' : 'disabled'}>
          ${SGADD_UI.esc(x.label)}${sufijoCategoria(x)}</option>`).join('') +
        `</optgroup>`;
    });

    const info = enLlave()
      ? 'Llave entre zonas · posiciones y resultados, sin estadísticas'
      : estado.idx
      ? `${estado.idx.liga.n} equipos · ${estado.idx.liga.partidos} partidos · PJ mediano ${estado.idx.liga.pjMediano}`
      : (estado.cargando ? 'Cargando…' : '');

    /* Las opciones SIGUEN saliendo del libro. La declaración del torneo
       solo pone el nombre del reglamento («Octavos de final» donde el libro
       dice PLAYOFF) y suma, deshabilitadas, las fases que todavía no se
       jugaron (punto 75). Sin declaración queda exactamente como antes. */
    const crudos = SGADD.combinacionesTorneoFase(estado.hojas || {});
    const tramos = (typeof SGADD_FASES !== 'undefined' && estado.hojas)
      ? SGADD_FASES.enriquecerTramos(crudos, SGADD_FASES.visibles()) : crudos;
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
    const l = (estado.idx && !enLlave()) ? estado.idx.liga : null;
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
              ${tramos.map(t => `<option value="${SGADD_UI.esc(t.id)}" ${t.id === tramoActual ? 'selected' : ''} ${t.sinDatos ? 'disabled' : ''}>${SGADD_UI.esc(t.label)}</option>`).join('')}
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
        ${o.muestra ? barraMuestra(o.muestra) : ''}
      </div>`;
  }

  /* El equipo sobre el que se ofrece «Ver un partido»: el de la ficha
     abierta, el elegido en Jugadores, o el propio. Sin ninguno no se
     ofrece: una lista con todos los partidos de la liga no ayuda a nadie. */
  function equipoParaPartidos(idx, seccion) {
    let k = null;
    if (seccion === 'equipos' && typeof EQUIPOS !== 'undefined' && EQUIPOS.equipo) k = EQUIPOS.equipo.replace(/-/g, ' ');
    if (!k && seccion === 'jugadores' && typeof JUGADORES !== 'undefined' && JUGADORES.filtroEquipo) k = JUGADORES.filtroEquipo;
    let e = k ? idx.get(k) : null;
    if (!e) e = idx.lista().find(x => SGADD.esEquipoPropio(x.clave)) || null;
    if (e && typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.puedeVerEquipo && !SGADD_AUTH.puedeVerEquipo(e.clave)) return null;
    return e;
  }

  /**
   * La fila de la MUESTRA de la barra (punto 139): el selector, las fechas
   * del rango, el atajo a un partido y el badge «Muestra activa».
   *
   * «Partido específico» NO es una muestra: recalcular percentiles sobre
   * una noche es ruido (punto 4). Es un atajo al detalle del partido, que
   * ya mide cada rendimiento contra el promedio propio.
   */
  function barraMuestra(seccion) {
    const cid = clubId();
    if (cid !== 'boca' && cid !== 'reconquista' && cid !== 'deportivo') return '';
    if (typeof SGADD_MUESTRA === 'undefined' || !estado.idx || !estado.hojas || enLlave()) return '';
    const esc = SGADD_UI.esc;
    const m = estado.muestra;
    const t = tramoDeIndice();
    const dias = SGADD_MUESTRA.diasDelTramo(estado.hojas, t);
    if (!dias.length) return '';
    const valor = (m.tipo === 'semanas' || m.tipo === 'ultimos') ? m.tipo + ':' + m.n
      : (m.tipo === 'condicion' || m.tipo === 'resultado') ? m.tipo + ':' + m.valor : m.tipo;
    const opcion = (v, txt) => `<option value="${v}" ${v === valor ? 'selected' : ''}>${esc(txt)}</option>`;
    const sel = `
          <div class="sm:w-56">
            <label for="selMuestra" class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Muestra</label>
            <select id="selMuestra" onchange="SGADD_APP.elegirMuestra(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${opcion('todo', 'Todo el tramo')}
              <optgroup label="Calendario · igual para toda la liga">
              ${[1, 2, 3, 4].map(n => opcion('semanas:' + n, n === 1 ? 'Última semana' : 'Últimas ' + n + ' semanas')).join('')}
              ${opcion('rango', 'Rango de fechas…')}
              </optgroup>
              <optgroup label="Del equipo · cada uno en su condición">
              ${[4, 6, 8].map(n => opcion('ultimos:' + n, 'Sus últimos ' + n + ' partidos')).join('')}
              ${opcion('condicion:LOCAL', 'Solo de local')}${opcion('condicion:VISITANTE', 'Solo de visitante')}
              ${opcion('resultado:GANADO', 'Solo ganados')}${opcion('resultado:PERDIDO', 'Solo perdidos')}
              ${opcion('rival', 'Contra un rival…')}
              </optgroup>
            </select>
          </div>`;
    const rivales = m.tipo === 'rival' ? rivalesParaMuestra(estado.idx, seccion) : [];
    const selRival = m.tipo !== 'rival' ? '' : `
          <div class="sm:w-56">
            <label for="selRival" class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Rival</label>
            <select id="selRival" onchange="SGADD_APP.elegirMuestra('rival:' + this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${rivales.map(r => `<option value="${esc(r.clave)}" ${r.clave === m.rival ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}
            </select>
          </div>`;
    const v = SGADD_MUESTRA.ventana(m, dias) || {};
    const fecha = (id, txt, val) => `
          <div>
            <label for="${id}" class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">${txt}</label>
            <input id="${id}" type="date" value="${esc(val || '')}" min="${esc(dias[0])}" max="${esc(dias[dias.length - 1])}"
              onchange="SGADD_APP.cambiarMuestra({ tipo: 'rango', desde: document.getElementById('muestraDesde').value, hasta: document.getElementById('muestraHasta').value })"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
          </div>`;
    const rango = (m.tipo === 'rango' ? fecha('muestraDesde', 'Desde', v.desde) + fecha('muestraHasta', 'Hasta', v.hasta) : '') + selRival;

    const e = equipoParaPartidos(estado.idx, seccion);
    const partidos = e ? e.partidos.filter(p => p.__id).slice().reverse() : [];
    const atajo = partidos.length ? `
          <div class="sm:w-56">
            <label for="selPartido" class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Ver un partido</label>
            <select id="selPartido" onchange="SGADD_APP.irAPartido(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              <option value="">${esc(SGADD.limpiarNombre(e.nombre))} · elegí…</option>
              ${partidos.map(p => {
                const r = SGADD.texto(p['RESULTADO']).toUpperCase().charAt(0);
                const txt = (p.__fecha ? SGADD.formatearFecha(p.__fecha) + ' · ' : '') + SGADD.texto(p['PARTIDO'])
                  + (r === 'G' || r === 'P' ? ' (' + r + ')' : '');
                return `<option value="${esc(e.clave + '|' + p.__id)}">${esc(txt)}</option>`;
              }).join('')}
            </select>
          </div>` : '';

    const fila = `
        <div class="flex flex-col sm:flex-row sm:items-end gap-3 mt-3">${sel}${rango}${atajo}</div>`;
    const info = infoMuestra();
    if (!info) return fila;
    const vent = info.ventana || {};
    const dd = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '…';
    const avisos = [];
    const eq = info.vacia ? null : equipoParaPartidos(estado.idx, seccion);
    const pjEq = eq ? pjEnMuestra(eq.clave) : null;
    if (info.vacia) avisos.push(info.familia === 'equipo'
      ? 'Ningún equipo tiene partidos en esa condición: se muestra el tramo entero.'
      : 'La ventana no tiene partidos: se muestra el tramo entero.');
    else {
      avisos.push(info.familia === 'equipo'
        ? 'Cada equipo se mide en su propia condición: el percentil compara contra todos los equipos en esa misma situación. ▲▼ compara contra ' + (_regular && _regular.idx && _regular.base === estado.idx ? 'su Regular.' : 'su propia temporada.')
        : 'Métricas, percentiles y textos recalculados contra la liga en ese período. ▲▼ compara contra ' + (_regular && _regular.idx && _regular.base === estado.idx ? 'su Regular.' : 'su propia temporada.'));
      /* LA MUESTRA CHICA SE DICE con el equipo que se está mirando: con 1
         a 3 partidos el número se ve, pero no es una tendencia (punto 4). */
      if (eq && pjEq === 0) {
        avisos.push('⚠ ' + SGADD.limpiarNombre(eq.nombre) + ' no tiene partidos en esta muestra: su ficha sigue mostrando el tramo entero.');
      } else if (eq && pjEq <= SGADD_MUESTRA.MUESTRA_CHICA) {
        avisos.push('⚠ Muestra chica · ' + SGADD.limpiarNombre(eq.nombre) + ': ' + pjEq + (pjEq === 1 ? ' partido' : ' partidos')
          + '. El número se ve, pero no alcanza para leer una tendencia.');
      }
      if (info.sinFecha) avisos.push(info.sinFecha + ' filas sin fecha quedaron afuera: no se puede saber de qué noche son.');
      if (seccion === 'jugadores' && info.jugadoresRecortados) {
        const ev = varaDelPeriodo();
        avisos.push(ev.estado === 'ok'
          ? 'Jugadores: la liga del período la calcula el servidor (' + ev.vara.calificados + ' jugadores que llegan al umbral de minutos). '
            + 'Los rivales no viajan al panel, así que no hay grupo de afines y el ranking de la liga muestra solo a tu plantel.'
          : ev.estado === 'sin-servidor' ? 'En Jugadores tu plan ve la temporada completa: sin conexión con el servidor no se puede calcular la liga de jugadores del período.'
          : ev.estado === 'cargando' ? 'Calculando en el servidor la liga de jugadores de este período… mientras tanto, Jugadores muestra la temporada.'
          : ev.estado === 'chica' ? 'La muestra tiene menos de ' + SGADD_MUESTRA.VARA_MIN_PARTIDOS + ' partidos o de '
            + SGADD_MUESTRA.VARA_MIN_CALIFICADOS + ' jugadores que califican: el servidor no entrega la liga de jugadores de un recorte tan chico, así que Jugadores sigue con la temporada.'
          : 'No se pudo calcular la liga de jugadores del período' + (ev.mensaje ? ' (' + ev.mensaje + ')' : '') + ': Jugadores sigue con la temporada.');
      }
      avisos.push('Quintetos, Mapa de tiro y el reloj de posesión siguen siendo de la temporada; la tabla de posiciones no cambia.');
    }
    return fila + `
        <div class="muestra-badge mt-3" role="status">
          <p><b>◷ Muestra activa</b> · ${esc(info.etiqueta)}${info.familia === 'equipo' ? '' : ' · ' + esc(dd(vent.desde)) + ' → ' + esc(dd(vent.hasta))}
            · ${info.vacia ? 0 : info.partidos} de ${info.total} partidos${eq && pjEq !== null ? ' · ' + esc(SGADD.limpiarNombre(eq.nombre)) + ' ' + pjEq + ' PJ' : ''}
            <button type="button" onclick="SGADD_APP.cambiarMuestra({ tipo: 'todo' })" class="muestra-quitar">Quitar</button></p>
          ${avisos.map(a => `<p class="muestra-nota">${esc(a)}</p>`).join('')}
        </div>`;
  }

  /* La línea que los PDF suman a su encabezado con una muestra activa. Un
     informe se comparte y se archiva: sin decir de qué período habla, sus
     percentiles se leen como los de la temporada. Vacía si no aplica. */
  function textoMuestra(opciones) {
    const info = infoMuestra();
    if (!info || info.vacia) return '';
    if (opciones && opciones.jugadores && info.jugadoresRecortados && varaDelPeriodo().estado !== 'ok') return '';
    const v = info.ventana || {};
    const dd = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '…';
    if (info.familia === 'equipo') {
      return 'Muestra: ' + info.etiqueta + ' · cada equipo medido en su propia condición (' + info.partidos + ' de ' + info.total + ' partidos)';
    }
    return 'Muestra: ' + info.etiqueta + ' (' + dd(v.desde) + ' → ' + dd(v.hasta) + ', ' + info.partidos + ' de ' + info.total + ' partidos)';
  }

  /** Los PJ de un equipo en la muestra activa (0 si no tiene). null sin muestra. */
  function pjEnMuestra(clave) {
    if (!infoMuestra()) return null;
    const v = _vista && _vista.idx;
    const e = v ? v.get(clave) : null;
    return e ? (e.pj || 0) : 0;
  }

  /* Los rivales que ofrece «Contra un rival…»: los que enfrentó el equipo
     que se está mirando, por nombre; sin equipo, todos los del tramo. Salen
     del texto «A vs B» de sus partidos, que es lo que el libro dice. */
  function rivalesParaMuestra(idx, seccion) {
    if (!idx) return [];
    const e = equipoParaPartidos(idx, seccion);
    const claves = new Set();
    if (e) {
      e.partidos.forEach(p => {
        const partes = SGADD.texto(p['PARTIDO']).split(/\s+vs\s+/i);
        if (partes.length !== 2) return;
        const a = SGADD.claveEquipo(partes[0]), b = SGADD.claveEquipo(partes[1]);
        const otro = a === e.clave ? b : (b === e.clave ? a : null);
        if (otro) claves.add(otro);
      });
    } else idx.lista().forEach(x => claves.add(x.clave));
    return Array.from(claves).map(k => {
      const x = idx.get(k);
      return { clave: k, nombre: x ? SGADD.limpiarNombre(x.nombre) : k };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  /* Elegir «Rango de fechas…» abre el rango sobre el tramo entero: el DT
     ajusta desde ahí en vez de arrancar con dos campos vacíos. */
  function elegirMuestra(valor) {
    const v = String(valor || 'todo');
    if (v.indexOf('semanas:') === 0) return cambiarMuestra({ tipo: 'semanas', n: Number(v.split(':')[1]) });
    if (v.indexOf('ultimos:') === 0) return cambiarMuestra({ tipo: 'ultimos', n: Number(v.split(':')[1]) });
    if (v.indexOf('condicion:') === 0) return cambiarMuestra({ tipo: 'condicion', valor: v.split(':')[1] });
    if (v.indexOf('resultado:') === 0) return cambiarMuestra({ tipo: 'resultado', valor: v.split(':')[1] });
    if (v.indexOf('rival:') === 0) return cambiarMuestra({ tipo: 'rival', rival: v.slice(6) });
    /* «Contra un rival…» arranca con el primero de la lista: dejar el
       filtro a medio elegir mostraría una vista que no es ninguna. */
    if (v === 'rival') {
      const sec = (typeof currentSection !== 'undefined') ? currentSection : null;
      const r = rivalesParaMuestra(estado.idx, sec)[0];
      return r ? cambiarMuestra({ tipo: 'rival', rival: r.clave }) : undefined;
    }
    if (v === 'rango') {
      const dias = estado.hojas ? SGADD_MUESTRA.diasDelTramo(estado.hojas, tramoDeIndice()) : [];
      return cambiarMuestra({ tipo: 'rango', desde: dias[0], hasta: dias[dias.length - 1] });
    }
    return cambiarMuestra({ tipo: 'todo' });
  }

  /* El atajo al detalle del partido. Desde Equipos abre ahí mismo; desde
     Jugadores cruza con el mismo link que ya usa el log del jugador. */
  function irAPartido(valor) {
    const i = String(valor || '').indexOf('|');
    if (i < 0) return;
    const clave = valor.slice(0, i), id = valor.slice(i + 1);
    if (typeof currentSection !== 'undefined' && currentSection === 'equipos' && typeof equiposVerPartido === 'function') {
      EQUIPOS.equipo = clave.toLowerCase().split(' ').filter(Boolean).join('-');
      equiposVerPartido(id);
      return;
    }
    if (typeof jugadoresVerPartido === 'function') jugadoresVerPartido(clave, id);
  }

  /** El texto del aviso de fase corta (PURO sobre sus dos entradas). */
  function textoFaseCorta(pj, reg) {
    const n = Number(pj) || 0;
    const nivel = n >= 4 ? 3 : (n >= 2 ? 2 : 1);
    const palabra = nivel === 3 ? 'una tendencia' : (nivel === 2 ? 'un indicio' : 'una foto');
    const puntos = '●'.repeat(nivel) + '○'.repeat(3 - nivel);
    const rpj = reg && reg.idx && reg.idx.liga ? reg.idx.liga.pjMediano : null;
    return 'PJ mediano ' + n + ' · confianza ' + puntos + ' (' + palabra + '). '
      + 'Cada número se lee contra la Regular (' + (reg.tramo.label || reg.tramo.id)
      + (rpj ? ', PJ mediano ' + rpj : '') + '): las flechas ▲▼ son contra ella, no contra la liga. '
      + 'La confianza sube con cada partido.';
  }

  function avisoMuestra() {
    if (!estado.idx) return '';
    const reg = contextoRegular();
    if (estado.idx.liga.muestraSuficiente && !reg) return '';
    /* CERO PARTIDOS NO ES UNA MUESTRA CHICA: es un torneo que no empezó, y
       el texto de muestra insuficiente —«los percentiles no distinguen una
       debilidad estructural de un mal día»— describe otra cosa. Se separan
       los dos vacíos (punto 68). */
    if (!estado.idx.lista().length) {
      return SGADD_UI.sinDatosTodavia
        ? SGADD_UI.sinDatosTodavia({ fixture: tieneFixture() })
        : SGADD_UI.aviso('Sin partidos', 'La categoría todavía no tiene partidos cargados.');
    }
    /* UNA FASE DE ELIMINACIÓN NO ES UNA MUESTRA INSUFICIENTE: es corta por
       diseño, y tiene su referencia en la Regular del mismo libro. El aviso
       dice cuánta confianza hay y contra qué se está leyendo. */
    if (reg) return SGADD_UI.aviso('Fase corta', textoFaseCorta(estado.idx.liga.pjMediano, reg));
    return SGADD_UI.aviso('Muestra insuficiente',
      'PJ mediano ' + estado.idx.liga.pjMediano + '. Con tan pocos partidos los percentiles no distinguen una debilidad estructural de un mal día.');
  }

  /* ¿Hay un fixture al que mandar? Solo si la categoría declara torneo:
     ofrecer un botón que lleva a «esta categoría no está enganchada» sería
     mandar al DT a otro vacío. */
  function tieneFixture() {
    try {
      const p = planillaActual();
      return !!(p && p.torneoId);
    } catch (e) { return false; }
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
    /* EN MODO LLAVE las secciones que dependen del tramo no se repintan
       con sus propias funciones —pintarían el índice de la fase regular
       como si fuera la elegida—: pasan por el router, que pone el aviso. */
    if (enLlave() && SGADD_FASES.bloqueaEnLlave(currentSection, estado.torneo)) {
      if (typeof renderSection === 'function') { try { renderSection(currentSection); } catch (e) { console.warn('[app]', e); } }
      return;
    }
    /* Y AL VOLVER, TAMBIÉN (punto 79). Con el aviso del modo llave en
       pantalla, la sección no tiene su contenedor (`#equiposRoot`,
       `#scoutRoot`…) y su función de repintado salía sin hacer nada: la
       barra quedaba en la fase de la zona con el aviso viejo abajo. */
    if (typeof document !== 'undefined' && document.querySelector && document.querySelector('#view-root [data-modo-llave]')) {
      if (typeof renderSection === 'function') { try { renderSection(currentSection); } catch (e) { console.warn('[app]', e); } }
      return;
    }
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
    /* El Fixture filtra por la fase de la barra (punto 75): sin repintarse
       seguía mostrando la instancia anterior con el selector ya cambiado. */
    if (currentSection === 'fixture' && typeof SGADD_FIXTURE !== 'undefined') SGADD_FIXTURE.pintar();
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
    tramoPreferido, recordarTramo, enLlave,
    estado, inicializar, cargar, reindexar, cambiarPlanilla, cambiarFase, cambiarTorneo, cambiarTramo,
    aplicarTorneoRuta, planillaActual, fases, torneos, barra, avisoMuestra, contextoRegular, idxRegular, idxPrevio, etiquetaRegular, textoFaseCorta, onCambio, adoptarEquipoDeCategoria,
    recordarCategoria, categoriaRecordada, sufijoCategoria,
    cambiarMuestra, elegirMuestra, irAPartido, textoMuestra, pjEnMuestra, rivalesParaMuestra, varaDelPeriodo, idxVista, infoMuestra, muestraRecordada, barraMuestra,
    get idx() { return estado.idx; },
  };
})();

/* Se exporta SOLO para poder testear `tramoPreferido`, que es logica pura
   y decide que ve el DT al cambiar de categoria. El resto del modulo usa
   `document` y `SGADD.CATALOGO`, y se sigue verificando en el navegador —
   igual que Equipos, que tiene su export por el mismo motivo (punto 8). */
if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_APP;
