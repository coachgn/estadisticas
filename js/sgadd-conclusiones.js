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
        <h4 class="rend-card-t" style="margin:0">🩺 Conclusiones para el cuerpo técnico</h4>
        <span class="concl-resumen">${esc(resumen)}</span>
      </div>
      ${contexto}
      ${ejesHtml(c)}
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
    const hay = p.fortalezas.length + p.ajustes.length + p.alertas.length + (p.tipos ? p.tipos.length : 0);
    if (!hay) return '';
    return `<div class="concl-pbp"><div class="concl-eje-t concl-pbp-t">Micro-momentos del play-by-play</div>
      ${p.fortalezas.length + p.ajustes.length + p.alertas.length ? ejesHtml(p) : ''}
      ${tiposHtml(p.tipos)}</div>`;
  }

  return { VERDE, ROJO, tonoPct, equipo, jugador, ejeDe, POR_EJE, EQ, JUG,
    calificar, tiposDePosesion, fichaEquipo, fichasEquipo, mediaDistancia, pbpEquipo, pbpJugador, html, pbpHtml, ejesHtml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CONCLUSIONES;
