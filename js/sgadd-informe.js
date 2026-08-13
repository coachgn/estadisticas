/* =====================================================================
   SGADD · Informe Pre-Partido (PDF)

   Usa window.print() + @media print en vez de html2pdf/jsPDF. Razón: los
   canvas de Chart.js no se rasterizan bien con esas librerías, los cortes
   de página quedan en el medio de las tablas y los colores del tema oscuro
   salen mal. El navegador ya tiene un motor de PDF que resuelve todo eso;
   solo hay que decirle qué ocultar y dónde puede cortar.

   Flujo:
     1. Botón en el header de Equipos
     2. Modal: qué secciones incluir + rival opcional
     3. Se renderizan los tabs elegidos en un contenedor oculto
     4. body.modo-impresion → el CSS de print hace el resto
     5. window.print() → el usuario elige "Guardar como PDF"
     6. Se limpia todo al volver
   ===================================================================== */

const SGADD_INFORME = (function () {
  'use strict';

  /* `tab` mapea al id de EQUIPOS_TABS. `virtual` son bloques que no son un
     tab completo sino una parte (el arquetipo sin los ejes, por ejemplo). */
  const SECCIONES = [
    { id: 'ficha',       label: 'Ficha general y arquetipo', tab: null, virtual: 'ficha', pre: true },
    { id: 'insight',     label: 'Insight clave · patrón de victorias', tab: null, virtual: 'insight', pre: true },
    { id: 'personalidad',label: '8 ejes de personalidad', tab: 'personalidad', pre: true },
    { id: '4factores',   label: '4 Factores', tab: '4factores', pre: true },
    { id: 'condicion',   label: 'Local / Visitante', tab: 'condicion', pre: true },
    { id: 'ofensiva',    label: 'Ofensiva', tab: 'ofensiva', pre: false },
    { id: 'defensiva',   label: 'Defensiva', tab: 'defensiva', pre: false },
    { id: 'plantel',     label: 'Plantel y minutaje', tab: 'plantel', pre: true },
    { id: 'partidos',    label: 'Partidos y racha', tab: 'partidos', pre: false },
  ];

  let seleccion = null;

  function elegidas() {
    if (seleccion) return seleccion;
    seleccion = {};
    SECCIONES.forEach(x => { seleccion[x.id] = x.pre; });
    return seleccion;
  }

  /* ---------------------------------------------------------------------
     MODAL
     --------------------------------------------------------------------- */
  function abrir() {
    const sel = elegidas();
    const hoy = new Date();
    const fecha = String(hoy.getDate()).padStart(2, '0') + '/' +
      String(hoy.getMonth() + 1).padStart(2, '0') + '/' + hoy.getFullYear();

    const items = SECCIONES.map(x => `
      <label class="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-surface2 rounded px-2 -mx-2 transition-all duration-200">
        <input type="checkbox" data-sec="${x.id}" ${sel[x.id] ? 'checked' : ''}
               class="w-4 h-4 accent-current" style="accent-color:var(--acento)">
        <span class="text-sm text-white">${SGADD_UI.esc(x.label)}</span>
      </label>`).join('');

    const cont = document.createElement('div');
    cont.id = 'modalInforme';
    cont.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    cont.innerHTML = `
      <div class="absolute inset-0 bg-black/70" onclick="SGADD_INFORME.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <h3 class="font-display uppercase tracking-wide text-base mb-1" style="color:#fff">Generar informe PDF</h3>
        <p class="text-[11px] dato-sec mb-4">Elegí qué incluir. Se abre el diálogo de impresión: elegí "Guardar como PDF".</p>

        <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Rival (opcional)</label>
        <input id="informeRival" type="text" placeholder="Ej: Atenas 'A'"
               class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm mb-4
                      focus:border-accent outline-none" style="color:#fff">

        <p class="text-[11px] uppercase tracking-wider text-muted font-display mb-1">Secciones</p>
        <div class="mb-4">${items}</div>

        <div class="flex items-center justify-between gap-3 pt-3 border-t border-hairline">
          <button onclick="SGADD_INFORME.marcarTodas()"
            class="text-[11px] uppercase tracking-wider dato-sec hover:text-white transition-all duration-200">
            Marcar todas
          </button>
          <div class="flex gap-2">
            <button onclick="SGADD_INFORME.cerrar()"
              class="text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-4 py-2
                     hover:bg-surface2 transition-all duration-200" style="color:#fff">Cancelar</button>
            <button onclick="SGADD_INFORME.generar()"
              class="text-xs font-semibold uppercase tracking-wider bg-accent text-base rounded px-4 py-2
                     hover:bg-accentdeep transition-all duration-200">Generar</button>
          </div>
        </div>
        <p class="text-[10px] dato-sec mt-3">Fecha de emisión: ${fecha}</p>
      </div>`;
    document.body.appendChild(cont);
    const inp = document.getElementById('informeRival');
    if (inp) inp.focus();
    document.addEventListener('keydown', escapar);
  }

  function escapar(e) { if (e.key === 'Escape') cerrar(); }

  function cerrar() {
    const m = document.getElementById('modalInforme');
    if (m) m.remove();
    document.removeEventListener('keydown', escapar);
  }

  function marcarTodas() {
    document.querySelectorAll('#modalInforme input[data-sec]').forEach(i => { i.checked = true; });
  }

  /* ---------------------------------------------------------------------
     GENERACIÓN
     --------------------------------------------------------------------- */
  function generar() {
    const idx = SGADD_APP.estado.idx;
    const e = EQUIPOS.equipo ? idx.get(EQUIPOS.equipo.replace(/-/g, ' ')) : null;
    if (!idx || !e) { cerrar(); return; }

    document.querySelectorAll('#modalInforme input[data-sec]').forEach(i => {
      elegidas()[i.dataset.sec] = i.checked;
    });
    const rival = (document.getElementById('informeRival') || {}).value || '';
    cerrar();

    const previo = document.getElementById('informeSalida');
    if (previo) previo.remove();

    const salida = document.createElement('div');
    salida.id = 'informeSalida';
    salida.innerHTML = armar(idx, e, rival);
    document.body.appendChild(salida);

    document.body.classList.add('modo-impresion');

    /* Los canvas se dibujan recién después del innerHTML, y para que no
       salgan borrosos en papel hay que forzar más resolución. */
    if (typeof SGADD_CHARTS !== 'undefined') SGADD_CHARTS.dibujarPendientes();

    /* Los escudos se serializan a `data:` URI: al imprimir, el navegador
       vuelve a resolver el `src` de cada <img> y cualquier fallo ahí los
       deja afuera del PDF sin avisar. Misma utilidad que las otras dos
       exportaciones. */
    SGADD_UI.embeberImagenes('#informeSalida');

    /* La limpieza cuelga de `afterprint`, NO de un setTimeout ciego.

       Antes era `setTimeout(limpiar, 400)` disparado justo después de
       `window.print()`: si el diálogo de impresión tardaba en abrir —o si el
       navegador no bloquea en `print()`, que es lo que pasa al generar el PDF
       por automatización— el informe se borraba a sí mismo ANTES de que se
       imprimiera y salía la app en vez del informe. Medido: capturando a los
       3,5 s no quedaba nada de `#informeSalida`.

       El timeout queda solo como red de seguridad por si `afterprint` no
       llega (pasa en algunos navegadores al cancelar), con margen de sobra. */
    setTimeout(() => {
      const alTerminar = () => {
        window.removeEventListener('afterprint', alTerminar);
        clearTimeout(respaldo);
        limpiar();
      };
      window.addEventListener('afterprint', alTerminar);
      const respaldo = setTimeout(alTerminar, 60000);
      window.print();
    }, 700);
  }

  function limpiar() {
    document.body.classList.remove('modo-impresion');
    SGADD_UI.restaurarImagenes('#informeSalida');
    const s = document.getElementById('informeSalida');
    if (s) s.remove();
    if (typeof equiposPintar === 'function') equiposPintar();
  }

  function armar(idx, e, rival) {
    const sel = elegidas();
    const p = (typeof SGADD_PERSONALIDAD !== 'undefined') ? SGADD_PERSONALIDAD.perfil(idx, e) : null;
    const pl = SGADD_APP.planillaActual();
    const club = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : {};
    const hoy = new Date();
    const fecha = String(hoy.getDate()).padStart(2, '0') + '/' +
      String(hoy.getMonth() + 1).padStart(2, '0') + '/' + hoy.getFullYear();
    const rec = e.record || { ganados: 0, perdidos: 0 };

    const bloques = [];

    /* --- Portada --- */
    bloques.push(`
      <header class="informe-cabecera">
        <h1>Informe pre-partido · ${SGADD_UI.esc(e.nombre)}${rival ? ' vs ' + SGADD_UI.esc(rival) : ''}</h1>
        <p>Fecha de emisión: ${fecha} · Competición: ${SGADD_UI.esc(pl ? pl.label : '—')}
           · ${SGADD_UI.esc(club.nombre || '')}</p>
        <p>Récord ${rec.ganados}-${rec.perdidos} · ${idx.liga.n} equipos en la liga · PJ ${e.pj || 0}</p>
      </header>`);

    /* --- Ficha y arquetipo --- */
    if (sel.ficha) {
      const kpis = ['NET RTNG', 'RTNG OFF', 'RTNG DEF', 'eFG%']
        .map(k => SGADD_UI.statCard(idx.leer(e.clave, k), { ranking: idx.ranking(e.clave, k) })).join('');
      bloques.push(`
        <section class="informe-bloque">
          <h2>Ficha general</h2>
          ${p ? `<div class="informe-arquetipo">
            <p class="informe-arquetipo-titulo">${SGADD_UI.esc(p.arquetipo.titulo)}</p>
            <p>${SGADD_UI.esc(p.arquetipo.frase)}</p>
          </div>` : ''}
          <div class="grid grid-cols-4 gap-3">${kpis}</div>
        </section>`);
    }

    /* --- Insight: lo más valioso, va temprano --- */
    if (sel.insight && p && p.insight) {
      bloques.push(`<section class="informe-bloque"><h2>Patrón de las victorias</h2>
        ${equiposInsight(p.insight)}</section>`);
    }

    /* --- Tabs --- */
    SECCIONES.filter(x => x.tab && sel[x.id]).forEach(x => {
      const def = EQUIPOS_TABS.find(t => t.id === x.tab);
      bloques.push(`
        <section class="informe-bloque">
          <h2>${SGADD_UI.esc(x.label)}</h2>
          ${def ? `<p class="informe-pregunta">${SGADD_UI.esc(def.pregunta)}</p>` : ''}
          ${equiposTab(idx, e, x.tab)}
        </section>`);
    });

    bloques.push(`<footer class="informe-pie">
      ${SGADD_UI.esc((typeof CLUB !== 'undefined' && CLUB.credito) ? CLUB.credito() : 'SGADD')} ·
      Generado el ${fecha}
    </footer>`);

    return bloques.join('');
  }

  return { SECCIONES, abrir, cerrar, generar, marcarTodas, elegidas };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_INFORME;
