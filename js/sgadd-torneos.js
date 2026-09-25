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
  const vinculo = { torneo: '', zona: '', club: '', categoria: '', label: '', equipo: '' };
  const resultado = { estado: null, mensaje: '' };

  function clubes() {
    return (typeof SGADD_CLIENTES !== 'undefined' && SGADD_CLIENTES.estado.clubes) ? SGADD_CLIENTES.estado.clubes : [];
  }

  function zonaVacia() { return { zona: '', slug: '', label: '', libro: '', equiposTexto: '' }; }

  function tarjeta(t, cs) {
    const zs = zonasDe(t);
    const fases = (t.formato && t.formato.fases) || [];
    return `<div class="card rounded-xl p-4 border border-hairline" data-torneo="${esc(t.id)}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">🏆 ${esc(t.nombre || t.id)}</h3>
        <span class="font-mono text-[11px] text-muted">${esc(t.id)} · ${esc(t.liga || 'sin liga')}${t.temporada ? ' · ' + esc(t.temporada) : ''}</span>
      </div>
      ${fases.length ? `<p class="text-[11px] text-muted mb-2">${fases.map(f => esc(f.label) + (f.cruce === 'interzonal' ? ' (interzonal)' : '')).join(' → ')}</p>` : ''}
      <div class="scrollbox"><table class="w-full">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left pb-1 pr-3 font-display">Zona</th>
          <th class="text-left pb-1 pr-3 font-display">Libro</th>
          <th class="text-left pb-1 pr-3 font-display">Equipos</th>
          <th class="text-left pb-1 font-display">Clientes</th>
        </tr></thead>
        <tbody>${zs.map((z) => {
          const eng = enganchados(cs, t.id, z.zona);
          return `<tr class="text-xs border-t border-hairline">
            <td class="py-1.5 pr-3 text-ink">${esc(z.label)}<span class="block font-mono text-[10px] text-muted">${esc(z.slug)}</span></td>
            <td class="py-1.5 pr-3 ${z.activo ? 'text-ink' : 'text-muted'}">${z.activo ? '✓ conectado' : '— sin libro'}</td>
            <td class="py-1.5 pr-3"><details><summary class="cursor-pointer text-ink">${z.equipos.length}</summary>
              <ul class="mt-1 text-[11px] text-muted">${z.equipos.map(e =>
                `<li>${esc(e.nombre)}${e.id ? ' <span class="font-mono">#' + esc(e.id) + '</span>' : ''}${e.provisorio ? ' · provisorio' : ''}</li>`).join('')}</ul>
            </details></td>
            <td class="py-1.5 text-ink">${eng.length ? eng.map(x => esc(x.nombre) + ' <span class="text-muted">· ' + esc(x.equipo || '—') + '</span>').join('<br>') : '<span class="text-muted">ninguno</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" class="py-2 text-xs text-muted">Sin zonas declaradas.</td></tr>'}</tbody>
      </table></div>
      <div class="mt-3 flex items-center gap-3 flex-wrap">
        <button type="button" onclick="SGADD_TORNEOS.editar('${escJs(t.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">Editar estructura</button>
        <button type="button" onclick="SGADD_TORNEOS.empezarVinculo('${escJs(t.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">Enganchar un cliente</button>
        ${zs.some(z => z.activo) ? `<button type="button" onclick="SGADD_CLIENTES.elegir('${escJs(t.id)}')"
          class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline ml-auto">Abrir el torneo →</button>` : ''}
      </div>
    </div>`;
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

  function formTorneo() {
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline space-y-3">
      <div class="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">
          ${borrador.modo === 'nuevo' ? 'Nuevo torneo' : 'Editar · ' + esc(borrador.nombre || borrador.modo)}</h3>
        ${borrador.modo !== 'nuevo' ? `<button type="button" onclick="SGADD_TORNEOS.nuevo()"
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
    </div>`;
  }

  function formVinculo(cs) {
    const ts = torneosDe(cs);
    const t = ts.find(x => x.id === vinculo.torneo) || null;
    const zs = t ? zonasDe(t) : [];
    const z = zs.find(x => x.zona === vinculo.zona) || null;
    const clientes = clientesDe(cs);
    const listo = !!(t && z && vinculo.club && ID.test(vinculo.categoria) && vinculo.equipo);
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline space-y-3" id="torneoVinculo">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink">Enganchar un cliente a una zona</h3>
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
    </div>`;
  }

  /** El bloque entero del Panel Master. */
  function html(cs) {
    const lista = cs || clubes();
    const ts = torneosDe(lista);
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink">Torneos</h3>
          <span class="font-mono text-[11px] text-muted">${ts.length} torneos · ${ts.reduce((a, t) => a + zonasDe(t).length, 0)} zonas</span>
        </div>
        <p class="text-xs text-muted mt-2">Torneos sin cliente, o con clientes enganchados a una de sus zonas. No tienen plan
          ni accesos: los ve el administrador, y cada cliente ve la zona a la que está enganchado.</p>
      </div>
      ${ts.length ? `<div class="grid lg:grid-cols-2 gap-4">${ts.map(t => tarjeta(t, lista)).join('')}</div>` : ''}
      <div id="torneoForm">${formTorneo()}</div>
      <div id="torneoVinculoSlot">${formVinculo(lista)}</div>`;
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
    Object.assign(borrador, { modo: 'nuevo', id: '', nombre: '', liga: '', temporada: '', acento: '', zonas: [zonaVacia()] });
    resultado.estado = null; refrescarForm();
  }

  function editar(id) {
    const t = torneosDe(clubes()).find(x => x.id === id);
    if (!t) return;
    Object.assign(borrador, { modo: id, id: id, nombre: t.nombre || '', liga: t.liga || '', temporada: t.temporada || '',
      acento: t.acento || '',
      zonas: zonasDe(t).map(z => ({ zona: z.zona, slug: z.slug, label: z.label, libro: '', equiposTexto: textoEquipos(z.equipos) })) });
    resultado.estado = null; refrescarForm();
    const n = typeof document !== 'undefined' ? document.getElementById('torneoForm') : null;
    if (n && n.scrollIntoView) n.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function empezarVinculo(torneoId) {
    vinculo.torneo = torneoId; vinculo.zona = ''; vinculo.equipo = '';
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
    esTorneo, torneosDe, clientesDe, zonasDe, enganchados, parsearEquipos, textoEquipos,
    faltantesTorneo, intencionTorneo, cambiosTorneo, idVinculoSugerido, idDeLibro,
    /* ui */
    html, borrador, vinculo, resultado, campo: campo_, campoZona, agregarZona, quitarZona, nuevo, editar,
    guardar, empezarVinculo, elegirVinculo, campoVinculo, vincular,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_TORNEOS;
