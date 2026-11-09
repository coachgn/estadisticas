/* =====================================================================
   SGADD · PREDICCIONES · lo simulado contra lo que pasó (punto 171)

   Motor PURO (nada de `document`), compartido con el servidor. Lo usan:
     · el cron `/api/cron/predicciones`, que CONGELA la predicción de cada
       partido programado antes de que se juegue;
     · la card «Calibración del modelo» del Simulador, que cruza lo
       congelado contra el resultado real del libro.

   POR QUÉ CONGELAR Y NO RECALCULAR. El `backtest` del simulador (punto
   148) re-predice cada partido con la liga hasta el día anterior, pero lo
   hace con el modelo de HOY: si mañana cambia una constante, el pasado se
   reescribe y nunca se sabe qué dijo de verdad el modelo antes del
   partido. Una predicción congelada lleva su versión, su fecha y lo que
   el modelo sabía, y no se reemplaza nunca (HSETNX del lado del servidor).

   QUÉ SE MIDE, y no solo el acierto:
     · el error del margen (MAE, RMSE) y su SESGO (¿sobreestima al local?);
     · la CALIBRACIÓN: de las veces que dijo 70 %, ¿ganó el 70 %?
     · la COBERTURA del rango del 80 % (P10-P90): tiene que andar cerca de 80;
     · el Brier contra el de «siempre 50 %» (0,25);
     · por equipo, con sus últimos 4 (un ciclo), desde la perspectiva del
       equipo: sesgo positivo = el modelo lo SOBREESTIMÓ.
   ===================================================================== */

const SGADD_PREDICCIONES = (function () {
  'use strict';

  const CORE = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require === 'function' ? require('./sgadd-core.js') : null);

  /* La versión del modelo con el que se congela. Sube cuando cambia la
     matemática del simulador (sgadd-4factores.js, sección 7). */
  const VERSION = 'v318';
  /* Se congela un partido que se juega hoy, mañana o pasado: el cron corre
     una vez por día y un día sin correr no deja un partido sin predicción. */
  const DIAS_ANTES = 2;
  /* El libro puede tener el partido un día corrido del fixture (punto 71). */
  const VENTANA_RESULTADO = 3;
  /* Con menos evaluadas que esto, el resumen se muestra pero no se lee. */
  const MIN_EVALUADAS = 10;
  const CICLO = 4;
  const TRAMOS = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0001]];

  const esNum = (v) => typeof v === 'number' && isFinite(v);
  const r = (v, d) => esNum(v) ? Math.round(v * Math.pow(10, d)) / Math.pow(10, d) : null;
  const media = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const clave = (n) => (CORE && CORE.claveEquipo) ? CORE.claveEquipo(n) : String(n || '').trim().toUpperCase();
  const dos = (n) => (n < 10 ? '0' : '') + n;

  /** 'AAAA-MM-DD' desde ISO, dd/mm/aaaa, un Date o la forma de GViz. Se
      trabaja como TEXTO: `new Date('2026-10-15')` es medianoche UTC. */
  function iso(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getFullYear() + '-' + dos(v.getMonth() + 1) + '-' + dos(v.getDate());
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + dos(+m[2]) + '-' + dos(+m[1]);
    if (CORE && CORE.fecha) { const d = CORE.fecha(v); if (d && !isNaN(d.getTime())) return iso(d); }
    return null;
  }
  function diaUTC(s) { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function sumarDias(s, n) {
    const d = new Date(diaUTC(s) + n * 86400000);
    return d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate());
  }
  function diasEntre(a, b) { return Math.round((diaUTC(b) - diaUTC(a)) / 86400000); }

  function clavePartido(fecha, local, visitante) { return fecha + '|' + local + '|' + visitante; }

  function jugadoEnFuente(p) {
    return (p.ptsLocal !== null && p.ptsLocal !== undefined && p.ptsVisitante !== null && p.ptsVisitante !== undefined)
      || /FINALIZADO|EN_JUEGO/.test(String(p.estado || ''));
  }

  /**
   * Los partidos del fixture que corresponde congelar hoy: programados,
   * con fecha entre hoy y hoy + `dias`, y con los DOS equipos cruzados con
   * el libro (`localClave`/`visitanteClave`, sin `sinCruce`). Uno que no
   * cruza no se predice: atribuirle la predicción a otro equipo sería peor.
   */
  function candidatos(partidos, hoy, dias) {
    const hasta = sumarDias(hoy, dias === undefined ? DIAS_ANTES : dias);
    const vistos = new Set();
    const out = [];
    (partidos || []).forEach((p) => {
      const f = iso(p.fecha);
      if (!f || f < hoy || f > hasta) return;
      if (jugadoEnFuente(p) || /SUSPENDIDO/.test(String(p.estado || ''))) return;
      if (p.sinCruce || !p.localClave || !p.visitanteClave || p.localClave === p.visitanteClave) return;
      const k = clavePartido(f, p.localClave, p.visitanteClave);
      if (vistos.has(k)) return;
      vistos.add(k);
      out.push(Object.assign({}, p, { fecha: f, clave: k }));
    });
    return out;
  }

  /** Los partidos jugados del índice, uno por cruce, con su localía. */
  function resultados(idx) {
    const porId = new Map();
    ((idx && idx.lista) ? idx.lista() : []).forEach((e) => {
      (e.partidos || []).forEach((p) => {
        if (!p || !p.__id || !esNum(p.PTS)) return;
        if (!porId.has(p.__id)) porId.set(p.__id, []);
        porId.get(p.__id).push({ clave: e.clave, pts: p.PTS, local: String(p.CONDICION || '').toUpperCase() === 'LOCAL', fecha: iso(p.__fecha || p.FECHA) });
      });
    });
    const out = [];
    porId.forEach((par) => {
      if (par.length !== 2) return;
      const L = par.find(x => x.local) || null;
      const V = par.find(x => x !== L) || null;
      if (!L || !V || L === V || !(L.fecha || V.fecha)) return;
      out.push({ fecha: L.fecha || V.fecha, local: L.clave, visitante: V.clave, ptsLocal: L.pts, ptsVisitante: V.pts });
    });
    return out;
  }

  /** El resultado real de una predicción: el mismo cruce CON LA MISMA
      LOCALÍA (al revés es la vuelta), a 3 días o menos. Con dos a la misma
      distancia no se elige. */
  function resultadoDe(pred, res) {
    const cand = (res || []).filter(x => x.local === pred.localClave && x.visitante === pred.visitanteClave
      && Math.abs(diasEntre(pred.fecha, x.fecha)) <= VENTANA_RESULTADO);
    if (!cand.length) return null;
    cand.sort((a, b) => Math.abs(diasEntre(pred.fecha, a.fecha)) - Math.abs(diasEntre(pred.fecha, b.fecha)));
    if (cand.length > 1 && Math.abs(diasEntre(pred.fecha, cand[0].fecha)) === Math.abs(diasEntre(pred.fecha, cand[1].fecha))) return null;
    return cand[0];
  }

  /**
   * La predicción a congelar, con lo que sabía el modelo. `motor` es
   * SGADD_4F (se pasa: el servidor lo carga de su copia).
   */
  function congelar(motor, idx, p, ahoraMs) {
    const s = motor.simularEnfrentamiento(idx, p.localClave, p.visitanteClave);
    if (!s || !s.ok) return { omitido: true, clave: p.clave, motivo: (s && s.motivo) || 'El simulador no pudo proyectar el cruce.' };
    const m = s.modelo || {};
    const pLocal = esNum(m.probabilidadMC) ? m.probabilidadMC : s.confianza;
    return {
      v: 1, clave: p.clave, fecha: p.fecha, hora: p.hora || null,
      local: s.local, visitante: s.visitante, localClave: s.claveLocal, visitanteClave: s.claveVisitante,
      margen: r(s.margen, 1), ptsLocal: s.scoreLocal, ptsVisitante: s.scoreVisitante,
      pLocal: r(pLocal, 3), p10: r(m.margenP10, 1), p90: r(m.margenP90, 1), sigma: r(m.sigma, 2),
      localia: r(s.bonusLocalia, 2),
      factores: (s.duelos || []).map(d => ({ id: d.id, puntos: r(d.puntos, 2) })),
      partidosLiga: m.partidosLiga || null, muestraLocal: s.muestraLocal || null, muestraVisitante: s.muestraVisitante || null,
      version: VERSION, congeladaEl: new Date(esNum(ahoraMs) ? ahoraMs : Date.now()).toISOString(),
    };
  }

  function evaluar(pred, real) {
    const margenReal = real.ptsLocal - real.ptsVisitante;
    const ganoLocal = margenReal > 0;
    const error = pred.margen - margenReal;
    return {
      margenReal: margenReal, ptsLocal: real.ptsLocal, ptsVisitante: real.ptsVisitante, fechaReal: real.fecha,
      error: r(error, 1), abs: r(Math.abs(error), 1),
      acierto: (pred.margen > 0) === ganoLocal,
      dentro80: esNum(pred.p10) && esNum(pred.p90) ? (margenReal >= pred.p10 && margenReal <= pred.p90) : null,
      brier: esNum(pred.pLocal) ? r(Math.pow(pred.pLocal - (ganoLocal ? 1 : 0), 2), 4) : null,
    };
  }

  /** Cada predicción con su resultado (o pendiente), ordenadas por fecha. */
  function cruzar(preds, idx) {
    const res = resultados(idx);
    return (preds || []).filter(p => p && p.clave && p.fecha)
      .slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      .map((p) => { const real = resultadoDe(p, res); return { pred: p, real: real, eval: real ? evaluar(p, real) : null }; });
  }

  function resumenErrores(errs) {
    if (!errs.length) return { n: 0, mae: null, sesgo: null };
    return { n: errs.length, mae: r(media(errs.map(Math.abs)), 1), sesgo: r(media(errs), 1) };
  }

  /** El tablero de la calibración. */
  function resumen(filas) {
    const ev = (filas || []).filter(f => f.eval);
    const out = { n: ev.length, pendientes: (filas || []).length - ev.length, suficiente: ev.length >= MIN_EVALUADAS, minimo: MIN_EVALUADAS };
    if (!ev.length) return out;
    const errs = ev.map(f => f.eval.error);
    out.mae = r(media(errs.map(Math.abs)), 1);
    out.rmse = r(Math.sqrt(media(errs.map(e => e * e))), 1);
    out.sesgo = r(media(errs), 1);
    out.aciertos = r(media(ev.map(f => (f.eval.acierto ? 1 : 0))), 3);
    out.ganaLocal = r(media(ev.map(f => (f.eval.margenReal > 0 ? 1 : 0))), 3);
    const br = ev.map(f => f.eval.brier).filter(esNum);
    out.brier = br.length ? r(media(br), 4) : null;
    out.brierBase = 0.25;
    const cob = ev.map(f => f.eval.dentro80).filter(x => x !== null);
    out.cobertura80 = cob.length ? r(media(cob.map(x => (x ? 1 : 0))), 3) : null;

    /* Calibración por el FAVORITO: la probabilidad que el modelo le dio al
       que creía ganador, contra la frecuencia con que ganó. */
    out.calibracion = TRAMOS.map(([a, b]) => {
      const en = ev.filter(f => esNum(f.pred.pLocal)).map((f) => {
        const favLocal = f.pred.pLocal >= 0.5;
        return { p: favLocal ? f.pred.pLocal : 1 - f.pred.pLocal, gano: favLocal ? f.eval.margenReal > 0 : f.eval.margenReal < 0 };
      }).filter(x => x.p >= a && x.p < b);
      return { desde: a, hasta: Math.min(b, 1), n: en.length,
        prob: en.length ? r(media(en.map(x => x.p)), 3) : null,
        real: en.length ? r(media(en.map(x => (x.gano ? 1 : 0))), 3) : null };
    });

    /* Por equipo, desde SU lado: el error del local es el del margen; el
       del visitante, el mismo dado vuelta. Positivo = lo sobreestimó. */
    const porEq = new Map();
    ev.forEach((f) => {
      [[f.pred.localClave, f.pred.local, f.eval.error], [f.pred.visitanteClave, f.pred.visitante, -f.eval.error]].forEach(([k, nombre, e]) => {
        if (!porEq.has(k)) porEq.set(k, { clave: k, nombre: nombre, errs: [] });
        porEq.get(k).errs.push(e);
      });
    });
    out.porEquipo = Array.from(porEq.values()).map(x => Object.assign({ clave: x.clave, nombre: x.nombre },
      resumenErrores(x.errs), { ultimos: resumenErrores(x.errs.slice(-CICLO)) }))
      .sort((a, b) => (b.mae || 0) - (a.mae || 0));
    return out;
  }

  return { VERSION, DIAS_ANTES, VENTANA_RESULTADO, MIN_EVALUADAS, CICLO, TRAMOS,
    iso, sumarDias, diasEntre, clavePartido, candidatos, resultados, resultadoDe, congelar, evaluar, cruzar, resumen };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PREDICCIONES;
