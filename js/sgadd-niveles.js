/* =====================================================================
   SGADD · NIVEL DE COMPETENCIA Y REGISTRO DE UMBRALES

   Motor PURO: no toca `document` y se testea desde Node.

   ---------------------------------------------------------------------
   QUÉ RESUELVE

   Las etiquetas de jugador se deciden con ~34 números duros repartidos
   entre `sgadd-jugadores.js` y `sgadd-scouting.js`. Esos números se
   validaron contra Liga Argentina y La Plata, y nunca se contrastaron
   contra FORMATIVAS. Medido sobre cinco libros reales (Jujuy · Liga
   Argentina, Reconquista Primera, Deportivo, Reconquista U21 y U23), la
   mitad se corre entre 20 y 45 puntos percentiles de una categoría a
   otra: la misma etiqueta significa cosas distintas según el nivel.

   El caso más caro es `t1Pobre` = 0,60. En Liga Argentina marca al 15%
   peor de la liga; en la U23 marca al 60%. O sea que pasa de decir
   «tirador de libres flojo» a decir «jugador promedio».

   ---------------------------------------------------------------------
   LA DISTINCIÓN QUE SOSTIENE TODO

   Un umbral absoluto es LEGÍTIMO cuando describe economía del básquet:
   cae en el mismo percentil en cualquier liga. Es ilegítimo cuando
   describe «por encima/debajo del promedio» disfrazado de constante.

   Medido, con la brecha entre el percentil más alto y el más bajo de los
   cinco libros:

       pptTripleElite           1,20    p88–p94    6pp   ← legítimo
       mezclaTripleInterior     0,12    p10–p18    8pp   ← legítimo
       mezclaTripleaPerimetral  0,30    p26–p37   11pp   ← legítimo

       t1Pobre                  0,60    p15–p60   45pp   ← se corre
       t1Contacto               0,72    p52–p88   36pp   ← se corre
       astPPGenerador           1,40    p59–p93   34pp   ← se corre
       …

   Por eso cada umbral declara su TIPO, y los tres de arriba se quedan
   absolutos para siempre. Hay un test que falla si alguien los mueve.

   ---------------------------------------------------------------------
   CÓMO SE RESUELVE UN UMBRAL

       absoluto   la constante, siempre. No depende de nada.
       tier       la semilla del nivel, MEDIDA contra libros reales.
       vivo       el percentil real sobre los calificados del torneo.
       mezcla     interpolación lineal entre los dos.

   El warm-up tiene DOS gates —partidos y calificados— y hacen falta los
   dos: una liga con muchos jugadores y dos fechas tiene promedios que se
   mueven solos, y un percentil sobre 20 personas es ruido.

   LOS CLAMPS SON LA PIEZA QUE DA SENTIDO. Sin ellos el sistema es
   auto-referencial y toda liga tendría exactamente un 10% de «tiradores
   de élite», incluida una donde nadie convierte: la etiqueta pasaría a
   decir «de los peores, el mejor». Con el clamp, el nivel deja de ser una
   semilla y pasa a ser el ancla de significado.
   ===================================================================== */
const SGADD_NIVELES = (function () {
  'use strict';

  /* ===================================================================
     LOS TIPOS
     =================================================================== */
  const TIPOS = {
    /* Describe economía del juego. No se toca nunca, en ninguna liga. */
    ABSOLUTO: 'absoluto',
    /* Marca una porción de la población. El número crudo cambia por
       nivel; lo que se conserva es a quién señala. */
    PERCENTIL: 'percentil',
    /* Desvíos respecto de la media de la liga. Ya se usa en `bandaLiga`
       del scouting; se declara acá para que el registro sea completo. */
    Z: 'z',
  };

  /* ===================================================================
     LOS SEIS NIVELES

     El orden va de mayor a menor exigencia y NO es decorativo: la etapa 4
     lo usa para que un nivel sin libro herede del más cercano que sí
     tenga, en vez de caer a un default arbitrario.
     =================================================================== */
  const NIVELES = [
    { id: 'LIGA_NACIONAL', label: 'Liga Nacional', orden: 1,
      nota: 'Primera división nacional.' },
    { id: 'LIGA_ARGENTINA', label: 'Liga Argentina', orden: 2,
      nota: 'Segundo nivel nacional. Es la vara con la que se validaron las reglas.' },
    { id: 'FEDERAL_MAYORES', label: 'Torneo Federal · mayores', orden: 3,
      nota: 'Tercer nivel nacional.' },
    { id: 'FEDERAL_MENORES', label: 'Torneo Federal · formativas', orden: 4,
      nota: 'Formativas de alcance federal.' },
    { id: 'LOCAL_MAYORES', label: 'Liga local · mayores', orden: 5,
      nota: 'Torneos de asociación. Reconquista Primera y Deportivo.' },
    { id: 'LOCAL_MENORES', label: 'Liga local · formativas', orden: 6,
      nota: 'U21, U23 y menores de asociación.' },
  ];
  const IDS = NIVELES.map(n => n.id);
  const POR_DEFECTO = 'LOCAL_MAYORES';

  /* Los niveles para los que HAY libro con el que calibrar. Los otros
     tres no se pueden medir todavía, y eso se dice en vez de inventarles
     números: un umbral inventado se ve igual que uno medido. */
  const CALIBRADOS = ['LIGA_ARGENTINA', 'LOCAL_MAYORES', 'LOCAL_MENORES'];

  function nivel(id) {
    return NIVELES.filter(n => n.id === String(id || '').toUpperCase())[0] || null;
  }
  function esNivel(id) { return !!nivel(id); }
  function normalizarNivel(id) { return esNivel(id) ? String(id).toUpperCase() : POR_DEFECTO; }

  /* ===================================================================
     EL REGISTRO

     `tipo`       cómo se lee el umbral
     `valor`      solo en los absolutos
     `p`          el percentil que el umbral alcanza HOY en Liga Argentina
     `metrica`    contra qué columna se compara
     `dir`        'mayor' marca por encima · 'menor' marca por debajo
     `semillas`   el número por nivel. HOY todos iguales al valor viejo.
     `calibrado`  el equivalente MEDIDO por nivel. Todavía sin consumir.
     `clamp`      el rango observado en libros reales, para la etapa 4
     `medido`     la evidencia, para poder auditar de dónde salió
     =================================================================== */

  /* ===================================================================
     CUÁNTA MUESTRA HACE FALTA PARA CONFIAR EN LA LIGA

     Dos gates, y hacen falta los dos. Los PARTIDOS mandan sobre la
     estabilidad de las tasas por partido —una liga con muchos jugadores
     y dos fechas tiene promedios que se mueven solos— y los CALIFICADOS
     sobre la del percentil: la U21 tiene 49 calificados, así que un p90
     ahí son cinco jugadores y cualquier lesión lo corre.

     Entre el mínimo y el pleno se MEZCLA. Con un corte duro, el partido
     que cruza el umbral reetiqueta a media liga de un día para el otro y
     el DT ve cambiar las fichas sin que haya pasado nada.

     Los números son conservadores a propósito: es preferible seguir con
     la semilla del nivel —que está medida— que saltar a un percentil
     calculado sobre poca gente.
     =================================================================== */
  const MUESTRA = {
    minPartidos: 15,        // por debajo: semilla pura
    plenoPartidos: 40,      // por encima: la liga manda
    minCalificados: 30,     // un percentil sobre menos que esto es ruido
    plenoCalificados: 60,
  };

  const REGISTRO = {
    /* ---------------------------------------------------------------
       ABSOLUTOS · los tres que la medición respalda.
       NO SE TOCAN. Hay un test que falla si cambian de tipo o de valor.
       --------------------------------------------------------------- */
    pptTripleElite: {
      tipo: TIPOS.ABSOLUTO, valor: 1.20, metrica: 'PPT3', dir: 'mayor',
      medido: 'p88–p94 en cinco libros · brecha 6pp',
      porque: '1,20 puntos por triple intentado es caro en cualquier categoría.',
    },
    mezclaTripleInterior: {
      tipo: TIPOS.ABSOLUTO, valor: 0.12, metrica: 'T3I/(T3I+T2I)', dir: 'menor',
      medido: 'p10–p18 en cinco libros · brecha 8pp',
      porque: 'De dónde tira alguien no depende del nivel de la liga.',
    },
    mezclaTripleaPerimetral: {
      tipo: TIPOS.ABSOLUTO, valor: 0.30, metrica: 'T3I/(T3I+T2I)', dir: 'mayor',
      medido: 'p26–p37 en cinco libros · brecha 11pp',
      porque: 'Ídem: es selección de tiro, no rendimiento.',
    },

    /* ---------------------------------------------------------------
       RELATIVOS · se corren entre 8 y 45 puntos percentiles.
       --------------------------------------------------------------- */
    t1Pobre: {
      tipo: TIPOS.PERCENTIL, p: 15, metrica: 'T1%', dir: 'menor',
      base: 0.60,
      calibrado: { LIGA_ARGENTINA: 0.60, LOCAL_MAYORES: 0.48, LOCAL_MENORES: 0.38 },
      clamp: [0.38, 0.60],
      medido: 'p15 (LigaArg) … p60 (U23) · brecha 45pp — la peor del sistema',
    },
    t1Contacto: {
      tipo: TIPOS.PERCENTIL, p: 52, metrica: 'T1%', dir: 'mayor',
      base: 0.72,
      calibrado: { LIGA_ARGENTINA: 0.72, LOCAL_MAYORES: 0.65, LOCAL_MENORES: 0.56 },
      clamp: [0.56, 0.72],
      medido: 'p52 … p88 · brecha 36pp',
    },
    astPPGenerador: {
      tipo: TIPOS.PERCENTIL, p: 59, metrica: 'AST-PP', dir: 'mayor',
      base: 1.40,
      calibrado: { LIGA_ARGENTINA: 1.40, LOCAL_MAYORES: 0.89, LOCAL_MENORES: 0.79 },
      clamp: [0.79, 1.40],
      medido: 'p59 … p93 · brecha 34pp · «generador» pasa de 28% a 6% de la liga',
    },
    pptTripleFrio: {
      tipo: TIPOS.PERCENTIL, p: 35, metrica: 'PPT3', dir: 'menor',
      base: 0.88,
      calibrado: { LIGA_ARGENTINA: 0.88, LOCAL_MAYORES: 0.66, LOCAL_MENORES: 0.59 },
      clamp: [0.59, 0.88],
      medido: 'p35 … p67 · brecha 32pp',
    },
    pptTriplePobre: {
      tipo: TIPOS.PERCENTIL, p: 35, metrica: 'PPT3', dir: 'menor',
      base: 0.90,
      calibrado: { LIGA_ARGENTINA: 0.90, LOCAL_MAYORES: 0.66, LOCAL_MENORES: 0.59 },
      clamp: [0.59, 0.90],
      medido: 'p35 … p67 · brecha 32pp',
    },
    t3Frio: {
      tipo: TIPOS.PERCENTIL, p: 35, metrica: 'T3%', dir: 'menor',
      base: 0.30,
      calibrado: { LIGA_ARGENTINA: 0.30, LOCAL_MAYORES: 0.22, LOCAL_MENORES: 0.20 },
      clamp: [0.20, 0.30],
      medido: 'p35 … p67 · brecha 32pp',
    },
    minutosClave: {
      tipo: TIPOS.PERCENTIL, p: 13, metrica: 'MIN', dir: 'mayor',
      base: 20,
      calibrado: { LIGA_ARGENTINA: 20, LOCAL_MAYORES: 16.01, LOCAL_MENORES: 15.31 },
      clamp: [15.31, 20],
      medido: 'p13 … p42 · brecha 29pp',
    },
    pptDobleAlto: {
      tipo: TIPOS.PERCENTIL, p: 61, metrica: 'PPT2', dir: 'mayor',
      base: 1.10,
      calibrado: { LIGA_ARGENTINA: 1.10, LOCAL_MAYORES: 1.00, LOCAL_MENORES: 1.01 },
      clamp: [1.00, 1.10],
      medido: 'p61 … p84 · brecha 23pp',
    },
    t1Confiable: {
      tipo: TIPOS.PERCENTIL, p: 67, metrica: 'T1%', dir: 'mayor',
      base: 0.75,
      calibrado: { LIGA_ARGENTINA: 0.75, LOCAL_MAYORES: 0.69, LOCAL_MENORES: 0.64 },
      clamp: [0.64, 0.75],
      medido: 'p67 … p89 · brecha 22pp',
    },
    usoLibreContacto: {
      tipo: TIPOS.PERCENTIL, p: 72, metrica: 'PT1%', dir: 'mayor',
      base: 0.12,
      calibrado: { LIGA_ARGENTINA: 0.12, LOCAL_MAYORES: 0.14, LOCAL_MENORES: 0.12 },
      clamp: [0.12, 0.14],
      medido: 'p51 … p72 · brecha 21pp',
    },
    volumenTripleSistematico: {
      tipo: TIPOS.PERCENTIL, p: 31, metrica: 'T3I', dir: 'mayor',
      base: 2.50,
      calibrado: { LIGA_ARGENTINA: 2.50, LOCAL_MAYORES: 1.53, LOCAL_MENORES: 1.46 },
      clamp: [1.46, 2.50],
      medido: 'p31 … p51 · brecha 20pp',
    },
    usoLibreAlto: {
      tipo: TIPOS.PERCENTIL, p: 50, metrica: 'PT1%', dir: 'mayor',
      base: 0.10,
      calibrado: { LIGA_ARGENTINA: 0.10, LOCAL_MAYORES: 0.11, LOCAL_MENORES: 0.09 },
      clamp: [0.09, 0.11],
      medido: 'p41 … p61 · brecha 20pp',
    },
    rtlContacto: {
      tipo: TIPOS.PERCENTIL, p: 81, metrica: 'RTL%', dir: 'mayor',
      base: 0.28,
      calibrado: { LIGA_ARGENTINA: 0.28, LOCAL_MAYORES: 0.34, LOCAL_MENORES: 0.30 },
      clamp: [0.28, 0.34],
      medido: 'p63 … p82 · brecha 19pp',
    },
    pptTripleRentable: {
      tipo: TIPOS.PERCENTIL, p: 68, metrica: 'PPT3', dir: 'mayor',
      base: 1.05,
      calibrado: { LIGA_ARGENTINA: 1.05, LOCAL_MAYORES: 0.92, LOCAL_MENORES: 0.90 },
      clamp: [0.90, 1.05],
      medido: 'p68 … p87 · brecha 19pp',
    },
    t3Rentable: {
      tipo: TIPOS.PERCENTIL, p: 68, metrica: 'T3%', dir: 'mayor',
      base: 0.35,
      calibrado: { LIGA_ARGENTINA: 0.35, LOCAL_MAYORES: 0.31, LOCAL_MENORES: 0.30 },
      clamp: [0.30, 0.35],
      medido: 'p68 … p87 · brecha 19pp',
    },
    t1Regalable: {
      tipo: TIPOS.PERCENTIL, p: 3, metrica: 'T1%', dir: 'menor',
      base: 0.40,
      calibrado: { LIGA_ARGENTINA: 0.40, LOCAL_MAYORES: 0.36, LOCAL_MENORES: 0.20 },
      clamp: [0.20, 0.40],
      medido: 'p3 … p21 · brecha 19pp',
    },
    astVolumenGenerador: {
      tipo: TIPOS.PERCENTIL, p: 73, metrica: 'AST', dir: 'mayor',
      base: 2.50,
      calibrado: { LIGA_ARGENTINA: 2.50, LOCAL_MAYORES: 1.77, LOCAL_MENORES: 1.64 },
      clamp: [1.64, 2.50],
      medido: 'p73 … p91 · brecha 18pp',
    },
    usoDobleInterno: {
      tipo: TIPOS.PERCENTIL, p: 60, metrica: 'PT2%', dir: 'mayor',
      base: 0.45,
      calibrado: { LIGA_ARGENTINA: 0.45, LOCAL_MAYORES: 0.45, LOCAL_MENORES: 0.48 },
      clamp: [0.45, 0.48],
      medido: 'p49 … p64 · brecha 15pp',
    },
    frContacto: {
      tipo: TIPOS.PERCENTIL, p: 60, metrica: 'FR', dir: 'mayor',
      base: 2.50,
      calibrado: { LIGA_ARGENTINA: 2.50, LOCAL_MAYORES: 2.27, LOCAL_MENORES: 2.00 },
      clamp: [2.00, 2.50],
      medido: 'p60 … p74 · brecha 14pp',
    },
    usoTripleAlto: {
      tipo: TIPOS.PERCENTIL, p: 65, metrica: 'PT3%', dir: 'mayor',
      base: 0.40,
      calibrado: { LIGA_ARGENTINA: 0.40, LOCAL_MAYORES: 0.36, LOCAL_MENORES: 0.35 },
      clamp: [0.35, 0.40],
      medido: 'p65 … p78 · brecha 13pp',
    },

    /* ---------------------------------------------------------------
       RELATIVOS A LA MEDIANA · ya eran múltiplos de una referencia de
       liga, así que no tienen el problema de los de arriba. Se declaran
       para que el registro esté completo y para poder auditarlos.
       --------------------------------------------------------------- */
    reboteOfensivoAlto: {
      tipo: TIPOS.PERCENTIL, p: 68, metrica: 'RO% / mediana', dir: 'mayor',
      base: 1.30, calibrado: {}, clamp: [1.30, 1.30],
      medido: 'ya es un múltiplo de la mediana de calificados (punto 8)',
    },
    reboteInterior: {
      tipo: TIPOS.PERCENTIL, p: 62, metrica: 'RT / mediana', dir: 'mayor',
      base: 1.15, calibrado: {}, clamp: [1.15, 1.15],
      medido: 'ídem',
    },
    reboteDesempate: {
      tipo: TIPOS.PERCENTIL, p: 57, metrica: 'RT / mediana', dir: 'mayor',
      base: 1.10, calibrado: {}, clamp: [1.10, 1.10],
      medido: 'ídem',
    },
    perdidasAltas: {
      tipo: TIPOS.PERCENTIL, p: 70, metrica: 'PePP% / JUGADOR TIPO', dir: 'mayor',
      base: 1.25, calibrado: {}, clamp: [1.25, 1.25],
      medido: 'ya es un múltiplo de la referencia de liga',
    },
    concentracionAlta: {
      tipo: TIPOS.PERCENTIL, p: 88, metrica: 'PLAYS jugador / Σ plantel', dir: 'mayor',
      base: 0.15, calibrado: {}, clamp: [0.15, 0.15],
      medido: 'recalibrado en su momento contra la liga real: p88',
    },
    viaPrincipalTriple: {
      tipo: TIPOS.PERCENTIL, p: 60, metrica: 'T3I jugador / T3I equipo', dir: 'mayor',
      base: 0.25, calibrado: {}, clamp: [0.25, 0.25],
      medido: 'cuota dentro del propio equipo: no depende del nivel',
    },
  };

  /* ===================================================================
     LECTURA

     `valorDe` es el ÚNICO punto de entrada. Hoy devuelve la semilla del
     nivel —o el valor, si es absoluto— y nada más. La etapa 4 le agrega
     el warm-up, la mezcla y los clamps SIN que ningún consumidor cambie.
     =================================================================== */
  /* ===================================================================
     LA SEMILLA DE UN NIVEL

     Si el nivel tiene equivalente MEDIDO, se usa ése. Si no, se hereda
     del nivel calibrado más cercano en la escala —por eso `orden` no es
     decorativo— y recién si no hay ninguno se cae al literal histórico.

     Heredar del más cercano es mejor que caer al literal: FEDERAL_MENORES
     se parece mucho más a LOCAL_MENORES que a Liga Argentina, y el
     literal ES el de Liga Argentina.
     =================================================================== */
  function ordenDe(id) {
    const n = nivel(id);
    return n ? n.orden : 99;
  }

  function semillaDe(clave, nivelId) {
    const d = REGISTRO[clave];
    if (!d) return null;
    if (d.tipo === TIPOS.ABSOLUTO) return d.valor;
    const n = normalizarNivel(nivelId);
    const cal = d.calibrado || {};
    if (typeof cal[n] === 'number') return cal[n];

    /* El calibrado más cercano en la escala. */
    const mio = ordenDe(n);
    let mejor = null, dist = Infinity;
    CALIBRADOS.forEach(id => {
      if (typeof cal[id] !== 'number') return;
      const dd = Math.abs(ordenDe(id) - mio);
      if (dd < dist) { dist = dd; mejor = cal[id]; }
    });
    if (mejor !== null) return mejor;
    return (typeof d.base === 'number') ? d.base : null;
  }

  /** Percentil `p` de una muestra. Devuelve null sin datos. */
  function percentilDe(valores, p) {
    const a = (valores || []).filter(v => typeof v === 'number' && isFinite(v))
      .sort((x, y) => x - y);
    if (!a.length) return null;
    const i = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * a.length) - 1));
    return a[i];
  }

  /** 0 = semilla pura · 1 = la liga manda · en el medio, se mezcla. */
  function factorMezcla(partidos, n) {
    const tramo = (v, min, pleno) => {
      if (!(typeof v === 'number') || v <= min) return 0;
      if (v >= pleno) return 1;
      return (v - min) / (pleno - min);
    };
    /* El MENOR de los dos: hacen falta las dos condiciones, no una. */
    return Math.min(
      tramo(partidos, MUESTRA.minPartidos, MUESTRA.plenoPartidos),
      tramo(n, MUESTRA.minCalificados, MUESTRA.plenoCalificados));
  }

  /* ===================================================================
     EL UMBRAL VIGENTE

     `contexto` = { nivel, valores, partidos }
       `valores`  la métrica de ESTE umbral sobre los calificados de la
                  competencia activa. Quien llama la extrae, porque es el
                  único que sabe leer el índice.

     LOS CLAMPS SON LA PIEZA QUE DA SENTIDO. Sin ellos, el sistema es
     puramente auto-referencial: toda liga tendría exactamente un 10% de
     «tiradores de élite», incluida una donde nadie convierte, y la
     etiqueta pasaría a decir «de los peores, el mejor». Con el clamp, el
     nivel deja de ser una semilla y pasa a ser el ancla de significado.
     =================================================================== */
  function umbralVigente(clave, contexto) {
    const d = REGISTRO[clave];
    if (!d) return null;
    const c = contexto || {};
    const n = normalizarNivel(c.nivel);

    if (d.tipo === TIPOS.ABSOLUTO) {
      return { clave, valor: d.valor, origen: 'absoluto', nivel: n,
               tipo: d.tipo, metrica: d.metrica, mezcla: 0,
               muestra: { partidos: c.partidos || 0, n: (c.valores || []).length } };
    }

    const semilla = semillaDe(clave, n);
    const vals = c.valores || [];
    const f = factorMezcla(c.partidos, vals.length);
    const base = { clave, nivel: n, tipo: d.tipo, metrica: d.metrica,
                   semilla: semilla,
                   muestra: { partidos: c.partidos || 0, n: vals.length } };

    if (f <= 0) return Object.assign(base, { valor: semilla, origen: 'tier', mezcla: 0 });

    const crudo = (typeof d.p === 'number') ? percentilDe(vals, d.p) : null;
    if (crudo === null) {
      /* Hay muestra en cantidad pero no en esta métrica: no se inventa. */
      return Object.assign(base, { valor: semilla, origen: 'tier', mezcla: 0,
                                   nota: 'sin valores de ' + d.metrica });
    }

    const vivo = acotar(crudo, d.clamp);
    const valor = (f >= 1) ? vivo : (semilla + (vivo - semilla) * f);
    return Object.assign(base, {
      valor: valor,
      origen: f >= 1 ? 'vivo' : 'mezcla',
      mezcla: Math.round(f * 100) / 100,
      vivo: vivo,
      vivoSinAcotar: crudo,
      acotado: crudo !== vivo,
    });
  }

  function acotar(v, clamp) {
    if (!clamp || clamp.length !== 2) return v;
    return Math.min(Math.max(v, clamp[0]), clamp[1]);
  }

  /**
   * El mapa resuelto para una competencia. `leer(clave)` devuelve los
   * valores de esa métrica sobre los calificados; lo provee quien llama
   * porque es el único que sabe leer el índice.
   */
  function mapaVigente(contexto, leer) {
    const out = {}, detalle = {};
    claves().forEach(k => {
      const vals = (typeof leer === 'function') ? (leer(k) || []) : [];
      const r = umbralVigente(k, Object.assign({}, contexto, { valores: vals }));
      out[k] = r ? r.valor : null;
      detalle[k] = r;
    });
    Object.defineProperty(out, '__detalle', { value: detalle, enumerable: false });
    return out;
  }

  /* ===================================================================
     DE DÓNDE SALE EL NIVEL DE UNA CATEGORÍA

     Cascada, igual que las zonas: lo publicado en KV gana sobre el JSON
     del repo, y sin nada declarado se cae al por defecto DICIÉNDOLO. No
     se infiere del campo `liga`: ése distingue La Plata de Liga
     Argentina pero NO mayores de formativas, que es justo el corte que
     importa.

     El puente entre los dos mundos es el `slug` de la planilla: el JSON
     del club la indexa por `id` y el catálogo del servidor por `slug`.
     =================================================================== */
  function nivelDeCategoria(planilla, clubKV) {
    const pl = planilla || {};
    /* 1 · lo publicado en KV, buscado por slug */
    if (clubKV && Array.isArray(clubKV.categorias) && pl.slug) {
      const c = clubKV.categorias.filter(x => x && x.slug === pl.slug)[0];
      if (c && esNivel(c.nivel)) {
        return { nivel: normalizarNivel(c.nivel), origen: 'kv' };
      }
    }
    /* 2 · lo declarado en clubes/<club>.json */
    if (esNivel(pl.nivel)) return { nivel: normalizarNivel(pl.nivel), origen: 'json' };
    /* 3 · el por defecto, y se dice que es un default */
    return { nivel: POR_DEFECTO, origen: 'defecto' };
  }

  function definicion(clave) { return REGISTRO[clave] || null; }
  function claves() { return Object.keys(REGISTRO); }

  /**
   * EL LITERAL HISTÓRICO, sin nivel ni liga.
   *
   * Es el respaldo de `JUGADORES_UMBRALES`, el mapa estático que se usa
   * cuando no hay índice del que sacar la liga. Tiene que seguir siendo
   * el valor de SIEMPRE —el de Liga Argentina— porque es contra ése que
   * se escribieron todas las reglas que lo leen sin contexto.
   *
   * Resolverlo al nivel por defecto sería un cambio silencioso: scouting
   * lee ese mapa por `COMPARTIDOS` y sus reglas empezarían a disparar
   * con otra vara sin que nadie lo pidiera.
   */
  function baseDe(clave) {
    const d = REGISTRO[clave];
    if (!d) return null;
    if (d.tipo === TIPOS.ABSOLUTO) return d.valor;
    return (typeof d.base === 'number') ? d.base : null;
  }

  /** La semilla del nivel, sin liga viva. Es lo que se usa en warm-up. */
  function valorDe(clave, nivelId) { return semillaDe(clave, nivelId); }

  /**
   * El mapa entero para un nivel, que es lo que consumen los módulos de
   * etiquetas. Devolver el mapa completo —y no un getter por clave— evita
   * que cada regla tenga que acordarse de pedir el nivel.
   */
  function mapaDe(nivelId) {
    const o = {};
    claves().forEach(k => { o[k] = valorDe(k, nivelId); });
    return o;
  }

  /**
   * De dónde salió el número. Sin esto, un umbral que se movió solo es
   * indistinguible de un bug — es la misma regla que ya cumplen
   * `refRebote` y el `nivel` del grupo de pares.
   */
  function procedencia(clave, nivelId) {
    const d = REGISTRO[clave];
    if (!d) return null;
    const n = normalizarNivel(nivelId);
    return {
      clave: clave,
      valor: valorDe(clave, n),
      tipo: d.tipo,
      nivel: n,
      /* En la etapa 4 esto pasa a ser 'vivo' o 'mezcla' cuando la liga
         tenga muestra suficiente. Hoy siempre sale de la tabla. */
      origen: d.tipo === TIPOS.ABSOLUTO ? 'absoluto' : 'tier',
      metrica: d.metrica || null,
      calibradoDisponible: !!(d.calibrado && d.calibrado[n] !== undefined),
    };
  }

  return {
    TIPOS, NIVELES, IDS, POR_DEFECTO, CALIBRADOS, REGISTRO,
    nivel, esNivel, normalizarNivel,
    definicion, claves, valorDe, mapaDe, procedencia,
    MUESTRA, semillaDe, percentilDe, factorMezcla, acotar,
    baseDe,
    nivelDeCategoria,
    umbralVigente, mapaVigente,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_NIVELES;
