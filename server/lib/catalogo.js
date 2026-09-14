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
/* La cascada de plan y estado por categoría vive en el motor compartido:
   el Panel Master la pinta con la misma función (punto 60). */
const AUTH = require('./compartido/sgadd-auth.js');

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
      /* Se valida la FORMA y no el valor: un estado que no se reconoce se
         lee como «hereda» (`AUTH.suscripcionDeCategoria`), y rechazar el
         catálogo entero por eso tiraría a todos los clubes al respaldo. */
      if (k.plan !== undefined && typeof k.plan !== 'string') return id + '/' + slug + ': `plan` no es texto';
      if (k.estado !== undefined && typeof k.estado !== 'string') return id + '/' + slug + ': `estado` no es texto';
      /* Lo mismo con el equipo, el vencimiento y los contadores ORO de la
         categoría: forma, no valor. Una fecha mal escrita no vence nunca
         (`suscripcionVencida` la ignora), que es degradar y no romper. */
      if (k.equipoPropio !== undefined && typeof k.equipoPropio !== 'string') return id + '/' + slug + ': `equipoPropio` no es texto';
      if (k.vence !== undefined && typeof k.vence !== 'string') return id + '/' + slug + ': `vence` no es texto';
      if (k.informesEntregados !== undefined && typeof k.informesEntregados !== 'number') return id + '/' + slug + ': `informesEntregados` no es un número';
      if (k.cicloDesde !== undefined && typeof k.cicloDesde !== 'number') return id + '/' + slug + ': `cicloDesde` no es un número';
      /* Las capas de laboratorio: forma (un array de textos), no valor. Una
         capa que no existe se ignora al leer (`AUTH.capasDeCategoria`). */
      if (k.laboratorio !== undefined && (!Array.isArray(k.laboratorio) || k.laboratorio.some(x => typeof x !== 'string'))) {
        return id + '/' + slug + ': `laboratorio` no es una lista de textos';
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

/**
 * EL CATÁLOGO SOBRE EL QUE SE ESCRIBE · siempre el de KV, recién leído.
 *
 * `cargar()` está hecha para SERVIR: si Upstash no contesta baja al
 * respaldo en silencio, y además cachea cinco minutos por instancia. Las
 * dos cosas son correctas para mostrar y un desastre para escribir,
 * porque toda escritura del catálogo es read-modify-write del objeto
 * ENTERO:
 *
 *   · con KV caído un instante, el alta se aplicaba sobre el literal del
 *     código y ese literal se escribía ENCIMA de KV: se perdían los planes,
 *     las zonas publicadas y los partidos cargados a mano de todos los
 *     clubes;
 *   · con el caché de otra instancia, se escribía sobre una foto de hace
 *     cinco minutos y se deshacía lo que otro admin publicó en el medio.
 *
 * Por eso esto NO usa el caché y NO baja al respaldo. Lanza si KV no se
 * pudo leer o trae algo inválido —mejor no guardar que pisar—. La única
 * vez que se parte del respaldo es con la clave AUSENTE: es el catálogo
 * antes de la primera alta, y ahí no hay nada que perder.
 *
 * @returns {Promise<{catalogo, origen}>} una COPIA, que se puede mutar.
 */
async function cargarParaEscribir(opciones) {
  const o = opciones || {};
  if (!kv.configurado(o.env)) {
    const e = new Error('Upstash no está configurado: no hay dónde escribir el catálogo.');
    e.codigo = 'SIN_KV';
    throw e;
  }
  const r = await kv.leer(CLAVE_KV, o);
  if (r.error) {
    const e = new Error('No se pudo leer el catálogo vigente (' + r.error + '). No se escribe nada: '
      + 'escribir ahora pisaría lo publicado con el respaldo.');
    e.codigo = 'KV_ILEGIBLE';
    throw e;
  }
  if (r.valor) {
    const mal = validar(r.valor);
    if (mal) {
      const e = new Error('El catálogo de KV es inválido (' + mal + '). No se escribe encima: '
        + 'repararlo primero (server/bin/reparar-kv.js).');
      e.codigo = 'KV_INVALIDO';
      throw e;
    }
    return { catalogo: JSON.parse(JSON.stringify(r.valor)), origen: 'kv' };
  }
  /* La clave no existe todavía: se siembra desde el respaldo. */
  const env = desdeEntorno();
  const base = (env && !env.__error && !validar(env)) ? env : CATALOGO;
  return { catalogo: JSON.parse(JSON.stringify(base)), origen: (base === CATALOGO) ? 'codigo' : 'env' };
}

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
  /* EL PLAN Y EL ESTADO SON DE LA CATEGORÍA (punto 60), con herencia del
     club. Se resuelven ACÁ, que es el único punto por el que pasan los
     datos, el scouting y los estados compartidos: así el guard y el plan
     efectivo de los handlers no cambian una línea y ya miran la categoría
     pedida. */
  const sus = AUTH.suscripcionDeCategoria(club, catId);
  /* EL EQUIPO Y EL CICLO ORO TAMBIÉN SON DE LA CATEGORÍA (2026-09-13), con
     la misma herencia: ver `AUTH.equipoDeCategoria` y `cicloDeCategoria`. */
  const eq = AUTH.equipoDeCategoria(club, catId);
  const ci = AUTH.cicloDeCategoria(club, catId);
  return {
    clubId: String(clubId).toLowerCase(),
    club: club.nombre,
    liga: club.liga || '',
    equipoPropio: eq.equipo,
    equipoPropioDe: eq.equipoDe,
    /* El del club, aparte: los handlers solo reemplazan el equipo del
       token cuando es el HEREDADO del club (`sesionDeCategoria`). */
    equipoPropioClub: club.equipoPropio || null,
    /* EL ESTADO COMERCIAL DEL CLUB, para el guard de suscripción.

       Va aparte y NO aplanado junto a `club` porque `club` es el NOMBRE,
       un string: un guard que hiciera `cat.club.estado` leería una
       propiedad de un texto, daría `undefined` y no dispararía nunca. Es
       el modo de fallar más caro que puede tener un guard —parece puesto
       y no está— así que los campos viajan en su propio objeto. */
    suscripcion: {
      /* El estado DECLARADO que rige —el del club si corta, si no el de la
         categoría—, y no el efectivo: `vencido` se deriva de la fecha en
         `estadoEfectivo`, y guardarlo derivado lo haría derivar dos veces. */
      /* Con el vencimiento de la categoría (2026-09-13): una prueba vencida
         viaja ya como `pausado`, porque `estadoEfectivo` la derivaría a
         `vencido` y no es lo que pasó. `vence` es la fecha que RIGE, la de
         la categoría si la declara, y con eso `estadoEfectivo` de esta
         suscripción da exactamente `sus.estado` —hay un test que lo
         recorre en todas las combinaciones—. */
      estado: sus.pruebaVencida ? 'pausado' : sus.estadoDeclarado,
      estadoDe: sus.estadoDe,
      plan: sus.plan,
      planDe: sus.planDe,
      vence: sus.vence,
      venceDe: sus.venceDe,
      pruebaVencida: sus.pruebaVencida,
      cicloDesde: ci.cicloDesde,
      informesEntregados: ci.informesEntregados,
      cicloDe: ci.cicloDe,
    },
    slug: catId,
    label: k.label,
    sheetId: k.sheetId || '',
    /* Las capas de laboratorio de ESTA categoría (punto 62). No heredan del
       club: una prueba se abre de a una categoría. */
    laboratorio: AUTH.capasDeCategoria(club, catId),
  };
}

/**
 * Lo que el frontend SÍ puede conocer. Sin un solo `sheetId`.
 *
 * `opciones.admin` agrega el estado comercial —estado, plan, vencimiento—.
 * Va detrás de esa bandera porque `manejarCatalogo` NO tiene gate de rol:
 * cualquier usuario con token recibe la lista de clubes, así que mandarlo
 * siempre le contaría a cada cliente la situación de facturación de los
 * demás. Es el mismo criterio que el `sheetId`: se manda lo que hace falta
 * para la pantalla de quien pregunta, y nada más.
 */
/**
 * La HUELLA de un libro: 8 hex de FNV-1a sobre el sheetId.
 *
 * Le dice al Panel Master qué categorías comparten libro —para ofrecer
 * «aplicar a los clientes del mismo torneo»— sin que el sheetId viaje al
 * navegador (punto 29). 32 bits no alcanzan para reconstruir un id de
 * 44 caracteres, y es solo para el admin.
 */
function huellaLibro(sheetId) {
  if (!sheetId) return null;
  let h = 0x811c9dc5;
  const t = String(sheetId);
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/**
 * El plan y el estado de una categoría tal como se hacen valer.
 *
 * Sin plan en la categoría ni en el club, con el catálogo de KV es BRONCE:
 * es lo que el Panel Master pinta y lo que `planEfectivo` impone. Con el
 * respaldo queda `null` —ahí manda el del link—.
 */
function suscripcionPublica(club, slug, origen) {
  const s = AUTH.suscripcionDeCategoria(club, slug);
  const eq = AUTH.equipoDeCategoria(club, slug);
  return {
    planEfectivo: s.plan || (origen === 'kv' ? 'BRONCE' : null),
    planDe: s.planDe,
    /* Ya derivado de las fechas: el del club y el de la categoría. */
    estadoEfectivo: s.estado,
    estadoDe: s.estadoDe,
    venceEfectivo: s.vence,
    venceDe: s.venceDe,
    pruebaVencida: s.pruebaVencida,
    /* EL EQUIPO de la categoría: el panel lo adopta al abrirla. Los nombres
       de equipo no son información comercial —están en la tabla de
       posiciones—, pero viajan solo para el club del token y el admin,
       igual que el resto de este bloque. */
    equipoEfectivo: eq.equipo,
    equipoDe: eq.equipoDe,
    /* LAS CAPAS DE LABORATORIO (punto 62): viajan con el resto de la
       suscripción, o sea solo para el club del token y el admin. Qué se
       prueba con qué cliente no es algo que tengan que ver los demás. */
    laboratorio: AUTH.capasDeCategoria(club, slug),
  };
}

function publico(cat, opciones) {
  const admin = !!(opciones && opciones.admin);
  /* EL CLUB DEL TOKEN recibe el plan y el estado de SUS categorías: el
     selector se los muestra («Primera · ORO», «U19 — pausada») y el menú
     tiene que ofrecer lo que la categoría abierta tiene contratado. Los de
     los demás clubes no viajan: son su situación comercial. */
  const propio = opciones && opciones.club ? String(opciones.club) : null;
  const origen = opciones && opciones.origen;
  const c = cat || {};
  return Object.keys(c).map(id => Object.assign({
    id: id,
    nombre: c[id].nombre,
    liga: c[id].liga || '',
    /* EL COLOR DE MARCA va para todos: es cómo se ve el panel del propio
       cliente, y sin él un club sin `clubes/<id>.json` se pintaba con el
       naranja de Reconquista. No revela nada: el del JSON ya es público. */
    acento: c[id].acento || null,
    /* LAS ZONAS VAN PARA TODOS, no solo para el admin.

       No es informacion comercial: es COMO SE PINTA la tabla de
       posiciones de ese club, y el que la mira es justamente el cliente.
       Dejarla del lado del admin haria que publicar no sirviera de nada.

       Y no revela nada que el cliente no pueda ver igual: hasta ahora
       vivia en `clubes/<club>.json`, que es un archivo publico. */
    competencia: c[id].competencia || null,
    /* LOS PARTIDOS MANUALES VIAJAN PARA TODOS, igual que las zonas: no
       son informacion comercial sino resultados que ya se jugaron, y
       sin ellos la tabla del cliente no cuadra. Lo que sigue siendo
       solo del admin es el plan y el vencimiento. */
    partidosManuales: c[id].partidosManuales || null,
    categorias: Object.keys(c[id].categorias || {}).map(s => Object.assign({
      slug: s,
      label: c[id].categorias[s].label,
      /* `activo` reemplaza al `sheetId` como señal de "esta categoría ya
         tiene libro": dice lo mismo sin revelar cuál. */
      activo: !!c[id].categorias[s].sheetId,
      /* EL NIVEL DE COMPETENCIA. Viaja para todos: decide con qué vara
         se etiqueta a los jugadores de esa categoria, y sin el la U21
         se mediria con la de Liga Argentina. Publicarlo por KV permite
         corregirlo sin tocar el repo. */
      nivel: c[id].categorias[s].nivel || null,
    }, (admin && c[id].categorias[s].sheetId) ? {
      /* Solo para el admin: el modal de alcance la usa para saber qué
         clientes leen el mismo libro. Ver `huellaLibro`. */
      libro: huellaLibro(c[id].categorias[s].sheetId),
    } : {}, admin ? Object.assign({
      /* Lo DECLARADO en la categoría, para los desplegables del Panel
         Master: `null` = hereda del club. */
      plan: c[id].categorias[s].plan || null,
      estado: c[id].categorias[s].estado || null,
      vence: c[id].categorias[s].vence || null,
      equipoPropio: c[id].categorias[s].equipoPropio || null,
    }, suscripcionPublica(c[id], s, origen), (() => {
      /* El ciclo ORO de ESTA categoría, crudo: la posición depende de los
         partidos jugados y la calcula quien tenga el índice delante. */
      const ci = AUTH.cicloDeCategoria(c[id], s);
      return { cicloDesde: ci.cicloDesde, informesEntregados: ci.informesEntregados, cicloDe: ci.cicloDe };
    })()) : {},
    (!admin && propio === id) ? Object.assign(suscripcionPublica(c[id], s, origen), {
      /* El cliente no puede abrir una categoría pausada: el servidor le
         contesta 403. El selector la muestra deshabilitada y con el motivo,
         en vez de dejarlo entrar a una vista vacía. El admin pasa igual
         (`guardSuscripcion`), por eso a él no se le marca. */
      bloqueada: !AUTH.tieneAcceso(suscripcionPublica(c[id], s, origen).estadoEfectivo),
    }) : {})),
  }, admin ? {
    estado: c[id].estado || 'activo',
    plan: c[id].plan || null,
    vence: c[id].vence || null,
    equipoPropio: c[id].equipoPropio || null,
    /* El seguimiento de informes del plan ORO. Van los dos campos crudos y
       NO la posicion calculada: esta depende de los partidos jugados, que
       el catalogo no conoce —salen del libro— asi que la cuenta la hace
       quien tenga el indice delante. */
    cicloDesde: c[id].cicloDesde || 0,
    informesEntregados: c[id].informesEntregados || 0,
  } : {}));
}

module.exports = {
  CLAVE_KV, cargar, cargarParaEscribir, limpiarCache, validar, resolver, publico, desdeEntorno, huellaLibro,
};
