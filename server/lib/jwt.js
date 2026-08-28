/* =====================================================================
   JWT con `node:crypto` · sin dependencias

   POR QUÉ A MANO Y NO `jsonwebtoken`

   Dos motivos, y el segundo es el que decidió:

     1. La suite del proyecto corre con `node test-x.js` desde la raíz y
        SIN instalar nada — es la convención de los 16 archivos de test que
        ya existen. Una suite que necesita `npm install` para verificar los
        permisos se corre menos, y justamente esta es la que no se puede
        saltear.
     2. Firmar RS256 y HMAC-SHA256 es una línea de `crypto` cada uno. La
        biblioteca aporta el PARSEO seguro, no la matemática.

   Y el parseo seguro es exactamente lo que hay que hacer bien, así que va
   explícito y con un test por cada ataque:

     · `alg: none`            → se rechaza: el algoritmo es una constante,
                                nunca se lee del header del token.
     · confusión RS256/HS256  → ídem: no hay ninguna rama que elija.
     · firma manipulada       → comparación en TIEMPO CONSTANTE.
     · token vencido          → `exp` obligatorio y verificado.
     · payload manipulado     → la firma cubre header y payload.

   Si algún día entra una dependencia de cripto, que sea `jose` o
   `jsonwebtoken` y se borre este archivo entero — no que convivan dos.
   ===================================================================== */
'use strict';

const crypto = require('crypto');

/* EL ALGORITMO ES UNA CONSTANTE Y NO SE LEE DEL TOKEN.

   Ahí viven las dos vulnerabilidades clásicas de JWT: un token con
   `alg: none` que se acepta sin firma, y uno con `alg` cambiado para que
   el verificador use la clave equivocada. Las dos desaparecen si el
   algoritmo no es un dato de entrada. */
const ALG = 'HS256';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(t + '='.repeat((4 - t.length % 4) % 4), 'base64');
}

/** Segundos de un plazo tipo `7d`, `12h`, `30m`, `45s` o un número. */
function segundos(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.floor(v);
  const m = /^(\d+)\s*([smhd])$/.exec(String(v || '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 })[m[2]];
}

/**
 * Firma un payload con HMAC-SHA256.
 * `expiraEn` es OBLIGATORIO: un token sin `exp` es una credencial
 * permanente, y estos se reparten por WhatsApp.
 */
function firmar(payload, secreto, opciones) {
  const o = opciones || {};
  const seg = segundos(o.expiraEn);
  if (!seg || seg <= 0) {
    throw Object.assign(
      new Error('Un token necesita vencimiento: pasá expiraEn ("7d", "12h", …)'),
      { codigo: 'SIN_VENCIMIENTO' });
  }
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = Object.assign({}, payload, {
    iat: ahora,
    exp: ahora + seg,
    iss: o.issuer || 'sgadd',
  });
  const cab = b64url(JSON.stringify({ alg: ALG, typ: 'JWT' }));
  const pay = b64url(JSON.stringify(cuerpo));
  const firma = b64url(crypto.createHmac('sha256', secreto).update(cab + '.' + pay).digest());
  return cab + '.' + pay + '.' + firma;
}

/**
 * Verifica y devuelve el payload.
 * @returns {{ok: boolean, payload?: object, motivo?: string}}
 */
function verificar(token, secreto, opciones) {
  const o = opciones || {};
  if (!token || typeof token !== 'string') return { ok: false, motivo: 'SIN_TOKEN' };
  const partes = token.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'FIRMA_INVALIDA' };

  const [cab, pay, firma] = partes;

  /* Se recalcula la firma con NUESTRO algoritmo y se compara. El `alg`
     que declara el token no se consulta jamás: si viniera `none` o
     `RS256`, la firma recalculada simplemente no va a coincidir. */
  const esperada = b64url(crypto.createHmac('sha256', secreto).update(cab + '.' + pay).digest());

  /* Comparación en TIEMPO CONSTANTE. Con `===`, el tiempo de respuesta
     depende de cuántos caracteres coinciden, y eso alcanza para
     reconstruir una firma byte por byte a fuerza de peticiones.
     `timingSafeEqual` exige buffers del mismo largo, así que el largo se
     compara antes — esa diferencia no filtra nada útil. */
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'FIRMA_INVALIDA' };
  }

  let p;
  try { p = JSON.parse(deB64url(pay).toString('utf8')); }
  catch (e) { return { ok: false, motivo: 'FIRMA_INVALIDA' }; }
  if (!p || typeof p !== 'object') return { ok: false, motivo: 'FIRMA_INVALIDA' };

  const ahora = Math.floor(Date.now() / 1000);
  /* Sin `exp` se rechaza, no se acepta como "no vence": un token sin
     vencimiento es exactamente lo que no queremos que exista. */
  if (typeof p.exp !== 'number' || p.exp <= ahora) return { ok: false, motivo: 'VENCIDO' };
  if (o.issuer && p.iss !== o.issuer) return { ok: false, motivo: 'FIRMA_INVALIDA' };

  return { ok: true, payload: p };
}

/**
 * Firma RS256 con la clave privada de la Service Account.
 * Acá NO hay verificación —la hace Google— así que no hay superficie de
 * ataque de parseo: es solo la firma.
 */
function firmarRS256(payload, clavePrivada) {
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const pay = b64url(JSON.stringify(payload));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(cab + '.' + pay), clavePrivada);
  return cab + '.' + pay + '.' + b64url(firma);
}

module.exports = { firmar, verificar, firmarRS256, segundos, ALG, b64url, deB64url };
