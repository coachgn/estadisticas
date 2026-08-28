/* =====================================================================
   SGADD · De dónde salen los datos

   Un solo lugar decide si el libro se pide al BACKEND o a GViz, y adapta
   lo que llegue a la forma que el resto de la app ya consume.

   ---------------------------------------------------------------------
   POR QUÉ HAY DOS MODOS Y NO UNO

   El corte no es "el backend reemplaza a GViz" de un día para el otro:
   son tres clubes en producción y el backend tiene que estar desplegado y
   con tokens repartidos antes de que GViz deje de servir. Mientras dure
   la transición conviven:

     backend   hay token Y hay API configurada  → planillas privadas
     gviz      la planilla trae `sheetId`       → planillas públicas (legacy)
     ninguno   ni una cosa ni la otra           → se avisa, no se rompe

   El modo `gviz` está condenado: cuando los `clubes/*.json` dejaron de
   traer `sheetId` quedó sin combustible, y solo se puede activar con una
   config local. Se conserva mientras dure el corte y después se borra
   entero — no se deja "por las dudas": una vía alternativa a los datos
   privados es exactamente el agujero que el backend vino a cerrar.

   ---------------------------------------------------------------------
   LAS DOS FORMAS DEL DATO, Y POR QUÉ SIGUEN SIENDO DOS

   El panel tiene dos capas de datos (punto 3 de CLAUDE.md):

     índice     {cols, filas:[{COLUMNA: valor}]}    valores CRUDOS
     Principal  {cols, rows:[{values, formatted}]}  con el TEXTO de Sheets

   No se unificaron porque reproducir el `formatted` de Google del lado
   del cliente da 40% de precisión sobre 157.278 celdas: cada columna
   tiene su propio patrón en la planilla. Así que el backend manda las dos
   vistas (`hojas` y `hojasTexto`) y acá se arman las dos formas — sin
   inventar un solo formato.
   ===================================================================== */
const SGADD_DATA = (function () {
  'use strict';

  /* En el navegador `SGADD_AUTH` es un global; desde Node hay que
     requerirlo. Mismo patrón que usa `sgadd-auth.js` para el núcleo — sin
     esto los tests verificarían el modo `ninguno` para siempre y no
     probarían nada. */
  const auth = (typeof SGADD_AUTH !== 'undefined') ? SGADD_AUTH
    : (typeof require !== 'undefined' ? require('./sgadd-auth.js') : null);

  /* La URL del backend. Se configura por `?api=` (para probar), por
     `window.SGADD_API` (un `<script>` de config en el deploy) o queda
     vacía. Vacía = no hay backend y el panel cae al modo que pueda. */
  let baseApi = '';

  function configurar(url) { baseApi = String(url || '').replace(/\/+$/, ''); }

  function apiConfigurada() { return !!baseApi; }

  /** 'backend' | 'gviz' | 'ninguno' — de dónde van a salir los datos. */
  function origen(planilla) {
    const hayToken = !!(auth && auth.token());
    if (baseApi && hayToken) return 'backend';
    if (planilla && planilla.sheetId) return 'gviz';
    return 'ninguno';
  }

  /* --------------------------------------------------------------------
     ADAPTADORES

     El backend manda matrices crudas de Sheets: fila 0 = encabezados. Las
     dos funciones de abajo las llevan a las dos formas que el panel ya
     consume, y son PURAS para poder testearlas desde Node.
     -------------------------------------------------------------------- */

  /**
   * Matriz → `{cols, filas}`, la forma que consume el índice.
   *
   * Replica lo que hacía `parsearGviz`, incluido el descarte de las filas
   * enteramente vacías: Sheets devuelve filas cortas cuando las últimas
   * celdas están vacías, así que una fila puede tener menos elementos que
   * el encabezado y hay que rellenar.
   */
  function matrizAFilas(matriz) {
    const m = Array.isArray(matriz) ? matriz : [];
    if (!m.length) return { cols: [], filas: [] };
    const cols = (m[0] || []).map((c, k) => {
      const t = (c === null || c === undefined) ? '' : String(c).trim();
      return t || ('COL' + k);
    });
    const filas = [];
    for (let i = 1; i < m.length; i++) {
      const fila = m[i] || [];
      const o = {};
      let algo = false;
      for (let k = 0; k < cols.length; k++) {
        const v = fila[k];
        o[cols[k]] = (v === null || v === undefined) ? '' : v;
        if (o[cols[k]] !== '') algo = true;
      }
      /* Una fila enteramente vacía no es un dato: GViz ya las descartaba y
         si entraran, el índice contaría equipos y jugadores fantasma. */
      if (algo) filas.push(o);
    }
    return { cols, filas };
  }

  /**
   * Las dos matrices → `{cols, rows:[{values, formatted}]}`, la forma de
   * la capa vieja de Principal.
   *
   * `texto` puede faltar (una hoja que Principal no usa): ahí `formatted`
   * cae al valor crudo, que es EXACTAMENTE lo que hacía GViz cuando una
   * celda no traía `f`. No se inventa un formato.
   */
  function matrizALegacy(matriz, texto) {
    const m = Array.isArray(matriz) ? matriz : [];
    const t = Array.isArray(texto) ? texto : [];
    if (!m.length) return { cols: [], rows: [] };
    const etiquetas = (m[0] || []).map((c, k) => {
      const s = (c === null || c === undefined) ? '' : String(c).trim();
      return s || ('Columna ' + (k + 1));
    });
    const cols = etiquetas.map((label, k) => ({
      id: 'c' + k,
      label: label,
      /* El tipo se infiere de la primera fila con dato. Principal lo usa
         solo para alinear y para elegir formateador, así que una
         inferencia alcanza — GViz lo traía porque lo sabe la planilla. */
      type: tipoDeColumna(m, k),
    }));
    const rows = [];
    for (let i = 1; i < m.length; i++) {
      const fila = m[i] || [];
      const filaT = t[i] || [];
      const values = {};
      const formatted = {};
      let algo = false;
      for (let k = 0; k < etiquetas.length; k++) {
        const v = (fila[k] === undefined) ? null : fila[k];
        const f = (filaT[k] === undefined || filaT[k] === null) ? v : filaT[k];
        values[etiquetas[k]] = v;
        formatted[etiquetas[k]] = (f === null || f === undefined) ? '' : String(f);
        if (values[etiquetas[k]] !== null && values[etiquetas[k]] !== '') algo = true;
      }
      if (algo) rows.push({ values: values, formatted: formatted });
    }
    return { cols: cols, rows: rows };
  }

  function tipoDeColumna(m, k) {
    for (let i = 1; i < m.length && i < 30; i++) {
      const v = m[i] && m[i][k];
      if (v === null || v === undefined || v === '') continue;
      return typeof v === 'number' ? 'number' : 'string';
    }
    return 'string';
  }

  /* --------------------------------------------------------------------
     LA CARGA
     -------------------------------------------------------------------- */

  /* Caché por slug, igual que el de GViz: dos secciones que piden la misma
     categoría a la vez comparten un solo `fetch`. El persistente NO se
     reusa acá a propósito — lo que el backend devuelve depende de QUIÉN
     pregunta, así que guardarlo bajo una clave que no incluye la sesión
     serviría el recorte de un usuario a otro. */
  const _cache = new Map();

  function limpiarCache(slug) {
    if (slug) _cache.delete(slug); else _cache.clear();
  }

  /**
   * Pide una categoría al backend.
   * @returns {Promise<{hojas, hojasTexto, alcance, errores}>}
   */
  function cargarDelBackend(club, slug, opciones) {
    const o = opciones || {};
    const clave = club + '/' + slug;
    if (_cache.has(clave) && !o.forzar) return _cache.get(clave);

    const url = baseApi + '/api/v1/equipos/' + encodeURIComponent(club)
      + '?categoria=' + encodeURIComponent(slug);

    const traer = (typeof fetch !== 'undefined') ? fetch : (o.fetch);
    const tarea = traer(url, {
      /* El token va en el HEADER y no en el query string: en el query
         quedaría en los logs del servidor y del proxy. En la URL solo
         viaja la primera vez, en el link que abre el DT, y de ahí se saca
         enseguida (ver `sgadd-auth.js`). */
      headers: { Authorization: 'Bearer ' + auth.token() },
    }).then(async (r) => {
      let cuerpo = null;
      try { cuerpo = await r.json(); } catch (e) { cuerpo = null; }
      if (!r.ok) {
        const e = new Error((cuerpo && cuerpo.mensaje) || ('El servidor respondió ' + r.status));
        e.status = r.status;
        e.codigo = cuerpo && cuerpo.codigo;
        throw e;
      }
      const hojas = {};
      const crudas = (cuerpo && cuerpo.hojas) || {};
      const textos = (cuerpo && cuerpo.hojasTexto) || {};
      Object.keys(crudas).forEach(h => { hojas[h] = matrizAFilas(crudas[h]); });
      return {
        hojas: hojas,
        crudas: crudas,
        textos: textos,
        alcance: (cuerpo && cuerpo.alcance) || null,
        /* El padrón de la liga: nombre y equipo de TODOS, sin una sola
           estadística. Lo consume el buzón para que el buscador global
           funcione aunque las filas de los rivales estén recortadas. */
        padron: (cuerpo && cuerpo.padron) || [],
        faltantes: (cuerpo && cuerpo.faltantes) || [],
        leidoEn: cuerpo && cuerpo.leidoEn,
        errores: ((cuerpo && cuerpo.faltantes) || []).map(h => ({
          nivel: 'error', hoja: h, mensaje: 'No se pudo leer: la hoja vino vacía',
        })),
      };
    });

    /* Un fracaso NO se cachea: si no, un error de red deja la categoría
       muerta hasta recargar la página. Es la misma regla que el caché de
       GViz (punto 6). */
    tarea.catch(() => _cache.delete(clave));
    _cache.set(clave, tarea);
    return tarea;
  }

  /**
   * El punto de entrada único. Decide el origen y devuelve siempre la
   * misma forma, para que `SGADD_APP.cargar()` no tenga que saber de dónde
   * salieron los datos.
   */
  async function cargarCategoria(planilla, opciones) {
    const o = opciones || {};
    const modo = origen(planilla);

    if (modo === 'backend') {
      const club = (typeof CLUB !== 'undefined' && CLUB.estado && CLUB.estado.id)
        ? CLUB.estado.id : 'reconquista';
      if (o.forzar) limpiarCache(club + '/' + planilla.slug);
      return cargarDelBackend(club, planilla.slug, o);
    }

    if (modo === 'gviz') {
      if (o.forzar) SGADD.limpiarCache(planilla.sheetId);
      const r = await SGADD.cargarCategoria(planilla.sheetId, o);
      /* Sin `padron`: en modo GViz el índice ya trae la liga entera
         porque no hay recorte, así que el buzón lo saca de ahí. */
      return { hojas: r.hojas, errores: r.errores || [], alcance: null, crudas: null, textos: null };
    }

    /* Ni token ni sheetId. El mensaje dice QUÉ falta y qué hacer: un
       "no se pudieron cargar los datos" manda al DT a reportar que el
       panel no anda. */
    const e = new Error(apiConfigurada()
      ? 'Hace falta un link de acceso para ver esta categoría. Pedíselo al club.'
      : 'Esta categoría no tiene libro conectado.');
    e.codigo = apiConfigurada() ? 'SIN_TOKEN' : 'SIN_LIBRO';
    throw e;
  }

  return {
    configurar, apiConfigurada, origen, base: () => baseApi,
    matrizAFilas, matrizALegacy, tipoDeColumna,
    cargarCategoria, cargarDelBackend, limpiarCache,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_DATA;
