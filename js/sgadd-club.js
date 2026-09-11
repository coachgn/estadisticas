/* =====================================================================
   SGADD · Configuración por club

   Un solo deploy para todos los clientes. Lo único que cambia entre uno y
   otro es un JSON en `clubes/`. El código nunca se toca.

   Selección por URL:  index.html?club=reconquista
   Cada cliente recibe su link y no ve que existen los demás.

   Este módulo se carga ANTES que el resto: define el tema, el catálogo de
   planillas y la ruta de escudos que van a usar todos los otros módulos.
   ===================================================================== */

const CLUB = (function () {
  'use strict';

  const POR_DEFECTO = 'reconquista';

  /* El tema vive acá y no en constantes sueltas: los gráficos leen de este
     objeto en tiempo de dibujo, así el color de marca sale del JSON. */
  const TEMA = {
    acento: '#f7941e',
    acentoOscuro: '#d97706',
    acentoTexto: '#f7941e',
    acentoFondo: '#f7941e',
    paleta: ['#f7941e', '#4ade80', '#60a5fa', '#f472b6'],
  };

  const estado = { id: null, cfg: null, error: null, cargado: false };
  let aplicado = false;
  let yaHuboRender = false;

  /* Base del sitio deducida del propio <script>, no de la URL de la pagina.
     Con fetch('clubes/x.json') relativo, si la URL viene sin barra final
     (.../estadisticas?club=x) el navegador resuelve contra la raiz del
     dominio y da 404. Desde el src del script siempre da bien. */
  const BASE = (function () {
    try {
      const sc = document.currentScript ||
        Array.prototype.slice.call(document.getElementsByTagName('script'))
          .filter(x => /sgadd-club\.js/.test(x.src || '')).pop();
      if (sc && sc.src) return sc.src.replace(/js\/sgadd-club\.js.*$/, '');
    } catch (e) {}
    return '';
  })();

  /**
   * ¿Estamos en la DEMO publica?
   *
   * SE PREGUNTA ACA Y NO EN `SGADD_DEMO`, por el mismo motivo que
   * `esLanding()`: este modulo carga PRIMERO y se auto-arranca, asi que
   * cuando `idDesdeUrl()` corre, `SGADD_DEMO` todavia no existe. Con la
   * pregunta en el otro modulo, la demo abriria el club por defecto.
   */
  function enDemo() {
    try {
      return new URLSearchParams(window.location.search).get('demo') === '1';
    } catch (e) { return false; }
  }

  function idDesdeUrl() {
    /* La demo fuerza su propio club: marca de MotorStats, equipo propio
       `EQUIPO 1` y una sola planilla, la del snapshot anonimizado. */
    if (enDemo()) return 'demo';
    try {
      const p = new URLSearchParams(window.location.search).get('club');
      return (p && /^[a-z0-9-]+$/i.test(p)) ? p.toLowerCase() : POR_DEFECTO;
    } catch (e) { return POR_DEFECTO; }
  }

  /**
   * Sin `?club=` no se esta mirando ningun cliente: es la landing.
   *
   * LA DECISION VIVE ACA Y NO EN `sgadd-landing.js`, y es por el orden de
   * carga: este modulo va PRIMERO y se auto-arranca, asi que cuando
   * `aplicarUI` necesita saberlo `SGADD_LANDING` todavia no existe. Con la
   * pregunta en el otro modulo, `enLanding` daba siempre false y la marca
   * del club por defecto se pintaba igual — medido en el navegador.
   *
   * `SGADD_LANDING.activa()` delega aca: una sola implementacion, sin
   * carrera de scripts y sin dos formas de contestar lo mismo.
   */
  function esLanding() {
    /* EN LA DEMO NO HAY LANDING: se entra a ver el panel, que es todo el
       punto. Sin esto el router devolveria la tarjeta explicativa en cada
       seccion —la demo no lleva `?club=`— y no se veria un solo dato. */
    if (enDemo()) return false;
    try {
      if (new URLSearchParams(window.location.search).get('club')) return false;
    } catch (e) { return false; }

    /* CON SESION ABIERTA NO HAY LANDING. La bienvenida es la puerta de
       entrada del que todavia no entro; al que ya se autentico hay que
       mostrarle la app, aunque no haya elegido club.

       Es el caso del ADMIN: su token no lleva club —el Panel Master es de
       todos los clientes— asi que sin esta linea entraba, quedaba sin
       `?club=` y el router le devolvia la tarjeta explicativa de la
       landing en TODAS las secciones, incluido el Panel Master. Medido en
       produccion: iniciaba sesion y no pasaba nada visible.

       Se pregunta con `typeof` porque este modulo carga PRIMERO: si
       `SGADD_AUTH` todavia no existe se cae al criterio de siempre, que
       es el que valia hasta ahora. */
    try {
      if (typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.token()) return false;
    } catch (e) {}
    return true;
  }

  let promesa = null;

  /* Idempotente: si alguien la llama dos veces, comparten la misma promesa. */
  function cargar() {
    if (promesa) return promesa;
    promesa = _cargar();
    return promesa;
  }

  async function _cargar() {
    const id = idDesdeUrl();
    estado.id = id;
    const url = BASE + 'clubes/' + encodeURIComponent(id) + '.json';
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      estado.cfg = await r.json();
      console.log('[CLUB] cargado:', estado.cfg.nombre, '·', url);
    } catch (e) {
      estado.error = e.message || String(e);
      estado.url = url;
      console.error('[CLUB] NO se pudo cargar ' + url + ' → ' + estado.error);
      estado.cfg = null;
    }
    aplicarSeguro();
    estado.cargado = true;
    return estado.cfg;
  }

  /** Si la config no carga, el dashboard queda con los defaults y NO se nota.
      Mejor un cartel visible que un tablero mostrando datos del club equivocado. */
  function cartelError() {
    if (!estado.error) return;
    const d = document.createElement('div');
    /* Con id: si el catálogo del servidor trae al club (`reconciliar`),
       el cartel se retira — la config SÍ existe, solo que no en el repo. */
    d.id = 'clubCartelError';
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:60;background:#7f1d1d;color:#fff;' +
      'font:12px/1.4 system-ui,sans-serif;padding:8px 14px;display:flex;gap:10px;align-items:center';
    d.innerHTML = '<b>Configuracion del club no encontrada</b>' +
      '<span style="opacity:.85">' + estado.url + ' → ' + estado.error +
      '. El panel esta usando los valores por defecto.</span>' +
      '<button style="margin-left:auto;background:none;border:1px solid #fff6;color:#fff;border-radius:4px;' +
      'padding:2px 8px;cursor:pointer" onclick="this.parentNode.remove()">Cerrar</button>';
    document.body.appendChild(d);
  }

  /* SEPARADO A PROPOSITO en datos y UI.

     Antes era una sola funcion que arrancaba con "si el header no existe en
     el DOM, salir y reintentar despues". Eso hacia que, cuando el script
     corria antes de que el DOM estuviera listo, TAMPOCO se aplicara el
     catalogo de planillas ni la carpeta de escudos. Es decir: un detalle de
     presentacion bloqueaba la configuracion de datos.

     Ahora los datos se aplican SIEMPRE, sin depender del DOM. */
  function aplicar() {
    const c = estado.cfg;
    if (!c) { cartelError(); return; }
    aplicarDatos(c);
    aplicarUI(c);
    aplicado = true;
  }

  /** Catalogo, equipo propio, escudos. No toca el DOM. */
  function aplicarDatos(c) {

    /* --- Catalogo de planillas --- */
    if (typeof SGADD !== 'undefined') {
      if (c.patronEquipoPropio) {
        SGADD.CATALOGO.patronEquipoPropio = new RegExp(c.patronEquipoPropio, 'i');
      }
      if (Array.isArray(c.planillas) && c.planillas.length) {
        SGADD.CATALOGO.planillas = c.planillas.map(p => Object.assign({
          anio: c.anio || new Date().getFullYear(),
          torneo: c.torneo || '',
          modulo: 'sgadd',
          activo: !!(p.slug || p.sheetId),
        }, p));
      }
    }

    /* --- Escudos: pozo compartido + override por liga. --- */
    if (typeof LOGOS !== 'undefined') {
      // Limpiar ANTES de cambiar de carpeta: si no, quedan escudos de la
      // liga anterior cacheados bajo el mismo nombre de equipo.
      if (LOGOS.reset) LOGOS.reset();
      if (c.liga) LOGOS.CFG.basePaths = ['logos/' + c.liga + '/', 'logos/'];
      if (Array.isArray(c.sufijosEquipo)) LOGOS.CFG.sufijos = c.sufijosEquipo;
      if (c.aliasLogos) LOGOS.CFG.overrides = c.aliasLogos;
    }

    if (typeof SGADD !== 'undefined' && SGADD.limpiarCache) SGADD.limpiarCache();
  }

  /** Marca visible y colores. Necesita el DOM; si no esta, reintenta. */
  function aplicarUI(c) {
    if (!document.getElementById('clubNombre')) {
      document.addEventListener('DOMContentLoaded', () => aplicarUI(c), { once: true });
      return;
    }

    /* EN LA LANDING NO SE PINTA LA MARCA DE NINGUN CLUB.

       Sin `?club=` se carga igual el club por defecto —el catalogo y los
       colores hacen falta para que la app no quede sin tema— pero pintar
       SU nombre y SU escudo en la barra pondria la marca de un cliente en
       la pantalla de bienvenida del producto.

       Se corta aca, en el unico lugar que escribe esos nodos: pisarlo
       despues desde afuera es una carrera contra este `aplicarUI`, que
       corre en diferido si el DOM todavia no estaba. */
    const enLanding = esLanding();

    /* --- Marca visible: es la del CLUB, no la del producto ---

       EN LA LANDING NO SE PINTA. Sin `?club=` se carga igual el club por
       defecto —el catalogo y los colores hacen falta para que la app no
       quede sin tema— pero pintar SU nombre y SU escudo pondria la marca
       de un cliente en la pantalla de bienvenida del producto.

       Se decide aca, en el unico lugar que escribe esos nodos: pisarlo
       despues desde afuera es una carrera contra este mismo `aplicarUI`,
       que corre en diferido si el DOM todavia no estaba. El TEMA sigue
       aplicandose: sin el, la landing sale sin colores. */
    if (enLanding && typeof SGADD_LANDING !== 'undefined') SGADD_LANDING.aplicarMarca();
    if (c.nombre && !enLanding) {
      document.title = c.nombre + ' · Panel de Scouting';
      const t = document.getElementById('clubNombre');
      if (t) t.textContent = c.nombreCorto || c.nombre;
    }
    /* La bajada tambien es del club: iba fuera del guard y pisaba la de
       la landing, que ya se habia escrito dos lineas mas arriba. */
    if (c.bajada && !enLanding) {
      const b = document.getElementById('clubBajada');
      if (b) b.textContent = c.bajada;
    }
    /* --- Color de marca por variable CSS.
       Antes estaba escrito a mano en 13 lugares; ahora se cambia en un JSON. */
    if (c.acento) {
      TEMA.acento = c.acento;
      TEMA.acentoOscuro = c.acentoOscuro || c.acento;
      TEMA.acentoTexto = aclararHastaLegible(c.acento, FONDO_CARD, 4.5);
      /* Variante para el papel: el mismo acento, oscurecido hasta que se
         lea sobre el gris de las tarjetas impresas. */
      TEMA.acentoPapel = oscurecerHastaLegible(c.acento, FONDO_PAPEL, 4.5);
      /* --- Y una tercera variante: el acento COMO FONDO.

         `.bg-accent` pinta la pestaña activa y los botones llenos, con
         texto oscuro (`text-base`, #0B1121) encima. Preguntarse si el
         acento se LEE sobre la card es una cosa; preguntarse si el texto
         oscuro se lee SOBRE el acento es otra, y con marcas oscuras la
         respuesta cambia. Medido con el texto base encima del acento crudo:

             Reconquista  #f7941e   8,25   sirve
             Jujuy        #2563eb   3,64   NO llega a AA
             DEPORTIVO    #09086E   1,14   invisible

         O sea que `background-color: var(--acento)` dejaría la pestaña
         activa de DEPORTIVO ilegible. Se aclara hasta que el texto de
         encima pase 4.5, igual que se hace con las otras dos variantes.

         NO es un alias de `--acento-texto`: se mide contra otro fondo y
         los valores YA se separan hoy, medido en el navegador —

             club          --acento-texto   --acento-fondo
             Reconquista      #f7941e          #f7941e
             Jujuy            #6692f1          #467aee
             DEPORTIVO        #9090be          #7877af

         que es lo esperable: 'se lee sobre la card oscura' y 'deja leer
         texto oscuro encima' son dos preguntas distintas. */
      TEMA.acentoFondo = aclararHastaLegible(c.acento, TEXTO_SOBRE_ACENTO, 4.5);
      TEMA.paleta = [TEMA.acento].concat(TEMA.paleta.slice(1));
      const raiz = document.documentElement;
      raiz.style.setProperty('--acento', TEMA.acento);
      raiz.style.setProperty('--acento-oscuro', TEMA.acentoOscuro);
      raiz.style.setProperty('--acento-texto', TEMA.acentoTexto);
      raiz.style.setProperty('--acento-papel', TEMA.acentoPapel);
      raiz.style.setProperty('--acento-fondo', TEMA.acentoFondo);
    }

    ponerEscudo(c);
  }

  /* Cada paso va en su propio try: si uno falla (un JSON a medias, un id de
     elemento que cambió), los demás se aplican igual. Antes un error tiraba
     abajo toda la personalización. */
  function aplicarSeguro() {
    try { aplicar(); }
    catch (e) { console.error('[CLUB] error aplicando la config:', e); }
    repintar();
  }

  /* Si la config llega después del primer render, hay que repintar: si no,
     el panel queda con los datos del catálogo por defecto. */
  function repintar() {
    try {
      if (typeof LOGOS !== 'undefined' && LOGOS.CFG.basePaths) {
        // Los 404 anteriores quedaron cacheados: hay que reintentar.
        if (typeof equiposPintar === 'function' && typeof currentSection !== 'undefined' && currentSection === 'equipos') equiposPintar();
        if (typeof jugadoresPintar === 'function' && typeof currentSection !== 'undefined' && currentSection === 'jugadores') jugadoresPintar();
        if (typeof simuladorPintar === 'function' && typeof currentSection !== 'undefined' && currentSection === 'simulador') simuladorPintar();
      }
      if (typeof renderSection === 'function' && typeof currentSection !== 'undefined' && aplicado && yaHuboRender) {
        renderSection(currentSection);
      }
    } catch (e) { console.warn('[CLUB] repintado omitido:', e); }
  }

  /* El escudo del club se resuelve en cascada:
       1. `escudo` del JSON, si existe el archivo
       2. el logo del PROPIO equipo, que ya está en logos/<liga>/
       3. nada (se oculta)
     Así no hay que subir un archivo extra: el club ya tiene su escudo
     cargado como equipo de la liga. */
  function ponerEscudo(c) {
    /* El escudo del club tampoco. El TEMA ya se aplico mas arriba, asi
       que cortar aca deja los colores puestos y la marca sin pintar.

       SE PREGUNTA DE NUEVO, no se hereda la variable de `aplicarUI`: a
       esta funcion tambien la llama `marcarRender`, y ahi `enLanding` no
       existe. Cuando lo hacia, el ReferenceError reventaba `aplicar()`
       ENTERO — o sea que el club se quedaba sin catalogo, sin ninguna
       planilla que bajar, con la seccion clavada en "Cargando la
       categoria..." para siempre. El sintoma no nombraba a la landing por
       ningun lado. */
    if (esLanding()) return;
    const img = document.getElementById('clubEscudo');
    if (!img) return;

    const candidatos = [];
    if (c.escudo) candidatos.push(c.escudo);

    // El logo del equipo propio, si LOGOS ya lo resolvió.
    if (typeof LOGOS !== 'undefined' && c.equipoEscudo) {
      const url = LOGOS.getUrl(c.equipoEscudo);
      if (url) candidatos.push(url);
    }
    if (typeof LOGOS !== 'undefined' && c.patronEquipoPropio) {
      const propio = (c.nombreCorto || c.patronEquipoPropio);
      const url = LOGOS.getUrl(propio) || LOGOS.getUrl(c.patronEquipoPropio + " 'A'");
      if (url) candidatos.push(url);
    }

    /* El que se muestra u oculta es el ARO, no el <img>: el disco con
       borde no puede quedar dibujado y vacío si la imagen no carga. */
    const aro = document.getElementById('clubEscudoAro');
    const mostrar = (v) => {
      const n = aro || img;
      if (v) n.classList.remove('hidden'); else n.classList.add('hidden');
    };

    (function probar(i) {
      if (i >= candidatos.length) { mostrar(false); return; }
      img.onload = () => mostrar(true);
      img.onerror = () => probar(i + 1);
      img.src = candidatos[i];
    })(0);
  }

  /* LOGOS resuelve los escudos después de que carga la config, así que
     reintentamos cuando ya estén disponibles. */
  function reintentarEscudo() {
    if (estado.cfg) ponerEscudo(estado.cfg);
  }

  /* ---------------------------------------------------------------------
     COLOR DE ACENTO COMO TEXTO

     El color de marca sirve para bordes y rellenos, pero NO siempre como
     texto: el naranja de Reconquista da 6.44 de contraste sobre la card
     oscura, el azul de Jujuy da 2.84 — ilegible (el mínimo WCAG AA es 4.5).

     En vez de pedirle a cada club un segundo color, se aclara el suyo hasta
     que sea legible. Mantiene la identidad y garantiza que se lea.
     --------------------------------------------------------------------- */
  const FONDO_CARD = '#1F2937';
  /* El gris de las tarjetas impresas, compartido por las tres exportaciones
     a PDF. El acento se oscurece contra ESTE fondo, no contra el blanco de
     la hoja: el texto de acento vive dentro de las tarjetas. */
  const FONDO_PAPEL = '#f1f5f9';
  /* El color del texto que va ENCIMA del acento cuando el acento es el
     FONDO: la pestaña activa, los botones llenos. Es `text-base`. */
  const TEXTO_SOBRE_ACENTO = '#0B1121';

  function aRgb(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const m = full.match(/../g) || ['00', '00', '00'];
    return m.slice(0, 3).map(x => parseInt(x, 16));
  }

  function luminancia(hex) {
    return aRgb(hex).map(v => {
      const s2 = v / 255;
      return s2 <= 0.03928 ? s2 / 12.92 : Math.pow((s2 + 0.055) / 1.055, 2.4);
    }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  }

  function contraste(a, b) {
    const l1 = luminancia(a), l2 = luminancia(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function aHex(rgb) {
    return '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }

  /** Mezcla dos colores: `f` es cuánto del segundo, de 0 a 1. */
  function mezclarHex(a, b, f) {
    const x = aRgb(a), y = aRgb(b);
    return aHex(x.map((v, i) => v + (y[i] - v) * f));
  }

  /**
   * EL COLOR DE MARCA DE UN ESCUDO: el tono que más superficie cubre.
   *
   * Es el mismo criterio con que se midieron a mano los de DEPORTIVO
   * (#33348a) y Sud América (#0d5e27): se agrupan los píxeles opacos en
   * cubos de 32 niveles por canal y gana el que más tiene, SIN contar
   * blancos, grises ni negros —el fondo y el contorno de casi cualquier
   * escudo—. Se devuelve el PROMEDIO del cubo ganador y no su centro: el
   * centro de un cubo es un color que el escudo no tiene.
   *
   * PURA: recibe los píxeles RGBA en un arreglo plano (lo que devuelve
   * `getImageData().data`), así se prueba desde Node. Sin un solo píxel
   * con color devuelve null: un escudo blanco y negro no tiene un tono
   * que proponer, y ahí el admin elige.
   */
  function colorDeEscudo(px) {
    const cubos = {};
    let mejor = null;
    for (let i = 0; i + 3 < (px ? px.length : 0); i += 4) {
      if (px[i + 3] < 128) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max - min < 48 || max < 40) continue;   // blanco, gris o negro
      const k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
      const c = cubos[k] || (cubos[k] = { n: 0, r: 0, g: 0, b: 0 });
      c.n++; c.r += r; c.g += g; c.b += b;
      if (!mejor || c.n > mejor.n) mejor = c;
    }
    return mejor ? aHex([mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n]) : null;
  }

  /** El color de un <img> ya cargado. Null si el navegador no deja leerlo. */
  function colorDeImagen(img) {
    try {
      const lado = 64;
      const cv = document.createElement('canvas');
      cv.width = lado; cv.height = lado;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0, lado, lado);
      return colorDeEscudo(cx.getImageData(0, 0, lado, lado).data);
    } catch (e) { return null; }   // una imagen de otro origen ensucia el canvas y getImageData lanza
  }

  /** Mezcla el color con blanco hasta alcanzar el contraste pedido. */
  function aclararHastaLegible(color, fondo, minimo) {
    try {
      if (contraste(color, fondo) >= minimo) return color;
      const base = aRgb(color);
      for (let f = 0.1; f <= 1; f += 0.05) {
        const mezcla = aHex(base.map(v => v + (255 - v) * f));
        if (contraste(mezcla, fondo) >= minimo) return mezcla;
      }
      return '#ffffff';
    } catch (e) { return color; }
  }

  /**
   * El simétrico, para el PAPEL: mezcla con negro hasta que se lea sobre
   * fondo claro.
   *
   * Los tres PDF se imprimen con tarjetas grises (`#f1f5f9`), y ahí el
   * acento crudo del club no alcanza: el naranja de Reconquista da 2,84 de
   * contraste sobre ese gris, muy por debajo del 4.5 de WCAG — se leía
   * lavado, casi invisible. Aclararlo (lo que sirve en el tema oscuro)
   * empeora las cosas; hay que oscurecerlo.
   *
   * No se usa un naranja fijo a propósito: el acento es la identidad del
   * cliente, y con un valor fijo el informe de Jujuy saldría con el color
   * de Reconquista.
   */
  function oscurecerHastaLegible(color, fondo, minimo) {
    try {
      if (contraste(color, fondo) >= minimo) return color;
      const base = aRgb(color);
      for (let f = 0.1; f <= 1; f += 0.05) {
        const mezcla = aHex(base.map(v => v * (1 - f)));
        if (contraste(mezcla, fondo) >= minimo) return mezcla;
      }
      return '#000000';
    } catch (e) { return color; }
  }

  /** Para el pie de página: quién hizo esto. */
  function credito() {
    const c = estado.cfg;
    return (c && c.credito) || 'SGADD · Sistema de Gestión y Análisis de Datos Deportivos';
  }

  /* Auto-arranque. La config del club NO puede depender de que otro modulo
     se acuerde de llamarla: si init() falla o cambia, el dashboard quedaria
     mostrando la marca equivocada. Arranca sola y `cargar()` es idempotente,
     asi que el await de init() se engancha a la misma promesa. */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => cargar(), { once: true });
    } else {
      cargar();
    }
  }

  /** Diagnostico rapido desde la consola: CLUB.debug() */
  function debug() {
    const r = {
      id: estado.id, base: BASE, url: estado.url || (BASE + 'clubes/' + estado.id + '.json'),
      cargado: estado.cargado, error: estado.error,
      nombre: estado.cfg ? estado.cfg.nombre : null,
      acento: TEMA.acento,
      planillas: (typeof SGADD !== 'undefined') ? SGADD.CATALOGO.planillas.length : null,
      patron: (typeof SGADD !== 'undefined') ? String(SGADD.CATALOGO.patronEquipoPropio) : null,
      logos: (typeof LOGOS !== 'undefined') ? (LOGOS.CFG.basePaths || []).join(', ') : null,
      headerEnDom: !!document.getElementById('clubNombre'),
    };
    console.table(r);
    return r;
  }

  /** El index avisa cuando ya pintó una vez, para saber si hay que repintar. */
  function marcarRender() { yaHuboRender = true; }

  /* =====================================================================
     LAS CATEGORÍAS SALEN DEL CATÁLOGO DEL SERVIDOR · el JSON pone la marca

     Hasta acá el panel armaba las categorías de un club SOLO desde
     `clubes/<id>.json`, y eso tenía dos modos de fallar, los dos medidos
     con el alta real de Sud América (2026-09-11):

     1 · UN ALTA DEL PANEL MASTER NO ALCANZABA. El alta escribe en KV;
         sin un JSON commiteado el panel del cliente cargaba los valores
         por defecto —los de Reconquista— con un cartel rojo. O sea que
         dar de alta desde la pantalla terminaba siempre en un commit.
     2 · UN JSON CON OTRO NOMBRE DE CATEGORÍA MATABA LA CARGA. El de Sud
         América declaraba `sud-america-primera` y el catálogo la tenía
         como `sudamerica-primera`: el servidor contestaba «No existe esa
         categoría» en cada hoja, sin que nada señalara la diferencia.

     La lista de categorías es del SERVIDOR —es el que sabe qué libros
     hay y el que las va a servir— y el JSON queda para lo que es suyo:
     el nombre, el escudo, los colores, las zonas. Donde los dos nombran
     la MISMA categoría (mismo `slug`), gana lo del JSON: su `id` es la
     clave de los estados y de los links ya compartidos (punto 6).

     DEGRADA SOLO: sin backend, sin token o con un club que el servidor
     no conoce, la config queda exactamente como la dejó el JSON.
     ===================================================================== */
  const escRegex = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * La config que resulta de cruzar el JSON (puede ser `null`) con el club
   * del catálogo del servidor. PURA: no toca el DOM ni el estado.
   *
   * @param {Object|null} cfg el JSON del club, o null si no hay
   * @param {Object} s el club tal como lo publica `/api/v1/catalogo`
   * @param {{equipoPropio?: string}} [extra] el equipo, si se conoce
   */
  function reconciliarConfig(cfg, s, extra) {
    if (!s || !Array.isArray(s.categorias) || !s.categorias.length) return cfg;
    const base = cfg ? Object.assign({}, cfg) : {
      id: s.id,
      nombre: s.nombre || s.id,
      nombreCorto: String(s.nombre || s.id).toUpperCase(),
      liga: s.liga || '',
      anio: new Date().getFullYear(),
      torneo: '',
      origen: 'catalogo',
    };
    /* EL PATRÓN DEL EQUIPO PROPIO, solo si el JSON no trae uno: el del
       JSON está escrito a mano y discrimina adentro del libro (punto 6).
       El derivado va ANCLADO y sobre la clave normalizada, que es contra
       lo que se compara: sin anclar, DEPORTIVO LA PLATA se llevaría a
       DEPORTIVO SAN VICENTE. */
    const equipo = (extra && extra.equipoPropio) || s.equipoPropio;
    if (!base.patronEquipoPropio && equipo) {
      const clave = (typeof SGADD !== 'undefined' && SGADD.claveEquipo)
        ? SGADD.claveEquipo(equipo) : String(equipo).trim().toUpperCase();
      base.patronEquipoPropio = '^' + escRegex(clave) + '$';
    }
    /* EL COLOR DE MARCA PUBLICADO GANA sobre el del JSON, por la misma
       cascada que las zonas (punto 31): publicado → archivo. Sin JSON y
       sin color publicado, el club quedaba con el naranja de Reconquista,
       que es el tema por defecto — medido con Universitario en producción
       el 2026-09-11. La variante oscura se DERIVA: pedirle al admin un
       segundo color es pedirle un dato que no tiene. */
    if (s.acento && /^#[0-9a-f]{6}$/i.test(String(s.acento))
        && String(base.acento || '').toLowerCase() !== String(s.acento).toLowerCase()) {
      base.acento = String(s.acento).toLowerCase();
      base.acentoOscuro = mezclarHex(base.acento, '#000000', 0.3);
    }
    /* Y EL ESCUDO del header sale del EQUIPO propio: el nombre del club
       («Sud América La Plata») no es la clave del manifiesto de escudos
       («SUD AMERICA LP»). */
    if (equipo && !base.equipoEscudo) base.equipoEscudo = equipo;
    const delJson = (cfg && Array.isArray(cfg.planillas)) ? cfg.planillas : [];
    base.planillas = s.categorias.map((k) => {
      const j = delJson.find(p => p && p.slug === k.slug) || null;
      const p = Object.assign({ id: k.slug, label: k.label || k.slug }, j || {});
      p.slug = k.slug;
      if (!p.nivel && k.nivel) p.nivel = k.nivel;
      /* `activo` lo dice el SERVIDOR: una categoría sin libro va al
         selector deshabilitada en vez de dejar entrar a una vista vacía. */
      p.activo = k.activo !== false;
      return p;
    });
    return base;
  }

  /**
   * Aplica el cruce sobre la config vigente. Devuelve si cambió algo.
   * Lo llama `resolverClubYPlanilla()` del `index.html`, después de
   * `cargar()` y ANTES de `SGADD_APP.inicializar()`.
   */
  function reconciliar(clubServidor, extra) {
    const nuevo = reconciliarConfig(estado.cfg, clubServidor, extra);
    if (!nuevo || nuevo === estado.cfg) return false;
    const sinJson = !estado.cfg;
    const cambioColor = !!nuevo.acento && (!estado.cfg || estado.cfg.acento !== nuevo.acento);
    estado.cfg = nuevo;
    estado.origenCategorias = 'catalogo';
    aplicarDatos(nuevo);
    /* Con JSON la marca ya estaba pintada: se repinta SOLO si el color
       publicado es otro. */
    if (cambioColor && !sinJson) aplicarUI(nuevo);
    if (sinJson) {
      estado.error = null;
      try {
        const cartel = document.getElementById('clubCartelError');
        if (cartel) cartel.remove();
      } catch (e) { /* sin DOM, nada que sacar */ }
      aplicarUI(nuevo);
      aplicado = true;
    }
    return true;
  }

  return { TEMA, estado, cargar, aplicar: aplicarSeguro, reconciliar, reconciliarConfig, credito, idDesdeUrl, esLanding, enDemo, debug, marcarRender,
           reintentarEscudo, aclararHastaLegible, oscurecerHastaLegible, contraste,
           mezclarHex, colorDeEscudo, colorDeImagen,
           get cfg() { return estado.cfg; }, get aplicado() { return aplicado; } };
})();
