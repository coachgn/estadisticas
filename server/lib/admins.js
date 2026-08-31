/* =====================================================================
   SGADD · El padrón de administradores en KV

   Guarda, por mail: el hash de su clave, su invitación pendiente si
   todavía no la fijó, y el contador de intentos fallidos.

   LA LISTA DE QUIÉN ES ADMIN NO ESTÁ ACÁ. Vive en `ADMINS`, en el código,
   y `esAdmin()` la re-deriva en cada petición. Esta es la diferencia que
   hace que un KV comprometido no alcance para escalar privilegios: se
   podría cambiar la clave de un administrador que YA existe —y el dueño lo
   nota enseguida, porque deja de poder entrar— pero no inventar uno nuevo.

   Por eso `cargar()` no devuelve "los administradores": devuelve las
   credenciales de los mails que la lista del código ya reconoce.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');
const claves = require('./claves.js');
const AUTH = require('./compartido/sgadd-auth.js');

const CLAVE_KV = 'sgadd:admins';

/* Después de este número de intentos fallidos seguidos, la cuenta se
   bloquea por un rato.

   VA POR MAIL Y NO POR IP: en Vercel la IP del cliente llega por
   cabecera, se puede falsificar y además hay muchas instancias, así que un
   contador por IP no cuenta lo que uno cree. Por mail el contador es
   exacto y el ataque que importa —probar claves contra una cuenta
   concreta— es justamente el que queda frenado. El costo es que alguien
   puede dejar a un admin afuera un rato; con tres mails y una espera de
   quince minutos, es un costo aceptable. */
const INTENTOS_MAX = 8;
const BLOQUEO_MS = 15 * 60 * 1000;

function normalizar(email) { return AUTH.normalizarEmail(email); }

/**
 * Lee el padrón. LANZA si KV no se pudo leer.

 * ANTES DEVOLVÍA UN PADRÓN VACÍO Y ESO BORRABA LAS CLAVES DE LOS TRES.
 * `kv.leer` se traga el error y devuelve `{valor: null}`, o sea que un
 * fallo de red era indistinguible de «todavía no hay nadie». La cadena
 * completa:
 *
 *   lectura falla  →  padrón {}  →  «mail o clave incorrectos»
 *                  →  anotarFallo({})  →  se ESCRIBE {mail:{fallos:1}}
 *
 * y ahí se fueron los hashes de los tres administradores, sin ningún
 * síntoma. El modo de fallar era perfecto: el que acababa de fijar su
 * clave entraba bien esa vez —la escritura y la lectura siguiente son
 * consecutivas— y no podía volver a entrar después.
 *
 * Con esto, un KV ilegible da 503 y NO se escribe nada: es la misma regla
 * que el resto del proyecto — un dato ausente se muestra ausente, no se
 * reemplaza por uno inventado.
 */
async function cargar(opciones) {
  const r = await kv.leer(CLAVE_KV, opciones);
  if (r && r.error) {
    throw Object.assign(new Error('No se pudo leer el padrón de administradores.'),
      { codigo: r.error === 'JSON inválido en ' + CLAVE_KV ? 'KV_CORRUPTO' : 'KV' });
  }
  const v = r && r.valor;
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

async function guardar(padron, opciones) {
  await kv.escribir(CLAVE_KV, padron || {}, opciones);
}

/** El registro de un mail, o `null`. Solo si la lista del código lo reconoce. */
function registro(padron, email) {
  const e = normalizar(email);
  if (!AUTH.esAdmin(e)) return null;
  return (padron || {})[e] || null;
}

/** ¿Está bloqueado por intentos fallidos? */
function bloqueado(reg, ahora) {
  if (!reg || !reg.bloqueadoHasta) return false;
  return (ahora === undefined ? Date.now() : ahora) < reg.bloqueadoHasta;
}

/**
 * Verifica mail + clave.
 *
 * EL MISMO RESULTADO PARA "NO EXISTE" Y "CLAVE INCORRECTA". Distinguirlos
 * le diría a cualquiera cuáles de los tres mails son administradores, que
 * es justo la mitad del trabajo de quien quiere entrar. El único caso que
 * se separa es el bloqueo, porque el dueño legítimo necesita saber por qué
 * no entra.
 */
async function verificar(padron, email, clave, ahora) {
  const reg = registro(padron, email);
  const t = (ahora === undefined ? Date.now() : ahora);

  if (bloqueado(reg, t)) {
    return { ok: false, motivo: 'BLOQUEADO', esperaMs: reg.bloqueadoHasta - t };
  }
  if (!reg || !reg.clave) {
    /* SE VERIFICA IGUAL CONTRA UN HASH DE MENTIRA. Sin esto, un mail que
       no existe contesta en un milisegundo y uno que sí existe tarda cien:
       la diferencia se mide desde afuera y delata el padrón entero. */
    await claves.verificar(String(clave || ''), SEÑUELO);
    return { ok: false, motivo: 'CREDENCIALES' };
  }
  const bien = await claves.verificar(clave, reg.clave);
  if (!bien) return { ok: false, motivo: 'CREDENCIALES' };
  return { ok: true, email: normalizar(email) };
}

/* Un registro válido con una clave que nadie conoce, solo para gastar el
   mismo tiempo cuando el mail no está en el padrón. Se deriva una vez al
   cargar el módulo. */
const SEÑUELO = {
  alg: 'scrypt', N: claves.PARAMS.N, r: claves.PARAMS.r, p: claves.PARAMS.p,
  largo: claves.PARAMS.largo,
  salt: 'c2VudWVsbw==',
  hash: Buffer.alloc(claves.PARAMS.largo).toString('base64'),
};

/** Suma un intento fallido y bloquea si corresponde. Devuelve el padrón nuevo. */
function anotarFallo(padron, email, ahora) {
  const e = normalizar(email);
  if (!AUTH.esAdmin(e)) return padron;      // no se lleva cuenta de los que no son
  const p = Object.assign({}, padron);
  const reg = Object.assign({}, p[e] || {});
  const t = (ahora === undefined ? Date.now() : ahora);
  reg.fallos = (Number(reg.fallos) || 0) + 1;
  if (reg.fallos >= INTENTOS_MAX) {
    reg.bloqueadoHasta = t + BLOQUEO_MS;
    reg.fallos = 0;
  }
  p[e] = reg;
  return p;
}

/** Limpia el contador tras un ingreso correcto. */
function anotarExito(padron, email, ahora) {
  const e = normalizar(email);
  const p = Object.assign({}, padron);
  const reg = Object.assign({}, p[e] || {});
  delete reg.fallos;
  delete reg.bloqueadoHasta;
  reg.ultimoIngreso = new Date(ahora === undefined ? Date.now() : ahora).toISOString();
  p[e] = reg;
  return p;
}

/**
 * Deja una invitación pendiente para que un mail fije su PRIMERA clave.
 *
 * El código se guarda hasheado y se devuelve en claro UNA vez: quien lo
 * genera lo tiene que pasar por un canal privado, y no queda forma de
 * recuperarlo después. Es a propósito — si se pudiera leer de KV, KV
 * pasaría a ser suficiente para entrar.
 */
function invitar(padron, email, dias) {
  const e = normalizar(email);
  if (!AUTH.esAdmin(e)) {
    return { ok: false, motivo: 'Ese mail no está en la lista de administradores del código.' };
  }
  const inv = claves.generarInvitacion(dias);
  const p = Object.assign({}, padron);
  p[e] = Object.assign({}, p[e], {
    invitacion: { hash: claves.hashearCodigo(inv.codigo), venceEn: inv.venceEn },
  });
  return { ok: true, padron: p, codigo: inv.codigo, venceEn: inv.venceEn };
}

/**
 * Fija la clave usando un código de invitación.
 *
 * LA INVITACIÓN SE CONSUME SIEMPRE QUE SE USE BIEN, y se borra también al
 * cambiar la clave: dejarla viva sería una segunda llave permanente para
 * una puerta que ya tiene dueño.
 */
async function fijarClave(padron, email, codigo, claveNueva, ahora) {
  const e = normalizar(email);
  const reg = registro(padron, e);
  const t = (ahora === undefined ? Date.now() : ahora);

  if (!reg || !reg.invitacion) {
    return { ok: false, motivo: 'No hay una invitación pendiente para ese mail.' };
  }
  if (t > reg.invitacion.venceEn) {
    return { ok: false, motivo: 'Esa invitación venció. Pedí una nueva.' };
  }
  if (!claves.codigoCoincide(codigo, reg.invitacion.hash)) {
    return { ok: false, motivo: 'El código de invitación no es válido.' };
  }
  const mal = claves.revisar(claveNueva);
  if (mal) return { ok: false, motivo: mal };

  const hash = await claves.hashear(claveNueva);
  const p = Object.assign({}, padron);
  const nuevo = Object.assign({}, reg, { clave: hash, fijadaEl: new Date(t).toISOString() });
  delete nuevo.invitacion;
  delete nuevo.fallos;
  delete nuevo.bloqueadoHasta;
  p[e] = nuevo;
  return { ok: true, padron: p };
}

/** Cambio de clave con la clave actual. No usa invitación. */
async function cambiarClave(padron, email, claveActual, claveNueva, ahora) {
  const v = await verificar(padron, email, claveActual, ahora);
  if (!v.ok) return { ok: false, motivo: 'La clave actual no es correcta.' };
  const mal = claves.revisar(claveNueva);
  if (mal) return { ok: false, motivo: mal };
  const hash = await claves.hashear(claveNueva);
  const e = normalizar(email);
  const p = Object.assign({}, padron);
  p[e] = Object.assign({}, p[e], {
    clave: hash, fijadaEl: new Date(ahora === undefined ? Date.now() : ahora).toISOString(),
  });
  delete p[e].invitacion;
  return { ok: true, padron: p };
}

/** Para la CLI: quién tiene clave, quién invitación pendiente, quién nada. */
function estado(padron) {
  return AUTH.ADMINS.map((e) => {
    const r = (padron || {})[e] || {};
    return {
      email: e,
      tieneClave: !!r.clave,
      invitacionPendiente: !!r.invitacion,
      invitacionVence: r.invitacion ? new Date(r.invitacion.venceEn).toISOString() : null,
      bloqueado: bloqueado(r),
      ultimoIngreso: r.ultimoIngreso || null,
    };
  });
}

module.exports = {
  CLAVE_KV, cargar, guardar, registro, verificar, invitar, fijarClave,
  cambiarClave, anotarFallo, anotarExito, bloqueado, estado,
  INTENTOS_MAX, BLOQUEO_MS,
};
