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

const { resolverCategoria, catalogoPublico } = require('../lib/config.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const reglas = require('../lib/reglas.js');
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
async function manejarCatalogo(peticion) {
  const ctx = contexto(peticion);
  if (ctx.error) return ctx.error;
  return {
    status: 200,
    body: {
      ok: true,
      usuario: { email: ctx.sesion.email, rol: ctx.rol, plan: ctx.sesion.plan,
        equipoAsignado: ctx.sesion.equipoAsignado, expiraEn: ctx.expiraEn },
      clubes: catalogoPublico(),
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
  const cat = resolverCategoria(params.clubId, q.categoria);
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
  const cat = resolverCategoria(params.clubId, q.categoria);
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

module.exports = { manejarCatalogo, manejarEquipos, manejarScouting, ERRORES };
