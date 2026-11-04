/* =====================================================================
   /api/v1/fichas y /api/cron/recordatorios-vencimiento

     GET  /api/v1/fichas                     todas las fichas (solo ADMIN)
     POST /api/v1/fichas                     { club, categoria, ficha, enviarBienvenida, reenviar }
     GET  /api/cron/recordatorios-vencimiento  la corrida diaria (Vercel Cron)

   VA EN SU PROPIO ARCHIVO, como `estados.js` y `libro.js`: `handlers.js`
   tiene la única ruta que escribe el catálogo y esto no lo toca nunca.

   EL CRON SE AUTENTICA CON `CRON_SECRET`. Vercel manda
   `Authorization: Bearer <CRON_SECRET>` en cada disparo si la variable
   existe. SIN LA VARIABLE LA RUTA NO CORRE (503): una ruta que manda mails
   a clientes no puede quedar abierta a cualquiera que la adivine, y un
   «si no está configurado, pasa» es exactamente cómo queda abierta.
   El admin también la puede disparar con su token, para probarla.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const fichas = require('../lib/fichas.js');
const cron = require('../lib/cron-vencimientos.js');
const envio = require('../lib/mail-envio.js');
const invitacion = require('../lib/invitacion.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

function soloAdmin(peticion) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');
  if (v.rol !== AUTH.ROLES.ADMIN) return error(403, 'SOLO_ADMIN', 'Las fichas de los clientes son del Panel Master.');
  return null;
}

function transporteDe(deps) {
  return (deps && deps.transporte) || envio.transporteSmtp({ env: deps && deps.env });
}

async function manejarFichas(peticion, deps) {
  const no = soloAdmin(peticion);
  if (no) return no;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'No hay dónde guardar las fichas.');
  try {
    const todas = await fichas.leerTodas(deps);
    return { status: 200, body: { ok: true, fichas: todas, envio: envio.estadoEnvio(deps && deps.env) } };
  } catch (e) {
    return error(503, 'KV_ILEGIBLE', 'No se pudieron leer las fichas.');
  }
}

async function manejarFichasEscribir(peticion, deps) {
  const no = soloAdmin(peticion);
  if (no) return no;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'No hay dónde guardar las fichas.');

  const b = (peticion && peticion.body) || {};
  const club = String(b.club || '').toLowerCase();
  const categoria = String(b.categoria || '').toLowerCase();
  if (!SLUG.test(club) || !SLUG.test(categoria)) return error(400, 'RUTA_INVALIDA', 'Falta el club o la categoría.');

  /* La categoría tiene que existir: una ficha huérfana no le manda mails
     a nadie y confunde al que la lee. */
  let cat;
  try { cat = (deps && deps.catalogo) || (await catalogo.cargarParaEscribir(deps)).catalogo; }
  catch (e) { return error(503, e.codigo || 'KV_ILEGIBLE', 'No se pudo leer el catálogo: ' + e.message); }
  if (!cat[club] || !(cat[club].categorias || {})[categoria]) {
    return error(404, 'SIN_CATEGORIA', 'Esa categoría no existe en el catálogo.');
  }

  const n = fichas.normalizar(b.ficha || {});
  if (!n.ok) return error(400, 'FICHA_INVALIDA', n.motivo);

  let ficha;
  try { ficha = await fichas.guardar(club, categoria, n.ficha, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo guardar la ficha: ' + e.message); }

  /* LA BIENVENIDA, si se pidió. Guardar la ficha no depende de que el mail
     salga: si Gmail no contesta o falta la credencial, la ficha queda y la
     respuesta dice por qué no salió. */
  let bienvenida = null, acceso = null;
  if (b.enviarBienvenida || b.reenviar) {
    /* EL ACCESO VA ADENTRO DE LA BIENVENIDA. Antes de mandarla, el mail de
       la ficha queda habilitado para entrar: alta con código si no estaba,
       código nuevo si estaba invitado sin clave, nada si ya tiene clave.
       Si el padrón no se puede leer NO sale el mail: prometería un acceso
       que puede no existir. */
    try {
      acceso = await invitacion.asegurar(club, ficha && ficha.email, cat, deps, ficha && ficha.contacto);
    } catch (e) {
      return { status: 200, body: { ok: true, ficha: ficha, bienvenida: {
        resultado: 'error', codigo: e.codigo || 'KV',
        mensaje: 'No se pudo leer el padrón de accesos: la bienvenida no salió.' } } };
    }
    try {
      bienvenida = await cron.enviarBienvenida(club, categoria, Object.assign({}, deps,
        { catalogo: cat, transporte: transporteDe(deps), forzar: !!b.reenviar,
          invitacion: invitacion.paraElMail(acceso) }));
      if (bienvenida.resultado === 'enviado') ficha = await fichas.leer(club, categoria, deps);
    } catch (e) {
      bienvenida = { resultado: 'error', codigo: e.codigo || 'ERROR', mensaje: e.message };
    }
  }
  return { status: 200, body: { ok: true, ficha: ficha, bienvenida: bienvenida, acceso: acceso } };
}

/**
 * POST /api/v1/clientes, con la bienvenida adentro.
 *
 * Envuelve al handler de accesos SIN tocarlo: el alta, la baja, el cupo y
 * la reinvitación los sigue decidiendo `manejarClientesEscribir`. Lo que se
 * suma es lo de después: si el alta o la reinvitación generaron un código,
 * sale la bienvenida a ESE mail con el código adentro. El código sigue
 * viniendo en la respuesta, para el «Copiar» de respaldo.
 *
 * `enviarMail: false` en el pedido lo apaga (el admin que prefiere pasarlo
 * él). Que el mail no salga NO deshace el alta: el acceso ya quedó y la
 * respuesta dice por qué no llegó.
 */
async function manejarClientesConBienvenida(peticion, deps, base) {
  const r = await base(peticion, deps);
  const cuerpo = (peticion && peticion.body) || {};
  const accion = String(cuerpo.accion || '').trim().toLowerCase();
  if (!r || r.status !== 200 || !r.body || !r.body.codigo) return r;
  if (accion !== 'alta' && accion !== 'reinvitar') return r;
  if (cuerpo.enviarMail === false) return Object.assign({}, r, { body: Object.assign({}, r.body, { mail: null }) });

  const clubId = String(r.body.club || cuerpo.club || '').toLowerCase();
  const email = String(cuerpo.email || '').trim().toLowerCase();
  /* El saludo: el nombre que vino con el alta, y si no vino (una
     reinvitación) el que el padrón ya tenía para ese mail. */
  const deLista = ((r.body.mails || []).find(m => m.email === email) || {}).nombre || '';
  const nombre = String(cuerpo.nombre || '').trim() || deLista;
  let mail;
  try {
    const cat = (deps && deps.catalogo) || (await catalogo.cargar(deps)).catalogo;
    const slug = invitacion.categoriaDeBienvenida((cat || {})[clubId], cuerpo.categoria);
    if (!slug) {
      mail = { resultado: 'omitido', para: email, mensaje: 'El club no tiene categorías: no hay de qué dar la bienvenida.' };
    } else {
      mail = await cron.enviarBienvenida(clubId, slug, Object.assign({}, deps, {
        catalogo: cat, transporte: transporteDe(deps), forzar: true, para: email,
        contacto: nombre,
        invitacion: { email: email, codigo: r.body.codigo, venceEn: r.body.venceEn },
      }));
    }
  } catch (e) {
    mail = { resultado: 'error', para: email, codigo: e.codigo || 'ERROR', mensaje: e.message };
  }
  return Object.assign({}, r, { body: Object.assign({}, r.body, { mail: mail }) });
}

/** Comparación en tiempo constante: el secreto no se adivina de a letras. */
function mismoSecreto(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

async function manejarCronVencimientos(peticion, deps) {
  const env = (deps && deps.env) || process.env;
  const secreto = env.CRON_SECRET || '';
  const encabezado = String(((peticion && peticion.headers) || {}).authorization || '');
  const porCron = secreto && mismoSecreto(encabezado.replace(/^Bearer\s+/i, ''), secreto);
  if (!porCron) {
    const no = soloAdmin(peticion);
    if (no) {
      return secreto ? error(401, 'CRON', 'Falta el secreto del cron.')
        : error(503, 'SIN_CRON_SECRET', 'CRON_SECRET no está configurado: la corrida no se habilita sin él.');
    }
  }
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'Sin Upstash no hay registro de avisos: no se manda nada.');

  /* Sin credencial de Gmail no se reclama ningún aviso: el reporte dice
     qué habría salido y todo queda para la corrida siguiente. */
  const estado = envio.estadoEnvio(env);
  if (!estado.ok && !(deps && deps.transporte)) {
    return { status: 200, body: { ok: false, codigo: estado.codigo, mensaje: estado.mensaje } };
  }
  try {
    const r = await cron.ejecutar(Object.assign({}, deps, { transporte: transporteDe(deps) }));
    return { status: 200, body: Object.assign({ ok: true }, r) };
  } catch (e) {
    return error(503, e.codigo || 'CRON', 'La corrida no pudo completarse: ' + e.message);
  }
}

module.exports = { manejarFichas, manejarFichasEscribir, manejarCronVencimientos, manejarClientesConBienvenida, mismoSecreto };
