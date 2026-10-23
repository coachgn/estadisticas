/* =========================================================================
   SGADD · LA MUESTRA · motor PURO del selector de período (punto 139)

   Equipos y Jugadores pueden mirarse sobre un RECORTE del tramo elegido en
   la barra, no solo sobre el tramo entero. Este archivo decide QUÉ partidos
   entran y arma las hojas recortadas; `SGADD_APP.idxVista()` las convierte
   en un índice con el motor del TOTAL y le cuelga a cada lectura la
   comparación contra la temporada del propio equipo o jugador.

   FASE 1 · SOLO LA FAMILIA DE CALENDARIO. Un recorte de calendario es igual
   para toda la liga: cada equipo se mide contra la liga EN ESA MISMA
   VENTANA, y por eso los percentiles siguen significando lo mismo. Los
   recortes del equipo (sus últimos N, local/visitante, ganados/perdidos,
   rival) son otra familia: ahí la vara es «cada equipo en su condición» y
   llega en la fase 2.

   «Últimas N semanas» y no «últimas N jornadas»: el libro no trae la
   jornada y el calendario del torneo tampoco la declara (la LNB juega todos
   los días). En una liga semanal una semana ES una fecha. La ventana se
   ancla al ÚLTIMO día con partidos del tramo, no a hoy: con una semana sin
   partidos, «la última semana» quedaría vacía.

   Sin `document`, sin red: requerible desde Node.
   ========================================================================= */
const SGADD_MUESTRA = (function () {
  'use strict';

  const DIA = /^\d{4}-\d{2}-\d{2}$/;
  const MAX_SEMANAS = 8;
  const MAX_ULTIMOS = 8;
  /* El prefijo del OTRO LADO de un partido en una muestra de la familia 2:
     entra al índice para que el rival exista (RO%, DRTG, PACE) y el núcleo
     lo saca antes de la vara (`construirIndice`, opción `conservar`). */
  const CONTEXTO = 'CONTEXTO ';
  /* Debajo de esto, un equipo en la muestra se dice «muestra chica»: con 1
     a 3 partidos se ve el número, pero no alcanza para leer una tendencia
     (punto 4: el desvío pide 3 partidos y el PJ mediano, 5). */
  const MUESTRA_CHICA = 3;
  const FAMILIA_EQUIPO = ['ultimos', 'condicion', 'resultado', 'rival'];
  /* Las hojas PARTIDO A PARTIDO, las únicas que se recortan. Las derivadas
     (PROMEDIOS, ACUMULADO) se DESCARTAN: traen la temporada ya calculada, y
     el TOTAL de un recorte se rearma desde las maestras. Dejar `ACUMULADO J`
     haría que los jugadores salieran con los totales de la temporada. */
  const HOJAS_PARTIDO = ['Base Datos E', 'Base Datos J', '4 FACTORES'];
  /* Debajo de esto el número del período se lee «en su media»: un 2,5 % de
     diferencia contra su propia temporada es ruido de redondeo y de muestra. */
  const TOLERANCIA_MEDIA = 0.025;

  const TODO = Object.freeze({ tipo: 'todo' });

  function texto0(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function diaIso(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* Aritmética de días sobre el TEXTO, en UTC: con `new Date('2026-10-21')`
     local, un cambio de horario corre la ventana un día. */
  function restarDias(iso, n) {
    if (!DIA.test(String(iso || ''))) return null;
    const p = iso.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /** La muestra en su forma canónica. Lo que no se entiende es «todo». */
  function normalizar(m) {
    if (!m || typeof m !== 'object') return TODO;
    if (m.tipo === 'semanas') {
      const n = Math.round(Number(m.n));
      if (!(n >= 1 && n <= MAX_SEMANAS)) return TODO;
      return { tipo: 'semanas', n: n };
    }
    if (m.tipo === 'rango') {
      let desde = DIA.test(String(m.desde || '')) ? m.desde : null;
      let hasta = DIA.test(String(m.hasta || '')) ? m.hasta : null;
      if (!desde && !hasta) return TODO;
      /* Al revés no se rechaza: se da vuelta. Es un error de tipeo, no
         una pregunta distinta. */
      if (desde && hasta && desde > hasta) { const t = desde; desde = hasta; hasta = t; }
      return { tipo: 'rango', desde: desde, hasta: hasta };
    }
    if (m.tipo === 'ultimos') {
      const n = Math.round(Number(m.n));
      if (!(n >= 1 && n <= MAX_ULTIMOS)) return TODO;
      return { tipo: 'ultimos', n: n };
    }
    if (m.tipo === 'condicion') {
      const v = String(m.valor || '').toUpperCase();
      return (v === 'LOCAL' || v === 'VISITANTE') ? { tipo: 'condicion', valor: v } : TODO;
    }
    if (m.tipo === 'resultado') {
      const v = String(m.valor || '').toUpperCase();
      return (v === 'GANADO' || v === 'PERDIDO') ? { tipo: 'resultado', valor: v } : TODO;
    }
    if (m.tipo === 'rival') {
      const r = String(m.rival || '').trim().toUpperCase();
      return r ? { tipo: 'rival', rival: r } : TODO;
    }
    return TODO;
  }

  /** `calendario` (igual para toda la liga), `equipo` (cada uno en su
      condición) o null con «todo». */
  function familia(m) {
    const x = normalizar(m);
    if (x.tipo === 'todo') return null;
    return FAMILIA_EQUIPO.indexOf(x.tipo) !== -1 ? 'equipo' : 'calendario';
  }

  function activa(m) { return normalizar(m).tipo !== 'todo'; }

  function clave(m) {
    const x = normalizar(m);
    if (x.tipo === 'semanas') return 'semanas:' + x.n;
    if (x.tipo === 'rango') return 'rango:' + (x.desde || '') + ':' + (x.hasta || '');
    if (x.tipo === 'ultimos') return 'ultimos:' + x.n;
    if (x.tipo === 'condicion' || x.tipo === 'resultado') return x.tipo + ':' + x.valor;
    if (x.tipo === 'rival') return 'rival:' + x.rival;
    return 'todo';
  }

  function deps(dep) {
    /* En el navegador el núcleo es global; en Node se lo pide al archivo de
       al lado. Sin ninguno de los dos, ninguna fecha se lee y la ventana
       queda vacía: mejor pasarlas por `dep` que adivinar. */
    let S = (typeof SGADD !== 'undefined') ? SGADD : null;
    if (!S && typeof require === 'function') { try { S = require('./sgadd-core.js'); } catch (e) { S = null; } }
    return {
      fecha: (dep && dep.fecha) || (S && S.fecha) || (() => null),
      texto: (dep && dep.texto) || (S && S.texto) || texto0,
      claveEquipo: (dep && dep.claveEquipo) || (S && S.claveEquipo) || (v => texto0(v).toUpperCase()),
      limpiar: (dep && dep.limpiarNombre) || (S && S.limpiarNombre) || texto0,
    };
  }

  /* ¿La fila es del tramo? Las MISMAS reglas que el scope del índice: una
     fila sin FASE o sin TORNEO pasa siempre (punto 3 ter), y el TOTAL o
     GENERAL junta todos los torneos de la fase. */
  function delTramo(tramo, texto) {
    const fase = tramo && tramo.fase ? String(tramo.fase).toUpperCase() : null;
    const tor = tramo && tramo.torneo ? String(tramo.torneo).toUpperCase() : null;
    const filtraTorneo = !!(tor && tor !== 'GENERAL' && tor !== '*TOTAL*');
    return (f) => {
      const ff = texto(f['FASE']).toUpperCase();
      if (fase && ff && ff !== fase) return false;
      if (filtraTorneo) {
        const tt = texto(f['TORNEO']).toUpperCase();
        if (tt && tt !== tor) return false;
      }
      return true;
    };
  }

  /** Los días con partidos del tramo, ordenados. Salen de `Base Datos E`. */
  function diasDelTramo(hojas, tramo, dep) {
    const d = deps(dep);
    const es = delTramo(tramo, d.texto);
    const E = hojas && hojas['Base Datos E'];
    const set = new Set();
    ((E && E.filas) || []).forEach(f => {
      if (!es(f)) return;
      const dia = diaIso(d.fecha(f['FECHA']));
      if (dia) set.add(dia);
    });
    return Array.from(set).sort();
  }

  /**
   * La ventana {desde, hasta} de una muestra, o null si es «todo».
   * `dias` son los del tramo: la de semanas se ancla al último.
   */
  function ventana(m, dias) {
    const x = normalizar(m);
    if (x.tipo === 'todo') return null;
    const lista = dias || [];
    if (x.tipo === 'semanas') {
      const hasta = lista[lista.length - 1];
      if (!hasta) return null;
      return { desde: restarDias(hasta, 7 * x.n - 1), hasta: hasta };
    }
    return { desde: x.desde || lista[0] || null, hasta: x.hasta || lista[lista.length - 1] || null };
  }

  /**
   * Las hojas partido a partido recortadas a la ventana.
   *
   * UNA FILA DE JUGADOR O DE 4 FACTORES SIN FECHA se ubica por su PARTIDO,
   * si ese texto tiene UNA sola fecha en `Base Datos E`. Con dos (ida y
   * vuelta con el mismo local) no se sabe de qué noche es y QUEDA AFUERA
   * (`sinFecha`): un dato inventado es peor que uno ausente. Es la regla
   * de `SGADD_MERCADO.recortarHojas` (punto 90).
   *
   * Devuelve { hojas, partidos, total, sinFecha, rango: [primer, último] }.
   */
  function recortar(hojas, tramo, vent, dep) {
    const d = deps(dep);
    const es = delTramo(tramo, d.texto);
    const desde = vent && vent.desde, hasta = vent && vent.hasta;
    const enVentana = (dia) => !!dia && (!desde || dia >= desde) && (!hasta || dia <= hasta);
    const E = hojas && hojas['Base Datos E'];

    const fechasDePartido = new Map();
    const filasE = [];
    const todos = new Set(), dentro = new Set();
    let primero = null, ultimo = null;
    ((E && E.filas) || []).forEach(f => {
      if (!es(f)) return;
      const dia = diaIso(d.fecha(f['FECHA']));
      const k = d.texto(f['PARTIDO']).toUpperCase();
      if (k && dia) {
        if (!fechasDePartido.has(k)) fechasDePartido.set(k, new Set());
        fechasDePartido.get(k).add(dia);
      }
      todos.add((dia || '') + '|' + k);
      if (!enVentana(dia)) return;
      filasE.push(f);
      dentro.add(dia + '|' + k);
      if (!primero || dia < primero) primero = dia;
      if (!ultimo || dia > ultimo) ultimo = dia;
    });

    let sinFecha = 0;
    const salida = { 'Base Datos E': { cols: (E && E.cols) || [], filas: filasE } };
    HOJAS_PARTIDO.slice(1).forEach(nombre => {
      const H = hojas && hojas[nombre];
      if (!H) return;
      const filas = [];
      (H.filas || []).forEach(f => {
        if (!es(f)) return;
        let dia = diaIso(d.fecha(f['FECHA']));
        if (!dia) {
          const set = fechasDePartido.get(d.texto(f['PARTIDO']).toUpperCase());
          if (set && set.size === 1) dia = Array.from(set)[0];
        }
        if (!dia) { sinFecha++; return; }
        if (enVentana(dia)) filas.push(f);
      });
      salida[nombre] = { cols: H.cols || [], filas: filas };
    });

    return { hojas: salida, partidos: dentro.size, total: todos.size, sinFecha: sinFecha, rango: [primero, ultimo] };
  }

  function ddmm(iso) {
    return DIA.test(String(iso || '')) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
  }

  /**
   * LA FAMILIA 2 · cada equipo en SU condición.
   *
   * Una fila de equipo-partido CUMPLE si la condición vale para su propio
   * equipo: Boca de local y Atenas de local cumplen «de local» en partidos
   * distintos. Un partido entra si alguno de sus dos lados cumple; el lado
   * que no cumple entra RENOMBRADO como contexto (`CONTEXTO <nombre>`),
   * porque las tasas que dependen del rival lo necesitan, y el índice lo
   * descarta antes de la vara (`conservar`).
   *
   * Así la liga de referencia es «cada equipo en esa misma condición»: el
   * percentil de Boca de local se mide contra cada equipo jugando de local.
   *
   * Las filas de JUGADOR del lado que no cumple se descartan: un jugador no
   * hace falta como contexto. 4 FACTORES sigue a Base Datos E.
   *
   * Devuelve { hojas, conservar: Set, partidos, total, porEquipo: Map, sinFecha }.
   */
  function recortarPorCondicion(hojas, tramo, m, dep) {
    const x = normalizar(m);
    const d = deps(dep);
    const es = delTramo(tramo, d.texto);
    const E = hojas && hojas['Base Datos E'];
    const filas = ((E && E.filas) || []).filter(es);

    const idDe = (f, dia) => (dia || '') + '|' + d.texto(f['PARTIDO']).toUpperCase();
    const porPartido = new Map();          // id -> [filas]
    const fechasDePartido = new Map();     // texto PARTIDO -> Set de días
    filas.forEach(f => {
      const dia = diaIso(d.fecha(f['FECHA']));
      const id = idDe(f, dia);
      if (!porPartido.has(id)) porPartido.set(id, []);
      porPartido.get(id).push({ fila: f, dia: dia, equipo: d.claveEquipo(f['EQUIPO']) });
      const k = d.texto(f['PARTIDO']).toUpperCase();
      if (k && dia) {
        if (!fechasDePartido.has(k)) fechasDePartido.set(k, new Set());
        fechasDePartido.get(k).add(dia);
      }
    });

    /* El rival de una fila: la otra fila del mismo partido; sin pareja, el
       otro lado del texto «A vs B». */
    const rivalDe = (item, lista) => {
      const otro = lista.find(o => o !== item && o.equipo !== item.equipo);
      if (otro) return otro.equipo;
      const partes = d.texto(item.fila['PARTIDO']).split(/\s+vs\s+/i);
      if (partes.length !== 2) return null;
      const a = d.claveEquipo(partes[0]), b = d.claveEquipo(partes[1]);
      return a === item.equipo ? b : (b === item.equipo ? a : null);
    };

    /* Los últimos N de cada equipo, por fecha. Sin fecha no se puede
       ordenar: queda afuera y se cuenta. */
    let sinFecha = 0;
    const ultimos = new Map();
    if (x.tipo === 'ultimos') {
      const porEq = new Map();
      porPartido.forEach((lista, id) => lista.forEach(it => {
        if (!it.dia) return;
        if (!porEq.has(it.equipo)) porEq.set(it.equipo, []);
        porEq.get(it.equipo).push(id);
      }));
      porEq.forEach((ids, eq) => {
        const orden = ids.slice().sort();       // el id arranca con el día
        ultimos.set(eq, new Set(orden.slice(-x.n)));
      });
    }

    const cumple = (it, id, lista) => {
      if (x.tipo === 'ultimos') return !!(ultimos.get(it.equipo) && ultimos.get(it.equipo).has(id));
      if (x.tipo === 'condicion') return d.texto(it.fila['CONDICION']).toUpperCase() === x.valor;
      if (x.tipo === 'resultado') return d.texto(it.fila['RESULTADO']).toUpperCase() === x.valor;
      if (x.tipo === 'rival') return rivalDe(it, lista) === x.rival;
      return false;
    };

    const filasE = [];
    const conservar = new Set();
    const porEquipo = new Map();
    const cumplen = new Set();             // id|equipo que cumple
    const incluidos = new Set();           // id de partido que entra
    porPartido.forEach((lista, id) => {
      const ok = lista.map(it => cumple(it, id, lista));
      if (!ok.some(Boolean)) return;
      incluidos.add(id);
      lista.forEach((it, i) => {
        if (ok[i]) {
          filasE.push(it.fila);
          conservar.add(it.equipo);
          cumplen.add(id + '|' + it.equipo);
          porEquipo.set(it.equipo, (porEquipo.get(it.equipo) || 0) + 1);
        } else {
          filasE.push(Object.assign({}, it.fila, { EQUIPO: CONTEXTO + d.limpiar(it.fila['EQUIPO']) }));
        }
      });
    });
    porPartido.forEach((lista, id) => { if (x.tipo === 'ultimos' && lista.some(it => !it.dia)) sinFecha += lista.filter(it => !it.dia).length; });

    const diaDeFila = (f) => {
      let dia = diaIso(d.fecha(f['FECHA']));
      if (!dia) {
        const set = fechasDePartido.get(d.texto(f['PARTIDO']).toUpperCase());
        if (set && set.size === 1) dia = Array.from(set)[0];
      }
      return dia;
    };
    const salida = { 'Base Datos E': { cols: (E && E.cols) || [], filas: filasE } };
    ['4 FACTORES', 'Base Datos J'].forEach(nombre => {
      const H = hojas && hojas[nombre];
      if (!H) return;
      const out = [];
      (H.filas || []).forEach(f => {
        if (!es(f)) return;
        const dia = diaDeFila(f);
        if (!dia) { sinFecha++; return; }
        const id = idDe(f, dia);
        if (!incluidos.has(id)) return;
        const eq = d.claveEquipo(f['EQUIPO']);
        if (cumplen.has(id + '|' + eq)) out.push(f);
        else if (nombre === '4 FACTORES') out.push(Object.assign({}, f, { EQUIPO: CONTEXTO + d.limpiar(f['EQUIPO']) }));
      });
      salida[nombre] = { cols: H.cols || [], filas: out };
    });

    return { hojas: salida, conservar: conservar, partidos: incluidos.size, total: porPartido.size,
      porEquipo: porEquipo, sinFecha: sinFecha };
  }

  /** El rótulo de la muestra: «Últimas 2 semanas», «Del 07/10 al 21/10». */
  function etiqueta(m, nombreRival) {
    const x = normalizar(m);
    if (x.tipo === 'ultimos') return x.n === 1 ? 'Su último partido' : 'Sus últimos ' + x.n + ' partidos';
    if (x.tipo === 'condicion') return x.valor === 'LOCAL' ? 'Solo de local' : 'Solo de visitante';
    if (x.tipo === 'resultado') return x.valor === 'GANADO' ? 'Solo ganados' : 'Solo perdidos';
    if (x.tipo === 'rival') return 'Contra ' + (nombreRival || x.rival);
    if (x.tipo === 'semanas') return x.n === 1 ? 'Última semana' : 'Últimas ' + x.n + ' semanas';
    if (x.tipo === 'rango') {
      if (x.desde && x.hasta) return 'Del ' + ddmm(x.desde) + ' al ' + ddmm(x.hasta);
      return x.desde ? 'Desde el ' + ddmm(x.desde) : 'Hasta el ' + ddmm(x.hasta);
    }
    return 'Todo el tramo';
  }

  /**
   * Lo que se le cuelga a una lectura: el mismo dato en la TEMPORADA del
   * propio equipo o jugador y cuánto se separa el período.
   *
   * `estado`: 'arriba' / 'abajo' / 'media', en términos de RENDIMIENTO (en
   * una métrica invertida, bajar es 'arriba'). En una descriptiva —el
   * reparto de plays, el ritmo— no hay lado bueno: `estado` va null y la
   * pantalla pinta la flecha sin color (punto 4).
   */
  function comparar(rPeriodo, rTemporada) {
    if (!rPeriodo || !rTemporada) return null;
    const v = rPeriodo.valor, b = rTemporada.valor;
    if (typeof v !== 'number' || typeof b !== 'number' || !isFinite(v) || !isFinite(b)) return null;
    const delta = v - b;
    const base = Math.abs(b);
    const enMedia = base > 1e-9 ? Math.abs(delta) / base < TOLERANCIA_MEDIA : Math.abs(delta) < 1e-9;
    let estado = null;
    if (!rPeriodo.descriptiva) {
      estado = enMedia ? 'media' : ((rPeriodo.invertida ? delta < 0 : delta > 0) ? 'arriba' : 'abajo');
    }
    return {
      valor: b, formateado: rTemporada.formateado, delta: delta,
      direccion: enMedia ? 0 : (delta > 0 ? 1 : -1), estado: estado,
    };
  }

  /* =====================================================================
     FASE 3 · LA VARA DE JUGADORES DEL PERÍODO, CALCULADA EN EL SERVIDOR

     Un cliente recibe `Base Datos J` con su plantel nada más (punto 19).
     Recalcular jugadores sobre ese log deja una «liga» formada por los
     suyos. El servidor tiene el libro entero: arma el período, y de la
     liga de jugadores entrega SOLO números agregados.

       tipo        la mediana de todos los jugadores (la fila TIPO)
       minJugador  el umbral de minutos del período
       columnas    por métrica, sobre los que califican: n, media,
                   desvío y 21 cortes (p0, p5 … p100)

     Ningún nombre, ninguna fila: cada métrica se resume POR SEPARADO, así
     que de la vara no se puede rearmar a un jugador. Tres columnas
     DERIVADAS van ya calculadas, porque cruzan dos métricas del mismo
     jugador y eso el panel no lo puede hacer sin la fila:

       __RT       rebotes totales (RT, o RO + RD)
       __MEZCLA   T3I / (T3I + T2I), de dónde tira
       __RDROREL  RD% relativo sobre RO% relativo, entre los que no son
                  perimetrales (la vara de `ancla-defensiva`, punto 45)
     ===================================================================== */
  const CORTES = 21;
  /* Mismo número que `mezclaTripleaPerimetral` de `sgadd-niveles.js`, un
     ABSOLUTO (punto 45). Se repite porque el servidor no carga ese
     módulo; `test-muestra.js` exige que coincidan. */
  const MEZCLA_PERIMETRAL = 0.30;
  /* Por debajo de esto la vara no se entrega (punto 139, fase 3): con un
     solo partido, los cortes de la liga son el box score de esa noche. */
  const VARA_MIN_PARTIDOS = 3;
  const VARA_MIN_CALIFICADOS = 5;

  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function redondear(v) { return v === null ? null : Math.round(v * 1e4) / 1e4; }

  /** El cuantil p (0..1) de una lista ORDENADA, interpolado. */
  function cuantil(orden, p) {
    if (!orden.length) return null;
    const h = (orden.length - 1) * p;
    const lo = Math.floor(h), hi = Math.ceil(h);
    return orden[lo] + (orden[hi] - orden[lo]) * (h - lo);
  }

  function resumen(vals) {
    const orden = vals.filter(v => num(v) !== null).sort((a, b) => a - b);
    const n = orden.length;
    if (n < 3) return null;
    const media = orden.reduce((a, b) => a + b, 0) / n;
    const desvio = Math.sqrt(orden.reduce((a, b) => a + (b - media) * (b - media), 0) / n);
    const cortes = [];
    for (let i = 0; i < CORTES; i++) cortes.push(redondear(cuantil(orden, i / (CORTES - 1))));
    return { n: n, media: redondear(media), desvio: redondear(desvio), cortes: cortes };
  }

  function rtDe(j) {
    if (num(j['RT']) !== null) return j['RT'];
    const ro = num(j['RO']), rd = num(j['RD']);
    return (ro === null && rd === null) ? null : (ro || 0) + (rd || 0);
  }
  function mezclaDe(j) {
    const a = num(j['T3I']), b = num(j['T2I']);
    return (a !== null && b !== null && a + b > 0) ? a / (a + b) : null;
  }

  /**
   * La vara de jugadores de un índice YA RECORTADO al período, con la liga
   * entera. Corre en el servidor. Devuelve null si el índice no alcanza.
   */
  function varaJugadores(idx) {
    const liga = idx && idx.liga;
    if (!liga) return null;
    const cal = liga.jugadoresCalificados || [];
    const columnas = {};
    const claves = new Set();
    cal.forEach(j => Object.keys(j).forEach(k => { if (k.indexOf('__') !== 0) claves.add(k); }));
    claves.forEach(k => {
      const r = resumen(cal.map(j => j[k]));
      if (r) columnas[k] = r;
    });
    const med = (k) => { const c = columnas[k]; return c ? c.cortes[(CORTES - 1) / 2] : null; };
    const rt = resumen(cal.map(rtDe));
    if (rt) columnas.__RT = rt;
    const mz = resumen(cal.map(mezclaDe));
    if (mz) columnas.__MEZCLA = mz;
    const refRO = med('RO%'), refRD = med('RD%');
    if (refRO && refRD) {
      const r = resumen(cal.map(j => {
        const m = mezclaDe(j);
        if (m === null || m >= MEZCLA_PERIMETRAL) return null;
        const ro = num(j['RO%']), rd = num(j['RD%']);
        if (ro === null || rd === null) return null;
        const roRel = ro / refRO;
        return roRel > 0 ? (rd / refRD) / roRel : null;
      }));
      if (r) columnas.__RDROREL = r;
    }
    const tipo = {};
    Object.keys(liga.jugadorTipo || {}).forEach(k => {
      if (num(liga.jugadorTipo[k]) !== null) tipo[k] = redondear(liga.jugadorTipo[k]);
    });
    return {
      partidos: Array.isArray(liga.partidos) ? liga.partidos.length : (liga.partidos || 0),
      jugadores: (liga.jugadores || []).length,
      calificados: cal.length,
      minJugador: num(liga.minJugador),
      tipo: tipo,
      columnas: columnas,
    };
  }

  /** ¿Alcanza para entregarla? */
  function varaSuficiente(v) {
    return !!(v && v.partidos >= VARA_MIN_PARTIDOS && v.calificados >= VARA_MIN_CALIFICADOS);
  }

  /** De 21 cortes a una lista de n valores, para leer percentiles como
      con la distribución real (mismo largo: la `muestra` del motor de
      niveles lo usa para decir si la competencia es chica). */
  function expandir(col) {
    if (!col || !Array.isArray(col.cortes) || col.cortes.length < 2) return [];
    const n = Math.max(3, col.n || 0);
    const c = col.cortes, tramos = c.length - 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = n === 1 ? 0 : (i / (n - 1)) * tramos;
      const lo = Math.floor(p), hi = Math.min(tramos, lo + 1);
      out.push(c[lo] + (c[hi] - c[lo]) * (p - lo));
    }
    return out;
  }

  /** La mediana de una columna de la vara (el corte del medio). */
  function medianaDeVara(vara, clave) {
    const c = vara && vara.columnas && vara.columnas[clave];
    return c ? c.cortes[(c.cortes.length - 1) / 2] : null;
  }

  /**
   * Corre en el PANEL: le pone la vara del servidor al índice del período
   * que se armó con el log recortado. Lo de los jugadores propios no se
   * toca —son sus filas reales—; lo de la liga sale de la vara.
   */
  function aplicarVara(idx, vara) {
    if (!idx || !idx.liga || !vara) return idx;
    const liga = idx.liga;
    if (vara.minJugador !== null && vara.minJugador !== undefined) liga.minJugador = vara.minJugador;
    liga.jugadorTipo = Object.assign({}, vara.tipo || {});
    const min = liga.minJugador;
    const califica = (j) => (typeof min !== 'number') || (typeof j['MIN'] === 'number' && j['MIN'] >= min);
    (liga.jugadores || []).forEach(j => { j.__califica = califica(j); });
    if (typeof idx.lista === 'function') {
      idx.lista().forEach(e => { e.jugadoresCalificados = (e.jugadores || []).filter(j => j.__califica); });
    }
    liga.jugadoresCalificados = (liga.jugadores || []).filter(j => j.__califica);
    const dist = {};
    Object.keys(vara.columnas || {}).forEach(k => {
      if (k.indexOf('__') === 0) return;
      const vals = expandir(vara.columnas[k]);
      if (vals.length >= 3) dist[k] = vals;
    });
    liga.distribucionesJ = dist;
    /* Los consumidores que necesitan la liga y no solo un percentil —los
       promedios del ADN, la referencia de rebote, los umbrales vivos y el
       grupo de pares— la leen de acá (`sgadd-jugadores.js`). */
    liga.vara = vara;
    return idx;
  }

  const API = {
    TODO, MAX_SEMANAS, MAX_ULTIMOS, HOJAS_PARTIDO, TOLERANCIA_MEDIA, CONTEXTO, MUESTRA_CHICA,
    normalizar, activa, familia, clave, recortarPorCondicion, diasDelTramo, ventana, recortar, etiqueta, comparar, restarDias, diaIso,
    CORTES, MEZCLA_PERIMETRAL, VARA_MIN_PARTIDOS, VARA_MIN_CALIFICADOS,
    varaJugadores, varaSuficiente, expandir, medianaDeVara, aplicarVara, cuantil,
  };
  return API;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_MUESTRA;
