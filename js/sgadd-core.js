/* =====================================================================
   SGADD · Núcleo de datos
   Club Reconquista La Plata — Sistema de Gestión y Análisis de Datos

   Sin dependencias. Corre en browser y en Node (para tests).

   Contenido:
     1. ESQUEMA    — contrato de columnas de cada hoja
     2. METRICAS   — registro único: hoja dueña, dirección, formato, glosario
     3. CATALOGO   — cliente → tira → categoría → sheetId, + Ruta (routing)
     4. INDICE     — construirIndice(), clave EQUIPO+FASE, percentiles
     5. VALIDADOR  — contrato de esquema + test de simetría de liga
   ===================================================================== */

(function (raiz) {
  'use strict';

  /* =====================================================================
     0. UTILIDADES
     ===================================================================== */

  /**
   * GViz devuelve `v` (valor tipado) y `f` (string formateado). Para celdas
   * con formato porcentual, `v` ya viene como fracción (0.4168) y `f` como
   * "41,68%". Preferimos SIEMPRE `v`. Este parser también acepta strings
   * sueltos para poder testear con TSV pegado a mano.
   *
   * Convención interna: los porcentajes se guardan como FRACCIÓN (0.4168).
   * El formateo a "41,7%" ocurre solo en la capa de presentación.
   */
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    const esPct = s.indexOf('%') !== -1;
    s = s.replace(/%/g, '').replace(/\s/g, '');
    // "1.234,56" (es-AR) vs "1234.56"
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.indexOf(',') !== -1) s = s.replace(',', '.');
    const n = parseFloat(s);
    if (!isFinite(n)) return null;
    return esPct ? n / 100 : n;
  }

  function texto(v) {
    return (v === null || v === undefined) ? '' : String(v).trim();
  }

  /** Normaliza nombres de equipo: "ATENAS 'A' - MM" → "ATENAS A" */
  function claveEquipo(v) {
    return texto(v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s*-\s*MM\b/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Normaliza nombres de persona. OJO: esto NO reemplaza un ID de jugador.
   * Sirve para agrupar dentro de UNA planilla; para el histórico plurianual
   * hace falta la maestra JUGADORES.
   */
  function clavePersona(v) {
    return texto(v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s*,\s*/g, ', ')      // "MOREIRA , PEDRO" → "MOREIRA, PEDRO"
      .replace(/\s+/g, ' ')
      .trim();
  }

  function listaPjs(equipos) {
    const out = [];
    equipos.forEach(e => { if (typeof e.pj === 'number' && e.pj > 0) out.push(e.pj); });
    return out;
  }

  function mediana(vals) {
    const a = vals.filter(v => typeof v === 'number' && isFinite(v)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function promedio(vals) {
    const a = vals.filter(v => typeof v === 'number' && isFinite(v));
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  }

  /* =====================================================================
     1. ESQUEMA — contrato de columnas
     Derivado de las constantes ENCABEZADOS_FINALES_* del backend.
     `req`  = si falta, la hoja no sirve → error
     `opt`  = si falta, se degrada la UI → warning
     ===================================================================== */

  const COLS_BOX = [
    'MIN', 'PLAYS', 'PTS', 'PPP', 'eFG%', 'TS%', 'RTL%',
    'PT2%', 'PT3%', 'PT1%', 'PePP%',
    'T2C', 'T2I', 'PPT2', 'T2%', 'T3C', 'T3I', 'PPT3', 'T3%',
    'T1C', 'T1I', 'PPT1', 'T1%', 'TCC', 'TCI', 'TC%',
    'RD', 'RD%', 'RO', 'RO%', 'RT', 'RT%',
    'AST', 'AST%', 'PR', 'PR%', 'PP', 'AST-PP', 'TC', 'TR', 'FC', 'FR', 'VAL',
    'PTSopp', 'RDopp', 'ROopp', 'PPopp', 'PLAYSopp',
  ];

  const COLS_CRUDAS = [
    'MIN', 'PLAYS', 'PTS', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I', 'TCC', 'TCI',
    'RD', 'RO', 'RT', 'AST', 'PR', 'PP', 'AST-PP', 'TC', 'TR', 'FC', 'FR', 'VAL',
    'PTSopp', 'RDopp', 'ROopp', 'PPopp', 'PLAYSopp',
  ];

  const COLS_4F = [
    'PTS', 'PTSopp', 'RTNG OFF', 'RTNG DEF', 'NET RTNG',
    'PPP OF', 'PPP DEF', 'NET PPP',
    'eFG%', 'PP%', 'RTL%', 'RO%',
    'eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%',
  ];

  const ESQUEMA = {
    'PROMEDIOS E': {
      rol: 'equipo-temporada', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_BOX.filter(c => c !== 'USG%')),
      opt: ['POS', 'PACE'],
    },
    'ACUMULADO E': {
      rol: 'equipo-temporada-total', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_CRUDAS),
      opt: ['POS', 'PACE'],
    },
    'Base Datos E': {
      rol: 'equipo-partido', grano: 'equipo', filaTipo: null,
      clave: ['PARTIDO', 'EQUIPO'],
      req: ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO'].concat(COLS_BOX.filter(c => c !== 'USG%')),
      opt: ['POS', 'PACE'],
    },
    'PROMEDIOS 4F': {
      rol: 'factores-temporada', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_4F),
      opt: [],
    },
    'ACUMULADO 4F': {
      rol: 'factores-temporada-total', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      // OJO: esta hoja NO trae los 4 factores, solo ratings.
      req: ['EQUIPO', 'FASE', 'PJ', 'PTS', 'PTSopp', 'RTNG OFF', 'RTNG DEF', 'NET RTNG', 'PPP OF', 'PPP DEF', 'NET PPP'],
      opt: [],
    },
    '4 FACTORES': {
      rol: 'factores-partido', grano: 'equipo', filaTipo: null,
      clave: ['PARTIDO', 'EQUIPO'],
      req: ['PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO'].concat(COLS_4F),
      opt: ['FECHA'],   // viene vacía en la planilla actual → se joinea por PARTIDO
    },
    'PROMEDIOS J': {
      rol: 'jugador-temporada', grano: 'jugador', filaTipo: 'JUGADOR TIPO',
      clave: ['NOMBRES', 'EQUIPO', 'FASE'],
      req: ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'USG%'].concat(COLS_BOX),
      opt: [],
    },
    'ACUMULADO J': {
      rol: 'jugador-temporada-total', grano: 'jugador', filaTipo: 'JUGADOR TIPO',
      clave: ['NOMBRES', 'EQUIPO', 'FASE'],
      req: ['NOMBRES', 'EQUIPO', 'FASE', 'PJ'].concat(COLS_CRUDAS),
      opt: [],
    },
    'Base Datos J': {
      rol: 'jugador-partido', grano: 'jugador', filaTipo: null,
      clave: ['PARTIDO', 'NOMBRES'],
      req: ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'USG%'].concat(COLS_BOX),
      opt: [],
    },
    /* RANKINGS J y RANKINGS E quedan EXCLUIDAS a propósito.
       No son tablas: son bloques apilados con encabezados repetidos, filas
       TIPO intermedias y notas de criterio. GViz asume fila 1 = headers y
       devuelve basura. Los rankings se derivan en el cliente desde
       PROMEDIOS E / PROMEDIOS 4F, que además da los percentiles gratis. */
  };

  const HOJAS_EXCLUIDAS = ['RANKINGS J', 'RANKINGS E'];

  /* ---------------------------------------------------------------------
     FASES — el valor de la columna FASE.

     Corresponde al Nivel 5 del árbol de Drive (tipo de archivo del partido),
     NO al Nivel 4. La fase del torneo (CLAUSURA / APERTURA) está un escalón
     más arriba y define QUÉ PLANILLA se abre, no qué filas se filtran.

       Drive:  Año / Torneo / Categoría / FaseTorneo / TipoArchivo
                2026 / TORNEO LOCAL / PRIMERA / CLAUSURA / REGULAR

     TOTAL es un agregado, no una fase real: nunca se mezcla con las otras.
     --------------------------------------------------------------------- */
  const FASES = {
    REGULAR:   { id: 'REGULAR',   label: 'Fase regular', agregado: false, orden: 1 },
    REPECHAJE: { id: 'REPECHAJE', label: 'Repechaje',    agregado: false, orden: 2 },
    PLAYOFF:   { id: 'PLAYOFF',   label: 'Playoffs',     agregado: false, orden: 3 },
    TOTAL:     { id: 'TOTAL',     label: 'Total',        agregado: true,  orden: 9 },
  };

  /** Qué fases traen datos de verdad en una planilla concreta. */
  function fasesDisponibles(hojas) {
    const vistas = new Set();
    ['PROMEDIOS E', 'PROMEDIOS 4F', 'Base Datos E'].forEach(n => {
      const h = hojas[n];
      if (!h) return;
      h.filas.forEach(f => {
        const v = texto(f['FASE']).toUpperCase();
        if (v) vistas.add(v);
      });
    });
    return Array.from(vistas)
      .map(id => FASES[id] || { id, label: id, agregado: false, orden: 5 })
      .sort((a, b) => a.orden - b.orden);
  }

  /* =====================================================================
     2. METRICAS — el registro único de verdad
     `hoja`      : quién manda. Si la métrica está en dos hojas, gana esta.
     `invertida` : true = menos es mejor.
     `formato`   : pct | num2 | num1 | int | ratio
     ===================================================================== */

  const M = (clave, label, hoja, formato, invertida, grupo, glosario) =>
    ({ clave, label, hoja, formato, invertida: !!invertida, grupo, glosario });

  const P4F = 'PROMEDIOS 4F', PE = 'PROMEDIOS E';

  const METRICAS_LISTA = [
    /* --- Índices de eficiencia (solo viven en 4F) --- */
    M('RTNG OFF', 'Rating ofensivo', P4F, 'num1', false, 'eficiencia',
      'Puntos cada 100 PLAYS. OJO: es por PLAYS, no por posesiones — no es comparable con el ORTG de la NBA.'),
    M('RTNG DEF', 'Rating defensivo', P4F, 'num1', true, 'eficiencia',
      'Puntos recibidos cada 100 PLAYS del rival. Menos es mejor.'),
    M('NET RTNG', 'Rating neto', P4F, 'num1', false, 'eficiencia',
      'RTNG OFF menos RTNG DEF. En la fila EQUIPO TIPO se lee de su propia celda: es la mediana de los netos, no la resta de las medianas.'),
    M('PPP OF', 'Puntos por play', P4F, 'num2', false, 'eficiencia', 'PTS / PLAYS.'),
    M('PPP DEF', 'Puntos por play rival', P4F, 'num2', true, 'eficiencia', 'PTS rival / PLAYS rival.'),
    M('NET PPP', 'PPP neto', P4F, 'num2', false, 'eficiencia', 'PPP OF menos PPP DEF.'),

    /* --- 4 factores ofensivos ---
       eFG%, RTL% y RO% se leen de PROMEDIOS E: ahí el ratio se calcula sobre
       los totales de la temporada (ponderado). En PROMEDIOS 4F se promedian
       los ratios partido a partido, y un partido de 40 tiros pesa igual que
       uno de 70. Verificado sobre 12/12 equipos. */
    M('eFG%', 'eFG%', PE, 'pct', false, 'factores-of',
      '(TCC + 0,5 × T3C) / TCI. Tiro de campo ajustado por el valor del triple.'),
    M('PePP%', 'Tasa de pérdidas', PE, 'pct', true, 'factores-of',
      'PP / PLAYS. Misma métrica que PP% de PROMEDIOS 4F, con otra agregación. Menos es mejor.'),
    M('RTL%', 'Ratio de tiros libres', PE, 'pct', false, 'factores-of',
      'T1C / TCI. Libres convertidos por tiro de campo intentado.'),
    M('RO%', 'Rebote ofensivo', PE, 'pct', false, 'factores-of',
      'RO / (RO + RD del rival).'),

    /* --- 4 factores defensivos (solo existen en 4F) --- */
    M('eFG Opp%', 'eFG% permitido', P4F, 'pct', true, 'factores-def', 'eFG% del rival.'),
    M('PP Opp%', 'Pérdidas forzadas', P4F, 'pct', false, 'factores-def', 'Tasa de pérdidas del rival. Más es mejor.'),
    M('RTL Opp%', 'Libres concedidos', P4F, 'pct', true, 'factores-def', 'RTL% del rival.'),
    M('RO Opp%', 'Rebote ofensivo rival', P4F, 'pct', true, 'factores-def', 'RO% del rival. Menos es mejor.'),

    /* --- Ritmo. Dispersión bajísima en esta liga (CV 2-3%): sirve como
           contexto, NO como KPI destacado. --- */
    M('POS', 'Posesiones', PE, 'num1', false, 'ritmo', 'TCI + PP + 0,44 × T1I − RO.'),
    M('PACE', 'Ritmo', PE, 'num1', false, 'ritmo', 'Posesiones proyectadas a 200 minutos de equipo.'),
    M('PLAYS', 'Plays', PE, 'num1', false, 'ritmo', 'TCI + 0,44 × T1I + PP.'),
    M('PPP', 'Puntos por play', PE, 'num2', false, 'ritmo', 'PTS / PLAYS.'),

    /* --- Distribución de plays. DESCRIPTIVA: los cuatro suman 100%.
           No lleva coloreo de mejor/peor salvo PePP%. --- */
    M('PT2%', 'Peso de los dobles', PE, 'pct', false, 'distribucion', 'T2I / PLAYS.'),
    M('PT3%', 'Peso de los triples', PE, 'pct', false, 'distribucion', 'T3I / PLAYS.'),
    M('PT1%', 'Peso de los libres', PE, 'pct', false, 'distribucion', '0,44 × T1I / PLAYS.'),

    /* --- Tiro --- */
    M('TS%', 'True Shooting', PE, 'pct', false, 'tiro', 'PTS / (2 × (TCI + 0,44 × T1I)).'),
    M('TC%', 'TC%', PE, 'pct', false, 'tiro', 'TCC / TCI.'),
    M('TCC', 'Tiros de campo conv.', PE, 'num1', false, 'tiro', ''),
    M('TCI', 'Tiros de campo int.', PE, 'num1', false, 'tiro', ''),
    M('T2%', 'T2%', PE, 'pct', false, 'tiro', 'T2C / T2I.'),
    M('T2C', 'Dobles conv.', PE, 'num1', false, 'tiro', ''),
    M('T2I', 'Dobles int.', PE, 'num1', false, 'tiro', ''),
    M('PPT2', 'Puntos por doble int.', PE, 'num2', false, 'tiro', 'T2C × 2 / T2I.'),
    M('T3%', 'T3%', PE, 'pct', false, 'tiro', 'T3C / T3I.'),
    M('T3C', 'Triples conv.', PE, 'num1', false, 'tiro', ''),
    M('T3I', 'Triples int.', PE, 'num1', false, 'tiro', ''),
    M('PPT3', 'Puntos por triple int.', PE, 'num2', false, 'tiro', 'T3C × 3 / T3I.'),
    M('T1%', 'T1%', PE, 'pct', false, 'tiro', 'T1C / T1I.'),
    M('T1C', 'Libres conv.', PE, 'num1', false, 'tiro', ''),
    M('T1I', 'Libres int.', PE, 'num1', false, 'tiro', ''),
    M('PPT1', 'Puntos por libre int.', PE, 'num2', false, 'tiro', 'T1C / T1I.'),

    /* --- Rebote --- */
    M('RD', 'Rebotes defensivos', PE, 'num1', false, 'rebote', ''),
    M('RD%', 'Rebote defensivo', PE, 'pct', false, 'rebote', 'RD / (RD + RO del rival).'),
    M('RO', 'Rebotes ofensivos', PE, 'num1', false, 'rebote', ''),
    M('RT', 'Rebotes totales', PE, 'num1', false, 'rebote', ''),
    M('RT%', 'Rebote total', PE, 'pct', false, 'rebote', 'RT / (RT propio + RT rival).'),

    /* --- Otras. Direcciones confirmadas: PR = pelotas recuperadas (más es
           mejor), PP = pérdidas (menos), TC = tapas cometidas (más),
           TR = tapas recibidas (menos). --- */
    M('AST', 'Asistencias', PE, 'num1', false, 'otras', ''),
    M('AST%', 'Canastas asistidas', PE, 'pct', false, 'otras', 'AST / TCC del equipo.'),
    M('AST-PP', 'Asistencias por pérdida', PE, 'num2', false, 'otras', 'AST / PP. La métrica que más separa equipos en esta liga.'),
    M('PR', 'Pelotas recuperadas', PE, 'num1', false, 'otras', ''),
    M('PR%', 'Recuperos sobre pérdidas rival', PE, 'pct', false, 'otras', 'PR / PP del rival.'),
    M('PP', 'Pelotas perdidas', PE, 'num1', true, 'otras', ''),
    M('TC', 'Tapas cometidas', PE, 'num1', false, 'otras', ''),
    M('TR', 'Tapas recibidas', PE, 'num1', true, 'otras', ''),
    M('FC', 'Faltas cometidas', PE, 'num1', true, 'otras', ''),
    M('FR', 'Faltas recibidas', PE, 'num1', false, 'otras', ''),
    M('VAL', 'Valoración', PE, 'num1', false, 'otras', ''),

    /* --- Marcador --- */
    M('PTS', 'Puntos', PE, 'num1', false, 'marcador', ''),
    M('PTSopp', 'Puntos recibidos', PE, 'num1', true, 'marcador', ''),
    M('PJ', 'Partidos jugados', PE, 'int', false, 'contexto', ''),
    M('MIN', 'Minutos', PE, 'num1', false, 'contexto', ''),
    M('USG%', 'Uso', 'PROMEDIOS J', 'pct', false, 'jugador',
      'Porcentaje de plays del equipo que termina el jugador mientras está en cancha.'),
  ];

  const METRICAS = {};
  METRICAS_LISTA.forEach(m => { METRICAS[m.clave] = m; });

  /* ---------------------------------------------------------------------
     VISTAS — agrupaciones de presentación.

     Acá se resuelve de raíz el bug de dirección de PePP%: `descriptiva` es
     una propiedad de LA TABLA, no de la métrica. PePP% es una métrica
     evaluativa (perder menos es mejor, invertida: true) y como tal se lee en
     "4 factores ofensivos". Pero dentro de "Distribución de plays" los cuatro
     valores suman 100%: ahí la tabla responde "¿en qué termina cada play?",
     no "¿está bien o mal?", y por eso no lleva coloreo ni ranking.

     Una métrica puede vivir en varias vistas sin contradecirse.
     --------------------------------------------------------------------- */
  const VISTAS = {
    'eficiencia': {
      label: 'Índices de eficiencia', descriptiva: false,
      metricas: ['RTNG OFF', 'RTNG DEF', 'NET RTNG', 'PPP OF', 'PPP DEF', 'NET PPP'],
    },
    'factores-of': {
      label: '4 factores ofensivos', descriptiva: false,
      metricas: ['eFG%', 'PePP%', 'RTL%', 'RO%'],
    },
    'factores-def': {
      label: '4 factores defensivos', descriptiva: false,
      metricas: ['eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'],
    },
    'distribucion-plays': {
      label: 'Distribución de plays', descriptiva: true,
      metricas: ['PT2%', 'PT3%', 'PT1%', 'PePP%'],
      nota: 'Los cuatro suman 100%. Describe en qué termina cada play, no si está bien o mal.',
      sumaCien: true,
    },
    'ritmo': {
      label: 'Ritmo y volumen', descriptiva: true,
      metricas: ['POS', 'PACE', 'PLAYS', 'PPP'],
      nota: 'En esta liga el ritmo casi no separa equipos (CV 2-3%). Es contexto, no diagnóstico.',
    },
    'tiro': {
      label: 'Tiro', descriptiva: false,
      metricas: ['TS%', 'TC%', 'TCC', 'TCI', 'T2%', 'T2C', 'T2I', 'PPT2', 'T3%', 'T3C', 'T3I', 'PPT3', 'T1%', 'T1C', 'T1I', 'PPT1'],
    },
    'rebote': {
      label: 'Rebote', descriptiva: false,
      metricas: ['RD', 'RD%', 'RO', 'RO%', 'RT', 'RT%'],
    },
    'otras': {
      label: 'Otras estadísticas', descriptiva: false,
      metricas: ['AST', 'AST%', 'AST-PP', 'PR', 'PR%', 'PP', 'TC', 'TR', 'FC', 'FR', 'VAL'],
    },
  };

  /** Grupos nativos que nunca se colorean, sin importar la vista. */
  const GRUPOS_DESCRIPTIVOS = ['contexto'];

  function vista(id) { return VISTAS[id] || null; }

  function metrica(clave) { return METRICAS[clave] || null; }

  function formatear(clave, valor) {
    if (valor === null || valor === undefined || !isFinite(valor)) return '—';
    const m = METRICAS[clave];
    const f = m ? m.formato : 'num2';
    switch (f) {
      case 'pct':  return (valor * 100).toFixed(1).replace('.', ',') + '%';
      case 'int':  return String(Math.round(valor));
      case 'num1': return valor.toFixed(1).replace('.', ',');
      case 'num2': return valor.toFixed(2).replace('.', ',');
      default:     return String(valor);
    }
  }

  /* =====================================================================
     3. CATALOGO — cliente → tira → categoría, y routing
     ===================================================================== */

  /* ---------------------------------------------------------------------
     CATALOGO — lista PLANA de planillas con dimensiones.

     Lo modelé como árbol rígido cliente→tira→categoría y estaba mal: la ruta
     real de Drive es Año/Torneo/Categoría/FaseTorneo, y la "tira" (Femenina /
     Negra / Naranja) no aparece ahí. Un árbol fijo obliga a reescribirlo cada
     vez que aparece una dimensión nueva.

     Con una lista plana + dimensiones, la UI agrupa por lo que quiera y sumar
     un eje es agregar una propiedad, no rehacer la estructura.
     --------------------------------------------------------------------- */

  const CATALOGO = {
    /* Reconquista no se llama igual en todas las tiras, pero siempre contiene
       "RECONQUISTA". Por eso el equipo propio es un patrón, no un literal. */
    patronEquipoPropio: /RECONQUISTA/,

    planillas: [
      {
        id: 'primera-clausura-2026',
        sheetId: '1Zi2cBd0WGUTks-S0XCxR0hoGpB9KZGuqisFhzdtJl4s',
        anio: 2026, torneo: 'TORNEO LOCAL', categoria: 'PRIMERA',
        faseTorneo: 'CLAUSURA', rama: 'masculina', tira: null,
        modulo: 'adicional',            // Primera se factura aparte del SGADD
        label: 'Primera · Clausura 2026',
        activo: true,
      },
      /* Las 9 del SGADD. Completar sheetId y poner activo: true.
         tira: femenina | negra | naranja   ·   categoria: U15 | U19 | U21 */
      ...['femenina', 'negra', 'naranja'].flatMap(tira =>
        ['U15', 'U17', 'U21'].map(cat => ({
          id: tira + '-' + cat.toLowerCase() + '-clausura-2026',
          // U21 ya tiene planilla. Falta confirmar a qué tira pertenece.
          sheetId: (tira === 'negra' && cat === 'U21') ? '1CD7FEDcLkmZRI0tGkU67IjCmkxhnnIN2AKHhA4lWJT4' : '',
          anio: 2026, torneo: 'TORNEO LOCAL', categoria: cat,
          faseTorneo: 'CLAUSURA',
          rama: tira === 'femenina' ? 'femenina' : 'masculina',
          tira: tira,
          modulo: 'sgadd',
          label: ({ femenina: 'Femenina', negra: 'Masculina Negra', naranja: 'Masculina Naranja' })[tira] + ' · ' + cat,
          activo: (tira === 'negra' && cat === 'U21'),
        }))
      ),
    ],
  };

  function planilla(id) {
    return CATALOGO.planillas.find(p => p.id === id) || null;
  }

  /** ¿Es este el equipo del club? Patrón, no igualdad. */
  function esEquipoPropio(nombre) {
    return CATALOGO.patronEquipoPropio.test(claveEquipo(nombre));
  }

  /** Agrupa el catálogo por la dimensión que pida la UI. */
  function agrupar(planillas, dimension) {
    const g = new Map();
    planillas.forEach(p => {
      const k = p[dimension] === null || p[dimension] === undefined ? '—' : String(p[dimension]);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(p);
    });
    return g;
  }

  /**
   * Planillas visibles para un scope. El scope llega del login (a futuro).
   * Filtra por: módulo contratado, tira, categoría y estado activo.
   */
  function planillasVisibles(scope) {
    const s2 = scope || {};
    return CATALOGO.planillas.filter(p => {
      if (!p.activo && !s2.incluirInactivas) return false;
      if (s2.modulos && s2.modulos.indexOf(p.modulo) === -1) return false;
      if (s2.tiras && p.tira && s2.tiras.indexOf(p.tira) === -1) return false;
      if (s2.categorias && s2.categorias.indexOf(p.categoria) === -1) return false;
      return true;
    });
  }

  /* --- Routing: #/cliente/tira/categoria/seccion/entidad/tab --- */
  /* Ruta: #/<planilla>/<fase>/<seccion>/<entidad>/<tab>
     Ej: #/negra-u19-clausura-2026/REGULAR/equipos/atenas-a/4factores */
  const Ruta = {
    parse(hash) {
      const partes = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      return {
        planilla: partes[0] || null,
        fase:     partes[1] ? partes[1].toUpperCase() : null,
        seccion:  partes[2] || 'principal',
        entidad:  partes[3] || null,
        tab:      partes[4] || null,
      };
    },
    build(r) {
      const p = [r.planilla, r.fase, r.seccion, r.entidad, r.tab]
        .filter(v => v !== null && v !== undefined && v !== '')
        .map(encodeURIComponent);
      return '#/' + p.join('/');
    },
  };

  /* =====================================================================
     4. INDICE
     ===================================================================== */

  /**
   * Normaliza una hoja cruda a { cols:[], filas:[{COL:valor}] }.
   * Acepta el shape de GViz o un array de objetos ya parseado.
   */
  function normalizarHoja(cols, filas) {
    return { cols: cols.slice(), filas: filas };
  }

  /*
     Las hojas traen DOS tipos de fila TIPO y hay que separarlas:

       JUGADOR TIPO | ASTILLERO - MM | REGULAR | ...  ← mediana DE ESE EQUIPO
       JUGADOR TIPO |                | REGULAR | ...  ← mediana DE LA LIGA

     Con 12 equipos son 12 + 2 = 14 filas TIPO en PROMEDIOS J. Tomar la
     primera que aparece devuelve la del primer equipo del abecedario, no la
     de la liga: el umbral de minutos sale 11,83 (Astillero) en vez de 15,58.
  */
  function esFilaTipo(fila, identificador) {
    if (!identificador) return false;
    return Object.keys(fila).some(k => texto(fila[k]).toUpperCase() === identificador);
  }

  /** ¿Es la fila TIPO global (sin equipo) o la de un equipo puntual? */
  function tipoDeLiga(fila, identificador, campoEquipo) {
    if (!esFilaTipo(fila, identificador)) return false;
    const eq = texto(fila[campoEquipo || 'EQUIPO']).toUpperCase();
    return eq === '' || eq === identificador;
  }

  /**
   * Percentil de `valor` dentro de `vals`, respetando la dirección de la métrica.
   * Definición: 100 × (n − mejores − 0,5 × iguales) / n.
   * Con EQUIPO TIPO = mediana, el TIPO cae exactamente en 50.
   */
  function percentil(vals, valor, invertida) {
    const a = vals.filter(v => typeof v === 'number' && isFinite(v));
    if (!a.length || typeof valor !== 'number' || !isFinite(valor)) return null;
    let mejores = 0, iguales = 0;
    a.forEach(v => {
      if (v === valor) iguales++;
      else if (invertida ? v < valor : v > valor) mejores++;
    });
    return 100 * (a.length - mejores - 0.5 * iguales) / a.length;
  }

  /**
   * construirIndice(hojas, opciones)
   *
   * @param {Object} hojas  { 'PROMEDIOS E': {cols, filas}, ... }
   * @param {Object} opciones { fase: 'REGULAR' }
   *
   * Devuelve un índice con clave EQUIPO+FASE. Una sola pasada por hoja.
   */
  function construirIndice(hojas, opciones) {
    const opt = opciones || {};
    const fase = opt.fase || 'REGULAR';

    const equipos = new Map();   // claveEquipo -> { nombre, promedios, acumulado, factores, partidos:[], jugadores:[] }
    const liga = { fase: fase, n: 0, tipo: {}, distribuciones: {} };
    const avisos = [];

    function equipo(nombreCrudo) {
      const k = claveEquipo(nombreCrudo);
      if (!k) return null;
      if (!equipos.has(k)) {
        equipos.set(k, {
          clave: k, nombre: texto(nombreCrudo).replace(/\s*-\s*MM\s*$/i, '').trim(),
          promedios: null, acumulado: null, factores: null, factoresTotal: null,
          partidos: [], factoresPartido: [], jugadores: [],
        });
      }
      return equipos.get(k);
    }

    /* --- Hojas de equipo por temporada (una fila por EQUIPO+FASE) --- */
    const porTemporada = [
      ['PROMEDIOS E', 'promedios'],
      ['ACUMULADO E', 'acumulado'],
      ['PROMEDIOS 4F', 'factores'],
      ['ACUMULADO 4F', 'factoresTotal'],
    ];

    porTemporada.forEach(([hoja, campo]) => {
      const h = hojas[hoja];
      if (!h) { avisos.push('Falta la hoja ' + hoja); return; }
      const idTipo = ESQUEMA[hoja].filaTipo;

      h.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        // La clave es EQUIPO + FASE. Sin esto, cuando aparezca la fila TOTAL
        // de cada equipo el lookup devuelve la primera que encuentre.
        if (faseFila && faseFila !== fase) return;

        if (esFilaTipo(fila, idTipo)) {
          if (!tipoDeLiga(fila, idTipo, 'EQUIPO')) return;   // TIPO de un equipo, no de la liga
          // La fila TIPO es la MEDIANA columna por columna. Dos reglas:
          //  1. Nunca derivar una columna de otra: la mediana de las
          //     diferencias no es la diferencia de las medianas
          //     (RTNG OFF − RTNG DEF ≠ NET RTNG en esta misma fila).
          //  2. Viene REDONDEADA a 2 decimales por la planilla. Nunca
          //     compararla por igualdad exacta contra la mediana calculada;
          //     usar tolerancia (~1e-4).
          Object.keys(fila).forEach(c => {
            const v = num(fila[c]);
            if (v !== null && liga.tipo[c] === undefined) liga.tipo[c] = v;
          });
          return;
        }

        const e = equipo(fila['EQUIPO']);
        if (!e) return;
        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        e[campo] = datos;
      });
    });

    /* --- Partido a partido --- */
    const porPartido = [
      ['Base Datos E', 'partidos'],
      ['4 FACTORES', 'factoresPartido'],
    ];

    porPartido.forEach(([hoja, campo]) => {
      const h = hojas[hoja];
      if (!h) { avisos.push('Falta la hoja ' + hoja); return; }
      h.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        const e = equipo(fila['EQUIPO']);
        if (!e) return;
        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        datos.__partido = texto(fila['PARTIDO']);
        e[campo].push(datos);
      });
    });

    /* --- FECHA viene vacía en 4 FACTORES: se hereda desde Base Datos E
           usando PARTIDO + EQUIPO como clave del join. --- */
    const fechaPorPartido = new Map();
    equipos.forEach(e => {
      e.partidos.forEach(p => {
        if (p.__partido && p['FECHA']) fechaPorPartido.set(p.__partido, p['FECHA']);
      });
    });
    equipos.forEach(e => {
      e.factoresPartido.forEach(f => {
        if (!f['FECHA'] && fechaPorPartido.has(f.__partido)) f['FECHA'] = fechaPorPartido.get(f.__partido);
      });
    });

    /* --- Jugadores --- */
    const hj = hojas['PROMEDIOS J'];
    if (hj) {
      const idTipo = ESQUEMA['PROMEDIOS J'].filaTipo;
      hj.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        const datosTipo = () => {
          const o = {};
          Object.keys(fila).forEach(c => { const v = num(fila[c]); if (v !== null) o[c] = v; });
          return o;
        };

        if (esFilaTipo(fila, idTipo)) {
          if (tipoDeLiga(fila, idTipo, 'EQUIPO')) {
            // Mediana de TODA la liga: de acá sale el umbral de minutos.
            if (!liga.jugadorTipo) liga.jugadorTipo = datosTipo();
          } else {
            // Mediana del plantel: sirve para comparar a un jugador contra
            // sus propios compañeros, no contra la liga entera.
            const eT = equipo(fila['EQUIPO']);
            if (eT) eT.jugadorTipo = datosTipo();
          }
          return;
        }
        const e = equipo(fila['EQUIPO']);
        if (!e) return;
        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        // Clave provisoria por nombre. Reemplazar por ID cuando exista la
        // maestra JUGADORES: el histórico plurianual no se puede sostener
        // con strings de nombre.
        datos.__clave = clavePersona(fila['NOMBRES']);
        e.jugadores.push(datos);
      });
    }

    /* ---------------------------------------------------------------------
       Partidos DISTINTOS.

       Base Datos E trae dos filas por partido (una por equipo), así que
       contar filas cuenta el doble. El partido se identifica por la columna
       PARTIDO; FECHA sola no alcanza porque hay varios el mismo día.
       --------------------------------------------------------------------- */
    const clavesPartido = new Set();
    equipos.forEach(e => e.partidos.forEach(p => { if (p.__partido) clavesPartido.add(p.__partido); }));
    liga.partidos = clavesPartido.size;
    let filasP = 0; equipos.forEach(e => { filasP += e.partidos.length; });
    liga.filasPartido = filasP;

    /* ---------------------------------------------------------------------
       Tamaño de muestra.

       Con 1 o 2 partidos jugados, la mediana de la liga y los percentiles no
       significan nada: un mal día se ve igual que una debilidad estructural.
       Los datos se muestran igual, pero marcados.
       --------------------------------------------------------------------- */
    equipos.forEach(e => { e.pj = (e.promedios && typeof e.promedios['PJ'] === 'number') ? e.promedios['PJ'] : e.partidos.length; });
    const pjs = listaPjs(equipos);
    liga.pjMin = pjs.length ? Math.min.apply(null, pjs) : 0;
    liga.pjMax = pjs.length ? Math.max.apply(null, pjs) : 0;
    liga.pjMediano = mediana(pjs) || 0;
    liga.PJ_MINIMO = 5;                        // por debajo de esto, todo es ruido
    liga.muestraSuficiente = liga.pjMediano >= liga.PJ_MINIMO;

    /* ---------------------------------------------------------------------
       Umbral de minutos para jugadores.

       Sin esto los rankings individuales son basura. Ejemplo real de
       PROMEDIOS J: un jugador con MIN 4,63 y PLAYS 1,63 figura con
       RTL% 133,33% (metió 0,67 libres cada 0,50 tiros de campo) y
       PePP% 51,23%. Matemáticamente correcto, deportivamente ruido.

       Usamos el mismo criterio que tus hojas RANKINGS: MIN del JUGADOR TIPO.
       --------------------------------------------------------------------- */
    liga.minJugador = (liga.jugadorTipo && typeof liga.jugadorTipo['MIN'] === 'number')
      ? liga.jugadorTipo['MIN'] : null;

    function califica(j) {
      if (liga.minJugador === null) return true;
      return typeof j['MIN'] === 'number' && j['MIN'] >= liga.minJugador;
    }

    const todosJugadores = [];
    equipos.forEach(e => {
      e.jugadores.forEach(j => { j.__califica = califica(j); todosJugadores.push(j); });
      e.jugadoresCalificados = e.jugadores.filter(j => j.__califica);
    });
    liga.jugadores = todosJugadores;
    liga.jugadoresCalificados = todosJugadores.filter(j => j.__califica);

    /* --- Distribuciones para percentiles --- */
    const listaEquipos = Array.from(equipos.values());
    liga.n = listaEquipos.length;

    Object.keys(METRICAS).forEach(clave => {
      const m = METRICAS[clave];
      const campo = (m.hoja === 'PROMEDIOS 4F') ? 'factores'
                  : (m.hoja === 'PROMEDIOS J') ? null : 'promedios';
      if (!campo) return;
      const vals = listaEquipos
        .map(e => e[campo] ? e[campo][clave] : null)
        .filter(v => typeof v === 'number' && isFinite(v));
      if (vals.length) liga.distribuciones[clave] = vals;
    });

    // Distribuciones de jugador: SOLO sobre los que superan el umbral.
    liga.distribucionesJ = {};
    if (liga.jugadoresCalificados.length) {
      const clavesJ = new Set();
      liga.jugadoresCalificados.forEach(j => Object.keys(j).forEach(k => clavesJ.add(k)));
      clavesJ.forEach(clave => {
        if (clave.indexOf('__') === 0) return;
        const vals = liga.jugadoresCalificados
          .map(j => j[clave])
          .filter(v => typeof v === 'number' && isFinite(v));
        if (vals.length >= 3) liga.distribucionesJ[clave] = vals;
      });
    }

    /**
     * Lee una métrica de un equipo desde su hoja dueña, con contexto.
     * Devuelve { valor, tipo, delta, percentil, formateado, descriptiva }.
     */
    function leer(claveEq, claveMet, idVista) {
      const e = equipos.get(claveEquipo(claveEq));
      const m = METRICAS[claveMet];
      if (!e || !m) return null;
      const v = idVista ? VISTAS[idVista] : null;
      const campo = (m.hoja === 'PROMEDIOS 4F') ? 'factores' : 'promedios';
      const valor = e[campo] ? e[campo][claveMet] : null;
      const val = (typeof valor === 'number' && isFinite(valor)) ? valor : null;
      const tipo = (liga.tipo[claveMet] !== undefined) ? liga.tipo[claveMet] : null;
      const dist = liga.distribuciones[claveMet] || [];
      return {
        clave: claveMet,
        label: m.label,
        valor: val,
        formateado: formatear(claveMet, val),
        tipo: tipo,
        tipoFormateado: formatear(claveMet, tipo),
        delta: (val !== null && tipo !== null) ? val - tipo : null,
        percentil: percentil(dist, val, m.invertida),
        invertida: m.invertida,
        // Si se pide en el contexto de una vista, manda la vista.
        descriptiva: v ? !!v.descriptiva : (GRUPOS_DESCRIPTIVOS.indexOf(m.grupo) !== -1),
        vista: idVista || null,
        // Contexto de muestra: un percentil sobre 2 partidos no es un percentil.
        pj: e.pj || 0,
        muestraSuficiente: (e.pj || 0) >= liga.PJ_MINIMO && liga.muestraSuficiente,
        n: dist.length,
      };
    }

    /** Ranking de un equipo en una métrica (1 = mejor). */
    function ranking(claveEq, claveMet) {
      const r = leer(claveEq, claveMet);
      if (!r || r.valor === null) return null;
      const m = METRICAS[claveMet];
      const dist = liga.distribuciones[claveMet] || [];
      const mejores = dist.filter(v => m.invertida ? v < r.valor : v > r.valor).length;
      return { puesto: mejores + 1, de: dist.length };
    }

    /** Lee una métrica de un jugador con su contexto de liga. */
    function leerJugador(jugador, claveMet) {
      const m = METRICAS[claveMet];
      if (!jugador || !m) return null;
      const valor = jugador[claveMet];
      const val = (typeof valor === 'number' && isFinite(valor)) ? valor : null;
      const tipo = (liga.jugadorTipo && liga.jugadorTipo[claveMet] !== undefined) ? liga.jugadorTipo[claveMet] : null;
      const dist = liga.distribucionesJ[claveMet] || [];
      return {
        clave: claveMet, label: m.label, valor: val,
        formateado: formatear(claveMet, val),
        tipo: tipo, tipoFormateado: formatear(claveMet, tipo),
        delta: (val !== null && tipo !== null) ? val - tipo : null,
        // Sin minutos suficientes no hay percentil: sería mentir.
        percentil: jugador.__califica ? percentil(dist, val, m.invertida) : null,
        califica: !!jugador.__califica,
        invertida: m.invertida, n: dist.length,
      };
    }

    /** Devuelve una vista completa lista para pintar una tarjeta o tabla. */
    function leerVista(claveEq, idVista) {
      const v = VISTAS[idVista];
      if (!v) return null;
      const filas = v.metricas.map(k => leer(claveEq, k, idVista)).filter(Boolean);
      const out = {
        id: idVista, label: v.label, descriptiva: !!v.descriptiva,
        nota: v.nota || null, filas: filas,
      };
      if (v.sumaCien) {
        const suma = filas.reduce((s, f) => s + (f.valor || 0), 0);
        out.suma = suma;
        out.sumaOk = Math.abs(suma - 1) < 0.005;   // tolerancia de redondeo
      }
      return out;
    }

    return {
      fase, equipos, liga, avisos,
      lista: () => Array.from(equipos.values()),
      get: (k) => equipos.get(claveEquipo(k)) || null,
      leer, leerVista, leerJugador, ranking, percentil,
    };
  }

  /* ---------------------------------------------------------------------
     CARGA desde GViz. Una request por hoja, cache por categoría.
     Solo browser; en Node se testea pasando las hojas ya parseadas.
     --------------------------------------------------------------------- */

  const _cache = new Map();   // sheetId -> Promise<hojas>

  function urlGviz(sheetId, hoja) {
    return 'https://docs.google.com/spreadsheets/d/' + sheetId +
           '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(hoja);
  }

  function parsearGviz(txt) {
    // La respuesta viene envuelta: google.visualization.Query.setResponse({...});
    const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
    if (i === -1 || j === -1) throw new Error('Respuesta GViz ilegible');
    const json = JSON.parse(txt.slice(i, j + 1));
    if (json.status === 'error') {
      throw new Error((json.errors || []).map(e => e.detailed_message || e.message).join('; '));
    }
    const cols = (json.table.cols || []).map((c, k) => texto(c.label) || texto(c.id) || ('COL' + k));
    const filas = (json.table.rows || []).map(r => {
      const o = {};
      cols.forEach((c, k) => {
        const celda = r.c && r.c[k];
        // `v` es el valor tipado: para celdas con formato % ya viene como fracción.
        o[c] = celda ? (celda.v !== null && celda.v !== undefined ? celda.v : texto(celda.f)) : '';
      });
      return o;
    }).filter(f => Object.keys(f).some(k => texto(f[k]) !== ''));
    return { cols, filas };
  }

  /**
   * Baja todas las hojas del ESQUEMA para una planilla.
   * Nunca baja las 9 categorías: solo la que se está mirando.
   */
  function cargarCategoria(sheetId, opciones) {
    const opt = opciones || {};
    if (!sheetId) return Promise.reject(new Error('Falta el sheetId'));
    if (_cache.has(sheetId) && !opt.forzar) return _cache.get(sheetId);

    const nombres = opt.hojas || Object.keys(ESQUEMA);
    const tarea = Promise.all(nombres.map(nombre =>
      fetch(urlGviz(sheetId, nombre))
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(t => ({ nombre, hoja: parsearGviz(t) }))
        .catch(e => ({ nombre, error: e.message || String(e) }))
    )).then(res => {
      const hojas = {}, errores = [];
      res.forEach(r => {
        if (r.error) errores.push({ nivel: 'error', hoja: r.nombre, mensaje: 'No se pudo leer: ' + r.error });
        else hojas[r.nombre] = r.hoja;
      });
      return { hojas, errores };
    });

    _cache.set(sheetId, tarea);
    return tarea;
  }

  function limpiarCache(sheetId) {
    if (sheetId) _cache.delete(sheetId); else _cache.clear();
  }

  /* =====================================================================
     5. VALIDADOR
     ===================================================================== */

  function validarEsquema(hojas) {
    const problemas = [];
    Object.keys(ESQUEMA).forEach(nombre => {
      const def = ESQUEMA[nombre];
      const h = hojas[nombre];
      if (!h) {
        problemas.push({ nivel: 'error', hoja: nombre, mensaje: 'La hoja no existe o no se pudo leer.' });
        return;
      }
      const presentes = h.cols.map(c => texto(c));
      const falta = c => presentes.indexOf(c) === -1;

      const reqFaltan = def.req.filter(falta);
      if (reqFaltan.length) {
        problemas.push({
          nivel: 'error', hoja: nombre,
          mensaje: 'Faltan ' + reqFaltan.length + ' columnas obligatorias: ' + reqFaltan.join(', '),
          columnas: reqFaltan,
        });
      }
      const optFaltan = (def.opt || []).filter(falta);
      if (optFaltan.length) {
        problemas.push({
          nivel: 'aviso', hoja: nombre,
          mensaje: 'Faltan columnas opcionales (se degrada la vista): ' + optFaltan.join(', '),
          columnas: optFaltan,
        });
      }
      if (def.filaTipo) {
        const tiene = h.filas.some(f => esFilaTipo(f, def.filaTipo));
        if (!tiene) {
          problemas.push({
            nivel: 'aviso', hoja: nombre,
            mensaje: 'No se encontró la fila ' + def.filaTipo + '. Sin ella no hay línea base de la liga.',
          });
        }
      }
      if (!h.filas.length) {
        problemas.push({ nivel: 'error', hoja: nombre, mensaje: 'La hoja no tiene filas de datos.' });
      }
    });
    return problemas;
  }

  /* ---------------------------------------------------------------------
     Coherencia entre hojas. Cada hoja de promedios tiene su gemela de
     acumulado y tiene que traer LAS MISMAS filas. Si difieren, una de las
     dos tiene filas de más (totales por equipo, jugadores sin minutos,
     restos de una carga vieja) y el índice va a contar mal.
     --------------------------------------------------------------------- */
  const PARES_HOJAS = [
    ['PROMEDIOS E', 'ACUMULADO E'],
    ['PROMEDIOS 4F', 'ACUMULADO 4F'],
    ['PROMEDIOS J', 'ACUMULADO J'],
    ['Base Datos E', '4 FACTORES'],
  ];

  function validarCoherencia(hojas) {
    const out = [];

    /* Cuenta filas de datos: descarta las TIPO (de liga y de equipo). */
    function filasDatos(nombre, h) {
      const idTipo = ESQUEMA[nombre] && ESQUEMA[nombre].filaTipo;
      if (!idTipo) return h.filas.length;
      return h.filas.filter(f => !esFilaTipo(f, idTipo)).length;
    }

    PARES_HOJAS.forEach(([a, b]) => {
      const ha = hojas[a], hb = hojas[b];
      if (!ha || !hb) return;
      const na = filasDatos(a, ha), nb = filasDatos(b, hb);
      const dif = na - nb;
      out.push({
        nivel: dif === 0 ? 'ok' : 'error',
        par: a + ' / ' + b,
        a: na, b: nb, dif: dif,
        mensaje: dif === 0
          ? na + ' filas de datos en las dos (sin contar filas TIPO).'
          : a + ' tiene ' + Math.abs(dif) + ' fila(s) ' + (dif > 0 ? 'de más' : 'de menos') + '. Revisar cuáles.',
      });
    });

    /* Cada PARTIDO tiene que aparecer exactamente 2 veces: una fila por
       equipo. Uno solo = partido cargado a medias. */
    ['Base Datos E', '4 FACTORES'].forEach(nombre => {
      const h = hojas[nombre];
      if (!h) return;
      const cuenta = new Map();
      h.filas.forEach(f => {
        const k = texto(f['PARTIDO']);
        if (k) cuenta.set(k, (cuenta.get(k) || 0) + 1);
      });
      const huerfanos = [];
      cuenta.forEach((n, k) => { if (n !== 2) huerfanos.push(k + ' (' + n + ')'); });
      out.push({
        nivel: huerfanos.length ? 'error' : 'ok',
        par: nombre + ' · partidos completos',
        a: cuenta.size, b: h.filas.length, dif: 0,
        mensaje: huerfanos.length
          ? huerfanos.length + ' partido(s) sin las dos filas: ' + huerfanos.slice(0, 3).join(', ')
          : cuenta.size + ' partidos, todos con sus dos equipos.',
      });
    });

    return out;
  }

  /**
   * Test de simetría de liga. En una liga cerrada, lo que un equipo hace es
   * lo que otro sufre: el promedio de cada métrica propia tiene que coincidir
   * con el de su versión Opp. Si no cierra, hay partidos mal cargados.
   * Se corre sobre PROMEDIOS 4F, donde ambos lados usan la MISMA agregación.
   */
  /* ---------------------------------------------------------------------
     Invariantes exactos sobre ACUMULADO E.

     El test de simetría sobre PROMEDIOS 4F compara promedios, y esos solo
     coinciden si todos los equipos jugaron la misma cantidad de partidos.
     En una categoría arrancada, con equipos en 1 y otros en 2 partidos, la
     diferencia crece sin que haya ningún error de carga.

     Sobre TOTALES no hay tolerancia que valga: lo que un equipo suma, otro
     lo sufre. Si no da idéntico, hay un partido mal cargado. Punto.
     --------------------------------------------------------------------- */
  /*
     El par correcto es X ↔ Xopp, siempre.

     La columna `RDopp` de la fila de un equipo es, literalmente, el RD del
     rival en ese partido. Sumando sobre toda la liga, cada RD aparece una vez
     como propio y una vez como ajeno: Σ RD = Σ RDopp.

     Yo los había cruzado (RD ↔ ROopp) razonando sobre oportunidades de
     rebote. Eso es una relación conceptual, no una identidad contable.
  */
  const INVARIANTES_TOTALES = [
    ['PTS', 'PTSopp'],
    ['RD', 'RDopp'],
    ['RO', 'ROopp'],
    ['PP', 'PPopp'],
    ['PLAYS', 'PLAYSopp'],
  ];

  /*
     Chequeo partido por partido, más fino que el agregado: dos errores que se
     compensan entre sí pasan el test de totales pero no éste.
     En cada PARTIDO hay dos filas y tiene que cumplirse, cruzado:
        fila A · PTS  ===  fila B · PTSopp
  */
  const CRUCES_PARTIDO = ['PTS', 'RD', 'RO', 'PP', 'PLAYS'];

  function testCrucePartidos(hojas, fase) {
    const h = hojas['Base Datos E'];
    if (!h) return [{ nivel: 'aviso', par: '—', mensaje: 'Sin Base Datos E no se puede cruzar partido por partido.' }];
    const f = (fase || 'REGULAR').toUpperCase();

    const porPartido = new Map();
    h.filas.forEach(r => {
      if (texto(r['FASE']) && texto(r['FASE']).toUpperCase() !== f) return;
      const k = texto(r['PARTIDO']);
      if (!k) return;
      if (!porPartido.has(k)) porPartido.set(k, []);
      porPartido.get(k).push(r);
    });

    return CRUCES_PARTIDO.map(col => {
      const fallos = [];
      let revisados = 0;
      porPartido.forEach((filas, k) => {
        if (filas.length !== 2) return;
        revisados++;
        const [a, b] = filas;
        const av = num(a[col]), bo = num(b[col + 'opp']);
        const bv = num(b[col]), ao = num(a[col + 'opp']);
        if (av !== null && bo !== null && Math.abs(av - bo) > 0.5) fallos.push(k);
        else if (bv !== null && ao !== null && Math.abs(bv - ao) > 0.5) fallos.push(k);
      });
      return {
        nivel: fallos.length ? 'error' : 'ok',
        par: col + ' ↔ ' + col + 'opp',
        propio: revisados, rival: fallos.length,
        mensaje: fallos.length
          ? fallos.length + ' partido(s) no cruzan: ' + fallos.slice(0, 2).join(' · ')
          : revisados + ' partidos cruzados, todos coinciden.',
      };
    });
  }

  function testTotales(hojas, fase) {
    const h = hojas['ACUMULADO E'];
    if (!h) return [{ nivel: 'aviso', par: '—', mensaje: 'Sin ACUMULADO E no se puede correr el test exacto.' }];
    const f = (fase || 'REGULAR').toUpperCase();
    const filas = h.filas.filter(r =>
      !esFilaTipo(r, 'EQUIPO TIPO') && texto(r['EQUIPO']) !== '' &&
      (!texto(r['FASE']) || texto(r['FASE']).toUpperCase() === f));

    return INVARIANTES_TOTALES.map(([a, b]) => {
      const sa = filas.reduce((s2, r) => s2 + (num(r[a]) || 0), 0);
      const sb = filas.reduce((s2, r) => s2 + (num(r[b]) || 0), 0);
      const dif = sa - sb;
      // 0,5 cubre redondeos de la planilla; un error de carga es de enteros.
      const ok = Math.abs(dif) < 0.5;
      return {
        nivel: ok ? 'ok' : 'error',
        par: 'Σ ' + a + ' = Σ ' + b,
        propio: sa, rival: sb, dif: dif, tolerancia: 0,
        mensaje: ok ? 'Idéntico.' : 'Difieren en ' + dif.toFixed(1) + '. Hay un partido mal cargado.',
      };
    });
  }

  const PARES_SIMETRIA = [
    ['PTS', 'PTSopp', 0.8],
    ['eFG%', 'eFG Opp%', 0.010],
    ['PP%', 'PP Opp%', 0.010],
    ['RTL%', 'RTL Opp%', 0.010],
    ['RO%', 'RO Opp%', 0.010],
    ['RTNG OFF', 'RTNG DEF', 1.5],
  ];

  function testSimetria(hojas, fase) {
    const h = hojas['PROMEDIOS 4F'];
    if (!h) return [{ nivel: 'error', mensaje: 'Sin PROMEDIOS 4F no se puede correr el test de simetría.' }];
    const f = (fase || 'REGULAR').toUpperCase();
    const filas = h.filas.filter(r =>
      texto(r['EQUIPO']).toUpperCase() !== 'EQUIPO TIPO' &&
      texto(r['EQUIPO']) !== '' &&
      (!texto(r['FASE']) || texto(r['FASE']).toUpperCase() === f));

    return PARES_SIMETRIA.map(([a, b, tol]) => {
      const ma = promedio(filas.map(r => num(r[a])));
      const mb = promedio(filas.map(r => num(r[b])));
      if (ma === null || mb === null) {
        return { nivel: 'aviso', par: a + ' / ' + b, mensaje: 'Columnas incompletas, no se pudo verificar.' };
      }
      const dif = ma - mb;
      return {
        nivel: Math.abs(dif) <= tol ? 'ok' : 'error',
        par: a + ' / ' + b,
        propio: ma, rival: mb, dif: dif, tolerancia: tol,
        mensaje: Math.abs(dif) <= tol
          ? 'Cierra.'
          : 'No cierra por ' + dif.toFixed(3) + ' (tolerancia ' + tol + '). Revisar carga de partidos.',
      };
    });
  }

  /* =====================================================================
     EXPORT
     ===================================================================== */

  const SGADD = {
    // utilidades
    num, texto, claveEquipo, clavePersona, mediana, promedio, percentil,
    // 1
    ESQUEMA, HOJAS_EXCLUIDAS,
    // 2
    METRICAS, METRICAS_LISTA, VISTAS, GRUPOS_DESCRIPTIVOS, metrica, vista, formatear,
    // 3
    CATALOGO, FASES, planilla, planillasVisibles, esEquipoPropio, agrupar, fasesDisponibles, Ruta,
    // 4
    normalizarHoja, construirIndice, esFilaTipo, tipoDeLiga, cargarCategoria, limpiarCache, parsearGviz, urlGviz,
    // 5
    validarEsquema, validarCoherencia, testSimetria, testTotales, testCrucePartidos,
    PARES_SIMETRIA, PARES_HOJAS, INVARIANTES_TOTALES, CRUCES_PARTIDO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SGADD;
  else raiz.SGADD = SGADD;

})(typeof globalThis !== 'undefined' ? globalThis : this);
