/* =====================================================================
   centro-mando/motor.js · el motor PURO del Centro de Mando Editorial

   Nada de red, de disco ni de `document`: entra lo que arma
   `generar-contenido.js` y salen PROPUESTAS, cada una con tres ganchos.

   LAS REGLAS

     · NINGÚN NÚMERO NACE ACÁ. Los ganchos se arman con el título, el dato
       y el guion que ya trae la receta; este módulo elige y reordena
       frases, no calcula métricas.
     · UNA PIEZA SIN DATOS SE MUESTRA SIN DATOS, con su motivo. No se
       esconde ni se rellena.
     · EL APRENDIZAJE REORDENA, NO FILTRA. Un formato que rindió mal baja
       en la lista; no desaparece. Y con menos de tres publicaciones
       medidas no opina (la regla de la muestra del punto 4).
   ===================================================================== */
'use strict';

/* Qué mide cada pieza. Es lo que llena el selector «Eje táctico». */
const PIEZAS = {
  'CR-01': { formato: 'carrusel', eje: 'eficiencia', label: 'ORTG por jugada contra por posesión' },
  'CR-02': { formato: 'carrusel', eje: 'tiro', label: 'Tiradores rentables que anotan poco' },
  'CR-03': { formato: 'carrusel', eje: 'falta', label: 'La falta táctica como negocio' },
  'CR-04': { formato: 'carrusel', eje: 'varas', label: 'La misma vara en otra liga' },
  'CR-05': { formato: 'carrusel', eje: 'tendencia', label: 'Ciclo ganador con el tiro en baja' },
  'CR-06': { formato: 'carrusel', eje: 'perfiles', label: 'Perfiles afines de otros equipos' },
  'RL-01': { formato: 'reel', eje: 'quintetos', label: 'Quintetos que ganan y «rinden negativo»' },
  'RL-02': { formato: 'reel', eje: 'cierre', label: 'Quién decide los finales' },
  'RL-03': { formato: 'reel', eje: 'tiro', label: 'Cuánto vale cada zona de tiro' },
  'RL-04': { formato: 'reel', eje: 'momentum', label: 'Parciales sin respuesta' },
};

/* El ENFOQUE de cada pieza: de qué lado de la cancha habla. Es lo que
   recorre «Cambiar enfoque» en la bandeja. */
const ENFOQUES = { ataque: 'Ataque', defensa: 'Defensa', faltas: 'Faltas' };
const ENFOQUE_DE = {
  'CR-01': 'ataque', 'CR-02': 'defensa', 'CR-03': 'faltas', 'CR-04': 'faltas', 'CR-05': 'ataque', 'CR-06': 'ataque',
  'RL-01': 'ataque', 'RL-02': 'defensa', 'RL-03': 'ataque', 'RL-04': 'defensa',
  'FEED-GENERADORES': 'ataque', 'FEED-T3': 'ataque', 'FEED-T2': 'ataque', 'FEED-T1': 'faltas', 'FEED-RO': 'ataque',
};

/* El TONO no reescribe el texto —no hay quien lo redacte—: elige qué
   gancho va primero y qué dice la píldora de la portada. */
const TONOS = {
  tactico: { label: 'Táctico', estilo: 'dato', pildora: 'PARA CUERPOS TÉCNICOS' },
  polemico: { label: 'Polémico', estilo: 'titular', pildora: 'CONTRA LA INTUICIÓN' },
  educativo: { label: 'Educativo', estilo: 'pregunta', pildora: 'CÓMO LEERLO' },
};

const EJES = {
  eficiencia: 'Eficiencia ofensiva', tiro: 'Tiro y selección', falta: 'Falta táctica', varas: 'Varas y niveles',
  tendencia: 'Tendencia y ciclos', perfiles: 'Perfiles de jugador', quintetos: 'Quintetos',
  cierre: 'Cierres ajustados', momentum: 'Momentum', generacion: 'Generación', rebote: 'Rebote ofensivo',
};

/* Las cinco categorías del feed de Nivel 1 (`FEED-<ID>`). */
const EJE_DE_FEED = { GENERADORES: 'generacion', T3: 'tiro', T2: 'tiro', T1: 'falta', RO: 'rebote' };

const FORMATOS = {
  stories: { label: 'Stories Top 3 de la fecha (9:16)', nivel: 1, soloConNombres: true },
  feed: { label: 'Posteo de feed que profundiza (3:4)', nivel: 1 },
  carrusel: { label: 'Carrusel 3:4 · Nivel 2', nivel: 2 },
  reel: { label: 'Reel 9:16 · Nivel 2', nivel: 2, pidePbp: true },
};

/* «Destacadas de la fecha»: todo lo que esa zona puede dar, junto. No es
   un formato de publicación, así que vive aparte de FORMATOS. */
const AUTO = 'auto';

const ESTILOS = { dato: 'El dato primero', titular: 'El titular', pregunta: 'La pregunta' };

/** Lo que la página necesita para armar sus selectores. */
function opciones(LIGAS) {
  return {
    ligas: Object.keys(LIGAS).map((id) => ({
      id, torneo: LIGAS[id].torneo, nombres: !!LIGAS[id].nombres,
      zonas: Object.keys(LIGAS[id].zonas).map((z) => ({ id: z, label: LIGAS[id].zonas[z].label || 'Única', pbp: !!LIGAS[id].zonas[z].pbp })),
    })),
    formatos: [{ id: AUTO, label: 'Destacadas de la fecha (todo lo disponible)', nivel: 0 }].concat(Object.keys(FORMATOS).map((id) => Object.assign({ id }, FORMATOS[id]))),
    ejes: EJES,
    piezas: Object.keys(PIEZAS).map((id) => Object.assign({ id }, PIEZAS[id])),
    estilos: ESTILOS, enfoques: ENFOQUES, tonos: Object.keys(TONOS).reduce((a, k) => { a[k] = TONOS[k].label; return a; }, {}),
  };
}

/** Las piezas de Nivel 2 que corresponden a un formato y a un eje. */
function piezasPara(formato, eje) {
  return Object.keys(PIEZAS).filter((id) => PIEZAS[id].formato === formato && (!eje || PIEZAS[id].eje === eje));
}

/** Por qué un formato no se puede pedir para esa zona, o null. */
function motivoSinFormato(formato, liga, zona) {
  const f = FORMATOS[formato];
  if (!f) return 'Ese formato no existe.';
  if (f.soloConNombres && !liga.nombres) return 'Las Stories «Top 3 de la fecha» solo se publican de APdeB: van con nombre.';
  if (f.pidePbp && !zona.pbp) return 'Sin datos de PBP para esta liga.';
  return null;
}

const primeraOracion = (t) => { const m = String(t || '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(t || '')).trim(); };
const pregunta = (lineas) => {
  for (let i = lineas.length - 1; i >= 0; i--) { const m = String(lineas[i] || '').match(/¿[^?]+\?/); if (m) return '¿' + m[0].charAt(1).toUpperCase() + m[0].slice(2); }
  return null;
};

/**
 * Tres ganchos para una pieza, uno por estilo. El de pregunta sale del
 * propio guion; si el guion no trae ninguna, ese estilo NO se inventa.
 */
function ganchos(titulo, dato, lineas) {
  const out = [];
  if (dato) out.push({ estilo: 'dato', texto: primeraOracion(dato) });
  if (titulo) out.push({ estilo: 'titular', texto: String(titulo).trim() });
  const q = pregunta(lineas || []);
  if (q) out.push({ estilo: 'pregunta', texto: q });
  return out.filter((g, i, a) => g.texto && a.findIndex((x) => x.texto === g.texto) === i);
}

/** Una receta de Nivel 2 → propuesta. */
function deReceta(p) {
  const def = PIEZAS[p.id] || {};
  if (!p.ok) {
    return { id: p.id, ok: false, formato: def.formato || null, eje: def.eje || null, enfoque: ENFOQUE_DE[p.id] || null, titulo: def.label || p.id, avisos: p.avisos || [] };
  }
  return {
    id: p.id, ok: true, formato: def.formato, eje: def.eje, enfoque: ENFOQUE_DE[p.id] || null, formatoLabel: p.formato, titulo: p.titulo, dato: p.dato,
    guion: p.guion || [], muestra: p.muestra || null, datos: p.datos || null, avisos: p.avisos || [],
    ganchos: ganchos(p.titulo, p.dato, p.guion),
  };
}

/** Un posteo de feed de Nivel 1 → propuesta. */
function deFeed(f, elegida) {
  const cat = String(f.id || '').replace(/^FEED-/, '');
  const textos = (f.slides || []).map((s) => s.texto).filter(Boolean);
  const liga = (f.slides || []).find((s) => s.rol === 'La liga');
  return {
    id: f.id, ok: true, formato: 'feed', eje: EJE_DE_FEED[cat] || null, enfoque: ENFOQUE_DE[f.id] || null, formatoLabel: f.formato, titulo: f.titulo,
    dato: liga ? liga.texto : (textos[1] || ''), guion: (f.slides || []).map((s) => s.rol + (s.texto ? ': ' + s.texto : '')),
    muestra: { deriva: f.deriva, contraste: f.contraste }, datos: { slides: f.slides || [] },
    avisos: elegida ? ['Es la que propone el generador: la de mayor contraste.'] : [],
    ganchos: ganchos(f.titulo, liga && liga.texto, textos),
  };
}

/** Las Stories del Top 3 → UNA propuesta, con sus rankings. */
function deStories(st, avisos) {
  const r = (st.placas || []).filter((x) => x.tipo === 'ranking');
  const m = st.meta || {};
  const titulo = 'Top 3 de la fecha' + (m.fecha ? ' ' + m.fecha : '') + (m.zona ? ' · ' + m.zona : '');
  return {
    id: 'STORIES', ok: true, formato: 'stories', eje: null, enfoque: null, formatoLabel: st.formato, titulo,
    dato: r.length + ' rankings sobre ' + (m.partidos || 0) + ' partidos, del ' + m.desde + ' al ' + m.hasta + '.',
    guion: (st.placas || []).map((x) => x.titulo || x.texto || x.tipo), muestra: { partidos: m.partidos, desde: m.desde, hasta: m.hasta },
    datos: { placas: st.placas || [], meta: m, formato: st.formato, anonimo: !!st.anonimo }, avisos: avisos || [],
    ganchos: [{ estilo: 'titular', texto: titulo }],
  };
}

/* --------------------------------------------------------------------
   EL APRENDIZAJE
   -------------------------------------------------------------------- */
const PESOS_INTERACCION = { guardados: 3, compartidos: 4, comentarios: 2, likes: 1 };
const MIN_MUESTRA = 3;
const PISO = 0.5, TECHO = 2;

const entero = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? Math.round(n) : null; };

/**
 * Lo que queda en el historial cuando una pieza se APRUEBA (se exporta):
 * qué se publicó y con qué gancho, SIN métricas. El alcance y las
 * interacciones no existen todavía y no se inventan: se completan después
 * con `medir`, y hasta entonces el registro no entra a las ponderaciones.
 */
/* El día de quien aprueba, NO el de UTC: a las 21 h de Argentina
   `toISOString()` ya dice mañana, y la pieza quedaría fechada un día después. */
function diaLocal(t) {
  const d = t || new Date(), dos = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate());
}

function registroDeAprobacion(p, gancho, liga, ahora) {
  const t = ahora || new Date();
  return {
    id: t.getTime().toString(36) + '-' + String(p.id).toLowerCase(), estado: 'aprobada', aprobada: t.toISOString(), fecha: diaLocal(t),
    pieza: String(p.id).toUpperCase(), formato: p.formato, estilo: (gancho && gancho.estilo) || null,
    gancho: String((gancho && gancho.texto) || p.titulo || '').slice(0, 300), liga: String(liga || '').slice(0, 40), titulo: String(p.titulo || '').slice(0, 200),
    enfoque: ENFOQUES[p.enfoque] ? p.enfoque : null, tono: TONOS[p.tono] ? p.tono : null,
    redaccion: p.redaccion === 'ia' ? 'ia' : 'plantilla',
  };
}

/** Le carga las métricas a un registro del historial. Devuelve la lista NUEVA. */
function medir(registros, id, metricas) {
  const i = (registros || []).findIndex((r) => r.id === id);
  if (i === -1) return { ok: false, error: 'Esa pieza no está en el historial.' };
  const previo = registros[i];
  const v = normalizarRegistro(Object.assign({}, previo, metricas, { pieza: previo.pieza, formato: previo.formato, estilo: previo.estilo, gancho: previo.gancho, liga: previo.liga }));
  if (!v.ok) return v;
  const lista = registros.slice();
  lista[i] = Object.assign({}, previo, v.registro, { estado: 'medida', fecha: previo.fecha || v.registro.fecha });
  return { ok: true, registros: lista };
}

/** Valida lo que se carga a mano de Instagram. Devuelve {ok, registro|error}. */
function normalizarRegistro(b) {
  const x = b || {};
  const pieza = String(x.pieza || '').trim().toUpperCase();
  if (!pieza) return { ok: false, error: 'Falta la pieza.' };
  if (!FORMATOS[x.formato]) return { ok: false, error: 'El formato tiene que ser uno de: ' + Object.keys(FORMATOS).join(', ') + '.' };
  if (x.estilo && !ESTILOS[x.estilo]) return { ok: false, error: 'El estilo de gancho no existe.' };
  const alcance = entero(x.alcance);
  if (!alcance) return { ok: false, error: 'El alcance tiene que ser un número mayor que cero: sin él no hay tasa que comparar.' };
  const reg = { pieza, formato: x.formato, estilo: x.estilo || null, gancho: String(x.gancho || '').slice(0, 300), liga: String(x.liga || '').slice(0, 40), alcance };
  for (const k of Object.keys(PESOS_INTERACCION)) {
    const n = entero(x[k] == null || x[k] === '' ? 0 : x[k]);
    if (n == null) return { ok: false, error: '«' + k + '» tiene que ser un número.' };
    reg[k] = n;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(x.fecha || ''))) reg.fecha = x.fecha;
  return { ok: true, registro: reg };
}

/** Interacciones ponderadas cada 100 cuentas alcanzadas. */
function puntaje(r) {
  if (!r || !(r.alcance > 0)) return null;
  const suma = Object.keys(PESOS_INTERACCION).reduce((a, k) => a + PESOS_INTERACCION[k] * (Number(r[k]) || 0), 0);
  return suma / r.alcance * 100;
}

/**
 * El peso de cada formato, pieza y estilo de gancho: su puntaje medio
 * sobre el de todas las publicaciones, acotado. Con menos de
 * MIN_MUESTRA publicaciones en un grupo, ese grupo pesa 1.
 */
function ponderaciones(registros) {
  const medidos = (registros || []).map((r) => ({ r, p: puntaje(r) })).filter((x) => x.p != null);
  const media = medidos.length ? medidos.reduce((a, x) => a + x.p, 0) / medidos.length : 0;
  const grupo = (campo) => {
    const g = {};
    medidos.forEach((x) => { const k = x.r[campo]; if (!k) return; (g[k] = g[k] || []).push(x.p); });
    const out = {};
    Object.keys(g).forEach((k) => {
      const n = g[k].length, prom = g[k].reduce((a, v) => a + v, 0) / n;
      const confiable = n >= MIN_MUESTRA && media > 0;
      out[k] = { n, puntaje: prom, peso: confiable ? Math.min(TECHO, Math.max(PISO, prom / media)) : 1, confiable };
    });
    return out;
  };
  return { publicaciones: medidos.length, media, formato: grupo('formato'), pieza: grupo('pieza'), estilo: grupo('estilo'), tono: grupo('tono'), enfoque: grupo('enfoque') };
}

const pesoDe = (g, k) => (g && g[k] ? g[k].peso : 1);

/**
 * Ordena las propuestas y, adentro de cada una, sus ganchos. Las que no
 * tienen datos van al final, en su orden. El orden es ESTABLE: sin
 * aprendizaje cargado, sale el del generador.
 */
function ordenar(propuestas, pond) {
  const w = pond || { formato: {}, pieza: {}, estilo: {} };
  const con = propuestas.map((p, i) => {
    if (!p.ok) return { p, i, peso: -1 };
    const peso = pesoDe(w.formato, p.formato) * pesoDe(w.pieza, p.id);
    const gs = p.ganchos.map((g, j) => ({ g: Object.assign({}, g, { peso: pesoDe(w.estilo, g.estilo) }), j }))
      .sort((a, b) => (b.g.peso - a.g.peso) || (a.j - b.j)).map((x) => x.g);
    return { p: Object.assign({}, p, { peso, ganchos: gs }), i, peso };
  });
  return con.sort((a, b) => (b.peso - a.peso) || (a.i - b.i)).map((x) => x.p);
}

/** Todo lo que salió del generador → lista de propuestas ya ordenada. */
function propuestas(salida, filtros, pond) {
  const s = salida || {}, f = filtros || {};
  let lista = [];
  if (s.nivel2) lista = lista.concat(s.nivel2.piezas.map(deReceta));
  const auto = f.formato === AUTO;
  if (s.nivel1 && (f.formato === 'stories' || (auto && f.stories))) lista.push(deStories(s.nivel1.stories, s.nivel1.avisos));
  if (s.nivel1 && (f.formato === 'feed' || auto)) {
    const fd = s.nivel1.feed;
    let feeds = [fd.posteo].concat(fd.alternativas || []).filter(Boolean);
    /* En «destacadas» solo entra el feed que encontró una anomalía: con
       contraste 0, ningún líder de volumen queda bajo la mediana. */
    if (auto) feeds = feeds.filter((x) => x.contraste > 0).sort((a, b) => b.contraste - a.contraste);
    lista = lista.concat(feeds.map((x) => deFeed(x, x === fd.posteo)));
  }
  if (f.eje) lista = lista.filter((p) => !p.eje || p.eje === f.eje);
  return ordenar(lista, pond);
}

/* --------------------------------------------------------------------
   LA BANDEJA · lo que se propone esta quincena
   -------------------------------------------------------------------- */
const MAX_BANDEJA = 6;
const orden3 = Object.keys(ENFOQUES);

/** Una propuesta con su tono: el gancho de ese estilo pasa adelante. */
function conTono(p, tono) {
  const t = TONOS[tono] ? tono : 'tactico';
  if (!p.ok) return Object.assign({}, p, { tono: t });
  const gs = (p.ganchos || []).slice().sort((a, b) => (b.estilo === TONOS[t].estilo) - (a.estilo === TONOS[t].estilo));
  return Object.assign({}, p, { tono: t, ganchos: gs });
}

/**
 * De todo lo generado, qué entra a la bandeja: las Stories (si hay) y
 * hasta MAX_BANDEJA piezas REPARTIDAS entre los tres enfoques, cada una
 * en el orden en que llegó (que ya es el del aprendizaje). El resto
 * queda en reserva, que es de donde saca «Cambiar enfoque».
 */
function armarBandeja(propuestas, sello) {
  const con = propuestas.filter((p) => p.ok), sinDatos = propuestas.filter((p) => !p.ok).map((p) => ({ id: p.id, titulo: p.titulo, avisos: p.avisos }));
  const elegidas = con.filter((p) => !p.enfoque);
  const colas = orden3.map((e) => con.filter((p) => p.enfoque === e));
  const piezas = [];
  for (let vuelta = 0; piezas.length < MAX_BANDEJA && colas.some((c) => c.length > vuelta); vuelta++) {
    colas.forEach((c) => { if (c[vuelta] && piezas.length < MAX_BANDEJA) piezas.push(c[vuelta]); });
  }
  const reserva = con.filter((p) => p.enfoque && piezas.indexOf(p) === -1);
  const items = elegidas.concat(piezas).map((p, i) => ({ uid: (sello || 'b') + '-' + i, estado: 'pendiente', propuesta: conTono(p, 'tactico') }));
  return { items, reserva, sinDatos };
}

/**
 * Pone la redacción de la IA sobre una propuesta. Los ganchos de la IA van
 * primero (el del estilo del tono, adelante) y los del generador quedan
 * detrás, elegibles. Lo que la guarda descartó no llega acá: el título o
 * el guion que falten son los del generador. El DATO no se toca.
 */
function aplicarRedaccion(p, red) {
  if (!red || !p.ok) return p;
  const estilo = TONOS[p.tono] ? TONOS[p.tono].estilo : null;
  const ia = (red.ganchos || []).slice().sort((a, b) => (b.estilo === estilo) - (a.estilo === estilo));
  const resto = (p.ganchos || []).filter((g) => !ia.some((x) => x.texto === g.texto));
  const out = Object.assign({}, p, { titulo: red.titulo || p.titulo, guion: red.guion || p.guion, ganchos: ia.concat(resto), redaccion: 'ia',
    redaccionDescartada: (red.descartado || []).length });
  /* Las placas de la IA reemplazan al guion como estructura de la pieza;
     el copy, al de plantilla. Lo que la guarda tiró no llega acá. */
  if (red.placas && red.placas.length) { out.placas = red.placas; out.guion = red.placas.map((x) => ROLES[x.rol] + ': ' + (x.titulo ? x.titulo + ' · ' : '') + x.texto); }
  if (red.copy) out.copy = red.copy;
  return out;
}

const itemDe = (b, uid) => { const i = (b.items || []).findIndex((x) => x.uid === uid); if (i === -1) throw new Error('Esa propuesta ya no está en la bandeja.'); return i; };

/** Cambia la pieza de un ítem por la primera de la reserva del enfoque que sigue. */
function cambiarEnfoque(b, uid) {
  const i = itemDe(b, uid), actual = b.items[i].propuesta;
  if (!actual.enfoque) throw new Error('Esta pieza no tiene enfoque: es el resumen de la fecha.');
  const desde = orden3.indexOf(actual.enfoque);
  for (let paso = 1; paso <= orden3.length; paso++) {
    const e = orden3[(desde + paso) % orden3.length];
    const j = (b.reserva || []).findIndex((p) => p.enfoque === e && (paso < orden3.length || p.id !== actual.id));
    if (j === -1) continue;
    const reserva = b.reserva.slice(), items = b.items.slice();
    const nueva = reserva.splice(j, 1)[0];
    reserva.push(Object.assign({}, actual));
    /* Es OTRA pieza: la base y las redacciones de la anterior no le sirven. */
    items[i] = { uid: items[i].uid, estado: items[i].estado, propuesta: conTono(nueva, actual.tono) };
    reserva[reserva.length - 1] = items0(b, i);
    return Object.assign({}, b, { items, reserva });
  }
  throw new Error('No queda otra pieza con datos en la reserva para cambiar el enfoque.');
}

/* La pieza tal como salió del generador, sin redacción encima. */
const items0 = (b, i) => { const it = b.items[i]; return Object.assign({}, it.base || it.propuesta, { tono: undefined }); };

/**
 * Pasa al tono que sigue. Parte SIEMPRE de la pieza del generador
 * (`base`), no de la redacción anterior; si ese tono ya se redactó, la
 * repone sin volver a pedirla.
 */
function cambiarTono(b, uid) {
  const i = itemDe(b, uid), it = b.items[i], ts = Object.keys(TONOS);
  const tono = ts[(ts.indexOf(it.propuesta.tono) + 1) % ts.length];
  const base = it.base || it.propuesta;
  const items = b.items.slice();
  items[i] = Object.assign({}, it, { propuesta: aplicarRedaccion(conTono(base, tono), (it.redacciones || {})[tono]) });
  return Object.assign({}, b, { items });
}

/** Guarda la redacción de la IA de un ítem en un tono y la aplica si es el tono vigente. */
function guardarRedaccion(b, uid, tono, red) {
  const i = itemDe(b, uid), it = b.items[i];
  const base = it.base || it.propuesta;
  const redacciones = Object.assign({}, it.redacciones, { [tono]: red });
  const items = b.items.slice();
  items[i] = Object.assign({}, it, { base, redacciones, propuesta: it.propuesta.tono === tono ? aplicarRedaccion(conTono(base, tono), red) : it.propuesta });
  return Object.assign({}, b, { items });
}

function marcar(b, uid, estado) {
  const i = itemDe(b, uid), items = b.items.slice();
  items[i] = Object.assign({}, items[i], { estado });
  return Object.assign({}, b, { items });
}

/** Suma una propuesta del laboratorio arriba de todo. */
function sumarABandeja(b, p, sello) {
  const base = b && b.items ? b : { items: [], reserva: [], sinDatos: [] };
  return Object.assign({}, base, { items: [{ uid: 'lab-' + (sello || Date.now().toString(36)), estado: 'pendiente', propuesta: conTono(p, 'tactico') }].concat(base.items) });
}

/* --------------------------------------------------------------------
   LAS PLACAS · un HTML por propuesta, importable a Canva
   Misma línea gráfica que `contenido/placas/`: una <section> por placa
   con `data-document-role="page"` e imágenes por URL pública.
   -------------------------------------------------------------------- */
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LOGO = 'https://coachgn.github.io/estadisticas/logos/motorlogo.PNG';

/* --------------------------------------------------------------------
   LA NARRATIVA DE REFERENTE · cuatro momentos, cantidad de placas libre
   Sale del carrusel «PROBLEMA REAL» de la cuenta (¿A qué velocidad se
   juega en La Plata?): planteo, evidencia, lectura y cierre.
   -------------------------------------------------------------------- */
const ROLES = { gancho: 'Gancho', evidencia: 'Evidencia', propuesta: 'Propuesta', cierre: 'Cierre' };
const MIN_PLACAS = 4, MAX_PLACAS = 10;
const CTA_COMENTARIO = 'Comentá «CONTEXTO» y te mandamos una demo cargada con los datos de tu torneo.';
const HASHTAGS = '#MotorStatsAR #ScoutingBasquet #AnalisisTactico #BasquetArgentina #CuerpoTecnico #EstadisticasBasquet';

/* --------------------------------------------------------------------
   LA VOZ · una sola, para el redactor del servidor y para el prompt
   alternativo que se copia a otra IA. Con dos textos, la pieza redactada
   acá y la que vuelve de afuera hablarían distinto.

   El pedido del club (2026-10-13): la redacción describía el número y
   nada más. Un entrenador-analista no describe: explica POR QUÉ pasa,
   dice qué CUESTA no verlo y qué se GANA al dominarlo, discute el sentido
   común de la categoría y deja preguntas para auditar el equipo propio.
   -------------------------------------------------------------------- */
const VOZ = [
  'Sos la voz de @motorstats.ar, una cuenta de Instagram de analítica de básquet argentino. Escribís como un ENTRENADOR-ANALISTA de élite dando una clínica: un REFERENTE que estuvo en el banco, vio mil partidos y le habla de igual a igual a cuerpos técnicos y dirigentes. Castellano rioplatense (vos, tenés, mirá).',
  'Tu trabajo NO es describir el número: es INTERPRETARLO. Vos no leés tablas: leés DINÁMICAS DE JUEGO. Un texto que repite lo que ya dice la tabla («el equipo A tiene tal porcentaje y el B tal otro») está mal escrito y se tira. El dato es la prueba; lo que se publica es tu postura.',
  'LA TESIS DE VESTUARIO: toda pieza defiende UNA postura táctica contundente, y la planta en la primera línea. Una tesis es una afirmación sobre cómo se juega, que un entrenador podría discutirte en el vestuario. Del tipo: «Cargar el rebote ofensivo no es un capricho de ganas: es la forma más barata de comprar posesiones». NO es una tesis «el rebote ofensivo es importante» (no dice nada) ni «7 de 12 equipos…» (eso es el dato). Si el dato no sostiene la creencia de la categoría, la tesis es esa: decilo de frente.',
];
const CAPAS = [
  'LAS CAPAS QUE TIENE QUE TENER LA PIEZA',
  '- EL POR QUÉ · el trasfondo táctico. Qué pasa en la cancha para que ese número salga así: qué decisión, qué hábito, qué cuenta mal hecha lo produce. Es un mecanismo GENERAL del juego, que cualquier entrenador reconoce, y lo escribís como lectura («esto suele pasar cuando…», «detrás de este número hay…»).',
  '- EL DOLOR · lo que cuesta, dicho en la moneda del juego y sin números inventados: posesiones que se regalan, puntos por posesión que se dejan en la cancha, el desgaste de defender dos veces la misma jugada, piernas que no llegan al último cuarto, y el golpe anímico de conceder la jugada que no había que conceder en el cierre. Y lo que cuesta en el oficio: qué decide a ciegas el cuerpo técnico que no lo mide, en la charla, en la rotación, en el scouting del rival.',
  '- EL BENEFICIO · qué gana el que lo domina: qué puede decidir distinto en la próxima práctica o en el próximo partido.',
  '- LA OTRA MIRADA · un ángulo que discuta el sentido común de la categoría: lo que se repite en los vestuarios y el dato no sostiene, o lo que todos miran y no es lo que importa.',
  '- LAS PREGUNTAS DISPARADORAS · preguntas de AUDITORÍA incisivas, que el entrenador pueda contestar mirando a su propio equipo y que lo dejen incómodo si no sabe la respuesta («¿Sabés cuántas…?», «¿Quién de los tuyos…?», «¿Cuándo fue la última vez que mediste…?»). Nada de preguntas retóricas vacías ni de «¿qué opinás?».',
];
const ESTILO = [
  'EL ESTILO',
  '- Punch. Títulos CORTOS, de hasta ocho palabras, que se lean de un golpe en una placa. Frases directas, con ritmo; una idea por frase. Segunda persona e imperativos («Mirá», «Contá», «Auditá», «Dejá de…»).',
  '- Léxico de cancha rioplatense, usado con naturalidad: cancha, cristal, pintura, balance defensivo, segunda oportunidad, rotación, cierre, la bola, el banco, la charla técnica. Nada de anglicismos que acá no se dicen.',
  '- TÉRMINOS EXACTOS, no metáforas. Cada cosa por su nombre de cancha: «contraataque rival», «balance defensivo», «puntos de transición», «retroceso», «cierre del rebote», «rotación defensiva», «ayuda y recupero». Quienes corren, atacan o defienden son los JUGADORES y los EQUIPOS, nunca una zona de la cancha ni un número: «el rival sale de contraataque» está bien; «la pintura que corre» no existe. Si una imagen no la diría un entrenador en la charla técnica, sacala.',
  '- Afirmás con seguridad lo que el dato sostiene y marcás como lectura lo que es lectura. Si el dato es flojo —una relación débil, una muestra chica—, la postura es ESA y se dice con la misma contundencia: no lo infles.',
  '- Las capas se notan en lo que decís, no se anuncian: no las uses de rótulo («El dolor de no verlo:», «El beneficio:», «La otra mirada:»). Entrá directo a la idea.',
  '- Castellano bien escrito: concordancia de número («1 equipo queda», «4 equipos quedan»), preguntas que abren y cierran, ninguna frase a medias.',
  '- Prohibido el tono robótico o académico: nada de «cabe destacar», «es importante señalar», «en conclusión», «en el básquet moderno», «sin lugar a dudas». Nada de generalidades que sirvan para cualquier dato («la estadística es clave»). Si una frase se puede borrar sin que se pierda nada, borrala.',
];

/* Un texto que no entra se corta en el fin de una oración o de una
   palabra, con puntos suspensivos: nunca a mitad de palabra. */
function recortar(texto, max) {
  const t = String(texto || '').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const frase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('? '), corte.lastIndexOf('! '));
  if (frase > max * 0.6) return corte.slice(0, frase + 1);
  const palabra = corte.lastIndexOf(' ');
  return (palabra > 0 ? corte.slice(0, palabra) : corte).replace(/[\s,;:—-]+$/, '') + '…';
}

/** ¿La lista cumple la estructura? Devuelve el motivo, o null si está bien. */
function estructuraDePlacas(placas) {
  const ps = placas || [];
  if (ps.length < MIN_PLACAS || ps.length > MAX_PLACAS) return 'tienen que ser entre ' + MIN_PLACAS + ' y ' + MAX_PLACAS + ' placas';
  if (ps.some((x) => !ROLES[x.rol])) return 'hay una placa con un rol que no existe';
  if (ps[0].rol !== 'gancho') return 'la primera placa tiene que ser el gancho';
  if (ps[ps.length - 1].rol !== 'cierre') return 'la última placa tiene que ser el cierre';
  if (!ps.some((x) => x.rol === 'evidencia')) return 'falta al menos una placa de evidencia';
  if (!ps.some((x) => x.rol === 'propuesta')) return 'falta al menos una placa de propuesta';
  const orden = ps.map((x) => Object.keys(ROLES).indexOf(x.rol));
  if (orden.some((n, i) => i && n < orden[i - 1])) return 'el orden es gancho, evidencia, propuesta y cierre';
  return null;
}

/**
 * Las placas de una pieza. Las de la IA si las tiene; si no, el guion del
 * generador repartido en los cuatro momentos, sin agregar una palabra.
 */
function placasDe(p, gancho) {
  if (p.placas && p.placas.length) {
    return p.placas.map((x, i) => (i === 0 && gancho ? Object.assign({}, x, { titulo: gancho }) : x));
  }
  const g = p.guion || [];
  const medio = g.slice(1, Math.max(1, g.length - 1));
  const corte = Math.ceil(medio.length / 2);
  const out = [{ rol: 'gancho', titulo: gancho || p.titulo, texto: p.dato || '' }];
  medio.forEach((t, i) => out.push({ rol: i < corte ? 'evidencia' : 'propuesta', titulo: '', texto: t }));
  out.push({ rol: 'cierre', titulo: '', texto: g.length > 1 ? g[g.length - 1] : (p.titulo || '') });
  return out;
}

/** El copy de Instagram sin IA: frases de la propia pieza, en el orden de la narrativa. */
function copyPlantilla(p, gancho) {
  const pregunta = (p.ganchos || []).find((g) => g.estilo === 'pregunta');
  const L = [gancho || p.titulo, '', p.dato || ''];
  if (pregunta && pregunta.texto !== gancho) L.push('', '📋 ' + pregunta.texto);
  L.push('', '💬 ' + CTA_COMENTARIO, '📩 O escribinos por mensaje directo para sumarnos a tu cuerpo técnico.', '', HASHTAGS);
  return L.join('\n');
}

/**
 * El PROMPT ALTERNATIVO: para pegar en otra interfaz de IA y pedir más
 * variantes del copy. Lo arma el código, no un modelo: lleva la pieza
 * tal cual y la regla de los números escrita adentro.
 */
function promptDeCopy(p, gancho) {
  const placas = placasDe(p, gancho).map((x) => '- [' + ROLES[x.rol] + '] ' + (x.titulo ? x.titulo + ' — ' : '') + x.texto);
  const datos = p.datos ? JSON.stringify(p.datos) : '';
  return VOZ.concat([''], CAPAS, [''], ESTILO, [
    '',
    'EL PEDIDO: escribí el copy de Instagram para este ' + (p.formato === 'reel' ? 'reel' : 'carrusel') + ', con la voz de referente de arriba. No es un resumen de las placas: es un ARTÍCULO DE OPINIÓN TÁCTICA. Estructura: tres párrafos —1) la tesis de vestuario y el dato que la prueba, 2) por qué pasa en la cancha, 3) qué cuesta no verlo y qué decide distinto el que lo domina—, después TRES preguntas de auditoría incisivas que obliguen al entrenador a comentar, el llamado a comentar y entre 6 y 8 hashtags. Hasta 2.100 caracteres. Dame 3 variantes, cada una con una tesis distinta.',
    '',
    'REGLA QUE NO SE NEGOCIA: no inventes ni calcules ningún número. Usá solo los números que figuran abajo, exactamente como están y con el mismo significado. No nombres personas ni clubes que no estén nombrados abajo, ni inventes hechos sobre equipos, jugadores o partidos: el por qué y el dolor son lecturas generales del juego, no afirmaciones sobre alguien.',
    '',
    'TÍTULO: ' + p.titulo,
    'DATO CENTRAL: ' + (p.dato || ''),
    'PLACAS:',
  ]).concat(placas, datos && datos.length < 6000 ? ['', 'NÚMEROS DE RESPALDO (JSON): ' + datos] : [], ['', 'LLAMADO A LA ACCIÓN: ' + CTA_COMENTARIO]).join('\n');
}

/* --------------------------------------------------------------------
   LAS PLACAS EN HTML · la línea gráfica de la cuenta
   Azul noche con el isotipo de marca de agua, esquinas, MOTORSTATS AR
   arriba, píldora naranja en el gancho, barra celeste por sección,
   tarjetas, y el pie «Link en Bio | @motorstats.ar» con el logo.
   Barlow Condensed en títulos, Barlow en el cuerpo.
   -------------------------------------------------------------------- */
/* *así* en un título se pinta de naranja. Se escapa PRIMERO. */
const resaltar = (t) => esc(t).replace(/\*([^*]+)\*/g, '<span class="nar">$1</span>');
const cuerpoDe = (t, max) => { const n = String(t || '').length; return n > max * 1.6 ? 'ch' : n > max ? 'me' : 'gr'; };

function placasHtml(p, gancho, contexto) {
  const vertical = p.formato === 'reel' || p.formato === 'stories';
  const W = 1080, H = vertical ? 1920 : 1350;
  const placas = placasDe(p, gancho);
  const marco = (cuerpo, ultima) => '<section class="p" data-document-role="page"><img class="agua" src="' + LOGO + '" alt=""><i class="esq ea"></i><i class="esq eb"></i><i class="esq ec"></i><i class="esq ed"></i>' +
    '<div class="marca"><b>MOTORSTATS</b><sup>AR</sup></div><div class="c">' + cuerpo + '</div>' + (ultima ? '' : '<div class="sig">&rarr;</div>') +
    '<div class="pie"><img src="' + LOGO + '" alt=""><span>Link en Bio | @motorstats.ar</span></div></section>';
  const barra = (t) => (t ? '<div class="barra">' + resaltar(t) + '</div>' : '');
  const paginas = placas.map((x, i) => {
    const ultima = i === placas.length - 1 && !contexto;
    const txt = '<p class="baj ' + cuerpoDe(x.texto, 190) + '">' + esc(x.texto) + '</p>';
    const dest = x.destacado ? '<div class="tarj ' + (x.rol === 'propuesta' ? 'v' : 'n') + '">' + esc(x.destacado) + '</div>' : '';
    if (x.rol === 'gancho') {
      return marco('<div class="pildora">' + esc(TONOS[p.tono] ? TONOS[p.tono].pildora : 'EXCLUSIVO PARA CUERPOS TÉCNICOS & CLUBES') + '</div><h1 class="' + cuerpoDe(x.titulo, 60) + '">' + resaltar(x.titulo || p.titulo) + '</h1>' +
        (x.texto ? '<p class="baj me">' + esc(x.texto) + '</p>' : '') + dest, ultima);
    }
    if (x.rol === 'cierre') {
      return marco((x.titulo ? '<h1 class="me">' + resaltar(x.titulo) + '</h1>' : '') + txt + '<div class="tarj n">💬 ' + esc(CTA_COMENTARIO) + '</div><p class="nota">📩 O escribinos al directo para sumarnos a tu equipo</p>', ultima);
    }
    return marco('<div class="rot">' + esc(ROLES[x.rol]) + '</div>' + barra(x.titulo) + txt + dest, ultima);
  });
  /* Una propuesta del laboratorio trae su tabla: va después de la primera evidencia. */
  const d = p.datos || {};
  if (Array.isArray(d.filas) && Array.isArray(d.columnas) && d.filas.length) {
    const cols = d.columnas.slice(0, 4);
    paginas.splice(Math.min(2, paginas.length - 1), 0, marco('<div class="barra">LOS NÚMEROS</div><table><thead><tr><th>#</th><th></th>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
      d.filas.slice(0, 8).map((f) => '<tr><td>' + esc(f.puesto || '') + '</td><td>' + esc(f.jugador || f.equipo || f.zona || '') + (f.jugador && f.equipo ? '<small> · ' + esc(f.equipo) + '</small>' : '') + '</td>' +
        cols.map((c) => '<td class="n">' + esc((f.texto || {})[c.id]) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'));
  }
  if (contexto) paginas.push(marco('<div class="barra">CONTEXTO</div><p class="baj me">' + esc(contexto) + '</p>', true));
  const k = vertical ? 1.2 : 1;
  const css = '@import url("https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap");' +
    '*{box-sizing:border-box;margin:0;padding:0}html,body{background:#0a1930}body{font-family:Barlow,sans-serif;color:#e6ecf5}' +
    '.p{position:relative;width:' + W + 'px;height:' + H + 'px;overflow:hidden;background:#0a1930}' +
    '.agua{position:absolute;left:50%;top:50%;width:900px;transform:translate(-50%,-50%);opacity:.05}' +
    '.esq{position:absolute;width:30px;height:30px;border:2px solid #74acdf}.ea{left:30px;top:30px;border-right:0;border-bottom:0}.eb{right:30px;top:30px;border-left:0;border-bottom:0}' +
    '.ec{left:30px;bottom:30px;border-right:0;border-top:0}.ed{right:30px;bottom:30px;border-left:0;border-top:0}' +
    '.marca{position:absolute;left:78px;top:44px;font-weight:700;font-size:17px;letter-spacing:4px;color:#74acdf}.marca b{color:#fff}.marca sup{font-size:9px;letter-spacing:1px}' +
    '.c{position:absolute;left:100px;right:100px;top:150px;bottom:150px;display:flex;flex-direction:column;justify-content:center;gap:38px}' +
    '.pildora{align-self:flex-start;border:2px solid #f5a623;border-radius:30px;padding:7px 22px;font-weight:700;font-size:20px;letter-spacing:2px;color:#f5a623;background:rgba(245,166,35,.12)}' +
    'h1{font-family:"Barlow Condensed",sans-serif;font-weight:800;line-height:1;text-transform:uppercase;color:#fff}h1.gr{font-size:' + Math.round(104 * k) + 'px}h1.me{font-size:' + Math.round(82 * k) + 'px}h1.ch{font-size:' + Math.round(64 * k) + 'px}' +
    '.nar{color:#f5a623}.cel{color:#74acdf}' +
    '.baj{line-height:1.32;font-weight:500;color:#e6ecf5}.baj.gr{font-size:' + Math.round(46 * k) + 'px}.baj.me{font-size:' + Math.round(38 * k) + 'px}.baj.ch{font-size:' + Math.round(31 * k) + 'px}' +
    '.barra{background:#74acdf;color:#0a1930;font-family:"Barlow Condensed",sans-serif;font-weight:800;font-size:' + Math.round(46 * k) + 'px;line-height:1.05;text-transform:uppercase;text-align:center;padding:14px 20px}.barra .nar{color:#0a1930;text-decoration:underline}' +
    '.rot{font-weight:700;font-size:22px;letter-spacing:3px;text-transform:uppercase;color:#74acdf}' +
    '.tarj{border-radius:14px;padding:26px 30px;font-size:' + Math.round(33 * k) + 'px;line-height:1.3;border:2px solid}.tarj.n{background:rgba(245,166,35,.10);border-color:rgba(245,166,35,.45)}.tarj.v{background:rgba(74,222,128,.10);border-color:rgba(74,222,128,.4)}' +
    '.nota{font-size:28px;color:#b8c4d6;text-align:center}' +
    '.sig{position:absolute;right:78px;bottom:130px;width:44px;height:44px;border:2px solid #74acdf;border-radius:50%;color:#74acdf;font-size:26px;line-height:38px;text-align:center}' +
    '.pie{position:absolute;left:0;right:0;bottom:44px;height:70px}.pie img{position:absolute;left:50%;top:0;width:70px;height:70px;object-fit:contain;transform:translateX(-50%)}' +
    '.pie span{position:absolute;right:78px;top:26px;font-weight:600;font-size:19px;color:#fff}' +
    'table{width:100%;border-collapse:collapse;font-size:32px}th,td{padding:14px 12px;border-bottom:1px solid rgba(116,172,223,.25);text-align:left}th{font-size:20px;letter-spacing:2px;text-transform:uppercase;color:#74acdf}' +
    'td.n{font-family:"Barlow Condensed",sans-serif;font-weight:800;font-size:40px;text-align:right;color:#fff}td small{font-size:22px;color:#a9b8cf}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(p.id + ' · ' + p.titulo) + '</title><style>' + css + '</style></head><body>' + paginas.join('\n') + '</body></html>';
}

/** El resumen en Markdown de una propuesta: placas, copy y prompt alternativo. */
function resumenMd(p, gancho, contexto) {
  const L = ['# ' + p.id + ' · ' + p.titulo, '', '_' + (p.formatoLabel || p.formato) + (p.redaccion === 'ia' ? ' · redactada por IA' : '') + '_', '', '**Gancho:** ' + (gancho || p.titulo), ''];
  if (p.dato) L.push('**Dato:** ' + p.dato, '');
  L.push('## Placas', '');
  placasDe(p, gancho).forEach((x, i) => L.push((i + 1) + '. **' + ROLES[x.rol] + (x.titulo ? ' · ' + x.titulo : '') + '** — ' + x.texto + (x.destacado ? ' _(' + x.destacado + ')_' : '')));
  L.push('', '## Copy sugerido para Instagram', '', p.copy || copyPlantilla(p, gancho), '', '## Prompt alternativo para el copy', '', '~~~', promptDeCopy(p, gancho), '~~~');
  if (contexto) L.push('', '**Contexto (cargado a mano):** ' + contexto);
  if (p.muestra) L.push('', '**Muestra:** ' + JSON.stringify(p.muestra));
  return L.join('\n') + '\n';
}

module.exports = {
  ROLES, MIN_PLACAS, MAX_PLACAS, CTA_COMENTARIO, HASHTAGS, VOZ, CAPAS, ESTILO, recortar, estructuraDePlacas, placasDe, copyPlantilla, promptDeCopy,
  PIEZAS, EJES, FORMATOS, AUTO, ESTILOS, ENFOQUES, ENFOQUE_DE, TONOS, MAX_BANDEJA,
  conTono, aplicarRedaccion, guardarRedaccion, armarBandeja, cambiarEnfoque, cambiarTono, marcar, sumarABandeja, registroDeAprobacion, medir, diaLocal, PESOS_INTERACCION, MIN_MUESTRA, PISO, TECHO,
  opciones, piezasPara, motivoSinFormato, ganchos, deReceta, deFeed, deStories,
  normalizarRegistro, puntaje, ponderaciones, ordenar, propuestas, placasHtml, resumenMd,
};
