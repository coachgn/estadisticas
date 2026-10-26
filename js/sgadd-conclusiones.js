/* =========================================================================
   SGADD · CONCLUSIONES CLÍNICAS PARA EL DT (punto 141)

   Una card arriba de la ficha del EQUIPO y del JUGADOR que le habla al
   cuerpo técnico en tres ejes:

     ▲ Lo que se hace bien y hay que sostener   percentil ≥ 70 contra la liga
     ● Ajustes alcanzables                       percentil 40-69, variables entrenables
     ▼ Puntos de quiebre                         percentil < 40, y los detectores del PBP

   Dos fuentes, y cada ítem dice cuál:
     · el BOX SCORE (el índice): síncrono, siempre;
     · el PLAY-BY-PLAY (el paquete de laboratorio): solo con la capa `pbp`,
       montado después por SGADD_PBP.montarPendientes.

   Lo que se tomó de las plataformas de referencia, y cómo:
     · Selección de tiro por ZONA (la idea del eFG% por ubicación): puntos
       por tiro de cada zona contra la liga EN ESA zona, ajustados por
       muestra; la trampa de media distancia sale de ahí.
     · Tipos de posesión (la idea de los play types): el play-by-play no
       registra el pick & roll, el aislamiento ni el poste. Registra el
       RELOJ y el ORIGEN, así que las situaciones son las que existen:
       transición (0-7 s), juego armado (8-17 s), final del reloj (18-24 s),
       segunda oportunidad tras rebote ofensivo y reinicio tras falta.
       Se califican de Excelente a Muy pobre por puntos por tiro contra la
       liga en esa misma situación.
     · Evaluar por ROL (la idea de los índices por función): las métricas
       que se juzgan de un jugador dependen de su función en cancha. A un
       ancla defensiva no se le pide crear.

   Motor PURO arriba (`equipo`, `jugador`, `pbpEquipo`, `pbpJugador`):
   entra el índice o el paquete, salen ítems. La vista abajo reusa la del
   Bento de Rendimiento (`SGADD_RENDIMIENTO.vista`).
   ========================================================================= */
const SGADD_CONCLUSIONES = (function () {
  'use strict';

  const VERDE = 70, ROJO = 40;
  const K = 20;                 // ajuste por muestra: tiros de la liga sumados
  const MIN_TIROS = 20;         // tiros mínimos de una situación para calificarla
  const MAX_ITEMS = 4;

  const esNum = (v) => typeof v === 'number' && isFinite(v);
  const num = (v, d) => esNum(v) ? v.toFixed(d == null ? 1 : d).replace('.', ',') : '—';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** El semáforo clínico: verde desde 70, rojo bajo 40. */
  function tonoPct(p) {
    if (!esNum(p)) return null;
    return p >= VERDE ? 'pos' : (p < ROJO ? 'neg' : 'aviso');
  }

  /* ================================================== EQUIPO · BOX SCORE */

  /* Cada métrica que se JUZGA, con lo que el asistente le dice al DT en
     cada eje. `entrenable` marca las que se pueden mover en una semana de
     práctica: son las que entran a «Ajustes». El ritmo y el reparto del
     tiro no se juzgan (punto 4): describen, no califican. */
  const EQ = {
    'RTNG OFF': { bien: 'El ataque produce por encima de la liga por posesión. La estructura ofensiva funciona: no tocarla.',
      mal: 'El ataque no llega a la media de la liga por posesión.' },
    'RTNG DEF': { bien: 'La defensa concede menos que la liga por posesión. Es la base del equipo.',
      mal: 'La defensa concede más que la liga por posesión.' },
    'eFG%': { bien: 'Tira bien: la selección y la ejecución del tiro están por encima de la liga.',
      ajuste: 'Selección de tiro: cambiar dobles largos por aro y triple sube el eFG% sin tirar más.',
      mal: 'Tira mal para la liga: revisar desde dónde se toman los tiros.', entrenable: true },
    'PePP%': { bien: 'Cuida la pelota: pierde menos que la liga.',
      ajuste: 'Cuidado del balón: decisiones en el primer pase y no forzar el último contra la ayuda.',
      mal: 'Pierde demasiadas pelotas: cada pérdida es una posesión regalada y, si es viva, el contraataque del rival.', entrenable: true },
    'RO%': { bien: 'Gana el cristal ofensivo: segundas oportunidades que valen posesiones extra.',
      ajuste: 'Rebote ofensivo: mandar un segundo jugador al cristal en los tiros desde la media distancia.',
      mal: 'Casi no genera segundas oportunidades en ataque.', entrenable: true },
    'RD%': { bien: 'Cierra el rebote defensivo: el rival no tiene segundas oportunidades.',
      ajuste: 'Rebote defensivo: bloquear el cierre antes de ir a la pelota, los cinco.',
      mal: 'Concede el rebote defensivo: el rival vuelve a tirar.', entrenable: true },
    'RTL%': { bien: 'Va a la línea más que la liga: ataca con verticalidad.',
      ajuste: 'Ir más a la línea: atacar el aro de frente y no en paralelo a la línea de fondo.',
      mal: 'Casi no va a la línea: el ataque vive del tiro en suspensión.', entrenable: true },
    'T1%': { bien: 'Convierte los libres por encima de la liga.',
      ajuste: 'Libres: rutina fija y volumen de práctica, el punto más barato de recuperar.',
      mal: 'Pierde puntos en la línea.', entrenable: true },
    'AST-PP': { bien: 'Asiste mucho más de lo que pierde: el balón circula con criterio.',
      ajuste: 'Relación asistencias/pérdidas: buscar el pase extra antes que la penetración forzada.',
      mal: 'Pierde casi tanto como asiste.', entrenable: true },
    'eFG Opp%': { bien: 'El rival tira mal contra esta defensa: incomoda el tiro.',
      ajuste: 'Contestar el tiro: llegar con la mano arriba sin regalar el contacto.',
      mal: 'El rival tira cómodo: la defensa llega tarde al tiro.', entrenable: true },
    'PP Opp%': { bien: 'Fuerza pérdidas por encima de la liga.',
      ajuste: 'Presión al balón: negar el pase de entrada al lado fuerte para forzar más pérdidas.', entrenable: true },
    'RO Opp%': { bien: 'El rival casi no rebotea en ataque.',
      mal: 'El rival se queda con sus propios rebotes: segundas oportunidades en contra.', entrenable: true },
    'RTL Opp%': { bien: 'Defiende sin cometer faltas: concede pocos libres.',
      ajuste: 'Disciplina defensiva: defender con los pies y no con las manos para conceder menos libres.',
      mal: 'Concede demasiados libres: faltas evitables.', entrenable: true },
  };

  /** Las conclusiones del box score de un equipo. `idx.leer` ya trae el
      percentil con la dirección de cada métrica (más alto = mejor). */
  function equipo(idx, e) {
    const out = { fortalezas: [], ajustes: [], alertas: [], muestra: true };
    if (!idx || !e || typeof idx.leer !== 'function') return out;
    const filas = Object.keys(EQ).map((k) => {
      const r = idx.leer(e.clave, k);
      if (!r || !esNum(r.valor) || !esNum(r.percentil)) return null;
      if (r.muestraSuficiente === false) out.muestra = false;
      return { k, r, d: EQ[k] };
    }).filter(Boolean);
    const item = (f, texto) => ({
      titulo: f.r.label, valor: f.r.formateado, texto,
      sub: 'percentil ' + Math.round(f.r.percentil) + ' · liga ' + f.r.tipoFormateado,
      tono: tonoPct(f.r.percentil), percentil: f.r.percentil, fuente: 'box', clave: f.k,
    });
    filas.filter(f => f.r.percentil >= VERDE && f.d.bien).sort((a, b) => b.r.percentil - a.r.percentil)
      .slice(0, MAX_ITEMS).forEach(f => out.fortalezas.push(item(f, f.d.bien)));
    /* Ajustes: rango medio, solo lo entrenable, primero lo que más margen
       tiene (el percentil más bajo dentro del rango). */
    filas.filter(f => f.r.percentil >= ROJO && f.r.percentil < VERDE && f.d.entrenable && f.d.ajuste)
      .sort((a, b) => a.r.percentil - b.r.percentil).slice(0, 3).forEach(f => out.ajustes.push(item(f, f.d.ajuste)));
    filas.filter(f => f.r.percentil < ROJO && f.d.mal).sort((a, b) => a.r.percentil - b.r.percentil)
      .slice(0, MAX_ITEMS).forEach(f => out.alertas.push(item(f, f.d.mal)));
    [out.fortalezas, out.ajustes, out.alertas].forEach(l => l.forEach(it => { it.dim = dimDe(it.clave, 'equipo'); }));
    out.dimensiones = dimensiones(idx, e, null);
    out.proyeccion = proyeccionEquipo(idx, e);
    return out;
  }

  /* ================================================== JUGADOR · POR ROL */

  /* Lo que se le pide a cada función en cancha (el eje del rol funcional,
     punto 46). Las métricas de otra función no se juzgan: a un ancla
     defensiva no se le pide crear, a un tirador de descarga no se le pide
     rebote ofensivo. Sin eje (los roles de respaldo) va la canasta base. */
  const POR_EJE = {
    creacion:     { label: 'creación', metricas: ['AST-PP', 'AST%', 'PePP%', 'PPP', 'TS%', 'T1%'] },
    defensa:      { label: 'defensa interior', metricas: ['RD%', 'PR', 'RO%', 'PPT2', 'T1%'] },
    finalizacion: { label: 'finalización cerca del aro', metricas: ['PPT2', 'T2%', 'TS%', 'RO%', 'RTL%', 'PePP%'] },
    cristal:      { label: 'rebote', metricas: ['RO%', 'RD%', 'PPT2', 'PePP%'] },
    tiro:         { label: 'tiro exterior', metricas: ['T3%', 'PPT3', 'eFG%', 'T1%', 'PePP%'] },
    penetracion:  { label: 'penetración', metricas: ['PPT2', 'RTL%', 'T1%', 'TS%', 'PePP%', 'AST-PP'] },
    base:         { label: 'su función', metricas: ['TS%', 'eFG%', 'PPP', 'PePP%', 'RD%'] },
  };
  const JUG = {
    'AST-PP': { bien: 'Asiste mucho más de lo que pierde.', ajuste: 'Relación asistencias/pérdidas: leer la ayuda antes de forzar el último pase.', mal: 'Pierde casi tanto como asiste.' },
    'AST%': { bien: 'Genera para los compañeros por encima de la liga.', ajuste: 'Encontrar al tirador abierto tras la ventaja.', mal: 'Genera poco para los demás.' },
    'PePP%': { bien: 'Cuida la pelota.', ajuste: 'Bajar las pérdidas: proteger el drible con el cuerpo y pasar antes del cierre.', mal: 'Pierde demasiadas pelotas para su volumen.' },
    'PPP': { bien: 'Produce por encima de la liga en cada jugada que termina.', mal: 'Termina sus jugadas con poco rédito.' },
    'TS%': { bien: 'Eficiencia de tiro real por encima de la liga.', ajuste: 'Selección: menos tiros contestados, más tiros de ventaja.', mal: 'Su eficiencia real de tiro está debajo de la liga.' },
    'eFG%': { bien: 'Tira bien de campo.', ajuste: 'Selección de tiro desde sus zonas fuertes.', mal: 'Tira mal de campo para la liga.' },
    'T1%': { bien: 'Seguro en la línea.', ajuste: 'Libres: rutina y volumen, el punto más barato de sumar.', mal: 'Pierde puntos en la línea.' },
    'RD%': { bien: 'Cierra el rebote defensivo.', ajuste: 'Bloquear antes de saltar.', mal: 'Pierde el rebote defensivo que le toca.' },
    'RO%': { bien: 'Gana segundas oportunidades.', ajuste: 'Ir al cristal ofensivo cuando el tiro sale de lejos.', mal: 'Casi no gana rebotes ofensivos para su función.' },
    'PR': { bien: 'Recupera balones por encima de la liga.', ajuste: 'Anticipar líneas de pase desde el lado débil.', mal: 'Recupera pocos balones.' },
    'PPT2': { bien: 'Rinde mucho en cada doble que intenta.', ajuste: 'Terminar con contacto y con la mano lejos del defensor.', mal: 'Rinde poco cerca del aro para su función.' },
    'T2%': { bien: 'Convierte sus dobles por encima de la liga.', ajuste: 'Mejorar la terminación: pies y hombros al aro.', mal: 'Convierte poco de dos.' },
    'RTL%': { bien: 'Va a la línea: castiga el contacto.', ajuste: 'Buscar el contacto en la penetración en vez del tiro flotado.', mal: 'Casi no va a la línea para alguien que ataca el aro.' },
    'T3%': { bien: 'Tirador de verdad: convierte de tres por encima de la liga.', ajuste: 'Triple en recepción: pies listos antes de que llegue el pase.', mal: 'Su triple no castiga para un tirador.' },
    'PPT3': { bien: 'Cada triple que intenta rinde por encima de la liga.', ajuste: 'Elegir triples de recepción y no de drible.', mal: 'Sus triples rinden poco.' },
  };

  function ejeDe(adn) {
    const e = adn && adn.rolFuncional && adn.rolFuncional.eje;
    return POR_EJE[e] ? e : 'base';
  }

  /** Las conclusiones de un jugador, medidas para SU función. */
  function jugador(idx, j, adn) {
    const eje = ejeDe(adn);
    const out = { fortalezas: [], ajustes: [], alertas: [], eje, ejeLabel: POR_EJE[eje].label,
      rol: adn && adn.rolFuncional ? adn.rolFuncional.label : null, califica: true };
    if (!idx || !j || typeof idx.leerJugador !== 'function') return out;
    const filas = POR_EJE[eje].metricas.map((k) => {
      const r = idx.leerJugador(j, k);
      if (!r || !esNum(r.valor)) return null;
      if (!esNum(r.percentil)) { out.califica = false; return null; }
      return { k, r, d: JUG[k] || {} };
    }).filter(Boolean);
    const item = (f, texto) => ({ titulo: f.r.label, valor: f.r.formateado, texto,
      sub: 'percentil ' + Math.round(f.r.percentil) + (f.r.tipoFormateado ? ' · liga ' + f.r.tipoFormateado : ''),
      tono: tonoPct(f.r.percentil), percentil: f.r.percentil, fuente: 'box', clave: f.k });
    filas.filter(f => f.r.percentil >= VERDE && f.d.bien).sort((a, b) => b.r.percentil - a.r.percentil)
      .slice(0, 3).forEach(f => out.fortalezas.push(item(f, f.d.bien)));
    filas.filter(f => f.r.percentil >= ROJO && f.r.percentil < VERDE && f.d.ajuste)
      .sort((a, b) => a.r.percentil - b.r.percentil).slice(0, 2).forEach(f => out.ajustes.push(item(f, f.d.ajuste)));
    filas.filter(f => f.r.percentil < ROJO && f.d.mal).sort((a, b) => a.r.percentil - b.r.percentil)
      .slice(0, 3).forEach(f => out.alertas.push(item(f, f.d.mal)));
    [out.fortalezas, out.ajustes, out.alertas].forEach(l => l.forEach(it => { it.dim = dimDe(it.clave, 'jugador'); }));
    out.dimensiones = dimensiones(idx, null, j);
    out.proyeccion = proyeccionJugador(idx, j, eje);
    return out;
  }

  /* ================================================== LAS CUATRO DIMENSIONES

     El diagnóstico se lee en cuatro dimensiones, ATAQUE y DEFENSA
     (2026-10-26): ritmo y transición, selección de tiro y espaciado,
     agresividad física y disciplina operativa. Cada lado resume sus
     métricas en el percentil promedio contra la liga, con la dirección de
     cada métrica ya dada vuelta (`idx.leer`). Lo descriptivo (el ritmo, el
     reparto del tiro, el uso) va en azul: dice cómo juega, no si está bien. */
  const DIMENSIONES = [
    { id: 'ritmo', label: 'Ritmo y transición',
      equipo: { ataque: ['PACE'], defensa: ['PP Opp%', 'PR'] },
      jugador: { ataque: ['USG%', 'PLAYS'], defensa: ['PR'] } },
    { id: 'seleccion', label: 'Selección de tiro y espaciado',
      equipo: { ataque: ['eFG%', 'PT3%'], defensa: ['eFG Opp%'] },
      jugador: { ataque: ['TS%', 'eFG%', 'PPP', 'PPT3', 'PPT2'], defensa: [] } },
    { id: 'fisica', label: 'Agresividad física',
      equipo: { ataque: ['RO%', 'RTL%'], defensa: ['RO Opp%', 'RD%'] },
      jugador: { ataque: ['RO%', 'RTL%'], defensa: ['RD%'] } },
    { id: 'disciplina', label: 'Disciplina operativa',
      equipo: { ataque: ['PePP%', 'AST-PP', 'T1%'], defensa: ['RTL Opp%'] },
      jugador: { ataque: ['PePP%', 'AST-PP', 'T1%'], defensa: [] } },
  ];
  const DESCRIPTIVAS = ['PACE', 'PT3%', 'PT2%', 'USG%', 'PLAYS'];
  function dimDe(clave, tipo) {
    const d = DIMENSIONES.find(x => ['ataque', 'defensa'].some(l => x[tipo][l].indexOf(clave) !== -1));
    if (!d) return null;
    return { id: d.id, label: d.label, lado: d[tipo].defensa.indexOf(clave) !== -1 ? 'defensa' : 'ataque' };
  }
  /** Las cuatro dimensiones de un equipo (`e`) o de un jugador (`j`). */
  function dimensiones(idx, e, j) {
    if (!idx) return [];
    const tipo = j ? 'jugador' : 'equipo';
    const leer = (k) => (j ? idx.leerJugador(j, k) : idx.leer(e.clave, k));
    return DIMENSIONES.map((d) => {
      const lados = ['ataque', 'defensa'].map((lado) => {
        const ms = d[tipo][lado].map((k) => {
          const r = leer(k);
          if (!r || !esNum(r.valor)) return null;
          return { clave: k, label: r.label, valor: r.formateado,
            percentil: esNum(r.percentil) ? r.percentil : null, info: DESCRIPTIVAS.indexOf(k) !== -1 };
        }).filter(Boolean);
        const evaluables = ms.filter(m => !m.info && esNum(m.percentil));
        const prom = evaluables.length ? evaluables.reduce((a, m) => a + m.percentil, 0) / evaluables.length : null;
        return { lado, metricas: ms, percentil: prom, tono: prom == null ? 'info' : tonoPct(prom) };
      }).filter(l => l.metricas.length);
      return { id: d.id, label: d.label, lados };
    }).filter(d => d.lados.length);
  }

  /* ================================================== PROYECCIÓN DE MEJORA

     El Bloque B: cuánto vale llevar cada métrica floja al percentil 70 de
     la liga, en PUNTOS por partido y en NET RATING (por 100 posesiones).
     No es una regresión: es la cuenta de posesiones con los datos reales
     del equipo (sus intentos, sus pérdidas, sus rebotes disponibles y lo
     que vale una jugada suya o del rival). Una métrica sin mecanismo
     directo a puntos (la relación asistencias/pérdidas) no se proyecta:
     inventarle un número sería peor que no darlo. Cada palanca se mide
     SOLA: no se suman, porque se pisan entre sí (una pérdida menos es
     también un tiro más). */
  const OBJETIVO = 70;
  /** El valor de la liga en el percentil 70, con la dirección de la métrica. */
  function valorObjetivo(dist, invertida, pct) {
    const v = (dist || []).filter(esNum).slice().sort((a, b) => a - b);
    if (v.length < 3) return null;
    const q = (invertida ? 100 - (pct || OBJETIVO) : (pct || OBJETIVO)) / 100;
    const pos = q * (v.length - 1), i = Math.floor(pos), f = pos - i;
    return i + 1 < v.length ? v[i] + f * (v[i + 1] - v[i]) : v[i];
  }
  const div = (a, b) => (esNum(a) && esNum(b) && b > 0 ? a / b : null);

  /* Cada palanca: cuántos puntos por partido vale mover `d` (objetivo menos
     valor, en la dirección buena). `P` son los promedios del equipo y `L`
     la fila TIPO de la liga. */
  const PALANCAS_EQ = {
    'eFG%': { lado: 'ataque', que: 'tiros de campo', pts: (d, P) => d * 2 * P.TCI },
    'PePP%': { lado: 'ataque', que: 'pérdidas', pts: (d, P) => d * P.PLAYS * div(P.PTS, P.PLAYS - P.PP) },
    'RO%': { lado: 'ataque', que: 'rebotes ofensivos', pts: (d, P) => d * (P.RO + P.RDopp) * P.PPP },
    'RTL%': { lado: 'ataque', que: 'viajes a la línea', pts: (d, P) => d * P.TCI * P['T1%'] },
    'T1%': { lado: 'ataque', que: 'libres', pts: (d, P) => d * P.T1I },
    'eFG Opp%': { lado: 'defensa', que: 'tiros del rival', pts: (d, P, L) => d * 2 * (L.TCI || P.TCI) },
    'PP Opp%': { lado: 'defensa', que: 'pérdidas forzadas', pts: (d, P) => d * P.PLAYSopp * div(P.PTSopp, P.PLAYSopp - P.PPopp) },
    'RO Opp%': { lado: 'defensa', que: 'segundas oportunidades del rival', pts: (d, P) => d * (P.ROopp + P.RD) * div(P.PTSopp, P.PLAYSopp) },
    'RTL Opp%': { lado: 'defensa', que: 'libres concedidos', pts: (d, P, L) => d * (L.TCI || P.TCI) },
  };

  /* El tono del asistente: identidad, sostenibilidad y costo de
     oportunidad. Audita el libreto, no lo reemplaza. */
  function textoPalanca(p, tipo) {
    const accion = (tipo === 'jugador' ? (JUG[p.clave] || {}) : (EQ[p.clave] || {})).ajuste || '';
    const quien = tipo === 'jugador' ? 'su rol' : 'la identidad del equipo';
    return 'Costo de oportunidad: hoy se dejan ' + num(p.pts, 1) + ' puntos por partido en ' + p.que + '. '
      + 'No pide cambiar ' + quien + ', pide sostenerla con menos desgaste'
      + (accion ? ': ' + accion.charAt(0).toLowerCase() + accion.slice(1) : '.');
  }

  /* El formato de una métrica del núcleo, con respaldo sin él. */
  function formato(k, v) {
    try {
      const S = typeof SGADD !== 'undefined' ? SGADD : require('./sgadd-core.js');
      if (S && S.formatear) return S.formatear(k, v);
    } catch (e) { /* sin núcleo */ }
    return num(v, 2);
  }

  /** La proyección de un equipo, ordenada por puntos que se recuperan. */
  function proyeccionEquipo(idx, e) {
    const out = { palancas: [], net: null };
    if (!idx || !e || !e.promedios || !idx.liga) return out;
    const P = e.promedios, L = idx.liga.tipo || {};
    const pos = esNum(P.POS) && P.POS > 0 ? P.POS : null;
    const netR = idx.leer(e.clave, 'NET RTNG');
    out.net = netR && esNum(netR.valor) ? { valor: netR.valor, formateado: netR.formateado } : null;
    Object.keys(PALANCAS_EQ).forEach((k) => {
      const r = idx.leer(e.clave, k);
      if (!r || !esNum(r.valor) || !esNum(r.percentil) || r.percentil >= OBJETIVO) return;
      const obj = valorObjetivo(idx.liga.distribuciones[k], r.invertida);
      if (!esNum(obj)) return;
      const d = r.invertida ? r.valor - obj : obj - r.valor;
      const pts = PALANCAS_EQ[k].pts(d, P, L);
      if (!esNum(pts) || pts <= 0.05) return;
      out.palancas.push({ clave: k, label: r.label, lado: PALANCAS_EQ[k].lado, que: PALANCAS_EQ[k].que,
        actual: r.formateado, objetivo: formato(k, obj), percentil: r.percentil, pts,
        net: pos ? 100 * pts / pos : null, dim: dimDe(k, 'equipo') });
    });
    out.palancas.sort((a, b) => b.pts - a.pts);
    /* El puesto en NET si se mueve SOLO esa palanca. */
    const dist = (idx.liga.distribuciones['NET RTNG'] || []).filter(esNum);
    const puesto = (v) => dist.filter(x => x > v).length + 1;
    out.palancas.forEach((p) => {
      if (out.net && esNum(p.net) && dist.length) {
        p.puestoAntes = puesto(out.net.valor); p.puestoDespues = puesto(out.net.valor + p.net); p.de = dist.length;
      }
      p.texto = textoPalanca(p, 'equipo');
    });
    return out;
  }

  /* Las del jugador: lo que sumaría él, en puntos por partido, y cuánto le
     movería al NET de su equipo (por 100 posesiones del equipo). Solo lo
     que se le pide a su función (`POR_EJE`). */
  const PALANCAS_J = {
    'TS%': { que: 'eficiencia de tiro', pts: (d, J) => d * 2 * (J.TCI + 0.44 * J.T1I) },
    'eFG%': { que: 'tiros de campo', pts: (d, J) => d * 2 * J.TCI },
    'T3%': { que: 'triples', pts: (d, J) => d * 3 * J.T3I },
    'PPT3': { que: 'triples', pts: (d, J) => d * J.T3I },
    'PPT2': { que: 'dobles', pts: (d, J) => d * J.T2I },
    'T2%': { que: 'dobles', pts: (d, J) => d * 2 * J.T2I },
    'T1%': { que: 'libres', pts: (d, J) => d * J.T1I },
    'PPP': { que: 'jugadas que termina', pts: (d, J) => d * J.PLAYS },
    'PePP%': { que: 'pérdidas', pts: (d, J, E) => d * J.PLAYS * div(E.PTS, E.PLAYS - E.PP) },
    'RO%': { que: 'rebotes ofensivos', pts: (d, J, E) => d * (E.RO + E.RDopp) * E.PPP },
    'RD%': { que: 'rebotes defensivos', pts: (d, J, E) => d * (E.RD + E.ROopp) * div(E.PTSopp, E.PLAYSopp) },
    'PR': { que: 'recuperos', pts: (d, J, E) => d * div(E.PTSopp, E.PLAYSopp) },
  };
  /* Las que miden lo mismo con otra vara no se cuentan dos veces: de cada
     familia queda la que más vale. */
  const FAMILIA_J = { 'TS%': 'tiro', 'eFG%': 'tiro', 'PPP': 'tiro', 'T3%': 'triple', 'PPT3': 'triple', 'PPT2': 'doble', 'T2%': 'doble' };

  function proyeccionJugador(idx, j, eje) {
    const out = { palancas: [], net: null };
    if (!idx || !j || !idx.liga || typeof idx.get !== 'function') return out;
    const eq = idx.get(j['EQUIPO']);
    const E = eq && eq.promedios;
    if (!E) return out;
    const pos = esNum(E.POS) && E.POS > 0 ? E.POS : null;
    const mejores = {};
    (POR_EJE[eje] || POR_EJE.base).metricas.forEach((k) => {
      const m = PALANCAS_J[k];
      const r = m ? idx.leerJugador(j, k) : null;
      if (!r || !esNum(r.valor) || !esNum(r.percentil) || r.percentil >= OBJETIVO) return;
      const obj = valorObjetivo((idx.liga.distribucionesJ || {})[k], r.invertida);
      if (!esNum(obj)) return;
      const d = r.invertida ? r.valor - obj : obj - r.valor;
      const pts = m.pts(d, j, E);
      if (!esNum(pts) || pts <= 0.05) return;
      const dim = dimDe(k, 'jugador');
      const p = { clave: k, label: r.label, que: m.que, actual: r.formateado, objetivo: formato(k, obj),
        percentil: r.percentil, pts, net: pos ? 100 * pts / pos : null, dim, lado: dim ? dim.lado : 'ataque' };
      const fam = FAMILIA_J[k] || k;
      if (!mejores[fam] || mejores[fam].pts < pts) mejores[fam] = p;
    });
    out.palancas = Object.keys(mejores).map(k => mejores[k]).sort((a, b) => b.pts - a.pts);
    out.palancas.forEach((p) => { p.texto = textoPalanca(p, 'jugador'); });
    return out;
  }

  /* ================================================== PLAY-BY-PLAY */

  const ZONAS_MEDIA = ['Z5', 'Z6', 'Z7', 'Z8', 'Z9'];
  const ajustado = (pts, tiros, liga) => (pts + K * liga) / (tiros + K);

  /** La calificación de una situación por puntos por tiro contra la liga. */
  function calificar(delta) {
    if (!esNum(delta)) return null;
    if (delta >= 0.12) return { etiqueta: 'Excelente', tono: 'pos' };
    if (delta >= 0.06) return { etiqueta: 'Bueno', tono: 'pos' };
    if (delta <= -0.12) return { etiqueta: 'Muy pobre', tono: 'neg' };
    if (delta <= -0.06) return { etiqueta: 'Pobre', tono: 'neg' };
    return { etiqueta: 'Promedio', tono: 'aviso' };
  }

  /** Los tipos de posesión que registra el play-by-play, con su nota. */
  function tiposDePosesion(acc, liga) {
    if (!acc || !liga || !Array.isArray(acc.f) || !Array.isArray(liga.f)) return [];
    const sit = [
      { id: 'transicion', label: 'Transición · 0-7 s', c: acc.f[0], l: liga.f[0] },
      { id: 'armado', label: 'Juego armado · 8-17 s', c: acc.f[1], l: liga.f[1] },
      { id: 'final', label: 'Final del reloj · 18-24 s', c: acc.f[2], l: liga.f[2] },
      { id: 'segunda', label: 'Segunda oportunidad · tras rebote ofensivo', c: acc.ro, l: liga.ro },
      { id: 'reinicio', label: 'Reinicio · tras falta recibida', c: acc.fa, l: liga.fa },
    ];
    const total = sit.slice(0, 3).reduce((a, s) => a + (Array.isArray(s.c) ? s.c[0] : 0), 0);
    return sit.map((s) => {
      if (!Array.isArray(s.c) || !Array.isArray(s.l) || !s.c[0] || !s.l[0]) return null;
      const lppt = s.l[2] / s.l[0];
      const ppt = s.c[2] / s.c[0];
      const cal = s.c[0] >= MIN_TIROS ? calificar(ajustado(s.c[2], s.c[0], lppt) - lppt) : null;
      return { id: s.id, label: s.label, tiros: s.c[0], conv: s.c[1], ppt, liga: lppt,
        parte: total && s.id !== 'segunda' && s.id !== 'reinicio' ? 100 * s.c[0] / total : null,
        etiqueta: cal ? cal.etiqueta : 'Muestra corta', tono: cal ? cal.tono : null };
    }).filter(Boolean);
  }

  /** La trampa de la media distancia: mucho volumen de dobles largos con
      puntos por tiro debajo de la liga en esas zonas. */
  function mediaDistancia(zonasEq, zonasLiga) {
    if (!Array.isArray(zonasEq) || !Array.isArray(zonasLiga)) return null;
    const suma = (lista, filtro) => lista.filter(filtro).reduce((a, z) => [a[0] + (z.i || 0), a[1] + (z.c || 0)], [0, 0]);
    const esCampo = (z) => /^Z\d+$/.test(z.zona);
    const enMedia = (z) => ZONAS_MEDIA.indexOf(z.zona) !== -1;
    const tot = suma(zonasEq, esCampo)[0], totL = suma(zonasLiga, esCampo)[0];
    const m = suma(zonasEq, enMedia), mL = suma(zonasLiga, enMedia);
    if (!tot || !totL || !mL[0] || m[0] < 30) return null;
    const parte = 100 * m[0] / tot, parteL = 100 * mL[0] / totL;
    const ppt = 2 * m[1] / m[0], pptL = 2 * mL[1] / mL[0];
    const delta = ajustado(2 * m[1], m[0], pptL) - pptL;
    return { tiros: m[0], conv: m[1], parte, parteL, ppt, pptL, delta,
      trampa: parte >= 1.3 * parteL && delta <= -0.05,
      arma: delta >= 0.06 };
  }

  /** Lo que el play-by-play agrega a las conclusiones de un equipo. */
  function pbpEquipo(paq) {
    const out = { fortalezas: [], ajustes: [], alertas: [], tipos: [] };
    if (!paq || !paq.liga) return out;
    const L = paq.liga;
    const rl = L.reloj || null;
    if (paq.reloj && paq.reloj.favor && rl && Array.isArray(rl.f) && rl.f.length === 3) {
      out.tipos = tiposDePosesion(paq.reloj.favor, { f: rl.f, ro: rl.ro, fa: rl.fa });
      out.tipos.forEach((t) => {
        if (t.etiqueta === 'Excelente') out.fortalezas.push({ titulo: t.label, valor: num(t.ppt, 2) + ' pts/tiro', fuente: 'pbp', tono: 'pos',
          sub: 'liga ' + num(t.liga, 2) + ' · ' + t.tiros + ' tiros', texto: 'Excelente en esta situación: es un arma para buscar.' });
        if (t.etiqueta === 'Muy pobre') out.alertas.push({ titulo: t.label, valor: num(t.ppt, 2) + ' pts/tiro', fuente: 'pbp', tono: 'neg',
          sub: 'liga ' + num(t.liga, 2) + ' · ' + t.tiros + ' tiros', texto: 'Muy pobre en esta situación: hay que dejar de llegar ahí o cambiar quién la resuelve.' });
      });
    }
    const md = paq.tiros ? mediaDistancia(paq.tiros.zonas, L.zonas) : null;
    if (md && md.trampa) out.alertas.push({ titulo: 'Trampa de media distancia', valor: num(md.parte, 0) + ' % de sus tiros', fuente: 'pbp', tono: 'neg',
      sub: 'liga ' + num(md.parteL, 0) + ' % · ' + num(md.ppt, 2) + ' pts/tiro contra ' + num(md.pptL, 2),
      texto: 'Abusa del doble largo y le rinde menos que a la liga: cada uno de esos tiros es un triple o un ataque al aro que no se tomó.' });
    else if (md && md.arma) out.fortalezas.push({ titulo: 'Media distancia', valor: num(md.ppt, 2) + ' pts/tiro', fuente: 'pbp', tono: 'pos',
      sub: 'liga ' + num(md.pptL, 2) + ' · ' + md.tiros + ' tiros', texto: 'La media distancia le rinde por encima de la liga: es un recurso, no una trampa.' });
    /* Pérdidas vivas: lo que el rival castiga en 7 segundos. Sale de sumar
       las pérdidas de sus jugadores (rendimiento.jugadores[].pp). */
    const R = paq.rendimiento && paq.rendimiento.jugadores;
    const C = L.rendimiento && L.rendimiento.cortes;
    if (R && C && C.tcdp) {
      const pp = Object.keys(R).reduce((a, k) => {
        const x = R[k] && R[k].pp;
        return Array.isArray(x) ? [a[0] + x[0], a[1] + x[1], a[2] + x[3]] : a;
      }, [0, 0, 0]);
      if (pp[0] >= 30) {
        const tcdp = pp[2] / pp[0];
        const robadas = pp[1] / pp[0];
        if (tcdp >= C.tcdp.p75) out.alertas.push({ titulo: 'Hemorragia por pérdidas vivas', valor: num(100 * tcdp, 0) + ' %', fuente: 'pbp', tono: 'neg',
          sub: 'de sus ' + pp[0] + ' pérdidas terminan en puntos del rival en 7 s · ' + num(100 * robadas, 0) + ' % robadas',
          texto: 'La pérdida viva es la asistencia del contraataque rival: rompe el repliegue antes de que la defensa se arme.' });
        else if (tcdp <= C.tcdp.p25) out.fortalezas.push({ titulo: 'Repliegue tras pérdida', valor: num(100 * tcdp, 0) + ' %', fuente: 'pbp', tono: 'pos',
          sub: 'de sus pérdidas terminan en puntos del rival en 7 s', texto: 'Cuando pierde, vuelve rápido: el rival casi no la castiga en transición.' });
      }
    }
    const cl = paq.clutch && paq.clutch.equipo;
    if (cl && cl.partidos >= 5 && esNum(cl.masMenos)) {
      if (cl.masMenos >= 10) out.fortalezas.push({ titulo: 'Cierres ajustados', valor: (cl.masMenos > 0 ? '+' : '') + cl.masMenos, fuente: 'pbp', tono: 'pos',
        sub: cl.ganados + '-' + cl.perdidos + ' en ' + cl.partidos + ' finales cerrados', texto: 'Gana los finales: sostener a quienes cierran.' });
      if (cl.masMenos <= -10) out.alertas.push({ titulo: 'Cierres ajustados', valor: String(cl.masMenos), fuente: 'pbp', tono: 'neg',
        sub: cl.ganados + '-' + cl.perdidos + ' en ' + cl.partidos + ' finales cerrados', texto: 'Pierde los finales: revisar quién toma el último tiro y cómo se llega.' });
    }
    /* PRESCRIPCIONES DEL PLAY-BY-PLAY (Bloque B): con los tiros reales del
       mapa y del reloj, cuánto vale corregir la trampa. Por partido sobre
       los partidos con tiros ubicados. */
    out.proyecciones = [];
    const pj = paq.partidos && (paq.partidos.conTiros || paq.partidos.validados);
    if (md && md.trampa && pj) {
      const campo = (paq.tiros.zonas || []).filter(z => /^Z\d+$/.test(z.zona));
      const resto = campo.filter(z => ZONAS_MEDIA.indexOf(z.zona) === -1);
      const tot = campo.reduce((a, z) => a + (z.i || 0), 0);
      const rTiros = resto.reduce((a, z) => a + (z.i || 0), 0);
      const rPts = resto.reduce((a, z) => a + (z.c || 0) * (/^Z1[0-4]$/.test(z.zona) ? 3 : 2), 0);
      const exceso = md.tiros - tot * md.parteL / 100;
      const pptResto = rTiros ? rPts / rTiros : null;
      if (exceso > 0 && esNum(pptResto) && pptResto > md.ppt) {
        out.proyecciones.push({ titulo: 'Media distancia → aro y triple', fuente: 'pbp', tono: 'info',
          valor: '+' + num(exceso * (pptResto - md.ppt) / pj, 1) + ' pts/partido',
          sub: 'llevar ' + num(exceso / pj, 1) + ' dobles largos por partido a la parte de la liga (' + num(md.parteL, 0) + ' %), a ' + num(pptResto, 2) + ' pts/tiro de sus otras zonas',
          texto: 'Costo de oportunidad: cada doble largo de más es un tiro de ' + num(md.ppt, 2) + ' que pudo ser uno de ' + num(pptResto, 2) + '. No cambia el ritmo ni la identidad: cambia desde dónde termina la jugada.' });
      }
    }
    const fin = (out.tipos || []).find(t => t.id === 'final');
    const armado = (out.tipos || []).find(t => t.id === 'armado');
    if (fin && armado && pj && (fin.etiqueta === 'Pobre' || fin.etiqueta === 'Muy pobre') && armado.ppt > fin.ppt) {
      const mover = 0.25 * fin.tiros;
      out.proyecciones.push({ titulo: 'Final del reloj → juego armado', fuente: 'pbp', tono: 'info',
        valor: '+' + num(mover * (armado.ppt - fin.ppt) / pj, 1) + ' pts/partido',
        sub: 'resolver antes el 25 % de los ' + fin.tiros + ' tiros de 18-24 s, a los ' + num(armado.ppt, 2) + ' pts/tiro de su juego armado',
        texto: 'Sostenibilidad: el ataque que llega tarde vive de la inspiración. Un segundo pase antes del segundo 17 vale más que un tiro forzado al final.' });
    }
    const fe = paq.rendimiento && paq.rendimiento.faltasEq;
    if (Array.isArray(fe) && fe[0] >= 20 && fe[3] > 0 && fe[1] >= 1.25 * fe[3] && fe[1] - fe[3] >= 5) {
      out.ajustes.push({ titulo: 'Bonus de faltas', valor: fe[1] + ' cuartos', fuente: 'pbp', tono: 'aviso',
        sub: 'en bonus contra ' + fe[3] + ' del rival · ' + fe[2] + ' prematuros', texto: 'Llega al bonus antes que el rival: menos faltas lejos del aro en la primera mitad del cuarto.' });
    }
    return out;
  }

  /** Lo que el play-by-play agrega a las conclusiones de un jugador: las
      fichas de su card de Rendimiento con tono, en los tres ejes. */
  function pbpJugador(paq, nombre) {
    const out = { fortalezas: [], ajustes: [], alertas: [], tipos: [] };
    if (!paq || !nombre) return out;
    const R = (typeof SGADD_RENDIMIENTO !== 'undefined') ? SGADD_RENDIMIENTO
      : (function () { try { return require('./sgadd-rendimiento.js'); } catch (e) { return null; } })();
    if (!R || typeof R.analizar !== 'function') return out;
    let a = null;
    try { a = R.analizar(paq, nombre); } catch (e) { a = null; }
    if (!a || !Array.isArray(a.semaforo)) return out;
    const TEXTO = {
      'On/Off Net': { pos: 'El equipo rinde más con él en cancha que sin él.', neg: 'El equipo rinde menos con él en cancha que sin él.', aviso: 'Con y sin él en cancha el equipo rinde parecido.' },
      'Pts/tiro': { pos: 'Cada tiro suyo rinde por encima de la competencia.', neg: 'Sus tiros rinden debajo de la competencia.', aviso: 'Sus tiros rinden en el rango de la competencia.' },
      'TCDP': { pos: 'Cuando pierde, el rival casi no lo castiga en 7 segundos.', neg: 'Sus pérdidas terminan en puntos rápidos del rival: son la asistencia del contraataque.', aviso: 'El rival le castiga las pérdidas como al resto.' },
      'IDE': { neg: 'Después de un error propio comete faltas por frustración.' },
    };
    a.semaforo.forEach((c) => {
      const t = TEXTO[c.label] && TEXTO[c.label][c.tono];
      const it = { titulo: c.label, valor: c.valor, fuente: 'pbp', tono: c.tono, texto: t || '' };
      if (c.tono === 'pos') out.fortalezas.push(it);
      else if (c.tono === 'neg') out.alertas.push(it);
      else if (c.tono === 'aviso') out.ajustes.push(it);
    });
    return out;
  }

  /* ================================================== VISTA */

  function vista() {
    if (typeof SGADD_RENDIMIENTO !== 'undefined' && SGADD_RENDIMIENTO.vista) return SGADD_RENDIMIENTO.vista;
    try { return require('./sgadd-rendimiento.js').vista; } catch (e) { return null; }
  }

  const EJES = [
    { id: 'fortalezas', titulo: 'Lo que se hace bien y hay que sostener', marca: '▲', tono: 'pos', vacio: 'Nada por encima del percentil 70 todavía.' },
    { id: 'ajustes', titulo: 'Ajustes alcanzables', marca: '●', tono: 'aviso', vacio: 'Sin ajustes de rango medio para priorizar.' },
    { id: 'alertas', titulo: 'Puntos de quiebre', marca: '▼', tono: 'neg', vacio: 'Sin puntos de quiebre: ninguna métrica bajo el percentil 40.' },
  ];

  function itemHtml(it) {
    return `<li class="concl-item${(' rend-t-' + (it.tono || 'nulo'))}">
      <div class="concl-item-c"><b>${esc(it.titulo)}</b><span class="concl-valor">${esc(it.valor)}</span></div>
      ${it.sub ? `<div class="concl-sub">${esc(it.sub)}</div>` : ''}
      ${it.texto ? `<div class="concl-texto">${esc(it.texto)}</div>` : ''}
      ${it.fuente === 'pbp' ? '<span class="concl-fuente" title="Del play-by-play">PBP</span>' : ''}</li>`;
  }

  /** Los tres ejes, en columnas. */
  function ejesHtml(c) {
    return `<div class="concl-ejes">${EJES.map((x) => {
      const lista = (c && c[x.id]) || [];
      return `<div class="concl-eje rend-t-${x.tono}">
        <div class="concl-eje-t"><span aria-hidden="true">${x.marca}</span> ${esc(x.titulo)}</div>
        ${lista.length ? `<ul class="concl-lista">${lista.map(itemHtml).join('')}</ul>` : `<p class="concl-vacio">${esc(x.vacio)}</p>`}
      </div>`;
    }).join('')}</div>`;
  }

  /* Las fichas Bento de un equipo (la cabecera y los indicadores de cada
     pestaña de Equipos): valor, liga, puesto y percentil, con el semáforo
     clínico. El ritmo y el reparto del tiro van en azul informativo: no
     tienen lado bueno (punto 4). Una muestra corta lleva `~` y sin color. */
  const INFORMATIVAS = ['PACE', 'PT3%', 'PT2%', 'PT1%', 'PLAYS', 'POS', 'T2I', 'T3I', 'T1I', 'T2C', 'T3C', 'T1C'];
  function fichaEquipo(idx, e, k) {
    const r = idx.leer(e.clave, k);
    if (!r) return null;
    const rk = typeof idx.ranking === 'function' ? idx.ranking(e.clave, k) : null;
    const info = r.descriptiva || INFORMATIVAS.indexOf(k) !== -1;
    const corta = r.muestraSuficiente === false;
    const tono = r.valor === null ? null : info ? 'info' : (corta ? null : tonoPct(r.percentil));
    const sub = [r.tipoFormateado && r.tipo !== null ? 'liga ' + r.tipoFormateado : '',
      rk ? rk.puesto + '° de ' + rk.de : '',
      esNum(r.percentil) && !info ? 'p' + Math.round(r.percentil) : ''].filter(Boolean).join(' · ');
    return { label: r.label, valor: r.formateado + (corta && !info ? ' ~' : ''), sub, tono };
  }
  function fichasEquipo(idx, e, claves) {
    const V = vista();
    if (!V || !idx || !e) return '';
    const fichas = (claves || []).map(k => fichaEquipo(idx, e, k)).filter(Boolean);
    return fichas.length ? `<div class="rend-raiz"><div class="rend-fichas concl-fichas">${fichas.map(V.ficha).join('')}</div></div>` : '';
  }

  /** Bloque A · las cuatro dimensiones, ataque y defensa, en micro-cards. */
  function dimensionesHtml(dims) {
    const V = vista();
    if (!V || !dims || !dims.length) return '';
    const lado = (l) => {
      const t = l.tono || 'info';
      const valor = l.percentil == null ? 'descriptivo' : 'p' + Math.round(l.percentil);
      const sub = l.metricas.map(m => m.label + ' ' + m.valor + (m.info || m.percentil == null ? '' : ' (p' + Math.round(m.percentil) + ')')).join(' · ');
      return V.ficha({ label: l.lado === 'defensa' ? 'Defensa' : 'Ataque', valor, sub, tono: t });
    };
    return `<div class="concl-dims" data-concl-dims="1"><div class="concl-eje-t">Las cuatro dimensiones · ataque y defensa contra la liga</div>
      <div class="concl-dims-grid">${dims.map(d => `<div class="rend-card concl-dim" data-dim="${esc(d.id)}">
        <div class="rend-card-t">${esc(d.label)}</div>
        <div class="rend-fichas">${d.lados.map(lado).join('')}</div></div>`).join('')}</div></div>`;
  }

  /** Bloque B · la proyección de umbrales de mejora: cada palanca medida
      SOLA, con lo que vale en puntos y en NET. La primera es la palanca. */
  function proyeccionHtml(p, tipo) {
    const V = vista();
    if (!V || !p) return '';
    const pal = (p.palancas || []).slice(0, 4);
    const cuerpo = pal.length ? pal.map((x, i) => `<div class="rend-card concl-palanca${i === 0 ? ' concl-palanca-1' : ''}" data-palanca="${esc(x.clave)}">
        <div class="rend-card-t">${i === 0 ? '◆ Palanca principal · ' : ''}${esc(x.label)}${x.dim ? ' · ' + esc(x.dim.label.toLowerCase()) + ' · ' + esc(x.lado) : ''}</div>
        <div class="rend-fichas">
          ${V.ficha({ label: 'Hoy', valor: x.actual, sub: 'percentil ' + Math.round(x.percentil), tono: tonoPct(x.percentil) })}
          ${V.ficha({ label: 'Umbral p70', valor: x.objetivo, sub: 'el percentil 70 de la liga', tono: 'pos' })}
          ${V.ficha({ label: tipo === 'jugador' ? 'Suma él' : 'Recupera', valor: '+' + num(x.pts, 1) + ' pts', sub: 'por partido', tono: 'info' })}
          ${esNum(x.net) ? V.ficha({ label: 'Net Rating', valor: '+' + num(x.net, 1), sub: tipo === 'jugador' ? 'del equipo, por 100 posesiones'
            : (x.puestoAntes ? 'puesto ' + x.puestoAntes + '° → ' + x.puestoDespues + '° de ' + x.de : 'por 100 posesiones'), tono: 'info' }) : ''}
        </div>
        <p class="concl-texto">${esc(x.texto)}</p></div>`).join('')
      : `<p class="concl-vacio">Todas las palancas con mecanismo de puntos ya están en el percentil 70 o más: el trabajo es sostener.</p>`;
    return `<div class="concl-proy" data-concl-proyeccion="1"><div class="concl-eje-t">📈 Proyección de umbrales de mejora</div>
      <p class="rend-pie-t">Cuánto vale llevar cada métrica al percentil 70 de la liga, con los intentos, las pérdidas y los rebotes reales ${tipo === 'jugador' ? 'del jugador y de su equipo' : 'del equipo'}. Cada palanca se mide sola: no se suman.</p>
      <div class="concl-palancas">${cuerpo}</div>
      <details class="rend-detalle"><summary>Cómo se calcula</summary><ul>
        <li>Tiro: la diferencia de eFG% por dos por los tiros de campo por partido; los libres, por los intentos.</li>
        <li>Pérdidas: cada pérdida evitada vale lo que rinde una jugada que sí termina en tiro.</li>
        <li>Rebote: cada rebote ganado de los disponibles es una jugada más (o una menos del rival), al valor de la jugada.</li>
        <li>Net Rating: los puntos sobre las posesiones del equipo, por 100. El puesto es el que tendría moviendo SOLO esa palanca.</li>
        <li>La relación asistencias/pérdidas no se proyecta: no tiene un camino directo a puntos y no se le inventa uno.</li>
      </ul></details></div>`;
  }

  /** Las barras de los tipos de posesión. */
  function tiposHtml(tipos) {
    const V = vista();
    if (!V || !tipos || !tipos.length) return '';
    return `<div class="concl-tipos"><div class="concl-eje-t">Tipos de posesión · puntos por tiro contra la liga</div>
      <div class="rend-barras">${tipos.map(t => V.barra({
        label: t.label + ' · ' + t.etiqueta, tono: t.tono || 'info',
        sub: num(t.ppt, 2) + ' (liga ' + num(t.liga, 2) + ') · ' + t.conv + '/' + t.tiros + (t.parte != null ? ' · ' + num(t.parte, 0) + ' % de sus tiros' : ''),
        pct: Math.max(4, Math.min(100, 50 + 250 * (t.ppt - t.liga))),
      })).join('')}</div></div>`;
  }

  /** La card. `c` es el resultado de `equipo` o `jugador`; `ranura` es el
      lugar del play-by-play (vacío sin la capa). */
  function html(c, opciones) {
    const o = opciones || {};
    const resumen = [
      c.fortalezas.length + ' para sostener', c.ajustes.length + ' ajustes', c.alertas.length + ' puntos de quiebre',
    ].join(' · ');
    const contexto = o.contexto ? `<p class="rend-pie-t">${esc(o.contexto)}</p>` : '';
    return `<section class="rend-raiz concl-card card rounded-xl p-4 sm:p-5 border border-hairline" data-conclusiones="${esc(o.tipo || 'equipo')}">
      <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h4 class="rend-card-t" style="margin:0">🩺 Diagnóstico para el cuerpo técnico</h4>
        <span class="concl-resumen">${esc(resumen)}</span>
      </div>
      ${contexto}
      ${ejesHtml(c)}
      ${dimensionesHtml(c.dimensiones)}
      ${proyeccionHtml(c.proyeccion, o.tipo)}
      ${o.ranura || ''}
      <details class="rend-detalle mt-2"><summary>Cómo se arma</summary><ul>
        <li>Verde desde el percentil 70 de la liga, ámbar entre 40 y 69, rojo debajo de 40. Siempre con la dirección de cada métrica: perder menos pelotas es estar arriba.</li>
        <li>Los ajustes son solo variables entrenables en el corto plazo, primero las que más margen tienen.</li>
        ${o.tipo === 'jugador' ? '<li>Al jugador se lo mide con las métricas de su función en cancha: no se le pide a cada rol lo que no le toca.</li>' : ''}
        <li>Lo marcado PBP sale del play-by-play: las situaciones de posesión, la media distancia, las pérdidas que el rival castiga en 7 segundos, los cierres ajustados y el bonus.</li>
      </ul></details>
    </section>`;
  }

  /** El bloque del play-by-play que se monta dentro de la card. */
  function pbpHtml(p) {
    if (!p) return '';
    const proy = p.proyecciones || [];
    const hay = p.fortalezas.length + p.ajustes.length + p.alertas.length + (p.tipos ? p.tipos.length : 0) + proy.length;
    if (!hay) return '';
    return `<div class="concl-pbp"><div class="concl-eje-t concl-pbp-t">Micro-momentos del play-by-play</div>
      ${p.fortalezas.length + p.ajustes.length + p.alertas.length ? ejesHtml(p) : ''}
      ${tiposHtml(p.tipos)}
      ${proy.length ? `<div class="concl-proy" data-concl-proyeccion-pbp="1"><div class="concl-eje-t">📈 Prescripciones desde el mapa y el reloj</div>
        <ul class="concl-lista">${proy.map(itemHtml).join('')}</ul></div>` : ''}</div>`;
  }

  return { DIMENSIONES, dimensiones, dimDe, dimensionesHtml, valorObjetivo, proyeccionEquipo, proyeccionJugador, proyeccionHtml,
    PALANCAS_EQ, PALANCAS_J, OBJETIVO,
    VERDE, ROJO, tonoPct, equipo, jugador, ejeDe, POR_EJE, EQ, JUG,
    calificar, tiposDePosesion, fichaEquipo, fichasEquipo, mediaDistancia, pbpEquipo, pbpJugador, html, pbpHtml, ejesHtml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONCLUSIONES;
