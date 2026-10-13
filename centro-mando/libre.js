/* =====================================================================
   centro-mando/libre.js · el intérprete LOCAL del texto libre de «A medida»

   Entra lo que escribe quien opera —métricas sueltas, un concepto de
   cancha, una hipótesis entera— y sale un PEDIDO del Explorador. PURO y
   determinista: no hay modelo, no hay red, no se lee el libro. Lo único
   que necesita saber del libro es qué métricas trae cada nivel
   (`E.catalogo(idx)`).

   LAS REGLAS

     · NO SE BLOQUEA POR FALTA DE UN SELECTOR. Cualquier sigla del
       catálogo del libro se puede escribir tal cual («USG%», «rtng def»),
       y los conceptos se llevan a la métrica más cercana que el libro
       tenga en ese nivel.
     · NUNCA APROXIMA EN SILENCIO. Cada cosa que entendió viaja con la
       frase que la disparó y con CÓMO la resolvió: por sigla, por
       concepto, por parecido de palabra o por APROXIMACIÓN. Una
       aproximación dice qué se pidió, qué no está y qué se usó en su lugar.
     · LO QUE NO EXISTE SE DICE. Altura, edad, datos por cuarto: no hay
       dato cercano que no sea inventar, así que se nombran y se dejan.
     · NO DECIDE NINGÚN NÚMERO. Los valores de una condición son los que
       escribió quien opera; todo lo demás lo lee el Explorador del libro.
   ===================================================================== */
'use strict';

const S = require('../js/sgadd-core.js');
const { VOLUMEN, definicion, rotulo } = require('./explorador.js');

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"“”¿?¡!;:()]/g, ' ').replace(/[.,](?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
const def = definicion;

/* --------------------------------------------------------------------
   EL VOCABULARIO · concepto de cancha → métricas candidatas, en orden.
   Se usa la PRIMERA que el libro tenga en el nivel elegido: «eficiencia»
   es el rating ofensivo de un equipo y los puntos por play de un jugador.
   -------------------------------------------------------------------- */
const CONCEPTOS = [
  /* EL RESULTADO · ganar o perder, y por cuánto. */
  { f: ['porcentaje de victorias', '% de victorias', '% victorias', 'victorias', 'victoria', 'partidos ganados', 'triunfos', 'ganan', 'ganar', 'gana', 'win rate', 'winrate', '%v'], m: ['WIN%'] },
  { f: ['netrtg', 'net rtg', 'diferencia de puntos por posesion'], m: ['NET RTNG'] },
  { f: ['tov%', 'tov', 'turnovers'], m: ['PePP%', 'PP'] },
  { f: ['dominan el cristal', 'domina el cristal', 'dominio del cristal', 'dominar el cristal', 'ganan el cristal'], m: ['RO%', 'RO'] },
  { f: ['rating ofensivo', 'eficiencia ofensiva', 'eficiencia en ataque', 'ataque'], m: ['RTNG OFF', 'PPP'] },
  { f: ['rating defensivo', 'eficiencia defensiva', 'eficiencia en defensa', 'defensa', 'defienden', 'defiende', 'defensores'], m: ['RTNG DEF', 'PTSopp', 'PR'] },
  { f: ['rating neto', 'net rating', 'diferencial'], m: ['NET RTNG'] },
  { f: ['ritmo', 'velocidad', 'rapido', 'rapidos', 'lento', 'lentos', 'a que velocidad', 'corren', 'corre', 'correr'], m: ['PACE'] },
  { f: ['posesiones'], m: ['POS', 'PLAYS'] },
  { f: ['jugadas', 'volumen de juego'], m: ['PLAYS'] },
  { f: ['puntos por play', 'puntos por jugada'], m: ['PPP'] },
  { f: ['eficiencia', 'eficientes', 'eficiente', 'rendimiento', 'rinden', 'rinde'], m: ['RTNG OFF', 'PPP', 'TS%'] },
  { f: ['tiro efectivo', 'efectividad de campo', 'calidad de tiro', 'seleccion de tiro'], m: ['eFG%'] },
  { f: ['true shooting'], m: ['TS%'] },
  { f: ['tiros de campo', 'tiro de campo'], m: ['TC%', 'TCI'] },
  { f: ['porcentaje de triples', 'efectividad de tres', 'acierto de tres', 'acierto de triples', 'punteria de tres'], m: ['T3%'] },
  { f: ['triples intentados', 'volumen de triples', 'intentos de tres', 'tiran de tres', 'tira de tres', 'tiros de tres', 'cantidad de triples'], m: ['T3I'] },
  { f: ['triples convertidos', 'triples metidos'], m: ['T3C'] },
  { f: ['puntos por triple'], m: ['PPT3'] },
  { f: ['peso del triple', 'peso de los triples', 'dependencia del triple', 'uso del triple', 'viven del triple'], m: ['PT3%'] },
  { f: ['triples', 'triple', 'de tres', 'tres puntos', 'perimetro', 'tiro exterior', 'tiradores', 'tirador'], m: ['T3%'] },
  { f: ['dobles intentados', 'volumen de dobles', 'intentos de dos'], m: ['T2I'] },
  { f: ['puntos por doble'], m: ['PPT2'] },
  { f: ['peso de los dobles', 'peso del doble'], m: ['PT2%'] },
  { f: ['dobles', 'de dos', 'tiro de dos'], m: ['T2%'] },
  { f: ['van a la linea', 'va a la linea', 'llegan a la linea', 'ratio de libres', 'sacan libres', 'viajes a la linea'], m: ['RTL%', 'T1I'] },
  { f: ['libres intentados', 'volumen de libres'], m: ['T1I'] },
  { f: ['libres', 'tiros libres', 'tiro libre', 'desde la linea'], m: ['T1%'] },
  { f: ['perdidas forzadas', 'fuerzan perdidas', 'fuerza perdidas'], m: ['PP Opp%', 'PR'] },
  { f: ['perdidas', 'pierden', 'pierde', 'cuidado del balon', 'cuidado de la pelota', 'cuidan la pelota', 'cuidan el balon'], m: ['PePP%', 'PP'] },
  { f: ['recuperos', 'recuperaciones', 'robos', 'roban', 'roba'], m: ['PR'] },
  { f: ['rebote ofensivo', 'rebotes ofensivos', 'cristal ofensivo', 'carga del rebote', 'cargan el rebote'], m: ['RO%', 'RO'] },
  { f: ['rebote defensivo', 'rebotes defensivos', 'cierre del rebote', 'cierran el rebote'], m: ['RD%', 'RD'] },
  { f: ['rebotes', 'rebote', 'cristal', 'tableros'], m: ['RT%', 'RT', 'RO%'] },
  { f: ['asistencias por perdida', 'creacion', 'generacion', 'generadores', 'generador'], m: ['AST-PP'] },
  { f: ['asistencias', 'asistidas', 'asistidores', 'asistidor', 'pasadores', 'juego colectivo', 'circulacion', 'pase extra'], m: ['AST%', 'AST'] },
  { f: ['uso', 'usage', 'protagonismo', 'toman mas tiros', 'concentran el juego', 'concentra el juego'], m: ['USG%'] },
  { f: ['minutos', 'tiempo en cancha'], m: ['MIN'] },
  { f: ['puntos recibidos', 'puntos en contra', 'puntos permitidos', 'reciben'], m: ['PTSopp'] },
  { f: ['puntos', 'anotan', 'anota', 'anotadores', 'anotador', 'goleadores', 'goleador', 'goleo'], m: ['PTS'] },
  { f: ['faltas recibidas', 'sacan faltas', 'saca faltas', 'reciben faltas'], m: ['FR'] },
  { f: ['faltas cometidas', 'faltas', 'foul', 'fouls'], m: ['FC'] },
  { f: ['tapas', 'tapones', 'bloqueos'], m: ['TC'] },
  { f: ['partidos jugados'], m: ['PJ'] },
  { f: ['tiro permitido', 'tiro que permiten', 'efg permitido', 'tiro rival'], m: ['eFG Opp%'] },
  { f: ['libres concedidos', 'mandan a la linea'], m: ['RTL Opp%', 'FC'] },

  /* LAS APROXIMACIONES · lo pedido no está en ningún libro; se usa lo más
     cercano y se dice con todas las letras. */
  { f: ['puntos de segunda oportunidad', 'segundas oportunidades', 'segunda oportunidad', 'segundos tiros'], m: ['RO%', 'RO'],
    aprox: 'Los puntos de segunda oportunidad no están en el libro: lo más cercano es el rebote ofensivo, que es de donde salen.' },
  { f: ['puntos tras perdida', 'puntos de contraataque', 'contraataque', 'contragolpe', 'transicion', 'correr la cancha'], m: ['PP Opp%', 'PR', 'PACE'],
    aprox: 'Los puntos tras pérdida y de contraataque no están en el libro: lo más cercano es cuántas pérdidas fuerza (o cuántos balones recupera).' },
  { f: ['defensa del perimetro', 'defensa perimetral', 'defensa del triple'], m: ['eFG Opp%', 'RTNG DEF'],
    aprox: 'No hay defensa por zona de tiro: lo más cercano es el eFG% que permite al rival.' },
  { f: ['presion defensiva', 'intensidad defensiva', 'presion', 'agresividad defensiva'], m: ['PP Opp%', 'PR', 'FC'],
    aprox: 'La presión defensiva no es una columna: lo más cercano son las pérdidas que fuerza (o los recuperos).' },
  { f: ['puntos en la pintura', 'juego interior', 'pintura', 'cerca del aro', 'poste bajo'], m: ['PT2%', 'T2%'],
    aprox: 'No hay puntos en la pintura: lo más cercano es el peso de los dobles en su ataque.' },
  { f: ['suplentes', 'banco', 'segunda unidad', 'rotacion corta', 'pocos minutos'], m: ['MIN'], pocosMinutos: true,
    aprox: 'El libro no dice quién arranca ni quién entra desde el banco: uso los minutos por partido, sin exigir el umbral de calificación.' },
];

/* Lo que no está y no tiene un dato cercano que no sea inventar. */
const NO_EXISTE = [
  { f: ['altura', 'estatura', 'talla', 'centimetros'], que: 'La altura no está en el libro.' },
  { f: ['edad'], que: 'La edad no está en el libro.' },
  { f: ['bases', 'aleros', 'pivotes', 'pivots', 'escoltas', 'internos'], que: 'La posición no está en el libro (los roles del panel se infieren de cómo juega, no se filtran acá).' },
  { f: ['ultimo cuarto', 'primer cuarto', 'por cuarto', 'cuartos'], que: 'No hay datos por cuarto en el libro (con play-by-play están en el reel RL-04).' },
  { f: ['clutch', 'finales cerrados', 'cierres ajustados', 'ultimos minutos'], que: 'El cierre de los partidos solo existe con play-by-play (reel RL-02).' },
  { f: ['quintetos', 'quinteto'], que: 'Los quintetos solo existen con play-by-play (reel RL-01).' },
  { f: ['zona de tiro', 'zonas de tiro', 'mapa de tiro', 'esquina', 'esquinas'], que: 'El tiro por zona de la cancha solo existe con play-by-play (reel RL-03).' },
  { f: ['plus minus', 'mas menos', '+/-'], que: 'El +/- no se usa para ordenar: depende de los otros cuatro que estaban en cancha.' },
  { f: ['valoracion'], que: 'La valoración no se usa: es un índice compuesto que el panel dejó afuera a propósito.' },
];

const NIVELES_TEXTO = {
  zonas: ['entre zonas', 'las zonas', 'cada zona', 'zonas', 'conferencias', 'conferencia'],
  partidos: ['en un partido', 'por partido jugado', 'partido a partido', 'una noche', 'noches', 'actuaciones'],
  jugadores: ['jugadores', 'jugador', 'quienes', 'quien'],
  equipos: ['equipos', 'equipo', 'planteles', 'clubes'],
};

const OPERADORES = [
  ['<', ['menos de', 'menor a', 'menores a', 'por debajo de', 'debajo de', 'abajo de']],
  ['<=', ['hasta', 'como mucho', 'como maximo', 'maximo de', 'maximo']],
  ['>', ['mas de', 'mayor a', 'mayores a', 'por encima de', 'encima de', 'arriba de']],
  ['>=', ['al menos', 'como minimo', 'minimo de', 'minimo', 'desde', 'a partir de']],
  ['<=', ['<=']], ['>=', ['>=']], ['<', ['<']], ['>', ['>']],
];

/* Palabras que no son un concepto aunque se parezcan a uno. */
const SIN_RAIZ = ['perdidos', 'perdido', 'ganados', 'ganado', 'jugados', 'jugado', 'jugando', 'puntero', 'punteros', 'partidos', 'partido', 'defender', 'tirando', 'reciente', 'recientes'];

/* Raíces que abren demasiadas palabras ajenas al básquet: «contra» abre
   «contrario», «genera» abre «general». Esos conceptos se reconocen solo
   escritos enteros, nunca por parecido. */
const RAIZ_AMBIGUA = ['contra', 'genera', 'pasado', 'recibe', 'puntos', 'libres', 'rapido', 'presio', 'creaci'];

/* Todas las frases que se buscan, con qué son. La más larga primero. */
function vocabulario(cat) {
  const out = [];
  const ids = [];
  ['jugadores', 'equipos', 'partidos'].forEach((n) => (cat[n] || []).forEach((k) => { if (ids.indexOf(k) === -1) ids.push(k); }));
  const propias = new Set(ids.map((k) => norm(k)));
  ids.forEach((k) => {
    const frases = [norm(k)];
    const sigla = norm(rotulo(k));
    if (sigla && frases.indexOf(sigla) === -1) frases.push(sigla);
    /* «efg», «usg», «t3» sin el signo, si no es la sigla de otra métrica. */
    const sin = norm(k).replace(/%/g, '').trim();
    if (sin.length >= 2 && sin !== norm(k) && !propias.has(sin)) frases.push(sin);
    frases.forEach((f) => out.push({ frase: f, tipo: 'sigla', m: [k] }));
  });
  CONCEPTOS.forEach((c) => c.f.forEach((f) => out.push({ frase: f, tipo: c.aprox ? 'aproximacion' : 'concepto', m: c.m, aprox: c.aprox || null, pocosMinutos: !!c.pocosMinutos })));
  NO_EXISTE.forEach((c) => c.f.forEach((f) => out.push({ frase: f, tipo: 'noExiste', que: c.que })));
  Object.keys(NIVELES_TEXTO).forEach((n) => NIVELES_TEXTO[n].forEach((f) => out.push({ frase: f, tipo: 'nivel', nivel: n })));
  /* Con el mismo largo, la sigla del libro le gana al concepto. */
  const peso = { sigla: 0, nivel: 1, noExiste: 2, aproximacion: 3, concepto: 4 };
  return out.sort((a, b) => (b.frase.length - a.frase.length) || (peso[a.tipo] - peso[b.tipo]));
}

/** Las menciones del texto, sin superponerse, en el orden en que aparecen. */
function menciones(texto, vocab) {
  const tomado = [];
  const libre = (a, b) => !tomado.some((t) => a < t.fin && b > t.ini);
  vocab.forEach((v) => {
    const re = new RegExp('(^|[^a-z0-9])(' + escapar(v.frase) + ')(?![a-z0-9%])', 'g');
    let m;
    while ((m = re.exec(texto))) {
      const ini = m.index + m[1].length, fin = ini + m[2].length;
      if (libre(ini, fin)) tomado.push(Object.assign({ ini, fin, texto: m[2] }, v));
      re.lastIndex = Math.max(fin, re.lastIndex);
    }
  });
  /* POR PARECIDO: una palabra larga que nadie tomó y comparte la raíz con
     un concepto de una sola palabra («reboteadores» → «rebote»). */
  const raices = new Map();
  vocab.forEach((v) => { if ((v.tipo === 'concepto' || v.tipo === 'aproximacion') && v.frase.indexOf(' ') === -1 && v.frase.length >= 6 && RAIZ_AMBIGUA.indexOf(v.frase.slice(0, 6)) === -1 && !raices.has(v.frase.slice(0, 6))) raices.set(v.frase.slice(0, 6), v); });
  const rp = /[a-z]{7,}/g;
  let p;
  while ((p = rp.exec(texto))) {
    const ini = p.index, fin = ini + p[0].length, v = raices.get(p[0].slice(0, 6));
    if (v && SIN_RAIZ.indexOf(p[0]) === -1 && libre(ini, fin)) tomado.push(Object.assign({ ini, fin, texto: p[0] }, v, { tipo: v.tipo === 'aproximacion' ? 'aproximacion' : 'parecido', parecidoA: v.frase }));
  }
  return tomado.sort((a, b) => a.ini - b.ini);
}

/** Las condiciones escritas: «menos de 15», «al menos 3», «>= 35 %». */
function condicionesDe(texto) {
  const frases = [];
  OPERADORES.forEach((o) => o[1].forEach((f) => frases.push({ f, op: o[0] })));
  frases.sort((a, b) => b.f.length - a.f.length);
  const re = new RegExp('(^|[^a-z0-9])(' + frases.map((x) => escapar(x.f)).join('|') + ')\\s*(\\d+(?:[.,]\\d+)?)', 'g');
  const out = [];
  let m;
  while ((m = re.exec(texto))) {
    const ini = m.index + m[1].length;
    out.push({ ini, fin: m.index + m[0].length, op: frases.find((x) => x.f === m[2]).op, valor: Number(m[3].replace(',', '.')), texto: m[0].slice(m[1].length) });
  }
  return out;
}

const POR = { sigla: 'la sigla del libro', concepto: 'el concepto', parecido: 'parecido de palabra', aproximacion: 'aproximación' };

/**
 * Lee el texto libre contra el catálogo del libro.
 *   cat   · { jugadores: [ids], equipos: [ids], partidos: [ids] }
 *   opc   · { nivel: forzar uno, zonas: la liga tiene dos o más con libro }
 * Devuelve { ok, motivo, consulta, entendido, aproximaciones, noExiste,
 * fuera, lectura }. Sin ninguna métrica reconocida, ok es false y el
 * motivo dice cómo escribirlo.
 */
function interpretarLibre(texto, cat, opc) {
  const o = opc || {};
  const t = norm(texto);
  if (t.length < 3) return { ok: false, motivo: 'Escribí qué querés mirar: una métrica, dos para cruzar o una hipótesis.' };
  const ms = menciones(t, vocabulario(cat));
  const conds = condicionesDe(t);
  const noExiste = ms.filter((m) => m.tipo === 'noExiste').map((m) => m.que).filter((q, i, a) => a.indexOf(q) === i);
  const datos = ms.filter((m) => m.m);

  /* EL NIVEL · el que se fuerza, el que el texto nombra, o el que pueda
     contestar más de lo pedido. */
  const nombrado = (ms.find((m) => m.tipo === 'nivel') || {}).nivel || null;
  const resuelve = (m, n) => m.m.find((k) => (cat[n] || []).indexOf(k) !== -1) || null;
  const cuenta = (n) => datos.filter((m) => resuelve(m, n)).length;
  let nivel = o.nivel && cat[o.nivel === 'zonas' ? 'equipos' : o.nivel] ? o.nivel : nombrado;
  /* «Tiradores», «reboteadores», «suplentes»: se habla de personas. */
  const dePersonas = /(^| )[a-z]{4,}(dores|dor)( |$)/.test(t) || datos.some((m) => m.pocosMinutos);
  if (!nivel) nivel = dePersonas || cuenta('jugadores') > cuenta('equipos') ? 'jugadores' : 'equipos';
  const avisos = [];
  if (nivel === 'zonas' && !o.zonas) { nivel = 'equipos'; avisos.push('Esta liga tiene una sola zona con libro: comparo equipos en vez de zonas.'); }
  const nCat = nivel === 'zonas' ? 'equipos' : nivel;

  /* Cada mención, llevada a la métrica de ese nivel. */
  const fuera = [], entendido = [], aproximaciones = [];
  let pocosMinutos = false;
  datos.forEach((m) => {
    m.id = resuelve(m, nCat);
    if (!m.id) { const d = '«' + m.texto + '» no tiene dato a nivel ' + nCat + '.'; if (fuera.indexOf(d) === -1) fuera.push(d); return; }
    if (m.pocosMinutos) pocosMinutos = true;
    if (m.aprox && aproximaciones.indexOf(m.aprox) === -1) aproximaciones.push(m.aprox);
    if (!entendido.some((e) => e.frase === m.texto && e.metrica === m.id)) {
      entendido.push({ frase: m.texto, metrica: m.id, label: rotulo(m.id), nombre: def(m.id).label, por: m.tipo, como: POR[m.tipo] + (m.parecidoA ? ' con «' + m.parecidoA + '»' : '') });
    }
  });
  const validas = datos.filter((m) => m.id);

  /* LAS CONDICIONES · el número va con el concepto que tiene pegado
     después («menos de 15 minutos»); si no hay, con el de antes. */
  const condiciones = [], sueltas = [];
  conds.forEach((c) => {
    const despues = validas.filter((m) => m.ini >= c.fin && m.ini - c.fin <= 22)[0];
    const antes = validas.filter((m) => m.fin <= c.ini && c.ini - m.fin <= 30).slice(-1)[0];
    const m = despues || antes;
    if (!m) { sueltas.push('La condición «' + c.texto + '» no dice de qué métrica: no la apliqué.'); return; }
    m.enCondicion = true;
    if (nivel !== 'zonas' && !condiciones.some((x) => x.metrica === m.id && x.op === c.op)) condiciones.push({ metrica: m.id, op: c.op, valor: c.valor });
  });
  if (nivel === 'zonas' && conds.length) avisos.push('La comparativa entre zonas no lleva condiciones: no las apliqué.');

  const unicas = (lista) => lista.map((m) => m.id).filter((k, i, a) => a.indexOf(k) === i);
  let principales = unicas(validas.filter((m) => !m.enCondicion && !m.pocosMinutos));
  if (!principales.length) principales = unicas(validas);
  if (!principales.length) {
    return { ok: false, noExiste, fuera, avisos: avisos.concat(sueltas),
      motivo: (noExiste.length ? noExiste.join(' ') + ' ' : '') + 'No reconocí ninguna métrica del libro en ese texto. Probá nombrando el concepto («ritmo», «triples», «pérdidas», «rebote ofensivo», «uso») o la sigla tal como está en la planilla («eFG%», «USG%», «PACE»).' };
  }
  principales = principales.slice(0, 6);
  const cruce = nivel !== 'zonas' && principales.length >= 2 ? principales.slice(0, 2) : null;
  const orden = principales[0];

  /* QUÉ GRUPO DEL CRUCE PIDE LA HIPÓTESIS · la palabra pegada antes de
     cada métrica: «más uso y peor true shooting» son los altos en una y
     bajos en la otra. «Más» y «menos» van por el valor; «mejor» y «peor»
     se dan vuelta en una métrica donde menos es mejor (peor defensa es un
     rating defensivo ALTO). Sin palabra, el grupo por defecto. */
  let grupo = null;
  if (cruce) {
    const lado = (id) => {
      const m = validas.find((x) => x.id === id && !x.enCondicion) || validas.find((x) => x.id === id);
      const antes = (' ' + t.slice(Math.max(0, m.ini - 16), m.ini) + ' ').match(/ (mas|mayor|mucho|mucha|alto|alta|menos|menor|poco|poca|bajo|baja|mejor|mejores|peor|peores) (?!.* (mas|mayor|mucho|mucha|alto|alta|menos|menor|poco|poca|bajo|baja|mejor|mejores|peor|peores) )/);
      if (!antes) return null;
      const w = antes[1], inv = !!def(id).invertida;
      if (/^(mas|mayor|mucho|mucha|alto|alta)$/.test(w)) return 'alto';
      if (/^(menos|menor|poco|poca|bajo|baja)$/.test(w)) return 'bajo';
      return /^mejor/.test(w) ? (inv ? 'bajo' : 'alto') : (inv ? 'alto' : 'bajo');
    };
    const la = lado(cruce[0]), lb = lado(cruce[1]);
    if (la || lb) { const a = la || 'alto', b = lb || 'bajo'; grupo = a + b.charAt(0).toUpperCase() + b.slice(1); }
    /* UNA PREGUNTA DE INFLUENCIA («¿cómo influye…?», «¿qué tan decisivo…?»)
       no pide una esquina del cruce: pide la escalera entera. */
    else if (/(^| )(influye|influyen|influencia|influir|impacta|impactan|impacto|incide|inciden|decisivo|decisiva|determinante|pesa|pesan|relacion|explica|explican)( |$)/.test(t)) grupo = 'todos';
  }

  let sentido;
  if (!cruce) {
    if (/(^| )(los que menos|las que menos|mas bajo|mas bajos|mas baja|mas bajas)( |$)/.test(t)) sentido = 'asc';
    else if (/(^| )(peor|peores)( |$)/.test(t)) sentido = def(orden).invertida ? 'desc' : 'asc';
  }
  const mt = t.match(/(?:^| )top ?(\d{1,2})(?: |$)/) || t.match(/(?:^| )l[oa]s (\d{1,2}) (?:mejores|peores|primeros|primeras|que)(?: |$)/);
  const top = mt ? Math.min(50, Math.max(1, Number(mt[1]))) : 10;
  const filtraMinutos = condiciones.some((c) => c.metrica === 'MIN');
  const soloCalificados = nivel === 'jugadores' && !pocosMinutos && !filtraMinutos;

  /* EL PORCENTAJE SIN PISO DE VOLUMEN: no se le inventa una condición
     —sería decidir un número por quien opera—, se avisa cómo pedirla. */
  if (nivel !== 'zonas' && nivel !== 'equipos') {
    (cruce || [orden]).forEach((k) => {
      const vol = VOLUMEN[k];
      if (vol && !condiciones.some((c) => c.metrica === vol)) avisos.push(rotulo(k) + ' va sin piso de intentos: arriba puede quedar alguien con uno o dos tiros. Para evitarlo, sumale al texto «con al menos 2 ' + rotulo(vol) + '» (o el piso que quieras).');
    });
  }

  const consulta = { nivel, metricas: principales, orden, top, soloCalificados, condiciones };
  if (sentido) consulta.sentido = sentido;
  if (cruce) consulta.cruce = cruce;
  if (grupo) consulta.grupo = grupo;

  const nombres = { jugadores: 'jugadores', equipos: 'equipos', partidos: 'actuaciones de un equipo en un partido', zonas: 'zonas' };
  const lectura = 'Miro ' + nombres[nivel] + (nombrado || o.nivel ? '' : ' (el texto no decía el nivel)') + '. ' +
    (cruce ? 'Cruzo ' + rotulo(cruce[0]) + ' con ' + rotulo(cruce[1]) + (grupo === 'todos' ? ' y, como preguntás por la influencia, muestro a todos ordenados por la primera' : grupo ? ' y, por cómo está escrito, muestro a los ' + grupo.replace(/^(alto|bajo)(Alto|Bajo)$/, (x, a, b) => a + 's en la primera y ' + b.toLowerCase() + 's en la segunda') : '') + '.' :'Ordeno por ' + rotulo(orden) + (sentido === 'asc' ? ', de menor a mayor' : '') + '.') +
    (principales.length > 2 ? ' Sumo a la tabla ' + principales.slice(2).map(rotulo).join(', ') + '.' : '') +
    (condiciones.length ? ' Condiciones: ' + condiciones.map((c) => rotulo(c.metrica) + ' ' + c.op + ' ' + String(c.valor).replace('.', ',')).join(' y ') + '.' : '') +
    (soloCalificados ? ' Solo los que califican por minutos.' : nivel === 'jugadores' ? ' Sin exigir el umbral de minutos.' : '');
  return { ok: true, nivel, consulta, entendido, aproximaciones, noExiste, fuera, avisos: avisos.concat(sueltas), lectura };
}

module.exports = { interpretarLibre, norm, CONCEPTOS, NO_EXISTE, vocabulario, menciones, condicionesDe };
