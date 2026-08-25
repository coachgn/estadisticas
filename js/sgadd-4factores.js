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
    const datos = datosRegresionLiga(idx);
    const reg = regresionMultiple(datos.X, datos.y);
    if (reg.ok) {
      const pesos = {};
      FACTORES_NET.forEach((def, i) => { pesos[def.id] = reg.coeficientes[i]; });
      return { metodo: 'regresion', n: reg.n, r2: reg.r2, pesos: pesos };
    }

    const pesos = {};
    FACTORES_NET.forEach((def, i) => {
      const xs = datos.X.map(fila => fila[i]);
      const simple = regresionSimple(xs, datos.y);
      pesos[def.id] = simple.ok ? simple.pendiente : 0;
    });
    return { metodo: 'correlacion', motivo: reg.motivo, n: datos.X.length, pesos: pesos };
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

  /**
   * Simula LOCAL vs VISITANTE. Devuelve { ok:false, motivo } si falta
   * muestra, o el desglose completo si se pudo simular.
   */
  function simularEnfrentamiento(idx, claveLocal, claveVisitante) {
    const eL = idx.get(claveLocal), eV = idx.get(claveVisitante);
    if (!eL || !eV) return { ok: false, motivo: 'Alguno de los dos equipos no existe en esta liga.' };
    if (eL.clave === eV.clave) return { ok: false, motivo: 'Elegí dos equipos distintos.' };

    const perfL = perfilEquipoSimulacion(idx, claveLocal, 'LOCAL');
    const perfV = perfilEquipoSimulacion(idx, claveVisitante, 'VISITANTE');
    if (!perfL || !perfV || perfL.pace === null || perfV.pace === null ||
        perfL.pppOf === null || perfV.pppOf === null || perfL.pppDef === null || perfV.pppDef === null) {
      return { ok: false, motivo: 'Alguno de los dos equipos no tiene partidos suficientes para simular.' };
    }

    const pesosLiga = pesosPorFactor(idx);

    const duelos = FACTORES_NET.map(def => {
      const netL = netFactor(def, perfL[def.id], perfV[def.idOpp]);
      const netV = netFactor(def, perfV[def.id], perfL[def.idOpp]);
      const peso = pesosLiga.pesos[def.id] || 0;
      return {
        id: def.id, label: def.label,
        netL: netL, netV: netV,
        impactoL: netL !== null ? netL * peso : 0,
        impactoV: netV !== null ? netV * peso : 0,
        propioL: perfL[def.id], defV: perfV[def.idOpp],
        propioV: perfV[def.id], defL: perfL[def.idOpp],
      };
    });

    const impactoTotalL = duelos.reduce((s, d) => s + d.impactoL, 0);
    const impactoTotalV = duelos.reduce((s, d) => s + d.impactoV, 0);

    /* Ritmo esperado del cruce: promedio del PACE de temporada de los dos
       (identidad real de básquet: puntos = posesiones × eficiencia). */
    const paceEsperado = (perfL.pace + perfV.pace) / 2;

    /* Eficiencia cruzada: el ataque (condición-específico: de local para
       L, de visitante para V) contra la defensa específica del rival en
       SU condición — no el promedio simétrico de las dos ofensivas. */
    const pppEsperadoL = (perfL.pppOf + perfV.pppDef) / 2;
    const pppEsperadoV = (perfV.pppOf + perfL.pppDef) / 2;
    const baseL = paceEsperado * pppEsperadoL;
    const baseV = paceEsperado * pppEsperadoV;

    /* Power Ranking / Net Rating: prior de fortaleza general, atenuado. */
    const netRatingL = perfL.netRating !== null ? perfL.netRating : 0;
    const netRatingV = perfV.netRating !== null ? perfV.netRating : 0;
    const diffNetRating = netRatingL - netRatingV;
    const ajusteNetRating = diffNetRating * ESCALA_NET_RATING;

    /* Bonus ADITIVO (no multiplicativo: la ventaja de jugar en casa no
       escala con lo bueno que sea el equipo), modulado por la ventaja de
       localía real de esta liga. Es un residuo: los perfiles L/V
       condición-específicos de arriba ya capturan buena parte del efecto
       propio de cada equipo, esto cubre lo que un plantel con pocos
       partidos en casa todavía no alcanza a mostrar en su propia muestra. */
    const bonusLocalia = BONUS_LOCALIA_PUNTOS * (1 + ventajaLocaliaLiga(idx) * 4);

    const scoreCrudoL = baseL + impactoTotalL + ajusteNetRating / 2 + bonusLocalia;
    const scoreCrudoV = baseV + impactoTotalV - ajusteNetRating / 2;

    /* Regla anti-empate: la señal de desempate es la misma que ya calculó
       el modelo (Net Rating + localía), no un número nuevo inventado
       para la ocasión. */
    const desempate = resolverEmpate(scoreCrudoL, scoreCrudoV, diffNetRating + bonusLocalia);
    const scoreL = desempate.scoreL, scoreV = desempate.scoreV, margen = desempate.margen;
    const empateResuelto = desempate.resuelto;

    const ganadorLocal = margen >= 0;
    const confianza = confianzaLogistica(margen);

    const factorClave = duelos.slice().sort((a, b) =>
      Math.abs(b.impactoL - b.impactoV) - Math.abs(a.impactoL - a.impactoV))[0];

    return {
      ok: true,
      local: eL.nombre, visitante: eV.nombre,
      claveLocal: eL.clave, claveVisitante: eV.clave,
      scoreLocal: scoreL, scoreVisitante: scoreV,
      margen: margen,
      empateResuelto: empateResuelto,
      ganador: ganadorLocal ? eL.nombre : eV.nombre,
      confianza: confianza,
      duelos: duelos,
      factorClave: factorClave,
      paceEsperado: paceEsperado,
      pppEsperadoLocal: pppEsperadoL, pppEsperadoVisitante: pppEsperadoV,
      netRatingLocal: perfL.netRating, netRatingVisitante: perfV.netRating, ajusteNetRating: ajusteNetRating,
      bonusLocalia: bonusLocalia,
      metodoPesos: pesosLiga.metodo, rLiga2: pesosLiga.r2, nLiga: pesosLiga.n,
      muestraLocal: perfL.pj, muestraVisitante: perfV.pj,
      usoHistoriaCompletaLocal: perfL.usoHistoriaCompleta,
      usoHistoriaCompletaVisitante: perfV.usoHistoriaCompleta,
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
};

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

  const idx = st.idx;
  SIMULADOR.planillaId = st.planillaId;
  SIMULADOR.fase = st.fase;

  root.innerHTML = [
    SGADD_APP.barra(),
    SGADD_APP.avisoMuestra(),
    simuladorSelectores(idx),
    simuladorResultado(idx),
  ].filter(Boolean).join('');
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

  const r = SGADD_4F.simularEnfrentamiento(idx, SIMULADOR.equipoLocal, SIMULADOR.equipoVisitante);
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
  const fichaLocalia = `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">🏠 Bonus de localía / ventaja de cancha</p>
      <p class="text-xl text-white font-display mt-0.5">+${r.bonusLocalia.toFixed(1)} pts</p>
      <p class="text-[10px] dato-sec mt-1">aditivo para ${escapeHtml(r.local)}, calibrado con la ventaja de localía real de esta liga</p>
      <div class="border-t border-hairline/40 mt-2 pt-2 space-y-0.5">
        <p class="text-[11px] text-ink font-mono">Ritmo esperado del cruce: <span class="text-white">${r.paceEsperado.toFixed(1)}</span> posesiones</p>
        <p class="text-[11px] text-ink font-mono">Eficiencia esperada: ${escapeHtml(r.local)} <span class="text-white">${r.pppEsperadoLocal.toFixed(2)}</span> PPP · ${escapeHtml(r.visitante)} <span class="text-white">${r.pppEsperadoVisitante.toFixed(2)}</span> PPP</p>
      </div>
    </div>`;

  /* ===================== ⚡ Power Ranking / Net Rating ===================== */
  const netRatingFmt = (v) => v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1);
  const fichaNetRating = `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display">⚡ Fuerza de temporada (Net Rating)</p>
      <p class="text-[11px] text-ink font-mono mt-1">${escapeHtml(r.local)}: <span class="text-white">${netRatingFmt(r.netRatingLocal)}</span> · ${escapeHtml(r.visitante)}: <span class="text-white">${netRatingFmt(r.netRatingVisitante)}</span></p>
      <p class="text-[10px] dato-sec mt-1.5">Ajuste aplicado: ${r.ajusteNetRating >= 0 ? '+' : ''}${Math.abs(r.ajusteNetRating).toFixed(1)} pts a favor de ${escapeHtml(r.ajusteNetRating >= 0 ? r.local : r.visitante)} (prior de fortaleza general, atenuado — no es el driver principal).</p>
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
  const notaMetodo = r.metodoPesos === 'regresion'
    ? `Pesos calculados por regresión múltiple sobre ${r.nLiga} partidos de la liga (R² ${r.rLiga2.toFixed(2)}).`
    : `Muestra de liga insuficiente para regresión múltiple confiable: se usó regresión simple por factor sobre ${r.nLiga} partidos (mismas unidades, sin controlar por los demás factores).`;
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
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${badgeMatriz(matrizL, r.local + ' · eficiencia vs. volumen')}
        ${badgeMatriz(matrizV, r.visitante + ' · eficiencia vs. volumen')}
      </div>
      ${notaMuestra ? `<p class="text-[11px] text-muted leading-snug">${notaMuestra}</p>` : ''}
    </div>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign({}, SGADD_4F, {
    SIMULADOR, simuladorLeerRuta, simuladorEscribirRuta,
  });
}
