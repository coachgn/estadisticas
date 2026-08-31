/* =====================================================================
   SGADD · Glosario de métricas · GENERADO, no editar a mano

   Sale de `MOTORSTATS_MANUAL_3_RECORRIDO_Y_GLOSARIO.html`, que vive en el
   repo del motor. Para regenerarlo:

       node generar-glosario.js

   NO SE EDITA ACÁ: cualquier cambio se pierde en la próxima corrida. Si una
   definición está mal, se corrige en el manual del motor — que es la fuente
   que el club audita — y se vuelve a generar.

   77 entradas.
   ===================================================================== */

const SGADD_GLOSARIO = (function () {
  'use strict';

  const ENTRADAS = [
  {
    sigla: "CONDICION",
    nombre: "Condición",
    lectura: "Ver la advertencia debajo de esta tabla",
    hoja: "BD · 4F",
    familia: "A · Identificación",
  },
  {
    sigla: "EQUIPO",
    nombre: "Equipo",
    lectura: "Es la clave que agrupa toda la temporada",
    hoja: "todas",
    familia: "A · Identificación",
  },
  {
    sigla: "FASE",
    nombre: "Fase",
    lectura: "REGULAR, PLAYOFF, FINAL…",
    hoja: "todas",
    familia: "A · Identificación",
  },
  {
    sigla: "FECHA",
    nombre: "Fecha",
    lectura: "El motor no la completa. Es para que la cargues vos si querés",
    hoja: "BD · 4F",
    familia: "A · Identificación",
  },
  {
    sigla: "ID_ARCHIVO",
    nombre: "Identificador de Drive",
    lectura: "No lo borres. Es lo que impide los duplicados",
    hoja: "BD · 4F",
    familia: "A · Identificación",
  },
  {
    sigla: "NOMBRES",
    nombre: "Jugador",
    lectura: "Agrupa por texto exacto: cuidado con los espacios",
    hoja: "J",
    familia: "A · Identificación",
  },
  {
    sigla: "PARTIDO",
    nombre: "Partido",
    lectura: "AMANCAY vs VILLA SAN MARTIN",
    hoja: "BD · 4F",
    familia: "A · Identificación",
  },
  {
    sigla: "RESULTADO",
    nombre: "Resultado",
    lectura: "Calculado comparando PTS contra PTSopp",
    hoja: "BD · 4F",
    familia: "A · Identificación",
  },
  {
    sigla: "TORNEO",
    nombre: "Torneo",
    lectura: "APERTURA, CLAUSURA… o vacío si no usás el separador",
    hoja: "todas",
    familia: "A · Identificación",
  },
  {
    sigla: "MIN",
    nombre: "Minutos",
    formula: "suma · ÷ PJ",
    lectura: "Minutos en cancha. Un equipo suma 200 por partido (5 jugadores × 40′)",
    hoja: "todas",
    familia: "B · Volumen",
  },
  {
    sigla: "PACE",
    nombre: "Ritmo",
    formula: "(PLAYS − RO + PLAYSopp − ROopp) / 2 × 200 / MIN",
    lectura: "Posesiones por partido de 40′. Más alto = juego más rápido",
    hoja: "E",
    familia: "B · Volumen",
  },
  {
    sigla: "PJ",
    nombre: "Partidos Jugados",
    formula: "conteo de partidos",
    lectura: "Cuántos partidos entran en ese acumulado. El detector de duplicados",
    hoja: "AC · PR",
    familia: "B · Volumen",
  },
  {
    sigla: "PLAYS",
    nombre: "Jugadas finalizadas",
    formula: "TCI + 0.44·T1I + PP",
    lectura: "Cuántas veces terminaste una jugada. Sí cuenta cada segunda oportunidad",
    hoja: "todas",
    familia: "B · Volumen",
  },
  {
    sigla: "POS",
    nombre: "Posesiones",
    formula: "TCI + 0.44·T1I + PP − RO",
    lectura: "Cuántas veces tuviste la pelota. El rebote ofensivo no genera posesión nueva",
    hoja: "E",
    familia: "B · Volumen",
  },
  {
    sigla: "+/-",
    nombre: "Diferencial",
    formula: "del acta",
    lectura: "Diferencia de puntos con el jugador en cancha",
    hoja: "J",
    familia: "C · Anotación",
  },
  {
    sigla: "eFG%",
    nombre: "Efectividad de tiro ajustada",
    formula: "(TCC + 0.5·T3C) / TCI",
    lectura: "El TC% corregido: reconoce que un triple vale más. La métrica de tiro más útil",
    hoja: "BD · PR · 4F",
    familia: "C · Anotación",
  },
  {
    sigla: "PPP",
    nombre: "Puntos Por Play",
    formula: "PTS / PLAYS",
    lectura: "Cuánto rinde cada jugada. ~0.90 es la media formativa; por encima de 1.00 es muy bueno",
    hoja: "BD · PR",
    familia: "C · Anotación",
  },
  {
    sigla: "PTS",
    nombre: "Puntos",
    formula: "del acta",
    lectura: "Puntos anotados",
    hoja: "todas",
    familia: "C · Anotación",
  },
  {
    sigla: "TS%",
    nombre: "Eficiencia verdadera",
    formula: "PTS / (2·(TCI + 0.44·T1I))",
    lectura: "Como el eFG% pero además cuenta los libres. La foto más completa del tirador",
    hoja: "BD · PR",
    familia: "C · Anotación",
  },
  {
    sigla: "USG%",
    nombre: "Uso",
    formula: "(PLAYS × MINequipo/5) / (PLAYSequipo × MIN)",
    lectura: "Qué porcentaje de las jugadas del equipo termina este jugador mientras está en cancha",
    hoja: "J",
    familia: "C · Anotación",
  },
  {
    sigla: "VAL",
    nombre: "Valoración",
    formula: "del acta (fórmula FIBA)",
    lectura: "Índice global: suma lo bueno y resta lo malo. Útil de un vistazo, engañoso si se lee solo",
    hoja: "todas",
    familia: "C · Anotación",
  },
  {
    sigla: "PPT1",
    nombre: "Puntos por libre intentado",
    formula: "T1C / T1I",
    lectura: "Coincide con T1% porque cada libre vale 1",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "PPT2",
    nombre: "Puntos por intento de 2",
    formula: "(T2C × 2) / T2I",
    lectura: "Cuánto rinde cada intento de dos",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "PPT3",
    nombre: "Puntos por intento de 3",
    formula: "(T3C × 3) / T3I",
    lectura: "Cuánto rinde cada intento de tres",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "T1%",
    nombre: "Porcentaje de libres",
    formula: "T1C / T1I",
    lectura: "Efectividad desde la línea",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "T1C",
    nombre: "Libres convertidos",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "T1I",
    nombre: "Libres intentados",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "T2%",
    nombre: "Porcentaje de dobles",
    formula: "T2C / T2I",
    lectura: "Efectividad en la zona y la media distancia",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "T2C",
    nombre: "Dobles convertidos",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "T2I",
    nombre: "Dobles intentados",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "T3%",
    nombre: "Porcentaje de triples",
    formula: "T3C / T3I",
    lectura: "Efectividad desde el perímetro",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "T3C",
    nombre: "Triples convertidos",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "T3I",
    nombre: "Triples intentados",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "TC%",
    nombre: "Porcentaje de campo",
    formula: "TCC / TCI",
    lectura: "El porcentaje clásico. Preferí el eFG%",
    hoja: "BD · PR",
    familia: "D · Tiro",
  },
  {
    sigla: "TCC",
    nombre: "Tiros de campo convertidos",
    formula: "T2C + T3C",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "TCI",
    nombre: "Tiros de campo intentados",
    formula: "T2I + T3I",
    lectura: "Volumen",
    hoja: "todas",
    familia: "D · Tiro",
  },
  {
    sigla: "RTL%",
    nombre: "Ratio de tiros libres",
    formula: "T1C / TCI",
    lectura: "Cuántos puntos de libre sacás por cada tiro de campo",
    hoja: "BD · PR · 4F",
    familia: "D · Tiro / 4F",
  },
  {
    sigla: "PePP%",
    nombre: "Jugadas que terminan en pérdida",
    formula: "PP / PLAYS",
    lectura: "Cuántas jugadas regalás",
    hoja: "BD · PR",
    familia: "E · Distribución",
  },
  {
    sigla: "PT1%",
    nombre: "Jugadas que terminan en libres",
    formula: "(0.44 × T1I) / PLAYS",
    lectura: "Cuánto vivís de la línea",
    hoja: "BD · PR",
    familia: "E · Distribución",
  },
  {
    sigla: "PT2%",
    nombre: "Jugadas que terminan en doble",
    formula: "T2I / PLAYS",
    lectura: "Peso del juego interior y de media distancia",
    hoja: "BD · PR",
    familia: "E · Distribución",
  },
  {
    sigla: "PT3%",
    nombre: "Jugadas que terminan en triple",
    formula: "T3I / PLAYS",
    lectura: "Peso del juego exterior",
    hoja: "BD · PR",
    familia: "E · Distribución",
  },
  {
    sigla: "RD",
    nombre: "Rebotes defensivos",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "F · Rebotes",
  },
  {
    sigla: "RD%",
    nombre: "% de rebote defensivo",
    formula: "RD / (RD + ROopp)",
    lectura: "De los rebotes disponibles en tu tablero, cuántos tomaste. >75 % es sólido",
    hoja: "BD · PR",
    familia: "F · Rebotes",
  },
  {
    sigla: "RO",
    nombre: "Rebotes ofensivos",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "F · Rebotes",
  },
  {
    sigla: "RO%",
    nombre: "% de rebote ofensivo",
    formula: "RO / (RO + RDopp)",
    lectura: "De los disponibles en el tablero rival, cuántos tomaste. >30 % es agresivo",
    hoja: "BD · PR",
    familia: "F · Rebotes",
  },
  {
    sigla: "RT",
    nombre: "Rebotes totales",
    formula: "RD + RO",
    lectura: "Volumen",
    hoja: "todas",
    familia: "F · Rebotes",
  },
  {
    sigla: "RT%",
    nombre: "% de rebote total",
    formula: "RT / (RT + RDopp + ROopp)",
    lectura: "Tu dominio general del rebote",
    hoja: "BD · PR",
    familia: "F · Rebotes",
  },
  {
    sigla: "AST",
    nombre: "Asistencias",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "AST-PP",
    nombre: "Ratio asistencia / pérdida",
    formula: "AST / PP",
    lectura: ">1.5 es buen manejo. <1.0 es preocupante",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "AST%",
    nombre: "% de asistencias",
    formula: "AST / TCC",
    lectura: "Qué proporción de los tiros convertidos vino de asistencia. Mide juego colectivo",
    hoja: "BD · PR",
    familia: "G · Creación",
  },
  {
    sigla: "FC",
    nombre: "Faltas cometidas",
    formula: "del acta",
    lectura: "Disciplina",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "FR",
    nombre: "Faltas recibidas",
    formula: "del acta",
    lectura: "Capacidad de generar contacto",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "PP",
    nombre: "Pelotas perdidas",
    formula: "del acta",
    lectura: "Volumen",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "PR",
    nombre: "Promedios E / J / 4F",
    formula: "del acta",
    lectura: "Robos",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "PR%",
    nombre: "% de recuperación",
    formula: "PR / PPopp",
    lectura: "De las pérdidas del rival, cuántas forzaste vos",
    hoja: "BD · PR",
    familia: "G · Creación",
  },
  {
    sigla: "TC",
    nombre: "Tapones cometidos",
    formula: "del acta",
    lectura: "Tal como lo registra el acta de la CABB",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "TR",
    nombre: "Tapones recibidos",
    formula: "del acta",
    lectura: "Tal como lo registra el acta de la CABB",
    hoja: "todas",
    familia: "G · Creación",
  },
  {
    sigla: "PLAYSopp",
    lectura: "Jugadas del rival",
    uso: "PACE, PPP DEF",
    hoja: "todas",
    familia: "H · Rival",
  },
  {
    sigla: "PPopp",
    lectura: "Pérdidas del rival",
    uso: "PR%, PP Opp%",
    hoja: "todas",
    familia: "H · Rival",
  },
  {
    sigla: "PTSopp",
    lectura: "Puntos del rival",
    uso: "RESULTADO, PPP DEF, RTNG DEF",
    hoja: "todas",
    familia: "H · Rival",
  },
  {
    sigla: "RDopp",
    lectura: "Rebotes defensivos del rival",
    uso: "RO%, RT%",
    hoja: "todas",
    familia: "H · Rival",
  },
  {
    sigla: "ROopp",
    lectura: "Rebotes ofensivos del rival",
    uso: "RD%, RT%, PACE",
    hoja: "todas",
    familia: "H · Rival",
  },
  {
    sigla: "eFG Opp%",
    nombre: "eFG% concedido",
    formula: "ídem, del rival",
    familia: "I · 4 Factores",
  },
  {
    sigla: "PP Opp%",
    nombre: "TOV% forzado",
    formula: "ídem, del rival",
    familia: "I · 4 Factores",
  },
  {
    sigla: "PP%",
    nombre: "Turnover Rate (TOV%)",
    formula: "pérdidas sobre jugadas",
    familia: "I · 4 Factores",
  },
  {
    sigla: "RO Opp%",
    nombre: "ORB% concedido",
    formula: "ídem, del rival",
    familia: "I · 4 Factores",
  },
  {
    sigla: "RTL Opp%",
    nombre: "FTR concedido",
    formula: "ídem, del rival",
    familia: "I · 4 Factores",
  },
  {
    sigla: "NET PPP",
    nombre: "Diferencial por posesión",
    formula: "PPP OF − PPP DEF",
    lectura: "Tu ventaja neta por jugada",
    familia: "J · Ratings",
  },
  {
    sigla: "NET RTNG",
    nombre: "Rating neto",
    formula: "RTNG OFF − RTNG DEF",
    lectura: "El mejor indicador único de la calidad de un equipo",
    familia: "J · Ratings",
  },
  {
    sigla: "PPP DEF",
    nombre: "Puntos por posesión defensivos",
    formula: "PTSopp / PLAYSopp",
    lectura: "Cuánto te anotan por jugada",
    familia: "J · Ratings",
  },
  {
    sigla: "PPP OF",
    nombre: "Puntos por posesión ofensivos",
    formula: "PTS / PLAYS",
    lectura: "Cuánto anotás por jugada",
    familia: "J · Ratings",
  },
  {
    sigla: "RTNG DEF",
    nombre: "Rating defensivo",
    formula: "PPP DEF × 100",
    lectura: "Puntos recibidos cada 100 posesiones",
    familia: "J · Ratings",
  },
  {
    sigla: "RTNG OFF",
    nombre: "Rating ofensivo",
    formula: "PPP OF × 100",
    lectura: "Puntos cada 100 posesiones",
    familia: "J · Ratings",
  },
  {
    sigla: "4F",
    nombre: "Las tres hojas de Cuatro Factores",
    familia: "K · Hojas",
  },
  {
    sigla: "AC",
    nombre: "Acumulado E / J / 4F",
    familia: "K · Hojas",
  },
  {
    sigla: "BD",
    nombre: "Base Datos E / Base Datos J",
    familia: "K · Hojas",
  },
  {
    sigla: "E / J",
    nombre: "Sólo equipos / sólo jugadores",
    familia: "K · Hojas",
  },
  ];

  /* Índice por sigla en MAYÚSCULAS: es como se buscan desde el tooltip, y
     el catálogo del panel escribe `eFG%` mientras el manual puede escribir
     `EFG%`. */
  const PORSIGLA = {};
  ENTRADAS.forEach((e) => { PORSIGLA[e.sigla.toUpperCase()] = e; });

  /** La definición de una sigla, o `null`. */
  function buscar(sigla) {
    if (!sigla) return null;
    return PORSIGLA[String(sigla).toUpperCase().trim()] || null;
  }

  /**
   * La definición CORTA, para el tooltip.
   *
   * Se prefiere `lectura` sobre `nombre`: el nombre completo de `eFG%` es
   * "Effective Field Goal Percentage", que no le dice nada a nadie que no
   * lo sepa ya. Lo que sirve en un tooltip es qué significa el número.
   */
  function corta(sigla) {
    const e = buscar(sigla);
    if (!e) return null;
    return e.lectura || e.uso || e.nombre || null;
  }

  /** Busca por sigla, nombre o texto. Sin acentos ni mayúsculas. */
  function filtrar(q) {
    const t = String(q || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
    if (!t) return ENTRADAS.slice();
    return ENTRADAS.filter((e) => {
      const todo = [e.sigla, e.nombre, e.lectura, e.uso, e.formula, e.familia]
        .filter(Boolean).join(' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return todo.indexOf(t) !== -1;
    });
  }

  /** Las familias del manual, en su propio orden (la letra las ordena). */
  function grupos() {
    const vistos = [];
    ENTRADAS.forEach((e) => {
      if (e.familia && vistos.indexOf(e.familia) === -1) vistos.push(e.familia);
    });
    return vistos;
  }

  return { ENTRADAS, buscar, corta, filtrar, grupos };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_GLOSARIO;
