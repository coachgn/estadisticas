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
        const st = idx ? idx.statJugador(j.__clave, k) : null;
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

    if (!idx || (idx.get && !idx.get(e.clave))) return [];
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
  /* LA VARA ES LA PREVIA (v332). `opciones.base` es el índice con los
     partidos ANTERIORES al partido (`SGADD_APP.idxPrevio`): el habitual y
     los desvíos se miden contra lo que había antes, no contra un promedio
     que ya trae la noche adentro. `base: null` = no hubo partidos previos:
     no hay habitual y no se inventa uno. Sin `opciones`, la vara es `idx`,
     como antes. */
  function baseDe(idx, opciones) {
    return opciones && Object.prototype.hasOwnProperty.call(opciones, 'base') ? opciones.base : idx;
  }

  function analizar(idx, part, ladoPropio, opciones) {
    if (!part || !ladoPropio) return null;
    const base = baseDe(idx, opciones);
    const rival = part.lados.find(l => l !== ladoPropio) || null;
    ladoPropio.rivalFila = rival ? rival.fila : null;
    if (rival) rival.rivalFila = ladoPropio.fila;

    const contraste = base ? contrasteEquipo(base, ladoPropio) : [];
    const claves = contraste.filter(c => c.relevante && c.aFavor).slice(0, 3);
    const grietas = contraste.filter(c => c.relevante && !c.aFavor).slice(0, 3);

    const propios = base ? desviosLado(base, ladoPropio) : desviosLado(null, ladoPropio);
    const rivales = rival ? desviosLado(base, rival) : [];

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
         es el prior de Dean Oliver.
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
  function factoresPartido(idx, propio, riv, idxReg, idxLiga) {
    if (!propio || !riv || !propio.factores || !riv.factores) return [];
    /* `idx` es la vara del habitual (la previa, o null sin partidos
       previos); `idxLiga` da la mediana de la liga cuando no hay previa. */
    const leerSeguro = (I, k, m) => { try { return I && (!I.get || I.get(k)) ? I.leer(k, m) : null; } catch (e) { return null; } };
    return FACTORES_PARTIDO.map((f) => {
      const v = propio.factores[f.k], vr = riv.factores[f.k];
      if (typeof v !== 'number' || typeof vr !== 'number') return null;
      const lp = leerSeguro(idx, propio.equipo.clave, f.hab), lr = leerSeguro(idx, riv.equipo.clave, f.hab);
      const lLiga = (lp && typeof lp.tipo === 'number') ? lp : leerSeguro(idxLiga, propio.equipo.clave, f.hab);
      const habP = lp && typeof lp.valor === 'number' ? lp.valor : null;
      const habR = lr && typeof lr.valor === 'number' ? lr.valor : null;
      /* Doble referencia en una fase de eliminación: la Regular (estructural) y la fase actual (racha). */
      let regP = null, regR = null;
      if (idxReg && idxReg.leer) {
        const a1 = idxReg.leer(propio.equipo.clave, f.hab), a2 = idxReg.leer(riv.equipo.clave, f.hab);
        regP = a1 && typeof a1.valor === 'number' ? a1.valor : null;
        regR = a2 && typeof a2.valor === 'number' ? a2.valor : null;
      }
      const mejor = f.inv ? vr - v : v - vr;                    // > 0: lo ganó el propio
      const umbral = UMBRAL_FACTOR[f.hab];
      const desvioP = habP === null ? null : (f.inv ? habP - v : v - habP);   // > 0: mejor que su habitual
      const desvioR = habR === null ? null : (f.inv ? habR - vr : vr - habR);
      return {
        k: f.k, hab: f.hab, label: f.label, corto: f.corto, peso: f.peso, inv: f.inv,
        propio: v, rival: vr, habitual: habP, habitualRival: habR, regular: regP, regularRival: regR,
        deltaRegular: regP === null ? null : v - regP,
        liga: lLiga && typeof lLiga.tipo === 'number' ? lLiga.tipo : null,
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
   * La expectativa contra lo que pasó. Ojo: el modelo se arma con la
   * temporada COMPLETA, este partido incluido, así que NO es una predicción
   * previa: es qué margen daban los ratings de las dos y cuánto se alejó
   * la noche. Sin simulador o sin partidos suficientes, null.
   */
  function proyeccionPartido(idx, propio, riv, gano) {
    try {
      if (!idx || (idx.get && (!idx.get(propio.equipo.clave) || !idx.get(riv.equipo.clave)))) return null;
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
  /**
   * `opciones.base`: el índice con los partidos previos (o null sin
   * partidos previos); `opciones.previa`: { partidos, hasta } para decirlo;
   * `opciones.plan`: lo que devuelve `planContraRealidad`, para que el plan
   * de ajuste no contradiga una consigna del scouting sin decirlo.
   */
  function decision(idx, lp, lr, a, idxReg, opciones) {
    if (!lp || !lr || !a) return null;
    const o = opciones || {};
    const base = baseDe(idx, o);
    const factores = factoresPartido(base, lp, lr, idxReg, idx);
    const tarjetas = [];
    const margen = nz(lp.fila, 'PTS') - nz(lr.fila, 'PTS');
    const ord = factores.slice().sort((x, y) => Math.abs(y.impacto) - Math.abs(x.impacto));

    ord.slice(0, 2).forEach((f, i) => {
      if (f.gano === null || (i === 1 && Math.abs(f.impacto) < 0.5 * Math.abs(ord[0].impacto))) return;
      const r = responsableFactor(f, lp, lr);
      const gP = f.gano === true;
      /* DE QUÉ LADO SE PERDIÓ (v332). Con nuestro número en o sobre lo
         habitual y el del rival por encima del suyo, el factor no se perdió
         en ataque: se perdió en la defensa de ese factor. Antes la tarjeta
         marcaba ▼ un eFG% propio que había quedado arriba de lo habitual. */
      const nuestroBien = f.desvioPropio !== null && f.desvioPropio >= 0;
      const rivalArriba = f.desvioRival !== null && f.desvioRival > 0;
      const enDefensa = !gP && nuestroBien && rivalArriba;
      const tonoP = f.desvioPropio === null ? 'info' : (f.desvioPropio >= 0 ? 'pos' : 'neg');
      const tonoR = f.desvioRival === null ? 'info' : (f.desvioRival > 0 ? 'neg' : 'pos');
      tarjetas.push({
        id: i === 0 ? 'decisor' : 'segundo', tono: gP ? 'pos' : 'neg',
        titulo: (i === 0 ? (gP ? 'Lo inclinó a favor: ' : 'Lo inclinó en contra: ') : (gP ? 'También a favor: ' : 'También en contra: ')) + f.label
          + (enDefensa ? ' · en defensa' : ''),
        texto: f.corto + ' ' + p1(f.propio) + ' contra ' + p1(f.rival) + ' del rival (' + pp1(f.propio - f.rival) + '). '
          + (enDefensa ? 'Nuestro ataque quedó en o sobre lo habitual; lo que se fue fue el rival, ' + pp1(f.inv ? -f.desvioRival : f.desvioRival) + ' sobre el suyo. ' : '')
          + (r.texto ? (gP ? 'Lo sostuvo: ' : 'Lo marcó el rival: ') + r.texto + '.' : ''),
        ficha: [{ label: f.corto + ' propio', valor: p1(f.propio), sub: f.habitual === null ? 'sin habitual previo' : 'habitual ' + p1(f.habitual), tono: tonoP },
          { label: f.corto + ' rival', valor: p1(f.rival), sub: f.habitualRival === null ? 'sin habitual previo' : 'habitual ' + p1(f.habitualRival), tono: tonoR }],
        nombres: r.nombres,
      });
    });

    /* La creación: quién repartió, contra su habitual. */
    const asR = lider(lr.box, 'AST', 4), asP = lider(lp.box, 'AST', 4);
    const cr = a.contraste.find(c => c.clave === 'AST%');
    const rivalC = contrasteEquipo(base, lr).find(c => c.clave === 'AST%');
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

    /* La expectativa es la PREVIA: el simulador con los partidos anteriores,
       que es lo que veía el scouting. Sin `opciones.base` (llamada vieja) es
       la vara de toda la temporada, y lo dice. */
    const previa = Object.prototype.hasOwnProperty.call(o, 'base');
    const proy = proyeccionPartido(base, lp, lr, a.gano);
    if (proy) {
      const d = proy.desvio;
      const pv = o.previa || {};
      const ddmm = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';
      tarjetas.push({
        id: 'proyeccion', tono: Math.abs(d) < 4 ? 'info' : (d > 0 ? 'pos' : 'neg'),
        titulo: 'Expectativa contra realidad',
        texto: 'Margen esperado: ' + (proy.margenModelo >= 0 ? '+' : '−') + Math.abs(proy.margenModelo).toFixed(1).replace('.', ',')
          + ' pts (' + Math.round(proy.probPropio * 100) + ' % de victoria estimada); el partido cerró en ' + (proy.margenReal >= 0 ? '+' : '−') + Math.abs(proy.margenReal)
          + ', ' + (Math.abs(d) < 4 ? 'dentro de lo esperable' : (d > 0 ? 'superando la expectativa por ' + Math.abs(d).toFixed(0) + ' puntos' : 'por debajo de la expectativa por ' + Math.abs(d).toFixed(0) + ' puntos'))
          + (previa
            ? '. Es la expectativa PREVIA: el simulador con los ' + (pv.partidos || 0) + ' partidos de la liga jugados hasta el ' + ddmm(pv.hasta) + ', sin este.'
            : '. La referencia usa los ratings de toda la temporada, este partido incluido: es una vara de rendimiento, no una predicción previa.')
          + (proy.factorClave ? ' Factor que más movía el cruce: ' + proy.factorClave + '.' : ''),
        ficha: [], nombres: [],
      });
    } else if (previa) {
      const jugaron = !!(base && base.get && base.get(lp.equipo.clave) && base.get(lr.equipo.clave));
      tarjetas.push({ id: 'proyeccion', tono: 'info', titulo: 'Expectativa contra realidad',
        texto: jugaron
          ? 'Sin expectativa previa: con los partidos jugados antes de esta fecha el simulador no tenía muestra suficiente para proyectar el cruce.'
          : 'Sin expectativa previa: alguno de los dos equipos no había jugado antes de esta fecha, así que el simulador no tenía con qué proyectar el cruce.',
        ficha: [], nombres: [] });
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
      previa: previa ? { partidos: (o.previa && o.previa.partidos) || 0, hasta: (o.previa && o.previa.hasta) || null, sinBase: !base } : null,
      focos: focosPartido(base, lp, lr, a, factores), plan: planAjuste(lp, lr, a, factores, idx, o.plan) };
  }

  /** Lo que salió bien en ataque y en defensa, y conviene sostener. También en una derrota. */
  function focosPartido(idx, lp, lr, a, factores) {
    const ataque = [], defensa = [];
    factores.filter(f => f.gano === true && (f.superior || Math.abs(f.propio - f.rival) >= UMBRAL_FACTOR[f.hab])).forEach((f) => {
      const r = responsableFactor(f, lp, lr);
      /* Se gana al rival y eso es lo que se sostiene; si quedó bajo lo
         habitual, se dice con esas palabras (el ▲ se leía «mejoró»). */
      const bajo = f.desvioPropio !== null && f.desvioPropio < 0;
      ataque.push({ titulo: f.label + (bajo ? ' · ganado, bajo lo habitual' : ''),
        texto: 'Se le ganó al rival: ' + f.corto + ' ' + p1(f.propio) + ' contra ' + p1(f.rival) + ' (' + pp1(f.propio - f.rival) + ').'
          + (f.habitual === null ? '' : (bajo ? ' Igual quedó bajo nuestro habitual (' : ' Y sobre nuestro habitual (') + p1(f.habitual) + ', ' + pp1(f.inv ? -f.desvioPropio : f.desvioPropio) + ').')
          + (r.texto ? ' ' + r.texto + '.' : ''), nombres: r.nombres, bajo: bajo });
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
   * El plan de ajuste para el próximo cruce, en cuatro categorías de ACCIÓN
   * (v331). No hay posiciones ni tipo de jugada en la planilla: cada
   * categoría sale de lo que el rival HIZO en el box (triples y dobles
   * convertidos, asistencias, rebotes ofensivos). Con play-by-play, la zona
   * bajo el aro (Z1) y el reloj los completa el paquete.
   */
  function planAjuste(lp, lr, a, factores, idx, plan) {
    const fiables = (lr.box || []).filter(j => nz(j, 'MIN') >= MIN_MINUTOS);
    const out = { perimetro: null, interior: null, generacion: null, segundas: null, reloj: null };
    const sinDato = (titulo, texto) => ({ titulo, texto, nombres: [], lectura: false });

    /* 1 · Perímetro: quien más daño hizo de tres */
    const t3 = fiables.slice().sort((x, y) => nz(y, 'T3C') - nz(x, 'T3C'))[0];
    if (t3 && nz(t3, 'T3C') >= 3) {
      const c = nz(t3, 'T3C'), i = nz(t3, 'T3I'), efi = i ? c / i : 0;
      out.perimetro = {
        titulo: 'Contención perimetral',
        texto: quien(t3) + ' hizo ' + c + ' triples de ' + i + ' (' + Math.round(efi * 100) + ' %) y ' + nz(t3, 'PTS') + ' pts. '
          + (efi >= 0.4 ? 'Tiró bien y abierto: seguirlo arriba de la cortina, no pasar por abajo y no ayudar desde su lado.'
            : 'Tiró mucho con poco acierto: dejarlo tirar con la mano arriba y cuidar la penetración.'),
        nombres: [quien(t3)], lectura: true };
    } else out.perimetro = sinDato('Contención perimetral', 'Ningún rival llegó a 3 triples convertidos: no hay un tirador al que perseguir.');

    /* 2 · Cerca del aro: más dobles convertidos con buena eficiencia */
    const dob = fiables.filter(j => nz(j, 'T2I') >= 4).sort((x, y) => nz(y, 'T2C') - nz(x, 'T2C'))[0];
    if (dob && nz(dob, 'T2C') >= 4 && nz(dob, 'T2C') / nz(dob, 'T2I') >= 0.5) {
      out.interior = {
        titulo: 'Contención cerca del aro',
        texto: quien(dob) + ' convirtió ' + nz(dob, 'T2C') + ' de ' + nz(dob, 'T2I') + ' dobles (' + Math.round(nz(dob, 'T2C') / nz(dob, 'T2I') * 100) + ' %). '
          + 'Cerrarle el camino a la zona de definición: ayuda temprana desde el lado débil, sea que penetre o reciba cerca, y no dejarlo sellar.',
        nombres: [quien(dob)], lectura: true };
    } else out.interior = sinDato('Contención cerca del aro', 'Ningún rival combinó volumen y eficiencia en los dobles (4 convertidos con 50 %): sin ajuste especial en la pintura.');

    /* 3 · Generación: el que más ventajas directas creó */
    const gen = lider(fiables, 'AST', 3);
    if (gen) {
      out.generacion = {
        titulo: 'Generación y asistencias',
        texto: quien(gen) + ' repartió ' + nz(gen, 'AST') + ' asistencias' + (nz(gen, 'PP') ? ' con ' + nz(gen, 'PP') + ' pérdidas' : '') + '. '
          + 'Cortar el circuito: negar la primera descarga, anticipar la línea de pase y obligarlo a decidir lejos del lugar que prefiere.',
        nombres: [quien(gen)], lectura: true };
    } else out.generacion = sinDato('Generación y asistencias', 'Ningún rival llegó a 3 asistencias: el juego no pasó por un solo creador.');

    /* 4 · Segundas oportunidades: rebote ofensivo contra la liga */
    const ro = lider(fiables, 'RO', 2);
    let roLiga = null, roRival = lr.factores ? lr.factores['RO%'] : null;
    try { const l = idx && idx.leer(lr.equipo.clave, 'RO%'); roLiga = l && typeof l.tipo === 'number' ? l.tipo : null; } catch (e) {}
    const sobreLiga = typeof roRival === 'number' && roLiga !== null && roRival > roLiga;
    if (ro && (sobreLiga || nz(ro, 'RO') >= 3)) {
      out.segundas = {
        titulo: 'Control de segundas oportunidades',
        texto: quien(ro) + ' tomó ' + nz(ro, 'RO') + ' rebotes ofensivos. '
          + (typeof roRival === 'number' ? 'El rival cerró con RO% ' + p1(roRival) + (roLiga !== null ? ' contra ' + p1(roLiga) + ' de la liga' : '') + '. ' : '')
          + 'Asignarle un cierre de choque: contacto antes de que salte el tiro y un segundo defensor que saque la pelota.',
        nombres: [quien(ro)], lectura: true };
    } else out.segundas = sinDato('Control de segundas oportunidades', 'El rival no cargó el rebote ofensivo por encima de la liga: sin ajuste especial.');

    /* CONTRA LA CONSIGNA DEL SCOUTING (v332). Si el jugador tenía una marca
       en el plan previo, la directriz dice si la mantiene o la cambia, y por
       qué: el ajuste no puede contradecir el plan en silencio. */
    if (plan && plan.ok && plan.jugadores) {
      const de = (x) => x && x.nombres && x.nombres[0] ? plan.jugadores[claveNombre(x.nombres[0], lr)] : null;
      const con = (x, frase) => { if (x && frase) x.texto = frase + ' ' + x.texto; };
      const mP = de(out.perimetro);
      if (mP && out.perimetro.lectura) {
        const t = mP.conPelota || '';
        const efi = /\((\d+) %\)/.exec(out.perimetro.texto);
        const bien = efi && Number(efi[1]) >= 40;
        if (bien && /UNDER|POR DETR|PASO ATR|FLOT/i.test(t)) con(out.perimetro, 'El plan decía «' + t + '»: con ese acierto hay que cambiar la consigna.');
        else if (bien && /TOP LOCK|OVER|STAY HOME|NEGACI/i.test(t + ' ' + (mP.sinPelota || ''))) con(out.perimetro, 'La consigna era la correcta («' + t + '»): falló la ejecución, se sostiene.');
        else if (t) con(out.perimetro, 'Consigna del plan: «' + t + '».');
      }
      const mI = de(out.interior);
      if (mI && out.interior.lectura) {
        if (mI.grupo === 'fuente') con(out.interior, 'Era la fuente de ayuda del plan y castigó cerca del aro: la ayuda tiene que salir de otro lado.');
        else if (mI.conPelota) con(out.interior, 'Consigna del plan: «' + mI.conPelota + '».');
      }
      const mG = de(out.generacion);
      if (mG && out.generacion.lectura) {
        if (mG.grupo === 'foco') con(out.generacion, 'Era foco del plan (se lo doblaba): ' + (mG.real && mG.pre && mG.real.pts < mG.pre.pts ? 'el doble le bajó la anotación (' + mG.real.pts + ' pts contra ' + num1(mG.pre.pts) + ' de promedio) pero le abrió el pase.' : 'el doble no lo frenó.'));
        else if (mG.conPelota) con(out.generacion, 'Consigna del plan: «' + mG.conPelota + '».');
      }
      const mS = de(out.segundas);
      if (mS && out.segundas.lectura && mS.grupo === 'cristal') con(out.segundas, 'Tenía box-out asignado en el plan: el cierre no alcanzó.');
      if (!out.segundas.lectura && plan.jugadores && Object.keys(plan.jugadores).some(k => plan.jugadores[k].grupo === 'cristal')) {
        out.segundas.texto = 'El box-out asignado del plan funcionó: el rival no cargó el rebote ofensivo por encima de la liga. Se sostiene.';
      }
    }
    return out;
  }

  const num1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

  /* =====================================================================
     EL RADAR DEL PARTIDO (v333) · ocho ejes con escala FIJA por métrica,
     como el de ElStatsLab: el tamaño de la forma se compara entre partidos.
     DRTG y TOV% van invertidos: más afuera siempre es mejor. Un valor fuera
     de la escala se pega al borde (la etiqueta dice el número real).
     ===================================================================== */
  const RADAR_EJES = [
    { id: 'NET', label: 'NET', min: -30, max: 30 },
    { id: 'DRTG', label: 'DRTG', min: 80, max: 140, inv: true },
    { id: 'REB%', label: 'REB%', min: 0.35, max: 0.65, pct: true },
    { id: 'OREB%', label: 'OREB%', min: 0.10, max: 0.45, pct: true },
    { id: 'TOV%', label: 'TOV%', min: 0.05, max: 0.25, pct: true, inv: true },
    { id: 'AST%', label: 'AST%', min: 0.30, max: 0.85, pct: true },
    { id: 'eFG%', label: 'eFG%', min: 0.35, max: 0.75, pct: true },
    { id: 'ORTG', label: 'ORTG', min: 80, max: 140 },
  ];

  function radarPartido(lp, lr, a) {
    if (!lp || !lr || !a || !a.avanzadas || !a.avanzadasRival) return null;
    const div = (x, y) => (typeof x === 'number' && typeof y === 'number' && y > 0 ? x / y : null);
    const lado = (f, o, av) => {
      const reb = nz(f, 'RO') + nz(f, 'RD'), rebO = nz(o, 'RO') + nz(o, 'RD');
      const tcc = nz(f, 'TCC') || (nz(f, 'T2C') + nz(f, 'T3C')), tci = nz(f, 'TCI') || (nz(f, 'T2I') + nz(f, 'T3I'));
      return {
        'NET': typeof av.ortg === 'number' && typeof av.drtg === 'number' ? av.ortg - av.drtg : null,
        'ORTG': av.ortg, 'DRTG': av.drtg,
        'REB%': div(reb, reb + rebO),
        'OREB%': div(nz(f, 'RO'), nz(f, 'RO') + nz(o, 'RD')),
        'TOV%': div(nz(f, 'PP'), nz(f, 'PLAYS')),
        'AST%': div(nz(f, 'AST'), tcc),
        'eFG%': div(tcc + 0.5 * nz(f, 'T3C'), tci),
      };
    };
    const P = lado(lp.fila, lr.fila, a.avanzadas), R = lado(lr.fila, lp.fila, a.avanzadasRival);
    const escala = (e, v) => {
      if (typeof v !== 'number' || !isFinite(v)) return null;
      const s = Math.max(0, Math.min(1, (v - e.min) / (e.max - e.min)));
      return e.inv ? 1 - s : s;
    };
    return RADAR_EJES.map(e => ({ id: e.id, label: e.label, pct: !!e.pct, inv: !!e.inv,
      propio: P[e.id], rival: R[e.id], sP: escala(e, P[e.id]), sR: escala(e, R[e.id]) }));
  }

  /** La clave de persona de un nombre corto o completo del box del lado `lado`. */
  function claveNombre(corto, lado) {
    const j = (lado.box || []).find(x => quien(x) === corto || SGADD.texto(x['NOMBRES']) === corto);
    return SGADD.clavePersona(j ? SGADD.texto(j['NOMBRES']) : corto);
  }

  /* =====================================================================
     EL PLAN CONTRA LA REALIDAD (v332)

     El post-partido como RESPUESTA al scouting. Se rearma el informe
     pre-partido (`SGADD_SCOUT.informePrePartido`) con el índice de los
     partidos ANTERIORES —la foto que tenía el scouting— y cada pieza se
     contrasta con lo que pasó: las 3 cosas, la versión perdedora, los
     volúmenes de los dos equipos, los duelos cruzados, el FODA, las marcas
     jugador por jugador y el margen previsto.

     Estado de cada fila: 'ok' se cumplió · 'no' no se cumplió · 'parcial' a
     medias · 'info' sin veredicto. Lo que el plan no pudo decir (sin
     partidos previos, sin versión perdedora) no se evalúa: se dice.

     LÍMITE: el plan se RECALCULA. Si el cuerpo técnico editó a mano una
     consigna de la tabla de marcas, esa edición no está acá.
     ===================================================================== */
  function motorScout() {
    if (typeof SGADD_SCOUT !== 'undefined') return SGADD_SCOUT;
    try { if (typeof require === 'function') return require('./sgadd-scouting.js'); } catch (e) { /* sin scouting */ }
    return null;
  }

  const VOL_COL = { tc: 'TCI', t3: 'T3I', perdidas: 'PP', ro: 'RO', tl: 'T1I' };
  const VOL_CORTO = { tc: 'TCI', t3: 'T3I', perdidas: 'PP', ro: 'RO', tl: 'TLI' };
  const CORTO_FACTOR = { 'eFG%': 'eFG%', 'PP%': 'TOV%', 'RO%': 'RO%', 'RTL%': 'TL/TC' };
  const MAS_ES_MEJOR = (id) => id !== 'PP%' && id !== 'PePP%' && id !== 'eFG Opp%';

  function planContraRealidad(idxPre, idx, lp, lr) {
    const S = motorScout();
    if (!S || !S.informePrePartido || !lp || !lr) return null;
    if (!idxPre) return { ok: false, motivo: 'No hay partidos anteriores a esta fecha: el scouting no tenía con qué armar un plan.' };
    const kP = lp.equipo.clave, kR = lr.equipo.clave;
    const ePre = idxPre.get(kP), rPre = idxPre.get(kR);
    if (!ePre || !rPre) return { ok: false, motivo: (rPre ? 'Nuestro equipo' : 'El rival') + ' no había jugado antes de esta fecha: no hubo plan con datos para contrastar.' };
    const esLocal = SGADD.texto(lp.fila['CONDICION']).toUpperCase() === 'LOCAL';
    let inf = null;
    try { inf = S.informePrePartido(idxPre, esLocal ? kP : kR, esLocal ? kR : kP, { claveRival: kR }); } catch (e) { inf = null; }
    if (!inf || !inf.ok) return { ok: false, motivo: (inf && inf.motivo) || 'No se pudo rearmar el scouting previo.' };

    const filas = [];
    const fila = (bloque, titulo, estado, previsto, real, datos) => filas.push({ bloque, titulo, estado, previsto, real, datos: datos || null });
    /* El tono de UN número para el golpe de ojo: 'pos' a favor, 'aviso' cerca, 'neg' en contra.
       delta > 0 = a favor nuestro; 	ol = cuánto en contra todavía es «cerca». */
    const tonoDe = (delta, tol) => (delta >= 0 ? 'pos' : delta >= -tol ? 'aviso' : 'neg');
    const pf = (id, v) => (typeof v !== 'number' ? '—' : (/%$/.test(id) ? p1(v) : num1(v)));

    /* 1 · DUELOS CRUZADOS · el ataque de cada uno contra la defensa habitual del otro. */
    const duelos = [];
    if (inf.duelos && inf.duelos.ok) {
      inf.duelos.filas.forEach((d) => {
        /* El valor del rival puede venir solo en NUESTRA fila (la columna «Opp»). */
        const opp = d.id.replace('%', ' Opp%');
        const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
        const vN = num(lp.factores && lp.factores[d.id]) !== null ? lp.factores[d.id] : num(lr.factores && lr.factores[opp]);
        const vR = num(lr.factores && lr.factores[d.id]) !== null ? lr.factores[d.id] : num(lp.factores && lp.factores[opp]);
        if (vN === null || vR === null || vN === undefined || vR === undefined) return;
        const mas = MAS_ES_MEJOR(d.id);
        const supera = (v, contra) => typeof contra === 'number' && (mas ? v > contra : v < contra);
        const nuestroGano = supera(vN, d.nuestro.contra), rivalGano = supera(vR, d.rival.contra);
        duelos.push({ id: d.id, estrella: d.estrella, previstoN: d.nuestro.ok, previstoR: d.rival.ok, realN: nuestroGano, realR: rivalGano });
        fila('duelos', (d.estrella ? '★ ' : '') + d.label,
          (!rivalGano && nuestroGano) ? 'ok' : (rivalGano && !nuestroGano) ? 'no' : 'parcial',
          'Su ataque ' + pf(d.id, d.rival.propio) + d.nota + ' contra nuestra defensa ' + pf(d.id, d.rival.contra) + (d.rival.ok ? ': ventaja de ellos' : ': ventaja nuestra')
            + ' · nuestro ataque ' + pf(d.id, d.nuestro.propio) + ' contra su defensa ' + pf(d.id, d.nuestro.contra) + (d.nuestro.ok ? ': ventaja nuestra' : ': ventaja de ellos') + '.',
          'Su ataque hizo ' + pf(d.id, vR) + (rivalGano ? ' y superó lo que concede nuestra defensa' : ' y no superó lo que concede nuestra defensa')
            + ' · el nuestro hizo ' + pf(d.id, vN) + (nuestroGano ? ' y superó lo que concede la suya' : ' y no superó lo que concede la suya') + '.',
          /* Los números del golpe de ojo: lo que traía cada ataque, lo que concedía la
             otra defensa y lo que hizo esa noche, con su tono desde nuestro lado. */
          { id: d.id, corto: CORTO_FACTOR[d.id] || d.id, estrella: !!d.estrella, inv: !mas,
            ellos: { antes: d.rival.propio, contra: d.rival.contra, real: vR,
              tono: tonoDe(mas ? d.rival.contra - vR : vR - d.rival.contra, 0.02) },
            nos: { antes: d.nuestro.propio, contra: d.nuestro.contra, real: vN,
              tono: tonoDe(mas ? vN - d.nuestro.contra : d.nuestro.contra - vN, 0.02) } });
      });
      const real = nz(lp.fila, 'PTS') - nz(lr.fila, 'PTS');
      const m = inf.duelos.margenNuestro;
      /* Desde nuestro lado: terminar en o sobre lo previsto es cumplir. */
      fila('margen', 'Margen previsto', real - m >= -4 ? 'ok' : real - m <= -8 ? 'no' : 'parcial',
        'El simulador previo daba ' + (m >= 0 ? '+' : '−') + num1(Math.abs(m)) + ' pts para nosotros.',
        'Terminó ' + (real >= 0 ? '+' : '−') + Math.abs(real) + ' (' + (real - m >= 0 ? '+' : '−') + num1(Math.abs(real - m)) + ' contra lo previsto).',
        { antes: m, real: real, tono: tonoDe(real - m + 4, 4) });
    } else if (inf.duelos) fila('duelos', 'Duelos cruzados', 'info', inf.duelos.motivo || 'Sin duelos previos.', '—');

    /* 2 · LA VERSIÓN PERDEDORA · ¿lo llevamos a su lado malo? */
    let quiebreOk = null;
    const q = inf.quiebreRival;
    if (q && q.ok && q.principal) {
      const c = q.principal;
      let vReal = null;
      try { const ag = idx.agregarPartidos(kR, [lr.fila]); vReal = ag && ag.tiro ? ag.tiro[c.id] : null; } catch (e) { vReal = null; }
      if (typeof vReal === 'number') {
        quiebreOk = c.mejor > 0 ? vReal < c.corte : vReal > c.corte;
        fila('quiebre', 'Su versión perdedora', quiebreOk ? 'ok' : 'no', S.textoQuiebre(q) + (q.chica ? ' (Muestra chica.)' : ''),
          'Su ' + c.label + ' de la noche: ' + pf(c.id, vReal) + (quiebreOk ? ': lo llevamos a su lado malo.' : ': quedó del lado en que gana.'),
          { id: c.id, label: c.label, corte: c.corte, real: vReal, mejor: c.mejor, pierde: c.perdidosMalo, de: c.nMalo,
            tono: tonoDe(c.mejor > 0 ? c.corte - vReal : vReal - c.corte, /%$/.test(c.id) ? 0.02 : 0.05 * Math.abs(c.corte || 1)) });
      }
    } else if (q) fila('quiebre', 'Su versión perdedora', 'info', (q && q.motivo) || 'Sin lectura previa.', '—');

    /* 3 · LOS VOLÚMENES · el suyo afuera de su zona positiva, el nuestro adentro de la nuestra. */
    const vols = (v, nuestro, ladoReal) => (v && v.items ? v.items : []).map((it) => {
      const real = nz(ladoReal.fila, VOL_COL[it.id]);
      const enZona = it.dir === 'max' ? real <= it.umbral : real >= it.umbral;
      /* «Cerca» = a menos del 10 % del umbral del lado que no conviene. */
      const aFavor = (nuestro ? 1 : -1) * (it.dir === 'max' ? it.umbral - real : real - it.umbral);
      return { id: it.id, label: it.label, corto: VOL_CORTO[it.id] || it.label, umbral: it.umbral, dir: it.dir, real: real,
        cumple: nuestro ? enZona : !enZona, tono: tonoDe(aFavor, 0.1 * Math.abs(it.umbral || 1)) };
    });
    const volR = vols(inf.volumenesRival, false, lr), volN = vols(inf.volumenesNuestro, true, lp);
    const filaVol = (lista, titulo, quien) => {
      if (!lista.length) return;
      const n = lista.filter(x => x.cumple).length;
      fila('volumen', titulo, n === lista.length ? 'ok' : n === 0 ? 'no' : 'parcial',
        lista.map(x => x.label + ' ' + (x.dir === 'max' ? '≤ ' : '≥ ') + num1(x.umbral)).join(' · ') + ' (' + quien + ').',
        lista.map(x => (x.cumple ? '✓ ' : '✗ ') + x.label + ' ' + x.real).join(' · ') + '.', { items: lista });
    };
    filaVol(volR, 'Volumen del rival · fuera de su zona positiva', 'su zona positiva: el plan era sacarlo de ahí');
    filaVol(volN, 'Nuestro volumen · adentro de la nuestra', 'lo que sostiene nuestra zona positiva');

    /* 4 · LAS MARCAS · consigna asignada contra lo que hizo cada uno. */
    let jr = inf.jugadoresRival, marcasConTemporada = false;
    if (!jr || !jr.filas || !jr.filas.length) {
      try { jr = S.jugadoresClave(idx, kR, null, { claveNuestro: kP }); marcasConTemporada = !!jr; } catch (e) { jr = null; }
    }
    const jugadores = {};
    const marcas = [];
    if (jr && jr.filas) {
      const plan = jr.plan || {};
      const grupoDe = (k) => (plan.intocables || []).some(x => x.clave === k) ? 'intocable'
        : (plan.focos || []).some(x => x.clave === k) ? 'foco'
        : (plan.cristal || []).some(x => x.clave === k) ? 'cristal'
        : (plan.fuentes || []).some(x => x.clave === k) ? 'fuente' : null;
      jr.filas.forEach((f) => {
        const ck = SGADD.clavePersona(f.nombre);
        const b = (lr.box || []).find(x => SGADD.clavePersona(SGADD.texto(x['NOMBRES'])) === ck);
        const p = f.perfil || {};
        const pre = { pts: p.pts, ppp: p.ppp, t3i: p.t3i, ro: p.ro, t1i: p.t1i };
        const grupo = grupoDe(f.clave);
        const conPelota = f.marca && f.marca.conPelota ? f.marca.conPelota.titulo : '';
        const sinPelota = f.marca && f.marca.sinPelota ? f.marca.sinPelota.titulo : '';
        const reg = { nombre: f.nombre, grupo, conPelota, sinPelota, pre, real: null };
        jugadores[ck] = reg;
        if (!b || nz(b, 'MIN') <= 0) { marcas.push(Object.assign({ estado: 'info', resultado: 'No jugó.' }, reg)); return; }
        const r = { pts: nz(b, 'PTS'), t3c: nz(b, 'T3C'), t3i: nz(b, 'T3I'), t2c: nz(b, 'T2C'), t2i: nz(b, 'T2I'), ro: nz(b, 'RO'), ast: nz(b, 'AST'), t1i: nz(b, 'T1I'), min: nz(b, 'MIN') };
        reg.real = r;
        let estado = 'parcial', txt = r.pts + ' pts en ' + num1(r.min) + ' min (promedio previo ' + (typeof pre.pts === 'number' ? num1(pre.pts) : '—') + ').';
        const ptsPre = typeof pre.pts === 'number' ? pre.pts : null;
        if (grupo === 'intocable') {
          estado = r.t3c <= 1 ? 'ok' : (r.t3i && r.t3c / r.t3i >= 0.4 ? 'no' : 'parcial');
          txt = r.t3c + '/' + r.t3i + ' en triples y ' + r.pts + ' pts: ' + (estado === 'ok' ? 'no se lo soltó.' : estado === 'no' ? 'se lo soltó y castigó.' : 'tiró, con poco acierto.');
        } else if (grupo === 'foco') {
          estado = ptsPre === null ? 'info' : r.pts <= ptsPre * 0.85 ? 'ok' : (r.pts >= ptsPre * 1.15 && r.pts >= 10 ? 'no' : 'parcial');
          txt = r.pts + ' pts contra ' + (ptsPre === null ? '—' : num1(ptsPre)) + ' de promedio previo' + (r.ast >= 6 ? ', pero repartió ' + r.ast + ' asistencias: el doble le abrió el pase.' : '.');
          if (estado === 'ok' && r.ast >= 6) estado = 'parcial';
        } else if (grupo === 'fuente') {
          estado = (r.t2c >= 4 && r.t2i && r.t2c / r.t2i >= 0.6) ? 'no' : 'ok';
          txt = 'Desde su lado salía la ayuda: ' + r.t2c + '/' + r.t2i + ' en dobles y ' + r.pts + ' pts' + (estado === 'no' ? ': castigó la rotación.' : ': no la castigó.');
        } else if (grupo === 'cristal') {
          const roPre = typeof pre.ro === 'number' ? pre.ro : 1;
          estado = r.ro <= Math.max(1, roPre) ? 'ok' : (r.ro >= roPre + 2 || r.ro >= 3 ? 'no' : 'parcial');
          txt = r.ro + ' rebotes ofensivos (promedio previo ' + num1(roPre) + '): ' + (estado === 'ok' ? 'el box-out alcanzó.' : 'se escapó al cristal.');
        } else if (ptsPre !== null) {
          estado = r.pts <= ptsPre ? 'ok' : (r.pts >= ptsPre + 6 && r.pts >= 10 ? 'no' : 'parcial');
        }
        if (typeof pre.t1i === 'number' && pre.t1i >= 3) {
          txt += ' Fue ' + r.t1i + ' veces a la línea (promedio ' + num1(pre.t1i) + ')' + (r.t1i <= pre.t1i * 0.6 ? ': la defensa sin contacto funcionó.' : '.');
        }
        reg.estado = estado;
        marcas.push(Object.assign({ estado, resultado: txt }, reg));
      });
    }

    /* 5 · EL FODA · oportunidades aprovechadas y amenazas que se dieron. */
    const ops = duelos.filter(d => d.previstoN), ams = duelos.filter(d => d.previstoR);
    const amenaza = marcas.find(m => m.grupo === 'intocable') || marcas.find(m => m.grupo === 'foco');
    if (ops.length || ams.length || amenaza) {
      const aprov = ops.filter(d => d.realN).length, mat = ams.filter(d => d.realR).length + (amenaza && amenaza.estado === 'no' ? 1 : 0);
      const totA = ams.length + (amenaza ? 1 : 0);
      fila('foda', 'FODA', (aprov === ops.length && mat === 0) ? 'ok' : (aprov === 0 && mat === totA && totA) ? 'no' : 'parcial',
        ops.length + ' oportunidades (duelos que nuestro ataque ganaba) y ' + totA + ' amenazas (duelos que su ataque ganaba' + (amenaza ? ' y ' + amenaza.nombre : '') + ').',
        aprov + ' de ' + ops.length + ' oportunidades aprovechadas · ' + mat + ' de ' + totA + ' amenazas se dieron.');
    }

    /* 6 · LAS 3 COSAS · cada directiva con el veredicto de su bloque. */
    const tres = (inf.tresCosas || []).map((t) => {
      let estado = 'info';
      if (t.id === 'duelo') {
        const k = duelos.find(d => d.estrella) || duelos[0];
        if (k) estado = k.realR ? 'no' : 'ok';
      } else if (t.id === 'quiebre') estado = quiebreOk === null ? 'info' : quiebreOk ? 'ok' : 'no';
      else if (t.id === 'volumen') {
        const n = volN.filter(x => x.cumple).length;
        estado = !volN.length ? 'info' : n === volN.length ? 'ok' : n === 0 ? 'no' : 'parcial';
        if (amenaza && amenaza.grupo === 'intocable' && amenaza.estado === 'no' && estado === 'ok') estado = 'parcial';
      }
      return { id: t.id, titulo: t.titulo, texto: t.texto, estado };
    });

    /* EL DAÑO CONTRA EL PLAN: los que se le escaparon a su consigna, por los
       puntos que hicieron por encima de su promedio previo. El resto de las
       marcas ya está en el box score: acá van solo los tres que pesaron. */
    const danio = marcas.filter(m => m.real && (m.estado === 'no' || m.estado === 'parcial'))
      .map(m => Object.assign({ delta: m.real.pts - (typeof m.pre.pts === 'number' ? m.pre.pts : 0) }, m))
      .filter(m => m.delta > 0 || m.estado === 'no')
      .sort((x, y) => (y.estado === 'no') - (x.estado === 'no') || y.delta - x.delta)
      .slice(0, 3);

    const cuenta = (l) => ({ ok: l.filter(x => x.estado === 'ok').length, no: l.filter(x => x.estado === 'no').length, parcial: l.filter(x => x.estado === 'parcial').length });
    return {
      ok: true, pjRival: rPre.pj, pjPropio: ePre.pj, muestraChica: Math.min(rPre.pj || 0, ePre.pj || 0) < 3,
      marcasConTemporada, filas, marcas, danio, tresCosas: tres, jugadores,
      resumen: cuenta(filas.concat(marcas).concat(tres)),
    };
  }

  return {
    Z_ATIPICO, MIN_MINUTOS, MIN_PARTIDOS_JUGADOR, COLS_BOX, COLS_DESVIO, CONTRASTE_EQUIPO,
    ZONAS_TIRO, MIN_INTENTOS_ZONA, FACTORES_PARTIDO,
    analizar, desviosLado, contrasteEquipo, ajusteJugadores, nombreCorto, avanzadas,
    perfilTiro, decision, factoresPartido, focosPartido, planAjuste, proyeccionPartido, responsableFactor, lider,
    planContraRealidad, radarPartido, RADAR_EJES,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PARTIDO;
