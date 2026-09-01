/* =====================================================================
   Los handlers · lógica sin HTTP

   Cada uno recibe un objeto plano y devuelve `{status, body}`. No conocen
   Express, ni Vercel, ni `req`/`res`.

   Eso es lo que permite tres cosas:

     1. que el MISMO código corra en Express y en una función serverless,
        sin duplicar la lógica en dos envoltorios;
     2. que `test-backend.js` los ejerza SIN INSTALAR NADA ni levantar un
        servidor — la suite del proyecto corre con `node test-x.js` desde
        la raíz y esto no puede ser la excepción;
     3. que el filtrado se pueda testear contra el payload real que sale,
        y no contra lo que uno cree que sale.

   Es la misma separación que ya hace el frontend entre motor puro y UI.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const admins = require('../lib/admins.js');
const clientes = require('../lib/clientes.js');
const AUTHS = require('../lib/auth.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const reglas = require('../lib/reglas.js');
const alertas = require('../lib/alertas.js');
const sheets = require('../lib/google-sheets.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

/* Los mensajes de error NO dicen de más. "La firma no valida" y "el token
   venció" son distintos para el usuario (uno pide un link nuevo, el otro
   avisa que algo raro pasa), pero ninguno describe el formato interno. */
const ERRORES = {
  SIN_TOKEN: 'Falta el token de acceso. Pedile al club el link de ingreso.',
  VENCIDO: 'El link de acceso venció. Pedí uno nuevo.',
  FIRMA_INVALIDA: 'El token de acceso no es válido.',
  PAYLOAD_INVALIDO: 'El token de acceso no es válido.',
};

function error(status, codigo, mensaje, extra) {
  return { status, body: Object.assign({ ok: false, codigo, mensaje }, extra || {}) };
}

/** Verifica el token una sola vez y arma el contexto de la petición. */
function contexto(peticion) {
  const token = tokenDeLaPeticion(peticion);
  const v = verificarToken(token);
  if (!v.ok) return { error: error(401, v.motivo, ERRORES[v.motivo] || ERRORES.FIRMA_INVALIDA) };
  return { sesion: v.sesion, rol: v.rol, tokenClub: v.club, expiraEn: v.expiraEn };
}

/**
 * EL GUARD DE SUSCRIPCIÓN · un club pausado, dado de baja o vencido no
 * entrega datos.
 *
 * Va acá, en el servidor, y no en el frontend: el gate de interfaz del
 * punto 19 NO es seguridad —cualquiera con la consola se pone `rol:
 * ADMIN`— pero esto SÍ lo es, porque el que decide si las hojas salen de
 * Google es este proceso. Es la primera vez que el proyecto tiene una
 * restricción comercial que se puede hacer valer de verdad.
 *
 * EL ADMIN PASA IGUAL, y no es un agujero: es la condición para poder
 * arreglar. Si pausar un cliente también lo escondiera del admin, la única
 * forma de revisar por qué no anda sería reactivarlo — o sea darle el
 * servicio para poder mirar si hay que dárselo. La respuesta lleva el
 * estado para que el Panel Master lo pueda decir en pantalla.
 */
function guardSuscripcion(club, ctx) {
  const efectivo = mutar.estadoEfectivo(club);
  if (efectivo === 'activo') return null;
  if (ctx.rol === AUTH.ROLES.ADMIN) return null;

  /* Tres mensajes distintos porque son tres situaciones distintas, y el
     que las recibe hace cosas distintas con cada una: renovar, llamar a
     comercial, o nada. Un "acceso denegado" genérico obliga a preguntar. */
  const textos = {
    pausado: 'El acceso de este club está pausado. Hablá con el administrador para reactivarlo.',
    inactivo: 'Este club no tiene el servicio activo.',
    vencido: 'La suscripción de este club venció el ' + (club.vence || '—')
      + '. Hablá con el administrador para renovarla.',
  };
  return error(403, 'SUSCRIPCION_' + efectivo.toUpperCase(),
    textos[efectivo] || 'Este club no tiene el servicio activo.',
    { estado: efectivo, vence: club.vence || null });
}

/**
 * EL PLAN EFECTIVO · el del CLUB manda sobre el del token.
 *
 * El plan viajaba solo en el JWT, así que bajarle el plan a un cliente
 * obligaba a reemitir su link — y el viejo seguía firmado y válido hasta
 * vencer, o sea que el downgrade no tenía efecto hasta entonces. Con el
 * plan en el catálogo el cambio es inmediato.
 *
 * EL DEL CLUB GANA, EN LOS DOS SENTIDOS. Y esto estuvo al revés.
 *
 * La primera versión tomaba el MENOR de los dos —el club acotaba pero no
 * ampliaba— con el argumento de que el token es lo que el usuario aceptó.
 * Se vio en la verificación: con el club en ORO y un token emitido en PRO,
 * el plan efectivo salía PLATA y el distintivo de ORO no aparecía. O sea
 * que el cliente pagaba ORO y no lo veía hasta que alguien se acordara de
 * reemitirle el link.
 *
 * El argumento del tope solo vale para el DOWNGRADE, que es donde un token
 * viejo podría dar más de lo que se paga. Para el upgrade no protege nada:
 * el club es la entidad que contrata, y el plan del token es en realidad un
 * atributo del club que quedó horneado el día que se emitió el link.
 *
 * Este producto no tiene planes por usuario dentro de un mismo club —el
 * plan es comercial y por cliente— así que el token no aporta información
 * que el catálogo no tenga más fresca.
 *
 * SIN PLAN EN EL CLUB manda el del token: es el caso de los clubes que
 * todavía no tienen plan asignado en el catálogo, y ahí lo único que se
 * sabe es lo que dice su link.
 */
/* El orden sale de `AUTH`, que es el mismo motor que usa el frontend: dos
   tablas de orden terminan discrepando y la que se relaja es siempre la
   del servidor, que es la que decide de verdad. */
const ORDEN_PLAN = AUTH.ORDEN_PLAN;

function planEfectivo(club, sesion) {
  /* Se normaliza: el catalogo puede traer un nombre viejo (`PRO`) y sin
     pasarlo por el alias caeria a BRONCE, bajandole el plan al cliente sin
     que nadie lo haya tocado. */
  if (club && club.plan) return AUTH.normalizarPlan(club.plan);
  return AUTH.normalizarPlan(sesion && sesion.plan);
}

/**
 * El catálogo que el frontend SÍ puede conocer: slugs y etiquetas.
 * Sin un solo `sheetId` — es el objetivo entero del backend.
 */
async function manejarCatalogo(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;
  /* La cascada se resuelve UNA vez por request y queda cacheada. */
  const cat = await catalogo.cargar(deps);
  return {
    status: 200,
    body: {
      ok: true,
      usuario: { email: ctx.sesion.email, rol: ctx.rol, plan: ctx.sesion.plan,
        equipoAsignado: ctx.sesion.equipoAsignado, expiraEn: ctx.expiraEn },
      /* EL ESTADO COMERCIAL VA SOLO PARA EL ADMIN. `manejarCatalogo` no
         tiene gate de rol —cualquier usuario con token recibe la lista de
         clubes— así que mandarle plan y vencimiento a todos le contaría a
         cada cliente la situación de facturación de los demás. */
      clubes: catalogo.publico(cat.catalogo, { admin: ctx.rol === AUTH.ROLES.ADMIN }),
      /* DE DÓNDE SALE, para el hub. Sin esto no hay forma de saber desde
         afuera si el catálogo viene de KV o del código, y esa es
         justamente la pregunta al dar de alta un cliente: un alta que
         escribe en KV no cambia nada si el servidor sigue leyendo del
         código. Es metadato de operación, no un dato del club. */
      origen: cat.origen,
      aviso: cat.aviso || null,
    },
  };
}

/**
 * GET /api/v1/equipos/:clubId
 *
 * Con `?equipo=` devuelve la ficha de UN equipo; sin él, el libro
 * recortado a lo que la sesión puede ver.
 */
async function manejarEquipos(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;

  const q = (peticion && peticion.query) || {};
  const params = (peticion && peticion.params) || {};
  const cascada = await catalogo.cargar(deps);
  const cat = catalogo.resolver(cascada.catalogo, params.clubId, q.categoria);
  if (!cat) return error(404, 'SIN_CATEGORIA', 'No existe esa categoría.');

  /* EL TOKEN ESTÁ ATADO A UN CLUB. Sin esto, el token de un cliente de
     DEPORTIVO serviría para pedir el libro de Reconquista: su
     `equipoAsignado` no está ahí, así que el recorte por equipo le
     devolvería una cáscara vacía… pero con los encabezados, los partidos y
     la tabla de posiciones de un club que no contrató. */
  /* La suscripción ANTES que el equipo: un club pausado no entrega datos
     ni siquiera de su propio equipo. */
  const bloqueo = guardSuscripcion(cat.suscripcion || {}, ctx);
  if (bloqueo) return bloqueo;

  if (!AUTH.sinRestricciones(ctx.sesion) && ctx.tokenClub && ctx.tokenClub !== cat.clubId) {
    return error(403, 'OTRO_CLUB', 'Tu acceso no incluye ese club.');
  }

  /* EL 403 POR EQUIPO AJENO, que es el caso que pidió el PoC.

     Se responde 403 y no 404: en una liga la lista de equipos es pública
     —está en la tabla de posiciones— así que negar su existencia no
     protege nada y confunde al que se equivocó de link. */
  if (q.equipo && !reglas.puedeAnalizarEquipo(q.equipo, ctx.sesion)) {
    return error(403, AUTH.MOTIVOS.OTRO_EQUIPO,
      'Tu acceso cubre solo a ' + (ctx.sesion.equipoAsignado || 'tu equipo')
      + '. La tabla de posiciones y los rankings de liga sí están disponibles.',
      { disponible: ['clasificacion', 'rankings'] });
  }

  let libro;
  try {
    libro = await sheets.obtenerLibro(cat.sheetId, deps);
  } catch (e) {
    return fallaDeDatos(e);
  }

  /* Se calculan sobre `libro` (completo) y NO sobre `rec` (recortado):
     el punto es justamente detectar a los jugadores que el recorte saca.

     El tramo llega del cliente porque una racha se cuenta DENTRO de una
     competencia: los mismos equipos en IDA y en VUELTA son dos torneos
     distintos y mezclarlos daría rachas inventadas (punto 3 ter). */
  let alertasDelTramo = { alertas: [], fase: null, torneo: null };
  try {
    alertasDelTramo = alertas.alertasDeLaLiga(libro,
      { fase: q.fase, torneo: q.torneo }, { claveCache: cat.slug });
  } catch (e) {
    /* Un fallo del detector NO puede tumbar la carga de la categoría: el
       panel sin alertas sirve, el panel sin datos no. Se loguea y se
       sigue con la lista vacía. */
    console.error('[sgadd] alertas:', e && e.stack ? e.stack : e);
  }

  const rec = reglas.recortarLibro(libro, ctx.sesion);
  return {
    status: 200,
    body: {
      ok: true,
      /* Se devuelven los SLUGS, nunca el sheetId. Hay un test que recorre
         el JSON entero y falla si aparece uno. */
      club: cat.clubId,
      categoria: cat.slug,
      label: cat.label,
      liga: cat.liga,
      alcance: {
        rol: ctx.rol,
        /* EL PLAN EFECTIVO, no el del token: es el que se hace valer, así
           que es el que el panel tiene que mostrar. Con el del token, un
           club bajado a Bronce seguiría luciendo el distintivo del plan
           que ya no tiene hasta que el link venciera. */
        plan: planEfectivo(cat.suscripcion || {}, ctx.sesion),
        equipoAsignado: ctx.sesion.equipoAsignado,
        /* El ciclo de informes del plan ORO, para el distintivo del
           encabezado. Van los contadores crudos: la posición depende de
           los partidos jugados, que los sabe el panel y no el catálogo. */
        cicloDesde: (cat.suscripcion || {}).cicloDesde || 0,
        informesEntregados: (cat.suscripcion || {}).informesEntregados || 0,
        /* Se declara QUÉ se recortó. Un panel que recibe menos filas sin
           saberlo calcularía percentiles sobre una liga fantasma; y el DT
           tiene derecho a saber que está viendo un recorte. */
        hojasRecortadas: rec.recortadas,
        hojasCompletas: rec.completas,
      },
      /* EL PADRÓN va con el libro RECORTADO a propósito: se arma sobre
         `libro.hojas` (completo) y no sobre `rec.hojas`, porque el punto
         es justamente que traiga a los jugadores que el recorte sacó.
         Son dos columnas y ningún número — ver `reglas.js`. */
      padron: reglas.padronLiga(libro.hojas),
      /* LAS ALERTAS, YA CALCULADAS. El detector necesita el log partido a
         partido de cada jugador, que es justo lo que el recorte no manda:
         se corre acá, sobre el libro COMPLETO, y viaja solo el resultado.
         Ninguna fila de `Base Datos J` de un rival cruza al navegador. */
      alertas: alertasDelTramo.alertas,
      tramoAlertas: { fase: alertasDelTramo.fase, torneo: alertasDelTramo.torneo },
      faltantes: libro.faltantes,
      leidoEn: libro.leidoEn,
      hojas: rec.hojas,
      /* La segunda vista, en TEXTO, para la capa vieja de Principal. Va
       * recortada con los MISMOS índices que `hojas` — ver `reglas.js`. */
      hojasTexto: rec.hojasTexto,
    },
  };
}

/**
 * GET /api/v1/scouting/:clubId
 *
 * El bloque que separa Básico de Pro. Un Básico recibe 403 ANTES de que
 * el servidor toque Google: no hay dato que filtrar después, no viajó.
 */
async function manejarScouting(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;

  const q = (peticion && peticion.query) || {};
  const params = (peticion && peticion.params) || {};
  const cascada = await catalogo.cargar(deps);
  const cat = catalogo.resolver(cascada.catalogo, params.clubId, q.categoria);
  if (!cat) return error(404, 'SIN_CATEGORIA', 'No existe esa categoría.');

  /* LA SUSCRIPCIÓN ANTES QUE EL PLAN, y en ese orden: a un club pausado no
     se le contesta "tu plan no incluye esto" —lo mandaría a mejorar un
     plan que igual no le va a abrir nada— sino que está pausado.

     Y las dos comprobaciones van DESPUÉS de resolver la categoría porque
     el estado y el plan viven en el club, que sale del catálogo. */
  const bloqueoS = guardSuscripcion(cat.suscripcion || {}, ctx);
  if (bloqueoS) return bloqueoS;

  /* El plan que se hace valer es el EFECTIVO, no el del token: si el
     cliente bajó de Pro a Básico, el link que ya tiene deja de abrir el
     scouting sin esperar a que venza. */
  const sesionEfectiva = Object.assign({}, ctx.sesion,
    { plan: planEfectivo(cat.suscripcion || {}, ctx.sesion) });
  const permiso = reglas.puedeBloque('scouting', sesionEfectiva);
  if (!permiso.ok) {
    return error(403, permiso.motivo,
      'El informe pre-partido está en el Plan Pro. Tu plan actual es '
      + AUTH.nombrePlan(sesionEfectiva.plan) + '.',
      { planRequerido: permiso.plan });
  }

  /* LA REGLA DE ORO DEL SCOUTING, del lado del servidor: solo cruces donde
     juega su equipo. El frontend ya fuerza el otro lado del selector
     (punto 19), pero eso es una comodidad de UI — acá es lo que decide si
     los datos salen. */
  if (!AUTH.puedeScoutearCruce(q.local, q.visitante, ctx.sesion)) {
    return error(403, 'CRUCE_AJENO',
      'El informe pre-partido prepara TUS cruces: uno de los dos equipos tiene que ser el tuyo.');
  }

  let libro;
  try {
    libro = await sheets.obtenerLibro(cat.sheetId, deps);
  } catch (e) {
    return fallaDeDatos(e);
  }

  /* Para armar un informe pre-partido hacen falta los datos del RIVAL: es
     el objeto del informe. Por eso acá el recorte por equipo no aplica —
     lo que autoriza es el cruce, ya validado arriba. */
  return {
    status: 200,
    body: {
      ok: true,
      club: cat.clubId,
      categoria: cat.slug,
      cruce: { local: q.local || null, visitante: q.visitante || null },
      alcance: { rol: ctx.rol, plan: ctx.sesion.plan },
      leidoEn: libro.leidoEn,
      /* El informe pre-partido necesita los datos del RIVAL —es su objeto—
         así que acá no se recortan FILAS. Las columnas ocultas sí: son
         ids de Drive que ninguna vista usa. */
      hojas: reglas.mapear(libro.hojas, reglas.sinColumnasOcultas),
      hojasTexto: reglas.mapear(libro.hojasTexto, reglas.sinColumnasOcultas),
    },
  };
}

/* Los errores de Google se traducen a algo que el DT pueda accionar. El
   detalle crudo se loguea del lado del servidor y no se propaga: puede
   traer el mail de la Service Account y el motivo exacto del rechazo. */
function fallaDeDatos(e) {
  const c = e && e.codigo;
  if (c === 'SIN_CREDENCIALES') {
    return error(500, c, 'El servidor no tiene configurada la cuenta de servicio.');
  }
  if (c === 'SIN_PERMISO_SHEET') {
    return error(502, c, 'La planilla no está compartida con la cuenta de servicio del panel.');
  }
  if (c === 'SIN_SHEET' || c === 'SIN_HOJA') {
    return error(502, c, 'La planilla de esa categoría no está disponible.');
  }
  return error(502, c || 'DATOS', 'No se pudieron leer los datos de la categoría.');
}

/**
 * POST /api/v1/catalogo · alta y baja de clientes desde el Panel Master.
 *
 * ES LA ÚNICA RUTA QUE ESCRIBE, y la única cuyo mal uso rompe a TODOS los
 * clubes a la vez: KV le gana al código, así que un catálogo deteriorado
 * acá deja los libros en 502 sin que nadie haya tocado una planilla.
 *
 * Tres capas, en este orden:
 *
 *   1. SOLO ADMIN, re-derivado contra la lista del servidor. El `rol` del
 *      token no se cree por venir firmado: `verificarToken` lo recalcula
 *      contra `ADMINS`, así que un token viejo de alguien que dejó de ser
 *      admin no sirve.
 *   2. La mutación es QUIRÚRGICA. Nunca se acepta un catálogo entero desde
 *      el navegador: entra una intención («dar de alta esta categoría») y
 *      el servidor la aplica sobre lo que HAY. Aceptar el objeto completo
 *      convertiría cualquier bug del frontend en una pérdida de datos.
 *   3. Los guards de `catalogo-mutar`, que corren SIEMPRE — el validador
 *      de la cascada y el que impide que una categoría pierda su libro.
 */
async function manejarCatalogoEscribir(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;

  if (ctx.rol !== AUTH.ROLES.ADMIN) {
    /* Se dice que hace falta ser admin, NO que los datos están
       protegidos: es un permiso de operación, y confundirlos manda al
       cliente a pedir un plan que no le va a dar acceso (punto 19). */
    return error(403, 'SOLO_ADMIN', 'El catálogo lo edita un administrador.');
  }

  const cuerpo = (peticion && peticion.body) || {};
  const accion = String(cuerpo.accion || '');

  const cascada = await catalogo.cargar(deps);
  const r = mutar.aplicar(cascada.catalogo, accion, cuerpo, catalogo.validar);
  if (!r.ok) return error(400, 'CATALOGO_INVALIDO', r.motivo);

  /* SI KV NO ESTÁ, NO SE FINGE QUE SE GUARDÓ. Sin credenciales la
     escritura es un no-op silencioso y el admin se iría convencido de que
     dio de alta un cliente — el mismo modo de fallar que el sembrado que
     no tuvo efecto porque Vercel no leía KV. */
  const kv = deps && deps.kv ? deps.kv : require('../lib/kv.js');
  if (!kv.configurado()) {
    return error(503, 'SIN_KV', 'El servidor no tiene Upstash configurado, '
      + 'así que no puede publicar el catálogo. Se puede dar de alta por CLI.');
  }

  try {
    await kv.escribir(catalogo.CLAVE_KV, r.catalogo);
  } catch (e) {
    return error(502, e.codigo || 'KV', 'No se pudo escribir el catálogo: ' + e.message);
  }
  catalogo.limpiarCache();

  /* SE DEVUELVE EL CATÁLOGO NUEVO, público. Así el hub repinta con lo que
     el servidor tiene de verdad y no con lo que el formulario creyó
     mandar: si un guard recortó algo, se ve. */
  return {
    status: 200,
    body: {
      ok: true,
      accion: accion,
      creoClub: !!r.creoClub,
      /* CON LA BANDERA DE ADMIN, igual que el GET. Sin ella la respuesta
         del guardado vuelve sin estado, plan ni vencimiento — y como el
         hub repinta la lista con LO QUE DEVOLVIO EL SERVIDOR, los
         controles de suscripcion desaparecian despues de cada accion.
         Acá siempre es admin: el handler ya rechazó a cualquier otro. */
      clubes: catalogo.publico(r.catalogo, { admin: true }),
      origen: 'kv',
      /* El caché vive por INSTANCIA y en Vercel hay muchas, así que el
         cambio puede tardar en verse en otra. Se dice, en vez de dejar al
         admin pensando que no tomó. */
      aviso: 'Guardado. Otras instancias del servidor pueden tardar hasta '
        + 'cinco minutos en verlo.',
    },
  };
}

/* =====================================================================
   INGRESO DE ADMINISTRADORES

   Reemplaza al link con token para los tres administradores. Los links
   firmados SIGUEN EXISTIENDO y son el mecanismo de los CLIENTES: un club
   no tiene por qué tener una cuenta, y pedirle que se registre para ver
   sus propios datos sería empeorarle el producto.

   Lo que cambia para el admin es que su acceso deje de depender de un
   link que circula por WhatsApp, que no se puede revocar y que caduca
   cuando menos conviene.
   ===================================================================== */

/* La sesión que devuelve el login dura MENOS que un link de cliente.

   Un link de cliente vive en el teléfono de un DT y renovarlo cuesta un
   mensaje; una sesión de admin se renueva escribiendo la clave, que es
   gratis. Doce horas cubre una jornada de trabajo entera y hace que un
   navegador prestado no sea un problema mañana. */
const SESION_ADMIN = '12h';

/* La del CLIENTE dura mas, y es a proposito: el DT abre el panel en el
   banco de suplentes y en el vestuario, muchas veces por semana, y
   hacerlo escribir la clave cada doce horas convierte la herramienta en
   un tramite. El riesgo tambien es menor — lo que ve es su propio club,
   que es lo mismo que ya veia con un link firmado que no se podia
   revocar. Siete dias es una semana de competencia. */
const SESION_CLIENTE = '7d';

/**
 * POST /api/v1/login · mail + clave → token firmado.
 *
 * EL ROL NO SALE DE ACÁ. El token se firma sin rol, y `verificarToken` lo
 * re-deriva contra `ADMINS` en cada petición, como siempre. Así que este
 * endpoint no otorga privilegios: solo confirma que quien pide el token es
 * el dueño de un mail que la lista del código YA reconoce.
 */
async function manejarLogin(peticion, deps) {
  const cuerpo = (peticion && peticion.body) || {};
  const email = String(cuerpo.email || '');
  const clave = String(cuerpo.clave || '');

  if (!email || !clave) {
    return error(400, 'FALTAN_DATOS', 'Hacen falta el mail y la clave.');
  }

  /* SI EL PADRÓN NO SE PUEDE LEER, NO SE OPINA SOBRE LA CLAVE. Contestar
     «incorrecta» sería inventar un veredicto sobre algo que no se pudo
     mirar, y además manda a la rama de fallo, que ESCRIBE — y escribir un
     padrón vacío borraba las claves de los tres. */
  let padron;
  try { padron = await admins.cargar(deps); }
  catch (e) {
    return error(503, e.codigo || 'KV',
      'No se puede verificar la clave ahora mismo. Probá de nuevo en un minuto.');
  }
  const v = await admins.verificar(padron, email, clave);

  /* SI NO ES ADMINISTRADOR, SE PRUEBA COMO CLIENTE.

     Los dos padrones están separados a propósito (ver `clientes.js`): la
     lista de admins vive en el código y la de clientes en KV, porque una
     es una propiedad de seguridad y la otra es dato que el Panel Master
     edita todos los días.

     El orden importa poco pero no es arbitrario: un mail de `ADMINS` no
     puede estar en el padrón de clientes —el alta lo rechaza— así que no
     hay ambigüedad posible. Se prueba admin primero porque son tres y
     está en memoria.

     Y LOS DOS CAMINOS TARDAN LO MISMO: el que falla como admin igual
     derivó su hash contra el señuelo, y después deriva otro contra el
     padrón de clientes. Sin eso, la diferencia de tiempo diría de qué
     lado está cada mail. */
  let comoCliente = null;
  if (!v.ok && v.motivo !== 'BLOQUEADO') {
    let padronC;
    try { padronC = await clientes.cargar(deps); }
    catch (e) {
      return error(503, e.codigo || 'KV',
        'No se puede verificar la clave ahora mismo. Probá de nuevo en un minuto.');
    }
    const c = await clientes.verificar(padronC, email, clave);
    if (c.ok) {
      comoCliente = c;
      try { await clientes.guardar(clientes.anotarExito(padronC, email), deps); }
      catch (e) { /* que no se pueda anotar el ingreso no impide entrar */ }
      return await tokenDeCliente(c, deps);
    }
    if (c.motivo === 'BLOQUEADO') {
      return error(429, 'BLOQUEADO', 'Demasiados intentos. Probá de nuevo en '
        + Math.ceil(c.esperaMs / 60000) + ' minutos.');
    }
    /* TIENE INVITACIÓN Y TODAVÍA NO FIJÓ SU CLAVE. Se distingue porque el
       mensaje genérico lo manda a pensar que le dieron mal el acceso,
       cuando lo que falta es un paso que él tiene que dar. No filtra el
       padrón: para llegar acá hay que traer el código, que es un secreto
       de 256 bits. */
    if (c.motivo === 'FALTA_CLAVE') {
      return error(409, 'FALTA_CLAVE',
        'Todavía no elegiste tu clave. Entrá con el código de invitación que te pasamos.');
    }
    try { await clientes.guardar(clientes.anotarFallo(padronC, email), deps); }
    catch (e) { /* sin KV no hay contador, pero el login igual falló */ }
  }

  if (!v.ok) {
    if (v.motivo === 'BLOQUEADO') {
      /* El bloqueo SÍ se distingue, y es el único caso: el dueño legítimo
         necesita saber por qué no entra con la clave correcta. */
      return error(429, 'BLOQUEADO', 'Demasiados intentos. Probá de nuevo en '
        + Math.ceil(v.esperaMs / 60000) + ' minutos.');
    }
    /* El fallo se anota ANTES de contestar. Si se anotara después, dos
       intentos en paralelo se pisarían y el contador nunca llegaría al
       tope. */
    try { await admins.guardar(admins.anotarFallo(padron, email), deps); }
    catch (e) { /* sin KV no hay contador, pero el login igual falló */ }
    /* MISMO MENSAJE PARA TODO: mail que no existe, clave incorrecta o
       admin que todavía no fijó su clave. Distinguirlos diría cuáles de
       los mails son administradores. */
    return error(401, 'CREDENCIALES', 'Mail o clave incorrectos.');
  }

  try { await admins.guardar(admins.anotarExito(padron, email), deps); }
  catch (e) { /* que no se pueda anotar el ingreso no impide entrar */ }

  const token = AUTHS.firmarToken({ email: v.email, plan: 'ORO' },
    { expiraEn: SESION_ADMIN });
  const datos = AUTHS.verificarToken(token);

  return {
    status: 200,
    body: {
      ok: true,
      token: token,
      /* Se devuelve el rol RE-DERIVADO, no el que pidió nadie: si el mail
         dejó de estar en la lista, el token sale como cliente y la
         pantalla lo va a mostrar así. */
      rol: datos.rol,
      email: v.email,
      expiraEn: datos.expiraEn,
    },
  };
}

/* =====================================================================
   LOS MAILS DE CADA CLUB · gestión desde el Panel Master

   SOLO ADMIN, y re-derivado contra la lista del servidor: el `rol` del
   token no se cree por venir firmado.

   NUNCA SALE UN HASH NI UN CÓDIGO GUARDADO. El código de invitación se
   devuelve UNA vez, en la respuesta del alta, y después no hay forma de
   recuperarlo — si se pudiera leer, KV pasaría a ser suficiente para
   entrar como cualquier cliente. Es el mismo criterio que los admins.
   ===================================================================== */

/** GET /api/v1/clientes?club=… · quiénes pueden entrar, y cuánto cupo queda. */
async function manejarClientes(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;
  if (ctx.rol !== AUTH.ROLES.ADMIN) {
    return error(403, 'SOLO_ADMIN', 'Los accesos de un club los administra un administrador.');
  }

  let padron;
  try { padron = await clientes.cargar(deps); }
  catch (e) { return error(503, e.codigo || 'KV', 'No se pudo leer el padrón de clientes.'); }

  const cat = await catalogo.cargar(deps);
  /* EL CATÁLOGO ES UN MAPA POR ID, no una lista: `publico()` es la que lo
     aplana, y es la misma vista que ya consume el Panel Master. Se pide
     con `admin: true` porque acá hace falta el PLAN — es lo que decide el
     cupo — y este handler ya tiene su gate de rol arriba. */
  const todos = catalogo.publico(cat.catalogo, { admin: true });
  const pedido = String((peticion && peticion.query && peticion.query.club) || '').trim().toLowerCase();
  const clubes = todos.filter(c => !pedido || c.id === pedido);

  return {
    status: 200,
    body: {
      ok: true,
      clubes: clubes.map(c => ({
        id: c.id, nombre: c.nombre, plan: AUTH.normalizarPlan(c.plan),
        cupo: clientes.cupo(padron, c.id, c.plan),
        mails: clientes.delClub(padron, c.id),
      })),
    },
  };
}

/**
 * POST /api/v1/clientes · alta, baja y reinvitación.
 *
 * La mutación es QUIRÚRGICA, igual que la del catálogo: entra una
 * intención («dar de alta este mail en este club») y el servidor la
 * aplica sobre lo que hay. Aceptar el padrón entero desde el navegador
 * convertiría cualquier bug del frontend en una pérdida de accesos.
 */
async function manejarClientesEscribir(peticion, deps) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;
  if (ctx.rol !== AUTH.ROLES.ADMIN) {
    return error(403, 'SOLO_ADMIN', 'Los accesos de un club los administra un administrador.');
  }

  const cuerpo = (peticion && peticion.body) || {};
  const accion = String(cuerpo.accion || '').trim().toLowerCase();
  const email = String(cuerpo.email || '');
  const clubId = String(cuerpo.club || '').trim().toLowerCase();

  const kvm = deps && deps.kv ? deps.kv : require('../lib/kv.js');
  if (!kvm.configurado()) {
    /* Sin KV no se puede guardar, y decir que sí dejaría al admin
       creyendo que dio de alta a alguien. Mismo criterio que el catálogo. */
    return error(503, 'SIN_KV', 'El servidor no puede guardar los accesos ahora mismo.');
  }

  let padron;
  try { padron = await clientes.cargar(deps); }
  catch (e) { return error(503, e.codigo || 'KV', 'No se pudo leer el padrón de clientes.'); }

  let r = null, extra = {};

  if (accion === 'alta') {
    /* EL PLAN SALE DEL CATÁLOGO, no del cuerpo del pedido: si lo mandara
       el navegador, el cupo lo decidiría quien lo quiere saltear. */
    const cat = await catalogo.cargar(deps);
    const club = (cat.catalogo || {})[clubId];
    if (!club) return error(404, 'CLUB', 'Ese club no está en el catálogo.');
    r = clientes.alta(padron, email, clubId, {
      plan: club.plan,
      equipoAsignado: cuerpo.equipoAsignado ? String(cuerpo.equipoAsignado) : null,
      dias: cuerpo.dias,
    });
    if (r.ok) extra = { codigo: r.codigo, venceEn: r.venceEn, cupo: r.cupo };
  } else if (accion === 'baja') {
    r = clientes.baja(padron, email);
  } else if (accion === 'reinvitar') {
    r = clientes.reinvitar(padron, email, cuerpo.dias);
    if (r.ok) extra = { codigo: r.codigo, venceEn: r.venceEn };
  } else {
    return error(400, 'ACCION', 'Acción desconocida: ' + (accion || '(vacía)') + '.');
  }

  if (!r.ok) return error(400, 'CLIENTES', r.motivo);

  try { await clientes.guardar(r.padron, deps); }
  catch (e) { return error(502, e.codigo || 'KV', 'No se pudieron guardar los accesos.'); }

  /* Se devuelve el estado NUEVO del club, para que la pantalla no tenga
     que volver a pedirlo y no pueda quedar mostrando el anterior — el
     mismo motivo por el que el POST del catálogo devuelve el catálogo. */
  const cat2 = await catalogo.cargar(deps);
  const id2 = clubId || r.club || '';
  const club2 = (cat2.catalogo || {})[id2];
  return {
    status: 200,
    body: Object.assign({
      ok: true,
      club: id2 || null,
      mails: club2 ? clientes.delClub(r.padron, id2) : [],
      cupoActual: club2 ? clientes.cupo(r.padron, id2, club2.plan) : null,
    }, extra),
  };
}

/**
 * El token de un CLIENTE que acaba de autenticarse.
 *
 * EL PLAN Y EL EQUIPO SALEN DEL CATÁLOGO, no del padrón ni de lo que pida
 * nadie: el plan es la condición comercial vigente y el equipo propio es
 * del club. Guardarlos en el registro del mail los congelaría el día del
 * alta, y un upgrade de plan no le llegaría a quien ya estaba dado de
 * alta — que es justo el caso que más importa que ande.
 *
 * Un club que no está en el catálogo NO recibe token: el mail quedó
 * apuntando a un club que se dio de baja, y darle una sesión que después
 * no puede cargar nada es peor que decírselo acá.
 */
async function tokenDeCliente(c, deps) {
  let cat;
  try { cat = await catalogo.cargar(deps); }
  catch (e) { cat = null; }
  const club = cat && (cat.catalogo || {})[c.club];
  if (!club) {
    return error(403, 'CLUB_INEXISTENTE',
      'Tu acceso apunta a un club que ya no está disponible. Escribinos.');
  }

  /* EL GUARD DE SUSCRIPCIÓN TAMBIÉN ACÁ, y no solo al pedir datos: dejarlo
     entrar para que después cada pantalla le diga que no, es peor que
     decírselo en la puerta. */
  const veto = guardSuscripcion(club, { rol: AUTH.ROLES.CLIENTE });
  if (veto) return veto;

  const token = AUTHS.firmarToken({
    email: c.email,
    club: c.club,
    equipoAsignado: c.equipoAsignado || club.equipoPropio || null,
    plan: AUTH.normalizarPlan(club.plan),
  }, { expiraEn: SESION_CLIENTE });
  const datos = AUTHS.verificarToken(token);

  return {
    status: 200,
    body: {
      ok: true,
      token: token,
      rol: datos.rol,
      email: c.email,
      /* EL CLUB VIAJA EN LA RESPUESTA para que la pantalla sepa a dónde
         mandarlo sin tener que abrir el token. */
      club: c.club,
      plan: AUTH.normalizarPlan(club.plan),
      expiraEn: datos.expiraEn,
    },
  };
}

/**
 * POST /api/v1/clave · fijar la primera clave, o cambiar la que hay.
 *
 * Con `codigo` es un alta (primera vez); con `claveActual` es un cambio.
 * NUNCA se inventa una clave provisoria: el administrador elige la suya y
 * el código de invitación muere al usarse. Así la clave no existe en texto
 * plano en ningún momento — ni en el código, ni en un chat, ni en la
 * cabeza de quien la generó.
 */
async function manejarClave(peticion, deps) {
  const cuerpo = (peticion && peticion.body) || {};
  const email = String(cuerpo.email || '');
  const nueva = String(cuerpo.claveNueva || '');

  if (!email || !nueva) return error(400, 'FALTAN_DATOS', 'Hacen falta el mail y la clave nueva.');

  /* Igual que en el login: sin padrón legible no se puede saber si hay
     invitación pendiente, y decir que no la hay mandaría a pedir otra por
     un problema que no es ese. */
  let padron;
  try { padron = await admins.cargar(deps); }
  catch (e) {
    return error(503, e.codigo || 'KV',
      'No se puede guardar la clave ahora mismo. Probá de nuevo en un minuto.');
  }
  /* SI NO ES ADMINISTRADOR, SE INTENTA COMO CLIENTE. El flujo es el mismo
     —código de invitación de un solo uso, o clave actual— y por eso vale
     la pena que la pantalla sea una sola: el cliente no tiene por qué
     saber en qué padrón está. */
  const esAdm = AUTH.esAdmin(email);
  const mod = esAdm ? admins : clientes;

  let padronC = padron;
  if (!esAdm) {
    try { padronC = await clientes.cargar(deps); }
    catch (e) {
      return error(503, e.codigo || 'KV',
        'No se puede guardar la clave ahora mismo. Probá de nuevo en un minuto.');
    }
  }

  const r = cuerpo.codigo
    ? await mod.fijarClave(padronC, email, String(cuerpo.codigo), nueva)
    : await mod.cambiarClave(padronC, email, String(cuerpo.claveActual || ''), nueva);

  if (!r.ok) return error(400, 'CLAVE', r.motivo);

  const kvm = deps && deps.kv ? deps.kv : require('../lib/kv.js');
  if (!kvm.configurado()) {
    /* Sin KV no se puede guardar, y decir que sí dejaría al admin
       creyendo que ya tiene clave. Es el mismo criterio del catálogo. */
    return error(503, 'SIN_KV', 'El servidor no puede guardar la clave ahora mismo.');
  }
  try { await mod.guardar(r.padron, deps); }
  catch (e) { return error(502, e.codigo || 'KV', 'No se pudo guardar la clave.'); }

  return { status: 200, body: { ok: true, mensaje: 'Clave guardada. Ya podés ingresar.' } };
}

module.exports = { manejarCatalogo, manejarCatalogoEscribir, manejarEquipos,
  manejarClientes, manejarClientesEscribir,
  manejarScouting, manejarLogin, manejarClave, guardSuscripcion, planEfectivo, ERRORES };
