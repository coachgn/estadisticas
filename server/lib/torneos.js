/* =====================================================================
   SGADD · TORNEOS · motor PURO (punto 67)

   Un TORNEO es una entrada del catálogo con `tipo: 'torneo'`: tiene
   categorías como cualquier club —una por ZONA, cada una con su libro— y
   no tiene plan, ni accesos, ni ficha. Existe sin cliente: Zona C de La
   Plata se ingesta entera aunque nadie la haya contratado, para tener las
   métricas de todos los equipos antes de los cruces interzonales.

   POR QUÉ UNA ENTRADA DEL CATÁLOGO Y NO UNA CLAVE APARTE. Todo lo que ya
   existe —`resolver`, el guard de datos, el índice, el selector del admin,
   `libroDe`, el alcance «libro»— trabaja sobre categorías del catálogo. Un
   torneo como categorías lo reusa entero y no suma una ruta nueva.

   LA ZONA ES UNA CATEGORÍA, y eso es lo que hace a la Liga Argentina
   multizona sin tocar el núcleo: cada conferencia es un libro, el índice
   se arma sobre ESE libro con TODOS sus equipos, y la tabla y los
   percentiles son los de la conferencia —no los del cliente—. El cruce
   entre zonas (cuartos en adelante) llega cuando exista ese libro.

   UN CLIENTE SE ENGANCHA A UNA ZONA (`vincular`): su categoría declara
   `torneo` y `zona`, y recibe el libro de la zona. El libro se COPIA al
   escribir, igual que `libroDe`, y se PROPAGA cuando la zona lo estrena:
   Jujuy queda mapeado hoy a la Conferencia Norte aunque MotorStats todavía
   no haya escrito el libro, y el día que se conecta le llega solo.

   Lo que NO hace este archivo: leer KV, ni la red. Entra un catálogo y una
   intención, sale un catálogo nuevo o un motivo — igual que
   `catalogo-mutar.js`, que es el único que lo llama.
   ===================================================================== */
'use strict';

const CORE = require('./compartido/sgadd-core.js');

const TIPO = 'torneo';
const ID = /^[a-z0-9][a-z0-9-]*$/;
const SHEET = /^[A-Za-z0-9_-]{20,}$/;
const HEX = /^#[0-9a-f]{6}$/i;

/* Lo único de un cliente que un torneo puede recibir. Pausar, cambiar el
   plan, dar accesos o marcar informes ORO no significan nada sin cliente, y
   aceptarlos dejaría campos comerciales en una entrada que no factura. */
const ACCIONES_DE_TORNEO = ['torneo', 'zonas', 'partidos_manuales', 'baja'];

function esTorneo(club) { return !!club && club.tipo === TIPO; }

function malo(motivo) { return { ok: false, motivo: motivo }; }
function copiar(cat) { return JSON.parse(JSON.stringify(cat || {})); }

/**
 * Los equipos de una zona, normalizados.
 *
 * `id` es el `idEquipo` de Gesdeportiva (el número estable de
 * `/equipo/<idClub>/<idEquipo>/`); `clave` es lo que se compara contra el
 * libro (`claveEquipo`, el normalizador de todo el proyecto). El id puede
 * faltar —un equipo que el sitio todavía no lista, o un torneo que no sale
 * de Gesdeportiva— y ahí manda la clave.
 */
function normalizarEquipos(lista) {
  if (!Array.isArray(lista)) return { error: 'Los equipos van como una lista.' };
  const out = [];
  for (let i = 0; i < lista.length; i++) {
    const e = lista[i] || {};
    const nombre = String(typeof e === 'string' ? e : (e.nombre || '')).trim();
    if (!nombre) return { error: 'El equipo ' + (i + 1) + ' no tiene nombre.' };
    const clave = CORE.claveEquipo(nombre);
    const id = (e.id === null || e.id === undefined || e.id === '') ? null : Number(e.id);
    if (id !== null && !(Number.isInteger(id) && id > 0)) return { error: nombre + ': el id va como número entero.' };
    const n = { id: id, nombre: nombre, clave: clave };
    if (e.idClub) n.idClub = Number(e.idClub);
    if (e.ciudad) n.ciudad = String(e.ciudad);
    if (Array.isArray(e.alias) && e.alias.length) n.alias = e.alias.map(String);
    if (e.provisorio) n.provisorio = String(e.provisorio);
    out.push(n);
  }
  return { equipos: out };
}

/**
 * UN EQUIPO ESTÁ EN UNA SOLA ZONA DE SU TORNEO, y un id o una clave
 * repetidos lo dirían dos veces. Se rechaza en vez de quedarse con el
 * primero: con dos zonas que reclaman al mismo equipo, a qué zona se
 * engancha el cliente sería una adivinanza.
 */
function duplicados(zonas) {
  const porClave = {}, porId = {};
  const out = [];
  Object.keys(zonas).forEach((z) => {
    (zonas[z].equipos || []).forEach((e) => {
      if (porClave[e.clave]) out.push(e.nombre + ' (zonas ' + porClave[e.clave] + ' y ' + z + ')');
      else porClave[e.clave] = z;
      if (e.id !== null && e.id !== undefined) {
        if (porId[e.id]) out.push('id ' + e.id + ' (' + porId[e.id] + ' y ' + e.nombre + ')');
        else porId[e.id] = e.nombre;
      }
    });
  });
  return out;
}

/**
 * Las zonas de tabla que se DERIVAN del formato, o `null` si el formato no
 * declara puestos.
 *
 * Solo se traduce lo que el reglamento dice con puestos: los directos a
 * octavos y la reclasificación. NO se inventa un descenso: la Liga
 * Argentina no lo publicó para esta temporada, y una zona roja que el
 * reglamento no tiene es un dato inventado en la tabla del cliente.
 */
function competenciaDesdeFormato(formato, equiposPorZona) {
  const fases = (formato && Array.isArray(formato.fases)) ? formato.fases : [];
  const zonas = [];
  fases.forEach((f) => {
    if (Array.isArray(f.directos) && f.directos.length === 2) {
      zonas.push({ id: f.id + '-directo', desde: f.directos[0], hasta: f.directos[1],
        label: f.label + ' · directo', tono: 'exito' });
    }
  });
  fases.forEach((f) => {
    if (Array.isArray(f.puestos) && f.puestos.length === 2) {
      zonas.push({ id: f.id, desde: f.puestos[0], hasta: f.puestos[1], label: f.label, tono: 'aviso' });
    }
  });
  if (!zonas.length) return null;
  const n = Number(equiposPorZona) || null;
  const idF = 'regular' + (n ? '-' + n : '');
  const f = { label: 'Fase regular' + (n ? ' · ' + n + ' equipos' : ''), zonas: zonas };
  if (n) f.equiposEsperados = n;
  const formatos = {};
  formatos[idF] = f;
  return { ordenTabla: ['PCT', 'DIF', 'PF'], formatos: formatos, porTramo: { '*': idF } };
}

/** Las categorías de clientes enganchadas a una zona del torneo. */
function vinculadas(cat, torneoId, zonaId) {
  const out = [];
  Object.keys(cat || {}).forEach((club) => {
    if (club === torneoId) return;
    const cats = (cat[club] && cat[club].categorias) || {};
    Object.keys(cats).forEach((s) => {
      const k = cats[s];
      if (k && k.torneo === torneoId && (!zonaId || k.zona === zonaId)) out.push({ club: club, slug: s });
    });
  });
  return out;
}

/** La categoría del torneo que representa a una zona. */
function categoriaDeZona(torneo, zonaId) {
  const cats = (torneo && torneo.categorias) || {};
  const s = Object.keys(cats).find(x => cats[x] && cats[x].zona === zonaId);
  return s ? { slug: s, k: cats[s] } : null;
}

/**
 * Alta o edición de un torneo.
 *
 *   { club, nombre, liga, temporada, nivel, acento, marca, fuente, formato,
 *     zonas: { <zona>: { slug, label, sheetId?, libroDe?, equipos: [...] } } }
 *
 * EL LIBRO DE UNA ZONA ES OPCIONAL: la Liga Argentina 2026-27 se declara
 * hoy y MotorStats escribe su libro cuando arranque. Una zona sin libro va
 * al selector deshabilitada, como cualquier categoría sin `sheetId`.
 *
 * `sheetId` vacío NO borra el libro de una zona que ya lo tiene: editar los
 * equipos no es desconectarla (y el guard de libros perdidos lo frenaría
 * igual). Para cambiarlo se manda otro.
 */
function torneo(cat, d, deps) {
  const v = d || {};
  const id = String(v.club || '').trim().toLowerCase();
  if (!ID.test(id)) return malo('El id del torneo va en minúsculas, sin espacios ni acentos.');
  const nuevo = copiar(cat);
  const previo = nuevo[id] || null;
  if (previo && !esTorneo(previo)) {
    return malo('«' + id + '» ya es un cliente. Un torneo necesita un id propio: '
      + 'si no, sus zonas quedarían mezcladas con las categorías que ese club paga.');
  }
  const nombre = String(v.nombre || (previo && previo.nombre) || '').trim();
  if (!nombre) return malo('Un torneo necesita nombre: es lo que ve el selector.');
  if (v.acento !== undefined && v.acento !== null && v.acento !== '' && !HEX.test(String(v.acento))) {
    return malo('El color de marca va como #rrggbb.');
  }

  const zonasIn = v.zonas || {};
  const ids = Object.keys(zonasIn);
  if (!ids.length && !previo) return malo('Un torneo necesita al menos una zona.');

  const t = previo ? Object.assign({}, previo) : { tipo: TIPO, categorias: {} };
  t.tipo = TIPO;
  t.nombre = nombre;
  ['liga', 'temporada'].forEach((c) => { if (v[c] !== undefined) t[c] = String(v[c] || ''); });
  if (v.acento !== undefined) {
    if (v.acento) t.acento = String(v.acento).toLowerCase(); else delete t.acento;
  }
  ['marca', 'fuente', 'formato'].forEach((c) => {
    if (v[c] === undefined) return;
    if (v[c] === null) { delete t[c]; return; }
    if (typeof v[c] !== 'object' || Array.isArray(v[c])) return;
    t[c] = JSON.parse(JSON.stringify(v[c]));
  });
  t.categorias = Object.assign({}, t.categorias || {});

  /* Las zonas se validan todas antes de escribir ninguna: un torneo con la
     mitad de las zonas cargadas no se ve como un error, se ve como un
     torneo más chico. */
  const normal = {};
  for (let i = 0; i < ids.length; i++) {
    const z = ids[i];
    if (!ID.test(z)) return malo('La zona «' + z + '» va en minúsculas, sin espacios ni acentos.');
    const zin = zonasIn[z] || {};
    const actual = categoriaDeZona(t, z);
    const slug = String(zin.slug || (actual && actual.slug) || (id + '-' + z)).toLowerCase();
    if (!ID.test(slug)) return malo('El id de la zona «' + z + '» va en minúsculas, sin espacios ni acentos.');
    if (t.categorias[slug] && t.categorias[slug].zona && t.categorias[slug].zona !== z) {
      return malo('El id «' + slug + '» ya es de la zona ' + t.categorias[slug].zona + '.');
    }
    const eq = zin.equipos !== undefined ? normalizarEquipos(zin.equipos) : { equipos: actual ? (actual.k.equipos || []) : [] };
    if (eq.error) return malo('Zona ' + z + ': ' + eq.error);

    let sheetId = actual && actual.k.sheetId ? String(actual.k.sheetId) : '';
    if (zin.libroDe) {
      const p = String(zin.libroDe).split('/');
      const o = nuevo[p[0]] && nuevo[p[0]].categorias && nuevo[p[0]].categorias[p[1]];
      if (!o || !o.sheetId) return malo('Zona ' + z + ': «' + zin.libroDe + '» no tiene un libro para reusar.');
      sheetId = String(o.sheetId);
    } else if (zin.sheetId) {
      if (!SHEET.test(String(zin.sheetId))) return malo('Zona ' + z + ': ese sheetId no tiene forma de id de Google. Pegá el id, no la URL.');
      sheetId = String(zin.sheetId);
    }
    const label = String(zin.label || (actual && actual.k.label) || '').trim();
    if (!label) return malo('Zona ' + z + ': falta la etiqueta, que es lo que dice el selector.');
    normal[z] = { slug: slug, anterior: actual ? actual.slug : null, label: label, sheetId: sheetId,
      equipos: eq.equipos, nivel: zin.nivel || v.nivel || null };
  }
  const dup = duplicados(Object.assign({}, zonasDelTorneo(t), normal));
  if (dup.length) return malo('Equipos repetidos entre zonas: ' + dup.join(', ') + '.');

  const estrenan = [];
  Object.keys(normal).forEach((z) => {
    const n = normal[z];
    const previa = (n.anterior && t.categorias[n.anterior]) || {};
    if (n.anterior && n.anterior !== n.slug) delete t.categorias[n.anterior];
    const k = Object.assign({}, previa, { label: n.label, sheetId: n.sheetId, zona: z, equipos: n.equipos });
    if (n.nivel) k.nivel = String(n.nivel);
    if (n.sheetId && n.sheetId !== (previa.sheetId || '')) estrenan.push(z);
    t.categorias[n.slug] = k;
  });

  /* LAS ZONAS DE TABLA SALEN DEL FORMATO solo si el torneo no tiene unas
     publicadas: lo que el admin editó en Configuración manda sobre lo que
     se deduce del reglamento. Todas las zonas comparten formato, así que
     van al bloque del torneo y no por categoría. */
  if (!t.competencia && t.formato) {
    const porZona = t.formato.equiposPorZona || null;
    const comp = competenciaDesdeFormato(t.formato, porZona);
    if (comp) t.competencia = comp;
  }
  nuevo[id] = t;

  /* LA PROPAGACIÓN · la zona estrena libro y se lo lleva a los clientes
     enganchados. Con la herencia de zonas y partidos manuales del mismo
     libro (`heredarDelLibro`), que es lo que ya recibe un cliente que se
     suma a un torneo por `libroDe`. */
  const propagado = [];
  estrenan.forEach((z) => {
    const zc = categoriaDeZona(t, z);
    vinculadas(nuevo, id, z).forEach((o) => {
      nuevo[o.club].categorias[o.slug] = Object.assign({}, nuevo[o.club].categorias[o.slug], { sheetId: zc.k.sheetId });
      if (deps && deps.heredar) deps.heredar(nuevo, o.club, o.slug, zc.k.sheetId, id + '/' + zc.slug);
      propagado.push({ club: o.club, categoria: o.slug, zona: z });
    });
  });

  return { ok: true, catalogo: nuevo, creoClub: !previo, propagado: propagado };
}

/** zona → {equipos} de un torneo ya guardado, para el control de duplicados. */
function zonasDelTorneo(t) {
  const out = {};
  const cats = (t && t.categorias) || {};
  Object.keys(cats).forEach((s) => { if (cats[s] && cats[s].zona) out[cats[s].zona] = { equipos: cats[s].equipos || [] }; });
  return out;
}

/** El equipo de la zona que corresponde a lo que escribió el admin: por id, por clave o por alias. */
function buscarEquipo(equipos, valor) {
  const crudo = String(valor == null ? '' : valor).trim();
  if (!crudo) return null;
  const n = Number(crudo);
  if (Number.isInteger(n) && n > 0) {
    const e = (equipos || []).find(x => x.id === n);
    if (e) return e;
  }
  const c = CORE.claveEquipo(crudo);
  return (equipos || []).find(x => x.clave === c
    || (x.alias || []).some(a => CORE.claveEquipo(a) === c)) || null;
}

/**
 * Engancha la categoría de un cliente a la zona de un torneo.
 *
 *   { club, categoria, torneo, zona, equipo, label? }
 *
 * EL EQUIPO TIENE QUE SER DE ESA ZONA. Es el mapeo que pide el cliente
 * multizona: Jujuy es de la Norte, y engancharlo a la Sur le mostraría una
 * conferencia donde su equipo no juega — el cliente vería una grilla sin su
 * equipo y el panel parecería roto (punto 19).
 *
 * El equipo va a la CATEGORÍA si difiere del club (`equipo()` de
 * catalogo-mutar), así que un club con otra categoría en otro torneo no se
 * entera.
 */
function vincular(cat, d, deps) {
  const v = d || {};
  const nuevo = copiar(cat);
  const club = String(v.club || '').trim().toLowerCase();
  const slug = String(v.categoria || '').trim().toLowerCase();
  const tId = String(v.torneo || '').trim().toLowerCase();
  const z = String(v.zona || '').trim().toLowerCase();
  const c = nuevo[club];
  if (!c) return malo('Ese club no está en el catálogo.');
  if (esTorneo(c)) return malo('«' + club + '» es un torneo: se engancha un CLIENTE a un torneo, no un torneo a otro.');
  if (!ID.test(slug)) return malo('El id de la categoría va en minúsculas, sin espacios ni acentos.');
  const t = nuevo[tId];
  if (!esTorneo(t)) return malo('«' + tId + '» no es un torneo del catálogo.');
  const zc = categoriaDeZona(t, z);
  if (!zc) return malo('El torneo no tiene la zona «' + z + '».');

  const e = buscarEquipo(zc.k.equipos, v.equipo || c.equipoPropio);
  if (!e) {
    const otra = Object.keys(zonasDelTorneo(t)).find(o => o !== z && buscarEquipo(categoriaDeZona(t, o).k.equipos, v.equipo || c.equipoPropio));
    return malo(otra
      ? 'Ese equipo juega en la zona ' + otra + ', no en la ' + z + '.'
      : 'Ese equipo no está en la zona ' + z + ' del torneo: elegilo de la lista de la zona.');
  }

  const previa = (c.categorias || {})[slug] || null;
  if (previa && previa.torneo && previa.torneo !== tId) {
    return malo('Esa categoría ya está enganchada a «' + previa.torneo + '». Usá otra: una categoría es un torneo.');
  }
  const label = String(v.label || (previa && previa.label) || zc.k.label).trim();
  c.categorias = Object.assign({}, c.categorias || {});
  /* SIN LIBRO EN LA ZONA NO SE PISA uno que la categoría ya tenga: engancharla
     antes de que MotorStats escriba el libro no puede desconectarla. */
  const sheetId = zc.k.sheetId || (previa && previa.sheetId) || '';
  const estrena = !!zc.k.sheetId && (!previa || previa.sheetId !== zc.k.sheetId);
  c.categorias[slug] = Object.assign({}, previa || {}, { label: label, sheetId: sheetId, torneo: tId, zona: z });
  if (!previa && t.nivel) c.categorias[slug].nivel = t.nivel;
  if (!previa && zc.k.nivel) c.categorias[slug].nivel = zc.k.nivel;

  /* El equipo: por la misma función que usa la CLI y el alta. */
  if (deps && deps.equipo) {
    const re = deps.equipo(nuevo, { club: club, categoria: slug, equipoPropio: e.nombre });
    if (!re.ok) return re;
    nuevo[club] = re.catalogo[club];
  }
  let herencia = null;
  if (estrena && deps && deps.heredar) herencia = deps.heredar(nuevo, club, slug, zc.k.sheetId, tId + '/' + zc.slug);
  return { ok: true, catalogo: nuevo, equipo: e, herencia: herencia, sinLibro: !sheetId };
}

/**
 * Lo que el Panel Master necesita de un torneo, sin un solo sheetId.
 * Solo para el admin: `catalogo.publico` lo cuelga de su bandera.
 */
function publicoDeZona(k) {
  return {
    zona: k.zona || null,
    equipos: (k.equipos || []).map(e => {
      const o = { id: e.id, nombre: e.nombre, clave: e.clave };
      if (e.ciudad) o.ciudad = e.ciudad;
      if (e.provisorio) o.provisorio = true;
      return o;
    }),
  };
}

/**
 * Un archivo `torneos/<id>.json` → la intención de la acción `torneo`.
 * Lo usan la CLI y los tests; los libros van aparte (`libros`) porque el
 * archivo es público y el sheetId no.
 */
function intencionDesdeArchivo(doc, libros) {
  const d = doc || {};
  const zonas = {};
  Object.keys(d.zonas || {}).forEach((z) => {
    const zin = d.zonas[z];
    zonas[z] = { slug: zin.slug, label: zin.label, equipos: zin.equipos, nivel: zin.nivel || d.nivel || null };
    if (libros && libros[z]) zonas[z].sheetId = libros[z];
  });
  const acento = d.acento || (d.marca && d.marca.acento) || undefined;
  return {
    accion: 'torneo', club: d.id, nombre: d.nombre, liga: d.liga, temporada: d.temporada, nivel: d.nivel,
    acento: acento, marca: d.marca || undefined, fuente: d.fuente || undefined,
    formato: d.formato ? Object.assign({}, d.formato, { equiposPorZona: d.formato.equiposPorZona || null }) : undefined,
    zonas: zonas,
  };
}

module.exports = {
  TIPO, ACCIONES_DE_TORNEO, esTorneo, normalizarEquipos, duplicados, competenciaDesdeFormato,
  vinculadas, categoriaDeZona, torneo, vincular, buscarEquipo, publicoDeZona, zonasDelTorneo,
  intencionDesdeArchivo,
};
