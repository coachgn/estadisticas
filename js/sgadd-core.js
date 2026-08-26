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

  /**
   * GViz devuelve las celdas de fecha como el string "Date(2026,4,5)".
   * OJO: el mes viene 0-indexado, como en el constructor de JS. Ese
   * "Date(2026,4,5)" es el 5 de MAYO, no el 5 de abril.
   *
   * Yo venía diciendo que no se podía ordenar cronológicamente porque la
   * FECHA era "5/5" sin año. Falso: la columna SÍ está tipada como fecha,
   * mi parser la trataba como texto y la escupía cruda en pantalla.
   */
  function fecha(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s) return null;
    let m = /^Date\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (m) return new Date(+m[1], +m[2], +m[3]);          // mes 0-indexado
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);      // ISO

    /* dd/mm/aaaa: formato argentino. Se asume DIA primero, no mes.
       Aparece asi en las planillas de Liga Argentina. */
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

    return null;                                          // "5/5" sin año: no confiable
  }

  function formatearFecha(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
    const p2 = n => String(n).padStart(2, '0');
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1);
  }

  function texto(v) {
    return (v === null || v === undefined) ? '' : String(v).trim();
  }

  /** Normaliza nombres de equipo: "ATENAS 'A' - MM" → "ATENAS A" */
  /*
     Los equipos traen sufijo de categoría y cambia entre planillas:
       "RECONQUISTA 'A' - MM"     (Primera)
       "RECONQUISTA 'A' - U21M"   (U21 masculino)
     Sin sacarlo, el mismo club es dos entidades distintas y el logo no
     matchea: `reconquista-a-u21m.png` no existe.
  */
  const SUFIJO_CATEGORIA = /\s*-\s*(MM|MF|U\d{1,2}\s*[MF]?)\s*$/i;

  function limpiarNombre(v) {
    return texto(v).replace(SUFIJO_CATEGORIA, '').trim();
  }

  function claveEquipo(v) {
    return limpiarNombre(v)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
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

  /* ---------------------------------------------------------------------
     ID CANÓNICO DE PARTIDO

     La columna PARTIDO es el string "LOCAL vs VISITANTE". En una liga con
     ida y vuelta ese string se repite si alguna vez se carga al revés, y
     dos partidos distintos colapsarían en uno. Con la FECHA adelante queda
     a prueba de eso.

     Formato: 2025-10-31_jujuy-basquet-vs-san-isidro
     --------------------------------------------------------------------- */
  function idPartido(nombrePartido, valorFecha) {
    const f = fecha(valorFecha);
    const iso = f
      ? f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0')
      : 'sf';
    const slug = texto(nombrePartido)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    return iso + '_' + slug;
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
     `req`   = si falta, la hoja no sirve → error
     `opt`   = si falta, se degrada la UI → warning
     `motor` = las agrega MotorStats y este panel todavía no las usa. Si
               faltan NO pasa nada y NO se avisa: ponerlas en `opt` llenaba
               el Diagnóstico de 9 avisos por columnas que no degradan nada
               (probado con la planilla real de Reconquista). Están
               declaradas para dejar escrito el contrato con el productor.
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

  /* ---------------------------------------------------------------------
     COLUMNAS QUE AGREGA EL MOTOR (MotorStats v30/v43/v44)

     SGADD es el CONSUMIDOR de las planillas que escribe MotorStats. El motor
     fue agregando columnas de trazabilidad que este panel todavía no usa:

       `+/-`        v30 · sólo en las 3 hojas de jugador
       `ID_ARCHIVO` v43 · clave primaria del motor, en las 3 maestras
       `TORNEO`     v44 · competencia; en las 6 agregadas va junto a FASE,
                    en las maestras al final para no desplazar datos ya cargados

     Van como OPCIONALES a propósito: las planillas de Reconquista todavía no
     las traen (verificado: esquema pre-v43), así que exigirlas rompería hoy.
     Declararlas evita que el validador las reporte como desconocidas cuando
     el club migre, y deja escrito el contrato con el productor.
     --------------------------------------------------------------------- */
  const COLS_MOTOR = ['TORNEO', 'ID_ARCHIVO', '+/-'];

  const ESQUEMA = {
    'PROMEDIOS E': {
      rol: 'equipo-temporada', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_BOX.filter(c => c !== 'USG%')),
      opt: ['POS', 'PACE'],
      motor: COLS_MOTOR,
    },
    'ACUMULADO E': {
      rol: 'equipo-temporada-total', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_CRUDAS),
      opt: ['POS', 'PACE'],
      motor: COLS_MOTOR,
    },
    'Base Datos E': {
      rol: 'equipo-partido', grano: 'equipo', filaTipo: null,
      clave: ['PARTIDO', 'EQUIPO'],
      req: ['FECHA', 'PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO'].concat(COLS_BOX.filter(c => c !== 'USG%')),
      opt: ['POS', 'PACE'],
      motor: COLS_MOTOR,
    },
    'PROMEDIOS 4F': {
      rol: 'factores-temporada', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      req: ['EQUIPO', 'FASE', 'PJ'].concat(COLS_4F),
      opt: [],
      motor: COLS_MOTOR,
    },
    'ACUMULADO 4F': {
      rol: 'factores-temporada-total', grano: 'equipo', filaTipo: 'EQUIPO TIPO',
      clave: ['EQUIPO', 'FASE'],
      // OJO: esta hoja NO trae los 4 factores, solo ratings.
      req: ['EQUIPO', 'FASE', 'PJ', 'PTS', 'PTSopp', 'RTNG OFF', 'RTNG DEF', 'NET RTNG', 'PPP OF', 'PPP DEF', 'NET PPP'],
      opt: [],
      motor: COLS_MOTOR,
    },
    '4 FACTORES': {
      rol: 'factores-partido', grano: 'equipo', filaTipo: null,
      clave: ['PARTIDO', 'EQUIPO'],
      req: ['PARTIDO', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO'].concat(COLS_4F),
      opt: ['FECHA'],   // FECHA viene vacía en la planilla actual → se joinea por PARTIDO
      motor: COLS_MOTOR,
    },
    'PROMEDIOS J': {
      rol: 'jugador-temporada', grano: 'jugador', filaTipo: 'JUGADOR TIPO',
      clave: ['NOMBRES', 'EQUIPO', 'FASE'],
      req: ['NOMBRES', 'EQUIPO', 'FASE', 'PJ', 'USG%'].concat(COLS_BOX),
      opt: [],
      motor: COLS_MOTOR,
    },
    'ACUMULADO J': {
      rol: 'jugador-temporada-total', grano: 'jugador', filaTipo: 'JUGADOR TIPO',
      clave: ['NOMBRES', 'EQUIPO', 'FASE'],
      req: ['NOMBRES', 'EQUIPO', 'FASE', 'PJ'].concat(COLS_CRUDAS),
      opt: [],
      motor: COLS_MOTOR,
    },
    'Base Datos J': {
      rol: 'jugador-partido', grano: 'jugador', filaTipo: null,
      clave: ['PARTIDO', 'NOMBRES'],
      req: ['FECHA', 'PARTIDO', 'NOMBRES', 'EQUIPO', 'FASE', 'CONDICION', 'RESULTADO', 'USG%'].concat(COLS_BOX),
      opt: [],
      motor: COLS_MOTOR,
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
     TORNEO — la competencia, por encima de la fase

     Desde MotorStats v44 las planillas traen la columna `TORNEO`, y desde
     v47 `FASE` guarda la fase LIMPIA ("REGULAR"). Lo que distingue un
     tramo de otro es el par TORNEO + FASE: dos "REGULAR" de torneos
     distintos son competencias distintas y no se pueden mezclar.

     Las planillas pre-v44 no traen la columna. Para esas, TODO el libro es
     una sola competencia y se la llama `GENERAL`. No es un valor que
     aparezca en ningún dato: es la etiqueta del caso "sin torneo", y
     existe para que el resto del código no tenga que preguntar dos veces.
     ===================================================================== */
  const TORNEO_GENERAL = 'GENERAL';

  /** El torneo de una fila, o GENERAL si la planilla no trae la columna. */
  function torneoDeFila(fila) {
    const t = texto(fila && fila['TORNEO']).toUpperCase();
    return t || TORNEO_GENERAL;
  }

  /**
   * Torneos presentes en el libro. Con una planilla pre-v44 devuelve un
   * único `GENERAL`, así que la UI puede tratar los dos casos igual y
   * simplemente no mostrar el selector cuando hay uno solo.
   */
  /* =====================================================================
     LA TASA SIN DENOMINADOR NO ES CERO, ES QUE NO PASÓ

     `Base Datos J` escribe **0** donde debería ir blanco: el motor blanquea
     recién en la etapa de PROMEDIOS, no en el registro crudo por partido.
     Es un hueco conocido y abierto del lado de MotorStats (su punto 6.2),
     así que el panel lo corrige al indexar.

     Medido en Primera · Vuelta 2026 el 2026-08-24: **247 de 1965 filas**
     (12,6%) traen `MIN = 0` con eFG%, TS%, T2%, T3%, T1%, PPP, USG% y RTL%
     todos en 0 duro. Entran a `liga.jugadorPartidos`, o sea a la media y al
     desvío de `statJugador()`, a la banda del tab Evolución y al split de
     local/visitante. Peor caso: CARLOTTO, MARCO, 5 noches de las cuales 4
     en cero → su eFG% medio daba **0,30** contra **1,50** real.

     Y eso infla el desvío, así que además **fabrica atípicos**: contra una
     media hundida por noches que no existieron, cualquier partido normal
     supera el z de 1,5 y se pinta como rendimiento excepcional.

     El criterio NO es "filtrar por MIN > 0", que es lo que pide el
     documento del motor: se blanquea la tasa **cuando su propio
     denominador es 0**. Es estrictamente mejor y caza además al que sí
     jugó y no lanzó de tres — hoy ese T3% de 0 se lee como "tiró y erró"
     cuando no tiró nunca. Es la misma distinción que el proyecto ya aplica
     en el C/I del log (punto 8) y en el perfil de tiro (punto 4 bis).

     Las CUENTAS no se tocan: PTS, T3C, RD, AST en 0 son datos reales de
     una noche sin minutos. Lo que no es un dato es el porcentaje.
     ===================================================================== */

  /* tasa -> las columnas que forman su denominador. Basta que UNA tenga
     valor para que la tasa sea legítima: TS% mezcla tiros de campo con
     libres, así que con solo libres lanzados sigue estando definida. */
  const DENOMINADOR_TASA = {
    'eFG%':  ['TCI'],
    'TS%':   ['TCI', 'T1I'],
    'TC%':   ['TCI'],
    'RTL%':  ['TCI'],
    'T2%':   ['T2I'],
    'PPT2':  ['T2I'],
    'T3%':   ['T3I'],
    'PPT3':  ['T3I'],
    'T1%':   ['T1I'],
    'PPT1':  ['T1I'],
    'PPP':   ['PLAYS'],
    'PePP%': ['PLAYS'],
    'PT2%':  ['PLAYS'],
    'PT3%':  ['PLAYS'],
    'PT1%':  ['PLAYS'],
    'USG%':  ['PLAYS'],
  };

  /**
   * Blanquea las tasas sin denominador de UNA fila jugador-partido.
   *
   * Muta y devuelve la misma fila: se la llama una vez por fila al indexar
   * y clonar 1965 objetos por libro no aporta nada.
   *
   * `AST-PP` queda AFUERA a propósito: su denominador son las pérdidas, y
   * el motor tiene su propia convención para el caso sin pérdidas (devuelve
   * las asistencias, no una división por cero). Pisarlo acá contradiría a
   * la hoja que el club audita.
   */
  function blanquearTasasSinDenominador(f) {
    Object.keys(DENOMINADOR_TASA).forEach(tasa => {
      if (typeof f[tasa] !== 'number') return;
      const cols = DENOMINADOR_TASA[tasa];
      /* Si la planilla no trae NINGUNA columna del denominador no se puede
         saber, y no saber no habilita a borrar un dato: se deja como está. */
      let hayColumna = false, hayVolumen = false;
      cols.forEach(c => {
        if (!(c in f)) return;
        hayColumna = true;
        if (num(f[c])) hayVolumen = true;
      });
      if (hayColumna && !hayVolumen) f[tasa] = null;
    });
    return f;
  }
  /* Las cuatro hojas que definen si un torneo se puede ver entero: dos
     derivadas de equipo, una de jugador y la maestra de partidos. Si una
     de ellas no trae ese torneo, esa parte del panel queda vacía. */
  const HOJAS_TORNEO = ['PROMEDIOS E', 'PROMEDIOS 4F', 'Base Datos E', 'PROMEDIOS J'];

  function torneosDisponibles(hojas) {
    const vistos = new Set();
    let hayColumna = false;
    HOJAS_TORNEO.forEach(n => {
      const h = hojas[n];
      if (!h) return;
      if (h.cols.indexOf('TORNEO') === -1) return;
      hayColumna = true;
      const idTipo = ESQUEMA[n] ? ESQUEMA[n].filaTipo : null;
      h.filas.forEach(f => {
        if (esFilaTipo(f, idTipo)) return;   // la fila TIPO de liga va sin torneo
        const v = texto(f['TORNEO']).toUpperCase();
        if (v) vistos.add(v);
      });
    });
    if (!hayColumna || !vistos.size) return [{ id: TORNEO_GENERAL, label: 'Todos', unico: true }];

    /* En qué hojas aparece cada torneo, que no siempre son todas.

       Medido en el libro U23 de Reconquista (2026-08-24): `PROMEDIOS E`
       trae 13 filas de APERTURA y `Base Datos E` trae 134 de IDA y 30 de
       VUELTA. La intersección es VACÍA: la maestra y la derivada del
       mismo libro quedaron etiquetadas con torneos distintos. Elegir
       APERTURA —el primero del abecedario— daba una vista con 12 equipos
       y CERO partidos, sin box scores, sin cronología y sin decir por qué.

       Es un problema del DATO y hay que arreglarlo en el motor. Acá se
       mide la cobertura de cada torneo para poder abrir el libro por el
       recorte que más muestra, y el Diagnóstico lo denuncia con nombre y
       apellido (`validarTorneo`). */
    const cobertura = {};
    const conPartidos = new Set();
    HOJAS_TORNEO.forEach(n => {
      const h = hojas[n];
      if (!h || h.cols.indexOf('TORNEO') === -1) return;
      const idTipo = ESQUEMA[n] ? ESQUEMA[n].filaTipo : null;
      const enEsta = new Set();
      h.filas.forEach(f => {
        if (esFilaTipo(f, idTipo)) return;
        const v = texto(f['TORNEO']).toUpperCase();
        if (v) enEsta.add(v);
      });
      enEsta.forEach(v => {
        cobertura[v] = (cobertura[v] || 0) + 1;
        if (n === 'Base Datos E') conPartidos.add(v);
      });
    });

    /* El ORDEN es alfabético a propósito: el selector es una lista, no un
       ranking, y reordenarlo por disponibilidad movería de lugar los
       torneos sanos de un libro bien cargado. Quien elige el defecto mira
       `cobertura`. */
    return Array.from(vistos).sort().map(id => ({
      id: id, label: id.charAt(0) + id.slice(1).toLowerCase(), unico: false,
      cobertura: cobertura[id] || 0,
      /* Sin la columna en `Base Datos E` no se sabe, y no saber no es un
         'no': se lo deja pasar como candidato. */
      conPartidos: conPartidos.size ? conPartidos.has(id) : true,
    }));
  }

  /* =====================================================================
     LO QUE EL DT ELIGE ES UN TRAMO DE COMPETENCIA, NO DOS COSAS

     La convención del motor es la carpeta de Nivel 6: `"IDA - REGULAR"`,
     o sea **TORNEO - FASE**. Partirlo en dos desplegables obligaba al DT a
     armar mentalmente el par, y peor: dejaba elegir combinaciones que no
     existen en el libro (Apertura + una fase que solo tuvo el Clausura),
     que devuelven una vista vacía sin decir por qué.

     Acá se enumeran los pares que EXISTEN en los datos. El estado global
     sigue guardando `torneo` y `fase` por separado —y la RUTA también, así
     que los links compartidos siguen funcionando—: lo único que cambia es
     que se eligen juntos.
     ===================================================================== */

  /** Los pares TORNEO+FASE presentes en el libro, en orden de lectura. */
  function combinacionesTorneoFase(hojas) {
    const vistas = new Map();
    HOJAS_TORNEO.forEach(n => {
      const h = hojas[n];
      if (!h || !h.filas) return;
      const idTipo = ESQUEMA[n] ? ESQUEMA[n].filaTipo : null;
      h.filas.forEach(f => {
        /* La fila TIPO no define un tramo: viene con FASE = TOTAL y sin
           torneo en libros donde el agregado no existe como competencia. */
        if (esFilaTipo(f, idTipo)) return;
        const fase = texto(f['FASE']).toUpperCase();
        if (!fase) return;
        const torneo = torneoDeFila(f);
        const id = torneo + '|' + fase;
        if (!vistas.has(id)) {
          vistas.set(id, { id: id, torneo: torneo, fase: fase, hojas: new Set() });
        }
        vistas.get(id).hojas.add(n);
      });
    });
    if (!vistas.size) {
      return [{ id: TORNEO_GENERAL + '|REGULAR', torneo: TORNEO_GENERAL, fase: 'REGULAR',
        label: 'Fase regular', cobertura: 0, conPartidos: false, conPromedios: false }];
    }

    /* "IDA" -> "Ida", y tambien "regular" -> "Regular": el label de la
       fase viene en minuscula despues de sacarle el "Fase " de adelante. */
    const bonito = (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    const orden = (fase) => (FASES[fase] ? FASES[fase].orden : 5);

    return Array.from(vistas.values()).map(c => {
      const f = FASES[c.fase];
      return {
        id: c.id, torneo: c.torneo, fase: c.fase,
        /* Sin torneo real se muestra solo la fase: en una planilla pre-v44
           un "General - Regular" sería ruido sobre un dato que no existe. */
        label: c.torneo === TORNEO_GENERAL
          ? (f ? f.label : bonito(c.fase))
          : bonito(c.torneo) + ' - ' + bonito(f ? f.label.replace(/^Fase /, '') : c.fase),
        agregado: !!(f && f.agregado),
        cobertura: c.hojas.size,
        conPartidos: c.hojas.has('Base Datos E'),
        conPromedios: c.hojas.has('PROMEDIOS E'),
        _orden: orden(c.fase),
      };
    }).sort((a, b) => (a._orden - b._orden) || a.torneo.localeCompare(b.torneo));
  }

  /**
   * El tramo con el que conviene abrir un libro: el de mayor cobertura.
   *
   * Mismo criterio que `torneoPorDefecto` y por el mismo motivo: en un
   * libro sano todos los tramos cubren todo y gana el primero —o sea lo de
   * siempre— y en uno roto gana el que más muestra, en vez de abrir por el
   * único recorte mudo.
   */
  function tramoPorDefecto(lista) {
    const l = (lista || []).filter(c => !c.agregado);
    if (!l.length) return (lista && lista[0]) || null;
    let mejor = l[0];
    l.forEach(c => { if (c.cobertura > mejor.cobertura) mejor = c; });
    return mejor;
  }
  /**
   * El torneo con el que conviene abrir un libro.
   *
   * NO es "el que tenga partidos": se probó y en el libro U23 real eso
   * cambiaba 252 jugadores / 0 partidos por 67 partidos / 0 jugadores.
   * Cambiar un agujero por otro no es arreglarlo, y encima elige por el DT
   * sin decírselo.
   *
   * El criterio es la COBERTURA: en cuántas de las hojas clave aparece ese
   * torneo. En un libro sano todos cubren todo y gana el primero, o sea
   * exactamente lo de antes. En uno roto gana el recorte que muestra más,
   * y si empatan queda el alfabético — que es lo mismo que hacía la app
   * hasta ahora, así que nadie ve cambiar su categoría de un día para el
   * otro. El Diagnóstico es el que denuncia que el libro está mal.
   */
  function torneoPorDefecto(lista) {
    const l = lista || [];
    if (!l.length) return TORNEO_GENERAL;
    let mejor = l[0], mejorCob = (l[0].cobertura || 0);
    l.forEach(t => {
      if ((t.cobertura || 0) > mejorCob) { mejor = t; mejorCob = (t.cobertura || 0); }
    });
    return mejor.id;
  }

  /* =====================================================================
     2. METRICAS — el registro único de verdad
     `hoja`      : quién manda. Si la métrica está en dos hojas, gana esta.
     `invertida` : true = menos es mejor.
     `formato`   : pct | num2 | num1 | int | ratio
     ===================================================================== */

  const M = (clave, label, hoja, formato, invertida, grupo, glosario) =>
    ({ clave, label, hoja, formato, invertida: !!invertida, grupo, glosario });

  const P4F = 'PROMEDIOS 4F', PE = 'PROMEDIOS E', CALC = 'CALCULADO';

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
    /* Calculados sobre los totales de la temporada, joineando Base Datos E
       por PARTIDO: la fila del rival ES su box score. Así el eFG% propio y el
       permitido usan EXACTAMENTE el mismo método y son comparables entre sí.
       PROMEDIOS 4F trae estas mismas métricas pero promediando los ratios de
       cada partido, que no es comparable con el lado ofensivo. */
    M('eFG Opp%', 'eFG% permitido', CALC, 'pct', true, 'factores-def', '(TCC + 0,5 × T3C) del rival / TCI del rival.'),
    M('PP Opp%', 'Pérdidas forzadas', CALC, 'pct', false, 'factores-def', 'PP del rival / PLAYS del rival. Más es mejor.'),
    M('RTL Opp%', 'Libres concedidos', CALC, 'pct', true, 'factores-def', 'T1C del rival / TCI del rival.'),
    M('RO Opp%', 'Rebote ofensivo rival', CALC, 'pct', true, 'factores-def', 'RO del rival / (RO del rival + RD propio).'),

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

    /* [MotorStats v30/v33] Sólo en las 3 hojas de jugador, y sólo si la
       planilla ya migró: las de Reconquista todavía no la traen. Si falta,
       `leer`/`formatear` devuelven "—" y las tablas que la muestran quedan
       con una columna vacía: no rompe nada.

       OJO al leer un total de equipo: el `+/-` del equipo es el margen del
       partido (PTS − PTSopp), NUNCA la suma de los individuales. Con 5
       jugadores en cancha esa suma da 5x el margen (verificado por el motor
       en v31: ±95 en vez de ±19). Por eso el margen de equipo se calcula en
       `SGADD.masMenosEquipo()` y NUNCA se agrega una fila de totales a la
       columna `+/-` del box score. */
    M('+/-', 'Más/menos', 'PROMEDIOS J', 'signo', false, 'jugador',
      'Diferencia de puntos con el jugador en cancha. A nivel equipo es el margen del partido, no la suma de los individuales.'),
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
    /* `typeof === 'number'` y NO `!isFinite(valor)`.

       `isFinite('')` devuelve **true** —el string vacío se convierte a 0—,
       así que una celda vacía de una columna numérica pasaba la guarda y
       reventaba abajo con `valor.toFixed is not a function`. El índice
       guarda el texto crudo cuando `num()` no puede convertir, así que un
       `''` llega hasta acá.

       Lo destapó la migración de MotorStats del 2026-08-24: el libro de
       Primera pasó a traer la columna `+/-` (v30+) con celdas vacías en
       las filas de jugadores que no entraron. Antes la columna no existía
       y el valor era `undefined`, que sí caía en la guarda. Resultado: el
       tab **Partidos** de cualquier jugador con una noche sin `+/-`
       lanzaba y la sección quedaba sin pintar.

       La guarda por tipo cierra la clase entera: toda columna numérica que
       venga vacía se muestra ausente en vez de tumbar la vista. */
    if (typeof valor !== 'number' || !isFinite(valor)) return '—';
    const m = METRICAS[clave];
    const f = m ? m.formato : 'num2';
    switch (f) {
      case 'pct':  return (valor * 100).toFixed(1).replace('.', ',') + '%';
      case 'int':  return String(Math.round(valor));
      case 'num1': return valor.toFixed(1).replace('.', ',');
      case 'num2': return valor.toFixed(2).replace('.', ',');
      /* Signo explícito: un +/- sin el "+" adelante se lee como un total y
         pierde la mitad del sentido. Entero cuando el dato es entero (el
         de un partido siempre lo es) y con un decimal cuando es promedio;
         el 0 va pelado, sin signo. */
      case 'signo': {
        const r = Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
        return valor > 0 ? '+' + r : r;
      }
      default:     return String(valor);
    }
  }

  /* ---------------------------------------------------------------------
     `+/-` DE EQUIPO — es el margen del partido, NO la suma de los individuales

     Regla de negocio del motor, no un detalle de presentación: en cancha hay
     5 jugadores a la vez, así que sumar sus `+/-` da ~5x el margen real
     (verificado por MotorStats en v31: ±95 donde el partido se ganó por 19).
     Cualquier total de equipo tiene que salir de acá y nunca de un
     `reduce((a, j) => a + j['+/-'])` sobre el box score.
     --------------------------------------------------------------------- */
  function masMenosEquipo(ptsPropios, ptsRival) {
    const a = (typeof ptsPropios === 'number' && isFinite(ptsPropios)) ? ptsPropios : null;
    const b = (typeof ptsRival === 'number' && isFinite(ptsRival)) ? ptsRival : null;
    if (a === null || b === null) return null;
    return a - b;
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
      /* El ANDAMIO del SGADD, por tira y categoría. Completar sheetId y
         poner activo: true.
         tira: femenina | negra | naranja   ·   categoria: U15 | U17 | U21 | U23

         Esto es solo el RESPALDO: la verdad son las planillas del JSON del
         club (`clubes/<club>.json`), que además es donde viven los `id`
         reales — y el `id` no es cosmético, es la clave de los estados de
         jugador en localStorage y lo que viaja en los links compartidos. */
      ...['femenina', 'negra', 'naranja'].flatMap(tira =>
        ['U15', 'U17', 'U21', 'U23'].map(cat => ({
          id: tira + '-' + cat.toLowerCase() + '-clausura-2026',
          /* La U21 de Reconquista es de la tira NARANJA (confirmado por el
             club en 2026-08-17, cuando pasó de llamarse Negra a Naranja). */
          sheetId: (tira === 'naranja' && cat === 'U21') ? '1wNpSkdIOeoXTxaAQBH9UI3q1nR9J-4oek4MKO6m4TpE' : '',
          anio: 2026, torneo: 'TORNEO LOCAL', categoria: cat,
          faseTorneo: 'CLAUSURA',
          rama: tira === 'femenina' ? 'femenina' : 'masculina',
          tira: tira,
          modulo: 'sgadd',
          label: ({ femenina: 'Femenina', negra: 'Masculina Negra', naranja: 'Masculina Naranja' })[tira] + ' · ' + cat,
          activo: (tira === 'naranja' && cat === 'U21'),
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
     Ej: #/negra-u19-clausura-2026/REGULAR/equipos/atenas-a/4factores

     La sección Jugadores reusa exactamente este mismo esquema para SU
     propia navegación (seccion:'jugadores', entidad:<jugador>, tab:<tab>),
     igual que hace Equipos con un equipo. No hace falta un campo nuevo
     para eso.

     El campo `jugador` (7mo nivel) es aparte: sirve para un link cruzado
     PUNTUAL, por ejemplo desde el box score de un partido en Equipos hacia
     la ficha de ese jugador en Jugadores. Como `filter()` saca cualquier
     nivel vacío del medio (no solo al final), solo se puede confiar en
     `jugador` cuando TODOS los niveles anteriores también están completos
     — en la práctica, dentro del detalle de un partido, donde planilla,
     fase, seccion, entidad, tab y sub ya están siempre seteados. */
  /* Las secciones válidas viven acá y no solo en el index.html porque
     `Ruta.parse` las necesita para distinguir el formato viejo del nuevo
     (ver abajo). El router del index.html sigue siendo el dueño de a cuál
     navegar; esto es solo el vocabulario. */
  /* Vocabulario CERRADO de secciones. `Ruta.parse()` lo usa para
     distinguir el formato viejo (#/<planilla>/<fase>/<seccion>) del nuevo
     (#/<planilla>/<torneo>/<fase>/<seccion>), asi que agregar un nombre
     ACA cambia como se leen los links compartidos. Es seguro mientras
     ninguna FASE se llame igual que una seccion. */
  const SECCIONES = ['principal', 'clasificacion', 'equipos', 'jugadores', 'scouting', 'simulador', 'diagnostico'];

  const Ruta = {
    /**
     * Formato actual:  #/<planilla>/<torneo>/<fase>/<seccion>/...
     * Formato anterior: #/<planilla>/<fase>/<seccion>/...
     *
     * Los links viejos que el club ya tiene guardados TIENEN que seguir
     * funcionando, así que se detecta cuál es cuál en vez de romperlos: en
     * el formato nuevo la sección está en la posición 3, en el viejo en la
     * 2. Como el vocabulario de secciones es finito y conocido, alcanza con
     * mirar dónde cae. Sin ese chequeo, `#/primera/REGULAR/equipos` se
     * leería como torneo=REGULAR, fase=equipos y sección vacía.
     */
    parse(hash) {
      const partes = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      const esSeccion = (v) => !!v && SECCIONES.indexOf(String(v).toLowerCase()) !== -1;

      /* Con menos de 3 tramos no hay ambigüedad posible: es formato viejo.
         Con 3 o más, el formato nuevo pone la sección en partes[3]. */
      const nuevo = esSeccion(partes[3]) || (partes.length >= 3 && !esSeccion(partes[2]));
      const off = nuevo ? 1 : 0;

      return {
        planilla: partes[0] || null,
        torneo:   nuevo && partes[1] ? partes[1].toUpperCase() : null,
        fase:     partes[1 + off] ? partes[1 + off].toUpperCase() : null,
        seccion:  partes[2 + off] || 'principal',
        entidad:  partes[3 + off] || null,
        tab:      partes[4 + off] || null,
        // Detalle de un partido dentro del tab Partidos.
        sub:      partes[5 + off] || null,
        // Un jugador puntual (ver comentario arriba).
        jugador:  partes[6 + off] || null,
      };
    },
    build(r) {
      /* El torneo se omite cuando es GENERAL: una planilla de un solo
         torneo no tiene por qué arrastrar "/GENERAL/" en cada link. */
      const t = (r.torneo && String(r.torneo).toUpperCase() !== TORNEO_GENERAL) ? r.torneo : null;
      const p = [r.planilla, t, r.fase, r.seccion, r.entidad, r.tab, r.sub, r.jugador]
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

    /* El índice representa UNA competencia: un par (torneo, fase). El
       torneo NO entra en la clave del equipo — entra en el alcance del
       índice, que es distinto y mucho menos invasivo.

       Por qué NO se metió en `claveEquipo()`: esa función es el
       normalizador de NOMBRES ("ATENAS 'A' - MM" → "ATENAS A") y la usan
       la resolución de escudos, `esEquipoPropio`, los slugs de la URL y
       —crítico— la extracción del rival, que parte el texto "A vs B" del
       campo PARTIDO y compara cada lado contra el equipo propio. Ese texto
       no tiene torneo ni fase, así que una clave compuesta nunca volvería
       a matchear y todos los rivales de la app quedarían en blanco.
       Scopear el índice da el mismo resultado —dos "REGULAR" de torneos
       distintos jamás se colapsan— sin tocar nada de eso.

       `GENERAL` = la planilla no trae la columna: todo el libro es una
       sola competencia y no se filtra nada. */
    const torneo = (opt.torneo || TORNEO_GENERAL).toUpperCase();
    const filtraTorneo = torneo !== TORNEO_GENERAL;
    /**
     * ¿Esta fila pertenece a la competencia que estoy indexando?
     *
     * Una fila SIN torneo pasa siempre. Es a propósito: si un libro trae
     * TORNEO en `PROMEDIOS E` pero no en `Base Datos J` (convención mixta,
     * pasa entre carpetas del motor), descartarla dejaría la sección de
     * jugadores vacía sin decir por qué. Dejarla pasar como mucho mezcla
     * filas sin atribuir, que es la degradación barata — y de eso ya avisa
     * `validarTorneo` en el Diagnóstico.
     */
    const enTorneo = (fila) => {
      if (!filtraTorneo) return true;
      const t = torneoDeFila(fila);
      return t === TORNEO_GENERAL || t === torneo;
    };

    const equipos = new Map();   // claveEquipo -> { nombre, promedios, acumulado, factores, partidos:[], jugadores:[] }
    const liga = { fase: fase, torneo: torneo, n: 0, tipo: {}, distribuciones: {} };
    const avisos = [];

    function equipo(nombreCrudo) {
      const k = claveEquipo(nombreCrudo);
      if (!k) return null;
      if (!equipos.has(k)) {
        equipos.set(k, {
          /* `limpiarNombre` y NO una regex propia de `- MM`: esa recortaba
             solo el sufijo de Primera, así que en U21 y U23 el nombre
             llegaba a la UI como "ATENAS - U23" mientras los escudos —que
             sí usan el normalizador— lo resolvían como "ATENAS". Se veía en
             la grilla, en los rankings y en el título de la ficha. */
          clave: k, nombre: limpiarNombre(nombreCrudo),
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
        if (!enTorneo(fila)) return;   // [multi-torneo] el índice es de UNA competencia

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

    /* ---------------------------------------------------------------------
       JOIN DE FECHA POR PARTIDO · `Base Datos E` es la fuente de verdad

       `4 FACTORES` y `Base Datos J` traen la FECHA vacía en muchas filas (en
       la planilla de Reconquista, en TODAS las de `Base Datos J`). Como
       `idPartido()` = FECHA + PARTIDO, sin heredarla el mismo partido tiene
       dos ids distintos según la hoja (`sf_atenas-a-vs-…` contra
       `2026-05-05_atenas-a-vs-…`) y nunca cruzan: el box score del detalle
       de partido no se dibujaba nunca.

       El mapa se arma ANTES de indexar nada y la fecha heredada entra al
       cálculo del `__id`, no después. Parchear el `FECHA` a posteriori —como
       se hacía con `4 FACTORES`— deja el `__id` viejo ya calculado, así que
       `factoresPorId` seguía sin matchear aunque la fecha estuviera bien.

       GUARD DE AMBIGÜEDAD: el texto `"A vs B"` NO identifica un partido en
       una liga con ida y vuelta — los dos cruces se escriben igual y solo
       los separa la fecha, que es justamente el dato que falta. Si un mismo
       PARTIDO aparece con dos fechas distintas en `Base Datos E`, NO se
       hereda nada: se prefiere un partido sin cruzar (que la UI ya sabe
       mostrar como "sin box score") antes que atribuirle a un jugador la
       noche equivocada. Se avisa en el Diagnóstico.
       --------------------------------------------------------------------- */
    const fechaPorPartido = new Map();
    const partidosAmbiguos = new Set();
    (function () {
      const h = hojas['Base Datos E'];
      if (!h) return;
      h.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        if (!enTorneo(fila)) return;
        const k = texto(fila['PARTIDO']);
        const f = fila['FECHA'];
        if (!k || !f) return;
        const previa = fechaPorPartido.get(k);
        if (previa === undefined) fechaPorPartido.set(k, f);
        else if (String(previa) !== String(f)) partidosAmbiguos.add(k);
      });
      if (partidosAmbiguos.size) {
        avisos.push(partidosAmbiguos.size + ' cruce(s) con el mismo texto de PARTIDO en más de una fecha ' +
          '(ida y vuelta): las filas sin FECHA de esos partidos no se pueden atribuir y quedan sin box score.');
      }
    })();

    /**
     * La FECHA de la fila, o la del mismo PARTIDO en `Base Datos E`.
     * Devuelve la propia (vacía incluida) si el cruce es ambiguo.
     */
    function fechaEfectiva(fila) {
      if (fila['FECHA']) return fila['FECHA'];
      const k = texto(fila['PARTIDO']);
      if (partidosAmbiguos.has(k)) return fila['FECHA'];
      const heredada = fechaPorPartido.get(k);
      return heredada !== undefined ? heredada : fila['FECHA'];
    }

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
        if (!enTorneo(fila)) return;   // [multi-torneo] el índice es de UNA competencia
        const e = equipo(fila['EQUIPO']);
        if (!e) return;
        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        const f = fechaEfectiva(fila);
        datos['FECHA'] = f;
        datos.__partido = texto(fila['PARTIDO']);
        datos.__id = idPartido(fila['PARTIDO'], f);
        e[campo].push(datos);
      });
    });

    /* --- Jugadores --- */
    const hj = hojas['PROMEDIOS J'];
    if (hj) {
      const idTipo = ESQUEMA['PROMEDIOS J'].filaTipo;
      hj.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        if (!enTorneo(fila)) return;   // [multi-torneo] el índice es de UNA competencia
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
       FACTORES PONDERADOS sobre totales de temporada.

       Base Datos E trae dos filas por partido, así que la fila del rival ES
       su box score completo. Joineando por PARTIDO obtenemos TCC/TCI/T3C/T1C
       del rival, que no existen como columna `*opp` en ninguna hoja.

       Con esto los 8 factores (4 propios + 4 del rival) se calculan con el
       MISMO método: ratio sobre los totales de la temporada. Antes el lado
       ofensivo venía ponderado de PROMEDIOS E y el defensivo era el promedio
       simple de PROMEDIOS 4F: comparar "mi eFG%" contra "el eFG% que permito"
       era comparar dos cosas distintas.
       --------------------------------------------------------------------- */
    const filasPorPartido = new Map();
    equipos.forEach(e => e.partidos.forEach(p => {
      const k = p.__partido;
      if (!k) return;
      if (!filasPorPartido.has(k)) filasPorPartido.set(k, []);
      filasPorPartido.get(k).push({ equipo: e.clave, fila: p });
    }));

    function sumar(acum, fila, cols) {
      cols.forEach(c => {
        const v = fila[c];
        if (typeof v === 'number' && isFinite(v)) acum[c] = (acum[c] || 0) + v;
      });
    }
    /* T2I/T3I/T1I/T2C hacen falta para calcular T2%, T3% y T1% sobre un
       subconjunto de partidos (victorias vs derrotas, local vs visitante).
       Sin ellos solo se pueden reconstruir los 4 factores. */
    const COLS_SUMA = ['TCC', 'TCI', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I',
                       'PP', 'PLAYS', 'RO', 'RD', 'PTS', 'AST'];
    const div = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0) ? a / b : null;

    /**
     * Agrega un conjunto de partidos de un equipo y devuelve sus 8 factores.
     * Se usa para la temporada completa y para los cortes (local/visitante,
     * últimos N, contra un rival puntual).
     */
    function agregarPartidos(claveEq, partidos) {
      const yo = {}, riv = {};
      let conRival = 0, g = 0, pd = 0;

      partidos.forEach(p => {
        sumar(yo, p, COLS_SUMA);
        const res = texto(p['RESULTADO']).toUpperCase();
        if (res === 'GANADO') g++; else if (res === 'PERDIDO') pd++;
        const pareja = filasPorPartido.get(p.__partido) || [];
        const otro = pareja.find(x => x.equipo !== claveEq);
        if (otro) { sumar(riv, otro.fila, COLS_SUMA); conRival++; }
      });

      return {
        pj: partidos.length, ganados: g, perdidos: pd,
        propio: yo, rival: riv, partidosConRival: conRival,
        ptsFavor: yo['PTS'] || 0, ptsContra: riv['PTS'] || 0,
        /* Ratios de tiro sobre el subconjunto. Se calculan sobre totales,
           igual que en la temporada completa: comparables entre sí. */
        tiro: {
          'eFG%': div((yo['TCC'] || 0) + 0.5 * (yo['T3C'] || 0), yo['TCI']),
          'TS%':  div(yo['PTS'], 2 * ((yo['TCI'] || 0) + 0.44 * (yo['T1I'] || 0))),
          'T2%':  div(yo['T2C'], yo['T2I']),
          'T3%':  div(yo['T3C'], yo['T3I']),
          'T1%':  div(yo['T1C'], yo['T1I']),
          'TC%':  div(yo['TCC'], yo['TCI']),
          'PT3%': div(yo['T3I'], yo['PLAYS']),
          'PePP%': div(yo['PP'], yo['PLAYS']),
          'RO%':  div(yo['RO'], (yo['RO'] || 0) + (riv['RD'] || 0)),
          'AST%': div(yo['AST'], yo['TCC']),
          'PPP':  div(yo['PTS'], yo['PLAYS']),
          'RTL%': div(yo['T1C'], yo['TCI']),
          'eFG Opp%': div((riv['TCC'] || 0) + 0.5 * (riv['T3C'] || 0), riv['TCI']),
        },
        factores: {
          'eFG%':  div((yo['TCC'] || 0) + 0.5 * (yo['T3C'] || 0), yo['TCI']),
          'RTL%':  div(yo['T1C'], yo['TCI']),
          'PePP%': div(yo['PP'], yo['PLAYS']),
          'RO%':   div(yo['RO'], (yo['RO'] || 0) + (riv['RD'] || 0)),
          'eFG Opp%': div((riv['TCC'] || 0) + 0.5 * (riv['T3C'] || 0), riv['TCI']),
          'RTL Opp%': div(riv['T1C'], riv['TCI']),
          'PP Opp%':  div(riv['PP'], riv['PLAYS']),
          'RO Opp%':  div(riv['RO'], (riv['RO'] || 0) + (yo['RD'] || 0)),
        },
      };
    }

    equipos.forEach(e => {
      const yo = {}, riv = {};
      let conRival = 0;

      e.partidos.forEach(p => {
        sumar(yo, p, COLS_SUMA);
        const pareja = filasPorPartido.get(p.__partido) || [];
        const otro = pareja.find(x => x.equipo !== e.clave);
        if (otro) { sumar(riv, otro.fila, COLS_SUMA); conRival++; }
      });

      /* Orden cronológico real. Los partidos sin fecha quedan al final
         conservando el orden de la planilla, que suele ser el correcto. */
      e.partidos.forEach((p, i) => { p.__fecha = fecha(p['FECHA']); p.__orden = i; });
      e.partidos.sort((a, b) => {
        if (a.__fecha && b.__fecha) return a.__fecha - b.__fecha;
        if (a.__fecha) return -1;
        if (b.__fecha) return 1;
        return a.__orden - b.__orden;
      });
      e.sinFecha = e.partidos.filter(p => !p.__fecha).length;

      /* Récord, racha y cortes. */
      let g = 0, pd = 0;
      e.partidos.forEach(p => {
        const r = texto(p['RESULTADO']).toUpperCase();
        if (r === 'GANADO') g++; else if (r === 'PERDIDO') pd++;
      });
      e.record = { ganados: g, perdidos: pd, pj: e.partidos.length };

      let racha = 0, tipoRacha = null;
      for (let i = e.partidos.length - 1; i >= 0; i--) {
        const r = texto(e.partidos[i]['RESULTADO']).toUpperCase();
        if (!r) continue;
        if (tipoRacha === null) { tipoRacha = r; racha = 1; }
        else if (r === tipoRacha) racha++;
        else break;
      }
      e.racha = tipoRacha ? { tipo: tipoRacha, n: racha } : null;

      e.split = {
        LOCAL: agregarPartidos(e.clave, e.partidos.filter(p => texto(p['CONDICION']).toUpperCase() === 'LOCAL')),
        VISITANTE: agregarPartidos(e.clave, e.partidos.filter(p => texto(p['CONDICION']).toUpperCase() === 'VISITANTE')),
      };

      /* Victorias vs derrotas: la base del insight de patrón de juego. */
      e.porResultado = {
        GANADO: agregarPartidos(e.clave, e.partidos.filter(p => texto(p['RESULTADO']).toUpperCase() === 'GANADO')),
        PERDIDO: agregarPartidos(e.clave, e.partidos.filter(p => texto(p['RESULTADO']).toUpperCase() === 'PERDIDO')),
      };
      e.ultimos5 = agregarPartidos(e.clave, e.partidos.slice(-5));

      e.totales = { propio: yo, rival: riv, partidosConRival: conRival };
      e.ponderado = {
        // Ofensivos: recalculados desde la misma fuente, para poder contrastar
        // contra PROMEDIOS E y detectar divergencias.
        'eFG%':  div((yo['TCC'] || 0) + 0.5 * (yo['T3C'] || 0), yo['TCI']),
        'RTL%':  div(yo['T1C'], yo['TCI']),
        'PePP%': div(yo['PP'], yo['PLAYS']),
        'RO%':   div(yo['RO'], (yo['RO'] || 0) + (riv['RD'] || 0)),
        // Defensivos: el box score del rival, sumado sobre la temporada.
        'eFG Opp%': div((riv['TCC'] || 0) + 0.5 * (riv['T3C'] || 0), riv['TCI']),
        'RTL Opp%': div(riv['T1C'], riv['TCI']),
        'PP Opp%':  div(riv['PP'], riv['PLAYS']),
        'RO Opp%':  div(riv['RO'], (riv['RO'] || 0) + (yo['RD'] || 0)),
      };
    });

    /* ---------------------------------------------------------------------
       Partidos DISTINTOS.

       Base Datos E trae dos filas por partido (una por equipo), así que
       contar filas cuenta el doble. El partido se identifica por la columna
       PARTIDO; FECHA sola no alcanza porque hay varios el mismo día.
       --------------------------------------------------------------------- */
    const clavesPartido = new Set();
    equipos.forEach(e => e.partidos.forEach(p => { if (p.__partido) clavesPartido.add(p.__partido); }));
    liga.partidos = clavesPartido.size;
    let sinF = 0; equipos.forEach(e => { sinF += (e.sinFecha || 0); });
    liga.filasSinFecha = sinF;
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

    /* Agrupa por equipo para la grilla de Jugadores: filtrar por club sin
       recorrer liga.jugadores entero (por nombre, string a string) en cada
       repintado. Mismo criterio de clave que el resto del índice. */
    liga.jugadoresPorEquipo = new Map();
    todosJugadores.forEach(j => {
      const k = claveEquipo(j['EQUIPO']);
      if (!k) return;
      if (!liga.jugadoresPorEquipo.has(k)) liga.jugadoresPorEquipo.set(k, []);
      liga.jugadoresPorEquipo.get(k).push(j);
    });

    /* ---------------------------------------------------------------------
       BOX SCORE POR PARTIDO

       Base Datos J tiene una fila por jugador-partido de TODA la liga. Con
       272 partidos x 24 jugadores son ~6.500 filas: indexarlas por partido
       cuesta 7 ms y el Map guarda referencias, no copias, así que el costo
       de memoria es la estructura y nada más. No hace falta lazy loading.
       --------------------------------------------------------------------- */
    liga.boxPorPartido = new Map();   // idPartido -> filas de jugador
    /* =====================================================================
       ACUMULADOS DE JUGADOR · los mismos jugadores, en totales

       `PROMEDIOS J` trae 53 columnas y `ACUMULADO J` 32: las 21 que faltan
       son TASAS —`eFG%`, `PPP`, `T3%`, `USG%`…— y no faltan por error. Una
       tasa acumulada es la misma tasa: el eFG% de la temporada no es la
       suma de los eFG% de cada noche. Lo que sí cambia entre las dos hojas
       son las CUENTAS: `PTS`, `MIN`, `RT`, `AST` por partido contra el
       total del torneo.

       Se cuelga de cada jugador ya indexado como `__acum`, en vez de armar
       una segunda lista: así el toggle de la UI alterna el ORIGEN de unas
       columnas sin duplicar el plantel ni volver a resolver percentiles,
       arquetipos ni estados, que se calculan una sola vez sobre promedios.
       ===================================================================== */
    const haj = hojas['ACUMULADO J'];
    if (haj) {
      const idTipoA = ESQUEMA['ACUMULADO J'].filaTipo;
      const porClave = new Map();
      haj.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        if (!enTorneo(fila)) return;
        if (esFilaTipo(fila, idTipoA)) return;   // el TIPO no es un jugador
        const k = clavePersona(fila['NOMBRES']) + '|' + claveEquipo(fila['EQUIPO']);
        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        porClave.set(k, datos);
      });
      /* Se engancha por NOMBRE + EQUIPO, la misma clave compuesta que usa
         el slug de la ficha: con el nombre solo, dos homónimos de equipos
         distintos se llevarían el acumulado del otro. */
      liga.jugadores.forEach(j => {
        const k = clavePersona(j['NOMBRES']) + '|' + claveEquipo(j['EQUIPO']);
        const a = porClave.get(k);
        if (a) j.__acum = a;
      });
    }

    liga.jugadorPartidos = new Map(); // clavePersona -> filas de sus partidos

    const hbj = hojas['Base Datos J'];
    if (hbj) {
      hbj.filas.forEach(fila => {
        const faseFila = texto(fila['FASE']).toUpperCase();
        if (faseFila && faseFila !== fase) return;
        if (!enTorneo(fila)) return;   // [multi-torneo] el índice es de UNA competencia
        /* Mismo join que las hojas de equipo: sin heredar la FECHA, el id
           de esta fila nunca cruza con el de `Base Datos E` y el box score
           del partido queda huérfano. */
        const fEfectiva = fechaEfectiva(fila);
        const id = idPartido(fila['PARTIDO'], fEfectiva);

        const datos = {};
        Object.keys(fila).forEach(c => {
          const v = num(fila[c]);
          datos[c] = (v !== null) ? v : texto(fila[c]);
        });
        /* `Base Datos J` trae 0 donde debería ir blanco (ver la nota de
           `blanquearTasasSinDenominador`). Se corrige ACÁ, antes de que la
           fila entre a `jugadorPartidos` y contamine media, desvío y
           atípicos. */
        blanquearTasasSinDenominador(datos);
        datos['FECHA'] = fEfectiva;
        datos.__id = id;
        datos.__partido = texto(fila['PARTIDO']);
        datos.__fecha = fecha(fEfectiva);
        datos.__clave = clavePersona(fila['NOMBRES']);
        datos.__equipo = claveEquipo(fila['EQUIPO']);

        if (!liga.boxPorPartido.has(id)) liga.boxPorPartido.set(id, []);
        liga.boxPorPartido.get(id).push(datos);

        if (!liga.jugadorPartidos.has(datos.__clave)) liga.jugadorPartidos.set(datos.__clave, []);
        liga.jugadorPartidos.get(datos.__clave).push(datos);
      });
    }

    /* Índice de partidos por equipo, con su id canónico. */
    equipos.forEach(e => {
      e.partidosPorId = new Map();
      e.partidos.forEach(p => { if (p.__id) e.partidosPorId.set(p.__id, p); });
      e.factoresPorId = new Map();
      e.factoresPartido.forEach(f => { if (f.__id) e.factoresPorId.set(f.__id, f); });
    });

    /* --- Distribuciones para percentiles --- */
    const listaEquipos = Array.from(equipos.values());
    liga.n = listaEquipos.length;

    Object.keys(METRICAS).forEach(clave => {
      const m = METRICAS[clave];
      const campo = (m.hoja === 'PROMEDIOS 4F') ? 'factores'
                  : (m.hoja === 'CALCULADO') ? 'ponderado'
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

    liga.medianasCalculadas = {};
    Object.keys(METRICAS).forEach(clave => {
      if (METRICAS[clave].hoja !== 'CALCULADO') return;
      const m2 = mediana(liga.distribuciones[clave] || []);
      if (m2 !== null) liga.medianasCalculadas[clave] = m2;
    });

    /**
     * Lee una métrica de un equipo desde su hoja dueña, con contexto.
     * Devuelve { valor, tipo, delta, percentil, formateado, descriptiva }.
     */
    function leer(claveEq, claveMet, idVista) {
      const e = equipos.get(claveEquipo(claveEq));
      const m = METRICAS[claveMet];
      if (!e || !m) return null;
      const v = idVista ? VISTAS[idVista] : null;
      const campo = (m.hoja === 'PROMEDIOS 4F') ? 'factores'
                  : (m.hoja === 'CALCULADO') ? 'ponderado' : 'promedios';
      const valor = e[campo] ? e[campo][claveMet] : null;
      const val = (typeof valor === 'number' && isFinite(valor)) ? valor : null;
      // Las métricas calculadas no tienen fila EQUIPO TIPO en la planilla:
      // la mediana la calculamos sobre la distribución de los N equipos.
      const tipo = (liga.tipo[claveMet] !== undefined) ? liga.tipo[claveMet]
                 : (liga.medianasCalculadas[claveMet] !== undefined) ? liga.medianasCalculadas[claveMet]
                 : null;
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

    /**
     * Devuelve TODO lo de un partido: las dos filas de equipo, los dos
     * conjuntos de factores y los dos box scores.
     */
    function partido(id) {
      const box = liga.boxPorPartido.get(id) || [];
      const lados = [];
      equipos.forEach(e => {
        const fe = e.partidosPorId.get(id);
        if (!fe) return;
        lados.push({
          equipo: e,
          fila: fe,
          factores: e.factoresPorId.get(id) || null,
          box: box.filter(b => b.__equipo === e.clave).sort((a, b) => (b['MIN'] || 0) - (a['MIN'] || 0)),
        });
      });
      if (!lados.length) return null;

      // El local primero, como se escribe en la columna PARTIDO.
      lados.sort((a, b) => (texto(a.fila['CONDICION']).toUpperCase() === 'LOCAL' ? -1 : 1));
      return {
        id: id,
        nombre: lados[0].fila.__partido || '',
        fecha: lados[0].fila.__fecha || null,
        lados: lados,
        propio: lados.find(l => esEquipoPropio(l.equipo.clave)) || null,
        completo: lados.length === 2,
        conBox: box.length > 0,
      };
    }

    /**
     * Media y desvío de un jugador en una métrica, sobre SUS partidos.
     * Con eso se sabe si un rendimiento fue atípico para ÉL, y no contra
     * un umbral fijo: 20 puntos es normal para uno y un pico para otro.
     */
    function statJugador(clavePers, metrica) {
      const ps = liga.jugadorPartidos.get(clavePers) || [];
      const vals = ps.map(p => p[metrica]).filter(v => typeof v === 'number' && isFinite(v));
      if (vals.length < 3) return null;
      const m = vals.reduce((a, v) => a + v, 0) / vals.length;
      const varianza = vals.reduce((a, v) => a + (v - m) * (v - m), 0) / vals.length;
      return { media: m, desvio: Math.sqrt(varianza), n: vals.length };
    }

    return {
      fase, equipos, liga, avisos, agregarPartidos, partido, statJugador,
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
  /** Techo por hoja. Sin esto, un `fetch` que no resuelve nunca —conexión a
      medio abrir, Google que no contesta— deja la promesa PENDIENTE, y como
      se cachea por `sheetId`, esa categoría queda en "Cargando…" para
      siempre: cambiar de ida y vuelta no la revive porque el caché devuelve
      la misma promesa muerta. Solo se recuperaba recargando la página. */
  const TIMEOUT_HOJA = 20000;

  function bajarHoja(sheetId, nombre, techo) {
    const url = urlGviz(sheetId, nombre);
    const ms = techo || TIMEOUT_HOJA;

    /* DOS mecanismos, y hacen falta los dos:

         · `AbortController` corta la conexión de verdad, para no dejarla
           abierta consumiendo una de las seis que el navegador da por
           host mientras el usuario sigue cambiando de categoría.
         · La CARRERA es la que garantiza el techo. Abortar solo funciona
           si el `fetch` respeta la señal; si por lo que sea no la
           respeta, la promesa nunca settle y volvemos al cuelgue que
           esto vino a arreglar. La carrera no depende de nadie.
    */
    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    let reloj = null;
    const vencimiento = new Promise((_, rechazar) => {
      reloj = setTimeout(() => {
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        rechazar(new Error("sin respuesta en " + Math.round(ms / 1000) + "s"));
      }, ms);
    });

    const pedido = fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(t => ({ nombre: nombre, hoja: parsearGviz(t) }));

    return Promise.race([pedido, vencimiento])
      .catch(e => ({
        nombre: nombre,
        error: (e && e.name === "AbortError")
          ? ("sin respuesta en " + Math.round(ms / 1000) + "s")
          : (e.message || String(e)),
      }))
      .then(r => { clearTimeout(reloj); return r; });
  }
  /* =====================================================================
     CACHÉ PERSISTENTE · sobrevive al F5, no a cerrar la pestaña

     El `_cache` de arriba guarda la PROMESA y vive en memoria: evita pedir
     dos veces en la misma sesión, pero se pierde en cada recarga. Medido en
     producción, cada recarga vuelve a costar entre 0,6 y 2,9 s de GViz
     —nueve hojas en paralelo, la más lenta manda— y el libro no cambió.

     Se usa **sessionStorage y no localStorage** a propósito. El dato de la
     planilla cambia cuando corre MotorStats, y nadie avisa: con
     `localStorage` un DT podría abrir el panel el domingo y ver la fecha
     del jueves sin enterarse. `sessionStorage` muere al cerrar la pestaña,
     así que el techo del dato viejo es una sesión de trabajo, y adentro de
     esa sesión igual hay un TTL.
     ===================================================================== */

  const CACHE_PREFIJO = 'sgadd.hojas.';
  /* Sube cuando cambia la FORMA de lo que se guarda. Un caché escrito por
     una versión vieja del parser se descarta en vez de reventar abajo. */
  const CACHE_FORMATO = 1;
  const CACHE_TTL_MS = 30 * 60 * 1000;   // 30 minutos

  /** El almacén, o null si no se puede usar (Node, modo privado, bloqueado). */
  function almacen() {
    try {
      if (typeof sessionStorage === 'undefined' || !sessionStorage) return null;
      /* Safari en privado deja leer y tira al escribir: se prueba de verdad. */
      const k = CACHE_PREFIJO + '__test__';
      sessionStorage.setItem(k, '1');
      sessionStorage.removeItem(k);
      return sessionStorage;
    } catch (e) { return null; }
  }

  function leerCachePersistente(sheetId) {
    const ls = almacen();
    if (!ls) return null;
    let crudo;
    try { crudo = ls.getItem(CACHE_PREFIJO + sheetId); } catch (e) { return null; }
    if (!crudo) return null;
    let d;
    try { d = JSON.parse(crudo); } catch (e) { borrarCachePersistente(sheetId); return null; }
    if (!d || d.formato !== CACHE_FORMATO || !d.hojas) { borrarCachePersistente(sheetId); return null; }
    if (!d.guardado || (Date.now() - d.guardado) > CACHE_TTL_MS) {
      borrarCachePersistente(sheetId);
      return null;
    }
    return d.hojas;
  }

  /**
   * Guarda las hojas de un libro. Devuelve true si quedaron guardadas.
   *
   * Un libro real ronda los 2 MB serializados y el cupo típico son 5 MB,
   * así que dos libros grandes en la misma pestaña pueden no entrar. Que no
   * entre NO es un error: el panel funciona igual, solo vuelve a pedirle a
   * GViz. Se limpia lo propio y se sigue.
   */
  function guardarCachePersistente(sheetId, hojas) {
    const ls = almacen();
    if (!ls) return false;
    const payload = JSON.stringify({ formato: CACHE_FORMATO, guardado: Date.now(), hojas: hojas });
    try {
      ls.setItem(CACHE_PREFIJO + sheetId, payload);
      return true;
    } catch (e) {
      /* Sin lugar: se tiran los libros de OTRAS categorías —el que se está
         mirando es el que importa— y se prueba una sola vez más. */
      borrarCachePersistente(null, sheetId);
      try { ls.setItem(CACHE_PREFIJO + sheetId, payload); return true; }
      catch (e2) { return false; }
    }
  }

  /** Borra el caché de un libro, o el de todos menos `excepto`. */
  function borrarCachePersistente(sheetId, excepto) {
    const ls = almacen();
    if (!ls) return;
    try {
      if (sheetId) { ls.removeItem(CACHE_PREFIJO + sheetId); return; }
      const fuera = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.indexOf(CACHE_PREFIJO) === 0 && k !== CACHE_PREFIJO + excepto) fuera.push(k);
      }
      fuera.forEach(k => ls.removeItem(k));
    } catch (e) {}
  }

  function cargarCategoria(sheetId, opciones) {
    const opt = opciones || {};
    if (!sheetId) return Promise.reject(new Error('Falta el sheetId'));
    if (_cache.has(sheetId) && !opt.forzar) return _cache.get(sheetId);

    const nombres = opt.hojas || Object.keys(ESQUEMA);

    /* El caché persistente solo sirve para la carga COMPLETA: si alguien
       pidió un subconjunto de hojas, servirle el libro entero guardado
       devolvería más de lo que pidió. */
    const completa = !opt.hojas;
    if (completa && !opt.forzar) {
      const guardadas = leerCachePersistente(sheetId);
      if (guardadas) {
        const listo = Promise.resolve({ hojas: guardadas, errores: [], deCache: true });
        _cache.set(sheetId, listo);
        return listo;
      }
    }
    if (opt.forzar) borrarCachePersistente(sheetId);
    const tarea = Promise.all(nombres.map(nombre => bajarHoja(sheetId, nombre, opt.timeout)))
      .then(res => {
        const hojas = {}, errores = [];
        res.forEach(r => {
          if (r.error) errores.push({ nivel: 'error', hoja: r.nombre, mensaje: 'No se pudo leer: ' + r.error });
          else hojas[r.nombre] = r.hoja;
        });
        /* Un fallo TOTAL no se cachea: si no entró ni una hoja fue un
           problema de red o de permisos, no del libro, y el próximo intento
           tiene que volver a pedir en vez de servir el fracaso guardado. */
        if (!Object.keys(hojas).length) _cache.delete(sheetId);

        /* Se guarda solo la carga LIMPIA. Con hojas que fallaron, cachear
           serviría el mismo libro incompleto durante media hora en vez de
           reintentar — y una hoja que falla suele ser un timeout puntual. */
        if (completa && !errores.length && Object.keys(hojas).length) {
          guardarCachePersistente(sheetId, hojas);
        }
        return { hojas, errores };
      })
      .catch(e => { _cache.delete(sheetId); throw e; });

    _cache.set(sheetId, tarea);
    return tarea;
  }

  /**
   * Limpia el caché.
   *
   * CON `sheetId` limpia las DOS capas: es lo que hace "Actualizar datos",
   * y si solo vaciara la memoria el caché persistente volvería a servir el
   * libro viejo — el gesto del DT no haría nada visible.
   *
   * SIN `sheetId` limpia SOLO la memoria. Lo llama `aplicarDatos()` del
   * club en CADA arranque, para que dos ligas no compartan índice; si de
   * paso borrara el disco, el caché persistente moriría en el arranque
   * siguiente al que lo escribió y no serviría jamás. Medido con un espía
   * sobre `Storage`: sin esta distinción, el F5 volvía a pedirle las nueve
   * hojas a GViz igual, y el caché parecía andar porque se reescribía solo.
   *
   * Y no hace falta que lo borre: el caché va por `sheetId`, así que dos
   * clubes nunca se pisan — al contrario, conservarlo hace que volver al
   * club anterior sea instantáneo.
   */
  function limpiarCache(sheetId) {
    if (sheetId) { _cache.delete(sheetId); borrarCachePersistente(sheetId); }
    else _cache.clear();
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

  /**
   * VALIDADOR DE TORNEO — riesgo de colapso entre competencias.
   *
   * Desde MotorStats v44 las planillas traen la columna `TORNEO`, y desde
   * v47 la columna `FASE` guarda la fase LIMPIA (`"REGULAR"`), no la
   * etiqueta compuesta. Lo que distingue un tramo de otro pasó a ser el par
   * `TORNEO + FASE`.
   *
   * SGADD agrupa por `EQUIPO + FASE` y NO mira `TORNEO`. Con una planilla de
   * un solo torneo eso es correcto y es el caso de todos los clubes hoy.
   * Con dos torneos en la misma planilla, la segunda fila PISA a la primera
   * y el dato se pierde en silencio — es el mismo defecto que el motor
   * corrigió en su v49, visto desde el lado del consumidor.
   *
   * Este guard AVISA, no aborta: sigue exactamente el criterio de
   * `_validarTorneo_` del motor (v48 · P2). Cambiar la clave del índice para
   * incluir TORNEO es un refactor que toca todas las secciones y no se hace
   * a espaldas de una advertencia.
   */
  function validarTorneo(hojas) {
    const out = [];
    Object.keys(ESQUEMA).forEach(nombre => {
      const h = hojas[nombre];
      if (!h || !h.filas || !h.filas.length) return;
      if (h.cols.indexOf('TORNEO') === -1) return;   // planilla pre-v44: nada que revisar

      const idTipo = ESQUEMA[nombre].filaTipo;
      const datos = h.filas.filter(f => !esFilaTipo(f, idTipo));
      if (!datos.length) return;

      const torneos = new Set();
      let sinTorneo = 0;
      datos.forEach(f => {
        const t = texto(f['TORNEO']);
        if (t) torneos.add(t); else sinTorneo++;
      });

      /* Dos torneos en una hoja YA NO son un error: desde el refactor
         multi-torneo el índice se construye scopeado a UNA competencia
         (`construirIndice(hojas, { fase, torneo })`) y el selector de la
         barra elige cuál. Antes sí lo era, porque el índice agrupaba por
         EQUIPO + FASE y las filas del segundo torneo pisaban a las del
         primero. Queda como aviso informativo: el DT tiene que saber que
         está viendo un recorte, no el libro entero. */
      if (torneos.size > 1) {
        out.push({
          nivel: 'aviso', hoja: nombre,
          mensaje: 'La hoja trae ' + torneos.size + ' torneos (' +
            Array.from(torneos).sort().join(', ') + '). El índice se arma de a un torneo ' +
            'por vez: elegí cuál en el selector Fase de la barra superior. ' +
            'Las filas de los otros no entran en los promedios ni en los percentiles.',
        });
      }
      if (torneos.size >= 1 && sinTorneo > 0) {
        out.push({
          nivel: 'aviso', hoja: nombre,
          mensaje: sinTorneo + ' de ' + datos.length + ' filas no tienen TORNEO y las otras sí (' +
            Array.from(torneos)[0] + '). Convención mixta en las carpetas de Nivel 5 del motor.',
        });
      }
    });

    /* =====================================================================
       El cruce que NINGUNA hoja sola puede ver: que los torneos de las
       MAESTRAS no aparezcan en las DERIVADAS, o al revés.

       Medido en el libro U23 de Reconquista el 2026-08-24:

         Base Datos E  (maestra)  → IDA 134 filas · VUELTA 30
         PROMEDIOS E   (derivada) → APERTURA 13 filas

       Intersección vacía. Cada hoja por separado se ve impecable y el
       validador de arriba no dice nada, pero NINGÚN torneo elegible tiene
       a la vez promedios y partidos: se abría una vista con 12 equipos,
       252 jugadores y CERO partidos —sin box scores ni cronología— y el
       resumen de Principal decía 82, porque esa capa no filtra por torneo.

       Va como ERROR y no como aviso: no es un recorte incompleto, es un
       libro que no se puede leer entero desde ninguna posición del
       selector. Se arregla en el motor, no acá.
       ===================================================================== */
    const torneosDe = (nombre) => {
      const h = hojas[nombre];
      if (!h || !h.filas || h.cols.indexOf('TORNEO') === -1) return null;
      const idTipo = ESQUEMA[nombre] ? ESQUEMA[nombre].filaTipo : null;
      const set = new Set();
      h.filas.forEach(f => {
        if (esFilaTipo(f, idTipo)) return;
        const t = texto(f['TORNEO']).toUpperCase();
        if (t) set.add(t);
      });
      return set.size ? set : null;
    };
    /* =====================================================================
       EL RECÁLCULO A MEDIAS · la derivada cubre menos equipos que la maestra

       Medido en el libro U21 de Reconquista el 2026-08-24:

         Base Datos E  →  132 filas · 12 equipos · 66 partidos
         PROMEDIOS E   →  3 filas: UN equipo (el primero del abecedario)
         PROMEDIOS J   →  21 filas: los jugadores de ESE equipo

       Las maestras están completas y las derivadas quedaron a mitad de
       camino, como si el motor se hubiera cortado durante el recálculo. La
       app no se rompe —muestra 12 equipos, 66 partidos y 18 jugadores— y
       eso es justamente el problema: **parece que funciona**. Un plantel de
       18 jugadores para una liga entera no se lee como un error, se lee
       como una liga chica, y todos los percentiles salen de esa muestra.

       Ningún validador lo veía: el bloque 2 compara PROMEDIOS contra
       ACUMULADO —y ahí coinciden, los dos tienen 3 filas— pero nadie
       compara las derivadas contra la MAESTRA, que es la que sabe cuántos
       equipos hay de verdad.
       ===================================================================== */
    const equiposDe = (nombre, col) => {
      const h = hojas[nombre];
      if (!h || !h.filas) return null;
      const idTipo = ESQUEMA[nombre] ? ESQUEMA[nombre].filaTipo : null;
      const set = new Set();
      h.filas.forEach(f => {
        if (esFilaTipo(f, idTipo)) return;
        const e = claveEquipo(f[col || 'EQUIPO']);
        if (e) set.add(e);
      });
      return set.size ? set : null;
    };
    /* Lo mismo para JUGADORES: `PROMEDIOS J` contra `ACUMULADO J`.

       Medido en el libro de Jujuy el 2026-08-24: `PROMEDIOS J` trae 260
       jugadores y `ACUMULADO J` **17**. Las dos hojas describen la misma
       gente y una está a mitad de camino, pero como el bloque 2 las compara
       entre sí por CANTIDAD DE FILAS y no por quiénes son, el desbalance
       pasaba igual. Sin esto, la vista de totales del plantel se llenaba de
       promedios disfrazados. */
    const jugadoresDe = (nombre) => {
      const h = hojas[nombre];
      if (!h || !h.filas) return null;
      const idTipo = ESQUEMA[nombre] ? ESQUEMA[nombre].filaTipo : null;
      const set = new Set();
      h.filas.forEach(f => {
        if (esFilaTipo(f, idTipo)) return;
        const n = clavePersona(f['NOMBRES']);
        if (n) set.add(n + '|' + claveEquipo(f['EQUIPO']));
      });
      return set.size ? set : null;
    };
    const jProm = jugadoresDe('PROMEDIOS J');
    const jAcum = jugadoresDe('ACUMULADO J');
    if (jProm && jAcum) {
      const faltanJ = Array.from(jProm).filter(k => !jAcum.has(k));
      /* Un puñado de diferencia es normal —un refuerzo cargado a mitad de
         semana— y avisar por eso entrena a ignorar el Diagnóstico. Se
         denuncia cuando falta más del 20%. */
      if (faltanJ.length > jProm.size * 0.2) {
        out.push({
          nivel: 'error', hoja: 'ACUMULADO J',
          mensaje: 'PROMEDIOS J tiene ' + jProm.size + ' jugadores y ACUMULADO J solo ' +
            jAcum.size + '. Faltan los totales de ' + faltanJ.length + '. El libro quedó a ' +
            'mitad de un recálculo: hay que reprocesarlo en el motor (MotorStats). Mientras ' +
            'tanto la vista de totales del plantel no se ofrece.',
        });
      }
    }

    const eMaestra = equiposDe('Base Datos E');
    [['PROMEDIOS E', 'los promedios'], ['ACUMULADO E', 'los acumulados'],
     ['PROMEDIOS 4F', 'los 4 factores']].forEach(([nombre, que]) => {
      const eDerivada = equiposDe(nombre);
      if (!eMaestra || !eDerivada) return;
      const faltan = Array.from(eMaestra).filter(e => !eDerivada.has(e));
      if (!faltan.length) return;
      out.push({
        nivel: 'error', hoja: nombre,
        mensaje: 'Base Datos E tiene ' + eMaestra.size + ' equipos y ' + nombre + ' solo ' +
          eDerivada.size + '. Faltan ' + que + ' de: ' + faltan.sort().slice(0, 6).join(', ') +
          (faltan.length > 6 ? ' y ' + (faltan.length - 6) + ' más' : '') + '. ' +
          'El libro quedó a mitad de un recálculo: los partidos están cargados pero las ' +
          'hojas derivadas no se rehicieron. Hay que reprocesarlo en el motor (MotorStats) — ' +
          'mientras tanto los percentiles salen de una muestra incompleta.',
      });
    });

    const maestra = torneosDe('Base Datos E');
    const derivada = torneosDe('PROMEDIOS E');
    if (maestra && derivada) {
      const comun = Array.from(derivada).filter(t => maestra.has(t));
      if (!comun.length) {
        out.push({
          nivel: 'error', hoja: 'Base Datos E ↔ PROMEDIOS E',
          mensaje: 'Los torneos de la maestra y los de la derivada no coinciden en ' +
            'ninguno: Base Datos E trae ' + Array.from(maestra).sort().join(', ') +
            ' y PROMEDIOS E trae ' + Array.from(derivada).sort().join(', ') + '. ' +
            'Elijas el torneo que elijas, la vista queda sin promedios o sin partidos. ' +
            'Es un problema de etiquetado en el motor (MotorStats), no del panel.',
        });
      } else if (comun.length < derivada.size) {
        const huerfanos = Array.from(derivada).filter(t => !maestra.has(t)).sort();
        out.push({
          nivel: 'aviso', hoja: 'Base Datos E ↔ PROMEDIOS E',
          mensaje: 'Estos torneos tienen promedios pero ningún partido cargado: ' +
            huerfanos.join(', ') + '. Al elegirlos, la cronología y los box scores ' +
            'quedan vacíos.',
        });
      }
    }
    return out;
  }

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
    num, texto, fecha, formatearFecha, limpiarNombre, claveEquipo, clavePersona, idPartido, mediana, promedio, percentil,
    // 1
    ESQUEMA, HOJAS_EXCLUIDAS,
    // 2
    METRICAS, METRICAS_LISTA, VISTAS, GRUPOS_DESCRIPTIVOS, metrica, vista, formatear, masMenosEquipo,
    // 3
    CATALOGO, FASES, SECCIONES, TORNEO_GENERAL, planilla, planillasVisibles, esEquipoPropio, agrupar,
    fasesDisponibles, torneosDisponibles, torneoPorDefecto, torneoDeFila, Ruta,
    combinacionesTorneoFase, tramoPorDefecto,
    leerCachePersistente, guardarCachePersistente, borrarCachePersistente,
    CACHE_PREFIJO, CACHE_FORMATO, CACHE_TTL_MS,
    blanquearTasasSinDenominador, DENOMINADOR_TASA,
    // 4
    normalizarHoja, construirIndice, esFilaTipo, tipoDeLiga, cargarCategoria, limpiarCache, TIMEOUT_HOJA, parsearGviz, urlGviz,
    // 5
    validarEsquema, validarTorneo, validarCoherencia, testSimetria, testTotales, testCrucePartidos,
    PARES_SIMETRIA, PARES_HOJAS, INVARIANTES_TOTALES, CRUCES_PARTIDO,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SGADD;
  else raiz.SGADD = SGADD;

})(typeof globalThis !== 'undefined' ? globalThis : this);
