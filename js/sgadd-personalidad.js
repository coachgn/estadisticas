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
    return { ejes, rasgos, arquetipo: arquetipo(idx, e, ejes, rasgos), resumen: resumen(idx, e, ejes) };
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

  /** Dos líneas: qué hace bien y qué le cuesta, en términos de rendimiento. */
  function resumen(idx, e) {
    const claves = ['eFG%', 'PePP%', 'RTL%', 'RO%', 'eFG Opp%', 'PP Opp%', 'RTL Opp%', 'RO Opp%'];
    const leidas = claves.map(k => idx.leer(e.clave, k)).filter(r => r && r.percentil !== null);
    if (!leidas.length) return null;
    const orden = leidas.slice().sort((a, b) => b.percentil - a.percentil);
    return {
      fuerte: orden[0],
      debil: orden[orden.length - 1],
      of: idx.leer(e.clave, 'RTNG OFF'),
      def: idx.leer(e.clave, 'RTNG DEF'),
    };
  }

  return { EJES, FUERTE, LEVE, perfil, arquetipo, resumen };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_PERSONALIDAD;
