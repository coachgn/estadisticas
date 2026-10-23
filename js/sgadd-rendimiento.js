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
    const m = MIN || { pj: 5, tiros: 40, canastas: 15, ast: 15, faltas: 15, perdidas: 15, segOn: 6000, segOff: 3600, segunda: 10 };
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
    };
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
      riesgo(j, T, C),
    ];
    return { ok: true, id, nombre: nombreDe(paq, id), pj: j.pj, bloques };
  }

  /* ---------- 1 · Veredicto ---------- */
  function veredicto(j, T, C, quien) {
    const lineas = [], chips = [];
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
      chips.push({ label: 'On/Off Net', valor: signo(T.onoff), tono });
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
      chips.push({ label: 'Pts/tiro', valor: num(T.ppt, 2) });
    }
    /* Su arma y su riesgo: la tasa mejor y peor ubicada contra la competencia. */
    const ARMAS = [['rca', 'crea su propio tiro'], ['linea', 'saca faltas que lo mandan a la línea'], ['vnap', 'sus asistencias valen puntos'], ['segPpt', 'castiga la segunda oportunidad']];
    const arma = ARMAS.filter(a => nivel(T[a[0]], C[a[0]]) === 'alto')[0];
    const riesgoAlto = nivel(T.tcdp, C.tcdp, true) === 'bajo';
    const partes = [];
    if (arma) partes.push('Su arma: ' + arma[1] + '.');
    if (riesgoAlto) partes.push('Su riesgo: el rival le castiga las pérdidas con puntos en 7 segundos más que a la mayoría (' + num(100 * T.tcdp, 0) + ' %).');
    if (partes.length) lineas.push({ texto: partes.join(' ') });
    return { id: 'veredicto', titulo: '🎙️ Resumen ejecutivo · el veredicto', lineas, chips };
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
      chips.push({ label: 'RCA', valor: num(pct(j.rca[1], j.rca[0]), 0) + ' %' });
    }
    if (j.seg[0]) {
      const nv = nivel(T.segPpt, C.segPpt);
      lineas.push({ texto: 'Segundas oportunidades: ' + j.seg[1] + '/' + j.seg[0] + ' tras rebote ofensivo (' + num(j.seg[0] ? j.seg[2] / j.seg[0] : null, 2) + ' pts/tiro'
        + (T.segPpt != null ? ', ' + TEXTO_NIVEL[nv] : '') + '). ' + num(pct(j.seg[3], j.seg[0]), 0) + ' % con su propio rebote, '
        + num(pct(j.seg[4], j.seg[0]), 0) + ' % inmediatos (≤ 3 s) y ' + num(pct(j.seg[5], j.seg[0]), 0) + ' % reabriendo a la línea de 3.',
      tono: nv === 'alto' ? 'pos' : (nv === 'bajo' ? 'neg' : null) });
    }
    if (!lineas.length) lineas.push({ texto: 'Sin tiros de campo en los partidos con play-by-play.' });
    return { id: 'espacio', titulo: '🗺️ Gravedad espacial, creación y segundas oportunidades', lineas, chips };
  }

  /* ---------- 3 · Reloj y clutch ---------- */
  function reloj(paq, id, j) {
    const lineas = [], chips = [];
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
    } else lineas.push({ texto: 'Sin minutos de clutch con la cancha validada.' });
    return { id: 'reloj', titulo: '⏱️ Crono-análisis, participación por posesión y clutch', lineas, chips };
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
    lineas.push({ texto: 'El play-by-play no registra el pase previo a la asistencia: no hay hockey assists.', nota: true });
    return { id: 'quimica', titulo: '🤝 Química colectiva, red de pases y perfil de lanzamiento', lineas, chips };
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
    return { id: 'defensa', titulo: '🛡️ Defensa: robos por franja, tapones e impacto invisible', lineas, chips };
  }

  /* ---------- 6 · Riesgo ---------- */
  function riesgo(j, T, C) {
    const lineas = [], chips = [];
    const fr = j.fr;
    if (fr[0]) {
      lineas.push({ texto: fr[0] + ' faltas recibidas: ' + fr[1] + ' de tiro con 2 libres, ' + fr[2] + ' sobre triple, ' + fr[3] + ' and-1, '
        + fr[4] + ' con 2 libres y el rival en bonus (de tiro o de penalización: el dato no lo separa), ' + fr[5] + ' sin libres (saque) y '
        + fr[8] + ' cargos provocados. Libres: ' + fr[7] + '/' + fr[6] + ' (' + num(pct(fr[7], fr[6]), 0) + ' %).'
        + (T.linea != null ? ' Lo mandan a la línea en el ' + num(100 * T.linea, 0) + ' % de sus faltas, ' + TEXTO_NIVEL[nivel(T.linea, C.linea)] + '.' : '') });
      chips.push({ label: 'And-1', valor: String(fr[3]) });
    }
    const pp = j.pp;
    if (pp[0]) {
      const nv = nivel(T.tcdp, C.tcdp, true);
      lineas.push({ texto: pp[0] + ' pérdidas: ' + pp[1] + ' robadas por el rival, ' + pp[2] + ' por falta en ataque y el resto con la pelota muerta. TCDP '
        + num(pct(pp[3], pp[0]), 0) + ' %: ' + pp[3] + ' terminaron en puntos del rival en ≤ 7 s (' + pp[4] + ' puntos)'
        + (T.tcdp != null ? ', ' + TEXTO_NIVEL[nivel(T.tcdp, C.tcdp)] : '') + '. El play-by-play no dice si fueron de drible o de pase.',
      tono: nv === 'alto' ? 'pos' : (nv === 'bajo' ? 'neg' : null) });
      chips.push({ label: 'TCDP', valor: num(pct(pp[3], pp[0]), 0) + ' %' });
    }
    const d = j.dis;
    const incidentes = d[0] + d[1] + d[2];
    const ide = d[5] ? 100 * (1 - (d[3] + d[4]) / d[5]) : null;
    lineas.push({ texto: (incidentes ? plural(d[0], 'técnica', 'técnicas') + ', ' + plural(d[1], 'antideportiva', 'antideportivas') + ' y ' + plural(d[2], 'descalificante', 'descalificantes')
        + '; de ellas, ' + d[3] + ' a ≤ 10 s de un error propio (faltas por frustración). '
      : 'Sin técnicas ni antideportivas. ') + plural(d[4], 'falta personal', 'faltas personales') + ' a ≤ 5 s de un error propio (pueden ser de corte, no siempre de reacción). '
      + 'IDE ' + num(ide, 0) + ' %: ' + (d[5] ? 'de sus ' + d[5] + ' errores (pérdidas y tiros errados), los que NO terminaron en una falta suya.' : 'sin errores registrados.'),
    tono: d[3] > 0 ? 'neg' : null });
    chips.push({ label: 'IDE', valor: ide == null ? '—' : num(ide, 0) + ' %' });
    const f = j.fc;
    if (f[0]) lineas.push({ texto: f[0] + ' faltas cometidas: ' + f[1] + ' en ataque, ' + f[2] + ' con libres para el rival y ' + f[3] + ' sin libres.' });
    return { id: 'riesgo', titulo: '⚠️ Anatomía del riesgo: faltas, pérdidas y temperamento', lineas, chips };
  }

  /* ================================================== LA VISTA */

  const TONO = { pos: 'mm-pos', neg: 'mm-neg' };
  const MARCA = { pos: '▲ ', neg: '▼ ' };

  function html(paq, nombre) {
    let a;
    try { a = analizar(paq, nombre); } catch (e) { a = { ok: false, motivo: 'No se pudo armar la card de Rendimiento.' }; }
    if (!a.ok) return `<p class="text-xs text-muted">${esc(a.motivo)}</p>`;
    const chips = a.bloques.reduce((s, b) => s.concat(b.chips || []), []);
    const bloque = (b) => `
      <div class="mb-4" data-rendimiento="${esc(b.id)}">
        <h5 class="font-display uppercase tracking-wide text-xs text-accent mb-1.5">${esc(b.titulo)}</h5>
        <ul>${b.lineas.map(l => `<li class="text-[12px] ${l.nota ? 'text-muted' : 'text-ink'} leading-snug mb-1${l.tono ? ' ' + TONO[l.tono] : ''}">${l.tono ? MARCA[l.tono] : ''}${esc(l.texto)}</li>`).join('')}</ul>
      </div>`;
    return `<div class="pbp-bloque" data-pbp-listo="1">
      <p class="text-[11px] text-muted mb-3"><i>Diagnóstico integral 360° basado en play-by-play, micro-momentos y eficiencia de procesos.</i>
        Laboratorio · ${a.pj} partidos de ${esc(paq.equipo || '')} con play-by-play oficial. Las comparaciones son contra los jugadores con muestra de la competencia;
        una lectura es una lectura: decide el cuerpo técnico.</p>
      ${chips.length ? `<div class="flex flex-wrap gap-2 mb-4">${chips.map(c => `<span class="text-[11px] px-2 py-0.5 rounded border border-hairline ${c.tono ? TONO[c.tono] : 'text-ink'}">${esc(c.label)} <b>${esc(c.valor)}</b></span>`).join('')}</div>` : ''}
      ${a.bloques.map(bloque).join('')}
    </div>`;
  }

  return { FRANJAS, analizar, html, tasas, nivel, idDe };
})();

if (typeof module !== 'undefined') module.exports = SGADD_RENDIMIENTO;
