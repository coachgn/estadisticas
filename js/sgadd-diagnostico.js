/* =====================================================================
   SGADD · Sección DIAGNÓSTICO
   Pinta el resultado de la Fase 0 dentro del index.html.

   Sirve para dos cosas:
     1. Ver que el núcleo funciona contra la planilla real.
     2. Cazar errores de datos ANTES de que aparezcan como guiones en
        una tarjeta sin explicación.

   Convive con la capa de datos vieja del index sin tocarla. Cuando las
   secciones migren a SGADD, la vieja se borra.
   ===================================================================== */

const SGADD_DIAG = {
  planillaId: null,
  fase: 'REGULAR',
  estado: 'inicial',   // inicial | cargando | listo | error
  equipoSel: null,
  datos: null,
};

function buildDiagnostico() {
  const planillas = SGADD.CATALOGO.planillas;
  const activas = planillas.filter(p => p.activo);
  const d = SGADD_DIAG;

  if (!d.planillaId && activas.length) d.planillaId = activas[0].id;

  const opciones = planillas.map(p => `
    <option value="${escapeAttr(p.id)}" ${p.id === d.planillaId ? 'selected' : ''} ${p.activo ? '' : 'disabled'}>
      ${escapeHtml(p.label)}${p.activo ? '' : ' — sin sheetId'}
    </option>`).join('');

  return `
    <section class="space-y-5">
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex flex-col sm:flex-row sm:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Planilla</label>
            <select id="diagPlanilla" onchange="diagCambiarPlanilla(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${opciones}
            </select>
          </div>
          <div class="sm:w-44">
            <label class="block text-[11px] uppercase tracking-wider text-muted font-display mb-1">Fase</label>
            <select id="diagFase" onchange="diagCambiarFase(this.value)"
              class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
              ${diagOpcionesFase()}
            </select>
          </div>
          <button onclick="diagCorrer(true)"
            class="shrink-0 text-xs font-semibold uppercase tracking-wider bg-accent text-base rounded px-5 py-2.5 hover:bg-accentdeep transition-colors">
            Correr
          </button>
        </div>
        <p class="text-[11px] text-muted mt-3">
          ${planillas.filter(p => p.activo).length} de ${planillas.length} planillas con sheetId cargado.
        </p>
      </div>

      <div id="diagResultado">
        ${d.estado === 'inicial' ? diagCartel('Elegí una planilla y apretá Correr.') : ''}
      </div>
    </section>`;
}

function diagOpcionesFase() {
  const d = SGADD_DIAG;
  const disponibles = (d.datos && d.datos.fases && d.datos.fases.length)
    ? d.datos.fases
    : [SGADD.FASES.REGULAR];
  return disponibles.map(f =>
    `<option value="${f.id}" ${f.id === d.fase ? 'selected' : ''}>${escapeHtml(f.label)}</option>`
  ).join('');
}

function diagCartel(txt, tono) {
  const color = tono === 'error' ? 'text-red-400' : (tono === 'ok' ? 'text-green-400' : 'text-muted');
  return `<div class="card rounded-xl p-8 border border-hairline text-center ${color} text-sm">${escapeHtml(txt)}</div>`;
}

function diagCambiarPlanilla(id) { SGADD_DIAG.planillaId = id; SGADD_DIAG.datos = null; diagCorrer(); }
function diagCambiarFase(f) { SGADD_DIAG.fase = f; diagPintar(); }

async function diagCorrer(forzar) {
  const d = SGADD_DIAG;
  const p = SGADD.planilla(d.planillaId);
  const cont = document.getElementById('diagResultado');
  if (!p || !p.sheetId) { if (cont) cont.innerHTML = diagCartel('Esa planilla todavía no tiene sheetId.', 'error'); return; }

  d.estado = 'cargando';
  if (cont) cont.innerHTML = diagCartel('Bajando las 9 hojas de ' + p.label + '…');

  try {
    if (forzar) SGADD.limpiarCache(p.sheetId);
    const t0 = performance.now();
    const { hojas, errores } = await SGADD.cargarCategoria(p.sheetId);
    const ms = Math.round(performance.now() - t0);

    d.datos = {
      hojas, erroresCarga: errores, ms,
      fases: SGADD.fasesDisponibles(hojas),
      /* El guard de TORNEO va en el mismo bloque que el contrato de esquema:
         también es un problema de contrato con el productor (MotorStats), no
         de coherencia entre hojas. Se concatena en vez de abrir una card
         nueva para no renumerar los bloques que el club ya conoce. */
      esquema: SGADD.validarEsquema(hojas).concat(SGADD.validarTorneo(hojas)),
      coherencia: SGADD.validarCoherencia(hojas),
      simetria: SGADD.testSimetria(hojas, d.fase),
      totales: SGADD.testTotales(hojas, d.fase),
      cruces: SGADD.testCrucePartidos(hojas, d.fase),
    };
    if (d.datos.fases.length && !d.datos.fases.some(f => f.id === d.fase)) d.fase = d.datos.fases[0].id;
    d.estado = 'listo';
    diagPintar();
  } catch (e) {
    d.estado = 'error';
    if (cont) cont.innerHTML = diagCartel('Falló la carga: ' + (e.message || e), 'error');
  }
}

function diagPintar() {
  const d = SGADD_DIAG;
  const cont = document.getElementById('diagResultado');
  if (!cont || !d.datos) return;

  const { hojas, erroresCarga, ms } = d.datos;
  d.datos.simetria = SGADD.testSimetria(hojas, d.fase);
  d.datos.totales = SGADD.testTotales(hojas, d.fase);
  d.datos.cruces = SGADD.testCrucePartidos(hojas, d.fase);
  const idx = SGADD.construirIndice(hojas, { fase: d.fase });

  const selFase = document.getElementById('diagFase');
  if (selFase) selFase.innerHTML = diagOpcionesFase();

  cont.innerHTML = [
    diagBloqueClub(),
    diagBloqueCarga(hojas, erroresCarga, ms),
    diagBloqueEsquema(d.datos.esquema),
    diagBloqueCoherencia(d.datos.coherencia),
    diagBloqueTotales(d.datos.totales, d.datos.cruces),
    diagBloqueSimetria(d.datos.simetria),
    diagBloqueIndice(idx),
    diagBloqueFicha(idx),
    diagBloqueEquipos(idx),
  ].join('');
}

/* --- 0. Config del club. Primero de todo: si esto está mal, lo demás miente. --- */
function diagBloqueClub() {
  const hay = (typeof CLUB !== 'undefined');
  const st = hay ? CLUB.estado : null;
  const ok = hay && st.cfg;

  const fila = (k, v, tono) => `<tr class="border-b border-hairline/40 last:border-0">
    <td class="py-1.5 pr-3 text-xs text-muted">${escapeHtml(k)}</td>
    <td class="py-1.5 font-mono text-xs ${tono || 'text-ink'}">${escapeHtml(String(v))}</td></tr>`;

  const filas = !hay
    ? fila('Módulo', 'sgadd-club.js NO cargó — el panel usa los valores por defecto', 'text-yellow-400')
    : [
        fila('Club en la URL', st.id || '(ninguno)'),
        fila('Archivo', st.url || 'clubes/' + st.id + '.json'),
        fila('Estado', ok ? 'cargado' : 'NO cargó — usando defaults', ok ? 'text-green-400' : 'text-yellow-400'),
        st.error ? fila('Error', st.error, 'text-red-400') : '',
        ok ? fila('Nombre', st.cfg.nombre) : '',
        ok ? fila('Color', CLUB.TEMA.acento) : '',
        fila('Equipo propio', String(SGADD.CATALOGO.patronEquipoPropio)),
        fila('Planillas', SGADD.CATALOGO.planillas.length + ' (' + SGADD.planillasVisibles({}).length + ' con datos)'),
        fila('Escudos', (typeof LOGOS !== 'undefined' ? (LOGOS.CFG.basePaths || []).join('  →  ') : '—')),
      ].join('');

  return diagCard('0 · Configuración del club',
    ok ? 'Personalizada' : (hay ? 'Valores por defecto' : 'Módulo ausente'),
    `<table class="w-full text-left"><tbody>${filas}</tbody></table>
     <p class="text-[11px] text-muted mt-3 leading-snug">
       El panel funciona sin este archivo: si no carga, usa los valores por defecto y nada se rompe.
       La fila <b>Escudos</b> muestra en qué carpetas busca, en orden.
     </p>
     <div class="mt-4 pt-3 border-t border-hairline">
       <p class="text-[11px] text-muted mb-2 leading-snug">
         Sin manifiesto, cada escudo se busca probando 8 extensiones en 2 carpetas: cientos de pedidos 404.
         Con manifiesto es uno solo. Generalo acá y subilo como
         <code class="text-ink">${escapeHtml((typeof LOGOS !== 'undefined' ? (LOGOS.CFG.basePaths || ['logos/'])[0] : 'logos/') + 'index.json')}</code>.
       </p>
       <button onclick="diagGenerarManifiesto()"
         class="text-xs font-semibold uppercase tracking-wider bg-accent text-base rounded px-4 py-2 hover:bg-accentdeep transition-colors">
         Generar index.json
       </button>
       <pre id="diagManifiesto" class="hidden mt-3 p-3 bg-surface2 rounded text-[11px] font-mono overflow-x-auto max-h-64"></pre>
     </div>`);
}

/* --- 1. Carga --- */
function diagBloqueCarga(hojas, errores, ms) {
  const leidas = Object.keys(hojas).length;
  const total = Object.keys(SGADD.ESQUEMA).length;
  const filas = Object.keys(SGADD.ESQUEMA).map(n => {
    const h = hojas[n];
    const err = errores.find(e => e.hoja === n);
    return `<tr class="border-b border-hairline/40">
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(n)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${h ? h.filas.length : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${h ? h.cols.length : '—'}</td>
      <td class="py-1.5 text-xs ${h ? 'text-green-400' : 'text-red-400'}">${h ? 'ok' : escapeHtml(err ? err.mensaje : 'no leída')}</td>
    </tr>`;
  }).join('');

  return diagCard('1 · Carga', `${leidas}/${total} hojas · ${ms} ms`, `
    <div class="scrollbox">
      <table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="pb-2 pr-3">Hoja</th><th class="pb-2 pr-3">Filas</th>
          <th class="pb-2 pr-3">Cols</th><th class="pb-2">Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <p class="text-[11px] text-muted mt-3">RANKINGS J y RANKINGS E no se bajan a propósito: son bloques apilados, GViz no las puede parsear.</p>`);
}

/* --- 2. Esquema --- */
function diagBloqueEsquema(problemas) {
  const errores = problemas.filter(p => p.nivel === 'error');
  const avisos = problemas.filter(p => p.nivel === 'aviso');

  if (!problemas.length) {
    return diagCard('2 · Contrato de esquema', 'Todo en orden',
      `<p class="text-sm text-green-400">Las 9 hojas tienen todas las columnas esperadas.</p>`);
  }
  const item = (p) => `
    <li class="flex gap-3 py-2 border-b border-hairline/40 last:border-0">
      <span class="shrink-0 w-1 rounded-full ${p.nivel === 'error' ? 'bg-red-400' : 'bg-yellow-400'}"></span>
      <div class="min-w-0">
        <p class="font-mono text-xs ${p.nivel === 'error' ? 'text-red-400' : 'text-yellow-400'}">${escapeHtml(p.hoja)}</p>
        <p class="text-xs text-muted break-words">${escapeHtml(p.mensaje)}</p>
      </div>
    </li>`;

  return diagCard('2 · Contrato de esquema',
    `${errores.length} error${errores.length === 1 ? '' : 'es'} · ${avisos.length} aviso${avisos.length === 1 ? '' : 's'}`,
    `<ul class="max-h-72 overflow-y-auto">${errores.concat(avisos).map(item).join('')}</ul>`);
}

/* --- 2b. Coherencia entre hojas --- */
function diagBloqueCoherencia(res) {
  const fallan = res.filter(r => r.nivel === 'error').length;
  const filas = res.map(r => {
    const color = r.nivel === 'ok' ? 'text-green-400' : 'text-red-400';
    return `<tr class="border-b border-hairline/40">
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(r.par)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.a}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.b}</td>
      <td class="py-1.5 text-xs ${color}">${escapeHtml(r.mensaje)}</td>
    </tr>`;
  }).join('');
  return diagCard('2b · Coherencia entre hojas',
    fallan ? fallan + ' desajuste(s)' : 'Todo cuadra',
    `<div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-2 pr-3">Par</th><th class="pb-2 pr-3">A</th>
        <th class="pb-2 pr-3">B</th><th class="pb-2"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3">Cada hoja de promedios y su acumulado tienen que traer las mismas filas. Cada partido, sus dos equipos.</p>`);
}

/* --- 3. Invariantes exactos --- */
function diagBloqueTotales(res, cruces) {
  const fallan = res.concat(cruces || []).filter(r => r.nivel === 'error').length;
  const filas = res.map(r => {
    const color = r.nivel === 'ok' ? 'text-green-400' : (r.nivel === 'error' ? 'text-red-400' : 'text-yellow-400');
    return `<tr class="border-b border-hairline/40">
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(r.par)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.propio !== undefined ? r.propio.toFixed(0) : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.rival !== undefined ? r.rival.toFixed(0) : '—'}</td>
      <td class="py-1.5 text-xs ${color}">${escapeHtml(r.mensaje)}</td>
    </tr>`;
  }).join('');
  return diagCard('3 · Invariantes exactos (totales)',
    fallan ? fallan + ' roto(s)' : 'Los totales cierran exacto',
    `<div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-2 pr-3">Invariante</th><th class="pb-2 pr-3">Σ A</th>
        <th class="pb-2 pr-3">Σ B</th><th class="pb-2"></th>
      </tr></thead><tbody>${filas}</tbody></table></div>
    <h5 class="font-display uppercase tracking-wide text-xs text-accent mt-5 mb-2">Cruce partido por partido</h5>
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-2 pr-3">Columna</th><th class="pb-2 pr-3">Partidos</th>
        <th class="pb-2 pr-3">Fallan</th><th class="pb-2"></th>
      </tr></thead><tbody>${(cruces || []).map(c => `
        <tr class="border-b border-hairline/40">
          <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(c.par)}</td>
          <td class="py-1.5 pr-3 font-mono text-xs">${c.propio !== undefined ? c.propio : '—'}</td>
          <td class="py-1.5 pr-3 font-mono text-xs">${c.rival !== undefined ? c.rival : '—'}</td>
          <td class="py-1.5 text-xs ${c.nivel === 'ok' ? 'text-green-400' : 'text-red-400'}">${escapeHtml(c.mensaje)}</td>
        </tr>`).join('')}</tbody></table></div>
    <p class="text-[11px] text-muted mt-3">Sobre totales no hay tolerancia: si no da idéntico, hay un partido mal cargado. El cruce por partido es todavía más fino — caza dos errores que se compensen entre sí.</p>`);
}

/* --- 3b. Simetría (promedios) --- */
function diagBloqueSimetria(res) {
  const fallan = res.filter(r => r.nivel === 'error').length;
  const filas = res.map(r => {
    const color = r.nivel === 'ok' ? 'text-green-400' : (r.nivel === 'error' ? 'text-red-400' : 'text-yellow-400');
    return `<tr class="border-b border-hairline/40">
      <td class="py-1.5 pr-3 font-mono text-xs">${escapeHtml(r.par)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.propio !== undefined ? r.propio.toFixed(3) : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs">${r.rival !== undefined ? r.rival.toFixed(3) : '—'}</td>
      <td class="py-1.5 pr-3 font-mono text-xs ${color}">${r.dif !== undefined ? (r.dif > 0 ? '+' : '') + r.dif.toFixed(3) : '—'}</td>
      <td class="py-1.5 text-xs ${color}">${escapeHtml(r.mensaje)}</td>
    </tr>`;
  }).join('');

  return diagCard('3b · Simetría de liga (promedios)',
    fallan ? fallan + ' par(es) no cierran' : 'Los datos cierran',
    `<div class="scrollbox">
      <table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="pb-2 pr-3">Par</th><th class="pb-2 pr-3">Propio</th>
          <th class="pb-2 pr-3">Rival</th><th class="pb-2 pr-3">Dif</th><th class="pb-2"></th>
        </tr></thead><tbody>${filas}</tbody>
      </table>
    </div>
    <p class="text-[11px] text-muted mt-3">En una liga cerrada, lo que un equipo hace es lo que otro sufre. Si un par no cierra, hay partidos mal cargados.</p>`);
}

/* --- 4. Índice --- */
function diagBloqueIndice(idx) {
  const equipos = idx.lista();
  const propio = equipos.find(e => SGADD.esEquipoPropio(e.clave));
  const conFactores = equipos.filter(e => e.factores).length;
  const partidos = idx.liga.partidos;
  const jug = idx.liga.jugadores ? idx.liga.jugadores.length : 0;
  const jugCal = idx.liga.jugadoresCalificados ? idx.liga.jugadoresCalificados.length : 0;

  const dato = (l, v, extra) => `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">${escapeHtml(l)}</p>
      <p class="font-display text-2xl text-accent leading-tight">${escapeHtml(String(v))}</p>
      ${extra ? `<p class="text-[10px] text-muted">${escapeHtml(extra)}</p>` : ''}
    </div>`;

  const alertaMuestra = idx.liga.muestraSuficiente ? '' : `
    <div class="mt-4 rounded-lg border border-yellow-400/40 bg-yellow-400/5 p-3">
      <p class="text-xs text-yellow-400 font-display uppercase tracking-wide mb-1">Muestra insuficiente</p>
      <p class="text-[11px] text-muted leading-snug">
        El PJ mediano es ${idx.liga.pjMediano} y el mínimo razonable es ${idx.liga.PJ_MINIMO}.
        Con tan pocos partidos, la mediana de la liga y los percentiles no distinguen una debilidad
        estructural de un mal día. Los números se muestran igual, pero no los uses para decidir todavía.
      </p>
    </div>`;

  const avisos = idx.avisos.length
    ? `<p class="text-[11px] text-yellow-400 mt-3">${idx.avisos.map(escapeHtml).join(' · ')}</p>` : '';

  const propioTxt = propio
    ? `Detectado: <span class="text-accent">${escapeHtml(propio.nombre)}</span>`
    : `<span class="text-yellow-400">No se encontró ningún equipo que matchee /RECONQUISTA/</span>`;

  return diagCard('4 · Índice', 'Fase ' + idx.fase, `
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      ${dato('Equipos', equipos.length)}
      ${dato('Con 4F', conFactores, conFactores === equipos.length ? 'cruce completo' : 'faltan cruces')}
      ${dato('Partidos', partidos, idx.liga.filasPartido + ' filas equipo-partido')}
      ${dato('Jugadores', jug)}
      ${dato('Califican', jugCal, idx.liga.minJugador !== null ? 'MIN ≥ ' + idx.liga.minJugador.toFixed(2) : 'sin umbral')}
      ${dato('PJ mediano', idx.liga.pjMediano, 'rango ' + idx.liga.pjMin + '–' + idx.liga.pjMax)}
    </div>
    <p class="text-xs text-muted mt-3">Equipo propio · ${propioTxt}</p>
    ${alertaMuestra}
    ${avisos}`);
}

/* --- 5. Ficha · ahora armada con SGADD_UI --- */
function diagBloqueFicha(idx) {
  const equipos = idx.lista();
  const propio = equipos.find(e => SGADD.esEquipoPropio(e.clave)) || equipos[0];
  if (!propio) return '';

  const hero = ['NET RTNG', 'RTNG OFF', 'RTNG DEF', 'eFG%', 'AST-PP', 'RO%']
    .map(k => SGADD_UI.statCard(idx.leer(propio.clave, k), { ranking: idx.ranking(propio.clave, k) }))
    .join('');

  const vistas = ['factores-of', 'factores-def', 'distribucion-plays']
    .map(id => SGADD_UI.metricTable(idx.leerVista(propio.clave, id)))
    .join('');

  /* Contraste ponderado vs promedio simple: la razón por la que los
     factores defensivos ya no salen de PROMEDIOS 4F. */
  const comparacion = ['eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'].map(k => {
    const pond = propio.ponderado ? propio.ponderado[k] : null;
    const simple = propio.factores ? propio.factores[k] : null;
    const dif = (pond !== null && simple !== null && simple !== undefined) ? (pond - simple) : null;
    return `<tr class="border-b border-hairline/40 last:border-0">
      <td class="py-1.5 pr-3 text-xs">${escapeHtml(SGADD.metrica(k).label)}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-ink">${escapeHtml(SGADD.formatear(k, pond))}</td>
      <td class="py-1.5 pr-3 font-mono text-xs text-muted">${escapeHtml(SGADD.formatear(k, simple))}</td>
      <td class="py-1.5 font-mono text-xs ${dif === null ? 'text-muted' : Math.abs(dif) > 0.005 ? 'text-yellow-400' : 'text-muted'}">
        ${dif === null ? '—' : (dif > 0 ? '+' : '') + (dif * 100).toFixed(2) + ' pp'}
      </td>
    </tr>`;
  }).join('');

  return diagCard('5 · Ficha de ' + propio.nombre,
    'n = ' + idx.liga.n + ' equipos · PJ ' + (propio.pj || 0) + (idx.liga.muestraSuficiente ? '' : ' · muestra floja'), `
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">${hero}</div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">${vistas}</div>

    <h5 class="font-display uppercase tracking-wide text-xs text-accent mt-6 mb-2">Ponderado vs promedio simple</h5>
    <div class="scrollbox"><table class="w-full text-left">
      <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
        <th class="pb-1 pr-3">Factor defensivo</th>
        <th class="pb-1 pr-3">Calculado</th>
        <th class="pb-1 pr-3">PROMEDIOS 4F</th>
        <th class="pb-1">Dif</th>
      </tr></thead><tbody>${comparacion}</tbody></table></div>
    <p class="text-[10px] text-muted mt-2 leading-snug">
      El calculado sale de sumar el box score del rival en cada partido (join por PARTIDO) y sacar el ratio
      sobre los totales, igual que el lado ofensivo. El de PROMEDIOS 4F promedia los ratios partido a partido:
      un partido de 40 tiros pesa igual que uno de 70.
    </p>`);
}

/* Grilla de escudos: primera pieza reusable de la sección Equipos. */
function diagBloqueEquipos(idx) {
  return diagCard('6 · Selector de equipos', idx.lista().length + ' equipos',
    SGADD_UI.teamPicker(idx.lista(), { onClick: 'diagVerEquipo', seleccionado: SGADD_DIAG.equipoSel }));
}

function diagVerEquipo(clave) {
  SGADD_DIAG.equipoSel = clave;
  diagPintar();
}

function diagCard(titulo, subtitulo, cuerpo) {
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline mb-5">
      <div class="flex items-baseline justify-between gap-3 mb-3 pb-3 border-b border-hairline">
        <h4 class="font-display uppercase tracking-wide text-sm text-ink">${escapeHtml(titulo)}</h4>
        <span class="text-[11px] text-muted font-mono shrink-0">${escapeHtml(subtitulo || '')}</span>
      </div>
      ${cuerpo}
    </div>`;
}


/** Vuelca el manifiesto de escudos para copiar y pegar. */
function diagGenerarManifiesto() {
  const pre = document.getElementById('diagManifiesto');
  if (!pre || typeof LOGOS === 'undefined') return;
  const txt = LOGOS.generarManifiesto();
  pre.textContent = txt;
  pre.classList.remove('hidden');
  if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
}
