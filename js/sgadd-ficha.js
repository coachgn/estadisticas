/* =====================================================================
   SGADD · Ficha individual del jugador (PDF)

   La cuarta exportación. Las otras tres hablan de EQUIPOS —el informe
   pre-partido, el scouting del rival, el post-partido—; esta es la hoja
   que el DT se lleva a la charla con UN jugador: qué tipo de jugador es,
   dónde está por encima y por debajo de su liga, y qué le pide el cuerpo
   técnico.

   Mismo enfoque que las otras: `window.print()` + `@media print`, nada de
   html2pdf/jsPDF (los canvas de Chart.js no rasterizan bien y los cortes
   de página quedan en el medio de las tablas).

   HOJA A4 VERTICAL, y no la A3 apaisada de los otros dos informes largos:
   una ficha personal se imprime, se dobla y se lleva. Es el mismo criterio
   por el que el post-partido también es vertical.

   Los bloques NO se reescriben: se reusan los mismos `jugadoresTab()` que
   pinta la pantalla. Si mañana el tab Tiro cambia, cambia en los dos lados
   — que es justo el problema que tuvo el proyecto cuando el rol funcional
   vivía duplicado en dos módulos.
   ===================================================================== */

const SGADD_FICHA = (function () {
  'use strict';

  /* `tab` mapea al id de JUGADORES_TABS. La ficha de identidad no es un tab:
     es el encabezado con los KPIs y el ADN, y va siempre. */
  const SECCIONES = [
    { id: 'general',   label: 'Perfil, ADN y percentiles', tab: 'general',   pre: true },
    { id: 'tiro',      label: 'De dónde anota',            tab: 'tiro',      pre: true },
    { id: 'evolucion', label: 'Evolución partido a partido', tab: 'evolucion', pre: true },
    { id: 'partidos',  label: 'Log de partidos',           tab: 'partidos',  pre: false },
  ];

  let seleccion = null;

  function elegidas() {
    if (seleccion) return seleccion;
    seleccion = {};
    SECCIONES.forEach(x => { seleccion[x.id] = x.pre; });
    return seleccion;
  }

  function jugadorActual() {
    const idx = SGADD_APP.estado.idx;
    if (!idx || typeof JUGADORES === 'undefined' || !JUGADORES.jugador) return null;
    const j = jugadoresBuscar(idx, JUGADORES.jugador);
    return j ? { idx: idx, j: j } : null;
  }

  /* ---------------------------------------------------------------------
     MODAL · qué entra en la hoja

     El log de partidos va DESTILDADO por defecto: con 13 fechas se lleva
     media hoja y la charla con el jugador arranca por el perfil, no por la
     planilla. El DT lo tilda cuando quiere revisar noche por noche.
     --------------------------------------------------------------------- */
  function abrir() {
    const ctx = jugadorActual();
    if (!ctx) return;
    const sel = elegidas();

    const items = SECCIONES.map(x => {
      const hay = jugadoresTabDisponible(ctx.idx, ctx.j, x.tab);
      return `
      <label class="flex items-center gap-2.5 py-1.5 rounded px-2 -mx-2 transition-all duration-200
                    ${hay ? 'cursor-pointer hover:bg-surface2' : 'opacity-40'}">
        <input type="checkbox" data-sec="${SGADD_UI.esc(x.id)}" ${sel[x.id] && hay ? 'checked' : ''}
               ${hay ? '' : 'disabled'} class="w-4 h-4" style="accent-color:var(--acento)">
        <span class="text-sm text-white">${SGADD_UI.esc(x.label)}</span>
        ${hay ? '' : '<span class="text-[10px] text-muted">sin datos suficientes</span>'}
      </label>`;
    }).join('');

    const previo = document.getElementById('modalFicha');
    if (previo) previo.remove();

    const m = document.createElement('div');
    m.id = 'modalFicha';
    m.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    m.innerHTML = `
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="SGADD_FICHA.cerrar()"></div>
      <div class="relative card rounded-xl border border-hairline p-5 w-full max-w-md" role="dialog" aria-modal="true"
           aria-labelledby="modalFichaTitulo">
        <h3 id="modalFichaTitulo" class="font-display uppercase tracking-wide text-sm text-accent mb-1">Ficha del jugador · PDF</h3>
        <p class="text-xs text-muted mb-3">${SGADD_UI.esc(ctx.j['NOMBRES'])} · ${SGADD_UI.esc(SGADD.limpiarNombre(ctx.j['EQUIPO']))}</p>
        <div class="mb-4">${items}</div>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="SGADD_FICHA.cerrar()"
            class="text-xs uppercase tracking-wider px-3 py-2 rounded border border-hairline hover:bg-surface2">Cancelar</button>
          <button type="button" onclick="SGADD_FICHA.generar()"
            class="text-xs uppercase tracking-wider px-3 py-2 rounded bg-accent text-base font-semibold">Generar</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    document.addEventListener('keydown', escapar);
  }

  function escapar(e) { if (e.key === 'Escape') cerrar(); }

  function cerrar() {
    const m = document.getElementById('modalFicha');
    if (m) m.remove();
    document.removeEventListener('keydown', escapar);
  }

  /* ---------------------------------------------------------------------
     GENERACIÓN
     --------------------------------------------------------------------- */
  function generar() {
    const ctx = jugadorActual();
    if (!ctx) { cerrar(); return; }

    document.querySelectorAll('#modalFicha input[data-sec]').forEach(i => {
      elegidas()[i.dataset.sec] = i.checked;
    });
    cerrar();

    const previo = document.getElementById('fichaSalida');
    if (previo) previo.remove();

    const salida = document.createElement('div');
    salida.id = 'fichaSalida';
    salida.innerHTML = armar(ctx.idx, ctx.j);
    document.body.appendChild(salida);

    /* La clase va ANTES de dibujar: los colores de Chart.js se resuelven al
       crear el gráfico, y `modo-ficha-print` tiene que estar en MODOS_PAPEL
       para que las etiquetas salgan oscuras sobre el papel blanco. */
    document.body.classList.add('modo-ficha-print');
    if (typeof SGADD_CHARTS !== 'undefined') SGADD_CHARTS.dibujarPendientes();

    /* Al imprimir, el navegador vuelve a resolver el `src` de cada <img> y
       cualquier fallo ahí deja el escudo afuera del PDF sin avisar. */
    SGADD_UI.embeberImagenes('#fichaSalida');

    /* La limpieza cuelga de `afterprint` y NO de un setTimeout ciego: si el
       diálogo tarda en abrir, la hoja se borraba a sí misma antes de
       imprimirse. El timeout queda de respaldo por si `afterprint` no llega
       (pasa al cancelar en algunos navegadores). */
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
    document.body.classList.remove('modo-ficha-print');
    SGADD_UI.restaurarImagenes('#fichaSalida');
    const s = document.getElementById('fichaSalida');
    if (s) s.remove();
    if (typeof jugadoresPintar === 'function') jugadoresPintar();
  }

  /* ---------------------------------------------------------------------
     ARMADO
     --------------------------------------------------------------------- */
  function armar(idx, j) {
    const sel = elegidas();
    const pl = SGADD_APP.planillaActual();
    const club = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : {};
    const fecha = SGADD_UI.fechaHoy();
    const adn = jugadoresADN(idx, j);
    const rolMin = adn.rolMinutos;
    const stat = idx.statJugador(j.__clave, 'PTS');
    const logo = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(j['EQUIPO']) : null;

    const bloques = [];

    /* --- Portada. El escudo con respaldo de iniciales: sin él, un club sin
       manifiesto de logos imprime la ficha sin ninguna marca de equipo. --- */
    const escudo = logo
      ? `<img src="${SGADD_UI.esc(logo)}" alt="" class="ficha-escudo">`
      : `<span class="escudo-iniciales">${SGADD_UI.esc(
          (typeof LOGOS !== 'undefined') ? LOGOS.iniciales(j['EQUIPO']) : String(j['EQUIPO'] || '').slice(0, 2))}</span>`;

    bloques.push(`
      <header class="informe-cabecera ficha-cabecera">
        <div class="ficha-cabecera-fila">
          ${escudo}
          <div>
            <h1>${SGADD_UI.esc(j['NOMBRES'])}</h1>
            <p>${SGADD_UI.esc(SGADD.limpiarNombre(j['EQUIPO']))} ·
               ${SGADD_UI.esc(rolMin ? rolMin.label + ' · ' + rolMin.rol : '')}</p>
            <p>Fecha de emisión: ${SGADD_UI.esc(fecha)} · Competición: ${SGADD_UI.esc(pl ? pl.label : '—')}
               · ${SGADD_UI.esc(club.nombre || '')}</p>
          </div>
        </div>
      </header>`);

    /* --- Identidad: los cuatro KPIs y la consistencia. Va SIEMPRE: es lo
       que define de quién es la hoja. --- */
    const kpis = ['PTS', 'MIN', 'eFG%', 'USG%']
      .map(k => SGADD_UI.statCard(jugadoresLeer(idx, j, k))).join('');
    bloques.push(`
      <section class="informe-bloque">
        <h2>Identidad</h2>
        <p class="informe-pregunta">${SGADD_UI.esc(adn.jerarquia.emoji + ' ' + adn.jerarquia.label +
          (stat ? ' · consistencia en PTS: ' + stat.media.toFixed(1) + ' ± ' + stat.desvio.toFixed(1) + ' en ' + stat.n + ' PJ' : ''))}</p>
        <div class="grid grid-cols-4 gap-3">${kpis}</div>
        ${j.__califica ? '' : `<p class="ficha-aviso">~ ${SGADD_UI.esc(JUGADORES_MOTIVO_SIN_RESPALDO)}</p>`}
      </section>`);

    /* --- Los tabs elegidos, con el MISMO render de la pantalla --- */
    SECCIONES.filter(x => sel[x.id] && jugadoresTabDisponible(idx, j, x.tab)).forEach(x => {
      const def = JUGADORES_TABS.find(t => t.id === x.tab);
      bloques.push(`
        <section class="informe-bloque" data-bloque="${SGADD_UI.esc(x.id)}">
          <h2>${SGADD_UI.esc(x.label)}</h2>
          ${def ? `<p class="informe-pregunta">${SGADD_UI.esc(def.pregunta)}</p>` : ''}
          ${jugadoresTab(idx, j, x.tab)}
        </section>`);
    });

    /* El pie es la firma del PRODUCTO, compartida por las cuatro
       exportaciones. El nombre del cliente ya viaja en el encabezado. */
    bloques.push(`<footer class="informe-pie">${SGADD_UI.pieInforme(fecha)}</footer>`);

    return bloques.join('');
  }

  return { SECCIONES, abrir, cerrar, generar, elegidas };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_FICHA;
