/* =====================================================================
   SGADD · PERSONALIDAD — identidad táctica derivada de datos

   Traduce números a rasgos de juego. La idea no es mostrar más promedios,
   sino responder "¿a qué juega este equipo?".

   DECISIÓN CENTRAL: todo se mide en PERCENTIL contra su propia liga, no en
   valores absolutos. Un PACE de 80 es rapidísimo en una liga y lento en
   otra. Con percentiles, el mismo código sirve para La Plata y para Liga
   Argentina sin tocar nada.

   Cada eje tiene dos polos y el equipo cae en algún lugar entre ellos.
   No hay polo "bueno" y polo "malo": son formas de jugar. Un equipo que
   cuida el balón no es mejor que uno que arriesga, es distinto.
   ===================================================================== */

const SGADD_PERSONALIDAD = (function () {
  'use strict';

  /* ---------------------------------------------------------------------
     EJES DE IDENTIDAD

     `metrica`  de dónde sale el percentil
     `izq/der`  los dos polos. `der` = percentil alto.
     `neutro`   qué decir cuando está en el medio
     `familia`  para agrupar en el resumen
     --------------------------------------------------------------------- */
  const EJES = [
    {
      id: 'ritmo', metrica: 'PACE', familia: 'tempo',
      titulo: 'Ritmo',
      izq: 'Controlado', der: 'Acelerado',
      fIzq: 'de ritmo controlado', fDer: 'de ritmo alto',
      neutro: 'Ritmo de liga',
      descIzq: 'Juega pocas posesiones: prioriza el juego elaborado sobre la transición.',
      descDer: 'Empuja el ritmo. Más posesiones que el resto: busca correr.',
    },
    {
      id: 'perimetro', metrica: 'PT3%', familia: 'ataque',
      titulo: 'Origen del tiro',
      izq: 'Juego interior', der: 'Juego perimetral',
      fIzq: 'de juego interior', fDer: 'perimetral',
      neutro: 'Reparto equilibrado',
      descIzq: 'Poco volumen de triples: el ataque pasa por adentro.',
      descDer: 'Gran parte de sus plays terminan en triple.',
    },
    {
      id: 'tablero', metrica: 'RO%', familia: 'ataque',
      titulo: 'Rebote ofensivo',
      izq: 'Se repliega', der: 'Ataca el tablero',
      fIzq: 'poco agresivo en el rebote de ataque', fDer: 'agresivo en el rebote de ataque',
      neutro: 'Rebote ofensivo normal',
      descIzq: 'Casi no va al rebote de ataque: prioriza el balance defensivo.',
      descDer: 'Manda gente al tablero. Vive de la segunda oportunidad.',
    },
    {
      id: 'cuidado', metrica: 'PePP%', familia: 'ataque', invertirEje: true,
      titulo: 'Manejo del balón',
      izq: 'Arriesgado', der: 'Cuidadoso',
      fIzq: 'arriesgado con la pelota', fDer: 'cuidadoso con la pelota',
      neutro: 'Pérdidas en la media',
      descIzq: 'Pierde más que la media: ataque de riesgo o poco control.',
      descDer: 'Cuida la pelota. Pocas pérdidas por posesión.',
    },
    {
      id: 'colectivo', metrica: 'AST%', familia: 'ataque',
      titulo: 'Generación',
      izq: 'Resolución individual', der: 'Juego coral',
      fIzq: 'de resolución individual', fDer: 'de juego coral',
      neutro: 'Mezcla ambas',
      descIzq: 'Pocas canastas asistidas: resuelve más por talento individual.',
      descDer: 'Alto porcentaje de canastas asistidas: la pelota circula.',
    },
    {
      id: 'contacto', metrica: 'RTL%', familia: 'ataque',
      titulo: 'Búsqueda de contacto',
      izq: 'Juega afuera', der: 'Va a la línea',
      fIzq: 'poco buscador de contacto', fDer: 'buscador de contacto',
      neutro: 'Contacto normal',
      descIzq: 'Genera pocos libres en relación a lo que tira.',
      descDer: 'Ataca el aro y vive de la línea de libres.',
    },
    {
      id: 'presion', metrica: 'PP Opp%', familia: 'defensa',
      titulo: 'Presión defensiva',
      izq: 'Defensa de posición', der: 'Defensa que roba',
      fIzq: 'de defensa posicional', fDer: 'de defensa que roba',
      neutro: 'Presión media',
      descIzq: 'Fuerza pocas pérdidas: defiende sin arriesgar.',
      descDer: 'Roba y descoloca. Genera posesiones extra por robo.',
    },
    {
      id: 'proteccion', metrica: 'eFG Opp%', familia: 'defensa', invertirEje: true,
      titulo: 'Protección del aro',
      izq: 'Concede tiro cómodo', der: 'Incomoda el tiro',
      fIzq: 'permisivo con el tiro rival', fDer: 'incómodo para tirar',
      neutro: 'Tiro rival en la media',
      descIzq: 'El rival tira cómodo contra ellos.',
      descDer: 'Baja el porcentaje del rival: contesta bien.',
    },
  ];

  /* Umbrales. Con percentiles, ±17 desde 50 marca el tercio. */
  const FUERTE = 22;    // se considera un rasgo definitorio
  const LEVE = 10;      // apenas se inclina

  /**
   * Calcula el perfil completo de un equipo.
   * @param idx  índice SGADD
   * @param e    equipo
   */
  function perfil(idx, e) {
    const ejes = EJES.map(def => {
      const r = idx.leer(e.clave, def.metrica);
      if (!r || r.percentil === null) return null;

      /* El percentil ya viene con la dirección de la métrica resuelta (en
         invertidas, menos es mejor = percentil alto). Para los ejes donde
         el polo derecho NO es "lo bueno" sino "lo otro", se da vuelta. */
      const p = def.invertirEje ? r.percentil : r.percentil;
      const desvio = p - 50;
      const mag = Math.abs(desvio);

      let polo = 'neutro', etiqueta = def.neutro, desc = '';
      if (mag >= LEVE) {
        polo = desvio > 0 ? 'der' : 'izq';
        etiqueta = desvio > 0 ? def.der : def.izq;
        desc = desvio > 0 ? def.descDer : def.descIzq;
      }

      return {
        id: def.id, titulo: def.titulo, familia: def.familia,
        izq: def.izq, der: def.der,
        percentil: p, desvio: desvio, magnitud: mag,
        polo: polo, etiqueta: etiqueta, descripcion: desc,
        // Forma corta que encaja en una oración ("se define por ser X y Z")
        frase: polo === 'der' ? def.fDer : polo === 'izq' ? def.fIzq : '',
        fuerte: mag >= FUERTE,
        valor: r.formateado, mediana: r.tipoFormateado, metrica: def.metrica,
        muestraSuficiente: r.muestraSuficiente !== false,
      };
    }).filter(Boolean);

    const rasgos = ejes.filter(x => x.fuerte).sort((a, b) => b.magnitud - a.magnitud);
    return { ejes, rasgos, arquetipo: arquetipo(idx, e, ejes, rasgos),
             resumen: resumen(idx, e, ejes), insight: insight(idx, e) };
  }

  /* ---------------------------------------------------------------------
     ARQUETIPO — la frase que sintetiza al equipo.
     Se arma con los rasgos más marcados, no con una lista fija.
     --------------------------------------------------------------------- */
  function arquetipo(idx, e, ejes, rasgos) {
    const neto = idx.leer(e.clave, 'NET RTNG');
    const porId = {};
    ejes.forEach(x => { porId[x.id] = x; });

    /* Titular: combina tempo + orientación del ataque. */
    const ritmo = porId.ritmo, perim = porId.perimetro;
    let titulo;
    if (!ritmo || !perim) titulo = 'Perfil en construcción';
    else if (ritmo.polo === 'der' && perim.polo === 'der') titulo = 'Ataque rápido y perimetral';
    else if (ritmo.polo === 'der' && perim.polo === 'izq') titulo = 'Corre para atacar el aro';
    else if (ritmo.polo === 'izq' && perim.polo === 'der') titulo = 'Juego pausado de tiro exterior';
    else if (ritmo.polo === 'izq' && perim.polo === 'izq') titulo = 'Media cancha y juego interior';
    else if (perim.polo === 'der') titulo = 'Equipo de perímetro';
    else if (perim.polo === 'izq') titulo = 'Equipo de juego interior';
    else if (ritmo.polo === 'der') titulo = 'Equipo de ritmo alto';
    else if (ritmo.polo === 'izq') titulo = 'Equipo de ritmo controlado';
    else titulo = 'Perfil equilibrado';

    if (!rasgos.length) {
      return { titulo: titulo, frase: 'No hay rasgos que lo separen claramente de la media de su liga.', neto: neto };
    }

    const partes = rasgos.slice(0, 3).map(r => r.frase || r.etiqueta.toLowerCase());
    let frase = 'Se define por ser ' + listar(partes) + '.';

    /* El contraste es lo que hace interesante un perfil: cuando lo mejor y
       lo peor viven en la misma familia, ahí hay una lectura táctica. */
    const of = ejes.filter(x => x.familia === 'ataque').sort((a, b) => b.desvio - a.desvio);
    if (of.length >= 2) {
      const mejor = of[0], peor = of[of.length - 1];
      if (mejor.magnitud >= LEVE && peor.magnitud >= LEVE && mejor.polo !== peor.polo) {
        frase += ' Su contraste en ataque: ' + (mejor.frase || mejor.etiqueta.toLowerCase()) +
          ', pero ' + (peor.frase || peor.etiqueta.toLowerCase()) + '.';
      }
    }
    return { titulo: titulo, frase: frase, neto: neto };
  }

  function listar(a) {
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + ' y ' + a[1];
    return a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
  }

  /** Top 3 y bottom 3 sobre los 8 factores: lectura corta de para qué
      prepararlos y por dónde atacarlos. */
  function resumen(idx, e) {
    const claves = ['eFG%', 'PePP%', 'RTL%', 'RO%', 'eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'];
    const leidas = claves.map(k => idx.leer(e.clave, k)).filter(r => r && r.percentil !== null);
    if (!leidas.length) return null;
    const orden = leidas.slice().sort((a, b) => b.percentil - a.percentil);
    const n = Math.min(3, Math.floor(orden.length / 2));
    return {
      fuertes: orden.slice(0, n),
      debiles: orden.slice(-n).reverse(),
      // compat con la versión anterior
      fuerte: orden[0], debil: orden[orden.length - 1],
      of: idx.leer(e.clave, 'RTNG OFF'),
      def: idx.leer(e.clave, 'RTNG DEF'),
    };
  }

  /* =====================================================================
     INSIGHT · el patrón de las victorias

     Compara las mismas métricas en partidos ganados y perdidos. La gracia
     no es listar diferencias, sino DISTINGUIR lo que cambia de lo que se
     mantiene: si el rebote es igual en ambas y el triple se derrumba, el
     problema no es el rebote.
     ===================================================================== */

  /* Métricas a contrastar. `umbral` = diferencia mínima (en fracción) para
     considerar que cambió de verdad y no es ruido. */
  const CONTRASTES = [
    { k: 'eFG%',  label: 'eFG%',            umbral: 0.030, tipo: 'pct', cuerpo: 'la eficiencia de tiro' },
    { k: 'T3%',   label: 'T3%',             umbral: 0.045, tipo: 'pct', cuerpo: 'el triple' },
    { k: 'T2%',   label: 'T2%',             umbral: 0.040, tipo: 'pct', cuerpo: 'el tiro de dos' },
    { k: 'T1%',   label: 'T1%',             umbral: 0.060, tipo: 'pct', cuerpo: 'el tiro libre' },
    { k: 'PePP%', label: 'pérdidas',        umbral: 0.020, tipo: 'pct', cuerpo: 'el cuidado del balón', invertida: true },
    { k: 'RO%',   label: 'rebote ofensivo', umbral: 0.030, tipo: 'pct', cuerpo: 'el rebote ofensivo' },
    { k: 'AST%',  label: 'canastas asistidas', umbral: 0.040, tipo: 'pct', cuerpo: 'la circulación de pelota' },
    { k: 'eFG Opp%', label: 'eFG% permitido', umbral: 0.030, tipo: 'pct', cuerpo: 'la defensa del tiro', invertida: true },
  ];

  const PJ_MINIMO_INSIGHT = 3;   // menos de 3 de cada lado no dice nada

  function insight(idx, e) {
    const pr = e.porResultado;
    if (!pr || !pr.GANADO || !pr.PERDIDO) return null;
    const g = pr.GANADO, d = pr.PERDIDO;
    if (!g.pj || !d.pj) {
      return { suficiente: false, g: g, d: d,
        motivo: !g.pj ? 'Todavía no ganó ningún partido.' : 'Todavía no perdió ningún partido.' };
    }

    const filas = CONTRASTES.map(c => {
      const vg = g.tiro ? g.tiro[c.k] : null;
      const vd = d.tiro ? d.tiro[c.k] : null;
      if (vg === null || vd === null || vg === undefined || vd === undefined) return null;
      const dif = vg - vd;
      // En invertidas (pérdidas, eFG permitido) bajar en victoria es a favor.
      const aFavor = c.invertida ? dif < 0 : dif > 0;
      return {
        clave: c.k, label: c.label, cuerpo: c.cuerpo, invertida: !!c.invertida,
        victoria: vg, derrota: vd, dif: dif, magnitud: Math.abs(dif),
        cambia: Math.abs(dif) >= c.umbral, aFavor: aFavor,
      };
    }).filter(Boolean);

    const cambian = filas.filter(f => f.cambia).sort((a, b) => b.magnitud - a.magnitud);
    const estables = filas.filter(f => !f.cambia).sort((a, b) => a.magnitud - b.magnitud);

    return {
      suficiente: g.pj >= PJ_MINIMO_INSIGHT && d.pj >= PJ_MINIMO_INSIGHT,
      g: g, d: d, filas: filas, cambian: cambian, estables: estables,
      texto: narrar(idx, e, g, d, cambian, estables),
    };
  }

  const pct = v => (v * 100).toFixed(1).replace('.', ',') + '%';

  function narrar(idx, e, g, d, cambian, estables) {
    const partes = [];

    /* 1. El umbral: con qué eFG% gana. */
    const efg = cambian.concat(estables).find(f => f.clave === 'eFG%');
    if (efg) {
      partes.push('Gana cuando el eFG% llega a ' + pct(efg.victoria) +
        '; en las derrotas cae a ' + pct(efg.derrota) + '.');
    }

    /* 2. Lo que se derrumba, contrastado con lo que NO se mueve. Esa
          oposición es lo que convierte un dato en un diagnóstico. */
    const derrumbe = cambian.filter(f => f.aFavor && f.clave !== 'eFG%')[0];
    if (derrumbe) {
      let frase = 'La diferencia más grande está en ' + derrumbe.cuerpo +
        ': ' + pct(derrumbe.victoria) + ' en victorias contra ' + pct(derrumbe.derrota) + ' en derrotas';
      const firme = estables.find(f => f.clave !== 'eFG%');
      if (firme) {
        frase += ', mientras que ' + firme.cuerpo + ' se mantiene igual (' +
          pct(firme.victoria) + ' vs ' + pct(firme.derrota) + ')';
      }
      partes.push(frase + '.');
    }

    /* 3. El punto de fuga: lo peor de la temporada, gane o pierda. */
    const fuga = ['T1%', 'T3%', 'PePP%'].map(k => {
      const r = idx.leer(e.clave, k === 'T1%' ? 'T1%' : k === 'T3%' ? 'T3%' : 'PePP%');
      return r && r.percentil !== null ? { k: k, r: r } : null;
    }).filter(Boolean).sort((a, b) => a.r.percentil - b.r.percentil)[0];

    if (fuga && fuga.r.percentil <= 30) {
      partes.push('Punto de fuga permanente: ' + fuga.r.label.toLowerCase() + ' ' +
        fuga.r.formateado + ' contra ' + fuga.r.tipoFormateado + ' de la liga (percentil ' +
        fuga.r.percentil.toFixed(0) + ').');
    }

    /* 4. Si nada se mueve, eso TAMBIÉN es una conclusión. */
    if (!cambian.length) {
      partes.push('Ninguna métrica cambia de forma clara entre ganar y perder: ' +
        'la diferencia parece estar más en el rival o en el cierre de los partidos que en su propio juego.');
    }

    return partes;
  }

  return { EJES, FUERTE, LEVE, CONTRASTES, PJ_MINIMO_INSIGHT, perfil, arquetipo, resumen, insight };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PERSONALIDAD;
