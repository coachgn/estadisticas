/* =====================================================================
   SGADD · Hub de clientes · la pestaña Clientes del Panel Master

   ETAPA 1: se CONSULTA todo desde un solo lugar y se genera el comando
   exacto para cada cambio. No escribe.

   POR QUÉ NO ESCRIBE, que es la pregunta obvia: el panel es estático y el
   token de escritura de KV NO puede llegar al navegador. Un alta desde la
   UI necesita que el servidor escriba por nosotros —`POST /api/v1/catalogo`,
   solo admin, validando con `catalogo.validar()` antes de tocar nada— y eso
   es la Etapa 2.

   Y NO SE FINGE. Un botón "Guardar" que en realidad no publica es peor que
   no tenerlo: el que lo aprieta se va convencido de que dio de alta un
   cliente. Es la misma decisión que ya tomó la pestaña de Zonas, que dice
   con todas las letras que "Guardar" queda en este navegador (punto 17).

   LA LISTA SALE DEL CATÁLOGO DEL SERVIDOR. No hay un listado de clubes en
   el repo —`?club=<id>` resuelve por convención (punto 6)— y escribir uno
   acá sería la segunda fuente de verdad de siempre.
   ===================================================================== */

const SGADD_HUB = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  /* El borrador del alta. Vive en el módulo y no en el DOM: tipear no
     repinta —le sacaría el foco al input, la regla de siempre (punto 17)—
     así que el valor tiene que estar en algún lado cuando se arme el
     comando. */
  const alta = { club: '', nombre: '', categoria: '', label: '', sheet: '' };

  /* =====================================================================
     MOTOR · puro, sin `document`
     ===================================================================== */

  /**
   * El comando de alta, listo para pegar en la terminal.
   *
   * ESTA ES LA SALIDA REAL DE LA ETAPA 1: el admin arma el alta en la
   * pantalla, con los campos rotulados y sin abrir un JSON, y se lleva el
   * comando exacto. Cuando exista el endpoint de escritura, el mismo
   * formulario deja de emitir texto y hace la petición — los campos y las
   * validaciones ya son estos.
   *
   * Se emite `null` si falta algo obligatorio: un comando a medias que
   * falla en la terminal es peor que un botón deshabilitado que dice qué
   * falta.
   */
  function comandoAlta(d) {
    const v = d || {};
    if (!v.club || !v.categoria || !v.sheet) return null;
    const q = (x) => '"' + String(x).replace(/"/g, '\\"') + '"';
    let c = 'node server/bin/catalogo.js alta'
      + ' --club ' + q(v.club)
      + ' --categoria ' + q(v.categoria)
      + ' --sheet ' + q(v.sheet);
    if (v.nombre) c += ' --nombre ' + q(v.nombre);
    if (v.label) c += ' --label ' + q(v.label);
    return c;
  }

  /**
   * Qué le falta al alta para poder ejecutarse.
   *
   * Se dice ANTES de apretar y en castellano, no con un campo en rojo
   * después: el que da de alta un cliente lo hace una vez cada mucho y no
   * se acuerda de cuáles eran obligatorios.
   */
  function faltantesAlta(d) {
    const v = d || {};
    const f = [];
    if (!v.club) f.push('el id del club');
    if (!v.categoria) f.push('el id de la categoría');
    if (!v.sheet) f.push('el sheetId del libro');
    return f;
  }

  /**
   * Un id de club o de categoría es una CLAVE, no un título.
   *
   * Viaja en la URL (`?club=<id>`), nombra el archivo de marca
   * (`clubes/<id>.json`) y es la clave del catálogo. Un espacio o una
   * mayúscula ahí rompen cosas en lugares que no se parecen entre sí, así
   * que se valida al escribir en vez de descubrirlo al desplegar.
   */
  function idValido(v) { return /^[a-z0-9][a-z0-9-]*$/.test(String(v || '')); }

  /* =====================================================================
     UI
     ===================================================================== */

  function clubes() {
    return (typeof SGADD_CLIENTES !== 'undefined' && SGADD_CLIENTES.estado.clubes)
      ? SGADD_CLIENTES.estado.clubes : null;
  }

  /** Una fila por categoría, con su libro y su estado. */
  /* SIN COLUMNA DE `sheetId`, y no es un olvido.

     `catalogo.publico()` los borra a propósito antes de mandar la lista:
     "`activo` dice lo mismo sin revelar cuál". Ese recorte es el punto
     entero del backend —sacar los ids del alcance del navegador (punto
     10)— así que agregarlos acá para que el hub se vea más completo sería
     desarmar la garantía desde adentro.

     Y `activo` alcanza para lo que el admin mira en esta pantalla: si la
     categoría tiene libro o no. Para saber CUÁL, está `catalogo.js
     listar`, que corre en su máquina y con sus credenciales. */
  function filaCategoria(c, k) {
    return `<tr class="border-t border-hairline/40">
      <td class="py-1.5 pr-3 font-mono text-[11px] text-muted">${esc(k.slug)}</td>
      <td class="py-1.5 pr-3 text-xs text-ink">${esc(k.label || '—')}</td>
      <td class="py-1.5">
        ${k.activo
          ? '<span class="text-[11px] zona-texto zona-exito">conectada</span>'
          : '<span class="text-[11px] zona-texto zona-aviso">sin libro</span>'}
      </td>
    </tr>`;
  }

  function tarjetaClub(c) {
    const cats = c.categorias || [];
    const conDatos = cats.filter(k => k.activo).length;
    const actual = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id === c.id);

    return `<div class="card rounded-xl p-4 border ${actual ? 'border-accent' : 'border-hairline'}">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">
          ${esc(c.nombre || c.id)}
          ${actual ? '<span class="text-[10px] text-accent ml-2">· abierto</span>' : ''}
        </h3>
        <span class="font-mono text-[11px] text-muted">${esc(c.id)} · ${esc(c.liga || 'sin liga')}</span>
      </div>
      <table class="w-full">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="text-left pb-1 pr-3 font-display">Slug</th>
          <th class="text-left pb-1 pr-3 font-display">Categoría</th>
          <th class="text-left pb-1 font-display">Libro</th>
        </tr></thead>
        <tbody>${cats.map(k => filaCategoria(c, k)).join('')
          || '<tr><td colspan="3" class="py-2 text-xs text-muted">Sin categorías declaradas.</td></tr>'}</tbody>
      </table>
      <div class="mt-3 flex items-center gap-3 flex-wrap">
        ${actual
          ? '<span class="text-[11px] text-muted">Sus zonas y su torneo se editan en las otras dos pestañas.</span>'
          : `<button onclick="SGADD_CLIENTES.elegir('${esc(c.id)}')"
               class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline">
               Abrir este cliente →</button>
             <span class="text-[11px] text-muted">para ver y editar sus zonas</span>`}
        <span class="text-[11px] text-muted ml-auto">${conDatos}/${cats.length} con libro</span>
      </div>
    </div>`;
  }

  function campo(id, etiqueta, valor, ayuda, invalido) {
    return `<label class="block">
      <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${esc(etiqueta)}</span>
      <input type="text" value="${esc(valor)}"
        oninput="SGADD_HUB.campoAlta('${id}', this.value)"
        class="w-full bg-surface2 border ${invalido ? 'border-red-500/70' : 'border-hairline'} rounded-md px-2 py-1.5 text-xs text-ink font-mono">
      <span class="block text-[10px] text-muted mt-1">${ayuda}</span>
    </label>`;
  }

  function bloqueAlta() {
    const cmd = comandoAlta(alta);
    const faltan = faltantesAlta(alta);
    const malClub = !!alta.club && !idValido(alta.club);
    const malCat = !!alta.categoria && !idValido(alta.categoria);

    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Alta de cliente o categoría</h3>
      <p class="text-xs text-muted mb-4">
        Armá el alta acá y llevate el comando. <strong class="text-ink">Todavía no se
        publica desde la pantalla</strong>: el panel es estático y el token de escritura
        del catálogo no puede vivir en el navegador. Cuando exista el endpoint de
        escritura, este mismo formulario deja de emitir texto y hace la petición.
      </p>
      <div class="grid sm:grid-cols-2 gap-3">
        ${campo('club', 'id del club', alta.club,
          'minúsculas y guiones. Es <code>?club=&lt;id&gt;</code> y <code>clubes/&lt;id&gt;.json</code>.', malClub)}
        ${campo('nombre', 'nombre visible', alta.nombre,
          'el que ve el cuerpo técnico. Opcional si el club ya existe.')}
        ${campo('categoria', 'id de la categoría', alta.categoria,
          'el slug del catálogo, ej. <code>reconquista-primera</code>.', malCat)}
        ${campo('label', 'etiqueta de la categoría', alta.label,
          'lo que dice el selector, ej. <code>Primera · Vuelta 2026</code>.')}
      </div>
      <div class="mt-3">
        ${campo('sheet', 'sheetId del libro', alta.sheet,
          'el id de Google Sheets. <strong class="text-ink">Probalo antes</strong> con ' +
          '<code>probar-google.js --sheets</code>: un libro no compartido da 502 en producción.')}
      </div>

      ${malClub || malCat ? `<p class="text-xs mt-3 zona-texto zona-peligro">
        Un id es una CLAVE, no un título: va en minúsculas, sin espacios ni acentos.
        Viaja en la URL y nombra el archivo de marca.</p>` : ''}

      ${cmd && !malClub && !malCat ? `
        <div class="mt-4">
          <span class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Comando</span>
          <pre class="bg-surface2 border border-hairline rounded-md p-3 text-[11px] text-ink overflow-x-auto"><code>${esc(cmd)}</code></pre>
          <p class="text-[11px] text-muted mt-2">
            Corrélo desde la raíz del repo. Después, <code>catalogo.js listar</code> para verificar.
          </p>
        </div>`
        : `<p class="text-xs text-muted mt-4">Falta ${esc(faltan.join(', '))}.</p>`}
    </div>`;
  }

  /** La pestaña entera. */
  function html() {
    const cs = clubes();

    if (!cs) {
      /* Sin backend no hay catálogo, y ahí el hub no puede decir nada
         cierto sobre los otros clientes. Se dice, en vez de mostrar una
         lista vacía que se lee como "no hay clientes". */
      return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Clientes</h3>
        <p class="text-xs text-muted">
          El catálogo lo sirve el backend y esta sesión no lo tiene a mano — sin API,
          o sin token de admin. Las otras dos pestañas siguen funcionando: editan la
          config del club abierto, que sale de <code>clubes/${esc(
            typeof SGADD_CONFIG !== 'undefined' ? SGADD_CONFIG.clubActivo() : '')}.json</code>.
        </p>
      </div>`;
    }

    const totalCat = cs.reduce((a, c) => a + (c.categorias || []).length, 0);
    const conLibro = cs.reduce((a, c) => a + (c.categorias || []).filter(k => k.activo).length, 0);

    return `
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <div class="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 class="font-display uppercase tracking-wide text-sm text-ink">Clientes del catálogo</h3>
          <span class="font-mono text-[11px] text-muted">
            ${cs.length} clubes · ${conLibro}/${totalCat} categorías con libro</span>
        </div>
        <p class="text-xs text-muted mt-2">
          Sale de <code>/api/v1/catalogo</code>, que es la única fuente: el repo no tiene
          un listado de clubes. Los <code>sheetId</code> se muestran recortados a propósito —
          los <code>sheetId</code> no viajan al navegador: para verlos está
          <code>catalogo.js listar</code>.
        </p>
      </div>

      <div class="grid lg:grid-cols-2 gap-4">
        ${cs.slice().sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id), 'es'))
            .map(tarjetaClub).join('')}
      </div>

      <div id="hubAlta">${bloqueAlta()}</div>
    `;
  }

  /* Tipear NO repinta la pestaña: le sacaría el foco al input y haría
     imposible escribir un sheetId de 44 caracteres. Se refresca SOLO el
     bloque del alta, que es lo único que depende del valor. Misma regla que
     `scoutMeta()` y el buscador del buzón. */
  function campoAlta(id, valor) {
    if (!(id in alta)) return;
    alta[id] = String(valor == null ? '' : valor);
    const n = document.getElementById('hubAlta');
    if (n) n.innerHTML = bloqueAlta();
  }

  return {
    /* motor */
    comandoAlta, faltantesAlta, idValido,
    /* ui */
    html, bloqueAlta, campoAlta, alta,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_HUB;
