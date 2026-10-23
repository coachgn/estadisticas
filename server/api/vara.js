/* =====================================================================
   GET /api/v1/vara-jugadores/:clubId?categoria=&torneo=&fase=&muestra=

   LA VARA DE JUGADORES DE UN PERÍODO (punto 139, fase 3 · opción A).

   Un cliente recibe `Base Datos J` con su plantel nada más (punto 19), así
   que con una muestra activa el panel no puede armar la liga de jugadores
   del período: le faltan los rivales. Acá se arma sobre el libro COMPLETO,
   con el MISMO motor que usa el panel (`SGADD_MUESTRA.recortar` /
   `recortarPorCondicion` + `construirIndice`), y viaja solo la vara:
   mediana, umbral de minutos y, por métrica, n, media, desvío y 21
   cortes. Ningún nombre y ninguna fila (`SGADD_MUESTRA.varaJugadores`).

   Con menos de 3 partidos en la muestra o menos de 5 calificados no se
   entrega: con un partido, los cortes de la liga son el box score de esa
   noche. El panel lo dice y se queda con la temporada.

   Mismo acceso que los datos: el admin, o un cliente sobre SU club con la
   categoría activa.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const sheets = require('../lib/google-sheets.js');
const etiquetas = require('../lib/etiquetas.js');
const MULTI = require('../lib/multilibro.js');
const { entorno } = require('../lib/config.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const NUCLEO = require('../lib/compartido/sgadd-core.js');
if (typeof global.SGADD === 'undefined') global.SGADD = NUCLEO;
const DATOS = require('../lib/compartido/sgadd-data.js');
const MUESTRA = require('../lib/compartido/sgadd-muestra.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const cache = new Map();

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

function aFormatoIndice(hojas) {
  const out = {};
  Object.keys(hojas || {}).forEach(h => { out[h] = DATOS.matrizAFilas(hojas[h]); });
  return out;
}

/** Lo puro: de las hojas del libro completo a la respuesta. Se testea sin red. */
function calcular(hojas, tramo, muestra) {
  const m = MUESTRA.normalizar(muestra);
  if (!MUESTRA.activa(m)) return { error: error(400, 'SIN_MUESTRA', 'Falta la muestra.') };
  const tramos = NUCLEO.combinacionesTorneoFase(hojas);
  const id = (tramo.torneo || '') + '|' + (tramo.fase || '');
  if (!tramos.some(t => t.id === id)) return { error: error(400, 'TRAMO', 'Ese tramo no está en el libro.') };

  const fam = MUESTRA.familia(m);
  const rec = fam === 'equipo'
    ? MUESTRA.recortarPorCondicion(hojas, tramo, m)
    : MUESTRA.recortar(hojas, tramo, MUESTRA.ventana(m, MUESTRA.diasDelTramo(hojas, tramo)));
  if (!rec.partidos) return { body: { ok: true, vara: null, motivo: 'SIN_PARTIDOS', partidos: 0 } };

  const opc = { fase: tramo.fase, torneo: NUCLEO.TORNEO_TOTAL };
  if (rec.conservar) opc.conservar = rec.conservar;
  const idx = NUCLEO.construirIndice(rec.hojas, opc);
  const vara = MUESTRA.varaJugadores(idx);
  if (!MUESTRA.varaSuficiente(vara)) {
    return { body: { ok: true, vara: null, motivo: 'MUESTRA_CHICA',
      partidos: vara ? vara.partidos : 0, calificados: vara ? vara.calificados : 0 } };
  }
  return { body: { ok: true, vara: vara, partidos: vara.partidos } };
}

async function manejarVara(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');

  const params = (peticion && peticion.params) || {};
  const q = (peticion && peticion.query) || {};
  const clubId = String(params.clubId || '').toLowerCase();
  const slug = String(q.categoria || '').toLowerCase();
  if (!SLUG.test(clubId) || !SLUG.test(slug)) return error(400, 'RUTA_INVALIDA', 'Falta el club o la categoría.');

  const esAdmin = v.rol === AUTH.ROLES.ADMIN;
  if (!esAdmin && v.club !== clubId) return error(403, 'OTRO_CLUB', 'Tu acceso no incluye ese club.');

  let muestra;
  try { muestra = JSON.parse(String(q.muestra || '')); } catch (e) { muestra = null; }
  if (!muestra || typeof muestra !== 'object') return error(400, 'SIN_MUESTRA', 'Falta la muestra.');
  const tramo = { torneo: String(q.torneo || ''), fase: String(q.fase || '') };

  const cascada = await catalogo.cargar(deps);
  const cat = catalogo.resolver(cascada.catalogo, clubId, slug);
  if (!cat) return error(404, 'SIN_CATEGORIA', 'No existe esa categoría.');
  if (!esAdmin && !AUTH.tieneAcceso(mutar.estadoEfectivo(cat.suscripcion || {}))) {
    return error(403, 'SUSCRIPCION', 'El acceso a esta categoría no está activo.');
  }
  if (!cat.sheetId) return error(404, 'SIN_LIBRO', 'La categoría no tiene libro.');

  const k = clubId + '|' + slug + '|' + tramo.torneo + '|' + tramo.fase + '|' + MUESTRA.clave(muestra);
  const ahora = Date.now();
  const guardado = cache.get(k);
  if (guardado && guardado.venceEn > ahora) return { status: 200, body: guardado.body };

  let libro;
  try {
    libro = await sheets.obtenerLibro(cat.sheetId, deps);
    /* Los mismos libros vinculados que entran a los datos (punto 77). */
    const vinc = MULTI.vinculadosDe(cascada.catalogo, cat.clubId, cat.slug);
    if (vinc.length) {
      const eq = AUTH.equipoDeCategoria((cascada.catalogo || {})[cat.clubId] || {}, cat.slug).equipo;
      libro = await MULTI.leerVinculados(libro, vinc, eq ? NUCLEO.claveEquipo(eq) : null,
        (id) => sheets.obtenerLibro(id, deps));
    }
  } catch (e) {
    return error(502, (e && e.codigo) || 'DATOS', 'No se pudieron leer los datos de la categoría.');
  }
  etiquetas.reetiquetar(libro, cat.slug);

  let r;
  try {
    r = calcular(aFormatoIndice(libro.hojas), tramo, muestra);
  } catch (e) {
    console.error('[sgadd] vara:', e && e.stack ? e.stack : e);
    return error(500, 'VARA', 'No se pudo calcular la vara del período.');
  }
  if (r.error) return r.error;
  cache.set(k, { body: r.body, venceEn: ahora + entorno().ttlCacheMs });
  return { status: 200, body: r.body };
}

module.exports = { manejarVara, calcular };
