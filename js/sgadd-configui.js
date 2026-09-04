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
  /* La pestaña TORNEO tiene su propio borrador: son dos bloques
     distintos del JSON —`torneo` y `competencia`— y se guardan y
     exportan por separado. Mezclarlos obligaría a commitear los dos
     para publicar uno. */
  /* ABRE EN CLIENTES. El Panel Master contesta primero "qué clientes
     tengo"; las otras dos pestañas editan al club que está abierto. Con
     Zonas por defecto, el admin entraba y veía la config de UN club sin
     una pista de dónde estaban los demás — que es exactamente el problema
     que esta pantalla vino a resolver. */
  pestana: 'clientes',   // 'clientes' | 'zonas' | 'torneo'
  proy: null,
  proyOrigen: 'ninguno',
  proySucia: false,
  proyExportando: false,
  /* LA CATEGORIA QUE SE ESTA EDITANDO, y si tiene reglas propias.
     Un club puede correr Primera, U21 y U23 con formatos que no tienen
     nada que ver. Sin esto, guardar desde la pantalla de una le pisaba
     las zonas a las otras dos. */
  categoria: null,
  /* El bloque ENTERO del club, con todas sus categorías. El borrador es
     solo la parte que esta pantalla muestra; al grabar se fusiona sobre
     éste para no perder lo que no se está viendo. */
  completo: null,
  propia: false,
  catSel: null,
};

/* Delegado, no copiado: el id del club lo resuelve el motor, en un solo
   lugar. Dos formas de deducirlo terminan leyendo claves distintas — y
   la que gana depende de cual pantalla se abrio primero. */
function configClubId() { return SGADD_CONFIG.clubActivo(); }

/** Carga el borrador desde el override local o desde el JSON del club. */
/* =====================================================================
   EL ESTADO DERIVADO SE TIRA AL CAMBIAR DE CATEGORÍA

   `configCargarBorrador()` sale temprano si ya hay borrador —para no
   pisar lo que el DT está editando en cada repintado— y `buildConfiguracion`
   la llama SIN forzar. Consecuencia: al pasar de Primera a U21 el estado
   global cambiaba de planilla y esta pantalla se quedaba con TODO lo
   derivado de la anterior.

   Medido antes del fix, parado en U21:

     estado.planillaId   naranja-u21-clausura-2026   ← el global sí cambió
     CONFIGUI.categoria  primera-clausura-2026       ← viejo
     CONFIGUI.propia     true                        ← viejo (U21 hereda)
     equiposEsperados    12                          ← el formato de Primera
     la tarjeta decía    «Solo Primera · Vuelta 2026»

   Y la validación cruzaba los 12 equipos declarados por Primera contra
   los que trae el libro de U21, o sea dos categorías distintas en la
   misma frase.

   NINGUNA de esas cadenas estaba hardcodeada: todas interpolan
   `CONFIGUI.categoria`. Lo que estaba viejo era la variable, así que el
   arreglo va en el único lugar por donde pasa —el punto de entrada del
   borrador— y no en cada texto.
   ===================================================================== */

/** Tira TODO lo derivado de la categoría. Lo que no se limpia acá es lo
    que se ve viejo en pantalla. */
function resetEstadoCategoria() {
  CONFIGUI.borrador = null;
  CONFIGUI.completo = null;
  CONFIGUI.categoria = null;
  CONFIGUI.propia = false;
  CONFIGUI.origen = 'ninguno';
  CONFIGUI.sucio = false;
  CONFIGUI.formatoSel = null;
  /* El panel de export queda abierto mostrando el archivo de la categoría
     anterior, y ése es de los residuos caros: se copia y se commitea. */
  CONFIGUI.exportando = false;
}

function configCargarBorrador(forzar) {
  /* La categoría la resuelve el motor, no se deduce acá: dos formas de
     deducirla terminan leyendo cosas distintas (punto 17). */
  const actual = SGADD_CONFIG.categoriaActiva();
  const cambio = !!CONFIGUI.borrador && actual !== CONFIGUI.categoria;
  if (CONFIGUI.borrador && !forzar && !cambio) return;
  if (cambio) {
    /* Si había cambios sin guardar eran de la OTRA categoría, así que se
       descartan — pero se avisa. Perderlos en silencio es peor que
       perderlos: el DT vuelve, no los encuentra y no sabe qué pasó. */
    const perdidos = CONFIGUI.sucio;
    const deQuien = configNombreCategoria(CONFIGUI.categoria);
    resetEstadoCategoria();
    if (perdidos) configToast('Se descartaron los cambios sin guardar de ' + deQuien, 'aviso');
  }
  const jsonClub = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : null;
  const v = SGADD_CONFIG.vigente(jsonClub, configClubId());
  /* EL BLOQUE COMPLETO DEL CLUB se guarda aparte: es sobre él que se
     fusiona lo editado al guardar y al publicar, así las categorías
     hermanas viajan enteras aunque esta pantalla no las muestre. */
  CONFIGUI.completo = v.config ? JSON.parse(JSON.stringify(v.config)) : null;
  const r = SGADD_CONFIG.resolver(jsonClub, null, null);
  CONFIGUI.categoria = r.categoria || null;
  CONFIGUI.propia = !!r.propio;
  /* Copia profunda: el borrador se edita y no puede tocar lo que el
     resto de la app está usando hasta que se guarde. */
  const arranque = CONFIGUI.propia ? r.bloque : v.config;
  CONFIGUI.borrador = arranque ? JSON.parse(JSON.stringify(arranque)) : configVacio();
  delete CONFIGUI.borrador.porCategoria;
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

/* =====================================================================
   EL BLOQUE QUE SE GRABA · una sola fuente para guardar y para publicar

   Las dos acciones escriben lo MISMO, así que lo arman en un solo lugar.
   Cuando estaban duplicadas, publicar leía `.competencia` de un objeto
   que no tiene esa clave: viajaba `undefined`, el servidor lo entendía
   como «vaciar» y publicar BORRABA las zonas en vez de publicarlas. Sin
   ningún síntoma, además: la respuesta venía `ok: true`.

   Devuelve {ok, bloque, error} — nunca lanza.
   ===================================================================== */
function configBloqueAGrabar() {
  const b = CONFIGUI.borrador;
  if (!b) return { ok: false, bloque: null, error: 'No hay nada que guardar.' };

  /* El borrador se serializa con el mismo exportador que ve el usuario:
     si lo que se copia y lo que se graba salieran de dos caminos
     distintos, uno de los dos se desincroniza sin que nadie lo note. */
  const propio = SGADD_CONFIG.serializar(JSON.parse(SGADD_CONFIG.exportar(b)));
  if (!propio.ok) return { ok: false, bloque: null, error: propio.error };

  const bloque = SGADD_CONFIG.fusionarCategoria(
    CONFIGUI.completo,
    CONFIGUI.propia ? CONFIGUI.categoria : null,
    JSON.parse(propio.texto));

  /* LA GUARDA. Se valida lo que REALMENTE se va a escribir, ya fusionado
     — validar el fragmento y grabar el compuesto es validar otra cosa. */
  const final = SGADD_CONFIG.serializar(bloque);
  if (!final.ok) return { ok: false, bloque: null, error: final.error };
  return { ok: true, bloque: JSON.parse(final.texto), error: null };
}

function configGuardar() {
  const b = CONFIGUI.borrador;
  if (!b) return;
  const g = configBloqueAGrabar();
  if (!g.ok) {
    configAvisar('No se guardó nada: ' + g.error, false);
    return;
  }
  CONFIGUI.completo = g.bloque;
  const ok = SGADD_CONFIG.guardarOverride(configClubId(), g.bloque);
  CONFIGUI.sucio = false;
  CONFIGUI.origen = ok ? 'local' : CONFIGUI.origen;
  configAvisar(ok
    ? 'Guardado en este navegador. Para que le llegue al cliente, tocá «Publicar».'
    : 'No se pudo guardar: el navegador no deja escribir (modo privado o cuota llena).', ok);
  /* Las otras pantallas tienen que ver el cambio ya: reindexar dispara
     `onCambio`, que repinta Clasificación y el resumen de Principal. */
  if (ok && typeof SGADD_APP !== 'undefined') { try { SGADD_APP.reindexar(); } catch (e) {} }
  configPintar();
}

/* =====================================================================
   PUBLICAR · que el cambio le llegue al cliente

   «Guardar en este navegador» sigue siendo lo que era: el borrador de
   quien edita, que no le cambia nada a nadie más. Publicar escribe el
   bloque en el catálogo y el cliente lo ve en su próxima carga.

   SON DOS ACCIONES Y NO UNA CON UN TILDE. Probar un corte y publicarlo
   son momentos distintos del trabajo: el admin mueve zonas varias veces
   antes de estar conforme, y cada una de esas veces NO tiene por qué
   verla el club.

   El JSON del repo queda de respaldo y la exportación también: es lo que
   sirve para dejar el cambio en el historial de git, que sigue siendo la
   única trazabilidad real que tiene el proyecto.
   ===================================================================== */

/** Solo un ADMIN con backend puede publicar. */
function configPuedePublicar() {
  try {
    if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.apiConfigurada()) return false;
    return typeof SGADD_AUTH !== 'undefined' && SGADD_AUTH.rol() === 'ADMIN';
  } catch (e) { return false; }
}

function configPublicar() {
  const b = CONFIGUI.borrador;
  if (!b) return;
  const g = configBloqueAGrabar();
  if (!g.ok) {
    configAvisar('No se publicó nada: ' + g.error, false);
    return;
  }
  const bloque = g.bloque;

  /* Se resuelven ANTES de disparar: para cuando la promesa vuelva, el
     repintado ya pudo haber cambiado el estado de la pantalla. */
  const alcance = CONFIGUI.propia ? CONFIGUI.categoria : null;
  const nombreClub = (typeof CLUB !== 'undefined' && CLUB.cfg && CLUB.cfg.nombre)
    ? CLUB.cfg.nombre : configClubId();

  const lanzar = () => {
    configAvisar('Publicando…', true);
    /* La `categoria` viaja para que el servidor escriba SOLO ese slot y
       no el bloque entero: es la segunda mitad del aislamiento, del lado
       en que el dato de verdad se guarda. */
    SGADD_DATA.guardarCatalogo({ accion: 'zonas', club: configClubId(),
      categoria: CONFIGUI.propia ? CONFIGUI.categoria : null,
      competencia: CONFIGUI.propia ? JSON.parse(SGADD_CONFIG.exportar(b)) : bloque })
      .then((r) => {
        /* El catálogo que devuelve el servidor es el que vale: el que
           tenía la pantalla quedó viejo en cuanto se escribió. */
        if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) {
          SGADD_CLIENTES.estado.clubes = r.clubes;
        }
        /* Y se repinta lo que depende de las zonas, para que el admin vea
           lo mismo que va a ver el club sin recargar. */
        if (typeof SGADD_APP !== 'undefined') { try { SGADD_APP.reindexar(); } catch (e) {} }
        configPintar();
        /* EL ORDEN IMPORTA: primero se repinta y DESPUÉS se avisa. Al revés,
           el repintado se lleva puesto el nodo del aviso. */
        const donde = alcance ? configNombreCategoria(alcance) : nombreClub;
        configToast('Configuración de ' + donde + ' publicada en el servidor', 'ok', 5000);
        configAvisar('Publicado. El cliente lo ve en su próxima carga.', true);
      })
      .catch((e) => {
        configPintar();
        const detalle = e.message || 'error del servidor';
        configToast('No se pudo publicar: ' + detalle, 'error', 6000);
        configAvisar('No se pudo publicar: ' + detalle, false);
      });
  };

  if (typeof SGADD_CONFIRMAR === 'undefined') return lanzar();
  SGADD_CONFIRMAR.abrir({
    titulo: 'Publicar las zonas de ' + configClubId(),
    aviso: 'Se actualiza la tabla de posiciones que ve el cliente en su próxima carga.',
    confirmar: 'Publicar',
    zonas: SGADD_CONFIRMAR.resumenZonas(b),
    alConfirmar: lanzar,
  });
}

function configRestablecer() {
  SGADD_CONFIG.borrarOverride(configClubId());
  configCargarBorrador(true);
  configAvisar('Se volvió a lo que declara clubes/' + configClubId() + '.json.', true);
  if (typeof SGADD_APP !== 'undefined') { try { SGADD_APP.reindexar(); } catch (e) {} }
  configPintar();
}

/* =====================================================================
   EL EXPORT ES EL ARCHIVO ENTERO, no el bloque suelto

   Daba `"competencia": {…}` para empalmar a mano al lado de
   `"planillas"`, y acertarle a la coma quedaba del lado del que pega. El
   2026-09-01 alguien no le acertó: `clubes/reconquista.json` quedó sin
   la coma, dejó de parsear entero y el club estuvo viendo la marca y las
   zonas de OTRO club, porque la app se cae a los valores por defecto sin
   decir nada.

   Se devuelve el archivo completo, listo para REEMPLAZAR. No hay coma
   que acertar, y lo que se copia ya pasó por `JSON.parse()`.
   ===================================================================== */
function configPanelExport() {
  const r = configTextoExport();
  const clase = 'scrollbox bg-surface2 border border-hairline rounded p-3'
    + ' text-[11px] font-mono overflow-x-auto whitespace-pre';
  if (!r.ok) {
    return `<p class="text-[11px] zona-texto zona-peligro mt-4">
      No se puede exportar: ${SGADD_UI.esc(r.error)}</p>`;
  }
  return `
    <p class="text-[11px] text-muted mt-4 mb-2">Es el archivo
      <span class="font-mono text-ink">clubes/${SGADD_UI.esc(configClubId())}.json</span>
      COMPLETO: reemplazalo entero y commiteá. No hay que empalmar nada.
      Ya está copiado al portapapeles.</p>
    <pre id="configExport" class="${clase} text-ink">${SGADD_UI.esc(r.texto)}</pre>`;
}

/** El texto a copiar: {ok, texto, error}. */
function configTextoExport() {
  const g = configBloqueAGrabar();
  if (!g.ok) return { ok: false, texto: null, error: g.error };
  const jsonClub = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : null;
  return SGADD_CONFIG.exportarArchivo(jsonClub, g.bloque);
}

/* =====================================================================
   EL ALCANCE · a quién le cambia las zonas lo que se está editando

   Un club puede correr varias categorías con formatos que no tienen
   nada que ver: Reconquista tiene Primera, U21 y U23, y como las claves
   de `porTramo` son `TORNEO|FASE` —y `GENERAL|REGULAR` es lo más común
   de todo— las tres compartían zonas sin que nadie lo pidiera. Bajar el
   descenso en Primera se lo bajaba también a la U21.

   LO IMPORTANTE ES QUE SE VEA ANTES DE GUARDAR. El motor ya sabía
   scopear (`porCategoria`), pero la pantalla no decía sobre qué nivel
   estaba escribiendo, así que el admin no tenía forma de saber si su
   cambio alcanzaba a una categoría o a las tres.
   ===================================================================== */
function configAlcanceHTML() {
  const cat = CONFIGUI.categoria;
  if (!cat) return '';
  const otras = configOtrasCategorias();
  const nombre = configNombreCategoria(cat);
  const tono = CONFIGUI.propia ? 'zona-exito' : (otras.length ? 'zona-aviso' : 'zona-neutro');
  const texto = CONFIGUI.propia
    ? 'Solo ' + nombre
    : (otras.length
        ? 'Todas las categorías del club (' + (otras.length + 1) + ')'
        : 'Todo el club');
  const detalle = CONFIGUI.propia
    ? 'Esta categoría tiene sus propias zonas. Guardar y publicar no tocan a las otras.'
    : (otras.length
        ? 'Lo que edites acá también le cambia la tabla a ' + otras.map(configNombreCategoria).join(' y ') + '.'
        : 'El club tiene una sola categoría, así que no hay nada que separar.');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">Alcance del cambio</h3>
        <span class="zona-texto ${tono} text-[10px] uppercase tracking-wider">${SGADD_UI.esc(texto)}</span>
      </div>
      <p class="text-[11px] text-muted mb-3">${SGADD_UI.esc(detalle)}</p>
      ${otras.length ? `<label class="flex items-center gap-2 text-xs text-ink cursor-pointer">
        <input type="checkbox" onchange="configAlcancePropio(this.checked)"
          ${CONFIGUI.propia ? 'checked' : ''} class="accent-current">
        <span>${SGADD_UI.esc(nombre)} tiene sus propias zonas</span>
      </label>` : ''}
    </div>`;
}

/** Las otras categorías del club, para poder nombrarlas. */
function configOtrasCategorias() {
  try {
    /* El catalogo vive en SGADD, no en CLUB: `sgadd-club.js` lo escribe
       ahi al aplicar la config del club. */
    const pl = (typeof SGADD !== 'undefined' && SGADD.CATALOGO && SGADD.CATALOGO.planillas)
      ? SGADD.CATALOGO.planillas : [];
    return pl.map(x => x.id).filter(id => id && id !== CONFIGUI.categoria);
  } catch (e) { return []; }
}

function configNombreCategoria(id) {
  try {
    /* El catalogo vive en SGADD, no en CLUB: `sgadd-club.js` lo escribe
       ahi al aplicar la config del club. */
    const pl = (typeof SGADD !== 'undefined' && SGADD.CATALOGO && SGADD.CATALOGO.planillas)
      ? SGADD.CATALOGO.planillas : [];
    const p = pl.filter(x => x.id === id)[0];
    return (p && p.label) || id;
  } catch (e) { return id; }
}

/**
   * Separar o volver a unir la categoría.
   *
   * Al SEPARAR se arranca con una copia de lo que ya se estaba viendo, no
   * con un formato vacío: el admin separa para retocar, no para escribir
   * todo de nuevo, y una pantalla en blanco haría parecer que se perdió
   * la config.
   *
   * Al UNIR se vuelve al bloque del club — que sigue estando, porque el
   * nivel de la categoría nunca lo pisó.
   */
function configAlcancePropio(propia) {
  CONFIGUI.propia = !!propia;
  if (!propia) {
    const club = CONFIGUI.completo
      ? JSON.parse(JSON.stringify(CONFIGUI.completo)) : configVacio();
    delete club.porCategoria;
    CONFIGUI.borrador = (club.formatos && Object.keys(club.formatos).length)
      ? club : configVacio();
    const ids = Object.keys(CONFIGUI.borrador.formatos);
    if (ids.indexOf(CONFIGUI.formatoSel) === -1) CONFIGUI.formatoSel = ids[0] || null;
  }
  configMarcarSucio();
  configPintar();
}

function configExportarToggle() {
  /* LA GUARDA, antes de abrir el panel: si el objeto no sobrevive a
     `JSON.parse()` no se copia nada. Copiar un JSON roto al portapapeles
     es peor que no copiar: termina pegado en el repo. */
  if (!CONFIGUI.exportando) {
    const r = configTextoExport();
    if (!r.ok) {
      configAvisar('No se exportó nada: ' + r.error, false);
      return;
    }
  }
  CONFIGUI.exportando = !CONFIGUI.exportando;
  configPintar();
  if (CONFIGUI.exportando) {
    const pre = document.getElementById('configExport');
    if (pre && navigator.clipboard) {
      navigator.clipboard.writeText(pre.textContent).then(
        () => configAvisar('Copiado: es el archivo entero, reemplazalo.', true), () => {});
    }
  }
}

/* =====================================================================
   EL TOAST · el aviso que sobrevive al repintado

   `configAvisar()` escribe en `#configAviso`, que vive DENTRO de
   `#view-root`. Publicar hacía:

       configAvisar('Publicado…');
       configPintar();            ← reconstruye #view-root entero

   o sea que el mensaje se borraba en la línea siguiente a escribirlo. El
   admin tocaba «Publicar», el modal se cerraba y no pasaba nada visible:
   ni éxito ni error.

   Se arregla con las dos mitades. El toast del buzón se cuelga de
   `document.body`, así que ningún repintado de sección lo toca, y ya
   trae `role="status"` + `aria-live="polite"` (punto 14). Se REUSA en vez
   de escribir un segundo: dos implementaciones del mismo aviso terminan
   viéndose distinto, que es el bug que ya tuvo el rol funcional.
   ===================================================================== */
function configToast(txt, tono, ms) {
  try {
    if (typeof SGADD_BUZON !== 'undefined' && SGADD_BUZON.toast) {
      SGADD_BUZON.toast(txt, tono || 'ok', ms);
      return true;
    }
  } catch (e) { /* el buzón es una mejora, no una dependencia dura */ }
  return false;
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
          ${CONFIGUI.pestana === 'torneo'
            ? 'Lo que el cliente declara en la <strong class="text-ink">entrevista</strong>, antes de que ' +
              'entre el primer box score: qué categorías tiene, qué tramos las componen y con qué fechas. ' +
              'Es una <strong class="text-ink">hipótesis fechada</strong> contra la cual contrastar — si ' +
              'diverge del libro, gana el libro y el Diagnóstico lo dice.'
            : 'Estas reglas son lo que el box score no puede saber: cuántos clasifican, cuántos ' +
              'descienden y cómo se pinta cada zona. <strong class="text-ink">La cantidad de equipos ' +
              'y los tramos NO se declaran acá</strong>: salen del libro.'}
        </p>
        <p id="configAviso" class="text-xs mt-3"></p>
      </div>

      ${SGADD_UI.tabs([
        /* CLIENTES va PRIMERA: el Panel Master se abre en "qué clientes
           tengo", y las otras dos editan al club que está abierto. Con
           Zonas primero, el admin entraba y veía la config de UN club sin
           una pista de dónde estaban los demás. */
        { id: 'clientes', label: 'Clientes' },
        { id: 'zonas',  label: 'Zonas de la tabla' },
        { id: 'torneo', label: 'Torneo / Preconfiguración' },
      ], CONFIGUI.pestana, 'configPestana')}

      <!-- Cliente y tramos van al lado; el FORMATO se lleva el ancho completo:
           cada fila de zona tiene nombre, dos rangos, un tono, el rango resuelto y
           tres botones, y apretada en media pantalla se parte en dos lineas. -->
      ${CONFIGUI.pestana === 'clientes'
        ? '<div id="hubClientes" class="space-y-5">' + SGADD_HUB.html() + '</div>'
        : CONFIGUI.pestana === 'torneo' ? configPestanaTorneo() : `
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

      ${configAlcanceHTML()}

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
        <!-- LA ACCION PRINCIPAL ES PUBLICAR, y va sola arriba.

             Las cuatro estaban en fila, del mismo tamaño y con «Guardar en
             este navegador» primero: la que le cambia algo al cliente
             quedaba tercera y parecía una más. El resto son auxiliares
             —probar, mandarle el bloque al que mantiene el repo, deshacer—
             y bajan a una fila secundaria. -->
        ${configPuedePublicar() ? `<div class="flex flex-wrap items-center gap-3 mb-3">
          <button onclick="configPublicar()" class="${btn} bg-accent text-base hover:bg-accentdeep">
            Publicar en el cliente</button>
          <span class="text-[11px] text-muted flex-1 min-w-[16rem]">
            Guarda en el servidor y la tabla del cliente cambia en su próxima carga.
            <b class="text-ink">Es la vía automática</b>: no hace falta tocar código.
          </span>
        </div>` : `<p class="text-[11px] zona-texto zona-aviso mb-3">
          Publicar en el cliente necesita sesión de administrador y backend.
          Sin eso, el cambio viaja por el bloque JSON.</p>`}

        <div class="flex flex-wrap items-center gap-3">
          <button onclick="configGuardar()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30">
            Guardar en este navegador</button>
          <button onclick="configExportarToggle()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30">
            ${CONFIGUI.exportando ? 'Ocultar' : 'Exportar'} el bloque JSON</button>
          <button onclick="configRestablecer()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30">
            Volver al JSON del club</button>
          ${CONFIGUI.sucio ? '<span class="text-[11px] text-yellow-400">Hay cambios sin guardar.</span>' : ''}
        </div>

        <!-- QUE HACE CADA UNA, en la pantalla y no en un tooltip: la
             diferencia entre las tres es la que hace que un cambio le
             llegue al club o se quede en una computadora. -->
        <dl class="mt-4 space-y-2 text-[11px]">
          <div class="flex gap-2">
            <dt class="text-accent font-display uppercase tracking-wider shrink-0 min-w-[9rem]">Publicar</dt>
            <dd class="text-muted">Lo escribe en el servidor. El cliente lo ve en su próxima
              carga, sin que nadie toque el repositorio.</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-ink font-display uppercase tracking-wider shrink-0 min-w-[9rem]">Guardar acá</dt>
            <dd class="text-muted">Queda en ESTE navegador, para probar. Nadie más lo ve.</dd>
          </div>
          <div class="flex gap-2">
            <dt class="text-ink font-display uppercase tracking-wider shrink-0 min-w-[9rem]">Exportar JSON</dt>
            <dd class="text-muted">El bloque para pegar en
              <span class="font-mono">clubes/${SGADD_UI.esc(configClubId())}.json</span> y
              commitear. Es para quien mantiene el código, y deja el cambio en el
              historial de git. <b class="text-ink">El navegador no puede escribir
              archivos del repositorio</b> — por eso este paso es manual.</dd>
          </div>
        </dl>
        ${CONFIGUI.exportando ? configPanelExport() : ''}
      </div>
      `}
    </section>`;
}

/* =====================================================================
   PESTAÑA "TORNEO" · la preconfiguración, editable sin tocar el JSON

   Lo que el cliente declara en la entrevista, ANTES de que entre el
   primer box score: qué categorías tiene, qué tramos las componen, con
   qué fechas y cuántos equipos.

   TODO ES LIBRE. Ni las categorías ni los tramos tienen nombres
   preconcebidos: el `id` y el `label` los escribe el usuario y el motor
   los trata como claves opacas. Si esta pantalla ofreciera un
   desplegable con "Ida / Vuelta / Apertura", volvería a meter por la UI
   el hardcodeo que el schema evita.
   ===================================================================== */

/* El borrador de la proyección vive aparte del de `competencia`: son dos
   bloques distintos del JSON y se guardan y exportan por separado. */
function configProyBorrador(forzar) {
  if (CONFIGUI.proy && !forzar) return CONFIGUI.proy;
  const jsonClub = (typeof CLUB !== 'undefined' && CLUB.cfg) ? CLUB.cfg : null;
  const local = SGADD_CONFIG.leerOverride(configClubId() + '.preconfig');
  const delJson = (jsonClub && jsonClub.preconfiguracion) || null;

  /* LA GUARDA DE TIPO ES OBLIGATORIA, no una precaución. Acá se pisaron
     una vez el bloque nuevo y el campo `torneo` viejo —un string con el
     nombre del torneo— y esto reventaba con `Cannot convert undefined or
     null to object` al pedirle `.categorias` a un texto. La pantalla
     quedaba muerta justo en los clubes que MÁS la necesitan: los que
     todavía no configuraron nada. */
  const util = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  const crudo = util(local) || util(delJson);

  CONFIGUI.proy = crudo
    ? JSON.parse(JSON.stringify(crudo))
    : { cliente: (jsonClub && jsonClub.nombre) || '', declaradoEl: '',
        declaradoPor: '', categorias: {} };
  /* Y el borrador SIEMPRE tiene un mapa de categorías, aunque el bloque
     venga a medias: sin esto un JSON con `preconfiguracion: {}` volvería
     a romper el render. */
  if (!CONFIGUI.proy.categorias || typeof CONFIGUI.proy.categorias !== 'object') {
    CONFIGUI.proy.categorias = {};
  }
  CONFIGUI.proyOrigen = util(local) ? 'local' : (util(delJson) ? 'json' : 'ninguno');
  if (!CONFIGUI.catSel || !CONFIGUI.proy.categorias[CONFIGUI.catSel]) {
    CONFIGUI.catSel = Object.keys(CONFIGUI.proy.categorias)[0] || null;
  }
  return CONFIGUI.proy;
}

function configCatActual() {
  const p = configProyBorrador();
  return CONFIGUI.catSel ? p.categorias[CONFIGUI.catSel] : null;
}

/* ---------------- escritura ---------------- */

function configProySucio() { CONFIGUI.proySucia = true; }

function configCatElegir(id) { CONFIGUI.catSel = id; configPintar(); }

/* SIEMBRA desde la planilla abierta, y solo el VÍNCULO —id, nombre y
   planilla—, nunca los tramos ni la `clave` del libro. El id de la
   planilla no es un nombre asumido: es el que el propio club ya escribió
   en su catálogo, y es justo el dato que ata la categoría a su Sheet
   (punto 18). Los nombres del TORNEO se siguen escribiendo a mano: ahí
   proponer sería inventar. */
function configCatAgregar() {
  const p = configProyBorrador();
  const vacia = Object.keys(p.categorias).length === 0;
  const abierta = (typeof SGADD_APP !== 'undefined' && SGADD_APP.estado)
    ? SGADD.planilla(SGADD_APP.estado.planillaId) : null;
  const semilla = (vacia && abierta && abierta.id) ? abierta : null;

  /* El id se propone, no se impone: es una clave que el usuario puede
     querer que coincida con la de su planilla. */
  let base = semilla ? semilla.id : 'categoria';
  let i = 1, id = base;
  while (p.categorias[id]) { i++; id = base + '-' + i; }
  p.categorias[id] = {
    label: semilla ? (semilla.label || semilla.id) : 'Categoría nueva',
    planilla: semilla ? semilla.id : '',
    tramos: []
  };
  CONFIGUI.catSel = id;
  configProySucio();
  configPintar();
}

function configCatBorrar(id) {
  const p = configProyBorrador();
  delete p.categorias[id];
  if (CONFIGUI.catSel === id) CONFIGUI.catSel = Object.keys(p.categorias)[0] || null;
  configProySucio();
  configPintar();
}

/* Renombrar el ID es distinto de renombrar el LABEL: el id es la clave
   del mapa y puede estar atada a una planilla, así que se reconstruye el
   objeto conservando el orden en vez de agregar la clave nueva al final. */
function configCatRenombrarId(viejo, nuevo) {
  const p = configProyBorrador();
  const id = String(nuevo || '').trim();
  if (!id || id === viejo || p.categorias[id]) return;
  const out = {};
  Object.keys(p.categorias).forEach(k => {
    out[k === viejo ? id : k] = p.categorias[k];
  });
  p.categorias = out;
  if (CONFIGUI.catSel === viejo) CONFIGUI.catSel = id;
  configProySucio();
  configPintar();
}

function configCatCampo(campo, valor) {
  const c = configCatActual();
  if (!c) return;
  c[campo] = valor;
  configProySucio();
  configPintarTimeline();   // tipear NO repinta: solo la línea de tiempo
}

function configTramoAgregar() {
  const c = configCatActual();
  if (!c) return;
  c.tramos = c.tramos || [];
  c.tramos.push({ id: 'tramo-' + (c.tramos.length + 1), label: 'Tramo nuevo',
    clave: '', equiposEsperados: null, fechasEsperadas: null,
    ventanaTemporal: { desde: '', hasta: '' } });
  configProySucio();
  configPintar();
}

function configTramoBorrar(i) {
  const c = configCatActual();
  if (!c || !c.tramos) return;
  c.tramos.splice(i, 1);
  configProySucio();
  configPintar();
}

function configTramoMover(i, delta) {
  const c = configCatActual();
  if (!c || !c.tramos) return;
  const j = i + delta;
  if (j < 0 || j >= c.tramos.length) return;
  const t = c.tramos[i]; c.tramos[i] = c.tramos[j]; c.tramos[j] = t;
  configProySucio();
  configPintar();
}

function configTramoCampo(i, campo, valor) {
  const c = configCatActual();
  if (!c || !c.tramos || !c.tramos[i]) return;
  const t = c.tramos[i];
  if (campo === 'desde' || campo === 'hasta') {
    t.ventanaTemporal = t.ventanaTemporal || { desde: '', hasta: '' };
    t.ventanaTemporal[campo] = valor;
  } else if (campo === 'equiposEsperados' || campo === 'fechasEsperadas') {
    const s = String(valor).trim();
    t[campo] = s === '' ? null : (parseInt(s, 10) || null);
  } else {
    t[campo] = valor;
  }
  configProySucio();
  /* Los campos de texto y fecha NO repintan la pantalla: un repintado por
     tecla le saca el foco al input. Solo se refresca la línea de tiempo,
     que es lo que cambia al mover una fecha. */
  configPintarTimeline();
}

/* Propone la clave del libro para un tramo. PROPONE: la escribe en el
   campo y el usuario la ve, no se aplica en silencio. */
function configTramoSugerir(i) {
  const c = configCatActual();
  if (!c || !c.tramos[i]) return;
  const tramos = (typeof SGADD !== 'undefined')
    ? SGADD.combinacionesTorneoFase(SGADD_APP.estado.hojas || {}) : [];
  const s = SGADD_CONFIG.sugerirClave(c.tramos[i], tramos);
  if (!s) { configAvisar('Ninguna clave del libro se parece lo suficiente, o hay más de una. Elegila a mano.', false); return; }
  c.tramos[i].clave = s;
  configProySucio();
  configPintar();
  configAvisar('Se propuso ' + s + '. Revisala antes de guardar.', true);
}

/* ---------------- guardar, exportar, restablecer ---------------- */

function configProyGuardar() {
  const ok = SGADD_CONFIG.guardarOverride(configClubId() + '.preconfig', CONFIGUI.proy);
  CONFIGUI.proySucia = false;
  if (ok) CONFIGUI.proyOrigen = 'local';
  configAvisar(ok
    ? 'Guardado SOLO en este navegador y en este dispositivo. Nadie más lo ve todavía: para que le llegue al cuerpo técnico hay que exportar el bloque y commitearlo.'
    : 'No se pudo guardar: el navegador no deja escribir (modo privado o cuota llena).', ok);
  configPintar();
}

function configProyRestablecer() {
  SGADD_CONFIG.borrarOverride(configClubId() + '.preconfig');
  configProyBorrador(true);
  configAvisar('Se descartó el borrador local. La pantalla vuelve a lo que declara clubes/' +
    configClubId() + '.json, que es la configuración oficial del proyecto.', true);
  configPintar();
}

function configProyExportar() {
  CONFIGUI.proyExportando = !CONFIGUI.proyExportando;
  configPintar();
  if (CONFIGUI.proyExportando) {
    const pre = document.getElementById('configProyExport');
    if (pre && navigator.clipboard) {
      navigator.clipboard.writeText(pre.textContent).then(
        () => configAvisar('Copiado al portapapeles. Pegalo en clubes/' + configClubId() +
          '.json y commiteálo: recién ahí le llega al resto del cuerpo técnico.', true),
        () => {});
    }
  }
}

/* ---------------- render ---------------- */

function configPintarTimeline() {
  const n = document.getElementById('configTimeline');
  if (n) n.innerHTML = configTimelineHTML();
  const v = document.getElementById('configProyValidacion');
  if (v) v.innerHTML = configProyValidacionHTML();
}

/**
 * Línea de tiempo de los tramos.
 *
 * Es una barra por tramo sobre un eje común, no un Gantt de verdad: lo
 * que el administrador necesita ver de un vistazo es si los tramos
 * CUBREN el año y si se SUPERPONEN — dos tramos pisados son justamente
 * el caso en que el calendario no puede desempatar un partido huérfano.
 */
function configTimelineHTML() {
  const c = configCatActual();
  if (!c || !c.tramos || !c.tramos.length) {
    return '<p class="text-xs text-muted py-3">Sin tramos todavía.</p>';
  }
  const dia = (v) => SGADD_CONFIG._aDia(v);
  const conFechas = c.tramos.map((t, i) => {
    const vt = t.ventanaTemporal || {};
    return { i: i, label: t.label || t.id, desde: dia(vt.desde), hasta: dia(vt.hasta) };
  });
  const validos = conFechas.filter(t => t.desde && t.hasta && t.desde <= t.hasta);
  if (!validos.length) {
    return '<p class="text-xs text-muted py-3">Ningún tramo declara fechas todavía. ' +
      'Sin ellas el calendario no puede rescatar un partido que llegue sin etiqueta.</p>';
  }

  const min = new Date(Math.min.apply(null, validos.map(t => t.desde.getTime())));
  const max = new Date(Math.max.apply(null, validos.map(t => t.hasta.getTime())));
  const span = Math.max(1, max - min);
  const TONOS = ['zona-exito', 'zona-positivo', 'zona-aviso', 'zona-peligro', 'zona-neutro'];

  /* Superposiciones: se calculan sobre los tramos con fechas válidas y se
     nombran, porque es el defecto que rompe la asociación automática. */
  const pisados = [];
  for (let a = 0; a < validos.length; a++) {
    for (let b = a + 1; b < validos.length; b++) {
      if (validos[a].desde <= validos[b].hasta && validos[b].desde <= validos[a].hasta) {
        pisados.push(validos[a].label + ' y ' + validos[b].label);
      }
    }
  }

  const barras = conFechas.map((t) => {
    if (!t.desde || !t.hasta || t.desde > t.hasta) {
      return `<div class="flex items-center gap-2 py-1">
        <span class="text-[11px] text-muted w-32 shrink-0 truncate">${SGADD_UI.esc(t.label)}</span>
        <span class="text-[11px] text-red-400">${t.desde || t.hasta ? 'fechas incompletas o invertidas' : 'sin fechas'}</span>
      </div>`;
    }
    const izq = 100 * (t.desde - min) / span;
    const ancho = Math.max(1.5, 100 * (t.hasta - t.desde) / span);
    const tono = TONOS[t.i % TONOS.length];
    return `<div class="flex items-center gap-2 py-1 ${tono}">
      <span class="text-[11px] text-ink w-32 shrink-0 truncate">${SGADD_UI.esc(t.label)}</span>
      <span class="relative flex-1 h-3 rounded bg-surface2 min-w-0">
        <span class="absolute inset-y-0 rounded" style="left:${izq.toFixed(2)}%;width:${ancho.toFixed(2)}%;background:var(--zona)"></span>
      </span>
      <span class="font-mono text-[10px] text-muted w-40 shrink-0 text-right">${
        SGADD_UI.esc(SGADD_CONFIG.ventanaTexto({ desde: t.desde, hasta: t.hasta }))}</span>
    </div>`;
  }).join('');

  return barras + `
    <div class="flex justify-between font-mono text-[10px] text-muted mt-1 pt-1 border-t border-hairline/40">
      <span>${SGADD_UI.esc(SGADD_CONFIG.ventanaTexto({ desde: min }))}</span>
      <span>${SGADD_UI.esc(SGADD_CONFIG.ventanaTexto({ hasta: max }))}</span>
    </div>` +
    (pisados.length ? `<p class="text-[11px] text-yellow-400 mt-2">Se superponen: ${
      SGADD_UI.esc(pisados.join(' · '))}. Un partido que caiga en las dos ventanas NO se asocia
      a ninguna — la respuesta correcta ahí es "no sé", no "la primera".</p>` : '');
}

function configProyValidacionHTML() {
  const c = configCatActual();
  if (!c) return '<p class="text-xs text-muted">Ninguna categoría seleccionada.</p>';
  const avisos = [];
  const ids = {};
  (c.tramos || []).forEach((t) => {
    const id = String(t.id || '').trim();
    if (!id) avisos.push('Hay un tramo sin id.');
    else if (ids[id]) avisos.push('El id "' + id + '" está repetido.');
    ids[id] = true;
    if (!t.clave) avisos.push('"' + (t.label || id) + '" no está vinculado a ninguna clave del libro: no se va a poder auditar.');
    const vt = t.ventanaTemporal || {};
    const d = SGADD_CONFIG._aDia(vt.desde), h = SGADD_CONFIG._aDia(vt.hasta);
    if (d && h && d > h) avisos.push('"' + (t.label || id) + '" tiene las fechas invertidas.');
  });
  if (!Object.keys(ids).length) avisos.push('La categoría no declara ningún tramo.');
  if (!avisos.length) {
    return '<p class="text-xs text-green-400">Todos los tramos tienen id, vínculo con el libro y fechas coherentes.</p>';
  }
  return '<ul class="space-y-1.5">' + avisos.map(a => `
    <li class="flex gap-2.5">
      <span class="shrink-0 w-1 rounded-full bg-yellow-400"></span>
      <span class="text-xs text-yellow-400 break-words">${SGADD_UI.esc(a)}</span>
    </li>`).join('') + '</ul>';
}

function configTramosHTML2() {
  const c = configCatActual();
  if (!c) return '';
  const inp = 'bg-surface2 border border-hairline rounded px-2 py-1 text-xs text-ink outline-none focus:border-accent';
  return (c.tramos || []).map((t, i) => {
    const vt = t.ventanaTemporal || {};
    return `<div class="border border-hairline/60 rounded-lg p-3 mb-2">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <input type="text" value="${SGADD_UI.esc(t.label || '')}" placeholder="Nombre del tramo"
          aria-label="Nombre visible del tramo"
          oninput="configTramoCampo(${i}, 'label', this.value)"
          class="${inp} flex-1 min-w-[10rem] font-body">
        <input type="text" value="${SGADD_UI.esc(t.id || '')}" placeholder="id"
          aria-label="Identificador del tramo"
          oninput="configTramoCampo(${i}, 'id', this.value)"
          class="${inp} w-28 font-mono">
        <span class="flex gap-1 shrink-0">
          <button onclick="configTramoMover(${i}, -1)" aria-label="Subir"
            class="px-1.5 py-1 text-xs text-muted hover:text-ink" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button onclick="configTramoMover(${i}, 1)" aria-label="Bajar"
            class="px-1.5 py-1 text-xs text-muted hover:text-ink" ${
              i === c.tramos.length - 1 ? 'disabled' : ''}>▼</button>
          <button onclick="configTramoBorrar(${i})" aria-label="Borrar el tramo"
            class="px-1.5 py-1 text-xs text-muted hover:text-red-400">✕</button>
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-[10px] uppercase tracking-wider text-muted">Clave del libro</label>
        <input type="text" value="${SGADD_UI.esc(t.clave || '')}" placeholder="TORNEO|FASE"
          aria-label="Clave del libro, formato TORNEO|FASE"
          oninput="configTramoCampo(${i}, 'clave', this.value)"
          class="${inp} w-40 font-mono ${t.clave ? '' : 'border-yellow-400/60'}">
        <button onclick="configTramoSugerir(${i})"
          class="text-[10px] uppercase tracking-wider text-accent hover:underline">proponer</button>
        <label class="text-[10px] uppercase tracking-wider text-muted ml-2">Desde</label>
        <input type="date" value="${SGADD_UI.esc(vt.desde || '')}" aria-label="Fecha de inicio"
          oninput="configTramoCampo(${i}, 'desde', this.value)" class="${inp} w-36 font-mono">
        <label class="text-[10px] uppercase tracking-wider text-muted">Hasta</label>
        <input type="date" value="${SGADD_UI.esc(vt.hasta || '')}" aria-label="Fecha de cierre"
          oninput="configTramoCampo(${i}, 'hasta', this.value)" class="${inp} w-36 font-mono">
        <label class="text-[10px] uppercase tracking-wider text-muted ml-2">Equipos</label>
        <input type="number" value="${t.equiposEsperados === null || t.equiposEsperados === undefined ? '' : t.equiposEsperados}"
          placeholder="—" aria-label="Equipos esperados"
          oninput="configTramoCampo(${i}, 'equiposEsperados', this.value)" class="${inp} w-16 font-mono">
        <label class="text-[10px] uppercase tracking-wider text-muted">Fechas</label>
        <input type="number" value="${t.fechasEsperadas === null || t.fechasEsperadas === undefined ? '' : t.fechasEsperadas}"
          placeholder="—" aria-label="Fechas esperadas"
          oninput="configTramoCampo(${i}, 'fechasEsperadas', this.value)" class="${inp} w-16 font-mono">
      </div>
    </div>`;
  }).join('') || '<p class="text-xs text-muted py-3">Esta categoría no declara tramos todavía.</p>';
}

/* Cambiar de pestaña NO pierde el borrador: los dos viven en CONFIGUI
   y solo cambia cuál se pinta. */
function configPestana(id) { CONFIGUI.pestana = id; configPintar(); }

function configPestanaTorneo() {
  const p = configProyBorrador();
  const c = configCatActual();
  const ids = Object.keys(p.categorias);
  const inp = 'bg-surface2 border border-hairline rounded px-2 py-1 text-xs text-ink outline-none focus:border-accent';
  const btn = 'text-xs font-semibold uppercase tracking-wider rounded px-4 py-2 transition-colors';

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">Preconfiguración del torneo</h3>
        <span class="font-mono text-[11px] text-muted">${
          CONFIGUI.proyOrigen === 'local' ? 'borrador en este navegador'
          : CONFIGUI.proyOrigen === 'json' ? 'desde el JSON del club' : 'sin declarar'}</span>
      </div>
      <!-- PARA QUE SIRVE, arriba de todo. Es la pantalla mas abstracta del
           panel —declara una estructura que todavia no tiene datos— y sin
           decir que decide, se lee como un formulario administrativo. -->
      <p class="text-xs text-ink mb-3 rounded-md border border-accent/30 bg-accent/5 p-3">
        La preconfiguración define la <strong>estructura del torneo</strong>: fases, zonas,
        cortes de clasificación y desempates. Lo que se configure acá determina cómo el
        sistema calcula las <strong>Posiciones</strong>, la <strong>Clasificación</strong>,
        las <strong>rachas</strong> y el <strong>Simulador</strong>.
      </p>
      <p class="text-xs text-muted mb-3">
        Lo que el cliente declara en la <strong class="text-ink">entrevista</strong>, antes de que entre
        el primer box score. <strong class="text-ink">Los nombres son libres</strong>: escribí las
        categorías y los tramos como los llama su liga.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-[10px] uppercase tracking-wider text-muted">Cliente</label>
        <input type="text" value="${SGADD_UI.esc(p.cliente || '')}" aria-label="Nombre del cliente"
          oninput="CONFIGUI.proy.cliente = this.value; configProySucio();" class="${inp} flex-1 min-w-[12rem] font-body">
        <label class="text-[10px] uppercase tracking-wider text-muted">Declarado el</label>
        <input type="date" value="${SGADD_UI.esc(p.declaradoEl || '')}" aria-label="Fecha de la declaración"
          oninput="CONFIGUI.proy.declaradoEl = this.value; configProySucio();" class="${inp} w-36 font-mono">
        <input type="text" value="${SGADD_UI.esc(p.declaradoPor || '')}" placeholder="por quién / en qué instancia"
          aria-label="Origen de la declaración"
          oninput="CONFIGUI.proy.declaradoPor = this.value; configProySucio();" class="${inp} flex-1 min-w-[10rem] font-body">
      </div>
    </div>

    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">Categorías</h3>
        <button onclick="configCatAgregar()" class="text-[11px] text-accent hover:underline">+ categoría</button>
      </div>
      ${ids.length ? `
        <div class="flex flex-wrap gap-1 mb-3">
          ${ids.map(id => `<button onclick="configCatElegir('${SGADD_UI.escJs(id)}')"
            class="px-3 py-1.5 text-xs rounded-md transition-colors ${
              id === CONFIGUI.catSel ? 'bg-accent text-base' : 'text-muted hover:text-ink hover:bg-surface2'}">
            ${SGADD_UI.esc(p.categorias[id].label || id)}</button>`).join('')}
        </div>` : `
        <div class="text-center py-8 px-4">
          <div class="text-3xl mb-2" aria-hidden="true">🗂️</div>
          <p class="font-display uppercase tracking-wide text-sm text-ink mb-1">No hay categorías preconfiguradas</p>
          <p class="text-xs text-muted max-w-md mx-auto mb-4">
            Todavía nadie declaró cómo se organiza este torneo. El panel funciona igual,
            pero sin declaración no hay contra qué contrastar lo que trae el libro.
          </p>
          <button onclick="configCatAgregar()" class="${btn} bg-accent text-base hover:opacity-90">
            + Agregar primera categoría</button>
        </div>`}

      ${c ? `
        <div class="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b border-hairline">
          <label class="text-[10px] uppercase tracking-wider text-muted">Nombre</label>
          <input type="text" value="${SGADD_UI.esc(c.label || '')}" aria-label="Nombre de la categoría"
            oninput="configCatCampo('label', this.value)" class="${inp} flex-1 min-w-[10rem] font-body">
          <label class="text-[10px] uppercase tracking-wider text-muted">id</label>
          <input type="text" value="${SGADD_UI.esc(CONFIGUI.catSel || '')}" aria-label="Identificador de la categoría"
            onchange="configCatRenombrarId('${SGADD_UI.escJs(CONFIGUI.catSel || '')}', this.value)"
            class="${inp} w-40 font-mono">
          <label class="text-[10px] uppercase tracking-wider text-muted">Planilla</label>
          <input type="text" value="${SGADD_UI.esc(c.planilla || '')}" placeholder="(usa el id)"
            aria-label="Planilla del catálogo con la que se corresponde"
            oninput="configCatCampo('planilla', this.value)" class="${inp} w-48 font-mono">
          <button onclick="configCatBorrar('${SGADD_UI.escJs(CONFIGUI.catSel || '')}')"
            class="ml-auto text-[11px] text-muted hover:text-red-400">Borrar categoría</button>
        </div>

        <div class="flex items-baseline justify-between gap-3 mb-2">
          <span class="text-[11px] uppercase tracking-wider text-muted">Tramos</span>
          <button onclick="configTramoAgregar()" class="text-[11px] text-accent hover:underline">+ tramo</button>
        </div>
        ${configTramosHTML2()}
        <p class="text-[11px] text-muted mt-2">
          <span class="font-mono">Clave del libro</span> es lo que ata este tramo a los datos
          (<span class="font-mono">TORNEO|FASE</span>). Se declara a mano a propósito: emparejarlo por
          parecido de nombre certificaría el tramo equivocado sin que nadie lo note.
          Las <span class="font-mono">fechas</span> son el respaldo — si un partido llega sin etiqueta,
          el calendario lo asocia solo.
        </p>` : ''}
    </div>

    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">Línea de tiempo</h3>
      <div id="configTimeline">${configTimelineHTML()}</div>
    </div>

    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">Validación</h3>
      <div id="configProyValidacion">${configProyValidacionHTML()}</div>
    </div>

    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <div class="flex flex-wrap items-center gap-3">
        <button onclick="configProyGuardar()" class="${btn} bg-accent text-base hover:bg-accentdeep"
          title="Queda solo en este navegador y en este dispositivo">
          Guardar en este navegador</button>
        <button onclick="configProyExportar()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30"
          title="Copia el bloque limpio para pegarlo en el JSON y commitearlo">
          ${CONFIGUI.proyExportando ? 'Ocultar' : 'Exportar'} el bloque JSON</button>
        <button onclick="configProyRestablecer()" class="${btn} border border-hairline text-muted hover:text-ink hover:border-ink/30"
          title="Descarta el borrador local y vuelve a la configuración oficial">
          Volver al JSON del club</button>
        ${CONFIGUI.proySucia ? '<span class="text-[11px] text-yellow-400">Hay cambios sin guardar.</span>' : ''}
      </div>
      <!-- Las tres acciones hacen cosas distintas y la diferencia importa:
           una guarda local, otra da lo que se commitea y la tercera
           descarta. Un DT que las confunda cree que publicó algo que no
           publicó. -->
      <ul class="text-[11px] text-muted mt-4 space-y-1">
        <li><strong class="text-ink">Guardar en este navegador</strong> — la vista previa queda en
          <span class="font-mono">localStorage</span>, solo en este dispositivo. Nadie más la ve.</li>
        <li><strong class="text-ink">Exportar el bloque JSON</strong> — copia el objeto limpio al
          portapapeles, listo para pegar en <span class="font-mono">clubes/${SGADD_UI.esc(configClubId())}.json</span>
          y commitear. <em>Recién ahí le llega al resto del cuerpo técnico.</em></li>
        <li><strong class="text-ink">Volver al JSON del club</strong> — descarta el borrador local y
          restablece la configuración oficial del proyecto.</li>
      </ul>
      ${CONFIGUI.proyExportando ? `
        <pre id="configProyExport" class="scrollbox bg-surface2 border border-hairline rounded p-3 mt-4 text-[11px] font-mono text-ink overflow-x-auto whitespace-pre">${
          SGADD_UI.esc('"preconfiguracion": ' + JSON.stringify(CONFIGUI.proy, null, 2))}</pre>` : ''}
    </div>`;
}

