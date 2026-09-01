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
     EL MODAL
     ===================================================================== */

  const estado = {
    abierto: false,
    titulo: '', aviso: '', confirmar: 'Confirmar',
    cambios: [], zonas: null, alConfirmar: null, yendo: false,
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
    /* Se cierra ANTES de disparar y no después: la petición puede tardar,
       y un modal congelado con el botón en «Un momento…» encima de la
       pantalla que se está actualizando se lee como que algo se colgó. El
       resultado lo muestra la tarjeta del club, que es donde el admin
       está mirando. */
    estado.abierto = false;
    estado.alConfirmar = null;
    pintar();
    try { fn(); } catch (e) { /* el llamador maneja su propio error */ }
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

        <div class="flex items-center gap-3 flex-wrap mt-4">
          <button id="confAceptar" onclick="SGADD_CONFIRMAR.confirmar()"
            ${estado.yendo || nada ? 'disabled' : ''}
            class="px-3 py-2 rounded-md text-xs font-display uppercase tracking-wider
                   bg-accent text-base hover:opacity-90 disabled:opacity-40">
            ${estado.yendo ? 'Un momento…' : esc(estado.confirmar)}</button>
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
    abrir, cerrar, confirmar, html, pintar, iniciar, estado,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONFIRMAR;
