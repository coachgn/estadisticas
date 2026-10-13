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
  return Object.assign({}, p, { titulo: red.titulo || p.titulo, guion: red.guion || p.guion, ganchos: ia.concat(resto), redaccion: 'ia',
    redaccionDescartada: (red.descartado || []).length });
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

function placasHtml(p, gancho, contexto) {
  const vertical = p.formato === 'reel' || p.formato === 'stories';
  const W = 1080, H = vertical ? 1920 : 1350;
  const marco = (cuerpo) => '<section class="p" data-document-role="page"><i class="esq ea"></i><i class="esq eb"></i><i class="esq ec"></i><i class="esq ed"></i>' +
    '<div class="marca"><b>MOTORSTATS</b><sup>AR</sup></div><div class="c">' + cuerpo + '</div>' +
    '<div class="pie"><img src="' + LOGO + '" alt=""><span>@motorstats.ar</span></div></section>';
  const pildora = TONOS[p.tono] ? TONOS[p.tono].pildora : (p.id + ' · ' + (p.formatoLabel || ''));
  const paginas = [marco('<div class="pildora">' + esc(pildora) + '</div><h1>' + esc(gancho || p.titulo) + '</h1>' +
    (p.dato ? '<p class="baj">' + esc(p.dato) + '</p>' : ''))];
  /* Una línea larga (las de la IA suelen serlo) baja de cuerpo para no salirse de la placa. */
  (p.guion || []).forEach((g, i) => paginas.push(marco('<div class="rot">' + (i + 1) + ' / ' + p.guion.length + '</div><p class="baj ' + (String(g).length > 170 ? 'media' : 'grande') + '">' + esc(g) + '</p>')));
  /* Una propuesta del laboratorio trae su tabla: va en su propia placa. */
  const d = p.datos || {};
  if (Array.isArray(d.filas) && Array.isArray(d.columnas) && d.filas.length) {
    const cols = d.columnas.slice(0, 4);
    paginas.splice(Math.min(3, paginas.length), 0, marco('<table><thead><tr><th>#</th><th></th>' + cols.map((c) => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
      d.filas.slice(0, 8).map((f) => '<tr><td>' + esc(f.puesto || '') + '</td><td>' + esc(f.jugador || f.equipo || f.zona || '') + (f.jugador && f.equipo ? '<small> · ' + esc(f.equipo) + '</small>' : '') + '</td>' +
        cols.map((c) => '<td class="n">' + esc((f.texto || {})[c.id]) + '</td>').join('') + '</tr>').join('') + '</tbody></table>'));
  }
  if (contexto) paginas.push(marco('<div class="rot">Contexto</div><p class="baj">' + esc(contexto) + '</p>'));
  const css = '@import url("https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800&display=swap");' +
    '*{box-sizing:border-box;margin:0;padding:0}html,body{background:#0a1930}body{font-family:Barlow,sans-serif;color:#e6ecf5}' +
    '.p{position:relative;width:' + W + 'px;height:' + H + 'px;overflow:hidden;background:#0a1930}' +
    '.esq{position:absolute;width:30px;height:30px;border:2px solid #74acdf}.ea{left:30px;top:30px;border-right:0;border-bottom:0}.eb{right:30px;top:30px;border-left:0;border-bottom:0}' +
    '.ec{left:30px;bottom:30px;border-right:0;border-top:0}.ed{right:30px;bottom:30px;border-left:0;border-top:0}' +
    '.marca{position:absolute;left:78px;top:44px;font-weight:700;font-size:17px;letter-spacing:4px;color:#74acdf}.marca b{color:#fff}.marca sup{font-size:9px}' +
    '.c{position:absolute;left:100px;right:100px;top:150px;bottom:150px;display:flex;flex-direction:column;justify-content:center;gap:40px}' +
    '.pildora{align-self:flex-start;border:2px solid #f5a623;border-radius:30px;padding:7px 22px;font-weight:700;font-size:20px;letter-spacing:2px;color:#f5a623}' +
    'h1{font-family:"Barlow Condensed",sans-serif;font-weight:800;font-size:' + (vertical ? 104 : 88) + 'px;line-height:1;text-transform:uppercase;color:#fff}' +
    '.baj{font-size:38px;line-height:1.3;font-weight:500}.baj.grande{font-size:52px;color:#fff}.baj.media{font-size:40px;color:#fff}.rot{font-weight:700;font-size:24px;letter-spacing:2px;text-transform:uppercase;color:#74acdf}' +
    '.pie{position:absolute;left:0;right:0;bottom:44px;height:70px}.pie img{position:absolute;left:50%;top:0;width:70px;height:70px;object-fit:contain;transform:translateX(-50%)}' +
    '.pie span{position:absolute;right:78px;top:26px;font-weight:600;font-size:19px;color:#fff}' +
    'table{width:100%;border-collapse:collapse;font-size:32px}th,td{padding:14px 12px;border-bottom:1px solid rgba(116,172,223,.25);text-align:left}th{font-size:20px;letter-spacing:2px;text-transform:uppercase;color:#74acdf}' +
    'td.n{font-family:"Barlow Condensed",sans-serif;font-weight:800;font-size:40px;text-align:right;color:#fff}td small{font-size:22px;color:#a9b8cf}';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' + esc(p.id + ' · ' + p.titulo) + '</title><style>' + css + '</style></head><body>' + paginas.join('\n') + '</body></html>';
}

/** El resumen en Markdown de una propuesta, con el gancho elegido. */
function resumenMd(p, gancho, contexto) {
  const L = ['# ' + p.id + ' · ' + p.titulo, '', '_' + (p.formatoLabel || p.formato) + '_', '', '**Gancho:** ' + (gancho || p.titulo), ''];
  if (p.dato) L.push('**Dato:** ' + p.dato, '');
  (p.guion || []).forEach((g, i) => L.push((i + 1) + '. ' + g));
  if (contexto) L.push('', '**Contexto (cargado a mano):** ' + contexto);
  if (p.muestra) L.push('', '**Muestra:** `' + JSON.stringify(p.muestra) + '`');
  return L.join('\n') + '\n';
}

module.exports = {
  PIEZAS, EJES, FORMATOS, AUTO, ESTILOS, ENFOQUES, ENFOQUE_DE, TONOS, MAX_BANDEJA,
  conTono, aplicarRedaccion, guardarRedaccion, armarBandeja, cambiarEnfoque, cambiarTono, marcar, sumarABandeja, registroDeAprobacion, medir, diaLocal, PESOS_INTERACCION, MIN_MUESTRA, PISO, TECHO,
  opciones, piezasPara, motivoSinFormato, ganchos, deReceta, deFeed, deStories,
  normalizarRegistro, puntaje, ponderaciones, ordenar, propuestas, placasHtml, resumenMd,
};
