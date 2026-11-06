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
    return { valor, med: V.med, puesto: mejores + 1, de: V.dist.length, pct: Math.round(100 * peores / Math.max(1, V.dist.length - 1)) };
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
        (r.f || []).forEach((x, i) => { if (i < 3) for (let j = 0; j < 3; j++) out[l].f[i][j] += x[j] || 0; });
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
    const out = [];
    mapa.forEach((filas) => {
      const mias = (filas || []).filter(f => clave(f.EQUIPO) === e.clave && fechas.has(iso(f.__fecha)));
      if (!mias.length) return;
      const t = { nombre: mias[0].NOMBRES, equipo: mias[0].EQUIPO, pj: mias.filter(f => (f.MIN || 0) > 0).length };
      CUENTAS.forEach(k => { t[k] = sum(mias, f => esNum(f[k]) ? f[k] : 0); });
      if (!t.MIN) return;
      t.min = t.MIN / Math.max(1, t.pj);
      t.TCI = t.T2I + t.T3I; t.TCC = t.T2C + t.T3C;
      t.ppp = div(t.PTS, t.PLAYS);
      t.ts = div(t.PTS, 2 * (t.TCI + 0.44 * t.T1I));
      t.usg = (eqPlays && t.MIN) ? (t.PLAYS * (eqMin / 5)) / (eqPlays * t.MIN) : null;
      t.astpp = t.PP ? t.AST / t.PP : t.AST;
      t.partTiempo = eqMin ? t.MIN / (eqMin / 5) : null;
      out.push(t);
    });
    return out.sort((a, b) => b.min - a.min);
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
    X.mPPP = varaJ(idx, 'PPP'); X.mUSG = varaJ(idx, 'USG%'); X.mTS = varaJ(idx, 'TS%');
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
  const fmt = (k, v) => !esNum(v) ? '—' : (/%$/.test(k) ? pc(v) : (k === 'PPP' || k === 'AST-PP' ? n(v, 2) : (k === 'NET RTNG' ? sg(v) : n(v, 1))));
  /** Un tile de métrica con su liga y su puesto (`desc` = descriptiva: azul, sin juicio). */
  function tileM(X, k, desc) {
    const m = X.metricas[k]; if (!m) return '';
    const t = desc ? 'info' : tono(m.pct);
    return tile(m.label, fmt(k, m.valor), `liga ${fmt(k, m.med)}${m.puesto ? ` · puesto ${m.puesto}/${m.de}` : ''}`, t);
  }

  /* ============================================================ PRINCIPAL */

  /* § Resumen ejecutivo · margen, NET real y ajustado, ORTG, DRTG, PPP. */
  function cardResumen(X) {
    const res = X.c.resultados, M = X.metricas;
    const margen = res.puntos.dif / X.n;
    let adj = null;
    try { const mod = (typeof SGADD_4F !== 'undefined' && SGADD_4F.modeloDe) ? SGADD_4F.modeloDe(X.idx) : null; const q = mod && mod.equipos && X.e ? mod.equipos.get(X.e.clave) : null; if (q && esNum(q.ortg) && esNum(q.drtg)) adj = q.ortg - q.drtg; } catch (err) { adj = null; }
    const lado = (k) => M[k] && esNum(M[k].pct) ? (M[k].pct >= 60 ? 'fortaleza' : M[k].pct < 40 ? 'fuga' : 'en rango') : 'sin vara';
    const lead = `${esc(corto(X.c.meta.equipo))} cerró el ciclo ${X.c.meta.numero} ${res.record.g}-${res.record.p} con un margen de ${sg(margen)} pts por partido. `
      + `Ritmo ${fmt('PACE', M.PACE.valor)} (puesto ${M.PACE.puesto || '—'}), ${fmt('PLAYS', M.PLAYS.valor)} plays por partido. `
      + `Ataca con eFG ${fmt('eFG%', M['eFG%'].valor)} (${lado('eFG%')}) y concede ${fmt('eFG Opp%', M['eFG Opp%'].valor)} (${lado('eFG Opp%')}).`;
    const brecha = esNum(M.PPP.valor) && esNum(M.PPP.med) && esNum(M.PLAYS.valor) ? (M.PPP.valor - M.PPP.med) * M.PLAYS.valor : null;
    return card('Resumen ejecutivo', `<p class="ci-lead">${lead}</p>${esNum(brecha) ? `<p class="ci-lee">Con ${n(M.PLAYS.valor, 1)} plays por partido a ${n(M.PPP.valor, 2)} puntos por jugada, la diferencia contra el PPP de la liga (${n(M.PPP.med, 2)}) son ${sg(brecha)} pts por partido.</p>` : ''}
      <div class="ci-tiles">${tile('Margen real', sg(margen) + ' pts', `${res.puntos.favor} a favor · ${res.puntos.contra} en contra · ${X.n} PJ`, margen >= 0 ? 'pos' : 'neg')}
      ${tileM(X, 'NET RTNG')}${esNum(adj) ? tile('NET ajustado por rival', sg(adj), 'modelo del Simulador con encogimiento (temporada)', adj >= 0 ? 'pos' : 'neg') : ''}
      ${tileM(X, 'RTNG OFF')}${tileM(X, 'RTNG DEF')}${tileM(X, 'PPP')}</div>
      ${nota('Dos unidades, no se mezclan: ORTG, DRTG y NET cada 100 posesiones (POS = PLAYS − RO); PPP por jugada. El NET ajustado es del modelo de la temporada (encoge hacia la media de la liga). Puesto y percentil contra la liga del libro abierto.')}`);
  }

  /* § Los 3 ejes de traducción colectiva (Motor / Combustión / Balance del riesgo). */
  function cardMotor(X) {
    const M = X.metricas, dif = esNum(M.PLAYS.valor) && esNum(M.PLAYS.med) ? M.PLAYS.valor - M.PLAYS.med : null;
    return card('El Motor · ritmo y volumen', `<div class="ci-tiles">${tileM(X, 'PACE', true)}${tileM(X, 'PLAYS', true)}${tileM(X, 'POS', true)}</div>
      ${nota(esNum(dif) ? `Genera ${sg(dif)} plays por partido contra la liga. El ritmo no tiene lado bueno: vale la pena si cada jugada paga (ver La Combustión).` : 'El ritmo describe, no juzga.')}`, 'eje azul');
  }
  function cardCombustion(X) {
    const M = X.metricas;
    const P = (X.A && X.A.P) || {};
    const t3 = esNum(M['T3%'].valor) && esNum(M['T3%'].med) && esNum(P.T3I) ? (M['T3%'].med - M['T3%'].valor) * P.T3I * 3 : null;
    return card('La Combustión · ejecución y selección', `<div class="ci-tiles">${['eFG%', 'eFG Opp%', 'TS%', 'PPP', 'T3%', 'T2%'].map(k => tileM(X, k)).join('')}</div>
      ${nota(`Jugadas que terminan en triple: ${fmt('PT3%', M['PT3%'].valor)} (liga ${fmt('PT3%', M['PT3%'].med)}).${esNum(t3) && t3 > 0 ? ` Con el T3% de la liga habría sumado ${n(t3, 1)} pts por partido con los mismos intentos.` : ''}`)}`, 'eje verde');
  }
  function cardBalance(X) {
    return card('El Balance del Riesgo · disciplina y segundas', `<div class="ci-tiles">${['PePP%', 'RO%', 'RD%', 'RTL%', 'RTL Opp%', 'PP Opp%'].map(k => tileM(X, k)).join('')}</div>
      ${nota('TOV% es la columna PePP% del panel (pérdidas por jugada). RTL Opp% es la llegada a la línea que concede la defensa.')}`, 'eje rojo');
  }

  /* § Los 4 Factores de Dean Oliver: propio, concedido, liga, diferencial y valor en puntos. */
  function card4Factores(X) {
    if (!X.A) return card('Los 4 Factores de Dean Oliver', vacio('El libro abierto no trae los partidos del ciclo: elegí la categoría de esa temporada.'));
    const P = X.A.P || {}, M = X.metricas;
    const F = [['Tiro · eFG%', 'eFG%', 'eFG Opp%'], ['Pérdidas · TOV% (menos es mejor)', 'PePP%', 'PP Opp%'], ['Rebote ofensivo · RO%', 'RO%', 'RO Opp%'], ['Línea · RTL%', 'RTL%', 'RTL Opp%']];
    let total = 0;
    const filas = F.map(([t, a, b]) => {
      const pa = M[a] || ubicar(X.idx, a, val(X.A, a)), pb = M[b] || ubicar(X.idx, b, val(X.A, b));
      /* Lo propio contra la liga + lo que concede contra la liga, cada uno con su palanca. */
      const gA = ganancia(a, pa.med, pa.valor, P), gB = ganancia(b, pb.med, pb.valor, P);
      const v = (esNum(gA) ? gA : 0) + (esNum(gB) ? gB : 0);
      total += v;
      const dif = esNum(pa.valor) && esNum(pb.valor) ? (a === 'PePP%' ? pb.valor - pa.valor : pa.valor - pb.valor) : null;
      return [esc(t), fmt(a, pa.valor), fmt(b, pb.valor), `${fmt(a, pa.med)} / ${fmt(b, pb.med)}`, esNum(dif) ? sg(dif * 100) + ' pp' : '—', `<b class="${v >= 0 ? 'pos' : 'neg'}">${sg(v)}</b>`];
    });
    filas.push(['<b>Suma</b>', '', '', '', '', `<b class="${total >= 0 ? 'pos' : 'neg'}">${sg(total)}</b>`]);
    const margen = X.c.resultados.puntos.dif / X.n;
    return card('Los 4 Factores de Dean Oliver', tabla(['Factor', 'Equipo', 'Rival (lo que concede)', 'Liga', 'Diferencial', 'Valor en pts*'], filas)
      + nota(`*Puntos por partido contra un rival promedio: lo propio contra la liga más lo concedido contra la liga, con los volúmenes reales del ciclo. Suman ${sg(total)} de los ${sg(margen)} de margen real; el resto es varianza, localía y lo que los factores no capturan.`));
  }

  /* § Los 4 partidos: marcador, ratings y factores de cada noche. */
  function porPartido(X) {
    return X.c.resultados.partidos.map((p) => {
      const f = X.filasEq.filter(x => iso(x.__fecha) === p.fecha);
      const a = agregado(X.idx, X.e, f), r = ratings(a);
      return { p, a, r };
    });
  }
  function cardPartidos(X) {
    const pp = porPartido(X);
    const filas = pp.map(({ p, a, r }) => [dia(p.fecha), esc(p.rival), p.condicion === 'LOCAL' ? 'L' : 'V', `${p.final[0]}-${p.final[1]}`, `<b class="${p.dif >= 0 ? 'pos' : 'neg'}">${sg(p.dif, 0)}</b>`,
      n(r.ortg), n(r.drtg), sg(r.net), pc(val(a, 'eFG%')), pc(val(a, 'eFG Opp%')), pc(val(a, 'PePP%')), pc(val(a, 'RO%')), a && a.propio ? `${a.propio.T3C || 0}/${a.propio.T3I || 0}` : '—']);
    const peor = pp.slice().sort((x, y) => x.p.dif - y.p.dif)[0];
    const sinPeor = pp.length > 1 ? sum(pp.filter(x => x !== peor), x => x.p.dif) / (pp.length - 1) : null;
    return card(`Los ${X.n} partidos`, tabla(['Fecha', 'Rival', 'Cond.', 'Marcador', 'Margen', 'ORTG', 'DRTG', 'NET', 'eFG%', 'eFG% perm.', 'TOV%', 'RO%', 'T3'], filas)
      + nota(`Ratings por 100 posesiones.${peor && esNum(sinPeor) ? ` El partido con ${esc(peor.p.rival)} (${sg(peor.p.dif, 0)}) es el que más pesa: sin él, el margen medio es ${sg(sinPeor)}.` : ''}`));
  }

  /* § Partido a partido · proceso contra resultado: qué explica cada marcador. */
  function cardProceso(X) {
    const pp = porPartido(X);
    const L = { o: X.metricas['RTNG OFF'].med, d: X.metricas['RTNG DEF'].med, tov: X.metricas['PePP%'].med };
    const lin = pp.map(({ p, a, r }) => {
      const t = [];
      if (esNum(r.ortg) && esNum(L.o)) t.push(r.ortg >= L.o ? `ataque sobre la liga (ORTG ${n(r.ortg)})` : `ataque bajo la liga (ORTG ${n(r.ortg)})`);
      if (esNum(r.drtg) && esNum(L.d)) t.push(r.drtg <= L.d ? `defensa sobre la liga (DRTG ${n(r.drtg)})` : `defensa bajo la liga (DRTG ${n(r.drtg)})`);
      const tov = val(a, 'PePP%'); if (esNum(tov) && esNum(L.tov) && tov > L.tov + 0.03) t.push(`pérdidas altas (${pc(tov)})`);
      const g = p.dif > 0;
      const lectura = g ? (esNum(r.net) && r.net < 5 ? 'Ganado con margen corto: hay techo para ampliar.' : 'Ganado con el proceso de su lado.')
        : (esNum(r.ortg) && esNum(L.o) && r.ortg >= L.o ? 'Perdido con el ataque en nivel: se perdió atrás.' : (esNum(r.drtg) && esNum(L.d) && r.drtg <= L.d ? 'Perdido con la defensa en nivel: se perdió adelante.' : 'Perdido en los dos costados.'));
      return `<div class="ci-pcard ${g ? 'pos' : 'neg'}"><h4>${dia(p.fecha)} · ${esc(p.rival)} ${p.condicion === 'LOCAL' ? 'local' : 'visitante'} (${sg(p.dif, 0)})</h4><p>${t.join(' · ') || 'sin datos del libro para este partido'}</p><p><b>${lectura}</b></p></div>`;
    }).join('');
    return card('Partido a partido · proceso contra resultado', `<div class="ci-grid3">${lin}</div>`);
  }

  /* § Techo de rendimiento: la mejor noche de ataque y la de defensa ya mostradas. */
  function cardTecho(X) {
    const pp = porPartido(X).filter(x => esNum(x.r.ortg) && esNum(x.r.drtg));
    if (!pp.length) return '';
    const bo = pp.slice().sort((a, b) => b.r.ortg - a.r.ortg)[0], bd = pp.slice().sort((a, b) => a.r.drtg - b.r.drtg)[0];
    const segunda = X.reloj.favor.ro, ligaRo = X.paq.liga && X.paq.liga.reloj && X.paq.liga.reloj.ro;
    return card('Techo de rendimiento · lo que ya salió bien', `<div class="ci-tiles t2">${tile('Mejor ataque', 'ORTG ' + n(bo.r.ortg), `${dia(bo.p.fecha)} vs ${esc(bo.p.rival)}`, 'pos')}${tile('Mejor defensa', 'DRTG ' + n(bd.r.drtg), `${dia(bd.p.fecha)} vs ${esc(bd.p.rival)}`, 'pos')}</div>
      <p class="ci-lee">Juntar las dos en una misma noche daría un NET de ${sg(bo.r.ortg - bd.r.drtg)} por 100 posesiones. Es una referencia: ese es el techo que el equipo ya mostró por partes.</p>
      ${segunda && segunda[0] ? nota(`Eficiencia invisible · segundas oportunidades: ${segunda[0]} tiros tras rebote ofensivo, ${n(segunda[2] / X.n, 1)} pts por partido, ${n(pptDe(segunda), 2)} por tiro${ligaRo && ligaRo[0] ? ` contra ${n(pptDe(ligaRo), 2)} de la liga` : ''}.`) : ''}`);
  }

  /* § Qué mantener y qué corregir: fortalezas (percentil ≥ 70) y fugas (< 40). */
  function cardMantener(X) {
    const lst = Object.values(X.metricas).filter(m => esNum(m.pct) && !['PACE', 'PLAYS', 'POS', 'PT3%'].includes(m.k));
    const fo = lst.filter(m => m.pct >= 70).sort((a, b) => b.pct - a.pct).slice(0, 4);
    const fu = lst.filter(m => m.pct < 40).sort((a, b) => a.pct - b.pct).slice(0, 4);
    const li = m => `<li>${esc(m.label)} ${fmt(m.k, m.valor)} (puesto ${m.puesto}/${m.de}, liga ${fmt(m.k, m.med)}).</li>`;
    const g = X.c.resultados.record.g, p = X.c.resultados.record.p;
    return card(`Qué mantener y qué corregir · resultado ${g}-${p}`, `<div class="ci-grid2"><div><h4 class="pos">Mantener${p ? ' (rescate en la derrota)' : ''}</h4><ul class="ci-lista">${fo.map(li).join('') || '<li>Ninguna métrica pasa el percentil 70.</li>'}</ul></div>
      <div><h4 class="neg">Corregir (puntos de fuga)${g ? ' · también al ganar' : ''}</h4><ul class="ci-lista">${fu.map(li).join('') || '<li>Ninguna métrica cae bajo el percentil 40.</li>'}</ul></div></div>
      ${nota('Si se gana, hay aspectos para ampliar la ventaja; si se pierde, hay estructuras que funcionaron y achican la diferencia. Las fugas de abajo dicen dónde y cuándo.')}`);
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
    const liga = (X.paq.liga && X.paq.liga.zonas) || [];
    const ligaT3 = liga.filter(z => /^Z1[0-4]$/.test(z.zona));
    const top = zs.filter(z => z.i && esNum(z.puntosDeMas) && z.puntosDeMas > 0).sort((a, b) => b.puntosDeMas - a.puntosDeMas).slice(0, 4);
    const filasZ = top.map(z => [`${esc(NOMBRE_ZONA[z.zona])} ${z.zona}`, z.i, z.c, n(z.ppt, 2), n(z.ligaPpt, 2), `<b class="neg">${sg(z.puntosDeMas)}</b>`, sg(z.puntosDeMas / X.n)]);
    const cq = X.c.cuartos.map(q => [`${q.cuarto}.º`, q.contra.tiros, q.contra.pts, n(q.contra.esperados), `<b class="${q.contra.dif > 0 ? 'neg' : 'pos'}">${sg(q.contra.dif)}</b>`]);
    const t3pct = t3.i ? t3.c / t3.i : null, ligaT3pct = varaLiga3(X);
    const meta = esNum(t3pct) && esNum(ligaT3pct) && t3pct > ligaT3pct ? t3pct - MITAD * (t3pct - ligaT3pct) : null;
    const vale = esNum(meta) ? (t3pct - meta) * 3 * (t3.i / X.n) : null;
    return card(`Fuga 1 · eFG permitido ${fmt('eFG Opp%', m.valor)}: dónde nos hacen daño`, `<div class="ci-grid2"><div>${mapa(zs, tirosCiclo(X, 'contra'), top.slice(0, 2).map(z => z.zona), { defensa: true, rotulo: 'Tiros del rival' })}${nota('Cada número es convertidos/intentados del rival en esa zona. Color: puntos por tiro contra la liga en la misma zona, ajustado por muestra. Las dos zonas con más daño van resaltadas.')}</div>
      <div><div class="ci-tiles t2">${tile('Triples del rival', `${t3.c}/${t3.i}`, `${pc(t3pct)} · liga ${pc(ligaT3pct)}`, esNum(t3pct) && esNum(ligaT3pct) && t3pct > ligaT3pct ? 'neg' : 'pos')}
        ${tile('Triples de ala (Z11 + Z13)', `${alas.c}/${alas.i}`, `${sg(alas.mas)} pts sobre la liga (${sg(alas.mas / X.n)} por partido)`, alas.mas > 0 ? 'neg' : 'pos')}
        ${tile('Aro del rival (Z1)', `${aro.c}/${aro.i}`, aro.i ? pc(aro.c / aro.i) : '', 'info')}${tile('Esquinas', `${esq.c}/${esq.i}`, esq.i < 10 ? `muestra chica (${esq.i} tiros)` : pc(esq.c / esq.i), 'info')}</div>
        ${top.length ? tabla(['Zona (del atacante)', 'Tiros', 'Conv.', 'Pts/tiro', 'Liga', 'Pts sobre liga', 'Por partido'], filasZ) : ''}
        <h4>¿Cuándo? Puntos reales contra esperados por la zona del tiro (rival)</h4>${tabla(['Cuarto', 'Tiros', 'Puntos', 'Esperados', 'Dif.'], cq)}</div></div>
      <div class="ci-rutas">${ruta('neg', 'Corregir', top.length ? `${esc(top.map(z => z.zona + ' ' + NOMBRE_ZONA[z.zona]).join(', '))}: el rival rinde ${sg(sum(top, z => z.puntosDeMas) / X.n)} pts por partido sobre la liga. Candidato a revisar en video: rotación de ayudas y salida a tirador.` : 'Sin zonas que se separen.', esNum(meta) ? `Meta real: rival de ${pc(t3pct)} a ${pc(meta)} de triple. Vale ${sg(vale)} pts por partido.` : '')}
        ${ruta('info', 'Lo que el play-by-play no registra', 'La distancia del defensor al tirador. Se dice dónde y cuándo; cuánto fue acierto y cuánto tiro cómodo no se separa con pocos partidos.')}</div>`);
  }
  /** El T3% de la liga desde el paquete (todas las zonas de triple). */
  function varaLiga3(X) {
    const lz = ((X.paq.liga && X.paq.liga.zonas) || []).filter(z => /^Z1[0-4]$/.test(z.zona));
    const i = sum(lz, z => z.i || 0), c = sum(lz, z => z.c || 0);
    return i ? c / i : (X.metricas['T3%'] ? X.metricas['T3%'].med : null);
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
    const ligaTot = L && L.trans ? Object.values(L.trans).reduce((a, v) => [a[0] + v[0], a[2] + v[2]], [0, 0]) : null;
    const lppt = ligaTot && ligaTot[0] ? ligaTot[1] / ligaTot[0] : null;
    const rd = orig.find(o => o.o === 'RD'), robo = orig.find(o => o.o === 'ROBO');
    const parte = (o) => masT > 0 && o && o.mas > 0 ? Math.round(100 * o.mas / masT) : 0;
    const filas = orig.filter(o => o.tiros).map(o => [esc(ORIGEN[o.o]) + (o.tiros < 5 ? ' <span class="ci-mut">~ muestra chica</span>' : ''), o.tiros, o.pts, n(o.ppt, 2), n(o.lppt, 2), `<b class="${(o.mas || 0) > 0 ? 'neg' : 'pos'}">${sg(o.mas)}</b>`]);
    const ca = X.c.causas || {};
    const fp = ca.falladosPrevios || { dobles: {}, triples: {} };
    const perd = (ca.jugadores || []).slice(0, 8);
    const ppt0 = tiros ? pts / tiros : null;
    const meta = esNum(ppt0) && esNum(lppt) && ppt0 > lppt ? ppt0 - MITAD * (ppt0 - lppt) : null;
    return card(`Fuga 2 · Transición defensiva: ¿de dónde viene el ${n(ppt0, 2)} por tiro en 0-7 s?`, `<div class="ci-tiles t4">${tile('Rival en 0-7 s', `${tiros} tiros`, `${pts} pts · ${n(ppt0, 2)} por tiro · liga ${n(lppt, 2)}`, esNum(lppt) && ppt0 > lppt ? 'neg' : 'pos')}
      ${tile('Sobre la liga', sg(masT / X.n) + ' pts/partido', `${sg(masT)} pts en ${X.n} partidos`, masT > 0 ? 'neg' : 'pos')}
      ${tile('Nace de un tiro nuestro errado', parte(rd) + ' %', 'de la ventaja sobre la liga', parte(rd) >= 50 ? 'neg' : 'info')}${tile('Nace de una pérdida nuestra', parte(robo) + ' %', robo && esNum(robo.mas) ? sg(robo.mas) + ' pts sobre la liga' : '', parte(robo) >= 50 ? 'neg' : 'info')}</div>
      ${tabla(['Cómo nace la posesión del rival', 'Tiros', 'Puntos', 'Pts/tiro', 'Liga (mismo origen)', 'Pts sobre liga'], filas)}
      <div class="ci-grid2"><div><h4>Tras el tiro errado</h4><div class="ci-tiles t2">${tile('Tras doble errado', (fp.dobles.n || 0) + ' tiros', (fp.dobles.pts || 0) + ' pts del rival', 'warn')}${tile('Tras triple errado', (fp.triples.n || 0) + ' tiros', (fp.triples.pts || 0) + ' pts del rival', 'warn')}</div></div>
      <div><h4>Tras pérdida: quién la cometió</h4>${perd.length ? `<div class="ci-mini">${perd.map(j => `<div><span>${esc(corto(j.nombre))}</span><i style="--w:${Math.round(100 * j.perdidas / Math.max(...perd.map(x => x.perdidas)))}%"></i><b>${j.perdidas} · ${j.puntosRival} pts</b></div>`).join('')}</div>` : vacio('Sin pérdidas que terminaran en tiro rival.')}</div></div>
      <div class="ci-rutas">${ruta('warn', 'Ajustar', 'Lectura para el cuerpo técnico: con rebote ofensivo alto hay jugadores yendo al cristal; la pregunta es quién queda de balance cuando el tiro sale. A verificar en video antes de cambiar nada.')}
      ${ruta('neg', 'Corregir', `Cerrar el 0-7 s al nivel de la liga (${n(lppt, 2)}) sin resignar rebote ofensivo.`, esNum(meta) ? `Meta real: de ${n(ppt0, 2)} a ${n(meta, 2)} por tiro. Vale ${sg((ppt0 - meta) * tiros / X.n)} pts por partido.` : '')}</div>`);
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
    const filas = quien.lista.map(j => [esc(j.nombre), `${j.c}/${j.i}`, j.i && quien.total ? Math.round(100 * j.i / quien.total) + ' %' : '—', j.i ? pc(j.c / j.i, 0) : '—', espejo ? (j.e ? `${j.e.c}/${j.e.i}` : '0/0') : '']);
    return card(`Fuga 3 · Zona ${z.zona} (${NOMBRE_ZONA[z.zona]}): ${z.c}/${z.i}`, `<div class="ci-grid2"><div>${mapa(X.c.zonas.favor, tirosCiclo(X, 'favor'), [z.zona].concat(espejo ? [espejo] : []), { rotulo: 'Tiros propios' })}</div>
      <div><div class="ci-tiles t2">${tile(`${z.zona} propia`, `${z.c}/${z.i}`, `${pc(z.pct / 100)} · ${n(z.ppt, 2)} por tiro · liga ${n(z.ligaPpt, 2)}`, 'neg')}${tile(`Costo en ${X.n} partidos`, sg(z.puntosDeMas) + ' pts', sg(z.puntosDeMas / X.n) + ' por partido', 'neg')}
        ${esTriple && t3tot ? tile('Peso en sus triples', Math.round(100 * z.i / t3tot) + ' %', `${z.i} de ${t3tot} triples`, 'warn') : ''}${ze ? tile(`${espejo} (lado contrario)`, `${ze.c}/${ze.i}`, `${n(ze.ppt, 2)} por tiro · liga ${n(ze.ligaPpt, 2)}`, 'info') : ''}</div>
        ${filas.length ? tabla(['Quién tira en ' + z.zona, z.zona, '% de la zona', 'Acierto', espejo || ''], filas) + nota(quien.fuente) : ''}</div></div>
      <div class="ci-rutas">${ruta('warn', '1 · Dibujo táctico', `La zona absorbe ${n(z.i / X.n, 1)} tiros por partido. A revisar: cómo se genera el tiro en ${z.zona} y si el dibujo lo busca o lo deja como salida.`)}
      ${ruta('warn', '2 · Quién lo toma', quien.lista.length ? `${esc(quien.lista.slice(0, 2).map(j => j.nombre).join(' y '))} concentran ${sum(quien.lista.slice(0, 2), j => j.i)} de ${quien.total}.` : 'Sin el reparto por jugador.')}
      ${ruta('neg', '3 · Redistribuir volumen', quien.mejor ? `El de mejor acierto con volumen en la zona contraria o el aro: ${esc(quien.mejor)}.` : 'Ningún jugador con poco volumen en la zona muestra efectividad probada: el destino con mejor retorno comprobado es el aro.', `Meta real: ${z.zona} de ${n(z.ppt, 2)} a ${n(meta, 2)} por tiro. Vale ${sg((meta - z.ppt) * z.i / X.n)} pts por partido.`)}</div>`);
  }
  /** Quién tira en una zona. El tiro del partido no trae al tirador: sale del
      detalle de TEMPORADA del paquete (`tiros.detalle.jugadores`), y se dice. */
  function quienTira(X, zona, espejo) {
    const d = X.paq.tiros && X.paq.tiros.detalle;
    const nombres = nombresPaq(X.paq);
    const lista = ((d && d.jugadores) || []).map((j) => {
      const z = (j.zonas || []).find(x => x.zona === zona), e = espejo ? (j.zonas || []).find(x => x.zona === espejo) : null;
      return z ? { nombre: corto(nombres[j.id] || j.id), i: z.i, c: z.c, e: e ? { i: e.i, c: e.c } : null } : null;
    }).filter(Boolean).sort((a, b) => b.i - a.i);
    const total = sum(lista, j => j.i);
    const alt = lista.filter(j => j.e && j.e.i >= 5 && j.e.c / j.e.i > (j.i ? j.c / j.i : 0) + 0.15)[0];
    const pj = (X.paq.partidos && X.paq.partidos.validados) || null;
    return { lista: lista.slice(0, 8), total, mejor: alt ? `${alt.nombre} rinde más desde ${espejo} (${alt.e.c}/${alt.e.i}) que en ${zona} (${alt.c}/${alt.i})` : null,
      fuente: `Reparto por jugador de la TEMPORADA (${pj || '—'} partidos validados): el tiro de cada partido no trae al tirador.` };
  }

  /* ============================================================ EQUIPOS */

  /* § General · lo que el panel marca: fortalezas (≥ 70), ajustes (40-69) y quiebres (< 40). */
  const FRASE = {
    'RO%': 'Gana el cristal ofensivo: segundas oportunidades.', 'PP Opp%': 'Fuerza pérdidas por encima de la liga.', 'RD%': 'Cierra el rebote defensivo.',
    'RO Opp%': 'El rival casi no rebotea en ataque.', 'RTL Opp%': 'Disciplina defensiva: defender con los pies para conceder menos libres.', 'eFG Opp%': 'El rival tira cómodo: la defensa llega tarde al tiro.',
    'RTNG OFF': 'El ataque frente a la media de la liga por posesión.', 'eFG%': 'Calidad y selección del tiro propio.', 'AST-PP': 'Relación entre lo que asiste y lo que pierde.',
    'PePP%': 'Cuidado de la pelota.', 'RTL%': 'Llegada a la línea.', 'TS%': 'Eficiencia de tiro con libres.', 'RTNG DEF': 'La defensa por posesión.', 'T3%': 'Acierto de triple.', 'T2%': 'Acierto de doble.', 'PPP': 'Rendimiento por jugada.',
  };
  const EVALUABLES = ['RO%', 'PP Opp%', 'RD%', 'RO Opp%', 'RTL Opp%', 'eFG Opp%', 'RTNG OFF', 'RTNG DEF', 'eFG%', 'AST-PP', 'PePP%', 'RTL%', 'TS%'];
  function grupos(X) {
    const ms = EVALUABLES.map(k => X.metricas[k] || Object.assign({ k, label: METRICAS[k] || k }, ubicar(X.idx, k, val(X.A, k)))).filter(m => esNum(m.pct));
    return { fo: ms.filter(m => m.pct >= 70).sort((a, b) => b.pct - a.pct), aj: ms.filter(m => m.pct >= 40 && m.pct < 70).sort((a, b) => a.pct - b.pct), qu: ms.filter(m => m.pct < 40).sort((a, b) => a.pct - b.pct) };
  }
  function cardGeneral(X) {
    const G = grupos(X);
    const li = (m, t) => `<li><span class="ci-chip ${t}">${glifo(t)} ${esc(m.label)}</span> ${fmt(m.k, m.valor)} · percentil ${m.pct} · liga ${fmt(m.k, m.med)}. <span class="ci-mut">${esc(FRASE[m.k] || '')}</span></li>`;
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
    const fo = G.fo.map(m => ruta('pos', `${esc(m.label)} · ${fmt(m.k, m.valor)} p${m.pct}`, `Piso: no bajar de ${fmt(m.k, enPercentil(X.idx, m.k, 70))} (el corte de p70).`)).join('');
    const aj = G.aj.map(m => fila(m, 70, 'fortaleza')).filter(Boolean), qu = G.qu.map(m => fila(m, 40, 'ajuste')).filter(Boolean);
    const cab = ['Métrica', 'Hoy', 'Escalón siguiente', 'Meta real del ciclo', 'Pts por partido'];
    return card('Hoja de ruta · del panel a la próxima meta', `${fo ? `<div class="ci-rutas">${fo}</div>` : ''}
      ${aj.length ? `<h4 class="warn">Ajustes → fortaleza · crecimiento real</h4>${tabla(cab, aj)}` : ''}${qu.length ? `<h4 class="neg">Puntos de quiebre → ajuste · crecimiento real</h4>${tabla(cab, qu)}` : ''}
      ${nota('Meta real: la mitad del camino entre hoy y el escalón siguiente (p70 si hoy es ajuste, p40 si es quiebre). Los puntos usan los volúmenes reales del ciclo. Las metas se solapan: no se suman.')}`);
  }

  /* § Personalidad e identidad: filosofía detectada + cómo es en cada costado de la cancha. */
  function cardPersonalidad(X) {
    let filo = null;
    try { const C = (typeof SGADD_CONCLUSIONES !== 'undefined') ? SGADD_CONCLUSIONES : null; filo = C && C.DetectarFilosofiaDT ? C.DetectarFilosofiaDT(X.idx, X.e, X.paq) : null; } catch (err) { filo = null; }
    const lado = (ks) => { const ms = ks.map(k => X.metricas[k] || Object.assign({ k, label: METRICAS[k] || k }, ubicar(X.idx, k, val(X.A, k)))).filter(m => esNum(m.valor)); const p = ms.filter(m => esNum(m.pct)); return { ms, pct: p.length ? Math.round(sum(p, m => m.pct) / p.length) : null }; };
    const of = lado(['RTNG OFF', 'eFG%', 'TS%', 'PPP', 'T3%', 'PePP%', 'RO%', 'RTL%']), de = lado(['RTNG DEF', 'eFG Opp%', 'PP Opp%', 'RD%', 'RO Opp%', 'RTL Opp%', 'PR']);
    const arq = (typeof SGADD_PBP !== 'undefined' && SGADD_PBP.relojArquetipos) ? (() => { try { return SGADD_PBP.relojArquetipos(X.paq); } catch (e) { return null; } })() : null;
    const pr = (m) => `<div class="ci-pr"><span>${esc(m.label)}</span><b>${fmt(m.k, m.valor)}</b><i class="ci-bar ${tono(m.pct)}" style="--w:${esNum(m.pct) ? m.pct : 0}%"></i><em>p${esNum(m.pct) ? m.pct : '—'} · liga ${fmt(m.k, m.med)}</em></div>`;
    const ladoH = (t, cls, L, a) => `<div class="ci-lado ${cls}"><div class="ci-lh"><span class="ci-lt">${t}</span><span class="ci-chip ${tono(L.pct)}">percentil medio ${esNum(L.pct) ? L.pct : '—'}</span></div>${L.ms.map(pr).join('')}${a && a.length ? `<p class="ci-sm"><b>${esc(a.map(x => x.label).join(' · '))}</b></p>` : ''}</div>`;
    const filoH = filo && (filo.label || filo.nombre) ? `<div class="ci-ident"><div><div class="ci-tl">Filosofía detectada</div><div class="ci-big">${esc(filo.label || filo.nombre)}</div><p>${esc(filo.frase || filo.texto || '')}</p></div>
      ${filo.puntajes ? `<div class="ci-punt">${Object.keys(filo.puntajes).map(k => `<div class="ci-pb"><span>${esc(k)}</span><i style="--w:${Math.round(filo.puntajes[k] || 0)}%"></i><b>${Math.round(filo.puntajes[k] || 0)}</b></div>`).join('')}</div>` : ''}</div>` : '';
    return card('Personalidad e identidad', `${filoH}<div class="ci-duo">${ladoH('OFENSIVA', 'atk', of, arq && arq.ofensivos)}${ladoH('DEFENSA', 'def', de, arq && arq.defensivos)}</div>
      ${nota('Ninguna identidad es mejor que otra: sirve para decidir qué ajustar sin cambiar la forma de jugar. Los arquetipos del reloj son de la temporada (paquete de laboratorio).')}`);
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
    const rut = R.favor.f.map((x, i) => { const p = pts[i]; if (!esNum(p)) return ''; return ruta(p < -0.5 ? 'neg' : p > 0.5 ? 'pos' : 'warn', FRANJAS[i], `${x[0]} tiros a ${n(pptDe(x), 2)} contra ${n(pptDe(L.f[i]), 2)} de la liga: ${sg(p)} pts por partido.${i === 1 ? ' Es donde más se juega: mejorar acá mueve más que en las otras.' : ''}`); }).join('');
    return card('Reloj de posesión · perfil de ritmo y ejecución', `<h4>Cómo reparte sus tiros (0-7 · 8-17 · 18-24 s)</h4>${stack}
      ${tabla(['Franja', 'Tiros propios', 'Pts/tiro', 'Liga', 'Dif.', 'Tiros rival', 'Pts/tiro rival', 'Dif.'], filas)}
      ${nota(`Pts/tiro cuenta jugadas que terminan en tiro de campo; no incluye la línea. Puntos por partido contra la liga: ataque ${pts.map((p, i) => FRANJAS[i].split(' ')[0] + ' ' + sg(p)).join(', ')}; defensa ${ptsC.map((p, i) => FRANJAS[i].split(' ')[0] + ' ' + sg(p)).join(', ')}.`)}
      <div class="ci-rutas">${rut}</div>${franjasMapas(X)}`);
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
      return `<div class="ci-frc"><div class="ci-zh">${FRANJAS[k]} · ${ts.length} tiros</div>${mapa([], ts, [], { rotulo: FRANJAS[k] })}<div class="ci-sm">${top.map(([nm, v]) => `${esc(nm)} ${v[1]}/${v[0]}`).join(' · ')}</div></div>`;
    }).join('');
    return bloques ? `<h4>Dónde y quién, franja por franja (○ acierto · ✕ errado)</h4><div class="ci-frs">${bloques}</div>${nota('Mapas de la temporada del paquete: el tiro de cada partido no trae su franja.')}` : '';
  }

  /* § Mapa de tiro · zonas del ciclo: relleno, C/I y quién tira en las zonas destacadas. */
  function cardMapa(X) {
    const zs = X.c.zonas.favor || [];
    if (!zs.some(z => z.i)) return '';
    const tot = zonasSum(zs, ZONAS), aro = zonasSum(zs, ['Z1']), cortos = zonasSum(zs, ['Z2', 'Z3', 'Z4']);
    const fria = zs.filter(z => z.i >= 10 && esNum(z.puntosDeMas)).sort((a, b) => a.puntosDeMas - b.puntosDeMas)[0];
    const grupo = (t, ids, tt) => { const s = zonasSum(zs, ids); if (!s.i) return ''; const q = quienTira(X, ids[0], null);
      const lz = ((X.paq.liga && X.paq.liga.zonas) || []).filter(z => ids.includes(z.zona)); const li = sum(lz, z => z.i || 0); const lppt = li ? sum(lz, z => (z.ppt || 0) * (z.i || 0)) / li : null;
      const ppt = s.pts / s.i, t0 = !esNum(lppt) ? 'info' : (ppt >= lppt + 0.05 ? 'pos' : ppt <= lppt - 0.05 ? 'neg' : 'warn');
      return `<div class="ci-zc ${tt || t0}"><div class="ci-zh">${glifo(tt || t0)} ${t}</div><p>${s.c}/${s.i} (${pc(s.c / s.i)}), ${n(ppt, 2)} por tiro${esNum(lppt) ? ` contra ${n(lppt, 2)} de la liga` : ''}: ${n(s.i / X.n, 1)} tiros por partido.</p><div class="ci-sm">${q.lista.slice(0, 3).map(j => `${esc(j.nombre)} ${j.c}/${j.i}`).join(' · ')}</div></div>`; };
    return card('Mapa de tiro · zonas', `<div class="ci-grid2"><div>${mapa(zs, tirosCiclo(X, 'favor'), fria ? [fria.zona] : [], { rotulo: 'Tiros propios del ciclo' })}${nota(`Tiros propios del ciclo. Color: puntos por tiro contra la liga en la zona, ajustado por muestra.${fria ? ` Resaltada: ${fria.zona}, la zona más fría con volumen.` : ''}`)}</div>
      <div><div class="ci-tiles t2">${tile('Pts/tiro total', n(tot.i ? tot.pts / tot.i : null, 2), `${tot.i} tiros ubicados`, 'info')}${tile('Bajo el aro (Z1)', `${aro.c}/${aro.i}`, aro.i ? n(aro.pts / aro.i, 2) + ' por tiro' : '', 'info')}
        ${fria ? tile(`${fria.zona} · ${NOMBRE_ZONA[fria.zona]}`, `${fria.c}/${fria.i}`, `${n(fria.ppt, 2)} · liga ${n(fria.ligaPpt, 2)}`, 'neg') : ''}${tile('Dobles cortos', `${cortos.c}/${cortos.i}`, cortos.i ? n(cortos.pts / cortos.i, 2) + ' por tiro' : '', 'warn')}</div>
        <div class="ci-zcs">${grupo('Aro (Z1)', ['Z1'])}${grupo('Triple ala izquierda (Z11)', ['Z11'])}${grupo('Triple ala derecha (Z13)', ['Z13'])}${grupo('Dobles cortos (Z2 + Z3 + Z4)', ['Z2', 'Z3', 'Z4'])}${grupo('Triple frontal (Z12)', ['Z12'])}</div>
        ${nota('Quién tira en cada zona: reparto de la temporada (el tiro del partido no trae al tirador).')}</div></div>`);
  }

  /* § On/off, dúos, tríos y quintetos del ciclo + sugerencias desde lo real. */
  const MUESTRA = { 5: 15, 3: 40, 2: 60 };   // minutos juntos para que la combinación cuente
  function foto(nombreCorto, X) {
    const completo = X.rot && X.rot.nombres[nombreCorto];
    let url = null;
    try { url = (typeof torneoFotoJugador === 'function' && completo) ? torneoFotoJugador(completo, X.e ? X.e.nombre : '') : null; } catch (err) { url = null; }
    return url ? `<span class="ci-av" style="background-image:url('${esc(url)}')" title="${esc(nombreCorto)}"></span>` : `<span class="ci-av" title="${esc(nombreCorto)}">${esc(nombreCorto.charAt(0))}</span>`;
  }
  function cardRotacion(X) {
    const R = X.rot;
    if (!R) return card('On/off, dúos, tríos y quintetos', vacio('Los partidos del ciclo no traen los tramos de cancha: llegan con la próxima subida del paquete.'));
    const fila = k => (a) => [`<span class="ci-avs">${a.nombres.map(nm => foto(nm, X)).join('')}</span>${esc(a.nombres.join(' · '))}`, n(a.min), a.pj || '', sg(a.mm, 0), n(a.ortg), n(a.drtg), `<b class="${a.net >= 0 ? 'pos' : 'neg'}">${sg(a.net)}</b>`, a.min >= MUESTRA[k] ? '✓' : '~ corta'];
    const q = R.quintetos.slice(0, 6), d = R.duos.filter(a => a.min >= MUESTRA[2]).slice(0, 5), t = R.trios.filter(a => a.min >= MUESTRA[3]).slice(0, 5);
    const on = R.on.slice().sort((a, b) => b.minOn - a.minOn).map(j => [`${foto(j.nombre, X)}${esc(j.nombre)}`, n(j.minOn, 0), n(j.minOff, 0), sg(j.netOn), sg(j.netOff), `<b class="${(j.dif || 0) >= 0 ? 'pos' : 'neg'}">${sg(j.dif)}</b>`, j.minOn >= 100 && j.minOff >= 60 ? '✓' : '~ sin muestra']);
    const conM = [].concat(R.duos.filter(a => a.min >= MUESTRA[2]).map(a => Object.assign({ tipo: 'dúo' }, a)), R.trios.filter(a => a.min >= MUESTRA[3]).map(a => Object.assign({ tipo: 'trío' }, a)), R.quintetos.filter(a => a.min >= MUESTRA[5]).map(a => Object.assign({ tipo: 'quinteto' }, a)));
    const mejorD = conM.filter(a => a.tipo !== 'quinteto').sort((a, b) => a.drtg - b.drtg)[0], mejorO = conM.filter(a => a.tipo !== 'quinteto').sort((a, b) => b.ortg - a.ortg)[0];
    const suman = conM.filter(a => a.net > 0).sort((a, b) => b.min - a.min).slice(0, 2), revisar = R.quintetos.filter(a => a.min >= MUESTRA[5] && a.net < 0).slice(0, 2).map(a => Object.assign({ tipo: 'quinteto' }, a));
    const cb = (a, t, txt) => a ? `<div class="ci-cb ${t}"><div class="ci-ch"><span class="ci-avs">${a.nombres.map(nm => foto(nm, X)).join('')}</span><b>${n(a.min)} min · ${a.tipo}</b></div><div class="ci-cn"><span>ORTG ${n(a.ortg)}</span><span>DRTG ${n(a.drtg)}</span><span>NET ${sg(a.net)}</span></div><p>${esc(a.nombres.join(' · '))}</p><p>${txt}</p></div>` : '';
    return card('On/off, dúos, tríos y quintetos', `<h4>Quintetos (6 con más minutos juntos)</h4>${tabla(['Combinación', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', 'Muestra'], q.map(fila(5)))}
      <div class="ci-grid2"><div><h4>Dúos (≥ ${MUESTRA[2]} min juntos)</h4>${d.length ? tabla(['Dúo', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', ''], d.map(fila(2))) : vacio('Ningún dúo llega a la muestra.')}</div>
      <div><h4>Tríos (≥ ${MUESTRA[3]} min juntos)</h4>${t.length ? tabla(['Trío', 'Min', 'PJ', '+/−', 'ORTG', 'DRTG', 'NET/pos', ''], t.map(fila(3))) : vacio('Ningún trío llega a la muestra.')}</div></div>
      <h4>On/Off por jugador (Net con él menos Net sin él, por 100 posesiones)</h4>${tabla(['Jugador', 'Min ON', 'Min OFF', 'Net ON', 'Net OFF', 'Dif.', 'Muestra'], on)}
      <h4>Sugerencias desde lo real (lectura, no orden)</h4><div class="ci-cbs"><div><h5 class="pos">Si se busca más defensa</h5>${cb(mejorD, 'pos', mejorD ? `Si se busca cerrar: DRTG ${n(mejorD.drtg)}, el más bajo con muestra. Costo: ORTG ${n(mejorD.ortg)}.` : '') || vacio('Sin muestra.')}</div>
        <div><h5 class="info">Si se busca más ataque</h5>${cb(mejorO, 'info', mejorO ? `Si se busca anotar: ORTG ${n(mejorO.ortg)}. Costo: DRTG ${n(mejorO.drtg)}.` : '') || vacio('Sin muestra.')}</div>
        <div><h5 class="pos">Combinaciones que ya suman</h5>${suman.map(a => cb(a, 'pos', `NET ${sg(a.net)} en ${n(a.min)} min: candidata a más minutos.`)).join('') || vacio('Ninguna combinación con muestra suma NET positivo.')}</div>
        <div><h5 class="neg">A revisar</h5>${revisar.map(a => cb(a, 'neg', `${n(a.min)} min y NET ${sg(a.net)}: concede más de lo que anota. Candidato a repartir sus minutos.`)).join('') || vacio('Ningún quinteto con muestra da NET negativo.')}</div></div>
      ${nota(`Dúos con ${MUESTRA[2]}+ min, tríos con ${MUESTRA[3]}+ y quintetos con ${MUESTRA[5]}+ juntos. Puntos de la línea de tanteo del play-by-play; posesiones ESTIMADAS con el ritmo de cada partido. Con pocos partidos son indicios: ordenan la prueba del próximo ciclo, no fijan la rotación.`)}`);
  }

  /* § Cuartos y cierre: el peor cuarto y las cinco preguntas (calidad, rival, filosofía, partido, combinación). */
  function cardCuartos(X) {
    const Q = X.c.cuartos;
    const filas = Q.map(q => [`${q.cuarto}.º`, `${n(q.parcial.favor / X.n)} / ${n(q.parcial.contra / X.n)}`, `<b class="${q.parcial.dif >= 0 ? 'pos' : 'neg'}">${sg(q.parcial.dif / X.n)}</b>`, q.favor.tiros, `${q.favor.pts} / ${n(q.favor.esperados)}`, sg(q.favor.dif), q.contra.tiros, `${q.contra.pts} / ${n(q.contra.esperados)}`, sg(q.contra.dif)]);
    const peor = Q.slice().sort((a, b) => a.parcial.dif - b.parcial.dif)[0];
    let preguntas = '';
    if (peor && peor.parcial.dif < 0) {
      const q1 = Q[0];
      const ppCiclo = (X.c.resultados.partidos || []).map((p) => { const raw = (CIC().partidosDe(X.paq) || []).find(x => String(x.id) === String(p.id)); const pp = raw && raw.parciales && raw.parciales[peor.cuarto - 1]; return pp ? { r: p.rival, d: pp[0] - pp[1] } : null; }).filter(Boolean);
      const peorP = ppCiclo.slice().sort((a, b) => a.d - b.d)[0];
      const cq = X.rot && X.rot.cuarto.get(peor.cuarto);
      const comb = cq ? Array.from(cq.values()).sort((a, b) => b.seg - a.seg).slice(0, 4) : [];
      const q = (t, cls, txt) => `<div class="ci-q ${cls}"><b>${t}</b><p>${txt}</p></div>`;
      preguntas = `<h4>Por qué el ${peor.cuarto}.º es el peor: cinco preguntas</h4><div class="ci-q5">
        ${q('¿Calidad de tiro?', peor.favor.esperados >= q1.favor.esperados * 0.95 ? 'warn' : 'neg', `Los tiros del ${peor.cuarto}.º valían ${n(peor.favor.esperados)} pts (en el 1.º, ${n(q1.favor.esperados)}). Se anotaron ${peor.favor.pts}: ${sg(peor.favor.dif)}. ${peor.favor.esperados >= q1.favor.esperados * 0.95 ? 'La selección no empeora: es ejecución.' : 'Baja también la calidad del tiro elegido.'}`)}
        ${q('¿Rival?', peor.contra.dif > 3 ? 'neg' : 'pos', `El rival anotó ${peor.contra.pts} con ${n(peor.contra.esperados)} esperados (${sg(peor.contra.dif)}). ${peor.contra.dif > 3 ? 'El rival sobre-rinde en ese cuarto.' : 'No sobre-rinde: el daño es de nuestro ataque.'}`)}
        ${q('¿Filosofía?', 'info', `Tiros propios: ${peor.favor.tiros} en el ${peor.cuarto}.º contra ${q1.favor.tiros} en el 1.º. El reparto por franja del reloj de ese cuarto no viaja en el paquete.`)}
        ${q('¿Qué partido?', 'warn', peorP ? `El ${peor.cuarto}.º suma ${sg(peor.parcial.dif, 0)}: ${esc(peorP.r)} explica ${sg(peorP.d, 0)}. ${ppCiclo.map(x => esc(x.r) + ' ' + sg(x.d, 0)).join(' · ')}.` : 'Sin parciales por partido.')}
        ${q('¿Combinación?', 'info', comb.length ? comb.map(a => `${esc(a.nombres.join(' · '))}: ${n(a.seg / 60)} min · ${sg(a.pf - a.pc, 0)}`).join('<br>') : 'Sin tramos de cancha.')}</div>`;
    }
    const cl = X.paq.clutch && X.paq.clutch.equipo;
    return card('Cuartos y cierre', `${tabla(['Cuarto', 'Pts a favor / en contra (por partido)', 'Dif.', 'Tiros propios', 'Pts reales / esperados', 'Dif.', 'Tiros rival', 'Pts reales / esperados', 'Dif.'], filas)}
      ${nota('Esperados = puntos que rendirían esos mismos tiros a la media de la liga en cada zona: aísla la ejecución de la selección.')}${preguntas}
      ${cl ? `<div class="ci-rutas">${ruta(cl.masMenos >= 0 ? 'pos' : 'neg', 'Cierre (temporada)', `En los últimos 5 minutos con diferencia ≤ 5 (${cl.partidos} partidos): ${cl.ptsFavor} a favor y ${cl.ptsContra} en contra en ${n(cl.minutos)} minutos.`)}</div>` : ''}`);
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
    return card('Qué significa cada cuadrante', `<div class="ci-grid2">${D.map((d, i) => `<div class="ci-zc ${d[1]}"><div class="ci-zh">${d[0]}</div><div class="ci-sm">${J.filter(j => cuadrante(j, X) === i).map(j => foto(corto(j.nombre), X) + esc(corto(j.nombre))).join(' ') || '—'}</div><p>${d[2]}</p></div>`).join('')}</div>`);
  }
  /* § Distribución de minutos. */
  function cardMinutos(X) {
    const J = X.jug; if (!J.length) return '';
    const mx = Math.max(...J.map(j => j.min));
    const top5 = J.slice(0, 5), parte = sum(top5, j => j.MIN) / Math.max(1, sum(J, j => j.MIN));
    return card('Distribución de minutos', `<div class="ci-mins">${J.map(j => `<div class="ci-mr"><span>${esc(corto(j.nombre))}</span><i style="--w:${(100 * j.min / mx).toFixed(0)}%"></i><b>${n(j.min)}</b></div>`).join('')}</div>${nota(`Los cinco con más minutos reúnen el ${Math.round(100 * parte)} % de los minutos del ciclo.`)}`);
  }
  /** Fortaleza / fuga / ajuste de un jugador, con números del ciclo y de su mapa de temporada. */
  function lecturaJugador(j, X) {
    const d = X.paq.tiros && X.paq.tiros.detalle; const nombres = nombresPaq(X.paq);
    const tj = d && (d.jugadores || []).find(x => clave(nombres[x.id] || '') === clave(j.nombre));
    const zs = tj ? (tj.zonas || []).filter(z => z.i >= 5) : [];
    const mejor = zs.slice().sort((a, b) => b.ppt - a.ppt)[0], peor = zs.slice().sort((a, b) => a.ppt - b.ppt)[0];
    const t3 = j.T3I ? j.T3C / j.T3I : null;
    const fo = [];
    if (esNum(j.ppp) && esNum(X.mPPP) && j.ppp >= X.mPPP) fo.push(`${n(j.ppp, 2)} por jugada, sobre la mediana de la liga`);
    if (mejor) fo.push(`su mejor zona es ${mejor.zona} ${mejor.c}/${mejor.i} (${n(mejor.ppt, 2)} por tiro)`);
    if (j.RD / Math.max(1, j.pj) >= 4) fo.push(`${n(j.RD / j.pj)} rebotes defensivos por partido`);
    if (j.astpp >= 1.5) fo.push(`AST-PP ${n(j.astpp, 2)}: pasa más de lo que pierde`);
    const fu = [];
    if (peor && peor !== mejor) fu.push(`${peor.zona} ${peor.c}/${peor.i} (${n(peor.ppt, 2)} por tiro)`);
    if (esNum(t3) && j.T3I >= 8 && t3 < 0.28) fu.push(`T3 ${j.T3C}/${j.T3I}`);
    if (j.PP / Math.max(1, j.pj) >= 2.5) fu.push(`${n(j.PP / j.pj)} pérdidas por partido`);
    if (j.FC / Math.max(1, j.pj) >= 3) fu.push(`${n(j.FC / j.pj)} faltas cometidas por partido`);
    const meta = esNum(j.ppp) && esNum(X.mPPP) ? (j.ppp >= X.mPPP ? null : j.ppp + MITAD * (X.mPPP - j.ppp)) : null;
    let ajuste = 'Sostener lo que rinde.';
    if (peor && /^Z1[0-4]$/.test(peor.zona) && mejor && !/^Z1[0-4]$/.test(mejor.zona)) ajuste = `Menos triples desde ${peor.zona}, más ataque a ${mejor.zona}.`;
    else if (peor && mejor && peor !== mejor) ajuste = `Mover tiros de ${peor.zona} hacia ${mejor.zona}.`;
    else if (j.PP / Math.max(1, j.pj) >= 2.5) ajuste = 'Cuidar la pelota antes que sumar volumen.';
    const rol = !tj ? 'Sin mapa' : (sum((tj.zonas || []).filter(z => ['Z1', 'Z2', 'Z3', 'Z4'].includes(z.zona)), z => z.i) / Math.max(1, tj.i) >= 0.6 ? 'Finalizador cerca del aro'
      : (sum((tj.zonas || []).filter(z => /^Z1[0-4]$/.test(z.zona)), z => z.i) / Math.max(1, tj.i) >= 0.5 ? 'Tirador / espaciador' : (j.astpp >= 1.5 ? 'Conector' : 'Rotación versátil')));
    return { fortaleza: fo.join('; ') || 'sin una fortaleza que se separe en el ciclo', fuga: fu.join('; ') || 'sin una fuga que se separe', ajuste: ajuste + (meta ? ` Meta: PPP de ${n(j.ppp, 2)} a ${n(meta, 2)}.` : ' Meta: sostener el PPP.'), meta, rol, mapa: tj };
  }
  /* § Desempeño individual por bloques de minutos (I > 25 · II 16-25 · III < 16), ordenado por influencia. */
  function cardDesempeno(X) {
    if (!X.jug.length) return card('Desempeño individual del plantel', vacio('El libro abierto no trae a los jugadores del ciclo.'));
    const bloque = (t, f) => { const J = X.jug.filter(f); if (!J.length) return ''; return `<h4>${t}</h4><div class="ci-jcs">${J.map((j) => {
      const s = semaforo(j, X.mPPP, X.mTS), L = lecturaJugador(j, X);
      return `<div class="ci-jc ${s.t}"><div class="ci-jh">${foto(corto(j.nombre), X).replace('ci-av', 'ci-av lg')}<b>${esc(corto(j.nombre))}</b><span class="ci-chip ${s.t}">${s.label}</span></div>
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
      return `<div class="ci-pm"><h4>${esc(corto(nombres[tj.id] || tj.id))} <span class="ci-mut">${tj.i} tiros · mediana a ${n(tj.dist)} m</span></h4>${mapa([], ts, [mej, peo].filter(Boolean).map(z => z.zona), { rotulo: 'Mapa de ' + corto(nombres[tj.id] || '') })}
        <div class="ci-tiles t2">${tile('Pts/tiro', n(tj.ppt, 2), `${tj.c}/${tj.i} de campo`, 'info')}${tile('Mejor / peor', `${mej ? mej.zona : '—'} / ${peo ? peo.zona : '—'}`, `${mej ? `▲ ${mej.c}/${mej.i}` : ''} ${peo ? `▼ ${peo.c}/${peo.i}` : ''}`, 'info')}</div></div>`;
    }).join('');
    return card('Mapas de tiro por jugador · aciertos (○) y errados (✕)', `<div class="ci-pmaps">${pm}</div>${nota('Tiros reales de la temporada del paquete. Las zonas resaltadas son su mejor y su peor zona con 5 tiros o más.')}`);
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
    return card('Reestructuración táctica y proyección', `<h4>1 · Redistribución del USG% · transferencia de volumen</h4><div class="ci-mv">${movs}</div>
      <h4>2 · Justificación técnica</h4><p class="ci-sm">PPP ajustado con ${PRIOR} jugadas de la liga como prior (pocos partidos son poca muestra). A quien recibe volumen se le reconoce solo la mitad de su ventaja: más jugadas bajan el rendimiento marginal.</p>
      <h4>3 · Mejora alcanzable</h4><div class="ci-tiles">${tile('Por redistribución', sg(total) + ' pts', 'por partido', total > 0 ? 'pos' : 'info')}</div>${nota('La redistribución es un complemento: el peso del plan está en las metas de selección de tiro y defensa (sección Plan).')}`);
  }

  /* ============================================================ CLASIFICACIÓN */

  /* § Posición actual: la misma tabla de la sección Clasificación. */
  function cardPosicion(X) {
    let h = '';
    try { h = (typeof clasifTablaHTML === 'function') ? clasifTablaHTML(X.idx, { columnas: 'resumida' }) : ''; } catch (err) { h = ''; }
    const pjs = (X.idx.lista ? X.idx.lista() : []).map(e => e.pj).filter(esNum);
    return card('Posición actual', (h || vacio('La tabla no está disponible.')) + nota(pjs.length ? `Los equipos jugaron entre ${Math.min(...pjs)} y ${Math.max(...pjs)} partidos: el puesto de hoy no es comparable entre equipos.` : ''));
  }
  /* § Escenarios de rendimiento (no son proyección: con 4 partidos no se proyecta). */
  function cardEscenarios(X) {
    const F = (X.doc && X.doc.formato) || {};
    const total = F.partidosPorEquipo || null;
    const g = X.e && X.e.record ? X.e.record.ganados : X.c.resultados.record.g, p = X.e && X.e.record ? X.e.record.perdidos : X.c.resultados.record.p;
    if (!total) return card('Escenarios de rendimiento (no son proyección)', vacio('El torneo no declara cuántos partidos juega cada equipo: sin eso no se arman escenarios.'));
    const quedan = Math.max(0, total - g - p);
    const filas = [0.71, 0.61, 0.50, 0.43].map((r) => { const w = Math.round(quedan * r); return [`${w} de ${quedan} (${Math.round(100 * r)} %)`, `${g + w}-${p + quedan - w}`, pc((g + w) / total, 0)]; });
    return card('Escenarios de rendimiento (no son proyección)', tabla(['Si gana…', 'Récord final', '% de victorias de la temporada'], filas)
      + nota(`Quedan ${quedan} de ${total} partidos. Con pocos partidos no hay proyección matemática cerrada: los escenarios dimensionan el esfuerzo. El corte de cada zona del formato está en la sección Clasificación.`));
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
    return card('Carga de calendario', tabla(['Fecha', 'Rival', 'Cond.', 'Sede', 'Descanso previo', 'Marcador'], filas)
      + nota(`El ciclo se jugó ${loc} ${loc === 1 ? 'vez' : 'veces'} de local y ${P.length - loc} de visitante. Balance por condición: local NET ${sg(net(true))} · visitante ${sg(net(false))}. Con tan pocos partidos ninguno de los dos dice nada de la localía real.`));
  }
  /* § SOS · los rivales del ciclo, por su NET de temporada. */
  function cardSOS(X) {
    const rows = X.c.resultados.partidos.map((p) => { const e = X.idx.get ? X.idx.get(p.rival) : null; const r = e ? X.idx.leer(e.clave, 'NET RTNG') : null; const u = r ? ubicar(X.idx, 'NET RTNG', r.valor) : null;
      return { p, e, net: r && r.valor, puesto: u && u.puesto, de: u && u.de }; });
    const filas = rows.map(x => [esc(x.p.rival), x.e ? x.e.pj : '—', sg(x.net), x.puesto ? `${x.puesto}.º de ${x.de}` : '—', x.e && x.e.record ? `${x.e.record.ganados}-${x.e.record.perdidos}` : '—']);
    const v = rows.map(x => x.net).filter(esNum), m = X.metricas['NET RTNG'] && X.metricas['NET RTNG'].med;
    return card(`SOS · los ${rows.length} rivales`, tabla(['Rival', 'PJ', 'NET (temporada)', 'Puesto NET', 'Récord'], filas)
      + nota(v.length ? `NET promedio de los rivales: ${sg(sum(v) / v.length)} contra una mediana de liga de ${sg(m)}. ${sum(v) / v.length > (m || 0) + 3 ? 'Un ciclo duro en bruto.' : 'Un calendario cercano a la media.'} El NET de cada rival incluye su partido contra nosotros.` : 'Sin el NET de los rivales en el libro.'));
  }
  /* § Disponibilidad de planteles: estados cargados (propio) y bajas del rival (no se suponen). */
  function cardDisponibilidad(X) {
    let txt = 'No hay estados cargados (lesión, suspensión, baja) para esta categoría.';
    try {
      const E = (typeof SGADD_ESTADOS !== 'undefined') ? SGADD_ESTADOS : null;
      const mapa = E && E.leerTodos ? E.leerTodos() : null;
      const marcados = mapa ? Object.keys(mapa).filter(k => mapa[k] && mapa[k].estado && mapa[k].estado !== 'ACTIVO') : [];
      if (marcados.length) txt = 'Estados cargados: ' + marcados.map(k => `${esc(corto(k.split('|')[0]))} (${esc(mapa[k].estado)})`).join(', ') + '.';
    } catch (err) { /* sin estados */ }
    const sinMin = X.jug.length ? [] : [];
    return card('Disponibilidad de planteles', `<p><b>Propio:</b> ${txt}${sinMin.length ? '' : ''}</p><p><b>Rival:</b> no hay registro de bajas de los oponentes cargado para este ciclo. No se hacen suposiciones.</p>`);
  }
  /* § Próximo ciclo: los siguientes partidos con la lectura del simulador. */
  function cardProximo(X) {
    const cal = calendario(X).filter(p => p.fecha > X.c.meta.hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).slice(0, 4);
    if (!cal.length) return card('Próximo ciclo · los siguientes partidos', vacio('El calendario del torneo no está cargado o no publica los próximos partidos.'));
    const F = (typeof SGADD_4F !== 'undefined') ? SGADD_4F : null;
    const filas = cal.map((p) => { const local = clave(p.local) === X.e.clave; const riv = local ? p.visitante : p.local;
      let lec = '—'; try { const r = F ? F.simularEnfrentamiento(X.idx, p.local, p.visitante) : null; if (r && r.ok !== false) { const m = local ? r.margen : -r.margen, pr = local ? r.confianza : 1 - r.confianza; lec = `${pr >= 0.58 ? 'Favorable' : pr <= 0.42 ? 'Cuesta arriba' : 'Parejo'} · margen ${sg(m)} · ${Math.round(100 * pr)} % de ganar`; } } catch (e) { lec = '—'; }
      const re = X.idx.get ? X.idx.get(riv) : null, rn = re ? X.idx.leer(re.clave, 'NET RTNG') : null;
      return [`${dia(p.fecha)}${p.hora ? ' · ' + esc(p.hora) : ''}`, esc(riv), local ? 'Local' : 'Visitante', rn ? sg(rn.valor) : '—', lec]; });
    return card('Próximo ciclo · los siguientes partidos', tabla(['Fecha', 'Rival', 'Cond.', 'NET rival', 'Lectura del modelo'], filas) + nota('Lectura del simulador con ratings encogidos y localía: orden de magnitud, no pronóstico. Fixture sujeto a cambios de la liga.'));
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
    return card('Ventanas de entrenamiento · días entre partidos', `<div class="ci-vts">${vt}</div>${nota('Días libres = días corridos entre un partido y el siguiente, sin contar los de juego. Práctica = libres menos 1 (la recuperación). 7 o más: bloque de instalación; 3 a 6: ajuste más un bloque; 1 o 2: recuperación y scouting; ninguno: sin práctica. Las casillas azules son los partidos que vienen.')}`);
  }

  /* ============================================================ PLAN */

  /** Las metas del ciclo siguiente: cada una con su base, su cambio y su valor en puntos. */
  function metas(X) {
    const out = [], R = X.reloj, L = X.paq.liga && X.paq.liga.reloj;
    if (R.con && L && L.f) {
      [[1, 'Ataque armado (8-17 s)'], [0, 'Ataque en transición (0-7 s)'], [2, 'Final del reloj (18-24 s)']].forEach(([k, t]) => { const x = R.favor.f[k], lp = pptDe(L.f[k]), p = pptDe(x);
        if (esNum(p) && esNum(lp) && p < lp) { const meta = p + MITAD * (lp - p); out.push({ lado: 'Ataque', meta: `${t}: de ${n(p, 2)} a ${n(meta, 2)} pts/tiro (liga ${n(lp, 2)})`, cambio: sg(meta - p, 2) + ' pts/tiro', pts: (meta - p) * x[0] / X.n, base: `${n(x[0] / X.n, 1)} tiros por partido en esa franja`, ind: [`${t} (pts/tiro)`, n(p, 2), n(meta, 2), `bajo ${n(p, 2)}`] }); } });
      [[1, 'Defensa en juego armado (8-17 s)'], [0, 'Defensa en transición (0-7 s)']].forEach(([k, t]) => { const x = R.contra.f[k], lp = pptDe(L.f[k]), p = pptDe(x);
        if (esNum(p) && esNum(lp) && p > lp) { const meta = p - MITAD * (p - lp); out.push({ lado: 'Defensa', meta: `${t}: de ${n(p, 2)} a ${n(meta, 2)} pts/tiro concedido`, cambio: sg(meta - p, 2) + ' pts/tiro', pts: (p - meta) * x[0] / X.n, base: `${n(x[0] / X.n, 1)} tiros rivales por partido`, ind: [`Rival en ${t.split('(')[1].replace(')', '')} (pts/tiro)`, n(p, 2), n(meta, 2), `sobre ${n(p, 2)}`] }); } });
    }
    const zf = (X.c.zonas.favor || []).filter(z => z.i >= 10 && esNum(z.puntosDeMas) && z.puntosDeMas < 0).sort((a, b) => a.puntosDeMas - b.puntosDeMas)[0];
    if (zf) { const meta = zf.ppt + MITAD * (zf.ligaPpt - zf.ppt); out.push({ lado: 'Ataque', meta: `${NOMBRE_ZONA[zf.zona]} (${zf.zona}): de ${n(zf.ppt, 2)} a ${n(meta, 2)} pts/tiro o menos volumen`, cambio: sg(meta - zf.ppt, 2), pts: (meta - zf.ppt) * zf.i / X.n, base: `${n(zf.i / X.n, 1)} tiros por partido`, ind: [`${zf.zona} (pts/tiro)`, n(zf.ppt, 2), n(meta, 2), `bajo ${n(zf.ppt, 2)}`] }); }
    const P = (X.A && X.A.P) || {}, M = X.metricas;
    const t3 = zonasSum(X.c.zonas.contra || [], ['Z10', 'Z11', 'Z12', 'Z13', 'Z14']), lt3 = varaLiga3(X);
    if (t3.i && esNum(lt3) && t3.c / t3.i > lt3) { const a = t3.c / t3.i, meta = a - MITAD * (a - lt3); out.push({ lado: 'Defensa', meta: `Triple del rival: de ${pc(a)} a ${pc(meta)}`, cambio: sg((meta - a) * 100) + ' pp', pts: (a - meta) * 3 * t3.i / X.n, base: `${n(t3.i / X.n, 1)} triples rivales por partido`, ind: ['Triple del rival', pc(a), pc(meta), `sobre ${pc(a - 0.025)}`] }); }
    if (M['PePP%'] && esNum(M['PePP%'].valor) && esNum(M['PePP%'].med) && M['PePP%'].valor > M['PePP%'].med) { const a = M['PePP%'].valor, meta = M['PePP%'].med; const g = ganancia('PePP%', a, meta, P);
      if (esNum(g) && g > 0.1) out.push({ lado: 'Ataque', meta: `Pérdidas: de ${pc(a)} a ${pc(meta)} (la liga)`, cambio: sg((meta - a) * 100) + ' pp', pts: g, base: `cada jugada perdida vale ~${n(M.PPP.med, 2)} pts`, ind: ['Pérdidas (TOV%)', pc(a), pc(meta), `sobre ${pc(a)}`] }); }
    if (M['T3%'] && esNum(M['T3%'].valor) && esNum(M['T3%'].med) && M['T3%'].valor < M['T3%'].med && esNum(P.T3I)) { const a = M['T3%'].valor, meta = M['T3%'].med; out.push({ lado: 'Ataque', meta: `Triple propio: acercar el T3% a la liga (${pc(a)} a ${pc(meta)})`, cambio: sg((meta - a) * 100) + ' pp', pts: (meta - a) * 3 * P.T3I, base: 'normalización del acierto con el mismo volumen', ind: null }); }
    return out.filter(m => esNum(m.pts) && m.pts > 0.05).sort((a, b) => b.pts - a.pts);
  }
  /* § Plan de intervención: responsabilidad ataque/defensa, metas y escenarios con solape. */
  function cardPlan(X) {
    const ms = metas(X);
    if (!ms.length) return card(`Plan de intervención · metas para el Ciclo ${X.c.meta.numero + 1}`, vacio('El ciclo no deja metas que se separen de la liga.'));
    const A = sum(ms.filter(m => m.lado === 'Ataque'), m => m.pts), D = sum(ms.filter(m => m.lado === 'Defensa'), m => m.pts), T = A + D;
    const margen = X.c.resultados.puntos.dif / X.n;
    return card(`Plan de intervención · metas para el Ciclo ${X.c.meta.numero + 1}`, `<p class="ci-lead">El plan no cambia la identidad: ajusta la ejecución dentro de ese libreto. No todo pesa igual:</p>
      <div class="ci-resp"><div class="ci-rA" style="--w:${Math.max(8, 100 * A / T).toFixed(0)}%"><b>Ataque ${Math.round(100 * A / T)} %</b> · ${sg(A)} pts</div><div class="ci-rD" style="--w:${Math.max(8, 100 * D / T).toFixed(0)}%"><b>Defensa ${Math.round(100 * D / T)} %</b> · ${sg(D)} pts</div></div>
      ${tabla(['Lado', 'Meta táctica', 'Cambio', 'Pts por partido', 'Base'], ms.map(m => [`<span class="ci-chip ${m.lado === 'Defensa' ? 'pos' : 'info'}">${m.lado}</span>`, esc(m.meta), esc(m.cambio), `<b class="pos">${sg(m.pts)}</b>`, esc(m.base)]))}
      <p class="ci-lee">Las metas se solapan entre sí: sumarlas da ${sg(T)} pts por partido, y un escenario prudente es la mitad (${sg(T * SOLAPE)}). Desde un margen de ${sg(margen)}, eso lo deja en torno a ${sg(margen + T * SOLAPE)} sin contar la localía de los próximos partidos. El objetivo medible es mover los indicadores del tablero, no prometer victorias.</p>`);
  }
  /* § Tablero de control: base del ciclo, meta real y umbral de alerta. */
  function cardTablero(X) {
    const ms = metas(X).filter(m => m.ind);
    if (!ms.length) return '';
    const crit = X.jug.filter(j => semaforo(j, X.mPPP, X.mTS).id === 'critico' && j.min >= 14);
    const filas = ms.map(m => [m.lado, esc(m.ind[0]), m.ind[1], m.ind[2], esc(m.ind[3])]);
    if (crit.length) { const ppp = sum(crit, j => j.PTS) / Math.max(1, sum(crit, j => j.PLAYS)); filas.push(['Ataque', `PPP ponderado de los jugadores en Crítico (${esc(crit.map(j => corto(j.nombre)).join(', '))})`, n(ppp, 2), n(ppp + MITAD * (X.mPPP - ppp), 2), `sin mejora sobre ${n(ppp, 2)}`]); }
    return card(`Tablero de control · qué se mide en el Ciclo ${X.c.meta.numero + 1}`, tabla(['Lado', 'Indicador', `Base Ciclo ${X.c.meta.numero}`, 'Meta real', 'Alerta'], filas) + nota('Cada meta es la mitad del camino hasta la liga. Si el ciclo siguiente la alcanza, el indicador pasa de quiebre a ajuste; si la supera, de ajuste a fortaleza. Con pocos partidos, una meta cumplida es un indicio.'));
  }
  /* § Qué esperar en el ciclo siguiente: si se gana, si se pierde, lo que no cambia. */
  function cardEsperar(X) {
    const G = grupos(X);
    const fo = G.fo.slice(0, 3).map(m => m.label.toLowerCase()).join(', '), qu = G.qu.slice(0, 3).map(m => m.label.toLowerCase()).join(', ');
    return card(`Qué esperar en el Ciclo ${X.c.meta.numero + 1}`, `<div class="ci-grid3"><div class="ci-zc pos"><div class="ci-zh">▲ Si se gana</div><p>Ampliar la ventaja: ${esc(fo || 'lo que hoy está sobre la liga')} son la base; no se corrige solo porque se ganó.</p></div>
      <div class="ci-zc neg"><div class="ci-zh">▼ Si se pierde</div><p>Achicar la diferencia con lo que ya funciona y mirar el proceso antes que el marcador: ${esc(qu || 'los indicadores del tablero')}.</p></div>
      <div class="ci-zc info"><div class="ci-zh">◆ Lo que no cambia</div><p>Ritmo, volumen y estilo. El ajuste es de selección y de balance, no de identidad.</p></div></div>`);
  }
  /* § Reglas de lectura del informe. */
  function cardReglas(X) {
    return card('Reglas de lectura de este informe', `<ul class="ci-lista"><li>Ciclo ${X.c.meta.numero}${X.c.meta.numero === 0 ? ' = línea base: no hay ciclo anterior, no se informan tendencias, solo posición contra la mediana y el puesto de la liga.' : ': se compara contra la liga y contra el ciclo anterior en la pestaña Principal (auditoría).'}</li>
      <li>Muestra: ${X.n} partidos (${X.c.resultados.partidos.filter(p => p.condicion === 'LOCAL').length} local, ${X.c.resultados.partidos.filter(p => p.condicion !== 'LOCAL').length} visitante). Todo percentil y puesto es provisional.</li>
      <li>Ratings (ORTG, DRTG, NET) por 100 posesiones; PPP por jugada; pts/tiro por intento de campo.</li><li>Los puntos por partido de las metas son diferenciales contra la liga, no pronósticos.</li>
      <li>Fuente: el libro de la categoría abierta y el play-by-play validado de los partidos del ciclo.</li></ul>`);
  }

  /* ===================================================== RENDER */

  function html(modelo, seccion) {
    if (!modelo || !modelo.ok) return '';
    const cards = (modelo.secciones[seccion] || []).map((f) => { try { return f(modelo.contexto); } catch (err) { return `<div class="ci-card"><p class="ci-vacio">Esta card no se pudo armar (${esc(err && err.message)}).</p></div>`; } }).join('');
    asegurarEstilo();
    return `<div class="ci">${cards}</div>`;
  }

  /* ---- el estilo: tokens del Artifact, en el tema oscuro del panel y con su variante de papel ---- */
  const CSS = `.ci{--ci-card:#0f1c33;--ci-line:#22345a;--ci-fg:#e8eef9;--ci-mut:#93a4c2;--ci-pos:#4ade80;--ci-posbg:#0f3a2a;--ci-neg:#f87171;--ci-negbg:#3d1620;--ci-info:#7ab4ff;--ci-infobg:#122c52;--ci-warn:#fbbf24;--ci-warnbg:#3a2c0a;color:var(--ci-fg);font-family:Barlow,system-ui,sans-serif;display:grid;gap:12px}
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

  return { armar, html, ubicar, rotacion, relojDelCiclo, jugadoresDelCiclo, semaforo, metas, corto, puntosEntre, CSS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_CICLOINFORME;
