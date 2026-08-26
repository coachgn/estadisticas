/* =====================================================================
   SGADD · Sección CONFIGURACIÓN

   La pantalla donde el cuerpo técnico ve y edita las reglas de la
   competencia: cuántos clasifican, cuántos van a reclasificación,
   cuántos descienden y con qué tono se pinta cada zona.

   Todo lo que toca `document` vive acá; el motor (`sgadd-config.js`) es
   puro y no sabe que esta pantalla existe. La dependencia va en un solo
   sentido, igual que `sgadd-estados.js` / `sgadd-buzon.js`.

   ---------------------------------------------------------------------
   POR QUÉ EDITA CONTRA `localStorage` Y NO CONTRA EL JSON

   El panel es un sitio ESTÁTICO servido por GitHub Pages: no hay backend
   al que escribirle. Fingir que "Guardar" persiste para todo el mundo
   sería mentir. Lo que se guarda queda en el navegador de quien editó, y
   el botón **Exportar** da el bloque listo para pegar en
   `clubes/<club>.json` — que es lo que hace que el cambio le llegue al
   resto del cuerpo técnico.

   La pantalla lo dice con todas las letras. Un DT que cambia el corte de
   descenso y cree que lo cambió para todos es peor que uno que no tiene
   la pantalla.
   ===================================================================== */

/* Estado de la pantalla. Vive acá y no en el DOM por el mismo motivo que
   el plegado del buzón (punto 13): un repintado devolvería los campos a
   su valor anterior mientras el DT está escribiendo. */
const CONFIGUI = {
  borrador: null,      // la config que se está editando
  origen: 'ninguno',   // 'local' | 'json' | 'ninguno'
  formatoSel: null,    // qué formato se está editando
  sucio: false,        // hay cambios sin guardar
  exportando: false,   // el bloque JSON está desplegado
};

/* Delegado, no copiado: el id del club lo resuelve el motor, en un solo
   lugar. Dos formas de deducirlo terminan leyendo claves distintas — y
   la que gana depende de cual pantalla se abrio primero. */
function configClubId() { return SGADD_CONFIG.clubActivo(); }

/** Carga el borrador desde el override local o desde el JSON del club. */
function configCargarBorrador(forzar) {
  if (CONFIGUI.borrador && !forzar) return;
  const jsonClub = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : null;
  const v = SGADD_CONFIG.vigente(jsonClub, configClubId());
  /* Copia profunda: el borrador se edita y no puede tocar lo que el
     resto de la app está usando hasta que se guarde. */
  CONFIGUI.borrador = v.config ? JSON.parse(JSON.stringify(v.config)) : configVacio();
  CONFIGUI.origen = v.origen;
  CONFIGUI.sucio = false;
  const ids = Object.keys(CONFIGUI.borrador.formatos);
  if (!CONFIGUI.formatoSel || ids.indexOf(CONFIGUI.formatoSel) === -1) {
    CONFIGUI.formatoSel = ids[0] || null;
  }
}

/* Un club que todavía no configuró nada arranca con un formato vacío en
   vez de una pantalla en blanco: el DT tiene dónde empezar a escribir. */
function configVacio() {
  return {
    ordenTabla: ['PCT', 'DIF', 'PF'],
    formatos: { 'regular': { id: 'regular', label: 'Fase regular',
      equiposEsperados: null, zonas: [] } },
    porTramo: { '*': 'regular' },
  };
}

function configEquiposReales() {
  const st = SGADD_APP.estado;
  return st.idx ? st.idx.lista().length : 0;
}

/* ===================================================================
   ESCRITURA · cada handler toca el borrador y repinta lo mínimo
   =================================================================== */

function configMarcarSucio() { CONFIGUI.sucio = true; }

function configFormatoActual() {
  const b = CONFIGUI.borrador;
  return (b && CONFIGUI.formatoSel) ? b.formatos[CONFIGUI.formatoSel] : null;
}

function configElegirFormato(id) {
  CONFIGUI.formatoSel = id;
  configPintar();
}

function configZonaCampo(i, campo, valor) {
  const f = configFormatoActual();
  if (!f || !f.zonas[i]) return;
  if (campo === 'desde' || campo === 'hasta') {
    const s = String(valor).trim();
    /* Vacío en `hasta` NO es cero: significa "no se declaró", que con
       `desde` negativo quiere decir "hasta el final". Es la misma regla
       de siempre — un dato ausente no se convierte en un dato. */
    f.zonas[i][campo] = s === '' ? (campo === 'hasta' ? null : f.zonas[i][campo])
      : (parseInt(s, 10) || (campo === 'hasta' ? null : f.zonas[i][campo]));
  } else {
    f.zonas[i][campo] = valor;
  }
  configMarcarSucio();
  /* Los campos de texto NO repintan la pantalla entera: un repintado por
     tecla le saca el foco al input y hace imposible escribir un nombre.
     Es la misma regla que ya cumplen `scoutMeta()` y el buscador del
     buzón. Solo se refresca la vista previa, que es lo que cambia. */
  configPintarPreview();
}

function configZonaTono(i, tono) {
  const f = configFormatoActual();
  if (!f || !f.zonas[i]) return;
  f.zonas[i].tono = tono;
  configMarcarSucio();
  configPintar();   // el select sí puede repintar: no se está tipeando
}

function configZonaMover(i, delta) {
  const f = configFormatoActual();
  if (!f) return;
  const j = i + delta;
  if (j < 0 || j >= f.zonas.length) return;
  const tmp = f.zonas[i]; f.zonas[i] = f.zonas[j]; f.zonas[j] = tmp;
  configMarcarSucio();
  configPintar();
}

function configZonaBorrar(i) {
  const f = configFormatoActual();
  if (!f) return;
  f.zonas.splice(i, 1);
  configMarcarSucio();
  configPintar();
}

function configZonaAgregar() {
  const f = configFormatoActual();
  if (!f) return;
  f.zonas.push({ id: 'zona' + (f.zonas.length + 1), label: 'Zona nueva',
    tono: 'neutro', desde: 1, hasta: 1 });
  configMarcarSucio();
  configPintar();
}

function configEquiposEsperados(valor) {
  const f = configFormatoActual();
  if (!f) return;
  const s = String(valor).trim();
  f.equiposEsperados = s === '' ? null : (parseInt(s, 10) || null);
  configMarcarSucio();
  configPintarPreview();
}

function configGuardar() {
  const b = CONFIGUI.borrador;
  if (!b) return;
  const ok = SGADD_CONFIG.guardarOverride(configClubId(), JSON.parse(SGADD_CONFIG.exportar(b)));
  CONFIGUI.sucio = false;
  CONFIGUI.origen = ok ? 'local' : CONFIGUI.origen;
  configAvisar(ok
    ? 'Guardado en este navegador. Para que le llegue al resto, exportá el bloque y commiteálo.'
    : 'No se pudo guardar: el navegador no deja escribir (modo privado o cuota llena).', ok);
  /* Las otras pantallas tienen que ver el cambio ya: reindexar dispara
     `onCambio`, que repinta Clasificación y el resumen de Principal. */
  if (ok && typeof SGADD_APP !== 'undefined') { try { SGADD_APP.reindexar(); } catch (e) {} }
  configPintar();
}

function configRestablecer() {
  SGADD_CONFIG.borrarOverride(configClubId());
  configCargarBorrador(true);
  configAvisar('Se volvió a lo que declara clubes/' + configClubId() + '.json.', true);
  if (typeof SGADD_APP !== 'undefined') { try { SGADD_APP.reindexar(); } catch (e) {} }
  configPintar();
}

function configExportarToggle() {
  CONFIGUI.exportando = !CONFIGUI.exportando;
  configPintar();
  if (CONFIGUI.exportando) {
    const pre = document.getElementById('configExport');
    if (pre && navigator.clipboard) {
      navigator.clipboard.writeText(pre.textContent).then(
        () => configAvisar('Copiado al portapapeles.', true), () => {});
    }
  }
}

function configAvisar(txt, ok) {
  const n = document.getElementById('configAviso');
  if (!n) return;
  n.className = 'text-xs mt-3 ' + (ok ? 'text-green-400' : 'text-red-400');
  n.textContent = txt;
}

/* ===================================================================
   RENDER
   =================================================================== */

function configPintar() {
  const root = document.getElementById('view-root');
  if (!root || typeof currentSection === 'undefined' || currentSection !== 'configuracion') return;
  root.innerHTML = buildConfiguracion();
}

/* La vista previa y los avisos son lo único que cambia al tipear, así
   que se repintan solos. Repintar todo le sacaría el foco al input. */
function configPintarPreview() {
  const n = document.getElementById('configPreview');
  if (n) n.innerHTML = configPreviewHTML();
  const v = document.getElementById('configValidacion');
  if (v) v.innerHTML = configValidacionHTML();
}

function configPreviewHTML() {
  const st = SGADD_APP.estado;
  const f = configFormatoActual();
  if (!st.idx) return '<p class="text-xs text-muted">La categoría todavía está cargando.</p>';
  /* La preview usa la TABLA DE VERDAD, no una maqueta: es el mismo
     `clasifTablaHTML` que pinta la sección Clasificación. Una preview
     que no es el componente real miente en cuanto uno de los dos
     cambie, y este es justo el lugar donde el DT confía en lo que ve. */
  return clasifLeyendaHTML(f, configEquiposReales()) +
    '<div class="mt-3">' +
    clasifTablaHTML(st.idx, { columnas: 'resumida', formato: f,
      orden: (CONFIGUI.borrador && CONFIGUI.borrador.ordenTabla) || null }) +
    '</div>';
}

function configValidacionHTML() {
  const b = CONFIGUI.borrador;
  if (!b) return '';
  const st = SGADD_APP.estado;
  const problemas = SGADD_CONFIG.validar(b, {
    torneo: st.torneo, fase: st.fase, equipos: configEquiposReales() });
  if (!problemas.length) {
    return '<p class="text-xs text-green-400">Sin choques de reglas: cada zona alcanza al ' +
      'menos un puesto y la cantidad de equipos coincide con el libro.</p>';
  }
  const err = problemas.filter(p => p.nivel === 'error');
  const avi = problemas.filter(p => p.nivel === 'aviso');
  return '<ul class="space-y-2">' + err.concat(avi).map(p => `
    <li class="flex gap-2.5">
      <span class="shrink-0 w-1 rounded-full ${p.nivel === 'error' ? 'bg-red-400' : 'bg-yellow-400'}"></span>
      <span class="text-xs ${p.nivel === 'error' ? 'text-red-400' : 'text-yellow-400'} break-words">${
        SGADD_UI.esc(p.mensaje)}</span>
    </li>`).join('') + '</ul>';
}

/* Las tres variantes del acento, con su contraste medido. No es adorno:
   es el control de que el color del cliente se lee en cada superficie,
   y con marcas oscuras eso NO se puede dar por hecho (punto 15). */
function configColoresHTML() {
  if (typeof CLUB === 'undefined' || !CLUB.contraste) return '';
  const T = CLUB.TEMA;
  const filas = [
    ['marca', T.acento, null, null],
    ['texto sobre la card', T.acentoTexto, '#1F2937', 'se lee sobre el fondo oscuro'],
    ['fondo con texto oscuro', T.acentoFondo, null, 'deja leer el texto de encima'],
    ['texto en papel', T.acentoPapel, '#f1f5f9', 'se lee sobre la tarjeta impresa'],
  ];
  return filas.map(([nombre, color, fondo, nota]) => {
    if (!color) return '';
    let c = null;
    if (fondo) c = CLUB.contraste(color, fondo);
    else if (nombre.indexOf('fondo') === 0) c = CLUB.contraste('#0B1121', color);
    const ok = c === null ? null : c >= 4.5;
    return `<div class="flex items-center gap-2.5 py-1">
      <span class="shrink-0 w-4 h-4 rounded border border-hairline" style="background:${
        SGADD_UI.esc(color)}"></span>
      <span class="font-mono text-[11px] text-ink w-20 shrink-0">${SGADD_UI.esc(color)}</span>
      <span class="text-[11px] text-muted flex-1 min-w-0">${SGADD_UI.esc(nombre)}</span>
      ${c === null ? '' : `<span class="font-mono text-[11px] shrink-0 ${
        ok ? 'text-green-400' : 'text-red-400'}" title="${SGADD_UI.esc(nota || '')}">${
        c.toFixed(2)} ${ok ? 'AA' : '✗'}</span>`}
    </div>`;
  }).join('');
}

function configZonasHTML() {
  const f = configFormatoActual();
  if (!f) return '<p class="text-xs text-muted">Este club no tiene formatos declarados.</p>';
  if (!f.zonas.length) {
    return '<p class="text-xs text-muted py-3">Sin zonas. La tabla sale sin colores ' +
      'de clasificación ni descenso.</p>';
  }
  const total = configEquiposReales();
  const tonos = Object.keys(SGADD_CONFIG.TONOS);
  const inp = 'bg-surface2 border border-hairline rounded px-2 py-1 text-xs ' +
    'font-mono text-ink focus:border-accent outline-none';

  return f.zonas.map((z, i) => {
    /* El rango RESUELTO, con los equipos reales. Es lo que convierte un
       `-2` abstracto en "11–12" y deja ver el choque de cascada antes de
       guardar: dos zonas pidiendo los mismos puestos se ven acá. */
    const r = SGADD_CONFIG._rangoDeZona(z, total);
    const viva = r && SGADD_CONFIG.zonasDeTabla(f, total).some(x => x && x.id === z.id);
    return `<div class="flex flex-wrap items-center gap-2 py-2 border-b border-hairline/40 last:border-0 zona-${
      SGADD_UI.esc(z.tono)}">
      <span class="zona-punto shrink-0"></span>
      <input type="text" value="${SGADD_UI.esc(z.label)}" aria-label="Nombre de la zona"
        oninput="configZonaCampo(${i}, 'label', this.value)"
        class="${inp} flex-1 min-w-[9rem] font-body">
      <label class="text-[10px] uppercase tracking-wider text-muted">desde</label>
      <input type="number" value="${z.desde}" aria-label="Puesto desde"
        oninput="configZonaCampo(${i}, 'desde', this.value)" class="${inp} w-16">
      <label class="text-[10px] uppercase tracking-wider text-muted">hasta</label>
      <input type="number" value="${z.hasta === null ? '' : z.hasta}" placeholder="—"
        aria-label="Puesto hasta, vacío llega al final"
        oninput="configZonaCampo(${i}, 'hasta', this.value)" class="${inp} w-16">
      <select onchange="configZonaTono(${i}, this.value)" aria-label="Tono de la zona"
        class="${inp}">
        ${tonos.map(t => `<option value="${t}" ${t === z.tono ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <span class="font-mono text-[11px] w-20 shrink-0 ${viva ? 'zona-texto' : 'text-red-400'}"
        title="${viva ? 'Puestos que pinta con los equipos de hoy'
          : 'Con esta cantidad de equipos no alcanza ningún puesto'}">${
        r ? r.desde + '–' + r.hasta : 'sin rango'}${viva ? '' : ' ✗'}</span>
      <span class="flex gap-1 shrink-0">
        <button onclick="configZonaMover(${i}, -1)" aria-label="Subir la zona"
          class="px-1.5 py-1 text-xs text-muted hover:text-ink" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button onclick="configZonaMover(${i}, 1)" aria-label="Bajar la zona"
          class="px-1.5 py-1 text-xs text-muted hover:text-ink" ${
            i === f.zonas.length - 1 ? 'disabled' : ''}>▼</button>
        <button onclick="configZonaBorrar(${i})" aria-label="Borrar la zona"
          class="px-1.5 py-1 text-xs text-muted hover:text-red-400">✕</button>
      </span>
    </div>`;
  }).join('');
}

/* Los tramos SALEN DEL DATO y por eso son de solo lectura: el libro ya
   dice cuáles existen (punto 15). Lo editable es a qué formato apunta
   cada uno. */
function configTramosHTML() {
  const b = CONFIGUI.borrador;
  /* La MISMA fuente que la barra: `combinacionesTorneoFase()` sobre las
     hojas del libro. Si acá se armara la lista por otro camino, la
     pantalla podría ofrecer un tramo que el selector no tiene. */
  const tramos = (typeof SGADD !== 'undefined')
    ? SGADD.combinacionesTorneoFase(SGADD_APP.estado.hojas || {}) : [];
  if (!tramos.length) return '<p class="text-xs text-muted">Sin tramos en este libro.</p>';
  return tramos.map((t) => {
    const clave = (t.torneo || 'GENERAL') + '|' + t.fase;
    const actual = Object.prototype.hasOwnProperty.call(b.porTramo, clave)
      ? b.porTramo[clave] : null;
    const heredado = !Object.prototype.hasOwnProperty.call(b.porTramo, clave);
    const f = SGADD_CONFIG.formatoDeTramo(b, t.torneo, t.fase);
    return `<div class="flex items-center gap-3 py-1.5 border-b border-hairline/40 last:border-0">
      <span class="text-xs text-ink flex-1 min-w-0">${SGADD_UI.esc(t.label)}</span>
      <span class="font-mono text-[11px] text-muted shrink-0">${SGADD_UI.esc(clave)}</span>
      <span class="font-mono text-[11px] shrink-0 ${f ? 'text-accent' : 'text-muted'}">${
        f ? SGADD_UI.esc(f.label) : 'sin zonas'}${heredado ? ' (por comodín)' : ''}</span>
    </div>`;
  }).join('');
}

function buildConfiguracion() {
  const st = SGADD_APP.estado;
  configCargarBorrador();
  const b = CONFIGUI.borrador;
  const f = configFormatoActual();
  const total = configEquiposReales();
  const nombreClub = (typeof CLUB !== 'undefined' && CLUB.cfg && CLUB.cfg.nombre)
    ? CLUB.cfg.nombre : configClubId();

  const btn = 'text-xs font-semibold uppercase tracking-wider rounded px-4 py-2 transition-colors';
  const ids = Object.keys(b.formatos);

  return SGADD_APP.barra() + `
    <section class="space-y-5 mt-5">

      <!-- Qué es esta pantalla y hasta dónde llega lo que se toca acá.
           Va arriba de todo a propósito: el sitio es estático y "Guardar"
           NO le cambia nada a nadie más. -->
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 class="font-display uppercase tracking-wide text-sm text-ink">Configuración de competencia</h2>
          <span class="font-mono text-[11px] text-muted">${SGADD_UI.esc(nombreClub)} ·
            ${CONFIGUI.origen === 'local' ? 'editada en este navegador'
              : CONFIGUI.origen === 'json' ? 'desde clubes/' + SGADD_UI.esc(configClubId()) + '.json'
              : 'sin configurar'}</span>
        </div>
        <p class="text-xs text-muted">
          Estas reglas son lo que el box score no puede saber: cuántos clasifican, cuántos
          descienden y cómo se pinta cada zona. <strong class="text-ink">La cantidad de equipos
          y los tramos NO se declaran acá</strong>: salen del libro.
          Lo que guardes queda <strong class="text-ink">solo en este navegador</strong>; para que
          le llegue al resto del cuerpo técnico hay que exportar el bloque y commitearlo.
        </p>
        <p id="configAviso" class="text-xs mt-3"></p>
      </div>

      <!-- Cliente y tramos van al lado; el FORMATO se lleva el ancho completo:
           cada fila de zona tiene nombre, dos rangos, un tono, el rango resuelto y
           tres botones, y apretada en media pantalla se parte en dos lineas. -->
      <div class="grid lg:grid-cols-2 gap-5">

        <div class="space-y-5">
          <!-- CLIENTE + contraste medido de las tres variantes del acento -->
          <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">Cliente y color</h3>
            ${configColoresHTML()}
            <p class="text-[11px] text-muted mt-2">Cada variante se mide contra el fondo que le
              toca. El mínimo es 4,5 (WCAG AA).</p>
          </div>

          <!-- TRAMOS · solo lectura, salen del libro -->
          <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
            <div class="flex items-baseline justify-between gap-3 mb-2">
              <h3 class="font-display uppercase tracking-wide text-sm text-ink">Tramos del libro</h3>
              <span class="text-[10px] uppercase tracking-wider text-muted">salen del dato</span>
            </div>
            ${configTramosHTML()}
          </div>
        </div>
      </div>

      <!-- FORMATO · lo editable, a ancho completo -->
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
          <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h3 class="font-display uppercase tracking-wide text-sm text-ink">Formato</h3>
            ${ids.length > 1 ? `<select onchange="configElegirFormato(this.value)"
              class="bg-surface2 border border-hairline rounded px-2 py-1 text-xs text-ink outline-none">
              ${ids.map(id => `<option value="${SGADD_UI.esc(id)}" ${
                id === CONFIGUI.formatoSel ? 'selected' : ''}>${SGADD_UI.esc(b.formatos[id].label)}</option>`).join('')}
            </select>` : `<span class="font-mono text-[11px] text-muted">${
              f ? SGADD_UI.esc(f.id) : '—'}</span>`}
          </div>

          <div class="flex items-center gap-3 pb-3 mb-3 border-b border-hairline">
            <label class="text-[11px] uppercase tracking-wider text-muted">Equipos esperados</label>
            <input type="number" value="${f && f.equiposEsperados !== null ? f.equiposEsperados : ''}"
              placeholder="—" aria-label="Equipos esperados"
              oninput="configEquiposEsperados(this.value)"
              class="bg-surface2 border border-hairline rounded px-2 py-1 text-xs font-mono text-ink w-20 outline-none focus:border-accent">
            <span class="font-mono text-[11px] ${
              !f || f.equiposEsperados === null || f.equiposEsperados === total
                ? 'text-muted' : 'text-red-400'}">el libro trae ${total}</span>
          </div>

          <div class="flex items-baseline justify-between gap-3 mb-1">
            <span class="text-[11px] uppercase tracking-wider text-muted">Zonas · gana la primera que calza</span>
            <button onclick="configZonaAgregar()" class="text-[11px] text-accent hover:underline">+ zona</button>
          </div>
          ${configZonasHTML()}
          <p class="text-[11px] text-muted mt-2">Un <span class="font-mono">desde</span> negativo
            cuenta desde el fondo: <span class="font-mono">-2</span> son los dos últimos y se
            corre solo si cambia la cantidad de equipos. <span class="font-mono">hasta</span>
            vacío llega al final.</p>
      </div>

      <!-- VALIDACIÓN en vivo, contra el libro abierto -->
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">Validación</h3>
        <div id="configValidacion">${configValidacionHTML()}</div>
      </div>

      <!-- VISTA PREVIA · el componente de verdad, no una maqueta -->
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink">Vista previa</h3>
          <span class="font-mono text-[11px] text-muted">${SGADD_UI.esc(
            (st.torneo || 'GENERAL') + ' · ' + st.fase)} · ${total} equipos</span>
        </div>
        <div id="configPreview">${configPreviewHTML()}</div>
      </div>

      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex flex-wrap items-center gap-3">
          <button onclick="configGuardar()" class="${btn} bg-accent text-base hover:bg-accentdeep">
            Guardar en este navegador</button>
          <button onclick="configExportarToggle()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30">
            ${CONFIGUI.exportando ? 'Ocultar' : 'Exportar'} el bloque JSON</button>
          <button onclick="configRestablecer()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30">
            Volver al JSON del club</button>
          ${CONFIGUI.sucio ? '<span class="text-[11px] text-yellow-400">Hay cambios sin guardar.</span>' : ''}
        </div>
        ${CONFIGUI.exportando ? `
          <p class="text-[11px] text-muted mt-4 mb-2">Pegar dentro de
            <span class="font-mono text-ink">clubes/${SGADD_UI.esc(configClubId())}.json</span>,
            al mismo nivel que <span class="font-mono">"planillas"</span>. Ya está copiado al portapapeles.</p>
          <pre id="configExport" class="scrollbox bg-surface2 border border-hairline rounded p-3 text-[11px] font-mono text-ink overflow-x-auto whitespace-pre">${
            SGADD_UI.esc('"competencia": ' + SGADD_CONFIG.exportar(b))}</pre>` : ''}
      </div>
    </section>`;
}
