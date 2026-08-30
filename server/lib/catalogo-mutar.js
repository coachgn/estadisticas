/* =====================================================================
   SGADD · Mutaciones del catálogo · motor PURO

   Lo que separa este archivo del endpoint: acá no hay `req`, ni `res`, ni
   KV. Entra un catálogo y una intención, sale un catálogo nuevo o un
   motivo por el que no. Eso es lo que permite probar los guards sin red y
   sin credenciales, que es justo donde tienen que estar probados: un
   guard que solo se ejercita contra producción no se ejercita nunca.

   EL RIESGO QUE ESTO ADMINISTRA. El catálogo es la única pieza cuyo
   deterioro rompe a TODOS los clubes a la vez: KV le gana al código, así
   que un catálogo malo escrito acá deja a los cinco libros en 502 sin que
   nadie haya tocado una planilla. Ya se armó esa bomba dos veces desde la
   CLI (punto 17), y desde la web es más fácil de armar, no menos — un
   formulario invita a probar.

   Por eso las mutaciones son QUIRÚRGICAS: se toca la categoría nombrada y
   nada más. Nunca se acepta un catálogo entero desde el navegador.
   ===================================================================== */
'use strict';

/** Un id de club o de categoría es una CLAVE: viaja en la URL y nombra el
 *  archivo de marca. Se valida con el mismo criterio que el formulario. */
const ID = /^[a-z0-9][a-z0-9-]*$/;

/* Un sheetId de Google son 40+ caracteres de base64url. No se valida
   contra Google acá —eso es `probar-google.js`— pero sí que tenga forma de
   id: pegar media URL es el error de dedo más común y da un 502 críptico
   media hora después. */
const SHEET = /^[A-Za-z0-9_-]{20,}$/;

function copiar(cat) { return JSON.parse(JSON.stringify(cat || {})); }

function malo(motivo) { return { ok: false, motivo: motivo }; }

/**
 * Alta o edición de una categoría.
 *
 * `club` puede no existir todavía: ahí se crea, y `nombre` pasa a ser
 * obligatorio — un club sin nombre no se puede mostrar en ningún selector.
 * Si ya existe, `nombre`/`liga`/`equipoPropio` son opcionales y solo pisan
 * lo que venga.
 */
function alta(cat, d) {
  const v = d || {};
  if (!ID.test(String(v.club || ''))) return malo('El id del club va en minúsculas, sin espacios ni acentos.');
  if (!ID.test(String(v.categoria || ''))) return malo('El id de la categoría va en minúsculas, sin espacios ni acentos.');
  if (!v.label) return malo('Falta la etiqueta de la categoría: es lo que dice el selector.');
  if (!SHEET.test(String(v.sheetId || ''))) {
    return malo('Ese sheetId no tiene forma de id de Google. Pegá el id, no la URL entera.');
  }

  const nuevo = copiar(cat);
  const existia = !!nuevo[v.club];

  if (!existia) {
    if (!v.nombre) return malo('Un club nuevo necesita nombre: es lo que ve el cuerpo técnico.');
    nuevo[v.club] = {
      nombre: v.nombre,
      liga: v.liga || '',
      /* SIN `equipoPropio` EL CLIENTE NO VE NINGÚN EQUIPO, y el modo de
         fallar es el peor: la grilla sale vacía y parece que el panel está
         roto, no que la config lo está (punto 19). Se exige al crear. */
      equipoPropio: v.equipoPropio || '',
      categorias: {},
    };
  } else {
    if (v.nombre) nuevo[v.club].nombre = v.nombre;
    if (v.liga) nuevo[v.club].liga = v.liga;
    if (v.equipoPropio) nuevo[v.club].equipoPropio = v.equipoPropio;
    if (!nuevo[v.club].categorias) nuevo[v.club].categorias = {};
  }

  nuevo[v.club].categorias[v.categoria] = { label: v.label, sheetId: String(v.sheetId) };
  return { ok: true, catalogo: nuevo, creoClub: !existia };
}

/**
 * Baja de una categoría, o del club entero si se queda sin ninguna.
 *
 * NO SE BORRA UN CLUB CON CATEGORÍAS. Hay que darlas de baja una por una:
 * un club es un cliente, y borrarlo de un click desde una pantalla es
 * exactamente el gesto que uno lamenta. Los links ya emitidos siguen
 * firmados —el JWT no sabe nada de esto— así que la baja saca el acceso a
 * los datos, no al panel.
 */
function baja(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no está en el catálogo.');

  if (v.categoria) {
    if (!nuevo[v.club].categorias || !nuevo[v.club].categorias[v.categoria]) {
      return malo('Ese club no tiene esa categoría.');
    }
    delete nuevo[v.club].categorias[v.categoria];
    if (!Object.keys(nuevo[v.club].categorias).length) delete nuevo[v.club];
    return { ok: true, catalogo: nuevo };
  }

  const quedan = Object.keys(nuevo[v.club].categorias || {});
  if (quedan.length) {
    return malo('Ese club todavía tiene ' + quedan.length + ' categoría(s). '
      + 'Dalas de baja una por una: borrar un cliente de un solo gesto es el que uno lamenta.');
  }
  delete nuevo[v.club];
  return { ok: true, catalogo: nuevo };
}

/**
 * EL GUARD QUE NO SE NEGOCIA · ninguna categoría pierde su libro.
 *
 * Se compara el catálogo que va a escribirse contra el que está vigente y
 * se aborta si alguna categoría que HOY tiene `sheetId` quedaría sin él.
 * Es la versión servidor del guard de `guardar()` de la CLI, y existe por
 * lo mismo: KV le gana al código, así que una categoría sin `sheetId` pasa
 * a `activo: false` y su carga devuelve 502 — un club que funcionaba se
 * rompe sin que nadie haya tocado su planilla.
 *
 * Va acá y no en cada acción porque `alta` y `baja` escriben el catálogo
 * ENTERO: es el punto por donde pasan las dos, que es donde se pone un
 * guard para que no se lo olvide el que agregue la tercera.
 *
 * La BAJA es la excepción explícita: ahí perder la categoría es el pedido,
 * no un accidente.
 */
function librosPerdidos(vigente, nuevo, borrada) {
  const perdidas = [];
  const b = borrada || {};
  Object.keys(vigente || {}).forEach((club) => {
    const cats = (vigente[club] || {}).categorias || {};
    Object.keys(cats).forEach((slug) => {
      if (!cats[slug].sheetId) return;                       // ya venía sin libro
      if (b.club === club && (!b.categoria || b.categoria === slug)) return;  // se está borrando
      const n = ((nuevo[club] || {}).categorias || {})[slug];
      if (!n || !n.sheetId) perdidas.push(club + '/' + slug);
    });
  });
  return perdidas;
}

/** Aplica una acción y corre TODOS los guards. Es el único punto de entrada. */
function aplicar(vigente, accion, datos, validar) {
  const acciones = { alta: alta, baja: baja };
  const fn = acciones[accion];
  if (!fn) return malo('Acción desconocida: ' + accion);

  const r = fn(vigente, datos);
  if (!r.ok) return r;

  /* EL CATÁLOGO NO PUEDE QUEDAR SIN CLUBES, y conviene decirlo con esas
     palabras. `validar()` ya lo rechaza —un catálogo vacío en KV haría que
     la cascada baje al código en cada lectura— pero su mensaje es "no
     tiene ningún club", que desde una pantalla de baja se lee como un
     error del sistema y no como el límite que es. */
  if (!Object.keys(r.catalogo).length) {
    return malo('Ese es el último club del catálogo y no puede quedar vacío. '
      + 'Si de verdad querés desconectar todo, se hace por CLI.');
  }

  /* El validador del catálogo es el MISMO que usa la cascada al leer. Dos
     validadores terminan discrepando, y el que se relaja es siempre el de
     escritura. */
  const mal = validar ? validar(r.catalogo) : null;
  if (mal) return malo('El catálogo quedaría inválido: ' + mal);

  const perdidas = librosPerdidos(vigente, r.catalogo,
    accion === 'baja' ? datos : null);
  if (perdidas.length) {
    return malo('Esto dejaría sin libro a: ' + perdidas.join(', ')
      + '. Esas categorías pasarían a 502 sin que nadie tocara su planilla.');
  }

  return r;
}

module.exports = { alta, baja, aplicar, librosPerdidos, ID, SHEET };
