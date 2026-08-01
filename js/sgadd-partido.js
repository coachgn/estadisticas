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
  const COLS_BOX = ['MIN', 'PTS', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I',
                    'RT', 'AST', 'PR', 'PP', 'VAL'];

  /* En cuáles marcamos desvío. Contar rebotes de un partido contra el
     promedio tiene sentido; el T3% de 2 intentos, no. */
  const COLS_DESVIO = ['PTS', 'RT', 'AST', 'VAL'];

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

  return {
    Z_ATIPICO, MIN_MINUTOS, MIN_PARTIDOS_JUGADOR, COLS_BOX, COLS_DESVIO, CONTRASTE_EQUIPO,
    analizar, desviosLado, contrasteEquipo, ajusteJugadores, nombreCorto,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PARTIDO;
