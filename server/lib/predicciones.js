/* =====================================================================
   EL ALMACÉN DE LAS PREDICCIONES CONGELADAS (punto 171)

   Un hash por zona de torneo: `sgadd:predicciones:<torneo>:<zona>`, un
   campo por partido (`AAAA-MM-DD|LOCAL|VISITANTE`). Se escribe con
   HSETNX: una predicción congelada NO se reemplaza nunca. Si el modelo
   cambia, la nueva versión se ve en los partidos que vienen, y lo que el
   modelo dijo antes de cada partido queda como estaba.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');

const PREFIJO = 'sgadd:predicciones:';
const claveKV = (torneo, zona) => PREFIJO + torneo + ':' + zona;
const almacen = (deps) => (deps && deps.kv) || kv;

async function leer(torneo, zona, deps) {
  return almacen(deps).leerHash(claveKV(torneo, zona), deps);
}

/** 1 si se congeló ahora, 0 si ya estaba. */
async function congelar(torneo, zona, registro, deps) {
  const n = await almacen(deps).comando(['HSETNX', claveKV(torneo, zona), registro.clave, JSON.stringify(registro)], deps);
  return Number(n) === 1 ? 1 : 0;
}

module.exports = { claveKV, leer, congelar };
