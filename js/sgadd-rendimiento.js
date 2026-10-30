/* =====================================================================
   SGADD_RENDIMIENTO · la card de Rendimiento del jugador (punto 140)

   El «asistente hablándole al entrenador»: traduce el play-by-play de la
   temporada en seis bloques de lectura, cada frase con el número que la
   sostiene y, donde corresponde, contra la competencia.

     1 · Veredicto           ON/OFF, eficiencia contra volumen, su arma y su riesgo
     2 · Espacio             dónde tira, rango real del triple, RCA y 2das oportunidades
     3 · Reloj y clutch      participación por franja de la posesión y el cierre
     4 · Química             a quién asiste, quién lo asiste y qué tiro sale de cada lado
     5 · Defensa             robos por franja del reloj rival, tapones, rebote, faltas de corte
     6 · Riesgo             faltas que saca, pérdidas y su daño a 7 s, disciplina

   DE DÓNDE SALE CADA COSA (el paquete de laboratorio, campo opcional):
     paq.rendimiento.jugadores[id]   motorstats-ingestion/src/pbp/rendimiento.js
     paq.liga.rendimiento.cortes     p25 · p50 · p75 de la competencia
     paq.reloj.jugadores[id]         las franjas (reloj.js, punto 115)
     paq.clutch.jugadores            el cierre (clutch.js, punto 62)

   LAS REGLAS
   ----------
   · Nada se afirma sin su número, y nada que el dato no traiga: no hay
     hockey assists, ni pase previo, ni pérdida «de drible» o «de pase».
   · Las comparaciones van contra la COMPETENCIA (cuartiles), no contra un
     número fijo (punto 4). Sin muestra, la tasa no se compara: se dice.
   · Una lectura es lectura: decide el cuerpo técnico.
   · Motor PURO (`analizar`) y vista (`html`) separados: el motor se testea
     en Node sin DOM.
   ===================================================================== */
'use strict';

const SGADD_RENDIMIENTO = (() => {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
  const num = (x, d) => (x == null || !isFinite(x) ? '—' : Number(x).toFixed(d == null ? 1 : d).replace('.', ','));
  const pct = (a, b) => (b > 0 ? 100 * a / b : null);
  const signo = (x, d) => (x == null ? '—' : (x > 0 ? '+' : '') + num(x, d));
  const suma = (arr, i) => arr.reduce((s, c) => s + (c[i] || 0), 0);

  /* Las franjas del reloj de posesión (reloj.js): segundos TRANSCURRIDOS.
     El DT piensa en el reloj de 24 que baja: se dicen las dos. */
  const FRANJAS = [
    { id: 'temprana', label: 'Transición · 0-7 s de posesión (reloj 24-17)' },
    { id: 'media', label: 'Ataque estructurado · 8-17 s (reloj 16-7)' },
    { id: 'tardia', label: 'Reloj tardío · 18-24 s (reloj 6-0)' },
  ];
  const CLASES = ['pintura', 'media distancia', 'triple'];
  const CLASE_CON_ARTICULO = ['la pintura', 'la media distancia', 'el triple'];
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const BANDAS_T3 = ['6,75 a 7,25 m', '7,25 a 8 m', '8 m o más'];
  const MIN_ONOFF_MIN = 100;    // minutos ON para leer el ON/OFF
  const MIN_OFF_MIN = 60;
  const MIN_CLASE = 15;         // tiros en una clase para leer su eficiencia
  const MIN_BANDA = 10;         // triples en una banda

  /* Semáforo: nivel contra la competencia → tono visual (verde / ámbar / rojo). */
  const tonoDe = (nv) => (nv === 'alto' ? 'pos' : nv === 'bajo' ? 'neg' : nv === 'medio' ? 'aviso' : null);

  /** p25 / p75 de la competencia → 'alto' | 'bajo' | 'medio' | null. `menos` = menos es mejor. */
  function nivel(v, c, menos) {
    if (v == null || !c || c.p25 == null) return null;
    if (v >= c.p75) return menos ? 'bajo' : 'alto';
    if (v <= c.p25) return menos ? 'alto' : 'bajo';
    return 'medio';
  }
  const TEXTO_NIVEL = { alto: 'del cuarto más alto de la competencia', medio: 'en el rango de la competencia', bajo: 'del cuarto más bajo de la competencia' };
  const contraLiga = (c) => (c ? ' (competencia: ' + num(c.p25, 2) + ' a ' + num(c.p75, 2) + ', mediana ' + num(c.p50, 2) + ')' : '');
  const contraLigaPct = (c) => (c ? ' (competencia: ' + num(100 * c.p25, 0) + ' a ' + num(100 * c.p75, 0) + ' %, mediana ' + num(100 * c.p50, 0) + ' %)' : '');

  /* La misma cuenta que la ingesta (rendimiento.js, `tasas`): se repite
     acá porque el panel no carga la ingesta. Un test las compara. */
  function tasas(j, MIN) {
    const m = MIN || { pj: 5, tiros: 40, canastas: 15, ast: 15, faltas: 15, perdidas: 15, segOn: 6000, segOff: 3600, segunda: 10, aportes: 10, gestion: 3 };
    const fga = suma(j.esp, 0), pts = suma(j.esp, 2);
    const linea = j.fr[1] + j.fr[2] + j.fr[3] + j.fr[4];
    const net = (t) => (t[3] > 0 && t[4] > 0 ? 100 * t[1] / t[3] - 100 * t[2] / t[4] : null);
    return {
      ppt: fga >= m.tiros ? pts / fga : null,
      vol: j.pj >= m.pj && fga >= m.tiros ? fga / j.pj : null,
      rca: j.rca[0] >= m.canastas ? j.rca[1] / j.rca[0] : null,
      vnap: j.ast[0] >= m.ast ? j.ast[1] / j.ast[0] : null,
      linea: j.fr[0] - j.fr[8] >= m.faltas ? linea / (j.fr[0] - j.fr[8]) : null,
      tcdp: j.pp[0] >= m.perdidas ? j.pp[3] / j.pp[0] : null,
      segPpt: j.seg[0] >= m.segunda ? j.seg[2] / j.seg[0] : null,
      onoff: j.on[0] >= m.segOn && j.off[0] >= m.segOff && net(j.on) != null && net(j.off) != null ? net(j.on) - net(j.off) : null,
      netOn: net(j.on), netOff: net(j.off),
      /* Las faltas (punto 140 · FIBA/CAB): la misma cuenta que la ingesta. */
      faltasPJ: j.fc && j.pj >= m.pj && j.fc[0] >= m.faltas ? j.fc[0] / j.pj : null,
      problemas: j.fi && j.pj >= m.pj ? j.fi[1] / j.pj : null,
      tempranoBonus: j.bn && j.bn[0] >= (m.aportes || 10) ? j.bn[1] / j.bn[0] : null,
      regaloBonus: j.bn && j.fc[0] >= m.faltas ? j.bn[2] / j.fc[0] : null,
      expulsion: j.fi && j.pj >= m.pj ? (j.fi[2] + j.fi[3]) / j.pj : null,
      gestionQ4: j.fi && j.fi[5] >= (m.gestion || 3) ? 1 - j.fi[6] / j.fi[5] : null,
    };
  }

  /* Lo que hace con las faltas, leído CONTRA LA COMPETENCIA (la misma regla
     que `perfilFaltas` de la ingesta): ningún corte es fijo. */
  const PERFIL_FALTAS = {
    'empuja-al-bonus': ['Empuja al bonus', 'sus faltas llegan seguido cuando el equipo todavía tiene medio cuarto por jugar y lo mete en bonus antes de tiempo', 'neg'],
    'regala-libres-de-bonus': ['Regala libres de bonus', 'comete más faltas penalizadas (que dan libres) que la mayoría', 'neg'],
    'se-expone-a-la-expulsion': ['Se expone a la expulsión', 'termina expulsado por faltas o disciplina más que la mayoría', 'neg'],
    'llega-al-cierre-sin-margen': ['Llega al cierre sin margen', 'cuando entra al 4.º cuarto con 3 faltas, lo termina expulsado más que la mayoría', 'neg'],
    'administra-su-riesgo': ['Administra su riesgo', 'cuando entra al 4.º cuarto con 3 faltas, casi nunca se queda sin partido', 'pos'],
  };
  function perfilFaltas(T, C) {
    const out = [];
    const sobre = (k, q) => T[k] != null && C[k] && T[k] > C[k][q];
    const bajo = (k, q) => T[k] != null && C[k] && T[k] < C[k][q];
    if (sobre('tempranoBonus', 'p75') && T.faltasPJ != null && C.faltasPJ && T.faltasPJ >= C.faltasPJ.p50) out.push('empuja-al-bonus');
    if (sobre('regaloBonus', 'p75')) out.push('regala-libres-de-bonus');
    if (sobre('expulsion', 'p75') && T.expulsion > 0) out.push('se-expone-a-la-expulsion');
    if (bajo('gestionQ4', 'p25')) out.push('llega-al-cierre-sin-margen');
    else if (T.gestionQ4 != null && C.gestionQ4 && T.gestionQ4 >= C.gestionQ4.p75 && T.gestionQ4 > C.gestionQ4.p25) out.push('administra-su-riesgo');
    return out;
  }

  function idDe(paq, nombre) {
    const js = (paq && paq.jugadores) || {};
    return Object.keys(js).find(k => norm(js[k].n) === norm(nombre)) || null;
  }
  const nombreDe = (paq, id) => {
    const x = paq && paq.jugadores && paq.jugadores[id];
    if (!x || !x.n) return 'otro compañero';
    const p = String(x.n).split(',');
    return p.length > 1 ? (p[1].trim() + ' ' + p[0].trim()) : x.n;
  };

  /* ================================================== EL MOTOR (PURO) */

  /**
   * @returns {{ ok, motivo?, nombre, pj, bloques: {id, titulo, lineas:[{texto, tono?}], chips:[{label, valor, tono?}]}[] }}
   *   tono: 'pos' | 'neg' | null
   */
  function analizar(paq, nombre) {
    if (!paq || !paq.rendimiento || !paq.rendimiento.jugadores) {
      return { ok: false, motivo: 'La card de Rendimiento llega con la próxima subida del análisis de play-by-play de este equipo.' };
    }
    const id = idDe(paq, nombre);
    const j = id ? paq.rendimiento.jugadores[id] : null;
    if (!j) return { ok: false, motivo: 'Sin acciones de ' + nombre + ' en los partidos con play-by-play de ' + (paq.equipo || 'su equipo') + '.' };
    const L = (paq.liga && paq.liga.rendimiento) || {};
    const C = L.cortes || {};
    const T = tasas(j, L.minimos);
    const quien = nombreDe(paq, id).split(' ').slice(-1)[0];
    const bloques = [
      veredicto(j, T, C, quien),
      espacio(j, T, C),
      reloj(paq, id, j),
      quimica(paq, j, T, C),
      defensa(paq, id, j),
      riesgo(j, T, C, paq),
    ];
    const SEMAFORO = ['On/Off Net', 'Pts/tiro', 'RCA', 'TCDP', 'IDE'];
    const semaforo = SEMAFORO.map(l => bloques.reduce((s, b) => s || (b.chips || []).find(c => c.label === l), null)).filter(Boolean);
    return { ok: true, id, nombre: nombreDe(paq, id), pj: j.pj, bloques, semaforo };
  }

  /* ---------- 1 · Veredicto ---------- */
  function veredicto(j, T, C, quien) {
    const lineas = [], chips = [];
    let titularV = '';
    const minOn = j.on[0] / 60, minOff = j.off[0] / 60;
    if (T.onoff != null) {
      const nv = nivel(T.onoff, C.onoff);
      /* El color solo cuando se separa de la competencia: un +0,2 no es una noticia. */
      const tono = nv === 'alto' ? 'pos' : (nv === 'bajo' ? 'neg' : null);
      const rol = nv === 'alto' && T.onoff > 0 ? 'Es un pilar: el equipo es claramente mejor con él en cancha.'
        : nv === 'bajo' && T.onoff < 0 ? 'Con él en cancha el equipo rinde peor que cuando descansa: hay que mirar con quién comparte cancha antes de concluir.'
          : 'Su impacto neto está en el rango de la competencia.';
      lineas.push({ texto: 'On/Off ' + signo(T.onoff) + ' de Net Rating: el equipo hace ' + signo(T.netOn) + ' cada 100 posesiones con él en cancha y '
        + signo(T.netOff) + ' sin él (' + num(minOn, 0) + ' min ON, ' + num(minOff, 0) + ' min OFF, en ' + j.pjOnOff + ' partidos que jugó). ' + rol, tono });
      chips.push({ label: 'On/Off Net', valor: signo(T.onoff), tono: tonoDe(nv) });
      titularV = rol;
    } else {
      lineas.push({ texto: 'On/Off sin muestra suficiente (' + num(minOn, 0) + ' min ON y ' + num(minOff, 0) + ' min OFF con la cancha validada; hacen falta '
        + MIN_ONOFF_MIN + ' y ' + MIN_OFF_MIN + '): todavía no se puede decir si el equipo depende de él.' });
    }
    if (T.ppt != null) {
      const nvP = nivel(T.ppt, C.ppt), nvV = nivel(T.vol, C.vol);
      let lectura = 'eficiencia ' + TEXTO_NIVEL[nvP] + '.';
      if (nvV === 'alto' && nvP === 'bajo') lectura = 'mucho volumen con poca renta: acumula tiros por debajo de la competencia.';
      else if (nvV === 'alto' && nvP === 'alto') lectura = 'volumen alto y eficiente: carga el ataque y lo hace rendir.';
      else if (nvV === 'bajo' && nvP === 'alto') lectura = 'pocos tiros y bien elegidos: hay renta para darle más.';
      lineas.push({ texto: num(T.vol) + ' tiros de campo por partido a ' + num(T.ppt, 2) + ' puntos por tiro' + contraLiga(C.ppt) + ': ' + lectura,
        tono: nvP === 'alto' ? 'pos' : (nvP === 'bajo' ? 'neg' : null) });
      chips.push({ label: 'Pts/tiro', valor: num(T.ppt, 2), tono: tonoDe(nvP) });
      if (!titularV) titularV = lectura.charAt(0).toUpperCase() + lectura.slice(1);
    }
    /* Su arma y su riesgo: la tasa mejor y peor ubicada contra la competencia. */
    const ARMAS = [['rca', 'crea su propio tiro'], ['linea', 'saca faltas que lo mandan a la línea'], ['vnap', 'sus asistencias valen puntos'], ['segPpt', 'castiga la segunda oportunidad']];
    const arma = ARMAS.filter(a => nivel(T[a[0]], C[a[0]]) === 'alto')[0];
    const riesgoAlto = nivel(T.tcdp, C.tcdp, true) === 'bajo';
    const partes = [];
    if (arma) partes.push('Su arma: ' + arma[1] + '.');
    if (riesgoAlto) partes.push('Su riesgo: el rival le castiga las pérdidas con puntos en 7 segundos más que a la mayoría (' + num(100 * T.tcdp, 0) + ' %).');
    if (partes.length) lineas.push({ texto: partes.join(' ') });
    const tiles = [
      { label: 'On/Off Net', valor: T.onoff != null ? signo(T.onoff) : 's/m', sub: T.onoff != null ? 'ON ' + signo(T.netOn) + ' · OFF ' + signo(T.netOff) : 'sin muestra', tono: tonoDe(nivel(T.onoff, C.onoff)) },
      { label: 'Pts/tiro', valor: num(T.ppt, 2), sub: C.ppt ? 'mediana ' + num(C.ppt.p50, 2) : 'sin comparar', tono: tonoDe(nivel(T.ppt, C.ppt)) },
      { label: 'Tiros/PJ', valor: num(T.vol), sub: C.vol ? 'mediana ' + num(C.vol.p50) : 'sin comparar', tono: null },
    ];
    const titular = titularV || 'Sin muestra suficiente para un veredicto.';
    return { id: 'veredicto', titulo: '🎙️ El veredicto', lineas, chips, tiles, titular };
  }

  /* ---------- 2 · Espacio, creación y segundas oportunidades ---------- */
  function espacio(j, T, C) {
    const lineas = [], chips = [];
    const fga = suma(j.esp, 0);
    if (fga) {
      const reparto = j.esp.map((c, i) => num(pct(c[0], fga), 0) + ' % ' + CLASES[i]).join(' · ');
      const castigo = j.esp.map((c, i) => ({ i, n: c[0], ppt: c[0] ? c[2] / c[0] : null })).filter(x => x.n >= MIN_CLASE).sort((a, b) => b.ppt - a.ppt)[0];
      lineas.push({ texto: 'Distancia mediana de tiro ' + num(j.dist) + ' m sobre ' + j.nd + ' tiros ubicados. Reparto: ' + reparto + '.'
        + (castigo ? ' Donde más rinde es ' + CLASE_CON_ARTICULO[castigo.i] + ': ' + num(castigo.ppt, 2) + ' puntos por tiro en ' + castigo.n + ' intentos.' : '') });
    }
    const t3i = suma(j.t3b, 0);
    if (t3i) {
      const lejos = j.t3b.map((b, i) => ({ i, i3: b[0], c3: b[1] })).filter(x => x.i3 >= MIN_BANDA);
      const ultima = lejos[lejos.length - 1];
      lineas.push({ texto: 'Rango real del triple: ' + j.t3b.map((b, i) => BANDAS_T3[i] + ' ' + b[1] + '/' + b[0]).join(' · ') + '.'
        + (ultima ? ' Con volumen, convierte ' + num(pct(ultima.c3, ultima.i3), 0) + ' % desde ' + BANDAS_T3[ultima.i] + '.' : ' Ninguna banda llega a ' + MIN_BANDA + ' intentos: sin rango medible.') });
    }
    if (j.rca[0]) {
      const nv = nivel(T.rca, C.rca);
      const perfil = T.rca == null ? 'muestra chica para clasificarlo' : (nv === 'alto' ? 'anotador autónomo: genera su tiro sin pase previo (pull-up, aclarado, rebote)'
        : nv === 'bajo' ? 'finalizador dependiente: vive del pase (catch & shoot, cortes)' : 'mezcla de los dos perfiles');
      lineas.push({ texto: 'RCA ' + num(pct(j.rca[1], j.rca[0]), 0) + ' %: ' + j.rca[1] + ' de sus ' + j.rca[0] + ' canastas de campo llegaron sin asistencia'
        + contraLigaPct(C.rca) + '. Lectura: ' + perfil + '.' });
      /* RCA no tiene lado bueno y lado malo (punto 4): tono azul informativo, no semáforo. */
      chips.push({ label: 'RCA', valor: num(pct(j.rca[1], j.rca[0]), 0) + ' %', tono: 'info' });
    }
    if (j.seg[0]) {
      const nv = nivel(T.segPpt, C.segPpt);
      lineas.push({ texto: 'Segundas oportunidades: ' + j.seg[1] + '/' + j.seg[0] + ' tras rebote ofensivo (' + num(j.seg[0] ? j.seg[2] / j.seg[0] : null, 2) + ' pts/tiro'
        + (T.segPpt != null ? ', ' + TEXTO_NIVEL[nv] : '') + '). ' + num(pct(j.seg[3], j.seg[0]), 0) + ' % con su propio rebote, '
        + num(pct(j.seg[4], j.seg[0]), 0) + ' % inmediatos (≤ 3 s) y ' + num(pct(j.seg[5], j.seg[0]), 0) + ' % reabriendo a la línea de 3.',
      tono: nv === 'alto' ? 'pos' : (nv === 'bajo' ? 'neg' : null) });
    }
    if (!lineas.length) lineas.push({ texto: 'Sin tiros de campo en los partidos con play-by-play.' });
    const barras = fga ? j.esp.map((c, i) => ({
      label: CLASES[i].charAt(0).toUpperCase() + CLASES[i].slice(1), pct: pct(c[0], fga),
      sub: num(pct(c[0], fga), 0) + ' %' + (c[0] >= MIN_CLASE ? ' · ' + num(c[2] / c[0], 2) + ' pts/tiro' : ''),
    })) : [];
    const tiles = [];
    if (j.rca[0]) tiles.push({ label: 'RCA', valor: num(pct(j.rca[1], j.rca[0]), 0) + ' %', sub: 'canastas sin asistencia', tono: 'info' });
    if (j.seg[0]) tiles.push({ label: '2da oportunidad', valor: num(j.seg[2] / j.seg[0], 2), sub: j.seg[1] + '/' + j.seg[0] + ' · pts/tiro', tono: tonoDe(nivel(T.segPpt, C.segPpt)) });
    if (fga) tiles.push({ label: 'Distancia', valor: num(j.dist) + ' m', sub: 'mediana de tiro', tono: null });
    const triples = suma(j.t3b, 0) ? j.t3b.map((b, i) => BANDAS_T3[i] + ': ' + b[1] + '/' + b[0]) : [];
    return { id: 'espacio', titulo: '🗺️ Espacio y creación', lineas, chips, barras, tiles, triples };
  }

  /* ---------- 3 · Reloj y clutch ---------- */
  function reloj(paq, id, j) {
    const lineas = [], chips = [], barras = [];
    let alerta = null;
    const r = paq.reloj && paq.reloj.jugadores && paq.reloj.jugadores[id];
    const ligaF = paq.liga && paq.liga.reloj && paq.liga.reloj.f;
    if (r && Array.isArray(r.f) && r.f.length === 3) {
      const acciones = r.f.map((c, k) => (c[0] + c[5]) + (r.e && r.e[k] ? r.e[k].reduce((s, x) => s + x, 0) : 0));
      const total = acciones.reduce((s, x) => s + x, 0);
      if (total) {
        r.f.forEach((c, k) => {
          const e = (r.e && r.e[k]) || [0, 0, 0, 0, 0];
          const facetas = [['tiro', c[0]], ['pase de gol', e[0]], ['pérdida', c[5]], ['rebote', e[1] + e[2]], ['robo/tapón', e[3] + e[4]]].sort((a, b) => b[1] - a[1]);
          const ppt = c[0] ? c[2] / c[0] : null;
          const pptL = ligaF && ligaF[k] && ligaF[k][0] ? ligaF[k][2] / ligaF[k][0] : null;
          const tono = ppt != null && pptL != null && c[0] >= 10 ? (ppt - pptL >= 0.06 ? 'pos' : (pptL - ppt >= 0.06 ? 'neg' : null)) : null;
          lineas.push({ texto: FRANJAS[k].label + ': ' + num(pct(acciones[k], total), 0) + ' % de su participación, domina el ' + facetas[0][0]
            + (c[0] ? ' · ' + c[1] + '/' + c[0] + ' tiros, ' + num(ppt, 2) + ' pts/tiro (competencia ' + num(pptL, 2) + ')' : '') + '.', tono });
          barras.push({ label: ['0-7 s', '8-17 s', '18-24 s'][k], pct: pct(acciones[k], total), tono,
            sub: num(pct(acciones[k], total), 0) + ' % · ' + facetas[0][0] + (c[0] ? ' · ' + num(ppt, 2) + ' pts/tiro' : '') });
        });
        const mayor = acciones.indexOf(Math.max.apply(null, acciones));
        chips.push({ label: 'Su franja', valor: ['0-7 s', '8-17 s', '18-24 s'][mayor] });
      }
    } else {
      lineas.push({ texto: 'Sin reloj de posesión para este jugador en el paquete.' });
    }
    const cl = paq.clutch && (paq.clutch.jugadores || []).find(x => String(x.id) === String(id));
    const def = paq.clutch && paq.clutch.definicion;
    if (cl && cl.min > 0) {
      lineas.push({ texto: 'Clutch' + (def ? ' (últimos ' + Math.round(def.segundos / 60) + ' min, diferencia ≤ ' + def.diferenciaMaxima + ')' : '') + ': '
        + num(cl.min) + ' min en ' + cl.pj + ' partidos, ' + cl.pts + ' pts, tiros ' + cl.tc + ', triples ' + cl.t3 + ', libres ' + cl.tl
        + ', eFG ' + num(cl.efg) + ' %, toma el ' + num(cl.porc, 0) + ' % de los usos del equipo, ' + cl.pp + ' pérdidas, +/- ' + signo(cl.mm, 0) + '.',
      tono: cl.mm >= 5 ? 'pos' : (cl.mm <= -5 ? 'neg' : null) });
      chips.push({ label: 'Usos clutch', valor: num(cl.porc, 0) + ' %' });
      /* El termómetro del cierre: un badge de alerta, verde / ámbar / rojo según el +/- del tramo. */
      alerta = { titulo: 'Termómetro clutch', tono: cl.mm >= 5 ? 'pos' : (cl.mm <= -5 ? 'neg' : 'aviso'),
        texto: signo(cl.mm, 0) + ' en ' + num(cl.min) + ' min · ' + cl.pts + ' pts · eFG ' + num(cl.efg, 0) + ' % · toma el ' + num(cl.porc, 0) + ' % de los usos · ' + cl.pp + ' pérdidas' };
    } else lineas.push({ texto: 'Sin minutos de clutch con la cancha validada.' });
    return { id: 'reloj', titulo: '⏱️ Reloj de posesión y clutch', lineas, chips, barras, alerta };
  }

  /* ---------- 4 · Química ---------- */
  function quimica(paq, j, T, C) {
    const lineas = [], chips = [];
    if (j.ast[0]) {
      const so = j.socios || [];
      const tipo = [['triple', j.ast[2]], ['pintura', j.ast[3]], ['media distancia', j.ast[4]]].sort((a, b) => b[1] - a[1]);
      lineas.push({ texto: j.ast[0] + ' asistencias que valieron ' + j.ast[1] + ' puntos (' + num(j.ast[1] / j.ast[0], 2) + ' por pase'
        + (T.vnap != null ? ', ' + TEXTO_NIVEL[nivel(T.vnap, C.vnap)] : '') + '). Genera sobre todo ' + tipo[0][0] + ' (' + num(pct(tipo[0][1], j.ast[0]), 0) + ' %).' });
      if (so.length) {
        lineas.push({ texto: 'Socio principal: ' + nombreDe(paq, so[0][0]) + ', ' + so[0][1] + ' asistencias por ' + so[0][2] + ' puntos (' + num(pct(so[0][1], j.ast[0]), 0)
          + ' % de sus pases de gol).' + (so[1] ? ' Después: ' + so.slice(1).map(s => nombreDe(paq, s[0]) + ' (' + s[1] + ')').join(', ') + '.' : '') });
        chips.push({ label: 'Díada', valor: nombreDe(paq, so[0][0]).split(' ').slice(-1)[0] });
      }
    } else lineas.push({ texto: 'Sin asistencias registradas en los partidos con play-by-play.' });
    const recib = suma(j.asistido, 0), sin = suma(j.asistido, 1);
    if (recib + sin) {
      const c3 = j.asistido[2][0] + j.asistido[2][1];
      lineas.push({ texto: 'Cuando lo alimentan: ' + recib + ' de ' + (recib + sin) + ' canastas ubicadas son asistidas. '
        + (c3 ? num(pct(j.asistido[2][0], c3), 0) + ' % de sus triples convertidos llega de un pase (catch & shoot); ' : '')
        + 'en la pintura, ' + num(pct(j.asistido[0][0], j.asistido[0][0] + j.asistido[0][1]), 0) + ' %.'
        + (j.asistidores && j.asistidores[0] ? ' Quien más lo habilita: ' + nombreDe(paq, j.asistidores[0][0]) + ' (' + j.asistidores[0][1] + ').' : '') });
    }
    const tiles = [];
    if (j.ast[0]) {
      tiles.push({ label: 'Asistencias', valor: String(j.ast[0]), sub: num(j.ast[1] / j.ast[0], 2) + ' pts por pase', tono: tonoDe(nivel(T.vnap, C.vnap)) });
      if (j.socios && j.socios[0]) tiles.push({ label: 'Socio principal', valor: nombreDe(paq, j.socios[0][0]).split(' ').slice(-1)[0], sub: j.socios[0][1] + ' pases · ' + j.socios[0][2] + ' pts', tono: null });
    }
    if (recib + sin) tiles.push({ label: 'Canastas asistidas', valor: num(pct(recib, recib + sin), 0) + ' %', sub: recib + ' de ' + (recib + sin), tono: 'info' });
    return { id: 'quimica', titulo: '🤝 Química y red de pases', lineas, chips, tiles };
  }

  /* ---------- 5 · Defensa ---------- */
  function defensa(paq, id, j) {
    const lineas = [], chips = [];
    const pj = Math.max(1, j.pj);
    lineas.push({ texto: num(j.def[0] / pj) + ' recuperos, ' + num(j.def[2] / pj) + ' tapones y ' + num(j.def[4] / pj) + ' rebotes defensivos por partido ('
      + j.def[0] + ' · ' + j.def[2] + ' · ' + j.def[4] + ' en ' + j.pj + ' partidos). En clutch: ' + plural(j.def[1], 'recupero', 'recuperos') + ' y ' + plural(j.def[3], 'tapón', 'tapones') + '.' });
    const r = paq.reloj && paq.reloj.jugadores && paq.reloj.jugadores[id];
    if (r && r.e && r.e.length === 3) {
      const rec = r.e.map(x => x[3]);
      const tot = rec.reduce((s, x) => s + x, 0);
      if (tot) {
        lineas.push({ texto: 'Sus robos según el reloj del rival: ' + rec.map((x, k) => x + ' en ' + ['transición', 'ataque estructurado', 'reloj tardío'][k]).join(' · ')
          + '. ' + (rec[2] >= Math.max(rec[0], rec[1]) && rec[2] >= 3 ? 'Perfil de defensor de reloj corto: fuerza la pérdida cuando el rival se queda sin tiempo.'
            : rec[1] >= Math.max(rec[0], rec[2]) ? 'Roba sobre todo leyendo el ataque organizado (líneas de pase o presión al drible).'
              : 'Roba sobre todo en transición.') });
        chips.push({ label: 'Robos reloj corto', valor: String(rec[2]) });
      }
    }
    if (j.fc[4]) lineas.push({ texto: j.fc[4] + ' faltas de corte: cometidas a ≤ 4 s de que su equipo perdió la pelota, sin libres.' });
    const tiles = [
      { label: 'Recuperos/PJ', valor: num(j.def[0] / pj), sub: j.def[0] + ' en total', tono: null },
      { label: 'Tapones/PJ', valor: num(j.def[2] / pj), sub: j.def[2] + ' en total', tono: null },
      { label: 'Reb. def./PJ', valor: num(j.def[4] / pj), sub: j.def[4] + ' en total', tono: null },
    ];
    return { id: 'defensa', titulo: '🛡️ Defensa', lineas, chips, tiles };
  }

  /* ---------- 6 · Riesgo ---------- */
  function riesgo(j, T, C, paq) {
    const lineas = [], chips = [];
    const fr = j.fr;
    if (fr[0]) {
      lineas.push({ texto: fr[0] + ' faltas recibidas: ' + fr[1] + ' de tiro con 2 libres, ' + fr[2] + ' sobre triple, ' + fr[3] + ' and-1, '
        + fr[4] + ' con 2 libres y el rival en bonus, ' + fr[5] + ' sin libres (saque) y '
        + fr[8] + ' cargos provocados. Libres: ' + fr[7] + '/' + fr[6] + ' (' + num(pct(fr[7], fr[6]), 0) + ' %).'
        + (T.linea != null ? ' Lo mandan a la línea en el ' + num(100 * T.linea, 0) + ' % de sus faltas, ' + TEXTO_NIVEL[nivel(T.linea, C.linea)] + '.' : '') });
      chips.push({ label: 'And-1', valor: String(fr[3]) });
    }
    const pp = j.pp;
    if (pp[0]) {
      const nv = nivel(T.tcdp, C.tcdp, true);
      lineas.push({ texto: pp[0] + ' pérdidas: ' + pp[1] + ' robadas por el rival, ' + pp[2] + ' por falta en ataque y el resto con la pelota muerta. TCDP '
        + num(pct(pp[3], pp[0]), 0) + ' %: ' + pp[3] + ' terminaron en puntos del rival en ≤ 7 s (' + pp[4] + ' puntos)'
        + (T.tcdp != null ? ', ' + TEXTO_NIVEL[nivel(T.tcdp, C.tcdp)] : '') + '.',
      tono: nv === 'alto' ? 'pos' : (nv === 'bajo' ? 'neg' : null) });
      chips.push({ label: 'TCDP', valor: num(pct(pp[3], pp[0]), 0) + ' %', tono: tonoDe(nivel(T.tcdp, C.tcdp, true)) });
    }
    const d = j.dis;
    const incidentes = d[0] + d[1] + d[2];
    const ide = d[5] ? 100 * (1 - (d[3] + d[4]) / d[5]) : null;
    lineas.push({ texto: (incidentes ? plural(d[0], 'técnica', 'técnicas') + ', ' + plural(d[1], 'antideportiva', 'antideportivas') + ' y ' + plural(d[2], 'descalificante', 'descalificantes')
        + '; de ellas, ' + d[3] + ' a ≤ 10 s de un error propio (faltas por frustración). '
      : 'Sin técnicas ni antideportivas. ') + plural(d[4], 'falta personal', 'faltas personales') + ' a ≤ 5 s de un error propio. '
      + 'IDE ' + num(ide, 0) + ' %: ' + (d[5] ? 'de sus ' + d[5] + ' errores (pérdidas y tiros errados), los que NO terminaron en una falta suya.' : 'sin errores registrados.'),
    tono: d[3] > 0 ? 'neg' : null });
    chips.push({ label: 'IDE', valor: ide == null ? '—' : num(ide, 0) + ' %', tono: d[3] > 0 ? 'neg' : null });
    const f = j.fc;
    if (f[0]) lineas.push({ texto: f[0] + ' faltas cometidas: ' + f[1] + ' en ataque, ' + f[2] + ' con libres para el rival y ' + f[3] + ' sin libres.' });
    faltasFiba(j, T, C, paq, lineas, chips);
    /* Las alertas visuales: el perfil de faltas contra la competencia y la disciplina. */
    const alertas = chips.filter(c => c.label === 'Faltas').map(c => ({ titulo: c.valor, tono: c.tono, texto: '' }));
    if (j.fi && (j.fi[2] + j.fi[3]) > 0) alertas.push({ titulo: 'Expulsiones', tono: 'neg', texto: (j.fi[2] + j.fi[3]) + ' en ' + j.pj + ' partidos' });
    if (d[3] > 0) alertas.push({ titulo: 'Faltas por frustración', tono: 'neg', texto: d[3] + ' técnicas/antideportivas tras un error propio' });
    const tiles = [];
    if (pp[0]) tiles.push({ label: 'TCDP', valor: num(pct(pp[3], pp[0]), 0) + ' %', sub: pp[3] + ' de ' + pp[0] + ' pérdidas', tono: tonoDe(nivel(T.tcdp, C.tcdp, true)) });
    tiles.push({ label: 'IDE', valor: ide == null ? '—' : num(ide, 0) + ' %', sub: d[5] ? d[5] + ' errores' : 'sin errores', tono: d[3] > 0 ? 'neg' : null });
    if (fr[0]) tiles.push({ label: 'Faltas recibidas', valor: String(fr[0]), sub: fr[3] + ' and-1 · libres ' + num(pct(fr[7], fr[6]), 0) + ' %', tono: tonoDe(nivel(T.linea, C.linea)) });
    if (j.fc[0]) tiles.push({ label: 'Faltas cometidas', valor: String(j.fc[0]), sub: j.fc[2] + ' con libres', tono: j.fi ? tonoDe(nivel(T.faltasPJ, C.faltasPJ, true)) : null });
    return { id: 'riesgo', titulo: '⚠️ Anatomía del riesgo', lineas, chips, tiles, alertas };
  }

  /* ---------- Faltas con el reglamento FIBA/CAB (campos fi, bn, faltasEq) ---------- */
  function faltasFiba(j, T, C, paq, lineas, chips) {
    if (!j.fi || !j.bn) return;       // paquete anterior a las faltas FIBA/CAB: la card sigue sin ellas
    const fi = j.fi, bn = j.bn;
    const expulsiones = fi[2] + fi[3];
    if (fi[7]) {
      lineas.push({ texto: 'Faltas del reglamento (personales, técnicas y antideportivas): ' + fi[7] + ' en ' + j.pj + ' partidos'
        + (T.faltasPJ != null ? ' (' + num(T.faltasPJ, 2) + ' por partido, ' + TEXTO_NIVEL[nivel(T.faltasPJ, C.faltasPJ, true)] + ')' : '')
        + '. Llegó a 3 o más en ' + plural(fi[0], 'partido', 'partidos') + ' y a 4 o más en ' + fi[1] + '. Expulsado por 5 faltas: ' + fi[2]
        + ' · por técnicas, antideportivas o descalificante: ' + fi[3] + '.', tono: expulsiones > 0 ? 'neg' : null });
    }
    if (bn[0] || bn[2]) {
      lineas.push({ texto: 'Bonus de equipo (la 5.ª falta del cuarto se penaliza; el suplementario cuenta como 4.º cuarto): ' + bn[0] + ' de sus faltas sumaron al camino hacia el bonus'
        + (bn[0] ? ', ' + bn[1] + ' con el bonus prematuro (4 faltas del equipo con más de la mitad del cuarto por jugar)' + (T.tempranoBonus != null ? ' = ' + num(100 * T.tempranoBonus, 0) + ' %, ' + TEXTO_NIVEL[nivel(T.tempranoBonus, C.tempranoBonus, true)] : '') : '')
        + '; ' + bn[3] + ' fueron la 4.ª del equipo. Cometió ' + plural(bn[2], 'falta penalizada', 'faltas penalizadas') + ' (dan libres), ' + bn[4] + ' de ellas la primera del bonus.'
        + ' Las faltas en ataque suman al equipo pero nunca dan libres.' });
    }
    if (fi[5]) {
      lineas.push({ texto: 'Llegó al 4.º cuarto con 3 faltas o más en ' + plural(fi[5], 'partido', 'partidos') + ' y terminó expulsado en ' + fi[6]
        + (T.gestionQ4 != null ? ' (gestión del riesgo ' + num(100 * T.gestionQ4, 0) + ' %' + contraLigaPct(C.gestionQ4).replace(' (competencia', ', competencia') : '') + '.' });
    }
    const eq = paq && paq.rendimiento && paq.rendimiento.faltasEq;
    if (eq && eq[0]) {
      lineas.push({ texto: 'El equipo llegó al bonus en ' + eq[1] + ' de ' + eq[0] + ' cuartos (' + eq[2] + ' prematuros) y el rival en ' + eq[3] + ' (' + eq[4] + ' prematuros).', nota: true });
    }
    const perfil = perfilFaltas(T, C);
    perfil.forEach((id) => {
      const p = PERFIL_FALTAS[id];
      lineas.push({ texto: p[0] + ': ' + p[1] + '. Lectura contra los cuartiles de la competencia.', tono: p[2] });
      chips.push({ label: 'Faltas', valor: p[0], tono: p[2] });
    });
  }

  /* ================================================== LA VISTA */

  /* LA VISTA · Bento Grid. Cada bloque es una micro-card: titular, fichas
     numéricas con semáforo, barras donde hay un reparto y, plegada, la
     lectura completa. El color nunca va solo: lleva el símbolo (▲ ● ▼ ◆)
     y el semáforo es contra la competencia (verde sobre su cuarto alto,
     ámbar en rango, rojo bajo su cuarto bajo). Las clases .rend-* van a
     mano en el <style> del index.html (nodos inyectados, punto 12). */
  const MARCA = { pos: '▲', aviso: '●', neg: '▼', info: '◆' };
  const claseTono = (t) => ' rend-t-' + (t || 'nulo');
  const marca = (t) => (t && MARCA[t] ? `<span aria-hidden="true">${MARCA[t]}</span> ` : '');

  const ficha = (t) => `<div class="rend-ficha${claseTono(t.tono)}">
      <div class="rend-ficha-l">${esc(t.label)}</div>
      <div class="rend-ficha-v">${marca(t.tono)}${esc(t.valor)}</div>
      ${t.delta ? `<div class="rend-ficha-d"><span class="delta-chip delta-${esc(t.delta.tono)}" title="${esc(t.delta.titulo || '')}">${esc(t.delta.texto)}</span>${t.delta.nota ? ` <span class="rend-ficha-n">≈ ${esc(t.delta.nota)}</span>` : ''}</div>` : ''}
      ${t.sub ? `<div class="rend-ficha-s">${esc(t.sub)}</div>` : ''}</div>`;
  const barra = (b) => `<div class="rend-barra">
      <div class="rend-barra-t"><span>${esc(b.label)}</span><span>${esc(b.sub)}</span></div>
      <div class="rend-pista" role="img" aria-label="${esc(b.label + ': ' + b.sub)}"><div class="rend-relleno${claseTono(b.tono || 'info')}" style="width:${Math.max(2, Math.min(100, Math.round(b.pct || 0)))}%"></div></div></div>`;
  const alerta = (a) => `<div class="rend-alerta${claseTono(a.tono)}" role="note">
      <b>${a.icono ? `<span aria-hidden="true">${esc(a.icono)}</span> ` : marca(a.tono)}${esc(a.titulo)}</b>${a.texto ? `<span>${esc(a.texto)}</span>` : ''}</div>`;
  const chip = (c) => `<span class="rend-chip${claseTono(c.tono)}">${marca(c.tono)}${esc(c.label)} <b>${esc(c.valor)}</b></span>`;
  /* La misma vista la usa la card de TIRO del jugador (sgadd-jugadores.js):
     una sola definición de ficha, barra, alerta y chip. */
  const vista = { MARCA, claseTono, marca, ficha, barra, alerta, chip };

  function bloqueHtml(b) {
    const ancho = (b.id === 'veredicto' || b.id === 'riesgo') ? ' rend-ancho' : '';
    return `<section class="rend-card${ancho}" data-rendimiento="${esc(b.id)}">
      <h5 class="rend-card-t">${esc(b.titulo)}</h5>
      ${b.titular ? `<p class="rend-titular">${esc(b.titular)}</p>` : ''}
      ${b.alerta ? alerta(b.alerta) : ''}
      ${(b.alertas || []).length ? `<div class="rend-alertas">${b.alertas.map(alerta).join('')}</div>` : ''}
      ${(b.tiles || []).length ? `<div class="rend-fichas">${b.tiles.map(ficha).join('')}</div>` : ''}
      ${(b.barras || []).length ? `<div class="rend-barras">${b.barras.map(barra).join('')}</div>` : ''}
      ${(b.triples || []).length ? `<p class="rend-mini">Triple por distancia · ${b.triples.map(esc).join(' · ')}</p>` : ''}
      <details class="rend-detalle"><summary>Lectura detallada</summary>
        <ul>${b.lineas.map(l => `<li class="${l.nota ? 'text-muted' : 'text-ink'}${l.tono && l.tono !== 'info' ? ' ' + (l.tono === 'pos' ? 'mm-pos' : 'mm-neg') : ''}">${l.tono ? marca(l.tono) : ''}${esc(l.texto)}</li>`).join('')}</ul>
      </details>
    </section>`;
  }

  function html(paq, nombre) {
    let a;
    try { a = analizar(paq, nombre); } catch (e) { a = { ok: false, motivo: 'No se pudo armar la card de Rendimiento.' }; }
    if (!a.ok) return `<p class="text-xs text-muted">${esc(a.motivo)}</p>`;
    return `<div class="pbp-bloque rend-raiz" data-pbp-listo="1">
      <p class="rend-pie-t">Laboratorio · ${a.pj} partidos de ${esc(paq.equipo || '')} con play-by-play oficial · semáforo contra los cuartiles de la competencia.</p>
      ${a.semaforo.length ? `<div class="rend-chips">${a.semaforo.map(c => `<span class="rend-chip${claseTono(c.tono)}">${marca(c.tono)}${esc(c.label)} <b>${esc(c.valor)}</b></span>`).join('')}</div>` : ''}
      <div class="rend-grid">${a.bloques.map(bloqueHtml).join('')}</div>
    </div>`;
  }

  return { FRANJAS, analizar, html, tasas, nivel, idDe, perfilFaltas, PERFIL_FALTAS, vista };
})();

if (typeof module !== 'undefined') module.exports = SGADD_RENDIMIENTO;
