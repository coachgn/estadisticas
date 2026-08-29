/* =====================================================================
   EL CATÁLOGO · de dónde sale, y por qué en ese orden

     1. Upstash KV            se puede cambiar SIN redeplegar
     2. SGADD_CATALOGO (env)  un JSON en el entorno
     3. config.js             el literal horneado en el código

   ---------------------------------------------------------------------
   POR QUÉ KV Y NO ALCANZABA CON UNA VARIABLE DE ENTORNO

   Vercel exige un REDEPLOY para que un cambio de variable tome efecto.
   Mover el catálogo a `SGADD_CATALOGO` sacaba el cambio de CÓDIGO pero no
   el deploy, que era la mitad del objetivo. Con KV el servidor lo lee en
   runtime: dar de alta un club pasa a ser un comando.

   El nivel 2 igual existe y sirve: es la vía sin cuenta de Upstash, y el
   escalón intermedio para probar un catálogo distinto sin tocar la base.

   ---------------------------------------------------------------------
   EL NIVEL 3 NO SE SACA NUNCA

   Es lo que hace que mover el catálogo a un servicio externo no vuelva
   frágil al servidor. Si Upstash no contesta —cae, vence el token, se
   agota el plan— la cascada baja sola y los clubes que ya estaban siguen
   funcionando. Lo único que deja de poder hacerse es dar de alta uno
   nuevo, que puede esperar.

   Es el mismo principio que ya rige en el frontend desde el punto 6: la
   config es opcional y su ausencia nunca puede tumbar el panel.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');
const { CATALOGO, entorno } = require('./config.js');

const CLAVE_KV = 'sgadd:catalogo';

/* El catálogo se lee una vez y se cachea con el mismo TTL que las hojas.
   Sin esto, cada request al panel suma una ida a Upstash — y el catálogo
   cambia cuando alguien da de alta un club, o sea casi nunca. */
let cache = { valor: null, venceEn: 0, origen: null, aviso: null };

/* --------------------------------------------------------------------
   VALIDACIÓN

   Un blob mal formado en KV no puede envenenar el catálogo: se rechaza
   entero y la cascada sigue bajando. Se valida la FORMA, no el contenido
   — que un `sheetId` esté vacío es válido (categoría todavía sin libro,
   como ya pasa hoy con la U23).
   -------------------------------------------------------------------- */
function validar(cat) {
  if (!cat || typeof cat !== 'object' || Array.isArray(cat)) return 'no es un objeto';
  const clubes = Object.keys(cat);
  if (!clubes.length) return 'no tiene ningún club';
  for (const id of clubes) {
    const c = cat[id];
    if (!c || typeof c !== 'object') return id + ': no es un objeto';
    if (!c.nombre) return id + ': falta `nombre`';
    if (!c.categorias || typeof c.categorias !== 'object') return id + ': falta `categorias`';
    for (const slug of Object.keys(c.categorias)) {
      const k = c.categorias[slug];
      if (!k || typeof k !== 'object') return id + '/' + slug + ': no es un objeto';
      if (!k.label) return id + '/' + slug + ': falta `label`';
      if (k.sheetId !== undefined && typeof k.sheetId !== 'string') {
        return id + '/' + slug + ': `sheetId` no es texto';
      }
    }
  }
  return null;
}

function desdeEntorno() {
  const crudo = process.env.SGADD_CATALOGO;
  if (!crudo) return null;
  try { return JSON.parse(crudo); }
  catch (e) { return { __error: 'SGADD_CATALOGO no es JSON válido' }; }
}

/**
 * El catálogo vigente, resolviendo la cascada.
 *
 * @returns {Promise<{catalogo, origen: 'kv'|'env'|'codigo', aviso: string|null}>}
 */
async function cargar(opciones) {
  const o = opciones || {};
  const ahora = Date.now();
  if (cache.valor && cache.venceEn > ahora && !o.forzar) {
    return { catalogo: cache.valor, origen: cache.origen, aviso: cache.aviso };
  }

  let aviso = null;

  /* --- 1 · KV --- */
  if (kv.configurado(o.env)) {
    const r = await kv.leer(CLAVE_KV, o);
    if (r.valor) {
      const mal = validar(r.valor);
      if (!mal) return guardar(r.valor, 'kv', null, o);
      /* Un catálogo inválido en KV se IGNORA y se avisa: servir uno roto
         sería peor que servir el anterior. */
      aviso = 'El catálogo de KV es inválido (' + mal + '); se usa el respaldo.';
    } else if (r.error) {
      aviso = 'No se pudo leer el catálogo de KV (' + r.error + '); se usa el respaldo.';
    }
    /* `valor: null` sin error = la clave no existe todavía. Es el estado
       normal antes de la primera alta, y no amerita un aviso. */
  }

  /* --- 2 · variable de entorno --- */
  const env = desdeEntorno();
  if (env && env.__error) {
    aviso = aviso || env.__error;
  } else if (env) {
    const mal = validar(env);
    if (!mal) return guardar(env, 'env', aviso, o);
    aviso = aviso || ('SGADD_CATALOGO es inválido (' + mal + '); se usa el respaldo.');
  }

  /* --- 3 · el literal del código --- */
  return guardar(CATALOGO, 'codigo', aviso, o);
}

function guardar(valor, origen, aviso, o) {
  const ttl = (o && o.ttlMs) || entorno().ttlCacheMs;
  cache = { valor: valor, venceEn: Date.now() + ttl, origen: origen, aviso: aviso };
  return { catalogo: valor, origen: origen, aviso: aviso };
}

function limpiarCache() { cache = { valor: null, venceEn: 0, origen: null, aviso: null }; }

/* --------------------------------------------------------------------
   RESOLUCIÓN · funciones PURAS sobre un catálogo ya cargado

   No leen de ningún lado: reciben el catálogo. Así el handler resuelve la
   cascada UNA vez por request y estas se pueden testear sin KV ni
   entorno.
   -------------------------------------------------------------------- */

/** slug de club + slug de categoría → la config de esa categoría. */
function resolver(cat, clubId, slugCategoria) {
  const club = (cat || {})[String(clubId || '').trim().toLowerCase()];
  if (!club) return null;
  const ids = Object.keys(club.categorias || {});
  /* Sin categoría se abre la primera del club, igual que el selector del
     panel al arrancar. */
  const catId = String(slugCategoria || ids[0] || '').trim().toLowerCase();
  const k = (club.categorias || {})[catId];
  if (!k) return null;
  return {
    clubId: String(clubId).toLowerCase(),
    club: club.nombre,
    liga: club.liga || '',
    equipoPropio: club.equipoPropio || null,
    slug: catId,
    label: k.label,
    sheetId: k.sheetId || '',
  };
}

/** Lo que el frontend SÍ puede conocer. Sin un solo `sheetId`. */
function publico(cat) {
  const c = cat || {};
  return Object.keys(c).map(id => ({
    id: id,
    nombre: c[id].nombre,
    liga: c[id].liga || '',
    categorias: Object.keys(c[id].categorias || {}).map(s => ({
      slug: s,
      label: c[id].categorias[s].label,
      /* `activo` reemplaza al `sheetId` como señal de "esta categoría ya
         tiene libro": dice lo mismo sin revelar cuál. */
      activo: !!c[id].categorias[s].sheetId,
    })),
  }));
}

module.exports = {
  CLAVE_KV, cargar, limpiarCache, validar, resolver, publico, desdeEntorno,
};
