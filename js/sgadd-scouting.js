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

  /* Umbrales compartidos con el motor de JUGADORES. Se leen de allá, no se
     copian: un número duplicado es un número que en algún momento va a
     quedar distinto en cada archivo y a etiquetar al mismo jugador de dos
     formas — exactamente el bug que este módulo cerró. */
  const COMPARTIDOS = (function () {
    if (typeof JUGADORES_UMBRALES !== 'undefined') return JUGADORES_UMBRALES;
    try { return require('./sgadd-jugadores.js').JUGADORES_UMBRALES; } catch (e) { return {}; }
  })();

  /* Umbrales del plan individual. */
  const U = {
    concentracionAlta: 0.20,   // >20% de los plays del equipo = eje de eficiencia
    pptTripleElite: 1.20,      // 1,20 pts por triple intentado = hay que cerrarlo
    pptTriplePobre: 0.90,      // por debajo de 0,90 conviene regalárselo
    usoLibreAlto: 0.10,        // 10% de sus plays terminan en la línea
    t1Confiable: 0.75,         // no mandarlo a la línea
    t1Pobre: 0.60,             // castigable, pero NO con falta sistemática
    perdidasAltas: 1.25,       // x la mediana de la liga → presionable

    /* --- Compartidos con el rol funcional (sgadd-jugadores.js) --- */
    usoTripleAlto: COMPARTIDOS.usoTripleAlto,
    reboteOfensivoAlto: COMPARTIDOS.reboteOfensivoAlto,
    pptDobleAlto: COMPARTIDOS.pptDobleAlto,
    minutosClave: COMPARTIDOS.minutosClave,
    mezclaTripleaPerimetral: COMPARTIDOS.mezclaTripleaPerimetral,
    mezclaTripleInterior: COMPARTIDOS.mezclaTripleInterior,
    reboteInterior: COMPARTIDOS.reboteInterior,
    astPPGenerador: COMPARTIDOS.astPPGenerador,
    astVolumenGenerador: COMPARTIDOS.astVolumenGenerador,

    /* --- Falta táctica: criterio restrictivo a propósito ---
       Mandar a la línea es la excepción, no el plan. Solo con un T1%
       realmente malo (< 40%) Y volumen interno: al que tira 45% de libres
       igual le estás dando 0,90 puntos por posesión, que es más de lo que
       vale una posesión promedio en estas ligas. */
    t1Regalable: 0.40,
    usoDobleInterno: 0.45,

    /* --- Pisos de tiro externo ---
       Estos SÍ son absolutos porque son economía del básquet, no de la
       liga: 1,05 pts por triple intentado supera el valor de una posesión
       promedio en cualquier categoría, así que a ese tirador no se le
       flota ni aunque sea el peor de su liga. Se combinan con la banda
       contextual: hace falta que se cumpla el piso duro O que esté por
       encima de la liga. */
    pptTripleRentable: 1.05,   // por encima de esto, prohibido flotar
    t3Rentable: 0.35,
    pptTripleFrio: 0.88,       // por debajo, se le contesta sin desarmar
    t3Frio: 0.30,
    /* Volumen mínimo de triples por partido para considerarlo "tirador
       sistemático". Debajo de esto la muestra no alcanza para una regla. */
    volumenTripleSistematico: 2.5,
    /* Cuánto de los triples del equipo tiene que concentrar para que su
       tiro sea "la vía principal de ataque" y quede prohibido invitarlo. */
    viaPrincipalTriple: 0.25,
  };

  /* =====================================================================
     BANDAS CONTEXTUALES CONTRA LA LIGA

     Ninguna decisión táctica individual se toma solo contra un umbral
     absoluto: primero se mide cuánto se desvía el jugador de la media de
     jugadores calificados de ESTA liga. Un PPT3 de 1,05 es de élite en una
     liga y del montón en otra; el umbral fijo miente al cambiar de
     categoría, el z-score no.

     Se usa media/desvío (no percentil) porque las reglas del pedido están
     expresadas en sigmas, y porque el percentil comprime los extremos:
     entre el 1° y el 3° de la liga puede haber medio punto de PPT3 y los
     tres caer en "percentil 95".
     ===================================================================== */

  const BANDAS = [
    { id: 'elite', z: 1.2, label: 'Muy por encima de la liga', tono: 'muy-alto' },
    { id: 'superior', z: 0.5, label: 'Por encima de la liga', tono: 'alto' },
    { id: 'estandar', z: -0.5, label: 'En el promedio de la liga', tono: 'medio' },
    { id: 'limitado', z: -1.2, label: 'Por debajo de la liga', tono: 'bajo' },
    { id: 'fuga', z: -Infinity, label: 'Muy por debajo de la liga', tono: 'muy-bajo' },
  ];

  /** Media y desvío de una métrica sobre los jugadores calificados. */
  function statLiga(idx, metrica) {
    const vals = (idx.liga.distribucionesJ && idx.liga.distribucionesJ[metrica]) || [];
    if (vals.length < 3) return null;
    const media = vals.reduce((a, v) => a + v, 0) / vals.length;
    const varianza = vals.reduce((a, v) => a + (v - media) * (v - media), 0) / vals.length;
    return { media: media, desvio: Math.sqrt(varianza), n: vals.length };
  }

  /**
   * Ubica un valor en las cinco bandas contextuales. `invertida` da vuelta
   * el signo del z (en %TOV, menos es mejor), para que "elite" signifique
   * siempre lo mismo: mejor que la liga.
   */
  function bandaLiga(idx, metrica, valor, invertida) {
    const s = statLiga(idx, metrica);
    if (s === null || nn(valor) === null || s.desvio === 0) return null;
    const z = ((valor - s.media) / s.desvio) * (invertida ? -1 : 1);
    const b = BANDAS.find(d => z >= d.z);
    return { id: b.id, label: b.label, tono: b.tono, z: z, media: s.media, desvio: s.desvio, n: s.n };
  }

  /** ¿La banda está por encima del estándar de la liga? */
  function porEncima(b) { return !!b && (b.id === 'elite' || b.id === 'superior'); }
  /** ¿Por debajo? */
  function porDebajo(b) { return !!b && (b.id === 'limitado' || b.id === 'fuga'); }

  /* =====================================================================
     ROLES FUNCIONALES — sin posiciones tradicionales

     Cascada excluyente, del rol que más condiciona el plan al que menos.
     Cada test cruza CUATRO fuentes, no una sola métrica:
       1. la ficha de la pestaña JUGADORES (arquetipos ya calculados),
       2. el volumen real de lanzamientos (T3I vs T2I),
       3. la generación de juego (AST y AST-PP),
       4. el impacto en los cristales (RO/RO%, RD/RD%).

     `esPerimetral` es la guarda que impide el bug original: un jugador con
     PPT2 alto pero que lanza de afuera y no rebotea NUNCA cae en los roles
     internos, cae en Slasher.
     ===================================================================== */
  /* Los ROLES FUNCIONALES viven en `sgadd-jugadores.js` (JUGADORES_ROLES_FUNCIONALES).
     Acá solo se re-exporta la referencia para que los tests y la UI de
     scouting puedan leerla sin duplicar la cascada. */
  function rolesFuncionales() {
    const f = fichaJugadores();
    if (typeof JUGADORES_ROLES_FUNCIONALES !== 'undefined') return JUGADORES_ROLES_FUNCIONALES;
    try { return require('./sgadd-jugadores.js').JUGADORES_ROLES_FUNCIONALES; } catch (e) { return []; }
  }


  /* =====================================================================
     PERFILES DEFENSIVOS DE NUESTRO PLANTEL

     La columna "Defensor nuestro" sugiere un PERFIL, no un nombre propio:
     quién lo cubre depende de quién esté en cancha y de las faltas de cada
     uno. El DT reemplaza el perfil por el nombre cuando arma el quinteto.
     ===================================================================== */
  const PERFILES_DEFENSOR = {
    perimetral1x1: 'Especialista 1x1 Perimetral',
    fisico: 'Defensor Físico de Contención',
    atrapador: 'Atrapador / Presión al Drible',
    spacing: 'Defensor de Ajuste / Spacing',
    ancla: 'Ancla Interior / Protector de Aro',
    versatil: 'Defensor Versátil / Cambios (Switch)',
  };

  /* =====================================================================
     MARCA ASIGNADA — "elegir el veneno" con soluciones de campo

     Cascada excluyente, ordenada de la amenaza más cara a la más barata.
     Todas las consignas son de CAMPO (flotación, ice, drop, show corto,
     negación de catch & shoot, cierre de esquinas, ayuda de lado débil).
     La falta táctica quedó reducida a un solo perfil y con un umbral duro
     (T1% < 40% + volumen interno): mandar a la línea a alguien que
     convierte 60% es regalarle 1,20 puntos por posesión.
     ===================================================================== */
  const PERFILES_MARCA = [
    {
      id: 'tirador-elite',
      etiqueta: 'Amenaza perimetral de élite',
      defensor: PERFILES_DEFENSOR.perimetral1x1,
      consigna: 'TOP LOCK / NEGACIÓN DE CATCH & SHOOT',
      restriccion: 'PASAR SIEMPRE POR ARRIBA · NO AYUDAR DESDE ÉL',
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple >= U.pptTripleElite,
      porque: (p) => 'concentra ' + pct(p.usoTriple) + ' de sus plays en el triple con ' +
        num2(p.pptTriple) + ' pts por intento: negarle la recepción cuesta menos que cerrarle el tiro.',
    },
    {
      /* REGLA DURA: tirador eficiente aunque anote poco. El error que
         corrige es tratar "pocos puntos" como "no es amenaza": un
         especialista de banco que mete el 38% castiga cualquier ayuda que
         salga de él. Va ARRIBA de todo lo interno y de todo lo de
         flotación a propósito — es la marca que no se puede equivocar. */
      id: 'tirador-eficiente-bajo-volumen',
      etiqueta: 'Tirador eficiente (poco volumen, alta renta)',
      defensor: PERFILES_DEFENSOR.perimetral1x1,
      consigna: 'STAY HOME / NEGACIÓN DE CATCH & SHOOT',
      restriccion: 'PROHIBIDO FLOTAR O AYUDAR DESDE ÉL',
      test: (p) => p.tiraDeAfuera && p.tiroExternoRentable,
      porque: (p) => 'convierte ' + pct(p.t3) + ' de triple con ' + num2(p.pptTriple) +
        ' pts por intento (' + (p.bandaPptTriple ? p.bandaPptTriple.label.toLowerCase() : 'sin referencia de liga') +
        '): anota poco por volumen, no por eficiencia — soltarlo es regalarle el tiro más caro.',
    },
    {
      /* Contracara: mucho volumen, poca renta. No es "flotar y listo":
         si tira 6 triples por partido hay que contestarle igual, pero sin
         desarmar la estructura defensiva por él. */
      id: 'tirador-sistematico-frio',
      etiqueta: 'Tirador sistemático de bajo porcentaje',
      defensor: PERFILES_DEFENSOR.spacing,
      consigna: 'CLOSE-OUT CORTO / CONTESTAR SIN SALTAR',
      restriccion: 'NO CORRER EL CIERRE · MANTENER LA ESTRUCTURA',
      test: (p) => p.tiradorSistematico && p.tiroExternoFrio,
      porque: (p) => 'lanza ' + num1(p.t3i) + ' triples por partido con ' + pct(p.t3) + ' de acierto (' +
        num2(p.pptTriple) + ' PPT3): hay que puntearle la mano, pero no romper la defensa para hacerlo.',
    },
    {
      id: 'interior-dominante',
      etiqueta: 'Referencia interna',
      defensor: PERFILES_DEFENSOR.ancla,
      consigna: 'FRONT / 3-4 POR DELANTE · NEGAR RECEPCIÓN',
      restriccion: 'AYUDA DE LADO DÉBIL AL PASE INTERIOR · BOX-OUT DE CHOQUE',
      /* `esInterior` es obligatorio: sin esa guarda, un slasher con buen
         PPT2 entraba acá y se le asignaba una marca de poste bajo. */
      test: (p) => p.esInterior && p.pptDoble >= U.pptDobleAlto,
      porque: (p) => 'rinde ' + num2(p.pptDoble) + ' por doble intentado desde adentro y pesa en el cristal (' +
        num2(p.reboteRel) + 'x la liga en RO%): la pelea es por la posición previa a la recepción.',
    },
    {
      id: 'slasher',
      etiqueta: 'Slasher / penetrador',
      defensor: PERFILES_DEFENSOR.fisico,
      consigna: 'CONTENCIÓN DE MANO DOMINANTE · CIERRE DE CAMINOS',
      restriccion: 'SIN SALTAR AL AMAGUE · AYUDA CORTA Y RECUPERO',
      test: (p) => p.esPerimetral && p.pptDoble >= U.pptDobleAlto,
      porque: (p) => 'ataca el aro desde afuera con ' + num2(p.pptDoble) +
        ' por doble intentado: el daño es en el primer paso, no de espaldas.',
    },
    {
      id: 'generador-riesgoso',
      etiqueta: 'Conductor con pérdidas altas',
      defensor: PERFILES_DEFENSOR.atrapador,
      consigna: 'ICE EN P&R · PRESIÓN AL DRIBLE EN MITAD DE CANCHA',
      restriccion: 'FORZAR EL ERROR SIN FALTA · ROTACIÓN PREPARADA',
      test: (p) => p.perdidasRel >= U.perdidasAltas && p.min >= U.minutosClave,
      porque: (p) => 'pierde ' + pct(p.perdidas) + ' de sus plays, ' + num2(p.perdidasRel) +
        'x la mediana de la liga: el error propio es más barato que defenderle la jugada.',
    },
    {
      id: 'castigable-en-la-linea',
      etiqueta: 'Vulnerable en la línea',
      defensor: PERFILES_DEFENSOR.fisico,
      consigna: 'VERTICALIDAD SIN CONTACTO · SI FINALIZA ADENTRO, FALTA DURA',
      restriccion: 'ÚNICO PERFIL DONDE LA FALTA ES NEGOCIO',
      /* El umbral es duro a propósito: T1% < 40% Y volumen interno real. */
      test: (p) => p.t1 !== null && p.t1 < U.t1Regalable && p.usoDoble >= U.usoDobleInterno,
      porque: (p) => 'convierte ' + pct(p.t1) + ' de libres con ' + pct(p.usoDoble) +
        ' de sus plays adentro: acá sí el cambio de una finalización por dos libres es ganancia.',
    },
    {
      /* La invitación al tiro es la consigna más fácil de aplicar mal.
         Tiene TRES condiciones acumuladas: renta baja en términos
         absolutos, por debajo de la liga en su contexto, y que su tiro no
         sea la vía principal del ataque rival. Si falla cualquiera, el
         jugador ya cayó antes en `tirador-sistematico-frio` (contestar
         sin saltar) o en `tirador-eficiente-bajo-volumen` (stay home). */
      id: 'tirador-ineficiente',
      etiqueta: 'Tirador de volumen sin renta',
      defensor: PERFILES_DEFENSOR.spacing,
      consigna: 'UNDER / FLOTACIÓN · CERRAR PENETRACIÓN',
      restriccion: 'INVITACIÓN AL TIRO EXTERNO · NO CORRER EL CLOSE-OUT',
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple <= U.pptTriplePobre &&
        !p.tiroExternoRentable && !p.viaPrincipalExterna,
      porque: (p) => 'tira mucho de afuera (' + pct(p.usoTriple) + ' de sus plays) y saca ' +
        num2(p.pptTriple) + ' por intento sin ser la vía principal del ataque rival: ese tiro nos conviene.',
    },
    {
      /* Volumen alto con eficiencia por debajo de la liga. La regla que
         pidió el club: si tira mucho y le rinde poco, la consigna es
         permitirle el tiro externo en vez de salir a buscarlo. Va DESPUÉS
         de las tres reglas de tiro externo para no pisar al especialista
         eficiente, y se apoya en la misma banda de eFG% que muestra la
         ficha del jugador — no en un umbral propio. */
      id: 'volumen-sin-eficiencia',
      etiqueta: 'Volumen alto, eficiencia baja',
      defensor: PERFILES_DEFENSOR.spacing,
      consigna: 'PERMITIR EL TIRO EXTERNO · CERRAR LA PINTURA',
      restriccion: 'NO DOBLAR · QUE RESUELVA ÉL',
      test: (p) => p.concentracion !== null && p.concentracion >= U.concentracionAlta &&
        !p.tiroExternoRentable && (porDebajo(p.bandaEfg) ||
          (p.efg !== null && p.bandaEfg !== null && p.bandaEfg.id === 'fuga')),
      porque: (p) => 'concentra ' + pct(p.concentracion) + ' de los plays del equipo con un eFG% de ' +
        pct(p.efg) + ' (' + (p.bandaEfg ? p.bandaEfg.label.toLowerCase() : 'sin referencia') +
        '): cuanto más resuelva él, mejor para nosotros.',
    },
    {
      id: 'rebotador',
      etiqueta: 'Rebotador de impacto',
      defensor: PERFILES_DEFENSOR.fisico,
      consigna: 'BOX-OUT DE CHOQUE · SACARLO DEL SEMICÍRCULO',
      restriccion: 'NO DEJARLO ENTRAR EN CARRERA AL REBOTE',
      test: (p) => p.reboteRel !== null && p.reboteRel >= U.reboteOfensivoAlto,
      porque: (p) => 'captura ' + num2(p.reboteRel) + 'x la mediana de la liga en rebote ofensivo: ' +
        'las segundas chances son su vía de anotación.',
    },
    {
      id: 'contencion',
      etiqueta: 'Rol complementario',
      defensor: PERFILES_DEFENSOR.versatil,
      consigna: 'DROP COVERAGE · CLOSE-OUT CORTO',
      restriccion: 'AYUDAR DESDE ÉL · SIN FALTA',
      test: () => true,   // fallback: siempre calza
      porque: () => 'no concentra volumen ni tiene una amenaza dominante: es el lado por donde conviene ayudar.',
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

  /* `rankPor` es la métrica con la que se ORDENA el semáforo, que no
     siempre es la que se muestra:

     - PTS/PLAY muestra los puntos (número grande) con el PPP debajo, pero
       el top-3 se decide por PTS: la pregunta del bloque es quién anota,
       y el PPP es el contexto de rentabilidad.
     - Las tres columnas de uso muestran el % de plays del jugador, pero
       rankean por INTENTOS ABSOLUTOS (T3I/T2I/T1I). Un suplente que tiró
       3 triples en el torneo puede tener 60% de uso externo y no es un
       tirador: el semáforo tiene que marcar volumen real dentro de la
       estructura del equipo, no una fracción sobre una muestra mínima. */
  const COLS_JUGADOR = [
    { id: 'MIN', label: 'MIN', formato: 'num1' },
    { id: 'PLAYS', label: 'PLAYS', formato: 'num1' },
    { id: 'eFG%', label: 'eFG%', formato: 'pct' },
    { id: 'PTS', label: 'PTS / PLAY', formato: 'num1', sub: 'PPP', rankPor: 'PTS', destacada: true },
    { id: 'PT3%', label: '%USO 3PTS', formato: 'pct', sub: 'PPT3', rankPor: 'T3I' },
    { id: 'PT2%', label: '%USO 2PTS', formato: 'pct', sub: 'PPT2', rankPor: 'T2I' },
    { id: 'PT1%', label: '%USO TL', formato: 'pct', sub: 'PPT1', rankPor: 'T1I' },
    /* %TOV es invertida: menos es mejor. El semáforo igual marca a los que
       MÁS pierden, porque son a quienes conviene presionar — el color
       señala dónde mirar, no quién es bueno. */
    { id: 'PePP%', label: '%TOV', formato: 'pct', invertida: true },
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
   * Ficha de la pestaña JUGADORES. Es la fuente PRIMARIA del perfil: los
   * arquetipos ya están calculados ahí contra la liga y no tiene sentido
   * recalcularlos con otro criterio (dos motores de perfil que se
   * contradigan entre secciones es peor que no tener ninguno).
   *
   * Se resuelve tarde, no al cargar el módulo: en el navegador son globals
   * de `sgadd-jugadores.js` y en Node llegan por `require`, y así el orden
   * de carga de los <script> deja de importar.
   *
   * NOTA: la planilla no tiene columna de TALLA ni de posición cargada a
   * mano, así que "datos base de perfil" son los arquetipos calculados,
   * no una ficha física. Si algún día entra una columna de altura, el
   * cruce se enriquece acá y en ningún otro lado.
   */
  function fichaJugadores() {
    if (typeof jugadoresADN === 'function') {
      return {
        adn: jugadoresADN, perfilBase: jugadoresPerfilBase,
        rolFuncional: jugadoresRolFuncional, badges: jugadoresBadges,
      };
    }
    try {
      const m = require('./sgadd-jugadores.js');
      return {
        adn: m.jugadoresADN, perfilBase: m.jugadoresPerfilBase,
        rolFuncional: m.jugadoresRolFuncional, badges: m.jugadoresBadges,
      };
    } catch (e) { return null; }
  }

  /**
   * Perfil crudo de un jugador para el plan individual. Se arma una sola
   * vez y lo consumen la marca asignada, el rol funcional, la ficha y las
   * claves estratégicas: si cada uno leyera las columnas por su cuenta, un
   * cambio de umbral quedaría aplicado en un lado y no en el otro.
   */
  function perfilJugador(idx, j, totalPlaysEquipo, totalTriplesEquipo) {
    const ficha = fichaJugadores();
    /* La base sale ENTERA del motor de JUGADORES: mismas métricas, mismos
       relativos a la liga, mismos discriminantes de origen. Acá solo se
       agrega lo que depende del plantel, que es lo único que Jugadores no
       puede saber (cuánto del equipo pasa por él). */
    const p = (ficha && ficha.perfilBase) ? ficha.perfilBase(idx, j) : {};
    p.concentracion = div(nn(j['PLAYS']), totalPlaysEquipo);

    /* Etiquetas del ADN compartido, para que el informe muestre las mismas
       que la ficha del jugador. */
    const adn = (ficha && ficha.adn) ? ficha.adn(idx, j) : null;
    p.adn = adn;
    p.jerarquia = adn && adn.jerarquia ? adn.jerarquia.label : null;
    p.rolMinutos = adn && adn.rolMinutos ? adn.rolMinutos.label : null;
    if (!Array.isArray(p.arquetipos)) p.arquetipos = [];
    /* --- Lectura contextual del tiro externo ---
       Acá se decide si se le flota o no, que es la consigna más cara de
       equivocar. Cada flag combina el piso absoluto (economía del básquet)
       con la banda contra la liga (contexto de la categoría): alcanza con
       cualquiera de los dos para tratarlo como amenaza, pero hacen falta
       los dos para tratarlo como regalable. */
    p.bandaPptTriple = bandaLiga(idx, 'PPT3', p.pptTriple, false);
    p.bandaT3 = bandaLiga(idx, 'T3%', p.t3, false);
    p.bandaEfg = bandaLiga(idx, 'eFG%', p.efg, false);
    p.bandaTov = bandaLiga(idx, 'PePP%', p.perdidas, true);
    p.bandaT1 = bandaLiga(idx, 'T1%', p.t1, false);

    /* Tira de afuera de verdad: sin volumen mínimo no hay regla que valga,
       dos triples en todo el torneo no describen a nadie. */
    p.tiraDeAfuera = (p.t3i !== null && p.t3i >= 1.0);
    p.tiradorSistematico = (p.t3i !== null && p.t3i >= U.volumenTripleSistematico);

    /* Rentable = supera el piso duro O está por encima de su liga. */
    p.tiroExternoRentable = p.tiraDeAfuera && (
      (p.pptTriple !== null && p.pptTriple >= U.pptTripleRentable) ||
      (p.t3 !== null && p.t3 >= U.t3Rentable) ||
      porEncima(p.bandaPptTriple) || porEncima(p.bandaT3));

    /* Frío = por debajo del piso Y por debajo de su liga (o sin
       referencia de liga, en cuyo caso manda el piso absoluto). */
    p.tiroExternoFrio = !p.tiroExternoRentable && (
      (p.pptTriple !== null && p.pptTriple < U.pptTripleFrio) ||
      (p.t3 !== null && p.t3 < U.t3Frio) ||
      porDebajo(p.bandaPptTriple) || porDebajo(p.bandaT3));

    /* ¿Su tiro externo es la vía principal del ataque rival? Si concentra
       una porción grande de los triples del equipo, invitarlo a tirar es
       invitar al equipo entero a hacer lo que mejor sabe. */
    p.cuotaTriplesEquipo = div(p.t3i, totalTriplesEquipo);
    p.viaPrincipalExterna = p.cuotaTriplesEquipo !== null &&
      p.cuotaTriplesEquipo >= U.viaPrincipalTriple;

    return p;
  }

  /** Rol funcional: delega en el motor de JUGADORES. No hay una segunda
      cascada acá — que existiera es lo que hacía que el mismo jugador
      tuviera un rol en el informe y otro en su ficha. */
  function rolFuncional(perfil) {
    const ficha = fichaJugadores();
    if (ficha && ficha.rolFuncional) return ficha.rolFuncional(perfil);
    return { id: 'complementario', label: 'Rol Complementario', detalle: '' };
  }

  /** Marca asignada sugerida: primera de la cascada que calza. */
  function marcaSugerida(perfil) {
    const p = PERFILES_MARCA.find(d => {
      try { return d.test(perfil); } catch (e) { return false; }
    }) || PERFILES_MARCA[PERFILES_MARCA.length - 1];
    return {
      id: p.id, etiqueta: p.etiqueta,
      defensor: p.defensor,
      consigna: p.consigna, restriccion: p.restriccion,
      porque: p.porque(perfil),
    };
  }

  /* =====================================================================
     FICHA DE ANÁLISIS DE RIVAL (por jugador)

     Fortalezas = por dónde nos daña. Fugas = por dónde lo atacamos. Cada
     bullet es métrica + lectura táctica, nunca la métrica sola: un "PPT3
     1,35" sin la consecuencia en cancha no es scouting, es una planilla.
     ===================================================================== */

  function fortalezasJugador(p) {
    const out = [];
    if (p.pptTriple !== null && p.usoTriple !== null &&
        p.pptTriple >= U.pptTripleElite && p.usoTriple >= 0.25) {
      out.push('PPT3 ' + num2(p.pptTriple) + ' sobre ' + pct(p.usoTriple) +
        ' de uso: castiga cualquier ayuda que lo deje solo en el perímetro.');
    } else if (p.tiroExternoRentable && p.tiraDeAfuera) {
      /* El caso del especialista de pocos minutos: anota poco pero su
         tiro es caro. Sin esta rama quedaba invisible en las fortalezas. */
      out.push('T3% ' + pct(p.t3) + ' con ' + num1(p.t3i) + ' intentos por partido' +
        (p.bandaPptTriple ? ' (' + p.bandaPptTriple.label.toLowerCase() + ' en PPT3)' : '') +
        ': volumen bajo, pero cada tiro liberado es caro.');
    }
    if (p.pptDoble !== null && p.pptDoble >= U.pptDobleAlto) {
      out.push('PPT2 ' + num2(p.pptDoble) + ': ' + (p.esInterior
        ? 'finaliza de espaldas y gana la posición previa a la recepción.'
        : 'gana el primer paso y termina en carrera.'));
    }
    if (p.astPP !== null && p.astPP >= U.astPPGenerador) {
      out.push('AST-PP ' + num2(p.astPP) + ': genera ventaja para terceros, no solo para él.');
    }
    if (p.reboteRel !== null && p.reboteRel >= U.reboteOfensivoAlto) {
      out.push('RO% ' + num2(p.reboteRel) + 'x la liga: convierte tiros errados en segundas chances.');
    }
    if (p.t1 !== null && p.t1 >= U.t1Confiable && p.usoLibre !== null && p.usoLibre >= U.usoLibreAlto) {
      out.push('T1% ' + pct(p.t1) + ' con ' + pct(p.usoLibre) + ' de sus plays en la línea: el contacto le rinde.');
    }
    if (p.usg !== null && p.concentracion !== null && p.concentracion >= U.concentracionAlta) {
      out.push('Concentra ' + pct(p.concentracion) + ' de los plays del equipo: el ataque pasa por él.');
    }
    if (!out.length) out.push('Sin una fortaleza que se despegue del resto del plantel: no condiciona el plan.');
    return out;
  }

  function fugasJugador(p) {
    const out = [];
    if (p.pptTriple !== null && p.usoTriple !== null &&
        p.pptTriple <= U.pptTriplePobre && p.usoTriple >= 0.30) {
      out.push('PPT3 ' + num2(p.pptTriple) + ' con ' + pct(p.usoTriple) +
        ' de uso externo: su tiro preferido es el que menos le rinde.');
    }
    if (p.perdidasRel !== null && p.perdidasRel >= U.perdidasAltas) {
      out.push('%TOV ' + pct(p.perdidas) + ' (' + num2(p.perdidasRel) +
        'x la liga): pierde bajo presión sostenida al drible.');
    }
    if (p.t1 !== null && p.t1 < U.t1Regalable) {
      out.push('T1% ' + pct(p.t1) + ': la línea es su peor escenario de finalización.');
    }
    if (p.esInterior && (p.usoTriple === null || p.usoTriple < 0.10)) {
      out.push('Sin amenaza de triple (' + pct(p.usoTriple || 0) +
        ' de uso): alejarlo del aro lo saca de la jugada.');
    }
    if (p.astPP !== null && p.astPP < 0.80) {
      out.push('AST-PP ' + num2(p.astPP) + ': si lo contenemos sin falta, la posesión muere en sus manos.');
    }
    if (p.efg !== null && p.efg < 0.45) {
      out.push('eFG% ' + pct(p.efg) + ': su volumen no viene acompañado de eficiencia.');
    }
    if (!out.length) out.push('Sin una fisura clara: el plan pasa por reducirle volumen, no por explotar una debilidad.');
    return out;
  }

  /** Ficha completa de un jugador rival, lista para pintar. */
  function fichaRival(idx, j, totalPlaysEquipo, totalTriplesEquipo) {
    const p = perfilJugador(idx, j, totalPlaysEquipo, totalTriplesEquipo);
    return {
      nombre: p.nombre, clave: p.clave, perfil: p,
      rol: rolFuncional(p),
      marca: marcaSugerida(p),
      fortalezas: fortalezasJugador(p),
      fugas: fugasJugador(p),
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
    /* Sobre el plantel COMPLETO, no sobre los elegidos: la cuota de
       triples de un jugador se mide contra todo lo que tira el equipo. */
    const totalTriples = plantel.reduce((s, j) => s + (nn(j['T3I']) || 0), 0);

    /* Semáforo: top 3 por métrica DENTRO de los elegidos, ordenado por
       `rankPor` cuando la columna lo define (volumen absoluto de tiros,
       puntos) y por el valor mostrado cuando no. Siempre descendente:
       "más" es lo destacable en todas las columnas, incluida %TOV. */
    const top = {};
    COLS_JUGADOR.forEach(c => {
      const metricaRank = c.rankPor || c.id;
      top[c.id] = elegidos
        .map(j => ({ clave: j.__clave, v: nn(j[metricaRank]) }))
        .filter(x => x.v !== null)
        .sort((a, b) => b.v - a.v)
        .slice(0, TOP_SEMAFORO)
        .map(x => x.clave);
    });

    const filas = elegidos.map(j => {
      const perfil = perfilJugador(idx, j, totalPlays, totalTriples);
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
      return {
        clave: j.__clave, nombre: perfil.nombre, perfil: perfil, celdas: celdas,
        rol: rolFuncional(perfil),
        marca: marcaSugerida(perfil),
        fortalezas: fortalezasJugador(perfil),
        fugas: fugasJugador(perfil),
      };
    });

    const promedioFila = (jugs) => {
      const out = {};
      COLS_JUGADOR.forEach(c => {
        const v = promedioDe(jugs, c.id);
        out[c.id] = { valor: v, formateado: formatearJ(c.formato, v) };
      });
      return out;
    };
    const promEquipo = promedioFila(elegidos);
    const promLiga = promedioFila(idx.liga.jugadoresCalificados || []);

    /* Comparación de la fila de cierre: verde si el plantel está MEJOR que
       la liga, rojo si está peor, neutro si empatan. Se respeta la
       dirección de la métrica (en %TOV, menos es mejor): pintar de verde
       a un equipo que pierde más pelotas que la liga contradiría el resto
       del sistema, donde el verde siempre significa ventaja. */
    COLS_JUGADOR.forEach(c => {
      const a = promEquipo[c.id].valor, b = promLiga[c.id].valor;
      let cmp = 'neutro';
      if (a !== null && b !== null && Math.abs(a - b) > 1e-9) {
        const mejor = c.invertida ? a < b : a > b;
        cmp = mejor ? 'mejor' : 'peor';
      }
      promEquipo[c.id].comparacion = cmp;
      promEquipo[c.id].delta = (a !== null && b !== null) ? a - b : null;
    });

    return {
      equipo: e.nombre, clave: e.clave,
      columnas: COLS_JUGADOR,
      filas: filas,
      promedioEquipo: promEquipo,
      promedioLiga: promLiga,
      totalPlays: totalPlays,
      totalTriples: totalTriples,
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
    const tabla = jugadoresClave(idx, claveRival);
    if (!tabla || !tabla.filas.length) return '';

    const partes = [];
    const filas = tabla.filas;
    const orden = (fn) => filas.slice().sort((a, b) => (fn(b) || 0) - (fn(a) || 0));

    /* ---- 1. Quién es el equipo, en una línea de contexto ---- */
    const pace = idx.leer(claveRival, 'PACE');
    const efgEq = idx.leer(claveRival, 'eFG%');
    if (pace && pace.percentil !== null) {
      partes.push(eR.nombre + (pace.percentil >= 66
        ? ' juega a ritmo alto (' + pace.formateado + '), así que el plan individual se sostiene o se cae con el balance defensivo.'
        : pace.percentil <= 34
          ? ' juega a ritmo controlado (' + pace.formateado + '): pocas posesiones, cada marca individual pesa más.'
          : ' maneja un ritmo de media tabla (' + pace.formateado + '): el partido lo definen los duelos, no el tempo.'));
    }

    /* ---- 2. El eje: sobre quién pasa el ataque ---- */
    const porPlays = orden(f => f.perfil.concentracion);
    const eje = porPlays[0];
    if (eje && eje.perfil.concentracion !== null) {
      const segundo = porPlays[1];
      partes.push('El ataque pasa por ' + eje.nombre + ' (' + eje.rol.label.toLowerCase() + ', ' +
        pct(eje.perfil.concentracion) + ' de los plays del equipo, ' + num1(eje.perfil.pts) + ' pts con ' +
        num2(eje.perfil.ppp) + ' PPP)' +
        (segundo && segundo.perfil.concentracion !== null
          ? ', con ' + segundo.nombre + ' como segunda vía (' + pct(segundo.perfil.concentracion) + ').'
          : '.') +
        ' Su marca es la decisión más cara de la noche: ' + eje.marca.consigna.toLowerCase() + '.');
    }

    /* ---- 3. Los que hay que cerrar sí o sí ---- */
    const cerrar = filas.filter(f => f.perfil.tiroExternoRentable);
    if (cerrar.length) {
      partes.push('Prohibido soltar a ' + nombres(cerrar.map(f => f.perfil)) + ': ' +
        detallePorJugador(cerrar.map(f => f.perfil), m => 'tira ' + pct(m.t3) + ' con ' +
          num2(m.pptTriple) + ' de renta por intento') +
        '. Sobre ellos la consigna es stay home, no se ayuda desde ese lado aunque se rompa la pintura.');
    }

    /* ---- 4. Los que conviene dejar resolver ---- */
    const permitir = filas.filter(f =>
      f.marca.id === 'tirador-ineficiente' || f.marca.id === 'tirador-sistematico-frio' ||
      f.marca.id === 'volumen-sin-eficiencia');
    if (permitir.length) {
      partes.push('En cambio ' + nombres(permitir.map(f => f.perfil)) + ' ' +
        (permitir.length > 1 ? 'son' : 'es') + ' donde queremos que termine la posesión: ' +
        detallePorJugador(permitir.map(f => f.perfil), m => 'eFG% ' + pct(m.efg) +
          (m.pptTriple !== null ? ' y ' + num2(m.pptTriple) + ' por triple' : '')) +
        '. Cerrar los caminos al aro y aceptar ese lanzamiento es ganancia, no concesión.');
    }

    /* ---- 5. Dónde nos pueden lastimar sin la pelota ---- */
    const cristal = orden(f => f.perfil.reboteRel).filter(f =>
      f.perfil.reboteRel !== null && f.perfil.reboteRel >= U.reboteOfensivoAlto);
    if (cristal.length) {
      partes.push('Box-out asignado sobre ' + nombres(cristal.slice(0, 2).map(f => f.perfil)) +
        ': sin cargarlos, las segundas chances les devuelven las posesiones que la defensa les saca.');
    }

    /* ---- 6. Dónde se los puede romper ---- */
    const presionables = orden(f => f.perfil.perdidasRel).filter(f =>
      f.perfil.perdidasRel !== null && f.perfil.perdidasRel >= U.perdidasAltas &&
      f.perfil.min >= U.minutosClave);
    if (presionables.length) {
      /* Sin `m.nombre` adentro: `detallePorJugador` ya lo antepone cuando
         hay más de uno, y ponerlo acá lo duplicaba ("BORRAJO BORRAJO pierde"). */
      partes.push('La vía para romperlos es la conducción: ' +
        detallePorJugador(presionables.slice(0, 2).map(f => f.perfil), m => 'pierde ' +
          pct(m.perdidas) + ' de sus plays (' + num2(m.perdidasRel) + 'x la liga)') +
        '. Presión al drible en mitad de cancha y trap en la primera cortina.');
    }

    /* ---- 7. Composición del plantel: qué defensa pide la noche ---- */
    const cuenta = {};
    filas.forEach(f => { cuenta[f.marca.id] = (cuenta[f.marca.id] || 0) + 1; });
    const perimetro = (cuenta['tirador-elite'] || 0) + (cuenta['tirador-eficiente-bajo-volumen'] || 0);
    const interior = (cuenta['interior-dominante'] || 0) + (cuenta['rebotador'] || 0);
    if (perimetro && interior) {
      partes.push('Criterio global: no se puede cerrar todo. Con ' + perimetro + ' amenaza' +
        (perimetro > 1 ? 's' : '') + ' externa' + (perimetro > 1 ? 's' : '') + ' reales y ' + interior +
        ' de pintura, la consigna es sostener el perímetro y colapsar con ayuda de lado débil, ' +
        'aceptando la media distancia como el mal menor.');
    } else if (perimetro) {
      partes.push('Criterio global: clausura perimetral. El daño llega de afuera, así que se niega el catch & shoot ' +
        'y se cierran esquinas aun a costa de conceder penetraciones controladas hacia la ayuda.');
    } else if (interior) {
      partes.push('Criterio global: colapso de la pintura. Sin amenaza externa que castigue, se puede hundir la defensa, ' +
        'negar la recepción interior y cargar el cristal.');
    }

    /* ---- 8. En qué estado llegan ---- */
    const ciclo = analisisCiclo(idx, claveRival);
    if (ciclo && ciclo.pj) {
      const g = ciclo.ganados ? ciclo.ganados.pj : 0;
      const p = ciclo.perdidos ? ciclo.perdidos.pj : 0;
      partes.push('Llegan ' + g + '-' + p + ' en sus últimos ' + ciclo.pj + ' partidos' +
        (efgEq && efgEq.percentil !== null ? ', con un eFG% de temporada de ' + efgEq.formateado +
          ' (percentil ' + efgEq.percentil.toFixed(0) + ' de la liga).' : '.'));
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
    VENTANA_CICLO, TOP_JUGADORES, TOP_SEMAFORO, UMBRALES: U, DELTA, BANDAS,
    MATRIZ_POSESION, MATRIZ_TIRO, METRICAS_RANKING, COLS_JUGADOR,
    PERFILES_MARCA, PERFILES_DEFENSOR, REGLAS_CLAVE,
    get ROLES_FUNCIONALES() { return rolesFuncionales(); },
    statLiga, bandaLiga, porEncima, porDebajo,
    celdaMatriz, referenciaLiga, filaMatriz, matrizComparativa, rankingsLiga,
    detallePartido, fichaEquipo, historialDirecto,
    analizarSubset, analisisCiclo,
    perfilJugador, rolFuncional, marcaSugerida, jugadoresClave,
    fortalezasJugador, fugasJugador, fichaRival,
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

   El DOM queda deliberadamente seccionado (`<section class="scout-card"
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
  /* Qué cards entran en el PDF. Todas por defecto: el DT destilda las que
     no quiere en ESE informe (a veces el rival se prepara solo con marcas
     y claves, sin la matriz entera). */
  cards: {
    encabezado: true, matriz: true, ciclo: true, marcas: true,
    resumen: true, jugadores: true, claves: true, fichas: true,
  },
};

const SCOUT_CARDS = [
  { id: 'encabezado', label: 'Encabezado y récord' },
  { id: 'matriz', label: 'Matriz de métricas y rankings' },
  { id: 'ciclo', label: 'Splits L/V y ciclo reciente' },
  { id: 'marcas', label: 'Plan individual · marcas' },
  { id: 'resumen', label: 'Resumen de criterio estratégico' },
  { id: 'jugadores', label: 'Tabla de jugadores clave' },
  { id: 'claves', label: 'Claves estratégicas' },
  { id: 'fichas', label: 'Fichas individuales' },
];

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

/* ===================== EXPORTACIÓN POR CARDS ===================== */

/** Marca/desmarca una card para el informe impreso. */
function scoutCard(id, incluir) {
  SCOUT_UI.cards[id] = !!incluir;
  const el = document.querySelector('.scout-card[data-bloque="' + id + '"]');
  if (el) el.classList.toggle('no-imprimir', !incluir);
}

function scoutAbrirExport() {
  const m = document.getElementById('scoutExportModal');
  if (m) m.classList.remove('hidden');
}
function scoutCerrarExport() {
  const m = document.getElementById('scoutExportModal');
  if (m) m.classList.add('hidden');
}

/**
 * Imprime solo las cards marcadas. `body.modo-scout-print` es lo que
 * activa las reglas de `@media print` del index.html: sin esa clase, un
 * Ctrl+P normal sigue imprimiendo la página como siempre.
 */
function scoutImprimir() {
  scoutCerrarExport();
  SCOUT_CARDS.forEach(c => scoutCard(c.id, SCOUT_UI.cards[c.id]));
  document.body.classList.add('modo-scout-print');
  const limpiar = () => {
    document.body.classList.remove('modo-scout-print');
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  setTimeout(() => window.print(), 60);
}

function scoutModalExport() {
  const items = SCOUT_CARDS.map(c => `
    <label class="flex items-center gap-2 py-1 cursor-pointer">
      <input type="checkbox" ${SCOUT_UI.cards[c.id] ? 'checked' : ''}
        onchange="scoutCard('${c.id}', this.checked)"
        class="accent-current" style="accent-color:var(--acento)">
      <span class="text-xs text-ink">${escapeHtml(c.label)}</span>
    </label>`).join('');

  return `
    <div id="scoutExportModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 no-imprimir"
      style="background:rgba(0,0,0,.7)">
      <div class="card rounded-xl border border-hairline p-5 w-full max-w-sm">
        <h4 class="font-display uppercase tracking-wide text-sm text-ink mb-1">Exportar informe</h4>
        <p class="text-[11px] text-muted mb-3">
          Elegí qué bloques entran en el PDF. Cada uno arranca en una hoja nueva (A4 vertical).
        </p>
        <div class="max-h-64 overflow-y-auto mb-4">${items}</div>
        <div class="flex gap-2 justify-end">
          <button type="button" onclick="scoutCerrarExport()"
            class="px-3 py-1.5 text-xs border border-hairline rounded hover:bg-surface2 transition-colors">Cancelar</button>
          <button type="button" onclick="scoutImprimir()"
            class="px-3 py-1.5 text-xs rounded bg-accent text-black font-semibold">Imprimir / PDF</button>
        </div>
      </div>
    </div>`;
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
/**
 * Badges del ADN, con el MISMO formato y las mismas etiquetas que la
 * sección Jugadores. Salen de `jugadoresBadges()`, no de una lista propia:
 * si esta función armara sus propios textos volvería el bug de que el
 * mismo jugador se llama distinto en cada pantalla.
 */
function scoutBadgesADN(perfil) {
  if (!perfil || !perfil.adn || typeof jugadoresBadges !== 'function') return '';
  const badges = jugadoresBadges(perfil.adn);
  if (!badges.length) return '';
  return `<div class="flex flex-wrap gap-1 mt-1">${badges.map(b => {
    const color = b.tipo === 'jerarquia' ? 'text-accent border-accent/40'
      : b.tipo === 'rol' ? 'text-blue-400 border-blue-400/30'
        : 'text-green-400 border-green-400/30';
    return `<span class="text-[9px] leading-tight px-1.5 py-0.5 rounded-full border ${color} whitespace-nowrap">${escapeHtml(b.texto)}</span>`;
  }).join('')}</div>`;
}

/** Nombre de equipo con su escudo al lado. `alto` en px. */
function scoutNombreConLogo(nombre, alto) {
  const l = scoutLogo(nombre);
  const px = alto || 18;
  return `<span class="inline-flex items-center gap-1.5 min-w-0">
    ${l ? `<img src="${escapeAttr(l)}" alt="" style="width:${px}px;height:${px}px" class="object-contain shrink-0">` : ''}
    <span class="truncate">${escapeHtml(nombre)}</span>
  </span>`;
}

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
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="encabezado">
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
      <p class="text-[10px] uppercase tracking-wider text-muted font-display mb-1.5">${scoutNombreConLogo(nombre, 14)}</p>
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
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="matriz">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">📊 Métricas avanzadas y ranking en la liga</h4>
      <p class="text-[11px] text-muted mb-2">
        Verde = tercio alto de la liga, rojo = tercio bajo. El chip es el puesto en la liga de esa métrica.
      </p>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1 text-left">Métrica</th>
          <th class="px-2 pb-1 text-center">${scoutNombreConLogo(inf.local.nombre, 16)}</th>
          <th class="px-2 pb-1 text-center">${scoutNombreConLogo(inf.visitante.nombre, 16)}</th>
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
        <p class="font-display text-sm text-white">${scoutNombreConLogo(ficha.nombre, 16)}</p>
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
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="ciclo">
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
    /* El defensor viene precargado con el PERFIL táctico sugerido, no con
       un nombre: quién lo cubre depende del quinteto en cancha y de las
       faltas de cada uno. El DT lo reemplaza por el nombre al armar la
       rotación. */
    const defensor = g.defensor !== undefined ? g.defensor : f.marca.defensor;
    return `
      <tr class="border-b border-hairline/40 last:border-0 align-top">
        <td class="px-2 py-2">
          <p class="text-xs text-white">${escapeHtml(f.nombre)}</p>
          <p class="text-[10px] text-accent">${escapeHtml(f.rol.label)}</p>
          ${f.perfil.jerarquia ? `<p class="text-[10px] text-blue-400">${escapeHtml(f.perfil.jerarquia)}</p>` : ''}
          <p class="text-[10px] dato-sec">${escapeHtml(SGADD.formatear('MIN', f.perfil.min))} min · ${escapeHtml(SGADD.formatear('PTS', f.perfil.pts))} pts</p>
        </td>
        <td class="px-2 py-2">
          <input type="text" value="${escapeAttr(defensor)}" placeholder="Perfil o nombre"
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
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="marcas">
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
      <td class="px-2 py-1.5 whitespace-nowrap">
        <span class="text-xs text-white">${escapeHtml(f.nombre)}</span>
        <span class="block text-[9px] dato-sec">${escapeHtml(f.rol.label)}</span>
      </td>
      ${t.columnas.map(c => {
        const cel = f.celdas[c.id];
        /* Mapa de calor por jerarquía de amenaza dentro del plantel:
           1° verde (máximo exponente), 2° naranja (precaución), 3° amarillo
           (foco complementario). El color dice "acá está el especialista",
           no "este número es bueno". */
        const col = !cel.destacado ? null
          : cel.puestoInterno === 1 ? '#22c55e'
            : cel.puestoInterno === 2 ? '#f97316' : '#facc15';
        const tam = c.destacada ? 'text-sm' : 'text-xs';
        return `<td class="px-2 py-1.5 text-center">
          <span class="font-mono ${tam} ${cel.destacado ? 'font-bold px-1 rounded' : 'text-ink'}"
            ${col ? `style="color:${col};background:${col}1a"` : ''}>${escapeHtml(cel.formateado)}</span>
          ${cel.sub ? `<span class="block text-[9px] font-mono dato-sec">${escapeHtml(cel.sub.clave)}: ${escapeHtml(cel.sub.formateado)}</span>` : ''}
        </td>`;
      }).join('')}
    </tr>`).join('');

  /* La fila del plantel se colorea contra la liga; la de la liga es la
     referencia y va siempre neutra. */
  const cierre = (prom, etiqueta, comparar) => `
    <tr class="border-t border-hairline">
      <td class="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted font-display whitespace-nowrap">${escapeHtml(etiqueta)}</td>
      ${t.columnas.map(c => {
        const cmp = comparar ? prom[c.id].comparacion : 'neutro';
        const col = cmp === 'mejor' ? '#22c55e' : cmp === 'peor' ? '#ef4444' : null;
        return `<td class="px-2 py-1.5 text-center font-mono text-[11px] ${col ? 'font-semibold' : 'dato-sec'}"
          ${col ? `style="color:${col}"` : ''}>${escapeHtml(prom[c.id].formateado)}</td>`;
      }).join('')}
    </tr>`;

  return `
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="jugadores">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1 flex items-center gap-1.5">👥 Jugadores clave · ${scoutNombreConLogo(t.equipo, 18)}</h4>
      <p class="text-[11px] text-muted mb-3">
        Top ${SGADD_SCOUT.TOP_SEMAFORO} de cada métrica dentro de este plantel:
        <span style="color:#22c55e">1° amenaza principal</span> ·
        <span style="color:#f97316">2° precaución</span> ·
        <span style="color:#facc15">3° foco complementario</span>.
        Las columnas de uso se ordenan por intentos absolutos, no por el porcentaje:
        un 60% de uso externo sobre 2 tiros no es un tirador.
      </p>
      <div class="scrollbox"><table class="w-full text-left">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1 text-left">Jugador</th>${th}
        </tr></thead>
        <tbody>
          ${filas}
          ${cierre(t.promedioEquipo, 'Prom. jugadores/equipo', true)}
          ${cierre(t.promedioLiga, 'Prom. jugadores/liga', false)}
        </tbody>
      </table></div>
    </section>`;
}

/* ===================== BLOQUE 6 · RESUMEN Y CLAVES ===================== */

function scoutBloqueResumen(inf) {
  if (!inf.resumen) return '';
  return `
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="resumen">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-2">🧠 Resumen de criterio estratégico</h4>
      <p class="text-[12px] text-ink leading-relaxed">${escapeHtml(inf.resumen)}</p>
    </section>`;
}

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
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="claves">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-2">🎯 Claves estratégicas y anticipación</h4>
      ${bullets ? `<ul class="space-y-2">${bullets}</ul>`
        : `<p class="text-[11px] text-muted">Ninguna métrica del rival dispara una clave específica: el plan es sostener la estructura defensiva propia.</p>`}
    </section>`;
}

/* ===================== BLOQUE 7 · FICHAS INDIVIDUALES ===================== */

function scoutBloqueFichas(inf) {
  const t = inf.jugadoresRival;
  if (!t || !t.filas.length) return '';

  const lista = (items, color) => items.map(x =>
    `<li class="flex gap-1.5 items-start"><span class="shrink-0" style="color:${color}">•</span><span>${escapeHtml(x)}</span></li>`).join('');

  const fichas = t.filas.map(f => {
    const p = f.perfil;
    return `
      <article class="scout-ficha bg-surface2/40 rounded-lg p-3">
        <p class="font-display text-sm text-white leading-tight">${escapeHtml(f.nombre)}</p>
        <p class="text-[10px] uppercase tracking-wider text-accent font-display">${escapeHtml(f.rol.label)}</p>
        ${scoutBadgesADN(p)}
        <p class="text-[11px] font-mono text-ink mt-1 mb-2">
          MIN ${escapeHtml(SGADD.formatear('MIN', p.min))} ·
          PLAYS ${escapeHtml(SGADD.formatear('PLAYS', p.plays))} ·
          PTS ${escapeHtml(SGADD.formatear('PTS', p.pts))} <span class="dato-sec">(PPP ${escapeHtml(SGADD.formatear('PPP', p.ppp))})</span> ·
          eFG% ${escapeHtml(SGADD.formatear('eFG%', p.efg))}
        </p>
        <p class="text-[10px] uppercase tracking-wider text-green-400 font-display">Fortalezas · dónde nos daña</p>
        <ul class="text-[11px] text-ink leading-snug space-y-0.5 mt-0.5 mb-2">${lista(f.fortalezas, '#22c55e')}</ul>
        <p class="text-[10px] uppercase tracking-wider text-red-400 font-display">Puntos de fuga · dónde lo atacamos</p>
        <ul class="text-[11px] text-ink leading-snug space-y-0.5 mt-0.5 mb-2">${lista(f.fugas, '#ef4444')}</ul>
        <div class="border-t border-hairline/50 pt-2 space-y-0.5">
          <p class="text-[11px]"><span class="dato-sec">Consigna técnica:</span>
            <span class="text-accent font-semibold">${escapeHtml(f.marca.consigna)}</span></p>
          <p class="text-[11px]"><span class="dato-sec">Restricción / alerta:</span>
            <span class="text-white">${escapeHtml(f.marca.restriccion)}</span></p>
          <p class="text-[11px]"><span class="dato-sec">Perfil defensor:</span>
            <span class="text-ink">${escapeHtml(f.marca.defensor)}</span></p>
        </div>
      </article>`;
  }).join('');

  return `
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="fichas">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">📋 Ficha de análisis por jugador</h4>
      <p class="text-[11px] text-muted mb-3">
        Rol funcional, fortalezas, fisuras y plan de acción de cada rival. Cada punto cruza la métrica
        con su consecuencia en cancha.
      </p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">${fichas}</div>
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
    <div class="flex flex-wrap items-center gap-2 no-imprimir">
      <span class="text-[10px] uppercase tracking-wider text-muted font-display">Scouting sobre</span>
      ${[eR, eN].map(e => `<button type="button" onclick="scoutCambiarObjetivo('${escapeAttr(e.clave)}')"
        class="px-3 py-1 text-[11px] rounded border transition-colors ${e.clave === inf.claveRival
          ? 'bg-accent text-black border-accent font-semibold' : 'border-hairline text-muted hover:text-ink'}"
        >${escapeHtml(e.nombre)}</button>`).join('')}
      <button type="button" onclick="scoutAbrirExport()"
        class="ml-auto px-3 py-1 text-[11px] rounded border border-hairline text-muted hover:text-accent hover:border-accent transition-colors">
        🖨 Exportar PDF
      </button>
    </div>`;

  return `
    <div id="scoutInforme" class="space-y-4 mt-4">
      ${toggle}
      ${scoutBloqueEncabezado(inf)}
      ${scoutBloqueMatriz(inf)}
      ${scoutBloqueCiclo(inf)}
      ${scoutBloqueMarcas(inf)}
      ${scoutBloqueResumen(inf)}
      ${scoutBloqueJugadores(inf)}
      ${scoutBloqueClaves(inf)}
      ${scoutBloqueFichas(inf)}
      ${scoutModalExport()}
    </div>`;
}
