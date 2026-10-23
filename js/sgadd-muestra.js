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
    return TODO;
  }

  function activa(m) { return normalizar(m).tipo !== 'todo'; }

  function clave(m) {
    const x = normalizar(m);
    if (x.tipo === 'semanas') return 'semanas:' + x.n;
    if (x.tipo === 'rango') return 'rango:' + (x.desde || '') + ':' + (x.hasta || '');
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

  /** El rótulo de la muestra: «Últimas 2 semanas», «Del 07/10 al 21/10». */
  function etiqueta(m) {
    const x = normalizar(m);
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

  const API = {
    TODO, MAX_SEMANAS, HOJAS_PARTIDO, TOLERANCIA_MEDIA,
    normalizar, activa, clave, diasDelTramo, ventana, recortar, etiqueta, comparar, restarDias, diaIso,
  };
  return API;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_MUESTRA;
