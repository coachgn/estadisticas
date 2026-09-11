/* =====================================================================
   SGADD · El modal de confirmación del Panel Master

   TODO CAMBIO DEL PANEL MASTER SE VE EN LA SESIÓN DEL CLIENTE EN LA
   PRÓXIMA CARGA. No hay staging, no hay «guardar borrador» del lado del
   servidor: lo que se manda, manda. Por eso ninguna de estas acciones se
   aplica en silencio.

   El modal no pregunta «¿estás seguro?» —eso no informa nada y se
   contesta que sí por reflejo— sino que ENUMERA qué cambia, campo por
   campo, con el valor anterior y el nuevo. Es la diferencia entre
   confirmar y leer.

   El motor del diff es PURO y está acá abajo: se puede testear entero
   desde Node, que es donde importa que no invente cambios ni se pierda
   ninguno.
   ===================================================================== */

const SGADD_CONFIRMAR = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  /* La tabla de alcances es la de sgadd-auth.js, la MISMA que hace cumplir
     el servidor. Desde Node se requiere. */
  const auth = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH
    : (function () { try { return require('./sgadd-auth.js'); } catch (e) { return null; } })();

  /* =====================================================================
     EL DIFF

     Compara dos estados de un club y devuelve la lista de cambios en
     castellano. Las etiquetas son las que el admin ve en pantalla, no los
     nombres de los campos: «Plan» y no `plan`.
     ===================================================================== */

  const CAMPOS = [
    { k: 'plan', label: 'Plan' },
    { k: 'estado', label: 'Estado' },
    { k: 'vence', label: 'Vence el' },
    { k: 'equipoPropio', label: 'Equipo propio' },
  ];

  const vacio = (v) => v === null || v === undefined || v === '';
  const texto = (v) => vacio(v) ? '—' : String(v);

  /**
   * Qué cambia entre dos estados de club.
   *
   * SE COMPARA CAMPO POR CAMPO Y NO EL OBJETO ENTERO: un `JSON.stringify`
   * distinto no le dice nada a nadie, y además dispararía por cualquier
   * campo que el servidor haya tocado por su cuenta —una fecha de último
   * ingreso, un contador— que no es un cambio del admin.
   */
  function cambiosDeClub(antes, despues) {
    const a = antes || {}, d = despues || {};
    const out = [];
    CAMPOS.forEach((c) => {
      const va = a[c.k], vd = d[c.k];
      /* Vacío contra vacío no es un cambio, aunque uno sea `null` y el
         otro `''`: el servidor y el formulario representan «sin dato» de
         formas distintas y eso no es una decisión de nadie. */
      if (vacio(va) && vacio(vd)) return;
      if (String(va) === String(vd)) return;
      out.push({ campo: c.k, label: c.label, antes: texto(va), despues: texto(vd) });
    });
    return out;
  }

  /**
   * Qué cambia en la lista de accesos.
   *
   * Los mails se comparan como CONJUNTOS: el orden en que el servidor los
   * devuelve no es una decisión del admin y no tiene por qué aparecer como
   * un cambio.
   */
  function cambiosDeAccesos(antes, despues) {
    const a = (antes || []).map(m => (typeof m === 'string' ? m : m.email));
    const d = (despues || []).map(m => (typeof m === 'string' ? m : m.email));
    const out = [];
    d.forEach((m) => { if (a.indexOf(m) === -1) out.push({ campo: 'acceso', label: 'Acceso nuevo', antes: '—', despues: m }); });
    a.forEach((m) => { if (d.indexOf(m) === -1) out.push({ campo: 'acceso', label: 'Acceso eliminado', antes: m, despues: '—' }); });
    return out;
  }

  /**
   * Qué cambia en el bloque de zonas.
   *
   * NO SE DIFEA ZONA POR ZONA. Se contaron los intentos y no vale la pena:
   * una zona se identifica por su `id`, pero el DT le cambia el id tanto
   * como los cortes, así que el diff fino termina diciendo «se borró
   * playoffs, se creó playoff» para un cambio de nombre. Lo que sí sirve
   * —y es lo que el admin necesita antes de publicar— es el resumen: qué
   * formatos hay, cuántas zonas tiene cada uno y con qué cortes.
   */
  function resumenZonas(cfg) {
    if (!cfg || !cfg.formatos) return [];
    return Object.keys(cfg.formatos).map((id) => {
      const f = cfg.formatos[id];
      return {
        id: id,
        label: f.label || id,
        equipos: f.equiposEsperados || null,
        zonas: (f.zonas || []).map(z => ({
          id: z.id, label: z.label || z.id, tono: z.tono,
          desde: z.desde, hasta: z.hasta,
        })),
      };
    });
  }

  /** Un corte legible: `1–8`, `los 2 últimos`, `9`. */
  function corte(z) {
    if (z.desde < 0) {
      const n = Math.abs(z.desde);
      return (z.hasta === null || z.hasta === undefined)
        ? ('los ' + n + (n === 1 ? ' último' : ' últimos'))
        : (z.desde + '…' + z.hasta);
    }
    if (z.hasta === null || z.hasta === undefined || z.hasta === z.desde) return String(z.desde);
    return z.desde + '–' + z.hasta;
  }

  /* =====================================================================
     EL ALCANCE · ¿en qué clientes se aplica el cambio?

     Las TRES opciones van siempre a la vista: las que no corresponden
     salen grises CON EL MOTIVO (`motivoSinAlcance`, la misma tabla que
     hace cumplir el servidor). Una opción que aparece y desaparece según
     la acción obliga a adivinar por qué; una gris con su motivo se lee.

     Los clientes del mismo libro se reconocen por la HUELLA del libro que
     manda el servidor (`libro`, solo al admin): el sheetId no viaja al
     navegador (punto 29), y la huella alcanza para saber que dos
     categorías leen el mismo sin decir cuál.
     ===================================================================== */
  const ETIQUETAS_ALCANCE = {
    club: 'Solo en este cliente',
    libro: 'Clientes que comparten este Sheet ID',
    todos: 'Todos los clientes del sistema',
  };

  /**
   * Las opciones de alcance de una acción. PURA.
   *
   * @param {{clubes, club, slug?, accion, deClub?}} o `slug` es la
   *   categoría del cambio; `deClub` dice que la acción es del club entero
   *   (plan, vencimiento) y cuenta todos sus libros.
   */
  function opcionesAlcance(o) {
    const v = o || {};
    const clubes = Array.isArray(v.clubes) ? v.clubes : [];
    const permitidos = (auth && auth.alcancesDe) ? auth.alcancesDe(v.accion) : ['club'];
    const motivoDe = (a) => (auth && auth.motivoSinAlcance) ? auth.motivoSinAlcance(v.accion, a) : '';
    const nombre = (c) => c.nombre || c.id;
    const propio = clubes.filter(c => c.id === v.club)[0] || { id: v.club, nombre: v.club, categorias: [] };
    const cats = propio.categorias || [];
    const base = cats.filter(k => k.slug === v.slug)[0] || (cats.length === 1 ? cats[0] : null);
    const libros = base ? [base.libro].filter(Boolean)
      : (v.deClub ? cats.map(k => k.libro).filter(Boolean) : []);
    const hermanos = libros.length
      ? clubes.filter(c => c.id !== propio.id
          && (c.categorias || []).some(k => k.libro && libros.indexOf(k.libro) !== -1))
      : [];
    const otros = clubes.filter(c => c.id !== propio.id);
    const yo = [nombre(propio)];
    const motivoLibro = permitidos.indexOf('libro') === -1 ? motivoDe('libro')
      : !libros.length ? 'Esta categoría todavía no tiene libro, o el servidor no mandó su huella.'
      : !hermanos.length ? 'Ningún otro cliente lee este libro.' : '';
    const motivoTodos = permitidos.indexOf('todos') === -1 ? motivoDe('todos')
      : !otros.length ? 'No hay otros clientes en el catálogo.' : '';
    return [
      { valor: 'club', titulo: ETIQUETAS_ALCANCE.club, clientes: yo, habilitado: true, motivo: '' },
      { valor: 'libro', titulo: ETIQUETAS_ALCANCE.libro, clientes: yo.concat(hermanos.map(nombre)),
        habilitado: !motivoLibro, motivo: motivoLibro },
      { valor: 'todos', titulo: ETIQUETAS_ALCANCE.todos, clientes: yo.concat(otros.map(nombre)),
        habilitado: !motivoTodos, motivo: motivoTodos },
    ];
  }

  function listaNombres(l) {
    const max = 6;
    return l.length <= max ? l.join(', ') : l.slice(0, max).join(', ') + ' y ' + (l.length - max) + ' más';
  }

  /* =====================================================================
     EL MODAL
     ===================================================================== */

  const estado = {
    abierto: false,
    titulo: '', aviso: '', confirmar: 'Confirmar',
    cambios: [], zonas: null, alConfirmar: null, yendo: false,
    alcance: null,
    disparador: null,
  };

  /**
   * Abre el modal.
   *
   * `alConfirmar` es la función que dispara la petición: NADA se manda
   * hasta que el admin confirma. Es la propiedad entera de este módulo —
   * si la petición saliera antes, el modal sería un cartel y no una
   * confirmación.
   */
  function abrir(opciones) {
    const o = opciones || {};
    estado.abierto = true;
    estado.titulo = o.titulo || 'Confirmar los cambios';
    estado.aviso = o.aviso || '';
    estado.confirmar = o.confirmar || 'Confirmar';
    estado.cambios = o.cambios || [];
    estado.zonas = o.zonas || null;
    estado.alConfirmar = typeof o.alConfirmar === 'function' ? o.alConfirmar : null;
    /* El alcance, si el llamador lo ofrece. Arranca en lo SUGERIDO solo si
       esa opción está habilitada; si no, en «solo este cliente», que es lo
       que hacía todo cambio antes de que existiera la pregunta. */
    if (o.alcance && Array.isArray(o.alcance.opciones) && o.alcance.opciones.length) {
      const ops = o.alcance.opciones;
      const sug = ops.filter(x => x.valor === o.alcance.sugerido && x.habilitado)[0];
      estado.alcance = { opciones: ops, elegido: sug ? sug.valor : 'club' };
    } else {
      estado.alcance = null;
    }
    estado.yendo = false;
    try { estado.disparador = document.activeElement; } catch (e) { estado.disparador = null; }
    pintar();
  }

  function cerrar() {
    estado.abierto = false;
    estado.alConfirmar = null;
    pintar();
    try { if (estado.disparador && estado.disparador.focus) estado.disparador.focus(); } catch (e) {}
  }

  function confirmar() {
    if (estado.yendo || !estado.alConfirmar) return;
    estado.yendo = true;
    pintar();
    const fn = estado.alConfirmar;
    /* El alcance elegido viaja a quien dispara la petición: el modal no
       sabe armar pedidos, solo pregunta. */
    const elegido = estado.alcance ? estado.alcance.elegido : undefined;
    /* Se cierra ANTES de disparar y no después: la petición puede tardar,
       y un modal congelado con el botón en «Un momento…» encima de la
       pantalla que se está actualizando se lee como que algo se colgó. El
       resultado lo muestra la tarjeta del club, que es donde el admin
       está mirando. */
    estado.abierto = false;
    estado.alConfirmar = null;
    pintar();
    try { fn(elegido); } catch (e) { /* el llamador maneja su propio error */ }
  }

  function filaCambio(c) {
    return `<li class="flex items-baseline gap-2 text-xs py-1 border-b border-hairline/30 last:border-0">
      <span class="text-muted shrink-0 min-w-[7rem]">${esc(c.label)}</span>
      <span class="font-mono text-muted line-through">${esc(c.antes)}</span>
      <span class="text-muted">→</span>
      <span class="font-mono text-ink font-semibold">${esc(c.despues)}</span>
    </li>`;
  }

  function bloqueZonas(z) {
    if (!z || !z.length) {
      return `<p class="text-xs text-muted">El bloque queda <b>sin formatos</b>: la tabla se va a
        pintar sin colores de zona.</p>`;
    }
    return `<ul class="space-y-2">${z.map(f => `<li class="text-xs">
      <span class="text-ink font-semibold">${esc(f.label)}</span>
      ${f.equipos ? `<span class="text-muted"> · ${f.equipos} equipos</span>` : ''}
      <ul class="mt-1 ml-3 space-y-0.5">
        ${f.zonas.length ? f.zonas.map(x => `<li class="flex items-center gap-2">
          <span class="zona-texto zona-${esc(x.tono)}">■</span>
          <span class="text-ink">${esc(x.label)}</span>
          <span class="font-mono text-muted ml-auto">${esc(corte(x))}</span>
        </li>`).join('') : '<li class="text-muted">sin zonas</li>'}
      </ul>
    </li>`).join('')}</ul>`;
  }

  function bloqueAlcance() {
    const a = estado.alcance;
    if (!a || !a.opciones || !a.opciones.length) return '';
    return `<fieldset class="mb-3 rounded-md border border-hairline/60 p-3">
      <legend class="text-xs text-ink font-semibold px-1">¿En qué clientes querés aplicar este cambio?</legend>
      ${a.opciones.map(op => `<label class="flex items-start gap-2 text-xs py-1 ${op.habilitado ? 'text-ink cursor-pointer' : 'text-muted'}">
        <input type="radio" name="confAlcance" value="${esc(op.valor)}" class="mt-0.5"
          ${a.elegido === op.valor ? 'checked' : ''} ${op.habilitado ? '' : 'disabled'}
          onchange="SGADD_CONFIRMAR.elegirAlcance(this.value)">
        <span><span class="font-semibold">${esc(op.titulo)}</span>
          <span class="text-muted"> · ${op.clientes.length} cliente${op.clientes.length === 1 ? '' : 's'}</span>
          <span class="block text-[11px] text-muted">${esc(op.habilitado ? listaNombres(op.clientes) : op.motivo)}</span>
        </span>
      </label>`).join('')}
    </fieldset>`;
  }

  /* El botón dice a CUÁNTOS clientes llega: «Publicar · 4 clientes» no se
     confunde con un cambio de uno solo. */
  function textoConfirmar() {
    if (estado.yendo) return 'Un momento…';
    const a = estado.alcance;
    const op = a && a.opciones ? a.opciones.filter(x => x.valor === a.elegido)[0] : null;
    const n = op ? op.clientes.length : 1;
    return estado.confirmar + (n > 1 ? ' · ' + n + ' clientes' : '');
  }

  function elegirAlcance(v) {
    const a = estado.alcance;
    if (!a) return;
    const op = a.opciones.filter(x => x.valor === v)[0];
    if (!op || !op.habilitado) return;
    a.elegido = v;
    /* NO SE REPINTA: el foco está en el radio, y un repintado lo manda al
       botón de confirmar. Se reescribe solo el texto del botón. */
    try {
      const b = document.getElementById('confAceptar');
      if (b) b.textContent = textoConfirmar();
    } catch (e) { /* sin DOM no hay botón */ }
  }

  function html() {
    if (!estado.abierto) return '';
    const nada = !estado.cambios.length && !estado.zonas;
    return `<div class="login-fondo" onclick="if(event.target===this)SGADD_CONFIRMAR.cerrar()">
      <div class="login-caja card rounded-xl p-5 border border-hairline" role="dialog"
           aria-modal="true" aria-labelledby="confTitulo">
        <h2 id="confTitulo" class="font-display uppercase tracking-wide text-sm text-ink mb-1">
          ${esc(estado.titulo)}</h2>
        ${estado.aviso ? `<p class="text-xs zona-texto zona-aviso mb-3">${esc(estado.aviso)}</p>` : ''}

        ${estado.cambios.length ? `<ul class="mb-3">${estado.cambios.map(filaCambio).join('')}</ul>` : ''}
        ${estado.zonas ? `<div class="mb-3 rounded-md border border-hairline/60 p-3">
          ${bloqueZonas(estado.zonas)}</div>` : ''}
        ${nada ? '<p class="text-xs text-muted mb-3">No hay nada distinto para mandar.</p>' : ''}
        ${nada ? '' : bloqueAlcance()}

        <div class="modal-acciones flex items-center gap-3 flex-wrap mt-4">
          <button id="confAceptar" onclick="SGADD_CONFIRMAR.confirmar()"
            ${estado.yendo || nada ? 'disabled' : ''}
            class="px-3 py-2 rounded-md text-xs font-display uppercase tracking-wider
                   bg-accent text-base hover:opacity-90 disabled:opacity-40">
            ${esc(textoConfirmar())}</button>
          <button onclick="SGADD_CONFIRMAR.cerrar()"
            class="text-[11px] text-muted hover:text-ink ml-auto">Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  function pintar() {
    if (typeof document === 'undefined') return;
    let s = document.getElementById('confirmarSlot');
    if (!s) {
      /* El slot se crea al vuelo: el modal lo puede pedir cualquier
         pantalla y no tiene sentido reservarle un nodo en el `index.html`
         a algo que casi nunca está abierto. */
      s = document.createElement('div');
      s.id = 'confirmarSlot';
      document.body.appendChild(s);
    }
    s.innerHTML = html();
    if (estado.abierto) {
      const b = document.getElementById('confAceptar');
      /* El foco va al botón de confirmar y no al de cancelar: el admin
         llegó acá porque quiere aplicar el cambio, y con ESC siempre
         puede salir. */
      if (b) b.focus();
    }
  }

  /* ESC cierra, como el drawer del buzón y el modal de ingreso. Se
     engancha una sola vez, por delegación en el `document`. */
  let enganchado = false;
  function iniciar() {
    if (enganchado || typeof document === 'undefined') return;
    enganchado = true;
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && estado.abierto) cerrar();
    });
  }

  return {
    CAMPOS, cambiosDeClub, cambiosDeAccesos, resumenZonas, corte,
    ETIQUETAS_ALCANCE, opcionesAlcance, elegirAlcance, bloqueAlcance, textoConfirmar,
    abrir, cerrar, confirmar, html, pintar, iniciar, estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONFIRMAR;
