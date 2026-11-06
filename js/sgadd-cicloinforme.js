/* ============================================================================
   SGADD · INFORME DE CICLO (el Artifact «Jujuy Básquet · Ciclo 0», nativo)
   ----------------------------------------------------------------------------
   Reconstruye, dentro del panel y con los datos vivos, el informe que se armó
   a mano como Artifact (https://claude.ai/artifact/C6Kc6X4twmjm6ULawVfFQA).
   Seis secciones, en el mismo orden y con las mismas cards:

     PRINCIPAL      resumen · ejes Motor / Combustión / Balance · 4 Factores ·
                    los 4 partidos · proceso vs resultado · techo · mantener /
                    corregir · Fuga 1 (tiro rival) · Fuga 2 (transición) · Fuga 3 (zona fría)
     EQUIPOS        general + hoja de ruta · personalidad · reloj de posesión ·
                    mapa de tiro · on/off, dúos, tríos y quintetos · cuartos y cierre
     JUGADORES      matriz USG% vs PPP · cuadrantes · minutos · desempeño por
                    bloques · mapas por jugador · consolidado · reestructuración
     CLASIFICACIÓN  posición actual · escenarios de rendimiento (no proyección)
     FIXTURE        carga de calendario · SOS · disponibilidad · próximo ciclo ·
                    ventanas de entrenamiento
     PLAN           metas del ciclo siguiente · tablero de control · qué esperar ·
                    reglas de lectura

   CÓMO ESTÁ ARMADO (para volver y mejorar una card sin tocar las demás)
   - `armar(ctx)` es PURO: junta las fuentes y llama a una función por card
     (`cardXxx`). Cada card devuelve { html } o { html: '' } si el dato no
     alcanza, y su cabecera dice de dónde sale cada número.
   - Fuentes (ctx):
       idx   el índice del libro abierto (la temporada: es la vara de la liga)
       paq   el paquete de laboratorio del equipo (ciclos, partidosPbp con
             tramos de cancha y línea de tanteo, reloj, tiros, rendimiento)
       ciclo el ciclo armado por SGADD_CICLOS.armarCiclo
       doc   el archivo del torneo (calendario, formato), opcional
   - REGLA DEL PROYECTO: lo que el dato no trae no se inventa. Una card sin
     dato dice qué falta; las lecturas van marcadas como lectura.
   - Las metas «reales» son la MITAD DEL CAMINO entre el valor de hoy y la
     liga (o el escalón siguiente del panel), igual que en el Artifact.
   - Unidades: ORTG, DRTG y NET por 100 posesiones (POS = PLAYS − RO);
     PPP por jugada; pts/tiro por intento de campo.
   ============================================================================ */
const SGADD_CICLOINFORME = (function () {
  'use strict';

  /* ===================================================== AYUDAS */

  const esNum = v => typeof v === 'number' && isFinite(v);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n = (v, d) => esNum(v) ? v.toFixed(d === undefined ? 1 : d).replace('.', ',') : '—';
  const pc = (v, d) => esNum(v) ? n(v * 100, d === undefined ? 1 : d) + ' %' : '—';
  const sg = (v, d) => esNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + n(Math.abs(v), d) : '—';
  const sum = (l, f) => l.reduce((t, x) => t + (f ? f(x) : x), 0);
  const med = (l) => { const v = (l || []).filter(esNum).slice().sort((a, b) => a - b); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const div = (a, b) => (esNum(a) && esNum(b) && b !== 0 ? a / b : null);
  const iso = (d) => (d instanceof Date && !isNaN(d)) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : (typeof d === 'string' ? d.slice(0, 10) : null);
  const dia = (s) => { const x = String(s || ''); return x.length >= 10 ? x.slice(8, 10) + '/' + x.slice(5, 7) : x; };
  /** «2026-11-02» → «2026-11-03» (sobre el texto, sin zona horaria). */
  const diaSig = (s) => { const p = String(s || '').slice(0, 10).split('-').map(Number); if (p.length < 3 || !p[0]) return null; const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)); return d.toISOString().slice(0, 10); };
  const clave = (s) => { try { return (typeof SGADD !== 'undefined' && SGADD.claveEquipo) ? SGADD.claveEquipo(s) : String(s || '').toUpperCase().trim(); } catch (e) { return String(s || '').toUpperCase(); } };
  /** «STEHLI, RAMIRO GERMAN» → «Stehli» (el apellido, como en el Artifact). */
  const corto = (nom) => String(nom || '').split(',')[0].trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6', 'Z7', 'Z8', 'Z9', 'Z10', 'Z11', 'Z12', 'Z13', 'Z14'];
  const NOMBRE_ZONA = { Z1: 'bajo el aro', Z2: 'corta izquierda', Z3: 'corta frontal', Z4: 'corta derecha', Z5: 'media fondo izq.', Z6: 'media ala izq.', Z7: 'media frontal', Z8: 'media ala der.', Z9: 'media fondo der.', Z10: 'esquina izquierda', Z11: 'triple ala izquierda', Z12: 'triple frontal', Z13: 'triple ala derecha', Z14: 'esquina derecha' };
  const FRANJAS = ['0-7 s · transición', '8-17 s · juego armado', '18-24 s · final del reloj'];
  const ORIGEN = { RD: 'Tras nuestro tiro errado (rebote defensivo del rival)', ROBO: 'Tras nuestra pérdida (robo)', SAQUE: 'Saque tras canasta nuestra', MUERTA: 'Pérdida con pelota muerta', PERIODO: 'Inicio de período' };
  const MITAD = 0.5;          // la meta real: mitad del camino (criterio del Artifact)
  const SOLAPE = 0.5;         // escenario prudente: la mitad de la suma, porque las metas se pisan

  /* ---- vista: tiles, chips y tarjetas (clases `.ci-*`, estilo propio inyectado) ---- */
  const tono = (pct, inv) => !esNum(pct) ? 'info' : (pct >= 70 ? 'pos' : pct < 40 ? 'neg' : 'warn');
  const glifo = t => ({ pos: '▲', neg: '▼', warn: '●', info: '◆' }[t] || '◆');
  const tile = (l, v, s, t) => `<div class="ci-tile ${t || 'info'}"><div class="ci-tl">${esc(l)}</div><div class="ci-tv"><span class="ci-gl">${glifo(t)}</span>${v}</div>${s ? `<div class="ci-ts">${s}</div>` : ''}</div>`;
  const card = (titulo, cuerpo, cls) => cuerpo ? `<div class="ci-card ${cls || ''}"><h3>${esc(titulo)}</h3>${cuerpo}</div>` : '';
  const nota = t => `<p class="ci-nota">${t}</p>`;
  const tabla = (cab, filas) => `<div class="ci-scroll"><table><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const ruta = (t, cab, cuerpo, meta) => `<div class="ci-rt ${t}"><div class="ci-rh">${glifo(t)} ${cab}</div><div class="ci-rb">${cuerpo}</div>${meta ? `<div class="ci-rm">${meta}</div>` : ''}</div>`;
  const vacio = t => `<p class="ci-vacio">${t}</p>`;

  /* ===================================================== LA LIGA (vara)

     Cada métrica de equipo se ubica contra la DISTRIBUCIÓN de la liga en el
     libro abierto (un valor por equipo): mediana, puesto y percentil con la
     dirección de la métrica. Con un ciclo de 4 partidos la vara es la liga
     de la temporada, no otro ciclo (Ciclo 0 = línea base). */
  const INVERTIDAS = new Set(['eFG Opp%', 'PePP%', 'RTL Opp%', 'RTNG DEF', 'RO Opp%', 'PPP DEF']);
  function vara(idx, k) {
    const d = ((idx && idx.liga && idx.liga.distribuciones) || {})[k];
    const v = (d || []).filter(esNum);
    return v.length ? { dist: v, med: med(v), inv: INVERTIDAS.has(k) } : null;
  }
  function ubicar(idx, k, valor, propio) {
    const V0 = vara(idx, k);
    /* La distribución trae la TEMPORADA del propio equipo: se saca, y el valor del ciclo ocupa su lugar. */
    let V = V0;
    if (V0 && esNum(propio)) { const i = V0.dist.findIndex(x => Math.abs(x - propio) < 1e-9); if (i >= 0) V = Object.assign({}, V0, { dist: V0.dist.filter((x, j) => j !== i) }); }
    if (V && V !== V0) V = Object.assign({}, V, { dist: V.dist.concat(esNum(valor) ? [valor] : []) });
    if (!V || !esNum(valor)) return { valor, med: V ? V.med : null, puesto: null, de: V ? V.dist.length : null, pct: null };
    const mejores = V.dist.filter(x => V.inv ? x < valor - 1e-9 : x > valor + 1e-9).length;
    const peores = V.dist.filter(x => V.inv ? x > valor + 1e-9 : x < valor - 1e-9).length;
    return { valor, med: V.med, puesto: mejores + 1, de: V.dist.length, /* Percentil de rango medio (los empates cuentan la mitad), el mismo del Artifact: 2.º de 17 = 91, 17.º = 3. */
    pct: Math.round(100 * (peores + 0.5 * (V.dist.length - mejores - peores)) / V.dist.length) };
  }

  /* ===================================================== EL EQUIPO EN EL CICLO */

  /** Los partidos del ciclo en el libro (fila del equipo), cruzados por fecha. */
  function filasDelCiclo(idx, e, fechas) {
    return (e && e.partidos || []).filter(p => fechas.has(iso(p.__fecha)));
  }
  /** Una métrica del equipo sobre un conjunto de partidos, con el motor del núcleo.
      `agregarPartidos` devuelve TOTALES (propio, rival) y las tasas sobre esos totales
      (tiro, factores). Acá se arma `P`: cuentas por partido y tasas, con las mismas
      claves que el libro, para que todo el informe lea un solo objeto.
      PACE = posesiones cada 40 minutos de juego (los MIN del equipo ÷ 5 son los
      minutos jugados, suplementarios incluidos). */
  function agregado(idx, e, partidos) {
    if (!idx || !idx.agregarPartidos || !e || !partidos.length) return null;
    let a = null;
    try { a = idx.agregarPartidos(e.clave, partidos); } catch (err) { return null; }
    if (!a || !a.propio) return null;
    const pj = a.pj || partidos.length, Y = a.propio, R = a.rival || {}, T = a.tiro || {}, F = a.factores || {};
    const P = {};
    Object.keys(Y).forEach((k) => { P[k] = Y[k] / pj; });
    Object.keys(R).forEach((k) => { P[k + 'opp'] = R[k] / pj; });
    Object.assign(P, T, F);
    const minJuego = Y.MIN ? Y.MIN / 5 / pj : 40;
    const posMedia = ((Y.POS || 0) + (R.POS || Y.POS || 0)) / 2 / pj;
    P.PACE = minJuego ? posMedia * 40 / minJuego : null;
    P['RD%'] = (Y.RD + (R.RO || 0)) ? Y.RD / (Y.RD + (R.RO || 0)) : null;
    P['AST-PP'] = Y.PP ? Y.AST / Y.PP : null;
    P['T1%'] = Y.T1I ? Y.T1C / Y.T1I : null;
    P['RTNG OFF'] = Y.POS ? 100 * Y.PTS / Y.POS : null;
    P['RTNG DEF'] = R.POS ? 100 * R.PTS / R.POS : null;
    P['NET RTNG'] = esNum(P['RTNG OFF']) && esNum(P['RTNG DEF']) ? P['RTNG OFF'] - P['RTNG DEF'] : null;
    a.P = P; a.promedios = P;
    return a;
  }
  const val = (a, k) => (a && a.P && esNum(a.P[k]) ? a.P[k] : null);

  /** Ratings por 100 posesiones de un agregado (punto 66: POS = PLAYS − RO). */
  function ratings(a) {
    if (!a || !a.P) return {};
    return { pos: a.P.POS, ortg: a.P['RTNG OFF'], drtg: a.P['RTNG DEF'], net: a.P['NET RTNG'] };
  }

  /* ===================================================== EL PLAY-BY-PLAY DEL CICLO

     `partidosPbp` trae, por partido: la línea de tanteo [t, propio, rival,
     anotador] y los TRAMOS de cancha [desde, hasta, 5 propios, 5 rivales,
     dif inicial, dif final, período], con índices a `ids`/`nombres`. De ahí
     salen, solo para los partidos del ciclo: puntos por tramo, on/off,
     dúos, tríos, quintetos y el cuarto por combinación.
     LAS POSESIONES DE UN TRAMO SE ESTIMAN con el ritmo de ESE partido
     (posesiones del libro ÷ segundos jugados): el play-by-play no marca la
     posesión. Es una estimación declarada en la pantalla. */
  function pbpDelCiclo(paq, ciclo) {
    const ids = new Set((ciclo.resultados.partidos || []).map(p => String(p.id)));
    return ((paq && paq.partidosPbp) || []).filter(g => ids.has(String(g.id)));
  }
  function puntosEntre(linea, d, h) {
    let pf = 0, pc = 0, prev = [0, 0, 0];
    (linea || []).forEach((x) => { if (x[0] > d && x[0] <= h) { pf += x[1] - prev[1]; pc += x[2] - prev[2]; } prev = x; });
    return [pf, pc];
  }
  /** Las combinaciones de k de una lista. */
  function combinar(l, k) {
    const out = [];
    const rec = (i, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let j = i; j < l.length; j++) { acc.push(l[j]); rec(j + 1, acc); acc.pop(); } };
    rec(0, []); return out;
  }
  function rotacion(g8, posPorPartido) {
    const acc = { 5: new Map(), 3: new Map(), 2: new Map(), 1: new Map() };
    const cuarto = new Map();                                   // período → quinteto → acumulado
    const total = { seg: 0, pf: 0, pc: 0, pos: 0 };
    const nombres = {};
    g8.forEach((g) => {
      const dur = Math.max(1, ...((g.tramos || []).map(t => t[1])));
      const pps = div(posPorPartido[String(g.id)], dur) || (78 / 2400);   // sin libro, ~78 posesiones en 40 min
      const nom = (i) => { const id = (g.ids || [])[i]; const x = (g.nombres || {})[id]; const s = x ? corto(x[0]) : String(id); nombres[s] = x ? x[0] : s; return s; };
      (g.tramos || []).forEach((t) => {
        const seg = t[1] - t[0];
        if (seg <= 0 || !Array.isArray(t[2]) || t[2].length !== 5) return;
        const [pf, pc] = puntosEntre(g.linea, t[0], t[1]);
        const pos = seg * pps;
        total.seg += seg; total.pf += pf; total.pc += pc; total.pos += pos;
        const cinco = t[2].map(nom).sort();
        [5, 3, 2, 1].forEach((k) => combinar(cinco, k).forEach((c) => {
          const key = c.join(' · ');
          const a = acc[k].get(key) || { nombres: c, seg: 0, pf: 0, pc: 0, pos: 0, pj: new Set() };
          a.seg += seg; a.pf += pf; a.pc += pc; a.pos += pos; a.pj.add(String(g.id));
          acc[k].set(key, a);
        }));
        const q = t[6];
        if (!cuarto.has(q)) cuarto.set(q, new Map());
        const k5 = cinco.join(' · ');
        const cq = cuarto.get(q).get(k5) || { nombres: cinco, seg: 0, pf: 0, pc: 0 };
        cq.seg += seg; cq.pf += pf; cq.pc += pc; cuarto.get(q).set(k5, cq);
      });
    });
    const fin = (a) => Object.assign({}, a, { min: a.seg / 60, pj: a.pj ? a.pj.size : null, mm: a.pf - a.pc,
      ortg: a.pos ? 100 * a.pf / a.pos : null, drtg: a.pos ? 100 * a.pc / a.pos : null, net: a.pos ? 100 * (a.pf - a.pc) / a.pos : null });
    const lista = (k) => Array.from(acc[k].values()).map(fin).sort((a, b) => b.seg - a.seg);
    const on = lista(1).map((j) => {
      const off = { seg: total.seg - j.seg, pf: total.pf - j.pf, pc: total.pc - j.pc, pos: total.pos - j.pos };
      const netOff = off.pos ? 100 * (off.pf - off.pc) / off.pos : null;
      return { nombre: j.nombres[0], minOn: j.min, minOff: off.seg / 60, netOn: j.net, netOff, dif: esNum(j.net) && esNum(netOff) ? j.net - netOff : null };
    });
    return { quintetos: lista(5), trios: lista(3), duos: lista(2), on, total, cuarto, nombres };
  }

  /** El reloj del ciclo: suma de `partidosPbp[i].reloj` de los partidos del ciclo. */
  function relojDelCiclo(g8) {
    const z = () => ({ f: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ro: [0, 0, 0], fa: [0, 0, 0] });
    const out = { favor: z(), contra: z(), con: 0 };
    g8.forEach((g) => {
      if (!g.reloj) return; out.con++;
      ['favor', 'contra'].forEach((l) => {
        const r = g.reloj[l] || {};
        (r.f || []).forEach((x, i) => { if (i < 3 && Array.isArray(x)) x.forEach((v, j) => { out[l].f[i][j] = (out[l].f[i][j] || 0) + (v || 0); }); });
        ['ro', 'fa'].forEach((k) => (r[k] || []).forEach((x, j) => { if (j < 3) out[l][k][j] += x || 0; }));
      });
    });
    return out;
  }
  const pptDe = a => (a && a[0] ? a[2] / a[0] : null);
  /** El plantel del paquete: { id: {n, d} } (o la forma vieja, lista de pares). id → nombre. */
  function nombresPaq(paq) {
    const j = (paq && paq.jugadores) || {}, out = {};
    (Array.isArray(j) ? j : Object.entries(j)).forEach(([id, x]) => { out[id] = x && (x.n || x.nombre) ? (x.n || x.nombre) : String(id); });
    return out;
  }

  /* ===================================================== LOS JUGADORES DEL CICLO

     Del libro (`Base Datos J`), solo las filas del equipo en las fechas del
     ciclo: se suman las cuentas y las tasas se recalculan sobre los totales.
     USG% = PLAYS × (MIN del equipo ÷ 5) ÷ (PLAYS del equipo × MIN), la fórmula
     de la planilla (punto 24). Mismo filtro por EQUIPO que el buzón: un
     homónimo del rival no entra (punto 86). */
  const CUENTAS = ['MIN', 'PTS', 'PLAYS', 'T2C', 'T2I', 'T3C', 'T3I', 'T1C', 'T1I', 'PP', 'AST', 'RD', 'RO', 'PR', 'FC', 'FR'];
  function jugadoresDelCiclo(idx, e, fechas, filasEq) {
    const mapa = (idx && idx.liga && idx.liga.jugadorPartidos) || new Map();
    const eqPlays = sum(filasEq, p => p.PLAYS || 0);
    const eqMin = sum(filasEq, p => esNum(p.MIN) && p.MIN > 0 ? p.MIN : 200);
    const out = [], sinMin = [];
    mapa.forEach((filas) => {
      const mias = (filas || []).filter(f => clave(f.EQUIPO) === e.clave && fechas.has(iso(f.__fecha)));
      if (!mias.length) return;
      const t = { nombre: mias[0].NOMBRES, equipo: mias[0].EQUIPO, pj: mias.filter(f => (f.MIN || 0) > 0).length };
      CUENTAS.forEach(k => { t[k] = sum(mias, f => esNum(f[k]) ? f[k] : 0); });
      if (!t.MIN) { sinMin.push(t.nombre); return; }
      /* Minutos por partido DEL CICLO (como el Artifact): un jugador que faltó a un partido
         promedia sobre los del ciclo, no sobre los que jugó. */
      t.min = t.MIN / Math.max(1, fechas.size);
      t.TCI = t.T2I + t.T3I; t.TCC = t.T2C + t.T3C;
      t.ppp = div(t.PTS, t.PLAYS);
      t.ts = div(t.PTS, 2 * (t.TCI + 0.44 * t.T1I));
      t.usg = (eqPlays && t.MIN) ? (t.PLAYS * (eqMin / 5)) / (eqPlays * t.MIN) : null;
      t.astpp = t.PP ? t.AST / t.PP : t.AST;
      t.partTiempo = eqMin ? t.MIN / (eqMin / 5) : null;
      out.push(t);
    });
    out.sort((a, b) => b.min - a.min);
    out.sinMin = sinMin;
    return out;
  }
  /** Las varas de jugador de la liga (los calificados de la temporada). */
  function varaJ(idx, k) { const d = ((idx && idx.liga && idx.liga.distribucionesJ) || {})[k]; return med(d); }

  /** Semáforo individual (el del Artifact): sobre la mediana de PPP de la liga. */
  function semaforo(j, mPPP, mTS) {
    if (!esNum(j.ppp) || !esNum(mPPP)) return { id: 'sin', label: '◆ Sin muestra', t: 'info' };
    const p = Math.round(j.ppp * 100) / 100, m = Math.round(mPPP * 100) / 100;
    if (j.PLAYS < 12) return { id: 'sin', label: '◆ Sin muestra', t: 'info' };
    if (p >= m + 0.03 && esNum(j.ts) && esNum(mTS) && j.ts >= mTS + 0.05 && j.min >= 15) return { id: 'elite', label: '★ Élite', t: 'pos' };
    if (p >= m) return { id: 'cumplido', label: '✓ Cumplido', t: 'pos' };
    if (p >= m - 0.14) return { id: 'alerta', label: '⚠ Alerta', t: 'warn' };
    return { id: 'critico', label: '✖ Crítico', t: 'neg' };
  }

  /* ===================================================== LAS PALANCAS (puntos por partido)

     Cuántos puntos por partido vale mover una métrica, con los volúmenes
     reales del equipo en el ciclo. Es la misma cuenta de posesiones que la
     proyección del Diagnóstico (SGADD_CONCLUSIONES), no una regresión. */
  const PALANCA = {
    'eFG%': (d, P) => d * 2 * (P.TCI || 0),
    'PePP%': (d, P) => d * (P.PLAYS || 0) * (div(P.PTS, (P.PLAYS || 0) - (P.PP || 0)) || 0),
    'RO%': (d, P) => d * ((P.RO || 0) + (P.RDopp || 0)) * (div(P.PTS, P.PLAYS) || 0),
    'RTL%': (d, P) => d * (P.TCI || 0) * (P['T1%'] || 0.7),
    'eFG Opp%': (d, P) => d * 2 * (P.TCIopp || P.TCI || 0),
    'PP Opp%': (d, P) => d * (P.PLAYSopp || 0) * (div(P.PTSopp, (P.PLAYSopp || 0) - (P.PPopp || 0)) || 0),
    'RTL Opp%': (d, P) => d * (P.TCIopp || P.TCI || 0) * 0.7,
    'RD%': (d, P) => d * ((P.RD || 0) + (P.ROopp || 0)) * (div(P.PTSopp, P.PLAYSopp) || 0),
    'T3%': (d, P) => d * 3 * (P.T3I || 0),
  };
  /** d en la dirección buena (positivo = mejora). */
  const ganancia = (k, actual, objetivo, P) => {
    if (!PALANCA[k] || !esNum(actual) || !esNum(objetivo)) return null;
    const d = INVERTIDAS.has(k) || k === 'PP Opp%' ? (k === 'PP Opp%' ? objetivo - actual : actual - objetivo) : objetivo - actual;
    const v = PALANCA[k](d, P);
    return esNum(v) ? v : null;
  };

  /* ===================================================== ARMAR */

  function armar(ctx) {
    const { idx, paq, ciclo: c } = ctx || {};
    const out = { ok: false, secciones: {} };
    if (!idx || !paq || !c) return out;
    const e = (idx.lista ? idx.lista() : []).find(x => clave(x.nombre) === clave(paq.equipo || c.meta.equipo));
    const fechas = new Set(c.resultados.partidos.map(p => p.fecha));
    const filasEq = e ? filasDelCiclo(idx, e, fechas) : [];
    const A = agregado(idx, e, filasEq);
    const g8 = pbpDelCiclo(paq, c);
    const posPorPartido = {};
    c.resultados.partidos.forEach((p) => { const f = filasEq.find(x => iso(x.__fecha) === p.fecha); if (f) posPorPartido[p.id] = esNum(f.POS) ? f.POS : ((f.PLAYS || 0) - (f.RO || 0)); });
    const X = {
      idx, paq, c, e, fechas, filasEq, A, R: ratings(A), g8, doc: ctx.doc || null,
      rot: g8.length ? rotacion(g8, posPorPartido) : null,
      reloj: relojDelCiclo(g8),
      jug: e ? jugadoresDelCiclo(idx, e, fechas, filasEq) : [],
      n: c.meta.partidos,
    };
    X.sinMin = (X.jug && X.jug.sinMin) || [];
    /* La fecha de los datos: el día siguiente al cierre para un ciclo cerrado (la liga se mide
       ahí); para uno abierto, la del último partido. La tabla anterior viene del llamador. */
    X.hoy = ctx.hoy || (c.meta.cerrado ? diaSig(c.meta.hasta) : c.meta.hasta);
    X.anterior = ctx.anterior || null;
    X.paqC = paqDelCiclo(X);
    /* Los cuartos del ciclo con los parciales del play-by-play (sin el suplementario adentro del 4.º). */
    X.cuartos = c.cuartos.map((q) => {
      const pf = [], pcn = [];
      c.resultados.partidos.forEach((p) => { const pr = parcialesDe(X, p)[q.cuarto - 1]; if (pr) { pf.push(pr[0]); pcn.push(pr[1]); } });
      if (pf.length !== c.resultados.partidos.length) return q;
      const a = sum(pf), b = sum(pcn);
      return Object.assign({}, q, { parcial: { favor: a, contra: b, dif: a - b } });
    });
    /* La mediana de jugadores es la fila JUGADOR TIPO de la planilla (la que audita el club);
       sin ella, la mediana de los calificados. */
    const tipo = (k) => { const T = idx.liga && idx.liga.jugadorTipo; return T && esNum(T[k]) ? T[k] : varaJ(idx, k); };
    X.mPPP = tipo('PPP'); X.mUSG = tipo('USG%'); X.mTS = tipo('TS%');
    X.metricas = metricasEquipo(X);
    out.contexto = X;
    out.secciones = {
      principal: [cardResumen, cardMotor, cardCombustion, cardBalance, card4Factores, cardPartidos, cardProceso, cardTecho, cardMantener, cardFuga1, cardFuga2, cardFuga3],
      equipos: [cardGeneral, cardHojaRuta, cardPersonalidad, cardReloj, cardMapa, cardRotacion, cardCuartos],
      jugadores: [cardMatriz, cardCuadrantes, cardMinutos, cardDesempeno, cardMapasJugador, cardConsolidado, cardReestructura],
      clasificacion: [cardPosicion, cardEscenarios],
      fixture: [cardCalendario, cardSOS, cardDisponibilidad, cardProximo, cardVentanas],
      plan: [cardPlan, cardTablero, cardEsperar, cardReglas],
    };
    out.ok = true;
    return out;
  }

  /** Las métricas de equipo del ciclo, cada una ubicada contra la liga. */
  const METRICAS = {
    'PACE': 'PACE (pos. cada 40 min)', 'PLAYS': 'PLAYS por partido', 'POS': 'POS por partido',
    'eFG%': 'eFG% propio', 'eFG Opp%': 'eFG% permitido', 'TS%': 'TS%', 'PPP': 'PPP (por jugada)', 'T3%': 'T3%', 'T2%': 'T2%',
    'PePP%': 'Pérdidas (TOV%)', 'RO%': 'Rebote ofensivo (RO%)', 'RD%': 'Rebote defensivo (RD%)', 'RTL%': 'RTL% propio', 'RTL Opp%': 'RTL Opp% (libres concedidos)', 'PP Opp%': 'Pérdidas forzadas',
    'PT3%': 'Jugadas que terminan en triple', 'AST-PP': 'Asistencias por pérdida', 'RO Opp%': 'RO% del rival', 'PR': 'Recuperos', 'AST%': 'AST%',
  };
  function metricasEquipo(X) {
    const m = {};
    const temp = (k) => { try { const r = X.e ? X.idx.leer(X.e.clave, k) : null; return r && esNum(r.valor) ? r.valor : null; } catch (err) { return null; } };
    Object.keys(METRICAS).forEach((k) => { m[k] = Object.assign({ k, label: METRICAS[k] }, ubicar(X.idx, k, val(X.A, k), temp(k))); });
    m['RTNG OFF'] = Object.assign({ k: 'RTNG OFF', label: 'ORTG (por 100 pos.)' }, ubicar(X.idx, 'RTNG OFF', X.R.ortg, temp('RTNG OFF')));
    m['RTNG DEF'] = Object.assign({ k: 'RTNG DEF', label: 'DRTG (por 100 pos.)' }, ubicar(X.idx, 'RTNG DEF', X.R.drtg, temp('RTNG DEF')));
    m['NET RTNG'] = Object.assign({ k: 'NET RTNG', label: 'NET real (por 100 pos.)' }, ubicar(X.idx, 'NET RTNG', X.R.net, temp('NET RTNG')));
    return m;
  }
  const fmt = (k, v) => !esNum(v) ? '—' : (/%$/.test(k) ? pc(v) : (k === 'PPP' || k === 'PPP DEF' || k === 'AST-PP' ? n(v, 2) : (k === 'NET RTNG' ? sg(v) : n(v, 1))));
  /** Un tile de métrica con su liga y su puesto (`desc` = descriptiva: azul, sin juicio). */
  function tileM(X, k, desc) {
    const m = X.metricas[k]; if (!m) return '';
    const t = desc ? 'info' : tono(m.pct);
    return tile(m.label, fmt(k, m.valor), `liga ${fmt(k, m.med)}${m.puesto ? ` · puesto ${m.puesto}/${m.de}` : ''}`, t);
  }

  /* ============================================================ PRINCIPAL */

  /* ---- el modelo del Simulador (SGADD_4F) sobre el índice al cierre del ciclo:
          NET ajustado con su puesto y su credibilidad, y los pesos de los 4 Factores. ---- */
  function modeloLiga(X) {
    if (X._mod !== undefined) return X._mod;
    let r = null;
    try {
      const mod = (typeof SGADD_4F !== 'undefined' && SGADD_4F.modeloDe) ? SGADD_4F.modeloDe(X.idx) : null;
      const q = mod && mod.equipos && X.e ? mod.equipos.get(X.e.clave) : null;
      if (mod && mod.equipos) {
        const nets = Array.from(mod.equipos.values()).map(v => v.ortg - v.drtg);
        const adj = q ? q.ortg - q.drtg : null;
        r = { adj, puesto: esNum(adj) ? nets.filter(v => v > adj + 1e-9).length + 1 : null, de: nets.length, cred: q ? q.z : null,
          sos: q ? q.sos : null, pesos: (mod.pesos && mod.pesos.pesos) || null, metodo: mod.pesos && mod.pesos.metodo, mod };
      }
    } catch (err) { r = null; }
    X._mod = r;
    return r;
  }
  /** «2.º», «17.º». Con el último de la liga, el texto lo dice (el más alto, el más bajo). */
  const ord = m => (m && m.puesto ? m.puesto + '.º' : '—');
  const ordDe = m => (m && m.puesto ? `${m.puesto}.º de ${m.de}` : '—');
  /** El nombre del equipo para el texto: «Jujuy» de «JUJUY BASQUET». */
  const nombreEq = X => corto(String(X.c.meta.equipo || '').split(/\s+/)[0]);

  /* § Resumen ejecutivo · margen, NET real y ajustado, ORTG, DRTG, PPP.
     El texto sigue al Artifact: qué hace el equipo (ritmo, volumen), qué NO
     explica el resultado y qué sí (la dimensión con el peor puesto), y cuánto
     vale cerrar la brecha. Todo sale de las métricas del ciclo contra la liga. */
  function cardResumen(X) {
    const res = X.c.resultados, M = X.metricas, eq = esc(nombreEq(X));
    const margen = res.puntos.dif / X.n, mod = modeloLiga(X);
    const pace = M.PACE, plays = M.PLAYS;
    let s = '';
    if (pace.puesto === 1) s = `${eq} corre más que nadie en la conferencia (PACE ${fmt('PACE', pace.valor)}, 1.º de ${pace.de})`;
    else if (esNum(pace.pct) && pace.pct >= 70) s = `${eq} es de los equipos que más corren (PACE ${fmt('PACE', pace.valor)}, ${ordDe(pace)})`;
    else if (esNum(pace.pct) && pace.pct < 40) s = `${eq} juega a ritmo lento (PACE ${fmt('PACE', pace.valor)}, ${ordDe(pace)})`;
    else s = `${eq} juega a ritmo de liga (PACE ${fmt('PACE', pace.valor)}, ${ordDe(pace)})`;
    s += plays.puesto === 1 ? ` y es el equipo que más plays genera por partido (${fmt('PLAYS', plays.valor)}). ` : `, con ${fmt('PLAYS', plays.valor)} plays por partido (${ord(plays)}). `;
    s += `El ciclo cerró ${res.record.g}-${res.record.p} con un margen de ${sg(margen)} pts por partido`;
    /* Lo que NO explica la brecha (las fortalezas del ciclo) y lo que SÍ (el tiro, si está en el fondo). */
    const fuerte = ['RO%', 'PP Opp%', 'RD%'].map(k => M[k]).filter(m => m && esNum(m.pct) && m.pct >= 70);
    const tiroMal = [M['eFG%'], M['eFG Opp%']].filter(m => m && esNum(m.pct) && m.pct < 40);
    const ultimo = m => m.puesto === m.de;
    if (margen < 0 && tiroMal.length) {
      const art = { 'RO%': 'el rebote ofensivo', 'RD%': 'el rebote defensivo', 'PP Opp%': 'las pérdidas que fuerza' };
      const noEs = ['el ritmo'].concat(fuerte.slice(0, 1).map(m => `${art[m.k]} (${fmt(m.k, m.valor)}, ${ord(m)})`)).join(' ni ');
      s += `, y lo que explica la brecha no es ${noEs}: es lo que pasa con el tiro. Ataca con eFG ${fmt('eFG%', M['eFG%'].valor)} (${ordDe(M['eFG%'])}) y concede ${fmt('eFG Opp%', M['eFG Opp%'].valor)}${ultimo(M['eFG Opp%']) ? ', el más alto de la liga' : ''} (${ord(M['eFG Opp%'])}).`;
    } else if (margen < 0) {
      s += `. El tiro está en rango (eFG ${fmt('eFG%', M['eFG%'].valor)}, ${ord(M['eFG%'])}; permitido ${fmt('eFG Opp%', M['eFG Opp%'].valor)}, ${ord(M['eFG Opp%'])}): la brecha está en los otros factores (ver la tabla de abajo).`;
    } else {
      s += `. Lo sostiene ${fuerte.length ? fuerte.map(m => `${m.label.split(' (')[0].toLowerCase()} (${fmt(m.k, m.valor)}, ${ord(m)})`).join(' y ') : 'un ataque y una defensa en rango'}; ganar no corrige lo que está bajo la liga.`;
    }
    const brecha = esNum(M.PPP.valor) && esNum(M.PPP.med) && esNum(plays.valor) ? (M.PPP.valor - M.PPP.med) * plays.valor : null;
    const peso = mod && mod.pesos && esNum(mod.pesos['eFG%']) ? mod.pesos['eFG%'] / 100 : null;
    const s2 = [esNum(peso) ? `Cada punto porcentual de eFG vale ${n(peso, 2)} pts por partido con los pesos de la liga.` : '',
      esNum(brecha) ? `Con ${Math.round(plays.valor)} plays por partido a ${n(M.PPP.valor, 2)} puntos por jugada, la ${brecha < 0 ? 'brecha' : 'ventaja'} contra el PPP de la liga (${n(M.PPP.med, 2)}) son ${n(Math.abs(brecha), 1)} pts por partido${brecha < 0 && esNum(plays.pct) && plays.pct >= 70 ? ': hay volumen de sobra y falta rendimiento por jugada' : ''}.` : ''].filter(Boolean).join(' ');
    const ppc = M['PPP DEF'] || ubicar(X.idx, 'PPP DEF', val(X.A, 'PTSopp') && val(X.A, 'PLAYSopp') ? val(X.A, 'PTSopp') / val(X.A, 'PLAYSopp') : null);
    const pppT = M.PPP ? tile(M.PPP.label, fmt('PPP', M.PPP.valor), `liga ${fmt('PPP', M.PPP.med)}${ppc && esNum(ppc.valor) ? ` · rival concede ${n(ppc.valor, 2)} (liga ${n(ppc.med, 2)})` : ''}`, tono(M.PPP.pct)) : '';
    return card('Resumen ejecutivo', `<p class="ci-lead">${s}</p>${s2 ? `<p class="ci-lee">${s2}</p>` : ''}
      <div class="ci-tiles">${tile('Margen real', sg(margen) + ' pts', `${res.puntos.favor} a favor · ${res.puntos.contra} en contra · ${X.n} PJ`, margen >= 0 ? 'pos' : 'neg')}
      ${tileM(X, 'NET RTNG')}${mod && esNum(mod.adj) ? tile('NET ajustado por rival', sg(mod.adj), `modelo con encogimiento · puesto ${mod.puesto}/${mod.de}${esNum(mod.cred) ? ` · credibilidad ${Math.round(100 * mod.cred)} %` : ''}`, mod.adj >= 0 ? 'pos' : 'neg') : ''}
      ${tileM(X, 'RTNG OFF')}${tileM(X, 'RTNG DEF')}${pppT}</div>
      ${nota(`Dos unidades, no se mezclan. ORTG, DRTG y NET miden puntos cada 100 posesiones (norma CAB/FIBA, POS = PLAYS − RO). El PPP mide puntos por jugada (PLAYS).${mod && esNum(mod.adj) ? ` El NET ajustado pasa de ${sg(X.R.net)} a ${sg(mod.adj)} porque el modelo lo acerca a la media de la liga: con ${X.n} partidos, buena parte de lo que se ve es ruido.` : ''} ${rangoPJ(X)}`)}`);
  }
  /** «Ranking sobre 17 equipos que jugaron entre 1 y 6 partidos.» */
  function rangoPJ(X) {
    const pjs = (X.idx && X.idx.lista ? X.idx.lista() : []).map(e => e.pj).filter(esNum);
    return pjs.length ? `Ranking sobre ${pjs.length} equipos que jugaron entre ${Math.min(...pjs)} y ${Math.max(...pjs)} partidos.` : '';
  }

  /* § Los 3 ejes de traducción colectiva (Motor / Combustión / Balance del riesgo).
     Cada eje cierra con una lectura en una frase: qué hace el equipo y qué le cuesta. */
  function cardMotor(X) {
    const M = X.metricas, dif = esNum(M.PLAYS.valor) && esNum(M.PLAYS.med) ? M.PLAYS.valor - M.PLAYS.med : null;
    const brecha = esNum(M.PPP.valor) && esNum(M.PPP.med) && esNum(M.PLAYS.valor) ? (M.PPP.valor - M.PPP.med) * M.PLAYS.valor : null;
    const quien = M.PACE.puesto === 1 ? 'Es el equipo más veloz de la conferencia.' : esNum(M.PACE.pct) && M.PACE.pct >= 70 ? `Es de los más veloces (${ordDe(M.PACE)} en ritmo).` : esNum(M.PACE.pct) && M.PACE.pct < 40 ? `Juega lento (${ordDe(M.PACE)} en ritmo).` : `Juega a ritmo de liga (${ordDe(M.PACE)}).`;
    const txt = esNum(dif) ? `${quien} Ese ritmo (${n(Math.abs(dif), 1)} plays ${dif >= 0 ? 'por encima' : 'por debajo'} de la liga) vale la pena solo si cada jugada paga${esNum(brecha) ? (brecha < 0 ? `: hoy rinde ${n(-brecha, 1)} pts menos por partido que con el PPP de la liga.` : `: hoy rinde ${n(brecha, 1)} pts más por partido que con el PPP de la liga.`) : '.'}` : 'El ritmo describe, no juzga.';
    return card('El Motor · ritmo y volumen', `<div class="ci-tiles">${tileM(X, 'PACE', true)}${tileM(X, 'PLAYS', true)}${tileM(X, 'POS', true)}</div>${nota(txt)}`, 'eje azul');
  }
  function cardCombustion(X) {
    const M = X.metricas, P = (X.A && X.A.P) || {};
    const t3 = M['T3%'], pt3 = M['PT3%'];
    const faltan = esNum(t3.valor) && esNum(t3.med) && esNum(P.T3I) ? (t3.med - t3.valor) * P.T3I * X.n : null;
    let txt = '';
    if (pt3 && esNum(pt3.valor) && esNum(t3.valor)) {
      const elige = esNum(pt3.pct) && pt3.pct >= 70 ? 'Elige tirar de tres' : esNum(pt3.pct) && pt3.pct < 40 ? 'Tira poco de tres' : 'Tira de tres como la liga';
      txt = `${elige} (${fmt('PT3%', pt3.valor)} de sus jugadas, ${ord(pt3)}) y convierte ${fmt('T3%', t3.valor)}, ${ord(t3)}.`;
      if (esNum(faltan) && faltan > 0) txt += ` Con el T3% de la liga (${fmt('T3%', t3.med)}) habría anotado ${n(faltan, 1)} triples más en ${X.n} partidos: ${n(faltan * 3 / X.n, 1)} pts por partido.`;
      else if (esNum(faltan)) txt += ` Está sobre el T3% de la liga (${fmt('T3%', t3.med)}): el triple paga.`;
    }
    const efgO = M['eFG Opp%'];
    if (efgO && esNum(efgO.pct) && efgO.pct < 40) txt += ` Del otro lado, el rival tira ${fmt('eFG Opp%', efgO.valor)} de eFG (${ord(efgO)}): la Combustión se pierde en los dos costados.`;
    return card('La Combustión · ejecución y selección', `<div class="ci-tiles">${['eFG%', 'eFG Opp%', 'TS%', 'PPP', 'T3%', 'T2%'].map(k => tileM(X, k)).join('')}</div>${nota(txt || 'Sin la vara de la liga para el tiro.')}`, 'eje verde');
  }
  /** Una lectura de una línea por métrica del Balance (lo que el DT entiende sin la sigla). */
  const DICE = {
    'RO%': (m) => `gana el cristal (RO% ${fmt('RO%', m.valor)}, ${ord(m)})`, 'PP Opp%': (m) => `fuerza pérdidas (${fmt('PP Opp%', m.valor)}, ${ord(m)})`,
    'RD%': (m) => `cierra el rebote defensivo (${fmt('RD%', m.valor)}, ${ord(m)})`, 'RTL Opp%': (m) => `concede poca línea (${fmt('RTL Opp%', m.valor)}, ${ord(m)})`,
    'PePP%': (m) => `cuida la pelota (TOV% ${fmt('PePP%', m.valor)}, ${ord(m)})`, 'RTL%': (m) => `llega a la línea (RTL% ${fmt('RTL%', m.valor)}, ${ord(m)})`,
  };
  const NO_DICE = {
    'RTL%': (m) => `llegar a la línea: RTL% ${fmt('RTL%', m.valor)} contra ${fmt('RTL%', m.med)} de la liga`, 'PePP%': (m) => `cuidar la pelota: pierde ${fmt('PePP%', m.valor)} de sus jugadas (liga ${fmt('PePP%', m.med)})`,
    'RO%': (m) => `ir al cristal: RO% ${fmt('RO%', m.valor)} contra ${fmt('RO%', m.med)} de la liga`, 'RD%': (m) => `cerrar el rebote defensivo: ${fmt('RD%', m.valor)} contra ${fmt('RD%', m.med)}`,
    'PP Opp%': (m) => `forzar pérdidas: ${fmt('PP Opp%', m.valor)} contra ${fmt('PP Opp%', m.med)}`, 'RTL Opp%': (m) => `defender sin falta: el rival llega a la línea en el ${fmt('RTL Opp%', m.valor)} de sus jugadas (liga ${fmt('RTL Opp%', m.med)})`,
  };
  function cardBalance(X) {
    const ks = ['PePP%', 'RO%', 'RD%', 'RTL%', 'RTL Opp%', 'PP Opp%'], M = X.metricas;
    const bien = ['RO%', 'PP Opp%', 'RD%', 'RTL Opp%', 'PePP%', 'RTL%'].map(k => M[k]).filter(m => m && esNum(m.pct) && m.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 2);
    const mal = ['RTL%', 'PePP%', 'RO%', 'RD%', 'PP Opp%', 'RTL Opp%'].map(k => M[k]).filter(m => m && esNum(m.pct) && m.pct < 40).sort((a, b) => a.pct - b.pct)[0];
    let txt = bien.length ? cap(bien.map(m => DICE[m.k](m)).join(' y ')) + '.' : 'Ninguna métrica del Balance pasa el percentil 70.';
    if (mal) txt += ` Lo que no hace es ${NO_DICE[mal.k](mal)}.`;
    return card('El Balance del Riesgo · disciplina y segundas', `<div class="ci-tiles">${ks.map(k => tileM(X, k)).join('')}</div>${nota(txt)}`, 'eje rojo');
  }
  const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  /** «SP. SUARDI» → «Sp. Suardi», «HINDU (C)» → «Hindu (C)»: el nombre del rival para el texto. */
  const tit = s => String(s || '').toLowerCase().replace(/(^|[\s.(\-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase()).replace(/\(([^)]*)\)/g, (m, x) => '(' + x.toUpperCase() + ')');

  /* § Los 4 Factores de Dean Oliver: propio, concedido, liga, diferencial NETO y valor en puntos.
     El valor = diferencial neto (propio − concedido, con el signo bueno) × el peso de cada
     factor en la liga (la regresión del Simulador con prior de Dean Oliver). Es lo que valdría
     contra un rival promedio. Sin el modelo, cae a los pesos clásicos de Oliver. */
  function card4Factores(X) {
    if (!X.A) return card('Los 4 Factores de Dean Oliver', vacio('El libro abierto no trae los partidos del ciclo: elegí la categoría de esa temporada.'));
    const M = X.metricas, mod = modeloLiga(X);
    const W = mod && mod.pesos ? mod.pesos : null;
    const F = [['Tiro · eFG%', 'eFG%', 'eFG Opp%', 'eFG%'], ['Pérdidas · TOV% (menos es mejor)', 'PePP%', 'PP Opp%', 'PP%'], ['Rebote ofensivo · RO%', 'RO%', 'RO Opp%', 'RO%'], ['Línea · RTL%', 'RTL%', 'RTL Opp%', 'RTL%']];
    let total = 0, peorV = null, mejorV = null;
    const filas = F.map(([t, a, b, w]) => {
      const pa = M[a] || ubicar(X.idx, a, val(X.A, a)), pb = M[b] || ubicar(X.idx, b, val(X.A, b));
      const dif = esNum(pa.valor) && esNum(pb.valor) ? (a === 'PePP%' ? pb.valor - pa.valor : pa.valor - pb.valor) : null;
      const v = esNum(dif) && W && esNum(W[w]) ? dif * W[w] : null;
      if (esNum(v)) { total += v; if (!peorV || v < peorV.v) peorV = { t, v }; if (!mejorV || v > mejorV.v) mejorV = { t, v }; }
      return [esc(t), fmt(a, pa.valor), fmt(b, pb.valor) + (a === 'PePP%' ? ' forzadas' : ''), `${fmt(a, pa.med)} / ${fmt(b, pb.med)}`, esNum(dif) ? sg(dif * 100) + ' pp' : '—', esNum(v) ? `<b class="${v >= 0 ? 'pos' : 'neg'}">${sg(v)}</b>` : '—'];
    });
    filas.push(['<b>Suma</b>', '', '', '', '', `<b class="${total >= 0 ? 'pos' : 'neg'}">${sg(total)}</b>`]);
    const margen = X.c.resultados.puntos.dif / X.n;
    const lect = peorV && mejorV ? ` Lectura: ${peorV.v < 0 ? `${peorV.t.split(' ·')[0].toLowerCase()} concentra la brecha` : 'ningún factor resta'}${mejorV.v > 0 ? `; ${mejorV.t.split(' ·')[0].toLowerCase()} compensa una parte` : ''}.` : '';
    return card('Los 4 Factores de Dean Oliver', tabla(['Factor Dean Oliver', nombreEq(X), 'Rival (lo que concede)', 'Liga', 'Diferencial', 'Valor en puntos*'], filas)
      + nota(`*Diferencial neto (propio menos concedido) por el peso de cada factor en la liga (regresión con prior de Dean Oliver${mod && mod.metodo ? '' : ''}). Es lo que valdría contra un rival promedio; los factores suman ${sg(total)} de los ${sg(margen)} pts de margen real, y el resto es varianza y localía.${lect}`));
  }

  /* § Los 4 partidos: marcador, ratings y factores de cada noche. */
  function porPartido(X) {
    return X.c.resultados.partidos.map((p) => {
      const f = X.filasEq.filter(x => iso(x.__fecha) === p.fecha);
      const a = agregado(X.idx, X.e, f), r = ratings(a);
      return { p, a, r };
    });
  }
  /** El partido crudo del paquete (parciales por cuarto) y si hubo suplementario. */
  const crudo = (X, p) => (CIC().partidosDe(X.paq) || []).find(x => String(x.id) === String(p.id)) || null;
  /** Los puntos de cada período desde la línea de tanteo del play-by-play (FIBA: cuartos de
      600 s y suplementarios de 300 s). El bloque `ciclos` del paquete SUMA el suplementario al
      4.º cuarto; la línea los separa, así que es la fuente de los parciales cuando está. */
  function porPeriodo(g) {
    const per = []; let prev = [0, 0, 0];
    (g && g.linea || []).forEach((x) => { const t = x[0]; const q = t <= 2400 ? Math.max(1, Math.ceil(t / 600)) : 4 + Math.ceil((t - 2400) / 300);
      per[q - 1] = per[q - 1] || [0, 0]; per[q - 1][0] += x[1] - prev[1]; per[q - 1][1] += x[2] - prev[2]; prev = x; });
    for (let i = 0; i < per.length; i++) per[i] = per[i] || [0, 0];
    return per;
  }
  /** Los parciales de un partido del ciclo: del play-by-play si está; si no, los del bloque `ciclos`. */
  const parcialesDe = (X, p) => { const g = (X.g8 || []).find(x => String(x.id) === String(p.id)); if (g && g.linea && g.linea.length) return porPeriodo(g); const r = crudo(X, p); return (r && r.parciales) || []; };
  const conTP = (X, p) => parcialesDe(X, p).length > 4;
  /** El rival en la liga del cierre: su NET y su puesto. */
  function rivalEnLiga(X, nombre) {
    const e = X.idx.get ? X.idx.get(nombre) : null;
    const r = e ? X.idx.leer(e.clave, 'NET RTNG') : null;
    const u = r && esNum(r.valor) ? ubicar(X.idx, 'NET RTNG', r.valor) : null;
    return { e, net: r && r.valor, puesto: u && u.puesto, de: u && u.de };
  }
  function cardPartidos(X) {
    const pp = porPartido(X);
    const filas = pp.map(({ p, a, r }) => [dia(p.fecha), esc(p.rival), p.condicion === 'LOCAL' ? 'L' : 'V', `${p.final[0]}-${p.final[1]}${conTP(X, p) ? ' (TP)' : ''}`, `<b class="${p.dif >= 0 ? 'pos' : 'neg'}">${sg(p.dif, 0)}</b>`,
      n(r.ortg), n(r.drtg), sg(r.net), pc(val(a, 'eFG%')), pc(val(a, 'eFG Opp%')), pc(val(a, 'PePP%')), pc(val(a, 'RO%')), a && a.propio ? `${a.propio.T3C || 0}/${a.propio.T3I || 0}` : '—']);
    const peor = pp.slice().sort((x, y) => x.p.dif - y.p.dif)[0];
    const otros = pp.filter(x => x !== peor);
    const sinPeor = otros.length ? sum(otros, x => x.p.dif) / otros.length : null;
    const pesa = peor && otros.length && Math.abs(peor.p.dif) > Math.abs(sum(otros, x => x.p.dif)) ? `pesa más que ${otros.length === 1 ? 'el otro' : `los otros ${otros.length} juntos`}` : 'es el que más pesa';
    return card(`Los ${X.n} partidos`, tabla(['Fecha', 'Rival', 'Cond.', 'Marcador', 'Margen', 'ORTG', 'DRTG', 'NET', 'eFG%', 'eFG% perm.', 'TOV%', 'RO%', 'T3'], filas)
      + nota(`ORTG, DRTG y NET por 100 posesiones.${pp.some(x => conTP(X, x.p)) ? ' TP = tiempo suplementario.' : ''}${peor && esNum(sinPeor) ? ` El partido de ${esc(tit(peor.p.rival))} (${sg(peor.p.dif, 0)}) ${pesa}: sin él, el margen medio es ${sg(sinPeor)}.` : ''}`));
  }

  /* § Partido a partido · proceso contra resultado: qué explica cada marcador.
     Reglas (todas sobre el box del partido contra la liga al cierre):
       · la noche de mejor ataque o mejor defensa del ciclo se nombra como tal;
       · volumen (plays, RO) contra lo que pasó con el tiro (T3) y la pelota (pérdidas);
       · si el rival fue mucho a la línea, se dice;
       · con el ataque en nivel y la defensa lejos, «se perdió atrás» con el NET del rival;
       · un suplementario con empate en los cuatro cuartos se cuenta. */
  function cardProceso(X) {
    const pp = porPartido(X), M = X.metricas;
    const L = { o: M['RTNG OFF'].med, d: M['RTNG DEF'].med, tov: M['PePP%'].med, rtlo: M['RTL Opp%'].med, plays: M.PLAYS.med };
    const conR = pp.filter(x => esNum(x.r.ortg) && esNum(x.r.drtg));
    const bestO = conR.length ? Math.max(...conR.map(x => x.r.ortg)) : null, bestD = conR.length ? Math.min(...conR.map(x => x.r.drtg)) : null;
    const lin = pp.map(({ p, a, r }) => {
      const P = (a && a.P) || {}, Y = (a && a.propio) || {};
      const t3 = `T3 ${Y.T3C || 0}/${Y.T3I || 0}`, t3p = Y.T3I ? Y.T3C / Y.T3I : null, tov = val(a, 'PePP%'), rtlo = val(a, 'RTL Opp%');
      const riv = rivalEnLiga(X, p.rival);
      const nomR = tit(p.rival);
      const s = [];
      const pr = parcialesDe(X, p);
      let tp = '';
      if (pr.length > 4) {
        const reg = pr.slice(0, 4).reduce((t, q) => [t[0] + q[0], t[1] + q[1]], [0, 0]);
        tp = ' en suplementario';
        if (reg[0] === reg[1]) s.push(`Empató ${reg[0]}-${reg[1]} en los cuatro cuartos.`);
      }
      const ataqueBueno = esNum(r.ortg) && esNum(L.o) && r.ortg >= L.o, defensaBuena = esNum(r.drtg) && esNum(L.d) && r.drtg <= L.d;
      const tovAlta = esNum(tov) && esNum(L.tov) && tov > L.tov + 0.02;
      if (esNum(r.ortg) && r.ortg === bestO && ataqueBueno) s.push(`El mejor ORTG del ciclo (${n(r.ortg)}, sobre la liga de ${n(L.o)}) con ${t3} y ${(Y.PP || 0) <= 10 ? 'solo ' : ''}${Y.PP || 0} pérdidas.`);
      else if (esNum(r.drtg) && r.drtg === bestD && defensaBuena) s.push(`La mejor defensa del ciclo (DRTG ${n(r.drtg)})${tovAlta ? `, pero ${Y.PP} pérdidas (${pc(tov)})` : ''}${tovAlta && riv.puesto && riv.puesto <= 3 ? `: ese costo no se pudo pagar contra un equipo ${riv.puesto}.º en NET` : ''}.`);
      else if (esNum(P.PLAYS) && esNum(L.plays) && P.PLAYS >= L.plays + 5) s.push(`Volumen alto (${Math.round(P.PLAYS)} plays, ${Y.RO || 0} RO) pero ${t3}${tovAlta ? ` y ${Y.PP} pérdidas (${pc(tov)})` : ''}.`);
      else s.push(`${t3}${tovAlta ? `, ${Y.PP} pérdidas (${pc(tov)})` : ''}.`);
      const ro = val(a, 'RO%');
      if (esNum(ro) && ro >= 0.33 && !/ RO\)/.test(s.join(' '))) s.push(`${Y.RO} RO (${pc(ro)})${(Y.AST || 0) <= 6 ? ` y solo ${Y.AST || 0} asistencias` : ''}.`);
      if (esNum(rtlo) && esNum(L.rtlo) && rtlo >= L.rtlo + 0.08) s.push(`El rival fue a la línea en el ${pc(rtlo)} de sus jugadas (liga ${pc(L.rtlo)}).`);
      const g = p.dif > 0;
      if (!g && ataqueBueno && !defensaBuena) s.push(`Se perdió atrás: DRTG ${n(r.drtg)} y eFG permitido ${pc(val(a, 'eFG Opp%'))}${riv.puesto ? ` contra el equipo ${riv.puesto === 1 ? 'con mejor NET de la liga' : `${riv.puesto}.º en NET`}` : ''}. Con el ataque en nivel, la diferencia la hizo una defensa que no sostuvo.`);
      else if (!g && !ataqueBueno && defensaBuena && !(r.drtg === bestD)) s.push(`${(esNum(t3p) && t3p < 0.25) || tovAlta ? 'El marcador se explica por acierto y descuido, no por el plan.' : 'Se perdió adelante: la defensa estuvo en nivel.'}`);
      else if (!g && !ataqueBueno && !defensaBuena) s.push('Perdido en los dos costados: ataque y defensa bajo la liga.');
      else if (g) s.push(esNum(r.net) && r.net < 5 ? 'Ganado con margen corto: hay techo para ampliar.' : 'Ganado con el proceso de su lado.');
      return `<div class="ci-pcard ${g ? 'pos' : 'neg'}"><h4>${dia(p.fecha)} · ${esc(nomR)}, ${p.condicion === 'LOCAL' ? 'local' : 'visitante'} (${sg(p.dif, 0)}${tp})</h4><p>${s.join(' ')}</p></div>`;
    }).join('');
    return card('Partido a partido · proceso contra resultado', `<div class="ci-grid2">${lin}</div>`);
  }

  /* § Techo de rendimiento: la mejor noche de ataque y la de defensa ya mostradas. */
  function cardTecho(X) {
    const pp = porPartido(X).filter(x => esNum(x.r.ortg) && esNum(x.r.drtg));
    if (!pp.length) return '';
    const bo = pp.slice().sort((a, b) => b.r.ortg - a.r.ortg)[0], bd = pp.slice().sort((a, b) => a.r.drtg - b.r.drtg)[0];
    const segunda = X.reloj.favor.ro, ligaRo = X.paq.liga && X.paq.liga.reloj && X.paq.liga.reloj.ro;
    const sinVic = !X.c.resultados.record.g;
    const misma = bo === bd;
    const donde = x => `${dia(x.p.fecha)} ${x.p.condicion === 'LOCAL' ? 'vs' : 'en'} ${esc(tit(x.p.rival))}`;
    const pR = pptDe(segunda), pL = pptDe(ligaRo);
    return card('Techo de rendimiento · lo que ya salió bien', `${sinVic ? `<p class="ci-lee">No hay victorias en el ciclo, así que la pregunta no es qué corregir al ganar sino cuál es el techo que el equipo ya mostró.${misma ? '' : ' Son dos noches distintas:'}</p>` : ''}
      <div class="ci-tiles t2">${tile('Mejor ataque', 'ORTG ' + n(bo.r.ortg), donde(bo), 'pos')}${tile('Mejor defensa', 'DRTG ' + n(bd.r.drtg), donde(bd), 'pos')}</div>
      <p class="ci-lee">${misma ? `La misma noche reunió el mejor ataque y la mejor defensa: NET ${sg(bo.r.net)}. Es la referencia del ciclo.` : `Juntar las dos en una misma noche daría un NET de ${sg(bo.r.ortg - bd.r.drtg)} por 100 posesiones. Es una referencia ilustrativa: ninguna noche reunió ataque y defensa. Ese es el techo del equipo y el trabajo del próximo ciclo.`}</p>
      ${segunda && segunda[0] ? nota(`<b>Eficiencia invisible.</b> Las segundas oportunidades (${segunda[0]} tiros tras rebote ofensivo) rindieron ${n(segunda[2] / X.n, 1)} pts por partido, a ${n(pR, 2)} por tiro${esNum(pL) ? ` contra ${n(pL, 2)} de la liga` : ''}.${esNum(pR) && esNum(pL) && pR < pL ? ' El cristal ofensivo ya sostiene al equipo; cuando el tiro se normalice, esa ventaja se convierte en puntos extra.' : ' El cristal ofensivo ya se convierte en puntos.'}`) : ''}`);
  }

  /* § Qué mantener y qué corregir: el rescate (lo que ya funciona, con su número) y las tres fugas.
     Mantener: rebote, robos y el quinteto inicial si compitió. Corregir: el tiro rival, la
     transición defensiva y la zona propia más fría. Cierra con «proceso sobre resultado». */
  function cardMantener(X) {
    const M = X.metricas, g = X.c.resultados.record.g, p = X.c.resultados.record.p;
    const fo = [], fu = [];
    const ro = M['RO%'], rd = M['RD%'], ppo = M['PP Opp%'], pr = M.PR;
    if (ro && esNum(ro.pct) && ro.pct >= 70) fo.push(`Rebote ofensivo ${fmt('RO%', ro.valor)} (${ord(ro)})${rd && esNum(rd.pct) && rd.pct >= 60 ? ` y defensivo ${fmt('RD%', rd.valor)}` : ''}.`);
    else if (rd && esNum(rd.pct) && rd.pct >= 70) fo.push(`Rebote defensivo ${fmt('RD%', rd.valor)} (${ord(rd)}).`);
    if (ppo && esNum(ppo.pct) && ppo.pct >= 70) fo.push(`Pérdidas forzadas ${fmt('PP Opp%', ppo.valor)} (${ord(ppo)})${pr && esNum(pr.valor) ? ` y ${n(pr.valor)} recuperos por partido (${ord(pr)})` : ''}.`);
    const ini = quintetoInicial(X);
    if (ini && ini.q && ini.q.mm > -6) fo.push(`El inicial ${ini.distinto ? `con ${esc(ini.distinto)} ` : ''}quedó ${sg(ini.q.mm, 0)} en ${n(ini.q.min)} minutos: compitió.`);
    Object.values(M).filter(m => esNum(m.pct) && m.pct >= 70 && !['PACE', 'PLAYS', 'POS', 'PT3%', 'RO%', 'RD%', 'PP Opp%', 'PR'].includes(m.k)).slice(0, 2).forEach(m => fo.push(`${esc(m.label)} ${fmt(m.k, m.valor)} (${ord(m)}).`));
    const t3c = zonasSum(X.c.zonas.contra || [], ['Z10', 'Z11', 'Z12', 'Z13', 'Z14']), lt3 = varaLiga3(X);
    if (M['eFG Opp%'] && esNum(M['eFG Opp%'].pct) && M['eFG Opp%'].pct < 40) fu.push(`eFG permitido ${fmt('eFG Opp%', M['eFG Opp%'].valor)}${t3c.i ? `: el rival convierte ${pc(t3c.c / t3c.i)} de sus triples (${t3c.c}/${t3c.i}; liga ${pc(lt3)})` : ''}.`);
    const tr = transicion(X);
    if (tr && esNum(tr.ppt) && esNum(tr.lppt) && tr.ppt > tr.lppt + 0.05) fu.push(`Transición defensiva: concede ${n(tr.ppt, 2)} por tiro en 0-7 s contra ${n(tr.lppt, 2)} de la liga.`);
    const zf = zonaFria(X);
    if (zf) fu.push(`Zona ${zf.zona} (${NOMBRE_ZONA[zf.zona]}): ${zf.c}/${zf.i} tiros.`);
    if (!fu.length) Object.values(M).filter(m => esNum(m.pct) && m.pct < 40 && !['PACE', 'PLAYS', 'POS', 'PT3%'].includes(m.k)).sort((a, b) => a.pct - b.pct).slice(0, 3).forEach(m => fu.push(`${esc(m.label)} ${fmt(m.k, m.valor)} (${ord(m)}).`));
    /* Proceso sobre resultado: lo defendible del volumen y la selección, y lo que es acierto. */
    const P = (X.A && X.A.P) || {}, t3 = M['T3%'], pt3 = M['PT3%'];
    const faltan = esNum(t3.valor) && esNum(t3.med) && esNum(P.T3I) && t3.valor < t3.med ? (t3.med - t3.valor) * P.T3I * 3 : null;
    const masRival = t3c.i && esNum(lt3) ? (t3c.c / t3c.i - lt3) * 3 * t3c.i / X.n : null;
    const proc = [`<b>Proceso sobre resultado:</b> el volumen y la selección de tiro${pt3 && esNum(pt3.valor) ? ` (triple ${fmt('PT3%', pt3.valor)} de las jugadas)` : ''} son defendibles.`,
      esNum(faltan) ? `El T3% bajo del ataque (${n(faltan, 1)} pts por partido) es candidato a normalizarse.` : '',
      esNum(masRival) && masRival > 1 ? `En la defensa, el rival tira ${pc(t3c.c / t3c.i)} de tres (${n(masRival, 1)} pts por partido sobre la liga): es en parte acierto del rival y en parte tiros cómodos, y la muestra no permite separarlos todavía.` : ''].filter(Boolean).join(' ');
    return card(`Qué mantener y qué corregir · resultado ${g}-${p}`, `<div class="ci-grid2"><div><h4 class="pos">Mantener${p && !g ? ' (rescate en la derrota)' : ''}</h4><ul class="ci-lista">${fo.map(x => `<li>${x}</li>`).join('') || '<li>Ninguna métrica pasa el percentil 70.</li>'}</ul></div>
      <div><h4 class="neg">Corregir (puntos de fuga)${g ? ' · también al ganar' : ''}</h4><ul class="ci-lista">${fu.map(x => `<li>${x}</li>`).join('') || '<li>Ninguna métrica cae bajo el percentil 40.</li>'}</ul></div></div>
      ${nota(proc)}`);
  }
  /** El quinteto que más veces arrancó en el ciclo (del play-by-play) y su +/- juntos. */
  function quintetoInicial(X) {
    if (!X.rot || !X.g8.length) return null;
    const cuenta = new Map();
    X.g8.forEach((g) => { const t = (g.tramos || []).find(x => x[0] === 0) || (g.tramos || [])[0]; if (!t || !Array.isArray(t[2])) return;
      const k = t[2].map(i => { const id = (g.ids || [])[i]; const x = (g.nombres || {})[id]; return x ? corto(x[0]) : String(id); }).sort().join(' · ');
      cuenta.set(k, (cuenta.get(k) || 0) + 1); });
    const top = Array.from(cuenta.entries()).sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const q = X.rot.quintetos.find(x => x.nombres.join(' · ') === top[0]);
    /* El que lo distingue del quinteto con más minutos (si son distintos). */
    const mas = X.rot.quintetos[0];
    const distinto = q && mas && mas !== q ? q.nombres.filter(nm => mas.nombres.indexOf(nm) < 0)[0] : null;
    return { q, veces: top[1], distinto, mas };
  }
  /** La transición defensiva del ciclo: tiros y puntos del rival en 0-7 s y la vara de la liga. */
  function transicion(X) {
    const T = X.c.transicion, L = X.paq.liga && X.paq.liga.ciclos;
    if (!T || !T.porOrigen) return null;
    const vals = Object.keys(ORIGEN).map(o => T.porOrigen[o] || {});
    const tiros = sum(vals, x => x.tiros || 0), pts = sum(vals, x => x.pts || 0);
    const lt = L && L.trans ? Object.values(L.trans).reduce((a, v) => [a[0] + (v[0] || 0), a[1] + (v[2] || 0)], [0, 0]) : null;
    return { tiros, pts, ppt: tiros ? pts / tiros : null, lppt: lt && lt[0] ? lt[1] / lt[0] : null };
  }
  /** La zona propia más fría con volumen (10+ tiros, más puntos perdidos contra la liga). */
  function zonaFria(X) {
    const zs = (X.c.zonas.favor || []).filter(z => z.i >= 10 && esNum(z.puntosDeMas));
    const z = zs.slice().sort((a, b) => a.puntosDeMas - b.puntosDeMas)[0];
    return z && z.puntosDeMas < 0 ? z : null;
  }

  /* ---- mapas de cancha (SGADD_CANCHA): relleno por puntos/tiro contra la liga, C/I por zona,
          ○ acierto / ✕ errado, y la zona citada resaltada con su perímetro. ---- */
  function mapa(zonas, tiros, resaltar, opciones) {
    const CA = (typeof SGADD_CANCHA !== 'undefined') ? SGADD_CANCHA : null;
    if (!CA) return '';
    const relleno = {}, rot = {};
    (zonas || []).forEach((z) => {
      if (!z.i) return;
      rot[z.zona] = `${z.c}/${z.i}`;
      if (!esNum(z.delta)) return;
      const malo = (opciones && opciones.defensa) ? z.delta > 0 : z.delta < 0;
      const a = Math.min(1, Math.abs(z.delta) / 0.3);
      relleno[z.zona] = { fill: malo ? '#dc2626' : '#16a34a', opacidad: 0.15 + 0.6 * a, titulo: `${z.zona} ${NOMBRE_ZONA[z.zona] || ''}: ${z.c}/${z.i} · ${n(z.ppt, 2)} por tiro, liga ${n(z.ligaPpt, 2)}` };
    });
    try {
      const r = CA.svg({ zonas: relleno, tiros, resaltar: resaltar || [], rotulosZona: rot, rotulo: (opciones && opciones.rotulo) || 'Mapa de tiro' });
      return `<div class="ci-court">${r.svg}</div><div class="ci-ley"><span><i class="ci-lg pos"></i>${(opciones && opciones.defensa) ? 'el rival rinde menos que la liga' : 'mejor que la liga'}</span><span><i class="ci-lg neg"></i>${(opciones && opciones.defensa) ? 'el rival rinde más que la liga' : 'peor que la liga'}</span><span>○ convertido</span><span>✕ errado</span></div>`;
    } catch (err) { return ''; }
  }
  const tirosCiclo = (X, lado) => [].concat(...X.g8.map(g => ((g.tiros || {})[lado] || [])));
  const zonasSum = (zs, ids) => zs.filter(z => ids.includes(z.zona)).reduce((a, z) => ({ i: a.i + z.i, c: a.c + z.c, pts: a.pts + z.pts, mas: a.mas + (z.puntosDeMas || 0) }), { i: 0, c: 0, pts: 0, mas: 0 });

  /* § Fuga 1 · el tiro del rival: dónde nos hacen daño y cuándo (cuartos). */
  function cardFuga1(X) {
    const zs = X.c.zonas.contra || [], m = X.metricas['eFG Opp%'];
    if (!zs.some(z => z.i)) return '';
    const t3 = zonasSum(zs, ['Z10', 'Z11', 'Z12', 'Z13', 'Z14']), alas = zonasSum(zs, ['Z11', 'Z13']), aro = zonasSum(zs, ['Z1']), esq = zonasSum(zs, ['Z10', 'Z14']);
    const lAro = ((X.paq.liga && X.paq.liga.zonas) || []).find(z => z.zona === 'Z1');
    const aroPct = aro.i ? aro.c / aro.i : null, lAroPct = lAro && lAro.i ? lAro.c / lAro.i : null;
    const aroBien = esNum(aroPct) && esNum(lAroPct) && aroPct <= lAroPct + 0.02;
    /* Las zonas que más daño hacen: con 10 tiros o más (con menos es ruido). */
    const top = zs.filter(z => z.i >= 10 && esNum(z.puntosDeMas) && z.puntosDeMas > 0).sort((a, b) => b.puntosDeMas - a.puntosDeMas).slice(0, 4);
    const filasZ = top.map(z => [`${esc(cap(NOMBRE_ZONA[z.zona]))} ${z.zona}`, z.i, z.c, n(z.ppt, 2), n(z.ligaPpt, 2), `<b class="neg">${sg(z.puntosDeMas)}</b>`, sg(z.puntosDeMas / X.n)]);
    const Q = X.c.cuartos;
    const cq = Q.map(q => [`${q.cuarto}.º`, q.contra.tiros, q.contra.pts, n(q.contra.esperados), `<b class="${q.contra.dif > 0 ? 'neg' : 'pos'}">${sg(q.contra.dif)}</b>`]);
    const prim = sum(Q.filter(q => q.cuarto <= 2), q => q.contra.dif), seg = sum(Q.filter(q => q.cuarto >= 3), q => q.contra.dif);
    const cuando = Q.length >= 4 ? `En el 1.º y el 2.º cuarto el rival anota ${sg(prim)} puntos sobre lo que esas zonas rinden en la liga; en el 3.º y el 4.º, ${sg(seg)}. ${prim > seg + 10 ? 'El daño de acierto rival se concentra en la primera mitad.' : seg > prim + 10 ? 'El daño de acierto rival se concentra en la segunda mitad.' : 'El daño se reparte entre las dos mitades.'}` : '';
    const t3pct = t3.i ? t3.c / t3.i : null, ligaT3pct = varaLiga3(X);
    const meta = esNum(t3pct) && esNum(ligaT3pct) && t3pct > ligaT3pct ? t3pct - MITAD * (t3pct - ligaT3pct) : null;
    const vale = esNum(meta) ? (t3pct - meta) * 3 * (t3.i / X.n) : null;
    const ppo = X.metricas['PP Opp%'];
    const sostener = [aroBien ? `Protección del aro: el rival convierte ${pc(aroPct)} cerca del aro contra ${pc(lAroPct)} de la liga, con ${aro.i} tiros.` : '',
      ppo && esNum(ppo.pct) && ppo.pct >= 70 ? `Y ${fmt('PP Opp%', ppo.valor)} de pérdidas forzadas (${ord(ppo)}).` : ''].filter(Boolean).join(' ');
    const alasPpt = alas.i ? alas.pts / alas.i : null;
    return card(`Fuga 1 · eFG permitido ${fmt('eFG Opp%', m.valor)}: dónde nos hacen daño`, `<div class="ci-grid2"><div>${mapa(zs, tirosCiclo(X, 'contra'), top.slice(0, 2).map(z => z.zona), { defensa: true, rotulo: 'Tiros del rival' })}${nota(`Cada número es convertidos/intentados del rival en esa zona (${X.n} partidos). Color: puntos por tiro contra la liga en la misma zona, ajustado por muestra.`)}</div>
      <div><div class="ci-tiles t2">${tile('Triples del rival', `${t3.c}/${t3.i}`, `${pc(t3pct)} · liga ${pc(ligaT3pct)}`, esNum(t3pct) && esNum(ligaT3pct) && t3pct > ligaT3pct ? 'neg' : 'pos')}
        ${tile('Triples de ala (Z11 + Z13)', `${alas.c}/${alas.i}`, `${sg(alas.mas)} pts sobre la liga en ${X.n} partidos (${sg(alas.mas / X.n)} por partido)`, alas.mas > 0 ? 'neg' : 'pos')}
        ${tile('Aro del rival', `${aro.c}/${aro.i}`, aro.i ? `${pc(aroPct)}${esNum(lAroPct) ? ` · liga ${pc(lAroPct)}` : ''}${aroBien ? ': no es la fuga' : ''}` : '', aroBien ? 'info' : 'neg')}${tile('Esquinas', `${esq.c}/${esq.i}`, esq.i < 10 ? `muestra chica (${esq.i} tiros)` : pc(esq.c / esq.i), 'info')}</div>
        ${top.length ? tabla(['Zona (del atacante)', 'Tiros', 'Conv.', 'Pts/tiro', 'Liga', 'Pts sobre liga', 'Por partido'], filasZ) : ''}
        <h4>¿Cuándo? Puntos reales contra esperados por la zona del tiro (rival)</h4>${tabla(['Cuarto', 'Tiros', 'Puntos', 'Esperados', 'Dif.'], cq)}${cuando ? `<p class="ci-sm">${cuando}</p>` : ''}</div></div>
      <div class="ci-rutas">${sostener ? ruta('pos', 'Sostener', sostener) : ''}
        ${ruta('neg', 'Corregir', alas.i >= 20 && alas.mas > 0 ? `Cierres de ala: ${alas.i} de los ${t3.i} triples rivales salen de las dos alas y rinden ${n(alasPpt, 2)} por tiro. Candidato a revisar en video: rotación de ayudas hacia el ala y salida a tirador.` : (top.length ? `${esc(top.map(z => z.zona + ' ' + NOMBRE_ZONA[z.zona]).join(', '))}: el rival rinde ${sg(sum(top, z => z.puntosDeMas) / X.n)} pts por partido sobre la liga. Candidato a revisar en video: rotación de ayudas y salida a tirador.` : 'Sin zonas que se separen.'), esNum(meta) ? `Meta real: rival de ${pc(t3pct)} a ${pc(meta)} de triple (mitad del camino hasta la liga, ${pc(ligaT3pct)}). Vale ${sg(vale)} pts por partido.` : '')}
        ${ruta('info', 'Lo que el play-by-play no registra', `La distancia del defensor al tirador. Por eso se dice dónde y cuándo; cuánto fue acierto y cuánto tiro cómodo no se puede separar con ${X.n} partidos.`)}</div>`);
  }
  /** El T3% de la liga: el de la tabla de equipos al cierre (el mismo de la Combustión);
      sin libro, el de las zonas de triple del paquete. */
  function varaLiga3(X) {
    const t = X.metricas && X.metricas['T3%'];
    if (t && esNum(t.med)) return t.med;
    const lz = ((X.paq.liga && X.paq.liga.zonas) || []).filter(z => /^Z1[0-4]$/.test(z.zona));
    const i = sum(lz, z => z.i || 0), c = sum(lz, z => z.c || 0);
    return i ? c / i : null;
  }

  /* § Fuga 2 · la transición defensiva (0-7 s del rival): de dónde nace cada posesión rival. */
  function cardFuga2(X) {
    const T = X.c.transicion, L = X.paq.liga && X.paq.liga.ciclos;
    if (!T || !T.porOrigen) return '';
    const orig = Object.keys(ORIGEN).map((o) => {
      const x = T.porOrigen[o] || {}, l = L && L.trans && L.trans[o];
      const lppt = l && l[0] ? l[2] / l[0] : null;
      return { o, tiros: x.tiros || 0, pts: x.pts || 0, ppt: x.tiros ? x.pts / x.tiros : null, lppt, mas: esNum(lppt) ? (x.pts || 0) - (x.tiros || 0) * lppt : null };
    });
    const tiros = sum(orig, o => o.tiros), pts = sum(orig, o => o.pts), masT = sum(orig, o => o.mas || 0);
    /* `trans[o]` = [tiros, convertidos, puntos, pérdidas]: la vara de la liga en 0-7 s junta todos los orígenes. */
    const ligaTot = L && L.trans ? Object.values(L.trans).reduce((a, v) => [a[0] + (v[0] || 0), a[1] + (v[2] || 0)], [0, 0]) : null;
    const lppt = ligaTot && ligaTot[0] ? ligaTot[1] / ligaTot[0] : null;
    const rd = orig.find(o => o.o === 'RD'), robo = orig.find(o => o.o === 'ROBO');
    const parte = (o) => masT > 0 && o && o.mas > 0 ? Math.round(100 * o.mas / masT) : 0;
    const filas = orig.filter(o => o.tiros).map(o => [esc(ORIGEN[o.o]) + (o.tiros < 5 ? ' <span class="ci-mut">~ muestra chica</span>' : ''), o.tiros, o.pts, n(o.ppt, 2), n(o.lppt, 2), `<b class="${(o.mas || 0) > 0 ? 'neg' : 'pos'}">${sg(o.mas)}</b>`]);
    const ca = X.c.causas || {};
    const fp = ca.falladosPrevios || { dobles: {}, triples: {} };
    const perd = (ca.jugadores || []).slice(0, 8);
    const ppt0 = tiros ? pts / tiros : null;
    const meta = esNum(ppt0) && esNum(lppt) && ppt0 > lppt ? ppt0 - MITAD * (ppt0 - lppt) : null;
    const nRD = ca.nRD || ((fp.dobles.n || 0) + (fp.triples.n || 0)), nRobo = ca.nROBO || sum(perd, j => j.perdidas);
    const dob = fp.dobles.n || 0, tri = fp.triples.n || 0;
    const seg = X.reloj.favor.ro, ro = X.metricas['RO%'];
    const rivTrasErr = rd && rd.tiros ? rd.pts / X.n : null;
    const sostener = seg && seg[0] && ro && esNum(ro.pct) && ro.pct >= 70 ? `El rebote ofensivo (${fmt('RO%', ro.valor)}, ${ord(ro)}) rinde ${n(seg[2] / X.n, 1)} pts por partido en segundas oportunidades.${esNum(rivTrasErr) && rd && esNum(rd.mas) ? ` El rival anota ${n(rivTrasErr, 1)} pts por partido en transición tras nuestros errados, y solo ${sg(rd.mas / X.n)} por encima de la liga: el rebote ofensivo se paga, ${seg[2] / X.n > rivTrasErr ? 'pero deja ganancia' : 'y no deja ganancia'}.` : ''}` : '';
    const noUno = perd.length >= 5 ? `Repartidas en ${perd.length} jugadores: no es un problema de uno.` : perd.length ? `Concentradas en ${perd.length === 1 ? 'un jugador' : perd.length + ' jugadores'}.` : '';
    return card(`Fuga 2 · Transición defensiva: ¿de dónde viene el ${n(ppt0, 2)} por tiro en 0-7 s?`, `<div class="ci-tiles t4">${tile('Rival en 0-7 s', `${tiros} tiros`, `${pts} pts · ${n(ppt0, 2)} por tiro · liga ${n(lppt, 2)}`, esNum(lppt) && ppt0 > lppt ? 'neg' : 'pos')}
      ${tile('Sobre la liga', sg(masT / X.n) + ' pts/partido', `${sg(masT)} pts en ${X.n} partidos`, masT > 0 ? 'neg' : 'pos')}
      ${tile('Nace de un tiro nuestro errado', parte(rd) + ' %', `de la ventaja sobre la liga${rd && esNum(rd.mas) ? `: ${sg(rd.mas)} de ${sg(masT)} pts` : ''}`, parte(rd) >= 50 ? 'neg' : 'info')}${tile('Nace de una pérdida nuestra', parte(robo) + ' %', robo && esNum(robo.mas) ? `${sg(robo.mas)} pts sobre la liga${Math.abs(robo.mas) < 1 ? ': a ritmo de liga' : ''}` : '', parte(robo) >= 50 ? 'neg' : 'info')}</div>
      ${tabla(['Cómo nace la posesión del rival', 'Tiros', 'Puntos', 'Pts/tiro', 'Liga (mismo origen)', 'Pts sobre liga'], filas)}
      <div class="ci-grid2"><div><h4>Tras el tiro errado: ${nRD} de ${rd ? rd.tiros : nRD} identificados</h4><div class="ci-tiles t2">${tile('Tras doble errado', dob + ' tiros', (fp.dobles.pts || 0) + ' pts del rival', dob > tri ? 'neg' : 'warn')}${tile('Tras triple errado', tri + ' tiros', (fp.triples.pts || 0) + ' pts del rival', tri > dob ? 'neg' : 'warn')}</div>
        ${dob + tri ? `<p class="ci-sm">Los errados que más terminan en transición rival son ${dob >= tri ? 'dobles' : 'triples'} (${Math.max(dob, tri)} de ${dob + tri}). Es lectura del orden de las jugadas, no de quién debía retroceder.</p>` : ''}</div>
      <div><h4>Tras pérdida: ${nRobo} robos con tiro en 0-7 s</h4>${perd.length ? `<div class="ci-mini">${perd.map(j => `<div><span>${foto(corto(j.nombre), X, j.nombre)}${esc(corto(j.nombre))}</span><i style="--w:${Math.round(100 * j.perdidas / Math.max(...perd.map(x => x.perdidas)))}%"></i><b>${j.perdidas} · ${j.puntosRival} pts</b></div>`).join('')}</div><p class="ci-sm">Pérdidas que terminaron en tiro rival dentro de los 7 s. ${noUno}</p>` : vacio('Sin pérdidas que terminaran en tiro rival.')}</div></div>
      <div class="ci-rutas">${sostener ? ruta('pos', 'Sostener', sostener) : ''}
      ${ruta('warn', 'Ajustar', `Lectura para el cuerpo técnico: ${ro && esNum(ro.valor) ? `con ${fmt('RO%', ro.valor)} de rebote ofensivo` : 'con el rebote ofensivo'} hay jugadores yendo al cristal; la pregunta es quién queda de balance cuando el tiro sale${dob + tri ? ` (sobre todo en ${dob >= tri ? 'dobles' : 'triples'}, que son ${Math.max(dob, tri)} de los ${dob + tri})` : ''}. A verificar en video antes de cambiar nada.`)}
      ${ruta('neg', 'Corregir', `Cerrar el 0-7 s al nivel de la liga (${n(lppt, 2)}) sin resignar rebote ofensivo.`, esNum(meta) ? `Meta real: de ${n(ppt0, 2)} a ${n(meta, 2)} por tiro (mitad del camino hasta la liga). Vale ${sg((ppt0 - meta) * tiros / X.n)} pts por partido.` : '')}</div>`);
  }

  /* § Fuga 3 · la zona propia más fría: quién tira ahí, el dibujo y a quién redistribuir. */
  function cardFuga3(X) {
    const zs = (X.c.zonas.favor || []).filter(z => z.i >= 10 && esNum(z.puntosDeMas));
    if (!zs.length) return '';
    const z = zs.slice().sort((a, b) => a.puntosDeMas - b.puntosDeMas)[0];
    if (z.puntosDeMas >= 0) return '';
    const espejo = { Z11: 'Z13', Z13: 'Z11', Z10: 'Z14', Z14: 'Z10', Z6: 'Z8', Z8: 'Z6', Z2: 'Z4', Z4: 'Z2', Z5: 'Z9', Z9: 'Z5' }[z.zona];
    const ze = espejo ? (X.c.zonas.favor || []).find(x => x.zona === espejo) : null;
    const quien = quienTira(X, z.zona, espejo);
    const meta = z.ppt + MITAD * (z.ligaPpt - z.ppt);
    const t3tot = zonasSum(X.c.zonas.favor, ['Z10', 'Z11', 'Z12', 'Z13', 'Z14']).i;
    const esTriple = /^Z1[0-4]$/.test(z.zona);
    const filas = quien.lista.map(j => [`${foto(j.nombre, X, j.completo)}${esc(j.nombre)}`, `${j.c}/${j.i}`, j.i && quien.total ? Math.round(100 * j.i / quien.total) + ' %' : '—', j.i ? pc(j.c / j.i, 0) : '—', esTriple ? `${j.t3c}/${j.t3i}` : '', espejo ? (j.e ? `${j.e.c}/${j.e.i}` : '0/0') : '']);
    /* Las rutas, con los números: cuánto absorbe la zona, quién la toma y adónde puede ir ese volumen. */
    const top2 = quien.lista.slice(0, 2);
    const aro = (X.c.zonas.favor || []).find(x => x.zona === 'Z1');
    const otros = quien.lista.filter(j => top2.indexOf(j) < 0 && j.t3i >= 8).sort((a, b) => b.t3i - a.t3i).slice(0, 4);
    const rango = otros.length ? [Math.min(...otros.map(j => j.t3c / j.t3i)), Math.max(...otros.map(j => j.t3c / j.t3i))] : null;
    const reemplazo = quien.lista.filter(j => top2.indexOf(j) < 0 && j.t3i >= 10 && j.t3c / j.t3i >= 0.33)[0];
    const dibujo = `La zona absorbe ${n(z.i / X.n, 1)} tiros por partido${esTriple && t3tot ? ` y es el ${Math.round(100 * z.i / t3tot)} % de los triples` : ''}.${ze && ze.i >= 15 && esNum(ze.ppt) && esNum(ze.ligaPpt) && Math.abs(ze.ppt - ze.ligaPpt) <= 0.06 ? ` La ala contraria (${espejo}) rinde como la liga con ${ze.i} tiros.` : ''} A revisar: cómo se genera el tiro en ${z.zona} y si el dibujo lo busca o lo deja como salida.`;
    const toma = top2.length ? `${esc(top2.map(j => j.nombre).join(' y '))} suman ${sum(top2, j => j.i)} de ${quien.total} y convierten ${sum(top2, j => j.c)}.${quien.alt ? ` ${esc(quien.alt.nombre)} rinde más desde la otra ala: ${espejo} ${quien.alt.e.c}/${quien.alt.e.i} (${n(3 * quien.alt.e.c / quien.alt.e.i, 2)} por tiro) contra ${quien.alt.c}/${quien.alt.i} en ${z.zona}. Muestra chica, pero es la única asimetría con volumen.` : ''}` : 'Sin el reparto por jugador.';
    const redis = reemplazo ? `${esc(reemplazo.nombre)} convierte ${reemplazo.t3c}/${reemplazo.t3i} de tres: es el candidato con muestra para recibir parte de ese volumen.`
      : `Ningún jugador con poco volumen en la zona muestra efectividad probada${rango ? `: los triples del resto del plantel van de ${pc(rango[0], 0)} a ${pc(rango[1], 0)} (${otros.map(j => `${esc(j.nombre)} ${j.t3c}/${j.t3i}`).join(', ')})` : ''}. No hay un tirador de reemplazo con muestra; el destino con mejor retorno comprobado es el aro${aro && aro.i ? ` (Z1: ${n(aro.ppt, 2)} por tiro)` : ''}.`;
    return card(`Fuga 3 · Zona ${z.zona} (${esTriple ? 'triple, ' : ''}${NOMBRE_ZONA[z.zona].replace('triple ', '')}): ${z.c}/${z.i}`, `<div class="ci-grid2"><div>${mapa(X.c.zonas.favor, tirosCiclo(X, 'favor'), [z.zona].concat(espejo ? [espejo] : []), { rotulo: 'Tiros propios' })}${espejo ? nota(`Resaltadas las dos alas (${z.zona} y ${espejo}).`) : ''}</div>
      <div><div class="ci-tiles t2">${tile(`${z.zona} propia`, `${z.c}/${z.i}`, `${pc(z.pct / 100)} · ${n(z.ppt, 2)} por tiro · liga ${n(z.ligaPpt, 2)}`, 'neg')}${tile(`Costo en ${X.n} partidos`, sg(z.puntosDeMas) + ' pts', sg(z.puntosDeMas / X.n) + ' por partido', 'neg')}
        ${esTriple && t3tot ? tile('Peso en sus triples', Math.round(100 * z.i / t3tot) + ' %', `${z.i} de ${t3tot} triples salen de esta zona`, 'warn') : ''}${ze ? tile(`${espejo} (${esTriple ? 'ala contraria' : 'lado contrario'})`, `${ze.c}/${ze.i}`, `${n(ze.ppt, 2)} por tiro · liga ${n(ze.ligaPpt, 2)}`, 'info') : ''}</div>
        ${filas.length ? tabla(['Quién tira en ' + z.zona, z.zona, '% de la zona', 'Acierto', esTriple ? 'Triples totales' : '', espejo || ''], filas) + nota(quien.fuente) : ''}</div></div>
      <div class="ci-rutas">${ruta('warn', '1 · Dibujo táctico', dibujo)}
      ${ruta('warn', '2 · Quién lo toma', toma)}
      ${ruta('neg', '3 · Redistribuir volumen', redis, `Meta real: ${z.zona} de ${n(z.ppt, 2)} a ${n(meta, 2)} por tiro (mitad del camino hasta la liga). Vale ${sg((meta - z.ppt) * z.i / X.n)} pts por partido.`)}</div>`);
  }
  /** Quién tira en una zona. El tiro del partido no trae al tirador: sale del
      detalle de TEMPORADA del paquete (`tiros.detalle.jugadores`), y se dice
      con cuántos partidos (en el Ciclo 0 la temporada y el ciclo coinciden
      mientras no se juegue el partido siguiente). */
  function quienTira(X, zona, espejo) {
    const d = X.paq.tiros && X.paq.tiros.detalle;
    const nombres = nombresPaq(X.paq);
    const lista = ((d && d.jugadores) || []).map((j) => {
      const z = (j.zonas || []).find(x => x.zona === zona), e = espejo ? (j.zonas || []).find(x => x.zona === espejo) : null;
      const t3 = (j.zonas || []).filter(x => /^Z1[0-4]$/.test(x.zona));
      return z ? { nombre: corto(nombres[j.id] || j.id), completo: nombres[j.id], i: z.i, c: z.c, e: e ? { i: e.i, c: e.c } : null, t3i: sum(t3, x => x.i || 0), t3c: sum(t3, x => x.c || 0) } : null;
    }).filter(Boolean).sort((a, b) => b.i - a.i);
    const total = sum(lista, j => j.i);
    const alt = lista.filter(j => j.e && j.e.i >= 5 && j.e.c / j.e.i > (j.i ? j.c / j.i : 0) + 0.15)[0];
    return { lista: lista.slice(0, 8), total, alt, mejor: alt ? `${alt.nombre} rinde más desde ${espejo} (${alt.e.c}/${alt.e.i}) que en ${zona} (${alt.c}/${alt.i})` : null,
      fuente: fuenteTemporada(X) };
  }
  /** Qué partidos cubre el reparto por jugador (el detalle de temporada del paquete). */
  function fuenteTemporada(X) {
    const pj = (X.paq.partidos && X.paq.partidos.validados) || null;
    return pj && pj > X.n ? `Reparto por jugador de la temporada (${pj} partidos, ${pj - X.n} después del ciclo): el tiro de cada partido no trae al tirador.` : `Reparto por jugador de los ${pj || X.n} partidos.`;
  }

  /* ============================================================ EQUIPOS */

  /* § General · lo que el panel marca: fortalezas (≥ 70), ajustes (40-69) y quiebres (< 40). */
  /** Qué dice cada métrica en el idioma del cuerpo técnico, según caiga como fortaleza
      (`b`, percentil ≥ 70), ajuste (`a`, 40-69) o punto de quiebre (`q`, < 40). */
  const FRASE = {
    'RO%': { b: 'Gana el cristal ofensivo: segundas oportunidades que valen posesiones extra.', a: 'Rebote ofensivo en la media de la liga.', q: 'Casi no gana segundas oportunidades.' },
    'PP Opp%': { b: 'Fuerza pérdidas por encima de la liga.', a: 'Fuerza pérdidas como la liga.', q: 'Defensa de posición: fuerza pocas pérdidas.' },
    'RD%': { b: 'Cierra el rebote defensivo: el rival no tiene segundas oportunidades.', a: 'Rebote defensivo en la media.', q: 'Le cuesta cerrar el rebote defensivo.' },
    'RO Opp%': { b: 'El rival casi no rebotea en ataque.', a: 'El rival rebotea en ataque como en la liga.', q: 'El rival rebotea en ataque más que en la liga.' },
    'RTL Opp%': { b: 'Defiende sin falta: el rival casi no llega a la línea.', a: 'Disciplina defensiva: defender con los pies y no con las manos para conceder menos libres.', q: 'Concede mucha línea: defender con los pies y no con las manos.' },
    'eFG Opp%': { b: 'Incomoda el tiro rival.', a: 'El tiro rival en la media de la liga.', q: 'El rival tira cómodo: la defensa llega tarde al tiro.' },
    'RTNG OFF': { b: 'El ataque supera la media de la liga por posesión.', a: 'El ataque cerca de la media por posesión.', q: 'El ataque no llega a la media de la liga por posesión.' },
    'RTNG DEF': { b: 'La defensa concede menos que la liga por posesión.', a: 'La defensa cerca de la media por posesión.', q: 'La defensa concede más que la liga por posesión.' },
    'eFG%': { b: 'Tira bien para la liga.', a: 'Tira como la liga.', q: 'Tira mal para la liga: revisar desde dónde se toman los tiros.' },
    'AST-PP': { b: 'Asiste mucho más de lo que pierde.', a: 'Asiste algo más de lo que pierde.', q: 'Pierde casi tanto como asiste.' },
    'PePP%': { b: 'Cuida la pelota.', a: 'Pierde como la liga.', q: 'Pierde más que la liga.' },
    'RTL%': { b: 'Llega a la línea más que la liga.', a: 'Llega a la línea como la liga.', q: 'Juega afuera: llega poco a la línea.' },
    'TS%': { b: 'Eficiencia de tiro sobre la liga.', a: 'Eficiencia de tiro en la media.', q: 'Eficiencia de tiro bajo la liga.' },
  };
  const frase = (m) => { const f = FRASE[m.k]; return f ? (m.pct >= 70 ? f.b : m.pct >= 40 ? f.a : f.q) : ''; };
  const EVALUABLES = ['RO%', 'PP Opp%', 'RD%', 'RO Opp%', 'RTL Opp%', 'eFG Opp%', 'RTNG OFF', 'RTNG DEF', 'eFG%', 'AST-PP', 'PePP%', 'RTL%', 'TS%'];
  /* Hasta 4 por grupo, de la más extrema a la menos: el panel nombra lo que más pesa. */
  function grupos(X) {
    const ms = EVALUABLES.map(k => X.metricas[k] || Object.assign({ k, label: METRICAS[k] || k }, ubicar(X.idx, k, val(X.A, k)))).filter(m => esNum(m.pct));
    return { fo: ms.filter(m => m.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 4), aj: ms.filter(m => m.pct >= 40 && m.pct < 70).sort((a, b) => a.pct - b.pct).slice(0, 4), qu: ms.filter(m => m.pct < 40).sort((a, b) => a.pct - b.pct).slice(0, 4) };
  }
  /** Las transiciones propias del ciclo por origen (los partidos crudos del paquete). */
  function transPropia(X) {
    const ids = new Set(X.c.resultados.partidos.map(p => String(p.id)));
    const out = {};
    (CIC().partidosDe(X.paq) || []).filter(p => ids.has(String(p.id))).forEach(p => { const t = (p.trans && p.trans.propio) || {};
      Object.keys(t).forEach(o => { out[o] = out[o] || [0, 0, 0, 0]; t[o].forEach((v, i) => { out[o][i] += v || 0; }); }); });
    return out;
  }
  /** Optimizar una fortaleza: qué hacer con lo que ya funciona, con el número que lo sostiene. */
  function optimizar(X, m) {
    const T = X.c.transicion && X.c.transicion.porOrigen, L = X.paq.liga && X.paq.liga.ciclos && X.paq.liga.ciclos.trans;
    const tr = transicion(X);
    if (m.k === 'RO%' && T && T.RD && tr) return `Que el rebote ofensivo no se pague en transición: ${T.RD.tiros} de los ${tr.tiros} tiros rivales en 0-7 s nacen de un tiro nuestro errado.`;
    if (m.k === 'PP Opp%') { const p = transPropia(X).ROBO, l = L && L.ROBO; if (p && p[0]) return `Aprovechar mejor lo que se roba: en 0-7 s sus robos rinden ${n(p[2] / p[0], 2)} por tiro${l && l[0] ? ` (liga ${n(l[2] / l[0], 2)})` : ''}.`; }
    if (m.k === 'RD%') { const r = X.metricas['RTL Opp%']; return `Mantener el cierre del cristal sin sumar faltas: los libres concedidos están ${r && esNum(r.pct) ? (r.pct >= 60 ? 'bajo la liga' : r.pct >= 40 ? 'en la mediana' : 'sobre la liga') : 'sin vara'}.`; }
    if (m.k === 'RO Opp%') return 'Mantener el box-out: el rival casi no tiene segundas oportunidades.';
    if (m.k === 'RTL Opp%') return 'Sostener la defensa con los pies: cada falta evitada es una posesión que no se regala.';
    if (m.k === 'eFG Opp%') return 'Sostener los cierres: el rival ya tira incómodo.';
    return 'Sostener el nivel sin cambiar la forma de jugar.';
  }
  function cardGeneral(X) {
    const G = grupos(X);
    const li = (m, t) => `<li><span class="ci-chip ${t}">${glifo(t)} ${esc(m.label)}</span> ${fmt(m.k, m.valor)} · percentil ${m.pct} · liga ${fmt(m.k, m.med)}. <span class="ci-mut">${esc(frase(m))}</span></li>`;
    return card('General · lo que el panel marca', `<div class="ci-grid3"><div><h4 class="pos">Fortalezas</h4><ul class="ci-lista">${G.fo.map(m => li(m, 'pos')).join('') || '<li class="ci-mut">Ninguna.</li>'}</ul></div>
      <div><h4 class="warn">Ajustes</h4><ul class="ci-lista">${G.aj.map(m => li(m, 'warn')).join('') || '<li class="ci-mut">Ninguno.</li>'}</ul></div>
      <div><h4 class="neg">Puntos de quiebre</h4><ul class="ci-lista">${G.qu.map(m => li(m, 'neg')).join('') || '<li class="ci-mut">Ninguno.</li>'}</ul></div></div>
      ${nota(`Con ${X.n} partidos la muestra es corta: los percentiles describen este corte, no el equipo definitivo.`)}`);
  }
  /** El valor de la liga en el percentil p, con la dirección de la métrica. */
  function enPercentil(idx, k, p) {
    const V = vara(idx, k); if (!V) return null;
    const v = V.dist.slice().sort((a, b) => a - b), q = (V.inv ? 100 - p : p) / 100, pos = q * (v.length - 1), i = Math.floor(pos);
    return i + 1 < v.length ? v[i] + (pos - i) * (v[i + 1] - v[i]) : v[i];
  }
  /* § Hoja de ruta · fortaleza → sostener; ajuste → fortaleza; quiebre → ajuste (crecimiento real). */
  function cardHojaRuta(X) {
    const G = grupos(X), P = (X.A && X.A.P) || {};
    const fila = (m, pctObj, etiqueta) => {
      const obj = enPercentil(X.idx, m.k, pctObj); if (!esNum(obj)) return null;
      const meta = m.valor + MITAD * (obj - m.valor);
      const g = ganancia(m.k, m.valor, meta, P);
      return [esc(m.label), `${fmt(m.k, m.valor)} p${m.pct}`, `${fmt(m.k, obj)} (p${pctObj}: ${etiqueta})`, fmt(m.k, meta), esNum(g) && g > 0.05 ? sg(g) : 'sin palanca directa'];
    };
    const fo = G.fo.map(m => ruta('pos', `${esc(m.label)} · ${fmt(m.k, m.valor)} p${m.pct}`, `Piso: no bajar de ${fmt(m.k, enPercentil(X.idx, m.k, 70))} (el corte de p70). <b>Optimizar:</b> ${optimizar(X, m)}`)).join('');
    const aj = G.aj.map(m => fila(m, 70, 'fortaleza')).filter(Boolean), qu = G.qu.map(m => fila(m, 40, 'ajuste')).filter(Boolean);
    const cab = ['Métrica', 'Hoy', 'Escalón siguiente', 'Meta real del ciclo', 'Pts por partido'];
    return card('Hoja de ruta · del panel a la próxima meta', `${fo ? `<div class="ci-rutas">${fo}</div>` : ''}
      ${aj.length ? `<h4 class="warn">Ajustes → fortaleza · crecimiento real</h4>${tabla(cab, aj)}` : ''}${qu.length ? `<h4 class="neg">Puntos de quiebre → ajuste · crecimiento real</h4>${tabla(cab, qu)}` : ''}
      ${nota('Meta real: la mitad del camino entre hoy y el escalón siguiente (p70 si hoy es ajuste, p40 si es quiebre). Los puntos usan los volúmenes reales del ciclo. Las metas se solapan: no se suman.')}`);
  }

  /* § Personalidad e identidad: filosofía detectada + cómo es en cada costado de la cancha. */
  /** El paquete recortado al CICLO para lo que lee la filosofía y los arquetipos del reloj:
      el reloj y las zonas de los partidos del ciclo, con la vara de la liga del paquete.
      Lo que no viaja por partido (rendimiento, faltas) queda de la temporada. */
  function paqDelCiclo(X) {
    if (!X.reloj.con) return X.paq;
    const R = X.reloj;
    return Object.assign({}, X.paq, { reloj: { favor: { f: R.favor.f, ro: R.favor.ro, fa: R.favor.fa }, contra: { f: R.contra.f, ro: R.contra.ro, fa: R.contra.fa } },
      tiros: Object.assign({}, X.paq.tiros, { zonas: (X.c.zonas.favor || []).map(z => ({ zona: z.zona, i: z.i, c: z.c, ppt: z.ppt })) }) });
  }
  const ETQ_FILO = { transicion: 'Transición', perimetro: 'Perímetro', fisico: 'Físico', set: 'Set / Control' };
  /* § Personalidad e identidad: la filosofía (box score del ciclo + play-by-play del ciclo),
     los 8 ejes de identidad, cada costado con su síntesis y los arquetipos de ritmo. */
  function cardPersonalidad(X) {
    const C = (typeof SGADD_CONCLUSIONES !== 'undefined') ? SGADD_CONCLUSIONES : null;
    const pq = X.paqC || X.paq;
    let filo = null;
    try { filo = C && C.DetectarFilosofiaDT ? C.DetectarFilosofiaDT(X.idx, X.e, pq) : null; } catch (err) { filo = null; }
    const lado = (ks) => { const ms = ks.map(k => X.metricas[k] || Object.assign({ k, label: METRICAS[k] || k }, ubicar(X.idx, k, val(X.A, k)))).filter(m => esNum(m.valor)); const p = ms.filter(m => esNum(m.pct)); return { ms, pct: p.length ? Math.round(sum(p, m => m.pct) / p.length) : null }; };
    const ppc = val(X.A, 'PTSopp') && val(X.A, 'PLAYSopp') ? Object.assign({ k: 'PPP DEF', label: 'PPP concedido' }, ubicar(X.idx, 'PPP DEF', val(X.A, 'PTSopp') / val(X.A, 'PLAYSopp'))) : null;
    const of = lado(['RTNG OFF', 'eFG%', 'TS%', 'PPP', 'T3%', 'PePP%', 'RO%', 'RTL%']);
    const de = lado(['RTNG DEF', 'eFG Opp%']); if (ppc && esNum(ppc.valor)) { de.ms.push(ppc); }
    lado(['PP Opp%', 'RD%', 'RO Opp%', 'RTL Opp%', 'PR']).ms.forEach(m => de.ms.push(m));
    const pd = de.ms.filter(m => esNum(m.pct)); de.pct = pd.length ? Math.round(sum(pd, m => m.pct) / pd.length) : null;
    const arq = arquetipos(X);
    const M = X.metricas;
    /* Síntesis de cada costado: lo que hace y lo que le cuesta, en una frase. */
    const corre = (esNum(M.PACE.pct) && M.PACE.pct >= 70) || (esNum(M.PLAYS.pct) && M.PLAYS.pct >= 70);
    const rinde = esNum(M.PPP.pct) ? M.PPP.pct : null;
    const sintOf = corre && esNum(rinde) && rinde < 40 ? 'Corre y genera volumen, pero cada jugada rinde poco.' : corre && esNum(rinde) && rinde >= 60 ? 'Corre y cada jugada paga: el volumen ya se convierte en puntos.'
      : esNum(rinde) && rinde < 40 ? 'Ataca a ritmo de liga y rinde por debajo: el ajuste es de ejecución.' : esNum(rinde) && rinde >= 60 ? 'Rinde por encima de la liga en cada jugada.' : 'Ataca en rango de liga.';
    const bienD = [], malD = [];
    if ((M['RD%'] && M['RD%'].pct >= 70) || (M['RO Opp%'] && M['RO Opp%'].pct >= 70)) bienD.push('gana el cristal');
    if (M['PP Opp%'] && M['PP Opp%'].pct >= 70) bienD.push('roba');
    const t3c = zonasSum(X.c.zonas.contra || [], ['Z11', 'Z13']), tr = transicion(X);
    if (M['eFG Opp%'] && M['eFG Opp%'].pct < 40) malD.push(t3c.mas > 0 ? 'concede tiros de ala' : 'concede tiro cómodo');
    if (tr && esNum(tr.ppt) && esNum(tr.lppt) && tr.ppt > tr.lppt + 0.05) malD.push('transición');
    const sintDe = bienD.length && malD.length ? `${cap(bienD.join(' y '))}, pero ${malD.join(' y ')}.` : bienD.length ? `${cap(bienD.join(' y '))}.` : malD.length ? `${cap(malD.join(' y '))}.` : 'Defiende en rango de liga.';
    const pr = (m) => `<div class="ci-pr"><span>${esc(m.label)}</span><b>${fmt(m.k, m.valor)}</b><i class="ci-bar ${tono(m.pct)}" style="--w:${esNum(m.pct) ? m.pct : 0}%"></i><em>p${esNum(m.pct) ? m.pct : '—'} · liga ${fmt(m.k, m.med)}</em></div>`;
    const ladoH = (t, cls, L, a, sint) => `<div class="ci-lado ${cls}"><div class="ci-lh"><span class="ci-lt">${t}</span><span class="ci-chip ${tono(L.pct)}">percentil medio ${esNum(L.pct) ? L.pct : '—'}</span></div>${L.ms.map(pr).join('')}
      <p class="ci-sint">${a && a.length ? `<b>${esc(a.map(x => x.label).join(' · '))}.</b> ` : ''}${esc(sint)}</p></div>`;
    const filoH = filo && filo.label ? `<div class="ci-ident"><div><div class="ci-tl">Filosofía detectada (${filo.fuente === 'box' ? 'box score' : filo.fuente === 'pbp' ? 'play-by-play' : 'box score + play-by-play'})</div><div class="ci-big">${esc(filo.label)}</div>
        <p>${esc(filo.frase || '')}${filo.sostener ? `. ${esc(filo.sostener)}.` : ''}</p>${filo.costo ? `<p class="ci-mut">${esc(filo.costo)}.</p>` : ''}</div>
      ${filo.puntajes ? `<div class="ci-punt">${Object.keys(filo.puntajes).filter(k => esNum(filo.puntajes[k])).sort((a, b) => filo.puntajes[b] - filo.puntajes[a]).map(k => `<div class="ci-pb"><span>${esc(ETQ_FILO[k] || k)}</span><i style="--w:${Math.round(filo.puntajes[k])}%"></i><b>${Math.round(filo.puntajes[k])}</b></div>`).join('')}</div>` : ''}</div>` : '';
    /* Los 8 ejes de identidad del panel (SGADD_PERSONALIDAD.EJES), con el valor del ciclo. */
    const P8 = (typeof SGADD_PERSONALIDAD !== 'undefined' && SGADD_PERSONALIDAD.EJES) ? SGADD_PERSONALIDAD.EJES : [];
    const claros = [];
    const ejes = P8.map((ej) => {
      const m = X.metricas[ej.metrica] || Object.assign({ k: ej.metrica }, ubicar(X.idx, ej.metrica, val(X.A, ej.metrica)));
      if (!m || !esNum(m.valor)) return '';
      const p = m.pct, der = esNum(p) && p >= 60, izq = esNum(p) && p <= 40;
      if (ej.familia === 'ataque' && (der || izq)) claros.push(der ? ej.fDer : ej.fIzq);
      return tile(ej.titulo, esc(der ? ej.der : izq ? ej.izq : ej.neutro), `${esc(ej.metrica)} ${fmt(ej.metrica, m.valor)} · liga ${fmt(ej.metrica, m.med)} · p${esNum(p) ? p : '—'}`, 'info');
    }).join('');
    const cierre = claros.length ? `La identidad es clara (${claros.slice(0, -1).join(', ')}${claros.length > 1 ? ' y ' : ''}${claros[claros.length - 1]}) y los ajustes son de ejecución dentro de ese libreto.` : 'No hay rasgos que lo separen claramente de la liga.';
    return card('Personalidad e identidad', `${filoH}<div class="ci-duo">${ladoH('OFENSIVA', 'atk', of, arq && arq.ofensivos, sintOf)}${ladoH('DEFENSA', 'def', de, arq && arq.defensivos, sintDe)}</div>
      ${ejes ? `<div class="ci-tiles t4">${ejes}</div>` : ''}
      ${nota(`Ninguna identidad es mejor que otra: sirve para decidir qué ajustar sin cambiar la forma de jugar. ${cierre}`)}`);
  }
  /** Los arquetipos de ritmo (SGADD_PBP.relojArquetipos) con el reloj del ciclo. */
  function arquetipos(X) {
    if (X._arq !== undefined) return X._arq;
    let a = null;
    try { a = (typeof SGADD_PBP !== 'undefined' && SGADD_PBP.relojArquetipos) ? SGADD_PBP.relojArquetipos(X.paqC || X.paq) : null; } catch (e) { a = null; }
    X._arq = a;
    return a;
  }

  /* § Reloj de posesión · perfil de ritmo y ejecución (las 3 franjas, propio y rival). */
  function cardReloj(X) {
    const R = X.reloj, L = X.paq.liga && X.paq.liga.reloj;
    if (!R.con) return card('Reloj de posesión · perfil de ritmo y ejecución', vacio('Los partidos del ciclo no traen el reloj de posesión: llega con la próxima subida del paquete.'));
    const tot = sum(R.favor.f, x => x[0]) || 1, ltot = L && L.f ? sum(L.f, x => x[0]) : null;
    const filas = R.favor.f.map((x, i) => { const r = R.contra.f[i], l = L && L.f && L.f[i]; const lp = pptDe(l);
      return [FRANJAS[i], x[0], n(pptDe(x), 2), n(lp, 2), sg(esNum(pptDe(x)) && esNum(lp) ? pptDe(x) - lp : null, 2), r[0], n(pptDe(r), 2), sg(esNum(pptDe(r)) && esNum(lp) ? pptDe(r) - lp : null, 2)]; });
    [['2.ª oportunidad (tras RO)', 'ro'], ['Reinicio tras falta', 'fa']].forEach(([t, k]) => { const x = R.favor[k], r = R.contra[k], l = L && L[k]; filas.push([t, x[0], n(pptDe(x), 2), n(pptDe(l), 2), sg(esNum(pptDe(x)) && esNum(pptDe(l)) ? pptDe(x) - pptDe(l) : null, 2), r[0], n(pptDe(r), 2), sg(esNum(pptDe(r)) && esNum(pptDe(l)) ? pptDe(r) - pptDe(l) : null, 2)]); });
    const pts = R.favor.f.map((x, i) => { const lp = pptDe(L && L.f && L.f[i]); return esNum(lp) ? (x[2] - x[0] * lp) / X.n : null; });
    const ptsC = R.contra.f.map((x, i) => { const lp = pptDe(L && L.f && L.f[i]); return esNum(lp) ? -(x[2] - x[0] * lp) / X.n : null; });
    const stack = `<div class="ci-stack">${R.favor.f.map((x, i) => `<i class="s${i}" style="--w:${(100 * x[0] / tot).toFixed(1)}%"><b>${n(100 * x[0] / tot, 1)} %</b></i>`).join('')}</div>${ltot ? `<p class="ci-sm ci-mut">Liga: ${L.f.map(x => n(100 * x[0] / ltot, 1) + ' %').join(' · ')}</p>` : ''}`;
    /* La lectura de cada franja: el número, cuánto cuesta y qué significa para el cuerpo técnico. */
    const mayor = R.favor.f.map(x => x[0]).indexOf(Math.max(...R.favor.f.map(x => x[0])));
    const LEE = [
      (x, p, lp) => p < 0 ? `${X.metricas.PACE.puesto === 1 ? 'Corre más que nadie pero el contraataque no se convierte.' : 'El contraataque no se convierte.'}` : 'La transición paga: sostenerla.',
      (x, p, lp) => `${i2pc(x[0] / tot)} del total${mayor === 1 ? ': es donde más se juega, y mejorar acá mueve más que en las otras dos' : ''}.`,
      (x, p, lp) => p < 0 ? `${x[1]}/${x[0]}${x[0] ? ` (${pc(x[1] / x[0], 0)})` : ''}: la franja ${pptDe(x) <= Math.min(...R.favor.f.map(pptDe).filter(esNum)) ? 'más fría' : 'fría'}. Mirar quién resuelve con el reloj encima (abajo, los tres con más tiros).` : 'Resuelve bien con el reloj encima.',
    ];
    const i2pc = v => (esNum(v) ? Math.round(100 * v) + ' %' : '—');
    const rut = R.favor.f.map((x, i) => { const p = pts[i]; if (!esNum(p)) return ''; const lp = pptDe(L.f[i]);
      return ruta(p < -1.5 && i !== mayor ? 'neg' : p > 0.5 ? 'pos' : 'warn', `${['Ataque temprano (0-7 s)', 'Ataque armado (8-17 s)', 'Final del reloj (18-24 s)'][i]}`, `${x[0]} tiros a ${n(pptDe(x), 2)} contra ${n(lp, 2)} de la liga: ${sg(p)} pts por partido. ${LEE[i](x, p, lp)}`); }).join('');
    const arq = arquetipos(X);
    const arqH = (t, l) => l && l.length ? `<h4>${t}</h4><div class="ci-rutas">${l.map(a => ruta(a.ef > 0 ? 'pos' : 'neg', esc(a.label), esc(a.detalle || a.texto || ''))).join('')}</div>` : '';
    const armado = R.favor.f[1], lpA = pptDe(L.f[1]), pA = pptDe(armado);
    return card('Reloj de posesión · perfil de ritmo y ejecución', `<h4>Cómo reparte sus tiros (0-7 · 8-17 · 18-24 s)</h4>${stack}
      ${tabla(['Franja', 'Tiros propios', 'Pts/tiro', 'Liga', 'Dif.', 'Tiros rival', 'Pts/tiro rival', 'Dif.'], filas)}
      ${arqH('Arquetipos de ritmo · ataque', arq && arq.ofensivos)}${arqH('Arquetipos de ritmo · defensa', arq && arq.defensivos)}
      ${nota(`Pts/tiro cuenta jugadas que terminan en tiro de campo; no incluye la línea. Puntos por partido contra la liga: ataque temprano ${sg(pts[0])}, armado ${sg(pts[1])}, final del reloj ${sg(pts[2])}; defensa en 0-7 s ${sg(ptsC[0])} y en 8-17 s ${sg(ptsC[1])}.${arq && !arq.muestra ? ' Los arquetipos piden más muestra.' : ''}`)}
      ${franjasMapas(X)}<div class="ci-rutas">${rut}</div>${esNum(pA) && esNum(lpA) && pA < lpA ? nota(`Meta real: ${sg(MITAD * (lpA - pA), 2)} pts/tiro en el juego armado (mitad del camino hasta la liga). Quién participa en cada franja: los tres jugadores de cada mapa.`) : ''}`);
  }
  /** Dónde y quién, franja por franja. El código de reloj por tiro viene en el detalle de TEMPORADA. */
  function franjasMapas(X) {
    const d = X.paq.tiros && X.paq.tiros.detalle;
    if (!d || !d.puntos || !Array.isArray(d.puntos.favor)) return '';
    const ids = d.puntos.ids || [], nombres = nombresPaq(X.paq);
    const bloques = [0, 1, 2].map((k) => {
      const ts = d.puntos.favor.filter(p => p[5] === k);
      if (!ts.length) return '';
      const quien = {}; ts.forEach((p) => { const nm = corto(nombres[ids[p[4]]] || ''); if (!nm) return; quien[nm] = quien[nm] || [0, 0, 0]; quien[nm][0]++; if (p[2]) { quien[nm][1]++; quien[nm][2] += (/^1[0-3]$/.test(String(p[3])) || p[3] >= 9) ? 3 : 2; } });
      const top = Object.entries(quien).sort((a, b) => b[1][0] - a[1][0]).slice(0, 3);
      const ptsF = sum(ts, p => p[2] ? ((p[3] >= 9) ? 3 : 2) : 0), lp = pptDe(X.paq.liga && X.paq.liga.reloj && X.paq.liga.reloj.f && X.paq.liga.reloj.f[k]);
      return `<div class="ci-frc"><div class="ci-zh">${FRANJAS[k].split(' · ')[0]} · ${ts.length} tiros · ${n(ptsF / ts.length, 2)} por tiro${esNum(lp) ? ` (liga ${n(lp, 2)})` : ''}</div>${mapa([], ts, [], { rotulo: FRANJAS[k] })}<div class="ci-quien">${top.map(([nm, v]) => `<span>${foto(nm, X)}<b>${esc(nm)}</b> ${v[1]}/${v[0]} · ${n(v[2] / v[0], 2)}</span>`).join('')}</div></div>`;
    }).join('');
    return bloques ? `<h4>Dónde y quién, franja por franja (○ acierto · ✕ errado)</h4><div class="ci-frs">${bloques}</div>${nota(fuenteTemporada(X).replace('Reparto por jugador', 'Mapas y reparto por jugador').replace('al tirador', 'su franja ni al tirador'))}` : '';
  }

  /* § Mapa de tiro · zonas del ciclo: relleno, C/I y quién tira en las zonas destacadas. */
  function cardMapa(X) {
    const zs = X.c.zonas.favor || [];
    if (!zs.some(z => z.i)) return '';
    const tot = zonasSum(zs, ZONAS), aro = zonasSum(zs, ['Z1']), cortos = zonasSum(zs, ['Z2', 'Z3', 'Z4']);
    const fria = zs.filter(z => z.i >= 10 && esNum(z.puntosDeMas)).sort((a, b) => a.puntosDeMas - b.puntosDeMas)[0];
    /* La vara de la liga de un grupo de zonas (pts/tiro ponderado por volumen). */
    const lppt = (ids) => { const lz = ((X.paq.liga && X.paq.liga.zonas) || []).filter(z => ids.includes(z.zona)); const li = sum(lz, z => z.i || 0); return li ? sum(lz, z => (z.ppt || 0) * (z.i || 0)) / li : null; };
    const pAro = aro.i ? aro.pts / aro.i : null, pCor = cortos.i ? cortos.pts / cortos.i : null;
    const grupo = (t, ids) => { const s = zonasSum(zs, ids); if (!s.i) return '';
      /* Quién tira: de la temporada, sumando las zonas del grupo. */
      const q = {}; ids.forEach((zn) => quienTira(X, zn, null).lista.forEach((j) => { q[j.nombre] = q[j.nombre] || { nombre: j.nombre, completo: j.completo, i: 0, c: 0 }; q[j.nombre].i += j.i; q[j.nombre].c += j.c; }));
      const qs = Object.values(q).sort((a, b) => b.i - a.i).slice(0, 3);
      const L = lppt(ids), ppt = s.pts / s.i, chica = s.i / X.n < 6;
      const t0 = chica ? 'info' : !esNum(L) ? 'info' : (ppt >= L + 0.05 ? 'pos' : ppt <= L - 0.06 ? 'neg' : 'warn');
      const verbo = chica ? 'Muestra chica' : t0 === 'pos' || (ids[0] === 'Z1' && t0 === 'warn') ? 'Sostener' : t0 === 'neg' ? 'Corregir' : 'Sin cambios';
      let txt = `${s.c}/${s.i}${ids.length > 1 || ids[0] === 'Z1' ? ` (${pc(s.c / s.i)})` : ''}, ${n(ppt, 2)} por tiro${esNum(L) ? ` contra ${n(L, 2)} de la liga` : ''}`;
      if (chica) txt += `: ${n(s.i / X.n, 1)} tiros por partido, sin volumen para decidir.`;
      else if (ids[0] === 'Z1') txt += `: nivel liga con ${Math.round(s.i / X.n)} tiros por partido.${esNum(pCor) && pCor < ppt ? ` Cada tiro que pasa de zona corta a aro vale más (${n(ppt, 2)} contra ${n(pCor, 2)}).` : ''}`;
      else if (zf && ids.includes(zf.zona)) txt += ': la fuga mayor (ver Fuga 3).';
      else if (ids.length > 1 && t0 === 'neg') { const meta = ppt + MITAD * (L - ppt); txt += `. Son ${n(s.i / X.n, 1)} tiros por partido${esNum(pAro) ? `: cada uno que pasa al aro suma ${n(pAro - ppt, 2)} puntos` : ''}.`; txt += `</p><p class="ci-rm">Meta real: de ${n(ppt, 2)} a ${n(meta, 2)} por tiro. Vale ${sg((meta - ppt) * s.i / X.n)} pts por partido.`; }
      else txt += t0 === 'warn' ? ': rinde lo esperado con volumen alto.' : t0 === 'pos' ? ': rinde sobre la liga.' : '.';
      return `<div class="ci-zc ${t0}"><div class="ci-zh">${glifo(t0)} ${t} · ${verbo}</div><p>${txt}</p><div class="ci-quien">${qs.map(j => `<span>${foto(j.nombre, X, j.completo)}<b>${esc(j.nombre)}</b> ${j.c}/${j.i}</span>`).join('')}</div></div>`; };
    const zf = fria;
    return card('Mapa de tiro · zonas', `<div class="ci-grid2"><div>${mapa(zs, tirosCiclo(X, 'favor'), fria ? [fria.zona] : [], { rotulo: 'Tiros propios del ciclo' })}${nota(`Tiros propios del ciclo (${tot.i} ubicados). Color: puntos por tiro contra la liga en la zona, ajustado por muestra.${fria ? ` Resaltada: ${fria.zona}, la zona más fría con volumen.` : ''}`)}</div>
      <div><div class="ci-tiles t2">${tile('Pts/tiro total', n(tot.i ? tot.pts / tot.i : null, 2), `${tot.i} tiros ubicados`, 'info')}${tile('Bajo el aro (Z1)', `${aro.c}/${aro.i}`, `${n(pAro, 2)} · liga ${n(lppt(['Z1']), 2)}`, esNum(pAro) && esNum(lppt(['Z1'])) && pAro >= lppt(['Z1']) ? 'pos' : 'warn')}
        ${fria ? tile(`${fria.zona} · ${NOMBRE_ZONA[fria.zona]}`, `${fria.c}/${fria.i}`, `${n(fria.ppt, 2)} · liga ${n(fria.ligaPpt, 2)}`, 'neg') : ''}${tile('Dobles cortos', `${cortos.c}/${cortos.i}`, `${n(pCor, 2)} · liga ${n(lppt(['Z2', 'Z3', 'Z4']), 2)}`, esNum(pCor) && esNum(lppt(['Z2', 'Z3', 'Z4'])) && pCor < lppt(['Z2', 'Z3', 'Z4']) - 0.06 ? 'neg' : 'warn')}</div>
        <div class="ci-zcs">${grupo('Aro', ['Z1'])}${grupo('Triple ala izquierda', ['Z11'])}${grupo('Triple ala derecha', ['Z13'])}${grupo('Dobles cortos (Z2 + Z3 + Z4)', ['Z2', 'Z3', 'Z4'])}${grupo('Triple frontal', ['Z12'])}</div>
        ${nota(fuenteTemporada(X).replace('Reparto por jugador', 'Quién tira en cada zona: reparto'))}</div></div>`);
  }

  /* § On/off, dúos, tríos y quintetos del ciclo + sugerencias desde lo real. */
  const MUESTRA = { 5: 15, 3: 40, 2: 60 };   // minutos juntos para que la combinación cuente
  /** La foto del jugador (las del libro del torneo, punto 95) o su inicial. El nombre completo
      sale del argumento o se busca entre los del play-by-play y los del libro del ciclo. */
  function foto(nombreCorto, X, completo, cls) {
    let nom = completo || (X.rot && X.rot.nombres[nombreCorto]);
    if (!nom && X.jug) { const j = X.jug.find(x => corto(x.nombre) === nombreCorto); nom = j && j.nombre; }
    if (!nom && X.paq) { const nm = nombresPaq(X.paq); nom = Object.values(nm).find(v => corto(v) === nombreCorto); }
    let url = null;
    try { url = (typeof torneoFotoJugador === 'function' && nom) ? torneoFotoJugador(nom, X.e ? X.e.nombre : '') : null; } catch (err) { url = null; }
    const c = 'ci-av' + (cls ? ' ' + cls : '');
    return url ? `<span class="${c}" style="background-image:url('${esc(url)}')" title="${esc(nombreCorto)}"></span>` : `<span class="${c}" title="${esc(nombreCorto)}">${esc(String(nombreCorto || '').charAt(0))}</span>`;
  }
  function cardRotacion(X) {
    const R = X.rot;
    if (!R) return card('On/off, dúos, tríos y quintetos', vacio('Los partidos del ciclo no traen los tramos de cancha: llegan con la próxima subida del paquete.'));
    const fila = k => (a) => [`<span class="ci-avs">${a.nombres.map(nm => foto(nm, X)).join('')}</span>${esc(a.nombres.join(' · '))}`, n(a.min), a.pj || '', sg(a.mm, 0), n(a.ortg), n(a.drtg), `<b class="${a.net >= 0 ? 'pos' : 'neg'}">${sg(a.net)}</b>`, a.min >= MUESTRA[k] ? '✓' : '~ corta'];
    const q = R.quintetos.slice(0, 6), d = R.duos.filter(a => a.min >= MUESTRA[2]).slice(0, 5), t = R.trios.filter(a => a.min >= MUESTRA[3]).slice(0, 5);
    const on = R.on.slice().sort((a, b) => b.minOn - a.minOn).map(j => [`${foto(j.nombre, X)}${esc(j.nombre)}`, n(j.minOn, 0), n(j.minOff, 0), sg(j.netOn), sg(j.netOff), `<b class="${(j.dif || 0) >= 0 ? 'pos' : 'neg'}">${sg(j.dif)}</b>`, j.minOn >= 100 && j.minOff >= 60 ? '✓' : '~ sin muestra']);
    const conM = [].concat(R.duos.filter(a => a.min >= MUESTRA[2]).map(a => Object.assign({ tipo: 'dúo' }, a)), R.trios.filter(a => a.min >= MUESTRA[3]).map(a => Object.assign({ tipo: 'trío' }, a)), R.quintetos.filter(a => a.min >= MUESTRA[5]).map(a => Object.assign({ tipo: 'quinteto' }, a)));
    /* Una sugerencia por tamaño (dúo y trío): la más defensiva y la más ofensiva con muestra. */
    const porTipo = (t, f) => conM.filter(a => a.tipo === t).sort(f)[0];
    const defs = [porTipo('dúo', (a, b) => a.drtg - b.drtg), porTipo('trío', (a, b) => a.drtg - b.drtg)].filter(Boolean);
    const ofs = [porTipo('dúo', (a, b) => b.ortg - a.ortg), porTipo('trío', (a, b) => b.ortg - a.ortg)].filter(Boolean);
    const mejorD = defs[0], mejorO = ofs[0];
    /* La lectura: el inicial contra el quinteto con más minutos, los dúos y lo que se repite en el on/off. */
    const ini = quintetoInicial(X), lect = [];
    if (ini && ini.q) {
      const iq = ini.q, mas = ini.mas;
      lect.push(`El inicial${ini.distinto ? ` con ${esc(ini.distinto)}` : ''} (${n(iq.min)} min en ${iq.pj} partido${iq.pj === 1 ? '' : 's'}) quedó en ${sg(iq.net)} cada 100 posesiones${esNum(iq.net) && iq.net > -8 ? ': compitió' : ''}.`);
      if (mas && mas !== iq && esNum(mas.net) && esNum(iq.net) && mas.net < iq.net - 8) {
        const sale = iq.nombres.filter(x => mas.nombres.indexOf(x) < 0)[0], entra = mas.nombres.filter(x => iq.nombres.indexOf(x) < 0)[0];
        lect.push(`El quinteto que cambia a ${esc(sale || '')} por ${esc(entra || '')} acumuló ${n(mas.min)} minutos y ${sg(mas.net)}: ORTG ${n(mas.ortg)} y DRTG ${n(mas.drtg)}. Ahí se concentró el daño del ciclo.`);
      }
    }
    const duosM = R.duos.filter(a => a.min >= MUESTRA[2]);
    const dO = duosM.slice().sort((a, b) => b.ortg - a.ortg)[0], dD = duosM.slice().sort((a, b) => a.drtg - b.drtg)[0];
    const duoTxt = [dO ? `<li>Mejor dúo ofensivo: ${esc(dO.nombres.join(' · '))} (ORTG ${n(dO.ortg)}, ${n(dO.min)} min).</li>` : '', dD ? `<li>Mejor dúo defensivo: ${esc(dD.nombres.join(' · '))} (DRTG ${n(dD.drtg)}, ${n(dD.min)} min)${dD.ortg < dD.drtg ? `, pero con ORTG ${n(dD.ortg)}: defiende mejor de lo que anota` : ''}.</li>` : ''].join('');
    const conOn = R.on.filter(j => esNum(j.dif) && j.minOn >= 40);
    const masM = conOn.filter(j => j.dif > 0).sort((a, b) => b.dif - a.dif).slice(0, 2), menosM = conOn.filter(j => j.dif < 0 && j.minOn >= 90).sort((a, b) => a.dif - b.dif).slice(0, 2);
    const conPiso = R.on.filter(j => j.minOn >= 100 && j.minOff >= 60).length;
    const onTxt = `${conPiso ? `${conPiso} jugador${conPiso === 1 ? ' alcanza' : 'es alcanzan'} el piso de muestra (100 min ON y 60 min OFF).` : 'Ningún jugador alcanza el piso de muestra (100 min ON y 60 min OFF): las diferencias son indicios.'}${masM.length || menosM.length ? ` Lo que se repite: ${masM.length ? `con ${esc(masM.map(j => j.nombre).join(' y '))} en cancha el equipo pierde menos` : ''}${masM.length && menosM.length ? '; ' : ''}${menosM.length ? `con ${esc(menosM.map(j => j.nombre).join(' y '))} en cancha pierde más` : ''}.` : ''}`;
    const suman = conM.filter(a => a.net > 0).sort((a, b) => b.min - a.min).slice(0, 2), revisar = R.quintetos.filter(a => a.min >= MUESTRA[5] && a.net < 0).slice(0, 2).map(a => Object.assign({ tipo: 'quinteto' }, a));
    const cb = (a, t, txt, tag) => a ? `<div class="ci-cb ${t}"><div class="ci-ch"><span class="ci-avs">${a.nombres.map(nm => foto(nm, X)).join('')}</span><b>${tag ? tag + ' · ' : ''}${n(a.min)} min · ${a.tipo}</b></div><div class="ci-cn"><span>ORTG ${n(a.ortg)}</span><span>DRTG ${n(a.drtg)}</span><span>NET ${sg(a.net)}</span></div><p>${esc(a.nombres.join(' · '))}</p><p>${txt}</p></div>` : '';
    return card('On/off, dúos, tríos y quintetos', `<h4>Quintetos (6 con más minutos juntos)</h4>${tabla(['Combinación', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', 'Muestra'], q.map(fila(5)))}${lect.length ? `<p class="ci-lee">${lect.join(' ')}</p>` : ''}
      <div class="ci-grid2"><div><h4>Dúos (≥ ${MUESTRA[2]} min juntos)</h4>${d.length ? tabla(['Dúo', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', ''], d.map(fila(2))) : vacio('Ningún dúo llega a la muestra.')}</div>
      <div><h4>Tríos (≥ ${MUESTRA[3]} min juntos)</h4>${t.length ? tabla(['Trío', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', ''], t.map(fila(3))) : vacio('Ningún trío llega a la muestra.')}</div></div>${duoTxt ? `<ul class="ci-lista">${duoTxt}</ul>` : ''}
      <h4>On/Off por jugador (Net con él menos Net sin él, por 100 posesiones)</h4>${tabla(['Jugador', 'Min ON', 'Min OFF', 'Net ON', 'Net OFF', 'Dif.', 'Muestra'], on)}<p class="ci-lee">${onTxt}</p>
      <h4>Sugerencias desde lo real (lectura, no orden)</h4><div class="ci-cbs"><div><h5 class="pos">Si se busca más defensa</h5>${defs.map(a => cb(a, 'pos', `Si se busca cerrar: DRTG ${n(a.drtg)}, el más bajo con muestra. Costo: ORTG ${n(a.ortg)}${a.ortg < a.drtg ? ', anota menos de lo que concede' : ''}.`, 'Defensa')).join('') || vacio('Sin muestra.')}</div>
        <div><h5 class="info">Si se busca más ataque</h5>${ofs.map(a => cb(a, 'info', `Si se busca anotar: ORTG ${n(a.ortg)}. Costo: DRTG ${n(a.drtg)}${a.drtg > a.ortg ? ', concede más de lo que anota' : ''}.`, 'Ataque')).join('') || vacio('Sin muestra.')}</div>
        <div><h5 class="pos">Combinaciones que ya suman</h5>${suman.map(a => cb(a, 'pos', `NET ${sg(a.net)} en ${n(a.min)} min: candidata a más minutos.`)).join('') || vacio('Ninguna combinación con muestra suma NET positivo.')}</div>
        <div><h5 class="neg">A revisar</h5>${revisar.map(a => cb(a, 'neg', `${n(a.min)} min y NET ${sg(a.net)}: concede más de lo que anota. Candidato a repartir sus minutos.`, 'Revisar')).join('') || vacio('Ningún quinteto con muestra da NET negativo.')}</div></div>
      ${nota(`Dúos con ${MUESTRA[2]}+ min, tríos con ${MUESTRA[3]}+ y quintetos con ${MUESTRA[5]}+ juntos. Puntos de la línea de tanteo del play-by-play; posesiones ESTIMADAS con el ritmo de cada partido. Con pocos partidos son indicios: ordenan la prueba del próximo ciclo, no fijan la rotación.`)}`);
  }

  /* § Cuartos y cierre: el peor cuarto y las cinco preguntas (calidad, rival, filosofía, partido, combinación). */
  /** Triples convertidos por cuarto, desde la línea de tanteo (un salto de 3 es un triple). */
  function triplesPorCuarto(X, q) {
    let t = 0;
    (X.g8 || []).forEach((g) => { let prev = [0, 0, 0]; (g.linea || []).forEach((x) => { const per = x[0] <= 2400 ? Math.max(1, Math.ceil(x[0] / 600)) : 5; if (per === q && x[1] - prev[1] === 3) t++; prev = x; }); });
    return t;
  }
  /** El cierre del CICLO desde la línea de tanteo: los últimos 5 minutos del 4.º (y el
      suplementario) con diferencia de 5 o menos antes de cada acción. Minutos = tiempo
      corrido en esa condición. El paquete trae el de la temporada; este es el de los
      partidos del ciclo. Las pérdidas en esa ventana no viajan en la línea. */
  function cierreDelCiclo(X) {
    let pf = 0, pc = 0, seg = 0; const pj = new Set();
    (X.g8 || []).forEach((g) => {
      const L = g.linea || [], fin = Math.max(2400, ...(g.tramos || []).map(t => t[1]), ...(L.map(x => x[0])));
      let prev = [0, 0, 0];
      const pts = L.concat([[fin, (L[L.length - 1] || [0, 0, 0])[1], (L[L.length - 1] || [0, 0, 0])[2]]]);
      pts.forEach((x) => {
        const d = Math.abs(prev[1] - prev[2]);
        const desde = Math.max(prev[0], 2100), hasta = x[0];
        if (hasta > 2100 && d <= 5) { seg += Math.max(0, hasta - desde); pj.add(g.id); if (x[0] > 2100) { pf += x[1] - prev[1]; pc += x[2] - prev[2]; } }
        prev = x;
      });
    });
    return seg ? { pf, pc, min: seg / 60, pj: pj.size } : null;
  }
  function cardCuartos(X) {
    const Q = X.cuartos || X.c.cuartos;
    const filas = Q.map(q => [`${q.cuarto}.º`, `${n(q.parcial.favor / X.n)} / ${n(q.parcial.contra / X.n)}`, `<b class="${q.parcial.dif >= 0 ? 'pos' : 'neg'}">${sg(q.parcial.dif / X.n)}</b>`, q.favor.tiros, `${q.favor.pts} / ${n(q.favor.esperados)}`, sg(q.favor.dif), q.contra.tiros, `${q.contra.pts} / ${n(q.contra.esperados)}`, sg(q.contra.dif)]);
    const peor = Q.slice().sort((a, b) => a.parcial.dif - b.parcial.dif)[0];
    let preguntas = '', corregir = '';
    if (peor && peor.parcial.dif < 0) {
      const q1 = Q[0], k = peor.cuarto, mismo = k === 1;
      const ref = mismo ? Q.slice(1).sort((a, b) => b.parcial.dif - a.parcial.dif)[0] : q1;
      const ppCiclo = (X.c.resultados.partidos || []).map((p) => { const pp = parcialesDe(X, p)[k - 1]; return pp ? { r: tit(p.rival), d: pp[0] - pp[1] } : null; }).filter(Boolean);
      const peorP = ppCiclo.slice().sort((a, b) => a.d - b.d)[0];
      const resto = peorP ? ppCiclo.filter(x => x !== peorP) : [];
      const cq = X.rot && X.rot.cuarto.get(k);
      const comb = cq ? Array.from(cq.values()).sort((a, b) => b.seg - a.seg).slice(0, 4) : [];
      const seleccion = peor.favor.esperados >= ref.favor.esperados * 0.95;
      const t3k = triplesPorCuarto(X, k), t3r = triplesPorCuarto(X, ref.cuarto);
      const volK = peor.favor.tiros + peor.contra.tiros, volR = ref.favor.tiros + ref.contra.tiros;
      const q = (t, cls, txt) => `<div class="ci-q ${cls}"><b>${t}</b><p>${txt}</p></div>`;
      preguntas = `<h4>Por qué el ${k}.º es el peor: cinco preguntas</h4><div class="ci-q5">
        ${q('¿Calidad de tiro?', seleccion ? 'warn' : 'neg', `Los tiros del ${k}.º valían ${n(peor.favor.esperados)} pts (en el ${ref.cuarto}.º, ${n(ref.favor.esperados)}): ${seleccion ? 'la selección no empeora' : 'baja también la calidad del tiro elegido'}. Se anotaron ${peor.favor.pts}: ${sg(peor.favor.dif)} pts (${sg(peor.favor.dif / X.n)} por partido). ${seleccion ? 'Es ejecución.' : 'Es selección y ejecución.'}`)}
        ${q('¿Rival?', peor.contra.dif > 3 ? 'neg' : 'pos', `El rival anotó ${peor.contra.pts} con ${n(peor.contra.esperados)} esperados (${sg(peor.contra.dif)}). ${peor.contra.dif > 3 ? `En el ${k}.º el rival sobre-rinde.` : `En el ${k}.º no sobre-rinde: el daño es de nuestro ataque.`}${Q.filter(x => x.contra.dif > 10).length && !(peor.contra.dif > 3) ? ` Su exceso de acierto está en el ${Q.filter(x => x.contra.dif > 10).map(x => x.cuarto + '.º').join(' y ')}.` : ''}`)}
        ${q('¿Filosofía?', 'info', `El volumen del ${k}.º (${volK} tiros entre los dos equipos) ${Math.abs(volK - volR) <= volR * 0.08 ? 'está cerca' : volK > volR ? 'está por encima' : 'está por debajo'} del ${ref.cuarto}.º (${volR}). Triples convertidos: ${t3k} en el ${k}.º contra ${t3r} en el ${ref.cuarto}.º.`)}
        ${q('¿Qué partido?', 'warn', peorP ? `El ${k}.º suma ${sg(peor.parcial.dif, 0)}: ${esc(peorP.r)} explica ${sg(peorP.d, 0)}.${resto.length ? ` Sin ese partido, ${sg(sum(resto, x => x.d), 0)} en ${resto.length} partidos (${sg(sum(resto, x => x.d) / resto.length)} por partido).` : ''} ${resto.map(x => esc(x.r) + ' ' + sg(x.d, 0)).join(' · ')}.` : 'Sin parciales por partido.')}
        ${q('¿Combinación?', 'info', comb.length ? comb.map(a => `<span class="ci-avs">${a.nombres.map(nm => foto(nm, X)).join('')}</span> ${n(a.seg / 60)} min · ${sg(a.pf - a.pc, 0)}`).join('<br>') + '<br><span class="ci-mut">Puntos de diferencia mientras el quinteto jugó el ' + k + '.º, suma de ' + X.n + ' partidos.</span>' : 'Sin tramos de cancha.')}</div>`;
      const zf = zonaFria(X);
      const meta = MITAD * Math.max(0, -peor.favor.dif);
      corregir = ruta('neg', 'Corregir', `El ${k}.º ${seleccion ? 'no es un problema de selección sino de ejecución' : 'pierde selección y ejecución'}${t3k > t3r ? ' con más triples' : ''}.${zf ? ` Primero revisar cuántos de esos tiros son de ${zf.zona} (la zona fría) y quién los toma en el ${k}.º.` : ''}`, meta >= 1 ? `Meta real: recuperar la mitad de la brecha de ejecución: ${Math.round(meta)} pts más en ${X.n} partidos, ${sg(meta / X.n)} por partido.` : '');
    }
    const cc = cierreDelCiclo(X), cl = X.paq.clutch && X.paq.clutch.equipo;
    const sostener = cc ? ruta(cc.pf >= cc.pc ? 'pos' : 'neg', cc.pf >= cc.pc ? 'Sostener' : 'Cierre', `Cierre: en los últimos 5 minutos con diferencia ≤ 5 (${cc.pj} partido${cc.pj === 1 ? '' : 's'}) el equipo anotó ${cc.pf} y recibió ${cc.pc} en ${n(cc.min)} minutos.`)
      : (cl ? ruta(cl.masMenos >= 0 ? 'pos' : 'neg', 'Cierre (temporada)', `En los últimos 5 minutos con diferencia ≤ 5 (${cl.partidos} partidos): ${cl.ptsFavor} a favor y ${cl.ptsContra} en contra en ${n(cl.minutos)} minutos.`) : '');
    return card('Cuartos y cierre', `${tabla(['Cuarto', 'Pts a favor / en contra (por partido)', 'Dif.', 'Tiros propios', 'Pts reales / esperados', 'Dif.', 'Tiros rival', 'Pts reales / esperados', 'Dif.'], filas)}
      ${nota('Esperados = puntos que rendirían esos mismos tiros a la media de la liga en cada zona. La diferencia aísla la ejecución de la selección: la selección es buena cuando los esperados son altos y mala cuando son bajos. Los parciales salen del play-by-play (el suplementario va aparte); los tiros del 4.º incluyen los del suplementario.')}${preguntas}
      ${sostener || corregir ? `<div class="ci-rutas">${sostener}${corregir}</div>` : ''}`);
  }
  const CIC = () => (typeof SGADD_CICLOS !== 'undefined' ? SGADD_CICLOS : { partidosDe: () => [] });

  /* ============================================================ JUGADORES */

  /* § Matriz USG% contra PPP, con la foto de cada jugador y el aro del semáforo. */
  function cardMatriz(X) {
    const J = X.jug.filter(j => j.min >= 10 && esNum(j.usg) && esNum(j.ppp));
    if (!J.length || !esNum(X.mPPP) || !esNum(X.mUSG)) return card('Matriz USG% contra PPP', vacio('Sin jugadores con 10 minutos o más, o sin la vara de la liga.'));
    const W = 560, H = 380, P = 40;
    const xs = J.map(j => j.usg).concat(X.mUSG), ys = J.map(j => j.ppp).concat(X.mPPP);
    const x0 = Math.min(...xs) - 0.02, x1 = Math.max(...xs) + 0.02, y0 = Math.min(...ys) - 0.08, y1 = Math.max(...ys) + 0.08;
    const X_ = v => P + (W - 2 * P) * (v - x0) / (x1 - x0), Y_ = v => H - P - (H - 2 * P) * (v - y0) / (y1 - y0);
    const cx = X_(X.mUSG), cy = Y_(X.mPPP);
    const puntos = J.map((j, i) => {
      const s = semaforo(j, X.mPPP, X.mTS), r = 10 + Math.min(12, j.min / 3);
      let url = null; try { url = typeof torneoFotoJugador === 'function' ? torneoFotoJugador(j.nombre, j.equipo) : null; } catch (e) { url = null; }
      const id = 'ci-clip-' + i;
      return `<g><title>${esc(corto(j.nombre))}: USG ${pc(j.usg)} · PPP ${n(j.ppp, 2)} · ${n(j.min)} min</title><clipPath id="${id}"><circle cx="${X_(j.usg)}" cy="${Y_(j.ppp)}" r="${r}"/></clipPath>
        <circle cx="${X_(j.usg)}" cy="${Y_(j.ppp)}" r="${r}" fill="var(--ci-line)"/>${url ? `<image href="${esc(url)}" x="${X_(j.usg) - r}" y="${Y_(j.ppp) - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>` : `<text x="${X_(j.usg)}" y="${Y_(j.ppp) + 4}" text-anchor="middle" class="ci-dl">${esc(corto(j.nombre).slice(0, 2))}</text>`}
        <circle cx="${X_(j.usg)}" cy="${Y_(j.ppp)}" r="${r}" class="ci-ring ${s.t}" fill="none"/><text x="${X_(j.usg)}" y="${Y_(j.ppp) + r + 11}" text-anchor="middle" class="ci-dl">${esc(corto(j.nombre))}</text></g>`;
    }).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Matriz de uso contra rendimiento"><rect class="ci-qz tl" x="${P}" y="${P}" width="${cx - P}" height="${cy - P}"/><rect class="ci-qz tr" x="${cx}" y="${P}" width="${W - P - cx}" height="${cy - P}"/><rect class="ci-qz bl" x="${P}" y="${cy}" width="${cx - P}" height="${H - P - cy}"/><rect class="ci-qz br" x="${cx}" y="${cy}" width="${W - P - cx}" height="${H - P - cy}"/>
      <line x1="${cx}" y1="${P}" x2="${cx}" y2="${H - P}" class="ci-ref"/><line x1="${P}" y1="${cy}" x2="${W - P}" y2="${cy}" class="ci-ref"/>
      <text x="${W - P - 4}" y="${P + 12}" text-anchor="end" class="ci-qt">REFERENTE EFICIENTE</text><text x="${P + 4}" y="${P + 12}" class="ci-qt">EFICIENTE CON POCO USO</text><text x="${W - P - 4}" y="${H - P - 6}" text-anchor="end" class="ci-qt">VOLUMEN CARO</text><text x="${P + 4}" y="${H - P - 6}" class="ci-qt">APORTE BAJO</text>
      <text x="${W / 2}" y="${H - 8}" text-anchor="middle" class="ci-ax">USG% →</text><text x="12" y="${H / 2}" class="ci-ax" transform="rotate(-90 12 ${H / 2})" text-anchor="middle">PPP (por jugada) →</text>${puntos}</svg>`;
    return card('Matriz USG% contra PPP', svg + nota(`Foto = jugador, tamaño = minutos, aro = semáforo (verde en o sobre la mediana de PPP de la liga ${n(X.mPPP, 2)}, ámbar hasta 0,14 por debajo, rojo más abajo). Las líneas son la mediana de jugadores de la liga (USG ${pc(X.mUSG)}). Jugadores con 10 minutos o más en el ciclo.`));
  }
  /* § Qué significa cada cuadrante (palabra clave). */
  function cuadrante(j, X) { const u = j.usg >= X.mUSG, p = j.ppp >= X.mPPP; return u && p ? 0 : !u && p ? 1 : u && !p ? 2 : 3; }
  function cardCuadrantes(X) {
    const J = X.jug.filter(j => j.min >= 10 && esNum(j.usg) && esNum(j.ppp));
    if (!J.length || !esNum(X.mPPP)) return '';
    const D = [['Referente eficiente', 'pos', 'Mucho uso con rendimiento en o sobre la mediana: el jugador del que depende el ataque.'], ['Eficiente con poco uso', 'info', 'Rinde más de lo que toca la pelota: el candidato natural a más jugadas.'],
      ['Volumen caro', 'neg', 'Muchas jugadas con rendimiento bajo la mediana: el ajuste es de selección de tiro, no de minutos.'], ['Aporte bajo', 'warn', 'Poco uso y poco rendimiento: se revisa el rol (qué se le pide) antes que el volumen.']];
    /* La lectura de cada cuadrante con los nombres de hoy: quién está en el borde y quién lejos. */
    const r2 = v => Math.round(v * 100) / 100;
    const extra = (i, js) => {
      if (!js.length) return i === 0 ? ` Hoy nadie: ${(() => { const c = J.filter(j => j.usg >= X.mUSG).sort((a, b) => b.ppp - a.ppp)[0]; return c ? `el más cercano es ${esc(corto(c.nombre))} (${n(c.ppp, 2)})` : 'no hay un jugador de mucho uso cerca de la mediana'; })()}.` : '';
      if (i === 0) { const enBorde = js.filter(j => r2(j.ppp) === r2(X.mPPP)); return enBorde.length ? ` Hoy ${esc(enBorde.map(j => `${corto(j.nombre)} (${n(j.ppp, 2)})`).join(', '))}: en la mediana, no por encima.` : ` Hoy ${esc(js.map(j => corto(j.nombre)).join(', '))}.`; }
      if (i === 1) return '';
      if (i === 2) { const p = js.slice().sort((a, b) => b.usg - a.usg)[0]; return p ? ` El de más uso: ${esc(corto(p.nombre))} (${pc(p.usg)} a ${n(p.ppp, 2)}).` : ''; }
      return '';
    };
    return card('Qué significa cada cuadrante', `<div class="ci-grid2">${D.map((d, i) => { const js = J.filter(j => cuadrante(j, X) === i);
      return `<div class="ci-zc ${d[1]}"><div class="ci-zh">${d[0]}</div><div class="ci-quien">${js.map(j => `<span>${foto(corto(j.nombre), X, j.nombre)}<b>${esc(corto(j.nombre))}</b></span>`).join('') || '—'}</div><p>${d[2]}${extra(i, js)}</p></div>`; }).join('')}</div>`);
  }
  /* § Distribución de minutos: cuánto se concentra y quién no sumó minutos. */
  function cardMinutos(X) {
    const J = X.jug; if (!J.length) return '';
    const mx = Math.max(...J.map(j => j.min));
    const nucleo = J.filter(j => j.min >= 22);
    const parte = sum(nucleo, j => j.MIN) / Math.max(1, sum(J, j => j.MIN));
    const minEq = sum(X.filasEq, p => esNum(p.MIN) ? p.MIN : 0) / Math.max(1, X.filasEq.length);
    const tps = X.c.resultados.partidos.filter(p => conTP(X, p)).length;
    const sinMin = X.sinMin || [];
    const txt = `${nucleo.length ? `${cap(['', 'un jugador supera', 'dos jugadores superan', 'tres jugadores superan', 'cuatro jugadores superan', 'cinco jugadores superan', 'seis jugadores superan', 'siete jugadores superan'][nucleo.length] || nucleo.length + ' jugadores superan')} los 22 minutos y reúnen el ${Math.round(100 * parte)} % de los minutos` : 'Nadie supera los 22 minutos'}${minEq ? ` (${n(minEq, 2)} por partido${tps ? `, con ${tps === 1 ? 'un suplementario' : tps + ' suplementarios'}` : ''})` : ''}.`
      + (sinMin.length ? ` ${esc(sinMin.map(corto).join(' y '))} no sumaron minutos.` : '');
    return card('Distribución de minutos', `<div class="ci-mins">${J.map(j => `<div class="ci-mr"><span>${foto(corto(j.nombre), X, j.nombre)}${esc(corto(j.nombre))}</span><i style="--w:${(100 * j.min / mx).toFixed(0)}%"></i><b>${n(j.min)}</b></div>`).join('')}</div>${nota(txt)}`);
  }
  /** Fortaleza / fuga / ajuste de un jugador, con números del ciclo y de su mapa de temporada. */
  function lecturaJugador(j, X) {
    const d = X.paq.tiros && X.paq.tiros.detalle; const nombres = nombresPaq(X.paq);
    const tj = d && (d.jugadores || []).find(x => clave(nombres[x.id] || '') === clave(j.nombre));
    const zs = tj ? (tj.zonas || []).filter(z => z.i >= 5) : [];
    const mejor = zs.slice().sort((a, b) => b.ppt - a.ppt)[0], peor = zs.slice().sort((a, b) => a.ppt - b.ppt)[0];
    const t3 = j.T3I ? j.T3C / j.T3I : null, pj = Math.max(1, j.pj);
    /* De dónde tira (mapa de temporada): pintura (Z1-Z4) y triple, con su rédito. */
    const zsAll = tj ? (tj.zonas || []) : [];
    const pin = zsAll.filter(z => ['Z1', 'Z2', 'Z3', 'Z4'].includes(z.zona)), tri = zsAll.filter(z => /^Z1[0-4]$/.test(z.zona));
    const iP = sum(pin, z => z.i || 0), iT = sum(tri, z => z.i || 0), tot = tj ? (tj.i || iP + iT) : 0;
    const pptP = iP ? sum(pin, z => (z.ppt || 0) * (z.i || 0)) / iP : null, pptT = iT ? sum(tri, z => (z.ppt || 0) * (z.i || 0)) / iT : null;
    const castig = ((X.c.causas && X.c.causas.jugadores) || []).find(x => clave(x.nombre) === clave(j.nombre));
    const plantelPPP = X.jug.filter(x => x.PLAYS >= 30).map(x => x.ppp).filter(esNum);
    const fo = [];
    if (esNum(j.ppp) && esNum(X.mPPP) && Math.round(j.ppp * 100) >= Math.round(X.mPPP * 100)) fo.push(`${plantelPPP.length && j.ppp >= Math.max(...plantelPPP) - 1e-9 ? 'La mayor renta del plantel: ' : ''}${n(j.ppp, 2)} por jugada${esNum(j.ts) ? ` y TS ${pc(j.ts)}` : ''} con ${pc(j.usg)} de uso`);
    if (tot >= 10 && iP / tot >= 0.55) fo.push(`${Math.round(100 * iP / tot)} % de sus tiros en pintura${esNum(pptP) ? ` (${n(pptP, 2)} por tiro)` : ''}`);
    else if (mejor && mejor.ppt >= 1) fo.push(`su mejor zona es ${mejor.zona} ${mejor.c}/${mejor.i} (${n(mejor.ppt, 2)} por tiro)`);
    if (j.RD / pj >= 3.5) fo.push(`${n(j.RD / pj)} rebotes defensivos por partido${j.PR / pj >= 1.5 ? ` y ${n(j.PR / pj)} recuperos` : ''}`);
    else if (j.PR / pj >= 1.5) fo.push(`${n(j.PR / pj)} recuperos por partido`);
    if (j.RO / pj >= 1.5 && j.min < 16) fo.push(`${n(j.RO / pj)} rebotes ofensivos en ${n(j.min)} min`);
    if (j.FR / pj >= 3) fo.push(`llega a la línea (${n(j.FR / pj)} faltas recibidas, ${n(j.T1I / pj)} libres intentados por partido)`);
    if (j.astpp >= 1.5 && j.AST >= 4) fo.push(`AST-PP ${n(j.astpp, 2)}: pasa más de lo que pierde`);
    const fu = [];
    if (esNum(j.ppp) && esNum(X.mPPP) && Math.round(j.ppp * 100) < Math.round(X.mPPP * 100)) fu.push(`${n(j.ppp, 2)} por jugada${esNum(j.usg) && esNum(X.mUSG) && j.usg >= X.mUSG + 0.04 ? ` con ${pc(j.usg)} de uso` : ''}`);
    if (tot >= 10 && iT / tot >= 0.45 && esNum(pptT) && pptT < 0.9) fu.push(`${Math.round(100 * iT / tot)} % de sus tiros de triple a ${n(pptT, 2)}`);
    else if (peor && peor !== mejor && peor.ppt < 0.8) fu.push(`${peor.zona} ${peor.c}/${peor.i} (${n(peor.ppt, 2)} por tiro)`);
    if (esNum(t3) && j.T3I >= 8 && t3 < 0.28 && !fu.some(x => /triple/.test(x))) fu.push(`T3 de ${pc(t3, 0)} (${j.T3C}/${j.T3I})`);
    if (j.PP / pj >= 2.5) fu.push(`${n(j.PP / pj)} pérdidas por partido${castig && castig.perdidas >= 2 ? ` (${castig.perdidas} de sus pérdidas terminaron en ${castig.puntosRival} pts rivales dentro de los 7 s)` : ''}`);
    if (j.FC / pj >= 3) fu.push(`${n(j.FC / pj)} faltas cometidas por partido`);
    if (j.AST === 0 && j.PLAYS >= 20) fu.push('casi no genera para otros (sin asistencias)');
    const enMed = esNum(j.ppp) && esNum(X.mPPP) && Math.round(j.ppp * 100) >= Math.round(X.mPPP * 100);
    const meta = esNum(j.ppp) && esNum(X.mPPP) ? (enMed ? null : j.ppp + MITAD * (X.mPPP - j.ppp)) : null;
    let ajuste = 'Sostener lo que rinde.';
    const sinMuestra = j.PLAYS < 12;
    if (sinMuestra) ajuste = 'No sacar conclusiones; observar si recibe minutos.';
    else if (esNum(j.ppp) && j.ppp >= X.mPPP && tot >= 10 && iP / tot >= 0.55) ajuste = 'Más jugadas de finalización cerca del aro.';
    else if (tot >= 10 && iT / tot >= 0.45 && esNum(pptT) && esNum(pptP) && pptP > pptT + 0.1) ajuste = `Menos triples y más ataque al aro (${n(pptP, 2)} por tiro en pintura, ${iP} tiros).`;
    else if (peor && /^Z1[0-4]$/.test(peor.zona) && mejor && /^Z1[0-4]$/.test(mejor.zona) && mejor !== peor) ajuste = `Mover tiros de ${peor.zona} hacia ${mejor.zona} y aro.`;
    else if (peor && /^Z1[0-4]$/.test(peor.zona) && mejor && !/^Z1[0-4]$/.test(mejor.zona)) ajuste = `Menos triples desde ${peor.zona}, más ataque a ${mejor.zona}.`;
    else if (j.FC / pj >= 3) ajuste = 'Disciplina de faltas y rol de rebote y defensa.';
    else if (j.PP / pj >= 2.5) ajuste = 'Cuidar la pelota antes que sumar volumen.';
    else if (j.FR / pj >= 3) ajuste = 'Priorizar el aro y la línea sobre el triple.';
    else if (peor && mejor && peor !== mejor) ajuste = `Mover tiros de ${peor.zona} hacia ${mejor.zona}.`;
    if (sinMuestra) return { fortaleza: fo.join('; ') || 'muestra mínima', fuga: `sin muestra: ${Math.round(j.PLAYS)} jugadas`, ajuste, meta: null, rol: 'Sin muestra', mapa: tj };
    const rol = !tj ? 'Sin mapa' : (sum((tj.zonas || []).filter(z => ['Z1', 'Z2', 'Z3', 'Z4'].includes(z.zona)), z => z.i) / Math.max(1, tj.i) >= 0.6 ? 'Finalizador cerca del aro'
      : (sum((tj.zonas || []).filter(z => /^Z1[0-4]$/.test(z.zona)), z => z.i) / Math.max(1, tj.i) >= 0.5 ? 'Tirador / espaciador' : (j.astpp >= 1.5 ? 'Conector' : 'Rotación versátil')));
    return { fortaleza: fo.join('; ') || 'sin una fortaleza que se separe en el ciclo', fuga: fu.join('; ') || 'sin una fuga que se separe', ajuste: ajuste + (meta ? ` Meta: PPP de ${n(j.ppp, 2)} a ${n(meta, 2)}.` : ' Meta: sostener el PPP.'), meta, rol, mapa: tj };
  }
  /** La jerarquía y el rol funcional del ADN de la ficha (sgadd-jugadores.js), si está cargado:
      «Jugador Franquicia · Manejador Secundario». Es la temporada del libro al cierre del ciclo. */
  function adnDe(X, j) {
    if (typeof jugadoresADN !== 'function' || !X.idx.liga || !X.idx.liga.jugadores) return '';
    try {
      const jj = X.idx.liga.jugadores.find(x => clave(x.EQUIPO) === clave(j.equipo) && String(x.NOMBRES) === String(j.nombre));
      const a = jj ? jugadoresADN(X.idx, jj) : null;
      if (!a) return '';
      const je = a.jerarquia && (a.jerarquia.label || a.jerarquia.nombre), rf = a.rolFuncional && (a.rolFuncional.label || a.rolFuncional.nombre);
      return [je, rf].filter(Boolean).map(s => String(s).replace(/^[^\wÁÉÍÓÚáéíóúÑñ]+/, '').trim()).join(' · ');
    } catch (e) { return ''; }
  }
  /* § Desempeño individual por bloques de minutos (I > 25 · II 16-25 · III < 16), ordenado por influencia. */
  function cardDesempeno(X) {
    if (!X.jug.length) return card('Desempeño individual del plantel', vacio('El libro abierto no trae a los jugadores del ciclo.'));
    const bloque = (t, f) => { const J = X.jug.filter(f); if (!J.length) return ''; return `<h4>${t}</h4><div class="ci-jcs">${J.map((j) => {
      const s = semaforo(j, X.mPPP, X.mTS), L = lecturaJugador(j, X);
      const adn = adnDe(X, j);
      return `<div class="ci-jc ${s.t}"><div class="ci-jh">${foto(corto(j.nombre), X, j.nombre, 'lg')}<div><b>${esc(corto(j.nombre))}</b>${adn ? `<div class="ci-sm ci-mut">${esc(adn)}</div>` : ''}</div><span class="ci-chip ${s.t}">${s.label}</span></div>
        <div class="ci-tiles t4 ci-jt">${tile('Min', n(j.min), esNum(j.partTiempo) ? Math.round(100 * j.partTiempo) + ' % del tiempo' : '', 'info')}${tile('USG%', pc(j.usg), 'liga ' + pc(X.mUSG), 'info')}${tile('PPP', n(j.ppp, 2), 'liga ' + n(X.mPPP, 2), s.t)}${tile('Triples', `${j.T3C}/${j.T3I}`, j.T3I ? pc(j.T3C / j.T3I, 0) : '', 'info')}</div>
        <ul class="ci-tri"><li><b>Fortaleza de identidad.</b> ${esc(L.fortaleza)}.</li><li><b>Punto de fuga.</b> ${esc(L.fuga)}.</li><li><b>Ajuste estratégico.</b> ${esc(L.ajuste)}</li></ul></div>`; }).join('')}</div>`; };
    return card('Desempeño individual del plantel · el ciclo', `<p class="ci-sm">Ordenado por influencia: el ajuste de un jugador de 34 minutos pesa más que el de uno de 14.</p>
      ${bloque('I. Núcleo de alta carga (más de 25 min)', j => j.min > 25)}${bloque('II. Rotación y eficiencia estratégica (16 a 25 min)', j => j.min >= 16 && j.min <= 25)}${bloque('III. Segunda unidad y factores X (menos de 16 min)', j => j.min < 16)}
      ${nota(`Semáforo: ★ Élite (PPP 0,03 sobre la mediana y TS 5 pp sobre la mediana, con 15+ min) · ✓ Cumplido (en o sobre la mediana ${n(X.mPPP, 2)}) · ⚠ Alerta (hasta 0,14 por debajo) · ✖ Crítico. Zonas: mapa de temporada del paquete. Es una foto, no una sentencia.`)}`);
  }
  /* § Mapas de tiro por jugador (los seis con más tiros): ○ / ✕ reales y su mejor y peor zona. */
  function cardMapasJugador(X) {
    const d = X.paq.tiros && X.paq.tiros.detalle;
    if (!d || !d.puntos || !Array.isArray(d.puntos.favor)) return '';
    const ids = d.puntos.ids || [], nombres = nombresPaq(X.paq);
    const top = (d.jugadores || []).slice().sort((a, b) => b.i - a.i).slice(0, 6);
    const pm = top.map((tj) => {
      const k = ids.indexOf(tj.id), ts = d.puntos.favor.filter(p => p[4] === k);
      const zs = (tj.zonas || []).filter(z => z.i >= 5), mej = zs.slice().sort((a, b) => b.ppt - a.ppt)[0], peo = zs.slice().sort((a, b) => a.ppt - b.ppt)[0];
      const nm = nombres[tj.id] || String(tj.id), ct = corto(nm);
      const iAro = sum((tj.zonas || []).filter(z => ['Z1', 'Z2', 'Z3', 'Z4'].includes(z.zona)), z => z.i || 0), iT3 = sum((tj.zonas || []).filter(z => /^Z1[0-4]$/.test(z.zona)), z => z.i || 0);
      const bm = (z, s) => z ? `${s} ${z.zona} ${z.c}/${z.i} · ${n(z.ppt, 2)}` : '';
      return `<div class="ci-pm"><div class="ci-pmh">${foto(ct, X, nm, 'lg')}<div><b>${esc(ct)}</b><div class="ci-sm ci-mut">${ts.length || tj.i} tiros ubicados · mediana a ${n(tj.dist)} m</div></div></div>${mapa([], ts, [mej, peo].filter(Boolean).map(z => z.zona), { rotulo: 'Mapa de ' + ct })}
        <div class="ci-tiles t2">${tile('Pts/tiro', n(tj.ppt, 2), `${tj.c}/${tj.i} de campo`, 'info')}${tile('Aro / triple', tj.i ? `${Math.round(100 * iAro / tj.i)} / ${Math.round(100 * iT3 / tj.i)}` : '—', '% de sus tiros', 'info')}</div>
        <p class="ci-sm"><span class="pos">${bm(mej, '▲')}</span>${peo && peo !== mej ? ` · <span class="neg">${bm(peo, '▼')}</span>` : ''}</p></div>`;
    }).join('');
    return card('Mapas de tiro por jugador · aciertos (○) y errados (✕)', `<div class="ci-pmaps">${pm}</div>${nota(`Cada jugador con sus tiros reales. ▲ y ▼ marcan su mejor y su peor zona con 5 tiros o más. Los seis con más tiros; el diagnóstico completo está en la pestaña Mapa de tiro de cada ficha. ${fuenteTemporada(X).replace('Reparto por jugador', 'Tiros')}`)}`);
  }
  /* § Reporte individual consolidado (orden de minutos). */
  function cardConsolidado(X) {
    if (!X.jug.length) return '';
    const filas = X.jug.map((j) => { const s = semaforo(j, X.mPPP, X.mTS), L = lecturaJugador(j, X);
      return [`${esc(corto(j.nombre))} ${n(j.min)} min`, esc(L.rol), esc(L.ajuste.split(' Meta')[0]), L.meta ? `${n(j.ppp, 2)} → ${n(L.meta, 2)}` : `sostener ≥ ${n(X.mPPP, 2)}`, `<span class="ci-chip ${s.t}">${s.label} ${n(j.ppp, 2)}</span>`]; });
    return card(`Reporte individual consolidado · orden de minutos`, tabla(['Jugador', 'Rol estratégico sugerido', 'Ajuste clave de volumen', 'Meta (PPP)', `Estado actual (Ciclo ${X.c.meta.numero})`], filas) + nota('Meta = mitad del camino entre el PPP de hoy y la mediana de la liga; quien ya la supera, sostiene. Rol sugerido: lectura de lo que hoy mejor rinde, no un puesto asignado.'));
  }
  /* § Reestructuración táctica: transferencia de volumen de ineficientes a finalizadores. */
  function cardReestructura(X) {
    const lig = X.mPPP; if (!esNum(lig)) return '';
    const PRIOR = 30, adj = j => (j.PTS + PRIOR * lig) / (j.PLAYS + PRIOR);
    const J = X.jug.filter(j => j.min >= 12 && j.PLAYS >= 15);
    const dadores = J.filter(j => adj(j) < lig - 0.05).sort((a, b) => b.PLAYS / b.pj - a.PLAYS / a.pj).slice(0, 3);
    const receptores = J.filter(j => adj(j) >= lig - 0.01).sort((a, b) => adj(b) - adj(a));
    if (!dadores.length || !receptores.length) return card('Reestructuración táctica y proyección', vacio('No hay a la vez un jugador con volumen bajo la mediana y otro con renta probada para recibirlo.'));
    let total = 0;
    const movs = dadores.map((d, i) => { const r = receptores[i % receptores.length], mov = Math.min(2, (d.PLAYS / d.pj) * 0.15);
      const g = mov * (lig + (adj(r) - lig) / 2 - adj(d)); total += g;
      return `<div class="ci-mvr"><span>${esc(corto(d.nombre))} ${n(adj(d), 2)}</span><span class="ci-fl">−${n(mov)} jugadas/partido →</span><span>${esc(corto(r.nombre))} ${n(adj(r), 2)}</span><b class="pos">${sg(g)} pts</b></div>`; }).join('');
    /* La justificación, con los nombres: quién está sobre la mediana y cuánto volumen tienen los que no. */
    const sobre = X.jug.filter(j => j.min >= 12 && esNum(j.ppp) && j.ppp >= lig);
    const bajo = dadores.slice().sort((a, b) => a.ppp - b.ppp);
    const jugBajo = sum(dadores, d => d.PLAYS / d.pj);
    const enMed = receptores.find(r => Math.round(r.ppp * 100) === Math.round(lig * 100));
    const just = [sobre.length === 1 ? `Es el único jugador de la rotación sobre la mediana: ${esc(corto(sobre[0].nombre))}, ${n(sobre[0].ppp, 2)} por jugada con ${pc(sobre[0].usg)} de uso.` : sobre.length ? `Sobre la mediana: ${esc(sobre.map(j => `${corto(j.nombre)} (${n(j.ppp, 2)})`).join(', '))}.` : 'Nadie de la rotación está sobre la mediana.',
      `${esc(bajo.map(j => `${corto(j.nombre)} (${n(j.ppp, 2)})`).join(', ').replace(/, ([^,]*)$/, ' y $1'))} concentran ${n(jugBajo, 1)} jugadas por partido con rendimiento bajo la mediana (${n(lig, 2)}).`];
    /* Lo que aportan las otras metas (Plan): selección de tiro y defensa, con las metas reales. */
    const MR = metasReales(X), sel = (MR.fria ? MR.fria.pts : 0) + (MR.cortos ? MR.cortos.pts : 0), def = (MR.t3r ? MR.t3r.pts : 0) + (MR.trans ? MR.trans.pts : 0);
    return card('Reestructuración táctica y proyección', `<h4>1 · Redistribución del USG% · transferencia de volumen</h4><div class="ci-mv">${movs}</div>
      <h4>2 · Justificación técnica y diagnóstico</h4><ul class="ci-lista">${just.map(x => `<li>${x}</li>`).join('')}<li>PPP ajustado con ${PRIOR} jugadas de la liga como prior (${X.n} partidos son poca muestra). A quien recibe volumen se le reconoce solo la mitad de su ventaja: más jugadas bajan el rendimiento marginal.</li>
        ${enMed ? `<li>${esc(corto(enMed.nombre))} (${n(enMed.ppp, 2)}) está en la mediana: su ventaja sobre los que ceden volumen es real pero chica, y por eso se le reconoce solo la mitad.</li>` : ''}</ul>
      <h4>3 · Mejora alcanzable e impacto proyectado</h4><div class="ci-tiles">${tile('Por redistribución', sg(total) + ' pts', 'por partido', total > 0 ? 'pos' : 'info')}${sel > 0.05 ? tile('Selección de tiro (zona fría y dobles cortos)', sg(sel) + ' pts', 'por partido, metas reales', 'pos') : ''}${def > 0.05 ? tile('Defensa (triple rival + transición)', sg(def) + ' pts', 'por partido, metas reales', 'pos') : ''}</div>
      ${nota(`La redistribución sola vale ${total < 1.5 ? 'poco' : 'algo'} (${sg(total)} pts por partido): el volumen no es el problema, lo es cuánto rinde cada jugada. Por eso el peso del plan está en la selección de tiro y en la defensa de ala y transición; mover jugadas es un complemento.`)}`);
  }

  /** Las METAS REALES del ciclo (mitad del camino hasta la liga), las mismas que citan las
      fugas y el tablero: zona fría, dobles cortos, triple del rival, transición defensiva,
      juego armado (ataque) y puntos del peor cuarto. Cada una con su base, su meta y su valor. */
  function metasReales(X) {
    if (X._mr) return X._mr;
    const out = {}, zs = X.c.zonas.favor || [];
    const lpptZ = (ids) => { const lz = ((X.paq.liga && X.paq.liga.zonas) || []).filter(z => ids.includes(z.zona)); const li = sum(lz, z => z.i || 0); return li ? sum(lz, z => (z.ppt || 0) * (z.i || 0)) / li : null; };
    const zf = zonaFria(X);
    if (zf) { const m = zf.ppt + MITAD * (zf.ligaPpt - zf.ppt); out.fria = { zona: zf.zona, base: zf.ppt, meta: m, liga: zf.ligaPpt, pts: (m - zf.ppt) * zf.i / X.n }; }
    const co = zonasSum(zs, ['Z2', 'Z3', 'Z4']), lco = lpptZ(['Z2', 'Z3', 'Z4']);
    if (co.i >= 15 && esNum(lco) && co.pts / co.i < lco - 0.06) { const b = co.pts / co.i, m = b + MITAD * (lco - b); out.cortos = { base: b, meta: m, liga: lco, pts: (m - b) * co.i / X.n }; }
    const t3 = zonasSum(X.c.zonas.contra || [], ['Z10', 'Z11', 'Z12', 'Z13', 'Z14']), lt3 = varaLiga3(X);
    if (t3.i && esNum(lt3) && t3.c / t3.i > lt3) { const b = t3.c / t3.i, m = b - MITAD * (b - lt3); out.t3r = { base: b, meta: m, liga: lt3, pts: (b - m) * 3 * t3.i / X.n }; }
    const tr = transicion(X);
    if (tr && esNum(tr.ppt) && esNum(tr.lppt) && tr.ppt > tr.lppt) { const m = tr.ppt - MITAD * (tr.ppt - tr.lppt); out.trans = { base: tr.ppt, meta: m, liga: tr.lppt, pts: (tr.ppt - m) * tr.tiros / X.n }; }
    const R = X.reloj, L = X.paq.liga && X.paq.liga.reloj;
    if (R.con && L && L.f) { const b = pptDe(R.favor.f[1]), l = pptDe(L.f[1]); if (esNum(b) && esNum(l) && b < l) { const m = b + MITAD * (l - b); out.armado = { base: b, meta: m, liga: l, pts: (m - b) * R.favor.f[1][0] / X.n }; } }
    const efo = X.metricas['eFG Opp%'];
    if (efo && esNum(efo.valor) && esNum(efo.pct) && efo.pct < 40) { const obj = enPercentil(X.idx, 'eFG Opp%', 40); if (esNum(obj)) out.efgo = { base: efo.valor, meta: efo.valor + MITAD * (obj - efo.valor) }; }
    const Q = X.cuartos || X.c.cuartos, peor = Q.slice().sort((a, b) => a.parcial.dif - b.parcial.dif)[0];
    if (peor && peor.favor.dif < -2) out.cuarto = { cuarto: peor.cuarto, base: peor.favor.pts, meta: Math.round(peor.favor.pts + MITAD * -peor.favor.dif) };
    X._mr = out;
    return out;
  }

  /* ============================================================ CLASIFICACIÓN */

  /* § Posición actual: la misma tabla de la sección Clasificación. */
  /** La zona del formato publicado para un puesto (doc.formato.fases: `directos` y `puestos`). */
  function zonaDelFormato(X, puesto) {
    const fs = ((X.doc && X.doc.formato && X.doc.formato.fases) || []);
    for (const f of fs) {
      const r = f.directos || f.puestos;
      if (Array.isArray(r) && puesto >= r[0] && puesto <= r[1]) return f.directos ? `Directo a ${String(f.label || '').toLowerCase().replace(/ de final$/, '')}` : (f.label || '');
    }
    return fs.some(f => f.directos || f.puestos) ? 'Fuera del formato' : '';
  }
  const zonasTxt = (X) => ((X.doc && X.doc.formato && X.doc.formato.fases) || []).filter(f => f.directos || f.puestos).map(f => { const r = f.directos || f.puestos; return `${r[0]}.º a ${r[1]}.º ${f.directos ? 'directos a ' + String(f.label || '').toLowerCase().replace(/ de final$/, '') : String(f.label || '').toLowerCase()}`; }).join(', ');
  /* § Posición actual: la tabla de la liga al cierre del ciclo, con la zona del formato publicado. */
  function cardPosicion(X) {
    const CL = (typeof SGADD_CLASIF !== 'undefined') ? SGADD_CLASIF : null;
    let filas = null;
    try { const t = CL && CL.tabla ? CL.tabla(X.idx, { orden: ['PCT', 'DIF', 'PF'] }) : null; filas = Array.isArray(t) ? t : (t && t.filas) || null; } catch (err) { filas = null; }
    const pjs = (X.idx.lista ? X.idx.lista() : []).map(e => e.pj).filter(esNum);
    if (!filas || !filas.length) {
      let h = ''; try { h = (typeof clasifTablaHTML === 'function') ? clasifTablaHTML(X.idx, { columnas: 'resumida' }) : ''; } catch (err) { h = ''; }
      return card('Posición actual', (h || vacio('La tabla no está disponible.')) + nota(pjs.length ? `Los equipos jugaron entre ${Math.min(...pjs)} y ${Math.max(...pjs)} partidos: el puesto de hoy no es comparable entre equipos.` : ''));
    }
    const conZona = zonasTxt(X);
    const yo = filas.find(f => X.e && clave(f.nombre) === X.e.clave);
    const cab = ['#', 'Equipo', 'PJ', 'G', 'P', 'PF', 'PC', 'Dif.', 'Pts'].concat(conZona ? [`Zona (formato ${(X.doc && X.doc.temporada) || ''})`.replace(' ()', '')] : []);
    const rows = filas.map((f, i) => { const pos = f.puesto || i + 1; const mio = f === yo;
      const c = [pos, mio ? `<b>${esc(f.nombre)}</b>` : esc(f.nombre), f.pj, f.pg, f.pp, f.pf, f.pc, `<span class="${f.dif >= 0 ? 'pos' : 'neg'}">${sg(f.dif, 0)}</span>`, esNum(f.puntos) ? f.puntos : f.pg * 2 + f.pp];
      if (conZona) c.push(esc(zonaDelFormato(X, pos)));
      return c; });
    const cerca = yo ? filas.filter(f => f !== yo && f.pg === 0 && Math.abs((f.puesto || 0) - (yo.puesto || 0)) <= 3) : [];
    const txt = `El puesto de hoy no es comparable.${pjs.length ? ` Los equipos jugaron entre ${Math.min(...pjs)} y ${Math.max(...pjs)} partidos` : ''}${yo ? `: ${esc(nombreEq(X))} es ${yo.puesto}.º con ${yo.pj} jugados${cerca.length ? `, y otros equipos con ${Math.min(...cerca.map(f => f.pj))} a ${Math.max(...cerca.map(f => f.pj))} partidos sin ganar están a su alrededor` : ''}` : ''}. Orden: PCT, diferencia, puntos a favor.${conZona ? ` Zonas del formato publicado: ${conZona}; el resto no tiene instancia declarada.` : ''}`;
    return card('Posición actual', `<div class="ci-scroll"><table class="ci-pos"><thead><tr>${cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${filas[i] === yo ? 'ci-yo' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${nota(txt)}`);
  }
  /* § Escenarios de rendimiento (no son proyección: con pocos partidos no se proyecta).
     Con la tabla final de la temporada anterior (`ctx.anterior`, la cargan la sección o el
     llamador) cada escenario dice en qué puesto habría terminado ese récord y en qué zona. */
  function cardEscenarios(X) {
    const F = (X.doc && X.doc.formato) || {};
    const total = F.partidosPorEquipo || null;
    const g = X.c.resultados.record.g, p = X.c.resultados.record.p;
    if (!total) return card('Escenarios de rendimiento (no son proyección)', vacio('El torneo no declara cuántos partidos juega cada equipo: sin eso no se arman escenarios.'));
    const quedan = Math.max(0, total - g - p);
    const A = X.anterior && Array.isArray(X.anterior.filas) && X.anterior.filas.length ? X.anterior : null;
    if (!A) {
      const filas = [0.71, 0.61, 0.50, 0.43].map((r) => { const w = Math.round(quedan * r); return [`${w} de ${quedan} (${Math.round(100 * r)} %)`, `${g + w}-${p + quedan - w}`, pc((g + w) / total, 0)]; });
      return card('Escenarios de rendimiento (no son proyección)', tabla(['Si gana…', 'Récord final', '% de victorias de la temporada'], filas)
        + nota(`Quedan ${quedan} de ${total} partidos. Para llegar al 50 % de victorias hay que ganar ${Math.max(0, Math.ceil(total / 2) - g)} de los ${quedan} que quedan. Sin la tabla de la temporada anterior no se ubica cada récord en un puesto. ${X.n} partidos no definen la temporada: definen cuánto margen queda.`));
    }
    const fa = A.filas.slice().sort((a, b) => b.pg - a.pg);
    const pgEn = pos => (fa[pos - 1] ? fa[pos - 1].pg : null);
    const ubica = (w) => { const arriba = fa.filter(f => f.pg > w).length, igual = fa.filter(f => f.pg === w).length; return igual ? { txt: `${arriba + 1}.º`, pos: arriba + 1 } : { txt: `entre ${arriba}.º y ${arriba + 1}.º`, pos: arriba + 1 }; };
    const fs = (F.fases || []).filter(f => f.directos || f.puestos);
    const dir = fs.find(f => f.directos), rec = fs.find(f => f.puestos);
    const mio = fa.find(f => X.e && clave(f.nombre) === X.e.clave);
    const borde = rec ? pgEn(rec.puestos[1]) : null;
    const objetivos = [dir ? pgEn(dir.directos[1]) : null, mio ? mio.pg : null, borde, esNum(borde) ? borde - 2 : null].filter(esNum)
      .map(w => w - g).filter(w => w >= 0 && w <= quedan);
    const ws = Array.from(new Set(objetivos)).sort((a, b) => b - a);
    const filas = ws.map((w) => { const u = ubica(g + w); const z = zonaDelFormato(X, u.pos);
      const extra = rec && u.pos >= rec.puestos[0] && u.pos <= rec.puestos[1] ? (u.pos >= rec.puestos[1] ? ', en el borde' : u.pos <= (rec.puestos[0] + rec.puestos[1]) / 2 ? ', mitad de tabla' : '') : '';
      return [`${w} de ${quedan} (${Math.round(100 * w / Math.max(1, quedan))} %)`, `${g + w}-${p + quedan - w}`, u.txt, esc(z === 'Fuera del formato' ? 'Fuera de zona' : z + extra)]; });
    const ref = `Quedan ${quedan} partidos. Referencia: la tabla final de ${esc(A.label || 'la temporada anterior')}, ${fa.length} equipos y ${total} partidos${mio ? ` (${esc(nombreEq(X))} terminó ${fa.indexOf(mio) + 1}.º con ${mio.pg}-${mio.pp})` : ''}. Sirve para dimensionar el esfuerzo, no para predecir.`;
    const conc = [mio ? `Para terminar como el año pasado hay que ganar ${Math.max(0, mio.pg - g)} de los ${quedan} que quedan (${Math.round(100 * Math.max(0, mio.pg - g) / Math.max(1, quedan))} %).` : '',
      esNum(borde) ? `Para llegar a la zona de ${rec ? String(rec.label).toLowerCase() : 'clasificación'}, el borde histórico pide un ${Math.round(100 * Math.max(0, borde - g) / Math.max(1, quedan))} % de victorias de acá en adelante.` : '',
      `${cap(['', 'un partido', 'dos partidos', 'tres partidos', 'cuatro partidos', 'cinco partidos'][X.n] || X.n + ' partidos')} no definen la temporada: definen cuánto margen queda.`].filter(Boolean).join(' ');
    return card('Escenarios de rendimiento (no son proyección)', `<p class="ci-sm">${ref}</p>${tabla(['Si gana…', 'Récord final', `Puesto con ese récord en ${A.temporada || 'la temporada anterior'}`, 'Zona del formato'], filas)}<p class="ci-lee">${conc}</p>`);
  }

  /* ============================================================ FIXTURE */

  /** El calendario del torneo, normalizado (si el archivo del torneo está cargado). */
  /* Fuente, en orden: el fixture VIVO de la liga (`doc.vivo`, trae sede y hora y
     publica las fechas que vienen) y, de respaldo, el calendario del archivo. */
  function calendario(X) {
    if (!X.doc || !X.e) return [];
    const mio = p => [p.local, p.visitante].some(x => clave(x) === X.e.clave);
    if (Array.isArray(X.doc.vivo) && X.doc.vivo.length) return X.doc.vivo.filter(mio);
    const F = (typeof SGADD_FIXTURE !== 'undefined') ? SGADD_FIXTURE : null;
    if (!F || !F.normalizarCalendario) return [];
    try { return (F.normalizarCalendario(X.doc) || []).filter(mio); } catch (e) { return []; }
  }
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  /* § Carga de calendario: fechas, condición, sede, descanso previo. */
  function cardCalendario(X) {
    const P = X.c.resultados.partidos;
    const cal = calendario(X);
    const filas = P.map((p, i) => { const f = X.filasEq.find(x => iso(x.__fecha) === p.fecha); const c0 = cal.find(x => x.fecha === p.fecha);
      return [dia(p.fecha), esc(p.rival), p.condicion === 'LOCAL' ? 'Local' : 'Visitante', esc((f && f.ESTADIO) || (c0 && (c0.sede || c0.cancha)) || '—'), i ? dias(P[i - 1].fecha, p.fecha) + ' días' : '—', `${p.final[0]}-${p.final[1]}`]; });
    const loc = P.filter(p => p.condicion === 'LOCAL').length;
    const net = (cond) => { const ps = porPartido(X).filter(x => (x.p.condicion === 'LOCAL') === cond && esNum(x.r.net)); return ps.length ? sum(ps, x => x.r.net) / ps.length : null; };
    /* La carga: la racha más apretada (partidos con 2 días o menos entre sí) y el descanso que la precedió. */
    let racha = [], mejor = [];
    P.forEach((p, i) => { if (i && dias(P[i - 1].fecha, p.fecha) <= 2) { if (!racha.length) racha = [P[i - 1]]; racha.push(p); } else racha = []; if (racha.length > mejor.length) mejor = racha.slice(); });
    const ini = mejor.length ? P.indexOf(mejor[0]) : -1;
    const cargaTxt = mejor.length >= 3 ? `${cap(['', '', 'dos', 'tres', 'cuatro'][mejor.length] || String(mejor.length))} partidos en ${dias(mejor[0].fecha, mejor[mejor.length - 1].fecha) + 1} días${mejor.every(p => p.condicion !== 'LOCAL') ? ', todos de visitante' : ''} (${mejor.map(p => dia(p.fecha)).join(', ')})${ini > 0 ? `, después de ${dias(P[ini - 1].fecha, mejor[0].fecha)} días de descanso` : ''}. ` : '';
    const nL = P.filter(p => p.condicion === 'LOCAL').length;
    return card('Carga de calendario', tabla(['Fecha', 'Rival', 'Cond.', 'Sede', 'Descanso previo', 'Marcador'], filas)
      + `<p class="ci-lee">${cargaTxt}El ciclo se jugó ${loc} ${loc === 1 ? 'vez' : 'veces'} de local y ${P.length - loc} de visitante.</p>`
      + nota(`Balance por condición: local NET ${sg(net(true))} (${nL} PJ); visitante ${sg(net(false))} (${P.length - nL} PJ). Con ${nL} y ${P.length - nL} partidos, ninguno de los dos números dice nada sobre la localía real.`));
  }
  /** El NET de un rival SIN su partido contra nosotros: promedio por partido de sus otras noches. */
  function netSinNosotros(X, e) {
    if (!e || !X.e) return null;
    const otros = (e.partidos || []).filter(p => !String(p.PARTIDO || '').toUpperCase().split(/\s+VS\s+/).some(s => clave(s) === X.e.clave));
    const v = otros.map((p) => { if (esNum(p['NET RTNG'])) return p['NET RTNG']; if (esNum(p['RTNG OFF']) && esNum(p['RTNG DEF'])) return p['RTNG OFF'] - p['RTNG DEF']; const pos = esNum(p.POS) ? p.POS : (p.PLAYS || 0) - (p.RO || 0); return pos && esNum(p.PTS) && esNum(p.PTSopp) ? 100 * (p.PTS - p.PTSopp) / pos : null; }).filter(esNum);
    return v.length ? { net: sum(v) / v.length, pj: v.length } : { net: null, pj: 0 };
  }
  /* § SOS · los rivales del ciclo: NET sin el partido contra nosotros, NET actual y puesto. */
  function cardSOS(X) {
    const rows = X.c.resultados.partidos.map((p) => { const rv = rivalEnLiga(X, p.rival); const sn = netSinNosotros(X, rv.e);
      return { p, e: rv.e, net: rv.net, puesto: rv.puesto, de: rv.de, sin: sn }; });
    const filas = rows.map(x => [esc(x.p.rival), x.sin ? x.sin.pj : '—', x.sin && esNum(x.sin.net) ? sg(x.sin.net) : '—', sg(x.net), x.puesto ? `${x.puesto}.º` : '—', x.e && x.e.record ? `${x.e.record.ganados}-${x.e.record.perdidos}` : '—']);
    const vs = rows.map(x => x.sin && x.sin.net).filter(esNum), m = X.metricas['NET RTNG'] && X.metricas['NET RTNG'].med;
    const top4 = rows.filter(x => x.puesto && x.puesto <= 4).length, mod = modeloLiga(X);
    const pjR = rows.map(x => x.sin && x.sin.pj).filter(esNum);
    const txt = vs.length ? `Promedio de NET de los ${rows.length} rivales sin contar el partido contra ${esc(nombreEq(X))}: ${sg(sum(vs) / vs.length)} contra una mediana de liga de ${sg(m)}. ${sum(vs) / vs.length > (m || 0) + 3 ? `En bruto, un ciclo duro${top4 >= 2 ? `: ${['', 'uno', 'dos', 'tres', 'cuatro'][top4]} de los ${rows.length} están hoy entre los 4 mejores NET` : ''}.` : 'Un calendario cercano a la media.'}${pjR.length ? ` Pero juegan entre ${Math.min(...pjR)} y ${Math.max(...pjR)} partidos` : ''}${mod && esNum(mod.sos) ? `: el modelo con encogimiento deja el ajuste por calendario ${Math.abs(mod.sos) < 1 ? 'casi neutro' : mod.sos > 0 ? 'a favor' : 'en contra'} (${sg(mod.sos)} de ORTG). Es un indicio.` : '.'}` : 'Sin el NET de los rivales en el libro.';
    return card(`SOS · los ${rows.length} rivales`, tabla(['Rival', `PJ sin ${nombreEq(X)}`, `NET sin ${nombreEq(X)} (prom. por partido)`, 'NET actual', 'Puesto NET', 'Récord'], filas) + `<p class="ci-lee">${txt}</p>`);
  }
  /* § Disponibilidad de planteles: estados cargados (propio), quién no sumó minutos y bajas del rival (no se suponen). */
  function cardDisponibilidad(X) {
    let txt = 'no hay estados cargados (lesión, suspensión, baja) en esta categoría.';
    try {
      const E = (typeof SGADD_ESTADOS !== 'undefined') ? SGADD_ESTADOS : null;
      const mapa = E && E.leerTodos ? E.leerTodos() : null;
      const marcados = mapa ? Object.keys(mapa).filter(k => mapa[k] && mapa[k].estado && mapa[k].estado !== 'ACTIVO') : [];
      if (marcados.length) txt = 'estados cargados: ' + marcados.map(k => `${esc(corto(k.split('|')[0]))} (${esc(mapa[k].estado)})`).join(', ') + '.';
    } catch (err) { /* sin estados */ }
    const sm = X.sinMin || [];
    return card('Disponibilidad de planteles', `<p><b>Propio:</b> ${txt}${sm.length ? ` ${esc(sm.map(corto).join(' y '))} figuran sin minutos en los ${X.n} partidos; no consta el motivo.` : ''}</p><p><b>Rival:</b> no hay registro de bajas de los ${X.n} oponentes cargado para este ciclo. No se hacen suposiciones.</p>`);
  }
  /* § Próximo ciclo: los siguientes partidos con la lectura del simulador (o el resultado, si ya se jugó). */
  function cardProximo(X) {
    const cal = calendario(X).filter(p => p.fecha > X.c.meta.hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(0, 4);
    if (!cal.length) return card('Próximo ciclo · los siguientes partidos', vacio('El calendario del torneo no está cargado o no publica los próximos partidos.'));
    const F = (typeof SGADD_4F !== 'undefined') ? SGADD_4F : null;
    const mod = modeloLiga(X);
    const filas = cal.map((p) => { const local = clave(p.local) === X.e.clave; const riv = local ? p.visitante : p.local;
      const jugado = esNum(p.ptsLocal) && esNum(p.ptsVisitante) && /FINAL/i.test(String(p.estado || 'FINAL'));
      let lec = '—';
      try { const r = F ? F.simularEnfrentamiento(X.idx, p.local, p.visitante) : null; if (r && r.ok !== false) { const m = local ? r.margen : -r.margen, pr = local ? r.confianza : 1 - r.confianza; lec = `${pr >= 0.58 ? 'Favorable' : pr <= 0.42 ? 'Cuesta arriba' : 'Parejo'} · margen ${sg(m)} · ${Math.round(100 * pr)} % de ganar`; } } catch (e) { lec = '—'; }
      if (jugado) { const pf = local ? p.ptsLocal : p.ptsVisitante, pcn = local ? p.ptsVisitante : p.ptsLocal; lec += ` · <b class="${pf > pcn ? 'pos' : 'neg'}">jugado: ${pf > pcn ? 'ganó' : 'perdió'} ${pf}-${pcn}</b>`; }
      const rv = rivalEnLiga(X, riv);
      return [`${dia(p.fecha)}${p.hora ? ' · ' + esc(p.hora) : ''}`, esc(riv), local ? 'Local' : 'Visitante', rv.net !== undefined && esNum(rv.net) ? `${sg(rv.net)}${rv.puesto ? ` (${rv.puesto}.º)` : ''}` : '—', lec]; });
    const todosL = cal.every(p => clave(p.local) === X.e.clave);
    const hca = mod && mod.mod && esNum(mod.mod.hca) ? mod.mod.hca : null;
    return card(`Próximo ciclo · los ${cal.length} siguientes partidos`, tabla(['Fecha', 'Rival', 'Cond.', 'NET actual (puesto)', 'Lectura del modelo'], filas)
      + nota(`${todosL ? `Los ${cal.length} son de local según el fixture publicado (sujeto a cambios de la liga). ` : 'Fixture sujeto a cambios de la liga. '}La lectura sale del simulador con ratings encogidos y localía de liga${esNum(hca) ? ` (${sg(hca)} pts)` : ''}, con la liga al cierre del ciclo: es orden de magnitud, no pronóstico.`));
  }
  /* § Ventanas de entrenamiento: días de práctica entre partidos. */
  function cardVentanas(X) {
    const prox = calendario(X).filter(p => p.fecha > X.c.meta.hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(0, 4);
    const seq = X.c.resultados.partidos.map(p => ({ fecha: p.fecha, rival: p.rival, cond: p.condicion === 'LOCAL' ? 'L' : 'V' }))
      .concat(prox.map(p => { const local = clave(p.local) === X.e.clave; return { fecha: p.fecha, rival: local ? p.visitante : p.local, cond: local ? 'L' : 'V', futuro: true }; }));
    const vt = seq.map((s, i) => { if (!i) return `<div class="ci-vt"><div class="ci-vd">${dia(s.fecha)}</div><div class="ci-vr">${esc(s.rival)} · ${s.cond}</div><div class="ci-vn">inicio</div></div>`;
      const libres = Math.max(0, dias(seq[i - 1].fecha, s.fecha) - 1), pr = Math.max(0, libres - 1);
      const tipo = pr >= 7 ? ['Bloque de instalación', 'pos'] : pr >= 3 ? ['Ajuste + 1 bloque', 'info'] : pr >= 1 ? ['Recuperación y scouting', 'warn'] : ['Sin práctica', 'neg'];
      return `<div class="ci-vt ${s.futuro ? 'jug' : ''}"><div class="ci-vd">${dia(s.fecha)}</div><div class="ci-vr">${esc(s.rival)} · ${s.cond}</div><div class="ci-vn ${tipo[1]}">${pr} días de práctica</div><div class="ci-vr">${libres} libres · ${tipo[0]}</div></div>`; }).join('');
    /* La síntesis para el cuerpo técnico: cuánto hay hasta el próximo partido, cuál es la ventana grande y qué cabe en cada una. */
    const hoy = X.hoy || X.c.meta.hasta, fut = seq.filter(x => x.futuro), sint = [];
    if (fut.length) { const pr0 = Math.max(0, dias(hoy, fut[0].fecha) - 1);
      sint.push(`Al cierre del ciclo hay ${pr0} día${pr0 === 1 ? '' : 's'} de práctica hasta el partido del ${dia(fut[0].fecha)}: ${pr0 <= 2 ? 'espacio para ajustes de bajo costo (balance defensivo tras tiro, cierre de ala), no para cambiar el dibujo' : 'alcanza para un bloque de trabajo'}.`);
      const vent = fut.map((x, i) => ({ x, pr: Math.max(0, dias(i ? fut[i - 1].fecha : seq[seq.indexOf(x) - 1].fecha, x.fecha) - 2) }));
      const grande = vent.slice(1).sort((a, b) => b.pr - a.pr)[0];
      if (grande && grande.pr >= 5) sint.push(`La ventana grande es ${grande === vent[1] ? 'la siguiente' : 'la del ' + dia(grande.x.fecha)}: ${grande.pr} días de práctica antes del ${dia(grande.x.fecha)}. Ahí caben los trabajos de más costo${zonaFria(X) ? `: dibujo de ${zonaFria(X).zona} y selección de tiro` : ''}.`);
      const ult = vent.slice(-2).filter(v => v !== grande);
      if (ult.length >= 1 && vent.length >= 3) sint.push(`Las ${ult.length === 2 ? 'dos últimas ventanas' : 'última ventana'} (${ult.map(v => v.pr).join(' y ')} días) permite${ult.length === 2 ? 'n' : ''} repetir y consolidar antes de medir el ciclo ${X.c.meta.numero + 1}.`); }
    return card('Ventanas de entrenamiento · días entre partidos', `<div class="ci-vts">${vt}</div>${sint.length ? `<ul class="ci-lista">${sint.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}${nota('Días libres = días corridos entre un partido y el siguiente, sin contar los de juego. Práctica = libres menos 1 (la recuperación). 7 o más: bloque de instalación; 3 a 6: ajuste más un bloque; 1 o 2: recuperación y scouting; ninguno: sin práctica. Las casillas azules son los partidos que vienen.')}`);
  }

  /* ============================================================ PLAN */

  /** Las metas del ciclo siguiente: cada una con su base, su cambio y su valor en puntos. */
  /** Las metas del PLAN (lo que se le pide al ciclo siguiente), con el criterio del Artifact:
        · el juego armado (la franja con más tiros), la zona propia más fría, las pérdidas y el
          T3% propio se llevan a la LIGA;
        · la defensa en transición se lleva a la liga;
        · la defensa del juego armado, a la MITAD del camino, porque se solapa con el triple de
          ala del rival (que por eso no entra a la tabla: se dice en la nota).
      El tablero mide, en cambio, la meta real (mitad del camino) de cada indicador. */
  function metas(X) {
    const out = [], R = X.reloj, L = X.paq.liga && X.paq.liga.reloj, MR = metasReales(X);
    if (R.con && L && L.f) {
      const k = R.favor.f.map(x => x[0]).indexOf(Math.max(...R.favor.f.map(x => x[0])));
      const x = R.favor.f[k], lp = pptDe(L.f[k]), p = pptDe(x), t = ['Ataque en transición (0-7 s)', 'Ataque armado (8-17 s)', 'Final del reloj (18-24 s)'][k];
      if (esNum(p) && esNum(lp) && p < lp) out.push({ lado: 'Ataque', meta: `${t}: de ${n(p, 2)} a ${n(lp, 2)} pts/tiro (la liga)`, cambio: sg(lp - p, 2) + ' pts/tiro', pts: (lp - p) * x[0] / X.n, base: `${Math.round(x[0] / X.n)} tiros por partido en esa franja` });
      const xa = R.contra.f[1], la = pptDe(L.f[1]), pa = pptDe(xa);
      if (esNum(pa) && esNum(la) && pa > la) { const m = pa - MITAD * (pa - la); out.push({ lado: 'Defensa', meta: `Defensa en juego armado (8-17 s): de ${n(pa, 2)} a ${n(m, 2)} pts/tiro concedido`, cambio: sg(m - pa, 2) + ' pts/tiro', pts: (pa - m) * xa[0] / X.n, base: `${Math.round(xa[0] / X.n)} tiros rivales por partido` }); }
    }
    if (MR.trans) out.push({ lado: 'Defensa', meta: `Defensa en transición (0-7 s): de ${n(MR.trans.base, 2)} a ${n(MR.trans.liga, 2)} (liga)`, cambio: sg(MR.trans.liga - MR.trans.base, 2), pts: (MR.trans.base - MR.trans.liga) * transicion(X).tiros / X.n, base: `${Math.round(transicion(X).tiros / X.n)} tiros por partido` });
    const zf = zonaFria(X);
    if (zf) out.push({ lado: 'Ataque', meta: `${cap(NOMBRE_ZONA[zf.zona])} (${zf.zona}): de ${n(zf.ppt, 2)} a ${n(zf.ligaPpt, 2)} pts/tiro o menos volumen`, cambio: sg(zf.ligaPpt - zf.ppt, 2), pts: (zf.ligaPpt - zf.ppt) * zf.i / X.n, base: `${n(zf.i / X.n, 1)} tiros por partido` });
    const P = (X.A && X.A.P) || {}, M = X.metricas;
    if (M['PePP%'] && esNum(M['PePP%'].valor) && esNum(M['PePP%'].med) && M['PePP%'].valor > M['PePP%'].med) { const a = M['PePP%'].valor, meta = M['PePP%'].med; const g = ganancia('PePP%', a, meta, P);
      if (esNum(g) && g > 0.1) out.push({ lado: 'Ataque', meta: `Pérdidas: de ${pc(a)} a ${pc(meta)} (la liga)`, cambio: sg((meta - a) * 100) + ' pp', pts: g, base: `cada jugada perdida vale ~${n(M.PPP.med, 2)} pts` }); }
    if (M['T3%'] && esNum(M['T3%'].valor) && esNum(M['T3%'].med) && M['T3%'].valor < M['T3%'].med && esNum(P.T3I)) { const a = M['T3%'].valor, meta = M['T3%'].med; out.push({ lado: 'Ataque', meta: `Triple propio: acercar el T3% a la liga (${pc(a)} a ${pc(meta)})`, cambio: sg((meta - a) * 100) + ' pp', pts: (meta - a) * 3 * P.T3I, base: 'normalización del acierto con el mismo volumen' }); }
    return out.filter(m => esNum(m.pts) && m.pts > 0.05);
  }
  /** La identidad en palabras (los ejes claros del ataque): «rápido, perimetral, agresivo en el rebote ofensivo». */
  function identidadCorta(X) {
    const M = X.metricas, out = [];
    if (M.PACE && esNum(M.PACE.pct) && M.PACE.pct >= 70) out.push('rápido'); else if (M.PACE && esNum(M.PACE.pct) && M.PACE.pct < 30) out.push('pausado');
    if (M['PT3%'] && esNum(M['PT3%'].pct) && M['PT3%'].pct >= 70) out.push('perimetral'); else if (M['PT3%'] && esNum(M['PT3%'].pct) && M['PT3%'].pct < 30) out.push('interior');
    if (M['RO%'] && esNum(M['RO%'].pct) && M['RO%'].pct >= 70) out.push('agresivo en el rebote ofensivo');
    return out;
  }
  /* § Plan de intervención: responsabilidad ataque/defensa, metas y escenarios con solape. */
  function cardPlan(X) {
    const ms = metas(X), num = X.c.meta.numero + 1;
    if (!ms.length) return card(`Plan de intervención · metas para el Ciclo ${num}`, vacio('El ciclo no deja metas que se separen de la liga.'));
    const A = sum(ms.filter(m => m.lado === 'Ataque'), m => m.pts), D = sum(ms.filter(m => m.lado === 'Defensa'), m => m.pts), T = A + D;
    const margen = X.c.resultados.puntos.dif / X.n, MR = metasReales(X), idn = identidadCorta(X);
    const prox = calendario(X).filter(p => p.fecha > X.c.meta.hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(0, 4);
    const enCasa = prox.length && X.e && prox.every(p => clave(p.local) === X.e.clave);
    const foco = [MR.efgo ? 'el eFG permitido' : '', MR.armado ? 'el juego armado' : '', !MR.efgo && MR.fria ? `la zona ${MR.fria.zona}` : ''].filter(Boolean);
    return card(`Plan de intervención · metas para el Ciclo ${num}`, `<p class="ci-lead">El plan no cambia la identidad${idn.length ? ` (${idn.join(', ')})` : ''}: ajusta la ejecución dentro de ese libreto. No todo pesa igual:</p>
      <p class="ci-sm">Responsabilidad según las metas de la tabla.${MR.t3r ? ` La defensa pesa más de lo que muestra la barra: el triple de ala del rival (hasta ${sg(MR.t3r.pts)} pts con la meta real) se solapa con la defensa del juego armado.` : ''}</p>
      <div class="ci-resp"><div class="ci-rA" style="--w:${Math.max(8, 100 * A / T).toFixed(0)}%"><b>Ataque ${Math.round(100 * A / T)} %</b> · ${sg(A)} pts</div><div class="ci-rD" style="--w:${Math.max(8, 100 * D / T).toFixed(0)}%"><b>Defensa ${Math.round(100 * D / T)} %</b> · ${sg(D)} pts</div></div>
      ${tabla(['Lado', 'Meta táctica', 'Cambio', 'Pts por partido', 'Base'], ms.map(m => [`<span class="ci-chip ${m.lado === 'Defensa' ? 'pos' : 'info'}">${m.lado}</span>`, esc(m.meta), esc(m.cambio), `<b class="pos">${sg(m.pts)}</b>`, esc(m.base)]))}
      <p class="ci-lee">Las metas se solapan entre sí: sumarlas da ${sg(T)} pts por partido, y un escenario prudente es la mitad (${sg(T * SOLAPE)}). Desde un margen de ${sg(margen)}, eso lo deja en torno a ${sg(margen + T * SOLAPE)} sin contar la localía de ${enCasa ? `los próximos ${['', 'un', 'dos', 'tres', 'cuatro'][prox.length] || prox.length} partidos en casa` : 'los próximos partidos'}.${margen < 0 && margen + T * SOLAPE < 0 ? ` El Ciclo ${num} es un ciclo de cierre de brecha` : ` El Ciclo ${num} es un ciclo para convertir el proceso en victorias`}: el objetivo medible es mover ${foco.length ? foco.join(' y ') : 'los indicadores del tablero'}, no prometer victorias.</p>`);
  }
  /* § Tablero de control: base del ciclo, meta real (mitad del camino) y umbral de alerta.
     Alerta: en la defensa, el punto medio entre la base y la meta; en el ataque, la base. */
  function cardTablero(X) {
    const MR = metasReales(X), num = X.c.meta.numero, filas = [];
    const p2 = v => n(v, 2), mid = (a, b) => (a + b) / 2;
    if (MR.efgo) filas.push(['Defensa', 'eFG% permitido', pc(MR.efgo.base), pc(MR.efgo.meta), `sobre ${pc(MR.efgo.base)} se enciende la alerta`]);
    if (MR.t3r) filas.push(['Defensa', 'Triple del rival', pc(MR.t3r.base), pc(MR.t3r.meta), `sobre ${pc(mid(MR.t3r.base, MR.t3r.meta), 0)}`]);
    if (MR.trans) filas.push(['Defensa', 'Rival en 0-7 s (pts/tiro)', p2(MR.trans.base), p2(MR.trans.meta), `sobre ${p2(mid(MR.trans.base, MR.trans.meta))}`]);
    if (MR.fria) filas.push(['Ataque', `${MR.fria.zona} (pts/tiro)`, p2(MR.fria.base), p2(MR.fria.meta), `bajo ${p2(MR.fria.base)}`]);
    if (MR.cortos) filas.push(['Ataque', 'Dobles cortos (pts/tiro)', p2(MR.cortos.base), p2(MR.cortos.meta), `bajo ${p2(MR.cortos.base)}`]);
    if (MR.armado) filas.push(['Ataque', 'Ataque armado 8-17 s (pts/tiro)', p2(MR.armado.base), p2(MR.armado.meta), `bajo ${p2(MR.armado.base)}`]);
    if (MR.cuarto) filas.push(['Ataque', `${MR.cuarto.cuarto}.${MR.cuarto.cuarto === 3 ? 'er' : 'º'} cuarto: puntos propios`, `${MR.cuarto.base} en ${X.n} partidos`, `${MR.cuarto.meta} en ${X.n} partidos`, `bajo ${MR.cuarto.base}`]);
    const crit = X.jug.filter(j => semaforo(j, X.mPPP, X.mTS).id === 'critico' && j.min >= 14);
    if (crit.length) { const ppp = sum(crit, j => j.PTS) / Math.max(1, sum(crit, j => j.PLAYS)); filas.push(['Ataque', `PPP ponderado de los jugadores en Crítico (${esc(crit.map(j => corto(j.nombre)).join(', '))})`, p2(ppp), p2(ppp + MITAD * (X.mPPP - ppp)), `sin mejora sobre ${p2(ppp)}`]); }
    if (!filas.length) return '';
    return card(`Tablero de control · qué se mide en el Ciclo ${num + 1}`, tabla(['Lado', 'Indicador', `Base Ciclo ${num}`, 'Meta real', 'Alerta'], filas) + nota(`Cada meta es la mitad del camino hasta la liga (o hasta el escalón siguiente del panel). Si el ciclo ${num + 1} llega a la meta, el indicador pasa de quiebre a ajuste; si además la supera, de ajuste a fortaleza. Con ${X.n} partidos, una meta cumplida es un indicio.`));
  }
  /* § Qué esperar en el ciclo siguiente: si se gana, si se pierde, lo que no cambia. */
  function cardEsperar(X) {
    const M = X.metricas, MR = metasReales(X), num = X.c.meta.numero + 1;
    const BASE = { 'RO%': 'el rebote ofensivo', 'PP Opp%': 'las pérdidas forzadas', 'RD%': 'el rebote defensivo', 'RO Opp%': 'el box-out', 'RTL Opp%': 'la defensa sin falta' };
    const base = ['RO%', 'PP Opp%', 'RD%', 'RO Opp%'].map(k => M[k]).filter(m => m && esNum(m.pct) && m.pct >= 80).slice(0, 2).map(m => BASE[m.k]);
    const rtl = M['RTL%'];
    const sumar = ['segundas oportunidades'].concat(rtl && esNum(rtl.pct) && rtl.pct < 40 ? [`llegada a la línea (${fmt('RTL%', rtl.valor)} contra ${fmt('RTL%', rtl.med)})`] : []);
    const funciona = [M['RO%'] && M['RO%'].pct >= 70 ? 'cristal' : '', M['PP Opp%'] && M['PP Opp%'].pct >= 70 ? 'robos' : ''].filter(Boolean);
    const aro = zonasSum(X.c.zonas.contra || [], ['Z1']), lAro = ((X.paq.liga && X.paq.liga.zonas) || []).find(z => z.zona === 'Z1');
    if (aro.i && lAro && lAro.i && aro.c / aro.i <= lAro.c / lAro.i + 0.02) funciona.push('protección del aro');
    const proceso = [MR.efgo ? 'eFG permitido' : '', MR.fria ? MR.fria.zona : '', MR.cuarto ? `el ${MR.cuarto.cuarto}.${MR.cuarto.cuarto === 3 ? 'er' : 'º'} cuarto` : ''].filter(Boolean);
    const idn = identidadCorta(X);
    const noCambia = ['Ritmo', 'volumen'].concat(idn.includes('perimetral') ? ['perímetro'] : idn.includes('interior') ? ['juego interior'] : ['estilo']);
    return card(`Qué esperar en el Ciclo ${num}`, `<div class="ci-grid3"><div class="ci-zc pos"><div class="ci-zh">▲ Si se gana</div><p>Ampliar la ventaja: ${base.length ? base.join(' y ') + ' son la base' : 'lo que hoy está sobre la liga es la base'}; sumar ${sumar.join(' y ')}.</p></div>
      <div class="ci-zc neg"><div class="ci-zh">▼ Si se pierde</div><p>Achicar la diferencia con lo que ya funciona${funciona.length ? ` (${funciona.join(', ')})` : ''} y mirar el proceso: ${proceso.length ? proceso.join(', ').replace(/, ([^,]*)$/, ' y $1') : 'los indicadores del tablero'}, antes que el marcador.</p></div>
      <div class="ci-zc info"><div class="ci-zh">◆ Lo que no cambia</div><p>${noCambia.slice(0, -1).join(', ')} y ${noCambia[noCambia.length - 1]}. El ajuste es de selección y de balance, no de identidad.</p></div></div>`);
  }
  /* § Reglas de lectura del informe y la firma de los datos. */
  function cardReglas(X) {
    const pjs = (X.idx.lista ? X.idx.lista() : []).map(e => e.pj).filter(esNum);
    const loc = X.c.resultados.partidos.filter(p => p.condicion === 'LOCAL').length;
    const fecha = X.hoy ? `${X.hoy.slice(8, 10)}/${X.hoy.slice(5, 7)}/${X.hoy.slice(0, 4)}` : '';
    const libro = (X.paq && X.paq.etiqueta) || 'el libro de la categoría';
    return card('Reglas de lectura de este informe', `<ul class="ci-lista"><li>Ciclo ${X.c.meta.numero}${X.c.meta.numero === 0 ? ' = línea base. No hay ciclo anterior: no se informan tendencias, solo posición contra la mediana y el puesto de la liga.' : ': se compara contra la liga y contra el ciclo anterior en la pestaña Principal (auditoría).'}</li>
      <li>Muestra: ${X.n} partidos de ${esc(nombreEq(X))} (${loc} local, ${X.n - loc} visitante)${pjs.length ? ` contra una liga de ${pjs.length} equipos con ${Math.min(...pjs)} a ${Math.max(...pjs)} partidos` : ''}. Todo percentil y puesto es provisional.</li>
      <li>La liga se mide al cierre del ciclo (con los partidos jugados hasta el ${dia(X.c.meta.hasta)}): un ciclo cerrado no cambia cuando la liga sigue jugando.</li>
      <li>Ratings (ORTG, DRTG, NET) por 100 posesiones; PPP por jugada; pts/tiro por intento de campo.</li><li>Los puntos por partido de las metas son diferenciales contra la liga, no pronósticos.</li>
      <li>Fuente: ${esc(libro)}, play-by-play validado de los ${X.n} partidos${calendario(X).length ? ' y fixture publicado por la liga' : ''}${fecha ? ` al ${fecha}` : ''}.</li></ul>
      ${fecha ? `<p class="ci-firma">Elaborado con los datos de MotorStats AR al ${fecha}. Ciclo ${X.c.meta.numero}${X.c.meta.numero === 0 ? ' = línea base; cada ciclo siguiente se compara contra este y contra la liga.' : '; se compara contra el ciclo anterior y contra la liga.'}</p>` : ''}`);
  }

  /* ===================================================== RENDER */

  function html(modelo, seccion) {
    if (!modelo || !modelo.ok) return '';
    const cards = (modelo.secciones[seccion] || []).map((f) => { try { return f(modelo.contexto); } catch (err) { return `<div class="ci-card"><p class="ci-vacio">Esta card no se pudo armar (${esc(err && err.message)}).</p></div>`; } }).join('');
    asegurarEstilo();
    return `<div class="ci">${cards}</div>`;
  }

  /* ---- el estilo: tokens del Artifact, en el tema oscuro del panel y con su variante de papel ---- */
  const CSS = `.ci-sint{margin:8px 0 0;font-size:13px;line-height:1.45}.ci-quien{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-size:12px}.ci-quien span{display:inline-flex;align-items:center;gap:5px}.ci-pmh{display:flex;align-items:center;gap:8px;margin-bottom:6px}.ci-firma{margin-top:10px;font-size:12px;font-style:italic;opacity:.8}.ci-pos tr.ci-yo td{font-weight:700;background:rgba(122,180,255,.10)}.ci{--ci-card:#0f1c33;--ci-line:#22345a;--ci-fg:#e8eef9;--ci-mut:#93a4c2;--ci-pos:#4ade80;--ci-posbg:#0f3a2a;--ci-neg:#f87171;--ci-negbg:#3d1620;--ci-info:#7ab4ff;--ci-infobg:#122c52;--ci-warn:#fbbf24;--ci-warnbg:#3a2c0a;color:var(--ci-fg);font-family:Barlow,system-ui,sans-serif;display:grid;gap:12px}
.ci h3{font:700 17px/1.2 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px}.ci h4{font:700 14px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px}.ci h5{font:700 13px 'Barlow Condensed',sans-serif;text-transform:uppercase;margin:6px 0}
.ci h4.pos,.ci h5.pos,.ci .pos{color:var(--ci-pos)}.ci h4.neg,.ci h5.neg,.ci .neg{color:var(--ci-neg)}.ci h4.warn{color:var(--ci-warn)}.ci h5.info{color:var(--ci-info)}
.ci-card{background:var(--ci-card);border:1px solid var(--ci-line);padding:16px;border-radius:6px;min-width:0}.ci-card.eje.azul{border-top:4px solid var(--ci-info)}.ci-card.eje.verde{border-top:4px solid var(--ci-pos)}.ci-card.eje.rojo{border-top:4px solid var(--ci-neg)}
.ci-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:12px}.ci-grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}
.ci-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0}.ci-tiles.t2{grid-template-columns:repeat(2,minmax(0,1fr))}.ci-tiles.t4{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.ci-tile{padding:8px 10px;border:1px solid var(--ci-line);min-width:0}.ci-tile.pos{background:var(--ci-posbg);border-color:var(--ci-pos)}.ci-tile.neg{background:var(--ci-negbg);border-color:var(--ci-neg)}.ci-tile.info{background:var(--ci-infobg);border-color:var(--ci-info)}.ci-tile.warn{background:var(--ci-warnbg);border-color:var(--ci-warn)}
.ci-tl{font:600 11px 'Barlow Condensed',sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--ci-mut)}.ci-tv{font:800 24px/1.1 'Barlow Condensed',sans-serif;font-variant-numeric:tabular-nums}.ci-tile.pos .ci-tv{color:var(--ci-pos)}.ci-tile.neg .ci-tv{color:var(--ci-neg)}.ci-tile.info .ci-tv{color:var(--ci-info)}.ci-tile.warn .ci-tv{color:var(--ci-warn)}
.ci-gl{font-size:13px;margin-right:5px}.ci-ts{font-size:11.5px;color:var(--ci-mut);line-height:1.3;margin-top:2px}.ci-lead{font-size:15.5px;line-height:1.5;max-width:80ch;margin:0}.ci-lee{border-left:3px solid var(--ci-info);padding:4px 0 4px 10px;margin:10px 0 0;font-size:14px}
.ci-nota{font-size:12px;color:var(--ci-mut);margin:10px 0 0;max-width:95ch}.ci-mut{color:var(--ci-mut)}.ci-sm{font-size:12px}.ci-vacio{font-size:13px;color:var(--ci-mut);margin:4px 0}.ci-lista{padding-left:18px;margin:6px 0;font-size:13px}.ci-lista li{margin:5px 0}
.ci-scroll{overflow-x:auto;margin-top:8px}.ci table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}.ci th{font:700 11px 'Barlow Condensed',sans-serif;letter-spacing:.07em;text-transform:uppercase;color:var(--ci-mut);text-align:left;border-bottom:2px solid var(--ci-line);padding:6px 8px;white-space:nowrap}.ci td{padding:6px 8px;border-bottom:1px solid var(--ci-line);vertical-align:top;text-align:left}
.ci-chip{display:inline-block;font:600 11px 'Barlow Condensed',sans-serif;letter-spacing:.04em;text-transform:uppercase;padding:2px 8px;border:1px solid}.ci-chip.pos{color:var(--ci-pos);background:var(--ci-posbg)}.ci-chip.neg{color:var(--ci-neg);background:var(--ci-negbg)}.ci-chip.info{color:var(--ci-info);background:var(--ci-infobg)}.ci-chip.warn{color:var(--ci-warn);background:var(--ci-warnbg)}
.ci-rutas{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px;margin-top:12px}.ci-rt{border:1px solid var(--ci-line);border-top:4px solid var(--ci-info);padding:10px 12px;min-width:0}.ci-rt.pos{border-top-color:var(--ci-pos)}.ci-rt.neg{border-top-color:var(--ci-neg)}.ci-rt.warn{border-top-color:var(--ci-warn)}
.ci-rh{font:700 13px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.06em}.ci-rt.pos .ci-rh{color:var(--ci-pos)}.ci-rt.neg .ci-rh{color:var(--ci-neg)}.ci-rt.warn .ci-rh{color:var(--ci-warn)}.ci-rt.info .ci-rh{color:var(--ci-info)}.ci-rb{font-size:13px;margin-top:4px}.ci-rm{margin-top:8px;font-size:12px;font-weight:600;border-top:1px dashed var(--ci-line);padding-top:6px}
.ci-pcard{border:1px solid var(--ci-line);border-left:4px solid var(--ci-info);padding:8px 10px}.ci-pcard.pos{border-left-color:var(--ci-pos)}.ci-pcard.neg{border-left-color:var(--ci-neg)}.ci-pcard h4{margin:0 0 4px}.ci-pcard p{margin:3px 0;font-size:12.5px}
.ci-court{max-width:440px;margin:0 auto}.ci-ley{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--ci-mut);margin-top:6px;justify-content:center}.ci-ley span{display:inline-flex;align-items:center;gap:5px}.ci-lg{display:inline-block;width:14px;height:10px}.ci-lg.pos{background:#16a34a}.ci-lg.neg{background:#dc2626}
.ci-zcs{display:grid;gap:8px;margin-top:8px}.ci-zc{border:1px solid var(--ci-line);border-left:4px solid var(--ci-info);padding:8px 10px;min-width:0}.ci-zc.pos{border-left-color:var(--ci-pos)}.ci-zc.neg{border-left-color:var(--ci-neg)}.ci-zc.warn{border-left-color:var(--ci-warn)}.ci-zh{font:700 13px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.05em}.ci-zc p{margin:4px 0;font-size:12.5px}
.ci-mini>div,.ci-mins .ci-mr,.ci-punt .ci-pb{display:grid;grid-template-columns:110px 1fr 90px;gap:8px;align-items:center;margin:4px 0;font-size:12.5px}.ci-mini i,.ci-mins i,.ci-punt i{display:block;height:9px;background:linear-gradient(90deg,var(--ci-info) var(--w),var(--ci-line) var(--w))}.ci-mini b,.ci-mins b,.ci-punt b{text-align:right}.ci-mins .ci-mr{grid-template-columns:130px 1fr 50px}
.ci-stack{display:flex;height:30px;margin:6px 0;gap:2px}.ci-stack i{flex:0 0 var(--w);display:flex;align-items:center;justify-content:center;font-style:normal;min-width:0}.ci-stack i b{font:700 12px 'Barlow Condensed',sans-serif;color:#fff}.ci-stack .s0{background:#1d5fb4}.ci-stack .s1{background:#0e7a4f}.ci-stack .s2{background:#b4232c}
.ci-frs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.ci-frc,.ci-pm{border:1px solid var(--ci-line);padding:8px;min-width:0}.ci-pmaps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.ci-pm h4{margin-top:0}
.ci-av{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--ci-line) center top/cover no-repeat;border:2px solid var(--ci-card);vertical-align:middle;margin-right:6px;flex:none;font:700 12px 'Barlow Condensed',sans-serif;color:var(--ci-mut)}.ci-av.lg{width:46px;height:46px;margin-right:0}.ci-avs{display:inline-flex;vertical-align:middle;padding-right:9px}.ci-avs .ci-av{margin-right:-9px;width:26px;height:26px}
.ci-cbs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}.ci-cb{border:1px solid var(--ci-line);padding:8px 10px;margin-bottom:8px}.ci-cb.pos{border-left:4px solid var(--ci-pos)}.ci-cb.neg{border-left:4px solid var(--ci-neg)}.ci-cb.info{border-left:4px solid var(--ci-info)}.ci-ch{display:flex;align-items:center;gap:10px}.ci-cn{display:flex;gap:10px;font-size:12.5px;margin:6px 0;flex-wrap:wrap}.ci-cb p{margin:2px 0;font-size:12px}
.ci-q5{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:8px}.ci-q{border:1px solid var(--ci-line);border-top:4px solid var(--ci-info);padding:8px 10px;font-size:12.5px;min-width:0}.ci-q.pos{border-top-color:var(--ci-pos)}.ci-q.neg{border-top-color:var(--ci-neg)}.ci-q.warn{border-top-color:var(--ci-warn)}.ci-q p{margin:4px 0}
.ci-duo{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px;margin:10px 0}.ci-lado{border:1px solid var(--ci-line);padding:10px 12px;min-width:0}.ci-lado.atk{border-top:4px solid var(--ci-info)}.ci-lado.def{border-top:4px solid var(--ci-pos)}.ci-lh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px}.ci-lt{font:800 20px 'Barlow Condensed',sans-serif;letter-spacing:.08em}
.ci-pr{display:grid;grid-template-columns:150px 60px 1fr;gap:3px 8px;align-items:center;font-size:12.5px;margin:5px 0}.ci-pr em{grid-column:2/-1;font-style:normal;font-size:11px;color:var(--ci-mut);margin-top:-3px}
.ci-bar{display:block;height:9px;min-width:40px;background:linear-gradient(90deg,var(--ci-info) var(--w),var(--ci-line) var(--w))}.ci-bar.pos{background:linear-gradient(90deg,var(--ci-pos) var(--w),var(--ci-line) var(--w))}.ci-bar.neg{background:linear-gradient(90deg,var(--ci-neg) var(--w),var(--ci-line) var(--w))}.ci-bar.warn{background:linear-gradient(90deg,var(--ci-warn) var(--w),var(--ci-line) var(--w))}
.ci-ident{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:10px}.ci-big{font:800 26px 'Barlow Condensed',sans-serif;color:var(--ci-info)}
.ci svg{width:100%;height:auto;max-width:100%}.ci-ref{stroke:var(--ci-mut);stroke-dasharray:4 4}.ci-ax{font:11px Barlow,sans-serif;fill:var(--ci-mut)}.ci-dl{font:600 10.5px Barlow,sans-serif;fill:var(--ci-fg)}.ci-ring{stroke-width:3;stroke:var(--ci-mut)}.ci-ring.pos{stroke:var(--ci-pos)}.ci-ring.warn{stroke:var(--ci-warn)}.ci-ring.neg{stroke:var(--ci-neg)}
.ci-qz{stroke:none}.ci-qz.tl{fill:var(--ci-infobg);opacity:.5}.ci-qz.tr{fill:var(--ci-posbg);opacity:.55}.ci-qz.bl{fill:var(--ci-warnbg);opacity:.5}.ci-qz.br{fill:var(--ci-negbg);opacity:.55}.ci-qt{font:700 10px 'Barlow Condensed',sans-serif;letter-spacing:.07em;fill:var(--ci-fg)}
.ci-jcs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:12px;margin-top:8px}.ci-jc{border:1px solid var(--ci-line);border-top:4px solid var(--ci-info);padding:10px 12px;min-width:0}.ci-jc.pos{border-top-color:var(--ci-pos)}.ci-jc.warn{border-top-color:var(--ci-warn)}.ci-jc.neg{border-top-color:var(--ci-neg)}.ci-jh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ci-jh .ci-chip{margin-left:auto}.ci-jt .ci-tv{font-size:20px}.ci-tri{padding-left:18px;margin:8px 0 0;font-size:12.5px}.ci-tri li{margin:4px 0}
.ci-mv .ci-mvr{display:grid;grid-template-columns:1fr auto 1fr auto;gap:10px;align-items:center;border-bottom:1px solid var(--ci-line);padding:6px 0;font-size:13px}.ci-fl{color:var(--ci-mut);font-size:12px}
.ci-vts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.ci-vt{border:1px solid var(--ci-line);padding:8px}.ci-vt.jug{background:var(--ci-infobg)}.ci-vd{font:800 18px 'Barlow Condensed',sans-serif}.ci-vr{font-size:11.5px}.ci-vn{font-size:17px;font-family:'Barlow Condensed',sans-serif;margin-top:4px}.ci-vn.pos{color:var(--ci-pos)}.ci-vn.info{color:var(--ci-info)}.ci-vn.warn{color:var(--ci-warn)}.ci-vn.neg{color:var(--ci-neg)}
.ci-resp{display:flex;gap:2px;margin:8px 0;font-size:13px}.ci-rA{flex:0 0 var(--w);background:var(--ci-infobg);border:1px solid var(--ci-info);padding:6px 8px;min-width:0}.ci-rD{flex:0 0 var(--w);background:var(--ci-posbg);border:1px solid var(--ci-pos);padding:6px 8px;min-width:0}
@media screen and (max-width:560px){.ci-pr{grid-template-columns:104px 52px 1fr}.ci-mv .ci-mvr{grid-template-columns:1fr}.ci-resp{flex-direction:column}.ci-rA,.ci-rD{flex:none}}
@media print{.ci{--ci-card:#fff;--ci-line:#cbd5e1;--ci-fg:#0f1b2e;--ci-mut:#475569;--ci-pos:#0e7a4f;--ci-posbg:#dff3ea;--ci-neg:#b4232c;--ci-negbg:#fbe4e4;--ci-info:#1d5fb4;--ci-infobg:#e1ecfa;--ci-warn:#8a5a06;--ci-warnbg:#fbf0d5}.ci *{print-color-adjust:exact;-webkit-print-color-adjust:exact}.ci-card{break-inside:avoid}}`;
  function asegurarEstilo() {
    if (typeof document === 'undefined' || document.getElementById('ci-estilo')) return;
    const s = document.createElement('style'); s.id = 'ci-estilo'; s.textContent = CSS; document.head.appendChild(s);
  }

  return { armar, html, ubicar, rotacion, porPeriodo, relojDelCiclo, jugadoresDelCiclo, semaforo, metas, corto, puntosEntre, CSS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CICLOINFORME;
