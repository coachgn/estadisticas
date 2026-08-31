/* =====================================================================
   SGADD · Roles, planes y permisos

   Quién ve qué: los administradores ven todo, y un club ve lo suyo según
   el plan que contrató.

   ---------------------------------------------------------------------
   LEER ESTO ANTES DE TOCAR NADA: ESTO NO ES SEGURIDAD

   Es un GATE DE INTERFAZ, y la diferencia importa.

   El panel es un sitio ESTÁTICO servido por GitHub Pages y lee las
   planillas por GViz ANÓNIMO. O sea:

     · los `sheetId` viven en `clubes/<club>.json`, que es un archivo
       público: cualquiera lo abre y lee la planilla ENTERA sin pasar por
       el panel;
     · todo este módulo corre en el navegador del usuario, así que
       cualquiera con la consola abierta se pone `plan: 'PRO'` o se cambia
       el `equipoAsignado` y ve todo.

   Lo que ESTE módulo sí hace, y que es valioso para el producto:

     · cada club abre su link y encuentra SU vista, sin tener que ignorar
       once equipos que no le importan,
     · el plan Básico ve que el módulo Pro existe y cómo pedirlo,
     · un cruce de scouting no se puede armar mal por accidente.

   Lo que NO hace, y no puede hacer sin backend: impedir que alguien que
   quiera mirar los datos de otro club los mire. Eso es la deuda técnica
   del punto 10 de CLAUDE.md y se cierra con un servidor que autentique y
   sirva los datos ya filtrados — no con más código acá.

   Al escribir un mensaje de la UI hay que respetar esa distinción: se
   dice "tu plan no incluye este módulo", nunca "tus datos están
   protegidos".
   ===================================================================== */
const SGADD_AUTH = (function () {
  'use strict';

  /* Los tres mails con acceso total. Es una lista literal a propósito: un
     patrón (`@motorstats.ar`, por ejemplo) le daría admin a cualquier mail
     nuevo de ese dominio sin que nadie lo decida. */
  const ADMINS = [
    'freytesgn@gmail.com',
    'francasa09@gmail.com',
    'motorstats.ar@gmail.com',
  ];

  /* MASTER es un plan declarado que HOY no desbloquea nada que PRO no
     tenga: ningun modulo lo distingue en `MODULOS`. Se reconoce para que
     el admin pueda etiquetar la relacion comercial desde el Panel Master,
     y queda anotado que sigue siendo una etiqueta hasta que se decida que
     incluye. Inventarle un modulo seria peor que dejarlo explicito. */
  const PLANES = { BASICO: 'BASICO', PRO: 'PRO', MASTER: 'MASTER' };

  /* El orden importa para comparar planes: el del CLUB acota al del token
     (ver `planEfectivo` del servidor), y para eso hay que saber cual es
     menor. */
  const ORDEN_PLAN = { BASICO: 0, PRO: 1, MASTER: 2 };
  const ROLES = { ADMIN: 'ADMIN', CLIENTE: 'CLIENTE', ABIERTO: 'ABIERTO' };

  /* Qué pide cada sección. `null` = no pide nada.

     La matriz está acá y NO repartida por las secciones: con la regla
     escrita en cada módulo, agregar una sección nueva la deja sin gate y
     nadie se entera. Acá una sección que falte en el mapa cae al default,
     y hay un test que compara estas claves contra `SGADD.SECCIONES`. */
  const MODULOS = {
    principal: null,
    clasificacion: null,
    equipos: null,          // completa, pero el picker se filtra
    jugadores: null,        // ídem
    scouting: { plan: PLANES.PRO },
    simulador: { soloAdmin: true },
    configuracion: { soloAdmin: true },
    diagnostico: { soloAdmin: true },
  };

  /* El motivo por el que se deniega, para que la UI diga la verdad: un
     "no tenés permiso" cuando en realidad falta el plan manda al DT a
     pedirle acceso a alguien en vez de mejorar el plan. */
  const MOTIVOS = {
    OK: 'OK',
    SOLO_ADMIN: 'SOLO_ADMIN',
    REQUIERE_PLAN: 'REQUIERE_PLAN',
    OTRO_EQUIPO: 'OTRO_EQUIPO',
  };

  /* --------------------------------------------------------------------
     NORMALIZACIÓN
     -------------------------------------------------------------------- */

  /* Mayúsculas y espacios nada más. NO se normalizan los puntos ni los
     alias con `+` de Gmail, aunque `f.reytesgn@gmail.com` sea la misma
     casilla: esto es una LISTA DE PERMITIDOS, y toda normalización de más
     ensancha quién entra. Que un admin tenga que escribir su mail exacto
     es barato; que una variante inesperada caiga adentro, no. */
  function normalizarEmail(v) {
    return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  }

  /* Los equipos se comparan con el MISMO normalizador que usa el resto de
     la app (`claveEquipo`), no con una comparación de strings: la planilla
     escribe `DEPORTIVO LA PLATA - MM` y el JSON del cliente declara
     `DEPORTIVO LA PLATA`. Sin normalizar, el club no se reconocería a sí
     mismo y se quedaría sin ver nada. */
  const nucleo = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require !== 'undefined' ? require('./sgadd-core.js') : null);

  function claveEq(v) {
    if (v === undefined || v === null || v === '') return '';
    return nucleo && nucleo.claveEquipo ? nucleo.claveEquipo(v)
      : String(v).trim().toUpperCase();
  }

  /* --------------------------------------------------------------------
     LA SESIÓN

     Vive en el módulo y se puede escribir de tres formas, en este orden de
     precedencia: lo que setea el código, la URL y `localStorage`.

     SIN SESIÓN el panel se comporta EXACTAMENTE como antes: acceso
     completo. No es un descuido, es la única opción honesta — no hay
     autenticación, así que un "deny by default" no protegería nada (los
     datos siguen a un `fetch` de distancia) y en cambio rompería el panel
     para los tres clubes que lo usan hoy. El rol se llama `ABIERTO` y no
     `ADMIN` justamente para que se pueda distinguir en los logs y en los
     tests quién entró por la puerta y quién porque no hay puerta.
     -------------------------------------------------------------------- */
  let sesionActual = null;

  function parsearSesion(crudo) {
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
    const email = normalizarEmail(crudo.email);
    if (!email) return null;
    const plan = String(crudo.plan || '').trim().toUpperCase();
    return {
      email: email,
      equipoAsignado: crudo.equipoAsignado ? String(crudo.equipoAsignado).trim() : null,
      /* Un plan que no se reconoce cae a BÁSICO y no a PRO: ante la duda,
         el menos permisivo. Un typo en el JSON no puede regalar el módulo
         que se cobra aparte. */
      plan: (plan === PLANES.PRO || plan === PLANES.MASTER) ? plan : PLANES.BASICO,
      nombre: crudo.nombre ? String(crudo.nombre).trim() : '',
    };
  }

  function establecerSesion(crudo) {
    sesionActual = parsearSesion(crudo);
    return sesionActual;
  }

  function limpiarSesion() { sesionActual = null; }

  function sesion() { return sesionActual; }

  /* --------------------------------------------------------------------
     LOS CUATRO GUARDS. Todos PUROS: reciben la sesión o la toman del
     módulo, y no tocan el DOM. Se pueden testear enteros desde Node.
     -------------------------------------------------------------------- */

  function esAdmin(email) {
    return ADMINS.indexOf(normalizarEmail(email)) !== -1;
  }

  function rol(s) {
    const ses = (s === undefined) ? sesionActual : parsearSesion(s) || s;
    if (!ses || !ses.email) return ROLES.ABIERTO;
    return esAdmin(ses.email) ? ROLES.ADMIN : ROLES.CLIENTE;
  }

  /* Un admin y una sesión ausente pasan por todo. Se resuelven juntos
     porque la pregunta que contestan es la misma —"¿hay algo que
     restringir?"— y separarlos duplicaría el chequeo en los cuatro
     guards, que es donde se cuela el que se olvida. */
  function sinRestricciones(s) { return rol(s) !== ROLES.CLIENTE; }

  function normalizarSes(s) {
    return (s === undefined) ? sesionActual : (parsearSesion(s) || null);
  }

  /**
   * ¿Puede ver los datos de este equipo?
   * Un cliente ve SOLO su equipo asignado. Un cliente SIN equipo asignado
   * no ve ninguno: es una configuración incompleta, y dejarlo ver todo
   * convertiría el error de config en acceso total sin ningún síntoma.
   */
  function puedeVerEquipo(equipo, s) {
    if (sinRestricciones(s)) return true;
    const ses = normalizarSes(s);
    const suyo = claveEq(ses && ses.equipoAsignado);
    const pedido = claveEq(equipo);
    if (!suyo || !pedido) return false;
    return suyo === pedido;
  }

  /** ¿Tiene el módulo que pide esta sección? */
  /** El plan como se escribe en pantalla. */
  function nombrePlan(p) {
    if (p === PLANES.MASTER) return 'Master';
    if (p === PLANES.PRO) return 'Pro';
    return 'Básico';
  }

  function tieneModulo(modulo, s) {
    const regla = Object.prototype.hasOwnProperty.call(MODULOS, modulo)
      ? MODULOS[modulo]
      /* Una sección que no está en la matriz se trata como abierta, igual
         que las que declaran `null`. Es lo mismo que hacía el panel antes
         de que existiera este módulo, así que una sección nueva no se
         rompe sola — pero hay un test que exige que la matriz cubra todas
         las de `SGADD.SECCIONES`, para que no pase inadvertido. */
      : null;
    if (!regla) return true;
    if (sinRestricciones(s)) return true;
    if (regla.soloAdmin) return false;
    if (regla.plan) {
      const ses = normalizarSes(s);
      if (!ses) return false;
      /* SE COMPARA POR ORDEN, NO POR IGUALDAD. Con `===`, MASTER se
         quedaba sin Scouting —que pide PRO— porque no es literalmente
         PRO: un plan superior perdiendo un modulo del inferior es la
         clase de bug que nadie reporta porque parece un permiso mal
         puesto. Un plan desconocido no tiene orden y no alcanza nada. */
      const tengo = ORDEN_PLAN[ses.plan];
      const pide = ORDEN_PLAN[regla.plan];
      return tengo !== undefined && pide !== undefined && tengo >= pide;
    }
    return true;
  }

  /**
   * El guard del router. Devuelve el motivo además del veredicto: la UI
   * tiene que poder decir "esto necesita el Plan Pro" y no un genérico.
   *
   * @returns {{ok: boolean, motivo: string, plan: string|null}}
   */
  function puedoAcceder(seccion, s) {
    const regla = Object.prototype.hasOwnProperty.call(MODULOS, seccion)
      ? MODULOS[seccion] : null;
    if (!regla || sinRestricciones(s)) return { ok: true, motivo: MOTIVOS.OK, plan: null };
    if (regla.soloAdmin) return { ok: false, motivo: MOTIVOS.SOLO_ADMIN, plan: null };
    if (regla.plan && !tieneModulo(seccion, s)) {
      return { ok: false, motivo: MOTIVOS.REQUIERE_PLAN, plan: regla.plan };
    }
    return { ok: true, motivo: MOTIVOS.OK, plan: null };
  }

  /**
   * LA REGLA DE ORO DEL SCOUTING: un cliente solo puede scoutear cruces
   * donde juegue SU equipo. Nada de "rival contra rival".
   *
   * El motivo no es de privacidad —los datos de los dos rivales están en
   * la misma planilla que ya ve— sino de producto: el informe pre-partido
   * es para preparar UN partido propio, y armar cruces ajenos convierte la
   * herramienta en un servicio de scouting para toda la liga.
   */
  function puedeScoutearCruce(local, visitante, s) {
    if (sinRestricciones(s)) return true;
    if (!tieneModulo('scouting', s)) return false;
    /* Un cruce a medio armar todavía no viola nada: se valida al elegir el
       segundo equipo, no antes. Bloquearlo con un solo lado elegido daría
       un error mientras el usuario está a mitad de camino. */
    if (!local || !visitante) return true;
    /* El mismo equipo de los dos lados no es un cruce. Lo rechaza también
       el motor del informe (`plantelDefensor` devuelve vacío), pero mejor
       que no llegue hasta ahí. */
    if (claveEq(local) === claveEq(visitante)) return false;
    return puedeVerEquipo(local, s) || puedeVerEquipo(visitante, s);
  }

  /**
   * Arma el cruce válido más cercano al que el usuario pidió.
   *
   * `ladoTocado` es cuál de los dos acaba de elegir: ESE se respeta y el
   * OTRO se fuerza a su equipo. Sin ese dato habría que adivinar cuál de
   * los dos pisar, y el 50% de las veces se le borraría al usuario justo
   * el equipo que acaba de elegir.
   *
   * @returns {{local, visitante, forzado: boolean}}
   */
  function forzarCruce(local, visitante, ladoTocado, s) {
    const salida = { local: local || null, visitante: visitante || null, forzado: false };
    if (sinRestricciones(s)) return salida;
    const ses = normalizarSes(s);
    const suyo = ses && ses.equipoAsignado;
    if (!suyo) return salida;

    const otro = ladoTocado === 'local' ? 'visitante' : 'local';

    /* Si el lado tocado ES su equipo, el otro queda libre: puede elegir
       contra quién juega. Es el caso normal y no se toca nada. */
    if (puedeVerEquipo(salida[ladoTocado], s)) return salida;

    /* Tocó un rival. El otro lado pasa a ser su equipo — salvo que ya lo
       fuera, en cuyo caso el cruce ya era válido y `forzado` queda en
       false: avisar de un cambio que no ocurrió es ruido. */
    if (puedeVerEquipo(salida[otro], s)) return salida;

    salida[otro] = suyo;
    salida.forzado = true;
    return salida;
  }

  /**
   * La lista de equipos que le corresponde ver a esta sesión.
   *
   * OJO: NO se usa en los rankings de liga, que van completos a propósito
   * —comparar contra la liga entera es el valor del panel y no expone nada
   * que la tabla de posiciones no muestre ya—. Se usa en los pickers, que
   * es donde se elige a quién ANALIZAR en profundidad.
   */
  function equiposVisibles(lista, s) {
    const arr = Array.isArray(lista) ? lista : [];
    if (sinRestricciones(s)) return arr;
    return arr.filter(e => puedeVerEquipo(e && (e.clave || e.nombre || e), s));
  }

  /** El equipo del cliente, ya normalizado. `null` para admin o sin sesión. */
  function equipoPropio(s) {
    if (sinRestricciones(s)) return null;
    const ses = normalizarSes(s);
    return (ses && ses.equipoAsignado) || null;
  }

  /* --------------------------------------------------------------------
     DE DÓNDE SALE LA SESIÓN

     Sin backend no hay login, así que la sesión se CONFIGURA. Dos vías,
     y la URL gana:

       ?usuario=<mail>&equipo=<EQUIPO>&plan=BASICO|PRO
       localStorage['sgadd.sesion']

     La URL manda para que un link armado a mano abra la vista de ese
     club en cualquier navegador, que es como se entrega hoy. Y se
     PERSISTE al entrar por URL, para que un F5 o un link interno no
     devuelva al usuario a la vista completa a mitad de trabajo.

     `?usuario=` sin valor LIMPIA la sesión: sin eso, un cliente que
     entró una vez por link se quedaba con esa vista para siempre y no
     tenía forma de salir. Es también el escape del admin que probó una
     sesión de cliente.
     -------------------------------------------------------------------- */
  const CLAVE_SESION = 'sgadd.sesion';
  const CLAVE_TOKEN = 'sgadd.token';

  /* --------------------------------------------------------------------
     EL TOKEN FIRMADO

     Con backend, la sesión ya NO sale de `?usuario=&plan=PRO` —que
     cualquiera edita— sino de un JWT que firma el servidor. El navegador
     puede LEERLO pero no puede fabricar uno que valide.

     ACÁ SE DECODIFICA SIN VERIFICAR, Y ESTÁ BIEN QUE ASÍ SEA: la firma
     se verifica con `JWT_SECRET`, que el navegador no tiene ni puede
     tener. Lo que se decodifica sirve para UNA sola cosa: pintar la
     interfaz que corresponde (esconder Scouting, filtrar el picker) antes
     de que llegue la primera respuesta.

     QUIEN DECIDE ES EL SERVIDOR. Si alguien edita el payload de su token
     para verse Pro, el panel le va a MOSTRAR el módulo y el backend le va
     a devolver 403 sin un solo dato. Esa es exactamente la diferencia
     entre el gate de interfaz y la seguridad, y por eso el gate del punto
     19 sigue existiendo sin ser lo que protege.
     -------------------------------------------------------------------- */
  let tokenActual = null;

  function token() { return tokenActual; }

  /** Lee el payload de un JWT SIN verificar la firma. Solo para la UI. */
  function leerPayload(jwt) {
    try {
      const p = String(jwt || '').split('.')[1];
      if (!p) return null;
      const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
      const relleno = b64 + '='.repeat((4 - b64.length % 4) % 4);
      /* `decodeURIComponent(escape(atob(...)))` y no `atob` a secas: sin
         eso un nombre con acento sale con la codificación rota. */
      const txt = decodeURIComponent(escape(atob(relleno)));
      const o = JSON.parse(txt);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }

  /**
   * Guarda el token y arma la sesión que va a usar la UI.
   *
   * Un token VENCIDO no se acepta: el servidor lo iba a rechazar igual, y
   * pintar la interfaz de un cliente cuya sesión ya no vale es peor que
   * pedirle un link nuevo — se pasaría el rato viendo 401.
   */
  function establecerToken(jwt) {
    const p = leerPayload(jwt);
    if (!p || !p.email) return null;
    if (typeof p.exp === 'number' && p.exp * 1000 <= Date.now()) {
      tokenActual = null;
      return { vencido: true };
    }
    tokenActual = jwt;
    return establecerSesion({
      email: p.email,
      equipoAsignado: p.equipoAsignado,
      plan: p.plan,
    });
  }

  function limpiarToken() { tokenActual = null; }

  /* El club al que está atado el token. El panel lo necesita para no
     ofrecerle al cliente un club que su token no cubre. */
  function clubDelToken() {
    const p = leerPayload(tokenActual);
    return (p && p.club) || null;
  }

  function almacen() {
    try {
      return (typeof localStorage !== 'undefined') ? localStorage : null;
    } catch (e) { return null; }   // modo privado puede tirar al acceder
  }

  function cargarSesion(busqueda) {
    let q = null;
    try {
      const cadena = (busqueda !== undefined) ? busqueda
        : (typeof window !== 'undefined' && window.location ? window.location.search : '');
      q = new URLSearchParams(cadena || '');
    } catch (e) { q = null; }

    /* EL TOKEN GANA sobre `?usuario=`, y no es un empate de precedencia:
       son dos cosas distintas. `?usuario=` es la configuración de
       demostración que se puede editar; el token es una credencial
       firmada. Donde hay credencial, la configuración manual sobra.

       Y SE SACA DE LA URL apenas se lee: un token en el query string
       queda en el historial del navegador, en el `Referer` de cualquier
       recurso externo y en los logs de todo proxy en el camino. Se pasa a
       `sessionStorage`, que muere con la pestaña. */
    if (q && (q.has('access_token') || q.has('token'))) {
      const jwt = q.get('access_token') || q.get('token');
      if (!jwt) { limpiarToken(); limpiarSesion(); borrarGuardada(); return null; }
      const r = establecerToken(jwt);
      sacarTokenDeLaUrl();
      if (r && r.vencido) return null;
      guardarToken(jwt);
      return sesionActual;
    }

    const guardado = leerTokenGuardado();
    if (guardado) {
      const r = establecerToken(guardado);
      /* Un token guardado que venció se borra en vez de arrastrarse: si
         no, el DT vuelve al día siguiente y ve una interfaz de cliente
         que el servidor ya no atiende. */
      if (!r || r.vencido) { borrarTokenGuardado(); limpiarToken(); }
      else return sesionActual;
    }

    if (q && q.has('usuario')) {
      const email = q.get('usuario');
      if (!email) { limpiarSesion(); borrarGuardada(); return null; }
      const ses = establecerSesion({
        email: email,
        equipoAsignado: q.get('equipo'),
        plan: q.get('plan'),
        nombre: q.get('nombre'),
      });
      guardar(ses);
      return ses;
    }

    const ls = almacen();
    if (ls) {
      try {
        const crudo = ls.getItem(CLAVE_SESION);
        if (crudo) return establecerSesion(JSON.parse(crudo));
      } catch (e) { /* un JSON corrupto se ignora: se abre sin sesión */ }
    }
    limpiarSesion();
    return null;
  }

  function guardar(ses) {
    const ls = almacen();
    if (!ls) return;
    try {
      if (ses) ls.setItem(CLAVE_SESION, JSON.stringify(ses));
      else ls.removeItem(CLAVE_SESION);
    } catch (e) { /* sin almacenamiento la sesión dura lo que la pestaña */ }
  }

  function borrarGuardada() { guardar(null); }

  /* El token va a `sessionStorage` y NO a `localStorage`: muere al cerrar
     la pestaña. Es una credencial, no una preferencia — y en una
     computadora compartida (la del club, la del profe) la diferencia
     entre las dos es quién puede seguir mirando mañana. */
  function almacenSesion() {
    try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; }
    catch (e) { return null; }
  }
  function guardarToken(jwt) {
    const ls = almacenSesion();
    try { if (ls) ls.setItem(CLAVE_TOKEN, jwt); } catch (e) { /* sin storage dura lo que la página */ }
  }
  function leerTokenGuardado() {
    const ls = almacenSesion();
    try { return ls ? ls.getItem(CLAVE_TOKEN) : null; } catch (e) { return null; }
  }
  function borrarTokenGuardado() {
    const ls = almacenSesion();
    try { if (ls) ls.removeItem(CLAVE_TOKEN); } catch (e) { /* nada que borrar */ }
  }

  /** Borra el token del query string sin recargar ni tocar el hash. */
  function sacarTokenDeLaUrl() {
    try {
      if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
      const u = new URL(window.location.href);
      if (!u.searchParams.has('access_token') && !u.searchParams.has('token')) return;
      u.searchParams.delete('access_token');
      u.searchParams.delete('token');
      /* El HASH se conserva: es la ruta de la app, y perderlo mandaría al
         DT a la pantalla de inicio cada vez que abre un link compartido. */
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* una URL rara no puede impedir que la app abra */ }
  }

  /** Etiqueta para la UI: quién está mirando y con qué plan. */
  function descripcionSesion(s) {
    const ses = normalizarSes(s);
    if (!ses) return null;
    const r = rol(ses);
    if (r === ROLES.ADMIN) return { rol: r, texto: 'Administrador', detalle: ses.email };
    return {
      rol: r,
      texto: ses.equipoAsignado || 'Sin equipo asignado',
      detalle: ses.email + ' · Plan ' + nombrePlan(ses.plan),
    };
  }

  return {
    ADMINS, PLANES, ORDEN_PLAN, nombrePlan, ROLES, MODULOS, MOTIVOS, CLAVE_SESION,
    normalizarEmail, parsearSesion, establecerSesion, limpiarSesion, sesion,
    esAdmin, rol, sinRestricciones,
    puedeVerEquipo, tieneModulo, puedoAcceder, puedeScoutearCruce,
    forzarCruce, equiposVisibles, equipoPropio,
    cargarSesion, descripcionSesion,
    token, establecerToken, limpiarToken, leerPayload, clubDelToken,
    sacarTokenDeLaUrl, CLAVE_TOKEN,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_AUTH;
