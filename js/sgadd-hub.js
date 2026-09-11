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
  const alta = {
    modo: 'nuevo',        // 'nuevo', o el id del club que se está editando
    club: '', nombre: '', liga: '', equipoPropio: '',
    acento: '',           // el color de marca, #rrggbb · vacío = el del JSON, si hay
    categoria: '', label: '',
    catElegida: '',       // editando: la categoría existente, o '' para una nueva
    fuente: 'existente',  // 'mantener' | 'existente' | 'nuevo'
    libroDe: '',          // '<club>/<categoria>' de un libro ya cargado
    sheet: '',            // lo que se pegó: el link entero o el id de un libro nuevo
    /* Un id que el admin escribió a mano deja de completarse solo: pisarle
       lo que tipeó por seguir al nombre sería peor que no ayudarlo. */
    tocado: { club: false, categoria: false },
  };

  /* La lectura de equipos del libro elegido. Se OLVIDA al cambiar de libro:
     los equipos de otro libro no sirven para elegir el propio. `pedido` es
     la ficha de la lectura en vuelo, para que una respuesta vieja no pise
     a la del libro que el admin eligió después. */
  const libro = { estado: null, equipos: null, mensaje: '', cuenta: null,
                  pedido: null, propuesto: null };

  /* El resultado del último guardado. Se muestra en la pantalla y no en un
     `alert()`: el motivo de rechazo del servidor es un texto que dice qué
     corregir, y un alert lo hace desaparecer justo cuando hay que leerlo
     mientras se arregla el campo. */
  const guardado = { estado: null, mensaje: '' };   // null | 'yendo' | 'ok' | 'error'

  /* La ayuda del color: qué pasó al tocar «Del escudo». Vive acá y no en
     el DOM para sobrevivir a un repintado del formulario. */
  const colorAyuda = { texto: '' };

  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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
    const sheet = idDeLibro(v.sheet);
    if (!v.club || !v.categoria || !sheet) return null;
    const q = (x) => '"' + String(x).replace(/"/g, '\\"') + '"';
    let c = 'node server/bin/catalogo.js alta'
      + ' --club ' + q(v.club)
      + ' --categoria ' + q(v.categoria)
      + ' --sheet ' + q(sheet);
    if (v.nombre) c += ' --nombre ' + q(v.nombre);
    if (v.label) c += ' --label ' + q(v.label);
    if (v.liga) c += ' --liga ' + q(v.liga);
    if (v.equipoPropio) c += ' --equipo ' + q(v.equipoPropio);
    return c;
  }

  /**
   * Qué le falta al alta para poder guardarse.
   *
   * Se dice ANTES de apretar y en castellano, no con un campo en rojo
   * después: el que da de alta un cliente lo hace una vez cada mucho y no
   * se acuerda de cuáles eran obligatorios.
   *
   * El equipo propio es obligatorio SOLO al crear: SIN ÉL EL CLIENTE NO VE
   * NINGÚN EQUIPO, y el modo de fallar es el peor —la grilla sale vacía y
   * parece que el panel está roto (punto 19)—.
   */
  function faltantesAlta(d) {
    const v = d || {};
    const f = [];
    if (v.modo === 'nuevo' && !v.nombre) f.push('el nombre del club');
    if (!v.club) f.push('el id del club');
    if (!v.label && !v.catElegida && v.modo) f.push('el nombre de la categoría');
    if (!v.categoria) f.push('el id de la categoría');
    if (v.fuente === 'mantener') {
      if (!v.catElegida) f.push('el libro');
    } else if (v.fuente === 'existente') {
      if (!v.libroDe) f.push('el libro (elegí uno de la lista)');
    } else if (!idDeLibro(v.sheet)) {
      f.push('el libro (el link o el sheetId)');
    }
    if (v.modo === 'nuevo' && !v.equipoPropio) f.push('el equipo propio');
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

  /** De un texto libre a un id: «Sud América La Plata» → «sud-america-la-plata». */
  function slug(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * El id de categoría que se propone: el del club + la etiqueta SIN EL
   * AÑO. «Primera 2026» en `sud-america` da `sud-america-primera`, la
   * misma convención de las que ya existen (`deportivo-primera`,
   * `reconquista-u21`). El año se saca porque la categoría sobrevive a la
   * temporada y su id no se puede cambiar: es la clave de los estados y
   * de los links ya compartidos (punto 6).
   */
  function idCategoriaSugerido(club, label) {
    const resto = slug(String(label || '').replace(/\b(19|20)\d{2}\b/g, ''));
    return (club && resto) ? club + '-' + resto : '';
  }

  /**
   * El id de un libro, venga como id o como LINK ENTERO.
   *
   * El servidor exige el id pelado y hace bien (hay un test que lo fija):
   * así un pedido que no pasó por esta pantalla no puede colar cualquier
   * texto. Pero pegar el link es el gesto natural, así que la pantalla lo
   * acepta y saca el id ella misma.
   */
  function idDeLibro(t) {
    const x = String(t == null ? '' : t).trim();
    const m = x.match(/\/d\/([A-Za-z0-9_-]{20,})/);
    return m ? m[1] : x;
  }

  /* Las palabras que no distinguen a un club de otro. «Plata» y «LP» son
     la ciudad: en una liga de La Plata están en medio libro. */
  const VACIAS = ['club', 'de', 'del', 'la', 'las', 'el', 'los', 'y',
    'atletico', 'social', 'plata', 'lp'];
  function palabras(t) {
    return slug(t).split('-').filter(w => w.length > 1 && VACIAS.indexOf(w) === -1);
  }

  /**
   * Qué equipo del libro es, probablemente, el del club.
   *
   * Por palabras en común, sobre la UNIÓN y no sobre el total del nombre
   * (Jaccard): «Deportivo La Plata» comparte «deportivo» con DEPORTIVO LA
   * PLATA y con DEPORTIVO SAN VICENTE, y lo que separa a los dos es que el
   * segundo trae dos palabras que el club no tiene.
   *
   * SOLO PROPONE CON UN GANADOR CLARO. Con empate no propone: elegir por el
   * admin entre dos candidatos parejos es exactamente el error silencioso
   * que la lista viene a evitar. Y lo que propone queda a la vista,
   * elegido en la lista, antes de guardar.
   */
  function sugerirEquipo(nombre, equipos) {
    const a = palabras(nombre);
    if (!a.length) return null;
    let mejor = null, puntaje = 0, empate = false;
    (equipos || []).forEach((e) => {
      const b = palabras(e.clave);
      const comunes = b.filter(w => a.indexOf(w) !== -1).length;
      const union = new Set(a.concat(b)).size;
      const j = union ? comunes / union : 0;
      if (j > puntaje) { mejor = e; puntaje = j; empate = false; }
      else if (j > 0 && j === puntaje) empate = true;
    });
    return (mejor && puntaje >= 0.5 && !empate) ? mejor : null;
  }

  /**
   * Los libros que ya están cargados, para reusarlos. Uno por CATEGORÍA y
   * no por libro: el navegador no ve los ids (punto 29), así que no puede
   * saber que dos categorías comparten el mismo — y no hace falta, elegir
   * cualquiera de las dos da el mismo libro.
   */
  function librosDisponibles(cs) {
    const out = [];
    (cs || []).forEach(c => (c.categorias || []).forEach((k) => {
      if (k.activo) out.push({ valor: c.id + '/' + k.slug, texto: (c.nombre || c.id) + ' · ' + (k.label || k.slug) });
    }));
    return out.sort((x, y) => x.texto.localeCompare(y.texto, 'es'));
  }

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
    if (typeof SGADD_CONFIRMAR === 'undefined') return aplicarAcceso(club, accion, mail);

    /* LA BAJA ES LA QUE HAY QUE MIRAR DOS VECES: le corta el acceso a una
       persona y borra su clave. El alta y la reinvitación se confirman
       igual —son cambios que el cliente ve— pero su aviso es otro. */
    const previos = ((accesos[club] || {}).mails || []);
    const nuevos = accion === 'baja'
      ? previos.filter(m => m.email !== mail)
      : (accion === 'alta' ? previos.concat([{ email: mail }]) : previos);

    const textos = {
      alta: 'Le vas a dar acceso a esta persona. Va a recibir un código para elegir su clave.',
      baja: 'Le corta el acceso YA y le borra la clave. Si vuelve, hay que invitarlo de nuevo.',
      reinvitar: 'Genera un código nuevo. NO le borra la clave que ya tenga: la vieja sigue'
        + ' sirviendo hasta que canjee el código.',
    };

    SGADD_CONFIRMAR.abrir({
      titulo: 'Accesos · ' + club,
      aviso: textos[accion] || '',
      confirmar: accion === 'baja' ? 'Sacar el acceso' : 'Guardar cambios',
      cambios: accion === 'reinvitar'
        ? [{ label: 'Código nuevo para', antes: '—', despues: mail }]
        : SGADD_CONFIRMAR.cambiosDeAccesos(previos, nuevos),
      alConfirmar: () => aplicarAcceso(club, accion, mail),
    });
  }

  function aplicarAcceso(club, accion, mail) {
    if (accesosAbierto.yendo) return;
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

/* =====================================================================
   EL ESTADO DEL SERVICIO

   KV es de donde salen el padrón de clientes, las zonas publicadas y el
   catálogo. Cuando no contesta, el panel NO se cae: el catálogo se cae al
   respaldo del código y las zonas al JSON del repo, así que el cliente
   sigue viendo su tabla con lo último que quedó commiteado.

   PERO EL ADMIN TIENE QUE SABERLO, y por un motivo concreto: en modo
   respaldo, publicar y dar de alta NO se van a guardar. Sin el aviso, el
   admin toca «Publicar», ve el error y no sabe si es su cambio o el
   servicio.

   Va como badge discreto y no como cartel rojo: el 99% de las veces está
   en línea, y un cartel permanente se deja de leer.
   ===================================================================== */
  function badgeServicio() {
    if (typeof SGADD_CLIENTES === 'undefined') return '';
    const st = SGADD_CLIENTES.estado;
    if (!st || !st.clubes) return '';        // todavía no se pidió

    const enLinea = st.origen === 'kv';
    const tono = enLinea ? 'zona-exito' : 'zona-aviso';
    const txt = enLinea ? 'Servicio KV en línea' : 'Modo respaldo JSON activo';
    const detalle = enLinea
      ? 'Lo que publiques se guarda y le llega al cliente.'
      : (st.aviso || 'No se pudo leer Upstash.')
        + ' Los clientes siguen viendo su última configuración del repo, pero'
        + ' publicar y dar de alta NO se van a guardar.';

    return `<div class="flex items-baseline gap-2 flex-wrap text-[11px] mb-3">
      <span class="zona-texto ${tono} font-display uppercase tracking-wider">
        ${enLinea ? '●' : '▲'} ${esc(txt)}</span>
      <span class="text-muted">${esc(detalle)}</span>
      ${st.origen && !enLinea ? `<span class="font-mono text-muted/70">origen: ${esc(st.origen)}</span>` : ''}
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

  /* =====================================================================
     EL FORMULARIO DE ALTA

     EL BUG QUE TENÍA: cada tecla llamaba a `refrescarAlta()`, que
     reconstruía `#hubAlta` ENTERO — y los inputs viven adentro. El input
     en el que se estaba escribiendo se destruía y se creaba otro igual,
     sin el foco: se tipeaba una letra y la siguiente iba al vacío. El
     comentario de al lado decía «tipear NO repinta», y era cierto para la
     pestaña, no para el bloque donde estaban los campos.

     AHORA HAY TRES ZONAS y cada una se repinta por su motivo:

       #hubAlta         el formulario entero · solo con un SELECT o un
                        RADIO (cambiar de cliente, de categoría, de libro),
                        que no se están tipeando — y se devuelve el foco
       #hubAltaEquipo   la lectura del libro y la elección del equipo
       #hubAltaEstado   qué falta, los avisos y el botón · en cada tecla

     Un input de texto NO SE REPINTA NUNCA. Lo que depende de él —el id que
     se completa solo, el borde rojo— se escribe sobre el nodo que ya está.
     Es la regla de `scoutMeta()` y del buscador del buzón (punto 13).
     ===================================================================== */
  const CLASE_INPUT = 'w-full bg-surface2 border rounded-md px-2 py-1.5 text-xs text-ink';
  const CLASE_SELECT = 'w-full bg-surface2 border border-hairline rounded-md px-2 py-1.5 text-xs text-ink';
  const ROTULO = 'block text-[10px] uppercase tracking-wider text-muted font-display mb-1';

  function clubesCatalogo() {
    return (typeof SGADD_CLIENTES !== 'undefined' && SGADD_CLIENTES.estado.clubes) || [];
  }

  /* El equipo se compara con la MISMA normalización que el gate (punto 19):
     `ATENAS 'B' - MM` y `ATENAS B` son el mismo equipo. */
  function claveEq(x) {
    const t = String(x == null ? '' : x);
    return (typeof SGADD !== 'undefined' && SGADD.claveEquipo)
      ? SGADD.claveEquipo(t) : t.trim().toUpperCase();
  }

  function campo(id, etiqueta, valor, ayuda, opciones) {
    const o = opciones || {};
    return `<label class="block">
      <span class="${ROTULO}">${esc(etiqueta)}</span>
      <input type="text" id="alta-${id}" value="${esc(valor)}"
        ${o.placeholder ? `placeholder="${esc(o.placeholder)}"` : ''}
        ${o.lista ? `list="${o.lista}"` : ''}
        ${o.soloLectura ? 'readonly aria-readonly="true"'
          : `oninput="SGADD_HUB.campoAlta('${id}', this.value)"`}
        autocomplete="off" spellcheck="false"
        class="${CLASE_INPUT} ${o.invalido ? 'border-red-500/70' : 'border-hairline'}${o.mono ? ' font-mono' : ''}${o.soloLectura ? ' text-muted' : ''}">
      ${ayuda ? `<span class="block text-[10px] text-muted mt-1">${ayuda}</span>` : ''}
    </label>`;
  }

  /* EL COLOR DE MARCA. Un selector de color con el hex al lado —el que
     lo tiene anotado lo pega— y un botón que lo saca del escudo del
     equipo. Ninguno repinta el formulario: escriben sobre los nodos que
     ya están (ver `campoAlta`). Sin color, un club sin JSON se pintaba con
     el naranja de Reconquista. */
  function campoColor() {
    const ok = HEX_COLOR.test(alta.acento);
    const ayuda = colorAyuda.texto
      || 'El color del club en su panel: pestañas, botones y gráficos. «Del escudo» lo saca del escudo del equipo propio.';
    return `<label class="block">
      <span class="${ROTULO}">Color de marca</span>
      <span class="flex items-center gap-2">
        <input type="color" id="alta-acentoSelector" value="${ok ? esc(alta.acento.toLowerCase()) : '#808080'}"
          oninput="SGADD_HUB.campoAlta('acentoSelector', this.value)" aria-label="Elegir el color de marca"
          class="h-8 w-10 shrink-0 rounded border border-hairline bg-surface2 cursor-pointer">
        <input type="text" id="alta-acento" value="${esc(alta.acento)}" placeholder="#rrggbb"
          oninput="SGADD_HUB.campoAlta('acento', this.value)" autocomplete="off" spellcheck="false"
          aria-label="Color de marca en hexadecimal"
          class="${CLASE_INPUT} font-mono ${alta.acento && !ok ? 'border-red-500/70' : 'border-hairline'}">
        <button type="button" onclick="SGADD_HUB.colorDelEscudo()"
          class="shrink-0 px-2 py-1.5 rounded-md text-[11px] font-display uppercase tracking-wider
                 border border-hairline text-ink hover:opacity-90">Del escudo</button>
      </span>
      <span id="alta-acentoAyuda" class="block text-[10px] text-muted mt-1">${esc(ayuda)}</span>
    </label>`;
  }

  function radio(valor, texto) {
    return `<label class="flex items-start gap-2 text-xs text-ink">
      <input type="radio" name="altaFuente" value="${valor}" class="mt-0.5"
        ${alta.fuente === valor ? 'checked' : ''}
        onchange="SGADD_HUB.elegirFuente('${valor}')">
      <span>${texto}</span>
    </label>`;
  }

  /** ¿Hay un libro elegido que se pueda leer? */
  function fuenteLista() {
    if (alta.fuente === 'mantener') return !!(alta.modo !== 'nuevo' && alta.catElegida);
    if (alta.fuente === 'existente') return !!alta.libroDe;
    return /^[A-Za-z0-9_-]{20,}$/.test(idDeLibro(alta.sheet));
  }

  /** Qué libro se manda: el id nunca sale del servidor salvo que sea uno nuevo. */
  function intencionLibro() {
    if (alta.fuente === 'mantener') return { libroDe: alta.modo + '/' + alta.catElegida };
    if (alta.fuente === 'existente') return { libroDe: alta.libroDe };
    return { sheetId: idDeLibro(alta.sheet) };
  }

  function bloqueAlta() {
    const cs = clubesCatalogo();
    const editando = alta.modo !== 'nuevo';
    const clubEd = editando ? cs.find(c => c.id === alta.modo) : null;
    const libros = librosDisponibles(cs);
    const ligas = Array.from(new Set(cs.map(c => c.liga).filter(Boolean)
      .concat(['la-plata', 'liga-argentina']))).sort();
    const catFija = editando && !!alta.catElegida;

    return `<div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Alta o edición de un cliente</h3>
      <p class="text-xs text-muted mb-4">
        Tres pasos: el club, la categoría y el libro de donde salen sus datos. Guardar
        <strong class="text-ink">publica para todos los usuarios de ese club</strong>, y su panel
        queda andando en la próxima carga — sin tocar el repositorio.
      </p>

      <label class="block mb-4">
        <span class="${ROTULO}">¿Qué querés hacer?</span>
        <select id="alta-modo" onchange="SGADD_HUB.elegirModo(this.value)" class="${CLASE_SELECT}">
          <option value="nuevo"${editando ? '' : ' selected'}>Dar de alta un cliente nuevo</option>
          ${cs.slice().sort((a, b) => String(a.nombre || a.id).localeCompare(String(b.nombre || b.id), 'es'))
            .map(c => `<option value="${esc(c.id)}"${alta.modo === c.id ? ' selected' : ''}>Editar · ${esc(c.nombre || c.id)}</option>`).join('')}
        </select>
      </label>

      <fieldset class="border-t border-hairline pt-3">
        <legend class="font-display uppercase tracking-wide text-xs text-ink pr-2">1 · El club</legend>
        <div class="grid sm:grid-cols-2 gap-3 mt-2">
          ${campo('nombre', 'Nombre del club', alta.nombre,
            'Como lo ve el cuerpo técnico en el encabezado del panel.',
            { placeholder: 'Sud América La Plata' })}
          ${campo('club', 'ID del club', alta.club,
            editando ? 'No se cambia: lo usan los links y los accesos ya entregados.'
              : 'Se completa solo a partir del nombre. Va en el link del cliente '
                + '(<code>?club=…</code>) y después no se puede cambiar.',
            { placeholder: 'sud-america', mono: true, soloLectura: editando,
              invalido: !!alta.club && !idValido(alta.club) })}
          ${campo('liga', 'Liga', alta.liga,
            'La carpeta de escudos. Los clubes de La Plata van en <code>la-plata</code>.',
            { placeholder: 'la-plata', lista: 'altaLigas', mono: true })}
          ${campoColor()}
        </div>
        <datalist id="altaLigas">${ligas.map(l => `<option value="${esc(l)}"></option>`).join('')}</datalist>
      </fieldset>

      <fieldset class="border-t border-hairline pt-3 mt-4">
        <legend class="font-display uppercase tracking-wide text-xs text-ink pr-2">2 · La categoría</legend>
        ${editando ? `<label class="block mt-2">
          <span class="${ROTULO}">Categoría a editar</span>
          <select id="alta-cat" onchange="SGADD_HUB.elegirCategoria(this.value)" class="${CLASE_SELECT}">
            ${((clubEd && clubEd.categorias) || []).map(k => `<option value="${esc(k.slug)}"${alta.catElegida === k.slug ? ' selected' : ''}>${esc(k.label || k.slug)}</option>`).join('')}
            <option value=""${alta.catElegida ? '' : ' selected'}>＋ Agregar una categoría nueva</option>
          </select>
        </label>` : ''}
        <div class="grid sm:grid-cols-2 gap-3 mt-2">
          ${campo('label', 'Nombre de la categoría', alta.label,
            'Lo que dice el selector de categoría del panel.',
            { placeholder: 'Primera 2026' })}
          ${campo('categoria', 'ID de la categoría', alta.categoria,
            catFija ? 'No se cambia: es la clave de la categoría.'
              : 'Se completa solo. Va sin el año: la categoría sigue la temporada que viene.',
            { placeholder: 'sud-america-primera', mono: true, soloLectura: catFija,
              invalido: !!alta.categoria && !idValido(alta.categoria) })}
        </div>
      </fieldset>

      <fieldset class="border-t border-hairline pt-3 mt-4">
        <legend class="font-display uppercase tracking-wide text-xs text-ink pr-2">3 · El libro y el equipo</legend>
        <div class="grid gap-2 mt-2">
          ${catFija ? radio('mantener', 'Mantener el libro que ya tiene') : ''}
          ${radio('existente', 'Usar un libro ya cargado <span class="text-muted">· si juega en el mismo torneo que otro cliente</span>')}
          ${alta.fuente === 'existente' ? `<select id="alta-libro" onchange="SGADD_HUB.elegirLibro(this.value)"
              class="${CLASE_SELECT}" aria-label="Libro ya cargado">
              <option value="">Elegí el torneo…</option>
              ${libros.map(l => `<option value="${esc(l.valor)}"${alta.libroDe === l.valor ? ' selected' : ''}>${esc(l.texto)}</option>`).join('')}
            </select>` : ''}
          ${radio('nuevo', 'Pegar el link de un libro nuevo')}
          ${alta.fuente === 'nuevo' ? campo('sheet', 'Link o id del libro', alta.sheet,
            'Sirve el link entero de Google Sheets: el id se saca solo.',
            { placeholder: 'https://docs.google.com/spreadsheets/d/…', mono: true }) : ''}
        </div>
        <div id="hubAltaEquipo" class="mt-3">${zonaEquipo()}</div>
      </fieldset>

      <div id="hubAltaEstado" class="mt-4">${estadoAlta()}</div>
    </div>`;
  }

  /** La lectura del libro y la elección del equipo propio. */
  function zonaEquipo() {
    const puede = fuenteLista();
    const leyendo = libro.estado === 'leyendo';
    const boton = `<button type="button" onclick="SGADD_HUB.leerEquipos()" ${!puede || leyendo ? 'disabled' : ''}
        class="px-3 py-1.5 rounded-md text-xs font-display uppercase tracking-wider border border-hairline
               text-ink hover:opacity-90 disabled:opacity-50">
        ${leyendo ? 'Leyendo el libro…' : 'Leer los equipos del libro'}</button>`;
    const pista = puede ? '' : '<span class="text-[10px] text-muted">Primero elegí o pegá el libro.</span>';

    let aviso = '';
    if (libro.estado === 'error') {
      aviso = `<p class="text-[11px] mt-2 zona-texto zona-peligro" role="status">${esc(libro.mensaje)}</p>`;
    } else if (libro.estado === 'ok') {
      aviso = `<p class="text-[11px] mt-2 zona-texto zona-exito" role="status">✓ El libro se lee bien: ${libro.equipos.length} equipos.</p>`;
    }
    if (libro.propuesto) {
      aviso += `<p class="text-[11px] mt-1 text-muted">Se propuso <strong class="text-ink">${esc(libro.propuesto.despues)}</strong>`
        + (libro.propuesto.antes ? ` porque «${esc(libro.propuesto.antes)}» no figura en el libro` : ' por el nombre del club')
        + '. Revisalo antes de guardar.</p>';
    }

    const actual = claveEq(alta.equipoPropio);
    const eq = (libro.estado === 'ok' && libro.equipos)
      ? `<label class="block mt-3">
          <span class="${ROTULO}">Equipo propio</span>
          <select id="alta-equipoPropio" onchange="SGADD_HUB.elegirEquipo(this.value)" class="${CLASE_SELECT} font-mono">
            <option value="">Elegí cuál es el equipo del cliente…</option>
            ${libro.equipos.map(e => `<option value="${esc(e.clave)}"${actual === e.clave ? ' selected' : ''}>${esc(e.clave)}</option>`).join('')}
          </select>
          <span class="block text-[10px] text-muted mt-1">Tal como lo escribe la planilla. Es el equipo que el cliente ve completo.</span>
        </label>`
      : `<div class="mt-3">${campo('equipoPropio', 'Equipo propio', alta.equipoPropio,
          'Tal como lo escribe la planilla, sin el « - MM». <strong class="text-ink">Mejor elegilo con el botón</strong>: '
          + 'si no coincide letra por letra, el cliente no ve ninguna ficha.',
          { placeholder: 'SUD AMERICA LP', mono: true })}</div>`;

    return `<div class="flex items-center gap-3 flex-wrap">${boton}${pista}</div>${aviso}${eq}`;
  }

  /** Qué falta, los avisos y el botón. Lo único que se repinta al tipear. */
  function estadoAlta() {
    const cs = clubesCatalogo();
    const faltan = faltantesAlta(alta);
    const avisos = [];
    if (alta.club && !idValido(alta.club)) {
      avisos.push(['peligro', 'El ID del club es una clave: minúsculas, sin espacios ni acentos. Viaja en el link del cliente.']);
    }
    if (alta.categoria && !idValido(alta.categoria)) {
      avisos.push(['peligro', 'El ID de la categoría es una clave: minúsculas, sin espacios ni acentos.']);
    }
    if (alta.acento && !HEX_COLOR.test(alta.acento)) {
      avisos.push(['peligro', 'El color de marca va como #rrggbb, por ejemplo #0d5e27.']);
    }
    const yaExiste = alta.modo === 'nuevo' && alta.club && cs.find(c => c.id === alta.club);
    if (yaExiste) {
      avisos.push(['aviso', 'Ese ID ya es de ' + (yaExiste.nombre || yaExiste.id) + ': guardar lo EDITA, no crea otro. '
        + 'Si querés editarlo, elegilo arriba en «¿Qué querés hacer?».']);
    }
    if (libro.estado === 'ok' && alta.equipoPropio
        && !libro.equipos.some(e => e.clave === claveEq(alta.equipoPropio))) {
      avisos.push(['peligro', '«' + alta.equipoPropio + '» no figura en el libro: el cliente no vería ninguna ficha. Elegilo de la lista.']);
    }
    if (alta.modo === 'nuevo' && alta.equipoPropio && libro.estado !== 'ok') {
      avisos.push(['aviso', 'El equipo no se comprobó contra el libro. Tocá «Leer los equipos del libro» para no errarle a una letra.']);
    }
    const bloquea = avisos.some(a => a[0] === 'peligro');
    const puede = !faltan.length && !bloquea && guardado.estado !== 'yendo';
    const cmd = alta.fuente === 'nuevo' ? comandoAlta(alta) : null;

    let resultado = '';
    if (guardado.estado === 'ok') {
      const url = guardado.club ? urlCliente(guardado.club) : '';
      resultado = `<p class="text-xs mt-3 zona-texto zona-exito" role="status">${esc(guardado.mensaje)}
        ${url ? ` <a href="${esc(url)}" class="underline">Abrir su panel →</a>` : ''}</p>`;
    } else if (guardado.estado === 'error') {
      resultado = `<p class="text-xs mt-3 zona-texto zona-peligro" role="status">${esc(guardado.mensaje)}</p>`;
    }

    return `${avisos.map(a => `<p class="text-[11px] mb-2 zona-texto zona-${a[0]}">${esc(a[1])}</p>`).join('')}
      <div class="flex items-center gap-3 flex-wrap">
        <button type="button" onclick="SGADD_HUB.guardar()" ${puede ? '' : 'disabled'}
          class="px-3 py-1.5 rounded-md text-xs font-display uppercase tracking-wider
                 bg-accent text-base hover:opacity-90 disabled:opacity-50">
          ${guardado.estado === 'yendo' ? 'Guardando…' : (alta.modo === 'nuevo' ? 'Dar de alta' : 'Guardar cambios')}</button>
        <span class="text-[11px] text-muted">${faltan.length ? 'Falta ' + esc(faltan.join(', ')) + '.'
          : 'Se publica para todos los usuarios de ese club.'}</span>
      </div>
      ${cmd ? `<details class="mt-3">
        <summary class="text-[11px] text-muted cursor-pointer">o hacerlo por CLI</summary>
        <pre class="bg-surface2 border border-hairline rounded-md p-3 text-[11px] text-ink overflow-x-auto mt-2"><code>${esc(cmd)}</code></pre>
      </details>` : ''}
      ${resultado}`;
  }

  function urlCliente(id) {
    try {
      if (typeof SGADD_CLIENTES !== 'undefined' && SGADD_CLIENTES.urlDeClub) return SGADD_CLIENTES.urlDeClub(id);
    } catch (e) { /* cae al link simple */ }
    return '?club=' + encodeURIComponent(id);
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
        ${badgeServicio()}
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

  /** La intención que se manda. Nunca un catálogo (punto 30). */
  function intencionAlta() {
    /* El color solo viaja si hay uno o si se BORRÓ el que tenía: mandar
       siempre un vacío le borraría el color a un club editado desde una
       pantalla que no lo tocó. */
    const previo = (clubesCatalogo().filter(x => x.id === alta.club)[0] || {}).acento || '';
    const color = (alta.acento || previo) ? { acento: alta.acento } : {};
    return Object.assign({
      accion: 'alta',
      club: alta.club, nombre: alta.nombre, liga: alta.liga,
      /* Se guarda la CLAVE, que es contra lo que compara el gate: un
         «Sud America LP - MM» pegado a mano entra igual que elegido. */
      equipoPropio: alta.equipoPropio ? claveEq(alta.equipoPropio) : '',
      categoria: alta.categoria, label: alta.label,
    }, alta.fuente === 'mantener' ? {} : intencionLibro(), color);
  }

  /** Qué cambia, en castellano, para el modal de confirmación. */
  function cambiosAlta(i) {
    const c = clubesCatalogo().find(x => x.id === i.club) || {};
    const k = (c.categorias || []).find(x => x.slug === i.categoria) || null;
    const libroDe = i.libroDe && librosDisponibles(clubesCatalogo()).find(l => l.valor === i.libroDe);
    const libroNuevo = i.libroDe ? 'el de ' + (libroDe ? libroDe.texto : i.libroDe)
      : i.sheetId ? 'uno nuevo (' + i.sheetId.slice(0, 6) + '…)' : null;
    const filas = [
      ['Club', c.nombre, i.nombre],
      ['Liga', c.liga, i.liga],
      ['Equipo propio', c.equipoPropio, i.equipoPropio],
      ['Categoría', k ? (k.label || k.slug) + ' (' + k.slug + ')' : '', i.label + ' (' + i.categoria + ')'],
    ];
    if (libroNuevo) filas.push(['Libro', k ? (k.activo ? 'el que tiene' : 'sin libro') : '', libroNuevo]);
    if (i.acento !== undefined && String(i.acento || '') !== String(c.acento || '')) {
      filas.push(['Color de marca', c.acento || '', i.acento || 'el de su JSON, o el del panel']);
    }
    return filas
      .filter(f => f[2] && String(f[1] || '') !== String(f[2]))
      .map(f => ({ campo: f[0], label: f[0], antes: f[1] || '—', despues: f[2] }));
  }

  /**
   * Guarda. NADA DEL PANEL MASTER SE APLICA EN SILENCIO (punto 30): el
   * modal enumera lo que se crea o lo que cambia, y la petición sale
   * recién al confirmar. Sin cambios, el botón del modal se apaga solo.
   */
  function guardar() {
    if (guardado.estado === 'yendo' || faltantesAlta(alta).length) return;
    const intencion = intencionAlta();
    const enviar = () => enviarAlta(intencion);
    if (typeof SGADD_CONFIRMAR === 'undefined') return enviar();
    const nuevo = alta.modo === 'nuevo';
    SGADD_CONFIRMAR.abrir({
      titulo: (nuevo ? 'Dar de alta · ' : 'Editar · ') + (alta.nombre || alta.club),
      aviso: 'Se publica ya: el panel de ' + (alta.nombre || alta.club)
        + ' toma estos datos en su próxima carga.',
      confirmar: nuevo ? 'Dar de alta' : 'Guardar cambios',
      cambios: cambiosAlta(intencion),
      /* La pregunta de siempre, con las otras dos opciones grises y su
         motivo: la identidad de un cliente no se copia a otro. */
      alcance: SGADD_CONFIRMAR.opcionesAlcance ? {
        opciones: SGADD_CONFIRMAR.opcionesAlcance({ clubes: clubesCatalogo(), club: alta.club,
          slug: alta.categoria, accion: 'alta' }),
        sugerido: 'club' } : null,
      alConfirmar: enviar,
    });
  }

  /**
   * La petición de verdad. El motivo de rechazo del servidor se muestra
   * TAL CUAL: están escritos para que el admin sepa qué corregir («pegá el
   * id, no la URL entera»), y traducirlos acá los degradaría a un «error
   * al guardar» genérico.
   */
  function enviarAlta(intencion) {
    guardado.estado = 'yendo'; guardado.mensaje = '';
    refrescarEstado();

    SGADD_DATA.guardarCatalogo(intencion).then((r) => {
      guardado.estado = 'ok';
      guardado.club = intencion.club;
      guardado.mensaje = (r.creoClub ? 'Cliente dado de alta. ' : 'Cambios guardados. ')
        + textoHerencia(r.herencia, r.clubes) + (r.aviso || '');
      /* La lista se repinta con lo que devolvió el SERVIDOR, no con lo que
         este formulario creyó mandar: si un guard recortó algo, se ve. */
      if (typeof SGADD_CLIENTES !== 'undefined' && r.clubes) {
        SGADD_CLIENTES.estado.clubes = r.clubes;
        SGADD_CLIENTES.pintar();
      }
      /* Y EL FORMULARIO PASA A EDITAR lo que se acaba de guardar: un
         segundo «Guardar» corrige esa categoría en vez de intentar crearla
         otra vez. */
      alta.modo = intencion.club;
      alta.catElegida = intencion.categoria;
      alta.tocado.club = true; alta.tocado.categoria = true;
      alta.fuente = 'mantener';
      const n = document.getElementById('hubClientes');
      if (n) conFoco(() => { n.innerHTML = html(); });
    }).catch((e) => {
      guardado.estado = 'error';
      guardado.mensaje = e.message || 'No se pudo guardar.';
      refrescarEstado();
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
  /**
   * Un cambio de suscripción. NO SE MANDA HASTA QUE EL ADMIN CONFIRMA.
   *
   * Antes se aplicaba de una: un clic en «Pausar» le cortaba el acceso al
   * cliente en el acto, sin decir qué estaba por pasar. El modal enumera
   * el cambio campo por campo —«Plan: PLATA → ORO»— y avisa que se ve en
   * la sesión del cliente en la próxima carga.
   *
   * El `confirm()` nativo que tenía la baja se va: preguntaba «¿seguimos?»
   * sin decir qué, que es lo que este modal vino a reemplazar.
   */
  function accionClub(club, accion, valor) {
    if (pendiente.club) return;
    if (typeof SGADD_CONFIRMAR === 'undefined') return aplicarClub(club, accion, valor);

    const c = (SGADD_CLIENTES && SGADD_CLIENTES.estado.clubes || []).find(x => x.id === club) || {};
    const despues = Object.assign({}, c);
    if (accion === 'cambiar_plan') despues.plan = valor;
    if (accion === 'renovar') despues.vence = valor || '';
    if (accion === 'pausar') despues.estado = 'pausado';
    if (accion === 'reactivar') despues.estado = 'activo';
    if (accion === 'desactivar') despues.estado = 'inactivo';

    SGADD_CONFIRMAR.abrir({
      titulo: (c.nombre || club) + ' · confirmar el cambio',
      aviso: 'Se aplica ya: el cliente lo ve en su próxima carga.'
        + (accion === 'desactivar' ? ' Dar de baja le corta el acceso a todos sus usuarios;'
          + ' la configuración se conserva.' : ''),
      confirmar: 'Guardar cambios',
      cambios: SGADD_CONFIRMAR.cambiosDeClub(c, despues),
      /* ¿En qué clientes? El plan y el vencimiento se pueden llevar a los
         del mismo torneo o a todos; pausar y dar de baja, nunca de a
         varios (el modal dice por qué). Arranca en «solo este cliente». */
      alcance: SGADD_CONFIRMAR.opcionesAlcance ? {
        opciones: SGADD_CONFIRMAR.opcionesAlcance({ clubes: (SGADD_CLIENTES && SGADD_CLIENTES.estado.clubes) || [],
          club: club, accion: accion, deClub: true }),
        sugerido: 'club' } : null,
      alConfirmar: (alcance) => aplicarClub(club, accion, valor, alcance),
    });
  }

  /** La petición de verdad. Solo la llama el modal, o el fallback sin él. */
  function aplicarClub(club, accion, valor, alcance) {
    if (pendiente.club) return;
    pendiente.club = club; pendiente.error = ''; pendiente.clubError = null;
    repintarLista();

    const cuerpo = { accion: accion, club: club, alcance: alcance || 'club' };
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

  /* La lista se repinta cuando vuelve una acción de OTRA tarjeta: el admin
     puede estar escribiendo en el alta mientras tanto. */
  const conFoco = (fn) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.conservarFoco)
    ? SGADD_UI.conservarFoco(fn) : fn();

  function repintarLista() {
    const n = document.getElementById('hubClientes');
    if (n) conFoco(() => { n.innerHTML = html(); });
  }

  /** El formulario entero. Solo desde un select o un radio, y con el foco de vuelta. */
  function refrescarAlta(focoId) {
    const n = (typeof document !== 'undefined') && document.getElementById('hubAlta');
    if (!n) return;
    n.innerHTML = bloqueAlta();
    if (focoId) {
      const f = focoId === 'radio'
        ? document.querySelector('input[name="altaFuente"]:checked')
        : document.getElementById(focoId);
      if (f && f.focus) f.focus();
    }
  }

  function refrescarEstado() {
    const n = (typeof document !== 'undefined') && document.getElementById('hubAltaEstado');
    if (n) n.innerHTML = estadoAlta();
  }

  function refrescarEquipo() {
    const n = (typeof document !== 'undefined') && document.getElementById('hubAltaEquipo');
    if (n) n.innerHTML = zonaEquipo();
  }

  /* Escribe sobre el nodo que YA ESTÁ, en vez de repintarlo. */
  function ponerValor(id, v) {
    const n = (typeof document !== 'undefined') && document.getElementById(id);
    if (n && n.value !== v) n.value = v;
  }

  function marcar(id, invalido) {
    const n = (typeof document !== 'undefined') && document.getElementById(id);
    if (!n || !n.classList) return;
    n.classList.toggle('border-red-500/70', !!invalido);
    n.classList.toggle('border-hairline', !invalido);
  }

  /**
   * Tipear en un campo de texto. NO REPINTA NINGÚN INPUT: actualiza el
   * borrador, completa los ids derivados sobre los nodos que ya están y
   * refresca solo la zona de estado. Ver el comentario de `bloqueAlta`.
   */
  function campoAlta(id, valor) {
    /* EL COLOR: el selector y el hex se escriben uno al otro, nunca sobre
       el que se está usando (reescribirle el valor al que se tipea le mueve
       el cursor). */
    if (id === 'acento' || id === 'acentoSelector') {
      alta.acento = String(valor == null ? '' : valor).trim();
      if (id === 'acentoSelector') ponerValor('alta-acento', alta.acento);
      else if (HEX_COLOR.test(alta.acento)) ponerValor('alta-acentoSelector', alta.acento.toLowerCase());
      marcar('alta-acento', !!alta.acento && !HEX_COLOR.test(alta.acento));
      guardado.estado = null;
      refrescarEstado();
      return;
    }
    if (!(id in alta) || id === 'tocado') return;
    alta[id] = String(valor == null ? '' : valor);
    if (id === 'club') alta.tocado.club = true;
    if (id === 'categoria') alta.tocado.categoria = true;

    if (id === 'nombre' && alta.modo === 'nuevo' && !alta.tocado.club) {
      alta.club = slug(alta.nombre);
      ponerValor('alta-club', alta.club);
    }
    if ((id === 'label' || id === 'nombre' || id === 'club') && !alta.catElegida && !alta.tocado.categoria) {
      alta.categoria = idCategoriaSugerido(alta.club, alta.label);
      ponerValor('alta-categoria', alta.categoria);
    }
    /* Otro libro: la lectura anterior ya no vale, y el botón de leer se
       habilita o no según lo pegado. La zona del equipo NO contiene al
       input del libro, así que repintarla no le saca el foco. */
    if (id === 'sheet') {
      libro.estado = null; libro.equipos = null; libro.mensaje = ''; libro.propuesto = null;
      refrescarEquipo();
    }
    marcar('alta-club', !!alta.club && !idValido(alta.club));
    marcar('alta-categoria', !!alta.categoria && !idValido(alta.categoria));
    guardado.estado = null;   // tocar un campo borra el resultado anterior
    refrescarEstado();
  }

  /**
   * Saca el color de marca del ESCUDO del equipo propio, con el mismo
   * criterio con que se midieron a mano los de DEPORTIVO y Sud América
   * (`CLUB.colorDeEscudo`). Se PROPONE en el campo: el admin lo ve antes
   * de guardar, y lo cambia si no es.
   *
   * `silencioso` es la propuesta automática al elegir el equipo: ahí no
   * pisa un color que el admin ya haya puesto, ni dice nada si falla.
   */
  function colorDelEscudo(silencioso) {
    const eq = alta.equipoPropio;
    const decir = (t) => {
      colorAyuda.texto = t;
      const n = (typeof document !== 'undefined') && document.getElementById('alta-acentoAyuda');
      if (n) n.textContent = t;
    };
    if (!eq) {
      if (!silencioso) decir('Primero elegí el equipo propio: el color sale de su escudo.');
      return Promise.resolve(null);
    }
    if (typeof LOGOS === 'undefined' || typeof CLUB === 'undefined' || !CLUB.colorDeImagen) {
      return Promise.resolve(null);
    }
    if (!silencioso) decir('Buscando el escudo de ' + eq + '…');
    return Promise.resolve(LOGOS.resolver([eq])).then(() => {
      const img = LOGOS.getImage(eq);
      const hex = img ? CLUB.colorDeImagen(img) : null;
      if (!hex) {
        if (!silencioso) decir('No encontré un color en el escudo de ' + eq + ': elegilo a mano.');
        return null;
      }
      if (silencioso && alta.acento) return null;   // el admin eligió uno mientras tanto
      alta.acento = hex;
      ponerValor('alta-acento', hex);
      ponerValor('alta-acentoSelector', hex);
      marcar('alta-acento', false);
      decir('Sacado del escudo de ' + eq + '. Revisalo antes de guardar.');
      refrescarEstado();
      return hex;
    }).catch(() => null);
  }

  /* Lo que el cliente nuevo heredó de su torneo, tal como lo dice el
     servidor. Sin esto el admin no sabe si tiene que cargar las zonas y
     los partidos de nuevo. */
  function textoHerencia(h, clubes) {
    if (!h || (!h.zonasDe && !h.partidos)) return '';
    const nom = (id) => ((clubes || []).filter(c => c.id === id)[0] || {}).nombre || id;
    const partes = [];
    if (h.zonasDe) partes.push('las zonas de la tabla de ' + nom(h.zonasDe));
    if (h.partidos) partes.push(h.partidos + ' partido' + (h.partidos === 1 ? '' : 's') + ' sin estadísticas');
    return 'Heredó de su torneo ' + partes.join(' y ') + '. ';
  }

  function olvidarLibro() {
    libro.estado = null; libro.equipos = null; libro.mensaje = '';
    libro.pedido = null; libro.propuesto = null;
  }

  function reiniciarAlta() {
    Object.assign(alta, { modo: 'nuevo', club: '', nombre: '', liga: '', equipoPropio: '',
      acento: '', categoria: '', label: '', catElegida: '', fuente: 'existente', libroDe: '', sheet: '' });
    colorAyuda.texto = '';
    alta.tocado = { club: false, categoria: false };
    olvidarLibro();
    guardado.estado = null; guardado.mensaje = ''; guardado.club = null;
  }

  function ponerCategoria(k) {
    alta.catElegida = k.slug; alta.categoria = k.slug; alta.label = k.label || '';
    alta.tocado.categoria = true;
    /* Con libro, lo natural al editar es conservarlo. Sin libro —la que
       "viene en camino"— hay que elegirle uno. */
    alta.fuente = k.activo ? 'mantener' : 'existente';
    alta.libroDe = '';
    olvidarLibro();
  }

  /** ¿Nuevo o editar a quién? Precarga lo que el catálogo ya sabe. */
  function elegirModo(v) {
    reiniciarAlta();
    const c = (v && v !== 'nuevo') ? clubesCatalogo().find(x => x.id === v) : null;
    if (c) {
      alta.modo = c.id; alta.club = c.id; alta.nombre = c.nombre || '';
      alta.liga = c.liga || ''; alta.equipoPropio = c.equipoPropio || '';
      alta.acento = c.acento || '';
      alta.tocado.club = true;
      const k = (c.categorias || [])[0];
      if (k) ponerCategoria(k);
    }
    refrescarAlta('alta-modo');
  }

  function elegirCategoria(slugCat) {
    const c = clubesCatalogo().find(x => x.id === alta.modo);
    const k = c && (c.categorias || []).find(x => x.slug === slugCat);
    if (k) {
      ponerCategoria(k);
    } else {
      alta.catElegida = ''; alta.categoria = ''; alta.label = '';
      alta.tocado.categoria = false; alta.fuente = 'existente'; alta.libroDe = '';
      olvidarLibro();
    }
    guardado.estado = null;
    refrescarAlta('alta-cat');
  }

  function elegirFuente(f) {
    alta.fuente = f; olvidarLibro(); guardado.estado = null;
    refrescarAlta('radio');
  }

  function elegirLibro(v) {
    alta.libroDe = v; olvidarLibro(); guardado.estado = null;
    refrescarAlta('alta-libro');
  }

  function elegirEquipo(v) {
    alta.equipoPropio = v; libro.propuesto = null; guardado.estado = null;
    refrescarEstado();
    /* Sin color elegido, se propone el del escudo del equipo. */
    if (!alta.acento && v) colorDelEscudo(true);
  }

  /**
   * Lee los equipos del libro elegido. Reemplaza a `probar-google.js`: si
   * el libro no está compartido, el motivo sale acá, al dar de alta.
   */
  function leerEquipos() {
    if (!fuenteLista() || libro.estado === 'leyendo') return;
    if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.equiposDelLibro) return;
    const pedido = intencionLibro();
    const ficha = JSON.stringify(pedido);
    libro.estado = 'leyendo'; libro.mensaje = ''; libro.pedido = ficha; libro.propuesto = null;
    refrescarEquipo();

    SGADD_DATA.equiposDelLibro(pedido).then((r) => {
      if (libro.pedido !== ficha) return;   // eligieron otro libro mientras leía
      libro.estado = 'ok';
      libro.equipos = r.equipos || [];
      libro.cuenta = r.cuentaServicio || null;
      /* Si el equipo cargado no está en el libro —o no hay ninguno— se
         PROPONE el que más se parece al nombre del club. Queda elegido en
         la lista y dicho en pantalla: el admin lo ve antes de guardar. */
      const actual = claveEq(alta.equipoPropio);
      if (!actual || !libro.equipos.some(e => e.clave === actual)) {
        const sug = sugerirEquipo(alta.nombre || alta.club, libro.equipos);
        if (sug) {
          libro.propuesto = { antes: alta.equipoPropio || '', despues: sug.clave };
          alta.equipoPropio = sug.clave;
        }
      }
      refrescarEquipo(); refrescarEstado();
      if (!alta.acento && alta.equipoPropio) colorDelEscudo(true);
    }).catch((e) => {
      if (libro.pedido !== ficha) return;
      libro.estado = 'error';
      libro.mensaje = e.message || 'No se pudo leer el libro.';
      refrescarEquipo(); refrescarEstado();
    });
  }

  return {
    /* motor */
    comandoAlta, faltantesAlta, idValido,
    /* ui */
    estadoEfectivo, diasPara, planCanonico, ciclo, ESTADOS, PLANES,
    QUE_INCLUYE, PARTIDOS_POR_CICLO,
    html, bloqueAlta, campoAlta, guardar, accionClub, alta, guardado, pendiente,
    /* el alta */
    slug, idCategoriaSugerido, idDeLibro, sugerirEquipo, librosDisponibles,
    intencionAlta, cambiosAlta, estadoAlta, zonaEquipo, libro,
    elegirModo, elegirCategoria, elegirFuente, elegirLibro, elegirEquipo, leerEquipos,
    reiniciarAlta, campoColor, colorDelEscudo, textoHerencia, HEX_COLOR, colorAyuda,
    /* accesos */
    verAccesos, campoAcceso, accionAcceso, aplicarAcceso, aplicarClub,
    badgeServicio,
    copiarCodigo, estadoMail, bloqueAccesos,
    accesos, accesosAbierto,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_HUB;
