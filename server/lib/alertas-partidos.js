/* =====================================================================
   ALERTAS DE PARTIDO · un recordatorio en el celular 4 días antes

   Para que nadie tenga que revisar el fixture a mano: por cada partido
   PROGRAMADO del equipo, se deja en el Google Calendar del usuario un
   evento de 30 min a las 09:00 (Argentina) del día `fecha − 4`, con
   un popup a la hora exacta. La app de Calendar lo convierte en push.

   `planificar()` es PURO: entra la lista de partidos y «ahora», salen las
   alertas que corresponden. `ejecutar()` las asegura contra Calendar. Así
   las fechas se prueban sin red, igual que `cron-vencimientos.js`.

   ---------------------------------------------------------------------
   LAS DECISIONES

   · LA CLAVE DEL PARTIDO ES LOCAL|VISITANTE, SIN LA FECHA. En una liga de
     ida y vuelta cada cruce se juega dos veces pero con la localía
     invertida, así que el par ordenado identifica el partido. Si la
     clave llevara la fecha, una reprogramación dejaría la alerta vieja
     en el calendario y crearía otra. Sin ella, el mismo id se CORRIGE.

   · EL ID DEL EVENTO ES UN HASH DE ESA CLAVE (hex, que es base32hex
     válido). Google rechaza un id repetido con 409: la idempotencia la
     pone Google, no una tabla propia que pueda desincronizarse.

   · LA HORA ES LA DE ARGENTINA (UTC−3 fijo, sin horario de verano). La
     alerta se escribe con su offset y su zona: Vercel corre en UTC y una
     hora «ingenua» saldría tres horas corrida.

   · UNA ALERTA CUYO MOMENTO YA PASÓ NO SE CREA (un popup en el pasado no
     avisa nada): se informa como `atrasada`, para que se vea que se
     enteró tarde de ese partido en vez de callarlo.

   · SOLO PARTIDOS SIN MARCADOR Y DE HOY EN ADELANTE. Lo jugado o en curso
     no se alerta.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const CORE = require('./compartido/sgadd-core.js');

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_MS = 86400000;
const DESFASAJE_AR_MS = 3 * 3600000;

/* El perfil es un dato: sumar otro equipo o torneo es sumar una entrada. */
const PERFILES = [{
  id: 'jujuy',
  etiqueta: 'Jujuy Básquet',
  torneo: 'liga-argentina-2026-27',
  zona: 'norte',
  patron: /JUJUY/,
  anticipoDias: 4,
  hora: '09:00',
  duracionMin: 30,
  /* A quién le llega: el calendario del usuario, compartido con la Service
     Account. Se puede pisar con ALERTAS_CALENDAR_ID sin tocar el código. */
  calendarId: 'freytesgn@gmail.com',
  /* Solo si el catálogo no declara la fuente del fixture de este torneo
     (se pega en el Panel Master). Es el mismo lector que usa el panel. */
  fuenteRespaldo: { adaptador: 'auto',
    zonas: { norte: 'https://www.laliganacional.com.ar/laligaargentina/fixture' } },
}];

function hoyAR(ahoraMs) {
  const t = ahoraMs === undefined ? Date.now() : ahoraMs;
  return new Date(t - DESFASAJE_AR_MS).toISOString().slice(0, 10);
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** AAAA-MM-DD menos N días, sin pasar por la zona horaria del servidor. */
function restarDias(fecha, n) {
  const m = FECHA.exec(String(fecha || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) - n * DIA_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** El instante de «fecha a las hh:mm hora de Argentina», en ms UTC. */
function instanteAR(fecha, hhmm) {
  const m = FECHA.exec(String(fecha || ''));
  const h = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || !h) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +h[1], +h[2]) + DESFASAJE_AR_MS;
}

function sumarMin(hhmm, min) {
  const h = /^(\d{2}):(\d{2})$/.exec(hhmm);
  const total = (+h[1]) * 60 + (+h[2]) + min;
  const p = n => String(n).padStart(2, '0');
  return p(Math.floor(total / 60) % 24) + ':' + p(total % 60);
}

function claveDelPartido(p) {
  return CORE.claveEquipo(p.local) + '|' + CORE.claveEquipo(p.visitante);
}

function idDeEvento(perfil, p) {
  return 'sg' + crypto.createHash('sha1')
    .update(perfil.id + '|' + perfil.torneo + '|' + claveDelPartido(p)).digest('hex').slice(0, 30);
}

function esDelEquipo(p, perfil) {
  return perfil.patron.test(CORE.claveEquipo(p.local)) || perfil.patron.test(CORE.claveEquipo(p.visitante));
}

/**
 * Las alertas que corresponden hoy.
 *
 * @returns {{alertas: object[], atrasadas: object[], descartados: number}}
 */
function planificar(partidos, perfil, ahoraMs) {
  const ahora = ahoraMs === undefined ? Date.now() : ahoraMs;
  const hoy = hoyAR(ahora);
  const vistos = {};
  const alertas = [];
  const atrasadas = [];
  let descartados = 0;

  (partidos || []).forEach((p) => {
    if (!p || !esDelEquipo(p, perfil)) return;
    if (p.ptsLocal != null || p.ptsVisitante != null) { descartados++; return; }
    if (p.estado && p.estado !== 'PROGRAMADO') { descartados++; return; }
    if (!FECHA.test(String(p.fecha || '')) || p.fecha < hoy) { descartados++; return; }
    const k = claveDelPartido(p);
    // El mismo cruce no puede salir dos veces (el fixture a veces lo repite).
    if (vistos[k]) { descartados++; return; }
    vistos[k] = true;

    const diaAlerta = restarDias(p.fecha, perfil.anticipoDias);
    const t = instanteAR(diaAlerta, perfil.hora);
    const rival = perfil.patron.test(CORE.claveEquipo(p.local)) ? p.visitante : p.local;
    const condicion = perfil.patron.test(CORE.claveEquipo(p.local)) ? 'local' : 'visitante';
    const horaPartido = p.hora ? ' · ' + p.hora + ' hs' : '';
    const alerta = {
      clave: k,
      id: idDeEvento(perfil, p),
      partido: p.local + ' vs. ' + p.visitante,
      fechaPartido: p.fecha,
      horaPartido: p.hora || null,
      diaAlerta: diaAlerta,
      inicio: diaAlerta + 'T' + perfil.hora + ':00-03:00',
      fin: diaAlerta + 'T' + sumarMin(perfil.hora, perfil.duracionMin) + ':00-03:00',
      zona: ZONA,
      summary: '🏀 En ' + perfil.anticipoDias + ' días: ' + p.local + ' vs. ' + p.visitante,
      description: 'Partido de ' + perfil.etiqueta + ' (' + condicion + ') contra ' + rival
        + '.\nFecha: ' + p.fecha + horaPartido
        + (p.sede ? '\nSede: ' + p.sede : '')
        + '\n\nAlerta automática de MotorStats, ' + perfil.anticipoDias + ' días antes.',
      recordatorios: [0],
      privadas: { sgadd: 'alerta-partido', perfil: perfil.id, partido: k },
    };
    if (t === null || t <= ahora) { atrasadas.push(alerta); return; }
    alertas.push(alerta);
  });

  const porFecha = (a, b) => (a.fechaPartido < b.fechaPartido ? -1 : a.fechaPartido > b.fechaPartido ? 1 : 0);
  alertas.sort(porFecha);
  atrasadas.sort(porFecha);
  return { alertas: alertas, atrasadas: atrasadas, descartados: descartados };
}

/**
 * Asegura cada alerta en el calendario. Una que falla no frena a las
 * demás, salvo que el problema sea de todas (credencial o permiso): ahí se
 * corta y se dice, para no repetir el mismo rechazo cuarenta veces.
 */
async function ejecutar(perfil, partidos, deps) {
  const d = deps || {};
  const calendario = d.calendario;
  const plan = planificar(partidos, perfil, d.ahora);
  const atrasadasDe = () => plan.atrasadas.map(a => ({ partido: a.partido, fecha: a.fechaPartido, debioAvisarEl: a.diaAlerta }));
  /* SIMULAR: se planifica y se muestra, sin tocar Calendar ni pedir
     credenciales. Es la primera mirada antes de escribir en un calendario. */
  if (d.simular) {
    return {
      perfil: perfil.id, calendario: perfil.calendarId, hoy: hoyAR(d.ahora), simulacion: true,
      candidatas: plan.alertas.length,
      alertas: plan.alertas.map(a => ({ partido: a.partido, fecha: a.fechaPartido, hora: a.horaPartido,
        avisaEl: a.inicio, id: a.id })),
      atrasadas: atrasadasDe(), descartados: plan.descartados, errores: [],
    };
  }
  const resumen = { creadas: 0, actualizadas: 0, iguales: 0, borradasPorElUsuario: 0 };
  const errores = [];
  const claves = { creado: 'creadas', actualizado: 'actualizadas', igual: 'iguales', borrado: 'borradasPorElUsuario' };

  for (const a of plan.alertas) {
    try {
      const r = await calendario.asegurarEvento(perfil.calendarId, a, d);
      resumen[claves[r]]++;
    } catch (e) {
      errores.push({ partido: a.partido, codigo: e.codigo || 'ERROR', mensaje: e.message });
      if (['SIN_CREDENCIALES', 'AUTH_GOOGLE', 'CALENDARIO_NO_COMPARTIDO', 'CALENDAR_API_APAGADA',
        'SIN_PERMISO_CALENDARIO'].indexOf(e.codigo) >= 0) break;
    }
  }
  return {
    perfil: perfil.id, calendario: perfil.calendarId, hoy: hoyAR(d.ahora),
    candidatas: plan.alertas.length, resumen: resumen,
    atrasadas: atrasadasDe(),
    descartados: plan.descartados, errores: errores,
  };
}

module.exports = { PERFILES, planificar, ejecutar, hoyAR, restarDias, instanteAR, idDeEvento,
  claveDelPartido, esDelEquipo, ZONA };
