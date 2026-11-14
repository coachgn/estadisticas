/* =====================================================================
   LOS PASES DE CORTESÍA · una muestra del panel sin dar de alta un cliente

   Un pase es un acceso temporal a UNA zona de torneo, recortado a UN
   equipo, con las funciones del Plan PLATA. Sirve para la prospección
   (el admin lo crea y lo manda por WhatsApp) y, desde la fase 2, para la
   demanda entrante («Agendar demo con mis datos»).

   VIVE EN SU PROPIA CLAVE, `sgadd:cortesias`, un HASH con un campo por
   pase. No toca `sgadd:catalogo` ni `sgadd:clientes`: un pase que no
   compra no deja rastro en la tabla de clientes, y uno que compra se
   convierte con el alta de siempre.

   Lo que hay que respetar al tocarlo:

   · DEL CÓDIGO SE GUARDA LA HUELLA, no el código. Es un secreto de 192
     bits: con el código se entra. Si se pudiera volver a leer, KV
     alcanzaría para entrar como cualquier invitado — el mismo criterio
     que las invitaciones (`clientes.js`). Para reenviar el link hay que
     regenerarlo, y el viejo deja de servir.
   · EL MAIL DEL TOKEN ES SINTÉTICO (`pase.<id>@cortesia.motorstats.ar`).
     El rol sale del mail (`AUTH.rol`): si el token llevara el mail que
     escribió el invitado y ese mail fuera de un administrador, el pase
     abriría todo. Con un dominio propio no puede pasar.
   · LA LISTA DE RUTAS ES BLANCA (`rutaPermitida`): lo que no está acá,
     un token de cortesía no lo abre. Una ruta nueva queda cerrada sola.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const kv = require('./kv.js');
const CORE = require('./compartido/sgadd-core.js');

const CLAVE = 'sgadd:cortesias';
const PLAN = 'PLATA';
const DOMINIO = 'cortesia.motorstats.ar';
const DIAS_RAPIDOS = [3, 5, 7, 10, 15];
const DIAS_MIN = 1;
const DIAS_MAX = 60;
/* El token dura como mucho esto, aunque el pase dure más: un link que se
   reenvía no puede quedar abierto semanas sin volver a pasar por el pase.
   Al vencer, el panel vuelve a la puerta y el mismo link lo renueva. */
const TOKEN_MAX_SEG = 72 * 3600;
/* Cuántos contactos distintos (por WhatsApp) puede canjear un mismo pase.
   Cada reenvío es un contacto más, que queda anotado; sin tope, un link en
   un grupo de entrenadores sería una licencia gratis para todos. */
const MAX_CONTACTOS = 3;
const ESTADOS = ['activo', 'revocado', 'convertido'];
const ID = /^[a-z0-9]{10}$/;
/* FASE 2 · dos hashes más de la misma familia. Ninguno toca el catálogo
   ni el padrón de clientes. */
const CLAVE_SOLICITUDES = 'sgadd:cortesias:solicitudes';
const CLAVE_ACTIVIDAD = 'sgadd:cortesias:actividad';
/* Una solicitud entra sin token desde la landing: el tope de pendientes
   evita que un formulario abierto llene KV. Mismo WhatsApp = la misma
   solicitud (se suma una vez más), no una nueva. */
const MAX_PENDIENTES = 300;
const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'descartada'];
const MOTIVOS = ['demo', 'plan', 'servicio'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function almacen(deps) { return (deps && deps.kv) || kv; }
function ahoraDe(o) { return (o && o.ahora) ? new Date(o.ahora) : new Date(); }

function huella(codigo) {
  return crypto.createHash('sha256').update(String(codigo || '')).digest('hex');
}
function nuevoCodigo() { return crypto.randomBytes(24).toString('base64url'); }
function nuevoId() {
  const abc = 'abcdefghijkmnopqrstuvwxyz23456789';
  const b = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += abc[b[i] % abc.length];
  return s;
}

/** El mail del token: nunca el del invitado (ver la cabecera). */
function emailDelToken(id) { return 'pase.' + id + '@' + DOMINIO; }

/* --------------------------------------------------------------------
   LOS DATOS DEL INVITADO
   -------------------------------------------------------------------- */

/** Texto corto sin control ni marcas de HTML: termina en una pantalla. */
function textoCorto(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 80);
}

/**
 * El número de WhatsApp, en el formato que pide `wa.me`: solo dígitos,
 * con el código de país. Un número argentino escrito como se dice en voz
 * alta (`221 614-3994`, `0221 15 614 3994`) se completa con 549; uno que ya
 * trae el país se respeta. Devuelve `''` si no da un número posible.
 */
/* El 15 del celular argentino va entre la característica (2 a 4 dígitos) y
   el número: con él son 12 dígitos, sin él 10. */
function sin15(r) {
  if (r.length !== 12) return r;
  for (const a of [2, 3, 4]) if (r.substr(a, 2) === '15') return r.slice(0, a) + r.slice(a + 2);
  return r;
}
function normalizarWhatsapp(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (!d) return '';
  if (d.indexOf('54') === 0) {
    let r = d.slice(2);
    if (r[0] === '9') r = r.slice(1);
    if (r[0] === '0') r = r.slice(1);
    r = sin15(r);
    return r.length === 10 ? '549' + r : '';
  }
  if (d[0] === '0' || d.length === 10 || d.length === 12) {
    /* Nacional argentino, sin el 0 de larga distancia y sin el 15. */
    const r = sin15(d[0] === '0' ? d.slice(1) : d);
    return r.length === 10 ? '549' + r : '';
  }
  /* Con el código de otro país adelante: se respeta. */
  return (d.length >= 11 && d.length <= 15) ? d : '';
}

function normalizarEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e) ? e.slice(0, 254) : '';
}

/** El contacto que deja el invitado. Exige nombre y WhatsApp. */
function normalizarContacto(c) {
  const x = c || {};
  const out = {
    nombre: textoCorto(x.nombre, 80),
    whatsapp: normalizarWhatsapp(x.whatsapp),
    email: normalizarEmail(x.email),
    rol: textoCorto(x.rol, 40),
    club: textoCorto(x.club, 80),
  };
  const faltan = [];
  if (!out.nombre) faltan.push('nombre');
  if (!out.whatsapp) faltan.push('whatsapp');
  if (String(x.email || '').trim() && !out.email) faltan.push('email');
  return faltan.length ? { ok: false, faltan: faltan } : { ok: true, contacto: out };
}

/** La cantidad de días: un número entero entre 1 y 60. */
function normalizarDias(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < DIAS_MIN || n > DIAS_MAX) return null;
  return n;
}

/**
 * El vencimiento: a las 23:59:59 de Argentina del día N, contando hoy como
 * el día 0 (un pase de 7 días creado el lunes vence el lunes siguiente a la
 * noche). Es el mismo corte que la suscripción (punto 63).
 */
function venceDe(dias, ahora) {
  const ar = new Date(ahora.getTime() - 3 * 3600 * 1000);
  const d = new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + dias));
  const iso = d.toISOString().slice(0, 10);
  return iso + 'T23:59:59.999-03:00';
}

/* --------------------------------------------------------------------
   EL PASE
   -------------------------------------------------------------------- */

/**
 * Valida un pedido de alta contra el CATÁLOGO: el torneo tiene que
 * existir, la zona ser una de sus categorías con libro, y el equipo jugar
 * en esa zona. Devuelve el pase listo para guardar y el código (una vez).
 */
function armar(pedido, catalogoKV, opciones) {
  const p = pedido || {};
  const ahora = ahoraDe(opciones);
  const torneo = String(p.torneo || '').trim().toLowerCase();
  const zona = String(p.zona || '').trim().toLowerCase();
  const t = (catalogoKV || {})[torneo];
  if (!SLUG.test(torneo) || !t) return { ok: false, codigo: 'TORNEO', mensaje: 'Ese torneo no está en el catálogo.' };
  if (t.tipo !== 'torneo') return { ok: false, codigo: 'TORNEO', mensaje: 'El pase se emite sobre un torneo, no sobre un cliente.' };
  const k = (t.categorias || {})[zona];
  if (!SLUG.test(zona) || !k) return { ok: false, codigo: 'ZONA', mensaje: 'Esa zona no es del torneo.' };
  if (k.interzonal) return { ok: false, codigo: 'ZONA', mensaje: 'El pase va sobre una zona regular, no sobre un libro de postemporada.' };
  if (!k.sheetId) return { ok: false, codigo: 'ZONA', mensaje: 'Esa zona todavía no tiene libro conectado.' };

  const equipo = textoCorto(p.equipo, 80);
  if (!equipo) return { ok: false, codigo: 'EQUIPO', mensaje: 'Falta el equipo.' };
  const clave = CORE.claveEquipo(equipo);
  const lista = Array.isArray(k.equipos) ? k.equipos : [];
  /* Si la zona declara sus equipos, el del pase tiene que ser uno de
     ellos: un nombre que no cruza con el libro daría una muestra vacía
     —el recorte deja cero filas— sin decir por qué. */
  const delLibro = lista.find(e => CORE.claveEquipo((e && e.nombre) || '') === clave
    || (e && e.clave && CORE.claveEquipo(e.clave) === clave)
    || ((e && e.alias) || []).some(a => CORE.claveEquipo(a) === clave));
  if (lista.length && !delLibro) return { ok: false, codigo: 'EQUIPO', mensaje: 'Ese equipo no juega en esa zona.' };

  const dias = normalizarDias(p.dias);
  if (!dias) return { ok: false, codigo: 'DIAS', mensaje: 'La vigencia va de ' + DIAS_MIN + ' a ' + DIAS_MAX + ' días.' };

  const inv = normalizarContacto(p.invitado);
  if (!inv.ok) return { ok: false, codigo: 'INVITADO', mensaje: 'Del entrenador faltan: ' + inv.faltan.join(', ') + '.', faltan: inv.faltan };

  const codigo = nuevoCodigo();
  const pase = {
    id: nuevoId(),
    huella: huella(codigo),
    torneo: torneo,
    zona: zona,
    zonaLabel: k.label || zona,
    torneoNombre: t.nombre || torneo,
    equipo: (delLibro && delLibro.nombre) || equipo,
    plan: PLAN,
    /* El play-by-play de SU equipo va incluido (decisión del club). */
    pbp: p.pbp !== false,
    dias: dias,
    creada: ahora.toISOString(),
    vence: venceDe(dias, ahora),
    creadaPor: normalizarEmail(p.creadaPor) || null,
    origen: p.origen === 'solicitud' ? 'solicitud' : 'admin',
    solicitudId: (p.origen === 'solicitud' && ID.test(String(p.solicitudId || ''))) ? String(p.solicitudId) : null,
    estado: 'activo',
    invitado: inv.contacto,
    nota: textoCorto(p.nota, 200),
    contactos: [],
    usos: 0,
    ultimoUso: null,
  };
  return { ok: true, pase: pase, codigo: codigo };
}

/** El estado que se hace valer: un activo con la fecha pasada está vencido. */
function estadoEfectivo(pase, opciones) {
  if (!pase) return 'inexistente';
  const e = ESTADOS.indexOf(pase.estado) !== -1 ? pase.estado : 'revocado';
  if (e !== 'activo') return e;
  return new Date(pase.vence).getTime() <= ahoraDe(opciones).getTime() ? 'vencido' : 'activo';
}
function vigente(pase, opciones) { return estadoEfectivo(pase, opciones) === 'activo'; }

/** Días que le quedan, contando el de hoy si todavía no venció. */
function diasRestantes(pase, opciones) {
  if (!vigente(pase, opciones)) return 0;
  return Math.max(1, diasEntre(ahoraDe(opciones), pase.vence));
}
/* Días de calendario de Argentina entre hoy y la fecha del vencimiento: un
   pase de 7 días creado hoy dice «7», no «8» por las horas que sobran. */
function diasEntre(ahora, vence) {
  const hoy = new Date(ahora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const fin = String(vence || '').slice(0, 10);
  return Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 86400000);
}

/** Cuánto dura el token que se emite ahora: lo que le queda, con tope. */
function segundosDeToken(pase, opciones) {
  const ms = new Date(pase.vence).getTime() - ahoraDe(opciones).getTime();
  return Math.max(60, Math.min(TOKEN_MAX_SEG, Math.floor(ms / 1000)));
}

/**
 * Anota el contacto del que canjea. El mismo WhatsApp vuelve a entrar sin
 * sumar un contacto nuevo; uno distinto suma, hasta `MAX_CONTACTOS`.
 */
function registrarCanje(pase, contacto, opciones) {
  const ahora = ahoraDe(opciones).toISOString();
  const lista = Array.isArray(pase.contactos) ? pase.contactos.slice() : [];
  const i = lista.findIndex(c => c && c.whatsapp === contacto.whatsapp);
  if (i === -1) {
    if (lista.length >= MAX_CONTACTOS) {
      return { ok: false, codigo: 'TOPE', mensaje: 'Este link ya lo usaron ' + MAX_CONTACTOS + ' personas. Escribinos y te armamos uno propio.' };
    }
    lista.push(Object.assign({}, contacto, { primerIngreso: ahora, ultimoIngreso: ahora, ingresos: 1 }));
  } else {
    lista[i] = Object.assign({}, lista[i], contacto, {
      ultimoIngreso: ahora, ingresos: (lista[i].ingresos || 0) + 1 });
  }
  return { ok: true, pase: Object.assign({}, pase, { contactos: lista, usos: (pase.usos || 0) + 1, ultimoUso: ahora }) };
}

/** Lo que ve el Panel Master. Sin la huella. */
function paraAdmin(pase, opciones) {
  if (!pase) return null;
  const out = Object.assign({}, pase, { estadoEfectivo: estadoEfectivo(pase, opciones), diasRestantes: diasRestantes(pase, opciones) });
  delete out.huella;
  return out;
}

/** Lo que ve el que tiene el link ANTES de canjear: sin datos de contacto
    ajenos. El WhatsApp del invitado va enmascarado: si el link se reenvió,
    el que lo recibe no se lleva el número del que lo invitaron. */
function paraPuerta(pase, opciones) {
  const inv = pase.invitado || {};
  const w = inv.whatsapp || '';
  return {
    equipo: pase.equipo,
    torneo: pase.torneoNombre,
    zona: pase.zonaLabel,
    vence: pase.vence,
    diasRestantes: diasRestantes(pase, opciones),
    estado: estadoEfectivo(pase, opciones),
    nombre: inv.nombre || '',
    whatsappPista: w ? '•••• ' + w.slice(-4) : '',
  };
}

/* --------------------------------------------------------------------
   EL LINK Y EL MENSAJE DE WHATSAPP
   -------------------------------------------------------------------- */

const PANEL_URL = 'https://coachgn.github.io/estadisticas/';

function linkDelPase(pase, codigo, base) {
  const b = base || PANEL_URL;
  return b + (b.indexOf('?') === -1 ? '?' : '&') + 'club=' + encodeURIComponent(pase.torneo)
    + '&pase=' + encodeURIComponent(codigo);
}

function fechaCorta(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

/** El nombre del equipo como se dice: sin el sufijo de categoría del libro. */
function equipoLegible(n) {
  const s = (CORE.limpiarNombre ? CORE.limpiarNombre(n) : String(n || '')) || String(n || '');
  return s.toLowerCase().replace(/(^|[\s(.'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
}

/**
 * El mensaje de invitación, con la voz de los mails de alta: de entrenador
 * a entrenador, directo, sin vender de más. El link va solo en su renglón
 * para que WhatsApp lo muestre como link.
 */
function mensajeInvitacion(pase, link) {
  const nombre = String((pase.invitado && pase.invitado.nombre) || '').split(' ')[0];
  return [
    'Hola' + (nombre ? ' ' + nombre : '') + ', ¿cómo andás? Te escribimos de MotorStats.',
    '',
    'Te armamos una muestra del panel con los datos reales de ' + equipoLegible(pase.equipo)
      + ' en ' + pase.torneoNombre + ': el equipo contra la liga, el diagnóstico, cada jugador'
      + (pase.pbp ? ', el mapa de tiro y los quintetos' : '')
      + ', y el informe de scouting funcionando con tu equipo.',
    '',
    'La tenés abierta ' + pase.dias + ' día' + (pase.dias === 1 ? '' : 's') + ', hasta el ' + fechaCorta(pase.vence) + '. Entrás con este link, sin crear usuario:',
    link,
    '',
    'Mirala con tiempo y cualquier cosa nos escribís por acá: lo recorremos juntos.',
  ].join('\n');
}

function urlWhatsapp(numero, texto) {
  return 'https://wa.me/' + String(numero || '').replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
}

/* --------------------------------------------------------------------
   LA LISTA BLANCA DE RUTAS
   -------------------------------------------------------------------- */

/**
 * ¿Puede un token de cortesía hacer este pedido? Todo lo que no está acá
 * queda cerrado: Scouting del servidor, estados, ciclos, fichajes, la vara
 * de jugadores, las predicciones, el Panel Master y los crons.
 */
function rutaPermitida(metodo, ruta, query, pase) {
  const m = String(metodo || 'GET').toUpperCase();
  const seg = String(ruta || '').replace(/\/+$/, '').split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s).toLowerCase(); } catch (e) { return ''; }
  });
  const q = query || {};
  if (seg[0] !== 'api' || seg[1] !== 'v1') return false;
  /* La única escritura de un pase: su propia telemetría (Fase 2). */
  if (m === 'POST') return seg.length === 4 && seg[2] === 'pase' && seg[3] === 'actividad';
  if (m !== 'GET') return false;
  const propio = (eq) => !eq || CORE.claveEquipo(String(eq)) === CORE.claveEquipo(pase.equipo);
  const r = seg.slice(2);
  /* el catálogo: viaja recortado al pase (ver `catalogo.publicoCortesia`). */
  if (r.length === 1 && r[0] === 'catalogo') return true;
  /* el libro de SU zona, recortado a su equipo como el de un cliente. */
  if (r.length === 2 && r[0] === 'equipos') {
    return r[1] === pase.torneo && String(q.categoria || '').toLowerCase() === pase.zona && propio(q.equipo);
  }
  /* el play-by-play: el índice y el paquete de SU equipo, nada más. */
  if (r.length === 3 && r[0] === 'pbp') {
    return !!pase.pbp && r[1] === pase.torneo && r[2] === pase.zona && propio(q.equipo);
  }
  /* el calendario y la llave: estructura pública de la competencia. */
  if (r.length === 2 && r[0] === 'fixture') return r[1] === pase.torneo;
  if (r.length === 3 && r[0] === 'torneos' && r[2] === 'llave') return r[1] === pase.torneo;
  return false;
}

/* --------------------------------------------------------------------
   KV
   -------------------------------------------------------------------- */

async function leer(id, deps) {
  if (!ID.test(String(id || ''))) return null;
  const r = await almacen(deps).leerCampos(CLAVE, [id]);
  return r[id] || null;
}
async function listar(deps) { return almacen(deps).leerHash(CLAVE); }
async function guardar(pase, deps) {
  if (!pase || !ID.test(pase.id)) throw new Error('pase inválido');
  await almacen(deps).escribirCampos(CLAVE, { [pase.id]: pase });
  return pase;
}
/** Busca el pase de un código por su huella. Los pases son decenas: leer el
    hash entero es más simple que mantener un segundo índice. */
async function porCodigo(codigo, deps) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(codigo || ''))) return null;
  const h = huella(codigo);
  const todos = await listar(deps);
  const id = Object.keys(todos).find(k => todos[k] && todos[k].huella === h);
  return id ? todos[id] : null;
}


/* --------------------------------------------------------------------
   FASE 2 · LA DEMANDA ENTRANTE («Agendar demo con mis datos»)

   El formulario de la landing deja una SOLICITUD: quién es, de qué club y
   su WhatsApp (obligatorio). El admin la ve en el Panel Master, elige el
   equipo del catálogo y la aprueba: sale un pase con `origen: 'solicitud'`.
   -------------------------------------------------------------------- */

/** Valida lo que manda el formulario. Exige el club y el WhatsApp. */
function normalizarSolicitud(pedido) {
  const x = pedido || {};
  const out = {
    nombre: textoCorto(x.nombre, 80),
    rol: textoCorto(x.rol, 40),
    club: textoCorto(x.club, 80),
    whatsapp: normalizarWhatsapp(x.whatsapp),
    email: normalizarEmail(x.email),
    pais: textoCorto(x.pais, 40),
    ciudad: textoCorto(x.ciudad, 60),
    liga: textoCorto(x.liga, 60),
    motivo: MOTIVOS.indexOf(String(x.motivo || '')) !== -1 ? String(x.motivo) : 'demo',
    plan: textoCorto(x.plan, 30),
    servicio: textoCorto(x.servicio, 80),
  };
  const faltan = [];
  if (!out.club) faltan.push('club');
  if (!out.whatsapp) faltan.push('whatsapp');
  return faltan.length ? { ok: false, faltan: faltan } : { ok: true, datos: out };
}

/**
 * Suma una solicitud al hash, PURA sobre el mapa de hoy. Con el mismo
 * WhatsApp pendiente, la actualiza y cuenta una vez más; si no, crea una
 * nueva, salvo que ya haya demasiadas pendientes.
 */
function sumarSolicitud(todas, datos, opciones) {
  const ahora = ahoraDe(opciones).toISOString();
  const lista = Object.keys(todas || {}).map(k => todas[k]).filter(Boolean);
  const misma = lista.find(s => s.estado === 'pendiente' && s.datos && s.datos.whatsapp === datos.whatsapp);
  if (misma) {
    return { ok: true, solicitud: Object.assign({}, misma, { datos: Object.assign({}, misma.datos, quitarVacios(datos)),
      veces: (misma.veces || 1) + 1, ultima: ahora }), nueva: false };
  }
  if (lista.filter(s => s.estado === 'pendiente').length >= MAX_PENDIENTES) {
    return { ok: false, codigo: 'TOPE', mensaje: 'Ahora no podemos tomar la solicitud. Escribinos por WhatsApp.' };
  }
  return { ok: true, nueva: true, solicitud: { id: nuevoId(), datos: datos, estado: 'pendiente',
    creada: ahora, ultima: ahora, veces: 1, paseId: null } };
}
function quitarVacios(o) {
  const r = {};
  Object.keys(o || {}).forEach(k => { if (o[k]) r[k] = o[k]; });
  return r;
}

async function leerSolicitud(id, deps) {
  if (!ID.test(String(id || ''))) return null;
  const r = await almacen(deps).leerCampos(CLAVE_SOLICITUDES, [id]);
  return r[id] || null;
}
async function listarSolicitudes(deps) { return almacen(deps).leerHash(CLAVE_SOLICITUDES); }
async function guardarSolicitud(s, deps) {
  if (!s || !ID.test(s.id)) throw new Error('solicitud inválida');
  await almacen(deps).escribirCampos(CLAVE_SOLICITUDES, { [s.id]: s });
  return s;
}

/* --------------------------------------------------------------------
   FASE 2 · LA TELEMETRÍA DE LA MUESTRA

   Qué secciones mira, cuántas veces entra y qué exporta. Un registro por
   pase; lo escribe el panel del invitado (con su token, por el guard) y lo
   lee el admin. Son contadores: no se guarda ni una navegación entera.
   -------------------------------------------------------------------- */
const ETIQUETA = /^[a-z0-9][a-z0-9-]{0,29}$/;
const MAX_CLAVES = 40;

/** Normaliza un lote de eventos: [{tipo:'ingreso'|'vista'|'export', dato}]. */
function normalizarEventos(lista) {
  const out = [];
  (Array.isArray(lista) ? lista : []).slice(0, 20).forEach((e) => {
    const tipo = e && String(e.tipo || '');
    if (tipo === 'ingreso') out.push({ tipo: tipo });
    else if (tipo === 'vista') {
      const d = String((e && e.dato) || '').toLowerCase();
      if (ETIQUETA.test(d)) out.push({ tipo: tipo, dato: d });
    } else if (tipo === 'export') {
      const d = textoCorto(e && e.dato, 60);
      if (d) out.push({ tipo: tipo, dato: d });
    }
  });
  return out;
}

/** Aplica un lote al registro de actividad de un pase. PURA. */
function sumarActividad(previa, eventos, opciones) {
  const ahora = ahoraDe(opciones).toISOString();
  const a = Object.assign({ ingresos: 0, secciones: {}, exportes: {}, primera: null, ultima: null }, previa || {});
  a.secciones = Object.assign({}, a.secciones);
  a.exportes = Object.assign({}, a.exportes);
  const sumar = (mapa, k) => {
    if (!(k in mapa) && Object.keys(mapa).length >= MAX_CLAVES) return;
    mapa[k] = (mapa[k] || 0) + 1;
  };
  (eventos || []).forEach((e) => {
    if (e.tipo === 'ingreso') a.ingresos += 1;
    else if (e.tipo === 'vista') sumar(a.secciones, e.dato);
    else if (e.tipo === 'export') sumar(a.exportes, e.dato);
  });
  if (eventos && eventos.length) { a.primera = a.primera || ahora; a.ultima = ahora; }
  return a;
}

async function leerActividad(id, deps) {
  if (!ID.test(String(id || ''))) return null;
  const r = await almacen(deps).leerCampos(CLAVE_ACTIVIDAD, [id]);
  return r[id] || null;
}
async function listarActividad(deps) { return almacen(deps).leerHash(CLAVE_ACTIVIDAD); }
async function guardarActividad(id, a, deps) {
  if (!ID.test(String(id || ''))) throw new Error('pase inválido');
  await almacen(deps).escribirCampos(CLAVE_ACTIVIDAD, { [id]: a });
  return a;
}

/* --------------------------------------------------------------------
   FASE 3 · EL CIERRE: convertir el pase en cliente y el aviso del día -2

   Convertir NO vive acá: es el alta de siempre (catálogo + accesos +
   bienvenida), que la hace la ruta con los mismos módulos que el Panel
   Master. Acá están las piezas PURAS: de dónde sale el mail, qué id de
   club se propone y a qué pases les toca el aviso de hoy.
   -------------------------------------------------------------------- */

const PLANES_CONVERSION = ['BRONCE', 'PLATA', 'ORO'];
const DIAS_AVISO_CORTESIA = 2;

/** El mail del DT: el del alta del pase y, si no, el último que dejó al
    canjear. Sin mail no hay bienvenida ni aviso: el modal lo pide. */
function emailDelPase(pase) {
  const p = pase || {};
  const inv = normalizarEmail((p.invitado || {}).email);
  if (inv) return inv;
  const lista = (Array.isArray(p.contactos) ? p.contactos : []).slice()
    .sort((a, b) => String((b && b.ultimoIngreso) || '').localeCompare(String((a && a.ultimoIngreso) || '')));
  const c = lista.find(x => x && normalizarEmail(x.email));
  return c ? normalizarEmail(c.email) : '';
}

/** El nombre de quien se saluda: el invitado del pase, o el que canjeó. */
function nombreDelPase(pase) {
  const p = pase || {};
  return textoCorto((p.invitado || {}).nombre, 80)
    || textoCorto(((Array.isArray(p.contactos) ? p.contactos : [])[0] || {}).nombre, 80) || '';
}

/** El id de club que se propone: el equipo sin sufijo, en minúsculas y sin
    acentos. El admin lo puede cambiar; el servidor lo valida igual. */
function idClubSugerido(equipo) {
  return equipoLegible(equipo).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Lo que el alta del catálogo necesita, armado desde el pase. PURO. */
function datosDeConversion(pase, pedido) {
  const p = pase || {};
  const b = pedido || {};
  const plan = String(b.plan || PLAN).trim().toUpperCase();
  if (PLANES_CONVERSION.indexOf(plan) === -1) return { ok: false, codigo: 'PLAN', mensaje: 'El plan va ' + PLANES_CONVERSION.join(', ') + '.' };
  const email = normalizarEmail(b.email) || emailDelPase(p);
  if (!email) return { ok: false, codigo: 'EMAIL', mensaje: 'Falta el mail del entrenador: la bienvenida con sus credenciales sale a ese mail.' };
  const club = String(b.club || idClubSugerido(p.equipo)).trim().toLowerCase();
  if (!SLUG.test(club)) return { ok: false, codigo: 'CLUB', mensaje: 'El id del club va en minúsculas, sin espacios ni acentos.' };
  const categoria = String(b.categoria || (club + '-' + p.zona)).trim().toLowerCase();
  if (!SLUG.test(categoria)) return { ok: false, codigo: 'CATEGORIA', mensaje: 'El id de la categoría va en minúsculas, sin espacios ni acentos.' };
  const zl = p.zonaLabel && p.zonaLabel !== p.torneoNombre ? ' · ' + p.zonaLabel : '';
  return { ok: true, datos: {
    club: club,
    categoria: categoria,
    nombre: textoCorto(b.nombreClub, 80) || equipoLegible(p.equipo),
    label: textoCorto(b.label, 80) || ((p.torneoNombre || p.torneo) + zl),
    libroDe: p.torneo + '/' + p.zona,
    equipoPropio: p.equipo,
    plan: plan,
    vence: b.vence ? String(b.vence).slice(0, 10) : undefined,
  }, email: email, contacto: nombreDelPase(p), whatsapp: (p.invitado || {}).whatsapp || '' };
}

/** El pase después de convertir. Queda el registro: es la historia del lead. */
function marcarConvertido(pase, conv, opciones) {
  return Object.assign({}, pase, { estado: 'convertido', convertido: Object.assign({
    fecha: ahoraDe(opciones).toISOString() }, conv || {}) });
}

/** El id del reclamo del aviso: lleva el vencimiento, así extender lo rearma. */
function idAvisoD2(pase) {
  return 'cortesia|' + pase.id + '|d2@' + String(pase.vence || '').slice(0, 10);
}

/**
 * A QUÉ PASES LES TOCA HOY EL AVISO DEL DÍA -2. PURO.
 * Solo los activos con dos días por delante, con mail y sin el aviso ya
 * mandado para ESE vencimiento (extender el pase mueve la fecha y lo rearma).
 */
function planificarAvisosD2(pases, opciones) {
  const avisos = [], omitidos = [];
  Object.keys(pases || {}).forEach(k => {
    const p = pases[k];
    if (!p || !ID.test(String(p.id || ''))) return;
    if (estadoEfectivo(p, opciones) !== 'activo') return;
    if (diasEntre(ahoraDe(opciones), p.vence) !== DIAS_AVISO_CORTESIA) return;
    const para = emailDelPase(p);
    if (!para) return omitidos.push({ id: p.id, motivo: 'el pase no tiene mail' });
    if (p.avisoD2 && p.avisoD2.vence === p.vence) return omitidos.push({ id: p.id, motivo: 'ya enviado' });
    avisos.push({ id: p.id, para: para, vence: p.vence, idHito: idAvisoD2(p) });
  });
  return { avisos: avisos, omitidos: omitidos };
}

module.exports = {
  PLANES_CONVERSION, DIAS_AVISO_CORTESIA, emailDelPase, nombreDelPase, idClubSugerido, datosDeConversion,
  marcarConvertido, idAvisoD2, planificarAvisosD2,
  CLAVE, PLAN, DOMINIO, DIAS_RAPIDOS, DIAS_MIN, DIAS_MAX, TOKEN_MAX_SEG, MAX_CONTACTOS, ESTADOS, PANEL_URL,
  huella, nuevoCodigo, emailDelToken, normalizarWhatsapp, normalizarContacto, normalizarDias, venceDe,
  armar, estadoEfectivo, vigente, diasRestantes, segundosDeToken, registrarCanje, paraAdmin, paraPuerta,
  linkDelPase, mensajeInvitacion, urlWhatsapp, equipoLegible, fechaCorta, rutaPermitida,
  leer, listar, guardar, porCodigo,
  CLAVE_SOLICITUDES, CLAVE_ACTIVIDAD, MAX_PENDIENTES, ESTADOS_SOLICITUD,
  normalizarSolicitud, sumarSolicitud, leerSolicitud, listarSolicitudes, guardarSolicitud,
  normalizarEventos, sumarActividad, leerActividad, listarActividad, guardarActividad,
};
