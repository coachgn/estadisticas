/* =====================================================================
   /api/cron/carga-manual?flujo=previa|control · la doble alerta de carga

   Dos crons en vercel.json: la previa a las 12:00 AR (evento 12:30 con
   los partidos de HOY) y el control a las 07:00 AR (evento 07:30 con lo
   jugado ayer y su checklist). Escribe SOLO en TORNEOS_MANUALES_CALENDAR_ID,
   el calendario de motorstats.ar@gmail.com compartido con la Service
   Account. Se autentica como los otros crons (CRON_SECRET o ADMIN).
   `?simular=1` planifica sin tocar Calendar; `?forzar=1` crea el evento
   aunque su horario ya haya pasado (prueba a deshora).

   Una zona que no se pudo leer NO se toma por «sin partidos»: con alguna
   caída no se emite el aviso (uno incompleto engaña más que ninguno) y
   sin ninguna lectura tampoco se toca el calendario.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const alertas = require('../lib/alertas-partidos.js');
const carga = require('../lib/carga-manual.js');
const calendar = require('../lib/google-calendar.js');
const { partidosDe } = require('./alertas-partidos.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const mailEnvio = require('../lib/mail-envio.js');
const { mismoSecreto } = require('./mails.js');

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

async function leerGrupos(deps) {
  const grupos = [];
  const fallaron = [];
  let torneos = [];
  try { torneos = carga.torneosManuales(await catalogo.cargar(deps)); }
  catch (e) { return { grupos: grupos, fallaron: [{ torneo: '*', mensaje: 'catálogo: ' + e.message }], torneos: [] }; }
  for (const t of torneos) {
    for (const zona of t.zonas) {
      try {
        const r = await partidosDe({ torneo: t.torneo, zona: zona }, deps);
        grupos.push({ torneo: t.etiqueta, zona: zona, partidos: r.partidos, origen: r.origen });
      } catch (e) { fallaron.push({ torneo: t.torneo, zona: zona, mensaje: e.message }); }
    }
  }
  return { grupos: grupos, fallaron: fallaron, torneos: torneos.map(t => t.torneo) };
}

/** Complemento del calendario: el mismo aviso por mail. Un fallo acá NO tumba
 *  la corrida (el evento ya está) pero se informa. */
async function avisarPorMail(ev, d, env) {
  const para = carga.destinosMail(env);
  const m = carga.armarMail(ev);
  const transporte = d.transporte || mailEnvio.transporteSmtp({ env: env });
  const enviados = [];
  const errores = [];
  for (const a of para) {
    try { await transporte.enviar({ para: a, asunto: m.asunto, html: m.html, texto: m.texto }); enviados.push(a); }
    catch (e) { errores.push({ para: a, codigo: e.codigo || 'ERROR', mensaje: e.message }); }
  }
  return { enviado: enviados.length > 0, para: enviados, errores: errores };
}

async function manejarCronCargaManual(peticion, deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const secreto = env.CRON_SECRET || '';
  const enc = String(((peticion && peticion.headers) || {}).authorization || '');
  if (!(secreto && mismoSecreto(enc.replace(/^Bearer\s+/i, ''), secreto))) {
    const v = verificarToken(tokenDeLaPeticion(peticion));
    if (!v.ok || v.rol !== AUTH.ROLES.ADMIN) {
      return secreto ? error(401, 'CRON', 'Falta el secreto del cron.')
        : error(503, 'SIN_CRON_SECRET', 'CRON_SECRET no está configurado: la corrida no se habilita sin él.');
    }
  }
  const q = (peticion && peticion.query) || {};
  const flujo = String(q.flujo || '').toLowerCase();
  if (flujo !== 'previa' && flujo !== 'control') return error(400, 'FLUJO', 'flujo debe ser «previa» o «control».');
  const simular = ['1', 'true'].indexOf(String(q.simular || '').toLowerCase()) >= 0;
  const forzar = ['1', 'true'].indexOf(String(q.forzar || '').toLowerCase()) >= 0;
  const calendarId = env.TORNEOS_MANUALES_CALENDAR_ID || '';
  if (!calendarId && !simular) return error(503, 'SIN_CALENDARIO', 'TORNEOS_MANUALES_CALENDAR_ID no está configurado.');

  const { grupos, fallaron, torneos } = await leerGrupos(Object.assign({}, d, { simular: simular }));
  if (!grupos.length) {
    return { status: 502, body: { ok: false, codigo: 'FIXTURE', torneos: torneos, fallaron: fallaron,
      mensaje: torneos.length ? 'No se pudo leer ningún fixture; el calendario no se toca.'
        : 'No hay torneos manuales (con fixture y sin play-by-play) en el catálogo.' } };
  }

  const plan = flujo === 'previa' ? carga.planificarPrevia(grupos, d.ahora) : carga.planificarControl(grupos, d.ahora);
  const base = { flujo: flujo, calendario: calendarId || null, hoy: alertas.hoyAR(d.ahora), fechaRevisada: plan.fecha,
    cantidad: plan.cantidad, torneos: torneos, zonasLeidas: grupos.length, fallaron: fallaron, simulacion: simular };
  if (!plan.evento) return { status: 200, body: Object.assign({ ok: true, evento: null, motivo: 'Sin partidos para ese día.' }, base) };
  const ev = plan.evento;
  if (simular) {
    return { status: 200, body: Object.assign({ ok: true, evento: { summary: ev.summary, inicio: ev.inicio,
      id: ev.id, atrasado: ev.atrasado, descripcion: ev.description } }, base) };
  }
  if (fallaron.length) {
    return { status: 502, body: Object.assign({ ok: false, codigo: 'LECTURA_INCOMPLETA',
      mensaje: 'Faltó leer ' + fallaron.length + ' zona(s): no se emite un aviso incompleto.' }, base) };
  }
  if (ev.atrasado && !forzar) {
    return { status: 200, body: Object.assign({ ok: true, evento: null,
      motivo: 'El horario del aviso (' + ev.inicio + ') ya pasó.' }, base) };
  }
  try {
    const r = await (d.calendario || calendar).asegurarEvento(calendarId, ev, d);
    /* El mail sale al crear o corregir el evento (o forzado), no cuando el cron
       lo encuentra igual: correr dos veces no duplica el aviso. */
    const mail = (r === 'creado' || r === 'actualizado' || forzar) ? await avisarPorMail(ev, d, env) : { enviado: false, motivo: 'evento sin cambios' };
    return { status: 200, body: Object.assign({ ok: true, resultado: r, mail: mail, evento: { summary: ev.summary, inicio: ev.inicio } }, base) };
  } catch (e) {
    return { status: 502, body: Object.assign({ ok: false, codigo: e.codigo || 'ERROR', mensaje: e.message }, base) };
  }
}

module.exports = { manejarCronCargaManual, avisarPorMail };
