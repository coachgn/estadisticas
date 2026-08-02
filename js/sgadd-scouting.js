/* =====================================================================
   SGADD · Scouting pre-partido de equipos

   Réplica calculada en el cliente del informe que el cuerpo técnico ya
   arma a mano antes de cada partido (los PDFs "REPORTE SCOUTING"): un
   cruce A vs B con metadata, matriz de métricas avanzadas contra la liga,
   splits de local/visitante, lectura del ciclo reciente, plan individual
   de marcas y claves estratégicas.

   Dos capas, como el resto del proyecto:
     - SGADD_SCOUT  → motor puro, testeable en Node, sin `document`.
     - UI (globals) → render, se verifica a mano en el navegador.

   Nada acá inventa datos. Todo sale de `idx` (Base Datos E, 4 FACTORES,
   PROMEDIOS E/4F/J). Lo que la planilla no tiene (el fixture: fecha del
   partido y próximo rival programado) es campo manual en la UI, no un
   número estimado — un scouting con una fecha inventada es peor que uno
   sin fecha.
   ===================================================================== */

const SGADD_SCOUT = (function () {
  'use strict';

  /* =====================================================================
     0. CONSTANTES DE ANÁLISIS

     Los umbrales relativos (x veces la mediana de la liga) son la regla
     del proyecto: un 40% de uso en triples es muchísimo en una liga y
     normal en otra. Los absolutos que quedan son los que SÍ son físicos
     del básquet y no dependen de la liga: un 75% de acierto en libres es
     bueno en cualquier lado.
     ===================================================================== */

  const VENTANA_CICLO = 4;          // "últimos N partidos" del informe impreso
  const MIN_PARTIDOS_SUBSET = 1;    // con 0 no hay nada que leer
  const TOP_JUGADORES = 8;          // los que realmente juegan el partido
  const TOP_SEMAFORO = 3;           // "top 3 de cada métrica", pedido del club

  /* Umbrales del plan individual. */
  const U = {
    concentracionAlta: 0.20,   // >20% de los plays del equipo = eje de eficiencia
    usoTripleAlto: 0.40,       // 40% de sus plays terminan en triple
    pptTripleElite: 1.20,      // 1,20 pts por triple intentado = hay que cerrarlo
    pptTriplePobre: 0.90,      // por debajo de 0,90 conviene regalárselo
    usoLibreAlto: 0.10,        // 10% de sus plays terminan en la línea
    t1Confiable: 0.75,         // no mandarlo a la línea
    t1Pobre: 0.60,             // mandarlo a la línea es ganancia táctica
    perdidasAltas: 1.25,       // x la mediana de la liga → presionable
    reboteOfensivoAlto: 1.20,  // x la mediana de la liga → box-out especial
    pptDobleAlto: 1.10,        // finalizador interno real
    minutosClave: 20,          // por debajo de esto no condiciona un plan
  };

  /* Consignas del informe impreso. Cada perfil calza una consigna técnica
     y su restricción; NO son excluyentes en el análisis (un jugador puede
     ser tirador de élite y además perder muchas), pero la marca asignada
     sí elige una: la de la amenaza más cara. Por eso `PERFILES_MARCA` es
     una cascada ordenada de mayor a menor costo esperado. */
  const PERFILES_MARCA = [
    {
      id: 'tirador-elite',
      etiqueta: 'Amenaza perimetral de élite',
      consigna: 'TOP LOCK / LÍNEA DE PASE',
      restriccion: 'NO FOUL',
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple >= U.pptTripleElite,
      porque: (p) => 'concentra ' + pct(p.usoTriple) + ' de sus plays en el triple con ' +
        num2(p.pptTriple) + ' pts por intento: negarle la recepción cuesta menos que cerrarle el tiro.',
    },
    {
      id: 'finalizador-interno',
      etiqueta: 'Referencia interna',
      consigna: '3/4 POR DELANTE',
      restriccion: 'BOX-OUT DE CHOQUE',
      test: (p) => p.pptDoble >= U.pptDobleAlto && p.usoTriple < U.usoTripleAlto,
      porque: (p) => 'rinde ' + num2(p.pptDoble) + ' por doble intentado y casi no sale al perímetro: ' +
        'la pelea es por la posición, no por el tiro.',
    },
    {
      id: 'generador-riesgoso',
      etiqueta: 'Generador de alto riesgo',
      consigna: 'ACOSO AL DRIBLE / TRAP',
      restriccion: 'FORZAR EL ERROR',
      test: (p) => p.perdidasRel >= U.perdidasAltas && p.min >= U.minutosClave,
      porque: (p) => 'pierde ' + pct(p.perdidas) + ' de sus plays, ' + num2(p.perdidasRel) +
        'x la mediana de la liga: el error propio es más barato que defenderle la jugada.',
    },
    {
      id: 'tirador-ineficiente',
      etiqueta: 'Tirador de volumen sin renta',
      consigna: 'FLOTAR / UNDER',
      restriccion: 'INVITACIÓN AL TIRO',
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple <= U.pptTriplePobre,
      porque: (p) => 'tira mucho de afuera (' + pct(p.usoTriple) + ' de sus plays) y saca ' +
        num2(p.pptTriple) + ' por intento: ese tiro nos conviene.',
    },
    {
      id: 'castigable-en-la-linea',
      etiqueta: 'Vulnerable en la línea',
      consigna: 'FALTA TÁCTICA',
      restriccion: 'MANDAR A LA LÍNEA',
      test: (p) => p.usoLibre >= U.usoLibreAlto && p.t1 !== null && p.t1 <= U.t1Pobre,
      porque: (p) => 'busca contacto (' + pct(p.usoLibre) + ' de sus plays) pero convierte ' +
        pct(p.t1) + ' de libres: cambiarle una jugada por dos tiros libres es ganancia.',
    },
    {
      id: 'contencion',
      etiqueta: 'Rol complementario',
      consigna: 'CLOSE-OUT / CONTENCIÓN',
      restriccion: 'NO FOUL',
      test: () => true,   // fallback: siempre calza
      porque: () => 'no concentra volumen ni tiene una amenaza dominante: alcanza con no regalarle nada fácil.',
    },
  ];

  /* =====================================================================
     1. HELPERS DE FORMATO

     Duplicados a propósito y no tomados de SGADD.formatear(): estos textos
     van dentro de frases generadas ("concentra 42,1% de sus plays"), donde
     hace falta el número suelto, no la celda de una tabla.
     ===================================================================== */

  function pct(v, dec) { return v === null || v === undefined || !isFinite(v) ? '—' : (v * 100).toFixed(dec === undefined ? 1 : dec).replace('.', ',') + '%'; }
  function num1(v) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(1).replace('.', ','); }
  function num2(v) { return v === null || v === undefined || !isFinite(v) ? '—' : v.toFixed(2).replace('.', ','); }
  function nn(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function div(a, b) { return (nn(a) !== null && nn(b) !== null && b !== 0) ? a / b : null; }

  /* =====================================================================
     2. MATRIZ DE MÉTRICAS AVANZADAS

     El orden y el agrupado replican el panel del informe impreso: primero
     posesión/eficiencia, después selección de tiro y pérdidas. `sub` es la
     métrica que en el papel va debajo en la misma celda (EFF OF trae su
     PPP OF; %USO 3PTS trae su PPT3): son la misma pregunta desde dos
     ángulos — cuánto lo usa y cuánto le rinde — y separarlas en dos filas
     rompe la lectura.
     ===================================================================== */

  const MATRIZ_POSESION = [
    { id: 'POS', label: 'POS' },
    { id: 'PACE', label: 'PACE' },
    { id: 'eFG%', label: 'eFG%' },
    { id: 'RTNG OFF', label: 'EFF OF', sub: 'PPP OF' },
    { id: 'RTNG DEF', label: 'EFF DEF', sub: 'PPP DEF' },
    { id: 'RO%', label: '%REB OF' },
    { id: 'RD%', label: '%REB DEF' },
    { id: 'AST%', label: '%AST' },
  ];

  const MATRIZ_TIRO = [
    { id: 'PT3%', label: '%USO 3PTS', sub: 'PPT3' },
    { id: 'PT2%', label: '%USO 2PTS', sub: 'PPT2' },
    { id: 'PT1%', label: '%USO TL', sub: 'PPT1' },
    { id: 'PePP%', label: '%TOV', sub: 'PP' },
  ];

  /** Una celda de la matriz: valor + ranking + la métrica secundaria. */
  function celdaMatriz(idx, clave, def) {
    const r = idx.leer(clave, def.id);
    if (!r) return null;
    const rk = idx.ranking(clave, def.id);
    const sub = def.sub ? idx.leer(clave, def.sub) : null;
    return {
      valor: r.valor, formateado: r.formateado, percentil: r.percentil,
      puesto: rk ? rk.puesto : null, de: rk ? rk.de : null,
      sub: sub ? { clave: def.sub, valor: sub.valor, formateado: sub.formateado } : null,
    };
  }

  /**
   * Referencia de liga de una métrica. Normalmente es la fila EQUIPO TIPO
   * (que es la mediana, verificado 16/16 columnas — ver punto 3 de
   * CLAUDE.md). Si esa fila no trae la columna (pasa con las opcionales,
   * como PACE en algunas planillas), se cae a la mediana calculada sobre
   * la distribución de los N equipos: es el mismo estadístico, y dejar la
   * columna "Promedio Liga" vacía en pleno informe es peor que
   * recalcularla. NO se invierte el orden: el TIPO manda cuando existe,
   * porque viene de la planilla y es lo que el club ya audita.
   */
  function referenciaLiga(idx, clave, metrica) {
    const r = idx.leer(clave, metrica);
    if (!r) return { valor: null, formateado: '—', calculada: false };
    if (r.tipo !== null && r.tipo !== undefined) {
      return { valor: r.tipo, formateado: r.tipoFormateado, calculada: false };
    }
    const dist = idx.liga.distribuciones ? idx.liga.distribuciones[metrica] : null;
    const med = (dist && dist.length) ? SGADD.mediana(dist) : null;
    return { valor: med, formateado: SGADD.formatear(metrica, med), calculada: med !== null };
  }

  function filaMatriz(idx, claveL, claveV, def) {
    const met = SGADD.metrica(def.id);
    const liga = referenciaLiga(idx, claveL, def.id);
    if (def.sub) liga.sub = Object.assign({ clave: def.sub }, referenciaLiga(idx, claveL, def.sub));
    return {
      id: def.id,
      label: def.label,
      subClave: def.sub || null,
      invertida: met ? !!met.invertida : false,
      local: celdaMatriz(idx, claveL, def),
      visitante: celdaMatriz(idx, claveV, def),
      liga: liga,
    };
  }

  /** Matriz completa A vs B vs mediana de liga, en los dos bloques. */
  function matrizComparativa(idx, claveL, claveV) {
    if (!idx.get(claveL) || !idx.get(claveV)) return null;
    return {
      posesion: MATRIZ_POSESION.map(d => filaMatriz(idx, claveL, claveV, d)),
      tiro: MATRIZ_TIRO.map(d => filaMatriz(idx, claveL, claveV, d)),
    };
  }

  /* =====================================================================
     3. RANKINGS EN LA LIGA

     El bloque "RANKING LIGA" del informe. Se listan TODAS las métricas
     pedidas (no solo las buenas): un 17° en eFG% dice tanto como un 1° en
     rebote ofensivo, y el DT necesita las dos caras.
     ===================================================================== */

  const METRICAS_RANKING = [
    { id: 'PACE', label: 'PACE' },
    { id: 'PPP', label: 'PTS/PLAY' },
    { id: 'eFG%', label: 'eFG%' },
    { id: 'RTL%', label: 'RTL%' },
    { id: 'RTNG OFF', label: 'EFF OF' },
    { id: 'RTNG DEF', label: 'EFF DEF' },
    { id: 'PT3%', label: 'USO 3PTS' },
    { id: 'T3%', label: 'EFECTIVIDAD 3PTS' },
    { id: 'RO', label: 'REB OF' },
    { id: 'PP', label: 'TOV' },
    { id: 'PR', label: 'REC' },
  ];

  function rankingsLiga(idx, clave) {
    if (!idx.get(clave)) return [];
    return METRICAS_RANKING.map(d => {
      const r = idx.leer(clave, d.id);
      const rk = idx.ranking(clave, d.id);
      if (!r || r.valor === null || !rk) return null;
      return {
        id: d.id, label: d.label,
        puesto: rk.puesto, de: rk.de,
        valor: r.valor, formateado: r.formateado,
        /* Tercio superior/inferior en vez de un umbral fijo de puesto: en
           una liga de 12 el 4° es top, en una de 20 es media tabla. */
        tono: rk.puesto <= rk.de / 3 ? 'fuerte' : rk.puesto > (rk.de * 2) / 3 ? 'debil' : 'medio',
      };
    }).filter(Boolean);
  }

  /* =====================================================================
     4. METADATA DEL PARTIDO: récord, splits y último partido
     ===================================================================== */

  /** Rival y marcador de una fila de partido, resuelto contra el otro lado. */
  function detallePartido(idx, e, fila) {
    const p = fila.__id ? idx.partido(fila.__id) : null;
    const otro = p ? p.lados.find(l => l.equipo.clave !== e.clave) : null;
    return {
      id: fila.__id || null,
      fecha: fila.__fecha || null,
      partido: fila.__partido || '',
      rival: otro ? otro.equipo.nombre : '—',
      claveRival: otro ? otro.equipo.clave : null,
      condicion: String(fila['CONDICION'] || '').toUpperCase(),
      resultado: String(fila['RESULTADO'] || '').toUpperCase(),
      pts: nn(fila['PTS']),
      ptsRival: nn(fila['PTSopp']),
    };
  }

  function fichaEquipo(idx, clave) {
    const e = idx.get(clave);
    if (!e) return null;
    const ultima = e.partidos.length ? e.partidos[e.partidos.length - 1] : null;
    return {
      clave: e.clave, nombre: e.nombre,
      pj: e.record.pj, ganados: e.record.ganados, perdidos: e.record.perdidos,
      racha: e.racha,
      local: { pj: e.split.LOCAL.pj, ganados: e.split.LOCAL.ganados, perdidos: e.split.LOCAL.perdidos },
      visitante: { pj: e.split.VISITANTE.pj, ganados: e.split.VISITANTE.ganados, perdidos: e.split.VISITANTE.perdidos },
      ultimoPartido: ultima ? detallePartido(idx, e, ultima) : null,
    };
  }

  /**
   * Cruces previos entre los dos equipos, del más viejo al más nuevo.
   * Se resuelve por id de partido compartido (no por texto del nombre):
   * "A vs B" como string colisiona entre ida y vuelta — es la misma regla
   * de `idPartido()` que documenta el punto 3 de CLAUDE.md.
   */
  function historialDirecto(idx, claveL, claveV) {
    const eL = idx.get(claveL), eV = idx.get(claveV);
    if (!eL || !eV) return [];
    const cruces = [];
    eL.partidos.forEach(fila => {
      if (!fila.__id || !eV.partidosPorId.has(fila.__id)) return;
      const filaV = eV.partidosPorId.get(fila.__id);
      cruces.push({
        id: fila.__id,
        fecha: fila.__fecha || null,
        partido: fila.__partido || '',
        ptsLocal: nn(fila['PTS']),
        ptsVisitante: nn(filaV['PTS']),
        condicionLocal: String(fila['CONDICION'] || '').toUpperCase(),
        ganoLocal: String(fila['RESULTADO'] || '').toUpperCase() === 'GANADO',
      });
    });
    return cruces;
  }

  /* =====================================================================
     5. ANÁLISIS DEL CICLO RECIENTE (últimos N partidos)

     El bloque más denso del informe impreso. Separa los últimos N partidos
     en ganados y perdidos y, para cada grupo, contesta tres preguntas:

       🚩 Puntos de fuga     — qué se cayó respecto de SU PROPIA temporada
       ✅ Valores de identidad — qué sostuvo respecto de SU PROPIA temporada
       📊 Línea de tiro       — cómo tiró contra la MEDIANA DE LA LIGA

     Ojo con las dos referencias distintas: fuga/identidad se miden contra
     el propio promedio (¿este equipo jugó como él mismo?) y la línea de
     tiro contra la liga (¿tiró bien en términos absolutos?). Mezclarlas
     daba lecturas contradictorias en los primeros borradores.
     ===================================================================== */

  const DELTA = {
    ratingRelevante: 2.0,   // pts por 100 plays: menos que esto es ruido
    efgRelevante: 0.02,     // 2 puntos porcentuales de eFG%
    reboteRelevante: 0.05,  // 5 pp de RO%
  };

  /** Rating ofensivo/defensivo de un subconjunto ya agregado. */
  function ratingsSubset(sub) {
    return {
      off: div(sub.propio['PTS'], sub.propio['PLAYS']),
      def: div(sub.rival['PTS'], sub.rival['PLAYS']),
    };
  }

  function analizarSubset(idx, e, partidos, etiqueta) {
    if (partidos.length < MIN_PARTIDOS_SUBSET) return null;
    const sub = idx.agregarPartidos(e.clave, partidos);
    const r = ratingsSubset(sub);
    const temporada = { off: div(e.totales.propio['PTS'], e.totales.propio['PLAYS']),
                        def: div(e.totales.rival['PTS'], e.totales.rival['PLAYS']) };
    const efgTemporada = e.ponderado['eFG%'];
    const roTemporada = e.ponderado['RO%'];

    const fugas = [], identidad = [];

    /* Por 100 plays, para que "2,5 pts menos" se lea igual que en el
       informe de papel (que trabaja en rating, no en PPP crudo). */
    const dOff = (r.off !== null && temporada.off !== null) ? (r.off - temporada.off) * 100 : null;
    const dDef = (r.def !== null && temporada.def !== null) ? (r.def - temporada.def) * 100 : null;
    const dEfg = (sub.tiro['eFG%'] !== null && efgTemporada !== null) ? sub.tiro['eFG%'] - efgTemporada : null;
    const dRo = (sub.tiro['RO%'] !== null && roTemporada !== null) ? sub.tiro['RO%'] - roTemporada : null;

    if (dOff !== null && dOff <= -DELTA.ratingRelevante) {
      fugas.push('Baja producción ofensiva: anotaron ' + num1(Math.abs(dOff)) + ' pts menos que su media (rating OFF).');
    }
    if (dDef !== null && dDef >= DELTA.ratingRelevante) {
      fugas.push('Permisividad defensiva: el rival anotó ' + num1(dDef) + ' pts sobre la media (rating DEF).');
    }
    if (dEfg !== null && dEfg <= -DELTA.efgRelevante) {
      fugas.push('Déficit en eFG%: el rendimiento estuvo ' + pct(Math.abs(dEfg)) + ' bajo su eficiencia esperada.');
    }
    if (!fugas.length) fugas.push('Rendimiento alineado o superior a su propia media.');

    if (dRo !== null && dRo >= DELTA.reboteRelevante) {
      identidad.push('Control del cristal: capturaron un ' + pct(dRo) + ' más de rebotes ofensivos que su media.');
    }
    const net = (r.off !== null && r.def !== null) ? (r.off - r.def) * 100 : null;
    if (net !== null && net > 0) {
      identidad.push('Balanza de eficiencia positiva: net rating de +' + num1(net) + ' puntos.');
    }
    if (dEfg !== null && dEfg >= DELTA.efgRelevante) {
      identidad.push('Alta efectividad: rendimiento de tiro ' + pct(dEfg) + ' superior a su promedio.');
    }
    if (!identidad.length) identidad.push('Sin una fortaleza que se despegue de su propia media.');

    /* Línea de tiro contra la liga: acá sí la referencia es externa. */
    const lineaTiro = ['T1%', 'T2%', 'T3%'].map(k => {
      const propio = sub.tiro[k];
      const ligaMed = idx.leer(e.clave, k);
      const med = ligaMed ? ligaMed.tipo : null;
      return {
        clave: k, valor: propio, formateado: pct(propio),
        delta: (propio !== null && med !== null) ? propio - med : null,
      };
    });

    return {
      etiqueta: etiqueta, pj: partidos.length,
      ratingOff: r.off !== null ? r.off * 100 : null,
      ratingDef: r.def !== null ? r.def * 100 : null,
      netRating: net,
      fugas: fugas, identidad: identidad, lineaTiro: lineaTiro,
    };
  }

  /** Ciclo reciente partido a partido, separado en ganados y perdidos. */
  function analisisCiclo(idx, clave, ventana) {
    const e = idx.get(clave);
    if (!e || !e.partidos.length) return null;
    const n = ventana || VENTANA_CICLO;
    const ultimos = e.partidos.slice(-n);
    const ganados = ultimos.filter(p => String(p['RESULTADO'] || '').toUpperCase() === 'GANADO');
    const perdidos = ultimos.filter(p => String(p['RESULTADO'] || '').toUpperCase() === 'PERDIDO');
    return {
      ventana: n, pj: ultimos.length,
      ganados: analizarSubset(idx, e, ganados, 'Partidos ganados'),
      perdidos: analizarSubset(idx, e, perdidos, 'Partidos perdidos'),
    };
  }

  /* =====================================================================
     6. JUGADORES CLAVE DEL RIVAL

     Tabla itemizada + semáforo. El "top 3" se calcula DENTRO del plantel
     del rival, no contra la liga: la pregunta del bloque es "de estos
     siete, ¿a quién le doy la marca?", no "¿es bueno para la liga?".
     Eso último ya lo contesta el ranking de la sección Jugadores.
     ===================================================================== */

  const COLS_JUGADOR = [
    { id: 'MIN', label: 'MIN', formato: 'num1', mayorEsMejor: true },
    { id: 'PLAYS', label: 'PLAYS', formato: 'num1', mayorEsMejor: true },
    { id: 'eFG%', label: 'eFG%', formato: 'pct', mayorEsMejor: true },
    { id: 'PPP', label: 'PTS/PLAY', formato: 'num2', mayorEsMejor: true },
    { id: 'PT3%', label: '%USO 3PTS', formato: 'pct', sub: 'PPT3', mayorEsMejor: true },
    { id: 'PT2%', label: '%USO 2PTS', formato: 'pct', sub: 'PPT2', mayorEsMejor: true },
    { id: 'PT1%', label: '%USO TL', formato: 'pct', sub: 'PPT1', mayorEsMejor: true },
    { id: 'PePP%', label: '%TOV', formato: 'pct', mayorEsMejor: false },
  ];

  function formatearJ(formato, v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    if (formato === 'pct') return pct(v);
    if (formato === 'num2') return num2(v);
    return num1(v);
  }

  /** Promedio simple de una métrica sobre una lista de jugadores. */
  function promedioDe(jugadores, clave) {
    const vals = jugadores.map(j => nn(j[clave])).filter(v => v !== null);
    if (!vals.length) return null;
    return vals.reduce((a, v) => a + v, 0) / vals.length;
  }

  /**
   * Perfil crudo de un jugador para el plan individual. Se arma una sola
   * vez y lo consumen tanto la marca asignada como las claves
   * estratégicas: si cada uno leyera las columnas por su cuenta, un
   * cambio de umbral quedaría aplicado en un lado y no en el otro.
   */
  function perfilJugador(idx, j, totalPlaysEquipo) {
    const tipo = idx.liga.jugadorTipo || {};
    const medPerdidas = nn(tipo['PePP%']);
    const medRebote = nn(tipo['RO%']);
    const perdidas = nn(j['PePP%']);
    const rebote = nn(j['RO%']);
    return {
      nombre: String(j['NOMBRES'] || '').trim(),
      clave: j.__clave || null,
      min: nn(j['MIN']),
      plays: nn(j['PLAYS']),
      pts: nn(j['PTS']),
      ppp: nn(j['PPP']),
      efg: nn(j['eFG%']),
      usoTriple: nn(j['PT3%']),
      pptTriple: nn(j['PPT3']),
      usoDoble: nn(j['PT2%']),
      pptDoble: nn(j['PPT2']),
      usoLibre: nn(j['PT1%']),
      pptLibre: nn(j['PPT1']),
      t1: nn(j['T1%']),
      t3: nn(j['T3%']),
      perdidas: perdidas,
      rebote: rebote,
      astPP: nn(j['AST-PP']),
      /* Relativos a la liga: la comparación que vale, no el absoluto. */
      perdidasRel: div(perdidas, medPerdidas),
      reboteRel: div(rebote, medRebote),
      concentracion: div(nn(j['PLAYS']), totalPlaysEquipo),
      califica: !!j.__califica,
    };
  }

  /** Marca asignada sugerida: primera de la cascada que calza. */
  function marcaSugerida(perfil) {
    const p = PERFILES_MARCA.find(d => {
      try { return d.test(perfil); } catch (e) { return false; }
    }) || PERFILES_MARCA[PERFILES_MARCA.length - 1];
    return {
      id: p.id, etiqueta: p.etiqueta,
      consigna: p.consigna, restriccion: p.restriccion,
      porque: p.porque(perfil),
    };
  }

  /**
   * Tabla de jugadores clave del rival con semáforo top-3 por métrica.
   * Devuelve también las dos filas de cierre del informe impreso:
   * promedio del plantel mostrado y promedio de la liga.
   */
  function jugadoresClave(idx, clave, limite) {
    const e = idx.get(clave);
    if (!e) return null;
    const n = limite || TOP_JUGADORES;

    /* Por minutos: el que más juega es el que más condiciona el plan,
       independientemente de cuánto anote. */
    const plantel = (idx.liga.jugadoresPorEquipo.get(e.clave) || [])
      .slice()
      .sort((a, b) => (nn(b['MIN']) || 0) - (nn(a['MIN']) || 0));
    const elegidos = plantel.slice(0, n);
    if (!elegidos.length) return null;

    const totalPlays = plantel.reduce((s, j) => s + (nn(j['PLAYS']) || 0), 0);

    /* Semáforo: top 3 por métrica DENTRO de los elegidos. Para %TOV el
       "top" es el que MÁS pierde (es a quien conviene presionar), no el
       que mejor cuida: el semáforo marca dónde mirar, no quién es bueno. */
    const top = {};
    COLS_JUGADOR.forEach(c => {
      const orden = elegidos
        .map(j => ({ clave: j.__clave, v: nn(j[c.id]) }))
        .filter(x => x.v !== null)
        .sort((a, b) => b.v - a.v)          // siempre descendente: "más" es lo destacable
        .slice(0, TOP_SEMAFORO)
        .map(x => x.clave);
      top[c.id] = orden;
    });

    const filas = elegidos.map(j => {
      const perfil = perfilJugador(idx, j, totalPlays);
      const celdas = {};
      COLS_JUGADOR.forEach(c => {
        const v = nn(j[c.id]);
        const sub = c.sub ? nn(j[c.sub]) : null;
        celdas[c.id] = {
          valor: v, formateado: formatearJ(c.formato, v),
          sub: c.sub ? { clave: c.sub, valor: sub, formateado: num2(sub) } : null,
          destacado: top[c.id].indexOf(j.__clave) !== -1,
          puestoInterno: top[c.id].indexOf(j.__clave) + 1,   // 0 = fuera del top
        };
      });
      return { clave: j.__clave, nombre: perfil.nombre, perfil: perfil, celdas: celdas, marca: marcaSugerida(perfil) };
    });

    const promedioFila = (jugs) => {
      const out = {};
      COLS_JUGADOR.forEach(c => {
        const v = promedioDe(jugs, c.id);
        out[c.id] = { valor: v, formateado: formatearJ(c.formato, v) };
      });
      return out;
    };

    return {
      equipo: e.nombre, clave: e.clave,
      columnas: COLS_JUGADOR,
      filas: filas,
      promedioEquipo: promedioFila(elegidos),
      promedioLiga: promedioFila(idx.liga.jugadoresCalificados || []),
      totalPlays: totalPlays,
    };
  }

  /* =====================================================================
     7. CLAVES ESTRATÉGICAS DINÁMICAS

     No hay una lista fija de bullets: cada regla mira el plantel del rival
     y se activa sola si los datos la justifican. Un informe contra un
     equipo de tiradores y otro contra un equipo de pintura salen distintos
     sin tocar código.
     ===================================================================== */

  const REGLAS_CLAVE = [
    {
      id: 'ejes-eficiencia', icono: '📉', titulo: 'Ejes de eficiencia',
      buscar: (ps) => ps.filter(p => p.concentracion !== null && p.concentracion >= U.concentracionAlta),
      texto: (ms) => 'Neutralizar a ' + nombres(ms) + ': concentra' + (ms.length > 1 ? 'n' : '') + ' ' +
        ms.map(m => pct(m.concentracion)).join(' y ') + ' de los plays del equipo. ' +
        'Sacarlo' + (ms.length > 1 ? 's' : '') + ' del partido descompone la ofensiva entera.',
    },
    {
      id: 'clausura-tiradores', icono: '🏹', titulo: 'Clausura de tiradores',
      buscar: (ps) => ps.filter(p => p.usoTriple !== null && p.pptTriple !== null &&
        p.usoTriple >= U.usoTripleAlto && p.pptTriple >= U.pptTripleElite),
      texto: (ms) => 'Deny y close-out largo sobre ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'saca ' + num2(m.pptTriple) + ' pts por triple intentado') +
        '. Es el tiro más caro que conceden.',
    },
    {
      id: 'invitacion-triple', icono: '🎁', titulo: 'Invitación selectiva al triple',
      buscar: (ps) => ps.filter(p => p.usoTriple !== null && p.pptTriple !== null &&
        p.usoTriple >= U.usoTripleAlto && p.pptTriple <= U.pptTriplePobre && p.min >= U.minutosClave),
      texto: (ms) => 'Regalarle el perímetro a ' + nombres(ms) + ': tira' + (ms.length > 1 ? 'n' : '') +
        ' mucho de afuera con ' + ms.map(m => num2(m.pptTriple)).join(' y ') + ' de renta por intento. ' +
        'Cerrar los caminos a la pintura y dejar que siga' + (ms.length > 1 ? 'n' : '') + ' lanzando.',
    },
    {
      id: 'disciplina-bonus', icono: '🚫', titulo: 'Disciplina de bonus / control de T1',
      buscar: (ps) => ps.filter(p => p.usoLibre !== null && p.t1 !== null &&
        p.usoLibre >= U.usoLibreAlto && p.t1 >= U.t1Confiable),
      texto: (ms) => 'Defensa vertical sin contacto sobre ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'convierte ' + pct(m.t1) + ' de libres con ' + pct(m.usoLibre) + ' de sus plays en la línea') +
        '. Mandarlo' + (ms.length > 1 ? 's' : '') + ' a la línea es regalarle puntos.',
    },
    {
      id: 'castigo-linea', icono: '🎯', titulo: 'Falta táctica rentable',
      buscar: (ps) => ps.filter(p => p.usoLibre !== null && p.t1 !== null &&
        p.usoLibre >= U.usoLibreAlto && p.t1 <= U.t1Pobre),
      texto: (ms) => 'Si hay que cortar una jugada, la falta va sobre ' + nombres(ms) + ' (' +
        ms.map(m => pct(m.t1)).join(' y ') + ' en libres). Cambiar una posesión por sus tiros libres ' +
        'baja el valor esperado de esa jugada.',
    },
    {
      id: 'presion-conduccion', icono: '🧤', titulo: 'Presión a la conducción',
      buscar: (ps) => ps.filter(p => p.perdidasRel !== null && p.perdidasRel >= U.perdidasAltas && p.min >= U.minutosClave),
      texto: (ms) => 'Trap y acoso al drible sobre ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'pierde ' + pct(m.perdidas) + ' de sus plays (' + num2(m.perdidasRel) + 'x la liga)') +
        '. El error propio es la forma más barata de defenderlos.',
    },
    {
      id: 'cristal', icono: '🏰', titulo: 'Control del cristal',
      buscar: (ps) => ps.filter(p => p.reboteRel !== null && p.reboteRel >= U.reboteOfensivoAlto),
      texto: (ms) => 'Box-out asignado sobre ' + nombres(ms) + ' (' +
        ms.map(m => num2(m.reboteRel) + 'x la liga en rebote ofensivo').join('; ') +
        '). Sin cargado físico nos generan segundas oportunidades toda la noche.',
    },
    {
      id: 'pintura', icono: '🛡', titulo: 'Colapso de la pintura',
      buscar: (ps) => ps.filter(p => p.pptDoble !== null && p.usoDoble !== null &&
        p.pptDoble >= U.pptDobleAlto && p.usoDoble >= 0.40),
      texto: (ms) => 'Ayuda temprana sobre ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'rinde ' + num2(m.pptDoble) + ' por doble intentado') +
        '. Obligarlos a soltar la pelota antes de la posición de tiro.',
    },
  ];

  function nombres(perfiles) {
    const ns = perfiles.map(p => p.nombre);
    if (ns.length === 1) return ns[0];
    return ns.slice(0, -1).join(', ') + ' y ' + ns[ns.length - 1];
  }

  /**
   * Detalle por jugador de una clave. Con UNO solo omite el nombre: ya lo
   * dijo la frase de arriba y repetirlo da "…sobre LOPEZ. LOPEZ saca 1,38",
   * que es como lee un informe generado por una máquina. Con varios sí hace
   * falta, para saber qué número es de quién.
   */
  function detallePorJugador(ms, fn) {
    if (ms.length === 1) return fn(ms[0]);
    return ms.map(m => m.nombre + ' ' + fn(m)).join('; ');
  }

  /**
   * Corre todas las reglas contra el plantel del rival y devuelve solo las
   * que se activaron, con los jugadores que las dispararon.
   */
  function clavesEstrategicas(idx, clave, limite) {
    const tabla = jugadoresClave(idx, clave, limite);
    if (!tabla) return [];
    const perfiles = tabla.filas.map(f => f.perfil);
    return REGLAS_CLAVE.map(r => {
      const marcados = r.buscar(perfiles);
      if (!marcados.length) return null;
      /* Los más determinantes primero dentro de cada clave: si la regla
         marcó a cuatro jugadores, el DT igual actúa sobre los dos que más
         juegan. */
      const orden = marcados.slice().sort((a, b) => (b.min || 0) - (a.min || 0)).slice(0, 3);
      return {
        id: r.id, icono: r.icono, titulo: r.titulo,
        jugadores: orden.map(p => p.nombre),
        texto: r.texto(orden),
      };
    }).filter(Boolean);
  }

  /* =====================================================================
     8. RESUMEN EJECUTIVO

     Un párrafo que une el diagnóstico de equipo (matriz + ciclo) con el
     plan individual. Se arma de las mismas piezas que ya calcularon los
     bloques de arriba: no vuelve a leer nada de `idx` por su cuenta, para
     que no pueda contradecir a la tabla que está justo encima.
     ===================================================================== */

  function resumenEjecutivo(idx, claveNuestro, claveRival) {
    const eR = idx.get(claveRival);
    if (!eR) return '';
    const partes = [];

    const efg = idx.leer(claveRival, 'eFG%');
    const pace = idx.leer(claveRival, 'PACE');
    const ro = idx.leer(claveRival, 'RO%');
    const uso3 = idx.leer(claveRival, 'PT3%');

    /* 1. Identidad de ritmo: condiciona si el plan es correr o frenar. */
    if (pace && pace.percentil !== null) {
      partes.push(pace.percentil >= 66
        ? eR.nombre + ' juega a ritmo alto (' + pace.formateado + ', percentil ' + pace.percentil.toFixed(0) +
          '): el plan pasa por controlar el tempo y no entrar en un partido de ida y vuelta.'
        : pace.percentil <= 34
          ? eR.nombre + ' juega a ritmo controlado (' + pace.formateado + ', percentil ' + pace.percentil.toFixed(0) +
            '): hay que forzar posesiones rápidas y sacarlos de su libreto.'
          : eR.nombre + ' maneja un ritmo de media tabla (' + pace.formateado + '): el tempo no define este partido, lo define la eficiencia.');
    }

    /* 2. De dónde sacan los puntos: perímetro, pintura o segundas chances. */
    const via = [];
    if (uso3 && uso3.percentil !== null && uso3.percentil >= 66) via.push('el volumen de triples (' + uso3.formateado + ' de sus plays)');
    if (ro && ro.percentil !== null && ro.percentil >= 66) via.push('el rebote ofensivo (' + ro.formateado + ', percentil ' + ro.percentil.toFixed(0) + ')');
    if (efg && efg.percentil !== null && efg.percentil >= 66) via.push('una eficiencia de tiro alta (' + efg.formateado + ')');
    if (via.length) {
      partes.push('Su producción se apoya en ' + via.join(', ') + '. Ahí es donde hay que pagar el precio defensivo.');
    } else if (efg && efg.percentil !== null && efg.percentil <= 34) {
      partes.push('No tienen una vía de anotación que se destaque en la liga (eFG% ' + efg.formateado +
        ', percentil ' + efg.percentil.toFixed(0) + '): sostener la estructura defensiva alcanza para incomodarlos.');
    }

    /* 3. El plan individual, resumido desde las claves ya generadas. */
    const claves = clavesEstrategicas(idx, claveRival);
    const prioritaria = claves.find(c => c.id === 'ejes-eficiencia') || claves[0];
    if (prioritaria) {
      partes.push('Prioridad del plan: ' + prioritaria.titulo.toLowerCase() + ' — ' +
        prioritaria.jugadores.join(', ') + '.');
    }

    /* 4. Ciclo reciente: en qué estado llegan. */
    const ciclo = analisisCiclo(idx, claveRival);
    if (ciclo && ciclo.pj) {
      const g = ciclo.ganados ? ciclo.ganados.pj : 0;
      const p = ciclo.perdidos ? ciclo.perdidos.pj : 0;
      partes.push('Llegan ' + g + '-' + p + ' en sus últimos ' + ciclo.pj + ' partidos.');
    }

    return partes.join(' ');
  }

  /* =====================================================================
     9. INFORME COMPLETO — lo que consume la UI de una sola llamada
     ===================================================================== */

  function informePrePartido(idx, claveLocal, claveVisitante, opciones) {
    const o = opciones || {};
    const eL = idx.get(claveLocal), eV = idx.get(claveVisitante);
    if (!eL || !eV) return { ok: false, motivo: 'Alguno de los dos equipos no existe en esta liga.' };
    if (eL.clave === eV.clave) return { ok: false, motivo: 'Elegí dos equipos distintos.' };

    /* El rival a scoutear es el que NO es nuestro. Las tres ramas son
       necesarias: con un solo ternario sobre el local, un partido donde
       NOSOTROS somos el visitante terminaba scouteando a nuestro propio
       equipo. Si ninguno de los dos es del club (escenario válido:
       preparar un partido ajeno), se toma el visitante, que es la
       convención del informe impreso. */
    const claveRival = o.claveRival
      || (SGADD.esEquipoPropio(eL.clave) ? eV.clave
        : SGADD.esEquipoPropio(eV.clave) ? eL.clave
          : eV.clave);
    const claveNuestro = claveRival === eL.clave ? eV.clave : eL.clave;

    return {
      ok: true,
      local: fichaEquipo(idx, eL.clave),
      visitante: fichaEquipo(idx, eV.clave),
      claveRival: claveRival,
      claveNuestro: claveNuestro,
      historial: historialDirecto(idx, eL.clave, eV.clave),
      matriz: matrizComparativa(idx, eL.clave, eV.clave),
      rankingsLocal: rankingsLiga(idx, eL.clave),
      rankingsVisitante: rankingsLiga(idx, eV.clave),
      cicloLocal: analisisCiclo(idx, eL.clave),
      cicloVisitante: analisisCiclo(idx, eV.clave),
      jugadoresRival: jugadoresClave(idx, claveRival),
      claves: clavesEstrategicas(idx, claveRival),
      resumen: resumenEjecutivo(idx, claveNuestro, claveRival),
    };
  }

  return {
    VENTANA_CICLO, TOP_JUGADORES, TOP_SEMAFORO, UMBRALES: U, DELTA,
    MATRIZ_POSESION, MATRIZ_TIRO, METRICAS_RANKING, COLS_JUGADOR,
    PERFILES_MARCA, REGLAS_CLAVE,
    celdaMatriz, referenciaLiga, filaMatriz, matrizComparativa, rankingsLiga,
    detallePartido, fichaEquipo, historialDirecto,
    analizarSubset, analisisCiclo,
    perfilJugador, marcaSugerida, jugadoresClave,
    clavesEstrategicas, resumenEjecutivo, informePrePartido,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_SCOUT;

/* =====================================================================
   SECCIÓN SCOUTING · INFORME PRE-PARTIDO (capa de presentación)

   Plain globals, como el resto de las UI del proyecto (Equipos, Jugadores,
   Simulador): usa `document`, `LOGOS` y `SGADD_APP`, así que no se testea
   en Node — se verifica a mano en el navegador. Toda la matemática vive
   arriba, en SGADD_SCOUT.

   El DOM queda deliberadamente seccionado (`<section class="scout-bloque"
   data-bloque="...">` dentro de `#scoutInforme`) para que la exportación a
   PDF/imagen de la próxima etapa pueda cortar por bloque sin tener que
   reestructurar nada.
   ===================================================================== */

const SCOUT_UI = {
  local: null,
  visitante: null,
  claveRival: null,      // null = lo decide el motor (nuestro equipo vs el otro)
  fecha: '',             // metadata de fixture: la planilla no la tiene
  torneo: '',
  proximoRival: '',
  marcas: {},            // clave de jugador -> { defensor, consigna, restriccion }
};

/* ===================== ESTADO Y EVENTOS ===================== */

function scoutElegir(lado, clave) {
  if (lado === 'local') SCOUT_UI.local = clave || null;
  else SCOUT_UI.visitante = clave || null;
  SCOUT_UI.claveRival = null;   // cambió el cruce: que el motor vuelva a decidir
  scoutPintar();
}

function scoutIntercambiar() {
  const t = SCOUT_UI.local; SCOUT_UI.local = SCOUT_UI.visitante; SCOUT_UI.visitante = t;
  scoutPintar();
}

/** Cambia a qué equipo se le hace el scouting (por defecto, el rival). */
function scoutCambiarObjetivo(clave) {
  SCOUT_UI.claveRival = clave || null;
  scoutPintar();
}

/* Los campos de texto NO repintan: escriben en el estado y listo. Un
   repintado por tecla le saca el foco al input y hace imposible escribir
   un nombre completo. */
function scoutMeta(campo, valor) { SCOUT_UI[campo] = valor; }

function scoutMarca(claveJug, campo, valor) {
  if (!SCOUT_UI.marcas[claveJug]) SCOUT_UI.marcas[claveJug] = {};
  SCOUT_UI.marcas[claveJug][campo] = valor;
}

/* ===================== RENDER ===================== */

function scoutPintar() {
  const root = document.getElementById('scoutRoot');
  if (!root) return;
  const st = SGADD_APP.estado;
  if (st.error) { root.innerHTML = SGADD_UI.aviso('No se pudo cargar', st.error, 'error'); return; }
  if (!st.idx) { root.innerHTML = '<div class="card rounded-xl p-8 border border-hairline text-center text-muted text-sm">Cargando la categoria…</div>'; return; }
  root.innerHTML = scoutSelectores(st.idx) + scoutInforme(st.idx);
}

function scoutSelectores(idx) {
  const equipos = idx.lista().slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  const opts = (sel) => equipos.map(e =>
    `<option value="${escapeAttr(e.clave)}" ${sel === e.clave ? 'selected' : ''}>${escapeHtml(e.nombre)}</option>`).join('');

  /* Fecha, torneo y próximo rival son los únicos datos del informe que la
     planilla NO tiene (no hay hoja de fixture). Van como campo manual: un
     scouting con una fecha inventada es peor que uno sin fecha. */
  return `
    <div class="card rounded-xl p-4 sm:p-5 border border-hairline space-y-4">
      <div>
        <h3 class="font-display uppercase tracking-wide text-sm text-ink">Informe pre-partido</h3>
        <p class="text-[11px] text-muted mt-1">
          Elegí el cruce. Todo el análisis sale de los partidos cargados de la liga activa;
          la fecha, el torneo y el próximo rival se completan a mano porque la planilla no tiene fixture.
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Local</label>
          <select onchange="scoutElegir('local', this.value)"
            class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
            <option value="">Elegir equipo…</option>${opts(SCOUT_UI.local)}
          </select>
        </div>
        <button type="button" onclick="scoutIntercambiar()" title="Invertir local/visitante"
          class="shrink-0 justify-self-center text-xs font-semibold uppercase tracking-wider border border-hairline rounded px-3 py-2.5 hover:bg-surface2 transition-colors">⇄</button>
        <div>
          <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">Visitante</label>
          <select onchange="scoutElegir('visitante', this.value)"
            class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
            <option value="">Elegir equipo…</option>${opts(SCOUT_UI.visitante)}
          </select>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        ${scoutInput('fecha', 'Fecha del partido', 'dd/mm/aaaa')}
        ${scoutInput('torneo', 'Torneo / instancia', 'Fase regular, Playoffs…')}
        ${scoutInput('proximoRival', 'Próximo rival programado', 'Opcional')}
      </div>
    </div>`;
}

function scoutInput(campo, label, ph) {
  return `
    <div>
      <label class="block text-[10px] uppercase tracking-wider text-muted font-display mb-1">${escapeHtml(label)}</label>
      <input type="text" value="${escapeAttr(SCOUT_UI[campo] || '')}" placeholder="${escapeAttr(ph)}"
        oninput="scoutMeta('${campo}', this.value)"
        class="w-full bg-surface2 border border-hairline rounded-md px-3 py-2 text-sm focus:border-accent outline-none">
    </div>`;
}

/* ---------- Utilidades de presentación ---------- */

function scoutFecha(d) { return d ? SGADD.formatearFecha(d) : '—'; }
function scoutLogo(nombre) { return (typeof LOGOS !== 'undefined') ? LOGOS.getUrl(nombre) : null; }
function scoutRecord(r) { return r.ganados + ' - ' + r.perdidos; }

/** Chip de ranking, coloreado por tercio de la liga. */
function scoutChipRk(puesto, de) {
  if (!puesto) return '';
  const tono = puesto <= de / 3 ? '#22c55e' : puesto > (de * 2) / 3 ? '#ef4444' : '#9CA3AF';
  return `<span class="text-[9px] font-mono px-1 py-0.5 rounded ml-1"
    style="background:${tono}22;color:${tono}">${puesto}°</span>`;
}

/* ===================== BLOQUE 1 · ENCABEZADO ===================== */

function scoutBloqueEncabezado(inf) {
  const cara = (f, rol) => {
    const logo = scoutLogo(f.nombre);
    const u = f.ultimoPartido;
    return `
      <div class="flex-1 min-w-0">
        <p class="text-[10px] uppercase tracking-widest dato-sec">${rol}</p>
        <div class="flex items-center gap-2 mt-1">
          ${logo ? `<img src="${escapeAttr(logo)}" alt="" class="w-10 h-10 object-contain shrink-0">` : ''}
          <div class="min-w-0">
            <p class="font-display text-base text-white truncate">${escapeHtml(f.nombre)}</p>
            <p class="text-[11px] font-mono text-ink">${f.pj} PJ · récord ${scoutRecord(f)}</p>
          </div>
        </div>
        <div class="mt-2 space-y-0.5 text-[11px] font-mono dato-sec">
          <p>De local: ${f.local.pj} PJ · ${scoutRecord(f.local)}</p>
          <p>De visitante: ${f.visitante.pj} PJ · ${scoutRecord(f.visitante)}</p>
          ${u ? `<p class="text-ink">Último: ${escapeHtml(String(u.pts))} vs ${escapeHtml(String(u.ptsRival))} ${escapeHtml(u.rival)} · ${scoutFecha(u.fecha)}</p>` : ''}
        </div>
      </div>`;
  };

  const h2h = inf.historial.length ? inf.historial.slice().reverse().map(c => `
    <li class="text-[11px] font-mono text-ink">
      ${scoutFecha(c.fecha)} · ${escapeHtml(c.partido)} —
      <span class="text-white">${c.ptsLocal} : ${c.ptsVisitante}</span>
    </li>`).join('') : '';

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="encabezado">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-3">
        Reporte de scouting${SCOUT_UI.torneo ? ' · ' + escapeHtml(SCOUT_UI.torneo) : ''}${SCOUT_UI.fecha ? ' · ' + escapeHtml(SCOUT_UI.fecha) : ''}
      </p>
      <div class="flex flex-col sm:flex-row gap-4">
        ${cara(inf.local, 'Local')}
        <div class="hidden sm:block w-px bg-hairline"></div>
        ${cara(inf.visitante, 'Visitante')}
      </div>
      ${SCOUT_UI.proximoRival ? `<p class="text-[11px] text-muted mt-3 font-mono">Próximo rival programado: ${escapeHtml(SCOUT_UI.proximoRival)}</p>` : ''}
      <div class="border-t border-hairline/50 mt-3 pt-3">
        <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">Historial directo</p>
        ${h2h ? `<ul class="space-y-0.5">${h2h}</ul>`
          : `<p class="text-[11px] text-muted">Sin cruces previos entre estos dos equipos en la fase cargada.</p>`}
      </div>
    </section>`;
}

/* ===================== BLOQUE 2 · MATRIZ + RANKINGS ===================== */

function scoutCeldaMatriz(c) {
  if (!c) return `<td class="px-2 py-1.5 text-center dato-sec">—</td>`;
  /* El color sale del percentil, no del valor crudo: es la regla del
     proyecto de comparar siempre contra la propia liga. `leer()` ya
     devuelve el percentil con el signo dado vuelta si la métrica es
     invertida, así que acá no hay que volver a invertir nada. */
  const p = c.percentil;
  const col = p === null ? '#e5e7eb' : p >= 66 ? '#22c55e' : p <= 34 ? '#ef4444' : '#e5e7eb';
  return `
    <td class="px-2 py-1.5 text-center">
      <span class="font-mono text-sm" style="color:${col}">${escapeHtml(c.formateado)}</span>${scoutChipRk(c.puesto, c.de)}
      ${c.sub ? `<span class="block text-[10px] font-mono dato-sec">${escapeHtml(c.sub.clave)}: ${escapeHtml(c.sub.formateado)}</span>` : ''}
    </td>`;
}

function scoutFilasMatriz(filas) {
  return filas.map(f => `
    <tr class="border-b border-hairline/40 last:border-0">
      <td class="px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted font-display whitespace-nowrap">${escapeHtml(f.label)}</td>
      ${scoutCeldaMatriz(f.local)}
      ${scoutCeldaMatriz(f.visitante)}
      <td class="px-2 py-1.5 text-center">
        <span class="font-mono text-sm dato-sec">${escapeHtml(f.liga.formateado)}</span>
        ${f.liga.sub ? `<span class="block text-[10px] font-mono dato-sec">${escapeHtml(f.liga.sub.clave)}: ${escapeHtml(f.liga.sub.formateado)}</span>` : ''}
      </td>
    </tr>`).join('');
}

function scoutSubtituloMatriz(texto) {
  return `<tr><td colspan="4" class="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted font-display">${escapeHtml(texto)}</td></tr>`;
}

function scoutBloqueMatriz(inf) {
  const m = inf.matriz;
  if (!m) return '';

  const listaRk = (rks, nombre) => `
    <div class="bg-surface2/50 rounded-lg p-3">
      <p class="text-[10px] uppercase tracking-wider text-muted font-display truncate mb-1.5">${escapeHtml(nombre)}</p>
      <div class="space-y-0.5">
        ${rks.map(r => {
          const col = r.tono === 'fuerte' ? '#22c55e' : r.tono === 'debil' ? '#ef4444' : '#9CA3AF';
          return `<p class="text-[11px] font-mono">
            <span style="color:${col}">${r.puesto}°</span>
            <span class="dato-sec"> de ${r.de} en </span>${escapeHtml(r.label)}
            <span class="text-ink">(${escapeHtml(r.formateado)})</span></p>`;
        }).join('')}
      </div>
    </div>`;

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="matriz">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">📊 Métricas avanzadas y ranking en la liga</h4>
      <p class="text-[11px] text-muted mb-2">
        Verde = tercio alto de la liga, rojo = tercio bajo. El chip es el puesto en la liga de esa métrica.
      </p>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1 text-left">Métrica</th>
          <th class="px-2 pb-1 text-center">${escapeHtml(inf.local.nombre)}</th>
          <th class="px-2 pb-1 text-center">${escapeHtml(inf.visitante.nombre)}</th>
          <th class="px-2 pb-1 text-center">Liga</th>
        </tr></thead>
        <tbody>
          ${scoutSubtituloMatriz('Posesión y eficiencia')}
          ${scoutFilasMatriz(m.posesion)}
          ${scoutSubtituloMatriz('Selección de tiro y pérdidas')}
          ${scoutFilasMatriz(m.tiro)}
        </tbody>
      </table></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        ${listaRk(inf.rankingsLocal, inf.local.nombre)}
        ${listaRk(inf.rankingsVisitante, inf.visitante.nombre)}
      </div>
    </section>`;
}

/* ===================== BLOQUE 3 · SPLITS Y CICLO RECIENTE ===================== */

function scoutTarjetaCiclo(sub) {
  if (!sub) return '';
  const linea = sub.lineaTiro.map(l => {
    const d = l.delta === null ? '' :
      ` <span style="color:${l.delta >= 0 ? '#22c55e' : '#ef4444'}">(${l.delta >= 0 ? '+' : ''}${(l.delta * 100).toFixed(1).replace('.', ',')})</span>`;
    return escapeHtml(l.clave.replace('%', '')) + ': ' + escapeHtml(l.formateado) + d;
  }).join(' | ');
  return `
    <div class="bg-surface2/40 rounded-lg p-3">
      <p class="text-[11px] font-display uppercase tracking-wide text-white mb-1.5">
        📋 ${escapeHtml(sub.etiqueta)} (${sub.pj} part.)
      </p>
      <p class="text-[11px] leading-snug mb-1"><span class="text-red-400">🚩 Puntos de fuga:</span>
        <span class="text-ink">${sub.fugas.map(escapeHtml).join(' ')}</span></p>
      <p class="text-[11px] leading-snug mb-1"><span class="text-green-400">✅ Valores de identidad:</span>
        <span class="text-ink">${sub.identidad.map(escapeHtml).join(' ')}</span></p>
      <p class="text-[11px] leading-snug font-mono"><span class="dato-sec">📊 Línea de tiro vs liga:</span> ${linea}</p>
    </div>`;
}

function scoutBloqueCiclo(inf) {
  const columna = (ficha, ciclo) => `
    <div class="space-y-3">
      <div>
        <p class="font-display text-sm text-white truncate">${escapeHtml(ficha.nombre)}</p>
        <p class="text-[11px] font-mono dato-sec">
          De local: ${ficha.local.pj} PJ (${scoutRecord(ficha.local)}) ·
          De visitante: ${ficha.visitante.pj} PJ (${scoutRecord(ficha.visitante)})
        </p>
      </div>
      ${ciclo ? `<p class="text-[10px] uppercase tracking-wider text-muted font-display">Análisis últimos ${ciclo.pj} partidos</p>` : ''}
      ${ciclo ? scoutTarjetaCiclo(ciclo.ganados) : ''}
      ${ciclo ? scoutTarjetaCiclo(ciclo.perdidos) : ''}
      ${ciclo && !ciclo.ganados && !ciclo.perdidos ? `<p class="text-[11px] text-muted">Sin partidos con resultado cargado en la ventana.</p>` : ''}
    </div>`;

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="ciclo">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">🔀 Splits local/visitante y tendencia reciente</h4>
      <p class="text-[11px] text-muted mb-3">
        Fugas e identidad se miden contra el <strong>propio promedio</strong> del equipo (¿jugó como él mismo?);
        la línea de tiro, contra la <strong>mediana de la liga</strong> (¿tiró bien en términos absolutos?).
      </p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        ${columna(inf.local, inf.cicloLocal)}
        ${columna(inf.visitante, inf.cicloVisitante)}
      </div>
    </section>`;
}

/* ===================== BLOQUE 4 · MARCAS ASIGNADAS ===================== */

function scoutBloqueMarcas(inf) {
  const t = inf.jugadoresRival;
  if (!t || !t.filas.length) return '';

  const filas = t.filas.map(f => {
    const g = SCOUT_UI.marcas[f.clave] || {};
    const consigna = g.consigna !== undefined ? g.consigna : f.marca.consigna;
    const restriccion = g.restriccion !== undefined ? g.restriccion : f.marca.restriccion;
    return `
      <tr class="border-b border-hairline/40 last:border-0 align-top">
        <td class="px-2 py-2">
          <p class="text-xs text-white">${escapeHtml(f.nombre)}</p>
          <p class="text-[10px] dato-sec">${escapeHtml(f.marca.etiqueta)} · ${escapeHtml(SGADD.formatear('MIN', f.perfil.min))} min</p>
        </td>
        <td class="px-2 py-2">
          <input type="text" value="${escapeAttr(g.defensor || '')}" placeholder="Nuestro defensor"
            oninput="scoutMarca('${escapeAttr(f.clave)}', 'defensor', this.value)"
            class="w-full bg-surface2 border border-hairline rounded px-2 py-1 text-xs focus:border-accent outline-none">
        </td>
        <td class="px-2 py-2">
          <input type="text" value="${escapeAttr(consigna)}"
            oninput="scoutMarca('${escapeAttr(f.clave)}', 'consigna', this.value)"
            class="w-full bg-surface2 border border-hairline rounded px-2 py-1 text-xs text-accent focus:border-accent outline-none">
        </td>
        <td class="px-2 py-2">
          <input type="text" value="${escapeAttr(restriccion)}"
            oninput="scoutMarca('${escapeAttr(f.clave)}', 'restriccion', this.value)"
            class="w-full bg-surface2 border border-hairline rounded px-2 py-1 text-xs focus:border-accent outline-none">
        </td>
        <td class="px-2 py-2 text-[10px] text-muted leading-snug">${escapeHtml(f.marca.porque)}</td>
      </tr>`;
  }).join('');

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="marcas">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">🛡 Plan individual · marca asignada</h4>
      <p class="text-[11px] text-muted mb-3">
        La consigna y la restricción vienen sugeridas por el perfil de cada rival — son editables:
        el que define el plan es el cuerpo técnico, no el modelo.
      </p>
      <div class="scrollbox"><table class="w-full text-left" style="min-width:52rem">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1" style="width:15%">Jugador rival</th>
          <th class="px-2 pb-1" style="width:16%">Defensor nuestro</th>
          <th class="px-2 pb-1" style="width:21%">Consigna técnica</th>
          <th class="px-2 pb-1" style="width:19%">Restricción / alerta</th>
          <th class="px-2 pb-1" style="width:29%">Por qué</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
    </section>`;
}

/* ===================== BLOQUE 5 · TABLA DE JUGADORES ===================== */

function scoutBloqueJugadores(inf) {
  const t = inf.jugadoresRival;
  if (!t || !t.filas.length) return '';

  const th = t.columnas.map(c => `<th class="px-2 pb-1 text-center whitespace-nowrap">${escapeHtml(c.label)}</th>`).join('');
  const filas = t.filas.map(f => `
    <tr class="border-b border-hairline/40 last:border-0">
      <td class="px-2 py-1.5 text-xs text-white whitespace-nowrap">${escapeHtml(f.nombre)}</td>
      ${t.columnas.map(c => {
        const cel = f.celdas[c.id];
        /* Semáforo: oro/plata/bronce por puesto interno. El color dice
           "acá está el especialista del plantel", no "esto es bueno". */
        const col = !cel.destacado ? null
          : cel.puestoInterno === 1 ? '#f59e0b'
            : cel.puestoInterno === 2 ? '#a3a3a3' : '#b45309';
        return `<td class="px-2 py-1.5 text-center">
          <span class="font-mono text-xs ${cel.destacado ? 'font-bold px-1 rounded' : 'text-ink'}"
            ${col ? `style="color:${col};background:${col}1a"` : ''}>${escapeHtml(cel.formateado)}</span>
          ${cel.sub ? `<span class="block text-[9px] font-mono dato-sec">${escapeHtml(cel.sub.clave)}: ${escapeHtml(cel.sub.formateado)}</span>` : ''}
        </td>`;
      }).join('')}
    </tr>`).join('');

  const cierre = (prom, etiqueta) => `
    <tr class="border-t border-hairline">
      <td class="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted font-display whitespace-nowrap">${escapeHtml(etiqueta)}</td>
      ${t.columnas.map(c => `<td class="px-2 py-1.5 text-center font-mono text-[11px] dato-sec">${escapeHtml(prom[c.id].formateado)}</td>`).join('')}
    </tr>`;

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="jugadores">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">👥 Jugadores clave · ${escapeHtml(t.equipo)}</h4>
      <p class="text-[11px] text-muted mb-3">
        Semáforo 🥇🥈🥉 sobre el top ${SGADD_SCOUT.TOP_SEMAFORO} de cada métrica dentro de este plantel:
        marca dónde está el especialista, no si el número es bueno para la liga.
      </p>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1 text-left">Jugador</th>${th}
        </tr></thead>
        <tbody>
          ${filas}
          ${cierre(t.promedioEquipo, 'Prom. jugadores/equipo')}
          ${cierre(t.promedioLiga, 'Prom. jugadores/liga')}
        </tbody>
      </table></div>
    </section>`;
}

/* ===================== BLOQUE 6 · RESUMEN Y CLAVES ===================== */

function scoutBloqueClaves(inf) {
  const bullets = inf.claves.map(c => `
    <li class="flex gap-2 items-start">
      <span class="shrink-0 text-sm leading-tight">${c.icono}</span>
      <p class="text-[11px] leading-snug">
        <span class="text-white font-semibold">${escapeHtml(c.titulo)}:</span>
        <span class="text-ink">${escapeHtml(c.texto)}</span>
      </p>
    </li>`).join('');

  return `
    <section class="scout-bloque card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="claves">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-2">🧠 Criterio estratégico y claves de anticipación</h4>
      ${inf.resumen ? `<div class="bg-surface2/40 rounded-lg p-3 mb-3">
        <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1">Resumen ejecutivo</p>
        <p class="text-[11px] text-ink leading-snug">${escapeHtml(inf.resumen)}</p>
      </div>` : ''}
      ${bullets ? `<ul class="space-y-2">${bullets}</ul>`
        : `<p class="text-[11px] text-muted">Ninguna métrica del rival dispara una clave específica: el plan es sostener la estructura defensiva propia.</p>`}
    </section>`;
}

/* ===================== ARMADO ===================== */

function scoutInforme(idx) {
  if (!SCOUT_UI.local || !SCOUT_UI.visitante) {
    return `<div class="card rounded-xl p-8 border border-hairline text-center text-muted text-sm mt-4">
      Elegí los dos equipos del cruce para generar el informe.</div>`;
  }
  const inf = SGADD_SCOUT.informePrePartido(idx, SCOUT_UI.local, SCOUT_UI.visitante,
    SCOUT_UI.claveRival ? { claveRival: SCOUT_UI.claveRival } : {});
  if (!inf.ok) return '<div class="mt-4">' + SGADD_UI.aviso('No se pudo armar el informe', inf.motivo, 'error') + '</div>';

  /* Selector del equipo scouteado: por defecto el motor elige el rival (el
     que no es del club), pero preparar un partido ajeno es un caso real. */
  const eR = idx.get(inf.claveRival), eN = idx.get(inf.claveNuestro);
  const toggle = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[10px] uppercase tracking-wider text-muted font-display">Scouting sobre</span>
      ${[eR, eN].map(e => `<button type="button" onclick="scoutCambiarObjetivo('${escapeAttr(e.clave)}')"
        class="px-3 py-1 text-[11px] rounded border transition-colors ${e.clave === inf.claveRival
          ? 'bg-accent text-black border-accent font-semibold' : 'border-hairline text-muted hover:text-ink'}"
        >${escapeHtml(e.nombre)}</button>`).join('')}
    </div>`;

  return `
    <div id="scoutInforme" class="space-y-4 mt-4">
      ${toggle}
      ${scoutBloqueEncabezado(inf)}
      ${scoutBloqueMatriz(inf)}
      ${scoutBloqueCiclo(inf)}
      ${scoutBloqueMarcas(inf)}
      ${scoutBloqueJugadores(inf)}
      ${scoutBloqueClaves(inf)}
    </div>`;
}
