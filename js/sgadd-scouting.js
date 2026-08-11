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
    /* Recalibrado contra la liga real. La concentración es
       `PLAYS del jugador / Σ PLAYS del plantel COMPLETO`, y con planteles
       de 14 a 22 jugadores el techo matemático es bajo: medido sobre las
       96 fichas, mediana 0,092 · p90 0,157 · máximo 0,228, y en 10 de los
       12 equipos el jugador MÁS usado no llegaba a 0,20.

       O sea que con el umbral viejo la regla no podía activarse jamás en
       la mayoría de los equipos — ese era el bloqueo real de
       `volumen-sin-eficiencia` (P-4), no el orden de la cascada. Con 0,15
       (≈ p88) marca al eje real del ataque: 15 de 96, uno o dos por
       equipo. */
    concentracionAlta: 0.15,   // ≥15% de los plays del equipo = eje del ataque
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
     MATRIZ DE PERFILES DEFENSIVOS DE NUESTRO PLANTEL

     La columna "Defensor nuestro" sugiere un PERFIL, no un nombre propio:
     quién lo cubre depende de quién esté en cancha y de las faltas de cada
     uno. El DT reemplaza el perfil por el nombre cuando arma la rotación.

     Diez familias, cada una con sus especialidades. `CATALOGO_DEFENSOR` es
     la referencia completa que ve el cuerpo técnico; `PERFILES_DEFENSOR`
     es el índice plano que usan las reglas de asignación. Ojo: hay dos
     familias de perimetral atlético (🏃 contención en la línea de pelota y
     🦅 ayudas desde el lado débil) — son tareas distintas y por eso no se
     fusionaron.
     ===================================================================== */
  const CATALOGO_DEFENSOR = [
    {
      id: 'especialista1x1', emoji: '🛡', familia: 'Especialista 1x1',
      perfiles: [
        { id: 'onBall', label: 'Defensor sobre la Bola / On-Ball Stopper', detalle: 'Neutraliza aclarados e isolaciones del generador principal.' },
        { id: 'sombra', label: 'Sombra / Shadow', detalle: 'Persigue cara a cara al anotador rival por toda la cancha.' },
        { id: 'lockdown', label: 'Anulador Defensivo / Lockdown Defender', detalle: 'Cancela por completo el impacto de la estrella rival.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { pr: 1.0, min: 0.8, fc: -0.5 },
    },
    {
      id: 'presionInicial', emoji: '⚡', familia: 'Presión Inicial',
      perfiles: [
        { id: 'poa', label: 'Defensor en Punto de Ataque / POA Defender', detalle: 'Asfixia el inicio de la ofensiva en el eje de la cancha.' },
        { id: 'disruptor', label: 'Disruptor de Bloqueos / P&R Disruptor', detalle: 'Rompe la dinámica del bloqueo y reanudación central.' },
        { id: 'hostigador', label: 'Hostigador / Ball-Screen Pest', detalle: 'Fuerza pérdidas metiendo las manos en la línea de drible.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { pr: 1.4, perimetral: 0.8, min: 0.3 },
    },
    {
      id: 'perimetralAtletico', emoji: '🏃', familia: 'Perimetral Atlético',
      perfiles: [
        { id: 'wingChaser', label: 'Perseguidor de Líneas / Wing Chaser', detalle: 'Niega las líneas de carrera de exteriores explosivos.' },
        { id: 'transicion', label: 'Defensor de Transición / Transition Defender', detalle: 'Frena el contraataque rival mediante velocidad de repliegue.' },
        { id: 'driveContainment', label: 'Contenedor de Penetraciones / Drive Containment', detalle: 'Absorbe el primer paso rival con físico y desplazamiento lateral.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { perimetral: 1.0, pr: 0.8, fc: -0.6, min: 0.3 },
    },
    {
      id: 'perimetralFisico', emoji: '💪', familia: 'Perimetral Físico',
      perfiles: [
        { id: 'enforcer', label: 'Desgastador Perimetral / Perimeter Enforcer', detalle: 'Choca en pantallas y ensucia el juego exterior.' },
        { id: 'goon', label: 'Defensor de Choque / Defensive Goon', detalle: 'Castiga los cortes rivales mediante contacto legal.' },
        { id: 'rebotandoGuard', label: 'Cerrador Rebotero / Rebounding Guard', detalle: 'Sella el box-out desde afuera hacia adentro para asegurar la posesión.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { perimetral: 0.8, fc: 1.0, rd: 0.6 },
    },
    {
      id: 'perimetralLargo', emoji: '📏', familia: 'Perimetral Largo',
      perfiles: [
        { id: 'envergadura', label: 'Defensor de Envergadura / Length Defender', detalle: 'Usa brazos largos para puntear tiros de alto alcance.' },
        { id: 'volumeContainment', label: 'Contenedor de Volumen / Volume Containment', detalle: 'Molesta la visual de tiradores lejanos (8-9 metros).' },
        { id: 'closeout', label: 'Cerrador de Tiros Abiertos / Closeout Specialist', detalle: 'Llegada rápida a los tiros externos usando su alcance de brazos.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { perimetral: 0.7, tc: 1.2, rd: 0.9, min: 0.3 },
    },
    {
      id: 'especialistaPerimetral', emoji: '🎯', familia: 'Especialista Perimetral',
      perfiles: [
        { id: 'sniperStopper', label: 'Anulador de Tiradores / Sniper Stopper', detalle: 'Persigue a especialistas a través de cortinas indirectas.' },
        { id: 'denier', label: 'Defensor de Denegación / Denier', detalle: 'Evita por completo que el tirador letal reciba la pelota.' },
        { id: 'screenNavigator', label: 'Navegador de Pantallas / Screen Navigator', detalle: 'Esquiva o pasa pantallas por arriba (over the top).' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { perimetral: 1.0, pr: 1.0, min: 0.6 },
    },
    {
      id: 'especialistaInterior', emoji: '🏢', familia: 'Especialista Interior',
      perfiles: [
        { id: 'drop', label: 'Defensor en Caída / Drop Protector', detalle: 'Se hunde en la pintura ante penetradores sin salir al exterior.' },
        { id: 'rimProtector', label: 'Protector de Aro Clásico / Classic Rim Protector', detalle: 'Se mantiene en la restricción para intimidar tiros cortos.' },
        { id: 'paintPillar', label: 'Muro de Pintura / Paint Pillar', detalle: 'Anula físicamente el juego de espaldas al aro de los terminales internos.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { interior: 1.2, tc: 1.3, rd: 0.9, fc: 0.2 },
    },
    {
      id: 'referenteZona', emoji: '🏰', familia: 'Referente de Zona',
      perfiles: [
        { id: 'rimProtectorPrimario', label: 'Protector de Aro Primario / Primary Rim Protector', detalle: 'Lidera la comunicación trasera y bloquea tiros cerca del aro.' },
        { id: 'glassCleaner', label: 'Asegurador del Rebote / Glass Cleaner', detalle: 'Termina la posesión defensiva capturando el rebote defensivo.' },
        { id: 'paintDominator', label: 'Defensor del Eje / Paint Dominator', detalle: 'Domina la zona pintada alterando la efectividad rival en su eje central.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { interior: 1.0, tc: 1.5, rd: 1.2, ro: 0.4 },
    },
    {
      id: 'hibridoFisico', emoji: '🧱', familia: 'Híbrido Físico',
      perfiles: [
        { id: 'switchable', label: 'Defensor Multiuso / Switchable Forward', detalle: 'Cambia de marca y absorbe contactos de internos en alineaciones bajas o intermedias.' },
        { id: 'lowPostWall', label: 'Muro de Ayudas / Low-Post Wall', detalle: 'Dobla la marca en el poste bajo o colapsa la zona pintada.' },
        { id: 'interiorImpact', label: 'Defensor de Impacto Interno / Interior Impact Defender', detalle: 'Aporta masa muscular para defender la pintura y ayudar adentro.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { interior: 0.9, fc: 0.9, rd: 0.7, tc: 0.4 },
    },
    {
      id: 'ayudasAtleticas', emoji: '🦅', familia: 'Perimetral Atlético · Ayudas',
      perfiles: [
        { id: 'freeSafety', label: 'Líbero de Ayudas / Free Safety', detalle: 'Salta desde el lado débil para taponar o cortar pases en cortes directos.' },
        { id: 'verticalRotator', label: 'Rotador Vertical / Vertical Rotator', detalle: 'Cierra el aro llegando a toda velocidad gracias a su zancada e hiperatletismo.' },
        { id: 'interceptor', label: 'Interceptor de Línea / Passing Lane Interceptor', detalle: 'Lee los ojos del pasador para robar balones dirigidos a cortes hacia el aro.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { pr: 1.3, tc: 0.9, perimetral: 0.5, min: 0.3 },
    },
    {
      id: 'contencionTactica', emoji: '📐', familia: 'Contención Táctica',
      perfiles: [
        { id: 'targetDefender', label: 'Defensor Flotante / Target Defender', detalle: 'Entra en rotación para flotar (sag-off) ante rivales sin tiro exterior.' },
        { id: 'readSpecialist', label: 'Especialista de Lectura / Read Specialist', detalle: 'Compensa falta de tiro o físico anticipando los esquemas tácticos rivales.' },
        { id: 'paceController', label: 'Freno de Ritmo / Pace Controller', detalle: 'Jugador de refresco que ralentiza el partido o ejecuta faltas tácticas de gestión.' },
      ],
      /* Señales con las que se busca a NUESTRO defensor para esta tarea. */
      defiende: { min: 1.0, fc: -0.4 },
    },
  ];

  /* Índice plano: id de perfil → etiqueta con su familia. Lo usan las
     reglas de asignación, así que el label de la tabla y el del catálogo
     no pueden divergir. */
  const PERFILES_DEFENSOR = (function () {
    const out = {};
    CATALOGO_DEFENSOR.forEach(cat => {
      cat.perfiles.forEach(p => {
        out[p.id] = p.label;
        out[p.id + '__familia'] = cat.emoji + ' ' + cat.familia;
      });
    });
    return out;
  })();

  /* =====================================================================
     DESEMPAQUETADO DEL CATÁLOGO DEFENSIVO (P-2)

     El catálogo documenta 33 perfiles pero el motor solo podía asignar 11:
     uno fijo por regla de marca. Los otros 22 quedaban de adorno, y la UI
     no comunicaba que la sugerencia automática elegía entre 11 y no entre
     33 — el cuerpo técnico veía las once familias y suponía lo contrario.

     Ahora cada marca declara una LISTA de candidatos ordenada, y gana el
     primero cuyo `cuando(perfil)` da verdadero. El último no lleva
     `cuando`: es el default de esa marca, así que **la asignación
     automática nunca puede quedar vacía** — es la propiedad que había que
     conservar.

     Los discriminantes son métricas que ya estaban calculadas y que ninguna
     regla usaba (`PR` vía `bandaPr`, `RO%` vía `bandaRo`, `AST-PP` vía
     `bandaAstPP`): elegir entre `Denier` e `Interceptor` es una pregunta
     sobre manos activas, y entre `Paint Pillar` y `Drop Protector`, una
     sobre dónde defiende el aro.
     ===================================================================== */

  /**
   * Perfil de defensor para una marca y un jugador concretos.
   * Devuelve siempre una etiqueta válida: si ningún candidato calza, el
   * último de la lista (el que no tiene `cuando`) es el default.
   */
  function elegirDefensor(marca, perfil) {
    const lista = (marca && marca.defensores) || [];
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      if (!c.cuando) return PERFILES_DEFENSOR[c.id] || null;
      try { if (c.cuando(perfil)) return PERFILES_DEFENSOR[c.id] || null; } catch (e) { /* sigue */ }
    }
    return lista.length ? (PERFILES_DEFENSOR[lista[lista.length - 1].id] || null) : null;
  }

  /**
   * Igual que `elegirDefensor`, pero repartiendo la carga sobre el plantel
   * propio: si un perfil ya se sugirió `MAX_REPETICIONES` veces, se prueba
   * el siguiente candidato.
   *
   * El motivo es de cancha, no de estética: sugerir cuatro veces "Sniper
   * Stopper" en la misma tabla le pide al DT cuatro defensores del mismo
   * tipo que probablemente no tiene. Cuando NO hay alternativa se repite
   * igual — antes que dejar la celda vacía, se repite y el DT decide.
   */
  const MAX_REPETICIONES_DEFENSOR = 2;

  function elegirDefensorBalanceado(marca, perfil, usados) {
    const lista = (marca && marca.defensores) || [];
    const cuenta = usados || {};
    const califican = lista.filter(c => {
      if (!c.cuando) return true;
      try { return !!c.cuando(perfil); } catch (e) { return false; }
    });
    const orden = califican.length ? califican : lista;
    for (let i = 0; i < orden.length; i++) {
      const et = PERFILES_DEFENSOR[orden[i].id];
      if (et && (cuenta[et] || 0) < MAX_REPETICIONES_DEFENSOR) return et;
    }
    return elegirDefensor(marca, perfil);
  }

  /** Todos los perfiles que el motor PUEDE llegar a sugerir. Lo usan los
      tests y sirve para auditar cuánto del catálogo está vivo. */
  function defensoresAlcanzables() {
    const out = new Set();
    PERFILES_MARCA.forEach(m => (m.defensores || []).forEach(c => {
      if (PERFILES_DEFENSOR[c.id]) out.add(PERFILES_DEFENSOR[c.id]);
    }));
    return Array.from(out);
  }

  /* =====================================================================
     A QUIÉN DE LOS NUESTROS LE TOCA

     El perfil táctico dice QUÉ tarea hay que hacer; esto propone QUIÉN de
     nuestro plantel está en mejores condiciones de hacerla.

     QUÉ MIDE Y QUÉ NO. El box score trae cuatro señales defensivas
     reales: **tapas cometidas (`TC`)**, recuperos (`PR`), faltas (`FC`) y
     rebote defensivo. Con eso alcanza para separar a un protector de aro
     de un perseguidor de tiradores, que es la decisión que el bloque
     necesita.

     Lo que NO trae es el trabajo sin pelota: desplazamiento lateral,
     navegación de cortinas, puntos permitidos por marca. Por eso sigue
     siendo una sugerencia y no un veredicto — pero se apoya en datos
     defensivos de verdad, no solo en proxies de tamaño.

     Se compara DENTRO de nuestro plantel y no contra la liga: la pregunta
     es "de los míos, ¿quién?", y esa respuesta no cambia porque la liga
     entera defienda mejor o peor.
     ===================================================================== */

  /** Cuántos nombres se sugieren por marca. Más de tres deja de ser una
      sugerencia y pasa a ser la lista del plantel. */
  const MAX_CANDIDATOS_PROPIOS = 3;
  /** Piso de minutos para proponer a alguien: no se le asigna la marca del
      mejor anotador rival a uno que promedia cuatro minutos. */
  const MIN_CANDIDATO_PROPIO = 10;

  /** Señales defensivas de UN jugador propio, normalizadas 0-1 dentro del
      plantel. `null` en una métrica pesa como el promedio, no como cero. */
  function señalesPlantel(idx, plantel) {
    const ficha = fichaJugadores();
    const perfiles = plantel.map(j => {
      const base = (ficha && ficha.perfilBase) ? ficha.perfilBase(idx, j) : {};
      return {
        nombre: String(j['NOMBRES'] || '').trim(),
        clave: j.__clave || null,
        min: nn(j['MIN']), pr: nn(j['PR']), fc: nn(j['FC']),
        /* TC = tapas cometidas. Es LA métrica de protección de aro que
           trae el box score, y la que más pesa para los perfiles
           interiores: un Primary Rim Protector se busca por acá antes que
           por rebote. */
        tc: nn(j['TC']),
        rd: base.reboteDefRel !== undefined ? base.reboteDefRel : nn(j['RD%']),
        ro: base.reboteRel !== undefined ? base.reboteRel : nn(j['RO%']),
        interior: base.esInterior ? 1 : 0,
        perimetral: base.esPerimetral ? 1 : 0,
      };
    });
    /* Normalización min-max sobre el propio plantel: convierte métricas de
       escalas distintas (0,9 recuperos y 24 minutos) en algo sumable. */
    const norm = (campo) => {
      const vals = perfiles.map(p => p[campo]).filter(v => typeof v === 'number' && isFinite(v));
      if (vals.length < 2) return () => 0.5;
      const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      if (max === min) return () => 0.5;
      return (v) => (typeof v === 'number' && isFinite(v)) ? (v - min) / (max - min) : 0.5;
    };
    const escalas = { pr: norm('pr'), fc: norm('fc'), tc: norm('tc'), rd: norm('rd'), ro: norm('ro'), min: norm('min') };
    perfiles.forEach(p => {
      p.n = {
        pr: escalas.pr(p.pr), fc: escalas.fc(p.fc), tc: escalas.tc(p.tc),
        rd: escalas.rd(p.rd), ro: escalas.ro(p.ro), min: escalas.min(p.min),
        interior: p.interior, perimetral: p.perimetral,
      };
    });
    return perfiles;
  }

  /**
   * Los mejores candidatos de NUESTRO plantel para una familia defensiva.
   *
   * `usados` reparte la carga igual que `elegirDefensorBalanceado`: si a un
   * jugador ya se le asignaron dos marcas, baja en el orden. No se lo
   * excluye —a veces es el único que puede— pero deja de aparecer primero
   * en todas las filas, que era lo que volvía inútil la sugerencia.
   */
  function candidatosPropios(familiaId, perfiles, usados) {
    const cat = CATALOGO_DEFENSOR.find(c => c.id === familiaId);
    if (!cat || !cat.defiende || !perfiles || !perfiles.length) return [];
    const pesos = cat.defiende;
    const cuenta = usados || {};

    return perfiles
      .filter(p => p.min === null || p.min >= MIN_CANDIDATO_PROPIO)
      .map(p => {
        let score = 0;
        Object.keys(pesos).forEach(k => {
          const v = p.n[k];
          if (typeof v === 'number') score += pesos[k] * v;
        });
        /* Penalidad por carga: cada marca ya asignada le resta. */
        score -= 0.35 * (cuenta[p.nombre] || 0);
        return { nombre: p.nombre, clave: p.clave, score: score, min: p.min };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATOS_PROPIOS);
  }

  /** Familia (con emoji) a la que pertenece un perfil, por su etiqueta. */
  function familiaDefensor(label) {
    let fam = null;
    CATALOGO_DEFENSOR.forEach(cat => {
      cat.perfiles.forEach(p => { if (p.label === label) fam = cat.emoji + ' ' + cat.familia; });
    });
    return fam;
  }

  /* =====================================================================
     MARCA ASIGNADA — "elegir el veneno" con soluciones de campo

     Cascada excluyente, ordenada de la amenaza más cara a la más barata.
     Todas las consignas son de CAMPO (flotación, ice, drop, show corto,
     negación de catch & shoot, cierre de esquinas, ayuda de lado débil).
     La falta táctica quedó reducida a un solo perfil y con un umbral duro
     (T1% < 40% + volumen interno): mandar a la línea a alguien que
     convierte 60% es regalarle 1,20 puntos por posesión.

     FORMATO: `consigna` y `restriccion` son objetos {titulo, detalle}.
       - `titulo`  → la directiva táctica corta, en mayúsculas. Es lo que
                     el DT canta en el vestuario y lo único editable.
       - `detalle` → la justificación con el NÚMERO que la disparó. Sin
                     esto el informe es una lista de órdenes sin sustento;
                     con esto el ayudante puede discutirla con el dato en
                     la mano.
     ===================================================================== */
  const PERFILES_MARCA = [
    {
      id: 'tirador-elite',
      etiqueta: 'Amenaza perimetral de élite',
      defensores: [
        { id: 'denier', cuando: (p) => p.viaPrincipalExterna },
        { id: 'screenNavigator', cuando: (p) => p.tiradorSistematico },
        { id: 'sniperStopper' },
      ],
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple >= U.pptTripleElite,
      consigna: (p) => ({
        titulo: 'TOP LOCK / OVER.',
        detalle: 'Tirador de élite (' + num2(p.pptTriple) + ' PPT3 sobre ' + pct(p.usoTriple) +
          ' de uso). Pasar siempre por arriba de la cortina para negarle el catch & shoot.',
      }),
      restriccion: (p) => ({
        titulo: 'NO AYUDAR DESDE ÉL.',
        detalle: 'Cada rotación que lo deja solo vale ' + num2(p.pptTriple) +
          ' puntos por intento. Antes de doblar a otro, chequear dónde está él.',
      }),
    },
    {
      /* SUBIÓ AL SEGUNDO LUGAR (P-4). Es una lectura de VOLUMEN, no de
         tiro: describe al que resuelve mucho y mal, y esa conclusión no
         debería depender de qué reglas de tiro se hayan evaluado antes.

         No puede pisar a ninguna de las tres reglas de tiro externo porque
         exige `!tiroExternoRentable`, y las dos que van arriba de ella
         (`tirador-elite` y esta misma condición) solo aplican a tiradores
         rentables. La única que quedaba realmente tapada era esta.

         Ojo: su bloqueo principal NO era el orden sino
         `concentracionAlta`, que estaba en 0,20 y era inalcanzable. Se
         corrigieron las dos cosas. */
      id: 'volumen-sin-eficiencia',
      etiqueta: 'Volumen alto, eficiencia baja',
      defensores: [
        { id: 'envergadura', cuando: (p) => p.usoTriple !== null && p.usoTriple >= U.usoTripleAlto },
        { id: 'volumeContainment' },
      ],
      test: (p) => p.concentracion !== null && p.concentracion >= U.concentracionAlta &&
        !p.tiroExternoRentable && (porDebajo(p.bandaEfg) ||
          (p.efg !== null && p.bandaEfg !== null && p.bandaEfg.id === 'fuga')),
      consigna: (p) => ({
        titulo: 'PERMITIR EL TIRO EXTERNO.',
        detalle: 'Concentra ' + pct(p.concentracion) + ' de los plays del equipo con un eFG% de ' +
          pct(p.efg) + ' (' + (p.bandaEfg ? p.bandaEfg.label.toLowerCase() : 'sin referencia de liga') +
          '). Cuanto más resuelva él, mejor para nosotros.',
      }),
      restriccion: (p) => ({
        titulo: 'NO DOBLAR.',
        detalle: 'Doblarlo le baja el volumen y le sube la eficiencia al resto: ' +
          'que termine él la posesión es el mejor escenario.',
      }),
    },
    {
      /* REGLA DURA: tirador eficiente aunque anote poco. El error que
         corrige es tratar "pocos puntos" como "no es amenaza". */
      id: 'tirador-eficiente-bajo-volumen',
      etiqueta: 'Tirador eficiente (poco volumen, alta renta)',
      defensores: [
        { id: 'closeout', cuando: (p) => p.t3i !== null && p.t3i < 2.0 },
        { id: 'sniperStopper', cuando: (p) => porEncima(p.bandaPptTriple) },
        { id: 'denier' },
      ],
      test: (p) => p.tiraDeAfuera && p.tiroExternoRentable,
      consigna: (p) => ({
        titulo: 'STAY HOME / NEGACIÓN DE RECEPCIÓN.',
        detalle: 'Convierte ' + pct(p.t3) + ' de triple con ' + num2(p.pptTriple) +
          ' por intento aunque promedie ' + num1(p.pts) + ' PTS. Anota poco por volumen, no por eficiencia.',
      }),
      restriccion: (p) => ({
        titulo: 'PROHIBIDO FLOTAR.',
        detalle: 'Su bajo promedio de puntos engaña: si lo soltamos, ese tiro es el más caro que conceden (' +
          num2(p.pptTriple) + ' PPT3).',
      }),
    },
    {
      id: 'interior-dominante',
      etiqueta: 'Referencia interna',
      defensores: [
        { id: 'rimProtectorPrimario', cuando: (p) => p.pptDoble !== null && p.pptDoble >= 1.30 },
        { id: 'drop', cuando: (p) => porEncima(p.bandaRo) && porEncima(p.bandaPptDoble) },
        { id: 'paintPillar' },
      ],
      /* `esInterior` es obligatorio: sin esa guarda, un slasher con buen
         PPT2 entraba acá y se le asignaba una marca de poste bajo. */
      test: (p) => p.esInterior && p.pptDoble >= U.pptDobleAlto,
      consigna: (p) => ({
        titulo: '3/4 POR DELANTE / FRONT.',
        detalle: 'Letal en la pintura (' + num2(p.pptDoble) + ' PPT2) y con peso en el cristal (' +
          num2(p.reboteRel) + 'x la liga en RO%). No debe recibir cómodo de espaldas al aro.',
      }),
      restriccion: (p) => ({
        titulo: 'AYUDA DE LADO DÉBIL AL PASE INTERIOR.',
        detalle: 'Si le ganan la posición, la ayuda llega desde el lado débil. El box-out es de choque: ' +
          'con ' + num2(p.reboteRel) + 'x la liga en RO%, sus segundas chances valen tanto como su primer tiro.',
      }),
    },
    {
      id: 'slasher',
      etiqueta: 'Slasher / penetrador',
      defensores: [
        { id: 'poa', cuando: (p) => porEncima(p.bandaAstPP) && p.min >= U.minutosClave },
        { id: 'transicion', cuando: (p) => porEncima(p.bandaPr) },
        { id: 'driveContainment' },
      ],
      test: (p) => p.esPerimetral && p.pptDoble >= U.pptDobleAlto,
      consigna: (p) => ({
        titulo: 'CONTENCIÓN DE MANO DOMINANTE.',
        detalle: 'Ataca el aro desde afuera con ' + num2(p.pptDoble) + ' PPT2 y ' +
          pct(p.mezclaTriple) + ' de sus tiros de campo desde la línea de 3. El daño es en el primer paso.',
      }),
      restriccion: (p) => ({
        titulo: 'SIN SALTAR AL AMAGUE.',
        detalle: 'Defensa de pecho y recupero: obligarlo a la media distancia, ' +
          'que es donde su renta cae por debajo de ' + num2(p.pptDoble) + '.',
      }),
    },
    {
      id: 'generador-riesgoso',
      etiqueta: 'Conductor con pérdidas altas',
      defensores: [
        { id: 'disruptor', cuando: (p) => porEncima(p.bandaAstPP) },
        { id: 'poa', cuando: (p) => p.min >= 28 },
        { id: 'hostigador' },
      ],
      test: (p) => p.perdidasRel >= U.perdidasAltas && p.min >= U.minutosClave,
      consigna: (p) => ({
        titulo: 'ACOSO AL DRIBLE / TRAP.',
        detalle: 'Es el eje pero con ' + pct(p.perdidas) + ' de pérdidas (' + num2(p.perdidasRel) +
          'x la liga). Saltarle al atrape en mitad de cancha e ir al ice en cada P&R.',
      }),
      restriccion: (p) => ({
        titulo: 'FORZAR EL ERROR SIN FALTA.',
        detalle: 'Sus ' + pct(p.perdidas) + ' de pérdidas son más baratas que defenderle la jugada, pero ' +
          'una falta en el atrape le devuelve la posesión y nos carga el bonus.',
      }),
    },
    {
      /* Contracara: mucho volumen, poca renta. Hay que contestarle igual,
         pero sin desarmar la estructura defensiva por él. */
      id: 'tirador-sistematico-frio',
      etiqueta: 'Tirador sistemático de bajo porcentaje',
      defensores: [
        { id: 'volumeContainment', cuando: (p) => p.t3i !== null && p.t3i >= 5.0 },
        { id: 'screenNavigator', cuando: (p) => p.usoTriple !== null && p.usoTriple >= U.usoTripleAlto },
        { id: 'closeout' },
      ],
      test: (p) => p.tiradorSistematico && p.tiroExternoFrio,
      consigna: (p) => ({
        titulo: 'CLOSE-OUT CORTO / CONTESTAR SIN SALTAR.',
        detalle: 'Lanza ' + num1(p.t3i) + ' triples por partido con ' + pct(p.t3) + ' de acierto (' +
          num2(p.pptTriple) + ' PPT3). Hay que puntearle la mano por volumen, no por peligro.',
      }),
      restriccion: (p) => ({
        titulo: 'NO CORRER EL CIERRE.',
        detalle: 'Con ' + num2(p.pptTriple) + ' por intento no justifica romper la estructura: ' +
          'si nos pasa de cara, el daño es mayor que el tiro que evitamos.',
      }),
    },
    {
      id: 'castigable-en-la-linea',
      etiqueta: 'Vulnerable en la línea',
      defensores: [
        { id: 'lowPostWall', cuando: (p) => p.esInterior },
        { id: 'interiorImpact' },
      ],
      /* Umbral duro a propósito: T1% < 40% Y volumen interno real. */
      test: (p) => p.t1 !== null && p.t1 < U.t1Regalable && p.usoDoble >= U.usoDobleInterno,
      consigna: (p) => ({
        titulo: 'VERTICALIDAD SIN CONTACTO.',
        detalle: 'Concentra ' + pct(p.usoDoble) + ' de sus plays adentro pero convierte ' + pct(p.t1) +
          ' de libres. Si finaliza cerca del aro, la falta dura es negocio.',
      }),
      restriccion: (p) => ({
        titulo: 'ÚNICO PERFIL DONDE LA FALTA ES NEGOCIO.',
        detalle: 'Con ' + pct(p.t1) + ' en la línea le estamos cambiando una finalización por ' +
          num2((p.t1 || 0) * 2) + ' puntos esperados. Con cualquier otro rival, no.',
      }),
    },
    {
      /* La invitación al tiro es la consigna más fácil de aplicar mal:
         tres condiciones acumuladas. */
      id: 'tirador-ineficiente',
      etiqueta: 'Tirador de volumen sin renta',
      defensores: [
        { id: 'readSpecialist', cuando: (p) => porEncima(p.bandaAstPP) },
        { id: 'targetDefender' },
      ],
      test: (p) => p.usoTriple >= U.usoTripleAlto && p.pptTriple <= U.pptTriplePobre &&
        !p.tiroExternoRentable && !p.viaPrincipalExterna,
      consigna: (p) => ({
        titulo: 'UNDER / FLOTACIÓN.',
        detalle: 'Tira ' + pct(p.usoTriple) + ' de sus plays de afuera y saca ' + num2(p.pptTriple) +
          ' por intento sin ser la vía principal del ataque. Cerrar la penetración y dejarlo lanzar.',
      }),
      restriccion: (p) => ({
        titulo: 'INVITACIÓN AL TIRO.',
        detalle: 'Su PPT2 es de ' + num2(p.pptDoble) + ': es preferible que flote a que entre al aro.',
      }),
    },
    {
      id: 'rebotador',
      etiqueta: 'Rebotador de impacto',
      defensores: [
        { id: 'rebotandoGuard', cuando: (p) => p.esPerimetral },
        { id: 'paintDominator', cuando: (p) => porEncima(p.bandaRo) && p.reboteDefRel !== null && p.reboteDefRel >= U.reboteInterior },
        { id: 'glassCleaner' },
      ],
      test: (p) => p.reboteRel !== null && p.reboteRel >= U.reboteOfensivoAlto,
      consigna: (p) => ({
        titulo: 'BOX-OUT DE CHOQUE.',
        detalle: 'Captura ' + num2(p.reboteRel) + 'x la mediana de la liga en rebote ofensivo (' +
          num1(p.ro) + ' RO). Hay que sacarlo del semicírculo antes de que salte.',
      }),
      restriccion: (p) => ({
        titulo: 'NO DEJARLO ENTRAR EN CARRERA.',
        detalle: 'Las segundas chances son su vía de anotación: si llega lanzado al rebote, ' +
          'la posesión defensiva no termina.',
      }),
    },
    {
      id: 'contencion',
      etiqueta: 'Rol complementario',
      defensores: [
        { id: 'interceptor', cuando: (p) => porEncima(p.bandaPr) },
        { id: 'paceController', cuando: (p) => p.min !== null && p.min < U.minutosClave },
        { id: 'freeSafety', cuando: (p) => porEncima(p.bandaRo) },
        { id: 'switchable' },
      ],
      test: () => true,   // fallback: siempre calza
      consigna: (p) => ({
        titulo: 'DROP COVERAGE / CLOSE-OUT CORTO.',
        detalle: 'Con ' + num1(p.min) + ' minutos y ' + num2(p.ppp) + ' PPP no concentra volumen ' +
          'ni tiene una amenaza dominante: alcanza con no regalarle nada fácil.',
      }),
      restriccion: (p) => ({
        titulo: 'AYUDAR DESDE ÉL.',
        detalle: 'Con ' + pct(p.usoTriple) + ' de uso externo y ' + num2(p.pptTriple) + ' PPT3 no castiga ' +
          'la rotación: es el lado por donde mandar la ayuda y desde donde doblar a los que sí condicionan el partido.',
      }),
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
       rankean por INTENTOS ABSOLUTOS (T3I/T2I/T1I). Un jugador de pocos
       minutos que tiró 3 triples en el torneo puede tener 60% de uso
       externo y no es un tirador: el semáforo tiene que marcar volumen
       real dentro de la estructura, no una fracción sobre casi nada. */
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
    /* Bandas nuevas: las fortalezas y las fugas se leen contra la liga y no
       contra umbrales fijos. Un eFG% de 0,45 es flojo en La Plata y muy malo
       en Liga Argentina — medido: la mediana pasa de 0,469 a 0,530. */
    p.bandaPptDoble = bandaLiga(idx, 'PPT2', p.pptDoble, false);
    p.bandaAstPP = bandaLiga(idx, 'AST-PP', p.astPP, false);
    p.bandaPr = bandaLiga(idx, 'PR', p.pr, false);
    p.bandaRtl = bandaLiga(idx, 'RTL%', p.rtl, false);
    p.bandaFr = bandaLiga(idx, 'FR', p.fr, false);
    p.bandaRo = bandaLiga(idx, 'RO%', p.rebote, false);

    /* Tira de afuera de verdad: sin volumen mínimo no hay regla que valga,
       dos triples en todo el torneo no describen a nadie. */
    p.tiraDeAfuera = (p.t3i !== null && p.t3i >= 1.0);
    p.tiradorSistematico = (p.t3i !== null && p.t3i >= U.volumenTripleSistematico);

    /* Rentable = supera el piso duro O está por encima de su liga. */
    p.tiroExternoRentable = p.tiraDeAfuera && (
      (p.pptTriple !== null && p.pptTriple >= U.pptTripleRentable) ||
      (p.t3 !== null && p.t3 >= U.t3Rentable) ||
      porEncima(p.bandaPptTriple) || porEncima(p.bandaT3));

    /* Frío = por debajo del piso absoluto **Y** por debajo de su liga.
       CONJUNCIÓN, no disyunción: es la asimetría que el comentario de
       arriba viene declarando desde siempre y que el código no cumplía.

       Con la disyunción, alcanzaba con estar bajo en CUALQUIERA de las
       cuatro señales, y como el piso de 0,88 PPT3 cae en el percentil 57
       de La Plata, `tirador-sistematico-frio` se llevaba el 34% de las
       fichas. Peor: ese mismo piso cae en el p35 de Liga Argentina, así
       que la etiqueta significaba cosas distintas según la categoría — lo
       contrario de lo que un umbral absoluto debería garantizar.

       Sin bandas (liga sin muestra) manda el piso absoluto solo: es el
       único dato disponible y negarse a decidir sería peor. */
    const pisoFrio = (p.pptTriple !== null && p.pptTriple < U.pptTripleFrio) ||
      (p.t3 !== null && p.t3 < U.t3Frio);
    /* El contexto es "NO destaca en su liga", no "está en el fondo de su
       liga". Con `porDebajo` estricto la regla se apagaba casi entera (2%
       de las fichas), que es el mismo defecto de P-3 dado vuelta: pedir
       las dos señales en su versión más dura deja la etiqueta sin uso.
       Lo que hay que negar es la contradicción —piso bajo pero por encima
       de su categoría—, no exigir que además sea de los peores. */
    const hayBandaTiro = p.bandaPptTriple !== null || p.bandaT3 !== null;
    const contextoFrio = !hayBandaTiro ||
      (!porEncima(p.bandaPptTriple) && !porEncima(p.bandaT3));
    p.tiroExternoFrio = !p.tiroExternoRentable && pisoFrio && contextoFrio;

    /* Tirador de volumen MEDIO sin renta: tira lo suficiente como para que
       importe (≥ 1 por partido) pero no llega a "sistemático", así que
       ninguna de las tres reglas de tiro lo tocaba. Medido: 17 fichas en
       La Plata y 18 en Jujuy quedaban con su tiro sin mencionar en todo el
       informe. No merece una marca propia —su amenaza principal casi
       siempre es otra— pero sí un bullet de fuga. */
    p.tiroExternoOcasionalFrio = !p.tiroExternoRentable && p.tiraDeAfuera &&
      !p.tiradorSistematico && pisoFrio;

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

  /**
   * Marca asignada sugerida: primera de la cascada que calza.
   *
   * `consigna` y `restriccion` salen como {titulo, detalle}. Se exponen
   * además `consignaTexto`/`restriccionTexto` planos, porque el input
   * editable de la tabla y el export a PDF necesitan un string y no un
   * objeto — pero el que manda es el objeto.
   */
  function marcaSugerida(perfil) {
    const p = PERFILES_MARCA.find(d => {
      try { return d.test(perfil); } catch (e) { return false; }
    }) || PERFILES_MARCA[PERFILES_MARCA.length - 1];

    const armar = (fn) => {
      try {
        const r = fn(perfil);
        return { titulo: String(r.titulo || ''), detalle: String(r.detalle || '') };
      } catch (e) { return { titulo: '', detalle: '' }; }
    };
    const consigna = armar(p.consigna);
    const restriccion = armar(p.restriccion);

    /* El perfil de defensor se elige AHORA, con el jugador delante: la
       misma marca puede pedir un Denier o un Sniper Stopper según a quién
       haya que cubrir. Ver `elegirDefensor()`. */
    const defensor = elegirDefensor(p, perfil);

    return {
      id: p.id, etiqueta: p.etiqueta,
      defensor: defensor,
      familiaDefensor: familiaDefensor(defensor),
      consigna: consigna, restriccion: restriccion,
      consignaTexto: (consigna.titulo + ' ' + consigna.detalle).trim(),
      restriccionTexto: (restriccion.titulo + ' ' + restriccion.detalle).trim(),
      /* `porque` se mantiene por compatibilidad con el resto del módulo:
         es la justificación de la consigna, que es la que explica la
         decisión principal. */
      porque: consigna.detalle,
    };
  }

  /* =====================================================================
     FICHA DE ANÁLISIS DE RIVAL (por jugador)

     Fortalezas = por dónde nos daña. Fugas = por dónde lo atacamos. Cada
     bullet es métrica + lectura táctica, nunca la métrica sola: un "PPT3
     1,35" sin la consecuencia en cancha no es scouting, es una planilla.
     ===================================================================== */

  /* ---------------------------------------------------------------------
     BANDAS z EN VEZ DE UMBRALES ABSOLUTOS (P-10)

     Los bullets se leían contra números fijos, y eso los volvía inútiles al
     cambiar de categoría. Medido sobre las dos ligas cargadas:

       "Sin una fisura clara"       La Plata 19%  ·  Liga Argentina  46%
       "Sin fortaleza destacada"    La Plata 21%  ·  Liga Argentina   8%

     El bloque de fugas se apagaba justo donde más falta hace: en una liga
     pareja y de mejor nivel, casi nadie baja de `eFG% < 0,45` o de
     `T1% < 0,40`, así que la mitad de las fichas quedaba sin punto de
     ataque. Ahora cada bullet pregunta "¿está por debajo de SU liga?" y la
     respuesta viaja con el nivel de la categoría.

     Los pocos absolutos que quedan son los que describen economía del
     básquet y no el promedio de una liga: 1,20 pts por triple intentado es
     caro en cualquier lado, y 40% de libres es malo en cualquier lado.
     Verificado: esos dos umbrales caen en el mismo percentil (±1) en las
     dos categorías, mientras que `pptTriplePobre` se movía 26 puntos.
     --------------------------------------------------------------------- */

  /** Sufijo con la lectura de liga, cuando hay banda. */
  function ctx(b) { return b ? ' (' + b.label.toLowerCase() + ')' : ''; }

  /* =====================================================================
     6 bis. PLAN DEFENSIVO COLECTIVO

     El problema que resuelve: hasta acá la tabla de marcas era un listado
     de fichas AISLADAS. Cada celda decía qué hacerle a un jugador, pero
     ninguna decía de dónde sale la ayuda para hacerlo. Y una defensa no es
     la suma de once marcas individuales: si a cuatro rivales les ponés
     "doblar", te quedaste sin nadie para doblar.

     El plan clasifica el ecosistema rival ANTES de escribir las conexiones,
     y después cada celda se escribe sabiendo qué hacen las otras diez:

       FOCOS       → a quién se dobla (y desde dónde sale esa ayuda)
       INTOCABLES  → de quién NO se sale nunca (tiro rentable)
       FUENTES     → desde quién se ayuda (tiro frío o sin renta)
       CRISTAL     → quién exige box-out asignado en vez de rotar

     La regla de coherencia que amarra todo: **si hay un foco tiene que
     haber una fuente**. Si el rival no tiene ningún lado barato, el plan
     lo dice en vez de inventar una ayuda que no existe.
     ===================================================================== */

  /** Cuántos focos como máximo antes de que "doblar a todos" deje de ser
      un plan. Con más de dos, la ayuda se diluye y conviene defender 1x1. */
  const MAX_FOCOS = 2;
  /** Mínimo de tiradores rentables para considerar que el rival abre la
      cancha y las ayudas profundas dejan de ser rentables. */
  const MIN_TIRADORES_SPACING = 3;

  const ESCENARIOS = [
    {
      id: 'franquicia-solitaria',
      label: 'Franquicia solitaria',
      /* Un foco que concentra bastante más que el segundo: el plan puede
         permitirse cargar las ayudas sobre él sin quedar descubierto. */
      test: (e) => e.focos.length === 1 && e.fuentes.length >= 1,
      consigna: (e) => 'Todo el peso de la ayuda va sobre ' + e.focos[0].nombre +
        '. La segunda y la tercera opción defienden 1x1 y saltan al doblaje cuando él ataca.',
    },
    {
      id: 'spacing-alto',
      label: 'Ataque abierto · spacing alto',
      /* Con tres o más tiradores rentables, cada ayuda profunda es un
         triple liberado. El plan cambia de doblar a cerrar líneas. */
      test: (e) => e.intocables.length >= MIN_TIRADORES_SPACING,
      consigna: (e) => 'Con ' + e.intocables.length + ' amenazas externas rentables no hay ayuda profunda que pague: ' +
        'defensa 1x1, close-out corto y negación de la línea de pase. Nadie sale de su tirador.',
    },
    {
      id: 'interior-y-frios',
      label: 'Interior dominante con perímetro frío',
      test: (e) => e.focos.some(f => f.interior) && e.fuentes.length >= 2,
      consigna: (e) => 'La ayuda al poste bajo sale de los perimetrales fríos (' +
        enumerar(e.fuentes.slice(0, 2).map(f => f.nombre)) + '), no del lado de los tiradores.',
    },
    {
      id: 'sin-lado-barato',
      label: 'Sin lado barato',
      /* Caso incómodo y real: todos tiran bien. Decirlo es más útil que
         designar una fuente de ayuda que no existe. */
      test: (e) => e.focos.length >= 1 && e.fuentes.length === 0,
      consigna: () => 'No hay un lado barato desde donde ayudar: la ayuda tiene que salir de rotación corta ' +
        'y volver, o directamente jugar 1x1 y aceptar el duelo.',
    },
    {
      id: 'distribuido',
      label: 'Ataque distribuido',
      test: () => true,
      consigna: (e) => e.focos.length
        ? 'Sin un eje único: marcas individuales firmes y ayuda solo sobre ' +
          enumerar(e.focos.map(f => f.nombre)) + '.'
        : 'Ningún jugador condiciona el plan por sí solo: el partido se define en la disciplina colectiva, no en una marca.',
    },
  ];

  /**
   * Clasifica el plantel rival en los cuatro grupos del plan.
   * Recibe las filas ya calculadas (perfil + marca) para no recalcular
   * nada: el plan no puede contradecir a la tabla que tiene al lado.
   */
  function clasificarEcosistema(filas) {
    const ref = (f, motivo, extra) => Object.assign({
      clave: f.clave, nombre: f.nombre, motivo: motivo,
      interior: !!f.perfil.esInterior,
    }, extra || {});

    /* INTOCABLES primero: la pertenencia a este grupo veta la de FUENTES.
       Es la regla más cara del informe — soltar a un tirador rentable. */
    const intocables = filas.filter(f => f.perfil.tiroExternoRentable)
      .map(f => ref(f, 'T3% ' + pct(f.perfil.t3) + ' con ' + num2(f.perfil.pptTriple) + ' por intento'));
    const esIntocable = (f) => intocables.some(x => x.clave === f.clave);

    /* FOCOS: los que obligan a mandar una segunda marca. El motivo cita la
       razón por la que entró, no una métrica cualquiera: decir "7,8% de
       los plays" de alguien que entró por ser referencia interna hace
       parecer que 7,8% es mucho, y no lo es. */
    const motivoFoco = (f) => {
      if (f.perfil.concentracion !== null && f.perfil.concentracion >= U.concentracionAlta) {
        return pct(f.perfil.concentracion) + ' de los plays del equipo';
      }
      if (f.perfil.adn && f.perfil.adn.jerarquia && f.perfil.adn.jerarquia.id === 'franquicia') {
        return 'jugador franquicia del plantel';
      }
      return f.marca.etiqueta.toLowerCase();
    };
    const focos = filas.filter(f =>
      ['tirador-elite', 'interior-dominante', 'slasher'].indexOf(f.marca.id) !== -1 ||
      (f.perfil.concentracion !== null && f.perfil.concentracion >= U.concentracionAlta) ||
      (f.perfil.adn && f.perfil.adn.jerarquia && f.perfil.adn.jerarquia.id === 'franquicia'))
      .sort((a, b) => (b.perfil.concentracion || 0) - (a.perfil.concentracion || 0))
      .slice(0, MAX_FOCOS)
      .map(f => ref(f, motivoFoco(f)));
    const esFoco = (f) => focos.some(x => x.clave === f.clave);

    /* CRISTAL: no se rota desde ellos, se los bloquea. Se calcula ANTES que
       las fuentes porque las dos tareas son incompatibles: no se puede
       pedirle al mismo defensor que sea el primero en rotar y que no
       abandone el box-out. El rebote gana, porque la segunda chance anula
       todo el trabajo defensivo previo. */
    const cristal = filas.filter(f => f.perfil.reboteRel !== null &&
        f.perfil.reboteRel >= U.reboteOfensivoAlto)
      .sort((a, b) => b.perfil.reboteRel - a.perfil.reboteRel)
      .map(f => ref(f, num2(f.perfil.reboteRel) + 'x la mediana de la liga en RO%'));
    const esCristal = (f) => cristal.some(x => x.clave === f.clave);

    /* FUENTES: desde acá sale la ayuda. Tres vetos, en este orden de
       importancia: un intocable NUNCA (soltar un tiro rentable es el error
       más caro), un foco tampoco (el que exige doblaje no puede estar
       ayudando en otro lado) y un reboteador tampoco (ver arriba). */
    const fuentes = filas.filter(f => !esIntocable(f) && !esFoco(f) && !esCristal(f) &&
        (f.perfil.tiroExternoFrio || f.perfil.tiroExternoOcasionalFrio ||
         ['tirador-ineficiente', 'volumen-sin-eficiencia'].indexOf(f.marca.id) !== -1))
      .sort((a, b) => (a.perfil.pptTriple || 0) - (b.perfil.pptTriple || 0))
      .map(f => ref(f, f.perfil.pptTriple !== null
        ? num2(f.perfil.pptTriple) + ' por triple intentado'
        : 'sin amenaza externa'));

    return { focos, intocables, fuentes, cristal };
  }

  /**
   * Plan defensivo colectivo del cruce.
   *
   * `nuestroPlantel` es opcional y hoy solo se usa para dimensionar el
   * reparto de marcas: la planilla no trae quinteto inicial, así que el
   * plan sugiere PERFILES y el DT pone los nombres.
   */
  function generarPlanDefensivoColectivo(filas, nuestroPlantel) {
    const eco = clasificarEcosistema(filas || []);
    const esc = ESCENARIOS.find(e => { try { return !!e.test(eco); } catch (err) { return false; } });
    const nuestros = (nuestroPlantel || []).length;

    /* La coherencia que hay que poder auditar: un plan que manda a doblar
       sin decir desde dónde no es un plan.

       Con UNA excepción real, no una concesión: en `spacing-alto` la
       ausencia de fuente no es un agujero, es la conclusión. Con tres o más
       tiradores rentables el plan renuncia a ayudar a propósito y pasa a
       1x1 — pedirle una fuente de ayuda sería contradecir su propia
       consigna. Medido en Liga Argentina: 8 de 17 planteles caen ahí. */
    const renunciaAAyudar = esc.id === 'spacing-alto';
    const coherente = eco.focos.length === 0 || eco.fuentes.length >= 1 || renunciaAAyudar;

    return {
      escenario: { id: esc.id, label: esc.label, texto: esc.consigna(eco) },
      focos: eco.focos, intocables: eco.intocables, fuentes: eco.fuentes, cristal: eco.cristal,
      coherente: coherente,
      /* El aviso sale solo cuando falta la ayuda de verdad. En spacing alto
         no falta: se decidió no usarla. */
      aviso: coherente ? null
        : 'El rival no tiene ningún jugador de tiro barato: no hay lado desde donde ayudar sin pagarlo.',
      /* Cuántos defensores nuestros hacen falta con una tarea especial.
         Si supera el plantel disponible, el plan pide priorizar. */
      cargaEspecial: eco.focos.length + eco.intocables.length + eco.cristal.length,
      nuestroPlantel: nuestros || null,
      sobrecargado: nuestros ? (eco.focos.length + eco.intocables.length + eco.cristal.length) > nuestros : false,
    };
  }

  /**
   * Conexión de UN jugador con el resto del plan. Devuelve el texto que se
   * agrega al `detalle` de su consigna y de su restricción — nunca al
   * `titulo`, que es lo único editable por el DT y tiene que seguir siendo
   * su firma.
   */
  function conexionColectiva(fila, plan) {
    if (!plan) return { consigna: '', restriccion: '' };
    const yo = fila.clave;
    const en = (lista) => lista.some(x => x.clave === yo);
    const otros = (lista) => lista.filter(x => x.clave !== yo).map(x => x.nombre);
    const fuente = plan.fuentes.length ? plan.fuentes[0].nombre : null;
    const foco = plan.focos.length ? plan.focos[0].nombre : null;

    if (en(plan.focos)) {
      const ayuda = fuente
        ? 'La ayuda salta desde ' + fuente + (plan.fuentes.length > 1 ? ' o ' + plan.fuentes[1].nombre : '') + '.'
        : 'No hay lado barato: la ayuda es de rotación corta y vuelve.';
      const desde = otros(plan.intocables);
      /* Un tirador de élite es foco Y intocable a la vez: se lo dobla, y
         desde él no se ayuda nunca. Con la cascada a secas se comía la
         segunda mitad, que es justamente la más cara de olvidar. */
      const tambienIntocable = en(plan.intocables)
        ? ' Y NO es la fuente de ayuda del plan: sobre él se va, de él no se sale.'
        : '';
      return {
        consigna: ' ' + ayuda,
        restriccion: (desde.length
          ? ' Nunca desde ' + enumerar(desde) + ': ese tiro es el más caro del cruce.'
          : ' Antes de doblar, chequear que el lado débil esté cubierto.') + tambienIntocable,
      };
    }
    if (en(plan.intocables)) {
      return {
        consigna: ' Su defensor no participa de las ayudas' + (foco ? ' sobre ' + foco : '') + ': se queda.',
        restriccion: fuente
          ? ' NO es la fuente de ayuda del plan: para eso está ' + fuente + '.'
          : ' NO es la fuente de ayuda del plan bajo ninguna circunstancia.',
      };
    }
    if (en(plan.fuentes)) {
      const destino = plan.focos.length ? enumerar(plan.focos.map(f => f.nombre)) : null;
      return {
        consigna: destino
          ? ' Es el lado desde donde mandar la ayuda y doblar a ' + destino + '.'
          : ' Es el lado por donde puede salir la ayuda si hace falta.',
        restriccion: ' Su defensor es el primero que rota: quedarse con él es desperdiciar la única ayuda barata del cruce.',
      };
    }
    if (en(plan.cristal)) {
      return {
        consigna: ' Su defensor NO rota: lo bloquea y termina la posesión.',
        restriccion: ' Si su marca se va a ayudar, el rebote de ataque anula todo el trabajo defensivo previo.',
      };
    }
    return {
      consigna: foco ? ' Puede ceder su marca para doblar a ' + foco + ' si la jugada lo pide.' : '',
      restriccion: '',
    };
  }

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
        ctx(p.bandaPptTriple) + ': volumen bajo, pero cada tiro liberado es caro.');
    }
    /* Contra la liga, no contra 1,10 fijo: en Liga Argentina ese piso cae en
       el percentil 61 y describía a más de un tercio del plantel. */
    if (porEncima(p.bandaPptDoble)) {
      out.push('PPT2 ' + num2(p.pptDoble) + ctx(p.bandaPptDoble) + ': ' + (p.esInterior
        ? 'finaliza de espaldas y gana la posición previa a la recepción.'
        : 'gana el primer paso y termina en carrera.'));
    }
    if (porEncima(p.bandaAstPP)) {
      out.push('AST-PP ' + num2(p.astPP) + ctx(p.bandaAstPP) +
        ': genera ventaja para terceros, no solo para él.');
    }
    if (p.reboteRel !== null && p.reboteRel >= U.reboteOfensivoAlto) {
      out.push('RO% ' + num2(p.reboteRel) + 'x la mediana de la liga: convierte tiros errados en segundas chances.');
    }
    /* PR no participaba de NINGUNA regla del informe pese a existir el
       arquetipo "Especialista Defensivo" en la ficha del jugador. Un rival
       que roba condiciona nuestro manejo de pelota y había que decirlo. */
    if (porEncima(p.bandaPr)) {
      out.push('PR ' + num1(p.pr) + ' recuperos' + ctx(p.bandaPr) +
        ': lee las líneas de pase, ojo con los envíos cruzados y el pase de salida.');
    }
    if (p.t1 !== null && p.t1 >= U.t1Confiable && p.usoLibre !== null && p.usoLibre >= U.usoLibreAlto) {
      out.push('T1% ' + pct(p.t1) + ' con ' + pct(p.usoLibre) + ' de sus plays en la línea: el contacto le rinde.');
    }
    /* RTL% y FR tampoco entraban al scouting. Un jugador que vive de la
       línea obliga a defender vertical toda la noche. */
    if (porEncima(p.bandaRtl) && porEncima(p.bandaFr)) {
      out.push('Ataca el contacto: ' + pct(p.rtl) + ' de tasa de tiros libres y ' +
        num1(p.fr) + ' faltas recibidas' + ctx(p.bandaFr) + '. Defensa vertical o se instala en la línea.');
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
        ' de uso externo' + ctx(p.bandaPptTriple) + ': su tiro preferido es el que menos le rinde.');
    } else if (p.tiroExternoOcasionalFrio) {
      /* El hueco del tirador de volumen MEDIO: tira entre 1 y 2,5 por
         partido sin renta, así que ninguna de las tres reglas de marca lo
         alcanza y su tiro quedaba sin mencionar en todo el informe.
         Medido: 17 fichas en La Plata y 18 en Jujuy. */
      out.push('Tira ' + num1(p.t3i) + ' triples por partido con ' + num2(p.pptTriple) +
        ' de renta' + ctx(p.bandaPptTriple) + ': poco volumen para perseguirlo, ' +
        'pero es el lanzamiento que le queremos dejar.');
    }
    if (p.perdidasRel !== null && p.perdidasRel >= U.perdidasAltas) {
      out.push('%TOV ' + pct(p.perdidas) + ' (' + num2(p.perdidasRel) +
        'x la liga)' + ctx(p.bandaTov) + ': pierde bajo presión sostenida al drible.');
    } else if (porDebajo(p.bandaTov)) {
      out.push('%TOV ' + pct(p.perdidas) + ctx(p.bandaTov) +
        ': la presión al drible le rinde más de lo que le cuesta al resto del plantel.');
    }
    /* Absoluto a propósito: 40% en la línea es malo en cualquier categoría
       y habilita la falta táctica. La banda cubre el resto del rango. */
    if (p.t1 !== null && p.t1 < U.t1Regalable) {
      out.push('T1% ' + pct(p.t1) + ': la línea es su peor escenario de finalización.');
    } else if (porDebajo(p.bandaT1)) {
      out.push('T1% ' + pct(p.t1) + ctx(p.bandaT1) +
        ': cortar una jugada con falta sobre él cuesta menos que sobre cualquier otro.');
    }
    if (p.esInterior && (p.usoTriple === null || p.usoTriple < 0.10)) {
      out.push('Sin amenaza de triple (' + pct(p.usoTriple || 0) +
        ' de uso): alejarlo del aro lo saca de la jugada.');
    }
    if (porDebajo(p.bandaAstPP)) {
      out.push('AST-PP ' + num2(p.astPP) + ctx(p.bandaAstPP) +
        ': si lo contenemos sin falta, la posesión muere en sus manos.');
    }
    if (porDebajo(p.bandaEfg)) {
      out.push('eFG% ' + pct(p.efg) + ctx(p.bandaEfg) +
        ': su volumen no viene acompañado de eficiencia.');
    }
    /* Un perimetral que no llega al aro es un tiro exterior forzado
       esperando: cerrarle la línea de fondo lo deja sin plan B. */
    if (porDebajo(p.bandaPptDoble) && p.esPerimetral) {
      out.push('PPT2 ' + num2(p.pptDoble) + ctx(p.bandaPptDoble) +
        ': no resuelve cerca del aro, se lo puede empujar a la penetración.');
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
    /* Los dados de BAJA salen del plan: no van a estar en la cancha, así
       que asignarles una marca es gastar una decisión defensiva en alguien
       que no juega. Sus datos SÍ siguen contando en las medianas de la
       competencia (`enMedianas`), que es lo que decidió el club: los
       partidos que jugó, los jugó.

       Sin el módulo de estados cargado —Node, o antes de que el DT
       confirme nada— todos pasan y el informe sale igual que siempre. */
    const enPlan = (j) => (typeof SGADD_BUZON === 'undefined') ? true
      : SGADD_BUZON.enPlan(j['NOMBRES'], j['EQUIPO']);
    const plantel = (idx.liga.jugadoresPorEquipo.get(e.clave) || [])
      .filter(enPlan)
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

    /* ------------------------------------------------------------------
       SEGUNDA PASADA · el plan colectivo

       Hace falta que las once fichas estén calculadas para saber quién es
       foco, quién intocable y quién fuente de ayuda. Recién con el mapa
       completo se pueden escribir las conexiones entre celdas: una marca
       que dice "doblar" necesita que otra diga "desde acá sale la ayuda".

       El texto se agrega SOLO al `detalle`. El `titulo` en mayúsculas es
       la firma del DT y sigue siendo lo único editable.
       ------------------------------------------------------------------ */
    const nuestroPlantel = idx.liga.jugadoresPorEquipo
      ? (Array.from(idx.liga.jugadoresPorEquipo.keys())
          .filter(k => SGADD.esEquipoPropio(k))
          .reduce((acc, k) => acc.concat(idx.liga.jugadoresPorEquipo.get(k) || []), []))
      : [];
    const plan = generarPlanDefensivoColectivo(filas, nuestroPlantel);
    /* Señales defensivas de los nuestros, calculadas UNA vez para las once
       filas: normalizar el plantel por cada marca sería el mismo trabajo
       repetido y daría exactamente lo mismo. */
    const señalesPropias = señalesPlantel(idx, nuestroPlantel);

    /* La carga se reparte sobre las filas ordenadas por minutos, que ya es
       el orden de la tabla: el que más juega elige perfil primero. */
    const usados = {};
    const cargaPropia = {};   // cuántas marcas lleva ya cada defensor nuestro
    filas.forEach(f => {
      const def = elegirDefensorBalanceado(
        PERFILES_MARCA.find(m => m.id === f.marca.id), f.perfil, usados);
      if (def) {
        usados[def] = (usados[def] || 0) + 1;
        f.marca.defensor = def;
        f.marca.familiaDefensor = familiaDefensor(def);
        /* Quién de los nuestros puede hacer esa tarea. Se reparte la carga
           con `cargaPropia`: sin eso, el mismo defensor encabezaba las once
           filas y la sugerencia dejaba de decir nada. */
        const cat = CATALOGO_DEFENSOR.find(c => c.perfiles.some(x => x.label === def));
        f.marca.candidatos = cat ? candidatosPropios(cat.id, señalesPropias, cargaPropia) : [];
        f.marca.candidatos.forEach((c, i) => {
          /* Solo el primero suma carga: es el que el DT va a leer como
             sugerencia principal, los otros dos son alternativas. */
          if (i === 0) cargaPropia[c.nombre] = (cargaPropia[c.nombre] || 0) + 1;
        });
      }
      const cx = conexionColectiva(f, plan);
      f.plan = {
        foco: plan.focos.some(x => x.clave === f.clave),
        intocable: plan.intocables.some(x => x.clave === f.clave),
        fuente: plan.fuentes.some(x => x.clave === f.clave),
        cristal: plan.cristal.some(x => x.clave === f.clave),
      };
      if (cx.consigna) {
        f.marca.consigna.detalle += cx.consigna;
        f.marca.consignaTexto = (f.marca.consigna.titulo + ' ' + f.marca.consigna.detalle).trim();
      }
      if (cx.restriccion) {
        f.marca.restriccion.detalle += cx.restriccion;
        f.marca.restriccionTexto = (f.marca.restriccion.titulo + ' ' + f.marca.restriccion.detalle).trim();
      }
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
      plan: plan,
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
    {
      /* NUEVA. `PR` era la única métrica defensiva del rival que el informe
         no miraba: ocho reglas y ninguna hablaba de sus manos. Un plantel
         que roba por encima de su liga condiciona NUESTRO manejo, y eso se
         prepara antes del partido, no en el primer tiempo muerto. */
      id: 'lineas-de-pase', icono: '🧲', titulo: 'Líneas de pase del rival',
      buscar: (ps) => ps.filter(p => porEncima(p.bandaPr) && p.min >= U.minutosClave),
      texto: (ms) => 'Manos activas en ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'recupera ' + num1(m.pr) + ' balones por partido') +
        '. Nada de pases cruzados ni de salida en bandeja: pivotear y pasar con el cuerpo entre medio.',
    },
    {
      /* NUEVA. La contracara barata del bloque de tiro: los que lanzan lo
         suficiente para que importe pero no lo suficiente para perseguirlos.
         Sin esta clave, el DT no tenía dónde leer que ESE es el tiro que
         conviene conceder cuando hay que elegir. */
      id: 'concesion-perimetral', icono: '📐', titulo: 'Concesión perimetral selectiva',
      buscar: (ps) => ps.filter(p => p.tiroExternoOcasionalFrio && p.min >= U.minutosClave),
      texto: (ms) => 'Si hay que soltar a alguien, es ' + nombres(ms) + ': ' +
        detallePorJugador(ms, m => 'lanza ' + num1(m.t3i) + ' triples con ' + num2(m.pptTriple) + ' de renta') +
        '. Volumen bajo para perseguirlos, renta baja para preocuparse: cerrar el aro y aceptar ese tiro.',
    },
  ];

  /** Enumeración natural: "A", "A y B", "A, B y C". Con `join(' y ')` a
      partir de tres elementos queda "A y B y C", que se lee a los tropezones
      en un informe que el DT lee en voz alta al plantel. */
  function enumerar(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }

  /**
   * Marca un nombre para que salga en negrita. Se usa `**...**` y NO
   * `<b>` a propósito: el motor es puro y su salida se escapa antes de
   * inyectarla en el DOM. Si emitiera HTML habría que dejar de escapar el
   * resumen entero, y un nombre de jugador con `<` en la planilla se
   * convertiría en un agujero. La UI escapa primero y recién después
   * convierte el marcador (`scoutNegritas`).
   */
  function neg(nombre) { return '**' + nombre + '**'; }

  function nombres(perfiles) { return enumerar(perfiles.map(p => p.nombre)); }

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

  /**
   * Síntesis ejecutiva del plan. Seis tramos fijos, todos alrededor de los
   * JUGADORES y no del equipo como bloque:
   *
   *   1. ritmo y balance defensivo
   *   2. eje de ataque y creación (volumen + PPP)
   *   3. a quién NO se puede soltar (stay home)
   *   4. a quién conviene invitar a tirar
   *   5. carga del cristal (box-out asignado)
   *   6. criterio global + momento reciente
   *
   * La prioridad la marcan MIN y PLAYS: se nombra primero a los que el
   * motor de JUGADORES clasifica como Clave o Importante por su banda de
   * minutos, porque son los que van a estar en cancha en los momentos que
   * definen el partido. Los de rotación baja entran solo si disparan una
   * regla puntual (un tirador caro de 12 minutos sigue siendo caro).
   *
   * NUNCA se los llama titulares: la planilla no trae el quinteto inicial
   * y 25 minutos de promedio los puede hacer un sexto hombre.
   */
  function resumenEjecutivo(idx, claveNuestro, claveRival) {
    const eR = idx.get(claveRival);
    if (!eR) return '';
    const tabla = jugadoresClave(idx, claveRival);
    if (!tabla || !tabla.filas.length) return '';

    const partes = [];
    const filas = tabla.filas;
    const orden = (fn) => filas.slice().sort((a, b) => (fn(b) || 0) - (fn(a) || 0));

    /* Carga alta = Clave o Importante por banda de minutos. Es la etiqueta
       del motor centralizado, no un umbral propio de este archivo. */
    const cargaAlta = (f) => f.perfil.adn && f.perfil.adn.rolMinutos &&
      ['clave', 'importante'].indexOf(f.perfil.adn.rolMinutos.id) !== -1;
    /* Prioriza a los de carga alta sin descartar al resto: un especialista
       de pocos minutos que dispara una regla se nombra igual, pero después. */
    const priorizar = (lista) => lista.slice().sort((a, b) => {
      const d = (cargaAlta(b) ? 1 : 0) - (cargaAlta(a) ? 1 : 0);
      return d !== 0 ? d : (b.perfil.min || 0) - (a.perfil.min || 0);
    });

    /* ---- 1. Ritmo y balance defensivo ---- */
    const pace = idx.leer(claveRival, 'PACE');
    if (pace && pace.percentil !== null) {
      partes.push(neg(eR.nombre) + (pace.percentil >= 66
        ? ' juega a ritmo alto (' + pace.formateado + '), así que el plan individual se sostiene o se cae con el balance defensivo.'
        : pace.percentil <= 34
          ? ' juega a ritmo controlado (' + pace.formateado + '): pocas posesiones, y cada marca individual pesa el doble.'
          : ' maneja un ritmo de media tabla (' + pace.formateado + '): el partido lo definen los duelos, no el tempo.'));
    }

    /* ---- 2. Eje de ataque y creación ---- */
    const porPlays = orden(f => f.perfil.concentracion);
    const eje = porPlays[0];
    if (eje && eje.perfil.concentracion !== null) {
      const segundo = porPlays[1];
      partes.push('El ataque pasa por ' + neg(eje.nombre) + ' (' + pct(eje.perfil.concentracion) +
        ' de los plays del equipo, ' + num1(eje.perfil.pts) + ' pts con ' + num2(eje.perfil.ppp) + ' PPP, ' +
        eje.rol.label.toLowerCase() + ')' +
        (segundo && segundo.perfil.concentracion !== null
          ? ', con ' + neg(segundo.nombre) + ' como segunda vía (' + pct(segundo.perfil.concentracion) + ').'
          : '.') +
        ' Su marca es la decisión más cara de la noche: ' + eje.marca.consigna.titulo.toLowerCase().replace(/.$/, '') + '.');
    }

    /* ---- 3. Stay home: los que no se sueltan ---- */
    const cerrar = priorizar(filas.filter(f => f.perfil.tiroExternoRentable)).slice(0, 3);
    if (cerrar.length) {
      partes.push('Prohibido soltar a ' +
        enumerar(cerrar.map(f => neg(f.nombre) + ' (' + pct(f.perfil.t3) + ' de 3, ' + num2(f.perfil.pptTriple) + ' PPT3)')) +
        ': sobre ' + (cerrar.length > 1 ? 'ellos' : 'él') + ' la consigna es stay home, ' +
        'no se ayuda desde ese lado aunque se rompa la pintura.');
    }

    /* ---- 4. Invitación selectiva al tiro ---- */
    const permitir = priorizar(filas.filter(f =>
      ['tirador-ineficiente', 'tirador-sistematico-frio', 'volumen-sin-eficiencia'].indexOf(f.marca.id) !== -1
    )).slice(0, 3);
    if (permitir.length) {
      partes.push('En cambio ' +
        enumerar(permitir.map(f => neg(f.nombre) + ' (eFG% ' + pct(f.perfil.efg) +
          (f.perfil.pptTriple !== null ? ', ' + num2(f.perfil.pptTriple) + ' PPT3' : '') + ')')) +
        ' ' + (permitir.length > 1 ? 'son' : 'es') + ' donde queremos que termine la posesión. ' +
        'Cerrar los caminos al aro y aceptar ese lanzamiento es ganancia, no concesión.');
    }

    /* ---- 5. Carga y control del cristal ---- */
    const cristal = priorizar(orden(f => f.perfil.reboteRel).filter(f =>
      f.perfil.reboteRel !== null && f.perfil.reboteRel >= U.reboteOfensivoAlto)).slice(0, 2);
    if (cristal.length) {
      /* El múltiplo va pegado a cada nombre: separarlos en dos listas
         obliga a contar posiciones para saber cuál es de quién. */
      partes.push('Box-out asignado sobre ' +
        enumerar(cristal.map(f => neg(f.nombre) + ' (' + num2(f.perfil.reboteRel) + 'x la liga en RO%)')) +
        ': sin cargarlos, las segundas chances les devuelven las posesiones que la defensa les saca.');
    }

    /* Extra táctico: por dónde se los rompe. No es uno de los seis tramos
       fijos, pero cuando hay un conductor que pierde mucho es la vía más
       barata de sacarlos de partido y sería una omisión callarla. */
    const presionables = priorizar(orden(f => f.perfil.perdidasRel).filter(f =>
      f.perfil.perdidasRel !== null && f.perfil.perdidasRel >= U.perdidasAltas &&
      f.perfil.min >= U.minutosClave)).slice(0, 2);
    if (presionables.length) {
      partes.push('La vía para romperlos es la conducción: ' +
        enumerar(presionables.map(f => neg(f.nombre) + ' pierde ' + pct(f.perfil.perdidas) +
          ' de sus plays (' + num2(f.perfil.perdidasRel) + 'x la liga)')) +
        '. Presión al drible en mitad de cancha y trap en la primera cortina.');
    }

    /* ---- 6. Criterio global + momento reciente, en un solo cierre ---- */
    const cuenta = {};
    filas.forEach(f => { cuenta[f.marca.id] = (cuenta[f.marca.id] || 0) + 1; });
    const perimetro = (cuenta['tirador-elite'] || 0) + (cuenta['tirador-eficiente-bajo-volumen'] || 0);
    const interior = (cuenta['interior-dominante'] || 0) + (cuenta['rebotador'] || 0);

    let criterio;
    if (perimetro && interior) {
      criterio = 'Criterio global: no se puede cerrar todo. Con ' + perimetro + ' amenaza' +
        (perimetro > 1 ? 's' : '') + ' externa' + (perimetro > 1 ? 's' : '') + ' real' +
        (perimetro > 1 ? 'es' : '') + ' y ' + interior + ' de pintura, se sostiene el perímetro y se colapsa con ayuda ' +
        'de lado débil, aceptando la media distancia como el mal menor.';
    } else if (perimetro) {
      criterio = 'Criterio global: clausura perimetral. El daño llega de afuera, así que se niega el catch & shoot ' +
        'y se cierran esquinas, aun a costa de conceder penetraciones controladas hacia la ayuda.';
    } else if (interior) {
      criterio = 'Criterio global: colapso de la pintura. Sin amenaza externa que castigue, se hunde la defensa, ' +
        'se niega la recepción interior y se carga el cristal.';
    } else {
      criterio = 'Criterio global: sin una amenaza que se despegue, alcanza con sostener la estructura y no regalar tiros cómodos.';
    }

    const ciclo = analisisCiclo(idx, claveRival);
    const efgEq = idx.leer(claveRival, 'eFG%');
    let momento = '';
    if (ciclo && ciclo.pj) {
      const g = ciclo.ganados ? ciclo.ganados.pj : 0;
      const p = ciclo.perdidos ? ciclo.perdidos.pj : 0;
      momento = ' Llegan ' + g + '-' + p + ' en sus últimos ' + ciclo.pj + ' partidos' +
        (efgEq && efgEq.percentil !== null
          ? ', con un eFG% de temporada de ' + efgEq.formateado + ' (percentil ' + efgEq.percentil.toFixed(0) + ' de la liga).'
          : '.');
    }
    partes.push(criterio + momento);

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
    PERFILES_MARCA, PERFILES_DEFENSOR, CATALOGO_DEFENSOR, familiaDefensor, REGLAS_CLAVE,
    elegirDefensor, elegirDefensorBalanceado, defensoresAlcanzables,
    candidatosPropios, señalesPlantel, MAX_CANDIDATOS_PROPIOS, MIN_CANDIDATO_PROPIO,
    ESCENARIOS, clasificarEcosistema, generarPlanDefensivoColectivo, conexionColectiva,
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
/**
 * Aviso de estado en la ficha del rival.
 *
 * Solo se pinta para los estados con `avisaEnScouting` (🟡 SUSPENSO y 🔵
 * ALTA). Los dados de 🔴 BAJA no llegan hasta acá: `jugadoresClave()` ya
 * los sacó del plan, así que no hay ficha que marcar — y ese es el punto,
 * no gastar una decisión defensiva en alguien que no va a estar.
 *
 * Es una alerta y no un badge más: va en su propia línea, con borde, para
 * que no se lea como un arquetipo. Un lesionado que vuelve y un refuerzo
 * recién llegado cambian el plan de la misma forma que un dato del box
 * score, y el DT tiene que verlo antes de repartir las marcas.
 */
function scoutEstadoJugador(perfil) {
  if (typeof SGADD_BUZON === 'undefined' || !perfil) return '';
  const est = SGADD_BUZON.estadoDe(perfil.nombre, perfil.equipo || '');
  if (!est || !est.avisaEnScouting) return '';
  const detalle = est.id === 'ALTA'
    ? 'Incorporación reciente: sus promedios salen de pocos partidos.'
    : 'Sin minutos en las últimas fechas. Si vuelve, entra con esta ficha.';
  return `<p class="mt-1 text-[10px] leading-snug px-2 py-1 rounded border ${est.borde} ${est.color}">
    ${est.emoji} <b>${escapeHtml(est.label)}</b> · ${escapeHtml(detalle)}</p>`;
}

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

/**
 * Cabecera del plan colectivo: el escenario del rival y los cuatro grupos.
 * Va ARRIBA de la tabla a propósito — es el marco que explica por qué cada
 * celda dice lo que dice, y leerlo después convierte las conexiones en
 * ruido.
 */
function scoutPlanColectivo(plan) {
  if (!plan) return '';
  const grupo = (titulo, lista, color, nota) => {
    if (!lista.length) return '';
    return `
      <div class="rounded-lg border ${color} p-3 min-w-0">
        <p class="text-[10px] uppercase tracking-widest font-display mb-1.5">${escapeHtml(titulo)}</p>
        <ul class="space-y-1">
          ${lista.map(x => `<li class="text-[11px] leading-snug">
            <span class="text-white font-medium">${escapeHtml(x.nombre)}</span>
            <span class="dato-sec"> · ${escapeHtml(x.motivo)}</span></li>`).join('')}
        </ul>
        <p class="text-[10px] dato-sec mt-2 leading-snug">${escapeHtml(nota)}</p>
      </div>`;
  };

  const aviso = plan.aviso
    ? `<p class="text-[11px] text-yellow-400 mt-3 leading-snug">⚠ ${escapeHtml(plan.aviso)}</p>` : '';
  const sobrecarga = plan.sobrecargado
    ? `<p class="text-[11px] text-yellow-400 mt-1 leading-snug">⚠ El plan pide ${plan.cargaEspecial} tareas
       defensivas especiales y el plantel tiene ${plan.nuestroPlantel} jugadores cargados: hay que priorizar.</p>` : '';

  return `
    <div class="rounded-lg border border-accent/40 bg-accent/5 p-4 mb-4">
      <p class="text-[10px] uppercase tracking-widest text-accent font-display mb-1">Plan colectivo · ${escapeHtml(plan.escenario.label)}</p>
      <p class="text-xs text-ink leading-snug mb-3">${escapeHtml(plan.escenario.texto)}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        ${grupo('🎯 Focos · se dobla', plan.focos, 'border-red-400/40', 'La segunda marca llega acá.')}
        ${grupo('🚫 No se sueltan', plan.intocables, 'border-green-400/40', 'Su defensor no ayuda nunca.')}
        ${grupo('↩ Fuentes de ayuda', plan.fuentes, 'border-blue-400/40', 'Desde acá sale la rotación.')}
        ${grupo('🏰 Box-out asignado', plan.cristal, 'border-yellow-400/40', 'Se los bloquea, no se rota desde ellos.')}
      </div>
      ${aviso}${sobrecarga}
    </div>`;
}

function scoutBloqueMarcas(inf) {
  const t = inf.jugadoresRival;
  if (!t || !t.filas.length) return '';

  const filas = t.filas.map(f => {
    const g = SCOUT_UI.marcas[f.clave] || {};
    /* Solo el TÍTULO es editable. La justificación numérica va debajo en
       solo lectura: es el dato que sostiene la directiva y no tiene
       sentido que el DT la reescriba a mano — si el número cambia, tiene
       que cambiar con la planilla. */
    const consigna = g.consigna !== undefined ? g.consigna : f.marca.consigna.titulo;
    const restriccion = g.restriccion !== undefined ? g.restriccion : f.marca.restriccion.titulo;
    /* El defensor viene precargado con el PERFIL táctico sugerido, no con
       un nombre: quién lo cubre depende de quién esté en cancha y de las
       faltas de cada uno. El DT lo reemplaza al armar la rotación. */
    const defensor = g.defensor !== undefined ? g.defensor : f.marca.defensor;
    const celdaDirectiva = (valor, campo, detalle, color) => `
        <td class="px-2 py-2 align-top text-left">
          <input type="text" value="${escapeAttr(valor)}"
            oninput="scoutMarca('${SGADD_UI.escJs(f.clave)}', '${campo}', this.value)"
            class="w-full bg-surface2 border border-hairline rounded px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${color} focus:border-accent outline-none">
          <p class="text-[10px] text-muted leading-snug mt-1 text-left">${escapeHtml(detalle)}</p>
        </td>`;
    return `
      <tr class="border-b border-hairline/40 last:border-0 align-top">
        <td class="px-2 py-2 text-left">
          <p class="text-xs text-white">${escapeHtml(f.nombre)}</p>
          <p class="text-[10px] text-accent">${escapeHtml(f.rol.label)}</p>
          ${f.perfil.jerarquia ? `<p class="text-[10px] text-blue-400">${escapeHtml(f.perfil.jerarquia)}</p>` : ''}
          <p class="text-[10px] dato-sec">${escapeHtml(SGADD.formatear('MIN', f.perfil.min))} min · ${escapeHtml(SGADD.formatear('PTS', f.perfil.pts))} pts · ${escapeHtml(SGADD.formatear('PPP', f.perfil.ppp))} PPP</p>
        </td>
        <td class="px-2 py-2 align-top text-left">
          <input type="text" value="${escapeAttr(defensor)}" title="${escapeAttr(defensor)}" placeholder="Perfil o nombre"
            oninput="scoutMarca('${SGADD_UI.escJs(f.clave)}', 'defensor', this.value)"
            class="w-full bg-surface2 border border-hairline rounded px-2 py-1 text-[11px] focus:border-accent outline-none">
          ${f.marca.familiaDefensor ? `<p class="text-[10px] text-muted mt-1 text-left">${escapeHtml(f.marca.familiaDefensor)}</p>` : ''}
          ${(f.marca.candidatos && f.marca.candidatos.length) ? `
            <p class="text-[10px] text-left mt-1 leading-snug">
              <span class="dato-sec">De los nuestros:</span>
              ${f.marca.candidatos.map((c, i) => `<span class="${i === 0 ? 'text-accent font-semibold' : 'text-ink'}"
                >${escapeHtml(SGADD.clavePersona(c.nombre).split(',')[0])}</span>`).join('<span class="dato-sec"> · </span>')}
            </p>` : ''}
        </td>
        ${celdaDirectiva(consigna, 'consigna', f.marca.consigna.detalle, 'text-accent')}
        ${celdaDirectiva(restriccion, 'restriccion', f.marca.restriccion.detalle, 'text-white')}
      </tr>`;
  }).join('');

  return `
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="marcas">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-1">🛡 Plan defensivo · marca asignada</h4>
      <p class="text-[11px] text-muted mb-3">
        Cada celda trae la <strong>directiva en mayúsculas</strong> (editable: el plan lo firma el cuerpo
        técnico) y debajo la <strong>justificación con el número</strong> que la disparó, que sale de la
        planilla y no se toca a mano. Las marcas están <strong>conectadas entre sí</strong>: la ayuda que
        pide una celda sale del jugador que otra celda designa como fuente.
      </p>
      <p class="text-[11px] text-muted mb-3 leading-snug">
        <b>De los nuestros</b> propone hasta tres jugadores del plantel para cada tarea, el primero
        en naranja. Cruza <b>tapas, recuperos, faltas, rebote y minutos</b>, comparados dentro del
        propio plantel. Lo que el box score no mide es el trabajo sin pelota —desplazamiento,
        navegación de cortinas, puntos permitidos por marca—, así que es una sugerencia y no un
        veredicto: el nombre final lo pone el cuerpo técnico.
      </p>
      ${scoutPlanColectivo(t.plan)}
      <div class="scrollbox"><table class="w-full text-left" style="min-width:62rem">
        <thead><tr class="text-[10px] uppercase tracking-wider text-muted">
          <th class="px-2 pb-1" style="width:18%">Jugador rival</th>
          <th class="px-2 pb-1" style="width:22%">Defensor nuestro</th>
          <th class="px-2 pb-1" style="width:30%">Consigna técnica principal</th>
          <th class="px-2 pb-1" style="width:30%">Restricción / alerta</th>
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

/**
 * Escapa PRIMERO y convierte el marcador `**...**` DESPUÉS. El orden
 * importa: al revés, un nombre con `<` en la planilla saldría del texto y
 * entraría al DOM como markup.
 */
function scoutNegritas(texto) {
  return escapeHtml(texto || '').replace(/\*\*(.+?)\*\*/g, '<b class="text-white">$1</b>');
}

function scoutBloqueResumen(inf) {
  if (!inf.resumen) return '';
  return `
    <section class="scout-card card rounded-xl p-4 sm:p-5 border border-hairline" data-bloque="resumen">
      <h4 class="font-display uppercase tracking-wide text-xs text-accent mb-2">🧠 Resumen de criterio estratégico</h4>
      <p class="text-[12px] text-ink leading-relaxed">${scoutNegritas(inf.resumen)}</p>
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
        ${scoutEstadoJugador(p)}
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
        <div class="border-t border-hairline/50 pt-2 space-y-1.5">
          <div>
            <p class="text-[11px] text-accent font-semibold uppercase tracking-wide">${escapeHtml(f.marca.consigna.titulo)}</p>
            <p class="text-[10px] text-muted leading-snug">${escapeHtml(f.marca.consigna.detalle)}</p>
          </div>
          <div>
            <p class="text-[11px] text-white font-semibold uppercase tracking-wide">${escapeHtml(f.marca.restriccion.titulo)}</p>
            <p class="text-[10px] text-muted leading-snug">${escapeHtml(f.marca.restriccion.detalle)}</p>
          </div>
          <p class="text-[10px]"><span class="dato-sec">Defensor sugerido:</span>
            <span class="text-ink">${escapeHtml(f.marca.defensor)}</span>
            ${f.marca.familiaDefensor ? `<span class="dato-sec"> · ${escapeHtml(f.marca.familiaDefensor)}</span>` : ''}</p>
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
      ${[eR, eN].map(e => `<button type="button" onclick="scoutCambiarObjetivo('${SGADD_UI.escJs(e.clave)}')"
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
