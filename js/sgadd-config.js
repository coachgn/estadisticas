/* =====================================================================
   SGADD · Motor de CONFIGURACIÓN de competencia

   Módulo PURO: no toca `document` ni ninguna global del navegador, así
   que se puede require() desde Node y testear entero.

   Contesta lo que el box score NO puede saber: cuántos clasifican a
   playoffs, cuántos descienden, qué significa cada zona de la tabla y
   con qué color se pinta.

   ---------------------------------------------------------------------
   LA LÍNEA QUE NO SE CRUZA: la ESTRUCTURA sale del DATO.

   Este módulo NO declara cuántos equipos hay ni qué torneos existen.
   Eso ya lo dice el libro —`combinacionesTorneoFase()` enumera los
   tramos reales y el índice cuenta los equipos— y declararlo otra vez
   crea una segunda fuente de verdad que se desincroniza en silencio.
   Este proyecto ya se comió ese bug tres veces: el `sheetId` en dos
   lados resucitando un id muerto, el rol funcional en dos módulos
   dando etiquetas distintas, y el Diagnóstico armando su índice sin
   torneo y contando 373 jugadores donde la app usaba 208.

   `equiposEsperados` es la excepción, y es a propósito una ASERCIÓN:
   no manda sobre el dato, solo permite que config y libro se
   contradigan A LOS GRITOS en el Diagnóstico en vez de callados.
   ===================================================================== */
const SGADD_CONFIG = (function () {
  'use strict';

  /* ===================================================================
     TONOS · vocabulario CERRADO, no colores sueltos

     Una zona declara un TONO, no un hex. Es la misma decisión que ya
     tomó `scoutTono()` en el informe, y por los mismos dos motivos:

       1. Un color crudo no sobrevive al aplanado del papel. El modo de
          impresión pisa los colores de pantalla, así que un hex elegido
          para la card oscura sale negro o ilegible en la hoja.
       2. Un color crudo no garantiza contraste. Lo que se lee sobre
          #1F2937 no se lee sobre #f1f5f9.

     Cada tono trae SU variante por superficie, y las diez están
     medidas: todas pasan 4.5 (WCAG AA) contra el fondo que les toca.
     Hay un test que las recalcula con la MISMA función que usa el
     panel para los acentos, y falla si alguna baja.

       tono       pantalla /#1F2937    papel   /#f1f5f9  /#ffffff
       exito      #4ade80     8.42     #15803d    4.58     5.02
       positivo   #5eead4     9.92     #0f766e    5.00     5.47
       aviso      #fbbf24     8.79     #8a5206    5.83     6.38
       peligro    #f87171     5.31     #b91c1c    5.91     6.47
       neutro     #94a3b8     5.72     #475569    6.92     7.58

     El ámbar del papel es #8a5206 y no el #a16207 obvio porque ese
     daba 4.49: dos centésimas por debajo del mínimo. Un tono "casi AA"
     es un tono que no cumple.
     =================================================================== */
  const TONOS = {
    exito:    { id: 'exito',    pantalla: '#4ade80', papel: '#15803d' },
    positivo: { id: 'positivo', pantalla: '#5eead4', papel: '#0f766e' },
    aviso:    { id: 'aviso',    pantalla: '#fbbf24', papel: '#8a5206' },
    peligro:  { id: 'peligro',  pantalla: '#f87171', papel: '#b91c1c' },
    neutro:   { id: 'neutro',   pantalla: '#94a3b8', papel: '#475569' },
  };
  const TONO_POR_DEFECTO = 'neutro';

  /** El color de un tono para la superficie pedida. Un id desconocido
   *  cae a `neutro` en vez de devolver undefined: una zona sin color se
   *  pinta transparente y deja de distinguirse, que es peor que gris. */
  function tono(id, enPapel) {
    const t = TONOS[id] || TONOS[TONO_POR_DEFECTO];
    return enPapel ? t.papel : t.pantalla;
  }

  const TRAMO_CUALQUIERA = '*';

  function texto(v) { return v === null || v === undefined ? '' : String(v); }
  function entero(v) {
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  /* ===================================================================
     PARSEO · el bloque `competencia` de clubes/<club>.json

     TODO es opcional y el fallback es SIEMPRE seguro. La regla del
     punto 6 no se negocia: la config de cliente nunca puede tumbar el
     dashboard. Sin bloque, con un bloque roto o con un JSON a medias,
     `parsear()` devuelve null y el panel se comporta exactamente como
     antes de que este módulo existiera.
     =================================================================== */
  function parsear(json) {
    if (!json || typeof json !== 'object') return null;
    const c = json.competencia;
    if (!c || typeof c !== 'object') return null;

    const formatos = {};
    const crudos = c.formatos && typeof c.formatos === 'object' ? c.formatos : {};
    Object.keys(crudos).forEach((id) => {
      const f = crudos[id];
      if (!f || typeof f !== 'object') return;
      formatos[id] = {
        id: id,
        label: texto(f.label) || id,
        equiposEsperados: entero(f.equiposEsperados),
        zonas: normalizarZonas(f.zonas),
      };
    });

    /* `porTramo` guarda el valor TAL CUAL, incluido el null explícito.
       Distinguir "la clave no está" de "la clave dice null" es lo que
       permite apagar las zonas en un tramo puntual —en playoffs no hay
       tabla que pintar— sin que el comodín lo resucite. */
    const porTramo = {};
    const pt = c.porTramo && typeof c.porTramo === 'object' ? c.porTramo : {};
    Object.keys(pt).forEach((k) => { porTramo[k.toUpperCase()] = pt[k]; });

    /* LAS CATEGORIAS SE PARSEAN CON EL MISMO PARSER, recursivamente.

       Cada sub-bloque tiene la forma de un `competencia` entero —sus
       formatos, su `porTramo`, su orden de desempate— porque una
       categoria es una competencia distinta y no un recorte de otra.
       Reusar el parser es lo que garantiza que las validaciones y los
       defaults sean los mismos: con un parser propio, el dia que se
       agregue un campo habria que acordarse de tocar dos lados, y el que
       se olvida es siempre el de abajo.

       La recursion es de UN nivel: un `porCategoria` adentro de una
       categoria se ignora, porque una categoria no tiene sub-categorias
       y aceptarlo seria prometer una jerarquia que nada mas soporta. */
    const porCategoria = {};
    const pc = c.porCategoria && typeof c.porCategoria === 'object' ? c.porCategoria : {};
    Object.keys(pc).forEach((id) => {
      const sub = parsear({ competencia: pc[id] });
      if (sub) { delete sub.porCategoria; porCategoria[id] = sub; }
    });

    return {
      ordenTabla: Array.isArray(c.ordenTabla) && c.ordenTabla.length
        ? c.ordenTabla.map(texto) : ['PCT', 'DIF', 'PF'],
      formatos: formatos,
      porTramo: porTramo,
      porCategoria: porCategoria,
    };
  }

  function normalizarZonas(lista) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    lista.forEach((z) => {
      if (!z || typeof z !== 'object') return;
      const desde = entero(z.desde);
      if (desde === null || desde === 0) return;   // 0 no es un puesto
      out.push({
        id: texto(z.id) || ('zona' + (out.length + 1)),
        label: texto(z.label) || texto(z.id),
        tono: TONOS[z.tono] ? z.tono : TONO_POR_DEFECTO,
        desde: desde,
        hasta: z.hasta === undefined || z.hasta === null ? null : entero(z.hasta),
      });
    });
    return out;
  }

  /* ===================================================================
     RESOLUCIÓN POR TRAMO

     La clave es TORNEO|FASE, EXACTAMENTE la misma que ya produce
     `SGADD.combinacionesTorneoFase()`. Cero traducción entre config y
     datos: si la clave hubiera que construirla distinto, tarde o
     temprano una de las dos formas se queda vieja.

     Orden de búsqueda, de lo específico a lo general:

         TORNEO|FASE   →   TORNEO|*   →   *|FASE   →   *

     Una clave presente GANA aunque valga null, y ese null significa
     "este tramo no lleva zonas". Sin esa distinción, apagar la tabla en
     playoffs sería imposible: el comodín volvería a encenderla.
     =================================================================== */
  function formatoDeTramo(cfg, torneo, fase) {
    if (!cfg) return null;
    const t = texto(torneo).toUpperCase() || TRAMO_CUALQUIERA;
    const f = texto(fase).toUpperCase() || TRAMO_CUALQUIERA;
    const claves = [
      t + '|' + f,
      t + '|' + TRAMO_CUALQUIERA,
      TRAMO_CUALQUIERA + '|' + f,
      TRAMO_CUALQUIERA,
    ];
    for (let i = 0; i < claves.length; i++) {
      const k = claves[i];
      if (!Object.prototype.hasOwnProperty.call(cfg.porTramo, k)) continue;
      const id = cfg.porTramo[k];
      if (id === null || id === undefined) return null;   // apagado a propósito
      return cfg.formatos[id] || null;
    }
    return null;
  }

  /* ===================================================================
     ZONAS · índices negativos y cascada

     `desde`/`hasta` son puestos 1-indexados. Un valor NEGATIVO se
     cuenta desde el fondo: -1 es el último, -2 el penúltimo.

     No es un capricho de sintaxis. La cantidad de equipos cambia entre
     categorías del mismo club —Primera 12, U21 13— y un `desde: 11`
     fijo marca mal en cuanto entra una categoría con otro número, sin
     ningún síntoma: la tabla se ve perfecta y el descenso está corrido
     un puesto.

     `hasta` se puede omitir: con `desde` negativo llega hasta el final
     (el caso natural de "los últimos N"), y con `desde` positivo la
     zona es de un solo puesto.

     GANA LA PRIMERA ZONA QUE CALZA. Es cascada, el mismo idioma que ya
     usan `PERFILES_MARCA` y `JERARQUIA` en este código, así que las
     zonas se escriben de la más específica a la más general: Campeón
     1-1 vive adentro de Playoffs 1-8 y tiene que ir antes.
     =================================================================== */
  function resolverPuesto(v, total) {
    if (v === null || v === undefined) return null;
    return v < 0 ? total + 1 + v : v;
  }

  function rangoDeZona(zona, total) {
    const desde = resolverPuesto(zona.desde, total);
    let hasta;
    if (zona.hasta !== null && zona.hasta !== undefined) hasta = resolverPuesto(zona.hasta, total);
    else hasta = zona.desde < 0 ? total : desde;
    if (desde === null || hasta === null) return null;
    if (desde > hasta) return null;          // rango invertido: no se aplica
    return { desde: desde, hasta: hasta };
  }

  function zonaDePuesto(formato, puesto, total) {
    if (!formato || !formato.zonas || !formato.zonas.length) return null;
    const n = entero(total), p = entero(puesto);
    if (!n || n < 1 || !p || p < 1 || p > n) return null;
    for (let i = 0; i < formato.zonas.length; i++) {
      const z = formato.zonas[i];
      const r = rangoDeZona(z, n);
      if (!r) continue;
      if (p >= r.desde && p <= r.hasta) {
        return { id: z.id, label: z.label, tono: z.tono, desde: r.desde, hasta: r.hasta };
      }
    }
    return null;
  }

  /** La zona de cada puesto, de 1 a `total`. Índice 0 = puesto 1. */
  function zonasDeTabla(formato, total) {
    const n = entero(total) || 0;
    const out = [];
    for (let p = 1; p <= n; p++) out.push(zonaDePuesto(formato, p, n));
    return out;
  }

  /** Las zonas efectivamente alcanzables con `total` equipos, en orden
   *  de tabla y sin repetir: es lo que la leyenda tiene que mostrar.
   *  Una zona tapada enteramente por otra más específica no aparece —
   *  y eso es correcto: si no pinta ningún puesto, explicarla confunde. */
  function leyenda(formato, total) {
    const vistas = [], porId = {};
    zonasDeTabla(formato, total).forEach((z) => {
      if (!z || porId[z.id]) return;
      porId[z.id] = true;
      vistas.push(z);
    });
    return vistas;
  }

  /* ===================================================================
     VALIDACIÓN · para el Diagnóstico

     Denuncia los descuadres entre lo que la config declara y lo que el
     libro trae. NUNCA cambia nada: acá el dato manda siempre.
     =================================================================== */
  function validar(cfg, contexto) {
    const out = [];
    if (!cfg) return out;
    const ctx = contexto || {};
    const equipos = entero(ctx.equipos);

    /* Un formato declarado que ningún tramo usa es config muerta: se
       edita creyendo que hace algo y no hace nada. */
    const usados = {};
    Object.keys(cfg.porTramo).forEach((k) => {
      const v = cfg.porTramo[k];
      if (v) usados[v] = true;
    });
    Object.keys(cfg.formatos).forEach((id) => {
      if (!usados[id]) out.push({ nivel: 'aviso', tema: 'competencia',
        mensaje: 'El formato "' + id + '" no lo usa ningún tramo: es configuración muerta.' });
    });
    Object.keys(cfg.porTramo).forEach((k) => {
      const v = cfg.porTramo[k];
      if (v && !cfg.formatos[v]) out.push({ nivel: 'error', tema: 'competencia',
        mensaje: 'El tramo ' + k + ' apunta al formato "' + v + '", que no está declarado.' });
    });

    const f = formatoDeTramo(cfg, ctx.torneo, ctx.fase);
    if (!f) return out;

    /* LA ASERCIÓN. El dato manda: si no coinciden, se avisa y se sigue
       trabajando con lo que trae el libro. Es error y no aviso porque
       un descuadre acá CORRE las zonas de puesto: con 12 declarados y
       13 reales, el que creías que descendía se salva y nadie lo nota
       mirando la tabla, que se ve perfecta. */
    if (f.equiposEsperados && equipos && f.equiposEsperados !== equipos) {
      out.push({ nivel: 'error', tema: 'competencia',
        mensaje: 'El formato "' + f.id + '" declara ' + f.equiposEsperados +
          ' equipos y el libro trae ' + equipos + '. Las zonas se calculan sobre los ' +
          equipos + ' reales, así que los cortes quedan corridos respecto de lo configurado.' });
    }

    if (!f.zonas.length) {
      out.push({ nivel: 'aviso', tema: 'competencia',
        mensaje: 'El formato "' + f.id + '" no declara ninguna zona: la tabla sale sin colores.' });
      return out;
    }

    if (equipos) {
      /* Una zona que con esta cantidad de equipos no alcanza a ningún
         puesto está declarada y no se ve. Pasa sobre todo con rangos
         fijos heredados de una categoría más grande. */
      const alcanzadas = {};
      leyenda(f, equipos).forEach((z) => { alcanzadas[z.id] = true; });
      f.zonas.forEach((z) => {
        if (alcanzadas[z.id]) return;
        const r = rangoDeZona(z, equipos);
        out.push({ nivel: 'aviso', tema: 'competencia',
          mensaje: 'La zona "' + z.id + '" no alcanza ningún puesto con ' + equipos +
            ' equipos' + (r ? ' (queda ' + r.desde + '–' + r.hasta + ', tapada por una anterior)'
              : ' (el rango se invierte)') + '.' });
      });
    }
    return out;
  }

  /* ===================================================================
     OVERRIDE LOCAL · lo que el DT edita desde la pantalla

     El JSON del club es el valor que viaja en el repo; el override vive
     en `localStorage` y solo en el navegador de quien lo editó. Es un
     sitio estático: no hay dónde guardar del lado del servidor y fingir
     que sí sería mentir. Por eso la pantalla tiene 'Exportar JSON', que
     es lo que se commitea para que el cambio le llegue a todos.

     Misma convención de clave que los estados de jugador (punto 13):
     `sgadd.config.<club>`. OJO con el id del club — ahí el bug fue usar
     `CLUB.ID` en vez de `CLUB.estado.id` y que todos los clubes
     escribieran en la misma clave.

     A DIFERENCIA de los estados, el override es POR CLUB y no por
     planilla: el formato de competencia lo declara `porTramo`, que ya
     distingue torneo y fase adentro del mismo bloque.
     =================================================================== */
  const PREFIJO = 'sgadd.config';

  function claveAlmacen(clubId) { return PREFIJO + '.' + (clubId || 'default'); }

  /**
   * El club activo. Vive acá para que TODOS los consumidores resuelvan
   * la misma clave: si cada uno lo dedujera por su cuenta, uno leería el
   * override de otro club y la pantalla mostraría reglas ajenas.
   *
   * OJO: `CLUB.estado.id`, NO `CLUB.ID` ni `CLUB.id`. Con la propiedad
   * equivocada devuelve undefined, todos los clubes escriben en la misma
   * clave y no se nota — el bug exacto que ya se comió el punto 13.
   *
   * En Node no hay `CLUB` y devuelve 'default': el módulo sigue puro.
   */
  function clubActivo() {
    try {
      if (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) return CLUB.estado.id;
    } catch (e) { /* CLUB puede no haber cargado todavía */ }
    return 'default';
  }

  /**
   * LA config que la app tiene que usar, resuelta de punta a punta.
   *
   * Es el único punto de entrada para las pantallas: toma el club activo,
   * su JSON y el override local, y devuelve el formato del tramo pedido.
   * Antes cada consumidor llamaba a `parsear()` por su cuenta y se comía
   * el override sin enterarse: se guardaba un corte nuevo y la tabla
   * seguía pintando el viejo, sin ningún síntoma.
   */
  /**
   * La categoría abierta. Igual que `clubActivo()`, vive acá para que
   * todos los consumidores resuelvan la misma: si cada uno la dedujera,
   * uno leería las zonas de otra categoría y la tabla mostraría reglas
   * ajenas sin ningún síntoma.
   */
  function categoriaActiva() {
    try {
      if (typeof SGADD_APP !== 'undefined' && SGADD_APP.estado && SGADD_APP.estado.planillaId) {
        return SGADD_APP.estado.planillaId;
      }
    } catch (e) { /* SGADD_APP puede no haber cargado todavía */ }
    return null;
  }

  /**
   * EL BLOQUE DE UNA CATEGORÍA · los subclientes de un club.
   *
   * Un club puede tener varias categorías con torneos y formatos que no
   * tienen nada que ver: Reconquista corre Primera, U21 y U23, cada una
   * con su propio libro. Hasta acá el bloque `competencia` era del CLUB
   * entero, y como las claves de `porTramo` son `TORNEO|FASE`, dos
   * categorías con la misma clave —`GENERAL|REGULAR` es lo más común de
   * todo— compartían zonas sin que nadie lo pidiera. Bajar el descenso en
   * Primera se lo bajaba también a la U21.
   *
   * `porCategoria` lo scopea. Es ADITIVO y degrada solo: un club que no
   * lo declara se comporta exactamente como antes, y una categoría que no
   * está en el mapa cae al bloque del club — que es lo correcto para un
   * club de una sola categoría, donde separarlas sería pedirle al DT que
   * declare dos veces lo mismo.
   *
   * NO SE FUSIONAN los dos niveles. Mezclar zonas de dos orígenes daría
   * cascadas que ninguno de los dos declaró, y la cascada es justo lo que
   * decide qué zona gana: el resultado no se podría auditar contra
   * ninguna de las dos fuentes. Es la misma regla que ya vale para el
   * override local (punto 17).
   */
  function bloqueDeCategoria(config, categoria) {
    if (!config) return null;
    const mapa = config.porCategoria;
    if (!categoria || !mapa || typeof mapa !== 'object') return config;
    const propio = mapa[categoria];
    if (!propio || typeof propio !== 'object') return config;
    return propio;
  }

  /**
   * LA config que la app tiene que usar, resuelta de punta a punta.
   *
   * Es el único punto de entrada para las pantallas: toma el club activo,
   * su JSON, el override local y la CATEGORÍA abierta, y devuelve el
   * formato del tramo pedido. Antes cada consumidor llamaba a `parsear()`
   * por su cuenta y se comía el override sin enterarse: se guardaba un
   * corte nuevo y la tabla seguía pintando el viejo, sin ningún síntoma.
   */
  function resolver(jsonClub, torneo, fase, categoria) {
    const v = vigente(jsonClub, clubActivo());
    const cat = (categoria === undefined) ? categoriaActiva() : categoria;
    const bloque = bloqueDeCategoria(v.config, cat);
    return {
      config: v.config,
      /* El bloque que MANDA en esta categoría, que puede ser el del club
         o el suyo propio. La pantalla de Configuración edita este. */
      bloque: bloque,
      categoria: cat,
      /* `propio` dice si la categoría tiene reglas suyas o hereda las del
         club: sin eso, el DT no puede saber si lo que está editando le va
         a cambiar la tabla a las otras categorías. */
      propio: !!(bloque && bloque !== v.config),
      origen: v.origen,
      formato: bloque ? formatoDeTramo(bloque, torneo, fase) : null,
    };
  }

  function almacen() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage;
    } catch (e) { return null; }   // modo privado tira al leer, no al usar
  }

  /** El bloque `competencia` guardado a mano, o null si no hay ninguno. */
  function leerOverride(clubId) {
    const ls = almacen();
    if (!ls) return null;
    try {
      const crudo = ls.getItem(claveAlmacen(clubId));
      if (!crudo) return null;
      const obj = JSON.parse(crudo);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) { return null; }   // un JSON corrupto se ignora, no rompe
  }

  function guardarOverride(clubId, competencia) {
    const ls = almacen();
    if (!ls) return false;
    try { ls.setItem(claveAlmacen(clubId), JSON.stringify(competencia || {})); return true; }
    catch (e) { return false; }    // cuota llena: se degrada, no rompe
  }

  function borrarOverride(clubId) {
    const ls = almacen();
    if (!ls) return false;
    try { ls.removeItem(claveAlmacen(clubId)); return true; } catch (e) { return false; }
  }

  /**
   * La config VIGENTE: el override local si existe, si no la del JSON.
   *
   * Es reemplazo entero y NO un merge campo por campo. Fusionar zonas de
   * dos orígenes daría cascadas que ninguno de los dos declaró —y la
   * cascada es justamente lo que decide qué zona gana— así que el
   * resultado no se podría auditar contra ninguna de las dos fuentes.
   *
   * `origen` dice cuál se está usando, para que la pantalla lo muestre:
   * un DT que edita y no ve el cambio tiene que poder saber por qué.
   */
  /**
   * LA CASCADA DE TRES NIVELES, de lo mas local a lo mas general:
   *
   *   1. el BORRADOR de este navegador   — lo que el admin esta probando
   *   2. lo PUBLICADO en el catalogo     — lo que el club ve hoy
   *   3. `clubes/<club>.json`            — el respaldo del repo
   *
   * El borrador gana para que el que edita vea su cambio antes de
   * publicarlo; lo publicado gana sobre el archivo para que publicar
   * sirva de algo; y el archivo queda de respaldo para el club que nunca
   * publico nada y para el dia que el backend no conteste — que es
   * exactamente como funcionaba todo hasta ahora.
   *
   * NUNCA SE FUSIONAN dos niveles: el que gana, gana entero. Mezclar
   * zonas de dos origenes daria cascadas que ninguno de los dos declaro,
   * y la cascada es lo que decide que zona gana.
   */
  function vigente(jsonClub, clubId) {
    const local = leerOverride(clubId);
    if (local) {
      const cfg = parsear({ competencia: local });
      if (cfg) return { config: cfg, origen: 'local' };
    }
    const pub = publicado(clubId);
    if (pub) {
      const cfg = parsear({ competencia: pub });
      if (cfg) return { config: cfg, origen: 'publicado' };
    }
    const base = parsear(jsonClub);
    return { config: base, origen: base ? 'json' : 'ninguno' };
  }

  /**
   * El bloque que el admin publico para este club, si lo hay.
   *
   * Sale del catalogo que el backend ya bajo, no de una peticion nueva:
   * `resolver()` la llaman los repintados y una llamada de red ahi
   * convertiria pintar la tabla en algo que puede fallar.
   *
   * En Node no hay `SGADD_DATA` y devuelve null: el modulo sigue puro.
   */
  function publicado(clubId) {
    try {
      if (typeof SGADD_CLIENTES === 'undefined') return null;
      const lista = SGADD_CLIENTES.estado && SGADD_CLIENTES.estado.clubes;
      if (!Array.isArray(lista)) return null;
      const c = lista.find(x => x && x.id === clubId);
      return (c && c.competencia) ? c.competencia : null;
    } catch (e) { return null; }
  }

  /**
   * El bloque listo para pegar en `clubes/<club>.json`.
   *
   * Sale como texto y no como objeto porque lo que el DT necesita es
   * copiarlo: el sitio es estático y el cambio recién le llega al resto
   * del cuerpo técnico cuando alguien lo commitea.
   */
  function exportar(cfg) {
    if (!cfg) return '';
    const formatos = {};
    Object.keys(cfg.formatos).forEach((id) => {
      const f = cfg.formatos[id];
      const o = { label: f.label };
      if (f.equiposEsperados) o.equiposEsperados = f.equiposEsperados;
      o.zonas = f.zonas.map((z) => {
        const zz = { id: z.id, desde: z.desde };
        /* `hasta` solo si se declaró: omitirlo es semántico —con `desde`
           negativo significa 'hasta el final'— y reponerlo resuelto
           congelaría el corte a la cantidad de equipos de hoy. */
        if (z.hasta !== null && z.hasta !== undefined) zz.hasta = z.hasta;
        zz.label = z.label;
        zz.tono = z.tono;
        return zz;
      });
      formatos[id] = o;
    });
    return JSON.stringify({
      ordenTabla: cfg.ordenTabla,
      formatos: formatos,
      porTramo: cfg.porTramo,
    }, null, 2);
  }

  /* ===================================================================
     PRECONFIGURACIÓN Y CERTIFICACIÓN

     Hasta acá la regla era dura: la ESTRUCTURA sale del dato. Sigue
     valiendo — el dato nunca deja de mandar. Lo que se suma es la
     posibilidad de declarar la estructura ANTES de que el dato exista,
     que es otra cosa:

         PROYECCIÓN   lo que el cliente dijo en la entrevista
         REALIDAD     lo que el libro trae hoy
         CERTIFICADO  la fecha en que las dos coincidieron

     Una proyección no es una segunda fuente de verdad: es una hipótesis
     fechada contra la cual contrastar. Si divergen, gana el libro y el
     panel lo dice — nunca al revés.

     ---------------------------------------------------------------------
     CERO NOMBRES ASUMIDOS

     No hay claves fijas de categoría ni de torneo. `categorias` es un
     mapa indexado por el id que el cliente use, y los tramos de cada una
     son una lista con ids libres. "Primera División", "Formativas U17",
     "Súper 8", "Conferencia Sur" entran igual que "Ida" y "Vuelta".

     ---------------------------------------------------------------------
     EL PUNTO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO: EL VÍNCULO

     La entrevista declara ids LIBRES. El libro, en cambio, produce una
     clave que no se negocia: `TORNEO|FASE`, la misma que arma
     `combinacionesTorneoFase()`. Son dos vocabularios distintos y hay
     que unirlos para poder auditar.

     Se unen con un campo EXPLÍCITO —`clave`— y NO adivinando. Un tramo
     sin vincular se reporta como tal; nunca se lo empareja por parecido
     de nombre. El motivo es el de siempre en este proyecto: una
     vinculación equivocada certificaría el tramo equivocado y no se
     notaría, que es peor que no certificar nada. `sugerirClave()` existe
     para PROPONERLE una al administrador, que la confirma.
     =================================================================== */

  const ESTADOS = {
    PROYECTADO: 'PROYECTADO',   // declarado, todavía sin datos
    EN_CURSO:   'EN_CURSO',     // hay datos y encajan con lo declarado
    CERTIFICADO:'CERTIFICADO',  // cerró, cuadró y se selló
    DIVERGENTE: 'DIVERGENTE',   // hay datos y NO encajan
    SIN_VINCULO:'SIN_VINCULO',  // declarado, sin clave que lo ate al libro
    /* Hay datos y encajan, PERO algún partido cayó fuera de la ventana
       declarada. No se corrige nada —la etiqueta manda— pero o la fecha
       está mal cargada o el calendario quedó viejo, y las dos hay que
       mirarlas antes de certificar. */
    DESVIO_CALENDARIO: 'DESVIO_CALENDARIO',
  };

  /* ===================================================================
     VENTANA TEMPORAL · el calendario como red de contención

     Los box scores llegan con la etiqueta de torneo incompleta, vacía o
     mal tipeada más seguido de lo que uno querría — sobre todo en
     formativas. Sin nada que los atrape, esos partidos quedan huérfanos:
     el índice los deja pasar (una fila sin torneo pasa siempre, punto
     3 ter) pero nadie sabe a qué tramo pertenecen.

     El calendario es el desempate natural: si el partido se jugó el 14
     de septiembre y el Clausura va del 1 de agosto al 30 de noviembre,
     es del Clausura. No hace falta que la celda lo diga.

     ---------------------------------------------------------------------
     DOS REGLAS QUE NO SE NEGOCIAN

     1. LA ETIQUETA GANA SIEMPRE. Si la fila trae torneo, se respeta
        aunque la fecha caiga en otra ventana. El calendario es un
        RESPALDO para lo que no viene etiquetado, no una corrección de
        lo que sí viene: pisar un dato explícito con una inferencia es
        exactamente lo que este proyecto no hace.

     2. UNA FECHA EN DOS VENTANAS NO SE ASOCIA. Si dos tramos se
        superponen y el partido cae en los dos, la respuesta correcta es
        "no sé", no "el primero". Un partido mal atribuido contamina los
        promedios de dos tramos a la vez y no se nota.

     Y lo que sí se REPORTA aunque no se corrija: un partido que viene
     etiquetado con un tramo pero cuya fecha cae fuera de la ventana de
     ESE tramo. Ahí no hay nada que inferir —la etiqueta manda— pero hay
     algo que avisar, porque o la fecha está mal o el calendario quedó
     viejo. Es la DESVIACIÓN DE CALENDARIO del bloque 0c.
     =================================================================== */

  /** Fecha a medianoche, para comparar días sin que la hora moleste. */
  function aDia(v) {
    if (v instanceof Date) return isNaN(v.getTime())
      ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
    const s = texto(v).trim();
    if (!s) return null;
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);   // dd/mm/aaaa, día primero
    return null;
  }

  function normalizarVentana(v) {
    if (!v || typeof v !== 'object') return null;
    const desde = aDia(v.desde), hasta = aDia(v.hasta);
    if (!desde && !hasta) return null;
    /* Una ventana con las puntas al revés no se aplica. Es un error de
       carga y hay que decirlo, no interpretarlo. */
    if (desde && hasta && desde > hasta) return { desde, hasta, invertida: true };
    return { desde: desde, hasta: hasta, invertida: false };
  }

  function enVentana(dia, ventana) {
    if (!dia || !ventana || ventana.invertida) return false;
    if (ventana.desde && dia < ventana.desde) return false;
    if (ventana.hasta && dia > ventana.hasta) return false;
    return true;
  }

  /**
   * A qué tramo pertenece un partido, mirando SU FECHA.
   *
   * Devuelve siempre un objeto con el motivo, no solo la respuesta: la
   * UI necesita distinguir "lo trajo etiquetado" de "lo dedujo el
   * calendario" para poder mostrarlo distinto.
   *
   *   { tramo, motivo: 'etiqueta' }      la fila lo dice y se respeta
   *   { tramo, motivo: 'calendario' }    cayó en UNA sola ventana
   *   { tramo: null, motivo: 'ambiguo' } cayó en varias: no se elige
   *   { tramo: null, motivo: 'fuera' }   no cayó en ninguna
   *   { tramo: null, motivo: 'sin-fecha' }
   */
  function asociarTramoPorFecha(tramos, claveDeLaFila, fechaDelPartido) {
    const lista = Array.isArray(tramos) ? tramos : [];
    const clave = texto(claveDeLaFila).toUpperCase();

    /* LA ETIQUETA GANA. Si la fila trae un torneo que algún tramo
       declara, se respeta y no se mira el calendario. */
    if (clave) {
      const porClave = lista.find(t => texto(t.clave).toUpperCase() === clave);
      if (porClave) return { tramo: porClave, motivo: 'etiqueta' };
    }

    const dia = aDia(fechaDelPartido);
    if (!dia) return { tramo: null, motivo: 'sin-fecha' };

    const caen = lista.filter(t => enVentana(dia, t.ventana));
    if (caen.length === 1) return { tramo: caen[0], motivo: 'calendario' };
    if (caen.length > 1) {
      return { tramo: null, motivo: 'ambiguo',
        candidatos: caen.map(t => t.id) };
    }
    return { tramo: null, motivo: 'fuera' };
  }

  /**
   * Los partidos de un tramo cuya FECHA cae fuera de su propia ventana.
   *
   * No se corrigen —la etiqueta manda— pero se reportan: o la fecha está
   * mal cargada o el calendario quedó viejo, y las dos cosas hay que
   * mirarlas antes de certificar.
   */
  function desviosDeCalendario(tramo, idx) {
    if (!tramo || !tramo.ventana || tramo.ventana.invertida) return [];
    if (!idx || typeof idx.lista !== 'function') return [];
    const vistos = {}, fuera = [];
    idx.lista().forEach((e) => {
      (e.partidos || []).forEach((p) => {
        const id = p.__id || p.__partido;
        if (!id || vistos[id]) return;
        vistos[id] = true;
        const d = aDia(p.__fecha || p['FECHA']);
        if (!d) return;                       // sin fecha no hay desvío que medir
        if (!enVentana(d, tramo.ventana)) {
          fuera.push({ id: id, fecha: d, partido: texto(p['PARTIDO']) });
        }
      });
    });
    return fuera;
  }

  /**
   * Huella de un tramo del libro: con qué se selló y contra qué se
   * compara después.
   *
   * `hash` es sobre los IDS DE PARTIDO, no sobre los valores. Lo que se
   * quiere detectar es que el libro CAMBIÓ después de darlo por bueno:
   * un partido agregado, borrado o con la fecha corregida. Los valores
   * de un box score pueden ajustarse sin que el torneo deje de ser el
   * mismo; el conjunto de partidos, no.
   */
  function huella(idx) {
    if (!idx || typeof idx.lista !== 'function') return null;
    const ids = [];
    idx.lista().forEach((e) => {
      (e.partidos || []).forEach((p) => { if (p.__id) ids.push(p.__id); });
    });
    const unicos = Array.from(new Set(ids)).sort();
    return {
      equipos: idx.lista().length,
      partidos: unicos.length,
      hash: hashTexto(unicos.join('|')),
    };
  }

  /* FNV-1a de 32 bits, en hexadecimal. No hace falta criptografía: acá
     el hash solo tiene que cambiar cuando cambia el conjunto, y tiene
     que ser el mismo en cualquier navegador y en Node. */
  function hashTexto(s) {
    let h = 0x811c9dc5;
    const t = String(s || '');
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  /* ---------------------------------------------------------------
     PARSEO de la proyección. Igual que `competencia`: todo opcional y
     el fallback siempre seguro. Un club sin bloque se comporta
     exactamente como antes de que esto existiera.
     --------------------------------------------------------------- */
  /* LA CLAVE ES `preconfiguracion` Y NO `torneo`, Y ESO NO ES ESTÉTICO.

     El JSON del club YA TENÍA un campo `torneo`: un string con el nombre
     del torneo ('TORNEO LOCAL', 'CONFERENCIA NORTE') que alimenta
     `CATALOGO.planillas[].torneo`. Al bautizar así el bloque nuevo se
     pisaron entre ellos, y el resultado fue de manual:

       · en `deportivo.json` quedaron DOS claves `torneo` —el string y el
         objeto— y gana la última, así que el nombre del torneo
         desapareció sin que nadie lo notara;
       · en Reconquista y Jujuy, que solo tienen el string, la pestaña de
         preconfiguración tiraba `Cannot convert undefined or null to
         object` al pedirle `.categorias` a un texto.

     Se renombró en vez de convivir: dos cosas distintas con el mismo
     nombre en el mismo objeto es un bug esperando. */
  function parsearProyeccion(json) {
    if (!json || typeof json !== 'object') return null;
    const t = json.preconfiguracion;
    /* La guarda de tipo se queda igual: cierra la clase entera, no solo
       este caso. Cualquier cosa que no sea un objeto acá devuelve null y
       el panel se comporta como si no hubiera bloque. */
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;

    const cats = {};
    const crudas = (t.categorias && typeof t.categorias === 'object') ? t.categorias : {};
    Object.keys(crudas).forEach((id) => {
      const c = crudas[id];
      if (!c || typeof c !== 'object') return;
      cats[id] = {
        id: id,
        label: texto(c.label) || id,
        /* Con qué planilla del club se corresponde. Si no se declara, se
           usa el propio id: la convención natural es que coincidan, pero
           NO se obliga — un cliente puede llamar a su categoría como
           quiera y atarla aparte. */
        planilla: texto(c.planilla) || id,
        /* La ventana de la CATEGORÍA es el respaldo de sus tramos: un
           tramo sin fechas propias hereda la de arriba, que suele ser la
           temporada entera. */
        ventana: normalizarVentana(c.ventanaTemporal),
        tramos: normalizarTramos(c.tramos, normalizarVentana(c.ventanaTemporal)),
        /* La config de zonas por categoría. Es el MISMO bloque del punto
           15, anidado: así cada categoría puede tener su propio formato
           sin repetir el archivo. */
        competencia: c.competencia ? parsear({ competencia: c.competencia }) : null,
        certificacion: normalizarCertificacion(c.certificacion),
      };
    });

    return {
      cliente: texto(t.cliente),
      declaradoEl: texto(t.declaradoEl),
      declaradoPor: texto(t.declaradoPor),
      categorias: cats,
    };
  }

  function normalizarTramos(lista, ventanaCategoria) {
    if (!Array.isArray(lista)) return [];
    const out = [];
    lista.forEach((t) => {
      if (!t || typeof t !== 'object') return;
      const id = texto(t.id);
      if (!id) return;
      out.push({
        id: id,
        label: texto(t.label) || id,
        /* El vínculo con el libro. Vacío = todavía sin vincular, que es
           el estado natural antes de que entre el primer box score. */
        clave: texto(t.clave).toUpperCase(),
        equiposEsperados: entero(t.equiposEsperados),
        fechasEsperadas: entero(t.fechasEsperadas),
        /* A qué formato de zonas responde. Se resuelve contra la
           `competencia` de SU categoría. */
        formato: t.formato === null ? null : (texto(t.formato) || null),
        /* Sin ventana propia hereda la de la categoría. Nunca se inventa
           una: sin fechas por ningún lado queda null y el calendario
           simplemente no participa. */
        ventana: normalizarVentana(t.ventanaTemporal) || ventanaCategoria || null,
        ventanaPropia: !!normalizarVentana(t.ventanaTemporal),
      });
    });
    return out;
  }

  function normalizarCertificacion(c) {
    const out = {};
    if (!c || typeof c !== 'object') return out;
    Object.keys(c).forEach((k) => {
      const s = c[k];
      if (!s || typeof s !== 'object') return;
      out[k] = {
        fecha: texto(s.fecha),
        equipos: entero(s.equipos),
        partidos: entero(s.partidos),
        hash: texto(s.hash),
      };
    });
    return out;
  }

  /** Las categorías declaradas, para poblar un selector. */
  function categorias(json) {
    const p = parsearProyeccion(json);
    if (!p) return [];
    return Object.keys(p.categorias).map((k) => ({
      id: k, label: p.categorias[k].label, planilla: p.categorias[k].planilla,
    }));
  }

  /**
   * La proyección de UNA categoría.
   *
   * Se resuelve por id exacto y, si no, por la planilla que declara.
   * Sin coincidencia devuelve null: inventar una categoría para que la
   * pantalla tenga algo que mostrar sería exactamente el tipo de dato
   * fabricado que este proyecto no admite.
   */
  function proyeccion(json, categoriaId) {
    const p = parsearProyeccion(json);
    if (!p) return null;
    const k = texto(categoriaId);
    let cat = k ? p.categorias[k] : null;
    if (!cat && k) {
      const porPlanilla = Object.keys(p.categorias)
        .map((id) => p.categorias[id])
        .filter((c) => c.planilla === k);
      cat = porPlanilla[0] || null;
    }
    if (!cat) return null;
    return {
      cliente: p.cliente, declaradoEl: p.declaradoEl, declaradoPor: p.declaradoPor,
      categoria: cat,
    };
  }

  /**
   * COBERTURA · qué planillas del club están declaradas y cuáles no.
   *
   * Cada categoría de un club es un LIBRO APARTE —su propio sheetId— y
   * se dan de alta de a una, a medida que el club decide sumarlas. Eso
   * abre un hueco que no se ve solo: una planilla nueva entra al
   * catálogo, el DT la elige en el selector y funciona… pero nadie
   * declaró su torneo, así que no tiene calendario, ni zonas, ni
   * auditoría. Y no falla: simplemente no hay nada que contrastar.
   *
   * Sin este cruce el Diagnóstico se quedaba callado justo en el caso
   * que importa. Callarse es lo peor que puede hacer una auditoría.
   *
   * Se reporta en los DOS sentidos, porque son dos errores distintos:
   *
   *   sinDeclarar  el libro existe y nadie lo preconfiguró
   *   sinLibro     se declaró una categoría para una planilla que no
   *                está en el catálogo (un id mal escrito, o un alta
   *                que se declaró antes de conectar la hoja)
   */
  function cobertura(json, planillas) {
    const p = parsearProyeccion(json);
    const lista = Array.isArray(planillas) ? planillas : [];
    if (!p) {
      /* Sin bloque `torneo` no hay nada que cruzar: el club todavía no
         usa la preconfiguración y eso es válido. */
      return { declarado: false, cubiertas: [], sinDeclarar: [], sinLibro: [] };
    }
    const porPlanilla = {};
    Object.keys(p.categorias).forEach((id) => {
      porPlanilla[p.categorias[id].planilla] = p.categorias[id];
    });
    const idsCatalogo = {};
    lista.forEach((pl) => { if (pl && pl.id) idsCatalogo[pl.id] = pl; });

    const cubiertas = [], sinDeclarar = [];
    lista.forEach((pl) => {
      if (!pl || !pl.id) return;
      /* Una planilla SIN slug todavía no es un libro: está en el
         catálogo como "viene en camino" y no tiene sentido pedirle
         preconfiguración. */
      if (!(pl.slug || pl.sheetId)) return;
      if (porPlanilla[pl.id]) cubiertas.push({ planilla: pl.id, categoria: porPlanilla[pl.id].id });
      else sinDeclarar.push({ planilla: pl.id, label: pl.label || pl.id });
    });

    const sinLibro = [];
    Object.keys(p.categorias).forEach((id) => {
      const c = p.categorias[id];
      if (!idsCatalogo[c.planilla]) sinLibro.push({ categoria: id, planilla: c.planilla });
    });

    return { declarado: true, cubiertas, sinDeclarar, sinLibro };
  }

  /**
   * Propone con qué clave del libro se corresponde un tramo declarado.
   *
   * PROPONE, no decide. Compara el label normalizado contra los tramos
   * reales; si hay una sola coincidencia razonable la devuelve, y si hay
   * varias o ninguna devuelve null. El administrador confirma.
   */
  function sugerirClave(tramoDeclarado, tramosDelLibro) {
    if (!tramoDeclarado || !Array.isArray(tramosDelLibro)) return null;
    const norm = (s) => texto(s).toUpperCase()
      .normalize ? texto(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Z0-9]/g, '') : texto(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const objetivo = norm(tramoDeclarado.label) || norm(tramoDeclarado.id);
    if (!objetivo) return null;
    const hits = tramosDelLibro.filter((t) => {
      const a = norm(t.label), b = norm(t.id);
      return a === objetivo || b === objetivo ||
             a.indexOf(objetivo) >= 0 || objetivo.indexOf(a) >= 0;
    });
    return hits.length === 1 ? hits[0].id : null;
  }

  /* ---------------------------------------------------------------
     AUDITORÍA · el semáforo

     `idxPorTramo` es una función `(clave) => idx` que devuelve el índice
     de ESE tramo. Se pasa como función y no como un mapa ya armado
     porque construir un índice no es gratis: así solo se arman los de
     los tramos que están vinculados.
     --------------------------------------------------------------- */
  function auditar(proy, idxPorTramo, opciones) {
    const o = opciones || {};
    if (!proy || !proy.categoria) return [];
    const cert = proy.categoria.certificacion || {};
    const claves = Array.isArray(o.tramosDelLibro) ? o.tramosDelLibro.map((t) => t.id) : null;

    return proy.categoria.tramos.map((t) => {
      const base = {
        id: t.id, label: t.label, clave: t.clave,
        equiposEsperados: t.equiposEsperados, fechasEsperadas: t.fechasEsperadas,
        sello: cert[t.id] || null, avisos: [],
      };

      /* Sin vínculo no se puede auditar nada, y decirlo es la respuesta
         correcta: el tramo está declarado y todavía no se ató al libro. */
      if (!t.clave) {
        return Object.assign(base, { estado: ESTADOS.SIN_VINCULO,
          detalle: 'Declarado, sin vincular a un tramo del libro.' });
      }

      /* Vinculado a una clave que el libro no tiene: o el torneo no
         empezó, o la clave está mal escrita. Se distingue mirando si el
         libro trae ALGÚN tramo. */
      const existeEnLibro = !claves || claves.indexOf(t.clave) >= 0;
      const idx = existeEnLibro ? idxPorTramo(t.clave) : null;
      const hay = idx && typeof idx.lista === 'function' && idx.lista().length > 0;

      if (!hay) {
        return Object.assign(base, { estado: ESTADOS.PROYECTADO,
          detalle: claves && claves.length && !existeEnLibro
            ? 'La clave ' + t.clave + ' no está en el libro. Puede que el tramo no haya empezado, o que esté mal escrita.'
            : 'Todavía no entraron datos de este tramo.' });
      }

      const h = huella(idx);
      base.huella = h;

      /* LA VERIFICACIÓN DEL SELLO va PRIMERO, y es el motivo por el que
         existe todo esto. Un tramo ya certificado no se vuelve a juzgar
         contra lo proyectado: se juzga contra SU PROPIA huella. Lo que
         hay que detectar es que el libro cambió DESPUÉS de darlo por
         bueno, no si sigue cumpliendo la proyección. */
      if (base.sello && base.sello.hash) {
        if (base.sello.hash === h.hash) {
          return Object.assign(base, { estado: ESTADOS.CERTIFICADO,
            detalle: 'Certificado el ' + base.sello.fecha + ' · ' +
              h.equipos + ' equipos · ' + h.partidos + ' partidos.' });
        }
        const dEq = h.equipos - (base.sello.equipos || 0);
        const dPa = h.partidos - (base.sello.partidos || 0);
        return Object.assign(base, { estado: ESTADOS.DIVERGENTE,
          detalle: 'EL LIBRO CAMBIÓ después de certificarse el ' + base.sello.fecha + '. ' +
            'Entonces: ' + base.sello.equipos + ' equipos y ' + base.sello.partidos + ' partidos. ' +
            'Ahora: ' + h.equipos + ' y ' + h.partidos +
            (dEq || dPa ? ' (' + (dEq ? signo(dEq) + ' equipos' : '') +
              (dEq && dPa ? ', ' : '') + (dPa ? signo(dPa) + ' partidos' : '') + ')'
              : ' — mismos totales, pero otros partidos') + '.' });
      }

      /* Sin sello: se contrasta contra lo proyectado. */
      const avisos = [];
      if (t.equiposEsperados && h.equipos !== t.equiposEsperados) {
        avisos.push('Declaraba ' + t.equiposEsperados + ' equipos y el libro trae ' + h.equipos + '.');
      }
      /* Cada fecha son `equipos / 2` partidos. Con un número impar de
         equipos hay uno libre por fecha, así que se redondea para abajo:
         es la cuenta que hace cualquier fixture. */
      const eq = t.equiposEsperados || h.equipos;
      const porFecha = Math.floor(eq / 2);
      const esperados = (t.fechasEsperadas && porFecha) ? t.fechasEsperadas * porFecha : null;
      if (esperados) {
        base.partidosEsperados = esperados;
        if (h.partidos > esperados) {
          avisos.push('El libro trae ' + h.partidos + ' partidos y el tramo declaraba ' +
            t.fechasEsperadas + ' fechas, o sea ' + esperados + '.');
        }
      }
      base.avisos = avisos;

      if (avisos.length) {
        return Object.assign(base, { estado: ESTADOS.DIVERGENTE,
          detalle: avisos.join(' ') });
      }
      /* El calendario se mira DESPUÉS de las aserciones de tamaño: un
         tramo con la cantidad de equipos mal es un problema más grande
         que uno con una fecha corrida, y el semáforo tiene que mostrar
         el peor. */
      const fuera = desviosDeCalendario(t, idx);
      if (fuera.length) {
        base.desvios = fuera;
        const ej = fuera[0];
        return Object.assign(base, { estado: ESTADOS.DESVIO_CALENDARIO,
          detalle: fuera.length + ' partido' + (fuera.length === 1 ? '' : 's') +
            ' con fecha fuera de la ventana declarada (' + ventanaTexto(t.ventana) + ')' +
            (ej ? ', por ejemplo ' + (ej.partido || ej.id) + ' el ' + diaTexto(ej.fecha) : '') +
            '. La etiqueta manda: no se corrige nada, pero o la fecha está mal ' +
            'cargada o el calendario quedó viejo.' });
      }

      const completo = esperados && h.partidos === esperados;
      return Object.assign(base, { estado: ESTADOS.EN_CURSO,
        detalle: h.equipos + ' equipos · ' + h.partidos + ' partidos' +
          (esperados ? ' de ' + esperados : '') +
          (completo ? ' · el tramo está completo y se puede certificar.' : '.') ,
        certificable: !!completo });
    });
  }

  function signo(n) { return (n > 0 ? '+' : '') + n; }

  function diaTexto(d) {
    if (!(d instanceof Date)) return '—';
    const dd = (n) => ('0' + n).slice(-2);
    return dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function ventanaTexto(v) {
    if (!v) return 'sin fechas';
    if (v.invertida) return 'fechas invertidas: ' + diaTexto(v.desde) + ' a ' + diaTexto(v.hasta);
    if (v.desde && v.hasta) return diaTexto(v.desde) + ' a ' + diaTexto(v.hasta);
    if (v.desde) return 'desde el ' + diaTexto(v.desde);
    return 'hasta el ' + diaTexto(v.hasta);
  }

  /**
   * El sello de un tramo, listo para pegar en el JSON del club.
   *
   * Se guarda en el JSON y NO en localStorage: certificar es un hito
   * administrativo que el resto del cuerpo técnico tiene que ver, y el
   * historial de git es exactamente la trazabilidad que pide una
   * auditoría.
   */
  function certificar(idx, fecha) {
    const h = huella(idx);
    if (!h) return null;
    return { fecha: texto(fecha) || fechaHoyISO(), equipos: h.equipos,
             partidos: h.partidos, hash: h.hash };
  }

  function fechaHoyISO() {
    const d = new Date();
    const dd = (n) => ('0' + n).slice(-2);
    return d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());
  }

  return {
    publicado,
    categoriaActiva, bloqueDeCategoria,
    TONOS, TONO_POR_DEFECTO, TRAMO_CUALQUIERA, tono,
    parsear, formatoDeTramo, zonaDePuesto, zonasDeTabla, leyenda, validar,
    leerOverride, guardarOverride, borrarOverride, vigente, exportar, claveAlmacen,
    clubActivo, resolver,
    /* Preconfiguración y certificación. Ver el bloque de arriba. */
    ESTADOS, parsearProyeccion, proyeccion, categorias, sugerirClave,
    huella, auditar, certificar, hashTexto,
    asociarTramoPorFecha, desviosDeCalendario, enVentana, ventanaTexto, _aDia: aDia,
    cobertura,
    _rangoDeZona: rangoDeZona,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONFIG;
