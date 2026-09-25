/* =====================================================================
   /api/v1/fixture/:torneo · el calendario en vivo de una fuente externa
   (punto 70)

     GET                    todas las zonas del torneo
     GET ?zona=a            solo esa
     GET ?refrescar=1       fuerza la bajada (solo ADMIN)

   El torneo declara su fuente en `torneos/<id>.json` y eso viaja al
   catálogo (`fixture: { adaptador, zonas, ttlMs }`). Acá se baja, se
   parsea con el adaptador y se guarda en KV.

   ---------------------------------------------------------------------
   LO QUE SE GUARDA ES LA ÚLTIMA LECTURA BUENA, Y ES EL PUNTO ENTERO

   Una fuente externa se cae, cambia su HTML o mete un captcha, y eso NO
   puede dejar al DT sin su calendario el sábado a la mañana. El orden es:

     1. KV fresco            se sirve y no se toca la red
     2. KV vencido           se intenta refrescar
     3. el refresco FALLA    se sirve lo guardado, con `stale: true` y el
                             motivo — nunca un error
     4. no hay nada guardado y falla  → 502, que es la única vez que el
                             panel se queda sin nada, y ahí cae al
                             `calendario` declarado del archivo

   El paso 3 incluye el caso más traicionero: la página responde 200 y ya
   no se reconoce ni un partido. Eso NO es «el torneo no tiene partidos»
   —el adaptador lo distingue y avisa— y servir cero partidos borraría el
   calendario de la pantalla sin que nadie se entere.

   ---------------------------------------------------------------------
   POR QUÉ ACÁ Y NO EN EL NAVEGADOR

   basket-club manda `Access-Control-Allow-Origin: *`, así que el panel
   PODRÍA pedirle directo. No se hace por tres motivos medidos: son ~400 KB
   de HTML por zona y por carga (`Cache-Control: no-store`, o sea que el
   navegador no lo guarda), el respaldo ante una caída viviría en cada
   navegador por separado, y el día que la fuente cierre el CORS el panel
   se queda sin fixture. Acá se baja una vez cada diez minutos para todos.
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const fuentes = require('../lib/fixture-fuentes.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

const PREFIJO = 'sgadd:fixture:';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TTL_POR_DEFECTO = 10 * 60 * 1000;
/* Una página de torneo pesa ~450 KB. El techo evita que una fuente que
   empieza a devolver un stream infinito cuelgue la función. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 12000;

function claveKV(torneo) { return PREFIJO + torneo; }

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

/**
 * Baja una página con techo de tiempo y de tamaño.
 *
 * El `AbortController` corta la conexión de verdad y la carrera garantiza
 * el corte aunque el `fetch` ignore la señal — es la misma pareja que usa
 * la carga de categorías del panel (punto 6), y por el mismo motivo.
 */
async function bajar(url, deps) {
  const traer = (deps && deps.fetch) || fetch;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  let reloj = null;
  const corte = new Promise((_, rechazar) => {
    reloj = setTimeout(() => {
      if (ctrl) { try { ctrl.abort(); } catch (e) { /* ya cortada */ } }
      rechazar(Object.assign(new Error('La fuente no contestó en ' + (TIMEOUT_MS / 1000) + ' s.'), { codigo: 'TIMEOUT' }));
    }, TIMEOUT_MS);
  });
  try {
    const r = await Promise.race([
      traer(url, {
        signal: ctrl ? ctrl.signal : undefined,
        headers: {
          /* Sin User-Agent, varios sitios contestan 403. Se dice quién es y
             para qué: es un panel de un club leyendo un calendario público. */
          'User-Agent': 'SGADD/1.0 (panel de scouting; calendario publico)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      }),
      corte,
    ]);
    if (!r.ok) throw Object.assign(new Error('La fuente respondió ' + r.status + '.'), { codigo: 'HTTP_' + r.status });
    const texto = await r.text();
    if (texto.length > MAX_BYTES) {
      throw Object.assign(new Error('La respuesta es más grande de lo esperado.'), { codigo: 'MUY_GRANDE' });
    }
    return texto;
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

/**
 * Baja y parsea todas las zonas de un torneo.
 *
 * UNA ZONA QUE FALLA NO TUMBA A LAS OTRAS: se guarda lo que salió bien y
 * se avisa de la que no. Con tres zonas, que se caiga una y perder las tres
 * sería convertir un problema chico en uno grande.
 */
async function refrescar(config, deps, hoy) {
  const ad = fuentes.adaptador(config.adaptador);
  const zonas = {};
  const fallaron = [];
  const ids = Object.keys(config.zonas);
  const resultados = await Promise.all(ids.map(async (z) => {
    /* SE TOLERA LA FORMA CORTA —una zona declarada como un string— aunque
       `configDe` ya la normalice: `refrescar` es la que hace el trabajo y
       no puede depender de que el llamador haya pasado por el validador.
       Lo destapó un test que la armaba a mano y rompía con «cannot read
       properties of undefined». */
    const bruto = config.zonas[z];
    const cfgZona = (typeof bruto === 'string') ? { urls: [bruto], categoria: null } : (bruto || { urls: [] });
    try {
      /* VARIAS PÁGINAS POR ZONA: apdeb publica la programación y los
         resultados en archivos distintos, y las dos alimentan la misma
         lista. Si UNA de las dos falla, se sigue con la que respondió: es
         la misma regla que entre zonas, un nivel más abajo. */
      const lecturas = await Promise.all(cfgZona.urls.map(async (u) => {
        try {
          const html = await bajar(u, deps);
          return { r: ad.parsear(html, { zona: z, hoy: hoy, categoria: cfgZona.categoria,
            desde: cfgZona.desde || config.desde }) };
        } catch (e) { return { error: e.message || 'No se pudo leer ' + u }; }
      }));
      const partidos = [];
      const avisos = [];
      const errores = [];
      const vistos = {};
      lecturas.forEach((l) => {
        if (l.error) { errores.push(l.error); return; }
        l.r.avisos.forEach(x => avisos.push(x));
        l.r.partidos.forEach((p) => {
          /* UN PARTIDO PUEDE ESTAR EN LAS DOS PÁGINAS —programado y ya
             jugado— y ahí gana el que TIENE MARCADOR: es el más nuevo. */
          const k = (p.fecha || 'sin-fecha') + '|' + [p.local, p.visitante].join('|');
          const previo = vistos[k];
          if (previo === undefined) { vistos[k] = partidos.length; partidos.push(p); return; }
          if (p.ptsLocal != null && partidos[previo].ptsLocal == null) partidos[previo] = p;
        });
      });
      /* CERO PARTIDOS CON HTTP 200 es «cambió la estructura», no «no hay
         torneo»: se trata como falla para conservar lo guardado. */
      if (!partidos.length) {
        return { z: z, error: errores.concat(avisos)[0] || 'No se reconoció ningún partido.' };
      }
      return { z: z, datos: { partidos: partidos, avisos: avisos.concat(errores) } };
    } catch (e) {
      return { z: z, error: e.message || 'No se pudo leer la fuente.' };
    }
  }));
  resultados.forEach((r) => {
    if (r.datos) zonas[r.z] = r.datos;
    else fallaron.push(r.z + ': ' + r.error);
  });
  return { zonas: zonas, fallaron: fallaron };
}

/** Lo guardado, o null. Un KV ilegible NO es un fixture vacío. */
async function leerGuardado(torneo, deps) {
  const r = await kv.leer(claveKV(torneo), deps || {});
  if (r.error) throw Object.assign(new Error(r.error), { codigo: 'KV' });
  return r.valor || null;
}

async function manejarFixture(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');

  const params = (peticion && peticion.params) || {};
  const query = (peticion && peticion.query) || {};
  const torneo = String(params.torneo || '').trim().toLowerCase();
  if (!SLUG.test(torneo)) return error(400, 'TORNEO', 'Ese identificador de torneo no es válido.');

  const cascada = await catalogo.cargar(deps);
  const entrada = (cascada.catalogo || {})[torneo];
  if (!entrada) return error(404, 'TORNEO', 'Ese torneo no está en el catálogo.');

  const config = fuentes.configDe(entrada);
  if (!config) {
    /* NO ES UN ERROR: un torneo puede traer su calendario en su propio
       archivo (LAB) y no tener fuente en vivo. Se dice, y el panel usa el
       declarado. */
    return { status: 200, body: { ok: true, torneo: torneo, fuente: null, zonas: {},
      mensaje: 'Este torneo no declara una fuente externa de fixture.' } };
  }

  const esAdmin = AUTH.esAdmin ? AUTH.esAdmin(v.payload && v.payload.email) : false;
  const hoy = new Date().toISOString().slice(0, 10);
  const ttl = config.ttlMs || TTL_POR_DEFECTO;

  let guardado = null;
  let avisoKv = null;
  try { guardado = await leerGuardado(torneo, deps); }
  catch (e) { avisoKv = 'No se pudo leer el fixture guardado (' + e.message + ').'; }

  const edad = guardado && guardado.actualizado ? (Date.now() - Date.parse(guardado.actualizado)) : Infinity;
  const fresco = isFinite(edad) && edad < ttl;
  const forzar = !!query.refrescar && esAdmin;

  if (guardado && fresco && !forzar) {
    return respuesta(torneo, config, guardado, { stale: false, aviso: avisoKv }, query);
  }

  let nuevo = null;
  let motivo = null;
  try {
    const r = await refrescar(config, deps, hoy);
    if (Object.keys(r.zonas).length) {
      /* SE FUSIONA con lo guardado: una zona que falló hoy conserva su
         última lectura buena en vez de desaparecer. */
      const zonas = Object.assign({}, (guardado && guardado.zonas) || {}, r.zonas);
      nuevo = { actualizado: new Date().toISOString(), zonas: zonas,
        fallaron: r.fallaron, adaptador: config.adaptador };
      try { await kv.escribir(claveKV(torneo), nuevo); }
      catch (e) { motivo = 'Se leyó la fuente pero no se pudo guardar (' + e.message + ').'; }
    } else {
      motivo = r.fallaron.join(' · ') || 'La fuente no devolvió ninguna zona.';
    }
  } catch (e) {
    motivo = e.message || 'No se pudo leer la fuente.';
  }

  if (nuevo) return respuesta(torneo, config, nuevo, { stale: false, aviso: avisoKv || motivo }, query);
  if (guardado) {
    /* EL CASO QUE JUSTIFICA TODO ESTO: la fuente falló y el DT igual ve su
       calendario, con la fecha de la última lectura buena a la vista. */
    return respuesta(torneo, config, guardado, { stale: true, aviso: motivo }, query);
  }
  return error(502, 'FUENTE', 'No se pudo leer el fixture y no hay una copia guardada. ' + (motivo || ''));
}

function respuesta(torneo, config, datos, estado, query) {
  const zona = query && query.zona ? String(query.zona).trim().toLowerCase() : '';
  let zonas = datos.zonas || {};
  if (zona) zonas = Object.prototype.hasOwnProperty.call(zonas, zona) ? { [zona]: zonas[zona] } : {};
  return {
    status: 200,
    body: {
      ok: true,
      torneo: torneo,
      fuente: config.adaptador,
      /* LA FECHA DE LA LECTURA VA SIEMPRE, fresca o no: es lo que le
         permite al DT saber si el horario que está mirando es de hace diez
         minutos o de antes de ayer. */
      actualizado: datos.actualizado || null,
      stale: !!estado.stale,
      aviso: estado.aviso || null,
      /* Las zonas que no se pudieron refrescar en ESTA vuelta. */
      fallaron: datos.fallaron || [],
      zonas: zonas,
    },
  };
}

module.exports = { manejarFixture, bajar, refrescar, claveKV, TTL_POR_DEFECTO };
