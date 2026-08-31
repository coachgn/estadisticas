/* =====================================================================
   SGADD · Selector de cliente · SOLO para el ADMIN

   Con tres clubes se cambiaba de cliente editando el `?club=` a mano. Con
   cincuenta eso no es incómodo: es el gesto donde uno se equivoca y
   termina mirando los datos del cliente que no era, sin ningún síntoma.

   ESTO NO ES UN CONTROL DE ACCESO. El gate de interfaz del punto 19 no es
   seguridad —el panel es estático y cualquiera con la consola se pone
   `rol: ADMIN`— y este selector tampoco: es una comodidad de navegación.
   Quien decide de verdad qué datos salen es el backend, que re-deriva el
   rol contra su lista de admins en cada petición. Por eso acá se dice
   "no sos admin", nunca "estos datos están protegidos".

   La lista sale de `/api/v1/catalogo` y de ningún otro lado. El proyecto
   no tiene un listado de clubes: `?club=<id>` resuelve `clubes/<id>.json`
   por convención (punto 6), y sumar un cliente es un JSON y cero código.
   Hardcodear la lista acá reintroduciría la segunda fuente de verdad que
   ese diseño evita — y encima en el lugar donde más se nota, porque el
   club nuevo sería justo el que no aparece.
   ===================================================================== */

const SGADD_CLIENTES = (function () {
  'use strict';

  /* En el navegador son globals; desde Node hay que requerirlos. Mismo
     patrón que usa `sgadd-data.js` con el núcleo. */
  const auth = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH
    : (typeof require !== 'undefined' ? require('./sgadd-auth.js') : null);

  const estado = {
    clubes: null,      // null = todavía no se pidió · [] = se pidió y no hay
    pidiendo: false,
    error: null,
  };

  /* =====================================================================
     MOTOR · puro y testeable, sin tocar `document`
     ===================================================================== */

  /**
   * ¿Se dibuja el selector?
   *
   * TRES condiciones, y las tres importan:
   *
   * - Solo ADMIN. A un CLIENTE una lista de clubes le sugiere un acceso
   *   que no tiene, y como esto no es seguridad, mostrársela sería mentirle
   *   sobre qué lo separa de esos datos.
   * - Con backend. Sin API no hay catálogo que pedir, y un desplegable
   *   vacío es peor que ninguno.
   * - Con DOS clubes o más. Con uno solo el control no lleva a ningún lado
   *   y solo gasta lugar en el header — es la misma regla por la que el
   *   TOTAL no se ofrece cuando la fase tiene un torneo (punto 3 ter).
   */
  function seMuestra(rol, clubes, hayApi) {
    if (rol !== (auth ? auth.ROLES.ADMIN : 'ADMIN')) return false;
    if (!hayApi) return false;
    return Array.isArray(clubes) && clubes.length > 1;
  }

  /**
   * Las opciones del desplegable, ordenadas y con su estado de datos.
   *
   * Los INACTIVOS se listan igual, deshabilitados y con "sin datos". Es la
   * misma decisión que ya toma el selector de categorías (punto 6): el
   * admin tiene que ver que el club existe y que le falta el libro, en vez
   * de no encontrarlo y no saber si está mal dado de alta o si no está.
   */
  function opciones(clubes, clubActual) {
    return (clubes || []).map((c) => {
      const cats = c.categorias || [];
      const conDatos = cats.filter(k => k.activo).length;
      return {
        id: c.id,
        nombre: c.nombre || c.id,
        liga: c.liga || null,
        categorias: cats.length,
        conDatos: conDatos,
        activo: conDatos > 0,
        actual: c.id === clubActual,
        etiqueta: (c.nombre || c.id)
          + (conDatos > 0 ? '  ·  ' + conDatos + (conDatos === 1 ? ' categoría' : ' categorías')
                          : '  ·  sin datos'),
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  /**
   * La URL a la que se va al elegir un club.
   *
   * EL TOKEN NO VIAJA. Vive en `sessionStorage`, que sobrevive a una
   * recarga en la misma pestaña, así que volver a ponerlo en el query
   * string solo lograría dejarlo otra vez en el historial y en los logs de
   * cualquier proxy — que es justo de lo que `sacarTokenDeLaUrl()` lo saca
   * apenas se lee.
   *
   * SE CONSERVA `?api=`, que es lo que permite probar contra un servidor
   * local: perderlo al cambiar de club mandaría la prueba a producción sin
   * avisar.
   *
   * Y EL HASH SE DESCARTA a propósito. La ruta lleva planilla, tramo y
   * entidad —`#/<planilla>/<torneo>/<fase>/<seccion>/<equipo>`— y nada de
   * eso existe en el club nuevo: la planilla es de otro libro. Arrastrarlo
   * abriría una ficha que no está y la sección quedaría vacía sin decir
   * por qué.
   */
  function urlDeClub(clubId, busquedaActual) {
    let q;
    try { q = new URLSearchParams(busquedaActual || ''); } catch (e) { q = null; }
    const partes = ['club=' + encodeURIComponent(clubId)];
    if (q && q.get('api')) partes.push('api=' + encodeURIComponent(q.get('api')));
    return '?' + partes.join('&');
  }

  /* =====================================================================
     UI · de acá para abajo se toca el DOM
     ===================================================================== */

  function esc(v) {
    return (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
      ? SGADD_UI.esc(v) : String(v == null ? '' : v);
  }

  /** El club abierto ahora mismo. */
  function clubActual() {
    try {
      if (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id) return CLUB.estado.id;
    } catch (e) { /* CLUB puede no estar todavía */ }
    try {
      return new URLSearchParams(window.location.search).get('club') || null;
    } catch (e) { return null; }
  }

  function slot() {
    return (typeof document !== 'undefined') ? document.getElementById('clientesSlot') : null;
  }

  function html() {
    const rol = auth ? auth.rol() : null;
    const hayApi = (typeof SGADD_DATA !== 'undefined') && SGADD_DATA.apiConfigurada();
    if (!seMuestra(rol, estado.clubes, hayApi)) return '';

    const actual = clubActual();
    const ops = opciones(estado.clubes, actual);
    const hay = ops.some(o => o.actual);

    return '<label class="sr-only" for="selClienteAdmin">Cliente</label>'
      + '<select id="selClienteAdmin" class="sel-cliente" '
      + 'title="Cambiar de cliente · solo admin" '
      + 'onchange="SGADD_CLIENTES.elegir(this.value)">'
      /* Sin club reconocido va un placeholder deshabilitado: sin él, el
         desplegable mostraría el primero del abecedario como si fuera el
         que se está mirando. */
      + (hay ? '' : '<option value="" disabled selected>Elegí un cliente</option>')
      + ops.map(o => '<option value="' + esc(o.id) + '"'
          + (o.actual ? ' selected' : '') + '>'
          + esc(o.etiqueta) + '</option>').join('')
      + '</select>';
  }

  function pintar() {
    const s = slot();
    if (!s) return;
    s.innerHTML = html();
  }

  /**
   * Cambiar de cliente RECARGA la página. No repinta.
   *
   * Al cambiar de club hay que limpiar todo —`LOGOS.reset()`, el caché de
   * hojas, el JSON de marca, los tres tokens de color— porque dos ligas
   * pueden tener un "Atenas" cada una con escudo distinto (punto 6). Ese
   * camino ya existe y está probado: es una carga con `?club=`. Reproducir
   * la limpieza acá sería una segunda implementación de algo que ya
   * funciona, y de las que se olvidan un paso.
   */
  function elegir(clubId) {
    if (!clubId || clubId === clubActual()) return;
    try {
      window.location.href = urlDeClub(clubId, window.location.search);
    } catch (e) { /* sin window no hay a dónde ir */ }
  }

  /**
   * Pide el catálogo y dibuja. Idempotente y silencioso.
   *
   * Se llama SIN `await` desde el arranque: el selector puede aparecer un
   * instante después y eso no molesta a nadie, mientras que esperarlo
   * demoraría el primer pintado por un control de comodidad.
   */
  function iniciar(opciones) {
    /* `forzar` para después de un login: al arrancar sin sesión esto salió
       por el atajo de "no soy admin", y sin poder reintentar el selector no
       aparecía nunca. */
    const o = opciones || {};
    if (!o.forzar && (estado.pidiendo || estado.clubes)) return Promise.resolve(estado.clubes);
    if (!auth || auth.rol() !== auth.ROLES.ADMIN) return Promise.resolve(null);
    if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.apiConfigurada()) {
      return Promise.resolve(null);
    }
    estado.pidiendo = true;
    return SGADD_DATA.catalogo({ forzar: !!o.forzar }).then((cat) => {
      estado.pidiendo = false;
      estado.clubes = (cat && cat.clubes) ? cat.clubes : [];
      pintar();
      /* Y EL HUB, si está abierto. El catálogo llega DESPUÉS de que la
         pestaña Clientes se pintó —es asíncrono— así que sin esto el admin
         entraba al Panel Master, veía "el catálogo no lo tiene a mano" y
         tenía que ir a otra pestaña y volver para que apareciera. */
      try {
        const n = (typeof document !== 'undefined') ? document.getElementById('hubClientes') : null;
        if (n && typeof SGADD_HUB !== 'undefined') n.innerHTML = SGADD_HUB.html();
      } catch (e) { /* el hub puede no estar en pantalla */ }
      return estado.clubes;
    }).catch(() => {
      estado.pidiendo = false;
      estado.error = 'No se pudo leer el catálogo';
      return null;
    });
  }

  return {
    /* motor */
    seMuestra, opciones, urlDeClub,
    /* ui */
    iniciar, pintar, elegir, html, clubActual,
    estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CLIENTES;
