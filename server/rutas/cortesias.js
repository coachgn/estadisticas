/* =====================================================================
   LAS RUTAS DE LOS PASES DE CORTESÍA (ver lib/cortesias.js)

     GET  /api/v1/cortesias            ADMIN · la lista de pases
     POST /api/v1/cortesias            ADMIN · { accion: crear | revocar | regenerar | extender }
     POST /api/v1/pase/consultar       sin token · { codigo } → qué pase es (para la puerta)
     POST /api/v1/pase/canjear         sin token · { codigo, contacto } → el token de la muestra

   Y EL GUARD CENTRAL (`guard`), que va en `app.js` ANTES de todas las
   rutas: un token de cortesía solo pasa si su pase sigue vigente en KV y
   si la ruta está en la lista blanca (`C.rutaPermitida`). Va en un solo
   lugar a propósito: con la regla repartida por cada handler, una ruta
   nueva quedaría abierta para los pases sin que nadie lo note.
   ===================================================================== */
'use strict';

const C = require('../lib/cortesias.js');
const catalogo = require('../lib/catalogo.js');
const AUTHS = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const CORE = require('../lib/compartido/sgadd-core.js');
const WHATSAPP_MS = require('../lib/mail-plantillas.js').WHATSAPP;
const mutar = require('../lib/catalogo-mutar.js');
const fichas = require('../lib/fichas.js');
const invitacion = require('../lib/invitacion.js');
const cron = require('../lib/cron-vencimientos.js');
const envioMail = require('../lib/mail-envio.js');

function error(status, codigo, mensaje, extra) {
  return { status: status, body: Object.assign({ ok: false, codigo: codigo, mensaje: mensaje }, extra || {}) };
}

function sesionAdmin(peticion) {
  const v = AUTHS.verificarToken(AUTHS.tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };
  if (v.rol !== AUTH.ROLES.ADMIN) return { error: error(403, 'SOLO_ADMIN', 'Los pases de cortesía los gestiona el administrador.') };
  return { v: v };
}

/** Lo que el admin necesita para mandar el pase: link, mensaje y wa.me. */
function envio(pase, codigo) {
  const link = C.linkDelPase(pase, codigo);
  const mensaje = C.mensajeInvitacion(pase, link);
  return { link: link, mensaje: mensaje, whatsappUrl: C.urlWhatsapp(pase.invitado.whatsapp, mensaje) };
}

/* ------------------------------------------------------------- el guard */

/**
 * Middleware de Express. Sin token, o con un token que no es de cortesía,
 * no hace nada: cada ruta sigue con su propia verificación.
 */
function guard(deps) {
  return async function guardCortesia(req, res, next) {
    let v;
    try { v = AUTHS.verificarToken(AUTHS.tokenDeLaPeticion(req)); } catch (e) { return next(); }
    if (!v || !v.ok || !v.cortesia) return next();
    const r = await validarPedido(req, v, deps);
    if (r.error) return res.status(r.error.status).json(r.error.body);
    req.cortesia = r.pase;
    return next();
  };
}

/** La parte del guard que se puede testear sin Express. */
async function validarPedido(req, v, deps) {
  let pase;
  try { pase = await C.leer(v.cortesia, deps); }
  catch (e) {
    /* Con KV caído no se sabe si el pase sigue vigente: no se abre. */
    return { error: error(503, 'KV', 'No se pudo verificar tu acceso. Probá en un rato.') };
  }
  const estado = C.estadoEfectivo(pase);
  if (estado !== 'activo') {
    return { error: error(403, 'CORTESIA_' + estado.toUpperCase(),
      estado === 'vencido' ? 'La muestra terminó el ' + C.fechaCorta(pase.vence) + '. Escribinos y la seguimos.'
        : 'Esta muestra ya no está disponible.', { whatsapp: WHATSAPP_MS }) };
  }
  /* El token tiene que decir lo mismo que el pase: un token viejo de un
     pase al que se le cambió la zona no abre la zona nueva. */
  if (v.club !== pase.torneo || v.categoria !== pase.zona
      || CORE.claveEquipo(v.sesion.equipoAsignado || '') !== CORE.claveEquipo(pase.equipo)) {
    return { error: error(403, 'CORTESIA_TOKEN', 'El acceso no corresponde a esta muestra. Volvé a entrar con el link.') };
  }
  if (!C.rutaPermitida(req.method, req.path || req.url, req.query, pase)) {
    return { error: error(403, 'CORTESIA_NO_INCLUYE',
      'La muestra no incluye esto. Con tu licencia del torneo lo tenés completo.', { whatsapp: WHATSAPP_MS }) };
  }
  return { pase: pase };
}

/* ------------------------------------------------------------ el admin */

async function manejarCortesias(peticion, deps) {
  const s = sesionAdmin(peticion);
  if (s.error) return s.error;
  let todos;
  try { todos = await C.listar(deps); }
  catch (e) { return error(503, 'KV', 'No se pudieron leer los pases.'); }
  /* Fase 2: la actividad de cada pase y las solicitudes de la landing. Si
     alguno de los dos hashes no se lee, la lista de pases sale igual. */
  let actividad = {}, solicitudes = {};
  try { actividad = await C.listarActividad(deps); } catch (e) { actividad = {}; }
  try { solicitudes = await C.listarSolicitudes(deps); } catch (e) { solicitudes = null; }
  const lista = Object.keys(todos).map(k => Object.assign(C.paraAdmin(todos[k]), { actividad: actividad[k] || null }))
    .sort((a, b) => String(b.creada).localeCompare(String(a.creada)));
  const sols = solicitudes === null ? null : Object.keys(solicitudes).map(k => solicitudes[k]).filter(Boolean)
    .sort((a, b) => String(b.ultima || b.creada).localeCompare(String(a.ultima || a.creada)));
  return { status: 200, body: { ok: true, pases: lista, solicitudes: sols,
    diasRapidos: C.DIAS_RAPIDOS, diasMax: C.DIAS_MAX } };
}

async function manejarCortesiasEscribir(peticion, deps) {
  const s = sesionAdmin(peticion);
  if (s.error) return s.error;
  const b = (peticion && peticion.body) || {};
  const accion = String(b.accion || '');

  if (accion === 'crear') {
    const cascada = await catalogo.cargar(deps);
    if (cascada.origen !== 'kv') return error(503, 'KV', 'El catálogo no se pudo leer de KV: el pase no se puede validar.');
    const r = C.armar(Object.assign({}, b, { creadaPor: s.v.sesion.email, origen: 'admin' }), cascada.catalogo);
    if (!r.ok) return error(400, r.codigo, r.mensaje, r.faltan ? { faltan: r.faltan } : null);
    try { await C.guardar(r.pase, deps); }
    catch (e) { return error(503, 'KV', 'No se pudo guardar el pase.'); }
    return { status: 200, body: Object.assign({ ok: true, pase: C.paraAdmin(r.pase) }, envio(r.pase, r.codigo)) };
  }

  /* FASE 2 · aprobar una solicitud = emitir el pase con sus datos. El
     equipo lo elige el admin del catálogo (el formulario trae el club
     escrito a mano, que no siempre cruza con el libro). */
  if (accion === 'aprobar' || accion === 'descartar') {
    let sol;
    try { sol = await C.leerSolicitud(b.solicitudId, deps); }
    catch (e) { return error(503, 'KV', 'No se pudo leer la solicitud.'); }
    if (!sol) return error(404, 'SIN_SOLICITUD', 'Esa solicitud no existe.');
    if (sol.estado !== 'pendiente') return error(400, 'SOLICITUD', 'Esa solicitud ya está ' + sol.estado + '.');
    if (accion === 'descartar') {
      const nueva = Object.assign({}, sol, { estado: 'descartada', cerrada: new Date().toISOString(), cerradaPor: s.v.sesion.email });
      try { await C.guardarSolicitud(nueva, deps); } catch (e) { return error(503, 'KV', 'No se pudo guardar.'); }
      return { status: 200, body: { ok: true, solicitud: nueva } };
    }
    const cascada = await catalogo.cargar(deps);
    if (cascada.origen !== 'kv') return error(503, 'KV', 'El catálogo no se pudo leer de KV: el pase no se puede validar.');
    const d = sol.datos || {};
    const invitado = Object.assign({ nombre: d.nombre || d.club, whatsapp: d.whatsapp, email: d.email },
      (b.invitado && typeof b.invitado === 'object') ? b.invitado : {});
    const r = C.armar(Object.assign({}, b, { invitado: invitado, creadaPor: s.v.sesion.email,
      origen: 'solicitud', solicitudId: sol.id, nota: b.nota || ('Solicitud desde la landing · ' + (d.club || '')) }), cascada.catalogo);
    if (!r.ok) return error(400, r.codigo, r.mensaje, r.faltan ? { faltan: r.faltan } : null);
    try {
      await C.guardar(r.pase, deps);
      await C.guardarSolicitud(Object.assign({}, sol, { estado: 'aprobada', paseId: r.pase.id,
        cerrada: new Date().toISOString(), cerradaPor: s.v.sesion.email }), deps);
    } catch (e) { return error(503, 'KV', 'No se pudo guardar el pase.'); }
    return { status: 200, body: Object.assign({ ok: true, pase: C.paraAdmin(r.pase) }, envio(r.pase, r.codigo)) };
  }

  if (accion === 'convertir') return convertir(b, s, deps);

  if (['revocar', 'regenerar', 'extender'].indexOf(accion) === -1) {
    return error(400, 'ACCION', 'Acción desconocida.');
  }
  let pase;
  try { pase = await C.leer(b.id, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo leer el pase.'); }
  if (!pase) return error(404, 'SIN_PASE', 'Ese pase no existe.');

  if (accion === 'revocar') {
    /* No se borra: queda el registro con sus contactos, que es el lead. */
    const nuevo = Object.assign({}, pase, { estado: 'revocado', revocado: new Date().toISOString() });
    await C.guardar(nuevo, deps);
    return { status: 200, body: { ok: true, pase: C.paraAdmin(nuevo) } };
  }
  if (accion === 'regenerar') {
    /* El código no se guarda, así que para volver a mandar el link se
       emite uno nuevo y el viejo deja de servir. */
    const codigo = C.nuevoCodigo();
    const nuevo = Object.assign({}, pase, { huella: C.huella(codigo) });
    await C.guardar(nuevo, deps);
    return { status: 200, body: Object.assign({ ok: true, pase: C.paraAdmin(nuevo) }, envio(nuevo, codigo)) };
  }
  /* extender: N días más desde HOY, y si estaba revocado vuelve a activo. */
  const dias = C.normalizarDias(b.dias);
  if (!dias) return error(400, 'DIAS', 'La vigencia va de ' + C.DIAS_MIN + ' a ' + C.DIAS_MAX + ' días.');
  if (pase.estado === 'convertido') return error(400, 'CONVERTIDO', 'Ese pase ya se convirtió en cliente.');
  const nuevo = Object.assign({}, pase, { estado: 'activo', dias: dias, vence: C.venceDe(dias, new Date()) });
  await C.guardar(nuevo, deps);
  return { status: 200, body: { ok: true, pase: C.paraAdmin(nuevo) } };
}

/* ------------------------------------------------- FASE 3 · convertir */

/**
 * EL PASE SE CONVIERTE EN CLIENTE con el alta de siempre, en este orden:
 *
 *   1. el CATÁLOGO · `mutar.aplicar('alta')` sobre el catálogo de KV recién
 *      leído, con `libroDe` = la zona del pase: la categoría queda leyendo
 *      ese libro y enganchada a esa zona, con el equipo del pase y el plan;
 *   2. la FICHA · contacto, mail institucional y fecha de alta;
 *   3. el ACCESO · `invitacion.asegurar()`, el mismo camino de «Quiénes
 *      pueden entrar» (cupo, un mail por club, el admin que no se da de alta);
 *   4. la BIENVENIDA con el código adentro;
 *   5. el PASE pasa a `convertido`, con a qué club y categoría.
 *
 * Es la ÚNICA acción de cortesías que escribe `sgadd:catalogo` y
 * `sgadd:clientes`, y lo hace por los mismos módulos que el Panel Master:
 * dos caminos de alta terminarían con uno que se saltea el cupo.
 *
 * Si falla el catálogo, no se toca nada más. Si falla el mail, el alta
 * queda hecha y la respuesta lo dice: el admin puede reenviar la
 * bienvenida desde la ficha del cliente.
 */
async function convertir(b, s, deps) {
  let pase;
  try { pase = await C.leer(b.id, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo leer el pase.'); }
  if (!pase) return error(404, 'SIN_PASE', 'Ese pase no existe.');
  if (pase.estado === 'convertido') return error(400, 'CONVERTIDO', 'Ese pase ya se convirtió en cliente.');

  const conv = C.datosDeConversion(pase, b);
  if (!conv.ok) return error(400, conv.codigo, conv.mensaje);
  const v = conv.datos;

  /* El catálogo se escribe con el MISMO cliente de KV con que lo lee
     `cargarParaEscribir` (el del módulo), igual que el padrón de accesos:
     `deps.kv` es el almacén de los hashes (pases, fichas, avisos). */
  const almacen = require('../lib/kv.js');
  if (!almacen.configurado(deps && deps.env)) return error(503, 'SIN_KV', 'El servidor no tiene Upstash configurado.');
  let cascada;
  try { cascada = await catalogo.cargarParaEscribir(deps); }
  catch (e) { return error(503, e.codigo || 'KV_ILEGIBLE', e.message); }
  const existente = cascada.catalogo[v.club];
  if (existente && existente.tipo === 'torneo') return error(400, 'CLUB', 'Ese id es de un torneo: elegí otro para el club.');
  if (existente && (existente.categorias || {})[v.categoria]) {
    return error(400, 'CATEGORIA', 'Ese club ya tiene la categoría ' + v.categoria + '. Elegí otro id de categoría.');
  }
  const r = mutar.aplicar(cascada.catalogo, 'alta', v, catalogo.validar);
  if (!r.ok) return error(400, 'CATALOGO_INVALIDO', r.motivo);
  try { await almacen.escribir(catalogo.CLAVE_KV, r.catalogo); }
  catch (e) { return error(502, e.codigo || 'KV', 'No se pudo escribir el catálogo: ' + e.message); }
  catalogo.limpiarCache();

  /* La ficha y el pase se guardan aunque el mail no salga. */
  const hoy = cron.hoyAR(deps && deps.ahora);
  try { await fichas.guardar(v.club, v.categoria, { contacto: conv.contacto || null, email: conv.email, fechaAlta: hoy, renovacion: 'mensual' }, deps); }
  catch (e) { /* sin ficha la bienvenida sale igual: el mail va por `para` */ }

  let acceso = null, bienvenida = null;
  try {
    acceso = await invitacion.asegurar(v.club, conv.email, r.catalogo, deps, conv.contacto);
  } catch (e) {
    bienvenida = { resultado: 'error', codigo: e.codigo || 'KV', mensaje: 'No se pudo leer el padrón de accesos: la bienvenida no salió.' };
  }
  if (!bienvenida) {
    try {
      bienvenida = await cron.enviarBienvenida(v.club, v.categoria, Object.assign({}, deps, {
        catalogo: r.catalogo, forzar: true, para: conv.email, contacto: conv.contacto,
        transporte: (deps && deps.transporte) || envioMail.transporteSmtp({ env: deps && deps.env }),
        invitacion: invitacion.paraElMail(acceso) }));
    } catch (e) {
      bienvenida = { resultado: 'error', codigo: e.codigo || 'ERROR', mensaje: e.message };
    }
  }

  const actual = (await C.leer(pase.id, deps).catch(() => null)) || pase;
  const nuevo = C.marcarConvertido(actual, { club: v.club, categoria: v.categoria, plan: v.plan,
    email: conv.email, por: s.v.sesion.email, bienvenida: bienvenida ? bienvenida.resultado : null }, { ahora: deps && deps.ahora });
  try { await C.guardar(nuevo, deps); }
  catch (e) { return error(503, 'KV', 'El cliente quedó dado de alta, pero no se pudo marcar el pase como convertido.'); }

  return { status: 200, body: { ok: true, pase: C.paraAdmin(nuevo), club: v.club, categoria: v.categoria,
    plan: v.plan, email: conv.email, creoClub: !!r.creoClub, acceso: acceso, bienvenida: bienvenida } };
}

/* ------------------------------------------------------------ la puerta */

async function buscarPorCodigo(b, deps) {
  let pase;
  try { pase = await C.porCodigo(b && b.codigo, deps); }
  catch (e) { return { error: error(503, 'KV', 'No se pudo verificar el link. Probá en un rato.') }; }
  /* Un código que no existe y uno revocado contestan lo mismo: no se le
     confirma a nadie qué códigos existieron. */
  if (!pase || pase.estado === 'revocado') return { error: error(404, 'SIN_PASE', 'Este link no es válido o ya no está disponible.', { whatsapp: WHATSAPP_MS }) };
  return { pase: pase };
}

async function manejarPaseConsultar(peticion, deps) {
  const r = await buscarPorCodigo(peticion && peticion.body, deps);
  if (r.error) return r.error;
  return { status: 200, body: Object.assign({ ok: true, whatsapp: WHATSAPP_MS }, C.paraPuerta(r.pase)) };
}

async function manejarPaseCanjear(peticion, deps) {
  const b = (peticion && peticion.body) || {};
  const r = await buscarPorCodigo(b, deps);
  if (r.error) return r.error;
  const pase = r.pase;
  if (!C.vigente(pase)) {
    return error(403, 'CORTESIA_' + C.estadoEfectivo(pase).toUpperCase(),
      'La muestra terminó el ' + C.fechaCorta(pase.vence) + '. Escribinos y la seguimos.', { whatsapp: WHATSAPP_MS });
  }
  const c = C.normalizarContacto(b.contacto);
  if (!c.ok) return error(400, 'CONTACTO', 'Faltan: ' + c.faltan.join(', ') + '.', { faltan: c.faltan });
  const reg = C.registrarCanje(pase, c.contacto);
  if (!reg.ok) return error(403, reg.codigo, reg.mensaje, { whatsapp: WHATSAPP_MS });
  try { await C.guardar(reg.pase, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo registrar el ingreso. Probá en un rato.'); }

  const token = AUTHS.firmarToken({
    email: C.emailDelToken(pase.id),
    club: pase.torneo,
    categoria: pase.zona,
    equipoAsignado: pase.equipo,
    plan: C.PLAN,
    cortesia: pase.id,
  }, { expiraEn: C.segundosDeToken(pase) + 's' });
  return { status: 200, body: { ok: true, token: token, club: pase.torneo, categoria: pase.zona,
    equipo: pase.equipo, vence: pase.vence, diasRestantes: C.diasRestantes(pase) } };
}

/* ------------------------------------------------------------ fase 2 */

/** «Agendar demo con mis datos», sin token. Deja la solicitud y contesta
    ok; el formulario abre WhatsApp igual, así que un fallo acá no pierde
    el contacto: queda en la conversación. */
async function manejarPaseSolicitar(peticion, deps) {
  const n = C.normalizarSolicitud((peticion && peticion.body) || {});
  if (!n.ok) return error(400, 'SOLICITUD', 'Faltan: ' + n.faltan.join(', ') + '.', { faltan: n.faltan });
  let todas;
  try { todas = await C.listarSolicitudes(deps); }
  catch (e) { return error(503, 'KV', 'No se pudo registrar la solicitud.'); }
  const r = C.sumarSolicitud(todas, n.datos);
  if (!r.ok) return error(429, r.codigo, r.mensaje, { whatsapp: WHATSAPP_MS });
  try { await C.guardarSolicitud(r.solicitud, deps); }
  catch (e) { return error(503, 'KV', 'No se pudo registrar la solicitud.'); }
  /* No se devuelve el id: no es de quien la manda. */
  return { status: 200, body: { ok: true, nueva: r.nueva } };
}

/** La telemetría de la muestra. Solo con el token de un pase que pasó por
    el guard (`peticion.cortesia` lo pone `guard`). */
async function manejarPaseActividad(peticion, deps) {
  const pase = peticion && peticion.cortesia;
  if (!pase || !pase.id) return error(403, 'SOLO_PASE', 'Solo una muestra de cortesía registra actividad.');
  const eventos = C.normalizarEventos(((peticion && peticion.body) || {}).eventos);
  if (!eventos.length) return { status: 200, body: { ok: true, sumados: 0 } };
  try {
    const previa = await C.leerActividad(pase.id, deps);
    await C.guardarActividad(pase.id, C.sumarActividad(previa, eventos), deps);
  } catch (e) { return error(503, 'KV', 'No se pudo registrar la actividad.'); }
  return { status: 200, body: { ok: true, sumados: eventos.length } };
}

module.exports = { guard, validarPedido, manejarCortesias, manejarCortesiasEscribir,
  manejarPaseConsultar, manejarPaseCanjear, manejarPaseSolicitar, manejarPaseActividad };
