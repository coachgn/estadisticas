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
  const previo = (nuevo[v.club].competencia && typeof nuevo[v.club].competencia === 'object')
    ? nuevo[v.club].competencia : null;

  const bloque = v.competencia;
  const vacio = bloque === null || bloque === undefined || bloque === '';

  if (categoria) {
    if (!previo) {
      /* Sin bloque del club no hay donde colgar la categoria. Crear uno
         vacio dejaria un `porCategoria` huerfano que ninguna pantalla
         sabe leer. */
      return malo('El club todavia no tiene bloque de competencia: publica primero el del club.');
    }
    const mapa = (previo.porCategoria && typeof previo.porCategoria === 'object')
      ? previo.porCategoria : {};
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
  const hermanas = previo && previo.porCategoria;
  if (!compuesto.porCategoria && hermanas && Object.keys(hermanas).length) {
    compuesto.porCategoria = hermanas;
  }
  nuevo[v.club].competencia = compuesto;
  return { ok: true, catalogo: nuevo };
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
  };
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

module.exports = {
  zonas, alta, baja, estado, plan, renovar, informe, ciclo, aplicar,
  librosPerdidos, ALIAS_PLAN, PARTIDOS_POR_CICLO,
  vencido, estadoEfectivo, ESTADOS, PLANES, ID, SHEET, FECHA };
