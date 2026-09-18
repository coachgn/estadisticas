/* =====================================================================
   LOS AVISOS DE VENCIMIENTO · 5, 3 y 1 día antes, y la bienvenida

   `planificar()` es PURO: recibe el catálogo, las fichas y la fecha de hoy
   y devuelve QUÉ corresponde mandar. `ejecutar()` lo hace: reclama cada
   aviso (atómico, ver `fichas.js`), manda y anota. Separados para poder
   probar la lógica de fechas sin Upstash ni Gmail, y para que el
   simulador del CLI muestre exactamente lo que el cron haría.

   HOY ES LA FECHA DE ARGENTINA, no la del servidor. Vercel corre en UTC:
   a las 22 hs de acá ya es mañana allá, y un aviso de «faltan 3 días»
   saldría con uno de menos. El corte también es a las 23:59 hs de
   Argentina (`AUTH.suscripcionVencida`), así que los dos relojes son el
   mismo.

   QUIÉN RECIBE: una categoría CON ACCESO (activa o en prueba, con la
   cascada del punto 60), con fecha de vencimiento y con una ficha que
   tenga mail. Una pausada o dada de baja no recibe recordatorios de algo
   que ya no tiene. La fecha es la que RIGE —la más cercana entre la del
   club y la de la categoría—, que es la que corta el servicio.

   SOLO LOS DÍAS EXACTOS 5, 3 y 1. Si el cron no corre un día, ese aviso
   no se recupera con otro texto: un «faltan 3 días» mandado cuando faltan
   2 dice algo falso. El siguiente aviso sale en su día.
   ===================================================================== */
'use strict';

const AUTH = require('./compartido/sgadd-auth.js');
const fichas = require('./fichas.js');
const P = require('./mail-plantillas.js');

const DIA_MS = 86400000;
/* Argentina no tiene horario de verano desde 2009: el desfasaje es fijo. */
const DESFASAJE_AR_MS = 3 * 3600000;

/** La fecha de hoy en Argentina, AAAA-MM-DD. */
function hoyAR(ahora) {
  const t = ahora === undefined ? Date.now() : ahora;
  return new Date(t - DESFASAJE_AR_MS).toISOString().slice(0, 10);
}

/** Días enteros de `desde` a `hasta` (las dos AAAA-MM-DD). */
function diasEntre(desde, hasta) {
  const a = Date.parse(String(desde) + 'T00:00:00Z');
  const b = Date.parse(String(hasta) + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / DIA_MS);
}

function urlPanel(clubId, base) {
  return (base || P.PANEL_URL) + '?club=' + encodeURIComponent(clubId);
}

/**
 * Lo que un mail necesita saber de un cliente, leído del CATÁLOGO en el
 * momento (ver `fichas.js`: la ficha no copia el plan ni el vencimiento).
 */
function datosCliente(catalogo, clubId, slug, ficha, extras) {
  const x = extras || {};
  const club = (catalogo || {})[clubId] || {};
  const cat = (club.categorias || {})[slug] || {};
  const sus = AUTH.suscripcionDeCategoria(club, slug, x.ahora);
  const f = ficha || {};
  return {
    clubId: clubId,
    slug: slug,
    club: club.nombre || clubId,
    categoria: cat.label || slug,
    contacto: f.contacto || '',
    para: f.email || '',
    /* Sin plan declarado en el catálogo de KV, el servidor sirve BRONCE
       (punto 55): el mail dice lo mismo que el panel. */
    plan: sus.plan || AUTH.PLANES.BRONCE,
    vence: sus.vence || '',
    acceso: sus.acceso,
    estado: sus.estado,
    renovacion: f.renovacion || 'mensual',
    url: urlPanel(clubId, x.panelUrl),
  };
}

/**
 * El balance de uso del aviso de 5 días. Solo lo que el servidor SABE:
 * días desde el alta, accesos habilitados contra el cupo, el último
 * ingreso y, en ORO, los informes entregados. Nada estimado.
 */
function balance(catalogo, clubId, slug, ficha, padron, hoy, ahora) {
  const club = (catalogo || {})[clubId] || {};
  const out = {};
  if (ficha && ficha.fechaAlta) {
    const d = diasEntre(ficha.fechaAlta, hoy);
    if (d !== null && d >= 0) out.diasDeServicio = d;
  }
  if (padron) {
    const accesos = Object.keys(padron).filter(e => String((padron[e] || {}).club || '').toLowerCase() === clubId);
    out.accesos = accesos.length;
    out.cupo = AUTH.cupoDeMails(AUTH.planDelClub(club, ahora) || AUTH.PLANES.BRONCE);
    const ultimos = accesos.map(e => padron[e].ultimoIngreso).filter(Boolean).sort();
    if (ultimos.length) out.ultimoIngreso = String(ultimos[ultimos.length - 1]).slice(0, 10);
  }
  const sus = AUTH.suscripcionDeCategoria(club, slug, ahora);
  if (sus.plan === AUTH.PLANES.ORO && AUTH.cicloDeCategoria) {
    out.informesEntregados = AUTH.cicloDeCategoria(club, slug).informesEntregados;
  }
  return out;
}

/**
 * QUÉ CORRESPONDE MANDAR HOY. PURO.
 * @returns {Array<{clubId, slug, hito, dias, vence, para, idHito}>} y los
 *   descartados con su motivo en `omitidos`, para que el reporte diga por
 *   qué alguien no recibió nada.
 */
function planificar(catalogo, todasLasFichas, hoy, ahora) {
  const avisos = [];
  const omitidos = [];
  Object.keys(catalogo || {}).forEach((clubId) => {
    const club = catalogo[clubId] || {};
    Object.keys(club.categorias || {}).forEach((slug) => {
      const ficha = (todasLasFichas || {})[fichas.campoDe(clubId, slug)] || null;
      const d = datosCliente(catalogo, clubId, slug, ficha, { ahora: ahora });
      const base = { clubId: clubId, slug: slug };
      if (!d.acceso) return omitidos.push(Object.assign(base, { motivo: 'sin acceso (' + d.estado + ')' }));
      if (!d.vence) return omitidos.push(Object.assign(base, { motivo: 'sin fecha de vencimiento' }));
      const dias = diasEntre(hoy, d.vence);
      if (P.DIAS_AVISO.indexOf(dias) === -1) return;   // hoy no le toca nada: no es un omitido
      const hito = 'recordatorio_' + dias + 'd';
      if (!d.para) return omitidos.push(Object.assign(base, { hito: hito, motivo: 'la ficha no tiene mail' }));
      if (fichas.yaEnviado(ficha, hito, d.vence)) return omitidos.push(Object.assign(base, { hito: hito, motivo: 'ya enviado' }));
      avisos.push(Object.assign(base, { hito: hito, dias: dias, vence: d.vence, para: d.para,
        idHito: fichas.idHito(clubId, slug, hito, d.vence) }));
    });
  });
  return { hoy: hoy, avisos: avisos, omitidos: omitidos };
}

/**
 * Reclama, manda y anota UN aviso. Si el envío falla, libera el reclamo:
 * sale en la corrida siguiente. Devuelve el resultado para el reporte.
 */
async function despachar(aviso, armarMail, deps) {
  const gano = await fichas.reclamar(aviso.idHito, deps);
  if (!gano) return Object.assign({}, aviso, { resultado: 'ya reclamado por otra corrida' });
  let mail;
  try {
    mail = armarMail();
    await deps.transporte.enviar({ para: aviso.para, asunto: mail.asunto, html: mail.html, texto: mail.texto });
  } catch (e) {
    await fichas.liberar(aviso.idHito, deps).catch(() => {});
    return Object.assign({}, aviso, { resultado: 'error', codigo: e.codigo || 'ERROR', mensaje: e.message });
  }
  const registro = { hito: aviso.hito, enviado: new Date(deps.ahora === undefined ? Date.now() : deps.ahora).toISOString(), para: aviso.para };
  if (aviso.hito !== 'bienvenida') registro.vence = aviso.vence;
  await fichas.anotarEnviado(aviso.clubId, aviso.slug, registro, deps);
  return Object.assign({}, aviso, { resultado: 'enviado', asunto: mail.asunto });
}

/**
 * LA CORRIDA DEL CRON.
 * @param {{kv?, transporte, catalogo?, padron?, ahora?, panelUrl?}} deps
 *   `catalogo` y `padron` se pueden inyectar (el simulador); si no, se leen.
 */
async function ejecutar(deps) {
  const d = deps || {};
  const ahora = d.ahora === undefined ? Date.now() : d.ahora;
  const hoy = hoyAR(ahora);
  const catalogo = d.catalogo || (await require('./catalogo.js').cargarParaEscribir(d)).catalogo;
  const todas = await fichas.leerTodas(d);
  let padron = d.padron;
  if (padron === undefined) {
    try { padron = await require('./clientes.js').cargar(d); } catch (e) { padron = null; }
  }
  const plan = planificar(catalogo, todas, hoy, ahora);
  const resultados = [];
  for (const aviso of plan.avisos) {
    const ficha = todas[fichas.campoDe(aviso.clubId, aviso.slug)] || {};
    const datos = datosCliente(catalogo, aviso.clubId, aviso.slug, ficha, { ahora: ahora, panelUrl: d.panelUrl });
    if (aviso.dias === 5) datos.balance = balance(catalogo, aviso.clubId, aviso.slug, ficha, padron, hoy, ahora);
    resultados.push(await despachar(aviso, () => P.recordatorio(datos, aviso.dias), Object.assign({}, d, { ahora: ahora })));
  }
  return {
    hoy: hoy,
    enviados: resultados.filter(r => r.resultado === 'enviado').length,
    errores: resultados.filter(r => r.resultado === 'error').length,
    resultados: resultados,
    omitidos: plan.omitidos,
  };
}

/**
 * LA BIENVENIDA de una categoría. Una sola vez: si ya salió, no se repite
 * aunque se vuelva a guardar la ficha (para eso está `forzar`, que usa el
 * botón «Reenviar bienvenida» del Panel Master).
 */
async function enviarBienvenida(clubId, slug, deps) {
  const d = deps || {};
  const catalogo = d.catalogo || (await require('./catalogo.js').cargarParaEscribir(d)).catalogo;
  const ficha = (await fichas.leer(clubId, slug, d)) || {};
  const datos = datosCliente(catalogo, clubId, slug, ficha, { ahora: d.ahora, panelUrl: d.panelUrl });
  /* EL ACCESO VIAJA EN EL MAIL (`invitacion`): el alta o la reinvitación
     acaban de generar el código y va adentro, con el link que abre el
     panel directo en «Tengo un código». `para` pisa el mail de la ficha:
     una invitación desde «Quiénes pueden entrar» va a ESE mail, que puede
     no ser el institucional. */
  if (d.para) datos.para = String(d.para).trim();
  if (d.invitacion) datos.invitacion = d.invitacion;
  const base = { clubId: clubId, slug: slug, hito: 'bienvenida', para: datos.para };
  if (!datos.para) return Object.assign(base, { resultado: 'omitido', mensaje: 'La ficha no tiene mail institucional.' });
  if (!d.forzar && fichas.yaEnviado(ficha, 'bienvenida')) {
    return Object.assign(base, { resultado: 'omitido', mensaje: 'La bienvenida ya se había mandado.' });
  }
  /* Forzar un reenvío necesita un reclamo nuevo: el id lleva la hora. */
  const idHito = fichas.idHito(clubId, slug, 'bienvenida') + (d.forzar ? '#' + Date.now() : '');
  return despachar(Object.assign(base, { idHito: idHito }), () => P.bienvenida(datos), d);
}

module.exports = {
  DESFASAJE_AR_MS, hoyAR, diasEntre, urlPanel, datosCliente, balance, planificar, despachar, ejecutar, enviarBienvenida,
};
