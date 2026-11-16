/* =====================================================================
   /api/cron/agenda?clave=<AGENDA_KEY> · el feed de eventos de la agenda

   POR QUÉ EXISTE. Los eventos que crea la Service Account viven en un
   calendario ajeno al del usuario y sus recordatorios son de ELLA: al
   dueño del calendario no le suena nada en el celular. Lo que sí suena es
   un evento creado DENTRO de su propia cuenta (lo que hacía el script
   viejo con CalendarApp.getDefaultCalendar()). Esta ruta entrega la lista
   de eventos que corresponden y un Apps Script del usuario (agenda-script/)
   los crea en su calendario, con popup.

   Entrega, para cada evento: id estable, título, descripción, inicio, fin
   y minutos de recordatorio. NO escribe nada: solo lee y planifica.

   Qué incluye:
     · torneos con ingesta (perfiles de alertas-partidos.js): el aviso de
       -4 días para mandar el scouting y el evento del día de partido
     · torneos sin ingesta (carga manual): lo que se juega hoy y la
       checklist de lo jugado ayer

   Se autentica con una clave propia (AGENDA_KEY) en la query: el Apps
   Script no puede firmar un JWT, y la ruta solo lee datos públicos de
   fixture (los mismos de la web de la liga). Sin la variable, no corre.
   ===================================================================== */
'use strict';

const alertas = require('../lib/alertas-partidos.js');
const carga = require('../lib/carga-manual.js');
const { partidosDe } = require('./alertas-partidos.js');
const { leerGrupos } = require('./carga-manual.js');
const { mismoSecreto } = require('./mails.js');

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

function aFeed(ev, origen) {
  return {
    id: ev.id, origen: origen, titulo: ev.summary, descripcion: ev.description || '',
    inicio: ev.inicio, fin: ev.fin, recordatorios: ev.recordatorios || [0],
  };
}

async function manejarAgenda(peticion, deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const clave = env.AGENDA_KEY || '';
  if (!clave) return error(503, 'SIN_AGENDA_KEY', 'AGENDA_KEY no está configurada: la ruta no se habilita sin ella.');
  const dada = String(((peticion && peticion.query) || {}).clave || '');
  if (!dada || !mismoSecreto(dada, clave)) return error(401, 'CLAVE', 'Falta la clave de la agenda.');

  const eventos = [];
  const avisos = [];

  /* Torneos con ingesta: aviso de -4 días y día de partido. */
  for (const perfil of alertas.PERFILES) {
    try {
      const { partidos } = await partidosDe(perfil, d);
      const plan = alertas.planificar(partidos, perfil, d.ahora);
      plan.alertas.forEach(a => eventos.push(aFeed(a, perfil.id)));
    } catch (e) { avisos.push({ perfil: perfil.id, mensaje: e.message }); }
  }

  /* Torneos sin ingesta: la previa de hoy y la checklist de ayer. Una zona
     que no se pudo leer no se toma por «sin partidos»: se avisa y no se
     emite ese evento (uno incompleto engaña más que ninguno). */
  try {
    const { grupos, fallaron } = await leerGrupos(d);
    if (fallaron.length) avisos.push({ perfil: 'carga-manual', mensaje: 'Faltó leer ' + fallaron.length + ' zona(s).' });
    if (grupos.length && !fallaron.length) {
      [carga.planificarPrevia(grupos, d.ahora), carga.planificarControl(grupos, d.ahora)].forEach((p) => {
        if (!p.evento) return;
        const ev = alertas.correrSiTarde(p.evento, d.ahora, carga.FLUJOS[p.evento.flujo].duracionMin);
        if (!ev.atrasado) eventos.push(aFeed(ev, 'carga-manual'));
      });
    }
  } catch (e) { avisos.push({ perfil: 'carga-manual', mensaje: e.message }); }

  /* ?origen=jujuy o ?origen=carga-manual (o varios, separados por coma):
     cada cuenta pide solo lo suyo. Sin el parámetro, todo. */
  const pedido = String(((peticion && peticion.query) || {}).origen || '').split(',').map(x => x.trim()).filter(Boolean);
  const salida = pedido.length ? eventos.filter(e => pedido.indexOf(e.origen) >= 0) : eventos;
  return { status: 200, body: { ok: true, hoy: alertas.hoyAR(d.ahora), cantidad: salida.length, eventos: salida, avisos: avisos } };
}

module.exports = { manejarAgenda };
