/* =====================================================================
   SGADD · COMPARATIVA · el motor de ciclos

   Deriva de los 6 informes reales de Jujuy Básquet (temporada 2025-2026),
   traducidos a estructura de datos en `ESPECIFICACION_COMPARATIVA.md`.

   LO QUE SEPARA A ESTE MÓDULO DE TODO LO DEMÁS: un informe de ciclo NO es
   una foto de la temporada, es la COMPARACIÓN DE DOS CORTES. Todo lo que
   el panel ya sabe hacer contesta "cómo viene el equipo"; acá se contesta
   "qué cambió respecto del corte anterior", que es la pregunta que el
   cuerpo técnico se hace cada cuatro partidos.

   Y LA DISTINCIÓN QUE NO SE NEGOCIA:

     TENDENCIA  =  el delta contra el ciclo ANTERIOR   (¿mejoró?)
     NIVEL      =  dónde está parado contra la LIGA    (¿alcanza?)

   Son dos ejes y colapsarlos en un solo semáforo pierde la mitad de la
   lectura: un equipo puede venir subiendo y seguir último, y puede caer
   fuerte y seguir siendo primero. El informe de Jujuy los muestra en dos
   columnas separadas (`Tendencia` y `Status`) y acá se respeta.

   ES UN MOTOR PURO: no toca `document`. La UI vive en
   `sgadd-comparativaui.js`, igual que estados/buzón y config/configui.
   ===================================================================== */

const SGADD_COMP = (function () {
  'use strict';

  const S = (typeof SGADD !== 'undefined') ? SGADD
    : (typeof require !== 'undefined' ? require('./sgadd-core.js') : null);

  /* La ventana por defecto. Es la del plan ORO (`PARTIDOS_POR_CICLO` en
     `server/lib/catalogo-mutar.js`), y en los informes reales fue 4 en el
     4º y el 5º y 5 en el 6º — o sea que es un PARÁMETRO, no una constante
     del negocio. Se puede pedir otra al llamar. */
  const VENTANA = 4;

  /* Con menos de esto un corte no describe nada: un T1% sobre dos partidos
     se mueve veinte puntos con cuatro tiros. */
  const MIN_PARTIDOS = 2;

  /* =====================================================================
     LAS MÉTRICAS DEL INFORME

     Salen de las seis hojas de métricas del PDF, en su orden. `dir`
     dice hacia dónde es mejor: sin eso, "subió el %TOV" se pintaría de
     verde, que es exactamente al revés.

     `fuente` dice de dónde se lee en el agregado de un ciclo:
       · 'tiro'      → las tasas que `agregarPartidos` ya calcula
       · 'factores'  → los 4 factores, propios y del rival
       · 'ritmo'     → derivadas de volumen que se calculan acá
     ===================================================================== */
  const BLOQUES = [
    {
      id: 'ritmo', titulo: 'Ritmo y volumen',
      pregunta: '¿Cuántas veces ataca, y cuánto rinde cada ataque?',
      metricas: [
        { k: 'PLAYS', label: 'Plays por partido', fuente: 'ritmo', dir: 1, dec: 1 },
        { k: 'POS', label: 'Posesiones', fuente: 'ritmo', dir: 1, dec: 1 },
        { k: 'PPP', label: 'Puntos por play', fuente: 'tiro', dir: 1, dec: 2 },
        { k: 'PTS', label: 'Puntos por partido', fuente: 'ritmo', dir: 1, dec: 1 },
      ],
    },
    {
      id: 'eficiencia', titulo: 'Eficiencia',
      pregunta: '¿Cuánto anota y cuánto le anotan cada 100 plays?',
      metricas: [
        { k: 'RTNG OFF', label: 'Rating ofensivo', fuente: 'ritmo', dir: 1, dec: 1 },
        { k: 'RTNG DEF', label: 'Rating defensivo', fuente: 'ritmo', dir: -1, dec: 1 },
        { k: 'NET RTNG', label: 'Rating neto', fuente: 'ritmo', dir: 1, dec: 1, signo: true },
      ],
    },
    {
      id: 'tiro', titulo: 'Acierto',
      pregunta: '¿De dónde tira y cuánto le entra?',
      metricas: [
        { k: 'eFG%', label: 'Efectividad ajustada', fuente: 'tiro', dir: 1, pct: true },
        { k: 'T2%', label: 'Dobles', fuente: 'tiro', dir: 1, pct: true },
        { k: 'T3%', label: 'Triples', fuente: 'tiro', dir: 1, pct: true },
        { k: 'T1%', label: 'Libres', fuente: 'tiro', dir: 1, pct: true },
      ],
    },
    {
      id: 'factores', titulo: 'Cuatro factores',
      pregunta: '¿Dónde gana y dónde pierde la posesión?',
      metricas: [
        { k: 'RO%', label: 'Rebote ofensivo', fuente: 'factores', dir: 1, pct: true },
        { k: 'PePP%', label: 'Pérdidas por play', fuente: 'factores', dir: -1, pct: true },
        { k: 'RTL%', label: 'Viajes a la línea', fuente: 'factores', dir: 1, pct: true },
        { k: 'eFG Opp%', label: 'Efectividad del rival', fuente: 'factores', dir: -1, pct: true },
        { k: 'RO Opp%', label: 'Rebote ofensivo del rival', fuente: 'factores', dir: -1, pct: true },
      ],
    },
  ];

  /** Todas las métricas, aplanadas. */
  function metricas() {
    const out = [];
    BLOQUES.forEach(b => b.metricas.forEach(m => out.push(Object.assign({ bloque: b.id }, m))));
    return out;
  }

  const div = (a, b) => (typeof a === 'number' && typeof b === 'number' && b) ? a / b : null;

  /* =====================================================================
     UN CORTE

     `agregarPartidos` del núcleo ya suma un subconjunto y recalcula sus
     tasas sobre totales — que es lo correcto y no promediar la tasa de
     cada noche. Acá se le agregan las derivadas de ritmo, que dependen
     del PJ del corte y por eso el núcleo no las trae.
     ===================================================================== */
  function corte(idx, clave, partidos, etiqueta) {
    if (!idx || !partidos || !partidos.length) return null;
    const a = idx.agregarPartidos(clave, partidos);
    const pj = a.pj || 0;
    if (!pj) return null;

    const yo = a.propio || {}, riv = a.rival || {};
    /* Por 100 PLAYS y no por 100 posesiones: es la convención del motor y
       de todo el panel (CLAUDE.md, punto 3). Etiquetarlo de otra forma
       haría incomparable el número con el resto de la app. */
    const off = div(yo['PTS'], yo['PLAYS']);
    const def = div(riv['PTS'], riv['PLAYS']);
    const ritmo = {
      PLAYS: div(yo['PLAYS'], pj),
      POS: div(yo['POS'], pj),
      PTS: div(yo['PTS'], pj),
      'RTNG OFF': off === null ? null : off * 100,
      'RTNG DEF': def === null ? null : def * 100,
      'NET RTNG': (off === null || def === null) ? null : (off - def) * 100,
    };

    return {
      etiqueta: etiqueta || '',
      pj: pj, ganados: a.ganados, perdidos: a.perdidos,
      partidos: partidos,
      desde: partidos[0] ? partidos[0].__fecha || null : null,
      hasta: partidos[pj - 1] ? partidos[pj - 1].__fecha || null : null,
      ritmo: ritmo, tiro: a.tiro || {}, factores: a.factores || {},
      /* Se conservan los totales: el volumen es lo que sostiene cualquier
         porcentaje de una muestra chica, y sin él no se puede escribir
         "25% con 7,2 intentos" — que es como el informe real cita
         SIEMPRE un acierto (CLAUDE.md, punto 4 y la regla B-3). */
      totales: yo, totalesRival: riv,
    };
  }

  /** El valor de una métrica dentro de un corte. */
  function valor(c, m) {
    if (!c || !m) return null;
    const fuente = c[m.fuente];
    const v = fuente ? fuente[m.k] : null;
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  /* =====================================================================
     LOS DOS EJES

     `tendencia` mira al corte anterior; `nivel` mira a la liga. No se
     mezclan nunca — ver el encabezado del módulo.
     ===================================================================== */

  /* Un delta por debajo de esto es ruido de muestra chica, no un cambio.
     Es relativo al propio valor y no absoluto: 0,02 en un PPP es enorme y
     en un RTNG no significa nada. */
  const RUIDO_REL = 0.03;

  function tendencia(actual, previo, m) {
    if (actual === null || previo === null) return { estado: 'sin-dato', delta: null, rel: null };
    const delta = actual - previo;
    const base = Math.abs(previo);
    const rel = base ? delta / base : null;
    if (rel !== null && Math.abs(rel) < RUIDO_REL) {
      return { estado: 'estable', delta: delta, rel: rel };
    }
    /* El signo se corrige por la DIRECCIÓN de la métrica: bajar el %TOV es
       mejorar, y pintarlo de rojo por "bajó" sería exactamente el error
       que este proyecto evita en los rankings invertidos. */
    const bueno = (delta * (m.dir || 1)) > 0;
    return { estado: bueno ? 'mejora' : 'empeora', delta: delta, rel: rel };
  }

  /**
   * Dónde está parado contra la liga.
   *
   * SE COMPARA CONTRA LA TEMPORADA DE LOS RIVALES, no contra su ciclo. Un
   * puesto calculado sobre 4 partidos de cada equipo sería ruido, y el
   * informe real hace lo mismo: la columna del propio equipo es del ciclo
   * y el resto de la fila es del acumulado. La UI tiene que rotularlo.
   */
  function nivel(idx, m, v) {
    if (v === null || !idx || !idx.liga) return { estado: 'sin-dato', mediana: null, puesto: null, de: 0 };
    const vals = [];
    (idx.lista() || []).forEach((e) => {
      const eq = idx.get(e.clave);
      if (!eq) return;
      /* Se prueban las DOS hojas, no solo la que corresponde por fuente.

         `eFG%`, `RO%`, `RTL%` y `PePP%` viven en las dos: son factores y
         son promedios de equipo. Mirando solo una, un libro sin
         `PROMEDIOS 4F` se quedaba sin la columna de nivel para el bloque
         entero de cuatro factores — con el dato ahí al lado, en
         `PROMEDIOS E`. Las que solo existen de un lado (`eFG Opp%`,
         `RO Opp%`) siguen saliendo de donde están. */
      const f = (eq.factores || {})[m.k];
      const x = (typeof f === 'number') ? f : (eq.promedios || {})[m.k];
      if (typeof x === 'number' && isFinite(x)) vals.push(x);
    });
    if (!vals.length) return { estado: 'sin-dato', mediana: null, puesto: null, de: 0 };

    const orden = vals.slice().sort((a, b) => (m.dir === -1 ? a - b : b - a));
    /* El puesto es cuántos de la liga están MEJOR, más uno. Con `dir = -1`
       "mejor" es más bajo, y por eso el orden se da vuelta arriba en vez
       de corregirse después. */
    let puesto = 1;
    orden.forEach((x) => { if ((m.dir === -1) ? (x < v) : (x > v)) puesto++; });

    const orden2 = vals.slice().sort((a, b) => a - b);
    const med = orden2.length % 2
      ? orden2[(orden2.length - 1) / 2]
      : (orden2[orden2.length / 2 - 1] + orden2[orden2.length / 2]) / 2;

    const tercio = Math.max(1, Math.ceil(orden.length / 3));
    const estado = puesto <= tercio ? 'alto'
      : puesto > orden.length - tercio ? 'bajo' : 'medio';
    return { estado: estado, mediana: med, puesto: puesto, de: orden.length };
  }

  /* =====================================================================
     LOS CORTES DE UN EQUIPO

     Por VENTANA (los últimos N contra los N anteriores) o por FECHAS (dos
     rangos que elige el cuerpo técnico).
     ===================================================================== */

  /** Los partidos de un equipo, del más viejo al más nuevo. */
  function partidosDe(idx, clave) {
    const e = idx && idx.get(clave);
    if (!e || !e.partidos) return [];
    return e.partidos.slice();
  }

  /**
   * Los dos últimos ciclos de N partidos.
   *
   * Si no alcanzan los partidos para dos ciclos enteros, el anterior queda
   * con lo que haya —y `pj` lo dice— en vez de no devolver nada: comparar
   * 4 contra 3 es peor que comparar 4 contra 4, pero mucho mejor que no
   * comparar. Lo que NO se hace es inventar partidos.
   */
  function ciclos(idx, clave, ventana) {
    const n = Math.max(1, Number(ventana) || VENTANA);
    const ps = partidosDe(idx, clave);
    if (!ps.length) return null;
    const act = ps.slice(-n);
    const prev = ps.slice(Math.max(0, ps.length - 2 * n), Math.max(0, ps.length - n));
    return {
      ventana: n,
      total: ps.length,
      actual: corte(idx, clave, act, 'Ciclo actual'),
      previo: prev.length ? corte(idx, clave, prev, 'Ciclo anterior') : null,
    };
  }

  /** Los partidos de un equipo dentro de un rango de fechas, inclusive. */
  function enRango(idx, clave, desde, hasta) {
    const d = desde ? new Date(desde + 'T00:00:00') : null;
    const h = hasta ? new Date(hasta + 'T23:59:59') : null;
    return partidosDe(idx, clave).filter((p) => {
      const f = p.__fecha;
      /* SIN FECHA NO ENTRA A UN RANGO. Es la misma regla del calendario
         (punto 18): un partido mal atribuido contamina los dos cortes y no
         se nota. Se cuentan aparte para poder avisarlo. */
      if (!f) return false;
      if (d && f < d) return false;
      if (h && f > h) return false;
      return true;
    });
  }

  /** Cuántos partidos del equipo no tienen fecha y por eso quedan afuera. */
  function sinFecha(idx, clave) {
    return partidosDe(idx, clave).filter(p => !p.__fecha).length;
  }

  /**
   * La comparación completa entre dos cortes, métrica por métrica.
   *
   * Devuelve las filas del informe: valor de cada corte, tendencia contra
   * el anterior y nivel contra la liga. La UI no calcula nada.
   */
  function comparar(idx, clave, cortes) {
    const a = cortes && cortes.actual, b = cortes && cortes.previo;
    if (!a) return null;

    const bloques = BLOQUES.map((bl) => ({
      id: bl.id, titulo: bl.titulo, pregunta: bl.pregunta,
      filas: bl.metricas.map((m) => {
        const va = valor(a, m), vb = b ? valor(b, m) : null;
        return {
          k: m.k, label: m.label, dir: m.dir, pct: !!m.pct,
          dec: m.dec === undefined ? 1 : m.dec, signo: !!m.signo,
          actual: va, previo: vb,
          tendencia: tendencia(va, vb, m),
          nivel: nivel(idx, m, va),
        };
      }),
    }));

    return {
      clave: clave,
      equipo: (idx.get(clave) || {}).nombre || clave,
      actual: a, previo: b,
      bloques: bloques,
      /* Lo que hay que mirar primero: las que más se movieron, con su
         signo ya interpretado. Es la tabla de "métricas críticas" del
         informe real (hoja 9). */
      criticas: destacadas(bloques),
    };
  }

  /**
   * Las filas que más se movieron, peores primero.
   *
   * SE ORDENA POR EL MOVIMIENTO RELATIVO, no por el absoluto: un cambio de
   * 3 puntos en un rating y otro de 3 puntos en un porcentaje no son
   * comparables, y ordenar por el absoluto pone siempre arriba a las
   * métricas de escala grande.
   */
  function destacadas(bloques, cuantas) {
    const todas = [];
    bloques.forEach(b => b.filas.forEach((f) => {
      if (f.tendencia.rel === null) return;
      if (f.tendencia.estado === 'estable' || f.tendencia.estado === 'sin-dato') return;
      todas.push(f);
    }));
    todas.sort((x, y) => {
      /* Las caídas primero: el informe existe para encontrarlas. A igual
         magnitud, primero lo que empeoró. */
      const px = x.tendencia.estado === 'empeora' ? 0 : 1;
      const py = y.tendencia.estado === 'empeora' ? 0 : 1;
      if (px !== py) return px - py;
      return Math.abs(y.tendencia.rel) - Math.abs(x.tendencia.rel);
    });
    return todas.slice(0, cuantas || 6);
  }

  /* =====================================================================
     JUGADORES · dos o tres, lado a lado
     ===================================================================== */

  /* Las que se comparan. Volumen primero —sin eso ningún porcentaje se
     puede leer— y después eficiencia. */
  const METRICAS_JUGADOR = [
    { k: 'PJ', label: 'Partidos', dir: 1, dec: 0 },
    { k: 'MIN', label: 'Minutos', dir: 1, dec: 1 },
    { k: 'PTS', label: 'Puntos', dir: 1, dec: 1 },
    { k: 'PLAYS', label: 'Plays', dir: 1, dec: 1 },
    { k: 'PPP', label: 'Puntos por play', dir: 1, dec: 2 },
    { k: 'USG%', label: 'Uso', dir: 1, pct: true },
    { k: 'eFG%', label: 'Efectividad ajustada', dir: 1, pct: true },
    { k: 'T3%', label: 'Triples', dir: 1, pct: true },
    { k: 'T2%', label: 'Dobles', dir: 1, pct: true },
    { k: 'T1%', label: 'Libres', dir: 1, pct: true },
    { k: 'RT', label: 'Rebotes', dir: 1, dec: 1 },
    { k: 'AST-PP', label: 'Asistencias por pérdida', dir: 1, dec: 2 },
    { k: 'PePP%', label: 'Pérdidas por play', dir: -1, pct: true },
  ];

  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;

  /**
   * Compara 2 o 3 jugadores.
   *
   * EL GANADOR DE CADA FILA RESPETA LA DIRECCIÓN de la métrica: en
   * pérdidas por play gana el más bajo. Con empate no gana nadie — marcar
   * uno al azar diría algo que el dato no dice.
   */
  function compararJugadores(idx, jugadores) {
    const js = (jugadores || []).filter(Boolean);
    if (js.length < 2) return null;

    const filas = METRICAS_JUGADOR.map((m) => {
      const vals = js.map((j) => {
        if (m.k === 'RT' && typeof j['RT'] !== 'number') {
          const ro = num(j['RO']), rd = num(j['RD']);
          return (ro === null && rd === null) ? null : (ro || 0) + (rd || 0);
        }
        return num(j[m.k]);
      });
      const conValor = vals.filter(v => v !== null);
      let mejor = -1;
      if (conValor.length) {
        const objetivo = (m.dir === -1) ? Math.min.apply(null, conValor) : Math.max.apply(null, conValor);
        const cuantos = vals.filter(v => v === objetivo).length;
        if (cuantos === 1) mejor = vals.indexOf(objetivo);
      }
      return { k: m.k, label: m.label, pct: !!m.pct, dec: m.dec === undefined ? 1 : m.dec,
        dir: m.dir, valores: vals, mejor: mejor };
    });

    return {
      jugadores: js.map(j => ({
        nombre: String(j['NOMBRES'] || '').trim(),
        equipo: S ? S.limpiarNombre(j['EQUIPO'] || '') : (j['EQUIPO'] || ''),
        clave: j.__clave || null,
      })),
      filas: filas,
      recomendacion: recomendar(filas, js),
    };
  }

  /**
   * Qué mirar de esta comparación.
   *
   * NO ELIGE UN GANADOR. Dos jugadores no se ordenan de mejor a peor —esa
   * es la trampa de todo comparador— sino que se distinguen: dice en qué
   * se separan más y quién manda en cada cosa. Es el mismo criterio del
   * punto 4 de CLAUDE.md, el de los ejes de personalidad.
   *
   * La separación se mide en RELATIVO a la mediana de los comparados, por
   * lo mismo que en los ciclos: si no, siempre ganan MIN y PTS por escala.
   */
  function recomendar(filas, jugadores) {
    const puntos = [];
    filas.forEach((f) => {
      const vals = f.valores.filter(v => v !== null);
      if (vals.length < 2) return;
      const max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
      const base = (max + min) / 2;
      if (!base) return;
      const sep = Math.abs(max - min) / Math.abs(base);
      /* `PJ` y `MIN` describen la MUESTRA, no el juego: separan siempre y
         no dicen nada sobre en qué se diferencian como jugadores. */
      if (f.k === 'PJ' || f.k === 'MIN') return;
      puntos.push({ fila: f, separacion: sep });
    });
    puntos.sort((a, b) => b.separacion - a.separacion);

    /* La muestra manda sobre todo lo demás: con menos de 3 partidos de uno
       de los dos, cualquier diferencia puede ser una noche. */
    const pjs = jugadores.map(j => num(j['PJ'])).filter(v => v !== null);
    const muestraCorta = pjs.length ? Math.min.apply(null, pjs) < 3 : false;

    return {
      clave: puntos.slice(0, 4).map(p => ({
        k: p.fila.k, label: p.fila.label, separacion: p.separacion,
        mejor: p.fila.mejor,
      })),
      muestraCorta: muestraCorta,
      pjMinimo: pjs.length ? Math.min.apply(null, pjs) : null,
    };
  }

  return {
    VENTANA, MIN_PARTIDOS, RUIDO_REL, BLOQUES, METRICAS_JUGADOR,
    metricas, corte, valor, tendencia, nivel,
    ciclos, enRango, sinFecha, partidosDe, comparar, destacadas,
    compararJugadores, recomendar,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_COMP;
