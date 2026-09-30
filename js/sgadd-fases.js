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
  function parsear(formato, opciones) {
    const o = opciones || {};
    const validas = Array.isArray(o.zonasValidas) ? o.zonasValidas.map(z => texto(z).toLowerCase()) : null;
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

      /* LA PERTENENCIA POR ZONA, declarada (punto 78). Una zona que el
         torneo no tiene se rechaza: una fase atada a una zona inexistente
         no se le muestra a nadie y se ve igual de declarada que una buena. */
      let zonasDeclaradas = null;
      if (f.zonas != null) {
        const lista = (Array.isArray(f.zonas) ? f.zonas : [f.zonas]).map(z => texto(z).toLowerCase()).filter(Boolean);
        const malas = validas ? lista.filter(z => validas.indexOf(z) === -1) : [];
        if (malas.length) errores.push(id + ': la zona «' + malas.join('», «') + '» no es una zona del torneo');
        else if (lista.length) zonasDeclaradas = Array.from(new Set(lista)).sort();
      }

      fases.push({
        id: id, label: texto(f.label) || id, tipo: tipo,
        cruce: f.cruce === 'interzonal' ? 'interzonal' : 'zona',
        libro: libro, mejorDe: mejorDe, desde: desde, hasta: hasta,
        cruces: cruces, orden: i,
        /* En qué zona del torneo se juega (punto 76): la de la
           postemporada, para una fase entre zonas. Sin declarar, la fase
           se juega en el libro de cada zona. */
        zonaLibro: texto(f.zonaLibro) || null,
        zonasDeclaradas: zonasDeclaradas,
      });
    });
    asignarZonas(fases, o.participan);
    desambiguarEtiquetas(fases);
    return { fases: fases, errores: errores };
  }

  /* =====================================================================
     1 bis · A QUÉ ZONAS PERTENECE CADA FASE (punto 78)

     Sin esto, «Playoffs - Zona A» le aparecía a un cliente de la Zona B:
     la declaración es del TORNEO entero y el selector ofrecía todo. En
     cascada, de lo explícito a lo deducido:
       1. `zonas` declaradas en la fase;
       2. las zonas de sus CRUCES: los puestos, y las de los cruces a los
          que se refiere («Ganador P5» hereda las zonas de P5);
       3. las zonas que `participan` del libro donde se juega;
       4. ninguna → la fase es de TODAS (la regular, una fase sin cruces).
     ===================================================================== */
  function asignarZonas(fases, participan) {
    const deCruce = {};
    (fases || []).forEach((f) => {
      const deducidas = new Set();
      f.cruces.forEach((cr) => {
        const s = new Set();
        [cr.a, cr.b].forEach((x) => {
          if (!x) return;
          if (x.tipo === 'puesto') s.add(texto(x.zona).toLowerCase());
          else if ((x.tipo === 'ganador' || x.tipo === 'perdedor') && deCruce[x.cruce]) deCruce[x.cruce].forEach(z => s.add(z));
        });
        deCruce[cr.id] = s;
        s.forEach(z => deducidas.add(z));
      });
      const part = f.zonaLibro && participan ? participan[f.zonaLibro] : null;
      if (f.zonasDeclaradas) { f.zonas = f.zonasDeclaradas.slice(); f.zonasOrigen = 'declarada'; }
      else if (deducidas.size) { f.zonas = Array.from(deducidas).sort(); f.zonasOrigen = 'cruces'; }
      else if (Array.isArray(part) && part.length) {
        f.zonas = part.map(z => texto(z).toLowerCase()).filter(Boolean).sort(); f.zonasOrigen = 'libro';
      } else { f.zonas = null; f.zonasOrigen = null; }
    });
    return fases;
  }

  /** ¿La fase se le muestra a la zona? Sin zona, o fase de todas: sí. */
  function visibleEnZona(f, zona) {
    const z = texto(zona).toLowerCase();
    return !z || !f || !f.zonas || f.zonas.indexOf(z) !== -1;
  }
  function filtrarPorZona(fases, zona) { return (fases || []).filter(f => visibleEnZona(f, zona)); }

  /**
   * Las fases que la zona necesita para RESOLVER su llave: las suyas más
   * aquellas de las que dependen («Ganador P9» de una final A-B necesita la
   * semifinal A). Esas se cargan pero no se muestran.
   */
  function dependenciasDe(fases, visibles) {
    const idsVis = new Set((visibles || []).map(f => f.id));
    const faseDeCruce = {};
    (fases || []).forEach(f => f.cruces.forEach((cr) => { faseDeCruce[cr.id] = f; }));
    const out = new Set(idsVis);
    const pila = (visibles || []).slice();
    while (pila.length) {
      const f = pila.pop();
      f.cruces.forEach(cr => [cr.a, cr.b].forEach((x) => {
        if (!x || (x.tipo !== 'ganador' && x.tipo !== 'perdedor')) return;
        const g = faseDeCruce[x.cruce];
        if (g && !out.has(g.id)) { out.add(g.id); pila.push(g); }
      }));
    }
    return (fases || []).filter(f => out.has(f.id));
  }

  /* DOS FASES CON EL MISMO NOMBRE se distinguen por su instancia: el Panel
     Master aceptaba tres «Playoffs - Zona A» (cuartos, semis y final) y el
     selector los listaba iguales. */
  function desambiguarEtiquetas(fases) {
    const cuenta = {};
    (fases || []).forEach((f) => { cuenta[f.label] = (cuenta[f.label] || 0) + 1; });
    (fases || []).forEach((f) => {
      f.labelDeclarado = f.label;
      if (cuenta[f.label] < 2) return;
      const v = f.libro[0];
      const nucleo = CORE && CORE.FASES && CORE.FASES[v] ? CORE.FASES[v].label : null;
      f.label = f.label + ' · ' + (nucleo || v || f.id);
    });
    return fases;
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

  /* EL MODO LLAVE (punto 76). Una fase entre zonas se juega en el libro de
     la postemporada, que un cliente NO recibe: solo le llega la llave
     (posiciones y resultados, sin estadísticas). Elegirla en la barra abre
     ese modo: Clasificación y Fixture muestran la llave y el resto de las
     secciones lo dicen en vez de pintar un índice vacío. El id lleva
     asteriscos como `*TOTAL*`, así un link compartido lo abre igual. */
  const LLAVE = '*LLAVE*';
  function esLlave(torneo) { return texto(torneo) === LLAVE; }
  /** ¿La fase se juega fuera del libro de la zona? */
  function esEntreZonas(f) { return !!f && (f.cruce === 'interzonal' || !!f.zonaLibro); }

  /* Las secciones que en modo llave se pintan igual: las dos que muestran
     la llave y las que no dependen del tramo. El resto dice por qué no hay
     nada en vez de pintar el índice de otra fase. UNA lista, la leen el
     router y el repintado de `onCambio`. */
  /* SCOUTING ENTRA (punto 79): en modo llave prepara el cruce de la fase,
     contra un rival de la propia zona o —pidiéndolo al servidor— de otra. */
  const SECCIONES_EN_LLAVE = ['clasificacion', 'fixture', 'scouting', 'glosario', 'configuracion', 'diagnostico'];
  function bloqueaEnLlave(seccion, torneo) {
    return esLlave(torneo) && SECCIONES_EN_LLAVE.indexOf(seccion) === -1;
  }

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
      /* UNA FASE ENTRE ZONAS SÍ SE ELIGE aunque el libro de la zona no la
         tenga: su llave se arma con las posiciones de cada zona y los
         resultados de la postemporada, que llegan por otra ruta. */
      if (esEntreZonas(f)) {
        lista.push({ id: LLAVE + '|' + f.libro[0], torneo: LLAVE, fase: f.libro[0],
          label: f.label + ' · llave', llave: true, declarada: f.id });
        return;
      }
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
    if (fase.cruce === 'interzonal') return 'interzonal';
    /* Con los DOS lados sin definir no se sabe: una final entre ganadores
       de cruces interzonales puede terminar siendo de dos zonas, y el chip
       «Intrazonal» afirmaría algo que el dato todavía no dice (punto 76). */
    return (za || zb) ? 'intrazonal' : null;
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
  /* LA DECLARACIÓN DE KV GANA SOBRE LA DEL REPO (punto 77): el editor de
     cruces del Panel Master la escribe sin un deploy. Se funde con el
     archivo —que trae el calendario y las ventanas— y se cachea por
     identidad de las dos mitades, porque `declaradas()` reparsea cuando
     cambia el objeto. */
  let _fundido = { kv: null, doc: null, res: null };
  function fundir(kv, doc) {
    if (!kv) return doc;
    if (_fundido.kv === kv && _fundido.doc === doc) return _fundido.res;
    const base = doc || {};
    const fKv = kv.formato || {};
    const formato = Object.assign({}, base.formato || {});
    Object.keys(fKv).forEach((k) => { if (fKv[k] !== null && fKv[k] !== undefined) formato[k] = fKv[k]; });
    const zonas = Object.assign({}, kv.zonas || {});
    Object.keys(base.zonas || {}).forEach((z) => {
      /* Del archivo se conservan los alias de los equipos, que el editor
         no carga. */
      zonas[z] = Object.assign({}, zonas[z] || {}, base.zonas[z], zonas[z] ? { label: zonas[z].label } : {});
    });
    const res = Object.assign({}, base, { id: kv.id, formato: formato, zonas: zonas, origenFases: 'kv' });
    _fundido = { kv: kv, doc: doc, res: res };
    return res;
  }
  function docActual() {
    try {
      const id = SGADD_APP.estado.planillaId;
      const p = CORE.CATALOGO.planillas.find(x => x.id === id);
      if (!p || !p.torneoId) return null;
      const kv = (p.torneoDecl && p.torneoDecl.id === p.torneoId) ? p.torneoDecl : null;
      /* El archivo del repo es opcional cuando hay declaración en KV: si el
         Fixture todavía no lo bajó, la llave igual se resuelve. */
      let doc = null;
      try {
        const e = SGADD_FIXTURE.estado;
        doc = e && e.torneo === p.torneoId ? e.doc : null;
      } catch (e) { doc = null; }
      return fundir(kv, doc);
    } catch (e) { return null; }
  }
  /** Libro vinculado → las zonas que participan (punto 77). */
  function participanDe(doc) {
    const out = {};
    const zonas = (doc && doc.zonas) || {};
    Object.keys(zonas).forEach((z) => { if (Array.isArray(zonas[z].participan)) out[z] = zonas[z].participan; });
    return out;
  }
  /** Las fases declaradas del torneo de la categoría abierta, o []. TODAS:
      son las que resuelven la llave. Para mostrar, `visibles()`. */
  function declaradas() {
    const doc = docActual();
    if (doc !== _parseo.doc) _parseo = { doc: doc, res: parsear(doc && doc.formato, { participan: participanDe(doc) }) };
    return _parseo.res.fases;
  }
  /** La zona de la categoría abierta, o null (un club sin torneo). */
  function zonaAbierta() {
    try {
      const p = CORE.CATALOGO.planillas.find(x => x.id === SGADD_APP.estado.planillaId);
      return (p && p.zonaId) || null;
    } catch (e) { return null; }
  }
  /* LAS FASES QUE SE MUESTRAN (punto 78): las de la zona de la categoría
     abierta. Un cliente de la Zona B no ve «Playoffs - Zona A» ni en el
     selector, ni en la llave, ni en el Fixture. Se filtra por la ZONA del
     libro abierto y no por el rol: el admin que mira la Zona B ve lo mismo
     que su cliente. */
  let _vis = { base: null, zona: null, res: [] };
  function visibles() {
    const base = declaradas();
    const zona = zonaAbierta();
    if (_vis.base !== base || _vis.zona !== zona) _vis = { base: base, zona: zona, res: filtrarPorZona(base, zona) };
    return _vis.res;
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

  /* LA LLAVE DEL SERVIDOR, una vez por torneo y por carga de página. Llega
     tarde (es una petición aparte) y cuando llega repinta la sección que
     la muestra: la llave se ve primero con lo que el libro propio sabe y
     después se completa con las otras zonas. */
  const _llave = { torneo: null, datos: null, pidiendo: null, error: null };
  function repintarLaQueLaMuestra() {
    if (typeof currentSection === 'undefined' || typeof renderSection !== 'function') return;
    if (currentSection === 'clasificacion' || currentSection === 'fixture') renderSection(currentSection);
  }
  let _alLlegar = repintarLaQueLaMuestra;
  function alLlegarLaLlave(fn) { _alLlegar = fn; }
  function llaveDelServidor() {
    const doc = docActual();
    const id = doc && doc.id;
    if (!id) return null;
    if (_llave.torneo === id && (_llave.datos || _llave.error || _llave.pidiendo)) return _llave.datos;
    if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.llaveDeTorneo) return null;
    _llave.torneo = id; _llave.datos = null; _llave.error = null;
    let p;
    try { p = SGADD_DATA.llaveDeTorneo(id); } catch (e) { p = Promise.reject(e); }
    _llave.pidiendo = Promise.resolve(p).then((d) => {
      if (_llave.torneo !== id) return;
      _llave.datos = d || null; _llave.pidiendo = null;
      if (d && _alLlegar) { try { _alLlegar(); } catch (e) { /* es una mejora */ } }
    }).catch((e) => {
      if (_llave.torneo !== id) return;
      _llave.error = e; _llave.pidiendo = null;
    });
    return null;
  }
  /** Para los tests: cargar una llave sin red. */
  function fijarLlave(torneo, datos) { _llave.torneo = torneo; _llave.datos = datos; _llave.pidiendo = null; _llave.error = null; }

  /** Un partido de la postemporada (sin estadísticas) con la forma del fixture. */
  /** El mismo partido, se escriba de qué lado se escriba. */
  function clavePartido(x) {
    const a = x.localClave || clave(x.local), b = x.visitanteClave || clave(x.visitante);
    return String(x.fecha || '').slice(0, 10) + '|' + [a, b].sort().join('|');
  }
  function partidoDeLlave(x) {
    return { fecha: x.fecha || null, hora: null, local: x.local, visitante: x.visitante,
      localClave: clave(x.local), visitanteClave: clave(x.visitante),
      jugado: x.ptsLocal != null && x.ptsVisitante != null,
      ptsLocal: x.ptsLocal, ptsVisitante: x.ptsVisitante, postemporada: true };
  }

  /**
   * Lo que la llave del servidor aporta al contexto: las tablas de las
   * OTRAS zonas y los partidos de las fases que no están en el libro
   * propio. La zona propia se queda con su tabla local, que es la que el
   * DT ve en Clasificación (con los manuales de SU club).
   */
  function mezclarLlave(ctx, fases, llave, zonaPropia, hojas) {
    if (!llave) return ctx;
    Object.keys(llave.zonas || {}).forEach((z) => {
      if (z === zonaPropia && ctx.tablas[z]) return;
      const t = llave.zonas[z];
      ctx.tablas[z] = { filas: (t.filas || []).map(f => ({ clave: f.clave || clave(f.nombre), nombre: f.nombre,
        puesto: f.puesto, pj: f.pj })), cerrada: !!t.cerrada };
      if (t.label) ctx.nombresZona[z] = ctx.nombresZona[z] || t.label;
    });
    const post = (llave.postemporada && llave.postemporada.partidos) || [];
    fases.forEach((f) => {
      /* CON LIBROS VINCULADOS (punto 77) el libro propio trae los partidos
         de SU equipo en esa fase, y la llave del servidor los de TODOS.
         Se suman los que faltan, sin repetir: el mismo partido es la misma
         fecha con los mismos dos equipos, del lado que sea. Lo del libro
         gana, porque trae el box score detrás. */
      const ya = new Set((ctx.partidosPorFase[f.id] || []).map(clavePartido));
      /* EL MISMO VALOR DE FASE EN DOS LIBROS («SEMIFINAL» de los playoffs
         A y de los B) no se mezcla: si la fase dice en qué libro se juega,
         solo entran los partidos de ESE libro (punto 78). */
      const deFase = post.filter(x => f.libro.indexOf(mayus(x.fase)) !== -1
        && (!f.zonaLibro || !x.zonaLibro || x.zonaLibro === f.zonaLibro)).map(partidoDeLlave)
        .filter((x) => { const k = clavePartido(x); if (ya.has(k)) return false; ya.add(k); return true; });
      if (deFase.length) ctx.partidosPorFase[f.id] = (ctx.partidosPorFase[f.id] || []).concat(deFase);
    });
    return ctx;
  }

  /* LO QUE NO SE PUEDE MOSTRAR EN MODO LLAVE, dicho y no escondido: el
     libro de la postemporada no se le entrega a un cliente, así que no hay
     desglose de equipos ni scouting de esa fase. */
  function avisoModoLlave() {
    /* `data-modo-llave` es la marca que busca `onCambio` para saber que la
       pantalla es este aviso y no la sección: al volver a una fase de la
       zona hay que pasar por el router, porque la sección no tiene dónde
       pintarse (punto 79). */
    return '<div data-modo-llave class="card rounded-xl p-4 sm:p-5 border border-hairline mt-5">'
      + '<h3 class="font-display uppercase tracking-wide text-sm text-ink mb-2">Fase entre zonas · solo la llave</h3>'
      + '<p class="text-xs text-muted">Esta fase se juega en el libro de la postemporada, que tu acceso no incluye: '
      + 'los datos completos llegan solo de tu zona. Acá ves <b class="text-ink">contra quién se juega y cómo van las series</b> '
      + '—en <b class="text-ink">Clasificación</b> y <b class="text-ink">Fixture</b>—, sin el desglose de los equipos ni el scouting '
      + 'de los rivales de otra zona. Para el resto del panel, elegí una fase de tu zona en el selector.</p></div>';
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
      /* El libro propio alimenta solo las fases de SU zona: con el mismo
         valor de FASE, sus partidos caerían en la fase de otra (punto 78). */
      if (p.zonaId && !visibleEnZona(f, p.zonaId)) { partidosPorFase[f.id] = lista; return; }
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
    const ctx = { tablas: tablas, partidosPorFase: partidosPorFase,
      zonaDeEquipo: zonasDeEquipos(doc), nombresZona: nombresDeZonas(doc) };
    /* Las OTRAS zonas y la postemporada llegan del servidor, solo si hay
       alguna fase entre zonas: un torneo de zona única no la necesita. */
    return fases.some(esEntreZonas) ? mezclarLlave(ctx, fases, llaveDelServidor(), p.zonaId, hojas) : ctx;
  }

  /* LOS ESCUDOS DE OTRA ZONA (punto 79). `LOGOS.getUrl` solo lee el caché,
     y el caché lo llena `resolver()` con los equipos del libro PROPIO: los
     de otra zona salían siempre con iniciales aunque su archivo estuviera
     en el manifiesto. Se piden una vez por nombre; el hook de LOGOS
     repinta cuando entra alguno nuevo, y como un nombre sin archivo queda
     en caché, no hay ciclo. */
  const _escudosPedidos = new Set();
  function nombresDeLlave(porFase) {
    const out = [];
    Object.keys(porFase || {}).forEach((id) => {
      const x = porFase[id];
      (x.cruces || []).forEach((cr) => { [cr.a, cr.b].forEach((l) => { if (l && l.nombre) out.push(l.nombre); }); });
      (x.sueltas || []).forEach((s) => { Object.keys(s.nombres || {}).forEach(k => out.push(s.nombres[k])); });
    });
    return out;
  }
  function pedirEscudos(nombres) {
    if (typeof LOGOS === 'undefined' || !LOGOS.resolver) return [];
    const faltan = Array.from(new Set(nombres || [])).filter(n => n && !_escudosPedidos.has(n) && !LOGOS.getUrl(n));
    if (!faltan.length) return [];
    faltan.forEach(n => _escudosPedidos.add(n));
    try { LOGOS.resolver(faltan); } catch (e) { /* los escudos son una mejora */ }
    return faltan;
  }

  /**
   * LOS RIVALES DE LA LLAVE QUE JUEGAN EN OTRA ZONA (punto 79): los cruces
   * de las fases de la zona abierta donde un lado es el equipo propio y el
   * otro ya tiene nombre —resuelto o proyectado— y es de otra zona. Es la
   * lista que Scouting ofrece además de los equipos del libro.
   */
  function rivalesDeOtraZona(esPropio) {
    try {
      const vis = visibles();
      if (!vis.length) return [];
      const zona = zonaAbierta();
      const ctx = contexto();
      const ll = llave(declaradas(), ctx);
      const propio = esPropio || ((n) => !!(CORE && CORE.esEquipoPropio && CORE.esEquipoPropio(n)));
      const zonaDe = (l) => l.zona || (ctx.zonaDeEquipo && ctx.zonaDeEquipo[l.clave]) || null;
      const out = [];
      const vistos = new Set();
      vis.forEach((f) => {
        ((ll[f.id] || {}).cruces || []).forEach((cr) => {
          [[cr.a, cr.b], [cr.b, cr.a]].forEach(([yo, otro]) => {
            if (!yo.clave || !otro.clave || !propio(yo.nombre || yo.clave)) return;
            const z = zonaDe(otro);
            if (!z || (zona && z === zona) || vistos.has(otro.clave)) return;
            vistos.add(otro.clave);
            out.push({ clave: otro.clave, nombre: otro.nombre || otro.clave, zona: z,
              zonaLabel: (ctx.nombresZona && ctx.nombresZona[z]) || z, estado: otro.estado,
              cruce: cr.id, fase: f.id, faseLabel: f.label });
          });
        });
      });
      return out;
    } catch (e) { return []; }
  }

  /**
   * La sección de la llave para Clasificación, o '' si la fase abierta
   * se juega todos contra todos.
   */
  function seccionLlave() {
    try {
      const st = SGADD_APP.estado;
      const vis = visibles();
      if (tipoDe(st.fase, vis) !== 'eliminacion') return '';
      if (!st.hojas && !esLlave(st.torneo)) return '';
      const fases = declaradas();
      const escudo = (typeof clasifEscudo === 'function') ? clasifEscudo : null;
      const propio = (typeof CORE.esEquipoPropio === 'function') ? CORE.esEquipoPropio : null;
      const opciones = { escudo: escudo,
        destacar: (cr) => !!(propio && ((cr.a.nombre && propio(cr.a.nombre)) || (cr.b.nombre && propio(cr.b.nombre)))) };
      let cuerpo;
      if (declaradaDe(vis, st.fase)) {
        const d = declaradaDe(vis, st.fase);
        /* Se resuelve con TODAS (una final A-B necesita la semifinal A) y
           se muestran solo las de la zona. */
        const todo = llave(fases, contexto());
        const soloVis = {};
        vis.forEach((f) => { if (todo[f.id]) soloVis[f.id] = todo[f.id]; });
        pedirEscudos(nombresDeLlave(soloVis));
        cuerpo = llaveHTML(soloVis, d.id, opciones);
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
        + '<span class="text-[11px] text-muted">' + (esLlave(st.torneo)
          ? 'Lo jugado sale de la postemporada · las otras zonas, de su tabla de hoy'
          : 'Lo jugado sale del libro · lo proyectado, de la tabla de hoy') + '</span></div>'
        + (cuerpo || '<p class="text-xs text-muted">Todavía no se jugó ningún partido de esta fase.</p>')
        + '</div>';
    } catch (e) {
      /* La llave es una mejora: si revienta, la sección sigue con la tabla. */
      if (typeof console !== 'undefined') console.warn('[fases]', e);
      return '';
    }
  }

  /**
   * El Fixture en modo llave: los cruces de ESA fase con sus partidos y el
   * resultado de cada serie. Es lo mismo que la columna de la llave en
   * Clasificación, sin las otras fases.
   */
  function fixtureDeLlave() {
    const st = SGADD_APP.estado;
    const fases = declaradas();
    const d = declaradaDe(visibles(), st.fase);
    if (!d) return '';
    const porFase = llave(fases, contexto());
    const x = porFase[d.id];
    if (x) { const u = {}; u[d.id] = x; pedirEscudos(nombresDeLlave(u)); }
    const escudo = (typeof clasifEscudo === 'function') ? clasifEscudo : null;
    const o = { escudo: escudo };
    const cuerpo = x ? x.cruces.map(cr => cruceHTML(cr, o)).join('')
      + x.sueltas.map(s => serieSueltaHTML(s, o)).join('') : '';
    const pendiente = !_llave.datos && _llave.pidiendo ? '<p class="text-[11px] text-muted mb-2">Trayendo las posiciones de las otras zonas…</p>' : '';
    return '<div class="card rounded-xl p-4 sm:p-5 border border-hairline">'
      + '<h3 class="font-display uppercase tracking-wide text-sm text-ink mb-3">' + esc(d.label) + ' · cruces y series</h3>'
      + pendiente
      + (cuerpo ? '<div class="grid sm:grid-cols-2 gap-2">' + cuerpo + '</div>'
        : '<p class="text-xs text-muted">Todavía no hay cruces definidos para esta fase.</p>')
      + '</div>';
  }

  return {
    /* motor */
    parsear, asignarZonas, visibleEnZona, filtrarPorZona, dependenciasDe, desambiguarEtiquetas,
    declaradaDe, tipoDe, enriquecerTramos, SIN_DATOS, LLAVE, esLlave, esEntreZonas,
    mezclarLlave, partidoDeLlave, SECCIONES_EN_LLAVE, bloqueaEnLlave,
    series, resumen, resolverSlot, llave, naturalezaCruce, naturalezaPartido,
    faseDeFecha, tieneVentanas, tablaCerrada,
    /* html */
    llaveHTML, cruceHTML, chipNaturaleza,
    /* app */
    rivalesDeOtraZona, pedirEscudos, nombresDeLlave,
    declaradas, visibles, zonaAbierta, participanDe, docActual, indicePara, tramoDeFase, contexto, seccionLlave, zonasDeEquipos,
    manualComoPartido, avisoModoLlave, fixtureDeLlave, llaveDelServidor, fijarLlave, alLlegarLaLlave,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_FASES;
