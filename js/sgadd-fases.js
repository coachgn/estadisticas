/* =====================================================================
   sgadd-fases.js · FASES, CRUCES Y SERIES (punto 75)

   El modelo de playoffs de un torneo: qué fase se juega en qué libro,
   quién cruza con quién, a cuántos partidos, y cómo va cada serie.

   LA LÍNEA QUE NO SE CRUZA ES LA DE SIEMPRE: EL DATO MANDA.
   El torneo DECLARA la estructura (`formato.fases` de `torneos/<id>.json`)
   y el libro dice lo que se JUGÓ. Si los dos se contradicen gana el
   libro: una serie que se jugó entre dos equipos que la declaración no
   ponía cara a cara se muestra igual, y un cruce proyectado con la tabla
   de hoy se rotula «proyectado» —nunca se da por hecho un equipo que el
   reglamento todavía no definió—.

   QUÉ NO HACE, A PROPÓSITO:
     - No arma índices ni filtra métricas. El índice ya se construye
       scopeado a TORNEO|FASE (punto 3 ter) y el TOTAL nunca junta fases:
       el aislamiento de las métricas por fase YA existe y no se duplica.
     - No inventa reglamentos. Un torneo sin `cruces` declarados muestra
       las series que jugó, sin decir quién «tendría» que haber cruzado.
     - No resuelve lo INTERZONAL con datos de la otra zona: eso es la
       entrega 2, con el libro propio de la fase. Acá un slot de otra zona
       queda «pendiente», que es lo que es.

   Motor PURO arriba (requerible desde Node, sin `document`); abajo el
   pegamento con la app, que solo corre en el navegador.
   ===================================================================== */
const SGADD_FASES = (function () {
  'use strict';

  const CORE = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require === 'function' ? require('./sgadd-core.js') : null);

  /* EL NORMALIZADOR ES EL DEL NÚCLEO, también desde Node (punto 68): con
     uno propio, «ATENAS 'A' - MM» y «ATENAS A» dejan de cruzar y la llave
     sale vacía sin que ningún test lo vea. */
  function clave(s) {
    return CORE ? CORE.claveEquipo(String(s || '')) : String(s || '').trim().toUpperCase();
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  function mayus(v) { return texto(v).toUpperCase(); }
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  /** Una fase del libro que no está en el vocabulario del núcleo es de liga. */
  function esEliminacionDelNucleo(faseLibro) {
    const f = CORE && CORE.FASES ? CORE.FASES[mayus(faseLibro)] : null;
    return !!(f && f.eliminacion);
  }

  /* =====================================================================
     1 · EL PARSER DE LA DECLARACIÓN

     Todo es opcional y el fallback es siempre seguro, como la competencia
     del punto 15: un formato roto no puede dejar la pantalla vacía. Lo que
     no se entiende se descarta con su motivo en `errores`, y lo demás
     sigue sirviendo.
     ===================================================================== */

  /**
   * Un lado de un cruce. Cuatro formas:
   *   { zona, puesto }      el N° de la tabla de la fase regular de esa zona
   *   { equipo }            un equipo fijo (una invitación, un descendido)
   *   { ganador: cruce }    el que gane la serie de ese cruce
   *   { perdedor: cruce }   el que la pierda (el partido por el tercer puesto)
   *
   * La referencia a otro cruce tiene que apuntar a uno declarado ANTES:
   * sin eso una llave puede quedar circular y el resolvedor no termina
   * nunca de decidir quién juega.
   */
  function slot(s, previos, propio, faseId, errores) {
    if (!s || typeof s !== 'object') {
      errores.push(faseId + ': el cruce ' + propio + ' tiene un lado vacío');
      return { tipo: 'invalido' };
    }
    if (s.zona != null && s.puesto != null) {
      const p = Number(s.puesto);
      if (!Number.isInteger(p) || p < 1) {
        errores.push(faseId + ': el cruce ' + propio + ' pide el puesto «' + s.puesto + '», que no es un puesto');
        return { tipo: 'invalido' };
      }
      return { tipo: 'puesto', zona: texto(s.zona), puesto: p };
    }
    if (s.equipo) return { tipo: 'equipo', equipo: texto(s.equipo), clave: clave(s.equipo) };
    if (s.ganador || s.perdedor) {
      const ref = texto(s.ganador || s.perdedor);
      if (!previos.has(ref)) {
        errores.push(faseId + ': el cruce ' + propio + ' se refiere a «' + ref
          + '», que no está declarado antes');
        return { tipo: 'invalido' };
      }
      return { tipo: s.ganador ? 'ganador' : 'perdedor', cruce: ref };
    }
    errores.push(faseId + ': el cruce ' + propio + ' tiene un lado que no se entiende');
    return { tipo: 'invalido' };
  }

  /**
   * `formato.fases` → la lista normalizada, en el orden declarado.
   *
   * Retrocompatible con lo que ya estaba escrito: la Liga Argentina
   * declara `puestos`, `directos` y `cruce` sin `tipo` ni `cruces`, y eso
   * sigue leyéndose igual (el tipo sale del núcleo).
   */
  function parsear(formato) {
    const errores = [];
    const crudo = (formato && Array.isArray(formato.fases)) ? formato.fases : [];
    const fases = [];
    const idsFase = new Set();
    const idsCruce = new Set();

    crudo.forEach((f, i) => {
      const id = texto(f && f.id);
      if (!id) { errores.push('la fase ' + (i + 1) + ' no tiene id'); return; }
      if (idsFase.has(id)) { errores.push('la fase «' + id + '» está repetida'); return; }
      idsFase.add(id);

      /* EL VÍNCULO CON EL LIBRO SE DECLARA. La columna FASE sale del
         nombre de una carpeta de Drive (MotorStats, Nivel 5), así que la
         fase «octavos» del reglamento puede estar escrita «PLAYOFF» en el
         libro. Sin declararlo se asume el id en mayúsculas, que es lo que
         pasa con «regular» → «REGULAR». */
      const libro = (Array.isArray(f.libro) ? f.libro : (f.libro ? [f.libro] : [id]))
        .map(mayus).filter(Boolean);

      const cruces = [];
      (Array.isArray(f.cruces) ? f.cruces : []).forEach((c, j) => {
        const cid = texto(c && c.id);
        if (!cid) { errores.push(id + ': el cruce ' + (j + 1) + ' no tiene id'); return; }
        if (idsCruce.has(cid)) { errores.push(id + ': el cruce «' + cid + '» está repetido'); return; }
        const a = slot(c.a, idsCruce, cid, id, errores);
        const b = slot(c.b, idsCruce, cid, id, errores);
        /* Se registra DESPUÉS de leer sus lados: un cruce que se refiere
           a sí mismo es circular y tiene que quedar inválido. */
        idsCruce.add(cid);
        cruces.push({ id: cid, label: texto(c.label) || null, a: a, b: b });
      });

      let mejorDe = null;
      if (f.serie && f.serie.mejorDe != null) {
        const m = Number(f.serie.mejorDe);
        /* Impar: a un número par de partidos la serie puede quedar
           empatada, y en básquet no hay empates. */
        if (Number.isInteger(m) && m >= 1 && m <= 9 && m % 2 === 1) mejorDe = m;
        else errores.push(id + ': «mejor de ' + f.serie.mejorDe + '» no es una serie (tiene que ser impar)');
      } else if (cruces.length) {
        mejorDe = 1;   // un cruce declarado sin serie es un partido único
      }

      let desde = texto(f.desde) || null;
      let hasta = texto(f.hasta) || null;
      /* LA REGULAR YA TIENE SU VENTANA DECLARADA en el formato: la Liga
         Argentina escribe `inicio` y `finRegular`. Se usa esa y no se
         inventa otra; sin ella, un partido de la fase regular quedaría «sin
         fase» y se colaría marcado en la vista de los playoffs. */
      if (!desde && !hasta && i === 0 && formato && formato.inicio && formato.finRegular) {
        desde = texto(formato.inicio); hasta = texto(formato.finRegular);
      }
      if ((desde || hasta) && !(ISO.test(desde || '') && ISO.test(hasta || '') && desde <= hasta)) {
        errores.push(id + ': la ventana ' + (desde || '?') + ' → ' + (hasta || '?') + ' no es un rango de fechas');
        desde = null; hasta = null;
      }

      const tipo = (f.tipo === 'eliminacion' || f.tipo === 'liga') ? f.tipo
        : (cruces.length || libro.some(esEliminacionDelNucleo) ? 'eliminacion' : 'liga');

      fases.push({
        id: id, label: texto(f.label) || id, tipo: tipo,
        cruce: f.cruce === 'interzonal' ? 'interzonal' : 'zona',
        libro: libro, mejorDe: mejorDe, desde: desde, hasta: hasta,
        cruces: cruces, orden: i,
      });
    });
    return { fases: fases, errores: errores };
  }

  /** La fase declarada que corresponde a un valor de la columna FASE. */
  function declaradaDe(fases, faseLibro) {
    const v = mayus(faseLibro);
    return (fases || []).find(f => f.libro.indexOf(v) !== -1) || null;
  }

  /** ¿La fase del libro se juega por series (llave) o todos contra todos (tabla)? */
  function tipoDe(faseLibro, fases) {
    const d = declaradaDe(fases, faseLibro);
    if (d) return d.tipo;
    return esEliminacionDelNucleo(faseLibro) ? 'eliminacion' : 'liga';
  }

  /* =====================================================================
     2 · EL SELECTOR DE LA BARRA

     Las opciones SIGUEN saliendo del libro (`combinacionesTorneoFase`):
     el estado, la ruta y los links compartidos no cambian. La declaración
     solo aporta el nombre del reglamento y avisa de las fases que todavía
     no tienen datos.
     ===================================================================== */

  /** El prefijo que el id de un tramo sin datos lleva para no colisionar
      con un torneo real: los asteriscos no pueden salir de una celda, igual
      que `*TOTAL*` (punto 3 ter). */
  const SIN_DATOS = '*SIN-DATOS*';

  function enriquecerTramos(tramos, fases) {
    const lista = (tramos || []).map((t) => {
      const d = t.agregado ? null : declaradaDe(fases, t.fase);
      if (!d) return t;
      const general = CORE && t.torneo === CORE.TORNEO_GENERAL;
      const corte = t.label.lastIndexOf(' - ');
      const label = general || corte < 0 ? d.label : t.label.slice(0, corte) + ' - ' + d.label;
      return Object.assign({}, t, { label: label, declarada: d.id });
    });
    /* LA FASE DECLARADA QUE TODAVÍA NO SE JUGÓ SE VE, PERO NO SE ELIGE.
       Es el patrón de la categoría sin libro (punto 6): el DT sabe que
       existe y no entra a una vista vacía. */
    (fases || []).forEach((f) => {
      const tiene = lista.some(t => f.libro.indexOf(mayus(t.fase)) !== -1);
      if (tiene) return;
      lista.push({ id: SIN_DATOS + '|' + f.libro[0], torneo: SIN_DATOS, fase: f.libro[0],
        label: f.label + ' — sin datos', sinDatos: true, declarada: f.id });
    });
    return lista;
  }

  /* =====================================================================
     3 · LAS SERIES

     Se arman con los partidos JUGADOS de una fase, agrupados por el par de
     equipos. No hace falta ninguna declaración para tenerlas: son lo que
     pasó. La declaración suma cuántos partidos gana la serie; sin ella se
     muestra el marcador de la serie y NO se declara un ganador, porque no
     se sabe a cuántos se jugaba.
     ===================================================================== */

  function ordenarPorFecha(a, b) {
    return String(a.fecha || '').localeCompare(String(b.fecha || ''))
      || String(a.hora || '').localeCompare(String(b.hora || ''));
  }

  function cerrarSerie(s, mejorDe) {
    s.partidos.sort(ordenarPorFecha);
    const g = {}; g[s.a] = 0; g[s.b] = 0;
    let jugados = 0;
    s.partidos.forEach((p) => {
      /* Sin marcador o empatado no suma: un empate en básquet es un dato
         mal cargado, y darle la victoria a alguien sería inventarla. */
      if (!p.jugado || p.ptsLocal == null || p.ptsVisitante == null
        || p.ptsLocal === p.ptsVisitante) return;
      jugados++;
      g[p.ptsLocal > p.ptsVisitante ? p.localClave : p.visitanteClave]++;
    });
    const necesarios = mejorDe ? Math.floor(mejorDe / 2) + 1 : null;
    let ganador = null;
    if (necesarios) {
      if (g[s.a] >= necesarios) ganador = s.a;
      else if (g[s.b] >= necesarios) ganador = s.b;
    }
    const lider = g[s.a] === g[s.b] ? null : (g[s.a] > g[s.b] ? s.a : s.b);
    return Object.assign(s, {
      ganados: g, jugados: jugados, mejorDe: mejorDe || null, necesarios: necesarios,
      ganador: ganador, lider: lider,
      proximo: s.partidos.find(p => !p.jugado) || null,
      /* Más partidos jugados que los de la serie: el libro trae uno de
         otra instancia o uno repetido. Se muestra y se avisa, no se tapa. */
      excedida: !!(mejorDe && jugados > mejorDe),
      estado: ganador ? 'definida' : (jugados ? 'en-curso' : 'sin-jugar'),
    });
  }

  /**
   * Los partidos de UNA fase → sus series.
   *
   * Los partidos vienen con la forma del fixture (`fecha`, `localClave`,
   * `visitanteClave`, `local`, `visitante`, `jugado`, `ptsLocal`,
   * `ptsVisitante`), que es la que ya producen `jugadosDelIndice` y el
   * calendario: una sola forma para las dos secciones.
   */
  function series(partidos, mejorDe) {
    const mapa = new Map();
    (partidos || []).forEach((p) => {
      const a = p.localClave, b = p.visitanteClave;
      if (!a || !b || a === b) return;
      const par = [a, b].sort();
      const k = par.join('|');
      if (!mapa.has(k)) mapa.set(k, { clave: k, a: par[0], b: par[1], nombres: {}, partidos: [] });
      const s = mapa.get(k);
      s.nombres[a] = s.nombres[a] || p.local;
      s.nombres[b] = s.nombres[b] || p.visitante;
      s.partidos.push(p);
    });
    return Array.from(mapa.values()).map(s => cerrarSerie(s, mejorDe));
  }

  /**
   * «Serie 1-0 · Partido 2», «Gana ATENAS 2-1», «Mejor de 3 · Partido 1».
   *
   * `primero` elige de qué lado se lee el marcador: en la fila de un
   * partido va primero el local de ESE partido, para que el 1-0 no se lea
   * al revés de los nombres que tiene al lado.
   */
  function resumen(s, primero) {
    if (!s) return '';
    const p = primero && (primero === s.a || primero === s.b) ? primero : (s.lider || s.a);
    const q = p === s.a ? s.b : s.a;
    const nombre = (k) => s.nombres[k] || k;
    if (s.ganador) {
      const perd = s.ganador === s.a ? s.b : s.a;
      return 'Gana ' + nombre(s.ganador)
        + (s.mejorDe > 1 ? ' ' + s.ganados[s.ganador] + '-' + s.ganados[perd] : '');
    }
    if (!s.jugados) return s.mejorDe > 1 ? 'Mejor de ' + s.mejorDe + ' · Partido 1' : 'A jugarse';
    return 'Serie ' + s.ganados[p] + '-' + s.ganados[q]
      + (s.mejorDe && s.mejorDe > 1 ? ' · Partido ' + (s.jugados + 1) : '');
  }

  /* =====================================================================
     4 · LA LLAVE

     Recorre las fases EN ORDEN, porque un cruce de cuartos puede pedir
     «el ganador de O1», que se resuelve con la serie de octavos.
     ===================================================================== */

  function nombreZona(ctx, zona) {
    return (ctx.nombresZona && ctx.nombresZona[zona]) || ('Zona ' + String(zona).toUpperCase());
  }

  /**
   * Un lado de un cruce contra lo que se sabe hoy.
   *
   *   resuelto     el equipo está definido
   *   proyectado   sale de una tabla que todavía se mueve
   *   pendiente    todavía no se puede saber (otra zona, una serie sin terminar)
   *   invalido     la declaración está rota
   */
  function resolverSlot(s, ctx, previos) {
    const zonaDe = (k) => (ctx.zonaDeEquipo && ctx.zonaDeEquipo[k]) || null;
    if (!s || s.tipo === 'invalido') return { estado: 'invalido', etiqueta: '—' };
    if (s.tipo === 'puesto') {
      const et = s.puesto + '° ' + nombreZona(ctx, s.zona);
      const t = ctx.tablas && ctx.tablas[s.zona];
      const fila = t && (t.filas || []).find(f => f.puesto === s.puesto);
      if (!fila) return { estado: 'pendiente', etiqueta: et, zona: s.zona };
      return { estado: t.cerrada ? 'resuelto' : 'proyectado', clave: fila.clave,
        nombre: fila.nombre || fila.clave, etiqueta: et, zona: s.zona };
    }
    if (s.tipo === 'equipo') {
      return { estado: 'resuelto', clave: s.clave, nombre: s.equipo, etiqueta: s.equipo, zona: zonaDe(s.clave) };
    }
    const et = (s.tipo === 'ganador' ? 'Ganador ' : 'Perdedor ') + s.cruce;
    const r = previos[s.cruce];
    if (!r || !r.serie || !r.serie.ganador) return { estado: 'pendiente', etiqueta: et };
    const k = s.tipo === 'ganador' ? r.serie.ganador
      : (r.serie.ganador === r.serie.a ? r.serie.b : r.serie.a);
    return { estado: 'resuelto', clave: k, nombre: r.serie.nombres[k] || k, etiqueta: et, zona: zonaDe(k) };
  }

  /** Intrazonal o interzonal, por las zonas de los dos lados; si no se
      saben, lo que diga la declaración de la fase. */
  function naturalezaCruce(fase, a, b, ctx) {
    const zona = (x) => x.zona || (x.clave && ctx.zonaDeEquipo ? ctx.zonaDeEquipo[x.clave] : null) || null;
    const za = zona(a), zb = zona(b);
    if (za && zb) return za === zb ? 'intrazonal' : 'interzonal';
    return fase.cruce === 'interzonal' ? 'interzonal' : 'intrazonal';
  }

  /** Lo mismo para un partido suelto, con el mapa equipo → zona del torneo. */
  function naturalezaPartido(p, zonaDeEquipo) {
    const za = zonaDeEquipo && zonaDeEquipo[p.localClave];
    const zb = zonaDeEquipo && zonaDeEquipo[p.visitanteClave];
    if (!za || !zb) return null;
    return za === zb ? 'intrazonal' : 'interzonal';
  }

  /**
   * La llave entera: una entrada por fase declarada, con sus cruces
   * resueltos y las series jugadas que no calzan en ningún cruce.
   *
   * `ctx`:
   *   tablas          { zona: { filas: [{clave, nombre, puesto}], cerrada } }
   *   partidosPorFase { faseId: [partidos con forma de fixture] }
   *   zonaDeEquipo    { clave: zona }
   *   nombresZona     { zona: 'Zona Norte' }
   */
  function llave(fases, ctx) {
    const c = ctx || {};
    const previos = {};
    const porFase = {};
    (fases || []).forEach((f) => {
      const sers = series((c.partidosPorFase || {})[f.id] || [], f.mejorDe);
      const usadas = new Set();
      const cruces = f.cruces.map((cr) => {
        let a = resolverSlot(cr.a, c, previos);
        let b = resolverSlot(cr.b, c, previos);
        /* LA SERIE SE BUSCA POR LOS EQUIPOS, y si solo se conoce uno de
           los dos lados se acepta la ÚNICA serie de la fase en la que
           juega: el libro dice contra quién se jugó aunque la tabla de la
           otra zona no esté a mano. Con dos candidatas no se elige —atribuir
           la serie equivocada mueve a un equipo de llave—. */
        let s = null;
        const libre = (x) => !usadas.has(x.clave);
        if (a.clave && b.clave) {
          s = sers.find(x => libre(x) && ((x.a === a.clave && x.b === b.clave)
            || (x.a === b.clave && x.b === a.clave))) || null;
        } else if (a.clave || b.clave) {
          const k = a.clave || b.clave;
          const cands = sers.filter(x => libre(x) && (x.a === k || x.b === k));
          if (cands.length === 1) s = cands[0];
        }
        if (s) {
          usadas.add(s.clave);
          /* Lo jugado confirma lo proyectado, y completa lo pendiente. */
          const otro = (k) => (k === s.a ? s.b : s.a);
          const confirmar = (x) => (x.clave && (x.clave === s.a || x.clave === s.b) && x.estado === 'proyectado')
            ? Object.assign({}, x, { estado: 'resuelto' }) : x;
          a = confirmar(a); b = confirmar(b);
          if (!a.clave && b.clave) a = Object.assign({}, a, { estado: 'resuelto', clave: otro(b.clave),
            nombre: s.nombres[otro(b.clave)], porLoJugado: true });
          if (!b.clave && a.clave) b = Object.assign({}, b, { estado: 'resuelto', clave: otro(a.clave),
            nombre: s.nombres[otro(a.clave)], porLoJugado: true });
        }
        const r = { id: cr.id, label: cr.label, a: a, b: b, serie: s,
          naturaleza: naturalezaCruce(f, a, b, c) };
        previos[cr.id] = r;
        return r;
      });
      porFase[f.id] = { fase: f, cruces: cruces, sueltas: sers.filter(x => !usadas.has(x.clave)) };
    });
    return porFase;
  }

  /* =====================================================================
     5 · A QUÉ FASE PERTENECE UN PARTIDO PROGRAMADO

     Las fuentes del fixture no publican la instancia. Las mismas dos
     reglas del calendario del punto 18, que no se negocian:
       1. lo que dice el LIBRO gana siempre (un partido jugado ya trae su
          fase, y esa se respeta aunque la fecha caiga en otra ventana);
       2. una fecha que cae en DOS ventanas no se asigna: un partido mal
          atribuido ensucia dos fases y no se nota.
     ===================================================================== */
  function faseDeFecha(fecha, fases) {
    const f = texto(fecha);
    if (!ISO.test(f)) return { fase: null, candidatos: [] };
    const cands = (fases || []).filter(x => x.desde && x.hasta && x.desde <= f && f <= x.hasta);
    if (cands.length === 1) return { fase: cands[0], candidatos: cands };
    return { fase: null, candidatos: cands };
  }

  /** ¿Algúna fase declara su ventana de fechas? Sin ninguna, el fixture no
      se puede partir por fase y se muestra como siempre. */
  function tieneVentanas(fases) { return (fases || []).some(f => f.desde && f.hasta); }

  /**
   * ¿La fase regular de una zona ya terminó?
   *
   * Se sabe de dos maneras, y no se adivina de ninguna otra:
   *   - el torneo declara `partidosPorEquipo` y todos lo alcanzaron;
   *   - o ya se jugó un partido de una fase posterior (de hecho terminó).
   */
  function tablaCerrada(filas, partidosPorEquipo, hayEliminacionJugada) {
    if (hayEliminacionJugada) return true;
    const n = Number(partidosPorEquipo);
    if (!n || !filas || !filas.length) return false;
    return filas.every(f => Number(f.pj) >= n);
  }

  /* =====================================================================
     6 · EL HTML (puro: strings, sin `document`)
     ===================================================================== */

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  /* El chip de la naturaleza del cruce. Lleva TEXTO además del tono:
     ningún estado se comunica solo con color (punto 14). */
  function chipNaturaleza(n) {
    if (!n) return '';
    const inter = n === 'interzonal';
    return '<span class="fase-chip ' + (inter ? 'zona-aviso' : 'zona-neutro') + ' zona-texto">'
      + (inter ? '⇄ Interzonal' : 'Intrazonal') + '</span>';
  }

  const ESTADO_LADO = {
    proyectado: '<span class="fase-proyectado" title="Sale de la tabla de hoy: la fase regular todavía no terminó">~ proyectado</span>',
    pendiente: '<span class="fase-proyectado">a definir</span>',
    invalido: '<span class="fase-proyectado">declaración inválida</span>',
  };

  function ladoHTML(x, s, esc2, escudo) {
    const k = x.clave;
    const gan = s && k && s.ganados ? s.ganados[k] : null;
    const gano = s && s.ganador && s.ganador === k;
    const nombre = x.nombre || x.etiqueta;
    return '<div class="fase-lado' + (gano ? ' fase-ganador' : '') + '">'
      + '<span class="flex items-center gap-1.5 min-w-0">'
      + (k && escudo ? escudo(nombre) : '')
      + '<span class="truncate">' + esc2(nombre) + '</span>'
      + (x.clave && x.etiqueta && x.etiqueta !== nombre
        ? '<span class="text-[10px] text-muted whitespace-nowrap">' + esc2(x.etiqueta) + '</span>' : '')
      + (ESTADO_LADO[x.estado] || '')
      + '</span>'
      + '<span class="font-mono tabular-nums">' + (gan != null && s.jugados ? gan : '') + (gano ? ' ✓' : '') + '</span>'
      + '</div>';
  }

  function partidosDeSerie(s) {
    if (!s || !s.partidos.length) return '';
    return '<ul class="fase-partidos">' + s.partidos.map((p, i) => '<li>'
      + '<span class="text-muted">P' + (i + 1) + ' · ' + esc(p.fecha || 's/f') + '</span> '
      + esc(p.local) + ' '
      + (p.jugado && p.ptsLocal != null ? '<b class="font-mono">' + p.ptsLocal + '–' + p.ptsVisitante + '</b>'
        : '<span class="text-muted">' + (p.hora ? esc(p.hora) : 'a jugarse') + '</span>')
      + ' ' + esc(p.visitante) + '</li>').join('') + '</ul>';
  }

  /** La card de un cruce: los dos lados, la serie y sus partidos. */
  function cruceHTML(cr, opciones) {
    const o = opciones || {};
    const s = cr.serie;
    const titulo = cr.label || cr.id;
    return '<article class="fase-cruce' + (o.destacar && o.destacar(cr) ? ' fase-cruce-propio' : '') + '">'
      + '<header class="flex items-center justify-between gap-2 mb-1.5">'
      + '<span class="font-display uppercase tracking-wide text-[11px] text-muted">' + esc(titulo) + '</span>'
      + chipNaturaleza(cr.naturaleza) + '</header>'
      + ladoHTML(cr.a, s, esc, o.escudo) + ladoHTML(cr.b, s, esc, o.escudo)
      + '<p class="text-[11px] mt-1.5 ' + (s && s.ganador ? 'text-ink' : 'text-muted') + '">'
      + esc(s ? resumen(s) : (cr.a.clave && cr.b.clave ? 'Sin partidos todavía' : 'Cruce a definir')) + '</p>'
      + (s && s.excedida ? '<p class="text-[11px] zona-aviso zona-texto">⚠ Hay más partidos jugados que los de la serie: revisá el libro.</p>' : '')
      + partidosDeSerie(s)
      + '</article>';
  }

  /** Una serie jugada que no calza en ningún cruce declarado. */
  function serieSueltaHTML(s, opciones) {
    const o = opciones || {};
    const lado = (k) => ({ clave: k, nombre: s.nombres[k] || k, estado: 'resuelto' });
    return cruceHTML({ id: '', label: null, a: lado(s.a), b: lado(s.b), serie: s, naturaleza: o.naturaleza ? o.naturaleza(s) : null },
      o);
  }

  /**
   * La llave de las fases de eliminación, una columna por fase, con la
   * ACTIVA marcada. Es un bracket de verdad cuando la declaración trae
   * cruces; sin declaración, son las series que se jugaron.
   */
  function llaveHTML(porFase, faseActivaId, opciones) {
    const ids = Object.keys(porFase || {}).filter(id => porFase[id].fase.tipo === 'eliminacion');
    if (!ids.length) return '';
    const columnas = ids.map((id) => {
      const x = porFase[id];
      const activa = id === faseActivaId;
      const cuerpo = x.cruces.map(cr => cruceHTML(cr, opciones)).join('')
        + (x.sueltas.length ? (x.cruces.length
          ? '<p class="text-[11px] text-muted mt-2">Series jugadas que no calzan en ningún cruce declarado:</p>' : '')
          + x.sueltas.map(s => serieSueltaHTML(s, opciones)).join('') : '')
        || '<p class="text-[11px] text-muted">Todavía no hay cruces para esta fase.</p>';
      return '<div class="fase-columna' + (activa ? ' fase-activa' : '') + '">'
        + '<h4 class="font-display uppercase tracking-wide text-xs mb-2 ' + (activa ? 'text-accent' : 'text-muted') + '">'
        + esc(x.fase.label) + (x.fase.mejorDe > 1 ? ' <span class="normal-case text-muted">· al mejor de ' + x.fase.mejorDe + '</span>' : '')
        + '</h4><div class="space-y-2">' + cuerpo + '</div></div>';
    }).join('');
    return '<div class="scrollbox"><div class="fase-llave">' + columnas + '</div></div>';
  }

  /* =====================================================================
     7 · EL PEGAMENTO CON LA APP (navegador)
     ===================================================================== */

  /* El doc del torneo lo baja y lo cachea el Fixture (uno por vez): acá se
     lee de ahí para no pedir el mismo archivo dos veces. */
  let _parseo = { doc: null, res: { fases: [], errores: [] } };
  function docActual() {
    try {
      const id = SGADD_APP.estado.planillaId;
      const p = CORE.CATALOGO.planillas.find(x => x.id === id);
      if (!p || !p.torneoId || typeof SGADD_FIXTURE === 'undefined') return null;
      const e = SGADD_FIXTURE.estado;
      return e.torneo === p.torneoId ? e.doc : null;
    } catch (e) { return null; }
  }
  /** Las fases declaradas del torneo de la categoría abierta, o []. */
  function declaradas() {
    const doc = docActual();
    if (doc !== _parseo.doc) _parseo = { doc: doc, res: parsear(doc && doc.formato) };
    return _parseo.res.fases;
  }

  /* UN ÍNDICE POR FASE, cacheado por libro. El índice de la app está
     scopeado al TRAMO que eligió el DT (torneo + fase), pero la llave
     necesita la tabla de la fase REGULAR y los partidos de CADA fase de
     eliminación, y el fixture necesita todos los partidos de la fase —no
     solo los de la Ida—. Se arman a pedido y se guardan por libro: cambiar
     de categoría trae otras hojas y el caché se va con ellas. */
  const _indices = new WeakMap();
  /** El tramo que cubre TODA una fase: el TOTAL sintético si la fase tiene
      más de un torneo, si no el único que haya. */
  function tramoDeFase(hojas, faseLibro) {
    const f = mayus(faseLibro);
    const tramos = CORE.combinacionesTorneoFase(hojas).filter(t => t.fase === f);
    return tramos.find(x => x.sintetico) || tramos[0] || null;
  }
  function indicePara(hojas, faseLibro) {
    if (!hojas || !CORE) return null;
    const f = mayus(faseLibro);
    let porFase = _indices.get(hojas);
    if (!porFase) { porFase = {}; _indices.set(hojas, porFase); }
    if (porFase[f] !== undefined) return porFase[f];
    const t = tramoDeFase(hojas, f);
    porFase[f] = t ? CORE.construirIndice(hojas, { fase: f, torneo: t.torneo }) : null;
    return porFase[f];
  }

  /* Un partido manual (punto 44) con la forma del fixture: sin box score
     igual cuenta para una serie, igual que cuenta para la tabla. */
  function manualComoPartido(m) {
    const pl = Number(m.puntosLocal), pv = Number(m.puntosVisitante);
    return { fecha: texto(m.fecha).slice(0, 10) || null, hora: null,
      local: m.local, visitante: m.visitante,
      localClave: clave(m.local), visitanteClave: clave(m.visitante),
      jugado: true, ptsLocal: isFinite(pl) ? pl : null, ptsVisitante: isFinite(pv) ? pv : null,
      manual: true };
  }
  /* Los CRUDOS van a la tabla (que los fusiona a su manera, punto 44) y
     los convertidos a las series: dos formas, un solo origen. */
  function manualesCrudos(hojas, faseLibro) {
    if (typeof clasifManualesVigentes !== 'function') return [];
    const t = tramoDeFase(hojas, faseLibro);
    return clasifManualesVigentes(t ? t.torneo : CORE.TORNEO_GENERAL, mayus(faseLibro)) || [];
  }
  function manualesDeFase(hojas, faseLibro) {
    return manualesCrudos(hojas, faseLibro).map(manualComoPartido);
  }

  function jugados(idx) {
    return (idx && typeof SGADD_FIXTURE !== 'undefined') ? SGADD_FIXTURE.jugadosDelIndice(idx) : [];
  }

  /** equipo → zona, desde el archivo del torneo (nombre y alias). */
  function zonasDeEquipos(doc) {
    const out = {};
    const zonas = (doc && doc.zonas) || {};
    Object.keys(zonas).forEach((z) => {
      (zonas[z].equipos || []).forEach((e) => {
        [e.nombre].concat(e.alias || []).forEach((n) => { if (n) out[clave(n)] = z; });
      });
    });
    return out;
  }
  function nombresDeZonas(doc) {
    const out = {};
    const zonas = (doc && doc.zonas) || {};
    Object.keys(zonas).forEach((z) => { out[z] = zonas[z].label || ('Zona ' + z.toUpperCase()); });
    return out;
  }

  /**
   * El contexto de la llave para la categoría abierta.
   *
   * La tabla que resuelve los puestos es la de la fase regular DE ESTE
   * LIBRO, o sea de la zona de la categoría. Los puestos de otra zona
   * quedan pendientes: eso es la entrega interzonal.
   */
  function contexto() {
    const st = SGADD_APP.estado;
    const hojas = st.hojas;
    const doc = docActual();
    const fases = declaradas();
    const p = CORE.CATALOGO.planillas.find(x => x.id === st.planillaId) || {};
    const partidosPorFase = {};
    let hayElimJugada = false;
    fases.forEach((f) => {
      const lista = [];
      f.libro.forEach((v) => {
        jugados(indicePara(hojas, v)).forEach(x => lista.push(x));
        manualesDeFase(hojas, v).forEach(x => lista.push(x));
      });
      partidosPorFase[f.id] = lista;
      if (f.tipo === 'eliminacion' && lista.length) hayElimJugada = true;
    });
    const regular = fases.find(f => f.tipo === 'liga') || null;
    const faseR = regular ? regular.libro[0] : 'REGULAR';
    const idxR = indicePara(hojas, faseR);
    const tablas = {};
    if (idxR && p.zonaId && typeof SGADD_CLASIF !== 'undefined') {
      /* LA MISMA TABLA QUE MUESTRA CLASIFICACIÓN: con los manuales del
         tramo y el orden de desempate del club. Con otra, el «2° de la
         zona» de la llave podía no ser el 2° de la tabla de al lado. */
      const tR = tramoDeFase(hojas, faseR);
      const torneoR = tR ? tR.torneo : CORE.TORNEO_GENERAL;
      const cfg = (typeof clasifFormatoVigente === 'function') ? clasifFormatoVigente(torneoR, faseR).config : null;
      const filas = SGADD_CLASIF.tabla(idxR, {
        orden: (cfg && cfg.ordenTabla) || SGADD_CLASIF.ORDEN_POR_DEFECTO,
        manuales: manualesCrudos(hojas, faseR),
      }).map(r => ({ clave: r.clave, nombre: r.nombre, puesto: r.puesto, pj: r.pj }));
      tablas[p.zonaId] = { filas: filas,
        cerrada: tablaCerrada(filas, doc && doc.formato && doc.formato.partidosPorEquipo, hayElimJugada) };
    }
    return { tablas: tablas, partidosPorFase: partidosPorFase,
      zonaDeEquipo: zonasDeEquipos(doc), nombresZona: nombresDeZonas(doc) };
  }

  /**
   * La sección de la llave para Clasificación, o '' si la fase abierta
   * se juega todos contra todos.
   */
  function seccionLlave() {
    try {
      const st = SGADD_APP.estado;
      if (!st.hojas || tipoDe(st.fase, declaradas()) !== 'eliminacion') return '';
      const fases = declaradas();
      const escudo = (typeof clasifEscudo === 'function') ? clasifEscudo : null;
      const propio = (typeof CORE.esEquipoPropio === 'function') ? CORE.esEquipoPropio : null;
      const opciones = { escudo: escudo,
        destacar: (cr) => !!(propio && ((cr.a.nombre && propio(cr.a.nombre)) || (cr.b.nombre && propio(cr.b.nombre)))) };
      let cuerpo;
      if (declaradaDe(fases, st.fase)) {
        const d = declaradaDe(fases, st.fase);
        cuerpo = llaveHTML(llave(fases, contexto()), d.id, opciones);
      } else {
        /* SIN DECLARACIÓN: las series que se jugaron, y nada más. No se
           sabe a cuántos partidos era la serie, así que no se declara un
           ganador (`mejorDe` null). */
        const pseudo = { id: st.fase, label: (CORE.FASES[st.fase] || {}).label || st.fase,
          tipo: 'eliminacion', mejorDe: null, cruces: [] };
        const ps = {}; ps[st.fase] = { fase: pseudo, cruces: [],
          sueltas: series(jugados(indicePara(st.hojas, st.fase)), null) };
        cuerpo = llaveHTML(ps, st.fase, opciones);
      }
      return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
        + '<div class="flex items-baseline justify-between gap-3 flex-wrap mb-3">'
        + '<h2 class="font-display uppercase tracking-wide text-sm text-ink">Llave y series</h2>'
        + '<span class="text-[11px] text-muted">Lo jugado sale del libro · lo proyectado, de la tabla de hoy</span></div>'
        + (cuerpo || '<p class="text-xs text-muted">Todavía no se jugó ningún partido de esta fase.</p>')
        + '</div>';
    } catch (e) {
      /* La llave es una mejora: si revienta, la sección sigue con la tabla. */
      if (typeof console !== 'undefined') console.warn('[fases]', e);
      return '';
    }
  }

  return {
    /* motor */
    parsear, declaradaDe, tipoDe, enriquecerTramos, SIN_DATOS,
    series, resumen, resolverSlot, llave, naturalezaCruce, naturalezaPartido,
    faseDeFecha, tieneVentanas, tablaCerrada,
    /* html */
    llaveHTML, cruceHTML, chipNaturaleza,
    /* app */
    declaradas, docActual, indicePara, tramoDeFase, contexto, seccionLlave, zonasDeEquipos,
    manualComoPartido,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_FASES;
