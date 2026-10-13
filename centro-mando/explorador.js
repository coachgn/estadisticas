/* =====================================================================
   centro-mando/explorador.js · el Explorador y Laboratorio Táctico

   PURO: entra un índice del núcleo (o varios, uno por zona) y sale una
   tabla, una lista de anomalías o una propuesta. No lee red ni disco.

   LAS REGLAS

     · NO HAY MÉTRICA PROPIA. Todo valor se LEE del índice (`idx.leer`
       para equipos, la fila del jugador o del partido para el resto): el
       Explorador filtra, ordena y compara, no calcula estadísticas.
     · UN FILTRO DEJA AFUERA AL QUE NO TIENE EL DATO, Y LO CUENTA. Un
       jugador sin triples intentados no «tiene 0 %»: no entra, y la
       respuesta dice cuántos quedaron así (la regla de Fichajes).
     · EL PORCENTAJE NO VIAJA SOLO. Pedir T3% suma T3I a la tabla: un 60 %
       sobre cinco tiros y sobre ochenta no son el mismo dato.
     · EN EL LABORATORIO LA PREGUNTA SE ARMA: el ángulo que escribe quien
       opera es el TÍTULO de la propuesta, y lo que decide qué sale son
       las métricas, el orden y las condiciones.
     · EN «A MEDIDA» EL TEXTO LIBRE LO LEE UN INTÉRPRETE LOCAL
       («interpretarLibre»), determinista y sin modelo: busca en el texto
       siglas y conceptos de cancha, los lleva a la métrica del libro más
       cercana y DICE qué entendió, qué aproximó y qué no existe. Nunca
       aproxima en silencio.
     · EL CATÁLOGO ES EL DEL LIBRO, no una lista corta: toda métrica del
       registro del núcleo que el libro traiga en ese nivel se puede pedir.
     · EL CRUCE de dos métricas (mediana contra mediana y correlación) es
       lo único que este módulo calcula, sobre valores leídos del libro,
       y siempre con su n a la vista.
     · LO QUE SALE HACIA UNA PROPUESTA no lleva nombres en su texto: las
       personas van bajo `jugador` y los clubes bajo `equipo`, que es lo
       que el generador sabe anonimizar y verificar.
   ===================================================================== */
'use strict';

const S = require('../js/sgadd-core.js');
const CLASIF = require('../js/sgadd-clasificacion.js');

const NIVELES = { jugadores: 'Jugadores', equipos: 'Equipos', zonas: 'Comparativa entre zonas', partidos: 'Partidos' };

const METRICAS = {
  equipos: ['RTNG OFF', 'RTNG DEF', 'NET RTNG', 'WIN%', 'PACE', 'PPP', 'eFG%', 'TS%', 'T2%', 'T3%', 'T1%', 'PT3%', 'RTL%', 'PePP%', 'RO%', 'RD%', 'AST%', 'AST-PP', 'PTS'],
  jugadores: ['MIN', 'PJ', 'PTS', 'PLAYS', 'PPP', 'USG%', 'eFG%', 'TS%', 'T2%', 'T3%', 'T1%', 'T2I', 'T3I', 'T1I', 'PPT2', 'PPT3', 'PPT1', 'RTL%', 'PePP%', 'AST', 'AST-PP', 'RO', 'RD', 'PR', 'FC', 'FR'],
  partidos: ['PTS', 'PTSopp', 'PACE', 'POS', 'PPP', 'eFG%', 'TS%', 'T3%', 'T3I', 'T1%', 'T1I', 'RTL%', 'PePP%', 'RO%', 'RD%', 'AST', 'PP'],
};
METRICAS.zonas = METRICAS.equipos;

/* Lo que NO está en ningún libro, para decirlo en vez de ofrecerlo. */
const NO_DISPONIBLES = ['Puntos tras pérdida', 'Puntos de segunda oportunidad', 'Eficiencia por zona de tiro (solo con play-by-play, en los reels RL-03)'];

/* El volumen que acompaña a cada tasa. */
const VOLUMEN = { 'T3%': 'T3I', 'PPT3': 'T3I', 'T2%': 'T2I', 'PPT2': 'T2I', 'T1%': 'T1I', 'PPT1': 'T1I', 'TC%': 'TCI' };
const DEFENSA = ['RTNG DEF', 'RD%', 'RD', 'PR', 'PTSopp'];
const FALTAS = ['T1%', 'T1I', 'PPT1', 'RTL%', 'FC', 'FR'];
const OPERADORES = { '<': 'menos de', '<=': 'hasta', '>': 'más de', '>=': 'desde' };

const numero = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/* --------------------------------------------------------------------
   LAS MÉTRICAS DE RESULTADO · ganar o perder
   No están en el registro del núcleo, y el núcleo no se toca por esto (el
   servidor lo copia byte a byte, punto 1 del CLAUDE.md). Salen del RÉCORD
   que el índice ya arma con los partidos del libro: es un dato leído, no
   una estadística nueva. El rating neto sí está en el registro (NET RTNG).
   EL RÉCORD ES EL DE LA TABLA DE POSICIONES cuando se conoce
   (`conRecordDeTabla`): con los partidos sin estadísticas que el club
   cargó a mano (punto 44), sumados por la MISMA fusión que usa la sección
   Clasificación. Sin eso, el del índice, que cuenta solo los partidos con
   box score; el resultado dice cuál de los dos se usó.
   -------------------------------------------------------------------- */
const EXTRAS = {
  'WIN%': { clave: 'WIN%', label: '% de victorias', sigla: '% Victorias', formato: 'pct', invertida: false,
    equipo: (e, idx) => {
      const o = idx && idx.recordOficial && idx.recordOficial.porClave.get(e.clave);
      if (o) return o.pj > 0 ? o.pg / o.pj : null;
      return e.record && e.record.pj > 0 ? e.record.ganados / e.record.pj : null;
    } },
};

/**
 * Le cuelga al índice el récord OFICIAL: el de la tabla de posiciones del
 * tramo que el índice tiene abierto. `mapa` son los partidos sin
 * estadísticas de esa categoría, con la forma del catálogo
 * ({ 'TORNEO|FASE': [...] }). No toca nada más del índice: los promedios
 * siguen saliendo solo de los partidos con box score.
 */
function conRecordDeTabla(idx, mapa) {
  const manuales = CLASIF.manualesDelTramo(mapa || {}, idx.liga.torneo, idx.fase);
  const porClave = new Map();
  CLASIF.filasPorEquipo(idx, manuales).forEach((f, clave) => porClave.set(clave, { pg: f.pg, pj: f.pj }));
  idx.recordOficial = { porClave, manuales: manuales.length };
  _catalogos.delete(idx);
  return idx;
}
/* De dónde salió el % de victorias de una tabla, para decirlo. */
const victoriasDe = (idx, columnas) => (columnas.indexOf('WIN%') === -1 ? null
  : idx.recordOficial ? { fuente: 'tabla', manuales: idx.recordOficial.manuales } : { fuente: 'box' });
const def = (k) => EXTRAS[k] || S.metrica(k) || { clave: k, label: k, formato: 'num', invertida: false };
const rotulo = (k) => (EXTRAS[k] ? EXTRAS[k].sigla : (S.siglaVisible ? S.siglaVisible(k) : k)) || k;
const esPct = (k) => def(k).formato === 'pct';
const mostrar = (k, v) => (numero(v) == null ? '—' : EXTRAS[k] ? (v * 100).toFixed(1).replace('.', ',') + '%' : S.formatear(k, v));
/* El valor de un equipo en una métrica, venga del registro o del récord. */
const leerEquipo = (idx, e, k) => {
  if (EXTRAS[k]) return { v: numero(EXTRAS[k].equipo(e, idx)), p: null };
  const r = idx.leer(e.clave, k);
  return r ? { v: numero(r.valor), p: numero(r.percentil) } : { v: null, p: null };
};

/* UN TEXTO NUNCA SE CORTA A MITAD DE PALABRA. Si entra, va entero; si no,
   va su primera oración; y si tampoco, vacío: quien llama pone un título
   propio antes que uno mocho. */
function tituloDe(texto, max) {
  const s = String(texto || '').replace(/\s+/g, ' ').trim(), tope = max || 90;
  if (s.length <= tope) return s;
  const m = s.match(/^.{12,}?[?.!](?=\s|$)/);
  return m && m[0].length <= tope ? m[0] : '';
}

/** Lo que la página necesita para armar el Explorador. */
function opciones() {
  const lista = (ks) => ks.map((k) => ({ id: k, label: rotulo(k), nombre: def(k).label, pct: esPct(k), invertida: !!def(k).invertida }));
  return { niveles: NIVELES, metricas: { equipos: lista(METRICAS.equipos), jugadores: lista(METRICAS.jugadores), partidos: lista(METRICAS.partidos), zonas: lista(METRICAS.zonas) },
    operadores: OPERADORES, noDisponibles: NO_DISPONIBLES };
}

function enfoqueDe(metrica) {
  if (DEFENSA.indexOf(metrica) !== -1) return 'defensa';
  if (FALTAS.indexOf(metrica) !== -1) return 'faltas';
  return 'ataque';
}

/* --------------------------------------------------------------------
   EL CATÁLOGO COMPLETO · lo que el libro trae de verdad en cada nivel
   La lista de arriba es la CORTA, la que la pantalla ofrece en casillas.
   Por texto libre se puede pedir cualquier métrica del registro del
   núcleo que tenga al menos un valor en ese nivel.
   VAL y +/- quedan afuera a propósito: el panel no ordena por ninguna de
   las dos (puntos 3 bis y 4 del CLAUDE.md).
   -------------------------------------------------------------------- */
const _catalogos = new WeakMap();
const FUERA_DEL_CATALOGO = { jugadores: ['VAL', '+/-', 'PTSopp'], equipos: ['VAL', '+/-', 'MIN'], partidos: ['VAL', '+/-', 'MIN'] };
function catalogo(idx) {
  if (_catalogos.has(idx)) return _catalogos.get(idx);
  const ids = S.METRICAS_LISTA.map((m) => m.clave).concat(Object.keys(EXTRAS));
  const hay = {
    jugadores: (k) => idx.liga.jugadores.some((j) => numero(j[k]) != null),
    equipos: (k) => idx.lista().some((e) => leerEquipo(idx, e, k).v != null),
    partidos: (k) => idx.lista().some((e) => e.partidos.some((p) => numero(p[k]) != null)),
  };
  const out = {};
  Object.keys(hay).forEach((n) => {
    const todas = ids.filter((k) => FUERA_DEL_CATALOGO[n].indexOf(k) === -1 && hay[n](k));
    /* Las de la lista corta primero, en su orden: son las que abren la tabla. */
    out[n] = METRICAS[n].filter((k) => todas.indexOf(k) !== -1).concat(todas.filter((k) => METRICAS[n].indexOf(k) === -1));
  });
  out.zonas = out.equipos;
  _catalogos.set(idx, out);
  return out;
}

/* Las filas crudas de cada nivel: quién es y de dónde se lee cada métrica. */
function filasDe(idx, nivel) {
  if (nivel === 'equipos') {
    return idx.lista().map((e) => ({ equipo: e.nombre, pj: e.pj, leer: (k) => leerEquipo(idx, e, k) }));
  }
  if (nivel === 'jugadores') {
    return idx.liga.jugadores.map((j) => ({ jugador: j.NOMBRES, equipo: S.limpiarNombre(j.EQUIPO), califica: !!j.__califica, leer: (k) => ({ v: numero(j[k]), p: null }) }));
  }
  if (nivel === 'partidos') {
    const out = [];
    idx.lista().forEach((e) => e.partidos.forEach((p) => out.push({
      equipo: e.nombre, fecha: p.__fecha instanceof Date ? S.formatearFecha(p.__fecha) : null, resultado: p.RESULTADO || null, condicion: p.CONDICION || null,
      orden: p.__fecha instanceof Date ? p.__fecha.getTime() : 0, leer: (k) => ({ v: numero(p[k]), p: null }),
    })));
    return out;
  }
  throw new Error('Ese nivel de análisis no existe.');
}

/** Normaliza el pedido: descarta lo que no es de ese nivel y completa el volumen. */
function pedido(nivel, o, catalogoDelLibro) {
  const x = o || {};
  if (!METRICAS[nivel]) throw new Error('Ese nivel de análisis no existe.');
  /* Sin libro a la vista, la lista corta; con libro, todo lo que trae. */
  const validas = catalogoDelLibro || METRICAS[nivel];
  let metricas = (x.metricas || []).filter((k, i, a) => validas.indexOf(k) !== -1 && a.indexOf(k) === i);
  /* EL CRUCE: dos métricas distintas de ese nivel. Las zonas no cruzan:
     comparan medianas, y con tres o cuatro filas no hay nada que correlacionar. */
  const cruce = nivel !== 'zonas' && Array.isArray(x.cruce) && x.cruce.length === 2 && x.cruce[0] !== x.cruce[1] && x.cruce.every((k) => validas.indexOf(k) !== -1) ? x.cruce.slice() : null;
  if (cruce) metricas = cruce.concat(metricas.filter((k) => cruce.indexOf(k) === -1));
  if (!metricas.length) metricas = validas.slice(0, 4);
  const orden = cruce ? cruce[0] : (metricas.indexOf(x.orden) !== -1 ? x.orden : metricas[0]);
  const condiciones = (x.condiciones || []).filter((c) => c && validas.indexOf(c.metrica) !== -1 && OPERADORES[c.op] && numero(Number(c.valor)) != null && String(c.valor).trim() !== '')
    .map((c) => ({ metrica: c.metrica, op: c.op, valor: Number(c.valor) }));
  /* El porcentaje no viaja solo: su volumen se suma a las columnas. */
  const columnas = metricas.slice();
  [orden].concat(condiciones.map((c) => c.metrica)).forEach((k) => {
    if (columnas.indexOf(k) === -1) columnas.push(k);
    const vol = VOLUMEN[k];
    if (vol && validas.indexOf(vol) !== -1 && columnas.indexOf(vol) === -1) columnas.push(vol);
  });
  const invertida = !!def(orden).invertida;
  const sentido = x.sentido === 'asc' || x.sentido === 'desc' ? x.sentido : (invertida ? 'asc' : 'desc');
  const top = Math.min(50, Math.max(1, Number(x.top) || 10));
  const grupo = Object.prototype.hasOwnProperty.call(GRUPOS_CRUCE, x.grupo) ? x.grupo : 'altoBajo';
  return { nivel, columnas, orden, sentido, condiciones, top, soloCalificados: !!x.soloCalificados, cruce, grupo };
}

/* --------------------------------------------------------------------
   EL CRUCE DE DOS MÉTRICAS
   Parte a los que cumplen por la MEDIANA de cada una y cuenta los cuatro
   grupos; con muestra, mide además cuánto se mueven juntas (Pearson).
   Es lo único que este módulo calcula, y lo hace sobre valores del libro.
   «Alto» y «bajo» son contra la mediana de ESE grupo, no un juicio: en
   una métrica donde menos es mejor, «alto» sigue siendo el valor grande.
   -------------------------------------------------------------------- */
/* «todos» no es un cuadrante: es la tabla entera ordenada por la primera
   métrica, que es lo que pide una pregunta de INFLUENCIA («¿cómo pesa el
   rebote en ganar?»): ahí importa la escalera completa, no una esquina. */
const GRUPOS_CRUCE = { altoBajo: ['alto', 'bajo'], altoAlto: ['alto', 'alto'], bajoAlto: ['bajo', 'alto'], bajoBajo: ['bajo', 'bajo'], todos: null };
/* La concordancia sale de n: «1 queda alto», «4 quedan altos». */
const pl = (n, uno, varios) => (n === 1 ? uno : varios);
function textoGrupo(grupo, a, b, n) {
  const g = GRUPOS_CRUCE[grupo];
  if (!g) return 'todos, ordenados por ' + rotulo(a);
  return g[0] + pl(n, '', 's') + ' en ' + rotulo(a) + ' y ' + g[1] + pl(n, '', 's') + ' en ' + rotulo(b);
}
const MIN_CRUCE = 8;   // con menos casos no se informa la correlación
const coma = (n, d) => Number(n).toFixed(d).replace('.', ',');
function fuerzaDe(r) {
  const a = Math.abs(r);
  return a < 0.2 ? 'prácticamente nula' : a < 0.4 ? 'débil' : a < 0.7 ? 'moderada' : 'fuerte';
}
function cruzar(pasan, a, b, grupo) {
  const va = pasan.map((f) => f.leer(a).v), vb = pasan.map((f) => f.leer(b).v), n = pasan.length;
  if (!n) return null;
  const ma = S.mediana(va), mb = S.mediana(vb);
  const de = (i) => (va[i] >= ma ? 'alto' : 'bajo') + (vb[i] >= mb ? 'Alto' : 'Bajo');
  const cuadrantes = { altoAlto: 0, altoBajo: 0, bajoAlto: 0, bajoBajo: 0 };
  pasan.forEach((f, i) => { cuadrantes[de(i)]++; });
  /* CUÁNTO TIENE DE LA SEGUNDA CADA MITAD DE LA PRIMERA: es la lectura de
     «influencia» que una correlación sola no deja ver. */
  const bDe = (alto) => vb.filter((v, i) => (va[i] >= ma) === alto);
  const bAltos = bDe(true), bBajos = bDe(false);
  let r = null;
  if (n >= MIN_CRUCE) {
    const pa = va.reduce((t, v) => t + v, 0) / n, pb = vb.reduce((t, v) => t + v, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (va[i] - pa) * (vb[i] - pb); saa += (va[i] - pa) * (va[i] - pa); sbb += (vb[i] - pb) * (vb[i] - pb); }
    if (saa > 0 && sbb > 0) r = Math.round(sab / Math.sqrt(saa * sbb) * 100) / 100;
  }
  const enGrupo = grupo === 'todos' ? n : cuadrantes[grupo];
  return {
    a, b, labelA: rotulo(a), labelB: rotulo(b), nombreA: def(a).label, nombreB: def(b).label, n,
    medianaA: mostrar(a, ma), medianaB: mostrar(b, mb), cuadrantes, grupo, grupoTexto: textoGrupo(grupo, a, b, 2), grupoTextoN: textoGrupo(grupo, a, b, enGrupo), enGrupo,
    altosA: bAltos.length, bajosA: bBajos.length, medianaBEnAltosA: bAltos.length ? mostrar(b, S.mediana(bAltos)) : null, medianaBEnBajosA: bBajos.length ? mostrar(b, S.mediana(bBajos)) : null,
    r, rTexto: r == null ? null : coma(r, 2), fuerza: r == null ? null : fuerzaDe(r), sentido: r == null ? null : (r >= 0 ? 'directa' : 'inversa'),
    del: (f) => de(pasan.indexOf(f)),
  };
}

const cumple = (c, v) => {
  if (v == null) return false;
  const x = esPct(c.metrica) ? v * 100 : v;
  return c.op === '<' ? x < c.valor : c.op === '<=' ? x <= c.valor : c.op === '>' ? x > c.valor : x >= c.valor;
};
const textoCondicion = (c) => rotulo(c.metrica) + ' ' + OPERADORES[c.op] + ' ' + String(c.valor).replace('.', ',') + (esPct(c.metrica) ? ' %' : '');

/**
 * La tabla del Explorador para jugadores, equipos o partidos.
 * Devuelve las filas ordenadas, cuántas cumplen y cuántas quedaron
 * afuera por no tener el dato.
 */
function explorar(idx, nivel, o) {
  const q = pedido(nivel, o, catalogo(idx)[nivel]);
  let filas = filasDe(idx, nivel);
  const universo = filas.length;
  if (q.soloCalificados && nivel === 'jugadores') filas = filas.filter((f) => f.califica);
  let sinDato = 0;
  const pasan = [];
  filas.forEach((f) => {
    const usadas = [q.orden].concat(q.condiciones.map((c) => c.metrica), q.cruce || []);
    if (usadas.some((k) => f.leer(k).v == null)) { sinDato++; return; }
    if (!q.condiciones.every((c) => cumple(c, f.leer(c.metrica).v))) return;
    pasan.push(f);
  });
  const dir = q.sentido === 'asc' ? 1 : -1;
  pasan.sort((a, b) => (dir * (a.leer(q.orden).v - b.leer(q.orden).v)) || ((b.orden || 0) - (a.orden || 0)) || String(a.jugador || a.equipo).localeCompare(String(b.jugador || b.equipo)));
  /* Con cruce, la tabla es el GRUPO pedido (los altos en una y bajos en la
     otra, por defecto), ordenado por la primera métrica. */
  const cr = q.cruce ? cruzar(pasan, q.cruce[0], q.cruce[1], q.grupo) : null;
  const visibles = cr && q.grupo !== 'todos' ? pasan.filter((f) => cr.del(f) === q.grupo) : pasan;
  if (cr) delete cr.del;
  const salida = visibles.slice(0, q.top).map((f, i) => {
    const valores = {}, texto = {}, percentil = {};
    q.columnas.forEach((k) => { const r = f.leer(k); valores[k] = r.v; texto[k] = mostrar(k, r.v); if (r.p != null) percentil[k] = Math.round(r.p); });
    const fila = { puesto: i + 1, valores, texto };
    if (f.jugador) fila.jugador = f.jugador;
    fila.equipo = f.equipo;
    if (nivel === 'jugadores') fila.califica = f.califica;
    if (nivel === 'partidos') { fila.fecha = f.fecha; fila.resultado = f.resultado; fila.condicion = f.condicion; }
    if (Object.keys(percentil).length) fila.percentil = percentil;
    return fila;
  });
  return {
    nivel, columnas: q.columnas.map((k) => ({ id: k, label: rotulo(k), nombre: def(k).label })), orden: q.orden, sentido: q.sentido,
    condiciones: q.condiciones, condicionesTexto: q.condiciones.map(textoCondicion), filas: salida, cumplen: pasan.length, universo, sinDato,
    tramo: idx.liga.torneo + '|' + idx.fase, cruce: cr, victorias: victoriasDe(idx, q.columnas),
  };
}

const desvio = (vs) => { if (vs.length < 2) return 0; const m = vs.reduce((a, v) => a + v, 0) / vs.length; return Math.sqrt(vs.reduce((a, v) => a + (v - m) * (v - m), 0) / vs.length); };

/**
 * La comparativa entre zonas: por métrica, la MEDIANA de los equipos de
 * cada zona. La brecha se mide contra el desvío de todos los equipos
 * juntos: medio punto de PACE no es una diferencia entre zonas.
 */
function zonas(lista, o) {
  const q = pedido('zonas', o, lista.length ? catalogo(lista[0].idx).zonas : null);
  const porZona = lista.map((z) => ({ zona: z.label, id: z.id, equipos: z.idx.lista().length, tramo: z.idx.liga.torneo + '|' + z.idx.fase,
    de: (k) => z.idx.lista().map((e) => leerEquipo(z.idx, e, k).v).filter((v) => v != null) }));
  const diferencias = q.columnas.map((k) => {
    const meds = porZona.map((z) => { const vs = z.de(k); return vs.length ? S.mediana(vs) : null; });
    const todos = porZona.reduce((a, z) => a.concat(z.de(k)), []);
    const validas = meds.filter((m) => m != null);
    if (validas.length < 2) return { metrica: k, label: rotulo(k), brecha: null, relativa: null };
    const max = Math.max.apply(null, validas), min = Math.min.apply(null, validas), s = desvio(todos);
    return { metrica: k, label: rotulo(k), brecha: max - min, brechaTexto: mostrar(k, max) + ' contra ' + mostrar(k, min), relativa: s > 0 ? (max - min) / s : null,
      mayor: porZona[meds.indexOf(max)].zona, menor: porZona[meds.indexOf(min)].zona };
  });
  const filas = porZona.map((z) => {
    const valores = {}, texto = {};
    q.columnas.forEach((k) => { const vs = z.de(k); valores[k] = vs.length ? S.mediana(vs) : null; texto[k] = mostrar(k, valores[k]); });
    return { zona: z.zona, equipos: z.equipos, tramo: z.tramo, valores, texto };
  });
  return { nivel: 'zonas', columnas: q.columnas.map((k) => ({ id: k, label: rotulo(k), nombre: def(k).label })), orden: q.orden, sentido: q.sentido, condiciones: [], condicionesTexto: [],
    filas, cumplen: filas.length, universo: filas.length, sinDato: 0, diferencias: diferencias.slice().sort((a, b) => (b.relativa || 0) - (a.relativa || 0)) };
}

/* --------------------------------------------------------------------
   ANOMALÍAS Y PUNTOS DE FUGA
   -------------------------------------------------------------------- */
const Z_ATIPICO = 1.5;          // la vara del panel (punto 4)
const MIN_NOCHE = 10;
const FUGA_PERCENTIL = 25;
const BRECHA_ZONAS = 0.5;       // en desvíos del conjunto
/* Cada métrica de la noche con su PISO. El desvío solo no alcanza: al que
   promedia cero triples, UNO le da z de 5 —su media está hundida por las
   noches sin minutos (punto 3 ter)— y eso no es un pico, es ruido. */
const PISO_NOCHE = { PTS: 18, AST: 6, RO: 5, RD: 8, T3C: 4 };
const METRICAS_NOCHE = Object.keys(PISO_NOCHE);
const METRICAS_FUGA = ['RTNG OFF', 'RTNG DEF', 'eFG%', 'PePP%', 'RO%', 'RD%', 'RTL%', 'T3%', 'T1%'];

/**
 * `filasNoche`: las filas de jugador-partido de la última fecha (las da
 * el generador, que es el que sabe cuál es la ventana).
 */
function anomalias(idx, filasNoche) {
  const altos = [];
  (filasNoche || []).forEach((f) => {
    if (!(f.MIN >= MIN_NOCHE)) return;
    let mejor = null;
    METRICAS_NOCHE.forEach((k) => {
      const v = numero(f[k]); if (v == null || v < PISO_NOCHE[k]) return;
      const st = idx.statJugador(S.clavePersona(f.NOMBRES), k);
      if (!st || !(st.desvio > 0)) return;
      const z = (v - st.media) / st.desvio;
      if (z >= Z_ATIPICO && (!mejor || z > mejor.z)) mejor = { metrica: k, label: rotulo(k), valor: v, media: Math.round(st.media * 10) / 10, z: Math.round(z * 10) / 10, partidos: st.n };
    });
    if (mejor) altos.push(Object.assign({ tipo: 'noche', jugador: f.NOMBRES, equipo: S.limpiarNombre(f.EQUIPO || f.__equipo || '') }, mejor));
  });
  altos.sort((a, b) => b.z - a.z);
  const rachas = idx.lista().filter((e) => e.racha && e.racha.n >= 3).map((e) => ({ tipo: 'racha', equipo: e.nombre, resultado: e.racha.tipo, n: e.racha.n }))
    .sort((a, b) => b.n - a.n);

  const fugas = [];
  idx.lista().forEach((e) => {
    let peor = null;
    METRICAS_FUGA.forEach((k) => {
      const r = idx.leer(e.clave, k);
      if (!r || numero(r.percentil) == null || numero(r.valor) == null) return;
      if (!peor || r.percentil < peor.percentil) peor = { metrica: k, label: rotulo(k), valor: r.valor, texto: r.formateado, liga: r.tipoFormateado, percentil: Math.round(r.percentil), muestraSuficiente: r.muestraSuficiente !== false };
    });
    if (peor && peor.percentil <= FUGA_PERCENTIL) fugas.push(Object.assign({ equipo: e.nombre }, peor));
  });
  fugas.sort((a, b) => a.percentil - b.percentil);
  return { altos: altos.slice(0, 8), rachas: rachas.slice(0, 6), fugas: fugas.slice(0, 8), varas: { z: Z_ATIPICO, minutos: MIN_NOCHE, percentil: FUGA_PERCENTIL, pisos: PISO_NOCHE } };
}

/** De la comparativa, las métricas que de verdad separan a las zonas. */
function diferenciasEntreZonas(lista) {
  if (!lista || lista.length < 2) return [];
  return zonas(lista, { metricas: ['PACE', 'RTNG OFF', 'RTNG DEF', 'eFG%', 'PePP%', 'RO%', 'RTL%', 'T3%', 'PT3%'] }).diferencias
    .filter((d) => d.relativa != null && d.relativa >= BRECHA_ZONAS).slice(0, 6);
}

/* --------------------------------------------------------------------
   DE UN HALLAZGO A UNA PROPUESTA
   -------------------------------------------------------------------- */
const SUJETO = { jugadores: 'jugadores', equipos: 'equipos', partidos: 'actuaciones de equipo en un partido', zonas: 'zonas' };
const SUJETO_UNO = { jugadores: 'jugador', equipos: 'equipo', partidos: 'actuación de equipo en un partido', zonas: 'zona' };

const rotuloCruce = (c) => c.nombreA + ' y ' + c.nombreB.charAt(0).toLowerCase() + c.nombreB.slice(1) + ': qué dice el cruce';

/** El dato de un cruce, en castellano y con la concordancia que pide cada n. */
function datoDeCruce(c, nivel, filtro) {
  const partes = ['De ' + c.n + ' ' + pl(c.n, SUJETO_UNO[nivel], SUJETO[nivel]) + filtro + ', ' +
    pl(c.altosA, 'el que está', 'los ' + c.altosA + ' que están') + ' sobre la mediana de ' + c.labelA + ' (' + c.medianaA + ') ' + pl(c.altosA, 'tiene', 'tienen una mediana de') + ' ' + c.medianaBEnAltosA + ' en ' + c.labelB +
    (c.bajosA ? '; ' + pl(c.bajosA, 'el de abajo', 'los ' + c.bajosA + ' de abajo') + ', ' + c.medianaBEnBajosA : '') + '.'];
  if (c.grupo === 'todos') partes.push(c.cuadrantes.altoAlto + ' de ' + pl(c.altosA, 'ese', 'esos') + ' ' + c.altosA + ' también ' + pl(c.cuadrantes.altoAlto, 'queda', 'quedan') + ' sobre la mediana de ' + c.labelB + ' (' + c.medianaB + ').');
  else partes.push(c.enGrupo + ' ' + pl(c.enGrupo, 'queda', 'quedan') + ' ' + c.grupoTextoN + ' (la mediana de ' + c.labelB + ' es ' + c.medianaB + ').');
  partes.push(c.r == null ? 'Con ' + c.n + ' ' + pl(c.n, 'caso', 'casos') + ' no alcanza para medir cuánto se mueven juntas.'
    : 'Entre las dos, la relación es ' + c.fuerza + (c.fuerza === 'prácticamente nula' ? '' : (c.sentido === 'inversa' ? ' e ' : ' y ') + c.sentido) + ' (r = ' + c.rTexto + ' sobre ' + c.n + ' casos).');
  return partes.join(' ');
}

function aPropuesta(res, angulo, sello) {
  if (!res || !res.filas || !res.filas.length) return { id: 'LAB', ok: false, formato: 'carrusel', titulo: 'Laboratorio', avisos: ['Ese filtro no deja a nadie: no hay nada que contar.'] };
  const k = res.orden, lab = (res.columnas.find((c) => c.id === k) || {}).label || k;
  const primero = res.filas[0], ultimo = res.filas[res.filas.length - 1];
  const filtro = res.condicionesTexto.length ? ' con ' + res.condicionesTexto.join(' y ') : '';
  const titulo = tituloDe(angulo, 140) || (res.cruce ? rotuloCruce(res.cruce) : null) || ((res.nivel === 'zonas' ? 'Las zonas, comparadas por ' : 'Top ' + res.filas.length + ' por ') + lab + filtro);
  let dato;
  const c = res.cruce;
  if (c) {
    dato = datoDeCruce(c, res.nivel, filtro);
  } else if (res.nivel === 'zonas') {
    const d = (res.diferencias || []).find((x) => x.metrica === k);
    dato = d && d.brechaTexto ? 'En ' + lab + ', la mediana de los equipos va de ' + d.brechaTexto + ' según la zona.' : 'Comparativa de ' + res.filas.length + ' zonas por ' + lab + '.';
  } else {
    dato = res.cumplen + ' ' + pl(res.cumplen, SUJETO_UNO[res.nivel], SUJETO[res.nivel]) + ' de ' + res.universo + filtro + '. En ' + lab + ', el primero marca ' + primero.texto[k] +
      (res.filas.length > 1 ? ' y el ' + res.filas.length + '.º, ' + ultimo.texto[k] : '') + '.';
  }
  const vol = VOLUMEN[k];
  /* Lo que identifica a cada fila va bajo `jugador` / `equipo`: es lo que
     el generador anonimiza. El partido pierde la fecha y el resultado. */
  const filas = res.filas.map((f) => {
    const x = { puesto: f.puesto };
    if (f.jugador) x.jugador = f.jugador;
    if (f.equipo) x.equipo = f.equipo;
    if (f.zona) x.zona = f.zona;
    x.texto = f.texto;
    return x;
  });
  return {
    id: 'LAB-' + String(sello || Date.now().toString(36)).toUpperCase(), ok: true, formato: 'carrusel', formatoLabel: 'Carrusel 3:4 · Laboratorio', eje: null, enfoque: enfoqueDe(k),
    titulo, dato,
    guion: c ? ['Portada: la tesis', 'Las dos métricas que se cruzan: ' + c.nombreA + ' y ' + c.nombreB,
      'Arriba y abajo de la mediana de ' + c.labelA + ': cuánto ' + c.labelB + ' tiene cada mitad',
      'Los cuatro grupos, partidos por la mediana: cuántos caen en cada uno', 'La tabla, sin nombres: ' + c.grupoTexto,
      'Qué dice del juego y qué no: que dos números se muevan juntos no dice cuál causa al otro', '¿En qué grupo cae tu equipo? + demo']
    : ['Portada: el ángulo', 'El filtro: ' + (res.condicionesTexto.join(' y ') || 'sin condiciones') + ', ordenado por ' + lab,
      'La tabla, sin nombres', vol ? 'El volumen detrás del porcentaje: cuántos intentos sostienen cada número' : 'Qué dice del juego y qué no',
      '¿Cómo sale esta cuenta en tu equipo? + demo'],
    muestra: { nivel: res.nivel, cumplen: res.cumplen, universo: res.universo, sinDato: res.sinDato, tramo: res.tramo || null },
    datos: Object.assign({ orden: k, sentido: res.sentido, condiciones: res.condiciones, columnas: res.columnas, filas }, c ? { cruce: c } : {}),
    avisos: res.sinDato ? [res.sinDato + ' quedaron afuera por no tener el dato pedido.'] : [],
  };
}

module.exports = {
  NIVELES, METRICAS, NO_DISPONIBLES, PISO_NOCHE, VOLUMEN, OPERADORES, Z_ATIPICO, MIN_NOCHE, FUGA_PERCENTIL, BRECHA_ZONAS, METRICAS_FUGA,
  opciones, pedido, explorar, zonas, anomalias, diferenciasEntreZonas, aPropuesta, enfoqueDe,
  conRecordDeTabla, catalogo, cruzar, GRUPOS_CRUCE, MIN_CRUCE, FUERA_DEL_CATALOGO, EXTRAS, definicion: def, rotulo, tituloDe, datoDeCruce,
};
