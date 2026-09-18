/* =====================================================================
   EL ACCESO QUE ACOMPAÑA A LA BIENVENIDA

   Antes eran dos pasos que el admin tenía que coser a mano: dar de alta
   el mail en «Quiénes pueden entrar» (que devolvía un código para copiar
   y pasar por otro canal) y mandar la bienvenida desde la ficha. Ahora la
   bienvenida LLEVA el acceso: el servidor se asegura de que el mail pueda
   entrar y, si le hace falta, genera el código y lo mete en el mail.

   `asegurar()` decide, sobre el padrón de hoy, qué le corresponde a ESE
   mail en ESE club:

     no está          → ALTA con invitación (usa un cupo del plan)
     invitado, sin    → REINVITAR: el código viejo no se puede volver a
       clave             leer (el servidor guarda su huella), así que el
                         mail necesita uno nuevo
     ya tiene clave   → nada: entra con su clave. Un código que nadie
                         pidió es ruido, y no se le toca lo que ya anda
     otro club / admin→ nada, con el motivo: la bienvenida sale igual,
                         sin código, y la pantalla dice por qué

   LAS REGLAS DEL PADRÓN NO SE REPITEN ACÁ: el cupo, un mail por club y
   el admin que no se da de alta las decide `clientes.alta()`, el mismo
   camino que usa «Quiénes pueden entrar». Dos caminos de alta terminarían
   con uno que se saltea el cupo.
   ===================================================================== */
'use strict';

const clientes = require('./clientes.js');
const AUTH = require('./compartido/sgadd-auth.js');

function normalizar(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * @returns {Promise<{estado, email, codigo?, venceEn?, motivo?}>}
 *   estado: 'alta' | 'reinvitado' | 'con-clave' | 'sin-acceso'
 *   Con 'sin-acceso' la bienvenida sale sin código y `motivo` dice por qué.
 *   LANZA solo si el padrón no se puede leer o escribir: ahí no se sabe
 *   quién puede entrar, y mandar el mail igual sería prometer un acceso
 *   que puede no existir.
 */
async function asegurar(clubId, email, catalogoObj, deps, nombre) {
  const e = normalizar(email);
  const club = String(clubId || '').trim().toLowerCase();
  if (!e) return { estado: 'sin-acceso', email: e, motivo: 'La ficha no tiene mail.' };
  if (AUTH.esAdmin(e)) {
    return { estado: 'sin-acceso', email: e, motivo: 'Ese mail es de un administrador: entra por su propio acceso.' };
  }

  const padron = await clientes.cargar(deps);
  const reg = padron[e];

  if (reg && String(reg.club || '').toLowerCase() !== club) {
    return { estado: 'sin-acceso', email: e, motivo: 'Ese mail ya tiene acceso en ' + reg.club + '. Un mail pertenece a un solo club.' };
  }
  if (reg && reg.clave) return { estado: 'con-clave', email: e };

  let r;
  if (reg) {
    r = clientes.reinvitar(padron, e, deps && deps.dias, nombre);
  } else {
    const c = (catalogoObj || {})[club];
    if (!c) return { estado: 'sin-acceso', email: e, motivo: 'Ese club no está en el catálogo.' };
    r = clientes.alta(padron, e, club, { plan: AUTH.planDelClub(c), dias: deps && deps.dias, nombre: nombre });
  }
  if (!r.ok) return { estado: 'sin-acceso', email: e, motivo: r.motivo };

  await clientes.guardar(r.padron, deps);
  return { estado: reg ? 'reinvitado' : 'alta', email: e, codigo: r.codigo, venceEn: r.venceEn };
}

/** Lo que la plantilla necesita de un resultado de `asegurar()`. */
function paraElMail(acceso) {
  if (!acceso) return null;
  if (acceso.codigo) return { email: acceso.email, codigo: acceso.codigo, venceEn: acceso.venceEn };
  if (acceso.estado === 'con-clave') return { email: acceso.email, conClave: true };
  return null;
}

/**
 * La categoría de la que habla la bienvenida de un acceso de CLUB.
 *
 * Un mail entra al club entero, pero la bienvenida nombra una categoría
 * (su plan, su vencimiento). Gana la pedida si existe; si no, la primera
 * que tiene acceso —no se le da la bienvenida a una pausada—; si ninguna,
 * la primera a secas.
 */
function categoriaDeBienvenida(club, pedida) {
  const cats = Object.keys((club && club.categorias) || {});
  const p = String(pedida || '').trim().toLowerCase();
  if (p && cats.indexOf(p) !== -1) return p;
  const conAcceso = cats.find(s => {
    try { return AUTH.suscripcionDeCategoria(club, s).acceso; } catch (e) { return false; }
  });
  return conAcceso || cats[0] || null;
}

module.exports = { asegurar, paraElMail, categoriaDeBienvenida };
