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
      clubes: catalogo.publico(cat.catalogo),
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
        plan: ctx.sesion.plan,
        equipoAsignado: ctx.sesion.equipoAsignado,
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

  const permiso = reglas.puedeBloque('scouting', ctx.sesion);
  if (!permiso.ok) {
    return error(403, permiso.motivo,
      'El informe pre-partido está en el Plan Pro. Tu plan actual es '
      + (ctx.sesion.plan === AUTH.PLANES.PRO ? 'Pro' : 'Básico') + '.',
      { planRequerido: permiso.plan });
  }

  const q = (peticion && peticion.query) || {};
  const params = (peticion && peticion.params) || {};
  const cascada = await catalogo.cargar(deps);
  const cat = catalogo.resolver(cascada.catalogo, params.clubId, q.categoria);
  if (!cat) return error(404, 'SIN_CATEGORIA', 'No existe esa categoría.');

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
      clubes: catalogo.publico(r.catalogo),
      origen: 'kv',
      /* El caché vive por INSTANCIA y en Vercel hay muchas, así que el
         cambio puede tardar en verse en otra. Se dice, en vez de dejar al
         admin pensando que no tomó. */
      aviso: 'Guardado. Otras instancias del servidor pueden tardar hasta '
        + 'cinco minutos en verlo.',
    },
  };
}

module.exports = { manejarCatalogo, manejarCatalogoEscribir, manejarEquipos, manejarScouting, ERRORES };
