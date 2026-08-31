/* =====================================================================
   SGADD · Claves de administrador · hash y verificación

   POR QUÉ `scrypt` Y NO bcrypt NI argon2. Los dos son mejores en abstracto,
   y los dos son una dependencia npm nueva —con binarios nativos, encima—
   en un proyecto cuya regla es no sumar ninguna. `scrypt` viene en
   `node:crypto`, es memory-hard (que es lo que importa contra una GPU) y
   está en el RFC 7914. Con los parámetros de abajo tarda ~100 ms por
   intento, que es imperceptible para quien entra y carísimo para quien
   prueba un diccionario.

   LO QUE ESTO **NO** HACE, y conviene tenerlo claro: no convierte al panel
   en un sistema seguro. El panel sigue siendo estático y el gate de
   interfaz sigue sin ser seguridad (punto 19). Lo que esto agrega es que
   entrar como administrador deje de depender de un link que circula por
   WhatsApp y no se puede revocar.

   Y ALGO QUE SÍ ES UNA PROPIEDAD FUERTE: la lista de administradores NO
   vive acá. `esAdmin()` la re-deriva contra `ADMINS`, que está en el
   código. Así que aunque alguien escriba en KV, no puede crearse un
   administrador: podría a lo sumo cambiarle la clave a uno que ya existe,
   y eso se nota porque el dueño deja de poder entrar.
   ===================================================================== */
'use strict';

const crypto = require('crypto');

/* N=16384 (2^14) · r=8 · p=1 → ~16 MB y ~100 ms por verificación.
   Es el punto donde entrar sigue siendo instantáneo para una persona y
   probar un diccionario deja de ser gratis. Se guardan CON el hash para
   poder subirlos mañana sin invalidar las claves de hoy. */
const PARAMS = { N: 16384, r: 8, p: 1, largo: 64 };

/* Un `maxmem` explícito: el default de Node es 32 MB y con N más alto
   `scrypt` falla con un error que no menciona la memoria. */
const MAXMEM = 64 * 1024 * 1024;

const SALT_BYTES = 16;

/**
 * Requisitos de una clave.
 *
 * SOLO LARGO MÍNIMO, y a propósito. Las reglas de "una mayúscula y un
 * símbolo" empujan a `Password1!` —que es de las primeras que prueba
 * cualquier diccionario— mientras que el largo es lo único que sube el
 * costo de verdad. Es la recomendación del NIST desde 2017.
 */
const LARGO_MINIMO = 12;

function revisar(clave) {
  const c = String(clave == null ? '' : clave);
  if (c.length < LARGO_MINIMO) {
    return 'La clave necesita al menos ' + LARGO_MINIMO + ' caracteres. '
      + 'Una frase de tres o cuatro palabras es más fácil de recordar y más difícil de romper que ocho caracteres raros.';
  }
  /* El tope existe por el costo: `scrypt` procesa lo que le den, así que
     sin límite una clave de un megabyte es una forma de ocupar el
     servidor. No es una regla de seguridad, es una de recursos. */
  if (c.length > 256) return 'La clave no puede pasar de 256 caracteres.';
  return null;
}

/** Deriva el hash. Devuelve el registro entero, listo para guardar. */
function hashear(clave, opciones) {
  return new Promise((resolve, reject) => {
    const o = opciones || {};
    const salt = o.salt || crypto.randomBytes(SALT_BYTES).toString('base64');
    const p = Object.assign({}, PARAMS, o.params || {});
    crypto.scrypt(String(clave), salt, p.largo,
      { N: p.N, r: p.r, p: p.p, maxmem: MAXMEM }, (err, buf) => {
        if (err) return reject(err);
        resolve({
          alg: 'scrypt',
          salt: salt,
          /* Los parámetros viajan CON el hash: sin esto, subirlos mañana
             invalidaría todas las claves guardadas hoy, porque no habría
             forma de saber con cuáles se derivó cada una. */
          N: p.N, r: p.r, p: p.p, largo: p.largo,
          hash: buf.toString('base64'),
        });
      });
  });
}

/**
 * Verifica. NUNCA lanza por una clave incorrecta: devuelve `false`.
 *
 * La comparación va con `timingSafeEqual`. Con `===`, el tiempo que tarda
 * en fallar depende de cuántos bytes coincidieron, y eso alcanza para
 * reconstruir el hash byte a byte a fuerza de intentos.
 */
function verificar(clave, registro) {
  return new Promise((resolve) => {
    const r = registro || {};
    if (r.alg !== 'scrypt' || !r.salt || !r.hash) return resolve(false);
    const esperado = Buffer.from(String(r.hash), 'base64');
    crypto.scrypt(String(clave == null ? '' : clave), r.salt,
      esperado.length, { N: r.N || PARAMS.N, r: r.r || PARAMS.r, p: r.p || PARAMS.p, maxmem: MAXMEM },
      (err, buf) => {
        if (err) return resolve(false);
        if (buf.length !== esperado.length) return resolve(false);
        try { resolve(crypto.timingSafeEqual(buf, esperado)); }
        catch (e) { resolve(false); }
      });
  });
}

/**
 * Un código de invitación: lo que permite fijar la PRIMERA clave.
 *
 * ES DE UN SOLO USO Y VENCE. Existe para que ninguna clave provisoria
 * tenga que ser inventada por nadie ni viajar por ningún lado: el
 * administrador recibe un código, elige su propia clave, y el código
 * muere. Así la clave no existe en texto plano en ningún momento — ni en
 * el código, ni en un chat, ni en la cabeza del que la generó.
 *
 * 32 bytes de `randomBytes` en base64url: 256 bits, imposible de adivinar
 * dentro de su ventana de validez.
 */
function generarInvitacion(dias) {
  const d = Number(dias) || 7;
  return {
    codigo: crypto.randomBytes(32).toString('base64url'),
    venceEn: Date.now() + d * 86400000,
  };
}

/** El código se guarda HASHEADO, igual que una clave. */
function hashearCodigo(codigo) {
  return crypto.createHash('sha256').update(String(codigo)).digest('base64');
}

/**
 * Compara un código contra su hash guardado, en tiempo constante.
 *
 * Se usa SHA-256 y no `scrypt` porque un código de 256 bits aleatorios no
 * necesita ser caro de derivar: no hay diccionario que lo alcance. Lo que
 * sí necesita es la comparación en tiempo constante, por lo mismo que la
 * clave.
 */
function codigoCoincide(codigo, hashGuardado) {
  const a = Buffer.from(hashearCodigo(codigo), 'base64');
  const b = Buffer.from(String(hashGuardado || ''), 'base64');
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch (e) { return false; }
}

module.exports = {
  hashear, verificar, revisar, generarInvitacion, hashearCodigo, codigoCoincide,
  LARGO_MINIMO, PARAMS,
};
