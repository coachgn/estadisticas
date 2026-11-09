/* =====================================================================
   SGADD · 4 FACTORES — influencia por regresión + simulador de cruce

   Migración auditada de `simulador-4factores-legacy.js` (Apps Script,
   1805 líneas). Se extrajo SOLO la matemática; toda la infraestructura de
   Google Sheets (SpreadsheetApp, menús, gráficos nativos, DB_PROCESADA
   como hoja física) se descarta: acá se lee directo de `idx` (el índice
   que ya arma sgadd-core.js desde Base Datos E + 4 FACTORES), sin
   reimplementar el pipeline de datos.

   ---------------------------------------------------------------------
   AUDITORÍA: qué se corrigió del script original
   ---------------------------------------------------------------------
   1. "Regresión lineal múltiple" en el nombre, Pearson simple en el
      código. El original calculaba una correlación de Pearson POR
      FACTOR por separado (`calcularInfluenciaFactores`) — no controla
      por los otros factores, así que dos factores correlacionados entre
      sí (eFG% y PPP, por ejemplo) inflan su peso combinado. Acá se
      implementa OLS multivariado de verdad (`regresionMultiple`): los
      4 coeficientes salen de un solo sistema de ecuaciones, cada uno ya
      "neto" del resto. Con muestra chica o matriz mal condicionada
      (factores muy correlacionados => casi singular) se degrada
      explícitamente a regresión simple por factor — sigue siendo lineal
      y en las mismas unidades (puntos por unidad de factor), a
      diferencia del Pearson original que no tiene unidades de puntos.

   2. Signo hardcodeado por posición. El original guardaba
      `Math.abs(pearson)` (tirando el signo) y en OTRA función aplicaba
      un array `direccion = [j===1||j===4||...] ? -1 : 1` para
      reconstruir qué factores son "buenos" al subir. Si alguien
      reordenaba el array de factores, el signo quedaba mal SIN
      ROMPER nada visiblemente (bug silencioso). Acá `netFactor()` arma
      el diferencial ya con el signo correcto desde la propia definición
      del factor (`invertida`), una sola vez, y se reusa para la
      regresión Y para el simulador: no hay un lugar separado que pueda
      desincronizarse.

   3. Bonus de localía MULTIPLICABA todo el score del local
      (`scoreL = (...) * bonusLocaliaFinal`), así que un equipo con un
      score proyectado más alto recibía un bonus de localía más grande
      en puntos absolutos — no tiene sentido: la ventaja de jugar en
      casa no escala con lo bueno que sos. Se corrigió a un bonus
      ADITIVO fijo en puntos (`BONUS_LOCALIA_PUNTOS`), modulado apenas
      por la ventaja de localía real de ESTA liga.

   4. Confianza con clamp arbitrario: `50 + margen*2.8`, forzado entre
      51 y 94.8 a mano. Ni la pendiente (2.8) ni los topes salen de
      ningún cálculo — son constantes ajustadas a ojo. Se reemplazó por
      una logística (`confianzaLogistica`), que acota naturalmente entre
      0 y 1 sin clamps mágicos y es la transformación estándar para
      convertir un margen en probabilidad.

   5. Falta de guarda en denominadores. Si el peso temporal acumulado da
      0 (no debería pasar, pero no estaba controlado) `promedioPonderado`
      dividía por 0 sin avisar. Ahora devuelve `null` explícito.

   6. Peso temporal por recencia con un off-by-one leve
      (`0.8 + 0.4*(index/total)` nunca llegaba exactamente a 1.2 en el
      último partido). Se corrigió a `index/(total-1)`, así el rango
      0.8–1.2 se cubre exacto.

   Lo que SÍ se conservó porque estaba bien pensado: la muestra chica en
   una condición (< 3 partidos) cae a la historia completa del equipo
   (`perfilEquipoSimulacion`, igual criterio que `MIN_PARTIDOS_JUGADOR`
   en el resto del proyecto); el modelo de score base como
   PLAYS × PPP (identidad real de básquet: puntos = posesiones × eficiencia
   por posesión).

   NUEVO (pedido explícito): la matriz de compensación Eficiencia vs.
   Volumen (`matrizVolumenEficiencia`) no existía en el script original
   con ese nombre — se construye acá con percentiles contra la liga
   (mismo criterio que el resto de SGADD: nunca valores absolutos).
   ===================================================================== */

const SGADD_4F = (function () {
  'use strict';

  /* =====================================================================
     1. ESTADÍSTICA PURA
     ===================================================================== */

  /** Correlación de Pearson. Sin varianza en alguna serie, la correlación
      no está definida: 0 es la convención segura, no "sin relación". */
  function correlacionPearson(x, y) {
    const n = x.length;
    if (n === 0 || y.length !== n) return 0;
    const sumX = x.reduce((a, b) => a + b, 0), sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0), sumY2 = y.reduce((a, b) => a + b * b, 0);
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
  }

  /** Regresión simple y = a + b·x. Devuelve la pendiente en las unidades
      reales de y por unidad de x (a diferencia de Pearson, que es
      adimensional) — se usa como red de contención cuando la múltiple
      no tiene muestra o está mal condicionada. */
  function regresionSimple(x, y) {
    const n = x.length;
    if (n < 3 || y.length !== n) return { ok: false, motivo: 'muestra insuficiente (mínimo 3)', n };
    const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
    if (sxx === 0) return { ok: false, motivo: 'el factor no varía en la muestra', n };
    const pendiente = sxy / sxx;
    return { ok: true, pendiente: pendiente, intercepto: my - pendiente * mx, n: n };
  }

  /** Resuelve A·β = b por Gauss-Jordan con pivoteo parcial. `null` si A
      es singular (factores casi perfectamente correlacionados entre sí:
      con pocos partidos, eFG% y PPP pueden moverse casi juntos). */
  function resolverSistemaLineal(A, b) {
    const p = A.length;
    const M = A.map((fila, i) => fila.concat([b[i]]));
    for (let col = 0; col < p; col++) {
      let filaPivote = col;
      for (let f = col + 1; f < p; f++) {
        if (Math.abs(M[f][col]) > Math.abs(M[filaPivote][col])) filaPivote = f;
      }
      if (Math.abs(M[filaPivote][col]) < 1e-9) return null;
      if (filaPivote !== col) { const tmp = M[col]; M[col] = M[filaPivote]; M[filaPivote] = tmp; }
      const piv = M[col][col];
      for (let c = col; c <= p; c++) M[col][c] /= piv;
      for (let f = 0; f < p; f++) {
        if (f === col) continue;
        const factor = M[f][col];
        if (factor === 0) continue;
        for (let c = col; c <= p; c++) M[f][c] -= factor * M[col][c];
      }
    }
    return M.map(fila => fila[p]);
  }

  /** Mínimo de partidos para confiar en la regresión múltiple (regla
      práctica: con menos, el sistema puede ajustar ruido en vez de señal). */
  const MIN_MUESTRA_REGRESION = 30;

  /**
   * OLS multivariado: y = β0 + β1·x1 + β2·x2 + ... + βp·xp
   * @param X  matriz n×p (SIN columna de 1: se agrega el intercepto acá)
   * @param y  vector n
   */
  function regresionMultiple(X, y) {
    const n = X.length;
    if (!n || y.length !== n) return { ok: false, motivo: 'datos inconsistentes', n: n };
    if (n < MIN_MUESTRA_REGRESION) {
      return { ok: false, motivo: 'muestra insuficiente (' + n + '/' + MIN_MUESTRA_REGRESION + ')', n: n };
    }
    const p = X[0].length + 1;
    const Xi = X.map(fila => [1].concat(fila));

    const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
    const Xty = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += Xi[k][i] * Xi[k][j];
        XtX[i][j] = s;
      }
      let sy = 0;
      for (let k = 0; k < n; k++) sy += Xi[k][i] * y[k];
      Xty[i] = sy;
    }

    const beta = resolverSistemaLineal(XtX, Xty);
    if (!beta) return { ok: false, motivo: 'factores muy correlacionados entre sí (matriz singular)', n: n };

    const medioY = y.reduce((a, b) => a + b, 0) / n;
    let ssRes = 0, ssTot = 0;
    Xi.forEach((fila, i) => {
      const pred = fila.reduce((s, x, j) => s + x * beta[j], 0);
      ssRes += (y[i] - pred) * (y[i] - pred);
      ssTot += (y[i] - medioY) * (y[i] - medioY);
    });
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return { ok: true, intercepto: beta[0], coeficientes: beta.slice(1), r2: r2, n: n, p: p };
  }

  /** Cuántos de los últimos partidos entran en la "ventana de forma
      reciente" que pesa más fuerte (no solo la rampa lineal 0.8-1.2). */
  const VENTANA_RECIENTE = 5;
  /** Cuánto más pesa un partido de la ventana reciente sobre la rampa base. */
  const REFUERZO_RECIENTE = 1.5;

  /** Peso temporal por recencia: rampa lineal 0.8 (más viejo) a 1.2 (más
      nuevo) — y encima, si hay más partidos que `VENTANA_RECIENTE`, los
      últimos de esa ventana pesan un 50% más. Un plantel puede cambiar de
      identidad en 3-5 fechas (lesión, ajuste táctico); una rampa lineal
      sola diluye demasiado esa racha entre todo el historial. Con pocos
      partidos (≤ ventana) no hay "resto" del que despegarse: la rampa
      base ya representa toda la temporada, así que no se refuerza nada. */
  function pesoTemporalPartido(indice, total) {
    if (total <= 1) return 1;
    const base = 0.8 + 0.4 * (indice / (total - 1));
    const enVentanaReciente = total > VENTANA_RECIENTE && (total - indice) <= VENTANA_RECIENTE;
    return enVentanaReciente ? base * REFUERZO_RECIENTE : base;
  }

  /** Promedio ponderado genérico. `null` (no NaN) si no hay datos o el
      peso acumulado da 0 — nunca se divide a ciegas. */
  function promedioPonderado(valores, pesos) {
    let sp = 0, sw = 0;
    for (let i = 0; i < valores.length; i++) {
      if (typeof valores[i] !== 'number' || !isFinite(valores[i])) continue;
      sp += valores[i] * pesos[i];
      sw += pesos[i];
    }
    return sw > 0 ? sp / sw : null;
  }

  /** Transforma un margen de puntos en una probabilidad de victoria vía
      logística: acota naturalmente en (0,1), sin clamps arbitrarios.
      `escala` = cuántos puntos de margen equivalen a una desviación
      estándar de "confianza" (más alto = curva más plana). */
  function confianzaLogistica(margen, escala) {
    const s = escala || 10;
    const p = 1 / (1 + Math.exp(-margen / s));
    // Nunca 0% ni 100%: un modelo estadístico no certifica nada.
    return Math.min(0.97, Math.max(0.03, p));
  }

  /* =====================================================================
     2. LOS 4 FACTORES — definición única de signo (se usa para la
        regresión de liga Y para el simulador: nunca se desincronizan)
     ===================================================================== */
  const FACTORES_NET = [
    { id: 'eFG%', idOpp: 'eFG Opp%', label: 'Eficiencia de tiro', invertida: false },
    { id: 'PP%', idOpp: 'PP Opp%', label: 'Cuidado de la pelota', invertida: true },
    { id: 'RO%', idOpp: 'RO Opp%', label: 'Rebote ofensivo', invertida: false },
    { id: 'RTL%', idOpp: 'RTL Opp%', label: 'Agresividad al aro (tiro libre)', invertida: false },
  ];

  /** Diferencial neto de un factor, YA con el signo correcto (positivo
      siempre es mejor). `invertida` se aplica acá UNA sola vez. */
  function netFactor(def, propio, delRival) {
    if (typeof propio !== 'number' || typeof delRival !== 'number' || !isFinite(propio) || !isFinite(delRival)) return null;
    const diff = propio - delRival;
    return def.invertida ? -diff : diff;
  }

  /* =====================================================================
     3. PESOS DE LIGA — regresión múltiple sobre TODOS los partidos de
        la liga activa, con degradación a regresión simple por factor.
     ===================================================================== */

  /** Arma el dataset de la liga: un caso por cada partido de cada equipo,
      X = los 4 netFactor de ESE equipo en ESE partido, y = margen de
      puntos (a favor - en contra) de ese mismo partido. */
  function datosRegresionLiga(idx) {
    const X = [], y = [];
    idx.lista().forEach(e => {
      e.factoresPartido.forEach(f => {
        const fila = FACTORES_NET.map(def => netFactor(def, f[def.id], f[def.idOpp]));
        if (fila.some(v => v === null)) return;
        const partido = e.partidos.find(p => p.__partido === f.__partido);
        if (!partido || typeof partido['PTS'] !== 'number' || typeof partido['PTSopp'] !== 'number') return;
        X.push(fila);
        y.push(partido['PTS'] - partido['PTSopp']);
      });
    });
    return { X: X, y: y };
  }

  /**
   * Peso (en puntos por unidad de factor) de cada uno de los 4 factores,
   * para la liga de `idx`. Regresión múltiple si hay muestra; si no,
   * regresión simple por factor (sigue en unidades de puntos, a
   * diferencia del Pearson crudo del script original).
   */
  function pesosPorFactor(idx) {
    const m = modeloDe(idx);
    if (m) return m.pesos;
    /* Sin ratings no hay modelo de posesiones, pero los pesos de los 4
       factores solo necesitan el margen de cada partido. */
    const j = extraerJuegos(idx);
    return ajustarPesosOliver(j, ajustarLocalia(j).hca);
  }

  /* =====================================================================
     4. PERFIL DE UN EQUIPO PARA SIMULAR (condición-aware, con fallback)
     ===================================================================== */
  const MIN_PARTIDOS_CONDICION = 3;

  /* Además de los 8 factores, se promedian condición-específico (no de
     temporada completa) el ritmo/eficiencia de ESE contexto puntual: el
     Ortg/Drtg de un equipo de local puede no ser el mismo que de
     visitante, y promediar todo junto tapa esa diferencia. */
  const CLAVES_PERFIL = ['eFG%', 'PP%', 'RO%', 'RTL%', 'eFG Opp%', 'PP Opp%', 'RO Opp%', 'RTL Opp%',
    'PPP OF', 'PPP DEF', 'RTNG OFF', 'RTNG DEF'];

  /** Promedio ponderado por recencia del perfil de un equipo en una
      condición (LOCAL/VISITANTE): los 8 factores más su eficiencia y
      rating específicos de esa condición. Con menos de 3 partidos en esa
      condición, usa toda la historia del equipo — un solo partido de
      visitante no define un perfil, es ruido. `PACE` sale de la
      temporada completa (no varía tanto por condición como para
      justificar el mismo recorte, y es la que menos partidos por
      condición tiene disponibles de las hojas de origen). */
  function perfilEquipoSimulacion(idx, clave, condicion) {
    const e = idx.get(clave);
    if (!e) return null;

    let partidos = e.factoresPartido.filter(f => SGADD.texto(f['CONDICION']).toUpperCase() === condicion);
    const usoHistoriaCompleta = partidos.length < MIN_PARTIDOS_CONDICION;
    if (usoHistoriaCompleta) partidos = e.factoresPartido.slice();
    if (!partidos.length) return null;

    const ordenados = partidos.slice().sort((a, b) => {
      const fa = SGADD.fecha(a['FECHA']), fb = SGADD.fecha(b['FECHA']);
      if (fa && fb) return fa - fb;
      if (fa) return -1;
      if (fb) return 1;
      return 0;
    });
    const pesos = ordenados.map((f, i) => pesoTemporalPartido(i, ordenados.length));

    const perfil = {};
    CLAVES_PERFIL.forEach(k => { perfil[k] = promedioPonderado(ordenados.map(f => f[k]), pesos); });

    const plays = idx.leer(clave, 'PLAYS');
    const pace = idx.leer(clave, 'PACE');
    const netRtng = idx.leer(clave, 'NET RTNG');

    perfil.pj = partidos.length;
    perfil.usoHistoriaCompleta = usoHistoriaCompleta;
    perfil.plays = plays && plays.valor !== null ? plays.valor : null;
    perfil.pace = pace && pace.valor !== null ? pace.valor : perfil.plays;   // PACE es opcional en la planilla: si falta, PLAYS es la mejor aproximación de ritmo
    perfil.pppOf = perfil['PPP OF'];   // alias legible para quien consume el perfil
    perfil.pppDef = perfil['PPP DEF'];
    perfil.netRating = netRtng && netRtng.valor !== null ? netRtng.valor : null;
    return perfil;
  }

  /** Ventaja real de localía de la liga (winrate de local - 50%), para
      modular el bonus. Con datos insuficientes, usa un valor conservador
      en vez de asumir 0 (que diría "la localía no importa"). */
  function ventajaLocaliaLiga(idx) {
    let ganados = 0, total = 0;
    idx.lista().forEach(e => {
      const l = e.split && e.split.LOCAL;
      if (l && l.pj) { total += l.pj; ganados += l.ganados; }
    });
    return total > 0 ? ganados / total - 0.5 : 0.05;
  }

  /* =====================================================================
     5. MATRIZ DE COMPENSACIÓN EFICIENCIA VS. VOLUMEN

     Dos equipos pueden anotar lo mismo por caminos opuestos: uno tira
     mucho y no siempre bien, otro tira poco pero elige mejor. Percentil
     contra la liga en los dos ejes (nunca valores absolutos, regla del
     proyecto), separados en la mediana.
     ===================================================================== */
  function matrizVolumenEficiencia(idx, clave) {
    const e = idx.get(clave);
    if (!e) return null;
    const volumen = idx.leer(clave, 'PLAYS');
    const eficiencia = idx.leer(clave, 'eFG%');
    if (!volumen || !eficiencia || volumen.percentil === null || eficiencia.percentil === null) return null;

    const altoVolumen = volumen.percentil >= 50;
    const altaEficiencia = eficiencia.percentil >= 50;
    let cuadrante, etiqueta;
    if (altoVolumen && altaEficiencia) { cuadrante = 'elite'; etiqueta = 'Alto volumen y alta eficiencia'; }
    else if (altoVolumen && !altaEficiencia) { cuadrante = 'volumen'; etiqueta = 'Vive del volumen: tira mucho, no siempre bien'; }
    else if (!altoVolumen && altaEficiencia) { cuadrante = 'selectivo'; etiqueta = 'Selectivo y letal: pocos tiros, buen porcentaje'; }
    else { cuadrante = 'bajo'; etiqueta = 'Bajo volumen y baja eficiencia: ataque en construcción'; }

    return { cuadrante: cuadrante, etiqueta: etiqueta, volumen: volumen, eficiencia: eficiencia };
  }

  /* =====================================================================
     6. SIMULADOR DE CRUCE — modelo 360°

     Línea base = ritmo esperado (PACE) × eficiencia cruzada (el ataque de
     cada equipo contra la defensa específica del rival, no un promedio
     simétrico de las dos ofensivas). Encima se suman tres correcciones
     independientes, cada una con su propia unidad de puntos:
       · duelos tácticos (regresión múltiple sobre los 4 factores)
       · diferencial de Net Rating de temporada (Power Ranking, atenuado)
       · bonus de localía aditivo (además de lo que ya capturan los
         perfiles condición-específicos de cada equipo)
     ===================================================================== */
  const BONUS_LOCALIA_PUNTOS = 2.5;
  /* Cuánto pesa el diferencial de Net Rating de temporada sobre el score.
     Se atenúa (no se suma entero): los duelos y la base PACE×PPP ya están
     midiendo fortaleza real partido a partido: sumar el Net Rating entero
     ENCIMA sería contar dos veces la misma información. Se lo trata como
     un prior de "quién es mejor en general", no como el driver principal. */
  const ESCALA_NET_RATING = 0.15;
  /* En básquet no hay empates. Si el modelo da un margen menor a esto (o
     un empate al redondear a los enteros que se muestran en pantalla), se
     desempata: no se "inventa" un ganador al azar, se usa la misma señal
     que ya tiene el modelo (Net Rating + la ventaja de localía ya
     calculada) para decidir el lado que rompe la paridad. No es una
     prórroga simulada de verdad (no hay columnas de cuartos/parciales en
     las planillas, ver deuda técnica) — es una proyección de margen
     mínimo, que es lo que un DT necesita para leer el resultado. */
  const MARGEN_MINIMO_EMPATE = 1.5;

  /**
   * En básquet no hay empates: si scoreL/scoreV vienen empatados o tan
   * cerca que el REDONDEO a los enteros que se muestran en pantalla
   * empataría ("80-80"), separa los dos scores alrededor de su propio
   * promedio hasta una distancia de `margenMinimo`, decidiendo el lado
   * ganador con `señal` (positiva favorece L, negativa favorece V — se
   * espera que el llamador arme esa señal con datos reales del modelo,
   * no un número arbitrario).
   *
   * Con `margenMinimo >= 1.0` el redondeo NUNCA puede volver a empatar:
   * dos números a más de 1.0 de distancia no pueden caer en el mismo
   * intervalo de redondeo de ancho 1.0 ([n-0.5, n+0.5)). Por eso el
   * default es 1.5, con margen de sobra.
   */
  function resolverEmpate(scoreL, scoreV, señal, margenMinimo) {
    const minimo = margenMinimo || MARGEN_MINIMO_EMPATE;
    let margen = scoreL - scoreV;
    let resuelto = false;
    if (Math.abs(margen) < 0.5 || Math.round(scoreL) === Math.round(scoreV)) {
      resuelto = true;
      const margenDesempate = señal >= 0 ? minimo : -minimo;
      const centro = (scoreL + scoreV) / 2;
      scoreL = centro + margenDesempate / 2;
      scoreV = centro - margenDesempate / 2;
      margen = scoreL - scoreV;
    }
    return { scoreL: scoreL, scoreV: scoreV, margen: margen, resuelto: resuelto };
  }

  /* =====================================================================
     7. MODELO VIVO Y BAYESIANO (2026-10-27)

     Reemplaza al modelo anterior de `simularEnfrentamiento`, que tenía
     cuatro defectos medidos (auditoría en el punto 148 del CLAUDE.md):
       · base = PACE (posesiones) × PPP (puntos por PLAY): dos unidades;
       · tres correcciones SUMADAS sobre la misma información (PPP +
         duelos de los 4 factores + Net Rating): doble y triple cuenta;
       · ningún encogimiento: un equipo con 2 partidos pesaba 100 %;
       · la localía entraba dos veces (perfiles L/V + bonus).

     Ahora hay UNA cadena de cálculo:
       ritmo × ORTG cruzado → margen por posesiones → + localía → + fatiga
     y los 4 factores NO se suman: EXPLICAN ese margen, con un residual
     explícito para que la cuenta cierre siempre.
     ===================================================================== */
  const esNum = (v) => typeof v === 'number' && isFinite(v);
  const mediaDe = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  /* Pesos universales de Dean Oliver (explicación relativa del margen):
     el PRIOR del que parte la regresión. */
  const PESOS_OLIVER = { 'eFG%': 0.40, 'PP%': 0.25, 'RO%': 0.20, 'RTL%': 0.15 };
  /* Los dos únicos priors externos del modelo, débiles a propósito: la liga
     los corrige con sus propios partidos apenas hay muestra. */
  const PRIOR_LOCALIA = { media: 3.0, sd: 2.0 };   // puntos de margen
  const PRIOR_FATIGA_SD = 1.5;                      // puntos, media 0
  /* Vueltas del ajuste por rival (el SRS converge en pocas). */
  const ITERACIONES_RIVAL = 12;
  /* Grilla del encogimiento de la regresión, en múltiplos de n. */
  const LAMBDAS_RELATIVAS = [0, 0.01, 0.03, 0.1, 0.3, 1, 3, 10, 30, 100, 1000];

  function fechaMs(v) {
    if (v instanceof Date) return v.getTime();
    if (esNum(v)) return v;
    const f = SGADD.fecha(v);
    return f ? f.getTime() : null;
  }

  /** Una fila por equipo-partido con todo lo que el modelo necesita. PURA
      sobre el índice. Los ratings ya vienen por 100 POSESIONES (punto 66);
      la posesión del partido sale de ellos (pts·100/ORTG), así la identidad
      puntos = posesiones × ORTG/100 cierra exacta. */
  function extraerJuegos(idx) {
    const filas = [];
    idx.lista().forEach(e => {
      const porId = new Map();
      e.partidos.forEach(p => porId.set(p.__id, p));
      e.factoresPartido.forEach(f => {
        const p = porId.get(f.__id);
        const pts = esNum(f['PTS']) ? f['PTS'] : (p ? p['PTS'] : null);
        const opp = esNum(f['PTSopp']) ? f['PTSopp'] : (p ? p['PTSopp'] : null);
        const ortg = f['RTNG OFF'], drtg = f['RTNG DEF'];
        if (!esNum(pts) || !esNum(opp)) return;
        const raw = {};
        for (const def of FACTORES_NET) {
          if (!esNum(f[def.id]) || !esNum(f[def.idOpp])) return;
          raw[def.id] = f[def.id]; raw[def.idOpp] = f[def.idOpp];
        }
        filas.push({
          id: f.__id, clave: e.clave, rival: null,
          fecha: fechaMs(p ? p.__fecha : f['FECHA']),
          local: SGADD.texto(f['CONDICION']).toUpperCase() === 'LOCAL',
          margen: pts - opp, pts: pts, ptsOpp: opp,
          /* Sin rating no hay modelo de posesiones, pero los pesos de los 4
             factores solo necesitan el margen: la fila se conserva. */
          ortg: esNum(ortg) && ortg > 0 ? ortg : null, drtg: esNum(drtg) ? drtg : null,
          pos: esNum(ortg) && ortg > 0 ? 100 * pts / ortg : null, f: raw, descanso: null,
        });
      });
    });
    const porId = new Map();
    filas.forEach(g => { if (!porId.has(g.id)) porId.set(g.id, []); porId.get(g.id).push(g); });
    porId.forEach(par => { if (par.length === 2) { par[0].rival = par[1].clave; par[1].rival = par[0].clave; } });
    /* Descanso: días desde el partido anterior del MISMO equipo. */
    const porEq = new Map();
    filas.forEach(g => { if (!porEq.has(g.clave)) porEq.set(g.clave, []); porEq.get(g.clave).push(g); });
    porEq.forEach(arr => {
      arr.sort((a, b) => (a.fecha === null ? Infinity : a.fecha) - (b.fecha === null ? Infinity : b.fecha));
      for (let i = 1; i < arr.length; i++) {
        if (arr[i].fecha !== null && arr[i - 1].fecha !== null) arr[i].descanso = Math.round((arr[i].fecha - arr[i - 1].fecha) / 86400000);
      }
    });
    return filas;
  }

  function agruparPorEquipo(juegos) {
    const m = new Map();
    juegos.forEach(g => { if (!m.has(g.clave)) m.set(g.clave, []); m.get(g.clave).push(g); });
    m.forEach(arr => {
      arr.sort((a, b) => (a.fecha === null ? Infinity : a.fecha) - (b.fecha === null ? Infinity : b.fecha));
      const w = arr.map((g, i) => pesoTemporalPartido(i, arr.length));
      const mw = mediaDe(w);
      arr.forEach((g, i) => { g.peso = w[i] / mw; });   // media 1: Σpeso = n
    });
    return m;
  }

  /**
   * ENCOGIMIENTO BAYESIANO (empírico de Bayes) de una métrica por equipo.
   * valor = (Σ w·x + k·μ) / (Σ w + k), con k = σ²_dentro / τ²_entre: lo que
   * «vale» el prior de la liga en partidos, MEDIDO de la dispersión real de
   * los equipos, no escrito a mano. Con k grande (equipos casi iguales)
   * todos van a la media; con k chico, a su propio promedio.
   */
  function encoger(grupos, get) {
    const T = [];
    let N = 0, suma = 0;
    grupos.forEach((arr, clave) => {
      const v = [], w = [];
      arr.forEach(g => { const x = get(g); if (esNum(x)) { v.push(x); w.push(g.peso); } });
      if (v.length) { T.push({ clave: clave, v: v, w: w }); N += v.length; suma += v.reduce((s, x) => s + x, 0); }
    });
    if (!T.length) return null;
    const mu = suma / N;
    let ss = 0, df = 0;
    T.forEach(t => { t.m = mediaDe(t.v); t.v.forEach(x => { ss += (x - t.m) * (x - t.m); }); df += t.v.length - 1; });
    const s2w = df > 0 ? ss / df : 0;
    const ms = T.map(t => t.m), mT = mediaDe(ms);
    const varEntre = T.length > 1 ? ms.reduce((s, x) => s + (x - mT) * (x - mT), 0) / (T.length - 1) : 0;
    const tau2 = varEntre - s2w * mediaDe(T.map(t => 1 / t.v.length));
    const k = tau2 > 1e-12 ? Math.min(1e6, s2w / tau2) : Infinity;
    const porEquipo = new Map();
    T.forEach(t => {
      const W = t.w.reduce((s, x) => s + x, 0), S = t.v.reduce((s, x, i) => s + x * t.w[i], 0);
      const valor = k === Infinity ? mu : (S + k * mu) / (W + k);
      const sd = t.v.length > 1 ? Math.sqrt(t.v.reduce((s, x) => s + (x - t.m) * (x - t.m), 0) / (t.v.length - 1)) : null;
      porEquipo.set(t.clave, { valor: valor, n: t.v.length, W: W, S: S, z: k === Infinity ? 0 : W / (W + k), sd: sd });
    });
    return { mu: mu, k: k, s2w: s2w, tau2: tau2, porEquipo: porEquipo };
  }

  /** El mismo estimador sacando UN partido (para el error fuera de muestra). */
  function sinPartido(sh, clave, g, x) {
    const t = sh.porEquipo.get(clave);
    if (!t) return sh.mu;
    if (!esNum(x) || sh.k === Infinity) return t.valor;
    const W = t.W - g.peso;
    if (W + sh.k <= 0) return sh.mu;
    return (t.S - g.peso * x + sh.k * sh.mu) / (W + sh.k);
  }

  function invertir(A) {
    const n = A.length, cols = [];
    for (let j = 0; j < n; j++) {
      const e = new Array(n).fill(0); e[j] = 1;
      const col = resolverSistemaLineal(A, e);
      if (!col) return null;
      cols.push(col);
    }
    return cols[0].map((_, i) => cols.map(col => col[i]));
  }

  /**
   * Pesos de los 4 factores: regresión RIDGE hacia el prior de Oliver, en
   * unidades estandarizadas. El encogimiento λ se elige por validación
   * cruzada dejando un partido afuera (forma cerrada, vía la matriz
   * sombrero): el modelo decide solo cuánto confiar en el prior y cuánto
   * en la liga. Con pocos partidos vuelve a Oliver; con muchos, a la
   * regresión múltiple. Reemplaza a «sumar regresiones simples».
   * Una fila por partido (la del local, sin la localía): las dos
   * perspectivas de un partido son espejo y harían trampa en la CV.
   */
  function ajustarPesosOliver(juegos, hca) {
    const filas = juegos.filter(g => g.local);
    const n = filas.length, p = FACTORES_NET.length;
    const out = { metodo: 'sin-datos', n: n, lambda: 0, credibilidad: 0, r2: 0, pesos: {}, pesosOliver: {} };
    FACTORES_NET.forEach(d => { out.pesos[d.id] = 0; out.pesosOliver[d.id] = 0; });
    if (n < 1) return out;
    const X = filas.map(g => FACTORES_NET.map(d => netFactor(d, g.f[d.id], g.f[d.idOpp])));
    const y = filas.map(g => g.margen - hca);
    const sd = FACTORES_NET.map((d, j) => Math.sqrt(mediaDe(X.map(r => r[j] * r[j]))) || 1);
    const Z = X.map(r => r.map((v, j) => v / sd[j]));
    const w = FACTORES_NET.map(d => PESOS_OLIVER[d.id]);
    const s = Z.map(r => r.reduce((a, v, j) => a + v * w[j], 0));
    const den = s.reduce((a, v) => a + v * v, 0);
    const c = den > 0 ? s.reduce((a, v, i) => a + v * y[i], 0) / den : 0;
    const g0 = w.map(v => c * v);
    const yP = y.map((v, i) => v - c * s[i]);
    const A = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => Z.reduce((acc, r) => acc + r[a] * r[b], 0)));
    const b = Array.from({ length: p }, (_, a) => Z.reduce((acc, r, i) => acc + r[a] * yP[i], 0));
    let mejor = null;
    if (n >= 3) {
      LAMBDAS_RELATIVAS.forEach(rel => {
        const lam = rel * n;
        const M = A.map((fila, a) => fila.map((v, bb) => v + (a === bb ? lam : 0)));
        const Minv = invertir(M);
        if (!Minv) return;
        const delta = Minv.map(fila => fila.reduce((acc, v, j) => acc + v * b[j], 0));
        let err = 0, valido = true;
        Z.forEach((r, i) => {
          const e = yP[i] - r.reduce((acc, v, j) => acc + v * delta[j], 0);
          const h = r.reduce((acc, v, a) => acc + v * Minv[a].reduce((t, m, j) => t + m * r[j], 0), 0);
          if (1 - h < 1e-9) { valido = false; return; }
          err += (e / (1 - h)) * (e / (1 - h));
        });
        if (valido && (mejor === null || err < mejor.err)) mejor = { err: err, lam: lam, delta: delta };
      });
    }
    const delta = mejor ? mejor.delta : new Array(p).fill(0);
    const gamma = g0.map((v, j) => v + delta[j]);
    out.metodo = mejor ? 'bayes-oliver' : 'oliver';
    out.lambda = mejor ? mejor.lam : Infinity;
    out.credibilidad = mejor ? n / (n + mejor.lam) : 0;
    FACTORES_NET.forEach((d, j) => { out.pesos[d.id] = gamma[j] / sd[j]; out.pesosOliver[d.id] = g0[j] / sd[j]; });
    const ssTot = y.reduce((a, v) => a + v * v, 0);
    const ssRes = Z.reduce((a, r, i) => { const e = y[i] - r.reduce((t, v, j) => t + v * gamma[j], 0); return a + e * e; }, 0);
    out.r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return out;
  }

  /** Localía de la liga: media del margen de los partidos de local, con el
      prior débil de arriba (la liga manda apenas hay partidos). */
  function ajustarLocalia(juegos) {
    const m = juegos.filter(g => g.local).map(g => g.margen);
    if (!m.length) return { hca: PRIOR_LOCALIA.media, n: 0, observada: null };
    const h = mediaDe(m);
    const v = m.length > 1 ? m.reduce((s, x) => s + (x - h) * (x - h), 0) / (m.length - 1) : 100;
    const s2 = Math.max(v, 1), t2 = PRIOR_LOCALIA.sd * PRIOR_LOCALIA.sd;
    const prec = m.length / s2 + 1 / t2;
    return { hca: (m.length * h / s2 + PRIOR_LOCALIA.media / t2) / prec, n: m.length, observada: h };
  }

  /** Fatiga: puntos de margen que cuesta jugar con ≤ 1 día de descanso
      contra un rival descansado. Ridge hacia 0: en una liga semanal casi no
      hay partidos así y el efecto queda en 0 solo, sin inventarlo. */
  function ajustarFatiga(juegos, hca) {
    let sxy = 0, sxx = 0, casos = 0, ss = 0, nn = 0;
    const porId = new Map();
    juegos.forEach(g => { if (!porId.has(g.id)) porId.set(g.id, []); porId.get(g.id).push(g); });
    const b2b = (g) => (g.descanso !== null && g.descanso <= 1 ? 1 : 0);
    porId.forEach(par => {
      const L = par.find(g => g.local), V = par.find(g => !g.local);
      if (!L || !V) return;
      const x = b2b(V) - b2b(L), y = L.margen - hca;
      sxy += x * y; sxx += x * x; ss += y * y; nn++;
      if (x !== 0) casos++;
    });
    const s2 = nn > 1 ? Math.max(ss / nn, 1) : 100;
    return { puntos: sxy / (sxx + s2 / (PRIOR_FATIGA_SD * PRIOR_FATIGA_SD)), casos: casos };
  }

  /**
   * AJUSTE POR RIVAL (strength of schedule). Lo que un equipo produce se
   * mide contra lo que SU rival de esa noche suele conceder, y lo que
   * concede, contra lo que su rival suele producir: anotar 112 contra la
   * peor defensa de la liga vale menos que 108 contra la mejor. Es el
   * esquema iterativo del SRS: cada vuelta usa los ratings ya ajustados
   * (y encogidos) de los rivales, hasta que se estabilizan. Un partido sin
   * rival identificado (fixtures sueltas) se deja como vino.
   * `pares`: [{ p, c, getP, getC }], con la clave de lo que se produce y la
   * de lo que se concede. Deja el valor ajustado en `g.adj[clave]` y
   * devuelve el encogimiento de cada clave.
   */
  function ajustarPorRival(grupos, pares, iteraciones) {
    const filas = [];
    grupos.forEach(arr => arr.forEach(g => filas.push(g)));
    const sh = {};
    pares.forEach(pr => {
      filas.forEach(g => { g.adj = g.adj || {}; g.adj[pr.p] = pr.getP(g); g.adj[pr.c] = pr.getC(g); });
      sh[pr.p] = encoger(grupos, g => g.adj[pr.p]);
      sh[pr.c] = encoger(grupos, g => g.adj[pr.c]);
    });
    for (let it = 0; it < (iteraciones || 0); it++) {
      pares.forEach(pr => {
        const O = sh[pr.p], D = sh[pr.c];
        if (!O || !D) return;
        filas.forEach(g => {
          const dOpp = g.rival ? D.porEquipo.get(g.rival) : null;   // lo que el rival CONCEDE
          const oOpp = g.rival ? O.porEquipo.get(g.rival) : null;   // lo que el rival PRODUCE
          const x = pr.getP(g), y = pr.getC(g);
          g.adj[pr.p] = (esNum(x) && dOpp) ? x - (dOpp.valor - D.mu) : x;
          g.adj[pr.c] = (esNum(y) && oOpp) ? y - (oOpp.valor - O.mu) : y;
        });
        sh[pr.p] = encoger(grupos, g => g.adj[pr.p]);
        sh[pr.c] = encoger(grupos, g => g.adj[pr.c]);
      });
    }
    return sh;
  }

  /**
   * Ajusta TODO el modelo con los partidos recibidos (la liga, hasta hoy).
   * Devuelve null si no hay ratings. El backtest lo llama con los partidos
   * previos a cada fecha: es el mismo código que usa el simulador, y por
   * eso aprende solo: cada paquete nuevo de partidos mueve los ratings, la
   * localía de cada club y la dispersión sin tocar una constante.
   */
  function ajustarModelo(juegosTodos) {
    const juegos = juegosTodos.filter(g => g.ortg !== null && g.drtg !== null);
    if (!juegos.length) return null;
    const grupos = agruparPorEquipo(juegos);
    const pares = [{ p: 'ortg', c: 'drtg', getP: g => g.ortg, getC: g => g.drtg }].concat(
      FACTORES_NET.map(d => ({ p: d.id, c: d.idOpp, getP: g => g.f[d.id], getC: g => g.f[d.idOpp] })));
    const sh = ajustarPorRival(grupos, pares, ITERACIONES_RIVAL);
    sh.pos = encoger(grupos, g => g.pos);
    if (!sh.ortg || !sh.drtg || !sh.pos) return null;
    const loc = ajustarLocalia(juegos);
    const mu = { ortg: (sh.ortg.mu + sh.drtg.mu) / 2, pos: sh.pos.mu };
    const equipos = new Map();
    grupos.forEach((arr, clave) => {
      const o = {}, a = {}, nets = {};
      FACTORES_NET.forEach(d => {
        const so = sh[d.id].porEquipo.get(clave), sa = sh[d.idOpp].porEquipo.get(clave);
        o[d.id] = so ? so.valor : null; a[d.id] = sa ? sa.valor : null;
        nets[d.id] = netFactor(d, o[d.id], a[d.id]);
      });
      const eo = sh.ortg.porEquipo.get(clave), ed = sh.drtg.porEquipo.get(clave), ep = sh.pos.porEquipo.get(clave);
      if (!eo || !ed || !ep) return;
      const dif = arr.filter(g => esNum(g.adj.ortg)).map(g => g.ortg - g.adj.ortg);
      equipos.set(clave, { clave: clave, n: arr.length, ortg: eo.valor, drtg: ed.valor, pos: ep.valor,
        z: eo.z, zDef: ed.z, sdOrtg: eo.sd, sdDrtg: ed.sd, sdPos: ep.sd,
        /* + si enfrentó defensas flojas (su ORTG crudo está inflado). */
        sos: dif.length ? mediaDe(dif) : 0, o: o, a: a, nets: nets });
    });
    const modelo = { n: new Set(juegos.map(g => g.id)).size, equipos: equipos, mu: mu, sh: sh,
      hca: loc.hca, localia: loc, hcaClub: new Map(), pesos: ajustarPesosOliver(juegos, loc.hca),
      fatiga: ajustarFatiga(juegos, loc.hca), sigma: null };

    /* Fuera de muestra: cada partido predicho con los equipos SIN él. De
       paso queda el residual neutral de cada local (margen − lo que dicen
       los ratings): de ahí sale la localía propia de cada club. */
    const porId = new Map();
    juegos.forEach(g => { if (!porId.has(g.id)) porId.set(g.id, []); porId.get(g.id).push(g); });
    const locales = [];
    porId.forEach(par => {
      const L = par.find(g => g.local), V = par.find(g => !g.local);
      if (!L || !V) return;
      const oL = sinPartido(sh.ortg, L.clave, L, L.adj.ortg), dL = sinPartido(sh.drtg, L.clave, L, L.adj.drtg);
      const oV = sinPartido(sh.ortg, V.clave, V, V.adj.ortg), dV = sinPartido(sh.drtg, V.clave, V, V.adj.drtg);
      const P = sinPartido(sh.pos, L.clave, L, L.pos) + sinPartido(sh.pos, V.clave, V, V.pos) - mu.pos;
      L.resid = L.margen - P * ((oL - dL) - (oV - dV)) / 100;
      locales.push(L);
    });
    /* HCA DINÁMICO POR CLUB: lo que rinde de local por encima de lo que
       dicen sus ratings, encogido hacia la localía de la liga con el mismo
       criterio empírico (k = σ²/τ² medido entre clubes). Un club que hace
       de su cancha un fortín se separa de la media; con pocos partidos
       en casa vale la media de la liga. */
    const grHome = new Map();
    locales.forEach(g => { if (!grHome.has(g.clave)) grHome.set(g.clave, []); grHome.get(g.clave).push(g); });
    const shHome = encoger(grHome, g => g.resid);
    if (shHome) {
      grHome.forEach((arr, clave) => {
        const t = shHome.porEquipo.get(clave);
        if (!t) return;
        const valor = shHome.k === Infinity ? loc.hca : (t.S + shHome.k * loc.hca) / (t.W + shHome.k);
        modelo.hcaClub.set(clave, { valor: valor, n: t.n, z: shHome.k === Infinity ? 0 : t.W / (t.W + shHome.k),
          crudo: t.S / t.W, desvio: valor - loc.hca });
      });
      let se = 0;
      locales.forEach(g => {
        const t = shHome.porEquipo.get(g.clave);
        const w = g.peso;
        const h = (shHome.k === Infinity || !t) ? loc.hca : ((t.S - w * g.resid + shHome.k * loc.hca) / (Math.max(t.W - w, 0) + shHome.k));
        se += (g.resid - h) * (g.resid - h);
      });
      modelo.sigma = locales.length > 1 ? Math.sqrt(se / locales.length) : null;
    } else if (locales.length > 1) {
      modelo.sigma = Math.sqrt(mediaDe(locales.map(g => (g.resid - loc.hca) * (g.resid - loc.hca))));
    }
    return modelo;
  }

  /** Localía que rige para un club: la suya (dinámica) o, sin partidos en
      casa, la de la liga. */
  function localiaDe(modelo, clave) {
    const h = modelo.hcaClub && modelo.hcaClub.get(clave);
    return h ? h.valor : modelo.hca;
  }

  /** Proyección de un cruce con el modelo ya ajustado. `opts.descansoL/V`
      (días desde su partido anterior) activan la fatiga. */
  function predecirCruce(modelo, claveL, claveV, opts) {
    const o = opts || {};
    let L = modelo.equipos.get(claveL), V = modelo.equipos.get(claveV);
    if (!L || !V) return null;
    /* Bajas (punto 172): Δ de ORTG/DRTG por 100 posesiones sobre una COPIA
       del equipo; el modelo ajustado no se toca. */
    const aj = o.ajustes || {};
    const mover = (eq, a) => (a && (a.ortg || a.drtg)) ? Object.assign({}, eq, { ortg: eq.ortg + (a.ortg || 0), drtg: eq.drtg + (a.drtg || 0) }) : eq;
    L = mover(L, aj.L); V = mover(V, aj.V);
    const pos = L.pos + V.pos - modelo.mu.pos;
    const ortL = L.ortg + V.drtg - modelo.mu.ortg, ortV = V.ortg + L.drtg - modelo.mu.ortg;
    const b2b = (d) => (esNum(d) && d <= 1 ? 1 : 0);
    const fatiga = modelo.fatiga.puntos * (b2b(o.descansoV) - b2b(o.descansoL));
    const hca = localiaDe(modelo, claveL);
    const margenPosesiones = pos * (ortL - ortV) / 100;
    const margen = margenPosesiones + hca + fatiga;
    const contribuciones = FACTORES_NET.map(d => {
      const ntL = L.nets[d.id], ntV = V.nets[d.id];
      const beta = modelo.pesos.pesos[d.id] || 0;
      return { id: d.id, label: d.label, beta: beta, ntL: ntL, ntV: ntV,
        puntos: (ntL !== null && ntV !== null) ? beta * (ntL - ntV) : 0 };
    });
    const suma = contribuciones.reduce((s, c) => s + c.puntos, 0);
    return { L: L, V: V, pos: pos, ortL: ortL, ortV: ortV, margen: margen,
      ptsL: pos * ortL / 100 + (hca + fatiga) / 2, ptsV: pos * ortV / 100 - (hca + fatiga) / 2,
      margenPosesiones: margenPosesiones, localia: hca, fatiga: fatiga,
      contribuciones: contribuciones, sumaFactores: suma, residual: margenPosesiones - suma };
  }

  /** Probabilidad de que gane el local: normal con el error fuera de muestra
      del propio modelo (ninguna escala escrita a mano). */
  function probabilidadLocal(margen, sigma) {
    const s = esNum(sigma) && sigma > 0 ? sigma : 12;
    const z = margen / (s * Math.SQRT2), az = Math.abs(z);
    const t = 1 / (1 + 0.3275911 * az);   // erf: Abramowitz y Stegun 7.1.26
    const e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-az * az);
    return 0.5 * (1 + (z >= 0 ? e : -e));
  }

  function rngSemilla(seed) {       // mulberry32: determinista y repetible
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Normal estándar por Box-Muller a partir del generador repetible. */
  function normalEstandar(rnd) {
    const u1 = Math.max(rnd(), 1e-12), u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * MONTE CARLO del cruce (10.000 partidos por defecto, unos milisegundos).
   * Cada partido sortea el ritmo y el ORTG de cada lado alrededor de las
   * medias del modelo, con la dispersión de cada equipo de noche a noche
   * (encogida hacia la de la liga con el peso de una temporada típica), y
   * calcula los puntos como posesiones × ORTG/100. Después se calibra la
   * dispersión total para que coincida con el error fuera de muestra del
   * propio modelo: la curva no puede ser más estrecha que lo que el modelo
   * realmente acierta. De la misma muestra salen la probabilidad de victoria
   * (un empate se resuelve en prórroga), el rango del 80 % y el histograma.
   */
  function simularMonteCarlo(modelo, pred, opts) {
    const o = opts || {};
    const n = o.n || 10000, rnd = rngSemilla(o.semilla || 20261027);
    const equiposLista = Array.from(modelo.equipos.values());
    const nu0 = Math.max(mediaDe(equiposLista.map(x => x.n)) - 1, 1);
    const encSd = (sd, nEq, pool) => {
      if (!sd || !pool) return pool || 1;
      const nu = Math.max(nEq - 1, 0);
      return Math.sqrt((nu * sd * sd + nu0 * pool * pool) / (nu + nu0));
    };
    const poolO = Math.sqrt(modelo.sh.ortg.s2w) || 1, poolD = Math.sqrt(modelo.sh.drtg.s2w) || 1, poolP = Math.sqrt(modelo.sh.pos.s2w) || 1;
    const sdOL = Math.sqrt((Math.pow(encSd(pred.L.sdOrtg, pred.L.n, poolO), 2) + Math.pow(encSd(pred.V.sdDrtg, pred.V.n, poolD), 2)) / 2);
    const sdOV = Math.sqrt((Math.pow(encSd(pred.V.sdOrtg, pred.V.n, poolO), 2) + Math.pow(encSd(pred.L.sdDrtg, pred.L.n, poolD), 2)) / 2);
    const sdP = (encSd(pred.L.sdPos, pred.L.n, poolP) + encSd(pred.V.sdPos, pred.V.n, poolP)) / 2;
    const dOrt = (pred.ortL - pred.ortV) / 100;
    const sdAnalitico = Math.sqrt(Math.pow(pred.pos / 100, 2) * (sdOL * sdOL + sdOV * sdOV) + dOrt * dOrt * sdP * sdP);
    const sigmaObjetivo = modelo.sigma || sdAnalitico || 12;
    const c = sdAnalitico > 0 ? sigmaObjetivo / sdAnalitico : 1;
    const ventaja = (pred.localia + pred.fatiga) / 2;
    const pEmpate = probabilidadLocal(pred.margen, modelo.sigma);
    const margenes = new Array(n), ptsL = new Array(n), ptsV = new Array(n);
    let gana = 0;
    for (let i = 0; i < n; i++) {
      const pos = Math.max(40, pred.pos + c * sdP * normalEstandar(rnd));
      const oL = pred.ortL + c * sdOL * normalEstandar(rnd), oV = pred.ortV + c * sdOV * normalEstandar(rnd);
      const pl = pos * oL / 100 + ventaja, pv = pos * oV / 100 - ventaja;
      ptsL[i] = pl; ptsV[i] = pv; margenes[i] = pl - pv;
      if (Math.round(pl) > Math.round(pv)) gana++;
      else if (Math.round(pl) === Math.round(pv) && rnd() < pEmpate) gana++;   // prórroga
    }
    const orden = (a) => a.slice().sort((x, y) => x - y);
    const q = (s, p) => s[Math.min(n - 1, Math.floor(p * n))];
    const sm = orden(margenes), sl = orden(ptsL), sv = orden(ptsV);
    /* Histograma del margen: barras de 2 puntos cubriendo los extremos. */
    const ancho = 2, lo = Math.floor(sm[0] / ancho) * ancho, hi = Math.ceil(sm[n - 1] / ancho) * ancho;
    const cuentas = new Array(Math.max(1, Math.round((hi - lo) / ancho))).fill(0);
    margenes.forEach(m => { cuentas[Math.min(cuentas.length - 1, Math.floor((m - lo) / ancho))]++; });
    const histograma = cuentas.map((cnt, i) => ({ desde: lo + i * ancho, hasta: lo + (i + 1) * ancho, p: cnt / n }));
    return { n: n, ganadasLocal: gana, pLocal: gana / n, sigma: sigmaObjetivo, calibracion: c,
      margenMedio: mediaDe(margenes), margenP10: q(sm, 0.1), margenP50: q(sm, 0.5), margenP90: q(sm, 0.9),
      ptsLocal: { p10: q(sl, 0.1), p50: q(sl, 0.5), p90: q(sl, 0.9) },
      ptsVisitante: { p10: q(sv, 0.1), p50: q(sv, 0.5), p90: q(sv, 0.9) },
      histograma: histograma };
  }

  /** El uso dentro de la cancha tiene techo: los 5 en cancha suman 100 %.
      Normaliza USG% × minutos para que ningún secundario absorba jugadas
      que el equipo no tiene, y reparte las posesiones del cruce. */
  function repartirUso(jugadores, posesiones) {
    const lista = (jugadores || []).filter(j => esNum(j.min) && j.min > 0 && esNum(j.usg) && j.usg >= 0);
    const bruto = lista.reduce((s, j) => s + (j.usg / 100) * (j.min / 40), 0);
    if (!lista.length || bruto <= 0) return { ok: false, motivo: 'sin usos para repartir', jugadores: [] };
    const kappa = 1 / bruto;
    return { ok: true, kappa: kappa, jugadores: lista.map(j => {
      const plays = posesiones * kappa * (j.usg / 100) * (j.min / 40);
      return { nombre: j.nombre, min: j.min, usgAjustado: kappa * j.usg, plays: plays, puntos: esNum(j.ppp) ? plays * j.ppp : null };
    }) };
  }

  /* =====================================================================
     BAJAS · VALOR SOBRE REEMPLAZO (VORP) · punto 172
     ---------------------------------------------------------------------
     El rating del equipo es el de SU temporada, con el ausente adentro.
     Sin él, sus minutos van a la rotación (proporcional a los minutos de
     cada uno: es lo único que la planilla dice de quién entra) y sus
     jugadas se reparten con `repartirUso`, así el uso del quinteto sigue
     sumando 100 %. Lo que cambia es QUIÉN termina las jugadas:

       ataque   Δ pts/jugada = Σ uso'·PPP' − Σ uso·PPP  →  × jugadas/posesión × 100
       defensa  recuperos + tapones + rebote defensivo por minuto, del ausente
                contra los que heredan sus minutos  →  posesiones rivales
                cortadas × los puntos de una jugada de la liga

     PPP y tasas por minuto se encogen hacia el nivel de REEMPLAZO de la
     liga (la mediana de los que no califican) con el peso de su muestra:
     un suplente con 15 jugadas en la temporada no hereda un PPP de 1,40.

     Y el efecto se escala por la parte de los partidos del equipo que el
     ausente jugó: si ya faltó la mitad de la temporada, la mitad de su
     ausencia ya está en el rating. Con play-by-play, el On/Off de ese
     jugador (Net con él − Net sin él) se mezcla con la estimación del box
     score con el peso de sus minutos con y sin él.
     ===================================================================== */
  const BAJAS = {
    K_JUGADAS: 40,       // jugadas de la liga con que se encoge el PPP de cada uno
    K_MINUTOS: 60,       // minutos de la liga con que se encogen recuperos, tapones y rebote
    K_ONOFF: 300,        // minutos (con y sin él) que pesa el On/Off contra el box score
    MIN_JUGADOR: 1,      // minutos de promedio para entrar a la rotación
    /* Curva de uso (prior de Dean Oliver): el que toma más jugadas de las
       que suele tomar rinde menos, ~1 punto de ORTG por cada punto de uso. */
    CURVA_USO: 0.01,     // pts por jugada que pierde cada punto de USG% extra
    /* La planilla solo ve la parte de la defensa que CORTA la posesión
       (recuperos, tapones, rebote defensivo): el resto (rotar, cerrar, el
       contacto) no está. Por eso pesa la mitad. */
    PESO_DEFENSA: 0.5,
    /* El reemplazo: mitad los compañeros que absorben los minutos, mitad el
       nivel de reemplazo de la liga (ver evaluar). */
    MEZCLA_REEMPLAZO: 0.5,
  };

  const num0 = (v) => (esNum(v) ? v : 0);

  /** Niveles de reemplazo de la liga: medianas de los que NO califican
      (los que entran cuando falta alguien), con respaldo en la de todos. */
  function reemplazoLiga(idx) {
    const liga = (idx && idx.liga) || {};
    const todos = (liga.jugadores || []).filter(j => esNum(j['MIN']) && j['MIN'] > 0 && !/TIPO/i.test(String(j['NOMBRES'] || '')));
    const umbral = esNum(liga.minJugador) ? liga.minJugador : 15;
    const banco = todos.filter(j => j['MIN'] < umbral);
    const mediana = (arr) => { const s = arr.filter(esNum).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const pool = banco.length >= 8 ? banco : todos;
    const porMin = (k) => mediana(pool.map(j => (esNum(j[k]) && j['MIN'] > 0 ? j[k] / j['MIN'] : null)));
    return {
      ppp: mediana(pool.filter(j => num0(j['PLAYS']) > 0).map(j => j['PPP'])) || mediana(todos.map(j => j['PPP'])) || 0.9,
      prMin: porMin('PR') || 0, tcMin: porMin('TC') || 0, rdMin: porMin('RD') || 0,
      pppLiga: mediana(todos.map(j => j['PPP'])) || 0.95,
      n: pool.length,
    };
  }

  /** El plantel del equipo con lo que hace falta para la cuenta. */
  function plantelDe(idx, clave) {
    const liga = idx.liga || {};
    const lista = (liga.jugadoresPorEquipo && liga.jugadoresPorEquipo.get(clave)) || [];
    return lista.filter(j => !/TIPO/i.test(String(j['NOMBRES'] || '')) && esNum(j['MIN']) && j['MIN'] >= BAJAS.MIN_JUGADOR)
      .map(j => ({ nombre: j['NOMBRES'], equipo: j['EQUIPO'], min: j['MIN'], usg: j['USG%'] != null ? (j['USG%'] <= 1 ? j['USG%'] * 100 : j['USG%']) : null,
        ppp: j['PPP'], plays: num0(j['PLAYS']), pj: num0(j['PJ']) || 1,
        pr: num0(j['PR']), tc: num0(j['TC']), rd: num0(j['RD']) }));
  }

  const normNombre = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

  /**
   * Impacto de las bajas de UN equipo. `bajas`: [{ nombre, motivo?, onOff? }]
   * (onOff = { dif, minOn, minOff } del play-by-play, opcional).
   * Devuelve { ok, ortg, drtg, net, jugadores: [{ nombre, ortg, drtg, net, ... }] }
   * con Δ en puntos por 100 posesiones (ORTG baja = negativo; DRTG sube = positivo).
   */
  function impactoBajas(idx, clave, bajas, opts) {
    const o = opts || {};
    const out = { ok: false, clave: clave, ortg: 0, drtg: 0, net: 0, jugadores: [], omitidas: [] };
    const e = idx && idx.get ? idx.get(clave) : null;
    if (!e || !Array.isArray(bajas) || !bajas.length) { out.motivo = 'sin bajas'; return out; }
    const plantel = plantelDe(idx, e.clave);
    if (plantel.length < 6) { out.motivo = 'plantel sin minutos suficientes'; return out; }
    const R = o.reemplazo || reemplazoLiga(idx);
    const pjEq = Math.max(1, num0(e.pj) || num0(e.promedios && e.promedios['PJ']) || Math.max.apply(null, plantel.map(j => j.pj)));
    const pr = e.promedios || {};
    const plays = num0(pr['PLAYS']), ro = num0(pr['RO']);
    const jugPorPos = plays > 0 && plays - ro > 0 ? plays / (plays - ro) : 1.1;
    const posPartido = plays > 0 ? plays - ro : 70;

    /* Encogimientos hacia el nivel de reemplazo. */
    plantel.forEach(j => {
      const n = j.plays * j.pj;
      j.pppE = esNum(j.ppp) ? (n * j.ppp + BAJAS.K_JUGADAS * R.ppp) / (n + BAJAS.K_JUGADAS) : R.ppp;
      const m = j.min * j.pj;
      const enc = (x, r) => (m * (x / j.min) + BAJAS.K_MINUTOS * r) / (m + BAJAS.K_MINUTOS);
      j.prE = enc(j.pr, R.prMin); j.tcE = enc(j.tc, R.tcMin); j.rdE = enc(j.rd, R.rdMin);
    });

    /* La parte de las jugadas del equipo que termina cada uno (los 5 en
       cancha suman 100 %): repartirUso con posesiones = 1. */
    const partes = (lista) => {
      const u = repartirUso(lista.map(j => ({ nombre: j.nombre, min: j.min, usg: j.usg })), 1);
      const m = new Map();
      if (u.ok) u.jugadores.forEach(x => m.set(x.nombre, x));
      return m;
    };
    /* Estado SIN las bajas: los minutos de los ausentes pasan a la rotación.
       Absorbe más el que tiene minutos Y lugar para sumar (min × (40 − min)):
       el sexto o séptimo hombre, no el titular de 36. Techo de 40. */
    const sinBajas = (ausentes) => {
      const resto = plantel.filter(j => ausentes.indexOf(j) === -1).map(j => Object.assign({}, j));
      let libres = ausentes.reduce((s, j) => s + j.min, 0);
      for (let vuelta = 0; vuelta < 6 && libres > 1e-6; vuelta++) {
        const abiertos = resto.filter(j => j.min < 40);
        const peso = (j) => j.min * (40 - j.min);
        const base = abiertos.reduce((s, j) => s + peso(j), 0);
        if (base <= 0) break;
        let usados = 0;
        const reparto = abiertos.map(j => libres * peso(j) / base);
        abiertos.forEach((j, k) => { const d = Math.min(40 - j.min, reparto[k]); j.min += d; usados += d; });
        libres -= usados;
      }
      return resto;
    };
    const defensa = (lista) => lista.reduce((s, j) => s + j.min * (j.prE + j.tcE + j.rdE * 0.5), 0);   // un rebote defensivo cuesta media posesión: el rival podría haber fallado igual

    const base = { partes: partes(plantel), df: defensa(plantel) };
    if (!base.partes.size) { out.motivo = 'sin uso para repartir'; return out; }

    /* VORP: las jugadas del ausente pasan a valer lo que rinde su REEMPLAZO.
       El reemplazo es mitad los compañeros que absorben sus minutos (con su
       PPP y la curva de uso por las jugadas de más que toman) y mitad el
       nivel de reemplazo de la liga (tiros forzados de quien no suele
       tenerlos). Sin la mitad de la liga, el goleador de bajo PPP «mejora»
       al equipo al faltar: el box score no ve la jugada que él inventa. */
    const evaluar = (ausentes) => {
      const resto = sinBajas(ausentes);
      const p2 = partes(resto);
      if (!p2.size) return null;
      let extra = 0, ptsExtra = 0;
      resto.forEach(j => {
        const a = base.partes.get(j.nombre), b2 = p2.get(j.nombre);
        if (!a || !b2) return;
        const d = b2.plays - a.plays;
        if (d <= 0) return;
        extra += d;
        ptsExtra += d * (j.pppE - BAJAS.CURVA_USO * Math.max(0, b2.usgAjustado - j.usg));
      });
      const pppCompas = extra > 0 ? ptsExtra / extra : R.ppp;
      const pppRepl = BAJAS.MEZCLA_REEMPLAZO * pppCompas + (1 - BAJAS.MEZCLA_REEMPLAZO) * R.ppp;
      const dPts = ausentes.reduce((s, j) => {
        const a = base.partes.get(j.nombre);
        return s + (a ? a.plays * (pppRepl - j.pppE) : 0);
      }, 0);
      const dOrtg = 100 * dPts * jugPorPos;
      const dCortes = base.df - defensa(resto);   // posesiones rivales que se dejan de cortar
      const dDrtg = BAJAS.PESO_DEFENSA * 100 * dCortes * R.pppLiga / posPartido;
      return { ortg: dOrtg, drtg: dDrtg, pppReemplazo: pppRepl, reemplazo: resto.filter(j => {
        const antes = plantel.find(p => p.nombre === j.nombre);
        return antes && j.min - antes.min > 0.5;
      }).map(j => ({ nombre: j.nombre, minExtra: j.min - plantel.find(p => p.nombre === j.nombre).min })).sort((a, b) => b.minExtra - a.minExtra).slice(0, 3) };
    };

    const ausentes = [];
    bajas.forEach(b => {
      const j = plantel.find(p => normNombre(p.nombre) === normNombre(b.nombre));
      if (!j) { out.omitidas.push({ nombre: b.nombre, motivo: 'no tiene minutos en esta fase' }); return; }
      const ev = evaluar([j]);
      if (!ev) { out.omitidas.push({ nombre: b.nombre, motivo: 'sin uso para repartir' }); return; }
      /* Lo que el rating todavía le debe a su ausencia. */
      const escala = Math.max(0, Math.min(1, j.pj / pjEq));
      let ortg = ev.ortg * escala, drtg = ev.drtg * escala;
      const fuente = ['box'];
      let peso = 0, dO = 0, dD = 0;
      const oo = b.onOff;
      if (oo && esNum(oo.dif) && esNum(oo.minOn) && esNum(oo.minOff)) {
        /* Net del equipo = f·Net con él + (1−f)·Net sin él; sin él, todo
           pasa a ser «sin él»: Δ = −f·(con − sin). */
        const f = Math.max(0, Math.min(1, j.min / 40));
        const netOnOff = -f * oo.dif * escala;
        peso = Math.min(oo.minOn, oo.minOff) / (Math.min(oo.minOn, oo.minOff) + BAJAS.K_ONOFF);
        const netBox = ortg - drtg;
        const net = peso * netOnOff + (1 - peso) * netBox;
        /* El On/Off no separa ataque de defensa: se reparte como el box. */
        const totalBox = Math.abs(ortg) + Math.abs(drtg);
        const fracO = totalBox > 0 ? Math.abs(ortg) / totalBox : 0.5;
        const delta = net - netBox;
        dO = delta * fracO; dD = -delta * (1 - fracO);
        ortg += dO; drtg += dD;
        fuente.push('on/off');
      }
      /* Una baja NUNCA mejora al equipo en la proyección. Si el box score
         dice que sí (el goleador de bajo PPP), lo que no ve es la jugada
         que él inventa: no se ajusta, y se dice. */
      let sinCosto = false;
      if (ortg - drtg > 0) { sinCosto = true; ortg = 0; drtg = 0; dO = 0; dD = 0; }
      ausentes.push(j);
      out.jugadores.push({ sinCosto: sinCosto, nombre: j.nombre, motivo: b.motivo || null, min: j.min, usg: j.usg, ppp: j.ppp, pj: j.pj, pjEquipo: pjEq,
        escala: escala, ortg: ortg, drtg: drtg, net: ortg - drtg, fuente: fuente.join(' + '), pesoOnOff: peso, reemplazo: ev.reemplazo,
        _dO: dO, _dD: dD });
    });
    if (!out.jugadores.length) { out.motivo = 'ninguna baja con minutos en esta fase'; return out; }

    /* Juntos no se suman: los reemplazos se pisan. El box se evalúa con
       todos afuera a la vez (con la escala media de lo que faltaron) y el
       ajuste del On/Off de cada uno se suma encima. */
    const junto = ausentes.length > 1 ? evaluar(ausentes) : null;
    if (junto) {
      const escMedia = mediaDe(out.jugadores.map(x => x.escala));
      out.ortg = junto.ortg * escMedia + out.jugadores.reduce((s, x) => s + x._dO, 0);
      out.drtg = junto.drtg * escMedia + out.jugadores.reduce((s, x) => s + x._dD, 0);
      out.reemplazo = junto.reemplazo;
    } else {
      out.ortg = out.jugadores[0].ortg; out.drtg = out.jugadores[0].drtg;
      out.reemplazo = out.jugadores[0].reemplazo;
    }
    if (out.ortg - out.drtg > 0) { out.ortg = 0; out.drtg = 0; out.sinCosto = true; }
    out.jugadores.forEach(x => { delete x._dO; delete x._dD; });
    out.net = out.ortg - out.drtg;
    out.ok = true;
    out.reemplazoLiga = R;
    return out;
  }

  /** Backtest hacia adelante: cada partido se predice con la liga hasta el
      día anterior. Mide el modelo sin hacerle trampa. */
  function backtest(juegos, opts) {
    const minPrevios = (opts && opts.minPrevios) || 40;
    const ids = new Map();
    juegos.forEach(g => { if (!ids.has(g.id)) ids.set(g.id, g.fecha); });
    const orden = Array.from(ids.entries()).filter(e => e[1] !== null).sort((a, b) => a[1] - b[1]);
    const res = [];
    orden.forEach(([id, fecha]) => {
      const previos = juegos.filter(g => g.fecha !== null && g.fecha < fecha);
      if (new Set(previos.map(g => g.id)).size < minPrevios) return;
      const L = juegos.find(g => g.id === id && g.local);
      if (!L || !L.rival) return;
      const m = ajustarModelo(previos);
      const pred = m ? predecirCruce(m, L.clave, L.rival) : null;
      if (pred) res.push({ id: id, real: L.margen, pred: pred.margen });
    });
    if (!res.length) return { n: 0 };
    return { n: res.length, mae: mediaDe(res.map(r => Math.abs(r.real - r.pred))),
      rmse: Math.sqrt(mediaDe(res.map(r => (r.real - r.pred) * (r.real - r.pred)))),
      aciertos: mediaDe(res.map(r => ((r.real > 0) === (r.pred > 0) ? 1 : 0))), filas: res };
  }

  const cacheModelo = new WeakMap();
  function modeloDe(idx) {
    let m = cacheModelo.get(idx);
    if (m === undefined) { m = ajustarModelo(extraerJuegos(idx)); cacheModelo.set(idx, m); }
    return m;
  }

  /**
   * Simula LOCAL vs VISITANTE. Devuelve { ok:false, motivo } si falta
   * muestra, o el desglose completo. Conserva la forma de siempre (la
   * consumen la pantalla y los duelos del Scouting) y suma `modelo`
   * (credibilidad, residual, incertidumbre) y `scouting` (lo que exporta).
   * `opts.descansoLocal/Visitante` (días) activan la fatiga.
   */
  function simularEnfrentamiento(idx, claveLocal, claveVisitante, opts) {
    const eL = idx.get(claveLocal), eV = idx.get(claveVisitante);
    if (!eL || !eV) return { ok: false, motivo: 'Alguno de los dos equipos no existe en esta liga.' };
    if (eL.clave === eV.clave) return { ok: false, motivo: 'Elegí dos equipos distintos.' };
    const modelo = modeloDe(idx);
    const op = opts || {};
    const optsPred = { descansoL: op.descansoLocal, descansoV: op.descansoVisitante };
    const base = modelo ? predecirCruce(modelo, eL.clave, eV.clave, optsPred) : null;
    if (!base) return { ok: false, motivo: 'Alguno de los dos equipos no tiene partidos suficientes para simular.' };
    /* BAJAS: cada lado con lo que su ausente deja de aportar. Sin bajas,
       la proyección es exactamente la de siempre. */
    const iL = (op.bajasLocal && op.bajasLocal.length) ? impactoBajas(idx, eL.clave, op.bajasLocal) : null;
    const iV = (op.bajasVisitante && op.bajasVisitante.length) ? impactoBajas(idx, eV.clave, op.bajasVisitante) : null;
    const hayBajas = !!((iL && iL.ok) || (iV && iV.ok));
    const pred = hayBajas
      ? predecirCruce(modelo, eL.clave, eV.clave, Object.assign({}, optsPred, { ajustes: {
          L: iL && iL.ok ? { ortg: iL.ortg, drtg: iL.drtg } : null, V: iV && iV.ok ? { ortg: iV.ortg, drtg: iV.drtg } : null } }))
      : base;
    /* El margen que cuesta cada ausente, desde el lado de SU equipo. */
    const enMargen = (imp) => (imp && imp.ok ? Object.assign({}, imp, {
      margen: base.pos * imp.net / 100,
      jugadores: imp.jugadores.map(j => Object.assign({}, j, { margen: base.pos * j.net / 100 })) }) : imp);
    const bajas = { aplicadas: hayBajas, local: enMargen(iL), visitante: enMargen(iV),
      margenSinBajas: base.margen, margenConBajas: pred.margen, delta: pred.margen - base.margen };

    /* En básquet no hay empates: si el redondeo empata, se separa con la
       misma señal del modelo (el signo del margen que ya calculó). El
       ajuste queda a la vista y entra en la reconciliación. */
    const desempate = resolverEmpate(pred.ptsL, pred.ptsV, pred.margen);
    const scoreL = desempate.scoreL, scoreV = desempate.scoreV, margen = desempate.margen;
    const ajusteEmpate = margen - pred.margen;
    const prob = probabilidadLocal(pred.margen, modelo.sigma);

    const duelos = pred.contribuciones.map((c, i) => {
      const def = FACTORES_NET[i];
      const netL = netFactor(def, pred.L.o[def.id], pred.V.a[def.id]);
      const netV = netFactor(def, pred.V.o[def.id], pred.L.a[def.id]);
      return {
        id: def.id, label: def.label, netL: netL, netV: netV,
        impactoL: c.puntos / 2, impactoV: -c.puntos / 2, puntos: c.puntos, peso: c.beta,
        propioL: pred.L.o[def.id], defV: pred.V.a[def.id], propioV: pred.V.o[def.id], defL: pred.L.a[def.id],
      };
    });
    const factorClave = duelos.slice().sort((a, b) => Math.abs(b.puntos) - Math.abs(a.puntos))[0];
    const mc = simularMonteCarlo(modelo, pred, { n: (opts && opts.n) || 10000 });

    return {
      ok: true,
      local: eL.nombre, visitante: eV.nombre,
      claveLocal: eL.clave, claveVisitante: eV.clave,
      scoreLocal: scoreL, scoreVisitante: scoreV,
      margen: margen,
      empateResuelto: desempate.resuelto,
      ganador: margen >= 0 ? eL.nombre : eV.nombre,
      /* Probabilidad de que gane el LOCAL = fracción de las simulaciones que
         ganó; el tope es solo de presentación. */
      confianza: Math.min(0.97, Math.max(0.03, mc.pLocal)),
      duelos: duelos,
      factorClave: factorClave,
      paceEsperado: pred.pos,
      pppEsperadoLocal: pred.ortL / 100, pppEsperadoVisitante: pred.ortV / 100,   // por POSESIÓN (ORTG/100)
      ortgEsperadoLocal: pred.ortL, ortgEsperadoVisitante: pred.ortV,
      netRatingLocal: pred.L.ortg - pred.L.drtg, netRatingVisitante: pred.V.ortg - pred.V.drtg,
      ajusteNetRating: 0,   // el Net Rating ya NO se suma aparte: es la base del margen
      bajas: bajas,
      bonusLocalia: pred.localia,
      fatiga: pred.fatiga,
      metodoPesos: modelo.pesos.metodo, rLiga2: modelo.pesos.r2, nLiga: modelo.pesos.n,
      muestraLocal: pred.L.n, muestraVisitante: pred.V.n,
      usoHistoriaCompletaLocal: false, usoHistoriaCompletaVisitante: false,
      modelo: {
        credibilidadLocal: pred.L.z, credibilidadVisitante: pred.V.z,
        credibilidadPesos: modelo.pesos.credibilidad, lambda: modelo.pesos.lambda,
        pesosOliver: modelo.pesos.pesosOliver, sigma: modelo.sigma,
        probabilidadMC: mc.pLocal, probabilidadAnalitica: prob, mc: mc,
        margenP10: mc.margenP10, margenP50: mc.margenP50, margenP90: mc.margenP90,
        hcaClub: modelo.hcaClub.get(eL.clave) || null, hcaLiga: modelo.hca,
        sosLocal: pred.L.sos, sosVisitante: pred.V.sos,
        localiaObservada: modelo.localia.observada, partidosLiga: modelo.n,
        /* margen = posesiones + localía + fatiga + ajuste de empate; y las
           posesiones = suma de los 4 factores + residual. Siempre cierra. */
        reconciliacion: {
          margenPosesiones: pred.margenPosesiones, sumaFactores: pred.sumaFactores, residual: pred.residual,
          localia: pred.localia, fatiga: pred.fatiga, ajusteEmpate: ajusteEmpate, margenFinal: margen,
        },
      },
      /* Lo que lee Scouting: el MISMO modelo, sin recalcular nada. */
      scouting: {
        duelos: duelos.map(d => ({ id: d.id, puntos: d.puntos, ventajaLocal: d.puntos >= 0, netL: d.netL, netV: d.netV })),
        ritmo: pred.pos, ortg: { local: pred.ortL, visitante: pred.ortV },
        probabilidadLocal: mc.pLocal, localia: pred.localia, sos: { local: pred.L.sos, visitante: pred.V.sos },
        referencias: { ortgLiga: modelo.mu.ortg, posesionesLiga: modelo.mu.pos },
      },
    };
  }

  return {
    FACTORES_NET, MIN_MUESTRA_REGRESION, MIN_PARTIDOS_CONDICION, BONUS_LOCALIA_PUNTOS,
    ESCALA_NET_RATING, MARGEN_MINIMO_EMPATE, VENTANA_RECIENTE, REFUERZO_RECIENTE,
    correlacionPearson, regresionSimple, regresionMultiple, resolverSistemaLineal,
    pesoTemporalPartido, promedioPonderado, confianzaLogistica,
    netFactor, datosRegresionLiga, pesosPorFactor,
    perfilEquipoSimulacion, ventajaLocaliaLiga, matrizVolumenEficiencia,
    resolverEmpate, simularEnfrentamiento,
    PESOS_OLIVER, PRIOR_LOCALIA, extraerJuegos, encoger, ajustarModelo, ajustarPesosOliver, ajustarLocalia, ajustarFatiga,
    ajustarPorRival, localiaDe, predecirCruce, probabilidadLocal, simularMonteCarlo, repartirUso, backtest, modeloDe,
    BAJAS, impactoBajas, reemplazoLiga, plantelDe,
  };
})();

/* =====================================================================
   SECCIÓN SIMULADOR — grilla de selección + resultado del cruce.

   Misma estructura de estado/ruteo que Equipos y Jugadores, apoyada acá
   en el motor puro SGADD_4F (arriba) en vez de en un análisis propio.
   No tiene tabs: es una sola vista (elegir dos equipos → ver el cruce).

   Ruta: #/<planilla>/<fase>/simulador/<local>/<visitante>
   ===================================================================== */

const SIMULADOR = {
  planillaId: null,
  fase: 'REGULAR',
  equipoLocal: null,
  equipoVisitante: null,
  /* Bajas del buzón (punto 172): se aplican salvo que el DT las apague. */
  aplicarBajas: true,
  onOff: {},        // nombre del equipo -> Map(nombre normalizado -> On/Off) | 'pidiendo' | 'sin'
};

/* ===================== BAJAS (punto 172) ===================== */

/** Las bajas de un equipo según el buzón: SUSPENSO (lesión, sanción) y
    BAJA (fuera del plantel). Un ALTA o un ACTIVO juegan. */
function simuladorBajasDe(idx, clave) {
  if (typeof SGADD_BUZON === 'undefined' || !SGADD_BUZON.estadoDe) return [];
  const e = idx.get(clave);
  if (!e) return [];
  const lista = (idx.liga.jugadoresPorEquipo && idx.liga.jugadoresPorEquipo.get(e.clave)) || [];
  const mapaOo = SIMULADOR.onOff[e.nombre];
  const out = [];
  lista.forEach(j => {
    if (/TIPO/i.test(String(j['NOMBRES'] || ''))) return;
    const est = SGADD_BUZON.estadoDe(j['NOMBRES'], j['EQUIPO']);
    if (!est || (est.id !== 'SUSPENSO' && est.id !== 'BAJA')) return;
    const oo = mapaOo instanceof Map ? mapaOo.get(simuladorNorm(j['NOMBRES'])) : null;
    out.push({ nombre: j['NOMBRES'], motivo: est.emoji + ' ' + est.label, nota: est.nota || null, onOff: oo || null });
  });
  return out;
}

function simuladorNorm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Con la capa de play-by-play, el On/Off de cada jugador del equipo. Se
    pide UNA vez por equipo; al llegar, repinta. Sin capa, no se pide. */
function simuladorPedirOnOff(nombreEquipo) {
  if (!nombreEquipo || SIMULADOR.onOff[nombreEquipo]) return;
  if (typeof SGADD_PBP === 'undefined' || !SGADD_PBP.activa || !SGADD_PBP.activa() || !SGADD_PBP.pedir) {
    SIMULADOR.onOff[nombreEquipo] = 'sin';
    return;
  }
  SIMULADOR.onOff[nombreEquipo] = 'pidiendo';
  SGADD_PBP.pedir(nombreEquipo).then((paq) => {
    const m = new Map();
    Object.keys((paq && paq.jugadores) || {}).forEach(id => {
      const oo = SGADD_PBP.onOffDe(paq, id);
      if (oo && oo.dif != null) m.set(simuladorNorm(paq.jugadores[id].n), oo);
    });
    SIMULADOR.onOff[nombreEquipo] = m;
    simuladorPintar();
  }).catch(() => { SIMULADOR.onOff[nombreEquipo] = 'sin'; });
}

function simuladorAlternarBajas(v) {
  SIMULADOR.aplicarBajas = !!v;
  simuladorPintar();
}

const simuladorFmt = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d).replace('.', ',');

/** El indicador de la cabecera: qué baja se aplicó y cuánto movió el margen. */
function simuladorBadgeBajas(r, hay) {
  if (!hay.local.length && !hay.visitante.length) return '';
  const b = r.bajas || {};
  const linea = (lado, nombreEq) => {
    const imp = b[lado];
    if (!imp || !imp.ok) return '';
    return imp.jugadores.map(j => {
      if (j.sinCosto) return `<li class="text-[11px] dato-sec">◆ Baja de <b>${escapeHtml(j.nombre)}</b> (${escapeHtml(nombreEq)}): el box score no le mide un costo, no se ajusta.</li>`;
      const ext = j.escala < 0.999 ? ` · jugó el ${Math.round(j.escala * 100)} % de los partidos` : '';
      const oo = j.fuente.indexOf('on/off') !== -1 ? ' · con On/Off' : '';
      return `<li class="text-[11px] text-white" title="ORTG ${simuladorFmt(j.ortg)} · DRTG ${simuladorFmt(j.drtg)} por 100 posesiones${ext}${oo}">⚠️ Ajustado por baja de <b>${escapeHtml(j.nombre)}</b> (${escapeHtml(nombreEq)}${j.motivo ? ' · ' + escapeHtml(j.motivo) : ''}): <span class="font-mono ${j.margen < 0 ? 'text-red-300' : 'text-green-300'}">${simuladorFmt(j.margen)} pts</span> en margen</li>`;
    }).join('') + (imp.reemplazo && imp.reemplazo.length ? `<li class="text-[10px] dato-sec">Sus minutos van a ${imp.reemplazo.map(x => escapeHtml(x.nombre) + ' (+' + x.minExtra.toFixed(1).replace('.', ',') + ' min)').join(', ')}.</li>` : '');
  };
  const total = (hay.local.length + hay.visitante.length);
  const control = `<label class="inline-flex items-center gap-2 text-[11px] dato-sec cursor-pointer">
      <input type="checkbox" ${SIMULADOR.aplicarBajas ? 'checked' : ''} onchange="simuladorAlternarBajas(this.checked)">
      Aplicar las bajas del buzón (${total})</label>`;
  if (!SIMULADOR.aplicarBajas || !b.aplicadas) {
    const nombres = hay.local.concat(hay.visitante).map(x => escapeHtml(x.nombre)).join(', ');
    return `<div class="mt-3 rounded-md border border-hairline p-2.5" data-bajas="apagadas">${control}
      <p class="text-[10px] dato-sec mt-1">Sin ajuste: el buzón marca ${nombres}.</p></div>`;
  }
  return `<div class="mt-3 rounded-md border border-yellow-400/40 bg-yellow-400/5 p-2.5" data-bajas="aplicadas">
      ${control}
      <ul class="mt-1.5 space-y-1">${linea('local', r.local)}${linea('visitante', r.visitante)}</ul>
      <p class="text-[10px] dato-sec mt-1.5">Margen sin las bajas ${simuladorFmt(b.margenSinBajas)} · con las bajas ${simuladorFmt(b.margenConBajas)}. Cada baja: sus jugadas pasan a su reemplazo y sus minutos a la rotación.</p>
    </div>`;
}

/* ===================== RUTEO ===================== */

function simuladorLeerRuta() {
  const r = SGADD.Ruta.parse(window.location.hash);
  if (r.seccion !== 'simulador') return null;
  if (r.planilla) SIMULADOR.planillaId = r.planilla;
  if (r.fase) SIMULADOR.fase = r.fase;
  SGADD_APP.aplicarTorneoRuta(r.torneo);
  SIMULADOR.equipoLocal = r.entidad || null;
  SIMULADOR.equipoVisitante = r.tab || null;
  /* Devuelve la ruta PARSEADA: quien llama necesita saber si la planilla
     vino de la URL en ESTA lectura, no si la sección guardó una de un
     render anterior (ver el build). */
  return r;
}

function simuladorEscribirRuta(reemplazar) {
  const h = SGADD.Ruta.build({
    planilla: SIMULADOR.planillaId, torneo: SGADD_APP.estado.torneo, fase: SIMULADOR.fase, seccion: 'simulador',
    entidad: SIMULADOR.equipoLocal, tab: SIMULADOR.equipoVisitante,
  });
  if (reemplazar) history.replaceState(null, '', h);
  else history.pushState(null, '', h);
}

function simuladorElegir(lado, clave) {
  if (lado === 'local') SIMULADOR.equipoLocal = clave || null;
  else SIMULADOR.equipoVisitante = clave || null;
  simuladorEscribirRuta(true);
  simuladorPintar();
}

function simuladorIntercambiar() {
  const tmp = SIMULADOR.equipoLocal;
  SIMULADOR.equipoLocal = SIMULADOR.equipoVisitante;
  SIMULADOR.equipoVisitante = tmp;
  simuladorEscribirRuta(true);
  simuladorPintar();
}

/* ===================== CARGA ===================== */

function buildSimulador() {
  SGADD_APP.inicializar();
  const r = simuladorLeerRuta();
  /* Solo lo que trae LA RUTA pisa la decisión global. Con la copia de la
     sección, cambiar de categoría en el selector la revertía al repintar. */
  if (r && r.planilla) SGADD_APP.estado.planillaId = r.planilla;
  if (r && r.fase) SGADD_APP.estado.fase = r.fase;
  setTimeout(() => SGADD_APP.cargar(), 0);
  return `<section id="simuladorRoot" class="space-y-5">${SGADD_APP.barra()}</section>`;
}

function simuladorCartel(txt, tono) {
  const c = tono === 'error' ? 'text-red-400' : 'text-muted';
  return `<div class="card rounded-xl p-8 border border-hairline text-center ${c} text-sm">${escapeHtml(txt)}</div>`;
}

/* ===================== RENDER ===================== */

function simuladorPintar() {
  const root = document.getElementById('simuladorRoot');
  if (!root) return;
  const st = SGADD_APP.estado;

  if (st.error) { root.innerHTML = SGADD_APP.barra() + SGADD_UI.aviso('No se pudo cargar', st.error, 'error'); return; }
  if (!st.idx) { root.innerHTML = SGADD_APP.barra() + SGADD_UI.cargando('Cargando la categoría…', (SGADD_APP.planillaActual() || {}).label); return; }

  /* EN UNA FASE DE ELIMINACIÓN EL MODELO SE ARMA CON LA REGULAR (v335): una
     serie de playoff no tiene muestra para ajustar ratings, localía ni
     pesos de los 4 factores, y el cruce de un cuarto de final con 1 partido
     por equipo daba «confianza 97 %» sobre nada. Las fases no se mezclan:
     la Regular entera es la vara, y la pantalla lo dice. */
  const reg = (typeof SGADD_APP.idxRegular === 'function') ? SGADD_APP.idxRegular() : null;
  const idx = reg || st.idx;
  SIMULADOR.planillaId = st.planillaId;
  SIMULADOR.fase = st.fase;
  const avisoFase = reg
    ? SGADD_UI.aviso('Modelo armado con la Regular',
        'Estás en una fase de eliminación (corta por diseño): el simulador proyecta con los ratings, la localía y los pesos de la ' + escapeHtml(SGADD_APP.etiquetaRegular() || 'Regular') + ' (' + (reg.liga.pjMediano || 0) + ' PJ mediano). Los partidos de esta fase no se mezclan en el modelo.')
    : '';

  root.innerHTML = [
    SGADD_APP.barra(),
    reg ? avisoFase : SGADD_APP.avisoMuestra(),
    simuladorSelectores(idx),
    simuladorResultado(idx),
    '<div id="simuladorCalibracion"></div>',
  ].filter(Boolean).join('');
  simuladorCargarCalibracion();
}

function simuladorSelectores(idx) {
  const equipos = idx.lista().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const opciones = (seleccionado) => equipos.map(e =>
    `<option value="${escapeAttr(e.clave)}" ${seleccionado === e.clave ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`
  ).join('');

  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h3 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Simulador de enfrentamientos</h3>
      <p class="text-[11px] text-muted mb-4">
        Elegí dos equipos de la liga activa. La proyección sale de los 4 factores
        (eFG%, pérdidas, rebote ofensivo, tiro libre) pesados por regresión sobre
        los partidos de la temporada, no de un promedio a ojo.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Local</label>
          <select onchange="simuladorElegir('local', this.value)"
            class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
            <option value="">Elegir equipo…</option>
            ${opciones(SIMULADOR.equipoLocal)}
          </select>
        </div>
        <button type="button" onclick="simuladorIntercambiar()" title="Invertir local/visitante"
          class="shrink-0 justify-self-center text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-3 py-2.5 hover:bg-surface2 transition-colors">
          ⇄
        </button>
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Visitante</label>
          <select onchange="simuladorElegir('visitante', this.value)"
            class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
            <option value="">Elegir equipo…</option>
            ${opciones(SIMULADOR.equipoVisitante)}
          </select>
        </div>
      </div>
    </div>`;
}

/** Una fila del gráfico comparativo: dos barras horizontales (Local arriba,
    Visitante abajo) escaladas al mayor de los dos valores. HTML/CSS puro
    (no Chart.js): el simulador ya tiene tres unidades distintas en la misma
    ficha (%, pts, pts de impacto) y forzarlas a un solo canvas complica más
    de lo que aporta frente a barras de ancho proporcional. */
function filaComparativa(etiqueta, valL, valV, nombreL, nombreV, formatear) {
  const max = Math.max(Math.abs(valL), Math.abs(valV), 1e-6);
  const pctL = Math.max(4, Math.abs(valL) / max * 100);
  const pctV = Math.max(4, Math.abs(valV) / max * 100);
  const favoreceL = valL >= valV;
  const fila = (nombre, pct, valor, esFavorito, colorFavorito) => `
    <div class="flex items-center gap-2 ${esFavorito !== undefined ? 'mb-1' : ''}">
      <span class="w-24 sm:w-28 shrink-0 text-[11px] truncate ${esFavorito ? colorFavorito + ' font-semibold' : 'dato-sec'}" title="${escapeAttr(nombre)}">${escapeHtml(nombre)}</span>
      <div class="flex-1 h-2.5 rounded-full bg-surface2 overflow-hidden min-w-0">
        <div class="h-full rounded-full" style="width:${pct.toFixed(0)}%;background:${esFavorito ? (colorFavorito === 'text-accent' ? 'var(--acento)' : '#60a5fa') : 'rgba(148,163,184,0.35)'}"></div>
      </div>
      <span class="w-16 shrink-0 text-right font-mono text-[11px] text-ink">${escapeHtml(formatear(valor))}</span>
    </div>`;
  return `
    <div class="py-2">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1.5">${escapeHtml(etiqueta)}</p>
      ${fila(nombreL, pctL, valL, favoreceL, 'text-accent')}
      ${fila(nombreV, pctV, valV, !favoreceL, 'text-blue-400')}
    </div>`;
}

function simuladorResultado(idx) {
  if (!SIMULADOR.equipoLocal || !SIMULADOR.equipoVisitante) return '';

  const eqL = idx.get(SIMULADOR.equipoLocal), eqV = idx.get(SIMULADOR.equipoVisitante);
  const hay = { local: eqL ? simuladorBajasDe(idx, eqL.clave) : [], visitante: eqV ? simuladorBajasDe(idx, eqV.clave) : [] };
  if (hay.local.length && eqL) simuladorPedirOnOff(eqL.nombre);
  if (hay.visitante.length && eqV) simuladorPedirOnOff(eqV.nombre);
  const r = SGADD_4F.simularEnfrentamiento(idx, SIMULADOR.equipoLocal, SIMULADOR.equipoVisitante,
    SIMULADOR.aplicarBajas ? { bajasLocal: hay.local, bajasVisitante: hay.visitante } : null);
  if (!r.ok) return SGADD_UI.aviso('No se pudo simular', r.motivo, 'error');

  const logoL = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(r.local) : null;
  const logoV = (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(r.visitante) : null;
  /* r.confianza = confianzaLogistica(margen) es SIEMPRE la probabilidad de
     que gane el LOCAL (monótona creciente en margen = scoreLocal-scoreVisitante,
     ver test 4). La confianza "del ganador" que se muestra en la cabecera
     tiene que invertirse cuando gana el visitante, si no queda un cartel
     que dice "gana Atenas, confianza 37%" con el propio modelo diciendo
     lo contrario. */
  const probLocal = r.confianza;
  const probVisitante = 1 - r.confianza;
  const confianzaGanador = r.margen >= 0 ? probLocal : probVisitante;
  const impactoTotalL = r.duelos.reduce((s, d) => s + d.impactoL, 0);
  const impactoTotalV = r.duelos.reduce((s, d) => s + d.impactoV, 0);

  /* ===================== 🏆 Cabecera: ganador / confianza / margen ===================== */
  const marcador = (nombre, logo, score, esGanador) => `
    <div class="flex-1 min-w-0 text-center">
      ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-12 h-12 object-contain mx-auto mb-1">` : ''}
      <p class="text-[11px] uppercase tracking-wider truncate ${esGanador ? 'text-accent font-semibold' : 'dato-sec'}">${escapeHtml(nombre)}</p>
      <p class="font-display text-3xl sm:text-4xl leading-none mt-1" style="color:#fff">${Math.round(score)}</p>
    </div>`;

  const cabecera = `
    <div class="rounded-lg border ${r.margen >= 0 ? 'border-accent/40' : 'border-hairline'} bg-surface2/30 p-4">
      <p class="text-[10px] uppercase tracking-widest dato-sec text-center mb-3">
        🏆 Ganador estimado: <span class="text-accent font-semibold">${escapeHtml(r.ganador)}</span> ·
        🎯 confianza ${(confianzaGanador * 100).toFixed(1)}% ·
        📏 margen ${Math.abs(r.margen).toFixed(1)} pts
      </p>
      <div class="flex items-center gap-3">
        ${marcador(r.local, logoL, r.scoreLocal, r.margen >= 0)}
        <span class="dato-sec text-sm shrink-0">—</span>
        ${marcador(r.visitante, logoV, r.scoreVisitante, r.margen < 0)}
      </div>
      ${r.empateResuelto ? `<p class="text-[10px] text-muted text-center mt-3 leading-snug">
        El modelo proyectaba un resultado sin margen claro (en básquet no hay empates): se resolvió
        con la fuerza de temporada (Net Rating) y la ventaja de localía, el mismo criterio que ya
        usa el resto del cálculo.</p>` : ''}
      ${simuladorBadgeBajas(r, hay)}
    </div>`;

  /* ===================== 📊 Gráfico comparativo ===================== */
  const graficoComparativo = `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-1">📊 Comparativa 360°</h5>
      <p class="text-[11px] text-muted mb-1">Probabilidad, puntos proyectados e impacto neto de los 4 factores, lado a lado.</p>
      ${filaComparativa('Probabilidad de victoria', probLocal * 100, probVisitante * 100, r.local, r.visitante, v => v.toFixed(0) + '%')}
      ${filaComparativa('Puntos proyectados', r.scoreLocal, r.scoreVisitante, r.local, r.visitante, v => Math.round(v) + ' pts')}
      ${filaComparativa('Impacto neto de los 4 factores', impactoTotalL, impactoTotalV, r.local, r.visitante, v => (v >= 0 ? '+' : '') + v.toFixed(1))}
    </div>`;

  /* ===================== 🏠 Localía y ritmo del cruce ===================== */
  /* ===================== 🎲 Monte Carlo: la curva del margen ===================== */
  const mc = r.modelo.mc;
  const maxBarra = Math.max(...mc.histograma.map(b => b.p), 1e-9);
  const barras = mc.histograma.map(b => {
    const centro = (b.desde + b.hasta) / 2;
    return `<div title="${b.desde} a ${b.hasta} pts: ${(b.p * 100).toFixed(1)} % de las simulaciones" style="flex:1 1 0;min-width:2px;height:${Math.max(2, b.p / maxBarra * 100).toFixed(0)}%;background:${centro > 0 ? 'var(--acento-fondo, #f7941e)' : '#60a5fa'};opacity:.85"></div>`;
  }).join('');
  const fichaMonteCarlo = `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-1">🎲 Simulación Monte Carlo · ${mc.n.toLocaleString('es-AR')} partidos</h5>
      <p class="text-sm text-white mt-1"><b>${escapeHtml(r.local)}</b> ganó ${(mc.pLocal * 100).toFixed(1).replace('.', ',')} % de las simulaciones (${mc.ganadasLocal.toLocaleString('es-AR')} de ${mc.n.toLocaleString('es-AR')}); ${escapeHtml(r.visitante)}, el ${((1 - mc.pLocal) * 100).toFixed(1).replace('.', ',')} %.</p>
      <div style="display:flex;align-items:flex-end;gap:1px;height:84px;margin-top:10px" role="img" aria-label="Distribución del margen proyectado, de ${mc.histograma[0].desde} a ${mc.histograma[mc.histograma.length - 1].hasta} puntos">${barras}</div>
      <div class="flex justify-between text-[10px] dato-sec font-mono mt-1"><span>${mc.histograma[0].desde} pts</span><span>0 · empate</span><span>+${mc.histograma[mc.histograma.length - 1].hasta} pts</span></div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        <div class="bg-surface2/50 rounded-lg p-2.5"><p class="text-[10px] uppercase tracking-wider text-muted font-display">Margen (80 % de los casos)</p><p class="text-sm text-white font-mono">${mc.margenP10.toFixed(0)} a +${mc.margenP90.toFixed(0)} · mediana ${mc.margenP50 >= 0 ? '+' : ''}${mc.margenP50.toFixed(1)}</p></div>
        <div class="bg-surface2/50 rounded-lg p-2.5"><p class="text-[10px] uppercase tracking-wider text-muted font-display truncate">${escapeHtml(r.local)} · puntos</p><p class="text-sm text-white font-mono">${mc.ptsLocal.p10.toFixed(0)} a ${mc.ptsLocal.p90.toFixed(0)} · mediana ${mc.ptsLocal.p50.toFixed(0)}</p></div>
        <div class="bg-surface2/50 rounded-lg p-2.5"><p class="text-[10px] uppercase tracking-wider text-muted font-display truncate">${escapeHtml(r.visitante)} · puntos</p><p class="text-sm text-white font-mono">${mc.ptsVisitante.p10.toFixed(0)} a ${mc.ptsVisitante.p90.toFixed(0)} · mediana ${mc.ptsVisitante.p50.toFixed(0)}</p></div>
      </div>
      <p class="text-[10px] dato-sec mt-2 leading-snug">Cada partido sortea ritmo y ORTG de los dos lados con la dispersión de noche a noche de cada equipo, calibrada con el error fuera de muestra del modelo (${mc.sigma.toFixed(1)} pts). Un empate se resuelve en prórroga. Con cada fecha nueva el modelo se reajusta solo.</p>
    </div>`;

  const fichaLocalia = `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">🏠 Bonus de localía / ventaja de cancha</p>
      <p class="text-xl text-white font-display mt-0.5">+${r.bonusLocalia.toFixed(1)} pts</p>
      <p class="text-[10px] dato-sec mt-1">${r.modelo.hcaClub ? `localía propia de ${escapeHtml(r.local)}: rinde ${r.modelo.hcaClub.valor.toFixed(1)} de local contra ${r.modelo.hcaLiga.toFixed(1)} de la liga (${r.modelo.hcaClub.n} partidos en casa, credibilidad ${(r.modelo.hcaClub.z * 100).toFixed(0)} %)` : `sin partidos en casa suficientes: rige la localía de la liga`}</p>
      <div class="border-t border-hairline/40 mt-2 pt-2 space-y-0.5">
        <p class="text-[11px] text-ink font-mono">Ritmo esperado del cruce: <span class="text-white">${r.paceEsperado.toFixed(1)}</span> posesiones</p>
        <p class="text-[11px] text-ink font-mono">Eficiencia esperada: ${escapeHtml(r.local)} <span class="text-white">${r.ortgEsperadoLocal.toFixed(1)}</span> ORTG · ${escapeHtml(r.visitante)} <span class="text-white">${r.ortgEsperadoVisitante.toFixed(1)}</span> ORTG (por 100 posesiones)</p>
      </div>
    </div>`;

  /* ===================== ⚡ Power Ranking / Net Rating ===================== */
  const netRatingFmt = (v) => v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1);
  const fichaNetRating = `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">⚡ Fuerza de temporada (Net Rating)</p>
      <p class="text-[11px] text-ink font-mono mt-1">${escapeHtml(r.local)}: <span class="text-white">${netRatingFmt(r.netRatingLocal)}</span> · ${escapeHtml(r.visitante)}: <span class="text-white">${netRatingFmt(r.netRatingVisitante)}</span></p>
      <p class="text-[10px] dato-sec mt-1.5">Es la base del margen (ritmo × diferencia de ratings por posesión): no se suma aparte. Ratings ajustados por la calidad de los rivales enfrentados (calendario ${r.modelo.sosLocal >= 0 ? '+' : ''}${r.modelo.sosLocal.toFixed(1)} ${escapeHtml(r.local)} · ${r.modelo.sosVisitante >= 0 ? '+' : ''}${r.modelo.sosVisitante.toFixed(1)} ${escapeHtml(r.visitante)} de ORTG: positivo = enfrentó defensas flojas) y encogidos hacia la media de la liga — credibilidad ${(r.modelo.credibilidadLocal * 100).toFixed(0)} % ${escapeHtml(r.local)} · ${(r.modelo.credibilidadVisitante * 100).toFixed(0)} % ${escapeHtml(r.visitante)}.</p>
    </div>`;

  /* ===================== 📊 Influencia de los 4 factores en esta liga ===================== */
  const pesosLiga = SGADD_4F.pesosPorFactor(idx);
  const maxPeso = Math.max(...SGADD_4F.FACTORES_NET.map(def => Math.abs(pesosLiga.pesos[def.id] || 0)), 1e-6);
  const filasPesos = SGADD_4F.FACTORES_NET.map(def => {
    const w = pesosLiga.pesos[def.id] || 0;
    const pct = Math.max(4, Math.abs(w) / maxPeso * 100);
    return `
      <div class="flex items-center gap-2 py-1">
        <span class="w-40 sm:w-48 shrink-0 text-[11px] text-muted truncate">${escapeHtml(def.label)} <span class="dato-sec">(${escapeHtml(def.id)})</span></span>
        <div class="flex-1 h-2 rounded-full bg-surface2 overflow-hidden min-w-0">
          <div class="h-full rounded-full" style="width:${pct.toFixed(0)}%;background:${w >= 0 ? '#22c55e' : '#ef4444'}"></div>
        </div>
        <span class="w-14 shrink-0 text-right font-mono text-[11px] text-ink">${w.toFixed(2)}</span>
      </div>`;
  }).join('');
  const notaMetodo = r.metodoPesos === 'bayes-oliver'
    ? `Pesos de Dean Oliver corregidos con ${r.nLiga} partidos de la liga (R² ${r.rLiga2.toFixed(2)}); la liga pesa ${(r.modelo.credibilidadPesos * 100).toFixed(0)} % y el prior de Oliver el resto. Crece sola con cada partido.`
    : `Todavía no hay partidos suficientes en la liga: se usan los pesos de Dean Oliver (eFG% 40 · pérdidas 25 · rebote ofensivo 20 · libres 15) escalados al margen.`;
  const fichaInfluencia = `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
      <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-1">📊 Desglose de influencia de la liga</h5>
      <p class="text-[11px] text-muted mb-3">Cuánto pesa cada factor sobre el margen final en esta liga (no en general).</p>
      ${filasPesos}
      <p class="text-[11px] text-muted mt-3 leading-snug">${notaMetodo}</p>
    </div>`;

  /* ===================== ⚔️ Duelos tácticos cruzados ===================== */
  const filasDuelos = r.duelos.slice().sort((a, b) => Math.abs(b.impactoL - b.impactoV) - Math.abs(a.impactoL - a.impactoV)).map(d => {
    const favoreceLocal = d.impactoL >= d.impactoV;
    const ventajaL = d.netL !== null && d.netL > 0;
    const ventajaV = d.netV !== null && d.netV > 0;
    return `
      <tr class="border-b border-hairline/40 last:border-0 ${d.id === r.factorClave.id ? 'bg-accent/5' : ''}">
        <td class="py-1.5 pr-3 text-xs text-white">${escapeHtml(d.label)}${d.id === r.factorClave.id ? ' <span class="text-accent">★</span>' : ''}</td>
        <td class="py-1.5 pr-3 font-mono text-xs text-ink">${ventajaL ? '✅' : '❌'} ${escapeHtml(SGADD.formatear(d.id, d.propioL))} <span class="dato-sec">vs</span> ${escapeHtml(SGADD.formatear(d.idOpp || d.id, d.defV))}</td>
        <td class="py-1.5 pr-3 font-mono text-xs text-ink">${ventajaV ? '✅' : '❌'} ${escapeHtml(SGADD.formatear(d.id, d.propioV))} <span class="dato-sec">vs</span> ${escapeHtml(SGADD.formatear(d.idOpp || d.id, d.defL))}</td>
        <td class="py-1.5 font-mono text-xs ${favoreceLocal ? 'text-accent' : 'text-blue-400'}">${favoreceLocal ? '◀' : '▶'} ${Math.abs(d.impactoL - d.impactoV).toFixed(1)} pts</td>
      </tr>`;
  }).join('');

  const matrizL = SGADD_4F.matrizVolumenEficiencia(idx, r.claveLocal);
  const matrizV = SGADD_4F.matrizVolumenEficiencia(idx, r.claveVisitante);
  const badgeMatriz = (m, nombre) => !m ? '' : `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display truncate">${escapeHtml(nombre)}</p>
      <p class="text-sm text-white font-medium mt-0.5">${escapeHtml(m.etiqueta)}</p>
      <p class="text-[10px] dato-sec font-mono mt-1">volumen pctil ${m.volumen.percentil.toFixed(0)} · eficiencia pctil ${m.eficiencia.percentil.toFixed(0)}</p>
    </div>`;

  const notaMuestra = [
    r.usoHistoriaCompletaLocal ? escapeHtml(r.local) + ' no llega a ' + SGADD_4F.MIN_PARTIDOS_CONDICION + ' partidos de local: se usó toda su temporada (' + r.muestraLocal + ' PJ).' : '',
    r.usoHistoriaCompletaVisitante ? escapeHtml(r.visitante) + ' no llega a ' + SGADD_4F.MIN_PARTIDOS_CONDICION + ' partidos de visitante: se usó toda su temporada (' + r.muestraVisitante + ' PJ).' : '',
  ].filter(Boolean).join(' ');

  return `
    <div class="space-y-5">
      ${cabecera}
      ${graficoComparativo}
      ${fichaMonteCarlo}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${fichaLocalia}
        ${fichaNetRating}
      </div>
      ${fichaInfluencia}
      <div class="card rounded-xl p-4 sm:p-5 border border-hairline">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-2">⚔️ Duelos tácticos cruzados</h5>
        <p class="text-[11px] text-muted mb-3">★ marca el factor con más impacto en el margen. ✅/❌ indica si ese ataque supera a esa defensa. ◀ favorece al local, ▶ al visitante.</p>
        <div class="scrollbox"><table class="w-full text-left">
          <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
            <th class="pb-1 pr-3">Factor</th><th class="pb-1 pr-3">Ataque ${escapeHtml(r.local)} vs Defensa ${escapeHtml(r.visitante)}</th>
            <th class="pb-1 pr-3">Ataque ${escapeHtml(r.visitante)} vs Defensa ${escapeHtml(r.local)}</th><th class="pb-1">Impacto</th>
          </tr></thead><tbody>${filasDuelos}</tbody></table></div>
        <p class="text-[11px] text-muted mt-3 leading-snug">
          Margen proyectado: ${r.margen >= 0 ? '+' : ''}${r.margen.toFixed(1)} pts para ${escapeHtml(r.local)}.
          Por posesiones ${r.modelo.reconciliacion.margenPosesiones.toFixed(1)} = 4 factores ${r.modelo.reconciliacion.sumaFactores.toFixed(1)} + otros ${r.modelo.reconciliacion.residual.toFixed(1)}; más localía ${r.modelo.reconciliacion.localia.toFixed(1)}${r.modelo.reconciliacion.ajusteEmpate ? ' y ' + r.modelo.reconciliacion.ajusteEmpate.toFixed(1) + ' del desempate' : ''}.
        </p>
        <p class="text-[11px] text-muted mt-1 leading-snug">Rango razonable del margen (80 % de las simulaciones): de ${r.modelo.margenP10.toFixed(0)} a ${r.modelo.margenP90.toFixed(0)}. Probabilidad del local: ${(r.modelo.probabilidadMC * 100).toFixed(0)} %.</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${badgeMatriz(matrizL, r.local + ' · eficiencia vs. volumen')}
        ${badgeMatriz(matrizV, r.visitante + ' · eficiencia vs. volumen')}
      </div>
      ${notaMuestra ? `<p class="text-[11px] text-muted leading-snug">${notaMuestra}</p>` : ''}
    </div>`;
}


/* ===================== 📈 CALIBRACIÓN · lo simulado contra lo que pasó (punto 171) =====================
   Las predicciones las congela el cron `/api/cron/predicciones` ANTES de
   cada partido (HSETNX: no se reescriben), y acá se cruzan con el
   resultado del libro. La base del cruce es la temporada completa
   (`idxTemporada`), así un partido de playoff también se evalúa. */
const SIM_CALIB = { clave: null, preds: null, error: null };

function simuladorContextoTorneo() {
  const p = (typeof SGADD_APP !== 'undefined' && SGADD_APP.planillaActual) ? SGADD_APP.planillaActual() : null;
  return p && p.torneoId ? { torneo: p.torneoId, zona: p.zonaId || '' } : null;
}

function simuladorCargarCalibracion() {
  const el = (typeof document !== 'undefined') ? document.getElementById('simuladorCalibracion') : null;
  if (!el) return;
  const ctx = simuladorContextoTorneo();
  if (!ctx || typeof SGADD_PREDICCIONES === 'undefined') { el.innerHTML = simuladorCalibracionHtml(null, null); return; }
  if (typeof SGADD_DATA === 'undefined' || !SGADD_DATA.prediccionesDeZona) { el.innerHTML = ''; return; }
  const k = ctx.torneo + '|' + ctx.zona;
  const pintar = () => {
    const e2 = document.getElementById('simuladorCalibracion');
    if (!e2) return;
    if (SIM_CALIB.error) { e2.innerHTML = SGADD_UI.aviso('No se pudieron leer las predicciones', SIM_CALIB.error, 'error'); return; }
    if (!SIM_CALIB.preds) { e2.innerHTML = SGADD_UI.cargando('Leyendo las predicciones congeladas…'); return; }
    const t = (typeof SGADD_APP.idxTemporada === 'function') ? SGADD_APP.idxTemporada() : null;
    const base = (t && t.idx) || SGADD_APP.estado.idx;
    e2.innerHTML = simuladorCalibracionHtml(SGADD_PREDICCIONES.cruzar(SIM_CALIB.preds, base), ctx);
  };
  if (SIM_CALIB.clave === k && (SIM_CALIB.preds || SIM_CALIB.error)) { pintar(); return; }
  SIM_CALIB.clave = k; SIM_CALIB.preds = null; SIM_CALIB.error = null;
  pintar();
  SGADD_DATA.prediccionesDeZona(ctx.torneo, ctx.zona).then((r) => {
    if (SIM_CALIB.clave !== k) return;
    SIM_CALIB.preds = (r && r.predicciones) || [];
    pintar();
  }, (e) => {
    if (SIM_CALIB.clave !== k) return;
    SIM_CALIB.error = (e && e.message) || 'Error desconocido.';
    pintar();
  });
}

/** PURA: la card, con las filas de `SGADD_PREDICCIONES.cruzar`. */
function simuladorCalibracionHtml(filas, ctx) {
  const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ENT[c]);
  const P = (typeof SGADD_PREDICCIONES !== 'undefined') ? SGADD_PREDICCIONES
    : (typeof require === 'function' ? require('./sgadd-predicciones.js') : null);
  const titulo = '<h3 class="font-display text-lg text-ink">📈 Calibración del modelo · lo simulado contra lo que pasó</h3>';
  const caja = (cuerpo) => '<section class="card rounded-xl p-5 border border-hairline space-y-3" data-calibracion>' + titulo + cuerpo + '</section>';
  const nota = (t) => '<p class="text-xs text-muted leading-snug">' + t + '</p>';
  const aviso = (t, txt) => (typeof SGADD_UI !== 'undefined' && SGADD_UI.aviso) ? SGADD_UI.aviso(t, txt)
    : '<p class="text-xs" style="color:#fbbf24">⚠ ' + t + ': ' + txt + '</p>';
  if (!ctx) return caja(nota('Esta categoría no está enganchada a un torneo con fixture: no hay partidos programados que congelar.'));
  const lista = filas || [];
  if (!lista.length) {
    return caja(nota('Todavía no hay predicciones congeladas para esta zona. El cron las congela una vez por día, para los partidos programados de hoy a ' + P.DIAS_ANTES + ' días, con el modelo ' + esc(P.VERSION) + '.'));
  }
  const s = P.resumen(lista);
  const pct = (v) => (typeof v === 'number' ? Math.round(v * 100) + ' %' : '—');
  const num = (v, d) => (typeof v === 'number' ? v.toFixed(d === undefined ? 1 : d).replace('.', ',') : '—');
  const signo = (v) => (typeof v === 'number' ? (v > 0 ? '+' : '') + num(v) : '—');
  const ficha = (rot, val, sub) => '<div class="rounded-lg border border-hairline bg-surface2/30 p-3"><p class="text-[10px] uppercase tracking-widest dato-sec">' + rot
    + '</p><p class="font-display text-2xl text-ink leading-none mt-1">' + val + '</p><p class="text-[11px] text-muted mt-1">' + sub + '</p></div>';
  const tabla = (cab, cuerpo) => '<div class="scrollbox"><table class="w-full text-xs"><thead><tr>' + cab.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' + cuerpo + '</tbody></table></div>';
  const partes = [nota('Cada predicción se congela ANTES del partido y no se reescribe: lo que se ve es lo que el modelo dijo de verdad. Modelo vigente: ' + esc(P.VERSION) + '.')];
  if (!s.n) {
    partes.push(nota(lista.length + ' predicción(es) congelada(s), ninguna jugada todavía.'));
  } else {
    if (!s.suficiente) partes.push(aviso('Muestra corta', 'Con ' + s.n + ' partido(s) evaluado(s) todavía no alcanza para leer la calibración: hacen falta ' + s.minimo + '. Los números se muestran igual.'));
    partes.push('<div class="grid grid-cols-2 gap-3">'
      + ficha('Evaluadas', String(s.n), s.pendientes + ' pendiente(s)')
      + ficha('Error medio (MAE)', num(s.mae) + ' pts', 'RMSE ' + num(s.rmse) + ' · sesgo ' + signo(s.sesgo) + ' (+ = sobreestima al local)')
      + ficha('Acierta el ganador', pct(s.aciertos), '«siempre gana el local»: ' + pct(s.ganaLocal))
      + ficha('Dentro del rango P10-P90', pct(s.cobertura80), 'un modelo calibrado anda cerca de 80 %')
      + ficha('Brier', num(s.brier, 3), 'decir 50 % siempre da 0,250 · menos es mejor')
      + '</div>');
    const filasCal = s.calibracion.filter(c => c.n).map(c => '<tr><td>' + pct(c.desde) + '–' + pct(c.hasta) + '</td><td>' + c.n + '</td><td>' + pct(c.prob) + '</td><td>' + pct(c.real) + '</td></tr>').join('');
    if (filasCal) partes.push(tabla(['Confianza en el favorito', 'Partidos', 'Dijo', 'Ganó el favorito'], filasCal));
    const filasEq = s.porEquipo.slice(0, 8).map(e => '<tr><td>' + esc(e.nombre) + '</td><td>' + e.n + '</td><td>' + num(e.mae) + '</td><td>' + signo(e.sesgo) + '</td><td>' + num(e.ultimos.mae) + ' (' + e.ultimos.n + ')</td></tr>').join('');
    partes.push('<details class="hub-plegable"><summary class="text-sm text-ink cursor-pointer">Por equipo · dónde más se equivoca</summary>'
      + nota('Sesgo desde el lado del equipo: positivo = el modelo lo sobreestimó. Últimos 4 = su último ciclo.')
      + tabla(['Equipo', 'Partidos', 'MAE', 'Sesgo', 'Últimos 4'], filasEq) + '</details>');
  }
  const ultimas = lista.slice(-15).reverse().map((f) => {
    const p = f.pred, e = f.eval;
    const realTxt = e ? (e.ptsLocal + '–' + e.ptsVisitante + ' (' + signo(e.margenReal) + ')') : 'por jugarse';
    const ver = e ? (e.acierto ? '✓' : '✗') + ' ' + signo(e.error) : '◆';
    return '<tr><td class="font-mono">' + esc(p.fecha) + '</td><td>' + esc(p.local) + ' vs ' + esc(p.visitante) + '</td><td class="font-mono">'
      + signo(p.margen) + ' · local ' + pct(p.pLocal) + '</td><td class="font-mono">' + realTxt + '</td><td class="font-mono">' + ver + '</td></tr>';
  }).join('');
  partes.push(tabla(['Fecha', 'Cruce', 'Predicho', 'Real', 'Error'], ultimas));
  return caja(partes.join(''));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign({}, SGADD_4F, {
    SIMULADOR, simuladorLeerRuta, simuladorEscribirRuta,
    simuladorCalibracionHtml,
  });
}
