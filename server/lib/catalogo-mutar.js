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

/* La tabla de alcances vive en el módulo que comparten el navegador y el
   servidor: el modal la lee y acá se hace cumplir (ver `aplicar`). */
const AUTH = require('./compartido/sgadd-auth.js');

/* El color de marca de un club: siempre #rrggbb. */
const HEX = /^#[0-9a-f]{6}$/i;

/** Un id de club o de categoría es una CLAVE: viaja en la URL y nombra el
 *  archivo de marca. Se valida con el mismo criterio que el formulario. */
const ID = /^[a-z0-9][a-z0-9-]*$/;

/* Un sheetId de Google son 40+ caracteres de base64url. No se valida
   contra Google acá —eso es `probar-google.js`— pero sí que tenga forma de
   id: pegar media URL es el error de dedo más común y da un 502 críptico
   media hora después. */
const SHEET = /^[A-Za-z0-9_-]{20,}$/;

/* =====================================================================
   EL CICLO DE VIDA DE UN CLIENTE

   `activo` · paga y usa.
   `pausado` · dejo de pagar, o el torneo termino. SE CONSERVA TODO
     —categorias, libros, zonas— y solo se corta el acceso. Es lo que lo
     distingue de la baja: reactivar es un click y no un alta de nuevo.
   `inactivo` · dado de baja. Igual de bloqueado, pero dice otra cosa: uno
     es temporal y el otro es el final de la relacion. Se separan porque el
     admin necesita saber a cual llamar para renovar.

   NINGUNO BORRA DATOS. La baja destructiva sigue siendo `baja`, que saca
   la categoria del catalogo; esto solo cambia un campo.
   ===================================================================== */
const ESTADOS = ['activo', 'pausado', 'inactivo'];

/* Los tres planes, en orden. ORO hereda todo PLATA e incluye ademas el
   analisis de scouters de MotorStats — que no es un modulo del panel sino
   una entrega cada cuatro partidos, por eso no aparece en `MODULOS`.

   LOS NOMBRES VIEJOS SE ACEPTAN AL ESCRIBIR: el catalogo en KV tiene hoy
   clubes en `"PRO"`, y rechazarlos obligaria a migrarlos a mano antes de
   poder tocar cualquier otra cosa del club. Se normalizan al canonico. */
const PLANES = ['BRONCE', 'PLATA', 'ORO'];
const ALIAS_PLAN = { BASICO: 'BRONCE', PRO: 'PLATA', MASTER: 'ORO' };

/** `AAAA-MM-DD`. Se guarda como texto y no como timestamp: es una fecha de
 *  calendario —"vence el 30"— y un timestamp la ata a una zona horaria. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vencio? SE COMPARA CONTRA EL FIN DEL DIA, no contra su comienzo.
 *
 * `Date.parse('2026-09-30')` da la medianoche UTC de ese dia, asi que a las
 * nueve de la maniana del 30 el cliente ya figuraria vencido — un dia antes
 * de lo que dice su factura. Se le suma el dia entero.
 */
function vencido(vence, ahora) {
  if (!vence || !FECHA.test(String(vence))) return false;   // sin fecha no vence
  const fin = Date.parse(vence + 'T23:59:59.999Z');
  if (!isFinite(fin)) return false;
  return (ahora === undefined ? Date.now() : ahora) > fin;
}

/**
 * El estado EFECTIVO de un club: lo que el servidor tiene que hacer valer.
 *
 * Un club `activo` con la fecha pasada esta vencido en los hechos, y
 * tratarlo como activo seria dar el servicio de un mes que no se pago. Se
 * DERIVA en vez de guardarse para que no haga falta un proceso que pase
 * clientes a vencido todas las noches: la fecha sola alcanza, y un proceso
 * que no corrio deja el estado mintiendo.
 */
function estadoEfectivo(club, ahora) {
  const c = club || {};
  const e = ESTADOS.indexOf(c.estado) !== -1 ? c.estado : 'activo';
  if (e !== 'activo') return e;
  return vencido(c.vence, ahora) ? 'vencido' : 'activo';
}

function copiar(cat) { return JSON.parse(JSON.stringify(cat || {})); }

function malo(motivo) { return { ok: false, motivo: motivo }; }

/* =====================================================================
   LOS CLIENTES DEL MISMO LIBRO · herencia y alcance

   Dos clientes del mismo torneo leen el MISMO libro: Sud América, Hogar
   Social y Universitario comparten el de DEPORTIVO. El formato de la
   tabla y los partidos sin estadísticas son hechos del TORNEO, no del
   club, y hasta acá vivían solo en el cliente que los había cargado: el
   que se sumaba al torneo arrancaba sin zonas y con una tabla que no
   cuadraba (medido en producción el 2026-09-11: Hogar Social sin zonas,
   Universitario con otras, y ninguno de los dos con los 2 partidos que
   DEPORTIVO ya tenía).

   Que dos categorías son del mismo torneo lo dice su sheetId, que es el
   único dato que lo dice con certeza y vive SOLO acá (punto 29).
   ===================================================================== */

/** Las categorías de OTROS clubes que leen el mismo libro. */
function hermanasDeLibro(cat, club, sheetId) {
  const out = [];
  if (!sheetId) return out;
  Object.keys(cat || {}).forEach((id) => {
    if (id === club) return;
    const cats = (cat[id] && cat[id].categorias) || {};
    Object.keys(cats).forEach((s) => {
      if (cats[s] && cats[s].sheetId === sheetId) out.push({ club: id, slug: s });
    });
  });
  return out;
}

/* Un mismo partido, cargado por dos admins en dos clientes, tiene ids
   distintos: se reconoce por la fecha y los dos equipos, con la misma
   normalización que el resto del proyecto (sin el « - MM», sin comillas
   ni puntos, sin acentos). */
function claveManual(p) {
  const n = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s*-\s*(MM|MF|U\d{1,2}\s*[MF]?)\s*$/, '')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
  return [String((p && p.fecha) || '').trim(), n(p && p.local), n(p && p.visitante)].join('|');
}

/**
 * Junta mapas `{TORNEO|FASE: [partidos]}` sin contar dos veces el mismo
 * partido: por id —una copia conserva el suyo— y por fecha + equipos.
 * Un partido contado dos veces rompe PJ = PG + PP sin que nadie lo vea.
 */
function unirManuales(mapas) {
  const out = {};
  const vistos = {};
  (mapas || []).forEach((m) => {
    Object.keys(m || {}).forEach((tramo) => {
      (Array.isArray(m[tramo]) ? m[tramo] : []).forEach((p) => {
        const k = String(tramo).toUpperCase() + '#' + claveManual(p);
        const kid = (p && p.id) ? 'id:' + p.id : null;
        if (vistos[k] || (kid && vistos[kid])) return;
        vistos[k] = true;
        if (kid) vistos[kid] = true;
        (out[tramo] = out[tramo] || []).push(copiar(p));
      });
    });
  });
  return out;
}

/* LA CLAVE DE UNA CATEGORÍA ES SU SLUG. Hasta el 2026-09-11 el panel
   guardaba zonas y partidos con el id de planilla del JSON
   (`deportivo-primera-2026`), que el servidor no conoce. Cuando el club
   tiene UNA sola categoría, esa clave vieja no puede ser de otra: se
   reconoce igual. */
function manualesDe(club, slug) {
  const m = club && club.partidosManuales;
  if (!m || typeof m !== 'object') return null;
  if (m[slug]) return copiar(m[slug]);
  if (Object.keys(club.categorias || {}).length === 1) {
    const ks = Object.keys(m);
    if (ks.length) return unirManuales(ks.map(k => m[k]));
  }
  return null;
}

/** El bloque de zonas que rige para UNA categoría. Es el espejo de
 *  `SGADD_CONFIG.bloqueDeCategoria` del panel: el suyo si lo tiene, si no
 *  el del club. */
function zonasDe(club, slug) {
  const comp = club && club.competencia;
  if (!comp || typeof comp !== 'object') return null;
  const pc = (comp.porCategoria && typeof comp.porCategoria === 'object') ? comp.porCategoria : {};
  if (pc[slug]) return copiar(pc[slug]);
  if (Object.keys(club.categorias || {}).length === 1 && Object.keys(pc).length === 1) {
    return copiar(pc[Object.keys(pc)[0]]);
  }
  const base = copiar(comp);
  delete base.porCategoria;
  return (base.formatos && Object.keys(base.formatos).length) ? base : null;
}

/**
 * HERENCIA · un cliente que se suma a un torneo arranca con lo que el
 * torneo ya tiene: el formato de la tabla y los partidos sin estadísticas
 * que otro cliente del mismo libro ya cargó.
 *
 * NO PISA NADA: si la categoría ya tenía zonas o partidos propios, se
 * quedan. Y las zonas salen primero del libro que el admin señaló con
 * `libroDe`, que es el torneo que eligió; los partidos, de TODOS los
 * clientes del libro, sin repetir.
 */
function heredarDelLibro(nuevo, club, slug, sheetId, preferido) {
  const hermanas = hermanasDeLibro(nuevo, club, sheetId);
  if (preferido) {
    const es = (h) => (h.club + '/' + h.slug) === preferido ? 1 : 0;
    hermanas.sort((a, b) => es(b) - es(a));
  }
  const r = { zonasDe: null, partidos: 0, de: hermanas.map(h => h.club) };
  if (!hermanas.length) return r;
  const c = nuevo[club];
  const unica = Object.keys(c.categorias || {}).length === 1;

  const pc = c.competencia && c.competencia.porCategoria;
  const tienePropias = unica ? !!c.competencia : !!(pc && pc[slug]);
  if (!tienePropias) {
    for (let i = 0; i < hermanas.length; i++) {
      const b = zonasDe(nuevo[hermanas[i].club], hermanas[i].slug);
      if (!b) continue;
      if (unica) {
        c.competencia = b;
      } else {
        c.competencia = c.competencia || {};
        c.competencia.porCategoria = Object.assign({}, c.competencia.porCategoria || {});
        c.competencia.porCategoria[slug] = b;
      }
      r.zonasDe = hermanas[i].club;
      break;
    }
  }

  if (!(c.partidosManuales && c.partidosManuales[slug])) {
    const union = unirManuales(hermanas.map(h => manualesDe(nuevo[h.club], h.slug)).filter(Boolean));
    const n = Object.keys(union).reduce((a, k) => a + union[k].length, 0);
    if (n) {
      c.partidosManuales = Object.assign({}, c.partidosManuales || {});
      c.partidosManuales[slug] = union;
      r.partidos = n;
    }
  }
  return r;
}

/* Las acciones que son del CLUB y no de una categoría: si no se dice de
   qué categoría es el cambio, cuentan todos sus libros. */
const ACCIONES_DE_CLUB = ['cambiar_plan', 'renovar'];

/**
 * A qué OTROS clubes (y categorías) llega un cambio, según su alcance.
 * `libro` = los que leen el libro de la categoría del cambio; `todos` =
 * el resto del catálogo.
 */
function objetivos(cat, d, accion, alcance) {
  if (!cat[d.club]) return { error: 'Ese club no esta en el catalogo.' };
  if (alcance === 'todos') {
    return { lista: Object.keys(cat).filter(id => id !== d.club).map(id => ({ club: id, slug: null })) };
  }
  const deClub = ACCIONES_DE_CLUB.indexOf(accion) !== -1;
  const cats = cat[d.club].categorias || {};
  const slugs = Object.keys(cats);
  const base = [d.libroDeCategoria, d.categoria].filter(s => s && cats[s])[0]
    || (slugs.length === 1 ? slugs[0] : null);
  let libros;
  if (base) libros = [cats[base].sheetId];
  else if (deClub) libros = slugs.map(s => cats[s].sheetId);
  else return { error: 'Para aplicarlo a los clientes del mismo libro hace falta saber de qué categoría es el cambio.' };
  libros = libros.filter(Boolean);
  if (!libros.length) {
    return { error: 'Esa categoría todavía no tiene libro: no hay otros clientes que lo compartan.' };
  }
  const vistos = {};
  const lista = [];
  libros.forEach(sh => hermanasDeLibro(cat, d.club, sh).forEach((h) => {
    const k = deClub ? h.club : h.club + '/' + h.slug;
    if (vistos[k]) return;
    vistos[k] = true;
    lista.push(deClub ? { club: h.club, slug: null } : h);
  }));
  return { lista: lista };
}

/**
 * El pedido para OTRO club, derivado del original. Solo lleva lo que la
 * acción necesita: nunca la `claveVieja` ni el `porCategoria` del que
 * pidió, que son claves de SU club y en otro no significan nada.
 */
function datosPara(cat, d, accion, o) {
  const base = { club: o.club, ahora: d.ahora };
  const club = cat[o.club] || {};
  const unica = Object.keys(club.categorias || {}).length <= 1;
  if (accion === 'cambiar_plan') return Object.assign(base, { plan: d.plan });
  if (accion === 'renovar') return Object.assign(base, { vence: d.vence });
  if (accion === 'partidos_manuales') {
    /* Si ese club guardó sus partidos con la clave vieja, se migra en el
       mismo gesto: con una sola categoría, la vieja no puede ser de otra. */
    const viejas = Object.keys(club.partidosManuales || {}).filter(k => k !== o.slug);
    return Object.assign(base, { categoria: o.slug, tramo: d.tramo, partidos: d.partidos,
      claveVieja: (unica && viejas.length === 1) ? viejas[0] : null });
  }
  if (accion === 'zonas') {
    let bloque = d.competencia;
    if (bloque && typeof bloque === 'object') { bloque = copiar(bloque); delete bloque.porCategoria; }
    /* A un club de UNA categoría se le escribe el bloque del club; a uno
       de varias, el de ESA categoría, para no darle a sus otros torneos
       las zonas de este. */
    const aCategoria = !!o.slug && !unica;
    return Object.assign(base, { categoria: aCategoria ? o.slug : null, competencia: bloque,
      crearBloque: aCategoria, limpiarCategorias: unica });
  }
  return base;
}

/**
 * Alta o edición de una categoría.
 *
 * `club` puede no existir todavía: ahí se crea, y `nombre` pasa a ser
 * obligatorio — un club sin nombre no se puede mostrar en ningún selector.
 * Si ya existe, `nombre`/`liga`/`equipoPropio` son opcionales y solo pisan
 * lo que venga.
 *
 * EL LIBRO SALE DE TRES LUGARES, en este orden:
 *
 *   1. `libroDe: "<club>/<categoria>"` · el MISMO libro que ya usa otra
 *      categoría. Es el caso de dos clientes del mismo torneo: Sud América
 *      y DEPORTIVO leen el mismo libro. El id se copia ACÁ, en el
 *      servidor, y nunca viaja al navegador (punto 29).
 *   2. `sheetId` · un libro nuevo, pegado por el admin.
 *   3. nada · la categoría YA EXISTE y se está editando otra cosa (la
 *      etiqueta, el equipo). Se conserva su libro: pedir el id para
 *      corregir una etiqueta obligaría al admin a ir a buscar un dato que
 *      el navegador no tiene.
 */
function alta(cat, d) {
  const v = d || {};
  if (!ID.test(String(v.club || ''))) return malo('El id del club va en minúsculas, sin espacios ni acentos.');
  if (!ID.test(String(v.categoria || ''))) return malo('El id de la categoría va en minúsculas, sin espacios ni acentos.');

  const nuevo = copiar(cat);
  const existia = !!nuevo[v.club];
  const previa = (existia && nuevo[v.club].categorias && nuevo[v.club].categorias[v.categoria]) || null;

  if (v.acento !== undefined && v.acento !== null && v.acento !== '' && !HEX.test(String(v.acento))) {
    return malo('El color de marca va como #rrggbb, por ejemplo #0d5e27.');
  }

  let sheetId = '';
  if (v.libroDe) {
    const partes = String(v.libroDe).split('/');
    const origen = nuevo[partes[0]] && nuevo[partes[0]].categorias
      && nuevo[partes[0]].categorias[partes[1]];
    if (!origen || !origen.sheetId) {
      return malo('La categoría «' + v.libroDe + '» no tiene un libro para reusar.');
    }
    sheetId = String(origen.sheetId);
  } else if (v.sheetId) {
    if (!SHEET.test(String(v.sheetId))) {
      return malo('Ese sheetId no tiene forma de id de Google. Pegá el id, no la URL entera.');
    }
    sheetId = String(v.sheetId);
  } else if (previa && previa.sheetId) {
    sheetId = String(previa.sheetId);
  } else {
    return malo('Falta el libro: elegí uno ya cargado o pegá el id de uno nuevo.');
  }

  const label = v.label ? String(v.label) : ((previa && previa.label) || '');
  if (!label) return malo('Falta la etiqueta de la categoría: es lo que dice el selector.');

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

  /* SE FUSIONA con lo que la categoría ya tenía. Reemplazarla por
     `{label, sheetId}` borraba en silencio el `nivel` publicado (punto 45)
     y cualquier campo que se sume mañana: editar la etiqueta no es una
     decisión sobre el nivel. */
  nuevo[v.club].categorias[v.categoria] = Object.assign({}, previa || {},
    { label: label, sheetId: sheetId });

  /* EL COLOR DE MARCA viaja con el club y lo publica el catálogo. Un
     cliente sin `clubes/<id>.json` quedaba con el naranja de Reconquista,
     que es el tema por defecto del panel — medido en producción con
     Universitario el 2026-09-11. Vacío lo borra: vuelve al del JSON. */
  if (v.acento !== undefined) {
    if (v.acento === '' || v.acento === null) delete nuevo[v.club].acento;
    else nuevo[v.club].acento = String(v.acento).toLowerCase();
  }

  /* HERENCIA, solo cuando la categoría ESTRENA libro: corregir la
     etiqueta de una que ya estaba no es sumarse a un torneo. */
  const estrena = !previa || previa.sheetId !== sheetId;
  const herencia = estrena
    ? heredarDelLibro(nuevo, v.club, v.categoria, sheetId, v.libroDe ? String(v.libroDe) : null)
    : null;
  return { ok: true, catalogo: nuevo, creoClub: !existia, herencia: herencia };
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

/* EL CICLO DE INFORMES DEL PLAN ORO.

   Lo que ORO agrega no es una pantalla del panel: es una ENTREGA que hace
   MotorStats cada cuatro partidos. Por eso no vive en `MODULOS` —no hay
   nada que desbloquear— sino acá, como un contador que dice a que altura
   del ciclo esta cada cliente.

   SE GUARDA EL PARTIDO EN QUE ARRANCO EL CICLO, no el numero 1..4. Con el
   numero suelto habria que acordarse de resetearlo a mano cada cuatro, y
   el dia que no se hace el contador queda mintiendo para siempre. Con el
   punto de partida, la posicion se DERIVA de los partidos jugados y no
   hace falta tocar nada entre informe e informe.
*/
const PARTIDOS_POR_CICLO = 4;

/**
 * En que punto del ciclo esta un club, dados los partidos que lleva.
 *
 * `pj` sale del libro —no se declara— asi que el contador avanza solo a
 * medida que el club juega.
 */
function ciclo(club, pj) {
  const c = club || {};
  const jugados = Number(pj);
  if (!isFinite(jugados) || jugados < 0) return null;
  const desde = Number(c.cicloDesde);
  const base = (isFinite(desde) && desde >= 0) ? desde : 0;
  const enCiclo = Math.max(0, jugados - base);
  const posicion = enCiclo % PARTIDOS_POR_CICLO;
  return {
    de: PARTIDOS_POR_CICLO,
    /* `4/4` y no `0/4` cuando se completo: el informe se debe DESPUES del
       cuarto partido, y un cartel en 0 se lee como "recien arranca". */
    en: (posicion === 0 && enCiclo > 0) ? PARTIDOS_POR_CICLO : posicion,
    completos: Math.floor(enCiclo / PARTIDOS_POR_CICLO),
    /* Cuantos faltan para el proximo informe. 0 = toca ahora. */
    faltan: (posicion === 0 && enCiclo > 0) ? 0 : (PARTIDOS_POR_CICLO - posicion),
    entregados: Number(c.informesEntregados) || 0,
    /* TOCA cuando el ciclo se completo y ese informe todavia no se marco
       como entregado. Es la pregunta que el admin le hace a la pantalla:
       a quien le tengo que mandar el informe esta semana. */
    toca: Math.floor(enCiclo / PARTIDOS_POR_CICLO) > (Number(c.informesEntregados) || 0),
  };
}

/**
 * Marca un informe como entregado.
 *
 * NO MUEVE `cicloDesde`: el ciclo lo marcan los partidos jugados, no la
 * fecha en que se mando el informe. Si se corriera el arranque, un informe
 * entregado tarde desplazaria todos los siguientes y el cliente terminaria
 * recibiendo menos de los que pago.
 */
function informe(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');
  const hoy = Number(nuevo[v.club].informesEntregados) || 0;
  nuevo[v.club].informesEntregados = Math.max(0, hoy + (v.deshacer ? -1 : 1));
  return { ok: true, catalogo: nuevo };
}

/** Cambia el estado del club. `pausar` y `reactivar` son la misma cosa. */
function estado(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');
  if (ESTADOS.indexOf(v.estado) === -1) {
    return malo('Estado desconocido: ' + v.estado + '. Va ' + ESTADOS.join(', ') + '.');
  }
  nuevo[v.club].estado = v.estado;
  return { ok: true, catalogo: nuevo };
}

/**
 * El plan del CLUB, que es el que manda.
 *
 * Hasta aca el plan viajaba solo en el token, asi que bajarle el plan a un
 * cliente obligaba a reemitir su link — y el viejo seguia firmado y valido
 * hasta vencer. Con el plan en el catalogo el cambio es inmediato para
 * todos sus usuarios y no depende de que nadie recambie nada.
 */
function plan(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');
  const crudo = String(v.plan || '').trim().toUpperCase();
  const p = ALIAS_PLAN[crudo] || crudo;
  if (PLANES.indexOf(p) === -1) {
    /* Un plan que no se reconoce NO cae a PRO. Es la misma regla que el
       frontend: un typo no puede regalar el modulo que se cobra aparte. */
    return malo('Plan desconocido: ' + v.plan + '. Va ' + PLANES.join(', ') + '.');
  }
  nuevo[v.club].plan = p;
  return { ok: true, catalogo: nuevo };
}

/**
 * PUBLICA EL BLOQUE `competencia` DE UN CLUB.
 *
 * Hasta aca las zonas de la tabla vivian en `clubes/<club>.json`, o sea
 * en un archivo del repo: cambiarlas era editar, commitear y esperar a
 * que Pages publique. La pantalla de Configuracion las guardaba en el
 * `localStorage` del que editaba y le daba el JSON para pegar a mano.
 *
 * Con esto el admin publica y le llega al cliente en la proxima carga.
 * El JSON del repo NO se toca y sigue siendo el respaldo: si KV se cae o
 * el club nunca publico nada, la tabla se pinta con lo que dice el
 * archivo, que es exactamente como funciona hoy.
 *
 * SE GUARDA EL BLOQUE ENTERO, no un parche. Fusionar zonas de dos
 * origenes daria cascadas que ninguno de los dos declaro, y la cascada es
 * justo lo que decide que zona gana: el resultado no se podria auditar
 * contra ninguna de las dos fuentes. Es la misma regla del override local
 * (punto 17).
 *
 * Un bloque VACIO borra lo publicado y devuelve el club al JSON del repo.
 * Es la unica forma de deshacer sin tener que adivinar como era antes.
 */
/* =====================================================================
   AISLAMIENTO POR CATEGORIA

   Un club corre varias categorias —Reconquista tiene Primera, U21 y
   U23— y cada una puede declarar sus propias zonas en
   `competencia.porCategoria[<planilla>]`.

   CON `categoria`, ACA SE ESCRIBE UN SOLO SLOT. El resto del bloque
   —el nivel del club y las categorias hermanas— se conserva tal cual,
   lea lo que lea el cliente que mando el pedido. Es la garantia del
   lado del servidor: aunque una pantalla vieja mandara el bloque de una
   categoria como si fuera el del club, no podria pisar a las otras.

   Sin `categoria` se reemplaza el nivel del club y `porCategoria` SE
   CONSERVA: editar un nivel no es una decision sobre el otro.
   ===================================================================== */
function zonas(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');

  const categoria = (typeof v.categoria === 'string' && v.categoria.trim())
    ? v.categoria.trim() : null;
  let previo = (nuevo[v.club].competencia && typeof nuevo[v.club].competencia === 'object')
    ? nuevo[v.club].competencia : null;

  const bloque = v.competencia;
  const vacio = bloque === null || bloque === undefined || bloque === '';

  if (categoria) {
    if (!previo) {
      /* Sin bloque del club no hay donde colgar la categoria. Crear uno
         vacio dejaria un `porCategoria` huerfano que ninguna pantalla
         sabe leer.

         SALVO al PROPAGAR a un club de varias categorías (`crearBloque`):
         ahí esa categoría es de otro torneo que el resto del club, y darle
         al club entero las zonas de este torneo sería peor. `parsear` del
         panel ya lee un bloque que solo trae `porCategoria`. */
      if (!v.crearBloque) {
        return malo('El club todavia no tiene bloque de competencia: publica primero el del club.');
      }
      previo = {};
    }
    const mapa = (previo.porCategoria && typeof previo.porCategoria === 'object')
      ? previo.porCategoria : {};
    /* LA CLAVE VIEJA SE VA. Se guardaba con el id de planilla del JSON y
       ahora con el slug del catálogo, que es la única clave que el
       servidor conoce (sin ella no puede propagar a otros clientes).
       Dejar las dos haría que la vieja quedara colgada. */
    if (v.claveVieja && v.claveVieja !== categoria) delete mapa[v.claveVieja];
    if (vacio) {
      delete mapa[categoria];        // vaciarla la devuelve al bloque del club
    } else {
      if (typeof bloque !== 'object' || Array.isArray(bloque)) {
        return malo('El bloque de zonas tiene que ser un objeto.');
      }
      if (!bloque.formatos || typeof bloque.formatos !== 'object'
          || !Object.keys(bloque.formatos).length) {
        return malo('El bloque no declara ningun formato. Para dejarlo sin zonas, publicalo vacio.');
      }
      const propio = JSON.parse(JSON.stringify(bloque));
      delete propio.porCategoria;    // la recursion es de UN nivel
      mapa[categoria] = propio;
    }
    if (Object.keys(mapa).length) previo.porCategoria = mapa;
    else delete previo.porCategoria;
    nuevo[v.club].competencia = previo;
    return { ok: true, catalogo: nuevo, categoria: categoria, borrado: vacio };
  }

  if (vacio) {
    delete nuevo[v.club].competencia;
    return { ok: true, catalogo: nuevo, borrado: true };
  }
  if (typeof bloque !== 'object' || Array.isArray(bloque)) {
    return malo('El bloque de zonas tiene que ser un objeto.');
  }
  /* Se exige que declare formatos: un bloque sin ellos no pinta ninguna
     zona y publicarlo se leeria como "se rompio", no como "lo vacie".
     Para vaciarlo esta la rama de arriba, que es explicita. */
  const tieneFormatos = bloque.formatos && typeof bloque.formatos === 'object'
    && Object.keys(bloque.formatos).length;
  const tieneCategorias = bloque.porCategoria && typeof bloque.porCategoria === 'object'
    && Object.keys(bloque.porCategoria).length;
  if (!tieneFormatos && !tieneCategorias) {
    return malo('El bloque no declara ningun formato. Para dejarlo sin zonas, publicalo vacio.');
  }
  /* Las categorias hermanas se conservan aunque el que publica no las
     haya mandado: la pantalla edita un nivel y no puede decidir sobre el
     otro. Si el bloque entrante YA trae `porCategoria`, ese manda —es
     una publicacion del bloque completo, no de un nivel suelto. */
  const compuesto = JSON.parse(JSON.stringify(bloque));
  /* `limpiarCategorias`: al propagar a un club de UNA sola categoría, un
     `porCategoria` que ya tuviera solo puede ser de esa misma categoría
     —con la clave vieja— y le ganaría al bloque nuevo sin que se note. */
  const hermanas = !v.limpiarCategorias && previo && previo.porCategoria;
  if (!compuesto.porCategoria && hermanas && Object.keys(hermanas).length) {
    compuesto.porCategoria = hermanas;
  }
  nuevo[v.club].competencia = compuesto;
  return { ok: true, catalogo: nuevo };
}

/* =====================================================================
   PARTIDOS SIN ESTADISTICAS · carga manual

   Cuando GES no registra el box score, el partido existio igual y tiene
   que contar para la tabla. Se guardan APARTE del libro, en el catalogo,
   y el panel los fusiona SOLO al armar la clasificacion: no entran al
   indice, asi que no tocan eFG%, PACE, percentiles ni nada de jugadores.

   FORMA:  catalogo[club].partidosManuales[<categoria>][<TORNEO|FASE>] = []

   EL SCOPE ES categoria + TRAMO, por lo mismo que las zonas (punto 32):
   un club corre varias categorias y un partido de la IDA no puede contar
   en la VUELTA. Aca se escribe UN SOLO slot, asi que publicar la U21
   nunca puede pisar los partidos de Primera — la garantia vive del lado
   del servidor y no depende de que la pantalla mande bien el pedido.
   ===================================================================== */

/* Un empate no existe en basquet. Dejarlo pasar daria un partido que no
   suma ni a ganados ni a perdidos, y PJ dejaria de ser PG+PP sin que
   nadie se entere. */
function _partidoManualValido_(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'cada partido tiene que ser un objeto';
  const local = String(p.local || '').trim();
  const visitante = String(p.visitante || '').trim();
  if (!local || !visitante) return 'faltan los nombres de los dos equipos';
  if (local.toUpperCase() === visitante.toUpperCase()) return 'un equipo no puede jugar contra si mismo';
  const pl = Number(p.puntosLocal), pv = Number(p.puntosVisitante);
  if (!isFinite(pl) || !isFinite(pv)) return 'los puntos tienen que ser numeros';
  if (pl < 0 || pv < 0) return 'los puntos no pueden ser negativos';
  if (!Number.isInteger(pl) || !Number.isInteger(pv)) return 'los puntos son enteros';
  if (pl === pv) return 'en basquet no hay empates: revisa el marcador';
  if (!String(p.fecha || '').trim()) return 'falta la fecha';
  return null;
}

/* Se guarda SOLO lo que el panel usa. Un objeto entero del cliente podria
   traer cualquier cosa y el catalogo se sirve a todos los clientes. */
/* EL TORNEO Y LA FASE SE DERIVAN DE LA CLAVE, no se copian del pedido.

   El partido ya vive bajo `<TORNEO|FASE>`, asi que aceptar ademas un
   campo `fase` del cliente crearia DOS fuentes de verdad para el mismo
   hecho: un registro guardado en `IDA|REGULAR` que dijera `fase:
   "VUELTA"` no se podria auditar contra nada, y la tabla lo contaria en
   IDA mientras la ficha diria VUELTA. Es el bug que este proyecto ya se
   comio con el sheetId en dos lados y con el rol funcional en dos
   modulos.

   Se estampan igual —el pedido pidio que quedaran registrados junto a la
   fecha y el resultado— pero los escribe el SERVIDOR desde la clave, asi
   que no pueden divergir. Lo que mande el cliente en esos campos se
   ignora. */
function _limpiarPartidoManual_(p, torneo, fase) {
  const o = {
    id: String(p.id || '').trim() || ('m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    fecha: String(p.fecha).trim(),
    local: String(p.local).trim(),
    puntosLocal: Number(p.puntosLocal),
    visitante: String(p.visitante).trim(),
    puntosVisitante: Number(p.puntosVisitante),
    torneo: torneo,
    fase: fase,
  };
  const nota = String(p.nota || '').trim();
  if (nota) o.nota = nota.slice(0, 200);
  return o;
}

/**
 * Reemplaza la lista de partidos manuales de UN tramo de UNA categoria.
 *
 * Es un reemplazo y no un append: la pantalla edita la lista entera y la
 * manda completa, igual que las zonas. Un append obligaria a inventar un
 * borrado aparte y a resolver conflictos de id entre dos admins.
 */
function partidosManuales(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');

  const categoria = String(v.categoria || '').trim();
  const tramo = String(v.tramo || '').trim().toUpperCase();
  if (!categoria) return malo('Falta la categoria: un partido manual siempre es de una planilla.');
  if (!/^[^|]+\|[^|]+$/.test(tramo)) {
    return malo('El tramo tiene que ser TORNEO|FASE, la misma clave que usa el selector.');
  }
  /* EL SINTETICO NO ES UN TRAMO DONDE SE JUEGUE: es la suma de los
     torneos reales. Un partido archivado ahi no pertenece a ninguno, asi
     que no aparece en la vista de su fecha — que fue exactamente lo que
     paso en produccion con dos partidos de la IDA.

     La guarda va ACA y no solo en la pantalla, por lo mismo que la
     accion de zonas escribe un solo slot (punto 32): aunque una version
     vieja del panel siga mandando `*TOTAL*`, no puede archivar ahi. */
  if (tramo.split('|')[0].indexOf('*') !== -1) {
    return malo('Un partido manual va al torneo donde se jugo (IDA, VUELTA...), '
      + 'no al TOTAL: el TOTAL es la suma de esos torneos y los cuenta solo.');
  }

  const lista = v.partidos;
  if (lista !== null && lista !== undefined && !Array.isArray(lista)) {
    return malo('Los partidos tienen que venir en una lista.');
  }

  const mapa = (nuevo[v.club].partidosManuales && typeof nuevo[v.club].partidosManuales === 'object')
    ? nuevo[v.club].partidosManuales : {};
  /* LA CLAVE VIEJA (ver `zonas`): si la categoría todavía está guardada
     con el id de planilla del JSON, se parte de ESA lista —trae los otros
     tramos, que este pedido no manda— y la clave vieja se borra. */
  const vieja = (v.claveVieja && v.claveVieja !== categoria && mapa[v.claveVieja]
    && typeof mapa[v.claveVieja] === 'object') ? mapa[v.claveVieja] : null;
  const deCat = (mapa[categoria] && typeof mapa[categoria] === 'object') ? mapa[categoria]
    : (vieja ? copiar(vieja) : {});
  if (vieja) delete mapa[v.claveVieja];

  if (!lista || !lista.length) {
    /* Vaciar el tramo es legitimo y explicito: es como se borra el ultimo
       partido cargado sin tener que adivinar una accion de borrado. */
    delete deCat[tramo];
  } else {
    if (lista.length > 200) return malo('Demasiados partidos manuales para un tramo.');
    for (let i = 0; i < lista.length; i++) {
      const err = _partidoManualValido_(lista[i]);
      if (err) return malo('Partido ' + (i + 1) + ': ' + err);
    }
    const [torneo, fase] = tramo.split('|');
    deCat[tramo] = lista.map(x => _limpiarPartidoManual_(x, torneo, fase));
  }

  if (Object.keys(deCat).length) mapa[categoria] = deCat;
  else delete mapa[categoria];

  if (Object.keys(mapa).length) nuevo[v.club].partidosManuales = mapa;
  else delete nuevo[v.club].partidosManuales;

  return { ok: true, catalogo: nuevo, categoria: categoria, tramo: tramo,
           cuantos: (deCat[tramo] || []).length };
}

/** Extiende (o fija) la fecha de vencimiento. */
function renovar(cat, d) {
  const v = d || {};
  const nuevo = copiar(cat);
  if (!nuevo[v.club]) return malo('Ese club no esta en el catalogo.');

  /* Vaciar la fecha es legitimo: un cliente sin vencimiento es uno que no
     lo tiene, no un error. Se pide explicito para que no pase por descuido
     de un campo en blanco. */
  if (v.vence === null || v.vence === '') {
    delete nuevo[v.club].vence;
    return { ok: true, catalogo: nuevo };
  }

  if (!FECHA.test(String(v.vence || ''))) return malo('La fecha va como AAAA-MM-DD.');
  if (!isFinite(Date.parse(v.vence + 'T00:00:00Z'))) return malo('Esa fecha no existe.');

  /* UNA FECHA PASADA NO SE ACEPTA ACA. Renovar hacia atras deja al cliente
     cortado con una etiqueta que dice "renovado", que es la peor
     combinacion posible: el admin cree que lo arreglo. Para cortar el
     acceso esta `pausar`, que lo dice con todas las letras. */
  if (vencido(v.vence, v.ahora)) {
    return malo('Esa fecha ya paso. Para cortar el acceso usa Pausar, que lo dice claro; '
      + 'renovar hacia atras deja al cliente cortado con una etiqueta que dice renovado.');
  }
  nuevo[v.club].vence = String(v.vence);
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
  const acciones = {
    alta: alta, baja: baja,
    /* `pausar` y `reactivar` son `estado` con el valor puesto: el admin
       piensa en verbos y el motor en un campo. Se traduce aca y no en el
       endpoint para que la CLI, si alguna vez los suma, use lo mismo. */
    pausar: (c, d) => estado(c, Object.assign({}, d, { estado: 'pausado' })),
    reactivar: (c, d) => estado(c, Object.assign({}, d, { estado: 'activo' })),
    desactivar: (c, d) => estado(c, Object.assign({}, d, { estado: 'inactivo' })),
    cambiar_plan: plan,
    informe_entregado: informe,
    renovar: renovar,
    zonas: zonas,
    partidos_manuales: partidosManuales,
  };
  const fn = acciones[accion];
  if (!fn) return malo('Acción desconocida: ' + accion);

  /* EL ALCANCE (ver `ALCANCES_POR_ACCION` en sgadd-auth.js). La tabla es
     la misma que lee el modal y se hace cumplir ACÁ: aunque una pantalla
     vieja o un pedido armado a mano pidiera propagar una baja, no pasa. */
  const d = datos || {};
  const alcance = d.alcance ? String(d.alcance) : 'club';
  if (AUTH.ALCANCES.indexOf(alcance) === -1) return malo('Alcance desconocido: ' + alcance);
  if (AUTH.alcancesDe(accion).indexOf(alcance) === -1) return malo(AUTH.motivoSinAlcance(accion, alcance));

  let r = fn(vigente, d);
  if (!r.ok) return r;
  const aplicadoA = [{ club: d.club, categoria: d.categoria || null }];

  /* DE A UNO sobre el catálogo que va quedando, y TODO O NADA: si uno
     falla no se escribe ninguno. Un cambio aplicado a la mitad de los
     clientes de un torneo es peor que ninguno, porque no se ve. */
  if (alcance !== 'club') {
    const obj = objetivos(vigente, d, accion, alcance);
    if (obj.error) return malo(obj.error);
    for (let i = 0; i < obj.lista.length; i++) {
      const o = obj.lista[i];
      const r2 = fn(r.catalogo, datosPara(r.catalogo, d, accion, o));
      if (!r2.ok) return malo(((vigente[o.club] || {}).nombre || o.club) + ': ' + r2.motivo);
      r = Object.assign({}, r, { catalogo: r2.catalogo });
      aplicadoA.push({ club: o.club, categoria: o.slug || null });
    }
  }
  r.aplicadoA = aplicadoA;
  r.alcance = alcance;

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

module.exports = {
  zonas, partidosManuales, alta, baja, estado, plan, renovar, informe, ciclo, aplicar,
  hermanasDeLibro, heredarDelLibro, unirManuales, claveManual, zonasDe, manualesDe,
  objetivos, datosPara, HEX,
  librosPerdidos, ALIAS_PLAN, PARTIDOS_POR_CICLO,
  vencido, estadoEfectivo, ESTADOS, PLANES, ID, SHEET, FECHA };
