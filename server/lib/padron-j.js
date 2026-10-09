/* =====================================================================
   EL PADRÓN DE UN LIBRO (`PADRON J`) → las fichas de Fichajes (2026-10-07)

   Los libros que llegan por la ingesta automática (la LNB, por ahora)
   traen una pestaña `PADRON J`: una fila por jugador y equipo con su
   NACIMIENTO, y PUESTO y TALLA si alguien los cargó. Fichajes la lee
   DIRECTO del libro de la zona, así la edad aparece sin cargar fichas a
   mano.

   LA FICHA MANUAL MANDA, CAMPO POR CAMPO. El padrón solo llena lo que la
   ficha del admin (KV) no trae: si el admin corrigió una fecha o cargó un
   puesto, eso es lo que se ve. Un libro sin `PADRON J` (todos los de hoy
   salvo la LNB) deja las fichas exactamente como estaban.

   LA CLAVE es la de Fichajes: `clavePersona(NOMBRES) | claveEquipo(EQUIPO)`
   del núcleo del panel, así una fila del padrón y una del libro hablan del
   mismo jugador aunque difieran tildes o espacios.

   LAS FECHAS llegan como texto con el formato de la planilla
   (`dateTimeRenderOption=FORMATTED_STRING`): se aceptan AAAA-MM-DD,
   d/m/aaaa (Argentina) y el número de serie de Sheets.
   ===================================================================== */
'use strict';

const SGADD = require('./compartido/sgadd-core.js');
const MERCADO = require('./compartido/sgadd-mercado.js');

const HOJA = 'PADRON J';

/** Una celda de fecha → 'AAAA-MM-DD', o '' si no se reconoce. */
function fechaIso(v) {
  if (v === null || v === undefined || v === '') return '';
  const p2 = (n) => String(n).padStart(2, '0');
  if (typeof v === 'number' && isFinite(v) && v > 0) {
    /* Serie de Sheets: días desde el 30/12/1899. */
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  return '';
}

/**
 * Las fichas que se desprenden de la pestaña, por clave de Fichajes.
 * Un campo que no pasa `normalizarFicha` se descarta solo, sin perder los
 * otros de la misma fila.
 * @param {Array<Array>} valores la pestaña, con el encabezado en la fila 1
 * @returns {{fichas: Object, filas: number, conDatos: number}}
 */
function fichasDelPadron(valores, hoy) {
  const out = { fichas: {}, filas: 0, conDatos: 0 };
  if (!Array.isArray(valores) || valores.length < 2) return out;
  const enc = valores[0].map(c => String(c || '').trim().toUpperCase());
  const col = (n) => enc.indexOf(n);
  const iN = col('NOMBRES'), iE = col('EQUIPO');
  if (iN === -1 || iE === -1) return out;
  valores.slice(1).forEach((f) => {
    const nombre = f[iN], equipo = f[iE];
    if (!String(nombre || '').trim() || !String(equipo || '').trim()) return;
    out.filas++;
    const crudo = {
      nacimiento: col('NACIMIENTO') !== -1 ? fechaIso(f[col('NACIMIENTO')]) : '',
      posicion: col('PUESTO') !== -1 ? String(f[col('PUESTO')] || '').trim() : '',
      talla: col('TALLA') !== -1 ? f[col('TALLA')] : '',
    };
    const ficha = {};
    ['nacimiento', 'posicion', 'talla'].forEach((k) => {
      if (crudo[k] === '' || crudo[k] === null || crudo[k] === undefined) return;
      const una = MERCADO.normalizarFicha({ [k]: crudo[k] }, hoy);
      if (una && !una.error) Object.assign(ficha, una);
    });
    if (!Object.keys(ficha).length) return;
    const clave = SGADD.clavePersona(nombre) + '|' + SGADD.claveEquipo(equipo);
    if (!MERCADO.CLAVE_VALIDA.test(clave)) return;
    out.fichas[clave] = Object.assign(out.fichas[clave] || {}, ficha);
    out.conDatos++;
  });
  return out;
}

/**
 * Las fichas manuales completadas con las del padrón. La manual gana
 * campo por campo; el padrón no borra nada.
 * @returns {{fichas: Object, completadas: number}}
 */
function fusionar(manuales, delPadron) {
  const fichas = Object.assign({}, manuales || {});
  let completadas = 0;
  Object.keys(delPadron || {}).forEach((k) => {
    const antes = fichas[k] || {};
    const despues = Object.assign({}, delPadron[k], antes);
    if (Object.keys(despues).length > Object.keys(antes).length) completadas++;
    fichas[k] = despues;
  });
  return { fichas: fichas, completadas: completadas };
}

/* =====================================================================
   LAS FOTOS DE LOS JUGADORES (punto 95)

   La columna FOTO trae lo que publica la liga: hoy `/fotos/<idJugador>`,
   una ruta RELATIVA al sitio de la fuente. Viaja tal cual y el panel le
   pone la base (`fuente.base` de `torneos/<id>.json`): el servidor no lee
   archivos fuera de `server/` y la base es un dato del torneo, no de acá.

   SOLO PASA LO QUE TIENE FORMA DE FOTO: una ruta `/fotos/<número>` o una
   URL https. Cualquier otra cosa en la celda se descarta, porque termina
   en el `src` de un <img>.

   La clave es la del buzón y del padrón de la liga: `NOMBRES|EQUIPO` tal
   como los escribe el libro, normalizados con el núcleo.
   ===================================================================== */
const FOTO_VALIDA = /^(\/fotos\/\d{1,12}|https:\/\/[^\s"'<>]{1,300})$/;

function claveFoto(nombre, equipo) {
  return SGADD.clavePersona(nombre) + '|' + SGADD.claveEquipo(equipo);
}

/**
 * Las fotos del padrón, por clave de jugador.
 * @param {Array<Array>} valores la pestaña, con el encabezado en la fila 1
 * @returns {Object<string,string>}
 */
function fotosDelPadron(valores) {
  const out = {};
  if (!Array.isArray(valores) || valores.length < 2) return out;
  const enc = valores[0].map(c => String(c || '').trim().toUpperCase());
  const iN = enc.indexOf('NOMBRES'), iE = enc.indexOf('EQUIPO'), iF = enc.indexOf('FOTO');
  if (iN === -1 || iE === -1 || iF === -1) return out;
  valores.slice(1).forEach((f) => {
    const nombre = String(f[iN] || '').trim(), equipo = String(f[iE] || '').trim();
    const foto = String(f[iF] || '').trim();
    if (!nombre || !equipo || !FOTO_VALIDA.test(foto)) return;
    out[claveFoto(nombre, equipo)] = foto;
  });
  return out;
}

/**
 * Los dorsales del padrón, por la misma clave que las fotos (2026-10-08):
 * el panel antepone «#N» al nombre en fichas, rankings, planteles y
 * scouting. PROMEDIOS J no trae el número y `Base Datos J` de un rival
 * llega recortada. Solo pasa un número de 0 a 999: va a un texto, pero
 * nada que no sea un dorsal tiene por qué viajar.
 */
const DORSAL_VALIDO = /^\d{1,3}$/;

function dorsalesDelPadron(valores) {
  const out = {};
  if (!Array.isArray(valores) || valores.length < 2) return out;
  const enc = valores[0].map(c => String(c || '').trim().toUpperCase());
  const iN = enc.indexOf('NOMBRES'), iE = enc.indexOf('EQUIPO'), iD = enc.indexOf('DORSAL');
  if (iN === -1 || iE === -1 || iD === -1) return out;
  valores.slice(1).forEach((f) => {
    const nombre = String(f[iN] || '').trim(), equipo = String(f[iE] || '').trim();
    const d = f[iD] == null ? '' : String(f[iD]).trim();
    if (!nombre || !equipo || !DORSAL_VALIDO.test(d)) return;
    out[claveFoto(nombre, equipo)] = String(Number(d));
  });
  return out;
}

/**
 * Las fotos de los jugadores que VIAJAN en el libro recortado: un rival
 * que el plan saca no manda ni su foto. Se cruza con `PROMEDIOS J`, la
 * misma hoja del padrón de la liga (`reglas.padronLiga`).
 */
function fotosDelLibro(fotos, hojas) {
  const filas = (hojas && hojas['PROMEDIOS J']) || [];
  const out = {};
  if (!fotos || filas.length < 2) return out;
  const cab = (filas[0] || []).map(c => String(c || '').trim().toUpperCase());
  const iN = cab.indexOf('NOMBRES'), iE = cab.indexOf('EQUIPO');
  if (iN === -1 || iE === -1) return out;
  for (let i = 1; i < filas.length; i++) {
    const k = claveFoto(filas[i][iN], filas[i][iE]);
    if (fotos[k]) out[k] = fotos[k];
  }
  return out;
}

/**
 * LAS TITULARIDADES (punto 97): `[titular, partidos]` por jugador, de la
 * columna TITULAR de `Base Datos J` (la escribe la ingesta desde el box
 * score oficial: «SI» / «NO»). Solo cuentan las filas que TRAEN el dato:
 * un libro con Excel manual deja la columna vacía y no da nada — el panel
 * no habla de titularidad sin el dato (punto 8).
 *
 * Se arma sobre el libro COMPLETO y viaja solo el conteo, igual que las
 * alertas: ninguna fila de un rival recortado cruza al navegador. El
 * tramo (`fase`, `torneo`) es el que pidió el panel; sin tramo, todo.
 */
function titularesDelLibro(hojas, tramo) {
  const filas = (hojas && hojas['Base Datos J']) || [];
  const out = {};
  if (filas.length < 2) return out;
  const cab = (filas[0] || []).map(c => String(c || '').trim().toUpperCase());
  const iN = cab.indexOf('NOMBRES'), iE = cab.indexOf('EQUIPO'), iT = cab.indexOf('TITULAR');
  const iF = cab.indexOf('FASE'), iTo = cab.indexOf('TORNEO');
  if (iN === -1 || iE === -1 || iT === -1) return out;
  const t = tramo || {};
  const igual = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const v = String(f[iT] == null ? '' : f[iT]).trim().toUpperCase();
    if (v !== 'SI' && v !== 'SÍ' && v !== 'NO') continue;
    if (t.fase && iF !== -1 && !igual(f[iF], t.fase)) continue;
    if (t.torneo && iTo !== -1 && !igual(f[iTo], t.torneo)) continue;
    if (!String(f[iN] || '').trim() || !String(f[iE] || '').trim()) continue;
    const k = claveFoto(f[iN], f[iE]);
    const a = out[k] || (out[k] = [0, 0]);
    a[1]++;
    if (v !== 'NO') a[0]++;
  }
  return out;
}

module.exports = { HOJA, fechaIso, fichasDelPadron, fusionar, fotosDelPadron, dorsalesDelPadron, fotosDelLibro, claveFoto,
  titularesDelLibro };
