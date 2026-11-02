/* =====================================================================
   CARGA MANUAL · la doble alerta diaria de los torneos sin play-by-play

   Donde no hay ingesta automática alguien tiene que cargar los partidos
   a mano. Dos eventos en el Google Calendar compartido de MotorStats:

     PREVIA   el mediodía del mismo día (12:30 AR): «partidos a jugarse hoy»,
              con los programados de HOY por torneo y zona.
     CONTROL  la mañana siguiente (07:30 AR): «se jugaron ayer», con una
              checklist de lo que se jugó AYER para cargar.

   `planificarPrevia()` y `planificarControl()` son PUROS (partidos y
   «ahora» adentro, evento afuera). Mismas decisiones que
   `alertas-partidos.js`: id determinista por día (el cron corrido dos
   veces no duplica; una reprogramación corrige el mismo evento), hora
   argentina con su offset y un evento cuyo momento ya pasó no se crea.
   Un día sin partidos NO genera evento: «hay 0» sería ruido diario.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const A = require('./alertas-partidos.js');

/* Qué torneos son manuales SALE DEL CATÁLOGO: todo torneo (tipo «torneo»)
   que declara una fuente de fixture y en el que ninguna zona tiene la capa
   de laboratorio `pbp` (con play-by-play carga la ingesta sola). Un torneo
   nuevo entra sin tocar código. `EXCLUIDOS` saca uno a mano. */
const EXCLUIDOS = [];

/** Las zonas a leer de un torneo: las que declara la fuente del fixture y,
 *  si no, las categorías regulares enganchadas. Una zona de postemporada
 *  (interzonal) no se lee aparte: sus partidos ya vienen en las fuentes. */
function zonasDeTorneo(entrada) {
  const decl = entrada && entrada.fixture && entrada.fixture.zonas;
  const declaradas = decl && typeof decl === 'object' ? Object.keys(decl) : [];
  if (declaradas.length) return declaradas;
  const cats = (entrada && entrada.categorias) || {};
  return Object.keys(cats).map(s => cats[s]).filter(c => c && c.zona && !c.interzonal
    && (!c.rol || c.rol === 'regular')).map(c => c.zona);
}

function torneosManuales(cat) {
  const todo = (cat && cat.catalogo) || {};
  const salida = [];
  Object.keys(todo).forEach((id) => {
    const e = todo[id];
    if (!e || e.tipo !== 'torneo' || EXCLUIDOS.indexOf(id) >= 0 || !e.fixture) return;
    const conPbp = Object.keys(e.categorias || {}).some(s => ((e.categorias[s] || {}).laboratorio || []).indexOf('pbp') >= 0);
    if (conPbp) return;
    const zonas = zonasDeTorneo(e);
    if (zonas.length) salida.push({ torneo: id, etiqueta: e.nombre || id, zonas: zonas });
  });
  return salida;
}

const FLUJOS = {
  previa: { hora: '12:30', duracionMin: 30, recordatorios: [0] },
  control: { hora: '07:30', duracionMin: 30, recordatorios: [0] },
};

/** Los partidos de UNA fecha, agrupados por torneo y zona. */
const ENTIDADES = { ordm: 'º', ordf: 'ª', amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ' };

/** Las páginas de la fuente traen entidades HTML en los nombres («6&ordm;»). */
function limpio(t) {
  return String(t == null ? '' : t)
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&([A-Za-z]+);/g, (m, k) => (ENTIDADES[k] !== undefined ? ENTIDADES[k] : m));
}

/* El MISMO cruce no se repite entre zonas de un torneo: las páginas de
   playoffs/repechaje las comparten y salía tres veces. */
function delDia(grupos, fecha, jugados) {
  const salida = [];
  const vistos = {};
  (grupos || []).forEach((g) => {
    const lista = [];
    (g.partidos || []).forEach((p) => {
      if (!p || p.fecha !== fecha) return;
      const conMarcador = p.ptsLocal != null && p.ptsVisitante != null;
      if (jugados) { if (!conMarcador) return; }
      else if (conMarcador || (p.estado && p.estado !== 'PROGRAMADO')) return;
      const k = (g.torneo || '') + '|' + A.claveDelPartido(p);
      if (vistos[k]) return;
      vistos[k] = true;
      lista.push(p);
    });
    lista.sort((a, b) => (String(a.hora || '99') < String(b.hora || '99') ? -1 : 1));
    if (lista.length) salida.push({ torneo: g.torneo || g.etiqueta, zona: g.zona, partidos: lista });
  });
  return salida;
}

const SEP = '\n\n';

/** AAAA-MM-DD → DD/MM/AA (el formato de TODO texto de los eventos). */
function fechaCorta(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : String(f || '');
}

function total(grupos) { return grupos.reduce((n, g) => n + g.partidos.length, 0); }

function bloque(grupos, linea) {
  return limpio(grupos.map(g => g.torneo + ' · zona ' + String(g.zona).toUpperCase() + ' (' + g.partidos.length + ')\n'
    + g.partidos.map(linea).join('\n')).join('\n\n'));
}

function idDe(flujo, fecha) {
  return 'cm' + crypto.createHash('sha1').update('carga-manual|' + flujo + '|' + fecha).digest('hex').slice(0, 30);
}

function evento(flujo, fecha, resumen, descripcion, cant, ahora) {
  const c = FLUJOS[flujo];
  const t = A.instanteAR(fecha, c.hora);
  return {
    id: idDe(flujo, fecha), flujo: flujo, cantidad: cant, dia: fecha,
    inicio: fecha + 'T' + c.hora + ':00-03:00',
    fin: fecha + 'T' + A.sumarMin(c.hora, c.duracionMin) + ':00-03:00',
    zona: A.ZONA, summary: resumen, description: descripcion,
    recordatorios: c.recordatorios,
    privadas: { sgadd: 'carga-manual', flujo: flujo, dia: fecha },
    atrasado: t === null || t <= ahora,
  };
}

/** Aviso del mediodía de HOY con los partidos programados para HOY. */
function planificarPrevia(grupos, ahoraMs) {
  const ahora = ahoraMs === undefined ? Date.now() : ahoraMs;
  const hoy = A.hoyAR(ahora);
  const g = delDia(grupos, hoy, false);
  const n = total(g);
  if (!n) return { evento: null, cantidad: 0, fecha: hoy };
  const desc = 'Partidos a jugarse hoy ' + fechaCorta(hoy) + ' (torneos sin play-by-play):' + SEP
    + bloque(g, p => '• ' + (p.hora ? p.hora + ' · ' : '') + p.local + ' vs. ' + p.visitante)
    + SEP + 'Aviso automático de MotorStats. Mañana a la mañana llega la checklist para cargarlos.';
  return { evento: evento('previa', hoy, '⚠️ Partidos a jugarse hoy ' + fechaCorta(hoy) + ' (' + n + ')',
    desc, n, ahora), cantidad: n, fecha: hoy };
}

/** Checklist de HOY (07:30) con lo que se jugó AYER. */
function planificarControl(grupos, ahoraMs) {
  const ahora = ahoraMs === undefined ? Date.now() : ahoraMs;
  const hoy = A.hoyAR(ahora);
  const ayer = A.restarDias(hoy, 1);
  const g = delDia(grupos, ayer, true);
  const n = total(g);
  if (!n) return { evento: null, cantidad: 0, fecha: ayer };
  const desc = 'Se jugaron los siguientes partidos ayer ' + fechaCorta(ayer) + '. Resultados a cargar en la plataforma de estadísticas '
    + '(tildá ☑ los que ya cargaste):' + SEP
    + bloque(g, p => '☐ ' + p.local + ' ' + p.ptsLocal + ' - ' + p.ptsVisitante + ' ' + p.visitante)
    + SEP + 'Checklist automática de MotorStats (torneos sin play-by-play).';
  return { evento: evento('control', hoy, '📋 Se jugaron ayer ' + fechaCorta(ayer) + ': cargar resultados (' + n + ')',
    desc, n, ahora), cantidad: n, fecha: ayer };
}

/* El aviso por MAIL (complemento del calendario): el popup de un evento
   creado por una Service Account no es confiable en el celular de quien
   mira el calendario (los recordatorios son por usuario), así que el mismo
   aviso sale también por el mail institucional, que llega como push por la
   app de Gmail apenas corre el cron. */
const DESTINOS_POR_DEFECTO = ['freytesgn@gmail.com'];

function destinosMail(env) {
  const crudo = String((env || {}).CARGA_MANUAL_MAIL_PARA || '').split(/[,;\s]+/).filter(Boolean);
  return crudo.length ? crudo : DESTINOS_POR_DEFECTO.slice();
}

function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function armarMail(ev) {
  const texto = ev.summary + SEP + ev.description;
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">'
    + '<h2 style="margin:0 0 12px">' + esc(ev.summary) + '</h2>'
    + '<div style="white-space:pre-line">' + esc(ev.description) + '</div></div>';
  return { asunto: ev.summary, texto: texto, html: html };
}

module.exports = { torneosManuales, destinosMail, armarMail, DESTINOS_POR_DEFECTO, zonasDeTorneo, EXCLUIDOS, FLUJOS, planificarPrevia, planificarControl, delDia, idDe, fechaCorta };
