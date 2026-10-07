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

module.exports = { HOJA, fechaIso, fichasDelPadron, fusionar };
