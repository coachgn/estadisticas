/* =====================================================================
   SGADD · Estado global

   El selector de planilla y fase deja de vivir dentro de cada sección.
   Es UNA decisión del usuario ("qué categoría estoy mirando") que atraviesa
   todo el dashboard: si elegís U21 en Principal y vas a Equipos, seguís en
   U21. Antes cada sección tenía su propio selector y su propia copia.

   La planilla también viaja en el hash, así que un link comparte la
   categoría además de la sección.
   ===================================================================== */

const SGADD_APP = (function () {
  'use strict';

  const estado = {
    planillaId: null,
    fase: 'REGULAR',
    hojas: null,
    idx: null,
    cargando: false,
    error: null,
  };

  const suscriptores = [];

  function onCambio(fn) { suscriptores.push(fn); }
  function avisar() { suscriptores.forEach(fn => { try { fn(estado); } catch (e) { console.error(e); } }); }

  function planillaActual() { return SGADD.planilla(estado.planillaId); }

  function inicializar() {
    if (estado.planillaId) return;
    const r = SGADD.Ruta.parse(window.location.hash);
    const activas = SGADD.planillasVisibles({});
    estado.planillaId = (r.planilla && SGADD.planilla(r.planilla) && SGADD.planilla(r.planilla).activo)
      ? r.planilla
      : (activas.length ? activas[0].id : null);
    if (r.fase) estado.fase = r.fase;
  }

  /** Carga la planilla activa. Idempotente: si ya está, resuelve al toque. */
  async function cargar(forzar) {
    inicializar();
    const p = planillaActual();
    if (!p || !p.sheetId) { estado.error = 'Esa planilla todavía no tiene sheetId.'; avisar(); return; }
    if (estado.idx && !forzar) { avisar(); return; }

    estado.cargando = true; estado.error = null;
    avisar();
    try {
      if (forzar) SGADD.limpiarCache(p.sheetId);
      const { hojas } = await SGADD.cargarCategoria(p.sheetId);
      estado.hojas = hojas;
      const fases = SGADD.fasesDisponibles(hojas);
      if (fases.length && !fases.some(f => f.id === estado.fase)) estado.fase = fases[0].id;
      reindexar();
    } catch (e) {
      estado.error = e.message || String(e);
    } finally {
      estado.cargando = false;
      avisar();
    }
  }

  function reindexar() {
    if (!estado.hojas) return;
    estado.idx = SGADD.construirIndice(estado.hojas, { fase: estado.fase });
  }

  function cambiarPlanilla(id) {
    if (id === estado.planillaId) return;
    estado.planillaId = id;
    estado.hojas = null; estado.idx = null;
    // La capa de datos vieja también tiene que seguir al selector.
    if (typeof window !== 'undefined' && typeof window.onCategoriaCambiada === 'function') {
      window.onCategoriaCambiada(id);
    }
    cargar();
  }

  function cambiarFase(f) {
    if (f === estado.fase) return;
    estado.fase = f;
    reindexar();
    avisar();
  }

  function fases() {
    return estado.hojas ? SGADD.fasesDisponibles(estado.hojas) : [SGADD.FASES.REGULAR];
  }

  /* ---------------------------------------------------------------------
     Barra de selección. La pintan todas las secciones SGADD.
     --------------------------------------------------------------------- */
  function barra(opciones) {
    const o = opciones || {};
    const planillas = SGADD.CATALOGO.planillas;
    const p = planillaActual();

    const grupos = SGADD.agrupar(planillas, 'tira');
    let opts = '';
    grupos.forEach((lista, tira) => {
      const etiqueta = tira === 'null' || tira === '—'
        ? 'Otras'
        : ({ femenina: 'Femenina', negra: 'Masculina Negra', naranja: 'Masculina Naranja' })[tira] || tira;
      opts += `<optgroup label="${SGADD_UI.esc(etiqueta)}">` +
        lista.map(x => `<option value="${SGADD_UI.esc(x.id)}" ${x.id === estado.planillaId ? 'selected' : ''} ${x.activo ? '' : 'disabled'}>
          ${SGADD_UI.esc(x.label)}${x.activo ? '' : ' — sin datos'}</option>`).join('') +
        `</optgroup>`;
    });

    const info = estado.idx
      ? `${estado.idx.liga.n} equipos · ${estado.idx.liga.partidos} partidos · PJ mediano ${estado.idx.liga.pjMediano}`
      : (estado.cargando ? 'Cargando…' : '');

    return `
      <div class="card rounded-xl p-3 sm:p-4 border border-hairline">
        <div class="flex flex-col sm:flex-row sm:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Categoría</label>
            <select onchange="SGADD_APP.cambiarPlanilla(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${opts}
            </select>
          </div>
          <div class="sm:w-44">
            <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Fase</label>
            <select onchange="SGADD_APP.cambiarFase(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${fases().map(f => `<option value="${f.id}" ${f.id === estado.fase ? 'selected' : ''}>${SGADD_UI.esc(f.label)}</option>`).join('')}
            </select>
          </div>
          ${o.extra || ''}
        </div>
        ${info ? `<p class="text-[11px] text-muted mt-2 font-mono">${SGADD_UI.esc(p ? p.label : '')} · ${SGADD_UI.esc(info)}</p>` : ''}
      </div>`;
  }

  function avisoMuestra() {
    if (!estado.idx || estado.idx.liga.muestraSuficiente) return '';
    return SGADD_UI.aviso('Muestra insuficiente',
      'PJ mediano ' + estado.idx.liga.pjMediano + '. Con tan pocos partidos los percentiles no distinguen una debilidad estructural de un mal día.');
  }

  /* Cada sección se repinta sola cuando cambia la categoría o la fase. */
  onCambio(() => {
    if (typeof currentSection === 'undefined') return;
    if (currentSection === 'equipos' && typeof equiposPintar === 'function') equiposPintar();
  });

  return {
    estado, inicializar, cargar, reindexar, cambiarPlanilla, cambiarFase,
    planillaActual, fases, barra, avisoMuestra, onCambio,
    get idx() { return estado.idx; },
  };
})();
