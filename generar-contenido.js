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
    torneo: 'TORNEO APdeB 2026', nombres: true, logos: 'la-plata',
    zonas: {
      a: { club: 'reconquista', categoria: 'reconquista-primera', label: 'ZONA A' },
      b: { club: 'deportivo', categoria: 'deportivo-primera', label: 'ZONA B' },
      c: { club: 'apb-2026-masculino', categoria: 'apb-2026-c', label: 'ZONA C' },
    },
  },
  lnb: {
    torneo: 'LIGA NACIONAL 2026-27', nombres: false, logos: 'liga-nacional',
    zonas: { unica: { club: 'liga-nacional-2026-27', categoria: 'lnb-2026-27', label: '' } },
  },
  lab: {
    torneo: 'LIGA ARGENTINA 2026-27', nombres: false, logos: 'liga-argentina',
    zonas: {
      norte: { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-norte', label: 'CONFERENCIA NORTE' },
      sur: { club: 'liga-argentina-2026-27', categoria: 'lab-2026-27-sur', label: 'CONFERENCIA SUR' },
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
      if (k === 'jugador') out[k] = j(x[k]);
      else if (k === 'equipo') out[k] = e(x[k]);
      /* El texto del partido y la clave nombran a los dos equipos. */
      else if (k === 'partido' || k === 'equipoClave' || k === 'escudo' || k === 'foto') return;
      else out[k] = andar(x[k]);
    });
    return out;
  };
  const out = andar(pq);
  out.anonimo = true;
  /* El aviso de empate nombra al que quedó afuera. */
  out.avisos = (pq.avisos || []).map((a) => a.replace(/\(.+ quedó afuera\)\./, '(un jugador quedó afuera).'));
  (out.stories.placas || []).forEach((p) => { if (p.avisos) p.avisos = p.avisos.map((a) => a.replace(/\(.+ quedó afuera\)\./, '(un jugador quedó afuera).')); });
  return out;
}

/** Lanza si en la salida quedó un nombre del libro. */
function verificarAnonimo(pq, nombres) {
  const texto = JSON.stringify(pq).toUpperCase();
  const fugas = nombres.jugadores.concat(nombres.equipos)
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
function argumentos(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) !== '--') continue;
    const k = a.slice(2);
    if (k === 'con-nombres' || k === 'anonimo') o[k] = true;
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

if (require.main === module) {
  principal(process.argv.slice(2)).catch((e) => { console.error('ERROR · ' + e.message); process.exitCode = 1; });
}

module.exports = {
  LIGAS, CATEGORIAS, PISO_MINUTOS, HUECO_JORNADA, LARGO_MAXIMO,
  jornadas, ventana, top3, paquete, anonimizar, verificarAnonimo, nombresDelLibro,
  resolverPedido, argumentos, resumen, mostrar, contextoDeCategoria,
};
