/* =====================================================================
   SGADD · TORNEOS en el Panel Master (punto 67)

   Un torneo es una entrada del catálogo SIN cliente, con una categoría por
   ZONA (Conferencia Norte y Sur de la Liga Argentina; la única zona de la
   Zona C de La Plata). Esta pantalla hace tres cosas:

     1. lista los torneos, sus zonas, sus equipos y qué clientes están
        enganchados a cada zona;
     2. da de alta o edita la estructura de un torneo —zonas, equipos,
        libro de cada zona— independiente de que haya un cliente;
     3. engancha la categoría de un cliente a una zona, eligiendo su equipo
        de la lista DE ESA ZONA.

   Todo pasa por `/api/v1/catalogo` con el modal de confirmación: nada se
   aplica en silencio (punto 30). La regla de escritura es la del servidor
   (`server/lib/torneos.js`): esto arma la intención y la muestra.

   Motor puro arriba (testeable desde Node), UI abajo.
   ===================================================================== */
const SGADD_TORNEOS = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs)
    ? SGADD_UI.escJs(v) : esc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));

  const ID = /^[a-z0-9][a-z0-9-]*$/;
  const SHEET = /^[A-Za-z0-9_-]{20,}$/;

  /* =====================================================================
     MOTOR · puro
     ===================================================================== */

  function esTorneo(c) { return !!c && c.tipo === 'torneo'; }

  /** Los torneos de la lista pública del catálogo. */
  function torneosDe(clubes) { return (clubes || []).filter(esTorneo); }

  /** Los clientes de la lista (todo lo que no es torneo). */
  function clientesDe(clubes) { return (clubes || []).filter(c => !esTorneo(c)); }

  /** Las zonas de un torneo: una por categoría con `zona`. */
  function zonasDe(t) {
    return ((t && t.categorias) || []).filter(k => k.zona)
      .map(k => ({ zona: k.zona, slug: k.slug, label: k.label, activo: !!k.activo,
        equipos: k.equipos || [], libro: k.libro || null }));
  }

  /** Las categorías de clientes enganchadas a un torneo (o a una zona). */
  function enganchados(clubes, torneoId, zona) {
    const out = [];
    clientesDe(clubes).forEach(c => (c.categorias || []).forEach((k) => {
      if (k.torneo === torneoId && (!zona || k.zona === zona)) {
        out.push({ club: c.id, nombre: c.nombre || c.id, slug: k.slug, label: k.label, zona: k.zona,
          equipo: k.equipoEfectivo || k.equipoPropio || c.equipoPropio || null, activo: !!k.activo });
      }
    }));
    return out;
  }

  /**
   * EL ÁRBOL DEL PANEL · Torneo → Zona → Cliente.
   *
   * La regla de negocio es que un cliente SIEMPRE pertenece a un torneo, y
   * un torneo puede no tener clientes todavía (se carga la liga entera para
   * tener los cruces antes de que un club contrate). O sea: la jerarquía
   * tiene una sola raíz posible, el torneo, y ordenar la pantalla por ahí
   * es lo que hace que no haya dos formularios compitiendo — el alta de un
   * cliente nace DESDE una zona, así el torneo ya viene elegido.
   *
   * Es PURO y devuelve las dos mitades:
   *
   *   - `torneos`: cada uno con sus zonas, y cada zona con los clientes
   *     enganchados. Una zona sin clientes NO se esconde: es justamente
   *     donde hay que poder dar de alta el primero.
   *   - `huerfanos`: las categorías de cliente sin torneo declarado. Medido
   *     en el catálogo real el 2026-09-26: 8 de 9 ya estaban enganchadas y
   *     la única suelta es `jujuy/jujuy-primera`, de una temporada anterior.
   *     NO se tocan ni se esconden —el panel las sirve igual— pero se
   *     muestran aparte para poder resolverlas. Un huérfano invisible es un
   *     cliente que nadie va a enganchar nunca.
   *
   * Una categoría que declara un torneo que ya NO existe en el catálogo
   * cuenta como huérfana, con el id que decía: si se lo diéramos por bueno,
   * el admin vería un enganche que no lleva a ninguna parte.
   */
  function arbol(clubes) {
    const lista = clubes || [];
    const ts = torneosDe(lista);
    const ids = {};
    ts.forEach((t) => { ids[t.id] = true; });

    const torneos = ts.map((t) => {
      const zs = zonasDe(t).map(z => Object.assign({}, z, {
        clientes: enganchados(lista, t.id, z.zona),
      }));
      return {
        id: t.id, nombre: t.nombre || t.id, liga: t.liga || null,
        temporada: t.temporada || null, formato: t.formato || null,
        zonas: zs,
        /* Los dos números que deciden si hay algo que hacer con este
           torneo: zonas sin libro (falta conectar) y clientes en total. */
        clientes: zs.reduce((a, z) => a + z.clientes.length, 0),
        zonasSinLibro: zs.filter(z => !z.activo).length,
      };
    }).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

    const huerfanos = [];
    clientesDe(lista).forEach(c => (c.categorias || []).forEach((k) => {
      if (k.torneo && ids[k.torneo]) return;
      huerfanos.push({
        club: c.id, nombre: c.nombre || c.id, slug: k.slug,
        label: k.label || k.slug, activo: !!k.activo,
        /* Se distingue «nunca se enganchó» de «apunta a un torneo que no
           está»: son dos problemas distintos y se arreglan distinto. */
        torneoFantasma: k.torneo && !ids[k.torneo] ? k.torneo : null,
      });
    }));

    return { torneos: torneos, huerfanos: huerfanos };
  }

  /**
   * Los equipos escritos a mano, uno por renglón: `NOMBRE` o `id · NOMBRE`.
   *
   * El id es el de Gesdeportiva (`/equipo/<idClub>/<idEquipo>/`). Un
   * renglón vacío se saltea; uno con un número que no es entero se RECHAZA
   * con su renglón, en vez de quedar como nombre raro.
   */
  function parsearEquipos(texto) {
    const out = [];
    const errores = [];
    String(texto || '').split(/\r?\n/).forEach((linea, i) => {
      const l = linea.trim();
      if (!l) return;
      const m = l.match(/^(\d+)\s*[·|,;\-]\s*(.+)$/);
      if (m) out.push({ id: Number(m[1]), nombre: m[2].trim() });
      else if (/^\d+$/.test(l)) errores.push('renglón ' + (i + 1) + ': falta el nombre');
      else out.push({ id: null, nombre: l });
    });
    return { equipos: out, errores: errores };
  }

  /** Lo inverso: la lista para el textarea al editar. */
  function textoEquipos(equipos) {
    return (equipos || []).map(e => (e.id ? e.id + ' · ' : '') + e.nombre).join('\n');
  }

  function idDeLibro(t) {
    const s = String(t || '').trim();
    const m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/);
    return m ? m[1] : s;
  }

  /** Qué le falta al borrador del torneo para poder mandarlo. */
  function faltantesTorneo(b) {
    const f = [];
    if (!ID.test(String(b.id || ''))) f.push('el id del torneo (minúsculas, sin espacios)');
    if (!String(b.nombre || '').trim()) f.push('el nombre');
    if (!(b.zonas || []).length) f.push('al menos una zona');
    const vistas = {};
    (b.zonas || []).forEach((z, i) => {
      const n = 'zona ' + (z.zona || (i + 1));
      if (!ID.test(String(z.zona || ''))) f.push(n + ': el id');
      else if (vistas[z.zona]) f.push(n + ': id repetido');
      vistas[z.zona] = true;
      if (!String(z.label || '').trim()) f.push(n + ': la etiqueta');
      if (z.libro && !SHEET.test(idDeLibro(z.libro))) f.push(n + ': el link del libro no tiene forma de id de Google');
      const p = parsearEquipos(z.equiposTexto);
      p.errores.forEach(e => f.push(n + ': ' + e));
    });
    return f;
  }

  /** La intención que se manda. El libro solo si se pegó uno: vacío conserva el que haya. */
  function intencionTorneo(b) {
    const zonas = {};
    (b.zonas || []).forEach((z) => {
      const o = { label: String(z.label || '').trim(), equipos: parsearEquipos(z.equiposTexto).equipos };
      if (z.slug) o.slug = String(z.slug).trim();
      if (z.libro) o.sheetId = idDeLibro(z.libro);
      zonas[z.zona] = o;
    });
    const i = { accion: 'torneo', club: String(b.id || '').trim(), nombre: String(b.nombre || '').trim(),
      liga: String(b.liga || '').trim(), temporada: String(b.temporada || '').trim(), zonas: zonas };
    if (b.acento) i.acento = String(b.acento).trim();
    return i;
  }

  /** El diff para el modal, contra lo que el torneo ya tiene. */
  function cambiosTorneo(b, previo) {
    const out = [];
    const antes = previo ? zonasDe(previo) : [];
    if (!previo) out.push({ label: 'Torneo nuevo', antes: '—', despues: b.nombre + ' (' + b.id + ')' });
    else if (previo.nombre !== b.nombre) out.push({ label: 'Nombre', antes: previo.nombre, despues: b.nombre });
    (b.zonas || []).forEach((z) => {
      const a = antes.find(x => x.zona === z.zona);
      const n = parsearEquipos(z.equiposTexto).equipos.length;
      const txt = z.label + ' · ' + n + ' equipos' + (z.libro ? ' · libro nuevo' : (a && a.activo ? ' · mismo libro' : ' · sin libro'));
      const txtA = a ? a.label + ' · ' + a.equipos.length + ' equipos' + (a.activo ? ' · con libro' : ' · sin libro') : '—';
      if (txt !== txtA) out.push({ label: 'Zona ' + z.zona, antes: txtA, despues: txt });
    });
    return out;
  }

  /** El id de categoría que se propone para enganchar un cliente: `<club>-<torneo>`. */
  function idVinculoSugerido(club, torneoId) {
    return String(club || '') + '-' + String(torneoId || '').replace(/^liga-argentina-/, 'lab-');
  }

  /* =====================================================================
     UI
     ===================================================================== */

  const CLASE_INPUT = 'w-full bg-surface2 border border-hairline rounded-md px-2 py-1.5 text-xs text-ink';
  const ROTULO = 'block text-[10px] uppercase tracking-wider text-muted font-display mb-1';

  const borrador = { modo: 'nuevo', id: '', nombre: '', liga: '', temporada: '', acento: '', zonas: [] };
  /* `abierto` es el plegado del formulario, y vive ACA y no en el DOM por
     lo mismo que el del alta: el formulario se repinta al elegir un torneo
     o una zona, y un `open` en el nodo se perderia en ese repintado. */
  const vinculo = { torneo: '', zona: '', club: '', categoria: '', label: '', equipo: '', abierto: false };
  /* Que tarjeta de torneo esta desplegada. Del modulo y no del DOM: la
     pestaña se repinta entera al tocar cualquier cosa. */
  const abiertos = {};
  const resultado = { estado: null, mensaje: '' };

  function clubes() {
    return (typeof SGADD_CLIENTES !== 'undefined' && SGADD_CLIENTES.estado.clubes) ? SGADD_CLIENTES.estado.clubes : [];
  }

  function zonaVacia() { return { zona: '', slug: '', label: '', libro: '', equiposTexto: '' }; }

  /**
   * LA TARJETA DE UN TORNEO, con sus clientes ADENTRO de cada zona.
   *
   * Recibe el nodo del `arbol()` y no el club crudo: así la pantalla no
   * vuelve a cruzar clientes contra zonas por su cuenta — ese cruce es del
   * motor y tiene test. Dos lugares que lo hagan terminan mostrando cosas
   * distintas (punto 8).
   *
   * Cada zona trae su propio «+ cliente», y ese botón es el punto entero
   * del rediseño: el alta se abre con el torneo y la zona YA elegidos, así
   * que no hay que acertarle a un desplegable de libros donde las zonas de
   * torneo estaban mezcladas con las categorías de otros clientes.
   */
  function tarjeta(n) {
    const zs = n.zonas;
    const fases = (n.formato && n.formato.fases) || [];
    const chip = (txt, clase) => `<span class="font-mono text-[10px] px-1.5 py-0.5 rounded ${clase}">${esc(txt)}</span>`;
    /* LA TARJETA ARRANCA MINIMIZADA y se abre con un clic. Con cuatro
       torneos y sus zonas desplegadas la pestaña era una columna de varios
       metros; lo que se necesita de un vistazo es CUÁLES hay y si les
       falta algo, y eso entra en el resumen: nombre, cuántos clientes y
       cuántas zonas sin libro.

       El plegado vive en `abiertos`, del módulo, y no en el DOM: la
       pestaña se repinta entera al tocar cualquier cosa —el alta, un
       plan— y un `open` en el nodo se perdería en cada repintado. */
    return `<details class="card hub-plegable rounded-xl border border-hairline" data-torneo="${esc(n.id)}"
      ${abiertos[n.id] ? 'open' : ''} ontoggle="SGADD_TORNEOS.abrirTarjeta('${escJs(n.id)}', this.open)">
      <summary class="cursor-pointer p-4">
        <span class="flex items-baseline justify-between gap-3 flex-wrap">
          <span class="font-display uppercase tracking-wide text-sm text-ink">🏆 ${esc(n.nombre)}</span>
          <span class="flex items-center gap-1.5 flex-wrap">
            ${chip(n.clientes + (n.clientes === 1 ? ' cliente' : ' clientes'), n.clientes ? 'bg-surface2 text-ink' : 'bg-surface2 text-muted')}
            ${n.zonasSinLibro ? chip(n.zonasSinLibro + ' sin libro', 'zona-aviso zona-texto') : ''}
          </span>
        </span>
        <span class="block font-mono text-[11px] text-muted mt-1">${esc(n.id)} · ${esc(n.liga || 'sin liga')}${n.temporada ? ' · ' + esc(n.temporada) : ''}</span>
        <span class="block text-[11px] text-muted mt-1">${zs.length} ${zs.length === 1 ? 'zona' : 'zonas'}${
          zs.length ? ' · ' + zs.map(z => esc(z.label)).join(' · ') : ''}</span>
      </summary>
      <div class="px-4 pb-4">
      ${fases.length ? `<p class="text-[11px] text-muted mb-2">${fases.map(f => esc(f.label) + (f.cruce === 'interzonal' ? ' (interzonal)' : '')).join(' → ')}</p>` : ''}
      <div class="scrollbox"><table class="w-full">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left pb-1 pr-3 font-display">Zona</th>
          <th class="text-left pb-1 pr-3 font-display">Libro</th>
          <th class="text-left pb-1 pr-3 font-display">Equipos</th>
          <th class="text-left pb-1 pr-3 font-display">Clientes</th>
          <th class="pb-1 font-display"></th>
        </tr></thead>
        <tbody>${zs.map(z => `<tr class="text-xs border-t border-hairline align-top">
            <td class="py-1.5 pr-3 text-ink whitespace-nowrap">${esc(z.label)}<span class="block font-mono text-[10px] text-muted">${esc(z.slug)}</span></td>
            <td class="py-1.5 pr-3 whitespace-nowrap ${z.activo ? 'text-ink' : 'text-muted'}">${z.activo ? '✓ conectado' : '— sin libro'}</td>
            <td class="py-1.5 pr-3"><details><summary class="cursor-pointer text-ink">${z.equipos.length}</summary>
              <ul class="mt-1 text-[11px] text-muted">${z.equipos.map(e =>
                `<li>${esc(e.nombre)}${e.id ? ' <span class="font-mono">#' + esc(e.id) + '</span>' : ''}${e.provisorio ? ' · provisorio' : ''}</li>`).join('')}</ul>
            </details></td>
            <td class="py-1.5 pr-3">${z.clientes.length
              ? z.clientes.map(x => `<button type="button" onclick="SGADD_HUB.verDetalle('${escJs(x.club)}')"
                    class="block text-left text-ink hover:underline">${esc(x.nombre)}
                    <span class="text-muted">· ${esc(x.equipo || '—')}</span></button>`).join('')
              : '<span class="text-muted">— sin clientes —</span>'}</td>
            <td class="py-1.5 text-right whitespace-nowrap">
              <button type="button" onclick="SGADD_HUB.altaEnZona('${escJs(n.id)}','${escJs(z.slug)}')"
                class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline">+ cliente</button></td>
          </tr>`).join('') || '<tr><td colspan="5" class="py-2 text-xs text-muted">Sin zonas declaradas.</td></tr>'}</tbody>
      </table></div>
      <div class="mt-3 flex items-center gap-3 flex-wrap">
        <button type="button" onclick="SGADD_TORNEOS.editar('${escJs(n.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">Editar estructura</button>
        <button type="button" onclick="SGADD_TORNEOS.empezarVinculo('${escJs(n.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">Enganchar un cliente que ya existe</button>
        ${zs.some(z => z.activo) ? `<button type="button" onclick="SGADD_CLIENTES.elegir('${escJs(n.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline ml-auto">Abrir el torneo →</button>` : ''}
      </div>
      </div>
    </details>`;
  }

  function campo(id, etiqueta, valor, extra) {
    return `<label class="block"><span class="${ROTULO}">${esc(etiqueta)}</span>
      <input type="text" id="torneo-${id}" value="${esc(valor)}" autocomplete="off" spellcheck="false"
        oninput="SGADD_TORNEOS.campo('${id}', this.value)" class="${CLASE_INPUT}${extra || ''}"></label>`;
  }

  function formZona(z, i) {
    return `<div class="rounded-lg border border-hairline p-3 space-y-2">
      <div class="grid sm:grid-cols-3 gap-2">
        <label class="block"><span class="${ROTULO}">Id de zona</span>
          <input type="text" id="torneo-z${i}-zona" value="${esc(z.zona)}" placeholder="norte" autocomplete="off"
            oninput="SGADD_TORNEOS.campoZona(${i}, 'zona', this.value)" class="${CLASE_INPUT} font-mono"></label>
        <label class="block sm:col-span-2"><span class="${ROTULO}">Etiqueta (lo que dice el selector)</span>
          <input type="text" id="torneo-z${i}-label" value="${esc(z.label)}" autocomplete="off"
            oninput="SGADD_TORNEOS.campoZona(${i}, 'label', this.value)" class="${CLASE_INPUT}"></label>
      </div>
      <label class="block"><span class="${ROTULO}">Libro de la zona (link o id) · opcional</span>
        <input type="text" id="torneo-z${i}-libro" value="${esc(z.libro)}" autocomplete="off" spellcheck="false"
          placeholder="${z.slug ? 'vacío = conserva el libro que tenga' : 'vacío = la zona queda sin libro hasta que MotorStats lo escriba'}"
          oninput="SGADD_TORNEOS.campoZona(${i}, 'libro', this.value)" class="${CLASE_INPUT} font-mono"></label>
      <label class="block"><span class="${ROTULO}">Equipos · uno por renglón, «id · NOMBRE» o «NOMBRE»</span>
        <textarea id="torneo-z${i}-equipos" rows="6" spellcheck="false"
          oninput="SGADD_TORNEOS.campoZona(${i}, 'equiposTexto', this.value)"
          class="${CLASE_INPUT} font-mono">${esc(z.equiposTexto)}</textarea></label>
      <button type="button" onclick="SGADD_TORNEOS.quitarZona(${i})"
        class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Quitar esta zona del formulario</button>
    </div>`;
  }

  function estadoTorneo() {
    const f = faltantesTorneo(borrador);
    const msg = resultado.estado === 'error' ? `<p class="text-xs text-red-400" role="alert">${esc(resultado.mensaje)}</p>`
      : resultado.estado === 'ok' ? `<p class="text-xs text-emerald-400" role="status">${esc(resultado.mensaje)}</p>` : '';
    return `${f.length ? `<p class="text-[11px] text-muted">Falta: ${esc(f.join(' · '))}.</p>` : ''}${msg}
      <button type="button" onclick="SGADD_TORNEOS.guardar()" ${f.length || resultado.estado === 'yendo' ? 'disabled' : ''}
        class="mt-2 px-3 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider bg-accent text-base disabled:opacity-40">
        ${borrador.modo === 'nuevo' ? 'Dar de alta el torneo' : 'Guardar el torneo'}</button>`;
  }

  /**
   * EL FORMULARIO NO INVADE LA PANTALLA.
   *
   * Arranca PLEGADO y se abre con un gesto (el botón de acá, o «Editar
   * estructura» de una tarjeta). Medido con tres clientes y dos torneos, la
   * pestaña medía 2893px de alto con los dos formularios desplegados: lo
   * primero que se ve tiene que ser qué torneos y clientes hay, no dos
   * altas vacías.
   *
   * EL PLEGADO VIVE EN EL MÓDULO, no en el DOM: cada tecla del formulario
   * repinta su estado, y si el `open` viviera en el nodo se cerraría solo
   * mientras el admin escribe (la trampa del punto 13).
   */
  function formTorneo() {
    const editando = borrador.modo !== 'nuevo';
    return `<details class="card hub-plegable rounded-xl border border-hairline" ${borrador.abierto ? 'open' : ''}
      ontoggle="SGADD_TORNEOS.abrirForm(this.open)">
      <summary class="cursor-pointer p-4 sm:p-5 flex items-baseline justify-between gap-3 flex-wrap">
        <span class="font-display uppercase tracking-wide text-sm text-ink">
          ${editando ? 'Editar · ' + esc(borrador.nombre || borrador.modo) : '＋ Nuevo torneo'}</span>
        <span class="text-[11px] text-muted">${borrador.abierto ? 'ocultar' : 'abrir'}</span>
      </summary>
      <div class="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <span></span>
        ${editando ? `<button type="button" onclick="SGADD_TORNEOS.nuevo()"
          class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Empezar uno nuevo</button>` : ''}
      </div>
      <p class="text-xs text-muted">Un torneo existe sin cliente: sus zonas se leen enteras —todos los equipos— y un
        cliente se engancha después a la suya. Cada zona es un libro de MotorStats.</p>
      <div class="grid sm:grid-cols-2 gap-2">
        ${borrador.modo === 'nuevo' ? campo('id', 'Id del torneo', borrador.id, ' font-mono')
          : `<label class="block"><span class="${ROTULO}">Id del torneo</span><input type="text" value="${esc(borrador.id)}" readonly aria-readonly="true" class="${CLASE_INPUT} font-mono text-muted"></label>`}
        ${campo('nombre', 'Nombre', borrador.nombre)}
        ${campo('liga', 'Liga (carpeta de escudos)', borrador.liga, ' font-mono')}
        ${campo('temporada', 'Temporada', borrador.temporada)}
      </div>
      <div class="space-y-2">${borrador.zonas.map(formZona).join('')}</div>
      <button type="button" onclick="SGADD_TORNEOS.agregarZona()"
        class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">＋ Agregar una zona</button>
      <div id="torneoEstado">${estadoTorneo()}</div>
      </div>
    </details>`;
  }

  function formVinculo(cs) {
    const ts = torneosDe(cs);
    const t = ts.find(x => x.id === vinculo.torneo) || null;
    const zs = t ? zonasDe(t) : [];
    const z = zs.find(x => x.zona === vinculo.zona) || null;
    const clientes = clientesDe(cs);
    const listo = !!(t && z && vinculo.club && ID.test(vinculo.categoria) && vinculo.equipo);
    /* ESTE FORMULARIO ES LA EXCEPCIÓN, no el camino normal: sirve para el
       cliente que YA existe y hay que atar a una zona —los huérfanos—. El
       alta de uno nuevo nace del «+ cliente» de la zona, así que tener los
       dos desplegados a la vez era justamente la duda de «cuál uso».
       Aparece cuando se lo pide (`empezarVinculo`) y no antes. */
    return `<details class="card hub-plegable rounded-xl border border-hairline" id="torneoVinculo" ${vinculo.abierto ? 'open' : ''}
      ontoggle="SGADD_TORNEOS.abrirVinculo(this.open)">
      <summary class="cursor-pointer p-4 sm:p-5 flex items-baseline justify-between gap-3 flex-wrap">
        <span class="font-display uppercase tracking-wide text-sm text-ink">Enganchar un cliente que ya existe</span>
        <span class="text-[11px] text-muted">${vinculo.abierto ? 'ocultar' : 'abrir'}</span>
      </summary>
      <div class="px-4 sm:px-5 pb-4 sm:pb-5 space-y-3">
      <p class="text-xs text-muted">La categoría del cliente lee el libro de la zona —con todos sus equipos— y recibe
        el libro solo cuando la zona lo estrena. Su equipo se elige de la lista DE ESA ZONA.</p>
      <div class="grid sm:grid-cols-2 gap-2">
        <label class="block"><span class="${ROTULO}">Torneo</span>
          <select onchange="SGADD_TORNEOS.elegirVinculo('torneo', this.value)" class="${CLASE_INPUT}">
            <option value="">Elegí un torneo</option>
            ${ts.map(x => `<option value="${esc(x.id)}" ${x.id === vinculo.torneo ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}
          </select></label>
        <label class="block"><span class="${ROTULO}">Zona</span>
          <select onchange="SGADD_TORNEOS.elegirVinculo('zona', this.value)" class="${CLASE_INPUT}" ${t ? '' : 'disabled'}>
            <option value="">Elegí la zona</option>
            ${zs.map(x => `<option value="${esc(x.zona)}" ${x.zona === vinculo.zona ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
          </select></label>
        <label class="block"><span class="${ROTULO}">Cliente</span>
          <select onchange="SGADD_TORNEOS.elegirVinculo('club', this.value)" class="${CLASE_INPUT}">
            <option value="">Elegí el cliente</option>
            ${clientes.map(x => `<option value="${esc(x.id)}" ${x.id === vinculo.club ? 'selected' : ''}>${esc(x.nombre || x.id)}</option>`).join('')}
          </select></label>
        <label class="block"><span class="${ROTULO}">Su equipo en la zona</span>
          <select onchange="SGADD_TORNEOS.elegirVinculo('equipo', this.value)" class="${CLASE_INPUT}" ${z ? '' : 'disabled'}>
            <option value="">Elegí el equipo</option>
            ${(z ? z.equipos : []).map(e => `<option value="${esc(e.nombre)}" ${e.nombre === vinculo.equipo ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
          </select></label>
        <label class="block"><span class="${ROTULO}">Id de la categoría del cliente</span>
          <input type="text" id="vinculo-categoria" value="${esc(vinculo.categoria)}" autocomplete="off" spellcheck="false"
            oninput="SGADD_TORNEOS.campoVinculo('categoria', this.value)" class="${CLASE_INPUT} font-mono"></label>
        <label class="block"><span class="${ROTULO}">Etiqueta en su selector</span>
          <input type="text" id="vinculo-label" value="${esc(vinculo.label)}" autocomplete="off"
            oninput="SGADD_TORNEOS.campoVinculo('label', this.value)" class="${CLASE_INPUT}"></label>
      </div>
      <button type="button" id="vinculo-enviar" onclick="SGADD_TORNEOS.vincular()" ${listo ? '' : 'disabled'}
        class="px-3 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider bg-accent text-base disabled:opacity-40">Enganchar</button>
      </div>
    </details>`;
  }

  /** El plegado del enganche. Igual que el del alta: vive en el estado. */
  function abrirVinculo(v) { vinculo.abierto = !!v; }

  /* Despliega o repliega la tarjeta de UN torneo. Varias pueden estar
     abiertas a la vez: son independientes y la grilla se reacomoda sola
     (`items-start`, o una card corta se estiraria al alto de la mas larga). */
  function abrirTarjeta(id, v) { if (v) abiertos[id] = true; else delete abiertos[id]; }

  /** El bloque entero del Panel Master. */
  /**
   * LA PANTALLA, ordenada por la jerarquía: Torneo → Zona → Cliente.
   *
   * El encabezado dice la regla en una línea, porque es lo que evita la
   * duda de «qué formulario uso»: no hay dos caminos, hay uno solo que
   * empieza en el torneo. El alta de un cliente no vive acá suelta — nace
   * del botón de su zona.
   *
   * LOS HUÉRFANOS VAN AL FINAL Y NO SE ESCONDEN. Son los clientes que hoy
   * no declaran torneo: se siguen sirviendo igual (no se rompe nada de lo
   * que ya anda) y quedan a la vista con su botón para engancharlos.
   */
  function html(cs) {
    const lista = cs || clubes();
    const a = arbol(lista);
    const zonas = a.torneos.reduce((n, t) => n + t.zonas.length, 0);
    const clientes = a.torneos.reduce((n, t) => n + t.clientes, 0);
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink">Torneos y clientes</h3>
          <span class="font-mono text-[11px] text-muted">${a.torneos.length} torneos · ${zonas} zonas · ${clientes} clientes</span>
        </div>
        <p class="text-xs text-muted mt-2">
          <b class="text-ink">Un cliente siempre pertenece a un torneo</b>, y un torneo puede existir sin
          clientes — que es como se carga una liga entera para tener sus cruces antes de que un club
          contrate. Por eso se da de alta desde la zona: <b class="text-ink">+ cliente</b> en la fila
          de la zona abre el formulario con el torneo y el libro ya elegidos.</p>
      </div>
      ${a.torneos.length
        ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">${a.torneos.map(tarjeta).join('')}</div>`
        : `<div class="card rounded-xl p-4 border border-hairline">
             <p class="text-xs text-muted">Todavía no hay ningún torneo. Empezá por
             <b class="text-ink">Nuevo torneo</b>, acá abajo: un cliente se cuelga de una de sus zonas.</p>
           </div>`}
      ${bloqueHuerfanos(a.huerfanos)}
      <div id="torneoForm">${formTorneo()}</div>
      <div id="torneoVinculoSlot">${formVinculo(lista)}</div>`;
  }

  /**
   * Las categorías de cliente sin torneo.
   *
   * Aparecen SOLO si las hay: una card permanente diciendo «no hay
   * huérfanos» es ruido, y un Diagnóstico que avisa siempre se deja de
   * leer (punto 15). El botón lleva al mismo formulario de enganche que
   * ya existía, con el cliente preseleccionado.
   */
  function bloqueHuerfanos(hs) {
    if (!hs || !hs.length) return '';
    return `<div class="card rounded-xl p-4 border border-hairline" data-huerfanos="${hs.length}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 class="font-display uppercase tracking-wide text-sm zona-aviso zona-texto">⚠ Sin torneo</h3>
        <span class="font-mono text-[11px] text-muted">${hs.length} ${hs.length === 1 ? 'categoría' : 'categorías'}</span>
      </div>
      <p class="text-xs text-muted mb-2">Se sirven igual que siempre: esto no las corta. Pero mientras no declaren
        torneo no tienen fixture ni cruces, así que conviene engancharlas a la zona que les corresponde.</p>
      <ul class="space-y-1.5">${hs.map(h => `<li class="flex items-baseline justify-between gap-3 flex-wrap text-xs">
        <span class="text-ink">${esc(h.nombre)}
          <span class="font-mono text-[10px] text-muted">${esc(h.club)}/${esc(h.slug)}</span>
          <span class="text-muted">· ${esc(h.label)}</span>
          ${h.torneoFantasma ? `<span class="zona-peligro zona-texto">· apunta a «${esc(h.torneoFantasma)}», que no está en el catálogo</span>` : ''}
        </span>
        <button type="button" onclick="SGADD_TORNEOS.empezarVinculo('', '${escJs(h.club)}', '${escJs(h.slug)}')"
          class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline">Enganchar a un torneo →</button>
      </li>`).join('')}</ul>
    </div>`;
  }

  /* ----------------------------------------------------------- handlers */

  const conFoco = (fn) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.conservarFoco) ? SGADD_UI.conservarFoco(fn) : fn();
  function pintar(id, contenido) {
    const n = typeof document !== 'undefined' ? document.getElementById(id) : null;
    if (n) conFoco(() => { n.innerHTML = contenido; });
  }
  function refrescarEstado() { pintar('torneoEstado', estadoTorneo()); }
  function refrescarForm() { pintar('torneoForm', formTorneo()); }
  function refrescarVinculo() {
    const n = typeof document !== 'undefined' ? document.getElementById('torneoVinculoSlot') : null;
    if (n) conFoco(() => { n.innerHTML = formVinculo(clubes()); });
  }

  /* Tipear NO repinta el formulario (punto 17): escribe el borrador y
     refresca solo el estado. */
  function campo_(id, v) { borrador[id] = v; resultado.estado = null; refrescarEstado(); }
  function campoZona(i, c, v) { if (borrador.zonas[i]) borrador.zonas[i][c] = v; resultado.estado = null; refrescarEstado(); }
  function agregarZona() { borrador.zonas.push(zonaVacia()); refrescarForm(); }
  function quitarZona(i) { borrador.zonas.splice(i, 1); refrescarForm(); }
  function nuevo() {
    Object.assign(borrador, { modo: 'nuevo', id: '', nombre: '', liga: '', temporada: '', acento: '', zonas: [zonaVacia()], abierto: true });
    resultado.estado = null; refrescarForm();
    irAlForm();
  }

  /* El plegado del formulario. Lo escribe el <details> al abrirse o
     cerrarse, y tambien `nuevo()` y `editar()`, que son gestos explicitos:
     el que toca «Editar estructura» quiere ver el formulario, no buscarlo. */
  function abrirForm(v) { borrador.abierto = !!v; }

  function irAlForm() {
    const n = typeof document !== 'undefined' ? document.getElementById('torneoForm') : null;
    if (n && n.scrollIntoView) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editar(id) {
    const t = torneosDe(clubes()).find(x => x.id === id);
    if (!t) return;
    Object.assign(borrador, { modo: id, id: id, nombre: t.nombre || '', liga: t.liga || '', temporada: t.temporada || '',
      acento: t.acento || '',
      zonas: zonasDe(t).map(z => ({ zona: z.zona, slug: z.slug, label: z.label, libro: '', equiposTexto: textoEquipos(z.equipos) })),
      abierto: true });
    abiertos[id] = true; resultado.estado = null; refrescarForm();
    irAlForm();
  }

  function aplicar(intencion, alOk) {
    resultado.estado = 'yendo'; refrescarEstado();
    return SGADD_DATA.guardarCatalogo(intencion).then((r) => {
      resultado.estado = 'ok';
      const prop = (r.aplicadoA || []).slice(1).map(x => x.club).join(', ');
      resultado.mensaje = 'Guardado.' + (prop ? ' El libro llegó también a: ' + prop + '.' : '') + (r.aviso ? ' ' + r.aviso : '');
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) { SGADD_CLIENTES.estado.clubes = r.clubes; SGADD_CLIENTES.pintar(); }
      if (alOk) alOk(r);
      if (typeof SGADD_HUB !== 'undefined' && SGADD_HUB.repintarLista) SGADD_HUB.repintarLista();
      else { refrescarForm(); refrescarVinculo(); }
    }).catch((e) => {
      resultado.estado = 'error';
      resultado.mensaje = e.message || 'No se pudo guardar.';
      refrescarEstado();
    });
  }

  function guardar() {
    if (faltantesTorneo(borrador).length) return;
    const previo = borrador.modo === 'nuevo' ? null : torneosDe(clubes()).find(x => x.id === borrador.modo);
    const intencion = intencionTorneo(borrador);
    const ir = () => aplicar(intencion, () => { if (borrador.modo === 'nuevo') borrador.modo = intencion.club; });
    if (typeof SGADD_CONFIRMAR === 'undefined') return ir();
    SGADD_CONFIRMAR.abrir({
      titulo: 'Torneo · ' + intencion.nombre,
      aviso: 'Es la estructura del torneo: zonas, equipos y el libro de cada zona. No toca ningún cliente, '
        + 'salvo los enganchados a una zona que estrena libro: ésos lo reciben en su próxima carga.',
      confirmar: previo ? 'Guardar el torneo' : 'Dar de alta el torneo',
      cambios: cambiosTorneo(borrador, previo),
      alConfirmar: ir,
    });
  }

  /**
   * Abre el enganche. `club` y `categoria` vienen del boton de un huerfano:
   * ahi lo que se quiere es atar ESA categoria, y hacerla buscar de nuevo
   * en un desplegable de todos los clientes es pedir dos veces el mismo
   * dato. Sin ellos se comporta como antes.
   */
  function empezarVinculo(torneoId, club, categoria) {
    vinculo.torneo = torneoId; vinculo.zona = ''; vinculo.equipo = ''; vinculo.abierto = true;
    if (club) { vinculo.club = club; vinculo.categoria = categoria || ''; }
    refrescarVinculo();
    const n = typeof document !== 'undefined' ? document.getElementById('torneoVinculo') : null;
    if (n && n.scrollIntoView) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function elegirVinculo(c, v) {
    vinculo[c] = v;
    const cs = clubes();
    if (c === 'torneo') { vinculo.zona = ''; vinculo.equipo = ''; }
    if (c === 'zona' || c === 'club' || c === 'torneo') {
      const t = torneosDe(cs).find(x => x.id === vinculo.torneo);
      const z = t && zonasDe(t).find(x => x.zona === vinculo.zona);
      const cl = clientesDe(cs).find(x => x.id === vinculo.club);
      if (vinculo.club && vinculo.torneo) vinculo.categoria = idVinculoSugerido(vinculo.club, vinculo.torneo);
      if (z && !vinculo.label) vinculo.label = z.label;
      /* SE PROPONE el equipo del club si está en la zona; si no, el que más
         se parece al nombre (la misma función que el alta de clientes). */
      if (z && cl && c !== 'equipo') {
        const k = (typeof SGADD !== 'undefined' && SGADD.claveEquipo) ? SGADD.claveEquipo : (x => String(x).toUpperCase());
        const propio = z.equipos.find(e => cl.equipoPropio && e.clave === k(cl.equipoPropio));
        const sug = propio || (typeof SGADD_HUB !== 'undefined' && SGADD_HUB.sugerirEquipo
          ? SGADD_HUB.sugerirEquipo(cl.nombre || cl.id, z.equipos) : null);
        vinculo.equipo = sug ? (sug.nombre || '') : '';
      }
    }
    refrescarVinculo();
  }

  function campoVinculo(c, v) {
    vinculo[c] = v;
    const b = typeof document !== 'undefined' ? document.getElementById('vinculo-enviar') : null;
    if (b) b.disabled = !(vinculo.torneo && vinculo.zona && vinculo.club && ID.test(vinculo.categoria) && vinculo.equipo);
  }

  function vincular() {
    const cs = clubes();
    const t = torneosDe(cs).find(x => x.id === vinculo.torneo);
    const z = t && zonasDe(t).find(x => x.zona === vinculo.zona);
    const cl = clientesDe(cs).find(x => x.id === vinculo.club);
    if (!t || !z || !cl) return;
    const intencion = { accion: 'vincular_torneo', club: vinculo.club, categoria: vinculo.categoria,
      torneo: vinculo.torneo, zona: vinculo.zona, equipo: vinculo.equipo, label: vinculo.label };
    const ya = (cl.categorias || []).find(k => k.slug === vinculo.categoria);
    const ir = () => aplicar(intencion);
    if (typeof SGADD_CONFIRMAR === 'undefined') return ir();
    SGADD_CONFIRMAR.abrir({
      titulo: (cl.nombre || cl.id) + ' · ' + z.label,
      aviso: z.activo
        ? 'La categoría lee el libro de la zona con TODOS sus equipos. El cliente la ve en su próxima carga.'
        : 'La zona todavía no tiene libro: la categoría queda en el selector del cliente como «sin datos» y '
          + 'recibe el libro sola el día que MotorStats lo escriba.',
      confirmar: 'Enganchar',
      cambios: [
        { label: ya ? 'Categoría' : 'Categoría nueva', antes: ya ? ya.label : '—', despues: vinculo.label + ' (' + vinculo.categoria + ')' },
        { label: 'Torneo y zona', antes: ya && ya.torneo ? ya.torneo + ' · ' + (ya.zona || '') : '—', despues: t.nombre + ' · ' + z.label },
        { label: 'Equipo propio', antes: ya ? (ya.equipoEfectivo || cl.equipoPropio || '—') : (cl.equipoPropio || '—'), despues: vinculo.equipo },
      ],
      alConfirmar: ir,
    });
  }

  if (!borrador.zonas.length) borrador.zonas.push(zonaVacia());

  return {
    /* motor */
    esTorneo, torneosDe, clientesDe, zonasDe, enganchados, arbol, parsearEquipos, textoEquipos,
    faltantesTorneo, intencionTorneo, cambiosTorneo, idVinculoSugerido, idDeLibro,
    /* ui */
    html, borrador, vinculo, resultado, campo: campo_, campoZona, agregarZona, quitarZona, nuevo, editar,
    guardar, empezarVinculo, elegirVinculo, campoVinculo, vincular, abrirForm, abrirVinculo, abrirTarjeta, bloqueHuerfanos,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_TORNEOS;
