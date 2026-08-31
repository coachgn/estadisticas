/* =====================================================================
   SGADD · Pantalla de ingreso de administradores

   LOS CLIENTES NO PASAN POR ACÁ, y es deliberado. Un club entra por su
   link firmado, como siempre: pedirle a un cuerpo técnico que se registre
   para ver sus propios datos sería empeorarle el producto por una comodidad
   nuestra. Esta pantalla es para los tres administradores, cuyo acceso sí
   convenía sacar de un link que circula por WhatsApp y no se puede revocar.

   POR ESO NO ES UN MURO. El panel sigue abriendo sin sesión —ese es el rol
   `ABIERTO` del punto 19— y esta pantalla es una puerta que se toca, no una
   que se cruza obligatoriamente. Convertirla en un gate dejaría afuera a
   los tres clubes que hoy usan el panel sin token, y no protegería nada
   nuevo: lo que decide si los datos salen es el backend.

   LA CLAVE NUNCA SE GUARDA NI SE RECUERDA. Va del input al servidor y se
   descarta; lo que queda es el token firmado, en `sessionStorage`, igual
   que el de un link.
   ===================================================================== */

const SGADD_LOGIN = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  const estado = {
    abierto: false,
    modo: 'ingresar',        // 'ingresar' | 'fijar'
    email: '',
    yendo: false,
    error: '',
    ok: '',
    disparador: null,
  };

  /* =====================================================================
     MOTOR · puro
     ===================================================================== */

  /**
   * A dónde va el admin después de entrar.
   *
   * AL PANEL MASTER, que es lo que pidió el producto y además es lo que
   * tiene sentido: quien entra con clave está administrando, no mirando un
   * partido. Se arma con la ruta y no con un `location.reload()` para no
   * perder la planilla y el tramo que ya estaban abiertos.
   */
  function destino() { return 'configuracion'; }

  /** Qué falta para poder enviar. En castellano y ANTES de apretar. */
  function faltantes(d) {
    const v = d || {};
    const f = [];
    if (!v.email) f.push('el mail');
    if (v.modo === 'fijar') {
      if (!v.codigo) f.push('el código de invitación');
      if (!v.claveNueva) f.push('la clave nueva');
    } else if (!v.clave) f.push('la clave');
    return f;
  }

  /* El mismo mínimo que exige el servidor. Se repite acá SOLO para avisar
     antes de mandar: el que decide es el servidor, y si divergieran el
     usuario vería un rechazo que la pantalla no anticipó. Hay un test que
     compara los dos números. */
  const LARGO_MINIMO = 12;

  function claveCorta(c) { return String(c || '').length < LARGO_MINIMO; }

  /* =====================================================================
     UI
     ===================================================================== */

  const campos = { email: '', clave: '', codigo: '', claveNueva: '' };

  function html() {
    const f = faltantes({ modo: estado.modo, email: campos.email, clave: campos.clave,
      codigo: campos.codigo, claveNueva: campos.claveNueva });
    const corta = estado.modo === 'fijar' && campos.claveNueva && claveCorta(campos.claveNueva);

    const input = (id, etiqueta, tipo, ayuda) => `<label class="block mb-3">
      <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(etiqueta)}</span>
      <input type="${tipo}" value="${esc(campos[id])}" id="login_${id}"
        autocomplete="${tipo === 'password' ? (estado.modo === 'fijar' ? 'new-password' : 'current-password') : 'email'}"
        oninput="SGADD_LOGIN.campo('${id}', this.value)"
        onkeydown="if(event.key==='Enter')SGADD_LOGIN.enviar()"
        class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink">
      ${ayuda ? `<span class="block text-[10px] text-muted mt-1">${ayuda}</span>` : ''}
    </label>`;

    return `<div class="login-fondo" onclick="if(event.target===this)SGADD_LOGIN.cerrar()">
      <div class="login-caja card rounded-xl p-5 border border-hairline" role="dialog"
           aria-modal="true" aria-labelledby="loginTitulo">
        <h2 id="loginTitulo" class="font-display uppercase tracking-wide text-sm text-ink mb-1">
          ${estado.modo === 'fijar' ? 'Fijá tu clave' : 'Ingreso de administrador'}</h2>
        <p class="text-xs text-muted mb-4">
          ${estado.modo === 'fijar'
            ? 'Con el código que te pasaron, elegí tu propia clave. El código sirve una sola vez.'
            : 'Los clubes entran por su link; esto es para el equipo de MotorStats.'}
        </p>

        ${input('email', 'mail', 'email')}
        ${estado.modo === 'fijar'
          ? input('codigo', 'código de invitación', 'text', 'Te lo pasaron por privado. Vence.')
            + input('claveNueva', 'tu clave nueva', 'password',
                'Mínimo ' + LARGO_MINIMO + ' caracteres. Una frase de tres o cuatro palabras '
                + 'es más fácil de recordar y más difícil de romper que ocho caracteres raros.')
          : input('clave', 'clave', 'password')}

        ${corta ? `<p class="text-xs zona-texto zona-aviso mb-2">La clave necesita al menos ${LARGO_MINIMO} caracteres.</p>` : ''}
        ${estado.error ? `<p class="text-xs zona-texto zona-peligro mb-2">${esc(estado.error)}</p>` : ''}
        ${estado.ok ? `<p class="text-xs zona-texto zona-exito mb-2">${esc(estado.ok)}</p>` : ''}

        <div class="flex items-center gap-3 flex-wrap mt-4">
          <button onclick="SGADD_LOGIN.enviar()" ${estado.yendo || f.length || corta ? 'disabled' : ''}
            class="px-3 py-2 rounded-md text-xs font-display uppercase tracking-wider
                   bg-accent text-base hover:opacity-90 disabled:opacity-40">
            ${estado.yendo ? 'Un momento…' : (estado.modo === 'fijar' ? 'Guardar y entrar' : 'Entrar')}</button>
          <button onclick="SGADD_LOGIN.alternar()"
            class="text-[11px] text-accent hover:underline">
            ${estado.modo === 'fijar' ? '← Ya tengo clave' : 'Tengo un código de invitación →'}</button>
          <button onclick="SGADD_LOGIN.cerrar()" class="text-[11px] text-muted hover:text-ink ml-auto">Cerrar</button>
        </div>

        ${f.length && !estado.yendo
          ? `<p class="text-[11px] text-muted mt-3">Falta ${esc(f.join(', '))}.</p>` : ''}
      </div>
    </div>`;
  }

  function pintar() {
    const s = document.getElementById('loginSlot');
    if (!s) return;
    s.innerHTML = estado.abierto ? html() : '';
    if (estado.abierto) {
      const foco = document.getElementById(campos.email ? 'login_' + (estado.modo === 'fijar' ? 'codigo' : 'clave') : 'login_email');
      if (foco) foco.focus();
    }
  }

  /* Tipear NO repinta: le sacaría el foco al input y haría imposible
     escribir una frase larga. Solo se repinta cuando cambia algo que la
     pantalla tiene que reflejar — el modo, un error, el estado de envío. */
  function campo(id, v) {
    if (!(id in campos)) return;
    campos[id] = String(v == null ? '' : v);
    /* El botón se habilita o no según los faltantes, así que hay que
       refrescarlo; se toca SOLO el botón, no el formulario. */
    const b = document.querySelector('.login-caja button');
    if (b) {
      const f = faltantes({ modo: estado.modo, email: campos.email, clave: campos.clave,
        codigo: campos.codigo, claveNueva: campos.claveNueva });
      b.disabled = !!(estado.yendo || f.length ||
        (estado.modo === 'fijar' && campos.claveNueva && claveCorta(campos.claveNueva)));
    }
  }

  function abrir(modo) {
    estado.abierto = true;
    estado.modo = modo || 'ingresar';
    estado.error = ''; estado.ok = '';
    try { estado.disparador = document.activeElement; } catch (e) { estado.disparador = null; }
    pintar();
  }

  function cerrar() {
    estado.abierto = false;
    /* La clave se borra del estado al cerrar. No se guarda ni se recuerda:
       lo único que sobrevive a esta pantalla es el token firmado. */
    campos.clave = ''; campos.claveNueva = ''; campos.codigo = '';
    pintar();
    try { if (estado.disparador && estado.disparador.focus) estado.disparador.focus(); } catch (e) {}
  }

  function alternar() {
    estado.modo = (estado.modo === 'fijar') ? 'ingresar' : 'fijar';
    estado.error = ''; estado.ok = '';
    pintar();
  }

  function enviar() {
    if (estado.yendo) return;
    const f = faltantes({ modo: estado.modo, email: campos.email, clave: campos.clave,
      codigo: campos.codigo, claveNueva: campos.claveNueva });
    if (f.length) return;

    estado.yendo = true; estado.error = ''; estado.ok = '';
    pintar();

    const p = (estado.modo === 'fijar')
      ? SGADD_DATA.fijarClave({ email: campos.email, codigo: campos.codigo, claveNueva: campos.claveNueva })
          .then(() => {
            /* Fijada la clave, se entra de una: pedirle que la escriba otra
               vez sería un paso de más justo después de haberla elegido. */
            return SGADD_DATA.login({ email: campos.email, clave: campos.claveNueva });
          })
      : SGADD_DATA.login({ email: campos.email, clave: campos.clave });

    p.then((r) => {
      estado.yendo = false;
      campos.clave = ''; campos.claveNueva = ''; campos.codigo = '';
      cerrar();
      entrar(r);
    }).catch((e) => {
      estado.yendo = false;
      estado.error = e.message || 'No se pudo ingresar.';
      pintar();
    });
  }

  /**
   * Aplica la sesión y va al Panel Master.
   *
   * Se recarga la página con `?club=` y sin token en la URL: el token ya
   * quedó en `sessionStorage`, y ponerlo en el query string lo dejaría en
   * el historial — que es de lo que `sacarTokenDeLaUrl()` lo saca.
   */
  function entrar(r) {
    if (!r || !r.token) return;
    SGADD_AUTH.establecerToken(r.token);

    /* HAY QUE VOLVER A BAJAR LOS DATOS, y esto faltaba.

       El panel arrancó SIN token, así que `SGADD_DATA.origen()` dio
       `ninguno` y la carga falló con "hace falta un link de acceso". Ese
       fallo queda cacheado y en pantalla: poner el token después no lo
       reintenta solo, así que el admin entraba bien y seguía viendo el
       cartel de que no tiene acceso. Medido en producción.

       Se limpian los DOS cachés —el del adaptador y el de la capa vieja de
       Principal— porque los dos guardaron el fallo. */
    try { SGADD_DATA.limpiarCache(); } catch (e) {}
    try { if (typeof SGADD !== 'undefined') SGADD.limpiarCache(); } catch (e) {}

    if (typeof navigate === 'function') {
      try { navigate(destino()); } catch (e) {}
    }
    /* El nav y el selector de cliente dependen del rol, que recién ahora
       existe. */
    if (typeof aplicarPermisosNav === 'function') { try { aplicarPermisosNav(); } catch (e) {} }

    /* `forzar` es obligatorio: sin él, `cargar()` ve que ya intentó y sale
       por el atajo del caché. */
    if (typeof SGADD_APP !== 'undefined') {
      try { SGADD_APP.cargar(true); } catch (e) {}
    }
    /* Y la capa vieja de Principal, que no pasa por `SGADD_APP`. */
    if (typeof refreshData === 'function') { try { refreshData(); } catch (e) {} }

    if (typeof SGADD_CLIENTES !== 'undefined') { try { SGADD_CLIENTES.iniciar(); } catch (e) {} }
  }

  /**
   * Cerrar sesión.
   *
   * SE RECARGA LA PÁGINA en vez de repintar. Al salir hay que soltar el
   * índice, los cachés de las dos capas de datos y el catálogo de clientes;
   * ese camino ya existe y está probado — es el mismo que usa el cambio de
   * club (punto 6). Reproducirlo acá sería una segunda limpieza de las que
   * se olvidan un paso, y la que se olvida deja datos de un club en
   * pantalla después de salir.
   */
  function salir() {
    try { SGADD_AUTH.limpiarToken(); } catch (e) {}
    try { SGADD_AUTH.limpiarSesion(); } catch (e) {}

    /* Y TODO LO DEMÁS QUE HAYA QUEDADO DE ESA SESIÓN.

       Los estados de jugador, el override de configuración y el caché de
       hojas quedan bajo claves `sgadd.*`. Salir dejándolos deja el trabajo
       de un club en la máquina del siguiente que entre, que en la
       computadora del club puede ser cualquiera.

       Se borra por PREFIJO y no una por una: la lista de claves crece
       —estados, config, caché, token, sesión— y la que se olvida es
       siempre la que se agregó después. */
    [((typeof localStorage !== 'undefined') ? localStorage : null),
     ((typeof sessionStorage !== 'undefined') ? sessionStorage : null)]
      .forEach((alm) => {
        if (!alm) return;
        try {
          Object.keys(alm).filter(k => k.indexOf('sgadd.') === 0)
            .forEach(k => alm.removeItem(k));
        } catch (e) { /* modo privado */ }
      });

    /* SE VA A LA RAÍZ, SIN `?club=`. Con el club puesto, salir volvía a
       cargar los datos de ese cliente — que es exactamente lo que no
       tiene que pasar al cerrar sesión. Sin él, el panel abre en su vista
       neutra. */
    try {
      const u = new URL(window.location.href);
      u.search = '';
      u.hash = '';
      window.location.href = u.toString();
    } catch (e) {
      try { window.location.href = window.location.pathname; } catch (e2) {}
    }
  }
  return {
    destino, faltantes, claveCorta, LARGO_MINIMO,
    abrir, cerrar, alternar, enviar, campo, pintar, salir, estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_LOGIN;
