/* =====================================================================
   POST /api/v1/catalogo/equipos · qué equipos trae un libro

   El paso del alta que antes pedía una terminal. El Panel Master manda
   QUÉ libro leer y recibe la lista de equipos tal como los escribe la
   planilla, así el equipo propio se ELIGE de una lista en vez de tipearse.

   De paso es la prueba de acceso que hacía `probar-google.js`: si la
   cuenta de servicio no puede leer el libro, se dice ACÁ, al dar de alta,
   y no media hora después con un 502 en el panel del cliente.

   VA EN SU PROPIO ARCHIVO y no en `handlers.js` para que la ruta que
   solo LEE un libro no comparta archivo con la única que escribe el
   catálogo: se ve de un vistazo cuál puede romper a todos los clubes.

   ---------------------------------------------------------------------
   EL `sheetId` NO VUELVE AL NAVEGADOR

   Con `libroDe: "<club>/<categoria>"` el servidor busca el libro en su
   catálogo y el id nunca sale de acá — la misma regla que el catálogo
   público (punto 29). Con `sheetId` es un libro NUEVO que el admin acaba
   de pegar, o sea uno que ya tiene en la mano.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const sheets = require('../lib/google-sheets.js');
const libro = require('../lib/catalogo-libro.js');
const { entorno } = require('../lib/config.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

/* La misma forma de id que exige `catalogo-mutar`: acá también se rechaza
   la URL entera, porque el formulario ya extrae el id antes de mandarlo. */
const SHEET = /^[A-Za-z0-9_-]{20,}$/;

function error(status, codigo, mensaje, extra) {
  return { status: status, body: Object.assign({ ok: false, codigo: codigo, mensaje: mensaje }, extra || {}) };
}

async function manejarEquiposDelLibro(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');
  /* Se dice que hace falta ser admin, NO que los datos están protegidos:
     es un permiso de operación (punto 19). */
  if (v.rol !== AUTH.ROLES.ADMIN) {
    return error(403, 'SOLO_ADMIN', 'Leer un libro para dar de alta es tarea de un administrador.');
  }

  const b = (peticion && peticion.body) || {};
  let sheetId = '';
  if (b.libroDe) {
    const partes = String(b.libroDe).split('/');
    const cascada = await catalogo.cargar(deps);
    const c = cascada.catalogo[partes[0]];
    const k = c && c.categorias && c.categorias[partes[1]];
    if (!k || !k.sheetId) {
      return error(404, 'SIN_LIBRO', 'Esa categoría no tiene un libro cargado para leer.');
    }
    sheetId = String(k.sheetId);
  } else if (SHEET.test(String(b.sheetId || ''))) {
    sheetId = String(b.sheetId);
  } else {
    return error(400, 'SIN_LIBRO', 'Elegí un libro ya cargado o pegá el link de uno nuevo.');
  }

  const env = (deps && deps.entorno) || entorno();
  const cuenta = env.googleEmail || null;

  let datos;
  try {
    datos = await sheets.obtenerLibro(sheetId, deps);
  } catch (e) {
    /* LOS DOS MODOS DE FALLAR SE ARREGLAN AL REVÉS (punto 18 bis): uno se
       comparte, el otro se corrige. Por eso cada uno dice su remedio. */
    if (e.codigo === 'SIN_PERMISO_SHEET') {
      return error(400, 'SIN_PERMISO_SHEET',
        'El libro existe pero el sistema no lo puede leer. Compartilo como Lector con '
        + (cuenta || 'la cuenta de servicio') + ' y volvé a tocar «Leer equipos».',
        { cuentaServicio: cuenta });
    }
    if (e.codigo === 'GOOGLE_404' || e.codigo === 'GOOGLE_400') {
      return error(404, 'LIBRO_INEXISTENTE', 'Ese libro no existe: revisá el link o el id que pegaste.');
    }
    return error(502, e.codigo || 'GOOGLE', 'No se pudo leer el libro: ' + (e.message || 'error de Google') + '.');
  }

  const equipos = libro.equiposDelLibro(datos && datos.hojas);
  if (!equipos.length) {
    return error(422, 'LIBRO_SIN_EQUIPOS',
      'El libro se leyó, pero no trae equipos en PROMEDIOS E ni en Base Datos E. ¿Es un libro de MotorStats?');
  }
  return {
    status: 200,
    body: { ok: true, equipos: equipos, cuentaServicio: cuenta, faltantes: (datos && datos.faltantes) || [] },
  };
}

module.exports = { manejarEquiposDelLibro };
