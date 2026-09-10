/* =====================================================================
   SGADD · DEMO PÚBLICA

   Una vuelta entera del panel, sin login y sin un solo dato real, para
   que un club vea cómo se ve su dashboard antes de contratar.

   TRES DECISIONES QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO
   -------------------------------------------------------

   1 · LOS DATOS SALEN DE UN SNAPSHOT COMMITTEADO, no de un libro.

       Desde que el catálogo dejó de traer `sheetId` (`sgadd-core.js`:
       «EL CATÁLOGO YA NO TIENE sheetId, Y ESE ES EL PUNTO»), leer un
       libro exige pasar por el backend, que pide token. La demo es
       pública por definición, así que no tiene token.

       Poner el id de un libro real en un `clubes/*.json` para que la
       demo leyera en vivo desharía esa decisión: esos archivos son
       públicos. Por eso el libro se lee UNA vez desde `generar-demo.js`
       —con la credencial local— y lo único que entra al repo es el
       resultado ya anonimizado.

   2 · LOS NÚMEROS NO SE TOCAN. Solo se reescriben los NOMBRES.

       El valor de la demo es que el dashboard se vea real: percentiles
       contra la liga, eFG%, PACE, arquetipos, bandas de desvío. Con
       números inventados las etiquetas dirían cualquier cosa y la demo
       enseñaría a desconfiar del producto.

   3 · LA SESIÓN ES DE PLAN PLATA Y NO SE PERSISTE.

       Plata porque es el plan que la demo vende: incluye Scouting, que
       es el módulo que más se mira. Y no se persiste —`establecerSesion`
       solo escribe en memoria— porque si quedara en `localStorage`, el
       que probó la demo abriría el panel al día siguiente convencido de
       que tiene una cuenta.
   ===================================================================== */
const SGADD_DEMO = (function () {
  'use strict';

  const CLUB = 'demo';
  const DATOS = 'demo/datos-demo.json';
  const LOGO = 'logos/motorlogo-64.png';
  const EQUIPO = 'EQUIPO 1';

  /* La sesión sintética. El mail es de la marca y no de una persona: no
     tiene que existir en ningún padrón y nunca se le manda nada. */
  const SESION = {
    email: 'demo@motorstats.ar',
    nombre: 'Demo',
    equipoAsignado: EQUIPO,
    plan: 'PLATA',
  };

  const WHATSAPP = '5492216143994';   // el número comercial de MotorStats

  const estado = { hojas: null, promesa: null };

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v === undefined || v === null ? '' : v);

  /* ===================================================================
     ¿ESTAMOS EN LA DEMO?

     Se lee de la URL y NO se persiste: la demo tiene que poder cerrarse
     sacando el parámetro, y un flag guardado dejaría al visitante
     encerrado en datos falsos sin entender por qué.
     =================================================================== */
  function activo(busqueda) {
    let q = busqueda;
    if (q === undefined) {
      if (typeof window === 'undefined' || !window.location) return false;
      q = window.location.search || '';
    }
    return /(^|[?&])demo=1(&|$)/.test(String(q));
  }

  /** El club que la demo fuerza. Lo lee `sgadd-club.js` al resolver el id. */
  function club() { return CLUB; }

  /** El isotipo que reemplaza a TODOS los escudos mientras dure la demo. */
  function logo() { return LOGO; }

  function sesion() { return SESION; }

  /* ===================================================================
     LOS DATOS

     El snapshot guarda las filas como ARRAYS y no como objetos: un
     objeto por fila repite los ~53 nombres de columna en cada una de las
     7.558 filas, y medido son 5.549 KB contra 2.839. Es un archivo que
     baja cualquiera que abra la demo, muchas veces desde el teléfono.

     El orden de `cols` es el contrato con `generar-demo.js`: acá se
     rehidrata con esos nombres. Hay un test que fija las dos mitades.
     =================================================================== */
  function rehidratar(crudo) {
    const hojas = {};
    Object.keys(crudo.hojas || {}).forEach(nombre => {
      const h = crudo.hojas[nombre];
      const cols = h.cols || [];
      hojas[nombre] = {
        cols: cols.slice(),
        filas: (h.filas || []).map(fila => {
          const o = {};
          for (let i = 0; i < cols.length; i++) o[cols[i]] = fila[i];
          return o;
        }),
      };
    });
    return hojas;
  }

  /**
   * Lo que `sgadd-app.js` espera de `SGADD_DATA.cargarCategoria`, con la
   * misma forma: si algún día la demo devolviera otra cosa, la app
   * tendría dos caminos que mantener sincronizados.
   */
  function cargarCategoria() {
    if (estado.promesa) return estado.promesa;
    estado.promesa = fetch(DATOS)
      .then(r => {
        if (!r.ok) throw new Error('No se pudo leer los datos de la demo (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(crudo => {
        estado.hojas = rehidratar(crudo);
        return {
          hojas: estado.hojas,
          errores: [],
          alcance: null,
          textos: null,
          /* Sin padrón ni alertas: son del buzón, que en la demo no
             tiene a quién avisarle. El índice ya trae a todos. */
          padron: [],
          alertas: [],
          crudas: null,
        };
      })
      .catch(e => {
        /* Se suelta la promesa para que un reintento vuelva a pedir: sin
           esto, una caída de red deja la demo muerta hasta recargar —el
           mismo defecto que ya tuvo `cargarCategoria` (punto 6). */
        estado.promesa = null;
        throw e;
      });
    return estado.promesa;
  }

  /* ===================================================================
     EL BANNER

     Va FIJO arriba y con su propio alto reservado en el `<body>`: un
     banner fijo sin reserva tapa el header de la app, que es donde
     viven el selector de categoría y la campana.

     NO SE IMPRIME. Es un control comercial, no contenido: entra en la
     misma familia que `.no-imprimir` (punto 7.2 bis).
     =================================================================== */
  function banner() {
    return '<div class="demo-barra no-imprimir" role="region" aria-label="Demo pública">'
      + '<span class="demo-barra-txt">'
      + '<strong class="demo-barra-plan">Plan Plata</strong> · '
      + 'Estás explorando con datos anónimos de muestra. '
      + '<span class="demo-barra-pregunta">¿Querés ver cómo se ve el dashboard '
      + 'con las estadísticas de tu equipo?</span>'
      + '</span>'
      + '<button type="button" class="demo-cta" onclick="SGADD_DEMO.abrirModal()">'
      + 'Agendar demo con mis datos</button>'
      + '</div>';
  }

  function montarBanner() {
    if (typeof document === 'undefined' || !activo()) return;
    if (document.getElementById('demoBarra')) return;
    const n = document.createElement('div');
    n.id = 'demoBarra';
    n.innerHTML = banner();
    document.body.insertBefore(n, document.body.firstChild);
    document.body.classList.add('con-demo-barra');
  }

  /* ===================================================================
     EL MODAL DE CAPTURA · tres datos y nada más

     Cada campo de más es gente que abandona. Con el nombre, el club y el
     WhatsApp alcanza para devolver el mensaje, que es lo único que este
     formulario tiene que lograr.

     NO HAY BACKEND al que mandarlo, así que el envío ARMA EL MENSAJE y
     abre WhatsApp: el lead queda en la conversación, que además es donde
     el club quiere atenderlo. Prometer un "te contactamos" sin nada que
     lo cumpla sería peor que no tener el formulario.
     =================================================================== */
  const ROLES = ['Entrenador', 'Asistente', 'Preparador físico', 'Dirigente', 'Analista', 'Otro'];

  /* DE DONDE SE ABRIO. Lo escribe `abrirModal` y lo leen el titulo y el
     mensaje: es la unica diferencia entre los dos origenes, asi que
     duplicar el modal para la landing seria mantener dos formularios
     que se desincronizan (punto 8). */
  const contexto = { plan: null };

  function modal() {
    const plan = contexto.plan;
    return `
      <div class="login-fondo" id="demoModal" role="dialog" aria-modal="true"
           aria-labelledby="demoModalTitulo">
        <div class="login-caja card rounded-xl p-5 border border-hairline">
          <h2 id="demoModalTitulo" class="font-display uppercase tracking-wide text-base text-ink mb-1">
            ${plan ? 'Consultar por el plan ' + esc(plan) : 'Agendar demo con mis datos'}</h2>
          <p class="text-xs text-muted mb-4 leading-relaxed">
            Te armamos el panel con los box scores de tu equipo. Tres datos y
            seguimos por WhatsApp.
          </p>

          <label class="demo-campo">
            <span>Tu nombre y rol</span>
            <input type="text" id="demoNombre" autocomplete="name"
                   placeholder="Ana Pérez · Entrenadora"
                   list="demoRoles" class="demo-input">
          </label>
          <datalist id="demoRoles">
            ${ROLES.map(r => `<option value="${esc(r)}"></option>`).join('')}
          </datalist>

          <label class="demo-campo">
            <span>Club o equipo</span>
            <input type="text" id="demoClub" autocomplete="organization"
                   placeholder="Club Atlético…" class="demo-input">
          </label>

          <label class="demo-campo">
            <span>WhatsApp de contacto</span>
            <input type="tel" id="demoTel" autocomplete="tel" inputmode="tel"
                   placeholder="+54 9 221 555 1234" class="demo-input">
          </label>

          <p id="demoAviso" class="text-[11px] text-muted mt-1" role="status" aria-live="polite"></p>

          <div class="modal-acciones flex items-center gap-3 flex-wrap mt-4">
            <button type="button" id="demoEnviar" onclick="SGADD_DEMO.enviar()"
              class="px-3 py-2 rounded-md text-xs font-display uppercase tracking-wider
                     bg-accent text-base hover:opacity-90">Seguir por WhatsApp</button>
            <button type="button" onclick="SGADD_DEMO.cerrarModal()"
              class="text-[11px] text-muted hover:text-ink ml-auto">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  let disparador = null;

  /**
   * @param {{plan?: string}} [opciones] El plan por el que se consulta,
   *   cuando el modal se abre desde una card de la landing. Sin esto el
   *   mensaje sale con el texto de la demo.
   */
  function abrirModal(opciones) {
    if (typeof document === 'undefined') return;
    if (document.getElementById('demoModal')) return;
    contexto.plan = (opciones && opciones.plan) ? String(opciones.plan) : null;
    disparador = document.activeElement;
    const n = document.createElement('div');
    n.id = 'demoModalHost';
    n.innerHTML = modal();
    document.body.appendChild(n);
    const primero = document.getElementById('demoNombre');
    if (primero) primero.focus();
    document.addEventListener('keydown', escapar);
  }

  function cerrarModal() {
    const n = document.getElementById('demoModalHost');
    if (n) n.remove();
    document.removeEventListener('keydown', escapar);
    contexto.plan = null;
    if (disparador && disparador.focus) disparador.focus();
    disparador = null;
  }

  function escapar(ev) { if (ev.key === 'Escape') cerrarModal(); }

  const valor = (id) => {
    const n = (typeof document !== 'undefined') && document.getElementById(id);
    return n ? String(n.value || '').trim() : '';
  };

  /**
   * El mensaje que se le manda al club. PURO y exportado, para poder
   * testearlo sin navegador.
   */
  function mensaje(datos) {
    const d = datos || {};
    const club = String(d.club || '').trim() || 'mi club';
    const plan = String(d.plan || '').trim();
    /* EL ENCABEZADO DICE LA VERDAD SOBRE DE DONDE VIENE. Con un solo
       texto, el que toca una card de plan en la landing —sin haber
       entrado nunca a la demo— le escribiria al club «probé la demo», y
       el que atiende el WhatsApp arranca la conversacion con un dato
       falso. El resto del mensaje es identico en los dos casos. */
    const cabeza = plan
      ? 'Hola MotorStats, quiero consultar por el plan ' + plan + ' para ' + club + '.'
      : 'Hola MotorStats, probé la demo y quiero ver cómo funciona con los datos de '
        + club + '.';
    return cabeza
      + (d.nombre ? ' Soy ' + String(d.nombre).trim() + '.' : '')
      + (d.tel ? ' Mi WhatsApp es ' + String(d.tel).trim() + '.' : '');
  }

  function enlace(datos) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje(datos));
  }

  function enviar() {
    const datos = {
      nombre: valor('demoNombre'), club: valor('demoClub'), tel: valor('demoTel'),
      plan: contexto.plan,
    };
    const aviso = document.getElementById('demoAviso');
    /* SOLO EL CLUB ES OBLIGATORIO: es el único dato que cambia el mensaje.
       Pedir los tres para poder escribir un WhatsApp es fricción sin
       contrapartida, y el que no quiere dar el teléfono lo va a dar en la
       conversación igual. */
    if (!datos.club) {
      if (aviso) {
        aviso.textContent = 'Poné al menos el club o equipo: es lo que va en el mensaje.';
        aviso.className = 'text-[11px] mt-1 zona-texto zona-aviso';
      }
      const n = document.getElementById('demoClub');
      if (n) n.focus();
      return;
    }
    window.open(enlace(datos), '_blank', 'noopener');
    cerrarModal();
  }

  /* ===================================================================
     ARRANQUE
     =================================================================== */
  function iniciar() {
    if (!activo()) return;
    /* LA SESION NO SE ESTABLECE ACA: la pone `SGADD_AUTH.cargarSesion()`,
       que es el unico punto que decide de donde sale una sesion y ademas
       corre DESPUES que este modulo. Hacerlo en los dos lados dejaba que
       el arranque pisara la de la demo. */
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', montarBanner);
    } else {
      montarBanner();
    }
  }

  iniciar();

  return {
    activo, club, logo, sesion, cargarCategoria, rehidratar,
    banner, montarBanner, modal, abrirModal, cerrarModal, enviar,
    mensaje, enlace, EQUIPO, DATOS, WHATSAPP, SESION,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_DEMO;
