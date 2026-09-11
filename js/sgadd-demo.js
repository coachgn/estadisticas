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

  /* La landing. Relativa a proposito: el panel se publica en un
     subdirectorio (`/estadisticas/`), asi que un `/` absoluto se iria a la
     raiz del dominio, que no es este sitio. */
  const INICIO = 'index.html';

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
      /* LA SALIDA VA ANTES DEL CTA, y en outline. Dos motivos:

         · en una barra que se lee de izquierda a derecha el ULTIMO
           elemento es el que pesa, asi que el CTA conserva su lugar;
         · y es un ENLACE de verdad, no un boton con `onclick`: se puede
           abrir en otra pestaña, copiar y ver a donde va antes de tocar,
           que es lo que uno espera de «volver al inicio».

         Apunta a `index.html` a secas —sin `?demo=1`— que desde la URL de
         la demo (`…/index.html?demo=1`) resuelve a la landing. */
      + '<a href="' + INICIO + '" class="demo-volver">Volver al inicio</a>'
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
    reservarAlto();
    vigilarAlto();
  }

  /**
   * LA RESERVA SALE DE LA BARRA MEDIDA, no de un numero escrito a mano.
   *
   * La barra va FIJA, asi que el `<body>` tiene que reservarle su alto o
   * le tapa el header a la app —donde viven el selector de categoria y la
   * campana—. Ese alto estaba en el CSS como una constante (44px en
   * escritorio, 64 en telefono) y **son dos numeros para el mismo hecho**:
   * al sumarle el «Volver al inicio» la barra paso a medir 49px y se comio
   * 5px del header, sin ningun sintoma mas que eso.
   *
   * Midiendola se acabo la clase entera de bug: cambie el texto, entre un
   * boton mas o se parta en dos renglones, la reserva acompaña. El CSS
   * conserva sus constantes como PISO —es lo que vale entre que la barra
   * se pinta y este calculo corre, y en un `<body>` sin layout todavia
   * `getBoundingClientRect` puede devolver 0—.
   */
  function reservarAlto() {
    /* SE MIDE `.demo-barra` Y NO SU CONTENEDOR. `#demoBarra` es el `<div>`
       que se inserta en el body, pero la barra de adentro va
       `position: fixed`, o sea FUERA DEL FLUJO: el contenedor mide CERO.
       Medido en el navegador — la primera version leia el wrapper, daba 0,
       la guarda `alto > 0` la salteaba y la reserva se quedaba en la
       constante del CSS sin ningun sintoma mas que los 5px de header
       tapados que se venian a arreglar. */
    const n = document.querySelector('.demo-barra');
    if (!n) return;
    const alto = Math.ceil(n.getBoundingClientRect().height);
    if (alto > 0) document.body.style.paddingTop = alto + 'px';
  }

  /**
   * SE OBSERVA LA BARRA, no se mide una vez y listo.
   *
   * Medir al montar da un numero que todavia no es el definitivo: la barra
   * envuelve en varios renglones segun el ancho y las tipografias entran
   * DESPUES del primer layout. Medido en el telefono: al montar daba 147px
   * y la barra terminaba en 107 — sin solaparse, pero con 40px de aire
   * muerto arriba de la app.
   *
   * `ResizeObserver` cubre las dos causas de una: dispara cuando cambia el
   * ancho Y cuando cambia el contenido. El `resize` de ventana queda de
   * respaldo para el navegador que no lo tenga.
   */
  function vigilarAlto() {
    if (typeof window === 'undefined') return;
    const n = document.querySelector('.demo-barra');
    if (n && typeof ResizeObserver === 'function') {
      try {
        new ResizeObserver(function () { reservarAlto(); }).observe(n);
        return;
      } catch (e) { /* sin observador, queda el respaldo de abajo */ }
    }
    if (window.addEventListener) {
      window.addEventListener('resize', function () {
        if (activo()) reservarAlto();
      });
    }
  }

  /* ===================================================================
     EL MODAL DE CAPTURA · quién es, de qué club y de dónde

     Cada campo de más es gente que abandona, así que cada uno tiene que
     cambiar el mensaje. El TELÉFONO SE SACÓ por eso: el mensaje sale
     desde el WhatsApp del propio interesado, así que su número ya viaja
     con él. Pedirlo era fricción que no aportaba un solo dato.

     La UBICACIÓN sí entra, y es la que más le sirve al que atiende: dice
     de qué liga se habla antes de preguntar, y en qué huso horario
     contestar.

     NO HAY BACKEND al que mandarlo, así que el envío ARMA EL MENSAJE y
     abre WhatsApp: el lead queda en la conversación, que además es donde
     el club quiere atenderlo. Prometer un "te contactamos" sin nada que
     lo cumpla sería peor que no tener el formulario.
     =================================================================== */
  /* EL ROL VA EN SU PROPIO DESPLEGABLE, no pegado al nombre. Estuvo en
     un solo campo con un datalist de roles, y eso tenia dos defectos: al
     escribir el NOMBRE el navegador sugeria «Entrenador», y el mensaje
     no podia decir «Ana Pérez (Entrenadora)» porque no sabia donde
     terminaba uno y empezaba el otro. «Otro» no se escribe en el
     mensaje: «(Otro)» no le dice nada al que atiende. */
  const ROLES = ['Entrenador/a', 'Asistente', 'Preparador/a físico/a', 'Dirigente', 'Analista', 'Otro'];
  const OTRO_ROL = 'Otro';

  /* LOS PAÍSES son los mercados de básquet a los que se apunta, con
     Argentina primero y elegido: es donde está hoy cada cliente.

     LAS CIUDADES SON SUGERENCIAS, NO UNA LISTA CERRADA. Van en un
     datalist: el que es de La Plata la toca y listo, y el que es de
     Olavarría la escribe. Un select con las ciudades dejaría afuera a
     casi todos los clubes del país —el básquet argentino se juega en
     cientos de localidades— y el que no encuentra la suya abandona. */
  const OTRO_PAIS = 'Otro';
  const PAISES = [
    { nombre: 'Argentina', ciudades: ['Buenos Aires', 'La Plata', 'Córdoba', 'Rosario',
      'Mar del Plata', 'Mendoza', 'Bahía Blanca', 'Santa Fe', 'San Miguel de Tucumán',
      'Salta', 'San Salvador de Jujuy', 'Neuquén', 'Corrientes', 'Resistencia',
      'Paraná', 'San Juan', 'Junín', 'Olavarría'] },
    { nombre: 'Uruguay', ciudades: ['Montevideo', 'Salto', 'Paysandú', 'Maldonado', 'Rivera'] },
    { nombre: 'Paraguay', ciudades: ['Asunción', 'Ciudad del Este', 'Encarnación', 'Luque'] },
    { nombre: 'Chile', ciudades: ['Santiago', 'Valparaíso', 'Concepción', 'Antofagasta',
      'Temuco', 'Valdivia'] },
    { nombre: 'Bolivia', ciudades: ['La Paz', 'Santa Cruz de la Sierra', 'Cochabamba', 'Sucre'] },
    { nombre: 'Perú', ciudades: ['Lima', 'Arequipa', 'Trujillo', 'Cusco'] },
    { nombre: 'Brasil', ciudades: ['São Paulo', 'Río de Janeiro', 'Brasilia', 'Belo Horizonte',
      'Porto Alegre', 'Curitiba', 'Franca'] },
    { nombre: 'Colombia', ciudades: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena'] },
    { nombre: 'Venezuela', ciudades: ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto'] },
    { nombre: 'Ecuador', ciudades: ['Quito', 'Guayaquil', 'Cuenca'] },
    { nombre: 'México', ciudades: ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla',
      'Mérida', 'Tijuana'] },
    { nombre: 'España', ciudades: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga',
      'Bilbao', 'Zaragoza'] },
    { nombre: OTRO_PAIS, ciudades: [] },
  ];
  const PAIS_DEFECTO = 'Argentina';

  function ciudadesDe(pais) {
    const p = PAISES.find(x => x.nombre === pais);
    return p ? p.ciudades : [];
  }

  function opcionesCiudad(pais) {
    return ciudadesDe(pais).map(c => '<option value="' + esc(c) + '"></option>').join('');
  }

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
            Te armamos el panel con los box scores de tu equipo. Contanos
            quién sos y de dónde, y seguimos por WhatsApp.
          </p>

          <div class="demo-fila">
            <label class="demo-campo">
              <span>Tu nombre</span>
              <input type="text" id="demoNombre" autocomplete="name"
                     placeholder="Ana Pérez" class="demo-input">
            </label>

            <label class="demo-campo">
              <span>Rol</span>
              <select id="demoRol" class="demo-input">
                <option value="">Elegí…</option>
                ${ROLES.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('')}
              </select>
            </label>
          </div>

          <label class="demo-campo">
            <span>Club o equipo</span>
            <input type="text" id="demoClub" autocomplete="organization"
                   placeholder="Club Atlético…" class="demo-input">
          </label>

          <!-- PAIS Y CIUDAD van en una FILA desde 480px y apilados en el
               telefono: son un solo dato, de donde sos, partido en dos. -->
          <div class="demo-fila">
            <label class="demo-campo">
              <span>País</span>
              <select id="demoPais" autocomplete="country-name" class="demo-input"
                      onchange="SGADD_DEMO.paisCambio()">
                ${PAISES.map(p => '<option value="' + esc(p.nombre) + '"'
                  + (p.nombre === PAIS_DEFECTO ? ' selected' : '') + '>'
                  + esc(p.nombre) + '</option>').join('')}
              </select>
            </label>

            <label class="demo-campo">
              <span>Ciudad</span>
              <input type="text" id="demoCiudad" autocomplete="address-level2"
                     placeholder="Escribí tu ciudad" list="demoCiudades" class="demo-input">
            </label>
          </div>
          <datalist id="demoCiudades">${opcionesCiudad(PAIS_DEFECTO)}</datalist>

          <!-- «Otro» abre un campo para escribirlo: sin el, el mensaje diria
               «de la ciudad de Lisboa, Otro», que no es un pais. -->
          <label class="demo-campo" id="demoPaisOtroCampo" hidden>
            <span>¿Qué país?</span>
            <input type="text" id="demoPaisOtro" autocomplete="country-name"
                   placeholder="Portugal" class="demo-input">
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
    /* La marca de campo vacío se va apenas se escribe en él: un borde
       rojo que sigue ahí después de corregir se lee como otro error. Un
       solo listener en el modal, por delegación. */
    const quitarMarca = (ev) => {
      if (ev.target && ev.target.removeAttribute) ev.target.removeAttribute('aria-invalid');
    };
    n.addEventListener('input', quitarMarca);
    n.addEventListener('change', quitarMarca);
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
   * Cambió el país: se rehacen las sugerencias de ciudad y se muestra o
   * esconde el campo de «Otro».
   *
   * NO SE REPINTA EL MODAL. Un repintado le saca el foco al select y
   * borra lo que ya se escribió en los otros campos — la misma regla de
   * scoutMeta() y del buscador del buzón. Solo se tocan el datalist y el
   * campo de «Otro».
   *
   * Y LA CIUDAD ESCRITA NO SE BORRA: si quedó «La Plata» con España
   * elegida, está a la vista y se corrige de un toque; borrarla sin
   * avisar es perder lo que la persona escribió.
   */
  function paisCambio() {
    if (typeof document === 'undefined') return;
    const pais = valor('demoPais');
    const lista = document.getElementById('demoCiudades');
    if (lista) lista.innerHTML = opcionesCiudad(pais);
    const otro = document.getElementById('demoPaisOtroCampo');
    if (otro) {
      otro.hidden = pais !== OTRO_PAIS;
      const campo = document.getElementById('demoPaisOtro');
      if (!otro.hidden && campo) campo.focus();
    }
  }

  /** El país que va al mensaje: con «Otro», el que la persona escribió. */
  function paisElegido() {
    const p = valor('demoPais');
    return p === OTRO_PAIS ? valor('demoPaisOtro') : p;
  }

  /**
   * El mensaje que se le manda al club. PURO y exportado, para poder
   * testearlo sin navegador.
   */
  function mensaje(datos) {
    const d = datos || {};
    const t = (v) => String(v === undefined || v === null ? '' : v).trim();
    const club = t(d.club);
    const plan = t(d.plan);
    const nombre = t(d.nombre);
    const rol = t(d.rol) === OTRO_ROL ? '' : t(d.rol);
    const ciudad = t(d.ciudad);
    const pais = t(d.pais);
    /* EL ENCABEZADO DICE LA VERDAD SOBRE DE DONDE VIENE. Con un solo
       texto, el que toca una card de plan en la landing —sin haber
       entrado nunca a la demo— le escribiria al club «probé la demo», y
       el que atiende el WhatsApp arranca la conversacion con un dato
       falso. El resto del mensaje es identico en los dos casos. */
    const cabeza = plan
      ? 'Hola MotorStats, quiero consultar por el plan ' + plan + '.'
      : 'Hola MotorStats, probé la demo.';
    /* LA UBICACION SE ARMA CON LO QUE HAYA. El formulario exige los dos
       datos, pero la funcion es pura y se llama tambien sin formulario:
       un «de la ciudad de , » colgado es peor que no nombrar el lugar. */
    const lugar = (ciudad && pais) ? ', de la ciudad de ' + ciudad + ', ' + pais
      : ciudad ? ', de la ciudad de ' + ciudad
      : pais ? ', de ' + pais
      : '';
    /* «DEL CLUB CLUB ATLÉTICO…»: casi todos escriben el nombre oficial,
       que ya arranca con «Club». Se antepone la palabra solo si falta. */
    const esClub = /^club\b/i.test(club);
    const del = !club ? 'de mi club' : (esClub ? 'del ' : 'del club ') + club;
    const desde = !club ? 'desde mi club' : (esClub ? 'desde el ' : 'desde el club ') + club;
    /* Nombre y rol son opcionales: sin ninguno de los dos la frase cambia
       de sujeto en vez de quedar «Soy  del club…». */
    const soy = (nombre && rol) ? nombre + ' (' + rol + ')'
      : nombre || rol.toLowerCase();
    const quien = soy
      ? ' Soy ' + soy + ' ' + del + lugar + '.'
      : ' Te escribo ' + desde + lugar + '.';
    return cabeza + quien
      + ' Quiero ver cómo funciona el dashboard con las estadísticas de mi equipo.';
  }

  function enlace(datos) {
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(mensaje(datos));
  }

  /**
   * Qué falta para poder mandar, en el orden del formulario. PURA y
   * exportada: es la regla de la validación, y así se testea sin DOM.
   *
   * SE EXIGEN EL CLUB, EL PAÍS Y LA CIUDAD: son los tres datos que el que
   * atiende no puede deducir de la conversación. El nombre y el rol no:
   * llegan con el propio contacto de WhatsApp, y el mensaje se arma igual
   * sin ellos.
   *
   * Con «Otro» el país que cuenta es el escrito: elegir «Otro» y dejarlo
   * vacío es no haber dicho el país.
   */
  function faltantes(d) {
    const x = d || {};
    const f = [];
    if (!String(x.club || '').trim()) f.push({ id: 'demoClub', dato: 'el club o equipo' });
    if (!String(x.pais || '').trim()) {
      f.push({ id: x.paisOtro ? 'demoPaisOtro' : 'demoPais', dato: 'el país' });
    }
    if (!String(x.ciudad || '').trim()) f.push({ id: 'demoCiudad', dato: 'la ciudad' });
    return f;
  }

  /**
   * El aviso de lo que falta. PURA: la concordancia se escapó una vez
   * —medido en el sitio publicado, «Falta el país: van en el mensaje»— y
   * un texto que se arma con plurales tiene que poder testearse.
   *
   * Se nombra TODO lo que falta de una vez: avisar de a uno obliga a
   * tocar «Seguir» tres veces para descubrir el formulario.
   */
  function avisoFaltantes(falta) {
    const lista = (falta || []).map(x => x.dato);
    if (!lista.length) return '';
    const uno = lista.length === 1;
    const texto = uno ? lista[0]
      : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
    return (uno ? 'Falta ' : 'Faltan ') + texto + (uno ? ': va' : ': van') + ' en el mensaje.';
  }

  function enviar() {
    const datos = {
      nombre: valor('demoNombre'), rol: valor('demoRol'), club: valor('demoClub'),
      pais: paisElegido(), ciudad: valor('demoCiudad'),
      paisOtro: valor('demoPais') === OTRO_PAIS,
      plan: contexto.plan,
    };
    const falta = faltantes(datos);
    if (falta.length) {
      const aviso = document.getElementById('demoAviso');
      if (aviso) {
        aviso.textContent = avisoFaltantes(falta);
        aviso.className = 'text-[11px] mt-1 zona-texto zona-aviso';
      }
      /* Cada campo vacío se marca además con aria-invalid: el lector de
         pantalla lo anuncia al llegar al campo, y el borde lo marca sin
         depender de leer el aviso del pie (punto 14). */
      ['demoClub', 'demoPais', 'demoPaisOtro', 'demoCiudad'].forEach(id => {
        const n = document.getElementById(id);
        if (n) n.setAttribute('aria-invalid', falta.some(x => x.id === id) ? 'true' : 'false');
      });
      const n = document.getElementById(falta[0].id);
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
    banner, montarBanner, reservarAlto, vigilarAlto, modal, abrirModal, cerrarModal, enviar,
    paisCambio, faltantes, avisoFaltantes, ciudadesDe, ROLES,
    mensaje, enlace, EQUIPO, DATOS, WHATSAPP, SESION, INICIO, PAISES, PAIS_DEFECTO,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_DEMO;
