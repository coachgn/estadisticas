/* =====================================================================
   SGADD · Detalle PARTIDO A PARTIDO

   Ruta: #/<planilla>/<fase>/equipos/<equipo>/partidos/<idPartido>

   Contenido:
     1. Cabecera con marcador (hook de cuartos, desactivado hasta que las
        columnas existan)
     2. 📌 Insight del partido: 3 claves, 3 grietas, recomendación
     3. 4 Factores enfrentados
     4. Box scores con desvíos contra el promedio de cada jugador

   DECISIÓN CENTRAL: los desvíos se miden en unidades de desvío estándar
   DEL PROPIO JUGADOR, no contra un umbral fijo. 20 puntos es una noche
   normal para uno y un pico histórico para otro.
   ===================================================================== */

const SGADD_PARTIDO = (function () {
  'use strict';

  /* z >= 1.5 → rendimiento atípico. Por debajo es variación normal. */
  const Z_ATIPICO = 1.5;
  const MIN_PARTIDOS_JUGADOR = 3;   // menos que esto, no hay desvío confiable
  const MIN_MINUTOS = 8;            // por debajo, los porcentajes son ruido

  /* Métricas del equipo a contrastar contra su propio promedio. */
  const CONTRASTE_EQUIPO = [
    { k: 'eFG%',  label: 'eFG%',            umbral: 0.030, cuerpo: 'la eficiencia de tiro' },
    { k: 'T3%',   label: 'T3%',             umbral: 0.050, cuerpo: 'el triple' },
    { k: 'T2%',   label: 'T2%',             umbral: 0.045, cuerpo: 'el tiro de dos' },
    { k: 'T1%',   label: 'T1%',             umbral: 0.070, cuerpo: 'el tiro libre' },
    { k: 'PePP%', label: 'pérdidas',        umbral: 0.025, cuerpo: 'el cuidado del balón', invertida: true },
    { k: 'RO%',   label: 'rebote ofensivo', umbral: 0.040, cuerpo: 'el rebote ofensivo' },
    { k: 'AST%',  label: 'canastas asistidas', umbral: 0.050, cuerpo: 'la circulación' },
    { k: 'RTL%',  label: 'ratio de libres', umbral: 0.040, cuerpo: 'la búsqueda de contacto' },
  ];

  /* Columnas del box score. */
  /* PLAYS entre PTS y T2C: dice cuántas posesiones usó cada jugador, que es
     el contexto que le falta a los puntos sueltos. VAL sale: es un índice
     compuesto que ya está resumido en el resto de las columnas. */
  /* `+/-` va ÚLTIMO y no entre PTS y PLAYS: no es producción del jugador,
     es cómo le fue al equipo con él adentro. Si la planilla todavía no la
     trae (Reconquista hoy), la columna sale con "—" y no rompe nada.
     OJO: NO existe fila de totales de esta columna. El +/- del equipo es el
     margen del partido (SGADD.masMenosEquipo), nunca la suma de los cinco. */
  const COLS_BOX = ['MIN', 'PTS', 'PLAYS', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I',
                    'RT', 'AST', 'PR', 'PP', '+/-'];

  /* En cuáles marcamos desvío. Contar rebotes de un partido contra el
     promedio tiene sentido; el T3% de 2 intentos, no. */
  const COLS_DESVIO = ['PTS', 'RT', 'AST', 'PLAYS'];

  /* ---------------------------------------------------------------------
     MÉTRICAS AVANZADAS DEL PARTIDO

     Se leen de las columnas de la planilla cuando existen, y solo se
     recalculan si faltan. Verificado contra un partido real: la fórmula
     POS = TCI + PP + 0,44 × T1I − RO reproduce la columna al centésimo.

     ORTG y DRTG van por 100 POSESIONES (POS = PLAYS − RO), norma CAB/FIBA
     y punto 66: la misma vara que el resto del panel. La planilla los trae
     por 100 PLAYS en su columna RTNG, y esa columna ya no se muestra. El
     PPP sigue por PLAY, que es lo único que se mide así.
     --------------------------------------------------------------------- */
  function avanzadas(lado, rival) {
    if (!lado) return null;
    const f = lado.fila, g = rival ? rival.fila : null;
    const n = k => (typeof f[k] === 'number' && isFinite(f[k])) ? f[k] : null;
    const nr = k => (g && typeof g[k] === 'number' && isFinite(g[k])) ? g[k] : null;

    const pos = n('POS') !== null ? n('POS')
      : ((n('TCI') || 0) + (n('PP') || 0) + 0.44 * (n('T1I') || 0) - (n('RO') || 0));
    const plays = n('PLAYS');
    const pts = n('PTS');
    const ptsOpp = n('PTSopp') !== null ? n('PTSopp') : nr('PTS');
    const playsOpp = n('PLAYSopp') !== null ? n('PLAYSopp') : nr('PLAYS');
    /* Las posesiones del rival: su propia columna si la fila del otro lado
       del cruce la trae, y si no PLAYSopp − ROopp, que es su definición. */
    const roOpp = n('ROopp') !== null ? n('ROopp') : nr('RO');
    const posOpp = (nr('POS') !== null && nr('POS') > 0) ? nr('POS')
      : ((playsOpp !== null && roOpp !== null) ? playsOpp - roOpp : null);

    const div = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0) ? a / b : null;

    return {
      pace: n('PACE'),
      pos: pos,
      plays: plays,
      /* Por 100 POSESIONES; el PPP que va debajo sigue por PLAY. */
      ortg: div(pts, pos) !== null ? div(pts, pos) * 100 : null,
      drtg: div(ptsOpp, posOpp) !== null ? div(ptsOpp, posOpp) * 100 : null,
      ppp: div(pts, plays),
    };
  }

  /* ---------------------------------------------------------------------
     ANÁLISIS
     --------------------------------------------------------------------- */

  /** Desvíos de cada jugador de un lado, contra su propio promedio. */
  function desviosLado(idx, lado) {
    return lado.box.map(j => {
      const min = j['MIN'];
      const fiable = typeof min === 'number' && min >= MIN_MINUTOS;
      const marcas = {};
      let mayor = null;

      COLS_DESVIO.forEach(k => {
        const st = idx.statJugador(j.__clave, k);
        const v = j[k];
        if (!st || st.n < MIN_PARTIDOS_JUGADOR || typeof v !== 'number' || !st.desvio) return;
        const z = (v - st.media) / st.desvio;
        const delta = v - st.media;
        marcas[k] = { z: z, delta: delta, media: st.media, atipico: Math.abs(z) >= Z_ATIPICO, n: st.n };
        if (fiable && Math.abs(z) >= Z_ATIPICO && (!mayor || Math.abs(z) > Math.abs(mayor.z))) {
          mayor = { clave: k, z: z, delta: delta, media: st.media, valor: v };
        }
      });

      return { fila: j, marcas: marcas, destacado: mayor, fiable: fiable };
    });
  }

  /** Contraste del partido contra el promedio de temporada del equipo. */
  function contrasteEquipo(idx, lado) {
    const e = lado.equipo;
    const f = lado.fila;

    /* Ratios de ESTE partido, calculados sobre sus propios totales. */
    const div = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0) ? a / b : null;
    const tcc = f['TCC'], tci = f['TCI'], t3c = f['T3C'];
    const delPartido = {
      'eFG%': div((tcc || 0) + 0.5 * (t3c || 0), tci),
      'T3%': div(f['T3C'], f['T3I']),
      'T2%': div(f['T2C'], f['T2I']),
      'T1%': div(f['T1C'], f['T1I']),
      'PePP%': div(f['PP'], f['PLAYS']),
      'RO%': (lado.rivalFila) ? div(f['RO'], (f['RO'] || 0) + (lado.rivalFila['RD'] || 0)) : null,
      'AST%': div(f['AST'], f['TCC']),
      'RTL%': div(f['T1C'], f['TCI']),
    };

    return CONTRASTE_EQUIPO.map(c => {
      const v = delPartido[c.k];
      const r = idx.leer(e.clave, c.k);
      const hab = r ? r.valor : null;
      if (v === null || hab === null || hab === undefined) return null;
      const dif = v - hab;
      const aFavor = c.invertida ? dif < 0 : dif > 0;
      return {
        clave: c.k, label: c.label, cuerpo: c.cuerpo, invertida: !!c.invertida,
        partido: v, habitual: hab, dif: dif, magnitud: Math.abs(dif),
        relevante: Math.abs(dif) >= c.umbral, aFavor: aFavor,
      };
    }).filter(Boolean).sort((a, b) => b.magnitud - a.magnitud);
  }

  /**
   * Analiza el partido completo desde la mirada del equipo `propio`.
   */
  function analizar(idx, part, ladoPropio) {
    if (!part || !ladoPropio) return null;
    const rival = part.lados.find(l => l !== ladoPropio) || null;
    ladoPropio.rivalFila = rival ? rival.fila : null;
    if (rival) rival.rivalFila = ladoPropio.fila;

    const contraste = contrasteEquipo(idx, ladoPropio);
    const claves = contraste.filter(c => c.relevante && c.aFavor).slice(0, 3);
    const grietas = contraste.filter(c => c.relevante && !c.aFavor).slice(0, 3);

    const propios = desviosLado(idx, ladoPropio);
    const rivales = rival ? desviosLado(idx, rival) : [];

    const gano = SGADD.texto(ladoPropio.fila['RESULTADO']).toUpperCase() === 'GANADO';

    return {
      gano: gano, rival: rival, contraste: contraste,
      avanzadas: avanzadas(ladoPropio, rival),
      avanzadasRival: rival ? avanzadas(rival, ladoPropio) : null,
      claves: claves, grietas: grietas,
      propios: propios, rivales: rivales,
      jugadores: ajusteJugadores(propios, rivales),
      texto: narrar(ladoPropio, rival, gano, claves, grietas),
      recomendacion: recomendar(gano, claves, grietas, propios, rivales, rival),
    };
  }

  const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%';
  const signo = v => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',');

  function narrar(propio, rival, gano, claves, grietas) {
    const partes = [];
    const pf = propio.fila['PTS'], pc = rival ? rival.fila['PTS'] : propio.fila['PTSopp'];
    const dif = (typeof pf === 'number' && typeof pc === 'number') ? pf - pc : null;

    partes.push((gano ? 'Ganó' : 'Perdió') + ' ' + (pf || 0) + '-' + (pc || 0) +
      (dif !== null ? ' (' + (dif > 0 ? '+' : '') + dif + ')' : '') +
      ' de ' + SGADD.texto(propio.fila['CONDICION']).toLowerCase() + '.');

    if (claves.length) {
      const c = claves[0];
      partes.push('Lo que se salió de lo habitual a favor: ' + c.cuerpo + ', ' + pct(c.partido) +
        ' contra ' + pct(c.habitual) + ' de promedio' +
        (claves.length > 1 ? '; también ' + claves.slice(1).map(x => x.cuerpo).join(' y ') + '.' : '.'));
    }
    if (grietas.length) {
      const g = grietas[0];
      partes.push('Lo que falló: ' + g.cuerpo + ', ' + pct(g.partido) +
        ' contra ' + pct(g.habitual) + ' habitual' +
        (grietas.length > 1 ? '; sumado a ' + grietas.slice(1).map(x => x.cuerpo).join(' y ') + '.' : '.'));
    }
    if (!claves.length && !grietas.length) {
      partes.push('El equipo jugó dentro de sus números habituales: la diferencia estuvo en el rival ' +
        'o en el cierre, no en un cambio de su propio rendimiento.');
    }
    return partes;
  }

  /** Quién se salió de su promedio, de los dos lados. */
  function ajusteJugadores(propios, rivales) {
    const orden = (a, b) => Math.abs(b.destacado.z) - Math.abs(a.destacado.z);
    const conDest = l => l.filter(x => x.destacado && x.fiable).sort(orden);
    const p = conDest(propios), r = conDest(rivales);
    return {
      propiosArriba: p.filter(x => x.destacado.z > 0).slice(0, 3),
      propiosAbajo: p.filter(x => x.destacado.z < 0).slice(0, 3),
      rivalesArriba: r.filter(x => x.destacado.z > 0).slice(0, 3),
      rivalesAbajo: r.filter(x => x.destacado.z < 0).slice(0, 3),
    };
  }

  const nombreCorto = (j) => {
    const n = SGADD.texto(j['NOMBRES']);
    const c = n.split(',');
    return c.length > 1 ? c[0].trim() : n;
  };

  function recomendar(gano, claves, grietas, propios, rivales, rival) {
    const aj = ajusteJugadores(propios, rivales);
    const sostener = [], corregir = [], vigilar = [];

    if (gano) {
      claves.slice(0, 2).forEach(c => sostener.push('Sostener ' + c.cuerpo + ' (' + pct(c.partido) + '): fue lo que inclinó el partido.'));
      if (claves.length && claves[0].magnitud > 0.08) {
        sostener.push('Ojo: ' + claves[0].cuerpo + ' estuvo muy por encima de lo habitual. ' +
          'Si vuelve a su nivel normal, el margen desaparece.');
      }
    } else {
      grietas.slice(0, 2).forEach(g => corregir.push('Corregir ' + g.cuerpo + ': ' + pct(g.partido) +
        ' contra ' + pct(g.habitual) + ' habitual.'));
    }
    if (!sostener.length && !corregir.length) {
      (gano ? sostener : corregir).push('No hubo un factor que se despegara: el plan de juego funcionó como siempre.');
    }

    aj.rivalesArriba.forEach(x => vigilar.push(nombreCorto(x.fila) + ' hizo ' +
      SGADD.formatear(x.destacado.clave, x.destacado.valor) + ' ' + x.destacado.clave +
      ' (' + signo(x.destacado.delta) + ' sobre su promedio). Es el que más daño hizo.'));

    if (rival && !vigilar.length) {
      const top = rivales.slice().sort((a, b) => (b.fila['PTS'] || 0) - (a.fila['PTS'] || 0))[0];
      if (top) vigilar.push(nombreCorto(top.fila) + ' fue su máximo anotador con ' +
        (top.fila['PTS'] || 0) + ' puntos, dentro de su promedio.');
    }

    return {
      sostener: sostener, corregir: corregir, vigilar: vigilar,
      potenciar: aj.propiosAbajo.map(x => nombreCorto(x.fila) + ' quedó ' + signo(x.destacado.delta) +
        ' en ' + x.destacado.clave + ' respecto de su promedio: hay margen ahí.'),
      destacados: aj.propiosArriba.map(x => nombreCorto(x.fila) + ' rindió ' + signo(x.destacado.delta) +
        ' sobre su promedio en ' + x.destacado.clave + '.'),
    };
  }

  /* =====================================================================
     PERFIL DE TIRO DEL PARTIDO

     Contesta tres preguntas de una sola vez, que es lo que pidió el club:

       1. ¿Cómo repartió los lanzamientos?  → el TOTAL de intentos por zona
       2. ¿Cuántos metió y cuántos erró?    → convertidos / errados
       3. ¿Con qué efectividad?             → la proporción, contra la liga

     La referencia de liga NO va como una barra aparte: va como el número de
     tiros que la MEDIANA de la liga habría convertido con esos MISMOS
     intentos (`convLiga = intentos × %liga`). Así se lee de un vistazo si
     la parte convertida quedó por encima o por debajo de esa marca, sin
     tener que comparar dos barras de alturas distintas.

     Las tres zonas son las del box score y no se derivan una de otra: T2 y
     T3 son tiros de campo, T1 son libres, y un partido puede tener 40
     intentos de 2 con 8 libres. Mezclarlas escondería justamente la
     selección de tiro.
     ===================================================================== */

  const ZONAS_TIRO = [
    { id: 'T2', label: '2 puntos', conv: 'T2C', int: 'T2I', pctLiga: 'T2%' },
    { id: 'T3', label: '3 puntos', conv: 'T3C', int: 'T3I', pctLiga: 'T3%' },
    { id: 'T1', label: 'Libres',   conv: 'T1C', int: 'T1I', pctLiga: 'T1%' },
  ];

  /**
   * Perfil de tiro de UN lado del partido.
   *
   * `tipoLiga` es la fila EQUIPO TIPO de la liga (`idx.liga.tipo`); si no
   * viene, o si no trae el porcentaje de una zona, esa zona sale sin marca
   * de referencia en vez de con una inventada — misma regla que el resto
   * del proyecto: un dato ausente se muestra ausente.
   *
   * Devuelve `null` si el lado no registró un solo lanzamiento: un gráfico
   * de tiro con todo en cero no informa nada.
   */
  function perfilTiro(lado, tipoLiga) {
    if (!lado || !lado.fila) return null;
    const f = lado.fila;
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
    const tipo = tipoLiga || {};

    const zonas = ZONAS_TIRO.map(z => {
      const intentos = num(f[z.int]);
      const convertidos = num(f[z.conv]);
      if (intentos === null || convertidos === null || intentos <= 0) {
        return { id: z.id, label: z.label, intentos: intentos || 0, convertidos: 0,
                 errados: 0, pct: null, pctLiga: null, convLiga: null, delta: null };
      }
      const pct = convertidos / intentos;
      const pl = num(tipo[z.pctLiga]);
      return {
        id: z.id,
        label: z.label,
        intentos: intentos,
        convertidos: convertidos,
        errados: Math.max(0, intentos - convertidos),
        pct: pct,
        pctLiga: pl,
        /* Cuántos habría convertido la liga con estos mismos intentos: es
           la marca que corta la barra. */
        convLiga: pl === null ? null : intentos * pl,
        delta: pl === null ? null : pct - pl,
      };
    });

    const totalIntentos = zonas.reduce((s, z) => s + z.intentos, 0);
    if (!totalIntentos) return null;

    return {
      zonas: zonas,
      totalIntentos: totalIntentos,
      totalConvertidos: zonas.reduce((s, z) => s + z.convertidos, 0),
      /* Reparto de la selección de tiro, para el texto que acompaña. */
      reparto: zonas.map(z => ({ id: z.id, cuota: z.intentos / totalIntentos })),
      /* La zona donde más se despegó de la liga, para arriba o para abajo.
         Se mide sobre el DELTA de porcentaje y no sobre los tiros de más,
         porque tres triples extra convertidos pesan distinto que tres
         libres. Solo cuenta si hubo volumen: con 2 intentos, un acierto
         mueve el porcentaje 50 puntos y no dice nada. */
      destacada: zonas
        .filter(z => z.delta !== null && z.intentos >= MIN_INTENTOS_ZONA)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null,
    };
  }

  /** Con menos intentos que esto, el porcentaje de una zona es ruido. */
  const MIN_INTENTOS_ZONA = 5;

  /* =====================================================================
     QUÉ DECIDIÓ EL PARTIDO (punto 156, v330)

     Pasa del texto plano a tarjetas con NOMBRES y números del box score.
     Todo sale de lo que la planilla trae; lo que no trae no se escribe:

       · NO HAY TIPO DE JUGADA ni posición. «Presión que secó la línea de
         pases» o «pivote» serían afirmaciones sin dato. Se dice quién hizo
         qué y con cuánto, y las lecturas van marcadas como lectura.
       · El factor que decide es el de mayor IMPACTO: la diferencia entre
         los dos equipos por el peso de Dean Oliver (40 · 25 · 20 · 15), que
         es el mismo prior que usa el Simulador.
       · Cada factor se contrasta contra el HABITUAL del equipo (su promedio
         de temporada) y contra la mediana de la liga, nunca contra un número
         fijo.
     ===================================================================== */
  const FACTORES_PARTIDO = [
    { k: 'eFG%', hab: 'eFG%', label: 'Tiro de campo', corto: 'eFG%', peso: 40, inv: false },
    { k: 'PP%', hab: 'PePP%', label: 'Pérdidas', corto: 'TOV%', peso: 25, inv: true },
    { k: 'RO%', hab: 'RO%', label: 'Rebote ofensivo', corto: 'RO%', peso: 20, inv: false },
    { k: 'RTL%', hab: 'RTL%', label: 'Libres', corto: 'RTL%', peso: 15, inv: false },
  ];
  const UMBRAL_FACTOR = { 'eFG%': 0.03, 'PePP%': 0.025, 'RO%': 0.04, 'RTL%': 0.04 };

  const nz = (j, k) => { const v = j ? j[k] : null; return (typeof v === 'number' && isFinite(v)) ? v : 0; };
  const titulo = (s) => String(s || '').trim().toLowerCase().replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
  const quien = (j) => titulo(nombreCorto(j));
  const p1 = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %';
  const pp1 = (v) => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1).replace('.', ',') + ' pp';
  /** El de más `k` de una lista de filas de box (con minutos), o null si nadie llega al mínimo. */
  function lider(box, k, minimo) {
    const l = (box || []).filter(j => nz(j, 'MIN') > 0 || nz(j, 'PTS') > 0)
      .slice().sort((a, b) => nz(b, k) - nz(a, k) || nz(b, 'PTS') - nz(a, 'PTS'));
    return l.length && nz(l[0], k) >= (minimo || 1) ? l[0] : null;
  }

  /** Los 4 factores de la noche, de los dos lados, contra el habitual y la liga. */
  function factoresPartido(idx, propio, riv) {
    if (!propio || !riv || !propio.factores || !riv.factores) return [];
    return FACTORES_PARTIDO.map((f) => {
      const v = propio.factores[f.k], vr = riv.factores[f.k];
      if (typeof v !== 'number' || typeof vr !== 'number') return null;
      const lp = idx.leer(propio.equipo.clave, f.hab), lr = idx.leer(riv.equipo.clave, f.hab);
      const habP = lp && typeof lp.valor === 'number' ? lp.valor : null;
      const habR = lr && typeof lr.valor === 'number' ? lr.valor : null;
      const mejor = f.inv ? vr - v : v - vr;                    // > 0: lo ganó el propio
      const umbral = UMBRAL_FACTOR[f.hab];
      const desvioP = habP === null ? null : (f.inv ? habP - v : v - habP);   // > 0: mejor que su habitual
      const desvioR = habR === null ? null : (f.inv ? habR - vr : vr - habR);
      return {
        k: f.k, hab: f.hab, label: f.label, corto: f.corto, peso: f.peso, inv: f.inv,
        propio: v, rival: vr, habitual: habP, habitualRival: habR,
        liga: lp && typeof lp.tipo === 'number' ? lp.tipo : null,
        gano: mejor > 0 ? true : mejor < 0 ? false : null,
        impacto: mejor * f.peso,
        desvioPropio: desvioP, desvioRival: desvioR,
        /* Crítico: se perdió el factor Y quedó claramente bajo lo habitual. */
        critico: mejor < 0 && desvioP !== null && desvioP <= -umbral,
        /* Superior: se ganó el factor Y quedó claramente sobre lo habitual. */
        superior: mejor > 0 && desvioP !== null && desvioP >= umbral,
        defensaSuperior: desvioR !== null && desvioR <= -umbral,   // el rival quedó bajo su habitual
      };
    }).filter(Boolean);
  }

  /** Quién hizo lo que inclinó un factor: nombre y número, solo del box. */
  function responsableFactor(f, lp, lr) {
    const gP = f.gano === true;
    const ganador = gP ? lp : lr, perdedor = gP ? lr : lp;
    const cuya = gP ? 'propio' : 'del rival';
    if (f.k === 'eFG%') {
      const a = lider(ganador.box, 'PTS', 6), t = lider(ganador.box, 'T3C', 3);
      const partes = [];
      if (a) partes.push(quien(a) + ' ' + nz(a, 'PTS') + ' pts (' + (nz(a, 'T2C') + nz(a, 'T3C')) + '/' + (nz(a, 'T2I') + nz(a, 'T3I')) + ' en tiros de campo)');
      if (t && t !== a) partes.push(quien(t) + ' ' + nz(t, 'T3C') + ' triples de ' + nz(t, 'T3I'));
      else if (t) partes.push(nz(t, 'T3C') + ' triples de ' + nz(t, 'T3I'));
      return { nombres: [a, t].filter(Boolean).map(quien), texto: partes.join('; ') };
    }
    if (f.k === 'PP%') {
      const pierde = lider(perdedor.box, 'PP', 3), roba = lider(ganador.box, 'PR', 3);
      const partes = [];
      if (pierde) partes.push(quien(pierde) + ' perdió ' + nz(pierde, 'PP') + ' pelotas');
      if (roba) partes.push(quien(roba) + ' recuperó ' + nz(roba, 'PR'));
      return { nombres: [pierde, roba].filter(Boolean).map(quien), texto: partes.join('; ') };
    }
    if (f.k === 'RO%') {
      const ro = lider(ganador.box, 'RO', 2) || lider(ganador.box, 'RT', 6);
      const k = lider(ganador.box, 'RO', 2) ? 'RO' : 'RT';
      return { nombres: ro ? [quien(ro)] : [], texto: ro ? quien(ro) + ' tomó ' + nz(ro, k) + (k === 'RO' ? ' rebotes ofensivos' : ' rebotes') : '' };
    }
    const li = lider(ganador.box, 'T1I', 4);
    return { nombres: li ? [quien(li)] : [], texto: li ? quien(li) + ' fue ' + nz(li, 'T1I') + ' veces a la línea (' + nz(li, 'T1C') + ' convertidos)' : '', cuya: cuya };
  }

  /**
   * El Simulador contra lo que pasó. Ojo: el modelo se arma con la
   * temporada COMPLETA, este partido incluido, así que NO es una predicción
   * previa: es qué margen daban los ratings de las dos y cuánto se alejó
   * la noche. Sin simulador o sin partidos suficientes, null.
   */
  function proyeccionPartido(idx, propio, riv, gano) {
    try {
      let S = typeof SGADD_4F !== 'undefined' ? SGADD_4F : null;
      if (!S && typeof require === 'function') S = require('./sgadd-4factores.js');
      if (!S || !S.simularEnfrentamiento) return null;
      const esLocal = SGADD.texto(propio.fila['CONDICION']).toUpperCase() === 'LOCAL';
      const r = esLocal ? S.simularEnfrentamiento(idx, propio.equipo.clave, riv.equipo.clave, { n: 2000 })
        : S.simularEnfrentamiento(idx, riv.equipo.clave, propio.equipo.clave, { n: 2000 });
      if (!r || !r.ok) return null;
      const margenModelo = esLocal ? r.margen : -r.margen;
      const probPropio = esLocal ? r.confianza : 1 - r.confianza;
      const real = nz(propio.fila, 'PTS') - nz(riv.fila, 'PTS');
      return { margenModelo, margenReal: real, desvio: real - margenModelo, probPropio, gano,
        factorClave: r.factorClave ? r.factorClave.label : null };
    } catch (e) { return null; }
  }

  /**
   * Qué decidió el partido: tarjetas con nombres, los focos a sostener y
   * el plan de ajuste. `a` es lo que devuelve `analizar`.
   */
  function decision(idx, lp, lr, a) {
    if (!lp || !lr || !a) return null;
    const factores = factoresPartido(idx, lp, lr);
    const tarjetas = [];
    const margen = nz(lp.fila, 'PTS') - nz(lr.fila, 'PTS');
    const ord = factores.slice().sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto));

    ord.slice(0, 2).forEach((f, i) => {
      if (f.gano === null || (i === 1 && Math.abs(f.impacto) < 0.5 * Math.abs(ord[0].impacto))) return;
      const r = responsableFactor(f, lp, lr);
      const gP = f.gano === true;
      tarjetas.push({
        id: i === 0 ? 'decisor' : 'segundo', tono: gP ? 'pos' : 'neg',
        titulo: (i === 0 ? (gP ? 'Lo inclinó a favor: ' : 'Lo inclinó en contra: ') : (gP ? 'También a favor: ' : 'También en contra: ')) + f.label,
        texto: f.corto + ' ' + p1(f.propio) + ' contra ' + p1(f.rival) + ' del rival (' + pp1(f.propio - f.rival) + '). '
          + (r.texto ? (gP ? 'Lo sostuvo: ' : 'Lo marcó el rival: ') + r.texto + '.' : ''),
        ficha: [{ label: f.corto + ' propio', valor: p1(f.propio), sub: f.habitual === null ? '' : 'habitual ' + p1(f.habitual) },
          { label: f.corto + ' rival', valor: p1(f.rival), sub: f.habitualRival === null ? '' : 'habitual ' + p1(f.habitualRival) }],
        nombres: r.nombres,
      });
    });

    /* La creación: quién repartió, contra su habitual. */
    const asR = lider(lr.box, 'AST', 4), asP = lider(lp.box, 'AST', 4);
    const cr = a.contraste.find(c => c.clave === 'AST%');
    const rivalC = contrasteEquipo(idx, lr).find(c => c.clave === 'AST%');
    if (asR || asP) {
      tarjetas.push({
        id: 'creacion', tono: asR && rivalC && rivalC.relevante && rivalC.aFavor ? 'neg' : 'info',
        titulo: 'Quién repartió el juego',
        texto: (asP ? quien(asP) + ': ' + nz(asP, 'AST') + ' asistencias de nuestro lado' : 'Nadie de nuestro lado llegó a 4 asistencias')
          + '; ' + (asR ? quien(asR) + ': ' + nz(asR, 'AST') + ' del rival' : 'nadie del rival llegó a 4') + '. '
          + (cr ? 'Nuestra circulación: ' + p1(cr.partido) + ' de canastas asistidas contra ' + p1(cr.habitual) + ' habitual. ' : '')
          + (rivalC ? 'La del rival: ' + p1(rivalC.partido) + ' contra ' + p1(rivalC.habitual) + '.' : ''),
        ficha: [], nombres: [asP, asR].filter(Boolean).map(quien),
      });
    }

    /* Las noches individuales que se salieron de su promedio. */
    /* Solo noches que dicen algo: 1 asistencia sobre un promedio de 0,2 es +400 % y no es una noche. */
    const PISO_NOCHE = { 'PTS': 12, 'T3C': 3, 'AST': 4, 'RT': 7, 'PR': 4 };
    const vale = (x) => PISO_NOCHE[x.destacado.clave] !== undefined && x.destacado.valor >= PISO_NOCHE[x.destacado.clave];
    const jp = a.jugadores.propiosArriba.find(vale), jr = a.jugadores.rivalesArriba.find(vale);
    if (jp || jr) {
      const linea = (x) => quien(x.fila) + ': ' + SGADD.formatear(x.destacado.clave, x.destacado.valor) + ' ' + x.destacado.clave
        + ' (' + (x.destacado.delta > 0 ? '+' : '−') + Math.abs(x.destacado.delta).toFixed(1).replace('.', ',') + ' sobre su promedio)';
      tarjetas.push({
        id: 'noches', tono: jr ? 'neg' : 'pos', titulo: 'Las noches que se salieron de su promedio',
        texto: [jp ? 'Nuestro: ' + linea(jp) : '', jr ? 'Del rival: ' + linea(jr) : ''].filter(Boolean).join('. ') + '.',
        ficha: [], nombres: [jp, jr].filter(Boolean).map(x => quien(x.fila)),
      });
    }

    const proy = proyeccionPartido(idx, lp, lr, a.gano);
    if (proy) {
      const d = proy.desvio;
      tarjetas.push({
        id: 'proyeccion', tono: Math.abs(d) < 4 ? 'info' : (d > 0 ? 'pos' : 'neg'),
        titulo: 'El modelo contra lo que pasó',
        texto: 'Con los ratings de la temporada el Simulador daba ' + (proy.margenModelo >= 0 ? '+' : '−') + Math.abs(proy.margenModelo).toFixed(1).replace('.', ',')
          + ' para nosotros (' + Math.round(proy.probPropio * 100) + ' % de ganar); fue ' + (proy.margenReal >= 0 ? '+' : '−') + Math.abs(proy.margenReal)
          + ': ' + (Math.abs(d) < 4 ? 'dentro de lo esperable' : (d > 0 ? Math.abs(d).toFixed(0) + ' puntos mejor que lo esperado' : Math.abs(d).toFixed(0) + ' puntos peor que lo esperado'))
          + '. El modelo incluye este partido en sus datos: es una vara, no una predicción previa.'
          + (proy.factorClave ? ' Factor que más movía el cruce: ' + proy.factorClave + '.' : ''),
        ficha: [], nombres: [],
      });
    }

    /* Lo que el play-by-play no sabe y el box score sí: los generadores del
       rival (quien más repartió o anotó), los que más dobles intentaron y
       los rebotes de la noche. Viaja al montaje de cada bloque del paquete. */
    const fiables = (lr.box || []).filter(j => nz(j, 'MIN') >= MIN_MINUTOS);
    const foco = [];
    [lider(fiables, 'AST', 3), lider(fiables, 'PTS', 10)].filter(Boolean).forEach((j) => {
      const n = SGADD.texto(j['NOMBRES']); if (foco.indexOf(n) === -1) foco.push(n);
    });
    const dobles = fiables.slice().sort((x, y) => nz(y, 'T2I') - nz(x, 'T2I')).slice(0, 2).filter(j => nz(j, 'T2I') >= 3)
      .map(j => ({ n: quien(j), t2c: nz(j, 'T2C'), t2i: nz(j, 'T2I') }));
    const ctx = { foco: foco, rivalDobles: dobles, rivalRo: nz(lr.fila, 'RO') || null, nuestroRd: nz(lp.fila, 'RD') || null };
    return { margen, gano: a.gano, factores, tarjetas, proyeccion: proy, ctx,
      focos: focosPartido(idx, lp, lr, a, factores), plan: planAjuste(lp, lr, a, factores) };
  }

  /** Lo que salió bien en ataque y en defensa, y conviene sostener. También en una derrota. */
  function focosPartido(idx, lp, lr, a, factores) {
    const ataque = [], defensa = [];
    factores.filter(f => f.gano === true && (f.superior || Math.abs(f.propio - f.rival) >= UMBRAL_FACTOR[f.hab])).forEach((f) => {
      const r = responsableFactor(f, lp, lr);
      ataque.push({ titulo: f.label, texto: f.corto + ' ' + p1(f.propio) + (f.habitual === null ? '' : ' contra ' + p1(f.habitual) + ' habitual (' + pp1(f.desvioPropio === null ? 0 : (f.inv ? -f.desvioPropio : f.desvioPropio)) + ')')
        + ' y ' + pp1(f.propio - f.rival) + ' sobre el rival. ' + (r.texto ? r.texto + '.' : ''), nombres: r.nombres });
    });
    /* Una clave que ya es uno de los cuatro factores no se repite con otro nombre. */
    const usados = factores.filter(f => f.gano === true).map(f => f.hab);
    a.claves.filter(c => usados.indexOf(c.clave) === -1).slice(0, 2).forEach((c) => {
      ataque.push({ titulo: c.label, texto: c.cuerpo + ': ' + p1(c.partido) + ' contra ' + p1(c.habitual) + ' habitual.', nombres: [] });
    });
    contrasteEquipo(idx, lr).filter(c => c.relevante && !c.aFavor).slice(0, 3).forEach((c) => {
      const recup = (c.clave === 'PePP%') ? lider(lp.box, 'PR', 3) : null;
      defensa.push({ titulo: 'El rival bajó: ' + c.label, texto: 'Rival: ' + p1(c.partido) + ' contra ' + p1(c.habitual) + ' habitual (' + pp1(c.dif) + ').'
        + (recup ? ' ' + quien(recup) + ' recuperó ' + nz(recup, 'PR') + '.' : ''), nombres: recup ? [quien(recup)] : [] });
    });
    const rob = lider(lp.box, 'PR', 4);
    if (rob && !defensa.some(x => /recuper/.test(x.texto))) {
      defensa.push({ titulo: 'Manos activas', texto: quien(rob) + ' recuperó ' + nz(rob, 'PR') + ' pelotas.', nombres: [quien(rob)] });
    }
    return { ataque, defensa };
  }

  /**
   * El plan de ajuste para el próximo cruce, sobre los nombres que
   * desequilibraron. Las posiciones no están en la planilla: el «perfil
   * interior» sale de CÓMO jugó (rebote + pase), no de un puesto, y se dice.
   * La tercera directriz (el reloj) la completa el play-by-play.
   */
  function planAjuste(lp, lr, a, factores) {
    const fiables = (lr.box || []).filter(j => nz(j, 'MIN') >= MIN_MINUTOS);
    const gen = lider(fiables, 'AST', 3) || lider(fiables, 'PTS', 10);
    const out = { perimetro: null, interior: null, reloj: null };
    if (gen) {
      const t3i = nz(gen, 'T3I'), t3c = nz(gen, 'T3C');
      const exterior = t3i >= 3 && t3c / t3i >= 0.4;
      const pierde = nz(gen, 'PP') >= 4;
      const otro = lider(fiables.filter(j => j !== gen), 'T3C', 3);
      out.perimetro = {
        titulo: 'Plan de contención perimetral',
        texto: quien(gen) + ' hizo ' + nz(gen, 'PTS') + ' pts y ' + nz(gen, 'AST') + ' asistencias con ' + nz(gen, 'PP') + ' pérdidas. '
          + (exterior ? 'Tiró bien de afuera (' + t3c + '/' + t3i + '): no se le pasa por abajo, se lo sigue arriba de la cortina. '
            : t3i >= 3 ? 'Falló de afuera (' + t3c + '/' + t3i + '): se puede ir por abajo en el pick & roll y cerrar la entrada. ' : '')
          + (pierde ? 'Perdió ' + nz(gen, 'PP') + ' pelotas: la presión sobre la primera línea le rinde. ' : '')
          + (otro ? quien(otro) + ' sumó ' + nz(otro, 'T3C') + ' triples: no ayudar de su lado.' : ''),
        nombres: [gen, otro].filter(Boolean).map(quien),
        lectura: true,
      };
    }
    const inter = fiables.filter(j => nz(j, 'AST') >= 3 && (nz(j, 'RT') >= 5 || nz(j, 'RO') >= 2))
      .sort((x, y) => nz(y, 'AST') - nz(x, 'AST'))[0] || null;
    out.interior = inter ? {
      titulo: 'Ajuste en defensa de poste alto e interior',
      texto: quien(inter) + ' repartió ' + nz(inter, 'AST') + ' asistencias y tomó ' + nz(inter, 'RT') + ' rebotes: es un interior que juega de pasador. '
        + 'Negar la línea de pase al poste alto y al short roll, y ayudar desde el lado débil sin dejar el rebote.',
      nombres: [quien(inter)], lectura: true,
    } : {
      titulo: 'Ajuste en defensa de poste alto e interior',
      texto: 'Ningún rival con perfil de rebote y pase llegó a 3 asistencias: no hay un interior pasador al que negarle la línea. No hace falta un ajuste especial.',
      nombres: [], lectura: false,
    };
    return out;
  }

  return {
    Z_ATIPICO, MIN_MINUTOS, MIN_PARTIDOS_JUGADOR, COLS_BOX, COLS_DESVIO, CONTRASTE_EQUIPO,
    ZONAS_TIRO, MIN_INTENTOS_ZONA, FACTORES_PARTIDO,
    analizar, desviosLado, contrasteEquipo, ajusteJugadores, nombreCorto, avanzadas,
    perfilTiro, decision, factoresPartido, focosPartido, planAjuste, proyeccionPartido, responsableFactor, lider,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PARTIDO;
