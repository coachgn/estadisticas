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

const ESTILOS = { dato: 'El dato primero', titular: 'El titular', pregunta: 'La pregunta' };

/** Lo que la página necesita para armar sus selectores. */
function opciones(LIGAS) {
  return {
    ligas: Object.keys(LIGAS).map((id) => ({
      id, torneo: LIGAS[id].torneo, nombres: !!LIGAS[id].nombres,
      zonas: Object.keys(LIGAS[id].zonas).map((z) => ({ id: z, label: LIGAS[id].zonas[z].label || 'Única', pbp: !!LIGAS[id].zonas[z].pbp })),
    })),
    formatos: Object.keys(FORMATOS).map((id) => Object.assign({ id }, FORMATOS[id])),
    ejes: EJES,
    piezas: Object.keys(PIEZAS).map((id) => Object.assign({ id }, PIEZAS[id])),
    estilos: ESTILOS,
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
    return { id: p.id, ok: false, formato: def.formato || null, eje: def.eje || null, titulo: def.label || p.id, avisos: p.avisos || [] };
  }
  return {
    id: p.id, ok: true, formato: def.formato, eje: def.eje, formatoLabel: p.formato, titulo: p.titulo, dato: p.dato,
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
    id: f.id, ok: true, formato: 'feed', eje: EJE_DE_FEED[cat] || null, formatoLabel: f.formato, titulo: f.titulo,
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
    id: 'STORIES', ok: true, formato: 'stories', eje: null, formatoLabel: st.formato, titulo,
    dato: r.length + ' rankings sobre ' + (m.partidos || 0) + ' partidos, del ' + m.desde + ' al ' + m.hasta + '.',
    guion: (st.placas || []).map((x) => x.titulo || x.texto || x.tipo), muestra: { partidos: m.partidos, desde: m.desde, hasta: m.hasta },
    datos: { placas: st.placas || [] }, avisos: avisos || [],
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
  return { publicaciones: medidos.length, media, formato: grupo('formato'), pieza: grupo('pieza'), estilo: grupo('estilo') };
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
  if (s.nivel1 && f.formato === 'stories') lista.push(deStories(s.nivel1.stories, s.nivel1.avisos));
  if (s.nivel1 && f.formato === 'feed') {
    const fd = s.nivel1.feed;
    lista = lista.concat([fd.posteo].concat(fd.alternativas || []).filter(Boolean).map((x) => deFeed(x, x === fd.posteo)));
  }
  if (f.eje) lista = lista.filter((p) => !p.eje || p.eje === f.eje);
  return ordenar(lista, pond);
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
  const paginas = [marco('<div class="pildora">' + esc(p.id) + ' · ' + esc(p.formatoLabel || '') + '</div><h1>' + esc(gancho || p.titulo) + '</h1>' +
    (p.dato ? '<p class="baj">' + esc(p.dato) + '</p>' : ''))];
  (p.guion || []).forEach((g, i) => paginas.push(marco('<div class="rot">' + (i + 1) + ' / ' + p.guion.length + '</div><p class="baj grande">' + esc(g) + '</p>')));
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
    '.baj{font-size:38px;line-height:1.3;font-weight:500}.baj.grande{font-size:52px;color:#fff}.rot{font-weight:700;font-size:24px;letter-spacing:2px;text-transform:uppercase;color:#74acdf}' +
    '.pie{position:absolute;left:0;right:0;bottom:44px;height:70px}.pie img{position:absolute;left:50%;top:0;width:70px;height:70px;object-fit:contain;transform:translateX(-50%)}' +
    '.pie span{position:absolute;right:78px;top:26px;font-weight:600;font-size:19px;color:#fff}';
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
  PIEZAS, EJES, FORMATOS, ESTILOS, PESOS_INTERACCION, MIN_MUESTRA, PISO, TECHO,
  opciones, piezasPara, motivoSinFormato, ganchos, deReceta, deFeed, deStories,
  normalizarRegistro, puntaje, ponderaciones, ordenar, propuestas, placasHtml, resumenMd,
};
