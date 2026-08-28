/* =====================================================================
   Tokens firmados · el rol deja de ser editable

   Hoy el rol viaja en la URL (`?plan=PRO`) y cualquiera lo edita. Acá pasa
   a ser un claim de un JWT firmado con `JWT_SECRET`, que solo conoce el
   servidor: el cliente puede LEER su token pero no puede fabricar uno
   distinto que valide.

   ---------------------------------------------------------------------
   LAS REGLAS DE NEGOCIO NO SE REESCRIBEN ACÁ

   `js/sgadd-auth.js` es un módulo puro y ya es requerible desde Node. El
   servidor lo IMPORTA. Si tuviera su propia copia de la matriz de
   secciones o de la comparación de equipos, las dos divergirían y la
   divergencia sería silenciosa: el navegador mostraría una cosa y el
   servidor otra. Este proyecto ya se comió ese bug tres veces (punto 15
   de CLAUDE.md).

   Lo que cambia no son las reglas, es quién las hace cumplir.
   ===================================================================== */
'use strict';

const jwt = require('./jwt.js');
const { entorno } = require('./config.js');

/* El MISMO módulo que corre en el navegador. */
const AUTH = require('../../js/sgadd-auth.js');

const ALGORITMO = 'HS256';
const EXPIRA_POR_DEFECTO = '7d';

/* Un secreto corto se rompe por fuerza bruta offline: con el token en la
   mano, probar candidatos no cuesta ni una petición. 32 bytes es el piso
   razonable para HS256. */
const SECRETO_MIN = 32;

function secreto() {
  const s = entorno().jwtSecret;
  if (!s || s.length < SECRETO_MIN) {
    throw Object.assign(
      new Error('JWT_SECRET ausente o de menos de ' + SECRETO_MIN
        + ' caracteres. Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'),
      { codigo: 'SIN_SECRETO' });
  }
  return s;
}

/**
 * Firma un token de acceso.
 *
 * `expiraEn` NO tiene default silencioso a "nunca": un token sin `exp` es
 * una credencial permanente circulando por WhatsApp, y el formato de link
 * que pidió el producto se comparte justamente por ahí.
 */
function firmarToken(datos, opciones) {
  const o = opciones || {};
  const d = datos || {};
  if (!d.email) {
    throw Object.assign(new Error('Un token sin email no identifica a nadie'), { codigo: 'SIN_EMAIL' });
  }
  const payload = {
    email: AUTH.normalizarEmail(d.email),
    club: d.club || null,
    categoria: d.categoria || null,
    equipoAsignado: d.equipoAsignado || null,
    /* El plan se normaliza con el MISMO parser del frontend, así que un
       valor raro cae a BÁSICO y nunca a PRO — un typo en el script de
       alta no puede regalar el módulo que se cobra aparte. */
    plan: AUTH.parsearSesion({ email: d.email, plan: d.plan }).plan,
  };
  return jwt.firmar(payload, secreto(), {
    expiraEn: o.expiraEn || EXPIRA_POR_DEFECTO,
    issuer: 'sgadd',
  });
}

/**
 * Verifica un token y devuelve la sesión, en la forma que espera
 * `sgadd-auth.js`.
 *
 * @returns {{ok: boolean, sesion?: object, motivo?: string}}
 */
function verificarToken(token) {
  if (!token) return { ok: false, motivo: 'SIN_TOKEN' };
  /* El algoritmo NO se lee del token: `lib/jwt.js` lo tiene como
     constante, que es lo que cierra las dos confusiones clásicas
     (`alg: none` y RS256↔HS256). Ver la cabecera de ese archivo. */
  const v = jwt.verificar(token, secreto(), { issuer: 'sgadd' });
  if (!v.ok) return { ok: false, motivo: v.motivo };
  const p = v.payload;

  /* EL CLAIM DE ADMIN SE RE-DERIVA, NO SE CONFÍA.

     El token está firmado por nosotros, así que sus claims son
     confiables. Aun así, `esAdmin` se recalcula contra la lista del
     servidor en cada request: sacar a alguien de la lista tiene que
     surtir efecto YA, no cuando venza su token. Un token de 7 días con
     `admin: true` adentro es una llave que no se puede revocar. */
  const sesion = AUTH.parsearSesion({
    email: p.email,
    equipoAsignado: p.equipoAsignado,
    plan: p.plan,
  });
  if (!sesion) return { ok: false, motivo: 'PAYLOAD_INVALIDO' };

  return {
    ok: true,
    sesion: sesion,
    rol: AUTH.rol(sesion),
    club: p.club || null,
    categoria: p.categoria || null,
    expiraEn: p.exp ? new Date(p.exp * 1000).toISOString() : null,
  };
}

/**
 * El link que se le manda al cliente.
 *
 * OJO: un token en el query string queda en el historial del navegador, en
 * el `Referer` de cualquier recurso externo y en los logs de cualquier
 * proxy. Es el formato que pidió el producto y es cómodo para repartir,
 * pero el frontend TIENE que sacarlo de la URL apenas lo lee
 * (`history.replaceState`) y guardarlo en `sessionStorage`.
 * Está anotado en el punto 7.2 de docs/ARQUITECTURA-BACKEND.md.
 */
function generarLinkCliente(o) {
  const op = o || {};
  if (!op.base) {
    throw Object.assign(new Error('Falta la URL base del panel'), { codigo: 'SIN_BASE' });
  }
  const token = firmarToken({
    email: op.email,
    club: op.club,
    categoria: op.categoria,
    equipoAsignado: op.equipo || op.equipoAsignado,
    plan: op.plan,
  }, { expiraEn: op.expiraEn });

  const u = new URL(op.base);
  /* El club va también como parámetro visible: el panel necesita saber qué
     marca pintar ANTES de tener respuesta del backend, y eso no es un
     dato sensible. El token sigue siendo el único que decide permisos. */
  if (op.club) u.searchParams.set('club', op.club);
  u.searchParams.set('access_token', token);

  const v = verificarToken(token);
  return { url: u.toString(), token: token, expiraEn: v.expiraEn, sesion: v.sesion };
}

/** Saca el token del header `Authorization` o del query string. */
function tokenDeLaPeticion(req) {
  const h = (req && req.headers) || {};
  const auth = h.authorization || h.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  if (m) return m[1].trim();
  const q = (req && req.query) || {};
  return q.access_token || q.token || null;
}

module.exports = {
  firmarToken, verificarToken, generarLinkCliente, tokenDeLaPeticion,
  ALGORITMO, EXPIRA_POR_DEFECTO, SECRETO_MIN,
};
