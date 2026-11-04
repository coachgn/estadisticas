/* =====================================================================
   COMPARATIVA · gestión de ciclos (Ciclos, fase 5) · SOLO ADMIN

   Una pestaña de la Comparativa donde el admin:
     1. elige un equipo y una VENTANA LIBRE: el ciclo estándar, los últimos N,
        N desde una posición, un rango de fechas o partidos puntuales;
     2. audita el corte (cerrado, localía, parciales, coherencia, partidos
        excluidos, mapa, SOS) antes de tocar una palabra;
     3. edita las LECTURAS de texto —nunca los números, que salen del paquete
        y el servidor recalcula— y
     4. lleva el ciclo por borrador → auditado → publicado.

   Editar una lectura de un ciclo auditado lo devuelve a borrador; un publicado
   no se toca. La máquina de estados es `SGADD_CICLOS.transicionarGestion`, la
   misma que aplica el servidor. Tipear NO repinta la pantalla (punto 13): el
   texto vive en `estado.draft` y se repinta solo al elegir, guardar o cambiar
   de estado.
   ===================================================================== */
const SGADD_CICLOSADMIN = (function () {
  'use strict';

  const CI = (typeof SGADD_CICLOS !== 'undefined') ? SGADD_CICLOS
    : (typeof require !== 'undefined' ? require('./sgadd-ciclos.js') : null);
  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc) ? SGADD_UI.esc(v)
    : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs) ? SGADD_UI.escJs(v)
    : String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const estado = {
    equipo: null, paq: null, paqDe: null, docs: [], cargando: false, error: null, aviso: null, trabajando: false,
    modo: 'ciclo', ciclo: 0, ultimos: 4, desde: 0, cantidad: 4, fdesde: '', fhasta: '', ids: [],
    draft: {}, draftDe: null,
  };

  const MODOS = [
    ['ciclo', 'Ciclo estándar', 'Ciclo 0, 1, 2… de 4 partidos'],
    ['ultimos', 'Últimos N', 'Los últimos N partidos del equipo'],
    ['posicion', 'N desde el partido…', 'N partidos a partir de una posición'],
    ['calendario', 'Rango de fechas', 'Todos los partidos entre dos fechas'],
    ['ids', 'Partidos puntuales', 'Elegís uno por uno'],
  ];

  const ETIQUETA_ESTADO = {
    borrador: { txt: 'Borrador', glifo: '◆', cls: 'text-accent' },
    auditado: { txt: 'Auditado', glifo: '✓', cls: 'text-ink' },
    publicado: { txt: 'Publicado', glifo: '🔒', cls: 'text-ink' },
  };

  const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  function criterio() {
    const n = (v, d) => { const x = Math.floor(Number(v)); return isFinite(x) && x >= 1 ? x : d; };
    switch (estado.modo) {
      case 'ciclo': return { tipo: 'ciclo', numero: Math.max(0, Math.floor(Number(estado.ciclo)) || 0), n: CI.PARTIDOS_POR_CICLO };
      case 'ultimos': return { tipo: 'partidos', ultimos: n(estado.ultimos, 4) };
      case 'posicion': return { tipo: 'partidos', desde: Math.max(0, Math.floor(Number(estado.desde)) || 0), cantidad: n(estado.cantidad, 4) };
      case 'calendario': return { tipo: 'calendario', desde: estado.fdesde, hasta: estado.fhasta };
      default: return { tipo: 'partidos', ids: estado.ids.slice() };
    }
  }

  /** El documento guardado de la ventana actual (se busca por la clave del ciclo). */
  function docDe(clave) {
    return estado.docs.filter(d => String(d.campo || '').split('|')[1] === clave)[0] || null;
  }

  function vista() {
    if (!estado.paq || !estado.paq.ciclos) return null;
    const ciclo = CI.armarVentana(estado.paq, criterio(), { hoy: hoyAR() });
    if (!ciclo) return { ciclo: null };
    const clave = CI.claveSello(ciclo.meta);
    return { ciclo, clave, auditoria: CI.auditar(ciclo, estado.paq), doc: docDe(clave), base: CI.lecturasBase(ciclo) };
  }

  /** El texto que se muestra en cada lectura: lo editado, lo guardado o lo que arma el motor. */
  function textoDe(v, id) {
    if (Object.prototype.hasOwnProperty.call(estado.draft, id)) return estado.draft[id];
    const g = (v.doc && v.doc.lecturas) ? v.doc.lecturas[id] : undefined;
    return g !== undefined ? g : (v.base[id] || '');
  }

  function sucio(v) {
    return CI.LECTURAS.some(l => Object.prototype.hasOwnProperty.call(estado.draft, l.id)
      && estado.draft[l.id] !== ((v.doc && v.doc.lecturas && v.doc.lecturas[l.id] !== undefined) ? v.doc.lecturas[l.id] : (v.base[l.id] || '')));
  }

  /* ------------------------------------------------------------ vistas */

  function chipEstado(e) {
    const x = ETIQUETA_ESTADO[e] || ETIQUETA_ESTADO.borrador;
    return `<span class="inline-flex items-center gap-1 rounded-md border border-hairline px-2 py-0.5 text-[11px] font-display uppercase tracking-wide ${x.cls}"><span aria-hidden="true">${x.glifo}</span>${x.txt}</span>`;
  }

  function selectorVentana() {
    const p = estado.paq;
    const partidos = CI.partidosDe(p);
    const nCiclos = Math.max(1, Math.ceil(partidos.length / CI.PARTIDOS_POR_CICLO));
    const campo = (rotulo, inner) => `<label class="block"><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${rotulo}</span>${inner}</label>`;
    const num = (clave, min, max) => `<input type="number" min="${min}" max="${max}" value="${esc(estado[clave])}" onchange="SGADD_CICLOSADMIN.fijar('${clave}', this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink w-24" />`;
    let cuerpo = '';
    if (estado.modo === 'ciclo') {
      cuerpo = campo('Ciclo', `<select onchange="SGADD_CICLOSADMIN.fijar('ciclo', this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink">${
        Array.from({ length: nCiclos }, (_, i) => `<option value="${i}"${Number(estado.ciclo) === i ? ' selected' : ''}>Ciclo ${i}</option>`).join('')}</select>`);
    } else if (estado.modo === 'ultimos') cuerpo = campo('Cantidad de partidos', num('ultimos', 1, Math.max(1, partidos.length)));
    else if (estado.modo === 'posicion') cuerpo = campo('Desde el partido nº (0 = el primero)', num('desde', 0, Math.max(0, partidos.length - 1))) + campo('Cantidad', num('cantidad', 1, Math.max(1, partidos.length)));
    else if (estado.modo === 'calendario') {
      const fch = (clave) => `<input type="date" value="${esc(estado[clave])}" onchange="SGADD_CICLOSADMIN.fijar('${clave}', this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink" />`;
      cuerpo = campo('Desde', fch('fdesde')) + campo('Hasta', fch('fhasta'));
    } else {
      cuerpo = `<div class="flex flex-wrap gap-2">${partidos.map(q => `<label class="flex items-center gap-2 rounded-md border border-hairline bg-surface2 px-2 py-1.5 text-[11px] text-ink cursor-pointer">
        <input type="checkbox" ${estado.ids.indexOf(String(q.id)) !== -1 ? 'checked' : ''} onchange="SGADD_CICLOSADMIN.alternarPartido('${escJs(q.id)}')" />
        ${esc(q.fecha)} · ${esc(q.rival)} · ${esc(q.final.join('-'))}</label>`).join('')}</div>`;
    }
    return `<div class="rend-card" style="grid-column:1/-1">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Ventana del ciclo</h3>
      <div class="inline-flex flex-wrap rounded-md border border-hairline overflow-hidden mb-3" role="group" aria-label="Cómo se elige la ventana">
        ${MODOS.map(([id, txt, ayuda]) => `<button type="button" onclick="SGADD_CICLOSADMIN.modo('${id}')" aria-pressed="${estado.modo === id}" title="${esc(ayuda)}"
          class="px-3 py-2 text-[11px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset ${estado.modo === id ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}">${txt}</button>`).join('')}
      </div>
      <div class="flex flex-wrap items-end gap-3">${cuerpo}</div>
      <p class="text-[11px] text-muted mt-2">${partidos.length} partidos validados en el paquete. El rango de fechas que termina en el futuro queda como ciclo abierto.</p>
    </div>`;
  }

  function bloqueAuditoria(v) {
    const glifo = { ok: '✓', aviso: '▲', error: '✕' };
    const loc = v.ciclo.resultados.partidos.filter(q => q.condicion === 'LOCAL').length;
    const p = (estado.paq && estado.paq.partidos) || {};
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Auditoría del corte · ${v.auditoria.apto ? 'apto' : 'con errores'}</h3>
      <ul class="space-y-1 text-xs text-ink">${v.auditoria.items.map(i => `<li class="${i.nivel === 'error' ? 'text-accent' : ''}"><span aria-hidden="true">${glifo[i.nivel] || '·'}</span> <b>${i.nivel === 'error' ? 'Error' : i.nivel === 'aviso' ? 'Aviso' : 'OK'}</b> · ${esc(i.texto)}</li>`).join('')}</ul>
      <p class="text-[11px] text-muted mt-2">Localía del corte: ${loc} de local · ${v.ciclo.resultados.partidos.length - loc} de visitante. Disponibilidad del paquete: ${((p.validados || 0) || CI.partidosDe(estado.paq).length)} validados, ${(p.parciales || []).length} con validación parcial y ${(p.excluidos || []).length} excluidos.</p>
    </div>`;
  }

  function bloqueLecturas(v) {
    const publicado = v.doc && v.doc.estado === 'publicado';
    return `<div class="rend-card" style="grid-column:1/-1">
      <div class="flex flex-wrap items-baseline gap-x-3 mb-1"><h3 class="font-display uppercase tracking-wide text-sm text-ink">Lecturas de texto</h3>
        <span class="text-[11px] text-muted">Se editan las palabras, no los números: esos salen del paquete y el servidor los recalcula.</span></div>
      <div class="grid gap-3 mt-2">${CI.LECTURAS.map(l => `<label class="block">
        <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(l.titulo)}</span>
        <textarea rows="3" maxlength="${CI.MAX_LECTURA}" ${publicado ? 'disabled' : ''} oninput="SGADD_CICLOSADMIN.editar('${l.id}', this.value)"
          class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink leading-snug focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">${esc(textoDe(v, l.id))}</textarea></label>`).join('')}</div>
    </div>`;
  }

  const fallidosDe = (doc) => ((doc && doc.envio && doc.envio.fallidos) || []);
  function envioTexto(doc) {
    const en = doc && doc.envio;
    if (!en) return '';
    const f = fallidosDe(doc);
    return ' PDF enviado el ' + esc(String(en.fecha || '').slice(0, 16).replace('T', ' ')) + ' a ' + (en.a || []).length + ' mail(s)'
      + (f.length ? ' · <b>no llegó a ' + f.map(x => esc(x.email)).join(', ') + '</b>' : '') + '.';
  }

  function bloqueEstado(v) {
    const e = (v.doc && v.doc.estado) || 'borrador';
    const dirty = sucio(v);
    const btn = (accion, txt, ok, prim) => `<button type="button" ${ok && !estado.trabajando ? '' : 'disabled'} onclick="SGADD_CICLOSADMIN.accion('${accion}')"
      class="px-3 py-2 rounded-md text-xs font-semibold border border-hairline transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${prim ? 'bg-accent text-base' : 'text-ink hover:bg-surface2'} disabled:opacity-40 disabled:cursor-not-allowed">${txt}</button>`;
    const hist = ((v.doc && v.doc.historial) || []).slice().reverse().slice(0, 6);
    return `<div class="rend-card">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Estado · ${chipEstado(e)}</h3>
      <p class="text-[11px] text-muted mb-3">${e === 'publicado' ? 'Publicado: no se modifica.' + envioTexto(v.doc)
        : e === 'auditado' ? 'Auditado: listo para publicar. Si editás una lectura vuelve a borrador.'
        : 'Borrador: guardalo, auditalo y recién después se publica.'}${dirty ? ' <b>Hay cambios sin guardar.</b>' : ''}</p>
      <div class="flex flex-wrap gap-2">
        ${btn('guardar', 'Guardar borrador', e !== 'publicado' && dirty, false)}
        ${btn('auditar', 'Marcar como auditado', e === 'borrador' && v.auditoria.apto, false)}
        ${btn('reabrir', 'Reabrir como borrador', e === 'auditado', false)}
        ${btn('publicar', 'Publicar y Enviar Ciclo', e === 'auditado' && !dirty && v.ciclo.meta.cerrado, true)}
        ${e === 'publicado' && fallidosDe(v.doc).length ? btn('reintentar', 'Reintentar envíos fallidos (' + fallidosDe(v.doc).length + ')', true, true) : ''}
      </div>
      ${hist.length ? `<ul class="mt-3 space-y-0.5 text-[11px] text-muted">${hist.map(h => `<li>${esc(String(h.en).slice(0, 16).replace('T', ' '))} · ${esc(h.accion)} → ${esc(h.estado)}${h.nota ? ' · ' + esc(h.nota) : ''}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function cabecera(idx) {
    const lista = ((idx && idx.lista && idx.lista()) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <label class="block max-w-sm"><span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Equipo</span>
        <select onchange="SGADD_CICLOSADMIN.elegirEquipo(this.value)" class="bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm text-ink min-w-[12rem]">
          <option value="">Elegí un equipo…</option>
          ${lista.map(e => `<option value="${esc(e.nombre)}"${e.nombre === estado.equipo ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}
        </select></label>
    </div>`;
  }

  function html(idx) {
    let cuerpo;
    if (!estado.equipo) cuerpo = '<div class="rend-card"><p class="text-sm text-muted">Elegí un equipo para armar y gestionar sus ciclos.</p></div>';
    else if (estado.cargando) cuerpo = '<div class="rend-card"><p class="text-sm text-muted">Cargando el análisis del equipo…</p></div>';
    else if (estado.error) cuerpo = `<div class="rend-card"><p class="text-sm text-accent">No se pudo leer: ${esc(estado.error)}</p></div>`;
    else if (!estado.paq || !estado.paq.ciclos) cuerpo = '<div class="rend-card"><p class="text-sm text-muted">Todavía no hay ciclos para este equipo: el paquete no trae el bloque `ciclos`.</p></div>';
    else {
      const v = vista();
      cuerpo = selectorVentana() + (!v.ciclo
        ? '<div class="rend-card" style="grid-column:1/-1"><p class="text-sm text-muted">Esa ventana no tiene partidos. Ajustá el rango o la cantidad.</p></div>'
        : `<div class="rend-card" style="grid-column:1/-1"><div class="flex flex-wrap items-baseline gap-x-3"><h3 class="font-display uppercase tracking-wide text-sm text-ink">${esc(v.ciclo.meta.equipo || estado.equipo)} · ${esc(v.ciclo.meta.desde)} al ${esc(v.ciclo.meta.hasta)}</h3>
            <span class="text-xs text-muted">${v.ciclo.meta.partidos} partidos · ${v.ciclo.resultados.record.g}-${v.ciclo.resultados.record.p}${v.ciclo.meta.cerrado ? '' : ' · <b>ventana abierta</b>'}</span></div></div>`
          + bloqueAuditoria(v) + bloqueEstado(v) + bloqueLecturas(v));
    }
    return `<div class="space-y-5">${cabecera(idx)}${estado.aviso ? `<div class="card rounded-xl p-3 border border-hairline text-xs text-ink" role="status">${esc(estado.aviso)}</div>` : ''}<div class="rend-grid">${cuerpo}</div></div>`;
  }

  /* ---------------------------------------------------------- carga / acciones */

  function repintar() { if (typeof SGADD_COMPUI !== 'undefined' && SGADD_COMPUI.pintar) SGADD_COMPUI.pintar(); }
  function contexto() {
    const club = (typeof CLUB !== 'undefined' && CLUB.estado) ? CLUB.estado.id : null;
    const pl = (typeof SGADD !== 'undefined' && typeof SGADD_APP !== 'undefined')
      ? ((SGADD.CATALOGO.planillas || []).filter(x => x.id === SGADD_APP.estado.planillaId)[0]) : null;
    return { club, slug: pl && pl.slug };
  }

  /** Pide el paquete y los documentos del equipo elegido, una vez por equipo. */
  function montar() {
    const eq = estado.equipo;
    if (!eq || estado.paqDe === eq || typeof SGADD_PBP === 'undefined' || !SGADD_PBP.pedir) return;
    estado.paqDe = eq; estado.cargando = true; estado.error = null; estado.paq = null; estado.docs = [];
    const c = contexto();
    const docs = (typeof SGADD_DATA !== 'undefined' && SGADD_DATA.ciclosGestion && c.club && c.slug)
      ? SGADD_DATA.ciclosGestion(c.club, c.slug, eq).catch(() => []) : Promise.resolve([]);
    Promise.all([SGADD_PBP.pedir(eq), docs]).then(([p, d]) => { if (estado.equipo === eq) { estado.paq = p; estado.docs = d; estado.cargando = false; repintar(); } })
      .catch((e) => { if (estado.equipo === eq) { estado.error = (e && e.message) || 'Sin conexión con el servidor.'; estado.cargando = false; repintar(); } });
  }

  function reiniciarDraft() { estado.draft = {}; }
  function elegirEquipo(n) { estado.equipo = n || null; estado.paqDe = null; estado.paq = null; estado.docs = []; estado.aviso = null; reiniciarDraft(); repintar(); }
  function modo(m) { if (MODOS.some(x => x[0] === m)) { estado.modo = m; reiniciarDraft(); repintar(); } }
  function fijar(clave, valor) { if (clave in estado) { estado[clave] = valor; reiniciarDraft(); repintar(); } }
  function alternarPartido(id) {
    const i = estado.ids.indexOf(String(id));
    if (i === -1) estado.ids.push(String(id)); else estado.ids.splice(i, 1);
    reiniciarDraft(); repintar();
  }
  /** Tipear NO repinta: el texto queda en `draft`. */
  function editar(id, valor) { if (CI.LECTURAS.some(l => l.id === id)) estado.draft[id] = String(valor); }

  function enviar(pedido) {
    const c = contexto();
    estado.trabajando = true;
    return SGADD_DATA.ciclosGestionar(c.club, c.slug, Object.assign({ equipo: estado.equipo, criterio: criterio() }, pedido))
      .then((r) => { estado.docs = estado.docs.filter(d => d.campo !== (r.doc && r.doc.campo)).concat(r.doc ? [r.doc] : []); return r; });
  }

  function accion(a) {
    const v = vista();
    if (!v || !v.ciclo || estado.trabajando) return;
    const hecho = (msg) => { estado.aviso = msg; estado.trabajando = false; reiniciarDraft(); repintar(); };
    const fallo = (e) => { estado.aviso = 'No se pudo: ' + ((e && e.message) || 'error'); estado.trabajando = false; repintar(); };
    const lecturas = {};
    CI.LECTURAS.forEach(l => { lecturas[l.id] = textoDe(v, l.id); });
    const nombres = { guardar: 'Borrador guardado.', auditar: 'Marcado como auditado.', reabrir: 'Vuelve a borrador.', publicar: 'Ciclo publicado y enviado.' };
    const correr = () => {
      let p = Promise.resolve();
      if (a === 'guardar' || (sucio(v) && (a === 'auditar'))) p = enviar({ accion: 'guardar', lecturas });
      if (a !== 'guardar') p = p.then(() => enviar({ accion: a }));
      return p.then(() => hecho(nombres[a])).catch(fallo);
    };
    if (a === 'publicar' || a === 'reintentar') {
      /* Primero un ENSAYO: compila el PDF y dice a quién saldría. Recién con eso a la vista se confirma. */
      const c = contexto();
      const pedido = { equipo: estado.equipo, criterio: criterio(), reintentar: a === 'reintentar' };
      estado.trabajando = true; estado.aviso = 'Compilando el PDF y preparando el envío…'; repintar();
      SGADD_DATA.ciclosPublicar(c.club, c.slug, Object.assign({ ensayo: true }, pedido)).then((r) => {
        estado.trabajando = false; estado.aviso = null; repintar();
        SGADD_CONFIRMAR.abrir({
          titulo: a === 'reintentar' ? 'Reintentar los envíos' : 'Publicar y enviar el ciclo', confirmar: a === 'reintentar' ? 'Reintentar' : 'Publicar y enviar',
          aviso: 'Un ciclo publicado no se modifica. Se manda el PDF a cada mail del padrón de acceso del club.',
          cambios: [{ label: 'Equipo', antes: '—', despues: estado.equipo },
            { label: 'Ventana', antes: 'auditado', despues: `${v.ciclo.meta.desde} al ${v.ciclo.meta.hasta} · publicado` },
            { label: 'Se envía a', antes: '—', despues: r.destinatarios.join(', ') },
            { label: 'Adjunto', antes: '—', despues: `${r.archivo} (${Math.round(r.pdfBytes / 1024)} KB)` }],
          alConfirmar: () => {
            estado.trabajando = true;
            return SGADD_DATA.ciclosPublicar(c.club, c.slug, pedido).then((res) => {
              if (res.doc) estado.docs = estado.docs.filter(d => d.campo !== res.doc.campo).concat([res.doc]);
              hecho('Enviado a ' + (res.enviados || []).length + ' mail(s)' + ((res.fallidos || []).length ? '; fallaron ' + res.fallidos.map(x => x.email).join(', ') : '') + '.');
            }).catch(fallo);
          },
        });
      }).catch((e) => {
        const pdfMal = e && /^PDF_/.test(e.codigo || '');
        estado.trabajando = false;
        estado.aviso = 'No se pudo preparar la publicación: ' + ((e && e.message) || 'error') + (pdfMal ? ' · Plan B: node server/bin/ciclos.js publicar --enviar desde tu máquina.' : '');
        repintar();
      });
    } else correr();
  }

  return { estado, html, montar, vista, criterio, textoDe, sucio, elegirEquipo, modo, fijar, alternarPartido, editar, accion, MODOS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CICLOSADMIN;
