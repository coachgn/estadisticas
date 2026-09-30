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

  /** Las zonas REGULARES de un torneo: una por categoría con `zona`. Los
      libros vinculados (playoffs, permanencia) van aparte: `librosDe`. */
  function zonasDe(t) {
    return ((t && t.categorias) || []).filter(k => k.zona && !k.interzonal)
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
     LIBROS VINCULADOS Y LLAVE · motor puro (punto 77)
     ===================================================================== */

  const ROLES_LIBRO = [
    { id: 'playoffs', label: 'Playoffs' },
    { id: 'permanencia', label: 'Permanencia' },
    { id: 'repechaje', label: 'Repechaje' },
  ];
  function rolLabel(r) { const x = ROLES_LIBRO.find(o => o.id === r); return x ? x.label : 'Fase regular'; }

  /** Los libros vinculados de un torneo: las zonas que no son regulares. */
  function librosDe(t) {
    return ((t && t.categorias) || []).filter(k => k.zona && k.interzonal)
      .map(k => ({ zona: k.zona, slug: k.slug, label: k.label, activo: !!k.activo,
        rol: k.rol || 'playoffs', participan: Array.isArray(k.participan) ? k.participan : [], fin: k.libroFin || null }));
  }

  /** Un slug a partir de una etiqueta: «Playoff A» → «playoff-a». */
  function slugDe(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  /** Qué le falta al vínculo de un libro para poder mandarlo. */
  /* EL LIBRO CONECTADO SE VE EN EL CAMPO, enmascarado (punto 79): «…a1b2c3».
     Mientras el campo diga eso, el libro no cambia. */
  const MASCARA = '…';
  function esMascara(v) { return String(v || '').indexOf(MASCARA) === 0; }
  function faltantesLibro(b, t) {
    const f = [];
    if (!String(b.label || '').trim()) f.push('la etiqueta');
    const id = b.zona || slugDe(b.label);
    if (!ID.test(id)) f.push('un id de libro válido');
    else if (!b.editando && t && ((t.categorias || []).some(k => k.zona === id))) f.push('otro id: «' + id + '» ya existe');
    if (!ROLES_LIBRO.some(r => r.id === b.rol)) f.push('el rol');
    if (!b.editando && !String(b.libro || '').trim()) f.push('el link del libro');
    if (b.libro && !esMascara(b.libro) && !SHEET.test(idDeLibro(b.libro))) f.push('un link de libro con forma de id de Google');
    return f;
  }

  /** La intención de vincular (o editar) un libro. Sin participantes = todas las zonas. */
  function intencionLibro(t, b) {
    const id = b.zona || slugDe(b.label);
    const z = { label: String(b.label).trim(), rol: b.rol,
      participan: Object.keys(b.participan || {}).filter(k => b.participan[k]) };
    if (b.libro && !esMascara(b.libro)) z.sheetId = idDeLibro(b.libro);
    const zonas = {}; zonas[id] = z;
    return { accion: 'torneo', club: t.id, nombre: t.nombre, zonas: zonas };
  }

  /** «1° Norte», «Ganador C1», «Perdedor S2». */
  function ladoTexto(l, nombres) {
    const n = nombres || {};
    if (!l) return '—';
    if (l.ganador) return 'Ganador ' + l.ganador;
    if (l.perdedor) return 'Perdedor ' + l.perdedor;
    if (l.zona && l.puesto) return l.puesto + '° ' + (n[l.zona] || l.zona);
    if (l.equipo) return String(l.equipo);
    return '—';
  }

  /* El editor trabaja sobre una copia PLANA de cada fase. Lo que el editor
     no conoce (ventanas, `desde`, `hasta`, campos futuros) viaja intacto en
     `_resto`, así guardar desde el Panel Master no borra lo que vino del
     archivo del torneo. */
  function ladoAEditor(l) {
    const x = l || {};
    if (x.ganador) return { tipo: 'ganador', ref: x.ganador, zona: '', puesto: '' };
    if (x.perdedor) return { tipo: 'perdedor', ref: x.perdedor, zona: '', puesto: '' };
    return { tipo: 'puesto', ref: '', zona: x.zona || '', puesto: x.puesto ? String(x.puesto) : '' };
  }
  function editorALado(e) {
    if (e.tipo === 'ganador') return { ganador: e.ref };
    if (e.tipo === 'perdedor') return { perdedor: e.ref };
    const o = { zona: e.zona }; const p = Number(e.puesto);
    o.puesto = Number.isInteger(p) ? p : e.puesto;
    return o;
  }
  function faseAEditor(f) {
    const resto = Object.assign({}, f);
    ['id', 'label', 'libro', 'cruce', 'zonaLibro', 'serie', 'cruces', 'zonas'].forEach(k => delete resto[k]);
    const zonas = {};
    (Array.isArray(f.zonas) ? f.zonas : (f.zonas ? [f.zonas] : [])).forEach((z) => { zonas[String(z).toLowerCase()] = true; });
    return { id: f.id || '', label: f.label || '', libro: Array.isArray(f.libro) ? f.libro.join(', ') : (f.libro || ''),
      cruce: f.cruce === 'interzonal' ? 'interzonal' : 'zona', zonaLibro: f.zonaLibro || '',
      mejorDe: f.serie && f.serie.mejorDe ? String(f.serie.mejorDe) : '',
      cruces: (f.cruces || []).map(c => ({ id: c.id || '', a: ladoAEditor(c.a), b: ladoAEditor(c.b) })),
      zonas: zonas, _resto: resto };
  }
  function editorAFase(e) {
    const f = Object.assign({}, e._resto || {}, { id: String(e.id || '').trim() });
    if (String(e.label || '').trim()) f.label = String(e.label).trim();
    const libro = String(e.libro || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (libro.length) f.libro = libro;
    f.cruce = e.cruce === 'interzonal' ? 'interzonal' : 'zona';
    if (e.zonaLibro) f.zonaLibro = e.zonaLibro;
    if (e.mejorDe) f.serie = { mejorDe: Number(e.mejorDe) };
    if (e.cruces.length) f.cruces = e.cruces.map(c => ({ id: String(c.id || '').trim(), a: editorALado(c.a), b: editorALado(c.b) }));
    /* LA PERTENENCIA POR ZONA (punto 78). Ninguna tildada = se deduce de
       los cruces; así una llave vieja no cambia de visibilidad sola. */
    const zonas = Object.keys(e.zonas || {}).filter(z => e.zonas[z]).sort();
    if (zonas.length) f.zonas = zonas;
    return f;
  }
  /** Los errores del editor, con el MISMO parser que usa el panel al leer.
      Con el torneo, además valida que las zonas declaradas existan. */
  function erroresLlave(fases, t) {
    if (typeof SGADD_FASES === 'undefined') return [];
    const o = t ? { zonasValidas: zonasDe(t).map(z => z.zona) } : {};
    return SGADD_FASES.parsear({ fases: fases }, o).errores || [];
  }
  function intencionLlave(t, fases) {
    return { accion: 'torneo', club: t.id, nombre: t.nombre,
      formato: Object.assign({}, t.formato || {}, { fases: fases }) };
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
    const tCrudo = torneoPorId(n.id) || { id: n.id, nombre: n.nombre, categorias: [], formato: n.formato };
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
    /* CON UN EDITOR ABIERTO la tarjeta ocupa la fila entera: en la grilla
       de tres columnas mide ~220px y la llave no entra en un renglón. Va
       inline y no como clase para no depender del CSS compilado. */
    const ancha = libroEd.torneo === n.id || llaveEd.torneo === n.id;
    return `<details class="card hub-plegable rounded-xl border border-hairline" data-torneo="${esc(n.id)}"
      ${ancha ? 'style="grid-column: 1 / -1"' : ''}
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
      ${bloqueLibros(n, tCrudo)}
      ${bloqueLlave(n, tCrudo)}
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
    _pintada = cs || null;
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

  /* =====================================================================
     LIBROS VINCULADOS Y LLAVE · UI (punto 77)

     Viven DENTRO de la tarjeta del torneo: son estructura del torneo, no
     de un cliente. Tipear no repinta (punto 17): el texto escribe el
     borrador y refresca solo la línea de estado; los desplegables y las
     casillas sí repintan su bloque.
     ===================================================================== */

  /* Los controles en línea del editor de cruces: sin el `w-full` del resto,
     para que puesto, zona y cruce entren en un renglón. */
  const CLASE_CHICO = 'bg-surface2 border border-hairline rounded-md px-2 py-1.5 text-xs text-ink';
  const libroEd = { torneo: '', zona: '', editando: false, label: '', rol: 'playoffs', participan: {}, libro: '', mensaje: '', error: false };
  const llaveEd = { torneo: '', fases: [], mensaje: '', error: false };

  /* La lista que se está PINTANDO, no la global: la tarjeta tiene que
     mostrar los libros del mismo catálogo del que sale su árbol. */
  let _pintada = null;
  function torneoPorId(id) { return torneosDe(_pintada || clubes()).find(x => x.id === id) || null; }
  function nombresDeZonas(t) {
    const n = {};
    ((t && t.categorias) || []).forEach((k) => { if (k.zona) n[k.zona] = k.label || k.zona; });
    return n;
  }

  function bloqueLibros(n, t) {
    const ls = librosDe(t);
    const nom = nombresDeZonas(t);
    const editando = libroEd.torneo === n.id;
    return `<div class="mt-4 pt-3 border-t border-hairline" data-libros="${esc(n.id)}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h4 class="font-display uppercase tracking-wide text-xs text-ink">📚 Libros vinculados</h4>
        <span class="font-mono text-[10px] text-muted">${ls.length}</span>
      </div>
      <p class="text-[11px] text-muted mb-2">Los tramos que MotorStats escribe en otro libro: playoffs, permanencia,
        repechaje. Cada cliente de las zonas que participan recibe de ahí <b class="text-ink">solo los partidos de su equipo</b>.</p>
      <ul class="space-y-1.5">${ls.map(l => `<li class="flex items-baseline justify-between gap-2 flex-wrap text-xs">
        <span class="text-ink">${esc(l.label)}
          <span class="font-mono text-[10px] px-1 py-0.5 rounded bg-surface2 text-muted">${esc(rolLabel(l.rol))}</span>
          <span class="text-muted">· ${l.participan.length ? l.participan.map(z => esc(nom[z] || z)).join(', ') : 'todas las zonas'}</span>
          <span class="${l.activo ? 'text-ink' : 'text-muted'}">· ${l.activo ? '✓ conectado' : '— sin libro'}</span></span>
        <span class="flex gap-3">
          <button type="button" onclick="SGADD_TORNEOS.editarLibro('${escJs(n.id)}','${escJs(l.zona)}')"
            class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">Editar</button>
          <button type="button" onclick="SGADD_TORNEOS.desvincularLibro('${escJs(n.id)}','${escJs(l.zona)}')"
            class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Desvincular</button></span>
      </li>`).join('') || '<li class="text-xs text-muted">Todavía ninguno.</li>'}</ul>
      ${editando ? `<div id="libroEd-${esc(n.id)}" class="mt-2">${formLibro(t)}</div>`
        : `<button type="button" onclick="SGADD_TORNEOS.nuevoLibro('${escJs(n.id)}')"
            class="mt-2 text-[11px] font-display uppercase tracking-wider text-accent hover:underline">＋ Vincular un libro</button>`}
    </div>`;
  }

  function formLibro(t) {
    const regulares = zonasDe(t);
    const b = libroEd;
    const f = faltantesLibro(b, t);
    return `<div class="rounded-lg border border-hairline p-3 space-y-2">
      <div class="grid sm:grid-cols-2 gap-2">
        <label class="block"><span class="${ROTULO}">Nombre del tramo</span>
          <input type="text" id="libroEd-label" value="${esc(b.label)}" autocomplete="off" placeholder="Playoff A"
            oninput="SGADD_TORNEOS.campoLibro('label', this.value)" class="${CLASE_INPUT}"></label>
        <label class="block"><span class="${ROTULO}">Rol</span>
          <select id="libroEd-rol" onchange="SGADD_TORNEOS.elegirLibro('rol', this.value)" class="${CLASE_INPUT}">
            ${ROLES_LIBRO.map(r => `<option value="${r.id}" ${b.rol === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select></label>
      </div>
      <fieldset><legend class="${ROTULO}">Zonas que participan · ninguna tildada = todas</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-1">${regulares.map(z => `<label class="text-xs text-ink flex items-center gap-1.5">
          <input type="checkbox" ${b.participan[z.zona] ? 'checked' : ''}
            onchange="SGADD_TORNEOS.elegirLibro('participan', '${escJs(z.zona)}', this.checked)"> ${esc(z.label)}</label>`).join('')}</div>
      </fieldset>
      <label class="block"><span class="${ROTULO}">Libro (link o id)${b.editando ? (esMascara(b.libro)
          ? ' · conectado · pegá otro link para cambiarlo' : ' · vacío = conserva el que tiene') : ''}</span>
        <input type="text" id="libroEd-libro" value="${esc(b.libro)}" autocomplete="off" spellcheck="false"
          onfocus="if (this.value.indexOf('${MASCARA}') === 0) this.select()"
          oninput="SGADD_TORNEOS.campoLibro('libro', this.value)" class="${CLASE_INPUT} font-mono"></label>
      <div id="libroEdEstado">${estadoLibro(f)}</div>
    </div>`;
  }

  function estadoLibro(f) {
    const falta = f || faltantesLibro(libroEd, torneoPorId(libroEd.torneo));
    const msg = libroEd.mensaje ? `<p class="text-xs ${libroEd.error ? 'text-red-400' : 'text-emerald-400'}" role="${libroEd.error ? 'alert' : 'status'}">${esc(libroEd.mensaje)}</p>` : '';
    return `${falta.length ? `<p class="text-[11px] text-muted">Falta: ${esc(falta.join(' · '))}.</p>` : ''}${msg}
      <div class="flex gap-3 mt-1">
        <button type="button" onclick="SGADD_TORNEOS.guardarLibro()" ${falta.length ? 'disabled' : ''}
          class="px-3 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider bg-accent text-base disabled:opacity-40">
          ${libroEd.editando ? 'Guardar el libro' : 'Vincular el libro'}</button>
        <button type="button" onclick="SGADD_TORNEOS.cancelarLibro()"
          class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Cancelar</button></div>`;
  }

  function bloqueLlave(n, t) {
    const fases = (t.formato && t.formato.fases) || [];
    const nom = nombresDeZonas(t);
    const editando = llaveEd.torneo === n.id;
    return `<div class="mt-4 pt-3 border-t border-hairline" data-llave="${esc(n.id)}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h4 class="font-display uppercase tracking-wide text-xs text-ink">🔀 Cruces · la llave</h4>
        <span class="font-mono text-[10px] text-muted">${fases.length} ${fases.length === 1 ? 'fase' : 'fases'}</span>
      </div>
      ${editando ? `<div id="llaveEd-${esc(n.id)}">${formLlave(t)}</div>` : `
      <p class="text-[11px] text-muted mb-2">Quién cruza con quién en cada fase. Se guarda en el servidor: el panel de
        cada cliente resuelve los puestos con la tabla de hoy, sin un deploy.</p>
      <ol class="space-y-1 text-xs">${fases.map(f => `<li><span class="text-ink">${esc(f.label || f.id)}</span>
        ${(f.cruces || []).length ? '<span class="text-muted"> · ' + f.cruces.map(c => esc(c.id) + ': ' + esc(ladoTexto(c.a, nom)) + ' vs ' + esc(ladoTexto(c.b, nom))).join(' · ') + '</span>' : ''}</li>`).join('')
        || '<li class="text-muted">Sin fases declaradas.</li>'}</ol>
      <button type="button" onclick="SGADD_TORNEOS.editarLlave('${escJs(n.id)}')"
        class="mt-2 text-[11px] font-display uppercase tracking-wider text-accent hover:underline">Editar la llave</button>`}
    </div>`;
  }

  function selectLado(fi, ci, lado, l, zonas, previos) {
    const pre = `SGADD_TORNEOS.campoLado(${fi},${ci},'${lado}',`;
    return `<span class="flex flex-wrap items-center gap-1">
      <select aria-label="Tipo de lado" onchange="${pre}'tipo',this.value)" class="${CLASE_CHICO}">
        <option value="puesto" ${l.tipo === 'puesto' ? 'selected' : ''}>Puesto</option>
        <option value="ganador" ${l.tipo === 'ganador' ? 'selected' : ''}>Ganador de</option>
        <option value="perdedor" ${l.tipo === 'perdedor' ? 'selected' : ''}>Perdedor de</option>
      </select>
      ${l.tipo === 'puesto'
        ? `<input type="number" min="1" max="40" aria-label="Puesto" value="${esc(l.puesto)}" id="ll-${fi}-${ci}-${lado}-p"
             oninput="${pre}'puesto',this.value,true)" class="${CLASE_CHICO}" style="width:4rem">
           <span class="text-muted text-xs">°</span>
           <select aria-label="Zona" onchange="${pre}'zona',this.value)" class="${CLASE_CHICO}">
             <option value="">zona…</option>${zonas.map(z => `<option value="${esc(z.zona)}" ${l.zona === z.zona ? 'selected' : ''}>${esc(z.label)}</option>`).join('')}</select>`
        : `<select aria-label="Cruce" onchange="${pre}'ref',this.value)" class="${CLASE_CHICO}">
             <option value="">cruce…</option>${previos.map(id => `<option value="${esc(id)}" ${l.ref === id ? 'selected' : ''}>${esc(id)}</option>`).join('')}</select>`}
    </span>`;
  }

  function formLlave(t) {
    const zonas = zonasDe(t);
    const libros = librosDe(t);
    const previos = [];
    const html = llaveEd.fases.map((f, fi) => {
      const cr = f.cruces.map((c, ci) => {
        const fila = `<div class="flex flex-wrap items-center gap-2 py-1 border-t border-hairline">
          <input type="text" aria-label="Id del cruce" value="${esc(c.id)}" id="ll-${fi}-${ci}-id" placeholder="C1"
            oninput="SGADD_TORNEOS.campoCruce(${fi},${ci},this.value)" class="${CLASE_CHICO} font-mono" style="width:4rem">
          ${selectLado(fi, ci, 'a', c.a, zonas, previos.slice())}
          <span class="text-muted text-xs">vs</span>
          ${selectLado(fi, ci, 'b', c.b, zonas, previos.slice())}
          <button type="button" onclick="SGADD_TORNEOS.quitarCruce(${fi},${ci})" aria-label="Quitar el cruce"
            class="text-[11px] text-muted hover:underline ml-auto">quitar</button></div>`;
        if (c.id) previos.push(c.id);
        return fila;
      }).join('');
      const pre = `SGADD_TORNEOS.campoFase(${fi},`;
      return `<div class="rounded-lg border border-hairline p-3 space-y-2">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label class="block"><span class="${ROTULO}">Id</span><input type="text" value="${esc(f.id)}" id="ll-${fi}-id"
            oninput="${pre}'id',this.value,true)" class="${CLASE_INPUT} font-mono"></label>
          <label class="block"><span class="${ROTULO}">Nombre</span><input type="text" value="${esc(f.label)}" id="ll-${fi}-label"
            oninput="${pre}'label',this.value,true)" class="${CLASE_INPUT}"></label>
          <label class="block"><span class="${ROTULO}">FASE en el libro</span><input type="text" value="${esc(f.libro)}" id="ll-${fi}-libro"
            placeholder="${esc(String(f.id || '').toUpperCase())}" oninput="${pre}'libro',this.value,true)" class="${CLASE_INPUT} font-mono"></label>
          <label class="block"><span class="${ROTULO}">Cruce</span><select onchange="${pre}'cruce',this.value)" class="${CLASE_INPUT}">
            <option value="zona" ${f.cruce === 'zona' ? 'selected' : ''}>Dentro de la zona</option>
            <option value="interzonal" ${f.cruce === 'interzonal' ? 'selected' : ''}>Entre zonas</option></select></label>
          <label class="block"><span class="${ROTULO}">Se juega en</span><select onchange="${pre}'zonaLibro',this.value)" class="${CLASE_INPUT}">
            <option value="">el libro de cada zona</option>${libros.map(l => `<option value="${esc(l.zona)}" ${f.zonaLibro === l.zona ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select></label>
          <label class="block"><span class="${ROTULO}">Serie</span><select onchange="${pre}'mejorDe',this.value)" class="${CLASE_INPUT}">
            <option value="">todos contra todos</option>${[1, 3, 5, 7].map(m => `<option value="${m}" ${f.mejorDe === String(m) ? 'selected' : ''}>${m === 1 ? 'a un partido' : 'al mejor de ' + m}</option>`).join('')}</select></label>
        </div>
        <fieldset><legend class="${ROTULO}">Zonas que la ven · ninguna tildada = las de sus cruces</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">${zonas.map(z => `<label class="inline-flex items-center gap-1.5 text-xs text-ink">
            <input type="checkbox" ${f.zonas && f.zonas[z.zona] ? 'checked' : ''}
              onchange="SGADD_TORNEOS.zonaFase(${fi}, '${escJs(z.zona)}', this.checked)"> ${esc(z.label)}</label>`).join('')}</div></fieldset>
        <div>${cr}</div>
        <div class="flex gap-4">
          <button type="button" onclick="SGADD_TORNEOS.agregarCruce(${fi})" class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">＋ Cruce</button>
          <button type="button" onclick="SGADD_TORNEOS.quitarFase(${fi})" class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Quitar la fase</button></div>
      </div>`;
    }).join('');
    return `<div class="space-y-2">${html}
      <button type="button" onclick="SGADD_TORNEOS.agregarFase()" class="text-[11px] font-display uppercase tracking-wider text-ink hover:underline">＋ Fase</button>
      <div id="llaveEdEstado">${estadoLlave()}</div></div>`;
  }

  function estadoLlave() {
    const fases = llaveEd.fases.map(editorAFase);
    const err = erroresLlave(fases, torneoPorId(llaveEd.torneo));
    const msg = llaveEd.mensaje ? `<p class="text-xs ${llaveEd.error ? 'text-red-400' : 'text-emerald-400'}" role="${llaveEd.error ? 'alert' : 'status'}">${esc(llaveEd.mensaje)}</p>` : '';
    return `${err.length ? `<p class="text-[11px] zona-peligro zona-texto" role="alert">${esc(err.join(' · '))}</p>` : ''}${msg}
      <div class="flex gap-3 mt-1">
        <button type="button" onclick="SGADD_TORNEOS.guardarLlave()" ${err.length ? 'disabled' : ''}
          class="px-3 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider bg-accent text-base disabled:opacity-40">Guardar la llave</button>
        <button type="button" onclick="SGADD_TORNEOS.cancelarLlave()" class="text-[11px] font-display uppercase tracking-wider text-muted hover:underline">Cancelar</button></div>`;
  }

  /* ----------------------------------------------------------- handlers */

  function repintarLibro() { const t = torneoPorId(libroEd.torneo); if (t) pintar('libroEd-' + libroEd.torneo, formLibro(t)); }
  function repintarLlave() { const t = torneoPorId(llaveEd.torneo); if (t) pintar('llaveEd-' + llaveEd.torneo, formLlave(t)); }
  function repintarTodo() {
    if (typeof SGADD_HUB !== 'undefined' && SGADD_HUB.repintarLista) SGADD_HUB.repintarLista();
  }

  function nuevoLibro(tid) {
    Object.assign(libroEd, { torneo: tid, zona: '', editando: false, label: '', rol: 'playoffs', participan: {}, libro: '', mensaje: '', error: false });
    abiertos[tid] = true; repintarTodo();
  }
  function editarLibro(tid, zona) {
    const t = torneoPorId(tid); const l = t && librosDe(t).find(x => x.zona === zona);
    if (!l) return;
    const part = {}; l.participan.forEach((z) => { part[z] = true; });
    Object.assign(libroEd, { torneo: tid, zona: zona, editando: true, label: l.label, rol: l.rol, participan: part,
      libro: l.fin ? MASCARA + l.fin : '', mensaje: '', error: false });
    abiertos[tid] = true; repintarTodo();
  }
  function cancelarLibro() { libroEd.torneo = ''; repintarTodo(); }
  function campoLibro(c, v) { libroEd[c] = v; libroEd.mensaje = ''; pintar('libroEdEstado', estadoLibro()); }
  function elegirLibro(c, v, marcado) {
    if (c === 'participan') libroEd.participan[v] = !!marcado; else libroEd[c] = v;
    libroEd.mensaje = ''; repintarLibro();
  }
  function guardarLibro() {
    const t = torneoPorId(libroEd.torneo);
    if (!t || faltantesLibro(libroEd, t).length) return;
    const intencion = intencionLibro(t, libroEd);
    const z = intencion.zonas[Object.keys(intencion.zonas)[0]];
    const nom = nombresDeZonas(t);
    const ir = () => SGADD_DATA.guardarCatalogo(intencion).then((r) => {
      libroEd.torneo = '';
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) { SGADD_CLIENTES.estado.clubes = r.clubes; SGADD_CLIENTES.pintar(); }
      repintarTodo();
    }).catch((e) => { libroEd.mensaje = e.message || 'No se pudo guardar.'; libroEd.error = true; pintar('libroEdEstado', estadoLibro()); });
    if (typeof SGADD_CONFIRMAR === 'undefined') return ir();
    SGADD_CONFIRMAR.abrir({
      titulo: t.nombre + ' · ' + z.label,
      aviso: 'Cada cliente de las zonas que participan recibe de este libro SOLO los partidos donde jugó su equipo, '
        + 'en su próxima carga. El libro entero no le llega a nadie.',
      confirmar: libroEd.editando ? 'Guardar el libro' : 'Vincular el libro',
      cambios: [
        { label: libroEd.editando ? 'Libro vinculado' : 'Libro vinculado nuevo', antes: libroEd.editando ? libroEd.label : '—', despues: z.label + ' · ' + rolLabel(z.rol) },
        { label: 'Zonas que participan', antes: '—', despues: z.participan.length ? z.participan.map(x => nom[x] || x).join(', ') : 'todas' },
        { label: 'Libro', antes: libroEd.editando ? 'el que tiene' : '—', despues: z.sheetId ? 'libro nuevo' : 'el que tiene' },
      ],
      alConfirmar: ir,
    });
  }
  function desvincularLibro(tid, zona) {
    const t = torneoPorId(tid); const l = t && librosDe(t).find(x => x.zona === zona);
    if (!l) return;
    const zonas = {}; zonas[zona] = null;
    const ir = () => SGADD_DATA.guardarCatalogo({ accion: 'torneo', club: tid, nombre: t.nombre, zonas: zonas }).then((r) => {
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) { SGADD_CLIENTES.estado.clubes = r.clubes; SGADD_CLIENTES.pintar(); }
      repintarTodo();
    }).catch((e) => { if (typeof window !== 'undefined' && window.alert) window.alert(e.message || 'No se pudo desvincular.'); });
    if (typeof SGADD_CONFIRMAR === 'undefined') return ir();
    SGADD_CONFIRMAR.abrir({ titulo: t.nombre + ' · ' + l.label,
      aviso: 'Los clientes dejan de recibir los partidos de este libro en su próxima carga. La planilla no se toca.',
      confirmar: 'Desvincular', cambios: [{ label: 'Libro vinculado', antes: l.label + ' · ' + rolLabel(l.rol), despues: '—' }],
      alConfirmar: ir });
  }

  function editarLlave(tid) {
    const t = torneoPorId(tid); if (!t) return;
    const fases = (t.formato && t.formato.fases) || [];
    Object.assign(llaveEd, { torneo: tid, fases: fases.map(faseAEditor), mensaje: '', error: false });
    if (!llaveEd.fases.length) llaveEd.fases.push(faseAEditor({ id: 'regular', label: 'Fase regular', cruce: 'zona' }));
    abiertos[tid] = true; repintarTodo();
  }
  function cancelarLlave() { llaveEd.torneo = ''; repintarTodo(); }
  function refrescarLlaveEstado() { llaveEd.mensaje = ''; pintar('llaveEdEstado', estadoLlave()); }
  function campoFase(fi, c, v, tipeo) {
    const f = llaveEd.fases[fi]; if (!f) return;
    f[c] = v;
    if (tipeo) refrescarLlaveEstado(); else repintarLlave();
  }
  function zonaFase(fi, zona, marcado) {
    const f = llaveEd.fases[fi]; if (!f) return;
    f.zonas = f.zonas || {};
    f.zonas[zona] = !!marcado;
    refrescarLlaveEstado();
  }
  function campoCruce(fi, ci, v) {
    const c = llaveEd.fases[fi] && llaveEd.fases[fi].cruces[ci]; if (!c) return;
    c.id = v; refrescarLlaveEstado();
  }
  function campoLado(fi, ci, lado, campoL, v, tipeo) {
    const c = llaveEd.fases[fi] && llaveEd.fases[fi].cruces[ci]; if (!c) return;
    c[lado][campoL] = v;
    if (tipeo) refrescarLlaveEstado(); else repintarLlave();
  }
  function agregarFase() { llaveEd.fases.push(faseAEditor({ id: '', cruce: 'zona' })); repintarLlave(); }
  function quitarFase(fi) { llaveEd.fases.splice(fi, 1); repintarLlave(); }
  function agregarCruce(fi) {
    const f = llaveEd.fases[fi]; if (!f) return;
    const n = llaveEd.fases.reduce((a, x) => a + x.cruces.length, 0) + 1;
    f.cruces.push({ id: String((f.id || 'C').charAt(0)).toUpperCase() + n, a: ladoAEditor(null), b: ladoAEditor(null) });
    repintarLlave();
  }
  function quitarCruce(fi, ci) { const f = llaveEd.fases[fi]; if (f) { f.cruces.splice(ci, 1); repintarLlave(); } }
  function guardarLlave() {
    const t = torneoPorId(llaveEd.torneo); if (!t) return;
    const fases = llaveEd.fases.map(editorAFase);
    if (erroresLlave(fases, t).length) return;
    const nom = nombresDeZonas(t);
    const intencion = intencionLlave(t, fases);
    const ir = () => SGADD_DATA.guardarCatalogo(intencion).then((r) => {
      llaveEd.torneo = '';
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) { SGADD_CLIENTES.estado.clubes = r.clubes; SGADD_CLIENTES.pintar(); }
      repintarTodo();
    }).catch((e) => { llaveEd.mensaje = e.message || 'No se pudo guardar.'; llaveEd.error = true; pintar('llaveEdEstado', estadoLlave()); });
    if (typeof SGADD_CONFIRMAR === 'undefined') return ir();
    const antes = ((t.formato && t.formato.fases) || []);
    SGADD_CONFIRMAR.abrir({ titulo: t.nombre + ' · la llave',
      aviso: 'Los clientes del torneo ven los cruces nuevos en su próxima carga: los puestos se resuelven con la tabla de hoy.',
      confirmar: 'Guardar la llave',
      cambios: fases.map((f) => {
        const a = antes.find(x => x.id === f.id);
        const txt = (x) => (x.label || x.id) + (Array.isArray(x.zonas) && x.zonas.length ? ' · zonas ' + x.zonas.map(z => nom[z] || z).join(', ') : '') + ((x.cruces || []).length ? ' · ' + x.cruces.map(c => c.id + ': ' + ladoTexto(c.a, nom) + ' vs ' + ladoTexto(c.b, nom)).join(' · ') : '');
        return { label: 'Fase ' + f.id, antes: a ? txt(a) : '—', despues: txt(f) };
      }).filter(c => c.antes !== c.despues).concat(antes.filter(a => !fases.some(f => f.id === a.id))
        .map(a => ({ label: 'Fase ' + a.id, antes: a.label || a.id, despues: '— se quita' }))),
      alConfirmar: ir });
  }

  if (!borrador.zonas.length) borrador.zonas.push(zonaVacia());

  return {
    /* motor */
    esTorneo, torneosDe, clientesDe, zonasDe, enganchados, arbol, parsearEquipos, textoEquipos,
    faltantesTorneo, intencionTorneo, cambiosTorneo, idVinculoSugerido, idDeLibro,
    ROLES_LIBRO, librosDe, slugDe, faltantesLibro, intencionLibro, ladoTexto, faseAEditor, editorAFase,
    erroresLlave, intencionLlave, libroEd, llaveEd, esMascara,
    /* ui */
    html, borrador, vinculo, resultado, campo: campo_, campoZona, agregarZona, quitarZona, nuevo, editar,
    guardar, empezarVinculo, elegirVinculo, campoVinculo, vincular, abrirForm, abrirVinculo, abrirTarjeta, bloqueHuerfanos,
    nuevoLibro, editarLibro, cancelarLibro, campoLibro, elegirLibro, guardarLibro, desvincularLibro,
    editarLlave, cancelarLlave, campoFase, zonaFase, campoCruce, campoLado, agregarFase, quitarFase, agregarCruce, quitarCruce, guardarLlave,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_TORNEOS;
