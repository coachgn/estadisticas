/* =========================================================================
   SGADD · ESCALONES POR TERCIOS (punto 174)

   UN SOLO criterio de meta para el Diagnóstico (proyección de umbrales) y
   para Ciclos (hoja de ruta, plan, tablero y evolución). Antes eran tres:

     Diagnóstico   todo lo que está bajo P70 apunta a P70      (P3 → P70)
     Hoja de ruta  ajuste → P70, quiebre → P40
     Fugas / plan  a la mediana de la liga, entera o a la mitad

   Ahora cada métrica vive en un TERCIO de la liga y su próxima meta es el
   escalón REALISTA de ese tercio, nunca un salto de tercio y medio:

     Inferior  P0-P33     escalón = el techo del tercio (P33)
     Medio     P34-P66    escalón = el techo del tercio (P66)
     Superior  P67-P100   se SOSTIENE: el piso es el inicio del tercio (P67)

   Si falta menos de MARGEN_TECHO puntos para el techo, el escalón es el
   inicio del tercio siguiente (el techo + 1): un paso de dos puntos de
   percentil no es una meta.

   La meta del CICLO es la mitad del camino hasta el escalón (FRACCION_CICLO):
   con cuatro partidos por ciclo no se mueve más que eso.

   PURO: sin DOM, sin núcleo. Entra una distribución o un percentil, salen
   valores. Compartido por sgadd-conclusiones.js y sgadd-cicloinforme.js.
   ========================================================================= */
const SGADD_ESCALONES = (function () {
  'use strict';

  const TERCIOS = [
    { id: 'inferior', label: 'tercio inferior', desde: 0, hasta: 33 },
    { id: 'medio', label: 'tercio medio', desde: 34, hasta: 66 },
    { id: 'superior', label: 'tercio superior', desde: 67, hasta: 100 },
  ];
  const INICIO_SUPERIOR = 67;      // verde: desde acá se sostiene
  const INICIO_MEDIO = 34;         // rojo: por debajo de acá
  const FRACCION_CICLO = 0.5;      // la meta real de un ciclo: mitad del camino al escalón
  const MARGEN_TECHO = 5;          // a menos de esto del techo, el escalón es el tercio que sigue

  const esNum = (v) => typeof v === 'number' && isFinite(v);

  /** El tercio de un percentil (se redondea: los informes de ciclo lo traen entero). */
  function tercioDe(pct) {
    if (!esNum(pct)) return null;
    const p = Math.round(pct);
    return TERCIOS.find(t => p >= t.desde && p <= t.hasta) || (p < 0 ? TERCIOS[0] : TERCIOS[2]);
  }

  /** El escalón realista en PERCENTIL: { tercio, tipo, pct, piso }.
      `subir` lleva a `pct`; `sostener` no sube (superior): el piso es P67. */
  function escalonPct(pct) {
    const t = tercioDe(pct);
    if (!t) return null;
    if (t.id === 'superior') return { tercio: t.id, tipo: 'sostener', pct: null, piso: INICIO_SUPERIOR };
    const techo = t.hasta;
    const cerca = techo - Math.round(pct) < MARGEN_TECHO;
    return { tercio: t.id, tipo: 'subir', pct: cerca ? techo + 1 : techo, piso: t.desde };
  }

  /** El valor de la liga en el percentil `pct`, con la dirección de la métrica. */
  function valorEnPercentil(dist, invertida, pct) {
    const v = (dist || []).filter(esNum).slice().sort((a, b) => a - b);
    if (v.length < 3 || !esNum(pct)) return null;
    const q = (invertida ? 100 - pct : pct) / 100;
    const pos = q * (v.length - 1), i = Math.floor(pos), f = pos - i;
    return i + 1 < v.length ? v[i] + f * (v[i + 1] - v[i]) : v[i];
  }

  /** El percentil de un valor (rango medio: los empates cuentan la mitad). */
  function percentilDe(dist, valor, invertida) {
    const l = (dist || []).filter(esNum);
    if (!l.length || !esNum(valor)) return null;
    const abajo = l.filter(x => (invertida ? x > valor : x < valor)).length;
    const igual = l.filter(x => x === valor).length;
    return 100 * (abajo + igual / 2) / l.length;
  }

  /** El plan completo de una métrica.
      entra  { valor, pct?, dist, invertida, fraccion? }
      sale   { tercio, tipo: 'subir'|'sostener', hoy:{valor,pct},
               escalon:{pct,valor}|null, ciclo:{valor,pct}|null, piso:{pct,valor}|null }
      Si el escalón no mejora el valor (la distribución es chata ahí), no hay
      que subir: se sostiene. Nunca devuelve una meta peor que el valor de hoy. */
  function plan(o) {
    o = o || {};
    const inv = !!o.invertida, dist = o.dist;
    const pct = esNum(o.pct) ? o.pct : percentilDe(dist, o.valor, inv);
    const e = escalonPct(pct);
    if (!e || !esNum(o.valor)) return null;
    const out = { tercio: e.tercio, tipo: e.tipo, hoy: { valor: o.valor, pct },
      escalon: null, ciclo: null, piso: null };
    const piso = valorEnPercentil(dist, inv, INICIO_SUPERIOR);
    if (e.tipo === 'sostener') {
      out.piso = esNum(piso) ? { pct: INICIO_SUPERIOR, valor: piso } : null;
      return out;
    }
    const v = valorEnPercentil(dist, inv, e.pct);
    const mejora = esNum(v) ? (inv ? o.valor - v : v - o.valor) : 0;
    if (!(mejora > 0)) { out.tipo = 'sostener'; return out; }
    const frac = esNum(o.fraccion) ? o.fraccion : FRACCION_CICLO;
    const vc = o.valor + (inv ? -1 : 1) * mejora * frac;
    out.escalon = { pct: e.pct, valor: v };
    out.ciclo = { valor: vc, pct: percentilDe(dist, vc, inv) };
    return out;
  }

  /** La meta de un ciclo hacia una referencia (el escalón o la liga) a la
      fracción pedida. Vale para lo que no tiene distribución por equipo
      (zonas, franjas del reloj): ahí la referencia es la liga y se avisa. */
  function haciaReferencia(valor, ref, fraccion) {
    if (!esNum(valor) || !esNum(ref)) return null;
    return valor + (esNum(fraccion) ? fraccion : FRACCION_CICLO) * (ref - valor);
  }

  const api = { TERCIOS, INICIO_SUPERIOR, INICIO_MEDIO, FRACCION_CICLO, MARGEN_TECHO,
    tercioDe, escalonPct, valorEnPercentil, percentilDe, plan, haciaReferencia };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
