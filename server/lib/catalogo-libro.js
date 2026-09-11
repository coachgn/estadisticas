/* =====================================================================
   SGADD · Los equipos de un libro · motor PURO

   Contesta la pregunta que traba cualquier alta: «¿cómo escribe ESTE
   libro el nombre de mi equipo?». Hasta acá había que correr
   `probar-google.js` en una terminal y copiar el nombre a mano, y el
   error de dedo era silencioso: con `SUDAMERICA` donde la planilla dice
   `SUD AMERICA LP - MM`, el cliente entraba y veía CERO equipos, sin
   ningún mensaje — medido con el alta real de Sud América (2026-09-11).

   Entra el libro ya leído (las matrices de `obtenerLibro`) y sale la
   lista de equipos con su CLAVE, que es lo que se guarda como equipo
   propio: el gate compara con `claveEquipo()` de los dos lados (punto 19),
   así que la clave es exactamente el valor que va a coincidir.

   Sin red y sin credenciales: por eso se puede testear.
   ===================================================================== */
'use strict';

const CORE = require('./compartido/sgadd-core.js');

/* Las dos hojas que traen un equipo por fila. Se leen las DOS porque un
   libro a medio recalcular puede traer una sola completa (punto 3 ter:
   `PROMEDIOS E` con tres filas y `Base Datos E` con doce equipos). */
const HOJAS_EQUIPO = ['PROMEDIOS E', 'Base Datos E'];

/* La fila TIPO es la MEDIANA de la liga, no un equipo (punto 3):
   ofrecerla como equipo propio dejaría al cliente sin ninguna ficha. */
const ES_TIPO = /^EQUIPO\s+TIPO$/i;

/**
 * Los equipos de un libro, sin repetir, en orden alfabético.
 *
 * @param {Object<string, Array<Array>>} hojas matrices crudas, fila 0 = encabezados
 * @returns {Array<{clave: string, nombre: string, filas: number}>}
 *   `clave` es la que se guarda; `nombre`, como lo escribe la planilla.
 */
function equiposDelLibro(hojas) {
  const porClave = new Map();
  HOJAS_EQUIPO.forEach((h) => {
    const m = (hojas && hojas[h]) || [];
    const enc = (m[0] || []).map(x => String(x == null ? '' : x).trim().toUpperCase());
    const i = enc.indexOf('EQUIPO');
    if (i === -1) return;
    m.slice(1).forEach((f) => {
      const crudo = String((f && f[i]) == null ? '' : f[i]).trim();
      if (!crudo || ES_TIPO.test(crudo)) return;
      const clave = CORE.claveEquipo(crudo);
      if (!clave || ES_TIPO.test(clave)) return;
      const e = porClave.get(clave) || { clave: clave, nombre: crudo, filas: 0 };
      e.filas++;
      porClave.set(clave, e);
    });
  });
  return Array.from(porClave.values()).sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
}

/** ¿Ese equipo propio existe en el libro? Se compara por clave, igual que el gate. */
function coincide(equipoPropio, equipos) {
  const k = CORE.claveEquipo(String(equipoPropio || ''));
  return !!k && (equipos || []).some(e => e.clave === k);
}

module.exports = { equiposDelLibro, coincide, HOJAS_EQUIPO };
