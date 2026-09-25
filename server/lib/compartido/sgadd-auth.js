/* ARCHIVO GENERADO · NO EDITAR ACÁ.
 *
 * Copia mecánica de js/sgadd-auth.js, que es la fuente de verdad.
 * Existe porque Vercel despliega con raíz en `server/` y no sube el
 * resto del repo. Para regenerar:
 *
 *     node server/bin/sincronizar-compartido.js
 *
 * `test-backend.js` falla si este archivo difiere del original.
 */
/* =====================================================================
   SGADD · Roles, planes y permisos

   Quién ve qué: los administradores ven todo, y un club ve lo suyo según
   el plan que contrató.

   ---------------------------------------------------------------------
   LEER ESTO ANTES DE TOCAR NADA: ESTO NO ES SEGURIDAD

   Es un GATE DE INTERFAZ, y la diferencia importa.

   El panel es un sitio ESTÁTICO servido por GitHub Pages y lee las
   planillas por GViz ANÓNIMO. O sea:

     · los `sheetId` viven en `clubes/<club>.json`, que es un archivo
       público: cualquiera lo abre y lee la planilla ENTERA sin pasar por
       el panel;
     · todo este módulo corre en el navegador del usuario, así que
       cualquiera con la consola abierta se pone `plan: 'PRO'` o se cambia
       el `equipoAsignado` y ve todo.

   Lo que ESTE módulo sí hace, y que es valioso para el producto:

     · cada club abre su link y encuentra SU vista, sin tener que ignorar
       once equipos que no le importan,
     · el plan Básico ve que el módulo Pro existe y cómo pedirlo,
     · un cruce de scouting no se puede armar mal por accidente.

   Lo que NO hace, y no puede hacer sin backend: impedir que alguien que
   quiera mirar los datos de otro club los mire. Eso es la deuda técnica
   del punto 10 de CLAUDE.md y se cierra con un servidor que autentique y
   sirva los datos ya filtrados — no con más código acá.

   Al escribir un mensaje de la UI hay que respetar esa distinción: se
   dice "tu plan no incluye este módulo", nunca "tus datos están
   protegidos".
   ===================================================================== */
const SGADD_AUTH = (function () {
  'use strict';

  /* Los tres mails con acceso total. Es una lista literal a propósito: un
     patrón (`@motorstats.ar`, por ejemplo) le daría admin a cualquier mail
     nuevo de ese dominio sin que nadie lo decida. */
  const ADMINS = [
    'freytesgn@gmail.com',
    'francasa09@gmail.com',
    'motorstats.ar@gmail.com',
  ];

  /* MASTER es un plan declarado que HOY no desbloquea nada que PRO no
     tenga: ningun modulo lo distingue en `MODULOS`. Se reconoce para que
     el admin pueda etiquetar la relacion comercial desde el Panel Master,
     y queda anotado que sigue siendo una etiqueta hasta que se decida que
     incluye. Inventarle un modulo seria peor que dejarlo explicito. */
  const PLANES = { BRONCE: 'BRONCE', PLATA: 'PLATA', ORO: 'ORO' };

  /* El orden importa para comparar planes: el del CLUB acota al del token
     (ver `planEfectivo` del servidor), y para eso hay que saber cual es
     menor. */
  const ORDEN_PLAN = { BRONCE: 0, PLATA: 1, ORO: 2 };

  /* LOS NOMBRES VIEJOS SIGUEN ENTRANDO, Y NO ES POR NOSTALGIA.

     Los tokens ya emitidos llevan `plan: "PRO"` o `"BASICO"` FIRMADO, y un
     JWT no se puede editar: sigue diciendo eso hasta que venza —el master
     del admin vence en 2027—. Sin estos alias cada uno de esos tokens
     caeria al plan mas bajo por "plan desconocido", que es la regla
     correcta para un typo y la PEOR posible para un rename: todos los
     clientes bajados de plan a la vez, en silencio y sin que nadie toque
     nada. Lo mismo con el catalogo en KV, donde hoy hay clubes en `PRO`.

     No se sacan hasta que no quede un token viejo vivo. */
  const ALIAS_PLAN = { BASICO: 'BRONCE', PRO: 'PLATA', MASTER: 'ORO' };

  /**
   * CUÁNTAS PERSONAS DEL CLUB PUEDEN ENTRAR, por plan.
   *
   * VIVE ACÁ, EN EL MOTOR COMPARTIDO, y no en la landing ni en el
   * servidor: la landing se lo promete al cliente y el servidor lo hace
   * cumplir al dar de alta un mail. Con dos tablas, la que se relaja es
   * siempre la del servidor —que es la que decide— y el cliente termina
   * con más accesos de los que paga, o con menos de los que se le
   * prometieron. Es el mismo bug que ya tuvo el rol funcional (punto 8).
   *
   * `server/lib/compartido/sgadd-auth.js` es la copia vendorizada, con su
   * test de deriva byte a byte.
   */
  const CUPO_MAILS = { BRONCE: 2, PLATA: 3, ORO: 4 };

  /** El cupo de un plan, ya normalizado. Un plan desconocido cae a BRONCE. */
  function cupoDeMails(plan) {
    return CUPO_MAILS[normalizarPlan(plan)];
  }

  /* =====================================================================
     EL ALCANCE DE UN CAMBIO DEL PANEL MASTER · una sola tabla

     Todo cambio del Panel Master pregunta en qué clientes aplicarse: solo
     en este, en los que comparten su libro (el mismo torneo) o en todos.
     Qué acción admite qué alcance vive ACÁ, en el módulo que comparten el
     navegador y el servidor —igual que `CUPO_MAILS`—: el modal lo lee
     para ofrecer las opciones y el servidor lo hace cumplir. Con dos
     tablas, la que se relaja es siempre la del servidor.

     Lo que NO se propaga se dice en el modal con las palabras de
     `motivoSinAlcance`: una opción gris sin motivo se lee como un bug.
     ===================================================================== */
  const ALCANCES = ['club', 'libro', 'todos'];

  const ALCANCES_POR_ACCION = {
    /* Hechos del TORNEO: el formato de la tabla y los resultados sin box
       score son los mismos para todos los clientes de ese libro. */
    zonas: ['club', 'libro', 'todos'],
    partidos_manuales: ['club', 'libro'],
    /* Comerciales, pero se pueden querer en bloque: una promo para todo un
       torneo, una renovación de temporada. */
    cambiar_plan: ['club', 'libro', 'todos'],
    renovar: ['club', 'libro', 'todos'],
  };

  const MOTIVOS_SIN_ALCANCE = {
    partidos_manuales: 'Los partidos son de UN torneo: en otro libro esos equipos no existen.',
    alta: 'Es la identidad de este cliente: su nombre, su equipo, su color y su libro son suyos.',
    pausar: 'Cortar el acceso se hace de a un cliente: de un click a varios es el gesto que se lamenta.',
    reactivar: 'Devolver el acceso se hace de a un cliente, igual que cortarlo.',
    desactivar: 'Dar de baja se hace de a un cliente: de un click a varios es el gesto que se lamenta.',
    informe_entregado: 'El informe del plan ORO es un servicio de este cliente.',
    cambiar_estado: 'El estado de una suscripción se cambia de a un cliente: cortar o abrir'
      + ' el acceso a varios de un click es el gesto que se lamenta.',
    probar: 'Una prueba se le da a un cliente, no a un torneo entero.',
    cambiar_equipo: 'El equipo propio es la identidad de este cliente en ese libro: en otro club es otro equipo.',
    baja: 'Una baja se hace de a un cliente.',
    cambiar_laboratorio: 'Una capa de laboratorio se prueba con UN cliente antes de ofrecerla.',
  };

  /** Los alcances que admite una acción. Una que no figura, solo `club`. */
  function alcancesDe(accion) {
    return (ALCANCES_POR_ACCION[accion] || ['club']).slice();
  }

  /** Por qué una acción NO admite un alcance ('' si lo admite). */
  function motivoSinAlcance(accion, alcance) {
    if (alcance === 'club' || alcancesDe(accion).indexOf(alcance) !== -1) return '';
    return MOTIVOS_SIN_ALCANCE[accion] || 'Este cambio se aplica de a un cliente.';
  }

  /** Un plan que no se reconoce cae al MAS BAJO y nunca al mas alto: ante
   *  la duda, un typo no puede regalar el modulo que se cobra aparte. */
  function normalizarPlan(p) {
    const v = String(p == null ? '' : p).trim().toUpperCase();
    const canonico = ALIAS_PLAN[v] || v;
    return ORDEN_PLAN[canonico] !== undefined ? canonico : PLANES.BRONCE;
  }

  /* =====================================================================
     LA SUSCRIPCIÓN ES DE LA CATEGORÍA · el club es el padre, la categoría
     el hijo que se contrata

     Un club es la IDENTIDAD del cliente: su nombre, su link, sus accesos.
     Lo que se CONTRATA es una categoría —un torneo con su libro— y un
     mismo club puede tener Primera en ORO, la U23 en PLATA y la U19 en
     prueba. Hasta el 2026-09-13 el plan y el estado vivían solo en el
     club, así que pausar la U19 cortaba también Primera, y un club con
     dos categorías pagaba un solo plan para las dos.

     LA CASCADA, y por qué es la que es:

       PLAN    categoría  →  club  →  (nada: el servidor decide, ver
                                        `planEfectivo`)
       ESTADO  un club pausado, dado de baja o vencido CORTA TODO  →  si
               el club tiene acceso, manda el estado de la categoría  →
               si no declara, hereda el del club

     El club corta todo porque es el titular de la cuenta: pausar al
     cliente entero no puede dejarle abierta una categoría que tenía
     `activo` escrito. Y la categoría HEREDA cuando no declara porque el
     catálogo de hoy tiene todo en el club: sin herencia, cada cliente
     existente perdería su plan al leerse con esta regla.

     VIVE ACÁ, en el motor que comparten el navegador y el servidor
     (`server/lib/compartido/`), por lo mismo que `CUPO_MAILS`: el servidor
     la hace valer con un 403 y el Panel Master la pinta. Dos copias
     terminan discrepando, y la pantalla mostraría «activo» sobre una
     categoría a la que el backend ya le niega los datos.
     ===================================================================== */

  /* `prueba` es la demo o el período de prueba: DA ACCESO igual que
     `activo`, pero dice otra cosa. El admin necesita saber a quién llamar
     cuando termina, y un cliente en prueba no es uno que ya paga. */
  const ESTADOS_SUSCRIPCION = ['activo', 'prueba', 'pausado', 'inactivo'];
  const ESTADOS_CON_ACCESO = ['activo', 'prueba'];

  /** ¿Este estado efectivo recibe el servicio? */
  function tieneAcceso(estado) {
    return ESTADOS_CON_ACCESO.indexOf(estado) !== -1;
  }

  /* SE COMPARA CONTRA EL FIN DEL DÍA: `Date.parse('2026-09-30')` es la
     medianoche UTC, y a las nueve de la mañana del 30 el cliente figuraría
     vencido un día antes de lo que dice su factura. */
  function suscripcionVencida(vence, ahora) {
    if (!vence || !/^\d{4}-\d{2}-\d{2}$/.test(String(vence))) return false;
    /* EL CORTE ES A LAS 23:59 DE ARGENTINA (2026-09-18). Estaba en UTC, o
       sea a las 20:59 de acá, y los mails de vencimiento le dicen al
       cliente «23:59 hs»: el reloj del corte y el del aviso tienen que ser
       el mismo. Argentina no tiene horario de verano: el -03:00 es fijo. */
    const fin = Date.parse(vence + 'T23:59:59.999-03:00');
    if (!isFinite(fin)) return false;
    return (ahora === undefined ? Date.now() : ahora) > fin;
  }

  /**
   * El estado EFECTIVO de un club (o de cualquier objeto con `estado` y
   * `vence`). Un `activo` o una `prueba` con la fecha pasada están
   * vencidos en los hechos: se DERIVA en vez de guardarse, para que no
   * haga falta un proceso nocturno que, el día que no corra, deje el
   * estado mintiendo.
   */
  function estadoSuscripcion(obj, ahora) {
    const c = obj || {};
    const e = ESTADOS_SUSCRIPCION.indexOf(c.estado) !== -1 ? c.estado : 'activo';
    if (!tieneAcceso(e)) return e;
    return suscripcionVencida(c.vence, ahora) ? 'vencido' : e;
  }

  /**
   * Plan y estado de UNA categoría, resueltos con la cascada de arriba.
   *
   * Devuelve de dónde salió cada uno (`planDe`, `estadoDe`): un «ORO» que
   * la categoría hereda del club y uno que tiene escrito se ven igual, y
   * el Panel Master tiene que poder decir cuál es cuál antes de que el
   * admin toque el del club creyendo que cambia solo una categoría.
   *
   * @returns {{estado, estadoDe, estadoDeclarado, acceso, plan, planDe,
   *   vence, venceDe, pruebaVencida}}
   *   `plan` es null si ni la categoría ni el club declaran uno.
   *   `estado` es el EFECTIVO, ya derivado de las fechas; `estadoDeclarado`
   *   es el escrito que rige, que es con lo que se deriva.
   */
  function suscripcionDeCategoria(club, slug, ahora) {
    const c = club || {};
    const k = (slug && c.categorias && c.categorias[slug]) || {};
    const delClub = estadoSuscripcion(c, ahora);
    const propio = ESTADOS_SUSCRIPCION.indexOf(k.estado) !== -1 ? k.estado : null;

    let estado = delClub;
    let estadoDe = 'club';
    let estadoDeclarado = ESTADOS_SUSCRIPCION.indexOf(c.estado) !== -1 ? c.estado : 'activo';
    let vence = c.vence || null;
    let venceDe = c.vence ? 'club' : null;
    let pruebaVencida = false;

    if (tieneAcceso(delClub)) {
      /* La categoría declara el suyo. Un club pausado, dado de baja o
         vencido ya cayó afuera de esta rama: es el titular y corta todo. */
      if (propio) { estado = propio; estadoDe = 'categoria'; estadoDeclarado = propio; }

      /* EL VENCIMIENTO DE LA CATEGORÍA (2026-09-13). Solo ACOTA: la fecha
         del club sigue cortando todo, así que una categoría con una fecha
         más lejana que la del club no se estira más allá de la factura.
         Se aplica sobre el estado que rige, propio o heredado.

         UNA PRUEBA VENCIDA PASA A PAUSADA, no a vencida: no hubo un período
         pago que vencer, y lo que corresponde es que el admin decida si la
         convierte en activa. Una categoría `activo` con su fecha pasada sí
         queda vencida, igual que un club. Las dos cosas se DERIVAN de la
         fecha y no se guardan: el día que un proceso nocturno no corriera,
         el estado quedaría mintiendo. */
      if (k.vence && /^\d{4}-\d{2}-\d{2}$/.test(String(k.vence))) {
        vence = String(k.vence);
        venceDe = 'categoria';
        if (tieneAcceso(estado) && suscripcionVencida(k.vence, ahora)) {
          pruebaVencida = estado === 'prueba';
          estado = pruebaVencida ? 'pausado' : 'vencido';
          estadoDe = 'categoria';
        }
      }
    }

    let plan = null;
    let planDe = null;
    if (k.plan) { plan = normalizarPlan(k.plan); planDe = 'categoria'; }
    else if (c.plan) { plan = normalizarPlan(c.plan); planDe = 'club'; }

    return { estado: estado, estadoDe: estadoDe, estadoDeclarado: estadoDeclarado,
      acceso: tieneAcceso(estado), plan: plan, planDe: planDe,
      vence: vence, venceDe: venceDe, pruebaVencida: pruebaVencida };
  }

  /**
   * EL EQUIPO PROPIO DE UNA CATEGORÍA · con herencia del club.
   *
   * La planilla nombra al mismo club distinto según la competencia:
   * Reconquista es «RECONQUISTA A» en Primera y «RECONQUISTA» en la U23.
   * Con un solo equipo por club, el cliente abría la U23 y el panel no
   * encontraba a su equipo en ese libro — la grilla vacía que el punto 19
   * describe como el peor modo de fallar. La categoría puede declarar el
   * suyo; si no, hereda el del club, que es lo que tiene el catálogo de hoy.
   *
   * @returns {{equipo: string|null, equipoDe: 'categoria'|'club'|null}}
   */
  function equipoDeCategoria(club, slug) {
    const c = club || {};
    const k = (slug && c.categorias && c.categorias[slug]) || {};
    if (k.equipoPropio && String(k.equipoPropio).trim()) {
      return { equipo: String(k.equipoPropio).trim(), equipoDe: 'categoria' };
    }
    if (c.equipoPropio && String(c.equipoPropio).trim()) {
      return { equipo: String(c.equipoPropio).trim(), equipoDe: 'club' };
    }
    return { equipo: null, equipoDe: null };
  }

  /**
   * EL CICLO DE INFORMES ORO DE UNA CATEGORÍA · con sus propios contadores.
   *
   * El informe de scouters se entrega cada cuatro partidos DEL EQUIPO de esa
   * categoría, y Primera y la U23 no juegan al mismo ritmo: con un solo
   * contador por club, marcar entregado el informe de Primera le descontaba
   * el que le tocaba a la U23. Cada categoría lleva el suyo.
   *
   * RETROCOMPATIBLE SIN MIGRAR: un club de UNA sola categoría que tenía los
   * contadores en el club los sigue viendo en esa categoría —no pueden ser
   * de otra—. Con varias no se reparte nada: repartir sería inventar a cuál
   * le correspondía cada informe ya entregado.
   *
   * @returns {{cicloDesde: number, informesEntregados: number,
   *   cicloDe: 'categoria'|'club'|null}}
   */
  function cicloDeCategoria(club, slug) {
    const c = club || {};
    const cats = c.categorias || {};
    const k = (slug && cats[slug]) || {};
    const num = (v) => { const n = Number(v); return (isFinite(n) && n >= 0) ? Math.floor(n) : 0; };
    if (k.cicloDesde !== undefined || k.informesEntregados !== undefined) {
      return { cicloDesde: num(k.cicloDesde), informesEntregados: num(k.informesEntregados), cicloDe: 'categoria' };
    }
    if (Object.keys(cats).length <= 1 && (c.cicloDesde !== undefined || c.informesEntregados !== undefined)) {
      return { cicloDesde: num(c.cicloDesde), informesEntregados: num(c.informesEntregados), cicloDe: 'club' };
    }
    return { cicloDesde: 0, informesEntregados: 0, cicloDe: null };
  }

  /**
   * EL PLAN DEL CLUB COMO TITULAR · el más alto de lo que tiene contratado.
   *
   * Lo que es del club y no de una categoría —cuántos mails puede dar de
   * alta, el plan con el que se firma un link— se mide contra lo MEJOR que
   * contrató y tiene activo: un club con Primera en ORO y la U23 en PLATA
   * es un cliente ORO para sus accesos, que son los mismos para las dos.
   * Una categoría pausada no suma: no se está pagando.
   */
  function planDelClub(club, ahora) {
    const c = club || {};
    let mejor = c.plan ? normalizarPlan(c.plan) : null;
    Object.keys(c.categorias || {}).forEach((slug) => {
      const s = suscripcionDeCategoria(c, slug, ahora);
      if (!s.acceso || !s.plan) return;
      if (mejor === null || ORDEN_PLAN[s.plan] > ORDEN_PLAN[mejor]) mejor = s.plan;
    });
    return mejor;
  }

  const ROLES = { ADMIN: 'ADMIN', CLIENTE: 'CLIENTE', ABIERTO: 'ABIERTO' };

  /* Qué pide cada sección. `null` = no pide nada.

     La matriz está acá y NO repartida por las secciones: con la regla
     escrita en cada módulo, agregar una sección nueva la deja sin gate y
     nadie se entera. Acá una sección que falte en el mapa cae al default,
     y hay un test que compara estas claves contra `SGADD.SECCIONES`. */
  const MODULOS = {
    principal: null,
    clasificacion: null,
    /* EL FIXTURE es abierto, como la tabla de posiciones: es el calendario
       publicado de la liga, no un analisis. Y es lo UNICO que se puede
       mirar antes de que el torneo empiece (punto 68). */
    fixture: null,
    equipos: null,          // completa, pero el picker se filtra
    jugadores: null,        // ídem
    scouting: { plan: PLANES.PLATA },
    /* El glosario es PUBLICO y no depende de datos: son definiciones, no
       numeros de un club. Un DT que quiere saber que mide `eFG%` no
       deberia necesitar un link. */
    glosario: null,
    /* COMPARATIVA es de administración: cruza ciclos de cualquier equipo
       de la liga, que es justo lo que el gate del cliente acota. Va con
       los otros tres internos y por eso NO se le muestra en el menú: un
       botón gris que no hace nada invita a clickearlo y no explica por
       qué (punto 19). */
    comparativa: { soloAdmin: true },
    simulador: { soloAdmin: true },
    configuracion: { soloAdmin: true },
    diagnostico: { soloAdmin: true },
  };

  /* =====================================================================
     LOS BLOQUES DE UNA SECCIÓN · el segundo nivel de la matriz

     `MODULOS` decide a qué PANTALLA se entra. Adentro de una pantalla
     puede haber un bloque que valga por sí solo —la ficha de análisis por
     jugador del informe pre-partido es el primero—, y ese bloque necesita
     su propia regla declarada acá y no un `if` adentro del render: con la
     regla escrita en la vista, la landing promete una cosa, el servidor
     declara otra y nadie se entera hasta que un cliente lo reclame. Es el
     mismo motivo por el que `MODULOS` no vive repartido por los módulos.

     La clave es `<seccion>.<bloque>`, o sea el `data-bloque` del DOM con
     su sección adelante: el gate, el modal de exportación y la
     declaración del servidor nombran exactamente lo mismo.

     NO se meten en `MODULOS`: esa matriz se compara contra
     `SGADD.SECCIONES` en los dos sentidos, y un bloque ahí sería una
     sección que el router no conoce.

     OJO con el nombre: `reglas.BLOQUES` del servidor es OTRA cosa —los
     bloques de DATOS que se piden por HTTP (`equipos`, `scouting`)—.
     Estos son los bloques de PANTALLA de una sección.
     ===================================================================== */
  const BLOQUES = {
    /* La ficha individual es el trabajo fino del informe: rol funcional,
       fortalezas, fisuras y plan de acción POR JUGADOR. El resto del
       scouting describe al equipo y al plan colectivo; esto decide qué se
       hace con cada rival, uno por uno, y es lo que el club vende como
       ORO. El informe sigue entero para Plata: lo que se acota es este
       bloque, no la pantalla. */
    'scouting.fichas': { seccion: 'scouting', plan: PLANES.ORO },
  };

  /* =====================================================================
     CAPAS DE LABORATORIO · lo que se prueba con UN cliente antes de venderlo

     Una capa es un conjunto de datos y bloques que todavía no es producto:
     se habilita POR CATEGORÍA (`catalogo[club].categorias[slug].laboratorio`,
     un array) y NO se hereda del club —una prueba se abre de a una
     categoría, a propósito—. Sin el campo, la categoría se comporta
     exactamente como antes.

     El vocabulario es CERRADO: una capa que no está acá no existe, aunque
     alguien la escriba en el catálogo. Así el día que la capa pasa a ser
     producto se mueve su regla a `plan` y se borra de acá, sin buscarla
     en otro lado.

     `pbp` · quintetos, dúos y tríos, iniciales y cierre, clutch y mapa de
             tiro calibrado, sacados del play-by-play oficial por
             `motorstats-ingestion` (punto 62 de CLAUDE.md).
     ===================================================================== */
  const CAPAS_LABORATORIO = {
    pbp: { id: 'pbp', label: 'Play-by-play · quintetos, clutch y mapa de tiro' },
  };

  /** Las capas de laboratorio habilitadas en una categoría, sin repetir. */
  function capasDeCategoria(club, slug) {
    const k = club && club.categorias && club.categorias[slug];
    const crudo = k && Array.isArray(k.laboratorio) ? k.laboratorio : [];
    const out = [];
    crudo.forEach((c) => {
      const id = String(c || '').trim().toLowerCase();
      if (CAPAS_LABORATORIO[id] && out.indexOf(id) === -1) out.push(id);
    });
    return out;
  }

  /* El motivo por el que se deniega, para que la UI diga la verdad: un
     "no tenés permiso" cuando en realidad falta el plan manda al DT a
     pedirle acceso a alguien en vez de mejorar el plan. */
  const MOTIVOS = {
    OK: 'OK',
    SOLO_ADMIN: 'SOLO_ADMIN',
    REQUIERE_PLAN: 'REQUIERE_PLAN',
    OTRO_EQUIPO: 'OTRO_EQUIPO',
  };

  /* --------------------------------------------------------------------
     NORMALIZACIÓN
     -------------------------------------------------------------------- */

  /* Mayúsculas y espacios nada más. NO se normalizan los puntos ni los
     alias con `+` de Gmail, aunque `f.reytesgn@gmail.com` sea la misma
     casilla: esto es una LISTA DE PERMITIDOS, y toda normalización de más
     ensancha quién entra. Que un admin tenga que escribir su mail exacto
     es barato; que una variante inesperada caiga adentro, no. */
  function normalizarEmail(v) {
    return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  }

  /* Los equipos se comparan con el MISMO normalizador que usa el resto de
     la app (`claveEquipo`), no con una comparación de strings: la planilla
     escribe `DEPORTIVO LA PLATA - MM` y el JSON del cliente declara
     `DEPORTIVO LA PLATA`. Sin normalizar, el club no se reconocería a sí
     mismo y se quedaría sin ver nada. */
  const nucleo = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require !== 'undefined' ? require('./sgadd-core.js') : null);

  function claveEq(v) {
    if (v === undefined || v === null || v === '') return '';
    return nucleo && nucleo.claveEquipo ? nucleo.claveEquipo(v)
      : String(v).trim().toUpperCase();
  }

  /* --------------------------------------------------------------------
     LA SESIÓN

     Vive en el módulo y se puede escribir de tres formas, en este orden de
     precedencia: lo que setea el código, la URL y `localStorage`.

     SIN SESIÓN el panel se comporta EXACTAMENTE como antes: acceso
     completo. No es un descuido, es la única opción honesta — no hay
     autenticación, así que un "deny by default" no protegería nada (los
     datos siguen a un `fetch` de distancia) y en cambio rompería el panel
     para los tres clubes que lo usan hoy. El rol se llama `ABIERTO` y no
     `ADMIN` justamente para que se pueda distinguir en los logs y en los
     tests quién entró por la puerta y quién porque no hay puerta.
     -------------------------------------------------------------------- */
  let sesionActual = null;

  function parsearSesion(crudo) {
    if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
    const email = normalizarEmail(crudo.email);
    if (!email) return null;
    const plan = String(crudo.plan || '').trim().toUpperCase();
    return {
      email: email,
      equipoAsignado: crudo.equipoAsignado ? String(crudo.equipoAsignado).trim() : null,
      /* Un plan que no se reconoce cae a BÁSICO y no a PRO: ante la duda,
         el menos permisivo. Un typo en el JSON no puede regalar el módulo
         que se cobra aparte. */
      plan: normalizarPlan(plan),
      nombre: crudo.nombre ? String(crudo.nombre).trim() : '',
    };
  }

  function establecerSesion(crudo) {
    sesionActual = parsearSesion(crudo);
    return sesionActual;
  }

  function limpiarSesion() { sesionActual = null; }

  function sesion() { return sesionActual; }

  /**
   * EL PLAN QUE MANDA ES EL DEL CATÁLOGO, no el que quedó firmado en el link.
   *
   * El token trae el plan con el que se emitió, y el Panel Master lo puede
   * haber cambiado después. El servidor declara el EFECTIVO —en el
   * catálogo (`usuario.plan`) y con los datos (`alcance.plan`)— y la
   * sesión lo adopta: así el menú, el guard del router y el pie dicen lo
   * mismo que el servidor hace cumplir. Sin esto, un cliente bajado a
   * Bronce seguía viendo Scouting en el menú y chocaba contra un 403.
   *
   * Devuelve si cambió algo, para que la pantalla sepa si repintar.
   */
  function fijarPlanEfectivo(plan) {
    if (!sesionActual || !plan) return false;
    const p = normalizarPlan(plan);
    if (sesionActual.plan === p) return false;
    sesionActual = Object.assign({}, sesionActual, { plan: p });
    return true;
  }

  /* --------------------------------------------------------------------
     LOS CUATRO GUARDS. Todos PUROS: reciben la sesión o la toman del
     módulo, y no tocan el DOM. Se pueden testear enteros desde Node.
     -------------------------------------------------------------------- */

  function esAdmin(email) {
    return ADMINS.indexOf(normalizarEmail(email)) !== -1;
  }

  function rol(s) {
    const ses = (s === undefined) ? sesionActual : parsearSesion(s) || s;
    if (!ses || !ses.email) return ROLES.ABIERTO;
    return esAdmin(ses.email) ? ROLES.ADMIN : ROLES.CLIENTE;
  }

  /* Un admin y una sesión ausente pasan por todo. Se resuelven juntos
     porque la pregunta que contestan es la misma —"¿hay algo que
     restringir?"— y separarlos duplicaría el chequeo en los cuatro
     guards, que es donde se cuela el que se olvida. */
  function sinRestricciones(s) { return rol(s) !== ROLES.CLIENTE; }

  function normalizarSes(s) {
    return (s === undefined) ? sesionActual : (parsearSesion(s) || null);
  }

  /**
   * ¿Puede ver los datos de este equipo?
   * Un cliente ve SOLO su equipo asignado. Un cliente SIN equipo asignado
   * no ve ninguno: es una configuración incompleta, y dejarlo ver todo
   * convertiría el error de config en acceso total sin ningún síntoma.
   */
  function puedeVerEquipo(equipo, s) {
    if (sinRestricciones(s)) return true;
    const ses = normalizarSes(s);
    const suyo = claveEq(ses && ses.equipoAsignado);
    const pedido = claveEq(equipo);
    if (!suyo || !pedido) return false;
    return suyo === pedido;
  }

  /** ¿Tiene el módulo que pide esta sección? */
  /** El plan como se escribe en pantalla. */
  function nombrePlan(p) {
    const c = normalizarPlan(p);
    if (c === PLANES.ORO) return 'Oro';
    if (c === PLANES.PLATA) return 'Plata';
    return 'Bronce';
  }

  function tieneModulo(modulo, s) {
    const regla = Object.prototype.hasOwnProperty.call(MODULOS, modulo)
      ? MODULOS[modulo]
      /* Una sección que no está en la matriz se trata como abierta, igual
         que las que declaran `null`. Es lo mismo que hacía el panel antes
         de que existiera este módulo, así que una sección nueva no se
         rompe sola — pero hay un test que exige que la matriz cubra todas
         las de `SGADD.SECCIONES`, para que no pase inadvertido. */
      : null;
    if (!regla) return true;
    /* `soloAdmin` SE MIRA ANTES QUE `sinRestricciones`, y el orden es el
       arreglo.

       `sinRestricciones` es `rol !== CLIENTE`, o sea que un visitante sin
       sesión —el rol ABIERTO— pasaba por ese `return true` y veía
       Simulador, Panel Master y Diagnóstico en el menú. Eran las tres
       herramientas internas ofrecidas a cualquiera que abriera la URL.

       ABIERTO sigue viendo todo lo demás: esa parte no cambia y es lo que
       mantiene funcionando a quien entra sin token. */
    if (regla.soloAdmin) return rol(s) === ROLES.ADMIN;
    if (sinRestricciones(s)) return true;
    if (regla.plan) return alcanzaPlan(regla.plan, s);
    return true;
  }

  /**
   * ¿El plan de esta sesión llega al que pide una regla?
   *
   * SE COMPARA POR ORDEN, NO POR IGUALDAD. Con `===`, MASTER se quedaba
   * sin Scouting —que pide PRO— porque no es literalmente PRO: un plan
   * superior perdiendo un módulo del inferior es la clase de bug que
   * nadie reporta porque parece un permiso mal puesto.
   *
   * Vive suelta porque la usan las DOS matrices —secciones y bloques— y
   * dos copias de esta comparación terminan distintas (punto 8).
   */
  function alcanzaPlan(minimo, s) {
    const ses = normalizarSes(s);
    if (!ses) return false;
    const tengo = ORDEN_PLAN[normalizarPlan(ses.plan)];
    const pide = ORDEN_PLAN[normalizarPlan(minimo)];
    return tengo !== undefined && pide !== undefined && tengo >= pide;
  }

  /**
   * ¿Esta sesión ve este bloque de pantalla?
   *
   * Un bloque que nadie declaró se trata como ABIERTO, igual que una
   * sección sin regla: acá el costo de un default permisivo es un bloque
   * de más, y el del estricto sería dejar en blanco media pantalla apenas
   * alguien agregue un `data-bloque`. Del lado del servidor la asimetría
   * es la inversa y por el mismo criterio — allá lo que se pierde con un
   * default permisivo son datos (`reglas.puedeBloque`).
   *
   * Y HEREDA LA REGLA DE SU SECCIÓN: para ver un bloque hay que poder
   * entrar a la pantalla que lo contiene. Sin eso, el día que un plan
   * tenga el bloque y no la sección vería un pedazo de un informe al que
   * no entra.
   */
  function tieneBloque(id, s) {
    const regla = Object.prototype.hasOwnProperty.call(BLOQUES, id) ? BLOQUES[id] : null;
    if (!regla) return true;
    if (regla.seccion && !tieneModulo(regla.seccion, s)) return false;
    if (regla.soloAdmin) return rol(s) === ROLES.ADMIN;
    if (sinRestricciones(s)) return true;
    if (regla.plan) return alcanzaPlan(regla.plan, s);
    return true;
  }

  /** El veredicto con su motivo, como `puedoAcceder` pero de un bloque:
      la UI tiene que poder decir QUÉ plan lo incluye y no un genérico. */
  function puedoVerBloque(id, s) {
    const regla = Object.prototype.hasOwnProperty.call(BLOQUES, id) ? BLOQUES[id] : null;
    if (!regla) return { ok: true, motivo: MOTIVOS.OK, plan: null };
    if (tieneBloque(id, s)) return { ok: true, motivo: MOTIVOS.OK, plan: null };
    if (regla.soloAdmin) return { ok: false, motivo: MOTIVOS.SOLO_ADMIN, plan: null };
    return { ok: false, motivo: MOTIVOS.REQUIERE_PLAN, plan: regla.plan || null };
  }

  /**
   * TODOS los bloques declarados, resueltos para esta sesión:
   * `{ 'scouting.fichas': false }`. Es lo que el servidor manda en
   * `alcance.bloques`, derivado de la tabla y no escrito a mano, así que
   * declarar un bloque nuevo no obliga a tocar ningún handler.
   *
   * VA POR ID COMPLETO y no por sección: el `alcance` viaja con los
   * DATOS de una categoría, que no son de ninguna sección en particular,
   * y con claves cortas el que lo lee tendría que saber de dónde vino.
   */
  function bloquesVigentes(s) {
    const out = {};
    Object.keys(BLOQUES).forEach((id) => { out[id] = tieneBloque(id, s); });
    return out;
  }

  /**
   * El guard del router. Devuelve el motivo además del veredicto: la UI
   * tiene que poder decir "esto necesita el Plan Pro" y no un genérico.
   *
   * @returns {{ok: boolean, motivo: string, plan: string|null}}
   */
  function puedoAcceder(seccion, s) {
    const regla = Object.prototype.hasOwnProperty.call(MODULOS, seccion)
      ? MODULOS[seccion] : null;
    if (!regla) return { ok: true, motivo: MOTIVOS.OK, plan: null };
    /* `soloAdmin` PRIMERO, igual que en `tieneModulo` y por lo mismo:
       `sinRestricciones` es `rol !== CLIENTE`, así que un visitante sin
       sesión pasaba por ahí y entraba a las tres internas. */
    if (regla.soloAdmin) {
      return (rol(s) === ROLES.ADMIN)
        ? { ok: true, motivo: MOTIVOS.OK, plan: null }
        : { ok: false, motivo: MOTIVOS.SOLO_ADMIN, plan: null };
    }
    if (sinRestricciones(s)) return { ok: true, motivo: MOTIVOS.OK, plan: null };
    if (regla.plan && !tieneModulo(seccion, s)) {
      return { ok: false, motivo: MOTIVOS.REQUIERE_PLAN, plan: regla.plan };
    }
    return { ok: true, motivo: MOTIVOS.OK, plan: null };
  }

  /**
   * LA REGLA DE ORO DEL SCOUTING: un cliente solo puede scoutear cruces
   * donde juegue SU equipo. Nada de "rival contra rival".
   *
   * El motivo no es de privacidad —los datos de los dos rivales están en
   * la misma planilla que ya ve— sino de producto: el informe pre-partido
   * es para preparar UN partido propio, y armar cruces ajenos convierte la
   * herramienta en un servicio de scouting para toda la liga.
   */
  function puedeScoutearCruce(local, visitante, s) {
    if (sinRestricciones(s)) return true;
    if (!tieneModulo('scouting', s)) return false;
    /* Un cruce a medio armar todavía no viola nada: se valida al elegir el
       segundo equipo, no antes. Bloquearlo con un solo lado elegido daría
       un error mientras el usuario está a mitad de camino. */
    if (!local || !visitante) return true;
    /* El mismo equipo de los dos lados no es un cruce. Lo rechaza también
       el motor del informe (`plantelDefensor` devuelve vacío), pero mejor
       que no llegue hasta ahí. */
    if (claveEq(local) === claveEq(visitante)) return false;
    return puedeVerEquipo(local, s) || puedeVerEquipo(visitante, s);
  }

  /**
   * Arma el cruce válido más cercano al que el usuario pidió.
   *
   * `ladoTocado` es cuál de los dos acaba de elegir: ESE se respeta y el
   * OTRO se fuerza a su equipo. Sin ese dato habría que adivinar cuál de
   * los dos pisar, y el 50% de las veces se le borraría al usuario justo
   * el equipo que acaba de elegir.
   *
   * @returns {{local, visitante, forzado: boolean}}
   */
  function forzarCruce(local, visitante, ladoTocado, s) {
    const salida = { local: local || null, visitante: visitante || null, forzado: false };
    if (sinRestricciones(s)) return salida;
    const ses = normalizarSes(s);
    const suyo = ses && ses.equipoAsignado;
    if (!suyo) return salida;

    const otro = ladoTocado === 'local' ? 'visitante' : 'local';

    /* Si el lado tocado ES su equipo, el otro queda libre: puede elegir
       contra quién juega. Es el caso normal y no se toca nada. */
    if (puedeVerEquipo(salida[ladoTocado], s)) return salida;

    /* Tocó un rival. El otro lado pasa a ser su equipo — salvo que ya lo
       fuera, en cuyo caso el cruce ya era válido y `forzado` queda en
       false: avisar de un cambio que no ocurrió es ruido. */
    if (puedeVerEquipo(salida[otro], s)) return salida;

    salida[otro] = suyo;
    salida.forzado = true;
    return salida;
  }

  /**
   * La lista de equipos que le corresponde ver a esta sesión.
   *
   * OJO: NO se usa en los rankings de liga, que van completos a propósito
   * —comparar contra la liga entera es el valor del panel y no expone nada
   * que la tabla de posiciones no muestre ya—. Se usa en los pickers, que
   * es donde se elige a quién ANALIZAR en profundidad.
   */
  function equiposVisibles(lista, s) {
    const arr = Array.isArray(lista) ? lista : [];
    if (sinRestricciones(s)) return arr;
    return arr.filter(e => puedeVerEquipo(e && (e.clave || e.nombre || e), s));
  }

  /** El equipo del cliente, ya normalizado. `null` para admin o sin sesión. */
  function equipoPropio(s) {
    if (sinRestricciones(s)) return null;
    const ses = normalizarSes(s);
    return (ses && ses.equipoAsignado) || null;
  }

  /**
   * Adopta el equipo propio de la CATEGORÍA abierta en la sesión del
   * CLIENTE. Mismo contrato que `fijarPlanEfectivo`: el token lleva el
   * equipo del club, y el panel tiene que filtrar con el que declara el
   * servidor para esa categoría —si no, la U23 de Reconquista mostraría la
   * grilla vacía—. Quien decide es el servidor, que recorta con el mismo.
   *
   * Devuelve si cambió algo.
   */
  function fijarEquipoEfectivo(equipo) {
    if (!sesionActual || !equipo || sinRestricciones(sesionActual)) return false;
    const e = String(equipo).trim();
    if (!e || sesionActual.equipoAsignado === e) return false;
    sesionActual = Object.assign({}, sesionActual, { equipoAsignado: e });
    return true;
  }

  /* --------------------------------------------------------------------
     DE DÓNDE SALE LA SESIÓN

     Sin backend no hay login, así que la sesión se CONFIGURA. Dos vías,
     y la URL gana:

       ?usuario=<mail>&equipo=<EQUIPO>&plan=BRONCE|PLATA|ORO
       localStorage['sgadd.sesion']

     La URL manda para que un link armado a mano abra la vista de ese
     club en cualquier navegador, que es como se entrega hoy. Y se
     PERSISTE al entrar por URL, para que un F5 o un link interno no
     devuelva al usuario a la vista completa a mitad de trabajo.

     `?usuario=` sin valor LIMPIA la sesión: sin eso, un cliente que
     entró una vez por link se quedaba con esa vista para siempre y no
     tenía forma de salir. Es también el escape del admin que probó una
     sesión de cliente.
     -------------------------------------------------------------------- */
  const CLAVE_SESION = 'sgadd.sesion';
  const CLAVE_TOKEN = 'sgadd.token';

  /* --------------------------------------------------------------------
     EL TOKEN FIRMADO

     Con backend, la sesión ya NO sale de `?usuario=&plan=PRO` —que
     cualquiera edita— sino de un JWT que firma el servidor. El navegador
     puede LEERLO pero no puede fabricar uno que valide.

     ACÁ SE DECODIFICA SIN VERIFICAR, Y ESTÁ BIEN QUE ASÍ SEA: la firma
     se verifica con `JWT_SECRET`, que el navegador no tiene ni puede
     tener. Lo que se decodifica sirve para UNA sola cosa: pintar la
     interfaz que corresponde (esconder Scouting, filtrar el picker) antes
     de que llegue la primera respuesta.

     QUIEN DECIDE ES EL SERVIDOR. Si alguien edita el payload de su token
     para verse Pro, el panel le va a MOSTRAR el módulo y el backend le va
     a devolver 403 sin un solo dato. Esa es exactamente la diferencia
     entre el gate de interfaz y la seguridad, y por eso el gate del punto
     19 sigue existiendo sin ser lo que protege.
     -------------------------------------------------------------------- */
  let tokenActual = null;

  function token() { return tokenActual; }

  /** Lee el payload de un JWT SIN verificar la firma. Solo para la UI. */
  function leerPayload(jwt) {
    try {
      const p = String(jwt || '').split('.')[1];
      if (!p) return null;
      const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
      const relleno = b64 + '='.repeat((4 - b64.length % 4) % 4);
      /* `decodeURIComponent(escape(atob(...)))` y no `atob` a secas: sin
         eso un nombre con acento sale con la codificación rota. */
      const txt = decodeURIComponent(escape(atob(relleno)));
      const o = JSON.parse(txt);
      return (o && typeof o === 'object') ? o : null;
    } catch (e) { return null; }
  }

  /**
   * Guarda el token y arma la sesión que va a usar la UI.
   *
   * Un token VENCIDO no se acepta: el servidor lo iba a rechazar igual, y
   * pintar la interfaz de un cliente cuya sesión ya no vale es peor que
   * pedirle un link nuevo — se pasaría el rato viendo 401.
   */
  function establecerToken(jwt) {
    const p = leerPayload(jwt);
    if (!p || !p.email) return null;
    if (typeof p.exp === 'number' && p.exp * 1000 <= Date.now()) {
      tokenActual = null;
      return { vencido: true };
    }
    tokenActual = jwt;
    /* SE PERSISTE ACÁ, y esto faltaba.

       Hasta el login, el único camino que ponía un token era el
       `?access_token=` de la URL, y ese SÍ llamaba a `guardarToken()`
       aparte. Al entrar con clave se llamaba a `establecerToken()`
       directo: el token quedaba en memoria, todo andaba, y la primera
       recarga lo perdía. Medido en producción — despues de entrar, los
       dos storages estaban vacíos.

       Va acá y no en cada llamador: es el único punto por el que pasa un
       token nuevo, que es donde se pone algo para que no se lo olvide el
       que agregue el tercer camino. */
    guardarToken(jwt);
    return establecerSesion({
      email: p.email,
      equipoAsignado: p.equipoAsignado,
      plan: p.plan,
    });
  }

  function limpiarToken() { tokenActual = null; }

  /* El club al que está atado el token. El panel lo necesita para no
     ofrecerle al cliente un club que su token no cubre. */
  function clubDelToken() {
    const p = leerPayload(tokenActual);
    return (p && p.club) || null;
  }

  /** Decodifica el payload de un JWT cualquiera SIN verificar la firma.
   *
   *  Se usa solo para decidir DÓNDE guardarlo, que es una comodidad del
   *  navegador. Quien valida la firma es el servidor, en cada petición: si
   *  alguien falsifica un payload para que se guarde en `localStorage`, lo
   *  único que logra es persistir un token que el backend va a rechazar. */
  function leerPayloadDe(jwt) {
    try {
      const partes = String(jwt || '').split('.');
      if (partes.length !== 3) return null;
      const b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = (typeof atob === 'function')
        ? decodeURIComponent(escape(atob(b)))
        : Buffer.from(b, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function almacen() {
    try {
      return (typeof localStorage !== 'undefined') ? localStorage : null;
    } catch (e) { return null; }   // modo privado puede tirar al acceder
  }

  function cargarSesion(busqueda) {
    /* LA DEMO PUBLICA TRAE SU PROPIA SESION, y se resuelve ACA porque
       este es el unico punto que decide de donde sale una sesion. La
       primera version la establecia desde `sgadd-demo.js` al cargar el
       modulo y no servia: `cargarSesion()` corre despues, en el `init()`
       del arranque, y la pisaba. Medido en el navegador — la demo abria
       con `sesion: null`, o sea rol ABIERTO, que ve TODO: se le habrian
       mostrado Simulador, Configuracion y Diagnostico a cualquiera.

       No se persiste: `establecerSesion` solo escribe en memoria. Si
       quedara en `localStorage`, el que probo la demo abriria el panel al
       dia siguiente convencido de que tiene una cuenta. */
    if (typeof SGADD_DEMO !== 'undefined' && SGADD_DEMO.activo && SGADD_DEMO.activo()) {
      return establecerSesion(SGADD_DEMO.sesion());
    }
    let q = null;
    try {
      const cadena = (busqueda !== undefined) ? busqueda
        : (typeof window !== 'undefined' && window.location ? window.location.search : '');
      q = new URLSearchParams(cadena || '');
    } catch (e) { q = null; }

    /* EL TOKEN GANA sobre `?usuario=`, y no es un empate de precedencia:
       son dos cosas distintas. `?usuario=` es la configuración de
       demostración que se puede editar; el token es una credencial
       firmada. Donde hay credencial, la configuración manual sobra.

       Y SE SACA DE LA URL apenas se lee: un token en el query string
       queda en el historial del navegador, en el `Referer` de cualquier
       recurso externo y en los logs de todo proxy en el camino. Se pasa a
       `sessionStorage`, que muere con la pestaña. */
    if (q && (q.has('access_token') || q.has('token'))) {
      const jwt = q.get('access_token') || q.get('token');
      if (!jwt) { limpiarToken(); limpiarSesion(); borrarGuardada(); return null; }
      const r = establecerToken(jwt);
      sacarTokenDeLaUrl();
      if (r && r.vencido) return null;
      guardarToken(jwt);
      return sesionActual;
    }

    const guardado = leerTokenGuardado();
    if (guardado) {
      const r = establecerToken(guardado);
      /* Un token guardado que venció se borra en vez de arrastrarse: si
         no, el DT vuelve al día siguiente y ve una interfaz de cliente
         que el servidor ya no atiende. */
      if (!r || r.vencido) { borrarTokenGuardado(); limpiarToken(); }
      else return sesionActual;
    }

    if (q && q.has('usuario')) {
      const email = q.get('usuario');
      if (!email) { limpiarSesion(); borrarGuardada(); return null; }
      const ses = establecerSesion({
        email: email,
        equipoAsignado: q.get('equipo'),
        plan: q.get('plan'),
        nombre: q.get('nombre'),
      });
      guardar(ses);
      return ses;
    }

    const ls = almacen();
    if (ls) {
      try {
        const crudo = ls.getItem(CLAVE_SESION);
        if (crudo) return establecerSesion(JSON.parse(crudo));
      } catch (e) { /* un JSON corrupto se ignora: se abre sin sesión */ }
    }
    limpiarSesion();
    return null;
  }

  function guardar(ses) {
    const ls = almacen();
    if (!ls) return;
    try {
      if (ses) ls.setItem(CLAVE_SESION, JSON.stringify(ses));
      else ls.removeItem(CLAVE_SESION);
    } catch (e) { /* sin almacenamiento la sesión dura lo que la pestaña */ }
  }

  function borrarGuardada() { guardar(null); }

  /* El token va a `sessionStorage` y NO a `localStorage`: muere al cerrar
     la pestaña. Es una credencial, no una preferencia — y en una
     computadora compartida (la del club, la del profe) la diferencia
     entre las dos es quién puede seguir mirando mañana. */
  /* DÓNDE VIVE EL TOKEN DEPENDE DE QUIÉN ES.

     El de un CLIENTE va a `sessionStorage` y muere al cerrar la pestaña:
     es una credencial que llegó por WhatsApp y la computadora puede ser
     la del club o la del profe, así que la diferencia entre una y otra es
     quién puede seguir mirando mañana.

     El de un ADMIN va a `localStorage`, y eso es un cambio deliberado:
     con `sessionStorage` cada pestaña nueva pedía la clave de nuevo —una
     pestaña para el Panel Master y otra para mirar un club es exactamente
     cómo se trabaja acá— y eso empuja a dejar la clave anotada, que es
     peor que persistirla. Es su propia máquina y su propia clave; la
     sesión dura 12 h de todas formas.

     SE DECIDE LEYENDO EL TOKEN, no confiando en un flag: si el mail no
     está en `ADMINS`, va a `sessionStorage` aunque alguien pida lo
     contrario. */
  function almacenSesion(jwt) {
    const persistente = esTokenDeAdmin(jwt);
    try {
      if (persistente && typeof localStorage !== 'undefined') return localStorage;
      return (typeof sessionStorage !== 'undefined') ? sessionStorage : null;
    } catch (e) { return null; }
  }

  /** ¿El payload de este token es de un administrador? Se re-deriva contra
   *  `ADMINS`, igual que el rol: el token no dice qué es, dice quién. */
  function esTokenDeAdmin(jwt) {
    if (!jwt) return false;
    try {
      const p = leerPayloadDe(jwt);
      return !!(p && esAdmin(p.email));
    } catch (e) { return false; }
  }

  function guardarToken(jwt) {
    const ls = almacenSesion(jwt);
    try { if (ls) ls.setItem(CLAVE_TOKEN, jwt); } catch (e) { /* sin storage dura lo que la página */ }
  }
  function leerTokenGuardado() {
    /* Se busca en LOS DOS: no se sabe de antemano si el guardado es de
       admin, y mirar solo uno dejaría al otro invisible. Gana el
       persistente, que es el de admin. */
    try {
      const l = (typeof localStorage !== 'undefined') ? localStorage.getItem(CLAVE_TOKEN) : null;
      if (l) return l;
    } catch (e) { /* modo privado */ }
    const ls = (function () {
      try { return (typeof sessionStorage !== 'undefined') ? sessionStorage : null; }
      catch (e) { return null; }
    })();
    try { return ls ? ls.getItem(CLAVE_TOKEN) : null; } catch (e) { return null; }
  }
  function borrarTokenGuardado() {
    /* Se borra de LOS DOS almacenes: si solo se limpiara uno, cerrar
       sesión dejaría la credencial viva en el otro y la pestaña siguiente
       volvería a entrar sola. */
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
    try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  }

  /** Borra el token del query string sin recargar ni tocar el hash. */
  function sacarTokenDeLaUrl() {
    try {
      if (typeof window === 'undefined' || !window.history || !window.history.replaceState) return;
      const u = new URL(window.location.href);
      if (!u.searchParams.has('access_token') && !u.searchParams.has('token')) return;
      u.searchParams.delete('access_token');
      u.searchParams.delete('token');
      /* El HASH se conserva: es la ruta de la app, y perderlo mandaría al
         DT a la pantalla de inicio cada vez que abre un link compartido. */
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) { /* una URL rara no puede impedir que la app abra */ }
  }

  /** Etiqueta para la UI: quién está mirando y con qué plan. */
  function descripcionSesion(s) {
    const ses = normalizarSes(s);
    if (!ses) return null;
    const r = rol(ses);
    if (r === ROLES.ADMIN) return { rol: r, texto: 'Administrador', detalle: ses.email };
    return {
      rol: r,
      texto: ses.equipoAsignado || 'Sin equipo asignado',
      detalle: ses.email + ' · Plan ' + nombrePlan(ses.plan),
    };
  }

  return {
    ADMINS, PLANES, ORDEN_PLAN, ALIAS_PLAN, normalizarPlan, nombrePlan, ROLES, MODULOS, MOTIVOS, CLAVE_SESION,
    CUPO_MAILS, cupoDeMails,
    ALCANCES, ALCANCES_POR_ACCION, alcancesDe, motivoSinAlcance,
    ESTADOS_SUSCRIPCION, ESTADOS_CON_ACCESO, tieneAcceso, suscripcionVencida,
    estadoSuscripcion, suscripcionDeCategoria, planDelClub, equipoDeCategoria, cicloDeCategoria,
    normalizarEmail, parsearSesion, establecerSesion, limpiarSesion, sesion, fijarPlanEfectivo,
    esAdmin, rol, sinRestricciones,
    BLOQUES, alcanzaPlan, tieneBloque, puedoVerBloque, bloquesVigentes,
    CAPAS_LABORATORIO, capasDeCategoria,
    puedeVerEquipo, tieneModulo, puedoAcceder, puedeScoutearCruce,
    forzarCruce, equiposVisibles, equipoPropio, fijarEquipoEfectivo,
    cargarSesion, descripcionSesion,
    token, establecerToken, limpiarToken, leerPayload, clubDelToken,
    sacarTokenDeLaUrl, CLAVE_TOKEN, esTokenDeAdmin, leerPayloadDe,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_AUTH;
