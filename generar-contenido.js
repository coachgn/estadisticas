/* =====================================================================
   generar-contenido.js · los números frescos del contenido de redes

     node generar-contenido.js --liga apb --zona a
     node generar-contenido.js --liga apb --zona b --desde 2026-10-01 --hasta 2026-10-04
     node generar-contenido.js --liga lnb

   Se corre A MANO, como `generar-demo.js`: no entra al camino del sitio.
   Lee un libro con la credencial local (`server/.env` + el catálogo de
   KV), arma el índice con el MISMO núcleo del panel y devuelve dos cosas:

     1. STORIES · el «Top 3 de la fecha» en cinco categorías, con la forma
        de la plantilla que ya usa la cuenta (portada, cinco rankings y
        cierre).
     2. FEED · el posteo que profundiza: por cada categoría, los líderes
        de la noche contra su temporada y contra la liga. El script
        propone UNA (la más contraintuitiva) y deja las otras cuatro.

   LAS TRES REGLAS

     · LOS NOMBRES SOLO SALEN EN APdeB. Para el resto de las ligas la
       salida se anonimiza («Jugador 1», «Equipo A») y, antes de escribir,
       se verifica que no quede un solo nombre del libro en el JSON. Ver
       INFORME_PERMISOS_CAB.md de motorstats-ingestion.
     · FORMATIVAS NO. No hay ninguna en `LIGAS` y una categoría con pinta
       de menores se rechaza.
     · UN DATO AUSENTE SE DICE. Una jornada sin partidos, una categoría
       con menos de tres jugadores o un partido con el box truncado
       (punto 66) salen como `avisos`, no como un ranking a medias.

   La carpeta `contenido/` está en .gitignore: el repo es público.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const NUCLEO = require('./js/sgadd-core.js');

/* --------------------------------------------------------------------
   Qué ligas hay y cuáles pueden salir con nombre.
   Cada zona apunta a una categoría del catálogo: el sheetId lo resuelve
   el servidor y nunca se escribe acá ni en la salida.
   -------------------------------------------------------------------- */
const LIGAS = {
  apb: {
    torneo: 'TORNEO APdeB 2026', nombres: true, logos: 'la-plata', nivel: 'LOCAL_MAYORES',
    zonas: {
      a: { club: 'reconquista', categoria: 'reconquista-primera', label: 'ZONA A' },
      b: { club: 'deportivo', categoria: 'deportivo-primera', label: 'ZONA B' },
      c: { club: 'apb-2026-masculino', categoria: 'apb-2026-c', label: 'ZONA C' },
    },
  },
  lnb: {
    torneo: 'LIGA NACIONAL 2026-27', nombres: false, logos: 'liga-nacional', nivel: 'LIGA_NACIONAL',
    zonas: { unica: { club: 'liga-nacional-2026-27', categoria: 'lnb-2026-27', label: '', pbp: 'lnb-2026-27' } },
  },
  lab: {
    torneo: 'LIGA ARGENTINA 2026-27', nombres: false, logos: 'liga-argentina', nivel: 'LIGA_ARGENTINA',
    zonas: {
      norte: { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', label: 'CONFERENCIA NORTE', pbp: 'lab-2026-27-norte' },
      sur: { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-sur', label: 'CONFERENCIA SUR', pbp: 'lab-2026-27-sur' },
    },
  },
};

const PATRON_FORMATIVAS = /(^|[^a-z])u\s?\d{2}([^0-9]|$)|formativ|menores|infantil|cadete|juvenil/i;

/* Para entrar a un Top 3 hay que haber jugado: con 4 minutos y un triple,
   el «2,00 puntos por tiro» no describe a nadie. */
const PISO_MINUTOS = 10;
/* Dos días de partidos separados por hasta 3 días son la misma fecha
   (martes y jueves). Más de una semana seguida ya no es una fecha: es un
   calendario continuo (LNB) y se toma la última semana. */
const HUECO_JORNADA = 3;
const LARGO_MAXIMO = 7;
const TOP = 3;
/* El contexto de temporada del posteo de feed. */
const LIDERES_TEMPORADA = 10;

/* --------------------------------------------------------------------
   Las cinco categorías de la plantilla de Stories. `orden` es
   lexicográfico: primero el VOLUMEN de la noche, después la EFICIENCIA,
   que es el criterio que la plantilla declara en cada placa.
   `vol`/`efi` son las columnas de temporada del posteo de feed.
   -------------------------------------------------------------------- */
const CATEGORIAS = [
  {
    id: 'generadores', titulo: 'TOP 3 GENERADORES', portada: 'GENERADORES',
    criterio: 'VOLUMEN DE AST + EFICIENCIA AST-PP',
    orden: ['AST', 'AST-PP'], cols: ['MIN', 'PLAYS', 'AST', 'AST-PP'], vol: 'AST', efi: 'AST-PP',
    feed: {
      titulo: 'Asistir mucho no es generar bien',
      problema: 'El que más asiste suele ser el que más pelota tiene, y también el que más la pierde.',
      lectura: 'asistencias por cada pérdida',
      debate: '¿Tu base genera o solo acumula pases?',
    },
  },
  {
    id: 't3', titulo: 'TOP 3 DEFINIDORES DE 3P', portada: 'DEFINIDORES DE 3P',
    criterio: 'TIRO DE 3 CONVERTIDOS + PUNTOS POR TIRO DE 3',
    orden: ['T3C', 'PPT3'], cols: ['MIN', 'PTS', 'T3C', 'PPT3'], vol: 'T3I', efi: 'PPT3',
    feed: {
      titulo: 'Tirar muchos triples no es ser tirador',
      problema: 'El volumen se ve en la planilla. Lo que vale cada intento, no.',
      lectura: 'puntos por triple intentado',
      debate: '¿A quién le cerrás el tiro: al que más tira o al que más cobra?',
    },
  },
  {
    id: 't2', titulo: 'TOP 3 DEFINIDORES DE 2P', portada: 'DEFINIDORES DE 2P',
    criterio: 'TIRO DE 2 CONVERTIDOS + PUNTOS POR TIRO DE 2',
    orden: ['T2C', 'PPT2'], cols: ['MIN', 'PTS', 'T2C', 'PPT2'], vol: 'T2I', efi: 'PPT2',
    feed: {
      titulo: 'La pintura no perdona al que tira de más',
      problema: 'Cargar el juego interno rinde solo si cada intento paga.',
      lectura: 'puntos por doble intentado',
      debate: '¿Tu referencia interna justifica el volumen que le das?',
    },
  },
  {
    id: 't1', titulo: 'TOP 3 DEFINIDORES DE 1P', portada: 'DEFINIDORES DE 1P',
    criterio: 'TIRO DE 1 CONVERTIDO + PUNTOS POR TIRO DE 1 + % RATIO DE TIRO LIBRE',
    orden: ['T1C', 'PPT1'], cols: ['MIN', 'T1C', 'PPT1', 'RTL%'], vol: 'T1I', efi: 'PPT1',
    feed: {
      titulo: 'Ir a la línea es un arma. Fallar ahí, un regalo',
      problema: 'El que más faltas saca no siempre es el que más cobra.',
      lectura: 'puntos por libre intentado',
      debate: '¿Sabés a qué rival conviene mandar a la línea?',
    },
  },
  {
    id: 'ro', titulo: 'TOP 3 REBOTES OFENSIVOS', portada: 'REBOTES OFENSIVOS',
    criterio: 'REBOTE OFENSIVO + % DE REBOTE OFENSIVO',
    orden: ['RO', 'RO%'], cols: ['MIN', 'RO', 'RO%', 'RT%'], vol: 'RO', efi: 'RO%',
    feed: {
      titulo: 'El rebote ofensivo es una posesión que no figura',
      problema: 'Cada rebote de ataque es un tiro más que el rival no planificó defender.',
      lectura: 'porción de los rebotes ofensivos disponibles',
      debate: '¿Tenés asignado el bloqueo sobre el que más carga?',
    },
  },
];

/* -------------------------------------------------------------------- */
const esNum = (v) => typeof v === 'number' && isFinite(v);
const dia = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return null;
  /* El índice arma la fecha a la medianoche LOCAL: se lee local. */
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
/** La planilla a veces escribe «APELLIDO , NOMBRE». */
const nombreLimpio = (v) => String(v == null ? '' : v).replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
const redondear = (v, n) => (esNum(v) ? Math.round(v * Math.pow(10, n)) / Math.pow(10, n) : null);

/** El valor como lo escribe la plantilla: los % van de 0 a 100. */
function mostrar(col, v) {
  if (!esNum(v)) return null;
  if (/%$/.test(col)) return redondear(v * 100, 2);
  return redondear(v, 2);
}

/* --------------------------------------------------------------------
   JORNADAS · la planilla no trae el número de fecha, así que se infiere
   de los días con partidos. Es una inferencia y se declara: `--fecha-n`
   la pisa, y `--desde/--hasta` eligen la ventana a mano.
   -------------------------------------------------------------------- */
function partidosPorDia(idx) {
  const porDia = new Map();
  idx.liga.jugadorPartidos.forEach((filas) => filas.forEach((f) => {
    const d = dia(f.__fecha);
    if (!d) return;
    if (!porDia.has(d)) porDia.set(d, new Set());
    porDia.get(d).add(f.__id);
  }));
  return porDia;
}

function jornadas(idx) {
  const porDia = partidosPorDia(idx);
  const dias = Array.from(porDia.keys()).sort();
  const out = [];
  dias.forEach((d) => {
    const ult = out[out.length - 1];
    if (ult && diasEntre(ult.hasta, d) <= HUECO_JORNADA) {
      ult.hasta = d; ult.dias.push(d);
    } else {
      out.push({ desde: d, hasta: d, dias: [d] });
    }
  });
  return out.map((j, i) => {
    const ids = new Set();
    j.dias.forEach((d) => porDia.get(d).forEach((id) => ids.add(id)));
    return { n: i + 1, desde: j.desde, hasta: j.hasta, partidos: ids.size };
  });
}

/** La ventana a publicar: la que se pidió o la última jornada. */
function ventana(idx, o) {
  const op = o || {};
  const js = jornadas(idx);
  if (op.desde || op.hasta) {
    const desde = op.desde || op.hasta, hasta = op.hasta || op.desde;
    if (desde > hasta) throw new Error('`--desde` es posterior a `--hasta`');
    const j = js.filter((x) => x.hasta >= desde && x.desde <= hasta).pop();
    return { desde, hasta, n: op.fechaN || (j ? j.n : null), inferida: !op.fechaN, tipo: 'rango' };
  }
  const ult = js[js.length - 1];
  if (!ult) return null;
  if (diasEntre(ult.desde, ult.hasta) + 1 > LARGO_MAXIMO) {
    /* Calendario continuo: no hay «fecha», se toma la última semana. */
    const d = new Date(Date.parse(ult.hasta + 'T12:00:00Z') - (LARGO_MAXIMO - 1) * 864e5);
    return { desde: d.toISOString().slice(0, 10), hasta: ult.hasta, n: op.fechaN || null, inferida: false, tipo: 'semana' };
  }
  return { desde: ult.desde, hasta: ult.hasta, n: op.fechaN || ult.n, inferida: !op.fechaN, tipo: 'jornada' };
}

/* --------------------------------------------------------------------
   STORIES · el Top 3 de cada categoría sobre las filas de la ventana.
   -------------------------------------------------------------------- */
function filasDeVentana(idx, v, excluidos) {
  const out = [];
  idx.liga.jugadorPartidos.forEach((filas) => filas.forEach((f) => {
    const d = dia(f.__fecha);
    if (!d || d < v.desde || d > v.hasta) return;
    if (excluidos && excluidos.has(f.__id)) return;
    out.push(f);
  }));
  return out;
}

function comparar(orden) {
  return (a, b) => {
    for (let i = 0; i < orden.length; i++) {
      const x = esNum(a[orden[i]]) ? a[orden[i]] : -Infinity;
      const y = esNum(b[orden[i]]) ? b[orden[i]] : -Infinity;
      if (x !== y) return y - x;
    }
    /* Con todo empatado, el que lo hizo en menos minutos. El nombre al
       final: es arbitrario, pero estable entre corridas. */
    return (a.MIN || 0) - (b.MIN || 0) || String(a.NOMBRES).localeCompare(String(b.NOMBRES), 'es');
  };
}

function top3(filas, cat) {
  const cmp = comparar(cat.orden);
  const candidatos = filas
    .filter((f) => esNum(f.MIN) && f.MIN >= PISO_MINUTOS && esNum(f[cat.orden[0]]) && f[cat.orden[0]] > 0)
    .sort(cmp);
  const avisos = [];
  if (candidatos.length < TOP) {
    avisos.push('Solo ' + candidatos.length + ' jugadores con ' + PISO_MINUTOS + '+ minutos y ' + cat.orden[0] + ' > 0: no se arma el Top 3.');
    return { id: cat.id, titulo: cat.titulo, criterio: cat.criterio, puestos: [], avisos };
  }
  const iguales = (a, b) => cat.orden.every((c) => a[c] === b[c]);
  if (candidatos[TOP] && iguales(candidatos[TOP - 1], candidatos[TOP])) {
    avisos.push('El 3.º y el 4.º empatan en ' + cat.orden.join(' y ') + ': entró el de menos minutos (' +
      candidatos[TOP].NOMBRES + ' quedó afuera).');
  }
  const puestos = candidatos.slice(0, TOP).map((f, i) => {
    const stats = {};
    cat.cols.forEach((c) => { stats[c] = mostrar(c, f[c]); });
    return {
      puesto: i + 1, jugador: nombreLimpio(f.NOMBRES), equipo: NUCLEO.limpiarNombre(f.EQUIPO),
      equipoClave: f.__equipo, partido: f.__partido, fecha: dia(f.__fecha), stats,
    };
  });
  return { id: cat.id, titulo: cat.titulo, criterio: cat.criterio, columnas: cat.cols, puestos, avisos };
}

/* --------------------------------------------------------------------
   FEED · el posteo que profundiza. La pregunta es siempre la misma:
   ¿los que más VOLUMEN tienen en la temporada rinden por encima de la
   liga en la EFICIENCIA de esa misma acción?
   -------------------------------------------------------------------- */
function contextoDeCategoria(idx, cat, puestos) {
  const cal = idx.liga.jugadoresCalificados.filter((j) => esNum(j[cat.vol]) && esNum(j[cat.efi]));
  if (cal.length < LIDERES_TEMPORADA) return null;
  const medEfi = NUCLEO.mediana(cal.map((j) => j[cat.efi]));
  const medVol = NUCLEO.mediana(cal.map((j) => j[cat.vol]));
  const pct = (col, v) => redondear(NUCLEO.percentil(cal.map((j) => j[col]), v, false), 0);

  const lideres = cal.slice().sort((a, b) => b[cat.vol] - a[cat.vol]).slice(0, LIDERES_TEMPORADA);
  const bajoMediana = lideres.filter((j) => j[cat.efi] < medEfi).length;

  const fila = (j) => ({
    jugador: nombreLimpio(j.NOMBRES), equipo: NUCLEO.limpiarNombre(j.EQUIPO), pj: j.PJ, min: redondear(j.MIN, 1),
    volumen: mostrar(cat.vol, j[cat.vol]), eficiencia: mostrar(cat.efi, j[cat.efi]),
    percentilEficiencia: pct(cat.efi, j[cat.efi]),
  });

  /* Los tres de la noche, contra su propia temporada. Se buscan por
     NOMBRE + EQUIPO: con el nombre solo, dos homónimos se cruzan. */
  const noche = puestos.map((p) => {
    const j = idx.liga.jugadores.find((x) => NUCLEO.clavePersona(x.NOMBRES) === NUCLEO.clavePersona(p.jugador) &&
      NUCLEO.claveEquipo(x.EQUIPO) === p.equipoClave);
    return {
      puesto: p.puesto, jugador: p.jugador, equipo: p.equipo, noche: p.stats,
      temporada: j ? Object.assign(fila(j), { califica: !!j.__califica }) : null,
    };
  });

  return {
    calificados: cal.length,
    medianaLiga: { volumen: mostrar(cat.vol, medVol), eficiencia: mostrar(cat.efi, medEfi) },
    lideresDeVolumen: lideres.map(fila),
    lideresBajoLaMediana: bajoMediana,
    /* Top 3 y bottom 3 de eficiencia ENTRE los que más volumen tienen. */
    masEficientes: lideres.slice().sort((a, b) => b[cat.efi] - a[cat.efi]).slice(0, 3).map(fila),
    /* El fondo va SIN nombre aunque la liga los permita: señalar con nombre
       y apellido al menos eficiente de una liga amateur no es el contenido. */
    menosEficientes: lideres.slice().sort((a, b) => a[cat.efi] - b[cat.efi]).slice(0, 3)
      .map((j, i) => Object.assign(fila(j), { jugador: 'Caso ' + (i + 1), equipo: null })),
    noche,
  };
}

function feedDeCategoria(cat, ctx, meta) {
  if (!ctx) return null;
  const n = ctx.lideresBajoLaMediana;
  const dato = n + ' de los ' + LIDERES_TEMPORADA + ' jugadores con más volumen de la ' + (meta.zona || 'liga') +
    ' están por debajo de la mediana en ' + cat.feed.lectura + ' (' + ctx.medianaLiga.eficiencia + ').';
  return {
    id: 'FEED-' + cat.id.toUpperCase(), formato: 'Carrusel 3:4 (1080x1350)', deriva: cat.titulo,
    titulo: cat.feed.titulo, contraste: n,
    slides: [
      { n: 1, rol: 'Portada', texto: cat.feed.titulo, apoyo: meta.torneo + (meta.zona ? ' · ' + meta.zona : '') },
      { n: 2, rol: 'Problema', texto: cat.feed.problema },
      { n: 3, rol: 'El Top 3 de la fecha, contra su temporada', tabla: ctx.noche },
      { n: 4, rol: 'La liga', texto: dato, masEficientes: ctx.masEficientes, menosEficientes: ctx.menosEficientes },
      { n: 5, rol: 'Debate y CTA', texto: cat.feed.debate, cta: 'Probá la demo · link en bio' },
    ],
    contexto: ctx,
  };
}

/* --------------------------------------------------------------------
   EL PAQUETE · puro: entra un índice, sale el contenido.
   -------------------------------------------------------------------- */
function paquete(idx, opciones) {
  const o = opciones || {};
  const avisos = [];
  const v = ventana(idx, o);
  if (!v) return { ok: false, avisos: ['El libro no tiene partidos con fecha en este tramo.'] };

  /* Un box truncado da tasas infladas (punto 66): esa noche no entra. */
  const trunc = NUCLEO.detectarBoxTruncado(idx);
  const excluidos = new Set((trunc.filas || []).map((f) => f.id).filter(Boolean));
  const filas = filasDeVentana(idx, v, excluidos);
  const enVentana = new Set(filasDeVentana(idx, v).map((f) => f.__id));
  const sacados = Array.from(enVentana).filter((id) => excluidos.has(id)).length;
  if (sacados) avisos.push(sacados + ' partido(s) de la ventana tienen el box score truncado y quedaron afuera.');
  if (!filas.length) return { ok: false, ventana: v, avisos: avisos.concat('No hay partidos entre ' + v.desde + ' y ' + v.hasta + '.') };
  if (v.inferida && v.n) avisos.push('El número de fecha (' + v.n + ') se infirió de los días con partidos: confirmalo o pasá --fecha-n.');
  if (v.tipo === 'semana') avisos.push('Calendario continuo: se tomó la última semana, no una fecha.');

  const meta = {
    torneo: o.torneo || '', zona: o.zona || '', fecha: v.n, desde: v.desde, hasta: v.hasta,
    partidos: enVentana.size - sacados, tramo: idx.liga.torneo + '|' + idx.fase,
  };

  const rankings = CATEGORIAS.map((c) => top3(filas, c));
  rankings.forEach((r) => r.avisos.forEach((a) => avisos.push(r.titulo + ': ' + a)));

  const stories = {
    formato: 'Story 9:16 (1080x1920)', meta,
    placas: [
      { n: 1, tipo: 'portada', titulo: 'TOP 3 DE LA FECHA', categorias: CATEGORIAS.map((c) => c.portada),
        pie: 'ARMÁ TU QUINTETO IDEAL EN LAS PRÓXIMAS HISTORIAS' },
    ].concat(rankings.map((r, i) => Object.assign({ n: i + 2, tipo: 'ranking' }, r)), [
      { n: CATEGORIAS.length + 2, tipo: 'cierre',
        texto: 'LOS GANADORES DE CADA MÉTRICA SERÁN PARTE DEL QUINTETO IDEAL DE LA FECHA',
        quintetoIdeal: rankings.map((r) => (r.puestos[0] ? { categoria: r.id, jugador: r.puestos[0].jugador, equipo: r.puestos[0].equipo } : null)).filter(Boolean),
        cta: 'PROBÁ MOTORSTATS AHORA' },
    ]),
  };

  const candidatos = CATEGORIAS.map((c, i) => {
    const ctx = rankings[i].puestos.length ? contextoDeCategoria(idx, c, rankings[i].puestos) : null;
    return feedDeCategoria(c, ctx, meta);
  }).filter(Boolean);
  if (!candidatos.length) avisos.push('No hay calificados suficientes para el posteo de feed.');

  /* Se propone la más contraintuitiva: donde MÁS líderes de volumen
     quedan por debajo de la mediana de eficiencia. `--feed` la pisa. */
  let elegida = null;
  if (o.feed) {
    elegida = candidatos.find((c) => c.id === 'FEED-' + String(o.feed).toUpperCase()) || null;
    if (!elegida) avisos.push('`--feed ' + o.feed + '` no existe o no tiene datos: se eligió por contraste.');
  }
  if (!elegida) elegida = candidatos.slice().sort((a, b) => b.contraste - a.contraste)[0] || null;

  const feed = { meta, elegida: elegida ? elegida.id : null, posteo: elegida, alternativas: candidatos.filter((c) => c !== elegida) };
  return { ok: true, ventana: v, stories, feed, avisos };
}

/* --------------------------------------------------------------------
   ANONIMIZAR · y verificar que no quedó nada.
   -------------------------------------------------------------------- */
function nombresDelLibro(idx) {
  const jug = new Set(), eq = new Set();
  idx.liga.jugadores.forEach((j) => { if (j.NOMBRES) jug.add(String(j.NOMBRES)); });
  idx.liga.jugadorPartidos.forEach((fs) => fs.forEach((f) => { if (f.NOMBRES) jug.add(String(f.NOMBRES)); }));
  idx.lista().forEach((e) => { eq.add(e.nombre); eq.add(e.clave); });
  return { jugadores: Array.from(jug), equipos: Array.from(eq) };
}

function anonimizar(pq) {
  const jug = new Map(), eq = new Map();
  const letra = (i) => (i < 26 ? String.fromCharCode(65 + i) : 'A' + String.fromCharCode(65 + i - 26));
  const j = (v) => { if (!jug.has(v)) jug.set(v, 'Jugador ' + (jug.size + 1)); return jug.get(v); };
  const e = (v) => { if (!eq.has(v)) eq.set(v, 'Equipo ' + letra(eq.size)); return eq.get(v); };
  const andar = (x) => {
    if (Array.isArray(x)) return x.map(andar);
    if (!x || typeof x !== 'object') return x;
    const out = {};
    Object.keys(x).forEach((k) => {
      if (k === 'jugador') out[k] = x[k] == null ? null : j(x[k]);
      else if (k === 'equipo') out[k] = x[k] == null ? null : e(x[k]);
      /* El texto del partido y la clave nombran a los dos equipos. */
      else if (k === 'partido' || k === 'equipoClave' || k === 'escudo' || k === 'foto') return;
      else out[k] = andar(x[k]);
    });
    return out;
  };
  const out = andar(pq);
  out.anonimo = true;
  /* El aviso de empate nombra al que quedó afuera. */
  if (pq.avisos) out.avisos = pq.avisos.map((a) => a.replace(/\(.+ quedó afuera\)\./, '(un jugador quedó afuera).'));
  ((out.stories || {}).placas || []).forEach((p) => { if (p.avisos) p.avisos = p.avisos.map((a) => a.replace(/\(.+ quedó afuera\)\./, '(un jugador quedó afuera).')); });
  return out;
}

/** Lanza si en la salida quedó un nombre del libro. */
function verificarAnonimo(pq, nombres) {
  /* El `guion` es plantilla fija, sin datos: no se revisa, o una palabra
     suya («sin nombre») choca con una fila basura del libro. */
  const texto = JSON.stringify(pq, (k, v) => (k === 'guion' ? undefined : v)).toUpperCase();
  /* Una persona es «APELLIDO, NOMBRE»: una sola palabra en esa columna es
     una fila mal cargada (un encabezado repetido), no alguien que cuidar. */
  const personas = nombres.jugadores.filter((n) => /[\s,]/.test(String(n).trim()));
  const fugas = personas.concat(nombres.equipos)
    .map((n) => String(n).trim().toUpperCase())
    /* Un nombre de 3 letras o menos matchea cualquier cosa. */
    .filter((n) => n.length >= 4 && texto.indexOf(JSON.stringify(n).slice(1, -1)) !== -1);
  if (fugas.length) throw new Error('La salida anónima todavía nombra a: ' + fugas.slice(0, 5).join(' · '));
  return true;
}

/* --------------------------------------------------------------------
   Los escudos, por si la placa los lleva. La foto del jugador no sale
   del libro: se pone a mano en la plantilla.
   -------------------------------------------------------------------- */
function conEscudos(pq, carpeta) {
  let manifiesto = {};
  try { manifiesto = JSON.parse(fs.readFileSync(path.join(__dirname, 'logos', carpeta, 'index.json'), 'utf8')); } catch (e) { return pq; }
  const de = (clave) => {
    const k = String(clave || '').toLowerCase().replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
    return manifiesto[k] ? 'logos/' + carpeta + '/' + manifiesto[k] : null;
  };
  pq.stories.placas.forEach((p) => (p.puestos || []).forEach((x) => { x.escudo = de(x.equipoClave); x.foto = null; }));
  return pq;
}

/* --------------------------------------------------------------------
   El resumen legible: lo que se revisa antes de armar las placas.
   -------------------------------------------------------------------- */
function resumen(pq) {
  const m = pq.stories.meta, L = [];
  L.push('# ' + m.torneo + (m.zona ? ' · ' + m.zona : '') + ' · fecha ' + (m.fecha || 's/n'));
  L.push('', 'Ventana ' + m.desde + ' a ' + m.hasta + ' · ' + m.partidos + ' partidos' + (pq.anonimo ? ' · ANÓNIMO' : ''), '');
  if (pq.avisos.length) { L.push('## Avisos', ''); pq.avisos.forEach((a) => L.push('- ' + a)); L.push(''); }
  L.push('## Stories', '');
  pq.stories.placas.filter((p) => p.tipo === 'ranking').forEach((p) => {
    L.push('### ' + p.titulo, '', '_Criterio: ' + p.criterio + '_', '');
    if (!p.puestos.length) { L.push('Sin datos suficientes.', ''); return; }
    L.push('| # | Jugador | Equipo | ' + p.columnas.join(' | ') + ' |', '|---|---|---|' + p.columnas.map(() => '---').join('|') + '|');
    p.puestos.forEach((x) => L.push('| ' + x.puesto + ' | ' + x.jugador + ' | ' + x.equipo + ' | ' + p.columnas.map((c) => x.stats[c]).join(' | ') + ' |'));
    L.push('');
  });
  const f = pq.feed.posteo;
  if (f) {
    L.push('## Feed · ' + f.titulo, '', 'Deriva de: ' + f.deriva + ' · ' + f.formato, '');
    f.slides.forEach((s) => L.push('- **S' + s.n + ' · ' + s.rol + ':** ' + (s.texto || '(tabla en feed.json)')));
    L.push('', 'Alternativas: ' + (pq.feed.alternativas.map((a) => a.titulo + ' (' + a.contraste + '/' + LIDERES_TEMPORADA + ')').join(' · ') || 'ninguna'), '');
  }
  return L.join('\n');
}

/* --------------------------------------------------------------------
   CLI
   -------------------------------------------------------------------- */
/* =====================================================================
   NIVEL 2 · las diez piezas de autoridad (CR-01 a RL-04)

   Cada receta es PURA: entra el índice (CR) o los paquetes de
   play-by-play (RL) y sale `{ id, ok, dato, datos, guion, muestra }`.
   No recalculan nada: piden el número al motor que ya lo muestra en el
   panel (núcleo, scouting, comparativa, similitud).

   SALEN ANÓNIMAS SIEMPRE, también en APdeB, salvo `--con-nombres` (que
   solo APdeB acepta): son contenido para entrenadores y no un ranking.
   Toda persona va bajo la clave `jugador` y todo club bajo `equipo`, que
   es lo que reescribe `anonimizar`. Ningún `dato` lleva un nombre.

   Una receta sin muestra devuelve `ok: false` con su motivo.
   ===================================================================== */
const MIN_EQUIPOS = 6;
const MIN_QUINTETO = 15;          // minutos juntos, el corte del panel (punto 62)
const MIN_CLUTCH = 5;             // partidos con cierre ajustado
const CICLO = 4;
const pct = (n, d) => (d ? Math.round(100 * n / d) : null);
const sin = (id, motivo) => ({ id, ok: false, avisos: [motivo] });

let _motores = null;
/** Los motores del panel, con los globales que esperan. Se cargan tarde:
    el camino de Stories no los necesita. */
function motores() {
  if (_motores) return _motores;
  global.SGADD = NUCLEO;
  const NIV = require('./js/sgadd-niveles.js');
  global.SGADD_NIVELES = NIV;
  const JUG = require('./js/sgadd-jugadores.js');
  const SCOUT = require('./js/sgadd-scouting.js');
  const COMP = require('./js/sgadd-comparativa.js');
  _motores = { NIV, JUG, SCOUT, COMP };
  return _motores;
}

/** El perfil de scouting de cada calificado, con sus señales (punto 64). */
function perfilesDeLiga(idx) {
  const { SCOUT } = motores();
  const out = [];
  idx.lista().forEach((e) => {
    const js = e.jugadores || [];
    const plays = js.reduce((s, j) => s + (esNum(j.PLAYS) ? j.PLAYS : 0), 0);
    const triples = js.reduce((s, j) => s + (esNum(j.T3I) ? j.T3I : 0), 0);
    js.filter((j) => j.__califica).forEach((j) => {
      try {
        const p = SCOUT.perfilJugador(idx, j, plays, triples);
        out.push({ j, e, p, s: SCOUT.senales(p) });
      } catch (err) { /* un jugador roto no tumba la receta */ }
    });
  });
  return out;
}
const persona = (x) => ({ jugador: nombreLimpio(x.j.NOMBRES), equipo: x.e.nombre });

/* ---------- CR-01 · ORTG por jugada contra por posesión --------------- */
function cr01(idx) {
  const eq = idx.lista().map((e) => {
    const t = (e.totales || {}).propio || {};
    if (!esNum(t.PTS) || !esNum(t.PLAYS) || !t.PLAYS) return null;
    const pos = t.PLAYS - (esNum(t.RO) ? t.RO : 0);
    const porPos = esNum((e.factores || {})['RTNG OFF']) ? e.factores['RTNG OFF'] : (pos ? 100 * t.PTS / pos : null);
    return { equipo: e.nombre, porJugada: 100 * t.PTS / t.PLAYS, porPosesion: porPos, roPorPartido: e.pj ? (t.RO || 0) / e.pj : null };
  }).filter((x) => x && esNum(x.porPosesion));
  if (eq.length < MIN_EQUIPOS) return sin('CR-01', 'Menos de ' + MIN_EQUIPOS + ' equipos con totales.');
  const puesto = (k) => { eq.slice().sort((a, b) => b[k] - a[k]).forEach((x, i) => { x['puesto_' + k] = i + 1; }); };
  puesto('porJugada'); puesto('porPosesion');
  const fila = (x) => ({ equipo: x.equipo, puestoPorJugada: x.puesto_porJugada, puestoPorPosesion: x.puesto_porPosesion,
    ortgPorJugada: redondear(x.porJugada, 1), ortgPorPosesion: redondear(x.porPosesion, 1), reboteOfensivoPorPartido: redondear(x.roPorPartido, 1) });
  const cambian = eq.filter((x) => x.puesto_porJugada !== x.puesto_porPosesion).length;
  const orden = eq.slice().sort((a, b) => a.puesto_porPosesion - b.puesto_porPosesion);
  const sube = eq.slice().sort((a, b) => (b.puesto_porJugada - b.puesto_porPosesion) - (a.puesto_porJugada - a.puesto_porPosesion))[0];
  return {
    id: 'CR-01', ok: true, formato: 'Carrusel 3:4', titulo: 'La tabla de ataque está mal ordenada',
    dato: cambian + ' de ' + eq.length + ' equipos (' + pct(cambian, eq.length) + '%) cambian de puesto en ataque si se mide por posesión en vez de por jugada.',
    muestra: { equipos: eq.length },
    datos: {
      cambian, equipos: eq.length, porcentaje: pct(cambian, eq.length),
      diferenciaMaxima: redondear(Math.max.apply(null, eq.map((x) => x.porPosesion - x.porJugada)), 1),
      top3: orden.slice(0, 3).map(fila), bottom3: orden.slice(-3).map(fila), elQueMasSube: fila(sube),
    },
    guion: ['Portada: el dato', 'Jugada no es posesión: cada rebote ofensivo suma una jugada y no una posesión',
      'Top 3 y bottom 3, por jugada contra por posesión', 'El que más sube y cuánto rebotea en ataque', '¿Con qué vara medís tu ataque? + demo'],
  };
}

/* ---------- CR-02 · el tirador rentable de bajo volumen --------------- */
function cr02(idx) {
  const { SCOUT } = motores();
  const ps = perfilesDeLiga(idx).filter((x) => esNum(x.p.t3i) && x.p.t3i >= SCOUT.VOL_MIN_TRIPLE && esNum(x.p.pptTriple));
  if (ps.length < 10) return sin('CR-02', 'Menos de 10 calificados con volumen de triple.');
  const medPpt = NUCLEO.mediana(ps.map((x) => x.p.pptTriple));
  const medPts = NUCLEO.mediana(perfilesDeLiga(idx).map((x) => x.p.pts).filter(esNum));
  const rentables = ps.filter((x) => x.s.amenazaExteriorPrimaria);
  const escondidos = rentables.filter((x) => esNum(x.p.pts) && x.p.pts < medPts);
  const fila = (x) => Object.assign(persona(x), { puntos: redondear(x.p.pts, 1), triplesIntentados: redondear(x.p.t3i, 1),
    puntosPorTriple: redondear(x.p.pptTriple, 2), puntosPorDoble: redondear(x.p.pptDoble, 2) });
  const casos = (escondidos.length >= 3 ? escondidos : rentables).slice().sort((a, b) => b.p.pptTriple - a.p.pptTriple).slice(0, 3);
  if (!casos.length) return sin('CR-02', 'Ningún calificado tiene el triple como su vía más cara.');
  return {
    id: 'CR-02', ok: true, formato: 'Carrusel 3:4', titulo: 'Anota poco y te cuesta caro',
    dato: escondidos.length + ' de los ' + rentables.length + ' tiradores rentables de la liga anotan menos que la mediana (' +
      redondear(medPts, 1) + ' puntos): el scouting por puntos no los ve.',
    muestra: { conVolumenDeTriple: ps.length },
    datos: { medianaPuntosPorTriple: redondear(medPpt, 2), medianaPuntos: redondear(medPts, 1), rentables: rentables.length,
      bajoLaMedianaDePuntos: escondidos.length, casos: casos.map(fila) },
    guion: ['Portada: «Mete ' + redondear(casos[0].p.pts, 0) + ' puntos y te cuesta ' + redondear(casos[0].p.pptTriple, 2) + ' por tiro»',
      'El scouting por puntos esconde al especialista', 'Los tres casos, sin nombre', 'Stay home, mano arriba o flotar: el corte de cada uno', '¿A quién le estás regalando el tiro? + scouting'],
  };
}

/* ---------- CR-03 · la falta que es negocio --------------------------- */
function cr03(idx) {
  const { SCOUT } = motores();
  /* El universo son TODOS los que van seguido a la línea. `faltaEvaluable`
     ya viene recortado a los de menos de 58 %: usarlo de base daría un
     «100 %» que no dice nada. */
  const ps = perfilesDeLiga(idx).filter((x) => esNum(x.p.t1) && esNum(x.p.t1i) && x.p.t1i >= SCOUT.VOL_MIN_LIBRE);
  if (ps.length < 10) return sin('CR-03', 'Menos de 10 calificados con volumen de línea.');
  const si = ps.filter((x) => x.s.faltaRentable);
  const fila = (x) => Object.assign(persona(x), { libres: redondear(x.p.t1 * 100, 1), libresIntentados: redondear(x.p.t1i, 1),
    puntosPorAccionCortada: redondear(2 * x.p.t1, 2), puntosPorDoble: redondear(x.p.pptDoble, 2) });
  const rentable = si.slice().sort((a, b) => a.p.t1 - b.p.t1)[0];
  const noRentable = ps.filter((x) => !x.s.faltaRentable).sort((a, b) => b.p.t1i - a.p.t1i)[0];
  return {
    id: 'CR-03', ok: true, formato: 'Carrusel 3:4', titulo: '¿Cortar con falta es negocio?',
    dato: 'Solo con ' + si.length + ' de los ' + ps.length + ' jugadores que van seguido a la línea (' + pct(si.length, ps.length) + '%) cortar con falta es negocio para la defensa.',
    muestra: { conVolumenDeLinea: ps.length },
    datos: { rentables: si.length, evaluados: ps.length, porcentaje: pct(si.length, ps.length), margen: SCOUT.MARGEN_FALTA,
      casoRentable: rentable ? fila(rentable) : null, casoNoRentable: noRentable ? fila(noRentable) : null },
    guion: ['Portada: la pregunta', 'A un 60 % en libres le regalás 1,20 por acción', 'La cuenta: 2 × %TL contra sus puntos por doble, con los dos casos',
      'Lo que el dato no sabe: bonus y faltas del defensor', '¿Tenés identificado a quién sí? + demo'],
  };
}

/* ---------- CR-04 · el mismo número, otra liga ------------------------ */
const VARAS = [
  { clave: 't1Pobre', metrica: 'T1%', valor: 0.60, texto: '60 % en libres' },
  { clave: 'pptTripleFrio', metrica: 'PPT3', valor: 0.88, texto: '0,88 puntos por triple' },
  { clave: 'astPPGenerador', metrica: 'AST-PP', valor: 1.40, texto: '1,40 asistencias por pérdida' },
];
function cr04(idx, o) {
  const { NIV } = motores();
  const cal = idx.liga.jugadoresCalificados || [];
  if (cal.length < 30) return sin('CR-04', 'Menos de 30 calificados: un percentil ahí no dice nada.');
  const filas = VARAS.map((v) => {
    const vals = cal.map((j) => j[v.metrica]).filter(esNum);
    const def = NIV.definicion(v.clave) || {};
    return { vara: v.texto, metrica: v.metrica, percentilEnEstaLiga: redondear(NUCLEO.percentil(vals, v.valor, false), 0),
      medianaDeEstaLiga: mostrar(v.metrica, NUCLEO.mediana(vals)), equivalentePorNivel: def.calibrado || null };
  });
  const p = filas[0].percentilEnEstaLiga;
  return {
    id: 'CR-04', ok: true, formato: 'Carrusel 3:4', titulo: '60 % en libres: flojo en una liga, promedio en otra',
    dato: 'En esta liga, 60 % en libres deja atrás al ' + p + '% de los jugadores. El mismo número en otra categoría cae en otro lugar.',
    muestra: { calificados: cal.length, nivel: (o && o.nivel) || null },
    datos: { nivel: (o && o.nivel) || null, varas: filas },
    guion: ['Portada: el título', 'Comparar a un juvenil con números de mayores lo etiqueta mal', 'La misma vara y su percentil por nivel',
      'Lo que sí es absoluto: 1,05 por triple vale en cualquier categoría', '¿Contra quién comparás a tus jugadores? + demo'],
  };
}

/* ---------- CR-05 · viene ganando y está peor -------------------------- */
function cr05(idx) {
  const { COMP } = motores();
  const casos = [];
  idx.lista().forEach((e) => {
    const c = COMP.ciclos(idx, e.clave, CICLO);
    if (!c || !c.actual || !c.previo || c.actual.pj < CICLO || c.previo.pj < CICLO) return;
    const cmp = COMP.comparar(idx, e.clave, c);
    const fila = (k) => { let f = null; cmp.bloques.forEach((b) => b.filas.forEach((x) => { if (x.k === k) f = x; })); return f; };
    const efg = fila('eFG%'), net = fila('NET RTNG');
    if (!efg || !esNum(efg.actual) || !esNum(efg.previo)) return;
    casos.push({ e, c, efg, net });
  });
  if (casos.length < MIN_EQUIPOS) return sin('CR-05', 'Menos de ' + MIN_EQUIPOS + ' equipos con dos ciclos completos de ' + CICLO + ' partidos.');
  const ganadores = casos.filter((x) => x.c.actual.ganados >= CICLO - 1);
  const peor = ganadores.filter((x) => x.efg.tendencia.estado === 'empeora');
  if (!peor.length) return sin('CR-05', 'Ningún equipo con ciclo ganador empeoró su eFG%: esta quincena la pieza no tiene caso.');
  const x = peor.slice().sort((a, b) => (b.c.actual.ganados - a.c.actual.ganados) || (a.efg.tendencia.delta - b.efg.tendencia.delta))[0];
  const rec = x.c.actual.ganados + '-' + x.c.actual.perdidos;
  return {
    id: 'CR-05', ok: true, formato: 'Carrusel 3:4', titulo: 'Viene ' + rec + ' y está peor',
    dato: peor.length + ' de los ' + ganadores.length + ' equipos que ganaron al menos ' + (CICLO - 1) + ' de sus últimos ' + CICLO + ' partidos tiraron peor que en el ciclo anterior.',
    muestra: { equipos: casos.length, ventana: CICLO },
    datos: { conCicloGanador: ganadores.length, queEmpeoraron: peor.length,
      caso: { equipo: x.e.nombre, record: rec, efgAnterior: redondear(x.efg.previo * 100, 1), efgActual: redondear(x.efg.actual * 100, 1),
        netActual: x.net ? redondear(x.net.actual, 1) : null, puestoNet: x.net ? x.net.nivel.puesto : null, de: x.net ? x.net.nivel.de : null } },
    guion: ['Portada: el título', 'Ganar no dice cómo', 'Ciclo anterior contra actual', 'La misma fila con su puesto en la liga: tendencia no es nivel', '¿Qué mirás después de ganar? + informe de ciclo'],
  };
}

/* ---------- CR-06 · fichar por perfil ---------------------------------- */
function cr06(idx) {
  const { JUG } = motores();
  const adn = JUG.jugadoresAdnLiga(idx);
  const cal = (idx.liga.jugadoresCalificados || []).filter((j) => adn.has(j) && esNum(j.PLAYS));
  if (cal.length < 30) return sin('CR-06', 'Menos de 30 calificados para buscar parecidos.');
  const modelo = cal.slice().sort((a, b) => b.PLAYS - a.PLAYS)[0];
  const am = adn.get(modelo);
  const ficha = (j, sim) => ({ jugador: nombreLimpio(j.NOMBRES), equipo: NUCLEO.limpiarNombre(j.EQUIPO),
    funcion: (adn.get(j).rolFuncional || {}).label || null, coincidencia: sim ? sim.porcentaje : null,
    puntos: redondear(j.PTS, 1), ts: mostrar('TS%', j['TS%']), tirosDeCampo: GC_volumen(j.TCC, j.TCI), triples: GC_volumen(j.T3C, j.T3I) });
  const candidatos = cal.filter((j) => j !== modelo && NUCLEO.claveEquipo(j.EQUIPO) !== NUCLEO.claveEquipo(modelo.EQUIPO))
    .map((j) => ({ j, sim: JUG.jugadoresSimilitud(am, adn.get(j)) })).filter((x) => x.sim.afin)
    .sort((a, b) => b.sim.total - a.sim.total);
  if (candidatos.length < 3) return sin('CR-06', 'El jugador de más uso de la liga no tiene tres perfiles afines en otros equipos.');
  const masPuntos = candidatos.filter((x) => esNum(x.j.PTS) && x.j.PTS < modelo.PTS).length;
  return {
    id: 'CR-06', ok: true, formato: 'Carrusel 3:4', titulo: 'Fichar por perfil, no por puntos',
    dato: 'El jugador de más uso de la liga tiene ' + candidatos.length + ' perfiles afines en otros equipos; ' + masPuntos + ' anotan menos que él.',
    muestra: { calificados: cal.length },
    datos: { modelo: ficha(modelo, null), afines: candidatos.length, candidatos: candidatos.slice(0, 3).map((x) => ficha(x.j, x.sim)) },
    guion: ['Portada: «Se te va tu jugador de más uso. ¿A quién buscás?»', 'El goleador de otro equipo no es el mismo jugador', 'El modelo contra tres candidatos, con su % de coincidencia',
      'El volumen de tiro al lado del acierto', '¿Qué mirás primero en un refuerzo? + demo'],
  };
}
const GC_volumen = (c, i) => (esNum(c) && esNum(i) ? redondear(c, 1) + '/' + redondear(i, 1) : null);

/* ---------- Los paquetes de play-by-play (motorstats-ingestion) -------- */
function leerPaquetes(carpeta) {
  let archivos = [];
  try { archivos = fs.readdirSync(carpeta).filter((a) => /\.json$/.test(a)); } catch (e) { return []; }
  return archivos.map((a) => { try { return JSON.parse(fs.readFileSync(path.join(carpeta, a), 'utf8')); } catch (e) { return null; } })
    .filter((p) => p && /analitica-pbp-web/.test(String(p.esquema || '')) && p.equipo);
}
function nombresDePaquetes(paqs) {
  const jug = new Set(), eq = new Set();
  (paqs || []).forEach((p) => {
    eq.add(String(p.equipo));
    Object.keys(p.jugadores || {}).forEach((id) => { if (p.jugadores[id] && p.jugadores[id].n) jug.add(String(p.jugadores[id].n)); });
  });
  return { jugadores: Array.from(jug), equipos: Array.from(eq) };
}

/* ---------- RL-01 · el quinteto que gana y «rinde negativo» ------------ */
function rl01(paqs) {
  const qs = [];
  (paqs || []).forEach((p) => (p.quintetos || []).forEach((q) => {
    if (q.ok === false || !esNum(q.min) || q.min < MIN_QUINTETO || !esNum(q.net) || !esNum(q.netPos) || !esNum(q.mm)) return;
    qs.push({ equipo: p.equipo, minutos: q.min, partidos: q.pj, enCancha: q.mm, netPorJugada: q.net, netPorPosesion: q.netPos });
  }));
  if (qs.length < 10) return sin('RL-01', 'Menos de 10 quintetos con ' + MIN_QUINTETO + '+ minutos juntos.');
  const signo = qs.filter((q) => (q.netPorJugada <= 0) !== (q.netPorPosesion <= 0));
  const contradice = qs.filter((q) => q.enCancha > 0 && q.netPorJugada < 0);
  if (!contradice.length && !signo.length) return sin('RL-01', 'Ningún quinteto cambia de lectura entre jugada y posesión: esta quincena la pieza no tiene caso.');
  const caso = (contradice.length ? contradice : signo).slice().sort((a, b) => (b.netPorPosesion - b.netPorJugada) - (a.netPorPosesion - a.netPorJugada))[0];
  return {
    id: 'RL-01', ok: true, formato: 'Reel 9:16', titulo: 'Gana en cancha y «rinde negativo» en la planilla',
    dato: contradice.length
      ? contradice.length + ' de ' + qs.length + ' quintetos de la liga ganan su tiempo en cancha y dan negativo si se los mide por jugada.'
      : signo.length + ' de ' + qs.length + ' quintetos de la liga pasan de positivo a negativo (o al revés) según se los mida por jugada o por posesión.',
    muestra: { quintetos: qs.length, equipos: paqs.length },
    datos: { quintetos: qs.length, ganaYDaNegativo: contradice.length, cambianDeSigno: signo.length, caso },
    guion: ['0-3 s: «+' + caso.enCancha + ' en el marcador, ' + caso.netPorJugada + ' en la planilla»', '3-20 s: cinco siluetas; se recalcula por posesión: ' + caso.netPorPosesion,
      '20-30 s: medir por jugada castiga al que gana el rebote. ¿Sabés cuánto rinde tu quinteto?'],
  };
}

/* ---------- RL-02 · quién decide los finales --------------------------- */
function rl02(paqs) {
  const eq = [];
  (paqs || []).forEach((p) => {
    const c = p.clutch || {};
    if (!c.equipo || !(c.equipo.partidos >= MIN_CLUTCH) || !(c.jugadores || []).length) return;
    const tiradores = (((p.tiros || {}).detalle || {}).jugadores || []).slice().sort((a, b) => b.i - a.i);
    if (!tiradores.length) return;
    const cierre = c.jugadores.slice().sort((a, b) => b.usos - a.usos)[0];
    eq.push({ equipo: p.equipo, partidosCerrados: c.equipo.partidos, record: c.equipo.ganados + '-' + c.equipo.perdidos,
      mismoJugador: String(cierre.id) === String(tiradores[0].id), porcionDeUsosEnElCierre: cierre.porc, efgEnElCierre: cierre.efg });
  });
  if (eq.length < MIN_EQUIPOS) return sin('RL-02', 'Menos de ' + MIN_EQUIPOS + ' equipos con ' + MIN_CLUTCH + '+ cierres ajustados.');
  const otro = eq.filter((x) => !x.mismoJugador);
  const caso = (otro.length ? otro : eq).slice().sort((a, b) => b.porcionDeUsosEnElCierre - a.porcionDeUsosEnElCierre)[0];
  return {
    id: 'RL-02', ok: true, formato: 'Reel 9:16', titulo: '¿Quién decide tus finales?',
    dato: 'En ' + otro.length + ' de ' + eq.length + ' equipos (' + pct(otro.length, eq.length) + '%), el que más pelota toma en el cierre no es el que más tira en la temporada.',
    muestra: { equipos: eq.length, definicion: 'últimos 5 minutos, diferencia de 5 o menos' },
    datos: { equipos: eq.length, cambiaElJugador: otro.length, porcentaje: pct(otro.length, eq.length), caso },
    guion: ['0-3 s: reloj en 4:59, «¿A quién le das la pelota?»', '3-20 s: el ranking de tiros de la temporada se reordena al del cierre',
      '20-30 s: ¿coincide con tu pizarra?'],
  };
}

/* ---------- RL-03 · lo que vale cada zona ------------------------------ */
const ZONAS = {
  Z1: 'Bajo el aro', Z2: 'Corta izquierda', Z3: 'Corta frontal', Z4: 'Corta derecha',
  Z5: 'Media de fondo izquierda', Z6: 'Media lateral izquierda', Z7: 'Media frontal', Z8: 'Media lateral derecha', Z9: 'Media de fondo derecha',
  Z10: 'Triple de esquina izquierda', Z11: 'Triple lateral izquierdo', Z12: 'Triple frontal', Z13: 'Triple lateral derecho', Z14: 'Triple de esquina derecha',
};
const FAMILIAS = { aro: 'Bajo el aro', corta: 'Corta distancia', mediaFrontal: 'Media frontal', mediaLateral: 'Media lateral',
  tripleFrontal: 'Triple frontal', tripleLateral: 'Triple lateral', tripleEsquina: 'Triple de esquina' };
function rl03(paqs) {
  const liga = ((paqs || [])[0] || {}).liga;
  if (!liga || !liga.familias || !liga.total) return sin('RL-03', 'Los paquetes no traen la vara de tiro de la liga.');
  const fam = Object.keys(liga.familias).map((k) => ({ zona: FAMILIAS[k] || k, tiros: liga.familias[k].i, acierto: liga.familias[k].pct,
    puntosPorTiro: redondear(liga.familias[k].ppt, 2), porcionDeLosTiros: pct(liga.familias[k].i, liga.total.i) }))
    .filter((f) => f.tiros >= 100).sort((a, b) => b.puntosPorTiro - a.puntosPorTiro);
  if (fam.length < 5) return sin('RL-03', 'Menos de cinco familias de tiro con 100+ intentos.');
  /* Las 14 zonas se rotulan por su número: el lado izquierdo o derecho
     depende de cómo numera la plataforma y no se verificó acá. */
  const zonas = (liga.zonas || []).filter((z) => ZONAS[z.zona] && z.i >= 100)
    .map((z) => ({ zona: z.zona, tiros: z.i, acierto: z.pct, puntosPorTiro: redondear(z.ppt, 2) })).sort((a, b) => b.puntosPorTiro - a.puntosPorTiro);
  const cara = fam[0], barata = fam[fam.length - 1];
  return {
    id: 'RL-03', ok: true, formato: 'Reel 9:16', titulo: 'Cada baldosa tiene un precio',
    dato: 'Sobre ' + liga.total.i + ' tiros de la liga: ' + cara.zona.toLowerCase() + ' paga ' + cara.puntosPorTiro + ' puntos por tiro y ' +
      barata.zona.toLowerCase() + ' ' + barata.puntosPorTiro + '. La liga le dedica a esta última el ' + barata.porcionDeLosTiros + '% de sus tiros.',
    muestra: { tiros: liga.total.i, puntosPorTiroDeLaLiga: redondear(liga.total.ppt, 2) },
    datos: { familias: fam, masCaras: fam.slice(0, 3), masBaratas: fam.slice(-3), zonas },
    guion: ['0-3 s: cancha vacía, «Cada baldosa tiene un precio»', '3-20 s: las zonas se iluminan por puntos por tiro, de la más cara a la más barata',
      '20-30 s: ¿dónde entrenan tus jugadores y dónde tiran?'],
  };
}

/* ---------- RL-04 · el pulso del partido -------------------------------- */
function rl04(paqs) {
  const eq = [];
  let mayor = null;
  (paqs || []).forEach((p) => {
    const cs = (p.cuartos || []).filter((c) => /^[1-4]$/.test(String(c.periodo)) && esNum(c.dif));
    if (cs.length < 4) return;
    const peor = cs.slice().sort((a, b) => a.dif - b.dif)[0];
    const m = p.momentum || {};
    eq.push({ peorCuarto: Number(peor.periodo), dif: peor.dif, corridas8EnContra: m.corridas8Contra, partidos: m.partidos });
    const top = (m.topContra || [])[0];
    if (top && esNum(top.pts) && (!mayor || top.pts > mayor.puntos)) mayor = { puntos: top.pts, cuartoDeInicio: top.periodo, cuartoDeFin: top.periodoFin };
  });
  if (eq.length < MIN_EQUIPOS) return sin('RL-04', 'Menos de ' + MIN_EQUIPOS + ' equipos con sus cuatro cuartos.');
  const porCuarto = [1, 2, 3, 4].map((c) => ({ cuarto: c, equipos: eq.filter((x) => x.peorCuarto === c).length }));
  const mas = porCuarto.slice().sort((a, b) => b.equipos - a.equipos)[0];
  const corridas = eq.filter((x) => esNum(x.corridas8EnContra) && x.partidos);
  const porPartido = corridas.length ? corridas.reduce((s, x) => s + x.corridas8EnContra / x.partidos, 0) / corridas.length : null;
  return {
    id: 'RL-04', ok: true, formato: 'Reel 9:16', titulo: 'Tu partido tiene pulso',
    dato: mas.equipos + ' de ' + eq.length + ' equipos (' + pct(mas.equipos, eq.length) + '%) tienen su peor parcial promedio en el ' + mas.cuarto + '.º cuarto.' +
      (porPartido !== null ? ' Un equipo sufre en promedio ' + redondear(porPartido, 1) + ' parciales de 8 o más en contra por partido.' : ''),
    muestra: { equipos: eq.length },
    datos: { peorCuartoPorEquipo: porCuarto, parcialesDe8EnContraPorPartido: redondear(porPartido, 1), mayorParcialEnContra: mayor },
    guion: ['0-3 s: línea plana, «Tu partido tiene pulso»', '3-20 s: se dibuja la diferencia; se marca el parcial y el cuarto',
      '20-30 s: ¿en qué cuarto se te van los partidos, y es físico o es rotación?'],
  };
}

const RECETAS = {
  'CR-01': { fuente: 'libro', f: cr01 }, 'CR-02': { fuente: 'libro', f: cr02 }, 'CR-03': { fuente: 'libro', f: cr03 },
  'CR-04': { fuente: 'libro', f: cr04 }, 'CR-05': { fuente: 'libro', f: cr05 }, 'CR-06': { fuente: 'libro', f: cr06 },
  'RL-01': { fuente: 'pbp', f: rl01 }, 'RL-02': { fuente: 'pbp', f: rl02 }, 'RL-03': { fuente: 'pbp', f: rl03 }, 'RL-04': { fuente: 'pbp', f: rl04 },
};

/**
 * Las piezas de Nivel 2. `idx` y `paqs` son opcionales: lo que falte deja
 * a sus recetas en `ok: false` con el motivo.
 */
function nivel2(idx, paqs, opciones) {
  const o = opciones || {};
  const ids = (o.piezas && o.piezas.length) ? o.piezas : Object.keys(RECETAS);
  if (idx && o.nivel && idx.liga && !idx.liga.nivel) idx.liga.nivel = o.nivel;
  const piezas = ids.map((id) => {
    const r = RECETAS[String(id).toUpperCase()];
    if (!r) return sin(String(id), 'No existe esa pieza. Las que hay: ' + Object.keys(RECETAS).join(', '));
    if (r.fuente === 'libro' && !idx) return sin(id, 'Hace falta el libro de la liga.');
    if (r.fuente === 'pbp' && !(paqs && paqs.length)) return sin(id, 'Esta liga no tiene paquetes de play-by-play: probá con --pbp <carpeta>.');
    try { return r.fuente === 'libro' ? r.f(idx, o) : r.f(paqs, o); }
    catch (e) { return sin(id, 'La receta falló: ' + e.message); }
  });
  return { meta: { torneo: o.torneo || '', zona: o.zona || '', tramo: idx ? idx.liga.torneo + '|' + idx.fase : null, paquetesPbp: (paqs || []).length }, piezas };
}

function resumenNivel2(n2) {
  const L = ['# Nivel 2 · ' + n2.meta.torneo + (n2.meta.zona ? ' · ' + n2.meta.zona : '') + (n2.anonimo ? ' · ANÓNIMO' : ''), ''];
  n2.piezas.forEach((p) => {
    if (!p.ok) { L.push('## ' + p.id + ' · sin datos', '', '- ' + p.avisos.join(' '), ''); return; }
    L.push('## ' + p.id + ' · ' + p.titulo, '', '_' + p.formato + '_', '', '**Dato:** ' + p.dato, '');
    p.guion.forEach((g, i) => L.push((i + 1) + '. ' + g));
    L.push('');
  });
  return L.join('\n');
}

function argumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) !== '--') continue;
    const k = a.slice(2);
    if (k === 'con-nombres' || k === 'anonimo' || k === 'nivel2') o[k] = true;
    else o[k] = argv[++i];
  }
  return o;
}

/** Qué liga, qué zona y si sale con nombres. Lanza con el motivo. */
function resolverPedido(args) {
  const a = args || {};
  const liga = LIGAS[String(a.liga || '').toLowerCase()];
  if (!liga) throw new Error('`--liga` tiene que ser una de: ' + Object.keys(LIGAS).join(', '));
  const zonas = Object.keys(liga.zonas);
  const zonaId = String(a.zona || (zonas.length === 1 ? zonas[0] : '')).toLowerCase();
  const zona = liga.zonas[zonaId];
  if (!zona) throw new Error('`--zona` tiene que ser una de: ' + zonas.join(', '));
  if (PATRON_FORMATIVAS.test(zona.categoria) || PATRON_FORMATIVAS.test(zona.label)) {
    throw new Error('Las categorías formativas no se publican.');
  }
  if (a['con-nombres'] && !liga.nombres) {
    throw new Error('`--con-nombres` solo vale para APdeB: ' + liga.torneo + ' sale anonimizada.');
  }
  return { ligaId: String(a.liga).toLowerCase(), liga, zonaId, zona, conNombres: liga.nombres && !a.anonimo };
}

async function leerIndice(zona) {
  require('./server/lib/env.js').cargar();
  const CAT = require('./server/lib/catalogo.js');
  const SHEETS = require('./server/lib/google-sheets.js');
  const DATOS = require('./js/sgadd-data.js');
  const c = await CAT.cargar();
  const r = CAT.resolver(c.catalogo, zona.club, zona.categoria);
  if (!r || !r.sheetId) throw new Error('El catálogo no tiene libro para ' + zona.club + '/' + zona.categoria);
  const libro = await SHEETS.obtenerLibro(r.sheetId);
  const hojas = {};
  Object.keys(libro.hojas).forEach((h) => { hojas[h] = DATOS.matrizAFilas(libro.hojas[h]); });
  const tramo = NUCLEO.tramoPorDefecto(NUCLEO.combinacionesTorneoFase(hojas));
  if (!tramo) throw new Error('El libro no tiene ningún tramo con datos.');
  return NUCLEO.construirIndice(hojas, { fase: tramo.fase, torneo: tramo.torneo });
}

async function principal(argv) {
  const args = argumentos(argv);
  const p = resolverPedido(args);
  const idx = await leerIndice(p.zona);
  if (args.nivel2 || args.piezas) return escribirNivel2(args, p, idx);
  let pq = paquete(idx, {
    torneo: p.liga.torneo, zona: p.zona.label, desde: args.desde, hasta: args.hasta,
    fechaN: args['fecha-n'] ? Number(args['fecha-n']) : null, feed: args.feed,
  });
  if (!pq.ok) { console.error('Sin contenido: ' + pq.avisos.join(' ')); process.exitCode = 1; return; }

  if (p.conNombres) pq = conEscudos(pq, p.liga.logos);
  else { pq = anonimizar(pq); verificarAnonimo(pq, nombresDelLibro(idx)); }

  const dir = path.join(args.salida || path.join(__dirname, 'contenido'), p.ligaId + '-' + p.zonaId, pq.ventana.hasta);
  fs.mkdirSync(dir, { recursive: true });
  const escribir = (n, v) => fs.writeFileSync(path.join(dir, n), typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  escribir('stories.json', Object.assign({ anonimo: !p.conNombres, avisos: pq.avisos }, pq.stories));
  escribir('feed.json', Object.assign({ anonimo: !p.conNombres }, pq.feed));
  escribir('resumen.md', resumen(pq));
  console.log(resumen(pq));
  console.log('\nEscrito en ' + path.relative(__dirname, dir));
}

/** Dónde deja motorstats-ingestion los paquetes de play-by-play. */
function carpetaPbp(args, zona) {
  if (args.pbp) return path.resolve(args.pbp);
  if (!zona.pbp) return null;
  const base = process.env.MOTORSTATS_INGESTION || path.join(__dirname, '..', 'motorstats-ingestion');
  return path.join(base, 'salida', zona.pbp, 'web');
}

function escribirNivel2(args, p, idx) {
  const carpeta = carpetaPbp(args, p.zona);
  const paqs = carpeta ? leerPaquetes(carpeta) : [];
  let n2 = nivel2(idx, paqs, {
    torneo: p.liga.torneo, zona: p.zona.label, nivel: p.liga.nivel,
    piezas: args.piezas ? String(args.piezas).split(',').map((x) => x.trim()).filter(Boolean) : null,
  });
  /* Anónimo SIEMPRE, salvo que APdeB lo pida con nombres a propósito. */
  const conNombres = p.liga.nombres && !!args['con-nombres'];
  if (!conNombres) {
    n2 = anonimizar(n2);
    const a = nombresDelLibro(idx), b = nombresDePaquetes(paqs);
    verificarAnonimo(n2, { jugadores: a.jugadores.concat(b.jugadores), equipos: a.equipos.concat(b.equipos) });
  }
  const dias = jornadas(idx);
  const dia0 = dias.length ? dias[dias.length - 1].hasta : 'sin-fecha';
  const dir = path.join(args.salida || path.join(__dirname, 'contenido'), p.ligaId + '-' + p.zonaId, dia0);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'nivel2.json'), JSON.stringify(n2, null, 2));
  fs.writeFileSync(path.join(dir, 'nivel2.md'), resumenNivel2(n2));
  console.log(resumenNivel2(n2));
  console.log('\nEscrito en ' + path.relative(__dirname, dir));
}

if (require.main === module) {
  principal(process.argv.slice(2)).catch((e) => { console.error('ERROR · ' + e.message); process.exitCode = 1; });
}

module.exports = {
  LIGAS, CATEGORIAS, PISO_MINUTOS, HUECO_JORNADA, LARGO_MAXIMO,
  jornadas, ventana, top3, paquete, anonimizar, verificarAnonimo, nombresDelLibro,
  resolverPedido, argumentos, resumen, mostrar, contextoDeCategoria,
  RECETAS, nivel2, resumenNivel2, leerPaquetes, nombresDePaquetes, carpetaPbp,
};
