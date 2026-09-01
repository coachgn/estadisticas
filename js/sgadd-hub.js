/* =====================================================================
   SGADD · Hub de clientes · la pestaña Clientes del Panel Master

   Se consulta el catálogo entero de clientes y se da de alta desde acá.

   EL ALTA ESCRIBE DE VERDAD, y por eso conviene saber por dónde. El panel
   es estático y el token de escritura de KV NO puede llegar al navegador,
   así que el guardado NO escribe: le manda una INTENCIÓN a
   `POST /api/v1/catalogo` —solo admin, re-derivado contra la lista del
   servidor— y el servidor la aplica sobre lo que HAY, con sus guards.

   NUNCA SE MANDA UN CATÁLOGO ENTERO. Es la diferencia que importa: el
   catálogo es la única pieza cuyo deterioro rompe a TODOS los clubes a la
   vez, y aceptar el objeto completo convertiría cualquier bug de esta
   pantalla en una pérdida de datos general.

   LA LISTA SALE DEL CATÁLOGO DEL SERVIDOR. No hay un listado de clubes en
   el repo —`?club=<id>` resuelve por convención (punto 6)— y escribir uno
   acá sería la segunda fuente de verdad de siempre.
   ===================================================================== */

const SGADD_HUB = (function () {
  'use strict';

  const esc = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.esc)
    ? SGADD_UI.esc(v) : String(v == null ? '' : v);

  /* Un mail no lleva comillas, pero el handler inline se interpola igual
     con `escJs`: el dia que alguien pegue un valor raro, la comilla cierra
     el literal de JS y el clic deja de hacer nada, en silencio (punto 3
     quinquies). Y sin declararlo, cada repintado de la lista tira un
     ReferenceError que se traga el `.catch` del fetch — medido en
     produccion: el alta funcionaba y la pantalla mostraba "escJs is not
     defined". */
  const escJs = (v) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.escJs)
    ? SGADD_UI.escJs(v) : esc(v);

  /* El borrador del alta. Vive en el módulo y no en el DOM: tipear no
     repinta —le sacaría el foco al input, la regla de siempre (punto 17)—
     así que el valor tiene que estar en algún lado cuando se arme el
     comando. */
  const alta = { club: '', nombre: '', categoria: '', label: '', sheet: '',
                 liga: '', equipoPropio: '' };

  /* El resultado del último guardado. Se muestra en la pantalla y no en un
     `alert()`: el motivo de rechazo del servidor es un texto que dice qué
     corregir, y un alert lo hace desaparecer justo cuando hay que leerlo
     mientras se arregla el campo. */
  const guardado = { estado: null, mensaje: '' };   // null | 'yendo' | 'ok' | 'error'

  /* Qué club tiene una acción en vuelo, y su error si falló. Se guarda el
     ID y no un booleano para poder deshabilitar SOLO los controles de esa
     tarjeta: con un flag global, tocar el plan de un cliente congelaría
     los botones de los otros cuarenta y nueve. */
  const pendiente = { club: null, clubError: null, error: '' };

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

  const ESTADOS = ['activo', 'pausado', 'inactivo'];
  const PLANES = ['BRONCE', 'PLATA', 'ORO'];

  /* Los nombres viejos siguen viniendo del catálogo —hay clubes guardados
     en `"PRO"`— así que el desplegable tiene que poder marcar cuál está
     elegido. Sin esto, un club en PRO mostraría BRONCE seleccionado y el
     admin lo leería como un downgrade que nadie hizo. */
  const ALIAS_PLAN = { BASICO: 'BRONCE', PRO: 'PLATA', MASTER: 'ORO' };
  function planCanonico(p) {
    const v = String(p == null ? '' : p).trim().toUpperCase();
    const c = ALIAS_PLAN[v] || v;
    return PLANES.indexOf(c) !== -1 ? c : 'BRONCE';
  }

  /* QUÉ INCLUYE CADA PLAN, en la pantalla donde se elige. Sin esto el
     desplegable son tres palabras y el admin tiene que acordarse de qué
     vendió. ORO es el que más lo necesita: lo que agrega no es una
     pantalla del panel sino un servicio que se entrega aparte. */
  const QUE_INCLUYE = {
    BRONCE: 'Equipos, jugadores, clasificación y rankings de la liga.',
    PLATA: 'Todo Bronce + informe de scouting pre-partido.',
    ORO: 'Todo Plata + análisis de scouters de MotorStats.ar en ciclos cada '
      + '4 partidos del equipo y jugadores: puntos de fuga, factores de mejora '
      + 'y plan de ajuste para el siguiente ciclo.',
  };

  /**
   * El estado EFECTIVO, calculado igual que en el servidor.
   *
   * SE REPITE LA REGLA A PROPÓSITO, y conviene saber por qué: el servidor
   * es el que la hace valer —devuelve 403— y esta copia existe solo para
   * PINTAR. Si divergieran, la pantalla mostraría "activo" sobre un club
   * al que el backend ya le está negando los datos, que es la peor forma
   * de fallar: el admin ve todo bien y el cliente no puede entrar.
   *
   * Hay un test que las compara sobre los mismos casos.
   */
  function estadoEfectivo(c, ahora) {
    const e = ESTADOS.indexOf(c && c.estado) !== -1 ? c.estado : 'activo';
    if (e !== 'activo') return e;
    if (!c || !c.vence || !/^\d{4}-\d{2}-\d{2}$/.test(c.vence)) return 'activo';
    /* Fin del día, no su comienzo: contra la medianoche, el cliente
       figuraría vencido el mismo día que dice su factura. */
    const fin = Date.parse(c.vence + 'T23:59:59.999Z');
    return (ahora === undefined ? Date.now() : ahora) > fin ? 'vencido' : 'activo';
  }

  /** Cuántos días faltan. Negativo = ya pasó. `null` si no hay fecha. */
  function diasPara(vence, ahora) {
    if (!vence || !/^\d{4}-\d{2}-\d{2}$/.test(vence)) return null;
    const fin = Date.parse(vence + 'T23:59:59.999Z');
    if (!isFinite(fin)) return null;
    return Math.ceil((fin - (ahora === undefined ? Date.now() : ahora)) / 86400000);
  }

  const PARTIDOS_POR_CICLO = 4;

  /**
   * En qué punto del ciclo de informes está un club. Réplica de la del
   * servidor, y por el mismo motivo que `estadoEfectivo`: acá es SOLO para
   * pintar. Hay un test que compara las dos.
   *
   * SE DERIVA DE LOS PARTIDOS JUGADOS y del partido en que arrancó el
   * ciclo, no de un contador 1..4 guardado. Con el contador suelto habría
   * que resetearlo a mano cada cuatro, y el día que no se hace queda
   * mintiendo para siempre.
   */
  function ciclo(c, pj) {
    const jugados = Number(pj);
    if (!isFinite(jugados) || jugados < 0) return null;
    const desde = Number(c && c.cicloDesde);
    const base = (isFinite(desde) && desde >= 0) ? desde : 0;
    const enCiclo = Math.max(0, jugados - base);
    const posicion = enCiclo % PARTIDOS_POR_CICLO;
    const completos = Math.floor(enCiclo / PARTIDOS_POR_CICLO);
    const entregados = Number(c && c.informesEntregados) || 0;
    return {
      de: PARTIDOS_POR_CICLO,
      en: (posicion === 0 && enCiclo > 0) ? PARTIDOS_POR_CICLO : posicion,
      completos: completos,
      faltan: (posicion === 0 && enCiclo > 0) ? 0 : (PARTIDOS_POR_CICLO - posicion),
      entregados: entregados,
      toca: completos > entregados,
    };
  }

  /**
   * Los partidos jugados por el equipo propio de un club.
   *
   * SOLO SE SABEN DEL CLUB ABIERTO: los partidos salen del índice, y el
   * panel tiene UN índice por vez. Para los demás devuelve `null` y la
   * pantalla lo dice —"abrí el cliente para ver el ciclo"— en vez de
   * mostrar un 0/4 que se leería como "recién arranca".
   */
  function pjDelClub(c) {
    if (typeof CLUB === 'undefined' || !CLUB.estado || CLUB.estado.id !== c.id) return null;
    const idx = (typeof SGADD_APP !== 'undefined') ? SGADD_APP.estado.idx : null;
    if (!idx || !c.equipoPropio) return null;
    try {
      const e = idx.get(SGADD.claveEquipo(c.equipoPropio));
      return e ? (e.record ? e.record.pj : null) : null;
    } catch (err) { return null; }
  }

  const TONO_ESTADO = {
    activo: 'zona-exito', pausado: 'zona-aviso',
    vencido: 'zona-peligro', inactivo: 'zona-neutro',
  };

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

/* =====================================================================
   LOS ACCESOS DE CADA CLUB

   Qué mails pueden entrar, y cuántos permite su plan. Se piden aparte del
   catálogo y por su propio endpoint (`/api/v1/clientes`), no porque sea
   más cómodo sino porque el catálogo se sirve a CUALQUIERA con token: los
   mails de un club adentro del catálogo le contarían a cada cliente
   quiénes son los del resto.

   Se carga por demanda, al desplegar la sección de un club: pedir los
   accesos de los tres clubes en cada pintado es tráfico para una lista
   que casi nunca se mira.
   ===================================================================== */

  /* club -> { cargando, error, plan, cupo, mails[] } */
  const accesos = {};
  /* Qué club tiene la sección desplegada. UNO por vez: con tres abiertas
     la lista de clubes deja de ser una lista y hay que scrollear para
     comparar dos. */
  const accesosAbierto = { club: null, nuevo: '', yendo: false, error: '', codigo: null };

  function verAccesos(club) {
    if (accesosAbierto.club === club) { accesosAbierto.club = null; repintarLista(); return; }
    accesosAbierto.club = club;
    accesosAbierto.nuevo = ''; accesosAbierto.error = ''; accesosAbierto.codigo = null;
    if (!accesos[club]) cargarAccesos(club); else repintarLista();
  }

  function cargarAccesos(club) {
    accesos[club] = { cargando: true };
    repintarLista();
    SGADD_DATA.clientes(club).then((r) => {
      const c = (r.clubes || [])[0];
      accesos[club] = c ? { plan: c.plan, cupo: c.cupo, mails: c.mails || [] }
        : { error: 'Ese club no está en el catálogo.' };
      repintarLista();
    }).catch((e) => {
      accesos[club] = { error: e.message || 'No se pudieron leer los accesos.' };
      repintarLista();
    });
  }

  function campoAcceso(v) {
    /* Tipear NO repinta: le sacaría el foco al input. Misma regla que el
       buscador del buzón y los campos de scouting. */
    accesosAbierto.nuevo = String(v == null ? '' : v);
  }

  /**
   * Alta, baja o reinvitación de un mail.
   *
   * EL CÓDIGO SE MUESTRA UNA SOLA VEZ. No se puede volver a leer —el
   * servidor guarda su hash— así que la pantalla lo deja a la vista con
   * un botón de copiar hasta que el admin haga otra cosa. Si se pierde,
   * se reinvita: es barato y no rompe la clave que el cliente ya tenga.
   */
  function accionAcceso(club, accion, email) {
    if (accesosAbierto.yendo) return;
    const mail = String(email !== undefined ? email : accesosAbierto.nuevo).trim();
    if (!mail) return;
    if (accion === 'baja' && typeof confirm === 'function' &&
        !confirm('Sacar a ' + mail + ' le corta el acceso y borra su clave. ¿Seguimos?')) return;

    accesosAbierto.yendo = true; accesosAbierto.error = ''; accesosAbierto.codigo = null;
    repintarLista();

    SGADD_DATA.guardarClientes({ accion: accion, club: club, email: mail }).then((r) => {
      accesosAbierto.yendo = false;
      accesos[club] = { plan: (accesos[club] || {}).plan, cupo: r.cupoActual, mails: r.mails || [] };
      if (accion === 'alta') accesosAbierto.nuevo = '';
      if (r.codigo) accesosAbierto.codigo = { email: mail, codigo: r.codigo, venceEn: r.venceEn };
      repintarLista();
    }).catch((e) => {
      accesosAbierto.yendo = false;
      accesosAbierto.error = e.message || 'No se pudo aplicar el cambio.';
      repintarLista();
    });
  }

  function copiarCodigo(ev) {
    const c = accesosAbierto.codigo;
    if (!c || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(c.codigo).then(() => {
      if (ev && ev.target) ev.target.textContent = 'Copiado';
    }).catch(() => {
      if (ev && ev.target) ev.target.textContent = 'No se pudo copiar';
    });
  }

  function estadoMail(m) {
    if (m.bloqueado) return { txt: 'Bloqueado', tono: 'zona-peligro' };
    if (m.tieneClave) return { txt: 'Con clave', tono: 'zona-exito' };
    if (m.invitacionPendiente) return { txt: 'Invitado', tono: 'zona-aviso' };
    return { txt: 'Sin acceso', tono: 'zona-neutro' };
  }

  function bloqueAccesos(c) {
    const abierto = accesosAbierto.club === c.id;
    const d = accesos[c.id];

    const resumen = d && d.cupo
      ? d.cupo.usados + '/' + d.cupo.tope
      : (d && d.cargando ? '…' : '');

    const cabecera = `<button type="button" onclick="SGADD_HUB.verAccesos('${esc(c.id)}')"
      aria-expanded="${abierto}"
      class="w-full flex items-center gap-2 text-left mt-3 pt-3 border-t border-hairline/60
             text-[11px] text-muted hover:text-ink transition-colors">
      <span class="opacity-60">${abierto ? '▾' : '▸'}</span>
      <span class="font-display uppercase tracking-wider">Quiénes pueden entrar</span>
      ${resumen ? `<span class="font-mono ml-auto">${esc(resumen)} mails</span>` : ''}
    </button>`;

    if (!abierto) return cabecera;
    if (!d || d.cargando) return cabecera + '<p class="text-[11px] text-muted mt-2">Leyendo los accesos…</p>';
    if (d.error) return cabecera + `<p class="text-[11px] zona-texto zona-peligro mt-2">${esc(d.error)}</p>`;

    const lleno = d.cupo && d.cupo.libres <= 0;

    return cabecera + `<div class="mt-2 space-y-2">
      <p class="text-[11px] text-muted">
        El plan <b>${esc(d.cupo.plan)}</b> admite <b>${d.cupo.tope}</b>
        ${d.cupo.tope === 1 ? 'mail' : 'mails'}. Cada uno entra con su propia clave.
      </p>

      ${d.mails.length ? `<ul class="space-y-1">${d.mails.map(m => {
        const e2 = estadoMail(m);
        return `<li class="flex items-center gap-2 text-[11px]">
          <span class="font-mono text-ink truncate">${esc(m.email)}</span>
          <span class="zona-texto ${e2.tono} shrink-0">${e2.txt}</span>
          <span class="ml-auto flex items-center gap-2 shrink-0">
            <button type="button" onclick="SGADD_HUB.accionAcceso('${esc(c.id)}', 'reinvitar', '${escJs(m.email)}')"
              class="text-accent hover:underline" title="Genera un código nuevo. No le borra la clave que ya tenga.">Reinvitar</button>
            <button type="button" onclick="SGADD_HUB.accionAcceso('${esc(c.id)}', 'baja', '${escJs(m.email)}')"
              class="text-muted hover:text-ink">Sacar</button>
          </span>
        </li>`;
      }).join('')}</ul>` : '<p class="text-[11px] text-muted">Todavía no hay ningún mail dado de alta.</p>'}

      ${lleno
        ? `<p class="text-[11px] zona-texto zona-aviso">El plan está lleno. Sacá un mail, o subile el plan al club.</p>`
        : `<div class="flex items-center gap-2">
            <input type="email" value="${esc(accesosAbierto.nuevo)}" id="hubMail_${esc(c.id)}"
              placeholder="mail del cuerpo técnico"
              oninput="SGADD_HUB.campoAcceso(this.value)"
              onkeydown="if(event.key==='Enter')SGADD_HUB.accionAcceso('${escJs(c.id)}','alta')"
              class="flex-1 min-w-0 bg-surface2 border border-hairline rounded-md px-2 py-1.5 text-[11px] text-ink">
            <button type="button" onclick="SGADD_HUB.accionAcceso('${escJs(c.id)}','alta')"
              ${accesosAbierto.yendo ? 'disabled' : ''}
              class="px-2.5 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider
                     bg-accent text-base hover:opacity-90 disabled:opacity-40 shrink-0">
              ${accesosAbierto.yendo ? 'Un momento…' : 'Invitar'}</button>
          </div>`}

      ${accesosAbierto.error ? `<p class="text-[11px] zona-texto zona-peligro">${esc(accesosAbierto.error)}</p>` : ''}

      ${accesosAbierto.codigo ? `<div class="rounded-md border border-accent/40 bg-accent/5 p-2">
        <p class="text-[10px] uppercase tracking-wider text-accent font-display mb-1">
          Código para ${esc(accesosAbierto.codigo.email)}</p>
        <p class="font-mono text-[10px] text-ink break-all">${esc(accesosAbierto.codigo.codigo)}</p>
        <p class="text-[10px] text-muted mt-1">
          Se muestra UNA vez y no se puede volver a leer: el servidor guarda su huella, no el código.
          Pasáselo por un canal privado. Vence el ${esc(String(accesosAbierto.codigo.venceEn || '').slice(0, 10))}.
          <button type="button" onclick="SGADD_HUB.copiarCodigo(event)"
            class="text-accent hover:underline ml-1">Copiar</button>
        </p>
      </div>` : ''}
    </div>`;
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
      ${bloqueSuscripcion(c)}
      ${bloqueAccesos(c)}

      <div class="mt-3 flex items-center gap-3 flex-wrap">
        ${actual
          ? '<span class="text-[11px] text-muted">Sus zonas y su torneo se editan en las otras dos pestañas.</span>'
          : `<button onclick="SGADD_CLIENTES.elegir('${esc(c.id)}')"
               class="text-[11px] font-display uppercase tracking-wider text-accent hover:underline">
               Abrir este cliente →</button>`}
        <span class="text-[11px] text-muted ml-auto">${conDatos}/${cats.length} con libro</span>
      </div>
    </div>`;
  }

  /**
   * Los controles de suscripción de un club.
   *
   * TODO CAMBIO ES INMEDIATO Y PARA TODOS LOS USUARIOS DE ESE CLUB, así que
   * el texto lo dice y los botones no se agrupan con el resto: pausar a un
   * cliente por error es de las pocas cosas de esta pantalla que se notan
   * del otro lado en el acto.
   */
  /**
   * El seguimiento del servicio ORO.
   *
   * Solo se pinta para los clubes en ORO: para los demás no hay ciclo que
   * seguir y sería una fila muerta permanente en cada tarjeta.
   */
  function bloqueOro(c) {
    if (planCanonico(c.plan) !== 'ORO') return '';
    const pj = pjDelClub(c);
    const ci = ciclo(c, pj);
    const yendo = pendiente.club === c.id;

    return `<div class="mt-2 rounded-md border border-hairline/60 p-2">
      <div class="flex items-center gap-2 flex-wrap text-[11px]">
        <span class="font-display uppercase tracking-wider zona-texto zona-aviso">◆ Oro</span>
        ${ci
          ? `<span class="text-ink font-mono">ciclo ${ci.en}/${ci.de}</span>
             ${ci.toca
               ? '<span class="zona-texto zona-peligro">toca informe</span>'
               : `<span class="text-muted">faltan ${ci.faltan} partido${ci.faltan === 1 ? '' : 's'}</span>`}
             <span class="text-muted">· ${ci.entregados} entregado${ci.entregados === 1 ? '' : 's'}</span>`
          /* Sin índice de ese club no se puede saber en qué partido va, y
             un 0/4 inventado se leería como "recién arranca". */
          : `<span class="text-muted">${c.informesEntregados || 0} informe${(c.informesEntregados || 0) === 1 ? '' : 's'} entregado${(c.informesEntregados || 0) === 1 ? '' : 's'} · abrí el cliente para ver el ciclo</span>`}
        <button onclick="SGADD_HUB.accionClub('${esc(c.id)}','informe_entregado')"
          ${yendo ? 'disabled' : ''}
          class="ml-auto text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded
                 border border-hairline hover:border-accent hover:text-accent disabled:opacity-40">
          Marcar entregado</button>
      </div>
      <p class="text-[10px] text-muted mt-1">${esc(QUE_INCLUYE.ORO)}</p>
    </div>`;
  }

  function bloqueSuscripcion(c) {
    /* Solo se pinta si el servidor mandó el estado comercial, o sea si
       quien mira es admin. Para un cliente ese campo no viaja. */
    if (c.estado === undefined && c.plan === undefined && c.vence === undefined) return '';

    const ef = estadoEfectivo(c);
    const dias = diasPara(c.vence);
    const yendo = pendiente.club === c.id;

    const btn = (accion, texto, extra) => `<button
      onclick="SGADD_HUB.accionClub('${esc(c.id)}','${accion}'${extra || ''})"
      ${yendo ? 'disabled' : ''}
      class="text-[11px] font-display uppercase tracking-wider px-2 py-1 rounded
             border border-hairline hover:border-accent hover:text-accent disabled:opacity-40">
      ${texto}</button>`;

    return `<div class="mt-3 pt-3 border-t border-hairline/40">
      <div class="flex items-center gap-2 flex-wrap text-[11px]">
        <span class="zona-texto ${TONO_ESTADO[ef] || 'zona-neutro'}">● ${esc(ef)}</span>
        <span class="text-muted">·</span>
        <span class="text-muted">plan</span>
        <select onchange="SGADD_HUB.accionClub('${esc(c.id)}','cambiar_plan',this.value)"
          ${yendo ? 'disabled' : ''} class="sel-cliente" style="max-width:8rem">
          ${PLANES.map(p => `<option value="${p}"${(planCanonico(c.plan) === p) ? ' selected' : ''}>${p}</option>`).join('')}
        </select>
        <span class="text-muted">·</span>
        <span class="text-muted">vence</span>
        <input type="date" value="${esc(c.vence || '')}"
          onchange="SGADD_HUB.accionClub('${esc(c.id)}','renovar',this.value)"
          ${yendo ? 'disabled' : ''}
          class="bg-surface2 border border-hairline rounded px-2 py-1 text-[11px] text-ink">
        ${dias === null ? '<span class="text-muted">sin vencimiento</span>'
          : dias < 0 ? `<span class="zona-texto zona-peligro">venció hace ${-dias} d</span>`
          /* El aviso arranca a los 30 días: es el tiempo que da para
             llamar al cliente antes de que se corte, no después. */
          : dias <= 30 ? `<span class="zona-texto zona-aviso">faltan ${dias} d</span>`
          : `<span class="text-muted">en ${dias} d</span>`}
      </div>
      <p class="text-[10px] text-muted mt-1">${esc(QUE_INCLUYE[planCanonico(c.plan)] || '')}</p>

      ${bloqueOro(c)}

      <div class="flex items-center gap-2 flex-wrap mt-2">
        ${(c.estado || 'activo') === 'activo' ? btn('pausar', 'Pausar') : btn('reactivar', 'Reactivar')}
        ${(c.estado || 'activo') !== 'inactivo' ? btn('desactivar', 'Dar de baja') : ''}
        <span class="text-[10px] text-muted">
          ${(c.estado || 'activo') === 'activo'
            ? 'Pausar conserva todo y solo corta el acceso.'
            : 'La configuración está intacta: reactivar es un click.'}</span>
      </div>
      ${pendiente.clubError === c.id && pendiente.error
        ? `<p class="text-[11px] mt-2 zona-texto zona-peligro">${esc(pendiente.error)}</p>` : ''}
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
    const puede = cmd && !malClub && !malCat;

    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Alta de cliente o categoría</h3>
      <p class="text-xs text-muted mb-4">
        Da de alta un cliente nuevo o agrega una categoría a uno que ya está. Guardar
        <strong class="text-ink">publica para todos los usuarios de ese club</strong>.
        Un <code>sheetId</code> que la cuenta de servicio no pueda leer da 502 al abrir
        la categoría: probalo antes con <code>probar-google.js --sheets</code>.
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
      <div class="grid sm:grid-cols-2 gap-3 mt-3">
        ${campo('liga', 'liga', alta.liga,
          'la carpeta de escudos: <code>logos/&lt;liga&gt;/</code>. Solo para un club nuevo.')}
        ${campo('equipoPropio', 'equipo propio', alta.equipoPropio,
          'como lo escribe la planilla. <strong class="text-ink">La letra importa</strong>: ' +
          '<code>RECONQUISTA</code> no reconoce a <code>RECONQUISTA A</code>.')}
      </div>
      <div class="mt-3">
        ${campo('sheet', 'sheetId del libro', alta.sheet,
          'el id de Google Sheets. <strong class="text-ink">Probalo antes</strong> con ' +
          '<code>probar-google.js --sheets</code>: un libro no compartido da 502 en producción.')}
      </div>

      ${malClub || malCat ? `<p class="text-xs mt-3 zona-texto zona-peligro">
        Un id es una CLAVE, no un título: va en minúsculas, sin espacios ni acentos.
        Viaja en la URL y nombra el archivo de marca.</p>` : ''}

      ${puede ? `
        <div class="mt-4 flex items-center gap-3 flex-wrap">
          <button onclick="SGADD_HUB.guardar()"
            ${guardado.estado === 'yendo' ? 'disabled' : ''}
            class="px-3 py-1.5 rounded-md text-xs font-display uppercase tracking-wider
                   bg-accent text-base hover:opacity-90 disabled:opacity-50">
            ${guardado.estado === 'yendo' ? 'Guardando…' : 'Guardar en el catálogo'}</button>
          <span class="text-[11px] text-muted">Se publica para todos los usuarios de ese club.</span>
        </div>
        <details class="mt-3">
          <summary class="text-[11px] text-muted cursor-pointer">o hacerlo por CLI</summary>
          <pre class="bg-surface2 border border-hairline rounded-md p-3 text-[11px] text-ink overflow-x-auto mt-2"><code>${esc(cmd)}</code></pre>
        </details>`
        : `<p class="text-xs text-muted mt-4">Falta ${esc(faltan.join(', '))}.</p>`}

      ${guardado.estado === 'ok' ? `<p class="text-xs mt-3 zona-texto zona-exito">${esc(guardado.mensaje)}</p>` : ''}
      ${guardado.estado === 'error' ? `<p class="text-xs mt-3 zona-texto zona-peligro">${esc(guardado.mensaje)}</p>` : ''}
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
          un listado de clubes. Los <code>sheetId</code> no viajan al navegador —
          para verlos está <code>catalogo.js listar</code>, que corre con tus credenciales.
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
  /**
   * Guarda de verdad. Manda una INTENCIÓN, no un catálogo.
   *
   * El motivo de rechazo del servidor se muestra TAL CUAL: están escritos
   * para que el admin sepa qué corregir («pegá el id, no la URL entera»),
   * y traducirlos acá los degradaría a un «error al guardar» genérico.
   */
  function guardar() {
    if (guardado.estado === 'yendo') return;
    guardado.estado = 'yendo'; guardado.mensaje = '';
    refrescarAlta();

    SGADD_DATA.guardarCatalogo({
      accion: 'alta',
      club: alta.club, nombre: alta.nombre,
      categoria: alta.categoria, label: alta.label,
      sheetId: alta.sheet,
      liga: alta.liga, equipoPropio: alta.equipoPropio,
    }).then((r) => {
      guardado.estado = 'ok';
      guardado.mensaje = (r.creoClub ? 'Cliente creado. ' : 'Categoría guardada. ')
        + (r.aviso || '');
      /* La lista se repinta con lo que devolvió el SERVIDOR, no con lo que
         este formulario creyó mandar: si un guard recortó algo, se ve. */
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) {
        SGADD_CLIENTES.estado.clubes = r.clubes;
        SGADD_CLIENTES.pintar();
      }
      const n = document.getElementById('hubClientes');
      if (n) n.innerHTML = html();
    }).catch((e) => {
      guardado.estado = 'error';
      guardado.mensaje = e.message || 'No se pudo guardar.';
      refrescarAlta();
    });
  }

  /**
   * Pausar, reactivar, dar de baja, cambiar el plan o renovar.
   *
   * SIN CONFIRMACIÓN para pausar y cambiar el plan —son reversibles de un
   * click y el estado queda a la vista— pero SÍ para la baja: es la única
   * que el cliente lee como el final de la relación, y un `confirm()` es
   * barato al lado de tener que explicar por qué se cortó.
   */
  function accionClub(club, accion, valor) {
    if (pendiente.club) return;
    if (accion === 'desactivar' &&
        typeof confirm === 'function' &&
        !confirm('Dar de baja a este cliente le corta el acceso a todos sus usuarios. '
          + 'La configuración se conserva. ¿Seguimos?')) return;

    pendiente.club = club; pendiente.error = ''; pendiente.clubError = null;
    repintarLista();

    const cuerpo = { accion: accion, club: club };
    if (accion === 'cambiar_plan') cuerpo.plan = valor;
    if (accion === 'renovar') cuerpo.vence = valor || '';

    SGADD_DATA.guardarCatalogo(cuerpo).then((r) => {
      pendiente.club = null;
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) {
        SGADD_CLIENTES.estado.clubes = r.clubes;
        SGADD_CLIENTES.pintar();
      }
      repintarLista();
    }).catch((e) => {
      /* El motivo del servidor se muestra en la tarjeta del club, no en un
         cartel general: con cincuenta clientes en pantalla hay que poder
         ver CUÁL falló sin buscarlo. */
      pendiente.club = null;
      pendiente.clubError = club;
      pendiente.error = e.message || 'No se pudo aplicar el cambio.';
      repintarLista();
    });
  }

  function repintarLista() {
    const n = document.getElementById('hubClientes');
    if (n) n.innerHTML = html();
  }

  function refrescarAlta() {
    const n = document.getElementById('hubAlta');
    if (n) n.innerHTML = bloqueAlta();
  }

  function campoAlta(id, valor) {
    if (!(id in alta)) return;
    alta[id] = String(valor == null ? '' : valor);
    guardado.estado = null;   // tocar un campo borra el resultado anterior
    refrescarAlta();
  }

  return {
    /* motor */
    comandoAlta, faltantesAlta, idValido,
    /* ui */
    estadoEfectivo, diasPara, planCanonico, ciclo, ESTADOS, PLANES,
    QUE_INCLUYE, PARTIDOS_POR_CICLO,
    html, bloqueAlta, campoAlta, guardar, accionClub, alta, guardado, pendiente,
    /* accesos */
    verAccesos, campoAcceso, accionAcceso, copiarCodigo, estadoMail, bloqueAccesos,
    accesos, accesosAbierto,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_HUB;
