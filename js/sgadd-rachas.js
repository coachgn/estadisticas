/* =====================================================================
   SGADD · RACHAS Y TENDENCIAS DE JUGADOR  (v336)

   Motor PURO: no toca `document` y se testea desde Node.

   Contesta una sola pregunta por jugador: ¿viene en racha caliente (🔥),
   en racha fría (🧊) o es estable (⚓)? Y la contesta con las reglas que
   evitan los falsos positivos:

     · La medida es la EFICIENCIA (TS%; eFG% si no hay libres) de sus
       últimos N partidos jugados contra SU propia línea de base previa.
     · El desvío es el de la competencia: el σ propio del jugador, con un
       PISO que sale del σ de los jugadores de ESTA competencia (p25). Un
       jugador con dos noches iguales no tiene σ ≈ 0 y no dispara todo.
     · z = (media de la ventana − media de la base) / (σ / √n): el desvío
       de un PROMEDIO de n partidos, no el de una noche. 1,5 es raro.
     · 🔥 exige USO estable: plays por 40 min de la ventana ≥ 95 % de su
       base y minutos que no sean residuales. Si no, sube la eficiencia
       pero no el protagonismo: minutos de la basura, no racha.
     · ⚓ es el regular: la ventana cae dentro de ±0,5 σ de su media y no
       es racha ni bache. Describe, no premia.
     · Todo se indexa PER 40 (reglamento FIBA), así un partido lento o una
       prórroga no distorsionan el volumen.
     · El rival pesa: cada partido se pondera 0,8 a 1,2 según su lugar en
       la tabla (el 1.° vale 1,2). Un +1,5 σ ante el puntero vale más.
     · 🔥 con salto de minutos dispara una ALERTA DE CARGA para el
       preparador físico: produce más a costa de jugar mucho más.
     · 🧊 en un tirador dice de qué parece venir el bache (menos intentos,
       otra selección, rivales con buena defensa o puro acierto). El box
       score NO trae la ubicación del tiro: es una lectura por proxy y la
       causa lo dice.

   Todos los cortes son DE LA COMPETENCIA y se pueden declarar por torneo
   en `idx.liga.rachas`; lo que no se declara usa el respaldo de abajo.
   ===================================================================== */
const SGADD_RACHAS = (function () {

  /** Respaldo. Un torneo lo pisa con `idx.liga.rachas = { ... }`. */
  const UMBRALES = {
    ventana: 5,          // partidos jugados que definen la racha
    base: 3,             // mínimo de partidos jugados ANTES de la ventana
    minMinutos: 8,       // un partido de menos minutos no cuenta
    z: 1.5,              // 🔥 / 🧊 desde ±1,5 desvíos del promedio de n partidos
    ancla: 0.5,          // ⚓ dentro de ±0,5 σ de su media
    usoMinRatio: 0.95,   // 🔥: plays/40 de la ventana ≥ 95 % de su base
    minutosVentana: 10,  // 🔥/🧊: promedio de minutos de la ventana
    cargaRatio: 1.2,     // alerta de carga: +20 % de minutos…
    cargaMinutos: 4,     // …y al menos +4 por partido
    ligaMinJugados: 6,   // para entrar al σ de la competencia
    pesoRival: [0.8, 1.2],
    tiradorT3: 2.5,      // base de T3I por partido para leerlo como tirador
    bajaVolumen: 0.85,   // intentos por 40 < 85 % de la base
    saltoSeleccion: 0.08 // cambio de la parte de triples en sus tiros
  };

  const EMOJI = { caliente: '🔥', fria: '🧊', ancla: '⚓' };
  const ETIQUETA = { caliente: 'Racha caliente', fria: 'Racha fría', ancla: 'Estable' };

  function umbrales(idx) {
    const d = (idx && idx.liga && idx.liga.rachas) || {};
    const out = {};
    Object.keys(UMBRALES).forEach(k => { out[k] = (d[k] !== undefined && d[k] !== null) ? d[k] : UMBRALES[k]; });
    return out;
  }

  const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
  const suma = (a) => a.reduce((s, v) => s + v, 0);
  const prom = (a) => a.length ? suma(a) / a.length : null;
  function sd(a) {
    if (a.length < 2) return null;
    const m = prom(a);
    return Math.sqrt(suma(a.map(v => (v - m) * (v - m))) / (a.length - 1));
  }
  function mediana(a) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y), h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }
  function percentilDe(vals, p) {
    if (!vals.length) return null;
    const s = vals.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  }
  const claveEq = (x) => (typeof SGADD !== 'undefined' && SGADD.claveEquipo) ? SGADD.claveEquipo(x) : String(x || '').toUpperCase();

  /** Eficiencia de UNA noche: TS% y, si no, eFG%. Null si no tiró. */
  function eficiencia(p) {
    const ts = num(p['TS%']);
    if (ts !== null) return ts;
    return num(p['eFG%']);
  }
  const per40 = (v, min) => (num(v) !== null && num(min) !== null && min > 0) ? v / min * 40 : null;

  /** Los partidos que cuentan: jugados (≥ minMinutos) y con eficiencia. */
  function jugados(partidos, U) {
    return (partidos || []).filter(p => num(p['MIN']) !== null && p['MIN'] >= U.minMinutos && eficiencia(p) !== null);
  }

  /** σ de la competencia: el p25 del σ de eficiencia de sus jugadores con
      muestra. Es el piso del desvío propio. Se calcula una vez por índice. */
  function sigmaLiga(idx) {
    if (!idx || !idx.liga) return null;
    if (idx.liga.__rachasSigma !== undefined) return idx.liga.__rachasSigma;
    const U = umbrales(idx);
    const sds = [];
    if (idx.liga.jugadorPartidos && idx.liga.jugadorPartidos.forEach) {
      idx.liga.jugadorPartidos.forEach(filas => {
        const v = jugados(filas, U).map(eficiencia);
        if (v.length >= U.ligaMinJugados) { const s = sd(v); if (s !== null) sds.push(s); }
      });
    }
    const r = sds.length >= 8 ? { p25: percentilDe(sds, 0.25), mediana: mediana(sds), n: sds.length } : null;
    try { idx.liga.__rachasSigma = r; } catch (e) { /* índice congelado */ }
    return r;
  }

  /** Lugar del rival en la tabla: 0 (último) a 1 (puntero), por % de victorias. */
  function fuerzaRivales(idx) {
    if (!idx || !idx.liga) return null;
    if (idx.liga.__rachasFuerza) return idx.liga.__rachasFuerza;
    const pcts = [];
    const lista = (idx.equipos && idx.equipos.forEach) ? idx.equipos : null;
    const mapa = new Map();
    const reg = (e) => {
      if (!e || !e.record) return;
      const t = (e.record.ganados || 0) + (e.record.perdidos || 0);
      if (t > 0) { const pct = e.record.ganados / t; pcts.push(pct); mapa.set(e.clave, pct); }
    };
    if (lista) lista.forEach(reg);
    else if (idx.liga.equipos && idx.liga.equipos.forEach) idx.liga.equipos.forEach(reg);
    const r = { mapa, pcts };
    try { idx.liga.__rachasFuerza = r; } catch (e) { /* idem */ }
    return r;
  }

  /** Peso de un partido según el rival: 0,8 (último) a 1,2 (puntero). */
  function pesoRival(idx, p, U, miClave) {
    const f = fuerzaRivales(idx);
    const partes = String(p['PARTIDO'] || '').split(/\s+vs\s+/i);
    if (!f || partes.length !== 2 || f.pcts.length < 4) return { peso: 1, rival: null, rank: null };
    const a = claveEq(partes[0]), b = claveEq(partes[1]);
    const rival = a === miClave ? b : a;
    const pct = f.mapa.get(rival);
    if (pct === undefined) return { peso: 1, rival, rank: null };
    const menores = f.pcts.filter(v => v < pct).length;
    const rank = menores / Math.max(1, f.pcts.length - 1);  // 0..1
    const [lo, hi] = U.pesoRival;
    return { peso: lo + (hi - lo) * rank, rival, rank };
  }

  function mediaPonderada(vals, pesos) {
    const sw = suma(pesos);
    return sw > 0 ? suma(vals.map((v, i) => v * pesos[i])) / sw : null;
  }

  /** Plays por 40 de un conjunto de partidos (sobre totales: un partido de
      muy pocos minutos no manda). */
  function usoPer40(ps) {
    const m = suma(ps.map(p => num(p['MIN']) || 0));
    const pl = suma(ps.map(p => num(p['PLAYS']) || 0));
    return m > 0 ? pl / m * 40 : null;
  }

  /**
   * Analiza el historial de UN jugador (ascendente). `ctx` = { idx, clave }.
   * Devuelve { estado, ... }:
   *   estado  'caliente' | 'fria' | 'ancla' | 'neutro' | 'sin-muestra'
   *   descartada  'uso' | 'minutos'  (la eficiencia subió pero no cuenta)
   *   carga   { minVentana, minBase, ratio, minTotal }  (alerta física)
   *   causaFria  { id, texto }  (en un tirador)
   */
  function analizar(partidos, ctx) {
    const idx = ctx && ctx.idx;
    const U = umbrales(idx);
    const todos = jugados(partidos, U);
    if (todos.length < U.ventana + U.base) {
      return { estado: 'sin-muestra', jugados: todos.length, necesarios: U.ventana + U.base };
    }
    const miClave = claveEq((ctx && ctx.equipo) || (todos[0] && todos[0]['EQUIPO']));
    const vent = todos.slice(-U.ventana), base = todos.slice(0, todos.length - U.ventana);
    const pv = vent.map(p => pesoRival(idx, p, U, miClave)), pb = base.map(p => pesoRival(idx, p, U, miClave));
    const ev = vent.map(eficiencia), eb = base.map(eficiencia);
    const mVent = mediaPonderada(ev, pv.map(x => x.peso));
    const mBase = mediaPonderada(eb, pb.map(x => x.peso));

    /* El σ del jugador, con el piso de la competencia. */
    const propio = sd(eb);
    const liga = sigmaLiga(idx);
    const sigma = Math.max(propio || 0, liga ? liga.p25 : 0) || null;
    if (!sigma) return { estado: 'sin-muestra', jugados: todos.length, necesarios: U.ventana + U.base };

    const diff = mVent - mBase;
    const z = diff / (sigma / Math.sqrt(vent.length));
    const dSigma = diff / sigma;   // en σ por noche: para el ⚓

    const usoV = usoPer40(vent), usoB = usoPer40(base);
    const usoRatio = (usoV !== null && usoB) ? usoV / usoB : null;
    const minV = prom(vent.map(p => p['MIN'])), minB = prom(base.map(p => p['MIN']));
    const rivalesFuertes = pv.filter(x => x.rank !== null && x.rank >= 2 / 3).length;
    const out = {
      estado: 'neutro', z, dSigma, sigma, sigmaPropio: propio, sigmaLiga: liga ? liga.p25 : null,
      efVentana: mVent, efBase: mBase, jugados: todos.length, ventana: vent.length,
      usoVentana: usoV, usoBase: usoB, usoRatio, minVentana: minV, minBase: minB,
      rivalesFuertes, pesoMedio: prom(pv.map(x => x.peso)),
    };

    const usoOk = usoRatio !== null && usoRatio >= U.usoMinRatio;
    const minutosOk = minV >= U.minutosVentana;

    if (z >= U.z) {
      if (!minutosOk) out.descartada = 'minutos';
      else if (!usoOk) out.descartada = 'uso';
      else out.estado = 'caliente';
    } else if (z <= -U.z) {
      if (!minutosOk) out.descartada = 'minutos';
      else out.estado = 'fria';
    } else if (Math.abs(dSigma) <= U.ancla) {
      out.estado = 'ancla';
    }

    /* Alerta física: solo junto a una racha caliente. */
    if (out.estado === 'caliente' && minB > 0 && minV / minB >= U.cargaRatio && minV - minB >= U.cargaMinutos) {
      out.carga = { minVentana: minV, minBase: minB, ratio: minV / minB, minTotal: suma(vent.map(p => p['MIN'])) };
    }

    /* Un tirador frío: ¿de dónde parece venir? */
    if (out.estado === 'fria') out.causaFria = causaFria(vent, base, pv, idx, U);
    return out;
  }

  function causaFria(vent, base, pv, idx, U) {
    const t3b = prom(base.map(p => num(p['T3I']) || 0));
    if (t3b === null || t3b < U.tiradorT3) return null;
    const tciV = suma(vent.map(p => num(p['TCI']) || 0)), tciB = suma(base.map(p => num(p['TCI']) || 0));
    const minV = suma(vent.map(p => p['MIN'])), minB = suma(base.map(p => p['MIN']));
    const volV = minV ? tciV / minV * 40 : null, volB = minB ? tciB / minB * 40 : null;
    const t3V = suma(vent.map(p => num(p['T3I']) || 0)), t3B = suma(base.map(p => num(p['T3I']) || 0));
    const shV = tciV ? t3V / tciV : null, shB = tciB ? t3B / tciB : null;
    /* Defensa de los rivales de la ventana: percentil de eFG Opp%. */
    let defP = null;
    if (idx && typeof idx.leer === 'function') {
      const ps = pv.map(x => x.rival).filter(Boolean).map(c => {
        const r = idx.leer(c, 'eFG Opp%');
        return r && typeof r.percentil === 'number' ? r.percentil : null;
      }).filter(v => v !== null);
      defP = ps.length ? prom(ps) : null;
    }
    if (volV !== null && volB && volV / volB < U.bajaVolumen) {
      return { id: 'volumen', texto: 'Tira menos por 40 minutos que antes (' + volV.toFixed(1).replace('.', ',') + ' contra ' + volB.toFixed(1).replace('.', ',') + '): puede ser un ajuste defensivo rival (presión al perímetro, negarle la recepción) o un cambio de rol.' };
    }
    if (shV !== null && shB !== null && Math.abs(shV - shB) >= U.saltoSeleccion) {
      return { id: 'seleccion', texto: 'Cambió la selección de tiro: ' + Math.round(shV * 100) + ' % de sus tiros son triples, contra ' + Math.round(shB * 100) + ' % antes.' };
    }
    if (defP !== null && defP >= 66) {
      return { id: 'defensa-rival', texto: 'Enfrentó defensas por encima de la media de la competencia (percentil ' + Math.round(defP) + ' en eFG% permitido): el bache pesa menos que una mala noche contra rivales flojos.' };
    }
    return { id: 'conversion', texto: 'Tira lo mismo y de la misma zona del box score, pero convierte menos: parece un tema de acierto más que de selección o de marca.' };
  }

  const fx = (v, d) => (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(d === undefined ? 1 : d).replace('.', ',');

  /** El texto para el tooltip / la lectura: siempre con el número. */
  function lectura(r) {
    if (!r) return '';
    if (r.estado === 'sin-muestra') return 'Sin muestra para leer una racha: ' + r.jugados + ' partidos jugados, hacen falta ' + r.necesarios + '.';
    const base = 'Últimos ' + r.ventana + ' partidos: eficiencia ' + fx(r.efVentana * 100) + ' % contra ' + fx(r.efBase * 100) + ' % antes (' + (r.z >= 0 ? '+' : '') + fx(r.z) + ' σ del promedio de ' + r.ventana + ' partidos; σ ' + fx(r.sigma * 100) + ' pts de %).';
    const uso = r.usoRatio !== null ? ' Uso: ' + fx(r.usoVentana) + ' plays por 40 min (' + Math.round(r.usoRatio * 100) + ' % de su base).' : '';
    const riv = r.rivalesFuertes ? ' ' + r.rivalesFuertes + ' de ' + r.ventana + ' ante rivales del tercio alto.' : '';
    if (r.descartada === 'uso') return base + uso + ' La eficiencia subió pero su uso no: no se marca como racha.';
    if (r.descartada === 'minutos') return base + ' Promedia ' + fx(r.minVentana) + ' min: minutos residuales, no se marca.';
    let t = base + uso + riv;
    if (r.carga) t += ' ⚠ Carga: ' + fx(r.carga.minVentana) + ' min por partido contra ' + fx(r.carga.minBase) + ' antes.';
    if (r.causaFria) t += ' ' + r.causaFria.texto;
    return t;
  }

  /** Chip: { emoji, texto, estado, tooltip, carga } o null si no hay nada que marcar. */
  function chip(r) {
    if (!r || (r.estado !== 'caliente' && r.estado !== 'fria' && r.estado !== 'ancla')) return null;
    return { estado: r.estado, emoji: EMOJI[r.estado], texto: ETIQUETA[r.estado], tooltip: lectura(r), carga: !!r.carga };
  }

  return { UMBRALES, EMOJI, ETIQUETA, umbrales, eficiencia, jugados, sigmaLiga, fuerzaRivales, pesoRival, usoPer40, analizar, lectura, chip };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SGADD_RACHAS;
